import React, { useState, useMemo, useCallback, ReactNode, useEffect, useRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppContext, AppState } from "./store";
import { User, CartItem, Order, Address, WalletTransaction, Lead, UserRole, OrderStatus, Vendor, VendorApplication, VendorAppStatus, Reel, ReelComment, AdminCoupon, BannedUser, Notification, TeamMember, Review, SubCategory, Category, AdRequest, CustomerStory, CommunityPost, CommunityComment, VendorFollow, FeatureFlag, DynamicPage, AppAnnouncement, DealBooking, AdminPricing, DealSlotDuration, LiveSession, LiveChatMessage, Invoice, CoinTransaction, CoinTransactionType, HomeBanner, HomeDeal, PromoMedia } from "./types";
import { generateInvoice } from "./invoiceUtils";
import { subCategories, vendors as allVendors, BusRoute } from "./data";
import { Language, LOCATION_LANGUAGE_MAP } from "./i18n";
import {
  sendOrderStatusNotification,
  sendOrderPlacedNotification,
  sendDeliveryNotification,
  sendNewOrderNotificationForVendor,
  schedulePromotionNotifications,
  registerForPushNotifications,
  registerPushTokenWithServer,
  registerOneSignalToken,
  sendOrderUpdateToServer,
  fetchNotificationHistory,
  fetchUnreadCount,
  sendPromotionToServer,
  sendPromotionNotification,
  fetchPersonalizedPromotions,
} from "./notifications";
import { getApiUrl, clearAuthToken, getAuthToken } from "./query-client";

function generateId(): string {
  return Date.now().toString() + Math.random().toString(36).substr(2, 9);
}

const MALEGAON_CENTER = { lat: 20.5547, lng: 74.5247 };
const SERVICE_AREA_KM = 50;

function deterministicOffset(id: string, range: number): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash) + id.charCodeAt(i);
    hash |= 0;
  }
  return ((Math.abs(hash) % 10000) / 10000) * range - range / 2;
}

function haversineKmSimple(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// India bounding box — reject coordinates outside this range as clearly wrong/corrupted.
// All current territories (Malegaon, Mumbai/Govandi, etc.) are within India.
const INDIA_LAT_MIN = 5, INDIA_LAT_MAX = 38;
const INDIA_LNG_MIN = 65, INDIA_LNG_MAX = 100;

function mapDbVendor(v: any): Vendor {
  const rawLat = parseFloat(v.lat);
  const rawLng = parseFloat(v.lng);
  const hasValidCoords = rawLat !== 0 && rawLng !== 0 && !isNaN(rawLat) && !isNaN(rawLng);

  // Treat exact-center coords (unregistered default) as missing.
  const isExactDefault = hasValidCoords &&
    Math.abs(rawLat - MALEGAON_CENTER.lat) < 0.0001 &&
    Math.abs(rawLng - MALEGAON_CENTER.lng) < 0.0001;

  // Reject coordinates outside India's bounding box — they are corrupted/wrong geocodes.
  const isOutsideIndia = hasValidCoords && (
    rawLat < INDIA_LAT_MIN || rawLat > INDIA_LAT_MAX ||
    rawLng < INDIA_LNG_MIN || rawLng > INDIA_LNG_MAX
  );

  const useStored = hasValidCoords && !isExactDefault && !isOutsideIndia;
  const lat = useStored ? rawLat : MALEGAON_CENTER.lat + deterministicOffset(v.id + "lat", 0.04);
  const lng = useStored ? rawLng : MALEGAON_CENTER.lng + deterministicOffset(v.id + "lng", 0.05);
  return {
    id: v.id,
    name: v.name,
    description: v.description || "",
    image: v.image || "",
    hasImage: v.hasImage !== undefined ? !!v.hasImage : !!v.image,
    rating: parseFloat(v.rating) || 4.0,
    reviewCount: parseInt(v.reviewCount) || 0,
    deliveryTime: v.deliveryTime || "20-30 min",
    distance: v.distance || "0.5 km",
    isOpen: v.isOpen ?? true,
    categoryId: v.categoryId,
    subCategoryId: v.subCategoryId || "",
    commissionRate: parseFloat(v.commissionRate) || 10,
    lat,
    lng,
    address: v.address || "",
    pinCode: v.pinCode || v.pin_code || "",
    franchiseId: v.franchiseId || v.franchise_id || "",
    codEnabled: v.codEnabled ?? v.cod_enabled ?? false,
    phone: v.phone || "",
    hasPaymentQr: v.hasPaymentQr ?? v.has_payment_qr ?? false,
    hasPaymentQrImage: v.hasPaymentQrImage ?? false,
    paymentQrUrl: v.paymentQrUrl ?? v.payment_qr_url ?? undefined,
  };
}

const ORDER_STATUS_TITLES: Record<string, string> = {
  CONFIRMED: "Order Confirmed",
  PREPARING: "Order Being Prepared",
  READY: "Order Ready for Pickup",
  PICKED: "Order Picked Up",
  ON_THE_WAY: "Order On the Way",
  DELIVERED: "Order Delivered",
  CANCELLED: "Order Cancelled",
};

export function AppProvider({ children }: { children: ReactNode }) {
  const [initialized, setInitialized] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [cart, setCart] = useState<Array<CartItem>>([]);
  const [orders, setOrders] = useState<Array<Order>>([]);
  const [addresses, setAddresses] = useState<Array<Address>>([]);
  const [walletBalance, setWalletBalance] = useState(0);
  const [walletTransactions, setWalletTransactions] = useState<Array<WalletTransaction>>([]);
  const [coinBalance, setCoinBalance] = useState(0);
  const [coinTransactions, setCoinTransactions] = useState<Array<CoinTransaction>>([]);
  const [leads, setLeads] = useState<Array<Lead>>([]);
  const [isOnline, setIsOnline] = useState(false);
  const [adminPhone, setAdminPhoneState] = useState("");
  const [vendorApplications, setVendorApplications] = useState<Array<VendorApplication>>([]);
  const [liveVendors, setLiveVendors] = useState<Array<Vendor>>([]);
  const [customerPinCode, setCustomerPinCodeState] = useState<string>("");
  const [customSubCategories, setCustomSubCategories] = useState<Array<SubCategory>>([]);
  const [liveCategories, setLiveCategories] = useState<Array<Category>>([]);
  const [liveSubCategories, setLiveSubCategories] = useState<Array<SubCategory>>([]);
  const [liveBusRoutes, setLiveBusRoutes] = useState<Array<BusRoute>>([]);
  const [reels, setReels] = useState<Array<Reel>>([]);
  const [reelComments, setReelComments] = useState<Array<ReelComment>>([]);
  const [adminCoupons, setAdminCoupons] = useState<Array<AdminCoupon>>([]);
  const [bannedUsers, setBannedUsers] = useState<Array<BannedUser>>([]);
  const [notifications, setNotifications] = useState<Array<Notification>>([]);
  const [readNotifIds, setReadNotifIds] = useState<string[]>([]);
  const readNotifIdsHydrated = useRef(false);
  const [featureFlags, setFeatureFlags] = useState<Array<FeatureFlag>>([
    { id: "ff1", name: "Reels", description: "Short video content for vendors and customers", enabled: true, roles: ["ALL"], category: "social", icon: "videocam", updatedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString() },
    { id: "ff2", name: "Community Feed", description: "Social feed with posts, offers, and Q&A from vendors and customers", enabled: true, roles: ["ALL"], category: "social", icon: "people", updatedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString() },
    { id: "ff3", name: "AI Assistant", description: "AI-powered shopping assistant for product recommendations", enabled: true, roles: ["CUSTOMER", "VENDOR", "SUPER_ADMIN"], category: "ai", icon: "sparkles", updatedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString() },
    { id: "ff4", name: "Wallet & Cashback", description: "Digital wallet with cashback rewards on orders", enabled: true, roles: ["CUSTOMER"], category: "commerce", icon: "wallet", updatedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString() },
    { id: "ff5", name: "Dark Mode", description: "Dark theme support across the application", enabled: false, roles: ["ALL"], category: "visual", icon: "moon", updatedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString() },
    { id: "ff6", name: "Multi-Language", description: "Support for Hindi, Marathi, and English languages", enabled: true, roles: ["ALL"], category: "core", icon: "language", updatedAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString() },
    { id: "ff7", name: "Express Delivery", description: "30-minute express delivery option for nearby orders", enabled: true, roles: ["CUSTOMER", "DELIVERY"], category: "commerce", icon: "flash", updatedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString() },
    { id: "ff8", name: "Vendor Analytics", description: "Advanced analytics dashboard for vendor performance tracking", enabled: true, roles: ["VENDOR", "FRANCHISE", "SUPER_ADMIN"], category: "core", icon: "analytics", updatedAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString() },
    { id: "ff9", name: "Customer Stories", description: "User-generated stories and testimonials", enabled: true, roles: ["CUSTOMER"], category: "social", icon: "book", updatedAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString() },
    { id: "ff10", name: "AI Price Optimization", description: "AI-driven dynamic pricing suggestions for vendors", enabled: false, roles: ["VENDOR", "SUPER_ADMIN"], category: "ai", icon: "trending-up", updatedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString() },
    { id: "ff11", name: "B2B Marketplace", description: "Wholesale marketplace for business-to-business orders", enabled: true, roles: ["VENDOR", "FRANCHISE", "SUPER_ADMIN"], category: "commerce", icon: "business", updatedAt: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000).toISOString() },
    { id: "ff12", name: "Animated Banners", description: "Animated promotional banners on home screen", enabled: false, roles: ["ALL"], category: "visual", icon: "images", updatedAt: new Date(Date.now() - 9 * 24 * 60 * 60 * 1000).toISOString() },
  ]);
  const [dynamicPages, setDynamicPages] = useState<Array<DynamicPage>>([]);
  const [appAnnouncements, setAppAnnouncements] = useState<Array<AppAnnouncement>>([]);
  const DEFAULT_ADMIN_PRICING: AdminPricing = {
    dealSlotRates: { "1day": 299, "3days": 699, "7days": 1499 },
    vendorOnboardingFee: 999,
    defaultCommissionRate: 10,
    deliveryChargePerKm: 5,
    platformServiceFee: 2,
    adSlotRates: { banner: 499, featured: 999, spotlight: 1999 },
    vendorSubscriptionRates: { MONTHLY: 999, QUARTERLY: 2499, HALF_YEARLY: 4499, ANNUAL: 7999 },
    updatedAt: new Date().toISOString(),
  };

  const [dealBookings, setDealBookings] = useState<Array<DealBooking>>([]);
  const [adminPricing, setAdminPricing] = useState<AdminPricing>(DEFAULT_ADMIN_PRICING);
  const [liveSessions, setLiveSessions] = useState<Array<LiveSession>>([]);
  const [invoices, setInvoices] = useState<Array<Invoice>>([]);
  const [vendorProfileImages, setVendorProfileImages] = useState<Record<string, string>>({});
  const [vendorCodSettings, setVendorCodSettings] = useState<Record<string, boolean>>({});

  const [homeBanners, setHomeBanners] = useState<HomeBanner[]>([]);

  const [homeDeals, setHomeDeals] = useState<HomeDeal[]>([]);
  const [promoMedia, setPromoMedia] = useState<PromoMedia[]>([]);
  const [showGuestLoginPrompt, setShowGuestLoginPrompt] = useState(false);
  const [lastOrderStatusChange, setLastOrderStatusChange] = useState(0);

  const loadHomeContent = useCallback(async () => {
    try {
      const apiUrl = getApiUrl();
      const res = await fetch(new URL("/api/home-content", apiUrl).toString());
      if (res.ok) {
        const data = await res.json();
        const mapBanner = (b: any): HomeBanner => ({ id: b.id, title: b.title || "", subtitle: b.subtitle || "", color: b.color || "#FF6B00", ctaText: b.ctaText || b.cta_text || "", isActive: b.isActive ?? b.is_active ?? true, order: b.order ?? 0, image: b.image, createdAt: b.createdAt || b.created_at || new Date().toISOString() });
        const mapDeal = (d: any): HomeDeal => ({ id: d.id, name: d.name || "", image: d.image || "", price: d.price || 0, originalPrice: d.originalPrice ?? d.original_price ?? 0, endsInHours: d.endsInHours ?? d.ends_in_hours ?? 24, sold: d.sold || 0, total: d.total || 100, productId: d.productId || d.product_id, isActive: d.isActive ?? d.is_active ?? true, createdAt: d.createdAt || d.created_at || new Date().toISOString() });
        const mapMedia = (m: any): PromoMedia => ({ id: m.id, type: m.type || "image", uri: m.uri || "", isActive: m.isActive ?? m.is_active ?? true, createdAt: m.createdAt || m.created_at || new Date().toISOString() });
        if (Array.isArray(data.banners)) setHomeBanners(data.banners.map(mapBanner));
        if (Array.isArray(data.deals)) setHomeDeals(data.deals.map(mapDeal));
        if (Array.isArray(data.promoMedia)) setPromoMedia(data.promoMedia.map(mapMedia));
      }
    } catch {}
  }, []);

  const loadCoupons = useCallback(async () => {
    try {
      const apiUrl = getApiUrl();
      const res = await fetch(new URL("/api/coupons", apiUrl).toString());
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : data.coupons;
        if (Array.isArray(list)) {
          setAdminCoupons(list.map((c: any): AdminCoupon => ({
            id: c.id,
            code: c.code,
            discountType: (c.discountType ?? c.discount_type) as "PERCENTAGE" | "FLAT",
            value: c.value ?? 0,
            minOrder: c.minOrder ?? c.min_order ?? 0,
            maxDiscount: c.maxDiscount ?? c.max_discount ?? undefined,
            usageLimit: c.usageLimit ?? c.usage_limit ?? 100,
            usedCount: c.usedCount ?? c.used_count ?? 0,
            isActive: c.isActive ?? c.is_active ?? true,
            expiresAt: c.expiresAt ?? c.expires_at ?? "",
            createdAt: c.createdAt ?? c.created_at ?? new Date().toISOString(),
          })));
        }
      }
    } catch {}
  }, []);

  const addPromoMedia = useCallback(async (item: Omit<PromoMedia, "id" | "createdAt">) => {
    try {
      const token = await getAuthToken();
      const apiUrl = getApiUrl();
      const res = await fetch(new URL("/api/promo-media", apiUrl).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(item),
      });
      if (res.ok) {
        const data = await res.json();
        const m = data.media;
        setPromoMedia((prev) => [{ id: m.id, type: m.type, uri: m.uri, isActive: m.is_active ?? m.isActive ?? true, createdAt: m.created_at || m.createdAt || new Date().toISOString() }, ...prev]);
      }
    } catch {}
  }, []);

  const removePromoMedia = useCallback(async (id: string): Promise<boolean> => {
    setPromoMedia((prev) => prev.filter((m) => m.id !== id));
    try {
      const token = await getAuthToken();
      const apiUrl = getApiUrl();
      const res = await fetch(new URL(`/api/promo-media/${id}`, apiUrl).toString(), {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        console.warn("removePromoMedia failed:", res.status, body);
        await loadHomeContent();
        return false;
      }
      return true;
    } catch (e) {
      console.warn("removePromoMedia error:", e);
      await loadHomeContent();
      return false;
    }
  }, []);

  const togglePromoMedia = useCallback(async (id: string, isActive: boolean) => {
    setPromoMedia((prev) => prev.map((m) => m.id === id ? { ...m, isActive } : m));
    try {
      const token = await getAuthToken();
      const apiUrl = getApiUrl();
      const res = await fetch(new URL(`/api/promo-media/${id}/toggle`, apiUrl).toString(), {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ isActive }),
      });
      if (!res.ok) {
        setPromoMedia((prev) => prev.map((m) => m.id === id ? { ...m, isActive: !isActive } : m));
      }
    } catch {
      setPromoMedia((prev) => prev.map((m) => m.id === id ? { ...m, isActive: !isActive } : m));
    }
  }, []);

  const addHomeBanner = useCallback(async (banner: Omit<HomeBanner, "id" | "createdAt">) => {
    try {
      const token = await getAuthToken();
      const apiUrl = getApiUrl();
      const res = await fetch(new URL("/api/home-banners", apiUrl).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(banner),
      });
      if (res.ok) {
        const data = await res.json();
        const b = data.banner;
        setHomeBanners((prev) => [...prev, { id: b.id, title: b.title || "", subtitle: b.subtitle || "", color: b.color || "#FF6B00", ctaText: b.cta_text || b.ctaText || "", isActive: b.is_active ?? b.isActive ?? true, order: b.order ?? 0, image: b.image, createdAt: b.created_at || b.createdAt || new Date().toISOString() }]);
      }
    } catch {}
  }, []);

  const updateHomeBanner = useCallback(async (id: string, updates: Partial<HomeBanner>) => {
    setHomeBanners((prev) => prev.map((b) => b.id === id ? { ...b, ...updates } : b));
    try {
      const token = await getAuthToken();
      const apiUrl = getApiUrl();
      await fetch(new URL(`/api/home-banners/${id}`, apiUrl).toString(), {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(updates),
      });
    } catch {}
  }, []);

  const deleteHomeBanner = useCallback(async (id: string) => {
    setHomeBanners((prev) => prev.filter((b) => b.id !== id));
    try {
      const token = await getAuthToken();
      const apiUrl = getApiUrl();
      await fetch(new URL(`/api/home-banners/${id}`, apiUrl).toString(), {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {}
  }, []);

  const addHomeDeal = useCallback(async (deal: Omit<HomeDeal, "id" | "createdAt">) => {
    try {
      const token = await getAuthToken();
      const apiUrl = getApiUrl();
      const res = await fetch(new URL("/api/home-deals", apiUrl).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(deal),
      });
      if (res.ok) {
        const data = await res.json();
        const d = data.deal;
        setHomeDeals((prev) => [{ id: d.id, name: d.name || "", image: d.image || "", price: d.price || 0, originalPrice: d.original_price ?? d.originalPrice ?? 0, endsInHours: d.ends_in_hours ?? d.endsInHours ?? 24, sold: d.sold || 0, total: d.total || 100, productId: d.product_id || d.productId, isActive: d.is_active ?? d.isActive ?? true, createdAt: d.created_at || d.createdAt || new Date().toISOString() }, ...prev]);
      }
    } catch {}
  }, []);

  const updateHomeDeal = useCallback(async (id: string, updates: Partial<HomeDeal>) => {
    setHomeDeals((prev) => prev.map((d) => d.id === id ? { ...d, ...updates } : d));
    try {
      const token = await getAuthToken();
      const apiUrl = getApiUrl();
      await fetch(new URL(`/api/home-deals/${id}`, apiUrl).toString(), {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(updates),
      });
    } catch {}
  }, []);

  const deleteHomeDeal = useCallback(async (id: string) => {
    setHomeDeals((prev) => prev.filter((d) => d.id !== id));
    try {
      const token = await getAuthToken();
      const apiUrl = getApiUrl();
      await fetch(new URL(`/api/home-deals/${id}`, apiUrl).toString(), {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {}
  }, []);

  const userDataHydrated = useRef(false);
  const leadsHydrated = useRef(false);

  const addInvoice = useCallback((invoice: Invoice) => {
    setInvoices((prev) => [invoice, ...prev]);
  }, []);

  const getInvoiceByRef = useCallback((referenceId: string) => {
    return invoices.find((inv) => inv.referenceId === referenceId);
  }, [invoices]);

  const setCustomerPinCode = useCallback((pin: string) => {
    setCustomerPinCodeState(pin);
    AsyncStorage.setItem("gobharat_pin_code", pin).catch(() => {});
  }, []);

  const reloadVendors = useCallback((pinCode?: string, franchiseId?: string) => {
    const base = getApiUrl();
    const url = new URL("/api/vendors", base);
    if (pinCode && pinCode.trim()) url.searchParams.set("pinCode", pinCode.trim());
    else if (franchiseId && franchiseId.trim()) url.searchParams.set("franchiseId", franchiseId.trim());
    fetch(url.toString())
      .then((r) => r.json())
      .then((data) => {
        const dbVendors: Vendor[] = (data.vendors || []).map((v: any) => mapDbVendor(v));
        // Never wipe out vendors with an empty result — keep previous list on network errors.
        // Merge: preserve existing images since the list API no longer sends base64 images.
        if (dbVendors.length > 0) {
          setLiveVendors((prev) => {
            const prevImageMap = new Map(prev.map((v) => [v.id, v.image]));
            const merged = dbVendors.map((v) => ({
              ...v,
              // Only fall back to cached image if the server returned no image at all (undefined/null).
              // If server explicitly returned "" it means the image was removed — respect that.
              image: v.image != null ? v.image : (prevImageMap.get(v.id) || ""),
            }));
            AsyncStorage.setItem("gobharat_live_vendors", JSON.stringify(merged));
            return merged;
          });
        }
      })
      .catch(() => {});
  }, []);

  const updateVendorProfileImage = useCallback((imageUri: string, imageBase64?: string) => {
    if (!user?.phone) return;
    setVendorProfileImages((prev) => {
      const updated = { ...prev, [user.phone]: imageUri };
      AsyncStorage.setItem("gobharat_vendor_profile_images", JSON.stringify(updated));
      return updated;
    });
    if (imageBase64) {
      const dataUrl = `data:image/jpeg;base64,${imageBase64}`;
      const apiUrl = getApiUrl();
      const vendorApp = vendorApplications.find(
        (a) => a.phone.replace(/\D/g, "").slice(-10) === user.phone && (a.status === "APPROVED" || a.status === "LIVE")
      );
      if (vendorApp?.id) {
        const vendorId = vendorApp.id;
        AsyncStorage.getItem("gobharat_auth_token").then((token) => {
          fetch(new URL(`/api/vendors/${vendorId}/image`, apiUrl).toString(), {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({ image: dataUrl }),
          })
            .then((r) => r.json())
            .then((result) => {
              if (result.success) {
                setLiveVendors((lv) =>
                  lv.map((v) => v.id === vendorId ? { ...v, image: dataUrl, hasImage: true } : v)
                );
              }
            })
            .catch(() => {});
        });
      }
    }
  }, [user, vendorApplications]);

  const updateVendorPaymentQr = useCallback(async (imageBase64: string): Promise<boolean> => {
    if (!user?.phone) return false;
    const vendorApp = vendorApplications.find(
      (a) => a.phone.replace(/\D/g, "").slice(-10) === user.phone && (a.status === "APPROVED" || a.status === "LIVE")
    );
    if (!vendorApp?.id) return false;
    const vendorId = vendorApp.id;
    const dataUrl = imageBase64.startsWith("data:") ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`;
    try {
      const apiUrl = getApiUrl();
      const token = await AsyncStorage.getItem("gobharat_auth_token");
      const res = await fetch(new URL(`/api/vendors/${vendorId}/payment-qr`, apiUrl).toString(), {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ image: dataUrl }),
      });
      const result = await res.json();
      if (result.success) {
        setLiveVendors((lv) => lv.map((v) => v.id === vendorId ? { ...v, paymentQrUrl: dataUrl, hasPaymentQrImage: true, hasPaymentQr: true } : v));
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, [user, vendorApplications]);

  const removeVendorPaymentQr = useCallback(async (): Promise<boolean> => {
    if (!user?.phone) return false;
    const vendorApp = vendorApplications.find(
      (a) => a.phone.replace(/\D/g, "").slice(-10) === user.phone && (a.status === "APPROVED" || a.status === "LIVE")
    );
    if (!vendorApp?.id) return false;
    const vendorId = vendorApp.id;
    try {
      const apiUrl = getApiUrl();
      const token = await AsyncStorage.getItem("gobharat_auth_token");
      const res = await fetch(new URL(`/api/vendors/${vendorId}/payment-qr`, apiUrl).toString(), {
        method: "DELETE",
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      const result = await res.json();
      if (result.success) {
        setLiveVendors((lv) => lv.map((v) => v.id === vendorId ? { ...v, paymentQrUrl: undefined, hasPaymentQrImage: false, hasPaymentQr: !!v.upiId } : v));
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, [user, vendorApplications]);

  const updateVendorUpiId = useCallback(async (upiId: string): Promise<boolean> => {
    if (!user?.phone) return false;
    const vendorApp = vendorApplications.find(
      (a) => a.phone.replace(/\D/g, "").slice(-10) === user.phone && (a.status === "APPROVED" || a.status === "LIVE")
    );
    if (!vendorApp?.id) return false;
    const vendorId = vendorApp.id;
    try {
      const apiUrl = getApiUrl();
      const token = await AsyncStorage.getItem("gobharat_auth_token");
      const res = await fetch(new URL(`/api/vendors/${vendorId}/upi-id`, apiUrl).toString(), {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ upiId }),
      });
      const result = await res.json();
      if (result.success) {
        setLiveVendors((lv) => lv.map((v) => v.id === vendorId ? { ...v, upiId: upiId || undefined, hasPaymentQr: !!upiId || !!v.hasPaymentQr } : v));
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, [user, vendorApplications]);

  const removeVendorProfileImage = useCallback(() => {
    if (!user?.phone) return;
    setVendorProfileImages((prev) => {
      const updated = { ...prev };
      delete updated[user.phone];
      AsyncStorage.setItem("gobharat_vendor_profile_images", JSON.stringify(updated));
      return updated;
    });
  }, [user]);

  const updateVendorCod = useCallback((vendorId: string, enabled: boolean) => {
    setVendorCodSettings((prev) => {
      const updated = { ...prev, [vendorId]: enabled };
      AsyncStorage.setItem("gobharat_vendor_cod_settings", JSON.stringify(updated));
      return updated;
    });
  }, []);

  const toggleVendorOpen = useCallback(async (vendorId: string, isOpen: boolean) => {
    setLiveVendors((prev) => prev.map((v) => v.id === vendorId ? { ...v, isOpen } : v));
    try {
      const token = await AsyncStorage.getItem("gobharat_token");
      await fetch(new URL("/api/vendor/status", getApiUrl()).toString(), {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ isOpen }),
        cache: "no-store",
      });
    } catch {}
  }, []);

  const [reviews, setReviews] = useState<Array<Review>>([]);
  const [teamMembers, setTeamMembers] = useState<Array<TeamMember>>([]);

  const loadTeamMembers = useCallback(async () => {
    try {
      const apiUrl = getApiUrl();
      const teamMembersUrl = new URL("/api/team-members", apiUrl);
      teamMembersUrl.searchParams.set("_t", Date.now().toString());
      const savedToken = await AsyncStorage.getItem("gobharat_auth_token");
      const tmHeaders: Record<string, string> = { "Cache-Control": "no-cache" };
      if (savedToken) tmHeaders["Authorization"] = `Bearer ${savedToken}`;
      const r = await fetch(teamMembersUrl.toString(), { cache: "no-store", headers: tmHeaders });
      if (!r.ok) return;
      const data = await r.json();
      if (data?.teamMembers && Array.isArray(data.teamMembers)) {
        const mapped: TeamMember[] = data.teamMembers.map((m: any) => ({
          id: m.id,
          name: m.name,
          phone: m.phone,
          email: m.email || "",
          role: m.role,
          city: m.city || "",
          status: m.status || "ACTIVE",
          createdBy: m.createdBy || "",
          createdByRole: m.createdByRole || "SUPER_ADMIN",
          createdAt: m.createdAt ? new Date(m.createdAt).toISOString() : new Date().toISOString(),
          territory: m.territory,
          bankName: m.bankName,
          accountNumber: m.accountNumber,
          ifscCode: m.ifscCode,
          accountHolderName: m.accountHolderName,
          aadhaarNumber: m.aadhaarNumber,
          panNumber: m.panNumber,
          dateOfBirth: m.dateOfBirth,
          gender: m.gender,
          fullAddress: m.fullAddress,
          emergencyContactName: m.emergencyContactName,
          emergencyContactPhone: m.emergencyContactPhone,
          vehicleNumber: m.vehicleNumber,
          drivingLicenseNumber: m.drivingLicenseNumber,
          pinCode: m.pinCode || m.pin_code || "",
          franchiseId: m.franchiseId || m.franchise_id || "",
        }));
        setTeamMembers(mapped);
      }
    } catch {}
  }, []);

  const [adRequests, setAdRequests] = useState<Array<AdRequest>>([]);

  const [customerStories, setCustomerStories] = useState<Array<CustomerStory>>([]);

  const [communityPosts, setCommunityPosts] = useState<Array<CommunityPost>>([]);
  const [communityComments, setCommunityComments] = useState<Array<CommunityComment>>([]);
  const [vendorFollows, setVendorFollows] = useState<Array<VendorFollow>>([]);

  const [language, setLanguageState] = useState<Language>("en");
  const [autoDetectLanguage, setAutoDetectLangState] = useState(true);
  const [termsAcceptedRoles, setTermsAcceptedRoles] = useState<string[]>([]);

  useEffect(() => {
    const apiUrl = getApiUrl();
    fetch(new URL("/api/admin/config", apiUrl).toString())
      .then(r => r.json())
      .then(data => {
        if (data?.adminPhone) setAdminPhoneState(data.adminPhone);
      })
      .catch(() => {});
    fetch(new URL("/api/reels", apiUrl).toString())
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => {
        if (data?.reels && Array.isArray(data.reels)) setReels(data.reels);
      })
      .catch(() => {});
    loadTeamMembers();
    AsyncStorage.getItem("gobharat_terms_accepted").then((data) => {
      if (data) {
        try { setTermsAcceptedRoles(JSON.parse(data)); } catch {}
      }
    });
    AsyncStorage.getItem("gobharat_user").then((data) => {
      if (data) {
        try {
          setUser(JSON.parse(data));
        } catch {}
      }
      setInitialized(true);
    });
    AsyncStorage.getItem("gobharat_language").then((data) => {
      if (data) setLanguageState(data as Language);
    });
    AsyncStorage.getItem("gobharat_auto_lang").then((data) => {
      if (data !== null) setAutoDetectLangState(data === "true");
    });
    AsyncStorage.getItem("gobharat_pin_code").then((data) => {
      if (data) setCustomerPinCodeState(data);
    });
    // Clear legacy AsyncStorage vendor apps (source of fake/stale data across devices)
    AsyncStorage.removeItem("gobharat_vendor_apps");
    AsyncStorage.getItem("gobharat_custom_subcats").then((data) => {
      if (data) {
        try { setCustomSubCategories(JSON.parse(data)); } catch {}
      }
    });
    // Versioned vendor cache — bump this string whenever DB data is reset/reseeded
    // so all clients (Play Store app, Expo Go, web) auto-clear stale cached vendors.
    const VENDOR_CACHE_VERSION = "v8";
    const vendorFetchWithRetry = (retries = 10, delay = 2000) => {
      // Abort only if the server doesn't respond AT ALL within 30 s.
      // The response body is now image-free (~80 KB) so download is always fast.
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);
      const vendorUrl = new URL("/api/vendors", apiUrl);
      // No cache-busting — server sends Cache-Control: max-age=120, stale-while-revalidate=300
      // so the WebView returns a cached response instantly and refreshes in background.
      fetch(vendorUrl.toString(), { signal: controller.signal })
        .then((r) => {
          // Cancel the abort timeout as soon as we get headers — server is alive.
          clearTimeout(timeout);
          return r.json();
        })
        .then((data) => {
          const dbVendors: Vendor[] = (data.vendors || []).map((v: any) => mapDbVendor(v));
          if (dbVendors.length > 0) {
            // Images are no longer stored in list state — they are served as binary
            // via /api/vendors/:id/image and cached natively by expo-image.
            // hasImage flag (from server list response) tells the card whether to
            // render an <Image> URL or a colored placeholder.
            setLiveVendors(dbVendors);
            AsyncStorage.setItem("gobharat_live_vendors", JSON.stringify(dbVendors));
            AsyncStorage.setItem("gobharat_vendors_version", VENDOR_CACHE_VERSION);
          } else if (retries > 0) {
            // Server returned empty list — likely still warming up after restart.
            setTimeout(() => vendorFetchWithRetry(retries - 1, Math.min(delay * 1.5, 15000)), delay);
          }
        })
        .catch(() => {
          clearTimeout(timeout);
          if (retries > 0) {
            setTimeout(() => vendorFetchWithRetry(retries - 1, Math.min(delay * 1.5, 15000)), delay);
          }
        });
    };
    // Pre-populate from cache only if the version matches — otherwise discard stale data
    // so vendors from a previous DB state never appear on the map.
    AsyncStorage.multiGet(["gobharat_vendors_version", "gobharat_live_vendors"]).then(([verEntry, dataEntry]) => {
      const storedVersion = verEntry[1];
      const data = dataEntry[1];
      if (storedVersion === VENDOR_CACHE_VERSION && data) {
        try { setLiveVendors(JSON.parse(data)); } catch {}
      } else {
        // Stale / wrong-version cache — wipe it so the API response is the first data shown
        AsyncStorage.multiRemove(["gobharat_live_vendors", "gobharat_vendors_version"]);
      }
    });
    vendorFetchWithRetry();
    // Load custom subcategories from DB (DB is source of truth)
    fetch(new URL("/api/subcategories/custom", apiUrl).toString())
      .then((r) => r.json())
      .then((data) => {
        const dbCustomSubs: SubCategory[] = (data.customSubCategories || []).map((sc: any) => ({
          id: sc.id,
          categoryId: sc.categoryId || sc.category_id,
          name: sc.name,
          icon: sc.icon || "grid-outline",
          image: sc.image || "",
        }));
        if (dbCustomSubs.length > 0) {
          setCustomSubCategories(dbCustomSubs);
          AsyncStorage.setItem("gobharat_custom_subcats", JSON.stringify(dbCustomSubs));
        } else {
          // DB has no custom subcategories — sync from AsyncStorage if available
          AsyncStorage.getItem("gobharat_custom_subcats").then((cached) => {
            if (!cached) return;
            let localSubs: SubCategory[] = [];
            try { localSubs = JSON.parse(cached); } catch {}
            if (localSubs.length === 0) return;
            AsyncStorage.getItem("gobharat_auth_token").then((token) => {
              if (!token) return;
              localSubs.forEach((sc) => {
                fetch(new URL("/api/subcategories/custom", apiUrl).toString(), {
                  method: "POST",
                  headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                  body: JSON.stringify(sc),
                }).catch(() => {});
              });
            });
          });
        }
      })
      .catch(() => {});
    // Load all categories from DB
    fetch(new URL("/api/categories", apiUrl).toString())
      .then((r) => r.json())
      .then((data) => {
        const cats: Category[] = (data.categories || []).map((c: any) => ({
          id: c.id,
          name: c.name,
          icon: c.icon || "grid-outline",
          color: c.color || "#6B7280",
        }));
        if (cats.length > 0) setLiveCategories(cats);
      })
      .catch(() => {});
    // Load all sub-categories from DB, then merge with static so any entries
    // missing from the server (e.g. newly added but not yet seeded in prod) still appear.
    fetch(new URL("/api/subcategories", apiUrl).toString())
      .then((r) => r.json())
      .then((data) => {
        const liveSubs: SubCategory[] = (data.subCategories || []).map((sc: any) => ({
          id: sc.id,
          categoryId: sc.categoryId || sc.category_id,
          name: sc.name,
          icon: sc.icon || "grid-outline",
          image: sc.image || "",
        }));
        // Fill gaps: add any static subcategory whose id is absent from the live list
        const liveIds = new Set(liveSubs.map((s) => s.id));
        const merged = [
          ...liveSubs,
          ...subCategories.filter((s) => !liveIds.has(s.id)),
        ];
        if (merged.length > 0) setLiveSubCategories(merged);
      })
      .catch(() => {
        // Network failure — fall back to full static list
        setLiveSubCategories(subCategories);
      });
    // Load bus routes from DB
    fetch(new URL("/api/bus-routes", apiUrl).toString())
      .then((r) => r.json())
      .then((data) => {
        const routes: BusRoute[] = (data.busRoutes || []).map((r: any) => ({
          id: r.id,
          productId: r.productId || r.product_id,
          from: r.from,
          to: r.to,
          departure: r.departure,
          arrival: r.arrival,
          duration: r.duration,
          busType: r.busType || r.bus_type,
          busName: r.busName || r.bus_name,
          totalSeats: Number(r.totalSeats || r.total_seats) || 36,
          bookedSeats: Array.isArray(r.bookedSeats) ? r.bookedSeats : (r.booked_seats || []),
          pricePerSeat: Number(r.pricePerSeat || r.price_per_seat) || 0,
          amenities: Array.isArray(r.amenities) ? r.amenities : [],
          stops: Array.isArray(r.stops) ? r.stops : [],
        }));
        if (routes.length > 0) setLiveBusRoutes(routes);
      })
      .catch(() => {});
    AsyncStorage.getItem("gobharat_notifications").then((data) => {
      if (data) {
        try { setNotifications(JSON.parse(data)); } catch {}
      }
    });
    AsyncStorage.getItem("gobharat_read_notif_ids").then((data) => {
      if (data) {
        try {
          const parsed = JSON.parse(data);
          if (Array.isArray(parsed)) {
            setReadNotifIds((prev) => Array.from(new Set([...parsed, ...prev])));
          }
        } catch {}
      }
    }).finally(() => {
      readNotifIdsHydrated.current = true;
    });
    loadHomeContent();
    loadCoupons();
    AsyncStorage.getItem("gobharat_vendor_profile_images").then((data) => {
      if (data) {
        try { setVendorProfileImages(JSON.parse(data)); } catch {}
      }
    });
    AsyncStorage.getItem("gobharat_vendor_cod_settings").then((data) => {
      if (data) {
        try { setVendorCodSettings(JSON.parse(data)); } catch {}
      }
    });
    AsyncStorage.getItem("gobharat_user").then(async (userData) => {
      if (userData) {
        try {
          const u = JSON.parse(userData);
          if (u.phone) {
            const keys = [
              `gobharat_coin_balance_${u.phone}`,
              `gobharat_coin_transactions_${u.phone}`,
              `gobharat_orders_${u.phone}`,
              `gobharat_cart_${u.phone}`,
              `gobharat_wallet_balance_${u.phone}`,
              `gobharat_wallet_txns_${u.phone}`,
              `gobharat_invoices_${u.phone}`,
            ];
            const results = await AsyncStorage.multiGet(keys);
            results.forEach(([key, val]) => {
              if (!val) return;
              try {
                const parsed = JSON.parse(val);
                if (key.includes("coin_balance")) setCoinBalance(parsed);
                else if (key.includes("coin_transactions")) setCoinTransactions(parsed);
                else if (key.includes("orders")) setOrders(parsed);
                else if (key.includes("cart")) setCart(parsed);
                else if (key.includes("wallet_balance")) setWalletBalance(parsed);
                else if (key.includes("wallet_txns")) setWalletTransactions(parsed);
                else if (key.includes("invoices")) setInvoices(parsed);
              } catch {}
            });
            // One-time 1 crore coin grant for SUPER_ADMIN
            if (u.role === "SUPER_ADMIN") {
              const grantKey = `gobharat_coin_grant_1cr_${u.phone}`;
              AsyncStorage.getItem(grantKey).then((granted) => {
                if (!granted) {
                  setCoinBalance(10_000_000);
                  AsyncStorage.setItem(grantKey, "1");
                }
              });
            }
          }
        } catch {}
      }
      userDataHydrated.current = true;
      // Fetch server-side coin balance (takes priority over stale AsyncStorage cache)
      getAuthToken().then(async (token) => {
        if (!token) return;
        try {
          const res = await fetch(new URL("/api/coins/balance", getApiUrl()).toString(), {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!res.ok) return;
          const data = await res.json();
          if (typeof data.balance === "number") setCoinBalance(data.balance);
          if (Array.isArray(data.transactions) && data.transactions.length > 0) {
            setCoinTransactions(data.transactions.map((t: any) => ({
              id: t.id,
              type: t.type as CoinTransactionType,
              amount: t.amount,
              reference: t.reference,
              createdAt: t.createdAt || new Date().toISOString(),
            })));
          }
        } catch {}
      }).catch(() => {});
    });
    AsyncStorage.getItem("gobharat_leads").then((d) => {
      if (d) { try { setLeads(JSON.parse(d)); } catch {} }
      leadsHydrated.current = true;
    });
    // Fetch server-side leads for marketing agents (runs after local hydration)
    AsyncStorage.getItem("gobharat_auth_token").then(async (token) => {
      if (!token) return;
      try {
        const apiUrl = getApiUrl();
        const res = await fetch(new URL("/api/leads", apiUrl).toString(), {
          headers: { Authorization: `Bearer ${token}`, "Cache-Control": "no-cache" },
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = await res.json();
        const serverLeads: Lead[] = (data.leads || []).map((l: any) => ({
          id: l.id,
          vendorName: l.vendorName,
          phone: l.phone,
          status: l.status as Lead["status"],
          createdAt: l.createdAt || new Date().toISOString(),
        }));
        if (serverLeads.length > 0) {
          setLeads((prev) => {
            const existingIds = new Set(prev.map((l) => l.id));
            const newOnes = serverLeads.filter((l) => !existingIds.has(l.id));
            return newOnes.length > 0 ? [...newOnes, ...prev] : prev;
          });
        }
      } catch {}
    });
  }, []);

  // Fetch server data whenever user becomes known (login OR app restart with saved session)
  useEffect(() => {
    if (!user || user.phone === "guest") return;
    const apiUrl = getApiUrl();

    // Fetch vendor's own application (for VENDOR role so vendorApp is always available)
    if (user.role === "VENDOR") {
      (async () => {
        try {
          const token = await getAuthToken();
          if (!token) return;
          const res = await fetch(new URL("/api/vendor/my-application", apiUrl).toString(), {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!res.ok) return;
          const data = await res.json();
          if (data.application) {
            const a = data.application;
            const mapped: VendorApplication = {
              id: a.id,
              businessName: a.businessName,
              ownerName: a.ownerName,
              phone: a.phone,
              email: a.email || "",
              categoryId: a.categoryId || "",
              subCategoryId: a.subCategoryId || "",
              city: a.city || "",
              address: a.address || "",
              area: a.area || "",
              gstNumber: a.gstNumber || "",
              status: a.status,
              submittedBy: a.submittedBy || "",
              submittedAt: a.submittedAt ? new Date(a.submittedAt).toISOString() : new Date().toISOString(),
              rejectionReason: a.rejectionReason,
              notes: a.notes,
            };
            setVendorApplications((prev) =>
              prev.some((x) => x.id === mapped.id) ? prev : [mapped, ...prev]
            );
          }
        } catch {}
      })();
    }

    // Fetch vendor applications for FRANCHISE / SUPER_ADMIN
    if (user.role === "FRANCHISE" || user.role === "SUPER_ADMIN") {
      (async () => {
        try {
          const token = await getAuthToken();
          if (!token) return;
          const vaUrl = new URL("/api/vendor-applications", apiUrl);
          vaUrl.searchParams.set("_t", Date.now().toString());
          const res = await fetch(vaUrl.toString(), {
            headers: { Authorization: `Bearer ${token}`, "Cache-Control": "no-cache" },
            cache: "no-store",
          });
          if (!res.ok) return;
          const data = await res.json();
          const serverApps: VendorApplication[] = (data.applications || []).map((a: any) => ({
            id: a.id,
            businessName: a.businessName,
            ownerName: a.ownerName,
            phone: a.phone,
            email: a.email || "",
            categoryId: a.categoryId || "",
            subCategoryId: a.subCategoryId || "",
            city: a.city || "",
            address: a.address || "",
            area: a.area || "",
            pinCode: a.pinCode || "",
            franchiseId: a.franchiseId || "",
            gstNumber: a.gstNumber || "",
            panNumber: a.panNumber || "",
            bankAccount: a.bankAccount || "",
            ifscCode: a.ifscCode || "",
            commissionRate: a.commissionRate ?? 10,
            description: a.description || "",
            latitude: a.latitude ?? undefined,
            longitude: a.longitude ?? undefined,
            locationLink: a.locationLink || "",
            photos: Array.isArray(a.photos) ? a.photos : [],
            status: a.status,
            submittedBy: a.submittedBy || "",
            submittedAt: a.submittedAt ? new Date(a.submittedAt).toISOString() : new Date().toISOString(),
            rejectionReason: a.rejectionReason,
            notes: a.notes,
          }));
          if (serverApps.length > 0) {
            // Server is authoritative — upsert all returned apps so pinCode/franchiseId
            // are always up-to-date even if the app was already in local state
            setVendorApplications((prev) => {
              const serverMap = new Map(serverApps.map((a) => [a.id, a]));
              const updated = prev.map((a) => serverMap.has(a.id) ? { ...a, ...serverMap.get(a.id)! } : a);
              const existingIds = new Set(prev.map((a) => a.id));
              const brandNew = serverApps.filter((a) => !existingIds.has(a.id));
              return brandNew.length > 0 ? [...brandNew, ...updated] : updated;
            });
          }
        } catch {}
      })();
      // Also fetch ad requests
      (async () => {
        try {
          const token = await getAuthToken();
          if (!token) return;
          const res = await fetch(new URL("/api/ad-requests", apiUrl).toString(), { headers: { Authorization: `Bearer ${token}` } });
          if (!res.ok) return;
          const data = await res.json();
          const rows: AdRequest[] = (data.adRequests || []).map((a: any) => ({
            id: a.id, vendorId: a.vendorId, vendorName: a.vendorName, title: a.title,
            subtitle: a.subtitle || undefined, description: a.description || undefined,
            slotType: a.slotType, color: a.color || undefined, offerText: a.offerText || undefined,
            durationDays: a.durationDays, amountPaid: a.amountPaid || 0, status: a.status,
            createdAt: a.createdAt || new Date().toISOString(),
            franchiseReviewedAt: a.franchiseReviewedAt || undefined, franchiseReviewedBy: a.franchiseReviewedBy || undefined,
            adminReviewedAt: a.adminReviewedAt || undefined, adminReviewedBy: a.adminReviewedBy || undefined,
            rejectionReason: a.rejectionReason || undefined,
            startDate: a.startDate || undefined, endDate: a.endDate || undefined,
          }));
          setAdRequests(rows);
        } catch {}
      })();
    }

    // Fetch orders from server for all authenticated roles
    (async () => {
      try {
        const token = await getAuthToken();
        if (!token) return;
        const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
        let endpoints: string[] = [];
        if (user.role === "CUSTOMER") endpoints = ["/api/orders/my"];
        else if (user.role === "VENDOR") endpoints = ["/api/orders/vendor"];
        else if (user.role === "DELIVERY") endpoints = ["/api/orders/delivery", "/api/orders/available"];
        else if (user.role === "SUPER_ADMIN") endpoints = ["/api/orders/all"];
        if (endpoints.length === 0) return;

        const mapOrder = (o: any): Order => ({
          id: o.id,
          customerId: o.customerId,
          customerName: o.customerName || "",
          vendorId: o.vendorId,
          vendorName: o.vendorName || "",
          vendorCategoryId: o.vendorCategoryId || "",
          deliveryPartnerId: o.deliveryPartnerId || undefined,
          deliveryPartnerName: o.deliveryPartnerName || undefined,
          items: (() => {
            const raw = typeof o.items === "string" ? JSON.parse(o.items) : (o.items || []);
            return raw.map((i: any) => ({
              id: i.id || String(Math.random()),
              productId: i.productId || i.id || "",
              productName: i.productName || i.name || "",
              quantity: i.quantity || 1,
              price: i.price || 0,
            }));
          })(),
          status: o.status,
          totalAmount: parseFloat(o.totalAmount) || parseFloat(o.total) || 0,
          paymentStatus: o.paymentStatus || "PENDING",
          paymentMethod: o.paymentMethod || undefined,
          createdAt: o.createdAt ? new Date(o.createdAt).toISOString() : new Date().toISOString(),
          deliveryAddress: o.deliveryAddress || o.address || "",
          deliveryOTP: o.deliveryOTP || undefined,
          deliveryNote: o.deliveryNote || undefined,
          deliverySpeed: o.deliverySpeed || undefined,
          assignedAt: o.assignedAt || undefined,
          pickedAt: o.pickedAt || undefined,
          deliveredAt: o.deliveredAt || undefined,
        });

        const allServerOrders: Order[] = [];
        for (const endpoint of endpoints) {
          try {
            const res = await fetch(new URL(endpoint, apiUrl).toString(), { headers });
            if (!res.ok) continue;
            const data = await res.json();
            (data.orders || []).forEach((o: any) => allServerOrders.push(mapOrder(o)));
          } catch {}
        }
        if (allServerOrders.length > 0) {
          setOrders((prev) => {
            const existingIds = new Set(prev.map((o) => o.id));
            const newOnes = allServerOrders.filter((o) => !existingIds.has(o.id));
            // Also update existing orders with fresh server data (status may have changed)
            const updated = prev.map((o) => {
              const fresh = allServerOrders.find((s) => s.id === o.id);
              return fresh ? fresh : o;
            });
            return newOnes.length > 0 ? [...newOnes, ...updated] : updated;
          });
        }
      } catch {}
    })();

    // Sync any pending coin grants from server (admin-granted coins)
    (async () => {
      try {
        const token = await getAuthToken();
        if (!token) return;
        const res = await fetch(new URL("/api/coins/my-grants", getApiUrl()).toString(), {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = await res.json();
        if (data.total > 0) {
          setCoinBalance((prev) => prev + data.total);
          setCoinTransactions((prev) => [
            ...data.grants.map((g: any) => ({
              id: `CG_${g.id}`,
              type: "EARNED" as const,
              amount: g.amount,
              reference: g.note || "Admin coin grant",
              createdAt: g.createdAt || new Date().toISOString(),
            })),
            ...prev,
          ]);
        }
      } catch {}
    })();

    // Fetch server-side wallet balance and transactions for CUSTOMER
    if (user.role === "CUSTOMER") {
      (async () => {
        try {
          const token = await getAuthToken();
          if (!token) return;
          const res = await fetch(new URL("/api/wallet/balance", apiUrl).toString(), {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!res.ok) return;
          const data = await res.json();
          if (typeof data.balance === "number") {
            setWalletBalance(data.balance);
          }
          if (Array.isArray(data.transactions) && data.transactions.length > 0) {
            setWalletTransactions(
              data.transactions.map((t: any) => ({
                id: t.id,
                type: t.type as "CREDIT" | "DEBIT",
                amount: t.amount,
                reference: t.reference,
                createdAt: t.createdAt || new Date().toISOString(),
              }))
            );
          }
        } catch {}
      })();
    }
  }, [user?.id]);

  useEffect(() => {
    AsyncStorage.setItem("gobharat_live_vendors", JSON.stringify(liveVendors));
  }, [liveVendors]);


  // Note: vendor applications are stored in the DB only (not AsyncStorage) to avoid stale cross-device data

  useEffect(() => {
    AsyncStorage.setItem("gobharat_custom_subcats", JSON.stringify(customSubCategories));
  }, [customSubCategories]);

  useEffect(() => {
    if (notifications.length > 0) {
      AsyncStorage.setItem("gobharat_notifications", JSON.stringify(notifications.slice(0, 100)));
    }
  }, [notifications]);

  useEffect(() => {
    if (!readNotifIdsHydrated.current) return;
    AsyncStorage.setItem("gobharat_read_notif_ids", JSON.stringify(readNotifIds.slice(-500)));
  }, [readNotifIds]);

  useEffect(() => {
    if (user?.phone && userDataHydrated.current) {
      AsyncStorage.setItem(`gobharat_coin_balance_${user.phone}`, JSON.stringify(coinBalance));
    }
  }, [coinBalance, user?.phone]);

  useEffect(() => {
    if (user?.phone && userDataHydrated.current) {
      AsyncStorage.setItem(`gobharat_coin_transactions_${user.phone}`, JSON.stringify(coinTransactions.slice(0, 200)));
    }
  }, [coinTransactions, user?.phone]);

  useEffect(() => {
    if (user?.phone && userDataHydrated.current) {
      AsyncStorage.setItem(`gobharat_orders_${user.phone}`, JSON.stringify(orders.slice(0, 500)));
    }
  }, [orders, user?.phone]);

  useEffect(() => {
    if (user?.phone && userDataHydrated.current) {
      AsyncStorage.setItem(`gobharat_cart_${user.phone}`, JSON.stringify(cart));
    }
  }, [cart, user?.phone]);

  useEffect(() => {
    if (user?.phone && userDataHydrated.current) {
      AsyncStorage.setItem(`gobharat_addresses_${user.phone}`, JSON.stringify(addresses));
    }
  }, [addresses, user?.phone]);

  useEffect(() => {
    if (user?.phone && userDataHydrated.current) {
      AsyncStorage.setItem(`gobharat_wallet_balance_${user.phone}`, JSON.stringify(walletBalance));
    }
  }, [walletBalance, user?.phone]);

  useEffect(() => {
    if (user?.phone && userDataHydrated.current) {
      AsyncStorage.setItem(`gobharat_wallet_txns_${user.phone}`, JSON.stringify(walletTransactions.slice(0, 200)));
    }
  }, [walletTransactions, user?.phone]);

  useEffect(() => {
    if (user?.phone && userDataHydrated.current) {
      AsyncStorage.setItem(`gobharat_invoices_${user.phone}`, JSON.stringify(invoices.slice(0, 200)));
    }
  }, [invoices, user?.phone]);

  useEffect(() => {
    if (leadsHydrated.current) {
      AsyncStorage.setItem("gobharat_leads", JSON.stringify(leads.slice(0, 200)));
    }
  }, [leads]);

  const ordersRef = useRef(orders);
  ordersRef.current = orders;

  useEffect(() => {
    if (!user) return;
    let promosFetched = false;
    let firstPollDone = false;
    const seenNotifIds = new Set<string>();

    const ACTIVE_ORDER_STATUSES = new Set(["PENDING", "ACCEPTED", "PREPARING", "READY", "PICKED", "ON_THE_WAY"]);
    const FAST_POLL_MS = 15000;
    const SLOW_POLL_MS = 120000;

    const isOrderRelated = (title: string) => {
      const t = title.toUpperCase();
      return (
        t.includes("ACCEPTED") || t.includes("REJECTED") || t.includes("CANCELLED") ||
        t.includes("PREPARING") || t.includes("READY") || t.includes("PICKED") ||
        t.includes("DELIVERED") || t.includes("ORDER")
      );
    };

    const runPoll = async () => {
      try {
        const fetchTasks: Promise<any>[] = [
          fetchNotificationHistory(user.id, 20).catch(() => []),
          fetchUnreadCount(user.id).catch(() => 0),
        ];
        if (!promosFetched) {
          fetchTasks.push(fetchPersonalizedPromotions(user.id, user.role, ordersRef.current.slice(0, 5).map(o => o.vendorName), ordersRef.current.length).catch(() => []));
        }
        const results = await Promise.all(fetchTasks);
        const serverNotifs: any[] = results[0];
        const promos = results[2] || [];
        if (serverNotifs.length > 0) {
          const mappedNotifs: Notification[] = serverNotifs.map((n: any) => ({
            id: n.id,
            title: n.title,
            message: n.body || n.message || "",
            targetRole: (n.segment === "customers" ? "CUSTOMER" : n.segment === "vendors" ? "VENDOR" : "ALL") as UserRole | "ALL",
            sentAt: n.createdAt || new Date().toISOString(),
            read: n.read || false,
          }));

          const genuinelyNew: Notification[] = [];
          for (const n of mappedNotifs) {
            if (!seenNotifIds.has(n.id)) {
              seenNotifIds.add(n.id);
              genuinelyNew.push(n);
            }
          }

          const isFirstPollNow = !firstPollDone;
          if (!firstPollDone) firstPollDone = true;

          let hasNewOrderStatus = false;
          if (!isFirstPollNow && user.role === "CUSTOMER" && genuinelyNew.length > 0) {
            for (const n of genuinelyNew) {
              if (isOrderRelated(n.title)) {
                hasNewOrderStatus = true;
                break;
              }
            }
          }

          if (genuinelyNew.length > 0) {
            setNotifications((prev) => {
              const existingIds = new Set(prev.map((p) => p.id));
              const newOnes = genuinelyNew.filter((n) => !existingIds.has(n.id));
              if (newOnes.length === 0) return prev;
              return [...newOnes, ...prev].slice(0, 100);
            });
          }

          if (hasNewOrderStatus) {
            setLastOrderStatusChange((c) => c + 1);
          }
        }
        if (!promosFetched && promos.length > 0) {
          promosFetched = true;
          setNotifications((prev) => {
            const existingTitles = new Set(prev.map((p) => p.title));
            const newPromos: Notification[] = promos
              .filter((p: any) => !existingTitles.has(p.title))
              .map((p: any) => ({
                id: `promo_${p.title.replace(/\s+/g, "_").toLowerCase().slice(0, 30)}`,
                title: p.title,
                message: p.body || p.message || "",
                targetRole: user.role as UserRole | "ALL",
                sentAt: new Date().toISOString(),
                read: false,
              }));
            if (newPromos.length === 0) return prev;
            return [...newPromos, ...prev].slice(0, 100);
          });
        }
      } catch {}
    };

    let timeoutId: ReturnType<typeof setTimeout>;
    const scheduleNext = () => {
      const hasActiveOrders = user.role === "CUSTOMER" &&
        ordersRef.current.some((o) => ACTIVE_ORDER_STATUSES.has(o.status));
      const delay = hasActiveOrders ? FAST_POLL_MS : SLOW_POLL_MS;
      timeoutId = setTimeout(async () => {
        await runPoll();
        scheduleNext();
      }, delay);
    };

    scheduleNext();
    return () => clearTimeout(timeoutId);
  }, [user?.id, user?.role]);

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    AsyncStorage.setItem("gobharat_language", lang);
  }, []);

  const setAutoDetectLanguage = useCallback((auto: boolean) => {
    setAutoDetectLangState(auto);
    AsyncStorage.setItem("gobharat_auto_lang", auto.toString());
  }, []);

  const getRegisteredMember = useCallback((phone: string): TeamMember | undefined => {
    const cleanPhone = phone.replace(/\D/g, "").slice(-10);
    return teamMembers.find((m) => {
      const memberPhone = m.phone.replace(/\D/g, "").slice(-10);
      return memberPhone === cleanPhone && m.status === "ACTIVE";
    });
  }, [teamMembers]);

  const login = useCallback((phone: string, role: UserRole, serverName?: string, serverId?: string) => {
    if (phone === "guest") {
      const guestUser: User = {
        id: "guest",
        name: "Guest",
        phone: "guest",
        email: "guest@gobharat.in",
        role: "CUSTOMER",
      };
      setUser(guestUser);
      AsyncStorage.setItem("gobharat_user", JSON.stringify(guestUser));
      return;
    }

    const cleanPhone = phone.replace(/\D/g, "").slice(-10);

    let userName: string;
    let userRole: UserRole = role;
    let userEmail: string = `${cleanPhone}@gobharat.in`;
    // Server-provided ID always wins — it reflects the authoritative team_member/vendor row
    let userId: string = serverId || cleanPhone;
    let vendorCatId: string | undefined;

    const cleanAdminPhone = adminPhone.replace(/\D/g, "").slice(-10);
    if (cleanAdminPhone && cleanPhone === cleanAdminPhone) {
      userName = "Super Admin";
      userRole = "SUPER_ADMIN";
      userEmail = "admin@gobharat.in";
      userId = "admin";
    } else {
      const registered = teamMembers.find((m) => {
        const mp = m.phone.replace(/\D/g, "").slice(-10);
        return mp === cleanPhone && m.status === "ACTIVE";
      });

      if (registered) {
        userName = serverName || registered.name;
        userRole = registered.role === "MARKETING" ? "MARKETING"
          : registered.role === "DELIVERY" ? "DELIVERY"
          : registered.role === "FRANCHISE" ? "FRANCHISE"
          : registered.role === "SUPER_ADMIN" ? "SUPER_ADMIN"
          : role;
        userEmail = registered.email || userEmail;
        userId = registered.id;
      } else if (serverName && role !== "CUSTOMER") {
        // Server returned a name but teamMembers list isn't loaded yet — trust the server
        userName = serverName;
      } else {
        let vendorApp = vendorApplications.find(a => {
          const ap = a.phone.replace(/\D/g, "").slice(-10);
          return ap === cleanPhone && (a.status === "APPROVED" || a.status === "LIVE");
        });
        if (vendorApp) {
          userName = vendorApp.ownerName;
          userRole = "VENDOR";
          userEmail = vendorApp.email || userEmail;
          userId = vendorApp.id;
          vendorCatId = vendorApp.categoryId;
        } else {
          userName = "User";
        }
      }
    }

    const newUser: User = {
      id: userId,
      name: userName,
      phone: cleanPhone,
      email: userEmail,
      role: userRole,
      ...(vendorCatId ? { vendorCategoryId: vendorCatId } : {}),
    };
    setUser(newUser);
    AsyncStorage.setItem("gobharat_user", JSON.stringify(newUser));
    loadTeamMembers();
    const userKeys = [
      `gobharat_coin_balance_${cleanPhone}`,
      `gobharat_coin_transactions_${cleanPhone}`,
      `gobharat_orders_${cleanPhone}`,
      `gobharat_cart_${cleanPhone}`,
      `gobharat_wallet_balance_${cleanPhone}`,
      `gobharat_wallet_txns_${cleanPhone}`,
      `gobharat_invoices_${cleanPhone}`,
      `gobharat_addresses_${cleanPhone}`,
    ];
    AsyncStorage.multiGet(userKeys).then((results) => {
      results.forEach(([key, val]) => {
        const parsed = val ? (() => { try { return JSON.parse(val); } catch { return null; } })() : null;
        if (key.includes("coin_balance")) setCoinBalance(parsed ?? 0);
        else if (key.includes("coin_transactions")) setCoinTransactions(parsed ?? []);
        else if (key.includes("orders")) setOrders(parsed ?? []);
        else if (key.includes("cart")) setCart(parsed ?? []);
        else if (key.includes("wallet_balance")) setWalletBalance(parsed ?? 0);
        else if (key.includes("wallet_txns")) setWalletTransactions(parsed ?? []);
        else if (key.includes("invoices")) setInvoices(parsed ?? []);
        else if (key.includes("addresses")) setAddresses(parsed ?? []);
      });
      // One-time 1 crore coin grant for SUPER_ADMIN on login
      if (newUser.role === "SUPER_ADMIN") {
        const grantKey = `gobharat_coin_grant_1cr_${cleanPhone}`;
        AsyncStorage.getItem(grantKey).then((granted) => {
          if (!granted) {
            setCoinBalance(10_000_000);
            AsyncStorage.setItem(grantKey, "1");
          }
        });
      }
      userDataHydrated.current = true;
      // Fetch server-side coin balance on login (takes priority — works cross-device)
      getAuthToken().then(async (token) => {
        if (!token) return;
        try {
          const res = await fetch(new URL("/api/coins/balance", getApiUrl()).toString(), {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!res.ok) return;
          const data = await res.json();
          if (typeof data.balance === "number") setCoinBalance(data.balance);
          if (Array.isArray(data.transactions) && data.transactions.length > 0) {
            setCoinTransactions(data.transactions.map((t: any) => ({
              id: t.id,
              type: t.type as CoinTransactionType,
              amount: t.amount,
              reference: t.reference,
              createdAt: t.createdAt || new Date().toISOString(),
            })));
          }
        } catch {}
      }).catch(() => {});
    }).catch(() => { userDataHydrated.current = true; });
    registerForPushNotifications().then((token) => {
      if (token) {
        registerPushTokenWithServer(newUser.id, token, newUser.role).catch(() => {});
      }
      schedulePromotionNotifications().catch(() => {});
    }).catch(() => {});
    // Median (production web build) registers the device's OneSignal player id so
    // vendors / franchise owners / delivery partners can be rung with a push even
    // when the app is closed or the phone is locked. No-op outside the Median app.
    registerOneSignalToken(newUser.id, newUser.role).catch(() => {});
    fetchNotificationHistory(newUser.id).then((serverNotifs) => {
      if (serverNotifs.length > 0) {
        const mapped: Notification[] = serverNotifs.map((n: any) => ({
          id: n.id,
          title: n.title,
          message: n.body,
          targetRole: (n.segment === "customers" ? "CUSTOMER" : n.segment === "vendors" ? "VENDOR" : "ALL") as UserRole | "ALL",
          sentAt: n.createdAt,
          read: n.read || false,
        }));
        setNotifications((prev) => {
          const existingIds = new Set(prev.map((p) => p.id));
          const newOnes = mapped.filter((m) => !existingIds.has(m.id));
          return [...newOnes, ...prev];
        });
      }
    }).catch(() => {});
    fetchPersonalizedPromotions(newUser.id, userRole, [], 0).then((promos) => {
      if (promos.length > 0) {
        const promoNotifs: Notification[] = promos.map((p: any) => ({
          id: `promo_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
          title: p.title,
          message: p.body,
          targetRole: userRole as UserRole | "ALL",
          sentAt: new Date().toISOString(),
          read: false,
        }));
        setNotifications((prev) => [...promoNotifs, ...prev]);
      }
    }).catch(() => {});
    // Load orders from server based on role
    (async () => {
      try {
        const apiUrl = getApiUrl();
        const token = await getAuthToken();
        if (!token) return;
        const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
        let endpoint = "";
        if (userRole === "CUSTOMER") endpoint = "/api/orders/my";
        else if (userRole === "VENDOR") endpoint = "/api/orders/vendor";
        else if (userRole === "DELIVERY") endpoint = "/api/orders/delivery";
        else if (userRole === "SUPER_ADMIN" || userRole === "FRANCHISE") endpoint = "/api/orders/all";
        if (!endpoint) return;
        const res = await fetch(new URL(endpoint, apiUrl).toString(), { headers });
        if (res.ok) {
          const data = await res.json();
          if (data.orders && Array.isArray(data.orders)) {
            const serverOrders: Order[] = data.orders.map((o: any) => ({
              id: o.id,
              customerId: o.customerId,
              customerName: o.customerName || "",
              vendorId: o.vendorId,
              vendorName: o.vendorName,
              vendorCategoryId: o.vendorCategoryId || "",
              deliveryPartnerId: o.deliveryPartnerId || undefined,
              deliveryPartnerName: o.deliveryPartnerName || undefined,
              status: o.status,
              totalAmount: o.totalAmount,
              paymentStatus: o.paymentStatus,
              paymentMethod: o.paymentMethod || undefined,
              createdAt: o.createdAt,
              deliveryAddress: o.deliveryAddress,
              deliveryOTP: o.deliveryOTP || undefined,
              deliveryNote: o.deliveryNote || undefined,
              deliverySpeed: o.deliverySpeed || undefined,
              assignedAt: o.assignedAt || undefined,
              pickedAt: o.pickedAt || undefined,
              deliveredAt: o.deliveredAt || undefined,
              items: (o.items || []).map((i: any) => ({
                id: i.id, productId: i.productId, productName: i.productName,
                quantity: i.quantity, price: i.price,
                seatNumber: i.seatNumber || undefined, seatClass: i.seatClass || undefined,
              })),
            }));
            setOrders((prev) => {
              const existingIds = new Set(prev.map((o) => o.id));
              const newOnes = serverOrders.filter((o) => !existingIds.has(o.id));
              return [...newOnes, ...prev].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
            });
          }
        }
      } catch {}
    })();
    // Load vendor applications from server for FRANCHISE/SUPER_ADMIN
    if (userRole === "FRANCHISE" || userRole === "SUPER_ADMIN") {
      (async () => {
        try {
          const apiUrl = getApiUrl();
          const token = await getAuthToken();
          if (!token) return;
          const vaUrl2 = new URL("/api/vendor-applications", apiUrl);
          vaUrl2.searchParams.set("_t", Date.now().toString());
          const res = await fetch(vaUrl2.toString(), {
            headers: { Authorization: `Bearer ${token}`, "Cache-Control": "no-cache" },
            cache: "no-store",
          });
          if (res.ok) {
            const data = await res.json();
            if (data.applications && Array.isArray(data.applications)) {
              const serverApps: VendorApplication[] = data.applications.map((a: any) => ({
                id: a.id,
                businessName: a.businessName,
                ownerName: a.ownerName,
                phone: a.phone,
                email: a.email || "",
                categoryId: a.categoryId,
                subCategoryId: a.subCategoryId || undefined,
                address: a.address,
                city: a.city || "",
                latitude: a.latitude || undefined,
                longitude: a.longitude || undefined,
                description: a.description || "",
                gstNumber: a.gstNumber || "",
                panNumber: a.panNumber || "",
                bankAccount: a.bankAccount || "",
                ifscCode: a.ifscCode || "",
                commissionRate: a.commissionRate ?? 10,
                paymentMethods: a.paymentMethods || [],
                upiId: a.upiId || undefined,
                subscriptionPlan: a.subscriptionPlan || undefined,
                photos: a.photos || [],
                status: a.status,
                submittedBy: a.submittedBy || "",
                submittedAt: a.submittedAt,
                reviewedBy: a.reviewedBy || undefined,
                reviewedAt: a.reviewedAt || undefined,
                rejectionReason: a.rejectionReason || undefined,
              }));
              setVendorApplications((prev) => {
                const existingIds = new Set(prev.map((a) => a.id));
                const newOnes = serverApps.filter((a) => !existingIds.has(a.id));
                return [...newOnes, ...prev];
              });
            }
          }
        } catch {}
      })();
    }
  }, [teamMembers, vendorApplications, adminPhone, loadTeamMembers]);

  const logout = useCallback(() => {
    setUser(null);
    setCart([]);
    setOrders([]);
    setWalletBalance(0);
    setWalletTransactions([]);
    setCoinBalance(0);
    setCoinTransactions([]);
    setInvoices([]);
    setLeads([]);
    setAddresses([]);
    setNotifications([]);
    setAdRequests([]);
    setVendorApplications([]);
    setVendorProfileImages({});
    setVendorCodSettings({});
    setReelComments([]);
    setCommunityComments([]);
    userDataHydrated.current = false;
    AsyncStorage.removeItem("gobharat_user");
    clearAuthToken().catch(() => {});
  }, []);

  const addToCart = useCallback((item: CartItem) => {
    // Guest users must log in before adding items to cart
    if (user?.phone === "guest") {
      setShowGuestLoginPrompt(true);
      return;
    }
    setCart((prev) => {
      if (prev.length > 0 && prev[0].vendorId !== item.vendorId) {
        return [item];
      }
      const existing = prev.find((c) => c.product.id === item.product.id);
      if (existing) {
        return prev.map((c) =>
          c.product.id === item.product.id ? { ...c, quantity: c.quantity + item.quantity } : c
        );
      }
      return [...prev, item];
    });
  }, [user]);

  const removeFromCart = useCallback((productId: string) => {
    setCart((prev) => prev.filter((c) => c.product.id !== productId));
  }, []);

  const updateCartQuantity = useCallback((productId: string, quantity: number) => {
    if (quantity <= 0) {
      setCart((prev) => prev.filter((c) => c.product.id !== productId));
      return;
    }
    setCart((prev) =>
      prev.map((c) => (c.product.id === productId ? { ...c, quantity } : c))
    );
  }, []);

  const clearCart = useCallback(() => setCart([]), []);

  const placeOrder = useCallback(
    (address: string, deliveryNote?: string, deliverySpeed?: "express" | "standard" | "scheduled", seatSelections?: Record<string, { label: string; class?: string }>, paidTotal?: number, paymentInfo?: { method?: Order["paymentMethod"]; status?: Order["paymentStatus"] }): Order => {
      const itemSubtotal = cart.reduce((sum, c) => sum + c.product.price * c.quantity, 0);
      const total = paidTotal && paidTotal > 0 ? paidTotal : itemSubtotal;
      const vendorId = cart[0]?.vendorId || "";
      // Prefer liveVendors (fetched from DB) over static allVendors so service/travel vendors
      // not in the static data.ts list are still correctly identified as non-delivery orders.
      const vendor = liveVendors.find((v) => v.id === vendorId) || allVendors.find((v) => v.id === vendorId);
      const vendorCategoryId = vendor?.categoryId || "";
      const isServiceCategory = vendorCategoryId === "3" || vendorCategoryId === "4";
      const isTravelCategory = vendorCategoryId === "5";
      const isNonDeliveryOrder = isServiceCategory || isTravelCategory;
      const deliveryPartners = teamMembers.filter((m) => m.role === "DELIVERY" && m.status === "ACTIVE");
      const assignedPartner = !isNonDeliveryOrder && deliveryPartners.length > 0
        ? deliveryPartners[Math.floor(Math.random() * deliveryPartners.length)]
        : null;
      const order: Order = {
        id: "ORD" + generateId().slice(-6).toUpperCase(),
        customerId: user?.id || "",
        customerName: user?.name || "Customer",
        vendorId,
        vendorName: cart[0]?.vendorName || "",
        vendorCategoryId,
        items: cart.map((c) => ({
          id: generateId(),
          productId: c.product.id,
          productName: c.product.name,
          quantity: c.quantity,
          price: c.product.price,
          seatNumber: seatSelections?.[c.product.id]?.label,
          seatClass: seatSelections?.[c.product.id]?.class,
        })),
        status: "PENDING",
        totalAmount: total,
        paymentStatus: paymentInfo?.status || "PAID",
        paymentMethod: paymentInfo?.method,
        createdAt: new Date().toISOString(),
        deliveryAddress: address,
        deliveryOTP: Math.floor(1000 + Math.random() * 9000).toString(),
        deliveryNote: deliveryNote || undefined,
        deliverySpeed: isNonDeliveryOrder ? undefined : (deliverySpeed || "standard"),
        deliveryPartnerId: assignedPartner?.id || undefined,
        deliveryPartnerName: assignedPartner?.name || undefined,
        assignedAt: assignedPartner ? new Date().toISOString() : undefined,
      };
      setOrders((prev) => [order, ...prev]);
      setCart([]);
      // Persist order to DB so vendors and delivery partners can see it.
      // Retries once after 5 s if the first attempt fails (covers the common
      // case where the app is briefly backgrounded right after checkout).
      (async () => {
        const persistOrder = async (): Promise<boolean> => {
          try {
            const apiUrl = getApiUrl();
            const token = await getAuthToken();
            const headers: Record<string, string> = { "Content-Type": "application/json" };
            if (token) headers["Authorization"] = `Bearer ${token}`;
            const resp = await fetch(new URL("/api/orders", apiUrl).toString(), {
              method: "POST",
              headers,
              body: JSON.stringify({ ...order, items: order.items }),
            });
            return resp.ok;
          } catch {
            return false;
          }
        };
        const ok = await persistOrder();
        if (!ok) {
          await new Promise((r) => setTimeout(r, 5000));
          const retryOk = await persistOrder();
          if (!retryOk) console.error("[placeOrder] Order", order.id, "failed to persist after retry — will sync on next verify action");
        }
      })();
      sendOrderPlacedNotification(order.id, total).catch(() => {});
      sendNewOrderNotificationForVendor(order.id, order.customerName || "Customer", total).catch(() => {});
      if (assignedPartner) {
        sendDeliveryNotification(order.id, assignedPartner.name).catch(() => {});
      }
      const orderNotif: Notification = {
        id: `notif_placed_${order.id}_${Date.now()}`,
        title: "New Order Placed",
        message: `Order #${order.id} placed by ${order.customerName} worth ₹${total.toFixed(0)}`,
        targetRole: "ALL" as const,
        sentAt: new Date().toISOString(),
        read: false,
      };
      setNotifications(prev => [orderNotif, ...prev.slice(0, 99)]);

      const orderInvoice = generateInvoice({
        type: "ORDER",
        referenceId: order.id,
        toName: order.customerName || "Customer",
        toPhone: user?.phone || "",
        toAddress: address,
        paymentMethod: "online",
        rawItems: order.items.map((item) => ({
          description: item.productName,
          hsnSac: "9983",
          qty: item.quantity,
          rate: item.price,
        })),
        notes: deliverySpeed ? `Delivery: ${deliverySpeed}` : undefined,
      });
      addInvoice(orderInvoice);

      const coinsEarned = Math.floor(total / 10000);
      if (coinsEarned > 0) {
        const coinRef = `Earned from Order #${order.id} (₹${total.toFixed(0)})`;
        setCoinBalance((prev) => prev + coinsEarned);
        setCoinTransactions((prev) => [
          {
            id: "ct" + Date.now().toString(),
            type: "EARNED" as const,
            amount: coinsEarned,
            reference: coinRef,
            createdAt: new Date().toISOString(),
          },
          ...prev,
        ]);
        // Persist earned coins to server (fire-and-forget)
        getAuthToken().then((token) => {
          if (!token) return;
          fetch(new URL("/api/coins/add", getApiUrl()).toString(), {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ amount: coinsEarned, type: "EARNED", reference: coinRef }),
          }).catch(() => {});
        }).catch(() => {});
      }

      setTimeout(() => {
        if (user) {
          const recentCats = [...new Set(cart.map(c => c.product.category || "").filter(Boolean))];
          fetchPersonalizedPromotions(user.id, user.role, recentCats, (orders?.length || 0) + 1).then((promos) => {
            if (promos.length > 0) {
              const randomPromo = promos[Math.floor(Math.random() * promos.length)];
              sendPromotionNotification(
                randomPromo.title || "Special Offer For You!",
                randomPromo.body || randomPromo.message || "",
                { promoCode: randomPromo.promoCode, deepLink: randomPromo.deepLink }
              ).catch(() => {});
              const promoNotif: Notification = {
                id: `promo_post_order_${Date.now()}`,
                title: randomPromo.title || "Special Offer For You!",
                message: randomPromo.body || randomPromo.message || "",
                targetRole: user.role as any,
                sentAt: new Date().toISOString(),
                read: false,
              };
              setNotifications(prev => [promoNotif, ...prev.slice(0, 99)]);
            }
          }).catch(() => {});
        }
      }, 5000);

      return order;
    },
    [cart, user, teamMembers, liveVendors]
  );

  const deductWallet = useCallback((amount: number, reference: string): boolean => {
    let success = false;
    setWalletBalance((prev) => {
      if (prev < amount) return prev;
      success = true;
      return prev - amount;
    });
    if (!success) return false;
    setWalletTransactions((prev) => [
      {
        id: "wt" + Date.now().toString(),
        type: "DEBIT" as const,
        amount,
        reference,
        createdAt: new Date().toISOString(),
      },
      ...prev,
    ]);
    return true;
  }, []);

  // Apply the authoritative wallet balance returned by the server (e.g. after a
  // withdrawal) instead of optimistically subtracting locally. This keeps the
  // displayed balance exactly in sync with the server even if local state was stale.
  const applyAuthoritativeWalletDebit = useCallback(
    (newBalance: number, amount: number, reference: string) => {
      setWalletBalance(Math.max(0, newBalance));
      setWalletTransactions((prev) => [
        {
          id: "wt" + Date.now().toString(),
          type: "DEBIT" as const,
          amount,
          reference,
          createdAt: new Date().toISOString(),
        },
        ...prev,
      ]);
    },
    []
  );

  const updateOrderStatus = useCallback((orderId: string, status: OrderStatus) => {
    setOrders((prev) => {
      const order = prev.find((o) => o.id === orderId);
      if (order) {
        sendOrderStatusNotification(orderId, status, order.vendorName).catch(() => {});
        sendOrderUpdateToServer(orderId, status, order.customerId, order.vendorName).catch(() => {});
      }
      return prev.map((o) => {
        if (o.id !== orderId) return o;
        const updates: Partial<Order> = { status };
        if (status === "PICKED") updates.pickedAt = new Date().toISOString();
        if (status === "DELIVERED") updates.deliveredAt = new Date().toISOString();
        return { ...o, ...updates };
      });
    });
    // Sync status to DB
    (async () => {
      try {
        const apiUrl = getApiUrl();
        const token = await getAuthToken();
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (token) headers["Authorization"] = `Bearer ${token}`;
        const resp = await fetch(new URL(`/api/orders/${orderId}/status`, apiUrl).toString(), {
          method: "PUT",
          headers,
          body: JSON.stringify({ status }),
        });
        if (!resp.ok) {
          console.error("[updateOrderStatus] Server sync failed:", resp.status);
        }
      } catch (err) {
        console.error("[updateOrderStatus] Network error syncing status:", err);
      }
    })();
    const newNotif: Notification = {
      id: `notif_${orderId}_${status}_${Date.now()}`,
      title: ORDER_STATUS_TITLES[status] || `Order ${status}`,
      message: `Order #${orderId} status changed to ${status.replace(/_/g, " ")}`,
      targetRole: "ALL" as const,
      sentAt: new Date().toISOString(),
      read: false,
    };
    setNotifications(prev => [newNotif, ...prev.slice(0, 99)]);
  }, []);

  const acceptDelivery = useCallback((orderId: string) => {
    const partnerName = user?.name || "Delivery Partner";
    setOrders((prev) =>
      prev.map((o) =>
        o.id === orderId
          ? { ...o, deliveryPartnerId: user?.id || "d3", deliveryPartnerName: partnerName, assignedAt: new Date().toISOString() }
          : o
      )
    );
    sendDeliveryNotification(orderId, partnerName).catch(() => {});
  }, [user]);

  const addAddress = useCallback((address: Omit<Address, "id">): string => {
    const newId = generateId();
    setAddresses((prev) => [...prev, { ...address, id: newId }]);
    return newId;
  }, []);

  const toggleOnline = useCallback(() => setIsOnline((prev) => !prev), []);

  const addLead = useCallback((lead: Omit<Lead, "id" | "createdAt">) => {
    const newLead: Lead = { ...lead, id: generateId(), createdAt: new Date().toISOString() };
    setLeads((prev) => [newLead, ...prev]);
    // Sync to server (fire-and-forget, failure is silent — local state is source of truth)
    AsyncStorage.getItem("gobharat_auth_token").then(async (token) => {
      if (!token) return;
      try {
        await fetch(new URL("/api/leads", getApiUrl()).toString(), {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify(newLead),
        });
      } catch {}
    });
  }, []);

  const updateLeadStatus = useCallback((leadId: string, status: Lead["status"]) => {
    setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, status } : l)));
    // Sync to server (fire-and-forget)
    AsyncStorage.getItem("gobharat_auth_token").then(async (token) => {
      if (!token) return;
      try {
        await fetch(new URL(`/api/leads/${leadId}`, getApiUrl()).toString(), {
          method: "PUT",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ status }),
        });
      } catch {}
    });
  }, []);

  const submitVendorApplication = useCallback(
    async (app: Omit<VendorApplication, "id" | "status" | "submittedAt" | "submittedBy">): Promise<boolean> => {
      const newApp: VendorApplication = {
        ...app,
        id: "VA" + generateId().slice(-6).toUpperCase(),
        status: "PENDING",
        submittedBy: user?.name || "Marketing Executive",
        submittedAt: new Date().toISOString(),
        franchiseId: (() => {
          if (app.franchiseId) return app.franchiseId;
          if (user?.role === "FRANCHISE") return user.phone || "";
          if (user?.role === "MARKETING") {
            // Find this exec's team member entry to look up who owns this franchise
            const cleanUserPhone = (user.phone || "").replace(/\D/g, "").slice(-10);
            const myEntry = teamMembers.find(m => m.phone.replace(/\D/g, "").slice(-10) === cleanUserPhone);
            // Prefer explicit franchiseId field if already set correctly
            if (myEntry?.franchiseId) return myEntry.franchiseId;
            // Look up franchise owner's phone via createdBy name match
            if (myEntry?.createdBy && myEntry?.createdByRole === "FRANCHISE") {
              const owner = teamMembers.find(m => m.name === myEntry.createdBy && m.role === "FRANCHISE");
              if (owner?.phone) return owner.phone;
            }
            // Fallback: return own phone (legacy — server now handles this via team phone matching)
            return user.phone || "";
          }
          return "";
        })(),
      };
      // Save to DB first (source of truth), then update local state
      try {
        const apiUrl = getApiUrl();
        const token = await getAuthToken();
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (token) headers["Authorization"] = `Bearer ${token}`;
        const res = await fetch(new URL("/api/vendor-applications", apiUrl).toString(), {
          method: "POST",
          headers,
          body: JSON.stringify(newApp),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          console.error("Failed to save vendor application:", err);
          // Return the user-facing error message if available (e.g. 409 duplicate phone)
          if (err?.error) return err.error as string;
          return false;
        }
        setVendorApplications((prev) => [newApp, ...prev]);
        return true;
      } catch (e) {
        console.error("submitVendorApplication error:", e);
        return false;
      }
    },
    [user, teamMembers]
  );

  const reviewVendorApplication = useCallback(
    async (appId: string, status: VendorAppStatus, rejectionReason?: string): Promise<boolean> => {
      try {
        const apiUrl = getApiUrl();
        const token = await getAuthToken();
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (token) headers["Authorization"] = `Bearer ${token}`;
        const res = await fetch(new URL(`/api/vendor-applications/${appId}`, apiUrl).toString(), {
          method: "PUT",
          headers,
          body: JSON.stringify({ status, rejectionReason: rejectionReason || null }),
        });
        if (!res.ok) {
          console.error("Failed to review vendor application:", await res.json().catch(() => ({})));
          return false;
        }
        setVendorApplications((prev) =>
          prev.map((a) =>
            a.id === appId
              ? {
                  ...a,
                  status,
                  reviewedBy: user?.name || "Franchise Manager",
                  reviewedAt: new Date().toISOString(),
                  rejectionReason: rejectionReason || a.rejectionReason,
                }
              : a
          )
        );
        return true;
      } catch (e) {
        console.error("reviewVendorApplication error:", e);
        return false;
      }
    },
    [user]
  );

  const makeVendorLive = useCallback(async (appId: string): Promise<boolean> => {
    const currentApps = await new Promise<VendorApplication[]>((resolve) => {
      setVendorApplications((prev) => { resolve(prev); return prev; });
    });
    const app = currentApps.find((a) => a.id === appId);
    if (!app) return false;

    const allSubs = [...subCategories, ...customSubCategories];
    const resolvedSubCatId = app.subCategoryId || allSubs.find((sc) => sc.categoryId === app.categoryId)?.id || "sc5";
    const remotePhoto = app.photos?.find((p) => p.startsWith("http"));
    const scImage = allSubs.find((sc) => sc.id === resolvedSubCatId)?.image;
    const vendorImage = remotePhoto || scImage || "https://images.unsplash.com/photo-1604719312566-8912e9227c6a?w=400";
    const newVendor: Vendor = {
      id: app.id,
      name: app.businessName,
      description: app.description || `${app.businessName} - Quality products & services`,
      image: vendorImage,
      rating: 4.0,
      reviewCount: 0,
      deliveryTime: "20-30 min",
      distance: "0.5 km",
      isOpen: true,
      categoryId: app.categoryId,
      subCategoryId: resolvedSubCatId,
      commissionRate: app.commissionRate || 10,
      lat: app.latitude || 20.5547 + (Math.random() - 0.5) * 0.01,
      lng: app.longitude || 74.5247 + (Math.random() - 0.5) * 0.01,
    };

    try {
      const apiUrl = getApiUrl();
      const token = await getAuthToken();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;
      // Save vendor application as LIVE (with full appData for upsert if missing from DB)
      const appRes = await fetch(new URL(`/api/vendor-applications/${appId}`, apiUrl).toString(), {
        method: "PUT",
        headers,
        body: JSON.stringify({ status: "LIVE", appData: app }),
      });
      if (!appRes.ok) {
        console.error("Failed to mark vendor application as LIVE:", await appRes.json().catch(() => ({})));
        return false;
      }
      // Also persist vendor entry (server PUT already does this, but POST ensures it exists)
      await fetch(new URL("/api/vendors", apiUrl).toString(), {
        method: "POST",
        headers,
        body: JSON.stringify(newVendor),
      });
      // Update local state only after DB confirms
      setLiveVendors((lv) => {
        const exists = lv.find((v) => v.id === newVendor.id);
        return exists ? lv.map((v) => v.id === newVendor.id ? newVendor : v) : [...lv, newVendor];
      });
      setVendorApplications((prev) =>
        prev.map((a) => (a.id === appId ? { ...a, status: "LIVE" as VendorAppStatus } : a))
      );
      return true;
    } catch (e) {
      console.error("makeVendorLive error:", e);
      return false;
    }
  }, [customSubCategories]);

  const bulkApproveVendors = useCallback(async (): Promise<{ ok: boolean; approved: number }> => {
    try {
      const apiUrl = getApiUrl();
      const token = await getAuthToken();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch(new URL("/api/vendor-applications/bulk-approve", apiUrl).toString(), {
        method: "POST",
        headers,
      });
      if (!res.ok) {
        console.error("bulkApproveVendors failed:", await res.json().catch(() => ({})));
        return { ok: false, approved: 0 };
      }
      const data = await res.json().catch(() => ({ approved: 0 }));
      // Optimistically flip pending → LIVE locally, then refresh the live vendor list from server
      setVendorApplications((prev) =>
        prev.map((a) => (a.status === "PENDING" ? { ...a, status: "LIVE" as VendorAppStatus } : a))
      );
      reloadVendors();
      return { ok: true, approved: Number(data?.approved) || 0 };
    } catch (e) {
      console.error("bulkApproveVendors error:", e);
      return { ok: false, approved: 0 };
    }
  }, [reloadVendors]);

  const deleteVendor = useCallback(async (id: string): Promise<boolean> => {
    try {
      const apiUrl = getApiUrl();
      const token = await getAuthToken();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch(new URL(`/api/vendor-applications/${id}`, apiUrl).toString(), {
        method: "DELETE",
        headers,
        cache: "no-store",
      });
      if (!res.ok) return false;
      setLiveVendors((prev) => prev.filter((v) => v.id !== id));
      setVendorApplications((prev) => prev.filter((a) => a.id !== id));
      return true;
    } catch (e) {
      console.error("deleteVendor error:", e);
      return false;
    }
  }, []);

  const addReel = useCallback(
    (reel: Omit<Reel, "id" | "likes" | "comments" | "shares" | "isLiked" | "createdAt">) => {
      const tempId = "r" + generateId();
      const newReel: Reel = {
        ...reel,
        id: tempId,
        likes: 0,
        comments: 0,
        shares: 0,
        isLiked: false,
        createdAt: new Date().toISOString(),
      };
      setReels((prev) => [newReel, ...prev]);
      getAuthToken().then((token) => {
        fetch(new URL("/api/reels", getApiUrl()).toString(), {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify(reel),
        })
          .then(r => r.ok ? r.json() : Promise.reject(new Error("Server error")))
          .then(data => {
            if (data?.reel?.id) {
              setReels((prev) => prev.map((r) => r.id === tempId ? { ...data.reel } : r));
            }
          })
          .catch((err) => {
            console.error("[addReel] Failed to persist reel, removing from local state:", err);
            setReels((prev) => prev.filter((r) => r.id !== tempId));
          });
      }).catch(() => {});
    },
    []
  );

  const removeAddress = useCallback((addressId: string) => {
    setAddresses((prev) => prev.filter((a) => a.id !== addressId));
  }, []);

  const setDefaultAddress = useCallback((addressId: string) => {
    setAddresses((prev) =>
      prev.map((a) => ({ ...a, isDefault: a.id === addressId }))
    );
  }, []);

  const addWalletMoney = useCallback((amount: number) => {
    const wtId = "wt" + Date.now().toString();
    setWalletBalance((prev) => prev + amount);
    setWalletTransactions((prev) => [
      {
        id: wtId,
        type: "CREDIT" as const,
        amount,
        reference: "Wallet Top-up",
        createdAt: new Date().toISOString(),
      },
      ...prev,
    ]);
    const walletInvoice = generateInvoice({
      type: "WALLET_TOPUP",
      referenceId: wtId,
      toName: user?.name || "User",
      toPhone: user?.phone || "",
      toAddress: "Malegaon, Maharashtra",
      paymentMethod: "online",
      rawItems: [{ description: "Wallet Top-up", hsnSac: "997159", qty: 1, rate: amount }],
      notes: "Go Bharat Wallet Recharge",
    });
    addInvoice(walletInvoice);
  }, [user]);

  const addCoins = useCallback((amount: number, reference: string, type: CoinTransactionType) => {
    setCoinBalance((prev) => prev + amount);
    setCoinTransactions((prev) => [
      {
        id: "ct" + Date.now().toString(),
        type,
        amount,
        reference,
        createdAt: new Date().toISOString(),
      },
      ...prev,
    ]);
    // Persist to server (fire-and-forget)
    getAuthToken().then((token) => {
      if (!token) return;
      fetch(new URL("/api/coins/add", getApiUrl()).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ amount, type, reference }),
      }).catch(() => {});
    }).catch(() => {});
  }, []);

  const redeemCoins = useCallback((amount: number, reference: string): boolean => {
    let success = false;
    setCoinBalance((prev) => {
      if (prev < amount) return prev;
      success = true;
      return prev - amount;
    });
    if (!success) return false;
    setCoinTransactions((prev) => [
      {
        id: "ct" + Date.now().toString(),
        type: "REDEEMED" as const,
        amount,
        reference,
        createdAt: new Date().toISOString(),
      },
      ...prev,
    ]);
    // Persist to server (fire-and-forget)
    getAuthToken().then((token) => {
      if (!token) return;
      fetch(new URL("/api/coins/redeem", getApiUrl()).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ amount, reference }),
      }).catch(() => {});
    }).catch(() => {});
    return true;
  }, []);

  const redeemCoinsToWallet = useCallback(async (
    coins: number
  ): Promise<{ success: boolean; error?: string; rupees?: number; newWalletBalance?: number; newCoinBalance?: number }> => {
    const amount = Math.floor(coins);
    if (!amount || amount < 1) {
      return { success: false, error: "Minimum redemption is 1 coin (₹100)." };
    }
    const token = await getAuthToken();
    if (!token) {
      return { success: false, error: "Please log in to redeem coins." };
    }
    try {
      const idempotencyKey = `redeem_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
      const res = await fetch(new URL("/api/coins/redeem-to-wallet", getApiUrl()).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ coins: amount, idempotencyKey }),
      });
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok || !data?.success) {
        return { success: false, error: data?.error || "Failed to redeem coins. Please try again." };
      }
      const rupees: number = typeof data.rupees === "number" ? data.rupees : amount * 100;
      const nowIso = new Date().toISOString();
      // Prefer server-returned absolute balances (authoritative); fall back to local deltas.
      if (typeof data.newCoinBalance === "number") {
        setCoinBalance(Math.max(0, data.newCoinBalance));
      } else {
        setCoinBalance((prev) => Math.max(0, prev - amount));
      }
      setCoinTransactions((prev) => [
        {
          id: data.coinTxnId || "ct" + Date.now().toString(),
          type: "REDEEMED" as const,
          amount,
          reference: data.coinReference || `Redeemed ${amount} coins to wallet (₹${rupees})`,
          createdAt: nowIso,
        },
        ...prev,
      ]);
      // Credit INR wallet + record CREDIT wallet transaction
      if (typeof data.newWalletBalance === "number") {
        setWalletBalance(Math.max(0, data.newWalletBalance));
      } else {
        setWalletBalance((prev) => prev + rupees);
      }
      setWalletTransactions((prev) => [
        {
          id: data.walletTxnId || "wt" + Date.now().toString(),
          type: "CREDIT" as const,
          amount: rupees,
          reference: data.walletReference || "Coin Redemption",
          createdAt: nowIso,
        },
        ...prev,
      ]);
      return {
        success: true,
        rupees,
        newWalletBalance: typeof data.newWalletBalance === "number" ? data.newWalletBalance : undefined,
        newCoinBalance: typeof data.newCoinBalance === "number" ? data.newCoinBalance : undefined,
      };
    } catch {
      return { success: false, error: "Network error. Please check your connection and try again." };
    }
  }, []);

  const purchaseCoins = useCallback((amount: number) => {
    const ctId = "ct" + Date.now().toString();
    setCoinBalance((prev) => prev + amount);
    setCoinTransactions((prev) => [
      {
        id: ctId,
        type: "PURCHASED" as const,
        amount,
        reference: `Purchased ${amount} Go Bharat Coins`,
        createdAt: new Date().toISOString(),
      },
      ...prev,
    ]);
    // Persist to server (fire-and-forget)
    getAuthToken().then((token) => {
      if (!token) return;
      fetch(new URL("/api/coins/add", getApiUrl()).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ amount, type: "PURCHASED", reference: `Purchased ${amount} Go Bharat Coins` }),
      }).catch(() => {});
    }).catch(() => {});
    const coinInvoice = generateInvoice({
      type: "WALLET_TOPUP",
      referenceId: ctId,
      toName: user?.name || "User",
      toPhone: user?.phone || "",
      toAddress: "Malegaon, Maharashtra",
      paymentMethod: "online",
      rawItems: [{ description: `Go Bharat Coins Purchase (${amount} coins)`, hsnSac: "997159", qty: 1, rate: amount }],
      notes: "Go Bharat Coin Purchase - 1 Coin = ₹1",
    });
    addInvoice(coinInvoice);
  }, [user]);

  const toggleReelLike = useCallback((reelId: string) => {
    setReels((prev) =>
      prev.map((r) =>
        r.id === reelId
          ? { ...r, isLiked: !r.isLiked, likes: r.isLiked ? r.likes - 1 : r.likes + 1 }
          : r
      )
    );
  }, []);

  const deleteReel = useCallback((reelId: string) => {
    setReels((prev) => prev.filter((r) => r.id !== reelId));
    getAuthToken().then((token) => {
      fetch(new URL(`/api/reels/${reelId}`, getApiUrl()).toString(), {
        method: "DELETE",
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      }).catch(() => {});
    }).catch(() => {});
  }, []);

  const addReelComment = useCallback((reelId: string, text: string) => {
    if (!user) return;
    const newComment: ReelComment = {
      id: "rc_" + generateId(),
      reelId,
      userId: user.id,
      userName: user.name,
      text,
      createdAt: new Date().toISOString(),
    };
    setReelComments((prev) => [newComment, ...prev]);
    setReels((prev) => prev.map((r) => r.id === reelId ? { ...r, comments: r.comments + 1 } : r));
  }, [user]);

  const addAdminCoupon = useCallback(async (coupon: Omit<AdminCoupon, "id" | "usedCount" | "createdAt">) => {
    const newCoupon: AdminCoupon = {
      ...coupon,
      id: "CPN" + generateId().slice(-6).toUpperCase(),
      usedCount: 0,
      createdAt: new Date().toISOString(),
    };
    setAdminCoupons((prev) => [newCoupon, ...prev]);
    try {
      const token = await getAuthToken();
      const apiUrl = getApiUrl();
      const res = await fetch(new URL("/api/coupons", apiUrl).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(newCoupon),
      });
      if (!res.ok) await loadCoupons();
    } catch { await loadCoupons(); }
  }, [loadCoupons]);

  const toggleAdminCoupon = useCallback(async (couponId: string) => {
    setAdminCoupons((prev) =>
      prev.map((c) => (c.id === couponId ? { ...c, isActive: !c.isActive } : c))
    );
    try {
      const token = await getAuthToken();
      const apiUrl = getApiUrl();
      const res = await fetch(new URL(`/api/coupons/${couponId}/toggle`, apiUrl).toString(), {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) await loadCoupons();
    } catch { await loadCoupons(); }
  }, [loadCoupons]);

  const deleteAdminCoupon = useCallback(async (couponId: string) => {
    setAdminCoupons((prev) => prev.filter((c) => c.id !== couponId));
    try {
      const token = await getAuthToken();
      const apiUrl = getApiUrl();
      const res = await fetch(new URL(`/api/coupons/${couponId}`, apiUrl).toString(), {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) await loadCoupons();
    } catch { await loadCoupons(); }
  }, [loadCoupons]);

  const banUser = useCallback((userData: Omit<BannedUser, "id" | "bannedAt">) => {
    const banned: BannedUser = {
      ...userData,
      id: "BAN" + generateId().slice(-6).toUpperCase(),
      bannedAt: new Date().toISOString(),
    };
    setBannedUsers((prev) => [banned, ...prev]);
  }, []);

  const unbanUser = useCallback((bannedId: string) => {
    setBannedUsers((prev) => prev.filter((b) => b.id !== bannedId));
  }, []);

  const sendNotification = useCallback((notif: Omit<Notification, "id" | "sentAt" | "read">) => {
    const newNotif: Notification = {
      ...notif,
      id: "NTF" + generateId().slice(-6).toUpperCase(),
      read: false,
      sentAt: new Date().toISOString(),
    };
    setNotifications((prev) => [newNotif, ...prev]);
  }, []);

  const markNotificationRead = useCallback((notifId: string) => {
    setNotifications((prev) => prev.map((n) => n.id === notifId ? { ...n, read: true } : n));
  }, []);

  const markAllNotificationsRead = useCallback((role: UserRole) => {
    setNotifications((prev) => prev.map((n) => (n.targetRole === role || n.targetRole === "ALL") ? { ...n, read: true } : n));
  }, []);

  const markNotifItemsRead = useCallback((ids: string[]) => {
    if (!ids || ids.length === 0) return;
    setReadNotifIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.add(id));
      return Array.from(next);
    });
  }, []);

  const cancelOrder = useCallback((orderId: string) => {
    setOrders((prev) => {
      const order = prev.find((o) => o.id === orderId);
      if (order && order.paymentStatus === "PAID") {
        setWalletBalance((wb) => wb + order.totalAmount);
        setWalletTransactions((wt) => [
          {
            id: "wt" + Date.now().toString(),
            type: "CREDIT" as const,
            amount: order.totalAmount,
            reference: `Refund (Cancelled) - ${order.id}`,
            createdAt: new Date().toISOString(),
          },
          ...wt,
        ]);
      }
      return prev.map((o) => (o.id === orderId ? { ...o, status: "CANCELLED" as OrderStatus, paymentStatus: order?.paymentStatus === "PAID" ? "REFUNDED" as const : o.paymentStatus } : o));
    });
  }, []);

  const refundOrder = useCallback((orderId: string) => {
    setOrders((prev) => {
      const order = prev.find((o) => o.id === orderId);
      if (order && order.paymentStatus === "PAID") {
        setWalletBalance((wb) => wb + order.totalAmount);
        setWalletTransactions((wt) => [
          {
            id: "wt" + Date.now().toString(),
            type: "CREDIT" as const,
            amount: order.totalAmount,
            reference: `Refund - ${order.id}`,
            createdAt: new Date().toISOString(),
          },
          ...wt,
        ]);
      }
      return prev.map((o) => (o.id === orderId ? { ...o, paymentStatus: "REFUNDED" as const } : o));
    });
  }, []);

  // Ensures the order exists in the DB before we PATCH its payment-status.
  // POST /api/orders uses onConflictDoNothing, so calling it when the order
  // already exists is a safe no-op. This recovers the common case where the
  // fire-and-forget POST in placeOrder was silently lost (network hiccup, app
  // backgrounded, etc.) — the vendor's confirm/reject tap then re-syncs it.
  const ensureOrderInDb = useCallback(async (orderId: string, token: string | null, apiUrl: string): Promise<void> => {
    const orderSnapshot = ordersRef.current.find((o) => o.id === orderId);
    if (!orderSnapshot) return;
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;
      await fetch(new URL("/api/orders", apiUrl).toString(), {
        method: "POST",
        headers,
        body: JSON.stringify({ ...orderSnapshot, items: orderSnapshot.items }),
      });
    } catch {}
  }, []);

  const confirmQrPayment = useCallback(async (orderId: string): Promise<boolean> => {
    try {
      const apiUrl = getApiUrl();
      const token = await getAuthToken();
      await ensureOrderInDb(orderId, token, apiUrl);
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const resp = await fetch(new URL(`/api/orders/${orderId}/payment-status`, apiUrl).toString(), {
        method: "PATCH",
        headers,
        body: JSON.stringify({ paymentStatus: "PAID" }),
      });
      if (!resp.ok) {
        console.error("[confirmQrPayment] Failed:", resp.status);
        return false;
      }
      setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, paymentStatus: "PAID" as const } : o)));
      const notif: Notification = {
        id: `notif_qrpaid_${orderId}_${Date.now()}`,
        title: "Payment Confirmed",
        message: `Vendor confirmed UPI payment for order #${orderId}`,
        targetRole: "ALL" as const,
        sentAt: new Date().toISOString(),
        read: false,
      };
      setNotifications((prev) => [notif, ...prev.slice(0, 99)]);
      return true;
    } catch (err) {
      console.error("[confirmQrPayment] Network error:", err);
      return false;
    }
  }, [ensureOrderInDb]);

  const rejectQrPayment = useCallback(async (orderId: string): Promise<boolean> => {
    try {
      const apiUrl = getApiUrl();
      const token = await getAuthToken();
      await ensureOrderInDb(orderId, token, apiUrl);
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const resp = await fetch(new URL(`/api/orders/${orderId}/payment-status`, apiUrl).toString(), {
        method: "PATCH",
        headers,
        body: JSON.stringify({ paymentStatus: "FAILED" }),
      });
      if (!resp.ok) {
        console.error("[rejectQrPayment] Failed:", resp.status);
        return false;
      }
      // Server atomically sets paymentStatus=FAILED and status=CANCELLED in one write.
      setOrders((prev) =>
        prev.map((o) =>
          o.id === orderId
            ? { ...o, paymentStatus: "FAILED" as const, status: "CANCELLED" as OrderStatus }
            : o
        )
      );
      const notif: Notification = {
        id: `notif_qrrejected_${orderId}_${Date.now()}`,
        title: "Payment Not Received",
        message: `Vendor reported no UPI payment received for order #${orderId}`,
        targetRole: "ALL" as const,
        sentAt: new Date().toISOString(),
        read: false,
      };
      setNotifications((prev) => [notif, ...prev.slice(0, 99)]);
      return true;
    } catch (err) {
      console.error("[rejectQrPayment] Network error:", err);
      return false;
    }
  }, [ensureOrderInDb]);

  const addTeamMember = useCallback(async (member: Omit<TeamMember, "id" | "createdAt">) => {
    const newMember: TeamMember = {
      ...member,
      id: "TM" + generateId().slice(-6).toUpperCase(),
      createdAt: new Date().toISOString(),
    };
    setTeamMembers((prev) => [newMember, ...prev]);
    try {
      const apiUrl = getApiUrl();
      const token = await getAuthToken();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch(new URL("/api/team-members", apiUrl).toString(), {
        method: "POST",
        headers,
        body: JSON.stringify(newMember),
      });
      if (!res.ok) {
        setTeamMembers((prev) => prev.filter((m) => m.id !== newMember.id));
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData?.error || `Server error ${res.status}`);
      }
    } catch (err) {
      setTeamMembers((prev) => prev.filter((m) => m.id !== newMember.id));
      throw err;
    }
  }, []);

  const removeTeamMember = useCallback(async (memberId: string) => {
    const backup = teamMembers.find((m) => m.id === memberId);
    setTeamMembers((prev) => prev.filter((m) => m.id !== memberId));
    try {
      const apiUrl = getApiUrl();
      const token = await getAuthToken();
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch(new URL(`/api/team-members/${memberId}`, apiUrl).toString(), {
        method: "DELETE",
        headers,
      });
      if (!res.ok && backup) {
        setTeamMembers((prev) => [backup, ...prev]);
      }
    } catch {
      if (backup) setTeamMembers((prev) => [backup, ...prev]);
    }
  }, [teamMembers]);

  const toggleTeamMemberStatus = useCallback(async (memberId: string) => {
    setTeamMembers((prev) =>
      prev.map((m) => (m.id === memberId ? { ...m, status: m.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" } : m))
    );
    try {
      const apiUrl = getApiUrl();
      const token = await getAuthToken();
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch(new URL(`/api/team-members/${memberId}/toggle-status`, apiUrl).toString(), {
        method: "PUT",
        headers,
      });
      if (!res.ok) {
        setTeamMembers((prev) =>
          prev.map((m) => (m.id === memberId ? { ...m, status: m.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" } : m))
        );
      }
    } catch {
      setTeamMembers((prev) =>
        prev.map((m) => (m.id === memberId ? { ...m, status: m.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" } : m))
      );
    }
  }, []);

  const editTeamMember = useCallback(async (memberId: string, updates: Partial<Pick<TeamMember, "name" | "phone" | "email" | "city" | "role" | "territory" | "pinCode" | "bankName" | "accountNumber" | "ifscCode" | "accountHolderName">>): Promise<boolean> => {
    const backup = teamMembers.find((m) => m.id === memberId);
    setTeamMembers((prev) =>
      prev.map((m) => (m.id === memberId ? { ...m, ...updates } : m))
    );
    try {
      const apiUrl = getApiUrl();
      const token = await getAuthToken();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch(new URL(`/api/team-members/${memberId}`, apiUrl).toString(), {
        method: "PUT",
        headers,
        body: JSON.stringify(updates),
      });
      if (!res.ok) {
        if (backup) {
          setTeamMembers((prev) =>
            prev.map((m) => (m.id === memberId ? backup : m))
          );
        }
        return false;
      }
      return true;
    } catch {
      if (backup) {
        setTeamMembers((prev) =>
          prev.map((m) => (m.id === memberId ? backup : m))
        );
      }
      return false;
    }
  }, [teamMembers]);

  const addSubCategory = useCallback((subCat: Omit<SubCategory, "id">) => {
    // ID must fit in varchar(20): "sc_" (3) + base36 timestamp (~8) + random (3) = 14 chars max
    const shortId = "sc_" + Date.now().toString(36) + Math.random().toString(36).substr(2, 3);
    const newSC: SubCategory = {
      ...subCat,
      id: shortId,
    };
    setCustomSubCategories((prev) => [...prev, newSC]);
    // Persist to DB so it appears across all devices
    (async () => {
      try {
        const apiUrl = getApiUrl();
        const token = await getAuthToken();
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (token) headers["Authorization"] = `Bearer ${token}`;
        const resp = await fetch(new URL("/api/subcategories/custom", apiUrl).toString(), {
          method: "POST",
          headers,
          body: JSON.stringify(newSC),
        });
        if (!resp.ok) {
          console.warn("[addSubCategory] server error:", resp.status, await resp.text().catch(() => ""));
        }
      } catch (e) {
        console.warn("[addSubCategory] fetch failed:", e);
      }
    })();
  }, []);

  const removeSubCategory = useCallback((subCatId: string) => {
    setCustomSubCategories((prev) => prev.filter((sc) => sc.id !== subCatId));
  }, []);

  const addReview = useCallback((review: Omit<Review, "id" | "createdAt" | "helpful">) => {
    const newReview: Review = {
      ...review,
      id: "REV" + generateId().slice(-6).toUpperCase(),
      createdAt: new Date().toISOString(),
      helpful: 0,
    };
    setReviews((prev) => [newReview, ...prev]);
  }, []);

  const markReviewHelpful = useCallback((reviewId: string) => {
    setReviews((prev) =>
      prev.map((r) => (r.id === reviewId ? { ...r, helpful: r.helpful + 1 } : r))
    );
  }, []);

  const replyToReview = useCallback((reviewId: string, reply: string) => {
    setReviews((prev) =>
      prev.map((r) => r.id === reviewId ? { ...r, vendorReply: reply, vendorReplyAt: new Date().toISOString() } : r)
    );
  }, []);

  const deleteReview = useCallback((reviewId: string) => {
    setReviews((prev) => prev.filter((r) => r.id !== reviewId));
  }, []);

  const submitAdRequest = useCallback(async (ad: Omit<AdRequest, "id" | "status" | "createdAt">) => {
    const apiUrl = getApiUrl();
    try {
      const token = await getAuthToken();
      const res = await fetch(new URL("/api/ad-requests", apiUrl).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(ad),
      });
      if (res.ok) {
        const data = await res.json();
        const newAd: AdRequest = { ...data.adRequest, createdAt: data.adRequest.createdAt || new Date().toISOString() };
        setAdRequests((prev) => [newAd, ...prev]);
        const adInvoice = generateInvoice({
          type: "AD_SLOT", referenceId: newAd.id, toName: ad.vendorName, toPhone: user?.phone || "", toAddress: "Malegaon, Maharashtra", paymentMethod: "online",
          rawItems: [{ description: `${ad.slotType} Ad Slot - ${ad.durationDays} Days (${ad.title})`, hsnSac: "998361", qty: 1, rate: ad.amountPaid }],
          notes: `Ad Campaign: ${ad.title} | Slot: ${ad.slotType} | Duration: ${ad.durationDays} days`,
        });
        addInvoice(adInvoice);
        return;
      }
    } catch {}
    // Fallback: local only
    const newAd: AdRequest = { ...ad, id: "AD" + generateId().slice(-6).toUpperCase(), status: "PENDING_FRANCHISE", createdAt: new Date().toISOString() };
    setAdRequests((prev) => [newAd, ...prev]);
  }, [user]);

  const reviewAdRequestFranchise = useCallback(async (adId: string, approved: boolean, reason?: string) => {
    const status = approved ? "PENDING_ADMIN" as const : "REJECTED" as const;
    setAdRequests((prev) => prev.map((ad) => ad.id === adId ? { ...ad, status, rejectionReason: approved ? undefined : reason, franchiseReviewedAt: new Date().toISOString(), franchiseReviewedBy: "Franchise Manager" } : ad));
    try {
      const apiUrl = getApiUrl();
      const token = await getAuthToken();
      await fetch(new URL(`/api/ad-requests/${adId}`, apiUrl).toString(), {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ status, franchiseReview: true, rejectionReason: reason || null }),
      });
    } catch {}
  }, []);

  const reviewAdRequestAdmin = useCallback(async (adId: string, approved: boolean, reason?: string) => {
    const status = approved ? "APPROVED" as const : "REJECTED" as const;
    setAdRequests((prev) => prev.map((ad) => ad.id === adId ? { ...ad, status, rejectionReason: approved ? undefined : reason, adminReviewedAt: new Date().toISOString(), adminReviewedBy: "Admin" } : ad));
    try {
      const apiUrl = getApiUrl();
      const token = await getAuthToken();
      await fetch(new URL(`/api/ad-requests/${adId}`, apiUrl).toString(), {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ status, adminReview: true, rejectionReason: reason || null }),
      });
    } catch {}
  }, []);

  const makeAdLive = useCallback(async (adId: string) => {
    const now = new Date();
    let durationDays = 30;
    setAdRequests((prev) => {
      const target = prev.find(a => a.id === adId);
      if (target) durationDays = target.durationDays;
      return prev.map((ad) => {
        if (ad.id !== adId) return ad;
        const end = new Date(now.getTime() + ad.durationDays * 24 * 60 * 60 * 1000);
        return { ...ad, status: "LIVE" as const, startDate: now.toISOString(), endDate: end.toISOString() };
      });
    });
    try {
      const apiUrl = getApiUrl();
      const token = await getAuthToken();
      await fetch(new URL(`/api/ad-requests/${adId}`, apiUrl).toString(), {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ status: "LIVE", durationDays }),
      });
    } catch {}
  }, []);

  const refreshAdRequests = useCallback(async () => {
    const apiUrl = getApiUrl();
    try {
      const token = await getAuthToken();
      if (!token) return;
      const res = await fetch(new URL("/api/ad-requests", apiUrl).toString(), { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return;
      const data = await res.json();
      const rows: AdRequest[] = (data.adRequests || []).map((a: any) => ({
        id: a.id, vendorId: a.vendorId, vendorName: a.vendorName, title: a.title,
        subtitle: a.subtitle || undefined, description: a.description || undefined,
        slotType: a.slotType, color: a.color || undefined, offerText: a.offerText || undefined,
        durationDays: a.durationDays, amountPaid: a.amountPaid || 0, status: a.status,
        createdAt: a.createdAt || new Date().toISOString(),
        franchiseReviewedAt: a.franchiseReviewedAt || undefined, franchiseReviewedBy: a.franchiseReviewedBy || undefined,
        adminReviewedAt: a.adminReviewedAt || undefined, adminReviewedBy: a.adminReviewedBy || undefined,
        rejectionReason: a.rejectionReason || undefined,
        startDate: a.startDate || undefined, endDate: a.endDate || undefined,
      }));
      setAdRequests(rows);
    } catch {}
  }, []);

  const addCustomerStory = useCallback((story: Omit<CustomerStory, "id" | "likes" | "isLiked" | "isFeatured" | "createdAt">) => {
    setCustomerStories((prev) => [
      { ...story, id: generateId(), likes: 0, isLiked: false, isFeatured: false, createdAt: new Date().toISOString() },
      ...prev,
    ]);
  }, []);

  const toggleStoryLike = useCallback((storyId: string) => {
    setCustomerStories((prev) =>
      prev.map((s) =>
        s.id === storyId
          ? { ...s, isLiked: !s.isLiked, likes: s.isLiked ? s.likes - 1 : s.likes + 1 }
          : s
      )
    );
  }, []);

  const toggleStoryFeatured = useCallback((storyId: string) => {
    setCustomerStories((prev) =>
      prev.map((s) => s.id === storyId ? { ...s, isFeatured: !s.isFeatured } : s)
    );
  }, []);

  const deleteCustomerStory = useCallback((storyId: string) => {
    setCustomerStories((prev) => prev.filter((s) => s.id !== storyId));
  }, []);

  const addCommunityPost = useCallback((post: Omit<CommunityPost, "id" | "likes" | "isLiked" | "commentsCount" | "createdAt">) => {
    const newPost: CommunityPost = {
      ...post,
      id: "cp_" + generateId(),
      likes: 0,
      isLiked: false,
      commentsCount: 0,
      createdAt: new Date().toISOString(),
    };
    setCommunityPosts((prev) => [newPost, ...prev]);
  }, []);

  const togglePostLike = useCallback((postId: string) => {
    setCommunityPosts((prev) =>
      prev.map((p) =>
        p.id === postId
          ? { ...p, isLiked: !p.isLiked, likes: p.isLiked ? p.likes - 1 : p.likes + 1 }
          : p
      )
    );
  }, []);

  const addPostComment = useCallback((postId: string, text: string) => {
    if (!user) return;
    const newComment: CommunityComment = {
      id: "cc_" + generateId(),
      postId,
      userId: user.id,
      userName: user.name,
      text,
      createdAt: new Date().toISOString(),
    };
    setCommunityComments((prev) => [newComment, ...prev]);
    setCommunityPosts((prev) =>
      prev.map((p) => p.id === postId ? { ...p, commentsCount: p.commentsCount + 1 } : p)
    );
  }, [user]);

  const followVendor = useCallback((vendorId: string, vendorName: string) => {
    if (!user) return;
    const existing = vendorFollows.find((f) => f.userId === user.id && f.vendorId === vendorId);
    if (existing) return;
    setVendorFollows((prev) => [...prev, {
      id: "vf_" + generateId(),
      userId: user.id,
      vendorId,
      vendorName,
      followedAt: new Date().toISOString(),
    }]);
  }, [user, vendorFollows]);

  const unfollowVendor = useCallback((vendorId: string) => {
    if (!user) return;
    setVendorFollows((prev) => prev.filter((f) => !(f.userId === user.id && f.vendorId === vendorId)));
  }, [user]);

  const isFollowingVendor = useCallback((vendorId: string) => {
    if (!user) return false;
    return vendorFollows.some((f) => f.userId === user.id && f.vendorId === vendorId);
  }, [user, vendorFollows]);

  const deleteCommunityPost = useCallback((postId: string) => {
    setCommunityPosts((prev) => prev.filter((p) => p.id !== postId));
    setCommunityComments((prev) => prev.filter((c) => c.postId !== postId));
  }, []);

  const deletePostComment = useCallback((commentId: string, postId: string) => {
    setCommunityComments((prev) => prev.filter((c) => c.id !== commentId));
    setCommunityPosts((prev) =>
      prev.map((p) => p.id === postId ? { ...p, commentsCount: Math.max(0, p.commentsCount - 1) } : p)
    );
  }, []);

  const togglePinPost = useCallback((postId: string) => {
    setCommunityPosts((prev) =>
      prev.map((p) => p.id === postId ? { ...p, isPinned: !p.isPinned } : p)
    );
  }, []);

  const toggleHidePost = useCallback((postId: string) => {
    setCommunityPosts((prev) =>
      prev.map((p) => p.id === postId ? { ...p, isHidden: !p.isHidden } : p)
    );
  }, []);

  const vendorOrders = useMemo(
    () => (user?.role === "VENDOR" ? orders.filter((o) => o.vendorId === user.id) : []),
    [orders, user]
  );

  const deliveryOrders = useMemo(
    () => (user?.role === "DELIVERY" ? orders.filter((o) => o.deliveryPartnerId === user.id) : []),
    [orders, user]
  );

  const refreshAppConfig = useCallback(async () => {
    try {
      const baseUrl = getApiUrl();
      const role = user?.role || "CUSTOMER";
      const res = await fetch(new URL(`/api/app-config?role=${role}`, baseUrl).toString());
      if (res.ok) {
        const data = await res.json();
        if (data.featureFlags) {
          setFeatureFlags(data.featureFlags.map((name: string, i: number) => ({
            id: `ff_${i}`,
            name,
            description: "",
            enabled: true,
            roles: ["ALL"],
            category: "core" as const,
            icon: "checkmark",
            updatedAt: new Date().toISOString(),
          })));
        }
        if (data.announcements) setAppAnnouncements(data.announcements);
        if (data.dynamicPages) setDynamicPages(data.dynamicPages);
      }
    } catch {}
  }, [user]);

  const isFeatureEnabled = useCallback((featureName: string): boolean => {
    if (featureFlags.length === 0) return true;
    return featureFlags.some((f) => f.name === featureName && f.enabled);
  }, [featureFlags]);

  const submitDealBooking = useCallback(async (booking: Omit<DealBooking, "id" | "status" | "createdAt" | "slotFee">) => {
    const slotFee = adminPricing.dealSlotRates[booking.duration];
    const localId = "db" + Date.now().toString().slice(-6);
    const newBooking: DealBooking = {
      ...booking,
      id: localId,
      slotFee,
      status: "PENDING",
      createdAt: new Date().toISOString(),
    };
    setDealBookings((prev) => [newBooking, ...prev]);
    const durationLabel = booking.duration === "1day" ? "1 Day" : booking.duration === "3days" ? "3 Days" : "7 Days";
    const durationDays = booking.duration === "1day" ? 1 : booking.duration === "3days" ? 3 : 7;

    // Also submit as an ad_request to the server so franchise can review it
    try {
      const apiUrl = getApiUrl();
      const token = await getAuthToken();
      const adPayload = {
        vendorId: booking.vendorId,
        vendorName: booking.vendorName,
        title: booking.productName,
        subtitle: `Deal Slot - ${durationLabel}`,
        description: `Deal price: ₹${booking.dealPrice} (Original: ₹${booking.originalPrice}) | Payment: ${booking.paymentMethod || "upi"}`,
        slotType: "FEATURED",
        color: "#FF4500",
        offerText: `₹${booking.dealPrice} (${Math.round((1 - booking.dealPrice / booking.originalPrice) * 100)}% OFF)`,
        durationDays,
        amountPaid: slotFee,
        status: "PENDING_FRANCHISE",
      };
      const res = await fetch(new URL("/api/ad-requests", apiUrl).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(adPayload),
      });
      if (res.ok) {
        const data = await res.json();
        const newAd: AdRequest = { ...data.adRequest, createdAt: data.adRequest.createdAt || new Date().toISOString() };
        setAdRequests((prev) => [newAd, ...prev]);
      }
    } catch {}

    const notif: Notification = {
      id: `notif_deal_${newBooking.id}_${Date.now()}`,
      title: "New Deal Slot Request",
      message: `${booking.vendorName} wants to list "${booking.productName}" at ₹${booking.dealPrice} (was ₹${booking.originalPrice}) for ${durationLabel}`,
      targetRole: "SUPER_ADMIN",
      sentAt: new Date().toISOString(),
      read: false,
    };
    setNotifications((prev) => [notif, ...prev.slice(0, 99)]);
    const dealInvoice = generateInvoice({
      type: "DEAL_SLOT",
      referenceId: newBooking.id,
      toName: booking.vendorName,
      toPhone: user?.phone || "",
      toAddress: "Malegaon, Maharashtra",
      paymentMethod: booking.paymentMethod || "upi",
      rawItems: [{ description: `Daily Deal Slot - ${durationLabel} (${booking.productName})`, hsnSac: "998361", qty: 1, rate: slotFee }],
      notes: `Product: ${booking.productName} | Deal Price: ₹${booking.dealPrice} (Original: ₹${booking.originalPrice})`,
    });
    addInvoice(dealInvoice);
  }, [adminPricing, user]);

  const reviewDealBooking = useCallback((bookingId: string, approved: boolean, reason?: string) => {
    setDealBookings((prev) => prev.map((b) => {
      if (b.id !== bookingId) return b;
      if (approved) {
        const durationMs = b.duration === "1day" ? 24 * 60 * 60 * 1000 : b.duration === "3days" ? 3 * 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
        return { ...b, status: "ACTIVE" as const, approvedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + durationMs).toISOString() };
      }
      return { ...b, status: "REJECTED" as const, rejectionReason: reason || "Not approved" };
    }));
    const booking = dealBookings.find((b) => b.id === bookingId);
    if (booking) {
      const notif: Notification = {
        id: `notif_deal_review_${bookingId}_${Date.now()}`,
        title: approved ? "Deal Slot Approved!" : "Deal Slot Rejected",
        message: approved ? `Your deal for "${booking.productName}" has been approved and is now live!` : `Your deal for "${booking.productName}" was rejected. ${reason || ""}`,
        targetRole: "VENDOR",
        sentAt: new Date().toISOString(),
        read: false,
      };
      setNotifications((prev) => [notif, ...prev.slice(0, 99)]);
    }
  }, [dealBookings]);

  const updateAdminPricing = useCallback((updates: Partial<AdminPricing>) => {
    setAdminPricing((prev) => ({ ...prev, ...updates, updatedAt: new Date().toISOString() }));
  }, []);

  const acceptTermsForRole = useCallback((role: UserRole) => {
    setTermsAcceptedRoles((prev) => {
      const key = role;
      if (prev.includes(key)) return prev;
      const updated = [...prev, key];
      AsyncStorage.setItem("gobharat_terms_accepted", JSON.stringify(updated));
      return updated;
    });
  }, []);

  const hasAcceptedTerms = useCallback((role: UserRole) => {
    return termsAcceptedRoles.includes(role);
  }, [termsAcceptedRoles]);

  const startLiveSession = useCallback((session: Omit<LiveSession, "id" | "viewers" | "peakViewers" | "likes" | "isLiked" | "status" | "startedAt" | "chatMessages">) => {
    const newSession: LiveSession = {
      ...session,
      id: "live_" + Date.now().toString(36),
      viewers: 0,
      peakViewers: 0,
      likes: 0,
      isLiked: false,
      status: "LIVE",
      startedAt: new Date().toISOString(),
      chatMessages: [],
    };
    setLiveSessions((prev) => [newSession, ...prev]);
    return newSession;
  }, []);

  const endLiveSession = useCallback((sessionId: string) => {
    setLiveSessions((prev) => prev.map((s) =>
      s.id === sessionId ? { ...s, status: "ENDED" as const, endedAt: new Date().toISOString() } : s
    ));
  }, []);

  const addLiveChatMessage = useCallback((sessionId: string, message: string) => {
    if (!user) return;
    const isVendor = user.role === "VENDOR";
    const chatMsg: LiveChatMessage = {
      id: "lc_" + Date.now().toString(36),
      userId: user.id,
      userName: user.name,
      message,
      timestamp: new Date().toISOString(),
      isVendor,
    };
    setLiveSessions((prev) => prev.map((s) =>
      s.id === sessionId ? { ...s, chatMessages: [...s.chatMessages, chatMsg] } : s
    ));
  }, [user]);

  const likeLiveSession = useCallback((sessionId: string) => {
    setLiveSessions((prev) => prev.map((s) =>
      s.id === sessionId ? { ...s, likes: s.isLiked ? s.likes - 1 : s.likes + 1, isLiked: !s.isLiked } : s
    ));
  }, []);

  const joinLiveSession = useCallback((sessionId: string) => {
    setLiveSessions((prev) => prev.map((s) =>
      s.id === sessionId ? { ...s, viewers: s.viewers + 1, peakViewers: Math.max(s.peakViewers, s.viewers + 1) } : s
    ));
  }, []);

  const leaveLiveSession = useCallback((sessionId: string) => {
    setLiveSessions((prev) => prev.map((s) =>
      s.id === sessionId ? { ...s, viewers: Math.max(0, s.viewers - 1) } : s
    ));
  }, []);

  useEffect(() => {
    if (user) {
      refreshAppConfig().catch(() => {});
    }
  }, [user, refreshAppConfig]);

  const value = useMemo<AppState>(
    () => ({
      initialized,
      user,
      isAuthenticated: !!user,
      language,
      autoDetectLanguage,
      setLanguage,
      setAutoDetectLanguage,
      cart,
      orders,
      addresses,
      walletBalance,
      walletTransactions,
      leads,
      vendorOrders,
      deliveryOrders,
      isOnline,
      vendorApplications,
      liveVendors,
      customerPinCode,
      setCustomerPinCode,
      reloadVendors,
      loadHomeContent,
      refreshAdRequests,
      reels,
      adminCoupons,
      bannedUsers,
      notifications,
      adminPhone,
      setAdminPhone: setAdminPhoneState,
      getRegisteredMember,
      login,
      logout,
      addToCart,
      removeFromCart,
      updateCartQuantity,
      clearCart,
      placeOrder,
      updateOrderStatus,
      acceptDelivery,
      addAddress,
      removeAddress,
      setDefaultAddress,
      addWalletMoney,
      toggleOnline,
      addLead,
      updateLeadStatus,
      submitVendorApplication,
      reviewVendorApplication,
      makeVendorLive,
      bulkApproveVendors,
      deleteVendor,
      addReel,
      toggleReelLike,
      deleteReel,
      reelComments,
      addReelComment,
      addAdminCoupon,
      toggleAdminCoupon,
      deleteAdminCoupon,
      banUser,
      unbanUser,
      sendNotification,
      markNotificationRead,
      markAllNotificationsRead,
      readNotifIds,
      markNotifItemsRead,
      cancelOrder,
      refundOrder,
      confirmQrPayment,
      rejectQrPayment,
      teamMembers,
      customSubCategories,
      liveCategories,
      liveSubCategories,
      liveBusRoutes,
      addTeamMember,
      removeTeamMember,
      toggleTeamMemberStatus,
      editTeamMember,
      addSubCategory,
      removeSubCategory,
      reviews,
      addReview,
      markReviewHelpful,
      replyToReview,
      deleteReview,
      adRequests,
      submitAdRequest,
      reviewAdRequestFranchise,
      reviewAdRequestAdmin,
      makeAdLive,
      deductWallet,
      applyAuthoritativeWalletDebit,
      customerStories,
      addCustomerStory,
      toggleStoryLike,
      toggleStoryFeatured,
      deleteCustomerStory,
      communityPosts,
      communityComments,
      vendorFollows,
      addCommunityPost,
      togglePostLike,
      addPostComment,
      followVendor,
      unfollowVendor,
      isFollowingVendor,
      deleteCommunityPost,
      deletePostComment,
      togglePinPost,
      toggleHidePost,
      featureFlags,
      dynamicPages,
      appAnnouncements,
      isFeatureEnabled,
      refreshAppConfig,
      dealBookings,
      adminPricing,
      submitDealBooking,
      reviewDealBooking,
      updateAdminPricing,
      unreadNotificationCount: notifications.filter((n) => !n.read && !n.id.startsWith("promo_") && !n.id.startsWith("notif_")).length,
      termsAcceptedRoles,
      acceptTermsForRole,
      hasAcceptedTerms,
      liveSessions,
      startLiveSession,
      endLiveSession,
      addLiveChatMessage,
      likeLiveSession,
      joinLiveSession,
      leaveLiveSession,
      invoices,
      getInvoiceByRef,
      addInvoice,
      vendorProfileImages,
      updateVendorProfileImage,
      removeVendorProfileImage,
      updateVendorPaymentQr,
      removeVendorPaymentQr,
      updateVendorUpiId,
      vendorCodSettings,
      updateVendorCod,
      toggleVendorOpen,
      coinBalance,
      coinTransactions,
      addCoins,
      redeemCoins,
      redeemCoinsToWallet,
      purchaseCoins,
      homeBanners,
      homeDeals,
      addHomeBanner,
      updateHomeBanner,
      deleteHomeBanner,
      addHomeDeal,
      updateHomeDeal,
      deleteHomeDeal,
      promoMedia,
      addPromoMedia,
      removePromoMedia,
      togglePromoMedia,
      showGuestLoginPrompt,
      setShowGuestLoginPrompt,
      lastOrderStatusChange,
    }),
    [initialized, user, language, autoDetectLanguage, setLanguage, setAutoDetectLanguage, cart, orders, addresses, walletBalance, walletTransactions, leads, vendorOrders, deliveryOrders, isOnline, adminPhone, vendorApplications, liveVendors, customerPinCode, setCustomerPinCode, reloadVendors, loadHomeContent, reels, reelComments, adminCoupons, bannedUsers, notifications, teamMembers, customSubCategories, liveCategories, liveSubCategories, liveBusRoutes, getRegisteredMember, login, logout, addToCart, removeFromCart, updateCartQuantity, clearCart, placeOrder, updateOrderStatus, acceptDelivery, addAddress, removeAddress, setDefaultAddress, addWalletMoney, deductWallet, applyAuthoritativeWalletDebit, toggleOnline, addLead, updateLeadStatus, submitVendorApplication, reviewVendorApplication, makeVendorLive, bulkApproveVendors, deleteVendor, addReel, toggleReelLike, deleteReel, addReelComment, addAdminCoupon, toggleAdminCoupon, deleteAdminCoupon, banUser, unbanUser, sendNotification, markNotificationRead, markAllNotificationsRead, readNotifIds, markNotifItemsRead, cancelOrder, refundOrder, confirmQrPayment, rejectQrPayment, addTeamMember, removeTeamMember, toggleTeamMemberStatus, editTeamMember, addSubCategory, removeSubCategory, reviews, addReview, markReviewHelpful, replyToReview, deleteReview, adRequests, submitAdRequest, reviewAdRequestFranchise, reviewAdRequestAdmin, makeAdLive, refreshAdRequests, customerStories, addCustomerStory, toggleStoryLike, toggleStoryFeatured, deleteCustomerStory, communityPosts, communityComments, vendorFollows, addCommunityPost, togglePostLike, addPostComment, followVendor, unfollowVendor, isFollowingVendor, deleteCommunityPost, deletePostComment, togglePinPost, toggleHidePost, featureFlags, dynamicPages, appAnnouncements, isFeatureEnabled, refreshAppConfig, dealBookings, adminPricing, submitDealBooking, reviewDealBooking, updateAdminPricing, termsAcceptedRoles, acceptTermsForRole, hasAcceptedTerms, liveSessions, startLiveSession, endLiveSession, addLiveChatMessage, likeLiveSession, joinLiveSession, leaveLiveSession, invoices, getInvoiceByRef, addInvoice, vendorProfileImages, updateVendorProfileImage, removeVendorProfileImage, updateVendorPaymentQr, removeVendorPaymentQr, vendorCodSettings, updateVendorCod, toggleVendorOpen, coinBalance, coinTransactions, addCoins, redeemCoins, redeemCoinsToWallet, purchaseCoins, homeBanners, homeDeals, addHomeBanner, updateHomeBanner, deleteHomeBanner, addHomeDeal, updateHomeDeal, deleteHomeDeal, promoMedia, addPromoMedia, removePromoMedia, togglePromoMedia, showGuestLoginPrompt, setShowGuestLoginPrompt, lastOrderStatusChange]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

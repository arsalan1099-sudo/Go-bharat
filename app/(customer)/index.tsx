import React, { useRef, useState, useEffect, useMemo, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  FlatList,
  Dimensions,
  Platform,
  Modal,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Animated,
} from "react-native";
import { Image } from "expo-image";
import { router, useNavigation } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Video, ResizeMode } from "expo-av";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useApp } from "@/lib/store";
import PressableScale from "@/components/PressableScale";
import { useTabBar } from "@/lib/tabBarContext";
import { t, LOCATION_LANGUAGE_MAP } from "@/lib/i18n";
import { categories, vendors, products, subCategories } from "@/lib/data";
import type { CustomerStory } from "@/lib/types";
import { getApiUrl } from "@/lib/query-client";
import { countUnreadNotifications } from "@/lib/notifications";

const { width } = Dimensions.get("window");
const BANNER_WIDTH = width - 32;

const LOCATION_AREAS: { label: string; pin: string }[] = [
  { label: "All Areas", pin: "" },
  { label: "Malegaon, Maharashtra", pin: "423203" },
  { label: "Govandi, Mumbai", pin: "400043" },
  { label: "South Mumbai", pin: "400009" },
  { label: "Mumbai, Maharashtra", pin: "400001" },
  { label: "Delhi, NCR", pin: "110001" },
  { label: "Bangalore, Karnataka", pin: "560001" },
  { label: "Hyderabad, Telangana", pin: "500001" },
  { label: "Chennai, Tamil Nadu", pin: "600001" },
  { label: "Pune, Maharashtra", pin: "411001" },
  { label: "Ahmedabad, Gujarat", pin: "380001" },
  { label: "Kolkata, West Bengal", pin: "700001" },
  { label: "Lucknow, Uttar Pradesh", pin: "226001" },
];

const BANNER_CATEGORY_MAP: Record<string, string> = {
  b1: "2",
  b2: "2",
  b3: "2",
  b4: "1",
  b5: "2",
};

const SERVICE_PILLS = [
  { id: "gobharat", label: "Go Bharat", icon: "storefront", color: Colors.primary, bg: Colors.primary },
  { id: "b2b", label: "B2B", icon: "briefcase-outline", color: "#3B82F6", bg: "#3B82F6" },
  { id: "services", label: "Services", icon: "build-outline", color: "#8B5CF6", bg: "#8B5CF6" },
  { id: "manpower", label: "Manpower", icon: "people-outline", color: "#10B981", bg: "#10B981" },
];


const VENDOR_PLACEHOLDER_COLORS = ["#FF6B35","#4ECDC4","#45B7D1","#96CEB4","#A78BFA","#F472B6","#34D399","#FB923C","#60A5FA","#FBBF24"];
const vendorPlaceholderColor = (name: string) => {
  const h = (name || "").split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return VENDOR_PLACEHOLDER_COLORS[h % VENDOR_PLACEHOLDER_COLORS.length];
};

// ── Bold visual language (design tokens) ───────────────────────────────
// One cohesive, high-energy system shared across the home screen instead of
// scattered one-off hex values: punchy saffron gradients, a layered shadow
// scale (incl. a saffron glow for hero elements), and a consistent radii set.
const RADII = { sm: 12, md: 16, lg: 18, xl: 22, pill: 999 };

const GRADIENTS = {
  saffron: ["#FF4D00", "#FF7A1A", "#FFA12E"] as const,
  saffronCta: ["#FF5A00", "#FFA12E"] as const,
  ember: ["#FF3D3D", "#FF6B00"] as const,
  gold: ["#F59E0B", "#FFB74D"] as const,
  navy: ["#0B1E3D", "#1A3A6B"] as const,
};

const SHADOWS = {
  soft: {
    shadowColor: "#1A1A2E",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 4,
  },
  lift: {
    shadowColor: "#1A1A2E",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 18,
    elevation: 8,
  },
  glow: {
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 14,
    elevation: 9,
  },
};

function SearchResultItem({ product }: { product: typeof products[0] }) {
  const vendor = vendors.find((v) => v.id === product.vendorId);
  return (
    <Pressable
      style={styles.searchResultItem}
      onPress={() => {
        try { Haptics.selectionAsync(); } catch {}
        router.push(`/product/${product.id}` as any);
      }}
    >
      <Image source={{ uri: product.image }} style={styles.searchResultImage} contentFit="cover" transition={200} accessibilityLabel={product.name} />
      <View style={styles.searchResultInfo}>
        <Text style={styles.searchResultName} numberOfLines={1}>{product.name}</Text>
        <View style={styles.searchResultVendorRow}>
          <Text style={styles.searchResultVendor} numberOfLines={1}>{vendor?.name}</Text>
          {vendor && (
            <View style={styles.distancePill}>
              <Ionicons name="location-outline" size={10} color={Colors.textSecondary} />
              <Text style={styles.distancePillText}>{vendor.distance}</Text>
            </View>
          )}
        </View>
        <View style={styles.priceRow}>
          <Text style={styles.searchResultPrice}>{"\u20B9"}{product.price}</Text>
          {product.originalPrice && (
            <Text style={styles.searchResultOriginal}>{"\u20B9"}{product.originalPrice}</Text>
          )}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color={Colors.textLight} />
    </Pressable>
  );
}

function SearchResultVendor({ vendor }: { vendor: typeof vendors[0] }) {
  const category = categories.find((c) => c.id === vendor.categoryId);
  return (
    <Pressable
      style={styles.searchResultItem}
      onPress={() => {
        try { Haptics.selectionAsync(); } catch {}
        router.push(`/store/${vendor.id}` as any);
      }}
    >
      {vendor.image ? (
        <Image source={[{ uri: vendor.image }]} style={styles.searchResultImage} contentFit="cover" accessibilityLabel={vendor.name} />
      ) : vendor.id ? (
        <Image source={{ uri: `${getApiUrl()}/api/vendors/${vendor.id}/image` }} style={styles.searchResultImage} contentFit="cover" accessibilityLabel={vendor.name} />
      ) : (
        <View style={[styles.searchResultImage, { backgroundColor: vendorPlaceholderColor(vendor.name || ""), alignItems: "center", justifyContent: "center" }]}>
          <Text style={{ fontFamily: "Poppins_700Bold", fontSize: 18, color: "#FFF" }}>{(vendor.name || "?")[0].toUpperCase()}</Text>
        </View>
      )}
      <View style={styles.searchResultInfo}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text style={[styles.searchResultName, { flex: 1 }]} numberOfLines={1}>{vendor.name}</Text>
          {vendor.isOpen && (
            <View style={styles.onlineVendorBadge}>
              <View style={styles.onlineVendorDot} />
              <Text style={styles.onlineVendorText}>Open</Text>
            </View>
          )}
        </View>
        <Text style={styles.searchResultVendor} numberOfLines={1}>{category?.name} | {vendor.distance}</Text>
        <View style={styles.vendorMeta}>
          <View style={styles.ratingBadge}>
            <Ionicons name="star" size={10} color="#FFF" />
            <Text style={[styles.ratingText, { fontSize: 10 }]}>{vendor.rating}</Text>
          </View>
          <Text style={styles.searchResultVendor}>{vendor.deliveryTime}</Text>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color={Colors.textLight} />
    </Pressable>
  );
}

interface AISearchResult {
  interpretation?: string;
  productKeywords?: string[];
  storeKeywords?: string[];
  categoryIds?: string[];
  suggestions?: string[];
}

function parseDistance(dist: string): number {
  const num = parseFloat(dist);
  return isNaN(num) ? 999 : num;
}

function sortVendorsByDistance(v: typeof vendors): typeof vendors {
  return [...v].sort((a, b) => parseDistance(a.distance) - parseDistance(b.distance));
}

const AI_QUICK_SUGGESTIONS = [
  "Best deals today",
  "Healthy food options",
  "Electronics under 500",
  "Nearest grocery store",
  "Fashion trending now",
  "Home essentials",
];

const MAX_IMG_RETRIES = 2;

// Product image that heals itself: a transient load failure (cold server,
// momentary network drop in the WebView) retries with a cache-bust + backoff
// before falling back to the placeholder icon — instead of sticking forever.
function ProductImage({
  productId,
  name,
  style,
  fallbackStyle,
  fallbackIcon,
  iconSize,
}: {
  productId: string;
  name: string;
  style: any;
  fallbackStyle: any;
  fallbackIcon: keyof typeof Ionicons.glyphMap;
  iconSize: number;
}) {
  const [retry, setRetry] = useState(0);
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <View style={fallbackStyle}>
        <Ionicons name={fallbackIcon} size={iconSize} color={Colors.primary} />
      </View>
    );
  }

  const uri = `${getApiUrl()}/api/products/${productId}/image${retry > 0 ? `?r=${retry}` : ""}`;
  return (
    <Image
      source={{ uri }}
      style={style}
      contentFit="cover"
      accessibilityLabel={name}
      onError={() => {
        if (retry < MAX_IMG_RETRIES) {
          setTimeout(() => setRetry((n) => n + 1), 700 * (retry + 1));
        } else {
          setFailed(true);
        }
      }}
    />
  );
}

export default function CustomerHome() {
  const insets = useSafeAreaInsets();
  const { user, orders, language, autoDetectLanguage, setLanguage, liveVendors, adRequests, customerStories, toggleStoryLike, dealBookings, liveSessions, customerPinCode, setCustomerPinCode, reloadVendors, loadHomeContent, homeBanners, homeDeals, liveCategories, promoMedia, notifications: appNotifications, readNotifIds } = useApp();
  const displayCategories = liveCategories.length > 0 ? liveCategories : categories;
  const liveAdBanners = useMemo(() => adRequests.filter(a => a.status === "LIVE" && a.slotType === "BANNER").map(a => ({ id: `ad-${a.id}`, title: a.title, subtitle: a.subtitle, color: a.color || "#FF6B00", isAd: true, vendorId: a.vendorId, offerText: a.offerText })), [adRequests]);
  const allBanners = useMemo(() => [
    ...homeBanners.filter(b => b.isActive).sort((a, b) => a.order - b.order).map(b => ({ ...b, isAd: false as const, ctaText: b.ctaText })),
    ...liveAdBanners,
  ], [homeBanners, liveAdBanners]);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeBanner, setActiveBanner] = useState(0);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState("All Areas");
  const [pinInput, setPinInput] = useState("");
  const [showAllTrending, setShowAllTrending] = useState(false);
  const [visibleStoreCount, setVisibleStoreCount] = useState(8);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [aiSearching, setAiSearching] = useState(false);
  const [aiResult, setAiResult] = useState<AISearchResult | null>(null);
  const [aiError, setAiError] = useState(false);
  const [activeQuickCat, setActiveQuickCat] = useState("foryou");
  const activeDealBookings = useMemo(() =>
    dealBookings.filter(b => b.status === "ACTIVE" && b.expiresAt && new Date(b.expiresAt).getTime() > Date.now()).map(b => ({
      id: `deal-${b.id}`, productId: b.productId, name: b.productName, image: b.productImage, price: b.dealPrice, originalPrice: b.originalPrice,
      endsInHours: Math.max(1, Math.ceil((new Date(b.expiresAt!).getTime() - Date.now()) / 3600000)),
      sold: Math.floor(Math.random() * 80) + 20, total: Math.floor(Math.random() * 100) + 100,
    }))
  , [dealBookings]);

  const activeHomeDeals = useMemo(() => homeDeals.filter(d => d.isActive), [homeDeals]);
  const mergedDeals = useMemo(() => [...activeDealBookings, ...activeHomeDeals], [activeDealBookings, activeHomeDeals]);

  const [topProducts, setTopProducts] = useState<any[]>([]);
  const [browseProducts, setBrowseProducts] = useState<any[]>([]);

  const [dealCountdown, setDealCountdown] = useState(() => {
    const now = new Date();
    return activeHomeDeals.map(d => {
      const endTime = new Date(now.getTime() + d.endsInHours * 3600000);
      return { id: d.id, endTime: endTime.getTime() };
    });
  });
  const [countdownDisplay, setCountdownDisplay] = useState<Record<string, string>>({});
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bannerRef = useRef<FlatList>(null);
  const searchInputRef = useRef<TextInput>(null);
  const mainScrollRef = useRef<ScrollView>(null);
  const navigation = useNavigation();
  const { hideTabBar, showTabBar, lastScrollY } = useTabBar();
  const headerTranslateY = useRef(new Animated.Value(0)).current;
  const [headerHeight, setHeaderHeight] = useState(0);
  const headerHidden = useRef(false);
  const logoScale = useRef(new Animated.Value(1)).current;
  const logoGlow = useRef(new Animated.Value(0.85)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(logoScale, { toValue: 1.08, duration: 900, useNativeDriver: true }),
          Animated.timing(logoGlow, { toValue: 1, duration: 900, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(logoScale, { toValue: 1, duration: 900, useNativeDriver: true }),
          Animated.timing(logoGlow, { toValue: 0.85, duration: 900, useNativeDriver: true }),
        ]),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, []);
  // On web/Median Android: use actual inset if available, else 30px (Android status bar)
  // 67px was too large for Median full-screen wrapper
  const topInset = Platform.OS === "web" ? (insets.top > 0 ? insets.top : 30) : insets.top;

  // When a non-CUSTOMER user browses the customer home, the BackToDashboardBanner
  // (position:absolute, zIndex:999) sits on top of the header. Its total height is:
  //   web:    paddingTop(67+8) + content(22) + paddingBottom(10) = 107px
  //   native: safeAreaInsets.top + 4 + 22 + 10 = insets.top + 36px
  // We push the header content below the banner by adding the difference.
  const isBannerShown = !!user?.role && user.role !== "CUSTOMER";
  const BANNER_HEIGHT = Platform.OS === "web" ? (67 + 8 + 22 + 10) : (insets.top + 36);
  const bannerExtraPadding = isBannerShown ? Math.max(0, BANNER_HEIGHT - (topInset + 8)) : 0;

  // Sync selectedLocation label when customerPinCode is loaded from AsyncStorage
  useEffect(() => {
    if (customerPinCode) {
      const match = LOCATION_AREAS.find(a => a.pin === customerPinCode);
      setSelectedLocation(match ? match.label : `PIN ${customerPinCode}`);
    } else {
      setSelectedLocation("All Areas");
    }
  }, [customerPinCode]);

  // Fetch top products (image-only) for the horizontal Top Products row
  useEffect(() => {
    const load = async () => {
      try {
        const url = new URL(`/api/products/top?limit=20&_t=${Date.now()}`, getApiUrl()).toString();
        const res = await fetch(url, { headers: { "Cache-Control": "no-store" } });
        const data = await res.json();
        if (Array.isArray(data)) {
          setTopProducts(data.filter((p: any) => p.hasImage));
          setBrowseProducts(data); // all products for the grid — fallback icon for those without images
        }
      } catch {}
    };
    load();
  }, []);

  // Active pin code filter: prefer customerPinCode (set by city picker or manual input)
  // over area-derived pin so both mechanisms stay in sync.
  const areaPin = LOCATION_AREAS.find(a => a.label === selectedLocation)?.pin ?? "";
  const selectedPin = customerPinCode || areaPin;
  // Filter liveVendors by selected pin code. Vendors with no pinCode always show.
  const localVendors = useMemo(() => {
    if (!selectedPin) return liveVendors;
    return liveVendors.filter(v => {
      const vPin = (v.pinCode || "").trim();
      return !vPin || vPin === selectedPin;
    });
  }, [liveVendors, selectedPin]);
  // Whether the selected area has any shop whose pin actually matches it.
  // Global/empty-pin vendors are ignored here so a single global shop doesn't
  // suppress the fallback below.
  const hasLocalShops = useMemo(
    () => !selectedPin || liveVendors.some((v) => (v.pinCode || "").trim() === selectedPin),
    [liveVendors, selectedPin]
  );
  // Graceful fallback: when the selected area has no local shops, show ALL vendors
  // instead of a near-empty screen (still prefers local shops when they exist).
  const isAreaEmptyFallback = !!selectedPin && !hasLocalShops && liveVendors.length > 0;
  const allVendors = isAreaEmptyFallback ? liveVendors : localVendors;

  useEffect(() => {
    const unsubscribe = navigation.addListener("tabPress" as any, () => {
      mainScrollRef.current?.scrollTo({ y: 0, animated: true });
      showTabBar();
      try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
    });
    return unsubscribe;
  }, [navigation]);

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveBanner((prev) => {
        const next = (prev + 1) % allBanners.length;
        bannerRef.current?.scrollToOffset({ offset: next * (BANNER_WIDTH + 12), animated: true });
        return next;
      });
    }, 3500);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    // Capture absolute end times for activeDealBookings ONCE when effect starts.
    // Computing endTime inside the interval caused it to reset every tick,
    // making the countdown always display the same value (never counting down).
    const bookingEndTimes: Record<string, number> = {};
    const now = Date.now();
    activeDealBookings.forEach(d => {
      bookingEndTimes[d.id] = now + d.endsInHours * 3600000;
    });

    const timer = setInterval(() => {
      const tick = Date.now();
      const display: Record<string, string> = {};
      dealCountdown.forEach(d => {
        const diff = Math.max(0, d.endTime - tick);
        const h = Math.floor(diff / 3600000);
        const m = Math.floor((diff % 3600000) / 60000);
        const s = Math.floor((diff % 60000) / 1000);
        display[d.id] = `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
      });
      activeDealBookings.forEach(d => {
        const diff = Math.max(0, (bookingEndTimes[d.id] ?? 0) - tick);
        const h = Math.floor(diff / 3600000);
        const m = Math.floor((diff % 3600000) / 60000);
        const s = Math.floor((diff % 60000) / 1000);
        display[d.id] = `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
      });
      setCountdownDisplay(display);
    }, 1000);
    return () => clearInterval(timer);
  }, [dealCountdown, activeDealBookings]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    reloadVendors();
    loadHomeContent();
    setTimeout(() => setRefreshing(false), 1500);
  }, [reloadVendors, loadHomeContent]);

  const doAiSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setAiResult(null);
      setAiSearching(false);
      return;
    }
    setAiSearching(true);
    setAiError(false);
    try {
      const baseUrl = getApiUrl();
      const url = new URL("/api/ai/search", baseUrl);
      const res = await fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: query.trim() }),
      });
      if (!res.ok) throw new Error("Search failed");
      const data = await res.json();
      setAiResult(data);
    } catch {
      setAiError(true);
      setAiResult(null);
    } finally {
      setAiSearching(false);
    }
  }, []);

  const handleSearchChange = useCallback((text: string) => {
    setSearchQuery(text);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (text.trim().length >= 2) {
      searchTimerRef.current = setTimeout(() => doAiSearch(text), 600);
    } else {
      setAiResult(null);
      setAiSearching(false);
    }
  }, [doAiSearch]);

  const handleQuickSuggestion = useCallback((suggestion: string) => {
    try { Haptics.selectionAsync(); } catch {}
    setSearchQuery(suggestion);
    doAiSearch(suggestion);
  }, [doAiSearch]);

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return { products: [], vendors: [] };

    const sortProductsByVendorDistance = (prods: typeof products) => {
      return [...prods].sort((a, b) => {
        const vA = vendors.find((v) => v.id === a.vendorId);
        const vB = vendors.find((v) => v.id === b.vendorId);
        return parseDistance(vA?.distance || "999") - parseDistance(vB?.distance || "999");
      });
    };

    if (aiResult) {
      const pKeywords = aiResult.productKeywords || [];
      const sKeywords = aiResult.storeKeywords || [];

      const matchedProducts = products.filter((p) =>
        pKeywords.some((k) =>
          p.name.toLowerCase().includes(k.toLowerCase()) ||
          p.description.toLowerCase().includes(k.toLowerCase()) ||
          p.category.toLowerCase().includes(k.toLowerCase())
        )
      );
      const matchedVendors = allVendors.filter((v) =>
        sKeywords.some((k) =>
          v.name.toLowerCase().includes(k.toLowerCase()) ||
          v.description.toLowerCase().includes(k.toLowerCase())
        )
      );

      if (matchedProducts.length === 0 && matchedVendors.length === 0) {
        const q = searchQuery.toLowerCase();
        return {
          products: sortProductsByVendorDistance(products.filter((p) =>
            p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q) || p.category.toLowerCase().includes(q)
          )),
          vendors: sortVendorsByDistance(allVendors.filter((v) =>
            v.name.toLowerCase().includes(q) || v.description.toLowerCase().includes(q)
          )),
        };
      }

      return {
        products: sortProductsByVendorDistance(matchedProducts).slice(0, 20),
        vendors: sortVendorsByDistance(matchedVendors).slice(0, 10),
      };
    }

    const q = searchQuery.toLowerCase();
    const matchedProducts = products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q)
    );
    const matchedVendors = allVendors.filter(
      (v) =>
        v.name.toLowerCase().includes(q) ||
        v.description.toLowerCase().includes(q)
    );
    return {
      products: sortProductsByVendorDistance(matchedProducts),
      vendors: sortVendorsByDistance(matchedVendors),
    };
  }, [searchQuery, aiResult, allVendors]);

  const hasSearchResults = searchQuery.trim().length > 0;
  const totalResults = searchResults.products.length + searchResults.vendors.length;

  const unreadNotifCount = useMemo(
    () => countUnreadNotifications(orders, appNotifications, new Set(readNotifIds)),
    [orders, appNotifications, readNotifIds]
  );

  const trendingProducts = useMemo(() => {
    const discounted = products.filter((p) => p.originalPrice);
    return discounted.length > 0 ? discounted : products.slice(0, 10);
  }, [products]);

  const recentProducts = useMemo(() => {
    if (!orders || orders.length === 0) return [];
    const seenIds = new Set<string>();
    const recent: typeof products = [];
    for (const order of [...orders].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())) {
      for (const item of order.items) {
        if (!seenIds.has(item.productId)) {
          seenIds.add(item.productId);
          const product = products.find((p) => p.id === item.productId);
          if (product) recent.push(product);
        }
        if (recent.length >= 8) break;
      }
      if (recent.length >= 8) break;
    }
    return recent;
  }, [orders, products]);

  const dealProducts = useMemo(() => {
    return products.filter((p) => p.originalPrice && p.originalPrice > p.price).slice(0, 10);
  }, [products]);

  const recommendedProducts = useMemo(() => {
    if (!orders || orders.length === 0) return [];
    const orderedCategoryIds = new Set<string>();
    const orderedVendorIds = new Set<string>();
    orders.forEach(o => {
      o.items?.forEach(item => {
        const prod = products.find(p => p.id === item.productId);
        if (prod) {
          orderedCategoryIds.add(prod.category);
          orderedVendorIds.add(prod.vendorId);
        }
      });
    });
    const orderedProductIds = new Set(orders.flatMap(o => o.items?.map(i => i.productId) || []));
    const recs = products
      .filter(p => !orderedProductIds.has(p.id))
      .filter(p => orderedCategoryIds.has(p.category) || orderedVendorIds.has(p.vendorId))
      .slice(0, 10);
    return recs.length > 4 ? recs : products.filter(p => !orderedProductIds.has(p.id)).slice(0, 8);
  }, [orders]);

  const sortedVendors = useMemo(() => sortVendorsByDistance(allVendors), [allVendors]);

  const infiniteVendors = useMemo(() => {
    if (sortedVendors.length === 0) return [];
    return sortedVendors
      .slice(0, visibleStoreCount)
      .map((vendor) => ({ ...vendor, _key: vendor.id }));
  }, [visibleStoreCount, sortedVendors]);

  // Group vendors by their main category for the category-wise home display
  const vendorsByCategory = useMemo(() => {
    return displayCategories
      .map((cat) => ({
        ...cat,
        vendors: sortedVendors.filter((v) => v.categoryId === cat.id),
      }))
      .filter((group) => group.vendors.length > 0);
  }, [sortedVendors, displayCategories]);

  const handleLoadMoreStores = () => {
    if (loadingMore || visibleStoreCount >= sortedVendors.length) return;
    setLoadingMore(true);
    setTimeout(() => {
      setVisibleStoreCount((prev) => prev + 5);
      setLoadingMore(false);
    }, 600);
  };

  const handleScroll = (e: any) => {
    const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
    const currentY = contentOffset.y;
    const distanceFromBottom = contentSize.height - layoutMeasurement.height - currentY;

    if (currentY > 50 && currentY > lastScrollY.current + 5) {
      hideTabBar();
      if (!headerHidden.current) {
        headerHidden.current = true;
        Animated.timing(headerTranslateY, {
          toValue: -headerHeight,
          duration: 220,
          useNativeDriver: true,
        }).start();
      }
    } else if (currentY < lastScrollY.current - 5 || currentY <= 10) {
      showTabBar();
      if (headerHidden.current) {
        headerHidden.current = false;
        Animated.timing(headerTranslateY, {
          toValue: 0,
          duration: 220,
          useNativeDriver: true,
        }).start();
      }
    }
    lastScrollY.current = currentY;

    if (distanceFromBottom < 300 && !loadingMore && !hasSearchResults) {
      handleLoadMoreStores();
    }
  };

  const handleServicePill = (id: string) => {
    try { Haptics.selectionAsync(); } catch {}
    if (id === "gobharat") return;
    if (id === "b2b") router.push("/category/1" as any);
    if (id === "services") router.push("/category/3" as any);
    if (id === "manpower") router.push("/category/4" as any);
  };

  const handleQuickCat = (catId: string) => {
    setActiveQuickCat(catId);
    if (catId === "foryou") return;
    router.push(`/all-categories?catId=${catId}` as any);
  };

  const userName = user?.name || "User";
  const firstName = userName.split(" ")[0];

  return (
    <View style={styles.container}>
      <Animated.View
        style={[styles.headerWrapper, { transform: [{ translateY: headerTranslateY }] }]}
        onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}
      >
      <LinearGradient colors={GRADIENTS.saffron} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.topHeader, { paddingTop: topInset + 8 + bannerExtraPadding }]}>
        <View style={styles.addressBarRow}>
          <Pressable style={styles.headerLogoPressable} onPress={() => { mainScrollRef.current?.scrollTo({ y: 0, animated: true }); try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {} }}>
            <Animated.View style={{ transform: [{ scale: logoScale }], opacity: logoGlow }}>
              <View style={styles.headerLogoWrap}>
                <Image
                  source={require("@/assets/images/go-bharat-logo-nobg.png")}
                  style={styles.headerLogoImg}
                  contentFit="contain"
                  accessibilityLabel="Go Bharat"
                />
              </View>
            </Animated.View>
          </Pressable>

          <PressableScale style={styles.addressBarFlex} onPress={() => { setPinInput(customerPinCode); setShowLocationPicker(true); }}>
            <View style={styles.addressEyebrowRow}>
              <Ionicons name="location-sharp" size={11} color="rgba(255,255,255,0.85)" />
              <Text style={styles.addressEyebrow}>DELIVER TO</Text>
            </View>
            <View style={styles.addressValueRow}>
              <Text style={styles.addressValue} numberOfLines={1}>
                {selectedPin ? `${selectedLocation} · ${selectedPin}` : selectedLocation}
              </Text>
              <Ionicons name="chevron-down" size={15} color="#FFF" />
            </View>
          </PressableScale>

          <View style={styles.headerActions}>
            <PressableScale style={styles.headerIconBtn} onPress={() => router.push("/wallet" as any)}>
              <Ionicons name="wallet-outline" size={20} color="#FFF" />
            </PressableScale>
            <PressableScale style={styles.headerIconBtn} onPress={() => router.push("/notifications" as any)}>
              <Ionicons name="notifications-outline" size={20} color="#FFF" />
              {unreadNotifCount > 0 && (
                <View style={{ position: "absolute", top: 2, right: 2, backgroundColor: "#EF4444", borderRadius: 6, minWidth: 14, height: 14, alignItems: "center", justifyContent: "center", paddingHorizontal: 2 }}>
                  <Text style={{ fontFamily: "Poppins_700Bold", fontSize: 9, color: "#FFF" }}>{unreadNotifCount > 9 ? "9+" : unreadNotifCount}</Text>
                </View>
              )}
            </PressableScale>
          </View>
        </View>

        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color="#9AA0A6" />
          <TextInput
            ref={searchInputRef}
            style={styles.searchInput}
            placeholder={t("search", language)}
            placeholderTextColor="#9AA0A6"
            value={searchQuery}
            onChangeText={handleSearchChange}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setTimeout(() => setSearchFocused(false), 200)}
          />
          {aiSearching ? (
            <ActivityIndicator size="small" color={Colors.primary} />
          ) : searchQuery.length > 0 ? (
            <Pressable onPress={() => { setSearchQuery(""); setAiResult(null); setSearchFocused(false); }} hitSlop={8}>
              <Ionicons name="close" size={20} color="#70757A" />
            </Pressable>
          ) : (
            <LinearGradient colors={GRADIENTS.navy} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.aiPill}>
              <MaterialCommunityIcons name="robot-outline" size={13} color="#FFB74D" />
              <Text style={styles.aiPillText}>AI</Text>
            </LinearGradient>
          )}
        </View>
      </LinearGradient>
      </Animated.View>

      {searchFocused && !hasSearchResults ? (
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: headerHeight, paddingBottom: 100 }}>
          <View style={styles.aiSuggestHeader}>
            <MaterialCommunityIcons name="robot-happy-outline" size={20} color={Colors.primary} />
            <Text style={styles.aiSuggestTitle}>Try asking AI</Text>
          </View>
          <View style={styles.quickSuggestions}>
            {AI_QUICK_SUGGESTIONS.map((s, i) => (
              <PressableScale key={i} style={styles.quickSuggestChip} onPress={() => handleQuickSuggestion(s)}>
                <Ionicons name="sparkles" size={14} color={Colors.primary} />
                <Text style={styles.quickSuggestText}>{s}</Text>
              </PressableScale>
            ))}
          </View>
          <View style={styles.aiHintBox}>
            <Text style={styles.aiHintTitle}>Smart Search Tips</Text>
            <View style={styles.aiHintItem}>
              <Ionicons name="chatbubble-outline" size={14} color={Colors.textSecondary} />
              <Text style={styles.aiHintText}>Use natural language: "something for headache"</Text>
            </View>
            <View style={styles.aiHintItem}>
              <Ionicons name="pricetag-outline" size={14} color={Colors.textSecondary} />
              <Text style={styles.aiHintText}>Ask for deals: "cheapest electronics"</Text>
            </View>
            <View style={styles.aiHintItem}>
              <Ionicons name="restaurant-outline" size={14} color={Colors.textSecondary} />
              <Text style={styles.aiHintText}>Be specific: "spicy snacks near me"</Text>
            </View>
          </View>
        </ScrollView>
      ) : hasSearchResults ? (
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: headerHeight, paddingBottom: 100 }}>
          {aiResult?.interpretation && (
            <View style={styles.aiInterpretBar}>
              <MaterialCommunityIcons name="robot-outline" size={16} color={Colors.primary} />
              <Text style={styles.aiInterpretText}>{aiResult.interpretation}</Text>
            </View>
          )}
          {aiSearching && (
            <View style={styles.aiThinkingBar}>
              <ActivityIndicator size="small" color={Colors.primary} />
              <Text style={styles.aiThinkingText}>AI is thinking...</Text>
            </View>
          )}
          <View style={styles.searchHeader}>
            <Text style={styles.searchHeaderText}>
              {totalResults} result{totalResults !== 1 ? "s" : ""} for "{searchQuery}"
            </Text>
          </View>
          {searchResults.vendors.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Stores</Text>
              {searchResults.vendors.slice(0, 10).map((v) => (
                <SearchResultVendor key={v.id} vendor={v} />
              ))}
            </View>
          )}
          {searchResults.products.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Products</Text>
              {searchResults.products.slice(0, 15).map((p) => (
                <SearchResultItem key={p.id} product={p} />
              ))}
            </View>
          )}
          {aiResult?.suggestions && aiResult.suggestions.length > 0 && (
            <View style={styles.aiSuggestionsSection}>
              <Text style={styles.aiSuggestionsLabel}>Related searches</Text>
              <View style={styles.quickSuggestions}>
                {aiResult.suggestions.map((s, i) => (
                  <PressableScale key={i} style={styles.quickSuggestChip} onPress={() => handleQuickSuggestion(s)}>
                    <Ionicons name="search" size={13} color={Colors.primary} />
                    <Text style={styles.quickSuggestText}>{s}</Text>
                  </PressableScale>
                ))}
              </View>
            </View>
          )}
          {totalResults === 0 && !aiSearching && (
            <View style={styles.emptySearch}>
              <MaterialCommunityIcons name="robot-confused-outline" size={48} color={Colors.textLight} />
              <Text style={styles.emptySearchTitle}>No results found</Text>
              <Text style={styles.emptySearchText}>Try a different search or ask AI differently</Text>
            </View>
          )}
        </ScrollView>
      ) : (
        <ScrollView
          ref={mainScrollRef}
          style={styles.content}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingTop: headerHeight, paddingBottom: 100 }}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              colors={["#FF6B00"]}
              tintColor="#FF6B00"
            />
          }
        >
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.quickCatRow}
          >
            {[{ id: "foryou", name: "For You", icon: "star-outline", color: Colors.primary }, ...displayCategories].map((cat) => {
              const catColor = (cat as any).color || Colors.primary;
              const isActive = activeQuickCat === cat.id;
              return (
              <PressableScale key={cat.id} haptic="light" style={styles.quickCatItem} onPress={() => handleQuickCat(cat.id)}>
                {isActive ? (
                  <LinearGradient colors={GRADIENTS.saffronCta} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.quickCatCircle, styles.quickCatCircleActive]}>
                    <Ionicons name={cat.icon as any} size={24} color="#FFF" />
                  </LinearGradient>
                ) : (
                  <View style={[styles.quickCatCircle, { backgroundColor: catColor + "14" }]}>
                    <Ionicons name={cat.icon as any} size={22} color={catColor} />
                  </View>
                )}
                <Text style={[styles.quickCatLabel, isActive && styles.quickCatLabelActive]} numberOfLines={1}>{cat.name}</Text>
                {isActive && <View style={styles.quickCatUnderline} />}
              </PressableScale>
              );
            })}
          </ScrollView>

          {allBanners.length > 0 && <View style={styles.bannerSection}>
            <FlatList
              ref={bannerRef}
              data={allBanners}
              horizontal
              pagingEnabled={false}
              snapToInterval={BANNER_WIDTH + 12}
              decelerationRate="fast"
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.bannerList}
              removeClippedSubviews
              maxToRenderPerBatch={3}
              windowSize={3}
              initialNumToRender={2}
              onMomentumScrollEnd={(e) => {
                const idx = Math.round(e.nativeEvent.contentOffset.x / (BANNER_WIDTH + 12));
                setActiveBanner(idx);
              }}
              renderItem={({ item, index }) => (
                <PressableScale
                  haptic="none"
                  onPress={() => {
                    try { Haptics.selectionAsync(); } catch {}
                    if ((item as any).isAd && (item as any).vendorId) {
                      router.push(`/store/${(item as any).vendorId}` as any);
                    } else {
                      const catId = BANNER_CATEGORY_MAP[item.id] || "2";
                      router.push(`/category/${catId}` as any);
                    }
                  }}
                >
                  {(item as any).image ? (
                    <View style={styles.bannerCard}>
                      <Image source={{ uri: (item as any).image }} style={StyleSheet.absoluteFill} contentFit="cover" transition={300} accessibilityLabel={(item as any).title || "Banner"} />
                      <LinearGradient
                        colors={["rgba(0,0,0,0.55)", "rgba(0,0,0,0.1)", "transparent"]}
                        start={{ x: 0, y: 1 }}
                        end={{ x: 0, y: 0 }}
                        style={StyleSheet.absoluteFill}
                      />
                      <View style={styles.bannerContentOverlay}>
                        <View style={styles.bannerBrandRow}>
                          <View style={[styles.bannerBrandPill, (item as any).isAd && { backgroundColor: "rgba(255,255,255,0.25)" }]}>
                            <Ionicons name={(item as any).isAd ? "megaphone" : "storefront"} size={10} color="#FFF" />
                            <Text style={styles.bannerBrandText}>{(item as any).isAd ? "Sponsored" : "Go Bharat"}</Text>
                          </View>
                        </View>
                        <Text style={styles.bannerTitle}>{item.title}</Text>
                        <Text style={styles.bannerSubtitle}>{item.subtitle}</Text>
                        {(item as any).offerText ? (
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 6 }}>
                            <Ionicons name="pricetag" size={10} color="#FFD700" />
                            <Text style={{ fontFamily: "Poppins_600SemiBold", fontSize: 11, color: "#FFD700" }}>{(item as any).offerText}</Text>
                          </View>
                        ) : null}
                        <View style={styles.bannerCta}>
                          <Text style={styles.bannerCtaText}>{(item as any).isAd ? "Visit Store" : ((item as any).ctaText || t("shopNow", language))}</Text>
                          <Ionicons name="arrow-forward" size={12} color="#FFF" />
                        </View>
                      </View>
                    </View>
                  ) : (
                  <LinearGradient
                    colors={
                      item.color === "#0B1E3D"
                        ? ["#0B1E3D", "#1A3A6B"]
                        : item.color === "#8B5CF6"
                        ? ["#7C3AED", "#A78BFA"]
                        : item.color === "#10B981"
                        ? ["#059669", "#34D399"]
                        : item.color === "#3B82F6"
                        ? ["#2563EB", "#60A5FA"]
                        : ["#EA580C", "#FB923C"]
                    }
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.bannerCard}
                  >
                    <View style={styles.bannerContent}>
                      <View style={styles.bannerBrandRow}>
                        <View style={[styles.bannerBrandPill, (item as any).isAd && { backgroundColor: "rgba(255,255,255,0.25)" }]}>
                          <Ionicons name={(item as any).isAd ? "megaphone" : "storefront"} size={10} color="#FFF" />
                          <Text style={styles.bannerBrandText}>{(item as any).isAd ? "Sponsored" : "Go Bharat"}</Text>
                        </View>
                      </View>
                      <Text style={styles.bannerTitle}>{item.title}</Text>
                      <Text style={styles.bannerSubtitle}>{item.subtitle}</Text>
                      {(item as any).offerText ? (
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 6 }}>
                          <Ionicons name="pricetag" size={10} color="#FFD700" />
                          <Text style={{ fontFamily: "Poppins_600SemiBold", fontSize: 11, color: "#FFD700" }}>{(item as any).offerText}</Text>
                        </View>
                      ) : null}
                      <View style={styles.bannerCta}>
                        <Text style={styles.bannerCtaText}>{(item as any).isAd ? "Visit Store" : ((item as any).ctaText || t("shopNow", language))}</Text>
                        <Ionicons name="arrow-forward" size={12} color="#FFF" />
                      </View>
                    </View>
                    <View style={styles.bannerGraphic}>
                      <Ionicons
                        name={(item as any).isAd ? "megaphone" : index === 0 ? "pricetag" : index === 1 ? "bicycle" : index === 2 ? "shirt" : index === 3 ? "leaf" : "hardware-chip"}
                        size={64}
                        color="rgba(255,255,255,0.12)"
                      />
                    </View>
                  </LinearGradient>
                  )}
                </PressableScale>
              )}
              keyExtractor={(item) => item.id}
            />
            <View style={styles.dotsRow}>
              {allBanners.map((_, i) => (
                <View key={i} style={[styles.dot, activeBanner === i && styles.dotActive]} />
              ))}
            </View>
          </View>}

          {liveSessions.filter(s => s.status === "LIVE").length > 0 && (
            <View style={{ marginHorizontal: 16, marginBottom: 16 }}>
              <Pressable onPress={() => router.push("/live-shopping" as any)} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: "#EF4444", alignItems: "center", justifyContent: "center" }}>
                    <Ionicons name="radio" size={16} color="#FFF" />
                  </View>
                  <Text style={{ fontFamily: "Poppins_700Bold", fontSize: 17, color: Colors.text }}>Live Shopping</Text>
                  <View style={{ backgroundColor: "#EF4444", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                    <Text style={{ fontFamily: "Poppins_600SemiBold", fontSize: 9, color: "#FFF" }}>LIVE</Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={18} color={Colors.textLight} />
              </Pressable>
              <FlatList
                data={liveSessions.filter(s => s.status === "LIVE").slice(0, 5)}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 12 }}
                removeClippedSubviews
                maxToRenderPerBatch={3}
                windowSize={3}
                initialNumToRender={3}
                renderItem={({ item }) => (
                  <Pressable onPress={() => router.push({ pathname: "/live-shopping", params: { sessionId: item.id } } as any)} style={{ width: 200, borderRadius: 14, overflow: "hidden", backgroundColor: "#000" }}>
                    <Image source={{ uri: item.thumbnail }} style={{ width: 200, height: 120 }} accessibilityLabel={item.title || "Live session"} />
                    <View style={{ position: "absolute", top: 8, left: 8, flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: "#EF4444", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, gap: 3 }}>
                        <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: "#FFF" }} />
                        <Text style={{ fontFamily: "Poppins_600SemiBold", fontSize: 9, color: "#FFF" }}>LIVE</Text>
                      </View>
                      <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: "rgba(0,0,0,0.6)", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, gap: 3 }}>
                        <Ionicons name="eye" size={10} color="#FFF" />
                        <Text style={{ fontFamily: "Poppins_500Medium", fontSize: 9, color: "#FFF" }}>{item.viewers}</Text>
                      </View>
                    </View>
                    <View style={{ padding: 10, backgroundColor: "#FFF" }}>
                      <Text style={{ fontFamily: "Poppins_600SemiBold", fontSize: 12, color: Colors.text }} numberOfLines={1}>{item.title}</Text>
                      <Text style={{ fontFamily: "Poppins_400Regular", fontSize: 10, color: Colors.textLight }} numberOfLines={1}>{item.vendorName}</Text>
                    </View>
                  </Pressable>
                )}
                keyExtractor={(item) => item.id}
              />
            </View>
          )}

          {mergedDeals.length > 0 && (
            <View style={styles.dailyDealsSection}>
              <LinearGradient colors={GRADIENTS.ember} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.dailyDealsHeader}>
                <View style={styles.dailyDealsLeft}>
                  <View style={styles.dailyDealsFlashBadge}>
                    <Ionicons name="flash" size={16} color="#FF3D3D" />
                  </View>
                  <Text style={styles.dailyDealsTitle}>Daily Deals</Text>
                </View>
                <View style={styles.dailyDealsTimer}>
                  <Ionicons name="time-outline" size={14} color="#FFD700" />
                  <Text style={styles.dailyDealsTimerText}>Limited Time</Text>
                </View>
              </LinearGradient>
              <FlatList
                data={mergedDeals}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 12, gap: 10 }}
                removeClippedSubviews
                maxToRenderPerBatch={4}
                windowSize={3}
                initialNumToRender={3}
                renderItem={({ item }) => {
                  const discPct = Math.round(((item.originalPrice - item.price) / item.originalPrice) * 100);
                  const soldPct = Math.round((item.sold / item.total) * 100);
                  return (
                    <PressableScale style={styles.dealCard} haptic="none" onPress={() => {
                      try { Haptics.selectionAsync(); } catch {}
                      router.push(`/product/${item.productId}` as any);
                    }}>
                      <View style={styles.dealImageWrap}>
                        <Image source={{ uri: item.image }} style={styles.dealImage} contentFit="cover" transition={200} accessibilityLabel={item.name} />
                        <LinearGradient colors={GRADIENTS.ember} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.dealDiscBadge}>
                          <Text style={styles.dealDiscText}>{discPct}% OFF</Text>
                        </LinearGradient>
                      </View>
                      <Text style={styles.dealName} numberOfLines={1}>{item.name}</Text>
                      <View style={styles.dealPriceRow}>
                        <Text style={styles.dealPrice}>{"\u20B9"}{item.price}</Text>
                        <Text style={styles.dealOrigPrice}>{"\u20B9"}{item.originalPrice}</Text>
                      </View>
                      <View style={styles.dealCountdownRow}>
                        <Ionicons name="time" size={12} color="#EF4444" />
                        <Text style={styles.dealCountdownText}>{countdownDisplay[item.id] || "--:--:--"}</Text>
                      </View>
                      <View style={styles.dealProgressWrap}>
                        <View style={styles.dealProgressTrack}>
                          <View style={[styles.dealProgressFill, { width: `${soldPct}%` }]} />
                        </View>
                        <Text style={styles.dealSoldText}>{item.sold}/{item.total} sold</Text>
                      </View>
                    </PressableScale>
                  );
                }}
                keyExtractor={(item) => item.id}
              />
            </View>
          )}

          {recentProducts.length > 0 && (
            <View style={styles.sectionCard}>
              <Text style={styles.sectionCardTitle}>{firstName}, still looking for these?</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.recentRow}>
                {recentProducts.map((p) => (
                  <PressableScale key={p.id} style={styles.recentItem} onPress={() => {
                    router.push(`/product/${p.id}` as any);
                  }}>
                    <Image source={{ uri: p.image }} style={styles.recentImage} contentFit="cover" transition={200} accessibilityLabel={p.name} />
                    <Text style={styles.recentName} numberOfLines={2}>{p.name}</Text>
                  </PressableScale>
                ))}
              </ScrollView>
            </View>
          )}

          <View style={styles.categoryGridSection}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12, paddingRight: 16 }}>
              <Text style={[styles.sectionTitleFlat, { marginBottom: 0 }]}>{t("categories", language)}</Text>
              <PressableScale onPress={() => { router.push("/all-categories" as any); }}>
                <Text style={styles.seeAll}>See All</Text>
              </PressableScale>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.categoryScrollContent}
            >
              {displayCategories.map((cat) => {
                const color = cat.color || "#6B7280";
                return (
                  <PressableScale key={cat.id} style={styles.categoryTile} onPress={() => {
                    router.push(`/all-categories?catId=${cat.id}` as any);
                  }}>
                    <LinearGradient
                      colors={[color, color + "CC"]}
                      style={styles.categoryTileIcon}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                    >
                      <Ionicons name={cat.icon as any} size={32} color="#FFF" />
                    </LinearGradient>
                    <Text style={styles.categoryTileName} numberOfLines={2}>{cat.name}</Text>
                  </PressableScale>
                );
              })}
            </ScrollView>
          </View>

          {(() => {
            const activePromo = promoMedia.filter(m => m.isActive);
            if (activePromo.length > 0) {
              return (
                <View style={{ marginHorizontal: 16, marginBottom: 16 }}>
                  {activePromo.map((item) => (
                    <View key={item.id} style={{ borderRadius: 16, overflow: "hidden", marginBottom: 10 }}>
                      {item.type === "video" ? (
                        <Video
                          source={{ uri: item.uri }}
                          style={{ width: "100%", height: 180 }}
                          resizeMode={ResizeMode.COVER}
                          isLooping
                          isMuted
                          shouldPlay
                        />
                      ) : (
                        <Image source={{ uri: item.uri }} style={{ width: "100%", height: 180 }} contentFit="cover" accessibilityLabel="Promotional media" />
                      )}
                    </View>
                  ))}
                </View>
              );
            }
            return (
              <View style={styles.dealsBanner}>
                <Pressable onPress={() => { try { Haptics.selectionAsync(); } catch {} router.push("/category/2" as any); }}>
                  <LinearGradient colors={["#EA580C", "#F97316"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.dealGradient}>
                    <View style={{ flex: 1 }}>
                      <View style={styles.adTag}>
                        <Ionicons name="flash" size={10} color="#FFF" />
                        <Text style={styles.adTagText}>MEGA SALE</Text>
                      </View>
                      <Text style={styles.dealTitle}>Up to 60% Off</Text>
                      <Text style={styles.dealSub}>Electronics, Fashion & Groceries</Text>
                      <View style={styles.dealCta}>
                        <Text style={styles.dealCtaText}>{t("shopNow", language)}</Text>
                        <Ionicons name="arrow-forward" size={12} color={Colors.primary} />
                      </View>
                    </View>
                    <Ionicons name="flash" size={52} color="rgba(255,255,255,0.15)" />
                  </LinearGradient>
                </Pressable>
              </View>
            );
          })()}

          {dealProducts.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitleFlat}>{t("trendingProducts", language)}</Text>
                <Pressable onPress={() => setShowAllTrending(!showAllTrending)}>
                  <Text style={styles.seeAll}>{showAllTrending ? "Show Less" : t("viewAll", language)}</Text>
                </Pressable>
              </View>
              {showAllTrending ? (
                <View style={styles.productGrid}>
                  {trendingProducts.map((p) => {
                    const vendor = vendors.find((v) => v.id === p.vendorId);
                    const discPct = p.originalPrice ? Math.round(((p.originalPrice - p.price) / p.originalPrice) * 100) : 0;
                    return (
                      <PressableScale key={p.id} style={styles.productCardGrid} onPress={() => {
                        router.push(`/product/${p.id}` as any);
                      }}>
                        <Image source={{ uri: p.image }} style={styles.productGridImage} contentFit="cover" transition={200} accessibilityLabel={p.name} />
                        {discPct > 0 && (
                          <View style={styles.discountTag}>
                            <Text style={styles.discountTagText}>{discPct}% OFF</Text>
                          </View>
                        )}
                        <View style={styles.productGridInfo}>
                          <Text style={styles.productGridName} numberOfLines={2}>{p.name}</Text>
                          <Text style={styles.productGridVendor} numberOfLines={1}>{vendor?.name}</Text>
                          <View style={styles.priceRow}>
                            <Text style={styles.productGridPrice}>{"\u20B9"}{p.price}</Text>
                            {p.originalPrice && <Text style={styles.productGridOrig}>{"\u20B9"}{p.originalPrice}</Text>}
                          </View>
                        </View>
                      </PressableScale>
                    );
                  })}
                </View>
              ) : (
                <FlatList
                  data={trendingProducts.slice(0, 6)}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ paddingHorizontal: 16 }}
                  ItemSeparatorComponent={() => <View style={{ width: 10 }} />}
                  removeClippedSubviews
                  maxToRenderPerBatch={4}
                  windowSize={3}
                  initialNumToRender={3}
                  renderItem={({ item }) => {
                    const vendor = vendors.find((v) => v.id === item.vendorId);
                    const discPct = item.originalPrice ? Math.round(((item.originalPrice - item.price) / item.originalPrice) * 100) : 0;
                    return (
                      <PressableScale style={styles.productCardH} onPress={() => {
                        router.push(`/product/${item.id}` as any);
                      }}>
                        <Image source={{ uri: item.image }} style={styles.productHImage} contentFit="cover" transition={200} accessibilityLabel={item.name} />
                        {discPct > 0 && (
                          <View style={styles.discountTag}>
                            <Text style={styles.discountTagText}>{discPct}% OFF</Text>
                          </View>
                        )}
                        <View style={styles.productHInfo}>
                          <Text style={styles.productHName} numberOfLines={1}>{item.name}</Text>
                          <Text style={styles.productHVendor} numberOfLines={1}>{vendor?.name}</Text>
                          <View style={styles.priceRow}>
                            <Text style={styles.productHPrice}>{"\u20B9"}{item.price}</Text>
                            {item.originalPrice && <Text style={styles.productHOrig}>{"\u20B9"}{item.originalPrice}</Text>}
                          </View>
                        </View>
                      </PressableScale>
                    );
                  }}
                  keyExtractor={(item) => item.id}
                />
              )}
            </View>
          )}

          <View style={styles.quickServices}>
            <PressableScale style={styles.quickServiceCard} onPress={() => { router.push("/category/1" as any); }}>
              <LinearGradient colors={["#2563EB", "#60A5FA"]} style={styles.quickServiceGradient}>
                <Ionicons name="business" size={24} color="rgba(255,255,255,0.25)" style={styles.qsIcon} />
                <Text style={styles.qsTitle}>B2B Deals</Text>
                <Text style={styles.qsSub}>Wholesale prices</Text>
              </LinearGradient>
            </PressableScale>
            <PressableScale style={styles.quickServiceCard} onPress={() => { router.push("/category/3" as any); }}>
              <LinearGradient colors={["#7C3AED", "#A78BFA"]} style={styles.quickServiceGradient}>
                <Ionicons name="construct" size={24} color="rgba(255,255,255,0.25)" style={styles.qsIcon} />
                <Text style={styles.qsTitle}>Services</Text>
                <Text style={styles.qsSub}>Book experts</Text>
              </LinearGradient>
            </PressableScale>
            <PressableScale style={styles.quickServiceCard} onPress={() => { router.push("/category/4" as any); }}>
              <LinearGradient colors={["#059669", "#34D399"]} style={styles.quickServiceGradient}>
                <Ionicons name="people" size={24} color="rgba(255,255,255,0.25)" style={styles.qsIcon} />
                <Text style={styles.qsTitle}>Manpower</Text>
                <Text style={styles.qsSub}>Hire workers</Text>
              </LinearGradient>
            </PressableScale>
          </View>

          {(() => {
            const featuredAd = adRequests.find(a => a.status === "LIVE" && (a.slotType === "FEATURED" || a.slotType === "SPOTLIGHT"));
            const adTitle = featuredAd ? featuredAd.title : "Free Delivery Today";
            const adSub = featuredAd ? featuredAd.subtitle : "No minimum order on all stores near you";
            const adColor = featuredAd?.color || "#0B1E3D";
            return (
              <Pressable style={styles.sponsoredBanner} onPress={() => {
                try { Haptics.selectionAsync(); } catch {}
                if (featuredAd) { router.push(`/store/${featuredAd.vendorId}` as any); }
                else { router.push("/category/2" as any); }
              }}>
                <LinearGradient
                  colors={adColor === "#0B1E3D" ? ["#0B1E3D", "#1A3A6B"] : adColor === "#8B5CF6" ? ["#7C3AED", "#A78BFA"] : adColor === "#10B981" ? ["#059669", "#34D399"] : ["#EA580C", "#FB923C"]}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.sponsoredGradient}>
                  <View style={{ flex: 1 }}>
                    <View style={[styles.adTag, { backgroundColor: "#F59E0B" }]}>
                      <Text style={[styles.adTagText, { color: "#78350F" }]}>SPONSORED</Text>
                    </View>
                    <Text style={styles.sponsoredTitle}>{adTitle}</Text>
                    <Text style={styles.sponsoredSub}>{adSub}</Text>
                    {featuredAd?.offerText ? (
                      <Text style={{ fontFamily: "Poppins_600SemiBold", fontSize: 12, color: "#FFD700", marginBottom: 6 }}>{featuredAd.offerText}</Text>
                    ) : null}
                    <View style={[styles.dealCta, { backgroundColor: "#FFF" }]}>
                      <Text style={[styles.dealCtaText, { color: "#0B1E3D" }]}>{featuredAd ? "Visit Store" : "Order Now"}</Text>
                      <Ionicons name="arrow-forward" size={12} color="#0B1E3D" />
                    </View>
                  </View>
                  <Ionicons name={featuredAd ? "megaphone" : "bicycle"} size={48} color="rgba(255,255,255,0.12)" />
                </LinearGradient>
              </Pressable>
            );
          })()}

          {recommendedProducts.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Ionicons name="sparkles" size={18} color={Colors.primary} />
                  <Text style={styles.sectionTitleFlat}>Recommended For You</Text>
                </View>
              </View>
              <FlatList
                data={recommendedProducts}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 16 }}
                ItemSeparatorComponent={() => <View style={{ width: 10 }} />}
                removeClippedSubviews
                maxToRenderPerBatch={4}
                windowSize={3}
                initialNumToRender={3}
                renderItem={({ item }) => {
                  const vendor = vendors.find((v) => v.id === item.vendorId);
                  const discPct = item.originalPrice ? Math.round(((item.originalPrice - item.price) / item.originalPrice) * 100) : 0;
                  return (
                    <PressableScale style={styles.recCard} onPress={() => {
                      router.push(`/product/${item.id}` as any);
                    }}>
                      <Image source={{ uri: item.image }} style={styles.recImage} contentFit="cover" transition={200} accessibilityLabel={item.name} />
                      {discPct > 0 && (
                        <View style={styles.recDiscBadge}>
                          <Text style={styles.recDiscText}>{discPct}% OFF</Text>
                        </View>
                      )}
                      <View style={styles.recInfo}>
                        <Text style={styles.recName} numberOfLines={2}>{item.name}</Text>
                        {vendor && <Text style={styles.recVendor} numberOfLines={1}>{vendor.name}</Text>}
                        <View style={styles.recPriceRow}>
                          <Text style={styles.recPrice}>{"\u20B9"}{item.price}</Text>
                          {item.originalPrice && <Text style={styles.recOrigPrice}>{"\u20B9"}{item.originalPrice}</Text>}
                        </View>
                        <View style={styles.recRatingRow}>
                          <Ionicons name="star" size={12} color="#F59E0B" />
                          <Text style={styles.recRating}>{item.rating || "4.5"}</Text>
                        </View>
                      </View>
                    </PressableScale>
                  );
                }}
                keyExtractor={(item) => item.id}
              />
            </View>
          )}

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitleFlat}>Customer Stories</Text>
              <PressableScale onPress={() => {
                router.push("/submit-story" as any);
              }}>
                <View style={styles.shareStoryBtn}>
                  <Ionicons name="add-circle" size={16} color={Colors.primary} />
                  <Text style={styles.shareStoryText}>Share Yours</Text>
                </View>
              </PressableScale>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, gap: 12 }}>
              {customerStories.slice(0, 8).map((story) => (
                <PressableScale key={story.id} style={styles.storyCard} onPress={() => {
                  if (story.vendorId) router.push(`/store/${story.vendorId}` as any);
                }}>
                  {story.photos.length > 0 && (
                    <Image source={{ uri: story.photos[0] }} style={styles.storyPhoto} contentFit="cover" transition={200} accessibilityLabel={`${story.userName}'s story`} />
                  )}
                  <View style={styles.storyContent}>
                    <View style={styles.storyUserRow}>
                      <View style={styles.storyAvatar}>
                        <Text style={styles.storyAvatarText}>{story.userName.charAt(0)}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.storyUserName} numberOfLines={1}>{story.userName}</Text>
                        <Text style={styles.storyLocation}>{story.location}</Text>
                      </View>
                    </View>
                    <View style={styles.storyStars}>
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Ionicons key={s} name={s <= story.rating ? "star" : "star-outline"} size={12} color="#F59E0B" />
                      ))}
                    </View>
                    <Text style={styles.storyTitle} numberOfLines={1}>{story.title}</Text>
                    <Text style={styles.storyText} numberOfLines={2}>{story.story}</Text>
                    {story.vendorName ? (
                      <View style={styles.storyVendorTag}>
                        <Ionicons name="storefront-outline" size={11} color={Colors.primary} />
                        <Text style={styles.storyVendorName} numberOfLines={1}>{story.vendorName}</Text>
                      </View>
                    ) : null}
                    <View style={styles.storyFooter}>
                      <PressableScale haptic="light" style={styles.storyLikeBtn} onPress={(e) => {
                        e?.stopPropagation?.();
                        toggleStoryLike(story.id);
                      }}>
                        <Ionicons name={story.isLiked ? "heart" : "heart-outline"} size={14} color={story.isLiked ? "#EF4444" : Colors.textSecondary} />
                        <Text style={[styles.storyLikeCount, story.isLiked && { color: "#EF4444" }]}>{story.likes}</Text>
                      </PressableScale>
                      <Text style={styles.storyTimeAgo}>
                        {Math.floor((Date.now() - new Date(story.createdAt).getTime()) / (24 * 60 * 60 * 1000))}d ago
                      </Text>
                    </View>
                  </View>
                </PressableScale>
              ))}
            </ScrollView>
          </View>

          {/* Become a Vendor Banner */}
          <PressableScale
            haptic="medium"
            style={styles.vendorBanner}
            onPress={() => { router.push("/vendor-register" as any); }}
          >
            <LinearGradient colors={["#F97316", "#EA580C"]} style={styles.vendorBannerGradient}>
              <View style={styles.vendorBannerLeft}>
                <Text style={styles.vendorBannerTitle}>Grow Your Business</Text>
                <Text style={styles.vendorBannerSub}>Register as a vendor on Go Bharat and reach thousands of customers</Text>
                <View style={styles.vendorBannerCta}>
                  <Text style={styles.vendorBannerCtaText}>Apply Now</Text>
                  <Ionicons name="arrow-forward" size={14} color="#EA580C" />
                </View>
              </View>
              <View style={styles.vendorBannerIcon}>
                <Ionicons name="storefront" size={36} color="rgba(255,255,255,0.9)" />
              </View>
            </LinearGradient>
          </PressableScale>

          {/* Top Products Section */}
          {topProducts.length > 0 && (
            <View style={{ marginBottom: 8 }}>
              <View style={[styles.sectionHeader, { paddingHorizontal: 20 }]}>
                <Text style={styles.sectionTitleFlat}>Top Products</Text>
                <PressableScale onPress={() => {
                  router.navigate("/(customer)/explore" as any);
                }}>
                  <Text style={styles.seeAll}>View All</Text>
                </PressableScale>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 12, paddingVertical: 4 }}>
                {topProducts.map((product) => (
                  <PressableScale
                    key={product.id}
                    style={styles.topProductCard}
                    onPress={() => {
                      router.push(`/store/${product.vendorId}` as any);
                    }}
                  >
                    {/* Discount badge */}
                    {product.originalPrice && product.originalPrice > product.price && (
                      <View style={styles.topProductBadge}>
                        <Text style={styles.topProductBadgeText}>
                          -{Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)}%
                        </Text>
                      </View>
                    )}
                    {/* Product image → self-healing (retries before fallback) */}
                    <ProductImage
                      productId={product.id}
                      name={product.name}
                      style={styles.topProductIcon}
                      fallbackStyle={[styles.topProductIcon, styles.topProductFallback]}
                      fallbackIcon="fast-food-outline"
                      iconSize={36}
                    />
                    <View style={styles.topProductBody}>
                      <Text style={styles.topProductName} numberOfLines={2}>{product.name}</Text>
                      {product.category ? (
                        <Text style={styles.topProductCat} numberOfLines={1}>{product.category}</Text>
                      ) : null}
                      <View style={styles.topProductPriceRow}>
                        <Text style={styles.topProductPrice}>₹{product.price}</Text>
                        {product.originalPrice && product.originalPrice > product.price ? (
                          <Text style={styles.topProductMrp}>₹{product.originalPrice}</Text>
                        ) : null}
                      </View>
                      <Text style={styles.topProductVendor} numberOfLines={1}>{product.vendorName}</Text>
                    </View>
                  </PressableScale>
                ))}
              </ScrollView>
            </View>
          )}


          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitleFlat}>{t("topStores", language)}</Text>
              <Pressable onPress={() => {
                try { Haptics.selectionAsync(); } catch {}
                router.navigate("/(customer)/explore" as any);
              }}>
                <Text style={styles.seeAll}>{t("viewAll", language)}</Text>
              </Pressable>
            </View>

            {liveVendors.length === 0 && (
              <View style={{ paddingVertical: 24, alignItems: "center", gap: 10 }}>
                <ActivityIndicator size="large" color={Colors.primary} />
                <Text style={{ fontFamily: "Poppins_400Regular", fontSize: 14, color: Colors.textLight }}>Loading stores...</Text>
              </View>
            )}

            {isAreaEmptyFallback && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#FFF4EC", borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12, marginBottom: 10 }}>
                <Ionicons name="information-circle-outline" size={18} color={Colors.primary} />
                <Text style={{ flex: 1, fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.text }}>
                  No shops in {selectedLocation} yet — showing shops from all areas.
                </Text>
                <Pressable onPress={() => { setCustomerPinCode(""); setSelectedLocation("All Areas"); }}>
                  <Text style={{ fontFamily: "Poppins_600SemiBold", fontSize: 12, color: Colors.primary }}>All areas</Text>
                </Pressable>
              </View>
            )}

            {vendorsByCategory.map((group) => (
              <View key={group.id} style={styles.catGroupSection}>
                {/* Category row header — bold pill style */}
                <View style={styles.catGroupHeader}>
                  <LinearGradient
                    colors={[group.color + "22", group.color + "08"]}
                    style={styles.catGroupPill}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  >
                    <View style={[styles.catGroupAccent, { backgroundColor: group.color }]} />
                    <Text style={[styles.catGroupTitle, { color: group.color }]}>{group.name}</Text>
                    <View style={styles.catGroupBadge}>
                      <Text style={[styles.catGroupBadgeText, { color: group.color }]}>{group.vendors.length} stores</Text>
                    </View>
                  </LinearGradient>
                  <Pressable style={styles.catGroupSeeAllBtn} onPress={() => {
                    try { Haptics.selectionAsync(); } catch {}
                    router.push(`/all-categories?catId=${group.id}` as any);
                  }}>
                    <Text style={styles.catGroupSeeAll}>See All</Text>
                    <Ionicons name="chevron-forward" size={13} color={Colors.primary} />
                  </Pressable>
                </View>

                {/* Horizontal vendor cards — full-bleed image with gradient overlay */}
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.catGroupRow}
                >
                  {group.vendors.map((vendor, idx) => (
                    <PressableScale
                      haptic="none"
                      key={vendor.id}
                      style={styles.hVendorCard}
                      onPress={() => {
                        try { Haptics.selectionAsync(); } catch {}
                        router.push(`/store/${vendor.id}` as any);
                      }}
                    >
                      {/* Full-bleed image / placeholder */}
                      <View style={[styles.hVendorImageBox, { backgroundColor: vendorPlaceholderColor(vendor.name) }]}>
                        {/* Placeholder initial */}
                        <Text style={styles.hVendorInitial}>{(vendor.name || "?")[0].toUpperCase()}</Text>
                        {vendor.hasImage && (
                          <Image
                            source={{ uri: `${getApiUrl()}/api/vendors/${vendor.id}/image?d=${Math.floor(Date.now() / 86400000)}` }}
                            style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
                            contentFit="cover"
                            accessibilityLabel={vendor.name}
                          />
                        )}
                        {/* Dark gradient overlay for text legibility */}
                        <LinearGradient
                          colors={["transparent", "rgba(0,0,0,0.72)"]}
                          style={styles.hVendorOverlay}
                        >
                          {/* Store name + rating inside image */}
                          <Text style={styles.hVendorNameOverlay} numberOfLines={1}>{vendor.name}</Text>
                          <View style={styles.hVendorMetaOverlay}>
                            {[1,2,3,4,5].map((s) => (
                              <Ionicons key={s} name="star" size={10}
                                color={s <= Math.floor(vendor.rating ?? 0) ? "#FBBF24" : "rgba(255,255,255,0.35)"} />
                            ))}
                            <Text style={styles.hVendorRatingOverlay}>{vendor.rating ?? "—"}</Text>
                          </View>
                        </LinearGradient>
                        {/* Open/closed badge top-right */}
                        <View style={[styles.hVendorOpenBadge, { backgroundColor: vendor.isOpen ? "#10B981" : "#EF4444" }]}>
                          <View style={styles.hVendorOpenDot} />
                          <Text style={styles.hVendorOpenText}>{vendor.isOpen ? "Open" : "Closed"}</Text>
                        </View>
                        {/* Category chip top-left */}
                        <View style={[styles.hVendorCatChip, { backgroundColor: group.color }]}>
                          <Text style={styles.hVendorCatText} numberOfLines={1}>{group.name}</Text>
                        </View>
                        {/* Featured badge for first card */}
                        {idx === 0 && (
                          <View style={styles.hVendorFeaturedBadge}>
                            <Ionicons name="ribbon" size={9} color="#FFF" />
                            <Text style={styles.hVendorFeaturedText}>TOP</Text>
                          </View>
                        )}
                      </View>
                      {/* Distance strip */}
                      <View style={styles.hVendorDistRow}>
                        <Ionicons name="location" size={11} color={Colors.primary} />
                        <Text style={styles.hVendorDist} numberOfLines={1}>{vendor.distance}</Text>
                        <Ionicons name="chevron-forward" size={12} color={Colors.textSecondary} />
                      </View>
                    </PressableScale>
                  ))}
                </ScrollView>
              </View>
            ))}

            {/* Browse Products grid — ultra eye-catching */}
            {browseProducts.length > 0 && (
              <View style={styles.productsGridSection}>
                {/* Bold gradient section header */}
                <LinearGradient
                  colors={[Colors.primary, "#FF8C00"]}
                  style={styles.pgSectionHeader}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                >
                  <View style={styles.pgSectionHeaderLeft}>
                    <View style={styles.pgSectionIcon}>
                      <Ionicons name="grid" size={16} color={Colors.primary} />
                    </View>
                    <Text style={styles.pgSectionTitle}>Browse Products</Text>
                  </View>
                  <Pressable
                    style={styles.pgViewAllBtn}
                    onPress={() => {
                      try { Haptics.selectionAsync(); } catch {}
                      router.push("/all-products" as any);
                    }}
                  >
                    <Text style={styles.pgViewAllText}>View All</Text>
                    <Ionicons name="arrow-forward" size={13} color={Colors.primary} />
                  </Pressable>
                </LinearGradient>

                <View style={styles.productsGrid}>
                  {browseProducts.map((product, idx) => {
                    const hasDiscount = product.originalPrice && product.originalPrice > product.price;
                    const discountPct = hasDiscount
                      ? Math.round(((product.originalPrice! - product.price) / product.originalPrice!) * 100)
                      : 0;
                    return (
                      <PressableScale
                        haptic="none"
                        key={product.id}
                        style={styles.pgCard}
                        onPress={() => {
                          try { Haptics.selectionAsync(); } catch {}
                          router.push(`/store/${product.vendorId}` as any);
                        }}
                      >
                        {/* Product image — full bleed */}
                        <View style={styles.pgImageWrap}>
                          <ProductImage
                            productId={product.id}
                            name={product.name}
                            style={styles.pgImage}
                            fallbackStyle={[styles.pgImage, styles.pgImageFallback, { backgroundColor: Colors.primary + "18" }]}
                            fallbackIcon="cube-outline"
                            iconSize={38}
                          />
                          {/* Price gradient overlay at bottom of image */}
                          <LinearGradient
                            colors={["transparent", "rgba(0,0,0,0.78)"]}
                            style={styles.pgImageOverlay}
                          >
                            <Text style={styles.pgPriceOverlay}>₹{product.price.toLocaleString("en-IN")}</Text>
                            {hasDiscount && (
                              <Text style={styles.pgMrpOverlay}>₹{product.originalPrice!.toLocaleString("en-IN")}</Text>
                            )}
                          </LinearGradient>
                          {/* Discount ribbon — top-right */}
                          {hasDiscount && (
                            <View style={styles.pgRibbon}>
                              <Text style={styles.pgRibbonText}>{discountPct}%{"\n"}OFF</Text>
                            </View>
                          )}
                          {/* "NEW" badge for first 2 */}
                          {idx < 2 && !hasDiscount && (
                            <View style={styles.pgNewBadge}>
                              <Text style={styles.pgNewText}>NEW</Text>
                            </View>
                          )}
                        </View>

                        {/* Info area */}
                        <View style={styles.pgBody}>
                          <Text style={styles.pgName} numberOfLines={2}>{product.name}</Text>
                          <View style={styles.pgVendorRow}>
                            <Ionicons name="storefront-outline" size={10} color={Colors.textSecondary} />
                            <Text style={styles.pgVendor} numberOfLines={1}>{product.vendorName}</Text>
                          </View>
                        </View>
                        {/* Saffron accent line at bottom */}
                        <View style={[styles.pgAccentLine, { backgroundColor: Colors.primary }]} />
                      </PressableScale>
                    );
                  })}
                </View>
              </View>
            )}
          </View>
        </ScrollView>
      )}

      <Modal visible={showLocationPicker} transparent animationType="slide">
        <Pressable style={styles.modalOverlay} onPress={() => setShowLocationPicker(false)}>
          <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
            <View style={styles.modalHandle} />
            <View style={styles.modalTitleRow}>
              <Text style={styles.modalTitle}>Select Delivery Location</Text>
              <Pressable onPress={() => setShowLocationPicker(false)} testID="close-location">
                <Ionicons name="close" size={24} color={Colors.textSecondary} />
              </Pressable>
            </View>

            {/* PIN Code Entry */}
            <View style={{ marginBottom: 16 }}>
              <Text style={[styles.savedLocationsTitle, { marginBottom: 8 }]}>Enter PIN Code to see local vendors</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <View style={[styles.locationSearchBar, { flex: 1, marginBottom: 0 }]}>
                  <Ionicons name="location-outline" size={18} color={Colors.primary} />
                  <TextInput
                    style={{ flex: 1, fontSize: 15, color: Colors.text, fontFamily: "Poppins_400Regular" }}
                    placeholder="6-digit PIN Code"
                    placeholderTextColor={Colors.textLight}
                    value={pinInput}
                    onChangeText={(v) => setPinInput(v.replace(/\D/g, "").slice(0, 6))}
                    keyboardType="number-pad"
                    maxLength={6}
                  />
                  {customerPinCode ? (
                    <Pressable onPress={() => { setCustomerPinCode(""); setPinInput(""); setSelectedLocation("All Areas"); }}>
                      <Ionicons name="close-circle" size={18} color={Colors.textLight} />
                    </Pressable>
                  ) : null}
                </View>
                <Pressable
                  style={{ backgroundColor: Colors.primary, borderRadius: 10, paddingHorizontal: 16, justifyContent: "center" }}
                  onPress={() => {
                    if (pinInput.length === 6) {
                      setCustomerPinCode(pinInput);
                      // Sync selectedLocation label with matching area if known
                      const match = LOCATION_AREAS.find(a => a.pin === pinInput);
                      setSelectedLocation(match ? match.label : `PIN ${pinInput}`);
                      setShowLocationPicker(false);
                    }
                  }}
                >
                  <Text style={{ color: "#fff", fontFamily: "Poppins_600SemiBold", fontSize: 13 }}>Apply</Text>
                </Pressable>
              </View>
              {customerPinCode ? (
                isAreaEmptyFallback ? (
                  <Text style={{ color: Colors.primary, fontSize: 12, fontFamily: "Poppins_400Regular", marginTop: 6 }}>
                    No shops in PIN {customerPinCode} yet · showing all {allVendors.length} shops
                  </Text>
                ) : (
                  <Text style={{ color: Colors.success, fontSize: 12, fontFamily: "Poppins_400Regular", marginTop: 6 }}>
                    Filtering by PIN: {customerPinCode} · {allVendors.length} vendor{allVendors.length !== 1 ? "s" : ""} found
                  </Text>
                )
              ) : null}
            </View>

            <View style={styles.locationDivider} />
            <Text style={styles.savedLocationsTitle}>Select Area</Text>
            <ScrollView style={{ maxHeight: 220 }}>
              {LOCATION_AREAS.map((area) => (
                <Pressable
                  key={area.label}
                  style={[styles.locationItem, selectedLocation === area.label && styles.locationItemActive]}
                  onPress={() => {
                    try { Haptics.selectionAsync(); } catch {}
                    setSelectedLocation(area.label);
                    if (autoDetectLanguage && LOCATION_LANGUAGE_MAP[area.label]) {
                      setLanguage(LOCATION_LANGUAGE_MAP[area.label]);
                    }
                    // Sync pin input and customer pin code with selected area's pin
                    setPinInput(area.pin);
                    setCustomerPinCode(area.pin);
                    setShowLocationPicker(false);
                  }}
                >
                  <Ionicons
                    name={selectedLocation === area.label ? "radio-button-on" : "radio-button-off"}
                    size={20}
                    color={selectedLocation === area.label ? Colors.primary : Colors.textLight}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.locationItemText, selectedLocation === area.label && styles.locationItemTextActive]}>{area.label}</Text>
                    {area.pin ? (
                      <Text style={{ fontSize: 11, color: Colors.textLight, fontFamily: "Poppins_400Regular" }}>PIN: {area.pin}</Text>
                    ) : null}
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F1F3F6" },

  headerWrapper: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
  },
  headerLogoPressable: {
    marginRight: 12,
  },
  headerLogoWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#FFF",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.16,
    shadowRadius: 5,
    elevation: 4,
  },
  headerLogoImg: {
    width: 38,
    height: 32,
  },
  topHeader: {
    paddingBottom: 16,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    shadowColor: "#9A3D00",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 10,
  },
  addressBarRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    marginBottom: 2,
  },
  addressBarFlex: {
    flex: 1,
    paddingVertical: 2,
  },
  addressEyebrowRow: { flexDirection: "row", alignItems: "center", gap: 3 },
  addressEyebrow: { fontFamily: "Poppins_600SemiBold", fontSize: 9, letterSpacing: 0.8, color: "rgba(255,255,255,0.85)" },
  addressValueRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 1 },
  addressValue: { fontFamily: "Poppins_700Bold", fontSize: 14, color: "#FFF", flexShrink: 1, minWidth: 0 },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.18)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  addressBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 4,
    gap: 4,
  },
  addressLabel: {
    fontFamily: "Poppins_700Bold",
    fontSize: 12,
    color: "#FFF",
  },
  addressText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 12,
    color: "rgba(255,255,255,0.9)",
    maxWidth: 200,
  },
  coinBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.primary + "0D",
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  coinText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 12,
    color: Colors.primary,
  },

  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF",
    marginHorizontal: 12,
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 46,
    gap: 8,
    shadowColor: "#5A2300",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 6,
  },
  searchInput: {
    flex: 1,
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: Colors.text,
  },
  searchIcons: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  searchDivider: {
    width: 1,
    height: 20,
    backgroundColor: "#E0E0E0",
  },
  aiPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 11,
    paddingHorizontal: 11,
    paddingVertical: 6,
    shadowColor: "#0B1E3D",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  aiPillText: { fontFamily: "Poppins_700Bold", fontSize: 10, color: "#FFF" },
  notifDot: {
    position: "absolute",
    top: -2,
    right: -2,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.error,
  },

  content: { flex: 1 },

  quickCatRow: {
    paddingHorizontal: 10,
    paddingVertical: 14,
    gap: 0,
    backgroundColor: "#FFF",
  },
  quickCatItem: {
    alignItems: "center",
    width: 72,
    position: "relative",
  },
  quickCatCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#F5F5F5",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 7,
    ...SHADOWS.soft,
  },
  quickCatCircleActive: {
    borderColor: "transparent",
    ...SHADOWS.glow,
  },
  quickCatLabel: {
    fontFamily: "Poppins_500Medium",
    fontSize: 11,
    color: Colors.textSecondary,
    textAlign: "center",
  },
  quickCatLabelActive: {
    color: Colors.primary,
    fontFamily: "Poppins_600SemiBold",
  },
  quickCatUnderline: {
    position: "absolute",
    bottom: -2,
    width: 28,
    height: 3,
    borderRadius: 2,
    backgroundColor: Colors.primary,
  },

  bannerSection: {
    marginTop: 8,
    backgroundColor: "#FFF",
    paddingVertical: 12,
  },
  bannerList: { paddingHorizontal: 16, gap: 12 },
  bannerCard: {
    width: BANNER_WIDTH,
    height: 160,
    borderRadius: 18,
    overflow: "hidden",
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    shadowColor: "#1A1A2E",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 6,
  },
  bannerContent: { flex: 1, zIndex: 1 },
  bannerContentOverlay: {
    position: "absolute",
    left: 18,
    right: 18,
    bottom: 18,
    zIndex: 2,
  },
  bannerBrandRow: { marginBottom: 6 },
  bannerBrandPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    alignSelf: "flex-start",
  },
  bannerBrandText: { fontFamily: "Poppins_600SemiBold", fontSize: 9, color: "#FFF" },
  bannerTitle: { fontFamily: "Poppins_700Bold", fontSize: 22, color: "#FFF", lineHeight: 28 },
  bannerSubtitle: { fontFamily: "Poppins_400Regular", fontSize: 12, color: "rgba(255,255,255,0.85)", marginBottom: 10 },
  bannerCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255,255,255,0.25)",
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 16,
    alignSelf: "flex-start",
  },
  bannerCtaText: { fontFamily: "Poppins_600SemiBold", fontSize: 11, color: "#FFF" },
  bannerGraphic: {
    position: "absolute",
    right: 16,
    bottom: 12,
  },
  dotsRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
    marginTop: 10,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#D1D5DB",
  },
  dotActive: {
    backgroundColor: Colors.primary,
    width: 20,
    borderRadius: 4,
  },

  sectionCard: {
    marginTop: 8,
    backgroundColor: "#FFF",
    padding: 16,
  },
  sectionCardTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 16,
    color: Colors.text,
    marginBottom: 12,
  },
  recentRow: {
    gap: 12,
  },
  recentItem: {
    width: 100,
    alignItems: "center",
  },
  recentImage: {
    width: 80,
    height: 80,
    borderRadius: 12,
    backgroundColor: "#F5F5F5",
    marginBottom: 6,
  },
  recentName: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 15,
  },

  categoryGridSection: {
    marginTop: 8,
    backgroundColor: "#FFF",
    paddingVertical: 16,
  },
  categoryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 16,
  },
  categoryScrollContent: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 12,
  },
  categoryTile: {
    alignItems: "center",
    width: 76,
  },
  categoryTileIcon: {
    width: 72,
    height: 72,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  categoryTileName: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 11,
    color: Colors.text,
    textAlign: "center",
    lineHeight: 15,
  },
  categoryItem: {
    width: "25%",
    alignItems: "center",
    marginBottom: 12,
  },
  categoryIconBox: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  categoryName: { fontFamily: "Poppins_500Medium", fontSize: 12, color: Colors.text, textAlign: "center" },

  dealsBanner: {
    marginTop: 8,
    paddingHorizontal: 16,
    backgroundColor: "#FFF",
    paddingVertical: 14,
  },
  dealGradient: {
    borderRadius: 14,
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    minHeight: 120,
    overflow: "hidden",
  },
  adTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255,255,255,0.25)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: "flex-start",
    marginBottom: 6,
  },
  adTagText: { fontFamily: "Poppins_700Bold", fontSize: 9, color: "#FFF", letterSpacing: 0.5 },
  dealTitle: { fontFamily: "Poppins_700Bold", fontSize: 20, color: "#FFF", marginBottom: 2 },
  dealSub: { fontFamily: "Poppins_400Regular", fontSize: 12, color: "rgba(255,255,255,0.85)", marginBottom: 10 },
  dealCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255,255,255,0.25)",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    alignSelf: "flex-start",
  },
  dealCtaText: { fontFamily: "Poppins_600SemiBold", fontSize: 11, color: "#FFF" },

  vendorBanner: { marginHorizontal: 20, marginVertical: 16, borderRadius: 18, overflow: "hidden" },
  vendorBannerGradient: { flexDirection: "row", alignItems: "center", padding: 18, gap: 12 },
  vendorBannerLeft: { flex: 1 },
  vendorBannerTitle: { fontFamily: "Poppins_700Bold", fontSize: 16, color: "#FFF", marginBottom: 2 },
  vendorBannerSub: { fontFamily: "Poppins_400Regular", fontSize: 12, color: "rgba(255,255,255,0.85)", lineHeight: 18, marginBottom: 10 },
  vendorBannerCta: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#FFF", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, alignSelf: "flex-start" },
  vendorBannerCtaText: { fontFamily: "Poppins_600SemiBold", fontSize: 12, color: "#EA580C" },
  vendorBannerIcon: { width: 60, height: 60, borderRadius: 30, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
  section: { marginTop: 8, backgroundColor: "#FFF", paddingVertical: 14 },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  sectionTitleFlat: {
    fontFamily: "Poppins_700Bold",
    fontSize: 18,
    color: Colors.text,
    letterSpacing: 0.2,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  sectionTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 18,
    color: Colors.text,
    letterSpacing: 0.2,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  seeAll: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: Colors.primary },

  productGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 16,
    gap: 10,
  },
  productCardGrid: {
    width: (width - 42) / 2,
    backgroundColor: "#FFF",
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#F0F0F0",
  },
  productGridImage: { width: "100%", height: 130 },
  productGridInfo: { padding: 10 },
  productGridName: { fontFamily: "Poppins_500Medium", fontSize: 13, color: Colors.text },
  productGridVendor: { fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  productGridPrice: { fontFamily: "Poppins_700Bold", fontSize: 15, color: Colors.text },
  productGridOrig: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textLight, textDecorationLine: "line-through" },
  discountTag: {
    position: "absolute",
    top: 8,
    left: 8,
    backgroundColor: "#16A34A",
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  discountTagText: { fontFamily: "Poppins_700Bold", fontSize: 10, color: "#FFF" },

  productCardH: {
    width: 140,
    backgroundColor: "#FFF",
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#F0F0F0",
  },
  productHImage: { width: "100%", height: 110 },
  productHInfo: { padding: 8 },
  productHName: { fontFamily: "Poppins_500Medium", fontSize: 12, color: Colors.text },
  productHVendor: { fontFamily: "Poppins_400Regular", fontSize: 10, color: Colors.textSecondary, marginTop: 1 },
  productHPrice: { fontFamily: "Poppins_700Bold", fontSize: 14, color: Colors.text },
  productHOrig: { fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textLight, textDecorationLine: "line-through" },

  quickServices: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    marginTop: 8,
  },
  quickServiceCard: {
    flex: 1,
    borderRadius: 12,
    overflow: "hidden",
  },
  quickServiceGradient: {
    padding: 12,
    height: 80,
    justifyContent: "flex-end",
  },
  qsIcon: { position: "absolute", right: 8, top: 8 },
  qsTitle: { fontFamily: "Poppins_700Bold", fontSize: 12, color: "#FFF" },
  qsSub: { fontFamily: "Poppins_400Regular", fontSize: 10, color: "rgba(255,255,255,0.8)" },

  sponsoredBanner: {
    marginTop: 8,
    paddingHorizontal: 16,
    backgroundColor: "#FFF",
    paddingVertical: 14,
  },
  sponsoredGradient: {
    borderRadius: 14,
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    minHeight: 110,
    overflow: "hidden",
  },
  sponsoredTitle: { fontFamily: "Poppins_700Bold", fontSize: 18, color: "#FFF", marginBottom: 2 },
  sponsoredSub: { fontFamily: "Poppins_400Regular", fontSize: 12, color: "rgba(255,255,255,0.85)", marginBottom: 10, lineHeight: 18 },

  storeCard: {
    flexDirection: "row",
    backgroundColor: "#FFF",
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#F0F0F0",
  },
  storeImage: { width: 95, height: 95 },
  storePlaceholder: { alignItems: "center", justifyContent: "center" },
  storePlaceholderText: { fontFamily: "Poppins_700Bold", fontSize: 32, color: "#FFF" },
  storeInfo: { flex: 1, padding: 10, justifyContent: "center" },
  storeHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 4 },
  onlineVendorBadge: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "#DCFCE7", borderRadius: 8, paddingHorizontal: 5, paddingVertical: 2 },
  onlineVendorDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#10B981" },
  onlineVendorText: { fontFamily: "Poppins_600SemiBold", fontSize: 9, color: "#10B981" },
  storeName: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: Colors.text, flex: 1 },
  storeDesc: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  storeMeta: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 },
  metaChip: { flexDirection: "row", alignItems: "center", gap: 3 },
  metaChipText: { fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textSecondary },
  metaDot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: Colors.textLight },

  // Category-grouped store sections
  catGroupSection: { marginBottom: 8 },
  catGroupHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 8,
  },
  // ── Category group header ──────────────────────────────────────
  catGroupPill: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    paddingVertical: 7,
    paddingHorizontal: 10,
    gap: 8,
  },
  catGroupAccent: { width: 4, height: 18, borderRadius: 2 },
  catGroupTitle: { fontFamily: "Poppins_700Bold", fontSize: 15, flex: 1 },
  catGroupBadge: {
    backgroundColor: "rgba(255,255,255,0.7)",
    borderRadius: 99,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  catGroupBadgeText: { fontFamily: "Poppins_600SemiBold", fontSize: 10 },
  catGroupSeeAllBtn: { flexDirection: "row", alignItems: "center", gap: 1, paddingLeft: 8 },
  catGroupSeeAll: { fontFamily: "Poppins_600SemiBold", fontSize: 12, color: Colors.primary },
  catGroupRow: { paddingHorizontal: 16, paddingBottom: 6, paddingTop: 2, gap: 12 },

  // ── Vendor card — full-bleed image ─────────────────────────────
  hVendorCard: {
    width: 168,
    borderRadius: 18,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.16,
    shadowRadius: 14,
    elevation: 7,
    backgroundColor: "#FFF",
  },
  hVendorImageBox: {
    width: 168,
    height: 180,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  hVendorInitial: { fontFamily: "Poppins_700Bold", fontSize: 52, color: "#FFF", opacity: 0.9 },
  hVendorOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 10,
    paddingTop: 32,
    paddingBottom: 10,
  },
  hVendorNameOverlay: {
    fontFamily: "Poppins_700Bold",
    fontSize: 13,
    color: "#FFF",
    marginBottom: 3,
    textShadowColor: "rgba(0,0,0,0.4)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  hVendorMetaOverlay: { flexDirection: "row", alignItems: "center", gap: 2 },
  hVendorRatingOverlay: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 11,
    color: "#FBBF24",
    marginLeft: 4,
  },
  hVendorOpenBadge: {
    position: "absolute",
    top: 10,
    right: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    borderRadius: 99,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  hVendorOpenDot: { width: 5, height: 5, borderRadius: 99, backgroundColor: "#FFF", opacity: 0.9 },
  hVendorOpenText: { fontFamily: "Poppins_700Bold", fontSize: 9, color: "#FFF" },
  hVendorCatChip: {
    position: "absolute",
    top: 10,
    left: 10,
    borderRadius: 99,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  hVendorCatText: { fontFamily: "Poppins_700Bold", fontSize: 9, color: "#FFF" },
  hVendorFeaturedBadge: {
    position: "absolute",
    bottom: 52,
    right: 10,
    backgroundColor: Colors.primary,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  hVendorFeaturedText: { fontFamily: "Poppins_800ExtraBold" as any, fontSize: 8, color: "#FFF", letterSpacing: 0.5 },
  hVendorDistRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: "#FFF",
  },
  hVendorDist: { fontFamily: "Poppins_500Medium", fontSize: 11, color: Colors.textSecondary, flex: 1 },

  // ── Browse Products — ultra eye-catching ──────────────────────
  productsGridSection: { marginTop: 12 },

  pgSectionHeader: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    marginHorizontal: 12,
    marginBottom: 12,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  pgSectionHeaderLeft: { flexDirection: "row" as const, alignItems: "center" as const, gap: 10 },
  pgSectionIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: "#FFF",
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  pgSectionTitle: { fontFamily: "Poppins_700Bold", fontSize: 17, color: "#FFF" },
  pgViewAllBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 4,
    backgroundColor: "#FFF",
    borderRadius: 99,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  pgViewAllText: { fontFamily: "Poppins_700Bold", fontSize: 11, color: Colors.primary },

  productsGrid: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    paddingHorizontal: 10,
    gap: 10,
  },
  pgCard: {
    width: "47%" as any,
    backgroundColor: "#FFF",
    borderRadius: 18,
    overflow: "hidden" as const,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.13,
    shadowRadius: 14,
    elevation: 6,
  },
  pgImageWrap: { position: "relative" as const, width: "100%" as any },
  pgImage: { width: "100%", height: 155, backgroundColor: Colors.primary + "10" },
  pgImageFallback: { alignItems: "center" as const, justifyContent: "center" as const },
  pgImageOverlay: {
    position: "absolute" as const,
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 10,
    paddingTop: 28,
    paddingBottom: 8,
  },
  pgPriceOverlay: {
    fontFamily: "Poppins_800ExtraBold" as any,
    fontSize: 15,
    color: "#FFF",
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  pgMrpOverlay: {
    fontFamily: "Poppins_400Regular",
    fontSize: 10,
    color: "rgba(255,255,255,0.7)",
    textDecorationLine: "line-through" as const,
  },
  pgRibbon: {
    position: "absolute" as const,
    top: 0,
    right: 0,
    backgroundColor: "#EF4444",
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderBottomLeftRadius: 12,
    alignItems: "center" as const,
  },
  pgRibbonText: {
    fontFamily: "Poppins_800ExtraBold" as any,
    fontSize: 9,
    color: "#FFF",
    textAlign: "center" as const,
    lineHeight: 12,
  },
  pgNewBadge: {
    position: "absolute" as const,
    top: 8,
    left: 8,
    backgroundColor: "#10B981",
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  pgNewText: { fontFamily: "Poppins_800ExtraBold" as any, fontSize: 9, color: "#FFF", letterSpacing: 0.5 },
  pgBody: { padding: 10, paddingBottom: 8, gap: 3 },
  pgName: { fontFamily: "Poppins_700Bold", fontSize: 12, color: Colors.text, lineHeight: 17 },
  pgVendorRow: { flexDirection: "row" as const, alignItems: "center" as const, gap: 4, marginTop: 2 },
  pgVendor: { fontFamily: "Poppins_500Medium", fontSize: 10, color: Colors.textSecondary, flex: 1 },
  pgAccentLine: { height: 3 },

  ratingBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.success,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
    gap: 2,
  },
  ratingText: { fontFamily: "Poppins_600SemiBold", fontSize: 11, color: "#FFF" },
  vendorMeta: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  priceRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },

  loadingMore: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 16, gap: 8 },
  loadingText: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary },

  searchHeader: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 },
  searchHeaderText: { fontFamily: "Poppins_500Medium", fontSize: 14, color: Colors.textSecondary },
  searchResultItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  searchResultImage: { width: 56, height: 56, borderRadius: 10 },
  searchResultInfo: { flex: 1 },
  searchResultName: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: Colors.text },
  searchResultVendor: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary },
  searchResultPrice: { fontFamily: "Poppins_700Bold", fontSize: 14, color: Colors.primary },
  searchResultOriginal: { fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textLight, textDecorationLine: "line-through" },
  searchResultVendorRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 1 },
  distancePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    backgroundColor: "#F0F0F0",
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  distancePillText: { fontFamily: "Poppins_500Medium", fontSize: 10, color: Colors.textSecondary },

  emptySearch: { alignItems: "center", paddingVertical: 60, gap: 8 },
  emptySearchTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 16, color: Colors.text },
  emptySearchText: { fontFamily: "Poppins_400Regular", fontSize: 13, color: Colors.textSecondary },

  aiSuggestHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 12,
  },
  aiSuggestTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 16, color: Colors.text },
  quickSuggestions: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 16, gap: 8 },
  quickSuggestChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.primary + "10",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: Colors.primary + "25",
  },
  quickSuggestText: { fontFamily: "Poppins_500Medium", fontSize: 13, color: Colors.primary },
  aiHintBox: {
    marginHorizontal: 16,
    marginTop: 20,
    backgroundColor: "#F8F9FB",
    borderRadius: 14,
    padding: 14,
    gap: 10,
  },
  aiHintTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: Colors.text, marginBottom: 4 },
  aiHintItem: { flexDirection: "row", alignItems: "center", gap: 8 },
  aiHintText: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary, flex: 1 },
  aiInterpretBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    backgroundColor: Colors.primary + "0D",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: Colors.primary + "20",
  },
  aiInterpretText: { fontFamily: "Poppins_500Medium", fontSize: 13, color: Colors.primary, flex: 1 },
  aiThinkingBar: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 10 },
  aiThinkingText: { fontFamily: "Poppins_400Regular", fontSize: 13, color: Colors.textSecondary },
  aiSuggestionsSection: { paddingTop: 8, paddingBottom: 16 },
  aiSuggestionsLabel: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: Colors.textSecondary, paddingHorizontal: 16, marginBottom: 10 },

  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalContent: {
    backgroundColor: "#FFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingBottom: Platform.OS === "web" ? 34 : 40,
    paddingTop: 12,
    maxHeight: "80%",
  },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "#E0E0E0", alignSelf: "center", marginBottom: 16 },
  modalTitleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  modalTitle: { fontFamily: "Poppins_700Bold", fontSize: 20, color: Colors.secondary },
  locationSearchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F5F5F5",
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 44,
    gap: 10,
    marginBottom: 16,
  },
  locationSearchPlaceholder: { fontFamily: "Poppins_400Regular", fontSize: 13, color: Colors.textLight },
  currentLocationBtn: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  currentLocationTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: Colors.primary },
  currentLocationSub: { fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textSecondary },
  locationDivider: { height: 1, backgroundColor: "#F0F0F0", marginVertical: 12 },
  savedLocationsTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: Colors.textSecondary, marginBottom: 8 },
  locationItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F5F5F5",
  },
  locationItemActive: { backgroundColor: Colors.primary + "08", marginHorizontal: -12, paddingHorizontal: 12, borderRadius: 10 },
  locationItemText: { fontFamily: "Poppins_500Medium", fontSize: 14, color: Colors.text },
  locationItemTextActive: { color: Colors.primary },

  shareStoryBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: Colors.primary + "10", borderRadius: 16, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: Colors.primary + "25" },
  shareStoryText: { fontFamily: "Poppins_600SemiBold", fontSize: 12, color: Colors.primary },
  storyCard: { width: 220, backgroundColor: "#FFF", borderRadius: 14, overflow: "hidden", borderWidth: 1, borderColor: "#F0F0F0" },
  storyPhoto: { width: "100%", height: 120 },
  storyContent: { padding: 10, gap: 4 },
  storyUserRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 2 },
  storyAvatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.primary + "15", alignItems: "center", justifyContent: "center" },
  storyAvatarText: { fontFamily: "Poppins_700Bold", fontSize: 12, color: Colors.primary },
  storyUserName: { fontFamily: "Poppins_600SemiBold", fontSize: 12, color: Colors.text },
  storyLocation: { fontFamily: "Poppins_400Regular", fontSize: 10, color: Colors.textSecondary },
  storyStars: { flexDirection: "row", gap: 1 },
  storyTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: Colors.text },
  storyText: { fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textSecondary, lineHeight: 16 },
  storyVendorTag: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: Colors.primary + "0A", borderRadius: 8, paddingHorizontal: 6, paddingVertical: 3, alignSelf: "flex-start" },
  storyVendorName: { fontFamily: "Poppins_500Medium", fontSize: 10, color: Colors.primary },
  storyFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 },
  storyLikeBtn: { flexDirection: "row", alignItems: "center", gap: 3 },
  storyLikeCount: { fontFamily: "Poppins_500Medium", fontSize: 11, color: Colors.textSecondary },
  storyTimeAgo: { fontFamily: "Poppins_400Regular", fontSize: 10, color: Colors.textLight },

  dailyDealsSection: { marginTop: 8, marginBottom: 8, paddingBottom: 14 },
  dailyDealsHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 14, marginBottom: 12, marginHorizontal: 12, borderRadius: 14, paddingVertical: 12, shadowColor: "#FF3D3D", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 6 },
  dailyDealsLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  dailyDealsFlashBadge: { width: 28, height: 28, borderRadius: 14, backgroundColor: "#FFF", alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.2, shadowRadius: 3, elevation: 2 },
  dailyDealsTitle: { fontFamily: "Poppins_700Bold", fontSize: 17, color: "#FFF", letterSpacing: 0.3 },
  dailyDealsTimer: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(0,0,0,0.2)", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  dailyDealsTimerText: { fontFamily: "Poppins_600SemiBold", fontSize: 11, color: "#FFD700" },
  dealCard: { width: 150, backgroundColor: "#FFF", borderRadius: RADII.md, overflow: "hidden", ...SHADOWS.lift },
  dealImageWrap: { position: "relative" as const, width: 150, height: 150, overflow: "hidden" as const },
  dealImage: { width: 150, height: 150 },
  dealDiscBadge: { position: "absolute" as const, top: 8, left: 8, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, shadowColor: "#FF3D3D", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.4, shadowRadius: 4, elevation: 3 },
  dealDiscText: { fontFamily: "Poppins_700Bold", fontSize: 11, color: "#FFF", letterSpacing: 0.3 },
  dealName: { fontFamily: "Poppins_500Medium", fontSize: 12, color: Colors.text, paddingHorizontal: 8, paddingTop: 6 },
  dealPriceRow: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingTop: 2 },
  dealPrice: { fontFamily: "Poppins_700Bold", fontSize: 16, color: Colors.primary },
  dealOrigPrice: { fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textLight, textDecorationLine: "line-through" as const },
  dealCountdownRow: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 8, paddingTop: 4 },
  dealCountdownText: { fontFamily: "Poppins_600SemiBold", fontSize: 11, color: "#EF4444" },
  dealProgressWrap: { paddingHorizontal: 8, paddingTop: 4, paddingBottom: 8 },
  dealProgressTrack: { height: 4, backgroundColor: "#F0F0F0", borderRadius: 2, overflow: "hidden" as const },
  dealProgressFill: { height: "100%", backgroundColor: "#EF4444", borderRadius: 2 },
  dealSoldText: { fontFamily: "Poppins_400Regular", fontSize: 9, color: Colors.textLight, marginTop: 2 },

  recCard: { width: 150, backgroundColor: "#FFF", borderRadius: 12, overflow: "hidden", borderWidth: 1, borderColor: "#F0F0F0" },
  recImage: { width: 150, height: 130 },
  recDiscBadge: { position: "absolute" as const, top: 6, right: 6, backgroundColor: "#10B981", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  recDiscText: { fontFamily: "Poppins_700Bold", fontSize: 10, color: "#FFF" },
  recInfo: { padding: 8, gap: 2 },
  recName: { fontFamily: "Poppins_500Medium", fontSize: 12, color: Colors.text },
  recVendor: { fontFamily: "Poppins_400Regular", fontSize: 10, color: Colors.textSecondary },
  recPriceRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  recPrice: { fontFamily: "Poppins_700Bold", fontSize: 14, color: Colors.primary },
  recOrigPrice: { fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textLight, textDecorationLine: "line-through" as const },
  recRatingRow: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 2 },
  recRating: { fontFamily: "Poppins_500Medium", fontSize: 11, color: Colors.textSecondary },

  topProductCard: {
    width: 140,
    backgroundColor: "#FFF",
    borderRadius: 14,
    overflow: "hidden" as const,
    borderWidth: 1,
    borderColor: "#F0F0F0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  topProductBadge: {
    position: "absolute" as const,
    top: 8,
    right: 8,
    backgroundColor: "#10B981",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    zIndex: 1,
  },
  topProductBadgeText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 10,
    color: "#FFF",
  },
  topProductIcon: {
    width: "100%",
    height: 110,
    backgroundColor: Colors.primary + "10",
  },
  topProductFallback: {
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  topProductBody: {
    padding: 10,
    gap: 2,
  },
  topProductName: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
    color: Colors.text,
    lineHeight: 16,
  },
  topProductCat: {
    fontFamily: "Poppins_400Regular",
    fontSize: 10,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  topProductPriceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 4,
  },
  topProductPrice: {
    fontFamily: "Poppins_700Bold",
    fontSize: 13,
    color: Colors.primary,
  },
  topProductMrp: {
    fontFamily: "Poppins_400Regular",
    fontSize: 10,
    color: Colors.textLight,
    textDecorationLine: "line-through" as const,
  },
  topProductVendor: {
    fontFamily: "Poppins_400Regular",
    fontSize: 10,
    color: Colors.textSecondary,
    marginTop: 3,
  },
});

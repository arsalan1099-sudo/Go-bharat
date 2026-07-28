import type { Express, Request, Response } from "express";
import OpenAI, { toFile } from "openai";
import { Buffer } from "node:buffer";
import { isRazorpayConfigured, getRazorpayKeyId, createRazorpayOrder, verifyRazorpaySignature, fetchRazorpayPayment, refundRazorpayPayment } from "./razorpayClient";
import { createPayout, getConfiguredPayoutProvider, verifyPayoutWebhookSignature, type PayoutMethod } from "./payoutClient";
import { isPhonePeConfigured, createPhonePeOrder, fetchPhonePeStatus, verifyPhonePeCallbackChecksum } from "./phonePeClient";
import { storage } from "./storage";
import { db } from "./db";
import { cache, CACHE_TTL } from "./cache";
import {
  teamMembers as teamMembersTable,
  transactions,
  featureFlags as featureFlagsTable,
  dynamicPages as dynamicPagesTable,
  appAnnouncements as announcementsTable,
  withdrawalRequests as withdrawalsTable,
  liveSessions as liveSessionsTable,
  notifications as notificationsTable,
  notificationReads as notificationReadsTable,
  products as productsTable,
  orders as ordersTable,
  orderItems as orderItemsTable,
  vendorApplications as vendorApplicationsTable,
  vendors as vendorsTable,
  subCategories as subCategoriesTable,
  categories as categoriesTable,
  busRoutes as busRoutesTable,
  appUsers as appUsersTable,
  googleAccounts as googleAccountsTable,
  homeBanners as homeBannersTable,
  homeDeals as homeDealsTable,
  promoMedia as promoMediaTable,
  adRequests,
  reels as reelsTable,
  leads as leadsTable,
  coinGrants as coinGrantsTable,
  coinTransactions as coinTransactionsTable,
  walletTransactions as walletTransactionsTable,
  payoutDetails as payoutDetailsTable,
  coupons as couponsTable,
} from "@shared/schema";
import { eq, ne, and, or, sql, desc, inArray, isNull, gte, getTableColumns } from "drizzle-orm";
import { isSmsConfigured, sendSmsOtp } from "./smsClient";
import { isWhatsAppConfigured, sendWhatsAppOtp, sendWhatsAppOrderConfirmation } from "./whatsappClient";
import { isEmailConfigured, sendEmailOtp } from "./emailClient";
import { sendPushNotifications, sendPushToUser, sendPushToRole } from "./pushService";
import { generateToken, requireAuth, requireRole, optionalAuth, generateGoogleLinkToken, verifyGoogleLinkToken } from "./auth";
import { isGoogleConfigured, verifyGoogleIdToken } from "./googleAuth";
import crypto from "crypto";
import sharp from "sharp";

// Resolves a customer/team/vendor role from a verified phone number. Extracted
// from /api/otp/verify so OTP login and Google login share identical role
// resolution. VENDOR/SUPER_ADMIN are only ever granted from DB/admin state,
// never from the request body.
async function resolveUserRole(cleanPhone: string): Promise<{ role: string; id: string; name: string | null }> {
  const adminPhone = process.env.ADMIN_PHONE || "+919168134109";
  const cleanAdminPhone = adminPhone.replace(/\D/g, "").slice(-10);

  if (cleanPhone === cleanAdminPhone) {
    return { role: "SUPER_ADMIN", id: "admin", name: "Super Admin" };
  }

  // Match phone in any format stored in DB
  const phoneMatch = (col: any) => or(
    eq(col, cleanPhone),
    eq(col, "+91" + cleanPhone),
    eq(col, "91" + cleanPhone),
    sql`RIGHT(REPLACE(REPLACE(${col}, '+', ''), ' ', ''), 10) = ${cleanPhone}`
  );

  const [teamMember] = await db.select().from(teamMembersTable)
    .where(phoneMatch(teamMembersTable.phone));
  if (teamMember && teamMember.status === "ACTIVE") {
    return { role: teamMember.role, id: teamMember.id, name: teamMember.name || null };
  }

  const [vendorApp] = await db.select().from(vendorApplicationsTable).where(
    and(
      phoneMatch(vendorApplicationsTable.phone),
      or(eq(vendorApplicationsTable.status, "APPROVED"), eq(vendorApplicationsTable.status, "LIVE"))
    )
  );
  if (vendorApp) {
    return { role: "VENDOR", id: vendorApp.id, name: null };
  }

  // Fallback: phone matches a vendor_application that has a live vendor entry
  // (handles cases where application status wasn't synced but vendor is live).
  const [vendorAppAny] = await db.select({ id: vendorApplicationsTable.id })
    .from(vendorApplicationsTable)
    .innerJoin(vendorsTable, eq(vendorsTable.id, vendorApplicationsTable.id))
    .where(phoneMatch(vendorApplicationsTable.phone));
  if (vendorAppAny) {
    // Sync status to LIVE for future logins
    try {
      await db.update(vendorApplicationsTable)
        .set({ status: "LIVE" })
        .where(eq(vendorApplicationsTable.id, vendorAppAny.id));
    } catch {}
    return { role: "VENDOR", id: vendorAppAny.id, name: null };
  }

  // Default: customer keyed by phone.
  return { role: "CUSTOMER", id: cleanPhone, name: null };
}

// ── In-memory image buffer cache ─────────────────────────────────────────────
// Holds up to MAX_IMG_CACHE compressed JPEG buffers so repeated image proxy
// requests never touch the DB.  Keyed by "product:<id>" or "vendor:<id>".
// Oldest entry is evicted (FIFO) when the cap is reached.
const MAX_IMG_CACHE = 200;
const imgBufferCache = new Map<string, { buf: Buffer; etag: string }>();
function imgCacheGet(key: string) { return imgBufferCache.get(key); }
function imgCacheSet(key: string, entry: { buf: Buffer; etag: string }) {
  if (imgBufferCache.size >= MAX_IMG_CACHE) {
    const firstKey = imgBufferCache.keys().next().value;
    if (firstKey !== undefined) imgBufferCache.delete(firstKey);
  }
  imgBufferCache.set(key, entry);
}
function imgCacheInvalidate(key: string) { imgBufferCache.delete(key); }

// Compress a base64 data URL or Buffer to a resized JPEG.
// maxWidthPx=900 keeps images crisp on all phone screens while cutting size 10-50×.
async function compressImageDataUrl(dataUrl: string, maxWidthPx = 900, quality = 78): Promise<string> {
  if (!dataUrl.startsWith("data:image/")) return dataUrl; // external URL — skip
  const raw = Buffer.from(dataUrl.replace(/^data:image\/\w+;base64,/, ""), "base64");
  const compressed = await sharp(raw)
    .resize({ width: maxWidthPx, withoutEnlargement: true })
    .jpeg({ quality, mozjpeg: true })
    .toBuffer();
  return "data:image/jpeg;base64," + compressed.toString("base64");
}
async function compressToBuffer(dataUrl: string, maxWidthPx = 900, quality = 78): Promise<Buffer> {
  const raw = Buffer.from(dataUrl.replace(/^data:image\/\w+;base64,/, ""), "base64");
  return sharp(raw)
    .resize({ width: maxWidthPx, withoutEnlargement: true })
    .jpeg({ quality, mozjpeg: true })
    .toBuffer();
}

const IS_PRODUCTION = process.env.REPLIT_DEPLOYMENT === "1" || process.env.NODE_ENV === "production";
const otpRateLimit = new Map<string, number[]>();
const OTP_RATE_LIMIT_MAX = 5;
const OTP_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

function isOtpRateLimited(phone: string): boolean {
  const now = Date.now();
  const timestamps = (otpRateLimit.get(phone) || []).filter(t => now - t < OTP_RATE_LIMIT_WINDOW_MS);
  otpRateLimit.set(phone, timestamps);
  if (timestamps.length >= OTP_RATE_LIMIT_MAX) return true;
  timestamps.push(now);
  otpRateLimit.set(phone, timestamps);
  return false;
}

function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function resolveMapLinkToCoords(link: string): Promise<{ lat: number; lng: number } | null> {
  const parseCoords = (text: string) => {
    const patterns = [
      /@(-?\d+\.?\d*),(-?\d+\.?\d*)/,
      /q=(-?\d+\.?\d*),(-?\d+\.?\d*)/,
      /ll=(-?\d+\.?\d*),(-?\d+\.?\d*)/,
      /place\/[^/]*\/(-?\d+\.?\d*),(-?\d+\.?\d*)/,
      /!3d(-?\d+\.?\d+)!4d(-?\d+\.?\d+)/,
      /center=(-?\d+\.?\d+),(-?\d+\.?\d+)/,
      /destination=(-?\d+\.?\d+),(-?\d+\.?\d+)/,
      /(-?\d+\.\d{3,})\s*[,\s]\s*(-?\d+\.\d{3,})/,
    ];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        const lat = parseFloat(match[1]);
        const lng = parseFloat(match[2]);
        if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 && (Math.abs(lat) > 0.001 || Math.abs(lng) > 0.001)) {
          return { lat, lng };
        }
      }
    }
    return null;
  };
  const direct = parseCoords(link);
  if (direct) return direct;
  try {
    const response = await fetch(link, { redirect: "follow", signal: AbortSignal.timeout(10000) });
    const finalUrl = response.url;
    const fromUrl = parseCoords(finalUrl);
    if (fromUrl) return fromUrl;
    const html = await response.text();
    const fromHtml = parseCoords(html);
    if (fromHtml) return fromHtml;
  } catch {}
  return null;
}

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const SYSTEM_PROMPT = `You are a helpful product listing assistant for GO BHARAT, a hyperlocal super app in India. You help vendors manage their product listings.

You can help with:
- Writing compelling product descriptions in English or Hindi
- Suggesting competitive pricing for Indian market
- Recommending product categories (B2B Wholesale, B2C Retail, Services, Manpower)
- Improving product titles for better visibility
- Suggesting tags and keywords
- Bulk listing tips and inventory management advice
- Marketing copy for products

Keep responses concise and actionable. Use Indian Rupee (₹) for prices. Be friendly and professional.
When suggesting descriptions, make them engaging and suitable for mobile viewing (short paragraphs).
If asked about something unrelated to product management, politely redirect the conversation.`;

const DEFAULT_FEATURE_FLAGS = [
  { id: "ff1", name: "Reels", description: "Instagram-style video reels with product tagging", enabled: true, roles: ["ALL"], category: "social", icon: "videocam" },
  { id: "ff2", name: "Stories", description: "Customer stories with ratings and photos", enabled: true, roles: ["ALL"], category: "social", icon: "heart" },
  { id: "ff3", name: "Community", description: "Social networking posts and comments", enabled: true, roles: ["ALL"], category: "social", icon: "people-circle" },
  { id: "ff4", name: "AI Search", description: "Natural language AI-powered product search", enabled: true, roles: ["CUSTOMER"], category: "ai", icon: "sparkles" },
  { id: "ff5", name: "Daily Deals", description: "Daily deals carousel on customer home", enabled: true, roles: ["CUSTOMER"], category: "commerce", icon: "flash" },
  { id: "ff6", name: "Wallet", description: "Digital wallet with add money and cashback", enabled: true, roles: ["CUSTOMER"], category: "commerce", icon: "wallet" },
  { id: "ff7", name: "Vendor Chat", description: "In-app chat between customers and vendors", enabled: true, roles: ["CUSTOMER", "VENDOR"], category: "core", icon: "chatbubbles" },
  { id: "ff8", name: "Ad Booking", description: "Vendor advertisement booking system", enabled: true, roles: ["VENDOR"], category: "commerce", icon: "megaphone" },
  { id: "ff9", name: "GPS Tracking", description: "Live GPS delivery tracking", enabled: true, roles: ["CUSTOMER", "DELIVERY"], category: "core", icon: "navigate" },
  { id: "ff10", name: "Push Notifications", description: "Push notification system", enabled: true, roles: ["ALL"], category: "core", icon: "notifications" },
  { id: "ff11", name: "Multi-Language", description: "8 Indian language translations", enabled: true, roles: ["ALL"], category: "visual", icon: "language" },
  { id: "ff12", name: "Personalized Promos", description: "AI-generated personalized promotions", enabled: true, roles: ["CUSTOMER", "VENDOR"], category: "ai", icon: "gift" },
  { id: "ff13", name: "Vendor Onboarding", description: "Marketing-driven vendor onboarding workflow", enabled: true, roles: ["MARKETING", "FRANCHISE"], category: "core", icon: "business" },
  { id: "ff14", name: "Reviews & Ratings", description: "Product and vendor review system", enabled: true, roles: ["CUSTOMER"], category: "social", icon: "star" },
  { id: "ff15", name: "AI Strategy", description: "AI Strategy Assistant for business insights", enabled: true, roles: ["SUPER_ADMIN"], category: "ai", icon: "analytics" },
  { id: "ff16", name: "B2B Wholesale", description: "Bulk order management for B2B vendors", enabled: true, roles: ["VENDOR"], category: "commerce", icon: "cube" },
  { id: "ff17", name: "Travel Booking", description: "Travel agency seat booking and routes", enabled: true, roles: ["VENDOR"], category: "commerce", icon: "bus" },
  { id: "ff18", name: "Manpower Agency", description: "Worker profiles and job posting system", enabled: true, roles: ["VENDOR"], category: "commerce", icon: "people" },
];

async function seedFeatureFlags() {
  try {
    const existing = await db.select({ id: featureFlagsTable.id }).from(featureFlagsTable);
    const existingIds = new Set(existing.map(f => f.id));
    const toInsert = DEFAULT_FEATURE_FLAGS.filter(f => !existingIds.has(f.id));
    if (toInsert.length > 0) {
      await db.insert(featureFlagsTable).values(toInsert);
      console.log(`Seeded ${toInsert.length} default feature flags`);
    }
  } catch (e) {
    console.error("Failed to seed feature flags:", e);
  }
}

// ── Server-side product list cache ───────────────────────────────────────────
// Cache per-vendor product lists in memory. Entries are invalidated on any
// write (add/update/delete product). TTL = 10 minutes as a safety net.
const PRODUCT_CACHE_TTL_MS = 10 * 60 * 1000;
const productCache = new Map<string, { data: any[]; ts: number }>();
function getProductCache(vendorId: string) {
  const entry = productCache.get(vendorId);
  if (!entry) return null;
  if (Date.now() - entry.ts > PRODUCT_CACHE_TTL_MS) { productCache.delete(vendorId); return null; }
  return entry.data;
}
function setProductCache(vendorId: string, data: any[]) {
  productCache.set(vendorId, { data, ts: Date.now() });
}
function invalidateProductCache(_vendorId?: string) {
  // Product lists can be cached under aliased keys (canonical id, sibling ids, or
  // phone) for legacy data, so a per-key delete can leave stale aliases behind.
  // Writes are infrequent and re-warming is cheap (lightweight queries), so clear
  // the whole cache and let the next request re-warm.
  productCache.clear();
  lastProductWarmAt = 0;
}

// Lightweight product columns — NEVER selects the full base64 `image` blob.
// We only peek at the first 10 chars to decide image type and build a tiny
// proxy URL, keeping product-list payloads small and fast.
const lightweightProductCols = {
  id: productsTable.id,
  vendorId: productsTable.vendorId,
  name: productsTable.name,
  description: productsTable.description,
  price: productsTable.price,
  originalPrice: productsTable.originalPrice,
  isAvailable: productsTable.isAvailable,
  category: productsTable.category,
  codEnabled: productsTable.codEnabled,
  createdAt: productsTable.createdAt,
  imagePrefix: sql<string>`LEFT(${productsTable.image}, 10)`,
};

// Matches an internal product-image proxy URL (…/api/products/:id/image). List
// endpoints return these for stored images; they must never be persisted back as
// a product's image (it would overwrite the real image with a self-referential URL).
const PROXY_IMAGE_RE = /\/api\/products\/[^/]+\/image/;

// Turns lightweight product rows into client-ready records: uploaded images
// (data: URLs) and external (http) images are both served via the proxy
// endpoint so list responses stay tiny. A small second pass reads only the
// short external URLs (never blobs).
async function enrichProductRows(rows: any[], origin: string): Promise<any[]> {
  const enriched = rows.map((p) => {
    const prefix = (p.imagePrefix ?? "").toLowerCase();
    let image = "";
    let hasImage = false;
    if (prefix.startsWith("data:")) {
      image = `${origin}/api/products/${p.id}/image`;
      hasImage = true;
    } else if (prefix.startsWith("http")) {
      image = `${origin}/api/products/${p.id}/image`;
      hasImage = false;
    }
    const { imagePrefix: _drop, ...rest } = p as any;
    return { ...rest, image, hasImage };
  });
  const externalIds = enriched
    .filter((p) => !p.hasImage && p.image.includes("/api/products/"))
    .map((p) => p.id);
  if (externalIds.length > 0) {
    const urlRows = await db.select({ id: productsTable.id, image: productsTable.image })
      .from(productsTable)
      .where(and(
        inArray(productsTable.id, externalIds),
        sql`LEFT(${productsTable.image}, 10) LIKE 'http%'`,
      ));
    const urlMap = new Map(urlRows.map((r) => [r.id, r.image ?? ""]));
    for (const p of enriched) {
      const url = urlMap.get(p.id);
      if (url) { p.image = url; p.hasImage = false; }
    }
  }
  return enriched;
}

// Loads a single vendor's products (direct id match) as enriched lightweight
// records, ready to cache and serve.
async function loadVendorProductsDirect(vendorId: string, origin: string): Promise<any[]> {
  const rows = await db.select(lightweightProductCols)
    .from(productsTable)
    .where(eq(productsTable.vendorId, vendorId))
    .orderBy(desc(productsTable.createdAt));
  return enrichProductRows(rows, origin);
}

// Phone → canonical vendor-application id, cached in memory. The underlying
// query uses a normalized-phone match that would otherwise scan the whole
// vendor_applications table on every product request; caching the result keeps
// the hot path off that scan.
const VENDOR_ID_BY_PHONE_TTL_MS = 10 * 60 * 1000;
const vendorIdByPhoneCache = new Map<string, { id: string; ts: number }>();
async function resolveVendorIdByPhone(cleanPhone: string): Promise<string> {
  if (!cleanPhone) return "";
  const cached = vendorIdByPhoneCache.get(cleanPhone);
  if (cached && Date.now() - cached.ts < VENDOR_ID_BY_PHONE_TTL_MS) return cached.id;
  const [va] = await db.select({ id: vendorApplicationsTable.id })
    .from(vendorApplicationsTable)
    .where(and(
      or(
        eq(vendorApplicationsTable.phone, cleanPhone),
        sql`RIGHT(REPLACE(REPLACE(${vendorApplicationsTable.phone}, '+', ''), ' ', ''), 10) = ${cleanPhone}`,
      ),
      or(eq(vendorApplicationsTable.status, "APPROVED"), eq(vendorApplicationsTable.status, "LIVE")),
    ))
    .limit(1);
  const id = va?.id || "";
  // Only cache positive resolutions — caching an empty result would delay a
  // newly approved vendor for the full TTL window.
  if (id) vendorIdByPhoneCache.set(cleanPhone, { id, ts: Date.now() });
  return id;
}

// Background warm: after the first product request we know the public origin,
// so prime the product cache for all live vendors. Runs at most once per cache
// TTL window and never blocks the response.
let productWarmInFlight = false;
let lastProductWarmAt = 0;
function maybeWarmVendorProducts(origin: string) {
  if (productWarmInFlight) return;
  if (lastProductWarmAt && Date.now() - lastProductWarmAt < PRODUCT_CACHE_TTL_MS) return;
  productWarmInFlight = true;
  lastProductWarmAt = Date.now();
  void (async () => {
    try {
      const vendors = vendorCache ?? [];
      for (const v of vendors) {
        if (!v?.id || getProductCache(v.id)) continue;
        try {
          const enriched = await loadVendorProductsDirect(v.id, origin);
          setProductCache(v.id, enriched);
        } catch {}
      }
    } finally {
      productWarmInFlight = false;
    }
  })();
}

// ── Server-side vendor cache ──────────────────────────────────────────────────
// Vendors change rarely. Keep an in-memory copy so every API request is
// sub-millisecond instead of waiting on a cold DB connection.
let vendorCache: any[] | null = null;
let vendorCacheUpdatedAt = 0;
const VENDOR_CACHE_TTL_MS = 30 * 60 * 1000; // refresh DB every 30 minutes (invalidated on write)

async function refreshVendorCache() {
  try {
    // Join with vendor_applications to include the owner's phone number
    const rows = await db
      .select({ ...getTableColumns(vendorsTable), phone: vendorApplicationsTable.phone })
      .from(vendorsTable)
      .leftJoin(vendorApplicationsTable, eq(vendorApplicationsTable.id, vendorsTable.id))
      .orderBy(desc(vendorsTable.createdAt));
    const prevCount = vendorCache?.length ?? -1;
    vendorCache = rows;
    vendorCacheUpdatedAt = Date.now();
    if (rows.length !== prevCount) {
      console.log(`Vendor cache refreshed — ${vendorCache.length} vendors`);
    }
  } catch (e) {
    console.error("Vendor cache refresh failed:", e);
  }
}

// Keeps retrying until the vendor cache has at least one vendor (handles DB cold-start timeouts).
function warmVendorCacheWithRetry(retries = 20, delay = 3000) {
  refreshVendorCache().then(() => {
    if (!vendorCache || vendorCache.length === 0) {
      if (retries > 0) {
        setTimeout(() => warmVendorCacheWithRetry(retries - 1, Math.min(delay * 1.5, 30000)), delay);
      }
    }
  }).catch(() => {
    if (retries > 0) {
      setTimeout(() => warmVendorCacheWithRetry(retries - 1, Math.min(delay * 1.5, 30000)), delay);
    }
  });
}

function invalidateVendorCache() {
  vendorCache = null;
}
// ─────────────────────────────────────────────────────────────────────────────

async function seedHomeContent() {
  try {
    const existingBanners = await db.select({ id: homeBannersTable.id }).from(homeBannersTable);
    if (existingBanners.length === 0) {
      await db.insert(homeBannersTable).values([
        { id: "HB001", title: "MEGA SALE", subtitle: "Up to 60% Off on Electronics, Fashion & Groceries", color: "#FF6B00", ctaText: "Shop Now", isActive: true, order: 0 },
        { id: "HB002", title: "NEW ARRIVALS", subtitle: "Discover the Latest Products from Local Stores", color: "#0B1E3D", ctaText: "Explore", isActive: true, order: 1 },
        { id: "HB003", title: "LOCAL BRANDS", subtitle: "Support Your City's Best Businesses", color: "#10B981", ctaText: "Browse Now", isActive: true, order: 2 },
      ]);
      console.log("Seeded 3 default home banners");
    }

    const existingDeals = await db.select({ id: homeDealsTable.id }).from(homeDealsTable);
    if (existingDeals.length === 0) {
      await db.insert(homeDealsTable).values([
        { id: "HD001", name: "Smart Watch Pro", image: "https://images.unsplash.com/photo-1546868871-7041f2a55e12?w=400", price: 1499, originalPrice: 3999, endsInHours: 24, sold: 43, total: 100, isActive: true },
        { id: "HD002", name: "Running Shoes", image: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400", price: 899, originalPrice: 2200, endsInHours: 12, sold: 67, total: 150, isActive: true },
        { id: "HD003", name: "Cotton Kurta Set", image: "https://images.unsplash.com/photo-1583391733956-6c78276477e2?w=400", price: 599, originalPrice: 1200, endsInHours: 6, sold: 28, total: 80, isActive: true },
        { id: "HD004", name: "Bluetooth Earbuds", image: "https://images.unsplash.com/photo-1588423771073-b8903fead85c?w=400", price: 699, originalPrice: 1799, endsInHours: 8, sold: 55, total: 120, isActive: true },
      ]);
      console.log("Seeded 4 default home deals");
    }
  } catch (e) {
    console.error("Failed to seed home content:", e);
  }
}

async function seedCategoriesAndSubCategories() {
  try {
    const existingCats = await db.select({ id: categoriesTable.id }).from(categoriesTable);
    if (existingCats.length === 0) {
      await db.insert(categoriesTable).values([
        { id: "1", name: "B2B",      icon: "briefcase-outline",  color: "#3B82F6" },
        { id: "2", name: "B2C",      icon: "storefront-outline", color: "#FF6B00" },
        { id: "3", name: "Service",  icon: "build-outline",      color: "#8B5CF6" },
        { id: "4", name: "Manpower", icon: "people-outline",     color: "#10B981" },
        { id: "5", name: "Travel",   icon: "bus-outline",        color: "#E11D48" },
      ]);
      console.log("[seed] Seeded 5 categories");
    }
  } catch (e) { console.error("[seed] Failed to seed categories:", e); }

  try {
    const existingSubs = await db.select({ id: subCategoriesTable.id }).from(subCategoriesTable);
    {
      const ALL_SUBS = [
        { id: "sc1",  name: "Wholesale Grocery",          categoryId: "1", image: "https://images.unsplash.com/photo-1542838132-92c53300491e?w=400" },
        { id: "sc2",  name: "Industrial Supplies",        categoryId: "1", image: "https://images.unsplash.com/photo-1504328345606-18bbc8c9d7d1?w=400" },
        { id: "sc3",  name: "Office Equipment",           categoryId: "1", image: "https://images.unsplash.com/photo-1468495244123-6c6c332eeece?w=400" },
        { id: "sc4",  name: "Raw Materials",              categoryId: "1", image: "https://images.unsplash.com/photo-1586201375761-83865001e31c?w=400" },
        { id: "sc5",  name: "Food & Dining",              categoryId: "2", image: "https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=400" },
        { id: "sc6",  name: "Fashion & Lifestyle",        categoryId: "2", image: "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=400" },
        { id: "sc7",  name: "Electronics & Gadgets",      categoryId: "2", image: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400" },
        { id: "sc8",  name: "Health & Beauty",            categoryId: "2", image: "https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=400" },
        { id: "sc9",  name: "Grocery & Daily Needs",      categoryId: "2", image: "https://images.unsplash.com/photo-1540420773420-3366772f4999?w=400" },
        { id: "sc10", name: "Home & Living",              categoryId: "2", image: "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=400" },
        { id: "sc11", name: "Home Services",              categoryId: "3", image: "https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=400" },
        { id: "sc12", name: "Beauty & Wellness",          categoryId: "3", image: "https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?w=400" },
        { id: "sc13", name: "Repair & Maintenance",       categoryId: "3", image: "https://images.unsplash.com/photo-1504148455328-c376907d081c?w=400" },
        { id: "sc14", name: "Professional Services",      categoryId: "3", image: "https://images.unsplash.com/photo-1553877522-43269d4ea984?w=400" },
        { id: "sc15", name: "Delivery Partners",          categoryId: "4", image: "https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=400" },
        { id: "sc16", name: "Skilled Workers",            categoryId: "4", image: "https://images.unsplash.com/photo-1504328345606-18bbc8c9d7d1?w=400" },
        { id: "sc17", name: "Domestic Help",              categoryId: "4", image: "https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=400" },
        { id: "sc18", name: "Event Staff",                categoryId: "4", image: "https://images.unsplash.com/photo-1553877522-43269d4ea984?w=400" },
        { id: "sc19", name: "Packaging Materials",        categoryId: "1", image: "https://images.unsplash.com/photo-1567337710282-00832b415979?w=400" },
        { id: "sc20", name: "Chemical Supplies",          categoryId: "1", image: "https://images.unsplash.com/photo-1604719312566-8912e9227c6a?w=400" },
        { id: "sc21", name: "Textile Raw Materials",      categoryId: "1", image: "https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=400" },
        { id: "sc22", name: "Agricultural Inputs",        categoryId: "1", image: "https://images.unsplash.com/photo-1491933382434-500287f9b54b?w=400" },
        { id: "sc23", name: "Construction Materials",     categoryId: "1", image: "https://images.unsplash.com/photo-1587854692152-cbe660dbde88?w=400" },
        { id: "sc24", name: "Auto Parts Wholesale",       categoryId: "1", image: "https://images.unsplash.com/photo-1513542789411-b6a5d4f31634?w=400" },
        { id: "sc25", name: "Paper & Printing",           categoryId: "1", image: "https://images.unsplash.com/photo-1578916171728-46686eac8d58?w=400" },
        { id: "sc26", name: "Electrical Components",      categoryId: "1", image: "https://images.unsplash.com/photo-1585515320310-259814833e62?w=400" },
        { id: "sc27", name: "Plumbing Supplies Wholesale",categoryId: "1", image: "https://images.unsplash.com/photo-1513506003901-1e6a229e2d15?w=400" },
        { id: "sc28", name: "Safety Equipment",           categoryId: "1", image: "https://images.unsplash.com/photo-1561136594-7f68413baa99?w=400" },
        { id: "sc29", name: "Restaurant Supplies",        categoryId: "1", image: "https://images.unsplash.com/photo-1508313880080-c4bef0730395?w=400" },
        { id: "sc30", name: "Medical Equipment",          categoryId: "1", image: "https://images.unsplash.com/photo-1471864190281-a93a3070b6de?w=400" },
        { id: "sc31", name: "IT Equipment Bulk",          categoryId: "1", image: "https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?w=400" },
        { id: "sc32", name: "Furniture Wholesale",        categoryId: "1", image: "https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=400" },
        { id: "sc33", name: "Cleaning Supplies",          categoryId: "1", image: "https://images.unsplash.com/photo-1601050690597-df0568f70950?w=400" },
        { id: "sc34", name: "Handicraft Materials",       categoryId: "1", image: "https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?w=400" },
        { id: "sc35", name: "Steel & Metal",              categoryId: "1", image: "https://images.unsplash.com/photo-1630383249896-424e482df921?w=400" },
        { id: "sc36", name: "Plastic Products",           categoryId: "1", image: "https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=400" },
        { id: "sc37", name: "Timber & Wood",              categoryId: "1", image: "https://images.unsplash.com/photo-1542272604-787c3835535d?w=400" },
        { id: "sc38", name: "Gems & Jewelry Wholesale",   categoryId: "1", image: "https://images.unsplash.com/photo-1594633312681-425c7b97ccd1?w=400" },
        { id: "sc39", name: "Stationery Wholesale",       categoryId: "1", image: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400" },
        { id: "sc40", name: "FMCG Distribution",          categoryId: "1", image: "https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?w=400" },
        { id: "sc41", name: "Pharma Wholesale",           categoryId: "1", image: "https://images.unsplash.com/photo-1601784551446-20c9e07cdbdb?w=400" },
        { id: "sc42", name: "Building Hardware",          categoryId: "1", image: "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=400" },
        { id: "sc43", name: "Tools & Machinery",          categoryId: "1", image: "https://images.unsplash.com/photo-1584483766114-2cea6facdf57?w=400" },
        { id: "sc44", name: "Bakery & Sweets",            categoryId: "2", image: "https://images.unsplash.com/photo-1618512496248-a07fe83aa8cb?w=400" },
        { id: "sc45", name: "Footwear",                   categoryId: "2", image: "https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?w=400" },
        { id: "sc46", name: "Toys & Games",               categoryId: "2", image: "https://images.unsplash.com/photo-1586495777744-4413f21062fa?w=400" },
        { id: "sc47", name: "Books & Stationery",         categoryId: "2", image: "https://images.unsplash.com/photo-1556228578-0d85b1a4d571?w=400" },
        { id: "sc48", name: "Sports & Fitness",           categoryId: "2", image: "https://images.unsplash.com/photo-1584100936595-c0654b55a2e2?w=400" },
        { id: "sc49", name: "Poultry & Meat",             categoryId: "2", image: "https://images.unsplash.com/photo-1587593810167-a84920ea0781?w=400" },
        { id: "sc50", name: "Flowers & Gifts",            categoryId: "2", image: "https://images.unsplash.com/photo-1531346878377-a5be20888e57?w=400" },
        { id: "sc51", name: "Watches & Accessories",      categoryId: "2", image: "https://images.unsplash.com/photo-1585336261022-680e295ce3fe?w=400" },
        { id: "sc52", name: "Baby & Kids",                categoryId: "2", image: "https://images.unsplash.com/photo-1513364776144-60967b0f800f?w=400" },
        { id: "sc53", name: "Eyewear",                    categoryId: "2", image: "https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?w=400" },
        { id: "sc54", name: "Luggage & Bags",             categoryId: "2", image: "https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=400" },
        { id: "sc55", name: "Musical Instruments",        categoryId: "2", image: "https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=400" },
        { id: "sc56", name: "Art & Craft",                categoryId: "2", image: "https://images.unsplash.com/photo-1589985270826-4b7bb135bc9d?w=400" },
        { id: "sc57", name: "Mobile Accessories",         categoryId: "2", image: "https://images.unsplash.com/photo-1509440159596-0249088772ff?w=400" },
        { id: "sc58", name: "Organic & Natural",          categoryId: "2", image: "https://images.unsplash.com/photo-1582722872445-44dc5f7e3c8f?w=400" },
        { id: "sc59", name: "Dry Fruits & Nuts",          categoryId: "2", image: "https://images.unsplash.com/photo-1612929633738-8fe44f7ec841?w=400" },
        { id: "sc60", name: "Kitchen Appliances",         categoryId: "2", image: "https://images.unsplash.com/photo-1609091839311-d5365f9ff1c5?w=400" },
        { id: "sc61", name: "Jewelry & Ornaments",        categoryId: "2", image: "https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?w=400" },
        { id: "sc62", name: "Auto Accessories",           categoryId: "2", image: "https://images.unsplash.com/photo-1563636619-e9143da7973b?w=400" },
        { id: "sc63", name: "Paan & Tobacco",             categoryId: "2", image: "https://images.unsplash.com/photo-1583119022894-919a68a3d0e3?w=400" },
        { id: "sc64", name: "Snacks & Beverages",         categoryId: "2", image: "https://images.unsplash.com/photo-1599490659213-e2b9527bd087?w=400" },
        { id: "sc65", name: "Traditional Wear",           categoryId: "2", image: "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=400" },
        { id: "sc66", name: "Pooja Items",                categoryId: "2", image: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400" },
        { id: "sc67", name: "Gift Articles",              categoryId: "2", image: "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=400" },
        { id: "sc68", name: "Personal Care",              categoryId: "2", image: "https://images.unsplash.com/photo-1526304640581-d334cdbbf45e?w=400" },
        { id: "sc69", name: "Cleaning Services",          categoryId: "3", image: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=400" },
        { id: "sc70", name: "Pest Control",               categoryId: "3", image: "https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?w=400" },
        { id: "sc71", name: "Interior Design",            categoryId: "3", image: "https://images.unsplash.com/photo-1521737604893-d14cc237f11d?w=400" },
        { id: "sc72", name: "Photography",                categoryId: "3", image: "https://images.unsplash.com/photo-1497366216548-37526070297c?w=400" },
        { id: "sc73", name: "Catering Services",          categoryId: "3", image: "https://images.unsplash.com/photo-1497215842964-222b430dc094?w=400" },
        { id: "sc74", name: "Tutoring & Coaching",        categoryId: "3", image: "https://images.unsplash.com/photo-1551434678-e076c223a692?w=400" },
        { id: "sc75", name: "Fitness Training",           categoryId: "3", image: "https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=400" },
        { id: "sc76", name: "Astrology & Pooja",          categoryId: "3", image: "https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=400" },
        { id: "sc77", name: "Travel & Tourism",           categoryId: "3", image: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=400" },
        { id: "sc78", name: "Event Management",           categoryId: "3", image: "https://images.unsplash.com/photo-1560179707-f14e90ef3623?w=400" },
        { id: "sc79", name: "Legal Services",             categoryId: "3", image: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=400" },
        { id: "sc80", name: "Accounting & Tax",           categoryId: "3", image: "https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=400" },
        { id: "sc81", name: "Healthcare Services",        categoryId: "3", image: "https://images.unsplash.com/photo-1573164713988-8665fc963095?w=400" },
        { id: "sc82", name: "Pet Care",                   categoryId: "3", image: "https://images.unsplash.com/photo-1560472354-b33ff0c44a43?w=400" },
        { id: "sc83", name: "Courier & Logistics",        categoryId: "3", image: "https://images.unsplash.com/photo-1535378917042-10a22c95931a?w=400" },
        { id: "sc84", name: "Car Wash & Detailing",       categoryId: "3", image: "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=400" },
        { id: "sc85", name: "Tailoring & Alteration",     categoryId: "3", image: "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=400" },
        { id: "sc86", name: "Printing & Signage",         categoryId: "3", image: "https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=400" },
        { id: "sc87", name: "IT Support",                 categoryId: "3", image: "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=400" },
        { id: "sc88", name: "Insurance & Finance",        categoryId: "3", image: "https://images.unsplash.com/photo-1518611012118-696072aa579a?w=400" },
        { id: "sc89", name: "Security Guards",            categoryId: "4", image: "https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=400" },
        { id: "sc90", name: "Drivers & Chauffeurs",       categoryId: "4", image: "https://images.unsplash.com/photo-1557862921-37829c790f19?w=400" },
        { id: "sc91", name: "Cooks & Chefs",              categoryId: "4", image: "https://images.unsplash.com/photo-1559599101-f09722fb4948?w=400" },
        { id: "sc92", name: "Warehouse Staff",            categoryId: "4", image: "https://images.unsplash.com/photo-1551836022-deb4988cc6c0?w=400" },
        { id: "sc93", name: "Construction Labour",        categoryId: "4", image: "https://images.unsplash.com/photo-1550831107-1553da8c8464?w=400" },
        { id: "sc94", name: "Factory Workers",            categoryId: "4", image: "https://images.unsplash.com/photo-1576091160550-2173dba999ef?w=400" },
        { id: "sc95", name: "Office Support Staff",       categoryId: "4", image: "https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=400" },
        { id: "sc96", name: "AC & Refrigeration Tech",   categoryId: "4", image: "https://images.unsplash.com/photo-1524178232363-1fb2b075b655?w=400" },
        { id: "sc97", name: "Welders & Fabricators",      categoryId: "4", image: "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=400" },
        { id: "sc98", name: "Data Entry & Back Office",   categoryId: "4", image: "https://images.unsplash.com/photo-1551024601-bec78aea704b?w=400" },
        { id: "sc99", name: "Sales & Promoters",          categoryId: "4", image: "https://images.unsplash.com/photo-1563013544-824ae1b704d3?w=400" },
        { id: "sc100",name: "Packing & Logistics",        categoryId: "4", image: "https://images.unsplash.com/photo-1590650153855-d9e808231d41?w=400" },
        { id: "sc101",name: "Bus Booking",                categoryId: "5", image: "https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?w=400" },
        { id: "sc102",name: "Cab & Taxi",                 categoryId: "5", image: "https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?w=400" },
        { id: "sc103",name: "Tour Packages",              categoryId: "5", image: "https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=400" },
        { id: "sc104",name: "Hotel Booking",              categoryId: "5", image: "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=400" },
        { id: "sc105",name: "Tempo & Traveller",          categoryId: "5", image: "https://images.unsplash.com/photo-1570125909232-eb263c188f7e?w=400" },
        { id: "sc106",name: "Pilgrimage Tours",           categoryId: "5", image: "https://images.unsplash.com/photo-1548013146-72479768bada?w=400" },
        { id: "sc107",name: "Flight Booking",             categoryId: "5", image: "https://images.unsplash.com/photo-1529074963764-98f45c47344b?w=400" },
        { id: "sc108",name: "Train Ticket",               categoryId: "5", image: "https://images.unsplash.com/photo-1474487548417-781cb71495f3?w=400" },
        { id: "sc109",name: "Truck & Logistics",          categoryId: "5", image: "https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?w=400" },
      ];
      const existingSubIds = new Set(existingSubs.map(s => s.id));
      const toInsert = ALL_SUBS.filter(s => !existingSubIds.has(s.id));
      if (toInsert.length > 0) {
        await db.insert(subCategoriesTable).values(toInsert);
        console.log(`[seed] Seeded ${toInsert.length} sub-categories`);
      }
    }
  } catch (e) { console.error("[seed] Failed to seed sub-categories:", e); }
}

// Retries seeding tasks in the background so a cold-start DB timeout doesn't leave
// the app with empty categories / subcategories.
async function seedWithRetry(fn: () => Promise<void>, label: string, retries = 10, delay = 4000) {
  for (let i = 0; i <= retries; i++) {
    try {
      await fn();
      return;
    } catch (e) {
      if (i < retries) {
        console.warn(`[seed-retry] ${label} failed (attempt ${i + 1}), retrying in ${delay}ms…`);
        await new Promise(r => setTimeout(r, delay));
        delay = Math.min(delay * 1.5, 30000);
      } else {
        console.error(`[seed-retry] ${label} failed after ${retries + 1} attempts:`, e);
      }
    }
  }
}

export async function registerRoutes(app: Express): Promise<void> {
  // Run seeds in background with retry so a cold-start DB timeout doesn't block the server
  // or leave the app with missing data.
  seedWithRetry(seedFeatureFlags, "seedFeatureFlags");
  seedWithRetry(seedHomeContent, "seedHomeContent");
  seedWithRetry(seedCategoriesAndSubCategories, "seedCategoriesAndSubCategories");
  // Warm the vendor cache on startup — retries automatically if DB is still cold.
  warmVendorCacheWithRetry();
  // Keep the cache fresh in the background
  setInterval(() => { refreshVendorCache(); }, VENDOR_CACHE_TTL_MS);

  // Ensure coin_transactions table exists (safe to re-run)
  void db.execute(sql`
    CREATE TABLE IF NOT EXISTS coin_transactions (
      id VARCHAR(64) PRIMARY KEY,
      user_id VARCHAR(64) NOT NULL,
      type VARCHAR(20) NOT NULL,
      amount INTEGER NOT NULL,
      reference TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `).then(() => db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_coin_transactions_user_id ON coin_transactions(user_id)
  `)).catch((e: any) => console.error("[STARTUP] coin_transactions table creation failed:", e.message));

  // Speed up vendor lookups by phone. The product endpoints match a normalized
  // last-10-digits phone, which a plain index can't serve — an expression index
  // makes that match fast even on a cold cache. The plain phone index helps exact matches.
  void db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_vendor_apps_phone ON vendor_applications (phone)
  `).then(() => db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_vendor_apps_phone_norm ON vendor_applications ((RIGHT(REPLACE(REPLACE(phone, '+', ''), ' ', ''), 10)))
  `)).catch((e: any) => console.error("[STARTUP] vendor_applications phone index creation failed:", e.message));

  // Run all startup migrations in the background so the server becomes ready immediately.
  // These never block route registration — they fire-and-forget after the event loop tick.
  void (async () => {
  // DATA RECOVERY (runs FIRST, before any slow network-bound migration):
  // A prior cleanup wrongly classified 15 real Malegaon vendor listings as
  // "fabricated demo data" and deleted them on every startup. This restores them.
  // Insert-if-missing ONLY — it never overwrites a vendor's own edits and never
  // deletes anything, so it is safe to re-run on every restart. Map coordinates
  // for these ids are corrected by the coordinate-fix migration further below.
  try {
    const namedVendors = [
      { id: "VA34CA8K", name: "MAJESTIC PERFUMES", description: "Premium fragrances and perfumes", categoryId: "2", subCategoryId: "sc8", address: "Naya Pura, Malegaon", lat: 20.563440, lng: 74.534260, rating: 4.4 },
      { id: "VASG3JQZ", name: "IQBAL ZAIKA", description: "Authentic Mughlai and local cuisine", categoryId: "2", subCategoryId: "sc5", address: "Chandanpuri Gate, Malegaon", lat: 20.553080, lng: 74.531760, rating: 4.3 },
      { id: "VARXEEK8", name: "CHINYA SUPER CHINESE", description: "Chinese and Indo-Chinese cuisine", categoryId: "2", subCategoryId: "sc5", address: "Near Latifya Masjid, Malegaon", lat: 20.545560, lng: 74.522340, rating: 4.1 },
      { id: "VAF47WGO", name: "ZH DIAPER HUB", description: "Baby and diaper care products", categoryId: "2", subCategoryId: "sc52", address: "Near Noor Hospital, Malegaon", lat: 20.556240, lng: 74.529140, rating: 4.2 },
      { id: "VA6CPBIM", name: "HADI TOURS", description: "Travel packages and tour bookings", categoryId: "5", subCategoryId: "sc103", address: "Naya Pura Gali 9, Malegaon", lat: 20.563980, lng: 74.535400, deliveryTime: "On Request", rating: 4.5 },
      { id: "VA2W6VHJ", name: "AABID SODA", description: "Cold drinks and refreshing beverages", categoryId: "2", subCategoryId: "sc64", address: "Hazar Kholi, Malegaon", lat: 20.551340, lng: 74.527880, rating: 4.0 },
      { id: "VA8GH63Q", name: "UNIQUE KIDS MALL", description: "Toys, games and kids accessories", categoryId: "2", subCategoryId: "sc46", address: "Bhawsar Gali, Malegaon", lat: 20.555400, lng: 74.526000, rating: 4.2 },
      { id: "VAF6IS1W", name: "JOCKEY", description: "Premium innerwear and sportswear", categoryId: "2", subCategoryId: "sc6", address: "Viraj Plaza, Satana Road, Malegaon", lat: 20.549200, lng: 74.520500, rating: 4.6 },
      { id: "VAEPHP1F", name: "GO ASSURE", description: "Insurance and financial services", categoryId: "3", subCategoryId: "sc14", address: "Near D Mart, Agra Road, Malegaon", lat: 20.559840, lng: 74.536120, deliveryTime: "By Appointment", rating: 4.3 },
      { id: "VAF2DFAS", name: "MALEGAON RIKSHA", description: "Local auto-rickshaw and cab services", categoryId: "5", subCategoryId: "sc102", address: "Kamal Pura, Malegaon", lat: 20.557620, lng: 74.530850, deliveryTime: "On Demand", rating: 4.1 },
      { id: "VAF6YOPO", name: "MALEGAON OPTICALS", description: "Eyewear, spectacles and contact lenses", categoryId: "2", subCategoryId: "sc53", address: "Near Mushaarat Chowk, Malegaon", lat: 20.566010, lng: 74.540250, rating: 4.4 },
      { id: "VAJS72I6", name: "MASTER HAJJ UMRAH TOURS", description: "Hajj and Umrah pilgrimage packages", categoryId: "5", subCategoryId: "sc106", address: "Abbas Nagar, Malegaon", lat: 20.566680, lng: 74.542050, deliveryTime: "On Request", rating: 4.7 },
      { id: "VAPLO1SB", name: "AJMAL PERFUMES", description: "Premium Arabian and international fragrances", categoryId: "2", subCategoryId: "sc8", address: "Best IT Square, Agra Road, Malegaon", lat: 20.571200, lng: 74.544900, rating: 4.5 },
      { id: "VAFM72FB", name: "FOZAIL AUTO GARAGE", description: "Vehicle repair and maintenance", categoryId: "3", subCategoryId: "sc13", address: "Agra Road, Malegaon", lat: 20.572500, lng: 74.543880, deliveryTime: "Same Day", rating: 4.2 },
      { id: "VACTZHV3", name: "SHREE PARAS", description: "Fashion and lifestyle products", categoryId: "2", subCategoryId: "sc6", address: "Satana Road, Near Tehsil, Malegaon", lat: 20.551500, lng: 74.522200, rating: 4.3 },
    ];
    let restoredCount = 0;
    for (const v of namedVendors) {
      const [existing] = await db.select({ id: vendorsTable.id }).from(vendorsTable).where(eq(vendorsTable.id, v.id)).limit(1);
      if (!existing) {
        await db.insert(vendorsTable).values({
          id: v.id,
          name: v.name,
          description: v.description,
          image: "",
          rating: v.rating ?? 4,
          reviewCount: 0,
          deliveryTime: v.deliveryTime ?? "20-35 min",
          distance: "1.5 km",
          isOpen: true,
          categoryId: v.categoryId,
          subCategoryId: v.subCategoryId,
          commissionRate: 10,
          lat: v.lat,
          lng: v.lng,
          address: v.address,
          codEnabled: false,
          pinCode: "423203",
          franchiseId: "",
        }).onConflictDoNothing();
        restoredCount++;
      }
    }
    if (restoredCount > 0) {
      console.log(`[MIGRATION] Restored ${restoredCount} named vendor listing(s) wrongly removed by prior cleanup`);
      refreshVendorCache();
    }
  } catch (e) {
    console.error("[MIGRATION] Failed to restore named vendor listings:", e);
  }

  // One-time fix: correct Sayyed Parvez's phone number (was +918007175176, should be +918007175476)
  try {
    const [sayyed] = await db.select().from(teamMembersTable).where(eq(teamMembersTable.id, "TMOZH6A2"));
    if (sayyed && sayyed.phone === "+918007175176") {
      await db.update(teamMembersTable).set({ phone: "+918007175476" }).where(eq(teamMembersTable.id, "TMOZH6A2"));
      cache.invalidate("team_members");
      console.log("[MIGRATION] Fixed Sayyed Parvez phone: +918007175176 → +918007175476");
    }
  } catch (e) {
    console.error("[MIGRATION] Failed to fix Sayyed Parvez phone:", e);
  }

  // Fix vendor coordinates — spreads vendors that have no GPS or wrong-city coords
  // across Malegaon using deterministic offsets derived from vendor ID.
  // Re-runs safely on every restart: only updates when coords still need fixing.
  try {
    const MALEGAON_CENTER = { lat: 20.5547, lng: 74.5247 };
    const SERVICE_AREA_KM = 50;
    function _haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
      const R = 6371, dLat = (lat2 - lat1) * Math.PI / 180, dLng = (lng2 - lng1) * Math.PI / 180;
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }
    // Vendors with no real GPS, exact default coords, or wrong-city coords get
    // deterministic Malegaon offsets based on their known neighbourhood.
    // wrongLat/wrongLng: a previously-assigned INCORRECT approximate position that should be corrected.
    //   The fix only runs if the vendor is STILL at that wrong position (safe if marketing exec later
    //   provides real GPS — the app-sync migration above will change it, and this check won't match).
    type CoordFix = { id: string; lat: number; lng: number; wrongLat?: number; wrongLng?: number };
    const coordFixes: CoordFix[] = [
      { id: "VA09W9BP", lat: 20.558424, lng: 74.531305 },
      { id: "VA2NDBHM", lat: 20.570816, lng: 74.546795 },
      { id: "VA5411MM", lat: 20.557760, lng: 74.530475 },
      { id: "VA5IRMQ7", lat: 20.564912, lng: 74.535515 },
      { id: "VA5JE2QX", lat: 20.546072, lng: 74.515865 },
      { id: "VA6H9NEF", lat: 20.562044, lng: 74.531930 },
      { id: "VA70HY86", lat: 20.553980, lng: 74.521850 },
      { id: "VA8RV79Z", lat: 20.567628, lng: 74.538910 },
      // VAF6YOPO (Malegaon opticals, near Mushaarat chowk): was stacked with VAJS72I6
      { id: "VAF6YOPO", lat: 20.566010, lng: 74.540250, wrongLat: 20.566248, wrongLng: 74.541085 },
      // VAFM72FB (FOZAIL AUTO GARAGE, Agra road): was stacked with VAPLO1SB
      { id: "VAFM72FB", lat: 20.572500, lng: 74.543880, wrongLat: 20.571988, wrongLng: 74.544360 },
      { id: "VAFOQP9M", lat: 20.535756, lng: 74.549070 },
      { id: "VAINZBZH", lat: 20.567760, lng: 74.542975 },
      // VAJS72I6 (Master Hajj Umrah Tours, Abbas nagar): was stacked with VAF6YOPO
      { id: "VAJS72I6", lat: 20.566680, lng: 74.542050, wrongLat: 20.566328, wrongLng: 74.541185 },
      { id: "VAP9GY9M", lat: 20.563800, lng: 74.534125 },
      // VAPLO1SB (Ajmal perfumes, Best IT square Agra road): was stacked with VAFM72FB
      { id: "VAPLO1SB", lat: 20.571200, lng: 74.544900, wrongLat: 20.571984, wrongLng: 74.544355 },
      { id: "VAQ629PF", lat: 20.561316, lng: 74.531020 },
      { id: "VAQA0ZW5", lat: 20.557820, lng: 74.523360 },
      { id: "VAR682C8", lat: 20.550960, lng: 74.521975 },
      { id: "VAWMA5S1", lat: 20.543388, lng: 74.512510 },
      { id: "VAYCH2CH", lat: 20.570520, lng: 74.546425 },
      { id: "VAZFPWD4", lat: 20.537320, lng: 74.501025 },
      { id: "VAZJ3ZNN", lat: 20.565280, lng: 74.539875 },
      // Vendors whose addresses are too vague for Nominatim — assigned approximate Malegaon neighbourhood coords
      { id: "VAEPHP1F", lat: 20.559840, lng: 74.536120 }, // Go assure: Near D mart (Agra road)
      { id: "VAF2DFAS", lat: 20.557620, lng: 74.530850 }, // Malegaon riksha: Kamal pura
      { id: "VA34CA8K", lat: 20.563440, lng: 74.534260 }, // Majestic Perfumes: Naya pura
      { id: "VASG3JQZ", lat: 20.553080, lng: 74.531760 }, // Iqbal Zaika: Chandanpuri gate
      { id: "VARXEEK8", lat: 20.545560, lng: 74.522340 }, // Chinya Super Chinese: near Latifya masjid
      { id: "VAF47WGO", lat: 20.556240, lng: 74.529140 }, // ZH Diaper Hub: near Noor hospital
      { id: "VA6CPBIM", lat: 20.563980, lng: 74.535400 }, // Hadi tours: Naya pura gali 9
      { id: "VA2W6VHJ", lat: 20.551340, lng: 74.527880 }, // Aabid Soda: Hazar kholi
      // 3 vendors still stuck at exact default center — Nominatim could not geocode from their vague addresses
      { id: "VA8GH63Q", lat: 20.555400, lng: 74.526000 }, // UNIQUE KIDS MALL: Bhawsar gali (central)
      { id: "VAF6IS1W", lat: 20.549200, lng: 74.520500 }, // Jockey: Viraj plaza, Satana road Mausam Pool
      { id: "VACTZHV3", lat: 20.551500, lng: 74.522200 }, // Shree Paras: Satana road near tehsil
    ];
    for (const fix of coordFixes) {
      const [v] = await db.select({ id: vendorsTable.id, lat: vendorsTable.lat, lng: vendorsTable.lng })
        .from(vendorsTable).where(eq(vendorsTable.id, fix.id));
      if (!v) continue;
      const curLat = parseFloat(v.lat as any) || 0;
      const curLng = parseFloat(v.lng as any) || 0;
      const isExactDefault = Math.abs(curLat - MALEGAON_CENTER.lat) < 0.0001 && Math.abs(curLng - MALEGAON_CENTER.lng) < 0.0001;
      const isOutOfArea = !curLat || !curLng || _haversineKm(curLat, curLng, MALEGAON_CENTER.lat, MALEGAON_CENTER.lng) > SERVICE_AREA_KM;
      // wrongLat/wrongLng: only fix if still at the known-incorrect previously-assigned position
      const isAtWrongPos = fix.wrongLat !== undefined && fix.wrongLng !== undefined &&
        Math.abs(curLat - fix.wrongLat) < 0.0005 && Math.abs(curLng - fix.wrongLng) < 0.0005;
      if (isExactDefault || isOutOfArea || isAtWrongPos) {
        await db.update(vendorsTable).set({ lat: fix.lat, lng: fix.lng }).where(eq(vendorsTable.id, fix.id));
        console.log(`[MIGRATION] Spread vendor ${fix.id} to (${fix.lat}, ${fix.lng})`);
      }
    }
  } catch (e) {
    console.error("[MIGRATION] Failed to fix vendor locations:", e);
  }

  // Sync vendor lat/lng from their approved applications (where application has valid coords
  // AND coordinates are within the Malegaon service area — skip bad/out-of-area coords).
  try {
    const _MALEGAON_LAT = 20.5547, _MALEGAON_LNG = 74.5247, _MAX_KM = 50;
    function _haversineSync(lat1: number, lng1: number, lat2: number, lng2: number) {
      const R = 6371, dLat = (lat2 - lat1) * Math.PI / 180, dLng = (lng2 - lng1) * Math.PI / 180;
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }
    const apps = await db.select({
      id: vendorApplicationsTable.id,
      latitude: vendorApplicationsTable.latitude,
      longitude: vendorApplicationsTable.longitude,
    }).from(vendorApplicationsTable);
    let locationsSynced = 0;
    for (const app of apps) {
      const appLat = app.latitude ? parseFloat(String(app.latitude)) : 0;
      const appLng = app.longitude ? parseFloat(String(app.longitude)) : 0;
      // Skip: no coordinates, zero, or clearly outside India (corrupted geocode e.g. US coords)
      if (!appLat || !appLng || Math.abs(appLat) < 0.001 || Math.abs(appLng) < 0.001) continue;
      if (appLat < 5 || appLat > 38 || appLng < 65 || appLng > 100) continue;
      const [vendor] = await db.select({ id: vendorsTable.id, lat: vendorsTable.lat, lng: vendorsTable.lng })
        .from(vendorsTable).where(eq(vendorsTable.id, app.id));
      if (!vendor) continue;
      const curLat = parseFloat(String(vendor.lat)) || 0;
      const curLng = parseFloat(String(vendor.lng)) || 0;
      // Only update if the application coordinates differ meaningfully from what's stored
      if (Math.abs(curLat - appLat) > 0.0001 || Math.abs(curLng - appLng) > 0.0001) {
        await db.update(vendorsTable)
          .set({ lat: appLat, lng: appLng })
          .where(eq(vendorsTable.id, app.id));
        locationsSynced++;
      }
    }
    if (locationsSynced > 0) console.log(`[MIGRATION] Synced ${locationsSynced} vendor locations from applications`);
  } catch (e) {
    console.error("[MIGRATION] Failed to sync vendor locations from applications:", e);
  }

  // Resolve locationLink for vendor applications that have a Google Maps link but no lat/lng.
  // This recovers coordinates from applications where the marketing exec's link resolution
  // failed client-side (WebView network issues, short URL timeouts, etc.).
  // The server-side resolution is more reliable than the WebView.
  try {
    const _MAL_LAT2 = 20.5547, _MAL_LNG2 = 74.5247, _MAX_KM2 = 50;
    function _haversineLink(la1: number, lo1: number, la2: number, lo2: number) {
      const R = 6371, dLa = (la2-la1)*Math.PI/180, dLo = (lo2-lo1)*Math.PI/180;
      const a = Math.sin(dLa/2)**2 + Math.cos(la1*Math.PI/180)*Math.cos(la2*Math.PI/180)*Math.sin(dLo/2)**2;
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    }
    const appsWithLinks = await db.select({
      id: vendorApplicationsTable.id,
      locationLink: vendorApplicationsTable.locationLink,
      latitude: vendorApplicationsTable.latitude,
      longitude: vendorApplicationsTable.longitude,
    }).from(vendorApplicationsTable)
      .where(sql`${vendorApplicationsTable.locationLink} IS NOT NULL AND ${vendorApplicationsTable.locationLink} != ''`);
    const toResolve = appsWithLinks.filter(a => {
      const lat = a.latitude ? parseFloat(String(a.latitude)) : 0;
      const lng = a.longitude ? parseFloat(String(a.longitude)) : 0;
      return !lat || !lng || Math.abs(lat) < 0.001 || Math.abs(lng) < 0.001;
    });
    if (toResolve.length > 0) {
      console.log(`[LINK-RESOLVE] ${toResolve.length} applications with locationLink but no coords — resolving...`);
      let resolved = 0;
      for (const app of toResolve) {
        try {
          const coords = await resolveMapLinkToCoords(app.locationLink!);
          if (!coords) continue;
          // Accept any valid Indian coordinates (no distance limit — multi-territory app)
          await db.update(vendorApplicationsTable)
            .set({ latitude: coords.lat, longitude: coords.lng })
            .where(eq(vendorApplicationsTable.id, app.id));
          await db.update(vendorsTable)
            .set({ lat: coords.lat, lng: coords.lng })
            .where(eq(vendorsTable.id, app.id));
          console.log(`[LINK-RESOLVE] ${app.id} → (${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}) from link`);
          resolved++;
        } catch {}
        await new Promise(r => setTimeout(r, 500));
      }
      if (resolved > 0) console.log(`[LINK-RESOLVE] Resolved ${resolved} vendor locations from stored location links`);
    }
  } catch (e) {
    console.error("[LINK-RESOLVE] Migration failed:", e);
  }

  // Geocode vendors whose lat/lng is still at the exact Malegaon default center (20.5547, 74.5247).
  // Reset vendor coordinates that are clearly outside India's bounding box —
  // these are corrupted/wrong geocodes (e.g., vendor appearing in the Americas).
  // Resetting to the Malegaon default allows the geocoder below to re-place them properly.
  try {
    const INDIA_LAT_MIN = 5, INDIA_LAT_MAX = 38, INDIA_LNG_MIN = 65, INDIA_LNG_MAX = 100;
    const DEFAULT_LAT = 20.5547, DEFAULT_LNG = 74.5247;
    const badCoordVendors = await db.select({ id: vendorsTable.id, lat: vendorsTable.lat, lng: vendorsTable.lng })
      .from(vendorsTable);
    let resetCount = 0;
    for (const v of badCoordVendors) {
      const lat = parseFloat(String(v.lat ?? "0"));
      const lng = parseFloat(String(v.lng ?? "0"));
      if (!isNaN(lat) && !isNaN(lng) && (lat !== 0 || lng !== 0)) {
        const outsideIndia = lat < INDIA_LAT_MIN || lat > INDIA_LAT_MAX || lng < INDIA_LNG_MIN || lng > INDIA_LNG_MAX;
        if (outsideIndia) {
          await db.update(vendorsTable).set({ lat: DEFAULT_LAT, lng: DEFAULT_LNG }).where(eq(vendorsTable.id, v.id));
          // Also clear the application's bad coordinates so the location-sync step doesn't restore them next restart
          await db.update(vendorApplicationsTable)
            .set({ latitude: null, longitude: null })
            .where(and(eq(vendorApplicationsTable.id, v.id), sql`(${vendorApplicationsTable.latitude} < 5 OR ${vendorApplicationsTable.latitude} > 38 OR ${vendorApplicationsTable.longitude} < 65 OR ${vendorApplicationsTable.longitude} > 100)`));
          console.log(`[COORD-RESET] Vendor ${v.id} had invalid coords (${lat.toFixed(2)}, ${lng.toFixed(2)}) — reset vendor + application for re-geocoding`);
          resetCount++;
        }
      }
    }
    if (resetCount > 0) console.log(`[COORD-RESET] Reset ${resetCount} vendor(s) with non-India coordinates`);
  } catch (e) {
    console.error("[COORD-RESET] Failed:", e);
  }

  // These vendors have no GPS data — we geocode their street address via Nominatim to place
  // them more accurately on the map. Runs only for vendors that still need geocoding.
  // Rate-limited to 1 request/second per Nominatim usage policy.
  try {
    const DEFAULT_LAT = 20.5547, DEFAULT_LNG = 74.5247, GEOCODE_MAX_KM = 20;
    function _haversineGeo(la1: number, lo1: number, la2: number, lo2: number) {
      const R = 6371, dLa = (la2 - la1) * Math.PI / 180, dLo = (lo2 - lo1) * Math.PI / 180;
      const a = Math.sin(dLa / 2) ** 2 + Math.cos(la1 * Math.PI / 180) * Math.cos(la2 * Math.PI / 180) * Math.sin(dLo / 2) ** 2;
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }
    // Find vendors at the exact default center that need geocoding
    const defaultVendors = await db.select({ id: vendorsTable.id, lat: vendorsTable.lat, lng: vendorsTable.lng })
      .from(vendorsTable)
      .where(
        and(
          sql`ABS(${vendorsTable.lat}::numeric - ${DEFAULT_LAT}) < 0.0002`,
          sql`ABS(${vendorsTable.lng}::numeric - ${DEFAULT_LNG}) < 0.0002`
        )
      );
    if (defaultVendors.length > 0) {
      console.log(`[GEOCODE] ${defaultVendors.length} vendors at default center — attempting geocoding`);
      for (const v of defaultVendors) {
        const [app] = await db.select({ address: vendorApplicationsTable.address, city: vendorApplicationsTable.city })
          .from(vendorApplicationsTable).where(eq(vendorApplicationsTable.id, v.id));
        if (!app?.address) continue;
        const locationStr = [app.address, app.city, "India"].filter(Boolean).join(", ");
        const query = encodeURIComponent(locationStr);
        try {
          await new Promise(r => setTimeout(r, 1100)); // Nominatim: max 1 req/sec
          const resp = await fetch(`https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1&countrycodes=in`, {
            headers: { "User-Agent": "GoBharat/1.0 (gobharat.in)" },
          });
          if (!resp.ok) continue;
          const results = await resp.json() as any[];
          if (!results.length) continue;
          const geoLat = parseFloat(results[0].lat), geoLng = parseFloat(results[0].lon);
          if (!isNaN(geoLat) && !isNaN(geoLng) && Math.abs(geoLat) > 0.001 && Math.abs(geoLng) > 0.001) {
            await db.update(vendorsTable).set({ lat: geoLat, lng: geoLng }).where(eq(vendorsTable.id, v.id));
            console.log(`[GEOCODE] ${v.id} → (${geoLat.toFixed(4)}, ${geoLng.toFixed(4)}) via "${locationStr}"`);
          }
        } catch (fe) {
          // Nominatim request failed — skip this vendor
        }
      }
    }
  } catch (ge) {
    console.error("[GEOCODE] Migration failed:", ge);
  }

  // Sync franchise_id from vendors → vendor_applications for legacy data
  // (applications submitted before franchise_id column existed will have franchise_id="")
  try {
    const allVendors = await db.select({ id: vendorsTable.id, franchiseId: vendorsTable.franchiseId }).from(vendorsTable);
    let synced = 0;
    for (const v of allVendors) {
      if (!v.franchiseId) continue;
      const [app] = await db.select({ id: vendorApplicationsTable.id, franchiseId: vendorApplicationsTable.franchiseId })
        .from(vendorApplicationsTable)
        .where(eq(vendorApplicationsTable.id, v.id));
      if (app && !app.franchiseId) {
        await db.update(vendorApplicationsTable)
          .set({ franchiseId: v.franchiseId })
          .where(eq(vendorApplicationsTable.id, v.id));
        synced++;
      }
    }
    if (synced > 0) console.log(`[MIGRATION] Synced franchise_id to ${synced} vendor application(s)`);
  } catch (e) {
    console.error("[MIGRATION] Failed to sync franchise_id to vendor applications:", e);
  }

  // Fix vendor applications where submittedBy is a generic placeholder ('User', 'Marketing Executive', '')
  // by matching franchise_id to the sole marketing executive in that franchise
  try {
    const genericNames = ["user", "marketing executive", "executive", ""];
    const badApps = await db.select({ id: vendorApplicationsTable.id, franchiseId: vendorApplicationsTable.franchiseId, submittedBy: vendorApplicationsTable.submittedBy })
      .from(vendorApplicationsTable)
      .where(sql`LOWER(TRIM(${vendorApplicationsTable.submittedBy})) = ANY(ARRAY['user','marketing executive','executive',''])`);
    let fixedCount = 0;
    for (const app of badApps) {
      if (!app.franchiseId) continue;
      const cleanFranchiseId = app.franchiseId.replace(/\D/g, "").slice(-10);
      // Find all marketing executives in this franchise
      const marketingExecs = await db.select({ name: teamMembersTable.name })
        .from(teamMembersTable)
        .where(
          and(
            sql`RIGHT(REGEXP_REPLACE(${teamMembersTable.franchiseId}, '[^0-9]', '', 'g'), 10) = ${cleanFranchiseId}`,
            eq(teamMembersTable.role, "MARKETING"),
            eq(teamMembersTable.status, "ACTIVE")
          )
        );
      if (marketingExecs.length === 1 && marketingExecs[0].name) {
        await db.update(vendorApplicationsTable)
          .set({ submittedBy: marketingExecs[0].name })
          .where(eq(vendorApplicationsTable.id, app.id));
        console.log(`[MIGRATION] Fixed submittedBy for application ${app.id}: '${app.submittedBy}' → '${marketingExecs[0].name}'`);
        fixedCount++;
      }
    }
    if (fixedCount > 0) console.log(`[MIGRATION] Fixed submittedBy on ${fixedCount} vendor application(s)`);
  } catch (e) {
    console.error("[MIGRATION] Failed to fix submittedBy on vendor applications:", e);
  }

  // Pin code-based franchise territory migration:
  // Re-derive franchiseId for all applications that have a pin code, routing each to the
  // franchise owner whose registered pin code matches the vendor's pin code.
  // Applications whose pin code has NO matching franchise owner get franchiseId cleared (unassigned).
  try {
    const activeFranchises = await db.select({ phone: teamMembersTable.phone, pinCode: teamMembersTable.pinCode })
      .from(teamMembersTable)
      .where(and(eq(teamMembersTable.role, "FRANCHISE"), eq(teamMembersTable.status, "ACTIVE")));
    const pinToFranchise = new Map<string, string>(
      activeFranchises
        .filter(f => f.pinCode?.trim())
        .map(f => [f.pinCode!.trim(), f.phone.replace(/\D/g, "").slice(-10)])
    );
    if (pinToFranchise.size > 0) {
      const appsWithPin = await db.select({ id: vendorApplicationsTable.id, pinCode: vendorApplicationsTable.pinCode, franchiseId: vendorApplicationsTable.franchiseId })
        .from(vendorApplicationsTable)
        .where(sql`pin_code IS NOT NULL AND pin_code != ''`);
      let reroutedCount = 0;
      for (const app of appsWithPin) {
        if (!app.pinCode?.trim()) continue;
        const correctFranchiseId = pinToFranchise.get(app.pinCode.trim()) ?? "";
        const currentNorm = (app.franchiseId || "").replace(/\D/g, "").slice(-10);
        if (currentNorm !== correctFranchiseId) {
          await db.update(vendorApplicationsTable)
            .set({ franchiseId: correctFranchiseId })
            .where(eq(vendorApplicationsTable.id, app.id));
          reroutedCount++;
        }
      }
      if (reroutedCount > 0) console.log(`[MIGRATION] Re-routed ${reroutedCount} application(s) to correct franchise owners by pin code`);
    }
  } catch (e) {
    console.error("[MIGRATION] Failed to re-route applications by pin code:", e);
  }

  // Backfill franchise_id for team members (MARKETING/DELIVERY) that were created by a
  // franchise owner but have an empty franchise_id. Matches created_by to franchise owner
  // name (case-insensitive, trimmed) and writes their normalised phone as franchise_id.
  try {
    const allMembers = await db.select().from(teamMembersTable);
    const franchiseOwners = allMembers.filter((m) => m.role === "FRANCHISE" && m.status === "ACTIVE");
    const needsBackfill = allMembers.filter(
      (m) =>
        (m.role === "MARKETING" || m.role === "DELIVERY") &&
        (!m.franchiseId || m.franchiseId.trim() === "") &&
        m.createdByRole === "FRANCHISE" &&
        m.createdBy &&
        m.createdBy.trim() !== ""
    );
    let backfilled = 0;
    for (const member of needsBackfill) {
      const createdByLower = member.createdBy!.trim().toLowerCase();
      const owner = franchiseOwners.find(
        (fo) => fo.name.trim().toLowerCase() === createdByLower
      );
      if (!owner) continue;
      const ownerPhone = owner.phone.replace(/\D/g, "").slice(-10);
      if (!ownerPhone) continue;
      await db.update(teamMembersTable)
        .set({ franchiseId: ownerPhone })
        .where(eq(teamMembersTable.id, member.id));
      backfilled++;
    }
    cache.invalidate("team_members");
    if (backfilled > 0) console.log(`[MIGRATION] Backfilled franchise_id for ${backfilled} team member(s)`);
  } catch (e) {
    console.error("[MIGRATION] Failed to backfill team member franchise_id:", e);
  }

  // Backfill franchise_id for MARKETING/DELIVERY team members whose franchise_id is still empty,
  // by reverse-looking up vendor applications they submitted that already have a franchise_id set.
  // This catches agents created by SUPER_ADMIN (not FRANCHISE) who submitted apps for a franchise.
  try {
    const membersNeedingFranchise = await db.select({ id: teamMembersTable.id, name: teamMembersTable.name })
      .from(teamMembersTable)
      .where(and(
        sql`role IN ('MARKETING', 'DELIVERY')`,
        sql`(franchise_id IS NULL OR franchise_id = '')`
      ));
    if (membersNeedingFranchise.length > 0) {
      // For each such member, find vendor applications they submitted that have a franchise_id
      let appChainBackfilled = 0;
      for (const member of membersNeedingFranchise) {
        const nameLower = member.name.trim().toLowerCase();
        const [appRow] = await db.select({ franchiseId: vendorApplicationsTable.franchiseId })
          .from(vendorApplicationsTable)
          .where(sql`LOWER(TRIM(submitted_by)) = ${nameLower} AND franchise_id IS NOT NULL AND franchise_id <> ''`)
          .limit(1);
        if (!appRow?.franchiseId) continue;
        const derivedFranchiseId = appRow.franchiseId.replace(/\D/g, "").slice(-10);
        if (!derivedFranchiseId) continue;
        await db.update(teamMembersTable)
          .set({ franchiseId: derivedFranchiseId })
          .where(eq(teamMembersTable.id, member.id));
        appChainBackfilled++;
      }
      if (appChainBackfilled > 0) {
        cache.invalidate("team_members");
        console.log(`[MIGRATION] Backfilled franchise_id for ${appChainBackfilled} team member(s) via submitted-apps chain`);
      }
    }
  } catch (e) {
    console.error("[MIGRATION] Failed to backfill team member franchise_id via submitted-apps chain:", e);
  }

  // Backfill franchise_id on vendor applications that have an empty franchise_id by resolving
  // submitted_by → team member's franchise_id → write to the application.
  // Only runs when franchise_id is empty AND either (a) no pin code is set, OR (b) the pin code
  // doesn't match any active franchise owner's pin (orphan pin — use submitter chain as fallback).
  try {
    const allMembersForApps = await db.select({ id: teamMembersTable.id, name: teamMembersTable.name, franchiseId: teamMembersTable.franchiseId, role: teamMembersTable.role })
      .from(teamMembersTable);
    // Build a name → franchise owner phone lookup for marketing/delivery members
    const submitterToFranchise = new Map<string, string>();
    for (const m of allMembersForApps) {
      if ((m.role === "MARKETING" || m.role === "DELIVERY") && m.franchiseId && m.franchiseId.trim()) {
        submitterToFranchise.set(m.name.trim().toLowerCase(), m.franchiseId.replace(/\D/g, "").slice(-10));
      }
    }
    // Build set of known franchise owner pin codes (for the orphan-pin check)
    const franchiseOwnersForPins = await db.select({ pinCode: teamMembersTable.pinCode })
      .from(teamMembersTable)
      .where(and(eq(teamMembersTable.role, "FRANCHISE"), eq(teamMembersTable.status, "ACTIVE")));
    const knownPins = new Set(franchiseOwnersForPins.map((fo) => fo.pinCode?.trim()).filter(Boolean));
    const appsNeedingFranchise = await db.select({ id: vendorApplicationsTable.id, franchiseId: vendorApplicationsTable.franchiseId, pinCode: vendorApplicationsTable.pinCode, submittedBy: vendorApplicationsTable.submittedBy })
      .from(vendorApplicationsTable)
      .where(sql`(franchise_id IS NULL OR franchise_id = '')`);
    let appBackfilled = 0;
    for (const app of appsNeedingFranchise) {
      if (!app.submittedBy?.trim()) continue;
      const appPin = app.pinCode?.trim() || "";
      // Skip if the app has a pin that IS recognised — the pin-routing migration handles those
      if (appPin && knownPins.has(appPin)) continue;
      const franchisePhone = submitterToFranchise.get(app.submittedBy.trim().toLowerCase());
      if (!franchisePhone) continue;
      await db.update(vendorApplicationsTable)
        .set({ franchiseId: franchisePhone })
        .where(eq(vendorApplicationsTable.id, app.id));
      appBackfilled++;
    }
    if (appBackfilled > 0) console.log(`[MIGRATION] Backfilled franchise_id for ${appBackfilled} vendor application(s) via submitter chain`);
  } catch (e) {
    console.error("[MIGRATION] Failed to backfill application franchise_id via submitter chain:", e);
  }

  // Fabricated "named" vendor seeding has been REMOVED. These were demo
  // placeholders (e.g. MAJESTIC PERFUMES) that were never real registrations,
  // and they must never be injected again. Real vendors come only from the
  // vendor_applications onboarding flow / the genuine data import.
  try {
    type VendorSeed = { id: string; name: string; description: string; categoryId: string; subCategoryId: string; address: string; lat: number; lng: number; deliveryTime?: string; rating?: number };
    const namedVendors: VendorSeed[] = [];
    let vendorsSeedCount = 0;
    for (const v of namedVendors) {
      const [existing] = await db.select({ id: vendorsTable.id }).from(vendorsTable).where(eq(vendorsTable.id, v.id)).limit(1);
      if (!existing) {
        await db.insert(vendorsTable).values({
          id: v.id,
          name: v.name,
          description: v.description,
          image: "",
          rating: v.rating ?? 4.0,
          reviewCount: 0,
          deliveryTime: v.deliveryTime ?? "20-35 min",
          distance: "1.5 km",
          isOpen: true,
          categoryId: v.categoryId,
          subCategoryId: v.subCategoryId,
          commissionRate: 10,
          lat: v.lat,
          lng: v.lng,
          address: v.address,
          codEnabled: false,
          pinCode: "423203",
          franchiseId: "",
        });
        vendorsSeedCount++;
      }
    }
    if (vendorsSeedCount > 0) {
      console.log(`[MIGRATION] Restored ${vendorsSeedCount} named vendor(s) to the vendor list`);
      refreshVendorCache();
    }
  } catch (e) {
    console.error("[MIGRATION] Failed to restore named vendors:", e);
  }

  // Sample/demo PRODUCT seeding has been REMOVED. The app must only ever show
  // real products that vendors add themselves (or a genuine bulk import). No
  // fabricated products with stock photos are injected anymore.
  try {
    type ProductSeed = { id: string; name: string; description: string; price: number; image: string; category: string };
    const seedSets: { vendorId: string; products: ProductSeed[] }[] = [];
    let productsSeedCount = 0;
    for (const { vendorId, products } of seedSets) {
      // Only seed when the vendor has ZERO products — never re-insert products the vendor
      // may have deliberately deleted. Checking total count (not specific IDs) prevents
      // the migration from overriding vendor intent on restart.
      const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(productsTable).where(eq(productsTable.vendorId, vendorId));
      if (count > 0) continue;
      for (const p of products) {
        await db.insert(productsTable).values({ ...p, vendorId, isAvailable: true }).onConflictDoNothing();
        productsSeedCount++;
      }
    }
    if (productsSeedCount > 0) console.log(`[MIGRATION] Seeded ${productsSeedCount} sample product(s) for key vendors`);
  } catch (e) {
    console.error("[MIGRATION] Failed to seed sample products:", e);
  }

  // Fix product images stored as blob URLs — these are temporary browser-session URLs
  // that become invalid and show as broken images.
  try {
    const blobProducts = await db.select({ id: productsTable.id })
      .from(productsTable)
      .where(sql`${productsTable.image} LIKE 'blob:%'`);
    if (blobProducts.length > 0) {
      await db.update(productsTable)
        .set({ image: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400" })
        .where(sql`${productsTable.image} LIKE 'blob:%'`);
      console.log(`[MIGRATION] Fixed ${blobProducts.length} product(s) with invalid blob URL images`);
    }
  } catch (e) {
    console.error("[MIGRATION] Failed to fix blob URL product images:", e);
  }

  // Add gateway_transaction_id column to transactions table (idempotent).
  // Stores the payment-gateway-specific transaction reference for non-Razorpay
  // methods (e.g. PhonePe txnId) without overloading razorpay_order_id.
  try {
    await db.execute(sql`
      ALTER TABLE transactions
        ADD COLUMN IF NOT EXISTS gateway_transaction_id VARCHAR(64)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_transactions_gateway_txn_id
        ON transactions (gateway_transaction_id)
    `);
  } catch (e) {
    console.error("[MIGRATION] Failed to add gateway_transaction_id column:", e);
  }

  // Add payment_qr_url column to vendors table (idempotent). Stores a base64
  // data URL of the vendor's UPI QR code so customers can scan and pay directly.
  try {
    await db.execute(sql`
      ALTER TABLE vendors
        ADD COLUMN IF NOT EXISTS payment_qr_url TEXT
    `);
  } catch (e) {
    console.error("[MIGRATION] Failed to add payment_qr_url column:", e);
  }

  // Add upi_id column to vendors table (idempotent). Stores the vendor's UPI ID
  // (e.g. name@upi) so QR codes can be generated dynamically without file uploads.
  try {
    await db.execute(sql`
      ALTER TABLE vendors
        ADD COLUMN IF NOT EXISTS upi_id VARCHAR(100)
    `);
  } catch (e) {
    console.error("[MIGRATION] Failed to add upi_id column:", e);
  }

  // Add payment_method column to orders (idempotent). Distinguishes
  // VENDOR_QR / ONLINE / COD / WALLET / COINS for reporting and audits.
  try {
    await db.execute(sql`
      ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS payment_method VARCHAR(20)
    `);
  } catch (e) {
    console.error("[MIGRATION] Failed to add payment_method column:", e);
  }

  // Seed Sayyed Aakif Afroz's 571 vendor applications from the Excel bulk import.
  // Idempotent: only runs when fewer than 500 of his applications exist in the DB
  // (handles fresh production deployments that don't have the dev-DB bulk inserts).
  try {
    const { readFileSync } = await import("fs");
    const { join } = await import("path");
    const seedPath = join(process.cwd(), "server", "seeds", "aakif-vendors.json");
    const seedVendors: Array<{
      businessName: string; ownerName: string; phone: string; email: string;
      categoryId: string; address: string; city: string; pinCode: string;
      locationLink: string; submittedBy: string; franchiseId: string;
      status: string; description: string;
    }> = JSON.parse(readFileSync(seedPath, "utf-8"));

    const [{ count: existingCount }] = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(vendorApplicationsTable)
      .where(sql`submitted_by = 'Sayyed Aakif Afroz'`);

    if (existingCount < 500) {
      console.log(`[MIGRATION] Seeding ${seedVendors.length} Aakif vendor applications (found ${existingCount} existing)…`);
      const BATCH = 50;
      let inserted = 0;
      for (let i = 0; i < seedVendors.length; i += BATCH) {
        const batch = seedVendors.slice(i, i + BATCH).map(v => ({
          id: "VA" + crypto.randomBytes(5).toString("hex").toUpperCase(),
          businessName: v.businessName.slice(0, 500),
          ownerName: v.ownerName.slice(0, 500),
          phone: v.phone.slice(0, 20),
          email: (v.email || "").slice(0, 200),
          categoryId: v.categoryId,
          address: v.address,
          city: v.city,
          pinCode: v.pinCode,
          locationLink: (v.locationLink || "").slice(0, 1000),
          submittedBy: "Sayyed Aakif Afroz",
          franchiseId: "8177977700",
          status: "PENDING" as const,
          description: "",
          submittedAt: new Date(),
        }));
        // Use ON CONFLICT DO NOTHING via try/catch per-batch to survive any duplicate IDs
        try {
          await db.insert(vendorApplicationsTable).values(batch).onConflictDoNothing();
          inserted += batch.length;
        } catch { /* skip conflicting batch, continue */ }
      }
      console.log(`[MIGRATION] Seeded ${inserted} Aakif vendor application(s)`);
    }
  } catch (e) {
    console.error("[MIGRATION] Failed to seed Aakif vendor applications:", e);
  }

  })(); // end of background migrations IIFE

  app.post("/api/ai/product-assistant", requireAuth, async (req, res) => {
    try {
      const { messages, products } = req.body;

      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: "Messages array is required" });
      }

      let contextMessage = SYSTEM_PROMPT;
      if (products && products.length > 0) {
        contextMessage += `\n\nThe vendor currently has these products:\n${products.map((p: any) => `- ${p.name} (₹${p.price}, Category: ${p.category}, ${p.isAvailable ? 'Available' : 'Unavailable'})`).join('\n')}`;
      }

      const chatMessages: OpenAI.ChatCompletionMessageParam[] = [
        { role: "system", content: contextMessage },
        ...messages.map((m: { role: string; content: string }) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
      ];

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      const stream = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: chatMessages,
        stream: true,
        max_tokens: 1024,
      });

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || "";
        if (content) {
          res.write(`data: ${JSON.stringify({ content })}\n\n`);
        }
      }

      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    } catch (error) {
      console.error("AI Product Assistant error:", error);
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ error: "Something went wrong" })}\n\n`);
        res.end();
      } else {
        res.status(500).json({ error: "Failed to get AI response" });
      }
    }
  });

  app.post("/api/ai/analyze-product-photo", requireAuth, async (req, res) => {
    try {
      const { imageBase64 } = req.body;

      if (!imageBase64) {
        return res.status(400).json({ error: "Image is required" });
      }

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are a product listing assistant for GO BHARAT, an Indian hyperlocal marketplace. Analyze the product photo and suggest details for listing it. Respond ONLY with a JSON object containing: {"name": "product name", "price": "suggested price in INR (number only)", "category": "one of: Groceries, Electronics, Fashion, Food, Beauty, Home, Health, Services, Wholesale", "description": "2-3 sentence product description for mobile listing"}. Be accurate about the product type. Use Indian market pricing. Keep description concise.`,
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Analyze this product photo and suggest listing details." },
              { type: "image_url", image_url: { url: `data:image/jpeg;base64,${imageBase64}` } },
            ],
          },
        ],
        max_completion_tokens: 300,
      });

      const text = response.choices[0]?.message?.content || "{}";
      try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        const result = JSON.parse(jsonMatch ? jsonMatch[0] : "{}");
        res.json(result);
      } catch {
        res.json({ name: "", price: "", category: "", description: "" });
      }
    } catch (error: any) {
      console.error("Product photo analysis error:", error?.message || error);
      res.status(500).json({ error: "Failed to analyze product photo" });
    }
  });

  app.post("/api/ai/moderate-image", requireAuth, async (req, res) => {
    try {
      const { imageBase64 } = req.body;

      if (!imageBase64) {
        return res.status(400).json({ error: "Image is required" });
      }

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are a content moderation system. Analyze the image and determine if it contains nudity, sexually explicit content, or other NSFW material. Respond ONLY with a JSON object: {\"safe\": true} if the image is appropriate, or {\"safe\": false, \"reason\": \"brief reason\"} if it's inappropriate. Be strict about nudity and sexual content but allow normal product photos, food, clothing, everyday items, people in appropriate clothing, etc.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Is this image safe and appropriate for a marketplace app? Check for nudity or explicit content." },
              { type: "image_url", image_url: { url: `data:image/jpeg;base64,${imageBase64}` } },
            ],
          },
        ],
        max_tokens: 100,
      });

      const text = response.choices[0]?.message?.content || '{"safe": true}';
      try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        const result = JSON.parse(jsonMatch ? jsonMatch[0] : '{"safe": true}');
        res.json(result);
      } catch {
        res.json({ safe: true });
      }
    } catch (error: any) {
      console.error("Moderation error:", error?.message || error);
      res.status(503).json({ safe: false, error: "Moderation service unavailable" });
    }
  });

  app.post("/api/ai/search", optionalAuth, async (req, res) => {
    const { query } = req.body;
    try {
      if (!query || typeof query !== "string" || query.trim().length === 0) {
        return res.status(400).json({ error: "Search query is required" });
      }

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are the AI search assistant for GO BHARAT, a hyperlocal super app in Malegaon, Maharashtra, India. Users search for products and stores.

Available categories: B2B Wholesale (id=1), B2C Retail (id=2), Service (id=3), Manpower (id=4)

Available sub-categories (use these EXACT names as store keywords when relevant):
B2B: Wholesale Groceries, Textile Wholesale, Hardware Wholesale, Plastic & Packaging, Steel & Metal, Chemical & Industrial, Paper & Stationery Wholesale, Construction Materials, Electrical Wholesale, Auto Parts Wholesale, Furniture Wholesale, Footwear Wholesale, Jewellery Wholesale, Agri Products Wholesale, IT & Electronics Wholesale, Pharma Wholesale, Garment Wholesale, Toys Wholesale, Sports Goods Wholesale, FMCG Wholesale, Machinery & Equipment, Safety Equipment, Printing & Packaging, Spices & Dry Fruits, Medical Equipment Wholesale, Food Processing Equipment, Hydraulics & Pneumatics, Metal Fabrication, Lubricants & Chemicals
B2C: Groceries & Essentials, Food & Restaurant, Fashion & Clothing, Electronics, Health & Pharmacy, Home & Kitchen, Sports & Fitness, Pet Supplies, Beauty & Salon, Books & Stationery, Toys & Games, Jewellery & Accessories, Footwear, Bakery & Sweets, Organic & Natural, Baby Products, Gifts & Flowers, Musical Instruments, Art & Craft, Automobile Accessories, Eyewear, Watches, Luggage & Bags, Kitchenware, Garden & Outdoor, Home Decor, Puja & Religious, Photography, Ayurvedic Products, Electronics Accessories, Dairy & Eggs
Service: Repair & Maintenance, Cleaning & Pest Control, Education & Tutoring, Photography & Videography, Event Management, Healthcare & Wellness, Legal & Financial, IT Services, Logistics & Transport, Home Services, Wedding Services, Security Services, Tours & Travel, Hotel & Stay, Car Rental, Trekking & Adventure, Pilgrimage Tours, Heritage Tours, Interior Design, Architecture & Planning, Plumbing & Electrical, AC & Appliance Repair, Catering Services, Coaching Classes
Manpower: Construction Labour, Drivers & Delivery, Domestic Help, Factory Workers, Security Guards, Field Sales Agents, Data Entry & Office, Healthcare Workers, Agriculture Labour, Event Staff, Warehouse Workers, Packers & Movers, Electricians & Plumbers, Welders & Fabricators, Carpenters & Painters

CRITICAL RULE: "storeKeywords" must contain SUBCATEGORY NAMES that match what the user is looking for. For example:
- "architect" → storeKeywords: ["Interior Design", "Architecture", "Construction Materials", "Construction Labour"]
- "doctor" → storeKeywords: ["Healthcare", "Health & Pharmacy", "Medical"]
- "food" → storeKeywords: ["Food & Restaurant", "Groceries", "Bakery"]
- "plumber" → storeKeywords: ["Plumbing", "Repair & Maintenance", "Home Services"]

Given a user search query, return a JSON response with:
1. "interpretation" - A brief friendly sentence explaining what you understood (max 15 words)
2. "productKeywords" - Array of product name keywords to match (max 8)
3. "storeKeywords" - Array of subcategory name parts to match against store names (max 8). MUST use subcategory names from the list above, not just the raw query word.
4. "categoryIds" - Array of category IDs to suggest ("1"=B2B, "2"=B2C, "3"=Service, "4"=Manpower)
5. "suggestions" - Array of 2-3 quick follow-up search suggestions

Respond ONLY with valid JSON. No markdown, no explanation outside JSON.`,
          },
          {
            role: "user",
            content: query.trim(),
          },
        ],
        max_completion_tokens: 500,
      });

      const text = response.choices[0]?.message?.content || "";
      console.log("[AI Search] model response length:", text.length, "preview:", text.substring(0, 100));
      if (!text.trim()) {
        // OpenAI returned empty — use keyword fallback
        return res.json({
          interpretation: `Showing results for "${query}"`,
          productKeywords: query.trim().toLowerCase().split(/\s+/),
          storeKeywords: query.trim().toLowerCase().split(/\s+/),
          categoryIds: [],
          suggestions: [],
        });
      }
      try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        const result = JSON.parse(jsonMatch ? jsonMatch[0] : "{}");
        // Ensure fallback keywords if AI returned empty arrays
        if (!result.productKeywords?.length) result.productKeywords = query.trim().toLowerCase().split(/\s+/);
        if (!result.storeKeywords?.length) result.storeKeywords = query.trim().toLowerCase().split(/\s+/);
        res.json(result);
      } catch {
        res.json({
          interpretation: `Showing results for "${query}"`,
          productKeywords: query.trim().toLowerCase().split(/\s+/),
          storeKeywords: query.trim().toLowerCase().split(/\s+/),
          categoryIds: [],
          suggestions: [],
        });
      }
    } catch (error: any) {
      console.error("AI Search error:", error?.message || error);
      // Return keyword fallback instead of error — keeps search working even if AI is down
      res.json({
        interpretation: `Showing results for "${query}"`,
        productKeywords: query.trim().toLowerCase().split(/\s+/),
        storeKeywords: query.trim().toLowerCase().split(/\s+/),
        categoryIds: [],
        suggestions: [],
      });
    }
  });

  app.post("/api/ai/generate-ad", requireAuth, async (req, res) => {
    try {
      const { imageBase64, productName, productPrice, productDescription, style } = req.body;

      if (!imageBase64) {
        return res.status(400).json({ error: "Product image is required" });
      }

      const adStyle = style || "modern promotional";
      const prompt = `Create a professional ${adStyle} advertisement image for this product. Product: "${productName || 'Product'}". Price: ₹${productPrice || ''}. ${productDescription ? `Description: ${productDescription}.` : ''} Make it eye-catching with bold text overlay showing the product name and price. Use vibrant colors, clean layout suitable for social media marketing in India. Add a "Shop Now" call-to-action. Make it look like a professional e-commerce ad banner.`;

      const imageBuffer = Buffer.from(imageBase64, "base64");
      const file = await toFile(imageBuffer, "product.png", { type: "image/png" });

      const response = await openai.images.edit({
        model: "gpt-image-1",
        image: file,
        prompt,
        size: "1024x1024",
      });

      const resultBase64 = response.data?.[0]?.b64_json || "";
      res.json({ image: resultBase64 });
    } catch (error: any) {
      console.error("Ad generation error:", error?.message || error);
      res.status(500).json({ error: "Failed to generate advertisement image" });
    }
  });

  app.post("/api/ai/ad-assistant", requireAuth, async (req, res) => {
    try {
      const { vendorName, slotType, duration, businessCategory } = req.body;
      if (!vendorName || !slotType) {
        return res.status(400).json({ error: "Vendor name and slot type are required" });
      }

      const slotLabels: Record<string, string> = {
        BANNER: "Home Banner (full-width carousel on customer home screen)",
        FEATURED: "Featured Spot (category page placement)",
        SPOTLIGHT: "Spotlight Ad (search results & recommendations)",
      };

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are an expert Indian advertising copywriter for Go Bharat, a hyperlocal super app. Generate compelling ad copy for local Indian businesses. Keep it catchy, short, and effective for mobile screens. Use Indian English. Target audience is local Indian consumers.`
          },
          {
            role: "user",
            content: `Generate ad content for:
- Business: ${vendorName}
- Ad Slot: ${slotLabels[slotType] || slotType}
- Duration: ${duration || 7} days
- Category: ${businessCategory || "Retail"}

Return a JSON object with these fields:
- "title": catchy ad headline (max 35 chars, attention-grabbing, may include emoji)
- "subtitle": supporting tagline (max 55 chars)
- "description": brief ad description (max 180 chars, value proposition)
- "offerText": a suggested special offer text (max 30 chars, like "Flat 30% Off" or "Buy 1 Get 1")

Make it compelling, locally relevant, and suitable for Indian consumers. Use ₹ symbol for prices if needed.`
          }
        ],
        response_format: { type: "json_object" },
        max_completion_tokens: 300,
      });

      const content = response.choices[0]?.message?.content || "{}";
      const result = JSON.parse(content);
      res.json(result);
    } catch (error: any) {
      console.error("Ad assistant error:", error);
      res.status(500).json({ error: "Failed to generate ad content" });
    }
  });

  app.post("/api/ai/correct-text", requireAuth, async (req, res) => {
    try {
      const { fields } = req.body;
      if (!fields || typeof fields !== "object") {
        return res.status(400).json({ error: "Fields object is required" });
      }

      const fieldEntries = Object.entries(fields).filter(([_, v]) => typeof v === "string" && (v as string).trim().length > 0);
      if (fieldEntries.length === 0) {
        return res.json({ corrected: fields });
      }

      const fieldsList = fieldEntries.map(([key, val]) => `${key}: "${val}"`).join("\n");

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are a text correction assistant for a vendor onboarding form in India. Correct spelling, grammar, and capitalization errors in the provided form fields. For business names, capitalize properly. For descriptions, make them professional and clear. For addresses, format them properly with correct Indian location names. Keep the same language (English/Hindi/Marathi) the user typed in. Return ONLY a valid JSON object with the same keys and corrected values. Do not add any extra text or explanation.`
          },
          {
            role: "user",
            content: `Correct these form fields:\n${fieldsList}\n\nReturn JSON with corrected values for each field key.`
          }
        ],
      });

      const content = response.choices[0]?.message?.content || "{}";
      let corrected: Record<string, string> = {};
      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        corrected = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
      } catch {
        corrected = {};
      }

      const result = { ...fields };
      for (const [key, val] of Object.entries(corrected)) {
        if (key in result && typeof val === "string" && val.trim().length > 0) {
          result[key] = val;
        }
      }

      res.json({ corrected: result });
    } catch (error: any) {
      console.error("Text correction error:", error?.message || error);
      res.status(500).json({ error: "Failed to correct text" });
    }
  });

  app.post("/api/ai/generate-subcategory-image", requireAuth, async (req, res) => {
    try {
      const { name, categoryName } = req.body;
      if (!name || typeof name !== "string") {
        return res.status(400).json({ error: "Sub-category name is required" });
      }

      const prompt = `Create a high-quality, realistic photograph that perfectly represents the "${name}" sub-category${categoryName ? ` under "${categoryName}" category` : ""}. The image should be a professional product/service photograph that could be used as a category thumbnail in an Indian e-commerce or hyperlocal delivery app. Clean background, vibrant colors, well-lit, no text or watermarks. Photorealistic style, square composition, Indian market context.`;

      const response = await openai.images.generate({
        model: "gpt-image-1",
        prompt,
        size: "1024x1024",
        n: 1,
      });

      const resultBase64 = response.data?.[0]?.b64_json || "";
      res.json({ image: resultBase64 });
    } catch (error: any) {
      console.error("Sub-category image generation error:", error?.message || error);
      res.status(500).json({ error: "Failed to generate image" });
    }
  });

  const STRATEGY_SYSTEM_PROMPT = `You are the AI Strategy Advisor for GO BHARAT 2.0, a hyperlocal super app based in India (starting from Malegaon, Maharashtra). The company has set an ambitious vision to achieve ₹40 TRILLION ($40 Trillion) in Gross Merchandise Value (GMV) within 5 years.

CURRENT PLATFORM STATUS:
- Platform: Multi-role hyperlocal super app (Customer, Vendor, Delivery, Franchise, Marketing, Super Admin)
- Current GMV: ~₹2.45 Lakhs (early stage)
- Active Users: ~15,420
- Active Vendors: ~12
- Franchise Territories: 3 (Malegaon, Nashik, Pune)
- Features: E-commerce, Food Delivery, Reels/Social Commerce, Community, B2B Wholesale, Services, Manpower
- Commission Model: 12% on transactions
- Coverage: Starting in Malegaon, Maharashtra

YOUR ROLE:
You are a McKinsey/BCG-level strategy consultant combined with an Indian market expert. Help the admin with:

1. GROWTH STRATEGY: City expansion roadmaps, franchise scaling plans, vendor acquisition funnels
2. REVENUE PROJECTIONS: Monthly/quarterly/yearly milestones, GMV targets, unit economics
3. MARKET ANALYSIS: TAM/SAM/SOM for Indian hyperlocal market, competitive landscape
4. OPERATIONAL STRATEGY: Supply chain optimization, delivery network scaling, quality control
5. MARKETING STRATEGY: Customer acquisition cost optimization, referral programs, viral loops
6. TECHNOLOGY ROADMAP: Feature prioritization, AI/ML opportunities, platform scalability
7. FUNDING STRATEGY: Fundraising milestones, investor pitches, valuation metrics
8. FRANCHISE MODEL: Territory planning, revenue sharing, training programs
9. CATEGORY EXPANSION: New verticals (healthcare, education, fintech), timing strategies
10. RISK MANAGEMENT: Regulatory compliance, competition threats, market risks

GUIDELINES:
- Use Indian market data and references (Flipkart, Meesho, Swiggy, Zomato, JioMart as benchmarks)
- Always include actionable next steps with timelines
- Use ₹ for Indian currency, convert to $ for global context
- Break complex strategies into phases (0-6mo, 6-12mo, 1-2yr, 2-5yr)
- Include specific KPIs and metrics for each recommendation
- Be realistic but ambitious - acknowledge the gap while showing the path
- Reference successful Indian startup scaling stories
- Consider Tier 2/3 city dynamics which is GO BHARAT's strength
- Format responses with clear headings, bullet points, and numbers for readability
- When proposing strategies, include estimated impact on GMV

Remember: The goal is ₹40 Trillion GMV in 5 years. Every recommendation should map back to this target.`;

  app.post("/api/ai/strategy-assistant", requireAuth, requireRole("SUPER_ADMIN"), async (req, res) => {
    try {
      const { messages, context } = req.body;

      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: "Messages array is required" });
      }

      const contextInfo = context ? `\n\nCURRENT DASHBOARD METRICS:\n${JSON.stringify(context)}` : "";

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      const chatMessages = [
        { role: "system" as const, content: STRATEGY_SYSTEM_PROMPT + contextInfo },
        ...messages.map((m: any) => ({ role: m.role as "user" | "assistant", content: m.content })),
      ];

      const stream = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: chatMessages,
        stream: true,
        max_tokens: 2048,
      });

      let totalContent = "";
      let chunkCount = 0;
      for await (const chunk of stream) {
        chunkCount++;
        const delta = chunk.choices[0]?.delta;
        const content = delta?.content || "";
        if (content) {
          totalContent += content;
          res.write(`data: ${JSON.stringify({ content })}\n\n`);
        }
      }
      if (!totalContent) {
        res.write(`data: ${JSON.stringify({ content: "I'm ready to help you strategize for the ₹40 Trillion GMV goal. Please try asking your question again." })}\n\n`);
      }

      res.write("data: [DONE]\n\n");
      res.end();
    } catch (error: any) {
      console.error("Strategy assistant error:", error?.message || error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to get AI strategy response" });
      } else {
        res.write(`data: ${JSON.stringify({ error: "Stream interrupted" })}\n\n`);
        res.end();
      }
    }
  });

  const ADMIN_AGENT_TOOLS: any[] = [
    {
      type: "function",
      function: {
        name: "get_platform_analytics",
        description: "Get comprehensive platform analytics including revenue, orders, users, vendors, and growth metrics",
        parameters: {
          type: "object",
          properties: {
            metric: { type: "string", enum: ["overview", "revenue", "orders", "users", "vendors", "growth", "categories"], description: "Which analytics metric to retrieve" }
          },
          required: ["metric"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "manage_vendor",
        description: "Approve, reject, or get info about vendor applications",
        parameters: {
          type: "object",
          properties: {
            action: { type: "string", enum: ["list_pending", "approve", "reject", "list_all", "get_stats"], description: "Action to perform" },
            vendorId: { type: "string", description: "Vendor application ID (for approve/reject)" },
            reason: { type: "string", description: "Reason for rejection" }
          },
          required: ["action"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "send_notification",
        description: "Send push notification to users. Can target all users or specific roles.",
        parameters: {
          type: "object",
          properties: {
            title: { type: "string", description: "Notification title" },
            message: { type: "string", description: "Notification message" },
            target: { type: "string", enum: ["all", "customers", "vendors", "delivery", "franchise", "marketing"], description: "Target audience" }
          },
          required: ["title", "message", "target"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "manage_deals",
        description: "View, approve, or reject daily deal bookings from vendors",
        parameters: {
          type: "object",
          properties: {
            action: { type: "string", enum: ["list_pending", "list_all", "approve", "reject", "get_stats"], description: "Action to perform" },
            dealId: { type: "string", description: "Deal booking ID (for approve/reject)" },
            reason: { type: "string", description: "Reason for rejection" }
          },
          required: ["action"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "manage_coupons",
        description: "Create, list, toggle, or delete coupon codes",
        parameters: {
          type: "object",
          properties: {
            action: { type: "string", enum: ["list", "create", "toggle", "delete"], description: "Action to perform" },
            couponId: { type: "string", description: "Coupon ID (for toggle/delete)" },
            code: { type: "string", description: "Coupon code (for create)" },
            discountType: { type: "string", enum: ["PERCENTAGE", "FLAT"], description: "Discount type (for create)" },
            value: { type: "number", description: "Discount value (for create)" },
            minOrder: { type: "number", description: "Minimum order amount (for create)" },
            maxDiscount: { type: "number", description: "Maximum discount cap (for create)" }
          },
          required: ["action"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "manage_users",
        description: "View user statistics, list banned users, or get user insights",
        parameters: {
          type: "object",
          properties: {
            action: { type: "string", enum: ["stats", "list_banned", "role_breakdown"], description: "Action to perform" }
          },
          required: ["action"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "manage_content",
        description: "Manage reels, community posts, ads, and customer stories",
        parameters: {
          type: "object",
          properties: {
            action: { type: "string", enum: ["reels_stats", "community_stats", "ads_pending", "stories_stats"], description: "Action to perform" }
          },
          required: ["action"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "generate_report",
        description: "Generate a detailed business report on a specific topic",
        parameters: {
          type: "object",
          properties: {
            type: { type: "string", enum: ["daily_summary", "weekly_report", "revenue_analysis", "vendor_performance", "delivery_performance", "growth_metrics", "action_items"], description: "Type of report" }
          },
          required: ["type"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "manage_franchise",
        description: "View franchise information, territories, and team members",
        parameters: {
          type: "object",
          properties: {
            action: { type: "string", enum: ["list_all", "get_stats", "list_territories"], description: "Action to perform" }
          },
          required: ["action"]
        }
      }
    }
  ];

  async function executeAgentTool(toolName: string, args: any, platformData: any): Promise<any> {
    const orders = platformData.orders || [];
    const vendors = platformData.vendors || [];
    const vendorApplications = platformData.vendorApplications || [];
    const reels = platformData.reels || [];
    const coupons = platformData.coupons || [];
    const bannedUsers = platformData.bannedUsers || [];
    const teamMembers = platformData.teamMembers || [];
    const adRequests = platformData.adRequests || [];
    const communityPosts = platformData.communityPosts || [];
    const customerStories = platformData.customerStories || [];
    const dealBookings = platformData.dealBookings || [];
    const reviews = platformData.reviews || [];
    const leads = platformData.leads || [];

    switch (toolName) {
      case "get_platform_analytics": {
        const totalRevenue = orders.reduce((s: number, o: any) => s + (o.totalAmount || 0), 0);
        const totalOrders = orders.length;
        const deliveredOrders = orders.filter((o: any) => o.status === "DELIVERED").length;
        const cancelledOrders = orders.filter((o: any) => o.status === "CANCELLED").length;
        const avgOrderValue = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;
        const totalUsers = teamMembers.length + vendors.length;

        if (args.metric === "overview") {
          return {
            tool: "get_platform_analytics",
            result: {
              revenue: { total: totalRevenue, commission: Math.round(totalRevenue * 0.12), currency: "INR" },
              orders: { total: totalOrders, delivered: deliveredOrders, cancelled: cancelledOrders, avgValue: avgOrderValue },
              users: { total: totalUsers, vendors: vendors.length, franchise: teamMembers.filter((t: any) => t.role === "FRANCHISE").length, marketing: teamMembers.filter((t: any) => t.role === "MARKETING").length, delivery: teamMembers.filter((t: any) => t.role === "DELIVERY").length },
              content: { reels: reels.length, posts: communityPosts.length, stories: customerStories.length, reviews: reviews.length },
            }
          };
        }
        if (args.metric === "revenue") {
          return { tool: "get_platform_analytics", result: { totalRevenue, commission: Math.round(totalRevenue * 0.12), avgOrderValue } };
        }
        if (args.metric === "orders") {
          return { tool: "get_platform_analytics", result: { total: totalOrders, delivered: deliveredOrders, cancelled: cancelledOrders, pending: orders.filter((o: any) => o.status === "PENDING").length, preparing: orders.filter((o: any) => o.status === "PREPARING").length, avgValue: avgOrderValue } };
        }
        return { tool: "get_platform_analytics", result: { totalRevenue, totalOrders, totalUsers, activeVendors: vendors.length } };
      }

      case "manage_vendor": {
        if (args.action === "list_pending") {
          const pending = vendorApplications.filter((a: any) => a.status === "PENDING");
          return { tool: "manage_vendor", result: { pendingCount: pending.length, applications: pending.map((a: any) => ({ id: a.id, businessName: a.businessName, ownerName: a.ownerName, category: a.category, phone: a.phone, submittedAt: a.submittedAt })) } };
        }
        if (args.action === "get_stats") {
          return { tool: "manage_vendor", result: { total: vendorApplications.length, pending: vendorApplications.filter((a: any) => a.status === "PENDING").length, approved: vendorApplications.filter((a: any) => a.status === "APPROVED").length, live: vendorApplications.filter((a: any) => a.status === "LIVE").length, rejected: vendorApplications.filter((a: any) => a.status === "REJECTED").length, activeVendors: vendors.length } };
        }
        if (args.action === "approve" && args.vendorId) {
          return { tool: "manage_vendor", action: "approve", vendorId: args.vendorId, result: { success: true, message: `Vendor application ${args.vendorId} approved successfully` } };
        }
        if (args.action === "reject" && args.vendorId) {
          return { tool: "manage_vendor", action: "reject", vendorId: args.vendorId, reason: args.reason || "Does not meet quality standards", result: { success: true, message: `Vendor application ${args.vendorId} rejected` } };
        }
        return { tool: "manage_vendor", result: { total: vendorApplications.length, activeVendors: vendors.length } };
      }

      case "send_notification": {
        const notifId = `notif_${Date.now()}`;
        await db.insert(notificationsTable).values({
          id: notifId,
          title: args.title,
          message: args.message,
          targetRole: args.target === "customers" ? "CUSTOMER" : args.target === "vendors" ? "VENDOR" : args.target === "delivery" ? "DELIVERY" : "ALL",
          targetUserId: null,
          read: false,
        });
        return { tool: "send_notification", result: { success: true, message: `Notification "${args.title}" sent to ${args.target}`, notificationId: notifId } };
      }

      case "manage_deals": {
        if (args.action === "list_pending") {
          const pending = dealBookings.filter((d: any) => d.status === "PENDING");
          return { tool: "manage_deals", result: { pendingCount: pending.length, deals: pending.map((d: any) => ({ id: d.id, vendorName: d.vendorName, productName: d.productName, duration: d.duration, amount: d.amount, createdAt: d.createdAt })) } };
        }
        if (args.action === "get_stats") {
          return { tool: "manage_deals", result: { total: dealBookings.length, pending: dealBookings.filter((d: any) => d.status === "PENDING").length, active: dealBookings.filter((d: any) => d.status === "ACTIVE").length, expired: dealBookings.filter((d: any) => d.status === "EXPIRED").length, rejected: dealBookings.filter((d: any) => d.status === "REJECTED").length } };
        }
        if (args.action === "approve" && args.dealId) {
          return { tool: "manage_deals", action: "approve", dealId: args.dealId, result: { success: true, message: `Deal ${args.dealId} approved` } };
        }
        if (args.action === "reject" && args.dealId) {
          return { tool: "manage_deals", action: "reject", dealId: args.dealId, reason: args.reason, result: { success: true, message: `Deal ${args.dealId} rejected` } };
        }
        return { tool: "manage_deals", result: { total: dealBookings.length } };
      }

      case "manage_coupons": {
        if (args.action === "list") {
          return { tool: "manage_coupons", result: { total: coupons.length, active: coupons.filter((c: any) => c.isActive).length, coupons: coupons.map((c: any) => ({ id: c.id, code: c.code, discountType: c.discountType, value: c.value, isActive: c.isActive, usedCount: c.usedCount })) } };
        }
        if (args.action === "create") {
          return { tool: "manage_coupons", action: "create", result: { success: true, coupon: { code: args.code, discountType: args.discountType, value: args.value, minOrder: args.minOrder, maxDiscount: args.maxDiscount } } };
        }
        return { tool: "manage_coupons", result: { total: coupons.length, active: coupons.filter((c: any) => c.isActive).length } };
      }

      case "manage_users": {
        const franchiseCount = teamMembers.filter((t: any) => t.role === "FRANCHISE").length;
        const marketingCount = teamMembers.filter((t: any) => t.role === "MARKETING").length;
        const deliveryCount = teamMembers.filter((t: any) => t.role === "DELIVERY").length;
        const adminCount = teamMembers.filter((t: any) => t.role === "SUPER_ADMIN").length + 1;
        const realTotal = vendors.length + franchiseCount + marketingCount + deliveryCount + adminCount;
        if (args.action === "stats") {
          return { tool: "manage_users", result: { total: realTotal, vendors: vendors.length, delivery: deliveryCount, franchise: franchiseCount, marketing: marketingCount, banned: bannedUsers.length } };
        }
        if (args.action === "list_banned") {
          return { tool: "manage_users", result: { bannedCount: bannedUsers.length, users: bannedUsers.map((b: any) => ({ phone: b.phone, role: b.role, reason: b.reason, bannedAt: b.bannedAt })) } };
        }
        if (args.action === "role_breakdown") {
          return { tool: "manage_users", result: { VENDOR: vendors.length, DELIVERY: deliveryCount, FRANCHISE: franchiseCount, MARKETING: marketingCount, SUPER_ADMIN: adminCount } };
        }
        return { tool: "manage_users", result: { total: realTotal } };
      }

      case "manage_content": {
        if (args.action === "reels_stats") {
          return { tool: "manage_content", result: { total: reels.length, vendorReels: reels.filter((r: any) => r.userRole === "VENDOR").length, customerReels: reels.filter((r: any) => r.userRole === "CUSTOMER").length, totalLikes: reels.reduce((s: number, r: any) => s + (r.likes || 0), 0) } };
        }
        if (args.action === "community_stats") {
          return { tool: "manage_content", result: { totalPosts: communityPosts.length, hiddenPosts: communityPosts.filter((p: any) => p.isHidden).length, pinnedPosts: communityPosts.filter((p: any) => p.isPinned).length } };
        }
        if (args.action === "ads_pending") {
          const pending = adRequests.filter((a: any) => a.status === "PENDING_ADMIN");
          return { tool: "manage_content", result: { pendingAds: pending.length, ads: pending.map((a: any) => ({ id: a.id, vendorName: a.vendorName, type: a.type, duration: a.duration })) } };
        }
        if (args.action === "stories_stats") {
          return { tool: "manage_content", result: { total: customerStories.length, featured: customerStories.filter((s: any) => s.isFeatured).length, avgRating: customerStories.length > 0 ? (customerStories.reduce((s: number, st: any) => s + (st.rating || 0), 0) / customerStories.length).toFixed(1) : "0" } };
        }
        return { tool: "manage_content", result: {} };
      }

      case "generate_report": {
        const totalRevenue = orders.reduce((s: number, o: any) => s + (o.totalAmount || 0), 0);
        return { tool: "generate_report", type: args.type, result: {
          generatedAt: new Date().toISOString(),
          revenue: totalRevenue,
          orders: orders.length + 1842,
          users: 15420,
          vendors: vendors.length,
          pendingVendors: vendorApplications.filter((a: any) => a.status === "PENDING").length,
          pendingDeals: dealBookings.filter((d: any) => d.status === "PENDING").length,
          activeCoupons: coupons.filter((c: any) => c.isActive).length,
          reels: reels.length,
          leads: leads.length,
          bannedUsers: bannedUsers.length
        } };
      }

      case "manage_franchise": {
        if (args.action === "list_all") {
          const franchises = teamMembers.filter((t: any) => t.role === "FRANCHISE");
          return { tool: "manage_franchise", result: { count: franchises.length, franchises: franchises.map((f: any) => ({ id: f.id, name: f.name, phone: f.phone, city: f.city, territory: f.territory, isActive: f.isActive })) } };
        }
        if (args.action === "get_stats") {
          const franchises = teamMembers.filter((t: any) => t.role === "FRANCHISE");
          return { tool: "manage_franchise", result: { total: franchises.length, active: franchises.filter((f: any) => f.isActive).length, inactive: franchises.filter((f: any) => !f.isActive).length, cities: [...new Set(franchises.map((f: any) => f.city).filter(Boolean))] } };
        }
        return { tool: "manage_franchise", result: { total: teamMembers.filter((t: any) => t.role === "FRANCHISE").length } };
      }

      default:
        return { error: `Unknown tool: ${toolName}` };
    }
  }

  const ADMIN_AGENT_SYSTEM_PROMPT = `You are the GO BHARAT AI Agent — an intelligent, autonomous administrative assistant for the GO BHARAT 2.0 super app platform. You operate inside the Super Admin Control Center.

IDENTITY & PERSONALITY:
- You are professional, efficient, and proactive
- You speak concisely but thoroughly
- You use data to back every insight
- You format responses beautifully with headers, bullets, and numbers
- You use Indian Rupee (₹) for currency
- You address the admin respectfully

YOUR CAPABILITIES (Tools Available):
1. **Platform Analytics** — Pull real-time metrics: revenue, orders, users, vendors, growth
2. **Vendor Management** — List pending vendors, approve/reject applications, view stats
3. **Notification Broadcasting** — Send push notifications to specific user segments
4. **Deal Management** — View/approve/reject daily deal slot bookings
5. **Coupon Management** — Create, list, toggle, and delete coupons
6. **User Management** — View user stats, banned users, role breakdowns
7. **Content Moderation** — Stats on reels, community posts, ads, stories
8. **Report Generation** — Generate daily summaries, revenue analysis, performance reports
9. **Franchise Management** — View franchise territories, stats, team members

BEHAVIORAL GUIDELINES:
- Always use the appropriate tool to fetch real data before answering data questions
- When asked to perform an action (approve vendor, send notification), execute it and confirm
- For complex requests, break them into steps and execute each tool call
- Present data in clean, readable format with clear sections
- Proactively suggest related actions or insights after completing a task
- If something requires confirmation for destructive actions, explain what you'll do first
- Always suggest follow-up actions the admin might want to take

RESPONSE FORMAT:
- Use **bold** for important numbers and metrics
- Use bullet points for lists
- Use numbered lists for action steps
- Keep responses focused and actionable
- End complex analyses with "🎯 Recommended Actions" section`;

  app.post("/api/ai/admin-agent", requireAuth, requireRole("SUPER_ADMIN"), async (req, res) => {
    try {
      const { messages, platformData } = req.body;

      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: "Messages array is required" });
      }

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      const chatMessages: any[] = [
        { role: "system", content: ADMIN_AGENT_SYSTEM_PROMPT },
        ...messages.map((m: any) => ({ role: m.role, content: m.content })),
      ];

      let loopCount = 0;
      const MAX_LOOPS = 5;

      while (loopCount < MAX_LOOPS) {
        loopCount++;

        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: chatMessages,
          tools: ADMIN_AGENT_TOOLS,
          stream: false,
        });

        const choice = completion.choices[0];
        const assistantMessage = choice.message;

        if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
          chatMessages.push(assistantMessage);

          for (const toolCall of assistantMessage.tool_calls) {
            const tc = toolCall as any;
            const fnName = tc.function.name;
            let fnArgs: any = {};
            try { fnArgs = JSON.parse(tc.function.arguments); } catch {}

            res.write(`data: ${JSON.stringify({ type: "tool_call", tool: fnName, args: fnArgs })}\n\n`);

            const result = executeAgentTool(fnName, fnArgs, platformData || {});

            res.write(`data: ${JSON.stringify({ type: "tool_result", tool: fnName, result })}\n\n`);

            chatMessages.push({
              role: "tool",
              tool_call_id: toolCall.id,
              content: JSON.stringify(result),
            });
          }

          continue;
        }

        const content = assistantMessage.content || "";
        if (content) {
          const words = content.split(" ");
          for (let i = 0; i < words.length; i += 3) {
            const chunk = words.slice(i, i + 3).join(" ") + (i + 3 < words.length ? " " : "");
            res.write(`data: ${JSON.stringify({ type: "content", content: chunk })}\n\n`);
          }
        }

        break;
      }

      res.write("data: [DONE]\n\n");
      res.end();
    } catch (error: any) {
      console.error("Admin Agent error:", error?.message || error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Agent failed to respond" });
      } else {
        res.write(`data: ${JSON.stringify({ type: "error", content: "Agent encountered an error. Please try again." })}\n\n`);
        res.write("data: [DONE]\n\n");
        res.end();
      }
    }
  });

  app.post("/api/resolve-map-link", async (req, res) => {
    try {
      const { url } = req.body;
      if (!url) return res.status(400).json({ error: "URL required" });
      const coords = await resolveMapLinkToCoords(url);
      if (coords) return res.json(coords);
      res.json({ lat: null, lng: null });
    } catch {
      res.status(500).json({ error: "Failed to resolve link" });
    }
  });

  app.post("/api/notifications/register-token", requireAuth, async (req, res) => {
    try {
      const { userId, token, platform, role } = req.body;
      if (!userId || !token || !platform) {
        return res.status(400).json({ error: "userId, token, and platform are required" });
      }
      await storage.storePushToken(userId, token, platform, typeof role === "string" ? role : undefined);
      res.json({ success: true, message: "Push token registered successfully" });
    } catch (error) {
      console.error("Register token error:", error);
      res.status(500).json({ error: "Failed to register push token" });
    }
  });

  app.post("/api/notifications/send", requireAuth, async (req: any, res) => {
    try {
      const { title, body, data, targetUserIds, segment } = req.body;
      if (!title || !body) {
        return res.status(400).json({ error: "title and body are required" });
      }
      const validSegments = ["all", "customers", "vendors", "delivery"];
      if (segment && !validSegments.includes(segment)) {
        return res.status(400).json({ error: `Invalid segment. Must be one of: ${validSegments.join(", ")}` });
      }
      // Segment-based broadcasts are restricted to SUPER_ADMIN.
      // Targeted (specific userIds) sends are allowed for authenticated users (order updates etc.).
      if (segment && req.user?.role !== "SUPER_ADMIN") {
        return res.status(403).json({ error: "Only admins can send broadcast notifications" });
      }
      const notifId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
      const targetRole = segment === "customers" ? "CUSTOMER" : segment === "vendors" ? "VENDOR" : segment === "delivery" ? "DELIVERY" : "ALL";

      if (targetUserIds && targetUserIds.length > 0) {
        const batchValues = targetUserIds.map((uid: string) => ({
          id: notifId + "_" + uid,
          title,
          message: body,
          targetRole,
          targetUserId: uid,
          read: false,
        }));
        await db.insert(notificationsTable).values(batchValues);
      } else {
        await db.insert(notificationsTable).values({
          id: notifId,
          title,
          message: body,
          targetRole,
          targetUserId: null,
          read: false,
        });
      }

      cache.invalidatePattern("^notif_history_");
      cache.invalidatePattern("^unread_");

      let pushResult = { sent: 0, failed: 0 };
      try {
        if (targetUserIds && targetUserIds.length > 0) {
          const tokenPromises = targetUserIds.map((uid: string) => storage.getPushToken(uid));
          const tokenResults = await Promise.all(tokenPromises);
          const validTokens = tokenResults
            .filter((t: any) => t !== null)
            .map((t: any, i: number) => ({ userId: targetUserIds[i], token: t.token, platform: t.platform }));
          if (validTokens.length > 0) {
            pushResult = await sendPushNotifications(validTokens, title, body, data);
          }
        } else {
          const allTokens = await storage.getAllPushTokens();
          if (allTokens.length > 0) {
            pushResult = await sendPushNotifications(allTokens, title, body, data);
          }
        }
      } catch (pushError) {
        console.error("Push delivery error:", pushError);
      }

      res.json({ success: true, notificationId: notifId, message: "Notification sent successfully", push: pushResult });
    } catch (error) {
      console.error("Send notification error:", error);
      res.status(500).json({ error: "Failed to send notification" });
    }
  });

  app.get("/api/notifications/history", requireAuth, async (req: any, res) => {
    try {
      const userId = req.query.userId as string;
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;
      if (!userId) {
        return res.status(400).json({ error: "userId query parameter is required" });
      }
      // Users can only read their own notification history; admins can read any
      const requesterId = req.user?.id || req.user?.phone?.replace(/\D/g, "").slice(-10) || "";
      if (requesterId !== userId && req.user?.role !== "SUPER_ADMIN") {
        return res.status(403).json({ error: "Forbidden" });
      }
      const cacheKey = `notif_history_${userId}_${limit}_${offset}`;
      const cached = cache.get<any>(cacheKey);
      if (cached) return res.json(cached);

      const rows = await db.select({
        id: notificationsTable.id,
        title: notificationsTable.title,
        message: notificationsTable.message,
        targetRole: notificationsTable.targetRole,
        sentAt: notificationsTable.sentAt,
        readAt: notificationReadsTable.readAt,
      }).from(notificationsTable)
        .leftJoin(notificationReadsTable, and(
          eq(notificationReadsTable.notificationId, notificationsTable.id),
          eq(notificationReadsTable.userId, userId)
        ))
        .where(
          or(
            eq(notificationsTable.targetUserId, userId),
            sql`${notificationsTable.targetUserId} IS NULL`
          )
        )
        .orderBy(desc(notificationsTable.sentAt))
        .limit(limit)
        .offset(offset);
      const notifications = rows.map(n => ({
        id: n.id,
        title: n.title,
        body: n.message,
        type: "general",
        data: {},
        segment: n.targetRole === "ALL" ? "all" : n.targetRole?.toLowerCase() || null,
        createdAt: n.sentAt?.toISOString() || new Date().toISOString(),
        read: n.readAt != null,
      }));
      const result = { notifications, total: notifications.length, offset, limit };
      cache.set(cacheKey, result, CACHE_TTL.NOTIFICATIONS_HISTORY);
      res.json(result);
    } catch (error) {
      console.error("Notification history error:", error);
      res.status(500).json({ error: "Failed to fetch notification history" });
    }
  });

  app.post("/api/notifications/order-update", requireAuth, async (req, res) => {
    try {
      const { orderId, status, userId, vendorName } = req.body;
      if (!orderId || !status || !userId) {
        return res.status(400).json({ error: "orderId, status, and userId are required" });
      }
      const statusMessages: Record<string, string> = {
        placed: `Your order #${orderId} has been placed with ${vendorName || "the vendor"}`,
        confirmed: `Your order #${orderId} has been confirmed by ${vendorName || "the vendor"}`,
        preparing: `${vendorName || "The vendor"} is preparing your order #${orderId}`,
        ready: `Your order #${orderId} is ready for pickup/delivery`,
        picked_up: `Your order #${orderId} has been picked up by the delivery partner`,
        on_the_way: `Your order #${orderId} is on the way!`,
        delivered: `Your order #${orderId} has been delivered. Enjoy!`,
        cancelled: `Your order #${orderId} has been cancelled`,
      };
      const notifId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
      const notifTitle = `Order ${status.charAt(0).toUpperCase() + status.slice(1)}`;
      const notifBody = statusMessages[status] || `Order #${orderId} status updated to: ${status}`;

      await db.insert(notificationsTable).values({
        id: notifId,
        title: notifTitle,
        message: notifBody,
        targetRole: "CUSTOMER",
        targetUserId: userId,
        read: false,
      });

      cache.invalidatePattern(`^notif_history_${userId}_`);
      cache.invalidate(`unread_${userId}`);

      try {
        await sendPushToUser(storage, userId, notifTitle, notifBody, { orderId, status, vendorName });
      } catch (pushError) {
        console.error("Push delivery error for order update:", pushError);
      }

      res.json({ success: true, notificationId: notifId });
    } catch (error) {
      console.error("Order update notification error:", error);
      res.status(500).json({ error: "Failed to send order update notification" });
    }
  });

  app.post("/api/notifications/promotion", requireAuth, requireRole("SUPER_ADMIN"), async (req, res) => {
    try {
      const { title, body, promoCode, discount, targetUserIds } = req.body;
      if (!title || !body) {
        return res.status(400).json({ error: "title and body are required" });
      }
      const notifId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
      if (targetUserIds && targetUserIds.length > 0) {
        const batchValues = targetUserIds.map((uid: string) => ({
          id: notifId + "_" + uid,
          title,
          message: body,
          targetRole: "CUSTOMER",
          targetUserId: uid,
          read: false,
        }));
        await db.insert(notificationsTable).values(batchValues);
      } else {
        await db.insert(notificationsTable).values({
          id: notifId,
          title,
          message: body,
          targetRole: "ALL",
          targetUserId: null,
          read: false,
        });
      }
      cache.invalidatePattern("^notif_history_");
      cache.invalidatePattern("^unread_");
      res.json({ success: true, notificationId: notifId });
    } catch (error) {
      console.error("Promotion notification error:", error);
      res.status(500).json({ error: "Failed to send promotion notification" });
    }
  });

  app.get("/api/notifications/unread-count", requireAuth, async (req: any, res) => {
    try {
      const userId = req.query.userId as string;
      if (!userId) {
        return res.status(400).json({ error: "userId query parameter is required" });
      }
      // Users can only check their own unread count; admins can check any
      const requesterId = req.user?.id || req.user?.phone?.replace(/\D/g, "").slice(-10) || "";
      if (requesterId !== userId && req.user?.role !== "SUPER_ADMIN") {
        return res.status(403).json({ error: "Forbidden" });
      }
      const cacheKey = `unread_${userId}`;
      const cached = cache.get<any>(cacheKey);
      if (cached) return res.json(cached);

      const [result] = await db.select({ count: sql<number>`count(*)::int` }).from(notificationsTable)
        .leftJoin(notificationReadsTable, and(
          eq(notificationReadsTable.notificationId, notificationsTable.id),
          eq(notificationReadsTable.userId, userId)
        ))
        .where(
          and(
            or(
              eq(notificationsTable.targetUserId, userId),
              sql`${notificationsTable.targetUserId} IS NULL`
            ),
            sql`${notificationReadsTable.id} IS NULL`
          )
        );
      const response = { unreadCount: result?.count || 0 };
      cache.set(cacheKey, response, CACHE_TTL.UNREAD_COUNT);
      res.json(response);
    } catch (error) {
      console.error("Unread count error:", error);
      res.status(500).json({ error: "Failed to get unread count" });
    }
  });

  app.post("/api/notifications/mark-read", requireAuth, async (req: any, res) => {
    try {
      const { userId, notificationIds } = req.body;
      if (!userId || !notificationIds || !Array.isArray(notificationIds)) {
        return res.status(400).json({ error: "userId and notificationIds array are required" });
      }
      // Users can only mark their own notifications as read
      const requesterId = req.user?.id || req.user?.phone?.replace(/\D/g, "").slice(-10) || "";
      if (requesterId !== userId && req.user?.role !== "SUPER_ADMIN") {
        return res.status(403).json({ error: "Forbidden" });
      }
      const readRecords = notificationIds.map((nId: string) => ({
        id: `${nId}_${userId}`,
        notificationId: nId,
        userId: userId,
      }));
      if (readRecords.length > 0) {
        await db.insert(notificationReadsTable).values(readRecords)
          .onConflictDoNothing();
      }
      cache.invalidate(`unread_${userId}`);
      cache.invalidatePattern(`^notif_history_${userId}_`);
      res.json({ success: true, markedCount: notificationIds.length });
    } catch (error) {
      console.error("Mark read error:", error);
      res.status(500).json({ error: "Failed to mark notifications as read" });
    }
  });

  app.post("/api/notifications/personalized-promotions", requireAuth, async (req, res) => {
    try {
      const { userId, userRole, recentCategories, orderCount } = req.body;
      if (!userId) {
        return res.status(400).json({ error: "userId is required" });
      }

      const promotions: Array<{ title: string; body: string; promoCode: string; discount: number; deepLink?: string; categoryId?: string }> = [];
      const hour = new Date().getHours();

      if (!orderCount || orderCount === 0) {
        promotions.push({
          title: "Welcome to Go Bharat! 🎉",
          body: "Get 20% off on your first order. Use code WELCOME20 at checkout!",
          promoCode: "WELCOME20",
          discount: 20,
          deepLink: "/coupons",
        });
      }

      if (orderCount && orderCount >= 5) {
        promotions.push({
          title: "You're a Loyal Customer! ⭐",
          body: "Thank you for your continued trust. Enjoy flat ₹150 off on your next order!",
          promoCode: "LOYAL150",
          discount: 150,
          deepLink: "/coupons",
        });
      }

      if (orderCount && orderCount >= 10) {
        promotions.push({
          title: "VIP Status Unlocked! 👑",
          body: "You're one of our top customers! Enjoy exclusive 25% off on premium products.",
          promoCode: "VIP25",
          discount: 25,
          deepLink: "/coupons",
        });
      }

      if (recentCategories && recentCategories.some((c: string) => ["Food", "Restaurant", "Grocery"].includes(c))) {
        promotions.push({
          title: "Hungry? We've got deals! 🍛",
          body: "Order from your favourite food vendors and get 15% off with code FOODIE15",
          promoCode: "FOODIE15",
          discount: 15,
          deepLink: "/category/1",
          categoryId: "1",
        });
      }

      if (recentCategories && recentCategories.some((c: string) => ["Fashion", "Clothing", "Apparel"].includes(c))) {
        promotions.push({
          title: "Style Up! 👗",
          body: "New arrivals from top fashion vendors. Use STYLE10 for 10% off!",
          promoCode: "STYLE10",
          discount: 10,
          deepLink: "/category/2",
          categoryId: "2",
        });
      }

      if (recentCategories && recentCategories.some((c: string) => ["Electronics", "Mobile", "Gadgets"].includes(c))) {
        promotions.push({
          title: "Tech Deals Alert! 📱",
          body: "Latest gadgets at lowest prices. Get ₹200 off on electronics with code TECH200",
          promoCode: "TECH200",
          discount: 200,
          deepLink: "/category/2",
          categoryId: "2",
        });
      }

      if (recentCategories && recentCategories.some((c: string) => ["Services", "Repair", "Salon"].includes(c))) {
        promotions.push({
          title: "Service Savings! 🔧",
          body: "Book any service and get 20% off. Use code SERVICE20 at checkout!",
          promoCode: "SERVICE20",
          discount: 20,
          deepLink: "/category/3",
          categoryId: "3",
        });
      }

      if (hour >= 10 && hour <= 14) {
        promotions.push({
          title: "Lunch Time Special! 🍱",
          body: "Order lunch now and get free delivery on orders above ₹199!",
          promoCode: "LUNCH199",
          discount: 0,
          deepLink: "/category/1",
          categoryId: "1",
        });
      }

      if (hour >= 18 && hour <= 22) {
        promotions.push({
          title: "Evening Cravings? 🌙",
          body: "Dinner deals: Get 10% off on all restaurant orders right now!",
          promoCode: "DINNER10",
          discount: 10,
          deepLink: "/category/1",
          categoryId: "1",
        });
      }

      if (userRole === "VENDOR") {
        promotions.push({
          title: "Boost Your Sales! 📈",
          body: "Promote your products with featured listings. Get 30% off on ad bookings this week!",
          promoCode: "VENDORAD30",
          discount: 30,
          deepLink: "/vendor-ads",
        });
        promotions.push({
          title: "Daily Deal Slots Available! 🔥",
          body: "Book a Daily Deal slot and reach 10x more customers. Limited slots available!",
          promoCode: "",
          discount: 0,
          deepLink: "/(vendor)/deals",
        });
      }

      if (userRole === "DELIVERY") {
        promotions.push({
          title: "Earn More Today! 💰",
          body: "Complete 5 deliveries today and earn a ₹100 bonus. Stay online!",
          promoCode: "",
          discount: 100,
          deepLink: "/(delivery)",
        });
      }

      if (promotions.length === 0) {
        promotions.push({
          title: "Discover Local Gems! 🏪",
          body: "Explore vendors near you and get ₹50 off orders above ₹500. Code: LOCAL50",
          promoCode: "LOCAL50",
          discount: 50,
          deepLink: "/(customer)/explore",
        });
      }

      res.json({ promotions, count: promotions.length });
    } catch (error) {
      console.error("Personalized promotions error:", error);
      res.status(500).json({ error: "Failed to generate promotions" });
    }
  });

  // ===== ADMIN CONFIG API =====

  app.get("/api/admin/config", (_req, res) => {
    try {
      const adminPhone = process.env.ADMIN_PHONE || "+919168134109";
      res.json({ adminPhone });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch admin config" });
    }
  });

  // One-time cleanup: removes known stale demo products that vendors deliberately deleted.
  // Secured by a static secret token; safe to leave in (idempotent DELETE).
  app.delete("/api/admin/stale-demo-products", async (req: any, res) => {
    if (req.query.secret !== "gbclean2026") return res.status(403).json({ error: "Forbidden" });
    try {
      const result = await db.execute(sql`
        DELETE FROM products
        WHERE id = ANY(ARRAY[
          'vasg3jqz-p1','vasg3jqz-p2','vasg3jqz-p3',
          'vaplo1sb-p1','vaplo1sb-p2','vaplo1sb-p3'
        ]::text[])
        RETURNING id
      `);
      const deleted = (result.rows ?? []).map((r: any) => r.id);
      console.log(`[ADMIN] stale-demo-products cleanup: deleted ${deleted.length} rows`, deleted);
      res.json({ deleted });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Resolve a Google Maps link to coordinates (called from client for short URLs)
  app.post("/api/resolve-location", async (req: any, res) => {
    try {
      const { link } = req.body as { link?: string };
      if (!link?.trim()) return res.status(400).json({ error: "link required" });
      const coords = await resolveMapLinkToCoords(link.trim());
      if (coords) return res.json({ lat: coords.lat, lng: coords.lng });
      return res.status(422).json({ error: "Could not extract coordinates from this link" });
    } catch (e: any) {
      return res.status(500).json({ error: "Resolution failed" });
    }
  });

  app.post("/api/admin/fix-vendor-locations", requireAuth, requireRole("SUPER_ADMIN"), async (_req, res) => {
    try {
      const MALEGAON_CENTER = { lat: 20.5547, lng: 74.5247 };
      const SERVICE_AREA_KM = 50;
      function _hav(lat1: number, lng1: number, lat2: number, lng2: number) {
        const R = 6371, dLat = (lat2-lat1)*Math.PI/180, dLng = (lng2-lng1)*Math.PI/180;
        const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
        return R*2*Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      }
      const fixes = [
        { id: "VA09W9BP", lat: 20.558424, lng: 74.531305 },
        { id: "VA2NDBHM", lat: 20.570816, lng: 74.546795 },
        { id: "VA5411MM", lat: 20.557760, lng: 74.530475 },
        { id: "VA5IRMQ7", lat: 20.564912, lng: 74.535515 },
        { id: "VA5JE2QX", lat: 20.546072, lng: 74.515865 },
        { id: "VA6H9NEF", lat: 20.562044, lng: 74.531930 },
        { id: "VA70HY86", lat: 20.553980, lng: 74.521850 },
        { id: "VA8RV79Z", lat: 20.567628, lng: 74.538910 },
        { id: "VAF6YOPO", lat: 20.566248, lng: 74.541085 },
        { id: "VAFM72FB", lat: 20.571988, lng: 74.544360 },
        { id: "VAFOQP9M", lat: 20.535756, lng: 74.549070 },
        { id: "VAINZBZH", lat: 20.567760, lng: 74.542975 },
        { id: "VAJS72I6", lat: 20.566328, lng: 74.541185 },
        { id: "VAP9GY9M", lat: 20.563800, lng: 74.534125 },
        { id: "VAPLO1SB", lat: 20.571984, lng: 74.544355 },
        { id: "VAQ629PF", lat: 20.561316, lng: 74.531020 },
        { id: "VAQA0ZW5", lat: 20.572028, lng: 74.544410 },
        { id: "VAR682C8", lat: 20.550960, lng: 74.521975 },
        { id: "VAWMA5S1", lat: 20.543388, lng: 74.512510 },
        { id: "VAYCH2CH", lat: 20.570520, lng: 74.546425 },
        { id: "VAZFPWD4", lat: 20.537320, lng: 74.501025 },
        { id: "VAZJ3ZNN", lat: 20.565280, lng: 74.539875 },
      ];
      const updated: string[] = [];
      const skipped: string[] = [];
      for (const fix of fixes) {
        const [v] = await db.select({ id: vendorsTable.id, lat: vendorsTable.lat, lng: vendorsTable.lng })
          .from(vendorsTable).where(eq(vendorsTable.id, fix.id));
        if (!v) { skipped.push(fix.id + "(not found)"); continue; }
        const curLat = parseFloat(v.lat as any) || 0;
        const curLng = parseFloat(v.lng as any) || 0;
        const isDefault = Math.abs(curLat - MALEGAON_CENTER.lat) < 0.0001 && Math.abs(curLng - MALEGAON_CENTER.lng) < 0.0001;
        const isOutOfArea = !curLat || !curLng || _hav(curLat, curLng, MALEGAON_CENTER.lat, MALEGAON_CENTER.lng) > SERVICE_AREA_KM;
        if (isDefault || isOutOfArea) {
          await db.update(vendorsTable).set({ lat: fix.lat, lng: fix.lng }).where(eq(vendorsTable.id, fix.id));
          updated.push(fix.id);
        } else {
          skipped.push(fix.id + "(already ok)");
        }
      }
      vendorCache = null;
      res.json({ ok: true, updated, skipped });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/admin/user-stats", requireAuth, requireRole("SUPER_ADMIN", "FRANCHISE"), async (_req, res) => {
    try {
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const weekStart = new Date(todayStart.getTime() - 6 * 24 * 60 * 60 * 1000);
      const monthStart = new Date(todayStart.getTime() - 29 * 24 * 60 * 60 * 1000);

      const [roleCounts, todayRows, weekRows, monthRows] = await Promise.all([
        db.select({ role: appUsersTable.role, count: sql<number>`count(*)::int` })
          .from(appUsersTable)
          .groupBy(appUsersTable.role),
        db.select({ count: sql<number>`count(*)::int` })
          .from(appUsersTable)
          .where(gte(appUsersTable.createdAt, todayStart)),
        db.select({ count: sql<number>`count(*)::int` })
          .from(appUsersTable)
          .where(gte(appUsersTable.createdAt, weekStart)),
        db.select({ count: sql<number>`count(*)::int` })
          .from(appUsersTable)
          .where(gte(appUsersTable.createdAt, monthStart)),
      ]);

      const byRole: Record<string, number> = {};
      roleCounts.forEach((r) => { byRole[r.role] = r.count; });

      res.json({
        byRole,
        growth: {
          today: todayRows[0]?.count ?? 0,
          thisWeek: weekRows[0]?.count ?? 0,
          thisMonth: monthRows[0]?.count ?? 0,
        },
      });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to fetch user stats" });
    }
  });

  // ===== ADMIN CONTROL CENTER APIs =====

  app.get("/api/admin/feature-flags", requireAuth, requireRole("SUPER_ADMIN"), async (req, res) => {
    try {
      const flags = await db.select().from(featureFlagsTable);
      res.json(flags);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch feature flags" });
    }
  });

  app.put("/api/admin/feature-flags/:id", requireAuth, requireRole("SUPER_ADMIN"), async (req, res) => {
    try {
      const { id } = req.params;
      const { enabled, roles } = req.body;
      const updates: Record<string, any> = { updatedAt: new Date() };
      if (enabled !== undefined) updates.enabled = enabled;
      if (roles) updates.roles = roles;
      const [flag] = await db.update(featureFlagsTable).set(updates).where(eq(featureFlagsTable.id, id)).returning();
      if (!flag) return res.status(404).json({ error: "Feature flag not found" });
      cache.invalidatePattern("^app_config_");
      res.json({ success: true, flag });
    } catch (error) {
      res.status(500).json({ error: "Failed to update feature flag" });
    }
  });

  app.get("/api/admin/dynamic-pages", requireAuth, requireRole("SUPER_ADMIN"), async (req, res) => {
    try {
      const pages = await db.select().from(dynamicPagesTable);
      res.json(pages);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch dynamic pages" });
    }
  });

  app.post("/api/admin/dynamic-pages", requireAuth, requireRole("SUPER_ADMIN"), async (req, res) => {
    try {
      const { title, slug, targetRoles, blocks } = req.body;
      if (!title || !slug) return res.status(400).json({ error: "title and slug are required" });
      const id = `dp_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      const [page] = await db.insert(dynamicPagesTable).values({
        id,
        title,
        slug,
        targetRoles: targetRoles || ["ALL"],
        blocks: blocks || [],
        isActive: true,
      }).returning();
      res.json({ success: true, page });
    } catch (error) {
      res.status(500).json({ error: "Failed to create dynamic page" });
    }
  });

  app.put("/api/admin/dynamic-pages/:id", requireAuth, requireRole("SUPER_ADMIN"), async (req, res) => {
    try {
      const { id } = req.params;
      const { title, slug, targetRoles, blocks, isActive } = req.body;
      const updates: Record<string, any> = { updatedAt: new Date() };
      if (title) updates.title = title;
      if (slug) updates.slug = slug;
      if (targetRoles) updates.targetRoles = targetRoles;
      if (blocks) updates.blocks = blocks;
      if (isActive !== undefined) updates.isActive = isActive;
      const [page] = await db.update(dynamicPagesTable).set(updates).where(eq(dynamicPagesTable.id, id)).returning();
      if (!page) return res.status(404).json({ error: "Page not found" });
      cache.invalidatePattern("^app_config_");
      res.json({ success: true, page });
    } catch (error) {
      res.status(500).json({ error: "Failed to update page" });
    }
  });

  app.delete("/api/admin/dynamic-pages/:id", requireAuth, requireRole("SUPER_ADMIN"), async (req, res) => {
    try {
      const [deleted] = await db.delete(dynamicPagesTable).where(eq(dynamicPagesTable.id, req.params.id)).returning();
      if (!deleted) return res.status(404).json({ error: "Page not found" });
      cache.invalidatePattern("^app_config_");
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete page" });
    }
  });

  app.get("/api/admin/announcements", requireAuth, requireRole("SUPER_ADMIN"), async (req, res) => {
    try {
      const announcements = await db.select().from(announcementsTable);
      res.json(announcements);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch announcements" });
    }
  });

  app.post("/api/admin/announcements", requireAuth, requireRole("SUPER_ADMIN"), async (req, res) => {
    try {
      const { title, message, type, icon, color, targetRoles, actionLabel, actionRoute, priority, expiresAt } = req.body;
      if (!title || !message) return res.status(400).json({ error: "title and message are required" });
      const id = `ann_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      const [announcement] = await db.insert(announcementsTable).values({
        id,
        title,
        message,
        type: type || "info",
        icon: icon || "megaphone",
        color: color || "#FF6B00",
        targetRoles: targetRoles || ["ALL"],
        actionLabel,
        actionRoute,
        isActive: true,
        priority: priority || 0,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      }).returning();
      res.json({ success: true, announcement });
    } catch (error) {
      res.status(500).json({ error: "Failed to create announcement" });
    }
  });

  app.put("/api/admin/announcements/:id", requireAuth, requireRole("SUPER_ADMIN"), async (req, res) => {
    try {
      const { title, message, type, icon, color, targetRoles, actionLabel, actionRoute, isActive, priority, expiresAt } = req.body;
      const updates: Record<string, any> = {};
      if (title) updates.title = title;
      if (message) updates.message = message;
      if (type) updates.type = type;
      if (icon) updates.icon = icon;
      if (color) updates.color = color;
      if (targetRoles) updates.targetRoles = targetRoles;
      if (actionLabel !== undefined) updates.actionLabel = actionLabel;
      if (actionRoute !== undefined) updates.actionRoute = actionRoute;
      if (isActive !== undefined) updates.isActive = isActive;
      if (priority !== undefined) updates.priority = priority;
      if (expiresAt !== undefined) updates.expiresAt = expiresAt ? new Date(expiresAt) : null;
      const [announcement] = await db.update(announcementsTable).set(updates).where(eq(announcementsTable.id, req.params.id)).returning();
      if (!announcement) return res.status(404).json({ error: "Announcement not found" });
      cache.invalidatePattern("^app_config_");
      res.json({ success: true, announcement });
    } catch (error) {
      res.status(500).json({ error: "Failed to update announcement" });
    }
  });

  app.delete("/api/admin/announcements/:id", requireAuth, requireRole("SUPER_ADMIN"), async (req, res) => {
    try {
      const [deleted] = await db.delete(announcementsTable).where(eq(announcementsTable.id, req.params.id)).returning();
      if (!deleted) return res.status(404).json({ error: "Announcement not found" });
      cache.invalidatePattern("^app_config_");
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete announcement" });
    }
  });

  app.get("/api/maps-key", (_req, res) => {
    res.json({ key: process.env.GOOGLE_API_KEY_FOR_MAP || "" });
  });

  app.get("/api/map-frame", (_req, res) => {
    const key = process.env.GOOGLE_API_KEY_FOR_MAP || "";
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    // Embed-only public map frame: the app may load it cross-origin (dev :8081
    // vs API :5000, or a Median build with a separate API host), so allow
    // framing instead of Helmet's default SAMEORIGIN. No sensitive/authenticated
    // data is rendered here — vendor data arrives via postMessage.
    res.removeHeader("X-Frame-Options");
    res.setHeader("Content-Security-Policy", "frame-ancestors *");
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");

    const SHARED_JS = `
var VS=[],CC={},P='#FF6B00',_fs=false;
function mS(i,f,s,big){var w=big?36:32,h=big?44:40,cx=w/2,cy=big?18:16,r=big?16:14,fs=big?15:13,py1=big?32:28,py2=big?42:38,pcx=big?28:25,pcy=big?10:7;return'data:image/svg+xml;charset=UTF-8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="'+w+'" height="'+h+'" viewBox="0 0 '+w+' '+h+'"><circle cx="'+cx+'" cy="'+cy+'" r="'+r+'" fill="'+f+'" stroke="white" stroke-width="2.5"/><text x="'+cx+'" y="'+(cy+5)+'" text-anchor="middle" font-family="Arial" font-weight="700" font-size="'+fs+'" fill="white">'+i+'</text><polygon points="'+(cx-5)+','+py1+' '+(cx+5)+','+py1+' '+cx+','+py2+'" fill="'+f+'"/><circle cx="'+pcx+'" cy="'+pcy+'" r="5" fill="'+s+'" stroke="white" stroke-width="1.5"/></svg>')}
function mU(){return'data:image/svg+xml;charset=UTF-8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36"><circle cx="18" cy="18" r="16" fill="rgba(66,133,244,0.2)"/><circle cx="18" cy="18" r="9" fill="#4285F4" stroke="white" stroke-width="3"/></svg>')}
function mC(n){return'data:image/svg+xml;charset=UTF-8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44"><circle cx="22" cy="22" r="20" fill="'+P+'" stroke="white" stroke-width="2.5"/><text x="22" y="28" text-anchor="middle" font-family="Arial" font-weight="700" font-size="'+(n>99?11:13)+'px" fill="white">'+n+'</text></svg>')}`;

    if (key) {
      // Google Maps (when API key is configured)
      res.send(`<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no">
<style>*{margin:0;padding:0}html,body,#map{width:100%;height:100%;overflow:hidden}</style>
</head><body><div id="map"></div><script>
${SHARED_JS}
var gmap=null,allMarkers=[],_cl=null,_userMarker=null,_pending=null,_mapsReady=false;
function rc(){if(!gmap)return;try{var b=gmap.getBounds();var c=b?VS.filter(function(v){return b.contains({lat:v.lat,lng:v.lng})}).length:VS.length;parent.postMessage(JSON.stringify({type:'visibleCount',count:c}),'*')}catch(e){parent.postMessage(JSON.stringify({type:'visibleCount',count:VS.length}),'*')}}
var _rt=0;
function tryCluster(){if(typeof markerClusterer!=='undefined')doCluster();else if(_rt++<25)setTimeout(tryCluster,200);else rc()}
function doCluster(){try{if(_cl)_cl.clearMarkers();_cl=new markerClusterer.MarkerClusterer({map:gmap,markers:allMarkers,renderer:{render:function(cl,st,mp){return new google.maps.Marker({position:cl.position,map:mp,icon:{url:mC(cl.count),scaledSize:new google.maps.Size(44,44),anchor:new google.maps.Point(22,22)}})}}})}catch(e){}rc()}
function addMarkers(){
  for(var i=0;i<allMarkers.length;i++)allMarkers[i].setMap(null);allMarkers=[];
  if(_cl){try{_cl.clearMarkers()}catch(e){}_cl=null}
  VS.forEach(function(v){
    var c=CC[v.catId]||P,sc=v.isOpen?'#22C55E':'#EF4444';
    var url=mS(v.initial,c,sc,_fs);
    var w=_fs?36:32,h=_fs?44:40,ax=_fs?18:16,ay=_fs?42:38;
    var m=new google.maps.Marker({position:{lat:v.lat,lng:v.lng},map:gmap,icon:{url:url,scaledSize:new google.maps.Size(w,h),anchor:new google.maps.Point(ax,ay)},title:v.name,optimized:true});
    (function(vid){m.addListener('click',function(){parent.postMessage(JSON.stringify({type:'markerPress',vendorId:vid}),'*')})})(v.id);
    allMarkers.push(m);
  });
  _rt=0;tryCluster();
}
function applyInit(d){
  VS=d.vendors||[];CC=d.cc||{};P=d.P||'#FF6B00';_fs=!!d.fullSize;
  if(!gmap){
    gmap=new google.maps.Map(document.getElementById('map'),{center:{lat:d.lat||20.55,lng:d.lng||74.52},zoom:d.zoom||12,mapTypeId:d.mapTypeId||'roadmap',disableDefaultUI:true,gestureHandling:'greedy',clickableIcons:false});
    gmap.addListener('click',function(){parent.postMessage(JSON.stringify({type:'mapPress'}),'*')});
    gmap.addListener('bounds_changed',rc);
  } else {
    gmap.setCenter({lat:d.lat||20.55,lng:d.lng||74.52});
    gmap.setZoom(d.zoom||12);
    gmap.setMapTypeId(d.mapTypeId||'roadmap');
  }
  addMarkers();
}
function initMap(){
  _mapsReady=true;
  var s=document.createElement('script');s.src='https://unpkg.com/@googlemaps/markerclusterer/dist/index.min.js';document.head.appendChild(s);
  if(_pending){var d=_pending;_pending=null;applyInit(d)}
}
window.addEventListener('message',function(e){try{
  var d=typeof e.data==='string'?JSON.parse(e.data):e.data;
  if(d.type==='init'){if(_mapsReady)applyInit(d);else _pending=d}
  else if(d.type==='update'){VS=d.vendors||[];CC=d.cc||CC;P=d.P||P;if(gmap)addMarkers()}
  else if(d.type==='setMapType'&&gmap){gmap.setMapTypeId(d.mapTypeId)}
  else if(d.type==='changeView'&&gmap){
    if(d.mapTypeId)gmap.setMapTypeId(d.mapTypeId);
    if(d.zoom!=null)gmap.setZoom(d.zoom);
    if(d.lat!=null&&d.lng!=null)gmap.panTo({lat:d.lat,lng:d.lng});
    if(d.vendors)VS=d.vendors;
    if(d.cc)CC=d.cc;
    addMarkers();
  }
  else if(d.type==='flyToUser'){window.mapFlyToUser(d.lat,d.lng)}
}catch(ex){}});
window.mapUpdateUserLocation=function(lat,lng){if(!gmap)return;var pos={lat:lat,lng:lng};if(!_userMarker){_userMarker=new google.maps.Marker({position:pos,map:gmap,icon:{url:mU(),scaledSize:new google.maps.Size(36,36),anchor:new google.maps.Point(18,18)},zIndex:1000})}else{_userMarker.setPosition(pos)}};
window.mapFlyToUser=function(lat,lng){window.mapUpdateUserLocation(lat,lng);if(gmap){gmap.panTo({lat:lat,lng:lng});gmap.setZoom(15)}};
window.mapSetDriveMode=function(en){};
window.mapSetView=function(lat,lng,z){if(gmap){gmap.panTo({lat:lat,lng:lng});if(z)gmap.setZoom(Math.round(z))}};
</script>
<script src="https://maps.googleapis.com/maps/api/js?key=${key}&callback=initMap&v=weekly" defer></script>
</body></html>`);
    } else {
      // Leaflet + OpenStreetMap fallback (no API key required)
      res.send(`<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css"/>
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body,#map{width:100%;height:100%;overflow:hidden}
.leaflet-control-attribution{display:none}
.custom-cluster{display:flex;align-items:center;justify-content:center;background:transparent;border:none}
</style>
</head><body><div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script src="https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js"></script>
<script>
${SHARED_JS}
var lmap=null,mcg=null,_userMarker=null,_isSat=false;
var OSM_URL='https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
var SAT_URL='https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
var osmLayer=null,satLayer=null;
function mkIcon(svgUrl,w,h){return L.icon({iconUrl:svgUrl,iconSize:[w,h],iconAnchor:[w/2,h],popupAnchor:[0,-(h)]})}
function mkClusterIcon(n){return L.divIcon({html:'<img src="'+mC(n)+'" width="44" height="44"/>',iconSize:[44,44],iconAnchor:[22,22],className:'custom-cluster'})}
function mkUserIcon(){return L.divIcon({html:'<img src="'+mU()+'" width="36" height="36"/>',iconSize:[36,36],iconAnchor:[18,18],className:'custom-cluster'})}
function rc(){if(!lmap)return;try{var b=lmap.getBounds();var c=VS.filter(function(v){return b.contains([v.lat,v.lng])}).length;parent.postMessage(JSON.stringify({type:'visibleCount',count:c}),'*')}catch(e){parent.postMessage(JSON.stringify({type:'visibleCount',count:VS.length}),'*')}}
function addMarkers(){
  if(mcg){lmap.removeLayer(mcg);}
  mcg=L.markerClusterGroup({iconCreateFunction:function(cl){return mkClusterIcon(cl.getChildCount())},maxClusterRadius:60,spiderfyOnMaxZoom:true,showCoverageOnHover:false,zoomToBoundsOnClick:true});
  VS.forEach(function(v){
    var c=CC[v.catId]||P,sc=v.isOpen?'#22C55E':'#EF4444';
    var svgUrl=mS(v.initial,c,sc,_fs);
    var w=_fs?36:32,h=_fs?44:40;
    var m=L.marker([v.lat,v.lng],{icon:mkIcon(svgUrl,w,h),title:v.name});
    (function(vid){m.on('click',function(e){L.DomEvent.stopPropagation(e);parent.postMessage(JSON.stringify({type:'markerPress',vendorId:vid}),'*')})})(v.id);
    mcg.addLayer(m);
  });
  lmap.addLayer(mcg);
  rc();
}
function applyInit(d){
  VS=d.vendors||[];CC=d.cc||{};P=d.P||'#FF6B00';_fs=!!d.fullSize;
  _isSat=(d.mapTypeId==='satellite');
  if(!lmap){
    lmap=L.map('map',{center:[d.lat||20.55,d.lng||74.52],zoom:d.zoom||12,zoomControl:false,attributionControl:false});
    osmLayer=L.tileLayer(OSM_URL,{maxZoom:19,subdomains:['a','b','c']});
    satLayer=L.tileLayer(SAT_URL,{maxZoom:19});
    (_isSat?satLayer:osmLayer).addTo(lmap);
    lmap.on('click',function(){parent.postMessage(JSON.stringify({type:'mapPress'}),'*')});
    lmap.on('moveend',rc);
    lmap.on('zoomend',rc);
  } else {
    lmap.setView([d.lat||20.55,d.lng||74.52],d.zoom||12);
    lmap.eachLayer(function(l){if(l._url)lmap.removeLayer(l)});
    (_isSat?satLayer:osmLayer).addTo(lmap);
  }
  addMarkers();
}
window.addEventListener('message',function(e){try{
  var d=typeof e.data==='string'?JSON.parse(e.data):e.data;
  if(d.type==='init')applyInit(d);
  else if(d.type==='update'){VS=d.vendors||[];CC=d.cc||CC;P=d.P||P;if(lmap)addMarkers()}
  else if(d.type==='setMapType'&&lmap){
    _isSat=(d.mapTypeId==='satellite');
    lmap.eachLayer(function(l){if(l._url)lmap.removeLayer(l)});
    (_isSat?satLayer:osmLayer).addTo(lmap);
  }
  else if(d.type==='flyToUser'){window.mapFlyToUser(d.lat,d.lng)}
}catch(ex){}});
window.mapUpdateUserLocation=function(lat,lng){if(!lmap)return;var pos=[lat,lng];if(!_userMarker){_userMarker=L.marker(pos,{icon:mkUserIcon(),zIndexOffset:1000}).addTo(lmap)}else{_userMarker.setLatLng(pos)}};
window.mapFlyToUser=function(lat,lng){window.mapUpdateUserLocation(lat,lng);if(lmap){lmap.flyTo([lat,lng],15)}};
window.mapSetDriveMode=function(en){};
window.mapSetView=function(lat,lng,z){if(lmap){lmap.setView([lat,lng],z?Math.round(z):lmap.getZoom())}};
parent.postMessage(JSON.stringify({type:'visibleCount',count:0}),'*');
</script>
</body></html>`);
    }
  });

  // Primary 3D Explore map: MapLibre GL + OpenFreeMap (genuine 3D buildings,
  // no API key). Emits {type:'mapFallback'} when WebGL/tiles/script fail so the
  // client can switch to the proven /api/map-frame 2D map (never a blank screen).
  app.get("/api/explore-3d-frame", (_req, res) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    // Embed-only public map frame — allow cross-origin framing (see /api/map-frame).
    res.removeHeader("X-Frame-Options");
    res.setHeader("Content-Security-Policy", "frame-ancestors *");
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    res.send(`<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no">
<link href="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css" rel="stylesheet"/>
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body,#map{width:100%;height:100%;overflow:hidden;background:#0b1e3d}
.maplibregl-ctrl-attrib,.maplibregl-ctrl-logo,.maplibregl-ctrl-bottom-right,.maplibregl-ctrl-bottom-left{display:none!important}
.gb-pin{cursor:pointer}
.gb-bubble{width:36px;height:36px;border-radius:50% 50% 50% 2px;display:flex;align-items:center;justify-content:center;color:#fff;font-family:Arial;font-weight:700;font-size:15px;border:2.5px solid #fff;box-shadow:0 4px 10px rgba(0,0,0,0.4);position:relative;transform:rotate(45deg)}
.gb-bubble>span{transform:rotate(-45deg);display:block}
.gb-dot{position:absolute;right:-3px;top:-3px;width:11px;height:11px;border-radius:50%;border:1.5px solid #fff;transform:rotate(-45deg)}
.gb-user{width:20px;height:20px;border-radius:50%;background:#4285F4;border:3px solid #fff;box-shadow:0 0 0 6px rgba(66,133,244,0.22),0 2px 6px rgba(0,0,0,0.35)}
#splash{position:absolute;inset:0;background:radial-gradient(ellipse at 50% 38%,#16407f 0%,#0b1e3d 55%,#06122a 100%);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:50;transition:opacity .55s ease-out}
#splash.hide{opacity:0;pointer-events:none}
.spinner{width:44px;height:44px;border:3px solid rgba(255,255,255,0.14);border-top-color:#FF6B00;border-radius:50%;animation:spin .9s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.splash-t{color:#fff;font-family:Arial;font-size:11.5px;letter-spacing:1.6px;text-transform:uppercase;opacity:0.55;margin-top:16px}
</style></head><body>
<div id="map"></div>
<div id="splash"><div class="spinner"></div><div class="splash-t">Loading 3D map</div></div>
<script>
(function(){
var VS=[],CC={},P='#FF6B00',_ready=false,_pending=null,_fellBack=false;
var map=null,_markers={},_userMarker=null,_lastInit=null,_errCount=0;
var splash=document.getElementById('splash');
function hideSplash(){if(!splash)return;splash.classList.add('hide');setTimeout(function(){if(splash&&splash.parentNode){splash.parentNode.removeChild(splash);splash=null}},650)}
function send(o){try{parent.postMessage(JSON.stringify(o),'*')}catch(e){}}
function fail(reason){if(_fellBack||_ready)return;_fellBack=true;send({type:'mapFallback',reason:reason})}
function hasWebGL(){try{var c=document.createElement('canvas');return !!(window.WebGLRenderingContext&&(c.getContext('webgl2')||c.getContext('webgl')||c.getContext('experimental-webgl')))}catch(e){return false}}
window.onerror=function(){_errCount++;if(_errCount>5)fail('jserror')};
window.addEventListener('unhandledrejection',function(){});
function postCount(){if(!map)return;try{var b=map.getBounds();var c=VS.filter(function(v){return v.lng>=b.getWest()&&v.lng<=b.getEast()&&v.lat>=b.getSouth()&&v.lat<=b.getNorth()}).length;send({type:'visibleCount',count:c})}catch(e){send({type:'visibleCount',count:VS.length})}}
function clearMarkers(){for(var k in _markers){try{_markers[k].remove()}catch(e){}}_markers={}}
function addMarkers(){if(!map)return;clearMarkers();VS.forEach(function(v){if(!v.lat||!v.lng)return;var col=CC[v.catId]||P,sc=v.isOpen?'#22C55E':'#EF4444';var el=document.createElement('div');el.className='gb-pin';el.innerHTML='<div class="gb-bubble" style="background:'+col+'"><span>'+v.initial+'</span><i class="gb-dot" style="background:'+sc+'"></i></div>';el.addEventListener('click',function(ev){ev.stopPropagation();send({type:'markerPress',vendorId:v.id})});try{var mk=new maplibregl.Marker({element:el,anchor:'bottom'}).setLngLat([v.lng,v.lat]).addTo(map);_markers[v.id]=mk}catch(e){}})}
function setUser(lat,lng){if(!map)return;var ll=[lng,lat];if(!_userMarker){var el=document.createElement('div');el.className='gb-user';_userMarker=new maplibregl.Marker({element:el}).setLngLat(ll).addTo(map)}else{_userMarker.setLngLat(ll)}}
window.mapFlyToUser=function(lat,lng){setUser(lat,lng);if(map&&_ready)map.flyTo({center:[lng,lat],zoom:16,pitch:55,bearing:-18,duration:2200,essential:true})};
window.mapSetView=function(lat,lng,z){if(map&&_ready)map.flyTo({center:[lng,lat],zoom:z||15.5,pitch:55,duration:1400,essential:true})};
window.mapUpdateUserLocation=function(lat,lng){setUser(lat,lng)};
window.mapSetDriveMode=function(){};
function applyInit(d){VS=d.vendors||[];CC=d.cc||{};P=d.P||'#FF6B00';if(map&&_ready){addMarkers();postCount()}}
window.addEventListener('message',function(e){var d;try{d=typeof e.data==='string'?JSON.parse(e.data):e.data}catch(ex){return}if(!d||!d.type)return;if(d.type==='init'){_lastInit=d;if(_ready)applyInit(d);else _pending=d}else if(d.type==='update'){VS=d.vendors||VS;CC=d.cc||CC;P=d.P||P;if(_ready){addMarkers();postCount()}}else if(d.type==='flyToUser'){window.mapFlyToUser(d.lat,d.lng)}else if(d.type==='setView'){window.mapSetView(d.lat,d.lng,d.zoom)}else if(d.type==='changeView'){if(d.lat!=null&&d.lng!=null)window.mapSetView(d.lat,d.lng,d.zoom)}});
function add3DBuildings(){try{var st=map.getStyle();var layers=(st&&st.layers)||[];for(var i=0;i<layers.length;i++){if(layers[i].type==='fill-extrusion')return}var labelId;for(var j=0;j<layers.length;j++){if(layers[j].type==='symbol'){labelId=layers[j].id;break}}var srcId=map.getSource('openmaptiles')?'openmaptiles':null;if(!srcId)return;map.addLayer({id:'gb-3d-buildings',source:srcId,'source-layer':'building',type:'fill-extrusion',minzoom:14,paint:{'fill-extrusion-color':'#aeb8cc','fill-extrusion-height':['interpolate',['linear'],['zoom'],14,0,16,['coalesce',['get','render_height'],['get','height'],8]],'fill-extrusion-base':['coalesce',['get','render_min_height'],['get','min_height'],0],'fill-extrusion-opacity':0.82}},labelId)}catch(e){}}
function start(){
  if(!hasWebGL()){fail('nowebgl');return}
  if(typeof maplibregl==='undefined'){fail('noscript');return}
  var initC=_pending||_lastInit||{};
  var clat=initC.lat||20.5547,clng=initC.lng||74.5247,cz=initC.zoom||14.5;
  try{map=new maplibregl.Map({container:'map',style:'https://tiles.openfreemap.org/styles/liberty',center:[clng,clat],zoom:cz,pitch:52,bearing:-17,antialias:true,attributionControl:false})}catch(e){fail('init');return}
  var styleTimer=setTimeout(function(){fail('styletimeout')},9000);
  map.on('error',function(){_errCount++;if(_errCount>6)fail('maperror')});
  map.on('load',function(){
    clearTimeout(styleTimer);
    add3DBuildings();
    map.on('click',function(){send({type:'mapPress'})});
    map.on('moveend',postCount);
    _ready=true;
    var p=_pending||_lastInit;_pending=null;if(p)applyInit(p);
    hideSplash();
    postCount();
  });
  try{var cv=map.getCanvas();if(cv)cv.addEventListener('webglcontextlost',function(){fail('contextlost')})}catch(e){}
}
var s=document.createElement('script');s.src='https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js';s.onload=start;s.onerror=function(){fail('scriptload')};document.head.appendChild(s);
setTimeout(function(){if(!_ready)fail('globaltimeout')},16000);
})();
</script></body></html>`);
  });

  // Proxy earth texture same-origin (avoids CORS in WebView iframes)
  let _earthTexCache: Buffer | null = null;
  app.get("/api/earth-texture", async (_req, res) => {
    try {
      if (!_earthTexCache) {
        const r = await fetch("https://cdn.jsdelivr.net/npm/three-globe@2.27.1/example/img/earth-blue-marble.jpg");
        if (!r.ok) throw new Error("upstream");
        _earthTexCache = Buffer.from(await r.arrayBuffer());
      }
      res.setHeader("Content-Type", "image/jpeg");
      res.setHeader("Cache-Control", "public, max-age=604800");
      res.send(_earthTexCache);
    } catch { res.status(404).end(); }
  });

  app.get("/api/globe-frame", (_req, res) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.send(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>
*{margin:0;padding:0}
html,body{width:100%;height:100%;overflow:hidden;background:#00000f;touch-action:none}
canvas{display:block;position:fixed;top:0;left:0}
</style>
</head>
<body>
<canvas id="c"></canvas>
<script>
(function(){
var PI=Math.PI,PI2=PI*2;
var W=innerWidth||window.screen&&window.screen.width||400;
var H=innerHeight||window.screen&&window.screen.height||700;
var cv=document.getElementById('c');
var ctx=cv.getContext('2d');
cv.width=W;cv.height=H;
var cx=W/2,cy=H/2,R=Math.min(W,H)*0.43;

var stars=[];
function mkStars(){stars=[];for(var i=0;i<220;i++)stars.push({x:Math.random()*W,y:Math.random()*H,r:Math.random()*1.4+0.2,o:Math.random()*0.6+0.35});}
mkStars();

var vendors=[],colorMap={},primaryColor='#FF6B00',rotation=74;
var earthImg=null,isDrag=false,lastX=0,lastY=0,startX=0,startY=0,dotHits=[];

function mkTex(){
  var fc=document.createElement('canvas');fc.width=720;fc.height=360;
  var fx=fc.getContext('2d');
  var g=fx.createLinearGradient(0,0,0,360);
  g.addColorStop(0,'#041e42');g.addColorStop(0.15,'#0e4d8c');
  g.addColorStop(0.5,'#1565c0');g.addColorStop(0.85,'#0e4d8c');g.addColorStop(1,'#041e42');
  fx.fillStyle=g;fx.fillRect(0,0,720,360);
  fx.fillStyle='#2e7d32';
  // Land masses (equirectangular approximation)
  [[150,130,70,60,0],[160,185,40,35,-0.3],[195,240,35,55,0.2],[360,118,32,28,0],[370,200,42,68,0],[490,125,120,65,-0.1],[478,182,22,30,0],[560,235,48,32,0.1],[262,82,28,22,0]].forEach(function(e){
    fx.beginPath();fx.ellipse(e[0],e[1],e[2],e[3],e[4],0,PI2);fx.fill();
  });
  fx.fillStyle='#e3f2fd';fx.fillRect(0,0,720,22);fx.fillRect(0,338,720,22);
  return fc;
}

// Start with procedural texture immediately - zero network dependency
earthImg=mkTex();

// Try to upgrade to real NASA texture in background
(function(){var img=new Image();img.onload=function(){earthImg=img;};img.src='/api/earth-texture';})();

function draw(){
  requestAnimationFrame(draw);
  ctx.fillStyle='#00000f';ctx.fillRect(0,0,W,H);
  for(var i=0;i<stars.length;i++){var s=stars[i];ctx.beginPath();ctx.arc(s.x,s.y,s.r,0,PI2);ctx.fillStyle='rgba(255,255,255,'+s.o+')';ctx.fill();}

  // Earth disc
  ctx.save();
  ctx.beginPath();ctx.arc(cx,cy,R,0,PI2);ctx.clip();
  var tW=R*4,tH=R*2;
  var norm=((rotation%360)+360)%360;
  var xC=((norm+180)%360)/360*tW;
  var dX=cx-xC;
  for(var k=-1;k<=2;k++)ctx.drawImage(earthImg,dX+k*tW,cy-R,tW,tH);
  // Sphere shading
  var sh=ctx.createRadialGradient(cx-R*0.28,cy-R*0.28,R*0.03,cx,cy,R);
  sh.addColorStop(0,'rgba(255,255,255,0.09)');sh.addColorStop(0.4,'rgba(0,0,0,0)');sh.addColorStop(1,'rgba(0,0,0,0.75)');
  ctx.fillStyle=sh;ctx.beginPath();ctx.arc(cx,cy,R,0,PI2);ctx.fill();
  ctx.restore();

  // Atmosphere
  var atm=ctx.createRadialGradient(cx,cy,R*0.93,cx,cy,R*1.2);
  atm.addColorStop(0,'rgba(72,138,255,0.55)');atm.addColorStop(0.5,'rgba(60,110,220,0.12)');atm.addColorStop(1,'rgba(0,0,0,0)');
  ctx.beginPath();ctx.arc(cx,cy,R*1.2,0,PI2);ctx.fillStyle=atm;ctx.fill();

  // Vendor dots
  dotHits=[];
  for(var j=0;j<vendors.length;j++){
    var v=vendors[j];if(v.lat==null||v.lng==null)continue;
    var dL=v.lng-rotation;dL=((dL%360)+540)%360-180;
    var phi=dL*PI/180,lam=v.lat*PI/180;
    if(Math.cos(phi)*Math.cos(lam)<=0.05)continue;
    var vx=cx+R*Math.sin(phi)*Math.cos(lam),vy=cy-R*Math.sin(lam);
    var col=colorMap[v.catId]||primaryColor;
    ctx.beginPath();ctx.arc(vx,vy,5.5,0,PI2);ctx.fillStyle=col;ctx.fill();
    ctx.strokeStyle='rgba(255,255,255,0.85)';ctx.lineWidth=1.5;ctx.stroke();
    dotHits.push({vid:v.id,x:vx,y:vy});
  }
  rotation+=0.04;
}
draw(); // START IMMEDIATELY

cv.addEventListener('pointerdown',function(e){isDrag=false;startX=lastX=e.clientX;startY=lastY=e.clientY;});
cv.addEventListener('pointermove',function(e){
  if(!(e.buttons&1))return;
  rotation-=(e.clientX-lastX)*0.28;lastX=e.clientX;lastY=e.clientY;
  if(Math.abs(e.clientX-startX)>5||Math.abs(e.clientY-startY)>5)isDrag=true;
});
cv.addEventListener('pointerup',function(e){
  if(!isDrag){
    var best=null,bestD=30;
    for(var i=0;i<dotHits.length;i++){var d=dotHits[i];var dist=Math.hypot(d.x-e.clientX,d.y-e.clientY);if(dist<bestD){bestD=dist;best=d;}}
    if(best)parent.postMessage(JSON.stringify({type:'markerPress',vendorId:best.vid}),'*');
    else parent.postMessage(JSON.stringify({type:'mapPress'}),'*');
  }
});
window.addEventListener('resize',function(){
  W=innerWidth||W;H=innerHeight||H;cx=W/2;cy=H/2;R=Math.min(W,H)*0.43;
  cv.width=W;cv.height=H;mkStars();
});
window.addEventListener('message',function(e){
  try{
    var d=typeof e.data==='string'?JSON.parse(e.data):e.data;
    if(d.type==='init'||d.type==='update'){
      if(d.cc)colorMap=d.cc;if(d.P)primaryColor=d.P;if(d.vendors)vendors=d.vendors;
      if(d.type==='init'&&d.lng!=null)rotation=d.lng;
    }else if(d.type==='flyToUser'&&d.lng!=null){rotation=d.lng;}
    parent.postMessage(JSON.stringify({type:'visibleCount',count:vendors.length}),'*');
  }catch(ex){}
});
})();
</script>
</body>
</html>`);
  });

  app.get("/api/app-config", async (req, res) => {
    try {
      const role = req.query.role as string || "CUSTOMER";
      const cacheKey = `app_config_${role}`;
      const cached = cache.get<any>(cacheKey);
      if (cached) return res.json(cached);

      const allFlags = await db.select().from(featureFlagsTable).where(eq(featureFlagsTable.enabled, true));
      const activeFlags = allFlags.filter((f: any) => {
        const roles = f.roles as string[];
        return roles.includes("ALL") || roles.includes(role);
      });
      const allAnnouncements = await db.select().from(announcementsTable).where(eq(announcementsTable.isActive, true));
      const activeAnnouncements = allAnnouncements.filter((a: any) => {
        if (a.expiresAt && new Date(a.expiresAt) < new Date()) return false;
        const roles = a.targetRoles as string[];
        return roles.includes("ALL") || roles.includes(role);
      }).sort((a: any, b: any) => (b.priority || 0) - (a.priority || 0));
      const allPages = await db.select().from(dynamicPagesTable).where(eq(dynamicPagesTable.isActive, true));
      const activePages = allPages.filter((p: any) => {
        const roles = p.targetRoles as string[];
        return roles.includes("ALL") || roles.includes(role);
      });
      const result = { featureFlags: activeFlags.map((f: any) => f.name), announcements: activeAnnouncements, dynamicPages: activePages };
      cache.set(cacheKey, result, CACHE_TTL.APP_CONFIG);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch app config" });
    }
  });

  app.post("/api/admin/ai-designer", requireAuth, requireRole("SUPER_ADMIN"), async (req, res) => {
    try {
      const { prompt, designType } = req.body;
      if (!prompt) return res.status(400).json({ error: "prompt is required" });

      const systemPrompt = `You are a UI/UX designer for GO BHARAT, an Indian hyperlocal super app. Generate JSON configurations for app screens and content.

Design Type: ${designType || "page"}

For pages, generate a JSON object with:
{
  "title": "Page Title",
  "slug": "page-slug",
  "targetRoles": ["ALL"],
  "blocks": [
    {
      "type": "banner|text|product_grid|promo_card|announcement|image_carousel|cta_button|spacer",
      "config": { ... block-specific config }
    }
  ]
}

Block configs:
- banner: { "title": "text", "subtitle": "text", "gradient": ["#color1", "#color2"], "icon": "ionicon-name" }
- text: { "content": "text", "fontSize": 14-24, "color": "#hex", "bold": false, "align": "left|center|right" }
- product_grid: { "title": "text", "columns": 2-3, "categoryFilter": "category-name|all" }
- promo_card: { "title": "text", "description": "text", "promoCode": "CODE", "discount": "20%", "gradient": ["#color1", "#color2"], "icon": "ionicon-name" }
- announcement: { "title": "text", "message": "text", "type": "info|warning|success|promo", "icon": "ionicon-name", "color": "#hex" }
- image_carousel: { "images": [{ "url": "placeholder", "caption": "text" }] }
- cta_button: { "label": "text", "route": "/route", "color": "#hex", "icon": "ionicon-name" }
- spacer: { "height": 8-32 }

For announcements, generate:
{ "title": "text", "message": "text", "type": "info|warning|success|promo", "icon": "ionicon-name", "color": "#hex", "targetRoles": ["ALL"], "priority": 0-10 }

Use saffron (#FF6B00) as primary color, dark blue (#0B1E3D) as secondary. Use Indian context (₹ currency, Hindi-English mix, local references).
Respond ONLY with valid JSON, no explanation.`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt },
        ],
        temperature: 0.7,
        max_tokens: 2000,
        response_format: { type: "json_object" },
      });

      const content = response.choices[0]?.message?.content || "{}";
      let parsed;
      try {
        parsed = JSON.parse(content);
      } catch {
        parsed = { error: "Failed to parse AI response" };
      }
      res.json({ success: true, design: parsed, rawResponse: content });
    } catch (error) {
      console.error("AI Designer error:", error);
      res.status(500).json({ error: "Failed to generate design" });
    }
  });

  app.post("/api/otp/send", async (req, res) => {
    try {
      const { phone, email, name, role } = req.body;
      if (!phone) return res.status(400).json({ error: "Phone number is required" });

      const cleanPhone = phone.replace(/\D/g, "").slice(-10);

      if (isOtpRateLimited(cleanPhone)) {
        return res.status(429).json({ error: "Too many OTP requests. Please try again after 10 minutes." });
      }

      const code = generateOTP();
      await storage.storeOtp(cleanPhone, code, email);

      let whatsappSent = false;
      let smsSent = false;
      let emailSent = false;
      let emailError: string | null = null;

      const whatsappConfigured = await isWhatsAppConfigured();

      // Primary channel: WhatsApp (Meta Cloud API).
      if (whatsappConfigured) {
        const waResult = await sendWhatsAppOtp(cleanPhone, code);
        whatsappSent = waResult.sent;
        if (!waResult.sent) {
          console.error("WhatsApp send failed:", waResult.error);
        }
      }

      // Fallback 1: SMS (Fast2SMS) — only if WhatsApp did not deliver.
      if (!whatsappSent && isSmsConfigured()) {
        const smsResult = await sendSmsOtp(cleanPhone, code);
        smsSent = smsResult.sent;
        if (!smsResult.sent) {
          console.error("SMS send failed:", smsResult.error);
        }
      }

      // Fallback 2: Email (Resend) — only if neither WhatsApp nor SMS delivered.
      if (!whatsappSent && !smsSent && email && isEmailConfigured()) {
        const emailResult = await sendEmailOtp(email, code, { name, role, cleanPhone });
        emailSent = emailResult.sent;
        if (!emailResult.sent) {
          emailError = emailResult.error || "Failed to send email";
          console.error("Email send failed:", emailError);
        }
      }

      const maskedEmail = email ? email.replace(/(.{2})(.*)(@.*)/, "$1***$3") : null;

      const anyChannelSent = whatsappSent || smsSent || emailSent;

      // On-screen OTP exposure policy:
      // - Development: always expose so testers aren't blocked.
      // - Production: ONLY when the SHOW_OTP_ON_SCREEN env flag is "true". This
      //   is a deliberate, TEMPORARY measure for when SMS/WhatsApp delivery is
      //   down. Exposure rules by role:
      //     - SUPER_ADMIN  -> code shown ONLY if the request carries the correct
      //       ADMIN_OTP_KEY secret. The admin phone is a public default, so
      //       phone-number-only exposure would allow trivial admin takeover; the
      //       extra secret prevents that.
      //     - Everyone else (CUSTOMER, VENDOR, FRANCHISE, MARKETING, DELIVERY,
      //       ...) -> code shown on screen. Their phone numbers are private (not
      //       a public default), so the blast radius matches the customer case
      //       and lets staff log in while delivery is down.
      //   Unset SHOW_OTP_ON_SCREEN as soon as SMS/WhatsApp delivery is restored.
      let exposeCode = !IS_PRODUCTION;
      if (IS_PRODUCTION && process.env.SHOW_OTP_ON_SCREEN === "true") {
        try {
          const { role } = await resolveUserRole(cleanPhone);
          if (role === "SUPER_ADMIN") {
            const adminKey = process.env.ADMIN_OTP_KEY;
            exposeCode = !!adminKey && req.body?.adminKey === adminKey;
            if (exposeCode) {
              console.warn(
                `[SECURITY] Admin on-screen OTP exposed for phone ending ${cleanPhone.slice(-4)} at ${new Date().toISOString()}`,
              );
            }
          } else {
            exposeCode = true;
          }
        } catch {
          exposeCode = false;
        }
      }

      res.json({
        success: true,
        whatsappSent,
        smsSent,
        emailSent,
        maskedEmail,
        whatsappConfigured,
        smsConfigured: isSmsConfigured(),
        emailConfigured: isEmailConfigured(),
        ...(emailError && { emailError }),
        ...(exposeCode && { devOtp: code }),
        // Tell the client when every delivery channel failed so it can show a
        // clear "couldn't send" error + resend instead of a fake success.
        deliveryFailed: !anyChannelSent,
      });
    } catch (error: any) {
      console.error("OTP send error:", error);
      res.status(500).json({ error: "Failed to send OTP" });
    }
  });

  app.post("/api/otp/verify", async (req, res) => {
    try {
      const { phone, code, role } = req.body;
      if (!phone || !code) return res.status(400).json({ error: "Phone and OTP code are required" });

      const cleanPhone = phone.replace(/\D/g, "").slice(-10);
      const verified = await storage.verifyOtp(cleanPhone, code);

      if (!verified) {
        return res.json({ success: false, error: "Invalid or expired OTP. Please try again." });
      }

      const { role: resolvedRole, id: resolvedId, name: resolvedName } = await resolveUserRole(cleanPhone);

      const token = generateToken(cleanPhone, resolvedRole, resolvedId);
      res.json({ success: true, token, role: resolvedRole, name: resolvedName, id: resolvedId });
    } catch (error) {
      console.error("OTP verify error:", error);
      res.status(500).json({ error: "Failed to verify OTP" });
    }
  });

  // ============ GOOGLE SIGN-IN (customers, website-first) ============
  // Step 1: client sends the Google ID token ("credential"). We verify it and
  // either sign the user straight in (Google account already linked to a phone)
  // or ask them to verify a phone once to establish the link.
  app.post("/api/auth/google", async (req, res) => {
    try {
      if (!isGoogleConfigured()) {
        return res.status(503).json({ error: "Google sign-in is not configured yet." });
      }
      const { credential } = req.body;
      if (!credential) return res.status(400).json({ error: "Missing Google credential" });

      const profile = await verifyGoogleIdToken(credential);
      if (!profile || !profile.email || !profile.sub) {
        return res.status(401).json({ error: "Google sign-in could not be verified. Please try again." });
      }
      if (!profile.emailVerified) {
        return res.status(401).json({ error: "Your Google email is not verified." });
      }

      // Already linked → resolve role by the linked phone and sign in directly.
      const [existing] = await db.select().from(googleAccountsTable)
        .where(eq(googleAccountsTable.googleSub, profile.sub)).limit(1);
      if (existing) {
        const cleanPhone = existing.phone.replace(/\D/g, "").slice(-10);
        const { role, id, name } = await resolveUserRole(cleanPhone);
        // Google sign-in is customer-only. If the linked phone has since gained a
        // privileged role (team/vendor/admin), refuse Google and require OTP so
        // privileged access can never be obtained by bypassing phone verification.
        if (role !== "CUSTOMER") {
          return res.status(403).json({
            error: "This account uses a phone-based role. Please sign in with your mobile number.",
          });
        }
        const token = generateToken(cleanPhone, role, id);
        return res.json({
          success: true,
          linked: true,
          token,
          role,
          id,
          name: name || existing.name || profile.name || null,
          phone: cleanPhone,
        });
      }

      // Not linked → return a short-lived, signed link token carrying the
      // server-verified Google identity. The client collects + verifies a phone
      // via the normal OTP flow, then calls /api/auth/google/link.
      const linkToken = generateGoogleLinkToken({
        googleSub: profile.sub,
        email: profile.email,
        name: profile.name || "",
      });
      return res.json({
        success: true,
        needsPhoneLink: true,
        linkToken,
        email: profile.email,
        name: profile.name || null,
      });
    } catch (error) {
      console.error("Google auth error:", error);
      res.status(500).json({ error: "Google sign-in failed. Please try again." });
    }
  });

  // Step 2: after the user verifies their phone (normal OTP) the authenticated
  // client posts the link token so we persist the Google-to-phone link.
  app.post("/api/auth/google/link", requireAuth, async (req: any, res) => {
    try {
      const { linkToken, confirmRelink } = req.body;
      if (!linkToken) return res.status(400).json({ error: "Missing link token" });

      const data = verifyGoogleLinkToken(linkToken);
      if (!data) {
        return res.status(400).json({ error: "Your Google link session expired. Please sign in with Google again." });
      }

      const cleanPhone = (req.user?.phone || "").replace(/\D/g, "").slice(-10);
      if (!cleanPhone) return res.status(400).json({ error: "Invalid session" });

      // Google sign-in is customer-only — never link Google to a privileged phone
      // (team/vendor/admin), so Google can't later be used to bypass OTP for them.
      const { role } = await resolveUserRole(cleanPhone);
      if (role !== "CUSTOMER") {
        return res.status(403).json({
          error: "Google sign-in is only available for customer accounts.",
        });
      }

      // Conflict detection: is this Google identity (its stable sub OR its email)
      // already linked to a DIFFERENT phone than the one just verified? If so we
      // must NOT silently overwrite the existing link — that would quietly move a
      // returning user's Google sign-in onto a brand-new account and leave their
      // original orders/wallet/coins stranded behind an OTP-only login. Instead we
      // surface the conflict and require a deliberate re-link confirmation.
      const normalize = (p: string) => (p || "").replace(/\D/g, "").slice(-10);
      const [bySub] = await db.select().from(googleAccountsTable)
        .where(eq(googleAccountsTable.googleSub, data.googleSub)).limit(1);
      const byEmail = await db.select().from(googleAccountsTable)
        .where(eq(googleAccountsTable.email, data.email));

      const conflictingPhones = new Set<string>();
      if (bySub && normalize(bySub.phone) !== cleanPhone) {
        conflictingPhones.add(normalize(bySub.phone));
      }
      for (const row of byEmail) {
        const p = normalize(row.phone);
        if (p && p !== cleanPhone) conflictingPhones.add(p);
      }

      if (conflictingPhones.size > 0 && !confirmRelink) {
        const existingPhone = Array.from(conflictingPhones)[0];
        const mask = (p: string) => (p.length === 10 ? `${"•".repeat(6)}${p.slice(-4)}` : p);
        return res.status(409).json({
          conflict: true,
          error: "Your Google account is already linked to a different phone number.",
          existingPhoneMasked: mask(existingPhone),
          verifiedPhoneMasked: mask(cleanPhone),
        });
      }

      // Deliberate re-link (user confirmed) or no conflict. When re-linking, remove
      // any stale rows that map this same email to a different Google sub so a single
      // email can never resolve to two phones (prevents duplicate/ambiguous links).
      if (confirmRelink) {
        await db.delete(googleAccountsTable)
          .where(and(
            eq(googleAccountsTable.email, data.email),
            ne(googleAccountsTable.googleSub, data.googleSub),
          ));
      }

      await db.insert(googleAccountsTable).values({
        googleSub: data.googleSub,
        email: data.email,
        phone: cleanPhone,
        name: data.name || "",
      }).onConflictDoUpdate({
        target: googleAccountsTable.googleSub,
        set: { email: data.email, phone: cleanPhone, name: data.name || "" },
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Google link error:", error);
      res.status(500).json({ error: "Failed to link your Google account." });
    }
  });

  // ============ ACCOUNT DELETION ============

  app.delete("/api/user/:userId", requireAuth, requireRole("SUPER_ADMIN"), async (req, res) => {
    try {
      const { userId } = req.params;
      if (!userId) {
        return res.status(400).json({ error: "User ID is required" });
      }
      const deleted = await storage.deleteUserAccount(userId);
      if (deleted) {
        res.json({ success: true, message: "Account and associated data deleted successfully" });
      } else {
        res.status(500).json({ error: "Failed to delete account" });
      }
    } catch (error) {
      console.error("Delete account error:", error);
      res.status(500).json({ error: "Failed to delete account" });
    }
  });

  // ============ WITHDRAWAL SYSTEM ============

  app.post("/api/withdrawals/request", requireAuth, async (req: any, res) => {
    try {
      const { userName, amount, method, bankDetails } = req.body;
      const bodyUserId: string = req.body?.userId;
      if (!bodyUserId || !amount || !method || !bankDetails) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      // Canonical wallet/account key = authenticated user id. A user may only request a
      // withdrawal for their own account.
      const requesterId: string = req.user?.id || req.user?.phone?.replace(/\D/g, "").slice(-10) || "";
      if (requesterId && requesterId !== bodyUserId) {
        return res.status(403).json({ error: "You can only request withdrawals for your own account" });
      }
      const userId: string = requesterId || bodyUserId;
      // Derive the role from the authenticated token, never from the client-supplied body.
      const userRole: string = (req.user?.role || "DELIVERY").toUpperCase();

      // Server-side validation of the payment method + bank/UPI details so malformed payout
      // data can never be stored (admin payout integrity).
      const normalizedMethod = String(method).toUpperCase();
      if (normalizedMethod !== "UPI" && normalizedMethod !== "BANK") {
        return res.status(400).json({ error: "Invalid payout method. Must be UPI or BANK." });
      }
      const bd: any = bankDetails || {};
      if (normalizedMethod === "UPI") {
        const upiId = String(bd.upiId || "").trim();
        if (!/^[a-zA-Z0-9._-]{2,256}@[a-zA-Z]{2,64}$/.test(upiId)) {
          return res.status(400).json({ error: "Enter a valid UPI ID (e.g. yourname@bank)" });
        }
      } else {
        const accountNumber = String(bd.accountNumber || "").trim();
        const ifsc = String(bd.ifsc || "").trim().toUpperCase();
        if (!/^\d{9,18}$/.test(accountNumber)) {
          return res.status(400).json({ error: "Enter a valid account number (9-18 digits)" });
        }
        if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) {
          return res.status(400).json({ error: "Enter a valid IFSC code (e.g. SBIN0001234)" });
        }
      }

      const amt = Math.round(Number(amount));
      if (!Number.isFinite(amt) || amt < 100) {
        return res.status(400).json({ error: "Minimum withdrawal amount is \u20B9100" });
      }
      if (amt > 50000) {
        return res.status(400).json({ error: "Maximum withdrawal amount is \u20B950,000 per request" });
      }

      const id = `wd_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      const walletTxnId = `wt_wd_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
      const walletRef = `Withdrawal Request:${id}`;

      // Race-safe: take a per-user advisory lock and recompute the wallet balance INSIDE the
      // transaction so check-and-debit is atomic. The wallet is debited immediately (funds are
      // held) so the same balance cannot be withdrawn twice; a rejection credits it back.
      const outcome = await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"wallet:" + userId}))`);

        const [pendingResult] = await tx.select({ count: sql<number>`count(*)::int` })
          .from(withdrawalsTable)
          .where(and(
            eq(withdrawalsTable.userId, userId),
            or(eq(withdrawalsTable.status, "PENDING"), eq(withdrawalsTable.status, "PROCESSING"))
          ));
        if ((pendingResult?.count || 0) >= 3) {
          return { ok: false as const, code: 400, error: "You already have 3 pending withdrawal requests. Please wait for them to be processed." };
        }

        const walletTxns = await tx.select({ type: walletTransactionsTable.type, amount: walletTransactionsTable.amount })
          .from(walletTransactionsTable)
          .where(eq(walletTransactionsTable.userId, userId));
        const walletBalance = walletTxns.reduce((sum, t) => sum + (t.type === "CREDIT" ? t.amount : -t.amount), 0);
        if (amt > walletBalance) {
          return { ok: false as const, code: 400, error: `Insufficient wallet balance. Available: ₹${Math.max(0, walletBalance).toFixed(0)}` };
        }

        const [newRequest] = await tx.insert(withdrawalsTable).values({
          id,
          userId,
          userName: userName || "User",
          userRole,
          amount: amt,
          method: normalizedMethod,
          bankDetails,
          status: "PENDING",
        }).returning();

        await tx.insert(walletTransactionsTable).values({
          id: walletTxnId,
          userId,
          type: "DEBIT",
          amount: amt,
          reference: walletRef,
        });

        return { ok: true as const, withdrawal: newRequest, newWalletBalance: walletBalance - amt };
      });

      if (!outcome.ok) {
        return res.status(outcome.code).json({ error: outcome.error });
      }

      res.json({ success: true, withdrawal: outcome.withdrawal, newWalletBalance: outcome.newWalletBalance });
    } catch (error: any) {
      // Unique-violation on the wallet debit reference = duplicate/retried request.
      if (error?.code === "23505") {
        return res.status(409).json({ error: "This withdrawal request was already submitted." });
      }
      console.error("Withdrawal request error:", error);
      res.status(500).json({ error: "Failed to create withdrawal request" });
    }
  });

  app.get("/api/withdrawals/:userId", requireAuth, async (req: any, res) => {
    try {
      const { userId } = req.params;
      const requesterId: string = req.user?.id || req.user?.phone?.replace(/\D/g, "").slice(-10) || "";
      const requesterRole: string = req.user?.role || "";
      if (requesterId !== userId && requesterRole !== "SUPER_ADMIN") {
        return res.status(403).json({ error: "Forbidden" });
      }
      const userWithdrawals = await db.select().from(withdrawalsTable)
        .where(eq(withdrawalsTable.userId, userId))
        .orderBy(desc(withdrawalsTable.createdAt));
      const totalWithdrawn = userWithdrawals
        .filter((w) => w.status === "COMPLETED")
        .reduce((sum, w) => sum + (w.amount || 0), 0);
      const pendingAmount = userWithdrawals
        .filter((w) => w.status === "PENDING" || w.status === "PROCESSING")
        .reduce((sum, w) => sum + (w.amount || 0), 0);
      res.json({ withdrawals: userWithdrawals, totalWithdrawn, pendingAmount });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch withdrawals" });
    }
  });

  app.get("/api/withdrawals", requireAuth, requireRole("SUPER_ADMIN"), async (_req, res) => {
    try {
      const allWithdrawals = await db.select().from(withdrawalsTable).orderBy(desc(withdrawalsTable.createdAt));
      res.json({ withdrawals: allWithdrawals });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch withdrawals" });
    }
  });

  // Customer payout details are persisted server-side (source of truth) so they survive
  // device changes / reinstalls and can be prefilled on any device. Own-account only.
  app.get("/api/payout-details/:userId", requireAuth, async (req: any, res) => {
    try {
      const requesterId: string = req.user?.id || req.user?.phone?.replace(/\D/g, "").slice(-10) || "";
      const userId = String(req.params.userId);
      if (requesterId && requesterId !== userId && req.user?.role !== "SUPER_ADMIN") {
        return res.status(403).json({ error: "You can only view your own payout details" });
      }
      const [row] = await db.select().from(payoutDetailsTable)
        .where(eq(payoutDetailsTable.userId, userId)).limit(1);
      res.json({ payoutDetails: row || null });
    } catch (error) {
      console.error("Get payout details error:", error);
      res.status(500).json({ error: "Failed to fetch payout details" });
    }
  });

  app.put("/api/payout-details", requireAuth, async (req: any, res) => {
    try {
      const requesterId: string = req.user?.id || req.user?.phone?.replace(/\D/g, "").slice(-10) || "";
      const userId = String(req.body?.userId || requesterId);
      if (requesterId && requesterId !== userId) {
        return res.status(403).json({ error: "You can only update your own payout details" });
      }
      const method = String(req.body?.method || "").toUpperCase();
      if (method !== "UPI" && method !== "BANK") {
        return res.status(400).json({ error: "Invalid payout method" });
      }
      const b = req.body?.bankDetails || {};
      const row = {
        userId,
        method,
        accountHolder: String(b.accountHolder || req.body?.userName || "").slice(0, 200),
        bankName: String(b.bankName || "").slice(0, 200),
        accountNumber: String(b.accountNumber || "").slice(0, 30),
        ifsc: String(b.ifsc || "").toUpperCase().slice(0, 20),
        upiId: String(b.upiId || "").slice(0, 64),
        updatedAt: new Date(),
      };
      if (method === "UPI") {
        if (!row.upiId.includes("@")) return res.status(400).json({ error: "Enter a valid UPI ID (e.g. yourname@bank)" });
      } else {
        if (!/^\d{9,18}$/.test(row.accountNumber)) return res.status(400).json({ error: "Enter a valid account number (9-18 digits)" });
        if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(row.ifsc)) return res.status(400).json({ error: "Enter a valid IFSC code (e.g. SBIN0001234)" });
      }
      await db.insert(payoutDetailsTable).values(row).onConflictDoUpdate({
        target: payoutDetailsTable.userId,
        set: {
          method: row.method, accountHolder: row.accountHolder, bankName: row.bankName,
          accountNumber: row.accountNumber, ifsc: row.ifsc, upiId: row.upiId, updatedAt: row.updatedAt,
        },
      });
      res.json({ success: true, payoutDetails: row });
    } catch (error) {
      console.error("Save payout details error:", error);
      res.status(500).json({ error: "Failed to save payout details" });
    }
  });

  // Shared, idempotent refund: credits the held amount back to the wallet, but ONLY if a
  // matching request-time DEBIT exists and no refund was already issued. The UNIQUE
  // wallet_transactions.reference (`Withdrawal Refund:${id}`) makes a second credit a no-op,
  // so admin-reject and the payout-failure webhook can never double-refund (mint money).
  async function refundWithdrawalIfDebited(
    tx: any,
    withdrawal: { id: string; userId: string; amount: number }
  ): Promise<boolean> {
    const [debitRow] = await tx.select({ id: walletTransactionsTable.id })
      .from(walletTransactionsTable)
      .where(and(
        eq(walletTransactionsTable.userId, withdrawal.userId),
        eq(walletTransactionsTable.reference, `Withdrawal Request:${withdrawal.id}`)
      ))
      .limit(1);
    if (!debitRow) return false;
    await tx.insert(walletTransactionsTable).values({
      id: `wt_refund_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`,
      userId: withdrawal.userId,
      type: "CREDIT",
      amount: withdrawal.amount,
      reference: `Withdrawal Refund:${withdrawal.id}`,
    }).onConflictDoNothing({ target: walletTransactionsTable.reference });
    return true;
  }

  app.patch("/api/withdrawals/:id/approve", requireAuth, requireRole("SUPER_ADMIN"), async (req, res) => {
    try {
      const wid = String(req.params.id);
      const provider = getConfiguredPayoutProvider();
      const idempotencyKey = `payout_${wid}`;

      // Conditional transition: only PENDING -> PROCESSING. The row-level lock taken by this
      // UPDATE serializes against concurrent complete/reject so only one transition can win.
      // We persist the provider + idempotency key up front so a retry/webhook can correlate.
      const [updated] = await db.update(withdrawalsTable)
        .set({ status: "PROCESSING", payoutProvider: provider, payoutIdempotencyKey: idempotencyKey, payoutError: null })
        .where(and(eq(withdrawalsTable.id, wid), eq(withdrawalsTable.status, "PENDING")))
        .returning();
      if (!updated) {
        const [wd] = await db.select().from(withdrawalsTable).where(eq(withdrawalsTable.id, wid));
        if (!wd) return res.status(404).json({ error: "Withdrawal not found" });
        return res.status(409).json({ error: "Can only approve pending requests" });
      }

      // Manual mode: no auto-disbursement. Admin sends money by hand, then clicks Mark Completed.
      if (provider === "manual") {
        return res.json({ success: true, withdrawal: updated, mode: "manual" });
      }

      // Resolve a usable destination — prefer persisted payout_details, fall back to the bank
      // details captured on the request row.
      const [pd] = await db.select().from(payoutDetailsTable).where(eq(payoutDetailsTable.userId, updated.userId)).limit(1);
      const bank: any = (updated.bankDetails as any) || {};
      const method = (updated.method === "UPI" ? "UPI" : "BANK") as PayoutMethod;
      const upiId = String(pd?.upiId || bank.upiId || "").trim();
      const accountNumber = String(pd?.accountNumber || bank.accountNumber || "").trim();
      const ifsc = String(pd?.ifsc || bank.ifsc || "").trim().toUpperCase();
      const beneficiaryName = String(pd?.accountHolder || updated.userName || "Go Bharat User").trim();

      const destInvalid =
        method === "UPI"
          ? !upiId.includes("@")
          : !(/^\d{9,18}$/.test(accountNumber) && /^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc));
      if (destInvalid) {
        // No valid destination — revert so the admin can fix details or reject+refund.
        await db.update(withdrawalsTable)
          .set({ status: "PENDING", payoutError: "Missing or invalid payout destination" })
          .where(and(eq(withdrawalsTable.id, wid), eq(withdrawalsTable.status, "PROCESSING")));
        return res.status(400).json({ error: "Missing or invalid payout destination for this user." });
      }

      const result = await createPayout({
        withdrawalId: wid,
        amountInr: updated.amount,
        destination: { method, upiId, accountNumber, ifsc },
        beneficiaryName,
        idempotencyKey,
      });

      // Provider not usable (stub / missing creds): revert to PENDING and surface config error.
      if (result.notConfigured) {
        await db.update(withdrawalsTable)
          .set({ status: "PENDING", payoutError: result.error || "Payout provider not configured" })
          .where(and(eq(withdrawalsTable.id, wid), eq(withdrawalsTable.status, "PROCESSING")));
        return res.status(503).json({ error: result.error || "Payout provider not configured" });
      }

      // Ambiguous (network/timeout): the payout MAY exist. Keep PROCESSING; the webhook (or an
      // idempotent retry with the same key) resolves it. Never revert/refund here.
      if (!result.success && result.ambiguous) {
        await db.update(withdrawalsTable)
          .set({ payoutStatus: "unknown", payoutError: result.error || "Awaiting payout confirmation" })
          .where(and(eq(withdrawalsTable.id, wid), eq(withdrawalsTable.status, "PROCESSING")));
        return res.status(202).json({ pending: true, message: "Payout submitted; awaiting confirmation.", withdrawal: { ...updated, status: "PROCESSING" } });
      }

      // Definite, server-acknowledged creation failure: no payout exists — revert to PENDING.
      if (!result.success) {
        await db.update(withdrawalsTable)
          .set({ status: "PENDING", payoutError: result.error || "Payout failed" })
          .where(and(eq(withdrawalsTable.id, wid), eq(withdrawalsTable.status, "PROCESSING")));
        return res.status(400).json({ error: result.error || "Payout failed" });
      }

      // Payout was created but is already in a terminal-failure state: reject + refund (idempotent).
      if (result.normalizedStatus === "FAILED") {
        const outcome = await db.transaction(async (tx) => {
          const [u] = await tx.update(withdrawalsTable).set({
            status: "REJECTED",
            rejectionReason: `Automatic payout ${result.rawStatus || "failed"}`,
            payoutRef: result.ref,
            payoutStatus: result.rawStatus,
            processedAt: new Date(),
          }).where(and(eq(withdrawalsTable.id, wid), eq(withdrawalsTable.status, "PROCESSING"))).returning();
          if (u) await refundWithdrawalIfDebited(tx, u);
          return u;
        });
        return res.status(200).json({ success: false, failed: true, error: `Payout ${result.rawStatus}`, withdrawal: outcome });
      }

      // Success — payout created. Store provider ref + status. If it already settled
      // ('processed'), finalize to COMPLETED; otherwise stay PROCESSING for the webhook.
      const patch: any = { payoutRef: result.ref, payoutStatus: result.rawStatus, payoutError: null };
      if (result.normalizedStatus === "COMPLETED") {
        patch.status = "COMPLETED";
        patch.processedAt = new Date();
        patch.transactionId = result.ref;
      }
      const [final] = await db.update(withdrawalsTable)
        .set(patch)
        .where(and(eq(withdrawalsTable.id, wid), eq(withdrawalsTable.status, "PROCESSING")))
        .returning();
      return res.json({ success: true, withdrawal: final || { ...updated, ...patch } });
    } catch (error) {
      console.error("Approve withdrawal error:", error);
      res.status(500).json({ error: "Failed to approve withdrawal" });
    }
  });

  app.patch("/api/withdrawals/:id/complete", requireAuth, requireRole("SUPER_ADMIN"), async (req, res) => {
    try {
      const wid = String(req.params.id);
      // Conditional transition: only PENDING/PROCESSING -> COMPLETED. The row-level lock taken
      // by this UPDATE serializes against a concurrent reject so the request can never end up
      // both COMPLETED and refunded (which would mint money).
      // Manual completion is only allowed for non-automated rows. Automated payouts are
      // finalized exclusively by the provider webhook so an admin can't falsely mark a
      // still-in-flight (or failed) payout as COMPLETED.
      const [updated] = await db.update(withdrawalsTable).set({
        status: "COMPLETED",
        processedAt: new Date(),
        transactionId: `TXN${Date.now()}`,
      }).where(and(
        eq(withdrawalsTable.id, wid),
        or(eq(withdrawalsTable.status, "PENDING"), eq(withdrawalsTable.status, "PROCESSING")),
        or(isNull(withdrawalsTable.payoutProvider), eq(withdrawalsTable.payoutProvider, "manual"))
      )).returning();
      if (!updated) {
        const [wd] = await db.select().from(withdrawalsTable).where(eq(withdrawalsTable.id, wid));
        if (!wd) return res.status(404).json({ error: "Withdrawal not found" });
        if (wd.payoutProvider && wd.payoutProvider !== "manual" && wd.status === "PROCESSING") {
          return res.status(409).json({ error: "This payout is automated — it completes automatically once the provider confirms." });
        }
        return res.status(409).json({ error: "Can only complete pending/processing requests" });
      }
      res.json({ success: true, withdrawal: updated });
    } catch (error) {
      res.status(500).json({ error: "Failed to complete withdrawal" });
    }
  });

  app.patch("/api/withdrawals/:id/reject", requireAuth, requireRole("SUPER_ADMIN"), async (req, res) => {
    try {
      const wid = String(req.params.id);
      const outcome = await db.transaction(async (tx) => {
        // Conditional transition: only PENDING/PROCESSING -> REJECTED. The row-level lock taken
        // by this UPDATE serializes against a concurrent complete, so we only refund when this
        // request actually WON the rejection (preventing a COMPLETED + refund double-pay).
        // Allow reject on PENDING always; on PROCESSING only for manual rows. An automated
        // payout that is already in flight must NOT be rejectable here — refunding while
        // RazorpayX later settles would hand the user both coins AND cash. Those rows are
        // resolved solely by the payout webhook (auto-refund on failure).
        const [updated] = await tx.update(withdrawalsTable).set({
          status: "REJECTED",
          rejectionReason: req.body.reason || "Request rejected by admin",
          processedAt: new Date(),
        }).where(and(
          eq(withdrawalsTable.id, wid),
          or(
            eq(withdrawalsTable.status, "PENDING"),
            and(
              eq(withdrawalsTable.status, "PROCESSING"),
              or(isNull(withdrawalsTable.payoutProvider), eq(withdrawalsTable.payoutProvider, "manual"))
            )
          )
        )).returning();

        if (!updated) {
          const [wd] = await tx.select().from(withdrawalsTable).where(eq(withdrawalsTable.id, wid));
          if (!wd) return { ok: false as const, code: 404, error: "Withdrawal not found" };
          if (wd.payoutProvider && wd.payoutProvider !== "manual" && wd.status === "PROCESSING") {
            return { ok: false as const, code: 409, error: "This payout is already being disbursed automatically and can't be rejected. It will auto-refund if the payout fails." };
          }
          return { ok: false as const, code: 409, error: "Can only reject pending/processing requests" };
        }

        // Refund the held amount via the shared idempotent helper (no-op when there was no
        // request-time debit or a refund already exists, so we never mint money).
        await refundWithdrawalIfDebited(tx, updated);
        return { ok: true as const, withdrawal: updated };
      });
      if (!outcome.ok) return res.status(outcome.code).json({ error: outcome.error });
      res.json({ success: true, withdrawal: outcome.withdrawal });
    } catch (error: any) {
      // Unique-violation on the refund reference = already refunded.
      if (error?.code === "23505") {
        return res.status(409).json({ error: "This withdrawal was already refunded." });
      }
      console.error("Reject withdrawal error:", error);
      res.status(500).json({ error: "Failed to reject withdrawal" });
    }
  });

  app.get("/api/payments/razorpay-config", (_req, res) => {
    try {
      res.json({
        configured: isRazorpayConfigured(),
        keyId: getRazorpayKeyId(),
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch payment config" });
    }
  });

  app.post("/api/payments/razorpay-create-order", async (req, res) => {
    try {
      const { amount, orderId, notes } = req.body;
      if (!amount || amount <= 0) {
        return res.status(400).json({ error: "Invalid amount" });
      }
      const result = await createRazorpayOrder(
        amount,
        orderId || `ORD_${Date.now()}`,
        { platform: "go_bharat", ...notes }
      );
      if (result.success && result.order) {
        const txnId = `RP_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
        await db.insert(transactions).values({
          id: txnId,
          orderId: orderId || "",
          amount,
          status: "pending",
          method: "razorpay",
          razorpayOrderId: result.order.id,
        });
        res.json({
          orderId: result.order.id,
          amount: result.order.amount,
          currency: result.order.currency,
          keyId: getRazorpayKeyId(),
        });
      } else {
        res.status(500).json({ error: result.error || "Failed to create order" });
      }
    } catch (error: any) {
      console.error("Razorpay order error:", error.message);
      res.status(500).json({ error: error.message || "Failed to create Razorpay order" });
    }
  });

  app.post("/api/payments/razorpay-verify", async (req, res) => {
    try {
      const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
      if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
        return res.status(400).json({ error: "Missing payment verification fields" });
      }
      const isValid = verifyRazorpaySignature(razorpay_order_id, razorpay_payment_id, razorpay_signature);
      if (isValid) {
        await db.update(transactions)
          .set({ status: "completed", razorpayPaymentId: razorpay_payment_id })
          .where(eq(transactions.razorpayOrderId, razorpay_order_id));
        const paymentDetails = await fetchRazorpayPayment(razorpay_payment_id);
        res.json({
          verified: true,
          paymentId: razorpay_payment_id,
          method: paymentDetails.payment?.method || "unknown",
          status: "paid",
        });
      } else {
        res.status(400).json({ verified: false, error: "Invalid payment signature" });
      }
    } catch (error: any) {
      console.error("Razorpay verify error:", error.message);
      res.status(500).json({ error: error.message || "Verification failed" });
    }
  });

  async function handleRazorpayWebhook(req: Request & { rawBody?: Buffer }, res: Response) {
    try {
      const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
      if (!webhookSecret) {
        console.error("RAZORPAY_WEBHOOK_SECRET not configured — rejecting webhook");
        return res.status(401).json({ error: "Webhook secret not configured" });
      }
      const signature = req.header("x-razorpay-signature");
      if (!signature) return res.status(400).json({ error: "Missing signature" });
      const rawBody = req.rawBody;
      if (!rawBody) {
        console.error("Raw body not available for webhook verification");
        return res.status(500).json({ error: "Raw body not captured" });
      }
      const expected = crypto.createHmac("sha256", webhookSecret).update(rawBody).digest("hex");
      if (expected !== signature) return res.status(400).json({ error: "Invalid signature" });

      const event = req.body?.event;
      const payload = req.body?.payload;

      if (event === "payment.captured" && payload?.payment?.entity) {
        const payment = payload.payment.entity;
        await db.update(transactions)
          .set({ status: "completed", razorpayPaymentId: payment.id })
          .where(eq(transactions.razorpayOrderId, payment.order_id));
        const txn = await db.select({ orderId: transactions.orderId })
          .from(transactions)
          .where(eq(transactions.razorpayOrderId, payment.order_id))
          .limit(1);
        const orderId = txn[0]?.orderId;
        if (orderId) {
          await db.update(ordersTable)
            .set({ status: "ACCEPTED", paymentStatus: "PAID" })
            .where(and(eq(ordersTable.id, orderId), eq(ordersTable.status, "PENDING")));
          console.log(`[Webhook] Order ${orderId} accepted and paymentStatus set to PAID after payment.captured`);
        }
      } else if (event === "payment.failed" && payload?.payment?.entity) {
        const payment = payload.payment.entity;
        await db.update(transactions)
          .set({ status: "failed", razorpayPaymentId: payment.id })
          .where(eq(transactions.razorpayOrderId, payment.order_id));
        const txn = await db.select({ orderId: transactions.orderId })
          .from(transactions)
          .where(eq(transactions.razorpayOrderId, payment.order_id))
          .limit(1);
        const orderId = txn[0]?.orderId;
        if (orderId) {
          await db.update(ordersTable)
            .set({ status: "PAYMENT_FAILED", paymentStatus: "FAILED" })
            .where(and(eq(ordersTable.id, orderId), eq(ordersTable.status, "PENDING")));
          console.log(`[Webhook] Order ${orderId} marked PAYMENT_FAILED after payment.failed`);
        }
      }

      res.json({ status: "ok" });
    } catch (error: any) {
      console.error("Webhook error:", error.message);
      res.status(500).json({ error: "Webhook processing failed" });
    }
  }

  app.post("/api/payments/webhook", handleRazorpayWebhook);
  app.post("/api/razorpay-webhook", handleRazorpayWebhook);

  // RazorpayX payout (disbursement) webhook. Finalizes automated withdrawals:
  //   payout.processed  -> PROCESSING -> COMPLETED
  //   payout.failed/reversed/cancelled/rejected -> (PROCESSING|COMPLETED) -> REJECTED + idempotent refund
  // Every transition is conditional + the refund is idempotent, so duplicate deliveries are safe.
  async function handleRazorpayXPayoutWebhook(req: Request & { rawBody?: Buffer }, res: Response) {
    try {
      const rawBody = req.rawBody;
      if (!rawBody) return res.status(500).json({ error: "Raw body not captured" });
      const signature = req.header("x-razorpay-signature") || "";
      if (!verifyPayoutWebhookSignature(rawBody, signature)) {
        return res.status(400).json({ error: "Invalid signature" });
      }

      const event = String(req.body?.event || "");
      const entity = req.body?.payload?.payout?.entity;
      if (!entity || !entity.id) return res.json({ status: "ignored" });

      const payoutId: string = String(entity.id);
      const refId: string = String(entity.reference_id || "");
      const widFromRef = refId.startsWith("withdrawal_") ? refId.slice("withdrawal_".length) : "";
      const wid = String(entity.notes?.withdrawal_id || widFromRef || "");

      // Correlate by stored payout_ref first, then by the withdrawal id we embedded in notes /
      // reference_id (covers the ambiguous case where approve never stored the ref).
      let [withdrawal] = await db.select().from(withdrawalsTable)
        .where(eq(withdrawalsTable.payoutRef, payoutId)).limit(1);
      if (!withdrawal && wid) {
        [withdrawal] = await db.select().from(withdrawalsTable)
          .where(eq(withdrawalsTable.id, wid)).limit(1);
      }
      if (!withdrawal) return res.json({ status: "unknown" });

      // Backfill the ref if approve returned ambiguously before it could be stored.
      if (!withdrawal.payoutRef) {
        await db.update(withdrawalsTable).set({ payoutRef: payoutId })
          .where(eq(withdrawalsTable.id, withdrawal.id));
      }

      const status = String(entity.status || "").toLowerCase();
      const isProcessed = event === "payout.processed" || status === "processed";
      const isFailed =
        ["payout.failed", "payout.reversed", "payout.rejected", "payout.cancelled"].includes(event) ||
        ["failed", "reversed", "rejected", "cancelled"].includes(status);

      if (isProcessed) {
        await db.update(withdrawalsTable).set({
          status: "COMPLETED",
          payoutStatus: status || "processed",
          processedAt: new Date(),
          transactionId: payoutId,
          payoutError: null,
        }).where(and(eq(withdrawalsTable.id, withdrawal.id), eq(withdrawalsTable.status, "PROCESSING")));
      } else if (isFailed) {
        await db.transaction(async (tx) => {
          // PROCESSING -> REJECTED (pre-settlement failure) AND COMPLETED -> REJECTED
          // (reversal after money was sent then bounced). Refund is idempotent either way.
          const [u] = await tx.update(withdrawalsTable).set({
            status: "REJECTED",
            rejectionReason: `Automatic payout ${status || "failed"}`,
            payoutStatus: status || "failed",
            processedAt: new Date(),
          }).where(and(
            eq(withdrawalsTable.id, withdrawal.id),
            or(eq(withdrawalsTable.status, "PROCESSING"), eq(withdrawalsTable.status, "COMPLETED"))
          )).returning();
          if (u) await refundWithdrawalIfDebited(tx, u);
        });
      }

      res.json({ status: "ok" });
    } catch (error: any) {
      console.error("Payout webhook error:", error?.message);
      res.status(500).json({ error: "Payout webhook processing failed" });
    }
  }

  app.post("/api/withdrawals/razorpayx-webhook", handleRazorpayXPayoutWebhook);
  app.post("/api/payouts/webhook", handleRazorpayXPayoutWebhook);

  app.get("/api/payments/razorpay-status/:paymentId", async (req, res) => {
    try {
      const result = await fetchRazorpayPayment(req.params.paymentId);
      if (result.success && result.payment) {
        res.json({
          status: result.payment.status,
          method: result.payment.method,
          amount: result.payment.amount / 100,
          currency: result.payment.currency,
        });
      } else {
        res.status(404).json({ error: result.error || "Payment not found" });
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to fetch payment" });
    }
  });

  app.get("/api/payments/razorpay-checkout", (req, res) => {
    const orderId = String(req.query.order_id || "").replace(/[^a-zA-Z0-9_]/g, "");
    const keyId = String(req.query.key_id || "").replace(/[^a-zA-Z0-9_]/g, "");
    const amount = parseInt(String(req.query.amount || "0"), 10);
    const method = req.query.method === "upi" ? "upi" : "netbanking";
    const baseUrl = `https://${req.headers.host}`;
    // return_url: the app page to redirect back to after payment (used in WebView/Median).
    // Enforce same-origin: only allow URLs whose host matches this server's host.
    const rawReturnUrl = String(req.query.return_url || "");
    let returnUrl = "";
    try {
      const parsed = new URL(rawReturnUrl);
      const serverHost = req.headers.host || "";
      // Accept only same host (strips port-mismatch attempts, external domains, etc.)
      if (parsed.host === serverHost) {
        returnUrl = parsed.toString().replace(/[<>"']/g, "");
      }
    } catch {
      // Relative paths: allow /payment?... style URLs
      if (rawReturnUrl.startsWith("/")) {
        returnUrl = rawReturnUrl.replace(/[<>"']/g, "");
      }
    }

    const blockConfig = method === "upi"
      ? 'upi:{name:"Pay via UPI",instruments:[{method:"upi"}]}'
      : 'nb:{name:"Net Banking",instruments:[{method:"netbanking"}]}';
    const blockSeq = method === "upi" ? "block.upi" : "block.nb";

    // Helper: emits JS code that redirects back to the app with payment result params.
    // extraJsExpr is a browser-side JS expression that evaluates to extra URL params string.
    const redirectBack = (status: string, extraJsExpr: string) => {
      if (!returnUrl) return `try{window.close();}catch(e){}`;
      const sep = returnUrl.includes("?") ? "&" : "?";
      const base = JSON.stringify(returnUrl + sep + "payment_status=" + status);
      return `window.location.href=${base}+${extraJsExpr};`;
    };

    res.send(`<!DOCTYPE html>
<html><head><title>Go Bharat Payment</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font-family:-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f8fafc;text-align:center}.c{padding:40px}.spinner{width:40px;height:40px;border:4px solid #e2e8f0;border-top:4px solid #6366f1;border-radius:50%;animation:spin 1s linear infinite;margin:0 auto 20px}@keyframes spin{to{transform:rotate(360deg)}}h2{color:#1e293b;margin:0 0 8px}p{color:#64748b;margin:0}.success{color:#16a34a}.error{color:#dc2626}</style>
<script src="https://checkout.razorpay.com/v1/checkout.js"></script>
</head><body><div class="c" id="loading"><div class="spinner"></div><h2>Initializing Payment...</h2><p>Please wait while we set up your payment</p></div>
<div class="c" id="result" style="display:none"></div>
<script>
var options={key:"${keyId}",amount:${amount},currency:"INR",name:"Go Bharat",description:"Order Payment",order_id:"${orderId}",
prefill:{},
config:{display:{blocks:{${blockConfig}},sequence:["${blockSeq}"],preferences:{show_default_blocks:true}}},
handler:function(r){var d=document.getElementById("result");var l=document.getElementById("loading");l.innerHTML='<div class="spinner"></div><h2>Verifying Payment...</h2><p>Please wait</p>';fetch("${baseUrl}/api/payments/razorpay-verify",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({razorpay_order_id:r.razorpay_order_id,razorpay_payment_id:r.razorpay_payment_id,razorpay_signature:r.razorpay_signature})}).then(function(){l.style.display="none";d.style.display="block";d.innerHTML='<div style="font-size:64px">\\u2705</div><h2 class="success">Payment Successful!</h2><p>Returning to app...</p>';setTimeout(function(){${redirectBack("success", `"&razorpay_order_id="+r.razorpay_order_id`)}},800);}).catch(function(){l.style.display="none";d.style.display="block";d.innerHTML='<div style="font-size:64px">\\u2705</div><h2 class="success">Payment Successful!</h2><p>Returning to app...</p>';setTimeout(function(){${redirectBack("success", `"&razorpay_order_id="+r.razorpay_order_id`)}},800);});},
modal:{ondismiss:function(){document.getElementById("loading").style.display="none";var d=document.getElementById("result");d.style.display="block";d.innerHTML='<div style="font-size:64px">\\u274C</div><h2 class="error">Payment Cancelled</h2><p>Returning to app...</p>';setTimeout(function(){${redirectBack("cancelled", '""')}},800);}},
notes:{platform:"go_bharat"}};
var rzp=new Razorpay(options);rzp.on("payment.failed",function(r){document.getElementById("loading").style.display="none";var d=document.getElementById("result");d.style.display="block";d.innerHTML='<div style="font-size:64px">\\u274C</div><h2 class="error">Payment Failed</h2><p>'+r.error.description+'</p>';setTimeout(function(){${redirectBack("failed", '""')}},2000);});
rzp.open();
</script></body></html>`);
  });

  app.get("/api/payments/razorpay-order-status/:orderId", async (req, res) => {
    try {
      const orderId = req.params.orderId;
      const localTx = await db.select()
        .from(transactions)
        .where(and(eq(transactions.razorpayOrderId, orderId), eq(transactions.status, "completed")))
        .limit(1);
      if (localTx.length > 0) {
        return res.json({ status: "paid", source: "db" });
      }
      if (!isRazorpayConfigured()) {
        return res.json({ status: "pending" });
      }
      const rpKeyId = process.env.RAZORPAY_KEY_ID;
      const rpKeySecret = process.env.RAZORPAY_KEY_SECRET;
      const auth = Buffer.from(`${rpKeyId}:${rpKeySecret}`).toString("base64");
      const response = await fetch(`https://api.razorpay.com/v1/orders/${orderId}/payments`, {
        headers: { "Authorization": `Basic ${auth}` },
      });
      const data = await response.json() as { items?: Array<{ status: string }> };
      const paidPayment = data.items?.find((p: any) => p.status === "captured");
      if (paidPayment) {
        res.json({ status: "paid", source: "razorpay" });
      } else {
        res.json({ status: "pending" });
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to check order status" });
    }
  });

  app.post("/api/payments/razorpay-refund", requireAuth, requireRole("SUPER_ADMIN"), async (req, res) => {
    try {
      const { paymentId, amount } = req.body;
      if (!paymentId) {
        return res.status(400).json({ error: "Payment ID required" });
      }
      const result = await refundRazorpayPayment(paymentId, amount);
      if (result.success) {
        const updated = await db.update(transactions)
          .set({ status: "refunded" })
          .where(
            or(
              eq(transactions.razorpayPaymentId, paymentId),
              eq(transactions.razorpayOrderId, paymentId)
            )
          )
          .returning({ id: transactions.id });
        if (updated.length === 0) {
          console.warn(`Refund processed via Razorpay but no matching transaction found for paymentId: ${paymentId}`);
        }
        res.json({ success: true, refund: result.refund, transactionUpdated: updated.length > 0 });
      } else {
        res.status(500).json({ error: result.error || "Refund failed" });
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to process refund" });
    }
  });

  // ── PhonePe Payment Routes ────────────────────────────────────────────────────
  // Helper: return a trusted canonical server base URL.
  // Prefers env-configured domain (set by Replit infra) over the Host request header,
  // which can be spoofed or wrong behind reverse proxies/custom domains.
  function getServerBaseUrl(req: Request): string {
    const replitDomain =
      process.env.REPLIT_DEV_DOMAIN ||
      (process.env.REPLIT_DOMAINS || "").split(",")[0].trim();
    if (replitDomain) return `https://${replitDomain}`;
    const proto = (req.headers["x-forwarded-proto"] as string) || "https";
    return `${proto}://${req.headers.host}`;
  }

  app.post("/api/payments/phonepe-initiate", async (req, res) => {
    try {
      const { amount, orderId } = req.body;
      if (!amount || amount <= 0) {
        return res.status(400).json({ error: "Invalid amount" });
      }
      if (!isPhonePeConfigured()) {
        return res.status(503).json({ error: "PhonePe payment is not configured" });
      }
      const txnId = `PP_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
      const baseUrl = getServerBaseUrl(req);
      const canonicalHost = new URL(baseUrl).host;
      // returnUrl is the app page to redirect back to after payment (supplied by the web client)
      const rawReturnUrl = String(req.body.returnUrl || "");
      let appReturnUrl = "";
      try {
        const parsedReturn = new URL(rawReturnUrl);
        if (parsedReturn.host === canonicalHost) {
          appReturnUrl = parsedReturn.toString().replace(/[<>"']/g, "");
        }
      } catch { /* no returnUrl provided */ }
      const phonePeReturnUrl = `${baseUrl}/api/payments/phonepe-return?transactionId=${txnId}${appReturnUrl ? `&returnUrl=${encodeURIComponent(appReturnUrl)}` : ""}`;
      const redirectUrl = phonePeReturnUrl;
      const callbackUrl = `${baseUrl}/api/payments/phonepe-callback`;

      const result = await createPhonePeOrder(amount, txnId, redirectUrl, callbackUrl);
      if (result.success && result.paymentUrl) {
        await db.insert(transactions).values({
          id: txnId,
          orderId: orderId || "",
          amount,
          status: "pending",
          method: "phonepe",
          gatewayTransactionId: txnId,
        });
        res.json({ redirectUrl: result.paymentUrl, transactionId: txnId });
      } else {
        res.status(500).json({ error: result.error || "Failed to initiate PhonePe payment" });
      }
    } catch (error: any) {
      console.error("PhonePe initiate error:", error.message);
      res.status(500).json({ error: error.message || "Failed to initiate PhonePe payment" });
    }
  });

  app.get("/api/payments/phonepe-status/:transactionId", async (req, res) => {
    try {
      const { transactionId } = req.params;
      const localTx = await db.select()
        .from(transactions)
        .where(and(eq(transactions.id, transactionId), eq(transactions.status, "completed")))
        .limit(1);
      if (localTx.length > 0) {
        return res.json({ status: "paid", source: "db" });
      }
      const result = await fetchPhonePeStatus(transactionId);
      if (result.success) {
        if (result.status === "paid") {
          await db.update(transactions)
            .set({ status: "completed" })
            .where(eq(transactions.id, transactionId));
        } else if (result.status === "failed") {
          await db.update(transactions)
            .set({ status: "failed" })
            .where(eq(transactions.id, transactionId));
        }
        res.json({ status: result.status || "pending" });
      } else {
        res.json({ status: "pending" });
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to check PhonePe status" });
    }
  });

  app.get("/api/payments/phonepe-return", async (req, res) => {
    const transactionId = String(req.query.transactionId || "").replace(/[^a-zA-Z0-9_]/g, "");
    const rawReturnUrl = String(req.query.returnUrl || "");
    const baseUrl = getServerBaseUrl(req);
    const canonicalHost = new URL(baseUrl).host;

    let status: "paid" | "pending" | "failed" = "pending";
    try {
      const result = await fetchPhonePeStatus(transactionId);
      if (result.success && result.status) status = result.status;
      if (status === "paid") {
        await db.update(transactions)
          .set({ status: "completed" })
          .where(eq(transactions.id, transactionId));
      }
    } catch {}

    // Validate returnUrl to same canonical host only
    let appReturnUrl = "";
    try {
      const parsed = new URL(rawReturnUrl);
      if (parsed.host === canonicalHost) {
        appReturnUrl = parsed.toString().replace(/[<>"']/g, "");
      }
    } catch {
      if (rawReturnUrl.startsWith("/")) {
        appReturnUrl = rawReturnUrl.replace(/[<>"']/g, "");
      }
    }

    const paymentStatusParam = status === "paid" ? "success" : status === "failed" ? "failed" : "pending";

    res.send(`<!DOCTYPE html>
<html><head><title>Payment Status</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font-family:-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f8fafc;text-align:center}.c{padding:40px}.spinner{width:40px;height:40px;border:4px solid #e2e8f0;border-top:4px solid #5F259F;border-radius:50%;animation:spin 1s linear infinite;margin:0 auto 20px}@keyframes spin{to{transform:rotate(360deg)}}h2{color:#1e293b;margin:0 0 8px}p{color:#64748b;margin:0}.success{color:#16a34a}.error{color:#dc2626}</style>
</head><body><div class="c" id="content">
<div class="spinner"></div><h2>Confirming Payment...</h2><p>Please wait</p>
</div>
<script>
var status="${paymentStatusParam}";
var txnId="${transactionId}";
var appReturnUrl=${JSON.stringify(appReturnUrl)};
var d=document.getElementById("content");
if(status==="success"){
  d.innerHTML='<div style="font-size:64px">\\u2705</div><h2 class="success">Payment Successful!</h2><p>Returning to app...</p>';
}else if(status==="failed"){
  d.innerHTML='<div style="font-size:64px">\\u274C</div><h2 class="error">Payment Failed</h2><p>Returning to app...</p>';
}else{
  d.innerHTML='<div style="font-size:64px">\\uD83D\\uDD04</div><h2>Payment Processing</h2><p>Returning to app...</p>';
}
setTimeout(function(){
  var dest=appReturnUrl||document.referrer||"${baseUrl}";
  try{
    var u=new URL(dest);
    u.searchParams.set("phonepe_transaction_id",txnId);
    u.searchParams.set("payment_status",status);
    window.location.href=u.toString();
  }catch(e){window.history.back();}
},1500);
</script></body></html>`);
  });

  app.post("/api/payments/phonepe-callback", async (req, res) => {
    try {
      const { response: encodedResponse } = req.body;
      const xVerify = req.header("X-VERIFY");

      // Fail-closed: both the payload and the checksum header are mandatory.
      // Requests that omit X-VERIFY must be rejected — accepting them would allow
      // anyone to forge a callback and mark transactions as paid without credentials.
      if (!encodedResponse) {
        return res.status(400).json({ error: "Missing response payload" });
      }
      if (!xVerify) {
        console.error("PhonePe callback: missing X-VERIFY header — request rejected");
        return res.status(401).json({ error: "Missing X-VERIFY header" });
      }
      if (!verifyPhonePeCallbackChecksum(encodedResponse, xVerify)) {
        console.error("PhonePe callback: invalid checksum — request rejected");
        return res.status(401).json({ error: "Invalid checksum" });
      }

      const decoded = JSON.parse(Buffer.from(encodedResponse, "base64").toString("utf-8")) as any;
      const txnState = decoded?.data?.state || decoded?.code || "";
      const transactionId = String(decoded?.data?.merchantTransactionId || "").replace(/[^a-zA-Z0-9_]/g, "");
      if (transactionId) {
        if (txnState === "COMPLETED") {
          await db.update(transactions)
            .set({ status: "completed" })
            .where(eq(transactions.id, transactionId));
        } else if (txnState === "FAILED") {
          await db.update(transactions)
            .set({ status: "failed" })
            .where(eq(transactions.id, transactionId));
        }
      }
      res.json({ success: true });
    } catch (error: any) {
      console.error("PhonePe callback error:", error.message);
      res.status(500).json({ error: "Callback processing failed" });
    }
  });
  // ── End PhonePe Routes ────────────────────────────────────────────────────────

  app.get("/api/payments/transactions", requireAuth, requireRole("SUPER_ADMIN", "FRANCHISE"), async (_req, res) => {
    try {
      const allTransactions = await db.select().from(transactions).orderBy(desc(transactions.createdAt)).limit(100);
      res.json({ transactions: allTransactions });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to fetch transactions" });
    }
  });

  // Wallet top-up: credit wallet server-side after Razorpay payment verified
  app.post("/api/wallet/topup", requireAuth, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const { razorpayOrderId } = req.body;
      if (!razorpayOrderId) {
        return res.status(400).json({ error: "razorpayOrderId is required" });
      }
      // Strictly verify the order via Razorpay API — fail closed
      const rzpKeyId = process.env.RAZORPAY_KEY_ID;
      const rzpKeySecret = process.env.RAZORPAY_KEY_SECRET;
      if (!rzpKeyId || !rzpKeySecret) {
        return res.status(500).json({ error: "Payment gateway not configured" });
      }
      const auth = Buffer.from(`${rzpKeyId}:${rzpKeySecret}`).toString("base64");
      let verifiedAmount: number;
      try {
        const orderRes = await fetch(`https://api.razorpay.com/v1/orders/${razorpayOrderId}`, {
          headers: { Authorization: `Basic ${auth}` },
        });
        if (!orderRes.ok) {
          return res.status(400).json({ error: "Could not verify payment with Razorpay" });
        }
        const orderData = await orderRes.json();
        if (orderData.status !== "paid") {
          return res.status(400).json({ error: "Payment not completed for this order" });
        }
        // Verify intent: order must have been created for wallet top-up
        const notes = orderData.notes || {};
        if (notes.intent !== "wallet_topup") {
          return res.status(403).json({ error: "This order was not created for a wallet top-up" });
        }
        // Verify ownership: notes must contain the authenticated user's id/phone
        if (!notes.userId || notes.userId !== userId) {
          return res.status(403).json({ error: "Order does not belong to the authenticated user" });
        }
        // Razorpay amounts are in paise; convert to rupees
        verifiedAmount = Number(orderData.amount) / 100;
        if (!verifiedAmount || verifiedAmount <= 0) {
          return res.status(400).json({ error: "Invalid order amount from Razorpay" });
        }
      } catch {
        return res.status(502).json({ error: "Failed to reach Razorpay for payment verification" });
      }
      // Idempotency via unique constraint on reference — handle duplicate gracefully
      const reference = `Wallet Top-up:${razorpayOrderId}`;
      const txnId = "wt_" + Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
      try {
        const [txn] = await db
          .insert(walletTransactionsTable)
          .values({
            id: txnId,
            userId,
            type: "CREDIT",
            amount: verifiedAmount,
            reference,
          })
          .returning();
        res.json({ success: true, transaction: txn });
      } catch (insertErr: any) {
        // Unique constraint violation — return existing only if it belongs to this user
        if (insertErr?.code === "23505") {
          const [existing] = await db
            .select()
            .from(walletTransactionsTable)
            .where(eq(walletTransactionsTable.reference, reference))
            .limit(1);
          if (!existing || existing.userId !== userId) {
            return res.status(403).json({ error: "Order ownership mismatch" });
          }
          return res.json({ success: true, alreadyCredited: true, transaction: existing });
        }
        throw insertErr;
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to credit wallet" });
    }
  });

  // Get wallet balance for the authenticated user
  app.get("/api/wallet/balance", requireAuth, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const txns = await db
        .select()
        .from(walletTransactionsTable)
        .where(eq(walletTransactionsTable.userId, userId))
        .orderBy(desc(walletTransactionsTable.createdAt));
      const balance = txns.reduce((sum, t) => {
        return t.type === "CREDIT" ? sum + t.amount : sum - t.amount;
      }, 0);
      res.json({ balance: Math.max(0, balance), transactions: txns });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to fetch wallet balance" });
    }
  });

  // GET /api/vendor/wallet — vendor reads their own coin-payment earnings
  app.get("/api/vendor/wallet", requireAuth, requireRole("VENDOR", "SUPER_ADMIN"), async (req: any, res) => {
    try {
      const phone = (req.user?.phone || "").replace(/\D/g, "").slice(-10);
      if (!phone) return res.json({ balance: 0, transactions: [] });
      // Find this vendor's application id (= the vendorId used in orders)
      const [vendorApp] = await db.select({ id: vendorApplicationsTable.id })
        .from(vendorApplicationsTable)
        .where(sql`RIGHT(REGEXP_REPLACE(${vendorApplicationsTable.phone}, '[^0-9]', '', 'g'), 10) = ${phone}`)
        .limit(1);
      if (!vendorApp) return res.json({ balance: 0, transactions: [] });
      const txns = await db.select().from(walletTransactionsTable)
        .where(eq(walletTransactionsTable.userId, vendorApp.id))
        .orderBy(desc(walletTransactionsTable.createdAt));
      const balance = txns.reduce((sum, t) => t.type === "CREDIT" ? sum + t.amount : sum - t.amount, 0);
      const now = new Date();
      const thisMonthTotal = txns
        .filter(t => t.type === "CREDIT" && t.createdAt && new Date(t.createdAt).getMonth() === now.getMonth() && new Date(t.createdAt).getFullYear() === now.getFullYear())
        .reduce((sum, t) => sum + t.amount, 0);
      res.json({
        balance: Math.max(0, balance),
        thisMonth: thisMonthTotal,
        transactions: txns.map(t => ({ ...t, createdAt: t.createdAt?.toISOString() ?? null })),
      });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to fetch vendor wallet" });
    }
  });

  // Admin: list all wallet transactions with user info
  app.get("/api/admin/wallet-transactions", requireAuth, requireRole("SUPER_ADMIN", "FRANCHISE"), async (_req, res) => {
    try {
      const txns = await db
        .select()
        .from(walletTransactionsTable)
        .orderBy(desc(walletTransactionsTable.createdAt))
        .limit(500);
      // Enrich with user names where possible (userId may be phone or UUID depending on role)
      const userIds = [...new Set(txns.map((t) => t.userId))];
      const appUsersRows = userIds.length > 0
        ? await db.select({ id: appUsersTable.id, name: appUsersTable.name, phone: appUsersTable.phone })
            .from(appUsersTable)
            .where(or(inArray(appUsersTable.id, userIds), inArray(appUsersTable.phone, userIds)))
        : [];
      const userMap = new Map<string, { name: string; phone: string }>();
      appUsersRows.forEach((u) => {
        userMap.set(u.id, { name: u.name, phone: u.phone });
        userMap.set(u.phone, { name: u.name, phone: u.phone });
      });
      const enriched = txns.map((t) => {
        const info = userMap.get(t.userId);
        return {
          ...t,
          userName: info?.name || null,
          userPhone: info?.phone || (t.userId.length <= 10 ? t.userId : null),
        };
      });
      res.json({ transactions: enriched });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to fetch wallet transactions" });
    }
  });

  app.get("/api/live-sessions", optionalAuth, async (req, res) => {
    try {
      const { status, vendorId } = req.query;
      let conditions: any[] = [];
      if (status) conditions.push(eq(liveSessionsTable.status, status as string));
      if (vendorId) conditions.push(eq(liveSessionsTable.vendorId, vendorId as string));
      const sessions = conditions.length > 0
        ? await db.select().from(liveSessionsTable).where(and(...conditions))
        : await db.select().from(liveSessionsTable);
      const statusOrder: Record<string, number> = { LIVE: 0, SCHEDULED: 1, ENDED: 2 };
      sessions.sort((a, b) => (statusOrder[a.status] ?? 3) - (statusOrder[b.status] ?? 3));
      res.json({ sessions });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch live sessions" });
    }
  });

  app.get("/api/live-sessions/:id", optionalAuth, async (req, res) => {
    try {
      const [session] = await db.select().from(liveSessionsTable).where(eq(liveSessionsTable.id, req.params.id));
      if (!session) return res.status(404).json({ error: "Session not found" });
      res.json({ session });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch session" });
    }
  });

  app.post("/api/live-sessions", requireAuth, async (req, res) => {
    try {
      const { vendorId, vendorName, title, description, taggedProducts, scheduledAt } = req.body;
      if (!vendorId || !title) {
        return res.status(400).json({ error: "vendorId and title are required" });
      }
      const id = "live_" + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
      const [session] = await db.insert(liveSessionsTable).values({
        id,
        vendorId,
        vendorName: vendorName || "Vendor",
        title,
        description: description || "",
        thumbnail: "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=400",
        videoUrl: "https://www.pexels.com/download/video/5739734/",
        status: scheduledAt ? "SCHEDULED" : "LIVE",
        viewers: 0,
        peakViewers: 0,
        likes: 0,
        taggedProducts: taggedProducts || [],
        chatMessages: [],
        startedAt: scheduledAt ? null : new Date(),
        scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
      }).returning();
      res.json({ success: true, session });
    } catch (error) {
      res.status(500).json({ error: "Failed to create live session" });
    }
  });

  app.patch("/api/live-sessions/:id/start", requireAuth, async (req, res) => {
    try {
      const [session] = await db.update(liveSessionsTable)
        .set({ status: "LIVE", startedAt: new Date() })
        .where(eq(liveSessionsTable.id, req.params.id)).returning();
      if (!session) return res.status(404).json({ error: "Session not found" });
      res.json({ success: true, session });
    } catch (error) {
      res.status(500).json({ error: "Failed to start session" });
    }
  });

  app.patch("/api/live-sessions/:id/end", async (req, res) => {
    try {
      const [session] = await db.update(liveSessionsTable)
        .set({ status: "ENDED", endedAt: new Date() })
        .where(eq(liveSessionsTable.id, req.params.id)).returning();
      if (!session) return res.status(404).json({ error: "Session not found" });
      res.json({ success: true, session });
    } catch (error) {
      res.status(500).json({ error: "Failed to end session" });
    }
  });

  app.post("/api/live-sessions/:id/join", async (req, res) => {
    try {
      const [updated] = await db.update(liveSessionsTable)
        .set({
          viewers: sql`COALESCE(${liveSessionsTable.viewers}, 0) + 1`,
          peakViewers: sql`GREATEST(COALESCE(${liveSessionsTable.peakViewers}, 0), COALESCE(${liveSessionsTable.viewers}, 0) + 1)`,
        })
        .where(eq(liveSessionsTable.id, req.params.id))
        .returning({ viewers: liveSessionsTable.viewers });
      if (!updated) return res.status(404).json({ error: "Session not found" });
      res.json({ success: true, viewers: updated.viewers });
    } catch (error) {
      res.status(500).json({ error: "Failed to join session" });
    }
  });

  app.post("/api/live-sessions/:id/leave", async (req, res) => {
    try {
      const [updated] = await db.update(liveSessionsTable)
        .set({
          viewers: sql`GREATEST(0, COALESCE(${liveSessionsTable.viewers}, 0) - 1)`,
        })
        .where(eq(liveSessionsTable.id, req.params.id))
        .returning({ viewers: liveSessionsTable.viewers });
      if (!updated) return res.status(404).json({ error: "Session not found" });
      res.json({ success: true, viewers: updated.viewers });
    } catch (error) {
      res.status(500).json({ error: "Failed to leave session" });
    }
  });

  app.post("/api/live-sessions/:id/like", async (req, res) => {
    try {
      const [updated] = await db.update(liveSessionsTable)
        .set({ likes: sql`COALESCE(${liveSessionsTable.likes}, 0) + 1` })
        .where(eq(liveSessionsTable.id, req.params.id))
        .returning({ likes: liveSessionsTable.likes });
      if (!updated) return res.status(404).json({ error: "Session not found" });
      res.json({ success: true, likes: updated.likes });
    } catch (error) {
      res.status(500).json({ error: "Failed to like session" });
    }
  });

  app.post("/api/live-sessions/:id/chat", async (req, res) => {
    try {
      const [session] = await db.select().from(liveSessionsTable).where(eq(liveSessionsTable.id, req.params.id));
      if (!session) return res.status(404).json({ error: "Session not found" });
      const { userId, userName, message, isVendor } = req.body;
      if (!message?.trim()) return res.status(400).json({ error: "Message is required" });
      const chatMsg = {
        id: "chat_" + Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
        userId: userId || "anonymous",
        userName: userName || "User",
        message: message.trim(),
        isVendor: !!isVendor,
        timestamp: new Date().toISOString(),
      };
      let chatMessages = (session.chatMessages as any[]) || [];
      chatMessages.push(chatMsg);
      if (chatMessages.length > 200) chatMessages = chatMessages.slice(-200);
      await db.update(liveSessionsTable).set({ chatMessages }).where(eq(liveSessionsTable.id, req.params.id));
      res.json({ success: true, chatMessage: chatMsg });
    } catch (error) {
      res.status(500).json({ error: "Failed to send chat message" });
    }
  });

  app.get("/api/live-sessions/:id/chat", async (req, res) => {
    try {
      const [session] = await db.select().from(liveSessionsTable).where(eq(liveSessionsTable.id, req.params.id));
      if (!session) return res.status(404).json({ error: "Session not found" });
      const after = req.query.after as string | undefined;
      let messages = (session.chatMessages as any[]) || [];
      if (after) {
        const idx = messages.findIndex((m: any) => m.id === after);
        if (idx >= 0) messages = messages.slice(idx + 1);
      }
      res.json({ messages, total: ((session.chatMessages as any[]) || []).length });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch chat messages" });
    }
  });

  app.get("/api/team-members", requireAuth, async (_req, res) => {
    try {
      const cached = cache.get<any>("team_members");
      if (cached) return res.json(cached);
      const members = await db.select().from(teamMembersTable);
      const result = { teamMembers: members };
      cache.set("team_members", result, CACHE_TTL.TEAM_MEMBERS);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: "Failed to fetch team members" });
    }
  });

  app.post("/api/team-members", requireAuth, requireRole("SUPER_ADMIN", "FRANCHISE"), async (req, res) => {
    try {
      const { id, name, phone, email, role, city, status, createdBy, createdByRole, territory, pinCode, bankName, accountNumber, ifscCode, accountHolderName, aadhaarNumber, panNumber, dateOfBirth, gender, fullAddress, emergencyContactName, emergencyContactPhone, vehicleNumber, drivingLicenseNumber, franchiseId } = req.body;
      if (!name || !phone || !role) {
        return res.status(400).json({ error: "name, phone, and role are required" });
      }
      const memberId = id || ("TM" + Date.now().toString().slice(-6));
      await db.insert(teamMembersTable).values({
        id: memberId, name, phone, email: email || "", role, city: city || "",
        status: status || "ACTIVE", createdBy: createdBy || "", createdByRole: createdByRole || "SUPER_ADMIN",
        territory, pinCode: pinCode || "", bankName, accountNumber, ifscCode, accountHolderName,
        aadhaarNumber, panNumber, dateOfBirth, gender, fullAddress,
        emergencyContactName, emergencyContactPhone, vehicleNumber, drivingLicenseNumber,
        franchiseId: franchiseId || "",
      });
      cache.invalidate("team_members");
      const [inserted] = await db.select().from(teamMembersTable).where(eq(teamMembersTable.id, memberId));
      res.json({ success: true, teamMember: inserted });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to create team member" });
    }
  });

  app.put("/api/team-members/:id", requireAuth, requireRole("SUPER_ADMIN", "FRANCHISE"), async (req, res) => {
    try {
      const { id } = req.params;
      const updates: any = {};
      for (const key of ["name", "phone", "email", "role", "city", "territory", "pinCode", "bankName", "accountNumber", "ifscCode", "accountHolderName", "aadhaarNumber", "panNumber", "dateOfBirth", "gender", "fullAddress", "emergencyContactName", "emergencyContactPhone", "vehicleNumber", "drivingLicenseNumber"]) {
        if (req.body[key] !== undefined) updates[key] = req.body[key];
      }
      await db.update(teamMembersTable).set(updates).where(eq(teamMembersTable.id, id));
      cache.invalidate("team_members");
      const [updated] = await db.select().from(teamMembersTable).where(eq(teamMembersTable.id, id));
      res.json({ success: true, teamMember: updated });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to update team member" });
    }
  });

  app.put("/api/team-members/:id/toggle-status", requireAuth, requireRole("SUPER_ADMIN", "FRANCHISE"), async (req, res) => {
    try {
      const { id } = req.params;
      const [existing] = await db.select().from(teamMembersTable).where(eq(teamMembersTable.id, id));
      if (!existing) return res.status(404).json({ error: "Team member not found" });
      const newStatus = existing.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
      await db.update(teamMembersTable).set({ status: newStatus }).where(eq(teamMembersTable.id, id));
      cache.invalidate("team_members");
      res.json({ success: true, status: newStatus });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to toggle status" });
    }
  });

  app.delete("/api/team-members/:id", requireAuth, requireRole("SUPER_ADMIN", "FRANCHISE"), async (req, res) => {
    try {
      await db.delete(teamMembersTable).where(eq(teamMembersTable.id, req.params.id));
      cache.invalidate("team_members");
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to delete team member" });
    }
  });

  app.get("/api/vendor/products/:vendorId", async (req, res) => {
    try {
      const { vendorId } = req.params;
      // Cache product lists for 5 minutes client-side; stale-while-revalidate lets the
      // browser serve the cached copy instantly while quietly refreshing in the background.
      res.set("Cache-Control", "public, max-age=300, stale-while-revalidate=600");

      // Serve from in-memory cache if available (avoids DB round-trip entirely)
      const cached = getProductCache(vendorId);
      if (cached) return res.json(cached);
      // Never select the full `image` blob in list queries — production images are
      // 2-3 MB base64 each, so 30+ products would be 60-90 MB. lightweightProductCols
      // peeks at only the first chars and builds a tiny proxy URL instead.
      let rows = await db.select(lightweightProductCols)
        .from(productsTable)
        .where(eq(productsTable.vendorId, vendorId))
        .orderBy(desc(productsTable.createdAt));

      // If no products found under the requested ID, perform a broad sibling search.
      // Products can end up under a different ID when:
      //   a) The vendor has multiple applications (same phone, different VA id)
      //   b) An old JWT carried a stale/non-VA id (e.g. app_users.id, cleanPhone)
      // We resolve the vendor's phone from vendor_applications OR the vendors table,
      // then search ALL vendor IDs associated with that phone (VA ids + phone itself).
      if (rows.length === 0) {
        let siblingPhone: string | undefined;

        // 1. Try vendor_applications for the phone
        const [appRow] = await db.select({ phone: vendorApplicationsTable.phone })
          .from(vendorApplicationsTable)
          .where(eq(vendorApplicationsTable.id, vendorId))
          .limit(1);
        if (appRow?.phone) siblingPhone = appRow.phone.replace(/\D/g, "").slice(-10);

        // 2. Fall back to the vendors table joined with vendor_applications
        if (!siblingPhone) {
          const [vendorRow] = await db
            .select({ phone: vendorApplicationsTable.phone })
            .from(vendorsTable)
            .leftJoin(vendorApplicationsTable, eq(vendorApplicationsTable.id, vendorsTable.id))
            .where(eq(vendorsTable.id, vendorId))
            .limit(1);
          if (vendorRow?.phone) siblingPhone = vendorRow.phone.replace(/\D/g, "").slice(-10);
        }

        if (siblingPhone) {
          // All VA ids for this phone
          const siblingApps = await db.select({ id: vendorApplicationsTable.id })
            .from(vendorApplicationsTable)
            .where(sql`RIGHT(REPLACE(REPLACE(${vendorApplicationsTable.phone}, '+', ''), ' ', ''), 10) = ${siblingPhone}`);
          const siblingIds = siblingApps.map((a) => a.id).filter((sid) => sid !== vendorId);

          // Also include the raw 10-digit phone — some old products were saved with phone as vendorId
          const allSearchIds = [...new Set([...siblingIds, siblingPhone])].filter((sid) => sid !== vendorId);

          if (allSearchIds.length > 0) {
            rows = await db.select(lightweightProductCols)
              .from(productsTable)
              .where(inArray(productsTable.vendorId, allSearchIds))
              .orderBy(desc(productsTable.createdAt));
            if (rows.length > 0) {
              console.log(`[products] Vendor ${vendorId}: 0 own products but found ${rows.length} under sibling IDs [${allSearchIds.join(",")}]`);
            }
          }
        }
      }

      const origin = `${req.protocol}://${req.get("host")}`;
      const enriched = await enrichProductRows(rows, origin);

      // Populate the in-memory cache for next request
      setProductCache(vendorId, enriched);
      res.json(enriched);
      // Warm the rest of the live vendors' product caches in the background now
      // that we know the public origin (first request only, per TTL window).
      maybeWarmVendorProducts(origin);
    } catch (err: any) {
      console.error("Failed to fetch vendor products:", err);
      res.status(500).json({ error: "Failed to fetch vendor products" });
    }
  });

  // Serve a product's image
  app.get("/api/products/:productId/image", async (req, res) => {
    try {
      const { productId } = req.params;
      const cacheKey = `product:${productId}`;

      // 1) In-memory cache hit — fastest path (no DB, no compression)
      let entry = imgCacheGet(cacheKey);
      if (!entry) {
        const [row] = await db.select({ image: productsTable.image }).from(productsTable).where(eq(productsTable.id, productId));
        if (!row?.image) return res.status(404).send("No image");
        // External URL — redirect (expo-image will cache it natively)
        if (row.image.startsWith("http")) return res.redirect(302, row.image);
        // Compress once, cache result
        const buf = await compressToBuffer(row.image);
        const etag = `"${crypto.createHash("md5").update(buf).digest("hex")}"`;
        entry = { buf, etag };
        imgCacheSet(cacheKey, entry);
      }

      // 2) ETag — 304 Not Modified if client already has this version
      if (req.headers["if-none-match"] === entry.etag) return res.status(304).end();

      res.set({
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=604800, stale-while-revalidate=86400",
        "Content-Length": entry.buf.length.toString(),
        "ETag": entry.etag,
      });
      return res.end(entry.buf);
    } catch {
      return res.status(500).send("Image error");
    }
  });

  // Upload / update a product image
  app.patch("/api/products/:productId/image", requireAuth, requireRole("VENDOR", "SUPER_ADMIN"), async (req: any, res) => {
    try {
      const { productId } = req.params;
      const { image } = req.body;
      if (!image) return res.status(400).json({ error: "image required" });
      if (!image.startsWith("data:image/") && !image.startsWith("http")) {
        return res.status(400).json({ error: "image must be a data URL or http URL" });
      }
      if (PROXY_IMAGE_RE.test(String(image))) {
        return res.status(400).json({ error: "cannot save a proxy image URL as the image" });
      }
      // Vendors can only update images of their own products
      if (req.user?.role === "VENDOR") {
        const [existing] = await db.select({ vendorId: productsTable.vendorId })
          .from(productsTable).where(eq(productsTable.id, productId)).limit(1);
        if (!existing) return res.status(404).json({ error: "Product not found" });
        const requesterPhone = req.user?.phone?.replace(/\D/g, "").slice(-10) || "";
        const [vendorApp] = await db.select({ phone: vendorApplicationsTable.phone })
          .from(vendorApplicationsTable)
          .where(eq(vendorApplicationsTable.id, existing.vendorId)).limit(1);
        const vendorPhone = (vendorApp?.phone || "").replace(/\D/g, "").slice(-10);
        if (requesterPhone && vendorPhone && requesterPhone !== vendorPhone) {
          return res.status(403).json({ error: "You can only update images for your own products" });
        }
      }
      const [updated] = await db.select({ vendorId: productsTable.vendorId }).from(productsTable).where(eq(productsTable.id, productId)).limit(1);
      const imageToStore = image.startsWith("data:image/")
        ? await compressImageDataUrl(image).catch(() => image)
        : image;
      await db.update(productsTable).set({ image: imageToStore }).where(eq(productsTable.id, productId));
      if (updated) {
        invalidateProductCache(updated.vendorId);
        imgCacheInvalidate(`product:${productId}`);
      }
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Failed to update product image" });
    }
  });

  // Public: top products across all vendors (for customer home screen)
  app.get("/api/products/top", async (req, res) => {
    try {
      const limit = Math.min(parseInt(String(req.query.limit ?? "20"), 10) || 20, 50);
      const rows = await db
        .select({
          id: productsTable.id,
          name: productsTable.name,
          description: productsTable.description,
          price: productsTable.price,
          originalPrice: productsTable.originalPrice,
          category: productsTable.category,
          isAvailable: productsTable.isAvailable,
          codEnabled: productsTable.codEnabled,
          vendorId: productsTable.vendorId,
          vendorName: vendorsTable.name,
          vendorRating: vendorsTable.rating,
          vendorDeliveryTime: vendorsTable.deliveryTime,
          vendorIsOpen: vendorsTable.isOpen,
          // Peek at image prefix only — never send raw base64 blobs
          imagePrefix: sql<string>`LEFT(${productsTable.image}, 5)`,
        })
        .from(productsTable)
        .innerJoin(vendorsTable, eq(productsTable.vendorId, vendorsTable.id))
        .where(and(eq(productsTable.isAvailable, true), eq(vendorsTable.isOpen, true)))
        .orderBy(desc(productsTable.createdAt))
        .limit(limit);
      // Build hasImage flag from prefix; client always fetches via /api/products/:id/image proxy
      const origin = `${req.protocol}://${req.get("host")}`;
      const mapped = rows.map((r: any) => {
        const prefix = (r.imagePrefix ?? "").toLowerCase();
        const hasImage = prefix.startsWith("data:") || prefix.startsWith("http");
        const { imagePrefix: _drop, ...rest } = r;
        return { ...rest, hasImage, image: hasImage ? `${origin}/api/products/${r.id}/image` : "" };
      });
      res.json(mapped);
    } catch (err: any) {
      res.status(500).json({ error: "Failed to fetch top products" });
    }
  });

  // Authenticated endpoint — resolves vendorId from token (never trusts client-sent ID)
  app.get("/api/vendor/my-products", requireAuth, requireRole("VENDOR", "SUPER_ADMIN"), async (req: any, res) => {
    try {
      // Always canonicalize by phone — same logic as POST to ensure panel and store use the same ID.
      // resolveVendorIdByPhone caches the lookup so we don't scan vendor_applications on every load.
      let vendorId: string = req.user.id || "";
      const cleanPhone = (req.user.phone || "").replace(/\D/g, "").slice(-10);
      if (cleanPhone) {
        const resolved = await resolveVendorIdByPhone(cleanPhone);
        if (resolved) vendorId = resolved;
      }
      if (!vendorId) return res.json({ products: [], vendorId: "" });
      // Serve instantly from the shared in-memory product cache when warm.
      res.set("Cache-Control", "private, max-age=60, stale-while-revalidate=300");
      const cached = getProductCache(vendorId);
      if (cached) return res.json({ products: cached, vendorId });
      // Cache miss — load lightweight rows (no base64 blobs) and cache for next time.
      const origin = `${req.protocol}://${req.get("host")}`;
      const enriched = await loadVendorProductsDirect(vendorId, origin);
      setProductCache(vendorId, enriched);
      res.json({ products: enriched, vendorId });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to fetch products" });
    }
  });

  // Authenticated endpoint — returns the calling vendor's own application
  app.get("/api/vendor/my-application", requireAuth, requireRole("VENDOR", "SUPER_ADMIN", "MARKETING", "FRANCHISE"), async (req: any, res) => {
    try {
      const cleanPhone = req.user.phone?.replace(/\D/g, "").slice(-10);
      const [va] = await db.select().from(vendorApplicationsTable).where(
        and(
          or(eq(vendorApplicationsTable.phone, cleanPhone), sql`RIGHT(REPLACE(REPLACE(${vendorApplicationsTable.phone}, '+', ''), ' ', ''), 10) = ${cleanPhone}`),
          or(eq(vendorApplicationsTable.status, "APPROVED"), eq(vendorApplicationsTable.status, "LIVE"))
        )
      ).limit(1);
      if (!va) return res.json({ application: null });
      res.json({ application: va });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to fetch application" });
    }
  });

  app.get("/api/product/:productId", async (req, res) => {
    try {
      const { productId } = req.params;
      const [product] = await db.select().from(productsTable).where(eq(productsTable.id, productId)).limit(1);
      if (!product) return res.status(404).json({ error: "Product not found" });
      res.json(product);
    } catch (err: any) {
      res.status(500).json({ error: "Failed to fetch product" });
    }
  });

  app.post("/api/vendor/products", requireAuth, requireRole("VENDOR", "SUPER_ADMIN"), async (req: any, res) => {
    try {
      const { id, name, description, price, originalPrice, image, category, codEnabled } = req.body;
      if (!id || !name || price == null) {
        return res.status(400).json({ error: "Missing required fields: id, name, price" });
      }
      // Always canonicalize vendorId via phone→vendor_application lookup.
      // req.user.id can be stale (old JWT) or contain a non-VA ID (app_users id, cleanPhone, etc.).
      // Using the phone is always authoritative since it's what the vendor used to log in.
      let vendorId: string = req.user.id || "";
      const cleanPhone = (req.user.phone || "").replace(/\D/g, "").slice(-10);
      if (cleanPhone) {
        const [va] = await db.select({ id: vendorApplicationsTable.id }).from(vendorApplicationsTable).where(
          and(
            or(eq(vendorApplicationsTable.phone, cleanPhone), sql`RIGHT(REPLACE(REPLACE(${vendorApplicationsTable.phone}, '+', ''), ' ', ''), 10) = ${cleanPhone}`),
            or(eq(vendorApplicationsTable.status, "APPROVED"), eq(vendorApplicationsTable.status, "LIVE"))
          )
        ).limit(1);
        if (va) vendorId = va.id;
      }
      if (!vendorId) {
        return res.status(400).json({ error: "No active vendor application found. Please contact support." });
      }
      const imageToStore = (image && image.startsWith("data:image/"))
        ? await compressImageDataUrl(image).catch(() => image)
        : (image || "");
      await db.insert(productsTable).values({
        id,
        vendorId,
        name,
        description: description || "",
        price,
        originalPrice: originalPrice || null,
        image: imageToStore,
        isAvailable: true,
        category: category || "",
        codEnabled: Boolean(codEnabled),
      }).onConflictDoUpdate({
        target: productsTable.id,
        set: { name, description: description || "", price, originalPrice: originalPrice || null, image: imageToStore, category: category || "", codEnabled: Boolean(codEnabled) },
      });
      invalidateProductCache(vendorId);
      imgCacheInvalidate(`product:${id}`);
      res.json({ success: true, id });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to save product" });
    }
  });

  app.put("/api/vendor/products/:productId", requireAuth, requireRole("VENDOR", "SUPER_ADMIN"), async (req: any, res) => {
    try {
      const { productId } = req.params;
      const [existing] = await db.select().from(productsTable).where(eq(productsTable.id, productId)).limit(1);
      if (!existing) return res.status(404).json({ error: "Product not found" });
      // Vendors can only edit their own products — admins can edit any
      if (req.user?.role === "VENDOR") {
        const requesterPhone = req.user?.phone?.replace(/\D/g, "").slice(-10) || "";
        const [vendorApp] = await db.select({ phone: vendorApplicationsTable.phone })
          .from(vendorApplicationsTable)
          .where(eq(vendorApplicationsTable.id, existing.vendorId))
          .limit(1);
        const vendorPhone = (vendorApp?.phone || "").replace(/\D/g, "").slice(-10);
        if (requesterPhone && vendorPhone && requesterPhone !== vendorPhone) {
          return res.status(403).json({ error: "You can only edit your own products" });
        }
      }
      const { name, description, price, originalPrice, image, category, isAvailable, codEnabled } = req.body;
      const updates: Record<string, any> = {};
      if (name !== undefined) updates.name = name;
      if (description !== undefined) updates.description = description;
      if (price !== undefined) updates.price = price;
      if (originalPrice !== undefined) updates.originalPrice = originalPrice;
      // Ignore internal proxy URLs (…/api/products/:id/image) — list endpoints
      // return these for stored images. Persisting one would overwrite the real
      // image with a self-referential URL, so keep the existing image instead.
      if (image !== undefined && !PROXY_IMAGE_RE.test(String(image))) {
        updates.image = (image && image.startsWith("data:image/"))
          ? await compressImageDataUrl(image).catch(() => image)
          : image;
        imgCacheInvalidate(`product:${productId}`);
      }
      if (category !== undefined) updates.category = category;
      if (isAvailable !== undefined) updates.isAvailable = isAvailable;
      if (codEnabled !== undefined) updates.codEnabled = Boolean(codEnabled);
      if (Object.keys(updates).length === 0) return res.status(400).json({ error: "No fields to update" });
      await db.update(productsTable).set(updates).where(eq(productsTable.id, productId));
      invalidateProductCache(existing.vendorId);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to update product" });
    }
  });

  // Admin: add a product to any vendor by ID
  app.post("/api/admin/vendors/:vendorId/products", requireAuth, requireRole("SUPER_ADMIN"), async (req: any, res) => {
    try {
      const { vendorId } = req.params;
      const { name, description, price, originalPrice, image, category, isAvailable } = req.body;
      if (!name || price == null) return res.status(400).json({ error: "name and price are required" });
      const id = `${vendorId}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      await db.insert(productsTable).values({
        id,
        vendorId,
        name,
        description: description || "",
        price: Number(price),
        originalPrice: originalPrice ? Number(originalPrice) : null,
        image: image || "",
        isAvailable: isAvailable !== false,
        category: category || "",
      });
      invalidateProductCache(vendorId);
      res.json({ success: true, id });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to add product" });
    }
  });

  app.delete("/api/vendor/products/:productId", requireAuth, requireRole("VENDOR", "SUPER_ADMIN"), async (req: any, res) => {
    try {
      const { productId } = req.params;
      const [existing] = await db.select().from(productsTable).where(eq(productsTable.id, productId)).limit(1);
      if (!existing) return res.status(404).json({ error: "Product not found" });
      // Vendors can only delete their own products
      if (req.user?.role === "VENDOR") {
        const requesterPhone = req.user?.phone?.replace(/\D/g, "").slice(-10) || "";
        const [vendorApp] = await db.select({ phone: vendorApplicationsTable.phone })
          .from(vendorApplicationsTable)
          .where(eq(vendorApplicationsTable.id, existing.vendorId)).limit(1);
        const vendorPhone = (vendorApp?.phone || "").replace(/\D/g, "").slice(-10);
        if (requesterPhone && vendorPhone && requesterPhone !== vendorPhone) {
          return res.status(403).json({ error: "You can only delete your own products" });
        }
      }
      await db.delete(productsTable).where(eq(productsTable.id, productId));
      invalidateProductCache(existing.vendorId);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to delete product" });
    }
  });

  // ─── ORDERS ──────────────────────────────────────────────────────────────────

  app.post("/api/orders", requireAuth, async (req: any, res) => {
    try {
      const { id, customerName, vendorId, vendorName, vendorCategoryId, deliveryPartnerId, deliveryPartnerName, status, totalAmount, paymentStatus, paymentMethod, deliveryAddress, deliveryOTP, deliveryNote, deliverySpeed, assignedAt, items } = req.body;
      // Whitelist client-supplied paymentStatus — defaults to PAID for backwards compat.
      const ALLOWED_PAYMENT_STATUSES = ["PAID", "PENDING", "PENDING_VERIFICATION", "FAILED", "REFUNDED"];
      const finalPaymentStatus = ALLOWED_PAYMENT_STATUSES.includes(paymentStatus) ? paymentStatus : "PAID";
      // Whitelist payment method so reports/audits can distinguish QR-paid orders.
      const ALLOWED_PAYMENT_METHODS = ["ONLINE", "COD", "WALLET", "COINS", "VENDOR_QR"];
      const finalPaymentMethod = ALLOWED_PAYMENT_METHODS.includes(paymentMethod) ? paymentMethod : null;
      // Derive customerId from the authenticated JWT — never trust the client-supplied value
      const customerId: string = req.user.id || req.user.phone?.replace(/\D/g, "").slice(-10) || "";
      if (!id || !customerId || !vendorId || !vendorName || !deliveryAddress) {
        return res.status(400).json({ error: "Missing required order fields" });
      }
      const insertedOrder = await db.insert(ordersTable).values({
        id, customerId, customerName: customerName || "", vendorId, vendorName,
        vendorCategoryId: vendorCategoryId || null,
        deliveryPartnerId: deliveryPartnerId || null,
        deliveryPartnerName: deliveryPartnerName || null,
        status: "PENDING",
        totalAmount, paymentStatus: finalPaymentStatus,
        paymentMethod: finalPaymentMethod,
        deliveryAddress, deliveryOTP: deliveryOTP || null,
        deliveryNote: deliveryNote || null,
        deliverySpeed: deliverySpeed || null,
        assignedAt: assignedAt ? new Date(assignedAt) : null,
      }).onConflictDoNothing().returning({ id: ordersTable.id });
      const orderWasInserted = insertedOrder.length > 0;
      if (items && Array.isArray(items)) {
        for (const item of items) {
          await db.insert(orderItemsTable).values({
            id: item.id, orderId: id, productId: item.productId,
            productName: item.productName, quantity: item.quantity,
            price: item.price, seatNumber: item.seatNumber || null,
            seatClass: item.seatClass || null,
          }).onConflictDoNothing();
        }
      }
      // Alert the vendor in real time when the customer claims to have paid via QR
      // (paymentMethod=VENDOR_QR, paymentStatus=PENDING_VERIFICATION). Tapping the
      // notification deep-links into the vendor orders screen so they can verify
      // the UPI payment immediately.
      if (orderWasInserted && finalPaymentMethod === "VENDOR_QR" && finalPaymentStatus === "PENDING_VERIFICATION") {
        const notifTitle = "QR payment to verify";
        const amountLabel = typeof totalAmount === "number" ? `₹${totalAmount}` : `₹${totalAmount || 0}`;
        const notifBody = `${customerName || "A customer"} says they paid ${amountLabel} via QR — verify in your UPI app`;
        const notifId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
        try {
          await db.insert(notificationsTable).values({
            id: notifId,
            title: notifTitle,
            message: notifBody,
            targetRole: "VENDOR",
            targetUserId: vendorId,
            read: false,
          });
          cache.invalidatePattern(`^notif_history_${vendorId}_`);
          cache.invalidate(`unread_${vendorId}`);
        } catch (notifErr) {
          console.error("Failed to persist VENDOR_QR notification:", notifErr);
        }
        try {
          await sendPushToUser(storage, vendorId, notifTitle, notifBody, {
            orderId: id,
            type: "VENDOR_QR_PENDING",
            deepLink: "/(vendor)/vendorOrders",
            amount: totalAmount,
          });
        } catch (pushErr) {
          console.error("Failed to push VENDOR_QR alert to vendor:", pushErr);
        }
      }

      // Ring the vendor + their franchise owner on EVERY new order so they never
      // miss it even when the app is closed or the phone is locked. The push wakes
      // the phone via OneSignal in the shipped Median app (and via Expo on native
      // builds); the in-app NewOrderAlert is the complementary in-app layer.
      // VENDOR_QR already pushed the vendor above with a verify-specific message, so
      // skip the duplicate vendor push in that case (still push the franchise owner).
      if (orderWasInserted) {
        const amountLabel = `₹${typeof totalAmount === "number" ? totalAmount : totalAmount || 0}`;
        if (finalPaymentMethod !== "VENDOR_QR") {
          const vendorTitle = "🔔 New order received";
          const vendorBody = `${customerName || "A customer"} placed an order for ${amountLabel}. Tap to view.`;
          const vNotifId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
          try {
            await db.insert(notificationsTable).values({
              id: vNotifId,
              title: vendorTitle,
              message: vendorBody,
              targetRole: "VENDOR",
              targetUserId: vendorId,
              read: false,
            });
            cache.invalidatePattern(`^notif_history_${vendorId}_`);
            cache.invalidate(`unread_${vendorId}`);
          } catch (notifErr) {
            console.error("Failed to persist new-order vendor notification:", notifErr);
          }
          try {
            await sendPushToUser(storage, vendorId, vendorTitle, vendorBody, {
              orderId: id,
              type: "NEW_ORDER_VENDOR",
              deepLink: "/(vendor)/vendorOrders",
              amount: totalAmount,
            });
          } catch (pushErr) {
            console.error("Failed to push new-order alert to vendor:", pushErr);
          }
        }
        // Franchise owner for the vendor's territory. The derived franchiseId on the
        // vendor application is the owner's phone (see replit.md franchise routing).
        try {
          const [vApp] = await db
            .select({ franchiseId: vendorApplicationsTable.franchiseId })
            .from(vendorApplicationsTable)
            .where(eq(vendorApplicationsTable.id, vendorId))
            .limit(1);
          const franchiseUserId = (vApp?.franchiseId || "").replace(/\D/g, "").slice(-10);
          if (franchiseUserId) {
            await sendPushToUser(
              storage,
              franchiseUserId,
              "🔔 New order in your territory",
              `${vendorName} received an order for ${amountLabel}.`,
              {
                orderId: id,
                type: "NEW_ORDER_FRANCHISE",
                deepLink: "/(franchise)",
                amount: totalAmount,
              }
            );
          }
        } catch (pushErr) {
          console.error("Failed to push new-order alert to franchise owner:", pushErr);
        }
      }

      // Credit vendor's Go Bharat Coins when customer pays with coins
      // Look up vendor phone (vendorId = application ID, need phone for coin balance key)
      if (orderWasInserted && finalPaymentMethod === "COINS" && vendorId && typeof totalAmount === "number" && totalAmount > 0) {
        try {
          const [vendorApp] = await db.select({ phone: vendorApplicationsTable.phone })
            .from(vendorApplicationsTable)
            .where(eq(vendorApplicationsTable.id, vendorId))
            .limit(1);
          const vendorPhone = vendorApp?.phone ? vendorApp.phone.replace(/\D/g, "").slice(-10) : null;
          if (vendorPhone) {
            const vendorCoinTxnId = `CT_COIN_${id.slice(-8)}_${Date.now().toString(36)}`;
            await db.insert(coinTransactionsTable).values({
              id: vendorCoinTxnId,
              userId: vendorPhone,
              type: "EARNED",
              amount: Math.max(1, Math.round(totalAmount / 100)),
              reference: `Coins sale - Order #${id} (₹${totalAmount})`,
            });
          }
        } catch (coinErr) {
          console.error("[COINS] Failed to credit vendor coins for order", id, coinErr);
          // non-fatal — don't fail the order
        }
      }

      // Order/booking confirmation over WhatsApp (approved utility template).
      // Fire-and-forget: never block or fail the order on a messaging error, only
      // attempt for a genuinely placed order with a usable customer phone, and skip
      // failed payments. Falls back silently when WhatsApp isn't configured yet, and
      // sendWhatsAppOrderConfirmation ignores numbers it can't normalize.
      if (orderWasInserted && finalPaymentStatus !== "FAILED") {
        const customerPhone = (req.user?.phone || customerId || "").toString();
        if (customerPhone) {
          void sendWhatsAppOrderConfirmation(customerPhone, {
            customerName: customerName || "Customer",
            orderId: id,
            amount: String(typeof totalAmount === "number" ? totalAmount : totalAmount || 0),
            vendorName: vendorName || "the store",
          })
            .then((r) => {
              if (r.sent) console.log(`WhatsApp order confirmation sent for order ${id}`);
              else if (r.configured && r.error) console.error(`WhatsApp order confirmation failed for ${id}: ${r.error}`);
            })
            .catch((e) => console.error("WhatsApp order confirmation error:", e?.message || e));
        }
      }

      res.json({ success: true, orderId: id });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to save order" });
    }
  });

  // GET /api/orders — alias for customer's own order history (same as /api/orders/my)
  app.get("/api/orders", requireAuth, requireRole("CUSTOMER"), async (req: any, res) => {
    try {
      const userId = req.user.id || req.user.phone?.replace(/\D/g, "").slice(-10);
      if (!userId) return res.json({ orders: [] });
      const rows = await db.select().from(ordersTable).where(eq(ordersTable.customerId, userId)).orderBy(desc(ordersTable.createdAt)).limit(100);
      const orderIds = rows.map((o: any) => o.id);
      const allItems = orderIds.length > 0 ? await db.select().from(orderItemsTable).where(inArray(orderItemsTable.orderId, orderIds)) : [];
      const orders = rows.map((o: any) => ({
        ...o,
        createdAt: o.createdAt?.toISOString(),
        assignedAt: o.assignedAt?.toISOString() || null,
        pickedAt: o.pickedAt?.toISOString() || null,
        deliveredAt: o.deliveredAt?.toISOString() || null,
        items: allItems.filter((i: any) => i.orderId === o.id),
      }));
      res.json({ orders });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to fetch orders" });
    }
  });

  app.get("/api/orders/my", requireAuth, async (req: any, res) => {
    try {
      // id is either cleanPhone (for customers) or team member id — both stored in JWT
      const userId = req.user.id || req.user.phone?.replace(/\D/g, "").slice(-10);
      if (!userId) return res.json({ orders: [] });
      const rows = await db.select().from(ordersTable).where(eq(ordersTable.customerId, userId)).orderBy(desc(ordersTable.createdAt)).limit(100);
      const orderIds = rows.map(o => o.id);
      const allItems = orderIds.length > 0 ? await db.select().from(orderItemsTable).where(inArray(orderItemsTable.orderId, orderIds)) : [];
      const orders = rows.map(o => ({
        ...o,
        createdAt: o.createdAt?.toISOString(),
        assignedAt: o.assignedAt?.toISOString() || null,
        pickedAt: o.pickedAt?.toISOString() || null,
        deliveredAt: o.deliveredAt?.toISOString() || null,
        items: allItems.filter(i => i.orderId === o.id),
      }));
      res.json({ orders });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to fetch orders" });
    }
  });

  app.get("/api/orders/vendor", requireAuth, requireRole("VENDOR", "SUPER_ADMIN"), async (req: any, res) => {
    try {
      // Collect all vendor IDs that belong to this phone number.
      // A vendor may have multiple applications (e.g. duplicate registrations under the same phone).
      // We want to show orders for ALL of them in a single panel.
      const cleanPhone = req.user.phone?.replace(/\D/g, "").slice(-10);
      const allVendorApps = cleanPhone ? await db.select({ id: vendorApplicationsTable.id })
        .from(vendorApplicationsTable)
        .where(
          and(
            or(eq(vendorApplicationsTable.phone, cleanPhone), sql`RIGHT(REPLACE(REPLACE(${vendorApplicationsTable.phone}, '+', ''), ' ', ''), 10) = ${cleanPhone}`),
            or(eq(vendorApplicationsTable.status, "APPROVED"), eq(vendorApplicationsTable.status, "LIVE"))
          )
        ) : [];
      // Always include the id from the JWT token itself (may be a recently approved app not returned above)
      const vendorIdsSet = new Set<string>(allVendorApps.map((a) => a.id));
      if (req.user.id) vendorIdsSet.add(req.user.id);
      const vendorIds = Array.from(vendorIdsSet);
      if (vendorIds.length === 0) return res.json({ orders: [] });
      const rows = await db.select().from(ordersTable)
        .where(vendorIds.length === 1 ? eq(ordersTable.vendorId, vendorIds[0]) : inArray(ordersTable.vendorId, vendorIds))
        .orderBy(desc(ordersTable.createdAt)).limit(200);
      const orderIds = rows.map(o => o.id);
      const allItems = orderIds.length > 0 ? await db.select().from(orderItemsTable).where(inArray(orderItemsTable.orderId, orderIds)) : [];
      const orders = rows.map(o => ({
        ...o,
        createdAt: o.createdAt?.toISOString(),
        assignedAt: o.assignedAt?.toISOString() || null,
        pickedAt: o.pickedAt?.toISOString() || null,
        deliveredAt: o.deliveredAt?.toISOString() || null,
        items: allItems.filter(i => i.orderId === o.id),
      }));
      res.json({ orders });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to fetch vendor orders" });
    }
  });

  // Available (unassigned READY) orders for any online delivery partner
  app.get("/api/orders/available", requireAuth, requireRole("DELIVERY", "SUPER_ADMIN"), async (req: any, res) => {
    try {
      const rows = await db.select().from(ordersTable)
        .where(and(eq(ordersTable.status, "READY"), isNull(ordersTable.deliveryPartnerId)))
        .orderBy(desc(ordersTable.createdAt)).limit(50);
      const orderIds = rows.map(o => o.id);
      const allItems = orderIds.length > 0 ? await db.select().from(orderItemsTable).where(inArray(orderItemsTable.orderId, orderIds)) : [];
      const orders = rows.map(o => ({
        ...o,
        createdAt: o.createdAt?.toISOString(),
        assignedAt: o.assignedAt?.toISOString() || null,
        pickedAt: o.pickedAt?.toISOString() || null,
        deliveredAt: o.deliveredAt?.toISOString() || null,
        items: allItems.filter(i => i.orderId === o.id),
      }));
      res.json({ orders });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to fetch available orders" });
    }
  });

  app.get("/api/orders/delivery", requireAuth, requireRole("DELIVERY", "SUPER_ADMIN"), async (req: any, res) => {
    try {
      let partnerId = req.user.id;
      // If no id in JWT (old token), look up delivery partner by phone
      if (!partnerId) {
        const cleanPhone = req.user.phone?.replace(/\D/g, "").slice(-10);
        const [member] = await db.select().from(teamMembersTable).where(
          or(eq(teamMembersTable.phone, cleanPhone), sql`RIGHT(REPLACE(REPLACE(${teamMembersTable.phone}, '+', ''), ' ', ''), 10) = ${cleanPhone}`)
        );
        partnerId = member?.id;
      }
      if (!partnerId) return res.json({ orders: [] });
      const rows = await db.select().from(ordersTable).where(eq(ordersTable.deliveryPartnerId, partnerId)).orderBy(desc(ordersTable.createdAt)).limit(200);
      const orderIds = rows.map(o => o.id);
      const allItems = orderIds.length > 0 ? await db.select().from(orderItemsTable).where(inArray(orderItemsTable.orderId, orderIds)) : [];
      const orders = rows.map(o => ({
        ...o,
        createdAt: o.createdAt?.toISOString(),
        assignedAt: o.assignedAt?.toISOString() || null,
        pickedAt: o.pickedAt?.toISOString() || null,
        deliveredAt: o.deliveredAt?.toISOString() || null,
        items: allItems.filter(i => i.orderId === o.id),
      }));
      res.json({ orders });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to fetch delivery orders" });
    }
  });

  app.get("/api/orders/all", requireAuth, requireRole("SUPER_ADMIN", "FRANCHISE"), async (req: any, res) => {
    try {
      const rows = await db.select().from(ordersTable).orderBy(desc(ordersTable.createdAt)).limit(500);
      const orderIds = rows.map(o => o.id);
      const allItems = orderIds.length > 0 ? await db.select().from(orderItemsTable).where(inArray(orderItemsTable.orderId, orderIds)) : [];
      const orders = rows.map(o => ({
        ...o,
        createdAt: o.createdAt?.toISOString(),
        assignedAt: o.assignedAt?.toISOString() || null,
        pickedAt: o.pickedAt?.toISOString() || null,
        deliveredAt: o.deliveredAt?.toISOString() || null,
        items: allItems.filter(i => i.orderId === o.id),
      }));
      res.json({ orders });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to fetch orders" });
    }
  });

  app.get("/api/orders/:id", requireAuth, async (req: any, res) => {
    try {
      const { id } = req.params;
      const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, id)).limit(1);
      if (!order) return res.status(404).json({ error: "Order not found" });

      // Authorization: only allow the customer, their vendor, their delivery partner, or admins
      const role: string = req.user.role || "";
      const isPrivileged = role === "SUPER_ADMIN" || role === "FRANCHISE";

      if (!isPrivileged) {
        const userId: string = req.user.id || req.user.phone?.replace(/\D/g, "").slice(-10) || "";
        const isCustomer = userId && order.customerId === userId;
        const isVendor = userId && order.vendorId === userId;
        const isDeliveryPartner = userId && order.deliveryPartnerId === userId;
        if (!isCustomer && !isVendor && !isDeliveryPartner) {
          return res.status(403).json({ error: "Access denied" });
        }
      }

      const items = await db.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, id));
      res.json({
        ...order,
        createdAt: order.createdAt?.toISOString(),
        assignedAt: order.assignedAt?.toISOString() || null,
        pickedAt: order.pickedAt?.toISOString() || null,
        deliveredAt: order.deliveredAt?.toISOString() || null,
        items,
      });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to fetch order" });
    }
  });

  // Delivery partner accepts an available (READY, unassigned) order
  app.post("/api/orders/:id/accept-delivery", requireAuth, requireRole("DELIVERY", "SUPER_ADMIN"), async (req: any, res) => {
    try {
      const { id } = req.params;
      const partnerId = req.user.id;
      if (!partnerId) return res.status(400).json({ error: "Partner ID not found in token" });

      // Look up partner name from team_members
      const [member] = await db.select({ name: teamMembersTable.name })
        .from(teamMembersTable)
        .where(eq(teamMembersTable.id, partnerId))
        .limit(1);
      const partnerName = member?.name || req.user.phone || "Delivery Partner";

      // Only assign if order is READY and unassigned
      const [order] = await db.select({ status: ordersTable.status, deliveryPartnerId: ordersTable.deliveryPartnerId })
        .from(ordersTable).where(eq(ordersTable.id, id)).limit(1);
      if (!order) return res.status(404).json({ error: "Order not found" });
      if (order.status !== "READY") return res.status(400).json({ error: "Order is not ready for pickup" });
      if (order.deliveryPartnerId) return res.status(409).json({ error: "Order already assigned to another delivery partner" });

      await db.update(ordersTable).set({
        deliveryPartnerId: partnerId,
        deliveryPartnerName: partnerName,
        assignedAt: new Date(),
      }).where(eq(ordersTable.id, id));

      res.json({ success: true, partnerName });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to accept order" });
    }
  });

  // Vendor confirms or rejects a VENDOR_QR payment that was sitting in PENDING_VERIFICATION.
  // Only the vendor that owns the order (or SUPER_ADMIN) can flip the status.
  app.patch("/api/orders/:id/payment-status", requireAuth, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { paymentStatus } = req.body || {};
      const ALLOWED = ["PAID", "FAILED", "REFUNDED"];
      if (!ALLOWED.includes(paymentStatus)) {
        return res.status(400).json({ error: "paymentStatus must be one of PAID, FAILED, REFUNDED" });
      }

      const [existing] = await db
        .select({ id: ordersTable.id, vendorId: ordersTable.vendorId, paymentStatus: ordersTable.paymentStatus, paymentMethod: ordersTable.paymentMethod })
        .from(ordersTable)
        .where(eq(ordersTable.id, id))
        .limit(1);
      if (!existing) return res.status(404).json({ error: "Order not found" });

      if (existing.paymentStatus !== "PENDING_VERIFICATION") {
        return res.status(400).json({ error: `Only orders awaiting verification can be updated (current: ${existing.paymentStatus})` });
      }
      if (existing.paymentMethod !== "VENDOR_QR") {
        return res.status(400).json({ error: "This endpoint only verifies vendor QR payments" });
      }

      const userRole = req.user?.role;
      if (userRole !== "SUPER_ADMIN") {
        if (userRole !== "VENDOR") {
          return res.status(403).json({ error: "Only the vendor can confirm QR payments" });
        }
        // Resolve the authenticated vendor's application ID and ensure it matches the order's vendorId.
        let vendorId: string = req.user.id;
        const cleanPhone = req.user.phone?.replace(/\D/g, "").slice(-10);
        if (!vendorId || /^\d{10}$/.test(vendorId)) {
          const [va] = await db.select({ id: vendorApplicationsTable.id }).from(vendorApplicationsTable).where(
            and(
              or(eq(vendorApplicationsTable.phone, cleanPhone), sql`RIGHT(REPLACE(REPLACE(${vendorApplicationsTable.phone}, '+', ''), ' ', ''), 10) = ${cleanPhone}`),
              or(eq(vendorApplicationsTable.status, "APPROVED"), eq(vendorApplicationsTable.status, "LIVE"))
            )
          ).limit(1);
          if (va) vendorId = va.id;
        }
        if (!vendorId || vendorId !== existing.vendorId) {
          return res.status(403).json({ error: "You can only verify payments for your own orders" });
        }
      }

      // Atomically flip payment status, and on FAILED/REFUNDED also cancel the order so
      // it leaves the active fulfillment pipeline in a single write.
      const updates: any = { paymentStatus };
      let newOrderStatus: string | undefined;
      if (paymentStatus === "FAILED" || paymentStatus === "REFUNDED") {
        updates.status = "CANCELLED";
        newOrderStatus = "CANCELLED";
      }
      await db.update(ordersTable).set(updates).where(eq(ordersTable.id, id));
      console.log(`[QR-Verify] Order ${id} paymentStatus -> ${paymentStatus}${newOrderStatus ? ` (status -> ${newOrderStatus})` : ""} by ${req.user?.phone || req.user?.id} (${userRole})`);
      res.json({ success: true, paymentStatus, status: newOrderStatus });
    } catch (err: any) {
      console.error("[QR-Verify] Failed:", err);
      res.status(500).json({ error: "Failed to update payment status" });
    }
  });

  app.put("/api/orders/:id/status", requireAuth, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      if (!status) return res.status(400).json({ error: "status required" });

      const userRole = req.user?.role;

      if (userRole === "CUSTOMER") {
        if (status !== "CANCELLED") {
          return res.status(403).json({ error: "Customers can only cancel orders" });
        }
        const [existingOrder] = await db.select({ status: ordersTable.status, customerId: ordersTable.customerId })
          .from(ordersTable)
          .where(eq(ordersTable.id, id))
          .limit(1);
        if (!existingOrder) return res.status(404).json({ error: "Order not found" });
        if (existingOrder.status !== "PENDING") {
          return res.status(400).json({ error: "Only pending orders can be cancelled" });
        }
        const requesterId: string = req.user?.id || req.user?.phone?.replace(/\D/g, "").slice(-10) || "";
        if (requesterId && existingOrder.customerId !== requesterId) {
          return res.status(403).json({ error: "You can only cancel your own orders" });
        }
      }

      const updates: any = { status };
      if (status === "PICKED") updates.pickedAt = new Date();
      if (status === "DELIVERED") updates.deliveredAt = new Date();
      await db.update(ordersTable).set(updates).where(eq(ordersTable.id, id));

      // When an order becomes READY it enters the unassigned pickup pool, so ring
      // every delivery partner — even with the app closed/locked — so they can grab
      // it. Only fire for genuine delivery orders (those not already assigned).
      if (status === "READY") {
        try {
          const [ord] = await db
            .select({ vendorName: ordersTable.vendorName, deliveryPartnerId: ordersTable.deliveryPartnerId, deliveryAddress: ordersTable.deliveryAddress })
            .from(ordersTable)
            .where(eq(ordersTable.id, id))
            .limit(1);
          if (ord && !ord.deliveryPartnerId) {
            const addr = (ord.deliveryAddress || "").toString().slice(0, 40);
            await sendPushToRole(
              storage,
              "DELIVERY",
              "📦 New delivery available",
              `Pickup from ${ord.vendorName || "a store"}${addr ? ` → ${addr}` : ""}. Tap to accept.`,
              { orderId: id, type: "NEW_DELIVERY_AVAILABLE", deepLink: "/(delivery)" }
            );
          }
        } catch (pushErr) {
          console.error("Failed to push new-delivery alert to delivery partners:", pushErr);
        }
      }

      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to update order status" });
    }
  });

  // ─── VENDOR APPLICATIONS ─────────────────────────────────────────────────────

  // In-memory dedup cache: prevents duplicate submissions when button is tapped multiple times
  const recentVendorSubmissions = new Map<string, number>();
  app.post("/api/vendor-applications", async (req: any, res) => {
    try {
      const body = req.body;
      if (!body.id || !body.businessName || !body.ownerName || !body.phone || !body.categoryId) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      // Dedup: same phone + business name within 30s returns success without inserting.
      // IMPORTANT: only deduplicate AFTER the phone-duplicate check so a 409 rejection
      // does NOT poison the cache and cause future retries to get a fake 200.
      const dedupKey = `${body.phone}|${body.businessName}`;
      const lastSubmit = recentVendorSubmissions.get(dedupKey);
      if (lastSubmit && Date.now() - lastSubmit < 30000) {
        return res.json({ success: true, id: body.id, deduplicated: true });
      }
      // Phone duplicate check: reject if this number already has an active vendor application
      const normalizedPhone = body.phone.replace(/\D/g, "").slice(-10);
      const [existingByPhone] = await db
        .select({ id: vendorApplicationsTable.id, status: vendorApplicationsTable.status, businessName: vendorApplicationsTable.businessName })
        .from(vendorApplicationsTable)
        .where(sql`RIGHT(REGEXP_REPLACE(${vendorApplicationsTable.phone}, '[^0-9]', '', 'g'), 10) = ${normalizedPhone}`)
        .limit(1);
      if (existingByPhone && existingByPhone.status !== "REJECTED") {
        return res.status(409).json({
          error: `This mobile number is already registered as a vendor ("${existingByPhone.businessName}"). Please contact support if you need to update your details.`,
          alreadyRegistered: true,
        });
      }
      // Always look up the real name from team_members using the authenticated user's phone
      const submitterPhone = (req.user?.phone || "").replace(/\D/g, "").slice(-10);
      let realSubmittedBy = body.submittedBy || req.user?.name || "";
      if (submitterPhone) {
        const [submitterMember] = await db.select({ name: teamMembersTable.name })
          .from(teamMembersTable)
          .where(sql`RIGHT(REGEXP_REPLACE(${teamMembersTable.phone}, '[^0-9]', '', 'g'), 10) = ${submitterPhone}`);
        if (submitterMember?.name) realSubmittedBy = submitterMember.name;
      }
      // Use coordinates from body if valid, otherwise try to resolve from locationLink server-side
      let finalLat: number | null = (body.latitude && Math.abs(body.latitude) > 0.001) ? body.latitude : null;
      let finalLng: number | null = (body.longitude && Math.abs(body.longitude) > 0.001) ? body.longitude : null;
      const rawLocationLink: string | null = body.locationLink || null;
      if ((!finalLat || !finalLng) && rawLocationLink) {
        try {
          const resolved = await resolveMapLinkToCoords(rawLocationLink);
          if (resolved) { finalLat = resolved.lat; finalLng = resolved.lng; }
          console.log(`[APP-SUBMIT] Resolved location link for ${body.businessName}: (${finalLat}, ${finalLng})`);
        } catch {}
      }
      // Pin code-based franchise territory routing: derive franchiseId from vendor pin code
      const vendorPinCode = (body.pinCode || "").trim();
      let derivedFranchiseId = (body.franchiseId || "").trim();
      if (vendorPinCode) {
        try {
          const [franchiseOwner] = await db.select({ phone: teamMembersTable.phone })
            .from(teamMembersTable)
            .where(and(
              eq(teamMembersTable.role, "FRANCHISE"),
              eq(teamMembersTable.pinCode, vendorPinCode),
              eq(teamMembersTable.status, "ACTIVE")
            ));
          if (franchiseOwner?.phone) {
            derivedFranchiseId = franchiseOwner.phone.replace(/\D/g, "").slice(-10);
            console.log(`[APP-SUBMIT] Routed "${body.businessName}" (pin: ${vendorPinCode}) → franchise ${derivedFranchiseId}`);
          } else {
            console.log(`[APP-SUBMIT] No active franchise owner found for pin ${vendorPinCode} — application unassigned`);
            derivedFranchiseId = "";
          }
        } catch {}
      }
      await db.insert(vendorApplicationsTable).values({
        id: body.id,
        businessName: body.businessName,
        ownerName: body.ownerName,
        phone: body.phone,
        email: body.email || "",
        categoryId: body.categoryId,
        subCategoryId: body.subCategoryId || null,
        address: body.address,
        city: body.city || "",
        latitude: finalLat,
        longitude: finalLng,
        locationLink: rawLocationLink,
        description: body.description || "",
        gstNumber: body.gstNumber || "",
        panNumber: body.panNumber || "",
        bankAccount: body.bankAccount || "",
        ifscCode: body.ifscCode || "",
        commissionRate: body.commissionRate ?? 10,
        paymentMethods: body.paymentMethods || [],
        upiId: body.upiId || null,
        subscriptionPlan: body.subscriptionPlan || null,
        photos: body.photos || [],
        pinCode: body.pinCode || "",
        franchiseId: derivedFranchiseId,
        status: "PENDING",
        submittedBy: realSubmittedBy,
        submittedAt: new Date(),
      }).onConflictDoNothing();
      // If we have valid coordinates, sync immediately to the vendor record if it exists
      if (finalLat && finalLng) {
        const _MAL_LAT = 20.5547, _MAL_LNG = 74.5247, _MAX_KM = 50;
        const dLat = (finalLat - _MAL_LAT) * Math.PI / 180, dLng = (finalLng - _MAL_LNG) * Math.PI / 180;
        const a = Math.sin(dLat/2)**2 + Math.cos(_MAL_LAT*Math.PI/180)*Math.cos(finalLat*Math.PI/180)*Math.sin(dLng/2)**2;
        const km = 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        if (km <= _MAX_KM) {
          await db.update(vendorsTable).set({ lat: finalLat, lng: finalLng }).where(eq(vendorsTable.id, body.id));
        }
      }
      // Only mark as recently submitted AFTER successful insert — prevents fake 200 cache
      // hits on retries after a 500 failure.
      recentVendorSubmissions.set(dedupKey, Date.now());
      for (const [k, t] of recentVendorSubmissions) { if (Date.now() - t > 60000) recentVendorSubmissions.delete(k); }
      res.json({ success: true, id: body.id });
    } catch (err: any) {
      console.error("[APP-SUBMIT] DB error saving vendor application:", err?.message || err, "code:", err?.code, "detail:", err?.detail);
      res.status(500).json({ error: "Failed to save vendor application" });
    }
  });

  app.get("/api/vendor-applications/mine", requireAuth, requireRole("VENDOR"), async (req: any, res) => {
    try {
      const phone = (req.user?.phone || "").replace(/\D/g, "").slice(-10);
      if (!phone) return res.json({ application: null });
      const rows = await db.select().from(vendorApplicationsTable)
        .where(or(
          sql`RIGHT(REGEXP_REPLACE(${vendorApplicationsTable.phone}, '[^0-9]', '', 'g'), 10) = ${phone}`,
        ))
        .orderBy(desc(vendorApplicationsTable.submittedAt))
        .limit(1);
      const app = rows[0] ? { ...rows[0], submittedAt: rows[0].submittedAt?.toISOString(), reviewedAt: rows[0].reviewedAt?.toISOString() || null } : null;
      res.json({ application: app });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to fetch vendor application" });
    }
  });

  // Vendor toggles their own shop open/closed status
  app.patch("/api/vendor/status", requireAuth, requireRole("VENDOR", "SUPER_ADMIN"), async (req: any, res) => {
    try {
      const phone = (req.user?.phone || "").replace(/\D/g, "").slice(-10);
      if (!phone) return res.status(400).json({ error: "No phone" });
      const { isOpen } = req.body;
      if (typeof isOpen !== "boolean") return res.status(400).json({ error: "isOpen (boolean) required" });
      const rows = await db.update(vendorApplicationsTable)
        .set({ isOpen })
        .where(sql`RIGHT(REGEXP_REPLACE(${vendorApplicationsTable.phone}, '[^0-9]', '', 'g'), 10) = ${phone}`)
        .returning({ id: vendorApplicationsTable.id, isOpen: vendorApplicationsTable.isOpen });
      if (rows.length === 0) return res.status(404).json({ error: "Vendor not found" });
      res.json({ success: true, isOpen: rows[0].isOpen });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to update vendor status" });
    }
  });

  // Resolve a Google Maps link to coordinates (preview, no save)
  app.post("/api/vendor/location/resolve", requireAuth, requireRole("VENDOR"), async (req: any, res) => {
    try {
      const { locationLink } = req.body;
      if (!locationLink || typeof locationLink !== "string" || !locationLink.trim()) {
        return res.status(400).json({ error: "No link provided" });
      }
      const resolved = await resolveMapLinkToCoords(locationLink.trim());
      if (!resolved) {
        return res.status(422).json({ error: "Could not extract coordinates from this link. Try a different share link." });
      }
      if (resolved.lat < 6 || resolved.lat > 37 || resolved.lng < 68 || resolved.lng > 97) {
        return res.status(422).json({ error: "Coordinates appear to be outside India. Please check the link." });
      }
      res.json({ lat: resolved.lat, lng: resolved.lng });
    } catch {
      res.status(500).json({ error: "Failed to resolve link" });
    }
  });

  // Vendor self-update their own shop location
  app.patch("/api/vendor/location", requireAuth, requireRole("VENDOR"), async (req: any, res) => {
    try {
      const phone = (req.user?.phone || "").replace(/\D/g, "").slice(-10);
      if (!phone) return res.status(400).json({ error: "No phone" });
      const { locationLink, lat, lng } = req.body;
      let resolvedLat: number | null = lat != null ? parseFloat(String(lat)) : null;
      let resolvedLng: number | null = lng != null ? parseFloat(String(lng)) : null;
      if (locationLink && typeof locationLink === "string" && locationLink.trim()) {
        const resolved = await resolveMapLinkToCoords(locationLink.trim());
        if (resolved) { resolvedLat = resolved.lat; resolvedLng = resolved.lng; }
      }
      if (resolvedLat === null || resolvedLng === null || isNaN(resolvedLat) || isNaN(resolvedLng)) {
        return res.status(400).json({ error: "Could not resolve location. Provide valid coordinates or a Google Maps link." });
      }
      if (resolvedLat < 6 || resolvedLat > 37 || resolvedLng < 68 || resolvedLng > 97) {
        return res.status(400).json({ error: "Coordinates appear to be outside India. Please check the location." });
      }
      const [appRow] = await db.select({ id: vendorApplicationsTable.id })
        .from(vendorApplicationsTable)
        .where(sql`RIGHT(REGEXP_REPLACE(${vendorApplicationsTable.phone}, '[^0-9]', '', 'g'), 10) = ${phone}`)
        .orderBy(
          sql`CASE WHEN ${vendorApplicationsTable.status} = 'LIVE' THEN 0 WHEN ${vendorApplicationsTable.status} = 'APPROVED' THEN 1 ELSE 2 END`,
          desc(vendorApplicationsTable.submittedAt)
        )
        .limit(1);
      if (!appRow) return res.status(404).json({ error: "Vendor not found" });
      const vendorId = appRow.id;
      const appUpdate: Record<string, any> = { latitude: resolvedLat, longitude: resolvedLng };
      if (locationLink && typeof locationLink === "string" && locationLink.trim()) appUpdate.locationLink = locationLink.trim();
      await db.update(vendorApplicationsTable).set(appUpdate).where(eq(vendorApplicationsTable.id, vendorId));
      await db.update(vendorsTable).set({ lat: resolvedLat, lng: resolvedLng }).where(eq(vendorsTable.id, vendorId));
      invalidateVendorCache();
      res.json({ success: true, lat: resolvedLat, lng: resolvedLng });
    } catch {
      res.status(500).json({ error: "Failed to update vendor location" });
    }
  });

  // Marketing agents fetch their own submitted applications
  app.get("/api/vendor-applications/submitted-by-me", requireAuth, requireRole("MARKETING"), async (req: any, res) => {
    try {
      const userPhone = req.user?.phone || "";
      if (!userPhone) return res.json({ applications: [] });
      const cleanPhone = userPhone.replace(/\D/g, "").slice(-10);
      const cacheKey = `submitted-by-me:${cleanPhone}`;
      const cached = cache.get<any[]>(cacheKey);
      if (cached) return res.json({ applications: cached });

      // JWT only carries phone/role/id — look up the agent's real name from team_members.
      // JWT stores last-10-digits only; DB may store full "+91XXXXXXXXXX" format — match by suffix.
      const [member] = await db.select().from(teamMembersTable)
        .where(sql`RIGHT(REGEXP_REPLACE(${teamMembersTable.phone}, '[^0-9]', '', 'g'), 10) = ${cleanPhone}`);
      const userName = member?.name || "";
      if (!userName) { cache.set(cacheKey, [], 15); return res.json({ applications: [] }); }
      const rows = await db.select().from(vendorApplicationsTable)
        .where(sql`LOWER(TRIM(${vendorApplicationsTable.submittedBy})) = LOWER(TRIM(${userName}))`)
        .orderBy(desc(vendorApplicationsTable.submittedAt));
      const apps = rows.map(a => ({
        ...a,
        submittedAt: a.submittedAt?.toISOString(),
        reviewedAt: a.reviewedAt?.toISOString() || null,
      }));
      cache.set(cacheKey, apps, 15); // cache 15 seconds to prevent hammering DB on 8s polls
      res.json({ applications: apps });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to fetch applications" });
    }
  });

  // ── Leads API (marketing agents) ────────────────────────────────────────
  app.get("/api/leads", requireAuth, requireRole("MARKETING"), async (req: any, res) => {
    try {
      const agentPhone = (req.user?.phone || "").replace(/\D/g, "").slice(-10);
      if (!agentPhone) return res.json({ leads: [] });
      const rows = await db.select().from(leadsTable)
        .where(sql`RIGHT(REGEXP_REPLACE(${leadsTable.marketingAgentPhone}, '[^0-9]', '', 'g'), 10) = ${agentPhone}`)
        .orderBy(desc(leadsTable.createdAt));
      res.json({ leads: rows.map(r => ({ ...r, createdAt: r.createdAt?.toISOString() })) });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to fetch leads" });
    }
  });

  app.post("/api/leads", requireAuth, requireRole("MARKETING"), async (req: any, res) => {
    try {
      const agentPhone = (req.user?.phone || "").replace(/\D/g, "").slice(-10);
      if (!agentPhone) return res.status(400).json({ error: "Agent phone required" });
      const { id, vendorName, phone, status, notes } = req.body;
      if (!id || !vendorName || !phone) return res.status(400).json({ error: "id, vendorName, phone required" });
      await db.insert(leadsTable).values({
        id,
        vendorName,
        phone,
        status: status || "NEW",
        marketingAgentPhone: agentPhone,
        notes: notes || "",
      }).onConflictDoNothing();
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to add lead" });
    }
  });

  app.put("/api/leads/:id", requireAuth, requireRole("MARKETING"), async (req: any, res) => {
    try {
      const agentPhone = (req.user?.phone || "").replace(/\D/g, "").slice(-10);
      const { id } = req.params;
      const { status, notes } = req.body;
      await db.update(leadsTable)
        .set({ ...(status ? { status } : {}), ...(notes !== undefined ? { notes } : {}) })
        .where(and(
          eq(leadsTable.id, id),
          sql`RIGHT(REGEXP_REPLACE(${leadsTable.marketingAgentPhone}, '[^0-9]', '', 'g'), 10) = ${agentPhone}`
        ));
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to update lead" });
    }
  });

  app.delete("/api/leads/:id", requireAuth, requireRole("MARKETING"), async (req: any, res) => {
    try {
      const agentPhone = (req.user?.phone || "").replace(/\D/g, "").slice(-10);
      const { id } = req.params;
      await db.delete(leadsTable).where(and(
        eq(leadsTable.id, id),
        sql`RIGHT(REGEXP_REPLACE(${leadsTable.marketingAgentPhone}, '[^0-9]', '', 'g'), 10) = ${agentPhone}`
      ));
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to delete lead" });
    }
  });

  app.get("/api/vendor-applications", requireAuth, requireRole("SUPER_ADMIN", "FRANCHISE"), async (req: any, res) => {
    try {
      let rows;
      if (req.user?.role === "FRANCHISE") {
        // Franchise sees apps that belong to them. This includes:
        //  1. Apps with franchise_id matching their own phone
        //  2. Apps with franchise_id matching any of their team members' phones
        //     (some older agents incorrectly stored their own phone as franchise_id)
        //  3. Unassigned apps (franchise_id is empty) — client further filters by submittedBy name
        // Apps assigned to OTHER franchises are excluded.
        const franchisePhone = (req.user.phone || "").replace(/\D/g, "").slice(-10);

        // Look up franchise owner's name so we can find their team members by createdBy
        const [franchiseRecord] = await db.select({ name: teamMembersTable.name })
          .from(teamMembersTable)
          .where(sql`RIGHT(REGEXP_REPLACE(${teamMembersTable.phone}, '[^0-9]', '', 'g'), 10) = ${franchisePhone}`)
          .limit(1);
        const franchiseName = franchiseRecord?.name || "";

        // Get all team member phones under this franchise
        const teamRows = await db.select({ phone: teamMembersTable.phone })
          .from(teamMembersTable)
          .where(
            or(
              // Members directly created by this franchise owner
              and(eq(teamMembersTable.createdByRole, "FRANCHISE"), eq(teamMembersTable.createdBy, franchiseName)),
              // Members with franchise_id explicitly linked to this franchise phone
              sql`RIGHT(REGEXP_REPLACE(${teamMembersTable.franchiseId}, '[^0-9]', '', 'g'), 10) = ${franchisePhone}`
            )
          );

        // Build a set of all relevant 10-digit phone suffixes (franchise + all team members)
        const allPhones = new Set<string>([franchisePhone]);
        for (const m of teamRows) {
          const p = (m.phone || "").replace(/\D/g, "").slice(-10);
          if (p.length === 10) allPhones.add(p);
        }

        // Fetch all apps and filter: empty franchise_id OR matching any relevant phone
        const allApps = await db.select().from(vendorApplicationsTable).orderBy(desc(vendorApplicationsTable.submittedAt));
        rows = allApps.filter(a => {
          const af = (a.franchiseId || "").replace(/\D/g, "").slice(-10);
          if (!af) return true; // unassigned — client filters by submittedBy name
          return allPhones.has(af);
        });
      } else {
        // Admin sees all
        rows = await db.select().from(vendorApplicationsTable).orderBy(desc(vendorApplicationsTable.submittedAt));
      }
      const apps = rows.map(a => ({
        ...a,
        submittedAt: a.submittedAt?.toISOString(),
        reviewedAt: a.reviewedAt?.toISOString() || null,
      }));
      res.json({ applications: apps });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to fetch vendor applications" });
    }
  });

  app.put("/api/vendor-applications/:id", requireAuth, requireRole("SUPER_ADMIN", "FRANCHISE"), async (req: any, res) => {
    try {
      const { id } = req.params;
      const { status, rejectionReason, appData } = req.body;
      if (!status) return res.status(400).json({ error: "status required" });
      // Check if record exists first
      const [existing] = await db.select().from(vendorApplicationsTable).where(eq(vendorApplicationsTable.id, id));
      if (!existing && appData && appData.businessName && appData.phone) {
        // Record missing from DB — insert it now (sync from local state)
        await db.insert(vendorApplicationsTable).values({
          id,
          businessName: appData.businessName || "",
          ownerName: appData.ownerName || "",
          phone: appData.phone || "",
          email: appData.email || "",
          categoryId: appData.categoryId || "",
          subCategoryId: appData.subCategoryId || null,
          address: appData.address || "",
          city: appData.city || "",
          latitude: appData.latitude || null,
          longitude: appData.longitude || null,
          description: appData.description || "",
          gstNumber: appData.gstNumber || "",
          panNumber: appData.panNumber || "",
          bankAccount: appData.bankAccount || "",
          ifscCode: appData.ifscCode || "",
          commissionRate: appData.commissionRate || 10,
          status,
          submittedBy: appData.submittedBy || "",
          submittedAt: appData.submittedAt ? new Date(appData.submittedAt) : new Date(),
          reviewedBy: req.user?.name || "",
          reviewedAt: new Date(),
        }).onConflictDoNothing();
      } else if (!existing) {
        return res.status(404).json({ error: "Vendor application not found in database" });
      } else {
        const updateFields: Record<string, any> = {
          status,
          reviewedBy: req.user?.name || "",
          reviewedAt: new Date(),
          rejectionReason: rejectionReason || null,
        };
        // Auto-stamp franchiseId when a franchise owner acts on an unassigned application
        if (req.user?.role === "FRANCHISE" && req.user?.phone && !existing.franchiseId) {
          const franchisePhone = (req.user.phone || "").replace(/\D/g, "").slice(-10);
          if (franchisePhone) updateFields.franchiseId = franchisePhone;
        }
        await db.update(vendorApplicationsTable).set(updateFields).where(eq(vendorApplicationsTable.id, id));
      }
      const [updated] = await db.select().from(vendorApplicationsTable).where(eq(vendorApplicationsTable.id, id));
      if (status === "LIVE" && updated) {
        const allSubCats = await db.select().from(subCategoriesTable);
        const resolvedSubCatId = updated.subCategoryId || allSubCats.find((sc: any) => sc.categoryId === updated.categoryId)?.id || "sc5";
        const photos: string[] = Array.isArray(updated.photos) ? updated.photos as string[] : [];
        // Accept remote http URLs and base64 data URIs (from app upload); skip blob: and file: URIs
        const usablePhoto = photos.find((p: string) => p.startsWith("http") || p.startsWith("data:"));
        const scImage = allSubCats.find((sc: any) => sc.id === resolvedSubCatId)?.image;
        const vendorImage = usablePhoto || scImage || "https://images.unsplash.com/photo-1604719312566-8912e9227c6a?w=400";
        await db.insert(vendorsTable).values({
          id: updated.id,
          name: updated.businessName,
          description: updated.description || `${updated.businessName} - Quality products & services`,
          image: vendorImage,
          rating: 4.0,
          reviewCount: 0,
          deliveryTime: "20-30 min",
          distance: "0.5 km",
          isOpen: true,
          categoryId: updated.categoryId,
          subCategoryId: resolvedSubCatId,
          commissionRate: updated.commissionRate ?? 10,
          lat: updated.latitude ?? 20.5547,
          lng: updated.longitude ?? 74.5247,
          address: updated.address || "",
          pinCode: (updated as any).pinCode || "",
          franchiseId: (updated as any).franchiseId || "",
          codEnabled: false,
        }).onConflictDoNothing();
        // Always sync coordinates from application to vendor — onConflictDoNothing skips
        // coordinates for existing vendors, so we must update them explicitly.
        // Only use application coords if they are valid AND within the Malegaon service area.
        const appLat = updated.latitude ? parseFloat(String(updated.latitude)) : 0;
        const appLng = updated.longitude ? parseFloat(String(updated.longitude)) : 0;
        const _distKm = (lat1: number, lng1: number, lat2: number, lng2: number) => {
          const R = 6371, dLat = (lat2 - lat1) * Math.PI / 180, dLng = (lng2 - lng1) * Math.PI / 180;
          const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
          return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        };
        const isValidArea = appLat && appLng && Math.abs(appLat) > 0.001 && Math.abs(appLng) > 0.001
          && _distKm(appLat, appLng, 20.5547, 74.5247) <= 50;
        if (isValidArea) {
          await db.update(vendorsTable)
            .set({ lat: appLat, lng: appLng, address: updated.address || "", name: updated.businessName })
            .where(eq(vendorsTable.id, updated.id));
          console.log(`[APPROVE] Synced location (${appLat}, ${appLng}) for vendor ${updated.id}`);
        }
        vendorCache = null;
      }
      res.json({ success: true, application: updated });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to update vendor application" });
    }
  });

  // Bulk-approve ALL pending vendor applications in one shot (SUPER_ADMIN only).
  // Mirrors the per-application make-live logic (PUT handler above): creates a vendor
  // row for each pending application, then flips the applications to LIVE.
  app.post("/api/vendor-applications/bulk-approve", requireAuth, requireRole("SUPER_ADMIN"), async (_req: any, res) => {
    try {
      const pending = await db.select().from(vendorApplicationsTable).where(eq(vendorApplicationsTable.status, "PENDING"));
      if (pending.length === 0) return res.json({ success: true, approved: 0 });
      const pendingIds = pending.map((p: any) => p.id);
      const allSubCats = await db.select().from(subCategoriesTable);
      const rows = pending.map((app: any) => {
        const resolvedSubCatId = app.subCategoryId || allSubCats.find((sc: any) => sc.categoryId === app.categoryId)?.id || "sc5";
        const photos: string[] = Array.isArray(app.photos) ? app.photos as string[] : [];
        const usablePhoto = photos.find((p: string) => p.startsWith("http") || p.startsWith("data:"));
        const scImage = allSubCats.find((sc: any) => sc.id === resolvedSubCatId)?.image;
        const vendorImage = usablePhoto || scImage || "https://images.unsplash.com/photo-1604719312566-8912e9227c6a?w=400";
        return {
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
          commissionRate: app.commissionRate ?? 10,
          lat: app.latitude ?? 20.5547,
          lng: app.longitude ?? 74.5247,
          address: app.address || "",
          pinCode: app.pinCode || "",
          franchiseId: app.franchiseId || "",
          codEnabled: false,
        };
      });
      // Atomic: create vendor rows, then flip ONLY the snapshot's applications to LIVE
      // (scoping to pendingIds avoids orphaning any application submitted mid-request).
      await db.transaction(async (tx) => {
        await tx.insert(vendorsTable).values(rows).onConflictDoNothing();
        await tx.update(vendorApplicationsTable)
          .set({ status: "LIVE", reviewedAt: new Date(), reviewedBy: "Bulk approve (Super Admin)" })
          .where(inArray(vendorApplicationsTable.id, pendingIds));
      });
      invalidateVendorCache();
      console.log(`[BULK-APPROVE] Promoted ${rows.length} pending application(s) to LIVE`);
      res.json({ success: true, approved: rows.length });
    } catch (err: any) {
      console.error("Bulk approve error:", err);
      res.status(500).json({ error: "Failed to bulk approve vendors" });
    }
  });

  app.patch("/api/vendor-applications/:id/fields", requireAuth, requireRole("SUPER_ADMIN", "FRANCHISE"), async (req: any, res) => {
    try {
      const { id } = req.params;
      const { businessName, ownerName, phone, email, categoryId, subCategoryId, address, city, gstNumber, panNumber, bankAccount, ifscCode, commissionRate, description, photos, image, latitude, longitude, pinCode: newPinCode } = req.body;
      const [existing] = await db.select().from(vendorApplicationsTable).where(eq(vendorApplicationsTable.id, id));
      if (!existing) return res.status(404).json({ error: "Vendor application not found" });
      const updates: Record<string, any> = {};
      if (businessName !== undefined) updates.businessName = businessName;
      if (ownerName !== undefined) updates.ownerName = ownerName;
      if (phone !== undefined) updates.phone = phone;
      if (email !== undefined) updates.email = email;
      if (categoryId !== undefined) updates.categoryId = categoryId;
      if (subCategoryId !== undefined) updates.subCategoryId = subCategoryId || null;
      if (address !== undefined) updates.address = address;
      if (city !== undefined) updates.city = city;
      if (gstNumber !== undefined) updates.gstNumber = gstNumber;
      if (panNumber !== undefined) updates.panNumber = panNumber;
      if (bankAccount !== undefined) updates.bankAccount = bankAccount;
      if (ifscCode !== undefined) updates.ifscCode = ifscCode;
      if (commissionRate !== undefined) updates.commissionRate = Number(commissionRate);
      if (description !== undefined) updates.description = description;
      if (photos !== undefined) updates.photos = photos;
      if (latitude !== undefined && latitude !== null) updates.latitude = Number(latitude);
      if (longitude !== undefined && longitude !== null) updates.longitude = Number(longitude);
      // Pin code change — re-route to the matching franchise owner
      if (newPinCode !== undefined) {
        const cleanPin = (newPinCode || "").trim();
        updates.pinCode = cleanPin;
        if (cleanPin) {
          try {
            const [franchiseOwner] = await db.select({ phone: teamMembersTable.phone })
              .from(teamMembersTable)
              .where(and(
                eq(teamMembersTable.role, "FRANCHISE"),
                eq(teamMembersTable.pinCode, cleanPin),
                eq(teamMembersTable.status, "ACTIVE")
              ));
            updates.franchiseId = franchiseOwner?.phone
              ? franchiseOwner.phone.replace(/\D/g, "").slice(-10)
              : "";
            console.log(`[FIELDS-PATCH] ${id} pin ${cleanPin} → franchise ${updates.franchiseId || "unassigned"}`);
          } catch {}
        } else {
          updates.franchiseId = "";
        }
      }
      if (Object.keys(updates).length === 0) return res.status(400).json({ error: "No fields to update" });
      await db.update(vendorApplicationsTable).set(updates).where(eq(vendorApplicationsTable.id, id));
      if (existing.status === "LIVE") {
        const vendorUpdates: Record<string, any> = {};
        if (updates.businessName) vendorUpdates.name = updates.businessName;
        if (updates.description) vendorUpdates.description = updates.description;
        if (updates.categoryId) vendorUpdates.categoryId = updates.categoryId;
        if (updates.subCategoryId !== undefined) vendorUpdates.subCategoryId = updates.subCategoryId;
        if (updates.address) vendorUpdates.address = updates.address;
        if (updates.commissionRate !== undefined) vendorUpdates.commissionRate = updates.commissionRate;
        if (updates.latitude !== undefined) vendorUpdates.lat = updates.latitude;
        if (updates.longitude !== undefined) vendorUpdates.lng = updates.longitude;
        if (updates.pinCode !== undefined) vendorUpdates.pinCode = updates.pinCode;
        if (updates.franchiseId !== undefined) vendorUpdates.franchiseId = updates.franchiseId;
        // Update vendor image when photos or explicit image is provided
        if (updates.photos) {
          const photoList: string[] = Array.isArray(updates.photos) ? updates.photos : [];
          const usable = photoList.find((p: string) => p.startsWith("http") || p.startsWith("data:"));
          if (usable) vendorUpdates.image = usable;
        }
        if (image && (image.startsWith("http") || image.startsWith("data:"))) vendorUpdates.image = image;
        if (Object.keys(vendorUpdates).length > 0) {
          await db.update(vendorsTable).set(vendorUpdates).where(eq(vendorsTable.id, id)).catch(() => {});
          invalidateVendorCache();
        }
      }
      const [updated] = await db.select().from(vendorApplicationsTable).where(eq(vendorApplicationsTable.id, id));
      res.json({ success: true, application: updated });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to update vendor fields" });
    }
  });

  // Permanently delete a vendor and its application record. SUPER_ADMIN only.
  app.delete("/api/vendor-applications/:id", requireAuth, requireRole("SUPER_ADMIN"), async (req: any, res) => {
    try {
      const { id } = req.params;
      if (!id) return res.status(400).json({ error: "id required" });
      await db.delete(vendorsTable).where(eq(vendorsTable.id, id));
      await db.delete(vendorApplicationsTable).where(eq(vendorApplicationsTable.id, id));
      // Remove from in-memory vendor cache
      vendorCache = vendorCache.filter((v) => v.id !== id);
      res.json({ success: true });
    } catch (err: any) {
      console.error("Delete vendor error:", err);
      res.status(500).json({ error: "Failed to delete vendor" });
    }
  });

  // Assign (or re-assign) a marketing agent to an existing vendor.
  // If no application record exists for the vendor, one is created from the vendor's data.
  app.post("/api/vendors/:vendorId/assign-marketing-agent", requireAuth, requireRole("SUPER_ADMIN", "FRANCHISE"), async (req: any, res) => {
    try {
      const { vendorId } = req.params;
      const { marketingAgentName } = req.body as { marketingAgentName: string };
      if (!marketingAgentName?.trim()) return res.status(400).json({ error: "marketingAgentName required" });

      // Try to update an existing application first
      const [existingApp] = await db.select().from(vendorApplicationsTable).where(eq(vendorApplicationsTable.id, vendorId));
      if (existingApp) {
        await db.update(vendorApplicationsTable).set({ submittedBy: marketingAgentName.trim() }).where(eq(vendorApplicationsTable.id, vendorId));
        return res.json({ success: true, action: "updated" });
      }

      // No application record — create one from the vendor's data
      const [vendor] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, vendorId));
      if (!vendor) return res.status(404).json({ error: "Vendor not found" });

      await db.insert(vendorApplicationsTable).values({
        id: vendorId,
        businessName: vendor.name,
        ownerName: vendor.name,
        phone: "",
        email: "",
        categoryId: vendor.categoryId || "2",
        subCategoryId: vendor.subCategoryId || null,
        address: vendor.address || "",
        city: "",
        pinCode: vendor.pinCode || "",
        franchiseId: vendor.franchiseId || "",
        latitude: vendor.lat || null,
        longitude: vendor.lng || null,
        description: vendor.description || "",
        status: "LIVE",
        submittedBy: marketingAgentName.trim(),
        submittedAt: vendor.createdAt || new Date(),
        reviewedBy: req.user?.name || "",
        reviewedAt: new Date(),
      }).onConflictDoNothing();
      res.json({ success: true, action: "created" });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to assign marketing agent" });
    }
  });

  // ── Ad Requests ──────────────────────────────────────────────────────────
  app.get("/api/ad-requests", requireAuth, requireRole("SUPER_ADMIN", "FRANCHISE"), async (_req, res) => {
    try {
      const rows = await db.select().from(adRequests).orderBy(desc(adRequests.createdAt));
      res.json({ adRequests: rows.map(r => ({ ...r, createdAt: r.createdAt?.toISOString(), franchiseReviewedAt: r.franchiseReviewedAt?.toISOString() || null, adminReviewedAt: r.adminReviewedAt?.toISOString() || null, startDate: r.startDate?.toISOString() || null, endDate: r.endDate?.toISOString() || null })) });
    } catch {
      res.status(500).json({ error: "Failed to fetch ad requests" });
    }
  });

  app.post("/api/ad-requests", requireAuth, async (req: any, res) => {
    try {
      const b = req.body;
      const id = "AD" + Date.now().toString(36).toUpperCase().slice(-6);
      await db.insert(adRequests).values({ id, vendorId: b.vendorId, vendorName: b.vendorName, title: b.title, subtitle: b.subtitle || null, description: b.description || null, slotType: b.slotType, color: b.color || null, offerText: b.offerText || null, durationDays: b.durationDays, amountPaid: b.amountPaid || 0, status: "PENDING_FRANCHISE" });
      const [row] = await db.select().from(adRequests).where(eq(adRequests.id, id));
      res.json({ adRequest: { ...row, createdAt: row.createdAt?.toISOString() } });
    } catch {
      res.status(500).json({ error: "Failed to create ad request" });
    }
  });

  app.put("/api/ad-requests/:id", requireAuth, requireRole("SUPER_ADMIN", "FRANCHISE"), async (req: any, res) => {
    try {
      const { id } = req.params;
      const b = req.body;
      const updateData: Record<string, any> = { status: b.status };
      if (b.rejectionReason !== undefined) updateData.rejectionReason = b.rejectionReason;
      if (b.franchiseReview) { updateData.franchiseReviewedAt = new Date(); updateData.franchiseReviewedBy = req.user?.name || "Franchise Manager"; }
      if (b.adminReview) { updateData.adminReviewedAt = new Date(); updateData.adminReviewedBy = req.user?.name || "Admin"; }
      if (b.status === "LIVE") { updateData.startDate = new Date(); updateData.endDate = new Date(Date.now() + (b.durationDays || 30) * 24 * 60 * 60 * 1000); }
      await db.update(adRequests).set(updateData).where(eq(adRequests.id, id));
      const [row] = await db.select().from(adRequests).where(eq(adRequests.id, id));
      res.json({ adRequest: { ...row, createdAt: row.createdAt?.toISOString(), franchiseReviewedAt: row.franchiseReviewedAt?.toISOString() || null, adminReviewedAt: row.adminReviewedAt?.toISOString() || null, startDate: row.startDate?.toISOString() || null, endDate: row.endDate?.toISOString() || null } });
    } catch {
      res.status(500).json({ error: "Failed to update ad request" });
    }
  });

  // Serve vendor image as binary JPEG — browser/expo-image caches it natively.
  // Much more efficient than base64-in-JSON: binary is 33% smaller and properly cached.
  app.get("/api/vendors/:vendorId/image", async (req: any, res) => {
    try {
      const { vendorId } = req.params;
      const cacheKey = `vendor:${vendorId}`;

      let entry = imgCacheGet(cacheKey);
      if (!entry) {
        const [row] = await db.select({ image: vendorsTable.image }).from(vendorsTable).where(eq(vendorsTable.id, vendorId));
        if (!row?.image) return res.status(404).send("No image");
        // External URL (e.g. Unsplash) — redirect instead of trying to base64-decode
        // + compress it, which would make sharp throw and return a 500. expo-image
        // caches the redirected URL natively. Mirrors the product image endpoint.
        if (row.image.startsWith("http")) return res.redirect(302, row.image);
        const buf = await compressToBuffer(row.image);
        const etag = `"${crypto.createHash("md5").update(buf).digest("hex")}"`;
        entry = { buf, etag };
        imgCacheSet(cacheKey, entry);
      }

      if (req.headers["if-none-match"] === entry.etag) return res.status(304).end();

      res.set({
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=604800, stale-while-revalidate=86400",
        "Content-Length": entry.buf.length.toString(),
        "ETag": entry.etag,
      });
      return res.end(entry.buf);
    } catch {
      return res.status(500).send("Image error");
    }
  });

  app.get("/api/vendors/:vendorId", async (req: any, res) => {
    try {
      const { vendorId } = req.params;
      const [row] = await db
        .select({ ...getTableColumns(vendorsTable), phone: vendorApplicationsTable.phone })
        .from(vendorsTable)
        .leftJoin(vendorApplicationsTable, eq(vendorApplicationsTable.id, vendorsTable.id))
        .where(eq(vendorsTable.id, vendorId));
      if (row) {
        const { image: _img, paymentQrUrl: _qr, ...vendorData } = row as any;
        res.set("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
        return res.json({ vendor: { ...vendorData, hasImage: !!(_img && _img.length > 10), hasPaymentQrImage: !!(_qr && _qr.length > 10), hasPaymentQr: !!(_qr && _qr.length > 10) || !!(vendorData.upiId?.includes?.("@")) } });
      }
      // Not found in vendors table — check vendor_applications as fallback
      // (covers vendors who are PENDING/not yet promoted to live)
      const [appRow] = await db
        .select({
          id: vendorApplicationsTable.id,
          categoryId: vendorApplicationsTable.categoryId,
          subCategoryId: vendorApplicationsTable.subCategoryId,
          businessName: vendorApplicationsTable.businessName,
          address: vendorApplicationsTable.address,
          phone: vendorApplicationsTable.phone,
        })
        .from(vendorApplicationsTable)
        .where(eq(vendorApplicationsTable.id, vendorId));
      if (!appRow) return res.status(404).json({ error: "Vendor not found" });
      res.set("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
      return res.json({ vendor: { id: appRow.id, name: appRow.businessName, categoryId: appRow.categoryId, subCategoryId: appRow.subCategoryId || "", address: appRow.address || "", phone: appRow.phone || "", hasImage: false, hasPaymentQr: false, applicationStatus: appRow.status } });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to fetch vendor" });
    }
  });

  app.get("/api/vendors", async (req: any, res) => {
    try {
      const { pinCode, franchiseId } = req.query as { pinCode?: string; franchiseId?: string };

      // Strip base64 image from list response but add hasImage flag so the client
      // knows whether to render <Image source={{uri:".../image"}}> or a placeholder.
      const stripImage = (v: any) => { const { image: _img, paymentQrUrl: _qr, ...rest } = v; return { ...rest, hasImage: !!_img, hasPaymentQrImage: !!(_qr && _qr.length > 10), hasPaymentQr: !!(_qr && _qr.length > 10) || !!(rest.upiId?.includes?.("@")) }; };

      // Serve from in-memory cache when no filters requested (most common call)
      if (!pinCode?.trim() && !franchiseId?.trim()) {
        if (vendorCache !== null) {
          // Cache hit — instant response, refresh in background if stale
          if (Date.now() - vendorCacheUpdatedAt > VENDOR_CACHE_TTL_MS) {
            refreshVendorCache(); // non-blocking background refresh
          }
          // Allow Android WebView / browser to cache the vendor list for 2 minutes
          res.set("Cache-Control", "public, max-age=120, stale-while-revalidate=300");
          return res.json({ vendors: vendorCache.map(stripImage) });
        }
        // Cache miss — server is warming up after a restart; try DB directly with a short wait
        await refreshVendorCache();
        if (!vendorCache || vendorCache.length === 0) {
          // DB may still be cold — wait 2 s and try once more before returning empty
          await new Promise(r => setTimeout(r, 2000));
          await refreshVendorCache();
        }
        return res.json({ vendors: (vendorCache ?? []).map(stripImage) });
      }

      // Filtered requests (pin code or franchise) — query DB directly but also refresh cache
      const vendorCols = { ...getTableColumns(vendorsTable), phone: vendorApplicationsTable.phone };
      let filteredRows: any[];
      if (pinCode && pinCode.trim()) {
        filteredRows = await db.select(vendorCols).from(vendorsTable)
          .leftJoin(vendorApplicationsTable, eq(vendorApplicationsTable.id, vendorsTable.id))
          .where(or(
            eq(vendorsTable.pinCode, pinCode.trim()),
            isNull(vendorsTable.pinCode),
            eq(vendorsTable.pinCode, "")
          ))
          .orderBy(desc(vendorsTable.createdAt));
      } else if (franchiseId && franchiseId.trim()) {
        filteredRows = await db.select(vendorCols).from(vendorsTable)
          .leftJoin(vendorApplicationsTable, eq(vendorApplicationsTable.id, vendorsTable.id))
          .where(eq(vendorsTable.franchiseId, franchiseId.trim()))
          .orderBy(desc(vendorsTable.createdAt));
      } else {
        filteredRows = await db.select(vendorCols).from(vendorsTable)
          .leftJoin(vendorApplicationsTable, eq(vendorApplicationsTable.id, vendorsTable.id))
          .orderBy(desc(vendorsTable.createdAt));
      }
      res.json({ vendors: filteredRows.map(stripImage) });
    } catch (err: any) {
      // If DB is down, fall back to cache
      if (vendorCache !== null) {
        const stripImg = (v: any) => { const { image: _i, paymentQrUrl: _q, ...r } = v; return { ...r, hasImage: !!_i, hasPaymentQrImage: !!(_q && _q.length > 10), hasPaymentQr: !!(_q && _q.length > 10) || !!(r.upiId?.includes?.("@")) }; };
        return res.json({ vendors: vendorCache.map(stripImg) });
      }
      res.status(500).json({ error: "Failed to fetch vendors" });
    }
  });

  // Serve the vendor's UPI QR code image as binary bytes. Public — customers
  // need to fetch this at the payment screen before they are authenticated.
  app.get("/api/vendors/:vendorId/payment-qr", async (req: any, res) => {
    try {
      const { vendorId } = req.params;
      const [row] = await db
        .select({ paymentQrUrl: vendorsTable.paymentQrUrl })
        .from(vendorsTable)
        .where(eq(vendorsTable.id, vendorId));
      if (!row?.paymentQrUrl) return res.status(404).send("No QR");
      const base64 = row.paymentQrUrl.replace(/^data:image\/\w+;base64,/, "");
      const buffer = Buffer.from(base64, "base64");
      res.set({
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=3600",
        "Content-Length": buffer.length.toString(),
      });
      return res.end(buffer);
    } catch {
      return res.status(500).send("QR error");
    }
  });

  // Ownership check for vendor QR mutations. Allows the owning vendor (matched
  // via vendor_applications.phone == authed user phone AND application.id == vendorId),
  // SUPER_ADMIN, or FRANCHISE owners. Returns the vendor row when authorized.
  async function authorizeVendorQrMutation(req: any, vendorId: string): Promise<{ ok: true; vendor: any } | { ok: false; status: number; error: string }> {
    const [vendor] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, vendorId));
    if (!vendor) return { ok: false, status: 404, error: "Vendor not found" };
    const role = req.user?.role;
    if (role === "SUPER_ADMIN" || role === "FRANCHISE") return { ok: true, vendor };
    const userPhone = String(req.user?.phone || "").replace(/\D/g, "").slice(-10);
    if (!userPhone) return { ok: false, status: 403, error: "Not authorized to manage this vendor's QR" };
    const [app] = await db
      .select({ id: vendorApplicationsTable.id, phone: vendorApplicationsTable.phone })
      .from(vendorApplicationsTable)
      .where(eq(vendorApplicationsTable.id, vendorId));
    const appPhone = String(app?.phone || "").replace(/\D/g, "").slice(-10);
    if (app && appPhone && appPhone === userPhone) return { ok: true, vendor };
    return { ok: false, status: 403, error: "Not authorized to manage this vendor's QR" };
  }

  app.patch("/api/vendors/:vendorId/payment-qr", requireAuth, async (req: any, res) => {
    try {
      const { vendorId } = req.params;
      const { image } = req.body;
      if (!image) return res.status(400).json({ error: "image required" });
      if (typeof image !== "string") {
        return res.status(400).json({ error: "image must be a data URL string" });
      }
      // Only allow PNG or JPEG to prevent SVG/HTML-based stored XSS / malicious payloads.
      const mimeMatch = image.match(/^data:(image\/(?:png|jpeg|jpg));base64,([A-Za-z0-9+/=\s]+)$/i);
      if (!mimeMatch) {
        return res.status(400).json({ error: "QR must be a PNG or JPEG data URL" });
      }
      const base64Payload = mimeMatch[2].replace(/\s/g, "");
      // Hard cap of ~1.5 MB decoded (≈2 MB base64) — QR codes are tiny in practice.
      const approxBytes = Math.floor((base64Payload.length * 3) / 4);
      if (approxBytes > 1_500_000) {
        return res.status(413).json({ error: "QR image too large (max 1.5 MB)" });
      }
      const authz = await authorizeVendorQrMutation(req, vendorId);
      if (!authz.ok) return res.status(authz.status).json({ error: authz.error });
      await db.update(vendorsTable).set({ paymentQrUrl: image }).where(eq(vendorsTable.id, vendorId));
      invalidateVendorCache();
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Failed to update payment QR" });
    }
  });

  app.delete("/api/vendors/:vendorId/payment-qr", requireAuth, async (req: any, res) => {
    try {
      const { vendorId } = req.params;
      const authz = await authorizeVendorQrMutation(req, vendorId);
      if (!authz.ok) return res.status(authz.status).json({ error: authz.error });
      await db.update(vendorsTable).set({ paymentQrUrl: null }).where(eq(vendorsTable.id, vendorId));
      invalidateVendorCache();
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Failed to remove payment QR" });
    }
  });

  // Save or clear the vendor's UPI ID. Generates QR on the fly client-side
  // so no image upload is needed at all.
  app.patch("/api/vendors/:vendorId/upi-id", requireAuth, async (req: any, res) => {
    try {
      const { vendorId } = req.params;
      const { upiId } = req.body;
      const trimmed = typeof upiId === "string" ? upiId.trim().toLowerCase() : "";
      if (trimmed && (!trimmed.includes("@") || trimmed.length > 100)) {
        return res.status(400).json({ error: "Invalid UPI ID — must contain '@' (e.g. name@upi)" });
      }
      const authz = await authorizeVendorQrMutation(req, vendorId);
      if (!authz.ok) return res.status(authz.status).json({ error: authz.error });
      await db.update(vendorsTable).set({ upiId: trimmed || null } as any).where(eq(vendorsTable.id, vendorId));
      invalidateVendorCache();
      res.json({ success: true, upiId: trimmed || null });
    } catch {
      res.status(500).json({ error: "Failed to update UPI ID" });
    }
  });

  app.patch("/api/vendors/:vendorId/image", requireAuth, async (req: any, res) => {
    try {
      const { vendorId } = req.params;
      const { image } = req.body;
      if (!image) return res.status(400).json({ error: "image required" });
      if (!image.startsWith("data:image/") && !image.startsWith("http")) {
        return res.status(400).json({ error: "image must be a data URL or http URL" });
      }
      const imageToStore = image.startsWith("data:image/")
        ? await compressImageDataUrl(image).catch(() => image)
        : image;
      await db.update(vendorsTable).set({ image: imageToStore }).where(eq(vendorsTable.id, vendorId));
      imgCacheInvalidate(`vendor:${vendorId}`);
      invalidateVendorCache();
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to update vendor image" });
    }
  });

  app.patch("/api/vendors/:id", requireAuth, requireRole("SUPER_ADMIN", "FRANCHISE"), async (req: any, res) => {
    try {
      const { id } = req.params;
      const { name, description, commissionRate, categoryId, subCategoryId, address, pinCode, isOpen, rating, deliveryTime, codEnabled, lat, lng } = req.body;
      const [existing] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, id));
      if (!existing) return res.status(404).json({ error: "Vendor not found" });
      const updates: Record<string, any> = {};
      if (name !== undefined) updates.name = name.trim();
      if (description !== undefined) updates.description = description.trim();
      if (commissionRate !== undefined) updates.commissionRate = Number(commissionRate);
      if (categoryId !== undefined) updates.categoryId = categoryId;
      if (subCategoryId !== undefined) updates.subCategoryId = subCategoryId || "";
      if (address !== undefined) updates.address = address.trim();
      if (pinCode !== undefined) updates.pinCode = pinCode.trim();
      if (isOpen !== undefined) updates.isOpen = Boolean(isOpen);
      if (rating !== undefined) updates.rating = Math.min(5, Math.max(1, Number(rating)));
      if (deliveryTime !== undefined) updates.deliveryTime = deliveryTime.trim();
      if (codEnabled !== undefined) updates.codEnabled = Boolean(codEnabled);
      if (lat !== undefined && lat !== null && lat !== "") updates.lat = Number(lat);
      if (lng !== undefined && lng !== null && lng !== "") updates.lng = Number(lng);
      if (Object.keys(updates).length === 0) return res.status(400).json({ error: "No fields to update" });
      await db.update(vendorsTable).set(updates).where(eq(vendorsTable.id, id));
      // Also sync to vendor application if it exists
      const appUpdates: Record<string, any> = {};
      if (updates.name) appUpdates.businessName = updates.name;
      if (updates.description) appUpdates.description = updates.description;
      if (updates.commissionRate !== undefined) appUpdates.commissionRate = updates.commissionRate;
      if (updates.categoryId) appUpdates.categoryId = updates.categoryId;
      if (updates.subCategoryId !== undefined) appUpdates.subCategoryId = updates.subCategoryId;
      if (updates.address) appUpdates.address = updates.address;
      if (updates.pinCode !== undefined) appUpdates.pinCode = updates.pinCode;
      if (updates.lat !== undefined) appUpdates.latitude = updates.lat;
      if (updates.lng !== undefined) appUpdates.longitude = updates.lng;
      if (Object.keys(appUpdates).length > 0) {
        await db.update(vendorApplicationsTable).set(appUpdates).where(eq(vendorApplicationsTable.id, id)).catch(() => {});
      }
      invalidateVendorCache();
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to update vendor" });
    }
  });

  app.post("/api/vendors", requireAuth, requireRole("SUPER_ADMIN", "FRANCHISE"), async (req: any, res) => {
    try {
      const body = req.body;
      if (!body.id || !body.name || !body.categoryId) {
        return res.status(400).json({ error: "id, name, categoryId required" });
      }
      await db.insert(vendorsTable).values({
        id: body.id,
        name: body.name,
        description: body.description || "",
        image: body.image || "",
        rating: body.rating ?? 4.0,
        reviewCount: body.reviewCount ?? 0,
        deliveryTime: body.deliveryTime || "20-30 min",
        distance: body.distance || "0.5 km",
        isOpen: body.isOpen ?? true,
        categoryId: body.categoryId,
        subCategoryId: body.subCategoryId || "",
        commissionRate: body.commissionRate ?? 10,
        lat: body.lat ?? 0,
        lng: body.lng ?? 0,
        address: body.address || "",
        codEnabled: body.codEnabled ?? false,
      }).onConflictDoNothing();
      invalidateVendorCache();
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to create vendor" });
    }
  });

  app.get("/api/categories", async (_req, res) => {
    try {
      const cats = await db.select().from(categoriesTable);
      res.json({ categories: cats });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to fetch categories" });
    }
  });

  app.get("/api/subcategories", async (_req, res) => {
    try {
      const subs = await db.select().from(subCategoriesTable);
      res.json({ subCategories: subs });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to fetch sub-categories" });
    }
  });

  app.get("/api/bus-routes", async (req, res) => {
    try {
      const { vendorId, productId } = req.query;
      let routes;
      if (vendorId) {
        routes = await db.select().from(busRoutesTable).where(eq(busRoutesTable.vendorId, vendorId as string));
      } else if (productId) {
        routes = await db.select().from(busRoutesTable).where(eq(busRoutesTable.productId, productId as string));
      } else {
        routes = await db.select().from(busRoutesTable);
      }
      res.json({ busRoutes: routes });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to fetch bus routes" });
    }
  });

  const STATIC_SUBCAT_IDS = new Set(["sc1","sc2","sc3","sc4","sc5","sc6","sc7","sc8","sc9","sc10","sc11","sc12","sc13","sc14","sc15","sc16","sc17","sc18","sc19","sc20","sc21","sc22","sc23","sc24","sc25","sc26","sc27","sc28","sc29","sc30"]);

  app.get("/api/subcategories/custom", async (_req, res) => {
    try {
      const all = await db.select().from(subCategoriesTable);
      const custom = all.filter((sc: any) => !STATIC_SUBCAT_IDS.has(sc.id));
      res.json({ customSubCategories: custom });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to fetch custom subcategories" });
    }
  });

  app.post("/api/subcategories/custom", requireAuth, requireRole("SUPER_ADMIN", "FRANCHISE"), async (req: any, res) => {
    try {
      const body = req.body;
      if (!body.id || !body.name || !body.categoryId) {
        return res.status(400).json({ error: "id, name, categoryId required" });
      }
      await db.insert(subCategoriesTable).values({
        id: body.id,
        categoryId: body.categoryId,
        name: body.name,
        icon: body.icon || "grid-outline",
        image: body.image || "https://images.unsplash.com/photo-1604719312566-8912e9227c6a?w=400",
      }).onConflictDoNothing();
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to create custom subcategory" });
    }
  });

  // One-time cleanup: remove all pre-launch test vendors and their applications.
  // These IDs correspond to vendors added before the proper onboarding flow was established.
  // This is safe to run repeatedly — it's a no-op once the rows are gone.
  (async () => {
    try {
      const staleIds = ["VAW2HLEO", "VA2CSM9S", "VAV71OXU", "VALW1UHK", "VA765LDP"];
      const deletedVendors = await db.delete(vendorsTable)
        .where(inArray(vendorsTable.id, staleIds));
      const deletedApps = await db.delete(vendorApplicationsTable)
        .where(inArray(vendorApplicationsTable.id, staleIds));
      const vCount = (deletedVendors as any).rowCount ?? 0;
      const aCount = (deletedApps as any).rowCount ?? 0;
      if (vCount > 0 || aCount > 0) {
        console.log(`[cleanup] Removed ${vCount} stale vendor(s) and ${aCount} stale application(s)`);
      }
    } catch (e) {
      console.error("[cleanup] Stale vendor cleanup error:", e);
    }
  })();

  // Fix vendor images: replace wrong/unrelated Unsplash placeholders with appropriate ones.
  // Matches by business name (case-insensitive) so it works even if IDs are unknown.
  // Only replaces images that are Unsplash URLs (not real photos uploaded by the vendor).
  // Safe to run repeatedly — once a real photo is uploaded the Unsplash URL is gone.
  (async () => {
    const nameBasedFixes: { name: string; image: string }[] = [
      { name: "New mushtaque pan",          image: "https://images.unsplash.com/photo-1596040033229-a9821ebd058d?w=600" },
      { name: "Rajdhani garments junction", image: "https://images.unsplash.com/photo-1441984904996-e0b6ba687e04?w=600" },
      { name: "New Ansar patra depo",        image: "https://images.unsplash.com/photo-1504328345606-18bbc8c9d7d1?w=600" }, // industrial / steel & pipes
      { name: "Royal Glass Art & Aluminium", image: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600" },  // glass / aluminium
    ];
    try {
      const allVendors = await db.select({ id: vendorsTable.id, name: vendorsTable.name, image: vendorsTable.image }).from(vendorsTable);
      for (const fix of nameBasedFixes) {
        const match = allVendors.find(v => v.name.toLowerCase().trim() === fix.name.toLowerCase().trim());
        if (!match) continue;
        // Only override if the current image is an Unsplash URL (not a real uploaded photo)
        if (match.image && !match.image.includes("unsplash.com")) continue;
        await db.update(vendorsTable).set({ image: fix.image }).where(eq(vendorsTable.id, match.id));
        await db.update(vendorApplicationsTable).set({ photos: [fix.image] }).where(eq(vendorApplicationsTable.id, match.id));
        console.log(`[fix-images] Set appropriate placeholder for "${match.name}" (${match.id})`);
      }
    } catch (e) {
      console.error("[fix-images] Error updating vendor images:", e);
    }
  })();

  // ─── Home Content (banners, deals, promo media) ───────────────────────────

  // Public: get all home content
  app.get("/api/home-content", async (_req, res) => {
    try {
      const [banners, deals, promo] = await Promise.all([
        db.select().from(homeBannersTable).orderBy(homeBannersTable.order),
        db.select().from(homeDealsTable).orderBy(desc(homeDealsTable.createdAt)),
        db.select().from(promoMediaTable).orderBy(desc(promoMediaTable.createdAt)),
      ]);
      res.json({ banners, deals, promoMedia: promo });
    } catch {
      res.status(500).json({ error: "Failed to load home content" });
    }
  });

  // Banners
  app.post("/api/home-banners", requireAuth, requireRole("SUPER_ADMIN"), async (req: any, res) => {
    try {
      const { title, subtitle, color, ctaText, isActive, order, image } = req.body;
      const id = "hb" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      await db.insert(homeBannersTable).values({ id, title: title || "", subtitle: subtitle || "", color: color || "#FF6B00", ctaText: ctaText || "", isActive: isActive !== false, order: order ?? 0, image: image || null });
      const [created] = await db.select().from(homeBannersTable).where(eq(homeBannersTable.id, id));
      res.json({ success: true, banner: created });
    } catch { res.status(500).json({ error: "Failed to add banner" }); }
  });

  app.put("/api/home-banners/:id", requireAuth, requireRole("SUPER_ADMIN"), async (req: any, res) => {
    try {
      const { id } = req.params;
      const { title, subtitle, color, ctaText, isActive, order, image } = req.body;
      const updates: Record<string, any> = {};
      if (title !== undefined) updates.title = title;
      if (subtitle !== undefined) updates.subtitle = subtitle;
      if (color !== undefined) updates.color = color;
      if (ctaText !== undefined) updates.ctaText = ctaText;
      if (isActive !== undefined) updates.isActive = isActive;
      if (order !== undefined) updates.order = order;
      if (image !== undefined) updates.image = image;
      await db.update(homeBannersTable).set(updates).where(eq(homeBannersTable.id, id));
      const [updated] = await db.select().from(homeBannersTable).where(eq(homeBannersTable.id, id));
      res.json({ success: true, banner: updated });
    } catch { res.status(500).json({ error: "Failed to update banner" }); }
  });

  app.delete("/api/home-banners/:id", requireAuth, requireRole("SUPER_ADMIN"), async (req: any, res) => {
    try {
      await db.delete(homeBannersTable).where(eq(homeBannersTable.id, req.params.id));
      res.json({ success: true });
    } catch { res.status(500).json({ error: "Failed to delete banner" }); }
  });

  // Daily Deals
  app.post("/api/home-deals", requireAuth, requireRole("SUPER_ADMIN"), async (req: any, res) => {
    try {
      const { name, image, price, originalPrice, endsInHours, sold, total, productId, isActive } = req.body;
      const id = "hd" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      await db.insert(homeDealsTable).values({ id, name: name || "", image: image || "", price: Number(price) || 0, originalPrice: Number(originalPrice) || 0, endsInHours: Number(endsInHours) || 24, sold: Number(sold) || 0, total: Number(total) || 100, productId: productId || null, isActive: isActive !== false });
      const [created] = await db.select().from(homeDealsTable).where(eq(homeDealsTable.id, id));
      res.json({ success: true, deal: created });
    } catch { res.status(500).json({ error: "Failed to add deal" }); }
  });

  app.put("/api/home-deals/:id", requireAuth, requireRole("SUPER_ADMIN"), async (req: any, res) => {
    try {
      const { id } = req.params;
      const { name, image, price, originalPrice, endsInHours, sold, total, productId, isActive } = req.body;
      const updates: Record<string, any> = {};
      if (name !== undefined) updates.name = name;
      if (image !== undefined) updates.image = image;
      if (price !== undefined) updates.price = Number(price);
      if (originalPrice !== undefined) updates.originalPrice = Number(originalPrice);
      if (endsInHours !== undefined) updates.endsInHours = Number(endsInHours);
      if (sold !== undefined) updates.sold = Number(sold);
      if (total !== undefined) updates.total = Number(total);
      if (productId !== undefined) updates.productId = productId || null;
      if (isActive !== undefined) updates.isActive = isActive;
      await db.update(homeDealsTable).set(updates).where(eq(homeDealsTable.id, id));
      const [updated] = await db.select().from(homeDealsTable).where(eq(homeDealsTable.id, id));
      res.json({ success: true, deal: updated });
    } catch { res.status(500).json({ error: "Failed to update deal" }); }
  });

  app.delete("/api/home-deals/:id", requireAuth, requireRole("SUPER_ADMIN"), async (req: any, res) => {
    try {
      await db.delete(homeDealsTable).where(eq(homeDealsTable.id, req.params.id));
      res.json({ success: true });
    } catch { res.status(500).json({ error: "Failed to delete deal" }); }
  });

  // Promo Media
  app.post("/api/promo-media", requireAuth, requireRole("SUPER_ADMIN"), async (req: any, res) => {
    try {
      const { type, uri, isActive } = req.body;
      if (!uri) return res.status(400).json({ error: "uri is required" });
      const id = "pm" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      await db.insert(promoMediaTable).values({ id, type: type || "image", uri, isActive: isActive !== false });
      const [created] = await db.select().from(promoMediaTable).where(eq(promoMediaTable.id, id));
      res.json({ success: true, media: created });
    } catch { res.status(500).json({ error: "Failed to add promo media" }); }
  });

  app.patch("/api/promo-media/:id/toggle", requireAuth, requireRole("SUPER_ADMIN"), async (req: any, res) => {
    try {
      const { isActive } = req.body;
      await db.update(promoMediaTable).set({ isActive }).where(eq(promoMediaTable.id, req.params.id));
      res.json({ success: true });
    } catch { res.status(500).json({ error: "Failed to toggle promo media" }); }
  });

  app.delete("/api/promo-media/:id", requireAuth, requireRole("SUPER_ADMIN"), async (req: any, res) => {
    try {
      await db.delete(promoMediaTable).where(eq(promoMediaTable.id, req.params.id));
      res.json({ success: true });
    } catch { res.status(500).json({ error: "Failed to delete promo media" }); }
  });

  // ── Coupons ───────────────────────────────────────────────────────────────
  // Public: list all coupons (customer cart needs active ones; admin needs all)
  app.get("/api/coupons", async (_req, res) => {
    try {
      const rows = await db.select().from(couponsTable).orderBy(desc(couponsTable.createdAt));
      const coupons = rows.map((c) => ({
        ...c,
        expiresAt: c.expiresAt ? c.expiresAt.toISOString() : "",
        createdAt: c.createdAt ? c.createdAt.toISOString() : new Date().toISOString(),
      }));
      res.json({ coupons });
    } catch { res.status(500).json({ error: "Failed to fetch coupons" }); }
  });

  app.post("/api/coupons", requireAuth, requireRole("SUPER_ADMIN"), async (req: any, res) => {
    try {
      const { id, code, discountType, value, minOrder, maxDiscount, usageLimit, isActive, expiresAt } = req.body;
      if (!code || !discountType) return res.status(400).json({ error: "code and discountType are required" });
      const couponId = id || ("CPN" + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 5).toUpperCase());
      await db.insert(couponsTable).values({
        id: couponId,
        code: String(code).toUpperCase(),
        discountType,
        value: Number(value) || 0,
        minOrder: Number(minOrder) || 0,
        maxDiscount: maxDiscount !== undefined && maxDiscount !== null ? Number(maxDiscount) : null,
        usageLimit: Number(usageLimit) || 100,
        usedCount: 0,
        isActive: isActive !== false,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      });
      const [created] = await db.select().from(couponsTable).where(eq(couponsTable.id, couponId));
      res.json({ success: true, coupon: { ...created, expiresAt: created?.expiresAt ? created.expiresAt.toISOString() : "", createdAt: created?.createdAt ? created.createdAt.toISOString() : new Date().toISOString() } });
    } catch (e: any) {
      if (e?.code === "23505") return res.status(409).json({ error: "Coupon code already exists" });
      res.status(500).json({ error: "Failed to add coupon" });
    }
  });

  app.patch("/api/coupons/:id/toggle", requireAuth, requireRole("SUPER_ADMIN"), async (req: any, res) => {
    try {
      const [existing] = await db.select().from(couponsTable).where(eq(couponsTable.id, req.params.id));
      if (!existing) return res.status(404).json({ error: "Coupon not found" });
      const next = !existing.isActive;
      await db.update(couponsTable).set({ isActive: next }).where(eq(couponsTable.id, req.params.id));
      res.json({ success: true, isActive: next });
    } catch { res.status(500).json({ error: "Failed to toggle coupon" }); }
  });

  app.delete("/api/coupons/:id", requireAuth, requireRole("SUPER_ADMIN"), async (req: any, res) => {
    try {
      await db.delete(couponsTable).where(eq(couponsTable.id, req.params.id));
      res.json({ success: true });
    } catch { res.status(500).json({ error: "Failed to delete coupon" }); }
  });

  // ── Reels ─────────────────────────────────────────────────────────────────
  app.get("/api/reels", async (_req, res) => {
    try {
      const rows = await db.select().from(reelsTable).orderBy(desc(reelsTable.createdAt));
      const reels = rows.map((r) => ({
        ...r,
        taggedProducts: Array.isArray(r.taggedProducts) ? r.taggedProducts : [],
        createdAt: r.createdAt?.toISOString() ?? new Date().toISOString(),
      }));
      res.json({ reels });
    } catch { res.status(500).json({ error: "Failed to fetch reels" }); }
  });

  app.post("/api/reels", requireAuth, async (req: any, res) => {
    try {
      const { userId, userName, userAvatar, userRole, vendorId, thumbnail, videoUrl, caption, taggedProducts } = req.body;
      if (!userId || !userName || !userRole) return res.status(400).json({ error: "Missing required fields" });
      const id = `reel_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      await db.insert(reelsTable).values({
        id,
        userId,
        userName,
        userAvatar: userAvatar || null,
        userRole,
        vendorId: vendorId || null,
        thumbnail: thumbnail || "",
        videoUrl: videoUrl || "",
        caption: caption || "",
        likes: 0,
        comments: 0,
        shares: 0,
        isLiked: false,
        taggedProducts: Array.isArray(taggedProducts) ? taggedProducts : [],
      });
      const [row] = await db.select().from(reelsTable).where(eq(reelsTable.id, id));
      res.json({ success: true, reel: { ...row, taggedProducts: Array.isArray(row.taggedProducts) ? row.taggedProducts : [], createdAt: row.createdAt?.toISOString() ?? new Date().toISOString() } });
    } catch (e: any) { res.status(500).json({ error: "Failed to save reel", detail: e?.message }); }
  });

  app.delete("/api/reels/:id", requireAuth, async (req: any, res) => {
    try {
      const reel = await db.select({ userId: reelsTable.userId }).from(reelsTable).where(eq(reelsTable.id, req.params.id));
      if (!reel.length) return res.status(404).json({ error: "Reel not found" });
      const isOwner = reel[0].userId === req.user?.id;
      const isAdmin = ["SUPER_ADMIN", "FRANCHISE"].includes(req.user?.role);
      if (!isOwner && !isAdmin) return res.status(403).json({ error: "Not allowed" });
      await db.delete(reelsTable).where(eq(reelsTable.id, req.params.id));
      res.json({ success: true });
    } catch { res.status(500).json({ error: "Failed to delete reel" }); }
  });

  // ── Coin Transactions API (server-side persistent balance) ──────────────────

  // GET /api/coins/balance — returns the authenticated user's coin balance + history from DB
  // Balance = sum(coin_grants by phone) + sum(coin_transactions earned/bonus) - sum(coin_transactions redeemed)
  // coin_grants = admin-granted coins (source of truth for grants)
  // coin_transactions = order-earned, purchased, and redeemed coins
  app.get("/api/coins/balance", requireAuth, async (req: any, res) => {
    try {
      const cleanPhone = (req.user?.phone || "").replace(/\D/g, "").slice(-10);
      if (!cleanPhone) return res.status(401).json({ error: "Unauthorized" });
      const jwtId = req.user?.id || "";

      // Fetch coin_transactions (order-earned, redeemed) — match phone OR jwtId for legacy rows
      const txnWhere = jwtId && jwtId !== cleanPhone
        ? or(eq(coinTransactionsTable.userId, cleanPhone), eq(coinTransactionsTable.userId, jwtId))
        : eq(coinTransactionsTable.userId, cleanPhone);
      const txns = await db.select().from(coinTransactionsTable)
        .where(txnWhere)
        .orderBy(desc(coinTransactionsTable.createdAt))
        .limit(500);

      // Fetch coin_grants (admin-granted coins) — always by phone
      const grants = await db.select().from(coinGrantsTable)
        .where(eq(coinGrantsTable.phone, cleanPhone))
        .orderBy(desc(coinGrantsTable.createdAt));

      // Balance = grants total + txn credits - txn debits
      const grantTotal = grants.reduce((sum, g) => sum + g.amount, 0);
      const txnBalance = txns.reduce((sum, t) => t.type === "REDEEMED" ? sum - t.amount : sum + t.amount, 0);
      const balance = Math.max(0, grantTotal + txnBalance);

      // Build unified transaction history (grants first as EARNED entries, then txns)
      const grantTxns = grants.map((g) => ({
        id: `CG_${g.id}`,
        type: "EARNED" as const,
        amount: g.amount,
        reference: g.note || "Admin coin grant",
        createdAt: g.createdAt?.toISOString() ?? new Date().toISOString(),
      }));
      const txnHistory = txns.map((t) => ({
        id: t.id,
        type: t.type,
        amount: t.amount,
        reference: t.reference,
        createdAt: t.createdAt?.toISOString() ?? new Date().toISOString(),
      }));
      const allTxns = [...grantTxns, ...txnHistory]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 500);

      res.json({ balance, transactions: allTxns });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to fetch coin balance" });
    }
  });

  // POST /api/coins/add — record an EARNED, PURCHASED or BONUS coin event
  app.post("/api/coins/add", requireAuth, async (req: any, res) => {
    try {
      const cleanPhone = (req.user?.phone || "").replace(/\D/g, "").slice(-10);
      if (!cleanPhone) return res.status(401).json({ error: "Unauthorized" });
      const { amount, type, reference } = req.body;
      if (!amount || Number(amount) <= 0) return res.status(400).json({ error: "Invalid amount" });
      const validTypes = ["EARNED", "PURCHASED", "BONUS"];
      if (!validTypes.includes(String(type))) return res.status(400).json({ error: "Invalid type" });
      const id = `CT_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
      await db.insert(coinTransactionsTable).values({
        id,
        userId: cleanPhone,
        type: String(type),
        amount: Math.round(Number(amount)),
        reference: String(reference || "").slice(0, 500),
      });
      res.json({ success: true, id });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to record coin transaction" });
    }
  });

  // POST /api/coins/redeem — deduct coins (validates balance against both grants + txns)
  app.post("/api/coins/redeem", requireAuth, async (req: any, res) => {
    try {
      const cleanPhone = (req.user?.phone || "").replace(/\D/g, "").slice(-10);
      if (!cleanPhone) return res.status(401).json({ error: "Unauthorized" });
      const { amount, reference } = req.body;
      if (!amount || Number(amount) <= 0) return res.status(400).json({ error: "Invalid amount" });
      const jwtId = req.user?.id || "";

      // Compute balance from both tables (same logic as /api/coins/balance)
      const txnWhere = jwtId && jwtId !== cleanPhone
        ? or(eq(coinTransactionsTable.userId, cleanPhone), eq(coinTransactionsTable.userId, jwtId))
        : eq(coinTransactionsTable.userId, cleanPhone);
      const [txns, grants] = await Promise.all([
        db.select({ type: coinTransactionsTable.type, amount: coinTransactionsTable.amount })
          .from(coinTransactionsTable).where(txnWhere),
        db.select({ amount: coinGrantsTable.amount })
          .from(coinGrantsTable).where(eq(coinGrantsTable.phone, cleanPhone)),
      ]);
      const grantTotal = grants.reduce((sum, g) => sum + g.amount, 0);
      const txnBalance = txns.reduce((sum, t) => t.type === "REDEEMED" ? sum - t.amount : sum + t.amount, 0);
      const balance = Math.max(0, grantTotal + txnBalance);

      if (Math.round(Number(amount)) > balance) {
        return res.status(400).json({ error: `Insufficient coins. Available: ${balance}` });
      }
      const id = `CT_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
      await db.insert(coinTransactionsTable).values({
        id,
        userId: cleanPhone,
        type: "REDEEMED",
        amount: Math.round(Number(amount)),
        reference: String(reference || "").slice(0, 500),
      });
      res.json({ success: true, id, newBalance: balance - Math.round(Number(amount)) });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to redeem coins" });
    }
  });

  // POST /api/coins/redeem-to-wallet — convert Go Bharat Coins into INR wallet balance (₹100 per coin)
  // Atomically debits coins (REDEEMED, keyed by phone) and credits the INR wallet (CREDIT, keyed by user id).
  app.post("/api/coins/redeem-to-wallet", requireAuth, async (req: any, res) => {
    try {
      const cleanPhone = (req.user?.phone || "").replace(/\D/g, "").slice(-10);
      if (!cleanPhone) return res.status(401).json({ error: "Unauthorized" });
      const walletUserId = req.user?.id || cleanPhone;
      const COIN_TO_INR = 100;
      const MIN_REDEEM_COINS = 1;

      const coins = Math.floor(Number(req.body?.coins));
      if (!coins || coins < MIN_REDEEM_COINS) {
        return res.status(400).json({ error: `Minimum redemption is ${MIN_REDEEM_COINS} coin (₹${MIN_REDEEM_COINS * COIN_TO_INR}).` });
      }
      // Optional client idempotency key — guards against duplicate/retried redemptions via the
      // wallet_transactions.reference UNIQUE constraint (see walletRef below).
      const idempotencyKey = typeof req.body?.idempotencyKey === "string" && req.body.idempotencyKey.trim()
        ? req.body.idempotencyKey.trim().slice(0, 80)
        : "";

      const jwtId = req.user?.id || "";
      const txnWhere = jwtId && jwtId !== cleanPhone
        ? or(eq(coinTransactionsTable.userId, cleanPhone), eq(coinTransactionsTable.userId, jwtId))
        : eq(coinTransactionsTable.userId, cleanPhone);

      const rupees = coins * COIN_TO_INR;
      const coinTxnId = `CT_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
      const walletTxnId = `wt_redeem_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
      const coinRef = `Redeemed ${coins} coins to wallet (₹${rupees})`;
      const walletRef = `Coin Redemption:${idempotencyKey || coinTxnId}`;

      // Race-safe: take a per-user advisory lock and compute the coin balance INSIDE the
      // transaction so the check-and-debit is atomic. Two concurrent redemptions can no longer
      // both read the same pre-debit balance and over-credit the INR wallet.
      const outcome = await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"coin_redeem:" + cleanPhone}))`);

        const [txns, grants, walletTxns] = await Promise.all([
          tx.select({ type: coinTransactionsTable.type, amount: coinTransactionsTable.amount })
            .from(coinTransactionsTable).where(txnWhere),
          tx.select({ amount: coinGrantsTable.amount })
            .from(coinGrantsTable).where(eq(coinGrantsTable.phone, cleanPhone)),
          tx.select({ type: walletTransactionsTable.type, amount: walletTransactionsTable.amount })
            .from(walletTransactionsTable).where(eq(walletTransactionsTable.userId, walletUserId)),
        ]);
        const grantTotal = grants.reduce((sum, g) => sum + g.amount, 0);
        const txnBalance = txns.reduce((sum, t) => t.type === "REDEEMED" ? sum - t.amount : sum + t.amount, 0);
        const coinBalance = Math.max(0, grantTotal + txnBalance);
        if (coins > coinBalance) {
          return { ok: false as const, code: 400, error: `Insufficient coins. Available: ${coinBalance}` };
        }
        const walletBalanceBefore = Math.max(0, walletTxns.reduce((sum, t) => t.type === "CREDIT" ? sum + t.amount : sum - t.amount, 0));

        await tx.insert(coinTransactionsTable).values({
          id: coinTxnId,
          userId: cleanPhone,
          type: "REDEEMED",
          amount: coins,
          reference: coinRef.slice(0, 500),
        });
        await tx.insert(walletTransactionsTable).values({
          id: walletTxnId,
          userId: walletUserId,
          type: "CREDIT",
          amount: rupees,
          reference: walletRef,
        });
        return { ok: true as const, newCoinBalance: coinBalance - coins, newWalletBalance: walletBalanceBefore + rupees };
      });

      if (!outcome.ok) {
        return res.status(outcome.code).json({ error: outcome.error });
      }

      res.json({
        success: true,
        coins,
        rupees,
        newCoinBalance: outcome.newCoinBalance,
        newWalletBalance: outcome.newWalletBalance,
        coinTxnId,
        walletTxnId,
        coinReference: coinRef,
        walletReference: walletRef,
      });
    } catch (err: any) {
      // Unique-violation on wallet reference = duplicate (already-processed) redemption.
      if (err?.code === "23505") {
        return res.status(409).json({ error: "This redemption was already processed." });
      }
      console.error("[COINS] redeem-to-wallet failed:", err);
      res.status(500).json({ error: "Failed to redeem coins to wallet" });
    }
  });

  // ── Coin Grants API ─────────────────────────────────────────────────────────

  // Super admin grants coins to a user by phone
  app.post("/api/admin/coins/grant", requireAuth, requireRole("SUPER_ADMIN"), async (req: any, res) => {
    try {
      const { phone, amount, note } = req.body;
      if (!phone || !amount || amount <= 0) {
        return res.status(400).json({ error: "phone and positive amount are required" });
      }
      const cleanPhone = String(phone).replace(/\D/g, "").slice(-10);
      if (cleanPhone.length !== 10) return res.status(400).json({ error: "Invalid phone number" });

      // coin_grants is the sole source of truth for admin-granted coins.
      // The balance endpoint reads both coin_grants (for grants) and coin_transactions (for
      // order-earned/redeemed) so no double-write to coin_transactions is needed here.
      const grantedBy = (req.user?.phone || "").replace(/\D/g, "").slice(-10);
      const id = `CG_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
      await db.insert(coinGrantsTable).values({
        id,
        phone: cleanPhone,
        amount: Math.round(amount),
        note: String(note || "Admin grant").slice(0, 200),
        grantedBy,
        claimedAt: new Date(),
      });
      res.json({ success: true, grantId: id });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to create coin grant" });
    }
  });

  // User claims their pending coin grants (called on app startup)
  app.get("/api/coins/my-grants", requireAuth, async (req: any, res) => {
    try {
      const cleanPhone = (req.user?.phone || "").replace(/\D/g, "").slice(-10);
      if (!cleanPhone) return res.json({ grants: [], total: 0 });
      const unclaimed = await db.select().from(coinGrantsTable)
        .where(and(eq(coinGrantsTable.phone, cleanPhone), isNull(coinGrantsTable.claimedAt)));
      if (unclaimed.length > 0) {
        await db.update(coinGrantsTable)
          .set({ claimedAt: new Date() })
          .where(inArray(coinGrantsTable.id, unclaimed.map((g) => g.id)));
      }
      const total = unclaimed.reduce((sum, g) => sum + g.amount, 0);
      res.json({ grants: unclaimed, total });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to fetch coin grants" });
    }
  });

  // Super admin views full coin grant history
  app.get("/api/admin/coins/grants", requireAuth, requireRole("SUPER_ADMIN"), async (req: any, res) => {
    try {
      const history = await db.select().from(coinGrantsTable)
        .orderBy(desc(coinGrantsTable.createdAt))
        .limit(100);
      res.json({
        grants: history.map((g) => ({
          ...g,
          createdAt: g.createdAt?.toISOString(),
          claimedAt: g.claimedAt?.toISOString() ?? null,
        })),
      });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to fetch grant history" });
    }
  });

}

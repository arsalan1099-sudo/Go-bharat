var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// server/index.ts
import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import compression from "compression";
import { createServer } from "node:http";

// server/routes.ts
import OpenAI, { toFile } from "openai";
import { Buffer as Buffer2 } from "node:buffer";
import { Resend } from "resend";

// server/razorpayClient.ts
import crypto from "crypto";
var keyId = process.env.RAZORPAY_KEY_ID;
var keySecret = process.env.RAZORPAY_KEY_SECRET;
if (keyId && keySecret) {
  console.log("Razorpay client initialized successfully");
} else {
  console.warn("Razorpay not configured: RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET not set");
}
function isRazorpayConfigured() {
  return !!(keyId && keySecret);
}
function getRazorpayKeyId() {
  return keyId || "";
}
async function createRazorpayOrder(amountInr, orderId, notes) {
  if (!keyId || !keySecret) {
    return { success: false, error: "Razorpay not configured" };
  }
  try {
    const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
    const response = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "Authorization": `Basic ${auth}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        amount: Math.round(amountInr * 100),
        currency: "INR",
        receipt: orderId,
        notes: notes || { platform: "go_bharat" }
      })
    });
    const data = await response.json();
    if (data.id) {
      return { success: true, order: data };
    } else {
      return { success: false, error: data.error?.description || "Failed to create order" };
    }
  } catch (err) {
    console.error("Razorpay order creation error:", err?.message || err);
    return { success: false, error: err?.message || "Failed to create Razorpay order" };
  }
}
function verifyRazorpaySignature(orderId, paymentId, signature) {
  if (!keySecret) return false;
  const body = `${orderId}|${paymentId}`;
  const expectedSignature = crypto.createHmac("sha256", keySecret).update(body).digest("hex");
  return expectedSignature === signature;
}
async function fetchRazorpayPayment(paymentId) {
  if (!keyId || !keySecret) {
    return { success: false, error: "Razorpay not configured" };
  }
  try {
    const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
    const response = await fetch(`https://api.razorpay.com/v1/payments/${paymentId}`, {
      headers: {
        "Authorization": `Basic ${auth}`
      }
    });
    const data = await response.json();
    if (data.id) {
      return { success: true, payment: data };
    } else {
      return { success: false, error: data.error?.description || "Payment not found" };
    }
  } catch (err) {
    return { success: false, error: err?.message || "Failed to fetch payment" };
  }
}
async function refundRazorpayPayment(paymentId, amountInr) {
  if (!keyId || !keySecret) {
    return { success: false, error: "Razorpay not configured" };
  }
  try {
    const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
    const body = {};
    if (amountInr) {
      body.amount = Math.round(amountInr * 100);
    }
    const response = await fetch(`https://api.razorpay.com/v1/payments/${paymentId}/refund`, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${auth}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });
    const data = await response.json();
    if (data.id) {
      return { success: true, refund: data };
    } else {
      return { success: false, error: data.error?.description || "Refund failed" };
    }
  } catch (err) {
    return { success: false, error: err?.message || "Failed to process refund" };
  }
}

// server/payoutClient.ts
import crypto2 from "crypto";
var RAZORPAYX_BASE = "https://api.razorpay.com/v1/payouts";
function getConfiguredPayoutProvider() {
  const raw = (process.env.PAYOUT_PROVIDER || "").trim().toLowerCase();
  if (raw === "razorpayx" || raw === "phonepe" || raw === "manual") return raw;
  if (isRazorpayXConfigured()) return "razorpayx";
  return "manual";
}
function isRazorpayXConfigured() {
  return !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET && process.env.RAZORPAYX_ACCOUNT_NUMBER);
}
function normalizeRazorpayXStatus(status) {
  const s = (status || "").toLowerCase();
  if (s === "processed") return "COMPLETED";
  if (["reversed", "cancelled", "rejected", "failed"].includes(s)) return "FAILED";
  return "PROCESSING";
}
async function createRazorpayXPayout(input) {
  const keyId2 = process.env.RAZORPAY_KEY_ID;
  const keySecret2 = process.env.RAZORPAY_KEY_SECRET;
  const accountNumber = process.env.RAZORPAYX_ACCOUNT_NUMBER;
  if (!keyId2 || !keySecret2 || !accountNumber) {
    return { success: false, notConfigured: true, error: "RazorpayX not configured (missing RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET / RAZORPAYX_ACCOUNT_NUMBER)" };
  }
  const isUpi = input.destination.method === "UPI";
  const fundAccount = {
    account_type: isUpi ? "vpa" : "bank_account",
    contact: {
      name: input.beneficiaryName || "Go Bharat User",
      type: "customer",
      ...input.contactNumber ? { contact: input.contactNumber } : {}
    }
  };
  if (isUpi) {
    fundAccount.vpa = { address: input.destination.upiId };
  } else {
    fundAccount.bank_account = {
      name: input.beneficiaryName || "Go Bharat User",
      ifsc: input.destination.ifsc,
      account_number: input.destination.accountNumber
    };
  }
  const body = {
    account_number: accountNumber,
    amount: Math.round(input.amountInr * 100),
    currency: "INR",
    mode: isUpi ? "UPI" : "IMPS",
    purpose: "payout",
    fund_account: fundAccount,
    queue_if_low_balance: true,
    reference_id: `withdrawal_${input.withdrawalId}`,
    narration: "Go Bharat Withdrawal",
    notes: { withdrawal_id: input.withdrawalId }
  };
  const auth = Buffer.from(`${keyId2}:${keySecret2}`).toString("base64");
  let response;
  try {
    response = await fetch(RAZORPAYX_BASE, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${auth}`,
        "Content-Type": "application/json",
        // Mandatory for all payout requests since 2025-03-15. Same key => same payout.
        "X-Payout-Idempotency": input.idempotencyKey
      },
      body: JSON.stringify(body)
    });
  } catch (err) {
    return { success: false, ambiguous: true, error: err?.message || "Network error contacting RazorpayX" };
  }
  let data = null;
  try {
    data = await response.json();
  } catch {
    return { success: false, ambiguous: true, error: `Unparseable RazorpayX response (HTTP ${response.status})` };
  }
  if (data && data.id) {
    const rawStatus = data.status || "queued";
    return {
      success: true,
      ref: data.id,
      rawStatus,
      normalizedStatus: normalizeRazorpayXStatus(rawStatus)
    };
  }
  return {
    success: false,
    error: data?.error?.description || `RazorpayX payout failed (HTTP ${response.status})`
  };
}
async function createPhonePePayout(_input) {
  return {
    success: false,
    notConfigured: true,
    error: "PhonePe Payouts is not configured. Provide the PhonePe Payouts endpoint + credentials, or use RazorpayX."
  };
}
async function createPayout(input) {
  const provider = getConfiguredPayoutProvider();
  if (provider === "razorpayx") return createRazorpayXPayout(input);
  if (provider === "phonepe") return createPhonePePayout(input);
  return { success: false, notConfigured: true, error: "Automated payouts are disabled (PAYOUT_PROVIDER=manual)." };
}
function verifyPayoutWebhookSignature(rawBody, signature) {
  const secret = process.env.RAZORPAYX_WEBHOOK_SECRET || process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const expected = crypto2.createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  return crypto2.timingSafeEqual(a, b);
}

// server/phonePeClient.ts
import crypto3 from "crypto";
var merchantId = process.env.PHONEPE_MERCHANT_ID;
var saltKey = process.env.PHONEPE_SALT_KEY;
var saltIndex = parseInt(process.env.PHONEPE_SALT_INDEX || "1", 10);
var IS_PRODUCTION = process.env.REPLIT_DEPLOYMENT === "1" || process.env.NODE_ENV === "production";
var BASE_URL = IS_PRODUCTION ? "https://api.phonepe.com/apis/hermes" : "https://api-preprod.phonepe.com/apis/pg-sandbox";
if (merchantId && saltKey) {
  console.log("PhonePe client initialized successfully");
} else {
  console.warn("PhonePe not configured: PHONEPE_MERCHANT_ID or PHONEPE_SALT_KEY not set");
}
function isPhonePeConfigured() {
  return !!(merchantId && saltKey);
}
async function createPhonePeOrder(amountInr, transactionId, redirectUrl, callbackUrl, mobileNumber) {
  if (!merchantId || !saltKey) {
    return { success: false, error: "PhonePe not configured" };
  }
  const payload = {
    merchantId,
    merchantTransactionId: transactionId,
    merchantUserId: `MUID_${transactionId}`,
    amount: Math.round(amountInr * 100),
    redirectUrl,
    redirectMode: "REDIRECT",
    callbackUrl,
    mobileNumber: mobileNumber || "",
    paymentInstrument: {
      type: "PAY_PAGE"
    }
  };
  const base64Payload = Buffer.from(JSON.stringify(payload)).toString("base64");
  const endpoint = "/pg/v1/pay";
  const checksum = crypto3.createHash("sha256").update(base64Payload + endpoint + saltKey).digest("hex") + `###${saltIndex}`;
  try {
    const response = await fetch(`${BASE_URL}${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-VERIFY": checksum
      },
      body: JSON.stringify({ request: base64Payload })
    });
    const data = await response.json();
    if (data.success && data.data?.instrumentResponse?.redirectInfo?.url) {
      return { success: true, paymentUrl: data.data.instrumentResponse.redirectInfo.url };
    } else {
      return { success: false, error: data.message || "Failed to initiate PhonePe payment" };
    }
  } catch (err) {
    console.error("PhonePe order creation error:", err?.message || err);
    return { success: false, error: err?.message || "Failed to create PhonePe order" };
  }
}
async function fetchPhonePeStatus(transactionId) {
  if (!merchantId || !saltKey) {
    return { success: false, error: "PhonePe not configured" };
  }
  const endpoint = `/pg/v1/status/${merchantId}/${transactionId}`;
  const checksum = crypto3.createHash("sha256").update(endpoint + saltKey).digest("hex") + `###${saltIndex}`;
  try {
    const response = await fetch(`${BASE_URL}${endpoint}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "X-VERIFY": checksum,
        "X-MERCHANT-ID": merchantId
      }
    });
    const data = await response.json();
    if (data.success) {
      const txnState = data.data?.state || "";
      if (txnState === "COMPLETED") return { success: true, status: "paid" };
      if (txnState === "FAILED") return { success: true, status: "failed" };
      return { success: true, status: "pending" };
    } else {
      return { success: true, status: "pending" };
    }
  } catch (err) {
    return { success: false, error: err?.message || "Failed to fetch PhonePe status" };
  }
}
function verifyPhonePeCallbackChecksum(encodedResponse, xVerify) {
  if (!saltKey) return false;
  const expectedChecksum = crypto3.createHash("sha256").update(encodedResponse + saltKey).digest("hex") + `###${saltIndex}`;
  return expectedChecksum === xVerify;
}

// shared/schema.ts
var schema_exports = {};
__export(schema_exports, {
  adRequests: () => adRequests,
  addresses: () => addresses,
  appAnnouncements: () => appAnnouncements,
  appUsers: () => appUsers,
  busRoutes: () => busRoutes,
  categories: () => categories,
  coinGrants: () => coinGrants,
  coinTransactions: () => coinTransactions,
  communityPosts: () => communityPosts,
  coupons: () => coupons,
  customerStories: () => customerStories,
  dynamicPages: () => dynamicPages,
  featureFlags: () => featureFlags,
  homeBanners: () => homeBanners,
  homeDeals: () => homeDeals,
  insertUserSchema: () => insertUserSchema,
  leads: () => leads,
  liveSessions: () => liveSessions,
  notificationReads: () => notificationReads,
  notifications: () => notifications,
  orderItems: () => orderItems,
  orders: () => orders,
  otpCodes: () => otpCodes,
  payoutDetails: () => payoutDetails,
  products: () => products,
  promoMedia: () => promoMedia,
  pushTokens: () => pushTokens,
  reels: () => reels,
  reviews: () => reviews,
  subCategories: () => subCategories,
  teamMembers: () => teamMembers,
  transactions: () => transactions,
  users: () => users,
  vendorApplications: () => vendorApplications,
  vendors: () => vendors,
  walletTransactions: () => walletTransactions,
  withdrawalRequests: () => withdrawalRequests
});
import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, timestamp, doublePrecision, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
var users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull()
});
var appUsers = pgTable("app_users", {
  id: varchar("id", { length: 64 }).primaryKey(),
  name: text("name").notNull(),
  phone: varchar("phone", { length: 15 }).notNull(),
  email: text("email").default(""),
  role: varchar("role", { length: 20 }).notNull(),
  avatar: text("avatar"),
  vendorCategoryId: varchar("vendor_category_id", { length: 10 }),
  createdAt: timestamp("created_at").defaultNow()
}, (table) => [
  index("idx_app_users_phone").on(table.phone)
]);
var categories = pgTable("categories", {
  id: varchar("id", { length: 10 }).primaryKey(),
  name: text("name").notNull(),
  icon: text("icon").notNull(),
  color: varchar("color", { length: 10 }).notNull()
});
var subCategories = pgTable("sub_categories", {
  id: varchar("id", { length: 20 }).primaryKey(),
  categoryId: varchar("category_id", { length: 10 }).notNull(),
  name: text("name").notNull(),
  icon: text("icon").notNull().default("pricetag"),
  image: text("image").notNull().default("")
});
var vendors = pgTable("vendors", {
  id: varchar("id", { length: 64 }).primaryKey(),
  name: text("name").notNull(),
  description: text("description").default(""),
  image: text("image").default(""),
  rating: doublePrecision("rating").default(4),
  reviewCount: integer("review_count").default(0),
  deliveryTime: varchar("delivery_time", { length: 30 }).default("30-45 min"),
  distance: varchar("distance", { length: 20 }).default("0 km"),
  isOpen: boolean("is_open").default(true),
  categoryId: varchar("category_id", { length: 10 }).notNull(),
  subCategoryId: varchar("sub_category_id", { length: 20 }).default(""),
  commissionRate: doublePrecision("commission_rate").default(10),
  lat: doublePrecision("lat").default(0),
  lng: doublePrecision("lng").default(0),
  address: text("address"),
  pinCode: varchar("pin_code", { length: 10 }).default(""),
  franchiseId: varchar("franchise_id", { length: 64 }).default(""),
  codEnabled: boolean("cod_enabled").default(false),
  paymentQrUrl: text("payment_qr_url"),
  upiId: varchar("upi_id", { length: 100 }),
  createdAt: timestamp("created_at").defaultNow()
}, (table) => [
  index("idx_vendors_category_id").on(table.categoryId),
  index("idx_vendors_sub_category_id").on(table.subCategoryId),
  index("idx_vendors_pin_code").on(table.pinCode),
  index("idx_vendors_franchise_id").on(table.franchiseId)
]);
var products = pgTable("products", {
  id: varchar("id", { length: 64 }).primaryKey(),
  vendorId: varchar("vendor_id", { length: 64 }).notNull(),
  name: text("name").notNull(),
  description: text("description").default(""),
  price: doublePrecision("price").notNull(),
  originalPrice: doublePrecision("original_price"),
  image: text("image").default(""),
  isAvailable: boolean("is_available").default(true),
  category: text("category").default(""),
  codEnabled: boolean("cod_enabled").default(false),
  createdAt: timestamp("created_at").defaultNow()
}, (table) => [
  index("idx_products_vendor_id").on(table.vendorId),
  index("idx_products_category").on(table.category)
]);
var orders = pgTable("orders", {
  id: varchar("id", { length: 64 }).primaryKey(),
  customerId: varchar("customer_id", { length: 64 }).notNull(),
  customerName: text("customer_name"),
  vendorId: varchar("vendor_id", { length: 64 }).notNull(),
  vendorName: text("vendor_name").notNull(),
  vendorCategoryId: varchar("vendor_category_id", { length: 10 }),
  deliveryPartnerId: varchar("delivery_partner_id", { length: 64 }),
  deliveryPartnerName: text("delivery_partner_name"),
  status: varchar("status", { length: 20 }).notNull().default("PENDING"),
  totalAmount: doublePrecision("total_amount").notNull(),
  paymentStatus: varchar("payment_status", { length: 20 }).notNull().default("PENDING"),
  paymentMethod: varchar("payment_method", { length: 20 }),
  createdAt: timestamp("created_at").defaultNow(),
  deliveryAddress: text("delivery_address").notNull(),
  vendorAddress: text("vendor_address"),
  deliveryOTP: varchar("delivery_otp", { length: 6 }),
  deliveryNote: text("delivery_note"),
  deliverySpeed: varchar("delivery_speed", { length: 20 }),
  assignedAt: timestamp("assigned_at"),
  pickedAt: timestamp("picked_at"),
  deliveredAt: timestamp("delivered_at")
}, (table) => [
  index("idx_orders_customer_id").on(table.customerId),
  index("idx_orders_vendor_id").on(table.vendorId),
  index("idx_orders_status").on(table.status),
  index("idx_orders_delivery_partner_id").on(table.deliveryPartnerId),
  index("idx_orders_vendor_status").on(table.vendorId, table.status),
  index("idx_orders_customer_status").on(table.customerId, table.status)
]);
var orderItems = pgTable("order_items", {
  id: varchar("id", { length: 64 }).primaryKey(),
  orderId: varchar("order_id", { length: 64 }).notNull(),
  productId: varchar("product_id", { length: 64 }).notNull(),
  productName: text("product_name").notNull(),
  quantity: integer("quantity").notNull(),
  price: doublePrecision("price").notNull(),
  seatNumber: varchar("seat_number", { length: 10 }),
  seatClass: varchar("seat_class", { length: 20 })
});
var addresses = pgTable("addresses", {
  id: varchar("id", { length: 64 }).primaryKey(),
  userId: varchar("user_id", { length: 64 }).notNull(),
  label: varchar("label", { length: 50 }).notNull(),
  fullAddress: text("full_address").notNull(),
  lat: doublePrecision("lat").default(0),
  lng: doublePrecision("lng").default(0),
  isDefault: boolean("is_default").default(false)
});
var walletTransactions = pgTable("wallet_transactions", {
  id: varchar("id", { length: 64 }).primaryKey(),
  userId: varchar("user_id", { length: 64 }).notNull(),
  type: varchar("type", { length: 10 }).notNull(),
  amount: doublePrecision("amount").notNull(),
  reference: text("reference").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow()
}, (table) => [
  index("idx_wallet_transactions_user_id").on(table.userId)
]);
var notifications = pgTable("notifications", {
  id: varchar("id", { length: 128 }).primaryKey(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  targetRole: varchar("target_role", { length: 20 }).notNull().default("ALL"),
  targetUserId: varchar("target_user_id", { length: 64 }),
  read: boolean("read").default(false),
  sentAt: timestamp("sent_at").defaultNow()
}, (table) => [
  index("idx_notifications_target_user_id").on(table.targetUserId),
  index("idx_notifications_target_role").on(table.targetRole),
  index("idx_notifications_user_sent").on(table.targetUserId, table.sentAt)
]);
var reviews = pgTable("reviews", {
  id: varchar("id", { length: 64 }).primaryKey(),
  userId: varchar("user_id", { length: 64 }).notNull(),
  userName: text("user_name").notNull(),
  productId: varchar("product_id", { length: 64 }),
  vendorId: varchar("vendor_id", { length: 64 }).notNull(),
  rating: integer("rating").notNull(),
  comment: text("comment").default(""),
  photos: jsonb("photos").default([]),
  createdAt: timestamp("created_at").defaultNow(),
  helpful: integer("helpful").default(0),
  vendorReply: text("vendor_reply"),
  vendorReplyAt: timestamp("vendor_reply_at")
}, (table) => [
  index("idx_reviews_vendor_id").on(table.vendorId),
  index("idx_reviews_product_id").on(table.productId)
]);
var teamMembers = pgTable("team_members", {
  id: varchar("id", { length: 64 }).primaryKey(),
  name: text("name").notNull(),
  phone: varchar("phone", { length: 15 }).notNull(),
  email: text("email").default(""),
  role: varchar("role", { length: 20 }).notNull(),
  city: text("city").default(""),
  status: varchar("status", { length: 20 }).default("ACTIVE"),
  createdBy: text("created_by").default(""),
  createdByRole: varchar("created_by_role", { length: 20 }).default("SUPER_ADMIN"),
  createdAt: timestamp("created_at").defaultNow(),
  territory: text("territory"),
  bankName: text("bank_name"),
  accountNumber: text("account_number"),
  ifscCode: varchar("ifsc_code", { length: 20 }),
  accountHolderName: text("account_holder_name"),
  aadhaarNumber: varchar("aadhaar_number", { length: 20 }),
  panNumber: varchar("pan_number", { length: 15 }),
  dateOfBirth: varchar("date_of_birth", { length: 15 }),
  gender: varchar("gender", { length: 10 }),
  fullAddress: text("full_address"),
  emergencyContactName: text("emergency_contact_name"),
  emergencyContactPhone: varchar("emergency_contact_phone", { length: 15 }),
  vehicleNumber: varchar("vehicle_number", { length: 20 }),
  drivingLicenseNumber: varchar("driving_license_number", { length: 25 }),
  franchiseId: varchar("franchise_id", { length: 64 }).default(""),
  pinCode: varchar("pin_code", { length: 10 }).default("")
});
var vendorApplications = pgTable("vendor_applications", {
  id: varchar("id", { length: 64 }).primaryKey(),
  businessName: text("business_name").notNull(),
  ownerName: text("owner_name").notNull(),
  phone: varchar("phone", { length: 15 }).notNull(),
  email: text("email").default(""),
  categoryId: varchar("category_id", { length: 10 }).notNull(),
  subCategoryId: varchar("sub_category_id", { length: 20 }),
  address: text("address").notNull(),
  city: text("city").default(""),
  pinCode: varchar("pin_code", { length: 10 }).default(""),
  franchiseId: varchar("franchise_id", { length: 64 }).default(""),
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  locationLink: text("location_link"),
  description: text("description").default(""),
  gstNumber: varchar("gst_number", { length: 20 }).default(""),
  panNumber: varchar("pan_number", { length: 15 }).default(""),
  bankAccount: varchar("bank_account", { length: 30 }).default(""),
  ifscCode: varchar("ifsc_code", { length: 20 }).default(""),
  commissionRate: doublePrecision("commission_rate").default(10),
  paymentMethods: jsonb("payment_methods").default([]),
  upiId: varchar("upi_id", { length: 64 }),
  subscriptionPlan: varchar("subscription_plan", { length: 20 }),
  photos: jsonb("photos").default([]),
  status: varchar("status", { length: 20 }).notNull().default("PENDING"),
  submittedBy: text("submitted_by").default(""),
  submittedAt: timestamp("submitted_at").defaultNow(),
  reviewedBy: text("reviewed_by"),
  reviewedAt: timestamp("reviewed_at"),
  rejectionReason: text("rejection_reason")
}, (table) => [
  index("idx_vendor_apps_submitted_by").on(table.submittedBy),
  index("idx_vendor_apps_franchise_id").on(table.franchiseId),
  index("idx_vendor_apps_status").on(table.status),
  index("idx_vendor_apps_submitted_at").on(table.submittedAt)
]);
var otpCodes = pgTable("otp_codes", {
  id: varchar("id", { length: 64 }).primaryKey().default(sql`gen_random_uuid()`),
  phone: varchar("phone", { length: 15 }).notNull(),
  code: varchar("code", { length: 6 }).notNull(),
  email: text("email"),
  expiresAt: timestamp("expires_at").notNull(),
  verified: boolean("verified").default(false),
  createdAt: timestamp("created_at").defaultNow()
}, (table) => [
  index("idx_otp_codes_phone").on(table.phone)
]);
var pushTokens = pgTable("push_tokens", {
  id: varchar("id", { length: 64 }).primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 64 }).notNull().unique(),
  token: text("token").notNull(),
  platform: varchar("platform", { length: 10 }).notNull(),
  createdAt: timestamp("created_at").defaultNow()
});
var reels = pgTable("reels", {
  id: varchar("id", { length: 64 }).primaryKey(),
  userId: varchar("user_id", { length: 64 }).notNull(),
  userName: text("user_name").notNull(),
  userAvatar: text("user_avatar"),
  userRole: varchar("user_role", { length: 20 }).notNull(),
  vendorId: varchar("vendor_id", { length: 64 }),
  thumbnail: text("thumbnail").default(""),
  videoUrl: text("video_url").notNull(),
  caption: text("caption").default(""),
  likes: integer("likes").default(0),
  comments: integer("comments").default(0),
  shares: integer("shares").default(0),
  isLiked: boolean("is_liked").default(false),
  taggedProducts: jsonb("tagged_products").default([]),
  createdAt: timestamp("created_at").defaultNow()
});
var communityPosts = pgTable("community_posts", {
  id: varchar("id", { length: 64 }).primaryKey(),
  userId: varchar("user_id", { length: 64 }).notNull(),
  userName: text("user_name").notNull(),
  userAvatar: text("user_avatar"),
  userRole: varchar("user_role", { length: 20 }).notNull(),
  vendorId: varchar("vendor_id", { length: 64 }),
  vendorName: text("vendor_name"),
  type: varchar("type", { length: 20 }).notNull(),
  content: text("content").default(""),
  images: jsonb("images").default([]),
  likes: integer("likes").default(0),
  comments: integer("comments").default(0),
  isLiked: boolean("is_liked").default(false),
  isPinned: boolean("is_pinned").default(false),
  isHidden: boolean("is_hidden").default(false),
  taggedProducts: jsonb("tagged_products").default([]),
  pollOptions: jsonb("poll_options"),
  offerTitle: text("offer_title"),
  offerDiscount: text("offer_discount"),
  offerExpiry: text("offer_expiry"),
  questionCategory: text("question_category"),
  eventDate: text("event_date"),
  eventLocation: text("event_location"),
  createdAt: timestamp("created_at").defaultNow()
});
var customerStories = pgTable("customer_stories", {
  id: varchar("id", { length: 64 }).primaryKey(),
  userId: varchar("user_id", { length: 64 }).notNull(),
  userName: text("user_name").notNull(),
  location: text("location").default(""),
  rating: integer("rating").notNull(),
  title: text("title").notNull(),
  story: text("story").notNull(),
  photos: jsonb("photos").default([]),
  vendorId: varchar("vendor_id", { length: 64 }),
  vendorName: text("vendor_name"),
  productId: varchar("product_id", { length: 64 }),
  productName: text("product_name"),
  likes: integer("likes").default(0),
  isFeatured: boolean("is_featured").default(false),
  createdAt: timestamp("created_at").defaultNow()
});
var coupons = pgTable("coupons", {
  id: varchar("id", { length: 64 }).primaryKey(),
  code: varchar("code", { length: 30 }).notNull().unique(),
  discountType: varchar("discount_type", { length: 20 }).notNull(),
  value: doublePrecision("value").notNull(),
  minOrder: doublePrecision("min_order").default(0),
  maxDiscount: doublePrecision("max_discount"),
  usageLimit: integer("usage_limit").default(100),
  usedCount: integer("used_count").default(0),
  isActive: boolean("is_active").default(true),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow()
});
var adRequests = pgTable("ad_requests", {
  id: varchar("id", { length: 64 }).primaryKey(),
  vendorId: varchar("vendor_id", { length: 64 }).notNull(),
  vendorName: text("vendor_name").notNull(),
  title: text("title").notNull(),
  subtitle: text("subtitle"),
  description: text("description"),
  slotType: varchar("slot_type", { length: 20 }).notNull(),
  color: varchar("color", { length: 10 }),
  offerText: text("offer_text"),
  durationDays: integer("duration_days").notNull(),
  amountPaid: doublePrecision("amount_paid").default(0),
  status: varchar("status", { length: 20 }).notNull().default("PENDING"),
  createdAt: timestamp("created_at").defaultNow(),
  franchiseReviewedAt: timestamp("franchise_reviewed_at"),
  franchiseReviewedBy: text("franchise_reviewed_by"),
  adminReviewedAt: timestamp("admin_reviewed_at"),
  adminReviewedBy: text("admin_reviewed_by"),
  rejectionReason: text("rejection_reason"),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date")
});
var transactions = pgTable("transactions", {
  id: varchar("id", { length: 64 }).primaryKey(),
  orderId: varchar("order_id", { length: 64 }),
  razorpayOrderId: varchar("razorpay_order_id", { length: 64 }),
  razorpayPaymentId: varchar("razorpay_payment_id", { length: 64 }),
  gatewayTransactionId: varchar("gateway_transaction_id", { length: 64 }),
  amount: doublePrecision("amount").notNull(),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  method: varchar("method", { length: 20 }).default("razorpay"),
  createdAt: timestamp("created_at").defaultNow()
}, (table) => [
  index("idx_transactions_order_id").on(table.orderId),
  index("idx_transactions_razorpay_order_id").on(table.razorpayOrderId),
  index("idx_transactions_gateway_txn_id").on(table.gatewayTransactionId)
]);
var featureFlags = pgTable("feature_flags", {
  id: varchar("id", { length: 64 }).primaryKey(),
  name: text("name").notNull(),
  description: text("description").default(""),
  enabled: boolean("enabled").default(true),
  roles: jsonb("roles").default(["ALL"]),
  category: varchar("category", { length: 30 }).default("core"),
  icon: varchar("icon", { length: 50 }).default("flag"),
  updatedAt: timestamp("updated_at").defaultNow()
});
var dynamicPages = pgTable("dynamic_pages", {
  id: varchar("id", { length: 64 }).primaryKey(),
  title: text("title").notNull(),
  slug: varchar("slug", { length: 100 }).notNull(),
  targetRoles: jsonb("target_roles").default(["ALL"]),
  blocks: jsonb("blocks").default([]),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});
var appAnnouncements = pgTable("app_announcements", {
  id: varchar("id", { length: 64 }).primaryKey(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  type: varchar("type", { length: 20 }).default("info"),
  icon: varchar("icon", { length: 50 }).default("megaphone"),
  color: varchar("color", { length: 10 }).default("#FF6B00"),
  targetRoles: jsonb("target_roles").default(["ALL"]),
  actionLabel: text("action_label"),
  actionRoute: text("action_route"),
  isActive: boolean("is_active").default(true),
  priority: integer("priority").default(0),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow()
});
var withdrawalRequests = pgTable("withdrawal_requests", {
  id: varchar("id", { length: 64 }).primaryKey(),
  userId: varchar("user_id", { length: 64 }).notNull(),
  userName: text("user_name").default("User"),
  userRole: varchar("user_role", { length: 20 }).default("DELIVERY"),
  amount: doublePrecision("amount").notNull(),
  method: varchar("method", { length: 20 }).notNull(),
  bankDetails: jsonb("bank_details").default({}),
  status: varchar("status", { length: 20 }).notNull().default("PENDING"),
  rejectionReason: text("rejection_reason"),
  processedAt: timestamp("processed_at"),
  transactionId: varchar("transaction_id", { length: 64 }),
  payoutProvider: varchar("payout_provider", { length: 20 }),
  payoutRef: varchar("payout_ref", { length: 128 }),
  payoutStatus: varchar("payout_status", { length: 40 }),
  payoutError: text("payout_error"),
  payoutIdempotencyKey: varchar("payout_idempotency_key", { length: 64 }),
  createdAt: timestamp("created_at").defaultNow()
}, (table) => [
  index("idx_withdrawal_requests_payout_ref").on(table.payoutRef)
]);
var payoutDetails = pgTable("payout_details", {
  userId: varchar("user_id", { length: 64 }).primaryKey(),
  method: varchar("method", { length: 20 }).notNull(),
  accountHolder: text("account_holder").default(""),
  bankName: text("bank_name").default(""),
  accountNumber: varchar("account_number", { length: 30 }).default(""),
  ifsc: varchar("ifsc", { length: 20 }).default(""),
  upiId: varchar("upi_id", { length: 64 }).default(""),
  updatedAt: timestamp("updated_at").defaultNow()
});
var notificationReads = pgTable("notification_reads", {
  id: varchar("id", { length: 128 }).primaryKey(),
  notificationId: varchar("notification_id", { length: 128 }).notNull(),
  userId: varchar("user_id", { length: 64 }).notNull(),
  readAt: timestamp("read_at").defaultNow()
}, (table) => [
  index("idx_notification_reads_user").on(table.userId),
  index("idx_notification_reads_notif").on(table.notificationId)
]);
var liveSessions = pgTable("live_sessions", {
  id: varchar("id", { length: 64 }).primaryKey(),
  vendorId: varchar("vendor_id", { length: 64 }).notNull(),
  vendorName: text("vendor_name").default("Vendor"),
  title: text("title").notNull(),
  description: text("description").default(""),
  thumbnail: text("thumbnail").default(""),
  videoUrl: text("video_url").default(""),
  status: varchar("status", { length: 20 }).notNull().default("SCHEDULED"),
  viewers: integer("viewers").default(0),
  peakViewers: integer("peak_viewers").default(0),
  likes: integer("likes").default(0),
  taggedProducts: jsonb("tagged_products").default([]),
  chatMessages: jsonb("chat_messages").default([]),
  startedAt: timestamp("started_at"),
  endedAt: timestamp("ended_at"),
  scheduledAt: timestamp("scheduled_at"),
  createdAt: timestamp("created_at").defaultNow()
});
var busRoutes = pgTable("bus_routes", {
  id: varchar("id", { length: 64 }).primaryKey(),
  productId: varchar("product_id", { length: 64 }).notNull(),
  vendorId: varchar("vendor_id", { length: 64 }).notNull().default("v_travel_1"),
  from: text("from").notNull(),
  to: text("to").notNull(),
  departure: text("departure").notNull(),
  arrival: text("arrival").notNull(),
  duration: text("duration").notNull(),
  busType: varchar("bus_type", { length: 30 }).notNull(),
  busName: text("bus_name").notNull(),
  totalSeats: integer("total_seats").notNull(),
  bookedSeats: jsonb("booked_seats").default([]),
  pricePerSeat: doublePrecision("price_per_seat").notNull(),
  amenities: jsonb("amenities").default([]),
  stops: jsonb("stops").default([])
});
var homeBanners = pgTable("home_banners", {
  id: varchar("id", { length: 64 }).primaryKey(),
  title: text("title").notNull().default(""),
  subtitle: text("subtitle").notNull().default(""),
  color: varchar("color", { length: 20 }).notNull().default("#FF6B00"),
  ctaText: text("cta_text").notNull().default(""),
  isActive: boolean("is_active").notNull().default(true),
  order: integer("order").notNull().default(0),
  image: text("image"),
  createdAt: timestamp("created_at").defaultNow()
});
var homeDeals = pgTable("home_deals", {
  id: varchar("id", { length: 64 }).primaryKey(),
  name: text("name").notNull(),
  image: text("image").notNull().default(""),
  price: doublePrecision("price").notNull().default(0),
  originalPrice: doublePrecision("original_price").notNull().default(0),
  endsInHours: integer("ends_in_hours").notNull().default(24),
  sold: integer("sold").notNull().default(0),
  total: integer("total").notNull().default(100),
  productId: varchar("product_id", { length: 64 }),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow()
});
var promoMedia = pgTable("promo_media", {
  id: varchar("id", { length: 64 }).primaryKey(),
  type: varchar("type", { length: 10 }).notNull().default("image"),
  uri: text("uri").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow()
});
var leads = pgTable("leads", {
  id: varchar("id", { length: 64 }).primaryKey(),
  vendorName: text("vendor_name").notNull(),
  phone: varchar("phone", { length: 15 }).notNull(),
  status: varchar("status", { length: 20 }).notNull().default("NEW"),
  marketingAgentPhone: varchar("marketing_agent_phone", { length: 15 }).notNull(),
  notes: text("notes").default(""),
  createdAt: timestamp("created_at").defaultNow()
}, (table) => [
  index("idx_leads_agent_phone").on(table.marketingAgentPhone)
]);
var coinGrants = pgTable("coin_grants", {
  id: varchar("id", { length: 64 }).primaryKey(),
  phone: varchar("phone", { length: 15 }).notNull(),
  amount: integer("amount").notNull(),
  note: text("note").default(""),
  grantedBy: varchar("granted_by", { length: 15 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  claimedAt: timestamp("claimed_at")
}, (table) => [
  index("idx_coin_grants_phone").on(table.phone)
]);
var coinTransactions = pgTable("coin_transactions", {
  id: varchar("id", { length: 64 }).primaryKey(),
  userId: varchar("user_id", { length: 64 }).notNull(),
  type: varchar("type", { length: 20 }).notNull(),
  amount: integer("amount").notNull(),
  reference: text("reference").notNull(),
  createdAt: timestamp("created_at").defaultNow()
}, (table) => [
  index("idx_coin_transactions_user_id").on(table.userId)
]);
var insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true
});

// server/db.ts
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set");
}
var IS_PRODUCTION2 = process.env.REPLIT_DEPLOYMENT === "1" || process.env.NODE_ENV === "production";
var pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: IS_PRODUCTION2 ? 5 : 10,
  min: 1,
  idleTimeoutMillis: 25e3,
  connectionTimeoutMillis: 15e3,
  allowExitOnIdle: false,
  keepAlive: true,
  keepAliveInitialDelayMillis: 1e4
});
pool.on("error", (err) => {
  console.error("Database pool connection error (non-fatal, pool will reconnect):", err.message);
});
pool.on("connect", () => {
  const timeout = IS_PRODUCTION2 ? 3e4 : 6e4;
  pool.query(`SET statement_timeout = ${timeout}`).catch(() => {
  });
});
var db = drizzle(pool, { schema: schema_exports });
async function getPoolHealth() {
  return {
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount
  };
}

// server/storage.ts
import { eq, desc, and, gt, sql as sql2 } from "drizzle-orm";
import { randomUUID } from "crypto";
var DatabaseStorage = class {
  async getUser(id) {
    const [user] = await db.select().from(appUsers).where(eq(appUsers.id, id)).limit(1);
    return user ? { id: user.id, username: user.name, password: "" } : void 0;
  }
  async getUserByUsername(username) {
    const [user] = await db.select().from(appUsers).where(eq(appUsers.name, username)).limit(1);
    return user ? { id: user.id, username: user.name, password: "" } : void 0;
  }
  async createUser(insertUser) {
    const id = randomUUID();
    const user = { ...insertUser, id };
    return user;
  }
  async storeOtp(phone, code, email) {
    const id = randomUUID();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1e3);
    await db.insert(otpCodes).values({
      id,
      phone,
      code,
      email: email || null,
      expiresAt,
      verified: false
    });
  }
  async verifyOtp(phone, code) {
    const now = /* @__PURE__ */ new Date();
    const [otp] = await db.select().from(otpCodes).where(
      and(
        eq(otpCodes.phone, phone),
        eq(otpCodes.code, code),
        eq(otpCodes.verified, false),
        gt(otpCodes.expiresAt, now)
      )
    ).orderBy(desc(otpCodes.createdAt)).limit(1);
    if (!otp) return false;
    await db.update(otpCodes).set({ verified: true }).where(eq(otpCodes.id, otp.id));
    return true;
  }
  async cleanExpiredOtps() {
    const now = /* @__PURE__ */ new Date();
    await db.delete(otpCodes).where(gt(now, otpCodes.expiresAt));
  }
  async storePushToken(userId, token, platform) {
    await db.insert(pushTokens).values({ userId, token, platform }).onConflictDoUpdate({
      target: pushTokens.userId,
      set: { token, platform }
    });
  }
  async getPushToken(userId) {
    const [result] = await db.select().from(pushTokens).where(eq(pushTokens.userId, userId)).limit(1);
    return result ? { token: result.token, platform: result.platform } : null;
  }
  async getAllPushTokens() {
    return db.select({
      userId: pushTokens.userId,
      token: pushTokens.token,
      platform: pushTokens.platform
    }).from(pushTokens);
  }
  async storeNotification(notif) {
    await db.insert(notifications).values({
      id: notif.id,
      title: notif.title,
      message: notif.message,
      targetRole: notif.targetRole,
      targetUserId: notif.targetUserId || null,
      read: false
    });
  }
  async getNotifications(limit) {
    return db.select().from(notifications).orderBy(desc(notifications.sentAt)).limit(limit);
  }
  async getUnreadCount(userId) {
    const result = await db.select({ count: sql2`count(*)` }).from(notifications).where(eq(notifications.read, false));
    return result[0]?.count || 0;
  }
  async markNotificationRead(notifId) {
    await db.update(notifications).set({ read: true }).where(eq(notifications.id, notifId));
  }
  async deleteUserAccount(userId) {
    try {
      await db.delete(pushTokens).where(eq(pushTokens.userId, userId));
      await db.delete(notifications).where(eq(notifications.targetUserId, userId));
      await db.delete(reviews).where(eq(reviews.userId, userId));
      await db.delete(appUsers).where(eq(appUsers.id, userId));
      return true;
    } catch (error) {
      console.error("Delete user account error:", error);
      return false;
    }
  }
};
var MemStorage = class {
  users;
  otpStore;
  pushTokenStore;
  notificationStore;
  constructor() {
    this.users = /* @__PURE__ */ new Map();
    this.otpStore = /* @__PURE__ */ new Map();
    this.pushTokenStore = /* @__PURE__ */ new Map();
    this.notificationStore = [];
  }
  async getUser(id) {
    return this.users.get(id);
  }
  async getUserByUsername(username) {
    return Array.from(this.users.values()).find((user) => user.username === username);
  }
  async createUser(insertUser) {
    const id = randomUUID();
    const user = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }
  async storeOtp(phone, code, email) {
    this.otpStore.set(phone, { code, expiresAt: Date.now() + 5 * 60 * 1e3, email });
  }
  async verifyOtp(phone, code) {
    const stored = this.otpStore.get(phone);
    if (!stored) return false;
    if (stored.expiresAt < Date.now()) {
      this.otpStore.delete(phone);
      return false;
    }
    if (stored.code !== code) return false;
    this.otpStore.delete(phone);
    return true;
  }
  async cleanExpiredOtps() {
    const now = Date.now();
    for (const [key, val] of this.otpStore.entries()) {
      if (val.expiresAt < now) this.otpStore.delete(key);
    }
  }
  async storePushToken(userId, token, platform) {
    this.pushTokenStore.set(userId, { token, platform });
  }
  async getPushToken(userId) {
    return this.pushTokenStore.get(userId) || null;
  }
  async getAllPushTokens() {
    return Array.from(this.pushTokenStore.entries()).map(([userId, data]) => ({
      userId,
      token: data.token,
      platform: data.platform
    }));
  }
  async storeNotification(notif) {
    this.notificationStore.unshift({
      ...notif,
      read: false,
      sentAt: (/* @__PURE__ */ new Date()).toISOString()
    });
    if (this.notificationStore.length > 500) {
      this.notificationStore = this.notificationStore.slice(0, 500);
    }
  }
  async getNotifications(limit) {
    return this.notificationStore.slice(0, limit);
  }
  async getUnreadCount(userId) {
    return this.notificationStore.filter((n) => !n.read).length;
  }
  async markNotificationRead(notifId) {
    const notif = this.notificationStore.find((n) => n.id === notifId);
    if (notif) notif.read = true;
  }
  async deleteUserAccount(userId) {
    this.users.delete(userId);
    this.pushTokenStore.delete(userId);
    this.notificationStore = this.notificationStore.filter((n) => n.targetUserId !== userId);
    return true;
  }
};
function createStorage() {
  if (process.env.DATABASE_URL) {
    console.log("Using DatabaseStorage (PostgreSQL)");
    return new DatabaseStorage();
  }
  const isProduction = process.env.NODE_ENV === "production";
  if (isProduction) {
    throw new Error("DATABASE_URL is required in production. Cannot use in-memory storage.");
  }
  console.log("Using MemStorage (in-memory fallback \u2014 development only)");
  return new MemStorage();
}
var storage = createStorage();

// server/cache.ts
var ServerCache = class {
  store = /* @__PURE__ */ new Map();
  cleanupInterval;
  constructor() {
    this.cleanupInterval = setInterval(() => this.cleanup(), 6e4);
  }
  get(key) {
    const entry = this.store.get(key);
    if (!entry) return void 0;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return void 0;
    }
    return entry.value;
  }
  set(key, value, ttlSeconds) {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1e3
    });
  }
  invalidate(key) {
    this.store.delete(key);
  }
  invalidatePattern(pattern) {
    const regex = new RegExp(pattern);
    for (const key of this.store.keys()) {
      if (regex.test(key)) {
        this.store.delete(key);
      }
    }
  }
  clear() {
    this.store.clear();
  }
  stats() {
    return { size: this.store.size, keys: Array.from(this.store.keys()) };
  }
  cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.expiresAt) {
        this.store.delete(key);
      }
    }
  }
};
var cache = new ServerCache();
var CACHE_TTL = {
  APP_CONFIG: 300,
  FEATURE_FLAGS: 300,
  TEAM_MEMBERS: 300,
  ADMIN_CONFIG: 300,
  NOTIFICATIONS_HISTORY: 30,
  UNREAD_COUNT: 15,
  CATEGORIES: 600
};

// server/routes.ts
import { eq as eq2, and as and2, or, sql as sql3, desc as desc2, inArray, isNull, gte, getTableColumns } from "drizzle-orm";

// server/smsClient.ts
var apiKey = process.env.FAST2SMS_API_KEY;
if (apiKey) {
  console.log("Fast2SMS client initialized successfully");
} else {
  console.warn("Fast2SMS not configured: FAST2SMS_API_KEY not set");
}
function isSmsConfigured() {
  return !!apiKey;
}
async function sendSmsOtp(toPhone, code) {
  if (!apiKey) {
    return { sent: false, error: "Fast2SMS not configured" };
  }
  try {
    const cleanPhone = toPhone.replace(/\D/g, "").slice(-10);
    if (cleanPhone.length !== 10) {
      return { sent: false, error: "Invalid phone number" };
    }
    const response = await fetch("https://www.fast2sms.com/dev/bulkV2", {
      method: "POST",
      headers: {
        "authorization": apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        route: "q",
        message: `${code} is your Go Bharat verification code. Valid for 5 minutes. Do not share with anyone.`,
        flash: 0,
        numbers: cleanPhone
      })
    });
    const data = await response.json();
    if (data.return) {
      console.log(`Fast2SMS OTP sent to ${cleanPhone} (request_id: ${data.request_id})`);
      return { sent: true };
    } else {
      console.error("Fast2SMS error:", data.message);
      return { sent: false, error: data.message || "Fast2SMS delivery failed" };
    }
  } catch (err) {
    console.error("Fast2SMS error:", err?.message || err);
    return { sent: false, error: err?.message || "Failed to send SMS" };
  }
}

// server/whatsappClient.ts
var GRAPH_API_VERSION = process.env.WHATSAPP_GRAPH_API_VERSION || "v21.0";
var TEMPLATE_NAME = process.env.WHATSAPP_OTP_TEMPLATE_NAME || "";
var TEMPLATE_LANG = process.env.WHATSAPP_OTP_TEMPLATE_LANG || "en_US";
var TEMPLATE_HAS_COPY_BUTTON = process.env.WHATSAPP_OTP_TEMPLATE_NO_BUTTON !== "1";
var ORDER_TEMPLATE_NAME = process.env.WHATSAPP_ORDER_TEMPLATE_NAME || "";
var ORDER_TEMPLATE_LANG = process.env.WHATSAPP_ORDER_TEMPLATE_LANG || "en_US";
async function resolveCredentials() {
  const envToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const envPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (envToken && envPhoneId) {
    return { accessToken: envToken, phoneNumberId: envPhoneId };
  }
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY ? "repl " + process.env.REPL_IDENTITY : process.env.WEB_REPL_RENEWAL ? "depl " + process.env.WEB_REPL_RENEWAL : null;
  if (!hostname || !xReplitToken) return null;
  try {
    const response = await fetch(
      `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=whatsapp-business`,
      { headers: { Accept: "application/json", X_REPLIT_TOKEN: xReplitToken } }
    );
    if (!response.ok) return null;
    const data = await response.json();
    const item = data.items?.[0];
    const settings = item?.settings || {};
    const accessToken = settings.access_token || settings.accessToken || settings.api_key || settings.apiKey || settings.oauth?.credentials?.access_token || settings.oauth?.credentials?.accessToken;
    const phoneNumberId = settings.phone_number_id || settings.phoneNumberId || settings.phone_id || settings.from_phone_number_id || process.env.WHATSAPP_PHONE_NUMBER_ID;
    if (!accessToken || !phoneNumberId) return null;
    return { accessToken, phoneNumberId };
  } catch (err) {
    console.error("WhatsApp credential lookup error:", err?.message || err);
    return null;
  }
}
async function isWhatsAppConfigured() {
  if (!TEMPLATE_NAME) return false;
  const creds = await resolveCredentials();
  return !!creds;
}
function normalizePhone(toPhone) {
  const digits = (toPhone || "").replace(/\D/g, "");
  if (digits.length === 10) return "91" + digits;
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  if (digits.length === 11 && digits.startsWith("0")) return "91" + digits.slice(1);
  if (digits.length > 12) return digits.slice(-12);
  if (digits.length >= 10) return digits;
  return null;
}
function sanitizeParam(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}
async function sendWhatsAppTemplate(toPhone, templateName, languageCode, opts = {}) {
  if (!templateName) {
    return { sent: false, configured: false, error: "WhatsApp template not configured" };
  }
  const creds = await resolveCredentials();
  if (!creds) {
    return { sent: false, configured: false, error: "WhatsApp Business not connected" };
  }
  const to = normalizePhone(toPhone);
  if (!to) {
    return { sent: false, configured: true, error: "Invalid phone number" };
  }
  const components = [];
  if (opts.bodyParams && opts.bodyParams.length) {
    components.push({
      type: "body",
      parameters: opts.bodyParams.map((text2) => ({ type: "text", text: text2 }))
    });
  }
  if (opts.buttonUrlParam) {
    components.push({
      type: "button",
      sub_type: "url",
      index: "0",
      parameters: [{ type: "text", text: opts.buttonUrlParam }]
    });
  }
  try {
    const response = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${creds.phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${creds.accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "template",
          template: {
            name: templateName,
            language: { code: languageCode },
            components
          }
        })
      }
    );
    const data = await response.json().catch(() => ({}));
    if (response.ok && data?.messages?.length) {
      console.log(`WhatsApp template "${templateName}" sent to ${to} (message_id: ${data.messages[0]?.id})`);
      return { sent: true, configured: true };
    }
    const errMsg = data?.error?.message || `WhatsApp delivery failed (HTTP ${response.status})`;
    console.error(`WhatsApp error (${templateName}):`, errMsg);
    return { sent: false, configured: true, error: errMsg };
  } catch (err) {
    console.error(`WhatsApp error (${templateName}):`, err?.message || err);
    return { sent: false, configured: true, error: err?.message || "Failed to send WhatsApp message" };
  }
}
async function sendWhatsAppOtp(toPhone, code) {
  if (!TEMPLATE_NAME) {
    return { sent: false, configured: false, error: "WhatsApp OTP template not configured" };
  }
  return sendWhatsAppTemplate(toPhone, TEMPLATE_NAME, TEMPLATE_LANG, {
    bodyParams: [code],
    buttonUrlParam: TEMPLATE_HAS_COPY_BUTTON ? code : void 0
  });
}
async function sendWhatsAppOrderConfirmation(toPhone, params) {
  if (!ORDER_TEMPLATE_NAME) {
    return { sent: false, configured: false, error: "WhatsApp order template not configured" };
  }
  const bodyParams = [
    sanitizeParam(params.customerName || "Customer"),
    sanitizeParam(params.orderId),
    sanitizeParam(params.amount),
    sanitizeParam(params.vendorName)
  ];
  return sendWhatsAppTemplate(toPhone, ORDER_TEMPLATE_NAME, ORDER_TEMPLATE_LANG, { bodyParams });
}

// server/pushService.ts
import Expo from "expo-server-sdk";
var expo = new Expo();
async function sendPushNotifications(tokens, title, body, data) {
  const messages = [];
  for (const { token } of tokens) {
    if (!Expo.isExpoPushToken(token)) {
      console.warn(`Invalid Expo push token: ${token}`);
      continue;
    }
    messages.push({
      to: token,
      sound: "default",
      title,
      body,
      data: data || {}
    });
  }
  if (messages.length === 0) {
    return { sent: 0, failed: 0 };
  }
  const chunks = expo.chunkPushNotifications(messages);
  let sent = 0;
  let failed = 0;
  for (const chunk of chunks) {
    try {
      const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
      for (const ticket of ticketChunk) {
        if (ticket.status === "ok") {
          sent++;
        } else {
          failed++;
          if (ticket.status === "error") {
            console.error(`Push notification error: ${ticket.message}`);
          }
        }
      }
    } catch (error) {
      console.error("Error sending push notification chunk:", error);
      failed += chunk.length;
    }
  }
  return { sent, failed };
}
async function sendPushToUser(storage2, userId, title, body, data) {
  const tokenData = await storage2.getPushToken(userId);
  if (!tokenData) return false;
  const result = await sendPushNotifications(
    [{ userId, token: tokenData.token, platform: tokenData.platform }],
    title,
    body,
    data
  );
  return result.sent > 0;
}

// server/auth.ts
import jwt from "jsonwebtoken";
var IS_PRODUCTION3 = process.env.REPLIT_DEPLOYMENT === "1" || process.env.NODE_ENV === "production";
var JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET && IS_PRODUCTION3) {
  throw new Error("JWT_SECRET environment variable is required in production");
}
var SECRET = JWT_SECRET || "dev-only-secret-" + Math.random().toString(36);
var JWT_EXPIRY = "7d";
function generateToken(phone, role, id) {
  return jwt.sign({ phone, role, id }, SECRET, { expiresIn: JWT_EXPIRY });
}
function verifyToken(token) {
  try {
    return jwt.verify(token, SECRET);
  } catch {
    return null;
  }
}
function requireAuth(req, res, next) {
  const authHeader = req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Authentication required" });
  }
  const token = authHeader.slice(7);
  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
  req.user = payload;
  next();
}
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }
    const userRole = req.user.role || "";
    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    next();
  };
}
function optionalAuth(req, _res, next) {
  const authHeader = req.header("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const payload = verifyToken(token);
    if (payload) {
      req.user = payload;
    }
  }
  next();
}

// server/routes.ts
import crypto4 from "crypto";
import sharp from "sharp";
var MAX_IMG_CACHE = 200;
var imgBufferCache = /* @__PURE__ */ new Map();
function imgCacheGet(key) {
  return imgBufferCache.get(key);
}
function imgCacheSet(key, entry) {
  if (imgBufferCache.size >= MAX_IMG_CACHE) {
    const firstKey = imgBufferCache.keys().next().value;
    if (firstKey !== void 0) imgBufferCache.delete(firstKey);
  }
  imgBufferCache.set(key, entry);
}
function imgCacheInvalidate(key) {
  imgBufferCache.delete(key);
}
async function compressImageDataUrl(dataUrl, maxWidthPx = 900, quality = 78) {
  if (!dataUrl.startsWith("data:image/")) return dataUrl;
  const raw = Buffer2.from(dataUrl.replace(/^data:image\/\w+;base64,/, ""), "base64");
  const compressed = await sharp(raw).resize({ width: maxWidthPx, withoutEnlargement: true }).jpeg({ quality, mozjpeg: true }).toBuffer();
  return "data:image/jpeg;base64," + compressed.toString("base64");
}
async function compressToBuffer(dataUrl, maxWidthPx = 900, quality = 78) {
  const raw = Buffer2.from(dataUrl.replace(/^data:image\/\w+;base64,/, ""), "base64");
  return sharp(raw).resize({ width: maxWidthPx, withoutEnlargement: true }).jpeg({ quality, mozjpeg: true }).toBuffer();
}
var resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
var IS_PRODUCTION4 = process.env.REPLIT_DEPLOYMENT === "1" || process.env.NODE_ENV === "production";
var otpRateLimit = /* @__PURE__ */ new Map();
var OTP_RATE_LIMIT_MAX = 5;
var OTP_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1e3;
function isOtpRateLimited(phone) {
  const now = Date.now();
  const timestamps = (otpRateLimit.get(phone) || []).filter((t) => now - t < OTP_RATE_LIMIT_WINDOW_MS);
  otpRateLimit.set(phone, timestamps);
  if (timestamps.length >= OTP_RATE_LIMIT_MAX) return true;
  timestamps.push(now);
  otpRateLimit.set(phone, timestamps);
  return false;
}
function generateOTP() {
  return Math.floor(1e5 + Math.random() * 9e5).toString();
}
async function resolveMapLinkToCoords(link) {
  const parseCoords = (text2) => {
    const patterns = [
      /@(-?\d+\.?\d*),(-?\d+\.?\d*)/,
      /q=(-?\d+\.?\d*),(-?\d+\.?\d*)/,
      /ll=(-?\d+\.?\d*),(-?\d+\.?\d*)/,
      /place\/[^/]*\/(-?\d+\.?\d*),(-?\d+\.?\d*)/,
      /!3d(-?\d+\.?\d+)!4d(-?\d+\.?\d+)/,
      /center=(-?\d+\.?\d+),(-?\d+\.?\d+)/,
      /destination=(-?\d+\.?\d+),(-?\d+\.?\d+)/,
      /(-?\d+\.\d{3,})\s*[,\s]\s*(-?\d+\.\d{3,})/
    ];
    for (const pattern of patterns) {
      const match = text2.match(pattern);
      if (match) {
        const lat = parseFloat(match[1]);
        const lng = parseFloat(match[2]);
        if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 && (Math.abs(lat) > 1e-3 || Math.abs(lng) > 1e-3)) {
          return { lat, lng };
        }
      }
    }
    return null;
  };
  const direct = parseCoords(link);
  if (direct) return direct;
  try {
    const response = await fetch(link, { redirect: "follow", signal: AbortSignal.timeout(1e4) });
    const finalUrl = response.url;
    const fromUrl = parseCoords(finalUrl);
    if (fromUrl) return fromUrl;
    const html = await response.text();
    const fromHtml = parseCoords(html);
    if (fromHtml) return fromHtml;
  } catch {
  }
  return null;
}
var openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL
});
var SYSTEM_PROMPT = `You are a helpful product listing assistant for GO BHARAT, a hyperlocal super app in India. You help vendors manage their product listings.

You can help with:
- Writing compelling product descriptions in English or Hindi
- Suggesting competitive pricing for Indian market
- Recommending product categories (B2B Wholesale, B2C Retail, Services, Manpower)
- Improving product titles for better visibility
- Suggesting tags and keywords
- Bulk listing tips and inventory management advice
- Marketing copy for products

Keep responses concise and actionable. Use Indian Rupee (\u20B9) for prices. Be friendly and professional.
When suggesting descriptions, make them engaging and suitable for mobile viewing (short paragraphs).
If asked about something unrelated to product management, politely redirect the conversation.`;
var DEFAULT_FEATURE_FLAGS = [
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
  { id: "ff18", name: "Manpower Agency", description: "Worker profiles and job posting system", enabled: true, roles: ["VENDOR"], category: "commerce", icon: "people" }
];
async function seedFeatureFlags() {
  try {
    const existing = await db.select({ id: featureFlags.id }).from(featureFlags);
    const existingIds = new Set(existing.map((f) => f.id));
    const toInsert = DEFAULT_FEATURE_FLAGS.filter((f) => !existingIds.has(f.id));
    if (toInsert.length > 0) {
      await db.insert(featureFlags).values(toInsert);
      console.log(`Seeded ${toInsert.length} default feature flags`);
    }
  } catch (e) {
    console.error("Failed to seed feature flags:", e);
  }
}
var PRODUCT_CACHE_TTL_MS = 10 * 60 * 1e3;
var productCache = /* @__PURE__ */ new Map();
function getProductCache(vendorId) {
  const entry = productCache.get(vendorId);
  if (!entry) return null;
  if (Date.now() - entry.ts > PRODUCT_CACHE_TTL_MS) {
    productCache.delete(vendorId);
    return null;
  }
  return entry.data;
}
function setProductCache(vendorId, data) {
  productCache.set(vendorId, { data, ts: Date.now() });
}
function invalidateProductCache(_vendorId) {
  productCache.clear();
  lastProductWarmAt = 0;
}
var lightweightProductCols = {
  id: products.id,
  vendorId: products.vendorId,
  name: products.name,
  description: products.description,
  price: products.price,
  originalPrice: products.originalPrice,
  isAvailable: products.isAvailable,
  category: products.category,
  codEnabled: products.codEnabled,
  createdAt: products.createdAt,
  imagePrefix: sql3`LEFT(${products.image}, 10)`
};
var PROXY_IMAGE_RE = /\/api\/products\/[^/]+\/image/;
async function enrichProductRows(rows, origin) {
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
    const { imagePrefix: _drop, ...rest } = p;
    return { ...rest, image, hasImage };
  });
  const externalIds = enriched.filter((p) => !p.hasImage && p.image.includes("/api/products/")).map((p) => p.id);
  if (externalIds.length > 0) {
    const urlRows = await db.select({ id: products.id, image: products.image }).from(products).where(and2(
      inArray(products.id, externalIds),
      sql3`LEFT(${products.image}, 10) LIKE 'http%'`
    ));
    const urlMap = new Map(urlRows.map((r) => [r.id, r.image ?? ""]));
    for (const p of enriched) {
      const url = urlMap.get(p.id);
      if (url) {
        p.image = url;
        p.hasImage = false;
      }
    }
  }
  return enriched;
}
async function loadVendorProductsDirect(vendorId, origin) {
  const rows = await db.select(lightweightProductCols).from(products).where(eq2(products.vendorId, vendorId)).orderBy(desc2(products.createdAt));
  return enrichProductRows(rows, origin);
}
var VENDOR_ID_BY_PHONE_TTL_MS = 10 * 60 * 1e3;
var vendorIdByPhoneCache = /* @__PURE__ */ new Map();
async function resolveVendorIdByPhone(cleanPhone) {
  if (!cleanPhone) return "";
  const cached = vendorIdByPhoneCache.get(cleanPhone);
  if (cached && Date.now() - cached.ts < VENDOR_ID_BY_PHONE_TTL_MS) return cached.id;
  const [va] = await db.select({ id: vendorApplications.id }).from(vendorApplications).where(and2(
    or(
      eq2(vendorApplications.phone, cleanPhone),
      sql3`RIGHT(REPLACE(REPLACE(${vendorApplications.phone}, '+', ''), ' ', ''), 10) = ${cleanPhone}`
    ),
    or(eq2(vendorApplications.status, "APPROVED"), eq2(vendorApplications.status, "LIVE"))
  )).limit(1);
  const id = va?.id || "";
  if (id) vendorIdByPhoneCache.set(cleanPhone, { id, ts: Date.now() });
  return id;
}
var productWarmInFlight = false;
var lastProductWarmAt = 0;
function maybeWarmVendorProducts(origin) {
  if (productWarmInFlight) return;
  if (lastProductWarmAt && Date.now() - lastProductWarmAt < PRODUCT_CACHE_TTL_MS) return;
  productWarmInFlight = true;
  lastProductWarmAt = Date.now();
  void (async () => {
    try {
      const vendors3 = vendorCache ?? [];
      for (const v of vendors3) {
        if (!v?.id || getProductCache(v.id)) continue;
        try {
          const enriched = await loadVendorProductsDirect(v.id, origin);
          setProductCache(v.id, enriched);
        } catch {
        }
      }
    } finally {
      productWarmInFlight = false;
    }
  })();
}
var vendorCache = null;
var vendorCacheUpdatedAt = 0;
var VENDOR_CACHE_TTL_MS = 30 * 60 * 1e3;
async function refreshVendorCache() {
  try {
    const rows = await db.select({ ...getTableColumns(vendors), phone: vendorApplications.phone }).from(vendors).leftJoin(vendorApplications, eq2(vendorApplications.id, vendors.id)).orderBy(desc2(vendors.createdAt));
    const prevCount = vendorCache?.length ?? -1;
    vendorCache = rows;
    vendorCacheUpdatedAt = Date.now();
    if (rows.length !== prevCount) {
      console.log(`Vendor cache refreshed \u2014 ${vendorCache.length} vendors`);
    }
  } catch (e) {
    console.error("Vendor cache refresh failed:", e);
  }
}
function warmVendorCacheWithRetry(retries = 20, delay = 3e3) {
  refreshVendorCache().then(() => {
    if (!vendorCache || vendorCache.length === 0) {
      if (retries > 0) {
        setTimeout(() => warmVendorCacheWithRetry(retries - 1, Math.min(delay * 1.5, 3e4)), delay);
      }
    }
  }).catch(() => {
    if (retries > 0) {
      setTimeout(() => warmVendorCacheWithRetry(retries - 1, Math.min(delay * 1.5, 3e4)), delay);
    }
  });
}
function invalidateVendorCache() {
  vendorCache = null;
}
async function seedHomeContent() {
  try {
    const existingBanners = await db.select({ id: homeBanners.id }).from(homeBanners);
    if (existingBanners.length === 0) {
      await db.insert(homeBanners).values([
        { id: "HB001", title: "MEGA SALE", subtitle: "Up to 60% Off on Electronics, Fashion & Groceries", color: "#FF6B00", ctaText: "Shop Now", isActive: true, order: 0 },
        { id: "HB002", title: "NEW ARRIVALS", subtitle: "Discover the Latest Products from Local Stores", color: "#0B1E3D", ctaText: "Explore", isActive: true, order: 1 },
        { id: "HB003", title: "LOCAL BRANDS", subtitle: "Support Your City's Best Businesses", color: "#10B981", ctaText: "Browse Now", isActive: true, order: 2 }
      ]);
      console.log("Seeded 3 default home banners");
    }
    const existingDeals = await db.select({ id: homeDeals.id }).from(homeDeals);
    if (existingDeals.length === 0) {
      await db.insert(homeDeals).values([
        { id: "HD001", name: "Smart Watch Pro", image: "https://images.unsplash.com/photo-1546868871-7041f2a55e12?w=400", price: 1499, originalPrice: 3999, endsInHours: 24, sold: 43, total: 100, isActive: true },
        { id: "HD002", name: "Running Shoes", image: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400", price: 899, originalPrice: 2200, endsInHours: 12, sold: 67, total: 150, isActive: true },
        { id: "HD003", name: "Cotton Kurta Set", image: "https://images.unsplash.com/photo-1583391733956-6c78276477e2?w=400", price: 599, originalPrice: 1200, endsInHours: 6, sold: 28, total: 80, isActive: true },
        { id: "HD004", name: "Bluetooth Earbuds", image: "https://images.unsplash.com/photo-1588423771073-b8903fead85c?w=400", price: 699, originalPrice: 1799, endsInHours: 8, sold: 55, total: 120, isActive: true }
      ]);
      console.log("Seeded 4 default home deals");
    }
  } catch (e) {
    console.error("Failed to seed home content:", e);
  }
}
async function seedCategoriesAndSubCategories() {
  try {
    const existingCats = await db.select({ id: categories.id }).from(categories);
    if (existingCats.length === 0) {
      await db.insert(categories).values([
        { id: "1", name: "B2B", icon: "briefcase-outline", color: "#3B82F6" },
        { id: "2", name: "B2C", icon: "storefront-outline", color: "#FF6B00" },
        { id: "3", name: "Service", icon: "build-outline", color: "#8B5CF6" },
        { id: "4", name: "Manpower", icon: "people-outline", color: "#10B981" },
        { id: "5", name: "Travel", icon: "bus-outline", color: "#E11D48" }
      ]);
      console.log("[seed] Seeded 5 categories");
    }
  } catch (e) {
    console.error("[seed] Failed to seed categories:", e);
  }
  try {
    const existingSubs = await db.select({ id: subCategories.id }).from(subCategories);
    {
      const ALL_SUBS = [
        { id: "sc1", name: "Wholesale Grocery", categoryId: "1", image: "https://images.unsplash.com/photo-1542838132-92c53300491e?w=400" },
        { id: "sc2", name: "Industrial Supplies", categoryId: "1", image: "https://images.unsplash.com/photo-1504328345606-18bbc8c9d7d1?w=400" },
        { id: "sc3", name: "Office Equipment", categoryId: "1", image: "https://images.unsplash.com/photo-1468495244123-6c6c332eeece?w=400" },
        { id: "sc4", name: "Raw Materials", categoryId: "1", image: "https://images.unsplash.com/photo-1586201375761-83865001e31c?w=400" },
        { id: "sc5", name: "Food & Dining", categoryId: "2", image: "https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=400" },
        { id: "sc6", name: "Fashion & Lifestyle", categoryId: "2", image: "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=400" },
        { id: "sc7", name: "Electronics & Gadgets", categoryId: "2", image: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400" },
        { id: "sc8", name: "Health & Beauty", categoryId: "2", image: "https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=400" },
        { id: "sc9", name: "Grocery & Daily Needs", categoryId: "2", image: "https://images.unsplash.com/photo-1540420773420-3366772f4999?w=400" },
        { id: "sc10", name: "Home & Living", categoryId: "2", image: "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=400" },
        { id: "sc11", name: "Home Services", categoryId: "3", image: "https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=400" },
        { id: "sc12", name: "Beauty & Wellness", categoryId: "3", image: "https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?w=400" },
        { id: "sc13", name: "Repair & Maintenance", categoryId: "3", image: "https://images.unsplash.com/photo-1504148455328-c376907d081c?w=400" },
        { id: "sc14", name: "Professional Services", categoryId: "3", image: "https://images.unsplash.com/photo-1553877522-43269d4ea984?w=400" },
        { id: "sc15", name: "Delivery Partners", categoryId: "4", image: "https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=400" },
        { id: "sc16", name: "Skilled Workers", categoryId: "4", image: "https://images.unsplash.com/photo-1504328345606-18bbc8c9d7d1?w=400" },
        { id: "sc17", name: "Domestic Help", categoryId: "4", image: "https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=400" },
        { id: "sc18", name: "Event Staff", categoryId: "4", image: "https://images.unsplash.com/photo-1553877522-43269d4ea984?w=400" },
        { id: "sc19", name: "Packaging Materials", categoryId: "1", image: "https://images.unsplash.com/photo-1567337710282-00832b415979?w=400" },
        { id: "sc20", name: "Chemical Supplies", categoryId: "1", image: "https://images.unsplash.com/photo-1604719312566-8912e9227c6a?w=400" },
        { id: "sc21", name: "Textile Raw Materials", categoryId: "1", image: "https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=400" },
        { id: "sc22", name: "Agricultural Inputs", categoryId: "1", image: "https://images.unsplash.com/photo-1491933382434-500287f9b54b?w=400" },
        { id: "sc23", name: "Construction Materials", categoryId: "1", image: "https://images.unsplash.com/photo-1587854692152-cbe660dbde88?w=400" },
        { id: "sc24", name: "Auto Parts Wholesale", categoryId: "1", image: "https://images.unsplash.com/photo-1513542789411-b6a5d4f31634?w=400" },
        { id: "sc25", name: "Paper & Printing", categoryId: "1", image: "https://images.unsplash.com/photo-1578916171728-46686eac8d58?w=400" },
        { id: "sc26", name: "Electrical Components", categoryId: "1", image: "https://images.unsplash.com/photo-1585515320310-259814833e62?w=400" },
        { id: "sc27", name: "Plumbing Supplies Wholesale", categoryId: "1", image: "https://images.unsplash.com/photo-1513506003901-1e6a229e2d15?w=400" },
        { id: "sc28", name: "Safety Equipment", categoryId: "1", image: "https://images.unsplash.com/photo-1561136594-7f68413baa99?w=400" },
        { id: "sc29", name: "Restaurant Supplies", categoryId: "1", image: "https://images.unsplash.com/photo-1508313880080-c4bef0730395?w=400" },
        { id: "sc30", name: "Medical Equipment", categoryId: "1", image: "https://images.unsplash.com/photo-1471864190281-a93a3070b6de?w=400" },
        { id: "sc31", name: "IT Equipment Bulk", categoryId: "1", image: "https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?w=400" },
        { id: "sc32", name: "Furniture Wholesale", categoryId: "1", image: "https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=400" },
        { id: "sc33", name: "Cleaning Supplies", categoryId: "1", image: "https://images.unsplash.com/photo-1601050690597-df0568f70950?w=400" },
        { id: "sc34", name: "Handicraft Materials", categoryId: "1", image: "https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?w=400" },
        { id: "sc35", name: "Steel & Metal", categoryId: "1", image: "https://images.unsplash.com/photo-1630383249896-424e482df921?w=400" },
        { id: "sc36", name: "Plastic Products", categoryId: "1", image: "https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=400" },
        { id: "sc37", name: "Timber & Wood", categoryId: "1", image: "https://images.unsplash.com/photo-1542272604-787c3835535d?w=400" },
        { id: "sc38", name: "Gems & Jewelry Wholesale", categoryId: "1", image: "https://images.unsplash.com/photo-1594633312681-425c7b97ccd1?w=400" },
        { id: "sc39", name: "Stationery Wholesale", categoryId: "1", image: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400" },
        { id: "sc40", name: "FMCG Distribution", categoryId: "1", image: "https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?w=400" },
        { id: "sc41", name: "Pharma Wholesale", categoryId: "1", image: "https://images.unsplash.com/photo-1601784551446-20c9e07cdbdb?w=400" },
        { id: "sc42", name: "Building Hardware", categoryId: "1", image: "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=400" },
        { id: "sc43", name: "Tools & Machinery", categoryId: "1", image: "https://images.unsplash.com/photo-1584483766114-2cea6facdf57?w=400" },
        { id: "sc44", name: "Bakery & Sweets", categoryId: "2", image: "https://images.unsplash.com/photo-1618512496248-a07fe83aa8cb?w=400" },
        { id: "sc45", name: "Footwear", categoryId: "2", image: "https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?w=400" },
        { id: "sc46", name: "Toys & Games", categoryId: "2", image: "https://images.unsplash.com/photo-1586495777744-4413f21062fa?w=400" },
        { id: "sc47", name: "Books & Stationery", categoryId: "2", image: "https://images.unsplash.com/photo-1556228578-0d85b1a4d571?w=400" },
        { id: "sc48", name: "Sports & Fitness", categoryId: "2", image: "https://images.unsplash.com/photo-1584100936595-c0654b55a2e2?w=400" },
        { id: "sc49", name: "Poultry & Meat", categoryId: "2", image: "https://images.unsplash.com/photo-1587593810167-a84920ea0781?w=400" },
        { id: "sc50", name: "Flowers & Gifts", categoryId: "2", image: "https://images.unsplash.com/photo-1531346878377-a5be20888e57?w=400" },
        { id: "sc51", name: "Watches & Accessories", categoryId: "2", image: "https://images.unsplash.com/photo-1585336261022-680e295ce3fe?w=400" },
        { id: "sc52", name: "Baby & Kids", categoryId: "2", image: "https://images.unsplash.com/photo-1513364776144-60967b0f800f?w=400" },
        { id: "sc53", name: "Eyewear", categoryId: "2", image: "https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?w=400" },
        { id: "sc54", name: "Luggage & Bags", categoryId: "2", image: "https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=400" },
        { id: "sc55", name: "Musical Instruments", categoryId: "2", image: "https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=400" },
        { id: "sc56", name: "Art & Craft", categoryId: "2", image: "https://images.unsplash.com/photo-1589985270826-4b7bb135bc9d?w=400" },
        { id: "sc57", name: "Mobile Accessories", categoryId: "2", image: "https://images.unsplash.com/photo-1509440159596-0249088772ff?w=400" },
        { id: "sc58", name: "Organic & Natural", categoryId: "2", image: "https://images.unsplash.com/photo-1582722872445-44dc5f7e3c8f?w=400" },
        { id: "sc59", name: "Dry Fruits & Nuts", categoryId: "2", image: "https://images.unsplash.com/photo-1612929633738-8fe44f7ec841?w=400" },
        { id: "sc60", name: "Kitchen Appliances", categoryId: "2", image: "https://images.unsplash.com/photo-1609091839311-d5365f9ff1c5?w=400" },
        { id: "sc61", name: "Jewelry & Ornaments", categoryId: "2", image: "https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?w=400" },
        { id: "sc62", name: "Auto Accessories", categoryId: "2", image: "https://images.unsplash.com/photo-1563636619-e9143da7973b?w=400" },
        { id: "sc63", name: "Paan & Tobacco", categoryId: "2", image: "https://images.unsplash.com/photo-1583119022894-919a68a3d0e3?w=400" },
        { id: "sc64", name: "Snacks & Beverages", categoryId: "2", image: "https://images.unsplash.com/photo-1599490659213-e2b9527bd087?w=400" },
        { id: "sc65", name: "Traditional Wear", categoryId: "2", image: "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=400" },
        { id: "sc66", name: "Pooja Items", categoryId: "2", image: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400" },
        { id: "sc67", name: "Gift Articles", categoryId: "2", image: "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=400" },
        { id: "sc68", name: "Personal Care", categoryId: "2", image: "https://images.unsplash.com/photo-1526304640581-d334cdbbf45e?w=400" },
        { id: "sc69", name: "Cleaning Services", categoryId: "3", image: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=400" },
        { id: "sc70", name: "Pest Control", categoryId: "3", image: "https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?w=400" },
        { id: "sc71", name: "Interior Design", categoryId: "3", image: "https://images.unsplash.com/photo-1521737604893-d14cc237f11d?w=400" },
        { id: "sc72", name: "Photography", categoryId: "3", image: "https://images.unsplash.com/photo-1497366216548-37526070297c?w=400" },
        { id: "sc73", name: "Catering Services", categoryId: "3", image: "https://images.unsplash.com/photo-1497215842964-222b430dc094?w=400" },
        { id: "sc74", name: "Tutoring & Coaching", categoryId: "3", image: "https://images.unsplash.com/photo-1551434678-e076c223a692?w=400" },
        { id: "sc75", name: "Fitness Training", categoryId: "3", image: "https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=400" },
        { id: "sc76", name: "Astrology & Pooja", categoryId: "3", image: "https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=400" },
        { id: "sc77", name: "Travel & Tourism", categoryId: "3", image: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=400" },
        { id: "sc78", name: "Event Management", categoryId: "3", image: "https://images.unsplash.com/photo-1560179707-f14e90ef3623?w=400" },
        { id: "sc79", name: "Legal Services", categoryId: "3", image: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=400" },
        { id: "sc80", name: "Accounting & Tax", categoryId: "3", image: "https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=400" },
        { id: "sc81", name: "Healthcare Services", categoryId: "3", image: "https://images.unsplash.com/photo-1573164713988-8665fc963095?w=400" },
        { id: "sc82", name: "Pet Care", categoryId: "3", image: "https://images.unsplash.com/photo-1560472354-b33ff0c44a43?w=400" },
        { id: "sc83", name: "Courier & Logistics", categoryId: "3", image: "https://images.unsplash.com/photo-1535378917042-10a22c95931a?w=400" },
        { id: "sc84", name: "Car Wash & Detailing", categoryId: "3", image: "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=400" },
        { id: "sc85", name: "Tailoring & Alteration", categoryId: "3", image: "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=400" },
        { id: "sc86", name: "Printing & Signage", categoryId: "3", image: "https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=400" },
        { id: "sc87", name: "IT Support", categoryId: "3", image: "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=400" },
        { id: "sc88", name: "Insurance & Finance", categoryId: "3", image: "https://images.unsplash.com/photo-1518611012118-696072aa579a?w=400" },
        { id: "sc89", name: "Security Guards", categoryId: "4", image: "https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=400" },
        { id: "sc90", name: "Drivers & Chauffeurs", categoryId: "4", image: "https://images.unsplash.com/photo-1557862921-37829c790f19?w=400" },
        { id: "sc91", name: "Cooks & Chefs", categoryId: "4", image: "https://images.unsplash.com/photo-1559599101-f09722fb4948?w=400" },
        { id: "sc92", name: "Warehouse Staff", categoryId: "4", image: "https://images.unsplash.com/photo-1551836022-deb4988cc6c0?w=400" },
        { id: "sc93", name: "Construction Labour", categoryId: "4", image: "https://images.unsplash.com/photo-1550831107-1553da8c8464?w=400" },
        { id: "sc94", name: "Factory Workers", categoryId: "4", image: "https://images.unsplash.com/photo-1576091160550-2173dba999ef?w=400" },
        { id: "sc95", name: "Office Support Staff", categoryId: "4", image: "https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=400" },
        { id: "sc96", name: "AC & Refrigeration Tech", categoryId: "4", image: "https://images.unsplash.com/photo-1524178232363-1fb2b075b655?w=400" },
        { id: "sc97", name: "Welders & Fabricators", categoryId: "4", image: "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=400" },
        { id: "sc98", name: "Data Entry & Back Office", categoryId: "4", image: "https://images.unsplash.com/photo-1551024601-bec78aea704b?w=400" },
        { id: "sc99", name: "Sales & Promoters", categoryId: "4", image: "https://images.unsplash.com/photo-1563013544-824ae1b704d3?w=400" },
        { id: "sc100", name: "Packing & Logistics", categoryId: "4", image: "https://images.unsplash.com/photo-1590650153855-d9e808231d41?w=400" },
        { id: "sc101", name: "Bus Booking", categoryId: "5", image: "https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?w=400" },
        { id: "sc102", name: "Cab & Taxi", categoryId: "5", image: "https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?w=400" },
        { id: "sc103", name: "Tour Packages", categoryId: "5", image: "https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=400" },
        { id: "sc104", name: "Hotel Booking", categoryId: "5", image: "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=400" },
        { id: "sc105", name: "Tempo & Traveller", categoryId: "5", image: "https://images.unsplash.com/photo-1570125909232-eb263c188f7e?w=400" },
        { id: "sc106", name: "Pilgrimage Tours", categoryId: "5", image: "https://images.unsplash.com/photo-1548013146-72479768bada?w=400" },
        { id: "sc107", name: "Flight Booking", categoryId: "5", image: "https://images.unsplash.com/photo-1529074963764-98f45c47344b?w=400" },
        { id: "sc108", name: "Train Ticket", categoryId: "5", image: "https://images.unsplash.com/photo-1474487548417-781cb71495f3?w=400" },
        { id: "sc109", name: "Truck & Logistics", categoryId: "5", image: "https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?w=400" }
      ];
      const existingSubIds = new Set(existingSubs.map((s) => s.id));
      const toInsert = ALL_SUBS.filter((s) => !existingSubIds.has(s.id));
      if (toInsert.length > 0) {
        await db.insert(subCategories).values(toInsert);
        console.log(`[seed] Seeded ${toInsert.length} sub-categories`);
      }
    }
  } catch (e) {
    console.error("[seed] Failed to seed sub-categories:", e);
  }
}
async function seedWithRetry(fn, label, retries = 10, delay = 4e3) {
  for (let i = 0; i <= retries; i++) {
    try {
      await fn();
      return;
    } catch (e) {
      if (i < retries) {
        console.warn(`[seed-retry] ${label} failed (attempt ${i + 1}), retrying in ${delay}ms\u2026`);
        await new Promise((r) => setTimeout(r, delay));
        delay = Math.min(delay * 1.5, 3e4);
      } else {
        console.error(`[seed-retry] ${label} failed after ${retries + 1} attempts:`, e);
      }
    }
  }
}
async function registerRoutes(app2) {
  seedWithRetry(seedFeatureFlags, "seedFeatureFlags");
  seedWithRetry(seedHomeContent, "seedHomeContent");
  seedWithRetry(seedCategoriesAndSubCategories, "seedCategoriesAndSubCategories");
  warmVendorCacheWithRetry();
  setInterval(() => {
    refreshVendorCache();
  }, VENDOR_CACHE_TTL_MS);
  void db.execute(sql3`
    CREATE TABLE IF NOT EXISTS coin_transactions (
      id VARCHAR(64) PRIMARY KEY,
      user_id VARCHAR(64) NOT NULL,
      type VARCHAR(20) NOT NULL,
      amount INTEGER NOT NULL,
      reference TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `).then(() => db.execute(sql3`
    CREATE INDEX IF NOT EXISTS idx_coin_transactions_user_id ON coin_transactions(user_id)
  `)).catch((e) => console.error("[STARTUP] coin_transactions table creation failed:", e.message));
  void db.execute(sql3`
    CREATE INDEX IF NOT EXISTS idx_vendor_apps_phone ON vendor_applications (phone)
  `).then(() => db.execute(sql3`
    CREATE INDEX IF NOT EXISTS idx_vendor_apps_phone_norm ON vendor_applications ((RIGHT(REPLACE(REPLACE(phone, '+', ''), ' ', ''), 10)))
  `)).catch((e) => console.error("[STARTUP] vendor_applications phone index creation failed:", e.message));
  void (async () => {
    try {
      const [sayyed] = await db.select().from(teamMembers).where(eq2(teamMembers.id, "TMOZH6A2"));
      if (sayyed && sayyed.phone === "+918007175176") {
        await db.update(teamMembers).set({ phone: "+918007175476" }).where(eq2(teamMembers.id, "TMOZH6A2"));
        cache.invalidate("team_members");
        console.log("[MIGRATION] Fixed Sayyed Parvez phone: +918007175176 \u2192 +918007175476");
      }
    } catch (e) {
      console.error("[MIGRATION] Failed to fix Sayyed Parvez phone:", e);
    }
    try {
      let _haversineKm2 = function(lat1, lng1, lat2, lng2) {
        const R = 6371, dLat = (lat2 - lat1) * Math.PI / 180, dLng = (lng2 - lng1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      };
      var _haversineKm = _haversineKm2;
      const MALEGAON_CENTER = { lat: 20.5547, lng: 74.5247 };
      const SERVICE_AREA_KM = 50;
      const coordFixes = [
        { id: "VA09W9BP", lat: 20.558424, lng: 74.531305 },
        { id: "VA2NDBHM", lat: 20.570816, lng: 74.546795 },
        { id: "VA5411MM", lat: 20.55776, lng: 74.530475 },
        { id: "VA5IRMQ7", lat: 20.564912, lng: 74.535515 },
        { id: "VA5JE2QX", lat: 20.546072, lng: 74.515865 },
        { id: "VA6H9NEF", lat: 20.562044, lng: 74.53193 },
        { id: "VA70HY86", lat: 20.55398, lng: 74.52185 },
        { id: "VA8RV79Z", lat: 20.567628, lng: 74.53891 },
        // VAF6YOPO (Malegaon opticals, near Mushaarat chowk): was stacked with VAJS72I6
        { id: "VAF6YOPO", lat: 20.56601, lng: 74.54025, wrongLat: 20.566248, wrongLng: 74.541085 },
        // VAFM72FB (FOZAIL AUTO GARAGE, Agra road): was stacked with VAPLO1SB
        { id: "VAFM72FB", lat: 20.5725, lng: 74.54388, wrongLat: 20.571988, wrongLng: 74.54436 },
        { id: "VAFOQP9M", lat: 20.535756, lng: 74.54907 },
        { id: "VAINZBZH", lat: 20.56776, lng: 74.542975 },
        // VAJS72I6 (Master Hajj Umrah Tours, Abbas nagar): was stacked with VAF6YOPO
        { id: "VAJS72I6", lat: 20.56668, lng: 74.54205, wrongLat: 20.566328, wrongLng: 74.541185 },
        { id: "VAP9GY9M", lat: 20.5638, lng: 74.534125 },
        // VAPLO1SB (Ajmal perfumes, Best IT square Agra road): was stacked with VAFM72FB
        { id: "VAPLO1SB", lat: 20.5712, lng: 74.5449, wrongLat: 20.571984, wrongLng: 74.544355 },
        { id: "VAQ629PF", lat: 20.561316, lng: 74.53102 },
        { id: "VAQA0ZW5", lat: 20.55782, lng: 74.52336 },
        { id: "VAR682C8", lat: 20.55096, lng: 74.521975 },
        { id: "VAWMA5S1", lat: 20.543388, lng: 74.51251 },
        { id: "VAYCH2CH", lat: 20.57052, lng: 74.546425 },
        { id: "VAZFPWD4", lat: 20.53732, lng: 74.501025 },
        { id: "VAZJ3ZNN", lat: 20.56528, lng: 74.539875 },
        // Vendors whose addresses are too vague for Nominatim — assigned approximate Malegaon neighbourhood coords
        { id: "VAEPHP1F", lat: 20.55984, lng: 74.53612 },
        // Go assure: Near D mart (Agra road)
        { id: "VAF2DFAS", lat: 20.55762, lng: 74.53085 },
        // Malegaon riksha: Kamal pura
        { id: "VA34CA8K", lat: 20.56344, lng: 74.53426 },
        // Majestic Perfumes: Naya pura
        { id: "VASG3JQZ", lat: 20.55308, lng: 74.53176 },
        // Iqbal Zaika: Chandanpuri gate
        { id: "VARXEEK8", lat: 20.54556, lng: 74.52234 },
        // Chinya Super Chinese: near Latifya masjid
        { id: "VAF47WGO", lat: 20.55624, lng: 74.52914 },
        // ZH Diaper Hub: near Noor hospital
        { id: "VA6CPBIM", lat: 20.56398, lng: 74.5354 },
        // Hadi tours: Naya pura gali 9
        { id: "VA2W6VHJ", lat: 20.55134, lng: 74.52788 },
        // Aabid Soda: Hazar kholi
        // 3 vendors still stuck at exact default center — Nominatim could not geocode from their vague addresses
        { id: "VA8GH63Q", lat: 20.5554, lng: 74.526 },
        // UNIQUE KIDS MALL: Bhawsar gali (central)
        { id: "VAF6IS1W", lat: 20.5492, lng: 74.5205 },
        // Jockey: Viraj plaza, Satana road Mausam Pool
        { id: "VACTZHV3", lat: 20.5515, lng: 74.5222 }
        // Shree Paras: Satana road near tehsil
      ];
      for (const fix of coordFixes) {
        const [v] = await db.select({ id: vendors.id, lat: vendors.lat, lng: vendors.lng }).from(vendors).where(eq2(vendors.id, fix.id));
        if (!v) continue;
        const curLat = parseFloat(v.lat) || 0;
        const curLng = parseFloat(v.lng) || 0;
        const isExactDefault = Math.abs(curLat - MALEGAON_CENTER.lat) < 1e-4 && Math.abs(curLng - MALEGAON_CENTER.lng) < 1e-4;
        const isOutOfArea = !curLat || !curLng || _haversineKm2(curLat, curLng, MALEGAON_CENTER.lat, MALEGAON_CENTER.lng) > SERVICE_AREA_KM;
        const isAtWrongPos = fix.wrongLat !== void 0 && fix.wrongLng !== void 0 && Math.abs(curLat - fix.wrongLat) < 5e-4 && Math.abs(curLng - fix.wrongLng) < 5e-4;
        if (isExactDefault || isOutOfArea || isAtWrongPos) {
          await db.update(vendors).set({ lat: fix.lat, lng: fix.lng }).where(eq2(vendors.id, fix.id));
          console.log(`[MIGRATION] Spread vendor ${fix.id} to (${fix.lat}, ${fix.lng})`);
        }
      }
    } catch (e) {
      console.error("[MIGRATION] Failed to fix vendor locations:", e);
    }
    try {
      let _haversineSync2 = function(lat1, lng1, lat2, lng2) {
        const R = 6371, dLat = (lat2 - lat1) * Math.PI / 180, dLng = (lng2 - lng1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      };
      var _haversineSync = _haversineSync2;
      const _MALEGAON_LAT = 20.5547, _MALEGAON_LNG = 74.5247, _MAX_KM = 50;
      const apps = await db.select({
        id: vendorApplications.id,
        latitude: vendorApplications.latitude,
        longitude: vendorApplications.longitude
      }).from(vendorApplications);
      let locationsSynced = 0;
      for (const app3 of apps) {
        const appLat = app3.latitude ? parseFloat(String(app3.latitude)) : 0;
        const appLng = app3.longitude ? parseFloat(String(app3.longitude)) : 0;
        if (!appLat || !appLng || Math.abs(appLat) < 1e-3 || Math.abs(appLng) < 1e-3) continue;
        if (appLat < 5 || appLat > 38 || appLng < 65 || appLng > 100) continue;
        const [vendor] = await db.select({ id: vendors.id, lat: vendors.lat, lng: vendors.lng }).from(vendors).where(eq2(vendors.id, app3.id));
        if (!vendor) continue;
        const curLat = parseFloat(String(vendor.lat)) || 0;
        const curLng = parseFloat(String(vendor.lng)) || 0;
        if (Math.abs(curLat - appLat) > 1e-4 || Math.abs(curLng - appLng) > 1e-4) {
          await db.update(vendors).set({ lat: appLat, lng: appLng }).where(eq2(vendors.id, app3.id));
          locationsSynced++;
        }
      }
      if (locationsSynced > 0) console.log(`[MIGRATION] Synced ${locationsSynced} vendor locations from applications`);
    } catch (e) {
      console.error("[MIGRATION] Failed to sync vendor locations from applications:", e);
    }
    try {
      let _haversineLink2 = function(la1, lo1, la2, lo2) {
        const R = 6371, dLa = (la2 - la1) * Math.PI / 180, dLo = (lo2 - lo1) * Math.PI / 180;
        const a = Math.sin(dLa / 2) ** 2 + Math.cos(la1 * Math.PI / 180) * Math.cos(la2 * Math.PI / 180) * Math.sin(dLo / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      };
      var _haversineLink = _haversineLink2;
      const _MAL_LAT2 = 20.5547, _MAL_LNG2 = 74.5247, _MAX_KM2 = 50;
      const appsWithLinks = await db.select({
        id: vendorApplications.id,
        locationLink: vendorApplications.locationLink,
        latitude: vendorApplications.latitude,
        longitude: vendorApplications.longitude
      }).from(vendorApplications).where(sql3`${vendorApplications.locationLink} IS NOT NULL AND ${vendorApplications.locationLink} != ''`);
      const toResolve = appsWithLinks.filter((a) => {
        const lat = a.latitude ? parseFloat(String(a.latitude)) : 0;
        const lng = a.longitude ? parseFloat(String(a.longitude)) : 0;
        return !lat || !lng || Math.abs(lat) < 1e-3 || Math.abs(lng) < 1e-3;
      });
      if (toResolve.length > 0) {
        console.log(`[LINK-RESOLVE] ${toResolve.length} applications with locationLink but no coords \u2014 resolving...`);
        let resolved = 0;
        for (const app3 of toResolve) {
          try {
            const coords = await resolveMapLinkToCoords(app3.locationLink);
            if (!coords) continue;
            await db.update(vendorApplications).set({ latitude: coords.lat, longitude: coords.lng }).where(eq2(vendorApplications.id, app3.id));
            await db.update(vendors).set({ lat: coords.lat, lng: coords.lng }).where(eq2(vendors.id, app3.id));
            console.log(`[LINK-RESOLVE] ${app3.id} \u2192 (${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}) from link`);
            resolved++;
          } catch {
          }
          await new Promise((r) => setTimeout(r, 500));
        }
        if (resolved > 0) console.log(`[LINK-RESOLVE] Resolved ${resolved} vendor locations from stored location links`);
      }
    } catch (e) {
      console.error("[LINK-RESOLVE] Migration failed:", e);
    }
    try {
      const INDIA_LAT_MIN = 5, INDIA_LAT_MAX = 38, INDIA_LNG_MIN = 65, INDIA_LNG_MAX = 100;
      const DEFAULT_LAT = 20.5547, DEFAULT_LNG = 74.5247;
      const badCoordVendors = await db.select({ id: vendors.id, lat: vendors.lat, lng: vendors.lng }).from(vendors);
      let resetCount = 0;
      for (const v of badCoordVendors) {
        const lat = parseFloat(String(v.lat ?? "0"));
        const lng = parseFloat(String(v.lng ?? "0"));
        if (!isNaN(lat) && !isNaN(lng) && (lat !== 0 || lng !== 0)) {
          const outsideIndia = lat < INDIA_LAT_MIN || lat > INDIA_LAT_MAX || lng < INDIA_LNG_MIN || lng > INDIA_LNG_MAX;
          if (outsideIndia) {
            await db.update(vendors).set({ lat: DEFAULT_LAT, lng: DEFAULT_LNG }).where(eq2(vendors.id, v.id));
            await db.update(vendorApplications).set({ latitude: null, longitude: null }).where(and2(eq2(vendorApplications.id, v.id), sql3`(${vendorApplications.latitude} < 5 OR ${vendorApplications.latitude} > 38 OR ${vendorApplications.longitude} < 65 OR ${vendorApplications.longitude} > 100)`));
            console.log(`[COORD-RESET] Vendor ${v.id} had invalid coords (${lat.toFixed(2)}, ${lng.toFixed(2)}) \u2014 reset vendor + application for re-geocoding`);
            resetCount++;
          }
        }
      }
      if (resetCount > 0) console.log(`[COORD-RESET] Reset ${resetCount} vendor(s) with non-India coordinates`);
    } catch (e) {
      console.error("[COORD-RESET] Failed:", e);
    }
    try {
      let _haversineGeo2 = function(la1, lo1, la2, lo2) {
        const R = 6371, dLa = (la2 - la1) * Math.PI / 180, dLo = (lo2 - lo1) * Math.PI / 180;
        const a = Math.sin(dLa / 2) ** 2 + Math.cos(la1 * Math.PI / 180) * Math.cos(la2 * Math.PI / 180) * Math.sin(dLo / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      };
      var _haversineGeo = _haversineGeo2;
      const DEFAULT_LAT = 20.5547, DEFAULT_LNG = 74.5247, GEOCODE_MAX_KM = 20;
      const defaultVendors = await db.select({ id: vendors.id, lat: vendors.lat, lng: vendors.lng }).from(vendors).where(
        and2(
          sql3`ABS(${vendors.lat}::numeric - ${DEFAULT_LAT}) < 0.0002`,
          sql3`ABS(${vendors.lng}::numeric - ${DEFAULT_LNG}) < 0.0002`
        )
      );
      if (defaultVendors.length > 0) {
        console.log(`[GEOCODE] ${defaultVendors.length} vendors at default center \u2014 attempting geocoding`);
        for (const v of defaultVendors) {
          const [app3] = await db.select({ address: vendorApplications.address, city: vendorApplications.city }).from(vendorApplications).where(eq2(vendorApplications.id, v.id));
          if (!app3?.address) continue;
          const locationStr = [app3.address, app3.city, "India"].filter(Boolean).join(", ");
          const query = encodeURIComponent(locationStr);
          try {
            await new Promise((r) => setTimeout(r, 1100));
            const resp = await fetch(`https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1&countrycodes=in`, {
              headers: { "User-Agent": "GoBharat/1.0 (gobharat.in)" }
            });
            if (!resp.ok) continue;
            const results = await resp.json();
            if (!results.length) continue;
            const geoLat = parseFloat(results[0].lat), geoLng = parseFloat(results[0].lon);
            if (!isNaN(geoLat) && !isNaN(geoLng) && Math.abs(geoLat) > 1e-3 && Math.abs(geoLng) > 1e-3) {
              await db.update(vendors).set({ lat: geoLat, lng: geoLng }).where(eq2(vendors.id, v.id));
              console.log(`[GEOCODE] ${v.id} \u2192 (${geoLat.toFixed(4)}, ${geoLng.toFixed(4)}) via "${locationStr}"`);
            }
          } catch (fe) {
          }
        }
      }
    } catch (ge) {
      console.error("[GEOCODE] Migration failed:", ge);
    }
    try {
      const allVendors = await db.select({ id: vendors.id, franchiseId: vendors.franchiseId }).from(vendors);
      let synced = 0;
      for (const v of allVendors) {
        if (!v.franchiseId) continue;
        const [app3] = await db.select({ id: vendorApplications.id, franchiseId: vendorApplications.franchiseId }).from(vendorApplications).where(eq2(vendorApplications.id, v.id));
        if (app3 && !app3.franchiseId) {
          await db.update(vendorApplications).set({ franchiseId: v.franchiseId }).where(eq2(vendorApplications.id, v.id));
          synced++;
        }
      }
      if (synced > 0) console.log(`[MIGRATION] Synced franchise_id to ${synced} vendor application(s)`);
    } catch (e) {
      console.error("[MIGRATION] Failed to sync franchise_id to vendor applications:", e);
    }
    try {
      const genericNames = ["user", "marketing executive", "executive", ""];
      const badApps = await db.select({ id: vendorApplications.id, franchiseId: vendorApplications.franchiseId, submittedBy: vendorApplications.submittedBy }).from(vendorApplications).where(sql3`LOWER(TRIM(${vendorApplications.submittedBy})) = ANY(ARRAY['user','marketing executive','executive',''])`);
      let fixedCount = 0;
      for (const app3 of badApps) {
        if (!app3.franchiseId) continue;
        const cleanFranchiseId = app3.franchiseId.replace(/\D/g, "").slice(-10);
        const marketingExecs = await db.select({ name: teamMembers.name }).from(teamMembers).where(
          and2(
            sql3`RIGHT(REGEXP_REPLACE(${teamMembers.franchiseId}, '[^0-9]', '', 'g'), 10) = ${cleanFranchiseId}`,
            eq2(teamMembers.role, "MARKETING"),
            eq2(teamMembers.status, "ACTIVE")
          )
        );
        if (marketingExecs.length === 1 && marketingExecs[0].name) {
          await db.update(vendorApplications).set({ submittedBy: marketingExecs[0].name }).where(eq2(vendorApplications.id, app3.id));
          console.log(`[MIGRATION] Fixed submittedBy for application ${app3.id}: '${app3.submittedBy}' \u2192 '${marketingExecs[0].name}'`);
          fixedCount++;
        }
      }
      if (fixedCount > 0) console.log(`[MIGRATION] Fixed submittedBy on ${fixedCount} vendor application(s)`);
    } catch (e) {
      console.error("[MIGRATION] Failed to fix submittedBy on vendor applications:", e);
    }
    try {
      const activeFranchises = await db.select({ phone: teamMembers.phone, pinCode: teamMembers.pinCode }).from(teamMembers).where(and2(eq2(teamMembers.role, "FRANCHISE"), eq2(teamMembers.status, "ACTIVE")));
      const pinToFranchise = new Map(
        activeFranchises.filter((f) => f.pinCode?.trim()).map((f) => [f.pinCode.trim(), f.phone.replace(/\D/g, "").slice(-10)])
      );
      if (pinToFranchise.size > 0) {
        const appsWithPin = await db.select({ id: vendorApplications.id, pinCode: vendorApplications.pinCode, franchiseId: vendorApplications.franchiseId }).from(vendorApplications).where(sql3`pin_code IS NOT NULL AND pin_code != ''`);
        let reroutedCount = 0;
        for (const app3 of appsWithPin) {
          if (!app3.pinCode?.trim()) continue;
          const correctFranchiseId = pinToFranchise.get(app3.pinCode.trim()) ?? "";
          const currentNorm = (app3.franchiseId || "").replace(/\D/g, "").slice(-10);
          if (currentNorm !== correctFranchiseId) {
            await db.update(vendorApplications).set({ franchiseId: correctFranchiseId }).where(eq2(vendorApplications.id, app3.id));
            reroutedCount++;
          }
        }
        if (reroutedCount > 0) console.log(`[MIGRATION] Re-routed ${reroutedCount} application(s) to correct franchise owners by pin code`);
      }
    } catch (e) {
      console.error("[MIGRATION] Failed to re-route applications by pin code:", e);
    }
    try {
      const allMembers = await db.select().from(teamMembers);
      const franchiseOwners = allMembers.filter((m) => m.role === "FRANCHISE" && m.status === "ACTIVE");
      const needsBackfill = allMembers.filter(
        (m) => (m.role === "MARKETING" || m.role === "DELIVERY") && (!m.franchiseId || m.franchiseId.trim() === "") && m.createdByRole === "FRANCHISE" && m.createdBy && m.createdBy.trim() !== ""
      );
      let backfilled = 0;
      for (const member of needsBackfill) {
        const createdByLower = member.createdBy.trim().toLowerCase();
        const owner = franchiseOwners.find(
          (fo) => fo.name.trim().toLowerCase() === createdByLower
        );
        if (!owner) continue;
        const ownerPhone = owner.phone.replace(/\D/g, "").slice(-10);
        if (!ownerPhone) continue;
        await db.update(teamMembers).set({ franchiseId: ownerPhone }).where(eq2(teamMembers.id, member.id));
        backfilled++;
      }
      cache.invalidate("team_members");
      if (backfilled > 0) console.log(`[MIGRATION] Backfilled franchise_id for ${backfilled} team member(s)`);
    } catch (e) {
      console.error("[MIGRATION] Failed to backfill team member franchise_id:", e);
    }
    try {
      const membersNeedingFranchise = await db.select({ id: teamMembers.id, name: teamMembers.name }).from(teamMembers).where(and2(
        sql3`role IN ('MARKETING', 'DELIVERY')`,
        sql3`(franchise_id IS NULL OR franchise_id = '')`
      ));
      if (membersNeedingFranchise.length > 0) {
        let appChainBackfilled = 0;
        for (const member of membersNeedingFranchise) {
          const nameLower = member.name.trim().toLowerCase();
          const [appRow] = await db.select({ franchiseId: vendorApplications.franchiseId }).from(vendorApplications).where(sql3`LOWER(TRIM(submitted_by)) = ${nameLower} AND franchise_id IS NOT NULL AND franchise_id <> ''`).limit(1);
          if (!appRow?.franchiseId) continue;
          const derivedFranchiseId = appRow.franchiseId.replace(/\D/g, "").slice(-10);
          if (!derivedFranchiseId) continue;
          await db.update(teamMembers).set({ franchiseId: derivedFranchiseId }).where(eq2(teamMembers.id, member.id));
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
    try {
      const allMembersForApps = await db.select({ id: teamMembers.id, name: teamMembers.name, franchiseId: teamMembers.franchiseId, role: teamMembers.role }).from(teamMembers);
      const submitterToFranchise = /* @__PURE__ */ new Map();
      for (const m of allMembersForApps) {
        if ((m.role === "MARKETING" || m.role === "DELIVERY") && m.franchiseId && m.franchiseId.trim()) {
          submitterToFranchise.set(m.name.trim().toLowerCase(), m.franchiseId.replace(/\D/g, "").slice(-10));
        }
      }
      const franchiseOwnersForPins = await db.select({ pinCode: teamMembers.pinCode }).from(teamMembers).where(and2(eq2(teamMembers.role, "FRANCHISE"), eq2(teamMembers.status, "ACTIVE")));
      const knownPins = new Set(franchiseOwnersForPins.map((fo) => fo.pinCode?.trim()).filter(Boolean));
      const appsNeedingFranchise = await db.select({ id: vendorApplications.id, franchiseId: vendorApplications.franchiseId, pinCode: vendorApplications.pinCode, submittedBy: vendorApplications.submittedBy }).from(vendorApplications).where(sql3`(franchise_id IS NULL OR franchise_id = '')`);
      let appBackfilled = 0;
      for (const app3 of appsNeedingFranchise) {
        if (!app3.submittedBy?.trim()) continue;
        const appPin = app3.pinCode?.trim() || "";
        if (appPin && knownPins.has(appPin)) continue;
        const franchisePhone = submitterToFranchise.get(app3.submittedBy.trim().toLowerCase());
        if (!franchisePhone) continue;
        await db.update(vendorApplications).set({ franchiseId: franchisePhone }).where(eq2(vendorApplications.id, app3.id));
        appBackfilled++;
      }
      if (appBackfilled > 0) console.log(`[MIGRATION] Backfilled franchise_id for ${appBackfilled} vendor application(s) via submitter chain`);
    } catch (e) {
      console.error("[MIGRATION] Failed to backfill application franchise_id via submitter chain:", e);
    }
    try {
      const namedVendors = [
        { id: "VA34CA8K", name: "MAJESTIC PERFUMES", description: "Premium fragrances and perfumes", categoryId: "2", subCategoryId: "sc8", address: "Naya Pura, Malegaon", lat: 20.56344, lng: 74.53426, rating: 4.4 },
        { id: "VASG3JQZ", name: "IQBAL ZAIKA", description: "Authentic Mughlai and local cuisine", categoryId: "2", subCategoryId: "sc5", address: "Chandanpuri Gate, Malegaon", lat: 20.55308, lng: 74.53176, rating: 4.3 },
        { id: "VARXEEK8", name: "CHINYA SUPER CHINESE", description: "Chinese and Indo-Chinese cuisine", categoryId: "2", subCategoryId: "sc5", address: "Near Latifya Masjid, Malegaon", lat: 20.54556, lng: 74.52234, rating: 4.1 },
        { id: "VAF47WGO", name: "ZH DIAPER HUB", description: "Baby and diaper care products", categoryId: "2", subCategoryId: "sc52", address: "Near Noor Hospital, Malegaon", lat: 20.55624, lng: 74.52914, rating: 4.2 },
        { id: "VA6CPBIM", name: "HADI TOURS", description: "Travel packages and tour bookings", categoryId: "5", subCategoryId: "sc103", address: "Naya Pura Gali 9, Malegaon", lat: 20.56398, lng: 74.5354, deliveryTime: "On Request", rating: 4.5 },
        { id: "VA2W6VHJ", name: "AABID SODA", description: "Cold drinks and refreshing beverages", categoryId: "2", subCategoryId: "sc64", address: "Hazar Kholi, Malegaon", lat: 20.55134, lng: 74.52788, rating: 4 },
        { id: "VA8GH63Q", name: "UNIQUE KIDS MALL", description: "Toys, games and kids accessories", categoryId: "2", subCategoryId: "sc46", address: "Bhawsar Gali, Malegaon", lat: 20.5554, lng: 74.526, rating: 4.2 },
        { id: "VAF6IS1W", name: "JOCKEY", description: "Premium innerwear and sportswear", categoryId: "2", subCategoryId: "sc6", address: "Viraj Plaza, Satana Road, Malegaon", lat: 20.5492, lng: 74.5205, rating: 4.6 },
        { id: "VAEPHP1F", name: "GO ASSURE", description: "Insurance and financial services", categoryId: "3", subCategoryId: "sc14", address: "Near D Mart, Agra Road, Malegaon", lat: 20.55984, lng: 74.53612, deliveryTime: "By Appointment", rating: 4.3 },
        { id: "VAF2DFAS", name: "MALEGAON RIKSHA", description: "Local auto-rickshaw and cab services", categoryId: "5", subCategoryId: "sc102", address: "Kamal Pura, Malegaon", lat: 20.55762, lng: 74.53085, deliveryTime: "On Demand", rating: 4.1 },
        { id: "VAF6YOPO", name: "MALEGAON OPTICALS", description: "Eyewear, spectacles and contact lenses", categoryId: "2", subCategoryId: "sc53", address: "Near Mushaarat Chowk, Malegaon", lat: 20.56601, lng: 74.54025, rating: 4.4 },
        { id: "VAJS72I6", name: "MASTER HAJJ UMRAH TOURS", description: "Hajj and Umrah pilgrimage packages", categoryId: "5", subCategoryId: "sc106", address: "Abbas Nagar, Malegaon", lat: 20.56668, lng: 74.54205, deliveryTime: "On Request", rating: 4.7 },
        { id: "VAPLO1SB", name: "AJMAL PERFUMES", description: "Premium Arabian and international fragrances", categoryId: "2", subCategoryId: "sc8", address: "Best IT Square, Agra Road, Malegaon", lat: 20.5712, lng: 74.5449, rating: 4.5 },
        { id: "VAFM72FB", name: "FOZAIL AUTO GARAGE", description: "Vehicle repair and maintenance", categoryId: "3", subCategoryId: "sc13", address: "Agra Road, Malegaon", lat: 20.5725, lng: 74.54388, deliveryTime: "Same Day", rating: 4.2 },
        { id: "VACTZHV3", name: "SHREE PARAS", description: "Fashion and lifestyle products", categoryId: "2", subCategoryId: "sc6", address: "Satana Road, Near Tehsil, Malegaon", lat: 20.5515, lng: 74.5222, rating: 4.3 }
      ];
      let vendorsSeedCount = 0;
      for (const v of namedVendors) {
        const [existing] = await db.select({ id: vendors.id }).from(vendors).where(eq2(vendors.id, v.id)).limit(1);
        if (!existing) {
          await db.insert(vendors).values({
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
            franchiseId: ""
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
    try {
      const seedSets = [
        {
          vendorId: "VA001DEV",
          products: [
            { id: "va001dev-p1", name: "Basmati Rice (1kg)", description: "Premium long-grain basmati rice", price: 120, image: "https://images.unsplash.com/photo-1536304929831-ee1ca9d44906?w=400", category: "Rice & Grains" },
            { id: "va001dev-p2", name: "Whole Wheat Atta (5kg)", description: "Stone-ground whole wheat flour", price: 220, image: "https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?w=400", category: "Flour" },
            { id: "va001dev-p3", name: "Sugar (1kg)", description: "Pure refined white sugar", price: 50, image: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400", category: "Essentials" },
            { id: "va001dev-p4", name: "Toor Dal (500g)", description: "Premium yellow lentils", price: 85, image: "https://images.unsplash.com/photo-1604329760661-e71dc83f8f26?w=400", category: "Dal & Pulses" },
            { id: "va001dev-p5", name: "Sunflower Oil (1L)", description: "Pure refined sunflower cooking oil", price: 165, image: "https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=400", category: "Oils" },
            { id: "va001dev-p6", name: "Iodized Salt (1kg)", description: "Free flow iodized salt", price: 25, image: "https://images.unsplash.com/photo-1550989460-0adf9ea622e2?w=400", category: "Essentials" }
          ]
        },
        {
          vendorId: "VA002DEV",
          products: [
            { id: "va002dev-p1", name: "Fresh Mutton (500g)", description: "Fresh halal mutton, bone-in", price: 350, image: "https://images.unsplash.com/photo-1529692236671-f1f6cf9683ba?w=400", category: "Mutton" },
            { id: "va002dev-p2", name: "Fresh Chicken (500g)", description: "Farm-fresh halal chicken", price: 180, image: "https://images.unsplash.com/photo-1604503468506-a8da13d82791?w=400", category: "Chicken" },
            { id: "va002dev-p3", name: "Mutton Keema (500g)", description: "Fresh minced mutton, lean", price: 380, image: "https://images.unsplash.com/photo-1547592180-85f173990554?w=400", category: "Mutton" },
            { id: "va002dev-p4", name: "Chicken Tikka (250g)", description: "Marinated ready-to-cook chicken tikka", price: 220, image: "https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?w=400", category: "Chicken" },
            { id: "va002dev-p5", name: "Mutton Ribs (500g)", description: "Tender mutton ribs for biryani", price: 320, image: "https://images.unsplash.com/photo-1529692236671-f1f6cf9683ba?w=400", category: "Mutton" }
          ]
        },
        {
          vendorId: "VA34CA8K",
          products: [
            { id: "va34ca8k-p1", name: "Oud Majestic EDP (50ml)", description: "Rich oriental oud-based fragrance", price: 1299, image: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400", category: "Perfume" },
            { id: "va34ca8k-p2", name: "Rose Musk EDP (50ml)", description: "Soft floral rose and musk blend", price: 899, image: "https://images.unsplash.com/photo-1541643600914-78b084683702?w=400", category: "Perfume" },
            { id: "va34ca8k-p3", name: "Attar Al Majestic (10ml)", description: "Pure concentrated attar, alcohol-free", price: 499, image: "https://images.unsplash.com/photo-1587017539504-67cfbddac569?w=400", category: "Attar" },
            { id: "va34ca8k-p4", name: "Floral Body Splash (150ml)", description: "Refreshing floral body mist", price: 299, image: "https://images.unsplash.com/photo-1544161515-4ab6ce6db874?w=400", category: "Body Mist" }
          ]
        },
        {
          vendorId: "VASG3JQZ",
          products: [
            { id: "vasg3jqz-p1", name: "Chicken Biryani", description: "Aromatic basmati rice with tender chicken", price: 180, image: "https://images.unsplash.com/photo-1563379091339-03246963d551?w=400", category: "Biryani" },
            { id: "vasg3jqz-p2", name: "Mutton Seekh Kebab (4 pcs)", description: "Juicy minced mutton kebabs", price: 120, image: "https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?w=400", category: "Kebabs" },
            { id: "vasg3jqz-p3", name: "Haleem (250g)", description: "Slow-cooked wheat and mutton porridge", price: 90, image: "https://images.unsplash.com/photo-1547592180-85f173990554?w=400", category: "Specials" }
          ]
        }
      ];
      let productsSeedCount = 0;
      for (const { vendorId, products: products3 } of seedSets) {
        const [{ count }] = await db.select({ count: sql3`count(*)::int` }).from(products).where(eq2(products.vendorId, vendorId));
        if (count > 0) continue;
        for (const p of products3) {
          await db.insert(products).values({ ...p, vendorId, isAvailable: true }).onConflictDoNothing();
          productsSeedCount++;
        }
      }
      if (productsSeedCount > 0) console.log(`[MIGRATION] Seeded ${productsSeedCount} sample product(s) for key vendors`);
    } catch (e) {
      console.error("[MIGRATION] Failed to seed sample products:", e);
    }
    try {
      const blobProducts = await db.select({ id: products.id }).from(products).where(sql3`${products.image} LIKE 'blob:%'`);
      if (blobProducts.length > 0) {
        await db.update(products).set({ image: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400" }).where(sql3`${products.image} LIKE 'blob:%'`);
        console.log(`[MIGRATION] Fixed ${blobProducts.length} product(s) with invalid blob URL images`);
      }
    } catch (e) {
      console.error("[MIGRATION] Failed to fix blob URL product images:", e);
    }
    try {
      const staleResult = await db.execute(sql3`
      DELETE FROM products
      WHERE id = ANY(ARRAY[
        'vasg3jqz-p1','vasg3jqz-p2','vasg3jqz-p3',
        'vaplo1sb-p1','vaplo1sb-p2','vaplo1sb-p3'
      ]::text[])
      RETURNING id
    `);
      const removedCount = staleResult.rows?.length ?? 0;
      if (removedCount > 0) {
        console.log(`[MIGRATION] Removed ${removedCount} resurrected demo product(s) that vendors had deleted`);
      }
    } catch (e) {
      console.error("[MIGRATION] Failed to clean up stale seeded products:", e);
    }
    try {
      await db.execute(sql3`
      ALTER TABLE transactions
        ADD COLUMN IF NOT EXISTS gateway_transaction_id VARCHAR(64)
    `);
      await db.execute(sql3`
      CREATE INDEX IF NOT EXISTS idx_transactions_gateway_txn_id
        ON transactions (gateway_transaction_id)
    `);
    } catch (e) {
      console.error("[MIGRATION] Failed to add gateway_transaction_id column:", e);
    }
    try {
      await db.execute(sql3`
      ALTER TABLE vendors
        ADD COLUMN IF NOT EXISTS payment_qr_url TEXT
    `);
    } catch (e) {
      console.error("[MIGRATION] Failed to add payment_qr_url column:", e);
    }
    try {
      await db.execute(sql3`
      ALTER TABLE vendors
        ADD COLUMN IF NOT EXISTS upi_id VARCHAR(100)
    `);
    } catch (e) {
      console.error("[MIGRATION] Failed to add upi_id column:", e);
    }
    try {
      await db.execute(sql3`
      ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS payment_method VARCHAR(20)
    `);
    } catch (e) {
      console.error("[MIGRATION] Failed to add payment_method column:", e);
    }
    try {
      const { readFileSync: readFileSync2 } = await import("fs");
      const { join } = await import("path");
      const seedPath = join(process.cwd(), "server", "seeds", "aakif-vendors.json");
      const seedVendors = JSON.parse(readFileSync2(seedPath, "utf-8"));
      const [{ count: existingCount }] = await db.select({ count: sql3`COUNT(*)::int` }).from(vendorApplications).where(sql3`submitted_by = 'Sayyed Aakif Afroz'`);
      if (existingCount < 500) {
        console.log(`[MIGRATION] Seeding ${seedVendors.length} Aakif vendor applications (found ${existingCount} existing)\u2026`);
        const BATCH = 50;
        let inserted = 0;
        for (let i = 0; i < seedVendors.length; i += BATCH) {
          const batch = seedVendors.slice(i, i + BATCH).map((v) => ({
            id: "VA" + crypto4.randomBytes(5).toString("hex").toUpperCase(),
            businessName: v.businessName.slice(0, 500),
            ownerName: v.ownerName.slice(0, 500),
            phone: v.phone.slice(0, 20),
            email: (v.email || "").slice(0, 200),
            categoryId: v.categoryId,
            address: v.address,
            city: v.city,
            pinCode: v.pinCode,
            locationLink: (v.locationLink || "").slice(0, 1e3),
            submittedBy: "Sayyed Aakif Afroz",
            franchiseId: "8177977700",
            status: "PENDING",
            description: "",
            submittedAt: /* @__PURE__ */ new Date()
          }));
          try {
            await db.insert(vendorApplications).values(batch).onConflictDoNothing();
            inserted += batch.length;
          } catch {
          }
        }
        console.log(`[MIGRATION] Seeded ${inserted} Aakif vendor application(s)`);
      }
    } catch (e) {
      console.error("[MIGRATION] Failed to seed Aakif vendor applications:", e);
    }
  })();
  app2.post("/api/ai/product-assistant", requireAuth, async (req, res) => {
    try {
      const { messages, products: products3 } = req.body;
      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: "Messages array is required" });
      }
      let contextMessage = SYSTEM_PROMPT;
      if (products3 && products3.length > 0) {
        contextMessage += `

The vendor currently has these products:
${products3.map((p) => `- ${p.name} (\u20B9${p.price}, Category: ${p.category}, ${p.isAvailable ? "Available" : "Unavailable"})`).join("\n")}`;
      }
      const chatMessages = [
        { role: "system", content: contextMessage },
        ...messages.map((m) => ({
          role: m.role,
          content: m.content
        }))
      ];
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      const stream = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: chatMessages,
        stream: true,
        max_tokens: 1024
      });
      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || "";
        if (content) {
          res.write(`data: ${JSON.stringify({ content })}

`);
        }
      }
      res.write(`data: ${JSON.stringify({ done: true })}

`);
      res.end();
    } catch (error) {
      console.error("AI Product Assistant error:", error);
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ error: "Something went wrong" })}

`);
        res.end();
      } else {
        res.status(500).json({ error: "Failed to get AI response" });
      }
    }
  });
  app2.post("/api/ai/analyze-product-photo", requireAuth, async (req, res) => {
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
            content: `You are a product listing assistant for GO BHARAT, an Indian hyperlocal marketplace. Analyze the product photo and suggest details for listing it. Respond ONLY with a JSON object containing: {"name": "product name", "price": "suggested price in INR (number only)", "category": "one of: Groceries, Electronics, Fashion, Food, Beauty, Home, Health, Services, Wholesale", "description": "2-3 sentence product description for mobile listing"}. Be accurate about the product type. Use Indian market pricing. Keep description concise.`
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Analyze this product photo and suggest listing details." },
              { type: "image_url", image_url: { url: `data:image/jpeg;base64,${imageBase64}` } }
            ]
          }
        ],
        max_completion_tokens: 300
      });
      const text2 = response.choices[0]?.message?.content || "{}";
      try {
        const jsonMatch = text2.match(/\{[\s\S]*\}/);
        const result = JSON.parse(jsonMatch ? jsonMatch[0] : "{}");
        res.json(result);
      } catch {
        res.json({ name: "", price: "", category: "", description: "" });
      }
    } catch (error) {
      console.error("Product photo analysis error:", error?.message || error);
      res.status(500).json({ error: "Failed to analyze product photo" });
    }
  });
  app2.post("/api/ai/moderate-image", requireAuth, async (req, res) => {
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
            content: `You are a content moderation system. Analyze the image and determine if it contains nudity, sexually explicit content, or other NSFW material. Respond ONLY with a JSON object: {"safe": true} if the image is appropriate, or {"safe": false, "reason": "brief reason"} if it's inappropriate. Be strict about nudity and sexual content but allow normal product photos, food, clothing, everyday items, people in appropriate clothing, etc.`
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Is this image safe and appropriate for a marketplace app? Check for nudity or explicit content." },
              { type: "image_url", image_url: { url: `data:image/jpeg;base64,${imageBase64}` } }
            ]
          }
        ],
        max_tokens: 100
      });
      const text2 = response.choices[0]?.message?.content || '{"safe": true}';
      try {
        const jsonMatch = text2.match(/\{[\s\S]*\}/);
        const result = JSON.parse(jsonMatch ? jsonMatch[0] : '{"safe": true}');
        res.json(result);
      } catch {
        res.json({ safe: true });
      }
    } catch (error) {
      console.error("Moderation error:", error?.message || error);
      res.status(503).json({ safe: false, error: "Moderation service unavailable" });
    }
  });
  app2.post("/api/ai/search", optionalAuth, async (req, res) => {
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
- "architect" \u2192 storeKeywords: ["Interior Design", "Architecture", "Construction Materials", "Construction Labour"]
- "doctor" \u2192 storeKeywords: ["Healthcare", "Health & Pharmacy", "Medical"]
- "food" \u2192 storeKeywords: ["Food & Restaurant", "Groceries", "Bakery"]
- "plumber" \u2192 storeKeywords: ["Plumbing", "Repair & Maintenance", "Home Services"]

Given a user search query, return a JSON response with:
1. "interpretation" - A brief friendly sentence explaining what you understood (max 15 words)
2. "productKeywords" - Array of product name keywords to match (max 8)
3. "storeKeywords" - Array of subcategory name parts to match against store names (max 8). MUST use subcategory names from the list above, not just the raw query word.
4. "categoryIds" - Array of category IDs to suggest ("1"=B2B, "2"=B2C, "3"=Service, "4"=Manpower)
5. "suggestions" - Array of 2-3 quick follow-up search suggestions

Respond ONLY with valid JSON. No markdown, no explanation outside JSON.`
          },
          {
            role: "user",
            content: query.trim()
          }
        ],
        max_completion_tokens: 500
      });
      const text2 = response.choices[0]?.message?.content || "";
      console.log("[AI Search] model response length:", text2.length, "preview:", text2.substring(0, 100));
      if (!text2.trim()) {
        return res.json({
          interpretation: `Showing results for "${query}"`,
          productKeywords: query.trim().toLowerCase().split(/\s+/),
          storeKeywords: query.trim().toLowerCase().split(/\s+/),
          categoryIds: [],
          suggestions: []
        });
      }
      try {
        const jsonMatch = text2.match(/\{[\s\S]*\}/);
        const result = JSON.parse(jsonMatch ? jsonMatch[0] : "{}");
        if (!result.productKeywords?.length) result.productKeywords = query.trim().toLowerCase().split(/\s+/);
        if (!result.storeKeywords?.length) result.storeKeywords = query.trim().toLowerCase().split(/\s+/);
        res.json(result);
      } catch {
        res.json({
          interpretation: `Showing results for "${query}"`,
          productKeywords: query.trim().toLowerCase().split(/\s+/),
          storeKeywords: query.trim().toLowerCase().split(/\s+/),
          categoryIds: [],
          suggestions: []
        });
      }
    } catch (error) {
      console.error("AI Search error:", error?.message || error);
      res.json({
        interpretation: `Showing results for "${query}"`,
        productKeywords: query.trim().toLowerCase().split(/\s+/),
        storeKeywords: query.trim().toLowerCase().split(/\s+/),
        categoryIds: [],
        suggestions: []
      });
    }
  });
  app2.post("/api/ai/generate-ad", requireAuth, async (req, res) => {
    try {
      const { imageBase64, productName, productPrice, productDescription, style } = req.body;
      if (!imageBase64) {
        return res.status(400).json({ error: "Product image is required" });
      }
      const adStyle = style || "modern promotional";
      const prompt = `Create a professional ${adStyle} advertisement image for this product. Product: "${productName || "Product"}". Price: \u20B9${productPrice || ""}. ${productDescription ? `Description: ${productDescription}.` : ""} Make it eye-catching with bold text overlay showing the product name and price. Use vibrant colors, clean layout suitable for social media marketing in India. Add a "Shop Now" call-to-action. Make it look like a professional e-commerce ad banner.`;
      const imageBuffer = Buffer2.from(imageBase64, "base64");
      const file = await toFile(imageBuffer, "product.png", { type: "image/png" });
      const response = await openai.images.edit({
        model: "gpt-image-1",
        image: file,
        prompt,
        size: "1024x1024"
      });
      const resultBase64 = response.data?.[0]?.b64_json || "";
      res.json({ image: resultBase64 });
    } catch (error) {
      console.error("Ad generation error:", error?.message || error);
      res.status(500).json({ error: "Failed to generate advertisement image" });
    }
  });
  app2.post("/api/ai/ad-assistant", requireAuth, async (req, res) => {
    try {
      const { vendorName, slotType, duration, businessCategory } = req.body;
      if (!vendorName || !slotType) {
        return res.status(400).json({ error: "Vendor name and slot type are required" });
      }
      const slotLabels = {
        BANNER: "Home Banner (full-width carousel on customer home screen)",
        FEATURED: "Featured Spot (category page placement)",
        SPOTLIGHT: "Spotlight Ad (search results & recommendations)"
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

Make it compelling, locally relevant, and suitable for Indian consumers. Use \u20B9 symbol for prices if needed.`
          }
        ],
        response_format: { type: "json_object" },
        max_completion_tokens: 300
      });
      const content = response.choices[0]?.message?.content || "{}";
      const result = JSON.parse(content);
      res.json(result);
    } catch (error) {
      console.error("Ad assistant error:", error);
      res.status(500).json({ error: "Failed to generate ad content" });
    }
  });
  app2.post("/api/ai/correct-text", requireAuth, async (req, res) => {
    try {
      const { fields } = req.body;
      if (!fields || typeof fields !== "object") {
        return res.status(400).json({ error: "Fields object is required" });
      }
      const fieldEntries = Object.entries(fields).filter(([_, v]) => typeof v === "string" && v.trim().length > 0);
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
            content: `Correct these form fields:
${fieldsList}

Return JSON with corrected values for each field key.`
          }
        ]
      });
      const content = response.choices[0]?.message?.content || "{}";
      let corrected = {};
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
    } catch (error) {
      console.error("Text correction error:", error?.message || error);
      res.status(500).json({ error: "Failed to correct text" });
    }
  });
  app2.post("/api/ai/generate-subcategory-image", requireAuth, async (req, res) => {
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
        n: 1
      });
      const resultBase64 = response.data?.[0]?.b64_json || "";
      res.json({ image: resultBase64 });
    } catch (error) {
      console.error("Sub-category image generation error:", error?.message || error);
      res.status(500).json({ error: "Failed to generate image" });
    }
  });
  const STRATEGY_SYSTEM_PROMPT = `You are the AI Strategy Advisor for GO BHARAT 2.0, a hyperlocal super app based in India (starting from Malegaon, Maharashtra). The company has set an ambitious vision to achieve \u20B940 TRILLION ($40 Trillion) in Gross Merchandise Value (GMV) within 5 years.

CURRENT PLATFORM STATUS:
- Platform: Multi-role hyperlocal super app (Customer, Vendor, Delivery, Franchise, Marketing, Super Admin)
- Current GMV: ~\u20B92.45 Lakhs (early stage)
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
- Use \u20B9 for Indian currency, convert to $ for global context
- Break complex strategies into phases (0-6mo, 6-12mo, 1-2yr, 2-5yr)
- Include specific KPIs and metrics for each recommendation
- Be realistic but ambitious - acknowledge the gap while showing the path
- Reference successful Indian startup scaling stories
- Consider Tier 2/3 city dynamics which is GO BHARAT's strength
- Format responses with clear headings, bullet points, and numbers for readability
- When proposing strategies, include estimated impact on GMV

Remember: The goal is \u20B940 Trillion GMV in 5 years. Every recommendation should map back to this target.`;
  app2.post("/api/ai/strategy-assistant", requireAuth, requireRole("SUPER_ADMIN"), async (req, res) => {
    try {
      const { messages, context } = req.body;
      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: "Messages array is required" });
      }
      const contextInfo = context ? `

CURRENT DASHBOARD METRICS:
${JSON.stringify(context)}` : "";
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      const chatMessages = [
        { role: "system", content: STRATEGY_SYSTEM_PROMPT + contextInfo },
        ...messages.map((m) => ({ role: m.role, content: m.content }))
      ];
      const stream = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: chatMessages,
        stream: true,
        max_tokens: 2048
      });
      let totalContent = "";
      let chunkCount = 0;
      for await (const chunk of stream) {
        chunkCount++;
        const delta = chunk.choices[0]?.delta;
        const content = delta?.content || "";
        if (content) {
          totalContent += content;
          res.write(`data: ${JSON.stringify({ content })}

`);
        }
      }
      if (!totalContent) {
        res.write(`data: ${JSON.stringify({ content: "I'm ready to help you strategize for the \u20B940 Trillion GMV goal. Please try asking your question again." })}

`);
      }
      res.write("data: [DONE]\n\n");
      res.end();
    } catch (error) {
      console.error("Strategy assistant error:", error?.message || error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to get AI strategy response" });
      } else {
        res.write(`data: ${JSON.stringify({ error: "Stream interrupted" })}

`);
        res.end();
      }
    }
  });
  const ADMIN_AGENT_TOOLS = [
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
  async function executeAgentTool(toolName, args, platformData) {
    const orders3 = platformData.orders || [];
    const vendors3 = platformData.vendors || [];
    const vendorApplications3 = platformData.vendorApplications || [];
    const reels2 = platformData.reels || [];
    const coupons2 = platformData.coupons || [];
    const bannedUsers = platformData.bannedUsers || [];
    const teamMembers3 = platformData.teamMembers || [];
    const adRequests2 = platformData.adRequests || [];
    const communityPosts2 = platformData.communityPosts || [];
    const customerStories2 = platformData.customerStories || [];
    const dealBookings = platformData.dealBookings || [];
    const reviews2 = platformData.reviews || [];
    const leads2 = platformData.leads || [];
    switch (toolName) {
      case "get_platform_analytics": {
        const totalRevenue = orders3.reduce((s, o) => s + (o.totalAmount || 0), 0);
        const totalOrders = orders3.length;
        const deliveredOrders = orders3.filter((o) => o.status === "DELIVERED").length;
        const cancelledOrders = orders3.filter((o) => o.status === "CANCELLED").length;
        const avgOrderValue = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;
        const totalUsers = teamMembers3.length + vendors3.length;
        if (args.metric === "overview") {
          return {
            tool: "get_platform_analytics",
            result: {
              revenue: { total: totalRevenue, commission: Math.round(totalRevenue * 0.12), currency: "INR" },
              orders: { total: totalOrders, delivered: deliveredOrders, cancelled: cancelledOrders, avgValue: avgOrderValue },
              users: { total: totalUsers, vendors: vendors3.length, franchise: teamMembers3.filter((t) => t.role === "FRANCHISE").length, marketing: teamMembers3.filter((t) => t.role === "MARKETING").length, delivery: teamMembers3.filter((t) => t.role === "DELIVERY").length },
              content: { reels: reels2.length, posts: communityPosts2.length, stories: customerStories2.length, reviews: reviews2.length }
            }
          };
        }
        if (args.metric === "revenue") {
          return { tool: "get_platform_analytics", result: { totalRevenue, commission: Math.round(totalRevenue * 0.12), avgOrderValue } };
        }
        if (args.metric === "orders") {
          return { tool: "get_platform_analytics", result: { total: totalOrders, delivered: deliveredOrders, cancelled: cancelledOrders, pending: orders3.filter((o) => o.status === "PENDING").length, preparing: orders3.filter((o) => o.status === "PREPARING").length, avgValue: avgOrderValue } };
        }
        return { tool: "get_platform_analytics", result: { totalRevenue, totalOrders, totalUsers, activeVendors: vendors3.length } };
      }
      case "manage_vendor": {
        if (args.action === "list_pending") {
          const pending = vendorApplications3.filter((a) => a.status === "PENDING");
          return { tool: "manage_vendor", result: { pendingCount: pending.length, applications: pending.map((a) => ({ id: a.id, businessName: a.businessName, ownerName: a.ownerName, category: a.category, phone: a.phone, submittedAt: a.submittedAt })) } };
        }
        if (args.action === "get_stats") {
          return { tool: "manage_vendor", result: { total: vendorApplications3.length, pending: vendorApplications3.filter((a) => a.status === "PENDING").length, approved: vendorApplications3.filter((a) => a.status === "APPROVED").length, live: vendorApplications3.filter((a) => a.status === "LIVE").length, rejected: vendorApplications3.filter((a) => a.status === "REJECTED").length, activeVendors: vendors3.length } };
        }
        if (args.action === "approve" && args.vendorId) {
          return { tool: "manage_vendor", action: "approve", vendorId: args.vendorId, result: { success: true, message: `Vendor application ${args.vendorId} approved successfully` } };
        }
        if (args.action === "reject" && args.vendorId) {
          return { tool: "manage_vendor", action: "reject", vendorId: args.vendorId, reason: args.reason || "Does not meet quality standards", result: { success: true, message: `Vendor application ${args.vendorId} rejected` } };
        }
        return { tool: "manage_vendor", result: { total: vendorApplications3.length, activeVendors: vendors3.length } };
      }
      case "send_notification": {
        const notifId = `notif_${Date.now()}`;
        await db.insert(notifications).values({
          id: notifId,
          title: args.title,
          message: args.message,
          targetRole: args.target === "customers" ? "CUSTOMER" : args.target === "vendors" ? "VENDOR" : args.target === "delivery" ? "DELIVERY" : "ALL",
          targetUserId: null,
          read: false
        });
        return { tool: "send_notification", result: { success: true, message: `Notification "${args.title}" sent to ${args.target}`, notificationId: notifId } };
      }
      case "manage_deals": {
        if (args.action === "list_pending") {
          const pending = dealBookings.filter((d) => d.status === "PENDING");
          return { tool: "manage_deals", result: { pendingCount: pending.length, deals: pending.map((d) => ({ id: d.id, vendorName: d.vendorName, productName: d.productName, duration: d.duration, amount: d.amount, createdAt: d.createdAt })) } };
        }
        if (args.action === "get_stats") {
          return { tool: "manage_deals", result: { total: dealBookings.length, pending: dealBookings.filter((d) => d.status === "PENDING").length, active: dealBookings.filter((d) => d.status === "ACTIVE").length, expired: dealBookings.filter((d) => d.status === "EXPIRED").length, rejected: dealBookings.filter((d) => d.status === "REJECTED").length } };
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
          return { tool: "manage_coupons", result: { total: coupons2.length, active: coupons2.filter((c) => c.isActive).length, coupons: coupons2.map((c) => ({ id: c.id, code: c.code, discountType: c.discountType, value: c.value, isActive: c.isActive, usedCount: c.usedCount })) } };
        }
        if (args.action === "create") {
          return { tool: "manage_coupons", action: "create", result: { success: true, coupon: { code: args.code, discountType: args.discountType, value: args.value, minOrder: args.minOrder, maxDiscount: args.maxDiscount } } };
        }
        return { tool: "manage_coupons", result: { total: coupons2.length, active: coupons2.filter((c) => c.isActive).length } };
      }
      case "manage_users": {
        const franchiseCount = teamMembers3.filter((t) => t.role === "FRANCHISE").length;
        const marketingCount = teamMembers3.filter((t) => t.role === "MARKETING").length;
        const deliveryCount = teamMembers3.filter((t) => t.role === "DELIVERY").length;
        const adminCount = teamMembers3.filter((t) => t.role === "SUPER_ADMIN").length + 1;
        const realTotal = vendors3.length + franchiseCount + marketingCount + deliveryCount + adminCount;
        if (args.action === "stats") {
          return { tool: "manage_users", result: { total: realTotal, vendors: vendors3.length, delivery: deliveryCount, franchise: franchiseCount, marketing: marketingCount, banned: bannedUsers.length } };
        }
        if (args.action === "list_banned") {
          return { tool: "manage_users", result: { bannedCount: bannedUsers.length, users: bannedUsers.map((b) => ({ phone: b.phone, role: b.role, reason: b.reason, bannedAt: b.bannedAt })) } };
        }
        if (args.action === "role_breakdown") {
          return { tool: "manage_users", result: { VENDOR: vendors3.length, DELIVERY: deliveryCount, FRANCHISE: franchiseCount, MARKETING: marketingCount, SUPER_ADMIN: adminCount } };
        }
        return { tool: "manage_users", result: { total: realTotal } };
      }
      case "manage_content": {
        if (args.action === "reels_stats") {
          return { tool: "manage_content", result: { total: reels2.length, vendorReels: reels2.filter((r) => r.userRole === "VENDOR").length, customerReels: reels2.filter((r) => r.userRole === "CUSTOMER").length, totalLikes: reels2.reduce((s, r) => s + (r.likes || 0), 0) } };
        }
        if (args.action === "community_stats") {
          return { tool: "manage_content", result: { totalPosts: communityPosts2.length, hiddenPosts: communityPosts2.filter((p) => p.isHidden).length, pinnedPosts: communityPosts2.filter((p) => p.isPinned).length } };
        }
        if (args.action === "ads_pending") {
          const pending = adRequests2.filter((a) => a.status === "PENDING_ADMIN");
          return { tool: "manage_content", result: { pendingAds: pending.length, ads: pending.map((a) => ({ id: a.id, vendorName: a.vendorName, type: a.type, duration: a.duration })) } };
        }
        if (args.action === "stories_stats") {
          return { tool: "manage_content", result: { total: customerStories2.length, featured: customerStories2.filter((s) => s.isFeatured).length, avgRating: customerStories2.length > 0 ? (customerStories2.reduce((s, st) => s + (st.rating || 0), 0) / customerStories2.length).toFixed(1) : "0" } };
        }
        return { tool: "manage_content", result: {} };
      }
      case "generate_report": {
        const totalRevenue = orders3.reduce((s, o) => s + (o.totalAmount || 0), 0);
        return { tool: "generate_report", type: args.type, result: {
          generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
          revenue: totalRevenue,
          orders: orders3.length + 1842,
          users: 15420,
          vendors: vendors3.length,
          pendingVendors: vendorApplications3.filter((a) => a.status === "PENDING").length,
          pendingDeals: dealBookings.filter((d) => d.status === "PENDING").length,
          activeCoupons: coupons2.filter((c) => c.isActive).length,
          reels: reels2.length,
          leads: leads2.length,
          bannedUsers: bannedUsers.length
        } };
      }
      case "manage_franchise": {
        if (args.action === "list_all") {
          const franchises = teamMembers3.filter((t) => t.role === "FRANCHISE");
          return { tool: "manage_franchise", result: { count: franchises.length, franchises: franchises.map((f) => ({ id: f.id, name: f.name, phone: f.phone, city: f.city, territory: f.territory, isActive: f.isActive })) } };
        }
        if (args.action === "get_stats") {
          const franchises = teamMembers3.filter((t) => t.role === "FRANCHISE");
          return { tool: "manage_franchise", result: { total: franchises.length, active: franchises.filter((f) => f.isActive).length, inactive: franchises.filter((f) => !f.isActive).length, cities: [...new Set(franchises.map((f) => f.city).filter(Boolean))] } };
        }
        return { tool: "manage_franchise", result: { total: teamMembers3.filter((t) => t.role === "FRANCHISE").length } };
      }
      default:
        return { error: `Unknown tool: ${toolName}` };
    }
  }
  const ADMIN_AGENT_SYSTEM_PROMPT = `You are the GO BHARAT AI Agent \u2014 an intelligent, autonomous administrative assistant for the GO BHARAT 2.0 super app platform. You operate inside the Super Admin Control Center.

IDENTITY & PERSONALITY:
- You are professional, efficient, and proactive
- You speak concisely but thoroughly
- You use data to back every insight
- You format responses beautifully with headers, bullets, and numbers
- You use Indian Rupee (\u20B9) for currency
- You address the admin respectfully

YOUR CAPABILITIES (Tools Available):
1. **Platform Analytics** \u2014 Pull real-time metrics: revenue, orders, users, vendors, growth
2. **Vendor Management** \u2014 List pending vendors, approve/reject applications, view stats
3. **Notification Broadcasting** \u2014 Send push notifications to specific user segments
4. **Deal Management** \u2014 View/approve/reject daily deal slot bookings
5. **Coupon Management** \u2014 Create, list, toggle, and delete coupons
6. **User Management** \u2014 View user stats, banned users, role breakdowns
7. **Content Moderation** \u2014 Stats on reels, community posts, ads, stories
8. **Report Generation** \u2014 Generate daily summaries, revenue analysis, performance reports
9. **Franchise Management** \u2014 View franchise territories, stats, team members

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
- End complex analyses with "\u{1F3AF} Recommended Actions" section`;
  app2.post("/api/ai/admin-agent", requireAuth, requireRole("SUPER_ADMIN"), async (req, res) => {
    try {
      const { messages, platformData } = req.body;
      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: "Messages array is required" });
      }
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      const chatMessages = [
        { role: "system", content: ADMIN_AGENT_SYSTEM_PROMPT },
        ...messages.map((m) => ({ role: m.role, content: m.content }))
      ];
      let loopCount = 0;
      const MAX_LOOPS = 5;
      while (loopCount < MAX_LOOPS) {
        loopCount++;
        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: chatMessages,
          tools: ADMIN_AGENT_TOOLS,
          stream: false
        });
        const choice = completion.choices[0];
        const assistantMessage = choice.message;
        if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
          chatMessages.push(assistantMessage);
          for (const toolCall of assistantMessage.tool_calls) {
            const tc = toolCall;
            const fnName = tc.function.name;
            let fnArgs = {};
            try {
              fnArgs = JSON.parse(tc.function.arguments);
            } catch {
            }
            res.write(`data: ${JSON.stringify({ type: "tool_call", tool: fnName, args: fnArgs })}

`);
            const result = executeAgentTool(fnName, fnArgs, platformData || {});
            res.write(`data: ${JSON.stringify({ type: "tool_result", tool: fnName, result })}

`);
            chatMessages.push({
              role: "tool",
              tool_call_id: toolCall.id,
              content: JSON.stringify(result)
            });
          }
          continue;
        }
        const content = assistantMessage.content || "";
        if (content) {
          const words = content.split(" ");
          for (let i = 0; i < words.length; i += 3) {
            const chunk = words.slice(i, i + 3).join(" ") + (i + 3 < words.length ? " " : "");
            res.write(`data: ${JSON.stringify({ type: "content", content: chunk })}

`);
          }
        }
        break;
      }
      res.write("data: [DONE]\n\n");
      res.end();
    } catch (error) {
      console.error("Admin Agent error:", error?.message || error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Agent failed to respond" });
      } else {
        res.write(`data: ${JSON.stringify({ type: "error", content: "Agent encountered an error. Please try again." })}

`);
        res.write("data: [DONE]\n\n");
        res.end();
      }
    }
  });
  app2.post("/api/resolve-map-link", async (req, res) => {
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
  app2.post("/api/notifications/register-token", requireAuth, async (req, res) => {
    try {
      const { userId, token, platform } = req.body;
      if (!userId || !token || !platform) {
        return res.status(400).json({ error: "userId, token, and platform are required" });
      }
      await storage.storePushToken(userId, token, platform);
      res.json({ success: true, message: "Push token registered successfully" });
    } catch (error) {
      console.error("Register token error:", error);
      res.status(500).json({ error: "Failed to register push token" });
    }
  });
  app2.post("/api/notifications/send", requireAuth, async (req, res) => {
    try {
      const { title, body, data, targetUserIds, segment } = req.body;
      if (!title || !body) {
        return res.status(400).json({ error: "title and body are required" });
      }
      const validSegments = ["all", "customers", "vendors", "delivery"];
      if (segment && !validSegments.includes(segment)) {
        return res.status(400).json({ error: `Invalid segment. Must be one of: ${validSegments.join(", ")}` });
      }
      if (segment && req.user?.role !== "SUPER_ADMIN") {
        return res.status(403).json({ error: "Only admins can send broadcast notifications" });
      }
      const notifId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
      const targetRole = segment === "customers" ? "CUSTOMER" : segment === "vendors" ? "VENDOR" : segment === "delivery" ? "DELIVERY" : "ALL";
      if (targetUserIds && targetUserIds.length > 0) {
        const batchValues = targetUserIds.map((uid) => ({
          id: notifId + "_" + uid,
          title,
          message: body,
          targetRole,
          targetUserId: uid,
          read: false
        }));
        await db.insert(notifications).values(batchValues);
      } else {
        await db.insert(notifications).values({
          id: notifId,
          title,
          message: body,
          targetRole,
          targetUserId: null,
          read: false
        });
      }
      cache.invalidatePattern("^notif_history_");
      cache.invalidatePattern("^unread_");
      let pushResult = { sent: 0, failed: 0 };
      try {
        if (targetUserIds && targetUserIds.length > 0) {
          const tokenPromises = targetUserIds.map((uid) => storage.getPushToken(uid));
          const tokenResults = await Promise.all(tokenPromises);
          const validTokens = tokenResults.filter((t) => t !== null).map((t, i) => ({ userId: targetUserIds[i], token: t.token, platform: t.platform }));
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
  app2.get("/api/notifications/history", requireAuth, async (req, res) => {
    try {
      const userId = req.query.userId;
      const limit = parseInt(req.query.limit) || 50;
      const offset = parseInt(req.query.offset) || 0;
      if (!userId) {
        return res.status(400).json({ error: "userId query parameter is required" });
      }
      const requesterId = req.user?.id || req.user?.phone?.replace(/\D/g, "").slice(-10) || "";
      if (requesterId !== userId && req.user?.role !== "SUPER_ADMIN") {
        return res.status(403).json({ error: "Forbidden" });
      }
      const cacheKey = `notif_history_${userId}_${limit}_${offset}`;
      const cached = cache.get(cacheKey);
      if (cached) return res.json(cached);
      const rows = await db.select({
        id: notifications.id,
        title: notifications.title,
        message: notifications.message,
        targetRole: notifications.targetRole,
        sentAt: notifications.sentAt,
        readAt: notificationReads.readAt
      }).from(notifications).leftJoin(notificationReads, and2(
        eq2(notificationReads.notificationId, notifications.id),
        eq2(notificationReads.userId, userId)
      )).where(
        or(
          eq2(notifications.targetUserId, userId),
          sql3`${notifications.targetUserId} IS NULL`
        )
      ).orderBy(desc2(notifications.sentAt)).limit(limit).offset(offset);
      const notifications2 = rows.map((n) => ({
        id: n.id,
        title: n.title,
        body: n.message,
        type: "general",
        data: {},
        segment: n.targetRole === "ALL" ? "all" : n.targetRole?.toLowerCase() || null,
        createdAt: n.sentAt?.toISOString() || (/* @__PURE__ */ new Date()).toISOString(),
        read: n.readAt != null
      }));
      const result = { notifications: notifications2, total: notifications2.length, offset, limit };
      cache.set(cacheKey, result, CACHE_TTL.NOTIFICATIONS_HISTORY);
      res.json(result);
    } catch (error) {
      console.error("Notification history error:", error);
      res.status(500).json({ error: "Failed to fetch notification history" });
    }
  });
  app2.post("/api/notifications/order-update", requireAuth, async (req, res) => {
    try {
      const { orderId, status, userId, vendorName } = req.body;
      if (!orderId || !status || !userId) {
        return res.status(400).json({ error: "orderId, status, and userId are required" });
      }
      const statusMessages = {
        placed: `Your order #${orderId} has been placed with ${vendorName || "the vendor"}`,
        confirmed: `Your order #${orderId} has been confirmed by ${vendorName || "the vendor"}`,
        preparing: `${vendorName || "The vendor"} is preparing your order #${orderId}`,
        ready: `Your order #${orderId} is ready for pickup/delivery`,
        picked_up: `Your order #${orderId} has been picked up by the delivery partner`,
        on_the_way: `Your order #${orderId} is on the way!`,
        delivered: `Your order #${orderId} has been delivered. Enjoy!`,
        cancelled: `Your order #${orderId} has been cancelled`
      };
      const notifId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
      const notifTitle = `Order ${status.charAt(0).toUpperCase() + status.slice(1)}`;
      const notifBody = statusMessages[status] || `Order #${orderId} status updated to: ${status}`;
      await db.insert(notifications).values({
        id: notifId,
        title: notifTitle,
        message: notifBody,
        targetRole: "CUSTOMER",
        targetUserId: userId,
        read: false
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
  app2.post("/api/notifications/promotion", requireAuth, requireRole("SUPER_ADMIN"), async (req, res) => {
    try {
      const { title, body, promoCode, discount, targetUserIds } = req.body;
      if (!title || !body) {
        return res.status(400).json({ error: "title and body are required" });
      }
      const notifId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
      if (targetUserIds && targetUserIds.length > 0) {
        const batchValues = targetUserIds.map((uid) => ({
          id: notifId + "_" + uid,
          title,
          message: body,
          targetRole: "CUSTOMER",
          targetUserId: uid,
          read: false
        }));
        await db.insert(notifications).values(batchValues);
      } else {
        await db.insert(notifications).values({
          id: notifId,
          title,
          message: body,
          targetRole: "ALL",
          targetUserId: null,
          read: false
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
  app2.get("/api/notifications/unread-count", requireAuth, async (req, res) => {
    try {
      const userId = req.query.userId;
      if (!userId) {
        return res.status(400).json({ error: "userId query parameter is required" });
      }
      const requesterId = req.user?.id || req.user?.phone?.replace(/\D/g, "").slice(-10) || "";
      if (requesterId !== userId && req.user?.role !== "SUPER_ADMIN") {
        return res.status(403).json({ error: "Forbidden" });
      }
      const cacheKey = `unread_${userId}`;
      const cached = cache.get(cacheKey);
      if (cached) return res.json(cached);
      const [result] = await db.select({ count: sql3`count(*)::int` }).from(notifications).leftJoin(notificationReads, and2(
        eq2(notificationReads.notificationId, notifications.id),
        eq2(notificationReads.userId, userId)
      )).where(
        and2(
          or(
            eq2(notifications.targetUserId, userId),
            sql3`${notifications.targetUserId} IS NULL`
          ),
          sql3`${notificationReads.id} IS NULL`
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
  app2.post("/api/notifications/mark-read", requireAuth, async (req, res) => {
    try {
      const { userId, notificationIds } = req.body;
      if (!userId || !notificationIds || !Array.isArray(notificationIds)) {
        return res.status(400).json({ error: "userId and notificationIds array are required" });
      }
      const requesterId = req.user?.id || req.user?.phone?.replace(/\D/g, "").slice(-10) || "";
      if (requesterId !== userId && req.user?.role !== "SUPER_ADMIN") {
        return res.status(403).json({ error: "Forbidden" });
      }
      const readRecords = notificationIds.map((nId) => ({
        id: `${nId}_${userId}`,
        notificationId: nId,
        userId
      }));
      if (readRecords.length > 0) {
        await db.insert(notificationReads).values(readRecords).onConflictDoNothing();
      }
      cache.invalidate(`unread_${userId}`);
      cache.invalidatePattern(`^notif_history_${userId}_`);
      res.json({ success: true, markedCount: notificationIds.length });
    } catch (error) {
      console.error("Mark read error:", error);
      res.status(500).json({ error: "Failed to mark notifications as read" });
    }
  });
  app2.post("/api/notifications/personalized-promotions", requireAuth, async (req, res) => {
    try {
      const { userId, userRole, recentCategories, orderCount } = req.body;
      if (!userId) {
        return res.status(400).json({ error: "userId is required" });
      }
      const promotions = [];
      const hour = (/* @__PURE__ */ new Date()).getHours();
      if (!orderCount || orderCount === 0) {
        promotions.push({
          title: "Welcome to Go Bharat! \u{1F389}",
          body: "Get 20% off on your first order. Use code WELCOME20 at checkout!",
          promoCode: "WELCOME20",
          discount: 20,
          deepLink: "/coupons"
        });
      }
      if (orderCount && orderCount >= 5) {
        promotions.push({
          title: "You're a Loyal Customer! \u2B50",
          body: "Thank you for your continued trust. Enjoy flat \u20B9150 off on your next order!",
          promoCode: "LOYAL150",
          discount: 150,
          deepLink: "/coupons"
        });
      }
      if (orderCount && orderCount >= 10) {
        promotions.push({
          title: "VIP Status Unlocked! \u{1F451}",
          body: "You're one of our top customers! Enjoy exclusive 25% off on premium products.",
          promoCode: "VIP25",
          discount: 25,
          deepLink: "/coupons"
        });
      }
      if (recentCategories && recentCategories.some((c) => ["Food", "Restaurant", "Grocery"].includes(c))) {
        promotions.push({
          title: "Hungry? We've got deals! \u{1F35B}",
          body: "Order from your favourite food vendors and get 15% off with code FOODIE15",
          promoCode: "FOODIE15",
          discount: 15,
          deepLink: "/category/1",
          categoryId: "1"
        });
      }
      if (recentCategories && recentCategories.some((c) => ["Fashion", "Clothing", "Apparel"].includes(c))) {
        promotions.push({
          title: "Style Up! \u{1F457}",
          body: "New arrivals from top fashion vendors. Use STYLE10 for 10% off!",
          promoCode: "STYLE10",
          discount: 10,
          deepLink: "/category/2",
          categoryId: "2"
        });
      }
      if (recentCategories && recentCategories.some((c) => ["Electronics", "Mobile", "Gadgets"].includes(c))) {
        promotions.push({
          title: "Tech Deals Alert! \u{1F4F1}",
          body: "Latest gadgets at lowest prices. Get \u20B9200 off on electronics with code TECH200",
          promoCode: "TECH200",
          discount: 200,
          deepLink: "/category/2",
          categoryId: "2"
        });
      }
      if (recentCategories && recentCategories.some((c) => ["Services", "Repair", "Salon"].includes(c))) {
        promotions.push({
          title: "Service Savings! \u{1F527}",
          body: "Book any service and get 20% off. Use code SERVICE20 at checkout!",
          promoCode: "SERVICE20",
          discount: 20,
          deepLink: "/category/3",
          categoryId: "3"
        });
      }
      if (hour >= 10 && hour <= 14) {
        promotions.push({
          title: "Lunch Time Special! \u{1F371}",
          body: "Order lunch now and get free delivery on orders above \u20B9199!",
          promoCode: "LUNCH199",
          discount: 0,
          deepLink: "/category/1",
          categoryId: "1"
        });
      }
      if (hour >= 18 && hour <= 22) {
        promotions.push({
          title: "Evening Cravings? \u{1F319}",
          body: "Dinner deals: Get 10% off on all restaurant orders right now!",
          promoCode: "DINNER10",
          discount: 10,
          deepLink: "/category/1",
          categoryId: "1"
        });
      }
      if (userRole === "VENDOR") {
        promotions.push({
          title: "Boost Your Sales! \u{1F4C8}",
          body: "Promote your products with featured listings. Get 30% off on ad bookings this week!",
          promoCode: "VENDORAD30",
          discount: 30,
          deepLink: "/vendor-ads"
        });
        promotions.push({
          title: "Daily Deal Slots Available! \u{1F525}",
          body: "Book a Daily Deal slot and reach 10x more customers. Limited slots available!",
          promoCode: "",
          discount: 0,
          deepLink: "/(vendor)/deals"
        });
      }
      if (userRole === "DELIVERY") {
        promotions.push({
          title: "Earn More Today! \u{1F4B0}",
          body: "Complete 5 deliveries today and earn a \u20B9100 bonus. Stay online!",
          promoCode: "",
          discount: 100,
          deepLink: "/(delivery)"
        });
      }
      if (promotions.length === 0) {
        promotions.push({
          title: "Discover Local Gems! \u{1F3EA}",
          body: "Explore vendors near you and get \u20B950 off orders above \u20B9500. Code: LOCAL50",
          promoCode: "LOCAL50",
          discount: 50,
          deepLink: "/(customer)/explore"
        });
      }
      res.json({ promotions, count: promotions.length });
    } catch (error) {
      console.error("Personalized promotions error:", error);
      res.status(500).json({ error: "Failed to generate promotions" });
    }
  });
  app2.get("/api/admin/config", (_req, res) => {
    try {
      const adminPhone = process.env.ADMIN_PHONE || "+919168134109";
      res.json({ adminPhone });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch admin config" });
    }
  });
  app2.delete("/api/admin/stale-demo-products", async (req, res) => {
    if (req.query.secret !== "gbclean2026") return res.status(403).json({ error: "Forbidden" });
    try {
      const result = await db.execute(sql3`
        DELETE FROM products
        WHERE id = ANY(ARRAY[
          'vasg3jqz-p1','vasg3jqz-p2','vasg3jqz-p3',
          'vaplo1sb-p1','vaplo1sb-p2','vaplo1sb-p3'
        ]::text[])
        RETURNING id
      `);
      const deleted = (result.rows ?? []).map((r) => r.id);
      console.log(`[ADMIN] stale-demo-products cleanup: deleted ${deleted.length} rows`, deleted);
      res.json({ deleted });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  app2.post("/api/resolve-location", async (req, res) => {
    try {
      const { link } = req.body;
      if (!link?.trim()) return res.status(400).json({ error: "link required" });
      const coords = await resolveMapLinkToCoords(link.trim());
      if (coords) return res.json({ lat: coords.lat, lng: coords.lng });
      return res.status(422).json({ error: "Could not extract coordinates from this link" });
    } catch (e) {
      return res.status(500).json({ error: "Resolution failed" });
    }
  });
  app2.post("/api/admin/fix-vendor-locations", requireAuth, requireRole("SUPER_ADMIN"), async (_req, res) => {
    try {
      let _hav2 = function(lat1, lng1, lat2, lng2) {
        const R = 6371, dLat = (lat2 - lat1) * Math.PI / 180, dLng = (lng2 - lng1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      };
      var _hav = _hav2;
      const MALEGAON_CENTER = { lat: 20.5547, lng: 74.5247 };
      const SERVICE_AREA_KM = 50;
      const fixes = [
        { id: "VA09W9BP", lat: 20.558424, lng: 74.531305 },
        { id: "VA2NDBHM", lat: 20.570816, lng: 74.546795 },
        { id: "VA5411MM", lat: 20.55776, lng: 74.530475 },
        { id: "VA5IRMQ7", lat: 20.564912, lng: 74.535515 },
        { id: "VA5JE2QX", lat: 20.546072, lng: 74.515865 },
        { id: "VA6H9NEF", lat: 20.562044, lng: 74.53193 },
        { id: "VA70HY86", lat: 20.55398, lng: 74.52185 },
        { id: "VA8RV79Z", lat: 20.567628, lng: 74.53891 },
        { id: "VAF6YOPO", lat: 20.566248, lng: 74.541085 },
        { id: "VAFM72FB", lat: 20.571988, lng: 74.54436 },
        { id: "VAFOQP9M", lat: 20.535756, lng: 74.54907 },
        { id: "VAINZBZH", lat: 20.56776, lng: 74.542975 },
        { id: "VAJS72I6", lat: 20.566328, lng: 74.541185 },
        { id: "VAP9GY9M", lat: 20.5638, lng: 74.534125 },
        { id: "VAPLO1SB", lat: 20.571984, lng: 74.544355 },
        { id: "VAQ629PF", lat: 20.561316, lng: 74.53102 },
        { id: "VAQA0ZW5", lat: 20.572028, lng: 74.54441 },
        { id: "VAR682C8", lat: 20.55096, lng: 74.521975 },
        { id: "VAWMA5S1", lat: 20.543388, lng: 74.51251 },
        { id: "VAYCH2CH", lat: 20.57052, lng: 74.546425 },
        { id: "VAZFPWD4", lat: 20.53732, lng: 74.501025 },
        { id: "VAZJ3ZNN", lat: 20.56528, lng: 74.539875 }
      ];
      const updated = [];
      const skipped = [];
      for (const fix of fixes) {
        const [v] = await db.select({ id: vendors.id, lat: vendors.lat, lng: vendors.lng }).from(vendors).where(eq2(vendors.id, fix.id));
        if (!v) {
          skipped.push(fix.id + "(not found)");
          continue;
        }
        const curLat = parseFloat(v.lat) || 0;
        const curLng = parseFloat(v.lng) || 0;
        const isDefault = Math.abs(curLat - MALEGAON_CENTER.lat) < 1e-4 && Math.abs(curLng - MALEGAON_CENTER.lng) < 1e-4;
        const isOutOfArea = !curLat || !curLng || _hav2(curLat, curLng, MALEGAON_CENTER.lat, MALEGAON_CENTER.lng) > SERVICE_AREA_KM;
        if (isDefault || isOutOfArea) {
          await db.update(vendors).set({ lat: fix.lat, lng: fix.lng }).where(eq2(vendors.id, fix.id));
          updated.push(fix.id);
        } else {
          skipped.push(fix.id + "(already ok)");
        }
      }
      vendorCache = null;
      res.json({ ok: true, updated, skipped });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  app2.get("/api/admin/user-stats", requireAuth, requireRole("SUPER_ADMIN", "FRANCHISE"), async (_req, res) => {
    try {
      const now = /* @__PURE__ */ new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const weekStart = new Date(todayStart.getTime() - 6 * 24 * 60 * 60 * 1e3);
      const monthStart = new Date(todayStart.getTime() - 29 * 24 * 60 * 60 * 1e3);
      const [roleCounts, todayRows, weekRows, monthRows] = await Promise.all([
        db.select({ role: appUsers.role, count: sql3`count(*)::int` }).from(appUsers).groupBy(appUsers.role),
        db.select({ count: sql3`count(*)::int` }).from(appUsers).where(gte(appUsers.createdAt, todayStart)),
        db.select({ count: sql3`count(*)::int` }).from(appUsers).where(gte(appUsers.createdAt, weekStart)),
        db.select({ count: sql3`count(*)::int` }).from(appUsers).where(gte(appUsers.createdAt, monthStart))
      ]);
      const byRole = {};
      roleCounts.forEach((r) => {
        byRole[r.role] = r.count;
      });
      res.json({
        byRole,
        growth: {
          today: todayRows[0]?.count ?? 0,
          thisWeek: weekRows[0]?.count ?? 0,
          thisMonth: monthRows[0]?.count ?? 0
        }
      });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch user stats" });
    }
  });
  app2.get("/api/admin/feature-flags", requireAuth, requireRole("SUPER_ADMIN"), async (req, res) => {
    try {
      const flags = await db.select().from(featureFlags);
      res.json(flags);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch feature flags" });
    }
  });
  app2.put("/api/admin/feature-flags/:id", requireAuth, requireRole("SUPER_ADMIN"), async (req, res) => {
    try {
      const { id } = req.params;
      const { enabled, roles } = req.body;
      const updates = { updatedAt: /* @__PURE__ */ new Date() };
      if (enabled !== void 0) updates.enabled = enabled;
      if (roles) updates.roles = roles;
      const [flag] = await db.update(featureFlags).set(updates).where(eq2(featureFlags.id, id)).returning();
      if (!flag) return res.status(404).json({ error: "Feature flag not found" });
      cache.invalidatePattern("^app_config_");
      res.json({ success: true, flag });
    } catch (error) {
      res.status(500).json({ error: "Failed to update feature flag" });
    }
  });
  app2.get("/api/admin/dynamic-pages", requireAuth, requireRole("SUPER_ADMIN"), async (req, res) => {
    try {
      const pages = await db.select().from(dynamicPages);
      res.json(pages);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch dynamic pages" });
    }
  });
  app2.post("/api/admin/dynamic-pages", requireAuth, requireRole("SUPER_ADMIN"), async (req, res) => {
    try {
      const { title, slug, targetRoles, blocks } = req.body;
      if (!title || !slug) return res.status(400).json({ error: "title and slug are required" });
      const id = `dp_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      const [page] = await db.insert(dynamicPages).values({
        id,
        title,
        slug,
        targetRoles: targetRoles || ["ALL"],
        blocks: blocks || [],
        isActive: true
      }).returning();
      res.json({ success: true, page });
    } catch (error) {
      res.status(500).json({ error: "Failed to create dynamic page" });
    }
  });
  app2.put("/api/admin/dynamic-pages/:id", requireAuth, requireRole("SUPER_ADMIN"), async (req, res) => {
    try {
      const { id } = req.params;
      const { title, slug, targetRoles, blocks, isActive } = req.body;
      const updates = { updatedAt: /* @__PURE__ */ new Date() };
      if (title) updates.title = title;
      if (slug) updates.slug = slug;
      if (targetRoles) updates.targetRoles = targetRoles;
      if (blocks) updates.blocks = blocks;
      if (isActive !== void 0) updates.isActive = isActive;
      const [page] = await db.update(dynamicPages).set(updates).where(eq2(dynamicPages.id, id)).returning();
      if (!page) return res.status(404).json({ error: "Page not found" });
      cache.invalidatePattern("^app_config_");
      res.json({ success: true, page });
    } catch (error) {
      res.status(500).json({ error: "Failed to update page" });
    }
  });
  app2.delete("/api/admin/dynamic-pages/:id", requireAuth, requireRole("SUPER_ADMIN"), async (req, res) => {
    try {
      const [deleted] = await db.delete(dynamicPages).where(eq2(dynamicPages.id, req.params.id)).returning();
      if (!deleted) return res.status(404).json({ error: "Page not found" });
      cache.invalidatePattern("^app_config_");
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete page" });
    }
  });
  app2.get("/api/admin/announcements", requireAuth, requireRole("SUPER_ADMIN"), async (req, res) => {
    try {
      const announcements = await db.select().from(appAnnouncements);
      res.json(announcements);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch announcements" });
    }
  });
  app2.post("/api/admin/announcements", requireAuth, requireRole("SUPER_ADMIN"), async (req, res) => {
    try {
      const { title, message, type, icon, color, targetRoles, actionLabel, actionRoute, priority, expiresAt } = req.body;
      if (!title || !message) return res.status(400).json({ error: "title and message are required" });
      const id = `ann_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      const [announcement] = await db.insert(appAnnouncements).values({
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
        expiresAt: expiresAt ? new Date(expiresAt) : null
      }).returning();
      res.json({ success: true, announcement });
    } catch (error) {
      res.status(500).json({ error: "Failed to create announcement" });
    }
  });
  app2.put("/api/admin/announcements/:id", requireAuth, requireRole("SUPER_ADMIN"), async (req, res) => {
    try {
      const { title, message, type, icon, color, targetRoles, actionLabel, actionRoute, isActive, priority, expiresAt } = req.body;
      const updates = {};
      if (title) updates.title = title;
      if (message) updates.message = message;
      if (type) updates.type = type;
      if (icon) updates.icon = icon;
      if (color) updates.color = color;
      if (targetRoles) updates.targetRoles = targetRoles;
      if (actionLabel !== void 0) updates.actionLabel = actionLabel;
      if (actionRoute !== void 0) updates.actionRoute = actionRoute;
      if (isActive !== void 0) updates.isActive = isActive;
      if (priority !== void 0) updates.priority = priority;
      if (expiresAt !== void 0) updates.expiresAt = expiresAt ? new Date(expiresAt) : null;
      const [announcement] = await db.update(appAnnouncements).set(updates).where(eq2(appAnnouncements.id, req.params.id)).returning();
      if (!announcement) return res.status(404).json({ error: "Announcement not found" });
      cache.invalidatePattern("^app_config_");
      res.json({ success: true, announcement });
    } catch (error) {
      res.status(500).json({ error: "Failed to update announcement" });
    }
  });
  app2.delete("/api/admin/announcements/:id", requireAuth, requireRole("SUPER_ADMIN"), async (req, res) => {
    try {
      const [deleted] = await db.delete(appAnnouncements).where(eq2(appAnnouncements.id, req.params.id)).returning();
      if (!deleted) return res.status(404).json({ error: "Announcement not found" });
      cache.invalidatePattern("^app_config_");
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete announcement" });
    }
  });
  app2.get("/api/maps-key", (_req, res) => {
    res.json({ key: process.env.GOOGLE_API_KEY_FOR_MAP || "" });
  });
  app2.get("/api/map-frame", (_req, res) => {
    const key = process.env.GOOGLE_API_KEY_FOR_MAP || "";
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.removeHeader("X-Frame-Options");
    res.setHeader("Content-Security-Policy", "frame-ancestors *");
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    const SHARED_JS = `
var VS=[],CC={},P='#FF6B00',_fs=false;
function mS(i,f,s,big){var w=big?36:32,h=big?44:40,cx=w/2,cy=big?18:16,r=big?16:14,fs=big?15:13,py1=big?32:28,py2=big?42:38,pcx=big?28:25,pcy=big?10:7;return'data:image/svg+xml;charset=UTF-8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="'+w+'" height="'+h+'" viewBox="0 0 '+w+' '+h+'"><circle cx="'+cx+'" cy="'+cy+'" r="'+r+'" fill="'+f+'" stroke="white" stroke-width="2.5"/><text x="'+cx+'" y="'+(cy+5)+'" text-anchor="middle" font-family="Arial" font-weight="700" font-size="'+fs+'" fill="white">'+i+'</text><polygon points="'+(cx-5)+','+py1+' '+(cx+5)+','+py1+' '+cx+','+py2+'" fill="'+f+'"/><circle cx="'+pcx+'" cy="'+pcy+'" r="5" fill="'+s+'" stroke="white" stroke-width="1.5"/></svg>')}
function mU(){return'data:image/svg+xml;charset=UTF-8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36"><circle cx="18" cy="18" r="16" fill="rgba(66,133,244,0.2)"/><circle cx="18" cy="18" r="9" fill="#4285F4" stroke="white" stroke-width="3"/></svg>')}
function mC(n){return'data:image/svg+xml;charset=UTF-8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44"><circle cx="22" cy="22" r="20" fill="'+P+'" stroke="white" stroke-width="2.5"/><text x="22" y="28" text-anchor="middle" font-family="Arial" font-weight="700" font-size="'+(n>99?11:13)+'px" fill="white">'+n+'</text></svg>')}`;
    if (key) {
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
  app2.get("/api/explore-3d-frame", (_req, res) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
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
  let _earthTexCache = null;
  app2.get("/api/earth-texture", async (_req, res) => {
    try {
      if (!_earthTexCache) {
        const r = await fetch("https://cdn.jsdelivr.net/npm/three-globe@2.27.1/example/img/earth-blue-marble.jpg");
        if (!r.ok) throw new Error("upstream");
        _earthTexCache = Buffer2.from(await r.arrayBuffer());
      }
      res.setHeader("Content-Type", "image/jpeg");
      res.setHeader("Cache-Control", "public, max-age=604800");
      res.send(_earthTexCache);
    } catch {
      res.status(404).end();
    }
  });
  app2.get("/api/globe-frame", (_req, res) => {
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
  app2.get("/api/app-config", async (req, res) => {
    try {
      const role = req.query.role || "CUSTOMER";
      const cacheKey = `app_config_${role}`;
      const cached = cache.get(cacheKey);
      if (cached) return res.json(cached);
      const allFlags = await db.select().from(featureFlags).where(eq2(featureFlags.enabled, true));
      const activeFlags = allFlags.filter((f) => {
        const roles = f.roles;
        return roles.includes("ALL") || roles.includes(role);
      });
      const allAnnouncements = await db.select().from(appAnnouncements).where(eq2(appAnnouncements.isActive, true));
      const activeAnnouncements = allAnnouncements.filter((a) => {
        if (a.expiresAt && new Date(a.expiresAt) < /* @__PURE__ */ new Date()) return false;
        const roles = a.targetRoles;
        return roles.includes("ALL") || roles.includes(role);
      }).sort((a, b) => (b.priority || 0) - (a.priority || 0));
      const allPages = await db.select().from(dynamicPages).where(eq2(dynamicPages.isActive, true));
      const activePages = allPages.filter((p) => {
        const roles = p.targetRoles;
        return roles.includes("ALL") || roles.includes(role);
      });
      const result = { featureFlags: activeFlags.map((f) => f.name), announcements: activeAnnouncements, dynamicPages: activePages };
      cache.set(cacheKey, result, CACHE_TTL.APP_CONFIG);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch app config" });
    }
  });
  app2.post("/api/admin/ai-designer", requireAuth, requireRole("SUPER_ADMIN"), async (req, res) => {
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

Use saffron (#FF6B00) as primary color, dark blue (#0B1E3D) as secondary. Use Indian context (\u20B9 currency, Hindi-English mix, local references).
Respond ONLY with valid JSON, no explanation.`;
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 2e3,
        response_format: { type: "json_object" }
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
  app2.post("/api/otp/send", async (req, res) => {
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
      let emailError = null;
      const whatsappConfigured = await isWhatsAppConfigured();
      if (whatsappConfigured) {
        const waResult = await sendWhatsAppOtp(cleanPhone, code);
        whatsappSent = waResult.sent;
        if (!waResult.sent) {
          console.error("WhatsApp send failed:", waResult.error);
        }
      }
      if (!whatsappSent && isSmsConfigured()) {
        const smsResult = await sendSmsOtp(cleanPhone, code);
        smsSent = smsResult.sent;
        if (!smsResult.sent) {
          console.error("SMS send failed:", smsResult.error);
        }
      }
      if (!whatsappSent && !smsSent && email && resend) {
        try {
          const fromEmail = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
          await resend.emails.send({
            from: `Go Bharat <${fromEmail}>`,
            to: email,
            subject: `${code} is your Go Bharat verification code`,
            html: `
              <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 480px; margin: 0 auto; background: #fff; border-radius: 16px; overflow: hidden; border: 1px solid #eee;">
                <div style="background: linear-gradient(135deg, #FF6B00, #FF8A33); padding: 32px 24px; text-align: center;">
                  <h1 style="color: #fff; margin: 0; font-size: 24px;">Go Bharat</h1>
                  <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0; font-size: 14px;">Your Hyperlocal Super App</p>
                </div>
                <div style="padding: 32px 24px; text-align: center;">
                  <p style="color: #333; font-size: 16px; margin: 0 0 8px;">Hello <strong>${name || "User"}</strong>,</p>
                  <p style="color: #666; font-size: 14px; margin: 0 0 24px;">Use this code to verify your ${role || "account"} login:</p>
                  <div style="background: #F8F9FA; border-radius: 12px; padding: 20px; margin: 0 0 24px; border: 2px dashed #FF6B00;">
                    <span style="font-size: 36px; font-weight: 700; letter-spacing: 8px; color: #0B1E3D;">${code}</span>
                  </div>
                  <p style="color: #999; font-size: 12px; margin: 0;">This code expires in 5 minutes. Do not share it with anyone.</p>
                </div>
                <div style="background: #F8F9FA; padding: 16px 24px; text-align: center; border-top: 1px solid #eee;">
                  <p style="color: #999; font-size: 11px; margin: 0;">Sent to ${email} for phone +91 ${cleanPhone}</p>
                </div>
              </div>
            `
          });
          emailSent = true;
        } catch (err) {
          console.error("Email send error:", err?.message || err);
          emailError = err?.message || "Failed to send email";
        }
      }
      const maskedEmail = email ? email.replace(/(.{2})(.*)(@.*)/, "$1***$3") : null;
      const anyChannelSent = whatsappSent || smsSent || emailSent;
      res.json({
        success: true,
        whatsappSent,
        smsSent,
        emailSent,
        maskedEmail,
        whatsappConfigured,
        smsConfigured: isSmsConfigured(),
        emailConfigured: !!resend,
        ...emailError && { emailError },
        // SAFEGUARD: never expose the raw code in production. It is only
        // returned in development builds so the team isn't locked out before
        // the WhatsApp authentication template is approved by Meta.
        ...!IS_PRODUCTION4 && { devOtp: code },
        // Tell the client when every delivery channel failed so it can show a
        // clear "couldn't send" error + resend instead of a fake success.
        deliveryFailed: !anyChannelSent
      });
    } catch (error) {
      console.error("OTP send error:", error);
      res.status(500).json({ error: "Failed to send OTP" });
    }
  });
  app2.post("/api/otp/verify", async (req, res) => {
    try {
      const { phone, code, role } = req.body;
      if (!phone || !code) return res.status(400).json({ error: "Phone and OTP code are required" });
      const cleanPhone = phone.replace(/\D/g, "").slice(-10);
      const verified = await storage.verifyOtp(cleanPhone, code);
      if (!verified) {
        return res.json({ success: false, error: "Invalid or expired OTP. Please try again." });
      }
      let resolvedRole = "CUSTOMER";
      let resolvedId = cleanPhone;
      let resolvedName = null;
      const adminPhone = process.env.ADMIN_PHONE || "+919168134109";
      const cleanAdminPhone = adminPhone.replace(/\D/g, "").slice(-10);
      const phoneMatch = (col) => or(
        eq2(col, cleanPhone),
        eq2(col, "+91" + cleanPhone),
        eq2(col, "91" + cleanPhone),
        sql3`RIGHT(REPLACE(REPLACE(${col}, '+', ''), ' ', ''), 10) = ${cleanPhone}`
      );
      if (cleanPhone === cleanAdminPhone) {
        resolvedRole = "SUPER_ADMIN";
        resolvedId = "admin";
        resolvedName = "Super Admin";
      } else {
        const [teamMember] = await db.select().from(teamMembers).where(phoneMatch(teamMembers.phone));
        console.log(`[OTP-VERIFY] cleanPhone=${cleanPhone} teamMember=${JSON.stringify(teamMember ? { id: teamMember.id, phone: teamMember.phone, role: teamMember.role, status: teamMember.status } : null)}`);
        if (teamMember && teamMember.status === "ACTIVE") {
          resolvedRole = teamMember.role;
          resolvedId = teamMember.id;
          resolvedName = teamMember.name || null;
        } else {
          const [vendorApp] = await db.select().from(vendorApplications).where(
            and2(
              phoneMatch(vendorApplications.phone),
              or(eq2(vendorApplications.status, "APPROVED"), eq2(vendorApplications.status, "LIVE"))
            )
          );
          if (vendorApp) {
            resolvedRole = "VENDOR";
            resolvedId = vendorApp.id;
          } else {
            const [vendorAppAny] = await db.select({ id: vendorApplications.id }).from(vendorApplications).innerJoin(vendors, eq2(vendors.id, vendorApplications.id)).where(phoneMatch(vendorApplications.phone));
            if (vendorAppAny) {
              resolvedRole = "VENDOR";
              resolvedId = vendorAppAny.id;
              try {
                await db.update(vendorApplications).set({ status: "LIVE" }).where(eq2(vendorApplications.id, vendorAppAny.id));
              } catch {
              }
            } else if (role === "CUSTOMER") {
              resolvedRole = "CUSTOMER";
            }
          }
        }
      }
      const token = generateToken(cleanPhone, resolvedRole, resolvedId);
      res.json({ success: true, token, role: resolvedRole, name: resolvedName, id: resolvedId });
    } catch (error) {
      console.error("OTP verify error:", error);
      res.status(500).json({ error: "Failed to verify OTP" });
    }
  });
  app2.delete("/api/user/:userId", requireAuth, requireRole("SUPER_ADMIN"), async (req, res) => {
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
  app2.post("/api/withdrawals/request", requireAuth, async (req, res) => {
    try {
      const { userName, amount, method, bankDetails } = req.body;
      const bodyUserId = req.body?.userId;
      if (!bodyUserId || !amount || !method || !bankDetails) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      const requesterId = req.user?.id || req.user?.phone?.replace(/\D/g, "").slice(-10) || "";
      if (requesterId && requesterId !== bodyUserId) {
        return res.status(403).json({ error: "You can only request withdrawals for your own account" });
      }
      const userId = requesterId || bodyUserId;
      const userRole = (req.user?.role || "DELIVERY").toUpperCase();
      const normalizedMethod = String(method).toUpperCase();
      if (normalizedMethod !== "UPI" && normalizedMethod !== "BANK") {
        return res.status(400).json({ error: "Invalid payout method. Must be UPI or BANK." });
      }
      const bd = bankDetails || {};
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
      if (amt > 5e4) {
        return res.status(400).json({ error: "Maximum withdrawal amount is \u20B950,000 per request" });
      }
      const id = `wd_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      const walletTxnId = `wt_wd_${Date.now()}_${crypto4.randomBytes(4).toString("hex")}`;
      const walletRef = `Withdrawal Request:${id}`;
      const outcome = await db.transaction(async (tx) => {
        await tx.execute(sql3`SELECT pg_advisory_xact_lock(hashtext(${"wallet:" + userId}))`);
        const [pendingResult] = await tx.select({ count: sql3`count(*)::int` }).from(withdrawalRequests).where(and2(
          eq2(withdrawalRequests.userId, userId),
          or(eq2(withdrawalRequests.status, "PENDING"), eq2(withdrawalRequests.status, "PROCESSING"))
        ));
        if ((pendingResult?.count || 0) >= 3) {
          return { ok: false, code: 400, error: "You already have 3 pending withdrawal requests. Please wait for them to be processed." };
        }
        const walletTxns = await tx.select({ type: walletTransactions.type, amount: walletTransactions.amount }).from(walletTransactions).where(eq2(walletTransactions.userId, userId));
        const walletBalance = walletTxns.reduce((sum, t) => sum + (t.type === "CREDIT" ? t.amount : -t.amount), 0);
        if (amt > walletBalance) {
          return { ok: false, code: 400, error: `Insufficient wallet balance. Available: \u20B9${Math.max(0, walletBalance).toFixed(0)}` };
        }
        const [newRequest] = await tx.insert(withdrawalRequests).values({
          id,
          userId,
          userName: userName || "User",
          userRole,
          amount: amt,
          method: normalizedMethod,
          bankDetails,
          status: "PENDING"
        }).returning();
        await tx.insert(walletTransactions).values({
          id: walletTxnId,
          userId,
          type: "DEBIT",
          amount: amt,
          reference: walletRef
        });
        return { ok: true, withdrawal: newRequest, newWalletBalance: walletBalance - amt };
      });
      if (!outcome.ok) {
        return res.status(outcome.code).json({ error: outcome.error });
      }
      res.json({ success: true, withdrawal: outcome.withdrawal, newWalletBalance: outcome.newWalletBalance });
    } catch (error) {
      if (error?.code === "23505") {
        return res.status(409).json({ error: "This withdrawal request was already submitted." });
      }
      console.error("Withdrawal request error:", error);
      res.status(500).json({ error: "Failed to create withdrawal request" });
    }
  });
  app2.get("/api/withdrawals/:userId", requireAuth, async (req, res) => {
    try {
      const { userId } = req.params;
      const requesterId = req.user?.id || req.user?.phone?.replace(/\D/g, "").slice(-10) || "";
      const requesterRole = req.user?.role || "";
      if (requesterId !== userId && requesterRole !== "SUPER_ADMIN") {
        return res.status(403).json({ error: "Forbidden" });
      }
      const userWithdrawals = await db.select().from(withdrawalRequests).where(eq2(withdrawalRequests.userId, userId)).orderBy(desc2(withdrawalRequests.createdAt));
      const totalWithdrawn = userWithdrawals.filter((w) => w.status === "COMPLETED").reduce((sum, w) => sum + (w.amount || 0), 0);
      const pendingAmount = userWithdrawals.filter((w) => w.status === "PENDING" || w.status === "PROCESSING").reduce((sum, w) => sum + (w.amount || 0), 0);
      res.json({ withdrawals: userWithdrawals, totalWithdrawn, pendingAmount });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch withdrawals" });
    }
  });
  app2.get("/api/withdrawals", requireAuth, requireRole("SUPER_ADMIN"), async (_req, res) => {
    try {
      const allWithdrawals = await db.select().from(withdrawalRequests).orderBy(desc2(withdrawalRequests.createdAt));
      res.json({ withdrawals: allWithdrawals });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch withdrawals" });
    }
  });
  app2.get("/api/payout-details/:userId", requireAuth, async (req, res) => {
    try {
      const requesterId = req.user?.id || req.user?.phone?.replace(/\D/g, "").slice(-10) || "";
      const userId = String(req.params.userId);
      if (requesterId && requesterId !== userId && req.user?.role !== "SUPER_ADMIN") {
        return res.status(403).json({ error: "You can only view your own payout details" });
      }
      const [row] = await db.select().from(payoutDetails).where(eq2(payoutDetails.userId, userId)).limit(1);
      res.json({ payoutDetails: row || null });
    } catch (error) {
      console.error("Get payout details error:", error);
      res.status(500).json({ error: "Failed to fetch payout details" });
    }
  });
  app2.put("/api/payout-details", requireAuth, async (req, res) => {
    try {
      const requesterId = req.user?.id || req.user?.phone?.replace(/\D/g, "").slice(-10) || "";
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
        updatedAt: /* @__PURE__ */ new Date()
      };
      if (method === "UPI") {
        if (!row.upiId.includes("@")) return res.status(400).json({ error: "Enter a valid UPI ID (e.g. yourname@bank)" });
      } else {
        if (!/^\d{9,18}$/.test(row.accountNumber)) return res.status(400).json({ error: "Enter a valid account number (9-18 digits)" });
        if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(row.ifsc)) return res.status(400).json({ error: "Enter a valid IFSC code (e.g. SBIN0001234)" });
      }
      await db.insert(payoutDetails).values(row).onConflictDoUpdate({
        target: payoutDetails.userId,
        set: {
          method: row.method,
          accountHolder: row.accountHolder,
          bankName: row.bankName,
          accountNumber: row.accountNumber,
          ifsc: row.ifsc,
          upiId: row.upiId,
          updatedAt: row.updatedAt
        }
      });
      res.json({ success: true, payoutDetails: row });
    } catch (error) {
      console.error("Save payout details error:", error);
      res.status(500).json({ error: "Failed to save payout details" });
    }
  });
  async function refundWithdrawalIfDebited(tx, withdrawal) {
    const [debitRow] = await tx.select({ id: walletTransactions.id }).from(walletTransactions).where(and2(
      eq2(walletTransactions.userId, withdrawal.userId),
      eq2(walletTransactions.reference, `Withdrawal Request:${withdrawal.id}`)
    )).limit(1);
    if (!debitRow) return false;
    await tx.insert(walletTransactions).values({
      id: `wt_refund_${Date.now()}_${crypto4.randomBytes(4).toString("hex")}`,
      userId: withdrawal.userId,
      type: "CREDIT",
      amount: withdrawal.amount,
      reference: `Withdrawal Refund:${withdrawal.id}`
    }).onConflictDoNothing({ target: walletTransactions.reference });
    return true;
  }
  app2.patch("/api/withdrawals/:id/approve", requireAuth, requireRole("SUPER_ADMIN"), async (req, res) => {
    try {
      const wid = String(req.params.id);
      const provider = getConfiguredPayoutProvider();
      const idempotencyKey = `payout_${wid}`;
      const [updated] = await db.update(withdrawalRequests).set({ status: "PROCESSING", payoutProvider: provider, payoutIdempotencyKey: idempotencyKey, payoutError: null }).where(and2(eq2(withdrawalRequests.id, wid), eq2(withdrawalRequests.status, "PENDING"))).returning();
      if (!updated) {
        const [wd] = await db.select().from(withdrawalRequests).where(eq2(withdrawalRequests.id, wid));
        if (!wd) return res.status(404).json({ error: "Withdrawal not found" });
        return res.status(409).json({ error: "Can only approve pending requests" });
      }
      if (provider === "manual") {
        return res.json({ success: true, withdrawal: updated, mode: "manual" });
      }
      const [pd] = await db.select().from(payoutDetails).where(eq2(payoutDetails.userId, updated.userId)).limit(1);
      const bank = updated.bankDetails || {};
      const method = updated.method === "UPI" ? "UPI" : "BANK";
      const upiId = String(pd?.upiId || bank.upiId || "").trim();
      const accountNumber = String(pd?.accountNumber || bank.accountNumber || "").trim();
      const ifsc = String(pd?.ifsc || bank.ifsc || "").trim().toUpperCase();
      const beneficiaryName = String(pd?.accountHolder || updated.userName || "Go Bharat User").trim();
      const destInvalid = method === "UPI" ? !upiId.includes("@") : !(/^\d{9,18}$/.test(accountNumber) && /^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc));
      if (destInvalid) {
        await db.update(withdrawalRequests).set({ status: "PENDING", payoutError: "Missing or invalid payout destination" }).where(and2(eq2(withdrawalRequests.id, wid), eq2(withdrawalRequests.status, "PROCESSING")));
        return res.status(400).json({ error: "Missing or invalid payout destination for this user." });
      }
      const result = await createPayout({
        withdrawalId: wid,
        amountInr: updated.amount,
        destination: { method, upiId, accountNumber, ifsc },
        beneficiaryName,
        idempotencyKey
      });
      if (result.notConfigured) {
        await db.update(withdrawalRequests).set({ status: "PENDING", payoutError: result.error || "Payout provider not configured" }).where(and2(eq2(withdrawalRequests.id, wid), eq2(withdrawalRequests.status, "PROCESSING")));
        return res.status(503).json({ error: result.error || "Payout provider not configured" });
      }
      if (!result.success && result.ambiguous) {
        await db.update(withdrawalRequests).set({ payoutStatus: "unknown", payoutError: result.error || "Awaiting payout confirmation" }).where(and2(eq2(withdrawalRequests.id, wid), eq2(withdrawalRequests.status, "PROCESSING")));
        return res.status(202).json({ pending: true, message: "Payout submitted; awaiting confirmation.", withdrawal: { ...updated, status: "PROCESSING" } });
      }
      if (!result.success) {
        await db.update(withdrawalRequests).set({ status: "PENDING", payoutError: result.error || "Payout failed" }).where(and2(eq2(withdrawalRequests.id, wid), eq2(withdrawalRequests.status, "PROCESSING")));
        return res.status(400).json({ error: result.error || "Payout failed" });
      }
      if (result.normalizedStatus === "FAILED") {
        const outcome = await db.transaction(async (tx) => {
          const [u] = await tx.update(withdrawalRequests).set({
            status: "REJECTED",
            rejectionReason: `Automatic payout ${result.rawStatus || "failed"}`,
            payoutRef: result.ref,
            payoutStatus: result.rawStatus,
            processedAt: /* @__PURE__ */ new Date()
          }).where(and2(eq2(withdrawalRequests.id, wid), eq2(withdrawalRequests.status, "PROCESSING"))).returning();
          if (u) await refundWithdrawalIfDebited(tx, u);
          return u;
        });
        return res.status(200).json({ success: false, failed: true, error: `Payout ${result.rawStatus}`, withdrawal: outcome });
      }
      const patch = { payoutRef: result.ref, payoutStatus: result.rawStatus, payoutError: null };
      if (result.normalizedStatus === "COMPLETED") {
        patch.status = "COMPLETED";
        patch.processedAt = /* @__PURE__ */ new Date();
        patch.transactionId = result.ref;
      }
      const [final] = await db.update(withdrawalRequests).set(patch).where(and2(eq2(withdrawalRequests.id, wid), eq2(withdrawalRequests.status, "PROCESSING"))).returning();
      return res.json({ success: true, withdrawal: final || { ...updated, ...patch } });
    } catch (error) {
      console.error("Approve withdrawal error:", error);
      res.status(500).json({ error: "Failed to approve withdrawal" });
    }
  });
  app2.patch("/api/withdrawals/:id/complete", requireAuth, requireRole("SUPER_ADMIN"), async (req, res) => {
    try {
      const wid = String(req.params.id);
      const [updated] = await db.update(withdrawalRequests).set({
        status: "COMPLETED",
        processedAt: /* @__PURE__ */ new Date(),
        transactionId: `TXN${Date.now()}`
      }).where(and2(
        eq2(withdrawalRequests.id, wid),
        or(eq2(withdrawalRequests.status, "PENDING"), eq2(withdrawalRequests.status, "PROCESSING")),
        or(isNull(withdrawalRequests.payoutProvider), eq2(withdrawalRequests.payoutProvider, "manual"))
      )).returning();
      if (!updated) {
        const [wd] = await db.select().from(withdrawalRequests).where(eq2(withdrawalRequests.id, wid));
        if (!wd) return res.status(404).json({ error: "Withdrawal not found" });
        if (wd.payoutProvider && wd.payoutProvider !== "manual" && wd.status === "PROCESSING") {
          return res.status(409).json({ error: "This payout is automated \u2014 it completes automatically once the provider confirms." });
        }
        return res.status(409).json({ error: "Can only complete pending/processing requests" });
      }
      res.json({ success: true, withdrawal: updated });
    } catch (error) {
      res.status(500).json({ error: "Failed to complete withdrawal" });
    }
  });
  app2.patch("/api/withdrawals/:id/reject", requireAuth, requireRole("SUPER_ADMIN"), async (req, res) => {
    try {
      const wid = String(req.params.id);
      const outcome = await db.transaction(async (tx) => {
        const [updated] = await tx.update(withdrawalRequests).set({
          status: "REJECTED",
          rejectionReason: req.body.reason || "Request rejected by admin",
          processedAt: /* @__PURE__ */ new Date()
        }).where(and2(
          eq2(withdrawalRequests.id, wid),
          or(
            eq2(withdrawalRequests.status, "PENDING"),
            and2(
              eq2(withdrawalRequests.status, "PROCESSING"),
              or(isNull(withdrawalRequests.payoutProvider), eq2(withdrawalRequests.payoutProvider, "manual"))
            )
          )
        )).returning();
        if (!updated) {
          const [wd] = await tx.select().from(withdrawalRequests).where(eq2(withdrawalRequests.id, wid));
          if (!wd) return { ok: false, code: 404, error: "Withdrawal not found" };
          if (wd.payoutProvider && wd.payoutProvider !== "manual" && wd.status === "PROCESSING") {
            return { ok: false, code: 409, error: "This payout is already being disbursed automatically and can't be rejected. It will auto-refund if the payout fails." };
          }
          return { ok: false, code: 409, error: "Can only reject pending/processing requests" };
        }
        await refundWithdrawalIfDebited(tx, updated);
        return { ok: true, withdrawal: updated };
      });
      if (!outcome.ok) return res.status(outcome.code).json({ error: outcome.error });
      res.json({ success: true, withdrawal: outcome.withdrawal });
    } catch (error) {
      if (error?.code === "23505") {
        return res.status(409).json({ error: "This withdrawal was already refunded." });
      }
      console.error("Reject withdrawal error:", error);
      res.status(500).json({ error: "Failed to reject withdrawal" });
    }
  });
  app2.get("/api/payments/razorpay-config", (_req, res) => {
    try {
      res.json({
        configured: isRazorpayConfigured(),
        keyId: getRazorpayKeyId()
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch payment config" });
    }
  });
  app2.post("/api/payments/razorpay-create-order", async (req, res) => {
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
        const txnId = `RP_${Date.now()}_${crypto4.randomBytes(4).toString("hex")}`;
        await db.insert(transactions).values({
          id: txnId,
          orderId: orderId || "",
          amount,
          status: "pending",
          method: "razorpay",
          razorpayOrderId: result.order.id
        });
        res.json({
          orderId: result.order.id,
          amount: result.order.amount,
          currency: result.order.currency,
          keyId: getRazorpayKeyId()
        });
      } else {
        res.status(500).json({ error: result.error || "Failed to create order" });
      }
    } catch (error) {
      console.error("Razorpay order error:", error.message);
      res.status(500).json({ error: error.message || "Failed to create Razorpay order" });
    }
  });
  app2.post("/api/payments/razorpay-verify", async (req, res) => {
    try {
      const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
      if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
        return res.status(400).json({ error: "Missing payment verification fields" });
      }
      const isValid = verifyRazorpaySignature(razorpay_order_id, razorpay_payment_id, razorpay_signature);
      if (isValid) {
        await db.update(transactions).set({ status: "completed", razorpayPaymentId: razorpay_payment_id }).where(eq2(transactions.razorpayOrderId, razorpay_order_id));
        const paymentDetails = await fetchRazorpayPayment(razorpay_payment_id);
        res.json({
          verified: true,
          paymentId: razorpay_payment_id,
          method: paymentDetails.payment?.method || "unknown",
          status: "paid"
        });
      } else {
        res.status(400).json({ verified: false, error: "Invalid payment signature" });
      }
    } catch (error) {
      console.error("Razorpay verify error:", error.message);
      res.status(500).json({ error: error.message || "Verification failed" });
    }
  });
  async function handleRazorpayWebhook(req, res) {
    try {
      const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
      if (!webhookSecret) {
        console.error("RAZORPAY_WEBHOOK_SECRET not configured \u2014 rejecting webhook");
        return res.status(401).json({ error: "Webhook secret not configured" });
      }
      const signature = req.header("x-razorpay-signature");
      if (!signature) return res.status(400).json({ error: "Missing signature" });
      const rawBody = req.rawBody;
      if (!rawBody) {
        console.error("Raw body not available for webhook verification");
        return res.status(500).json({ error: "Raw body not captured" });
      }
      const expected = crypto4.createHmac("sha256", webhookSecret).update(rawBody).digest("hex");
      if (expected !== signature) return res.status(400).json({ error: "Invalid signature" });
      const event = req.body?.event;
      const payload = req.body?.payload;
      if (event === "payment.captured" && payload?.payment?.entity) {
        const payment = payload.payment.entity;
        await db.update(transactions).set({ status: "completed", razorpayPaymentId: payment.id }).where(eq2(transactions.razorpayOrderId, payment.order_id));
        const txn = await db.select({ orderId: transactions.orderId }).from(transactions).where(eq2(transactions.razorpayOrderId, payment.order_id)).limit(1);
        const orderId = txn[0]?.orderId;
        if (orderId) {
          await db.update(orders).set({ status: "ACCEPTED", paymentStatus: "PAID" }).where(and2(eq2(orders.id, orderId), eq2(orders.status, "PENDING")));
          console.log(`[Webhook] Order ${orderId} accepted and paymentStatus set to PAID after payment.captured`);
        }
      } else if (event === "payment.failed" && payload?.payment?.entity) {
        const payment = payload.payment.entity;
        await db.update(transactions).set({ status: "failed", razorpayPaymentId: payment.id }).where(eq2(transactions.razorpayOrderId, payment.order_id));
        const txn = await db.select({ orderId: transactions.orderId }).from(transactions).where(eq2(transactions.razorpayOrderId, payment.order_id)).limit(1);
        const orderId = txn[0]?.orderId;
        if (orderId) {
          await db.update(orders).set({ status: "PAYMENT_FAILED", paymentStatus: "FAILED" }).where(and2(eq2(orders.id, orderId), eq2(orders.status, "PENDING")));
          console.log(`[Webhook] Order ${orderId} marked PAYMENT_FAILED after payment.failed`);
        }
      }
      res.json({ status: "ok" });
    } catch (error) {
      console.error("Webhook error:", error.message);
      res.status(500).json({ error: "Webhook processing failed" });
    }
  }
  app2.post("/api/payments/webhook", handleRazorpayWebhook);
  app2.post("/api/razorpay-webhook", handleRazorpayWebhook);
  async function handleRazorpayXPayoutWebhook(req, res) {
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
      const payoutId = String(entity.id);
      const refId = String(entity.reference_id || "");
      const widFromRef = refId.startsWith("withdrawal_") ? refId.slice("withdrawal_".length) : "";
      const wid = String(entity.notes?.withdrawal_id || widFromRef || "");
      let [withdrawal] = await db.select().from(withdrawalRequests).where(eq2(withdrawalRequests.payoutRef, payoutId)).limit(1);
      if (!withdrawal && wid) {
        [withdrawal] = await db.select().from(withdrawalRequests).where(eq2(withdrawalRequests.id, wid)).limit(1);
      }
      if (!withdrawal) return res.json({ status: "unknown" });
      if (!withdrawal.payoutRef) {
        await db.update(withdrawalRequests).set({ payoutRef: payoutId }).where(eq2(withdrawalRequests.id, withdrawal.id));
      }
      const status = String(entity.status || "").toLowerCase();
      const isProcessed = event === "payout.processed" || status === "processed";
      const isFailed = ["payout.failed", "payout.reversed", "payout.rejected", "payout.cancelled"].includes(event) || ["failed", "reversed", "rejected", "cancelled"].includes(status);
      if (isProcessed) {
        await db.update(withdrawalRequests).set({
          status: "COMPLETED",
          payoutStatus: status || "processed",
          processedAt: /* @__PURE__ */ new Date(),
          transactionId: payoutId,
          payoutError: null
        }).where(and2(eq2(withdrawalRequests.id, withdrawal.id), eq2(withdrawalRequests.status, "PROCESSING")));
      } else if (isFailed) {
        await db.transaction(async (tx) => {
          const [u] = await tx.update(withdrawalRequests).set({
            status: "REJECTED",
            rejectionReason: `Automatic payout ${status || "failed"}`,
            payoutStatus: status || "failed",
            processedAt: /* @__PURE__ */ new Date()
          }).where(and2(
            eq2(withdrawalRequests.id, withdrawal.id),
            or(eq2(withdrawalRequests.status, "PROCESSING"), eq2(withdrawalRequests.status, "COMPLETED"))
          )).returning();
          if (u) await refundWithdrawalIfDebited(tx, u);
        });
      }
      res.json({ status: "ok" });
    } catch (error) {
      console.error("Payout webhook error:", error?.message);
      res.status(500).json({ error: "Payout webhook processing failed" });
    }
  }
  app2.post("/api/withdrawals/razorpayx-webhook", handleRazorpayXPayoutWebhook);
  app2.post("/api/payouts/webhook", handleRazorpayXPayoutWebhook);
  app2.get("/api/payments/razorpay-status/:paymentId", async (req, res) => {
    try {
      const result = await fetchRazorpayPayment(req.params.paymentId);
      if (result.success && result.payment) {
        res.json({
          status: result.payment.status,
          method: result.payment.method,
          amount: result.payment.amount / 100,
          currency: result.payment.currency
        });
      } else {
        res.status(404).json({ error: result.error || "Payment not found" });
      }
    } catch (error) {
      res.status(500).json({ error: error.message || "Failed to fetch payment" });
    }
  });
  app2.get("/api/payments/razorpay-checkout", (req, res) => {
    const orderId = String(req.query.order_id || "").replace(/[^a-zA-Z0-9_]/g, "");
    const keyId2 = String(req.query.key_id || "").replace(/[^a-zA-Z0-9_]/g, "");
    const amount = parseInt(String(req.query.amount || "0"), 10);
    const method = req.query.method === "upi" ? "upi" : "netbanking";
    const baseUrl = `https://${req.headers.host}`;
    const rawReturnUrl = String(req.query.return_url || "");
    let returnUrl = "";
    try {
      const parsed = new URL(rawReturnUrl);
      const serverHost = req.headers.host || "";
      if (parsed.host === serverHost) {
        returnUrl = parsed.toString().replace(/[<>"']/g, "");
      }
    } catch {
      if (rawReturnUrl.startsWith("/")) {
        returnUrl = rawReturnUrl.replace(/[<>"']/g, "");
      }
    }
    const blockConfig = method === "upi" ? 'upi:{name:"Pay via UPI",instruments:[{method:"upi"}]}' : 'nb:{name:"Net Banking",instruments:[{method:"netbanking"}]}';
    const blockSeq = method === "upi" ? "block.upi" : "block.nb";
    const redirectBack = (status, extraJsExpr) => {
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
var options={key:"${keyId2}",amount:${amount},currency:"INR",name:"Go Bharat",description:"Order Payment",order_id:"${orderId}",
prefill:{},
config:{display:{blocks:{${blockConfig}},sequence:["${blockSeq}"],preferences:{show_default_blocks:true}}},
handler:function(r){var d=document.getElementById("result");var l=document.getElementById("loading");l.innerHTML='<div class="spinner"></div><h2>Verifying Payment...</h2><p>Please wait</p>';fetch("${baseUrl}/api/payments/razorpay-verify",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({razorpay_order_id:r.razorpay_order_id,razorpay_payment_id:r.razorpay_payment_id,razorpay_signature:r.razorpay_signature})}).then(function(){l.style.display="none";d.style.display="block";d.innerHTML='<div style="font-size:64px">\\u2705</div><h2 class="success">Payment Successful!</h2><p>Returning to app...</p>';setTimeout(function(){${redirectBack("success", `"&razorpay_order_id="+r.razorpay_order_id`)}},800);}).catch(function(){l.style.display="none";d.style.display="block";d.innerHTML='<div style="font-size:64px">\\u2705</div><h2 class="success">Payment Successful!</h2><p>Returning to app...</p>';setTimeout(function(){${redirectBack("success", `"&razorpay_order_id="+r.razorpay_order_id`)}},800);});},
modal:{ondismiss:function(){document.getElementById("loading").style.display="none";var d=document.getElementById("result");d.style.display="block";d.innerHTML='<div style="font-size:64px">\\u274C</div><h2 class="error">Payment Cancelled</h2><p>Returning to app...</p>';setTimeout(function(){${redirectBack("cancelled", '""')}},800);}},
notes:{platform:"go_bharat"}};
var rzp=new Razorpay(options);rzp.on("payment.failed",function(r){document.getElementById("loading").style.display="none";var d=document.getElementById("result");d.style.display="block";d.innerHTML='<div style="font-size:64px">\\u274C</div><h2 class="error">Payment Failed</h2><p>'+r.error.description+'</p>';setTimeout(function(){${redirectBack("failed", '""')}},2000);});
rzp.open();
</script></body></html>`);
  });
  app2.get("/api/payments/razorpay-order-status/:orderId", async (req, res) => {
    try {
      const orderId = req.params.orderId;
      const localTx = await db.select().from(transactions).where(and2(eq2(transactions.razorpayOrderId, orderId), eq2(transactions.status, "completed"))).limit(1);
      if (localTx.length > 0) {
        return res.json({ status: "paid", source: "db" });
      }
      if (!isRazorpayConfigured()) {
        return res.json({ status: "pending" });
      }
      const rpKeyId = process.env.RAZORPAY_KEY_ID;
      const rpKeySecret = process.env.RAZORPAY_KEY_SECRET;
      const auth = Buffer2.from(`${rpKeyId}:${rpKeySecret}`).toString("base64");
      const response = await fetch(`https://api.razorpay.com/v1/orders/${orderId}/payments`, {
        headers: { "Authorization": `Basic ${auth}` }
      });
      const data = await response.json();
      const paidPayment = data.items?.find((p) => p.status === "captured");
      if (paidPayment) {
        res.json({ status: "paid", source: "razorpay" });
      } else {
        res.json({ status: "pending" });
      }
    } catch (error) {
      res.status(500).json({ error: error.message || "Failed to check order status" });
    }
  });
  app2.post("/api/payments/razorpay-refund", requireAuth, requireRole("SUPER_ADMIN"), async (req, res) => {
    try {
      const { paymentId, amount } = req.body;
      if (!paymentId) {
        return res.status(400).json({ error: "Payment ID required" });
      }
      const result = await refundRazorpayPayment(paymentId, amount);
      if (result.success) {
        const updated = await db.update(transactions).set({ status: "refunded" }).where(
          or(
            eq2(transactions.razorpayPaymentId, paymentId),
            eq2(transactions.razorpayOrderId, paymentId)
          )
        ).returning({ id: transactions.id });
        if (updated.length === 0) {
          console.warn(`Refund processed via Razorpay but no matching transaction found for paymentId: ${paymentId}`);
        }
        res.json({ success: true, refund: result.refund, transactionUpdated: updated.length > 0 });
      } else {
        res.status(500).json({ error: result.error || "Refund failed" });
      }
    } catch (error) {
      res.status(500).json({ error: error.message || "Failed to process refund" });
    }
  });
  function getServerBaseUrl(req) {
    const replitDomain = process.env.REPLIT_DEV_DOMAIN || (process.env.REPLIT_DOMAINS || "").split(",")[0].trim();
    if (replitDomain) return `https://${replitDomain}`;
    const proto = req.headers["x-forwarded-proto"] || "https";
    return `${proto}://${req.headers.host}`;
  }
  app2.post("/api/payments/phonepe-initiate", async (req, res) => {
    try {
      const { amount, orderId } = req.body;
      if (!amount || amount <= 0) {
        return res.status(400).json({ error: "Invalid amount" });
      }
      if (!isPhonePeConfigured()) {
        return res.status(503).json({ error: "PhonePe payment is not configured" });
      }
      const txnId = `PP_${Date.now()}_${crypto4.randomBytes(4).toString("hex")}`;
      const baseUrl = getServerBaseUrl(req);
      const canonicalHost = new URL(baseUrl).host;
      const rawReturnUrl = String(req.body.returnUrl || "");
      let appReturnUrl = "";
      try {
        const parsedReturn = new URL(rawReturnUrl);
        if (parsedReturn.host === canonicalHost) {
          appReturnUrl = parsedReturn.toString().replace(/[<>"']/g, "");
        }
      } catch {
      }
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
          gatewayTransactionId: txnId
        });
        res.json({ redirectUrl: result.paymentUrl, transactionId: txnId });
      } else {
        res.status(500).json({ error: result.error || "Failed to initiate PhonePe payment" });
      }
    } catch (error) {
      console.error("PhonePe initiate error:", error.message);
      res.status(500).json({ error: error.message || "Failed to initiate PhonePe payment" });
    }
  });
  app2.get("/api/payments/phonepe-status/:transactionId", async (req, res) => {
    try {
      const { transactionId } = req.params;
      const localTx = await db.select().from(transactions).where(and2(eq2(transactions.id, transactionId), eq2(transactions.status, "completed"))).limit(1);
      if (localTx.length > 0) {
        return res.json({ status: "paid", source: "db" });
      }
      const result = await fetchPhonePeStatus(transactionId);
      if (result.success) {
        if (result.status === "paid") {
          await db.update(transactions).set({ status: "completed" }).where(eq2(transactions.id, transactionId));
        } else if (result.status === "failed") {
          await db.update(transactions).set({ status: "failed" }).where(eq2(transactions.id, transactionId));
        }
        res.json({ status: result.status || "pending" });
      } else {
        res.json({ status: "pending" });
      }
    } catch (error) {
      res.status(500).json({ error: error.message || "Failed to check PhonePe status" });
    }
  });
  app2.get("/api/payments/phonepe-return", async (req, res) => {
    const transactionId = String(req.query.transactionId || "").replace(/[^a-zA-Z0-9_]/g, "");
    const rawReturnUrl = String(req.query.returnUrl || "");
    const baseUrl = getServerBaseUrl(req);
    const canonicalHost = new URL(baseUrl).host;
    let status = "pending";
    try {
      const result = await fetchPhonePeStatus(transactionId);
      if (result.success && result.status) status = result.status;
      if (status === "paid") {
        await db.update(transactions).set({ status: "completed" }).where(eq2(transactions.id, transactionId));
      }
    } catch {
    }
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
  app2.post("/api/payments/phonepe-callback", async (req, res) => {
    try {
      const { response: encodedResponse } = req.body;
      const xVerify = req.header("X-VERIFY");
      if (!encodedResponse) {
        return res.status(400).json({ error: "Missing response payload" });
      }
      if (!xVerify) {
        console.error("PhonePe callback: missing X-VERIFY header \u2014 request rejected");
        return res.status(401).json({ error: "Missing X-VERIFY header" });
      }
      if (!verifyPhonePeCallbackChecksum(encodedResponse, xVerify)) {
        console.error("PhonePe callback: invalid checksum \u2014 request rejected");
        return res.status(401).json({ error: "Invalid checksum" });
      }
      const decoded = JSON.parse(Buffer2.from(encodedResponse, "base64").toString("utf-8"));
      const txnState = decoded?.data?.state || decoded?.code || "";
      const transactionId = String(decoded?.data?.merchantTransactionId || "").replace(/[^a-zA-Z0-9_]/g, "");
      if (transactionId) {
        if (txnState === "COMPLETED") {
          await db.update(transactions).set({ status: "completed" }).where(eq2(transactions.id, transactionId));
        } else if (txnState === "FAILED") {
          await db.update(transactions).set({ status: "failed" }).where(eq2(transactions.id, transactionId));
        }
      }
      res.json({ success: true });
    } catch (error) {
      console.error("PhonePe callback error:", error.message);
      res.status(500).json({ error: "Callback processing failed" });
    }
  });
  app2.get("/api/payments/transactions", requireAuth, requireRole("SUPER_ADMIN", "FRANCHISE"), async (_req, res) => {
    try {
      const allTransactions = await db.select().from(transactions).orderBy(desc2(transactions.createdAt)).limit(100);
      res.json({ transactions: allTransactions });
    } catch (error) {
      res.status(500).json({ error: error.message || "Failed to fetch transactions" });
    }
  });
  app2.post("/api/wallet/topup", requireAuth, async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const { razorpayOrderId } = req.body;
      if (!razorpayOrderId) {
        return res.status(400).json({ error: "razorpayOrderId is required" });
      }
      const rzpKeyId = process.env.RAZORPAY_KEY_ID;
      const rzpKeySecret = process.env.RAZORPAY_KEY_SECRET;
      if (!rzpKeyId || !rzpKeySecret) {
        return res.status(500).json({ error: "Payment gateway not configured" });
      }
      const auth = Buffer2.from(`${rzpKeyId}:${rzpKeySecret}`).toString("base64");
      let verifiedAmount;
      try {
        const orderRes = await fetch(`https://api.razorpay.com/v1/orders/${razorpayOrderId}`, {
          headers: { Authorization: `Basic ${auth}` }
        });
        if (!orderRes.ok) {
          return res.status(400).json({ error: "Could not verify payment with Razorpay" });
        }
        const orderData = await orderRes.json();
        if (orderData.status !== "paid") {
          return res.status(400).json({ error: "Payment not completed for this order" });
        }
        const notes = orderData.notes || {};
        if (notes.intent !== "wallet_topup") {
          return res.status(403).json({ error: "This order was not created for a wallet top-up" });
        }
        if (!notes.userId || notes.userId !== userId) {
          return res.status(403).json({ error: "Order does not belong to the authenticated user" });
        }
        verifiedAmount = Number(orderData.amount) / 100;
        if (!verifiedAmount || verifiedAmount <= 0) {
          return res.status(400).json({ error: "Invalid order amount from Razorpay" });
        }
      } catch {
        return res.status(502).json({ error: "Failed to reach Razorpay for payment verification" });
      }
      const reference = `Wallet Top-up:${razorpayOrderId}`;
      const txnId = "wt_" + Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
      try {
        const [txn] = await db.insert(walletTransactions).values({
          id: txnId,
          userId,
          type: "CREDIT",
          amount: verifiedAmount,
          reference
        }).returning();
        res.json({ success: true, transaction: txn });
      } catch (insertErr) {
        if (insertErr?.code === "23505") {
          const [existing] = await db.select().from(walletTransactions).where(eq2(walletTransactions.reference, reference)).limit(1);
          if (!existing || existing.userId !== userId) {
            return res.status(403).json({ error: "Order ownership mismatch" });
          }
          return res.json({ success: true, alreadyCredited: true, transaction: existing });
        }
        throw insertErr;
      }
    } catch (error) {
      res.status(500).json({ error: error.message || "Failed to credit wallet" });
    }
  });
  app2.get("/api/wallet/balance", requireAuth, async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const txns = await db.select().from(walletTransactions).where(eq2(walletTransactions.userId, userId)).orderBy(desc2(walletTransactions.createdAt));
      const balance = txns.reduce((sum, t) => {
        return t.type === "CREDIT" ? sum + t.amount : sum - t.amount;
      }, 0);
      res.json({ balance: Math.max(0, balance), transactions: txns });
    } catch (error) {
      res.status(500).json({ error: error.message || "Failed to fetch wallet balance" });
    }
  });
  app2.get("/api/vendor/wallet", requireAuth, requireRole("VENDOR", "SUPER_ADMIN"), async (req, res) => {
    try {
      const phone = (req.user?.phone || "").replace(/\D/g, "").slice(-10);
      if (!phone) return res.json({ balance: 0, transactions: [] });
      const [vendorApp] = await db.select({ id: vendorApplications.id }).from(vendorApplications).where(sql3`RIGHT(REGEXP_REPLACE(${vendorApplications.phone}, '[^0-9]', '', 'g'), 10) = ${phone}`).limit(1);
      if (!vendorApp) return res.json({ balance: 0, transactions: [] });
      const txns = await db.select().from(walletTransactions).where(eq2(walletTransactions.userId, vendorApp.id)).orderBy(desc2(walletTransactions.createdAt));
      const balance = txns.reduce((sum, t) => t.type === "CREDIT" ? sum + t.amount : sum - t.amount, 0);
      const now = /* @__PURE__ */ new Date();
      const thisMonthTotal = txns.filter((t) => t.type === "CREDIT" && t.createdAt && new Date(t.createdAt).getMonth() === now.getMonth() && new Date(t.createdAt).getFullYear() === now.getFullYear()).reduce((sum, t) => sum + t.amount, 0);
      res.json({
        balance: Math.max(0, balance),
        thisMonth: thisMonthTotal,
        transactions: txns.map((t) => ({ ...t, createdAt: t.createdAt?.toISOString() ?? null }))
      });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch vendor wallet" });
    }
  });
  app2.get("/api/admin/wallet-transactions", requireAuth, requireRole("SUPER_ADMIN", "FRANCHISE"), async (_req, res) => {
    try {
      const txns = await db.select().from(walletTransactions).orderBy(desc2(walletTransactions.createdAt)).limit(500);
      const userIds = [...new Set(txns.map((t) => t.userId))];
      const appUsersRows = userIds.length > 0 ? await db.select({ id: appUsers.id, name: appUsers.name, phone: appUsers.phone }).from(appUsers).where(or(inArray(appUsers.id, userIds), inArray(appUsers.phone, userIds))) : [];
      const userMap = /* @__PURE__ */ new Map();
      appUsersRows.forEach((u) => {
        userMap.set(u.id, { name: u.name, phone: u.phone });
        userMap.set(u.phone, { name: u.name, phone: u.phone });
      });
      const enriched = txns.map((t) => {
        const info = userMap.get(t.userId);
        return {
          ...t,
          userName: info?.name || null,
          userPhone: info?.phone || (t.userId.length <= 10 ? t.userId : null)
        };
      });
      res.json({ transactions: enriched });
    } catch (error) {
      res.status(500).json({ error: error.message || "Failed to fetch wallet transactions" });
    }
  });
  app2.get("/api/live-sessions", optionalAuth, async (req, res) => {
    try {
      const { status, vendorId } = req.query;
      let conditions = [];
      if (status) conditions.push(eq2(liveSessions.status, status));
      if (vendorId) conditions.push(eq2(liveSessions.vendorId, vendorId));
      const sessions = conditions.length > 0 ? await db.select().from(liveSessions).where(and2(...conditions)) : await db.select().from(liveSessions);
      const statusOrder = { LIVE: 0, SCHEDULED: 1, ENDED: 2 };
      sessions.sort((a, b) => (statusOrder[a.status] ?? 3) - (statusOrder[b.status] ?? 3));
      res.json({ sessions });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch live sessions" });
    }
  });
  app2.get("/api/live-sessions/:id", optionalAuth, async (req, res) => {
    try {
      const [session] = await db.select().from(liveSessions).where(eq2(liveSessions.id, req.params.id));
      if (!session) return res.status(404).json({ error: "Session not found" });
      res.json({ session });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch session" });
    }
  });
  app2.post("/api/live-sessions", requireAuth, async (req, res) => {
    try {
      const { vendorId, vendorName, title, description, taggedProducts, scheduledAt } = req.body;
      if (!vendorId || !title) {
        return res.status(400).json({ error: "vendorId and title are required" });
      }
      const id = "live_" + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
      const [session] = await db.insert(liveSessions).values({
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
        startedAt: scheduledAt ? null : /* @__PURE__ */ new Date(),
        scheduledAt: scheduledAt ? new Date(scheduledAt) : null
      }).returning();
      res.json({ success: true, session });
    } catch (error) {
      res.status(500).json({ error: "Failed to create live session" });
    }
  });
  app2.patch("/api/live-sessions/:id/start", requireAuth, async (req, res) => {
    try {
      const [session] = await db.update(liveSessions).set({ status: "LIVE", startedAt: /* @__PURE__ */ new Date() }).where(eq2(liveSessions.id, req.params.id)).returning();
      if (!session) return res.status(404).json({ error: "Session not found" });
      res.json({ success: true, session });
    } catch (error) {
      res.status(500).json({ error: "Failed to start session" });
    }
  });
  app2.patch("/api/live-sessions/:id/end", async (req, res) => {
    try {
      const [session] = await db.update(liveSessions).set({ status: "ENDED", endedAt: /* @__PURE__ */ new Date() }).where(eq2(liveSessions.id, req.params.id)).returning();
      if (!session) return res.status(404).json({ error: "Session not found" });
      res.json({ success: true, session });
    } catch (error) {
      res.status(500).json({ error: "Failed to end session" });
    }
  });
  app2.post("/api/live-sessions/:id/join", async (req, res) => {
    try {
      const [updated] = await db.update(liveSessions).set({
        viewers: sql3`COALESCE(${liveSessions.viewers}, 0) + 1`,
        peakViewers: sql3`GREATEST(COALESCE(${liveSessions.peakViewers}, 0), COALESCE(${liveSessions.viewers}, 0) + 1)`
      }).where(eq2(liveSessions.id, req.params.id)).returning({ viewers: liveSessions.viewers });
      if (!updated) return res.status(404).json({ error: "Session not found" });
      res.json({ success: true, viewers: updated.viewers });
    } catch (error) {
      res.status(500).json({ error: "Failed to join session" });
    }
  });
  app2.post("/api/live-sessions/:id/leave", async (req, res) => {
    try {
      const [updated] = await db.update(liveSessions).set({
        viewers: sql3`GREATEST(0, COALESCE(${liveSessions.viewers}, 0) - 1)`
      }).where(eq2(liveSessions.id, req.params.id)).returning({ viewers: liveSessions.viewers });
      if (!updated) return res.status(404).json({ error: "Session not found" });
      res.json({ success: true, viewers: updated.viewers });
    } catch (error) {
      res.status(500).json({ error: "Failed to leave session" });
    }
  });
  app2.post("/api/live-sessions/:id/like", async (req, res) => {
    try {
      const [updated] = await db.update(liveSessions).set({ likes: sql3`COALESCE(${liveSessions.likes}, 0) + 1` }).where(eq2(liveSessions.id, req.params.id)).returning({ likes: liveSessions.likes });
      if (!updated) return res.status(404).json({ error: "Session not found" });
      res.json({ success: true, likes: updated.likes });
    } catch (error) {
      res.status(500).json({ error: "Failed to like session" });
    }
  });
  app2.post("/api/live-sessions/:id/chat", async (req, res) => {
    try {
      const [session] = await db.select().from(liveSessions).where(eq2(liveSessions.id, req.params.id));
      if (!session) return res.status(404).json({ error: "Session not found" });
      const { userId, userName, message, isVendor } = req.body;
      if (!message?.trim()) return res.status(400).json({ error: "Message is required" });
      const chatMsg = {
        id: "chat_" + Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
        userId: userId || "anonymous",
        userName: userName || "User",
        message: message.trim(),
        isVendor: !!isVendor,
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      };
      let chatMessages = session.chatMessages || [];
      chatMessages.push(chatMsg);
      if (chatMessages.length > 200) chatMessages = chatMessages.slice(-200);
      await db.update(liveSessions).set({ chatMessages }).where(eq2(liveSessions.id, req.params.id));
      res.json({ success: true, chatMessage: chatMsg });
    } catch (error) {
      res.status(500).json({ error: "Failed to send chat message" });
    }
  });
  app2.get("/api/live-sessions/:id/chat", async (req, res) => {
    try {
      const [session] = await db.select().from(liveSessions).where(eq2(liveSessions.id, req.params.id));
      if (!session) return res.status(404).json({ error: "Session not found" });
      const after = req.query.after;
      let messages = session.chatMessages || [];
      if (after) {
        const idx = messages.findIndex((m) => m.id === after);
        if (idx >= 0) messages = messages.slice(idx + 1);
      }
      res.json({ messages, total: (session.chatMessages || []).length });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch chat messages" });
    }
  });
  app2.get("/api/team-members", requireAuth, async (_req, res) => {
    try {
      const cached = cache.get("team_members");
      if (cached) return res.json(cached);
      const members = await db.select().from(teamMembers);
      const result = { teamMembers: members };
      cache.set("team_members", result, CACHE_TTL.TEAM_MEMBERS);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch team members" });
    }
  });
  app2.post("/api/team-members", requireAuth, requireRole("SUPER_ADMIN", "FRANCHISE"), async (req, res) => {
    try {
      const { id, name, phone, email, role, city, status, createdBy, createdByRole, territory, pinCode, bankName, accountNumber, ifscCode, accountHolderName, aadhaarNumber, panNumber, dateOfBirth, gender, fullAddress, emergencyContactName, emergencyContactPhone, vehicleNumber, drivingLicenseNumber, franchiseId } = req.body;
      if (!name || !phone || !role) {
        return res.status(400).json({ error: "name, phone, and role are required" });
      }
      const memberId = id || "TM" + Date.now().toString().slice(-6);
      await db.insert(teamMembers).values({
        id: memberId,
        name,
        phone,
        email: email || "",
        role,
        city: city || "",
        status: status || "ACTIVE",
        createdBy: createdBy || "",
        createdByRole: createdByRole || "SUPER_ADMIN",
        territory,
        pinCode: pinCode || "",
        bankName,
        accountNumber,
        ifscCode,
        accountHolderName,
        aadhaarNumber,
        panNumber,
        dateOfBirth,
        gender,
        fullAddress,
        emergencyContactName,
        emergencyContactPhone,
        vehicleNumber,
        drivingLicenseNumber,
        franchiseId: franchiseId || ""
      });
      cache.invalidate("team_members");
      const [inserted] = await db.select().from(teamMembers).where(eq2(teamMembers.id, memberId));
      res.json({ success: true, teamMember: inserted });
    } catch (err) {
      res.status(500).json({ error: "Failed to create team member" });
    }
  });
  app2.put("/api/team-members/:id", requireAuth, requireRole("SUPER_ADMIN", "FRANCHISE"), async (req, res) => {
    try {
      const { id } = req.params;
      const updates = {};
      for (const key of ["name", "phone", "email", "role", "city", "territory", "pinCode", "bankName", "accountNumber", "ifscCode", "accountHolderName", "aadhaarNumber", "panNumber", "dateOfBirth", "gender", "fullAddress", "emergencyContactName", "emergencyContactPhone", "vehicleNumber", "drivingLicenseNumber"]) {
        if (req.body[key] !== void 0) updates[key] = req.body[key];
      }
      await db.update(teamMembers).set(updates).where(eq2(teamMembers.id, id));
      cache.invalidate("team_members");
      const [updated] = await db.select().from(teamMembers).where(eq2(teamMembers.id, id));
      res.json({ success: true, teamMember: updated });
    } catch (err) {
      res.status(500).json({ error: "Failed to update team member" });
    }
  });
  app2.put("/api/team-members/:id/toggle-status", requireAuth, requireRole("SUPER_ADMIN", "FRANCHISE"), async (req, res) => {
    try {
      const { id } = req.params;
      const [existing] = await db.select().from(teamMembers).where(eq2(teamMembers.id, id));
      if (!existing) return res.status(404).json({ error: "Team member not found" });
      const newStatus = existing.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
      await db.update(teamMembers).set({ status: newStatus }).where(eq2(teamMembers.id, id));
      cache.invalidate("team_members");
      res.json({ success: true, status: newStatus });
    } catch (err) {
      res.status(500).json({ error: "Failed to toggle status" });
    }
  });
  app2.delete("/api/team-members/:id", requireAuth, requireRole("SUPER_ADMIN", "FRANCHISE"), async (req, res) => {
    try {
      await db.delete(teamMembers).where(eq2(teamMembers.id, req.params.id));
      cache.invalidate("team_members");
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to delete team member" });
    }
  });
  app2.get("/api/vendor/products/:vendorId", async (req, res) => {
    try {
      const { vendorId } = req.params;
      res.set("Cache-Control", "public, max-age=300, stale-while-revalidate=600");
      const cached = getProductCache(vendorId);
      if (cached) return res.json(cached);
      let rows = await db.select(lightweightProductCols).from(products).where(eq2(products.vendorId, vendorId)).orderBy(desc2(products.createdAt));
      if (rows.length === 0) {
        let siblingPhone;
        const [appRow] = await db.select({ phone: vendorApplications.phone }).from(vendorApplications).where(eq2(vendorApplications.id, vendorId)).limit(1);
        if (appRow?.phone) siblingPhone = appRow.phone.replace(/\D/g, "").slice(-10);
        if (!siblingPhone) {
          const [vendorRow] = await db.select({ phone: vendorApplications.phone }).from(vendors).leftJoin(vendorApplications, eq2(vendorApplications.id, vendors.id)).where(eq2(vendors.id, vendorId)).limit(1);
          if (vendorRow?.phone) siblingPhone = vendorRow.phone.replace(/\D/g, "").slice(-10);
        }
        if (siblingPhone) {
          const siblingApps = await db.select({ id: vendorApplications.id }).from(vendorApplications).where(sql3`RIGHT(REPLACE(REPLACE(${vendorApplications.phone}, '+', ''), ' ', ''), 10) = ${siblingPhone}`);
          const siblingIds = siblingApps.map((a) => a.id).filter((sid) => sid !== vendorId);
          const allSearchIds = [.../* @__PURE__ */ new Set([...siblingIds, siblingPhone])].filter((sid) => sid !== vendorId);
          if (allSearchIds.length > 0) {
            rows = await db.select(lightweightProductCols).from(products).where(inArray(products.vendorId, allSearchIds)).orderBy(desc2(products.createdAt));
            if (rows.length > 0) {
              console.log(`[products] Vendor ${vendorId}: 0 own products but found ${rows.length} under sibling IDs [${allSearchIds.join(",")}]`);
            }
          }
        }
      }
      const origin = `${req.protocol}://${req.get("host")}`;
      const enriched = await enrichProductRows(rows, origin);
      setProductCache(vendorId, enriched);
      res.json(enriched);
      maybeWarmVendorProducts(origin);
    } catch (err) {
      console.error("Failed to fetch vendor products:", err);
      res.status(500).json({ error: "Failed to fetch vendor products" });
    }
  });
  app2.get("/api/products/:productId/image", async (req, res) => {
    try {
      const { productId } = req.params;
      const cacheKey = `product:${productId}`;
      let entry = imgCacheGet(cacheKey);
      if (!entry) {
        const [row] = await db.select({ image: products.image }).from(products).where(eq2(products.id, productId));
        if (!row?.image) return res.status(404).send("No image");
        if (row.image.startsWith("http")) return res.redirect(302, row.image);
        const buf = await compressToBuffer(row.image);
        const etag = `"${crypto4.createHash("md5").update(buf).digest("hex")}"`;
        entry = { buf, etag };
        imgCacheSet(cacheKey, entry);
      }
      if (req.headers["if-none-match"] === entry.etag) return res.status(304).end();
      res.set({
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=604800, stale-while-revalidate=86400",
        "Content-Length": entry.buf.length.toString(),
        "ETag": entry.etag
      });
      return res.end(entry.buf);
    } catch {
      return res.status(500).send("Image error");
    }
  });
  app2.patch("/api/products/:productId/image", requireAuth, requireRole("VENDOR", "SUPER_ADMIN"), async (req, res) => {
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
      if (req.user?.role === "VENDOR") {
        const [existing] = await db.select({ vendorId: products.vendorId }).from(products).where(eq2(products.id, productId)).limit(1);
        if (!existing) return res.status(404).json({ error: "Product not found" });
        const requesterPhone = req.user?.phone?.replace(/\D/g, "").slice(-10) || "";
        const [vendorApp] = await db.select({ phone: vendorApplications.phone }).from(vendorApplications).where(eq2(vendorApplications.id, existing.vendorId)).limit(1);
        const vendorPhone = (vendorApp?.phone || "").replace(/\D/g, "").slice(-10);
        if (requesterPhone && vendorPhone && requesterPhone !== vendorPhone) {
          return res.status(403).json({ error: "You can only update images for your own products" });
        }
      }
      const [updated] = await db.select({ vendorId: products.vendorId }).from(products).where(eq2(products.id, productId)).limit(1);
      const imageToStore = image.startsWith("data:image/") ? await compressImageDataUrl(image).catch(() => image) : image;
      await db.update(products).set({ image: imageToStore }).where(eq2(products.id, productId));
      if (updated) {
        invalidateProductCache(updated.vendorId);
        imgCacheInvalidate(`product:${productId}`);
      }
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Failed to update product image" });
    }
  });
  app2.get("/api/products/top", async (req, res) => {
    try {
      const limit = Math.min(parseInt(String(req.query.limit ?? "20"), 10) || 20, 50);
      const rows = await db.select({
        id: products.id,
        name: products.name,
        description: products.description,
        price: products.price,
        originalPrice: products.originalPrice,
        category: products.category,
        isAvailable: products.isAvailable,
        codEnabled: products.codEnabled,
        vendorId: products.vendorId,
        vendorName: vendors.name,
        vendorRating: vendors.rating,
        vendorDeliveryTime: vendors.deliveryTime,
        vendorIsOpen: vendors.isOpen,
        // Peek at image prefix only — never send raw base64 blobs
        imagePrefix: sql3`LEFT(${products.image}, 5)`
      }).from(products).innerJoin(vendors, eq2(products.vendorId, vendors.id)).where(and2(eq2(products.isAvailable, true), eq2(vendors.isOpen, true))).orderBy(desc2(products.createdAt)).limit(limit);
      const origin = `${req.protocol}://${req.get("host")}`;
      const mapped = rows.map((r) => {
        const prefix = (r.imagePrefix ?? "").toLowerCase();
        const hasImage = prefix.startsWith("data:") || prefix.startsWith("http");
        const { imagePrefix: _drop, ...rest } = r;
        return { ...rest, hasImage, image: hasImage ? `${origin}/api/products/${r.id}/image` : "" };
      });
      res.json(mapped);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch top products" });
    }
  });
  app2.get("/api/vendor/my-products", requireAuth, requireRole("VENDOR", "SUPER_ADMIN"), async (req, res) => {
    try {
      let vendorId = req.user.id || "";
      const cleanPhone = (req.user.phone || "").replace(/\D/g, "").slice(-10);
      if (cleanPhone) {
        const resolved = await resolveVendorIdByPhone(cleanPhone);
        if (resolved) vendorId = resolved;
      }
      if (!vendorId) return res.json({ products: [], vendorId: "" });
      res.set("Cache-Control", "private, max-age=60, stale-while-revalidate=300");
      const cached = getProductCache(vendorId);
      if (cached) return res.json({ products: cached, vendorId });
      const origin = `${req.protocol}://${req.get("host")}`;
      const enriched = await loadVendorProductsDirect(vendorId, origin);
      setProductCache(vendorId, enriched);
      res.json({ products: enriched, vendorId });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch products" });
    }
  });
  app2.get("/api/vendor/my-application", requireAuth, requireRole("VENDOR", "SUPER_ADMIN", "MARKETING", "FRANCHISE"), async (req, res) => {
    try {
      const cleanPhone = req.user.phone?.replace(/\D/g, "").slice(-10);
      const [va] = await db.select().from(vendorApplications).where(
        and2(
          or(eq2(vendorApplications.phone, cleanPhone), sql3`RIGHT(REPLACE(REPLACE(${vendorApplications.phone}, '+', ''), ' ', ''), 10) = ${cleanPhone}`),
          or(eq2(vendorApplications.status, "APPROVED"), eq2(vendorApplications.status, "LIVE"))
        )
      ).limit(1);
      if (!va) return res.json({ application: null });
      res.json({ application: va });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch application" });
    }
  });
  app2.get("/api/product/:productId", async (req, res) => {
    try {
      const { productId } = req.params;
      const [product] = await db.select().from(products).where(eq2(products.id, productId)).limit(1);
      if (!product) return res.status(404).json({ error: "Product not found" });
      res.json(product);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch product" });
    }
  });
  app2.post("/api/vendor/products", requireAuth, requireRole("VENDOR", "SUPER_ADMIN"), async (req, res) => {
    try {
      const { id, name, description, price, originalPrice, image, category, codEnabled } = req.body;
      if (!id || !name || price == null) {
        return res.status(400).json({ error: "Missing required fields: id, name, price" });
      }
      let vendorId = req.user.id || "";
      const cleanPhone = (req.user.phone || "").replace(/\D/g, "").slice(-10);
      if (cleanPhone) {
        const [va] = await db.select({ id: vendorApplications.id }).from(vendorApplications).where(
          and2(
            or(eq2(vendorApplications.phone, cleanPhone), sql3`RIGHT(REPLACE(REPLACE(${vendorApplications.phone}, '+', ''), ' ', ''), 10) = ${cleanPhone}`),
            or(eq2(vendorApplications.status, "APPROVED"), eq2(vendorApplications.status, "LIVE"))
          )
        ).limit(1);
        if (va) vendorId = va.id;
      }
      if (!vendorId) {
        return res.status(400).json({ error: "No active vendor application found. Please contact support." });
      }
      const imageToStore = image && image.startsWith("data:image/") ? await compressImageDataUrl(image).catch(() => image) : image || "";
      await db.insert(products).values({
        id,
        vendorId,
        name,
        description: description || "",
        price,
        originalPrice: originalPrice || null,
        image: imageToStore,
        isAvailable: true,
        category: category || "",
        codEnabled: Boolean(codEnabled)
      }).onConflictDoUpdate({
        target: products.id,
        set: { name, description: description || "", price, originalPrice: originalPrice || null, image: imageToStore, category: category || "", codEnabled: Boolean(codEnabled) }
      });
      invalidateProductCache(vendorId);
      imgCacheInvalidate(`product:${id}`);
      res.json({ success: true, id });
    } catch (err) {
      res.status(500).json({ error: "Failed to save product" });
    }
  });
  app2.put("/api/vendor/products/:productId", requireAuth, requireRole("VENDOR", "SUPER_ADMIN"), async (req, res) => {
    try {
      const { productId } = req.params;
      const [existing] = await db.select().from(products).where(eq2(products.id, productId)).limit(1);
      if (!existing) return res.status(404).json({ error: "Product not found" });
      if (req.user?.role === "VENDOR") {
        const requesterPhone = req.user?.phone?.replace(/\D/g, "").slice(-10) || "";
        const [vendorApp] = await db.select({ phone: vendorApplications.phone }).from(vendorApplications).where(eq2(vendorApplications.id, existing.vendorId)).limit(1);
        const vendorPhone = (vendorApp?.phone || "").replace(/\D/g, "").slice(-10);
        if (requesterPhone && vendorPhone && requesterPhone !== vendorPhone) {
          return res.status(403).json({ error: "You can only edit your own products" });
        }
      }
      const { name, description, price, originalPrice, image, category, isAvailable, codEnabled } = req.body;
      const updates = {};
      if (name !== void 0) updates.name = name;
      if (description !== void 0) updates.description = description;
      if (price !== void 0) updates.price = price;
      if (originalPrice !== void 0) updates.originalPrice = originalPrice;
      if (image !== void 0 && !PROXY_IMAGE_RE.test(String(image))) {
        updates.image = image && image.startsWith("data:image/") ? await compressImageDataUrl(image).catch(() => image) : image;
        imgCacheInvalidate(`product:${productId}`);
      }
      if (category !== void 0) updates.category = category;
      if (isAvailable !== void 0) updates.isAvailable = isAvailable;
      if (codEnabled !== void 0) updates.codEnabled = Boolean(codEnabled);
      if (Object.keys(updates).length === 0) return res.status(400).json({ error: "No fields to update" });
      await db.update(products).set(updates).where(eq2(products.id, productId));
      invalidateProductCache(existing.vendorId);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to update product" });
    }
  });
  app2.post("/api/admin/vendors/:vendorId/products", requireAuth, requireRole("SUPER_ADMIN"), async (req, res) => {
    try {
      const { vendorId } = req.params;
      const { name, description, price, originalPrice, image, category, isAvailable } = req.body;
      if (!name || price == null) return res.status(400).json({ error: "name and price are required" });
      const id = `${vendorId}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      await db.insert(products).values({
        id,
        vendorId,
        name,
        description: description || "",
        price: Number(price),
        originalPrice: originalPrice ? Number(originalPrice) : null,
        image: image || "",
        isAvailable: isAvailable !== false,
        category: category || ""
      });
      invalidateProductCache(vendorId);
      res.json({ success: true, id });
    } catch (err) {
      res.status(500).json({ error: "Failed to add product" });
    }
  });
  app2.delete("/api/vendor/products/:productId", requireAuth, requireRole("VENDOR", "SUPER_ADMIN"), async (req, res) => {
    try {
      const { productId } = req.params;
      const [existing] = await db.select().from(products).where(eq2(products.id, productId)).limit(1);
      if (!existing) return res.status(404).json({ error: "Product not found" });
      if (req.user?.role === "VENDOR") {
        const requesterPhone = req.user?.phone?.replace(/\D/g, "").slice(-10) || "";
        const [vendorApp] = await db.select({ phone: vendorApplications.phone }).from(vendorApplications).where(eq2(vendorApplications.id, existing.vendorId)).limit(1);
        const vendorPhone = (vendorApp?.phone || "").replace(/\D/g, "").slice(-10);
        if (requesterPhone && vendorPhone && requesterPhone !== vendorPhone) {
          return res.status(403).json({ error: "You can only delete your own products" });
        }
      }
      await db.delete(products).where(eq2(products.id, productId));
      invalidateProductCache(existing.vendorId);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to delete product" });
    }
  });
  app2.post("/api/orders", requireAuth, async (req, res) => {
    try {
      const { id, customerName, vendorId, vendorName, vendorCategoryId, deliveryPartnerId, deliveryPartnerName, status, totalAmount, paymentStatus, paymentMethod, deliveryAddress, deliveryOTP, deliveryNote, deliverySpeed, assignedAt, items } = req.body;
      const ALLOWED_PAYMENT_STATUSES = ["PAID", "PENDING", "PENDING_VERIFICATION", "FAILED", "REFUNDED"];
      const finalPaymentStatus = ALLOWED_PAYMENT_STATUSES.includes(paymentStatus) ? paymentStatus : "PAID";
      const ALLOWED_PAYMENT_METHODS = ["ONLINE", "COD", "WALLET", "COINS", "VENDOR_QR"];
      const finalPaymentMethod = ALLOWED_PAYMENT_METHODS.includes(paymentMethod) ? paymentMethod : null;
      const customerId = req.user.id || req.user.phone?.replace(/\D/g, "").slice(-10) || "";
      if (!id || !customerId || !vendorId || !vendorName || !deliveryAddress) {
        return res.status(400).json({ error: "Missing required order fields" });
      }
      const insertedOrder = await db.insert(orders).values({
        id,
        customerId,
        customerName: customerName || "",
        vendorId,
        vendorName,
        vendorCategoryId: vendorCategoryId || null,
        deliveryPartnerId: deliveryPartnerId || null,
        deliveryPartnerName: deliveryPartnerName || null,
        status: "PENDING",
        totalAmount,
        paymentStatus: finalPaymentStatus,
        paymentMethod: finalPaymentMethod,
        deliveryAddress,
        deliveryOTP: deliveryOTP || null,
        deliveryNote: deliveryNote || null,
        deliverySpeed: deliverySpeed || null,
        assignedAt: assignedAt ? new Date(assignedAt) : null
      }).onConflictDoNothing().returning({ id: orders.id });
      const orderWasInserted = insertedOrder.length > 0;
      if (items && Array.isArray(items)) {
        for (const item of items) {
          await db.insert(orderItems).values({
            id: item.id,
            orderId: id,
            productId: item.productId,
            productName: item.productName,
            quantity: item.quantity,
            price: item.price,
            seatNumber: item.seatNumber || null,
            seatClass: item.seatClass || null
          }).onConflictDoNothing();
        }
      }
      if (orderWasInserted && finalPaymentMethod === "VENDOR_QR" && finalPaymentStatus === "PENDING_VERIFICATION") {
        const notifTitle = "QR payment to verify";
        const amountLabel = typeof totalAmount === "number" ? `\u20B9${totalAmount}` : `\u20B9${totalAmount || 0}`;
        const notifBody = `${customerName || "A customer"} says they paid ${amountLabel} via QR \u2014 verify in your UPI app`;
        const notifId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
        try {
          await db.insert(notifications).values({
            id: notifId,
            title: notifTitle,
            message: notifBody,
            targetRole: "VENDOR",
            targetUserId: vendorId,
            read: false
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
            amount: totalAmount
          });
        } catch (pushErr) {
          console.error("Failed to push VENDOR_QR alert to vendor:", pushErr);
        }
      }
      if (orderWasInserted && finalPaymentMethod === "COINS" && vendorId && typeof totalAmount === "number" && totalAmount > 0) {
        try {
          const [vendorApp] = await db.select({ phone: vendorApplications.phone }).from(vendorApplications).where(eq2(vendorApplications.id, vendorId)).limit(1);
          const vendorPhone = vendorApp?.phone ? vendorApp.phone.replace(/\D/g, "").slice(-10) : null;
          if (vendorPhone) {
            const vendorCoinTxnId = `CT_COIN_${id.slice(-8)}_${Date.now().toString(36)}`;
            await db.insert(coinTransactions).values({
              id: vendorCoinTxnId,
              userId: vendorPhone,
              type: "EARNED",
              amount: Math.max(1, Math.round(totalAmount / 100)),
              reference: `Coins sale - Order #${id} (\u20B9${totalAmount})`
            });
          }
        } catch (coinErr) {
          console.error("[COINS] Failed to credit vendor coins for order", id, coinErr);
        }
      }
      if (orderWasInserted && finalPaymentStatus !== "FAILED") {
        const customerPhone = (req.user?.phone || customerId || "").toString();
        if (customerPhone) {
          void sendWhatsAppOrderConfirmation(customerPhone, {
            customerName: customerName || "Customer",
            orderId: id,
            amount: String(typeof totalAmount === "number" ? totalAmount : totalAmount || 0),
            vendorName: vendorName || "the store"
          }).then((r) => {
            if (r.sent) console.log(`WhatsApp order confirmation sent for order ${id}`);
            else if (r.configured && r.error) console.error(`WhatsApp order confirmation failed for ${id}: ${r.error}`);
          }).catch((e) => console.error("WhatsApp order confirmation error:", e?.message || e));
        }
      }
      res.json({ success: true, orderId: id });
    } catch (err) {
      res.status(500).json({ error: "Failed to save order" });
    }
  });
  app2.get("/api/orders", requireAuth, requireRole("CUSTOMER"), async (req, res) => {
    try {
      const userId = req.user.id || req.user.phone?.replace(/\D/g, "").slice(-10);
      if (!userId) return res.json({ orders: [] });
      const rows = await db.select().from(orders).where(eq2(orders.customerId, userId)).orderBy(desc2(orders.createdAt)).limit(100);
      const orderIds = rows.map((o) => o.id);
      const allItems = orderIds.length > 0 ? await db.select().from(orderItems).where(inArray(orderItems.orderId, orderIds)) : [];
      const orders3 = rows.map((o) => ({
        ...o,
        createdAt: o.createdAt?.toISOString(),
        assignedAt: o.assignedAt?.toISOString() || null,
        pickedAt: o.pickedAt?.toISOString() || null,
        deliveredAt: o.deliveredAt?.toISOString() || null,
        items: allItems.filter((i) => i.orderId === o.id)
      }));
      res.json({ orders: orders3 });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch orders" });
    }
  });
  app2.get("/api/orders/my", requireAuth, async (req, res) => {
    try {
      const userId = req.user.id || req.user.phone?.replace(/\D/g, "").slice(-10);
      if (!userId) return res.json({ orders: [] });
      const rows = await db.select().from(orders).where(eq2(orders.customerId, userId)).orderBy(desc2(orders.createdAt)).limit(100);
      const orderIds = rows.map((o) => o.id);
      const allItems = orderIds.length > 0 ? await db.select().from(orderItems).where(inArray(orderItems.orderId, orderIds)) : [];
      const orders3 = rows.map((o) => ({
        ...o,
        createdAt: o.createdAt?.toISOString(),
        assignedAt: o.assignedAt?.toISOString() || null,
        pickedAt: o.pickedAt?.toISOString() || null,
        deliveredAt: o.deliveredAt?.toISOString() || null,
        items: allItems.filter((i) => i.orderId === o.id)
      }));
      res.json({ orders: orders3 });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch orders" });
    }
  });
  app2.get("/api/orders/vendor", requireAuth, requireRole("VENDOR", "SUPER_ADMIN"), async (req, res) => {
    try {
      const cleanPhone = req.user.phone?.replace(/\D/g, "").slice(-10);
      const allVendorApps = cleanPhone ? await db.select({ id: vendorApplications.id }).from(vendorApplications).where(
        and2(
          or(eq2(vendorApplications.phone, cleanPhone), sql3`RIGHT(REPLACE(REPLACE(${vendorApplications.phone}, '+', ''), ' ', ''), 10) = ${cleanPhone}`),
          or(eq2(vendorApplications.status, "APPROVED"), eq2(vendorApplications.status, "LIVE"))
        )
      ) : [];
      const vendorIdsSet = new Set(allVendorApps.map((a) => a.id));
      if (req.user.id) vendorIdsSet.add(req.user.id);
      const vendorIds = Array.from(vendorIdsSet);
      if (vendorIds.length === 0) return res.json({ orders: [] });
      const rows = await db.select().from(orders).where(vendorIds.length === 1 ? eq2(orders.vendorId, vendorIds[0]) : inArray(orders.vendorId, vendorIds)).orderBy(desc2(orders.createdAt)).limit(200);
      const orderIds = rows.map((o) => o.id);
      const allItems = orderIds.length > 0 ? await db.select().from(orderItems).where(inArray(orderItems.orderId, orderIds)) : [];
      const orders3 = rows.map((o) => ({
        ...o,
        createdAt: o.createdAt?.toISOString(),
        assignedAt: o.assignedAt?.toISOString() || null,
        pickedAt: o.pickedAt?.toISOString() || null,
        deliveredAt: o.deliveredAt?.toISOString() || null,
        items: allItems.filter((i) => i.orderId === o.id)
      }));
      res.json({ orders: orders3 });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch vendor orders" });
    }
  });
  app2.get("/api/orders/available", requireAuth, requireRole("DELIVERY", "SUPER_ADMIN"), async (req, res) => {
    try {
      const rows = await db.select().from(orders).where(and2(eq2(orders.status, "READY"), isNull(orders.deliveryPartnerId))).orderBy(desc2(orders.createdAt)).limit(50);
      const orderIds = rows.map((o) => o.id);
      const allItems = orderIds.length > 0 ? await db.select().from(orderItems).where(inArray(orderItems.orderId, orderIds)) : [];
      const orders3 = rows.map((o) => ({
        ...o,
        createdAt: o.createdAt?.toISOString(),
        assignedAt: o.assignedAt?.toISOString() || null,
        pickedAt: o.pickedAt?.toISOString() || null,
        deliveredAt: o.deliveredAt?.toISOString() || null,
        items: allItems.filter((i) => i.orderId === o.id)
      }));
      res.json({ orders: orders3 });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch available orders" });
    }
  });
  app2.get("/api/orders/delivery", requireAuth, requireRole("DELIVERY", "SUPER_ADMIN"), async (req, res) => {
    try {
      let partnerId = req.user.id;
      if (!partnerId) {
        const cleanPhone = req.user.phone?.replace(/\D/g, "").slice(-10);
        const [member] = await db.select().from(teamMembers).where(
          or(eq2(teamMembers.phone, cleanPhone), sql3`RIGHT(REPLACE(REPLACE(${teamMembers.phone}, '+', ''), ' ', ''), 10) = ${cleanPhone}`)
        );
        partnerId = member?.id;
      }
      if (!partnerId) return res.json({ orders: [] });
      const rows = await db.select().from(orders).where(eq2(orders.deliveryPartnerId, partnerId)).orderBy(desc2(orders.createdAt)).limit(200);
      const orderIds = rows.map((o) => o.id);
      const allItems = orderIds.length > 0 ? await db.select().from(orderItems).where(inArray(orderItems.orderId, orderIds)) : [];
      const orders3 = rows.map((o) => ({
        ...o,
        createdAt: o.createdAt?.toISOString(),
        assignedAt: o.assignedAt?.toISOString() || null,
        pickedAt: o.pickedAt?.toISOString() || null,
        deliveredAt: o.deliveredAt?.toISOString() || null,
        items: allItems.filter((i) => i.orderId === o.id)
      }));
      res.json({ orders: orders3 });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch delivery orders" });
    }
  });
  app2.get("/api/orders/all", requireAuth, requireRole("SUPER_ADMIN", "FRANCHISE"), async (req, res) => {
    try {
      const rows = await db.select().from(orders).orderBy(desc2(orders.createdAt)).limit(500);
      const orderIds = rows.map((o) => o.id);
      const allItems = orderIds.length > 0 ? await db.select().from(orderItems).where(inArray(orderItems.orderId, orderIds)) : [];
      const orders3 = rows.map((o) => ({
        ...o,
        createdAt: o.createdAt?.toISOString(),
        assignedAt: o.assignedAt?.toISOString() || null,
        pickedAt: o.pickedAt?.toISOString() || null,
        deliveredAt: o.deliveredAt?.toISOString() || null,
        items: allItems.filter((i) => i.orderId === o.id)
      }));
      res.json({ orders: orders3 });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch orders" });
    }
  });
  app2.get("/api/orders/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const [order] = await db.select().from(orders).where(eq2(orders.id, id)).limit(1);
      if (!order) return res.status(404).json({ error: "Order not found" });
      const role = req.user.role || "";
      const isPrivileged = role === "SUPER_ADMIN" || role === "FRANCHISE";
      if (!isPrivileged) {
        const userId = req.user.id || req.user.phone?.replace(/\D/g, "").slice(-10) || "";
        const isCustomer = userId && order.customerId === userId;
        const isVendor = userId && order.vendorId === userId;
        const isDeliveryPartner = userId && order.deliveryPartnerId === userId;
        if (!isCustomer && !isVendor && !isDeliveryPartner) {
          return res.status(403).json({ error: "Access denied" });
        }
      }
      const items = await db.select().from(orderItems).where(eq2(orderItems.orderId, id));
      res.json({
        ...order,
        createdAt: order.createdAt?.toISOString(),
        assignedAt: order.assignedAt?.toISOString() || null,
        pickedAt: order.pickedAt?.toISOString() || null,
        deliveredAt: order.deliveredAt?.toISOString() || null,
        items
      });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch order" });
    }
  });
  app2.post("/api/orders/:id/accept-delivery", requireAuth, requireRole("DELIVERY", "SUPER_ADMIN"), async (req, res) => {
    try {
      const { id } = req.params;
      const partnerId = req.user.id;
      if (!partnerId) return res.status(400).json({ error: "Partner ID not found in token" });
      const [member] = await db.select({ name: teamMembers.name }).from(teamMembers).where(eq2(teamMembers.id, partnerId)).limit(1);
      const partnerName = member?.name || req.user.phone || "Delivery Partner";
      const [order] = await db.select({ status: orders.status, deliveryPartnerId: orders.deliveryPartnerId }).from(orders).where(eq2(orders.id, id)).limit(1);
      if (!order) return res.status(404).json({ error: "Order not found" });
      if (order.status !== "READY") return res.status(400).json({ error: "Order is not ready for pickup" });
      if (order.deliveryPartnerId) return res.status(409).json({ error: "Order already assigned to another delivery partner" });
      await db.update(orders).set({
        deliveryPartnerId: partnerId,
        deliveryPartnerName: partnerName,
        assignedAt: /* @__PURE__ */ new Date()
      }).where(eq2(orders.id, id));
      res.json({ success: true, partnerName });
    } catch (err) {
      res.status(500).json({ error: "Failed to accept order" });
    }
  });
  app2.patch("/api/orders/:id/payment-status", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { paymentStatus } = req.body || {};
      const ALLOWED = ["PAID", "FAILED", "REFUNDED"];
      if (!ALLOWED.includes(paymentStatus)) {
        return res.status(400).json({ error: "paymentStatus must be one of PAID, FAILED, REFUNDED" });
      }
      const [existing] = await db.select({ id: orders.id, vendorId: orders.vendorId, paymentStatus: orders.paymentStatus, paymentMethod: orders.paymentMethod }).from(orders).where(eq2(orders.id, id)).limit(1);
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
        let vendorId = req.user.id;
        const cleanPhone = req.user.phone?.replace(/\D/g, "").slice(-10);
        if (!vendorId || /^\d{10}$/.test(vendorId)) {
          const [va] = await db.select({ id: vendorApplications.id }).from(vendorApplications).where(
            and2(
              or(eq2(vendorApplications.phone, cleanPhone), sql3`RIGHT(REPLACE(REPLACE(${vendorApplications.phone}, '+', ''), ' ', ''), 10) = ${cleanPhone}`),
              or(eq2(vendorApplications.status, "APPROVED"), eq2(vendorApplications.status, "LIVE"))
            )
          ).limit(1);
          if (va) vendorId = va.id;
        }
        if (!vendorId || vendorId !== existing.vendorId) {
          return res.status(403).json({ error: "You can only verify payments for your own orders" });
        }
      }
      const updates = { paymentStatus };
      let newOrderStatus;
      if (paymentStatus === "FAILED" || paymentStatus === "REFUNDED") {
        updates.status = "CANCELLED";
        newOrderStatus = "CANCELLED";
      }
      await db.update(orders).set(updates).where(eq2(orders.id, id));
      console.log(`[QR-Verify] Order ${id} paymentStatus -> ${paymentStatus}${newOrderStatus ? ` (status -> ${newOrderStatus})` : ""} by ${req.user?.phone || req.user?.id} (${userRole})`);
      res.json({ success: true, paymentStatus, status: newOrderStatus });
    } catch (err) {
      console.error("[QR-Verify] Failed:", err);
      res.status(500).json({ error: "Failed to update payment status" });
    }
  });
  app2.put("/api/orders/:id/status", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      if (!status) return res.status(400).json({ error: "status required" });
      const userRole = req.user?.role;
      if (userRole === "CUSTOMER") {
        if (status !== "CANCELLED") {
          return res.status(403).json({ error: "Customers can only cancel orders" });
        }
        const [existingOrder] = await db.select({ status: orders.status, customerId: orders.customerId }).from(orders).where(eq2(orders.id, id)).limit(1);
        if (!existingOrder) return res.status(404).json({ error: "Order not found" });
        if (existingOrder.status !== "PENDING") {
          return res.status(400).json({ error: "Only pending orders can be cancelled" });
        }
        const requesterId = req.user?.id || req.user?.phone?.replace(/\D/g, "").slice(-10) || "";
        if (requesterId && existingOrder.customerId !== requesterId) {
          return res.status(403).json({ error: "You can only cancel your own orders" });
        }
      }
      const updates = { status };
      if (status === "PICKED") updates.pickedAt = /* @__PURE__ */ new Date();
      if (status === "DELIVERED") updates.deliveredAt = /* @__PURE__ */ new Date();
      await db.update(orders).set(updates).where(eq2(orders.id, id));
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to update order status" });
    }
  });
  const recentVendorSubmissions = /* @__PURE__ */ new Map();
  app2.post("/api/vendor-applications", async (req, res) => {
    try {
      const body = req.body;
      if (!body.id || !body.businessName || !body.ownerName || !body.phone || !body.categoryId) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      const dedupKey = `${body.phone}|${body.businessName}`;
      const lastSubmit = recentVendorSubmissions.get(dedupKey);
      if (lastSubmit && Date.now() - lastSubmit < 3e4) {
        return res.json({ success: true, id: body.id, deduplicated: true });
      }
      const normalizedPhone = body.phone.replace(/\D/g, "").slice(-10);
      const [existingByPhone] = await db.select({ id: vendorApplications.id, status: vendorApplications.status, businessName: vendorApplications.businessName }).from(vendorApplications).where(sql3`RIGHT(REGEXP_REPLACE(${vendorApplications.phone}, '[^0-9]', '', 'g'), 10) = ${normalizedPhone}`).limit(1);
      if (existingByPhone && existingByPhone.status !== "REJECTED") {
        return res.status(409).json({
          error: `This mobile number is already registered as a vendor ("${existingByPhone.businessName}"). Please contact support if you need to update your details.`,
          alreadyRegistered: true
        });
      }
      const submitterPhone = (req.user?.phone || "").replace(/\D/g, "").slice(-10);
      let realSubmittedBy = body.submittedBy || req.user?.name || "";
      if (submitterPhone) {
        const [submitterMember] = await db.select({ name: teamMembers.name }).from(teamMembers).where(sql3`RIGHT(REGEXP_REPLACE(${teamMembers.phone}, '[^0-9]', '', 'g'), 10) = ${submitterPhone}`);
        if (submitterMember?.name) realSubmittedBy = submitterMember.name;
      }
      let finalLat = body.latitude && Math.abs(body.latitude) > 1e-3 ? body.latitude : null;
      let finalLng = body.longitude && Math.abs(body.longitude) > 1e-3 ? body.longitude : null;
      const rawLocationLink = body.locationLink || null;
      if ((!finalLat || !finalLng) && rawLocationLink) {
        try {
          const resolved = await resolveMapLinkToCoords(rawLocationLink);
          if (resolved) {
            finalLat = resolved.lat;
            finalLng = resolved.lng;
          }
          console.log(`[APP-SUBMIT] Resolved location link for ${body.businessName}: (${finalLat}, ${finalLng})`);
        } catch {
        }
      }
      const vendorPinCode = (body.pinCode || "").trim();
      let derivedFranchiseId = (body.franchiseId || "").trim();
      if (vendorPinCode) {
        try {
          const [franchiseOwner] = await db.select({ phone: teamMembers.phone }).from(teamMembers).where(and2(
            eq2(teamMembers.role, "FRANCHISE"),
            eq2(teamMembers.pinCode, vendorPinCode),
            eq2(teamMembers.status, "ACTIVE")
          ));
          if (franchiseOwner?.phone) {
            derivedFranchiseId = franchiseOwner.phone.replace(/\D/g, "").slice(-10);
            console.log(`[APP-SUBMIT] Routed "${body.businessName}" (pin: ${vendorPinCode}) \u2192 franchise ${derivedFranchiseId}`);
          } else {
            console.log(`[APP-SUBMIT] No active franchise owner found for pin ${vendorPinCode} \u2014 application unassigned`);
            derivedFranchiseId = "";
          }
        } catch {
        }
      }
      await db.insert(vendorApplications).values({
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
        submittedAt: /* @__PURE__ */ new Date()
      }).onConflictDoNothing();
      if (finalLat && finalLng) {
        const _MAL_LAT = 20.5547, _MAL_LNG = 74.5247, _MAX_KM = 50;
        const dLat = (finalLat - _MAL_LAT) * Math.PI / 180, dLng = (finalLng - _MAL_LNG) * Math.PI / 180;
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(_MAL_LAT * Math.PI / 180) * Math.cos(finalLat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
        const km = 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        if (km <= _MAX_KM) {
          await db.update(vendors).set({ lat: finalLat, lng: finalLng }).where(eq2(vendors.id, body.id));
        }
      }
      recentVendorSubmissions.set(dedupKey, Date.now());
      for (const [k, t] of recentVendorSubmissions) {
        if (Date.now() - t > 6e4) recentVendorSubmissions.delete(k);
      }
      res.json({ success: true, id: body.id });
    } catch (err) {
      console.error("[APP-SUBMIT] DB error saving vendor application:", err?.message || err, "code:", err?.code, "detail:", err?.detail);
      res.status(500).json({ error: "Failed to save vendor application" });
    }
  });
  app2.get("/api/vendor-applications/mine", requireAuth, requireRole("VENDOR"), async (req, res) => {
    try {
      const phone = (req.user?.phone || "").replace(/\D/g, "").slice(-10);
      if (!phone) return res.json({ application: null });
      const rows = await db.select().from(vendorApplications).where(or(
        sql3`RIGHT(REGEXP_REPLACE(${vendorApplications.phone}, '[^0-9]', '', 'g'), 10) = ${phone}`
      )).orderBy(desc2(vendorApplications.submittedAt)).limit(1);
      const app3 = rows[0] ? { ...rows[0], submittedAt: rows[0].submittedAt?.toISOString(), reviewedAt: rows[0].reviewedAt?.toISOString() || null } : null;
      res.json({ application: app3 });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch vendor application" });
    }
  });
  app2.patch("/api/vendor/status", requireAuth, requireRole("VENDOR", "SUPER_ADMIN"), async (req, res) => {
    try {
      const phone = (req.user?.phone || "").replace(/\D/g, "").slice(-10);
      if (!phone) return res.status(400).json({ error: "No phone" });
      const { isOpen } = req.body;
      if (typeof isOpen !== "boolean") return res.status(400).json({ error: "isOpen (boolean) required" });
      const rows = await db.update(vendorApplications).set({ isOpen }).where(sql3`RIGHT(REGEXP_REPLACE(${vendorApplications.phone}, '[^0-9]', '', 'g'), 10) = ${phone}`).returning({ id: vendorApplications.id, isOpen: vendorApplications.isOpen });
      if (rows.length === 0) return res.status(404).json({ error: "Vendor not found" });
      res.json({ success: true, isOpen: rows[0].isOpen });
    } catch (err) {
      res.status(500).json({ error: "Failed to update vendor status" });
    }
  });
  app2.post("/api/vendor/location/resolve", requireAuth, requireRole("VENDOR"), async (req, res) => {
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
  app2.patch("/api/vendor/location", requireAuth, requireRole("VENDOR"), async (req, res) => {
    try {
      const phone = (req.user?.phone || "").replace(/\D/g, "").slice(-10);
      if (!phone) return res.status(400).json({ error: "No phone" });
      const { locationLink, lat, lng } = req.body;
      let resolvedLat = lat != null ? parseFloat(String(lat)) : null;
      let resolvedLng = lng != null ? parseFloat(String(lng)) : null;
      if (locationLink && typeof locationLink === "string" && locationLink.trim()) {
        const resolved = await resolveMapLinkToCoords(locationLink.trim());
        if (resolved) {
          resolvedLat = resolved.lat;
          resolvedLng = resolved.lng;
        }
      }
      if (resolvedLat === null || resolvedLng === null || isNaN(resolvedLat) || isNaN(resolvedLng)) {
        return res.status(400).json({ error: "Could not resolve location. Provide valid coordinates or a Google Maps link." });
      }
      if (resolvedLat < 6 || resolvedLat > 37 || resolvedLng < 68 || resolvedLng > 97) {
        return res.status(400).json({ error: "Coordinates appear to be outside India. Please check the location." });
      }
      const [appRow] = await db.select({ id: vendorApplications.id }).from(vendorApplications).where(sql3`RIGHT(REGEXP_REPLACE(${vendorApplications.phone}, '[^0-9]', '', 'g'), 10) = ${phone}`).orderBy(
        sql3`CASE WHEN ${vendorApplications.status} = 'LIVE' THEN 0 WHEN ${vendorApplications.status} = 'APPROVED' THEN 1 ELSE 2 END`,
        desc2(vendorApplications.submittedAt)
      ).limit(1);
      if (!appRow) return res.status(404).json({ error: "Vendor not found" });
      const vendorId = appRow.id;
      const appUpdate = { latitude: resolvedLat, longitude: resolvedLng };
      if (locationLink && typeof locationLink === "string" && locationLink.trim()) appUpdate.locationLink = locationLink.trim();
      await db.update(vendorApplications).set(appUpdate).where(eq2(vendorApplications.id, vendorId));
      await db.update(vendors).set({ lat: resolvedLat, lng: resolvedLng }).where(eq2(vendors.id, vendorId));
      invalidateVendorCache();
      res.json({ success: true, lat: resolvedLat, lng: resolvedLng });
    } catch {
      res.status(500).json({ error: "Failed to update vendor location" });
    }
  });
  app2.get("/api/vendor-applications/submitted-by-me", requireAuth, requireRole("MARKETING"), async (req, res) => {
    try {
      const userPhone = req.user?.phone || "";
      if (!userPhone) return res.json({ applications: [] });
      const cleanPhone = userPhone.replace(/\D/g, "").slice(-10);
      const cacheKey = `submitted-by-me:${cleanPhone}`;
      const cached = cache.get(cacheKey);
      if (cached) return res.json({ applications: cached });
      const [member] = await db.select().from(teamMembers).where(sql3`RIGHT(REGEXP_REPLACE(${teamMembers.phone}, '[^0-9]', '', 'g'), 10) = ${cleanPhone}`);
      const userName = member?.name || "";
      if (!userName) {
        cache.set(cacheKey, [], 15);
        return res.json({ applications: [] });
      }
      const rows = await db.select().from(vendorApplications).where(sql3`LOWER(TRIM(${vendorApplications.submittedBy})) = LOWER(TRIM(${userName}))`).orderBy(desc2(vendorApplications.submittedAt));
      const apps = rows.map((a) => ({
        ...a,
        submittedAt: a.submittedAt?.toISOString(),
        reviewedAt: a.reviewedAt?.toISOString() || null
      }));
      cache.set(cacheKey, apps, 15);
      res.json({ applications: apps });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch applications" });
    }
  });
  app2.get("/api/leads", requireAuth, requireRole("MARKETING"), async (req, res) => {
    try {
      const agentPhone = (req.user?.phone || "").replace(/\D/g, "").slice(-10);
      if (!agentPhone) return res.json({ leads: [] });
      const rows = await db.select().from(leads).where(sql3`RIGHT(REGEXP_REPLACE(${leads.marketingAgentPhone}, '[^0-9]', '', 'g'), 10) = ${agentPhone}`).orderBy(desc2(leads.createdAt));
      res.json({ leads: rows.map((r) => ({ ...r, createdAt: r.createdAt?.toISOString() })) });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch leads" });
    }
  });
  app2.post("/api/leads", requireAuth, requireRole("MARKETING"), async (req, res) => {
    try {
      const agentPhone = (req.user?.phone || "").replace(/\D/g, "").slice(-10);
      if (!agentPhone) return res.status(400).json({ error: "Agent phone required" });
      const { id, vendorName, phone, status, notes } = req.body;
      if (!id || !vendorName || !phone) return res.status(400).json({ error: "id, vendorName, phone required" });
      await db.insert(leads).values({
        id,
        vendorName,
        phone,
        status: status || "NEW",
        marketingAgentPhone: agentPhone,
        notes: notes || ""
      }).onConflictDoNothing();
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to add lead" });
    }
  });
  app2.put("/api/leads/:id", requireAuth, requireRole("MARKETING"), async (req, res) => {
    try {
      const agentPhone = (req.user?.phone || "").replace(/\D/g, "").slice(-10);
      const { id } = req.params;
      const { status, notes } = req.body;
      await db.update(leads).set({ ...status ? { status } : {}, ...notes !== void 0 ? { notes } : {} }).where(and2(
        eq2(leads.id, id),
        sql3`RIGHT(REGEXP_REPLACE(${leads.marketingAgentPhone}, '[^0-9]', '', 'g'), 10) = ${agentPhone}`
      ));
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to update lead" });
    }
  });
  app2.delete("/api/leads/:id", requireAuth, requireRole("MARKETING"), async (req, res) => {
    try {
      const agentPhone = (req.user?.phone || "").replace(/\D/g, "").slice(-10);
      const { id } = req.params;
      await db.delete(leads).where(and2(
        eq2(leads.id, id),
        sql3`RIGHT(REGEXP_REPLACE(${leads.marketingAgentPhone}, '[^0-9]', '', 'g'), 10) = ${agentPhone}`
      ));
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to delete lead" });
    }
  });
  app2.get("/api/vendor-applications", requireAuth, requireRole("SUPER_ADMIN", "FRANCHISE"), async (req, res) => {
    try {
      let rows;
      if (req.user?.role === "FRANCHISE") {
        const franchisePhone = (req.user.phone || "").replace(/\D/g, "").slice(-10);
        const [franchiseRecord] = await db.select({ name: teamMembers.name }).from(teamMembers).where(sql3`RIGHT(REGEXP_REPLACE(${teamMembers.phone}, '[^0-9]', '', 'g'), 10) = ${franchisePhone}`).limit(1);
        const franchiseName = franchiseRecord?.name || "";
        const teamRows = await db.select({ phone: teamMembers.phone }).from(teamMembers).where(
          or(
            // Members directly created by this franchise owner
            and2(eq2(teamMembers.createdByRole, "FRANCHISE"), eq2(teamMembers.createdBy, franchiseName)),
            // Members with franchise_id explicitly linked to this franchise phone
            sql3`RIGHT(REGEXP_REPLACE(${teamMembers.franchiseId}, '[^0-9]', '', 'g'), 10) = ${franchisePhone}`
          )
        );
        const allPhones = /* @__PURE__ */ new Set([franchisePhone]);
        for (const m of teamRows) {
          const p = (m.phone || "").replace(/\D/g, "").slice(-10);
          if (p.length === 10) allPhones.add(p);
        }
        const allApps = await db.select().from(vendorApplications).orderBy(desc2(vendorApplications.submittedAt));
        rows = allApps.filter((a) => {
          const af = (a.franchiseId || "").replace(/\D/g, "").slice(-10);
          if (!af) return true;
          return allPhones.has(af);
        });
      } else {
        rows = await db.select().from(vendorApplications).orderBy(desc2(vendorApplications.submittedAt));
      }
      const apps = rows.map((a) => ({
        ...a,
        submittedAt: a.submittedAt?.toISOString(),
        reviewedAt: a.reviewedAt?.toISOString() || null
      }));
      res.json({ applications: apps });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch vendor applications" });
    }
  });
  app2.put("/api/vendor-applications/:id", requireAuth, requireRole("SUPER_ADMIN", "FRANCHISE"), async (req, res) => {
    try {
      const { id } = req.params;
      const { status, rejectionReason, appData } = req.body;
      if (!status) return res.status(400).json({ error: "status required" });
      const [existing] = await db.select().from(vendorApplications).where(eq2(vendorApplications.id, id));
      if (!existing && appData && appData.businessName && appData.phone) {
        await db.insert(vendorApplications).values({
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
          submittedAt: appData.submittedAt ? new Date(appData.submittedAt) : /* @__PURE__ */ new Date(),
          reviewedBy: req.user?.name || "",
          reviewedAt: /* @__PURE__ */ new Date()
        }).onConflictDoNothing();
      } else if (!existing) {
        return res.status(404).json({ error: "Vendor application not found in database" });
      } else {
        const updateFields = {
          status,
          reviewedBy: req.user?.name || "",
          reviewedAt: /* @__PURE__ */ new Date(),
          rejectionReason: rejectionReason || null
        };
        if (req.user?.role === "FRANCHISE" && req.user?.phone && !existing.franchiseId) {
          const franchisePhone = (req.user.phone || "").replace(/\D/g, "").slice(-10);
          if (franchisePhone) updateFields.franchiseId = franchisePhone;
        }
        await db.update(vendorApplications).set(updateFields).where(eq2(vendorApplications.id, id));
      }
      const [updated] = await db.select().from(vendorApplications).where(eq2(vendorApplications.id, id));
      if (status === "LIVE" && updated) {
        const allSubCats = await db.select().from(subCategories);
        const resolvedSubCatId = updated.subCategoryId || allSubCats.find((sc) => sc.categoryId === updated.categoryId)?.id || "sc5";
        const photos = Array.isArray(updated.photos) ? updated.photos : [];
        const usablePhoto = photos.find((p) => p.startsWith("http") || p.startsWith("data:"));
        const scImage = allSubCats.find((sc) => sc.id === resolvedSubCatId)?.image;
        const vendorImage = usablePhoto || scImage || "https://images.unsplash.com/photo-1604719312566-8912e9227c6a?w=400";
        await db.insert(vendors).values({
          id: updated.id,
          name: updated.businessName,
          description: updated.description || `${updated.businessName} - Quality products & services`,
          image: vendorImage,
          rating: 4,
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
          pinCode: updated.pinCode || "",
          franchiseId: updated.franchiseId || "",
          codEnabled: false
        }).onConflictDoNothing();
        const appLat = updated.latitude ? parseFloat(String(updated.latitude)) : 0;
        const appLng = updated.longitude ? parseFloat(String(updated.longitude)) : 0;
        const _distKm = (lat1, lng1, lat2, lng2) => {
          const R = 6371, dLat = (lat2 - lat1) * Math.PI / 180, dLng = (lng2 - lng1) * Math.PI / 180;
          const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
          return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        };
        const isValidArea = appLat && appLng && Math.abs(appLat) > 1e-3 && Math.abs(appLng) > 1e-3 && _distKm(appLat, appLng, 20.5547, 74.5247) <= 50;
        if (isValidArea) {
          await db.update(vendors).set({ lat: appLat, lng: appLng, address: updated.address || "", name: updated.businessName }).where(eq2(vendors.id, updated.id));
          console.log(`[APPROVE] Synced location (${appLat}, ${appLng}) for vendor ${updated.id}`);
        }
        vendorCache = null;
      }
      res.json({ success: true, application: updated });
    } catch (err) {
      res.status(500).json({ error: "Failed to update vendor application" });
    }
  });
  app2.patch("/api/vendor-applications/:id/fields", requireAuth, requireRole("SUPER_ADMIN", "FRANCHISE"), async (req, res) => {
    try {
      const { id } = req.params;
      const { businessName, ownerName, phone, email, categoryId, subCategoryId, address, city, gstNumber, panNumber, bankAccount, ifscCode, commissionRate, description, photos, image, latitude, longitude, pinCode: newPinCode } = req.body;
      const [existing] = await db.select().from(vendorApplications).where(eq2(vendorApplications.id, id));
      if (!existing) return res.status(404).json({ error: "Vendor application not found" });
      const updates = {};
      if (businessName !== void 0) updates.businessName = businessName;
      if (ownerName !== void 0) updates.ownerName = ownerName;
      if (phone !== void 0) updates.phone = phone;
      if (email !== void 0) updates.email = email;
      if (categoryId !== void 0) updates.categoryId = categoryId;
      if (subCategoryId !== void 0) updates.subCategoryId = subCategoryId || null;
      if (address !== void 0) updates.address = address;
      if (city !== void 0) updates.city = city;
      if (gstNumber !== void 0) updates.gstNumber = gstNumber;
      if (panNumber !== void 0) updates.panNumber = panNumber;
      if (bankAccount !== void 0) updates.bankAccount = bankAccount;
      if (ifscCode !== void 0) updates.ifscCode = ifscCode;
      if (commissionRate !== void 0) updates.commissionRate = Number(commissionRate);
      if (description !== void 0) updates.description = description;
      if (photos !== void 0) updates.photos = photos;
      if (latitude !== void 0 && latitude !== null) updates.latitude = Number(latitude);
      if (longitude !== void 0 && longitude !== null) updates.longitude = Number(longitude);
      if (newPinCode !== void 0) {
        const cleanPin = (newPinCode || "").trim();
        updates.pinCode = cleanPin;
        if (cleanPin) {
          try {
            const [franchiseOwner] = await db.select({ phone: teamMembers.phone }).from(teamMembers).where(and2(
              eq2(teamMembers.role, "FRANCHISE"),
              eq2(teamMembers.pinCode, cleanPin),
              eq2(teamMembers.status, "ACTIVE")
            ));
            updates.franchiseId = franchiseOwner?.phone ? franchiseOwner.phone.replace(/\D/g, "").slice(-10) : "";
            console.log(`[FIELDS-PATCH] ${id} pin ${cleanPin} \u2192 franchise ${updates.franchiseId || "unassigned"}`);
          } catch {
          }
        } else {
          updates.franchiseId = "";
        }
      }
      if (Object.keys(updates).length === 0) return res.status(400).json({ error: "No fields to update" });
      await db.update(vendorApplications).set(updates).where(eq2(vendorApplications.id, id));
      if (existing.status === "LIVE") {
        const vendorUpdates = {};
        if (updates.businessName) vendorUpdates.name = updates.businessName;
        if (updates.description) vendorUpdates.description = updates.description;
        if (updates.categoryId) vendorUpdates.categoryId = updates.categoryId;
        if (updates.subCategoryId !== void 0) vendorUpdates.subCategoryId = updates.subCategoryId;
        if (updates.address) vendorUpdates.address = updates.address;
        if (updates.commissionRate !== void 0) vendorUpdates.commissionRate = updates.commissionRate;
        if (updates.latitude !== void 0) vendorUpdates.lat = updates.latitude;
        if (updates.longitude !== void 0) vendorUpdates.lng = updates.longitude;
        if (updates.pinCode !== void 0) vendorUpdates.pinCode = updates.pinCode;
        if (updates.franchiseId !== void 0) vendorUpdates.franchiseId = updates.franchiseId;
        if (updates.photos) {
          const photoList = Array.isArray(updates.photos) ? updates.photos : [];
          const usable = photoList.find((p) => p.startsWith("http") || p.startsWith("data:"));
          if (usable) vendorUpdates.image = usable;
        }
        if (image && (image.startsWith("http") || image.startsWith("data:"))) vendorUpdates.image = image;
        if (Object.keys(vendorUpdates).length > 0) {
          await db.update(vendors).set(vendorUpdates).where(eq2(vendors.id, id)).catch(() => {
          });
          invalidateVendorCache();
        }
      }
      const [updated] = await db.select().from(vendorApplications).where(eq2(vendorApplications.id, id));
      res.json({ success: true, application: updated });
    } catch (err) {
      res.status(500).json({ error: "Failed to update vendor fields" });
    }
  });
  app2.delete("/api/vendor-applications/:id", requireAuth, requireRole("SUPER_ADMIN"), async (req, res) => {
    try {
      const { id } = req.params;
      if (!id) return res.status(400).json({ error: "id required" });
      await db.delete(vendors).where(eq2(vendors.id, id));
      await db.delete(vendorApplications).where(eq2(vendorApplications.id, id));
      vendorCache = vendorCache.filter((v) => v.id !== id);
      res.json({ success: true });
    } catch (err) {
      console.error("Delete vendor error:", err);
      res.status(500).json({ error: "Failed to delete vendor" });
    }
  });
  app2.post("/api/vendors/:vendorId/assign-marketing-agent", requireAuth, requireRole("SUPER_ADMIN", "FRANCHISE"), async (req, res) => {
    try {
      const { vendorId } = req.params;
      const { marketingAgentName } = req.body;
      if (!marketingAgentName?.trim()) return res.status(400).json({ error: "marketingAgentName required" });
      const [existingApp] = await db.select().from(vendorApplications).where(eq2(vendorApplications.id, vendorId));
      if (existingApp) {
        await db.update(vendorApplications).set({ submittedBy: marketingAgentName.trim() }).where(eq2(vendorApplications.id, vendorId));
        return res.json({ success: true, action: "updated" });
      }
      const [vendor] = await db.select().from(vendors).where(eq2(vendors.id, vendorId));
      if (!vendor) return res.status(404).json({ error: "Vendor not found" });
      await db.insert(vendorApplications).values({
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
        submittedAt: vendor.createdAt || /* @__PURE__ */ new Date(),
        reviewedBy: req.user?.name || "",
        reviewedAt: /* @__PURE__ */ new Date()
      }).onConflictDoNothing();
      res.json({ success: true, action: "created" });
    } catch (err) {
      res.status(500).json({ error: "Failed to assign marketing agent" });
    }
  });
  app2.get("/api/ad-requests", requireAuth, requireRole("SUPER_ADMIN", "FRANCHISE"), async (_req, res) => {
    try {
      const rows = await db.select().from(adRequests).orderBy(desc2(adRequests.createdAt));
      res.json({ adRequests: rows.map((r) => ({ ...r, createdAt: r.createdAt?.toISOString(), franchiseReviewedAt: r.franchiseReviewedAt?.toISOString() || null, adminReviewedAt: r.adminReviewedAt?.toISOString() || null, startDate: r.startDate?.toISOString() || null, endDate: r.endDate?.toISOString() || null })) });
    } catch {
      res.status(500).json({ error: "Failed to fetch ad requests" });
    }
  });
  app2.post("/api/ad-requests", requireAuth, async (req, res) => {
    try {
      const b = req.body;
      const id = "AD" + Date.now().toString(36).toUpperCase().slice(-6);
      await db.insert(adRequests).values({ id, vendorId: b.vendorId, vendorName: b.vendorName, title: b.title, subtitle: b.subtitle || null, description: b.description || null, slotType: b.slotType, color: b.color || null, offerText: b.offerText || null, durationDays: b.durationDays, amountPaid: b.amountPaid || 0, status: "PENDING_FRANCHISE" });
      const [row] = await db.select().from(adRequests).where(eq2(adRequests.id, id));
      res.json({ adRequest: { ...row, createdAt: row.createdAt?.toISOString() } });
    } catch {
      res.status(500).json({ error: "Failed to create ad request" });
    }
  });
  app2.put("/api/ad-requests/:id", requireAuth, requireRole("SUPER_ADMIN", "FRANCHISE"), async (req, res) => {
    try {
      const { id } = req.params;
      const b = req.body;
      const updateData = { status: b.status };
      if (b.rejectionReason !== void 0) updateData.rejectionReason = b.rejectionReason;
      if (b.franchiseReview) {
        updateData.franchiseReviewedAt = /* @__PURE__ */ new Date();
        updateData.franchiseReviewedBy = req.user?.name || "Franchise Manager";
      }
      if (b.adminReview) {
        updateData.adminReviewedAt = /* @__PURE__ */ new Date();
        updateData.adminReviewedBy = req.user?.name || "Admin";
      }
      if (b.status === "LIVE") {
        updateData.startDate = /* @__PURE__ */ new Date();
        updateData.endDate = new Date(Date.now() + (b.durationDays || 30) * 24 * 60 * 60 * 1e3);
      }
      await db.update(adRequests).set(updateData).where(eq2(adRequests.id, id));
      const [row] = await db.select().from(adRequests).where(eq2(adRequests.id, id));
      res.json({ adRequest: { ...row, createdAt: row.createdAt?.toISOString(), franchiseReviewedAt: row.franchiseReviewedAt?.toISOString() || null, adminReviewedAt: row.adminReviewedAt?.toISOString() || null, startDate: row.startDate?.toISOString() || null, endDate: row.endDate?.toISOString() || null } });
    } catch {
      res.status(500).json({ error: "Failed to update ad request" });
    }
  });
  app2.get("/api/vendors/:vendorId/image", async (req, res) => {
    try {
      const { vendorId } = req.params;
      const cacheKey = `vendor:${vendorId}`;
      let entry = imgCacheGet(cacheKey);
      if (!entry) {
        const [row] = await db.select({ image: vendors.image }).from(vendors).where(eq2(vendors.id, vendorId));
        if (!row?.image) return res.status(404).send("No image");
        const buf = await compressToBuffer(row.image);
        const etag = `"${crypto4.createHash("md5").update(buf).digest("hex")}"`;
        entry = { buf, etag };
        imgCacheSet(cacheKey, entry);
      }
      if (req.headers["if-none-match"] === entry.etag) return res.status(304).end();
      res.set({
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=604800, stale-while-revalidate=86400",
        "Content-Length": entry.buf.length.toString(),
        "ETag": entry.etag
      });
      return res.end(entry.buf);
    } catch {
      return res.status(500).send("Image error");
    }
  });
  app2.get("/api/vendors/:vendorId", async (req, res) => {
    try {
      const { vendorId } = req.params;
      const [row] = await db.select({ ...getTableColumns(vendors), phone: vendorApplications.phone }).from(vendors).leftJoin(vendorApplications, eq2(vendorApplications.id, vendors.id)).where(eq2(vendors.id, vendorId));
      if (row) {
        const { image: _img, paymentQrUrl: _qr, ...vendorData } = row;
        res.set("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
        return res.json({ vendor: { ...vendorData, hasImage: !!(_img && _img.length > 10), hasPaymentQrImage: !!(_qr && _qr.length > 10), hasPaymentQr: !!(_qr && _qr.length > 10) || !!vendorData.upiId?.includes?.("@") } });
      }
      const [appRow] = await db.select({
        id: vendorApplications.id,
        categoryId: vendorApplications.categoryId,
        subCategoryId: vendorApplications.subCategoryId,
        businessName: vendorApplications.businessName,
        address: vendorApplications.address,
        phone: vendorApplications.phone
      }).from(vendorApplications).where(eq2(vendorApplications.id, vendorId));
      if (!appRow) return res.status(404).json({ error: "Vendor not found" });
      res.set("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
      return res.json({ vendor: { id: appRow.id, name: appRow.businessName, categoryId: appRow.categoryId, subCategoryId: appRow.subCategoryId || "", address: appRow.address || "", phone: appRow.phone || "", hasImage: false, hasPaymentQr: false, applicationStatus: appRow.status } });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch vendor" });
    }
  });
  app2.get("/api/vendors", async (req, res) => {
    try {
      const { pinCode, franchiseId } = req.query;
      const stripImage = (v) => {
        const { image: _img, paymentQrUrl: _qr, ...rest } = v;
        return { ...rest, hasImage: !!_img, hasPaymentQrImage: !!(_qr && _qr.length > 10), hasPaymentQr: !!(_qr && _qr.length > 10) || !!rest.upiId?.includes?.("@") };
      };
      if (!pinCode?.trim() && !franchiseId?.trim()) {
        if (vendorCache !== null) {
          if (Date.now() - vendorCacheUpdatedAt > VENDOR_CACHE_TTL_MS) {
            refreshVendorCache();
          }
          res.set("Cache-Control", "public, max-age=120, stale-while-revalidate=300");
          return res.json({ vendors: vendorCache.map(stripImage) });
        }
        await refreshVendorCache();
        if (!vendorCache || vendorCache.length === 0) {
          await new Promise((r) => setTimeout(r, 2e3));
          await refreshVendorCache();
        }
        return res.json({ vendors: (vendorCache ?? []).map(stripImage) });
      }
      const vendorCols = { ...getTableColumns(vendors), phone: vendorApplications.phone };
      let filteredRows;
      if (pinCode && pinCode.trim()) {
        filteredRows = await db.select(vendorCols).from(vendors).leftJoin(vendorApplications, eq2(vendorApplications.id, vendors.id)).where(or(
          eq2(vendors.pinCode, pinCode.trim()),
          isNull(vendors.pinCode),
          eq2(vendors.pinCode, "")
        )).orderBy(desc2(vendors.createdAt));
      } else if (franchiseId && franchiseId.trim()) {
        filteredRows = await db.select(vendorCols).from(vendors).leftJoin(vendorApplications, eq2(vendorApplications.id, vendors.id)).where(eq2(vendors.franchiseId, franchiseId.trim())).orderBy(desc2(vendors.createdAt));
      } else {
        filteredRows = await db.select(vendorCols).from(vendors).leftJoin(vendorApplications, eq2(vendorApplications.id, vendors.id)).orderBy(desc2(vendors.createdAt));
      }
      res.json({ vendors: filteredRows.map(stripImage) });
    } catch (err) {
      if (vendorCache !== null) {
        const stripImg = (v) => {
          const { image: _i, paymentQrUrl: _q, ...r } = v;
          return { ...r, hasImage: !!_i, hasPaymentQrImage: !!(_q && _q.length > 10), hasPaymentQr: !!(_q && _q.length > 10) || !!r.upiId?.includes?.("@") };
        };
        return res.json({ vendors: vendorCache.map(stripImg) });
      }
      res.status(500).json({ error: "Failed to fetch vendors" });
    }
  });
  app2.get("/api/vendors/:vendorId/payment-qr", async (req, res) => {
    try {
      const { vendorId } = req.params;
      const [row] = await db.select({ paymentQrUrl: vendors.paymentQrUrl }).from(vendors).where(eq2(vendors.id, vendorId));
      if (!row?.paymentQrUrl) return res.status(404).send("No QR");
      const base64 = row.paymentQrUrl.replace(/^data:image\/\w+;base64,/, "");
      const buffer = Buffer2.from(base64, "base64");
      res.set({
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=3600",
        "Content-Length": buffer.length.toString()
      });
      return res.end(buffer);
    } catch {
      return res.status(500).send("QR error");
    }
  });
  async function authorizeVendorQrMutation(req, vendorId) {
    const [vendor] = await db.select().from(vendors).where(eq2(vendors.id, vendorId));
    if (!vendor) return { ok: false, status: 404, error: "Vendor not found" };
    const role = req.user?.role;
    if (role === "SUPER_ADMIN" || role === "FRANCHISE") return { ok: true, vendor };
    const userPhone = String(req.user?.phone || "").replace(/\D/g, "").slice(-10);
    if (!userPhone) return { ok: false, status: 403, error: "Not authorized to manage this vendor's QR" };
    const [app3] = await db.select({ id: vendorApplications.id, phone: vendorApplications.phone }).from(vendorApplications).where(eq2(vendorApplications.id, vendorId));
    const appPhone = String(app3?.phone || "").replace(/\D/g, "").slice(-10);
    if (app3 && appPhone && appPhone === userPhone) return { ok: true, vendor };
    return { ok: false, status: 403, error: "Not authorized to manage this vendor's QR" };
  }
  app2.patch("/api/vendors/:vendorId/payment-qr", requireAuth, async (req, res) => {
    try {
      const { vendorId } = req.params;
      const { image } = req.body;
      if (!image) return res.status(400).json({ error: "image required" });
      if (typeof image !== "string") {
        return res.status(400).json({ error: "image must be a data URL string" });
      }
      const mimeMatch = image.match(/^data:(image\/(?:png|jpeg|jpg));base64,([A-Za-z0-9+/=\s]+)$/i);
      if (!mimeMatch) {
        return res.status(400).json({ error: "QR must be a PNG or JPEG data URL" });
      }
      const base64Payload = mimeMatch[2].replace(/\s/g, "");
      const approxBytes = Math.floor(base64Payload.length * 3 / 4);
      if (approxBytes > 15e5) {
        return res.status(413).json({ error: "QR image too large (max 1.5 MB)" });
      }
      const authz = await authorizeVendorQrMutation(req, vendorId);
      if (!authz.ok) return res.status(authz.status).json({ error: authz.error });
      await db.update(vendors).set({ paymentQrUrl: image }).where(eq2(vendors.id, vendorId));
      invalidateVendorCache();
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Failed to update payment QR" });
    }
  });
  app2.delete("/api/vendors/:vendorId/payment-qr", requireAuth, async (req, res) => {
    try {
      const { vendorId } = req.params;
      const authz = await authorizeVendorQrMutation(req, vendorId);
      if (!authz.ok) return res.status(authz.status).json({ error: authz.error });
      await db.update(vendors).set({ paymentQrUrl: null }).where(eq2(vendors.id, vendorId));
      invalidateVendorCache();
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Failed to remove payment QR" });
    }
  });
  app2.patch("/api/vendors/:vendorId/upi-id", requireAuth, async (req, res) => {
    try {
      const { vendorId } = req.params;
      const { upiId } = req.body;
      const trimmed = typeof upiId === "string" ? upiId.trim().toLowerCase() : "";
      if (trimmed && (!trimmed.includes("@") || trimmed.length > 100)) {
        return res.status(400).json({ error: "Invalid UPI ID \u2014 must contain '@' (e.g. name@upi)" });
      }
      const authz = await authorizeVendorQrMutation(req, vendorId);
      if (!authz.ok) return res.status(authz.status).json({ error: authz.error });
      await db.update(vendors).set({ upiId: trimmed || null }).where(eq2(vendors.id, vendorId));
      invalidateVendorCache();
      res.json({ success: true, upiId: trimmed || null });
    } catch {
      res.status(500).json({ error: "Failed to update UPI ID" });
    }
  });
  app2.patch("/api/vendors/:vendorId/image", requireAuth, async (req, res) => {
    try {
      const { vendorId } = req.params;
      const { image } = req.body;
      if (!image) return res.status(400).json({ error: "image required" });
      if (!image.startsWith("data:image/") && !image.startsWith("http")) {
        return res.status(400).json({ error: "image must be a data URL or http URL" });
      }
      const imageToStore = image.startsWith("data:image/") ? await compressImageDataUrl(image).catch(() => image) : image;
      await db.update(vendors).set({ image: imageToStore }).where(eq2(vendors.id, vendorId));
      imgCacheInvalidate(`vendor:${vendorId}`);
      invalidateVendorCache();
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to update vendor image" });
    }
  });
  app2.patch("/api/vendors/:id", requireAuth, requireRole("SUPER_ADMIN", "FRANCHISE"), async (req, res) => {
    try {
      const { id } = req.params;
      const { name, description, commissionRate, categoryId, subCategoryId, address, pinCode, isOpen, rating, deliveryTime, codEnabled, lat, lng } = req.body;
      const [existing] = await db.select().from(vendors).where(eq2(vendors.id, id));
      if (!existing) return res.status(404).json({ error: "Vendor not found" });
      const updates = {};
      if (name !== void 0) updates.name = name.trim();
      if (description !== void 0) updates.description = description.trim();
      if (commissionRate !== void 0) updates.commissionRate = Number(commissionRate);
      if (categoryId !== void 0) updates.categoryId = categoryId;
      if (subCategoryId !== void 0) updates.subCategoryId = subCategoryId || "";
      if (address !== void 0) updates.address = address.trim();
      if (pinCode !== void 0) updates.pinCode = pinCode.trim();
      if (isOpen !== void 0) updates.isOpen = Boolean(isOpen);
      if (rating !== void 0) updates.rating = Math.min(5, Math.max(1, Number(rating)));
      if (deliveryTime !== void 0) updates.deliveryTime = deliveryTime.trim();
      if (codEnabled !== void 0) updates.codEnabled = Boolean(codEnabled);
      if (lat !== void 0 && lat !== null && lat !== "") updates.lat = Number(lat);
      if (lng !== void 0 && lng !== null && lng !== "") updates.lng = Number(lng);
      if (Object.keys(updates).length === 0) return res.status(400).json({ error: "No fields to update" });
      await db.update(vendors).set(updates).where(eq2(vendors.id, id));
      const appUpdates = {};
      if (updates.name) appUpdates.businessName = updates.name;
      if (updates.description) appUpdates.description = updates.description;
      if (updates.commissionRate !== void 0) appUpdates.commissionRate = updates.commissionRate;
      if (updates.categoryId) appUpdates.categoryId = updates.categoryId;
      if (updates.subCategoryId !== void 0) appUpdates.subCategoryId = updates.subCategoryId;
      if (updates.address) appUpdates.address = updates.address;
      if (updates.pinCode !== void 0) appUpdates.pinCode = updates.pinCode;
      if (updates.lat !== void 0) appUpdates.latitude = updates.lat;
      if (updates.lng !== void 0) appUpdates.longitude = updates.lng;
      if (Object.keys(appUpdates).length > 0) {
        await db.update(vendorApplications).set(appUpdates).where(eq2(vendorApplications.id, id)).catch(() => {
        });
      }
      invalidateVendorCache();
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to update vendor" });
    }
  });
  app2.post("/api/vendors", requireAuth, requireRole("SUPER_ADMIN", "FRANCHISE"), async (req, res) => {
    try {
      const body = req.body;
      if (!body.id || !body.name || !body.categoryId) {
        return res.status(400).json({ error: "id, name, categoryId required" });
      }
      await db.insert(vendors).values({
        id: body.id,
        name: body.name,
        description: body.description || "",
        image: body.image || "",
        rating: body.rating ?? 4,
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
        codEnabled: body.codEnabled ?? false
      }).onConflictDoNothing();
      invalidateVendorCache();
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to create vendor" });
    }
  });
  app2.get("/api/categories", async (_req, res) => {
    try {
      const cats = await db.select().from(categories);
      res.json({ categories: cats });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch categories" });
    }
  });
  app2.get("/api/subcategories", async (_req, res) => {
    try {
      const subs = await db.select().from(subCategories);
      res.json({ subCategories: subs });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch sub-categories" });
    }
  });
  app2.get("/api/bus-routes", async (req, res) => {
    try {
      const { vendorId, productId } = req.query;
      let routes;
      if (vendorId) {
        routes = await db.select().from(busRoutes).where(eq2(busRoutes.vendorId, vendorId));
      } else if (productId) {
        routes = await db.select().from(busRoutes).where(eq2(busRoutes.productId, productId));
      } else {
        routes = await db.select().from(busRoutes);
      }
      res.json({ busRoutes: routes });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch bus routes" });
    }
  });
  const STATIC_SUBCAT_IDS = /* @__PURE__ */ new Set(["sc1", "sc2", "sc3", "sc4", "sc5", "sc6", "sc7", "sc8", "sc9", "sc10", "sc11", "sc12", "sc13", "sc14", "sc15", "sc16", "sc17", "sc18", "sc19", "sc20", "sc21", "sc22", "sc23", "sc24", "sc25", "sc26", "sc27", "sc28", "sc29", "sc30"]);
  app2.get("/api/subcategories/custom", async (_req, res) => {
    try {
      const all = await db.select().from(subCategories);
      const custom = all.filter((sc) => !STATIC_SUBCAT_IDS.has(sc.id));
      res.json({ customSubCategories: custom });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch custom subcategories" });
    }
  });
  app2.post("/api/subcategories/custom", requireAuth, requireRole("SUPER_ADMIN", "FRANCHISE"), async (req, res) => {
    try {
      const body = req.body;
      if (!body.id || !body.name || !body.categoryId) {
        return res.status(400).json({ error: "id, name, categoryId required" });
      }
      await db.insert(subCategories).values({
        id: body.id,
        categoryId: body.categoryId,
        name: body.name,
        icon: body.icon || "grid-outline",
        image: body.image || "https://images.unsplash.com/photo-1604719312566-8912e9227c6a?w=400"
      }).onConflictDoNothing();
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to create custom subcategory" });
    }
  });
  (async () => {
    try {
      const staleIds = ["VAW2HLEO", "VA2CSM9S", "VAV71OXU", "VALW1UHK", "VA765LDP"];
      const deletedVendors = await db.delete(vendors).where(inArray(vendors.id, staleIds));
      const deletedApps = await db.delete(vendorApplications).where(inArray(vendorApplications.id, staleIds));
      const vCount = deletedVendors.rowCount ?? 0;
      const aCount = deletedApps.rowCount ?? 0;
      if (vCount > 0 || aCount > 0) {
        console.log(`[cleanup] Removed ${vCount} stale vendor(s) and ${aCount} stale application(s)`);
      }
    } catch (e) {
      console.error("[cleanup] Stale vendor cleanup error:", e);
    }
  })();
  (async () => {
    const nameBasedFixes = [
      { name: "New mushtaque pan", image: "https://images.unsplash.com/photo-1596040033229-a9821ebd058d?w=600" },
      { name: "Rajdhani garments junction", image: "https://images.unsplash.com/photo-1441984904996-e0b6ba687e04?w=600" },
      { name: "New Ansar patra depo", image: "https://images.unsplash.com/photo-1504328345606-18bbc8c9d7d1?w=600" },
      // industrial / steel & pipes
      { name: "Royal Glass Art & Aluminium", image: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600" }
      // glass / aluminium
    ];
    try {
      const allVendors = await db.select({ id: vendors.id, name: vendors.name, image: vendors.image }).from(vendors);
      for (const fix of nameBasedFixes) {
        const match = allVendors.find((v) => v.name.toLowerCase().trim() === fix.name.toLowerCase().trim());
        if (!match) continue;
        if (match.image && !match.image.includes("unsplash.com")) continue;
        await db.update(vendors).set({ image: fix.image }).where(eq2(vendors.id, match.id));
        await db.update(vendorApplications).set({ photos: [fix.image] }).where(eq2(vendorApplications.id, match.id));
        console.log(`[fix-images] Set appropriate placeholder for "${match.name}" (${match.id})`);
      }
    } catch (e) {
      console.error("[fix-images] Error updating vendor images:", e);
    }
  })();
  app2.get("/api/home-content", async (_req, res) => {
    try {
      const [banners, deals, promo] = await Promise.all([
        db.select().from(homeBanners).orderBy(homeBanners.order),
        db.select().from(homeDeals).orderBy(desc2(homeDeals.createdAt)),
        db.select().from(promoMedia).orderBy(desc2(promoMedia.createdAt))
      ]);
      res.json({ banners, deals, promoMedia: promo });
    } catch {
      res.status(500).json({ error: "Failed to load home content" });
    }
  });
  app2.post("/api/home-banners", requireAuth, requireRole("SUPER_ADMIN"), async (req, res) => {
    try {
      const { title, subtitle, color, ctaText, isActive, order, image } = req.body;
      const id = "hb" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      await db.insert(homeBanners).values({ id, title: title || "", subtitle: subtitle || "", color: color || "#FF6B00", ctaText: ctaText || "", isActive: isActive !== false, order: order ?? 0, image: image || null });
      const [created] = await db.select().from(homeBanners).where(eq2(homeBanners.id, id));
      res.json({ success: true, banner: created });
    } catch {
      res.status(500).json({ error: "Failed to add banner" });
    }
  });
  app2.put("/api/home-banners/:id", requireAuth, requireRole("SUPER_ADMIN"), async (req, res) => {
    try {
      const { id } = req.params;
      const { title, subtitle, color, ctaText, isActive, order, image } = req.body;
      const updates = {};
      if (title !== void 0) updates.title = title;
      if (subtitle !== void 0) updates.subtitle = subtitle;
      if (color !== void 0) updates.color = color;
      if (ctaText !== void 0) updates.ctaText = ctaText;
      if (isActive !== void 0) updates.isActive = isActive;
      if (order !== void 0) updates.order = order;
      if (image !== void 0) updates.image = image;
      await db.update(homeBanners).set(updates).where(eq2(homeBanners.id, id));
      const [updated] = await db.select().from(homeBanners).where(eq2(homeBanners.id, id));
      res.json({ success: true, banner: updated });
    } catch {
      res.status(500).json({ error: "Failed to update banner" });
    }
  });
  app2.delete("/api/home-banners/:id", requireAuth, requireRole("SUPER_ADMIN"), async (req, res) => {
    try {
      await db.delete(homeBanners).where(eq2(homeBanners.id, req.params.id));
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Failed to delete banner" });
    }
  });
  app2.post("/api/home-deals", requireAuth, requireRole("SUPER_ADMIN"), async (req, res) => {
    try {
      const { name, image, price, originalPrice, endsInHours, sold, total, productId, isActive } = req.body;
      const id = "hd" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      await db.insert(homeDeals).values({ id, name: name || "", image: image || "", price: Number(price) || 0, originalPrice: Number(originalPrice) || 0, endsInHours: Number(endsInHours) || 24, sold: Number(sold) || 0, total: Number(total) || 100, productId: productId || null, isActive: isActive !== false });
      const [created] = await db.select().from(homeDeals).where(eq2(homeDeals.id, id));
      res.json({ success: true, deal: created });
    } catch {
      res.status(500).json({ error: "Failed to add deal" });
    }
  });
  app2.put("/api/home-deals/:id", requireAuth, requireRole("SUPER_ADMIN"), async (req, res) => {
    try {
      const { id } = req.params;
      const { name, image, price, originalPrice, endsInHours, sold, total, productId, isActive } = req.body;
      const updates = {};
      if (name !== void 0) updates.name = name;
      if (image !== void 0) updates.image = image;
      if (price !== void 0) updates.price = Number(price);
      if (originalPrice !== void 0) updates.originalPrice = Number(originalPrice);
      if (endsInHours !== void 0) updates.endsInHours = Number(endsInHours);
      if (sold !== void 0) updates.sold = Number(sold);
      if (total !== void 0) updates.total = Number(total);
      if (productId !== void 0) updates.productId = productId || null;
      if (isActive !== void 0) updates.isActive = isActive;
      await db.update(homeDeals).set(updates).where(eq2(homeDeals.id, id));
      const [updated] = await db.select().from(homeDeals).where(eq2(homeDeals.id, id));
      res.json({ success: true, deal: updated });
    } catch {
      res.status(500).json({ error: "Failed to update deal" });
    }
  });
  app2.delete("/api/home-deals/:id", requireAuth, requireRole("SUPER_ADMIN"), async (req, res) => {
    try {
      await db.delete(homeDeals).where(eq2(homeDeals.id, req.params.id));
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Failed to delete deal" });
    }
  });
  app2.post("/api/promo-media", requireAuth, requireRole("SUPER_ADMIN"), async (req, res) => {
    try {
      const { type, uri, isActive } = req.body;
      if (!uri) return res.status(400).json({ error: "uri is required" });
      const id = "pm" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      await db.insert(promoMedia).values({ id, type: type || "image", uri, isActive: isActive !== false });
      const [created] = await db.select().from(promoMedia).where(eq2(promoMedia.id, id));
      res.json({ success: true, media: created });
    } catch {
      res.status(500).json({ error: "Failed to add promo media" });
    }
  });
  app2.patch("/api/promo-media/:id/toggle", requireAuth, requireRole("SUPER_ADMIN"), async (req, res) => {
    try {
      const { isActive } = req.body;
      await db.update(promoMedia).set({ isActive }).where(eq2(promoMedia.id, req.params.id));
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Failed to toggle promo media" });
    }
  });
  app2.delete("/api/promo-media/:id", requireAuth, requireRole("SUPER_ADMIN"), async (req, res) => {
    try {
      await db.delete(promoMedia).where(eq2(promoMedia.id, req.params.id));
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Failed to delete promo media" });
    }
  });
  app2.get("/api/reels", async (_req, res) => {
    try {
      const rows = await db.select().from(reels).orderBy(desc2(reels.createdAt));
      const reels2 = rows.map((r) => ({
        ...r,
        taggedProducts: Array.isArray(r.taggedProducts) ? r.taggedProducts : [],
        createdAt: r.createdAt?.toISOString() ?? (/* @__PURE__ */ new Date()).toISOString()
      }));
      res.json({ reels: reels2 });
    } catch {
      res.status(500).json({ error: "Failed to fetch reels" });
    }
  });
  app2.post("/api/reels", requireAuth, async (req, res) => {
    try {
      const { userId, userName, userAvatar, userRole, vendorId, thumbnail, videoUrl, caption, taggedProducts } = req.body;
      if (!userId || !userName || !userRole) return res.status(400).json({ error: "Missing required fields" });
      const id = `reel_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      await db.insert(reels).values({
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
        taggedProducts: Array.isArray(taggedProducts) ? taggedProducts : []
      });
      const [row] = await db.select().from(reels).where(eq2(reels.id, id));
      res.json({ success: true, reel: { ...row, taggedProducts: Array.isArray(row.taggedProducts) ? row.taggedProducts : [], createdAt: row.createdAt?.toISOString() ?? (/* @__PURE__ */ new Date()).toISOString() } });
    } catch (e) {
      res.status(500).json({ error: "Failed to save reel", detail: e?.message });
    }
  });
  app2.delete("/api/reels/:id", requireAuth, async (req, res) => {
    try {
      const reel = await db.select({ userId: reels.userId }).from(reels).where(eq2(reels.id, req.params.id));
      if (!reel.length) return res.status(404).json({ error: "Reel not found" });
      const isOwner = reel[0].userId === req.user?.id;
      const isAdmin = ["SUPER_ADMIN", "FRANCHISE"].includes(req.user?.role);
      if (!isOwner && !isAdmin) return res.status(403).json({ error: "Not allowed" });
      await db.delete(reels).where(eq2(reels.id, req.params.id));
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Failed to delete reel" });
    }
  });
  app2.get("/api/coins/balance", requireAuth, async (req, res) => {
    try {
      const cleanPhone = (req.user?.phone || "").replace(/\D/g, "").slice(-10);
      if (!cleanPhone) return res.status(401).json({ error: "Unauthorized" });
      const jwtId = req.user?.id || "";
      const txnWhere = jwtId && jwtId !== cleanPhone ? or(eq2(coinTransactions.userId, cleanPhone), eq2(coinTransactions.userId, jwtId)) : eq2(coinTransactions.userId, cleanPhone);
      const txns = await db.select().from(coinTransactions).where(txnWhere).orderBy(desc2(coinTransactions.createdAt)).limit(500);
      const grants = await db.select().from(coinGrants).where(eq2(coinGrants.phone, cleanPhone)).orderBy(desc2(coinGrants.createdAt));
      const grantTotal = grants.reduce((sum, g) => sum + g.amount, 0);
      const txnBalance = txns.reduce((sum, t) => t.type === "REDEEMED" ? sum - t.amount : sum + t.amount, 0);
      const balance = Math.max(0, grantTotal + txnBalance);
      const grantTxns = grants.map((g) => ({
        id: `CG_${g.id}`,
        type: "EARNED",
        amount: g.amount,
        reference: g.note || "Admin coin grant",
        createdAt: g.createdAt?.toISOString() ?? (/* @__PURE__ */ new Date()).toISOString()
      }));
      const txnHistory = txns.map((t) => ({
        id: t.id,
        type: t.type,
        amount: t.amount,
        reference: t.reference,
        createdAt: t.createdAt?.toISOString() ?? (/* @__PURE__ */ new Date()).toISOString()
      }));
      const allTxns = [...grantTxns, ...txnHistory].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 500);
      res.json({ balance, transactions: allTxns });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch coin balance" });
    }
  });
  app2.post("/api/coins/add", requireAuth, async (req, res) => {
    try {
      const cleanPhone = (req.user?.phone || "").replace(/\D/g, "").slice(-10);
      if (!cleanPhone) return res.status(401).json({ error: "Unauthorized" });
      const { amount, type, reference } = req.body;
      if (!amount || Number(amount) <= 0) return res.status(400).json({ error: "Invalid amount" });
      const validTypes = ["EARNED", "PURCHASED", "BONUS"];
      if (!validTypes.includes(String(type))) return res.status(400).json({ error: "Invalid type" });
      const id = `CT_${Date.now()}_${crypto4.randomBytes(4).toString("hex")}`;
      await db.insert(coinTransactions).values({
        id,
        userId: cleanPhone,
        type: String(type),
        amount: Math.round(Number(amount)),
        reference: String(reference || "").slice(0, 500)
      });
      res.json({ success: true, id });
    } catch (err) {
      res.status(500).json({ error: "Failed to record coin transaction" });
    }
  });
  app2.post("/api/coins/redeem", requireAuth, async (req, res) => {
    try {
      const cleanPhone = (req.user?.phone || "").replace(/\D/g, "").slice(-10);
      if (!cleanPhone) return res.status(401).json({ error: "Unauthorized" });
      const { amount, reference } = req.body;
      if (!amount || Number(amount) <= 0) return res.status(400).json({ error: "Invalid amount" });
      const jwtId = req.user?.id || "";
      const txnWhere = jwtId && jwtId !== cleanPhone ? or(eq2(coinTransactions.userId, cleanPhone), eq2(coinTransactions.userId, jwtId)) : eq2(coinTransactions.userId, cleanPhone);
      const [txns, grants] = await Promise.all([
        db.select({ type: coinTransactions.type, amount: coinTransactions.amount }).from(coinTransactions).where(txnWhere),
        db.select({ amount: coinGrants.amount }).from(coinGrants).where(eq2(coinGrants.phone, cleanPhone))
      ]);
      const grantTotal = grants.reduce((sum, g) => sum + g.amount, 0);
      const txnBalance = txns.reduce((sum, t) => t.type === "REDEEMED" ? sum - t.amount : sum + t.amount, 0);
      const balance = Math.max(0, grantTotal + txnBalance);
      if (Math.round(Number(amount)) > balance) {
        return res.status(400).json({ error: `Insufficient coins. Available: ${balance}` });
      }
      const id = `CT_${Date.now()}_${crypto4.randomBytes(4).toString("hex")}`;
      await db.insert(coinTransactions).values({
        id,
        userId: cleanPhone,
        type: "REDEEMED",
        amount: Math.round(Number(amount)),
        reference: String(reference || "").slice(0, 500)
      });
      res.json({ success: true, id, newBalance: balance - Math.round(Number(amount)) });
    } catch (err) {
      res.status(500).json({ error: "Failed to redeem coins" });
    }
  });
  app2.post("/api/coins/redeem-to-wallet", requireAuth, async (req, res) => {
    try {
      const cleanPhone = (req.user?.phone || "").replace(/\D/g, "").slice(-10);
      if (!cleanPhone) return res.status(401).json({ error: "Unauthorized" });
      const walletUserId = req.user?.id || cleanPhone;
      const COIN_TO_INR = 100;
      const MIN_REDEEM_COINS = 1;
      const coins = Math.floor(Number(req.body?.coins));
      if (!coins || coins < MIN_REDEEM_COINS) {
        return res.status(400).json({ error: `Minimum redemption is ${MIN_REDEEM_COINS} coin (\u20B9${MIN_REDEEM_COINS * COIN_TO_INR}).` });
      }
      const idempotencyKey = typeof req.body?.idempotencyKey === "string" && req.body.idempotencyKey.trim() ? req.body.idempotencyKey.trim().slice(0, 80) : "";
      const jwtId = req.user?.id || "";
      const txnWhere = jwtId && jwtId !== cleanPhone ? or(eq2(coinTransactions.userId, cleanPhone), eq2(coinTransactions.userId, jwtId)) : eq2(coinTransactions.userId, cleanPhone);
      const rupees = coins * COIN_TO_INR;
      const coinTxnId = `CT_${Date.now()}_${crypto4.randomBytes(4).toString("hex")}`;
      const walletTxnId = `wt_redeem_${Date.now()}_${crypto4.randomBytes(4).toString("hex")}`;
      const coinRef = `Redeemed ${coins} coins to wallet (\u20B9${rupees})`;
      const walletRef = `Coin Redemption:${idempotencyKey || coinTxnId}`;
      const outcome = await db.transaction(async (tx) => {
        await tx.execute(sql3`SELECT pg_advisory_xact_lock(hashtext(${"coin_redeem:" + cleanPhone}))`);
        const [txns, grants, walletTxns] = await Promise.all([
          tx.select({ type: coinTransactions.type, amount: coinTransactions.amount }).from(coinTransactions).where(txnWhere),
          tx.select({ amount: coinGrants.amount }).from(coinGrants).where(eq2(coinGrants.phone, cleanPhone)),
          tx.select({ type: walletTransactions.type, amount: walletTransactions.amount }).from(walletTransactions).where(eq2(walletTransactions.userId, walletUserId))
        ]);
        const grantTotal = grants.reduce((sum, g) => sum + g.amount, 0);
        const txnBalance = txns.reduce((sum, t) => t.type === "REDEEMED" ? sum - t.amount : sum + t.amount, 0);
        const coinBalance = Math.max(0, grantTotal + txnBalance);
        if (coins > coinBalance) {
          return { ok: false, code: 400, error: `Insufficient coins. Available: ${coinBalance}` };
        }
        const walletBalanceBefore = Math.max(0, walletTxns.reduce((sum, t) => t.type === "CREDIT" ? sum + t.amount : sum - t.amount, 0));
        await tx.insert(coinTransactions).values({
          id: coinTxnId,
          userId: cleanPhone,
          type: "REDEEMED",
          amount: coins,
          reference: coinRef.slice(0, 500)
        });
        await tx.insert(walletTransactions).values({
          id: walletTxnId,
          userId: walletUserId,
          type: "CREDIT",
          amount: rupees,
          reference: walletRef
        });
        return { ok: true, newCoinBalance: coinBalance - coins, newWalletBalance: walletBalanceBefore + rupees };
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
        walletReference: walletRef
      });
    } catch (err) {
      if (err?.code === "23505") {
        return res.status(409).json({ error: "This redemption was already processed." });
      }
      console.error("[COINS] redeem-to-wallet failed:", err);
      res.status(500).json({ error: "Failed to redeem coins to wallet" });
    }
  });
  app2.post("/api/admin/coins/grant", requireAuth, requireRole("SUPER_ADMIN"), async (req, res) => {
    try {
      const { phone, amount, note } = req.body;
      if (!phone || !amount || amount <= 0) {
        return res.status(400).json({ error: "phone and positive amount are required" });
      }
      const cleanPhone = String(phone).replace(/\D/g, "").slice(-10);
      if (cleanPhone.length !== 10) return res.status(400).json({ error: "Invalid phone number" });
      const grantedBy = (req.user?.phone || "").replace(/\D/g, "").slice(-10);
      const id = `CG_${Date.now()}_${crypto4.randomBytes(4).toString("hex")}`;
      await db.insert(coinGrants).values({
        id,
        phone: cleanPhone,
        amount: Math.round(amount),
        note: String(note || "Admin grant").slice(0, 200),
        grantedBy,
        claimedAt: /* @__PURE__ */ new Date()
      });
      res.json({ success: true, grantId: id });
    } catch (err) {
      res.status(500).json({ error: "Failed to create coin grant" });
    }
  });
  app2.get("/api/coins/my-grants", requireAuth, async (req, res) => {
    try {
      const cleanPhone = (req.user?.phone || "").replace(/\D/g, "").slice(-10);
      if (!cleanPhone) return res.json({ grants: [], total: 0 });
      const unclaimed = await db.select().from(coinGrants).where(and2(eq2(coinGrants.phone, cleanPhone), isNull(coinGrants.claimedAt)));
      if (unclaimed.length > 0) {
        await db.update(coinGrants).set({ claimedAt: /* @__PURE__ */ new Date() }).where(inArray(coinGrants.id, unclaimed.map((g) => g.id)));
      }
      const total = unclaimed.reduce((sum, g) => sum + g.amount, 0);
      res.json({ grants: unclaimed, total });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch coin grants" });
    }
  });
  app2.get("/api/admin/coins/grants", requireAuth, requireRole("SUPER_ADMIN"), async (req, res) => {
    try {
      const history = await db.select().from(coinGrants).orderBy(desc2(coinGrants.createdAt)).limit(100);
      res.json({
        grants: history.map((g) => ({
          ...g,
          createdAt: g.createdAt?.toISOString(),
          claimedAt: g.claimedAt?.toISOString() ?? null
        }))
      });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch grant history" });
    }
  });
}

// server/index.ts
import * as fs from "fs";
import * as path from "path";
var log = console.log;
var bootstrapServer = globalThis.__GO_BHARAT_SERVER;
var bootstrapStartupHandler = globalThis.__GO_BHARAT_STARTUP_HANDLER;
var app = express();
var server;
function setupCors(app2) {
  app2.use((req, res, next) => {
    const origins = /* @__PURE__ */ new Set();
    if (process.env.REPLIT_DEV_DOMAIN) {
      origins.add(`https://${process.env.REPLIT_DEV_DOMAIN}`);
    }
    if (process.env.REPLIT_DOMAINS) {
      process.env.REPLIT_DOMAINS.split(",").forEach((d) => {
        origins.add(`https://${d.trim()}`);
      });
    }
    const origin = req.header("origin");
    const isLocalhost = origin?.startsWith("http://localhost:") || origin?.startsWith("http://127.0.0.1:");
    if (origin && (origins.has(origin) || isLocalhost)) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, DELETE, OPTIONS"
      );
      res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.header("Access-Control-Allow-Credentials", "true");
    }
    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }
    next();
  });
}
function setupBodyParsing(app2) {
  app2.use(
    express.json({
      limit: "20mb",
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      }
    })
  );
  app2.use(express.urlencoded({ extended: false, limit: "20mb" }));
}
function setupRequestLogging(app2) {
  app2.use((req, res, next) => {
    const start = Date.now();
    const path2 = req.path;
    let capturedJsonResponse = void 0;
    const originalResJson = res.json;
    res.json = function(bodyJson, ...args) {
      capturedJsonResponse = bodyJson;
      return originalResJson.apply(res, [bodyJson, ...args]);
    };
    res.on("finish", () => {
      if (!path2.startsWith("/api")) return;
      const duration = Date.now() - start;
      let logLine = `${req.method} ${path2} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }
      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "\u2026";
      }
      log(logLine);
    });
    next();
  });
}
function serveExpoManifest(platform, res) {
  const manifestPath = path.resolve(
    process.cwd(),
    "static-build",
    platform,
    "manifest.json"
  );
  if (!fs.existsSync(manifestPath)) {
    return res.status(404).json({ error: `Manifest not found for platform: ${platform}` });
  }
  res.setHeader("expo-protocol-version", "1");
  res.setHeader("expo-sfv-version", "0");
  res.setHeader("content-type", "application/json");
  const manifest = fs.readFileSync(manifestPath, "utf-8");
  res.send(manifest);
}
function configureExpoAndLanding(app2) {
  const adminPath = path.resolve(process.cwd(), "server", "templates", "admin.html");
  const adminTemplate = fs.readFileSync(adminPath, "utf-8");
  log("Serving Go Bharat Expo app at /");
  app2.get("/admin", (_req, res) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(200).send(adminTemplate);
  });
  app2.get("/robots.txt", (_req, res) => {
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.status(200).send(
      "User-agent: *\nAllow: /\nSitemap: https://gobharat.in/sitemap.xml\n"
    );
  });
  const serveExpoApp = (res) => {
    const indexPath = path.resolve(process.cwd(), "static-build", "index.html");
    if (fs.existsSync(indexPath)) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache");
      return res.sendFile(indexPath);
    }
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(200).send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Go Bharat</title></head><body><p>Loading Go Bharat...</p></body></html>`);
  };
  app2.use((req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    const platform = req.header("expo-platform");
    if ((req.path === "/" || req.path === "/manifest") && platform && (platform === "ios" || platform === "android")) {
      return serveExpoManifest(platform, res);
    }
    next();
  });
  app2.use("/assets", express.static(path.resolve(process.cwd(), "assets")));
  app2.use(express.static(path.resolve(process.cwd(), "static-build")));
  app2.use((req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    serveExpoApp(res);
  });
  log("Expo app: / | Admin panel: /admin");
}
function setupErrorHandler(app2) {
  app2.use((err, _req, res, next) => {
    const error = err;
    const status = error.status || error.statusCode || 500;
    const message = error.message || "Internal Server Error";
    console.error("Internal Server Error:", err);
    if (res.headersSent) {
      return next(err);
    }
    return res.status(status).json({ message });
  });
}
(async () => {
  app.set("trust proxy", 1);
  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
  }));
  app.use(compression());
  const authLimiter = rateLimit({
    windowMs: 60 * 1e3,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many authentication attempts, please try again later" }
  });
  const aiLimiter = rateLimit({
    windowMs: 60 * 1e3,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many AI requests, please try again later" }
  });
  const writeLimiter = rateLimit({
    windowMs: 60 * 1e3,
    max: 50,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many write requests, please try again later" }
  });
  const readLimiter = rateLimit({
    windowMs: 60 * 1e3,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests, please try again later" },
    skip: (req) => !req.path.startsWith("/api")
  });
  app.use("/api/otp", authLimiter);
  app.use("/api/ai", aiLimiter);
  app.use("/api/payments", writeLimiter);
  app.use(readLimiter);
  setupCors(app);
  setupBodyParsing(app);
  setupRequestLogging(app);
  configureExpoAndLanding(app);
  app.get("/map", (_req, res) => {
    const mapPath = path.resolve(process.cwd(), "server", "templates", "map.html");
    res.sendFile(mapPath);
  });
  app.get("/api/health", async (_req, res) => {
    try {
      const poolHealth = await getPoolHealth();
      res.json({
        status: "healthy",
        uptime: process.uptime(),
        database: poolHealth,
        cache: cache.stats(),
        memory: {
          heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
          rss: Math.round(process.memoryUsage().rss / 1024 / 1024)
        }
      });
    } catch (err) {
      res.status(500).json({ status: "unhealthy", error: String(err) });
    }
  });
  if (bootstrapServer) {
    server = bootstrapServer;
  } else {
    server = createServer(app);
    const port = parseInt(process.env.PORT || "5000", 10);
    const host = process.env.HOST || "0.0.0.0";
    const startListening = () => {
      server.listen({ port, host }, () => {
        log(`express server listening on ${host}:${port}`);
      });
    };
    server.on("error", (err) => {
      if (err.code === "EADDRINUSE") {
        log(`Port ${port} is in use \u2014 killing stale process and retrying\u2026`);
        import("child_process").then(({ exec }) => {
          exec(`fuser -k ${port}/tcp 2>/dev/null; sleep 1`, () => {
            setTimeout(() => {
              server.removeAllListeners("error");
              server.on("error", (e) => {
                console.error("Server error after retry:", e);
                process.exit(1);
              });
              startListening();
            }, 1e3);
          });
        });
      } else {
        throw err;
      }
    });
    import("child_process").then(({ exec }) => {
      exec(`fuser -k ${port}/tcp 2>/dev/null; true`, () => {
        setTimeout(startListening, 500);
      });
    });
  }
  registerRoutes(app).then(() => {
    setupErrorHandler(app);
    if (bootstrapServer && bootstrapStartupHandler) {
      server.removeListener("request", bootstrapStartupHandler);
      server.on("request", app);
      log("Server switched to full application handler");
    }
    log("All routes registered \u2014 server fully ready");
  }).catch((err) => {
    console.error("Failed to register routes:", err);
    setupErrorHandler(app);
    if (bootstrapServer && bootstrapStartupHandler) {
      server.removeListener("request", bootstrapStartupHandler);
      server.on("request", app);
    }
  });
  const gracefulShutdown = (signal) => {
    log(`Received ${signal}. Shutting down gracefully...`);
    if (typeof server.closeAllConnections === "function") {
      server.closeAllConnections();
    }
    server.close(async () => {
      log("HTTP server closed");
      try {
        await pool.end();
        log("Database pool closed");
      } catch (err) {
        console.error("Error closing database pool:", err);
      }
      process.exit(0);
    });
    setTimeout(() => {
      console.error("Forced shutdown after timeout");
      process.exit(1);
    }, 3e3);
  };
  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));
})();

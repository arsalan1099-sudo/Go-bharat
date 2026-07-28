import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, timestamp, doublePrecision, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const appUsers = pgTable("app_users", {
  id: varchar("id", { length: 64 }).primaryKey(),
  name: text("name").notNull(),
  phone: varchar("phone", { length: 15 }).notNull(),
  email: text("email").default(""),
  role: varchar("role", { length: 20 }).notNull(),
  avatar: text("avatar"),
  vendorCategoryId: varchar("vendor_category_id", { length: 10 }),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_app_users_phone").on(table.phone),
]);

// Links a Google account (stable Google "sub" id) to a phone-based account.
// Phone remains the canonical identity; this table just lets a verified Google
// sign-in resolve to the user's phone so returning users skip the OTP step.
export const googleAccounts = pgTable("google_accounts", {
  googleSub: varchar("google_sub", { length: 64 }).primaryKey(),
  email: text("email").notNull(),
  phone: varchar("phone", { length: 15 }).notNull(),
  name: text("name").default(""),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_google_accounts_phone").on(table.phone),
  index("idx_google_accounts_email").on(table.email),
]);

export const categories = pgTable("categories", {
  id: varchar("id", { length: 10 }).primaryKey(),
  name: text("name").notNull(),
  icon: text("icon").notNull(),
  color: varchar("color", { length: 10 }).notNull(),
});

export const subCategories = pgTable("sub_categories", {
  id: varchar("id", { length: 20 }).primaryKey(),
  categoryId: varchar("category_id", { length: 10 }).notNull(),
  name: text("name").notNull(),
  icon: text("icon").notNull().default("pricetag"),
  image: text("image").notNull().default(""),
});

export const vendors = pgTable("vendors", {
  id: varchar("id", { length: 64 }).primaryKey(),
  name: text("name").notNull(),
  description: text("description").default(""),
  image: text("image").default(""),
  rating: doublePrecision("rating").default(4.0),
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
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_vendors_category_id").on(table.categoryId),
  index("idx_vendors_sub_category_id").on(table.subCategoryId),
  index("idx_vendors_pin_code").on(table.pinCode),
  index("idx_vendors_franchise_id").on(table.franchiseId),
]);

export const products = pgTable("products", {
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
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_products_vendor_id").on(table.vendorId),
  index("idx_products_category").on(table.category),
]);

export const orders = pgTable("orders", {
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
  deliveredAt: timestamp("delivered_at"),
}, (table) => [
  index("idx_orders_customer_id").on(table.customerId),
  index("idx_orders_vendor_id").on(table.vendorId),
  index("idx_orders_status").on(table.status),
  index("idx_orders_delivery_partner_id").on(table.deliveryPartnerId),
  index("idx_orders_vendor_status").on(table.vendorId, table.status),
  index("idx_orders_customer_status").on(table.customerId, table.status),
]);

export const orderItems = pgTable("order_items", {
  id: varchar("id", { length: 64 }).primaryKey(),
  orderId: varchar("order_id", { length: 64 }).notNull(),
  productId: varchar("product_id", { length: 64 }).notNull(),
  productName: text("product_name").notNull(),
  quantity: integer("quantity").notNull(),
  price: doublePrecision("price").notNull(),
  seatNumber: varchar("seat_number", { length: 10 }),
  seatClass: varchar("seat_class", { length: 20 }),
});

export const addresses = pgTable("addresses", {
  id: varchar("id", { length: 64 }).primaryKey(),
  userId: varchar("user_id", { length: 64 }).notNull(),
  label: varchar("label", { length: 50 }).notNull(),
  fullAddress: text("full_address").notNull(),
  lat: doublePrecision("lat").default(0),
  lng: doublePrecision("lng").default(0),
  isDefault: boolean("is_default").default(false),
});

export const walletTransactions = pgTable("wallet_transactions", {
  id: varchar("id", { length: 64 }).primaryKey(),
  userId: varchar("user_id", { length: 64 }).notNull(),
  type: varchar("type", { length: 10 }).notNull(),
  amount: doublePrecision("amount").notNull(),
  reference: text("reference").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_wallet_transactions_user_id").on(table.userId),
]);

export const notifications = pgTable("notifications", {
  id: varchar("id", { length: 128 }).primaryKey(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  targetRole: varchar("target_role", { length: 20 }).notNull().default("ALL"),
  targetUserId: varchar("target_user_id", { length: 64 }),
  read: boolean("read").default(false),
  sentAt: timestamp("sent_at").defaultNow(),
}, (table) => [
  index("idx_notifications_target_user_id").on(table.targetUserId),
  index("idx_notifications_target_role").on(table.targetRole),
  index("idx_notifications_user_sent").on(table.targetUserId, table.sentAt),
]);

export const reviews = pgTable("reviews", {
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
  vendorReplyAt: timestamp("vendor_reply_at"),
}, (table) => [
  index("idx_reviews_vendor_id").on(table.vendorId),
  index("idx_reviews_product_id").on(table.productId),
]);

export const teamMembers = pgTable("team_members", {
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
  pinCode: varchar("pin_code", { length: 10 }).default(""),
});

export const vendorApplications = pgTable("vendor_applications", {
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
  rejectionReason: text("rejection_reason"),
}, (table) => [
  index("idx_vendor_apps_submitted_by").on(table.submittedBy),
  index("idx_vendor_apps_franchise_id").on(table.franchiseId),
  index("idx_vendor_apps_status").on(table.status),
  index("idx_vendor_apps_submitted_at").on(table.submittedAt),
]);

export const otpCodes = pgTable("otp_codes", {
  id: varchar("id", { length: 64 }).primaryKey().default(sql`gen_random_uuid()`),
  phone: varchar("phone", { length: 15 }).notNull(),
  code: varchar("code", { length: 6 }).notNull(),
  email: text("email"),
  expiresAt: timestamp("expires_at").notNull(),
  verified: boolean("verified").default(false),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_otp_codes_phone").on(table.phone),
]);

export const pushTokens = pgTable("push_tokens", {
  id: varchar("id", { length: 64 }).primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 64 }).notNull().unique(),
  token: text("token").notNull(),
  platform: varchar("platform", { length: 16 }).notNull(),
  role: varchar("role", { length: 20 }).default(""),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_push_tokens_role").on(table.role),
]);

export const reels = pgTable("reels", {
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
  createdAt: timestamp("created_at").defaultNow(),
});

export const communityPosts = pgTable("community_posts", {
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
  createdAt: timestamp("created_at").defaultNow(),
});

export const customerStories = pgTable("customer_stories", {
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
  createdAt: timestamp("created_at").defaultNow(),
});

export const coupons = pgTable("coupons", {
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
  createdAt: timestamp("created_at").defaultNow(),
});

export const adRequests = pgTable("ad_requests", {
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
  endDate: timestamp("end_date"),
});

export const transactions = pgTable("transactions", {
  id: varchar("id", { length: 64 }).primaryKey(),
  orderId: varchar("order_id", { length: 64 }),
  razorpayOrderId: varchar("razorpay_order_id", { length: 64 }),
  razorpayPaymentId: varchar("razorpay_payment_id", { length: 64 }),
  gatewayTransactionId: varchar("gateway_transaction_id", { length: 64 }),
  amount: doublePrecision("amount").notNull(),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  method: varchar("method", { length: 20 }).default("razorpay"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_transactions_order_id").on(table.orderId),
  index("idx_transactions_razorpay_order_id").on(table.razorpayOrderId),
  index("idx_transactions_gateway_txn_id").on(table.gatewayTransactionId),
]);

export const featureFlags = pgTable("feature_flags", {
  id: varchar("id", { length: 64 }).primaryKey(),
  name: text("name").notNull(),
  description: text("description").default(""),
  enabled: boolean("enabled").default(true),
  roles: jsonb("roles").default(["ALL"]),
  category: varchar("category", { length: 30 }).default("core"),
  icon: varchar("icon", { length: 50 }).default("flag"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const dynamicPages = pgTable("dynamic_pages", {
  id: varchar("id", { length: 64 }).primaryKey(),
  title: text("title").notNull(),
  slug: varchar("slug", { length: 100 }).notNull(),
  targetRoles: jsonb("target_roles").default(["ALL"]),
  blocks: jsonb("blocks").default([]),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const appAnnouncements = pgTable("app_announcements", {
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
  createdAt: timestamp("created_at").defaultNow(),
});

export const withdrawalRequests = pgTable("withdrawal_requests", {
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
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_withdrawal_requests_payout_ref").on(table.payoutRef),
]);

export const payoutDetails = pgTable("payout_details", {
  userId: varchar("user_id", { length: 64 }).primaryKey(),
  method: varchar("method", { length: 20 }).notNull(),
  accountHolder: text("account_holder").default(""),
  bankName: text("bank_name").default(""),
  accountNumber: varchar("account_number", { length: 30 }).default(""),
  ifsc: varchar("ifsc", { length: 20 }).default(""),
  upiId: varchar("upi_id", { length: 64 }).default(""),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const notificationReads = pgTable("notification_reads", {
  id: varchar("id", { length: 128 }).primaryKey(),
  notificationId: varchar("notification_id", { length: 128 }).notNull(),
  userId: varchar("user_id", { length: 64 }).notNull(),
  readAt: timestamp("read_at").defaultNow(),
}, (table) => [
  index("idx_notification_reads_user").on(table.userId),
  index("idx_notification_reads_notif").on(table.notificationId),
]);

export const liveSessions = pgTable("live_sessions", {
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
  createdAt: timestamp("created_at").defaultNow(),
});

export const busRoutes = pgTable("bus_routes", {
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
  stops: jsonb("stops").default([]),
});

export const homeBanners = pgTable("home_banners", {
  id: varchar("id", { length: 64 }).primaryKey(),
  title: text("title").notNull().default(""),
  subtitle: text("subtitle").notNull().default(""),
  color: varchar("color", { length: 20 }).notNull().default("#FF6B00"),
  ctaText: text("cta_text").notNull().default(""),
  isActive: boolean("is_active").notNull().default(true),
  order: integer("order").notNull().default(0),
  image: text("image"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const homeDeals = pgTable("home_deals", {
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
  createdAt: timestamp("created_at").defaultNow(),
});

export const promoMedia = pgTable("promo_media", {
  id: varchar("id", { length: 64 }).primaryKey(),
  type: varchar("type", { length: 10 }).notNull().default("image"),
  uri: text("uri").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const leads = pgTable("leads", {
  id: varchar("id", { length: 64 }).primaryKey(),
  vendorName: text("vendor_name").notNull(),
  phone: varchar("phone", { length: 15 }).notNull(),
  status: varchar("status", { length: 20 }).notNull().default("NEW"),
  marketingAgentPhone: varchar("marketing_agent_phone", { length: 15 }).notNull(),
  notes: text("notes").default(""),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_leads_agent_phone").on(table.marketingAgentPhone),
]);

export const coinGrants = pgTable("coin_grants", {
  id: varchar("id", { length: 64 }).primaryKey(),
  phone: varchar("phone", { length: 15 }).notNull(),
  amount: integer("amount").notNull(),
  note: text("note").default(""),
  grantedBy: varchar("granted_by", { length: 15 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  claimedAt: timestamp("claimed_at"),
}, (table) => [
  index("idx_coin_grants_phone").on(table.phone),
]);

export const coinTransactions = pgTable("coin_transactions", {
  id: varchar("id", { length: 64 }).primaryKey(),
  userId: varchar("user_id", { length: 64 }).notNull(),
  type: varchar("type", { length: 20 }).notNull(),
  amount: integer("amount").notNull(),
  reference: text("reference").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_coin_transactions_user_id").on(table.userId),
]);

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

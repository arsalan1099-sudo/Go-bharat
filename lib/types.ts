export type UserRole = "CUSTOMER" | "VENDOR" | "DELIVERY" | "FRANCHISE" | "MARKETING" | "SUPER_ADMIN";

export interface User {
  id: string;
  name: string;
  phone: string;
  email: string;
  role: UserRole;
  avatar?: string;
  vendorCategoryId?: string;
}

export interface Address {
  id: string;
  userId: string;
  label: string;
  fullAddress: string;
  lat: number;
  lng: number;
  isDefault: boolean;
}

export interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
}

export interface SubCategory {
  id: string;
  categoryId: string;
  name: string;
  icon: string;
  image: string;
}

export interface Vendor {
  id: string;
  name: string;
  description: string;
  image: string;
  hasImage?: boolean;
  rating: number;
  reviewCount: number;
  deliveryTime: string;
  distance: string;
  isOpen: boolean;
  categoryId: string;
  subCategoryId: string;
  commissionRate: number;
  lat: number;
  lng: number;
  address?: string;
  pinCode?: string;
  franchiseId?: string;
  codEnabled?: boolean;
  phone?: string;
  paymentQrUrl?: string;
  hasPaymentQr?: boolean;
  hasPaymentQrImage?: boolean;
  upiId?: string;
}

export interface Product {
  id: string;
  vendorId: string;
  name: string;
  description: string;
  price: number;
  originalPrice?: number;
  image: string;
  isAvailable: boolean;
  category: string;
  codEnabled?: boolean;
  rating?: number;
}

export interface CartItem {
  product: Product;
  quantity: number;
  vendorId: string;
  vendorName: string;
}

export interface Order {
  id: string;
  customerId: string;
  customerName?: string;
  vendorId: string;
  vendorName: string;
  vendorCategoryId?: string;
  deliveryPartnerId?: string;
  deliveryPartnerName?: string;
  items: OrderItem[];
  status: OrderStatus;
  totalAmount: number;
  paymentStatus: "PENDING" | "PAID" | "FAILED" | "REFUNDED" | "PENDING_VERIFICATION";
  paymentMethod?: "ONLINE" | "COD" | "WALLET" | "COINS" | "VENDOR_QR";
  createdAt: string;
  deliveryAddress: string;
  vendorAddress?: string;
  deliveryOTP?: string;
  deliveryNote?: string;
  deliverySpeed?: "express" | "standard" | "scheduled";
  assignedAt?: string;
  pickedAt?: string;
  deliveredAt?: string;
}

export interface OrderItem {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  price: number;
  seatNumber?: string;
  seatClass?: string;
}

export type FlightSeatStatus = "available" | "booked" | "blocked";
export type TrainBerthType = "LB" | "MB" | "UB" | "SL" | "SU";

export interface SeatInfo {
  id: string;
  label: string;
  status: FlightSeatStatus;
  price?: number;
  class?: string;
  berthType?: TrainBerthType;
}

export type OrderStatus =
  | "PENDING"
  | "ACCEPTED"
  | "PREPARING"
  | "READY"
  | "PICKED"
  | "ON_THE_WAY"
  | "DELIVERED"
  | "CANCELLED"
  | "PAYMENT_FAILED";

export interface WalletTransaction {
  id: string;
  type: "CREDIT" | "DEBIT";
  amount: number;
  reference: string;
  createdAt: string;
}

export type CoinTransactionType = "EARNED" | "PURCHASED" | "REDEEMED" | "BONUS";

export interface CoinTransaction {
  id: string;
  type: CoinTransactionType;
  amount: number;
  reference: string;
  createdAt: string;
}

export interface Lead {
  id: string;
  vendorName: string;
  phone: string;
  status: "NEW" | "CONTACTED" | "NEGOTIATION" | "CLOSED";
  createdAt: string;
}

export interface Coupon {
  id: string;
  code: string;
  discountType: "PERCENTAGE" | "FLAT";
  value: number;
  minOrder: number;
  expiresAt: string;
}

export interface Reel {
  id: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  userRole: "CUSTOMER" | "VENDOR";
  vendorId?: string;
  thumbnail: string;
  videoUrl: string;
  caption: string;
  likes: number;
  comments: number;
  shares: number;
  isLiked: boolean;
  taggedProducts: TaggedProduct[];
  createdAt: string;
}

export interface ReelComment {
  id: string;
  reelId: string;
  userId: string;
  userName: string;
  text: string;
  createdAt: string;
}

export interface TaggedProduct {
  productId: string;
  productName: string;
  productImage: string;
  price: number;
  originalPrice?: number;
  vendorId: string;
  vendorName: string;
}

export interface AdminCoupon {
  id: string;
  code: string;
  discountType: "PERCENTAGE" | "FLAT";
  value: number;
  minOrder: number;
  maxDiscount?: number;
  usageLimit: number;
  usedCount: number;
  isActive: boolean;
  expiresAt: string;
  createdAt: string;
}

export interface BannedUser {
  id: string;
  name: string;
  phone: string;
  role: UserRole;
  bannedAt: string;
  reason: string;
}

export interface Notification {
  id: string;
  title: string;
  message: string;
  targetRole: UserRole | "ALL";
  targetUserId?: string;
  read: boolean;
  sentAt: string;
}

export type VendorAppStatus = "PENDING" | "APPROVED" | "REJECTED" | "LIVE";

export type VendorPaymentMethod = "CASH" | "UPI" | "BANK_TRANSFER" | "CHEQUE";
export type VendorSubscriptionPlan = "MONTHLY" | "QUARTERLY" | "HALF_YEARLY" | "ANNUAL";

export interface VendorApplication {
  id: string;
  businessName: string;
  ownerName: string;
  phone: string;
  email: string;
  categoryId: string;
  subCategoryId?: string;
  address: string;
  city: string;
  pinCode?: string;
  franchiseId?: string;
  latitude?: number;
  longitude?: number;
  locationLink?: string;
  description: string;
  gstNumber: string;
  panNumber: string;
  bankAccount: string;
  ifscCode: string;
  commissionRate: number;
  paymentMethods?: VendorPaymentMethod[];
  upiId?: string;
  subscriptionPlan?: VendorSubscriptionPlan;
  photos?: string[];
  status: VendorAppStatus;
  submittedBy: string;
  submittedAt: string;
  reviewedBy?: string;
  reviewedAt?: string;
  rejectionReason?: string;
}

export interface TeamMember {
  id: string;
  name: string;
  phone: string;
  email: string;
  role: "MARKETING" | "DELIVERY" | "FRANCHISE" | "SUPER_ADMIN";
  city: string;
  status: "ACTIVE" | "INACTIVE";
  createdBy: string;
  createdByRole: "FRANCHISE" | "SUPER_ADMIN";
  createdAt: string;
  territory?: string;
  bankName?: string;
  accountNumber?: string;
  ifscCode?: string;
  accountHolderName?: string;
  aadhaarNumber?: string;
  panNumber?: string;
  dateOfBirth?: string;
  gender?: "Male" | "Female" | "Other";
  fullAddress?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  vehicleNumber?: string;
  drivingLicenseNumber?: string;
  franchiseId?: string;
  pinCode?: string;
}

export interface Review {
  id: string;
  userId: string;
  userName: string;
  productId?: string;
  vendorId: string;
  rating: number;
  comment: string;
  photos: string[];
  createdAt: string;
  helpful: number;
  vendorReply?: string;
  vendorReplyAt?: string;
}

export interface CustomerStory {
  id: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  location: string;
  rating: number;
  title: string;
  story: string;
  photos: string[];
  vendorId?: string;
  vendorName?: string;
  productId?: string;
  productName?: string;
  likes: number;
  isLiked?: boolean;
  isFeatured: boolean;
  createdAt: string;
}

export type AdSlotType = "BANNER" | "FEATURED" | "SPOTLIGHT";
export type AdStatus = "PENDING_FRANCHISE" | "PENDING_ADMIN" | "APPROVED" | "LIVE" | "REJECTED" | "EXPIRED";

export interface AdRequest {
  id: string;
  vendorId: string;
  vendorName: string;
  title: string;
  subtitle: string;
  description: string;
  slotType: AdSlotType;
  color: string;
  offerText?: string;
  durationDays: number;
  startDate?: string;
  endDate?: string;
  amountPaid: number;
  status: AdStatus;
  rejectionReason?: string;
  createdAt: string;
  franchiseReviewedAt?: string;
  franchiseReviewedBy?: string;
  adminReviewedAt?: string;
  adminReviewedBy?: string;
}

export interface CommunityPost {
  id: string;
  userId: string;
  userName: string;
  userRole: "CUSTOMER" | "VENDOR";
  vendorId?: string;
  content: string;
  images: string[];
  likes: number;
  isLiked: boolean;
  commentsCount: number;
  postType: "UPDATE" | "OFFER" | "REVIEW" | "QUESTION" | "ANNOUNCEMENT";
  taggedProducts?: { productId: string; productName: string; price: number; image: string }[];
  isPinned?: boolean;
  isHidden?: boolean;
  createdAt: string;
}

export interface CommunityComment {
  id: string;
  postId: string;
  userId: string;
  userName: string;
  text: string;
  createdAt: string;
}

export interface VendorFollow {
  id: string;
  userId: string;
  vendorId: string;
  vendorName: string;
  followedAt: string;
}

export interface FeatureFlag {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  roles: (UserRole | "ALL")[];
  category: "core" | "social" | "commerce" | "ai" | "visual";
  icon: string;
  updatedAt: string;
}

export type ContentBlockType = "banner" | "text" | "product_grid" | "promo_card" | "announcement" | "image_carousel" | "cta_button" | "spacer";

export interface ContentBlock {
  id: string;
  type: ContentBlockType;
  config: Record<string, any>;
  order: number;
}

export interface DynamicPage {
  id: string;
  title: string;
  slug: string;
  targetRoles: (UserRole | "ALL")[];
  blocks: ContentBlock[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AppAnnouncement {
  id: string;
  title: string;
  message: string;
  type: "info" | "warning" | "success" | "promo";
  icon: string;
  color: string;
  targetRoles: (UserRole | "ALL")[];
  actionLabel?: string;
  actionRoute?: string;
  isActive: boolean;
  priority: number;
  expiresAt?: string;
  createdAt: string;
}

export interface ThemeOverride {
  id: string;
  name: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  isActive: boolean;
  targetRoles: (UserRole | "ALL")[];
  createdAt: string;
}

export type DealSlotDuration = "1day" | "3days" | "7days";

export type DealBookingStatus = "PENDING" | "APPROVED" | "REJECTED" | "ACTIVE" | "EXPIRED";
export type DealPaymentMethod = "upi" | "card" | "netbanking" | "wallet";

export interface DealBooking {
  id: string;
  vendorId: string;
  vendorName: string;
  productId: string;
  productName: string;
  productImage: string;
  dealPrice: number;
  originalPrice: number;
  duration: DealSlotDuration;
  slotFee: number;
  paymentMethod: DealPaymentMethod;
  status: DealBookingStatus;
  rejectionReason?: string;
  createdAt: string;
  approvedAt?: string;
  expiresAt?: string;
}

export type WithdrawalMethod = "UPI" | "BANK";
export type WithdrawalStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "REJECTED";

export interface WithdrawalRequest {
  id: string;
  userId: string;
  userName: string;
  userRole: UserRole;
  amount: number;
  method: WithdrawalMethod;
  bankDetails: {
    bankName: string;
    accountNumber: string;
    ifsc: string;
    upiId?: string;
  };
  status: WithdrawalStatus;
  rejectionReason?: string;
  createdAt: string;
  processedAt?: string;
  transactionId?: string;
}

export type LiveSessionStatus = "LIVE" | "SCHEDULED" | "ENDED";

export interface LiveChatMessage {
  id: string;
  userId: string;
  userName: string;
  message: string;
  timestamp: string;
  isVendor: boolean;
}

export interface LiveSession {
  id: string;
  vendorId: string;
  vendorName: string;
  vendorImage?: string;
  title: string;
  description: string;
  thumbnail: string;
  videoUrl: string;
  taggedProducts: TaggedProduct[];
  viewers: number;
  peakViewers: number;
  likes: number;
  isLiked: boolean;
  status: LiveSessionStatus;
  scheduledAt?: string;
  startedAt?: string;
  endedAt?: string;
  chatMessages: LiveChatMessage[];
}

export type VendorSubscriptionDuration = "MONTHLY" | "QUARTERLY" | "HALF_YEARLY" | "ANNUAL";

export interface AdminPricing {
  dealSlotRates: Record<DealSlotDuration, number>;
  vendorOnboardingFee: number;
  defaultCommissionRate: number;
  deliveryChargePerKm: number;
  platformServiceFee: number;
  adSlotRates: { banner: number; featured: number; spotlight: number };
  vendorSubscriptionRates: Record<VendorSubscriptionDuration, number>;
  updatedAt: string;
}

export type InvoiceType = "ORDER" | "DEAL_SLOT" | "AD_SLOT" | "WALLET_TOPUP" | "PAYOUT" | "WITHDRAWAL";

export interface InvoiceItem {
  description: string;
  hsnSac: string;
  qty: number;
  rate: number;
  taxableValue: number;
  cgstRate: number;
  cgstAmount: number;
  sgstRate: number;
  sgstAmount: number;
  total: number;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  type: InvoiceType;
  referenceId: string;
  fromName: string;
  fromAddress: string;
  fromGSTIN: string;
  fromPhone: string;
  toName: string;
  toAddress: string;
  toGSTIN?: string;
  toPhone: string;
  items: InvoiceItem[];
  subtotal: number;
  cgstTotal: number;
  sgstTotal: number;
  totalTax: number;
  grandTotal: number;
  amountInWords: string;
  paymentMethod: string;
  transactionId: string;
  createdAt: string;
  notes?: string;
}

export interface HomeBanner {
  id: string;
  title: string;
  subtitle: string;
  color: string;
  ctaText: string;
  isActive: boolean;
  order: number;
  image?: string;
  createdAt: string;
}

export interface PromoMedia {
  id: string;
  type: "image" | "video";
  uri: string;
  isActive: boolean;
  createdAt: string;
}

export interface HomeDeal {
  id: string;
  name: string;
  image: string;
  price: number;
  originalPrice: number;
  endsInHours: number;
  sold: number;
  total: number;
  productId?: string;
  isActive: boolean;
  createdAt: string;
}

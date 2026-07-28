import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useApp } from "@/lib/store";

type SectionKey =
  | "overview"
  | "roles"
  | "customer"
  | "vendor"
  | "delivery"
  | "franchise"
  | "marketing"
  | "admin"
  | "auth"
  | "payments"
  | "ads"
  | "reels"
  | "stories"
  | "languages"
  | "teams"
  | "onboarding";

interface ManualSection {
  key: SectionKey;
  title: string;
  icon: string;
  color: string;
  content: { heading: string; body: string; tips?: string[] }[];
}

const MANUAL_SECTIONS: ManualSection[] = [
  {
    key: "overview",
    title: "App Overview",
    icon: "information-circle",
    color: "#3B82F6",
    content: [
      {
        heading: "What is Go Bharat?",
        body: "Go Bharat is a multi-role hyperlocal super app designed for India, starting from Malegaon, Maharashtra. It connects customers with local vendors, delivery partners, franchise owners, and marketing executives on a single platform.",
      },
      {
        heading: "Platform Highlights",
        body: "The app supports 6 user roles, 4 business categories (B2B, B2C, Service, Manpower), 18+ sub-categories, social commerce through reels, AI-powered search, multi-language support (8 Indian languages), and a complete payment gateway system.",
      },
      {
        heading: "How It Works",
        body: "Customers browse products/services from local vendors, place orders, and get deliveries. Vendors list and sell products. Delivery partners pick up and deliver. Franchise owners manage territories. Marketing executives bring in new vendors. Super Admin oversees everything.",
        tips: [
          "All users log in via phone number + OTP",
          "Roles are selected during registration",
          "Location-based language auto-detection available",
        ],
      },
    ],
  },
  {
    key: "roles",
    title: "User Roles Guide",
    icon: "people",
    color: "#8B5CF6",
    content: [
      {
        heading: "6 User Roles",
        body: "The app has 6 distinct roles, each with their own dashboard, features, and permissions:",
        tips: [
          "Customer - Browse, order products, track deliveries, write reviews, submit stories",
          "Vendor/Seller - List products, manage orders, upload reels, book ads, view earnings",
          "Delivery Partner - Accept deliveries, navigate with drive mode, track earnings",
          "Franchise Owner - Manage territory, approve vendors, review ads, create teams, custom sub-categories",
          "Marketing Executive - Submit vendor applications, manage leads, track incentives",
          "Super Admin - Full platform control, all management screens, system monitoring",
        ],
      },
      {
        heading: "Role-Based Navigation",
        body: "Each role gets a dedicated tab bar navigation. Customers have 5 tabs (Home, Reels, Cart, Orders, Profile). Vendors have 5 tabs (Dashboard, Products, Reels, Orders, Profile). Delivery has 4 tabs. Franchise, Marketing, and Admin use stack navigation.",
      },
    ],
  },
  {
    key: "auth",
    title: "Login & Authentication",
    icon: "lock-closed",
    color: "#10B981",
    content: [
      {
        heading: "Login Flow",
        body: "Users see an onboarding carousel, then enter their phone number and select their role on the same screen. After pressing Continue, they verify with a 6-digit OTP. The system auto-verifies when all 6 digits are entered.",
        tips: [
          "Phone number: 10-digit Indian mobile number with +91 prefix",
          "OTP auto-verifies on 6th digit entry",
          "30-second countdown before resend option appears",
          "Guest/Google login available for quick access",
        ],
      },
      {
        heading: "Super Admin Login",
        body: "The Super Admin role is hidden from the regular login screen for security. Admin credentials are managed securely on the server side. Contact your system administrator for access.",
        tips: [
          "Role is auto-detected, no manual selection needed",
          "Team members (Franchise, Marketing, Delivery) are also auto-detected by their registered phone numbers",
        ],
      },
      {
        heading: "Team Member Auto-Detection",
        body: "When a registered team member enters their phone number, the system automatically detects their role from the team database. This applies to Franchise owners, Marketing executives, and Delivery partners created by the admin or franchise manager.",
      },
    ],
  },
  {
    key: "customer",
    title: "Customer Features",
    icon: "bag-handle",
    color: "#FF6B00",
    content: [
      {
        heading: "Home Page (Flipkart-Style)",
        body: "The customer home page features a banner carousel (with sponsored ads), service pills for quick category access, AI-powered search bar, trending products grid, quick service cards, customer stories section, sponsored banners, and top stores listing with infinite scroll.",
      },
      {
        heading: "Shopping Flow",
        body: "Category \u2192 Sub-Category \u2192 Vendor Store \u2192 Product Detail \u2192 Add to Cart \u2192 Checkout \u2192 Payment \u2192 Order Tracking. Customers can browse by category or search using AI-powered natural language queries.",
        tips: [
          "AI search understands queries like 'something for headache' or 'best spicy food'",
          "Products show price, original price, discount percentage, vendor info",
          "Cart shows itemized total with delivery charges",
          "Multiple delivery speeds: Express, Standard, Scheduled",
        ],
      },
      {
        heading: "Profile Features",
        body: "The customer profile includes Wallet (add money, view transactions), Saved Addresses (add/remove/set default), Coupons (copy to clipboard), Wishlist, Order History, Reviews, Help & Support, Language Settings, and more.",
      },
      {
        heading: "AI Search",
        body: "The search bar uses OpenAI gpt-5-nano to understand natural language queries. It returns product keywords, store keywords, category suggestions, and related searches. Shows 'AI is thinking...' indicator while processing.",
      },
    ],
  },
  {
    key: "vendor",
    title: "Vendor Features",
    icon: "storefront",
    color: "#3B82F6",
    content: [
      {
        heading: "Vendor Dashboard",
        body: "Shows today's revenue, total orders, active products count, and rating. Quick action buttons for Add Product, View Orders, Upload Reel, and Book Ad. Lists recent orders with status indicators.",
      },
      {
        heading: "Product Management",
        body: "Vendors can add, edit, and delete products. Each product has name, price, original price, image URL, description, and category. Products are grouped by category in the store page visible to customers.",
        tips: [
          "Product images use URL links (photo upload available via image picker)",
          "Pricing shows both sale price and original price for discount display",
          "Products appear in both category browsing and search results",
        ],
      },
      {
        heading: "Reels (Social Commerce)",
        body: "Vendors can upload short-form video reels with captions and tag products for direct selling. Customer sees reels in a vertical scrolling feed. Tagged products show a purchase button overlay.",
      },
      {
        heading: "Ad Booking",
        body: "Vendors can book ad slots (Banner, Featured, Spotlight) with different durations (7/14/30 days). Ads go through a multi-level approval: Vendor submits \u2192 Franchise reviews \u2192 Admin approves \u2192 Admin makes Live.",
      },
      {
        heading: "Earnings & Payouts",
        body: "Vendors view their earnings breakdown, pending settlements, and bank details on the Vendor Payouts screen. Commission rates apply to each transaction.",
      },
    ],
  },
  {
    key: "delivery",
    title: "Delivery Partner Features",
    icon: "bicycle",
    color: "#10B981",
    content: [
      {
        heading: "Delivery Dashboard",
        body: "Shows online/offline toggle, today's earnings, total deliveries, and average rating. Lists available and accepted orders with status tracking.",
      },
      {
        heading: "Order Flow",
        body: "Delivery partner accepts order \u2192 Picks up from vendor \u2192 Uses Drive Mode for navigation \u2192 Delivers to customer \u2192 Marks as delivered. Each step updates the order status in real-time.",
        tips: [
          "Drive Mode uses GPS tracking with 5m distance interval",
          "Tilted map camera view (pitch 50) for better navigation feel",
          "Earnings tracked per delivery with incentive bonuses",
        ],
      },
      {
        heading: "Earnings & Withdrawals",
        body: "Delivery partners can view daily/weekly/monthly earnings, delivery incentives (peak hour bonus, distance bonus), and withdraw to their bank account.",
      },
    ],
  },
  {
    key: "franchise",
    title: "Franchise Owner Features",
    icon: "business",
    color: "#8B5CF6",
    content: [
      {
        heading: "Territory Management",
        body: "Franchise owners manage a specific city territory. They have tabs for Overview, Team, Applications, Sub-Categories, and Ads. The overview shows territory stats, revenue, and vendor count.",
      },
      {
        heading: "Vendor Application Review",
        body: "When Marketing executives submit vendor applications, they first come to the Franchise owner for review. Franchise can Approve or Reject (with reason). Approved applications then go to Admin for final approval.",
        tips: [
          "Application flow: Marketing submits \u2192 Franchise reviews \u2192 Admin approves \u2192 'Make Live' to activate vendor",
          "Rejection requires a reason that is shown to the applicant",
          "Franchise can only review applications in their territory",
        ],
      },
      {
        heading: "Team Management",
        body: "Franchise owners can create Marketing Executives and Delivery Partners for their territory. Team members get auto-detected login via their registered phone number.",
      },
      {
        heading: "Custom Sub-Categories",
        body: "Franchise owners can create custom sub-categories specific to their territory. These merge with the default sub-categories across all category and store pages. Includes an icon picker for visual customization.",
      },
      {
        heading: "Ad Review",
        body: "Vendor ad requests first come to Franchise for initial review. Franchise can approve or reject. Approved ads then move to Admin for final approval before going live.",
      },
    ],
  },
  {
    key: "marketing",
    title: "Marketing Executive Features",
    icon: "megaphone",
    color: "#EC4899",
    content: [
      {
        heading: "Lead Pipeline",
        body: "Marketing executives manage a lead pipeline with stages: NEW \u2192 CONTACTED \u2192 NEGOTIATION \u2192 CONVERTED \u2192 LOST. They can add new leads and move them through stages.",
      },
      {
        heading: "Vendor Application Submission",
        body: "Marketing executives submit vendor onboarding applications with full business details: business name, owner name, phone, email, category, address, GST number, PAN number, bank account, IFSC code, and commission rate.",
        tips: [
          "Form validation checks: 10-digit phone, valid email, required fields",
          "Applications are tagged with the Marketing executive's name",
          "After submission, Franchise owner reviews first",
        ],
      },
      {
        heading: "Incentives & Commissions",
        body: "Marketing executives earn tiered commissions based on the number of vendors they bring. Higher tiers unlock better commission rates. The incentives screen shows tier progress and total earnings.",
      },
    ],
  },
  {
    key: "admin",
    title: "Super Admin Dashboard",
    icon: "shield-checkmark",
    color: "#EF4444",
    content: [
      {
        heading: "Dashboard Overview",
        body: "The admin dashboard shows 4 KPI cards (Revenue, Commission, Orders, Users), a management grid with 11 sections, quick stats, platform health monitoring, city-wise performance, and recent activity feed.",
      },
      {
        heading: "Management Sections",
        body: "11 management areas accessible from the dashboard grid:",
        tips: [
          "Vendors - View/manage all vendors, approve applications, make vendors live",
          "Orders - All orders across the platform with status management",
          "Users - User management with ban/unban capability",
          "Products - All products across all vendors",
          "Reels - Manage social commerce reels",
          "Coupons - Create/manage platform-wide discount coupons",
          "Payments - Settlement management, refunds, gateway health",
          "Franchises - Create franchise owners, assign territories by city",
          "Ads - Final approval of ad requests, make ads live",
          "Admins - Create other admin users with access levels",
          "App Manual - This guide you're reading right now!",
        ],
      },
      {
        heading: "Vendor Lifecycle",
        body: "Marketing submits application \u2192 Franchise reviews (Approve/Reject) \u2192 Admin approves \u2192 Admin clicks 'Make Live' \u2192 Vendor appears in app. Each step has its own status tracking.",
      },
      {
        heading: "Advertisement Lifecycle",
        body: "Vendor books ad slot & pays \u2192 Status: PENDING_FRANCHISE \u2192 Franchise approves \u2192 Status: PENDING_ADMIN \u2192 Admin approves \u2192 Status: APPROVED \u2192 Admin clicks 'Make Live' \u2192 Status: LIVE \u2192 Ad appears on customer home page.",
        tips: [
          "BANNER ads appear in the home carousel with 'Sponsored' label",
          "FEATURED/SPOTLIGHT ads appear in the sponsored section",
          "Ad pricing: Banner \u20B9999-\u20B92999, Featured \u20B91499-\u20B94999, Spotlight \u20B9799-\u20B92499",
          "Ads auto-expire after their duration ends",
        ],
      },
    ],
  },
  {
    key: "payments",
    title: "Payment System",
    icon: "wallet",
    color: "#0EA5E9",
    content: [
      {
        heading: "Customer Payments",
        body: "Customers can pay using: UPI (Google Pay, PhonePe, Paytm, BHIM), Credit/Debit Cards, Net Banking (8 major banks), Wallet balance, or Cash on Delivery (COD).",
        tips: [
          "Payment success shows animation with haptic feedback",
          "After payment, user is redirected to order tracking",
          "Wallet can be topped up from Profile \u2192 Wallet",
        ],
      },
      {
        heading: "Vendor Payouts",
        body: "Vendors receive payouts after commission deduction. Settlement cycles, bank details management, and earnings breakdown available on the Vendor Payouts screen.",
      },
      {
        heading: "Role-Specific Earnings",
        body: "Each earning role has a dedicated screen: Vendor Payouts (app/vendor-payouts.tsx), Delivery Earnings (app/delivery-earnings.tsx), Franchise Revenue (app/franchise-revenue.tsx), Marketing Incentives (app/marketing-incentives.tsx).",
      },
      {
        heading: "Admin Payment Dashboard",
        body: "Admin can view all settlements, process refunds, monitor gateway health, and view overall payment analytics from the Payments management screen.",
      },
    ],
  },
  {
    key: "ads",
    title: "Advertisement System",
    icon: "megaphone",
    color: "#F97316",
    content: [
      {
        heading: "Ad Slot Types",
        body: "Three types of ad slots available for vendors:",
        tips: [
          "BANNER - Appears in the home page carousel (most visible). Pricing: \u20B9999/7 days, \u20B91499/14 days, \u20B92999/30 days",
          "FEATURED - Appears in the sponsored section. Pricing: \u20B91499/7 days, \u20B92499/14 days, \u20B94999/30 days",
          "SPOTLIGHT - Category page placement. Pricing: \u20B9799/7 days, \u20B91299/14 days, \u20B92499/30 days",
        ],
      },
      {
        heading: "Approval Workflow",
        body: "PENDING_FRANCHISE \u2192 Franchise approves \u2192 PENDING_ADMIN \u2192 Admin approves \u2192 APPROVED \u2192 Admin makes LIVE. At any step, the reviewer can reject with a reason.",
      },
      {
        heading: "Where Ads Appear",
        body: "Live BANNER ads merge into the customer home page carousel with a 'Sponsored' label. FEATURED and SPOTLIGHT ads appear in the dedicated sponsored section between the quick services and top stores sections.",
      },
    ],
  },
  {
    key: "reels",
    title: "Reels & Social Commerce",
    icon: "videocam",
    color: "#F59E0B",
    content: [
      {
        heading: "How Reels Work",
        body: "Instagram-style vertical scrolling reels feed available to both customers and vendors. Vendors can tag products in reels for direct selling (social commerce). Customers can browse, like, and purchase tagged products directly.",
      },
      {
        heading: "Uploading Reels",
        body: "Vendors upload reels from their Reels tab or the 'Upload Reel' quick action. They can add a caption, select a thumbnail image, and tag products from their catalog. Reels appear in both the customer feed and vendor's reel grid.",
      },
      {
        heading: "Reel Stats",
        body: "Each reel tracks likes, comments, and shares. Vendors can see their reel performance in the vendor Reels tab with a grid view showing thumbnails and engagement stats.",
      },
    ],
  },
  {
    key: "stories",
    title: "Customer Stories",
    icon: "chatbubble-ellipses",
    color: "#0D9488",
    content: [
      {
        heading: "What Are Customer Stories?",
        body: "Customer Stories is a testimonials section on the home page where users share their shopping experiences with photos. Stories include star ratings, vendor tags, and like functionality. They help build trust and showcase vendor quality.",
      },
      {
        heading: "Submitting a Story",
        body: "Customers tap 'Share Yours' on the home page to open the Submit Story screen. They can write a title, their experience, rate with stars (1-5), upload up to 4 photos, select a vendor, and optionally name a product. Stories appear on the home page after submission.",
      },
    ],
  },
  {
    key: "languages",
    title: "Multi-Language Support",
    icon: "language",
    color: "#6366F1",
    content: [
      {
        heading: "Supported Languages",
        body: "The app supports 8 Indian languages: English, Hindi, Marathi, Tamil, Telugu, Bengali, Gujarati, and Kannada. Over 100 UI strings are translated.",
      },
      {
        heading: "Auto-Detection",
        body: "When enabled, changing the delivery location automatically sets the language based on the city. For example: Mumbai/Pune \u2192 Marathi, Chennai \u2192 Tamil, Kolkata \u2192 Bengali, Ahmedabad \u2192 Gujarati.",
      },
      {
        heading: "Manual Selection",
        body: "Users can manually change language from Profile \u2192 Language Settings. The auto-detect toggle can be turned off for manual control. Language preference is persisted across sessions.",
      },
    ],
  },
  {
    key: "teams",
    title: "Team Management",
    icon: "people",
    color: "#8B5CF6",
    content: [
      {
        heading: "How Team Management Works",
        body: "The platform has a hierarchical team structure. Super Admin creates Franchise owners (organized by city). Franchise owners create Marketing Executives and Delivery Partners for their territory.",
      },
      {
        heading: "Creating Team Members",
        body: "From the Franchise dashboard's Team tab or Admin's Franchise management, add team members with: name, phone, email, role, city, and territory. Each member gets a unique phone number that acts as their login credential.",
        tips: [
          "Team members log in using their registered phone number",
          "Role is auto-detected \u2014 no manual selection needed",
          "Members can be activated/deactivated by toggling status",
          "Remove members if they leave the organization",
        ],
      },
      {
        heading: "City-Based Organization",
        body: "In the Admin panel, Franchise owners are organized by city. This helps manage territories efficiently. Each franchise owner has an assigned territory name within their city.",
      },
    ],
  },
  {
    key: "onboarding",
    title: "Vendor Onboarding",
    icon: "add-circle",
    color: "#059669",
    content: [
      {
        heading: "Step-by-Step Process",
        body: "The complete vendor onboarding process from discovery to going live:",
        tips: [
          "Step 1: Marketing Executive meets potential vendor and captures business details",
          "Step 2: Marketing Executive submits application through the app with full details (business name, owner, phone, email, category, address, GST, PAN, bank account, IFSC, commission rate)",
          "Step 3: Application appears in Franchise owner's 'Applications' tab with status PENDING",
          "Step 4: Franchise owner reviews and either Approves or Rejects (with reason)",
          "Step 5: If approved, application moves to Admin with status APPROVED",
          "Step 6: Admin reviews and clicks 'Make Live' to activate the vendor",
          "Step 7: Vendor account is created and appears in the app for customers to browse",
        ],
      },
      {
        heading: "Application Statuses",
        body: "PENDING \u2192 Waiting for Franchise review. APPROVED \u2192 Franchise approved, waiting for Admin. REJECTED \u2192 Franchise or Admin rejected (reason provided). LIVE \u2192 Vendor is active and visible to customers.",
      },
    ],
  },
];

export default function AdminManualScreen() {
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;
  const [expandedSection, setExpandedSection] = useState<SectionKey | null>("overview");
  const { user } = useApp();

  if (user?.role !== "SUPER_ADMIN") {
    return (
      <View style={[styles.container, { justifyContent: "center", alignItems: "center", paddingTop: topInset }]}>
        <Ionicons name="lock-closed" size={48} color={Colors.textLight} />
        <Text style={{ fontFamily: "Poppins_600SemiBold", fontSize: 18, color: Colors.text, marginTop: 16 }}>Access Restricted</Text>
        <Text style={{ fontFamily: "Poppins_400Regular", fontSize: 14, color: Colors.textLight, marginTop: 8, textAlign: "center", paddingHorizontal: 40 }}>This manual is only available to Super Admin users.</Text>
        <Pressable onPress={() => router.back()} style={{ marginTop: 24, paddingHorizontal: 24, paddingVertical: 12, backgroundColor: Colors.primary, borderRadius: 8 }}>
          <Text style={{ fontFamily: "Poppins_600SemiBold", fontSize: 14, color: "#FFF" }}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  const toggleSection = (key: SectionKey) => {
    try { Haptics.selectionAsync(); } catch {}
    setExpandedSection(expandedSection === key ? null : key);
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={["#0B1E3D", "#142F5E"]} style={[styles.header, { paddingTop: topInset + 12 }]}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color="#FFF" />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Go Bharat Admin Manual</Text>
            <Text style={styles.headerSub}>Complete app guide for administrators</Text>
          </View>
          <Ionicons name="book" size={28} color="rgba(255,255,255,0.3)" />
        </View>

        <View style={styles.versionBadge}>
          <Ionicons name="information-circle" size={14} color="#FFF" />
          <Text style={styles.versionText}>Version 2.0 | Last updated: Feb 2026</Text>
        </View>
      </LinearGradient>

      <ScrollView
        contentContainerStyle={{ paddingBottom: bottomInset + 30 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.tocCard}>
          <Text style={styles.tocTitle}>Table of Contents</Text>
          <Text style={styles.tocSub}>Tap any section below to expand and read the guide</Text>
          <View style={styles.tocStats}>
            <View style={styles.tocStat}>
              <Ionicons name="documents" size={16} color={Colors.primary} />
              <Text style={styles.tocStatText}>{MANUAL_SECTIONS.length} Sections</Text>
            </View>
            <View style={styles.tocStat}>
              <Ionicons name="people" size={16} color="#8B5CF6" />
              <Text style={styles.tocStatText}>6 Roles Covered</Text>
            </View>
            <View style={styles.tocStat}>
              <Ionicons name="checkmark-circle" size={16} color="#10B981" />
              <Text style={styles.tocStatText}>All Features</Text>
            </View>
          </View>
        </View>

        {MANUAL_SECTIONS.map((section) => (
          <View key={section.key} style={styles.sectionContainer}>
            <Pressable
              style={[styles.sectionHeader, expandedSection === section.key && styles.sectionHeaderActive]}
              onPress={() => toggleSection(section.key)}
            >
              <View style={[styles.sectionIcon, { backgroundColor: section.color + "15" }]}>
                <Ionicons name={section.icon as any} size={22} color={section.color} />
              </View>
              <Text style={[styles.sectionTitle, expandedSection === section.key && { color: section.color }]}>
                {section.title}
              </Text>
              <Ionicons
                name={expandedSection === section.key ? "chevron-up" : "chevron-down"}
                size={20}
                color={expandedSection === section.key ? section.color : Colors.textLight}
              />
            </Pressable>

            {expandedSection === section.key && (
              <View style={styles.sectionContent}>
                {section.content.map((item, idx) => (
                  <View key={idx} style={styles.contentBlock}>
                    <View style={styles.contentHeadingRow}>
                      <View style={[styles.contentDot, { backgroundColor: section.color }]} />
                      <Text style={styles.contentHeading}>{item.heading}</Text>
                    </View>
                    <Text style={styles.contentBody}>{item.body}</Text>
                    {item.tips && item.tips.length > 0 && (
                      <View style={styles.tipsList}>
                        {item.tips.map((tip, ti) => (
                          <View key={ti} style={styles.tipRow}>
                            <View style={[styles.tipBullet, { backgroundColor: section.color + "30" }]}>
                              <Text style={[styles.tipBulletText, { color: section.color }]}>{ti + 1}</Text>
                            </View>
                            <Text style={styles.tipText}>{tip}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                ))}
              </View>
            )}
          </View>
        ))}

        <View style={styles.footerCard}>
          <Ionicons name="help-circle" size={24} color={Colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.footerTitle}>Need More Help?</Text>
            <Text style={styles.footerSub}>Contact the development team at gobharatservice@gmail.com or call 8177977700 for technical queries or feature requests.</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F1F3F6" },
  header: { paddingHorizontal: 16, paddingBottom: 16 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
  headerTitle: { fontFamily: "Poppins_700Bold", fontSize: 20, color: "#FFF" },
  headerSub: { fontFamily: "Poppins_400Regular", fontSize: 12, color: "rgba(255,255,255,0.7)" },
  versionBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignSelf: "flex-start",
    marginTop: 12,
  },
  versionText: { fontFamily: "Poppins_500Medium", fontSize: 11, color: "rgba(255,255,255,0.8)" },

  tocCard: {
    backgroundColor: "#FFF",
    margin: 16,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: "#F0F0F0",
  },
  tocTitle: { fontFamily: "Poppins_700Bold", fontSize: 18, color: Colors.text, marginBottom: 4 },
  tocSub: { fontFamily: "Poppins_400Regular", fontSize: 13, color: Colors.textSecondary, marginBottom: 14 },
  tocStats: { flexDirection: "row", gap: 14 },
  tocStat: { flexDirection: "row", alignItems: "center", gap: 4 },
  tocStatText: { fontFamily: "Poppins_500Medium", fontSize: 12, color: Colors.textSecondary },

  sectionContainer: { marginHorizontal: 16, marginBottom: 6 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#FFF",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#F0F0F0",
  },
  sectionHeaderActive: {
    borderColor: "#E0E0E0",
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderBottomWidth: 0,
  },
  sectionIcon: { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  sectionTitle: { flex: 1, fontFamily: "Poppins_600SemiBold", fontSize: 15, color: Colors.text },
  sectionContent: {
    backgroundColor: "#FFF",
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
    padding: 16,
    paddingTop: 8,
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: "#E0E0E0",
    gap: 16,
  },
  contentBlock: { gap: 6 },
  contentHeadingRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  contentDot: { width: 8, height: 8, borderRadius: 4 },
  contentHeading: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: Colors.text },
  contentBody: { fontFamily: "Poppins_400Regular", fontSize: 13, color: Colors.textSecondary, lineHeight: 20, paddingLeft: 16 },
  tipsList: { paddingLeft: 16, gap: 6, marginTop: 4 },
  tipRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  tipBullet: { width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center", marginTop: 1 },
  tipBulletText: { fontFamily: "Poppins_700Bold", fontSize: 10 },
  tipText: { flex: 1, fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.text, lineHeight: 18 },

  footerCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: Colors.primary + "0A",
    margin: 16,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.primary + "20",
  },
  footerTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: Colors.text },
  footerSub: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
});

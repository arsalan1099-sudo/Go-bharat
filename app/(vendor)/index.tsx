import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Platform, Alert, Modal, TextInput, Switch } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Colors from "@/constants/colors";
import { useApp } from "@/lib/store";
import { t } from "@/lib/i18n";
import { products } from "@/lib/data";
import { Product } from "@/lib/types";
import { getApiUrl } from "@/lib/query-client";

const CATEGORY_PANELS: Record<string, { label: string; icon: string; color: string; route: string; desc: string }> = {
  "5": { label: "Travel Panel", icon: "bus", color: "#E11D48", route: "/vendor-travel", desc: "Manage routes, seats & bookings" },
  "4": { label: "Manpower Panel", icon: "people", color: "#10B981", route: "/vendor-manpower", desc: "Workers, jobs & attendance" },
  "1": { label: "B2B Wholesale", icon: "briefcase", color: "#3B82F6", route: "/vendor-b2b", desc: "Bulk orders, pricing & invoices" },
};

export default function VendorDashboard() {
  const insets = useSafeAreaInsets();
  const { user, orders, language, notifications, markAllNotificationsRead, vendorApplications, reviews, replyToReview, liveVendors, toggleVendorOpen } = useApp();
  const router = useRouter();
  const topInset = Platform.OS === "web" ? 67 : insets.top;

  const [replyModalVisible, setReplyModalVisible] = useState(false);
  const [replyReviewId, setReplyReviewId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");

  const vendorApp = vendorApplications.find(a => a.phone.replace(/\D/g, "").slice(-10) === user?.phone?.replace(/\D/g, "").slice(-10) && (a.status === "APPROVED" || a.status === "LIVE"));
  const vendorId = vendorApp?.id || user?.id || "v2";

  const vendorCategoryId = user?.vendorCategoryId || vendorApp?.categoryId;
  const categoryPanel = vendorCategoryId ? CATEGORY_PANELS[vendorCategoryId] : null;

  const myOrders = orders.filter((o) => o.vendorId === vendorId);
  const todayOrders = myOrders.length;
  const totalSales = myOrders.reduce((s, o) => s + o.totalAmount, 0);
  const pendingOrders = myOrders.filter((o) => o.status === "PENDING").length;

  const [vendorProducts, setVendorProducts] = useState<Product[]>([]);

  useEffect(() => {
    let cancelled = false;
    const hardcoded = products.filter((p) => p.vendorId === vendorId);
    const hardcodedIds = new Set(hardcoded.map((p) => p.id));
    setVendorProducts(hardcoded);
    const baseUrl = getApiUrl();
    const cacheKey = `gobharat_vendor_products_${vendorId}`;

    AsyncStorage.getItem(cacheKey).then((data) => {
      if (cancelled || !data) return;
      try {
        const saved: Product[] = JSON.parse(data);
        const custom = saved.filter((p) => !hardcodedIds.has(p.id));
        if (custom.length > 0) setVendorProducts([...hardcoded, ...custom]);
      } catch {}
    });

    AsyncStorage.getItem("gobharat_auth_token").then((token) => {
      if (cancelled) return undefined;
      return fetch(new URL("/api/vendor/my-products", baseUrl).toString(), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
    }).then((r) => (r && r.ok ? r.json() : null))
      .then((data: { products: Product[] } | null) => {
        if (cancelled || !data) return;
        const serverProducts: Product[] = data.products || [];
        const dbProducts = serverProducts.filter((p) => !hardcodedIds.has(p.id));
        setVendorProducts([...hardcoded, ...dbProducts]);
        if (dbProducts.length > 0) {
          AsyncStorage.setItem(cacheKey, JSON.stringify(dbProducts)).catch(() => {});
        } else {
          AsyncStorage.removeItem(cacheKey).catch(() => {});
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [user?.phone, vendorId]);

  const outOfStockCount = vendorProducts.filter((p) => p.isAvailable === false).length;

  const handleAddProduct = () => {
    try { Haptics.selectionAsync(); } catch {}
    router.push("/(vendor)/products" as any);
  };

  const handleReports = () => {
    try { Haptics.selectionAsync(); } catch {}
    Alert.alert("Reports", "Reports are being generated. Check back soon.");
  };

  const handleEarnings = () => {
    try { Haptics.selectionAsync(); } catch {}
    Alert.alert("Earnings Summary", `Total Earnings: ₹${totalSales.toLocaleString()}`);
  };

  const handleSettings = () => {
    try { Haptics.selectionAsync(); } catch {}
    router.push("/(vendor)/vendorProfile" as any);
  };

  const vendorNotifs = notifications.filter((n) => n.targetRole === "VENDOR" || n.targetRole === "ALL");
  const unreadCount = vendorNotifs.filter((n) => !n.read).length;

  const handleNotifications = () => {
    try { Haptics.selectionAsync(); } catch {}
    markAllNotificationsRead("VENDOR");
    router.push("/notifications" as any);
  };

  const handleOrderPress = (orderId: string) => {
    try { Haptics.selectionAsync(); } catch {}
    router.push(`/order/${orderId}` as any);
  };

  const vendorReviews = reviews.filter((r) => r.vendorId === vendorId);

  const timeAgo = (date: string) => {
    const diff = Date.now() - new Date(date).getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days === 0) return "Today";
    if (days === 1) return "Yesterday";
    if (days < 30) return `${days}d ago`;
    return `${Math.floor(days / 30)}mo ago`;
  };

  const handleOpenReplyModal = (reviewId: string) => {
    setReplyReviewId(reviewId);
    setReplyText("");
    setReplyModalVisible(true);
  };

  const handleSubmitReply = () => {
    if (!replyReviewId || !replyText.trim()) {
      Alert.alert("Error", "Please enter a reply.");
      return;
    }
    replyToReview(replyReviewId, replyText.trim());
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
    setReplyModalVisible(false);
    setReplyReviewId(null);
    setReplyText("");
  };

  const liveVendorRecord = liveVendors.find((v) => v.id === vendorId);
  const vendorIsOpen = liveVendorRecord?.isOpen ?? true;

  const isManpower = vendorCategoryId === "4";
  const isService = vendorCategoryId === "3";

  const stats = isService ? [
    { label: "Today's Bookings", value: todayOrders.toString(), icon: "calendar", color: Colors.info },
    { label: "Monthly Revenue", value: `\u20B9${totalSales.toLocaleString()}`, icon: "trending-up", color: Colors.success },
    { label: "Pending", value: pendingOrders.toString(), icon: "time", color: Colors.warning },
    { label: "Completion", value: `${todayOrders > 0 ? Math.min(Math.round(((todayOrders - pendingOrders) / todayOrders) * 100), 100) : 0}%`, icon: "checkmark-done", color: "#EC4899" },
  ] : [
    { label: t("todaysOrders", language), value: todayOrders.toString(), icon: "receipt", color: Colors.info },
    { label: t("monthlySales", language), value: `\u20B9${totalSales.toLocaleString()}`, icon: "trending-up", color: Colors.success },
    { label: t("newOrders", language), value: pendingOrders.toString(), icon: "notifications", color: Colors.warning },
    { label: t("outOfStock", language), value: outOfStockCount.toString(), icon: "alert-circle", color: Colors.error },
  ];

  return (
    <>
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
      <LinearGradient colors={["#0B1E3D", "#142F5E"]} style={[styles.header, { paddingTop: topInset + 12 }]}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.greeting}>{t("welcomeBack", language)}</Text>
            <Text style={styles.userName}>{user?.name || "Vendor"}</Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Pressable style={styles.notifBtn} onPress={() => { try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {} router.push("/(customer)" as any); }}>
              <Ionicons name="bag-handle-outline" size={20} color="#FFF" />
            </Pressable>
            <Pressable style={styles.notifBtn} onPress={handleNotifications}>
              <Ionicons name="notifications-outline" size={22} color="#FFF" />
              {unreadCount > 0 && (
                <View style={{ position: "absolute", top: -4, right: -4, backgroundColor: "#EF4444", borderRadius: 10, minWidth: 18, height: 18, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 }}>
                  <Text style={{ fontFamily: "Poppins_700Bold", fontSize: 10, color: "#FFF" }}>{unreadCount > 99 ? "99+" : unreadCount}</Text>
                </View>
              )}
            </Pressable>
          </View>
        </View>
        <View style={styles.onlineToggleRow}>
          <View style={[styles.onlineDotIndicator, { backgroundColor: vendorIsOpen ? "#10B981" : "#6B7280" }]} />
          <Text style={styles.onlineToggleLabel}>{vendorIsOpen ? "Shop is Open" : "Shop is Closed"}</Text>
          <Switch
            value={vendorIsOpen}
            onValueChange={(val) => {
              try { Haptics.selectionAsync(); } catch {}
              toggleVendorOpen(vendorId, val);
            }}
            trackColor={{ false: "#374151", true: "#10B98160" }}
            thumbColor={vendorIsOpen ? "#10B981" : "#9CA3AF"}
            style={{ transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }] }}
          />
        </View>
      </LinearGradient>

      {categoryPanel && (
        <Pressable
          style={styles.categoryPanelBanner}
          onPress={() => { try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {} router.push(categoryPanel.route as any); }}
        >
          <LinearGradient colors={[categoryPanel.color, categoryPanel.color + "CC"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.categoryPanelGradient}>
            <View style={styles.categoryPanelIcon}>
              <Ionicons name={categoryPanel.icon as any} size={28} color="#FFF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.categoryPanelTitle}>{categoryPanel.label}</Text>
              <Text style={styles.categoryPanelDesc}>{categoryPanel.desc}</Text>
            </View>
            <Ionicons name="arrow-forward-circle" size={28} color="rgba(255,255,255,0.8)" />
          </LinearGradient>
        </Pressable>
      )}

      <View style={styles.statsGrid}>
        {stats.map((stat) => (
          <View key={stat.label} style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: stat.color + "18" }]}>
              <Ionicons name={stat.icon as any} size={22} color={stat.color} />
            </View>
            <Text style={styles.statValue}>{stat.value}</Text>
            <Text style={styles.statLabel}>{stat.label}</Text>
          </View>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t("quickActions", language)}</Text>
        <View style={styles.actionsRow}>
          {(isManpower ? [
            { icon: "person-add", label: "Add Worker", color: Colors.primary, onPress: () => router.push("/vendor-manpower" as any) },
            { icon: "briefcase", label: "Post Job", color: Colors.info, onPress: () => router.push("/vendor-manpower" as any) },
            { icon: "clipboard", label: "Attendance", color: Colors.success, onPress: () => router.push("/vendor-manpower" as any) },
            { icon: "cash", label: "Payments", color: "#F97316", onPress: () => router.push("/vendor-manpower" as any) },
            { icon: "settings", label: t("settings", language), color: Colors.textSecondary, onPress: handleSettings },
          ] : isService ? [
            { icon: "add-circle", label: "Add Service", color: Colors.primary, onPress: handleAddProduct },
            { icon: "calendar", label: "Schedule", color: Colors.info, onPress: () => Alert.alert("Schedule", "Service scheduling coming soon") },
            { icon: "cash", label: t("earnings", language), color: Colors.success, onPress: handleEarnings },
            { icon: "star", label: "Reviews", color: "#F59E0B", onPress: () => Alert.alert("Reviews", `You have ${vendorReviews.length} reviews`) },
            { icon: "megaphone", label: "Book Ad", color: "#F97316", onPress: () => router.push("/vendor-ads" as any) },
            { icon: "radio", label: "Go Live", color: "#EF4444", onPress: () => router.push("/vendor-live" as any) },
            { icon: "settings", label: t("settings", language), color: Colors.textSecondary, onPress: handleSettings },
          ] : [
            { icon: "add-circle", label: t("addProduct", language), color: Colors.primary, onPress: handleAddProduct },
            { icon: "analytics", label: t("reports", language), color: Colors.info, onPress: handleReports },
            { icon: "cash", label: t("earnings", language), color: Colors.success, onPress: handleEarnings },
            { icon: "flash", label: "Deals", color: "#EF4444", onPress: () => router.push("/(vendor)/deals" as any) },
            { icon: "megaphone", label: "Book Ad", color: "#F97316", onPress: () => router.push("/vendor-ads" as any) },
            { icon: "radio", label: "Go Live", color: "#EF4444", onPress: () => router.push("/vendor-live" as any) },
            { icon: "settings", label: t("settings", language), color: Colors.textSecondary, onPress: handleSettings },
          ]).map((action) => (
            <Pressable key={action.label} style={styles.actionItem} onPress={action.onPress}>
              <View style={[styles.actionIcon, { backgroundColor: action.color + "15" }]}>
                <Ionicons name={action.icon as any} size={24} color={action.color} />
              </View>
              <Text style={styles.actionLabel}>{action.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{isManpower ? "Recent Job Postings" : isService ? "Recent Service Requests" : t("recentOrders", language)}</Text>
        {isManpower ? (
          <>
            {[
              { id: "j1", title: "Need 5 Painters for 3 days", client: "Sunrise Builders", status: "Open", rate: 650 },
              { id: "j2", title: "Electrician for factory wiring", client: "Tata Industries", status: "In Progress", rate: 850 },
              { id: "j3", title: "Security Guards for event", client: "Grand Hyatt", status: "Filled", rate: 550 },
            ].map((job) => (
              <Pressable key={job.id} style={styles.orderCard} onPress={() => router.push("/vendor-manpower" as any)}>
                <View style={styles.orderTop}>
                  <Text style={styles.orderId}>{job.title}</Text>
                  <View style={[styles.statusBadge, {
                    backgroundColor: job.status === "Open" ? Colors.info + "18" :
                      job.status === "In Progress" ? "#8B5CF6" + "18" : Colors.success + "18"
                  }]}>
                    <Text style={[styles.statusText, {
                      color: job.status === "Open" ? Colors.info :
                        job.status === "In Progress" ? "#8B5CF6" : Colors.success
                    }]}>{job.status}</Text>
                  </View>
                </View>
                <Text style={styles.orderItems}>{job.client}</Text>
                <Text style={styles.orderAmount}>{"\u20B9"}{job.rate}/day</Text>
              </Pressable>
            ))}
          </>
        ) : myOrders.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="receipt-outline" size={40} color={Colors.textLight} />
            <Text style={styles.emptyText}>{t("noOrders", language)}</Text>
          </View>
        ) : (
          myOrders.slice(0, 3).map((order) => (
            <Pressable key={order.id} style={styles.orderCard} onPress={() => handleOrderPress(order.id)}>
              <View style={styles.orderTop}>
                <Text style={styles.orderId}>#{order.id}</Text>
                <View style={[styles.statusBadge, {
                  backgroundColor: order.status === "PENDING" ? Colors.warning + "18" :
                    order.status === "DELIVERED" ? Colors.success + "18" : Colors.info + "18"
                }]}>
                  <Text style={[styles.statusText, {
                    color: order.status === "PENDING" ? Colors.warning :
                      order.status === "DELIVERED" ? Colors.success : Colors.info
                  }]}>{order.status}</Text>
                </View>
              </View>
              <Text style={styles.orderItems}>{order.items.length} {t("items", language)}</Text>
              <Text style={styles.orderAmount}>{"\u20B9"}{order.totalAmount}</Text>
            </Pressable>
          ))
        )}
      </View>

      <View style={styles.section}>
        <View style={styles.reviewsSectionHeader}>
          <Text style={styles.sectionTitle}>Customer Reviews</Text>
          {vendorReviews.length > 0 && (
            <View style={styles.reviewCountBadge}>
              <Text style={styles.reviewCountBadgeText}>{vendorReviews.length}</Text>
            </View>
          )}
        </View>
        {vendorReviews.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="chatbubble-outline" size={40} color={Colors.textLight} />
            <Text style={styles.emptyText}>No reviews yet</Text>
          </View>
        ) : (
          vendorReviews.slice(0, 5).map((review) => {
            const reviewProduct = review.productId ? products.find((p) => p.id === review.productId) : null;
            const ratingColor = review.rating >= 4 ? Colors.success : review.rating >= 3 ? Colors.warning : Colors.error;
            return (
              <View key={review.id} style={styles.reviewCard}>
                <View style={styles.reviewCardTop}>
                  <View style={styles.reviewAvatar}>
                    <Text style={styles.reviewAvatarText}>{review.userName.charAt(0)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.reviewUserName}>{review.userName}</Text>
                    <Text style={styles.reviewTime}>{timeAgo(review.createdAt)}</Text>
                  </View>
                  <View style={[styles.reviewRatingBadge, { backgroundColor: ratingColor }]}>
                    <Ionicons name="star" size={11} color="#FFF" />
                    <Text style={styles.reviewRatingText}>{review.rating}</Text>
                  </View>
                </View>
                {reviewProduct && (
                  <View style={styles.reviewProductTag}>
                    <Ionicons name="pricetag" size={12} color={Colors.textSecondary} />
                    <Text style={styles.reviewProductName} numberOfLines={1}>{reviewProduct.name}</Text>
                  </View>
                )}
                <Text style={styles.reviewComment} numberOfLines={3}>{review.comment}</Text>
                {review.vendorReply ? (
                  <View style={styles.vendorReplyBox}>
                    <View style={styles.vendorReplyHeader}>
                      <Ionicons name="checkmark-circle" size={13} color={Colors.success} />
                      <Text style={styles.vendorReplyLabel}>Your reply</Text>
                    </View>
                    <Text style={styles.vendorReplyText} numberOfLines={2}>{review.vendorReply}</Text>
                  </View>
                ) : (
                  <Pressable
                    style={styles.replyBtn}
                    onPress={() => handleOpenReplyModal(review.id)}
                  >
                    <Ionicons name="chatbubble-outline" size={14} color={Colors.primary} />
                    <Text style={styles.replyBtnText}>Reply</Text>
                  </Pressable>
                )}
              </View>
            );
          })
        )}
        {vendorReviews.length > 5 && (
          <Pressable
            style={styles.seeAllReviewsBtn}
            onPress={() => router.push(`/all-reviews?vendorId=${vendorId}` as any)}
          >
            <Text style={styles.seeAllReviewsText}>See All {vendorReviews.length} Reviews</Text>
            <Ionicons name="arrow-forward" size={16} color={Colors.primary} />
          </Pressable>
        )}
      </View>
    </ScrollView>

    <Modal visible={replyModalVisible} transparent animationType="fade">
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Reply to Review</Text>
            <Pressable onPress={() => setReplyModalVisible(false)}>
              <Ionicons name="close" size={24} color={Colors.text} />
            </Pressable>
          </View>
          <TextInput
            style={styles.replyInput}
            placeholder="Write your reply to the customer..."
            placeholderTextColor={Colors.textLight}
            multiline
            numberOfLines={4}
            maxLength={300}
            value={replyText}
            onChangeText={setReplyText}
            textAlignVertical="top"
          />
          <Text style={styles.replyCharCount}>{replyText.length}/300</Text>
          <Pressable
            style={[styles.submitReplyBtn, !replyText.trim() && styles.submitReplyBtnDisabled]}
            onPress={handleSubmitReply}
            disabled={!replyText.trim()}
          >
            <Ionicons name="send" size={16} color="#FFF" />
            <Text style={styles.submitReplyBtnText}>Send Reply</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { paddingHorizontal: 24, paddingBottom: 24 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  greeting: { fontFamily: "Poppins_400Regular", fontSize: 14, color: "rgba(255,255,255,0.7)" },
  userName: { fontFamily: "Poppins_700Bold", fontSize: 22, color: "#FFF" },
  notifBtn: { position: "relative", width: 44, height: 44, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center" },
  onlineToggleRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 14, backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8 },
  onlineDotIndicator: { width: 9, height: 9, borderRadius: 5 },
  onlineToggleLabel: { flex: 1, fontFamily: "Poppins_600SemiBold", fontSize: 13, color: "#FFF" },
  notifDot: { position: "absolute", top: 10, right: 10, width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.error },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 16, marginTop: -16, gap: 10 },
  statCard: {
    width: "47%",
    backgroundColor: "#FFF",
    borderRadius: 16,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  statIcon: { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  statValue: { fontFamily: "Poppins_700Bold", fontSize: 20, color: Colors.secondary },
  statLabel: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  section: { marginTop: 24, paddingHorizontal: 20 },
  sectionTitle: { fontFamily: "Poppins_700Bold", fontSize: 18, color: Colors.secondary, marginBottom: 14 },
  actionsRow: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  actionItem: { alignItems: "center", width: 70 },
  actionIcon: { width: 52, height: 52, borderRadius: 16, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  actionLabel: { fontFamily: "Poppins_500Medium", fontSize: 11, color: Colors.text, textAlign: "center" },
  emptyCard: { backgroundColor: "#FFF", borderRadius: 16, padding: 40, alignItems: "center" },
  emptyText: { fontFamily: "Poppins_500Medium", fontSize: 14, color: Colors.textSecondary, marginTop: 12 },
  orderCard: { backgroundColor: "#FFF", borderRadius: 14, padding: 14, marginBottom: 10 },
  orderTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  orderId: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: Colors.secondary },
  statusBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 3 },
  statusText: { fontFamily: "Poppins_600SemiBold", fontSize: 11 },
  orderItems: { fontFamily: "Poppins_400Regular", fontSize: 13, color: Colors.textSecondary, marginTop: 4 },
  orderAmount: { fontFamily: "Poppins_700Bold", fontSize: 16, color: Colors.primary, marginTop: 4 },
  categoryPanelBanner: { marginHorizontal: 16, marginTop: -8, marginBottom: 8, borderRadius: 16, overflow: "hidden", shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 4 },
  categoryPanelGradient: { flexDirection: "row", alignItems: "center", padding: 18, gap: 14 },
  categoryPanelIcon: { width: 52, height: 52, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  categoryPanelTitle: { fontFamily: "Poppins_700Bold", fontSize: 17, color: "#FFF" },
  categoryPanelDesc: { fontFamily: "Poppins_400Regular", fontSize: 12, color: "rgba(255,255,255,0.85)", marginTop: 2 },
  reviewsSectionHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 },
  reviewCountBadge: { backgroundColor: Colors.primary, borderRadius: 12, minWidth: 24, height: 24, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
  reviewCountBadgeText: { fontFamily: "Poppins_700Bold", fontSize: 11, color: "#FFF" },
  reviewCard: { backgroundColor: "#FFF", borderRadius: 14, padding: 14, marginBottom: 10 },
  reviewCardTop: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
  reviewAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.primary + "18", alignItems: "center", justifyContent: "center" },
  reviewAvatarText: { fontFamily: "Poppins_700Bold", fontSize: 15, color: Colors.primary },
  reviewUserName: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: Colors.text },
  reviewTime: { fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textSecondary },
  reviewRatingBadge: { flexDirection: "row", alignItems: "center", gap: 3, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3 },
  reviewRatingText: { fontFamily: "Poppins_700Bold", fontSize: 11, color: "#FFF" },
  reviewProductTag: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: Colors.background, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, marginBottom: 8, alignSelf: "flex-start" as const },
  reviewProductName: { fontFamily: "Poppins_500Medium", fontSize: 11, color: Colors.textSecondary },
  reviewComment: { fontFamily: "Poppins_400Regular", fontSize: 13, color: Colors.text, lineHeight: 20 },
  vendorReplyBox: { backgroundColor: Colors.success + "08", borderLeftWidth: 3, borderLeftColor: Colors.success, borderRadius: 8, padding: 10, marginTop: 10 },
  vendorReplyHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 },
  vendorReplyLabel: { fontFamily: "Poppins_600SemiBold", fontSize: 11, color: Colors.success },
  vendorReplyText: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.text, lineHeight: 18 },
  replyBtn: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.borderLight, alignSelf: "flex-start" as const },
  replyBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: Colors.primary },
  seeAllReviewsBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 14, backgroundColor: Colors.primary + "08", borderRadius: 12, marginTop: 4 },
  seeAllReviewsText: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: Colors.primary },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: 20 },
  modalContent: { backgroundColor: "#FFF", borderRadius: 20, padding: 20, width: "100%", maxWidth: 400 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  modalTitle: { fontFamily: "Poppins_700Bold", fontSize: 18, color: Colors.secondary },
  replyInput: { backgroundColor: Colors.background, borderRadius: 14, padding: 14, fontFamily: "Poppins_400Regular", fontSize: 14, color: Colors.text, minHeight: 100, borderWidth: 1.5, borderColor: Colors.border, textAlignVertical: "top" as const },
  replyCharCount: { fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textLight, textAlign: "right" as const, marginTop: 6 },
  submitReplyBtn: { backgroundColor: Colors.primary, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 14, paddingVertical: 14, marginTop: 12 },
  submitReplyBtnDisabled: { backgroundColor: Colors.textLight },
  submitReplyBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 15, color: "#FFF" },
});

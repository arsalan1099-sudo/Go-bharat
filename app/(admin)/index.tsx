import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  RefreshControl,
  Modal,
  TextInput,
  Alert,
} from "react-native";
import { router } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useApp } from "@/lib/store";
import { products, categories } from "@/lib/data";
import { sendBroadcastNotification } from "@/lib/notifications";

export default function SuperAdminDashboard() {
  const insets = useSafeAreaInsets();
  const { user, orders, leads, vendorApplications, liveVendors, reels, adminCoupons, bannedUsers, notifications, teamMembers, adRequests, communityPosts, reviews, customerStories, dealBookings, sendNotification, logout, adminPhone, setAdminPhone } = useApp();
  const [refreshing, setRefreshing] = useState(false);
  const [showNotifModal, setShowNotifModal] = useState(false);
  const [notifTitle, setNotifTitle] = useState("");
  const [notifMessage, setNotifMessage] = useState("");
  const [notifTarget, setNotifTarget] = useState<"ALL" | "VENDOR" | "CUSTOMER" | "DELIVERY" | "FRANCHISE" | "MARKETING">("ALL");
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const [phoneStep, setPhoneStep] = useState<"input" | "otp" | "success">("input");
  const [newPhone, setNewPhone] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [otpTimer, setOtpTimer] = useState(30);
  const [canResend, setCanResend] = useState(false);
  const otpRefs = useRef<(TextInput | null)[]>([]);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (phoneStep === "otp" && otpTimer > 0) {
      interval = setInterval(() => {
        setOtpTimer((prev) => {
          if (prev <= 1) { setCanResend(true); return 0; }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [phoneStep, otpTimer]);

  const handlePhoneSubmit = () => {
    const clean = newPhone.replace(/\D/g, "");
    if (clean.length !== 10) {
      Alert.alert("Invalid Number", "Please enter a valid 10-digit phone number");
      return;
    }
    if (clean === adminPhone) {
      Alert.alert("Same Number", "This is already your current phone number");
      return;
    }
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
    setPhoneStep("otp");
    setOtpTimer(30);
    setCanResend(false);
    setOtp(["", "", "", "", "", ""]);
    setTimeout(() => otpRefs.current[0]?.focus(), 300);
  };

  const handleOtpChange = (value: string, index: number) => {
    if (!/^\d*$/.test(value)) return;
    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);
    if (value && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }
    if (newOtp.every((d) => d !== "") && newOtp.join("").length === 6) {
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
      const clean = newPhone.replace(/\D/g, "");
      setAdminPhone(clean);
      setPhoneStep("success");
    }
  };

  const handleOtpBackspace = (index: number) => {
    if (otp[index] === "" && index > 0) {
      otpRefs.current[index - 1]?.focus();
      const newOtp = [...otp];
      newOtp[index - 1] = "";
      setOtp(newOtp);
    }
  };

  const handleResendOtp = () => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
    setOtpTimer(30);
    setCanResend(false);
    setOtp(["", "", "", "", "", ""]);
    otpRefs.current[0]?.focus();
  };

  const resetPhoneModal = () => {
    setShowPhoneModal(false);
    setPhoneStep("input");
    setNewPhone("");
    setOtp(["", "", "", "", "", ""]);
    setOtpTimer(30);
    setCanResend(false);
  };

  const totalRevenue = orders.reduce((s, o) => s + (Number(o.totalAmount) || 0), 0);
  const totalCommission = Math.round(totalRevenue * 0.12);
  const totalOrders = orders.length;
  const pendingApprovals = vendorApplications.filter((a) => a.status === "PENDING").length;
  const deliveredOrders = orders.filter((o) => o.status === "DELIVERED").length;
  const cancelledOrders = orders.filter((o) => o.status === "CANCELLED").length;
  const activeReels = reels.length;
  const activeCoupons = adminCoupons.filter((c) => c.isActive).length;

  const kpiCards = [
    { label: "Revenue", value: totalRevenue > 0 ? `\u20B9${totalRevenue.toLocaleString("en-IN")}` : "\u20B90", icon: "cash" as const, color: Colors.success, trend: "" },
    { label: "Commission", value: totalCommission > 0 ? `\u20B9${totalCommission.toLocaleString("en-IN")}` : "\u20B90", icon: "wallet" as const, color: Colors.primary, trend: "" },
    { label: "Orders", value: totalOrders.toLocaleString(), icon: "receipt" as const, color: Colors.info, trend: "" },
    { label: "Team", value: teamMembers.length.toLocaleString(), icon: "people" as const, color: "#8B5CF6", trend: "" },
  ];

  const managementItems = [
    { label: "Vendors", icon: "storefront" as const, color: Colors.primary, route: "/(admin)/vendors", count: liveVendors.length, badge: pendingApprovals > 0 ? `${pendingApprovals} pending` : "" },
    { label: "Orders", icon: "receipt" as const, color: Colors.info, route: "/(admin)/orders", count: totalOrders, badge: "" },
    { label: "Team", icon: "people" as const, color: "#8B5CF6", route: "/(admin)/users", count: teamMembers.length, badge: bannedUsers.length > 0 ? `${bannedUsers.length} banned` : "" },
    { label: "Products", icon: "cube" as const, color: "#EC4899", route: "/(admin)/products", count: products.length, badge: "" },
    { label: "Reels", icon: "videocam" as const, color: "#F59E0B", route: "/(admin)/reels", count: activeReels, badge: "" },
    { label: "Coupons", icon: "pricetag" as const, color: "#14B8A6", route: "/(admin)/coupons", count: adminCoupons.length, badge: `${activeCoupons} active` },
    { label: "Payments", icon: "wallet" as const, color: "#0EA5E9", route: "/(admin)/payments", count: totalOrders, badge: "" },
    { label: "Withdrawals", icon: "arrow-undo" as const, color: "#E11D48", route: "/(admin)/withdrawals", count: "", badge: "New" },
    { label: "Franchises", icon: "business" as const, color: "#6366F1", route: "/(admin)/franchises", count: teamMembers.filter(m => m.role === "FRANCHISE").length, badge: "" },
    { label: "Reviews", icon: "star" as const, color: "#FBBF24", route: "/(admin)/reviews", count: reviews.length, badge: "" },
    { label: "Stories", icon: "heart" as const, color: "#F43F5E", route: "/(admin)/stories", count: customerStories.length, badge: customerStories.filter(s => s.isFeatured).length > 0 ? `${customerStories.filter(s => s.isFeatured).length} featured` : "" },
    { label: "Community", icon: "people-circle" as const, color: "#06B6D4", route: "/(admin)/community", count: communityPosts.length, badge: communityPosts.filter(p => p.isHidden).length > 0 ? `${communityPosts.filter(p => p.isHidden).length} hidden` : "" },
    { label: "Ads", icon: "megaphone" as const, color: "#F97316", route: "/(admin)/ads", count: adRequests.length, badge: adRequests.filter(a => a.status === "PENDING_ADMIN").length > 0 ? `${adRequests.filter(a => a.status === "PENDING_ADMIN").length} pending` : "" },
    { label: "Admins", icon: "shield-checkmark" as const, color: "#EF4444", route: "/(admin)/admins", count: teamMembers.filter(m => m.role === "SUPER_ADMIN").length + 1, badge: "" },
    { label: "Deals", icon: "flash" as const, color: "#EF4444", route: "/(admin)/deals", count: dealBookings.length, badge: dealBookings.filter(b => b.status === "PENDING").length > 0 ? `${dealBookings.filter(b => b.status === "PENDING").length} pending` : "" },
    { label: "Home Content", icon: "home" as const, color: "#F59E0B", route: "/(admin)/home-content", count: "", badge: "Banners & Deals" },
    { label: "App Manual", icon: "book" as const, color: "#0D9488", route: "/admin-manual", count: "", badge: "Guide" },
    { label: "AI Agent", icon: "hardware-chip" as const, color: "#7C3AED", route: "/(admin)/ai-agent", count: "", badge: "Agent" },
    { label: "AI Strategy", icon: "sparkles" as const, color: "#4338CA", route: "/(admin)/strategy-ai", count: "₹40T", badge: "AI" },
    { label: "Features", icon: "toggle" as const, color: "#059669", route: "/(admin)/feature-flags", count: "18", badge: "Control" },
    { label: "Page Builder", icon: "construct" as const, color: "#2563EB", route: "/(admin)/content-builder", count: "", badge: "Design" },
    { label: "App Updates", icon: "rocket" as const, color: "#D946EF", route: "/(admin)/app-updates", count: "", badge: "Live" },
  ];

  const quickStats = [
    { label: "Delivered", value: deliveredOrders, icon: "checkmark-circle" as const, color: Colors.success },
    { label: "Cancelled", value: cancelledOrders, icon: "close-circle" as const, color: Colors.error },
    { label: "Reels", value: activeReels, icon: "play-circle" as const, color: Colors.warning },
    { label: "Leads", value: leads.length, icon: "trending-up" as const, color: Colors.info },
  ];

  const formatTimeAgo = (dateStr: string) => {
    const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
    if (seconds < 60) return "just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hr ago`;
    return `${Math.floor(hours / 24)} day${Math.floor(hours / 24) > 1 ? "s" : ""} ago`;
  };

  const recentActivity = [
    ...orders.slice(0, 5).map((o) => ({
      id: `order_${o.id}`,
      action: o.status === "DELIVERED" ? "Order delivered" : o.status === "CANCELLED" ? "Order cancelled" : "New order placed",
      detail: `#${o.id} - ${o.vendorName}`,
      time: formatTimeAgo(o.createdAt),
      icon: "receipt" as const,
      color: o.status === "DELIVERED" ? Colors.success : o.status === "CANCELLED" ? Colors.error : Colors.primary,
      ts: new Date(o.createdAt).getTime(),
    })),
    ...vendorApplications.slice(0, 5).map((va) => ({
      id: `va_${va.id}`,
      action: va.status === "APPROVED" || va.status === "LIVE" ? "Vendor approved" : va.status === "REJECTED" ? "Vendor rejected" : "Vendor application submitted",
      detail: `${va.businessName} - ${va.city}`,
      time: formatTimeAgo(va.submittedAt),
      icon: "storefront" as const,
      color: va.status === "APPROVED" || va.status === "LIVE" ? Colors.success : va.status === "REJECTED" ? Colors.error : Colors.primary,
      ts: new Date(va.submittedAt).getTime(),
    })),
  ]
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 6);

  const handleSendNotification = () => {
    if (!notifTitle.trim() || !notifMessage.trim()) {
      Alert.alert("Required", "Please enter both title and message");
      return;
    }
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
    sendNotification({ title: notifTitle.trim(), message: notifMessage.trim(), targetRole: notifTarget });
    const segment = notifTarget === "ALL" ? "all" : notifTarget === "CUSTOMER" ? "customers" : notifTarget === "VENDOR" ? "vendors" : notifTarget.toLowerCase() + "s";
    sendBroadcastNotification(notifTitle.trim(), notifMessage.trim(), segment).catch(() => {});
    setShowNotifModal(false);
    setNotifTitle("");
    setNotifMessage("");
    setNotifTarget("ALL");
    Alert.alert("Sent!", `Notification sent to ${notifTarget === "ALL" ? "all users" : notifTarget.toLowerCase() + "s"}`);
  };

  const handleLogout = () => {
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); } catch {}
    setShowLogoutModal(true);
  };

  const navigateTo = (route: string) => {
    try { Haptics.selectionAsync(); } catch {}
    router.push(route as any);
  };

  const onRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1000);
  };

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: bottomInset + 20 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      >
        <LinearGradient colors={["#0B1E3D", "#142F5E", "#1A3A6B"]} style={[styles.header, { paddingTop: topInset + 12 }]}>
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.greeting}>Super Admin</Text>
              <Text style={styles.name}>{user?.name || "Admin"}</Text>
            </View>
            <View style={styles.headerActions}>
              <Pressable style={styles.headerIcon} onPress={() => { try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {} setShowPhoneModal(true); }}>
                <Ionicons name="settings-outline" size={20} color="#FFF" />
              </Pressable>
              <Pressable style={styles.headerIcon} onPress={() => { try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {} router.push("/(customer)" as any); }}>
                <Ionicons name="bag-handle-outline" size={20} color="#FFF" />
              </Pressable>
              <Pressable style={styles.headerIcon} onPress={() => router.push("/notifications" as any)}>
                <Ionicons name="notifications-outline" size={22} color="#FFF" />
                {notifications.filter(n => !n.read).length > 0 && (
                  <View style={{ position: "absolute", top: -4, right: -4, backgroundColor: "#EF4444", borderRadius: 10, minWidth: 18, height: 18, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 }}>
                    <Text style={{ fontFamily: "Poppins_700Bold", fontSize: 10, color: "#FFF" }}>{notifications.filter(n => !n.read).length > 99 ? "99+" : notifications.filter(n => !n.read).length}</Text>
                  </View>
                )}
              </Pressable>
              <Pressable style={styles.headerIcon} onPress={handleLogout}>
                <Ionicons name="log-out-outline" size={22} color="#FFF" />
              </Pressable>
            </View>
          </View>

          {pendingApprovals > 0 && (
            <Pressable style={styles.alertBanner} onPress={() => navigateTo("/(admin)/vendors")}>
              <Ionicons name="warning" size={16} color={Colors.warning} />
              <Text style={styles.alertText}>{pendingApprovals} vendor approvals pending</Text>
              <Ionicons name="chevron-forward" size={16} color={Colors.warning} />
            </Pressable>
          )}
        </LinearGradient>

        <View style={styles.kpiSection}>
          {kpiCards.map((kpi) => (
            <View key={kpi.label} style={styles.kpiCard}>
              <View style={styles.kpiHeader}>
                <View style={[styles.kpiIcon, { backgroundColor: kpi.color + "18" }]}>
                  <Ionicons name={kpi.icon} size={18} color={kpi.color} />
                </View>
                {kpi.trend ? (
                  <View style={[styles.trendBadge, { backgroundColor: Colors.success + "18" }]}>
                    <Ionicons name="trending-up" size={10} color={Colors.success} />
                    <Text style={styles.trendText}>{kpi.trend}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.kpiValue}>{kpi.value}</Text>
              <Text style={styles.kpiLabel}>{kpi.label}</Text>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Pressable
            style={({ pressed }) => [styles.agentCard, pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] }]}
            onPress={() => navigateTo("/(admin)/ai-agent")}
          >
            <LinearGradient colors={["#7C3AED", "#4338CA"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.agentGradient}>
              <View style={styles.agentLeft}>
                <View style={styles.agentIconWrap}>
                  <Ionicons name="hardware-chip" size={24} color="#FFF" />
                </View>
                <View>
                  <Text style={styles.agentTitle}>AI Agent</Text>
                  <Text style={styles.agentDesc}>Ask anything, execute actions, generate reports</Text>
                </View>
              </View>
              <View style={styles.agentBtnWrap}>
                <Ionicons name="chatbubble-ellipses" size={16} color="#7C3AED" />
                <Text style={styles.agentBtnText}>Chat</Text>
              </View>
            </LinearGradient>
          </Pressable>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Management</Text>
          <View style={styles.mgmtGrid}>
            {managementItems.map((item) => (
              <Pressable
                key={item.label}
                style={({ pressed }) => [styles.mgmtCard, pressed && styles.mgmtCardPressed]}
                onPress={() => navigateTo(item.route)}
              >
                <View style={[styles.mgmtIcon, { backgroundColor: item.color + "15" }]}>
                  <Ionicons name={item.icon} size={24} color={item.color} />
                </View>
                <Text style={styles.mgmtLabel}>{item.label}</Text>
                <Text style={styles.mgmtCount}>{item.count}</Text>
                {item.badge ? (
                  <View style={[styles.mgmtBadge, { backgroundColor: item.color + "18" }]}>
                    <Text style={[styles.mgmtBadgeText, { color: item.color }]}>{item.badge}</Text>
                  </View>
                ) : null}
                <View style={styles.mgmtArrow}>
                  <Ionicons name="chevron-forward" size={14} color={Colors.textLight} />
                </View>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Pressable
            style={({ pressed }) => [styles.sendNotifBtn, pressed && { opacity: 0.8, transform: [{ scale: 0.98 }] }]}
            onPress={() => setShowNotifModal(true)}
          >
            <LinearGradient colors={["#8B5CF6", "#6366F1"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.sendNotifGradient}>
              <Ionicons name="notifications" size={20} color="#FFF" />
              <View style={{ flex: 1 }}>
                <Text style={styles.sendNotifTitle}>Send Push Notification</Text>
                <Text style={styles.sendNotifSub}>Send alerts to vendors, customers, or all users</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.6)" />
            </LinearGradient>
          </Pressable>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Stats</Text>
          <View style={styles.quickStatsRow}>
            {quickStats.map((stat) => (
              <View key={stat.label} style={styles.quickStatCard}>
                <Ionicons name={stat.icon} size={20} color={stat.color} />
                <Text style={styles.quickStatValue}>{stat.value.toLocaleString()}</Text>
                <Text style={styles.quickStatLabel}>{stat.label}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Platform Health</Text>
          <View style={styles.healthCard}>
            {[
              { label: "API Server", status: "Online", ok: true },
              { label: "Payment Gateway", status: "Online", ok: true },
              { label: "SMS Service", status: "Online", ok: true },
              { label: "Push Notifications", status: "Degraded", ok: false },
              { label: "Database", status: "Online", ok: true },
              { label: "CDN", status: "Online", ok: true },
            ].map((service) => (
              <View key={service.label} style={styles.healthRow}>
                <View style={[styles.healthDot, { backgroundColor: service.ok ? Colors.success : Colors.warning }]} />
                <Text style={styles.healthLabel}>{service.label}</Text>
                <Text style={[styles.healthStatus, { color: service.ok ? Colors.success : Colors.warning }]}>{service.status}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Activity</Text>
          {recentActivity.length === 0 ? (
            <Text style={{ fontFamily: "Poppins_400Regular", fontSize: 14, color: Colors.textSecondary, textAlign: "center", paddingVertical: 20 }}>
              No activity yet
            </Text>
          ) : recentActivity.map((activity) => (
            <View key={activity.id} style={styles.activityRow}>
              <View style={[styles.activityIcon, { backgroundColor: activity.color + "15" }]}>
                <Ionicons name={activity.icon} size={16} color={activity.color} />
              </View>
              <View style={styles.activityInfo}>
                <Text style={styles.activityAction}>{activity.action}</Text>
                <Text style={styles.activityDetail}>{activity.detail}</Text>
              </View>
              <Text style={styles.activityTime}>{activity.time}</Text>
            </View>
          ))}
        </View>

        <View style={{ backgroundColor: "#FFF", borderRadius: 16, marginHorizontal: 20, marginTop: 20, overflow: "hidden" }}>
          <Pressable style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, borderBottomWidth: 1, borderBottomColor: Colors.borderLight }} onPress={() => router.push("/terms" as any)}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: Colors.primary + "12", alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="document-text" size={20} color={Colors.primary} />
              </View>
              <Text style={{ fontFamily: "Poppins_500Medium", fontSize: 14, color: Colors.text }}>Terms & Conditions</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.textLight} />
          </Pressable>
          <Pressable style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, borderBottomWidth: 1, borderBottomColor: Colors.borderLight }} onPress={() => router.push("/privacy" as any)}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: Colors.primary + "12", alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="shield-checkmark" size={20} color={Colors.primary} />
              </View>
              <Text style={{ fontFamily: "Poppins_500Medium", fontSize: 14, color: Colors.text }}>Privacy Policy</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.textLight} />
          </Pressable>
          <Pressable style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16 }} onPress={() => router.push("/about" as any)}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: Colors.primary + "12", alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="information-circle" size={20} color={Colors.primary} />
              </View>
              <Text style={{ fontFamily: "Poppins_500Medium", fontSize: 14, color: Colors.text }}>About Go Bharat</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.textLight} />
          </Pressable>
        </View>
      </ScrollView>

      <Modal visible={showLogoutModal} transparent animationType="fade" onRequestClose={() => setShowLogoutModal(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: 24 }}>
          <View style={{ backgroundColor: "#FFF", borderRadius: 20, padding: 28, alignItems: "center", width: "100%", maxWidth: 340 }}>
            <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.error + "15", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
              <Ionicons name="log-out-outline" size={28} color={Colors.error} />
            </View>
            <Text style={{ fontFamily: "Poppins_600SemiBold", fontSize: 18, color: Colors.text, marginBottom: 6 }}>Log Out</Text>
            <Text style={{ fontFamily: "Poppins_400Regular", fontSize: 14, color: Colors.textLight, textAlign: "center", marginBottom: 20 }}>Are you sure you want to log out of your account?</Text>
            <View style={{ flexDirection: "row", gap: 12, width: "100%" }}>
              <Pressable style={{ flex: 1, paddingVertical: 13, borderRadius: 12, backgroundColor: Colors.backgroundLight, alignItems: "center" }} onPress={() => setShowLogoutModal(false)}>
                <Text style={{ fontFamily: "Poppins_600SemiBold", fontSize: 15, color: Colors.text }}>Cancel</Text>
              </Pressable>
              <Pressable style={{ flex: 1, paddingVertical: 13, borderRadius: 12, backgroundColor: Colors.error, alignItems: "center" }} onPress={() => { logout(); setShowLogoutModal(false); setTimeout(() => { router.replace("/auth" as any); }, 300); }}>
                <Text style={{ fontFamily: "Poppins_600SemiBold", fontSize: 15, color: "#FFF" }}>Log Out</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showNotifModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Send Notification</Text>
              <Pressable onPress={() => setShowNotifModal(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </Pressable>
            </View>

            <Text style={styles.modalLabel}>Target Audience</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.targetRow}>
              {(["ALL", "VENDOR", "CUSTOMER", "DELIVERY", "FRANCHISE", "MARKETING"] as const).map((role) => (
                <Pressable
                  key={role}
                  style={[styles.targetChip, notifTarget === role && styles.targetChipActive]}
                  onPress={() => setNotifTarget(role)}
                >
                  <Ionicons
                    name={role === "ALL" ? "people" : role === "VENDOR" ? "storefront" : role === "CUSTOMER" ? "bag-handle" : role === "DELIVERY" ? "bicycle" : role === "FRANCHISE" ? "business" : "megaphone"}
                    size={14}
                    color={notifTarget === role ? "#FFF" : Colors.textSecondary}
                  />
                  <Text style={[styles.targetText, notifTarget === role && styles.targetTextActive]}>
                    {role === "ALL" ? "All Users" : role.charAt(0) + role.slice(1).toLowerCase() + "s"}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            <Text style={styles.modalLabel}>Quick Templates</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.targetRow}>
              {[
                { label: "Flash Sale", title: "Flash Sale Live!", msg: "Up to 60% off on all products! Limited time offer. Shop now!", target: "CUSTOMER" as const },
                { label: "Free Delivery", title: "Free Delivery Today!", msg: "Enjoy FREE delivery on all orders. No minimum order value!", target: "CUSTOMER" as const },
                { label: "New Feature", title: "New Feature Update", msg: "We've added exciting new features to improve your experience. Update now!", target: "ALL" as const },
                { label: "Vendor Alert", title: "Important: Vendor Update", msg: "New policies and features are available for your store. Check your dashboard!", target: "VENDOR" as const },
                { label: "Delivery Bonus", title: "Bonus Earnings!", msg: "Complete 10 deliveries today and earn 2x commission! Don't miss out!", target: "DELIVERY" as const },
              ].map((tmpl) => (
                <Pressable
                  key={tmpl.label}
                  style={[styles.targetChip, { borderColor: "#8B5CF6", borderWidth: 1, backgroundColor: "#F5F3FF" }]}
                  onPress={() => { setNotifTitle(tmpl.title); setNotifMessage(tmpl.msg); setNotifTarget(tmpl.target); }}
                >
                  <Ionicons name="flash" size={12} color="#8B5CF6" />
                  <Text style={[styles.targetText, { color: "#8B5CF6" }]}>{tmpl.label}</Text>
                </Pressable>
              ))}
            </ScrollView>

            <Text style={styles.modalLabel}>Title *</Text>
            <TextInput
              style={styles.modalInput}
              value={notifTitle}
              onChangeText={setNotifTitle}
              placeholder="e.g. Important Update"
              placeholderTextColor={Colors.textLight}
              maxLength={60}
            />

            <Text style={styles.modalLabel}>Message *</Text>
            <TextInput
              style={[styles.modalInput, { height: 90, textAlignVertical: "top" }]}
              value={notifMessage}
              onChangeText={setNotifMessage}
              placeholder="Write your notification message..."
              placeholderTextColor={Colors.textLight}
              multiline
              maxLength={250}
            />

            <View style={styles.notifPreview}>
              <View style={styles.notifPreviewHeader}>
                <Ionicons name="notifications" size={16} color="#8B5CF6" />
                <Text style={styles.notifPreviewLabel}>Preview</Text>
              </View>
              <View style={styles.notifPreviewCard}>
                <Text style={styles.notifPreviewTitle}>{notifTitle || "Notification Title"}</Text>
                <Text style={styles.notifPreviewMsg}>{notifMessage || "Your message will appear here..."}</Text>
                <Text style={styles.notifPreviewTarget}>
                  To: {notifTarget === "ALL" ? "All Users" : notifTarget.charAt(0) + notifTarget.slice(1).toLowerCase() + "s"}
                </Text>
              </View>
            </View>

            <Pressable style={styles.sendBtn} onPress={handleSendNotification}>
              <LinearGradient colors={["#8B5CF6", "#6366F1"]} style={styles.sendBtnGradient}>
                <Ionicons name="send" size={18} color="#FFF" />
                <Text style={styles.sendBtnText}>Send Notification</Text>
              </LinearGradient>
            </Pressable>

            {notifications.length > 0 && (
              <View style={{ marginTop: 16 }}>
                <Text style={styles.modalLabel}>Recently Sent ({notifications.length})</Text>
                {notifications.slice(0, 5).map((n) => (
                  <View key={n.id} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#F0F1F5", gap: 10 }}>
                    <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: "#F3F4F6", alignItems: "center", justifyContent: "center" }}>
                      <Ionicons name="notifications" size={14} color={Colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: "Poppins_500Medium", fontSize: 12, color: Colors.text }} numberOfLines={1}>{n.title}</Text>
                      <Text style={{ fontFamily: "Poppins_400Regular", fontSize: 10, color: Colors.textSecondary }} numberOfLines={1}>{n.message}</Text>
                    </View>
                    <Text style={{ fontFamily: "Poppins_400Regular", fontSize: 10, color: Colors.textLight }}>{new Date(n.sentAt).toLocaleDateString()}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        </View>
      </Modal>

      <Modal visible={showPhoneModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {phoneStep === "input" ? "Change Phone Number" : phoneStep === "otp" ? "Verify OTP" : "Success!"}
              </Text>
              <Pressable onPress={resetPhoneModal}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </Pressable>
            </View>

            {phoneStep === "input" && (
              <View>
                <View style={phoneStyles.currentPhoneRow}>
                  <View style={phoneStyles.currentPhoneIcon}>
                    <Ionicons name="call" size={20} color={Colors.primary} />
                  </View>
                  <View>
                    <Text style={phoneStyles.currentPhoneLabel}>Current Number</Text>
                    <Text style={phoneStyles.currentPhoneValue}>+91 {adminPhone.replace(/(\d{5})(\d{5})/, "$1 $2")}</Text>
                  </View>
                </View>

                <Text style={styles.modalLabel}>New Phone Number</Text>
                <View style={phoneStyles.phoneInputRow}>
                  <View style={phoneStyles.countryCode}>
                    <Text style={phoneStyles.countryCodeText}>+91</Text>
                  </View>
                  <TextInput
                    style={phoneStyles.phoneInput}
                    value={newPhone}
                    onChangeText={(t) => setNewPhone(t.replace(/\D/g, "").slice(0, 10))}
                    placeholder="Enter 10-digit number"
                    placeholderTextColor={Colors.textLight}
                    keyboardType="number-pad"
                    maxLength={10}
                  />
                </View>

                <Text style={phoneStyles.disclaimer}>
                  A 6-digit OTP will be sent to this number for verification
                </Text>

                <Pressable
                  style={[phoneStyles.submitBtn, newPhone.replace(/\D/g, "").length !== 10 && { opacity: 0.5 }]}
                  onPress={handlePhoneSubmit}
                  disabled={newPhone.replace(/\D/g, "").length !== 10}
                >
                  <LinearGradient colors={[Colors.primary, "#FF8A33"]} style={phoneStyles.submitBtnGradient}>
                    <Ionicons name="paper-plane" size={18} color="#FFF" />
                    <Text style={phoneStyles.submitBtnText}>Send OTP</Text>
                  </LinearGradient>
                </Pressable>
              </View>
            )}

            {phoneStep === "otp" && (
              <View>
                <View style={phoneStyles.otpInfoRow}>
                  <Ionicons name="chatbubble-ellipses" size={20} color={Colors.info} />
                  <Text style={phoneStyles.otpInfoText}>
                    OTP sent to +91 {newPhone.replace(/(\d{5})(\d{5})/, "$1 $2")}
                  </Text>
                </View>

                <View style={phoneStyles.otpRow}>
                  {otp.map((digit, i) => (
                    <TextInput
                      key={i}
                      ref={(ref) => { otpRefs.current[i] = ref; }}
                      style={[phoneStyles.otpBox, digit ? phoneStyles.otpBoxFilled : null]}
                      value={digit}
                      onChangeText={(val) => handleOtpChange(val.slice(-1), i)}
                      onKeyPress={({ nativeEvent }) => {
                        if (nativeEvent.key === "Backspace") handleOtpBackspace(i);
                      }}
                      keyboardType="number-pad"
                      maxLength={1}
                      selectTextOnFocus
                    />
                  ))}
                </View>

                <View style={phoneStyles.timerRow}>
                  {canResend ? (
                    <Pressable onPress={handleResendOtp}>
                      <Text style={phoneStyles.resendText}>Resend OTP</Text>
                    </Pressable>
                  ) : (
                    <Text style={phoneStyles.timerText}>
                      Resend in {otpTimer}s
                    </Text>
                  )}
                </View>

                <Pressable style={phoneStyles.backLink} onPress={() => setPhoneStep("input")}>
                  <Ionicons name="arrow-back" size={16} color={Colors.textSecondary} />
                  <Text style={phoneStyles.backLinkText}>Change number</Text>
                </Pressable>
              </View>
            )}

            {phoneStep === "success" && (
              <View style={phoneStyles.successContainer}>
                <View style={phoneStyles.successIcon}>
                  <Ionicons name="checkmark-circle" size={64} color={Colors.success} />
                </View>
                <Text style={phoneStyles.successTitle}>Phone Number Updated!</Text>
                <Text style={phoneStyles.successMessage}>
                  Your admin phone number has been changed to
                </Text>
                <Text style={phoneStyles.successPhone}>+91 {adminPhone.replace(/(\d{5})(\d{5})/, "$1 $2")}</Text>

                <Pressable style={phoneStyles.doneBtn} onPress={resetPhoneModal}>
                  <LinearGradient colors={[Colors.success, "#059669"]} style={phoneStyles.submitBtnGradient}>
                    <Ionicons name="checkmark" size={20} color="#FFF" />
                    <Text style={phoneStyles.submitBtnText}>Done</Text>
                  </LinearGradient>
                </Pressable>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const phoneStyles = StyleSheet.create({
  currentPhoneRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.primary + "10",
    borderRadius: 14,
    padding: 14,
    gap: 12,
    marginBottom: 6,
  },
  currentPhoneIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: Colors.primary + "18",
    alignItems: "center",
    justifyContent: "center",
  },
  currentPhoneLabel: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
  },
  currentPhoneValue: {
    fontFamily: "Poppins_700Bold",
    fontSize: 16,
    color: Colors.secondary,
  },
  phoneInputRow: {
    flexDirection: "row",
    gap: 8,
  },
  countryCode: {
    backgroundColor: "#F3F4F6",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    justifyContent: "center",
  },
  countryCodeText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 15,
    color: Colors.text,
  },
  phoneInput: {
    flex: 1,
    backgroundColor: "#F8F9FB",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: "Poppins_500Medium",
    fontSize: 16,
    color: Colors.text,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    letterSpacing: 1,
  },
  disclaimer: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    color: Colors.textLight,
    marginTop: 10,
    textAlign: "center",
  },
  submitBtn: {
    marginTop: 18,
    borderRadius: 14,
    overflow: "hidden",
  },
  submitBtnGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 15,
  },
  submitBtnText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 15,
    color: "#FFF",
  },
  otpInfoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.info + "10",
    borderRadius: 12,
    padding: 12,
    marginBottom: 20,
  },
  otpInfoText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 13,
    color: Colors.info,
    flex: 1,
  },
  otpRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 10,
    marginBottom: 20,
  },
  otpBox: {
    width: 48,
    height: 56,
    borderRadius: 12,
    backgroundColor: "#F8F9FB",
    borderWidth: 2,
    borderColor: "#E5E7EB",
    textAlign: "center",
    fontFamily: "Poppins_700Bold",
    fontSize: 22,
    color: Colors.secondary,
  },
  otpBoxFilled: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + "08",
  },
  timerRow: {
    alignItems: "center",
    marginBottom: 16,
  },
  timerText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 13,
    color: Colors.textLight,
  },
  resendText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
    color: Colors.primary,
  },
  backLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  backLinkText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 13,
    color: Colors.textSecondary,
  },
  successContainer: {
    alignItems: "center",
    paddingVertical: 10,
  },
  successIcon: {
    marginBottom: 12,
  },
  successTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 20,
    color: Colors.success,
    marginBottom: 6,
  },
  successMessage: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: "center",
  },
  successPhone: {
    fontFamily: "Poppins_700Bold",
    fontSize: 18,
    color: Colors.secondary,
    marginTop: 4,
    marginBottom: 20,
  },
  doneBtn: {
    width: "100%",
    borderRadius: 14,
    overflow: "hidden",
  },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { paddingHorizontal: 20, paddingBottom: 24 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  greeting: { fontFamily: "Poppins_400Regular", fontSize: 13, color: "rgba(255,255,255,0.6)" },
  name: { fontFamily: "Poppins_700Bold", fontSize: 22, color: "#FFF" },
  headerActions: { flexDirection: "row", gap: 8 },
  headerIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
    position: "relative" as const,
  },
  notifBadge: {
    position: "absolute" as const,
    top: 5,
    right: 5,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.error,
    alignItems: "center",
    justifyContent: "center",
  },
  notifBadgeText: { fontFamily: "Poppins_700Bold", fontSize: 9, color: "#FFF" },
  alertBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.warning + "20",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 16,
    gap: 8,
  },
  alertText: { fontFamily: "Poppins_500Medium", fontSize: 12, color: "#FFF", flex: 1 },
  kpiSection: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 16, marginTop: -12, gap: 10, justifyContent: "space-between" },
  kpiCard: {
    width: "48%",
    backgroundColor: "#FFF",
    borderRadius: 16,
    padding: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  kpiHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  kpiIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  trendBadge: { flexDirection: "row", alignItems: "center", gap: 2, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2 },
  trendText: { fontFamily: "Poppins_600SemiBold", fontSize: 10, color: Colors.success },
  kpiValue: { fontFamily: "Poppins_700Bold", fontSize: 17, color: Colors.secondary },
  kpiLabel: { fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textSecondary, marginTop: 1 },
  section: { marginTop: 22, paddingHorizontal: 20 },
  sectionTitle: { fontFamily: "Poppins_700Bold", fontSize: 17, color: Colors.secondary, marginBottom: 12 },
  mgmtGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "space-between" },
  mgmtCard: {
    width: "47%",
    backgroundColor: "#FFF",
    borderRadius: 16,
    padding: 16,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
    position: "relative" as const,
  },
  mgmtCardPressed: { opacity: 0.7, transform: [{ scale: 0.97 }] },
  mgmtIcon: { width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  mgmtLabel: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: Colors.text },
  mgmtCount: { fontFamily: "Poppins_700Bold", fontSize: 18, color: Colors.secondary, marginTop: 2 },
  mgmtBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, marginTop: 6 },
  mgmtBadgeText: { fontFamily: "Poppins_500Medium", fontSize: 10 },
  mgmtArrow: { position: "absolute" as const, top: 12, right: 12 },
  quickStatsRow: { flexDirection: "row", gap: 8 },
  quickStatCard: {
    flex: 1,
    backgroundColor: "#FFF",
    borderRadius: 14,
    padding: 12,
    alignItems: "center",
    gap: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  quickStatValue: { fontFamily: "Poppins_700Bold", fontSize: 15, color: Colors.secondary },
  quickStatLabel: { fontFamily: "Poppins_400Regular", fontSize: 10, color: Colors.textSecondary },
  healthCard: { backgroundColor: "#FFF", borderRadius: 16, padding: 16, gap: 10 },
  healthRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  healthDot: { width: 8, height: 8, borderRadius: 4 },
  healthLabel: { fontFamily: "Poppins_500Medium", fontSize: 13, color: Colors.text, flex: 1 },
  healthStatus: { fontFamily: "Poppins_600SemiBold", fontSize: 12 },
  cityCard: {
    backgroundColor: "#FFF",
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
  },
  cityHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cityName: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: Colors.text },
  cityRevenue: { fontFamily: "Poppins_700Bold", fontSize: 15, color: Colors.primary },
  cityStats: { flexDirection: "row", gap: 16, marginTop: 6 },
  cityStat: { flexDirection: "row", alignItems: "center", gap: 4 },
  cityStatText: { fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textSecondary },
  activityRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF",
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
    gap: 10,
  },
  activityIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  activityInfo: { flex: 1 },
  activityAction: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: Colors.text },
  activityDetail: { fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textSecondary, marginTop: 1 },
  activityTime: { fontFamily: "Poppins_400Regular", fontSize: 10, color: Colors.textLight },
  sendNotifBtn: { borderRadius: 16, overflow: "hidden" },
  sendNotifGradient: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, paddingVertical: 16 },
  sendNotifTitle: { fontFamily: "Poppins_700Bold", fontSize: 15, color: "#FFF" },
  sendNotifSub: { fontFamily: "Poppins_400Regular", fontSize: 11, color: "rgba(255,255,255,0.7)" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalContent: { backgroundColor: "#FFF", borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "85%", paddingHorizontal: 20, paddingTop: 20, paddingBottom: 30 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  modalTitle: { fontFamily: "Poppins_700Bold", fontSize: 20, color: Colors.secondary },
  modalLabel: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: Colors.text, marginTop: 14, marginBottom: 8 },
  modalInput: { backgroundColor: "#F8F9FB", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontFamily: "Poppins_400Regular", fontSize: 14, color: Colors.text, borderWidth: 1, borderColor: "#E5E7EB" },
  targetRow: { gap: 8 },
  targetChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: "#F3F4F6", borderWidth: 1, borderColor: "#E5E7EB" },
  targetChipActive: { backgroundColor: "#8B5CF6", borderColor: "#8B5CF6" },
  targetText: { fontFamily: "Poppins_500Medium", fontSize: 12, color: Colors.textSecondary },
  targetTextActive: { color: "#FFF" },
  notifPreview: { marginTop: 16 },
  notifPreviewHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 },
  notifPreviewLabel: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: "#8B5CF6" },
  notifPreviewCard: { backgroundColor: "#F3F0FF", borderRadius: 14, padding: 14, borderWidth: 1, borderColor: "#8B5CF620" },
  notifPreviewTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: Colors.text },
  notifPreviewMsg: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary, marginTop: 4 },
  notifPreviewTarget: { fontFamily: "Poppins_500Medium", fontSize: 11, color: "#8B5CF6", marginTop: 8 },
  sendBtn: { marginTop: 16, borderRadius: 14, overflow: "hidden" },
  sendBtnGradient: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 15 },
  sendBtnText: { fontFamily: "Poppins_700Bold", fontSize: 15, color: "#FFF" },
  agentCard: { borderRadius: 16, overflow: "hidden" },
  agentGradient: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 18, paddingVertical: 18 },
  agentLeft: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  agentIconWrap: { width: 44, height: 44, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  agentTitle: { fontFamily: "Poppins_700Bold", fontSize: 17, color: "#FFF" },
  agentDesc: { fontFamily: "Poppins_400Regular", fontSize: 11, color: "rgba(255,255,255,0.75)", marginTop: 1 },
  agentBtnWrap: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#FFF", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  agentBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 12, color: "#7C3AED" },
});

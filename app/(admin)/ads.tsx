import React, { useState, useMemo, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  Alert,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useApp } from "@/lib/store";

type TabFilter = "All" | "Pending" | "Approved" | "Live" | "Rejected" | "Expired";
const TABS: TabFilter[] = ["All", "Pending", "Approved", "Live", "Rejected", "Expired"];

export default function AdminAdsScreen() {
  const insets = useSafeAreaInsets();
  const { adRequests, reviewAdRequestAdmin, makeAdLive, refreshAdRequests } = useApp();
  const [activeTab, setActiveTab] = useState<TabFilter>("All");
  const topInset = Platform.OS === "web" ? 67 : insets.top;

  useEffect(() => { refreshAdRequests(); }, []);
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  const pendingAds = adRequests.filter(a => a.status === "PENDING_ADMIN");
  const approvedAds = adRequests.filter(a => a.status === "APPROVED");
  const liveAds = adRequests.filter(a => a.status === "LIVE");
  const rejectedAds = adRequests.filter(a => a.status === "REJECTED");
  const expiredAds = adRequests.filter(a => a.status === "EXPIRED");

  const filteredAds = useMemo(() => {
    switch (activeTab) {
      case "Pending": return pendingAds;
      case "Approved": return approvedAds;
      case "Live": return liveAds;
      case "Rejected": return rejectedAds;
      case "Expired": return expiredAds;
      default: return adRequests;
    }
  }, [activeTab, adRequests]);

  const statusConfig: Record<string, { color: string; label: string; icon: string }> = {
    PENDING_FRANCHISE: { color: "#F59E0B", label: "With Franchise", icon: "time" },
    PENDING_ADMIN: { color: "#3B82F6", label: "Pending Review", icon: "hourglass" },
    APPROVED: { color: "#10B981", label: "Approved", icon: "checkmark-circle" },
    LIVE: { color: "#22C55E", label: "Live", icon: "radio" },
    REJECTED: { color: "#EF4444", label: "Rejected", icon: "close-circle" },
    EXPIRED: { color: "#9CA3AF", label: "Expired", icon: "timer-outline" },
  };

  const totalRevenue = adRequests.filter(a => ["APPROVED", "LIVE"].includes(a.status)).reduce((s, a) => s + a.amountPaid, 0);

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
      <LinearGradient colors={[Colors.secondary, "#1a2d4d"]} style={styles.header}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color="#FFF" />
          </Pressable>
          <Text style={styles.headerTitle}>Advertisement Management</Text>
          <View style={{ width: 36 }} />
        </View>

        <View style={styles.kpiRow}>
          {[
            { label: "Total Ads", value: adRequests.length, color: "#FFF" },
            { label: "Pending", value: pendingAds.length, color: "#F59E0B" },
            { label: "Live", value: liveAds.length, color: "#22C55E" },
            { label: "Revenue", value: `\u20B9${totalRevenue.toLocaleString("en-IN")}`, color: Colors.primary },
          ].map((k) => (
            <View key={k.label} style={styles.kpiCard}>
              <Text style={[styles.kpiValue, { color: k.color }]}>{k.value}</Text>
              <Text style={styles.kpiLabel}>{k.label}</Text>
            </View>
          ))}
        </View>
      </LinearGradient>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabScroll} contentContainerStyle={styles.tabRow}>
        {TABS.map((tab) => {
          const count = tab === "All" ? adRequests.length : tab === "Pending" ? pendingAds.length : tab === "Approved" ? approvedAds.length : tab === "Live" ? liveAds.length : tab === "Rejected" ? rejectedAds.length : expiredAds.length;
          return (
            <Pressable key={tab} style={[styles.tab, activeTab === tab && styles.tabActive]} onPress={() => setActiveTab(tab)}>
              <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>{tab}{count > 0 ? ` (${count})` : ""}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: bottomInset + 24 }}>
        {filteredAds.length === 0 && (
          <View style={styles.emptyCard}>
            <Ionicons name="megaphone-outline" size={40} color={Colors.textLight} />
            <Text style={styles.emptyText}>No {activeTab.toLowerCase()} ads found</Text>
          </View>
        )}

        {filteredAds.map((ad) => {
          const cfg = statusConfig[ad.status] || statusConfig.EXPIRED;
          return (
            <View key={ad.id} style={[styles.adCard, { borderLeftColor: cfg.color }]}>
              <View style={styles.adHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.adTitle}>{ad.title}</Text>
                  <Text style={styles.adSubtitle}>{ad.subtitle}</Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: cfg.color + "18" }]}>
                  <Ionicons name={cfg.icon as any} size={12} color={cfg.color} />
                  <Text style={[styles.statusText, { color: cfg.color }]}>{cfg.label}</Text>
                </View>
              </View>

              {ad.description ? <Text style={styles.adDescription}>{ad.description}</Text> : null}

              <View style={styles.adMeta}>
                <View style={styles.metaItem}>
                  <Ionicons name="storefront" size={13} color={Colors.textLight} />
                  <Text style={styles.metaText}>{ad.vendorName}</Text>
                </View>
                <View style={styles.metaItem}>
                  <Ionicons name="layers" size={13} color={Colors.textLight} />
                  <Text style={styles.metaText}>{ad.slotType === "BANNER" ? "Home Banner" : ad.slotType === "FEATURED" ? "Featured" : "Spotlight"}</Text>
                </View>
                <View style={styles.metaItem}>
                  <Ionicons name="calendar" size={13} color={Colors.textLight} />
                  <Text style={styles.metaText}>{ad.durationDays} days</Text>
                </View>
                <View style={styles.metaItem}>
                  <Ionicons name="cash" size={13} color={Colors.primary} />
                  <Text style={[styles.metaText, { color: Colors.primary, fontFamily: "Poppins_600SemiBold" }]}>{"\u20B9"}{ad.amountPaid}</Text>
                </View>
              </View>

              {ad.offerText ? (
                <View style={styles.offerRow}>
                  <Ionicons name="pricetag" size={12} color={Colors.primary} />
                  <Text style={styles.offerText}>{ad.offerText}</Text>
                </View>
              ) : null}

              <View style={styles.dateRow}>
                <Text style={styles.dateText}>Created: {new Date(ad.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</Text>
                {ad.franchiseReviewedAt && <Text style={styles.dateText}>Franchise: {new Date(ad.franchiseReviewedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</Text>}
              </View>

              {ad.rejectionReason && (
                <View style={styles.rejectionRow}>
                  <Ionicons name="alert-circle" size={14} color={Colors.error} />
                  <Text style={styles.rejectionText}>{ad.rejectionReason}</Text>
                </View>
              )}

              {ad.status === "PENDING_ADMIN" && (
                <View style={styles.actionRow}>
                  <Pressable
                    style={[styles.actionBtn, { backgroundColor: Colors.success }]}
                    onPress={() => {
                      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
                      reviewAdRequestAdmin(ad.id, true);
                      Alert.alert("Approved", "Ad has been approved. You can now make it live.");
                    }}
                  >
                    <Ionicons name="checkmark" size={16} color="#FFF" />
                    <Text style={styles.actionBtnText}>Approve</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.actionBtn, { backgroundColor: "#FEE2E2" }]}
                    onPress={() => {
                      reviewAdRequestAdmin(ad.id, false, "Does not meet platform advertising standards");
                      Alert.alert("Rejected", "Ad request has been rejected.");
                    }}
                  >
                    <Ionicons name="close" size={16} color={Colors.error} />
                    <Text style={[styles.actionBtnText, { color: Colors.error }]}>Reject</Text>
                  </Pressable>
                </View>
              )}

              {ad.status === "APPROVED" && (
                <Pressable
                  style={[styles.actionBtn, { backgroundColor: "#22C55E", alignSelf: "stretch", marginTop: 10 }]}
                  onPress={() => {
                    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
                    makeAdLive(ad.id);
                    Alert.alert("Live!", "Ad is now live on customer home page.");
                  }}
                >
                  <Ionicons name="radio" size={16} color="#FFF" />
                  <Text style={styles.actionBtnText}>Make Live</Text>
                </Pressable>
              )}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F5F8" },
  header: { paddingHorizontal: 20, paddingBottom: 18, paddingTop: 10 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
  headerTitle: { fontFamily: "Poppins_700Bold", fontSize: 18, color: "#FFF" },
  kpiRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 16 },
  kpiCard: { flex: 1, alignItems: "center" },
  kpiValue: { fontFamily: "Poppins_700Bold", fontSize: 18, color: "#FFF" },
  kpiLabel: { fontFamily: "Poppins_400Regular", fontSize: 10, color: "rgba(255,255,255,0.7)", marginTop: 2 },
  tabScroll: { maxHeight: 46, backgroundColor: "#FFF", borderBottomWidth: 1, borderBottomColor: "#E5E5E5" },
  tabRow: { paddingHorizontal: 16, alignItems: "center", gap: 6 },
  tab: { paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 2, borderBottomColor: "transparent" },
  tabActive: { borderBottomColor: Colors.primary },
  tabText: { fontFamily: "Poppins_500Medium", fontSize: 13, color: Colors.textLight },
  tabTextActive: { color: Colors.primary, fontFamily: "Poppins_600SemiBold" },
  content: { flex: 1, paddingHorizontal: 16, paddingTop: 14 },
  emptyCard: { alignItems: "center", paddingVertical: 40, backgroundColor: "#FFF", borderRadius: 14 },
  emptyText: { fontFamily: "Poppins_400Regular", fontSize: 13, color: Colors.textLight, marginTop: 10 },
  adCard: { backgroundColor: "#FFF", borderRadius: 14, padding: 16, marginBottom: 12, borderLeftWidth: 4 },
  adHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  adTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 15, color: Colors.secondary },
  adSubtitle: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  statusBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  statusText: { fontFamily: "Poppins_600SemiBold", fontSize: 10 },
  adDescription: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textLight, marginTop: 8 },
  adMeta: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 10 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaText: { fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textLight },
  offerRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 8, backgroundColor: Colors.primary + "10", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  offerText: { fontFamily: "Poppins_500Medium", fontSize: 11, color: Colors.primary },
  dateRow: { flexDirection: "row", gap: 16, marginTop: 10 },
  dateText: { fontFamily: "Poppins_400Regular", fontSize: 10, color: Colors.textLight },
  rejectionRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8, backgroundColor: "#FEF2F2", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  rejectionText: { fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.error, flex: 1 },
  actionRow: { flexDirection: "row", gap: 10, marginTop: 12 },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 10 },
  actionBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: "#FFF" },
});

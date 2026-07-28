import React from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Platform, Alert } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useApp } from "@/lib/store";

export default function FranchiseRevenue() {
  const { user, liveVendors, vendorApplications, teamMembers, orders } = useApp();
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  const myPhone = user?.phone || "";
  const myPhoneNorm = myPhone.replace(/\D/g, "").slice(-10);

  const myOwnerRecord = teamMembers.find(
    (m) => m.role === "FRANCHISE" && m.phone.replace(/\D/g, "").slice(-10) === myPhoneNorm
  );
  const myPinCode = (myOwnerRecord?.pinCode || "").trim();
  const myTerritory = myOwnerRecord?.territory || myOwnerRecord?.city || user?.city || "My Territory";

  const franchiseTeam = teamMembers.filter((m) => {
    if (m.role !== "MARKETING" && m.role !== "DELIVERY") return false;
    const mFranchise = (m.franchiseId || "").replace(/\D/g, "").slice(-10);
    if (mFranchise && mFranchise === myPhoneNorm) return true;
    if (m.createdByRole === "FRANCHISE") {
      if (m.createdBy === user?.name) return true;
      const createdByNorm = (m.createdBy || "").replace(/\D/g, "").slice(-10);
      if (createdByNorm && createdByNorm === myPhoneNorm) return true;
    }
    return false;
  });
  const myTeamNames = new Set(franchiseTeam.map((m) => m.name));
  const myName = user?.name || "";

  const isMyApp = (a: { franchiseId?: string; submittedBy?: string; pinCode?: string }) => {
    const appPinCode = (a.pinCode || "").trim();
    const appFranchise = (a.franchiseId || "").replace(/\D/g, "").slice(-10);
    if (appPinCode && myPinCode) return appPinCode === myPinCode;
    if (appFranchise && appFranchise === myPhoneNorm) return true;
    if (a.submittedBy && myTeamNames.has(a.submittedBy)) return true;
    if (myName && a.submittedBy === myName) return true;
    return false;
  };

  const liveAppIds = new Set(
    vendorApplications.filter((a) => a.status === "LIVE" && isMyApp(a)).map((a) => a.id)
  );

  const myVendors = liveVendors.filter((v) => {
    const vPinCode = (v.pinCode || "").trim();
    if (vPinCode && myPinCode) return vPinCode === myPinCode;
    const vFranchise = (v.franchiseId || "").replace(/\D/g, "").slice(-10);
    if (vFranchise && vFranchise === myPhoneNorm) return true;
    if (liveAppIds.has(v.id)) return true;
    return false;
  });

  const myVendorIds = new Set([...myVendors.map((v) => v.id), ...liveAppIds]);
  const myOrders = orders.filter((o) => myVendorIds.has(o.vendorId));
  const completedOrders = myOrders.filter((o) => o.status === "DELIVERED");
  const totalRevenue = completedOrders.reduce((s, o) => s + o.totalAmount, 0);
  const commissionEarned = Math.floor(totalRevenue * 0.12);

  const bankName = myOwnerRecord?.bankName || "";
  const accountNumber = myOwnerRecord?.accountNumber || "";
  const ifscCode = myOwnerRecord?.ifscCode || "";
  const accountHolder = myOwnerRecord?.accountHolderName || user?.name || "";

  return (
    <View style={styles.container}>
      <LinearGradient colors={["#0B1E3D", "#142F5E"]} style={[styles.header, { paddingTop: topInset + 12 }]}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color="#FFF" />
          </Pressable>
          <Text style={styles.headerTitle}>Revenue & Commissions</Text>
          <View style={{ width: 36 }} />
        </View>
      </LinearGradient>

      <ScrollView contentContainerStyle={{ paddingBottom: bottomInset + 40 }} showsVerticalScrollIndicator={false}>
        <View style={styles.overviewCard}>
          <Text style={styles.cardTitle}>Revenue Overview</Text>
          <View style={styles.overviewGrid}>
            <View style={styles.overviewItem}>
              <Text style={styles.overviewLabel}>Total Revenue</Text>
              <Text style={styles.overviewValue}>₹{totalRevenue.toLocaleString("en-IN")}</Text>
            </View>
            <View style={styles.overviewItem}>
              <Text style={styles.overviewLabel}>Commission Earned</Text>
              <Text style={[styles.overviewValue, { color: Colors.success }]}>₹{commissionEarned.toLocaleString("en-IN")}</Text>
              <View style={styles.percentBadge}>
                <Text style={styles.percentText}>12%</Text>
              </View>
            </View>
            <View style={styles.overviewItem}>
              <Text style={styles.overviewLabel}>Vendors Active</Text>
              <Text style={styles.overviewValue}>{myVendors.length}</Text>
            </View>
            <View style={styles.overviewItem}>
              <Text style={styles.overviewLabel}>Territory</Text>
              <Text style={[styles.overviewValue, { fontSize: 16 }]}>{myTerritory}</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Monthly Revenue Trend</Text>
          <View style={{ alignItems: "center", paddingVertical: 20 }}>
            <Ionicons name="bar-chart-outline" size={36} color={Colors.textSecondary} />
            <Text style={{ color: Colors.textSecondary, marginTop: 8, fontSize: 13 }}>No revenue data yet</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Commission Structure</Text>
          <View style={styles.commCard}>
            <View style={styles.commRow}>
              <View style={[styles.commIcon, { backgroundColor: Colors.primary + "15" }]}>
                <Ionicons name="trending-up" size={18} color={Colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.commLabel}>Base Commission</Text>
                <Text style={styles.commDesc}>Standard rate on all orders</Text>
              </View>
              <Text style={styles.commRate}>12%</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.commRow}>
              <View style={[styles.commIcon, { backgroundColor: Colors.info + "15" }]}>
                <Ionicons name="people" size={18} color={Colors.info} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.commLabel}>Vendor Bonus</Text>
                <Text style={styles.commDesc}>{">"}25 active vendors</Text>
              </View>
              <Text style={[styles.commRate, { color: Colors.info }]}>+2%</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.commRow}>
              <View style={[styles.commIcon, { backgroundColor: Colors.success + "15" }]}>
                <Ionicons name="star" size={18} color={Colors.success} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.commLabel}>Performance Bonus</Text>
                <Text style={styles.commDesc}>{">"}₹10L/month revenue</Text>
              </View>
              <Text style={[styles.commRate, { color: Colors.success }]}>+1%</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Vendor-wise Revenue</Text>
          <View style={styles.tableCard}>
            <View style={styles.tableHeader}>
              <Text style={[styles.thText, { flex: 2 }]}>Vendor</Text>
              <Text style={[styles.thText, { flex: 1, textAlign: "center" }]}>Orders</Text>
              <Text style={[styles.thText, { flex: 1.5, textAlign: "right" }]}>Revenue</Text>
              <Text style={[styles.thText, { flex: 1.5, textAlign: "right" }]}>Commission</Text>
            </View>
            {myVendors.length === 0 ? (
              <View style={{ alignItems: "center", paddingVertical: 20 }}>
                <Text style={{ color: Colors.textSecondary, fontSize: 13 }}>No vendors in your territory yet</Text>
              </View>
            ) : myVendors.map((v, i) => {
              const vOrders = myOrders.filter((o) => o.vendorId === v.id && o.status === "DELIVERED");
              const vRevenue = vOrders.reduce((s, o) => s + o.totalAmount, 0);
              const vComm = Math.floor(vRevenue * 0.12);
              return (
                <View key={v.id} style={[styles.tableRow, i % 2 === 0 && { backgroundColor: Colors.background }]}>
                  <Text style={[styles.tdText, { flex: 2 }]} numberOfLines={1}>{v.businessName}</Text>
                  <Text style={[styles.tdText, { flex: 1, textAlign: "center" }]}>{vOrders.length}</Text>
                  <Text style={[styles.tdText, { flex: 1.5, textAlign: "right" }]}>₹{vRevenue.toLocaleString("en-IN")}</Text>
                  <Text style={[styles.tdTextBold, { flex: 1.5, textAlign: "right", color: Colors.success }]}>₹{vComm.toLocaleString("en-IN")}</Text>
                </View>
              );
            })}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Payout History</Text>
          <View style={{ alignItems: "center", paddingVertical: 20 }}>
            <Ionicons name="wallet-outline" size={36} color={Colors.textSecondary} />
            <Text style={{ color: Colors.textSecondary, marginTop: 8, fontSize: 13 }}>No payouts yet</Text>
          </View>
        </View>

        {(bankName || accountNumber || ifscCode || accountHolder) ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Bank Details</Text>
            <View style={styles.bankCard}>
              {accountHolder ? (
                <View style={styles.bankRow}>
                  <Ionicons name="business" size={16} color={Colors.textSecondary} />
                  <Text style={styles.bankLabel}>Account Holder</Text>
                  <Text style={styles.bankValue}>{accountHolder}</Text>
                </View>
              ) : null}
              {accountNumber ? (
                <View style={styles.bankRow}>
                  <Ionicons name="card" size={16} color={Colors.textSecondary} />
                  <Text style={styles.bankLabel}>Account No.</Text>
                  <Text style={styles.bankValue}>
                    {"X".repeat(Math.max(0, accountNumber.length - 4))}{accountNumber.slice(-4)}
                  </Text>
                </View>
              ) : null}
              {ifscCode ? (
                <View style={styles.bankRow}>
                  <Ionicons name="code" size={16} color={Colors.textSecondary} />
                  <Text style={styles.bankLabel}>IFSC Code</Text>
                  <Text style={styles.bankValue}>{ifscCode}</Text>
                </View>
              ) : null}
              {bankName ? (
                <View style={styles.bankRow}>
                  <Ionicons name="home" size={16} color={Colors.textSecondary} />
                  <Text style={styles.bankLabel}>Bank</Text>
                  <Text style={styles.bankValue}>{bankName}</Text>
                </View>
              ) : null}
            </View>
          </View>
        ) : null}

        <Pressable
          style={styles.payoutBtn}
          onPress={() => {
            try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
            Alert.alert(
              "Request Payout",
              "Are you sure you want to request a payout for your pending commission?",
              [
                { text: "Cancel", style: "cancel" },
                { text: "Request", onPress: () => Alert.alert("Success", "Your payout request has been submitted. It will be processed within 3-5 business days.") },
              ]
            );
          }}
        >
          <LinearGradient
            colors={[Colors.primary, Colors.primaryDark]}
            style={styles.payoutBtnGradient}
          >
            <Ionicons name="wallet" size={20} color="#FFF" />
            <Text style={styles.payoutBtnText}>Request Payout</Text>
          </LinearGradient>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { paddingHorizontal: 20, paddingBottom: 20 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  backBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
  headerTitle: { fontFamily: "Poppins_700Bold", fontSize: 18, color: "#FFF" },
  overviewCard: { marginHorizontal: 20, marginTop: 20, backgroundColor: "#FFF", borderRadius: 18, padding: 18 },
  cardTitle: { fontFamily: "Poppins_700Bold", fontSize: 16, color: Colors.secondary, marginBottom: 14 },
  overviewGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  overviewItem: { width: "46%", backgroundColor: Colors.background, borderRadius: 14, padding: 14 },
  overviewLabel: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary },
  overviewValue: { fontFamily: "Poppins_700Bold", fontSize: 20, color: Colors.secondary, marginTop: 4 },
  percentBadge: { alignSelf: "flex-start", backgroundColor: Colors.success + "18", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2, marginTop: 4 },
  percentText: { fontFamily: "Poppins_600SemiBold", fontSize: 11, color: Colors.success },
  section: { marginTop: 24, paddingHorizontal: 20 },
  sectionTitle: { fontFamily: "Poppins_700Bold", fontSize: 16, color: Colors.secondary, marginBottom: 12 },
  commCard: { backgroundColor: "#FFF", borderRadius: 16, padding: 16 },
  commRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 4 },
  commIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  commLabel: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: Colors.text },
  commDesc: { fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textSecondary, marginTop: 1 },
  commRate: { fontFamily: "Poppins_700Bold", fontSize: 16, color: Colors.primary },
  divider: { height: 1, backgroundColor: Colors.borderLight, marginVertical: 10 },
  tableCard: { backgroundColor: "#FFF", borderRadius: 16, overflow: "hidden" },
  tableHeader: { flexDirection: "row", backgroundColor: Colors.secondary, paddingHorizontal: 14, paddingVertical: 10 },
  thText: { fontFamily: "Poppins_600SemiBold", fontSize: 11, color: "#FFF" },
  tableRow: { flexDirection: "row", paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  tdText: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.text },
  tdTextBold: { fontFamily: "Poppins_600SemiBold", fontSize: 12 },
  bankCard: { backgroundColor: "#FFF", borderRadius: 16, padding: 16, gap: 12 },
  bankRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  bankLabel: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary, width: 100 },
  bankValue: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: Colors.text, flex: 1 },
  payoutBtn: { marginHorizontal: 20, marginTop: 28, borderRadius: 16, overflow: "hidden" },
  payoutBtnGradient: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 16 },
  payoutBtnText: { fontFamily: "Poppins_700Bold", fontSize: 16, color: "#FFF" },
});

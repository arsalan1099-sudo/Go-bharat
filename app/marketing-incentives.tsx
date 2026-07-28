import React from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Platform, Alert } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useApp } from "@/lib/store";

const incentiveTiers = [
  { tier: "Bronze", range: "0-5 vendors", rate: "₹500/vendor", rateNum: 500, color: "#CD7F32", icon: "shield" as const, min: 0, max: 5 },
  { tier: "Silver", range: "6-15 vendors", rate: "₹750/vendor", rateNum: 750, color: "#9CA3AF", icon: "shield-half" as const, min: 6, max: 15 },
  { tier: "Gold", range: "16+ vendors", rate: "₹1,000/vendor", rateNum: 1000, color: "#F59E0B", icon: "shield-checkmark" as const, min: 16, max: 999 },
];

const leadStatusColors: Record<string, string> = {
  NEW: Colors.info,
  CONTACTED: Colors.warning,
  NEGOTIATION: "#8B5CF6",
  CLOSED: Colors.success,
};

export default function MarketingIncentives() {
  const { leads } = useApp();
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  const closedLeads = leads.filter((l) => l.status === "CLOSED");
  const activeLeads = leads.filter((l) => l.status !== "CLOSED");
  const currentVendors = closedLeads.length;

  const currentTierIndex = incentiveTiers.findIndex(
    (t) => currentVendors >= t.min && currentVendors <= t.max
  );
  const currentRate = currentTierIndex >= 0 ? incentiveTiers[currentTierIndex].rateNum : 500;
  const totalEarned = closedLeads.length * currentRate;

  return (
    <View style={styles.container}>
      <LinearGradient colors={["#0B1E3D", "#142F5E"]} style={[styles.header, { paddingTop: topInset + 12 }]}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color="#FFF" />
          </Pressable>
          <Text style={styles.headerTitle}>Incentives & Commissions</Text>
          <View style={{ width: 36 }} />
        </View>
      </LinearGradient>

      <ScrollView contentContainerStyle={{ paddingBottom: bottomInset + 40 }} showsVerticalScrollIndicator={false}>
        <View style={styles.earningsCard}>
          <Text style={styles.cardTitle}>Earnings Overview</Text>
          <View style={styles.earningsGrid}>
            <View style={styles.earningsItem}>
              <Ionicons name="wallet" size={20} color={Colors.primary} />
              <Text style={styles.earningsLabel}>Total Earned</Text>
              <Text style={styles.earningsValue}>₹{totalEarned.toLocaleString("en-IN")}</Text>
            </View>
            <View style={styles.earningsItem}>
              <Ionicons name="calendar" size={20} color={Colors.info} />
              <Text style={styles.earningsLabel}>This Month</Text>
              <Text style={styles.earningsValue}>₹0</Text>
            </View>
            <View style={styles.earningsItem}>
              <Ionicons name="checkmark-done" size={20} color={Colors.success} />
              <Text style={styles.earningsLabel}>Leads Converted</Text>
              <Text style={styles.earningsValue}>{closedLeads.length}</Text>
            </View>
            <View style={styles.earningsItem}>
              <Ionicons name="trending-up" size={20} color="#8B5CF6" />
              <Text style={styles.earningsLabel}>Conversion Rate</Text>
              <Text style={styles.earningsValue}>{leads.length > 0 ? Math.round((closedLeads.length / leads.length) * 100) : 0}%</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Incentive Tiers</Text>
          <View style={styles.tiersCard}>
            {incentiveTiers.map((tier, i) => {
              const isCurrentTier = i === currentTierIndex;
              return (
                <View key={tier.tier} style={[styles.tierRow, isCurrentTier && styles.tierRowActive]}>
                  <View style={[styles.tierIcon, { backgroundColor: tier.color + "20" }]}>
                    <Ionicons name={tier.icon} size={22} color={tier.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={styles.tierHeader}>
                      <Text style={[styles.tierName, isCurrentTier && { color: Colors.primary }]}>{tier.tier}</Text>
                      {isCurrentTier && (
                        <View style={styles.currentBadge}>
                          <Text style={styles.currentBadgeText}>Current</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.tierRange}>{tier.range}</Text>
                  </View>
                  <Text style={[styles.tierRate, isCurrentTier && { color: Colors.primary }]}>{tier.rate}</Text>
                </View>
              );
            })}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Active Leads</Text>
          {activeLeads.length === 0 ? (
            <View style={{ alignItems: "center", paddingVertical: 20 }}>
              <Ionicons name="person-add-outline" size={32} color={Colors.textSecondary} />
              <Text style={{ color: Colors.textSecondary, marginTop: 8, fontSize: 13 }}>No active leads yet</Text>
            </View>
          ) : activeLeads.map((lead) => (
            <View key={lead.id} style={styles.leadCard}>
              <View style={styles.leadIcon}>
                <Ionicons name="person" size={16} color={Colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.leadName}>{lead.vendorName}</Text>
                <View style={styles.leadMeta}>
                  <View style={[styles.statusBadge, { backgroundColor: (leadStatusColors[lead.status] || Colors.textLight) + "18" }]}>
                    <Text style={[styles.statusText, { color: leadStatusColors[lead.status] || Colors.textLight }]}>{lead.status}</Text>
                  </View>
                </View>
              </View>
              <Text style={styles.leadCommission}>₹{currentRate.toLocaleString("en-IN")}</Text>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Commission History</Text>
          {closedLeads.length === 0 ? (
            <View style={{ alignItems: "center", paddingVertical: 20 }}>
              <Ionicons name="cash-outline" size={32} color={Colors.textSecondary} />
              <Text style={{ color: Colors.textSecondary, marginTop: 8, fontSize: 13 }}>No commissions earned yet</Text>
            </View>
          ) : closedLeads.map((c) => (
            <View key={c.id} style={styles.historyRow}>
              <View style={styles.historyIcon}>
                <Ionicons name="cash" size={16} color={Colors.success} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.historyLead}>{c.vendorName}</Text>
                <Text style={styles.historyDate}>{new Date(c.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</Text>
              </View>
              <View style={styles.historyRight}>
                <Text style={styles.historyAmount}>₹{currentRate.toLocaleString("en-IN")}</Text>
                <View style={[styles.statusBadge, { backgroundColor: Colors.success + "15" }]}>
                  <Text style={[styles.statusText, { color: Colors.success }]}>Paid</Text>
                </View>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Performance Bonuses</Text>
          <View style={styles.bonusCard}>
            <View style={styles.bonusHeader}>
              <Ionicons name="trophy" size={20} color={Colors.warning} />
              <Text style={styles.bonusTitle}>Monthly Target</Text>
            </View>
            <Text style={styles.bonusProgress}>{currentVendors} / 25 vendors</Text>
            <View style={styles.progressTrack}>
              <LinearGradient
                colors={[Colors.primary, Colors.primaryLight]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[styles.progressFill, { width: `${Math.min((currentVendors / 25) * 100, 100)}%` }]}
              />
            </View>
            <Text style={styles.bonusNote}>{Math.max(0, 25 - currentVendors)} more vendors to unlock ₹5,000 bonus</Text>

            <View style={styles.divider} />

            <View style={styles.bonusHeader}>
              <Ionicons name="people" size={20} color={Colors.info} />
              <Text style={styles.bonusTitle}>Referral Bonus</Text>
            </View>
            <View style={styles.referralRow}>
              <View style={styles.referralItem}>
                <Text style={styles.referralValue}>3</Text>
                <Text style={styles.referralLabel}>Referrals Made</Text>
              </View>
              <View style={styles.referralItem}>
                <Text style={[styles.referralValue, { color: Colors.success }]}>₹1,500</Text>
                <Text style={styles.referralLabel}>Bonus Earned</Text>
              </View>
              <View style={styles.referralItem}>
                <Text style={[styles.referralValue, { color: Colors.info }]}>₹500</Text>
                <Text style={styles.referralLabel}>Per Referral</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Bank Details</Text>
          <View style={styles.bankCard}>
            <View style={styles.bankRow}>
              <Ionicons name="person" size={16} color={Colors.textSecondary} />
              <Text style={styles.bankLabel}>Account Holder</Text>
              <Text style={styles.bankValue}>Marketing Executive</Text>
            </View>
            <View style={styles.bankRow}>
              <Ionicons name="card" size={16} color={Colors.textSecondary} />
              <Text style={styles.bankLabel}>Account No.</Text>
              <Text style={styles.bankValue}>XXXX XXXX 7892</Text>
            </View>
            <View style={styles.bankRow}>
              <Ionicons name="code" size={16} color={Colors.textSecondary} />
              <Text style={styles.bankLabel}>IFSC Code</Text>
              <Text style={styles.bankValue}>HDFC0001234</Text>
            </View>
            <View style={styles.bankRow}>
              <Ionicons name="home" size={16} color={Colors.textSecondary} />
              <Text style={styles.bankLabel}>Bank</Text>
              <Text style={styles.bankValue}>HDFC Bank</Text>
            </View>
          </View>
        </View>

        <Pressable
          style={styles.withdrawBtn}
          onPress={() => {
            try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
            Alert.alert(
              "Withdraw Earnings",
              "Are you sure you want to withdraw your pending earnings to your linked bank account?",
              [
                { text: "Cancel", style: "cancel" },
                { text: "Withdraw", onPress: () => Alert.alert("Success", "Your withdrawal request has been submitted. Amount will be credited within 2-3 business days.") },
              ]
            );
          }}
        >
          <LinearGradient
            colors={[Colors.primary, Colors.primaryDark]}
            style={styles.withdrawBtnGradient}
          >
            <Ionicons name="download" size={20} color="#FFF" />
            <Text style={styles.withdrawBtnText}>Withdraw Earnings</Text>
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
  earningsCard: { marginHorizontal: 20, marginTop: 20, backgroundColor: "#FFF", borderRadius: 18, padding: 18 },
  cardTitle: { fontFamily: "Poppins_700Bold", fontSize: 16, color: Colors.secondary, marginBottom: 14 },
  earningsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  earningsItem: { width: "47%", backgroundColor: Colors.background, borderRadius: 14, padding: 14, gap: 4 },
  earningsLabel: { fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textSecondary },
  earningsValue: { fontFamily: "Poppins_700Bold", fontSize: 20, color: Colors.secondary },
  section: { marginTop: 24, paddingHorizontal: 20 },
  sectionTitle: { fontFamily: "Poppins_700Bold", fontSize: 16, color: Colors.secondary, marginBottom: 12 },
  tiersCard: { backgroundColor: "#FFF", borderRadius: 16, overflow: "hidden" },
  tierRow: { flexDirection: "row", alignItems: "center", padding: 16, gap: 12, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  tierRowActive: { backgroundColor: Colors.primary + "08", borderLeftWidth: 3, borderLeftColor: Colors.primary },
  tierIcon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  tierHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  tierName: { fontFamily: "Poppins_700Bold", fontSize: 15, color: Colors.text },
  tierRange: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  tierRate: { fontFamily: "Poppins_700Bold", fontSize: 14, color: Colors.text },
  currentBadge: { backgroundColor: Colors.primary + "18", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  currentBadgeText: { fontFamily: "Poppins_600SemiBold", fontSize: 10, color: Colors.primary },
  leadCard: { flexDirection: "row", alignItems: "center", backgroundColor: "#FFF", borderRadius: 14, padding: 14, marginBottom: 8, gap: 12 },
  leadIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: Colors.primary + "12", alignItems: "center", justifyContent: "center" },
  leadName: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: Colors.text },
  leadMeta: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  statusBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  statusText: { fontFamily: "Poppins_600SemiBold", fontSize: 10 },
  leadCommission: { fontFamily: "Poppins_700Bold", fontSize: 14, color: Colors.success },
  historyRow: { flexDirection: "row", alignItems: "center", backgroundColor: "#FFF", borderRadius: 14, padding: 14, marginBottom: 8, gap: 12 },
  historyIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: Colors.success + "12", alignItems: "center", justifyContent: "center" },
  historyLead: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: Colors.text },
  historyDate: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  historyRight: { alignItems: "flex-end", gap: 4 },
  historyAmount: { fontFamily: "Poppins_700Bold", fontSize: 14, color: Colors.text },
  bonusCard: { backgroundColor: "#FFF", borderRadius: 16, padding: 18 },
  bonusHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  bonusTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: Colors.text },
  bonusProgress: { fontFamily: "Poppins_700Bold", fontSize: 20, color: Colors.secondary, marginBottom: 8 },
  progressTrack: { height: 10, backgroundColor: Colors.background, borderRadius: 5, overflow: "hidden", marginBottom: 8 },
  progressFill: { height: 10, borderRadius: 5 },
  bonusNote: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary },
  divider: { height: 1, backgroundColor: Colors.borderLight, marginVertical: 16 },
  referralRow: { flexDirection: "row", gap: 10 },
  referralItem: { flex: 1, backgroundColor: Colors.background, borderRadius: 12, padding: 12, alignItems: "center" },
  referralValue: { fontFamily: "Poppins_700Bold", fontSize: 18, color: Colors.secondary },
  referralLabel: { fontFamily: "Poppins_400Regular", fontSize: 10, color: Colors.textSecondary, marginTop: 2, textAlign: "center" },
  bankCard: { backgroundColor: "#FFF", borderRadius: 16, padding: 16, gap: 12 },
  bankRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  bankLabel: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary, width: 100 },
  bankValue: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: Colors.text, flex: 1 },
  withdrawBtn: { marginHorizontal: 20, marginTop: 28, borderRadius: 16, overflow: "hidden" },
  withdrawBtnGradient: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 16 },
  withdrawBtnText: { fontFamily: "Poppins_700Bold", fontSize: 16, color: "#FFF" },
});

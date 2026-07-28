import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  Alert,
  Modal,
  ActivityIndicator,
  Animated,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import Colors from "@/constants/colors";
import { useApp } from "@/lib/store";
import { getApiUrl } from "@/lib/query-client";
import type { WithdrawalRequest, WithdrawalMethod } from "@/lib/types";

type Period = "today" | "week" | "month";

const periodData = {
  today: { earnings: 847, deliveries: 12, hours: 6.5 },
  week: { earnings: 4230, deliveries: 58, hours: 32 },
  month: { earnings: 18450, deliveries: 245, hours: 142 },
};

const breakdownItems = [
  { label: "Base Pay", amount: 12000, icon: "cash-outline" as const },
  { label: "Distance Pay", amount: 3450, icon: "navigate-outline" as const },
  { label: "Peak Hour Bonus", amount: 1800, icon: "time-outline" as const },
  { label: "Tips", amount: 1200, icon: "heart-outline" as const },
];

const bankDetails = {
  bankName: "HDFC Bank",
  accountNumber: "XXXX7832",
  ifsc: "HDFC0001234",
  upiId: "amit@hdfc",
};

export default function DeliveryEarningsScreen() {
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;
  const { user } = useApp();
  const [activePeriod, setActivePeriod] = useState<Period>("today");
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState<WithdrawalMethod>("UPI");
  const [withdrawing, setWithdrawing] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [totalWithdrawn, setTotalWithdrawn] = useState(0);
  const [pendingAmount, setPendingAmount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [successAnim] = useState(new Animated.Value(0));

  const currentData = periodData[activePeriod];
  const availableBalance = periodData.month.earnings - totalWithdrawn - pendingAmount;
  const withdrawableAmount = Math.max(0, availableBalance);

  const fetchWithdrawals = useCallback(async () => {
    try {
      const userId = user?.id || "tm2";
      const baseUrl = getApiUrl();
      const res = await fetch(new URL(`/api/withdrawals/${userId}`, baseUrl).toString());
      const data = await res.json();
      setWithdrawals(data.withdrawals || []);
      setTotalWithdrawn(data.totalWithdrawn || 0);
      setPendingAmount(data.pendingAmount || 0);
    } catch (e) {
      console.error("Failed to fetch withdrawals:", e);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchWithdrawals();
  }, [fetchWithdrawals]);

  const handlePeriodChange = (period: Period) => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
    setActivePeriod(period);
  };

  const handleWithdrawPress = () => {
    if (withdrawableAmount < 100) {
      Alert.alert("Insufficient Balance", "Minimum withdrawal amount is \u20B9100. Keep delivering to earn more!");
      return;
    }
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
    setShowWithdrawModal(true);
  };

  const handleConfirmWithdraw = async () => {
    setWithdrawing(true);
    try {
      const baseUrl = getApiUrl();
      const res = await fetch(new URL("/api/withdrawals/request", baseUrl).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user?.id || "tm2",
          userName: user?.name || "Delivery Partner",
          userRole: "DELIVERY",
          amount: withdrawableAmount,
          method: selectedMethod,
          bankDetails,
        }),
      });
      const data = await res.json();
      if (data.success) {
        try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
        setShowWithdrawModal(false);
        setShowSuccess(true);
        Animated.spring(successAnim, { toValue: 1, useNativeDriver: true, tension: 50, friction: 7 }).start();
        setTimeout(() => {
          Animated.timing(successAnim, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => {
            setShowSuccess(false);
            successAnim.setValue(0);
          });
        }, 3000);
        fetchWithdrawals();
      } else {
        Alert.alert("Error", data.error || "Failed to process withdrawal");
      }
    } catch (e) {
      Alert.alert("Error", "Network error. Please try again.");
    } finally {
      setWithdrawing(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "COMPLETED": return Colors.success;
      case "PROCESSING": return Colors.info;
      case "PENDING": return Colors.warning;
      case "REJECTED": return Colors.error;
      default: return Colors.textSecondary;
    }
  };

  const avgPerDelivery = currentData.deliveries > 0 ? (currentData.earnings / currentData.deliveries).toFixed(2) : "0";

  return (
    <View style={styles.container}>
      <LinearGradient colors={["#0B1E3D", "#142F5E"]} style={[styles.header, { paddingTop: topInset + 12 }]}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="arrow-back" size={24} color="#FFF" />
          </Pressable>
          <Text style={styles.headerTitle}>My Earnings</Text>
          <View style={{ width: 24 }} />
        </View>
      </LinearGradient>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{ paddingBottom: bottomInset + 100 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.summaryCard}>
          <LinearGradient
            colors={[Colors.success, "#059669"]}
            style={styles.summaryGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <Text style={styles.summaryLabel}>Today's Earnings</Text>
            <Text style={styles.summaryAmount}>{"\u20B9"}{periodData.today.earnings.toLocaleString("en-IN")}</Text>
            <View style={styles.summaryStats}>
              <View style={styles.statItem}>
                <Ionicons name="bicycle-outline" size={18} color="rgba(255,255,255,0.85)" />
                <Text style={styles.statValue}>{periodData.today.deliveries}</Text>
                <Text style={styles.statLabel}>Deliveries</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Ionicons name="time-outline" size={18} color="rgba(255,255,255,0.85)" />
                <Text style={styles.statValue}>{periodData.today.hours} hrs</Text>
                <Text style={styles.statLabel}>Online</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Ionicons name="trending-up-outline" size={18} color="rgba(255,255,255,0.85)" />
                <Text style={styles.statValue}>{"\u20B9"}{(periodData.today.earnings / periodData.today.deliveries).toFixed(2)}</Text>
                <Text style={styles.statLabel}>Avg/Delivery</Text>
              </View>
            </View>
          </LinearGradient>
        </View>

        <View style={styles.periodTabs}>
          {(["today", "week", "month"] as Period[]).map((period) => (
            <Pressable
              key={period}
              style={[styles.periodTab, activePeriod === period && styles.periodTabActive]}
              onPress={() => handlePeriodChange(period)}
            >
              <Text style={[styles.periodTabText, activePeriod === period && styles.periodTabTextActive]}>
                {period === "today" ? "Today" : period === "week" ? "This Week" : "This Month"}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.periodSummary}>
          <View style={styles.periodSummaryItem}>
            <Text style={styles.periodSummaryValue}>{"\u20B9"}{currentData.earnings.toLocaleString("en-IN")}</Text>
            <Text style={styles.periodSummaryLabel}>Earnings</Text>
          </View>
          <View style={styles.periodSummaryDivider} />
          <View style={styles.periodSummaryItem}>
            <Text style={styles.periodSummaryValue}>{currentData.deliveries}</Text>
            <Text style={styles.periodSummaryLabel}>Deliveries</Text>
          </View>
          <View style={styles.periodSummaryDivider} />
          <View style={styles.periodSummaryItem}>
            <Text style={styles.periodSummaryValue}>{"\u20B9"}{avgPerDelivery}</Text>
            <Text style={styles.periodSummaryLabel}>Avg/Order</Text>
          </View>
        </View>

        <View style={styles.balanceCard}>
          <View style={styles.balanceRow}>
            <View style={styles.balanceItem}>
              <Text style={styles.balanceLabel}>Available</Text>
              <Text style={[styles.balanceValue, { color: Colors.success }]}>{"\u20B9"}{withdrawableAmount.toLocaleString("en-IN")}</Text>
            </View>
            <View style={styles.balanceDivider} />
            <View style={styles.balanceItem}>
              <Text style={styles.balanceLabel}>Withdrawn</Text>
              <Text style={styles.balanceValue}>{"\u20B9"}{totalWithdrawn.toLocaleString("en-IN")}</Text>
            </View>
            <View style={styles.balanceDivider} />
            <View style={styles.balanceItem}>
              <Text style={styles.balanceLabel}>Pending</Text>
              <Text style={[styles.balanceValue, { color: Colors.warning }]}>{"\u20B9"}{pendingAmount.toLocaleString("en-IN")}</Text>
            </View>
          </View>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Earnings Breakdown</Text>
          {breakdownItems.map((item, index) => (
            <View key={index} style={styles.breakdownRow}>
              <View style={styles.breakdownIconWrap}>
                <Ionicons name={item.icon} size={18} color={Colors.primary} />
              </View>
              <Text style={styles.breakdownLabel}>{item.label}</Text>
              <Text style={styles.breakdownAmount}>{"\u20B9"}{item.amount.toLocaleString("en-IN")}</Text>
            </View>
          ))}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalAmount}>{"\u20B9"}{periodData.month.earnings.toLocaleString("en-IN")}</Text>
          </View>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Incentives & Bonuses</Text>
          <View style={styles.incentiveItem}>
            <View style={styles.incentiveHeader}>
              <MaterialCommunityIcons name="crosshairs" size={20} color={Colors.primary} />
              <View style={styles.incentiveTextWrap}>
                <Text style={styles.incentiveTitle}>Complete 15 deliveries today</Text>
                <Text style={styles.incentiveReward}>Earn {"\u20B9"}200 extra</Text>
              </View>
              <Text style={styles.incentiveProgress}>12/15</Text>
            </View>
            <View style={styles.progressBarBg}>
              <View style={[styles.progressBarFill, { width: "80%" }]} />
            </View>
          </View>
          <View style={styles.incentiveItem}>
            <View style={styles.incentiveHeader}>
              <MaterialCommunityIcons name="fire" size={20} color={Colors.warning} />
              <View style={styles.incentiveTextWrap}>
                <Text style={styles.incentiveTitle}>Weekend warrior</Text>
                <Text style={styles.incentiveReward}>30 deliveries = {"\u20B9"}500 bonus</Text>
              </View>
              <Text style={styles.incentiveProgress}>18/30</Text>
            </View>
            <View style={styles.progressBarBg}>
              <View style={[styles.progressBarFill, { width: "60%", backgroundColor: Colors.warning }]} />
            </View>
          </View>
          <View style={styles.incentiveItem}>
            <View style={styles.incentiveHeader}>
              <Ionicons name="star" size={20} color={Colors.info} />
              <View style={styles.incentiveTextWrap}>
                <Text style={styles.incentiveTitle}>Perfect rating bonus</Text>
                <Text style={styles.incentiveReward}>{"\u20B9"}100/week for 4.8+ rating</Text>
              </View>
              <Ionicons name="checkmark-circle" size={20} color={Colors.success} />
            </View>
          </View>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Bank Account</Text>
          <View style={styles.bankRow}>
            <View style={styles.bankIconWrap}>
              <MaterialCommunityIcons name="bank" size={22} color={Colors.secondary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.bankName}>{bankDetails.bankName}</Text>
              <Text style={styles.bankAccount}>Account: {bankDetails.accountNumber}</Text>
              <Text style={styles.bankUpi}>UPI: {bankDetails.upiId}</Text>
            </View>
            <Ionicons name="checkmark-circle" size={22} color={Colors.success} />
          </View>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Withdrawal History</Text>
          {loading ? (
            <ActivityIndicator size="small" color={Colors.primary} style={{ padding: 20 }} />
          ) : withdrawals.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="wallet-outline" size={36} color={Colors.textLight} />
              <Text style={styles.emptyText}>No withdrawals yet</Text>
            </View>
          ) : (
            withdrawals.map((wd) => (
              <View key={wd.id} style={styles.payoutRow}>
                <View style={[styles.payoutIconWrap, { backgroundColor: wd.method === "UPI" ? Colors.info + "15" : Colors.success + "15" }]}>
                  <MaterialCommunityIcons
                    name={wd.method === "UPI" ? "cellphone" : "bank-transfer"}
                    size={18}
                    color={wd.method === "UPI" ? Colors.info : Colors.success}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.payoutDate}>{formatDate(wd.createdAt)}</Text>
                  <Text style={styles.payoutMethod}>
                    {wd.method === "UPI" ? `UPI - ${wd.bankDetails.upiId || ""}` : `Bank - ${wd.bankDetails.accountNumber}`}
                  </Text>
                  {wd.transactionId && <Text style={styles.txnId}>ID: {wd.transactionId}</Text>}
                </View>
                <View style={{ alignItems: "flex-end" as const }}>
                  <Text style={styles.payoutAmount}>{"\u20B9"}{wd.amount.toLocaleString("en-IN")}</Text>
                  <View style={[styles.statusBadge, { backgroundColor: getStatusColor(wd.status) + "15" }]}>
                    <View style={[styles.statusDot, { backgroundColor: getStatusColor(wd.status) }]} />
                    <Text style={[styles.payoutStatus, { color: getStatusColor(wd.status) }]}>
                      {wd.status === "COMPLETED" ? "Done" : wd.status === "PROCESSING" ? "Processing" : wd.status === "PENDING" ? "Pending" : "Rejected"}
                    </Text>
                  </View>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      <View style={[styles.bottomBar, { paddingBottom: bottomInset + 12 }]}>
        <Pressable style={styles.withdrawButton} onPress={handleWithdrawPress}>
          <LinearGradient
            colors={withdrawableAmount >= 100 ? [Colors.success, "#059669"] : ["#999", "#777"]}
            style={styles.withdrawGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            <MaterialCommunityIcons name="bank-transfer-out" size={22} color="#FFF" />
            <Text style={styles.withdrawText}>Withdraw {"\u20B9"}{withdrawableAmount.toLocaleString("en-IN")}</Text>
          </LinearGradient>
        </Pressable>
        <View style={styles.withdrawHints}>
          <Text style={styles.withdrawHint}>Instant UPI or Next-day Bank Transfer</Text>
        </View>
      </View>

      <Modal visible={showWithdrawModal} transparent animationType="slide" onRequestClose={() => setShowWithdrawModal(false)}>
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={() => !withdrawing && setShowWithdrawModal(false)} />
          <View style={[styles.modalContent, { paddingBottom: bottomInset + 20 }]}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Withdraw Earnings</Text>
            <Text style={styles.modalSubtitle}>Choose how you want to receive your money</Text>

            <View style={styles.modalAmountCard}>
              <Text style={styles.modalAmountLabel}>Withdrawal Amount</Text>
              <Text style={styles.modalAmount}>{"\u20B9"}{withdrawableAmount.toLocaleString("en-IN")}</Text>
            </View>

            <Text style={styles.methodLabel}>Select Method</Text>

            <Pressable
              style={[styles.methodOption, selectedMethod === "UPI" && styles.methodOptionActive]}
              onPress={() => { try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {} setSelectedMethod("UPI"); }}
            >
              <View style={[styles.methodIconWrap, { backgroundColor: Colors.info + "15" }]}>
                <MaterialCommunityIcons name="cellphone" size={24} color={Colors.info} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.methodName}>Instant UPI Transfer</Text>
                <Text style={styles.methodDesc}>Credited within seconds to {bankDetails.upiId}</Text>
              </View>
              <View style={[styles.methodRadio, selectedMethod === "UPI" && styles.methodRadioActive]}>
                {selectedMethod === "UPI" && <View style={styles.methodRadioDot} />}
              </View>
            </Pressable>

            <Pressable
              style={[styles.methodOption, selectedMethod === "BANK" && styles.methodOptionActive]}
              onPress={() => { try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {} setSelectedMethod("BANK"); }}
            >
              <View style={[styles.methodIconWrap, { backgroundColor: Colors.success + "15" }]}>
                <MaterialCommunityIcons name="bank" size={24} color={Colors.success} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.methodName}>Bank Transfer (NEFT/IMPS)</Text>
                <Text style={styles.methodDesc}>Credited by next business day to {bankDetails.accountNumber}</Text>
              </View>
              <View style={[styles.methodRadio, selectedMethod === "BANK" && styles.methodRadioActive]}>
                {selectedMethod === "BANK" && <View style={styles.methodRadioDot} />}
              </View>
            </Pressable>

            <View style={styles.infoRow}>
              <Ionicons name="information-circle" size={16} color={Colors.info} />
              <Text style={styles.infoText}>
                {selectedMethod === "UPI"
                  ? "UPI transfers are instant and free. Amount will be credited to your UPI ID immediately."
                  : "Bank transfers are processed within 1 business day. No charges applied."}
              </Text>
            </View>

            <View style={styles.modalActions}>
              <Pressable
                style={styles.cancelButton}
                onPress={() => !withdrawing && setShowWithdrawModal(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.confirmButton} onPress={handleConfirmWithdraw} disabled={withdrawing}>
                <LinearGradient
                  colors={[Colors.success, "#059669"]}
                  style={styles.confirmGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  {withdrawing ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <>
                      <Ionicons name="checkmark-circle" size={20} color="#FFF" />
                      <Text style={styles.confirmButtonText}>Confirm Withdrawal</Text>
                    </>
                  )}
                </LinearGradient>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {showSuccess && (
        <View style={styles.successOverlay}>
          <Animated.View style={[styles.successCard, { opacity: successAnim, transform: [{ scale: successAnim.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) }] }]}>
            <View style={styles.successIconWrap}>
              <Ionicons name="checkmark-circle" size={60} color={Colors.success} />
            </View>
            <Text style={styles.successTitle}>Withdrawal Requested!</Text>
            <Text style={styles.successAmount}>{"\u20B9"}{withdrawableAmount.toLocaleString("en-IN")}</Text>
            <Text style={styles.successDesc}>
              {selectedMethod === "UPI"
                ? `Amount will be credited to ${bankDetails.upiId} instantly`
                : `Amount will be credited to ${bankDetails.accountNumber} by next business day`}
            </Text>
            <View style={styles.successStatusRow}>
              <View style={[styles.successStep, { backgroundColor: Colors.success + "15" }]}>
                <Ionicons name="checkmark" size={14} color={Colors.success} />
                <Text style={[styles.successStepText, { color: Colors.success }]}>Requested</Text>
              </View>
              <View style={styles.successStepLine} />
              <View style={[styles.successStep, { backgroundColor: Colors.warning + "15" }]}>
                <Ionicons name="time" size={14} color={Colors.warning} />
                <Text style={[styles.successStepText, { color: Colors.warning }]}>Processing</Text>
              </View>
              <View style={styles.successStepLine} />
              <View style={[styles.successStep, { backgroundColor: Colors.borderLight }]}>
                <Ionicons name="wallet" size={14} color={Colors.textLight} />
                <Text style={[styles.successStepText, { color: Colors.textLight }]}>Credited</Text>
              </View>
            </View>
          </Animated.View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { paddingHorizontal: 20, paddingBottom: 16 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerTitle: { fontFamily: "Poppins_700Bold", fontSize: 20, color: "#FFF" },
  scrollView: { flex: 1 },
  summaryCard: { margin: 16, borderRadius: 20, overflow: "hidden", elevation: 6, shadowColor: Colors.success, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12 },
  summaryGradient: { padding: 24, alignItems: "center" },
  summaryLabel: { fontFamily: "Poppins_500Medium", fontSize: 14, color: "rgba(255,255,255,0.85)" },
  summaryAmount: { fontFamily: "Poppins_700Bold", fontSize: 42, color: "#FFF", marginTop: 2 },
  summaryStats: { flexDirection: "row", marginTop: 18, alignItems: "center" },
  statItem: { alignItems: "center", flex: 1 },
  statValue: { fontFamily: "Poppins_700Bold", fontSize: 16, color: "#FFF", marginTop: 4 },
  statLabel: { fontFamily: "Poppins_400Regular", fontSize: 11, color: "rgba(255,255,255,0.7)", marginTop: 1 },
  statDivider: { width: 1, height: 36, backgroundColor: "rgba(255,255,255,0.25)" },
  periodTabs: { flexDirection: "row", marginHorizontal: 16, backgroundColor: "#FFF", borderRadius: 14, padding: 4 },
  periodTab: { flex: 1, paddingVertical: 10, alignItems: "center", borderRadius: 11 },
  periodTabActive: { backgroundColor: Colors.secondary },
  periodTabText: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: Colors.textSecondary },
  periodTabTextActive: { color: "#FFF" },
  periodSummary: { flexDirection: "row", marginHorizontal: 16, marginTop: 12, backgroundColor: "#FFF", borderRadius: 16, padding: 18 },
  periodSummaryItem: { flex: 1, alignItems: "center" },
  periodSummaryValue: { fontFamily: "Poppins_700Bold", fontSize: 20, color: Colors.secondary },
  periodSummaryLabel: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  periodSummaryDivider: { width: 1, height: 40, backgroundColor: Colors.border, alignSelf: "center" },
  balanceCard: { marginHorizontal: 16, marginTop: 12, backgroundColor: "#FFF", borderRadius: 16, padding: 16 },
  balanceRow: { flexDirection: "row" },
  balanceItem: { flex: 1, alignItems: "center" },
  balanceLabel: { fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textSecondary },
  balanceValue: { fontFamily: "Poppins_700Bold", fontSize: 16, color: Colors.secondary, marginTop: 2 },
  balanceDivider: { width: 1, height: 32, backgroundColor: Colors.border, alignSelf: "center" },
  sectionCard: { marginHorizontal: 16, marginTop: 16, backgroundColor: "#FFF", borderRadius: 18, padding: 18 },
  sectionTitle: { fontFamily: "Poppins_700Bold", fontSize: 16, color: Colors.secondary, marginBottom: 14 },
  breakdownRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  breakdownIconWrap: { width: 34, height: 34, borderRadius: 9, backgroundColor: Colors.primary + "12", alignItems: "center", justifyContent: "center", marginRight: 12 },
  breakdownLabel: { flex: 1, fontFamily: "Poppins_500Medium", fontSize: 14, color: Colors.text },
  breakdownAmount: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: Colors.text },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingTop: 14, marginTop: 4 },
  totalLabel: { fontFamily: "Poppins_700Bold", fontSize: 15, color: Colors.secondary },
  totalAmount: { fontFamily: "Poppins_700Bold", fontSize: 18, color: Colors.success },
  incentiveItem: { marginBottom: 16 },
  incentiveHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  incentiveTextWrap: { flex: 1 },
  incentiveTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: Colors.text },
  incentiveReward: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary },
  incentiveProgress: { fontFamily: "Poppins_700Bold", fontSize: 13, color: Colors.secondary },
  progressBarBg: { height: 6, backgroundColor: Colors.borderLight, borderRadius: 3, marginTop: 8, overflow: "hidden" },
  progressBarFill: { height: 6, backgroundColor: Colors.primary, borderRadius: 3 },
  bankRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  bankIconWrap: { width: 44, height: 44, borderRadius: 12, backgroundColor: Colors.secondary + "10", alignItems: "center", justifyContent: "center" },
  bankName: { fontFamily: "Poppins_700Bold", fontSize: 15, color: Colors.text },
  bankAccount: { fontFamily: "Poppins_400Regular", fontSize: 13, color: Colors.textSecondary, marginTop: 1 },
  bankUpi: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary },
  payoutRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.borderLight, gap: 12 },
  payoutIconWrap: { width: 38, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  payoutDate: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: Colors.text },
  payoutMethod: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary },
  txnId: { fontFamily: "Poppins_400Regular", fontSize: 10, color: Colors.textLight, marginTop: 1 },
  payoutAmount: { fontFamily: "Poppins_700Bold", fontSize: 14, color: Colors.secondary },
  statusBadge: { flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, marginTop: 3, gap: 4 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  payoutStatus: { fontFamily: "Poppins_500Medium", fontSize: 10 },
  emptyState: { alignItems: "center", padding: 30 },
  emptyText: { fontFamily: "Poppins_500Medium", fontSize: 14, color: Colors.textSecondary, marginTop: 10 },
  bottomBar: { backgroundColor: "#FFF", paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.borderLight },
  withdrawButton: { borderRadius: 14, overflow: "hidden" },
  withdrawGradient: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 15, gap: 10 },
  withdrawText: { fontFamily: "Poppins_700Bold", fontSize: 17, color: "#FFF" },
  withdrawHints: { alignItems: "center", marginTop: 8 },
  withdrawHint: { fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textSecondary },

  modalOverlay: { flex: 1, justifyContent: "flex-end" },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.5)" },
  modalContent: { backgroundColor: "#FFF", borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 12 },
  modalHandle: { width: 40, height: 4, backgroundColor: Colors.border, borderRadius: 2, alignSelf: "center", marginBottom: 16 },
  modalTitle: { fontFamily: "Poppins_700Bold", fontSize: 20, color: Colors.secondary, textAlign: "center" },
  modalSubtitle: { fontFamily: "Poppins_400Regular", fontSize: 13, color: Colors.textSecondary, textAlign: "center", marginTop: 4, marginBottom: 16 },
  modalAmountCard: { backgroundColor: Colors.success + "10", borderRadius: 16, padding: 16, alignItems: "center", marginBottom: 20 },
  modalAmountLabel: { fontFamily: "Poppins_500Medium", fontSize: 12, color: Colors.textSecondary },
  modalAmount: { fontFamily: "Poppins_700Bold", fontSize: 32, color: Colors.success, marginTop: 2 },
  methodLabel: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: Colors.text, marginBottom: 10 },
  methodOption: { flexDirection: "row", alignItems: "center", padding: 14, borderRadius: 14, borderWidth: 1.5, borderColor: Colors.border, marginBottom: 10, gap: 12 },
  methodOptionActive: { borderColor: Colors.success, backgroundColor: Colors.success + "06" },
  methodIconWrap: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  methodName: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: Colors.text },
  methodDesc: { fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  methodRadio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: Colors.border, alignItems: "center", justifyContent: "center" },
  methodRadioActive: { borderColor: Colors.success },
  methodRadioDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: Colors.success },
  infoRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: Colors.info + "08", padding: 12, borderRadius: 10, marginTop: 4, marginBottom: 16 },
  infoText: { flex: 1, fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary, lineHeight: 18 },
  modalActions: { flexDirection: "row", gap: 12 },
  cancelButton: { flex: 1, paddingVertical: 14, borderRadius: 14, borderWidth: 1.5, borderColor: Colors.border, alignItems: "center" },
  cancelButtonText: { fontFamily: "Poppins_600SemiBold", fontSize: 15, color: Colors.textSecondary },
  confirmButton: { flex: 2, borderRadius: 14, overflow: "hidden" },
  confirmGradient: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 14, gap: 8 },
  confirmButtonText: { fontFamily: "Poppins_700Bold", fontSize: 15, color: "#FFF" },

  successOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", zIndex: 999 },
  successCard: { backgroundColor: "#FFF", borderRadius: 24, padding: 28, marginHorizontal: 30, alignItems: "center", width: "85%" },
  successIconWrap: { marginBottom: 12 },
  successTitle: { fontFamily: "Poppins_700Bold", fontSize: 20, color: Colors.secondary },
  successAmount: { fontFamily: "Poppins_700Bold", fontSize: 36, color: Colors.success, marginTop: 4 },
  successDesc: { fontFamily: "Poppins_400Regular", fontSize: 13, color: Colors.textSecondary, textAlign: "center", marginTop: 8, lineHeight: 20 },
  successStatusRow: { flexDirection: "row", alignItems: "center", marginTop: 20, gap: 4 },
  successStep: { flexDirection: "row", alignItems: "center", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, gap: 4 },
  successStepText: { fontFamily: "Poppins_500Medium", fontSize: 10 },
  successStepLine: { width: 12, height: 2, backgroundColor: Colors.border },
});

import React, { useState } from "react";
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
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import Colors from "@/constants/colors";
import { generateInvoice } from "@/lib/invoiceUtils";
import { Invoice } from "@/lib/types";
import InvoiceView from "@/components/InvoiceView";
import { useApp } from "@/lib/store";

type Settlement = { id: string; amount: number; date: string; status: "Completed" | "Processing" | "Pending" };

const statusColors: Record<string, { bg: string; text: string }> = {
  Completed: { bg: Colors.success + "18", text: Colors.success },
  Processing: { bg: Colors.info + "18", text: Colors.info },
  Pending: { bg: Colors.warning + "18", text: Colors.warning },
};

function getNextMonday(): string {
  const today = new Date();
  const day = today.getDay();
  const daysUntilMonday = day === 1 ? 7 : (8 - day) % 7 || 7;
  const nextMonday = new Date(today);
  nextMonday.setDate(today.getDate() + daysUntilMonday);
  return nextMonday.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function maskBankAccount(account: string): string {
  if (!account || account.length < 4) return account || "—";
  return "XXXX XXXX " + account.slice(-4);
}

export default function VendorPayoutsScreen() {
  const { user, getInvoiceByRef, addInvoice: storeAddInvoice } = useApp();
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;
  const [withdrawing, setWithdrawing] = useState(false);
  const [invoiceModalVisible, setInvoiceModalVisible] = useState(false);
  const [currentInvoice, setCurrentInvoice] = useState<Invoice | null>(null);

  const { data: vendorAppData, isLoading } = useQuery<{ application: any }>({
    queryKey: ["/api/vendor-applications/mine"],
  });
  const vendorApp = vendorAppData?.application || null;

  const { data: walletData } = useQuery<{ balance: number; thisMonth: number; transactions: any[] }>({
    queryKey: ["/api/vendor/wallet"],
  });
  const vendorWalletBalance = walletData?.balance ?? 0;
  const vendorThisMonth = walletData?.thisMonth ?? 0;
  const vendorWalletTxns = walletData?.transactions ?? [];

  // Go Bharat Coins earned from coin-paid sales
  const { data: coinData } = useQuery<{ balance: number; transactions: any[] }>({
    queryKey: ["/api/coins/balance"],
  });
  const vendorCoinBalance = coinData?.balance ?? 0;
  const vendorCoinTxns = (coinData?.transactions ?? []).filter((t: any) => t.type === "EARNED");

  const commissionRate: number = vendorApp?.commissionRate ?? 10;
  const gstOnCommission = 18;
  const totalDeduction = commissionRate * (1 + gstOnCommission / 100);
  const netEarningsRate = Math.max(0, 100 - totalDeduction);

  const ownerName = vendorApp?.ownerName || user?.name || "—";
  const bankAccount = vendorApp?.bankAccount || "";
  const ifscCode = vendorApp?.ifscCode || "—";
  const nextMonday = getNextMonday();

  const handleViewPayoutReceipt = (settlement: Settlement) => {
    try { Haptics.selectionAsync(); } catch {}
    const existing = getInvoiceByRef(settlement.id);
    if (existing) {
      setCurrentInvoice(existing);
      setInvoiceModalVisible(true);
      return;
    }
    const grossAmount = settlement.amount;
    const commissionAmount = Math.round(grossAmount * (commissionRate / 100));
    const netSettlement = grossAmount - commissionAmount;
    const invoice = generateInvoice({
      type: "PAYOUT",
      referenceId: settlement.id,
      toName: ownerName,
      toPhone: vendorApp?.phone || user?.phone || "",
      toAddress: vendorApp?.address || "",
      toGSTIN: vendorApp?.gstNumber || "",
      paymentMethod: `Bank Transfer (${ifscCode})`,
      rawItems: [
        { description: `Vendor Payout - Net Settlement (Gross: \u20B9${grossAmount.toLocaleString("en-IN")}, Commission: \u20B9${commissionAmount.toLocaleString("en-IN")})`, hsnSac: "998599", qty: 1, rate: netSettlement },
      ],
      notes: `Gross Sales: \u20B9${grossAmount.toLocaleString("en-IN")} | Commission (${commissionRate}%): \u20B9${commissionAmount.toLocaleString("en-IN")} | Net Payout: \u20B9${netSettlement.toLocaleString("en-IN")} | Settlement: ${settlement.date}`,
    });
    storeAddInvoice(invoice);
    setCurrentInvoice(invoice);
    setInvoiceModalVisible(true);
  };

  const handleBack = () => {
    try { Haptics.selectionAsync(); } catch {}
    router.back();
  };

  const handleChangeBankAccount = () => {
    try { Haptics.selectionAsync(); } catch {}
    Alert.alert(
      "Change Bank Account",
      "To update your bank account details, please contact support or visit Settings > Bank Details.",
      [{ text: "OK" }]
    );
  };

  const handleWithdraw = () => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
    Alert.alert(
      "No Balance Available",
      "You have no pending balance available for withdrawal at this time.",
      [{ text: "OK" }]
    );
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={["#0B1E3D", "#142F5E"]}
        style={[styles.header, { paddingTop: topInset + 12 }]}
      >
        <View style={styles.headerRow}>
          <Pressable onPress={handleBack} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color="#FFF" />
          </Pressable>
          <Text style={styles.headerTitle}>Earnings & Payouts</Text>
          <View style={{ width: 40 }} />
        </View>
      </LinearGradient>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={{ paddingBottom: bottomInset + 80 }}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.earningsCard}>
            <LinearGradient
              colors={["#0B1E3D", "#1A3A6B"]}
              style={styles.earningsGradient}
            >
              <Text style={styles.earningsLabel}>Total Earnings (Coins)</Text>
              <Text style={styles.earningsAmount}>₹{vendorWalletBalance.toLocaleString("en-IN")}</Text>
              <View style={styles.earningsGrid}>
                <View style={styles.earningsItem}>
                  <View style={[styles.earningsIconBg, { backgroundColor: "rgba(16,185,129,0.2)" }]}>
                    <Ionicons name="trending-up" size={18} color="#10B981" />
                  </View>
                  <View>
                    <Text style={styles.earningsItemLabel}>This Month</Text>
                    <Text style={styles.earningsItemValue}>₹{vendorThisMonth.toLocaleString("en-IN")}</Text>
                  </View>
                </View>
                <View style={styles.earningsItem}>
                  <View style={[styles.earningsIconBg, { backgroundColor: "rgba(245,158,11,0.2)" }]}>
                    <Ionicons name="diamond" size={18} color="#F59E0B" />
                  </View>
                  <View>
                    <Text style={styles.earningsItemLabel}>Transactions</Text>
                    <Text style={styles.earningsItemValue}>{vendorWalletTxns.length}</Text>
                  </View>
                </View>
                <View style={styles.earningsItem}>
                  <View style={[styles.earningsIconBg, { backgroundColor: "rgba(59,130,246,0.2)" }]}>
                    <Ionicons name="checkmark-circle-outline" size={18} color="#3B82F6" />
                  </View>
                  <View>
                    <Text style={styles.earningsItemLabel}>Last Payout</Text>
                    <Text style={styles.earningsItemValue}>₹0</Text>
                  </View>
                </View>
                <View style={styles.earningsItem}>
                  <View style={[styles.earningsIconBg, { backgroundColor: "rgba(255,255,255,0.12)" }]}>
                    <Ionicons name="calendar-outline" size={18} color="rgba(255,255,255,0.7)" />
                  </View>
                  <View>
                    <Text style={styles.earningsItemLabel}>Next Payout</Text>
                    <Text style={styles.earningsItemValue}>{nextMonday.split(" ").slice(0, 2).join(" ")}</Text>
                  </View>
                </View>
              </View>
            </LinearGradient>
          </View>

          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <MaterialCommunityIcons name="chart-pie" size={20} color={Colors.primary} />
              <Text style={styles.cardTitle}>Commission Breakdown</Text>
            </View>
            <View style={styles.commissionRow}>
              <Text style={styles.commissionLabel}>Platform Commission</Text>
              <Text style={styles.commissionValue}>{commissionRate}%</Text>
            </View>
            <View style={styles.commissionRow}>
              <Text style={styles.commissionLabel}>GST on Commission</Text>
              <Text style={styles.commissionValue}>18% of commission</Text>
            </View>
            <View style={[styles.commissionRow, { borderBottomWidth: 0 }]}>
              <Text style={styles.commissionLabel}>Net Earnings Rate</Text>
              <Text style={[styles.commissionValue, { color: Colors.success, fontFamily: "Poppins_700Bold" }]}>~{netEarningsRate.toFixed(2)}%</Text>
            </View>
            <View style={styles.progressBarContainer}>
              <View style={styles.progressBarTrack}>
                <View style={[styles.progressBarFill, { width: `${netEarningsRate.toFixed(2)}%` as any, backgroundColor: Colors.success }]} />
                <View style={[styles.progressBarFill, { width: `${totalDeduction.toFixed(2)}%` as any, backgroundColor: Colors.primary, position: "absolute", right: 0 }]} />
              </View>
              <View style={styles.progressLegend}>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: Colors.success }]} />
                  <Text style={styles.legendText}>Your Earnings ({netEarningsRate.toFixed(2)}%)</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: Colors.primary }]} />
                  <Text style={styles.legendText}>Commission + GST ({totalDeduction.toFixed(2)}%)</Text>
                </View>
              </View>
            </View>
          </View>

          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="calendar" size={20} color={Colors.info} />
              <Text style={styles.cardTitle}>Payout Schedule</Text>
            </View>
            <View style={styles.scheduleRow}>
              <View style={styles.scheduleIconWrap}>
                <Ionicons name="repeat" size={18} color={Colors.info} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.scheduleLabel}>Settlement Cycle</Text>
                <Text style={styles.scheduleValue}>Weekly (Every Monday)</Text>
              </View>
            </View>
            <View style={styles.scheduleRow}>
              <View style={styles.scheduleIconWrap}>
                <Ionicons name="wallet-outline" size={18} color={Colors.warning} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.scheduleLabel}>Minimum Payout</Text>
                <Text style={styles.scheduleValue}>₹500</Text>
              </View>
            </View>
            <View style={[styles.scheduleRow, { borderBottomWidth: 0 }]}>
              <View style={styles.scheduleIconWrap}>
                <Ionicons name="arrow-forward-circle-outline" size={18} color={Colors.success} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.scheduleLabel}>Next Settlement</Text>
                <Text style={[styles.scheduleValue, { color: Colors.success }]}>{nextMonday}</Text>
              </View>
            </View>
          </View>

          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <MaterialCommunityIcons name="bank" size={20} color={Colors.secondary} />
              <Text style={styles.cardTitle}>Bank Account Details</Text>
            </View>
            <View style={styles.bankRow}>
              <Text style={styles.bankLabel}>Account Holder</Text>
              <Text style={styles.bankValue}>{ownerName}</Text>
            </View>
            {bankAccount ? (
              <View style={styles.bankRow}>
                <Text style={styles.bankLabel}>Account No.</Text>
                <Text style={styles.bankValue}>{maskBankAccount(bankAccount)}</Text>
              </View>
            ) : null}
            {ifscCode && ifscCode !== "—" ? (
              <View style={styles.bankRow}>
                <Text style={styles.bankLabel}>IFSC Code</Text>
                <Text style={styles.bankValue}>{ifscCode}</Text>
              </View>
            ) : null}
            {vendorApp?.panNumber ? (
              <View style={styles.bankRow}>
                <Text style={styles.bankLabel}>PAN</Text>
                <Text style={styles.bankValue}>{vendorApp.panNumber}</Text>
              </View>
            ) : null}
            {!bankAccount && !vendorApp?.panNumber ? (
              <View style={[styles.bankRow, { borderBottomWidth: 0 }]}>
                <Text style={[styles.bankLabel, { color: Colors.textSecondary, fontStyle: "italic" }]}>No bank details added yet</Text>
              </View>
            ) : null}
            <Pressable style={styles.changeBankBtn} onPress={handleChangeBankAccount}>
              <Ionicons name="swap-horizontal" size={18} color={Colors.info} />
              <Text style={styles.changeBankText}>Change Bank Account</Text>
            </Pressable>
          </View>

          {/* Go Bharat Coins Wallet */}
          <View style={styles.coinBalanceCard}>
            <LinearGradient colors={["#92400E", "#D97706"]} style={styles.coinBalanceGradient}>
              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 4 }}>
                <Ionicons name="diamond" size={20} color="#FDE68A" style={{ marginRight: 8 }} />
                <Text style={{ fontFamily: "Poppins_600SemiBold", fontSize: 14, color: "rgba(255,255,255,0.85)" }}>Go Bharat Coins Earned</Text>
              </View>
              <Text style={{ fontFamily: "Poppins_700Bold", fontSize: 36, color: "#FFF", letterSpacing: -0.5 }}>
                {vendorCoinBalance.toLocaleString("en-IN")}
              </Text>
              <Text style={{ fontFamily: "Poppins_400Regular", fontSize: 12, color: "rgba(255,255,255,0.7)", marginTop: 2 }}>
                1 coin = ₹100 | From customers paying with Go Bharat Coins
              </Text>
            </LinearGradient>
          </View>

          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="diamond" size={20} color="#D97706" />
              <Text style={styles.cardTitle}>Coins Received History</Text>
            </View>
            {vendorCoinTxns.length === 0 ? (
              <View style={{ alignItems: "center", paddingVertical: 24 }}>
                <Ionicons name="diamond-outline" size={36} color={Colors.textSecondary} />
                <Text style={{ color: Colors.textSecondary, marginTop: 8, fontSize: 13, fontFamily: "Poppins_400Regular" }}>No coin payments received yet</Text>
                <Text style={{ color: Colors.textSecondary, marginTop: 4, fontSize: 12, fontFamily: "Poppins_400Regular", textAlign: "center", paddingHorizontal: 16 }}>
                  When customers pay using Go Bharat Coins, the coins will appear here
                </Text>
              </View>
            ) : (
              vendorCoinTxns.slice(0, 20).map((t: any) => (
                <View key={t.id} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.borderLight }}>
                  <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: "#D9770618", alignItems: "center", justifyContent: "center", marginRight: 12 }}>
                    <Ionicons name="diamond" size={18} color="#D97706" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: "Poppins_500Medium", fontSize: 13, color: Colors.text }} numberOfLines={1}>{t.reference || "Coins received"}</Text>
                    <Text style={{ fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textSecondary, marginTop: 2 }}>
                      {t.createdAt ? new Date(t.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—"}
                    </Text>
                  </View>
                  <Text style={{ fontFamily: "Poppins_700Bold", fontSize: 14, color: "#D97706" }}>+{Number(t.amount).toLocaleString("en-IN")} 🔷</Text>
                </View>
              ))
            )}
          </View>
        </ScrollView>
      )}

      <View style={[styles.bottomBar, { paddingBottom: bottomInset + 12 }]}>
        <Pressable
          style={[styles.withdrawBtn, withdrawing && styles.withdrawBtnDisabled]}
          onPress={handleWithdraw}
          disabled={withdrawing}
        >
          <LinearGradient
            colors={withdrawing ? ["#9CA3AF", "#9CA3AF"] : [Colors.success, "#059669"]}
            style={styles.withdrawGradient}
          >
            {withdrawing ? (
              <Text style={styles.withdrawText}>Processing...</Text>
            ) : (
              <>
                <MaterialCommunityIcons name="bank-transfer-out" size={22} color="#FFF" />
                <Text style={styles.withdrawText}>Withdraw Earnings</Text>
              </>
            )}
          </LinearGradient>
        </Pressable>
      </View>

      <Modal visible={invoiceModalVisible} animationType="slide" presentationStyle="pageSheet">
        {currentInvoice && (
          <InvoiceView
            invoice={currentInvoice}
            onClose={() => {
              setInvoiceModalVisible(false);
              setCurrentInvoice(null);
            }}
          />
        )}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 18,
    color: "#FFF",
  },
  scrollView: {
    flex: 1,
  },
  earningsCard: {
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 20,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  earningsGradient: {
    padding: 24,
    borderRadius: 20,
  },
  coinBalanceCard: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 20,
    overflow: "hidden",
    shadowColor: "#92400E",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 6,
  },
  coinBalanceGradient: {
    padding: 20,
    borderRadius: 20,
  },
  earningsLabel: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: "rgba(255,255,255,0.65)",
  },
  earningsAmount: {
    fontFamily: "Poppins_700Bold",
    fontSize: 36,
    color: "#FFF",
    marginTop: 4,
    letterSpacing: 1,
  },
  earningsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 20,
    gap: 12,
  },
  earningsItem: {
    flexDirection: "row",
    alignItems: "center",
    width: "46%",
    gap: 10,
  },
  earningsIconBg: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  earningsItemLabel: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    color: "rgba(255,255,255,0.55)",
  },
  earningsItemValue: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 15,
    color: "#FFF",
  },
  card: {
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: "#FFF",
    borderRadius: 16,
    padding: 18,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
  },
  cardTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 16,
    color: Colors.secondary,
  },
  commissionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  commissionLabel: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
  },
  commissionValue: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
    color: Colors.text,
  },
  progressBarContainer: {
    marginTop: 16,
  },
  progressBarTrack: {
    height: 10,
    backgroundColor: Colors.borderLight,
    borderRadius: 5,
    overflow: "hidden",
    flexDirection: "row",
    position: "relative",
  },
  progressBarFill: {
    height: 10,
    borderRadius: 5,
  },
  progressLegend: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 10,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
  },
  scheduleRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
    gap: 12,
  },
  scheduleIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  scheduleLabel: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
  },
  scheduleValue: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
    color: Colors.text,
  },
  bankRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  bankLabel: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
  },
  bankValue: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 13,
    color: Colors.text,
    flexShrink: 1,
    textAlign: "right",
    marginLeft: 8,
  },
  changeBankBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 14,
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.info + "40",
    backgroundColor: Colors.info + "08",
  },
  changeBankText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
    color: Colors.info,
  },
  settlementRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  settlementId: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 13,
    color: Colors.text,
  },
  settlementDate: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  settlementRight: {
    alignItems: "flex-end",
    gap: 4,
  },
  settlementAmount: {
    fontFamily: "Poppins_700Bold",
    fontSize: 15,
    color: Colors.success,
  },
  statusBadge: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  statusText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 11,
  },
  receiptBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: Colors.info + "12",
    alignItems: "center",
    justifyContent: "center",
  },
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: "rgba(245,246,250,0.95)",
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  withdrawBtn: {
    borderRadius: 14,
    overflow: "hidden",
  },
  withdrawBtnDisabled: {
    opacity: 0.7,
  },
  withdrawGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 16,
    borderRadius: 14,
  },
  withdrawText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 17,
    color: "#FFF",
  },
});

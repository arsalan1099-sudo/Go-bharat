import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Modal,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { getApiUrl, getAuthToken } from "@/lib/query-client";
import { generateInvoice } from "@/lib/invoiceUtils";
import { Invoice } from "@/lib/types";
import InvoiceView from "@/components/InvoiceView";
import { useApp } from "@/lib/store";

interface PaymentTransaction {
  id: string;
  orderId: string;
  amount: number;
  status: string;
  method: string;
  razorpayOrderId: string;
  createdAt: string;
}

const gatewayHealth = [
  { label: "Razorpay", status: "Online", ok: true },
  { label: "UPI", status: "Online", ok: true },
  { label: "Net Banking", status: "Online", ok: true },
  { label: "Wallet", status: "Online", ok: true },
];

const statusColor = (status: string) => {
  switch (status.toLowerCase()) {
    case "completed":
    case "succeeded": return Colors.success;
    case "processing":
    case "pending": return Colors.info;
    case "failed":
    case "canceled": return Colors.error;
    case "refunded": return "#F97316";
    default: return Colors.textSecondary;
  }
};

const typeIcon = (type: string): "card" | "return-down-back" | "swap-horizontal" | "trending-up" => {
  switch (type) {
    case "Payment": return "card";
    case "Refund": return "return-down-back";
    case "Settlement": return "swap-horizontal";
    case "Commission": return "trending-up";
    default: return "card";
  }
};

const formatDate = (dateStr: string) => {
  const d = new Date(dateStr);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const hours = d.getHours();
  const mins = d.getMinutes().toString().padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  return `${d.getDate()} ${months[d.getMonth()]}, ${hours % 12 || 12}:${mins} ${ampm}`;
};

export default function PaymentManagement() {
  const { getInvoiceByRef, addInvoice: storeAddInvoice } = useApp();
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;
  const [settlements, setSettlements] = useState<Array<{ id: string; vendor: string; amount: string; due: string }>>([]);
  const [refunds, setRefunds] = useState<Array<{ id: string; orderId: string; customer: string; amount: string; reason: string; razorpayPaymentId: string }>>([]);
  const [razorpayTransactions, setRazorpayTransactions] = useState<PaymentTransaction[]>([]);
  const [walletTxns, setWalletTxns] = useState<Array<{ id: string; userId: string; type: string; amount: number; reference: string; createdAt: string; userName: string | null; userPhone: string | null }>>([]);
  const [loadingWallet, setLoadingWallet] = useState(true);
  const [loadingPayments, setLoadingPayments] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refundingId, setRefundingId] = useState<string | null>(null);
  const [razorpayHealthOk, setRazorpayHealthOk] = useState(true);
  const [invoiceModalVisible, setInvoiceModalVisible] = useState(false);
  const [currentInvoice, setCurrentInvoice] = useState<Invoice | null>(null);

  const handleGenerateInvoice = (settlement: typeof settlements[0]) => {
    try { Haptics.selectionAsync(); } catch {}
    const refId = `STL-${settlement.id}`;
    const existing = getInvoiceByRef(refId);
    if (existing) {
      setCurrentInvoice(existing);
      setInvoiceModalVisible(true);
      return;
    }
    const amountNum = parseInt(settlement.amount.replace(/[^\d]/g, ""), 10);
    const commissionAmount = Math.round(amountNum * 0.12);
    const netSettlement = amountNum - commissionAmount;
    const invoice = generateInvoice({
      type: "PAYOUT",
      referenceId: refId,
      toName: settlement.vendor,
      toPhone: "+91 9XXXXXXXXX",
      toAddress: "Vendor Address, Maharashtra",
      paymentMethod: "Bank Transfer",
      rawItems: [
        { description: `Vendor Payout - Net Settlement (Gross: \u20B9${amountNum.toLocaleString("en-IN")}, Commission: \u20B9${commissionAmount.toLocaleString("en-IN")})`, hsnSac: "998599", qty: 1, rate: netSettlement },
      ],
      notes: `Gross Sales: \u20B9${amountNum.toLocaleString("en-IN")} | Commission (12%): \u20B9${commissionAmount.toLocaleString("en-IN")} | Net Payout: \u20B9${netSettlement.toLocaleString("en-IN")} | Due: ${settlement.due}`,
    });
    storeAddInvoice(invoice);
    setCurrentInvoice(invoice);
    setInvoiceModalVisible(true);
  };

  const fetchPaymentTransactions = useCallback(async () => {
    try {
      const baseUrl = getApiUrl();
      const response = await fetch(new URL("/api/payments/transactions", baseUrl).toString());
      if (response.ok) {
        const data = await response.json();
        setRazorpayTransactions(data.transactions || []);
        setRazorpayHealthOk(true);
      }
    } catch {
      setRazorpayHealthOk(false);
    } finally {
      setLoadingPayments(false);
    }
  }, []);

  const fetchWalletTransactions = useCallback(async () => {
    try {
      const baseUrl = getApiUrl();
      const token = await getAuthToken();
      const response = await fetch(new URL("/api/admin/wallet-transactions", baseUrl).toString(), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (response.ok) {
        const data = await response.json();
        setWalletTxns(data.transactions || []);
      }
    } catch {} finally {
      setLoadingWallet(false);
    }
  }, []);

  useEffect(() => {
    fetchPaymentTransactions();
    fetchWalletTransactions();
  }, [fetchPaymentTransactions, fetchWalletTransactions]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchPaymentTransactions(), fetchWalletTransactions()]);
    setRefreshing(false);
  }, [fetchPaymentTransactions, fetchWalletTransactions]);

  const handleBack = () => {
    try { Haptics.selectionAsync(); } catch {}
    router.back();
  };

  const handleProcessAll = () => {
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); } catch {}
    Alert.alert(
      "Process All Pending",
      `Are you sure you want to process ${settlements.length} pending settlements?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Process All",
          style: "destructive",
          onPress: () => {
            try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
            setSettlements([]);
            Alert.alert("Success", "All pending settlements have been processed.");
          },
        },
      ]
    );
  };

  const handleApproveSettlement = (id: string) => {
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
    setSettlements((prev) => prev.filter((s) => s.id !== id));
    Alert.alert("Approved", "Settlement has been approved and will be processed.");
  };

  const handleHoldSettlement = (id: string) => {
    try { Haptics.selectionAsync(); } catch {}
    Alert.alert("On Hold", "Settlement has been placed on hold for review.");
  };

  const handleApproveRefund = async (id: string, razorpayPaymentId?: string) => {
    if (razorpayPaymentId) {
      setRefundingId(id);
      try {
        const baseUrl = getApiUrl();
        const response = await fetch(new URL("/api/payments/razorpay-refund", baseUrl).toString(), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paymentId: razorpayPaymentId }),
        });
        const data = await response.json();
        if (response.ok) {
          try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
          setRefunds((prev) => prev.filter((r) => r.id !== id));
          fetchPaymentTransactions();
          Alert.alert("Refund Processed", `Refund has been processed via Razorpay.`);
        } else {
          Alert.alert("Refund Failed", data.error || "Failed to process refund.");
        }
      } catch {
        Alert.alert("Error", "Network error. Please try again.");
      } finally {
        setRefundingId(null);
      }
    } else {
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
      setRefunds((prev) => prev.filter((r) => r.id !== id));
      Alert.alert("Refund Approved", "Refund has been approved and will be processed.");
    }
  };

  const handleRejectRefund = (id: string) => {
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); } catch {}
    setRefunds((prev) => prev.filter((r) => r.id !== id));
    Alert.alert("Refund Rejected", "Refund request has been rejected.");
  };

  const handleRefundTransaction = (razorpayId: string, amount: string) => {
    Alert.alert(
      "Refund Payment",
      `Process refund for ${amount} via Razorpay?\nPayment: ${razorpayId.substring(0, 20)}...`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Process Refund",
          style: "destructive",
          onPress: () => handleApproveRefund(razorpayId, razorpayId),
        },
      ]
    );
  };

  const allTransactions = razorpayTransactions.map((txn) => ({
    id: txn.id,
    type: "Payment" as const,
    amount: `\u20B9${txn.amount.toLocaleString("en-IN")}`,
    method: txn.method === "razorpay" ? "Razorpay" : txn.method,
    status: txn.status === "completed" || txn.status === "succeeded" ? "Completed" : txn.status === "refunded" ? "Refunded" : txn.status === "pending" ? "Processing" : txn.status,
    date: formatDate(txn.createdAt),
    razorpayId: txn.razorpayOrderId,
    canRefund: (txn.status === "completed" || txn.status === "succeeded") && txn.razorpayOrderId,
  }));

  const totalRevenue = razorpayTransactions
    .filter((t) => t.status === "completed" || t.status === "succeeded")
    .reduce((sum, t) => sum + t.amount, 0);
  const totalRefunded = razorpayTransactions
    .filter((t) => t.status === "refunded")
    .reduce((sum, t) => sum + t.amount, 0);
  const commissionRate = 0.12;
  const platformCommission = Math.round(totalRevenue * commissionRate);

  const fmt = (n: number) => n > 0 ? `\u20B9${n.toLocaleString("en-IN")}` : "\u20B90";
  const liveKPIs = [
    { label: "Total Revenue", value: fmt(totalRevenue), icon: "cash" as const, color: Colors.success },
    { label: "Platform Commission", value: fmt(platformCommission), icon: "wallet" as const, color: Colors.primary },
    { label: "Pending Settlements", value: fmt(0), icon: "time" as const, color: Colors.warning },
    { label: "Refunds Processed", value: fmt(totalRefunded), icon: "return-down-back" as const, color: Colors.error },
  ];

  const dynamicGatewayHealth = gatewayHealth.map((gw) =>
    gw.label === "Razorpay" ? { ...gw, ok: razorpayHealthOk, status: razorpayHealthOk ? "Online" : "Error" } : gw
  );

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: bottomInset + 20 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      >
        <LinearGradient colors={["#0B1E3D", "#142F5E"]} style={[styles.header, { paddingTop: topInset + 12 }]}>
          <View style={styles.headerRow}>
            <Pressable style={styles.backBtn} onPress={handleBack}>
              <Ionicons name="arrow-back" size={22} color="#FFF" />
            </Pressable>
            <Text style={styles.headerTitle}>Payment Management</Text>
            <View style={{ width: 42 }} />
          </View>
        </LinearGradient>

        <View style={styles.kpiSection}>
          {liveKPIs.map((kpi) => (
            <View key={kpi.label} style={styles.kpiCard}>
              <View style={[styles.kpiIcon, { backgroundColor: kpi.color + "18" }]}>
                <Ionicons name={kpi.icon} size={18} color={kpi.color} />
              </View>
              <Text style={styles.kpiValue}>{kpi.value}</Text>
              <Text style={styles.kpiLabel}>{kpi.label}</Text>
            </View>
          ))}
        </View>

        {allTransactions.length === 0 && !loadingPayments && (
          <View style={[styles.section, { alignItems: "center", paddingVertical: 24 }]}>
            <Ionicons name="card-outline" size={40} color={Colors.textSecondary} />
            <Text style={{ color: Colors.textSecondary, marginTop: 8, fontSize: 14 }}>No payment transactions yet</Text>
          </View>
        )}

        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Settlement Management</Text>
            <Pressable
              style={({ pressed }) => [styles.processAllBtn, pressed && { opacity: 0.7 }]}
              onPress={handleProcessAll}
            >
              <Ionicons name="flash" size={14} color="#FFF" />
              <Text style={styles.processAllText}>Process All Pending</Text>
            </Pressable>
          </View>
          {settlements.map((settlement) => (
            <View key={settlement.id} style={styles.settlementCard}>
              <View style={styles.settlementInfo}>
                <Text style={styles.settlementVendor}>{settlement.vendor}</Text>
                <Text style={styles.settlementAmount}>{settlement.amount}</Text>
                <Text style={styles.settlementDue}>Due: {settlement.due}</Text>
              </View>
              <View style={styles.settlementActions}>
                <Pressable
                  style={({ pressed }) => [styles.invoiceBtn, pressed && { opacity: 0.7 }]}
                  onPress={() => handleGenerateInvoice(settlement)}
                >
                  <Ionicons name="receipt-outline" size={16} color={Colors.info} />
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.approveBtn, pressed && { opacity: 0.7 }]}
                  onPress={() => handleApproveSettlement(settlement.id)}
                >
                  <Ionicons name="checkmark" size={16} color="#FFF" />
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.holdBtn, pressed && { opacity: 0.7 }]}
                  onPress={() => handleHoldSettlement(settlement.id)}
                >
                  <Ionicons name="pause" size={16} color={Colors.warning} />
                </Pressable>
              </View>
            </View>
          ))}
          {settlements.length === 0 && (
            <View style={styles.emptyCard}>
              <Ionicons name="checkmark-circle" size={32} color={Colors.success} />
              <Text style={styles.emptyText}>All settlements processed</Text>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Recent Transactions</Text>
            {loadingPayments && <ActivityIndicator size="small" color={Colors.primary} />}
          </View>
          {razorpayTransactions.length > 0 && (
            <View style={styles.razorpayBadge}>
              <Ionicons name="shield-checkmark" size={14} color="#6366F1" />
              <Text style={styles.razorpayBadgeText}>{razorpayTransactions.length} Razorpay transaction{razorpayTransactions.length !== 1 ? "s" : ""}</Text>
            </View>
          )}
          {allTransactions.map((txn) => (
            <View key={txn.id} style={styles.txnCard}>
              <View style={[styles.txnIcon, { backgroundColor: statusColor(txn.status) + "15" }]}>
                <Ionicons name={typeIcon(txn.type)} size={16} color={statusColor(txn.status)} />
              </View>
              <View style={styles.txnInfo}>
                <View style={styles.txnTopRow}>
                  <Text style={styles.txnId}>{txn.id}</Text>
                  <Text style={styles.txnAmount}>{txn.amount}</Text>
                </View>
                <View style={styles.txnBottomRow}>
                  <View style={[styles.txnTypeBadge, { backgroundColor: statusColor(txn.status) + "15" }]}>
                    <Text style={[styles.txnTypeText, { color: statusColor(txn.status) }]}>{txn.type}</Text>
                  </View>
                  <Text style={styles.txnMethod}>{txn.method}</Text>
                  <View style={[styles.txnStatusDot, { backgroundColor: statusColor(txn.status) }]} />
                  <Text style={[styles.txnStatus, { color: statusColor(txn.status) }]}>{txn.status}</Text>
                </View>
                <View style={styles.txnFooterRow}>
                  {txn.razorpayId ? (
                    <Text style={styles.razorpayIdText} numberOfLines={1}>Razorpay: {txn.razorpayId}</Text>
                  ) : (
                    <Text style={styles.txnDate}>{txn.date}</Text>
                  )}
                  {txn.canRefund && (
                    <Pressable
                      style={({ pressed }) => [styles.txnRefundBtn, pressed && { opacity: 0.7 }]}
                      onPress={() => handleRefundTransaction(txn.razorpayId, txn.amount)}
                    >
                      <Ionicons name="return-down-back" size={12} color={Colors.error} />
                      <Text style={styles.txnRefundText}>Refund</Text>
                    </Pressable>
                  )}
                </View>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Refund Requests</Text>
          {refunds.map((refund) => (
            <View key={refund.id} style={styles.refundCard}>
              <View style={styles.refundHeader}>
                <View>
                  <Text style={styles.refundOrder}>{refund.orderId}</Text>
                  <Text style={styles.refundCustomer}>{refund.customer}</Text>
                </View>
                <Text style={styles.refundAmount}>{refund.amount}</Text>
              </View>
              <Text style={styles.refundReason}>{refund.reason}</Text>
              <View style={styles.refundActions}>
                <Pressable
                  style={({ pressed }) => [styles.refundApproveBtn, pressed && { opacity: 0.7 }, refundingId === refund.id && { opacity: 0.6 }]}
                  onPress={() => handleApproveRefund(refund.id, refund.razorpayPaymentId)}
                  disabled={refundingId === refund.id}
                >
                  {refundingId === refund.id ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <>
                      <Ionicons name="checkmark-circle" size={16} color="#FFF" />
                      <Text style={styles.refundApproveBtnText}>Approve</Text>
                    </>
                  )}
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.refundRejectBtn, pressed && { opacity: 0.7 }]}
                  onPress={() => handleRejectRefund(refund.id)}
                  disabled={refundingId === refund.id}
                >
                  <Ionicons name="close-circle" size={16} color={Colors.error} />
                  <Text style={styles.refundRejectBtnText}>Reject</Text>
                </Pressable>
              </View>
            </View>
          ))}
          {refunds.length === 0 && (
            <View style={styles.emptyCard}>
              <Ionicons name="checkmark-circle" size={32} color={Colors.success} />
              <Text style={styles.emptyText}>No pending refund requests</Text>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Wallet Top-ups</Text>
            {loadingWallet && <ActivityIndicator size="small" color={Colors.primary} />}
          </View>
          {walletTxns.length === 0 && !loadingWallet && (
            <View style={styles.emptyCard}>
              <Ionicons name="wallet-outline" size={32} color={Colors.textSecondary} />
              <Text style={styles.emptyText}>No wallet top-ups yet</Text>
            </View>
          )}
          {walletTxns.map((txn) => (
            <View key={txn.id} style={styles.txnCard}>
              <View style={[styles.txnIcon, { backgroundColor: txn.type === "CREDIT" ? Colors.success + "18" : Colors.error + "18" }]}>
                <Ionicons name={txn.type === "CREDIT" ? "arrow-down" : "arrow-up"} size={16} color={txn.type === "CREDIT" ? Colors.success : Colors.error} />
              </View>
              <View style={styles.txnInfo}>
                <View style={styles.txnTopRow}>
                  <Text style={styles.txnId} numberOfLines={1}>{txn.userName || txn.userPhone || txn.userId}</Text>
                  <Text style={[styles.txnAmount, { color: txn.type === "CREDIT" ? Colors.success : Colors.error }]}>
                    {txn.type === "CREDIT" ? "+" : "-"}{"\u20B9"}{txn.amount.toLocaleString("en-IN")}
                  </Text>
                </View>
                <View style={styles.txnBottomRow}>
                  {txn.userPhone && <Text style={styles.txnMethod}>{txn.userPhone}</Text>}
                  <View style={[styles.txnTypeBadge, { backgroundColor: txn.type === "CREDIT" ? Colors.success + "18" : Colors.error + "18" }]}>
                    <Text style={[styles.txnTypeText, { color: txn.type === "CREDIT" ? Colors.success : Colors.error }]}>{txn.type}</Text>
                  </View>
                </View>
                <View style={styles.txnFooterRow}>
                  <Text style={styles.txnDate}>{formatDate(txn.createdAt)}</Text>
                  <Text style={[styles.razorpayIdText, { flex: 1, textAlign: "right" }]} numberOfLines={1}>{txn.reference}</Text>
                </View>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Gateway Health</Text>
          <View style={styles.card}>
            {dynamicGatewayHealth.map((gw) => (
              <View key={gw.label} style={styles.healthRow}>
                <View style={[styles.healthDot, { backgroundColor: gw.ok ? Colors.success : Colors.warning }]} />
                <Text style={styles.healthLabel}>{gw.label}</Text>
                <Text style={[styles.healthStatus, { color: gw.ok ? Colors.success : Colors.warning }]}>{gw.status}</Text>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>

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
  container: { flex: 1, backgroundColor: Colors.background },
  header: { paddingHorizontal: 20, paddingBottom: 24 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  backBtn: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { fontFamily: "Poppins_700Bold", fontSize: 20, color: "#FFF" },
  kpiSection: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 16, marginTop: -12, gap: 10 },
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
  kpiIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  kpiValue: { fontFamily: "Poppins_700Bold", fontSize: 17, color: Colors.secondary },
  kpiLabel: { fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textSecondary, marginTop: 1 },
  section: { marginTop: 22, paddingHorizontal: 20 },
  sectionTitle: { fontFamily: "Poppins_700Bold", fontSize: 17, color: Colors.secondary, marginBottom: 12 },
  sectionHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  card: { backgroundColor: "#FFF", borderRadius: 16, padding: 16, gap: 12 },
  methodRow: { gap: 6 },
  methodLabelRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  methodLabel: { fontFamily: "Poppins_500Medium", fontSize: 13, color: Colors.text },
  methodPercent: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: Colors.secondary },
  progressBarBg: { height: 8, backgroundColor: Colors.borderLight, borderRadius: 4, overflow: "hidden" as const },
  progressBarFill: { height: 8, borderRadius: 4 },
  processAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  processAllText: { fontFamily: "Poppins_600SemiBold", fontSize: 12, color: "#FFF" },
  settlementCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF",
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
  },
  settlementInfo: { flex: 1 },
  settlementVendor: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: Colors.text },
  settlementAmount: { fontFamily: "Poppins_700Bold", fontSize: 16, color: Colors.secondary, marginTop: 2 },
  settlementDue: { fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  settlementActions: { flexDirection: "row", gap: 8 },
  approveBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.success,
    alignItems: "center",
    justifyContent: "center",
  },
  invoiceBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.info + "15",
    alignItems: "center",
    justifyContent: "center",
  },
  holdBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.warning + "20",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyCard: {
    backgroundColor: "#FFF",
    borderRadius: 14,
    padding: 24,
    alignItems: "center",
    gap: 8,
  },
  emptyText: { fontFamily: "Poppins_500Medium", fontSize: 14, color: Colors.textSecondary },
  razorpayBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#6366F1" + "12",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginBottom: 10,
    alignSelf: "flex-start",
  },
  razorpayBadgeText: { fontFamily: "Poppins_500Medium", fontSize: 12, color: "#6366F1" },
  txnCard: {
    flexDirection: "row",
    backgroundColor: "#FFF",
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
    gap: 10,
  },
  txnIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  txnInfo: { flex: 1 },
  txnTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  txnId: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: Colors.text },
  txnAmount: { fontFamily: "Poppins_700Bold", fontSize: 14, color: Colors.secondary },
  txnBottomRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  txnTypeBadge: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 },
  txnTypeText: { fontFamily: "Poppins_500Medium", fontSize: 10 },
  txnMethod: { fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textSecondary },
  txnStatusDot: { width: 6, height: 6, borderRadius: 3 },
  txnStatus: { fontFamily: "Poppins_500Medium", fontSize: 11 },
  txnDate: { fontFamily: "Poppins_400Regular", fontSize: 10, color: Colors.textLight, marginTop: 3 },
  txnFooterRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 3 },
  razorpayIdText: { fontFamily: "Poppins_400Regular", fontSize: 10, color: "#6366F1", flex: 1 },
  txnRefundBtn: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: Colors.error + "12", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  txnRefundText: { fontFamily: "Poppins_500Medium", fontSize: 10, color: Colors.error },
  refundCard: {
    backgroundColor: "#FFF",
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
  },
  refundHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  refundOrder: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: Colors.text },
  refundCustomer: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary, marginTop: 1 },
  refundAmount: { fontFamily: "Poppins_700Bold", fontSize: 16, color: Colors.error },
  refundReason: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary, marginTop: 8, lineHeight: 18 },
  refundActions: { flexDirection: "row", gap: 10, marginTop: 12 },
  refundApproveBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: Colors.success,
    paddingVertical: 10,
    borderRadius: 10,
  },
  refundApproveBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: "#FFF" },
  refundRejectBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: Colors.error + "15",
    paddingVertical: 10,
    borderRadius: 10,
  },
  refundRejectBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: Colors.error },
  healthRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  healthDot: { width: 8, height: 8, borderRadius: 4 },
  healthLabel: { fontFamily: "Poppins_500Medium", fontSize: 13, color: Colors.text, flex: 1 },
  healthStatus: { fontFamily: "Poppins_600SemiBold", fontSize: 12 },
});

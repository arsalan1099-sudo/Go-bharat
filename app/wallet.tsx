import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Platform, Alert, TextInput, Modal, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { router } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import * as WebBrowser from "expo-web-browser";
import Colors from "@/constants/colors";
import { useApp } from "@/lib/store";
import PressableScale from "@/components/PressableScale";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import InvoiceView from "@/components/InvoiceView";
import { Invoice } from "@/lib/types";
import AsyncStorage from "@react-native-async-storage/async-storage";

const QUICK_AMOUNTS = [100, 200, 500, 1000, 2000, 5000];
const WITHDRAW_QUICK = [100, 500, 1000, 2000, 5000, 10000];
const WITHDRAW_MIN = 100;
const WITHDRAW_MAX = 50000;

type PaymentMethod = "upi" | "netbanking" | "wallet" | null;
type UPIApp = "gpay" | "phonepe" | "paytm" | "bhim" | null;

const UPI_APPS = [
  { id: "gpay" as UPIApp, name: "Google Pay", color: "#4285F4", icon: "google" as const, iconSet: "mci" },
  { id: "phonepe" as UPIApp, name: "PhonePe", color: "#5F259F", icon: "cellphone" as const, iconSet: "mci" },
  { id: "paytm" as UPIApp, name: "Paytm", color: "#00BAF2", icon: "wallet" as const, iconSet: "ion" },
  { id: "bhim" as UPIApp, name: "BHIM UPI", color: "#00897B", icon: "bank" as const, iconSet: "mci" },
];

const BANKS = [
  { name: "SBI", color: "#1A237E" },
  { name: "HDFC", color: "#004C8F" },
  { name: "ICICI", color: "#F58220" },
  { name: "Axis", color: "#97144D" },
  { name: "Kotak", color: "#ED1C24" },
  { name: "PNB", color: "#1B3A6B" },
];

export default function WalletScreen() {
  const insets = useSafeAreaInsets();
  const { user, walletBalance, walletTransactions, addWalletMoney, deductWallet, applyAuthoritativeWalletDebit, invoices, getInvoiceByRef, coinBalance, coinTransactions, purchaseCoins, redeemCoinsToWallet } = useApp();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;
  const [showAddModal, setShowAddModal] = useState(false);
  const [addAmount, setAddAmount] = useState("");
  const [modalStep, setModalStep] = useState<"amount" | "method" | "processing" | "success">("amount");
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>(null);
  const [selectedUPI, setSelectedUPI] = useState<UPIApp>(null);
  const [selectedBank, setSelectedBank] = useState<string | null>(null);
  const [upiId, setUpiId] = useState("");
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [activeTab, setActiveTab] = useState<"wallet" | "coins">("wallet");
  const [showBuyCoinsModal, setShowBuyCoinsModal] = useState(false);
  const [coinAmount, setCoinAmount] = useState("");
  const [coinModalStep, setCoinModalStep] = useState<"amount" | "method" | "processing" | "success">("amount");
  const [coinSelectedMethod, setCoinSelectedMethod] = useState<PaymentMethod>(null);
  const [coinSelectedUPI, setCoinSelectedUPI] = useState<UPIApp>(null);
  const [coinSelectedBank, setCoinSelectedBank] = useState<string | null>(null);
  const [coinUpiId, setCoinUpiId] = useState("");
  const [showRedeemModal, setShowRedeemModal] = useState(false);
  const [redeemAmount, setRedeemAmount] = useState("");
  const [redeemStep, setRedeemStep] = useState<"amount" | "processing" | "success">("amount");
  const [redeemedRupees, setRedeemedRupees] = useState(0);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawStep, setWithdrawStep] = useState<"amount" | "details" | "processing" | "success">("amount");
  const [withdrawMethod, setWithdrawMethod] = useState<"UPI" | "BANK">("UPI");
  const [wUpiId, setWUpiId] = useState("");
  const [wBankName, setWBankName] = useState("");
  const [wAccountNumber, setWAccountNumber] = useState("");
  const [wIfsc, setWIfsc] = useState("");
  const [withdrawals, setWithdrawals] = useState<Array<any>>([]);
  const [withdrawnAmount, setWithdrawnAmount] = useState(0);

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  };

  const sortedTransactions = [...walletTransactions].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const totalCredits = walletTransactions
    .filter((t) => t.type === "CREDIT")
    .reduce((sum, t) => sum + t.amount, 0);
  const totalDebits = walletTransactions
    .filter((t) => t.type === "DEBIT")
    .reduce((sum, t) => sum + t.amount, 0);

  const sortedCoinTransactions = [...coinTransactions].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  const totalCoinsEarned = coinTransactions
    .filter((t) => t.type === "EARNED" || t.type === "PURCHASED" || t.type === "BONUS")
    .reduce((sum, t) => sum + t.amount, 0);
  const totalCoinsRedeemed = coinTransactions
    .filter((t) => t.type === "REDEEMED")
    .reduce((sum, t) => sum + t.amount, 0);

  const resetCoinModal = () => {
    setCoinModalStep("amount");
    setCoinSelectedMethod(null);
    setCoinSelectedUPI(null);
    setCoinSelectedBank(null);
    setCoinUpiId("");
    setCoinAmount("");
  };

  const resetRedeemModal = () => {
    setRedeemStep("amount");
    setRedeemAmount("");
  };

  const handleRedeemCoins = async () => {
    const coins = parseInt(redeemAmount);
    if (!coins || coins < 1) {
      Alert.alert("Invalid Amount", "Enter at least 1 coin to redeem.");
      return;
    }
    if (coins > coinBalance) {
      Alert.alert(
        "Insufficient Coins",
        `You have ${coinBalance.toLocaleString("en-IN")} coins but tried to redeem ${coins.toLocaleString("en-IN")}.`
      );
      return;
    }
    setRedeemStep("processing");
    const result = await redeemCoinsToWallet(coins);
    if (result.success) {
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
      setRedeemedRupees(result.rupees ?? coins * 100);
      setRedeemStep("success");
    } else {
      Alert.alert("Redemption Failed", result.error || "Could not redeem coins. Please try again.");
      setRedeemStep("amount");
    }
  };

  const loadWithdrawals = async () => {
    if (!user?.id) return;
    try {
      const res = await apiRequest("GET", `/api/withdrawals/${user.id}`);
      const data = await res.json();
      if (Array.isArray(data.withdrawals)) setWithdrawals(data.withdrawals);
    } catch {}
  };

  const applyPayoutDetails = (d: any) => {
    if (!d) return;
    if (d.method === "UPI" || d.method === "BANK") setWithdrawMethod(d.method);
    if (d.upiId) setWUpiId(d.upiId);
    if (d.bankName) setWBankName(d.bankName);
    if (d.accountNumber) setWAccountNumber(d.accountNumber);
    if (d.ifsc) setWIfsc(d.ifsc);
  };

  // Server is the source of truth for saved payout details; AsyncStorage is only an offline cache.
  const loadPayoutDetails = async () => {
    if (!user?.id) return;
    try {
      const res = await apiRequest("GET", `/api/payout-details/${user.id}`);
      const data = await res.json();
      if (data?.payoutDetails) {
        applyPayoutDetails(data.payoutDetails);
        return;
      }
    } catch {}
    try {
      const raw = await AsyncStorage.getItem(`gobharat_withdraw_bank_${user.id}`);
      if (raw) applyPayoutDetails(JSON.parse(raw));
    } catch {}
  };

  useEffect(() => {
    if (user?.role !== "CUSTOMER" || !user?.id) return;
    loadWithdrawals();
    loadPayoutDetails();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const resetWithdrawModal = () => {
    setWithdrawStep("amount");
    setWithdrawAmount("");
  };

  const withdrawStatusColor = (status: string) => {
    if (status === "COMPLETED") return Colors.success;
    if (status === "REJECTED") return Colors.error;
    if (status === "PROCESSING") return "#D97706";
    return Colors.secondary;
  };

  const handleProceedToWithdraw = () => {
    const amt = parseInt(withdrawAmount);
    if (!amt || amt < WITHDRAW_MIN) {
      Alert.alert("Invalid Amount", `Minimum withdrawal is \u20B9${WITHDRAW_MIN}.`);
      return;
    }
    if (amt > WITHDRAW_MAX) {
      Alert.alert("Limit Exceeded", `Maximum withdrawal is \u20B9${WITHDRAW_MAX.toLocaleString("en-IN")} per request.`);
      return;
    }
    if (amt > walletBalance) {
      Alert.alert("Insufficient Balance", `You can withdraw up to \u20B9${walletBalance.toLocaleString("en-IN")}.`);
      return;
    }
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
    setWithdrawStep("details");
  };

  const handleSubmitWithdraw = async () => {
    const amt = parseInt(withdrawAmount);
    let bankDetails: Record<string, string>;
    if (withdrawMethod === "UPI") {
      const upi = wUpiId.trim();
      if (!upi || !upi.includes("@")) {
        Alert.alert("Invalid UPI ID", "Enter a valid UPI ID (e.g. yourname@bank).");
        return;
      }
      bankDetails = { upiId: upi };
    } else {
      const bank = wBankName.trim();
      const acc = wAccountNumber.trim();
      const ifsc = wIfsc.trim().toUpperCase();
      if (!bank) { Alert.alert("Bank Name Required", "Enter your bank name."); return; }
      if (!/^\d{9,18}$/.test(acc)) { Alert.alert("Invalid Account Number", "Enter a valid account number (9-18 digits)."); return; }
      if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) { Alert.alert("Invalid IFSC", "Enter a valid IFSC code (e.g. SBIN0001234)."); return; }
      bankDetails = { bankName: bank, accountNumber: acc, ifsc };
    }
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
    setWithdrawStep("processing");
    // Persist payout details server-side (source of truth) so they're remembered next time —
    // even on a new device. Mirror to a local cache for offline prefill. Best-effort: a save
    // failure must not block the actual withdrawal.
    try {
      await apiRequest("PUT", "/api/payout-details", {
        userId: user?.id,
        userName: user?.name,
        method: withdrawMethod,
        bankDetails,
      });
    } catch {}
    try {
      await AsyncStorage.setItem(`gobharat_withdraw_bank_${user?.id}`, JSON.stringify({ method: withdrawMethod, ...bankDetails }));
    } catch {}
    try {
      const res = await apiRequest("POST", "/api/withdrawals/request", {
        userId: user?.id,
        userName: user?.name,
        userRole: "CUSTOMER",
        amount: amt,
        method: withdrawMethod,
        bankDetails,
      });
      const data = await res.json();
      if (!data.success) {
        Alert.alert("Withdrawal Failed", data.error || "Could not submit withdrawal. Please try again.");
        setWithdrawStep("details");
        return;
      }
      // Server already debited the wallet (funds held). Use the authoritative balance
      // it returned instead of subtracting locally, so the shown balance is exact even
      // if local state was slightly stale.
      const ref = `Withdrawal to ${withdrawMethod === "UPI" ? "UPI" : "Bank"}`;
      if (typeof data.newWalletBalance === "number") {
        applyAuthoritativeWalletDebit(data.newWalletBalance, amt, ref);
      } else {
        deductWallet(amt, ref);
      }
      setWithdrawnAmount(amt);
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
      setWithdrawStep("success");
      loadWithdrawals();
    } catch (error: any) {
      let msg = error?.message || "Could not submit withdrawal. Please try again.";
      const m = typeof msg === "string" ? msg.match(/\{[\s\S]*\}/) : null;
      if (m) { try { const j = JSON.parse(m[0]); if (j.error) msg = j.error; } catch {} }
      Alert.alert("Withdrawal Failed", msg);
      setWithdrawStep("details");
    }
  };

  const handleBuyCoins = async () => {
    const amt = parseInt(coinAmount);
    if (!amt || amt <= 0) {
      Alert.alert("Invalid Amount", "Please enter a valid coin amount.");
      return;
    }
    if (amt > 50000) {
      Alert.alert("Limit Exceeded", "Maximum purchase is 50,000 coins.");
      return;
    }
    setCoinModalStep("processing");
    try {
      const response = await apiRequest("POST", "/api/payments/razorpay-create-order", {
        amount: amt * 100,
        orderId: `COINS_${Date.now()}`,
      });
      const data = await response.json();
      if (!data.orderId || !data.keyId) {
        throw new Error(data.error || "Failed to create Razorpay order");
      }
      const baseUrl = getApiUrl();
      const checkoutUrl = new URL("/api/payments/razorpay-checkout", baseUrl);
      checkoutUrl.searchParams.set("order_id", data.orderId);
      checkoutUrl.searchParams.set("key_id", data.keyId);
      checkoutUrl.searchParams.set("amount", String(data.amount));
      checkoutUrl.searchParams.set("name", "Go Bharat");
      checkoutUrl.searchParams.set("description", `Buy ${amt} Go Bharat Coins`);
      checkoutUrl.searchParams.set("prefill_contact", "");
      checkoutUrl.searchParams.set("method", coinSelectedMethod === "netbanking" ? "netbanking" : "upi");
      let result;
      try {
        result = await WebBrowser.openBrowserAsync(checkoutUrl.toString(), {
          dismissButtonStyle: "close",
          showInRecents: true,
        });
      } catch {
        setCoinModalStep("method");
        return;
      }
      try { await WebBrowser.coolDownAsync(); } catch {}
      if (result && result.type !== "cancel") {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        const statusUrl = `/api/payments/razorpay-order-status/${data.orderId}`;
        try {
          const statusRes = await apiRequest("GET", statusUrl);
          const statusData = await statusRes.json();
          if (statusData.status === "paid") {
            try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
            purchaseCoins(amt);
            setCoinModalStep("success");
            return;
          }
        } catch {}
      }
      setCoinModalStep("method");
    } catch (error: any) {
      Alert.alert("Payment Failed", error?.message || "Payment failed. Please try again.");
      setCoinModalStep("method");
    }
  };

  const resetModal = () => {
    setModalStep("amount");
    setSelectedMethod(null);
    setSelectedUPI(null);
    setSelectedBank(null);
    setUpiId("");
    setAddAmount("");
  };

  const handleProceedToPayment = () => {
    const amount = parseInt(addAmount);
    if (!amount || amount <= 0) {
      Alert.alert("Invalid Amount", "Please enter a valid amount.");
      return;
    }
    if (amount > 50000) {
      Alert.alert("Limit Exceeded", "Maximum top-up amount is \u20B950,000.");
      return;
    }
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
    setModalStep("method");
  };

  const handlePayNow = async () => {
    if (selectedMethod === "upi" && !selectedUPI && !upiId) {
      Alert.alert("Select UPI", "Please select a UPI app or enter your UPI ID.");
      return;
    }
    if (selectedMethod === "netbanking" && !selectedBank) {
      Alert.alert("Select Bank", "Please select your bank.");
      return;
    }
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}

    setModalStep("processing");
    try {
      const amt = parseInt(addAmount);
      const response = await apiRequest("POST", "/api/payments/razorpay-create-order", {
        amount: amt,
        orderId: `WALLET_${Date.now()}`,
        notes: { intent: "wallet_topup", userId: user?.phone ?? "" },
      });
      const data = await response.json();
      if (!data.orderId || !data.keyId) {
        throw new Error(data.error || "Failed to create Razorpay order");
      }
      const baseUrl = getApiUrl();
      const checkoutUrl = new URL("/api/payments/razorpay-checkout", baseUrl);
      checkoutUrl.searchParams.set("order_id", data.orderId);
      checkoutUrl.searchParams.set("key_id", data.keyId);
      checkoutUrl.searchParams.set("amount", String(data.amount));
      checkoutUrl.searchParams.set("name", "Go Bharat");
      checkoutUrl.searchParams.set("description", "Wallet Top-Up");
      checkoutUrl.searchParams.set("prefill_contact", "");
      checkoutUrl.searchParams.set("method", selectedMethod === "netbanking" ? "netbanking" : "upi");
      let result;
      try {
        result = await WebBrowser.openBrowserAsync(checkoutUrl.toString(), {
          dismissButtonStyle: "close",
          showInRecents: true,
        });
      } catch (browserErr) {
        setModalStep("method");
        return;
      }
      try { await WebBrowser.coolDownAsync(); } catch {}
      if (result && result.type !== "cancel") {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        const statusUrl = `/api/payments/razorpay-order-status/${data.orderId}`;
        try {
          const statusRes = await apiRequest("GET", statusUrl);
          const statusData = await statusRes.json();
          if (statusData.status === "paid") {
            try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
            // Credit wallet server-side; only update local state on confirmed success
            const topupRes = await apiRequest("POST", "/api/wallet/topup", {
              razorpayOrderId: data.orderId,
            });
            const topupData = await topupRes.json();
            if (!topupData.success) {
              Alert.alert("Wallet Credit Failed", topupData.error || "Could not credit wallet. Contact support.");
              setModalStep("method");
              return;
            }
            // Use the server-verified amount, not the client-supplied value
            const creditedAmount = topupData.transaction?.amount ?? amt;
            addWalletMoney(creditedAmount);
            setModalStep("success");
            return;
          }
        } catch {}
      }
      setModalStep("method");
    } catch (error: any) {
      Alert.alert("Payment Failed", error?.message || "Payment failed. Please try again.");
      setModalStep("method");
    }
  };

  const getMethodLabel = () => {
    if (selectedMethod === "upi") {
      if (selectedUPI) return UPI_APPS.find(u => u.id === selectedUPI)?.name || "UPI";
      return "UPI";
    }
    if (selectedMethod === "netbanking") return selectedBank || "Net Banking";
    if (selectedMethod === "wallet") return "Go Bharat Wallet";
    return "";
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={activeTab === "coins" ? ["#78350F", "#92400E"] : ["#0B1E3D", "#142F5E"]} style={[styles.header, { paddingTop: topInset + 12 }]}>
        <View style={styles.headerRow}>
          <PressableScale onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#FFF" />
          </PressableScale>
          <Text style={styles.headerTitle}>Go Bharat Wallet</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={{ flexDirection: "row", marginHorizontal: 20, backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 12, padding: 3, marginBottom: 16 }}>
          <PressableScale
            style={{ flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: "center" as const, backgroundColor: activeTab === "wallet" ? "#FFF" : "transparent" }}
            onPress={() => setActiveTab("wallet")}
          >
            <Text style={{ fontFamily: "Poppins_600SemiBold", fontSize: 13, color: activeTab === "wallet" ? "#0B1E3D" : "rgba(255,255,255,0.7)" }}>{"\u20B9"} Wallet</Text>
          </PressableScale>
          <PressableScale
            style={{ flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: "center" as const, backgroundColor: activeTab === "coins" ? "#FFF" : "transparent" }}
            onPress={() => setActiveTab("coins")}
          >
            <Text style={{ fontFamily: "Poppins_600SemiBold", fontSize: 13, color: activeTab === "coins" ? "#92400E" : "rgba(255,255,255,0.7)" }}>Go Bharat Coins</Text>
          </PressableScale>
        </View>

        {activeTab === "wallet" ? (
          <>
            <View style={styles.balanceCard}>
              <Text style={styles.balanceLabel}>Available Balance</Text>
              <Text style={styles.balanceAmount}>{"\u20B9"}{walletBalance.toLocaleString("en-IN")}</Text>
            </View>
            <View style={styles.statsRow}>
              <View style={styles.statBox}>
                <Ionicons name="trending-up" size={16} color={Colors.success} />
                <Text style={styles.statAmount}>{"\u20B9"}{totalCredits.toLocaleString("en-IN")}</Text>
                <Text style={styles.statLabel}>Total In</Text>
              </View>
              <View style={[styles.statBox, { borderLeftWidth: 1, borderLeftColor: "rgba(255,255,255,0.15)" }]}>
                <Ionicons name="trending-down" size={16} color="#FF6B6B" />
                <Text style={styles.statAmount}>{"\u20B9"}{totalDebits.toLocaleString("en-IN")}</Text>
                <Text style={styles.statLabel}>Total Out</Text>
              </View>
            </View>
          </>
        ) : (
          <>
            <View style={[styles.balanceCard, { backgroundColor: "rgba(251,191,36,0.15)" }]}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Ionicons name="diamond" size={24} color="#FBBF24" />
                <Text style={[styles.balanceLabel, { color: "#FBBF24" }]}>Go Bharat Coins</Text>
              </View>
              <Text style={styles.balanceAmount}>{coinBalance.toLocaleString("en-IN")}</Text>
              <Text style={{ fontFamily: "Poppins_400Regular", fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>1 coin = {"\u20B9"}100 | Earn 1 coin per {"\u20B9"}10,000 spent</Text>
            </View>
            <View style={styles.statsRow}>
              <View style={styles.statBox}>
                <Ionicons name="trending-up" size={16} color="#FBBF24" />
                <Text style={styles.statAmount}>{totalCoinsEarned.toLocaleString("en-IN")}</Text>
                <Text style={styles.statLabel}>Earned</Text>
              </View>
              <View style={[styles.statBox, { borderLeftWidth: 1, borderLeftColor: "rgba(255,255,255,0.15)" }]}>
                <Ionicons name="trending-down" size={16} color="#FF6B6B" />
                <Text style={styles.statAmount}>{totalCoinsRedeemed.toLocaleString("en-IN")}</Text>
                <Text style={styles.statLabel}>Redeemed</Text>
              </View>
            </View>
          </>
        )}
      </LinearGradient>

      <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: bottomInset + 80 }} showsVerticalScrollIndicator={false}>
        {activeTab === "wallet" ? (
          <>
            {withdrawals.length > 0 && (
              <View style={{ marginBottom: 20 }}>
                <Text style={styles.sectionTitle}>Withdrawals</Text>
                {withdrawals.slice(0, 5).map((w) => {
                  const c = withdrawStatusColor(w.status);
                  const dest = w.bankDetails?.upiId
                    || (w.bankDetails?.accountNumber ? "\u2022\u2022\u2022\u2022" + String(w.bankDetails.accountNumber).slice(-4) : (w.method === "UPI" ? "UPI" : "Bank"));
                  return (
                    <View key={w.id} style={styles.txnCard}>
                      <View style={styles.txnLeft}>
                        <View style={[styles.txnIconBg, { backgroundColor: c + "15" }]}>
                          <Ionicons name="cash-outline" size={20} color={c} />
                        </View>
                        <View style={styles.txnInfo}>
                          <Text style={styles.txnRef}>{w.method === "UPI" ? "UPI" : "Bank"} · {String(dest)}</Text>
                          <Text style={styles.txnDate}>{formatDate(w.createdAt)}</Text>
                        </View>
                      </View>
                      <View style={styles.txnRight}>
                        <Text style={[styles.txnAmount, { color: Colors.text }]}>{"\u20B9"}{(w.amount || 0).toLocaleString("en-IN")}</Text>
                        <View style={{ backgroundColor: c + "15", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }}>
                          <Text style={{ fontFamily: "Poppins_600SemiBold", fontSize: 10, color: c }}>{w.status}</Text>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
            <Text style={styles.sectionTitle}>Transaction History</Text>
            {sortedTransactions.map((txn) => (
              <View key={txn.id} style={styles.txnCard}>
                <View style={styles.txnLeft}>
                  <View style={[styles.txnIconBg, { backgroundColor: txn.type === "CREDIT" ? Colors.success + "15" : Colors.error + "15" }]}>
                    <Ionicons
                      name={txn.type === "CREDIT" ? "arrow-down" : "arrow-up"}
                      size={20}
                      color={txn.type === "CREDIT" ? Colors.success : Colors.error}
                    />
                  </View>
                  <View style={styles.txnInfo}>
                    <Text style={styles.txnRef}>{txn.reference}</Text>
                    <Text style={styles.txnDate}>{formatDate(txn.createdAt)}</Text>
                  </View>
                </View>
                <View style={styles.txnRight}>
                  <Text style={[styles.txnAmount, { color: txn.type === "CREDIT" ? Colors.success : Colors.error }]}>
                    {txn.type === "CREDIT" ? "+" : "-"}{"\u20B9"}{txn.amount.toLocaleString("en-IN")}
                  </Text>
                  {txn.type === "CREDIT" && (
                    <Pressable
                      style={styles.viewReceiptBtn}
                      onPress={() => {
                        const inv = getInvoiceByRef(txn.id);
                        if (inv) {
                          setSelectedInvoice(inv);
                          setShowReceiptModal(true);
                        } else {
                          Alert.alert("Receipt", "Receipt not available for this transaction.");
                        }
                      }}
                      hitSlop={8}
                    >
                      <Ionicons name="receipt-outline" size={14} color={Colors.primary} />
                      <Text style={styles.viewReceiptText}>Receipt</Text>
                    </Pressable>
                  )}
                </View>
              </View>
            ))}
            {sortedTransactions.length === 0 && (
              <View style={styles.emptyState}>
                <Ionicons name="wallet-outline" size={48} color={Colors.textLight} />
                <Text style={styles.emptyText}>No transactions yet</Text>
              </View>
            )}
          </>
        ) : (
          <>
            <View style={{ backgroundColor: "#FFFBEB", borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: "#FDE68A" }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Ionicons name="information-circle" size={18} color="#D97706" />
                <Text style={{ fontFamily: "Poppins_500Medium", fontSize: 13, color: "#92400E", flex: 1 }}>1 coin = {"\u20B9"}100. Earn 1 coin for every {"\u20B9"}10,000 you spend. Redeem coins for wallet money or use them to pay for orders!</Text>
              </View>
            </View>
            <Text style={styles.sectionTitle}>Coin History</Text>
            {sortedCoinTransactions.map((txn) => {
              const isCredit = txn.type !== "REDEEMED";
              const iconName = txn.type === "EARNED" ? "star" : txn.type === "PURCHASED" ? "cart" : txn.type === "BONUS" ? "gift" : "arrow-up";
              const iconColor = isCredit ? "#D97706" : Colors.error;
              return (
                <View key={txn.id} style={styles.txnCard}>
                  <View style={styles.txnLeft}>
                    <View style={[styles.txnIconBg, { backgroundColor: iconColor + "15" }]}>
                      <Ionicons name={iconName as any} size={20} color={iconColor} />
                    </View>
                    <View style={styles.txnInfo}>
                      <Text style={styles.txnRef}>{txn.reference}</Text>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
                        <Text style={{ fontFamily: "Poppins_400Regular", fontSize: 10, color: "#D97706", backgroundColor: "#FEF3C7", paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4, overflow: "hidden" }}>{txn.type}</Text>
                        <Text style={styles.txnDate}>{formatDate(txn.createdAt)}</Text>
                      </View>
                    </View>
                  </View>
                  <Text style={[styles.txnAmount, { color: isCredit ? "#D97706" : Colors.error }]}>
                    {isCredit ? "+" : "-"}{txn.amount.toLocaleString("en-IN")}
                  </Text>
                </View>
              );
            })}
            {sortedCoinTransactions.length === 0 && (
              <View style={styles.emptyState}>
                <Ionicons name="diamond-outline" size={48} color={Colors.textLight} />
                <Text style={styles.emptyText}>No coin transactions yet</Text>
                <Text style={{ fontFamily: "Poppins_400Regular", fontSize: 13, color: Colors.textLight, marginTop: 4, textAlign: "center" as const }}>Place an order to start earning coins!</Text>
              </View>
            )}
          </>
        )}
      </ScrollView>

      <View style={[styles.bottomBar, { paddingBottom: bottomInset + 12 }]}>
        {activeTab === "wallet" ? (
          <View style={{ flexDirection: "row", gap: 10 }}>
            <PressableScale haptic="medium" style={[styles.addMoneyBtn, { flex: 1 }]} onPress={() => { setShowAddModal(true); }}>
              <Ionicons name="add-circle" size={20} color="#FFF" />
              <Text style={styles.addMoneyText}>Add Money</Text>
            </PressableScale>
            <PressableScale
              haptic="medium"
              style={[styles.addMoneyBtn, { flex: 1, backgroundColor: Colors.secondary }]}
              onPress={() => {
                if (walletBalance < WITHDRAW_MIN) { Alert.alert("Insufficient Balance", `You need at least \u20B9${WITHDRAW_MIN} in your wallet to withdraw.`); return; }
                resetWithdrawModal();
                setShowWithdrawModal(true);
              }}
            >
              <Ionicons name="cash-outline" size={20} color="#FFF" />
              <Text style={styles.addMoneyText}>Withdraw</Text>
            </PressableScale>
          </View>
        ) : (
          <View style={{ flexDirection: "row", gap: 10 }}>
            <PressableScale
              haptic="medium"
              style={[styles.addMoneyBtn, { flex: 1, backgroundColor: Colors.success }]}
              onPress={() => {
                if (coinBalance < 1) { Alert.alert("No Coins", "You don't have any coins to redeem yet."); return; }
                resetRedeemModal();
                setShowRedeemModal(true);
              }}
            >
              <Ionicons name="cash-outline" size={20} color="#FFF" />
              <Text style={styles.addMoneyText}>Redeem</Text>
            </PressableScale>
            <PressableScale haptic="medium" style={[styles.addMoneyBtn, { flex: 1, backgroundColor: "#D97706" }]} onPress={() => { setShowBuyCoinsModal(true); }}>
              <Ionicons name="diamond" size={20} color="#FFF" />
              <Text style={styles.addMoneyText}>Buy Coins</Text>
            </PressableScale>
          </View>
        )}
      </View>

      <Modal visible={showAddModal} transparent animationType="slide" onRequestClose={() => { resetModal(); setShowAddModal(false); }}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingBottom: bottomInset + 20 }]}>
            <View style={styles.modalHandle} />

            {modalStep === "amount" && (
              <>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Add Money to Wallet</Text>
                  <Pressable onPress={() => { resetModal(); setShowAddModal(false); }} hitSlop={10}>
                    <Ionicons name="close" size={24} color={Colors.text} />
                  </Pressable>
                </View>

                <Text style={styles.inputLabel}>Enter Amount</Text>
                <View style={styles.amountInputRow}>
                  <Text style={styles.rupeeSymbol}>{"\u20B9"}</Text>
                  <TextInput
                    style={styles.amountInput}
                    value={addAmount}
                    onChangeText={(t) => setAddAmount(t.replace(/[^0-9]/g, ""))}
                    placeholder="0"
                    placeholderTextColor={Colors.textLight}
                    keyboardType="number-pad"
                    autoFocus
                  />
                </View>

                <View style={styles.quickAmounts}>
                  {QUICK_AMOUNTS.map((amt) => (
                    <PressableScale
                      key={amt}
                      style={[styles.quickBtn, addAmount === String(amt) && styles.quickBtnActive]}
                      onPress={() => { setAddAmount(String(amt)); }}
                    >
                      <Text style={[styles.quickBtnText, addAmount === String(amt) && styles.quickBtnTextActive]}>
                        {"\u20B9"}{amt}
                      </Text>
                    </PressableScale>
                  ))}
                </View>

                <PressableScale
                  haptic="medium"
                  style={[styles.confirmBtn, (!addAmount || parseInt(addAmount) <= 0) && styles.confirmBtnDisabled]}
                  onPress={handleProceedToPayment}
                >
                  <Text style={styles.confirmBtnText}>
                    Proceed {addAmount ? `\u20B9${parseInt(addAmount).toLocaleString("en-IN")}` : ""}
                  </Text>
                </PressableScale>
              </>
            )}

            {modalStep === "method" && (
              <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 520 }}>
                <View style={styles.modalHeader}>
                  <Pressable onPress={() => setModalStep("amount")} hitSlop={10} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Ionicons name="arrow-back" size={22} color={Colors.text} />
                    <Text style={styles.modalTitle}>Payment Method</Text>
                  </Pressable>
                  <Pressable onPress={() => { resetModal(); setShowAddModal(false); }} hitSlop={10}>
                    <Ionicons name="close" size={24} color={Colors.text} />
                  </Pressable>
                </View>

                <View style={styles.payAmountBanner}>
                  <Text style={styles.payAmountLabel}>Amount to Add</Text>
                  <Text style={styles.payAmountValue}>{"\u20B9"}{parseInt(addAmount).toLocaleString("en-IN")}</Text>
                </View>

                <Text style={styles.methodSectionTitle}>UPI</Text>
                <View style={styles.upiGrid}>
                  {UPI_APPS.map((app) => (
                    <Pressable
                      key={app.id}
                      style={[styles.upiAppBtn, selectedMethod === "upi" && selectedUPI === app.id && styles.upiAppBtnActive]}
                      onPress={() => { try { Haptics.selectionAsync(); } catch {} setSelectedMethod("upi"); setSelectedUPI(app.id); setUpiId(""); }}
                    >
                      <View style={[styles.upiAppIcon, { backgroundColor: app.color + "15" }]}>
                        {app.iconSet === "mci" ? (
                          <MaterialCommunityIcons name={app.icon as any} size={22} color={app.color} />
                        ) : (
                          <Ionicons name={app.icon as any} size={22} color={app.color} />
                        )}
                      </View>
                      <Text style={styles.upiAppName}>{app.name}</Text>
                      {selectedMethod === "upi" && selectedUPI === app.id && (
                        <View style={styles.checkCircle}>
                          <Ionicons name="checkmark" size={12} color="#FFF" />
                        </View>
                      )}
                    </Pressable>
                  ))}
                </View>

                <View style={styles.upiIdRow}>
                  <Text style={styles.upiIdLabel}>Or enter UPI ID</Text>
                  <View style={styles.upiIdInputRow}>
                    <TextInput
                      style={styles.upiIdInput}
                      placeholder="yourname@upi"
                      placeholderTextColor={Colors.textLight}
                      value={upiId}
                      onChangeText={(t) => { setUpiId(t); if (t) { setSelectedMethod("upi"); setSelectedUPI(null); } }}
                    />
                    {upiId.includes("@") && (
                      <Ionicons name="checkmark-circle" size={20} color={Colors.success} />
                    )}
                  </View>
                </View>

                <View style={styles.methodDivider} />

                <Text style={styles.methodSectionTitle}>Net Banking</Text>
                <Pressable
                  style={[styles.methodOption, selectedMethod === "netbanking" && styles.methodOptionActive]}
                  onPress={() => { try { Haptics.selectionAsync(); } catch {} setSelectedMethod("netbanking"); setSelectedUPI(null); setUpiId(""); }}
                >
                  <View style={[styles.methodIconBg, { backgroundColor: "#10B98115" }]}>
                    <MaterialCommunityIcons name="bank" size={22} color="#10B981" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.methodName}>Net Banking</Text>
                    <Text style={styles.methodDesc}>All major Indian banks</Text>
                  </View>
                  <View style={[styles.radioOuter, selectedMethod === "netbanking" && styles.radioOuterActive]}>
                    {selectedMethod === "netbanking" && <View style={styles.radioInner} />}
                  </View>
                </Pressable>

                {selectedMethod === "netbanking" && (
                  <Animated.View entering={FadeInDown.duration(200)} style={styles.bankGrid}>
                    {BANKS.map((bank) => (
                      <Pressable
                        key={bank.name}
                        style={[styles.bankChip, selectedBank === bank.name && { backgroundColor: bank.color + "15", borderColor: bank.color }]}
                        onPress={() => { try { Haptics.selectionAsync(); } catch {} setSelectedBank(bank.name); }}
                      >
                        <View style={[styles.bankDot, { backgroundColor: bank.color }]} />
                        <Text style={[styles.bankChipText, selectedBank === bank.name && { color: bank.color, fontFamily: "Poppins_600SemiBold" }]}>{bank.name}</Text>
                      </Pressable>
                    ))}
                  </Animated.View>
                )}

                <View style={styles.methodDivider} />

                <Pressable
                  style={[styles.methodOption, selectedMethod === "wallet" && styles.methodOptionActive]}
                  onPress={() => { try { Haptics.selectionAsync(); } catch {} setSelectedMethod("wallet"); setSelectedUPI(null); setUpiId(""); setSelectedBank(null); }}
                >
                  <View style={[styles.methodIconBg, { backgroundColor: Colors.primary + "15" }]}>
                    <Ionicons name="wallet" size={22} color={Colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.methodName}>Other Wallets</Text>
                    <Text style={styles.methodDesc}>Amazon Pay, Freecharge, etc.</Text>
                  </View>
                  <View style={[styles.radioOuter, selectedMethod === "wallet" && styles.radioOuterActive]}>
                    {selectedMethod === "wallet" && <View style={styles.radioInner} />}
                  </View>
                </Pressable>

                <View style={{ height: 16 }} />

                <Pressable
                  style={[styles.confirmBtn, !selectedMethod && styles.confirmBtnDisabled]}
                  onPress={handlePayNow}
                >
                  <Ionicons name="shield-checkmark" size={18} color="#FFF" style={{ marginRight: 6 }} />
                  <Text style={styles.confirmBtnText}>
                    Pay {"\u20B9"}{parseInt(addAmount).toLocaleString("en-IN")}
                  </Text>
                </Pressable>

                <View style={styles.secureRow}>
                  <Ionicons name="lock-closed" size={12} color={Colors.textLight} />
                  <Text style={styles.secureText}>100% Secure Payment</Text>
                </View>
              </ScrollView>
            )}

            {modalStep === "processing" && (
              <View style={styles.processingContainer}>
                <Animated.View entering={FadeIn.duration(300)} style={styles.processingContent}>
                  <View style={styles.processingSpinner}>
                    <Ionicons name="sync" size={36} color={Colors.primary} />
                  </View>
                  <Text style={styles.processingTitle}>Processing Payment</Text>
                  <Text style={styles.processingDesc}>
                    Adding {"\u20B9"}{parseInt(addAmount).toLocaleString("en-IN")} via {getMethodLabel()}
                  </Text>
                  <Text style={styles.processingHint}>Please do not close this screen</Text>
                </Animated.View>
              </View>
            )}

            {modalStep === "success" && (
              <View style={styles.processingContainer}>
                <Animated.View entering={FadeIn.duration(300)} style={styles.processingContent}>
                  <View style={styles.successCircle}>
                    <Ionicons name="checkmark" size={40} color="#FFF" />
                  </View>
                  <Text style={styles.successTitle}>Payment Successful</Text>
                  <Text style={styles.successAmount}>{"\u20B9"}{parseInt(addAmount).toLocaleString("en-IN")}</Text>
                  <Text style={styles.processingDesc}>Added to wallet via {getMethodLabel()}</Text>
                  <Pressable
                    style={[styles.confirmBtn, { marginTop: 24, width: "100%" }]}
                    onPress={() => { resetModal(); setShowAddModal(false); }}
                  >
                    <Text style={styles.confirmBtnText}>Done</Text>
                  </Pressable>
                </Animated.View>
              </View>
            )}
          </View>
        </View>
      </Modal>

      <Modal visible={showBuyCoinsModal} transparent animationType="slide" onRequestClose={() => { resetCoinModal(); setShowBuyCoinsModal(false); }}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingBottom: bottomInset + 20 }]}>
            <View style={styles.modalHandle} />

            {coinModalStep === "amount" && (
              <>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Buy Go Bharat Coins</Text>
                  <Pressable onPress={() => { resetCoinModal(); setShowBuyCoinsModal(false); }} hitSlop={10}>
                    <Ionicons name="close" size={24} color={Colors.text} />
                  </Pressable>
                </View>

                <View style={{ backgroundColor: "#FFFBEB", borderRadius: 12, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: "#FDE68A" }}>
                  <Text style={{ fontFamily: "Poppins_500Medium", fontSize: 12, color: "#92400E", textAlign: "center" as const }}>1 Go Bharat Coin = {"\u20B9"}100</Text>
                </View>

                <Text style={styles.inputLabel}>How many coins?</Text>
                <View style={[styles.amountInputRow, { borderColor: "#D97706" }]}>
                  <Ionicons name="diamond" size={22} color="#D97706" style={{ marginRight: 8 }} />
                  <TextInput
                    style={styles.amountInput}
                    value={coinAmount}
                    onChangeText={(t) => setCoinAmount(t.replace(/[^0-9]/g, ""))}
                    placeholder="0"
                    placeholderTextColor={Colors.textLight}
                    keyboardType="number-pad"
                    autoFocus
                  />
                </View>
                {coinAmount ? (
                  <Text style={{ fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary, textAlign: "center" as const, marginBottom: 12 }}>
                    You pay {"\u20B9"}{(parseInt(coinAmount) * 100).toLocaleString("en-IN")} for {parseInt(coinAmount).toLocaleString("en-IN")} coins
                  </Text>
                ) : null}

                <View style={styles.quickAmounts}>
                  {QUICK_AMOUNTS.map((amt) => (
                    <PressableScale
                      key={amt}
                      style={[styles.quickBtn, coinAmount === String(amt) && { backgroundColor: "#D97706" + "15", borderColor: "#D97706" }]}
                      onPress={() => { setCoinAmount(String(amt)); }}
                    >
                      <Text style={[styles.quickBtnText, coinAmount === String(amt) && { color: "#D97706" }]}>
                        {amt}
                      </Text>
                    </PressableScale>
                  ))}
                </View>

                <PressableScale
                  haptic="medium"
                  style={[styles.confirmBtn, { backgroundColor: "#D97706" }, (!coinAmount || parseInt(coinAmount) <= 0) && styles.confirmBtnDisabled]}
                  onPress={() => {
                    const amt = parseInt(coinAmount);
                    if (!amt || amt <= 0) { Alert.alert("Invalid", "Enter a valid coin amount."); return; }
                    if (amt > 50000) { Alert.alert("Limit", "Maximum 50,000 coins per purchase."); return; }
                    setCoinModalStep("method");
                  }}
                >
                  <Text style={styles.confirmBtnText}>
                    Buy {coinAmount ? `${parseInt(coinAmount).toLocaleString("en-IN")} Coins` : "Coins"}
                  </Text>
                </PressableScale>
              </>
            )}

            {coinModalStep === "method" && (
              <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 520 }}>
                <View style={styles.modalHeader}>
                  <Pressable onPress={() => setCoinModalStep("amount")} hitSlop={10} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Ionicons name="arrow-back" size={22} color={Colors.text} />
                    <Text style={styles.modalTitle}>Payment Method</Text>
                  </Pressable>
                  <Pressable onPress={() => { resetCoinModal(); setShowBuyCoinsModal(false); }} hitSlop={10}>
                    <Ionicons name="close" size={24} color={Colors.text} />
                  </Pressable>
                </View>

                <View style={[styles.payAmountBanner, { backgroundColor: "#D97706" + "08", borderColor: "#D97706" + "15" }]}>
                  <Text style={styles.payAmountLabel}>Coins to Buy</Text>
                  <Text style={[styles.payAmountValue, { color: "#D97706" }]}>{parseInt(coinAmount).toLocaleString("en-IN")} coins ({"\u20B9"}{(parseInt(coinAmount) * 100).toLocaleString("en-IN")})</Text>
                </View>

                <Text style={styles.methodSectionTitle}>UPI</Text>
                <View style={styles.upiGrid}>
                  {UPI_APPS.map((app) => (
                    <Pressable
                      key={app.id}
                      style={[styles.upiAppBtn, coinSelectedMethod === "upi" && coinSelectedUPI === app.id && styles.upiAppBtnActive]}
                      onPress={() => { try { Haptics.selectionAsync(); } catch {} setCoinSelectedMethod("upi"); setCoinSelectedUPI(app.id); setCoinUpiId(""); }}
                    >
                      <View style={[styles.upiAppIcon, { backgroundColor: app.color + "15" }]}>
                        {app.iconSet === "mci" ? (
                          <MaterialCommunityIcons name={app.icon as any} size={22} color={app.color} />
                        ) : (
                          <Ionicons name={app.icon as any} size={22} color={app.color} />
                        )}
                      </View>
                      <Text style={styles.upiAppName}>{app.name}</Text>
                      {coinSelectedMethod === "upi" && coinSelectedUPI === app.id && (
                        <View style={styles.checkCircle}>
                          <Ionicons name="checkmark" size={12} color="#FFF" />
                        </View>
                      )}
                    </Pressable>
                  ))}
                </View>

                <View style={styles.methodDivider} />

                <Text style={styles.methodSectionTitle}>Net Banking</Text>
                <Pressable
                  style={[styles.methodOption, coinSelectedMethod === "netbanking" && styles.methodOptionActive]}
                  onPress={() => { try { Haptics.selectionAsync(); } catch {} setCoinSelectedMethod("netbanking"); setCoinSelectedUPI(null); setCoinUpiId(""); }}
                >
                  <View style={[styles.methodIconBg, { backgroundColor: "#10B98115" }]}>
                    <MaterialCommunityIcons name="bank" size={22} color="#10B981" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.methodName}>Net Banking</Text>
                    <Text style={styles.methodDesc}>All major Indian banks</Text>
                  </View>
                  <View style={[styles.radioOuter, coinSelectedMethod === "netbanking" && styles.radioOuterActive]}>
                    {coinSelectedMethod === "netbanking" && <View style={styles.radioInner} />}
                  </View>
                </Pressable>

                <View style={{ height: 16 }} />

                <Pressable
                  style={[styles.confirmBtn, { backgroundColor: "#D97706" }, !coinSelectedMethod && styles.confirmBtnDisabled]}
                  onPress={handleBuyCoins}
                >
                  <Ionicons name="shield-checkmark" size={18} color="#FFF" style={{ marginRight: 6 }} />
                  <Text style={styles.confirmBtnText}>
                    Pay {"\u20B9"}{(parseInt(coinAmount) * 100).toLocaleString("en-IN")}
                  </Text>
                </Pressable>

                <View style={styles.secureRow}>
                  <Ionicons name="lock-closed" size={12} color={Colors.textLight} />
                  <Text style={styles.secureText}>100% Secure Payment</Text>
                </View>
              </ScrollView>
            )}

            {coinModalStep === "processing" && (
              <View style={styles.processingContainer}>
                <Animated.View entering={FadeIn.duration(300)} style={styles.processingContent}>
                  <View style={[styles.processingSpinner, { backgroundColor: "#D97706" + "12" }]}>
                    <Ionicons name="sync" size={36} color="#D97706" />
                  </View>
                  <Text style={styles.processingTitle}>Purchasing Coins</Text>
                  <Text style={styles.processingDesc}>
                    Buying {parseInt(coinAmount).toLocaleString("en-IN")} Go Bharat Coins
                  </Text>
                  <Text style={styles.processingHint}>Please do not close this screen</Text>
                </Animated.View>
              </View>
            )}

            {coinModalStep === "success" && (
              <View style={styles.processingContainer}>
                <Animated.View entering={FadeIn.duration(300)} style={styles.processingContent}>
                  <View style={[styles.successCircle, { backgroundColor: "#D97706" }]}>
                    <Ionicons name="diamond" size={40} color="#FFF" />
                  </View>
                  <Text style={[styles.successTitle, { color: "#D97706" }]}>Coins Purchased!</Text>
                  <Text style={styles.successAmount}>{parseInt(coinAmount).toLocaleString("en-IN")} coins</Text>
                  <Text style={styles.processingDesc}>Added to your Go Bharat Coin balance</Text>
                  <Pressable
                    style={[styles.confirmBtn, { marginTop: 24, width: "100%" as any, backgroundColor: "#D97706" }]}
                    onPress={() => { resetCoinModal(); setShowBuyCoinsModal(false); }}
                  >
                    <Text style={styles.confirmBtnText}>Done</Text>
                  </Pressable>
                </Animated.View>
              </View>
            )}
          </View>
        </View>
      </Modal>

      <Modal visible={showRedeemModal} transparent animationType="slide" onRequestClose={() => { resetRedeemModal(); setShowRedeemModal(false); }}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingBottom: bottomInset + 20 }]}>
            <View style={styles.modalHandle} />

            {redeemStep === "amount" && (
              <>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Redeem Coins to Wallet</Text>
                  <Pressable onPress={() => { resetRedeemModal(); setShowRedeemModal(false); }} hitSlop={10}>
                    <Ionicons name="close" size={24} color={Colors.text} />
                  </Pressable>
                </View>

                <View style={{ backgroundColor: "#ECFDF5", borderRadius: 12, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: "#A7F3D0" }}>
                  <Text style={{ fontFamily: "Poppins_500Medium", fontSize: 12, color: "#065F46", textAlign: "center" as const }}>1 Go Bharat Coin = {"\u20B9"}100  ·  Balance: {coinBalance.toLocaleString("en-IN")} coins</Text>
                </View>

                <Text style={styles.inputLabel}>How many coins?</Text>
                <View style={[styles.amountInputRow, { borderColor: Colors.success }]}>
                  <Ionicons name="diamond" size={22} color={Colors.success} style={{ marginRight: 8 }} />
                  <TextInput
                    style={styles.amountInput}
                    value={redeemAmount}
                    onChangeText={(t) => setRedeemAmount(t.replace(/[^0-9]/g, ""))}
                    placeholder="0"
                    placeholderTextColor={Colors.textLight}
                    keyboardType="number-pad"
                    autoFocus
                  />
                  <Pressable
                    onPress={() => { try { Haptics.selectionAsync(); } catch {} setRedeemAmount(String(coinBalance)); }}
                    hitSlop={8}
                    style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: Colors.success + "15" }}
                  >
                    <Text style={{ fontFamily: "Poppins_600SemiBold", fontSize: 13, color: Colors.success }}>MAX</Text>
                  </Pressable>
                </View>

                {redeemAmount && parseInt(redeemAmount) > 0 ? (
                  <View style={[styles.payAmountBanner, { backgroundColor: Colors.success + "08", borderColor: Colors.success + "15" }]}>
                    <Text style={styles.payAmountLabel}>You'll receive in wallet</Text>
                    <Text style={[styles.payAmountValue, { color: Colors.success }]}>{"\u20B9"}{(parseInt(redeemAmount) * 100).toLocaleString("en-IN")}</Text>
                    <Text style={{ fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary, marginTop: 4 }}>New wallet balance: {"\u20B9"}{(walletBalance + parseInt(redeemAmount) * 100).toLocaleString("en-IN")}</Text>
                  </View>
                ) : null}

                {redeemAmount && parseInt(redeemAmount) > coinBalance ? (
                  <Text style={{ fontFamily: "Poppins_500Medium", fontSize: 12, color: Colors.error, textAlign: "center" as const, marginBottom: 12 }}>You only have {coinBalance.toLocaleString("en-IN")} coins.</Text>
                ) : null}

                <Pressable
                  style={[styles.confirmBtn, { backgroundColor: Colors.success }, (!redeemAmount || parseInt(redeemAmount) < 1 || parseInt(redeemAmount) > coinBalance) && styles.confirmBtnDisabled]}
                  disabled={!redeemAmount || parseInt(redeemAmount) < 1 || parseInt(redeemAmount) > coinBalance}
                  onPress={() => { try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {} handleRedeemCoins(); }}
                >
                  <Ionicons name="cash-outline" size={18} color="#FFF" style={{ marginRight: 6 }} />
                  <Text style={styles.confirmBtnText}>
                    {redeemAmount && parseInt(redeemAmount) > 0 ? `Redeem ${"\u20B9"}${(parseInt(redeemAmount) * 100).toLocaleString("en-IN")}` : "Redeem to Wallet"}
                  </Text>
                </Pressable>
              </>
            )}

            {redeemStep === "processing" && (
              <View style={styles.processingContainer}>
                <Animated.View entering={FadeIn.duration(300)} style={styles.processingContent}>
                  <View style={[styles.processingSpinner, { backgroundColor: Colors.success + "12" }]}>
                    <ActivityIndicator size="large" color={Colors.success} />
                  </View>
                  <Text style={styles.processingTitle}>Redeeming Coins</Text>
                  <Text style={styles.processingDesc}>Converting {parseInt(redeemAmount || "0").toLocaleString("en-IN")} coins to wallet money</Text>
                  <Text style={styles.processingHint}>Please do not close this screen</Text>
                </Animated.View>
              </View>
            )}

            {redeemStep === "success" && (
              <View style={styles.processingContainer}>
                <Animated.View entering={FadeIn.duration(300)} style={styles.processingContent}>
                  <View style={[styles.successCircle, { backgroundColor: Colors.success }]}>
                    <Ionicons name="checkmark" size={40} color="#FFF" />
                  </View>
                  <Text style={[styles.successTitle, { color: Colors.success }]}>Redeemed!</Text>
                  <Text style={styles.successAmount}>{"\u20B9"}{redeemedRupees.toLocaleString("en-IN")}</Text>
                  <Text style={styles.processingDesc}>Added to your Go Bharat Wallet</Text>
                  <Pressable
                    style={[styles.confirmBtn, { marginTop: 24, width: "100%" as any, backgroundColor: Colors.success }]}
                    onPress={() => { resetRedeemModal(); setShowRedeemModal(false); setActiveTab("wallet"); }}
                  >
                    <Text style={styles.confirmBtnText}>View Wallet</Text>
                  </Pressable>
                </Animated.View>
              </View>
            )}
          </View>
        </View>
      </Modal>

      <Modal visible={showWithdrawModal} transparent animationType="slide" onRequestClose={() => { resetWithdrawModal(); setShowWithdrawModal(false); }}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingBottom: bottomInset + 20 }]}>
            <View style={styles.modalHandle} />

            {withdrawStep === "amount" && (
              <>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Withdraw to Bank</Text>
                  <Pressable onPress={() => { resetWithdrawModal(); setShowWithdrawModal(false); }} hitSlop={10}>
                    <Ionicons name="close" size={24} color={Colors.text} />
                  </Pressable>
                </View>

                <View style={{ backgroundColor: Colors.secondary + "10", borderRadius: 12, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: Colors.secondary + "20" }}>
                  <Text style={{ fontFamily: "Poppins_500Medium", fontSize: 12, color: Colors.secondary, textAlign: "center" as const }}>Available to withdraw: {"\u20B9"}{walletBalance.toLocaleString("en-IN")}</Text>
                </View>

                <Text style={styles.inputLabel}>Enter Amount</Text>
                <View style={[styles.amountInputRow, { borderColor: Colors.secondary }]}>
                  <Text style={styles.rupeeSymbol}>{"\u20B9"}</Text>
                  <TextInput
                    style={styles.amountInput}
                    value={withdrawAmount}
                    onChangeText={(t) => setWithdrawAmount(t.replace(/[^0-9]/g, ""))}
                    placeholder="0"
                    placeholderTextColor={Colors.textLight}
                    keyboardType="number-pad"
                    autoFocus
                  />
                  <Pressable
                    onPress={() => { try { Haptics.selectionAsync(); } catch {} setWithdrawAmount(String(Math.min(Math.floor(walletBalance), WITHDRAW_MAX))); }}
                    hitSlop={8}
                    style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: Colors.secondary + "15" }}
                  >
                    <Text style={{ fontFamily: "Poppins_600SemiBold", fontSize: 13, color: Colors.secondary }}>MAX</Text>
                  </Pressable>
                </View>

                <View style={styles.quickAmounts}>
                  {WITHDRAW_QUICK.filter((a) => a <= walletBalance).map((amt) => (
                    <Pressable
                      key={amt}
                      style={[styles.quickBtn, withdrawAmount === String(amt) && { backgroundColor: Colors.secondary + "15", borderColor: Colors.secondary }]}
                      onPress={() => { try { Haptics.selectionAsync(); } catch {} setWithdrawAmount(String(amt)); }}
                    >
                      <Text style={[styles.quickBtnText, withdrawAmount === String(amt) && { color: Colors.secondary }]}>
                        {"\u20B9"}{amt.toLocaleString("en-IN")}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                <Text style={{ fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textLight, marginBottom: 16 }}>Min {"\u20B9"}{WITHDRAW_MIN} · Max {"\u20B9"}{WITHDRAW_MAX.toLocaleString("en-IN")} per request. Withdrawals are reviewed and paid to your account.</Text>

                <Pressable
                  style={[styles.confirmBtn, { backgroundColor: Colors.secondary }, (!withdrawAmount || parseInt(withdrawAmount) < WITHDRAW_MIN) && styles.confirmBtnDisabled]}
                  onPress={handleProceedToWithdraw}
                >
                  <Text style={styles.confirmBtnText}>
                    Continue {withdrawAmount ? `\u20B9${parseInt(withdrawAmount).toLocaleString("en-IN")}` : ""}
                  </Text>
                </Pressable>
              </>
            )}

            {withdrawStep === "details" && (
              <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 540 }} keyboardShouldPersistTaps="handled">
                <View style={styles.modalHeader}>
                  <Pressable onPress={() => setWithdrawStep("amount")} hitSlop={10} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Ionicons name="arrow-back" size={22} color={Colors.text} />
                    <Text style={styles.modalTitle}>Payout Details</Text>
                  </Pressable>
                  <Pressable onPress={() => { resetWithdrawModal(); setShowWithdrawModal(false); }} hitSlop={10}>
                    <Ionicons name="close" size={24} color={Colors.text} />
                  </Pressable>
                </View>

                <View style={[styles.payAmountBanner, { backgroundColor: Colors.secondary + "08", borderColor: Colors.secondary + "15" }]}>
                  <Text style={styles.payAmountLabel}>Withdrawal Amount</Text>
                  <Text style={[styles.payAmountValue, { color: Colors.secondary }]}>{"\u20B9"}{parseInt(withdrawAmount).toLocaleString("en-IN")}</Text>
                </View>

                <Text style={styles.methodSectionTitle}>Payout Method</Text>
                <View style={{ flexDirection: "row", gap: 10, marginBottom: 16 }}>
                  <Pressable
                    style={[styles.methodOption, { flex: 1, marginBottom: 0 }, withdrawMethod === "UPI" && styles.methodOptionActive]}
                    onPress={() => { try { Haptics.selectionAsync(); } catch {} setWithdrawMethod("UPI"); }}
                  >
                    <View style={[styles.methodIconBg, { backgroundColor: "#5F259F15" }]}>
                      <MaterialCommunityIcons name="cellphone" size={20} color="#5F259F" />
                    </View>
                    <Text style={styles.methodName}>UPI</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.methodOption, { flex: 1, marginBottom: 0 }, withdrawMethod === "BANK" && styles.methodOptionActive]}
                    onPress={() => { try { Haptics.selectionAsync(); } catch {} setWithdrawMethod("BANK"); }}
                  >
                    <View style={[styles.methodIconBg, { backgroundColor: "#10B98115" }]}>
                      <MaterialCommunityIcons name="bank" size={20} color="#10B981" />
                    </View>
                    <Text style={styles.methodName}>Bank</Text>
                  </Pressable>
                </View>

                {withdrawMethod === "UPI" ? (
                  <View style={styles.cardForm}>
                    <Text style={styles.inputLabel}>UPI ID</Text>
                    <TextInput
                      style={styles.cardInput}
                      placeholder="yourname@bank"
                      placeholderTextColor={Colors.textLight}
                      value={wUpiId}
                      onChangeText={setWUpiId}
                      autoCapitalize="none"
                    />
                  </View>
                ) : (
                  <View style={styles.cardForm}>
                    <Text style={styles.inputLabel}>Bank Name</Text>
                    <TextInput style={styles.cardInput} placeholder="e.g. State Bank of India" placeholderTextColor={Colors.textLight} value={wBankName} onChangeText={setWBankName} />
                    <Text style={styles.inputLabel}>Account Number</Text>
                    <TextInput style={styles.cardInput} placeholder="Account number" placeholderTextColor={Colors.textLight} value={wAccountNumber} onChangeText={(t) => setWAccountNumber(t.replace(/[^0-9]/g, ""))} keyboardType="number-pad" />
                    <Text style={styles.inputLabel}>IFSC Code</Text>
                    <TextInput style={styles.cardInput} placeholder="e.g. SBIN0001234" placeholderTextColor={Colors.textLight} value={wIfsc} onChangeText={(t) => setWIfsc(t.toUpperCase())} autoCapitalize="characters" />
                  </View>
                )}

                <View style={{ height: 16 }} />

                <Pressable style={[styles.confirmBtn, { backgroundColor: Colors.secondary }]} onPress={handleSubmitWithdraw}>
                  <Ionicons name="cash-outline" size={18} color="#FFF" style={{ marginRight: 6 }} />
                  <Text style={styles.confirmBtnText}>Request {"\u20B9"}{parseInt(withdrawAmount).toLocaleString("en-IN")}</Text>
                </Pressable>

                <View style={styles.secureRow}>
                  <Ionicons name="lock-closed" size={12} color={Colors.textLight} />
                  <Text style={styles.secureText}>Your details are used only for this payout</Text>
                </View>
              </ScrollView>
            )}

            {withdrawStep === "processing" && (
              <View style={styles.processingContainer}>
                <Animated.View entering={FadeIn.duration(300)} style={styles.processingContent}>
                  <View style={[styles.processingSpinner, { backgroundColor: Colors.secondary + "12" }]}>
                    <ActivityIndicator size="large" color={Colors.secondary} />
                  </View>
                  <Text style={styles.processingTitle}>Submitting Request</Text>
                  <Text style={styles.processingDesc}>Requesting withdrawal of {"\u20B9"}{parseInt(withdrawAmount || "0").toLocaleString("en-IN")}</Text>
                  <Text style={styles.processingHint}>Please do not close this screen</Text>
                </Animated.View>
              </View>
            )}

            {withdrawStep === "success" && (
              <View style={styles.processingContainer}>
                <Animated.View entering={FadeIn.duration(300)} style={styles.processingContent}>
                  <View style={[styles.successCircle, { backgroundColor: Colors.secondary }]}>
                    <Ionicons name="checkmark" size={40} color="#FFF" />
                  </View>
                  <Text style={[styles.successTitle, { color: Colors.secondary }]}>Request Submitted</Text>
                  <Text style={styles.successAmount}>{"\u20B9"}{withdrawnAmount.toLocaleString("en-IN")}</Text>
                  <Text style={styles.processingDesc}>We'll review your request and pay it to your {withdrawMethod === "UPI" ? "UPI" : "bank account"} shortly. The amount is held from your wallet.</Text>
                  <Pressable
                    style={[styles.confirmBtn, { marginTop: 24, width: "100%" as any, backgroundColor: Colors.secondary }]}
                    onPress={() => { resetWithdrawModal(); setShowWithdrawModal(false); }}
                  >
                    <Text style={styles.confirmBtnText}>Done</Text>
                  </Pressable>
                </Animated.View>
              </View>
            )}
          </View>
        </View>
      </Modal>

      <Modal visible={showReceiptModal} animationType="slide" onRequestClose={() => setShowReceiptModal(false)}>
        {selectedInvoice && (
          <View style={{ flex: 1, paddingTop: topInset }}>
            <InvoiceView invoice={selectedInvoice} onClose={() => { setShowReceiptModal(false); setSelectedInvoice(null); }} />
          </View>
        )}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { paddingBottom: 20, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, marginBottom: 20 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center" },
  headerTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 18, color: "#FFF" },
  balanceCard: { alignItems: "center", backgroundColor: "rgba(255,255,255,0.1)", marginHorizontal: 20, borderRadius: 16, paddingVertical: 20 },
  balanceLabel: { fontFamily: "Poppins_400Regular", fontSize: 13, color: "rgba(255,255,255,0.7)" },
  balanceAmount: { fontFamily: "Poppins_700Bold", fontSize: 36, color: "#FFF", marginTop: 4 },
  statsRow: { flexDirection: "row", marginHorizontal: 20, marginTop: 12 },
  statBox: { flex: 1, alignItems: "center", paddingVertical: 10, gap: 4 },
  statAmount: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: "#FFF" },
  statLabel: { fontFamily: "Poppins_400Regular", fontSize: 11, color: "rgba(255,255,255,0.5)" },
  content: { flex: 1, paddingHorizontal: 20, paddingTop: 20 },
  sectionTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 16, color: Colors.text, marginBottom: 14 },
  txnCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFF",
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  txnLeft: { flexDirection: "row", alignItems: "center", flex: 1 },
  txnIconBg: { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  txnInfo: { marginLeft: 12, flex: 1 },
  txnRef: { fontFamily: "Poppins_500Medium", fontSize: 14, color: Colors.text },
  txnDate: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textLight, marginTop: 2 },
  txnRight: { alignItems: "flex-end" as const, gap: 4 },
  txnAmount: { fontFamily: "Poppins_700Bold", fontSize: 16 },
  viewReceiptBtn: { flexDirection: "row" as const, alignItems: "center" as const, gap: 3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: Colors.primary + "10" },
  viewReceiptText: { fontFamily: "Poppins_500Medium", fontSize: 11, color: Colors.primary },
  emptyState: { alignItems: "center", paddingTop: 60 },
  emptyText: { fontFamily: "Poppins_500Medium", fontSize: 14, color: Colors.textLight, marginTop: 12 },
  bottomBar: { paddingHorizontal: 20, paddingTop: 12, backgroundColor: "#FFF", borderTopWidth: 1, borderTopColor: Colors.borderLight },
  addMoneyBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 14,
  },
  addMoneyText: { fontFamily: "Poppins_600SemiBold", fontSize: 16, color: "#FFF" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalContent: { backgroundColor: "#FFF", borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 24, paddingTop: 12 },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.borderLight, alignSelf: "center", marginBottom: 16 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 24 },
  modalTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 18, color: Colors.text },
  inputLabel: { fontFamily: "Poppins_500Medium", fontSize: 13, color: Colors.textSecondary, marginBottom: 8 },
  amountInputRow: { flexDirection: "row", alignItems: "center", borderWidth: 2, borderColor: Colors.primary, borderRadius: 14, paddingHorizontal: 16, height: 60, marginBottom: 20 },
  rupeeSymbol: { fontFamily: "Poppins_700Bold", fontSize: 28, color: Colors.text, marginRight: 4 },
  amountInput: { flex: 1, fontFamily: "Poppins_700Bold", fontSize: 28, color: Colors.text },
  quickAmounts: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 24 },
  quickBtn: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 20, backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.borderLight },
  quickBtnActive: { backgroundColor: Colors.primary + "15", borderColor: Colors.primary },
  quickBtnText: { fontFamily: "Poppins_500Medium", fontSize: 14, color: Colors.textSecondary },
  quickBtnTextActive: { color: Colors.primary },
  confirmBtn: { backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 16, alignItems: "center", flexDirection: "row" as const, justifyContent: "center" as const },
  confirmBtnDisabled: { opacity: 0.5 },
  confirmBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 16, color: "#FFF" },
  payAmountBanner: { backgroundColor: Colors.secondary + "08", borderRadius: 12, padding: 14, alignItems: "center" as const, marginBottom: 20, borderWidth: 1, borderColor: Colors.secondary + "15" },
  payAmountLabel: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary },
  payAmountValue: { fontFamily: "Poppins_700Bold", fontSize: 24, color: Colors.secondary, marginTop: 2 },
  methodSectionTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: Colors.text, marginBottom: 10, marginTop: 4 },
  upiGrid: { flexDirection: "row" as const, flexWrap: "wrap" as const, gap: 10, marginBottom: 16 },
  upiAppBtn: { width: "47%" as any, flexDirection: "row" as const, alignItems: "center" as const, backgroundColor: "#FFF", borderRadius: 12, padding: 12, gap: 10, borderWidth: 1.5, borderColor: Colors.borderLight },
  upiAppBtnActive: { borderColor: Colors.primary, backgroundColor: Colors.primary + "08" },
  upiAppIcon: { width: 40, height: 40, borderRadius: 10, alignItems: "center" as const, justifyContent: "center" as const },
  upiAppName: { fontFamily: "Poppins_500Medium", fontSize: 13, color: Colors.text, flex: 1 },
  checkCircle: { width: 20, height: 20, borderRadius: 10, backgroundColor: Colors.primary, alignItems: "center" as const, justifyContent: "center" as const },
  upiIdRow: { marginBottom: 8 },
  upiIdLabel: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary, marginBottom: 6 },
  upiIdInputRow: { flexDirection: "row" as const, alignItems: "center" as const, borderWidth: 1.5, borderColor: Colors.borderLight, borderRadius: 12, paddingHorizontal: 14, height: 48, gap: 8 },
  upiIdInput: { flex: 1, fontFamily: "Poppins_500Medium", fontSize: 14, color: Colors.text },
  methodDivider: { height: 1, backgroundColor: Colors.borderLight, marginVertical: 16 },
  methodOption: { flexDirection: "row" as const, alignItems: "center" as const, backgroundColor: "#FFF", borderRadius: 14, padding: 14, gap: 12, borderWidth: 1.5, borderColor: Colors.borderLight, marginBottom: 10 },
  methodOptionActive: { borderColor: Colors.primary, backgroundColor: Colors.primary + "06" },
  methodIconBg: { width: 44, height: 44, borderRadius: 12, alignItems: "center" as const, justifyContent: "center" as const },
  methodName: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: Colors.text },
  methodDesc: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary, marginTop: 1 },
  radioOuter: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: Colors.borderLight, alignItems: "center" as const, justifyContent: "center" as const },
  radioOuterActive: { borderColor: Colors.primary },
  radioInner: { width: 12, height: 12, borderRadius: 6, backgroundColor: Colors.primary },
  cardForm: { paddingHorizontal: 4, gap: 10, marginBottom: 10 },
  cardInput: { borderWidth: 1.5, borderColor: Colors.borderLight, borderRadius: 12, paddingHorizontal: 14, height: 48, fontFamily: "Poppins_500Medium", fontSize: 14, color: Colors.text },
  bankGrid: { flexDirection: "row" as const, flexWrap: "wrap" as const, gap: 8, marginBottom: 10, paddingHorizontal: 4 },
  bankChip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, backgroundColor: "#FFF", borderWidth: 1.5, borderColor: Colors.borderLight, flexDirection: "row" as const, alignItems: "center" as const, gap: 6 },
  bankDot: { width: 8, height: 8, borderRadius: 4 },
  bankChipText: { fontFamily: "Poppins_500Medium", fontSize: 13, color: Colors.text },
  secureRow: { flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "center" as const, gap: 4, marginTop: 12, marginBottom: 4 },
  secureText: { fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textLight },
  processingContainer: { paddingVertical: 40, alignItems: "center" as const },
  processingContent: { alignItems: "center" as const, paddingHorizontal: 20, width: "100%" as any },
  processingSpinner: { width: 72, height: 72, borderRadius: 36, backgroundColor: Colors.primary + "12", alignItems: "center" as const, justifyContent: "center" as const, marginBottom: 20 },
  processingTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 18, color: Colors.text, marginBottom: 8 },
  processingDesc: { fontFamily: "Poppins_400Regular", fontSize: 14, color: Colors.textSecondary, textAlign: "center" as const },
  processingHint: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textLight, marginTop: 16 },
  successCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: "#22C55E", alignItems: "center" as const, justifyContent: "center" as const, marginBottom: 20 },
  successTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 20, color: "#22C55E", marginBottom: 4 },
  successAmount: { fontFamily: "Poppins_700Bold", fontSize: 32, color: Colors.text, marginBottom: 4 },
});

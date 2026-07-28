import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  Alert,
  TextInput,
  Modal,
  ActivityIndicator,
  Animated,
  AppState,
  AppStateStatus,
  Image,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import * as WebBrowser from "expo-web-browser";
import Colors from "@/constants/colors";
import { useApp } from "@/lib/store";
import { apiRequest, getApiUrl } from "@/lib/query-client";

type PaymentMethod = "upi" | "netbanking" | "phonepe" | "wallet" | "coins" | "cod" | "vendor_qr";

const UPI_APPS = [
  { id: "gpay", name: "Google Pay", color: "#4285F4" },
  { id: "phonepe", name: "PhonePe", color: "#5F259F" },
  { id: "paytm", name: "Paytm", color: "#00BAF2" },
  { id: "bhim", name: "BHIM", color: "#00695C" },
];

const BANKS = [
  { id: "sbi", name: "SBI", color: "#1A237E" },
  { id: "hdfc", name: "HDFC", color: "#004C8F" },
  { id: "icici", name: "ICICI", color: "#F37920" },
  { id: "axis", name: "Axis", color: "#800020" },
  { id: "kotak", name: "Kotak", color: "#ED1C24" },
  { id: "pnb", name: "PNB", color: "#1B3C73" },
  { id: "bob", name: "BOB", color: "#F36F21" },
  { id: "union", name: "Union Bank", color: "#003DA5" },
];

const PAYMENT_METHODS: {
  id: PaymentMethod;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  desc: string;
}[] = [
  { id: "vendor_qr", label: "Pay by Scanning Vendor QR", icon: "qr-code", color: "#0F766E", desc: "Scan the vendor's UPI QR and pay directly" },
  { id: "wallet", label: "Wallet", icon: "wallet", color: "#10B981", desc: "Pay from Go Bharat Wallet" },
  { id: "coins", label: "Go Bharat Coins", icon: "diamond", color: "#D97706", desc: "Pay with your earned coins" },
  { id: "cod", label: "Cash on Delivery", icon: "cash", color: "#F59E0B", desc: "Pay when delivered" },
];

export default function PaymentScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    amount: string;
    itemCount: string;
    vendorName: string;
    orderId: string;
    address: string;
    deliveryNote: string;
    deliverySpeed: string;
    seatInfo: string;
    codEnabled: string;
    payment_status: string;          // web: set by Razorpay or PhonePe checkout redirect
    razorpay_order_id: string;       // web: set by Razorpay checkout redirect
    phonepe_transaction_id: string;  // web: set by PhonePe return page redirect
    vendorId: string;
  }>();

  const { walletBalance, deductWallet, placeOrder, cart, addresses, user, coinBalance, redeemCoins, liveVendors } = useApp();

  const cartVendorId = params.vendorId || cart[0]?.vendorId || "";
  const cartVendor = liveVendors.find((v) => v.id === cartVendorId);
  const vendorQrAvailable = !!cartVendor?.hasPaymentQr || !!cartVendor?.upiId;
  // If vendor has a UPI ID, generate QR dynamically — no file upload needed.
  // Otherwise fall back to the stored QR image (legacy).
  const vendorQrImageUri = cartVendor?.upiId
    ? `https://quickchart.io/qr?text=${encodeURIComponent(`upi://pay?pa=${cartVendor.upiId}&pn=${encodeURIComponent(cartVendor.name)}&cu=INR`)}&size=300&margin=2`
    : vendorQrAvailable
      ? `${getApiUrl()}/api/vendors/${cartVendorId}/payment-qr`
      : "";

  const isGuest = user?.phone === "guest" || user?.phone === "" || !user?.phone;

  if (isGuest) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#F8F9FB", paddingHorizontal: 32 }}>
        <Ionicons name="lock-closed-outline" size={48} color={Colors.primary} />
        <Text style={{ fontFamily: "Poppins_600SemiBold", fontSize: 18, color: Colors.text, marginTop: 16, textAlign: "center" }}>Sign Up Required</Text>
        <Text style={{ fontFamily: "Poppins_400Regular", fontSize: 14, color: Colors.textSecondary, marginTop: 8, textAlign: "center", lineHeight: 20 }}>Please sign up with your phone number to place an order. Guest users can browse but cannot purchase.</Text>
        <Pressable onPress={() => router.replace("/auth" as any)} style={{ marginTop: 24, backgroundColor: Colors.primary, paddingVertical: 14, paddingHorizontal: 32, borderRadius: 12 }}>
          <Text style={{ fontFamily: "Poppins_600SemiBold", fontSize: 15, color: "#FFF" }}>Sign Up Now</Text>
        </Pressable>
        <Pressable onPress={() => router.back()} style={{ marginTop: 12 }}>
          <Text style={{ fontFamily: "Poppins_500Medium", fontSize: 14, color: Colors.textSecondary }}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  const isCodAllowed = params.codEnabled === "true";
  const availablePaymentMethods = PAYMENT_METHODS.filter((m) => {
    if (m.id === "cod" && !isCodAllowed) return false;
    if (m.id === "vendor_qr" && !vendorQrAvailable) return false;
    return true;
  });

  const amount = parseFloat(params.amount || "0");
  const itemCount = parseInt(params.itemCount || String(cart.length), 10);
  const vendorName = params.vendorName || (cart[0]?.vendorName ?? "Store");
  const orderId = params.orderId || "";
  const deliveryAddress = params.address || addresses[0]?.fullAddress || "Delivery Address";
  const deliveryNote = params.deliveryNote || "";
  const deliverySpeed = (params.deliverySpeed || "standard") as "express" | "standard" | "scheduled";
  const seatInfoParam = params.seatInfo || "";

  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 : insets.bottom;

  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>(vendorQrAvailable ? "vendor_qr" : "upi");
  const [vendorQrConfirming, setVendorQrConfirming] = useState(false);
  const [upiId, setUpiId] = useState("");
  const [selectedUpiApp, setSelectedUpiApp] = useState<string | null>(null);
  const [selectedBank, setSelectedBank] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  const successScale = useRef(new Animated.Value(0)).current;
  const successOpacity = useRef(new Animated.Value(0)).current;
  const checkScale = useRef(new Animated.Value(0)).current;

  const pendingRazorpayOrderId = useRef<string | null>(null);
  const pendingPhonePeTransactionId = useRef<string | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const pollCountRef = useRef(0);
  const ppPollCountRef = useRef(0);

  const pollRazorpayStatus = useCallback(async (razorpayOrderId: string) => {
    const MAX_ATTEMPTS = 6;
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      try {
        await new Promise((resolve) => setTimeout(resolve, i === 0 ? 1000 : 2000));
        const statusRes = await apiRequest("GET", `/api/payments/razorpay-order-status/${razorpayOrderId}`);
        const statusData = await statusRes.json();
        if (statusData.status === "paid") {
          pendingRazorpayOrderId.current = null;
          pollCountRef.current = 0;
          setProcessing(false);
          showSuccessAnimation();
          setTimeout(() => completeOrder(), 2000);
          return true;
        }
      } catch {}
    }
    pendingRazorpayOrderId.current = null;
    pollCountRef.current = 0;
    setProcessing(false);
    return false;
  }, []);

  const pollPhonePeStatus = useCallback(async (transactionId: string) => {
    const MAX_ATTEMPTS = 6;
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      try {
        await new Promise((resolve) => setTimeout(resolve, i === 0 ? 1000 : 2000));
        const statusRes = await apiRequest("GET", `/api/payments/phonepe-status/${transactionId}`);
        const statusData = await statusRes.json();
        if (statusData.status === "paid") {
          pendingPhonePeTransactionId.current = null;
          ppPollCountRef.current = 0;
          setProcessing(false);
          showSuccessAnimation();
          setTimeout(() => completeOrder(), 2000);
          return true;
        }
        if (statusData.status === "failed") {
          pendingPhonePeTransactionId.current = null;
          ppPollCountRef.current = 0;
          setProcessing(false);
          setPaymentError("Payment failed. Please try another method.");
          return false;
        }
      } catch {}
    }
    pendingPhonePeTransactionId.current = null;
    ppPollCountRef.current = 0;
    setProcessing(false);
    return false;
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", async (nextState: AppStateStatus) => {
      const prevState = appStateRef.current;
      appStateRef.current = nextState;
      if (prevState === "background" && nextState === "active") {
        if (pendingRazorpayOrderId.current) {
          const razorpayOrderId = pendingRazorpayOrderId.current;
          pollCountRef.current += 1;
          if (pollCountRef.current > 3) {
            pendingRazorpayOrderId.current = null;
            setProcessing(false);
            Alert.alert("Payment Check", "Please try paying again or contact support if amount was deducted.");
            return;
          }
          const paid = await pollRazorpayStatus(razorpayOrderId);
          if (!paid) {
            Alert.alert(
              "Payment Pending",
              "We could not confirm your payment yet. If money was deducted, it will be auto-credited within 48 hours. Try again?",
              [
                { text: "Retry", onPress: () => { pendingRazorpayOrderId.current = razorpayOrderId; setProcessing(true); pollRazorpayStatus(razorpayOrderId); } },
                { text: "Cancel", style: "cancel", onPress: () => setProcessing(false) },
              ]
            );
          }
        }
        if (pendingPhonePeTransactionId.current) {
          const txnId = pendingPhonePeTransactionId.current;
          ppPollCountRef.current += 1;
          if (ppPollCountRef.current > 3) {
            pendingPhonePeTransactionId.current = null;
            setProcessing(false);
            Alert.alert("Payment Check", "Please try paying again or contact support if amount was deducted.");
            return;
          }
          const paid = await pollPhonePeStatus(txnId);
          if (!paid) {
            Alert.alert(
              "Payment Pending",
              "We could not confirm your PhonePe payment yet. If money was deducted, it will be auto-credited within 48 hours. Try again?",
              [
                { text: "Retry", onPress: () => { pendingPhonePeTransactionId.current = txnId; setProcessing(true); pollPhonePeStatus(txnId); } },
                { text: "Cancel", style: "cancel", onPress: () => setProcessing(false) },
              ]
            );
          }
        }
      }
    });
    return () => subscription.remove();
  }, [pollRazorpayStatus, pollPhonePeStatus]);

  // Web (Median): detect return from Razorpay or PhonePe checkout via URL params
  const webReturnHandledRef = useRef(false);
  useEffect(() => {
    if (Platform.OS !== "web") return;
    if (webReturnHandledRef.current) return;
    const paymentStatus = params.payment_status;
    const razorpayOrderId = params.razorpay_order_id;
    const phonePeTransactionId = params.phonepe_transaction_id;

    // Clear stale payment params from URL so a refresh doesn't re-trigger handling
    const cleanUrl = () => {
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete("payment_status");
        url.searchParams.delete("razorpay_order_id");
        url.searchParams.delete("phonepe_transaction_id");
        window.history.replaceState({}, "", url.toString());
      } catch {}
    };

    // Handle PhonePe return
    if (phonePeTransactionId) {
      webReturnHandledRef.current = true;
      cleanUrl();
      if (paymentStatus === "failed") {
        setPaymentError("Payment failed. Please try another method.");
      } else if (paymentStatus === "cancelled") {
        setPaymentError("Payment was cancelled. Please try again.");
      } else {
        setProcessing(true);
        setPaymentError(null);
        pollPhonePeStatus(phonePeTransactionId).then((paid) => {
          if (!paid) {
            setProcessing(false);
            setPaymentError("Payment could not be confirmed. If amount was deducted, it will be refunded within 48 hours.");
          }
        });
      }
      return;
    }

    // Handle Razorpay return: poll whenever razorpay_order_id is present (success or unknown status)
    if (razorpayOrderId && paymentStatus !== "cancelled" && paymentStatus !== "failed") {
      webReturnHandledRef.current = true;
      cleanUrl();
      setProcessing(true);
      setPaymentError(null);
      pollRazorpayStatus(razorpayOrderId).then((paid) => {
        if (!paid) {
          setProcessing(false);
          setPaymentError("Payment could not be confirmed. If amount was deducted, it will be refunded within 48 hours.");
        }
      });
    } else if (paymentStatus === "cancelled" || paymentStatus === "failed") {
      webReturnHandledRef.current = true;
      cleanUrl();
      setPaymentError("Payment was cancelled. Please try again.");
    }
  }, [params.payment_status, params.razorpay_order_id, params.phonepe_transaction_id, pollRazorpayStatus, pollPhonePeStatus]);

  const showSuccessAnimation = () => {
    setShowSuccess(true);
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
    Animated.sequence([
      Animated.parallel([
        Animated.spring(successScale, {
          toValue: 1,
          friction: 5,
          tension: 80,
          useNativeDriver: true,
        }),
        Animated.timing(successOpacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]),
      Animated.spring(checkScale, {
        toValue: 1,
        friction: 4,
        tension: 100,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const completeOrder = (paymentInfo?: { method?: "ONLINE" | "COD" | "WALLET" | "COINS" | "VENDOR_QR"; status?: "PAID" | "PENDING_VERIFICATION" }) => {
    if (orderId) {
      router.replace(`/order/${orderId}` as any);
    } else {
      const seatSelections: Record<string, { label: string; class?: string }> = {};
      if (seatInfoParam) {
        seatInfoParam.split(",").forEach((entry) => {
          const [pid, seatData] = entry.split(":");
          if (pid && seatData) {
            const [label, seatClass] = seatData.split("|");
            seatSelections[pid] = { label, class: seatClass || undefined };
          }
        });
      }
      const order = placeOrder(deliveryAddress, deliveryNote || undefined, deliverySpeed, Object.keys(seatSelections).length > 0 ? seatSelections : undefined, amount, paymentInfo);
      router.replace(`/order/${order.id}` as any);
    }
  };

  const handleRazorpayPayment = async (preferredMethod: "upi" | "netbanking") => {
    setProcessing(true);
    setPaymentError(null);
    pollCountRef.current = 0;
    try {
      const response = await apiRequest("POST", "/api/payments/razorpay-create-order", {
        amount,
        orderId: orderId || `ORD_${Date.now()}`,
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
      checkoutUrl.searchParams.set("description", `Order - ${vendorName}`);
      checkoutUrl.searchParams.set("prefill_contact", "");
      checkoutUrl.searchParams.set("method", preferredMethod);

      if (Platform.OS === "web") {
        // Median Android WebView: popups are blocked, use direct full-page navigation.
        // Build a return_url pointing back to this payment screen with current params intact.
        const returnUrl = new URL(window.location.href);
        returnUrl.searchParams.delete("payment_status");
        returnUrl.searchParams.delete("razorpay_order_id");
        checkoutUrl.searchParams.set("return_url", returnUrl.toString());
        // Navigate away — the checkout page will redirect back with payment_status param.
        window.location.href = checkoutUrl.toString();
        return; // component unmounts here
      }

      pendingRazorpayOrderId.current = data.orderId;

      let result;
      try {
        result = await WebBrowser.openBrowserAsync(checkoutUrl.toString(), {
          dismissButtonStyle: "close",
          showInRecents: true,
        });
      } catch (browserErr) {
        pendingRazorpayOrderId.current = null;
        setProcessing(false);
        return;
      }
      try { await WebBrowser.coolDownAsync(); } catch {}

      if (result && result.type === "cancel") {
        pendingRazorpayOrderId.current = null;
        setProcessing(false);
        return;
      }

      if (result && result.type === "opened") {
        return;
      }

      const paid = await pollRazorpayStatus(data.orderId);
      if (!paid) {
        setProcessing(false);
      }
    } catch (error: any) {
      pendingRazorpayOrderId.current = null;
      setProcessing(false);
      const msg = error?.message || "Payment failed. Please try again.";
      setPaymentError(msg);
      Alert.alert("Payment Error", msg);
    }
  };

  const handlePhonePePayment = async () => {
    setProcessing(true);
    setPaymentError(null);
    ppPollCountRef.current = 0;
    try {
      const returnUrlForServer = Platform.OS === "web" ? (() => {
        try {
          const u = new URL(window.location.href);
          u.searchParams.delete("payment_status");
          u.searchParams.delete("phonepe_transaction_id");
          return u.toString();
        } catch { return ""; }
      })() : "";

      const response = await apiRequest("POST", "/api/payments/phonepe-initiate", {
        amount,
        orderId: orderId || `ORD_${Date.now()}`,
        returnUrl: returnUrlForServer,
      });
      const data = await response.json();
      if (!data.redirectUrl || !data.transactionId) {
        throw new Error(data.error || "Failed to initiate PhonePe payment");
      }

      if (Platform.OS === "web") {
        // Median Android WebView: full-page navigation, same as Razorpay pattern.
        // The server already embedded our returnUrl in the phonepe-return redirect endpoint.
        // Navigate to PhonePe hosted page — it will redirect back to phonepe-return, which
        // then redirects back to this payment screen with phonepe_transaction_id + payment_status.
        window.location.href = data.redirectUrl;
        return;
      }

      pendingPhonePeTransactionId.current = data.transactionId;

      let result;
      try {
        result = await WebBrowser.openBrowserAsync(data.redirectUrl, {
          dismissButtonStyle: "close",
          showInRecents: true,
        });
      } catch (browserErr) {
        pendingPhonePeTransactionId.current = null;
        setProcessing(false);
        return;
      }
      try { await WebBrowser.coolDownAsync(); } catch {}

      if (result && result.type === "cancel") {
        pendingPhonePeTransactionId.current = null;
        setProcessing(false);
        return;
      }

      if (result && result.type === "opened") {
        return;
      }

      const paid = await pollPhonePeStatus(data.transactionId);
      if (!paid) {
        setProcessing(false);
      }
    } catch (error: any) {
      pendingPhonePeTransactionId.current = null;
      setProcessing(false);
      const msg = error?.message || "Payment failed. Please try again.";
      setPaymentError(msg);
      Alert.alert("Payment Error", msg);
    }
  };

  const handlePayment = () => {
    if (amount <= 0) {
      Alert.alert("Invalid Amount", "Order amount is invalid.");
      return;
    }

    if (selectedMethod === "upi") {
      handleRazorpayPayment("upi");
      return;
    }

    if (selectedMethod === "netbanking") {
      handleRazorpayPayment("netbanking");
      return;
    }

    if (selectedMethod === "phonepe") {
      handlePhonePePayment();
      return;
    }

    if (selectedMethod === "vendor_qr") {
      // Guard: vendor-QR orders must go through the dedicated "I've Paid"
      // confirmation in renderVendorQrSection so they're saved with
      // paymentMethod=VENDOR_QR + paymentStatus=PENDING_VERIFICATION.
      Alert.alert(
        "Confirm QR Payment",
        "Please scan the vendor's QR with your UPI app, then tap \"I've Paid\" below the QR to submit your order for vendor verification.",
      );
      return;
    }

    if (selectedMethod === "wallet" && walletBalance < amount) {
      Alert.alert("Insufficient Balance", `Your wallet balance (\u20B9${walletBalance}) is less than the order amount (\u20B9${amount}).`);
      return;
    }

    const coinsNeeded = Math.ceil(amount / 100);
    if (selectedMethod === "coins" && coinBalance < coinsNeeded) {
      Alert.alert("Insufficient Coins", `You have ${coinBalance} coins but need ${coinsNeeded} coins to pay ₹${amount}.`);
      return;
    }

    setProcessing(true);

    setTimeout(() => {
      setProcessing(false);

      if (selectedMethod === "wallet") {
        const success = deductWallet(amount, orderId ? `Payment - ${orderId}` : "Order Payment");
        if (!success) {
          setPaymentError("Insufficient wallet balance. Please try another method.");
          return;
        }
        showSuccessAnimation();
        setTimeout(() => completeOrder({ method: "WALLET", status: "PAID" }), 2000);
        return;
      }

      if (selectedMethod === "coins") {
        const success = redeemCoins(coinsNeeded, orderId ? `Payment - ${orderId}` : "Order Payment");
        if (!success) {
          setPaymentError("Insufficient coins. Please try another method.");
          return;
        }
        showSuccessAnimation();
        setTimeout(() => completeOrder({ method: "COINS", status: "PAID" }), 2000);
        return;
      }

      showSuccessAnimation();
      setTimeout(() => completeOrder(), 2000);
    }, 2000);
  };

  const renderUpiSection = () => (
    <View style={styles.methodDetails}>
      <View style={styles.gatewayBadge}>
        <Ionicons name="shield-checkmark" size={14} color="#6C3EC1" />
        <Text style={[styles.gatewayBadgeText, { color: "#6C3EC1" }]}>Powered by Razorpay</Text>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
        {UPI_APPS.map((app) => (
          <Pressable
            key={app.id}
            onPress={() => setSelectedUpiApp(app.id)}
            style={[
              { flex: 1, minWidth: "45%", padding: 12, borderRadius: 10, borderWidth: 1.5, alignItems: "center" },
              selectedUpiApp === app.id
                ? { borderColor: app.color, backgroundColor: app.color + "10" }
                : { borderColor: "#E5E7EB", backgroundColor: "#F9FAFB" },
            ]}
          >
            <Ionicons name="phone-portrait" size={20} color={app.color} />
            <Text style={{ fontSize: 12, fontWeight: "600", color: "#333", marginTop: 4 }}>{app.name}</Text>
          </Pressable>
        ))}
      </View>
      <Pressable
        style={styles.payBtn}
        onPress={() => handleRazorpayPayment("upi")}
        disabled={processing}
      >
        {processing ? (
          <ActivityIndicator color="#FFF" size="small" />
        ) : (
          <>
            <Ionicons name="phone-portrait" size={20} color="#FFF" />
            <Text style={styles.payBtnText}>Pay ₹{amount} via UPI</Text>
          </>
        )}
      </Pressable>
      {paymentError && (
        <View style={styles.paymentErrorBox}>
          <Ionicons name="alert-circle" size={16} color={Colors.error} />
          <Text style={styles.paymentErrorText}>{paymentError}</Text>
        </View>
      )}
    </View>
  );

  const renderNetBankingSection = () => (
    <View style={styles.methodDetails}>
      <View style={[styles.gatewayBadge, { backgroundColor: "#0EA5E912" }]}>
        <Ionicons name="shield-checkmark" size={14} color="#0EA5E9" />
        <Text style={[styles.gatewayBadgeText, { color: "#0EA5E9" }]}>Powered by Razorpay</Text>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
        {BANKS.map((bank) => (
          <Pressable
            key={bank.id}
            onPress={() => setSelectedBank(bank.id)}
            style={[
              { flex: 1, minWidth: "45%", padding: 12, borderRadius: 10, borderWidth: 1.5, alignItems: "center" },
              selectedBank === bank.id
                ? { borderColor: bank.color, backgroundColor: bank.color + "10" }
                : { borderColor: "#E5E7EB", backgroundColor: "#F9FAFB" },
            ]}
          >
            <Ionicons name="business" size={18} color={bank.color} />
            <Text style={{ fontSize: 11, fontWeight: "600", color: "#333", marginTop: 4 }}>{bank.name}</Text>
          </Pressable>
        ))}
      </View>
      <Pressable
        style={[styles.payBtn, { backgroundColor: "#0EA5E9" }]}
        onPress={() => handleRazorpayPayment("netbanking")}
        disabled={processing}
      >
        {processing ? (
          <ActivityIndicator color="#FFF" size="small" />
        ) : (
          <>
            <Ionicons name="globe" size={20} color="#FFF" />
            <Text style={styles.payBtnText}>Pay ₹{amount} via Net Banking</Text>
          </>
        )}
      </Pressable>
      {paymentError && (
        <View style={styles.paymentErrorBox}>
          <Ionicons name="alert-circle" size={16} color={Colors.error} />
          <Text style={styles.paymentErrorText}>{paymentError}</Text>
        </View>
      )}
    </View>
  );

  const renderPhonePeSection = () => (
    <View style={styles.methodDetails}>
      <View style={[styles.gatewayBadge, { backgroundColor: "#5F259F12" }]}>
        <Ionicons name="shield-checkmark" size={14} color="#5F259F" />
        <Text style={[styles.gatewayBadgeText, { color: "#5F259F" }]}>Powered by PhonePe PG</Text>
      </View>
      <View style={{ paddingHorizontal: 4, paddingBottom: 12 }}>
        <Text style={{ fontFamily: "Poppins_400Regular", fontSize: 13, color: Colors.textSecondary, lineHeight: 20 }}>
          You will be redirected to the PhonePe payment page. Supports UPI, cards, net banking, and wallets on the PhonePe platform.
        </Text>
      </View>
      <Pressable
        style={[styles.payBtn, { backgroundColor: "#5F259F" }]}
        onPress={handlePhonePePayment}
        disabled={processing}
      >
        {processing ? (
          <ActivityIndicator color="#FFF" size="small" />
        ) : (
          <>
            <Ionicons name="phone-portrait" size={20} color="#FFF" />
            <Text style={styles.payBtnText}>Pay ₹{amount} via PhonePe</Text>
          </>
        )}
      </Pressable>
      {paymentError && (
        <View style={styles.paymentErrorBox}>
          <Ionicons name="alert-circle" size={16} color={Colors.error} />
          <Text style={styles.paymentErrorText}>{paymentError}</Text>
        </View>
      )}
    </View>
  );

  const renderWalletSection = () => (
    <View style={styles.methodDetails}>
      <View style={styles.walletBalanceCard}>
        <View style={styles.walletBalanceRow}>
          <View>
            <Text style={styles.walletLabel}>Available Balance</Text>
            <Text style={styles.walletAmount}>{"\u20B9"}{walletBalance.toFixed(0)}</Text>
          </View>
          <View style={[styles.walletIconCircle, { backgroundColor: walletBalance >= amount ? Colors.success + "15" : Colors.error + "15" }]}>
            <Ionicons name="wallet" size={28} color={walletBalance >= amount ? Colors.success : Colors.error} />
          </View>
        </View>
        {walletBalance >= amount ? (
          <View style={styles.walletSufficient}>
            <Ionicons name="checkmark-circle" size={16} color={Colors.success} />
            <Text style={styles.walletSufficientText}>Sufficient balance to pay {"\u20B9"}{amount}</Text>
          </View>
        ) : (
          <View style={styles.walletInsufficient}>
            <Ionicons name="alert-circle" size={16} color={Colors.error} />
            <Text style={styles.walletInsufficientText}>Insufficient balance. Need {"\u20B9"}{(amount - walletBalance).toFixed(0)} more</Text>
          </View>
        )}
      </View>
    </View>
  );

  const renderCoinsSection = () => (
    <View style={styles.methodDetails}>
      <View style={[styles.walletBalanceCard, { borderColor: "#D97706" + "30" }]}>
        <View style={styles.walletBalanceRow}>
          <View>
            <Text style={styles.walletLabel}>Go Bharat Coins</Text>
            <Text style={[styles.walletAmount, { color: "#D97706" }]}>{coinBalance.toLocaleString("en-IN")} coins</Text>
            <Text style={{ fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textSecondary, marginTop: 2 }}>1 coin = {"\u20B9"}100 | Need {Math.ceil(amount / 100)} coins for this order</Text>
          </View>
          <View style={[styles.walletIconCircle, { backgroundColor: coinBalance >= Math.ceil(amount / 100) ? "#D97706" + "15" : Colors.error + "15" }]}>
            <Ionicons name="diamond" size={28} color={coinBalance >= Math.ceil(amount / 100) ? "#D97706" : Colors.error} />
          </View>
        </View>
        {coinBalance >= Math.ceil(amount / 100) ? (
          <View style={styles.walletSufficient}>
            <Ionicons name="checkmark-circle" size={16} color={Colors.success} />
            <Text style={styles.walletSufficientText}>Sufficient coins to pay {"\u20B9"}{amount} ({Math.ceil(amount / 100)} coins)</Text>
          </View>
        ) : coinBalance > 0 ? (
          <View style={styles.walletInsufficient}>
            <Ionicons name="alert-circle" size={16} color="#D97706" />
            <Text style={[styles.walletInsufficientText, { color: "#D97706" }]}>You have {coinBalance} coins. Need {Math.ceil(amount / 100) - coinBalance} more</Text>
          </View>
        ) : (
          <View style={styles.walletInsufficient}>
            <Ionicons name="alert-circle" size={16} color={Colors.error} />
            <Text style={styles.walletInsufficientText}>No coins available. Earn coins by placing orders!</Text>
          </View>
        )}
      </View>
    </View>
  );

  const handleVendorQrConfirm = () => {
    if (vendorQrConfirming || processing) return;
    setVendorQrConfirming(true);
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
    showSuccessAnimation();
    setTimeout(() => completeOrder({ method: "VENDOR_QR", status: "PENDING_VERIFICATION" }), 1500);
  };

  const renderVendorQrSection = () => (
    <View style={styles.methodDetails}>
      <View style={[styles.gatewayBadge, { backgroundColor: "#0F766E12" }]}>
        <Ionicons name="qr-code" size={14} color="#0F766E" />
        <Text style={[styles.gatewayBadgeText, { color: "#0F766E" }]}>Direct UPI Transfer to Vendor</Text>
      </View>
      <View style={{ alignItems: "center", paddingVertical: 16, paddingHorizontal: 4 }}>
        {vendorQrImageUri ? (
          <Image
            source={{ uri: vendorQrImageUri }}
            style={{ width: 240, height: 240, borderRadius: 12, borderWidth: 1, borderColor: "#E5E7EB", backgroundColor: "#FFF" }}
            resizeMode="contain"
            accessibilityLabel={`${vendorName} payment QR`}
          />
        ) : null}
        <Text style={{ fontFamily: "Poppins_600SemiBold", fontSize: 15, color: Colors.text, marginTop: 12, textAlign: "center" }}>
          Scan with any UPI app
        </Text>
        <Text style={{ fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary, marginTop: 4, textAlign: "center", lineHeight: 18, paddingHorizontal: 8 }}>
          Open Google Pay, PhonePe, Paytm or any UPI app, scan this QR, and pay{"\u00A0"}
          <Text style={{ fontFamily: "Poppins_600SemiBold", color: Colors.text }}>{"\u20B9"}{amount}</Text>{"\u00A0"}to {vendorName}. Then tap the button below.
        </Text>
      </View>
      <Pressable
        style={[styles.payBtn, { backgroundColor: "#0F766E" }]}
        onPress={handleVendorQrConfirm}
        disabled={vendorQrConfirming || processing}
      >
        {vendorQrConfirming ? (
          <ActivityIndicator color="#FFF" size="small" />
        ) : (
          <>
            <Ionicons name="checkmark-circle" size={20} color="#FFF" />
            <Text style={styles.payBtnText}>I've Paid {"\u20B9"}{amount} — Place Order</Text>
          </>
        )}
      </Pressable>
      <View style={{ flexDirection: "row", alignItems: "flex-start", marginTop: 10, backgroundColor: "#FEF3C7", padding: 10, borderRadius: 8 }}>
        <Ionicons name="information-circle" size={16} color="#92400E" style={{ marginTop: 1 }} />
        <Text style={{ flex: 1, marginLeft: 6, fontFamily: "Poppins_400Regular", fontSize: 11, color: "#92400E", lineHeight: 16 }}>
          Order will be marked "Payment Pending Verification" until the vendor confirms receipt.
        </Text>
      </View>
    </View>
  );

  const renderCodSection = () => (
    <View style={styles.methodDetails}>
      <View style={styles.codCard}>
        <Ionicons name="information-circle" size={22} color={Colors.warning} />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.codTitle}>Pay when your order arrives</Text>
          <Text style={styles.codNote}>An extra {"\u20B9"}10 convenience fee will be charged for Cash on Delivery orders.</Text>
        </View>
      </View>
    </View>
  );

  const renderMethodDetails = () => {
    switch (selectedMethod) {
      case "upi": return renderUpiSection();
      case "netbanking": return renderNetBankingSection();
      case "phonepe": return renderPhonePeSection();
      case "wallet": return renderWalletSection();
      case "coins": return renderCoinsSection();
      case "cod": return renderCodSection();
      case "vendor_qr": return renderVendorQrSection();
      default: return null;
    }
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={["#0B1E3D", "#142F5E"]} style={[styles.header, { paddingTop: topPadding + 12 }]}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color="#FFF" />
          </Pressable>
          <Text style={styles.headerTitle}>Payment</Text>
          <View style={styles.lockBadge}>
            <Ionicons name="lock-closed" size={14} color="#10B981" />
            <Text style={styles.lockText}>Secure</Text>
          </View>
        </View>
      </LinearGradient>

      <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: bottomPadding + 100 }} showsVerticalScrollIndicator={false}>
        <View style={styles.summaryCard}>
          <View style={styles.summaryTop}>
            <View>
              <Text style={styles.summaryLabel}>Total Amount</Text>
              <Text style={styles.summaryAmount}>{"\u20B9"}{amount.toFixed(0)}</Text>
            </View>
            <View style={styles.summaryRight}>
              <View style={styles.summaryBadge}>
                <Text style={styles.summaryBadgeText}>{itemCount} {itemCount === 1 ? "item" : "items"}</Text>
              </View>
            </View>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryBottom}>
            <Ionicons name="storefront-outline" size={16} color={Colors.textSecondary} />
            <Text style={styles.summaryVendor}>{vendorName}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Choose Payment Method</Text>

        {availablePaymentMethods.map((method) => (
          <View key={method.id}>
            <Pressable
              style={[
                styles.methodCard,
                selectedMethod === method.id && { borderColor: method.color, backgroundColor: method.color + "08" },
              ]}
              onPress={() => {
                try { Haptics.selectionAsync(); } catch {}
                setSelectedMethod(method.id);
              }}
            >
              <View style={[styles.methodIconWrap, { backgroundColor: method.color + "15" }]}>
                <Ionicons name={method.icon} size={22} color={method.color} />
              </View>
              <View style={styles.methodInfo}>
                <Text style={styles.methodLabel}>{method.label}</Text>
                <Text style={styles.methodDesc}>{method.desc}</Text>
              </View>
              <View style={[styles.radio, selectedMethod === method.id && { borderColor: method.color }]}>
                {selectedMethod === method.id && <View style={[styles.radioFill, { backgroundColor: method.color }]} />}
              </View>
            </Pressable>
            {selectedMethod === method.id && renderMethodDetails()}
          </View>
        ))}

        <View style={styles.securityRow}>
          {[
            { icon: "shield-checkmark" as const, label: "100% Secure" },
            { icon: "lock-closed" as const, label: "256-bit SSL" },
            { icon: "ribbon" as const, label: "RBI Approved" },
          ].map((badge, i) => (
            <View key={i} style={styles.securityBadge}>
              <Ionicons name={badge.icon} size={18} color={Colors.success} />
              <Text style={styles.securityText}>{badge.label}</Text>
            </View>
          ))}
        </View>
      </ScrollView>

      {selectedMethod !== "vendor_qr" && (
        <View style={[styles.bottomBar, { paddingBottom: bottomPadding + 12 }]}>
          <Pressable onPress={handlePayment} disabled={processing}>
            <LinearGradient
              colors={[Colors.primary, Colors.primaryDark]}
              style={styles.payButton}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              {processing ? (
                <ActivityIndicator color="#FFF" size="small" />
              ) : (
                <>
                  <Ionicons name="lock-closed" size={18} color="#FFF" />
                  <Text style={styles.payButtonText}>Pay {"\u20B9"}{(selectedMethod === "cod" ? amount + 10 : amount).toFixed(0)}</Text>
                </>
              )}
            </LinearGradient>
          </Pressable>
        </View>
      )}

      <Modal visible={showSuccess} transparent animationType="fade">
        <View style={styles.successOverlay}>
          <Animated.View
            style={[
              styles.successCircle,
              {
                opacity: successOpacity,
                transform: [{ scale: successScale }],
              },
            ]}
          >
            <Animated.View style={{ transform: [{ scale: checkScale }] }}>
              <Ionicons name="checkmark-circle" size={90} color={Colors.success} />
            </Animated.View>
            <Text style={styles.successTitle}>Payment Successful!</Text>
            <Text style={styles.successAmount}>{"\u20B9"}{amount.toFixed(0)}</Text>
            <Text style={styles.successSub}>Redirecting to your order...</Text>
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { paddingBottom: 18, paddingHorizontal: 20 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 20,
    color: "#FFF",
  },
  lockBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(16,185,129,0.12)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  lockText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 12,
    color: "#10B981",
  },
  scroll: { flex: 1 },
  summaryCard: {
    margin: 20,
    backgroundColor: "#FFF",
    borderRadius: 18,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  summaryTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  summaryLabel: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
  },
  summaryAmount: {
    fontFamily: "Poppins_700Bold",
    fontSize: 32,
    color: Colors.secondary,
    marginTop: 2,
  },
  summaryRight: { alignItems: "flex-end" },
  summaryBadge: {
    backgroundColor: Colors.primary + "12",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
  },
  summaryBadgeText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
    color: Colors.primary,
  },
  summaryDivider: {
    height: 1,
    backgroundColor: Colors.borderLight,
    marginVertical: 14,
  },
  summaryBottom: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  summaryVendor: {
    fontFamily: "Poppins_500Medium",
    fontSize: 14,
    color: Colors.textSecondary,
  },
  sectionTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 16,
    color: Colors.secondary,
    marginHorizontal: 20,
    marginBottom: 12,
  },
  methodCard: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 20,
    marginBottom: 10,
    backgroundColor: "#FFF",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1.5,
    borderColor: Colors.border,
    gap: 14,
  },
  methodIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  methodInfo: { flex: 1 },
  methodLabel: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 15,
    color: Colors.text,
  },
  methodDesc: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  radioFill: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  methodDetails: {
    marginHorizontal: 20,
    marginTop: -4,
    marginBottom: 10,
    backgroundColor: "#FFF",
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  detailLabel: {
    fontFamily: "Poppins_500Medium",
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 8,
    marginTop: 4,
  },
  input: {
    backgroundColor: Colors.background,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: "Poppins_400Regular",
    fontSize: 15,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 12,
  },
  cardRow: {
    flexDirection: "row",
  },
  upiAppsRow: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap",
  },
  upiAppBtn: {
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: Colors.border,
    width: 76,
    gap: 6,
  },
  upiAppIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  upiAppIconText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 16,
    color: "#FFF",
  },
  upiAppName: {
    fontFamily: "Poppins_500Medium",
    fontSize: 11,
    color: Colors.text,
    textAlign: "center",
  },
  banksGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  bankBtn: {
    width: "47%" as any,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: Colors.border,
    position: "relative" as const,
  },
  bankIcon: {
    width: 34,
    height: 34,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  bankIconText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 15,
    color: "#FFF",
  },
  bankName: {
    fontFamily: "Poppins_500Medium",
    fontSize: 13,
    color: Colors.text,
    flex: 1,
  },
  walletBalanceCard: {
    backgroundColor: Colors.background,
    borderRadius: 14,
    padding: 16,
  },
  walletBalanceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  walletLabel: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
  },
  walletAmount: {
    fontFamily: "Poppins_700Bold",
    fontSize: 28,
    color: Colors.secondary,
    marginTop: 2,
  },
  walletIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  walletSufficient: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 14,
    backgroundColor: Colors.success + "10",
    padding: 10,
    borderRadius: 10,
  },
  walletSufficientText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 12,
    color: Colors.success,
  },
  walletInsufficient: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 14,
    backgroundColor: Colors.error + "10",
    padding: 10,
    borderRadius: 10,
  },
  walletInsufficientText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 12,
    color: Colors.error,
  },
  codCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: Colors.warning + "0D",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.warning + "25",
  },
  codTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
    color: Colors.text,
  },
  codNote: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 4,
    lineHeight: 18,
  },
  unavailableCard: {
    flexDirection: "row" as const,
    alignItems: "flex-start" as const,
    backgroundColor: Colors.warning + "0D",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.warning + "25",
  },
  unavailableTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
    color: Colors.warning,
  },
  unavailableNote: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 4,
    lineHeight: 18,
  },
  securityRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 16,
    marginTop: 24,
    marginBottom: 16,
    paddingHorizontal: 20,
  },
  securityBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.success + "0A",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.success + "20",
  },
  securityText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 11,
    color: Colors.success,
  },
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#FFF",
    paddingHorizontal: 20,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 8,
  },
  payButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    height: 54,
    borderRadius: 16,
  },
  payButtonText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 17,
    color: "#FFF",
  },
  successOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  successCircle: {
    backgroundColor: "#FFF",
    borderRadius: 28,
    padding: 40,
    alignItems: "center",
    width: 280,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
  },
  successTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 20,
    color: Colors.secondary,
    marginTop: 16,
    textAlign: "center",
  },
  successAmount: {
    fontFamily: "Poppins_700Bold",
    fontSize: 32,
    color: Colors.success,
    marginTop: 4,
  },
  successSub: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 12,
    textAlign: "center",
  },
  gatewayBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#6C3EC112",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    alignSelf: "flex-start",
    marginBottom: 14,
  },
  gatewayBadgeText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
    color: "#6C3EC1",
  },
  payBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 10,
    backgroundColor: "#6C3EC1",
    borderRadius: 14,
    paddingVertical: 16,
    marginTop: 8,
  },
  payBtnText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 16,
    color: "#FFF",
  },
  paymentErrorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.error + "10",
    padding: 12,
    borderRadius: 10,
    marginTop: 12,
  },
  paymentErrorText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: Colors.error,
    flex: 1,
  },
});

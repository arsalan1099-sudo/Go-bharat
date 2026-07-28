import React, { useEffect, useState, useRef, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Platform, Modal, ActivityIndicator, Alert } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withRepeat, withSequence } from "react-native-reanimated";
import Colors from "@/constants/colors";
import { useApp } from "@/lib/store";
import { Order, OrderStatus } from "@/lib/types";
import DeliveryTrackingMap from "@/components/DeliveryTrackingMap";
import InvoiceView from "@/components/InvoiceView";
import { getAuthToken, getApiUrl } from "@/lib/query-client";
import { mapServerOrder, ServerOrderResponse } from "@/lib/orderMapper";

const VENDOR_COORDS: Record<string, { lat: number; lng: number }> = {
  "Camp Area": { lat: 20.5547, lng: 74.5247 },
  "Main Market": { lat: 20.5510, lng: 74.5270 },
  "Station Road": { lat: 20.5490, lng: 74.5310 },
  default: { lat: 20.5530, lng: 74.5240 },
};
const CUSTOMER_COORD = { lat: 20.5580, lng: 74.5190 };

const SERVICE_CATEGORIES = ["3", "4"];
const TRAVEL_CATEGORY = "5";

const deliveryTrackingSteps: { status: OrderStatus; label: string; icon: string }[] = [
  { status: "ACCEPTED", label: "Order Confirmed", icon: "checkmark-circle" },
  { status: "PREPARING", label: "Preparing", icon: "restaurant" },
  { status: "READY", label: "Ready for Pickup", icon: "bag-check" },
  { status: "PICKED", label: "Picked Up", icon: "bicycle" },
  { status: "ON_THE_WAY", label: "On the Way", icon: "navigate" },
  { status: "DELIVERED", label: "Delivered", icon: "checkmark-done-circle" },
];

const serviceTrackingSteps: { status: OrderStatus; label: string; icon: string }[] = [
  { status: "ACCEPTED", label: "Booking Confirmed", icon: "checkmark-circle" },
  { status: "PREPARING", label: "Assigning Worker", icon: "person-add" },
  { status: "READY", label: "Worker Assigned", icon: "person" },
  { status: "ON_THE_WAY", label: "Worker En Route", icon: "navigate" },
  { status: "DELIVERED", label: "Service Completed", icon: "checkmark-done-circle" },
];

const travelTrackingSteps: { status: OrderStatus; label: string; icon: string }[] = [
  { status: "ACCEPTED", label: "Booking Confirmed", icon: "checkmark-circle" },
  { status: "PREPARING", label: "Processing Booking", icon: "document-text" },
  { status: "READY", label: "Confirmation Sent", icon: "mail" },
  { status: "ON_THE_WAY", label: "Ready for You", icon: "thumbs-up" },
  { status: "DELIVERED", label: "Completed", icon: "checkmark-done-circle" },
];

const deliveryStatusOrder: OrderStatus[] = ["ACCEPTED", "PREPARING", "READY", "PICKED", "ON_THE_WAY", "DELIVERED"];
const serviceStatusOrder: OrderStatus[] = ["ACCEPTED", "PREPARING", "READY", "ON_THE_WAY", "DELIVERED"];
const travelStatusOrder: OrderStatus[] = ["ACCEPTED", "PREPARING", "READY", "ON_THE_WAY", "DELIVERED"];

const TERMINAL_STATUSES: OrderStatus[] = ["DELIVERED", "CANCELLED", "PAYMENT_FAILED"];
const POLL_INTERVAL_MS = 12000;

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { orders, getInvoiceByRef, updateOrderStatus } = useApp();
  const localOrder = orders.find((o) => o.id === id);

  const [serverOrder, setServerOrder] = useState<Order | null>(null);
  const [loadingServer, setLoadingServer] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const order = serverOrder || localOrder;

  const [showInvoice, setShowInvoice] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const invoice = order ? getInvoiceByRef(order.id) : undefined;
  const topInset = Platform.OS === "web" ? 67 : insets.top;

  const isServiceOrder = order?.vendorCategoryId ? SERVICE_CATEGORIES.includes(order.vendorCategoryId) : false;
  const isTravelOrder = order?.vendorCategoryId === TRAVEL_CATEGORY;
  const isBookingOrder = isServiceOrder || isTravelOrder;
  const trackingSteps = isTravelOrder ? travelTrackingSteps : isServiceOrder ? serviceTrackingSteps : deliveryTrackingSteps;
  const statusOrder = isTravelOrder ? travelStatusOrder : isServiceOrder ? serviceStatusOrder : deliveryStatusOrder;

  const pulseScale = useSharedValue(1);

  useEffect(() => {
    pulseScale.value = withRepeat(
      withSequence(withTiming(1.15, { duration: 800 }), withTiming(1, { duration: 800 })),
      -1
    );
  }, []);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
  }));

  const handleCancelOrder = useCallback(async () => {
    if (!id || !order) return;
    Alert.alert(
      "Cancel Order",
      "Are you sure you want to cancel this order?",
      [
        { text: "Keep Order", style: "cancel" },
        {
          text: "Cancel Order",
          style: "destructive",
          onPress: async () => {
            setCancelling(true);
            try {
              const token = await getAuthToken();
              const url = new URL(`/api/orders/${id}/status`, getApiUrl());
              const res = await fetch(url.toString(), {
                method: "PUT",
                headers: {
                  "Content-Type": "application/json",
                  ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({ status: "CANCELLED" }),
              });
              if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                Alert.alert("Error", err.error || "Failed to cancel order");
                return;
              }
              updateOrderStatus(id, "CANCELLED");
              setServerOrder((prev) => prev ? { ...prev, status: "CANCELLED" } : null);
            } catch {
              Alert.alert("Error", "Failed to cancel order. Please try again.");
            } finally {
              setCancelling(false);
            }
          },
        },
      ]
    );
  }, [id, order, updateOrderStatus]);

  const fetchFromServer = useCallback(async (): Promise<Order | null> => {
    if (!id) return null;
    try {
      const token = await getAuthToken();
      const url = new URL(`/api/orders/${id}`, getApiUrl());
      const res = await fetch(url.toString(), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) return null;
      const data: ServerOrderResponse = await res.json();
      const mapped = mapServerOrder(data);
      setServerOrder(mapped);
      return mapped;
    } catch {
      return null;
    }
  }, [id]);

  useEffect(() => {
    if (!id) return;

    if (!localOrder) {
      setLoadingServer(true);
      fetchFromServer().finally(() => setLoadingServer(false));
    } else {
      fetchFromServer();
    }
  }, [id]);

  useEffect(() => {
    if (!order) return;
    if (TERMINAL_STATUSES.includes(order.status as OrderStatus)) {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }

    pollRef.current = setInterval(() => {
      fetchFromServer();
    }, POLL_INTERVAL_MS);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [order?.status, fetchFromServer]);

  if (loadingServer && !order) {
    return (
      <View style={[styles.container, { paddingTop: topInset, alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={[styles.notFound, { marginTop: 16 }]}>Loading order...</Text>
      </View>
    );
  }

  if (!order) {
    return (
      <View style={[styles.container, { paddingTop: topInset }]}>
        <Text style={styles.notFound}>Order not found</Text>
      </View>
    );
  }

  const rawStepIdx = statusOrder.indexOf(order.status);
  // If the server returns an unexpected status, clamp to 0 so the tracker
  // still renders sensibly rather than showing all steps as inactive.
  const currentStepIdx = rawStepIdx >= 0 ? rawStepIdx : 0;
  const isCompleted = order.status === "DELIVERED";

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: topInset + 8 }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.secondary} />
        </Pressable>
        <Text style={styles.headerTitle}>
          {isBookingOrder ? "Booking" : "Order"} #{order.id}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {isCompleted && (
          <View style={styles.successCard}>
            <Ionicons name="checkmark-circle" size={48} color={Colors.success} />
            <Text style={styles.successTitle}>
              {isTravelOrder ? "Booking Completed!" : isServiceOrder ? "Service Completed!" : "Delivered Successfully!"}
            </Text>
            <Text style={styles.successSubtext}>
              {isTravelOrder ? "Your travel booking has been completed" : isServiceOrder ? "The service has been completed successfully" : "Your order has been delivered"}
            </Text>
          </View>
        )}

        {isCompleted && (
          <View style={styles.reviewSection}>
            <Text style={styles.sectionTitle}>Rate Your Experience</Text>
            {order.items.map((item) => (
              <Pressable
                key={item.id}
                style={styles.reviewItemCard}
                onPress={() => router.push(`/write-review?productId=${item.productId}&vendorId=${order.vendorId}` as any)}
              >
                <View style={styles.reviewItemInfo}>
                  <Text style={styles.reviewItemName} numberOfLines={1}>{item.productName}</Text>
                  <Text style={styles.reviewItemVendor}>from {order.vendorName}</Text>
                </View>
                <View style={styles.reviewItemBtn}>
                  <Ionicons name="star-outline" size={16} color={Colors.primary} />
                  <Text style={styles.reviewItemBtnText}>Review</Text>
                </View>
              </Pressable>
            ))}
            <Pressable
              style={styles.storeReviewBtn}
              onPress={() => router.push(`/write-review?vendorId=${order.vendorId}` as any)}
            >
              <Ionicons name="storefront-outline" size={18} color={Colors.primary} />
              <Text style={styles.storeReviewBtnText}>Review {order.vendorName}</Text>
              <Ionicons name="chevron-forward" size={16} color={Colors.primary} />
            </Pressable>
          </View>
        )}

        <View style={styles.trackingSection}>
          <Text style={styles.sectionTitle}>
            {isBookingOrder ? "Booking Status" : "Order Status"}
          </Text>
          {trackingSteps.map((step, idx) => {
            const isActive = idx <= currentStepIdx;
            const isCurrent = idx === currentStepIdx;
            return (
              <View key={step.status} style={styles.trackingStep}>
                <View style={styles.trackingLine}>
                  {isCurrent && !isCompleted ? (
                    <Animated.View style={[styles.trackingDot, styles.trackingDotActive, pulseStyle]}>
                      <Ionicons name={step.icon as any} size={16} color="#FFF" />
                    </Animated.View>
                  ) : (
                    <View style={[styles.trackingDot, isActive && styles.trackingDotActive]}>
                      <Ionicons
                        name={step.icon as any}
                        size={16}
                        color={isActive ? "#FFF" : Colors.textLight}
                      />
                    </View>
                  )}
                  {idx < trackingSteps.length - 1 && (
                    <View style={[styles.trackingConnector, isActive && styles.trackingConnectorActive]} />
                  )}
                </View>
                <View style={styles.trackingInfo}>
                  <Text style={[styles.trackingLabel, isActive && styles.trackingLabelActive]}>
                    {step.label}
                  </Text>
                  {isCurrent && !isCompleted && (
                    <Text style={styles.trackingCurrent}>In progress...</Text>
                  )}
                </View>
              </View>
            );
          })}
        </View>

        {!isBookingOrder && !isCompleted && order.status !== "CANCELLED" && order.status !== "PAYMENT_FAILED" && (
          <DeliveryTrackingMap
            vendorLat={VENDOR_COORDS[Object.keys(VENDOR_COORDS).find(k => order.vendorName?.includes(k)) || "default"]?.lat || VENDOR_COORDS.default.lat}
            vendorLng={VENDOR_COORDS[Object.keys(VENDOR_COORDS).find(k => order.vendorName?.includes(k)) || "default"]?.lng || VENDOR_COORDS.default.lng}
            customerLat={CUSTOMER_COORD.lat}
            customerLng={CUSTOMER_COORD.lng}
            vendorName={order.vendorName || "Vendor"}
            customerName={order.customerName}
            status={order.status}
          />
        )}

        <View style={styles.detailSection}>
          <Text style={styles.sectionTitle}>
            {isBookingOrder ? "Booking Details" : "Order Details"}
          </Text>
          <View style={styles.detailCard}>
            {order.items.map((item) => (
              <View key={item.id}>
                <View style={styles.orderItem}>
                  <View style={styles.orderItemLeft}>
                    <Text style={styles.orderItemQty}>{item.quantity}x</Text>
                    <Text style={styles.orderItemName}>{item.productName}</Text>
                  </View>
                  <Text style={styles.orderItemPrice}>{"\u20B9"}{item.price * item.quantity}</Text>
                </View>
                {item.seatNumber && (
                  <View style={styles.seatBadgeRow}>
                    <View style={styles.seatBadge}>
                      <Ionicons name={isTravelOrder && item.seatClass && ["LB","MB","UB","SL","SU"].includes(item.seatClass) ? "train" : "airplane"} size={12} color={Colors.primary} />
                      <Text style={styles.seatBadgeText}>Seat {item.seatNumber}</Text>
                      {item.seatClass && <Text style={styles.seatClassText}>({item.seatClass})</Text>}
                    </View>
                  </View>
                )}
              </View>
            ))}
            <View style={styles.divider} />
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total Paid</Text>
              <Text style={styles.totalValue}>{"\u20B9"}{order.totalAmount}</Text>
            </View>
          </View>
        </View>

        {invoice && (
          <View style={styles.detailSection}>
            <Pressable style={styles.invoiceBtn} onPress={() => setShowInvoice(true)}>
              <View style={styles.invoiceBtnIcon}>
                <Ionicons name="document-text" size={20} color={Colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.invoiceBtnTitle}>GST Invoice</Text>
                <Text style={styles.invoiceBtnSub}>{invoice.invoiceNumber}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.textLight} />
            </Pressable>
          </View>
        )}

        {order.deliveryOTP && !isCompleted && (
          <View style={styles.detailSection}>
            <Text style={styles.sectionTitle}>
              {isTravelOrder ? "Booking OTP" : isServiceOrder ? "Service OTP" : "Delivery OTP"}
            </Text>
            <View style={styles.otpCard}>
              <View style={styles.otpIconWrap}>
                <Ionicons
                  name={isTravelOrder ? "shield-checkmark" : isServiceOrder ? "key" : "lock-closed"}
                  size={24}
                  color={Colors.primary}
                />
              </View>
              <Text style={styles.otpValue}>{order.deliveryOTP}</Text>
              <Text style={styles.otpHint}>
                {isTravelOrder
                  ? "Share this OTP at the time of boarding or check-in"
                  : isServiceOrder
                  ? "Share this OTP with the service provider on arrival"
                  : "Share this code with the delivery partner"}
              </Text>
            </View>
          </View>
        )}

        {isTravelOrder ? (
          <View style={styles.detailSection}>
            <View style={styles.serviceInfoCard}>
              <View style={styles.serviceInfoIcon}>
                <Ionicons name="earth" size={20} color="#3B82F6" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.serviceInfoTitle}>Travel Booking</Text>
                <Text style={styles.serviceInfoText}>
                  Booking confirmation has been sent to your email & phone. No physical delivery involved.
                </Text>
              </View>
            </View>
          </View>
        ) : (
          <>
            <View style={styles.detailSection}>
              <Text style={styles.sectionTitle}>
                {isServiceOrder ? "Service Location" : "Delivery Address"}
              </Text>
              <View style={styles.addressCard}>
                <Ionicons name="location" size={20} color={Colors.primary} />
                <Text style={styles.addressText}>{order.deliveryAddress}</Text>
              </View>
            </View>

            {isServiceOrder && (
              <View style={styles.detailSection}>
                <View style={styles.serviceInfoCard}>
                  <View style={styles.serviceInfoIcon}>
                    <Ionicons name="information-circle" size={20} color="#3B82F6" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.serviceInfoTitle}>Service Booking</Text>
                    <Text style={styles.serviceInfoText}>
                      A worker will be assigned and will arrive at your location. No physical delivery involved.
                    </Text>
                  </View>
                </View>
              </View>
            )}

            {!isServiceOrder && order.deliveryPartnerName && (
              <View style={styles.detailSection}>
                <Text style={styles.sectionTitle}>Delivery Partner</Text>
                <View style={styles.partnerCard}>
                  <View style={styles.partnerIconWrap}>
                    <Ionicons name="bicycle" size={22} color={Colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.partnerName}>{order.deliveryPartnerName}</Text>
                    <Text style={styles.partnerSub}>{order.deliverySpeed === "express" ? "Express Delivery" : order.deliverySpeed === "scheduled" ? "Scheduled Delivery" : "Standard Delivery"}</Text>
                  </View>
                </View>
              </View>
            )}
          </>
        )}

        {order.paymentStatus === "PENDING_VERIFICATION" && (
          <View style={styles.detailSection}>
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10, backgroundColor: "#FEF3C7", padding: 12, borderRadius: 10 }}>
              <Ionicons name="qr-code" size={20} color="#92400E" style={{ marginTop: 1 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: "Poppins_600SemiBold", fontSize: 13, color: "#92400E" }}>
                  Payment Pending Verification
                </Text>
                <Text style={{ marginTop: 2, fontFamily: "Poppins_400Regular", fontSize: 12, color: "#92400E", lineHeight: 17 }}>
                  You marked this order as paid via the vendor's QR code. The vendor will confirm receipt before processing.
                </Text>
              </View>
            </View>
          </View>
        )}

        {order.status === "PENDING" && (
          <View style={styles.detailSection}>
            <Pressable
              style={[styles.cancelBtn, cancelling && styles.cancelBtnDisabled]}
              onPress={handleCancelOrder}
              disabled={cancelling}
              testID="cancel-order-btn"
            >
              {cancelling ? (
                <ActivityIndicator size="small" color="#DC2626" />
              ) : (
                <Ionicons name="close-circle-outline" size={20} color="#DC2626" />
              )}
              <Text style={styles.cancelBtnText}>
                {cancelling ? "Cancelling..." : "Cancel Order"}
              </Text>
            </Pressable>
          </View>
        )}
      </ScrollView>

      {invoice && (
        <Modal visible={showInvoice} animationType="slide" presentationStyle="pageSheet">
          <View style={{ flex: 1, paddingTop: Platform.OS === "web" ? 67 : insets.top }}>
            <InvoiceView invoice={invoice} onClose={() => setShowInvoice(false)} />
          </View>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  notFound: { fontFamily: "Poppins_500Medium", fontSize: 16, color: Colors.textSecondary, textAlign: "center", marginTop: 100 },
  header: {
    backgroundColor: "#FFF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  backBtn: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontFamily: "Poppins_700Bold", fontSize: 18, color: Colors.secondary },
  content: { flex: 1 },
  successCard: {
    alignItems: "center",
    backgroundColor: Colors.success + "10",
    margin: 20,
    borderRadius: 20,
    paddingVertical: 30,
    borderWidth: 1,
    borderColor: Colors.success + "30",
  },
  successTitle: { fontFamily: "Poppins_700Bold", fontSize: 20, color: Colors.success, marginTop: 12 },
  successSubtext: { fontFamily: "Poppins_400Regular", fontSize: 14, color: Colors.textSecondary, marginTop: 4 },
  trackingSection: { margin: 20, backgroundColor: "#FFF", borderRadius: 20, padding: 20 },
  sectionTitle: { fontFamily: "Poppins_700Bold", fontSize: 16, color: Colors.secondary, marginBottom: 16 },
  trackingStep: { flexDirection: "row", alignItems: "flex-start", gap: 14, minHeight: 50 },
  trackingLine: { alignItems: "center" },
  trackingDot: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.borderLight,
    alignItems: "center",
    justifyContent: "center",
  },
  trackingDotActive: { backgroundColor: Colors.primary },
  trackingConnector: { width: 3, height: 22, backgroundColor: Colors.borderLight, borderRadius: 1.5 },
  trackingConnectorActive: { backgroundColor: Colors.primary },
  trackingInfo: { flex: 1, paddingTop: 6 },
  trackingLabel: { fontFamily: "Poppins_500Medium", fontSize: 14, color: Colors.textLight },
  trackingLabelActive: { color: Colors.text, fontFamily: "Poppins_600SemiBold" },
  trackingCurrent: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.primary, marginTop: 2 },
  detailSection: { marginHorizontal: 20, marginBottom: 16 },
  detailCard: { backgroundColor: "#FFF", borderRadius: 16, padding: 16 },
  orderItem: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 6 },
  orderItemLeft: { flexDirection: "row", gap: 8, flex: 1 },
  orderItemQty: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: Colors.primary, minWidth: 28 },
  orderItemName: { fontFamily: "Poppins_400Regular", fontSize: 14, color: Colors.text },
  orderItemPrice: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: Colors.text },
  divider: { height: 1, backgroundColor: Colors.borderLight, marginVertical: 10 },
  totalRow: { flexDirection: "row", justifyContent: "space-between" },
  totalLabel: { fontFamily: "Poppins_700Bold", fontSize: 15, color: Colors.secondary },
  totalValue: { fontFamily: "Poppins_700Bold", fontSize: 18, color: Colors.primary },
  addressCard: {
    flexDirection: "row",
    gap: 10,
    backgroundColor: "#FFF",
    borderRadius: 16,
    padding: 16,
    alignItems: "center",
  },
  addressText: { fontFamily: "Poppins_400Regular", fontSize: 14, color: Colors.text, flex: 1 },
  otpCard: { backgroundColor: "#FFF", borderRadius: 16, padding: 20, alignItems: "center" },
  otpIconWrap: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: Colors.primary + "12",
    alignItems: "center", justifyContent: "center", marginBottom: 12,
  },
  otpValue: { fontFamily: "Poppins_700Bold", fontSize: 36, color: Colors.primary, letterSpacing: 12 },
  otpHint: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary, marginTop: 8, textAlign: "center" },
  partnerCard: { flexDirection: "row", gap: 14, backgroundColor: "#FFF", borderRadius: 16, padding: 16, alignItems: "center" },
  partnerIconWrap: { width: 44, height: 44, borderRadius: 12, backgroundColor: Colors.primary + "12", alignItems: "center", justifyContent: "center" },
  partnerName: { fontFamily: "Poppins_600SemiBold", fontSize: 15, color: Colors.text },
  partnerSub: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  serviceInfoCard: {
    flexDirection: "row",
    gap: 12,
    backgroundColor: "#EFF6FF",
    borderRadius: 16,
    padding: 16,
    alignItems: "flex-start",
    borderWidth: 1,
    borderColor: "#BFDBFE",
  },
  serviceInfoIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#DBEAFE",
    alignItems: "center",
    justifyContent: "center",
  },
  serviceInfoTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: "#1E40AF", marginBottom: 2 },
  serviceInfoText: { fontFamily: "Poppins_400Regular", fontSize: 12, color: "#3B82F6", lineHeight: 18 },
  seatBadgeRow: { paddingLeft: 36, paddingBottom: 6 },
  seatBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.primary + "10",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: "flex-start",
  },
  seatBadgeText: { fontFamily: "Poppins_600SemiBold", fontSize: 12, color: Colors.primary },
  seatClassText: { fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textSecondary },
  reviewSection: { marginHorizontal: 20, marginBottom: 16 },
  reviewItemCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFF",
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
  },
  reviewItemInfo: { flex: 1, marginRight: 12 },
  reviewItemName: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: Colors.text },
  reviewItemVendor: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  reviewItemBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.primary + "12",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  reviewItemBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: Colors.primary },
  storeReviewBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.primary + "08",
    borderRadius: 14,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: Colors.primary + "20",
    marginTop: 4,
  },
  storeReviewBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: Colors.primary },
  invoiceBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#FFF",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.primary + "25",
  },
  invoiceBtnIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: Colors.primary + "12",
    alignItems: "center",
    justifyContent: "center",
  },
  invoiceBtnTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 15, color: Colors.secondary },
  invoiceBtnSub: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary, marginTop: 1 },
  cancelBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#FEF2F2",
    borderRadius: 16,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  cancelBtnDisabled: { opacity: 0.6 },
  cancelBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 15, color: "#DC2626" },
});

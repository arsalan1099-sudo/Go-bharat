import React, { useEffect, useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Platform, Linking, Alert, RefreshControl } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useApp } from "@/lib/store";
import { Order } from "@/lib/types";
import { getApiUrl, getAuthToken } from "@/lib/query-client";

const openDriveMode = (order: Order) => {
  const isPickup = !["PICKED", "ON_THE_WAY"].includes(order.status);
  const destination = isPickup
    ? (order.vendorAddress || (order.vendorName ? order.vendorName + ", Malegaon" : ""))
    : (order.deliveryAddress || "");

  if (!destination || destination.trim() === "") {
    Alert.alert("Address Not Available", "Customer delivery address is not set for this order.");
    return;
  }

  const encodedDest = encodeURIComponent(destination);

  if (Platform.OS === "ios") {
    Linking.openURL(`maps:?daddr=${encodedDest}&dirflg=d`).catch(() =>
      Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${encodedDest}`)
    );
  } else {
    Linking.openURL(`google.navigation:q=${encodedDest}`).catch(() =>
      Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${encodedDest}`)
    );
  }
};

const statusFlow: Record<string, { next: string; label: string; icon: string; color: string }> = {
  READY: { next: "PICKED", label: "Pick Up", icon: "bicycle", color: Colors.primary },
  PICKED: { next: "ON_THE_WAY", label: "Start Delivery", icon: "navigate", color: "#6366F1" },
  ON_THE_WAY: { next: "DELIVERED", label: "Deliver", icon: "checkmark-done-circle", color: Colors.success },
};

const speedLabels: Record<string, string> = {
  express: "Express (15-25 min)",
  standard: "Standard (30-45 min)",
  scheduled: "Scheduled",
};

const mapOrder = (o: any): Order => ({
  id: o.id, customerId: o.customerId, customerName: o.customerName || "",
  customerPhone: o.customerPhone || "", vendorId: o.vendorId,
  vendorName: o.vendorName || "",
  vendorAddress: o.vendorAddress || "",
  items: typeof o.items === "string" ? JSON.parse(o.items) : (o.items || []),
  totalAmount: parseFloat(o.totalAmount || o.total) || 0,
  status: o.status,
  paymentStatus: o.paymentStatus || "PENDING",
  paymentMethod: o.paymentMethod || "COD",
  deliveryAddress: o.deliveryAddress || o.address || "",
  notes: o.notes, deliveryPartnerId: o.deliveryPartnerId,
  createdAt: o.createdAt ? new Date(o.createdAt).toISOString() : new Date().toISOString(),
  estimatedDelivery: o.estimatedDelivery,
  deliveryOTP: o.deliveryOTP,
  deliveryNote: o.deliveryNote,
  deliverySpeed: o.deliverySpeed,
  trackingUpdates: typeof o.trackingUpdates === "string" ? JSON.parse(o.trackingUpdates) : (o.trackingUpdates || []),
  invoiceId: o.invoiceId,
});

export default function DeliveryDashboard() {
  const insets = useSafeAreaInsets();
  const { user, isOnline, toggleOnline, orders, updateOrderStatus, acceptDelivery, notifications } = useApp();
  const router = useRouter();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const [refreshing, setRefreshing] = useState(false);
  const [liveOrders, setLiveOrders] = useState<Order[]>([]);

  const myId = user?.id || "";

  const fetchOrders = useCallback(async () => {
    try {
      const apiUrl = getApiUrl();
      const token = await getAuthToken();
      if (!token) return;
      const headers = { Authorization: `Bearer ${token}` };
      const noCacheHeaders = { ...headers, "Cache-Control": "no-cache" };
      const t = Date.now();
      const [assignedRes, availableRes] = await Promise.all([
        fetch(new URL(`/api/orders/delivery?t=${t}`, apiUrl).toString(), { headers: noCacheHeaders }),
        fetch(new URL(`/api/orders/available?t=${t}`, apiUrl).toString(), { headers: noCacheHeaders }),
      ]);
      const assignedData = (assignedRes.ok || assignedRes.status === 304) ? await assignedRes.json().catch(() => ({ orders: [] })) : { orders: [] };
      const availableData = (availableRes.ok || availableRes.status === 304) ? await availableRes.json().catch(() => ({ orders: [] })) : { orders: [] };
      const fresh: Order[] = [
        ...(assignedData.orders || []).map(mapOrder),
        ...(availableData.orders || []).map(mapOrder),
      ];
      // Deduplicate by id
      const seen = new Set<string>();
      setLiveOrders(fresh.filter(o => { if (seen.has(o.id)) return false; seen.add(o.id); return true; }));
    } catch (e) { console.warn("[delivery] fetchOrders failed:", e); }
  }, []);

  // Poll for new orders every 30 seconds while online
  useEffect(() => {
    if (!isOnline) return;
    fetchOrders();
    const interval = setInterval(fetchOrders, 30000);
    return () => clearInterval(interval);
  }, [isOnline, fetchOrders]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchOrders();
    setRefreshing(false);
  }, [fetchOrders]);

  // Use live server data once available, fall back to global orders
  const displayOrders = liveOrders.length > 0 ? liveOrders : orders;

  // Active = assigned to me and not yet delivered/cancelled
  const activeOrders = displayOrders.filter((o) =>
    o.deliveryPartnerId === myId &&
    !["DELIVERED", "CANCELLED"].includes(o.status)
  );
  // New requests = READY but unassigned
  const newOrders = displayOrders.filter((o) => o.status === "READY" && !o.deliveryPartnerId);
  const completedToday = displayOrders.filter((o) => o.status === "DELIVERED" && o.deliveryPartnerId === myId).length;
  const todayEarnings = completedToday * 45;

  const handleStatusAdvance = (order: Order) => {
    const flow = statusFlow[order.status];
    if (flow) {
      try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
      updateOrderStatus(order.id, flow.next as any);
    }
  };

  const handleAcceptNew = async (orderId: string) => {
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
    try {
      const apiUrl = getApiUrl();
      const token = await getAuthToken();
      const res = await fetch(new URL(`/api/orders/${orderId}/accept-delivery`, apiUrl).toString(), {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        Alert.alert("Could not accept", data.error || "Please try again.");
        return;
      }
      // Immediately refresh the order list
      await fetchOrders();
    } catch {
      Alert.alert("Network Error", "Could not reach the server. Please try again.");
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "PENDING": return Colors.warning;
      case "CONFIRMED": return Colors.info;
      case "ACCEPTED": return Colors.info;
      case "PREPARING": return "#F59E0B";
      case "READY": return Colors.primary;
      case "PICKED": return "#6366F1";
      case "ON_THE_WAY": return Colors.success;
      default: return Colors.textLight;
    }
  };

  return (
    <ScrollView
        style={styles.container}
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[Colors.primary]} tintColor={Colors.primary} />}
      >
      <LinearGradient colors={isOnline ? ["#0B1E3D", "#142F5E"] : ["#374151", "#1F2937"]} style={[styles.header, { paddingTop: topInset + 12 }]}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.greeting}>Welcome,</Text>
            <Text style={styles.name}>{user?.name || "Partner"}</Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Pressable style={styles.browseBtn} onPress={() => { try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {} router.push("/(customer)" as any); }}>
              <Ionicons name="bag-handle-outline" size={18} color="#FFF" />
            </Pressable>
            <Pressable style={styles.browseBtn} onPress={() => router.push("/notifications" as any)}>
              <Ionicons name="notifications-outline" size={18} color="#FFF" />
              {notifications.filter(n => !n.read).length > 0 && (
                <View style={{ position: "absolute", top: -4, right: -4, backgroundColor: "#EF4444", borderRadius: 10, minWidth: 18, height: 18, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 }}>
                  <Text style={{ fontFamily: "Poppins_700Bold", fontSize: 10, color: "#FFF" }}>{notifications.filter(n => !n.read).length > 99 ? "99+" : notifications.filter(n => !n.read).length}</Text>
                </View>
              )}
            </Pressable>
            <Pressable
              style={[styles.onlineToggle, isOnline && styles.onlineToggleActive]}
              onPress={() => {
                try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
                toggleOnline();
              }}
            >
              <View style={[styles.toggleDot, isOnline && styles.toggleDotActive]} />
              <Text style={styles.toggleText}>{isOnline ? "Online" : "Offline"}</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Ionicons name="bicycle" size={22} color={Colors.primary} />
            <Text style={styles.statVal}>{activeOrders.length}</Text>
            <Text style={styles.statLbl}>Active</Text>
          </View>
          <View style={styles.statBox}>
            <Ionicons name="cash" size={22} color={Colors.success} />
            <Text style={styles.statVal}>{"\u20B9"}{todayEarnings}</Text>
            <Text style={styles.statLbl}>Earnings</Text>
          </View>
          <View style={styles.statBox}>
            <Ionicons name="checkmark-done" size={22} color={Colors.info} />
            <Text style={styles.statVal}>{completedToday}</Text>
            <Text style={styles.statLbl}>Completed</Text>
          </View>
        </View>
      </LinearGradient>

      {!isOnline && (
        <View style={styles.offlineCard}>
          <Ionicons name="power" size={40} color={Colors.textLight} />
          <Text style={styles.offlineTitle}>You're Offline</Text>
          <Text style={styles.offlineText}>Go online to start receiving delivery requests</Text>
        </View>
      )}

      {isOnline && newOrders.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>New Requests</Text>
            <View style={styles.countBadge}>
              <Text style={styles.countText}>{newOrders.length}</Text>
            </View>
          </View>
          {newOrders.map((order) => (
            <View key={order.id} style={[styles.orderCard, { borderLeftWidth: 4, borderLeftColor: Colors.warning }]}>
              <View style={styles.orderTop}>
                <Text style={styles.orderId}>#{order.id}</Text>
                <Text style={styles.orderAmount}>{"\u20B9"}{order.totalAmount}</Text>
              </View>
              <View style={styles.orderRoute}>
                <View style={styles.routeItem}>
                  <View style={[styles.routeDot, { backgroundColor: Colors.success }]} />
                  <Text style={styles.routeText}>{order.vendorName}</Text>
                </View>
                <View style={styles.routeLine} />
                <View style={styles.routeItem}>
                  <View style={[styles.routeDot, { backgroundColor: Colors.error }]} />
                  <Text style={styles.routeText} numberOfLines={1}>{order.deliveryAddress}</Text>
                </View>
              </View>
              {order.deliveryNote ? (
                <View style={styles.noteRow}>
                  <Ionicons name="chatbubble-ellipses" size={14} color={Colors.textSecondary} />
                  <Text style={styles.noteText} numberOfLines={1}>{order.deliveryNote}</Text>
                </View>
              ) : null}
              <Pressable style={[styles.acceptBtn]} onPress={() => handleAcceptNew(order.id)}>
                <Ionicons name="checkmark-circle" size={18} color="#FFF" />
                <Text style={styles.actionBtnText}>Accept Order</Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}

      {isOnline && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Active Deliveries</Text>
          {activeOrders.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="search" size={40} color={Colors.textLight} />
              <Text style={styles.emptyText}>Waiting for orders...</Text>
            </View>
          ) : (
            activeOrders.map((order) => {
              const flow = statusFlow[order.status];
              return (
                <View key={order.id} style={[styles.orderCard, { borderLeftWidth: 4, borderLeftColor: getStatusColor(order.status) }]}>
                  <View style={styles.orderTop}>
                    <Text style={styles.orderId}>#{order.id}</Text>
                    <View style={[styles.statusBadge, { backgroundColor: getStatusColor(order.status) + "18" }]}>
                      <Text style={[styles.statusText, { color: getStatusColor(order.status) }]}>{order.status.replace(/_/g, " ")}</Text>
                    </View>
                  </View>
                  <View style={styles.orderRoute}>
                    <View style={styles.routeItem}>
                      <View style={[styles.routeDot, { backgroundColor: Colors.success }]} />
                      <Text style={styles.routeText}>{order.vendorName}</Text>
                    </View>
                    <View style={styles.routeLine} />
                    <View style={styles.routeItem}>
                      <View style={[styles.routeDot, { backgroundColor: Colors.error }]} />
                      <Text style={styles.routeText} numberOfLines={1}>{order.deliveryAddress}</Text>
                    </View>
                  </View>
                  {order.customerName ? (
                    <View style={styles.customerRow}>
                      <Ionicons name="person" size={14} color={Colors.textSecondary} />
                      <Text style={styles.customerText}>{order.customerName}</Text>
                    </View>
                  ) : null}
                  {order.deliverySpeed ? (
                    <View style={styles.speedRow}>
                      <Ionicons name="timer" size={14} color={Colors.primary} />
                      <Text style={styles.speedText}>{speedLabels[order.deliverySpeed] || order.deliverySpeed}</Text>
                    </View>
                  ) : null}
                  {order.deliveryNote ? (
                    <View style={styles.noteRow}>
                      <Ionicons name="chatbubble-ellipses" size={14} color={Colors.textSecondary} />
                      <Text style={styles.noteText} numberOfLines={2}>{order.deliveryNote}</Text>
                    </View>
                  ) : null}
                  <Pressable
                    style={styles.driveModeBtn}
                    onPress={() => {
                      try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
                      openDriveMode(order);
                    }}
                  >
                    <LinearGradient colors={["PICKED", "ON_THE_WAY"].includes(order.status) ? ["#10B981", "#059669"] : ["#6366F1", "#4F46E5"]} style={styles.driveModeGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                      <Ionicons name="navigate" size={18} color="#FFF" />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.driveModeTitle}>
                          {["PICKED", "ON_THE_WAY"].includes(order.status) ? "Drive to Customer" : "Drive to Pickup"}
                        </Text>
                        <Text style={styles.driveModeAddress} numberOfLines={1}>
                          {["PICKED", "ON_THE_WAY"].includes(order.status) ? order.deliveryAddress : (order.vendorAddress || order.vendorName)}
                        </Text>
                      </View>
                      <Ionicons name="open-outline" size={16} color="rgba(255,255,255,0.8)" />
                    </LinearGradient>
                  </Pressable>
                  <View style={styles.orderBottom}>
                    <Text style={styles.orderAmountBig}>{"\u20B9"}{order.totalAmount}</Text>
                    {flow && (
                      <Pressable style={[styles.actionBtn, { backgroundColor: flow.color }]} onPress={() => handleStatusAdvance(order)}>
                        <Ionicons name={flow.icon as any} size={16} color="#FFF" />
                        <Text style={styles.actionBtnText}>{flow.label}</Text>
                      </Pressable>
                    )}
                  </View>
                  {order.status === "ON_THE_WAY" && order.deliveryOTP ? (
                    <View style={styles.otpRow}>
                      <Text style={styles.otpLabel}>Delivery OTP:</Text>
                      <Text style={styles.otpValue}>{order.deliveryOTP}</Text>
                    </View>
                  ) : null}
                </View>
              );
            })
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { paddingHorizontal: 24, paddingBottom: 24 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  greeting: { fontFamily: "Poppins_400Regular", fontSize: 14, color: "rgba(255,255,255,0.7)" },
  name: { fontFamily: "Poppins_700Bold", fontSize: 22, color: "#FFF" },
  onlineToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderWidth: 1.5,
    borderColor: Colors.textLight,
  },
  onlineToggleActive: { borderColor: Colors.success, backgroundColor: Colors.success + "20" },
  toggleDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.textLight },
  toggleDotActive: { backgroundColor: Colors.success },
  toggleText: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: "#FFF" },
  statsRow: { flexDirection: "row", gap: 10, marginTop: 20 },
  statBox: { flex: 1, backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 16, padding: 14, alignItems: "center", gap: 4 },
  statVal: { fontFamily: "Poppins_700Bold", fontSize: 18, color: "#FFF" },
  statLbl: { fontFamily: "Poppins_400Regular", fontSize: 11, color: "rgba(255,255,255,0.6)" },
  offlineCard: { margin: 20, backgroundColor: "#FFF", borderRadius: 20, padding: 40, alignItems: "center" },
  offlineTitle: { fontFamily: "Poppins_700Bold", fontSize: 18, color: Colors.secondary, marginTop: 16 },
  offlineText: { fontFamily: "Poppins_400Regular", fontSize: 14, color: Colors.textSecondary, textAlign: "center", marginTop: 8 },
  section: { padding: 20 },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 },
  sectionTitle: { fontFamily: "Poppins_700Bold", fontSize: 18, color: Colors.secondary, marginBottom: 14 },
  countBadge: { backgroundColor: Colors.error, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 2, marginBottom: 14 },
  countText: { fontFamily: "Poppins_700Bold", fontSize: 12, color: "#FFF" },
  emptyCard: { backgroundColor: "#FFF", borderRadius: 16, padding: 40, alignItems: "center" },
  emptyText: { fontFamily: "Poppins_500Medium", fontSize: 14, color: Colors.textSecondary, marginTop: 12 },
  orderCard: { backgroundColor: "#FFF", borderRadius: 16, padding: 16, marginBottom: 12, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  orderTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  orderId: { fontFamily: "Poppins_700Bold", fontSize: 15, color: Colors.secondary },
  orderAmount: { fontFamily: "Poppins_700Bold", fontSize: 16, color: Colors.primary },
  statusBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 3 },
  statusText: { fontFamily: "Poppins_600SemiBold", fontSize: 11 },
  orderRoute: { marginTop: 14, gap: 4 },
  routeItem: { flexDirection: "row", alignItems: "center", gap: 8 },
  routeDot: { width: 10, height: 10, borderRadius: 5 },
  routeText: { fontFamily: "Poppins_400Regular", fontSize: 13, color: Colors.text, flex: 1 },
  routeLine: { width: 2, height: 14, backgroundColor: Colors.borderLight, marginLeft: 4 },
  customerRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10 },
  customerText: { fontFamily: "Poppins_500Medium", fontSize: 12, color: Colors.textSecondary },
  speedRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 },
  speedText: { fontFamily: "Poppins_500Medium", fontSize: 12, color: Colors.primary },
  noteRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6, backgroundColor: Colors.surfaceAlt || "#F5F5F5", borderRadius: 8, padding: 8 },
  noteText: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary, flex: 1 },
  orderBottom: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.borderLight },
  orderAmountBig: { fontFamily: "Poppins_700Bold", fontSize: 18, color: Colors.primary },
  acceptBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: Colors.success, borderRadius: 12, paddingVertical: 12, marginTop: 14 },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8 },
  actionBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: "#FFF" },
  otpRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10, backgroundColor: Colors.primary + "10", borderRadius: 10, padding: 10 },
  otpLabel: { fontFamily: "Poppins_500Medium", fontSize: 12, color: Colors.textSecondary },
  otpValue: { fontFamily: "Poppins_700Bold", fontSize: 18, color: Colors.primary, letterSpacing: 4 },
  browseBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
  driveModeBtn: { marginTop: 12, borderRadius: 14, overflow: "hidden" },
  driveModeGradient: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, paddingHorizontal: 14 },
  driveModeTitle: { fontFamily: "Poppins_700Bold", fontSize: 13, color: "#FFF" },
  driveModeAddress: { fontFamily: "Poppins_400Regular", fontSize: 11, color: "rgba(255,255,255,0.85)" },
});

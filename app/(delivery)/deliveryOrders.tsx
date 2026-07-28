import React, { useState, useEffect, useCallback } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, Platform, Linking, RefreshControl } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useApp } from "@/lib/store";
import { Order } from "@/lib/types";
import { getApiUrl, getAuthToken } from "@/lib/query-client";
import DeliveryTrackingMap from "@/components/DeliveryTrackingMap";

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

const VENDOR_COORDS: Record<string, { lat: number; lng: number }> = {
  "Camp Area": { lat: 20.5547, lng: 74.5247 },
  "Main Market": { lat: 20.5510, lng: 74.5270 },
  "Station Road": { lat: 20.5490, lng: 74.5310 },
  default: { lat: 20.5530, lng: 74.5240 },
};
const CUSTOMER_COORD = { lat: 20.5580, lng: 74.5190 };

const openDriveMode = (order: Order) => {
  const isPickup = !["PICKED", "ON_THE_WAY"].includes(order.status);
  const destination = isPickup
    ? (order.vendorAddress || order.vendorName + ", Malegaon")
    : order.deliveryAddress;
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

type FilterType = "active" | "completed" | "all";

const statusFlow: Record<string, { next: string; label: string; icon: string; color: string }> = {
  ACCEPTED: { next: "PREPARING", label: "Start Preparing", icon: "restaurant", color: Colors.info },
  PREPARING: { next: "READY", label: "Mark Ready", icon: "checkmark-circle", color: Colors.warning },
  READY: { next: "PICKED", label: "Pick Up", icon: "bicycle", color: Colors.primary },
  PICKED: { next: "ON_THE_WAY", label: "Start Delivery", icon: "navigate", color: "#6366F1" },
  ON_THE_WAY: { next: "DELIVERED", label: "Deliver", icon: "checkmark-done-circle", color: Colors.success },
};

const getStatusColor = (status: string) => {
  switch (status) {
    case "ACCEPTED": return Colors.info;
    case "PREPARING": return Colors.warning;
    case "READY": return Colors.primary;
    case "PICKED": return "#6366F1";
    case "ON_THE_WAY": return Colors.success;
    case "DELIVERED": return "#10B981";
    case "CANCELLED": return Colors.error;
    default: return Colors.textLight;
  }
};

export default function DeliveryOrdersList() {
  const insets = useSafeAreaInsets();
  const { orders, updateOrderStatus, user } = useApp();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const [filter, setFilter] = useState<FilterType>("active");
  const [showMapFor, setShowMapFor] = useState<string | null>(null);
  const [liveOrders, setLiveOrders] = useState<Order[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const myId = user?.id || "";

  const fetchOrders = useCallback(async () => {
    try {
      const apiUrl = getApiUrl();
      const token = await getAuthToken();
      if (!token) return;
      const res = await fetch(new URL(`/api/orders/delivery?t=${Date.now()}`, apiUrl).toString(), {
        headers: { Authorization: `Bearer ${token}`, "Cache-Control": "no-cache" },
      });
      if (!res.ok && res.status !== 304) return;
      const data = await res.json().catch(() => ({ orders: [] }));
      setLiveOrders((data.orders || []).map(mapOrder));
    } catch {}
  }, []);

  useEffect(() => {
    fetchOrders();
    const interval = setInterval(fetchOrders, 30000);
    return () => clearInterval(interval);
  }, [fetchOrders]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchOrders();
    setRefreshing(false);
  }, [fetchOrders]);

  // Merge live (server) orders with global orders, dedupe by id, live wins
  const sourceOrders = (() => {
    const map = new Map<string, Order>();
    for (const o of orders) map.set(o.id, o);
    for (const o of liveOrders) map.set(o.id, o);
    return Array.from(map.values());
  })();
  const myOrders = sourceOrders.filter((o) => o.deliveryPartnerId === myId);
  const activeStatuses = ["ACCEPTED", "PREPARING", "READY", "PICKED", "ON_THE_WAY"];
  const filteredOrders =
    filter === "active" ? myOrders.filter((o) => activeStatuses.includes(o.status)) :
    filter === "completed" ? myOrders.filter((o) => o.status === "DELIVERED") :
    myOrders;

  const handleAdvance = (order: Order) => {
    const flow = statusFlow[order.status];
    if (flow) {
      try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
      updateOrderStatus(order.id, flow.next as any);
    }
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: topInset + 8 }]}>
        <Text style={styles.headerTitle}>My Orders</Text>
        <Text style={styles.headerSub}>{myOrders.length} total</Text>
      </View>

      <View style={styles.filterRow}>
        {(["active", "completed", "all"] as FilterType[]).map((f) => (
          <Pressable
            key={f}
            style={[styles.filterChip, filter === f && styles.filterChipActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
              {f === "active" ? "Active" : f === "completed" ? "Completed" : "All"}
            </Text>
          </Pressable>
        ))}
      </View>

      <FlatList
        data={filteredOrders}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 20, paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[Colors.primary]} tintColor={Colors.primary} />}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="bicycle-outline" size={60} color={Colors.textLight} />
            <Text style={styles.emptyText}>No orders found</Text>
          </View>
        }
        renderItem={({ item }) => {
          const flow = statusFlow[item.status];
          const isComplete = item.status === "DELIVERED";
          return (
            <View style={[styles.card, { borderLeftWidth: 4, borderLeftColor: getStatusColor(item.status) }]}>
              <View style={styles.top}>
                <Text style={styles.orderId}>#{item.id}</Text>
                <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) + "18" }]}>
                  <Text style={[styles.statusBadgeText, { color: getStatusColor(item.status) }]}>{item.status.replace(/_/g, " ")}</Text>
                </View>
              </View>
              <Text style={styles.vendor}>{item.vendorName}</Text>
              <Text style={styles.address} numberOfLines={2}>{item.deliveryAddress}</Text>
              {item.customerName ? (
                <View style={styles.infoRow}>
                  <Ionicons name="person" size={13} color={Colors.textSecondary} />
                  <Text style={styles.infoText}>{item.customerName}</Text>
                </View>
              ) : null}
              {item.items.length > 0 && (
                <View style={styles.itemsRow}>
                  <Ionicons name="bag-handle" size={13} color={Colors.textSecondary} />
                  <Text style={styles.infoText}>{item.items.map((i) => `${i.productName} x${i.quantity}`).join(", ")}</Text>
                </View>
              )}
              {item.deliveryNote ? (
                <View style={styles.noteBox}>
                  <Ionicons name="chatbubble-ellipses" size={13} color={Colors.textSecondary} />
                  <Text style={styles.noteText}>{item.deliveryNote}</Text>
                </View>
              ) : null}
              {!isComplete && item.status !== "CANCELLED" && (
                <>
                  <Pressable
                    style={styles.driveModeBtn}
                    onPress={() => {
                      try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
                      openDriveMode(item);
                    }}
                  >
                    <View style={[styles.driveModeInner, { backgroundColor: item.status === "ON_THE_WAY" ? "#10B981" : "#6366F1" }]}>
                      <Ionicons name="navigate" size={16} color="#FFF" />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.driveModeTitle}>
                          {item.status === "ON_THE_WAY" || item.status === "PICKED" ? "Drive to Customer" : "Drive to Pickup"}
                        </Text>
                        <Text style={styles.driveModeAddress} numberOfLines={1}>
                          {item.status === "ON_THE_WAY" || item.status === "PICKED" ? item.deliveryAddress : (item.vendorAddress || item.vendorName)}
                        </Text>
                      </View>
                      <Ionicons name="open-outline" size={14} color="rgba(255,255,255,0.8)" />
                    </View>
                  </Pressable>
                  <Pressable
                    style={styles.mapToggleBtn}
                    onPress={() => setShowMapFor(showMapFor === item.id ? null : item.id)}
                  >
                    <Ionicons name={showMapFor === item.id ? "map" : "map-outline"} size={16} color={Colors.primary} />
                    <Text style={styles.mapToggleText}>
                      {showMapFor === item.id ? "Hide Map" : "View Route Map"}
                    </Text>
                    <Ionicons name={showMapFor === item.id ? "chevron-up" : "chevron-down"} size={14} color={Colors.primary} />
                  </Pressable>
                  {showMapFor === item.id && (
                    <View style={styles.mapContainer}>
                      <DeliveryTrackingMap
                        vendorLat={VENDOR_COORDS[Object.keys(VENDOR_COORDS).find(k => item.vendorName?.includes(k)) || "default"]?.lat || VENDOR_COORDS.default.lat}
                        vendorLng={VENDOR_COORDS[Object.keys(VENDOR_COORDS).find(k => item.vendorName?.includes(k)) || "default"]?.lng || VENDOR_COORDS.default.lng}
                        customerLat={CUSTOMER_COORD.lat}
                        customerLng={CUSTOMER_COORD.lng}
                        vendorName={item.vendorName || "Vendor"}
                        customerName={item.customerName}
                        status={item.status}
                        isDeliveryView
                      />
                    </View>
                  )}
                </>
              )}
              <View style={styles.bottom}>
                <Text style={styles.amount}>{"\u20B9"}{item.totalAmount}</Text>
                {flow && !isComplete && (
                  <Pressable style={[styles.advanceBtn, { backgroundColor: flow.color }]} onPress={() => handleAdvance(item)}>
                    <Ionicons name={flow.icon as any} size={16} color="#FFF" />
                    <Text style={styles.advanceBtnText}>{flow.label}</Text>
                  </Pressable>
                )}
                {isComplete && (
                  <View style={styles.completedBadge}>
                    <Ionicons name="checkmark-circle" size={16} color={Colors.success} />
                    <Text style={styles.completedText}>Delivered</Text>
                  </View>
                )}
              </View>
              {item.status === "ON_THE_WAY" && item.deliveryOTP ? (
                <View style={styles.otpRow}>
                  <Text style={styles.otpLabel}>OTP:</Text>
                  <Text style={styles.otpValue}>{item.deliveryOTP}</Text>
                </View>
              ) : null}
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { backgroundColor: "#FFF", paddingHorizontal: 24, paddingBottom: 8 },
  headerTitle: { fontFamily: "Poppins_700Bold", fontSize: 24, color: Colors.secondary },
  headerSub: { fontFamily: "Poppins_400Regular", fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  filterRow: { flexDirection: "row", paddingHorizontal: 20, paddingVertical: 12, gap: 8, backgroundColor: "#FFF" },
  filterChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: Colors.surfaceAlt || "#F3F4F6" },
  filterChipActive: { backgroundColor: Colors.primary },
  filterText: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: Colors.textSecondary },
  filterTextActive: { color: "#FFF" },
  empty: { alignItems: "center", paddingTop: 80 },
  emptyText: { fontFamily: "Poppins_500Medium", fontSize: 16, color: Colors.textSecondary, marginTop: 12 },
  card: { backgroundColor: "#FFF", borderRadius: 16, padding: 16 },
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  orderId: { fontFamily: "Poppins_700Bold", fontSize: 15, color: Colors.secondary },
  statusBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 3 },
  statusBadgeText: { fontFamily: "Poppins_600SemiBold", fontSize: 11 },
  vendor: { fontFamily: "Poppins_500Medium", fontSize: 13, color: Colors.text, marginTop: 6 },
  address: { fontFamily: "Poppins_400Regular", fontSize: 13, color: Colors.textSecondary, marginTop: 4 },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 },
  itemsRow: { flexDirection: "row", alignItems: "flex-start", gap: 6, marginTop: 6 },
  infoText: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary, flex: 1 },
  noteBox: { flexDirection: "row", alignItems: "flex-start", gap: 6, marginTop: 8, backgroundColor: Colors.surfaceAlt || "#F5F5F5", borderRadius: 8, padding: 8 },
  noteText: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary, flex: 1 },
  bottom: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.borderLight },
  amount: { fontFamily: "Poppins_700Bold", fontSize: 18, color: Colors.primary },
  advanceBtn: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  advanceBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 12, color: "#FFF" },
  completedBadge: { flexDirection: "row", alignItems: "center", gap: 4 },
  completedText: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: Colors.success },
  otpRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10, backgroundColor: Colors.primary + "10", borderRadius: 10, padding: 10 },
  otpLabel: { fontFamily: "Poppins_500Medium", fontSize: 12, color: Colors.textSecondary },
  otpValue: { fontFamily: "Poppins_700Bold", fontSize: 18, color: Colors.primary, letterSpacing: 4 },
  driveModeBtn: { marginTop: 10, borderRadius: 12, overflow: "hidden" },
  driveModeInner: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12 },
  driveModeTitle: { fontFamily: "Poppins_700Bold", fontSize: 12, color: "#FFF" },
  driveModeAddress: { fontFamily: "Poppins_400Regular", fontSize: 11, color: "rgba(255,255,255,0.85)" },
  mapToggleBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, marginTop: 8, paddingVertical: 8,
    borderWidth: 1, borderColor: Colors.primary + "30",
    borderRadius: 10, backgroundColor: Colors.primary + "08",
  },
  mapToggleText: { fontFamily: "Poppins_600SemiBold", fontSize: 12, color: Colors.primary },
  mapContainer: { marginTop: 8, marginHorizontal: -16, marginBottom: -16 },
});

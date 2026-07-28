import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, Platform, ActivityIndicator, RefreshControl } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Colors from "@/constants/colors";
import { useApp } from "@/lib/store";
import { t } from "@/lib/i18n";
import { Order } from "@/lib/types";
import { getAuthToken, getApiUrl, apiRequest } from "@/lib/query-client";
import { mapServerOrder, ServerOrderResponse } from "@/lib/orderMapper";

const statusConfig: Record<string, { color: string; icon: string; label: string }> = {
  PENDING: { color: Colors.warning, icon: "time", label: "Pending" },
  ACCEPTED: { color: Colors.info, icon: "checkmark-circle", label: "Accepted" },
  PREPARING: { color: Colors.primary, icon: "restaurant", label: "Preparing" },
  READY: { color: "#8B5CF6", icon: "bag-check", label: "Ready" },
  PICKED: { color: Colors.info, icon: "bicycle", label: "Picked Up" },
  ON_THE_WAY: { color: Colors.primary, icon: "navigate", label: "On the Way" },
  DELIVERED: { color: Colors.success, icon: "checkmark-done-circle", label: "Delivered" },
  CANCELLED: { color: Colors.error, icon: "close-circle", label: "Cancelled" },
  PAYMENT_FAILED: { color: Colors.error, icon: "card", label: "Payment Failed" },
};

function OrderCard({ order }: { order: Order }) {
  const { language } = useApp();
  const config = statusConfig[order.status] || statusConfig["PENDING"];
  return (
    <Pressable
      style={styles.orderCard}
      onPress={() => router.push(`/order/${order.id}` as any)}
    >
      <View style={styles.orderHeader}>
        <View>
          <Text style={styles.orderId}>#{order.id}</Text>
          <Text style={styles.orderVendor}>{order.vendorName}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: config.color + "18" }]}>
          <Ionicons name={config.icon as any} size={14} color={config.color} />
          <Text style={[styles.statusText, { color: config.color }]}>{config.label}</Text>
        </View>
      </View>

      <View style={styles.orderItems}>
        {order.items.slice(0, 2).map((item) => (
          <Text key={item.id} style={styles.orderItemText} numberOfLines={1}>
            {item.quantity}x {item.productName}
          </Text>
        ))}
        {order.items.length > 2 && (
          <Text style={styles.moreItems}>+{order.items.length - 2} more {t("items", language)}</Text>
        )}
      </View>

      <View style={styles.orderFooter}>
        <Text style={styles.orderTotal}>{"\u20B9"}{order.totalAmount}</Text>
        <Text style={styles.orderDate}>
          {new Date(order.createdAt).toLocaleDateString("en-IN", {
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </Text>
      </View>

      {order.paymentStatus === "PENDING_VERIFICATION" && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8, backgroundColor: "#FEF3C7", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}>
          <Ionicons name="qr-code" size={14} color="#92400E" />
          <Text style={{ flex: 1, fontFamily: "Poppins_500Medium", fontSize: 11, color: "#92400E" }}>
            Paid via QR — awaiting vendor verification
          </Text>
        </View>
      )}

      {order.status === "DELIVERED" && (
        <Pressable
          style={styles.reviewBtn}
          onPress={() => router.push(`/order/${order.id}` as any)}
        >
          <Ionicons name="star-outline" size={16} color={Colors.primary} />
          <Text style={styles.reviewBtnText}>Write Review</Text>
        </Pressable>
      )}
    </Pressable>
  );
}

export default function OrdersScreen() {
  const insets = useSafeAreaInsets();
  const { orders: localOrders, language, user, notifications, markAllNotificationsRead, lastOrderStatusChange } = useApp();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const notificationsRef = useRef(notifications);
  notificationsRef.current = notifications;

  // Refs for stable access inside fetchOrders without adding volatile deps
  const cachedOrdersRef = useRef<Order[]>([]);
  const cacheLoadedRef = useRef(false);
  const localOrdersRef = useRef(localOrders);
  localOrdersRef.current = localOrders;

  const [cacheLoaded, setCacheLoaded] = useState(false);
  const [cachedOrders, setCachedOrders] = useState<Order[]>([]);
  const [serverOrders, setServerOrders] = useState<Order[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [backgroundRefreshing, setBackgroundRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState(false);

  // Load from AsyncStorage immediately on mount so orders can appear before
  // the server responds.  cacheLoaded is set true even when the cache is empty
  // or absent — it means "we have checked storage; whatever we found is authoritative."
  useEffect(() => {
    let active = true; // Stale-effect guard for rapid account switches

    // Reset cross-user display when the phone changes
    cacheLoadedRef.current = false;
    setCacheLoaded(false);
    setCachedOrders([]);
    cachedOrdersRef.current = [];
    setServerOrders(null);

    if (!user?.phone) {
      cacheLoadedRef.current = true;
      setCacheLoaded(true);
      return;
    }
    const cacheKey = `gobharat_orders_${user.phone}`;
    AsyncStorage.getItem(cacheKey)
      .then((raw) => {
        if (!active) return;
        if (raw) {
          try {
            const parsed: Order[] = JSON.parse(raw);
            if (Array.isArray(parsed)) {
              cachedOrdersRef.current = parsed;
              setCachedOrders(parsed);
            }
          } catch {}
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!active) return;
        cacheLoadedRef.current = true;
        setCacheLoaded(true);
      });

    return () => { active = false; };
  }, [user?.phone]);

  // fetchOrders deliberately has minimal deps (user ids only) so that the
  // useFocusEffect callback stays stable and does not re-fire on every
  // hydration change.  Volatile state (cachedOrders, localOrders) is
  // accessed via refs to decide which loading indicator to show.
  const fetchOrders = useCallback(async (isRefresh = false) => {
    if (!user?.id) return;
    // Treat "cache was already checked" as having data to show, even if empty.
    // This ensures revisits to the empty-orders screen refresh silently in the
    // header rather than blocking with a full-screen spinner.
    const alreadyHasData =
      cacheLoadedRef.current ||
      cachedOrdersRef.current.length > 0 ||
      localOrdersRef.current.length > 0;
    if (isRefresh) {
      setRefreshing(true);
    } else if (alreadyHasData) {
      // Data already visible — refresh silently in header rather than blocking UI
      setBackgroundRefreshing(true);
    } else {
      // Nothing to show yet — use full-screen spinner
      setLoading(true);
    }
    setFetchError(false);
    try {
      const token = await getAuthToken();
      const url = new URL("/api/orders", getApiUrl());
      const res = await fetch(url.toString(), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        cache: "no-store",
      });
      if (!res.ok) {
        setFetchError(true);
        return;
      }
      const data: { orders: ServerOrderResponse[] } = await res.json();
      const mapped: Order[] = (data.orders || []).map(mapServerOrder);
      setServerOrders(mapped);
      // Always persist server result — including empty arrays — so future
      // revisits display the correct state instantly without a spinner.
      if (user?.phone) {
        AsyncStorage.setItem(
          `gobharat_orders_${user.phone}`,
          JSON.stringify(mapped)
        ).catch(() => {});
      }
    } catch {
      setFetchError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
      setBackgroundRefreshing(false);
    }
  }, [user?.id, user?.phone]);

  useFocusEffect(
    useCallback(() => {
      fetchOrders();

      if (!user?.id) return;
      const unread = notificationsRef.current.filter((n) => !n.read);
      if (unread.length === 0) return;
      markAllNotificationsRead(user.role);
      const serverIds = unread.filter((n) => !n.id.startsWith("promo_")).map((n) => n.id);
      if (serverIds.length > 0) {
        apiRequest("POST", "/api/notifications/mark-read", { userId: user.id, notificationIds: serverIds }).catch(() => {});
      }
    }, [user?.id, user?.role, markAllNotificationsRead, fetchOrders])
  );

  const lastOrderStatusChangeRef = useRef(lastOrderStatusChange);
  useEffect(() => {
    if (lastOrderStatusChange === 0) return;
    if (lastOrderStatusChange === lastOrderStatusChangeRef.current) return;
    lastOrderStatusChangeRef.current = lastOrderStatusChange;
    fetchOrders();
  }, [lastOrderStatusChange, fetchOrders]);

  // Display priority: server (freshest) → local AsyncStorage cache → AppProvider in-memory.
  // Once cacheLoaded=true the cachedOrders are authoritative (may be empty).
  const displayOrders = serverOrders !== null
    ? serverOrders
    : (cacheLoaded ? cachedOrders : localOrders);

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: topInset + 8 }]}>
        <Text style={styles.headerTitle}>{t("yourOrders", language)}</Text>
        {backgroundRefreshing && (
          <View style={styles.bgRefreshRow}>
            <ActivityIndicator size="small" color={Colors.primary} />
            <Text style={styles.bgRefreshText}>Updating...</Text>
          </View>
        )}
      </View>

      {loading && displayOrders.length === 0 ? (
        <View style={styles.emptyContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : fetchError && displayOrders.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="cloud-offline-outline" size={80} color={Colors.textLight} />
          <Text style={styles.emptyTitle}>Could not load orders</Text>
          <Text style={styles.emptyText}>Check your connection and try again</Text>
          <Pressable onPress={() => fetchOrders()} style={styles.retryButton}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : displayOrders.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="receipt-outline" size={80} color={Colors.textLight} />
          <Text style={styles.emptyTitle}>{t("noOrders", language)}</Text>
          <Text style={styles.emptyText}>Your order history will appear here</Text>
        </View>
      ) : (
        <FlatList
          data={displayOrders}
          renderItem={({ item }) => <OrderCard order={item} />}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 20, paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => fetchOrders(true)}
              colors={[Colors.primary]}
              tintColor={Colors.primary}
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { backgroundColor: "#FFF", paddingHorizontal: 24, paddingBottom: 16 },
  headerTitle: { fontFamily: "Poppins_700Bold", fontSize: 24, color: Colors.secondary },
  bgRefreshRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
  },
  bgRefreshText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
  },
  emptyContainer: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40 },
  emptyTitle: { fontFamily: "Poppins_700Bold", fontSize: 20, color: Colors.secondary, marginTop: 20 },
  emptyText: { fontFamily: "Poppins_400Regular", fontSize: 14, color: Colors.textSecondary, textAlign: "center", marginTop: 8 },
  orderCard: {
    backgroundColor: "#FFF",
    borderRadius: 16,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  orderHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  orderId: { fontFamily: "Poppins_700Bold", fontSize: 15, color: Colors.secondary },
  orderVendor: { fontFamily: "Poppins_400Regular", fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    gap: 4,
  },
  statusText: { fontFamily: "Poppins_600SemiBold", fontSize: 12 },
  orderItems: { marginTop: 12, gap: 2 },
  orderItemText: { fontFamily: "Poppins_400Regular", fontSize: 13, color: Colors.text },
  moreItems: { fontFamily: "Poppins_500Medium", fontSize: 12, color: Colors.primary, marginTop: 2 },
  orderFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  orderTotal: { fontFamily: "Poppins_700Bold", fontSize: 16, color: Colors.primary },
  orderDate: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary },
  reviewBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 10,
    paddingVertical: 10,
    backgroundColor: Colors.primary + "0D",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.primary + "25",
  },
  reviewBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: Colors.primary },
  retryButton: {
    marginTop: 16,
    paddingVertical: 10,
    paddingHorizontal: 28,
    backgroundColor: Colors.primary,
    borderRadius: 24,
  },
  retryText: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: "#fff" },
});

import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Platform,
  TextInput,
  ScrollView,
  Alert,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useApp } from "@/lib/store";
import { OrderStatus } from "@/lib/types";

const STATUS_COLORS: Record<string, string> = {
  PENDING: Colors.warning,
  ACCEPTED: Colors.info,
  PREPARING: Colors.primary,
  READY: Colors.info,
  PICKED: Colors.info,
  ON_THE_WAY: Colors.primary,
  DELIVERED: Colors.success,
  CANCELLED: Colors.error,
  PAYMENT_FAILED: Colors.error,
};

const PAYMENT_COLORS: Record<string, string> = {
  PAID: Colors.success,
  PENDING: Colors.warning,
  FAILED: Colors.error,
  REFUNDED: Colors.info,
};

const FILTER_TABS = ["All", "Pending", "Accepted", "Preparing", "On The Way", "Delivered", "Cancelled", "Payment Failed"];

const filterToStatus: Record<string, string> = {
  "Pending": "PENDING",
  "Accepted": "ACCEPTED",
  "Preparing": "PREPARING",
  "On The Way": "ON_THE_WAY",
  "Delivered": "DELIVERED",
  "Cancelled": "CANCELLED",
  "Payment Failed": "PAYMENT_FAILED",
};

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const day = d.getDate();
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const month = months[d.getMonth()];
  const year = d.getFullYear();
  const hours = d.getHours();
  const mins = d.getMinutes().toString().padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  const h = hours % 12 || 12;
  return `${day} ${month} ${year}, ${h}:${mins} ${ampm}`;
}

export default function AdminOrdersScreen() {
  const insets = useSafeAreaInsets();
  const { orders, cancelOrder, refundOrder, updateOrderStatus } = useApp();
  const [activeFilter, setActiveFilter] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  const filteredOrders = useMemo(() => {
    let result = [...orders];

    if (activeFilter !== "All") {
      const statusKey = filterToStatus[activeFilter];
      if (statusKey) {
        result = result.filter((o) => o.status === statusKey);
      }
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(
        (o) =>
          o.id.toLowerCase().includes(q) ||
          o.vendorName.toLowerCase().includes(q)
      );
    }

    return result;
  }, [orders, activeFilter, searchQuery]);

  const stats = useMemo(() => {
    const total = orders.length;
    const delivered = orders.filter((o) => o.status === "DELIVERED").length;
    const pending = orders.filter((o) => o.status === "PENDING").length;
    const cancelled = orders.filter((o) => o.status === "CANCELLED").length;
    return { total, delivered, pending, cancelled };
  }, [orders]);

  const handleCancel = (orderId: string) => {
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); } catch {}
    if (Platform.OS === "web") {
      cancelOrder(orderId);
    } else {
      Alert.alert("Cancel Order", `Are you sure you want to cancel order #${orderId}?`, [
        { text: "No", style: "cancel" },
        { text: "Yes, Cancel", style: "destructive", onPress: () => cancelOrder(orderId) },
      ]);
    }
  };

  const handleRefund = (orderId: string) => {
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
    if (Platform.OS === "web") {
      refundOrder(orderId);
    } else {
      Alert.alert("Refund Order", `Process refund for order #${orderId}?`, [
        { text: "No", style: "cancel" },
        { text: "Yes, Refund", onPress: () => refundOrder(orderId) },
      ]);
    }
  };

  const renderOrder = ({ item }: { item: typeof orders[0] }) => {
    const statusColor = STATUS_COLORS[item.status] || Colors.textSecondary;
    const paymentColor = PAYMENT_COLORS[item.paymentStatus] || Colors.textSecondary;
    const canCancel = item.status !== "DELIVERED" && item.status !== "CANCELLED";
    const canRefund = item.status === "DELIVERED";

    return (
      <View style={styles.orderCard}>
        <View style={styles.orderCardTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.orderId}>#{item.id}</Text>
            <Text style={styles.vendorName}>{item.vendorName}</Text>
            {item.customerName ? (
              <Text style={styles.customerName}>{item.customerName}</Text>
            ) : null}
          </View>
          <View style={[styles.statusBadge, { backgroundColor: statusColor + "18" }]}>
            <Text style={[styles.statusBadgeText, { color: statusColor }]}>
              {item.status.replace(/_/g, " ")}
            </Text>
          </View>
        </View>

        <View style={styles.orderCardMid}>
          <View style={styles.orderDetail}>
            <Ionicons name="cube-outline" size={14} color={Colors.textSecondary} />
            <Text style={styles.orderDetailText}>{item.items.length} item{item.items.length !== 1 ? "s" : ""}</Text>
          </View>
          <View style={styles.orderDetail}>
            <Ionicons name="cash-outline" size={14} color={Colors.textSecondary} />
            <Text style={styles.orderDetailText}>{"\u20B9"}{item.totalAmount.toLocaleString()}</Text>
          </View>
          <View style={[styles.paymentBadge, { backgroundColor: paymentColor + "18" }]}>
            <Text style={[styles.paymentBadgeText, { color: paymentColor }]}>{item.paymentStatus}</Text>
          </View>
        </View>

        <View style={styles.orderCardDate}>
          <Ionicons name="time-outline" size={13} color={Colors.textLight} />
          <Text style={styles.dateText}>{formatDate(item.createdAt)}</Text>
        </View>

        {(canCancel || canRefund) && (
          <View style={styles.orderActions}>
            {canCancel && (
              <Pressable
                style={[styles.actionBtn, { backgroundColor: Colors.error + "12" }]}
                onPress={() => handleCancel(item.id)}
              >
                <Ionicons name="close-circle-outline" size={16} color={Colors.error} />
                <Text style={[styles.actionBtnText, { color: Colors.error }]}>Cancel Order</Text>
              </Pressable>
            )}
            {canRefund && (
              <Pressable
                style={[styles.actionBtn, { backgroundColor: Colors.info + "12" }]}
                onPress={() => handleRefund(item.id)}
              >
                <Ionicons name="refresh-outline" size={16} color={Colors.info} />
                <Text style={[styles.actionBtnText, { color: Colors.info }]}>Refund</Text>
              </Pressable>
            )}
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={["#0B1E3D", "#142F5E"]} style={[styles.header, { paddingTop: topInset + 12 }]}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color="#FFF" />
          </Pressable>
          <Text style={styles.headerTitle}>Order Management</Text>
          <View style={{ width: 36 }} />
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{stats.total}</Text>
            <Text style={styles.statLabel}>Total</Text>
          </View>
          <View style={[styles.statCard, { borderLeftColor: Colors.success + "40", borderLeftWidth: 1 }]}>
            <Text style={[styles.statValue, { color: Colors.success }]}>{stats.delivered}</Text>
            <Text style={styles.statLabel}>Delivered</Text>
          </View>
          <View style={[styles.statCard, { borderLeftColor: Colors.warning + "40", borderLeftWidth: 1 }]}>
            <Text style={[styles.statValue, { color: Colors.warning }]}>{stats.pending}</Text>
            <Text style={styles.statLabel}>Pending</Text>
          </View>
          <View style={[styles.statCard, { borderLeftColor: Colors.error + "40", borderLeftWidth: 1 }]}>
            <Text style={[styles.statValue, { color: Colors.error }]}>{stats.cancelled}</Text>
            <Text style={styles.statLabel}>Cancelled</Text>
          </View>
        </View>
      </LinearGradient>

      <View style={styles.body}>
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={18} color={Colors.textLight} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by Order ID or Vendor..."
            placeholderTextColor={Colors.textLight}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery("")}>
              <Ionicons name="close-circle" size={18} color={Colors.textLight} />
            </Pressable>
          )}
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
          style={styles.filterScroll}
        >
          {FILTER_TABS.map((tab) => {
            const isActive = activeFilter === tab;
            return (
              <Pressable
                key={tab}
                style={[styles.filterTab, isActive && styles.filterTabActive]}
                onPress={() => {
                  try { Haptics.selectionAsync(); } catch {}
                  setActiveFilter(tab);
                }}
              >
                <Text style={[styles.filterTabText, isActive && styles.filterTabTextActive]}>
                  {tab}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <FlatList
          data={filteredOrders}
          keyExtractor={(item) => item.id}
          renderItem={renderOrder}
          contentContainerStyle={[styles.listContent, { paddingBottom: bottomInset + 20 }]}
          showsVerticalScrollIndicator={false}
          scrollEnabled={filteredOrders.length > 0}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="receipt-outline" size={56} color={Colors.textLight} />
              <Text style={styles.emptyTitle}>No Orders Found</Text>
              <Text style={styles.emptySubtitle}>
                {searchQuery ? "Try a different search term" : "No orders match the selected filter"}
              </Text>
            </View>
          }
        />
      </View>
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
    paddingBottom: 20,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  backBtn: {
    width: 36,
    height: 36,
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
  statsRow: {
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 4,
  },
  statCard: {
    flex: 1,
    alignItems: "center",
  },
  statValue: {
    fontFamily: "Poppins_700Bold",
    fontSize: 20,
    color: "#FFF",
  },
  statLabel: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    color: "rgba(255,255,255,0.6)",
    marginTop: 2,
  },
  body: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: Colors.text,
    padding: 0,
  },
  filterScroll: {
    flexGrow: 0,
    marginBottom: 12,
  },
  filterRow: {
    gap: 8,
    paddingRight: 4,
  },
  filterTab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterTabActive: {
    backgroundColor: Colors.secondary,
    borderColor: Colors.secondary,
  },
  filterTabText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 13,
    color: Colors.textSecondary,
  },
  filterTabTextActive: {
    color: "#FFF",
  },
  listContent: {
    paddingTop: 4,
    gap: 12,
  },
  orderCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  orderCardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  orderId: {
    fontFamily: "Poppins_700Bold",
    fontSize: 15,
    color: Colors.secondary,
  },
  vendorName: {
    fontFamily: "Poppins_500Medium",
    fontSize: 13,
    color: Colors.text,
    marginTop: 2,
  },
  customerName: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  statusBadge: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusBadgeText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 11,
  },
  orderCardMid: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginBottom: 10,
  },
  orderDetail: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  orderDetailText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 13,
    color: Colors.text,
  },
  paymentBadge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginLeft: "auto",
  },
  paymentBadgeText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 10,
  },
  orderCardDate: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginBottom: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  dateText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: Colors.textLight,
  },
  orderActions: {
    flexDirection: "row",
    gap: 10,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  actionBtnText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 80,
    gap: 10,
  },
  emptyTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 17,
    color: Colors.text,
  },
  emptySubtitle: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: "center",
  },
});

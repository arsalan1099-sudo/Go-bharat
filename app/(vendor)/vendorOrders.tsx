import React, { useState } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, Platform, Alert, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useApp } from "@/lib/store";
import { Order, OrderStatus } from "@/lib/types";

const tabs = ["All", "Pending", "Active", "Completed"];

const deliveryNextStatus: Record<string, OrderStatus> = {
  PENDING: "ACCEPTED",
  ACCEPTED: "PREPARING",
  PREPARING: "READY",
};

const bookingNextStatus: Record<string, OrderStatus> = {
  PENDING: "ACCEPTED",
  ACCEPTED: "PREPARING",
  PREPARING: "DELIVERED",
};

function getDeliveryActionLabel(status: string): string {
  if (status === "PENDING") return "Accept Order";
  if (status === "ACCEPTED") return "Start Preparing";
  if (status === "PREPARING") return "Mark Ready for Pickup";
  return "";
}

function getServiceActionLabel(status: string): string {
  if (status === "PENDING") return "Accept Booking";
  if (status === "ACCEPTED") return "Assign Worker";
  if (status === "PREPARING") return "Mark Service Complete";
  return "";
}

function getTravelActionLabel(status: string): string {
  if (status === "PENDING") return "Accept Booking";
  if (status === "ACCEPTED") return "Process Booking";
  if (status === "PREPARING") return "Mark Booking Complete";
  return "";
}

const STATUS_COLORS: Record<string, string> = {
  PENDING: Colors.warning,
  ACCEPTED: Colors.info,
  PREPARING: Colors.primary,
  READY: "#8B5CF6",
  ON_THE_WAY: Colors.primary,
  DELIVERED: Colors.success,
  CANCELLED: Colors.error,
  PAYMENT_FAILED: Colors.error,
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Pending",
  ACCEPTED: "Accepted",
  PREPARING: "In Progress",
  READY: "Ready",
  ON_THE_WAY: "On the Way",
  DELIVERED: "Completed",
  CANCELLED: "Cancelled",
  PAYMENT_FAILED: "Payment Failed",
};

const BOOKING_STATUS_LABELS: Record<string, string> = {
  PENDING: "Pending",
  ACCEPTED: "Confirmed",
  PREPARING: "In Progress",
  READY: "Ready",
  ON_THE_WAY: "En Route",
  DELIVERED: "Completed",
  CANCELLED: "Cancelled",
  PAYMENT_FAILED: "Payment Failed",
};

interface JobAssignment {
  id: string;
  title: string;
  client: string;
  location: string;
  workers: number;
  duration: string;
  ratePerDay: number;
  totalValue: number;
  status: "Pending" | "Active" | "Completed" | "Cancelled";
  date: string;
}

const MANPOWER_JOBS: JobAssignment[] = [
  { id: "MJ001", title: "5 Painters for residential project", client: "Sunrise Builders", location: "Andheri West, Mumbai", workers: 5, duration: "3 Days", ratePerDay: 650, totalValue: 9750, status: "Active", date: "2026-02-21" },
  { id: "MJ002", title: "Electrician for factory wiring", client: "Tata Industries", location: "Pune Industrial Area", workers: 3, duration: "2 Weeks", ratePerDay: 850, totalValue: 35700, status: "Active", date: "2026-02-18" },
  { id: "MJ003", title: "Security Guards for event", client: "Grand Hyatt", location: "BKC, Mumbai", workers: 8, duration: "1 Day", ratePerDay: 550, totalValue: 4400, status: "Completed", date: "2026-02-20" },
  { id: "MJ004", title: "Plumbing for new apartment", client: "DLF Housing", location: "Gurgaon Sector 45", workers: 2, duration: "5 Days", ratePerDay: 700, totalValue: 7000, status: "Completed", date: "2026-02-15" },
  { id: "MJ005", title: "10 Helpers for warehouse", client: "Amazon Logistics", location: "Bhiwandi, Thane", workers: 10, duration: "1 Month", ratePerDay: 450, totalValue: 135000, status: "Pending", date: "2026-02-22" },
  { id: "MJ006", title: "Carpenter for office interiors", client: "WeWork India", location: "Lower Parel, Mumbai", workers: 4, duration: "10 Days", ratePerDay: 900, totalValue: 36000, status: "Pending", date: "2026-02-22" },
];

const JOB_STATUS_COLORS: Record<string, string> = {
  Pending: Colors.warning,
  Active: Colors.info,
  Completed: Colors.success,
  Cancelled: Colors.error,
};

const manpowerTabs = ["All", "Pending", "Active", "Completed"];

export default function VendorOrders() {
  const insets = useSafeAreaInsets();
  const { orders, updateOrderStatus, confirmQrPayment, rejectQrPayment, user, vendorApplications, liveVendors } = useApp();
  const [activeTab, setActiveTab] = useState("All");
  const [qrActionLoading, setQrActionLoading] = useState<Record<string, "confirm" | "reject" | null>>({});
  const topInset = Platform.OS === "web" ? 67 : insets.top;

  const userPhoneLast10 = user?.phone?.replace(/\D/g, "").slice(-10) || "";
  const vendorApp = vendorApplications.find(a =>
    a.phone.replace(/\D/g, "").slice(-10) === userPhoneLast10 &&
    (a.status === "APPROVED" || a.status === "LIVE")
  );
  const matchedVendor = liveVendors.find((v) =>
    vendorApp ? v.name === vendorApp.businessName || v.id === vendorApp.id : v.name === user?.name
  );
  const vendorCategoryId = user?.vendorCategoryId || vendorApp?.categoryId || matchedVendor?.categoryId;
  const isManpower = vendorCategoryId === "4";
  const isService = vendorCategoryId === "3";
  const isTravel = vendorCategoryId === "5";
  const isBookingVendor = isService || isTravel;

  const [jobs] = useState<JobAssignment[]>(MANPOWER_JOBS);

  if (isManpower) {
    const filteredJobs = jobs.filter((j) => {
      if (activeTab === "Pending") return j.status === "Pending";
      if (activeTab === "Active") return j.status === "Active";
      if (activeTab === "Completed") return j.status === "Completed";
      return true;
    });

    const renderJob = ({ item }: { item: JobAssignment }) => {
      const statusColor = JOB_STATUS_COLORS[item.status];
      return (
        <View style={styles.orderCard}>
          <View style={styles.orderTop}>
            <View style={{ flex: 1 }}>
              <Text style={styles.orderId}>#{item.id}</Text>
              <Text style={styles.jobTitle}>{item.title}</Text>
            </View>
            <View style={[styles.jobStatusBadge, { backgroundColor: statusColor + "18" }]}>
              <Text style={[styles.jobStatusText, { color: statusColor }]}>{item.status}</Text>
            </View>
          </View>
          <View style={styles.jobDetailsGrid}>
            <View style={styles.jobDetailItem}>
              <Ionicons name="business-outline" size={14} color={Colors.textSecondary} />
              <Text style={styles.jobDetailText}>{item.client}</Text>
            </View>
            <View style={styles.jobDetailItem}>
              <Ionicons name="location-outline" size={14} color={Colors.textSecondary} />
              <Text style={styles.jobDetailText}>{item.location}</Text>
            </View>
            <View style={styles.jobDetailItem}>
              <Ionicons name="people-outline" size={14} color={Colors.textSecondary} />
              <Text style={styles.jobDetailText}>{item.workers} Workers</Text>
            </View>
            <View style={styles.jobDetailItem}>
              <Ionicons name="calendar-outline" size={14} color={Colors.textSecondary} />
              <Text style={styles.jobDetailText}>{item.duration}</Text>
            </View>
          </View>
          <View style={styles.jobFooterRow}>
            <View>
              <Text style={styles.jobRateLabel}>Rate/Day</Text>
              <Text style={styles.jobRateValue}>₹{item.ratePerDay}</Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={styles.jobRateLabel}>Total Value</Text>
              <Text style={styles.orderTotal}>₹{item.totalValue.toLocaleString()}</Text>
            </View>
          </View>
          {item.status === "Pending" && (
            <Pressable
              style={styles.advanceBtn}
              onPress={() => { try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {} }}
            >
              <Text style={styles.advanceBtnText}>Accept & Assign Workers</Text>
            </Pressable>
          )}
        </View>
      );
    };

    return (
      <View style={styles.container}>
        <View style={[styles.header, { paddingTop: topInset + 8 }]}>
          <Text style={styles.headerTitle}>Job Assignments</Text>
        </View>
        <View style={styles.tabsRow}>
          {manpowerTabs.map((tab) => (
            <Pressable key={tab} style={[styles.tab, activeTab === tab && styles.tabActive]} onPress={() => setActiveTab(tab)}>
              <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>{tab}</Text>
            </Pressable>
          ))}
        </View>
        <FlatList
          data={filteredJobs}
          renderItem={renderJob}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 20, paddingBottom: 100 }}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="briefcase-outline" size={60} color={Colors.textLight} />
              <Text style={styles.emptyText}>No job assignments</Text>
            </View>
          }
          showsVerticalScrollIndicator={false}
        />
      </View>
    );
  }

  const filtered = orders.filter((o) => {
    if (activeTab === "Pending") return o.status === "PENDING";
    if (activeTab === "Active") return ["ACCEPTED", "PREPARING", "READY", "ON_THE_WAY"].includes(o.status);
    if (activeTab === "Completed") return o.status === "DELIVERED";
    return o.status !== "CANCELLED";
  });

  const canAdvance = (status: string) => ["PENDING", "ACCEPTED", "PREPARING"].includes(status);

  const getActionLabel = (status: string) => {
    if (isService) return getServiceActionLabel(status);
    if (isTravel) return getTravelActionLabel(status);
    return getDeliveryActionLabel(status);
  };

  const getNextStatus = (status: string): OrderStatus => {
    if (isBookingVendor) return bookingNextStatus[status] || "DELIVERED";
    return deliveryNextStatus[status] || "READY";
  };

  const renderOrder = ({ item }: { item: Order }) => {
    const advance = canAdvance(item.status);
    const statusLabel = isBookingVendor ? BOOKING_STATUS_LABELS[item.status] : STATUS_LABELS[item.status];
    const statusColor = STATUS_COLORS[item.status] || Colors.textSecondary;
    const actionLabel = getActionLabel(item.status);
    const isCompleted = item.status === "DELIVERED" || item.status === "CANCELLED";
    const awaitingQrVerification =
      item.paymentStatus === "PENDING_VERIFICATION" && item.paymentMethod === "VENDOR_QR";

    const handleConfirmQr = async () => {
      if (qrActionLoading[item.id]) return;
      setQrActionLoading((prev) => ({ ...prev, [item.id]: "confirm" }));
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
      const ok = await confirmQrPayment(item.id);
      setQrActionLoading((prev) => ({ ...prev, [item.id]: null }));
      if (!ok) Alert.alert("Could not confirm", "Please check your connection and try again.");
    };

    const handleRejectQr = async () => {
      if (qrActionLoading[item.id]) return;
      setQrActionLoading((prev) => ({ ...prev, [item.id]: "reject" }));
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); } catch {}
      const ok = await rejectQrPayment(item.id);
      setQrActionLoading((prev) => ({ ...prev, [item.id]: null }));
      if (!ok) Alert.alert("Could not reject", "Please check your connection and try again.");
    };

    return (
      <View style={styles.orderCard}>
        <View style={styles.orderTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.orderId}>#{item.id}</Text>
            <Text style={styles.orderTime}>
              {new Date(item.createdAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
            </Text>
          </View>
          <View style={{ alignItems: "flex-end", gap: 4 }}>
            <Text style={styles.orderTotal}>₹{item.totalAmount}</Text>
            <View style={[styles.statusBadge, { backgroundColor: statusColor + "18" }]}>
              <Text style={[styles.statusBadgeText, { color: statusColor }]}>{statusLabel}</Text>
            </View>
            {item.paymentStatus === "PENDING_VERIFICATION" && item.paymentMethod === "VENDOR_QR" && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#FEF3C7", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                <Ionicons name="qr-code" size={11} color="#92400E" />
                <Text style={{ fontFamily: "Poppins_600SemiBold", fontSize: 10, color: "#92400E" }}>Paid via QR — verify</Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.itemsList}>
          {item.items.map((it) => (
            <View key={it.id} style={styles.itemRow}>
              <Ionicons
                name={isTravel ? "car-outline" : isService ? "construct-outline" : "bag-outline"}
                size={13}
                color={Colors.textSecondary}
              />
              <Text style={styles.itemText}>{it.quantity}× {it.productName}</Text>
            </View>
          ))}
        </View>

        {item.deliveryAddress && !isBookingVendor && (
          <View style={styles.addressRow}>
            <Ionicons name="location-outline" size={13} color={Colors.textSecondary} />
            <Text style={styles.addressText} numberOfLines={1}>{item.deliveryAddress}</Text>
          </View>
        )}

        {isBookingVendor && item.deliveryAddress && (
          <View style={styles.addressRow}>
            <Ionicons name="person-outline" size={13} color={Colors.textSecondary} />
            <Text style={styles.addressText} numberOfLines={1}>Customer: {item.customerName}</Text>
          </View>
        )}

        {awaitingQrVerification && !isCompleted && (
          <View style={styles.qrVerifyBox}>
            <View style={styles.qrVerifyHeader}>
              <Ionicons name="qr-code" size={16} color="#92400E" />
              <Text style={styles.qrVerifyTitle}>Payment Pending Verification</Text>
            </View>
            <Text style={styles.qrVerifyHint}>
              Customer says they paid ₹{item.totalAmount} to your UPI QR. Check your UPI app, then confirm or reject.
            </Text>
            <View style={styles.qrVerifyRow}>
              <Pressable style={[styles.qrVerifyBtn, styles.qrRejectBtn, qrActionLoading[item.id] === "reject" && { opacity: 0.7 }]} onPress={handleRejectQr} disabled={!!qrActionLoading[item.id]} testID={`reject-qr-${item.id}`}>
                {qrActionLoading[item.id] === "reject" ? <ActivityIndicator size="small" color="#FFF" /> : <Ionicons name="close-circle-outline" size={16} color="#FFF" />}
                <Text style={styles.qrVerifyBtnText}>Reject / Refund</Text>
              </Pressable>
              <Pressable style={[styles.qrVerifyBtn, styles.qrConfirmBtn, qrActionLoading[item.id] === "confirm" && { opacity: 0.7 }]} onPress={handleConfirmQr} disabled={!!qrActionLoading[item.id]} testID={`confirm-qr-${item.id}`}>
                {qrActionLoading[item.id] === "confirm" ? <ActivityIndicator size="small" color="#FFF" /> : <Ionicons name="checkmark-circle" size={16} color="#FFF" />}
                <Text style={styles.qrVerifyBtnText}>Confirm Received</Text>
              </Pressable>
            </View>
          </View>
        )}

        {advance && !isCompleted && !awaitingQrVerification && (
          <Pressable
            style={[styles.advanceBtn, item.status === "PREPARING" && isBookingVendor && styles.completeBtn]}
            onPress={() => {
              try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
              updateOrderStatus(item.id, getNextStatus(item.status));
            }}
          >
            <Ionicons
              name={item.status === "PREPARING" && isBookingVendor ? "checkmark-circle-outline" : isBookingVendor ? "calendar-outline" : "arrow-forward-circle-outline"}
              size={18}
              color="#FFF"
            />
            <Text style={styles.advanceBtnText}>{actionLabel}</Text>
          </Pressable>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: topInset + 8 }]}>
        <Text style={styles.headerTitle}>{isBookingVendor ? "Bookings" : "Orders"}</Text>
        {isBookingVendor && (
          <View style={styles.bookingBadge}>
            <Ionicons name={isTravel ? "car-outline" : "construct-outline"} size={14} color={Colors.primary} />
            <Text style={styles.bookingBadgeText}>{isTravel ? "Travel Bookings" : "Service Bookings"}</Text>
          </View>
        )}
      </View>
      <View style={styles.tabsRow}>
        {tabs.map((tab) => (
          <Pressable key={tab} style={[styles.tab, activeTab === tab && styles.tabActive]} onPress={() => setActiveTab(tab)}>
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>{tab}</Text>
          </Pressable>
        ))}
      </View>
      <FlatList
        data={filtered}
        renderItem={renderOrder}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 20, paddingBottom: 100 }}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name={isBookingVendor ? "calendar-outline" : "receipt-outline"} size={60} color={Colors.textLight} />
            <Text style={styles.emptyText}>{isBookingVendor ? "No bookings yet" : "No orders yet"}</Text>
          </View>
        }
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { backgroundColor: "#FFF", paddingHorizontal: 24, paddingBottom: 12 },
  headerTitle: { fontFamily: "Poppins_700Bold", fontSize: 24, color: Colors.secondary },
  bookingBadge: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 4 },
  bookingBadgeText: { fontFamily: "Poppins_500Medium", fontSize: 12, color: Colors.primary },
  tabsRow: { flexDirection: "row", paddingHorizontal: 20, paddingVertical: 10, gap: 8, backgroundColor: "#FFF" },
  tab: { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 20, backgroundColor: Colors.surfaceAlt },
  tabActive: { backgroundColor: Colors.primary },
  tabText: { fontFamily: "Poppins_500Medium", fontSize: 13, color: Colors.textSecondary },
  tabTextActive: { color: "#FFF" },
  orderCard: { backgroundColor: "#FFF", borderRadius: 16, padding: 16, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  orderTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  orderId: { fontFamily: "Poppins_700Bold", fontSize: 15, color: Colors.secondary },
  orderTime: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  orderTotal: { fontFamily: "Poppins_700Bold", fontSize: 17, color: Colors.primary },
  statusBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  statusBadgeText: { fontFamily: "Poppins_600SemiBold", fontSize: 11 },
  itemsList: { marginTop: 10, gap: 4 },
  itemRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  itemText: { fontFamily: "Poppins_400Regular", fontSize: 13, color: Colors.text },
  addressRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 8 },
  addressText: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary, flex: 1 },
  advanceBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: Colors.primary, borderRadius: 12, paddingVertical: 12, marginTop: 14 },
  completeBtn: { backgroundColor: Colors.success },
  advanceBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: "#FFF" },
  empty: { alignItems: "center", paddingTop: 80 },
  emptyText: { fontFamily: "Poppins_500Medium", fontSize: 16, color: Colors.textSecondary, marginTop: 12 },
  jobTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: Colors.text, marginTop: 4 },
  jobStatusBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  jobStatusText: { fontFamily: "Poppins_600SemiBold", fontSize: 11 },
  jobDetailsGrid: { marginTop: 12, gap: 6 },
  jobDetailItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  jobDetailText: { fontFamily: "Poppins_400Regular", fontSize: 13, color: Colors.textSecondary },
  jobFooterRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.borderLight },
  jobRateLabel: { fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textSecondary },
  jobRateValue: { fontFamily: "Poppins_700Bold", fontSize: 15, color: Colors.secondary },
  qrVerifyBox: { marginTop: 14, padding: 12, borderRadius: 12, backgroundColor: "#FFFBEB", borderWidth: 1, borderColor: "#FCD34D" },
  qrVerifyHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  qrVerifyTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: "#92400E" },
  qrVerifyHint: { fontFamily: "Poppins_400Regular", fontSize: 12, color: "#78350F", marginTop: 4 },
  qrVerifyRow: { flexDirection: "row", gap: 8, marginTop: 10 },
  qrVerifyBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 10 },
  qrConfirmBtn: { backgroundColor: Colors.success },
  qrRejectBtn: { backgroundColor: Colors.error },
  qrVerifyBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: "#FFF" },
});

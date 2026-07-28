import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Platform, Modal, TextInput, Alert, FlatList } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useApp } from "@/lib/store";
import { DealSlotDuration } from "@/lib/types";

export default function AdminDealsScreen() {
  const insets = useSafeAreaInsets();
  const { dealBookings, adminPricing, reviewDealBooking, updateAdminPricing } = useApp();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  const [activeTab, setActiveTab] = useState<"bookings" | "pricing">("bookings");
  const [filterStatus, setFilterStatus] = useState<"ALL" | "PENDING" | "ACTIVE" | "EXPIRED" | "REJECTED">("ALL");
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectBookingId, setRejectBookingId] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [showPricingModal, setShowPricingModal] = useState(false);
  const [editPricing, setEditPricing] = useState({ ...adminPricing });

  const filteredBookings = filterStatus === "ALL" ? dealBookings : dealBookings.filter(b => b.status === filterStatus);
  const pendingCount = dealBookings.filter(b => b.status === "PENDING").length;
  const activeCount = dealBookings.filter(b => b.status === "ACTIVE").length;
  const totalRevenue = dealBookings.filter(b => b.status === "ACTIVE" || b.status === "EXPIRED").reduce((s, b) => s + b.slotFee, 0);

  const handleApprove = (id: string) => {
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
    reviewDealBooking(id, true);
    Alert.alert("Approved", "Deal slot has been approved and is now live!");
  };

  const handleReject = () => {
    if (!rejectReason.trim()) {
      Alert.alert("Reason Required", "Please provide a reason for rejection");
      return;
    }
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); } catch {}
    reviewDealBooking(rejectBookingId, false, rejectReason.trim());
    setShowRejectModal(false);
    setRejectReason("");
    Alert.alert("Rejected", "Deal slot has been rejected");
  };

  const handleSavePricing = () => {
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
    updateAdminPricing(editPricing);
    setShowPricingModal(false);
    Alert.alert("Saved", "Pricing has been updated successfully");
  };

  const statusColors: Record<string, string> = { PENDING: "#F59E0B", ACTIVE: "#10B981", EXPIRED: "#6B7280", REJECTED: "#EF4444" };
  const durationLabels: Record<DealSlotDuration, string> = { "1day": "1 Day", "3days": "3 Days", "7days": "7 Days" };
  const statusFilters = ["ALL", "PENDING", "ACTIVE", "EXPIRED", "REJECTED"] as const;

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
      <View style={styles.headerBar}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={Colors.secondary} />
        </Pressable>
        <Text style={styles.headerTitle}>Deal Slots</Text>
        <Pressable onPress={() => { setEditPricing({ ...adminPricing }); setShowPricingModal(true); }} style={styles.settingsBtn}>
          <Ionicons name="settings" size={22} color={Colors.primary} />
        </Pressable>
      </View>

      <View style={styles.statsRow}>
        <View style={[styles.statCard, { borderLeftColor: "#F59E0B" }]}>
          <Text style={styles.statValue}>{pendingCount}</Text>
          <Text style={styles.statLabel}>Pending</Text>
        </View>
        <View style={[styles.statCard, { borderLeftColor: "#10B981" }]}>
          <Text style={styles.statValue}>{activeCount}</Text>
          <Text style={styles.statLabel}>Active</Text>
        </View>
        <View style={[styles.statCard, { borderLeftColor: Colors.primary }]}>
          <Text style={styles.statValue}>{"\u20B9"}{totalRevenue.toLocaleString()}</Text>
          <Text style={styles.statLabel}>Revenue</Text>
        </View>
      </View>

      <View style={styles.tabRow}>
        {(["bookings", "pricing"] as const).map(tab => (
          <Pressable key={tab} style={[styles.tab, activeTab === tab && styles.activeTab]} onPress={() => setActiveTab(tab)}>
            <Ionicons name={tab === "bookings" ? "receipt" : "pricetags"} size={16} color={activeTab === tab ? Colors.primary : Colors.textSecondary} />
            <Text style={[styles.tabText, activeTab === tab && styles.activeTabText]}>{tab === "bookings" ? "Bookings" : "Pricing"}</Text>
            {tab === "bookings" && pendingCount > 0 && (
              <View style={styles.tabBadge}><Text style={styles.tabBadgeText}>{pendingCount}</Text></View>
            )}
          </Pressable>
        ))}
      </View>

      {activeTab === "bookings" ? (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
            {statusFilters.map(f => (
              <Pressable key={f} style={[styles.filterChip, filterStatus === f && styles.activeFilterChip]} onPress={() => setFilterStatus(f)}>
                <Text style={[styles.filterChipText, filterStatus === f && styles.activeFilterChipText]}>
                  {f === "ALL" ? `All (${dealBookings.length})` : `${f.charAt(0) + f.slice(1).toLowerCase()} (${dealBookings.filter(b => b.status === f).length})`}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          <FlatList
            data={filteredBookings}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: bottomInset + 20, gap: 12 }}
            showsVerticalScrollIndicator={false}
            keyExtractor={item => item.id}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Ionicons name="receipt-outline" size={48} color={Colors.textLight} />
                <Text style={styles.emptyText}>No deal bookings found</Text>
              </View>
            }
            renderItem={({ item }) => {
              const discPct = Math.round(((item.originalPrice - item.dealPrice) / item.originalPrice) * 100);
              return (
                <View style={[styles.bookingCard, { borderLeftColor: statusColors[item.status] }]}>
                  <View style={styles.bookingHeader}>
                    <Image source={{ uri: item.productImage }} style={styles.bookingImage} contentFit="cover" accessibilityLabel={item.productName} />
                    <View style={styles.bookingInfo}>
                      <Text style={styles.bookingProduct} numberOfLines={1}>{item.productName}</Text>
                      <Text style={styles.bookingVendor}>{item.vendorName}</Text>
                      <View style={styles.bookingPriceRow}>
                        <Text style={styles.bookingDealPrice}>{"\u20B9"}{item.dealPrice}</Text>
                        <Text style={styles.bookingOrigPrice}>{"\u20B9"}{item.originalPrice}</Text>
                        <View style={styles.discBadge}><Text style={styles.discText}>{discPct}% OFF</Text></View>
                      </View>
                    </View>
                  </View>
                  <View style={styles.bookingMeta}>
                    <View style={styles.metaItem}>
                      <Ionicons name="time-outline" size={14} color={Colors.textSecondary} />
                      <Text style={styles.metaText}>{durationLabels[item.duration]}</Text>
                    </View>
                    <View style={styles.metaItem}>
                      <Ionicons name="cash-outline" size={14} color={Colors.textSecondary} />
                      <Text style={styles.metaText}>Fee: {"\u20B9"}{item.slotFee}</Text>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: statusColors[item.status] + "18" }]}>
                      <Text style={[styles.statusText, { color: statusColors[item.status] }]}>{item.status}</Text>
                    </View>
                  </View>
                  {item.status === "ACTIVE" && item.expiresAt && (
                    <View style={styles.expiryRow}>
                      <Ionicons name="calendar-outline" size={13} color={Colors.info} />
                      <Text style={styles.expiryText}>Expires: {new Date(item.expiresAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</Text>
                    </View>
                  )}
                  {item.status === "REJECTED" && item.rejectionReason && (
                    <View style={styles.rejectionRow}>
                      <Ionicons name="close-circle" size={13} color="#EF4444" />
                      <Text style={styles.rejectionText}>{item.rejectionReason}</Text>
                    </View>
                  )}
                  {item.status === "PENDING" && (
                    <View style={styles.actionRow}>
                      <Pressable style={styles.approveBtn} onPress={() => handleApprove(item.id)}>
                        <Ionicons name="checkmark-circle" size={18} color="#FFF" />
                        <Text style={styles.approveBtnText}>Approve</Text>
                      </Pressable>
                      <Pressable style={styles.rejectBtn} onPress={() => { setRejectBookingId(item.id); setRejectReason(""); setShowRejectModal(true); }}>
                        <Ionicons name="close-circle" size={18} color="#EF4444" />
                        <Text style={styles.rejectBtnText}>Reject</Text>
                      </Pressable>
                    </View>
                  )}
                  <Text style={styles.bookingTime}>{new Date(item.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</Text>
                </View>
              );
            }}
          />
        </>
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: bottomInset + 20 }} showsVerticalScrollIndicator={false}>
          <View style={styles.pricingSection}>
            <View style={styles.pricingSectionHeader}>
              <Ionicons name="flash" size={20} color="#EF4444" />
              <Text style={styles.pricingSectionTitle}>Deal Slot Rates</Text>
            </View>
            {(["1day", "3days", "7days"] as DealSlotDuration[]).map(d => (
              <View key={d} style={styles.pricingRow}>
                <Text style={styles.pricingLabel}>{durationLabels[d]}</Text>
                <Text style={styles.pricingValue}>{"\u20B9"}{adminPricing.dealSlotRates[d]}</Text>
              </View>
            ))}
          </View>

          <View style={styles.pricingSection}>
            <View style={styles.pricingSectionHeader}>
              <Ionicons name="megaphone" size={20} color="#F97316" />
              <Text style={styles.pricingSectionTitle}>Ad Slot Rates</Text>
            </View>
            {(["banner", "featured", "spotlight"] as const).map(type => (
              <View key={type} style={styles.pricingRow}>
                <Text style={styles.pricingLabel}>{type.charAt(0).toUpperCase() + type.slice(1)}</Text>
                <Text style={styles.pricingValue}>{"\u20B9"}{adminPricing.adSlotRates[type]}</Text>
              </View>
            ))}
          </View>

          <View style={styles.pricingSection}>
            <View style={styles.pricingSectionHeader}>
              <Ionicons name="card" size={20} color="#7C3AED" />
              <Text style={styles.pricingSectionTitle}>Vendor Subscription Rates</Text>
            </View>
            {([
              { key: "MONTHLY" as const, label: "Monthly" },
              { key: "QUARTERLY" as const, label: "Quarterly" },
              { key: "HALF_YEARLY" as const, label: "Half Yearly" },
              { key: "ANNUAL" as const, label: "Annual" },
            ]).map(item => (
              <View key={item.key} style={styles.pricingRow}>
                <Text style={styles.pricingLabel}>{item.label}</Text>
                <Text style={styles.pricingValue}>{"\u20B9"}{(adminPricing.vendorSubscriptionRates?.[item.key] || 0).toLocaleString("en-IN")}</Text>
              </View>
            ))}
          </View>

          <View style={styles.pricingSection}>
            <View style={styles.pricingSectionHeader}>
              <Ionicons name="business" size={20} color="#6366F1" />
              <Text style={styles.pricingSectionTitle}>Platform Fees</Text>
            </View>
            <View style={styles.pricingRow}>
              <Text style={styles.pricingLabel}>Vendor Onboarding Fee</Text>
              <Text style={styles.pricingValue}>{"\u20B9"}{adminPricing.vendorOnboardingFee}</Text>
            </View>
            <View style={styles.pricingRow}>
              <Text style={styles.pricingLabel}>Default Commission Rate</Text>
              <Text style={styles.pricingValue}>{adminPricing.defaultCommissionRate}%</Text>
            </View>
            <View style={styles.pricingRow}>
              <Text style={styles.pricingLabel}>Delivery Charge / km</Text>
              <Text style={styles.pricingValue}>{"\u20B9"}{adminPricing.deliveryChargePerKm}</Text>
            </View>
            <View style={styles.pricingRow}>
              <Text style={styles.pricingLabel}>Platform Service Fee</Text>
              <Text style={styles.pricingValue}>{adminPricing.platformServiceFee}%</Text>
            </View>
          </View>

          <Text style={styles.lastUpdated}>Last updated: {new Date(adminPricing.updatedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</Text>

          <Pressable style={styles.editPricingBtn} onPress={() => { setEditPricing({ ...adminPricing }); setShowPricingModal(true); }}>
            <Ionicons name="create" size={20} color="#FFF" />
            <Text style={styles.editPricingBtnText}>Edit All Pricing</Text>
          </Pressable>
        </ScrollView>
      )}

      <Modal visible={showRejectModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Reject Deal Slot</Text>
            <Text style={styles.modalSubtitle}>Provide a reason for rejection</Text>
            <TextInput style={styles.modalInput} placeholder="Enter reason..." placeholderTextColor={Colors.textLight} value={rejectReason} onChangeText={setRejectReason} multiline numberOfLines={3} />
            <View style={styles.modalActions}>
              <Pressable style={styles.modalCancelBtn} onPress={() => setShowRejectModal(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.modalRejectBtn} onPress={handleReject}>
                <Text style={styles.modalRejectText}>Reject</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showPricingModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: "80%" }]}>
            <Text style={styles.modalTitle}>Edit Pricing</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.editGroupTitle}>Deal Slot Rates</Text>
              {(["1day", "3days", "7days"] as DealSlotDuration[]).map(d => (
                <View key={d} style={styles.editRow}>
                  <Text style={styles.editLabel}>{durationLabels[d]}</Text>
                  <TextInput
                    style={styles.editInput}
                    keyboardType="numeric"
                    value={editPricing.dealSlotRates[d].toString()}
                    onChangeText={v => setEditPricing(prev => ({ ...prev, dealSlotRates: { ...prev.dealSlotRates, [d]: parseInt(v) || 0 } }))}
                  />
                </View>
              ))}

              <Text style={styles.editGroupTitle}>Ad Slot Rates</Text>
              {(["banner", "featured", "spotlight"] as const).map(type => (
                <View key={type} style={styles.editRow}>
                  <Text style={styles.editLabel}>{type.charAt(0).toUpperCase() + type.slice(1)}</Text>
                  <TextInput
                    style={styles.editInput}
                    keyboardType="numeric"
                    value={editPricing.adSlotRates[type].toString()}
                    onChangeText={v => setEditPricing(prev => ({ ...prev, adSlotRates: { ...prev.adSlotRates, [type]: parseInt(v) || 0 } }))}
                  />
                </View>
              ))}

              <Text style={styles.editGroupTitle}>Vendor Subscription Rates</Text>
              {([
                { key: "MONTHLY" as const, label: "Monthly" },
                { key: "QUARTERLY" as const, label: "Quarterly" },
                { key: "HALF_YEARLY" as const, label: "Half Yearly" },
                { key: "ANNUAL" as const, label: "Annual" },
              ]).map(item => (
                <View key={item.key} style={styles.editRow}>
                  <Text style={styles.editLabel}>{item.label}</Text>
                  <TextInput
                    style={styles.editInput}
                    keyboardType="numeric"
                    value={(editPricing.vendorSubscriptionRates?.[item.key] || 0).toString()}
                    onChangeText={v => setEditPricing(prev => ({ ...prev, vendorSubscriptionRates: { ...prev.vendorSubscriptionRates, [item.key]: parseInt(v) || 0 } }))}
                  />
                </View>
              ))}

              <Text style={styles.editGroupTitle}>Platform Fees</Text>
              <View style={styles.editRow}>
                <Text style={styles.editLabel}>Onboarding Fee</Text>
                <TextInput style={styles.editInput} keyboardType="numeric" value={editPricing.vendorOnboardingFee.toString()} onChangeText={v => setEditPricing(prev => ({ ...prev, vendorOnboardingFee: parseInt(v) || 0 }))} />
              </View>
              <View style={styles.editRow}>
                <Text style={styles.editLabel}>Commission (%)</Text>
                <TextInput style={styles.editInput} keyboardType="numeric" value={editPricing.defaultCommissionRate.toString()} onChangeText={v => setEditPricing(prev => ({ ...prev, defaultCommissionRate: parseFloat(v) || 0 }))} />
              </View>
              <View style={styles.editRow}>
                <Text style={styles.editLabel}>Delivery/km</Text>
                <TextInput style={styles.editInput} keyboardType="numeric" value={editPricing.deliveryChargePerKm.toString()} onChangeText={v => setEditPricing(prev => ({ ...prev, deliveryChargePerKm: parseFloat(v) || 0 }))} />
              </View>
              <View style={styles.editRow}>
                <Text style={styles.editLabel}>Service Fee (%)</Text>
                <TextInput style={styles.editInput} keyboardType="numeric" value={editPricing.platformServiceFee.toString()} onChangeText={v => setEditPricing(prev => ({ ...prev, platformServiceFee: parseFloat(v) || 0 }))} />
              </View>
            </ScrollView>
            <View style={styles.modalActions}>
              <Pressable style={styles.modalCancelBtn} onPress={() => setShowPricingModal(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.modalRejectBtn, { backgroundColor: Colors.primary }]} onPress={handleSavePricing}>
                <Text style={styles.modalRejectText}>Save Changes</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8F9FA" },
  headerBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#F0F0F0", alignItems: "center", justifyContent: "center" },
  headerTitle: { fontFamily: "Poppins_700Bold", fontSize: 20, color: Colors.secondary },
  settingsBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.primary + "12", alignItems: "center", justifyContent: "center" },
  statsRow: { flexDirection: "row", paddingHorizontal: 16, gap: 10, marginBottom: 12 },
  statCard: { flex: 1, backgroundColor: "#FFF", borderRadius: 12, padding: 12, borderLeftWidth: 3, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 1 },
  statValue: { fontFamily: "Poppins_700Bold", fontSize: 18, color: Colors.secondary },
  statLabel: { fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  tabRow: { flexDirection: "row", marginHorizontal: 16, backgroundColor: "#FFF", borderRadius: 12, padding: 4, marginBottom: 12 },
  tab: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 10, borderRadius: 10, gap: 6 },
  activeTab: { backgroundColor: Colors.primary + "12" },
  tabText: { fontFamily: "Poppins_500Medium", fontSize: 13, color: Colors.textSecondary },
  activeTabText: { color: Colors.primary, fontFamily: "Poppins_600SemiBold" },
  tabBadge: { backgroundColor: "#EF4444", borderRadius: 10, minWidth: 18, height: 18, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  tabBadgeText: { fontFamily: "Poppins_700Bold", fontSize: 10, color: "#FFF" },
  filterRow: { paddingHorizontal: 16, gap: 8, marginBottom: 12 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: "#FFF", borderWidth: 1, borderColor: "#E5E7EB" },
  activeFilterChip: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterChipText: { fontFamily: "Poppins_500Medium", fontSize: 12, color: Colors.textSecondary },
  activeFilterChipText: { color: "#FFF" },
  emptyState: { alignItems: "center", justifyContent: "center", paddingVertical: 60 },
  emptyText: { fontFamily: "Poppins_500Medium", fontSize: 14, color: Colors.textLight, marginTop: 12 },
  bookingCard: { backgroundColor: "#FFF", borderRadius: 14, padding: 14, borderLeftWidth: 4, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  bookingHeader: { flexDirection: "row", gap: 12 },
  bookingImage: { width: 70, height: 70, borderRadius: 10 },
  bookingInfo: { flex: 1 },
  bookingProduct: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: Colors.secondary },
  bookingVendor: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary, marginTop: 1 },
  bookingPriceRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  bookingDealPrice: { fontFamily: "Poppins_700Bold", fontSize: 16, color: "#EF4444" },
  bookingOrigPrice: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textLight, textDecorationLine: "line-through" },
  discBadge: { backgroundColor: "#EF4444" + "18", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  discText: { fontFamily: "Poppins_600SemiBold", fontSize: 10, color: "#EF4444" },
  bookingMeta: { flexDirection: "row", alignItems: "center", gap: 14, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: "#F3F4F6" },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaText: { fontFamily: "Poppins_500Medium", fontSize: 12, color: Colors.textSecondary },
  statusBadge: { marginLeft: "auto", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontFamily: "Poppins_600SemiBold", fontSize: 11 },
  expiryRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 8 },
  expiryText: { fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.info },
  rejectionRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 8 },
  rejectionText: { fontFamily: "Poppins_400Regular", fontSize: 11, color: "#EF4444", flex: 1 },
  actionRow: { flexDirection: "row", gap: 10, marginTop: 12 },
  approveBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "#10B981", borderRadius: 10, paddingVertical: 10 },
  approveBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: "#FFF" },
  rejectBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "#FEE2E2", borderRadius: 10, paddingVertical: 10 },
  rejectBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: "#EF4444" },
  bookingTime: { fontFamily: "Poppins_400Regular", fontSize: 10, color: Colors.textLight, marginTop: 8, textAlign: "right" },
  pricingSection: { backgroundColor: "#FFF", borderRadius: 14, padding: 16, marginBottom: 14, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 1 },
  pricingSectionHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 14 },
  pricingSectionTitle: { fontFamily: "Poppins_700Bold", fontSize: 15, color: Colors.secondary },
  pricingRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#F3F4F6" },
  pricingLabel: { fontFamily: "Poppins_500Medium", fontSize: 13, color: Colors.textSecondary },
  pricingValue: { fontFamily: "Poppins_700Bold", fontSize: 14, color: Colors.secondary },
  lastUpdated: { fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textLight, textAlign: "center", marginTop: 4, marginBottom: 16 },
  editPricingBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: Colors.primary, borderRadius: 12, paddingVertical: 14, marginBottom: 20 },
  editPricingBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: "#FFF" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", paddingHorizontal: 20 },
  modalContent: { backgroundColor: "#FFF", borderRadius: 16, padding: 20 },
  modalTitle: { fontFamily: "Poppins_700Bold", fontSize: 18, color: Colors.secondary, marginBottom: 4 },
  modalSubtitle: { fontFamily: "Poppins_400Regular", fontSize: 13, color: Colors.textSecondary, marginBottom: 14 },
  modalInput: { backgroundColor: "#F3F4F6", borderRadius: 10, padding: 12, fontFamily: "Poppins_400Regular", fontSize: 13, color: Colors.secondary, textAlignVertical: "top", minHeight: 80 },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 16 },
  modalCancelBtn: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 12, borderRadius: 10, backgroundColor: "#F3F4F6" },
  modalCancelText: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: Colors.textSecondary },
  modalRejectBtn: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 12, borderRadius: 10, backgroundColor: "#EF4444" },
  modalRejectText: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: "#FFF" },
  editGroupTitle: { fontFamily: "Poppins_700Bold", fontSize: 14, color: Colors.secondary, marginTop: 16, marginBottom: 8 },
  editRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  editLabel: { fontFamily: "Poppins_500Medium", fontSize: 13, color: Colors.textSecondary, flex: 1 },
  editInput: { backgroundColor: "#F3F4F6", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontFamily: "Poppins_600SemiBold", fontSize: 14, color: Colors.secondary, width: 100, textAlign: "right" },
});

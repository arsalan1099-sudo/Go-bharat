import React, { useState, useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Platform, Modal, TextInput, Alert, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useApp } from "@/lib/store";
import { AdRequest, AdSlotType, Invoice } from "@/lib/types";
import { generateInvoice } from "@/lib/invoiceUtils";
import InvoiceView from "@/components/InvoiceView";

const API_BASE = process.env.EXPO_PUBLIC_API_URL || "";

const AD_COLORS = ["#FF6B00", "#0B1E3D", "#8B5CF6", "#10B981", "#3B82F6", "#EF4444", "#EC4899", "#F59E0B"];

const SLOT_PRICES: Record<AdSlotType, { label: string; price7: number; price14: number; price30: number; desc: string }> = {
  BANNER: { label: "Home Banner", price7: 999, price14: 1499, price30: 2999, desc: "Full-width banner on customer home screen carousel" },
  FEATURED: { label: "Featured Spot", price7: 1499, price14: 2499, price30: 4999, desc: "Featured position in category pages" },
  SPOTLIGHT: { label: "Spotlight Ad", price7: 799, price14: 1299, price30: 2499, desc: "Highlighted in search results and recommendations" },
};

const STATUS_INFO: Record<string, { label: string; color: string; icon: string }> = {
  PENDING_FRANCHISE: { label: "Pending Franchise", color: "#F59E0B", icon: "time" },
  PENDING_ADMIN: { label: "Pending Admin", color: "#3B82F6", icon: "hourglass" },
  APPROVED: { label: "Approved", color: "#10B981", icon: "checkmark-circle" },
  LIVE: { label: "Live", color: "#22C55E", icon: "radio" },
  REJECTED: { label: "Rejected", color: "#EF4444", icon: "close-circle" },
  EXPIRED: { label: "Expired", color: "#9CA3AF", icon: "time-outline" },
};

export default function VendorAdsScreen() {
  const insets = useSafeAreaInsets();
  const { user, adRequests, submitAdRequest, getInvoiceByRef } = useApp();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  const [showBookModal, setShowBookModal] = useState(false);
  const [adTitle, setAdTitle] = useState("");
  const [adSubtitle, setAdSubtitle] = useState("");
  const [adDescription, setAdDescription] = useState("");
  const [selectedSlot, setSelectedSlot] = useState<AdSlotType>("BANNER");
  const [selectedDuration, setSelectedDuration] = useState<7 | 14 | 30>(7);
  const [selectedColor, setSelectedColor] = useState("#FF6B00");
  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "pending" | "past">("all");
  const [aiLoading, setAiLoading] = useState(false);
  const [invoiceModalVisible, setInvoiceModalVisible] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);

  const handleViewInvoice = (ad: AdRequest) => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
    const existing = getInvoiceByRef(ad.id);
    if (existing) {
      setSelectedInvoice(existing);
      setInvoiceModalVisible(true);
      return;
    }
    const slotLabel = SLOT_PRICES[ad.slotType]?.label || ad.slotType;
    const invoice = generateInvoice({
      type: "AD_SLOT",
      referenceId: ad.id,
      toName: ad.vendorName,
      toPhone: user?.phone || "",
      toAddress: "Vendor Address",
      paymentMethod: "Online",
      rawItems: [
        {
          description: `${slotLabel} - ${ad.durationDays} Days`,
          hsnSac: "998361",
          qty: 1,
          rate: ad.amountPaid,
        },
      ],
      notes: `Ad Slot Booking: ${ad.title} | Duration: ${ad.durationDays} days`,
    });
    setSelectedInvoice(invoice);
    setInvoiceModalVisible(true);
  };

  const myAds = useMemo(() => {
    return adRequests.filter((ad) => ad.vendorId === user?.id || ad.vendorName === user?.name);
  }, [adRequests, user]);

  const filteredAds = useMemo(() => {
    if (activeFilter === "all") return myAds;
    if (activeFilter === "active") return myAds.filter((a) => a.status === "LIVE" || a.status === "APPROVED");
    if (activeFilter === "pending") return myAds.filter((a) => a.status === "PENDING_FRANCHISE" || a.status === "PENDING_ADMIN");
    return myAds.filter((a) => a.status === "REJECTED" || a.status === "EXPIRED");
  }, [myAds, activeFilter]);

  const getPrice = () => {
    const slot = SLOT_PRICES[selectedSlot];
    if (selectedDuration === 7) return slot.price7;
    if (selectedDuration === 14) return slot.price14;
    return slot.price30;
  };

  const handleAIAssist = async () => {
    try {
      setAiLoading(true);
      try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
      const resp = await fetch(`${API_BASE}/api/ai/ad-assistant`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vendorName: user?.name || "Vendor",
          slotType: selectedSlot,
          duration: selectedDuration,
          businessCategory: "Retail",
        }),
      });
      const data = await resp.json();
      if (data.title) setAdTitle(data.title.slice(0, 40));
      if (data.subtitle) setAdSubtitle(data.subtitle.slice(0, 60));
      if (data.description) setAdDescription(data.description.slice(0, 200));
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
    } catch (e) {
      Alert.alert("Error", "Could not generate ad content. Please try again.");
    } finally {
      setAiLoading(false);
    }
  };

  const handleSubmit = () => {
    if (!adTitle.trim() || !adSubtitle.trim()) {
      Alert.alert("Required", "Please fill in title and subtitle");
      return;
    }
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
    submitAdRequest({
      vendorId: user?.id || "v1",
      vendorName: user?.name || "Vendor",
      title: adTitle.trim(),
      subtitle: adSubtitle.trim(),
      description: adDescription.trim(),
      slotType: selectedSlot,
      color: selectedColor,
      durationDays: selectedDuration,
      amountPaid: getPrice(),
    });
    setShowBookModal(false);
    setAdTitle("");
    setAdSubtitle("");
    setAdDescription("");
    Alert.alert("Ad Submitted!", "Your ad request has been submitted. It will be reviewed by the franchise manager first, then by the admin before going live.");
  };

  const getTimeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const days = Math.floor(diff / (24 * 60 * 60 * 1000));
    if (days === 0) return "Today";
    if (days === 1) return "Yesterday";
    return `${days}d ago`;
  };

  const getDaysLeft = (endDate?: string) => {
    if (!endDate) return 0;
    const diff = new Date(endDate).getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / (24 * 60 * 60 * 1000)));
  };

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>My Advertisements</Text>
        <Pressable onPress={() => setShowBookModal(true)} style={styles.addBtn}>
          <Ionicons name="add" size={22} color="#FFF" />
        </Pressable>
      </View>

      <View style={styles.summaryRow}>
        <View style={[styles.summaryCard, { backgroundColor: "#22C55E15" }]}>
          <Text style={[styles.summaryValue, { color: "#22C55E" }]}>{myAds.filter((a) => a.status === "LIVE").length}</Text>
          <Text style={styles.summaryLabel}>Live</Text>
        </View>
        <View style={[styles.summaryCard, { backgroundColor: "#F59E0B15" }]}>
          <Text style={[styles.summaryValue, { color: "#F59E0B" }]}>{myAds.filter((a) => a.status === "PENDING_FRANCHISE" || a.status === "PENDING_ADMIN").length}</Text>
          <Text style={styles.summaryLabel}>Pending</Text>
        </View>
        <View style={[styles.summaryCard, { backgroundColor: "#3B82F615" }]}>
          <Text style={[styles.summaryValue, { color: "#3B82F6" }]}>{myAds.length}</Text>
          <Text style={styles.summaryLabel}>Total</Text>
        </View>
      </View>

      <View style={styles.filterWrapper}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {(["all", "active", "pending", "past"] as const).map((f) => (
            <Pressable key={f} style={[styles.filterChip, activeFilter === f && styles.filterChipActive]} onPress={() => setActiveFilter(f)}>
              <Text style={[styles.filterText, activeFilter === f && styles.filterTextActive]}>
                {f === "all" ? "All" : f === "active" ? "Active" : f === "pending" ? "Pending" : "Past"}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <ScrollView style={styles.list} contentContainerStyle={{ paddingBottom: bottomInset + 20 }} showsVerticalScrollIndicator={false}>
        {filteredAds.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="megaphone-outline" size={48} color={Colors.textLight} />
            <Text style={styles.emptyTitle}>No ads found</Text>
            <Text style={styles.emptySubtitle}>Book your first ad slot to promote your business on Go Bharat!</Text>
            <Pressable style={styles.emptyBtn} onPress={() => setShowBookModal(true)}>
              <Text style={styles.emptyBtnText}>Book Ad Slot</Text>
            </Pressable>
          </View>
        ) : (
          filteredAds.map((ad) => {
            const status = STATUS_INFO[ad.status] || STATUS_INFO.PENDING_FRANCHISE;
            return (
              <View key={ad.id} style={styles.adCard}>
                <LinearGradient colors={[ad.color, ad.color + "CC"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.adPreview}>
                  <Text style={styles.adPreviewTitle}>{ad.title}</Text>
                  <Text style={styles.adPreviewSubtitle}>{ad.subtitle}</Text>
                </LinearGradient>
                <View style={styles.adDetails}>
                  <View style={styles.adTopRow}>
                    <Text style={styles.adId}>#{ad.id}</Text>
                    <View style={[styles.statusBadge, { backgroundColor: status.color + "18" }]}>
                      <Ionicons name={status.icon as any} size={12} color={status.color} />
                      <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
                    </View>
                  </View>
                  <View style={styles.adMetaRow}>
                    <View style={styles.adMeta}>
                      <Ionicons name="layers-outline" size={14} color={Colors.textSecondary} />
                      <Text style={styles.adMetaText}>{SLOT_PRICES[ad.slotType].label}</Text>
                    </View>
                    <View style={styles.adMeta}>
                      <Ionicons name="calendar-outline" size={14} color={Colors.textSecondary} />
                      <Text style={styles.adMetaText}>{ad.durationDays} days</Text>
                    </View>
                    <View style={styles.adMeta}>
                      <Ionicons name="cash-outline" size={14} color={Colors.textSecondary} />
                      <Text style={styles.adMetaText}>{"\u20B9"}{ad.amountPaid}</Text>
                    </View>
                  </View>
                  {ad.status === "LIVE" && ad.endDate && (
                    <View style={styles.liveBanner}>
                      <Ionicons name="radio" size={14} color="#22C55E" />
                      <Text style={styles.liveBannerText}>{getDaysLeft(ad.endDate)} days remaining</Text>
                    </View>
                  )}
                  {ad.status === "REJECTED" && ad.rejectionReason && (
                    <View style={styles.rejectionBanner}>
                      <Ionicons name="alert-circle" size={14} color="#EF4444" />
                      <Text style={styles.rejectionText}>{ad.rejectionReason}</Text>
                    </View>
                  )}
                  <View style={styles.adBottomRow}>
                    <Text style={styles.adTime}>Submitted {getTimeAgo(ad.createdAt)}</Text>
                    <Pressable style={styles.viewInvoiceBtn} onPress={() => handleViewInvoice(ad)}>
                      <Ionicons name="receipt-outline" size={14} color={Colors.primary} />
                      <Text style={styles.viewInvoiceBtnText}>View Invoice</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      <Pressable style={[styles.fab, { bottom: bottomInset + 16 }]} onPress={() => setShowBookModal(true)}>
        <LinearGradient colors={[Colors.primary, "#EA580C"]} style={styles.fabGradient}>
          <Ionicons name="megaphone" size={22} color="#FFF" />
          <Text style={styles.fabText}>Book Ad Slot</Text>
        </LinearGradient>
      </Pressable>

      <Modal visible={invoiceModalVisible} animationType="slide" transparent={false}>
        {selectedInvoice && (
          <View style={{ flex: 1, paddingTop: topInset }}>
            <InvoiceView invoice={selectedInvoice} onClose={() => setInvoiceModalVisible(false)} />
          </View>
        )}
      </Modal>

      <Modal visible={showBookModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingBottom: bottomInset + 20 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Book Ad Slot</Text>
              <Pressable onPress={() => setShowBookModal(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
              <Text style={styles.fieldLabel}>Ad Type</Text>
              <View style={styles.slotOptions}>
                {(Object.keys(SLOT_PRICES) as AdSlotType[]).map((slot) => (
                  <Pressable key={slot} style={[styles.slotCard, selectedSlot === slot && styles.slotCardActive]} onPress={() => setSelectedSlot(slot)}>
                    <Ionicons name={slot === "BANNER" ? "image" : slot === "FEATURED" ? "star" : "flashlight"} size={24} color={selectedSlot === slot ? Colors.primary : Colors.textSecondary} />
                    <Text style={[styles.slotName, selectedSlot === slot && styles.slotNameActive]}>{SLOT_PRICES[slot].label}</Text>
                    <Text style={styles.slotDesc}>{SLOT_PRICES[slot].desc}</Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.fieldLabel}>Duration</Text>
              <View style={styles.durationRow}>
                {([7, 14, 30] as const).map((d) => (
                  <Pressable key={d} style={[styles.durationChip, selectedDuration === d && styles.durationChipActive]} onPress={() => setSelectedDuration(d)}>
                    <Text style={[styles.durationText, selectedDuration === d && styles.durationTextActive]}>{d} Days</Text>
                    <Text style={[styles.durationPrice, selectedDuration === d && styles.durationPriceActive]}>
                      {"\u20B9"}{d === 7 ? SLOT_PRICES[selectedSlot].price7 : d === 14 ? SLOT_PRICES[selectedSlot].price14 : SLOT_PRICES[selectedSlot].price30}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Pressable
                style={[styles.aiBtn, aiLoading && { opacity: 0.7 }]}
                onPress={handleAIAssist}
                disabled={aiLoading}
              >
                <LinearGradient colors={["#8B5CF6", "#6366F1"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.aiBtnGradient}>
                  {aiLoading ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <Ionicons name="sparkles" size={18} color="#FFF" />
                  )}
                  <Text style={styles.aiBtnText}>{aiLoading ? "AI is writing..." : "AI Auto-Fill Ad Content"}</Text>
                </LinearGradient>
              </Pressable>

              <Text style={styles.fieldLabel}>Ad Title *</Text>
              <TextInput style={styles.input} value={adTitle} onChangeText={setAdTitle} placeholder="e.g. Flat 50% Off" placeholderTextColor={Colors.textLight} maxLength={40} />

              <Text style={styles.fieldLabel}>Subtitle *</Text>
              <TextInput style={styles.input} value={adSubtitle} onChangeText={setAdSubtitle} placeholder="e.g. On your first order" placeholderTextColor={Colors.textLight} maxLength={60} />

              <Text style={styles.fieldLabel}>Description</Text>
              <TextInput style={[styles.input, { height: 80, textAlignVertical: "top" }]} value={adDescription} onChangeText={setAdDescription} placeholder="Describe your promotion..." placeholderTextColor={Colors.textLight} multiline maxLength={200} />

              <Text style={styles.fieldLabel}>Banner Color</Text>
              <View style={styles.colorRow}>
                {AD_COLORS.map((c) => (
                  <Pressable key={c} onPress={() => setSelectedColor(c)} style={[styles.colorDot, { backgroundColor: c }, selectedColor === c && styles.colorDotActive]}>
                    {selectedColor === c && <Ionicons name="checkmark" size={16} color="#FFF" />}
                  </Pressable>
                ))}
              </View>

              <View style={styles.previewSection}>
                <Text style={styles.fieldLabel}>Preview</Text>
                <LinearGradient colors={[selectedColor, selectedColor + "CC"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.previewBanner}>
                  <View style={styles.previewBrand}>
                    <Ionicons name="storefront" size={10} color="#FFF" />
                    <Text style={styles.previewBrandText}>{user?.name || "Your Store"}</Text>
                  </View>
                  <Text style={styles.previewTitle}>{adTitle || "Your Ad Title"}</Text>
                  <Text style={styles.previewSubtitle}>{adSubtitle || "Your subtitle here"}</Text>
                </LinearGradient>
              </View>

              <View style={styles.priceSummary}>
                <View style={styles.priceRow}>
                  <Text style={styles.priceLabel}>{SLOT_PRICES[selectedSlot].label} ({selectedDuration} days)</Text>
                  <Text style={styles.priceValue}>{"\u20B9"}{getPrice()}</Text>
                </View>
                <View style={styles.priceRow}>
                  <Text style={styles.priceLabel}>GST (18%)</Text>
                  <Text style={styles.priceValue}>{"\u20B9"}{Math.round(getPrice() * 0.18)}</Text>
                </View>
                <View style={[styles.priceRow, styles.totalRow]}>
                  <Text style={styles.totalLabel}>Total</Text>
                  <Text style={styles.totalValue}>{"\u20B9"}{getPrice() + Math.round(getPrice() * 0.18)}</Text>
                </View>
              </View>

              <Pressable style={styles.submitBtn} onPress={handleSubmit}>
                <LinearGradient colors={[Colors.primary, "#EA580C"]} style={styles.submitGradient}>
                  <Ionicons name="megaphone" size={20} color="#FFF" />
                  <Text style={styles.submitText}>Submit Ad Request</Text>
                </LinearGradient>
              </Pressable>

              <Text style={styles.disclaimer}>Your ad will be reviewed by the franchise manager, then by the admin before going live.</Text>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8F9FB" },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, backgroundColor: "#FFF", borderBottomWidth: 1, borderBottomColor: "#F0F1F5" },
  backBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: "#F3F4F6", alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, fontFamily: "Poppins_700Bold", fontSize: 20, color: Colors.secondary, marginLeft: 12 },
  addBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: Colors.primary, alignItems: "center", justifyContent: "center" },
  summaryRow: { flexDirection: "row", paddingHorizontal: 16, paddingVertical: 14, gap: 10 },
  summaryCard: { flex: 1, borderRadius: 14, padding: 14, alignItems: "center" },
  summaryValue: { fontFamily: "Poppins_700Bold", fontSize: 24 },
  summaryLabel: { fontFamily: "Poppins_500Medium", fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  filterWrapper: { flexShrink: 0 },
  filterRow: { paddingHorizontal: 16, gap: 8, paddingVertical: 10, alignItems: "center" },
  filterChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: "#FFF", borderWidth: 1, borderColor: "#E5E7EB" },
  filterChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterText: { fontFamily: "Poppins_500Medium", fontSize: 13, color: Colors.textSecondary },
  filterTextActive: { color: "#FFF" },
  list: { flex: 1, paddingHorizontal: 16 },
  emptyState: { alignItems: "center", paddingTop: 60, paddingHorizontal: 30 },
  emptyTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 18, color: Colors.text, marginTop: 16 },
  emptySubtitle: { fontFamily: "Poppins_400Regular", fontSize: 13, color: Colors.textSecondary, textAlign: "center", marginTop: 6, lineHeight: 20 },
  emptyBtn: { marginTop: 20, backgroundColor: Colors.primary, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 },
  emptyBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: "#FFF" },
  adCard: { backgroundColor: "#FFF", borderRadius: 16, marginBottom: 12, overflow: "hidden", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  adPreview: { height: 80, paddingHorizontal: 16, justifyContent: "center" },
  adPreviewTitle: { fontFamily: "Poppins_700Bold", fontSize: 18, color: "#FFF" },
  adPreviewSubtitle: { fontFamily: "Poppins_400Regular", fontSize: 12, color: "rgba(255,255,255,0.85)" },
  adDetails: { padding: 14 },
  adTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  adId: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: Colors.textSecondary },
  statusBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  statusText: { fontFamily: "Poppins_600SemiBold", fontSize: 11 },
  adMetaRow: { flexDirection: "row", gap: 14 },
  adMeta: { flexDirection: "row", alignItems: "center", gap: 4 },
  adMetaText: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary },
  liveBanner: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#22C55E12", borderRadius: 8, padding: 8, marginTop: 10 },
  liveBannerText: { fontFamily: "Poppins_500Medium", fontSize: 12, color: "#22C55E" },
  rejectionBanner: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#EF444412", borderRadius: 8, padding: 8, marginTop: 10 },
  rejectionText: { fontFamily: "Poppins_400Regular", fontSize: 12, color: "#EF4444", flex: 1 },
  adBottomRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 8 },
  adTime: { fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textLight },
  viewInvoiceBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: Colors.primary + "10", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  viewInvoiceBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 11, color: Colors.primary },
  fab: { position: "absolute", right: 16, borderRadius: 16, overflow: "hidden", shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 6 },
  fabGradient: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 20, paddingVertical: 14 },
  fabText: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: "#FFF" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalContent: { backgroundColor: "#FFF", borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "92%", paddingHorizontal: 20, paddingTop: 20 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  modalTitle: { fontFamily: "Poppins_700Bold", fontSize: 20, color: Colors.secondary },
  fieldLabel: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: Colors.text, marginTop: 16, marginBottom: 8 },
  slotOptions: { gap: 10 },
  slotCard: { borderWidth: 1.5, borderColor: "#E5E7EB", borderRadius: 14, padding: 14, gap: 4 },
  slotCardActive: { borderColor: Colors.primary, backgroundColor: Colors.primary + "08" },
  slotName: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: Colors.text },
  slotNameActive: { color: Colors.primary },
  slotDesc: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary },
  durationRow: { flexDirection: "row", gap: 10 },
  durationChip: { flex: 1, borderWidth: 1.5, borderColor: "#E5E7EB", borderRadius: 12, padding: 12, alignItems: "center" },
  durationChipActive: { borderColor: Colors.primary, backgroundColor: Colors.primary + "08" },
  durationText: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: Colors.text },
  durationTextActive: { color: Colors.primary },
  durationPrice: { fontFamily: "Poppins_700Bold", fontSize: 16, color: Colors.textSecondary, marginTop: 4 },
  durationPriceActive: { color: Colors.primary },
  input: { backgroundColor: "#F8F9FB", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontFamily: "Poppins_400Regular", fontSize: 14, color: Colors.text, borderWidth: 1, borderColor: "#E5E7EB" },
  colorRow: { flexDirection: "row", gap: 10, flexWrap: "wrap" },
  colorDot: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  colorDotActive: { borderWidth: 3, borderColor: "#FFF", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 4 },
  previewSection: { marginBottom: 10 },
  previewBanner: { borderRadius: 14, padding: 16, height: 100, justifyContent: "center" },
  previewBrand: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(255,255,255,0.2)", alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, marginBottom: 6 },
  previewBrandText: { fontFamily: "Poppins_600SemiBold", fontSize: 9, color: "#FFF" },
  previewTitle: { fontFamily: "Poppins_700Bold", fontSize: 18, color: "#FFF" },
  previewSubtitle: { fontFamily: "Poppins_400Regular", fontSize: 12, color: "rgba(255,255,255,0.85)" },
  priceSummary: { backgroundColor: "#F8F9FB", borderRadius: 14, padding: 16, marginTop: 16 },
  priceRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  priceLabel: { fontFamily: "Poppins_400Regular", fontSize: 13, color: Colors.textSecondary },
  priceValue: { fontFamily: "Poppins_500Medium", fontSize: 13, color: Colors.text },
  totalRow: { borderTopWidth: 1, borderTopColor: "#E5E7EB", paddingTop: 10, marginBottom: 0 },
  totalLabel: { fontFamily: "Poppins_700Bold", fontSize: 15, color: Colors.secondary },
  totalValue: { fontFamily: "Poppins_700Bold", fontSize: 15, color: Colors.primary },
  submitBtn: { marginTop: 16, borderRadius: 14, overflow: "hidden" },
  submitGradient: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 16 },
  submitText: { fontFamily: "Poppins_700Bold", fontSize: 16, color: "#FFF" },
  disclaimer: { fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textLight, textAlign: "center", marginTop: 12, lineHeight: 16 },
  aiBtn: { marginTop: 18, borderRadius: 12, overflow: "hidden" },
  aiBtnGradient: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 13 },
  aiBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: "#FFF" },
});

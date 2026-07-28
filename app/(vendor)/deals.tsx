import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Platform, Modal, TextInput, Alert, FlatList } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useApp } from "@/lib/store";
import { products } from "@/lib/data";
import { DealSlotDuration, DealPaymentMethod, Invoice, Product } from "@/lib/types";
import InvoiceView from "@/components/InvoiceView";
import { getApiUrl } from "@/lib/query-client";

export default function VendorDealsScreen() {
  const insets = useSafeAreaInsets();
  const { user, dealBookings, adminPricing, submitDealBooking, vendorApplications, walletBalance, getInvoiceByRef } = useApp();
  const topInset = Platform.OS === "web" ? (insets.top > 0 ? insets.top : 30) : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  const vendorApp = vendorApplications.find(a => a.phone.replace(/\D/g, "").slice(-10) === user?.phone?.replace(/\D/g, "").slice(-10) && (a.status === "APPROVED" || a.status === "LIVE"));
  const vendorId = vendorApp?.id || user?.id || "v1";
  const vendorName = vendorApp?.businessName || user?.name || "Vendor";

  const myBookings = dealBookings.filter(b => b.vendorId === vendorId);
  const activeBookings = myBookings.filter(b => b.status === "ACTIVE").length;
  const pendingBookings = myBookings.filter(b => b.status === "PENDING").length;

  const [showBookModal, setShowBookModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<string>("");
  const [dealPrice, setDealPrice] = useState("");
  const [selectedDuration, setSelectedDuration] = useState<DealSlotDuration>("1day");
  const [selectedPayment, setSelectedPayment] = useState<DealPaymentMethod>("upi");
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [vendorAddedProducts, setVendorAddedProducts] = useState<Product[]>([]);

  useEffect(() => {
    if (!vendorId) return;
    const baseUrl = getApiUrl();
    fetch(new URL(`/api/vendor/products/${vendorId}`, baseUrl).toString())
      .then((r) => r.ok ? r.json() : [])
      .then((serverProducts: Product[]) => {
        const hardcodedIds = new Set(products.filter((p) => p.vendorId === vendorId).map((p) => p.id));
        setVendorAddedProducts(serverProducts.filter((p: Product) => !hardcodedIds.has(p.id)));
      })
      .catch(() => {});
  }, [vendorId]);

  const allProducts = [...products.filter(p => p.vendorId === vendorId), ...vendorAddedProducts];

  const durationLabels: Record<DealSlotDuration, string> = { "1day": "1 Day", "3days": "3 Days", "7days": "7 Days" };
  const statusColors: Record<string, string> = { PENDING: "#F59E0B", ACTIVE: "#10B981", EXPIRED: "#6B7280", REJECTED: "#EF4444" };

  const handleBookDeal = () => {
    if (!selectedProduct) { Alert.alert("Select Product", "Please select a product for the deal"); return; }
    const price = parseInt(dealPrice);
    if (!price || price <= 0) { Alert.alert("Invalid Price", "Please enter a valid deal price"); return; }
    const product = allProducts.find(p => p.id === selectedProduct);
    if (!product) return;
    if (price >= product.price) { Alert.alert("Invalid Price", "Deal price must be lower than the original price"); return; }
    const slotFee = adminPricing.dealSlotRates[selectedDuration];
    if (selectedPayment === "wallet" && walletBalance < slotFee) {
      Alert.alert("Insufficient Balance", `Your wallet balance (\u20B9${walletBalance}) is less than the slot fee (\u20B9${slotFee}). Please add money or choose another payment method.`);
      return;
    }

    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}

    submitDealBooking({
      vendorId,
      vendorName,
      productId: product.id,
      productName: product.name,
      productImage: product.image,
      dealPrice: price,
      originalPrice: product.price,
      duration: selectedDuration,
      paymentMethod: selectedPayment,
    });

    setShowBookModal(false);
    setSelectedProduct("");
    setDealPrice("");
    setSelectedDuration("1day");
    setSelectedPayment("upi");
    Alert.alert("Submitted!", "Your deal slot request has been submitted for admin approval. You will be notified once reviewed.", [{ text: "OK" }]);
  };

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
      <View style={styles.headerBar}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={Colors.secondary} />
        </Pressable>
        <Text style={styles.headerTitle}>My Deal Slots</Text>
        <View style={{ width: 40 }} />
      </View>

      <LinearGradient colors={["#EF4444", "#DC2626"]} style={styles.promoBanner}>
        <View style={styles.promoContent}>
          <Ionicons name="flash" size={28} color="#FFD700" />
          <View style={{ flex: 1 }}>
            <Text style={styles.promoTitle}>Boost Your Sales!</Text>
            <Text style={styles.promoSubtitle}>Get your products featured in Daily Deals and reach thousands of customers</Text>
          </View>
        </View>
        <View style={styles.promoStats}>
          <View style={styles.promoStat}>
            <Text style={styles.promoStatValue}>{activeBookings}</Text>
            <Text style={styles.promoStatLabel}>Active</Text>
          </View>
          <View style={styles.promoStat}>
            <Text style={styles.promoStatValue}>{pendingBookings}</Text>
            <Text style={styles.promoStatLabel}>Pending</Text>
          </View>
          <View style={styles.promoStat}>
            <Text style={styles.promoStatValue}>{myBookings.length}</Text>
            <Text style={styles.promoStatLabel}>Total</Text>
          </View>
        </View>
      </LinearGradient>

      <View style={styles.ratesCard}>
        <Text style={styles.ratesTitle}>Deal Slot Pricing</Text>
        <View style={styles.ratesRow}>
          {(["1day", "3days", "7days"] as DealSlotDuration[]).map(d => (
            <View key={d} style={styles.rateItem}>
              <Text style={styles.rateDuration}>{durationLabels[d]}</Text>
              <Text style={styles.ratePrice}>{"\u20B9"}{adminPricing.dealSlotRates[d]}</Text>
            </View>
          ))}
        </View>
      </View>

      <Pressable style={styles.bookBtn} onPress={() => setShowBookModal(true)}>
        <Ionicons name="add-circle" size={22} color="#FFF" />
        <Text style={styles.bookBtnText}>Book New Deal Slot</Text>
      </Pressable>

      <Text style={styles.sectionTitle}>My Bookings</Text>

      <FlatList
        data={myBookings}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: bottomInset + 20, gap: 10 }}
        showsVerticalScrollIndicator={false}
        keyExtractor={item => item.id}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="flash-outline" size={48} color={Colors.textLight} />
            <Text style={styles.emptyText}>No deal bookings yet</Text>
            <Text style={styles.emptySubtext}>Book a deal slot to get your products featured!</Text>
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
                  <View style={styles.bookingPriceRow}>
                    <Text style={styles.bookingDealPrice}>{"\u20B9"}{item.dealPrice}</Text>
                    <Text style={styles.bookingOrigPrice}>{"\u20B9"}{item.originalPrice}</Text>
                    <View style={styles.discBadge}><Text style={styles.discText}>{discPct}% OFF</Text></View>
                  </View>
                  <View style={styles.bookingMetaRow}>
                    <Text style={styles.metaText}>{durationLabels[item.duration]} | Fee: {"\u20B9"}{item.slotFee}</Text>
                    <View style={[styles.statusBadge, { backgroundColor: statusColors[item.status] + "18" }]}>
                      <Text style={[styles.statusText, { color: statusColors[item.status] }]}>{item.status}</Text>
                    </View>
                  </View>
                </View>
              </View>
              {item.status === "ACTIVE" && item.expiresAt && (
                <View style={styles.expiryRow}>
                  <Ionicons name="time-outline" size={13} color={Colors.info} />
                  <Text style={styles.expiryText}>Expires: {new Date(item.expiresAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</Text>
                </View>
              )}
              {item.status === "REJECTED" && item.rejectionReason && (
                <View style={styles.rejectionRow}>
                  <Ionicons name="close-circle" size={13} color="#EF4444" />
                  <Text style={styles.rejectionText}>{item.rejectionReason}</Text>
                </View>
              )}
              {(() => {
                const inv = getInvoiceByRef(item.id);
                if (!inv) return null;
                return (
                  <Pressable
                    style={styles.viewInvoiceBtn}
                    onPress={() => {
                      setSelectedInvoice(inv);
                      setShowInvoiceModal(true);
                    }}
                  >
                    <Ionicons name="receipt-outline" size={14} color={Colors.primary} />
                    <Text style={styles.viewInvoiceBtnText}>View Invoice</Text>
                  </Pressable>
                );
              })()}
            </View>
          );
        }}
      />

      <Modal visible={showInvoiceModal} transparent animationType="slide">
        <View style={{ flex: 1 }}>
          {selectedInvoice && (
            <InvoiceView
              invoice={selectedInvoice}
              onClose={() => {
                setShowInvoiceModal(false);
                setSelectedInvoice(null);
              }}
            />
          )}
        </View>
      </Modal>

      <Modal visible={showBookModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: "85%" }]}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>Book Deal Slot</Text>
              <Pressable onPress={() => setShowBookModal(false)}>
                <Ionicons name="close-circle" size={28} color={Colors.textLight} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.fieldLabel}>Select Product</Text>
              {allProducts.length === 0 && (
                <View style={{ padding: 16, alignItems: "center" }}>
                  <Text style={{ fontFamily: "Poppins_400Regular", fontSize: 13, color: Colors.textSecondary, textAlign: "center" }}>No products added yet. Add products from the Services/Products tab first.</Text>
                </View>
              )}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingBottom: 8 }}>
                {allProducts.map(p => (
                  <Pressable
                    key={p.id}
                    style={[styles.productOption, selectedProduct === p.id && styles.selectedProduct]}
                    onPress={() => setSelectedProduct(p.id)}
                  >
                    <Image source={{ uri: p.image }} style={styles.productOptionImage} contentFit="cover" accessibilityLabel={p.name} />
                    <Text style={styles.productOptionName} numberOfLines={1}>{p.name}</Text>
                    <Text style={styles.productOptionPrice}>{"\u20B9"}{p.price}</Text>
                    {selectedProduct === p.id && (
                      <View style={styles.selectedCheck}>
                        <Ionicons name="checkmark-circle" size={20} color={Colors.primary} />
                      </View>
                    )}
                  </Pressable>
                ))}
              </ScrollView>

              <Text style={styles.fieldLabel}>Deal Price ({"\u20B9"})</Text>
              <TextInput
                style={styles.fieldInput}
                placeholder="Enter discounted price"
                placeholderTextColor={Colors.textLight}
                keyboardType="numeric"
                value={dealPrice}
                onChangeText={setDealPrice}
              />
              {selectedProduct && dealPrice && parseInt(dealPrice) > 0 && (
                <View style={styles.savingsRow}>
                  <Ionicons name="trending-down" size={14} color="#10B981" />
                  <Text style={styles.savingsText}>
                    Customer saves {"\u20B9"}{(allProducts.find(p => p.id === selectedProduct)?.price || 0) - parseInt(dealPrice)} ({Math.round((1 - parseInt(dealPrice) / (allProducts.find(p => p.id === selectedProduct)?.price || 1)) * 100)}% off)
                  </Text>
                </View>
              )}

              <Text style={styles.fieldLabel}>Duration</Text>
              <View style={styles.durationRow}>
                {(["1day", "3days", "7days"] as DealSlotDuration[]).map(d => (
                  <Pressable
                    key={d}
                    style={[styles.durationOption, selectedDuration === d && styles.selectedDuration]}
                    onPress={() => setSelectedDuration(d)}
                  >
                    <Text style={[styles.durationLabel, selectedDuration === d && styles.selectedDurationLabel]}>{durationLabels[d]}</Text>
                    <Text style={[styles.durationPrice, selectedDuration === d && styles.selectedDurationPrice]}>{"\u20B9"}{adminPricing.dealSlotRates[d]}</Text>
                  </Pressable>
                ))}
              </View>

              <View style={styles.summaryCard}>
                <Text style={styles.summaryTitle}>Booking Summary</Text>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Slot Fee</Text>
                  <Text style={styles.summaryValue}>{"\u20B9"}{adminPricing.dealSlotRates[selectedDuration]}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Duration</Text>
                  <Text style={styles.summaryValue}>{durationLabels[selectedDuration]}</Text>
                </View>
                <View style={[styles.summaryRow, { borderBottomWidth: 0 }]}>
                  <Text style={[styles.summaryLabel, { fontFamily: "Poppins_700Bold", color: Colors.secondary }]}>Total Payable</Text>
                  <Text style={[styles.summaryValue, { color: Colors.primary, fontSize: 18 }]}>{"\u20B9"}{adminPricing.dealSlotRates[selectedDuration]}</Text>
                </View>
              </View>

              <Text style={styles.fieldLabel}>Payment Method</Text>
              <View style={styles.paymentMethodsContainer} accessibilityRole="radiogroup" accessibilityLabel="Payment method selection">
                {([
                  { id: "upi", label: "UPI", sub: "Google Pay, PhonePe, Paytm", icon: "phone-portrait" as const },
                  { id: "card", label: "Debit / Credit Card", sub: "Visa, Mastercard, RuPay", icon: "card" as const },
                  { id: "netbanking", label: "Net Banking", sub: "All major banks", icon: "business" as const },
                  { id: "wallet", label: "Go Bharat Wallet", sub: `Balance: \u20B9${walletBalance}`, icon: "wallet" as const },
                ]).map((method) => {
                  const isSelected = selectedPayment === method.id;
                  const insufficientBalance = method.id === "wallet" && walletBalance < adminPricing.dealSlotRates[selectedDuration];
                  return (
                    <Pressable
                      key={method.id}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: isSelected, disabled: insufficientBalance }}
                      accessibilityLabel={`${method.label} - ${method.sub}`}
                      style={[styles.paymentMethod, isSelected && styles.paymentMethodSelected, insufficientBalance && { opacity: 0.5 }]}
                      onPress={() => {
                        if (insufficientBalance) {
                          Alert.alert("Insufficient Balance", `Your wallet balance (\u20B9${walletBalance}) is less than the slot fee (\u20B9${adminPricing.dealSlotRates[selectedDuration]}). Please add money or choose another method.`);
                          return;
                        }
                        setSelectedPayment(method.id as DealPaymentMethod);
                      }}
                    >
                      <View style={[styles.paymentMethodIcon, isSelected && { backgroundColor: Colors.primary + "15" }]}>
                        <Ionicons name={method.icon} size={20} color={isSelected ? Colors.primary : Colors.textSecondary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.paymentMethodLabel, isSelected && { color: Colors.primary }]}>{method.label}</Text>
                        <Text style={styles.paymentMethodSub}>{method.sub}</Text>
                      </View>
                      <View style={[styles.paymentRadio, isSelected && styles.paymentRadioSelected]}>
                        {isSelected && <View style={styles.paymentRadioDot} />}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
              <View style={styles.securityRow}>
                <Ionicons name="shield-checkmark" size={14} color="#10B981" />
                <Text style={styles.securityText}>100% Secure Payment</Text>
                <Ionicons name="lock-closed" size={12} color="#10B981" />
                <Text style={styles.securityText}>256-bit SSL</Text>
              </View>
            </ScrollView>

            <Pressable style={styles.submitBtn} onPress={handleBookDeal}>
              <Ionicons name="flash" size={20} color="#FFF" />
              <Text style={styles.submitBtnText}>Pay & Submit Deal Request</Text>
            </Pressable>
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
  promoBanner: { marginHorizontal: 16, borderRadius: 16, padding: 16, marginBottom: 14 },
  promoContent: { flexDirection: "row", alignItems: "center", gap: 12 },
  promoTitle: { fontFamily: "Poppins_700Bold", fontSize: 18, color: "#FFF" },
  promoSubtitle: { fontFamily: "Poppins_400Regular", fontSize: 12, color: "rgba(255,255,255,0.85)", marginTop: 2 },
  promoStats: { flexDirection: "row", marginTop: 14, gap: 12 },
  promoStat: { flex: 1, backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 10, padding: 10, alignItems: "center" },
  promoStatValue: { fontFamily: "Poppins_700Bold", fontSize: 20, color: "#FFF" },
  promoStatLabel: { fontFamily: "Poppins_400Regular", fontSize: 11, color: "rgba(255,255,255,0.8)" },
  ratesCard: { marginHorizontal: 16, backgroundColor: "#FFF", borderRadius: 14, padding: 14, marginBottom: 14, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 1 },
  ratesTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: Colors.textSecondary, marginBottom: 10 },
  ratesRow: { flexDirection: "row", gap: 10 },
  rateItem: { flex: 1, backgroundColor: "#FFF7ED", borderRadius: 10, padding: 10, alignItems: "center", borderWidth: 1, borderColor: "#FDBA74" },
  rateDuration: { fontFamily: "Poppins_500Medium", fontSize: 12, color: Colors.textSecondary },
  ratePrice: { fontFamily: "Poppins_700Bold", fontSize: 16, color: Colors.primary, marginTop: 2 },
  bookBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#EF4444", marginHorizontal: 16, borderRadius: 12, paddingVertical: 14, marginBottom: 14 },
  bookBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: "#FFF" },
  sectionTitle: { fontFamily: "Poppins_700Bold", fontSize: 16, color: Colors.secondary, paddingHorizontal: 16, marginBottom: 10 },
  emptyState: { alignItems: "center", justifyContent: "center", paddingVertical: 50 },
  emptyText: { fontFamily: "Poppins_600SemiBold", fontSize: 15, color: Colors.textSecondary, marginTop: 12 },
  emptySubtext: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textLight, marginTop: 4 },
  bookingCard: { backgroundColor: "#FFF", borderRadius: 14, padding: 14, borderLeftWidth: 4, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  bookingHeader: { flexDirection: "row", gap: 12 },
  bookingImage: { width: 65, height: 65, borderRadius: 10 },
  bookingInfo: { flex: 1 },
  bookingProduct: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: Colors.secondary },
  bookingPriceRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 3 },
  bookingDealPrice: { fontFamily: "Poppins_700Bold", fontSize: 15, color: "#EF4444" },
  bookingOrigPrice: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textLight, textDecorationLine: "line-through" },
  discBadge: { backgroundColor: "#EF4444" + "18", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  discText: { fontFamily: "Poppins_600SemiBold", fontSize: 10, color: "#EF4444" },
  bookingMetaRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 },
  metaText: { fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textSecondary },
  statusBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontFamily: "Poppins_600SemiBold", fontSize: 10 },
  expiryRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: "#F3F4F6" },
  expiryText: { fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.info },
  rejectionRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: "#F3F4F6" },
  rejectionText: { fontFamily: "Poppins_400Regular", fontSize: 11, color: "#EF4444", flex: 1 },
  viewInvoiceBtn: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: "#F3F4F6", alignSelf: "flex-start" as const },
  viewInvoiceBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 12, color: Colors.primary },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalContent: { backgroundColor: "#FFF", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20 },
  modalHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  modalTitle: { fontFamily: "Poppins_700Bold", fontSize: 18, color: Colors.secondary },
  fieldLabel: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: Colors.secondary, marginBottom: 8, marginTop: 12 },
  productOption: { width: 110, backgroundColor: "#F8F9FA", borderRadius: 12, overflow: "hidden", borderWidth: 2, borderColor: "transparent" },
  selectedProduct: { borderColor: Colors.primary },
  productOptionImage: { width: 110, height: 80 },
  productOptionName: { fontFamily: "Poppins_500Medium", fontSize: 11, color: Colors.secondary, paddingHorizontal: 6, marginTop: 4 },
  productOptionPrice: { fontFamily: "Poppins_600SemiBold", fontSize: 12, color: Colors.primary, paddingHorizontal: 6, paddingBottom: 6 },
  selectedCheck: { position: "absolute", top: 4, right: 4 },
  fieldInput: { backgroundColor: "#F3F4F6", borderRadius: 10, padding: 12, fontFamily: "Poppins_500Medium", fontSize: 14, color: Colors.secondary },
  savingsRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 6 },
  savingsText: { fontFamily: "Poppins_500Medium", fontSize: 12, color: "#10B981" },
  durationRow: { flexDirection: "row", gap: 10 },
  durationOption: { flex: 1, backgroundColor: "#F3F4F6", borderRadius: 12, padding: 12, alignItems: "center", borderWidth: 2, borderColor: "transparent" },
  selectedDuration: { borderColor: Colors.primary, backgroundColor: Colors.primary + "08" },
  durationLabel: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: Colors.textSecondary },
  selectedDurationLabel: { color: Colors.primary },
  durationPrice: { fontFamily: "Poppins_700Bold", fontSize: 15, color: Colors.secondary, marginTop: 2 },
  selectedDurationPrice: { color: Colors.primary },
  summaryCard: { backgroundColor: "#FFF7ED", borderRadius: 12, padding: 14, marginTop: 16, borderWidth: 1, borderColor: "#FDBA74" },
  summaryTitle: { fontFamily: "Poppins_700Bold", fontSize: 14, color: Colors.secondary, marginBottom: 8 },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: "#FDE68A" },
  summaryLabel: { fontFamily: "Poppins_500Medium", fontSize: 13, color: Colors.textSecondary },
  summaryValue: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: Colors.secondary },
  paymentMethodsContainer: { gap: 8 },
  paymentMethod: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#F8F9FA", borderRadius: 12, padding: 12, borderWidth: 1.5, borderColor: "transparent" },
  paymentMethodSelected: { borderColor: Colors.primary, backgroundColor: Colors.primary + "06" },
  paymentMethodIcon: { width: 40, height: 40, borderRadius: 10, backgroundColor: "#F0F0F0", alignItems: "center", justifyContent: "center" },
  paymentMethodLabel: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: Colors.secondary },
  paymentMethodSub: { fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textLight, marginTop: 1 },
  paymentRadio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: "#D1D5DB", alignItems: "center", justifyContent: "center" },
  paymentRadioSelected: { borderColor: Colors.primary },
  paymentRadioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.primary },
  securityRow: { flexDirection: "row", alignItems: "center", gap: 5, justifyContent: "center", marginTop: 12, marginBottom: 4 },
  securityText: { fontFamily: "Poppins_400Regular", fontSize: 11, color: "#10B981" },
  submitBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#EF4444", borderRadius: 12, paddingVertical: 14, marginTop: 16 },
  submitBtnText: { fontFamily: "Poppins_700Bold", fontSize: 14, color: "#FFF" },
});

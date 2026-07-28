import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  Modal,
  TextInput,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useApp } from "@/lib/store";

interface BulkOrder {
  id: string;
  buyerName: string;
  items: string;
  value: number;
  orderDate: string;
  deliveryDate: string;
  status: "New" | "Processing" | "Dispatched" | "Delivered" | "Cancelled";
  paymentTerms: "Advance" | "COD" | "Credit (30 days)" | "Credit (60 days)";
}

interface PricingTier {
  id: string;
  product: string;
  category: string;
  retail: number;
  tier1: number;
  tier1Range: string;
  tier2: number;
  tier2Range: string;
  tier3: number;
  tier3Range: string;
  moq: string;
  unit: string;
}

interface BusinessBuyer {
  id: string;
  businessName: string;
  ownerName: string;
  gst: string;
  type: string;
  totalOrders: number;
  totalValue: number;
  creditLimit: number;
  outstanding: number;
  verified: boolean;
}

interface Invoice {
  id: string;
  number: string;
  buyerName: string;
  amount: number;
  date: string;
  status: "Paid" | "Pending" | "Overdue";
}

const statusColors: Record<string, string> = {
  New: Colors.info,
  Processing: Colors.warning,
  Dispatched: "#8B5CF6",
  Delivered: Colors.success,
  Cancelled: Colors.error,
  Paid: Colors.success,
  Pending: Colors.warning,
  Overdue: Colors.error,
};

export default function VendorB2BScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useApp();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  const [bulkOrders, setBulkOrders] = useState<BulkOrder[]>([
    {
      id: "B2B-10234",
      buyerName: "Sharma Restaurant Chain",
      items: "500 kg Basmati Rice, 200 kg Sugar, 100 L Mustard Oil",
      value: 185000,
      orderDate: "18 Feb 2026",
      deliveryDate: "22 Feb 2026",
      status: "Processing",
      paymentTerms: "Credit (30 days)",
    },
    {
      id: "B2B-10233",
      buyerName: "Metro Mart Retail",
      items: "300 kg Wheat Flour, 150 kg Toor Dal, 80 kg Chana Dal",
      value: 92500,
      orderDate: "17 Feb 2026",
      deliveryDate: "20 Feb 2026",
      status: "Dispatched",
      paymentTerms: "Advance",
    },
    {
      id: "B2B-10232",
      buyerName: "Royal Caterers Pvt Ltd",
      items: "250 kg Paneer, 100 kg Ghee, 50 kg Cashews",
      value: 275000,
      orderDate: "16 Feb 2026",
      deliveryDate: "19 Feb 2026",
      status: "Delivered",
      paymentTerms: "Credit (60 days)",
    },
    {
      id: "B2B-10231",
      buyerName: "Fresh Daily Supermarket",
      items: "400 kg Onions, 300 kg Potatoes, 200 kg Tomatoes",
      value: 54000,
      orderDate: "15 Feb 2026",
      deliveryDate: "16 Feb 2026",
      status: "New",
      paymentTerms: "COD",
    },
    {
      id: "B2B-10230",
      buyerName: "Annapurna Foods",
      items: "600 kg Rice Bran Oil, 150 kg Spices Mix",
      value: 128000,
      orderDate: "14 Feb 2026",
      deliveryDate: "18 Feb 2026",
      status: "Cancelled",
      paymentTerms: "Credit (30 days)",
    },
  ]);

  const [pricingTiers, setPricingTiers] = useState<PricingTier[]>([
    {
      id: "p1",
      product: "Basmati Rice",
      category: "Grains",
      retail: 120,
      tier1: 110,
      tier1Range: "10-50 kg",
      tier2: 100,
      tier2Range: "50-100 kg",
      tier3: 90,
      tier3Range: "100+ kg",
      moq: "10 kg",
      unit: "kg",
    },
    {
      id: "p2",
      product: "Toor Dal",
      category: "Pulses",
      retail: 160,
      tier1: 148,
      tier1Range: "10-50 kg",
      tier2: 138,
      tier2Range: "50-100 kg",
      tier3: 125,
      tier3Range: "100+ kg",
      moq: "10 kg",
      unit: "kg",
    },
    {
      id: "p3",
      product: "Mustard Oil",
      category: "Oils",
      retail: 195,
      tier1: 180,
      tier1Range: "10-50 L",
      tier2: 168,
      tier2Range: "50-100 L",
      tier3: 155,
      tier3Range: "100+ L",
      moq: "10 L",
      unit: "L",
    },
    {
      id: "p4",
      product: "Refined Sugar",
      category: "Sweeteners",
      retail: 48,
      tier1: 44,
      tier1Range: "25-100 kg",
      tier2: 41,
      tier2Range: "100-500 kg",
      tier3: 38,
      tier3Range: "500+ kg",
      moq: "25 kg",
      unit: "kg",
    },
  ]);

  const [buyers, setBuyers] = useState<BusinessBuyer[]>([
    {
      id: "b1",
      businessName: "Sharma Restaurant Chain",
      ownerName: "Rajesh Sharma",
      gst: "07AAA****1234A1Z5",
      type: "Restaurant",
      totalOrders: 48,
      totalValue: 2450000,
      creditLimit: 500000,
      outstanding: 185000,
      verified: true,
    },
    {
      id: "b2",
      businessName: "Metro Mart Retail",
      ownerName: "Anil Gupta",
      gst: "09BBB****5678B2Z3",
      type: "Retailer",
      totalOrders: 32,
      totalValue: 1820000,
      creditLimit: 300000,
      outstanding: 0,
      verified: true,
    },
    {
      id: "b3",
      businessName: "Royal Caterers Pvt Ltd",
      ownerName: "Priya Mehta",
      gst: "27CCC****9012C3Z1",
      type: "Caterer",
      totalOrders: 25,
      totalValue: 3100000,
      creditLimit: 800000,
      outstanding: 275000,
      verified: true,
    },
    {
      id: "b4",
      businessName: "Fresh Daily Supermarket",
      ownerName: "Vikram Singh",
      gst: "06DDD****3456D4Z9",
      type: "Supermarket",
      totalOrders: 18,
      totalValue: 980000,
      creditLimit: 200000,
      outstanding: 54000,
      verified: true,
    },
    {
      id: "b5",
      businessName: "Annapurna Foods",
      ownerName: "Sunita Devi",
      gst: "33EEE****7890E5Z7",
      type: "Food Processor",
      totalOrders: 12,
      totalValue: 650000,
      creditLimit: 150000,
      outstanding: 0,
      verified: false,
    },
    {
      id: "b6",
      businessName: "Green Valley Organics",
      ownerName: "Arjun Patel",
      gst: "24FFF****2345F6Z4",
      type: "Retailer",
      totalOrders: 8,
      totalValue: 420000,
      creditLimit: 100000,
      outstanding: 38000,
      verified: false,
    },
  ]);

  const [invoices, setInvoices] = useState<Invoice[]>([
    { id: "i1", number: "INV-2026-0458", buyerName: "Sharma Restaurant Chain", amount: 185000, date: "18 Feb 2026", status: "Pending" },
    { id: "i2", number: "INV-2026-0457", buyerName: "Metro Mart Retail", amount: 92500, date: "17 Feb 2026", status: "Paid" },
    { id: "i3", number: "INV-2026-0456", buyerName: "Royal Caterers Pvt Ltd", amount: 275000, date: "16 Feb 2026", status: "Overdue" },
    { id: "i4", number: "INV-2026-0455", buyerName: "Fresh Daily Supermarket", amount: 54000, date: "15 Feb 2026", status: "Paid" },
    { id: "i5", number: "INV-2026-0454", buyerName: "Annapurna Foods", amount: 128000, date: "14 Feb 2026", status: "Pending" },
  ]);

  const [pricingModalVisible, setPricingModalVisible] = useState(false);
  const [selectedPricing, setSelectedPricing] = useState<PricingTier | null>(null);
  const [editRetail, setEditRetail] = useState("");
  const [editTier1, setEditTier1] = useState("");
  const [editTier2, setEditTier2] = useState("");
  const [editTier3, setEditTier3] = useState("");

  const [buyerModalVisible, setBuyerModalVisible] = useState(false);
  const [newBuyerName, setNewBuyerName] = useState("");
  const [newOwnerName, setNewOwnerName] = useState("");
  const [newGst, setNewGst] = useState("");
  const [newBuyerType, setNewBuyerType] = useState("");

  const handleBack = () => {
    try { Haptics.selectionAsync(); } catch {}
    router.back();
  };

  const openPricingModal = (tier: PricingTier) => {
    try { Haptics.selectionAsync(); } catch {}
    setSelectedPricing(tier);
    setEditRetail(tier.retail.toString());
    setEditTier1(tier.tier1.toString());
    setEditTier2(tier.tier2.toString());
    setEditTier3(tier.tier3.toString());
    setPricingModalVisible(true);
  };

  const savePricing = () => {
    if (!selectedPricing) return;
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
    setPricingTiers((prev) =>
      prev.map((p) =>
        p.id === selectedPricing.id
          ? {
              ...p,
              retail: Number(editRetail) || p.retail,
              tier1: Number(editTier1) || p.tier1,
              tier2: Number(editTier2) || p.tier2,
              tier3: Number(editTier3) || p.tier3,
            }
          : p
      )
    );
    setPricingModalVisible(false);
    Alert.alert("Pricing Updated", "Trade pricing has been updated successfully.");
  };

  const openAddBuyerModal = () => {
    try { Haptics.selectionAsync(); } catch {}
    setNewBuyerName("");
    setNewOwnerName("");
    setNewGst("");
    setNewBuyerType("");
    setBuyerModalVisible(true);
  };

  const addBuyer = () => {
    if (!newBuyerName.trim() || !newOwnerName.trim()) {
      Alert.alert("Error", "Please fill in business name and owner name.");
      return;
    }
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
    const newBuyer: BusinessBuyer = {
      id: "b" + Date.now().toString(),
      businessName: newBuyerName.trim(),
      ownerName: newOwnerName.trim(),
      gst: newGst.trim() || "Pending",
      type: newBuyerType.trim() || "Retailer",
      totalOrders: 0,
      totalValue: 0,
      creditLimit: 50000,
      outstanding: 0,
      verified: false,
    };
    setBuyers((prev) => [newBuyer, ...prev]);
    setBuyerModalVisible(false);
    Alert.alert("Buyer Added", `${newBuyerName} has been added to the directory.`);
  };

  const generateInvoice = () => {
    try { Haptics.selectionAsync(); } catch {}
    const invoiceNum = `INV-2026-${String(460 + invoices.length).padStart(4, "0")}`;
    const newInv: Invoice = {
      id: "i" + Date.now().toString(),
      number: invoiceNum,
      buyerName: buyers[Math.floor(Math.random() * buyers.length)]?.businessName || "New Buyer",
      amount: Math.floor(Math.random() * 200000) + 30000,
      date: "21 Feb 2026",
      status: "Pending",
    };
    setInvoices((prev) => [newInv, ...prev]);
    Alert.alert("Invoice Generated", `Invoice ${invoiceNum} created successfully.`);
  };

  const totalBuyers = buyers.length;
  const activeOrders = bulkOrders.filter((o) => o.status !== "Delivered" && o.status !== "Cancelled").length;
  const monthlyRevenue = bulkOrders.filter((o) => o.status !== "Cancelled").reduce((s, o) => s + o.value, 0);
  const repeatRate = 78;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ paddingBottom: bottomInset + 40 }} showsVerticalScrollIndicator={false}>
        <LinearGradient colors={["#0B1E3D", "#142F5E"]} style={[styles.header, { paddingTop: topInset + 12 }]}>
          <View style={styles.headerRow}>
            <Pressable onPress={handleBack} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={22} color="#FFF" />
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle}>B2B Wholesale Hub</Text>
              <Text style={styles.headerSub}>Manage bulk orders & trade pricing</Text>
            </View>
            <View style={styles.headerIcon}>
              <Ionicons name="business" size={22} color={Colors.primary} />
            </View>
          </View>
        </LinearGradient>

        <LinearGradient colors={[Colors.primary, "#E55D00"]} style={styles.overviewCard}>
          <Text style={styles.overviewTitle}>Business Overview</Text>
          <View style={styles.overviewGrid}>
            <View style={styles.overviewItem}>
              <Text style={styles.overviewValue}>{totalBuyers}</Text>
              <Text style={styles.overviewLabel}>Business Buyers</Text>
            </View>
            <View style={styles.overviewItem}>
              <Text style={styles.overviewValue}>{activeOrders}</Text>
              <Text style={styles.overviewLabel}>Active Orders</Text>
            </View>
            <View style={styles.overviewItem}>
              <Text style={styles.overviewValue}>{"\u20B9"}{(monthlyRevenue / 100000).toFixed(1)}L</Text>
              <Text style={styles.overviewLabel}>Monthly Revenue</Text>
            </View>
            <View style={styles.overviewItem}>
              <Text style={styles.overviewValue}>{repeatRate}%</Text>
              <Text style={styles.overviewLabel}>Repeat Buyer Rate</Text>
            </View>
          </View>
        </LinearGradient>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <Ionicons name="cube" size={20} color={Colors.secondary} />
              <Text style={styles.sectionTitle}>Bulk Order Management</Text>
            </View>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{bulkOrders.length}</Text>
            </View>
          </View>
          {bulkOrders.map((order) => (
            <View key={order.id} style={styles.orderCard}>
              <View style={styles.orderTopRow}>
                <View>
                  <Text style={styles.orderId}>{order.id}</Text>
                  <Text style={styles.buyerName}>{order.buyerName}</Text>
                </View>
                <View style={[styles.statusChip, { backgroundColor: (statusColors[order.status] || Colors.info) + "18" }]}>
                  <Text style={[styles.statusText, { color: statusColors[order.status] || Colors.info }]}>{order.status}</Text>
                </View>
              </View>
              <Text style={styles.orderItems}>{order.items}</Text>
              <View style={styles.orderMeta}>
                <View style={styles.orderMetaItem}>
                  <Ionicons name="calendar-outline" size={14} color={Colors.textSecondary} />
                  <Text style={styles.orderMetaText}>{order.orderDate}</Text>
                </View>
                <View style={styles.orderMetaItem}>
                  <Ionicons name="time-outline" size={14} color={Colors.textSecondary} />
                  <Text style={styles.orderMetaText}>Del: {order.deliveryDate}</Text>
                </View>
              </View>
              <View style={styles.orderBottom}>
                <Text style={styles.orderValue}>{"\u20B9"}{order.value.toLocaleString()}</Text>
                <View style={styles.paymentChip}>
                  <Ionicons name="card-outline" size={12} color={Colors.info} />
                  <Text style={styles.paymentText}>{order.paymentTerms}</Text>
                </View>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <Ionicons name="pricetags" size={20} color={Colors.secondary} />
              <Text style={styles.sectionTitle}>Trade Pricing Tiers</Text>
            </View>
          </View>
          {pricingTiers.map((tier) => (
            <View key={tier.id} style={styles.pricingCard}>
              <View style={styles.pricingHeader}>
                <View>
                  <Text style={styles.pricingProduct}>{tier.product}</Text>
                  <Text style={styles.pricingCategory}>{tier.category}</Text>
                </View>
                <Pressable onPress={() => openPricingModal(tier)} style={styles.editBtn}>
                  <Ionicons name="create-outline" size={18} color={Colors.primary} />
                </Pressable>
              </View>
              <View style={styles.tierRow}>
                <View style={styles.tierItem}>
                  <Text style={styles.tierLabel}>Retail</Text>
                  <Text style={styles.tierPrice}>{"\u20B9"}{tier.retail}/{tier.unit}</Text>
                </View>
                <View style={styles.tierItem}>
                  <Text style={styles.tierLabel}>{tier.tier1Range}</Text>
                  <Text style={[styles.tierPrice, { color: Colors.info }]}>{"\u20B9"}{tier.tier1}/{tier.unit}</Text>
                </View>
                <View style={styles.tierItem}>
                  <Text style={styles.tierLabel}>{tier.tier2Range}</Text>
                  <Text style={[styles.tierPrice, { color: "#8B5CF6" }]}>{"\u20B9"}{tier.tier2}/{tier.unit}</Text>
                </View>
                <View style={styles.tierItem}>
                  <Text style={styles.tierLabel}>{tier.tier3Range}</Text>
                  <Text style={[styles.tierPrice, { color: Colors.success }]}>{"\u20B9"}{tier.tier3}/{tier.unit}</Text>
                </View>
              </View>
              <View style={styles.moqRow}>
                <Ionicons name="alert-circle-outline" size={14} color={Colors.warning} />
                <Text style={styles.moqText}>MOQ: {tier.moq}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <Ionicons name="people" size={20} color={Colors.secondary} />
              <Text style={styles.sectionTitle}>Business Buyer Directory</Text>
            </View>
            <Pressable onPress={openAddBuyerModal} style={styles.addBtn}>
              <Ionicons name="add" size={18} color="#FFF" />
            </Pressable>
          </View>
          {buyers.map((buyer) => (
            <View key={buyer.id} style={styles.buyerCard}>
              <View style={styles.buyerTop}>
                <View style={[styles.buyerAvatar, { backgroundColor: buyer.verified ? Colors.success + "18" : Colors.warning + "18" }]}>
                  <Ionicons name="storefront" size={20} color={buyer.verified ? Colors.success : Colors.warning} />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <View style={styles.buyerNameRow}>
                    <Text style={styles.buyerBusinessName}>{buyer.businessName}</Text>
                    {buyer.verified ? (
                      <View style={styles.verifiedBadge}>
                        <Ionicons name="checkmark-circle" size={14} color={Colors.success} />
                        <Text style={styles.verifiedText}>Verified</Text>
                      </View>
                    ) : (
                      <View style={[styles.verifiedBadge, { backgroundColor: Colors.warning + "18" }]}>
                        <Ionicons name="time" size={14} color={Colors.warning} />
                        <Text style={[styles.verifiedText, { color: Colors.warning }]}>Pending</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.buyerOwner}>{buyer.ownerName}</Text>
                  <Text style={styles.buyerGst}>GST: {buyer.gst}</Text>
                </View>
              </View>
              <View style={styles.buyerStats}>
                <View style={styles.buyerStatItem}>
                  <Text style={styles.buyerStatLabel}>Type</Text>
                  <Text style={styles.buyerStatValue}>{buyer.type}</Text>
                </View>
                <View style={styles.buyerStatItem}>
                  <Text style={styles.buyerStatLabel}>Orders</Text>
                  <Text style={styles.buyerStatValue}>{buyer.totalOrders}</Text>
                </View>
                <View style={styles.buyerStatItem}>
                  <Text style={styles.buyerStatLabel}>Business</Text>
                  <Text style={styles.buyerStatValue}>{"\u20B9"}{(buyer.totalValue / 100000).toFixed(1)}L</Text>
                </View>
              </View>
              <View style={styles.buyerCreditRow}>
                <View style={styles.creditItem}>
                  <Text style={styles.creditLabel}>Credit Limit</Text>
                  <Text style={styles.creditValue}>{"\u20B9"}{buyer.creditLimit.toLocaleString()}</Text>
                </View>
                <View style={styles.creditItem}>
                  <Text style={styles.creditLabel}>Outstanding</Text>
                  <Text style={[styles.creditValue, buyer.outstanding > 0 ? { color: Colors.error } : { color: Colors.success }]}>
                    {"\u20B9"}{buyer.outstanding.toLocaleString()}
                  </Text>
                </View>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <Ionicons name="document-text" size={20} color={Colors.secondary} />
              <Text style={styles.sectionTitle}>Invoice Generator</Text>
            </View>
            <Pressable onPress={generateInvoice} style={styles.generateBtn}>
              <Ionicons name="add-circle" size={16} color="#FFF" />
              <Text style={styles.generateBtnText}>New Invoice</Text>
            </Pressable>
          </View>
          {invoices.map((inv) => (
            <View key={inv.id} style={styles.invoiceCard}>
              <View style={styles.invoiceLeft}>
                <View style={[styles.invoiceIcon, { backgroundColor: (statusColors[inv.status] || Colors.info) + "15" }]}>
                  <Ionicons name="receipt" size={18} color={statusColors[inv.status] || Colors.info} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.invoiceNum}>{inv.number}</Text>
                  <Text style={styles.invoiceBuyer}>{inv.buyerName}</Text>
                  <Text style={styles.invoiceDate}>{inv.date}</Text>
                </View>
              </View>
              <View style={styles.invoiceRight}>
                <Text style={styles.invoiceAmount}>{"\u20B9"}{inv.amount.toLocaleString()}</Text>
                <View style={[styles.invoiceStatus, { backgroundColor: (statusColors[inv.status] || Colors.info) + "18" }]}>
                  <Text style={[styles.invoiceStatusText, { color: statusColors[inv.status] || Colors.info }]}>{inv.status}</Text>
                </View>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

      <Modal visible={pricingModalVisible} transparent animationType="slide" onRequestClose={() => setPricingModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Pricing - {selectedPricing?.product}</Text>
              <Pressable onPress={() => setPricingModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </Pressable>
            </View>
            <View style={styles.modalField}>
              <Text style={styles.modalLabel}>Retail Price ({"\u20B9"}/{selectedPricing?.unit})</Text>
              <TextInput style={styles.modalInput} value={editRetail} onChangeText={setEditRetail} keyboardType="numeric" placeholder="Retail price" />
            </View>
            <View style={styles.modalField}>
              <Text style={styles.modalLabel}>{selectedPricing?.tier1Range} ({"\u20B9"}/{selectedPricing?.unit})</Text>
              <TextInput style={styles.modalInput} value={editTier1} onChangeText={setEditTier1} keyboardType="numeric" placeholder="Tier 1 price" />
            </View>
            <View style={styles.modalField}>
              <Text style={styles.modalLabel}>{selectedPricing?.tier2Range} ({"\u20B9"}/{selectedPricing?.unit})</Text>
              <TextInput style={styles.modalInput} value={editTier2} onChangeText={setEditTier2} keyboardType="numeric" placeholder="Tier 2 price" />
            </View>
            <View style={styles.modalField}>
              <Text style={styles.modalLabel}>{selectedPricing?.tier3Range} ({"\u20B9"}/{selectedPricing?.unit})</Text>
              <TextInput style={styles.modalInput} value={editTier3} onChangeText={setEditTier3} keyboardType="numeric" placeholder="Tier 3 price" />
            </View>
            <Pressable onPress={savePricing} style={styles.modalSaveBtn}>
              <Text style={styles.modalSaveBtnText}>Save Pricing</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={buyerModalVisible} transparent animationType="slide" onRequestClose={() => setBuyerModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Business Buyer</Text>
              <Pressable onPress={() => setBuyerModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </Pressable>
            </View>
            <View style={styles.modalField}>
              <Text style={styles.modalLabel}>Business Name</Text>
              <TextInput style={styles.modalInput} value={newBuyerName} onChangeText={setNewBuyerName} placeholder="Enter business name" />
            </View>
            <View style={styles.modalField}>
              <Text style={styles.modalLabel}>Owner Name</Text>
              <TextInput style={styles.modalInput} value={newOwnerName} onChangeText={setNewOwnerName} placeholder="Enter owner name" />
            </View>
            <View style={styles.modalField}>
              <Text style={styles.modalLabel}>GST Number</Text>
              <TextInput style={styles.modalInput} value={newGst} onChangeText={setNewGst} placeholder="Enter GST number" />
            </View>
            <View style={styles.modalField}>
              <Text style={styles.modalLabel}>Business Type</Text>
              <TextInput style={styles.modalInput} value={newBuyerType} onChangeText={setNewBuyerType} placeholder="Restaurant, Retailer, Caterer..." />
            </View>
            <Pressable onPress={addBuyer} style={styles.modalSaveBtn}>
              <Text style={styles.modalSaveBtnText}>Add Buyer</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { paddingHorizontal: 20, paddingBottom: 20 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.12)", alignItems: "center", justifyContent: "center" },
  headerTitle: { fontFamily: "Poppins_700Bold", fontSize: 20, color: "#FFF" },
  headerSub: { fontFamily: "Poppins_400Regular", fontSize: 12, color: "rgba(255,255,255,0.6)", marginTop: 2 },
  headerIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: "rgba(255,107,0,0.15)", alignItems: "center", justifyContent: "center" },

  overviewCard: { marginHorizontal: 16, marginTop: -4, borderRadius: 18, padding: 20 },
  overviewTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 15, color: "#FFF", marginBottom: 14 },
  overviewGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  overviewItem: { width: "46%", backgroundColor: "rgba(255,255,255,0.18)", borderRadius: 12, padding: 12, alignItems: "center" },
  overviewValue: { fontFamily: "Poppins_700Bold", fontSize: 22, color: "#FFF" },
  overviewLabel: { fontFamily: "Poppins_400Regular", fontSize: 11, color: "rgba(255,255,255,0.8)", marginTop: 2, textAlign: "center" },

  section: { marginTop: 24, paddingHorizontal: 16 },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  sectionTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  sectionTitle: { fontFamily: "Poppins_700Bold", fontSize: 17, color: Colors.secondary },
  badge: { backgroundColor: Colors.primary, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { fontFamily: "Poppins_600SemiBold", fontSize: 12, color: "#FFF" },

  orderCard: { backgroundColor: "#FFF", borderRadius: 14, padding: 14, marginBottom: 10, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
  orderTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  orderId: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: Colors.primary },
  buyerName: { fontFamily: "Poppins_500Medium", fontSize: 14, color: Colors.secondary, marginTop: 2 },
  statusChip: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 3 },
  statusText: { fontFamily: "Poppins_600SemiBold", fontSize: 11 },
  orderItems: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary, marginTop: 8, lineHeight: 18 },
  orderMeta: { flexDirection: "row", gap: 16, marginTop: 10 },
  orderMetaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  orderMetaText: { fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textSecondary },
  orderBottom: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.borderLight },
  orderValue: { fontFamily: "Poppins_700Bold", fontSize: 18, color: Colors.secondary },
  paymentChip: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: Colors.info + "12", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  paymentText: { fontFamily: "Poppins_500Medium", fontSize: 11, color: Colors.info },

  pricingCard: { backgroundColor: "#FFF", borderRadius: 14, padding: 14, marginBottom: 10, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
  pricingHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  pricingProduct: { fontFamily: "Poppins_600SemiBold", fontSize: 15, color: Colors.secondary },
  pricingCategory: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary },
  editBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: Colors.primary + "12", alignItems: "center", justifyContent: "center" },
  tierRow: { flexDirection: "row", marginTop: 12, gap: 6 },
  tierItem: { flex: 1, backgroundColor: Colors.background, borderRadius: 8, padding: 8, alignItems: "center" },
  tierLabel: { fontFamily: "Poppins_400Regular", fontSize: 10, color: Colors.textSecondary, marginBottom: 4 },
  tierPrice: { fontFamily: "Poppins_700Bold", fontSize: 13, color: Colors.secondary },
  moqRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: Colors.borderLight },
  moqText: { fontFamily: "Poppins_500Medium", fontSize: 12, color: Colors.warning },

  addBtn: { width: 32, height: 32, borderRadius: 10, backgroundColor: Colors.primary, alignItems: "center", justifyContent: "center" },
  buyerCard: { backgroundColor: "#FFF", borderRadius: 14, padding: 14, marginBottom: 10, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
  buyerTop: { flexDirection: "row", alignItems: "flex-start" },
  buyerAvatar: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  buyerNameRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  buyerBusinessName: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: Colors.secondary },
  verifiedBadge: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: Colors.success + "18", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  verifiedText: { fontFamily: "Poppins_500Medium", fontSize: 10, color: Colors.success },
  buyerOwner: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  buyerGst: { fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textLight, marginTop: 1 },
  buyerStats: { flexDirection: "row", marginTop: 12, gap: 8 },
  buyerStatItem: { flex: 1, backgroundColor: Colors.background, borderRadius: 8, padding: 8, alignItems: "center" },
  buyerStatLabel: { fontFamily: "Poppins_400Regular", fontSize: 10, color: Colors.textSecondary },
  buyerStatValue: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: Colors.secondary, marginTop: 2 },
  buyerCreditRow: { flexDirection: "row", gap: 8, marginTop: 8 },
  creditItem: { flex: 1, backgroundColor: Colors.background, borderRadius: 8, padding: 8 },
  creditLabel: { fontFamily: "Poppins_400Regular", fontSize: 10, color: Colors.textSecondary },
  creditValue: { fontFamily: "Poppins_700Bold", fontSize: 14, color: Colors.secondary, marginTop: 2 },

  generateBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: Colors.primary, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
  generateBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 12, color: "#FFF" },
  invoiceCard: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "#FFF", borderRadius: 14, padding: 14, marginBottom: 10, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
  invoiceLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  invoiceIcon: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  invoiceNum: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: Colors.secondary },
  invoiceBuyer: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary, marginTop: 1 },
  invoiceDate: { fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textLight, marginTop: 1 },
  invoiceRight: { alignItems: "flex-end" },
  invoiceAmount: { fontFamily: "Poppins_700Bold", fontSize: 15, color: Colors.secondary },
  invoiceStatus: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2, marginTop: 4 },
  invoiceStatusText: { fontFamily: "Poppins_600SemiBold", fontSize: 10 },

  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalContent: { backgroundColor: "#FFF", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: "80%" },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  modalTitle: { fontFamily: "Poppins_700Bold", fontSize: 18, color: Colors.secondary },
  modalField: { marginBottom: 16 },
  modalLabel: { fontFamily: "Poppins_500Medium", fontSize: 13, color: Colors.textSecondary, marginBottom: 6 },
  modalInput: { fontFamily: "Poppins_400Regular", fontSize: 15, backgroundColor: Colors.background, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: Colors.border, color: Colors.text },
  modalSaveBtn: { backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 14, alignItems: "center", marginTop: 8 },
  modalSaveBtnText: { fontFamily: "Poppins_700Bold", fontSize: 16, color: "#FFF" },
});

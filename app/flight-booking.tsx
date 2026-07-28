import React, { useState, useMemo } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, Platform, Alert, TextInput, Modal,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useApp } from "@/lib/store";

type SeatClass = "first" | "business" | "economy";
type SeatStatus = "available" | "booked" | "selected";

interface FlightSeat {
  row: number;
  col: string;
  status: SeatStatus;
  seatClass: SeatClass;
}

const CLASS_CONFIG: Record<SeatClass, { label: string; rows: [number, number]; cols: string[]; color: string; multiplier: number; icon: string }> = {
  first: { label: "First Class", rows: [1, 2], cols: ["A", "B", "C", "D"], color: "#F59E0B", multiplier: 3.5, icon: "diamond-outline" },
  business: { label: "Business", rows: [3, 6], cols: ["A", "B", "C", "D", "E", "F"], color: "#8B5CF6", multiplier: 2.0, icon: "star-outline" },
  economy: { label: "Economy", rows: [7, 28], cols: ["A", "B", "C", "D", "E", "F"], color: "#3B82F6", multiplier: 1.0, icon: "people-outline" },
};

const BOOKED_PERCENTAGE = 0.35;

function generateSeats(productId: string): FlightSeat[] {
  const seats: FlightSeat[] = [];
  const rng = (seed: number) => {
    let x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
  };

  let seedBase = productId.split("").reduce((a, c) => a + c.charCodeAt(0), 0);

  (Object.keys(CLASS_CONFIG) as SeatClass[]).forEach((cls) => {
    const cfg = CLASS_CONFIG[cls];
    for (let row = cfg.rows[0]; row <= cfg.rows[1]; row++) {
      cfg.cols.forEach((col, colIdx) => {
        const seed = seedBase + row * 10 + colIdx;
        const isBooked = rng(seed) < BOOKED_PERCENTAGE;
        seats.push({ row, col, status: isBooked ? "booked" : "available", seatClass: cls });
      });
    }
  });
  return seats;
}

function getSeatClass(row: number): SeatClass {
  if (row <= 2) return "first";
  if (row <= 6) return "business";
  return "economy";
}

const COL_COLORS: Record<SeatClass, { bg: string; border: string; text: string }> = {
  first: { bg: "#FFFBEB", border: "#F59E0B", text: "#B45309" },
  business: { bg: "#F5F3FF", border: "#8B5CF6", text: "#6D28D9" },
  economy: { bg: "#EFF6FF", border: "#3B82F6", text: "#1D4ED8" },
};

const STATUS_COLORS: Record<SeatStatus, { bg: string; border: string; text: string }> = {
  available: { bg: "#FFF", border: "#D1D5DB", text: "#374151" },
  booked: { bg: "#F3F4F6", border: "#E5E7EB", text: "#9CA3AF" },
  selected: { bg: Colors.primary, border: Colors.primary, text: "#FFF" },
};

function Seat({ seat, onPress }: { seat: FlightSeat; onPress: () => void }) {
  const colors = seat.status === "selected"
    ? STATUS_COLORS.selected
    : seat.status === "booked"
    ? STATUS_COLORS.booked
    : COL_COLORS[seat.seatClass];

  return (
    <Pressable
      style={[styles.seat, { backgroundColor: colors.bg, borderColor: colors.border }]}
      onPress={() => { if (seat.status !== "booked") { try { Haptics.selectionAsync(); } catch {} onPress(); } }}
      disabled={seat.status === "booked"}
    >
      <Text style={[styles.seatColText, { color: colors.text }]}>{seat.col}</Text>
      <Text style={[styles.seatRowText, { color: colors.text }]}>{seat.row}</Text>
    </Pressable>
  );
}

export default function FlightBookingScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    productId: string; vendorId: string;
    productName?: string; productPrice?: string;
    productDesc?: string; productImage?: string; vendorName?: string;
  }>();
  const { addToCart, user } = useApp();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  const productId = params.productId;
  const vendorId = params.vendorId;
  const productName = params.productName || "Flight Route";
  const productPrice = parseInt(params.productPrice || "2500", 10) || 2500;
  const productDesc = params.productDesc || "";
  const vendorName = params.vendorName || "Airlines";

  const [selectedClass, setSelectedClass] = useState<SeatClass>("economy");
  const [seats, setSeats] = useState<FlightSeat[]>(() => generateSeats(productId || "flight"));
  const [selectedSeats, setSelectedSeats] = useState<string[]>([]);
  const [showPassengerModal, setShowPassengerModal] = useState(false);
  const [passengerName, setPassengerName] = useState(user?.name || "");
  const [passengerPhone, setPassengerPhone] = useState(user?.phone || "");

  const basePrice = productPrice;

  const classRows = useMemo(() => {
    const cfg = CLASS_CONFIG[selectedClass];
    const rows: FlightSeat[][] = [];
    for (let row = cfg.rows[0]; row <= cfg.rows[1]; row++) {
      rows.push(seats.filter((s) => s.row === row && s.seatClass === selectedClass));
    }
    return rows;
  }, [selectedClass, seats]);

  const pricePerSeat = Math.round(basePrice * CLASS_CONFIG[selectedClass].multiplier);
  const totalAmount = selectedSeats.length * pricePerSeat;

  const toggleSeat = (seat: FlightSeat) => {
    const seatId = `${seat.row}${seat.col}`;
    setSelectedSeats((prev) => {
      if (prev.includes(seatId)) {
        setSeats((s) => s.map((s2) => s2.row === seat.row && s2.col === seat.col ? { ...s2, status: "available" } : s2));
        return prev.filter((s) => s !== seatId);
      }
      if (prev.length >= 6) { Alert.alert("Limit", "Max 6 seats per booking"); return prev; }
      setSeats((s) => s.map((s2) => s2.row === seat.row && s2.col === seat.col ? { ...s2, status: "selected" } : s2));
      return [...prev, seatId];
    });
  };

  const handleProceed = () => {
    if (selectedSeats.length === 0) { Alert.alert("No Seat Selected", "Please select at least one seat"); return; }
    setShowPassengerModal(true);
  };

  const handleConfirm = () => {
    if (!passengerName.trim()) { Alert.alert("Name Required", "Please enter passenger name"); return; }
    setShowPassengerModal(false);

    const classLabel = CLASS_CONFIG[selectedClass].label;
    addToCart({
      product: {
        id: productId,
        name: `${productName} (${classLabel})`,
        price: pricePerSeat,
        description: productDesc,
        image: params.productImage || "",
        vendorId: vendorId,
        category: "Travel",
      } as any,
      quantity: selectedSeats.length,
      vendorId: vendorId,
      vendorName: vendorName,
    });
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
    router.push("/(customer)/cart" as any);
  };

  if (!productId || !vendorId) {
    return (
      <View style={[styles.container, { paddingTop: topInset + 20, alignItems: "center" }]}>
        <Ionicons name="airplane-outline" size={64} color={Colors.textLight} />
        <Text style={styles.errorText}>Flight not found</Text>
        <Pressable onPress={() => router.back()} style={styles.backPressable}>
          <Text style={styles.backPressableText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  const classCfg = CLASS_CONFIG[selectedClass];
  const selectedCount = selectedSeats.length;
  const seatsInClass = seats.filter((s) => s.seatClass === selectedClass);
  const availCount = seatsInClass.filter((s) => s.status === "available").length;

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: topInset + 8 }]}>
        <Pressable onPress={() => router.back()} style={styles.headerBack}>
          <Ionicons name="arrow-back" size={24} color="#FFF" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>{productName}</Text>
          <Text style={styles.headerSub}>{vendorName}</Text>
        </View>
        <Ionicons name="airplane" size={28} color="rgba(255,255,255,0.6)" />
      </View>

      <View style={styles.classTabs}>
        {(Object.keys(CLASS_CONFIG) as SeatClass[]).map((cls) => {
          const cfg = CLASS_CONFIG[cls];
          const isActive = selectedClass === cls;
          return (
            <Pressable
              key={cls}
              style={[styles.classTab, isActive && { backgroundColor: cfg.color }]}
              onPress={() => { setSelectedClass(cls); setSelectedSeats([]); setSeats(generateSeats(productId || "flight")); }}
            >
              <Ionicons name={cfg.icon as any} size={14} color={isActive ? "#FFF" : Colors.textSecondary} />
              <Text style={[styles.classTabLabel, isActive && { color: "#FFF" }]}>{cfg.label}</Text>
              <Text style={[styles.classTabPrice, isActive && { color: "rgba(255,255,255,0.85)" }]}>
                ₹{Math.round(basePrice * cfg.multiplier).toLocaleString()}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <ScrollView
        style={styles.seatScroll}
        contentContainerStyle={{ paddingBottom: 130 + bottomInset, paddingTop: 16 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.planeNose}>
          <MaterialCommunityIcons name="airplane" size={40} color={Colors.textLight} />
          <Text style={styles.planeNoseText}>Front of Aircraft</Text>
        </View>

        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: "#FFF", borderColor: "#D1D5DB", borderWidth: 1.5 }]} />
            <Text style={styles.legendText}>Available</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: Colors.primary }]} />
            <Text style={styles.legendText}>Selected</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: "#F3F4F6" }]} />
            <Text style={styles.legendText}>Booked</Text>
          </View>
          <View style={[styles.legendItem, { marginLeft: 8 }]}>
            <Ionicons name="information-circle-outline" size={14} color={Colors.textSecondary} />
            <Text style={styles.legendText}>{availCount} available</Text>
          </View>
        </View>

        <View style={styles.seatMapContainer}>
          <View style={styles.colHeaders}>
            {["A", "B", "C", "", "D", "E", "F"].map((col, i) => (
              <View key={i} style={col === "" ? styles.aisleGap : styles.colHeaderCell}>
                <Text style={styles.colHeaderText}>{col}</Text>
              </View>
            ))}
          </View>

          {classRows.map((row, rowIdx) => {
            const rowNum = classCfg.rows[0] + rowIdx;
            const left = row.filter((s) => ["A", "B", "C"].includes(s.col));
            const right = row.filter((s) => ["D", "E", "F"].includes(s.col));
            return (
              <View key={rowNum} style={styles.seatRow}>
                <Text style={styles.rowNum}>{rowNum}</Text>
                <View style={styles.seatGroup}>
                  {left.map((seat) => <Seat key={seat.col} seat={seat} onPress={() => toggleSeat(seat)} />)}
                </View>
                <View style={styles.aisle}>
                  <Text style={styles.aisleText}>{rowNum}</Text>
                </View>
                <View style={styles.seatGroup}>
                  {right.map((seat) => <Seat key={seat.col} seat={seat} onPress={() => toggleSeat(seat)} />)}
                </View>
              </View>
            );
          })}
        </View>

        <View style={styles.planeTail}>
          <MaterialCommunityIcons name="airplane-landing" size={32} color={Colors.textLight} />
          <Text style={styles.planeNoseText}>Rear of Aircraft</Text>
        </View>
      </ScrollView>

      <View style={[styles.bottomBar, { paddingBottom: bottomInset + 16 }]}>
        {selectedCount > 0 ? (
          <>
            <View>
              <Text style={styles.bottomLabel}>{selectedCount} seat{selectedCount > 1 ? "s" : ""} selected</Text>
              <Text style={styles.bottomSeats}>{selectedSeats.join(", ")}</Text>
            </View>
            <View style={styles.bottomRight}>
              <Text style={styles.bottomTotal}>₹{totalAmount.toLocaleString()}</Text>
              <Pressable style={styles.proceedBtn} onPress={handleProceed}>
                <Text style={styles.proceedBtnText}>Proceed</Text>
                <Ionicons name="arrow-forward" size={16} color="#FFF" />
              </Pressable>
            </View>
          </>
        ) : (
          <Text style={styles.bottomHint}>Tap a seat to select · {CLASS_CONFIG[selectedClass].label} ₹{pricePerSeat.toLocaleString()}/seat</Text>
        )}
      </View>

      <Modal visible={showPassengerModal} transparent animationType="slide" onRequestClose={() => setShowPassengerModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Passenger Details</Text>
            <View style={styles.ticketPreview}>
              <Ionicons name="airplane" size={18} color={Colors.primary} />
              <Text style={styles.ticketText}>{productName} · {CLASS_CONFIG[selectedClass].label}</Text>
            </View>
            <View style={styles.ticketSeats}>
              <Ionicons name="ticket-outline" size={14} color={Colors.textSecondary} />
              <Text style={styles.ticketSeatsText}>Seats: {selectedSeats.join(", ")}</Text>
            </View>
            <Text style={styles.fieldLabel}>Full Name *</Text>
            <TextInput style={styles.input} value={passengerName} onChangeText={setPassengerName} placeholder="Enter passenger name" placeholderTextColor={Colors.textLight} />
            <Text style={styles.fieldLabel}>Phone Number</Text>
            <TextInput style={styles.input} value={passengerPhone} onChangeText={setPassengerPhone} keyboardType="phone-pad" placeholder="10-digit mobile number" placeholderTextColor={Colors.textLight} />
            <View style={styles.totalPreview}>
              <Text style={styles.totalPreviewLabel}>Total Amount</Text>
              <Text style={styles.totalPreviewValue}>₹{totalAmount.toLocaleString()}</Text>
            </View>
            <View style={styles.modalBtns}>
              <Pressable style={styles.cancelBtn} onPress={() => setShowPassengerModal(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.confirmBtn} onPress={handleConfirm}>
                <Ionicons name="checkmark-circle" size={18} color="#FFF" />
                <Text style={styles.confirmBtnText}>Add to Cart</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const SEAT_SIZE = 40;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { backgroundColor: Colors.primary, paddingHorizontal: 16, paddingBottom: 14, flexDirection: "row", alignItems: "center", gap: 12 },
  headerBack: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  headerTitle: { fontFamily: "Poppins_700Bold", fontSize: 16, color: "#FFF" },
  headerSub: { fontFamily: "Poppins_400Regular", fontSize: 12, color: "rgba(255,255,255,0.8)" },
  classTabs: { flexDirection: "row", backgroundColor: "#FFF", gap: 0, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  classTab: { flex: 1, alignItems: "center", paddingVertical: 12, paddingHorizontal: 4, gap: 2 },
  classTabLabel: { fontFamily: "Poppins_600SemiBold", fontSize: 11, color: Colors.textSecondary },
  classTabPrice: { fontFamily: "Poppins_700Bold", fontSize: 12, color: Colors.text },
  seatScroll: { flex: 1 },
  planeNose: { alignItems: "center", paddingBottom: 16, opacity: 0.4 },
  planeNoseText: { fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textLight },
  planeTail: { alignItems: "center", paddingTop: 16, opacity: 0.4 },
  legend: { flexDirection: "row", alignItems: "center", gap: 12, justifyContent: "center", marginBottom: 16, flexWrap: "wrap" },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  legendDot: { width: 14, height: 14, borderRadius: 3 },
  legendText: { fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textSecondary },
  seatMapContainer: { alignItems: "center" },
  colHeaders: { flexDirection: "row", alignItems: "center", marginBottom: 4, paddingHorizontal: 24 },
  colHeaderCell: { width: SEAT_SIZE, alignItems: "center" },
  colHeaderText: { fontFamily: "Poppins_600SemiBold", fontSize: 12, color: Colors.textSecondary },
  aisleGap: { width: 28 },
  seatRow: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
  rowNum: { fontFamily: "Poppins_400Regular", fontSize: 10, color: Colors.textLight, width: 20, textAlign: "right", marginRight: 4 },
  seatGroup: { flexDirection: "row", gap: 4 },
  aisle: { width: 28, alignItems: "center" },
  aisleText: { fontFamily: "Poppins_400Regular", fontSize: 9, color: Colors.textLight },
  seat: { width: SEAT_SIZE, height: SEAT_SIZE, borderRadius: 8, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  seatColText: { fontFamily: "Poppins_700Bold", fontSize: 11, lineHeight: 14 },
  seatRowText: { fontFamily: "Poppins_400Regular", fontSize: 9, lineHeight: 12 },
  bottomBar: { backgroundColor: "#FFF", paddingHorizontal: 20, paddingTop: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: Colors.borderLight, shadowColor: "#000", shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 8 },
  bottomLabel: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: Colors.text },
  bottomSeats: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary },
  bottomHint: { fontFamily: "Poppins_400Regular", fontSize: 13, color: Colors.textSecondary, textAlign: "center", flex: 1 },
  bottomRight: { alignItems: "flex-end", gap: 6 },
  bottomTotal: { fontFamily: "Poppins_700Bold", fontSize: 18, color: Colors.primary },
  proceedBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: Colors.primary, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10 },
  proceedBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: "#FFF" },
  errorText: { fontFamily: "Poppins_600SemiBold", fontSize: 16, color: Colors.textSecondary, marginTop: 16 },
  backPressable: { marginTop: 12, backgroundColor: Colors.primary, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 },
  backPressableText: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: "#FFF" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalSheet: { backgroundColor: "#FFF", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 },
  modalHandle: { width: 40, height: 4, backgroundColor: Colors.borderLight, borderRadius: 2, alignSelf: "center", marginBottom: 16 },
  modalTitle: { fontFamily: "Poppins_700Bold", fontSize: 20, color: Colors.secondary, marginBottom: 12 },
  ticketPreview: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: Colors.primary + "12", borderRadius: 10, padding: 10, marginBottom: 8 },
  ticketText: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: Colors.primary },
  ticketSeats: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 14 },
  ticketSeatsText: { fontFamily: "Poppins_400Regular", fontSize: 13, color: Colors.textSecondary },
  fieldLabel: { fontFamily: "Poppins_500Medium", fontSize: 13, color: Colors.textSecondary, marginBottom: 6 },
  input: { backgroundColor: Colors.surfaceAlt, borderRadius: 12, padding: 13, fontFamily: "Poppins_400Regular", fontSize: 14, color: Colors.text, marginBottom: 14 },
  totalPreview: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: Colors.success + "12", borderRadius: 12, padding: 14, marginBottom: 16 },
  totalPreviewLabel: { fontFamily: "Poppins_500Medium", fontSize: 14, color: Colors.success },
  totalPreviewValue: { fontFamily: "Poppins_700Bold", fontSize: 20, color: Colors.success },
  modalBtns: { flexDirection: "row", gap: 12 },
  cancelBtn: { flex: 1, backgroundColor: Colors.surfaceAlt, borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  cancelBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 15, color: Colors.textSecondary },
  confirmBtn: { flex: 1, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8, backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 14 },
  confirmBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 15, color: "#FFF" },
});

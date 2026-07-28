import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  Alert,
  TextInput,
  Modal,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useApp } from "@/lib/store";
import { busRoutes, vendors } from "@/lib/data";

const SEAT_SIZE = 38;
const SEAT_GAP = 6;

type SeatStatus = "available" | "booked" | "selected" | "ladies";

function getSeatStatus(seatNum: number, bookedSeats: number[], selectedSeats: number[]): SeatStatus {
  if (selectedSeats.includes(seatNum)) return "selected";
  if (bookedSeats.includes(seatNum)) return "booked";
  if ([3, 4, 7, 8, 11, 12].includes(seatNum)) return "ladies";
  return "available";
}

function SeatIcon({ status, seatNum, onPress }: { status: SeatStatus; seatNum: number; onPress: () => void }) {
  const colors: Record<SeatStatus, { bg: string; border: string; text: string }> = {
    available: { bg: "#FFF", border: "#10B981", text: "#10B981" },
    booked: { bg: "#E5E7EB", border: "#9CA3AF", text: "#9CA3AF" },
    selected: { bg: Colors.primary, border: Colors.primary, text: "#FFF" },
    ladies: { bg: "#FFF0F5", border: "#EC4899", text: "#EC4899" },
  };
  const c = colors[status];
  const disabled = status === "booked";

  return (
    <Pressable
      onPress={() => {
        if (!disabled) {
          try { Haptics.selectionAsync(); } catch {}
          onPress();
        }
      }}
      style={[styles.seat, { backgroundColor: c.bg, borderColor: c.border }]}
      disabled={disabled}
    >
      <Text style={[styles.seatNum, { color: c.text }]}>{seatNum}</Text>
    </Pressable>
  );
}

function generateSeatLayout(totalSeats: number): number[][] {
  const rows: number[][] = [];
  let seatNum = 1;

  if (totalSeats <= 40) {
    while (seatNum <= totalSeats) {
      if (seatNum + 3 <= totalSeats) {
        rows.push([seatNum, seatNum + 1, 0, seatNum + 2, seatNum + 3]);
        seatNum += 4;
      } else {
        const remaining = [];
        while (seatNum <= totalSeats) {
          remaining.push(seatNum);
          seatNum++;
        }
        while (remaining.length < 5) remaining.splice(2, 0, 0);
        rows.push(remaining);
      }
    }
  } else {
    while (seatNum <= totalSeats) {
      if (seatNum + 4 <= totalSeats) {
        rows.push([seatNum, seatNum + 1, 0, seatNum + 2, seatNum + 3, seatNum + 4]);
        seatNum += 5;
      } else {
        const remaining = [];
        while (seatNum <= totalSeats) {
          remaining.push(seatNum);
          seatNum++;
        }
        while (remaining.length < 6) remaining.splice(2, 0, 0);
        rows.push(remaining);
      }
    }
  }
  return rows;
}

export default function BusBookingScreen() {
  const insets = useSafeAreaInsets();
  const { routeId } = useLocalSearchParams<{ routeId: string }>();
  const { user } = useApp();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  const route = busRoutes.find((r) => r.id === routeId);
  const vendor = vendors.find((v) => v.id === "v_travel_1");

  const [selectedSeats, setSelectedSeats] = useState<number[]>([]);
  const [passengerName, setPassengerName] = useState(user?.name || "");
  const [passengerPhone, setPassengerPhone] = useState(user?.phone || "");
  const [passengerAge, setPassengerAge] = useState("");
  const [gender, setGender] = useState<"M" | "F">("M");
  const [showPassengerModal, setShowPassengerModal] = useState(false);

  if (!route) {
    return (
      <View style={[styles.container, { paddingTop: topInset + 20 }]}>
        <Text style={styles.errorText}>Route not found</Text>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  const toggleSeat = (seatNum: number) => {
    if (route.bookedSeats.includes(seatNum)) return;
    setSelectedSeats((prev) => {
      if (prev.includes(seatNum)) return prev.filter((s) => s !== seatNum);
      if (prev.length >= 6) {
        Alert.alert("Limit Reached", "You can select up to 6 seats per booking");
        return prev;
      }
      return [...prev, seatNum].sort((a, b) => a - b);
    });
  };

  const totalAmount = selectedSeats.length * route.pricePerSeat;
  const seatLayout = generateSeatLayout(route.totalSeats);
  const availableCount = route.totalSeats - route.bookedSeats.length;

  const handleProceed = () => {
    if (selectedSeats.length === 0) {
      Alert.alert("No Seats", "Please select at least one seat to continue");
      return;
    }
    setShowPassengerModal(true);
  };

  const handleConfirmBooking = () => {
    if (!passengerName.trim()) {
      Alert.alert("Name Required", "Please enter passenger name");
      return;
    }
    if (!passengerPhone.trim() || passengerPhone.length < 10) {
      Alert.alert("Phone Required", "Please enter a valid phone number");
      return;
    }
    setShowPassengerModal(false);
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
    router.push({
      pathname: "/payment" as any,
      params: {
        amount: totalAmount.toString(),
        itemCount: selectedSeats.length.toString(),
        vendorName: vendor?.name || "Bharat Travels",
        address: `${route.from} → ${route.to}`,
        deliveryNote: `Passenger: ${passengerName} | Phone: ${passengerPhone} | Age: ${passengerAge} | Gender: ${gender} | Seats: ${selectedSeats.join(", ")}`,
        deliverySpeed: `Bus: ${route.busName} | ${route.departure} | ${route.duration} | ${route.busType}`,
        isService: "true",
      },
    });
  };

  const busTypeColor = route.busType.includes("AC") ? "#3B82F6" : "#F59E0B";

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: topInset + 8 }]}>
        <Pressable onPress={() => router.back()} style={styles.headerBack}>
          <Ionicons name="arrow-back" size={24} color={Colors.secondary} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Select Seats</Text>
          <Text style={styles.headerSub}>{route.from} → {route.to}</Text>
        </View>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 120 + bottomInset }} showsVerticalScrollIndicator={false}>
        <View style={styles.routeCard}>
          <View style={styles.routeRow}>
            <View style={styles.routePoint}>
              <View style={[styles.routeDot, { backgroundColor: Colors.primary }]} />
              <Text style={styles.routeCity}>{route.from}</Text>
              <Text style={styles.routeTime}>{route.departure}</Text>
            </View>
            <View style={styles.routeLine}>
              <View style={styles.routeLineBar} />
              <Text style={styles.routeDuration}>{route.duration}</Text>
              <View style={styles.routeLineBar} />
            </View>
            <View style={styles.routePoint}>
              <View style={[styles.routeDot, { backgroundColor: "#10B981" }]} />
              <Text style={styles.routeCity}>{route.to}</Text>
              <Text style={styles.routeTime}>{route.arrival}</Text>
            </View>
          </View>

          <View style={styles.busInfoRow}>
            <View style={[styles.busTypeBadge, { backgroundColor: busTypeColor + "15" }]}>
              <MaterialCommunityIcons name="bus" size={16} color={busTypeColor} />
              <Text style={[styles.busTypeText, { color: busTypeColor }]}>{route.busType}</Text>
            </View>
            <Text style={styles.busName}>{route.busName}</Text>
          </View>

          <View style={styles.amenitiesRow}>
            {route.amenities.map((a) => (
              <View key={a} style={styles.amenityChip}>
                <Ionicons
                  name={
                    a === "AC" ? "snow" :
                    a === "WiFi" ? "wifi" :
                    a === "Charging Point" ? "battery-charging" :
                    a === "Blanket" ? "bed" :
                    a === "Pillow" ? "bed" :
                    a === "Water Bottle" ? "water" :
                    a === "Curtain" ? "eye-off" :
                    "checkmark-circle"
                  }
                  size={12}
                  color={Colors.textSecondary}
                />
                <Text style={styles.amenityText}>{a}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.stopsCard}>
          <Text style={styles.stopsTitle}>Route Stops</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.stopsRow}>
              {route.stops.map((stop, i) => (
                <View key={stop} style={styles.stopItem}>
                  <View style={[styles.stopDot, i === 0 && { backgroundColor: Colors.primary }, i === route.stops.length - 1 && { backgroundColor: "#10B981" }]} />
                  <Text style={styles.stopName}>{stop}</Text>
                  {i < route.stops.length - 1 && <View style={styles.stopLine} />}
                </View>
              ))}
            </View>
          </ScrollView>
        </View>

        <View style={styles.legendRow}>
          <View style={styles.legendItem}>
            <View style={[styles.legendBox, { backgroundColor: "#FFF", borderColor: "#10B981" }]} />
            <Text style={styles.legendText}>Available</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendBox, { backgroundColor: Colors.primary, borderColor: Colors.primary }]} />
            <Text style={styles.legendText}>Selected</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendBox, { backgroundColor: "#E5E7EB", borderColor: "#9CA3AF" }]} />
            <Text style={styles.legendText}>Booked</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendBox, { backgroundColor: "#FFF0F5", borderColor: "#EC4899" }]} />
            <Text style={styles.legendText}>Ladies</Text>
          </View>
        </View>

        <View style={styles.busLayout}>
          <View style={styles.busTop}>
            <MaterialCommunityIcons name="steering" size={24} color={Colors.textSecondary} />
            <Text style={styles.driverText}>Driver</Text>
            <View style={{ flex: 1 }} />
            <Text style={styles.availText}>{availableCount} seats available</Text>
          </View>

          <View style={styles.seatsContainer}>
            {seatLayout.map((row, rowIdx) => (
              <View key={rowIdx} style={styles.seatRow}>
                {row.map((seatNum, colIdx) =>
                  seatNum === 0 ? (
                    <View key={`gap-${colIdx}`} style={styles.seatGap} />
                  ) : (
                    <SeatIcon
                      key={seatNum}
                      seatNum={seatNum}
                      status={getSeatStatus(seatNum, route.bookedSeats, selectedSeats)}
                      onPress={() => toggleSeat(seatNum)}
                    />
                  )
                )}
              </View>
            ))}
          </View>
        </View>

        {selectedSeats.length > 0 && (
          <View style={styles.selectionSummary}>
            <Text style={styles.summaryTitle}>Selected Seats</Text>
            <View style={styles.selectedSeatsRow}>
              {selectedSeats.map((s) => (
                <View key={s} style={styles.selectedSeatChip}>
                  <Text style={styles.selectedSeatText}>Seat {s}</Text>
                  <Pressable onPress={() => toggleSeat(s)}>
                    <Ionicons name="close-circle" size={18} color={Colors.primary} />
                  </Pressable>
                </View>
              ))}
            </View>
            <View style={styles.priceBreakdown}>
              <View style={styles.priceRow}>
                <Text style={styles.priceLabel}>{selectedSeats.length} seat(s) × ₹{route.pricePerSeat}</Text>
                <Text style={styles.priceValue}>₹{totalAmount}</Text>
              </View>
              <View style={styles.priceRow}>
                <Text style={styles.priceLabel}>Service Fee</Text>
                <Text style={[styles.priceValue, { color: Colors.success }]}>FREE</Text>
              </View>
              <View style={[styles.priceRow, styles.totalPriceRow]}>
                <Text style={styles.totalLabel}>Total</Text>
                <Text style={styles.totalValue}>₹{totalAmount}</Text>
              </View>
            </View>
          </View>
        )}
      </ScrollView>

      <View style={[styles.bottomBar, { paddingBottom: Math.max(bottomInset, 16) }]}>
        <View>
          {selectedSeats.length > 0 ? (
            <>
              <Text style={styles.bottomPrice}>₹{totalAmount}</Text>
              <Text style={styles.bottomSeats}>{selectedSeats.length} seat(s) selected</Text>
            </>
          ) : (
            <Text style={styles.bottomHint}>Select seat(s) to continue</Text>
          )}
        </View>
        <Pressable
          style={[styles.proceedBtn, selectedSeats.length === 0 && styles.proceedBtnDisabled]}
          onPress={handleProceed}
          disabled={selectedSeats.length === 0}
        >
          <Text style={styles.proceedText}>Continue</Text>
          <Ionicons name="arrow-forward" size={20} color="#FFF" />
        </Pressable>
      </View>

      <Modal visible={showPassengerModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={() => setShowPassengerModal(false)} />
          <View style={[styles.modalContent, { paddingBottom: Math.max(bottomInset, 20) }]}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Passenger Details</Text>
            <Text style={styles.modalSub}>{route.from} → {route.to} | {route.busName} | Seats: {selectedSeats.join(", ")}</Text>

            <Text style={styles.fieldLabel}>Full Name *</Text>
            <TextInput
              style={styles.fieldInput}
              placeholder="Enter passenger name"
              placeholderTextColor={Colors.textLight}
              value={passengerName}
              onChangeText={setPassengerName}
            />

            <Text style={styles.fieldLabel}>Phone Number *</Text>
            <TextInput
              style={styles.fieldInput}
              placeholder="Enter 10-digit phone"
              placeholderTextColor={Colors.textLight}
              value={passengerPhone}
              onChangeText={setPassengerPhone}
              keyboardType="phone-pad"
              maxLength={10}
            />

            <View style={styles.rowFields}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Age</Text>
                <TextInput
                  style={styles.fieldInput}
                  placeholder="Age"
                  placeholderTextColor={Colors.textLight}
                  value={passengerAge}
                  onChangeText={setPassengerAge}
                  keyboardType="number-pad"
                  maxLength={3}
                />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.fieldLabel}>Gender</Text>
                <View style={styles.genderRow}>
                  <Pressable style={[styles.genderBtn, gender === "M" && styles.genderBtnActive]} onPress={() => setGender("M")}>
                    <Text style={[styles.genderText, gender === "M" && styles.genderTextActive]}>Male</Text>
                  </Pressable>
                  <Pressable style={[styles.genderBtn, gender === "F" && styles.genderBtnActive]} onPress={() => setGender("F")}>
                    <Text style={[styles.genderText, gender === "F" && styles.genderTextActive]}>Female</Text>
                  </Pressable>
                </View>
              </View>
            </View>

            <View style={styles.modalPriceRow}>
              <Text style={styles.modalPriceLabel}>Total Amount</Text>
              <Text style={styles.modalPriceValue}>₹{totalAmount}</Text>
            </View>

            <Pressable style={styles.confirmBtn} onPress={handleConfirmBooking}>
              <MaterialCommunityIcons name="bus" size={20} color="#FFF" />
              <Text style={styles.confirmText}>Proceed to Payment</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  errorText: { fontFamily: "Poppins_600SemiBold", fontSize: 16, color: Colors.textSecondary, textAlign: "center", marginTop: 40 },
  backBtn: { alignSelf: "center", marginTop: 16, paddingHorizontal: 24, paddingVertical: 12, backgroundColor: Colors.primary, borderRadius: 10 },
  backBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: "#FFF" },
  header: { flexDirection: "row", alignItems: "center", backgroundColor: "#FFF", paddingHorizontal: 20, paddingBottom: 14, gap: 12 },
  headerBack: { width: 40, height: 40, borderRadius: 12, backgroundColor: Colors.background, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontFamily: "Poppins_700Bold", fontSize: 20, color: Colors.secondary },
  headerSub: { fontFamily: "Poppins_400Regular", fontSize: 13, color: Colors.textSecondary, marginTop: -2 },
  content: { flex: 1 },

  routeCard: { margin: 16, backgroundColor: "#FFF", borderRadius: 16, padding: 16, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 },
  routeRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  routePoint: { alignItems: "center", width: 90 },
  routeDot: { width: 12, height: 12, borderRadius: 6, marginBottom: 6 },
  routeCity: { fontFamily: "Poppins_700Bold", fontSize: 16, color: Colors.secondary },
  routeTime: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  routeLine: { flex: 1, flexDirection: "row", alignItems: "center", marginHorizontal: 8 },
  routeLineBar: { flex: 1, height: 2, backgroundColor: "#E5E7EB" },
  routeDuration: { fontFamily: "Poppins_600SemiBold", fontSize: 12, color: Colors.primary, marginHorizontal: 8 },
  busInfoRow: { flexDirection: "row", alignItems: "center", marginTop: 14, gap: 10 },
  busTypeBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  busTypeText: { fontFamily: "Poppins_600SemiBold", fontSize: 12 },
  busName: { fontFamily: "Poppins_500Medium", fontSize: 14, color: Colors.secondary },
  amenitiesRow: { flexDirection: "row", flexWrap: "wrap", marginTop: 10, gap: 6 },
  amenityChip: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: Colors.background, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  amenityText: { fontFamily: "Poppins_400Regular", fontSize: 10, color: Colors.textSecondary },

  stopsCard: { marginHorizontal: 16, backgroundColor: "#FFF", borderRadius: 14, padding: 14, marginBottom: 12 },
  stopsTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: Colors.secondary, marginBottom: 10 },
  stopsRow: { flexDirection: "row", alignItems: "center" },
  stopItem: { flexDirection: "row", alignItems: "center" },
  stopDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.textLight },
  stopName: { fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.secondary, marginLeft: 4 },
  stopLine: { width: 20, height: 2, backgroundColor: "#E5E7EB", marginHorizontal: 4 },

  legendRow: { flexDirection: "row", justifyContent: "center", gap: 16, marginBottom: 12, marginHorizontal: 16 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendBox: { width: 18, height: 18, borderRadius: 4, borderWidth: 1.5 },
  legendText: { fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textSecondary },

  busLayout: { marginHorizontal: 16, backgroundColor: "#FFF", borderRadius: 16, padding: 16, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 },
  busTop: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: "#F3F4F6" },
  driverText: { fontFamily: "Poppins_500Medium", fontSize: 13, color: Colors.textSecondary },
  availText: { fontFamily: "Poppins_600SemiBold", fontSize: 12, color: Colors.success },
  seatsContainer: { alignItems: "center" },
  seatRow: { flexDirection: "row", marginBottom: SEAT_GAP, gap: SEAT_GAP },
  seat: { width: SEAT_SIZE, height: SEAT_SIZE, borderRadius: 8, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  seatNum: { fontFamily: "Poppins_600SemiBold", fontSize: 11 },
  seatGap: { width: SEAT_SIZE * 0.6 },

  selectionSummary: { margin: 16, backgroundColor: "#FFF", borderRadius: 16, padding: 16 },
  summaryTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 15, color: Colors.secondary, marginBottom: 10 },
  selectedSeatsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 },
  selectedSeatChip: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: Colors.primary + "12", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
  selectedSeatText: { fontFamily: "Poppins_500Medium", fontSize: 13, color: Colors.primary },
  priceBreakdown: { borderTopWidth: 1, borderTopColor: "#F3F4F6", paddingTop: 12 },
  priceRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  priceLabel: { fontFamily: "Poppins_400Regular", fontSize: 13, color: Colors.textSecondary },
  priceValue: { fontFamily: "Poppins_500Medium", fontSize: 13, color: Colors.secondary },
  totalPriceRow: { marginTop: 6, paddingTop: 8, borderTopWidth: 1, borderTopColor: "#F3F4F6" },
  totalLabel: { fontFamily: "Poppins_700Bold", fontSize: 16, color: Colors.secondary },
  totalValue: { fontFamily: "Poppins_700Bold", fontSize: 18, color: Colors.primary },

  bottomBar: { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: "#FFF", flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 14, borderTopWidth: 1, borderTopColor: "#F3F4F6", shadowColor: "#000", shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 5 },
  bottomPrice: { fontFamily: "Poppins_700Bold", fontSize: 20, color: Colors.secondary },
  bottomSeats: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary },
  bottomHint: { fontFamily: "Poppins_400Regular", fontSize: 14, color: Colors.textLight },
  proceedBtn: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: Colors.primary, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 14 },
  proceedBtnDisabled: { opacity: 0.4 },
  proceedText: { fontFamily: "Poppins_700Bold", fontSize: 15, color: "#FFF" },

  modalOverlay: { flex: 1, justifyContent: "flex-end" },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.5)" },
  modalContent: { backgroundColor: "#FFF", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "#E5E7EB", alignSelf: "center", marginBottom: 16 },
  modalTitle: { fontFamily: "Poppins_700Bold", fontSize: 20, color: Colors.secondary },
  modalSub: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary, marginTop: 4, marginBottom: 20 },
  fieldLabel: { fontFamily: "Poppins_500Medium", fontSize: 13, color: Colors.secondary, marginBottom: 6, marginTop: 12 },
  fieldInput: { fontFamily: "Poppins_400Regular", fontSize: 14, color: Colors.secondary, backgroundColor: Colors.background, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: "#E5E7EB" },
  rowFields: { flexDirection: "row" },
  genderRow: { flexDirection: "row", gap: 8 },
  genderBtn: { flex: 1, alignItems: "center", paddingVertical: 12, borderRadius: 12, backgroundColor: Colors.background, borderWidth: 1, borderColor: "#E5E7EB" },
  genderBtnActive: { backgroundColor: Colors.primary + "15", borderColor: Colors.primary },
  genderText: { fontFamily: "Poppins_500Medium", fontSize: 13, color: Colors.textSecondary },
  genderTextActive: { color: Colors.primary },
  modalPriceRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 20, paddingTop: 16, borderTopWidth: 1, borderTopColor: "#F3F4F6" },
  modalPriceLabel: { fontFamily: "Poppins_600SemiBold", fontSize: 15, color: Colors.secondary },
  modalPriceValue: { fontFamily: "Poppins_700Bold", fontSize: 22, color: Colors.primary },
  confirmBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: Colors.primary, paddingVertical: 16, borderRadius: 14, marginTop: 16 },
  confirmText: { fontFamily: "Poppins_700Bold", fontSize: 16, color: "#FFF" },
});

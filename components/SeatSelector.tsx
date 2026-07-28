import React, { useState, useMemo } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { SeatInfo, FlightSeatStatus } from "@/lib/types";

interface SeatSelectorProps {
  type: "flight" | "train";
  productId: string;
  onSeatSelect: (seat: SeatInfo | null) => void;
  selectedSeat: SeatInfo | null;
  bookedSeats?: string[];
}

function generateFlightSeats(bookedSeats: string[]): SeatInfo[] {
  const cols = ["A", "B", "C", "D", "E", "F"];
  const rows = 15;
  const seats: SeatInfo[] = [];
  for (let r = 1; r <= rows; r++) {
    for (const c of cols) {
      const label = `${r}${c}`;
      const isBooked = bookedSeats.includes(label);
      const isExit = r === 6 || r === 12;
      const seatClass = r <= 3 ? "Business" : "Economy";
      const basePrice = r <= 3 ? 500 : (c === "A" || c === "F") ? 200 : 0;
      seats.push({
        id: label,
        label,
        status: isBooked ? "booked" : "available",
        price: basePrice,
        class: seatClass,
      });
    }
  }
  return seats;
}

function generateTrainSeats(bookedSeats: string[]): SeatInfo[] {
  const seats: SeatInfo[] = [];
  const coaches = 3;
  for (let coach = 1; coach <= coaches; coach++) {
    const berthsPerCoach = 8;
    for (let b = 1; b <= berthsPerCoach; b++) {
      const seatNum = (coach - 1) * berthsPerCoach + b;
      const berthType = b <= 2 ? "LB" : b <= 4 ? "MB" : b <= 6 ? "UB" : b === 7 ? "SL" : "SU";
      const label = `S${coach}-${seatNum}`;
      const isBooked = bookedSeats.includes(label);
      const price = berthType === "LB" ? 100 : berthType === "SL" ? 80 : berthType === "MB" ? 50 : 0;
      seats.push({
        id: label,
        label,
        status: isBooked ? "booked" : "available",
        price,
        berthType: berthType as any,
      });
    }
  }
  return seats;
}

const BERTH_LABELS: Record<string, string> = {
  LB: "Lower Berth",
  MB: "Middle Berth",
  UB: "Upper Berth",
  SL: "Side Lower",
  SU: "Side Upper",
};

const BERTH_COLORS: Record<string, string> = {
  LB: "#22C55E",
  MB: "#3B82F6",
  UB: "#8B5CF6",
  SL: "#F59E0B",
  SU: "#EC4899",
};

export default function SeatSelector({ type, productId, onSeatSelect, selectedSeat, bookedSeats = [] }: SeatSelectorProps) {
  const defaultBooked = useMemo(() => {
    if (bookedSeats.length > 0) return bookedSeats;
    const hash = productId.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
    const booked: string[] = [];
    if (type === "flight") {
      const cols = ["A", "B", "C", "D", "E", "F"];
      for (let i = 0; i < 12; i++) {
        const r = ((hash * (i + 1) * 7) % 15) + 1;
        const c = cols[(hash * (i + 3)) % 6];
        booked.push(`${r}${c}`);
      }
    } else {
      for (let i = 0; i < 6; i++) {
        const coach = (hash * (i + 1)) % 3 + 1;
        const seat = (coach - 1) * 8 + ((hash * (i + 2)) % 8) + 1;
        booked.push(`S${coach}-${seat}`);
      }
    }
    return booked;
  }, [type, productId, bookedSeats]);

  const seats = useMemo(() =>
    type === "flight" ? generateFlightSeats(defaultBooked) : generateTrainSeats(defaultBooked),
    [type, defaultBooked]
  );

  const handleSelect = (seat: SeatInfo) => {
    if (seat.status === "booked") return;
    try { Haptics.selectionAsync(); } catch {}
    if (selectedSeat?.id === seat.id) {
      onSeatSelect(null);
    } else {
      onSeatSelect(seat);
    }
  };

  if (type === "flight") {
    return <FlightSeatMap seats={seats} selectedSeat={selectedSeat} onSelect={handleSelect} />;
  }
  return <TrainSeatMap seats={seats} selectedSeat={selectedSeat} onSelect={handleSelect} />;
}

function FlightSeatMap({ seats, selectedSeat, onSelect }: { seats: SeatInfo[]; selectedSeat: SeatInfo | null; onSelect: (s: SeatInfo) => void }) {
  const cols = ["A", "B", "C", "D", "E", "F"];
  const rows = 15;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Ionicons name="airplane" size={20} color={Colors.primary} />
        <Text style={styles.headerTitle}>Select Your Seat</Text>
      </View>

      <View style={styles.legendRow}>
        <View style={styles.legendItem}>
          <View style={[styles.legendBox, { backgroundColor: "#E2E8F0" }]} />
          <Text style={styles.legendText}>Available</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendBox, { backgroundColor: Colors.primary }]} />
          <Text style={styles.legendText}>Selected</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendBox, { backgroundColor: "#CBD5E1" }]} />
          <Text style={styles.legendText}>Booked</Text>
        </View>
      </View>

      <ScrollView style={styles.seatScroll} showsVerticalScrollIndicator={false}>
        <View style={styles.planeNose}>
          <Ionicons name="airplane" size={28} color={Colors.primary + "40"} />
        </View>

        <View style={styles.colHeaders}>
          {cols.map((c, i) => (
            <React.Fragment key={c}>
              <Text style={styles.colLabel}>{c}</Text>
              {i === 2 && <View style={styles.aisleSpace} />}
            </React.Fragment>
          ))}
        </View>

        {Array.from({ length: rows }, (_, r) => r + 1).map((row) => {
          const isExit = row === 6 || row === 12;
          const isBusiness = row <= 3;
          return (
            <View key={row}>
              {isExit && (
                <View style={styles.exitRow}>
                  <Ionicons name="exit-outline" size={12} color="#10B981" />
                  <Text style={styles.exitText}>EXIT</Text>
                  <View style={styles.exitLine} />
                  <Text style={styles.exitText}>EXIT</Text>
                  <Ionicons name="exit-outline" size={12} color="#10B981" />
                </View>
              )}
              {isBusiness && row === 1 && (
                <Text style={styles.classLabel}>Business Class</Text>
              )}
              {row === 4 && (
                <Text style={styles.classLabel}>Economy Class</Text>
              )}
              <View style={styles.seatRow}>
                <Text style={styles.rowNum}>{row}</Text>
                {cols.map((c, i) => {
                  const seat = seats.find((s) => s.label === `${row}${c}`);
                  if (!seat) return null;
                  const isSelected = selectedSeat?.id === seat.id;
                  const isBooked = seat.status === "booked";
                  return (
                    <React.Fragment key={c}>
                      <Pressable
                        style={[
                          styles.flightSeat,
                          isBusiness && styles.businessSeat,
                          isBooked && styles.bookedSeat,
                          isSelected && styles.selectedSeat,
                          (c === "A" || c === "F") && !isBooked && !isSelected && styles.windowSeat,
                        ]}
                        onPress={() => onSelect(seat)}
                        disabled={isBooked}
                      >
                        <Text style={[
                          styles.seatText,
                          isBooked && styles.bookedSeatText,
                          isSelected && styles.selectedSeatText,
                        ]}>
                          {isBooked ? "X" : c}
                        </Text>
                      </Pressable>
                      {i === 2 && <View style={styles.aisleSpace} />}
                    </React.Fragment>
                  );
                })}
                <Text style={styles.rowNum}>{row}</Text>
              </View>
            </View>
          );
        })}
      </ScrollView>

      {selectedSeat && (
        <View style={styles.selectedInfo}>
          <View style={styles.selectedInfoLeft}>
            <Ionicons name="checkmark-circle" size={18} color={Colors.primary} />
            <Text style={styles.selectedInfoText}>
              Seat {selectedSeat.label} ({selectedSeat.class})
            </Text>
          </View>
          {(selectedSeat.price || 0) > 0 && (
            <Text style={styles.selectedInfoPrice}>+₹{selectedSeat.price}</Text>
          )}
        </View>
      )}
    </View>
  );
}

function TrainSeatMap({ seats, selectedSeat, onSelect }: { seats: SeatInfo[]; selectedSeat: SeatInfo | null; onSelect: (s: SeatInfo) => void }) {
  const coaches = [1, 2, 3];
  const [activeCoach, setActiveCoach] = useState(1);

  const coachSeats = seats.filter((s) => s.label.startsWith(`S${activeCoach}-`));

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Ionicons name="train" size={20} color={Colors.primary} />
        <Text style={styles.headerTitle}>Select Your Berth</Text>
      </View>

      <View style={styles.coachTabs}>
        {coaches.map((c) => (
          <Pressable
            key={c}
            style={[styles.coachTab, activeCoach === c && styles.coachTabActive]}
            onPress={() => setActiveCoach(c)}
          >
            <Text style={[styles.coachTabText, activeCoach === c && styles.coachTabTextActive]}>
              S{c}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.legendRow}>
        {Object.entries(BERTH_LABELS).map(([key, label]) => (
          <View key={key} style={styles.legendItem}>
            <View style={[styles.legendBox, { backgroundColor: BERTH_COLORS[key] + "30" }]} />
            <Text style={styles.legendText}>{key}</Text>
          </View>
        ))}
      </View>

      <ScrollView style={styles.seatScroll} showsVerticalScrollIndicator={false}>
        <View style={styles.trainCoach}>
          <View style={styles.trainCoachHeader}>
            <Ionicons name="train-outline" size={16} color={Colors.primary} />
            <Text style={styles.trainCoachLabel}>Coach S{activeCoach}</Text>
          </View>

          {[0, 1, 2, 3].map((berthGroup) => {
            const startIdx = berthGroup * 2;
            const groupSeats = coachSeats.slice(startIdx, startIdx + 2);
            if (groupSeats.length === 0) return null;

            const isside = berthGroup >= 3;
            return (
              <View key={berthGroup} style={styles.berthGroup}>
                {isside && <View style={styles.berthDivider} />}
                {groupSeats.map((seat) => {
                  const isSelected = selectedSeat?.id === seat.id;
                  const isBooked = seat.status === "booked";
                  const berthColor = BERTH_COLORS[seat.berthType || "LB"];
                  return (
                    <Pressable
                      key={seat.id}
                      style={[
                        styles.trainBerth,
                        { borderLeftColor: berthColor, borderLeftWidth: 4 },
                        isBooked && styles.bookedBerth,
                        isSelected && styles.selectedBerth,
                      ]}
                      onPress={() => onSelect(seat)}
                      disabled={isBooked}
                    >
                      <View style={styles.berthLeft}>
                        <Text style={[styles.berthNum, isBooked && { color: "#94A3B8" }]}>
                          {seat.label.split("-")[1]}
                        </Text>
                        <View>
                          <Text style={[styles.berthTypeText, { color: berthColor }]}>
                            {BERTH_LABELS[seat.berthType || "LB"]}
                          </Text>
                          <Text style={styles.berthSeatId}>{seat.label}</Text>
                        </View>
                      </View>
                      <View style={styles.berthRight}>
                        {isBooked ? (
                          <View style={styles.bookedBadge}>
                            <Text style={styles.bookedBadgeText}>Booked</Text>
                          </View>
                        ) : isSelected ? (
                          <View style={styles.selectedBadge}>
                            <Ionicons name="checkmark-circle" size={20} color="#FFF" />
                          </View>
                        ) : (
                          <>
                            {(seat.price || 0) > 0 && (
                              <Text style={styles.berthPrice}>+₹{seat.price}</Text>
                            )}
                            <Ionicons name="radio-button-off" size={20} color="#CBD5E1" />
                          </>
                        )}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            );
          })}
        </View>
      </ScrollView>

      {selectedSeat && (
        <View style={styles.selectedInfo}>
          <View style={styles.selectedInfoLeft}>
            <Ionicons name="checkmark-circle" size={18} color={Colors.primary} />
            <Text style={styles.selectedInfoText}>
              {selectedSeat.label} - {BERTH_LABELS[selectedSeat.berthType || "LB"]}
            </Text>
          </View>
          {(selectedSeat.price || 0) > 0 && (
            <Text style={styles.selectedInfoPrice}>+₹{selectedSeat.price}</Text>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#FFF",
    borderRadius: 16,
    overflow: "hidden",
    marginTop: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  headerTitle: { fontFamily: "Poppins_700Bold", fontSize: 16, color: Colors.secondary },
  legendRow: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 8,
    flexWrap: "wrap",
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  legendBox: { width: 14, height: 14, borderRadius: 3 },
  legendText: { fontFamily: "Poppins_400Regular", fontSize: 10, color: Colors.textSecondary },
  seatScroll: { maxHeight: 350, paddingHorizontal: 8 },
  planeNose: { alignItems: "center", paddingVertical: 8 },
  colHeaders: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 24,
    marginBottom: 4,
  },
  colLabel: {
    width: 32, textAlign: "center",
    fontFamily: "Poppins_600SemiBold", fontSize: 11, color: Colors.textSecondary,
  },
  aisleSpace: { width: 20 },
  exitRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 4,
    marginVertical: 2,
  },
  exitText: { fontFamily: "Poppins_600SemiBold", fontSize: 9, color: "#10B981" },
  exitLine: { flex: 1, height: 1, backgroundColor: "#10B981" + "40" },
  classLabel: {
    fontFamily: "Poppins_600SemiBold", fontSize: 10,
    color: Colors.primary, textAlign: "center",
    paddingVertical: 4, marginTop: 4,
    backgroundColor: Colors.primary + "08", borderRadius: 4, marginHorizontal: 24,
  },
  seatRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 4,
    paddingVertical: 2,
    paddingHorizontal: 4,
  },
  rowNum: {
    width: 18, textAlign: "center",
    fontFamily: "Poppins_500Medium", fontSize: 10, color: Colors.textLight,
  },
  flightSeat: {
    width: 32, height: 30, borderRadius: 6,
    backgroundColor: "#E2E8F0",
    alignItems: "center", justifyContent: "center",
  },
  businessSeat: { backgroundColor: "#DBEAFE", height: 34 },
  windowSeat: { backgroundColor: "#E0F2FE" },
  bookedSeat: { backgroundColor: "#CBD5E1" },
  selectedSeat: { backgroundColor: Colors.primary },
  seatText: { fontFamily: "Poppins_600SemiBold", fontSize: 11, color: Colors.textSecondary },
  bookedSeatText: { color: "#94A3B8", fontSize: 10 },
  selectedSeatText: { color: "#FFF" },
  selectedInfo: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: Colors.primary + "08",
    borderTopWidth: 1,
    borderTopColor: Colors.primary + "20",
  },
  selectedInfoLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  selectedInfoText: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: Colors.secondary },
  selectedInfoPrice: { fontFamily: "Poppins_700Bold", fontSize: 14, color: Colors.primary },
  coachTabs: {
    flexDirection: "row",
    paddingHorizontal: 16,
    gap: 8,
    paddingBottom: 8,
  },
  coachTab: {
    paddingHorizontal: 20, paddingVertical: 8,
    borderRadius: 10, backgroundColor: "#F1F5F9",
  },
  coachTabActive: { backgroundColor: Colors.primary },
  coachTabText: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: Colors.textSecondary },
  coachTabTextActive: { color: "#FFF" },
  trainCoach: { paddingHorizontal: 8, paddingBottom: 12 },
  trainCoachHeader: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingVertical: 8, paddingHorizontal: 8,
  },
  trainCoachLabel: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: Colors.primary },
  berthGroup: { marginBottom: 8 },
  berthDivider: { height: 1, backgroundColor: "#E2E8F0", marginVertical: 8, marginHorizontal: 8 },
  trainBerth: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 6,
    marginHorizontal: 8,
  },
  bookedBerth: { opacity: 0.5 },
  selectedBerth: { backgroundColor: Colors.primary + "10", borderWidth: 1, borderColor: Colors.primary },
  berthLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  berthNum: {
    fontFamily: "Poppins_700Bold", fontSize: 18, color: Colors.secondary,
    width: 30, textAlign: "center",
  },
  berthTypeText: { fontFamily: "Poppins_600SemiBold", fontSize: 12 },
  berthSeatId: { fontFamily: "Poppins_400Regular", fontSize: 10, color: Colors.textLight },
  berthRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  berthPrice: { fontFamily: "Poppins_500Medium", fontSize: 11, color: Colors.primary },
  bookedBadge: {
    backgroundColor: "#CBD5E1", borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  bookedBadgeText: { fontFamily: "Poppins_500Medium", fontSize: 10, color: "#64748B" },
  selectedBadge: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: Colors.primary,
    alignItems: "center", justifyContent: "center",
  },
});

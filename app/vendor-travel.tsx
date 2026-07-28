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
  Switch,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useApp } from "@/lib/store";

interface BusRoute {
  id: string;
  name: string;
  departure: string;
  arrival: string;
  busType: string;
  fare: number;
  isActive: boolean;
}

interface SeatData {
  id: number;
  status: "available" | "booked" | "selected" | "blocked";
}

interface Booking {
  id: string;
  passengerName: string;
  phone: string;
  route: string;
  seatNumbers: string;
  bookingStatus: "Confirmed" | "Pending" | "Cancelled";
  paymentStatus: "Paid" | "Pending";
  amount: number;
}

const INITIAL_ROUTES: BusRoute[] = [
  { id: "r1", name: "Malegaon \u2192 Mumbai", departure: "06:00 AM", arrival: "11:30 AM", busType: "AC Sleeper", fare: 850, isActive: true },
  { id: "r2", name: "Malegaon \u2192 Pune", departure: "07:30 AM", arrival: "01:00 PM", busType: "Non-AC Seater", fare: 550, isActive: true },
  { id: "r3", name: "Malegaon \u2192 Nashik", departure: "08:00 AM", arrival: "10:30 AM", busType: "AC Semi-Sleeper", fare: 350, isActive: true },
  { id: "r4", name: "Malegaon \u2192 Aurangabad", departure: "09:00 AM", arrival: "01:30 PM", busType: "Non-AC Seater", fare: 450, isActive: false },
  { id: "r5", name: "Malegaon \u2192 Shirdi", departure: "05:30 AM", arrival: "08:00 AM", busType: "AC Semi-Sleeper", fare: 300, isActive: true },
];

const INITIAL_SEATS: SeatData[] = Array.from({ length: 30 }, (_, i) => ({
  id: i + 1,
  status: i < 8 ? "booked" : i >= 8 && i < 10 ? "blocked" : "available",
}));

const INITIAL_BOOKINGS: Booking[] = [
  { id: "BK001", passengerName: "Rajesh Patil", phone: "9876543210", route: "Malegaon \u2192 Mumbai", seatNumbers: "A1, A2", bookingStatus: "Confirmed", paymentStatus: "Paid", amount: 1700 },
  { id: "BK002", passengerName: "Priya Sharma", phone: "9876543211", route: "Malegaon \u2192 Pune", seatNumbers: "B3", bookingStatus: "Confirmed", paymentStatus: "Paid", amount: 550 },
  { id: "BK003", passengerName: "Amit Deshmukh", phone: "9876543212", route: "Malegaon \u2192 Mumbai", seatNumbers: "C1, C2, C3", bookingStatus: "Pending", paymentStatus: "Pending", amount: 2550 },
  { id: "BK004", passengerName: "Sneha Joshi", phone: "9876543213", route: "Malegaon \u2192 Nashik", seatNumbers: "A4", bookingStatus: "Confirmed", paymentStatus: "Paid", amount: 350 },
  { id: "BK005", passengerName: "Vikram Singh", phone: "9876543214", route: "Malegaon \u2192 Shirdi", seatNumbers: "B1, B2", bookingStatus: "Cancelled", paymentStatus: "Pending", amount: 600 },
  { id: "BK006", passengerName: "Anita Kulkarni", phone: "9876543215", route: "Malegaon \u2192 Mumbai", seatNumbers: "D2", bookingStatus: "Confirmed", paymentStatus: "Paid", amount: 850 },
];

const BUS_TYPES = ["AC Sleeper", "Non-AC Seater", "AC Semi-Sleeper"];

export default function VendorTravelScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useApp();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  const [routes, setRoutes] = useState<BusRoute[]>(INITIAL_ROUTES);
  const [seats, setSeats] = useState<SeatData[]>(INITIAL_SEATS);
  const [bookings] = useState<Booking[]>(INITIAL_BOOKINGS);
  const [showRouteModal, setShowRouteModal] = useState(false);
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);

  const [newRoute, setNewRoute] = useState({ name: "", departure: "", arrival: "", busType: "AC Sleeper", fare: "" });

  const toggleRouteStatus = (id: string) => {
    try { Haptics.selectionAsync(); } catch {}
    setRoutes((prev) => prev.map((r) => r.id === id ? { ...r, isActive: !r.isActive } : r));
  };

  const addRoute = () => {
    if (!newRoute.name || !newRoute.departure || !newRoute.arrival || !newRoute.fare) return;
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
    const route: BusRoute = {
      id: "r" + Date.now(),
      name: newRoute.name,
      departure: newRoute.departure,
      arrival: newRoute.arrival,
      busType: newRoute.busType,
      fare: parseFloat(newRoute.fare),
      isActive: true,
    };
    setRoutes((prev) => [...prev, route]);
    setNewRoute({ name: "", departure: "", arrival: "", busType: "AC Sleeper", fare: "" });
    setShowRouteModal(false);
  };

  const toggleSeat = (id: number) => {
    try { Haptics.selectionAsync(); } catch {}
    setSeats((prev) =>
      prev.map((s) => {
        if (s.id !== id || s.status === "booked") return s;
        return { ...s, status: s.status === "available" ? "blocked" : s.status === "blocked" ? "available" : s.status };
      })
    );
  };

  const openBookingDetail = (booking: Booking) => {
    try { Haptics.selectionAsync(); } catch {}
    setSelectedBooking(booking);
    setShowBookingModal(true);
  };

  const seatStats = {
    total: seats.length,
    available: seats.filter((s) => s.status === "available").length,
    booked: seats.filter((s) => s.status === "booked").length,
    blocked: seats.filter((s) => s.status === "blocked").length,
  };

  const confirmedBookings = bookings.filter((b) => b.bookingStatus === "Confirmed");
  const todayRevenue = confirmedBookings.reduce((sum, b) => sum + b.amount, 0);
  const occupancyRate = Math.round((seatStats.booked / seatStats.total) * 100);

  const getSeatColor = (status: string) => {
    switch (status) {
      case "available": return Colors.success;
      case "booked": return Colors.error;
      case "selected": return Colors.warning;
      case "blocked": return Colors.textLight;
      default: return Colors.border;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Confirmed": return Colors.success;
      case "Pending": return Colors.warning;
      case "Cancelled": return Colors.error;
      default: return Colors.textSecondary;
    }
  };

  const renderSeatGrid = () => {
    const rows: React.ReactNode[] = [];
    for (let i = 0; i < seats.length; i += 4) {
      const rowSeats = seats.slice(i, i + 4);
      rows.push(
        <View key={i} style={styles.seatRow}>
          {rowSeats.map((seat, idx) => (
            <React.Fragment key={seat.id}>
              {idx === 2 && <View style={styles.aisle} />}
              <Pressable
                style={[styles.seat, { backgroundColor: getSeatColor(seat.status) }]}
                onPress={() => toggleSeat(seat.id)}
              >
                <Text style={styles.seatText}>{seat.id}</Text>
              </Pressable>
            </React.Fragment>
          ))}
          {rowSeats.length < 4 &&
            Array.from({ length: 4 - rowSeats.length }).map((_, idx) => (
              <View key={`empty-${idx}`} style={styles.seatEmpty} />
            ))}
        </View>
      );
    }
    return rows;
  };

  return (
    <View style={[styles.container, { paddingBottom: bottomInset }]}>
      <LinearGradient colors={["#0B1E3D", "#142F5E"]} style={[styles.header, { paddingTop: topInset + 12 }]}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => { try { Haptics.selectionAsync(); } catch {} router.back(); }} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color="#FFF" />
          </Pressable>
          <Text style={styles.headerTitle}>Travel Management</Text>
          <View style={{ width: 44 }} />
        </View>
      </LinearGradient>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={styles.section}>
          <View style={styles.revenueBanner}>
            <LinearGradient colors={[Colors.primary, "#FF8A33"]} style={styles.revenueGradient}>
              <View style={styles.revenueGrid}>
                <View style={styles.revenueItem}>
                  <Ionicons name="ticket-outline" size={20} color="#FFF" />
                  <Text style={styles.revenueValue}>{confirmedBookings.length}</Text>
                  <Text style={styles.revenueLabel}>Today's Bookings</Text>
                </View>
                <View style={styles.revenueDivider} />
                <View style={styles.revenueItem}>
                  <Ionicons name="cash-outline" size={20} color="#FFF" />
                  <Text style={styles.revenueValue}>{"\u20B9"}{todayRevenue.toLocaleString()}</Text>
                  <Text style={styles.revenueLabel}>Today's Revenue</Text>
                </View>
                <View style={styles.revenueDivider} />
                <View style={styles.revenueItem}>
                  <Ionicons name="trending-up-outline" size={20} color="#FFF" />
                  <Text style={styles.revenueValue}>{"\u20B9"}1,24,500</Text>
                  <Text style={styles.revenueLabel}>Monthly Revenue</Text>
                </View>
                <View style={styles.revenueDivider} />
                <View style={styles.revenueItem}>
                  <Ionicons name="pie-chart-outline" size={20} color="#FFF" />
                  <Text style={styles.revenueValue}>{occupancyRate}%</Text>
                  <Text style={styles.revenueLabel}>Occupancy Rate</Text>
                </View>
              </View>
            </LinearGradient>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Route Management</Text>
            <Pressable
              style={styles.addBtn}
              onPress={() => { try { Haptics.selectionAsync(); } catch {} setShowRouteModal(true); }}
            >
              <Ionicons name="add-circle" size={18} color="#FFF" />
              <Text style={styles.addBtnText}>Add Route</Text>
            </Pressable>
          </View>

          {routes.map((route) => (
            <View key={route.id} style={styles.routeCard}>
              <View style={styles.routeTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.routeName}>{route.name}</Text>
                  <View style={styles.routeDetails}>
                    <View style={styles.routeTimeRow}>
                      <Ionicons name="time-outline" size={14} color={Colors.textSecondary} />
                      <Text style={styles.routeTime}>{route.departure} - {route.arrival}</Text>
                    </View>
                    <View style={styles.routeBadge}>
                      <Ionicons name="bus-outline" size={12} color={Colors.info} />
                      <Text style={styles.routeBadgeText}>{route.busType}</Text>
                    </View>
                  </View>
                </View>
                <View style={styles.routeRight}>
                  <Text style={styles.routeFare}>{"\u20B9"}{route.fare}</Text>
                  <Switch
                    value={route.isActive}
                    onValueChange={() => toggleRouteStatus(route.id)}
                    trackColor={{ false: Colors.border, true: Colors.success + "60" }}
                    thumbColor={route.isActive ? Colors.success : Colors.textLight}
                  />
                </View>
              </View>
              <View style={[styles.routeStatusBar, { backgroundColor: route.isActive ? Colors.success + "15" : Colors.error + "15" }]}>
                <View style={[styles.statusDot, { backgroundColor: route.isActive ? Colors.success : Colors.error }]} />
                <Text style={[styles.routeStatusText, { color: route.isActive ? Colors.success : Colors.error }]}>
                  {route.isActive ? "Active" : "Inactive"}
                </Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Seat Layout Manager</Text>
          <View style={styles.seatCard}>
            <View style={styles.seatLegend}>
              {[
                { label: "Available", color: Colors.success },
                { label: "Booked", color: Colors.error },
                { label: "Selected", color: Colors.warning },
                { label: "Blocked", color: Colors.textLight },
              ].map((item) => (
                <View key={item.label} style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: item.color }]} />
                  <Text style={styles.legendText}>{item.label}</Text>
                </View>
              ))}
            </View>

            <View style={styles.busContainer}>
              <View style={styles.busSteeringRow}>
                <Ionicons name="radio-button-on" size={20} color={Colors.secondary} />
                <Text style={styles.busLabel}>Front</Text>
              </View>
              <View style={styles.seatGrid}>{renderSeatGrid()}</View>
            </View>

            <View style={styles.seatStats}>
              <View style={styles.seatStatItem}>
                <Text style={styles.seatStatValue}>{seatStats.total}</Text>
                <Text style={styles.seatStatLabel}>Total</Text>
              </View>
              <View style={styles.seatStatItem}>
                <Text style={[styles.seatStatValue, { color: Colors.success }]}>{seatStats.available}</Text>
                <Text style={styles.seatStatLabel}>Available</Text>
              </View>
              <View style={styles.seatStatItem}>
                <Text style={[styles.seatStatValue, { color: Colors.error }]}>{seatStats.booked}</Text>
                <Text style={styles.seatStatLabel}>Booked</Text>
              </View>
              <View style={styles.seatStatItem}>
                <Text style={[styles.seatStatValue, { color: Colors.textLight }]}>{seatStats.blocked}</Text>
                <Text style={styles.seatStatLabel}>Blocked</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Today's Bookings</Text>
          {bookings.map((booking) => (
            <Pressable key={booking.id} style={styles.bookingCard} onPress={() => openBookingDetail(booking)}>
              <View style={styles.bookingTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.bookingName}>{booking.passengerName}</Text>
                  <Text style={styles.bookingPhone}>{booking.phone}</Text>
                </View>
                <View style={[styles.bookingStatusBadge, { backgroundColor: getStatusColor(booking.bookingStatus) + "15" }]}>
                  <Text style={[styles.bookingStatusText, { color: getStatusColor(booking.bookingStatus) }]}>
                    {booking.bookingStatus}
                  </Text>
                </View>
              </View>
              <View style={styles.bookingMid}>
                <View style={styles.bookingDetail}>
                  <Ionicons name="navigate-outline" size={14} color={Colors.textSecondary} />
                  <Text style={styles.bookingDetailText}>{booking.route}</Text>
                </View>
                <View style={styles.bookingDetail}>
                  <Ionicons name="grid-outline" size={14} color={Colors.textSecondary} />
                  <Text style={styles.bookingDetailText}>Seats: {booking.seatNumbers}</Text>
                </View>
              </View>
              <View style={styles.bookingBottom}>
                <View style={[styles.paymentBadge, { backgroundColor: booking.paymentStatus === "Paid" ? Colors.success + "15" : Colors.warning + "15" }]}>
                  <Ionicons
                    name={booking.paymentStatus === "Paid" ? "checkmark-circle" : "time"}
                    size={14}
                    color={booking.paymentStatus === "Paid" ? Colors.success : Colors.warning}
                  />
                  <Text style={[styles.paymentText, { color: booking.paymentStatus === "Paid" ? Colors.success : Colors.warning }]}>
                    {booking.paymentStatus}
                  </Text>
                </View>
                <Text style={styles.bookingAmount}>{"\u20B9"}{booking.amount}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      <Modal visible={showRouteModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingBottom: bottomInset + 20 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add New Route</Text>
              <Pressable onPress={() => setShowRouteModal(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </Pressable>
            </View>

            <Text style={styles.inputLabel}>Route Name</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Malegaon \u2192 Delhi"
              placeholderTextColor={Colors.textLight}
              value={newRoute.name}
              onChangeText={(t) => setNewRoute((p) => ({ ...p, name: t }))}
            />

            <View style={styles.inputRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.inputLabel}>Departure</Text>
                <TextInput
                  style={styles.input}
                  placeholder="06:00 AM"
                  placeholderTextColor={Colors.textLight}
                  value={newRoute.departure}
                  onChangeText={(t) => setNewRoute((p) => ({ ...p, departure: t }))}
                />
              </View>
              <View style={{ width: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.inputLabel}>Arrival</Text>
                <TextInput
                  style={styles.input}
                  placeholder="11:30 AM"
                  placeholderTextColor={Colors.textLight}
                  value={newRoute.arrival}
                  onChangeText={(t) => setNewRoute((p) => ({ ...p, arrival: t }))}
                />
              </View>
            </View>

            <Text style={styles.inputLabel}>Bus Type</Text>
            <View style={styles.busTypeRow}>
              {BUS_TYPES.map((type) => (
                <Pressable
                  key={type}
                  style={[styles.busTypeBtn, newRoute.busType === type && styles.busTypeBtnActive]}
                  onPress={() => setNewRoute((p) => ({ ...p, busType: type }))}
                >
                  <Text style={[styles.busTypeBtnText, newRoute.busType === type && styles.busTypeBtnTextActive]}>
                    {type}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.inputLabel}>Fare ({"\u20B9"})</Text>
            <TextInput
              style={styles.input}
              placeholder="850"
              placeholderTextColor={Colors.textLight}
              keyboardType="numeric"
              value={newRoute.fare}
              onChangeText={(t) => setNewRoute((p) => ({ ...p, fare: t }))}
            />

            <Pressable style={styles.submitBtn} onPress={addRoute}>
              <LinearGradient colors={[Colors.primary, "#FF8A33"]} style={styles.submitGradient}>
                <Text style={styles.submitBtnText}>Add Route</Text>
              </LinearGradient>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={showBookingModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingBottom: bottomInset + 20 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Booking Details</Text>
              <Pressable onPress={() => setShowBookingModal(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </Pressable>
            </View>

            {selectedBooking && (
              <View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Booking ID</Text>
                  <Text style={styles.detailValue}>#{selectedBooking.id}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Passenger</Text>
                  <Text style={styles.detailValue}>{selectedBooking.passengerName}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Phone</Text>
                  <Text style={styles.detailValue}>{selectedBooking.phone}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Route</Text>
                  <Text style={styles.detailValue}>{selectedBooking.route}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Seat Numbers</Text>
                  <Text style={styles.detailValue}>{selectedBooking.seatNumbers}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Booking Status</Text>
                  <View style={[styles.bookingStatusBadge, { backgroundColor: getStatusColor(selectedBooking.bookingStatus) + "15" }]}>
                    <Text style={[styles.bookingStatusText, { color: getStatusColor(selectedBooking.bookingStatus) }]}>
                      {selectedBooking.bookingStatus}
                    </Text>
                  </View>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Payment</Text>
                  <View style={[styles.paymentBadge, { backgroundColor: selectedBooking.paymentStatus === "Paid" ? Colors.success + "15" : Colors.warning + "15" }]}>
                    <Ionicons
                      name={selectedBooking.paymentStatus === "Paid" ? "checkmark-circle" : "time"}
                      size={14}
                      color={selectedBooking.paymentStatus === "Paid" ? Colors.success : Colors.warning}
                    />
                    <Text style={[styles.paymentText, { color: selectedBooking.paymentStatus === "Paid" ? Colors.success : Colors.warning }]}>
                      {selectedBooking.paymentStatus}
                    </Text>
                  </View>
                </View>
                <View style={[styles.detailRow, { borderBottomWidth: 0 }]}>
                  <Text style={styles.detailLabel}>Amount</Text>
                  <Text style={[styles.detailValue, { color: Colors.primary, fontFamily: "Poppins_700Bold", fontSize: 18 }]}>
                    {"\u20B9"}{selectedBooking.amount}
                  </Text>
                </View>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { paddingHorizontal: 20, paddingBottom: 20 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  backBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.12)", alignItems: "center", justifyContent: "center" },
  headerTitle: { fontFamily: "Poppins_700Bold", fontSize: 20, color: "#FFF" },
  section: { marginTop: 20, paddingHorizontal: 16 },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  sectionTitle: { fontFamily: "Poppins_700Bold", fontSize: 18, color: Colors.secondary, marginBottom: 14 },
  addBtn: { flexDirection: "row", alignItems: "center", backgroundColor: Colors.primary, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, gap: 6 },
  addBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: "#FFF" },

  revenueBanner: { borderRadius: 18, overflow: "hidden" },
  revenueGradient: { padding: 20 },
  revenueGrid: { flexDirection: "row", justifyContent: "space-between", flexWrap: "wrap" },
  revenueItem: { alignItems: "center", width: "23%" as any },
  revenueValue: { fontFamily: "Poppins_700Bold", fontSize: 16, color: "#FFF", marginTop: 6 },
  revenueLabel: { fontFamily: "Poppins_400Regular", fontSize: 10, color: "rgba(255,255,255,0.8)", textAlign: "center", marginTop: 2 },
  revenueDivider: { width: 1, backgroundColor: "rgba(255,255,255,0.25)", marginVertical: 4 },

  routeCard: { backgroundColor: "#FFF", borderRadius: 14, padding: 16, marginBottom: 10, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  routeTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  routeName: { fontFamily: "Poppins_600SemiBold", fontSize: 15, color: Colors.secondary },
  routeDetails: { flexDirection: "row", alignItems: "center", marginTop: 6, gap: 10, flexWrap: "wrap" },
  routeTimeRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  routeTime: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary },
  routeBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: Colors.info + "12", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  routeBadgeText: { fontFamily: "Poppins_500Medium", fontSize: 11, color: Colors.info },
  routeRight: { alignItems: "flex-end", gap: 8 },
  routeFare: { fontFamily: "Poppins_700Bold", fontSize: 18, color: Colors.primary },
  routeStatusBar: { flexDirection: "row", alignItems: "center", marginTop: 10, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, gap: 6 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  routeStatusText: { fontFamily: "Poppins_500Medium", fontSize: 12 },

  seatCard: { backgroundColor: "#FFF", borderRadius: 16, padding: 16, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  seatLegend: { flexDirection: "row", justifyContent: "space-around", marginBottom: 16 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendDot: { width: 12, height: 12, borderRadius: 3 },
  legendText: { fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textSecondary },
  busContainer: { backgroundColor: Colors.background, borderRadius: 12, padding: 12, alignItems: "center" },
  busSteeringRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 12 },
  busLabel: { fontFamily: "Poppins_500Medium", fontSize: 12, color: Colors.textSecondary },
  seatGrid: { width: "100%", alignItems: "center" },
  seatRow: { flexDirection: "row", justifyContent: "center", marginBottom: 6, gap: 6 },
  aisle: { width: 20 },
  seat: { width: 36, height: 36, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  seatText: { fontFamily: "Poppins_600SemiBold", fontSize: 11, color: "#FFF" },
  seatEmpty: { width: 36, height: 36 },
  seatStats: { flexDirection: "row", justifyContent: "space-around", marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: Colors.border },
  seatStatItem: { alignItems: "center" },
  seatStatValue: { fontFamily: "Poppins_700Bold", fontSize: 20, color: Colors.secondary },
  seatStatLabel: { fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textSecondary, marginTop: 2 },

  bookingCard: { backgroundColor: "#FFF", borderRadius: 14, padding: 14, marginBottom: 10, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 6, elevation: 1 },
  bookingTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  bookingName: { fontFamily: "Poppins_600SemiBold", fontSize: 15, color: Colors.secondary },
  bookingPhone: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  bookingStatusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  bookingStatusText: { fontFamily: "Poppins_600SemiBold", fontSize: 11 },
  bookingMid: { flexDirection: "row", gap: 16, marginTop: 10, flexWrap: "wrap" },
  bookingDetail: { flexDirection: "row", alignItems: "center", gap: 4 },
  bookingDetailText: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary },
  bookingBottom: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.borderLight },
  paymentBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  paymentText: { fontFamily: "Poppins_600SemiBold", fontSize: 11 },
  bookingAmount: { fontFamily: "Poppins_700Bold", fontSize: 17, color: Colors.primary },

  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalContent: { backgroundColor: "#FFF", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: "85%" },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  modalTitle: { fontFamily: "Poppins_700Bold", fontSize: 20, color: Colors.secondary },
  inputLabel: { fontFamily: "Poppins_500Medium", fontSize: 13, color: Colors.textSecondary, marginBottom: 6, marginTop: 12 },
  input: { backgroundColor: Colors.background, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontFamily: "Poppins_400Regular", fontSize: 14, color: Colors.text, borderWidth: 1, borderColor: Colors.border },
  inputRow: { flexDirection: "row" },
  busTypeRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  busTypeBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5, borderColor: Colors.border },
  busTypeBtnActive: { borderColor: Colors.primary, backgroundColor: Colors.primary + "12" },
  busTypeBtnText: { fontFamily: "Poppins_500Medium", fontSize: 12, color: Colors.textSecondary },
  busTypeBtnTextActive: { color: Colors.primary },
  submitBtn: { marginTop: 20, borderRadius: 14, overflow: "hidden" },
  submitGradient: { paddingVertical: 14, alignItems: "center" },
  submitBtnText: { fontFamily: "Poppins_700Bold", fontSize: 16, color: "#FFF" },

  detailRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  detailLabel: { fontFamily: "Poppins_500Medium", fontSize: 14, color: Colors.textSecondary },
  detailValue: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: Colors.secondary },
});

import React, { useState, useRef } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, Platform, Modal, FlatList, Alert,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useApp } from "@/lib/store";

const VEHICLE_ICONS: Record<string, string> = {
  auto: "rickshaw",
  rickshaw: "rickshaw",
  bike: "motorbike",
  taxi: "taxi",
  cab: "taxi",
  sedan: "car-side",
  suv: "car-estate",
  van: "van-utility",
  tempo: "bus-side",
  traveller: "bus-side",
  bus: "bus-side",
  truck: "truck",
  mini: "car-hatchback",
  hatchback: "car-hatchback",
};

function getVehicleIcon(name: string): string {
  const lower = name.toLowerCase();
  for (const key of Object.keys(VEHICLE_ICONS)) {
    if (lower.includes(key)) return VEHICLE_ICONS[key];
  }
  return "car-side";
}

const AC_OPTIONS = [
  { id: "ac", label: "AC", icon: "snowflake", surcharge: 0.15 },
  { id: "non-ac", label: "Non-AC", icon: "weather-sunny", surcharge: 0 },
];

const PASSENGER_OPTIONS = [1, 2, 3, 4, 5, 6, 7];

const LOCATION_OPTIONS = [
  { label: "Railway Station", icon: "train" },
  { label: "Bus Stand", icon: "bus" },
  { label: "Airport", icon: "airplane" },
  { label: "City Centre", icon: "business" },
  { label: "Hospital", icon: "medkit" },
  { label: "Market", icon: "cart" },
  { label: "Home", icon: "home" },
  { label: "Office", icon: "briefcase" },
  { label: "Temple / Mosque", icon: "sunny" },
  { label: "School / College", icon: "school" },
  { label: "Hotel", icon: "bed" },
  { label: "Malegaon", icon: "location" },
  { label: "Mumbai", icon: "location" },
  { label: "Pune", icon: "location" },
  { label: "Nashik", icon: "location" },
  { label: "Aurangabad", icon: "location" },
  { label: "Shirdi", icon: "location" },
  { label: "Dhule", icon: "location" },
];

export default function CabBookingScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    productId: string; vendorId: string; subCategory?: string;
    productName?: string; productPrice?: string;
    productDesc?: string; productImage?: string; vendorName?: string;
  }>();
  const { addToCart } = useApp();
  const scrollRef = useRef<ScrollView>(null);
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  const productId = params.productId;
  const vendorId = params.vendorId;
  const subCategory = params.subCategory;
  const productName = params.productName || "Vehicle";
  const productPrice = parseInt(params.productPrice || "500", 10) || 500;
  const productDesc = params.productDesc || "";
  const vendorName = params.vendorName || "Travel Service";

  const [pickup, setPickup] = useState("");
  const [destination, setDestination] = useState("");
  const [passengers, setPassengers] = useState(1);
  const [acOption, setAcOption] = useState<"ac" | "non-ac">("non-ac");
  const [pickupError, setPickupError] = useState(false);
  const [destinationError, setDestinationError] = useState(false);
  const [locationModal, setLocationModal] = useState<"pickup" | "destination" | null>(null);

  const isTempo = subCategory === "sc105" || productName.toLowerCase().includes("tempo") || productName.toLowerCase().includes("traveller");
  const vehicleIcon = getVehicleIcon(productName);
  const basePrice = productPrice;
  const acSurcharge = acOption === "ac" ? AC_OPTIONS[0].surcharge : 0;
  const passengerSurcharge = passengers > 4 ? 0.1 : 0;
  const totalAmount = Math.round(basePrice * (1 + acSurcharge + passengerSurcharge));

  const headerColor = isTempo ? "#059669" : "#FF6B00";
  const accrualLabel = isTempo ? "per trip" : "base fare";

  const handleBook = () => {
    const pErr = !pickup.trim();
    const dErr = !destination.trim();
    if (pErr || dErr) {
      setPickupError(pErr);
      setDestinationError(dErr);
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); } catch {}
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      const msg = pErr && dErr
        ? "Please select both pickup and destination locations before booking."
        : pErr
        ? "Please select a pickup location before booking."
        : "Please select a destination before booking.";
      Alert.alert("Location Required", msg, [{ text: "OK" }]);
      return;
    }
    setPickupError(false);
    setDestinationError(false);

    addToCart({
      product: {
        id: productId,
        name: `${productName} · ${acOption.toUpperCase()}`,
        price: totalAmount,
        description: `${pickup} → ${destination} | ${passengers} passenger${passengers > 1 ? "s" : ""}`,
        image: params.productImage || "",
        vendorId: vendorId,
        category: "Travel",
      } as any,
      quantity: 1,
      vendorId: vendorId,
      vendorName: vendorName,
    });
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
    router.push("/(customer)/cart" as any);
  };

  const selectLocation = (label: string) => {
    if (locationModal === "pickup") {
      setPickup(label);
      setPickupError(false);
    } else {
      setDestination(label);
      setDestinationError(false);
    }
    setLocationModal(null);
    try { Haptics.selectionAsync(); } catch {}
  };

  if (!productId || !vendorId) {
    return (
      <View style={[styles.container, { paddingTop: topInset + 20, alignItems: "center" }]}>
        <MaterialCommunityIcons name="car-off" size={64} color={Colors.textLight} />
        <Text style={styles.errorText}>Vehicle not found</Text>
        <Pressable onPress={() => router.back()} style={[styles.proceedBtn, { marginTop: 12 }]}>
          <Text style={styles.proceedBtnText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: topInset + 8, backgroundColor: headerColor }]}>
        <Pressable onPress={() => router.back()} style={styles.headerBack}>
          <Ionicons name="arrow-back" size={24} color="#FFF" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>{isTempo ? "Book Vehicle" : "Book Ride"}</Text>
          <Text style={styles.headerSub}>{vendorName}</Text>
        </View>
        <MaterialCommunityIcons name={vehicleIcon as any} size={32} color="rgba(255,255,255,0.5)" />
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={{ padding: 20, paddingBottom: 120 + bottomInset, gap: 16 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.vehicleCard, { borderLeftColor: headerColor }]}>
          <View style={[styles.vehicleIconWrap, { backgroundColor: headerColor + "18" }]}>
            <MaterialCommunityIcons name={vehicleIcon as any} size={48} color={headerColor} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.vehicleName}>{productName}</Text>
            <Text style={styles.vehicleDesc} numberOfLines={2}>{productDesc}</Text>
            <View style={styles.priceRow}>
              <Text style={styles.vehiclePrice}>₹{basePrice.toLocaleString()}</Text>
              <Text style={styles.priceLabel}>{accrualLabel}</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Trip Details</Text>
          <Text style={styles.fieldHint}>Tap to select locations</Text>

          <Pressable
            style={[styles.locationBtn, pickupError && styles.locationBtnError]}
            onPress={() => setLocationModal("pickup")}
          >
            <View style={[styles.routeDot, { backgroundColor: Colors.success }]} />
            <Text style={[styles.locationBtnText, !pickup && styles.locationBtnPlaceholder, pickupError && { color: Colors.error }]}>
              {pickup || "Tap to select pickup location"}
            </Text>
            <Ionicons name={pickup ? "checkmark-circle" : "chevron-down"} size={18} color={pickup ? Colors.success : (pickupError ? Colors.error : Colors.textLight)} />
          </Pressable>

          <View style={styles.routeConnector}>
            <View style={styles.routeConnectorLine} />
          </View>

          <Pressable
            style={[styles.locationBtn, destinationError && styles.locationBtnError]}
            onPress={() => setLocationModal("destination")}
          >
            <View style={[styles.routeDot, { backgroundColor: Colors.error }]} />
            <Text style={[styles.locationBtnText, !destination && styles.locationBtnPlaceholder, destinationError && { color: Colors.error }]}>
              {destination || "Tap to select destination"}
            </Text>
            <Ionicons name={destination ? "checkmark-circle" : "chevron-down"} size={18} color={destination ? Colors.success : (destinationError ? Colors.error : Colors.textLight)} />
          </Pressable>

          {(pickupError || destinationError) && (
            <Text style={styles.errorMsg}>
              {pickupError && destinationError ? "Please select pickup & destination" : pickupError ? "Please select pickup location" : "Please select destination"}
            </Text>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Passengers</Text>
          <View style={styles.passengerRow}>
            {PASSENGER_OPTIONS.map((n) => (
              <Pressable
                key={n}
                style={[styles.passengerChip, passengers === n && { borderColor: headerColor, backgroundColor: headerColor }]}
                onPress={() => { try { Haptics.selectionAsync(); } catch {} setPassengers(n); }}
              >
                <Ionicons name="people" size={16} color={passengers === n ? "#FFF" : Colors.textSecondary} />
                <Text style={[styles.passengerChipText, passengers === n && { color: "#FFF" }]}>{n}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Comfort</Text>
          <View style={styles.acRow}>
            {AC_OPTIONS.map((opt) => (
              <Pressable
                key={opt.id}
                style={[styles.acChip, acOption === opt.id && { borderColor: headerColor, backgroundColor: headerColor + "12" }]}
                onPress={() => { try { Haptics.selectionAsync(); } catch {} setAcOption(opt.id as "ac" | "non-ac"); }}
              >
                <MaterialCommunityIcons name={opt.icon as any} size={18} color={acOption === opt.id ? headerColor : Colors.textSecondary} />
                <Text style={[styles.acChipLabel, acOption === opt.id && { color: headerColor }]}>{opt.label}</Text>
                {opt.surcharge > 0 && (
                  <Text style={[styles.acChipSurcharge, acOption === opt.id && { color: headerColor }]}>+{opt.surcharge * 100}%</Text>
                )}
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.fareCard}>
          <Text style={styles.fareTitle}>Fare Estimate</Text>
          <View style={styles.fareLine}>
            <Text style={styles.fareLabel}>Base Fare</Text>
            <Text style={styles.fareValue}>₹{basePrice.toLocaleString()}</Text>
          </View>
          {acOption === "ac" && (
            <View style={styles.fareLine}>
              <Text style={styles.fareLabel}>AC Surcharge (15%)</Text>
              <Text style={styles.fareValue}>+₹{Math.round(basePrice * 0.15)}</Text>
            </View>
          )}
          {passengers > 4 && (
            <View style={styles.fareLine}>
              <Text style={styles.fareLabel}>Extra Passengers</Text>
              <Text style={styles.fareValue}>+₹{Math.round(basePrice * 0.1)}</Text>
            </View>
          )}
          <View style={[styles.fareLine, styles.fareTotal]}>
            <Text style={styles.fareTotalLabel}>Total</Text>
            <Text style={[styles.fareTotalValue, { color: headerColor }]}>₹{totalAmount.toLocaleString()}</Text>
          </View>
        </View>
      </ScrollView>

      <View style={[styles.bottomBar, { paddingBottom: bottomInset + 16 }]}>
        <View>
          <Text style={styles.bottomLabel}>{isTempo ? "Vehicle Booking" : "Ride Booking"}</Text>
          <Text style={styles.bottomSub} numberOfLines={1}>{pickup || "Pickup"} → {destination || "Destination"}</Text>
        </View>
        <Pressable style={[styles.proceedBtn, { backgroundColor: headerColor }]} onPress={handleBook}>
          <MaterialCommunityIcons name={vehicleIcon as any} size={18} color="#FFF" />
          <Text style={styles.proceedBtnText}>{isTempo ? "Book Vehicle" : "Book Ride"}</Text>
        </Pressable>
      </View>

      <Modal visible={locationModal !== null} transparent animationType="slide" onRequestClose={() => setLocationModal(null)}>
        <Pressable style={styles.modalOverlay} onPress={() => setLocationModal(null)}>
          <View style={[styles.modalSheet, { paddingBottom: bottomInset + 16 }]}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>
              {locationModal === "pickup" ? "Select Pickup Location" : "Select Destination"}
            </Text>
            <FlatList
              data={LOCATION_OPTIONS}
              keyExtractor={(item) => item.label}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => (
                <Pressable
                  style={[
                    styles.locationOption,
                    ((locationModal === "pickup" && pickup === item.label) || (locationModal === "destination" && destination === item.label)) && styles.locationOptionSelected,
                  ]}
                  onPress={() => selectLocation(item.label)}
                >
                  <View style={[styles.locationIconBox, { backgroundColor: headerColor + "15" }]}>
                    <Ionicons name={item.icon as any} size={18} color={headerColor} />
                  </View>
                  <Text style={styles.locationOptionText}>{item.label}</Text>
                  {((locationModal === "pickup" && pickup === item.label) || (locationModal === "destination" && destination === item.label)) && (
                    <Ionicons name="checkmark-circle" size={20} color={Colors.success} />
                  )}
                </Pressable>
              )}
            />
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { paddingHorizontal: 16, paddingBottom: 14, flexDirection: "row", alignItems: "center", gap: 12 },
  headerBack: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  headerTitle: { fontFamily: "Poppins_700Bold", fontSize: 18, color: "#FFF" },
  headerSub: { fontFamily: "Poppins_400Regular", fontSize: 12, color: "rgba(255,255,255,0.8)" },
  scroll: { flex: 1 },
  vehicleCard: { backgroundColor: "#FFF", borderRadius: 16, padding: 16, flexDirection: "row", alignItems: "center", gap: 16, borderLeftWidth: 4, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  vehicleIconWrap: { width: 80, height: 80, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  vehicleName: { fontFamily: "Poppins_700Bold", fontSize: 16, color: Colors.text },
  vehicleDesc: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  priceRow: { flexDirection: "row", alignItems: "baseline", gap: 4, marginTop: 8 },
  vehiclePrice: { fontFamily: "Poppins_700Bold", fontSize: 20, color: Colors.primary },
  priceLabel: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary },
  section: { backgroundColor: "#FFF", borderRadius: 16, padding: 16, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  sectionTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: Colors.secondary, marginBottom: 4 },
  fieldHint: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary, marginBottom: 12 },
  locationBtn: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: Colors.surfaceAlt, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14, borderWidth: 1.5, borderColor: "transparent" },
  locationBtnError: { borderColor: Colors.error, backgroundColor: Colors.error + "08" },
  locationBtnText: { flex: 1, fontFamily: "Poppins_500Medium", fontSize: 14, color: Colors.text },
  locationBtnPlaceholder: { color: Colors.textLight, fontFamily: "Poppins_400Regular" },
  routeDot: { width: 10, height: 10, borderRadius: 5 },
  routeConnector: { alignItems: "center", paddingLeft: 14, height: 10 },
  routeConnectorLine: { width: 1.5, flex: 1, backgroundColor: Colors.borderLight },
  errorMsg: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.error, marginTop: 6 },
  passengerRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 4 },
  passengerChip: { width: 52, height: 52, borderRadius: 12, borderWidth: 1.5, borderColor: Colors.borderLight, backgroundColor: "#FFF", alignItems: "center", justifyContent: "center", gap: 3 },
  passengerChipText: { fontFamily: "Poppins_700Bold", fontSize: 13, color: Colors.textSecondary },
  acRow: { flexDirection: "row", gap: 12, marginTop: 4 },
  acChip: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1.5, borderColor: Colors.borderLight, borderRadius: 12, paddingVertical: 14, backgroundColor: "#FFF" },
  acChipLabel: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: Colors.textSecondary },
  acChipSurcharge: { fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textSecondary },
  fareCard: { backgroundColor: "#FFF", borderRadius: 16, padding: 16, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  fareTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: Colors.secondary, marginBottom: 10 },
  fareLine: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 6 },
  fareLabel: { fontFamily: "Poppins_400Regular", fontSize: 13, color: Colors.textSecondary },
  fareValue: { fontFamily: "Poppins_500Medium", fontSize: 13, color: Colors.text },
  fareTotal: { borderTopWidth: 1, borderTopColor: Colors.borderLight, marginTop: 6, paddingTop: 10 },
  fareTotalLabel: { fontFamily: "Poppins_700Bold", fontSize: 15, color: Colors.text },
  fareTotalValue: { fontFamily: "Poppins_700Bold", fontSize: 20 },
  bottomBar: { backgroundColor: "#FFF", paddingHorizontal: 20, paddingTop: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: Colors.borderLight, shadowColor: "#000", shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 8 },
  bottomLabel: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: Colors.text },
  bottomSub: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary, maxWidth: 180 },
  proceedBtn: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: Colors.primary, borderRadius: 14, paddingHorizontal: 18, paddingVertical: 12 },
  proceedBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: "#FFF" },
  errorText: { fontFamily: "Poppins_600SemiBold", fontSize: 16, color: Colors.textSecondary, marginTop: 16 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  modalSheet: { backgroundColor: "#FFF", borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 12, paddingHorizontal: 16, maxHeight: "80%" },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.borderLight, alignSelf: "center", marginBottom: 16 },
  modalTitle: { fontFamily: "Poppins_700Bold", fontSize: 17, color: Colors.text, marginBottom: 16 },
  locationOption: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 13, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  locationOptionSelected: { backgroundColor: Colors.success + "08" },
  locationOptionText: { flex: 1, fontFamily: "Poppins_500Medium", fontSize: 15, color: Colors.text },
  locationIconBox: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
});

import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Linking,
  Alert,
} from "react-native";
import { Image } from "expo-image";
import { router } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import Colors from "@/constants/colors";
import { useApp } from "@/lib/store";
import { getApiUrl } from "@/lib/query-client";
import { t } from "@/lib/i18n";
import { coupons, vendors, busRoutes, TRAVEL_VENDOR_ID, FLIGHT_VENDOR_IDS, TRAIN_VENDOR_IDS } from "@/lib/data";
import { SeatInfo } from "@/lib/types";
import SeatSelector from "@/components/SeatSelector";

const SERVICE_CATEGORY_IDS = ["3", "4"];
const TRAVEL_CATEGORY_ID = "5";
const BUS_VENDOR_IDS = ["v_travel_1", "v_bus_2"];
const CAB_VENDOR_IDS = ["v_cab_1", "v_cab_2"];
const HOTEL_VENDOR_IDS = ["v_hotel_1", "v_hotel_2"];
const TOUR_VENDOR_IDS = ["v_tour_1", "v_tour_2"];
const TEMPO_VENDOR_IDS = ["v_tempo_1", "v_tempo_2"];
const PILGRIM_VENDOR_IDS = ["v_pilgrim_1", "v_pilgrim_2"];
const ETICKET_VENDOR_IDS = [...FLIGHT_VENDOR_IDS, ...TRAIN_VENDOR_IDS, ...BUS_VENDOR_IDS];

const DELIVERY_SLOTS = [
  { id: "express", label: "Express", time: "15-25 min", icon: "lightning-bolt" as const, extra: 20 },
  { id: "standard", label: "Standard", time: "30-45 min", icon: "clock-outline" as const, extra: 0 },
  { id: "scheduled", label: "Scheduled", time: "Pick a time", icon: "calendar-clock" as const, extra: 0 },
];

const SERVICE_SLOTS = [
  { id: "morning", label: "Morning", time: "8 AM - 12 PM", icon: "weather-sunny" as const },
  { id: "afternoon", label: "Afternoon", time: "12 PM - 5 PM", icon: "weather-partly-cloudy" as const },
  { id: "evening", label: "Evening", time: "5 PM - 9 PM", icon: "weather-night" as const },
  { id: "fullday", label: "Full Day", time: "8 AM - 8 PM", icon: "clock-outline" as const },
];

export default function CartScreen() {
  const insets = useSafeAreaInsets();
  const { cart, updateCartQuantity, removeFromCart, clearCart, placeOrder, addresses, addAddress, user, language, vendorCodSettings, liveSubCategories, vendorApplications, liveVendors, customerPinCode, adminCoupons } = useApp();
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(null);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(addresses[0]?.id || null);
  const [selectedSlot, setSelectedSlot] = useState("standard");
  const [selectedServiceSlot, setSelectedServiceSlot] = useState("morning");
  const [serviceDate, setServiceDate] = useState("");
  const [serviceNote, setServiceNote] = useState("");
  const [deliveryNote, setDeliveryNote] = useState("");
  const [selectedSeats, setSelectedSeats] = useState<Record<string, SeatInfo | null>>({});
  const [showAddressModal, setShowAddressModal] = useState(false);
  const [addressError, setAddressError] = useState(false);
  const [guestError, setGuestError] = useState(false);
  const [serviceDateError, setServiceDateError] = useState(false);
  const [addressModalError, setAddressModalError] = useState("");
  const [newLabel, setNewLabel] = useState("Home");
  const [newAddress, setNewAddress] = useState("");
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState("");
  const [locationPermissionDenied, setLocationPermissionDenied] = useState(false);
  const [locationCoords, setLocationCoords] = useState<{ lat: number; lng: number } | null>(null);
  const topInset = Platform.OS === "web" ? 67 : insets.top;

  // Async-fetched category for vendors not in liveVendors (e.g. PENDING applications)
  const [fetchedCategoryId, setFetchedCategoryId] = useState<string | null>(null);
  const fetchedForVendorRef = useRef<string | null>(null);

  const cartVendor = cart.length > 0 ? liveVendors.find((v) => v.id === cart[0].vendorId) : null;
  const cartVendorId = cart.length > 0 ? cart[0].vendorId : null;

  // Pincode-based delivery fee:
  // Same 6-digit pincode   → ₹40  (same locality)
  // First 4 digits match   → ₹60  (same district, ~10-30 km)
  // First 2 digits match   → ₹100 (same state/region, ~30-100 km)
  // No match               → ₹150 (different state / long distance)
  const calcDeliveryFee = (custPin: string, vendPin: string): number => {
    const c = custPin.replace(/\D/g, "").trim();
    const v = vendPin.replace(/\D/g, "").trim();
    if (!c || !v || c.length < 6 || v.length < 6) return 40; // fallback when either pin unknown
    if (c === v) return 40;
    if (c.slice(0, 4) === v.slice(0, 4)) return 60;
    if (c.slice(0, 2) === v.slice(0, 2)) return 100;
    return 150;
  };
  // Fallback: if vendor not in liveVendors, check vendorApplications for their pinCode
  const vendorPinCode = cartVendor?.pinCode
    || (cartVendorId ? vendorApplications.find((a) => a.id === cartVendorId)?.pinCode : "")
    || "";

  // When cartVendor is null, fetch category from API (handles PENDING/stale vendors)
  useEffect(() => {
    if (cartVendor || !cartVendorId) { setFetchedCategoryId(null); fetchedForVendorRef.current = null; return; }
    if (fetchedForVendorRef.current === cartVendorId) return;
    fetchedForVendorRef.current = cartVendorId;
    fetch(new URL(`/api/vendors/${cartVendorId}`, getApiUrl()).toString())
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data?.vendor?.categoryId) setFetchedCategoryId(data.vendor.categoryId); })
      .catch(() => {});
  }, [cartVendorId, cartVendor]);

  const cartCodEnabled = cart.length > 0 && cart.every((item) => {
    const v = liveVendors.find((vn) => vn.id === item.vendorId);
    if (item.vendorId in vendorCodSettings) return vendorCodSettings[item.vendorId];
    if (item.product.codEnabled === true) return true;
    if (!v) return false;
    return v.codEnabled === true;
  });
  // Fallback chain: liveVendors → vendorApplications (admin context) → API-fetched
  const cartVendorApp = !cartVendor && cartVendorId
    ? vendorApplications.find((a) => a.id === cartVendorId)
    : null;
  const effectiveCategoryId = cartVendor?.categoryId ?? cartVendorApp?.categoryId ?? fetchedCategoryId ?? null;
  const effectiveSubCategoryId = cartVendor?.subCategoryId ?? cartVendorApp?.subCategoryId ?? null;
  const cartVendorSubCat = effectiveSubCategoryId ? liveSubCategories.find((sc) => sc.id === effectiveSubCategoryId) : null;
  const isServiceOrder = effectiveCategoryId !== null
    ? SERVICE_CATEGORY_IDS.includes(effectiveCategoryId) ||
      (!!cartVendorSubCat && SERVICE_CATEGORY_IDS.includes(cartVendorSubCat.categoryId))
    : false;
  const isTravelOrder = effectiveCategoryId === TRAVEL_CATEGORY_ID;
  const hasLiveTravelItem = cart.some((item) => (item.product as any).category === "Travel");
  const isETicketOrder = cart.some((item) => ETICKET_VENDOR_IDS.includes(item.vendorId));
  const isFlightOrder = cart.some((item) => FLIGHT_VENDOR_IDS.includes(item.vendorId));
  const isTrainOrder = cart.some((item) => TRAIN_VENDOR_IDS.includes(item.vendorId));
  const isBusOrder = cart.some((item) => BUS_VENDOR_IDS.includes(item.vendorId));
  const isCabOrder = cart.some((item) => CAB_VENDOR_IDS.includes(item.vendorId));
  const isHotelOrder = cart.some((item) => HOTEL_VENDOR_IDS.includes(item.vendorId));
  const isTourOrder = cart.some((item) => TOUR_VENDOR_IDS.includes(item.vendorId));
  const isTempoOrder = cart.some((item) => TEMPO_VENDOR_IDS.includes(item.vendorId));
  const isPilgrimOrder = cart.some((item) => PILGRIM_VENDOR_IDS.includes(item.vendorId));
  const isTravelBooking = (isTravelOrder || hasLiveTravelItem) && !isETicketOrder;
  const isLiveCabBooking = hasLiveTravelItem && !isETicketOrder;

  const selectedAddress = addresses.find((a) => a.id === selectedAddressId) || addresses[0];
  const selectedSlotData = DELIVERY_SLOTS.find((s) => s.id === selectedSlot) ?? DELIVERY_SLOTS[0];
  const selectedServiceSlotData = SERVICE_SLOTS.find((s) => s.id === selectedServiceSlot) ?? SERVICE_SLOTS[0];

  const subtotal = cart.reduce((s, c) => s + c.product.price * c.quantity, 0);
  const seatSurcharge = Object.values(selectedSeats).reduce((s, seat) => s + (seat?.price || 0), 0);
  const deliveryFee = isServiceOrder || isETicketOrder || isTravelBooking ? 0 : calcDeliveryFee(customerPinCode, vendorPinCode);
  const expressFee = isServiceOrder || isETicketOrder || isTravelBooking ? 0 : (selectedSlot === "express" ? 20 : 0);
  const availableCoupons = adminCoupons.length > 0
    ? adminCoupons.filter((c) => c.isActive && (!c.expiresAt || new Date(c.expiresAt) > new Date()))
    : coupons;
  const coupon = appliedCoupon ? availableCoupons.find((c) => c.code === appliedCoupon) : null;
  const discount = coupon
    ? coupon.discountType === "PERCENTAGE"
      ? Math.min((subtotal * coupon.value) / 100, 200)
      : coupon.value
    : 0;
  const total = Math.max(0, subtotal + deliveryFee + expressFee + seatSurcharge - discount);

  const webGeolocate = (highAccuracy: boolean, timeoutMs: number): Promise<GeolocationPosition> => {
    return new Promise<GeolocationPosition>((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("Geolocation not supported"));
        return;
      }
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: highAccuracy,
        timeout: timeoutMs,
        maximumAge: 60000,
      });
    });
  };

  const reverseGeocodeWeb = async (lat: number, lng: number): Promise<string> => {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`, {
        headers: { "User-Agent": "GoBharat/2.0" },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.display_name) return data.display_name;
      }
    } catch {}
    return `Lat: ${lat.toFixed(6)}, Lng: ${lng.toFixed(6)}`;
  };

  const handleUseCurrentLocation = async () => {
    setLocationLoading(true);
    setLocationError("");
    setLocationPermissionDenied(false);
    setLocationCoords(null);
    try {
      let lat = 0;
      let lng = 0;
      if (Platform.OS === "web") {
        let pos: GeolocationPosition | null = null;
        try {
          pos = await webGeolocate(true, 15000);
        } catch (e1: any) {
          if (e1?.code === 1) {
            setLocationError("Location permission denied. Please enable location access in your browser settings.");
            setLocationPermissionDenied(true);
            setLocationLoading(false);
            return;
          }
          try {
            pos = await webGeolocate(false, 30000);
          } catch (e2: any) {
            if (e2?.code === 1) {
              setLocationError("Location permission denied. Please enable location access in your browser settings.");
              setLocationPermissionDenied(true);
            } else if (e2?.code === 3) {
              setLocationError("Location request timed out. Please check that GPS/Location is turned on and try again.");
            } else {
              setLocationError("Location unavailable. Please make sure GPS is enabled or enter address manually.");
            }
            setLocationLoading(false);
            return;
          }
        }
        if (pos) {
          lat = pos.coords.latitude;
          lng = pos.coords.longitude;
          setLocationCoords({ lat, lng });
          const address = await reverseGeocodeWeb(lat, lng);
          setNewAddress(address);
        }
      } else {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") {
          setLocationError("Location permission denied. Please enable it in your phone settings.");
          setLocationPermissionDenied(true);
          setLocationCoords(null);
          setLocationLoading(false);
          return;
        }
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        lat = loc.coords.latitude;
        lng = loc.coords.longitude;
        setLocationCoords({ lat, lng });
        const results = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
        if (results.length > 0) {
          const r = results[0];
          const parts = [r.name, r.street, r.district, r.city, r.region, r.postalCode].filter(Boolean);
          setNewAddress(parts.join(", "));
        } else {
          setNewAddress(`Lat: ${lat.toFixed(6)}, Lng: ${lng.toFixed(6)}`);
        }
      }
    } catch (e: any) {
      setLocationCoords(null);
      setLocationError("Could not get location. Please make sure GPS is enabled or enter address manually.");
    }
    setLocationLoading(false);
  };

  const handleAddNewAddress = () => {
    if (!newLabel.trim()) {
      Alert.alert("Label Required", "Please select Home, Work, or Other before saving.");
      return;
    }
    if (!newAddress.trim()) {
      Alert.alert("Address Required", "Please enter your full address.");
      return;
    }
    try {
      const newId = addAddress({
        userId: user?.id || "",
        label: newLabel.trim(),
        fullAddress: newAddress.trim(),
        lat: locationCoords?.lat || 0,
        lng: locationCoords?.lng || 0,
        isDefault: addresses.length === 0,
      });
      setNewLabel("Home");
      setNewAddress("");
      setLocationCoords(null);
      setLocationError("");
      setLocationPermissionDenied(false);
      setAddressModalError("");
      setShowAddressModal(false);
      setAddressError(false);
      setSelectedAddressId(newId);
    } catch (e: any) {
      Alert.alert("Error", "Could not save address. Please try again.");
    }
  };

  const travelBookingLabel = (isCabOrder || isLiveCabBooking) ? "Ride Booking" : isHotelOrder ? "Hotel Booking" : isTourOrder ? "Tour Package" : isTempoOrder ? "Vehicle Booking" : isPilgrimOrder ? "Pilgrimage Booking" : "Travel Booking";
  const travelBookingIcon = (isCabOrder || isLiveCabBooking) ? "car-sport" : isHotelOrder ? "bed" : isTourOrder ? "map" : isTempoOrder ? "bus" : isPilgrimOrder ? "bonfire" : "earth";
  const travelConfirmMsg = (isCabOrder || isLiveCabBooking) ? "Your ride details will be sent to your phone. Driver will contact you before pickup." 
    : isHotelOrder ? "Booking confirmation will be sent to your email & phone. Show at check-in."
    : isTourOrder ? "Tour details & itinerary will be sent to your email. Our team will contact you for pickup arrangements."
    : isTempoOrder ? "Vehicle booking confirmed. Driver details will be shared before pickup time."
    : isPilgrimOrder ? "Pilgrimage package confirmed. Complete itinerary & pickup details sent via email & SMS."
    : "Booking confirmation sent to your email & phone.";

  const isGuest = user?.phone === "guest" || user?.phone === "" || !user?.phone;

  const handleCheckout = () => {
    if (cart.length === 0) return;
    if (isGuest) {
      setGuestError(true);
      return;
    }
    setGuestError(false);
    if (isETicketOrder) {
      const seatInfoStr = Object.entries(selectedSeats)
        .filter(([, s]) => s !== null)
        .map(([pid, s]) => `${pid}:${s!.label}|${s!.class || s!.berthType || ""}`)
        .join(",");
      try { Haptics.selectionAsync(); } catch {}
      router.push({
        pathname: "/payment" as any,
        params: {
          amount: total.toFixed(0),
          itemCount: cart.reduce((s, c) => s + c.quantity, 0).toString(),
          vendorName: cart[0]?.vendorName || "Travel Booking",
          address: "E-Ticket - Sent to registered email/phone",
          deliveryNote: "",
          deliverySpeed: "instant",
          isETicket: "true",
          seatInfo: seatInfoStr || "",
          codEnabled: cartCodEnabled ? "true" : "false",
        },
      });
    } else if (isTravelBooking) {
      try { Haptics.selectionAsync(); } catch {}
      router.push({
        pathname: "/payment" as any,
        params: {
          amount: total.toFixed(0),
          itemCount: cart.reduce((s, c) => s + c.quantity, 0).toString(),
          vendorName: cart[0]?.vendorName || travelBookingLabel,
          address: "Booking Confirmation - Sent to email/phone",
          deliveryNote: "",
          deliverySpeed: "instant",
          isETicket: "true",
          codEnabled: cartCodEnabled ? "true" : "false",
        },
      });
    } else if (isServiceOrder) {
      if (!selectedAddress) {
        setAddressError(true);
        setShowAddressModal(true);
        return;
      }
      setAddressError(false);
      if (!serviceDate.trim()) {
        setServiceDateError(true);
        Alert.alert(
          "Service Date Required",
          "Please scroll up and enter your preferred service date (e.g. Tomorrow, 25 May 2026) before booking.",
          [{ text: "OK" }]
        );
        return;
      }
      setServiceDateError(false);
      try { Haptics.selectionAsync(); } catch {}
      router.push({
        pathname: "/payment" as any,
        params: {
          amount: total.toFixed(0),
          itemCount: cart.reduce((s, c) => s + c.quantity, 0).toString(),
          vendorName: cart[0]?.vendorName || "Service Provider",
          vendorId: cart[0]?.vendorId || "",
          address: selectedAddress.fullAddress,
          deliveryNote: serviceNote || "",
          deliverySpeed: `Service: ${selectedServiceSlotData.label} (${selectedServiceSlotData.time}) on ${serviceDate}`,
          isService: "true",
          codEnabled: cartCodEnabled ? "true" : "false",
        },
      });
    } else {
      if (!selectedAddress) {
        setAddressError(true);
        setShowAddressModal(true);
        return;
      }
      setAddressError(false);
      try { Haptics.selectionAsync(); } catch {}
      const params = {
        amount: total.toFixed(0),
        itemCount: cart.reduce((s, c) => s + c.quantity, 0).toString(),
        vendorName: cart[0]?.vendorName || "Store",
        vendorId: cart[0]?.vendorId || "",
        address: selectedAddress.fullAddress,
        deliveryNote: deliveryNote || "",
        deliverySpeed: selectedSlot,
        codEnabled: cartCodEnabled ? "true" : "false",
      };
      router.push({
        pathname: "/payment" as any,
        params,
      });
    }
  };

  const hasBusRouteItems = cart.some((item) => item.vendorId === TRAVEL_VENDOR_ID && item.product.id.startsWith("bus"));
  const busCartItem = hasBusRouteItems ? cart.find((item) => item.product.id.startsWith("bus")) : null;
  const busRouteForCart = busCartItem ? busRoutes.find((r) => r.productId === busCartItem.product.id) : null;

  React.useEffect(() => {
    if (hasBusRouteItems && busRouteForCart) {
      removeFromCart(busCartItem!.product.id);
      router.push({ pathname: "/bus-booking" as any, params: { routeId: busRouteForCart.id } });
    }
  }, [hasBusRouteItems]);

  if (cart.length === 0) {
    return (
      <View style={[styles.emptyContainer, { paddingTop: topInset }]}>
        <Ionicons name="cart-outline" size={80} color={Colors.textLight} />
        <Text style={styles.emptyTitle}>{t("emptyCart", language)}</Text>
        <Text style={styles.emptyText}>Add items from nearby stores to get started</Text>
        <Pressable style={styles.shopButton} onPress={() => router.back()}>
          <Text style={styles.shopButtonText}>{t("startShopping", language)}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: topInset + 8 }]}>
        <Text style={styles.headerTitle}>{isETicketOrder ? (isFlightOrder ? "Flight Booking" : isTrainOrder ? "Train Booking" : "Bus Booking") : isTravelBooking ? travelBookingLabel : isServiceOrder ? "Service Booking" : t("cart", language)}</Text>
        <Text style={styles.vendorLabel}>from {cart[0]?.vendorName}</Text>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
        {cart.map((item) => (
          <View key={item.product.id} style={styles.cartItem}>
            <Image source={{ uri: item.product.image }} style={styles.itemImage} contentFit="cover" accessibilityLabel={item.product.name} />
            <View style={styles.itemInfo}>
              <Text style={styles.itemName} numberOfLines={1}>{item.product.name}</Text>
              <Text style={styles.itemPrice}>{"\u20B9"}{item.product.price}</Text>
            </View>
            <View style={styles.quantityRow}>
              <Pressable
                style={styles.qtyBtn}
                onPress={() => {
                  try { Haptics.selectionAsync(); } catch {}
                  updateCartQuantity(item.product.id, item.quantity - 1);
                }}
              >
                <Ionicons name="remove" size={18} color={Colors.primary} />
              </Pressable>
              <Text style={styles.qtyText}>{item.quantity}</Text>
              <Pressable
                style={styles.qtyBtn}
                onPress={() => {
                  try { Haptics.selectionAsync(); } catch {}
                  updateCartQuantity(item.product.id, item.quantity + 1);
                }}
              >
                <Ionicons name="add" size={18} color={Colors.primary} />
              </Pressable>
            </View>
          </View>
        ))}

        {isETicketOrder ? (
          <>
            <View style={styles.eTicketBanner}>
              <View style={styles.eTicketIconWrap}>
                <Ionicons name={isFlightOrder ? "airplane" : isTrainOrder ? "train" : "bus"} size={24} color="#FFF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.eTicketTitle}>
                  {isFlightOrder ? "Flight E-Ticket" : isTrainOrder ? "Train E-Ticket" : "Bus E-Ticket"}
                </Text>
                <Text style={styles.eTicketDesc}>
                  No physical delivery needed. Your e-ticket will be sent to your registered email and phone number instantly after payment.
                </Text>
              </View>
            </View>

            <View style={styles.eTicketDetails}>
              <View style={styles.eTicketRow}>
                <Ionicons name="mail-outline" size={18} color={Colors.primary} />
                <Text style={styles.eTicketRowText}>E-Ticket sent via Email & SMS</Text>
              </View>
              <View style={styles.eTicketRow}>
                <Ionicons name="time-outline" size={18} color={Colors.primary} />
                <Text style={styles.eTicketRowText}>Instant confirmation after payment</Text>
              </View>
              <View style={styles.eTicketRow}>
                <Ionicons name="document-text-outline" size={18} color={Colors.primary} />
                <Text style={styles.eTicketRowText}>
                  {isFlightOrder ? "Show e-ticket at airport check-in" : isTrainOrder ? "Show e-ticket at railway station" : "Show e-ticket to bus conductor"}
                </Text>
              </View>
              <View style={styles.eTicketRow}>
                <Ionicons name="shield-checkmark-outline" size={18} color={Colors.success} />
                <Text style={styles.eTicketRowText}>100% refundable as per cancellation policy</Text>
              </View>
            </View>

            {cart.map((item) => {
              const descParts = item.product.description.split(" | ");
              return (
                <View key={`detail-${item.product.id}`} style={styles.eTicketJourney}>
                  <Text style={styles.eTicketJourneyTitle}>{item.product.name}</Text>
                  <View style={styles.eTicketJourneyRow}>
                    {descParts.map((part, idx) => (
                      <View key={idx} style={styles.eTicketChip}>
                        <Text style={styles.eTicketChipText}>{part.trim()}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              );
            })}

            {(isFlightOrder || isTrainOrder) && cart.map((item) => (
              <SeatSelector
                key={`seat-${item.product.id}`}
                type={isFlightOrder ? "flight" : "train"}
                productId={item.product.id}
                selectedSeat={selectedSeats[item.product.id] || null}
                onSeatSelect={(seat) => setSelectedSeats((prev) => ({ ...prev, [item.product.id]: seat }))}
              />
            ))}
          </>
        ) : isTravelBooking ? (
          <>
            <View style={styles.eTicketBanner}>
              <View style={[styles.eTicketIconWrap, { backgroundColor: (isCabOrder || isLiveCabBooking) ? "#4CAF50" : isHotelOrder ? "#9C27B0" : isTourOrder ? "#2196F3" : isTempoOrder ? "#FF9800" : isPilgrimOrder ? "#E91E63" : Colors.primary }]}>
                <Ionicons name={travelBookingIcon as any} size={24} color="#FFF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.eTicketTitle}>{travelBookingLabel}</Text>
                <Text style={styles.eTicketDesc}>{travelConfirmMsg}</Text>
              </View>
            </View>

            <View style={styles.eTicketDetails}>
              <View style={styles.eTicketRow}>
                <Ionicons name="checkmark-circle-outline" size={18} color={Colors.primary} />
                <Text style={styles.eTicketRowText}>Instant booking confirmation</Text>
              </View>
              <View style={styles.eTicketRow}>
                <Ionicons name="mail-outline" size={18} color={Colors.primary} />
                <Text style={styles.eTicketRowText}>Details sent via Email & SMS</Text>
              </View>
              <View style={styles.eTicketRow}>
                <Ionicons name="call-outline" size={18} color={Colors.primary} />
                <Text style={styles.eTicketRowText}>
                  {(isCabOrder || isLiveCabBooking) ? "Driver will call before pickup" : isHotelOrder ? "Hotel will confirm via call" : isTourOrder ? "Tour coordinator will contact you" : isTempoOrder ? "Driver details shared before trip" : isPilgrimOrder ? "Yatra coordinator will contact you" : "Service team will contact you"}
                </Text>
              </View>
              <View style={styles.eTicketRow}>
                <Ionicons name="shield-checkmark-outline" size={18} color={Colors.success} />
                <Text style={styles.eTicketRowText}>
                  {(isCabOrder || isLiveCabBooking) ? "Free cancellation up to 5 min before pickup" : isHotelOrder ? "Free cancellation up to 24 hrs before check-in" : "Cancellation as per policy"}
                </Text>
              </View>
            </View>

            {cart.map((item) => {
              const descParts = item.product.description.split(" | ");
              return (
                <View key={`detail-${item.product.id}`} style={styles.eTicketJourney}>
                  <Text style={styles.eTicketJourneyTitle}>{item.product.name}</Text>
                  <View style={styles.eTicketJourneyRow}>
                    {descParts.map((part, idx) => (
                      <View key={idx} style={styles.eTicketChip}>
                        <Text style={styles.eTicketChipText}>{part.trim()}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              );
            })}
          </>
        ) : isServiceOrder ? (
          <>
            <View style={styles.serviceInfoBanner}>
              <Ionicons name="briefcase" size={20} color="#FFF" />
              <Text style={styles.serviceInfoText}>This is a service booking, not a product delivery</Text>
            </View>

            <View style={styles.deliverySection}>
              <View style={styles.sectionTitleRow}>
                <Ionicons name="location" size={20} color={Colors.primary} />
                <Text style={styles.sectionTitle}>Service Location</Text>
              </View>
              {addressError && !selectedAddress && (
                <View style={styles.addressErrorBanner}>
                  <Ionicons name="warning" size={16} color="#D32F2F" />
                  <Text style={styles.addressErrorText}>Please add a service location to continue</Text>
                </View>
              )}
              {addresses.length === 0 ? (
                <Pressable style={[styles.addAddressCard, addressError && styles.addAddressCardError]} onPress={() => setShowAddressModal(true)}>
                  <Ionicons name="add-circle-outline" size={28} color={addressError ? "#D32F2F" : Colors.primary} />
                  <Text style={[styles.addAddressText, addressError && { color: "#D32F2F" }]}>Add service location</Text>
                </Pressable>
              ) : (
                <>
                  {addresses.map((addr) => (
                    <Pressable
                      key={addr.id}
                      style={[styles.addressCard, selectedAddressId === addr.id && styles.addressCardSelected]}
                      onPress={() => {
                        try { Haptics.selectionAsync(); } catch {}
                        setSelectedAddressId(addr.id);
                      }}
                    >
                      <View style={[styles.radioOuter, selectedAddressId === addr.id && styles.radioOuterActive]}>
                        {selectedAddressId === addr.id && <View style={styles.radioInner} />}
                      </View>
                      <View style={styles.addressInfo}>
                        <View style={styles.addressLabelRow}>
                          <Ionicons
                            name={addr.label.toLowerCase() === "home" ? "home" : addr.label.toLowerCase() === "work" ? "briefcase" : "location"}
                            size={16}
                            color={selectedAddressId === addr.id ? Colors.primary : Colors.textSecondary}
                          />
                          <Text style={[styles.addressLabel, selectedAddressId === addr.id && { color: Colors.primary }]}>{addr.label}</Text>
                        </View>
                        <Text style={styles.addressText} numberOfLines={2}>{addr.fullAddress}</Text>
                      </View>
                    </Pressable>
                  ))}
                  <Pressable style={styles.addMoreBtn} onPress={() => setShowAddressModal(true)}>
                    <Ionicons name="add" size={18} color={Colors.primary} />
                    <Text style={styles.addMoreText}>Add new address</Text>
                  </Pressable>
                </>
              )}
            </View>

            <View style={styles.deliverySection}>
              <View style={styles.sectionTitleRow}>
                <Ionicons name="calendar" size={20} color={Colors.primary} />
                <Text style={styles.sectionTitle}>Service Date</Text>
              </View>
              <TextInput
                style={[styles.noteInput, serviceDateError && !serviceDate.trim() && { borderColor: "#D32F2F", borderWidth: 1.5 }]}
                placeholder="e.g. 25 Feb 2026, Tomorrow, Next Monday..."
                placeholderTextColor={serviceDateError && !serviceDate.trim() ? "#D32F2F" : Colors.textLight}
                maxLength={50}
                value={serviceDate}
                onChangeText={(text) => { setServiceDate(text); setServiceDateError(false); }}
              />
              {serviceDateError && !serviceDate.trim() && (
                <Text style={styles.fieldErrorText}>Please enter a service date to continue</Text>
              )}
            </View>

            <View style={styles.deliverySection}>
              <View style={styles.sectionTitleRow}>
                <MaterialCommunityIcons name="clock-outline" size={20} color={Colors.primary} />
                <Text style={styles.sectionTitle}>Preferred Time Slot</Text>
              </View>
              <View style={styles.slotsRow}>
                {SERVICE_SLOTS.map((slot) => (
                  <Pressable
                    key={slot.id}
                    style={[styles.slotCard, selectedServiceSlot === slot.id && styles.slotCardSelected]}
                    onPress={() => {
                      try { Haptics.selectionAsync(); } catch {}
                      setSelectedServiceSlot(slot.id);
                    }}
                  >
                    <MaterialCommunityIcons
                      name={slot.icon}
                      size={22}
                      color={selectedServiceSlot === slot.id ? Colors.primary : Colors.textSecondary}
                    />
                    <Text style={[styles.slotLabel, selectedServiceSlot === slot.id && { color: Colors.primary }]}>{slot.label}</Text>
                    <Text style={styles.slotTime}>{slot.time}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.deliverySection}>
              <View style={styles.sectionTitleRow}>
                <Ionicons name="chatbubble-ellipses-outline" size={18} color={Colors.primary} />
                <Text style={styles.sectionTitle}>Special Requirements</Text>
              </View>
              <TextInput
                style={styles.noteInput}
                placeholder="e.g. Need uniform, own equipment, specific skills..."
                placeholderTextColor={Colors.textLight}
                multiline
                maxLength={200}
                value={serviceNote}
                onChangeText={setServiceNote}
              />
            </View>
          </>
        ) : (
          <>
            <View style={styles.deliverySection}>
              <View style={styles.sectionTitleRow}>
                <Ionicons name="location" size={20} color={Colors.primary} />
                <Text style={styles.sectionTitle}>Delivery Address</Text>
              </View>

              {addressError && !selectedAddress && (
                <View style={styles.addressErrorBanner}>
                  <Ionicons name="warning" size={16} color="#D32F2F" />
                  <Text style={styles.addressErrorText}>Please add a delivery address to continue</Text>
                </View>
              )}
              {addresses.length === 0 ? (
                <Pressable style={[styles.addAddressCard, addressError && styles.addAddressCardError]} onPress={() => setShowAddressModal(true)}>
                  <Ionicons name="add-circle-outline" size={28} color={addressError ? "#D32F2F" : Colors.primary} />
                  <Text style={[styles.addAddressText, addressError && { color: "#D32F2F" }]}>Add delivery address</Text>
                </Pressable>
              ) : (
                <>
                  {addresses.map((addr) => (
                    <Pressable
                      key={addr.id}
                      style={[styles.addressCard, selectedAddressId === addr.id && styles.addressCardSelected]}
                      onPress={() => {
                        try { Haptics.selectionAsync(); } catch {}
                        setSelectedAddressId(addr.id);
                      }}
                    >
                      <View style={[styles.radioOuter, selectedAddressId === addr.id && styles.radioOuterActive]}>
                        {selectedAddressId === addr.id && <View style={styles.radioInner} />}
                      </View>
                      <View style={styles.addressInfo}>
                        <View style={styles.addressLabelRow}>
                          <Ionicons
                            name={addr.label.toLowerCase() === "home" ? "home" : addr.label.toLowerCase() === "work" ? "briefcase" : "location"}
                            size={16}
                            color={selectedAddressId === addr.id ? Colors.primary : Colors.textSecondary}
                          />
                          <Text style={[styles.addressLabel, selectedAddressId === addr.id && { color: Colors.primary }]}>{addr.label}</Text>
                        </View>
                        <Text style={styles.addressText} numberOfLines={2}>{addr.fullAddress}</Text>
                      </View>
                    </Pressable>
                  ))}
                  <Pressable style={styles.addMoreBtn} onPress={() => setShowAddressModal(true)}>
                    <Ionicons name="add" size={18} color={Colors.primary} />
                    <Text style={styles.addMoreText}>Add new address</Text>
                  </Pressable>
                </>
              )}
            </View>

            <View style={styles.deliverySection}>
              <View style={styles.sectionTitleRow}>
                <MaterialCommunityIcons name="clock-fast" size={20} color={Colors.primary} />
                <Text style={styles.sectionTitle}>Delivery Speed</Text>
              </View>
              <View style={styles.slotsRow}>
                {DELIVERY_SLOTS.map((slot) => (
                  <Pressable
                    key={slot.id}
                    style={[styles.slotCard, selectedSlot === slot.id && styles.slotCardSelected]}
                    onPress={() => {
                      try { Haptics.selectionAsync(); } catch {}
                      setSelectedSlot(slot.id);
                    }}
                  >
                    <MaterialCommunityIcons
                      name={slot.icon}
                      size={22}
                      color={selectedSlot === slot.id ? Colors.primary : Colors.textSecondary}
                    />
                    <Text style={[styles.slotLabel, selectedSlot === slot.id && { color: Colors.primary }]}>{slot.label}</Text>
                    <Text style={styles.slotTime}>{slot.time}</Text>
                    {slot.extra > 0 && <Text style={styles.slotExtra}>+{"\u20B9"}{slot.extra}</Text>}
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.deliverySection}>
              <View style={styles.sectionTitleRow}>
                <Ionicons name="chatbubble-ellipses-outline" size={18} color={Colors.primary} />
                <Text style={styles.sectionTitle}>Delivery Instructions</Text>
              </View>
              <TextInput
                style={styles.noteInput}
                placeholder="e.g. Ring the bell, leave at door, call on arrival..."
                placeholderTextColor={Colors.textLight}
                multiline
                maxLength={150}
                value={deliveryNote}
                onChangeText={setDeliveryNote}
              />
            </View>
          </>
        )}

        <View style={styles.couponSection}>
          <Text style={styles.couponLabel}>Available Coupons</Text>
          {availableCoupons.map((c) => (
            <Pressable
              key={c.id}
              style={[styles.couponCard, appliedCoupon === c.code && styles.couponApplied]}
              onPress={() => {
                try { Haptics.selectionAsync(); } catch {}
                setAppliedCoupon(appliedCoupon === c.code ? null : c.code);
              }}
            >
              <View style={styles.couponLeft}>
                <Text style={styles.couponCode}>{c.code}</Text>
                <Text style={styles.couponDesc}>
                  {c.discountType === "PERCENTAGE" ? `${c.value}% off` : `Flat \u20B9${c.value} off`}
                  {` on orders above \u20B9${c.minOrder}`}
                </Text>
              </View>
              <Text style={[styles.applyText, appliedCoupon === c.code && { color: Colors.success }]}>
                {appliedCoupon === c.code ? "Applied" : "Apply"}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.billSection}>
          <Text style={styles.billTitle}>{isETicketOrder ? "Ticket Details" : isTravelBooking ? "Booking Details" : isServiceOrder ? "Booking Details" : "Bill Details"}</Text>
          <View style={styles.billRow}>
            <Text style={styles.billLabel}>{isETicketOrder ? "Ticket Fare" : isTravelBooking ? "Booking Amount" : isServiceOrder ? "Service Charge" : "Subtotal"}</Text>
            <Text style={styles.billValue}>{"\u20B9"}{subtotal}</Text>
          </View>
          {seatSurcharge > 0 && (
            <View style={styles.billRow}>
              <Text style={styles.billLabel}>Seat Preference</Text>
              <Text style={styles.billValue}>{"\u20B9"}{seatSurcharge}</Text>
            </View>
          )}
          {!isServiceOrder && !isETicketOrder && !isTravelBooking && (
            <View style={styles.billRow}>
              <View>
                <Text style={styles.billLabel}>Delivery Fee</Text>
                {customerPinCode && vendorPinCode && customerPinCode.replace(/\D/g,"").length >= 6 && vendorPinCode.replace(/\D/g,"").length >= 6 && (
                  <Text style={{ fontFamily: "Poppins_400Regular", fontSize: 10, color: Colors.textSecondary, marginTop: 1 }}>
                    {customerPinCode.replace(/\D/g,"") === vendorPinCode.replace(/\D/g,"")
                      ? "Same area"
                      : customerPinCode.replace(/\D/g,"").slice(0,4) === vendorPinCode.replace(/\D/g,"").slice(0,4)
                        ? "Nearby (~10–30 km)"
                        : customerPinCode.replace(/\D/g,"").slice(0,2) === vendorPinCode.replace(/\D/g,"").slice(0,2)
                          ? "Same region (~30–100 km)"
                          : "Different state (100+ km)"}
                  </Text>
                )}
              </View>
              <Text style={styles.billValue}>{"\u20B9"}{deliveryFee}</Text>
            </View>
          )}
          {!isServiceOrder && !isETicketOrder && !isTravelBooking && expressFee > 0 && (
            <View style={styles.billRow}>
              <Text style={styles.billLabel}>Express Fee</Text>
              <Text style={styles.billValue}>{"\u20B9"}{expressFee}</Text>
            </View>
          )}
          {discount > 0 && (
            <View style={styles.billRow}>
              <Text style={styles.billLabel}>Discount</Text>
              <Text style={[styles.billValue, { color: Colors.success }]}>-{"\u20B9"}{discount.toFixed(0)}</Text>
            </View>
          )}
          <View style={[styles.billRow, styles.totalRow]}>
            <Text style={styles.totalLabel}>{t("totalAmount", language)}</Text>
            <Text style={styles.totalValue}>{"\u20B9"}{total.toFixed(0)}</Text>
          </View>
        </View>

        {isETicketOrder ? (
          <View style={styles.deliverToCard}>
            <Ionicons name={isFlightOrder ? "airplane" : isTrainOrder ? "train" : "bus"} size={22} color={Colors.primary} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.deliverToTitle}>E-Ticket Delivery</Text>
              <Text style={styles.deliverToAddr} numberOfLines={1}>Sent to your email & phone instantly</Text>
            </View>
            <Text style={styles.deliverToEta}>Instant</Text>
          </View>
        ) : isTravelBooking ? (
          <View style={styles.deliverToCard}>
            <Ionicons name={travelBookingIcon as any} size={22} color={Colors.primary} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.deliverToTitle}>{travelBookingLabel} Confirmation</Text>
              <Text style={styles.deliverToAddr} numberOfLines={1}>Confirmation sent to email & phone</Text>
            </View>
            <Text style={styles.deliverToEta}>Instant</Text>
          </View>
        ) : selectedAddress ? (
          <View style={styles.deliverToCard}>
            <Ionicons name="navigate-circle" size={22} color={Colors.primary} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.deliverToTitle}>{isServiceOrder ? `Service at ${selectedAddress.label}` : `Delivering to ${selectedAddress.label}`}</Text>
              <Text style={styles.deliverToAddr} numberOfLines={1}>{selectedAddress.fullAddress}</Text>
            </View>
            <Text style={styles.deliverToEta}>{isServiceOrder ? selectedServiceSlotData.time : selectedSlotData.time}</Text>
          </View>
        ) : (
          <Pressable style={[styles.deliverToCard, addressError && { borderColor: "#D32F2F", borderWidth: 1.5 }]} onPress={() => setShowAddressModal(true)}>
            <Ionicons name="add-circle" size={22} color={addressError ? "#D32F2F" : Colors.primary} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={[styles.deliverToTitle, addressError && { color: "#D32F2F" }]}>
                {addressError ? "Address required!" : "Add delivery address"}
              </Text>
              <Text style={[styles.deliverToAddr, addressError && { color: "#D32F2F" }]}>
                {addressError ? "Tap here to add your address" : "Required before checkout"}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={addressError ? "#D32F2F" : Colors.textLight} />
          </Pressable>
        )}

        {guestError && (
          <View style={styles.guestErrorBanner}>
            <View style={styles.guestErrorContent}>
              <Ionicons name="lock-closed" size={20} color="#D32F2F" />
              <View style={{ flex: 1 }}>
                <Text style={styles.guestErrorTitle}>Sign up to place your order</Text>
                <Text style={styles.guestErrorDesc}>Guest users can browse but cannot purchase</Text>
              </View>
            </View>
            <Pressable style={styles.guestSignUpBtn} onPress={() => router.replace("/auth" as any)}>
              <Text style={styles.guestSignUpText}>Sign Up Now</Text>
              <Ionicons name="arrow-forward" size={16} color="#FFF" />
            </Pressable>
          </View>
        )}

        <View style={styles.inlineCheckout}>
          <View style={styles.inlineCheckoutRow}>
            <View>
              <Text style={styles.bottomTotal}>{"\u20B9"}{total.toFixed(0)}</Text>
              <Text style={styles.bottomItems}>{cart.reduce((s, c) => s + c.quantity, 0)} {isETicketOrder ? "ticket(s)" : isTravelBooking ? "booking(s)" : isServiceOrder ? "service(s)" : t("items", language)}</Text>
            </View>
            <Pressable style={styles.checkoutButton} onPress={handleCheckout} testID="place-order-btn">
              <Text style={styles.checkoutText}>{isETicketOrder ? "Book Ticket" : isTravelBooking ? "Book Now" : isServiceOrder ? "Book & Pay" : t("proceedToPay", language)}</Text>
              <Ionicons name="arrow-forward" size={20} color="#FFF" />
            </Pressable>
          </View>
        </View>
      </ScrollView>

      <Modal visible={showAddressModal} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "padding"} style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={() => { setShowAddressModal(false); setNewLabel("Home"); setNewAddress(""); setLocationError(""); setLocationPermissionDenied(false); setLocationLoading(false); setAddressModalError(""); }} />
          <View style={[styles.modalContent, { maxHeight: "90%", paddingBottom: 0 }]}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Add New Address</Text>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: Platform.OS === "web" ? 34 : Math.max(insets.bottom, 20) }}
            >
              <Text style={styles.fieldLabel}>Label</Text>
              <View style={styles.labelChips}>
                {["Home", "Work", "Other"].map((l) => (
                  <Pressable
                    key={l}
                    style={[styles.labelChip, newLabel === l && styles.labelChipActive]}
                    onPress={() => setNewLabel(l)}
                  >
                    <Ionicons
                      name={l === "Home" ? "home" : l === "Work" ? "briefcase" : "location"}
                      size={16}
                      color={newLabel === l ? "#FFF" : Colors.textSecondary}
                    />
                    <Text style={[styles.labelChipText, newLabel === l && { color: "#FFF" }]}>{l}</Text>
                  </Pressable>
                ))}
              </View>

              <Pressable
                style={[styles.currentLocationBtn, locationLoading && { opacity: 0.6 }]}
                onPress={handleUseCurrentLocation}
                disabled={locationLoading}
              >
                <Ionicons name={locationLoading ? "hourglass" : "navigate"} size={18} color="#FFF" />
                <Text style={styles.currentLocationText}>
                  {locationLoading ? "Getting location..." : "Use Current Location"}
                </Text>
              </Pressable>
              {locationError ? (
                <View style={{ marginTop: 6 }}>
                  <Text style={styles.locationErrorText}>{locationError}</Text>
                  {locationPermissionDenied && Platform.OS !== "web" && (
                    <Pressable
                      onPress={() => Linking.openSettings()}
                      style={{ marginTop: 6, alignSelf: "flex-start", paddingHorizontal: 12, paddingVertical: 6, backgroundColor: Colors.primary + "15", borderRadius: 8, borderWidth: 1, borderColor: Colors.primary + "40" }}
                    >
                      <Text style={{ fontFamily: "Poppins_600SemiBold", fontSize: 13, color: Colors.primary }}>Open Settings</Text>
                    </Pressable>
                  )}
                </View>
              ) : null}

              <Text style={styles.fieldLabel}>Full Address</Text>
              <TextInput
                style={styles.addressInput}
                placeholder="House/Flat No., Street, Area, City, Pincode"
                placeholderTextColor={Colors.textLight}
                multiline
                maxLength={200}
                value={newAddress}
                onChangeText={(text) => { setNewAddress(text); setLocationCoords(null); }}
              />

              {addressModalError ? (
                <Text style={styles.fieldErrorText}>{addressModalError}</Text>
              ) : null}

              <Pressable style={styles.saveAddressBtn} onPress={handleAddNewAddress}>
                <Ionicons name="checkmark" size={20} color="#FFF" />
                <Text style={styles.saveAddressText}>Save Address</Text>
              </Pressable>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  emptyContainer: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40, backgroundColor: Colors.background },
  emptyTitle: { fontFamily: "Poppins_700Bold", fontSize: 20, color: Colors.secondary, marginTop: 20 },
  emptyText: { fontFamily: "Poppins_400Regular", fontSize: 14, color: Colors.textSecondary, textAlign: "center", marginTop: 8 },
  shopButton: {
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingHorizontal: 32,
    paddingVertical: 14,
    marginTop: 24,
  },
  shopButtonText: { fontFamily: "Poppins_600SemiBold", fontSize: 15, color: "#FFF" },
  serviceInfoBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#10B981",
    marginHorizontal: 20,
    marginTop: 12,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  serviceInfoText: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: "#FFF", flex: 1 },
  header: { backgroundColor: "#FFF", paddingHorizontal: 24, paddingBottom: 16 },
  headerTitle: { fontFamily: "Poppins_700Bold", fontSize: 24, color: Colors.secondary },
  vendorLabel: { fontFamily: "Poppins_400Regular", fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  content: { flex: 1 },
  cartItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF",
    marginHorizontal: 20,
    marginTop: 12,
    borderRadius: 16,
    padding: 12,
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  itemImage: { width: 60, height: 60, borderRadius: 12 },
  itemInfo: { flex: 1 },
  itemName: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: Colors.text },
  itemPrice: { fontFamily: "Poppins_700Bold", fontSize: 15, color: Colors.primary, marginTop: 2 },
  quantityRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  qtyBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  qtyText: { fontFamily: "Poppins_700Bold", fontSize: 16, color: Colors.text, minWidth: 20, textAlign: "center" },

  deliverySection: {
    marginTop: 20,
    marginHorizontal: 20,
    backgroundColor: "#FFF",
    borderRadius: 16,
    padding: 16,
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 14,
  },
  sectionTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 16,
    color: Colors.secondary,
  },
  addAddressCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    borderStyle: "dashed" as const,
    borderRadius: 14,
    padding: 16,
  },
  addAddressCardError: {
    borderColor: "#D32F2F",
    backgroundColor: "#FFF5F5",
  },
  addAddressText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 14,
    color: Colors.primary,
  },
  addressErrorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FFEBEE",
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
  },
  addressErrorText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 13,
    color: "#D32F2F",
  },
  guestErrorBanner: {
    backgroundColor: "#FFF3F3",
    borderWidth: 1.5,
    borderColor: "#D32F2F",
    borderRadius: 14,
    padding: 14,
    marginHorizontal: 16,
    marginBottom: 12,
  },
  guestErrorContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },
  guestErrorTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
    color: "#D32F2F",
  },
  guestErrorDesc: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: "#B71C1C",
  },
  guestSignUpBtn: {
    backgroundColor: Colors.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 10,
    paddingVertical: 10,
  },
  guestSignUpText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
    color: "#FFF",
  },
  fieldErrorText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: "#D32F2F",
    marginTop: 4,
    marginBottom: 4,
  },
  addressCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: Colors.border,
    marginBottom: 8,
  },
  addressCardSelected: {
    borderColor: Colors.primary,
    backgroundColor: "rgba(255,107,0,0.04)",
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  radioOuterActive: { borderColor: Colors.primary },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.primary,
  },
  addressInfo: { flex: 1 },
  addressLabelRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 },
  addressLabel: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
    color: Colors.text,
  },
  addressText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 17,
  },
  addMoreBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    marginTop: 4,
  },
  addMoreText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 13,
    color: Colors.primary,
  },

  slotsRow: {
    flexDirection: "row",
    gap: 10,
  },
  slotCard: {
    flex: 1,
    alignItems: "center",
    padding: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: Colors.border,
    gap: 4,
  },
  slotCardSelected: {
    borderColor: Colors.primary,
    backgroundColor: "rgba(255,107,0,0.04)",
  },
  slotLabel: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
    color: Colors.text,
  },
  slotTime: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
  },
  slotExtra: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 10,
    color: Colors.primary,
    backgroundColor: "rgba(255,107,0,0.08)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },

  noteInput: {
    backgroundColor: Colors.background,
    borderRadius: 12,
    padding: 12,
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: Colors.text,
    minHeight: 52,
    textAlignVertical: "top",
    borderWidth: 1,
    borderColor: Colors.border,
  },

  couponSection: { marginTop: 20, paddingHorizontal: 20 },
  couponLabel: { fontFamily: "Poppins_600SemiBold", fontSize: 16, color: Colors.secondary, marginBottom: 10 },
  couponCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFF",
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderStyle: "dashed" as const,
  },
  couponApplied: { borderColor: Colors.success, backgroundColor: "#F0FFF4" },
  couponLeft: { flex: 1 },
  couponCode: { fontFamily: "Poppins_700Bold", fontSize: 14, color: Colors.primary },
  couponDesc: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  applyText: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: Colors.primary },
  billSection: {
    margin: 20,
    backgroundColor: "#FFF",
    borderRadius: 16,
    padding: 16,
  },
  billTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 16, color: Colors.secondary, marginBottom: 12 },
  billRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  billLabel: { fontFamily: "Poppins_400Regular", fontSize: 14, color: Colors.textSecondary },
  billValue: { fontFamily: "Poppins_500Medium", fontSize: 14, color: Colors.text },
  totalRow: { borderTopWidth: 1, borderTopColor: Colors.borderLight, paddingTop: 10, marginTop: 4 },
  totalLabel: { fontFamily: "Poppins_700Bold", fontSize: 16, color: Colors.secondary },
  totalValue: { fontFamily: "Poppins_700Bold", fontSize: 18, color: Colors.primary },

  deliverToCard: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 20,
    marginBottom: 20,
    backgroundColor: "rgba(255,107,0,0.06)",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(255,107,0,0.15)",
  },
  deliverToTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 13,
    color: Colors.secondary,
  },
  deliverToAddr: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  deliverToEta: {
    fontFamily: "Poppins_700Bold",
    fontSize: 13,
    color: Colors.primary,
  },

  inlineCheckout: {
    marginHorizontal: 20,
    marginTop: 20,
    marginBottom: 20,
    backgroundColor: "#FFF",
    borderRadius: 20,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  inlineCheckoutRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  bottomTotal: { fontFamily: "Poppins_700Bold", fontSize: 20, color: Colors.secondary },
  bottomItems: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary },
  checkoutButton: {
    backgroundColor: Colors.primary,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 14,
    paddingHorizontal: 28,
    paddingVertical: 14,
  },
  checkoutText: { fontFamily: "Poppins_600SemiBold", fontSize: 15, color: "#FFF" },

  modalOverlay: { flex: 1, justifyContent: "flex-end" },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.45)" },
  modalContent: {
    backgroundColor: "#FFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: "center",
    marginBottom: 16,
  },
  modalTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 20,
    color: Colors.secondary,
    marginBottom: 20,
  },
  fieldLabel: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 8,
    marginTop: 4,
  },
  labelChips: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 16,
  },
  labelChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  labelChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  labelChipText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 13,
    color: Colors.text,
  },
  addressInput: {
    backgroundColor: Colors.background,
    borderRadius: 14,
    padding: 14,
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: Colors.text,
    minHeight: 80,
    textAlignVertical: "top",
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 20,
  },
  currentLocationBtn: {
    backgroundColor: "#4CAF50",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 12,
    paddingVertical: 12,
    marginBottom: 12,
  },
  currentLocationText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
    color: "#FFF",
  },
  locationErrorText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: "#D32F2F",
    marginBottom: 8,
  },
  saveAddressBtn: {
    backgroundColor: Colors.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 14,
    paddingVertical: 14,
  },
  saveAddressText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 15,
    color: "#FFF",
  },
  eTicketBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: "#0B1E3D",
    marginHorizontal: 20,
    marginTop: 16,
    borderRadius: 16,
    padding: 16,
  },
  eTicketIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  eTicketTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 16,
    color: "#FFF",
  },
  eTicketDesc: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: "#CBD5E1",
    marginTop: 4,
    lineHeight: 17,
  },
  eTicketDetails: {
    backgroundColor: "#FFF",
    marginHorizontal: 20,
    marginTop: 12,
    borderRadius: 14,
    padding: 16,
    gap: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  eTicketRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  eTicketRowText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 13,
    color: Colors.text,
    flex: 1,
  },
  eTicketJourney: {
    backgroundColor: "#FFF",
    marginHorizontal: 20,
    marginTop: 10,
    borderRadius: 14,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  eTicketJourneyTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 15,
    color: Colors.secondary,
    marginBottom: 10,
  },
  eTicketJourneyRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  eTicketChip: {
    backgroundColor: Colors.primary + "15",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  eTicketChipText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 12,
    color: Colors.primary,
  },
});

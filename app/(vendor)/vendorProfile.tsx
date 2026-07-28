import React, { useState, useEffect, useRef } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Platform, Modal, Alert, ActivityIndicator, Switch, TextInput, Linking } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { useQuery } from "@tanstack/react-query";
import Colors from "@/constants/colors";
import { useApp } from "@/lib/store";
import { apiRequest, getAuthToken, getApiUrl } from "@/lib/query-client";
import { fetch as expoFetch } from "expo/fetch";
import { categories } from "@/lib/data";
import { VendorApplication } from "@/lib/types";

export default function VendorProfile() {
  const insets = useSafeAreaInsets();
  const { user, logout, vendorApplications, liveVendors, vendorProfileImages, updateVendorProfileImage, removeVendorProfileImage, vendorCodSettings, updateVendorCod, updateVendorPaymentQr, removeVendorPaymentQr, updateVendorUpiId } = useApp();
  const [pickingQr, setPickingQr] = useState(false);
  const [upiIdInput, setUpiIdInput] = useState("");
  const [savingUpiId, setSavingUpiId] = useState(false);
  const [qrCacheBust, setQrCacheBust] = useState(0);
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const [activeModal, setActiveModal] = useState<string | null>(null);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [pickingImage, setPickingImage] = useState(false);
  const [locationLink, setLocationLink] = useState("");
  const [savingLocation, setSavingLocation] = useState(false);
  const [locationSaveMsg, setLocationSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [gettingGps, setGettingGps] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [resolvedCoords, setResolvedCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [mapThumbError, setMapThumbError] = useState(false);
  const resolveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resolveAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (resolveTimerRef.current) clearTimeout(resolveTimerRef.current);
    if (resolveAbortRef.current) resolveAbortRef.current.abort();
    const trimmed = locationLink.trim();
    if (!trimmed) {
      setResolvedCoords(null);
      setResolveError(null);
      setResolving(false);
      return;
    }
    setResolving(true);
    setResolvedCoords(null);
    setResolveError(null);
    const controller = new AbortController();
    resolveAbortRef.current = controller;
    resolveTimerRef.current = setTimeout(async () => {
      if (controller.signal.aborted) return;
      try {
        const token = await getAuthToken();
        const baseUrl = getApiUrl();
        const url = new URL("/api/vendor/location/resolve", baseUrl).toString();
        const res = await expoFetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ locationLink: trimmed }),
          credentials: "include",
        });
        if (controller.signal.aborted) return;
        const data = await res.json();
        if (controller.signal.aborted) return;
        if (res.ok && data.lat != null) {
          setMapThumbError(false);
          setResolvedCoords({ lat: data.lat, lng: data.lng });
          setResolveError(null);
        } else {
          setResolvedCoords(null);
          setResolveError(data.error || "Could not resolve this link.");
        }
      } catch {
        if (controller.signal.aborted) return;
        setResolvedCoords(null);
        setResolveError("Network error while resolving link.");
      } finally {
        if (!controller.signal.aborted) setResolving(false);
      }
    }, 900);
    return () => {
      controller.abort();
    };
  }, [locationLink]);

  const vendorImage = user?.phone ? vendorProfileImages[user.phone] : undefined;

  const handlePickImage = async (useCamera: boolean) => {
    try {
      setPickingImage(true);
      if (useCamera) {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          if (!perm.canAskAgain) {
            Alert.alert("Permission Required", "Camera access was denied. Please enable it in your device Settings.", [{ text: "OK" }]);
          } else {
            Alert.alert("Permission Required", "Camera access is needed to take a photo.");
          }
          setPickingImage(false);
          return;
        }
      } else if (Platform.OS !== "web") {
        const mediaPerm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!mediaPerm.granted) {
          if (!mediaPerm.canAskAgain) {
            Alert.alert("Permission Required", "Photo library access was denied. Please enable it in your device Settings.", [{ text: "OK" }]);
          } else {
            Alert.alert("Permission Required", "Photo library access is needed to choose a photo.");
          }
          setPickingImage(false);
          return;
        }
      }
      const result = useCamera
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.6, base64: true })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.6, base64: true });
      if (!result.canceled && result.assets[0]) {
        updateVendorProfileImage(result.assets[0].uri, result.assets[0].base64 ?? undefined);
        try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
      }
    } catch {
      Alert.alert("Error", "Failed to pick image. Please try again.");
    } finally {
      setPickingImage(false);
    }
  };

  const handleAvatarPress = () => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
    const options: Array<{ text: string; onPress?: () => void; style?: "cancel" | "destructive" }> = [];
    if (Platform.OS !== "web") {
      options.push({ text: "Take Photo", onPress: () => handlePickImage(true) });
    }
    options.push({ text: "Choose from Gallery", onPress: () => handlePickImage(false) });
    if (vendorImage) {
      options.push({ text: "Remove Photo", onPress: () => { removeVendorProfileImage(); }, style: "destructive" });
    }
    options.push({ text: "Cancel", style: "cancel" });
    Alert.alert("Shop Profile Photo", "Update your shop's profile photo", options);
  };

  const handleDeleteAccount = async () => {
    if (!user?.phone) return;
    setDeletingAccount(true);
    try {
      const res = await apiRequest("DELETE", `/api/user/${encodeURIComponent(user.phone)}`);
      if (res.ok) {
        setShowDeleteModal(false);
        logout();
        setTimeout(() => { router.replace("/auth" as any); }, 300);
        Alert.alert("Account Deleted", "Your account and all associated data have been permanently deleted.");
      } else {
        Alert.alert("Error", "Failed to delete account. Please try again.");
      }
    } catch {
      Alert.alert("Error", "Failed to delete account. Please try again.");
    } finally {
      setDeletingAccount(false);
    }
  };

  const { data: myAppData } = useQuery<{ application: VendorApplication | null }>({
    queryKey: ["/api/vendor-applications/mine"],
  });
  const userPhoneLast10 = user?.phone?.replace(/\D/g, "").slice(-10) || "";
  const vendorAppFromState = vendorApplications.find(a =>
    a.phone.replace(/\D/g, "").slice(-10) === userPhoneLast10 &&
    (a.status === "APPROVED" || a.status === "LIVE")
  );
  const vendorApp = myAppData?.application || vendorAppFromState || null;
  const matchedVendor = liveVendors.find(v =>
    vendorApp
      ? v.name === vendorApp.businessName || v.id === vendorApp.id
      : v.name === user?.name || v.franchiseId === user?.phone
  );
  const vendorCategoryId = user?.vendorCategoryId || vendorApp?.categoryId || matchedVendor?.categoryId;
  const isManpower = vendorCategoryId === "4";
  const storeName = vendorApp?.businessName || matchedVendor?.name || user?.name || "Your Store";
  const storeEmail = (vendorApp?.email && !vendorApp.email.endsWith("@gobharat.in")) ? vendorApp.email
    : (user?.email && !user.email.endsWith("@gobharat.in")) ? user.email : null;
  const storeCategory = categories.find(c => c.id === (vendorApp?.categoryId || matchedVendor?.categoryId || vendorCategoryId));
  const commissionRate = vendorApp?.commissionRate ?? matchedVendor?.commissionRate ?? null;
  const storeRating = matchedVendor?.rating ?? null;
  const codVendorKey = matchedVendor?.id || `phone_${user?.phone || ""}`;
  const isCodEligible = vendorCategoryId === "1" || vendorCategoryId === "2";
  const codEnabled = codVendorKey in vendorCodSettings ? vendorCodSettings[codVendorKey] : (matchedVendor?.codEnabled ?? isCodEligible);

  const handleSaveLocation = async () => {
    if (!locationLink.trim() && !resolvedCoords) {
      setLocationSaveMsg({ ok: false, text: "Please paste a Google Maps link or use GPS." });
      return;
    }
    if (locationLink.trim() && !resolvedCoords) {
      setLocationSaveMsg({ ok: false, text: resolveError || "Link could not be resolved. Please try another link." });
      return;
    }
    setSavingLocation(true);
    setLocationSaveMsg(null);
    try {
      const payload = resolvedCoords
        ? { lat: resolvedCoords.lat, lng: resolvedCoords.lng }
        : { locationLink: locationLink.trim() };
      const res = await apiRequest("PATCH", "/api/vendor/location", payload);
      const data = await res.json();
      if (res.ok && data.success) {
        setLocationSaveMsg({ ok: true, text: "Shop location updated successfully!" });
        setLocationLink("");
        setResolvedCoords(null);
        setResolveError(null);
        try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
      } else {
        setLocationSaveMsg({ ok: false, text: data.error || "Failed to update location. Please try again." });
      }
    } catch (err: any) {
      let errMsg = "Network error. Please try again.";
      if (err?.message) {
        const colonIdx = err.message.indexOf(": ");
        const rawBody = colonIdx !== -1 ? err.message.slice(colonIdx + 2) : err.message;
        try {
          const parsed = JSON.parse(rawBody);
          if (parsed?.error) errMsg = parsed.error;
        } catch { errMsg = rawBody || errMsg; }
      }
      setLocationSaveMsg({ ok: false, text: errMsg });
    } finally {
      setSavingLocation(false);
    }
  };

  const handleGpsLocation = async () => {
    setGettingGps(true);
    setLocationSaveMsg(null);
    setResolvedCoords(null);
    setResolveError(null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setLocationSaveMsg({ ok: false, text: "Location permission denied. Please enable it in Settings." });
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const lat = loc.coords.latitude;
      const lng = loc.coords.longitude;
      setMapThumbError(false);
      setResolvedCoords({ lat, lng });
      setLocationLink("");
      setSavingLocation(true);
      const res = await apiRequest("PATCH", "/api/vendor/location", { lat, lng });
      const data = await res.json();
      if (res.ok && data.success) {
        setLocationSaveMsg({ ok: true, text: "Shop location updated to your current GPS position!" });
        try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
      } else {
        setLocationSaveMsg({ ok: false, text: data.error || "Failed to update location." });
        setResolvedCoords(null);
      }
    } catch {
      setLocationSaveMsg({ ok: false, text: "Could not get GPS location. Please try again." });
      setResolvedCoords(null);
    } finally {
      setGettingGps(false);
      setSavingLocation(false);
    }
  };

  const isTravelVendor = vendorCategoryId === "5";

  // Called by the web file input's onChange — reads the file and uploads it
  const handleWebFileSelected = async (file: File) => {
    setPickingQr(true);
    try {
      const b64: string = await new Promise((res, rej) => {
        const reader = new FileReader();
        reader.onload = () => {
          const r = reader.result as string;
          res(r.includes(",") ? r.split(",")[1] : r);
        };
        reader.onerror = rej;
        reader.readAsDataURL(file);
      });
      const ok = await updateVendorPaymentQr(b64);
      if (ok) {
        setQrCacheBust(Date.now());
        try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
      } else {
        Alert.alert("Error", "Failed to upload QR. Please try again.");
      }
    } catch {
      Alert.alert("Error", "Could not read image. Please try a different photo.");
    } finally {
      setPickingQr(false);
    }
  };

  const handlePickQr = async (useCamera: boolean) => {
    // Native path only — web uses the inline <input type="file"> overlay instead
    try {
      setPickingQr(true);
      if (useCamera) {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) { Alert.alert("Permission Required", "Camera access is needed."); setPickingQr(false); return; }
      } else {
        const mediaPerm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!mediaPerm.granted) { Alert.alert("Permission Required", "Photo library access is needed."); setPickingQr(false); return; }
      }
      const result = useCamera
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.7, base64: true })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.7, base64: true });
      if (!result.canceled && result.assets[0]) {
        const b64 = result.assets[0].base64 ?? null;
        if (b64) {
          const ok = await updateVendorPaymentQr(b64);
          if (ok) {
            setQrCacheBust(Date.now());
            try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
          } else {
            Alert.alert("Error", "Failed to upload QR. Please try again.");
          }
        } else {
          Alert.alert("Error", "Could not process the selected image. Please try again.");
        }
      }
    } catch {
      Alert.alert("Error", "Failed to pick image. Please try again.");
    } finally {
      setPickingQr(false);
    }
  };

  const handleQrAction = () => {
    const hasExistingQr = !!matchedVendor?.hasPaymentQr;
    const options: Array<{ text: string; onPress?: () => void; style?: "cancel" | "destructive" }> = [];
    if (Platform.OS !== "web") options.push({ text: "Take Photo of QR", onPress: () => handlePickQr(true) });
    options.push({ text: hasExistingQr ? "Replace QR" : "Upload QR Image", onPress: () => handlePickQr(false) });
    if (hasExistingQr) {
      options.push({
        text: "Remove QR",
        style: "destructive",
        onPress: async () => {
          const ok = await removeVendorPaymentQr();
          if (ok) setQrCacheBust(Date.now());
          else Alert.alert("Error", "Failed to remove QR.");
        },
      });
    }
    options.push({ text: "Cancel", style: "cancel" });
    Alert.alert("Payment QR Code", "Upload your UPI QR code. Customers will scan it to pay you directly.", options);
  };

  const regularMenuItems = [
    { icon: "storefront", label: "Store Details", action: () => setActiveModal("store") },
    { icon: "location", label: "Shop Location", action: () => { setLocationLink(""); setLocationSaveMsg(null); setResolvedCoords(null); setResolveError(null); setActiveModal("location"); } },
    { icon: "wallet", label: "Earnings & Payouts", action: () => router.push("/vendor-payouts" as any) },
    { icon: "card", label: "Payout Details", action: () => setActiveModal("payout") },
    { icon: "qr-code", label: (matchedVendor?.upiId || matchedVendor?.hasPaymentQr) ? "Payment QR Code ✓" : "Set Payment QR (UPI)", action: () => { setUpiIdInput(matchedVendor?.upiId || ""); setActiveModal("paymentQr"); } },
    { icon: "people", label: "Manage Staff", action: () => setActiveModal("staff") },
    { icon: "analytics", label: "Analytics", action: () => setActiveModal("analytics") },
    { icon: "help-circle", label: "Support", action: () => Alert.alert("Support", "Contact us at gobharatservice@gmail.com or call 8177977700") },
  ];

  const manpowerMenuItems = [
    { icon: "business", label: "Agency Details", action: () => setActiveModal("store") },
    { icon: "location", label: "Agency Location", action: () => { setLocationLink(""); setLocationSaveMsg(null); setResolvedCoords(null); setResolveError(null); setActiveModal("location"); } },
    { icon: "people", label: "Worker Management", action: () => router.push("/vendor-manpower" as any) },
    { icon: "wallet", label: "Payments & Commission", action: () => router.push("/vendor-payouts" as any) },
    { icon: "card", label: "Payout Details", action: () => setActiveModal("payout") },
    { icon: "clipboard", label: "Attendance Reports", action: () => router.push("/vendor-manpower" as any) },
    { icon: "analytics", label: "Analytics", action: () => setActiveModal("analytics") },
    { icon: "help-circle", label: "Support", action: () => Alert.alert("Support", "Contact us at gobharatservice@gmail.com or call 8177977700") },
  ];

  const menuItems = isManpower ? manpowerMenuItems : regularMenuItems;

  const renderMapThumbnail = (lat: number, lng: number) => {
    if (mapThumbError) return null;
    const mapsUrl = `https://www.google.com/maps?q=${lat},${lng}`;
    const openMap = () =>
      Linking.openURL(mapsUrl).catch(() =>
        Alert.alert("Cannot open map", "Google Maps could not be opened on this device.")
      );
    return (
      <Pressable
        onPress={openMap}
        style={{ position: "relative" }}
        accessibilityRole="button"
        accessibilityLabel="Open location in Google Maps"
      >
        <Image
          source={{ uri: `https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lng}&zoom=15&size=320x130&markers=${lat},${lng},red-pushpin` }}
          style={{ width: "100%", height: 130 }}
          contentFit="cover"
          onError={() => setMapThumbError(true)}
          accessibilityLabel="Store location map"
        />
        <View style={{ position: "absolute", top: 8, right: 8, backgroundColor: "rgba(0,0,0,0.45)", borderRadius: 6, padding: 4 }}>
          <Ionicons name="expand-outline" size={16} color="#fff" />
        </View>
      </Pressable>
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
      <LinearGradient colors={["#0B1E3D", "#142F5E"]} style={[styles.header, { paddingTop: topInset + 16 }]}>
        <Pressable onPress={handleAvatarPress} style={styles.avatarWrapper} disabled={pickingImage}>
          {vendorImage ? (
            <Image source={{ uri: vendorImage }} style={styles.avatarImage} contentFit="cover" accessibilityLabel="Vendor profile photo" />
          ) : (
            <View style={styles.avatar}>
              <Ionicons name={isManpower ? "people" : "storefront"} size={32} color="#FFF" />
            </View>
          )}
          <View style={styles.cameraOverlay}>
            {pickingImage ? (
              <ActivityIndicator size={12} color="#FFF" />
            ) : (
              <Ionicons name="camera" size={12} color="#FFF" />
            )}
          </View>
        </Pressable>
        <Text style={styles.name}>{storeName}</Text>
        <Text style={styles.phone}>{vendorApp?.phone || user?.phone}</Text>
        <View style={styles.badge}>
          <Ionicons name="shield-checkmark" size={14} color={Colors.success} />
          <Text style={styles.badgeText}>{isManpower ? "Verified Agency" : "Verified Vendor"}</Text>
        </View>
      </LinearGradient>

      <View style={styles.menuCard}>
        {menuItems.map((item, i) => (
          <Pressable key={item.label} style={[styles.menuItem, i < menuItems.length - 1 && styles.menuBorder]} onPress={item.action}>
            <View style={styles.menuLeft}>
              <View style={styles.menuIconBg}>
                <Ionicons name={item.icon as any} size={20} color={Colors.primary} />
              </View>
              <Text style={styles.menuLabel}>{item.label}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.textLight} />
          </Pressable>
        ))}
      </View>

      <View style={styles.legalCard}>
        <Pressable style={[styles.menuItem, styles.menuBorder]} onPress={() => router.push("/terms" as any)}>
          <View style={styles.menuLeft}>
            <View style={styles.menuIconBg}>
              <Ionicons name="document-text" size={20} color={Colors.primary} />
            </View>
            <Text style={styles.menuLabel}>Terms & Conditions</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={Colors.textLight} />
        </Pressable>
        <Pressable style={[styles.menuItem, styles.menuBorder]} onPress={() => router.push("/privacy" as any)}>
          <View style={styles.menuLeft}>
            <View style={styles.menuIconBg}>
              <Ionicons name="shield-checkmark" size={20} color={Colors.primary} />
            </View>
            <Text style={styles.menuLabel}>Privacy Policy</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={Colors.textLight} />
        </Pressable>
        <Pressable style={styles.menuItem} onPress={() => router.push("/about" as any)}>
          <View style={styles.menuLeft}>
            <View style={styles.menuIconBg}>
              <Ionicons name="information-circle" size={20} color={Colors.primary} />
            </View>
            <Text style={styles.menuLabel}>About Go Bharat</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={Colors.textLight} />
        </Pressable>
      </View>

      <Pressable
        style={styles.logoutBtn}
        onPress={() => {
          try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); } catch {}
          setShowLogoutModal(true);
        }}
      >
        <Ionicons name="log-out-outline" size={20} color={Colors.error} />
        <Text style={styles.logoutText}>Log Out</Text>
      </Pressable>

      <Pressable style={styles.deleteAccountButton} onPress={() => setShowDeleteModal(true)}>
        <Ionicons name="trash-outline" size={18} color="#DC2626" />
        <Text style={styles.deleteAccountText}>Delete Account</Text>
      </Pressable>

      <Modal visible={showLogoutModal} transparent animationType="fade" onRequestClose={() => setShowLogoutModal(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: 24 }}>
          <View style={{ backgroundColor: "#FFF", borderRadius: 20, padding: 28, alignItems: "center", width: "100%", maxWidth: 340 }}>
            <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.error + "15", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
              <Ionicons name="log-out-outline" size={28} color={Colors.error} />
            </View>
            <Text style={{ fontFamily: "Poppins_600SemiBold", fontSize: 18, color: Colors.text, marginBottom: 6 }}>Log Out</Text>
            <Text style={{ fontFamily: "Poppins_400Regular", fontSize: 14, color: Colors.textLight, textAlign: "center", marginBottom: 20 }}>Are you sure you want to log out of your account?</Text>
            <View style={{ flexDirection: "row", gap: 12, width: "100%" }}>
              <Pressable style={{ flex: 1, paddingVertical: 13, borderRadius: 12, backgroundColor: Colors.backgroundLight, alignItems: "center" }} onPress={() => setShowLogoutModal(false)}>
                <Text style={{ fontFamily: "Poppins_600SemiBold", fontSize: 15, color: Colors.text }}>Cancel</Text>
              </Pressable>
              <Pressable style={{ flex: 1, paddingVertical: 13, borderRadius: 12, backgroundColor: Colors.error, alignItems: "center" }} onPress={() => { logout(); setShowLogoutModal(false); setTimeout(() => { router.replace("/auth" as any); }, 300); }}>
                <Text style={{ fontFamily: "Poppins_600SemiBold", fontSize: 15, color: "#FFF" }}>Log Out</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Store Details Modal */}
      <Modal
        visible={activeModal === "store"}
        transparent
        animationType="fade"
        onRequestClose={() => setActiveModal(null)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setActiveModal(null)}>
          <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Store Details</Text>
              <Pressable onPress={() => setActiveModal(null)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </Pressable>
            </View>

            <View style={styles.detailRow}>
              <Ionicons name="storefront-outline" size={20} color={Colors.primary} />
              <View style={styles.detailContent}>
                <Text style={styles.detailLabel}>Store Name</Text>
                <Text style={styles.detailValue}>{storeName}</Text>
              </View>
            </View>

            <View style={styles.detailRow}>
              <Ionicons name="call-outline" size={20} color={Colors.primary} />
              <View style={styles.detailContent}>
                <Text style={styles.detailLabel}>Phone</Text>
                <Text style={styles.detailValue}>{vendorApp?.phone || user?.phone || "-"}</Text>
              </View>
            </View>

            {storeEmail && (
              <View style={styles.detailRow}>
                <Ionicons name="mail-outline" size={20} color={Colors.primary} />
                <View style={styles.detailContent}>
                  <Text style={styles.detailLabel}>Email</Text>
                  <Text style={styles.detailValue}>{storeEmail}</Text>
                </View>
              </View>
            )}

            {vendorApp?.address ? (
              <View style={styles.detailRow}>
                <Ionicons name="location-outline" size={20} color={Colors.primary} />
                <View style={styles.detailContent}>
                  <Text style={styles.detailLabel}>Address</Text>
                  <Text style={styles.detailValue}>{vendorApp.address}{vendorApp.city ? `, ${vendorApp.city}` : ""}</Text>
                </View>
              </View>
            ) : null}

            <View style={styles.detailRow}>
              <Ionicons name="shield-checkmark-outline" size={20} color={Colors.success} />
              <View style={styles.detailContent}>
                <Text style={styles.detailLabel}>Status</Text>
                <Text style={[styles.detailValue, { color: Colors.success }]}>{vendorApp?.status === "LIVE" ? "Live" : "Verified"}</Text>
              </View>
            </View>

            <View style={styles.divider} />

            {commissionRate !== null && (
              <View style={styles.detailRow}>
                <Ionicons name="pricetag-outline" size={20} color={Colors.primary} />
                <View style={styles.detailContent}>
                  <Text style={styles.detailLabel}>Commission Rate</Text>
                  <Text style={styles.detailValue}>{commissionRate}%</Text>
                </View>
              </View>
            )}

            {storeRating !== null && (
              <View style={styles.detailRow}>
                <Ionicons name="star-outline" size={20} color={Colors.primary} />
                <View style={styles.detailContent}>
                  <Text style={styles.detailLabel}>Store Rating</Text>
                  <Text style={styles.detailValue}>{storeRating} ★</Text>
                </View>
              </View>
            )}

            {storeCategory && (
              <View style={styles.detailRow}>
                <Ionicons name="list-outline" size={20} color={Colors.primary} />
                <View style={styles.detailContent}>
                  <Text style={styles.detailLabel}>Category</Text>
                  <Text style={styles.detailValue}>{storeCategory.name}</Text>
                </View>
              </View>
            )}

            {isCodEligible && (
              <>
                <View style={styles.divider} />
                <View style={styles.detailRow}>
                  <Ionicons name="cash-outline" size={20} color={codEnabled ? Colors.success : Colors.textSecondary} />
                  <View style={[styles.detailContent, { flex: 1 }]}>
                    <Text style={styles.detailLabel}>Cash on Delivery</Text>
                    <Text style={[styles.detailValue, { color: codEnabled ? Colors.success : Colors.textSecondary, fontSize: 12 }]}>
                      {codEnabled ? "Customers can pay in cash" : "COD disabled for your store"}
                    </Text>
                  </View>
                  <Switch
                    value={codEnabled}
                    onValueChange={(val) => {
                      try { Haptics.selectionAsync(); } catch {}
                      updateVendorCod(codVendorKey, val);
                    }}
                    trackColor={{ false: "#E5E7EB", true: Colors.success + "60" }}
                    thumbColor={codEnabled ? Colors.success : "#9CA3AF"}
                  />
                </View>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Payout Details Modal */}
      <Modal
        visible={activeModal === "payout"}
        transparent
        animationType="fade"
        onRequestClose={() => setActiveModal(null)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setActiveModal(null)}>
          <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Payout Details</Text>
              <Pressable onPress={() => setActiveModal(null)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </Pressable>
            </View>

            <View style={styles.detailRow}>
              <Ionicons name="card-outline" size={20} color={Colors.primary} />
              <View style={styles.detailContent}>
                <Text style={styles.detailLabel}>Bank Account</Text>
                <Text style={styles.detailValue}>HDFC Bank ****4521</Text>
              </View>
            </View>

            <View style={styles.detailRow}>
              <Ionicons name="key-outline" size={20} color={Colors.primary} />
              <View style={styles.detailContent}>
                <Text style={styles.detailLabel}>IFSC Code</Text>
                <Text style={styles.detailValue}>HDFC0001234</Text>
              </View>
            </View>

            <View style={styles.detailRow}>
              <Ionicons name="phone-portrait-outline" size={20} color={Colors.primary} />
              <View style={styles.detailContent}>
                <Text style={styles.detailLabel}>UPI</Text>
                <Text style={styles.detailValue}>vendor@upi</Text>
              </View>
            </View>

            <View style={styles.divider} />

            <View style={styles.detailRow}>
              <Ionicons name="calendar-outline" size={20} color={Colors.primary} />
              <View style={styles.detailContent}>
                <Text style={styles.detailLabel}>Next Payout</Text>
                <Text style={styles.detailValue}>15th of month</Text>
              </View>
            </View>

            <View style={styles.detailRow}>
              <Ionicons name="wallet-outline" size={20} color={Colors.primary} />
              <View style={styles.detailContent}>
                <Text style={styles.detailLabel}>Pending Amount</Text>
                <Text style={[styles.detailValue, { color: Colors.primary, fontFamily: "Poppins_700Bold" }]}>₹12,450</Text>
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Payment QR Modal */}
      <Modal
        visible={activeModal === "paymentQr"}
        transparent
        animationType="fade"
        onRequestClose={() => setActiveModal(null)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setActiveModal(null)}>
          <Pressable style={[styles.modalContent, { padding: 0 }]} onPress={(e) => e.stopPropagation()}>
            <View style={[styles.modalHeader, { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12 }]}>
              <Text style={styles.modalTitle}>Payment QR Code</Text>
              <Pressable onPress={() => setActiveModal(null)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </Pressable>
            </View>
            <ScrollView style={{ maxHeight: 480 }} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

              {/* ── Section 1: UPI ID ── */}
              <Text style={{ fontFamily: "Poppins_500Medium", fontSize: 13, color: Colors.text, marginBottom: 6 }}>Option 1 — Enter UPI ID</Text>
              <Text style={{ fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary, marginBottom: 10, lineHeight: 18 }}>
                A QR code is auto-generated from your UPI ID. Easiest option.
              </Text>

              {matchedVendor?.upiId ? (
                <View style={{ alignItems: "center", marginBottom: 12 }}>
                  <Image
                    source={{ uri: `https://quickchart.io/qr?text=${encodeURIComponent(`upi://pay?pa=${matchedVendor.upiId}&pn=${encodeURIComponent(matchedVendor.name || "")}&cu=INR`)}&size=200&margin=2` }}
                    style={{ width: 160, height: 160, borderRadius: 10, borderWidth: 1, borderColor: "#E5E7EB", backgroundColor: "#FFF" }}
                    contentFit="contain"
                  />
                  <View style={{ flexDirection: "row", alignItems: "center", marginTop: 6 }}>
                    <Ionicons name="checkmark-circle" size={15} color={Colors.success} />
                    <Text style={{ marginLeft: 5, fontFamily: "Poppins_500Medium", fontSize: 12, color: Colors.success }}>QR is live for customers</Text>
                  </View>
                  <Text style={{ marginTop: 3, fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textSecondary }}>{matchedVendor.upiId}</Text>
                </View>
              ) : null}

              <TextInput
                value={upiIdInput}
                onChangeText={setUpiIdInput}
                placeholder="e.g. yourname@ybl or 9876543210@paytm"
                placeholderTextColor={Colors.textSecondary}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                style={{ borderWidth: 1, borderColor: "#D1D5DB", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontFamily: "Poppins_400Regular", fontSize: 14, color: Colors.text, backgroundColor: "#F9FAFB", marginBottom: 6 }}
              />
              <Text style={{ fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textSecondary, marginBottom: 12 }}>
                Find your UPI ID in Google Pay, PhonePe, Paytm or your banking app.
              </Text>

              {savingUpiId ? (
                <View style={{ alignItems: "center", paddingVertical: 10 }}>
                  <ActivityIndicator color={Colors.primary} size="small" />
                  <Text style={{ marginTop: 4, fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary }}>Saving…</Text>
                </View>
              ) : (
                <View style={{ gap: 8, marginBottom: 4 }}>
                  <Pressable
                    onPress={async () => {
                      const trimmed = upiIdInput.trim().toLowerCase();
                      if (!trimmed) { Alert.alert("Error", "Please enter your UPI ID."); return; }
                      if (!trimmed.includes("@")) { Alert.alert("Invalid UPI ID", "UPI ID must contain '@', e.g. name@upi or 9876543210@ybl"); return; }
                      setSavingUpiId(true);
                      const ok = await updateVendorUpiId(trimmed);
                      setSavingUpiId(false);
                      if (ok) {
                        try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
                        setActiveModal(null);
                      } else { Alert.alert("Error", "Failed to save UPI ID. Please try again."); }
                    }}
                    style={{ backgroundColor: Colors.primary, borderRadius: 12, paddingVertical: 12, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8 }}
                  >
                    <Ionicons name="save-outline" size={17} color="#FFF" />
                    <Text style={{ color: "#FFF", fontFamily: "Poppins_600SemiBold", fontSize: 14 }}>Save UPI ID</Text>
                  </Pressable>
                  {matchedVendor?.upiId ? (
                    <Pressable
                      onPress={() => Alert.alert("Remove UPI ID", "Remove your UPI ID? Customers will no longer see the QR pay option.", [
                        { text: "Cancel", style: "cancel" },
                        { text: "Remove", style: "destructive", onPress: async () => {
                          setSavingUpiId(true);
                          const ok = await updateVendorUpiId("");
                          setSavingUpiId(false);
                          if (ok) { setUpiIdInput(""); setActiveModal(null); }
                          else Alert.alert("Error", "Failed to remove UPI ID.");
                        }},
                      ])}
                      style={{ borderWidth: 1, borderColor: Colors.error, borderRadius: 12, paddingVertical: 12, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8 }}
                    >
                      <Ionicons name="trash-outline" size={17} color={Colors.error} />
                      <Text style={{ color: Colors.error, fontFamily: "Poppins_600SemiBold", fontSize: 14 }}>Remove UPI ID</Text>
                    </Pressable>
                  ) : null}
                </View>
              )}

              {/* ── Divider ── */}
              <View style={{ flexDirection: "row", alignItems: "center", marginVertical: 18 }}>
                <View style={{ flex: 1, height: 1, backgroundColor: "#E5E7EB" }} />
                <Text style={{ marginHorizontal: 12, fontFamily: "Poppins_500Medium", fontSize: 12, color: Colors.textSecondary }}>OR</Text>
                <View style={{ flex: 1, height: 1, backgroundColor: "#E5E7EB" }} />
              </View>

              {/* ── Section 2: Upload QR Image ── */}
              <Text style={{ fontFamily: "Poppins_500Medium", fontSize: 13, color: Colors.text, marginBottom: 6 }}>Option 2 — Upload QR Image</Text>
              <Text style={{ fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary, marginBottom: 12, lineHeight: 18 }}>
                Take a photo or upload an image of your UPI QR code from your bank app.
              </Text>

              {/* Existing uploaded QR preview — only show when an actual image was uploaded */}
              {matchedVendor?.hasPaymentQrImage ? (
                <View style={{ alignItems: "center", marginBottom: 12 }}>
                  <Image
                    source={{ uri: `${getApiUrl()}/api/vendors/${matchedVendor.id}/payment-qr?v=${qrCacheBust}` }}
                    style={{ width: 160, height: 160, borderRadius: 10, borderWidth: 1, borderColor: "#E5E7EB", backgroundColor: "#F9FAFB" }}
                    contentFit="contain"
                  />
                  <View style={{ flexDirection: "row", alignItems: "center", marginTop: 6 }}>
                    <Ionicons name="checkmark-circle" size={15} color={Colors.success} />
                    <Text style={{ marginLeft: 5, fontFamily: "Poppins_500Medium", fontSize: 12, color: Colors.success }}>QR image uploaded</Text>
                  </View>
                </View>
              ) : null}

              {pickingQr ? (
                <View style={{ alignItems: "center", paddingVertical: 16 }}>
                  <ActivityIndicator color={Colors.primary} size="small" />
                  <Text style={{ marginTop: 6, fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary }}>Uploading QR…</Text>
                </View>
              ) : (
                <View style={{ gap: 8 }}>
                  {Platform.OS !== "web" && (
                    <Pressable
                      onPress={() => handlePickQr(true)}
                      style={{ borderWidth: 1.5, borderColor: Colors.primary, borderRadius: 12, paddingVertical: 12, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8 }}
                    >
                      <Ionicons name="camera-outline" size={18} color={Colors.primary} />
                      <Text style={{ color: Colors.primary, fontFamily: "Poppins_600SemiBold", fontSize: 14 }}>Take Photo of QR</Text>
                    </Pressable>
                  )}
                  {Platform.OS !== "web" ? (
                    <Pressable
                      onPress={() => handlePickQr(false)}
                      style={{ borderWidth: 1.5, borderColor: Colors.primary, borderRadius: 12, paddingVertical: 12, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8 }}
                    >
                      <Ionicons name="image-outline" size={18} color={Colors.primary} />
                      <Text style={{ color: Colors.primary, fontFamily: "Poppins_600SemiBold", fontSize: 14 }}>{matchedVendor?.hasPaymentQrImage ? "Replace QR Image" : "Upload from Gallery"}</Text>
                    </Pressable>
                  ) : (
                    <View style={{ position: "relative", borderWidth: 1.5, borderColor: Colors.primary, borderRadius: 12 }}>
                      <View style={{ paddingVertical: 12, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8, pointerEvents: "none" }}>
                        <Ionicons name="cloud-upload-outline" size={18} color={Colors.primary} />
                        <Text style={{ color: Colors.primary, fontFamily: "Poppins_600SemiBold", fontSize: 14 }}>{matchedVendor?.hasPaymentQrImage ? "Replace QR Image" : "Upload QR Image"}</Text>
                      </View>
                      {/* Invisible file input on web */}
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleWebFileSelected(f); }}
                        style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", opacity: 0, cursor: "pointer" } as any}
                      />
                    </View>
                  )}
                  {matchedVendor?.hasPaymentQrImage ? (
                    <Pressable
                      onPress={() => Alert.alert("Remove QR Image", "Remove the uploaded QR image?", [
                        { text: "Cancel", style: "cancel" },
                        { text: "Remove", style: "destructive", onPress: async () => {
                          const ok = await removeVendorPaymentQr();
                          if (ok) { setQrCacheBust(Date.now()); setActiveModal(null); }
                          else Alert.alert("Error", "Failed to remove QR.");
                        }},
                      ])}
                      style={{ borderWidth: 1, borderColor: Colors.error, borderRadius: 12, paddingVertical: 12, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8 }}
                    >
                      <Ionicons name="trash-outline" size={17} color={Colors.error} />
                      <Text style={{ color: Colors.error, fontFamily: "Poppins_600SemiBold", fontSize: 14 }}>Remove QR Image</Text>
                    </Pressable>
                  ) : null}
                </View>
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Analytics Modal */}
      <Modal
        visible={activeModal === "analytics"}
        transparent
        animationType="fade"
        onRequestClose={() => setActiveModal(null)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setActiveModal(null)}>
          <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Analytics</Text>
              <Pressable onPress={() => setActiveModal(null)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </Pressable>
            </View>

            <Text style={styles.analyticsSubtitle}>This Month</Text>

            <View style={styles.detailRow}>
              <Ionicons name="bag-outline" size={20} color={Colors.primary} />
              <View style={styles.detailContent}>
                <Text style={styles.detailLabel}>Orders</Text>
                <Text style={styles.detailValue}>156</Text>
              </View>
            </View>

            <View style={styles.detailRow}>
              <Ionicons name="trending-up-outline" size={20} color={Colors.primary} />
              <View style={styles.detailContent}>
                <Text style={styles.detailLabel}>Revenue</Text>
                <Text style={[styles.detailValue, { fontFamily: "Poppins_700Bold" }]}>₹45,200</Text>
              </View>
            </View>

            <View style={styles.detailRow}>
              <Ionicons name="star-outline" size={20} color={Colors.primary} />
              <View style={styles.detailContent}>
                <Text style={styles.detailLabel}>Avg Rating</Text>
                <Text style={styles.detailValue}>4.5 ★</Text>
              </View>
            </View>

            <View style={styles.detailRow}>
              <Ionicons name="checkmark-circle-outline" size={20} color={Colors.primary} />
              <View style={styles.detailContent}>
                <Text style={styles.detailLabel}>Fulfillment Rate</Text>
                <Text style={[styles.detailValue, { color: Colors.success }]}>89%</Text>
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={showDeleteModal} transparent animationType="fade" onRequestClose={() => setShowDeleteModal(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: 24 }}>
          <View style={{ backgroundColor: "#FFF", borderRadius: 20, padding: 28, alignItems: "center", width: "100%", maxWidth: 340 }}>
            <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: "#DC262615", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
              <Ionicons name="trash-outline" size={28} color="#DC2626" />
            </View>
            <Text style={{ fontFamily: "Poppins_600SemiBold", fontSize: 18, color: Colors.text, marginBottom: 6 }}>Delete Account</Text>
            <Text style={{ fontFamily: "Poppins_400Regular", fontSize: 14, color: Colors.textLight, textAlign: "center", marginBottom: 20 }}>This will permanently delete your account and all associated data including orders, wallet balance, and saved addresses. This action cannot be undone.</Text>
            <View style={{ flexDirection: "row", gap: 12, width: "100%" }}>
              <Pressable style={{ flex: 1, paddingVertical: 13, borderRadius: 12, backgroundColor: Colors.backgroundLight, alignItems: "center" }} onPress={() => setShowDeleteModal(false)}>
                <Text style={{ fontFamily: "Poppins_600SemiBold", fontSize: 15, color: Colors.text }}>Cancel</Text>
              </Pressable>
              <Pressable style={{ flex: 1, paddingVertical: 13, borderRadius: 12, backgroundColor: "#DC2626", alignItems: "center", opacity: deletingAccount ? 0.6 : 1 }} onPress={handleDeleteAccount} disabled={deletingAccount}>
                <Text style={{ fontFamily: "Poppins_600SemiBold", fontSize: 15, color: "#FFF" }}>{deletingAccount ? "Deleting..." : "Delete"}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Shop Location Modal */}
      <Modal
        visible={activeModal === "location"}
        transparent
        animationType="fade"
        onRequestClose={() => setActiveModal(null)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setActiveModal(null)}>
          <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{isManpower ? "Agency Location" : "Shop Location"}</Text>
              <Pressable onPress={() => setActiveModal(null)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </Pressable>
            </View>

            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.textSecondary, marginBottom: 16, lineHeight: 19 }}>
              Paste any Google Maps share link — short links (maps.app.goo.gl) and full links are both supported. Your pin will preview instantly before you save.
            </Text>

            <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: Colors.textSecondary, marginBottom: 6 }}>Google Maps Link</Text>
            <View style={{ flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: resolvedCoords && locationLink ? Colors.success + "80" : resolveError && locationLink ? Colors.error + "60" : locationLink ? Colors.primary + "60" : Colors.border, borderRadius: 10, paddingHorizontal: 12, marginBottom: 10, backgroundColor: "#FAFAFA" }}>
              <Ionicons name="link" size={16} color={resolvedCoords && locationLink ? Colors.success : Colors.primary} style={{ marginRight: 8 }} />
              <TextInput
                style={{ flex: 1, fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.text, paddingVertical: 12 }}
                placeholder="Paste Google Maps share link"
                placeholderTextColor={Colors.textLight}
                value={locationLink}
                onChangeText={(t) => { setLocationSaveMsg(null); setLocationLink(t); }}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {resolving && locationLink.length > 0 && (
                <ActivityIndicator size="small" color={Colors.primary} style={{ marginLeft: 6 }} />
              )}
              {!resolving && locationLink.length > 0 && (
                <Pressable onPress={() => { setLocationLink(""); setResolvedCoords(null); setResolveError(null); }}>
                  <Ionicons name="close-circle" size={18} color={Colors.textLight} />
                </Pressable>
              )}
            </View>

            {locationLink.length > 0 && !resolving && resolvedCoords && (
              <View style={{ backgroundColor: Colors.success + "12", borderRadius: 10, overflow: "hidden", marginBottom: 10, borderWidth: 1, borderColor: Colors.success + "30" }}>
                {renderMapThumbnail(resolvedCoords.lat, resolvedCoords.lng)}
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 10 }}>
                  <Ionicons name="checkmark-circle" size={18} color={Colors.success} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 12, color: Colors.success }}>Location found</Text>
                    <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textSecondary }}>
                      {resolvedCoords.lat.toFixed(5)}, {resolvedCoords.lng.toFixed(5)}
                    </Text>
                  </View>
                </View>
              </View>
            )}

            {locationLink.length > 0 && !resolving && resolveError && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: Colors.error + "10", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 10 }}>
                <Ionicons name="alert-circle" size={20} color={Colors.error} />
                <Text style={{ flex: 1, fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.error, lineHeight: 17 }}>
                  {resolveError}
                </Text>
              </View>
            )}

            {resolvedCoords && !locationLink && (
              <View style={{ backgroundColor: Colors.primary + "10", borderRadius: 10, overflow: "hidden", marginBottom: 10, borderWidth: 1, borderColor: Colors.primary + "30" }}>
                {renderMapThumbnail(resolvedCoords.lat, resolvedCoords.lng)}
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 10 }}>
                  <Ionicons name="navigate" size={18} color={Colors.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 12, color: Colors.primary }}>GPS location ready</Text>
                    <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textSecondary }}>
                      {resolvedCoords.lat.toFixed(5)}, {resolvedCoords.lng.toFixed(5)}
                    </Text>
                  </View>
                  <Ionicons name="checkmark-circle" size={18} color={Colors.primary} />
                </View>
              </View>
            )}

            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 14 }}>
              <View style={{ flex: 1, height: 1, backgroundColor: Colors.border }} />
              <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textLight, marginHorizontal: 10 }}>or</Text>
              <View style={{ flex: 1, height: 1, backgroundColor: Colors.border }} />
            </View>

            <Pressable
              style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1, borderColor: Colors.primary + "40", borderRadius: 10, paddingVertical: 12, marginBottom: 14, backgroundColor: Colors.primary + "08" }}
              onPress={handleGpsLocation}
              disabled={gettingGps || savingLocation}
            >
              {gettingGps ? <ActivityIndicator size="small" color={Colors.primary} /> : <Ionicons name="navigate" size={18} color={Colors.primary} />}
              <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 14, color: Colors.primary }}>
                {gettingGps ? "Getting GPS…" : "Use My Current Location"}
              </Text>
            </Pressable>

            {locationSaveMsg && (
              <View style={{ padding: 10, borderRadius: 8, backgroundColor: locationSaveMsg.ok ? Colors.success + "15" : Colors.error + "12", marginBottom: 14 }}>
                <Text style={{ fontFamily: "Inter_500Medium", fontSize: 13, color: locationSaveMsg.ok ? Colors.success : Colors.error }}>
                  {locationSaveMsg.text}
                </Text>
              </View>
            )}

            <Pressable
              style={{ backgroundColor: resolvedCoords ? Colors.primary : Colors.textLight, borderRadius: 12, paddingVertical: 14, alignItems: "center", opacity: (savingLocation || (locationLink.length > 0 && !resolvedCoords && !resolving) || (!locationLink.trim() && !resolvedCoords)) ? 0.5 : 1 }}
              onPress={handleSaveLocation}
              disabled={savingLocation || gettingGps || resolving || (locationLink.length > 0 && !resolvedCoords) || (!locationLink.trim() && !resolvedCoords)}
            >
              {savingLocation ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={{ fontFamily: "Poppins_700Bold", fontSize: 15, color: "#FFF" }}>Save Location</Text>}
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={activeModal === "staff"}
        transparent
        animationType="fade"
        onRequestClose={() => setActiveModal(null)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setActiveModal(null)}>
          <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Manage Staff</Text>
              <Pressable onPress={() => setActiveModal(null)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </Pressable>
            </View>

            <Text style={styles.analyticsSubtitle}>Your Team</Text>

            {[
              { name: "Rahul Sharma", role: "Counter Staff", status: "Active", since: "Jan 2026" },
              { name: "Pooja Desai", role: "Kitchen Manager", status: "Active", since: "Dec 2025" },
              { name: "Vijay Kumar", role: "Packaging", status: "Active", since: "Feb 2026" },
            ].map((staff) => (
              <View key={staff.name} style={styles.staffRow}>
                <View style={styles.staffAvatar}>
                  <Text style={styles.staffAvatarText}>{staff.name.charAt(0)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.staffName}>{staff.name}</Text>
                  <Text style={styles.staffRole}>{staff.role} - Since {staff.since}</Text>
                </View>
                <View style={[styles.staffBadge, { backgroundColor: Colors.success + "15" }]}>
                  <Text style={{ fontFamily: "Poppins_500Medium", fontSize: 10, color: Colors.success }}>{staff.status}</Text>
                </View>
              </View>
            ))}

            <View style={styles.divider} />

            <View style={styles.detailRow}>
              <Ionicons name="people-outline" size={20} color={Colors.primary} />
              <View style={styles.detailContent}>
                <Text style={styles.detailLabel}>Total Staff</Text>
                <Text style={styles.detailValue}>3 Members</Text>
              </View>
            </View>

            <View style={styles.detailRow}>
              <Ionicons name="time-outline" size={20} color={Colors.primary} />
              <View style={styles.detailContent}>
                <Text style={styles.detailLabel}>Shift Timing</Text>
                <Text style={styles.detailValue}>9:00 AM - 10:00 PM (2 shifts)</Text>
              </View>
            </View>

            <Pressable
              style={styles.addStaffBtn}
              onPress={() => {
                try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
                Alert.alert("Add Staff", "New staff member request has been sent to your franchise manager for approval.");
              }}
            >
              <Ionicons name="person-add" size={18} color="#FFF" />
              <Text style={styles.addStaffBtnText}>Request New Staff</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { alignItems: "center", paddingBottom: 28, borderBottomLeftRadius: 30, borderBottomRightRadius: 30 },
  avatarWrapper: { position: "relative" as const },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: Colors.primary },
  avatarImage: { width: 72, height: 72, borderRadius: 36, borderWidth: 2, borderColor: Colors.primary },
  cameraOverlay: { position: "absolute" as const, bottom: 0, right: 0, width: 24, height: 24, borderRadius: 12, backgroundColor: Colors.primary, alignItems: "center" as const, justifyContent: "center" as const, borderWidth: 2, borderColor: "#142F5E" },
  name: { fontFamily: "Poppins_700Bold", fontSize: 20, color: "#FFF", marginTop: 12 },
  phone: { fontFamily: "Poppins_400Regular", fontSize: 14, color: "rgba(255,255,255,0.7)", marginTop: 2 },
  badge: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 8, backgroundColor: "rgba(255,255,255,0.1)", paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
  badgeText: { fontFamily: "Poppins_500Medium", fontSize: 12, color: Colors.success },
  menuCard: { backgroundColor: "#FFF", borderRadius: 16, margin: 20, overflow: "hidden" },
  menuItem: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16 },
  menuBorder: { borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  menuLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  menuIconBg: { width: 38, height: 38, borderRadius: 10, backgroundColor: Colors.primary + "12", alignItems: "center", justifyContent: "center" },
  menuLabel: { fontFamily: "Poppins_500Medium", fontSize: 14, color: Colors.text },
  legalCard: { backgroundColor: "#FFF", borderRadius: 16, marginHorizontal: 20, marginTop: 20, overflow: "hidden" },
  logoutBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginHorizontal: 20, paddingVertical: 14, backgroundColor: Colors.error + "10", borderRadius: 14, marginTop: 10 },
  logoutText: { fontFamily: "Poppins_600SemiBold", fontSize: 15, color: Colors.error },
  deleteAccountButton: { flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "center" as const, gap: 6, marginTop: 12, marginHorizontal: 20, paddingVertical: 12 },
  deleteAccountText: { fontFamily: "Poppins_500Medium", fontSize: 13, color: "#DC2626" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalContent: { backgroundColor: "#FFF", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: "70%" },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  modalTitle: { fontFamily: "Poppins_700Bold", fontSize: 20, color: Colors.secondary },
  detailRow: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 16 },
  detailContent: { flex: 1 },
  detailLabel: { fontFamily: "Poppins_500Medium", fontSize: 12, color: Colors.textLight, marginBottom: 4 },
  detailValue: { fontFamily: "Poppins_500Medium", fontSize: 14, color: Colors.text },
  divider: { height: 1, backgroundColor: Colors.borderLight, marginVertical: 16 },
  analyticsSubtitle: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: Colors.textLight, marginBottom: 12 },
  staffRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  staffAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.primary + "15", alignItems: "center", justifyContent: "center" },
  staffAvatarText: { fontFamily: "Poppins_700Bold", fontSize: 16, color: Colors.primary },
  staffName: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: Colors.text },
  staffRole: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary, marginTop: 1 },
  staffBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  addStaffBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 14, marginTop: 16 },
  addStaffBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: "#FFF" },
});

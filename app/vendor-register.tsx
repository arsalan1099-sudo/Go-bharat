import React, { useState, useRef, useCallback, useMemo, useEffect } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, TextInput,
  Platform, Modal, Alert, KeyboardAvoidingView, ActivityIndicator, Linking
} from "react-native";
import { Image } from "expo-image";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Colors from "@/constants/colors";
import { useApp } from "@/lib/store";
import { categories, subCategories } from "@/lib/data";
import { getApiUrl, apiRequest } from "@/lib/query-client";

const DRAFT_KEY = "gobharat_vendor_self_register_draft";

const steps = [
  { id: 1, title: "Business Info", icon: "storefront-outline" },
  { id: 2, title: "Location", icon: "location-outline" },
  { id: 3, title: "Documents", icon: "document-text-outline" },
  { id: 4, title: "Photos", icon: "images-outline" },
];

export default function VendorRegisterScreen() {
  const insets = useSafeAreaInsets();
  const { user, customSubCategories } = useApp();
  const allSubCategories = [...subCategories, ...customSubCategories];
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  const [currentStep, setCurrentStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [showSubCategoryPicker, setShowSubCategoryPicker] = useState(false);
  const [fetchingLocation, setFetchingLocation] = useState(false);
  const [locationLink, setLocationLink] = useState("");
  const [resolvingLink, setResolvingLink] = useState(false);
  const [locationPermission, requestLocationPermission] = Location.useForegroundPermissions();

  const [form, setForm] = useState({
    businessName: "",
    ownerName: user?.name || "",
    phone: user?.phone || "",
    email: "",
    categoryId: "",
    subCategoryId: "",
    address: "",
    city: "",
    pinCode: "",
    latitude: 0,
    longitude: 0,
    description: "",
    gstNumber: "",
    panNumber: "",
    bankAccount: "",
    ifscCode: "",
    upiId: "",
    paymentMethods: [] as ("UPI" | "BANK_TRANSFER" | "CHEQUE")[],
    photos: [] as string[],
  });

  const isFirstRender = useRef(true);

  useEffect(() => {
    AsyncStorage.getItem(DRAFT_KEY).then((raw) => {
      if (raw) {
        try {
          const draft = JSON.parse(raw);
          if (draft.businessName?.trim()) {
            setForm((prev) => ({ ...prev, ...draft, ownerName: draft.ownerName || user?.name || "", phone: draft.phone || user?.phone || "" }));
          }
        } catch {}
      }
    });
  }, []);

  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    if (!form.businessName.trim()) return;
    const t = setTimeout(() => {
      AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(form));
    }, 800);
    return () => clearTimeout(t);
  }, [form]);

  const set = (key: keyof typeof form, val: any) => setForm((p) => ({ ...p, [key]: val }));

  const selectedCategory = categories.find((c) => c.id === form.categoryId);
  const selectedSubCategory = allSubCategories.find((s) => s.id === form.subCategoryId);
  const filteredSubCategories = useMemo(() => {
    if (!form.categoryId) return [];
    return allSubCategories.filter((s) => s.categoryId === form.categoryId);
  }, [form.categoryId, allSubCategories]);


  const togglePayment = (method: "UPI" | "BANK_TRANSFER" | "CHEQUE") => {
    setForm((p) => {
      const has = p.paymentMethods.includes(method);
      return { ...p, paymentMethods: has ? p.paymentMethods.filter((m) => m !== method) : [...p.paymentMethods, method] };
    });
  };

  const parseLocationLink = (link: string) => {
    const patterns = [
      /@(-?\d+\.?\d*),(-?\d+\.?\d*)/,
      /q=(-?\d+\.?\d*),(-?\d+\.?\d*)/,
      /!3d(-?\d+\.?\d+)!4d(-?\d+\.?\d+)/,
      /destination=(-?\d+\.?\d+),(-?\d+\.?\d+)/,
    ];
    for (const p of patterns) {
      const m = link.match(p);
      if (m) {
        const lat = parseFloat(m[1]), lng = parseFloat(m[2]);
        if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) return { lat, lng };
      }
    }
    return null;
  };

  const handlePasteLocation = async (link: string) => {
    setLocationLink(link);
    if (!link.trim()) return;
    const coords = parseLocationLink(link.trim());
    if (coords) {
      set("latitude", coords.lat);
      set("longitude", coords.lng);
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
      return;
    }
    if (link.includes("goo.gl") || link.includes("maps.app") || link.includes("google.com/maps")) {
      setResolvingLink(true);
      try {
        const res = await fetch(`${getApiUrl()}api/resolve-map-link`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: link.trim() }),
        });
        const data = await res.json();
        if (data.lat && data.lng) {
          setForm((p) => ({ ...p, latitude: data.lat, longitude: data.lng }));
          try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
        } else {
          Alert.alert("Could not extract location", "Try pasting coordinates directly like: 20.5547, 74.5247");
        }
      } catch {
        Alert.alert("Could not resolve link", "Try pasting coordinates directly.");
      } finally {
        setResolvingLink(false);
      }
    }
  };

  const handlePickLocation = async () => {
    setFetchingLocation(true);
    try {
      let lat = 0, lng = 0;
      if (Platform.OS === "web") {
        if (!navigator.geolocation) { Alert.alert("Not Supported", "Paste a Google Maps link instead."); setFetchingLocation(false); return; }
        try {
          const pos = await Promise.race<GeolocationPosition>([
            new Promise<GeolocationPosition>((res, rej) => {
              navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: false, timeout: 12000, maximumAge: 60000 });
            }),
            new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), 14000)),
          ]);
          lat = pos.coords.latitude; lng = pos.coords.longitude;
        } catch { Alert.alert("Location Failed", "Paste a Google Maps link instead."); setFetchingLocation(false); return; }
      } else {
        const perm = await Location.requestForegroundPermissionsAsync();
        if (!perm.granted) {
          if (!perm.canAskAgain) {
            Alert.alert("Permission Denied", "Enable location in settings.", [{ text: "Cancel" }, { text: "Open Settings", onPress: () => Linking.openSettings() }]);
          } else {
            Alert.alert("Permission Required", "Location permission is needed. You can also paste a Google Maps link instead.");
          }
          setFetchingLocation(false); return;
        }
        const loc = await Promise.race([
          Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
          new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), 15000)),
        ]);
        lat = loc.coords.latitude; lng = loc.coords.longitude;
      }
      setForm((p) => ({ ...p, latitude: lat, longitude: lng }));
      try {
        const geo = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
        const place = geo[0];
        if (place) {
          setForm((p) => ({
            ...p,
            address: [place.name, place.street, place.district].filter(Boolean).join(", "),
            city: place.city || place.subregion || place.region || "",
            latitude: lat, longitude: lng,
          }));
        }
      } catch {}
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
    } catch {
      Alert.alert("Error", "Could not get location. Paste a Google Maps link instead.");
    }
    setFetchingLocation(false);
  };

  const handlePickPhotos = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        selectionLimit: 5 - form.photos.length,
        quality: 0.5,
        base64: true,
      });
      if (!result.canceled && result.assets) {
        const newPhotos = result.assets.map((a) => a.base64 ? `data:image/jpeg;base64,${a.base64}` : a.uri);
        setForm((p) => ({ ...p, photos: [...p.photos, ...newPhotos].slice(0, 5) }));
      }
    } catch { Alert.alert("Error", "Could not pick photos."); }
  };

  const handleTakePhoto = async () => {
    try {
      const result = await ImagePicker.launchCameraAsync({ quality: 0.5, base64: true });
      if (!result.canceled && result.assets[0]) {
        const uri = result.assets[0].base64 ? `data:image/jpeg;base64,${result.assets[0].base64}` : result.assets[0].uri;
        setForm((p) => ({ ...p, photos: [...p.photos, uri].slice(0, 5) }));
      }
    } catch { Alert.alert("Error", "Could not take photo."); }
  };

  const validateStep = (step: number): string | null => {
    if (step === 1) {
      if (!form.businessName.trim()) return "Business name is required.";
      if (!form.ownerName.trim()) return "Owner name is required.";
      if (!form.phone.trim() || form.phone.replace(/\D/g, "").length < 10) return "Valid phone number is required.";
      if (!form.categoryId) return "Please select a business category.";
    }
    if (step === 2) {
      if (!form.address.trim()) return "Address is required.";
      if (!form.city.trim()) return "City is required.";
    }
    return null;
  };

  const handleNext = () => {
    const err = validateStep(currentStep);
    if (err) { Alert.alert("Required", err); return; }
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
    setCurrentStep((s) => Math.min(s + 1, steps.length));
  };

  const handleBack = () => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
    if (currentStep === 1) { router.back(); } else { setCurrentStep((s) => s - 1); }
  };

  const handleSubmit = async () => {
    const err = validateStep(currentStep);
    if (err) { Alert.alert("Required", err); return; }
    setSubmitting(true);
    try {
      const token = await AsyncStorage.getItem("gobharat_auth_token");
      const appId = "VA" + (Date.now().toString(36) + Math.random().toString(36).slice(2, 5)).slice(-6).toUpperCase();
      const res = await fetch(new URL("/api/vendor-applications", getApiUrl()).toString(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          id: appId,
          businessName: form.businessName.trim(),
          ownerName: form.ownerName.trim(),
          phone: form.phone.replace(/\s/g, ""),
          email: form.email.trim() || "",
          categoryId: form.categoryId,
          subCategoryId: form.subCategoryId || null,
          address: form.address.trim(),
          city: form.city.trim(),
          pinCode: form.pinCode.trim() || "",
          latitude: form.latitude || null,
          longitude: form.longitude || null,
          locationLink: locationLink.trim() || null,
          description: form.description.trim() || "",
          gstNumber: form.gstNumber.trim() || "",
          panNumber: form.panNumber.trim() || "",
          bankAccount: form.bankAccount.trim() || "",
          ifscCode: form.ifscCode.trim() || "",
          upiId: form.upiId.trim() || null,
          paymentMethods: form.paymentMethods,
          photos: form.photos.length > 0 ? form.photos : [],
          commissionRate: 10,
          subscriptionPlan: "MONTHLY",
          submittedBy: form.ownerName.trim(),
        }),
      });
      const data = await res.json();
      if (res.ok && (data.success || data.id)) {
        AsyncStorage.removeItem(DRAFT_KEY);
        try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
        setSubmitted(true);
      } else {
        Alert.alert("Submission Failed", data.error || "Please try again.");
      }
    } catch {
      Alert.alert("Error", "Could not submit application. Please check your connection.");
    }
    setSubmitting(false);
  };

  if (submitted) {
    return (
      <View style={[styles.container, { justifyContent: "center", alignItems: "center", padding: 32 }]}>
        <LinearGradient colors={["#10B981", "#059669"]} style={styles.successIcon}>
          <Ionicons name="checkmark" size={48} color="#FFF" />
        </LinearGradient>
        <Text style={styles.successTitle}>Application Submitted!</Text>
        <Text style={styles.successSubtitle}>Your vendor application is under review. Our team will contact you within 24–48 hours. You'll be able to log in as a vendor once approved.</Text>
        <Pressable style={styles.successBtn} onPress={() => router.back()}>
          <Text style={styles.successBtnText}>Back to App</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <LinearGradient colors={["#0B1E3D", "#142F5E"]} style={[styles.header, { paddingTop: topInset + 8 }]}>
        <View style={styles.headerRow}>
          <Pressable onPress={handleBack} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color="#FFF" />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Become a Vendor</Text>
            <Text style={styles.headerSub}>Step {currentStep} of {steps.length} — {steps[currentStep - 1].title}</Text>
          </View>
        </View>

        {/* Step progress */}
        <View style={styles.stepRow}>
          {steps.map((s, i) => (
            <React.Fragment key={s.id}>
              <View style={styles.stepItem}>
                <View style={[styles.stepDot, currentStep > s.id && styles.stepDone, currentStep === s.id && styles.stepActive]}>
                  {currentStep > s.id
                    ? <Ionicons name="checkmark" size={14} color="#FFF" />
                    : <Ionicons name={s.icon as any} size={14} color={currentStep >= s.id ? "#FFF" : "rgba(255,255,255,0.4)"} />
                  }
                </View>
                <Text style={[styles.stepLabel, currentStep >= s.id && styles.stepLabelActive]}>{s.title}</Text>
              </View>
              {i < steps.length - 1 && (
                <View style={[styles.stepLine, currentStep > s.id && styles.stepLineDone]} />
              )}
            </React.Fragment>
          ))}
        </View>
      </LinearGradient>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 20, paddingBottom: bottomInset + 100 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* STEP 1: Business Info */}
          {currentStep === 1 && (
            <View style={styles.stepContent}>
              <Text style={styles.sectionLabel}>Business Details</Text>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Business Name *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Sharma General Store"
                  placeholderTextColor={Colors.textLight}
                  value={form.businessName}
                  onChangeText={(v) => set("businessName", v)}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Owner Name *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Full name"
                  placeholderTextColor={Colors.textLight}
                  value={form.ownerName}
                  onChangeText={(v) => set("ownerName", v)}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Phone Number *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="10-digit mobile number"
                  placeholderTextColor={Colors.textLight}
                  keyboardType="phone-pad"
                  value={form.phone}
                  onChangeText={(v) => set("phone", v)}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Email (optional)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="business@email.com"
                  placeholderTextColor={Colors.textLight}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  value={form.email}
                  onChangeText={(v) => set("email", v)}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Business Category *</Text>
                <Pressable style={styles.pickerBtn} onPress={() => setShowCategoryPicker(true)}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
                    {selectedCategory && (
                      <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: selectedCategory.color + "20", alignItems: "center", justifyContent: "center" }}>
                        <Ionicons name={selectedCategory.icon as any} size={16} color={selectedCategory.color} />
                      </View>
                    )}
                    <Text style={[styles.pickerText, !selectedCategory && { color: Colors.textLight }]}>
                      {selectedCategory ? selectedCategory.name : "Select category"}
                    </Text>
                  </View>
                  <Ionicons name="chevron-down" size={20} color={Colors.textSecondary} />
                </Pressable>

                {showCategoryPicker && (
                  <View style={styles.categoryGrid}>
                    {categories.map((cat) => (
                      <Pressable
                        key={cat.id}
                        style={[styles.categoryChip, form.categoryId === cat.id && { backgroundColor: Colors.primary, borderColor: Colors.primary }]}
                        onPress={() => {
                          set("categoryId", cat.id);
                          set("subCategoryId", "");
                          setShowCategoryPicker(false);
                          setShowSubCategoryPicker(true);
                        }}
                      >
                        <Ionicons name={cat.icon as any} size={16} color={form.categoryId === cat.id ? "#FFF" : cat.color} />
                        <Text style={[styles.categoryChipText, form.categoryId === cat.id && { color: "#FFF" }]}>{cat.name}</Text>
                      </Pressable>
                    ))}
                  </View>
                )}

                {form.categoryId && filteredSubCategories.length > 0 && (
                  <Pressable style={[styles.pickerBtn, { marginTop: 8 }]} onPress={() => setShowSubCategoryPicker(!showSubCategoryPicker)}>
                    <Ionicons name="layers-outline" size={18} color={selectedSubCategory ? Colors.primary : Colors.textLight} style={{ marginRight: 4 }} />
                    <Text style={[styles.pickerText, { flex: 1 }, !selectedSubCategory && { color: Colors.textLight }]}>
                      {selectedSubCategory ? selectedSubCategory.name : "Select Sub-Category (optional)"}
                    </Text>
                    <Ionicons name={showSubCategoryPicker ? "chevron-up" : "chevron-down"} size={18} color={Colors.textSecondary} />
                  </Pressable>
                )}

                {showSubCategoryPicker && filteredSubCategories.length > 0 && (
                  <ScrollView style={styles.subCategoryList} nestedScrollEnabled>
                    {filteredSubCategories.map((sc) => (
                      <Pressable
                        key={sc.id}
                        style={[styles.subCategoryItem, form.subCategoryId === sc.id && { backgroundColor: Colors.primary + "15", borderColor: Colors.primary }]}
                        onPress={() => { set("subCategoryId", sc.id); setShowSubCategoryPicker(false); }}
                      >
                        <Ionicons name={sc.icon as any} size={16} color={form.subCategoryId === sc.id ? Colors.primary : Colors.textSecondary} />
                        <Text style={[styles.subCategoryItemText, form.subCategoryId === sc.id && { color: Colors.primary }]}>{sc.name}</Text>
                        {form.subCategoryId === sc.id && <Ionicons name="checkmark-circle" size={16} color={Colors.primary} />}
                      </Pressable>
                    ))}
                  </ScrollView>
                )}
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Business Description (optional)</Text>
                <TextInput
                  style={[styles.input, { height: 80, textAlignVertical: "top" }]}
                  placeholder="Tell us about your business..."
                  placeholderTextColor={Colors.textLight}
                  multiline
                  value={form.description}
                  onChangeText={(v) => set("description", v)}
                />
              </View>

              <Text style={styles.sectionLabel}>Payment Methods</Text>
              <View style={styles.paymentRow}>
                {(["UPI", "BANK_TRANSFER", "CHEQUE"] as const).map((m) => {
                  const labels: Record<string, string> = { UPI: "UPI", BANK_TRANSFER: "Bank", CHEQUE: "Cheque" };
                  const icons: Record<string, string> = { UPI: "phone-portrait-outline", BANK_TRANSFER: "business-outline", CHEQUE: "document-outline" };
                  const selected = form.paymentMethods.includes(m);
                  return (
                    <Pressable key={m} style={[styles.payChip, selected && styles.payChipSelected]} onPress={() => togglePayment(m)}>
                      <Ionicons name={icons[m] as any} size={16} color={selected ? "#FFF" : Colors.textSecondary} />
                      <Text style={[styles.payChipText, selected && { color: "#FFF" }]}>{labels[m]}</Text>
                    </Pressable>
                  );
                })}
              </View>

              {form.paymentMethods.includes("UPI") && (
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>UPI ID</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="yourname@upi"
                    placeholderTextColor={Colors.textLight}
                    autoCapitalize="none"
                    value={form.upiId}
                    onChangeText={(v) => set("upiId", v)}
                  />
                </View>
              )}
            </View>
          )}

          {/* STEP 2: Location */}
          {currentStep === 2 && (
            <View style={styles.stepContent}>
              <Text style={styles.sectionLabel}>Business Location</Text>

              <View style={styles.locationButtons}>
                <Pressable style={styles.locationBtn} onPress={handlePickLocation} disabled={fetchingLocation}>
                  {fetchingLocation
                    ? <ActivityIndicator size="small" color={Colors.primary} />
                    : <Ionicons name="locate" size={20} color={Colors.primary} />
                  }
                  <Text style={styles.locationBtnText}>{fetchingLocation ? "Getting location..." : "Use My Location"}</Text>
                </Pressable>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Or paste Google Maps link</Text>
                <TextInput
                  style={styles.input}
                  placeholder="https://maps.google.com/..."
                  placeholderTextColor={Colors.textLight}
                  value={locationLink}
                  onChangeText={handlePasteLocation}
                  autoCapitalize="none"
                />
                {resolvingLink && <ActivityIndicator style={{ marginTop: 8 }} color={Colors.primary} />}
              </View>

              {(form.latitude !== 0 || form.longitude !== 0) && (
                <View style={styles.coordBox}>
                  <Ionicons name="checkmark-circle" size={18} color={Colors.success} />
                  <Text style={styles.coordText}>Location set: {form.latitude.toFixed(4)}, {form.longitude.toFixed(4)}</Text>
                </View>
              )}

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Shop Address *</Text>
                <TextInput
                  style={[styles.input, { height: 72, textAlignVertical: "top" }]}
                  placeholder="Full address with street, area"
                  placeholderTextColor={Colors.textLight}
                  multiline
                  value={form.address}
                  onChangeText={(v) => set("address", v)}
                />
              </View>

              <View style={{ flexDirection: "row", gap: 10 }}>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.inputLabel}>City *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="City"
                    placeholderTextColor={Colors.textLight}
                    value={form.city}
                    onChangeText={(v) => set("city", v)}
                  />
                </View>
                <View style={[styles.inputGroup, { width: 110 }]}>
                  <Text style={styles.inputLabel}>PIN Code</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="000000"
                    placeholderTextColor={Colors.textLight}
                    keyboardType="number-pad"
                    maxLength={6}
                    value={form.pinCode}
                    onChangeText={(v) => set("pinCode", v)}
                  />
                </View>
              </View>
            </View>
          )}

          {/* STEP 3: Documents */}
          {currentStep === 3 && (
            <View style={styles.stepContent}>
              <View style={styles.infoBox}>
                <Ionicons name="information-circle-outline" size={18} color={Colors.info} />
                <Text style={styles.infoText}>All document fields are optional but help speed up verification.</Text>
              </View>

              <Text style={styles.sectionLabel}>Business Documents</Text>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>GST Number</Text>
                <TextInput
                  style={styles.input}
                  placeholder="22AAAAA0000A1Z5"
                  placeholderTextColor={Colors.textLight}
                  autoCapitalize="characters"
                  value={form.gstNumber}
                  onChangeText={(v) => set("gstNumber", v.toUpperCase())}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>PAN Number</Text>
                <TextInput
                  style={styles.input}
                  placeholder="ABCDE1234F"
                  placeholderTextColor={Colors.textLight}
                  autoCapitalize="characters"
                  maxLength={10}
                  value={form.panNumber}
                  onChangeText={(v) => set("panNumber", v.toUpperCase())}
                />
              </View>

              <Text style={styles.sectionLabel}>Bank Details</Text>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Account Number</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Bank account number"
                  placeholderTextColor={Colors.textLight}
                  keyboardType="number-pad"
                  value={form.bankAccount}
                  onChangeText={(v) => set("bankAccount", v)}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>IFSC Code</Text>
                <TextInput
                  style={styles.input}
                  placeholder="SBIN0001234"
                  placeholderTextColor={Colors.textLight}
                  autoCapitalize="characters"
                  value={form.ifscCode}
                  onChangeText={(v) => set("ifscCode", v.toUpperCase())}
                />
              </View>
            </View>
          )}

          {/* STEP 4: Photos */}
          {currentStep === 4 && (
            <View style={styles.stepContent}>
              <View style={styles.infoBox}>
                <Ionicons name="images-outline" size={18} color={Colors.info} />
                <Text style={styles.infoText}>Add photos of your shop/business. This helps customers find and trust you. (Optional, up to 5)</Text>
              </View>

              <Text style={styles.sectionLabel}>Business Photos</Text>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingVertical: 8 }}>
                {form.photos.map((uri, idx) => (
                  <View key={idx} style={styles.photoThumb}>
                    <Image source={{ uri }} style={styles.photoImage} contentFit="cover" accessibilityLabel="Vendor photo" />
                    <Pressable style={styles.photoRemoveBtn} onPress={() => setForm((p) => ({ ...p, photos: p.photos.filter((_, i) => i !== idx) }))}>
                      <Ionicons name="close-circle" size={22} color={Colors.error} />
                    </Pressable>
                  </View>
                ))}
                {form.photos.length < 5 && (
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <Pressable style={styles.addPhotoBtn} onPress={handlePickPhotos}>
                      <Ionicons name="images" size={22} color={Colors.primary} />
                      <Text style={styles.addPhotoText}>Gallery</Text>
                    </Pressable>
                    <Pressable style={styles.addPhotoBtn} onPress={handleTakePhoto}>
                      <Ionicons name="camera" size={22} color={Colors.primary} />
                      <Text style={styles.addPhotoText}>Camera</Text>
                    </Pressable>
                  </View>
                )}
              </ScrollView>

              <Text style={styles.sectionLabel}>Application Summary</Text>
              <View style={styles.summaryCard}>
                <SummaryRow icon="storefront-outline" label="Business" value={form.businessName} />
                <SummaryRow icon="person-outline" label="Owner" value={form.ownerName} />
                <SummaryRow icon="call-outline" label="Phone" value={form.phone} />
                <SummaryRow icon="grid-outline" label="Category" value={selectedCategory?.name || "-"} />
                <SummaryRow icon="location-outline" label="City" value={form.city} />
                {form.photos.length > 0 && <SummaryRow icon="images-outline" label="Photos" value={`${form.photos.length} added`} />}
              </View>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Bottom Nav */}
      <View style={[styles.bottomNav, { paddingBottom: bottomInset + 12 }]}>
        <Pressable style={styles.backNavBtn} onPress={handleBack}>
          <Ionicons name="chevron-back" size={20} color={Colors.text} />
          <Text style={styles.backNavText}>{currentStep === 1 ? "Cancel" : "Back"}</Text>
        </Pressable>

        {currentStep < steps.length ? (
          <Pressable style={styles.nextBtn} onPress={handleNext}>
            <Text style={styles.nextBtnText}>Continue</Text>
            <Ionicons name="chevron-forward" size={20} color="#FFF" />
          </Pressable>
        ) : (
          <Pressable style={[styles.nextBtn, { backgroundColor: "#10B981" }]} onPress={handleSubmit} disabled={submitting}>
            {submitting
              ? <ActivityIndicator color="#FFF" />
              : <>
                  <Ionicons name="paper-plane" size={18} color="#FFF" />
                  <Text style={styles.nextBtnText}>Submit Application</Text>
                </>
            }
          </Pressable>
        )}
      </View>
    </View>
  );
}

function SummaryRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  if (!value) return null;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.borderLight }}>
      <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: Colors.primary + "12", alignItems: "center", justifyContent: "center" }}>
        <Ionicons name={icon as any} size={15} color={Colors.primary} />
      </View>
      <Text style={{ fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary, width: 70 }}>{label}</Text>
      <Text style={{ fontFamily: "Poppins_500Medium", fontSize: 13, color: Colors.text, flex: 1 }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { paddingHorizontal: 20, paddingBottom: 20 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 20 },
  backBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
  headerTitle: { fontFamily: "Poppins_700Bold", fontSize: 18, color: "#FFF" },
  headerSub: { fontFamily: "Poppins_400Regular", fontSize: 12, color: "rgba(255,255,255,0.7)" },
  stepRow: { flexDirection: "row", alignItems: "center" },
  stepItem: { alignItems: "center", gap: 4 },
  stepDot: { width: 32, height: 32, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
  stepActive: { backgroundColor: Colors.primary },
  stepDone: { backgroundColor: "#10B981" },
  stepLabel: { fontFamily: "Poppins_400Regular", fontSize: 9, color: "rgba(255,255,255,0.4)", textAlign: "center" },
  stepLabelActive: { color: "#FFF" },
  stepLine: { flex: 1, height: 2, backgroundColor: "rgba(255,255,255,0.15)", marginBottom: 14, marginHorizontal: 2 },
  stepLineDone: { backgroundColor: "#10B981" },
  stepContent: { gap: 4 },
  sectionLabel: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: Colors.textSecondary, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 12, marginBottom: 8 },
  inputGroup: { marginBottom: 12 },
  inputLabel: { fontFamily: "Poppins_500Medium", fontSize: 13, color: Colors.text, marginBottom: 6 },
  input: { backgroundColor: "#FFF", borderWidth: 1, borderColor: Colors.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontFamily: "Poppins_400Regular", fontSize: 14, color: Colors.text },
  pickerBtn: { flexDirection: "row", alignItems: "center", backgroundColor: "#FFF", borderWidth: 1, borderColor: Colors.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 },
  pickerText: { fontFamily: "Poppins_400Regular", fontSize: 14, color: Colors.text, flex: 1 },
  categoryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  categoryChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, backgroundColor: "#FFF" },
  categoryChipText: { fontFamily: "Poppins_500Medium", fontSize: 12, color: Colors.text },
  subCategoryList: { maxHeight: 180, marginTop: 8, backgroundColor: "#FFF", borderRadius: 12, borderWidth: 1, borderColor: Colors.border },
  subCategoryItem: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderBottomWidth: 1, borderBottomColor: Colors.borderLight, borderWidth: 1, borderColor: "transparent", borderRadius: 0 },
  subCategoryItemText: { fontFamily: "Poppins_400Regular", fontSize: 13, color: Colors.text, flex: 1 },
  locationButtons: { flexDirection: "row", gap: 10, marginBottom: 12 },
  locationBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 13, borderRadius: 12, backgroundColor: Colors.primary + "12", borderWidth: 1, borderColor: Colors.primary + "40" },
  locationBtnText: { fontFamily: "Poppins_500Medium", fontSize: 13, color: Colors.primary },
  paymentRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  payChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, backgroundColor: "#FFF" },
  payChipSelected: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  payChipText: { fontFamily: "Poppins_500Medium", fontSize: 13, color: Colors.textSecondary },
  coordBox: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: Colors.success + "12", borderRadius: 10, padding: 10, marginBottom: 12 },
  coordText: { fontFamily: "Poppins_500Medium", fontSize: 12, color: Colors.success },
  infoBox: { flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: Colors.info + "12", borderRadius: 12, padding: 12, marginBottom: 8 },
  infoText: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.info, flex: 1, lineHeight: 18 },
  photoThumb: { width: 90, height: 90, borderRadius: 12, overflow: "hidden", position: "relative" },
  photoImage: { width: 90, height: 90 },
  photoRemoveBtn: { position: "absolute", top: 2, right: 2 },
  addPhotoBtn: { width: 90, height: 90, borderRadius: 12, borderWidth: 1.5, borderColor: Colors.primary, borderStyle: "dashed", alignItems: "center", justifyContent: "center", gap: 4, backgroundColor: Colors.primary + "08" },
  addPhotoText: { fontFamily: "Poppins_500Medium", fontSize: 11, color: Colors.primary },
  summaryCard: { backgroundColor: "#FFF", borderRadius: 16, padding: 16 },
  bottomNav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 12, backgroundColor: "#FFF", borderTopWidth: 1, borderTopColor: Colors.borderLight },
  backNavBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, backgroundColor: Colors.background },
  backNavText: { fontFamily: "Poppins_500Medium", fontSize: 15, color: Colors.text },
  nextBtn: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 12, paddingHorizontal: 24, borderRadius: 12, backgroundColor: Colors.primary },
  nextBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 15, color: "#FFF" },
  successIcon: { width: 96, height: 96, borderRadius: 48, alignItems: "center", justifyContent: "center", marginBottom: 24 },
  successTitle: { fontFamily: "Poppins_700Bold", fontSize: 24, color: Colors.text, marginBottom: 12, textAlign: "center" },
  successSubtitle: { fontFamily: "Poppins_400Regular", fontSize: 14, color: Colors.textSecondary, textAlign: "center", lineHeight: 22, marginBottom: 32 },
  successBtn: { backgroundColor: Colors.primary, paddingVertical: 14, paddingHorizontal: 40, borderRadius: 14 },
  successBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 16, color: "#FFF" },
});

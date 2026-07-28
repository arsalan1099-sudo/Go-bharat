import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, Platform, Modal, Alert, KeyboardAvoidingView, ActivityIndicator, Linking, RefreshControl } from "react-native";
import { Image } from "expo-image";
import { router, useFocusEffect } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import * as ImagePicker from "expo-image-picker";
import Colors from "@/constants/colors";
import { useApp } from "@/lib/store";
import { Lead, VendorApplication } from "@/lib/types";
import { categories, subCategories } from "@/lib/data";
import { getApiUrl, apiRequest } from "@/lib/query-client";
import AsyncStorage from "@react-native-async-storage/async-storage";

const VENDOR_DRAFT_KEY = "gobharat_vendor_form_draft";

const statusColors: Record<string, string> = {
  NEW: Colors.info,
  CONTACTED: Colors.warning,
  NEGOTIATION: "#8B5CF6",
  CLOSED: Colors.success,
};

const appStatusColors: Record<string, string> = {
  PENDING: Colors.warning,
  APPROVED: Colors.info,
  REJECTED: Colors.error,
  LIVE: Colors.success,
};

const incentiveTiers = [
  { tier: "Bronze", range: "0-5 vendors", rate: 500, color: "#CD7F32", icon: "shield" as const, min: 0, max: 5 },
  { tier: "Silver", range: "6-15 vendors", rate: 750, color: "#9CA3AF", icon: "shield-half" as const, min: 6, max: 15 },
  { tier: "Gold", range: "16+ vendors", rate: 1000, color: "#F59E0B", icon: "shield-checkmark" as const, min: 16, max: 999 },
];

const incentiveRateFor = (closedCount: number) => {
  if (closedCount >= 16) return 1000;
  if (closedCount >= 6) return 750;
  return 500;
};

type TabType = "leads" | "applications" | "earnings";

export default function MarketingDashboard() {
  const insets = useSafeAreaInsets();
  const { user, leads, addLead, updateLeadStatus, vendorApplications, submitVendorApplication, logout, customSubCategories, notifications, adminPricing } = useApp();
  const allSubCategories = [...subCategories, ...customSubCategories];
  const [activeTab, setActiveTab] = useState<TabType>("leads");
  const [showAddModal, setShowAddModal] = useState(false);
  const [showVendorForm, setShowVendorForm] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [profilePhoto, setProfilePhoto] = useState<string | null>(user?.avatar || null);

  useEffect(() => {
    AsyncStorage.getItem("marketing_profile_photo_" + (user?.phone || "")).then(v => {
      if (v) setProfilePhoto(v);
    });
  }, [user?.phone]);

  // Fresh applications fetched from server (overrides local state which can be stale after admin approval)
  const [serverApplications, setServerApplications] = useState<VendorApplication[] | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState(false);

  const fetchMyApplications = useCallback(async (silent = true) => {
    try {
      if (!silent) setIsRefreshing(true);
      const token = await AsyncStorage.getItem("gobharat_auth_token");
      if (!token) { if (!silent) setIsRefreshing(false); return; }
      const myAppsUrl = new URL("/api/vendor-applications/submitted-by-me", getApiUrl());
      myAppsUrl.searchParams.set("_t", Date.now().toString());
      const res = await fetch(myAppsUrl.toString(), {
        headers: { Authorization: `Bearer ${token}`, "Cache-Control": "no-cache" },
        cache: "no-store",
      });
      if (!res.ok) { setFetchError(true); if (!silent) setIsRefreshing(false); return; }
      const data = await res.json();
      const apps: VendorApplication[] = (data.applications || []).map((a: any) => ({
        id: a.id,
        businessName: a.businessName,
        ownerName: a.ownerName,
        phone: a.phone,
        email: a.email || "",
        categoryId: a.categoryId || "",
        subCategoryId: a.subCategoryId || "",
        city: a.city || "",
        address: a.address || "",
        area: a.area || "",
        gstNumber: a.gstNumber || "",
        status: a.status,
        submittedBy: a.submittedBy || "",
        submittedAt: a.submittedAt ? new Date(a.submittedAt).toISOString() : new Date().toISOString(),
        rejectionReason: a.rejectionReason,
        notes: a.notes,
        photos: a.photos || [],
      }));
      setServerApplications(apps);
      setFetchError(false);
    } catch {
      setFetchError(true);
    } finally {
      if (!silent) setIsRefreshing(false);
    }
  }, []);

  const handleRefresh = useCallback(async () => {
    fetchMyApplications(false);
    // Also try to sync any local leads that haven't been uploaded yet
    try {
      const token = await AsyncStorage.getItem("gobharat_auth_token");
      if (!token || leads.length === 0) return;
      const apiUrl = getApiUrl();
      // Fetch server leads to know which IDs already exist
      const r = await fetch(new URL("/api/leads", apiUrl).toString(), {
        headers: { Authorization: `Bearer ${token}`, "Cache-Control": "no-cache" },
        cache: "no-store",
      });
      if (!r.ok) return;
      const { leads: serverLeads = [] } = await r.json();
      const serverIds = new Set(serverLeads.map((l: any) => l.id));
      // Upload missing local leads
      const missing = leads.filter((l) => !serverIds.has(l.id));
      for (const lead of missing) {
        await fetch(new URL("/api/leads", apiUrl).toString(), {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify(lead),
        }).catch(() => {});
      }
    } catch {}
  }, [fetchMyApplications, leads]);

  // Fetch fresh data every time the screen comes into focus
  // Poll every 8s when no data yet (faster recovery after backend restart), else every 20s
  useFocusEffect(useCallback(() => {
    fetchMyApplications(true);
    const interval = setInterval(() => fetchMyApplications(true), serverApplications === null ? 8000 : 20000);
    return () => clearInterval(interval);
  }, [fetchMyApplications, serverApplications]));

  // Derive myApplications here so all downstream calculations can use it safely
  const localApplications = vendorApplications.filter((a) => {
    const submitted = (a.submittedBy || "").toLowerCase().trim();
    const myName = (user?.name || "Marketing Executive").toLowerCase().trim();
    return submitted === myName;
  });
  const myApplications = serverApplications !== null ? serverApplications : localApplications;

  const handlePickProfilePhoto = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.6,
        base64: true,
      });
      if (!result.canceled && result.assets[0]) {
        const uri = result.assets[0].base64
          ? `data:image/jpeg;base64,${result.assets[0].base64}`
          : result.assets[0].uri;
        setProfilePhoto(uri);
        AsyncStorage.setItem("marketing_profile_photo_" + (user?.phone || ""), uri);
        try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
      }
    } catch {
      Alert.alert("Error", "Could not pick photo.");
    }
  };

  const [newLeadName, setNewLeadName] = useState("");
  const [newLeadPhone, setNewLeadPhone] = useState("");
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  const closedLeads = leads.filter((l) => l.status === "CLOSED");
  // Earnings are based on vendor applications that actually went LIVE
  const liveApps = myApplications.filter((a) => a.status === "LIVE");
  const currentRate = incentiveRateFor(liveApps.length);
  const totalEarned = liveApps.length * currentRate;
  const now = new Date();
  const thisMonthLive = liveApps.filter((a) => {
    // Use reviewedAt (when the vendor was approved/made live), falling back to submittedAt
    const d = new Date(a.reviewedAt || a.submittedAt);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  });
  const earningsData = {
    totalEarned,
    thisMonth: thisMonthLive.length * currentRate,
    pending: totalEarned, // all earned amount is pending until withdrawn
    withdrawn: 0,
  };
  const commissionHistory = liveApps.map((a) => ({
    id: a.id,
    lead: a.businessName,
    amount: currentRate,
    date: new Date(a.submittedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }),
    status: "Pending",
  }));

  const [vendorForm, setVendorForm] = useState({
    businessName: "",
    ownerName: "",
    phone: "",
    email: "",
    categoryId: "",
    subCategoryId: "",
    address: "",
    city: "",
    pinCode: "",
    latitude: 0,
    longitude: 0,
    locationLink: "",
    description: "",
    gstNumber: "",
    panNumber: "",
    bankAccount: "",
    ifscCode: "",
    commissionRate: "10",
    photos: [] as string[],
    paymentMethods: ["CASH"] as ("CASH" | "UPI" | "BANK_TRANSFER" | "CHEQUE")[],
    upiId: "",
    subscriptionPlan: "MONTHLY" as "MONTHLY" | "QUARTERLY" | "HALF_YEARLY" | "ANNUAL",
  });
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [showSubCategoryPicker, setShowSubCategoryPicker] = useState(false);
  const [fetchingLocation, setFetchingLocation] = useState(false);
  const [locationError, setLocationError] = useState("");
  const [locationNeedsSettings, setLocationNeedsSettings] = useState(false);
  const [submittingVendorApp, setSubmittingVendorApp] = useState(false);
  const [locationPermission, requestLocationPermission] = Location.useForegroundPermissions();
  const [submitError, setSubmitError] = useState("");
  const [draftSaved, setDraftSaved] = useState(false);
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstRender = useRef(true);

  // Auto-save draft to AsyncStorage whenever form changes
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    const hasData = vendorForm.businessName.trim() || vendorForm.ownerName.trim() || vendorForm.phone.trim();
    if (!hasData) return;
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    draftTimerRef.current = setTimeout(() => {
      AsyncStorage.setItem(VENDOR_DRAFT_KEY, JSON.stringify(vendorForm)).then(() => {
        setDraftSaved(true);
        setTimeout(() => setDraftSaved(false), 2000);
      });
    }, 800);
    return () => { if (draftTimerRef.current) clearTimeout(draftTimerRef.current); };
  }, [vendorForm]);

  const [hasSavedDraft, setHasSavedDraft] = useState(false);

  // Check for saved draft when opening form — always opens immediately
  const openVendorForm = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(VENDOR_DRAFT_KEY);
      if (raw) {
        const draft = JSON.parse(raw);
        const hasData = draft.businessName?.trim() || draft.ownerName?.trim() || draft.phone?.trim();
        if (hasData) {
          setVendorForm((prev) => ({ ...prev, ...draft }));
          setHasSavedDraft(true);
          setShowVendorForm(true);
          return;
        }
      }
    } catch {}
    setHasSavedDraft(false);
    setShowVendorForm(true);
  }, []);

  const filteredSubCategories = useMemo(() => {
    if (!vendorForm.categoryId) return [];
    return allSubCategories.filter((sc) => sc.categoryId === vendorForm.categoryId);
  }, [vendorForm.categoryId, allSubCategories]);

  const selectedSubCategory = allSubCategories.find((sc) => sc.id === vendorForm.subCategoryId);

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

  const handleAddLead = () => {
    if (!newLeadName.trim()) {
      Alert.alert("Required", "Please enter a business name.");
      return;
    }
    const phoneClean = newLeadPhone.replace(/\s/g, "");
    if (!phoneClean || phoneClean.length < 10) {
      Alert.alert("Invalid Phone", "Please enter a valid 10-digit phone number.");
      return;
    }
    addLead({ vendorName: newLeadName.trim(), phone: phoneClean, status: "NEW" });
    setNewLeadName("");
    setNewLeadPhone("");
    setShowAddModal(false);
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
  };

  const resetVendorForm = () => {
    AsyncStorage.removeItem(VENDOR_DRAFT_KEY);
    isFirstRender.current = true;
    setVendorForm({
      businessName: "",
      ownerName: "",
      phone: "",
      email: "",
      categoryId: "",
      subCategoryId: "",
      address: "",
      city: "",
      pinCode: "",
      latitude: 0,
      longitude: 0,
      locationLink: "",
      description: "",
      gstNumber: "",
      panNumber: "",
      bankAccount: "",
      ifscCode: "",
      commissionRate: "10",
      photos: [],
      paymentMethods: ["CASH"],
      upiId: "",
      subscriptionPlan: "MONTHLY",
    });
    setLocationError("");
    setLocationNeedsSettings(false);
    setLocationSkipped(false);
    setShowLocationWarning(false);
    setSubmitError("");
  };

  const parseLocationLink = (link: string) => {
    const patterns = [
      /@(-?\d+\.?\d*),(-?\d+\.?\d*)/,
      /q=(-?\d+\.?\d*),(-?\d+\.?\d*)/,
      /ll=(-?\d+\.?\d*),(-?\d+\.?\d*)/,
      /place\/[^/]*\/(-?\d+\.?\d*),(-?\d+\.?\d*)/,
      /maps\?.*?(-?\d+\.\d+),(-?\d+\.\d+)/,
      /!3d(-?\d+\.?\d+)!4d(-?\d+\.?\d+)/,
      /center=(-?\d+\.?\d+),(-?\d+\.?\d+)/,
      /destination=(-?\d+\.?\d+),(-?\d+\.?\d+)/,
    ];
    for (const pattern of patterns) {
      const match = link.match(pattern);
      if (match) {
        const lat = parseFloat(match[1]);
        const lng = parseFloat(match[2]);
        if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
          return { lat, lng };
        }
      }
    }
    const coordMatch = link.match(/(-?\d+\.\d{2,})\s*[,\s]\s*(-?\d+\.\d{2,})/);
    if (coordMatch) {
      const lat = parseFloat(coordMatch[1]);
      const lng = parseFloat(coordMatch[2]);
      if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        return { lat, lng };
      }
    }
    return null;
  };

  const [resolvingLink, setResolvingLink] = useState(false);
  const [locationSkipped, setLocationSkipped] = useState(false);
  const [showLocationWarning, setShowLocationWarning] = useState(false);

  const handlePasteLocation = async (link: string) => {
    setVendorForm((p) => ({ ...p, locationLink: link }));
    if (!link.trim()) return;
    const coords = parseLocationLink(link.trim());
    if (coords) {
      setVendorForm((p) => ({ ...p, latitude: coords.lat, longitude: coords.lng, locationLink: link }));
      setShowLocationWarning(false);
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
          setVendorForm((p) => ({ ...p, latitude: data.lat, longitude: data.lng }));
          setShowLocationWarning(false);
          try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
        } else {
          Alert.alert("Could not extract location", "Try pasting coordinates directly like: 20.5547, 74.5247");
        }
      } catch {
        Alert.alert("Could not resolve link", "Try pasting coordinates directly like: 20.5547, 74.5247");
      } finally {
        setResolvingLink(false);
      }
      return;
    }
  };

  const handleManualCoords = (field: "lat" | "lng", val: string) => {
    const num = parseFloat(val);
    if (field === "lat") {
      setVendorForm((p) => ({ ...p, latitude: isNaN(num) ? 0 : num }));
    } else {
      setVendorForm((p) => ({ ...p, longitude: isNaN(num) ? 0 : num }));
    }
  };

  const handlePickLocation = async () => {
    setFetchingLocation(true);
    setLocationError("");
    setLocationNeedsSettings(false);
    try {
      let lat = 0, lng = 0;

      if (Platform.OS === "web") {
        if (!navigator.geolocation) {
          setLocationError("Geolocation not supported on this device. Please paste a Google Maps link.");
          setFetchingLocation(false);
          return;
        }
        try {
          const position = await Promise.race<GeolocationPosition>([
            new Promise<GeolocationPosition>((resolve, reject) => {
              navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: false, timeout: 12000, maximumAge: 60000 });
            }),
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 14000)),
          ]);
          lat = position.coords.latitude;
          lng = position.coords.longitude;
        } catch (geoErr: any) {
          const code = geoErr?.code;
          if (code === 1) {
            setLocationError("Location permission denied. Tap 'Open Settings' to allow location access for Go Bharat.");
            setLocationNeedsSettings(true);
          } else if (code === 2) {
            setLocationError("Location unavailable. Make sure GPS is turned on and try again.");
          } else {
            setLocationError("Could not get location. Please paste a Google Maps link instead.");
          }
          setFetchingLocation(false);
          return;
        }
      } else {
        const perm = await Location.requestForegroundPermissionsAsync();
        if (!perm.granted) {
          if (!perm.canAskAgain) {
            setLocationError("Location permission denied. Tap 'Open Settings' to allow it.");
            setLocationNeedsSettings(true);
          } else {
            setLocationError("Location permission is needed. Please allow it and try again.");
          }
          setFetchingLocation(false);
          return;
        }
        const loc = await Promise.race([
          Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 15000)),
        ]);
        lat = loc.coords.latitude;
        lng = loc.coords.longitude;
      }

      setVendorForm((p) => ({ ...p, latitude: lat, longitude: lng }));
      setShowLocationWarning(false);

      try {
        const geocode = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
        const place = geocode[0];
        if (place) {
          const addressParts = [place.name, place.street, place.district, place.subregion].filter(Boolean);
          setVendorForm((p) => ({
            ...p,
            address: addressParts.join(", "),
            city: place.city || place.subregion || place.region || "",
            latitude: lat,
            longitude: lng,
          }));
        }
      } catch {}
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
    } catch {
      setLocationError("Could not get your location. Please paste a Google Maps link instead.");
    }
    setFetchingLocation(false);
  };

  // Only keeps assets that have base64 data so the photo can survive server upload.
  // Assets without base64 (rare: very large images or OS limits) are silently dropped.
  const toDataUri = (asset: ImagePicker.ImagePickerAsset): string | null => {
    if (asset.base64) return `data:image/jpeg;base64,${asset.base64}`;
    return null; // file:// / content:// URIs can't be stored in the DB — drop them
  };

  const handlePickPhotos = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        selectionLimit: 5 - vendorForm.photos.length,
        quality: 0.4,
        base64: true,
      });
      if (!result.canceled && result.assets) {
        const newPhotos = result.assets.map(toDataUri).filter((u): u is string => u !== null);
        if (newPhotos.length === 0) {
          Alert.alert("Upload Failed", "Could not read the selected photo(s). Please try again with a smaller image.");
          return;
        }
        setVendorForm((p) => ({ ...p, photos: [...p.photos, ...newPhotos].slice(0, 5) }));
        try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
      }
    } catch {
      Alert.alert("Error", "Could not pick photos.");
    }
  };

  const handleTakePhoto = async () => {
    try {
      const result = await ImagePicker.launchCameraAsync({
        quality: 0.5,
        base64: true,
      });
      if (!result.canceled && result.assets) {
        const uri = toDataUri(result.assets[0]);
        if (!uri) { Alert.alert("Upload Failed", "Could not read photo data. Please try again."); return; }
        setVendorForm((p) => ({ ...p, photos: [...p.photos, uri].slice(0, 5) }));
        try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
      }
    } catch {
      Alert.alert("Error", "Could not take photo.");
    }
  };

  const handleRemovePhoto = (index: number) => {
    setVendorForm((p) => ({ ...p, photos: p.photos.filter((_, i) => i !== index) }));
  };


  const handleSubmitVendorApp = async (forceSkip = false) => {
    if (submittingVendorApp) return;
    try {
    const { businessName, ownerName, phone, categoryId, address, city, email } = vendorForm;
    if (!businessName.trim() || !ownerName.trim() || !phone.trim() || !categoryId || !address.trim() || !city.trim()) {
      Alert.alert("Required Fields", "Please fill in Business Name, Owner Name, Phone, Category, Address and City.");
      return;
    }
    const phoneClean = phone.replace(/\s/g, "");
    if (phoneClean.length < 10) {
      Alert.alert("Invalid Phone", "Please enter a valid 10-digit phone number.");
      return;
    }
    if (email && !email.includes("@")) {
      Alert.alert("Invalid Email", "Please enter a valid email address.");
      return;
    }
    const hasValidCoords = !!(vendorForm.latitude && vendorForm.longitude);
    const hasLink = !!(vendorForm.locationLink?.trim());
    if (!hasValidCoords && !hasLink && !forceSkip && !locationSkipped) {
      if (showLocationWarning) {
        // User has already seen the warning and tapped Submit again — treat as acknowledged skip
        setLocationSkipped(true);
      } else {
        setShowLocationWarning(true);
        return;
      }
    }
    setShowLocationWarning(false);
    if (forceSkip) setLocationSkipped(true);
    setSubmitError("");
    setSubmittingVendorApp(true);
    const success = await submitVendorApplication({
      businessName: vendorForm.businessName,
      ownerName: vendorForm.ownerName,
      phone: vendorForm.phone,
      email: vendorForm.email,
      categoryId: vendorForm.categoryId,
      subCategoryId: vendorForm.subCategoryId || undefined,
      address: vendorForm.address,
      city: vendorForm.city,
      pinCode: vendorForm.pinCode.trim(),
      latitude: vendorForm.latitude || undefined,
      longitude: vendorForm.longitude || undefined,
      locationLink: vendorForm.locationLink?.trim() || undefined,
      description: vendorForm.description,
      gstNumber: vendorForm.gstNumber,
      panNumber: vendorForm.panNumber,
      bankAccount: vendorForm.bankAccount,
      ifscCode: vendorForm.ifscCode,
      commissionRate: parseInt(vendorForm.commissionRate) || 10,
      paymentMethods: vendorForm.paymentMethods,
      upiId: vendorForm.upiId.trim() || undefined,
      subscriptionPlan: vendorForm.subscriptionPlan,
      photos: vendorForm.photos.length > 0 ? vendorForm.photos : undefined,
    });
    setSubmittingVendorApp(false);
    if (success !== true) {
      const errMsg = typeof success === "string"
        ? success
        : "Could not save the vendor application. Check your connection and try again.";
      setSubmitError(errMsg);
      return;
    }
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
    setHasSavedDraft(false);
    resetVendorForm();
    setShowVendorForm(false);
    setActiveTab("applications");
    } catch (e) {
      console.error("[handleSubmitVendorApp] Unexpected error:", e);
      setSubmittingVendorApp(false);
      setSubmitError("An unexpected error occurred. Please try again.");
    }
  };

  const nextStatus: Record<string, Lead["status"]> = {
    NEW: "CONTACTED",
    CONTACTED: "NEGOTIATION",
    NEGOTIATION: "CLOSED",
  };

  const dailyTarget = { vendors: 4, total: 7 };
  const closedDeals = leads.filter((l) => l.status === "CLOSED").length;
  const selectedCategory = categories.find((c) => c.id === vendorForm.categoryId);

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: bottomInset + 40 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            colors={[Colors.primary]}
            tintColor={Colors.primary}
          />
        }
      >
        <LinearGradient colors={["#0B1E3D", "#142F5E"]} style={[styles.header, { paddingTop: topInset + 12 }]}>
          <View style={styles.headerRow}>
            <Pressable style={styles.profileSection} onPress={() => setShowProfileModal(true)}>
              <View style={styles.avatarCircle}>
                {profilePhoto ? (
                  <Image source={{ uri: profilePhoto }} style={styles.avatarImage} contentFit="cover" accessibilityLabel="Vendor profile photo" />
                ) : (
                  <Text style={styles.avatarInitial}>{(user?.name || "E")[0].toUpperCase()}</Text>
                )}
                <View style={styles.avatarEditBadge}>
                  <Ionicons name="pencil" size={8} color="#FFF" />
                </View>
              </View>
              <View style={styles.profileText}>
                <Text style={styles.greeting}>Dashboard</Text>
                <Text style={styles.name} numberOfLines={1} ellipsizeMode="tail">{user?.name || "Executive"}</Text>
              </View>
            </Pressable>
            <View style={styles.headerActions}>
              <Pressable style={[styles.addBtn, { backgroundColor: "#10B981" }]} onPress={() => { try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {} router.push("/(customer)" as any); }}>
                <Ionicons name="bag-handle-outline" size={20} color="#FFF" />
              </Pressable>
              <Pressable style={[styles.addBtn, { backgroundColor: "#6366F1" }]} onPress={() => router.push("/notifications" as any)}>
                <Ionicons name="notifications-outline" size={20} color="#FFF" />
                {notifications.filter(n => !n.read).length > 0 && (
                  <View style={{ position: "absolute", top: -6, right: -6, backgroundColor: "#EF4444", borderRadius: 10, minWidth: 18, height: 18, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 }}>
                    <Text style={{ fontFamily: "Poppins_700Bold", fontSize: 10, color: "#FFF" }}>{notifications.filter(n => !n.read).length > 99 ? "99+" : notifications.filter(n => !n.read).length}</Text>
                  </View>
                )}
              </Pressable>
              <Pressable style={styles.addBtn} onPress={openVendorForm} testID="add-vendor-btn">
                <Ionicons name="storefront" size={20} color="#FFF" />
              </Pressable>
              <Pressable style={[styles.addBtn, { backgroundColor: Colors.info }]} onPress={() => setShowAddModal(true)}>
                <Ionicons name="person-add" size={20} color="#FFF" />
              </Pressable>
            </View>
          </View>
        </LinearGradient>

        {fetchError && (
          <Pressable
            style={{ backgroundColor: "#FFF3CD", borderRadius: 8, margin: 12, marginBottom: 0, padding: 12, flexDirection: "row", alignItems: "center", gap: 8 }}
            onPress={handleRefresh}
          >
            <Ionicons name="warning-outline" size={18} color="#856404" />
            <Text style={{ color: "#856404", fontSize: 13, flex: 1 }}>Could not load data. Tap to retry.</Text>
            <Ionicons name="refresh" size={16} color="#856404" />
          </Pressable>
        )}
        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <Ionicons name="people" size={22} color={Colors.info} />
            <Text style={styles.summaryValue}>{leads.length}</Text>
            <Text style={styles.summaryLabel}>Total Leads</Text>
          </View>
          <View style={styles.summaryCard}>
            <Ionicons name="document-text" size={22} color={Colors.primary} />
            {serverApplications === null && !fetchError
              ? <ActivityIndicator size="small" color={Colors.primary} style={{ marginVertical: 2 }} />
              : <Text style={styles.summaryValue}>{myApplications.length}</Text>}
            <Text style={styles.summaryLabel}>Applications</Text>
          </View>
          <View style={styles.summaryCard}>
            <Ionicons name="checkmark-circle" size={22} color={Colors.success} />
            {serverApplications === null && !fetchError
              ? <ActivityIndicator size="small" color={Colors.success} style={{ marginVertical: 2 }} />
              : <Text style={styles.summaryValue}>{myApplications.filter((a) => a.status === "LIVE").length}</Text>}
            <Text style={styles.summaryLabel}>Live Vendors</Text>
          </View>
        </View>

        <View style={styles.tabRow}>
          <Pressable
            style={[styles.tab, activeTab === "leads" && styles.tabActive]}
            onPress={() => setActiveTab("leads")}
          >
            <Text style={[styles.tabText, activeTab === "leads" && styles.tabTextActive]}>Leads</Text>
          </Pressable>
          <Pressable
            style={[styles.tab, activeTab === "applications" && styles.tabActive]}
            onPress={() => setActiveTab("applications")}
          >
            <Text style={[styles.tabText, activeTab === "applications" && styles.tabTextActive]}>Applications</Text>
          </Pressable>
          <Pressable
            style={[styles.tab, activeTab === "earnings" && styles.tabActive]}
            onPress={() => setActiveTab("earnings")}
          >
            <Text style={[styles.tabText, activeTab === "earnings" && styles.tabTextActive]}>Earnings</Text>
          </Pressable>
        </View>

        {activeTab === "leads" && (
          <View style={styles.section}>
            {leads.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons name="people-outline" size={40} color={Colors.textLight} />
                <Text style={styles.emptyText}>No leads yet. Tap the person icon to add your first lead!</Text>
              </View>
            ) : (
              leads.map((lead) => (
                <View key={lead.id} style={styles.leadCard}>
                  <View style={styles.leadTop}>
                    <View>
                      <Text style={styles.leadName}>{lead.vendorName}</Text>
                      <Text style={styles.leadPhone}>{lead.phone}</Text>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: statusColors[lead.status] + "18" }]}>
                      <Text style={[styles.statusText, { color: statusColors[lead.status] }]}>{lead.status}</Text>
                    </View>
                  </View>
                  {lead.status !== "CLOSED" && (
                    <Pressable
                      style={styles.advanceBtn}
                      onPress={() => {
                        try { Haptics.selectionAsync(); } catch {}
                        updateLeadStatus(lead.id, nextStatus[lead.status]);
                      }}
                    >
                      <Text style={styles.advanceBtnText}>Move to {nextStatus[lead.status]}</Text>
                      <Ionicons name="arrow-forward" size={16} color={Colors.primary} />
                    </Pressable>
                  )}
                </View>
              ))
            )}
          </View>
        )}

        {activeTab === "applications" && (
          <View style={styles.section}>
            {serverApplications === null && !fetchError ? (
              <View style={styles.emptyCard}>
                <ActivityIndicator size="large" color={Colors.primary} />
                <Text style={[styles.emptyText, { marginTop: 12 }]}>Loading your applications…</Text>
              </View>
            ) : myApplications.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons name="storefront-outline" size={40} color={Colors.textLight} />
                <Text style={styles.emptyText}>{fetchError ? "Could not load applications. Pull down to refresh." : "No vendor applications yet. Tap the store icon to add a new vendor!"}</Text>
                {fetchError && (
                  <Pressable
                    style={{ marginTop: 12, backgroundColor: Colors.primary, borderRadius: 8, paddingHorizontal: 20, paddingVertical: 8 }}
                    onPress={handleRefresh}
                  >
                    <Text style={{ color: "#FFF", fontWeight: "600" }}>Retry</Text>
                  </Pressable>
                )}
              </View>
            ) : (
              myApplications.map((app) => (
                <View key={app.id} style={styles.appCard}>
                  <View style={styles.appHeader}>
                    <View style={styles.appIconWrap}>
                      <Ionicons name="storefront" size={20} color={Colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.appBizName}>{app.businessName}</Text>
                      <Text style={styles.appOwner}>{app.ownerName} | {app.phone}</Text>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: appStatusColors[app.status] + "18" }]}>
                      <Text style={[styles.statusText, { color: appStatusColors[app.status] }]}>{app.status}</Text>
                    </View>
                  </View>
                  <View style={styles.appDetails}>
                    <View style={styles.appDetailRow}>
                      <Ionicons name="location" size={14} color={Colors.textSecondary} />
                      <Text style={styles.appDetailText}>{app.city} - {app.address}</Text>
                    </View>
                    <View style={styles.appDetailRow}>
                      <Ionicons name="pricetag" size={14} color={Colors.textSecondary} />
                      <Text style={styles.appDetailText}>{categories.find((c) => c.id === app.categoryId)?.name || "N/A"}</Text>
                    </View>
                    <View style={styles.appDetailRow}>
                      <Ionicons name="time" size={14} color={Colors.textSecondary} />
                      <Text style={styles.appDetailText}>{new Date(app.submittedAt).toLocaleDateString("en-IN")}</Text>
                    </View>
                  </View>
                  {app.status === "REJECTED" && app.rejectionReason && (
                    <View style={styles.rejectionBox}>
                      <Ionicons name="alert-circle" size={14} color={Colors.error} />
                      <Text style={styles.rejectionText}>{app.rejectionReason}</Text>
                    </View>
                  )}
                  {app.status === "LIVE" && (
                    <View style={styles.liveBox}>
                      <Ionicons name="checkmark-circle" size={14} color={Colors.success} />
                      <Text style={styles.liveText}>Vendor is live on the app</Text>
                    </View>
                  )}
                </View>
              ))
            )}
          </View>
        )}

        {activeTab === "earnings" && (
          <View style={styles.section}>
            <View style={styles.earningsOverview}>
              <LinearGradient colors={[Colors.primary, "#E85D00"]} style={styles.earningsHero}>
                <Ionicons name="wallet" size={28} color="#FFF" />
                <Text style={styles.earningsHeroLabel}>Total Earnings</Text>
                <Text style={styles.earningsHeroValue}>₹{earningsData.totalEarned.toLocaleString("en-IN")}</Text>
              </LinearGradient>
              <View style={styles.earningsStatsRow}>
                <View style={styles.earningStat}>
                  <View style={[styles.earnStatIcon, { backgroundColor: Colors.info + "15" }]}>
                    <Ionicons name="calendar" size={16} color={Colors.info} />
                  </View>
                  <Text style={styles.earnStatValue}>₹{earningsData.thisMonth.toLocaleString("en-IN")}</Text>
                  <Text style={styles.earnStatLabel}>This Month</Text>
                </View>
                <View style={styles.earningStat}>
                  <View style={[styles.earnStatIcon, { backgroundColor: Colors.warning + "15" }]}>
                    <Ionicons name="time" size={16} color={Colors.warning} />
                  </View>
                  <Text style={styles.earnStatValue}>₹{earningsData.pending.toLocaleString("en-IN")}</Text>
                  <Text style={styles.earnStatLabel}>Pending</Text>
                </View>
                <View style={styles.earningStat}>
                  <View style={[styles.earnStatIcon, { backgroundColor: Colors.success + "15" }]}>
                    <Ionicons name="checkmark-circle" size={16} color={Colors.success} />
                  </View>
                  <Text style={styles.earnStatValue}>₹{earningsData.withdrawn.toLocaleString("en-IN")}</Text>
                  <Text style={styles.earnStatLabel}>Withdrawn</Text>
                </View>
              </View>
            </View>

            <Text style={styles.earnSectionTitle}>Incentive Tier</Text>
            <View style={styles.tierCard}>
              {incentiveTiers.map((tier, i) => {
                const liveCount = liveApps.length;
                const isCurrentTier = liveCount >= tier.min && liveCount <= tier.max;
                return (
                  <View key={tier.tier} style={[styles.tierItem, isCurrentTier && { backgroundColor: tier.color + "12", borderColor: tier.color, borderWidth: 1.5 }]}>
                    <Ionicons name={tier.icon} size={20} color={tier.color} />
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <Text style={[styles.tierName, isCurrentTier && { color: tier.color }]}>{tier.tier}</Text>
                        {isCurrentTier && (
                          <View style={[styles.currentTag, { backgroundColor: tier.color }]}>
                            <Text style={styles.currentTagText}>Current</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.tierRange}>{tier.range}</Text>
                    </View>
                    <Text style={[styles.tierRate, isCurrentTier && { color: tier.color }]}>₹{tier.rate}/vendor</Text>
                  </View>
                );
              })}
            </View>

            <View style={styles.targetSection}>
              <View style={styles.targetHeader}>
                <Ionicons name="trophy" size={18} color={Colors.warning} />
                <Text style={styles.earnSectionTitle}>Monthly Target</Text>
              </View>
              <View style={styles.targetCard}>
                <View style={styles.targetRow}>
                  <Text style={styles.targetProgress}>{thisMonthLive.length} / 25</Text>
                  <Text style={styles.targetLabel}>vendors onboarded this month</Text>
                </View>
                <Text style={styles.targetNote}>{liveApps.length} total all-time</Text>
                <View style={styles.progressTrack}>
                  <LinearGradient
                    colors={[Colors.primary, Colors.primaryLight || "#FF8C42"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={[styles.progressFill, { width: `${Math.min((thisMonthLive.length / 25) * 100, 100)}%` }]}
                  />
                </View>
                <Text style={styles.targetNote}>{Math.max(0, 25 - thisMonthLive.length)} more vendors to unlock ₹5,000 bonus</Text>
              </View>
            </View>

            <Text style={styles.earnSectionTitle}>Commission History</Text>
            {commissionHistory.length === 0 && (
              <View style={{ alignItems: "center", paddingVertical: 20 }}>
                <Ionicons name="cash-outline" size={32} color={Colors.textSecondary} />
                <Text style={{ color: Colors.textSecondary, marginTop: 8, fontSize: 13 }}>No commissions earned yet</Text>
              </View>
            )}
            {commissionHistory.map((c) => (
              <View key={c.id} style={styles.commissionRow}>
                <View style={[styles.commissionIcon, { backgroundColor: c.status === "Paid" ? Colors.success + "12" : Colors.warning + "12" }]}>
                  <Ionicons name={c.status === "Paid" ? "checkmark-circle" : "time"} size={16} color={c.status === "Paid" ? Colors.success : Colors.warning} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.commissionLead}>{c.lead}</Text>
                  <Text style={styles.commissionDate}>{c.date}</Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={styles.commissionAmount}>₹{c.amount.toLocaleString("en-IN")}</Text>
                  <View style={[styles.commissionStatus, { backgroundColor: c.status === "Paid" ? Colors.success + "15" : Colors.warning + "15" }]}>
                    <Text style={[styles.commissionStatusText, { color: c.status === "Paid" ? Colors.success : Colors.warning }]}>{c.status}</Text>
                  </View>
                </View>
              </View>
            ))}

            <Pressable
              style={styles.withdrawMainBtn}
              onPress={() => {
                try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
                Alert.alert(
                  "Withdraw Earnings",
                  `Withdraw pending ₹${earningsData.pending.toLocaleString("en-IN")} to your linked bank account?`,
                  [
                    { text: "Cancel", style: "cancel" },
                    { text: "Withdraw", onPress: () => Alert.alert("Success", "Withdrawal request submitted. Amount will be credited within 2-3 business days.") },
                  ]
                );
              }}
            >
              <LinearGradient colors={[Colors.primary, "#E85D00"]} style={styles.withdrawGradient}>
                <MaterialCommunityIcons name="bank-transfer-out" size={22} color="#FFF" />
                <Text style={styles.withdrawText}>Withdraw ₹{earningsData.pending.toLocaleString("en-IN")}</Text>
              </LinearGradient>
            </Pressable>

            <Pressable
              style={styles.viewFullBtn}
              onPress={() => {
                try { Haptics.selectionAsync(); } catch {}
                router.push("/marketing-incentives" as any);
              }}
            >
              <Text style={styles.viewFullBtnText}>View Full Incentive Details</Text>
              <Ionicons name="chevron-forward" size={16} color={Colors.primary} />
            </Pressable>
          </View>
        )}

        <View style={styles.legalCard}>
          <Pressable style={[styles.legalItem, styles.legalBorder]} onPress={() => router.push("/terms" as any)}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View style={styles.legalIconBg}>
                <Ionicons name="document-text" size={20} color={Colors.primary} />
              </View>
              <Text style={styles.legalLabel}>Terms & Conditions</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.textLight} />
          </Pressable>
          <Pressable style={[styles.legalItem, styles.legalBorder]} onPress={() => router.push("/privacy" as any)}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View style={styles.legalIconBg}>
                <Ionicons name="shield-checkmark" size={20} color={Colors.primary} />
              </View>
              <Text style={styles.legalLabel}>Privacy Policy</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.textLight} />
          </Pressable>
          <Pressable style={styles.legalItem} onPress={() => router.push("/about" as any)}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View style={styles.legalIconBg}>
                <Ionicons name="information-circle" size={20} color={Colors.primary} />
              </View>
              <Text style={styles.legalLabel}>About Go Bharat</Text>
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
      </ScrollView>

      {/* Profile Settings Modal */}
      <Modal visible={showProfileModal} transparent animationType="slide" onRequestClose={() => setShowProfileModal(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: "#FFF", borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 28, paddingBottom: bottomInset + 24 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
              <Text style={{ fontFamily: "Poppins_700Bold", fontSize: 20, color: Colors.text }}>My Profile</Text>
              <Pressable onPress={() => setShowProfileModal(false)}>
                <Ionicons name="close" size={24} color={Colors.textSecondary} />
              </Pressable>
            </View>

            <View style={{ alignItems: "center", marginBottom: 24 }}>
              <Pressable onPress={handlePickProfilePhoto} style={{ position: "relative" }}>
                <View style={{ width: 90, height: 90, borderRadius: 45, backgroundColor: Colors.primary + "20", alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: Colors.primary }}>
                  {profilePhoto ? (
                    <Image source={{ uri: profilePhoto }} style={{ width: 84, height: 84, borderRadius: 42 }} contentFit="cover" accessibilityLabel="Vendor profile photo" />
                  ) : (
                    <Text style={{ fontFamily: "Poppins_700Bold", fontSize: 36, color: Colors.primary }}>{(user?.name || "E")[0].toUpperCase()}</Text>
                  )}
                </View>
                <View style={{ position: "absolute", bottom: 0, right: 0, width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.primary, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#FFF" }}>
                  <Ionicons name="camera" size={14} color="#FFF" />
                </View>
              </Pressable>
              <Text style={{ fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary, marginTop: 8 }}>Tap to change photo</Text>
            </View>

            <View style={{ backgroundColor: Colors.background, borderRadius: 16, padding: 16, gap: 12, marginBottom: 20 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: Colors.primary + "15", alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name="person-outline" size={18} color={Colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textSecondary }}>Name</Text>
                  <Text style={{ fontFamily: "Poppins_600SemiBold", fontSize: 15, color: Colors.text }}>{user?.name || "Executive"}</Text>
                </View>
              </View>
              <View style={{ height: 1, backgroundColor: Colors.borderLight }} />
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: Colors.info + "15", alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name="call-outline" size={18} color={Colors.info} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textSecondary }}>Phone</Text>
                  <Text style={{ fontFamily: "Poppins_600SemiBold", fontSize: 15, color: Colors.text }}>{user?.phone || "-"}</Text>
                </View>
              </View>
              <View style={{ height: 1, backgroundColor: Colors.borderLight }} />
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: "#8B5CF615", alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name="briefcase-outline" size={18} color="#8B5CF6" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textSecondary }}>Role</Text>
                  <Text style={{ fontFamily: "Poppins_600SemiBold", fontSize: 15, color: Colors.text }}>Marketing Executive</Text>
                </View>
              </View>
            </View>

            <Pressable
              style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 16, backgroundColor: Colors.error + "10", borderRadius: 14 }}
              onPress={() => { setShowProfileModal(false); setTimeout(() => setShowLogoutModal(true), 300); }}
            >
              <Ionicons name="log-out-outline" size={20} color={Colors.error} />
              <Text style={{ fontFamily: "Poppins_600SemiBold", fontSize: 15, color: Colors.error }}>Log Out</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

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

      <Modal visible={showAddModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingBottom: bottomInset + 24 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add New Lead</Text>
              <Pressable onPress={() => setShowAddModal(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </Pressable>
            </View>
            <TextInput
              style={styles.input}
              placeholder="Business Name"
              placeholderTextColor={Colors.textLight}
              value={newLeadName}
              onChangeText={setNewLeadName}
            />
            <TextInput
              style={styles.input}
              placeholder="Phone Number"
              placeholderTextColor={Colors.textLight}
              keyboardType="phone-pad"
              value={newLeadPhone}
              onChangeText={setNewLeadPhone}
            />
            <Pressable style={styles.submitBtn} onPress={handleAddLead}>
              <Text style={styles.submitBtnText}>Add Lead</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={showVendorForm} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1, justifyContent: "flex-end" }}>
            <View style={[styles.vendorFormModal, { paddingBottom: bottomInset + 16 }]}>
              <View style={styles.modalHeader}>
                <View>
                  <Text style={styles.modalTitle}>New Vendor Application</Text>
                  {draftSaved && (
                    <Text style={{ fontSize: 11, color: Colors.success, fontFamily: "Inter_400Regular", marginTop: 1 }}>
                      ✓ Draft saved
                    </Text>
                  )}
                </View>
                <Pressable onPress={() => {
                  const hasData = vendorForm.businessName.trim() || vendorForm.ownerName.trim() || vendorForm.phone.trim();
                  setHasSavedDraft(false);
                  if (hasData) {
                    setShowVendorForm(false);
                  } else {
                    setShowVendorForm(false);
                    resetVendorForm();
                  }
                }}>
                  <Ionicons name="close" size={24} color={Colors.text} />
                </Pressable>
              </View>

              {hasSavedDraft && (
                <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: Colors.primary + "12", borderRadius: 10, padding: 10, marginBottom: 8, gap: 10 }}>
                  <Ionicons name="document-text-outline" size={18} color={Colors.primary} />
                  <Text style={{ flex: 1, fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.text }}>Draft restored. Continue editing or start fresh.</Text>
                  <Pressable onPress={() => { resetVendorForm(); setHasSavedDraft(false); }} style={{ backgroundColor: Colors.primary, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }}>
                    <Text style={{ fontFamily: "Poppins_600SemiBold", fontSize: 12, color: "#FFF" }}>Start Fresh</Text>
                  </Pressable>
                </View>
              )}
              <ScrollView showsVerticalScrollIndicator={true} contentContainerStyle={{ paddingBottom: 8 }} nestedScrollEnabled>
                <Text style={styles.formSection}>Business Details</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Business Name *"
                  placeholderTextColor={Colors.textLight}
                  value={vendorForm.businessName}
                  onChangeText={(v) => setVendorForm((p) => ({ ...p, businessName: v }))}
                  testID="vendor-business-name"
                />
                <TextInput
                  style={styles.input}
                  placeholder="Owner Name *"
                  placeholderTextColor={Colors.textLight}
                  value={vendorForm.ownerName}
                  onChangeText={(v) => setVendorForm((p) => ({ ...p, ownerName: v }))}
                  testID="vendor-owner-name"
                />
                <TextInput
                  style={styles.input}
                  placeholder="Phone *"
                  placeholderTextColor={Colors.textLight}
                  keyboardType="phone-pad"
                  value={vendorForm.phone}
                  onChangeText={(v) => setVendorForm((p) => ({ ...p, phone: v }))}
                  testID="vendor-phone"
                />
                <TextInput
                  style={styles.input}
                  placeholder="Email"
                  placeholderTextColor={Colors.textLight}
                  keyboardType="email-address"
                  value={vendorForm.email}
                  onChangeText={(v) => setVendorForm((p) => ({ ...p, email: v }))}
                />

                <Pressable style={styles.pickerBtn} onPress={() => setShowCategoryPicker(true)} testID="vendor-category-picker">
                  <Text style={[styles.pickerText, !selectedCategory && { color: Colors.textLight }]}>
                    {selectedCategory ? selectedCategory.name : "Select Category *"}
                  </Text>
                  <Ionicons name="chevron-down" size={20} color={Colors.textSecondary} />
                </Pressable>

                {showCategoryPicker && (
                  <View style={styles.categoryGrid}>
                    {categories.map((cat) => (
                      <Pressable
                        key={cat.id}
                        style={[styles.categoryChip, vendorForm.categoryId === cat.id && { backgroundColor: Colors.primary, borderColor: Colors.primary }]}
                        onPress={() => {
                          setVendorForm((p) => ({ ...p, categoryId: cat.id, subCategoryId: "" }));
                          setShowCategoryPicker(false);
                          setShowSubCategoryPicker(true);
                        }}
                      >
                        <Ionicons name={cat.icon as any} size={16} color={vendorForm.categoryId === cat.id ? "#FFF" : cat.color} />
                        <Text style={[styles.categoryChipText, vendorForm.categoryId === cat.id && { color: "#FFF" }]}>{cat.name}</Text>
                      </Pressable>
                    ))}
                  </View>
                )}

                <Pressable
                  style={[styles.pickerBtn, { borderColor: Colors.primary + "50" }]}
                  onPress={() => {
                    if (!vendorForm.categoryId) {
                      Alert.alert("Select Category First", "Please select a category before choosing a sub-category.");
                      return;
                    }
                    setShowSubCategoryPicker(!showSubCategoryPicker);
                  }}
                >
                  <Ionicons name="layers-outline" size={18} color={selectedSubCategory ? Colors.primary : Colors.textLight} style={{ marginRight: 4 }} />
                  <Text style={[styles.pickerText, { flex: 1 }, !selectedSubCategory && { color: Colors.textLight }]}>
                    {selectedSubCategory ? selectedSubCategory.name : "Select Sub-Category"}
                  </Text>
                  <Ionicons name={showSubCategoryPicker ? "chevron-up" : "chevron-down"} size={20} color={Colors.textSecondary} />
                </Pressable>

                {showSubCategoryPicker && vendorForm.categoryId && filteredSubCategories.length > 0 && (
                  <ScrollView style={styles.subCategoryList} nestedScrollEnabled>
                    {filteredSubCategories.map((sc) => (
                      <Pressable
                        key={sc.id}
                        style={[styles.subCategoryItem, vendorForm.subCategoryId === sc.id && { backgroundColor: Colors.primary + "15", borderColor: Colors.primary }]}
                        onPress={() => {
                          setVendorForm((p) => ({ ...p, subCategoryId: sc.id }));
                          setShowSubCategoryPicker(false);
                          try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
                        }}
                      >
                        <Ionicons name={sc.icon as any} size={16} color={vendorForm.subCategoryId === sc.id ? Colors.primary : Colors.textSecondary} />
                        <Text style={[styles.subCategoryItemText, vendorForm.subCategoryId === sc.id && { color: Colors.primary, fontFamily: "Poppins_600SemiBold" }]}>{sc.name}</Text>
                        {vendorForm.subCategoryId === sc.id && <Ionicons name="checkmark-circle" size={16} color={Colors.primary} />}
                      </Pressable>
                    ))}
                  </ScrollView>
                )}

                <TextInput
                  style={[styles.input, { height: 64, textAlignVertical: "top" }]}
                  placeholder="Business Description"
                  placeholderTextColor={Colors.textLight}
                  multiline
                  value={vendorForm.description}
                  onChangeText={(v) => setVendorForm((p) => ({ ...p, description: v }))}
                />

                <Text style={styles.formSection}>Business Photos</Text>
                <View style={styles.photoSection}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
                    {vendorForm.photos.map((uri, idx) => (
                      <View key={idx} style={styles.photoThumb}>
                        <Image source={{ uri }} style={styles.photoImage} contentFit="cover" accessibilityLabel="Vendor photo" />
                        <Pressable style={styles.photoRemoveBtn} onPress={() => handleRemovePhoto(idx)}>
                          <Ionicons name="close-circle" size={22} color={Colors.error} />
                        </Pressable>
                      </View>
                    ))}
                    {vendorForm.photos.length < 5 && (
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
                  <Text style={styles.photoHint}>{vendorForm.photos.length}/5 photos (storefront, products, signboard)</Text>
                </View>

                <Text style={styles.formSection}>Location</Text>
                <Pressable style={[styles.locationPickBtn, !!vendorForm.latitude && { borderColor: Colors.success + "60", backgroundColor: Colors.success + "10" }]} onPress={handlePickLocation} disabled={fetchingLocation}>
                  {fetchingLocation ? (
                    <ActivityIndicator size="small" color={Colors.primary} />
                  ) : vendorForm.latitude ? (
                    <Ionicons name="checkmark-circle" size={20} color={Colors.success} />
                  ) : (
                    <Ionicons name="location" size={20} color={Colors.primary} />
                  )}
                  <Text style={[styles.locationPickText, !!vendorForm.latitude && { color: Colors.success }]}>
                    {fetchingLocation ? "Getting location..." : vendorForm.latitude ? "Location captured" : "Use Current Location"}
                  </Text>
                </Pressable>
                {!!locationError && (
                  <View style={{ marginTop: 6, marginBottom: 2, backgroundColor: Colors.error + "12", borderRadius: 8, padding: 10, gap: 6 }}>
                    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 6 }}>
                      <Ionicons name="alert-circle-outline" size={15} color={Colors.error} style={{ marginTop: 1 }} />
                      <Text style={{ flex: 1, fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.error, lineHeight: 17 }}>{locationError}</Text>
                    </View>
                    {locationNeedsSettings && (
                      <Pressable onPress={() => Linking.openSettings()} style={{ alignSelf: "flex-start", backgroundColor: Colors.error, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 5 }}>
                        <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: "#FFF" }}>Open Settings</Text>
                      </Pressable>
                    )}
                  </View>
                )}
                <View style={styles.orDivider}>
                  <View style={styles.orLine} />
                  <Text style={styles.orText}>OR</Text>
                  <View style={styles.orLine} />
                </View>
                <View style={[styles.linkInputRow, !!vendorForm.latitude && !!vendorForm.locationLink && { borderColor: Colors.success + "40" }]}>
                  <Ionicons name="link" size={18} color={Colors.primary} style={{ marginLeft: 14 }} />
                  <TextInput
                    style={[styles.input, { flex: 1, marginBottom: 0 }]}
                    placeholder="Paste Google Maps link here"
                    placeholderTextColor={Colors.textLight}
                    value={vendorForm.locationLink ?? ""}
                    onChangeText={handlePasteLocation}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  {resolvingLink && <ActivityIndicator size="small" color={Colors.primary} style={{ marginRight: 14 }} />}
                  {!!vendorForm.latitude && !!vendorForm.locationLink && !resolvingLink && (
                    <Ionicons name="checkmark-circle" size={18} color={Colors.success} style={{ marginRight: 14 }} />
                  )}
                </View>
                <TextInput
                  style={styles.input}
                  placeholder="Full Address *"
                  placeholderTextColor={Colors.textLight}
                  value={vendorForm.address}
                  onChangeText={(v) => setVendorForm((p) => ({ ...p, address: v }))}
                  testID="vendor-address"
                />
                <TextInput
                  style={styles.input}
                  placeholder="City *"
                  placeholderTextColor={Colors.textLight}
                  value={vendorForm.city}
                  onChangeText={(v) => setVendorForm((p) => ({ ...p, city: v }))}
                  testID="vendor-city"
                />
                <TextInput
                  style={styles.input}
                  placeholder="PIN Code * (6 digits)"
                  placeholderTextColor={Colors.textLight}
                  value={vendorForm.pinCode}
                  onChangeText={(v) => setVendorForm((p) => ({ ...p, pinCode: v.replace(/\D/g, "").slice(0, 6) }))}
                  keyboardType="number-pad"
                  maxLength={6}
                  testID="vendor-pincode"
                />

                <Text style={styles.formSection}>Legal & Bank Details</Text>
                <TextInput
                  style={styles.input}
                  placeholder="GST Number"
                  placeholderTextColor={Colors.textLight}
                  value={vendorForm.gstNumber}
                  autoCapitalize="characters"
                  onChangeText={(v) => setVendorForm((p) => ({ ...p, gstNumber: v }))}
                />
                <TextInput
                  style={styles.input}
                  placeholder="PAN Number"
                  placeholderTextColor={Colors.textLight}
                  value={vendorForm.panNumber}
                  autoCapitalize="characters"
                  onChangeText={(v) => setVendorForm((p) => ({ ...p, panNumber: v }))}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Bank Account Number"
                  placeholderTextColor={Colors.textLight}
                  keyboardType="number-pad"
                  value={vendorForm.bankAccount}
                  onChangeText={(v) => setVendorForm((p) => ({ ...p, bankAccount: v }))}
                />
                <TextInput
                  style={styles.input}
                  placeholder="IFSC Code"
                  placeholderTextColor={Colors.textLight}
                  value={vendorForm.ifscCode}
                  autoCapitalize="characters"
                  onChangeText={(v) => setVendorForm((p) => ({ ...p, ifscCode: v }))}
                />

                <Text style={styles.formSection}>Platform Commission on Product Sale</Text>
                <View style={styles.commissionRow}>
                  <TextInput
                    style={[styles.input, { width: 80, textAlign: "center" }]}
                    placeholder="10"
                    placeholderTextColor={Colors.textLight}
                    keyboardType="number-pad"
                    value={vendorForm.commissionRate}
                    onChangeText={(v) => setVendorForm((p) => ({ ...p, commissionRate: v }))}
                  />
                  <Text style={styles.commissionLabel}>% on every product sale</Text>
                </View>
                <View style={styles.commissionNote}>
                  <Ionicons name="information-circle" size={14} color={Colors.info} />
                  <Text style={styles.commissionNoteText}>This commission will be deducted from each product sale made by the vendor on the platform.</Text>
                </View>

                <Text style={styles.formSection}>Payment Methods Accepted</Text>
                <Text style={styles.formHint}>Select all payment methods the vendor accepts</Text>
                <View style={styles.paymentMethodGrid}>
                  {([
                    { id: "CASH" as const, label: "Cash", icon: "cash-outline" },
                    { id: "UPI" as const, label: "UPI", icon: "qr-code-outline" },
                    { id: "BANK_TRANSFER" as const, label: "Bank Transfer", icon: "business-outline" },
                    { id: "CHEQUE" as const, label: "Cheque", icon: "document-text-outline" },
                  ]).map((pm) => {
                    const isSelected = vendorForm.paymentMethods.includes(pm.id);
                    return (
                      <Pressable
                        key={pm.id}
                        style={[styles.paymentMethodBtn, isSelected && styles.paymentMethodBtnActive]}
                        onPress={() => {
                          setVendorForm((p) => ({
                            ...p,
                            paymentMethods: isSelected
                              ? p.paymentMethods.filter((m) => m !== pm.id)
                              : [...p.paymentMethods, pm.id],
                          }));
                          try { Haptics.selectionAsync(); } catch {}
                        }}
                      >
                        <Ionicons name={pm.icon as any} size={20} color={isSelected ? "#FFF" : Colors.textSecondary} />
                        <Text style={[styles.paymentMethodText, isSelected && { color: "#FFF" }]}>{pm.label}</Text>
                        {isSelected && <Ionicons name="checkmark-circle" size={16} color="#FFF" style={{ position: "absolute", top: 6, right: 6 }} />}
                      </Pressable>
                    );
                  })}
                </View>
                {vendorForm.paymentMethods.includes("UPI") && (
                  <>
                    <Text style={styles.addMemberLabel}>UPI ID</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="e.g. vendor@upi or 9876543210@paytm"
                      placeholderTextColor={Colors.textLight}
                      autoCapitalize="none"
                      value={vendorForm.upiId}
                      onChangeText={(v) => setVendorForm((p) => ({ ...p, upiId: v }))}
                    />
                  </>
                )}

                <Text style={styles.formSection}>Vendor Subscription Plan</Text>
                <Text style={styles.formHint}>Choose a plan for vendor to go live on the app</Text>
                <View style={styles.subscriptionGrid}>
                  {(() => {
                    const defaultRates = { MONTHLY: 999, QUARTERLY: 2499, HALF_YEARLY: 4499, ANNUAL: 7999 };
                    const rates = adminPricing?.vendorSubscriptionRates || defaultRates;
                    const monthly = rates.MONTHLY || 999;
                    const savePct = (dur: number, price: number) => {
                      const equiv = monthly * dur;
                      if (equiv <= price) return "";
                      return `Save ${Math.round(((equiv - price) / equiv) * 100)}%`;
                    };
                    return [
                      { id: "MONTHLY" as const, label: "Monthly", price: `₹${rates.MONTHLY.toLocaleString("en-IN")}/mo`, save: "" },
                      { id: "QUARTERLY" as const, label: "Quarterly", price: `₹${rates.QUARTERLY.toLocaleString("en-IN")}/3mo`, save: savePct(3, rates.QUARTERLY) },
                      { id: "HALF_YEARLY" as const, label: "Half Yearly", price: `₹${rates.HALF_YEARLY.toLocaleString("en-IN")}/6mo`, save: savePct(6, rates.HALF_YEARLY) },
                      { id: "ANNUAL" as const, label: "Annual", price: `₹${rates.ANNUAL.toLocaleString("en-IN")}/yr`, save: savePct(12, rates.ANNUAL) },
                    ];
                  })().map((plan) => {
                    const isSelected = vendorForm.subscriptionPlan === plan.id;
                    return (
                      <Pressable
                        key={plan.id}
                        style={[styles.subscriptionCard, isSelected && styles.subscriptionCardActive]}
                        onPress={() => {
                          setVendorForm((p) => ({ ...p, subscriptionPlan: plan.id }));
                          try { Haptics.selectionAsync(); } catch {}
                        }}
                      >
                        {isSelected && <View style={styles.subscriptionCheck}><Ionicons name="checkmark" size={12} color="#FFF" /></View>}
                        <Text style={[styles.subscriptionLabel, isSelected && { color: "#FFF" }]}>{plan.label}</Text>
                        <Text style={[styles.subscriptionPrice, isSelected && { color: "#FFF" }]}>{plan.price}</Text>
                        {plan.save ? <View style={[styles.saveBadge, isSelected && { backgroundColor: "rgba(255,255,255,0.25)" }]}><Text style={[styles.saveBadgeText, isSelected && { color: "#FFF" }]}>{plan.save}</Text></View> : null}
                      </Pressable>
                    );
                  })}
                </View>
              </ScrollView>

              {showLocationWarning && (
                <View style={{ marginHorizontal: 0, marginBottom: 10, backgroundColor: "#FEF9C3", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "#FDE047", gap: 8 }}>
                  <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
                    <Ionicons name="warning" size={18} color="#B45309" style={{ marginTop: 1 }} />
                    <Text style={{ flex: 1, fontFamily: "Inter_500Medium", fontSize: 13, color: "#78350F", lineHeight: 19 }}>
                      No shop location added. Location helps customers find this store on the map. Tap <Text style={{ fontFamily: "Inter_700Bold" }}>Submit for Approval</Text> again to continue without location, or add one above.
                    </Text>
                  </View>
                </View>
              )}
              {!!submitError && (
                <View style={{ marginBottom: 10, backgroundColor: "#FEE2E2", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "#FCA5A5", flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
                  <Ionicons name="alert-circle" size={20} color="#DC2626" style={{ marginTop: 1, flexShrink: 0 }} />
                  <Text style={{ flex: 1, fontFamily: "Inter_500Medium", fontSize: 13, color: "#991B1B", lineHeight: 19 }}>{submitError}</Text>
                </View>
              )}
              <View style={styles.formActions}>
                <Pressable
                  style={[styles.submitVendorBtn, submittingVendorApp && { opacity: 0.5 }]}
                  onPress={() => handleSubmitVendorApp()}
                  disabled={submittingVendorApp}
                  testID="submit-vendor-app"
                >
                  {submittingVendorApp
                    ? <ActivityIndicator size="small" color="#FFF" />
                    : <Ionicons name="paper-plane" size={20} color="#FFF" />
                  }
                  <Text style={styles.submitBtnText}>
                    {submittingVendorApp ? "Submitting..." : "Submit for Approval"}
                  </Text>
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { paddingHorizontal: 20, paddingBottom: 24 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  profileSection: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1, minWidth: 0 },
  profileText: { flex: 1, minWidth: 0 },
  avatarCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center", flexShrink: 0, position: "relative" },
  avatarImage: { width: 44, height: 44, borderRadius: 22 },
  avatarInitial: { fontFamily: "Poppins_700Bold", fontSize: 18, color: "#FFF" },
  avatarEditBadge: { position: "absolute", bottom: -2, right: -2, width: 16, height: 16, borderRadius: 8, backgroundColor: Colors.primary, alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: "#142F5E" },
  greeting: { fontFamily: "Poppins_400Regular", fontSize: 12, color: "rgba(255,255,255,0.7)" },
  name: { fontFamily: "Poppins_700Bold", fontSize: 18, color: "#FFF" },
  headerActions: { flexDirection: "row", gap: 8, flexShrink: 0 },
  addBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: Colors.primary, alignItems: "center", justifyContent: "center" },
  summaryRow: { flexDirection: "row", paddingHorizontal: 20, gap: 10, marginTop: -1, paddingTop: 20 },
  summaryCard: { flex: 1, backgroundColor: "#FFF", borderRadius: 16, padding: 14, alignItems: "center", gap: 4 },
  summaryValue: { fontFamily: "Poppins_700Bold", fontSize: 20, color: Colors.secondary },
  summaryLabel: { fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textSecondary },
  tabRow: { flexDirection: "row", marginHorizontal: 20, marginTop: 20, backgroundColor: "#FFF", borderRadius: 14, padding: 4 },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: "center" },
  tabActive: { backgroundColor: Colors.primary },
  tabText: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: Colors.textSecondary },
  tabTextActive: { color: "#FFF" },
  section: { marginTop: 16, paddingHorizontal: 20 },
  emptyCard: { backgroundColor: "#FFF", borderRadius: 16, padding: 40, alignItems: "center" },
  emptyText: { fontFamily: "Poppins_500Medium", fontSize: 14, color: Colors.textSecondary, marginTop: 12, textAlign: "center" },
  leadCard: { backgroundColor: "#FFF", borderRadius: 14, padding: 16, marginBottom: 10 },
  leadTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  leadName: { fontFamily: "Poppins_600SemiBold", fontSize: 15, color: Colors.text },
  leadPhone: { fontFamily: "Poppins_400Regular", fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  statusBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 3 },
  statusText: { fontFamily: "Poppins_600SemiBold", fontSize: 11 },
  advanceBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 12, paddingVertical: 8, borderWidth: 1, borderColor: Colors.primary, borderRadius: 10 },
  advanceBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: Colors.primary },
  appCard: { backgroundColor: "#FFF", borderRadius: 16, padding: 16, marginBottom: 12 },
  appHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  appIconWrap: { width: 42, height: 42, borderRadius: 12, backgroundColor: Colors.primary + "12", alignItems: "center", justifyContent: "center" },
  appBizName: { fontFamily: "Poppins_700Bold", fontSize: 15, color: Colors.text },
  appOwner: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary, marginTop: 1 },
  appDetails: { marginTop: 12, gap: 6, paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.borderLight },
  appDetailRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  appDetailText: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary },
  rejectionBox: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10, backgroundColor: Colors.error + "10", borderRadius: 10, padding: 10 },
  rejectionText: { fontFamily: "Poppins_500Medium", fontSize: 12, color: Colors.error, flex: 1 },
  liveBox: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10, backgroundColor: Colors.success + "10", borderRadius: 10, padding: 10 },
  liveText: { fontFamily: "Poppins_500Medium", fontSize: 12, color: Colors.success },
  earningsOverview: { marginBottom: 16 },
  earningsHero: { borderRadius: 18, padding: 20, alignItems: "center", gap: 4, marginBottom: 12 },
  earningsHeroLabel: { fontFamily: "Poppins_400Regular", fontSize: 13, color: "rgba(255,255,255,0.8)" },
  earningsHeroValue: { fontFamily: "Poppins_700Bold", fontSize: 32, color: "#FFF" },
  earningsStatsRow: { flexDirection: "row", gap: 8 },
  earningStat: { flex: 1, backgroundColor: "#FFF", borderRadius: 14, padding: 12, alignItems: "center", gap: 4 },
  earnStatIcon: { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  earnStatValue: { fontFamily: "Poppins_700Bold", fontSize: 14, color: Colors.secondary },
  earnStatLabel: { fontFamily: "Poppins_400Regular", fontSize: 10, color: Colors.textSecondary },
  earnSectionTitle: { fontFamily: "Poppins_700Bold", fontSize: 15, color: Colors.secondary, marginBottom: 10, marginTop: 4 },
  tierCard: { backgroundColor: "#FFF", borderRadius: 16, overflow: "hidden", marginBottom: 16 },
  tierItem: { flexDirection: "row", alignItems: "center", padding: 14, gap: 12, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  tierName: { fontFamily: "Poppins_700Bold", fontSize: 14, color: Colors.text },
  tierRange: { fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textSecondary, marginTop: 1 },
  tierRate: { fontFamily: "Poppins_700Bold", fontSize: 13, color: Colors.text },
  currentTag: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  currentTagText: { fontFamily: "Poppins_600SemiBold", fontSize: 9, color: "#FFF" },
  targetSection: { marginBottom: 16 },
  targetHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  targetCard: { backgroundColor: "#FFF", borderRadius: 16, padding: 16 },
  targetRow: { flexDirection: "row", alignItems: "baseline", gap: 6, marginBottom: 8 },
  targetProgress: { fontFamily: "Poppins_700Bold", fontSize: 22, color: Colors.secondary },
  targetLabel: { fontFamily: "Poppins_400Regular", fontSize: 13, color: Colors.textSecondary },
  progressTrack: { height: 10, backgroundColor: Colors.background, borderRadius: 5, overflow: "hidden", marginBottom: 8 },
  progressFill: { height: 10, borderRadius: 5 },
  targetNote: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary },
  commissionRow: { flexDirection: "row", alignItems: "center", backgroundColor: "#FFF", borderRadius: 14, padding: 14, marginBottom: 8, gap: 12 },
  commissionIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  commissionLead: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: Colors.text },
  commissionDate: { fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  commissionAmount: { fontFamily: "Poppins_700Bold", fontSize: 14, color: Colors.secondary },
  commissionStatus: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2, marginTop: 2 },
  commissionStatusText: { fontFamily: "Poppins_600SemiBold", fontSize: 10 },
  withdrawMainBtn: { borderRadius: 16, overflow: "hidden", marginTop: 16 },
  withdrawGradient: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 16 },
  withdrawText: { fontFamily: "Poppins_700Bold", fontSize: 16, color: "#FFF" },
  viewFullBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 14, marginTop: 8, borderWidth: 1.5, borderColor: Colors.primary, borderRadius: 14 },
  viewFullBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: Colors.primary },
  incentiveBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginHorizontal: 20, paddingVertical: 14, backgroundColor: Colors.primary, borderRadius: 14, marginTop: 24 },
  incentiveBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 15, color: "#FFF" },
  legalCard: { backgroundColor: "#FFF", borderRadius: 16, marginHorizontal: 20, marginTop: 20, overflow: "hidden" },
  legalItem: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16 },
  legalBorder: { borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  legalIconBg: { width: 38, height: 38, borderRadius: 10, backgroundColor: Colors.primary + "12", alignItems: "center", justifyContent: "center" },
  legalLabel: { fontFamily: "Poppins_500Medium", fontSize: 14, color: Colors.text },
  logoutBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginHorizontal: 20, paddingVertical: 14, backgroundColor: Colors.error + "10", borderRadius: 14, marginTop: 12 },
  logoutText: { fontFamily: "Poppins_600SemiBold", fontSize: 15, color: Colors.error },
  deleteAccountButton: { flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "center" as const, gap: 6, marginTop: 12, marginHorizontal: 20, paddingVertical: 12 },
  deleteAccountText: { fontFamily: "Poppins_500Medium", fontSize: 13, color: "#DC2626" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalContent: { backgroundColor: "#FFF", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 },
  vendorFormModal: { backgroundColor: "#FFF", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: "90%" },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  modalTitle: { fontFamily: "Poppins_700Bold", fontSize: 20, color: Colors.secondary },
  formSection: { fontFamily: "Poppins_700Bold", fontSize: 14, color: Colors.secondary, marginBottom: 10, marginTop: 8 },
  input: {
    backgroundColor: Colors.surfaceAlt,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 13,
    fontFamily: "Poppins_500Medium",
    fontSize: 14,
    color: Colors.text,
    marginBottom: 10,
  },
  rowInputs: { flexDirection: "row", gap: 10 },
  pickerBtn: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: Colors.surfaceAlt, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, marginBottom: 10 },
  pickerText: { fontFamily: "Poppins_500Medium", fontSize: 14, color: Colors.text },
  categoryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  categoryChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, backgroundColor: "#FFF" },
  categoryChipText: { fontFamily: "Poppins_500Medium", fontSize: 12, color: Colors.text },
  commissionRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  commissionLabel: { fontFamily: "Poppins_500Medium", fontSize: 14, color: Colors.textSecondary },
  submitBtn: { backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 16, alignItems: "center", marginTop: 8 },
  submitVendorBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 14, flex: 1 },
  submitBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: "#FFF" },
  formActions: { flexDirection: "row", gap: 10, marginTop: 14 },
  subCategoryList: { backgroundColor: Colors.surfaceAlt, borderRadius: 14, marginBottom: 12, maxHeight: 180 },
  subCategoryItem: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: Colors.borderLight, borderWidth: 1, borderColor: "transparent", borderRadius: 10, marginHorizontal: 4, marginVertical: 2 },
  subCategoryItemText: { fontFamily: "Poppins_500Medium", fontSize: 13, color: Colors.text, flex: 1 },
  photoSection: { marginBottom: 8 },
  photoThumb: { width: 72, height: 72, borderRadius: 12, overflow: "hidden", position: "relative" as const },
  photoImage: { width: 72, height: 72, borderRadius: 12 },
  photoRemoveBtn: { position: "absolute" as const, top: -2, right: -2, backgroundColor: "#FFF", borderRadius: 11 },
  addPhotoBtn: { width: 72, height: 72, borderRadius: 12, borderWidth: 1.5, borderColor: Colors.primary + "40", borderStyle: "dashed" as const, alignItems: "center" as const, justifyContent: "center" as const, gap: 2, backgroundColor: Colors.primary + "08" },
  addPhotoText: { fontFamily: "Poppins_500Medium", fontSize: 10, color: Colors.primary },
  photoHint: { fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textSecondary, marginTop: 6 },
  locationPickBtn: { flexDirection: "row" as const, alignItems: "center" as const, gap: 8, backgroundColor: Colors.primary + "10", borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 10, borderWidth: 1, borderColor: Colors.primary + "30" },
  locationPickText: { fontFamily: "Poppins_500Medium", fontSize: 13, color: Colors.primary, flex: 1 },
  orDivider: { flexDirection: "row" as const, alignItems: "center" as const, marginVertical: 4, marginBottom: 10 },
  orLine: { flex: 1, height: 1, backgroundColor: Colors.border },
  orText: { fontFamily: "Poppins_500Medium", fontSize: 11, color: Colors.textLight, marginHorizontal: 12 },
  linkInputRow: { flexDirection: "row" as const, alignItems: "center" as const, backgroundColor: Colors.primary + "08", borderRadius: 14, borderWidth: 1, borderColor: Colors.primary + "20", marginBottom: 10 },
  addMemberLabel: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: Colors.secondary, marginBottom: 6, marginTop: 8 },
  commissionNote: { flexDirection: "row" as const, alignItems: "flex-start" as const, gap: 6, backgroundColor: Colors.info + "10", borderRadius: 10, padding: 10, marginBottom: 8 },
  commissionNoteText: { fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.info, flex: 1, lineHeight: 16 },
  formHint: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary, marginBottom: 10 },
  paymentMethodGrid: { flexDirection: "row" as const, flexWrap: "wrap" as const, gap: 8, marginBottom: 10 },
  paymentMethodBtn: { width: "47%" as any, flexDirection: "row" as const, alignItems: "center" as const, gap: 8, paddingVertical: 14, paddingHorizontal: 14, borderRadius: 14, backgroundColor: Colors.surfaceAlt, borderWidth: 1.5, borderColor: "transparent", position: "relative" as const },
  paymentMethodBtnActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  paymentMethodText: { fontFamily: "Poppins_600SemiBold", fontSize: 12, color: Colors.text },
  subscriptionGrid: { gap: 8, marginBottom: 10 },
  subscriptionCard: { flexDirection: "row" as const, alignItems: "center" as const, gap: 12, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 14, backgroundColor: Colors.surfaceAlt, borderWidth: 1.5, borderColor: "transparent", position: "relative" as const },
  subscriptionCardActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  subscriptionCheck: { width: 20, height: 20, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.3)", alignItems: "center" as const, justifyContent: "center" as const },
  subscriptionLabel: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: Colors.text, flex: 1 },
  subscriptionPrice: { fontFamily: "Poppins_700Bold", fontSize: 14, color: Colors.secondary },
  saveBadge: { backgroundColor: Colors.success + "15", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  saveBadgeText: { fontFamily: "Poppins_600SemiBold", fontSize: 10, color: Colors.success },
});

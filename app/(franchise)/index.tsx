import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Platform, Modal, TextInput, ActivityIndicator, Alert, Linking } from "react-native";
import * as Location from "expo-location";
import MapLocationPicker from "@/components/MapLocationPicker";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useApp } from "@/lib/store";
import { getApiUrl, apiRequest, getAuthToken } from "@/lib/query-client";
import { VendorApplication, TeamMember, SubCategory } from "@/lib/types";
import { categories, subCategories } from "@/lib/data";

function getTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  return `${Math.floor(hrs / 24)} day ago`;
}

function getOrderStatusColor(status: string): string {
  switch (status) {
    case "PENDING": return "#F59E0B";
    case "ACCEPTED": return "#3B82F6";
    case "PREPARING": return "#F59E0B";
    case "READY": return "#FF6B00";
    case "PICKED": return "#6366F1";
    case "ON_THE_WAY": return "#10B981";
    case "DELIVERED": return "#059669";
    case "CANCELLED": return "#EF4444";
    default: return "#6B7280";
  }
}

const appStatusColors: Record<string, string> = {
  PENDING: Colors.warning,
  APPROVED: Colors.info,
  REJECTED: Colors.error,
  LIVE: Colors.success,
};

type TabType = "overview" | "orders" | "approvals" | "team" | "subcats" | "ads";

export default function FranchiseDashboard() {
  const insets = useSafeAreaInsets();
  const { user, vendorApplications, reviewVendorApplication, makeVendorLive, logout, orders, teamMembers, addTeamMember, removeTeamMember, toggleTeamMemberStatus, editTeamMember, liveVendors, reloadVendors, customSubCategories, addSubCategory, removeSubCategory, adRequests, reviewAdRequestFranchise, refreshAdRequests, notifications } = useApp();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;
  const [activeTab, setActiveTab] = useState<TabType>("overview");
  const [selectedApp, setSelectedApp] = useState<VendorApplication | null>(null);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [rejectAppId, setRejectAppId] = useState("");
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [teamFilter, setTeamFilter] = useState<"All" | "Marketing" | "Delivery">("All");
  const [newMemberRole, setNewMemberRole] = useState<"MARKETING" | "DELIVERY">("MARKETING");
  const [newMemberName, setNewMemberName] = useState("");
  const [newMemberPhone, setNewMemberPhone] = useState("");
  const [newMemberEmail, setNewMemberEmail] = useState("");
  const [newMemberCity, setNewMemberCity] = useState("Malegaon");
  const [newMemberAadhaar, setNewMemberAadhaar] = useState("");
  const [newMemberPan, setNewMemberPan] = useState("");
  const [newMemberDob, setNewMemberDob] = useState("");
  const [newMemberGender, setNewMemberGender] = useState<"Male" | "Female" | "Other">("Male");
  const [newMemberAddress, setNewMemberAddress] = useState("");
  const [newMemberEmergencyName, setNewMemberEmergencyName] = useState("");
  const [newMemberEmergencyPhone, setNewMemberEmergencyPhone] = useState("");
  const [newMemberBankName, setNewMemberBankName] = useState("");
  const [newMemberAccountNo, setNewMemberAccountNo] = useState("");
  const [newMemberIfsc, setNewMemberIfsc] = useState("");
  const [newMemberAccountHolder, setNewMemberAccountHolder] = useState("");
  const [newMemberVehicle, setNewMemberVehicle] = useState("");
  const [newMemberDL, setNewMemberDL] = useState("");
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [editMember, setEditMember] = useState<TeamMember | null>(null);
  const [editMemberName, setEditMemberName] = useState("");
  const [editMemberPhone, setEditMemberPhone] = useState("");
  const [editMemberEmail, setEditMemberEmail] = useState("");
  const [editMemberCity, setEditMemberCity] = useState("");
  const [editMemberRole, setEditMemberRole] = useState<"MARKETING" | "DELIVERY">("MARKETING");
  const [editMemberTerritory, setEditMemberTerritory] = useState("");
  const [editMemberBankName, setEditMemberBankName] = useState("");
  const [editMemberAccountNumber, setEditMemberAccountNumber] = useState("");
  const [editMemberIfscCode, setEditMemberIfscCode] = useState("");
  const [editMemberAccountHolderName, setEditMemberAccountHolderName] = useState("");
  const [showAddSubCatModal, setShowAddSubCatModal] = useState(false);
  const [newSubCatName, setNewSubCatName] = useState("");
  const [newSubCatCategory, setNewSubCatCategory] = useState("");
  const [newSubCatIcon, setNewSubCatIcon] = useState("pricetag");
  const [confirmRemoveSubCatId, setConfirmRemoveSubCatId] = useState<string | null>(null);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [generatedImage, setGeneratedImage] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [isEditingVendor, setIsEditingVendor] = useState(false);
  const [isSavingVendor, setIsSavingVendor] = useState(false);
  const [editBizName, setEditBizName] = useState("");
  const [editOwnerName, setEditOwnerName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editCategoryId, setEditCategoryId] = useState("");
  const [editSubCategoryId, setEditSubCategoryId] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editCity, setEditCity] = useState("");
  const [editPinCode, setEditPinCode] = useState("");
  const [editGst, setEditGst] = useState("");
  const [editPan, setEditPan] = useState("");
  const [editBank, setEditBank] = useState("");
  const [editIfsc, setEditIfsc] = useState("");
  const [editCommission, setEditCommission] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editPhotos, setEditPhotos] = useState<string[]>([]);
  const [isPickingPhoto, setIsPickingPhoto] = useState(false);
  const [editLat, setEditLat] = useState("");
  const [editLng, setEditLng] = useState("");
  const [showMapPicker, setShowMapPicker] = useState(false);
  const [mapPickerCoords, setMapPickerCoords] = useState({ latitude: 20.5547, longitude: 74.5247 });
  const [franchiseLocPicker, setFranchiseLocPicker] = useState<{ appId: string; name: string } | null>(null);
  const [franchisePickerCoords, setFranchisePickerCoords] = useState({ latitude: 20.5547, longitude: 74.5247 });
  const [franchiseLocSaving, setFranchiseLocSaving] = useState(false);

  const isAppLocMissing = (app: VendorApplication) => {
    const lat = app.latitude ?? 0;
    const lng = app.longitude ?? 0;
    if (!lat || !lng) return true;
    if (Math.abs(lat - 20.5547) < 0.001 && Math.abs(lng - 74.5247) < 0.001) return true;
    return false;
  };
  const [googleMapsLink, setGoogleMapsLink] = useState("");
  const [mapsLinkLoading, setMapsLinkLoading] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);

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

  const allSubCategories = [...subCategories, ...customSubCategories];

  // activeOrders / totalRevenue computed below after myVendors is available

  // Auto-refresh ad requests every time the Ads tab is opened
  useEffect(() => {
    if (activeTab === "ads") {
      refreshAdRequests();
    }
  }, [activeTab]);

  const myPhone = user?.phone || "";
  const myPhoneNorm = myPhone.replace(/\D/g, "").slice(-10);

  // Franchise team: match by franchiseId (new field) OR createdBy name/phone (legacy data)
  const franchiseTeam = teamMembers.filter((m) => {
    if (m.role !== "MARKETING" && m.role !== "DELIVERY") return false;
    // New records: franchiseId is set to franchise owner's phone
    const mFranchise = (m.franchiseId || "").replace(/\D/g, "").slice(-10);
    if (mFranchise && mFranchise === myPhoneNorm) return true;
    // Legacy records: createdByRole is FRANCHISE and createdBy is franchise owner's name or phone
    if (m.createdByRole === "FRANCHISE") {
      if (m.createdBy === user?.name) return true;
      const createdByNorm = (m.createdBy || "").replace(/\D/g, "").slice(-10);
      if (createdByNorm && createdByNorm === myPhoneNorm) return true;
    }
    return false;
  });

  // Vendor applications: route by pin code (primary) or franchiseId (legacy fallback)
  const myTeamNames = new Set(franchiseTeam.map((m) => m.name));
  const myName = user?.name || "";
  // Find this franchise owner's own pin code from the team members list
  const myPinCode = (teamMembers.find((m) =>
    m.role === "FRANCHISE" &&
    (m.phone || "").replace(/\D/g, "").slice(-10) === myPhoneNorm
  )?.pinCode || "").trim();

  // Step 1: Build a direct vendor-ID set from the vendors table (no app dependency).
  // Each vendor's ID equals its originating application ID, so this is used to
  // anchor isMyApp for LIVE apps whose franchise_id/submittedBy fields are empty.
  const myVendorIdsDirect = new Set(
    liveVendors
      .filter((v) => {
        const vPinCode = (v.pinCode || "").trim();
        if (vPinCode && myPinCode) return vPinCode === myPinCode;
        const vFranchise = (v.franchiseId || "").replace(/\D/g, "").slice(-10);
        return vFranchise && vFranchise === myPhoneNorm;
      })
      .map((v) => v.id)
  );

  const isMyApp = (a: { id?: string; franchiseId?: string; submittedBy?: string; pinCode?: string }) => {
    const appPinCode = (a.pinCode || "").trim();
    const appFranchise = (a.franchiseId || "").replace(/\D/g, "").slice(-10);
    // Primary: both sides have pin codes — pin code is authoritative
    if (appPinCode && myPinCode) return appPinCode === myPinCode;
    // Explicit franchise ID assignment on the application
    if (appFranchise && appFranchise === myPhoneNorm) return true;
    // Anchor: the corresponding vendor (same ID) is already confirmed as mine
    if (a.id && myVendorIdsDirect.has(a.id)) return true;
    // Submitted by one of my team members (legacy apps without pin code / franchise ID)
    if (a.submittedBy && myTeamNames.has(a.submittedBy)) return true;
    // Submitted directly by me as franchise owner
    if (myName && a.submittedBy === myName) return true;
    return false;
  };

  // Step 2: Live vendor set — direct match + any matched via applications
  const liveAppIds = new Set(vendorApplications.filter((a) => a.status === "LIVE" && isMyApp(a)).map((a) => a.id));
  const myVendors = liveVendors.filter((v) => myVendorIdsDirect.has(v.id) || liveAppIds.has(v.id));
  const pendingApps = vendorApplications.filter((a) => a.status === "PENDING" && isMyApp(a));
  const approvedApps = vendorApplications.filter((a) => a.status === "APPROVED" && isMyApp(a));
  const liveApps = vendorApplications.filter((a) => a.status === "LIVE" && isMyApp(a));
  const rejectedApps = vendorApplications.filter((a) => a.status === "REJECTED" && isMyApp(a));

  // Augmented executive/delivery count: also catch team members whose franchiseId isn't set yet
  // but who submitted vendor applications that belong to this franchise territory.
  // We use two sources of submitter names:
  //   1. All status-filtered apps that passed isMyApp (via franchise_id, pin, or vendor ID anchor)
  //   2. Direct lookup in vendorApplications where the app ID is in myVendorIdsDirect
  //      (catches pending/approved apps for live vendors even when franchise_id is empty)
  const myAppSubmitterNames = new Set([
    ...[...pendingApps, ...approvedApps, ...liveApps, ...rejectedApps]
      .filter((a) => a.submittedBy?.trim())
      .map((a) => a.submittedBy!.trim().toLowerCase()),
    ...vendorApplications
      .filter((a) => a.submittedBy?.trim() && myVendorIdsDirect.has(a.id))
      .map((a) => a.submittedBy!.trim().toLowerCase()),
  ]);
  const franchiseTeamIds = new Set(franchiseTeam.map((m) => m.id));
  const extraExecutives = teamMembers.filter(
    (m) => m.role === "MARKETING" && !franchiseTeamIds.has(m.id) && myAppSubmitterNames.has(m.name.trim().toLowerCase())
  );
  const extraDelivery = teamMembers.filter(
    (m) => m.role === "DELIVERY" && !franchiseTeamIds.has(m.id) && myAppSubmitterNames.has(m.name.trim().toLowerCase())
  );
  const executiveCount = franchiseTeam.filter((m) => m.role === "MARKETING").length + extraExecutives.length;
  const deliveryCount = franchiseTeam.filter((m) => m.role === "DELIVERY").length + extraDelivery.length;

  // Orders filtered to only this franchise's vendors
  const myVendorIds = new Set([
    ...myVendors.map((v) => v.id),
    ...liveApps.map((a) => a.id),
  ]);
  const myOrders = orders.filter((o) => myVendorIds.has(o.vendorId));
  const activeOrders = myOrders.filter((o) => !["DELIVERED", "CANCELLED"].includes(o.status));
  const completedOrders = myOrders.filter((o) => o.status === "DELIVERED");
  const totalRevenue = completedOrders.reduce((s, o) => s + o.totalAmount, 0);

  const filteredTeam = franchiseTeam.filter((m) => {
    if (teamFilter === "All") return true;
    if (teamFilter === "Marketing") return m.role === "MARKETING";
    return m.role === "DELIVERY";
  });
  const activeTeamCount = franchiseTeam.filter((m) => m.status === "ACTIVE").length;
  const inactiveTeamCount = franchiseTeam.filter((m) => m.status === "INACTIVE").length;

  const handleAddMember = async () => {
    if (!newMemberName.trim() || !newMemberPhone.trim() || newMemberAadhaar.replace(/\s/g, "").length !== 12) return;
    try {
      await addTeamMember({
        name: newMemberName.trim(),
        phone: "+91" + newMemberPhone.replace(/\D/g, "").slice(-10),
        email: newMemberEmail.trim(),
        role: newMemberRole,
        city: newMemberCity.trim() || "Malegaon",
        status: "ACTIVE",
        franchiseId: user?.phone || "",
        createdBy: user?.name || "Franchise",
        createdByRole: "FRANCHISE",
        aadhaarNumber: newMemberAadhaar.replace(/\s/g, ""),
        panNumber: newMemberPan.trim().toUpperCase(),
        dateOfBirth: newMemberDob.trim(),
        gender: newMemberGender,
        fullAddress: newMemberAddress.trim(),
        emergencyContactName: newMemberEmergencyName.trim(),
        emergencyContactPhone: newMemberEmergencyPhone.trim() ? "+91" + newMemberEmergencyPhone.replace(/\D/g, "").slice(-10) : undefined,
        bankName: newMemberBankName.trim(),
        accountNumber: newMemberAccountNo.trim(),
        ifscCode: newMemberIfsc.trim().toUpperCase(),
        accountHolderName: newMemberAccountHolder.trim(),
        vehicleNumber: newMemberRole === "DELIVERY" ? newMemberVehicle.trim().toUpperCase() : undefined,
        drivingLicenseNumber: newMemberRole === "DELIVERY" ? newMemberDL.trim().toUpperCase() : undefined,
      });
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
      setNewMemberName(""); setNewMemberPhone(""); setNewMemberEmail(""); setNewMemberCity("Malegaon");
      setNewMemberAadhaar(""); setNewMemberPan(""); setNewMemberDob(""); setNewMemberGender("Male");
      setNewMemberAddress(""); setNewMemberEmergencyName(""); setNewMemberEmergencyPhone("");
      setNewMemberBankName(""); setNewMemberAccountNo(""); setNewMemberIfsc(""); setNewMemberAccountHolder("");
      setNewMemberVehicle(""); setNewMemberDL("");
      setNewMemberRole("MARKETING");
      setShowAddMemberModal(false);
    } catch (err: any) {
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); } catch {}
      Alert.alert("Failed to Save", err?.message || "Could not save team member. Please check your connection and try again.");
    }
  };

  const handleRemoveMember = (memberId: string) => {
    removeTeamMember(memberId);
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); } catch {}
    setConfirmRemoveId(null);
  };

  const stats = [
    { label: "Total Revenue", value: `\u20B9${totalRevenue.toLocaleString("en-IN")}`, icon: "cash", color: Colors.success, tab: "orders" as TabType },
    { label: "Active Orders", value: String(activeOrders.length), icon: "receipt", color: Colors.primary, tab: "orders" as TabType },
    { label: "Pending Approvals", value: String(pendingApps.length), icon: "time", color: Colors.warning, tab: "approvals" as TabType },
    { label: "Live Vendors", value: String(myVendors.length), icon: "storefront", color: Colors.info, tab: "approvals" as TabType },
  ];

  const handleApprove = async (appId: string) => {
    const ok = await reviewVendorApplication(appId, "APPROVED");
    if (!ok) {
      Alert.alert("Error", "Failed to approve application. Please check your connection and try again.");
      return;
    }
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
    setSelectedApp(null);
  };

  const handleReject = async () => {
    if (rejectionReason.trim()) {
      const ok = await reviewVendorApplication(rejectAppId, "REJECTED", rejectionReason);
      if (!ok) {
        Alert.alert("Error", "Failed to reject application. Please check your connection and try again.");
        return;
      }
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); } catch {}
      setShowRejectModal(false);
      setRejectionReason("");
      setRejectAppId("");
      setSelectedApp(null);
    }
  };

  const handleMakeLive = async (appId: string) => {
    const ok = await makeVendorLive(appId);
    if (!ok) {
      Alert.alert("Error", "Failed to make vendor live. Please check your connection and try again.");
      return;
    }
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
    setSelectedApp(null);
  };

  const startEditVendor = (app: VendorApplication) => {
    setEditBizName(app.businessName);
    setEditOwnerName(app.ownerName);
    setEditPhone(app.phone);
    setEditEmail(app.email || "");
    setEditCategoryId(app.categoryId);
    setEditSubCategoryId((app as any).subCategoryId || "");
    setEditAddress(app.address);
    setEditCity(app.city);
    setEditPinCode(app.pinCode || "");
    setEditGst(app.gstNumber || "");
    setEditPan(app.panNumber || "");
    setEditBank(app.bankAccount || "");
    setEditIfsc(app.ifscCode || "");
    setEditCommission(String(app.commissionRate ?? ""));
    setEditDescription(app.description || "");
    setEditLat(String((app as any).latitude || ""));
    setEditLng(String((app as any).longitude || ""));
    setGoogleMapsLink((app as any).locationLink || "");
    // Load existing usable photos (skip expired blob: and file: URIs)
    const existingPhotos: string[] = Array.isArray((app as any).photos) ? (app as any).photos : [];
    setEditPhotos(existingPhotos.filter((p: string) => p.startsWith("http") || p.startsWith("data:")));
    setIsEditingVendor(true);
  };

  const toEditDataUri = (asset: ImagePicker.ImagePickerAsset): string | null => {
    if (asset.base64) return `data:image/jpeg;base64,${asset.base64}`;
    return null; // file:// / content:// URIs can't be stored in the DB
  };

  const handlePickEditPhotos = async () => {
    setIsPickingPhoto(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        selectionLimit: 5 - editPhotos.length,
        quality: 0.4,
        base64: true,
      });
      if (!result.canceled && result.assets) {
        const uris = result.assets.map(toEditDataUri).filter((u): u is string => u !== null);
        if (uris.length === 0) {
          Alert.alert("Upload Failed", "Could not read photo data. Please try again with a smaller image.");
          return;
        }
        setEditPhotos((p) => [...p, ...uris].slice(0, 5));
      }
    } catch {
      Alert.alert("Error", "Could not pick photos.");
    } finally {
      setIsPickingPhoto(false);
    }
  };

  const handleUseGPS = async () => {
    setGpsLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission denied", "Allow location access to use GPS.");
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const lat = loc.coords.latitude.toFixed(6);
      const lng = loc.coords.longitude.toFixed(6);
      setEditLat(lat);
      setEditLng(lng);
      setMapPickerCoords({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
    } catch {
      Alert.alert("Error", "Could not get GPS location. Make sure location is enabled.");
    } finally {
      setGpsLoading(false);
    }
  };

  const parseGoogleMapsLink = async (url: string): Promise<boolean> => {
    if (!url.trim()) return false;
    // Try client-side patterns first
    const patterns = [
      /@(-?\d+\.?\d*),(-?\d+\.?\d*)/,
      /q=(-?\d+\.?\d*),(-?\d+\.?\d*)/,
      /ll=(-?\d+\.?\d*),(-?\d+\.?\d*)/,
      /!3d(-?\d+\.?\d+)!4d(-?\d+\.?\d+)/,
      /(-?\d+\.\d{4,})\s*,\s*(-?\d+\.\d{4,})/,
    ];
    for (const p of patterns) {
      const m = url.match(p);
      if (m) {
        const lat = parseFloat(m[1]), lng = parseFloat(m[2]);
        if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 && Math.abs(lat) > 0.001) {
          setEditLat(String(lat)); setEditLng(String(lng)); return true;
        }
      }
    }
    // Fall back to server-side resolution (handles short links, redirects, HTML parsing)
    setMapsLinkLoading(true);
    try {
      const apiUrl = getApiUrl();
      const res = await fetch(new URL("/api/resolve-location", apiUrl).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ link: url }),
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        if (data.lat && data.lng) { setEditLat(String(data.lat)); setEditLng(String(data.lng)); setMapsLinkLoading(false); return true; }
      }
    } catch {}
    setMapsLinkLoading(false);
    return false;
  };

  const handleSaveVendorEdit = async () => {
    if (!selectedApp) return;
    if (!editBizName.trim() || !editOwnerName.trim() || !editPhone.trim()) {
      Alert.alert("Error", "Business name, owner name, and phone are required.");
      return;
    }
    setIsSavingVendor(true);
    try {
      // If a Google Maps link is provided but no coords resolved yet, try to resolve now
      if (googleMapsLink.trim() && (!editLat.trim() || !editLng.trim())) {
        await parseGoogleMapsLink(googleMapsLink.trim());
      }
      const res = await apiRequest("PATCH", `/api/vendor-applications/${selectedApp.id}/fields`, {
        businessName: editBizName.trim(),
        ownerName: editOwnerName.trim(),
        phone: editPhone.trim(),
        email: editEmail.trim(),
        categoryId: editCategoryId,
        subCategoryId: editSubCategoryId || null,
        address: editAddress.trim(),
        city: editCity.trim(),
        pinCode: editPinCode.trim(),
        gstNumber: editGst.trim(),
        panNumber: editPan.trim(),
        bankAccount: editBank.trim(),
        ifscCode: editIfsc.trim(),
        commissionRate: Number(editCommission) || 0,
        description: editDescription.trim(),
        photos: editPhotos,
        ...(googleMapsLink.trim() ? { locationLink: googleMapsLink.trim() } : {}),
        ...(editLat.trim() && editLng.trim() ? { latitude: Number(editLat), longitude: Number(editLng) } : {}),
      });
      if (!res.ok) {
        Alert.alert("Error", "Failed to save changes. Please try again.");
        return;
      }
      const data = await res.json();
      setSelectedApp(data.application as VendorApplication);
      setIsEditingVendor(false);
      // Refresh live vendor list so updated image is reflected immediately
      reloadVendors();
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
    } catch {
      Alert.alert("Error", "Failed to save changes. Please try again.");
    } finally {
      setIsSavingVendor(false);
    }
  };

  const handleFranchiseLocConfirm = async () => {
    if (!franchiseLocPicker) return;
    setFranchiseLocSaving(true);
    try {
      const res = await apiRequest("PATCH", `/api/vendor-applications/${franchiseLocPicker.appId}/fields`, {
        latitude: franchisePickerCoords.latitude,
        longitude: franchisePickerCoords.longitude,
      });
      if (!res.ok) {
        Alert.alert("Error", "Failed to save location. Please try again.");
        return;
      }
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
      Alert.alert("Saved", `Location updated for ${franchiseLocPicker.name}`);
      setFranchiseLocPicker(null);
      reloadVendors();
    } catch {
      Alert.alert("Error", "Network error. Please try again.");
    } finally {
      setFranchiseLocSaving(false);
    }
  };

  const renderAppCard = (app: VendorApplication) => {
    const cat = categories.find((c) => c.id === app.categoryId);
    const locMissing = isAppLocMissing(app);
    return (
      <Pressable key={app.id} style={styles.appCard} onPress={() => setSelectedApp(app)}>
        <View style={styles.appHeader}>
          <View style={[styles.appIconWrap, { backgroundColor: (cat?.color || Colors.primary) + "15" }]}>
            <Ionicons name={(cat?.icon || "storefront") as any} size={20} color={cat?.color || Colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.appBizName}>{app.businessName}</Text>
            <Text style={styles.appOwner}>{app.ownerName} | {app.city}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: appStatusColors[app.status] + "18" }]}>
            <Text style={[styles.statusText, { color: appStatusColors[app.status] }]}>{app.status}</Text>
          </View>
        </View>
        <View style={[styles.appMeta, { flexWrap: "wrap", gap: 6 }]}>
          <Text style={styles.appMetaText}>By: {app.submittedBy}</Text>
          <Text style={styles.appMetaText}>{new Date(app.submittedAt).toLocaleDateString("en-IN")}</Text>
          {locMissing && (
            <Pressable
              style={{ flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "#FEE2E2", borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 }}
              onPress={(e) => {
                e.stopPropagation();
                try { Haptics.selectionAsync(); } catch {}
                setFranchisePickerCoords({ latitude: (app.latitude && app.latitude > 1) ? app.latitude : 20.5547, longitude: (app.longitude && app.longitude > 1) ? app.longitude : 74.5247 });
                setFranchiseLocPicker({ appId: app.id, name: app.businessName });
              }}
            >
              <Ionicons name="location-outline" size={11} color="#DC2626" />
              <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 10, color: "#DC2626" }}>No location — tap to fix</Text>
            </Pressable>
          )}
        </View>
        {app.status === "PENDING" && (
          <View style={styles.actionRow}>
            <Pressable
              style={styles.approveBtn}
              onPress={() => handleApprove(app.id)}
              testID={`approve-${app.id}`}
            >
              <Ionicons name="checkmark" size={18} color="#FFF" />
              <Text style={styles.actionBtnText}>Approve</Text>
            </Pressable>
            <Pressable
              style={styles.rejectBtn}
              onPress={() => { setRejectAppId(app.id); setShowRejectModal(true); }}
              testID={`reject-${app.id}`}
            >
              <Ionicons name="close" size={18} color={Colors.error} />
              <Text style={[styles.actionBtnText, { color: Colors.error }]}>Reject</Text>
            </Pressable>
          </View>
        )}
        {app.status === "APPROVED" && (
          <Pressable
            style={styles.liveBtn}
            onPress={() => handleMakeLive(app.id)}
            testID={`make-live-${app.id}`}
          >
            <Ionicons name="rocket" size={18} color="#FFF" />
            <Text style={styles.actionBtnText}>Make Live</Text>
          </Pressable>
        )}
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ paddingBottom: bottomInset + 40 }} showsVerticalScrollIndicator={false}>
        <LinearGradient colors={["#0B1E3D", "#142F5E"]} style={[styles.header, { paddingTop: topInset + 12 }]}>
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.greeting}>Welcome, {user?.name}</Text>
              <Text style={styles.territory}>{teamMembers.find((m) => m.phone.replace(/\D/g, "").slice(-10) === myPhoneNorm)?.territory || user?.city || "My Territory"}</Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Pressable style={styles.browseBtn} onPress={() => { try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {} router.push("/(customer)" as any); }}>
                <Ionicons name="bag-handle-outline" size={18} color="#FFF" />
              </Pressable>
              <Pressable style={styles.browseBtn} onPress={() => router.push("/notifications" as any)}>
                <Ionicons name="notifications-outline" size={18} color="#FFF" />
                {notifications.filter(n => !n.read).length > 0 && (
                  <View style={{ position: "absolute", top: -4, right: -4, backgroundColor: "#EF4444", borderRadius: 10, minWidth: 18, height: 18, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 }}>
                    <Text style={{ fontFamily: "Poppins_700Bold", fontSize: 10, color: "#FFF" }}>{notifications.filter(n => !n.read).length > 99 ? "99+" : notifications.filter(n => !n.read).length}</Text>
                  </View>
                )}
              </Pressable>
              <Pressable style={styles.profileBtn} onPress={() => setShowProfileMenu(true)}>
                <Ionicons name="person-circle" size={38} color="#FFF" />
              </Pressable>
            </View>
          </View>

          <View style={styles.statsGrid}>
            {stats.map((s) => (
              <Pressable key={s.label} style={styles.statCard} onPress={() => setActiveTab(s.tab)}>
                <Ionicons name={s.icon as any} size={20} color={s.color} />
                <Text style={styles.statValue}>{s.value}</Text>
                <Text style={styles.statLabel}>{s.label}</Text>
              </Pressable>
            ))}
          </View>
        </LinearGradient>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabScroll} contentContainerStyle={styles.tabRow}>
          {([
            { key: "overview" as TabType, label: "Overview", badge: "" },
            { key: "orders" as TabType, label: "Orders", badge: activeOrders.length > 0 ? String(activeOrders.length) : "" },
            { key: "approvals" as TabType, label: "Approvals", badge: pendingApps.length > 0 ? String(pendingApps.length) : "" },
            { key: "team" as TabType, label: "Team", badge: franchiseTeam.length > 0 ? String(franchiseTeam.length) : "" },
            { key: "subcats" as TabType, label: "Sub-Cats", badge: customSubCategories.length > 0 ? String(customSubCategories.length) : "" },
            { key: "ads" as TabType, label: "Ads", badge: adRequests.filter(a => a.status === "PENDING_FRANCHISE").length > 0 ? String(adRequests.filter(a => a.status === "PENDING_FRANCHISE").length) : "" },
          ]).map((tab) => (
            <Pressable
              key={tab.key}
              style={[styles.tab, activeTab === tab.key && styles.tabActive]}
              onPress={() => setActiveTab(tab.key)}
            >
              <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
                {tab.label}{tab.badge ? ` (${tab.badge})` : ""}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {activeTab === "overview" && (
          <>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Territory Stats</Text>
              <View style={styles.quickGrid}>
                {[
                  { label: "Vendors", icon: "storefront", count: String(myVendors.length), tab: "approvals" as TabType },
                  { label: "Executives", icon: "people", count: String(executiveCount), tab: "team" as TabType },
                  { label: "Delivery", icon: "bicycle", count: String(deliveryCount), tab: "team" as TabType },
                  { label: "Revenue", icon: "wallet", count: `\u20B9${totalRevenue.toLocaleString("en-IN")}`, tab: "orders" as TabType },
                ].map((a) => (
                  <Pressable key={a.label} style={styles.quickCard} onPress={() => {
                    if (a.label === "Revenue") {
                      router.push("/franchise-revenue" as any);
                    } else {
                      setActiveTab(a.tab);
                      if (a.label === "Executives") setTeamFilter("Marketing");
                      else if (a.label === "Delivery") setTeamFilter("Delivery");
                      else if (a.label === "Vendors") setTeamFilter("All");
                    }
                    try { Haptics.selectionAsync(); } catch {}
                  }}>
                    <View style={styles.quickIcon}>
                      <Ionicons name={a.icon as any} size={24} color={Colors.primary} />
                    </View>
                    <Text style={styles.quickLabel}>{a.label}</Text>
                    {a.count ? <Text style={styles.quickCount}>{a.count}</Text> : null}
                  </Pressable>
                ))}
              </View>
            </View>

            {pendingApps.length > 0 && (
              <View style={styles.section}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                  <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Pending Approvals</Text>
                  <Pressable onPress={() => setActiveTab("approvals")} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <Text style={{ fontFamily: "Poppins_600SemiBold", fontSize: 13, color: Colors.primary }}>Review</Text>
                    <Ionicons name="chevron-forward" size={14} color={Colors.primary} />
                  </Pressable>
                </View>
                {pendingApps.slice(0, 2).map(renderAppCard)}
              </View>
            )}

            <View style={styles.section}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Recent Orders</Text>
                {myOrders.length > 0 && (
                  <Pressable onPress={() => setActiveTab("orders")} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <Text style={{ fontFamily: "Poppins_600SemiBold", fontSize: 13, color: Colors.primary }}>View All</Text>
                    <Ionicons name="chevron-forward" size={14} color={Colors.primary} />
                  </Pressable>
                )}
              </View>
              {myOrders.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Ionicons name="receipt-outline" size={36} color={Colors.textLight} />
                  <Text style={styles.emptyText}>No orders yet</Text>
                </View>
              ) : (
                myOrders.slice(0, 5).map((order) => {
                  const timeAgo = getTimeAgo(order.createdAt);
                  return (
                    <Pressable key={order.id} style={styles.orderRow} onPress={() => setSelectedOrder(order)}>
                      <View style={styles.orderIcon}>
                        <Ionicons name="receipt" size={18} color={Colors.primary} />
                      </View>
                      <View style={styles.orderInfo}>
                        <Text style={styles.orderVendor}>{order.vendorName}</Text>
                        <Text style={styles.orderTime}>{timeAgo} | {order.status.replace(/_/g, " ")}</Text>
                      </View>
                      <Text style={styles.orderAmount}>{"\u20B9"}{order.totalAmount.toLocaleString("en-IN")}</Text>
                      <Ionicons name="chevron-forward" size={16} color={Colors.textLight} />
                    </Pressable>
                  );
                })
              )}
            </View>
          </>
        )}

        {activeTab === "orders" && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>All Territory Orders ({myOrders.length})</Text>
            {myOrders.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons name="receipt-outline" size={40} color={Colors.textLight} />
                <Text style={styles.emptyText}>No orders in your territory yet</Text>
              </View>
            ) : (
              myOrders.map((order) => {
                const statusColor = getOrderStatusColor(order.status);
                return (
                  <Pressable key={order.id} style={[styles.fullOrderCard, { borderLeftWidth: 4, borderLeftColor: statusColor }]} onPress={() => setSelectedOrder(order)}>
                    <View style={styles.fullOrderTop}>
                      <Text style={styles.fullOrderId}>#{order.id}</Text>
                      <View style={[styles.statusBadge, { backgroundColor: statusColor + "18" }]}>
                        <Text style={[styles.statusText, { color: statusColor }]}>{order.status.replace(/_/g, " ")}</Text>
                      </View>
                    </View>
                    <View style={styles.fullOrderDetails}>
                      <View style={styles.fullOrderRow}>
                        <Ionicons name="storefront" size={14} color={Colors.textSecondary} />
                        <Text style={styles.fullOrderLabel}>{order.vendorName}</Text>
                      </View>
                      {order.customerName ? (
                        <View style={styles.fullOrderRow}>
                          <Ionicons name="person" size={14} color={Colors.textSecondary} />
                          <Text style={styles.fullOrderLabel}>{order.customerName}</Text>
                        </View>
                      ) : null}
                      <View style={styles.fullOrderRow}>
                        <Ionicons name="location" size={14} color={Colors.textSecondary} />
                        <Text style={styles.fullOrderLabel} numberOfLines={1}>{order.deliveryAddress}</Text>
                      </View>
                      {order.deliveryPartnerName ? (
                        <View style={styles.fullOrderRow}>
                          <Ionicons name="bicycle" size={14} color={Colors.info} />
                          <Text style={[styles.fullOrderLabel, { color: Colors.info }]}>{order.deliveryPartnerName}</Text>
                        </View>
                      ) : (
                        <View style={styles.fullOrderRow}>
                          <Ionicons name="alert-circle" size={14} color={Colors.warning} />
                          <Text style={[styles.fullOrderLabel, { color: Colors.warning }]}>No delivery partner assigned</Text>
                        </View>
                      )}
                    </View>
                    <View style={styles.fullOrderBottom}>
                      <Text style={styles.fullOrderAmount}>{"\u20B9"}{order.totalAmount.toLocaleString("en-IN")}</Text>
                      <Text style={styles.fullOrderTime}>{getTimeAgo(order.createdAt)}</Text>
                    </View>
                  </Pressable>
                );
              })
            )}
          </View>
        )}

        {activeTab === "approvals" && (
          <View style={styles.section}>
            {pendingApps.length === 0 && approvedApps.length === 0 && liveApps.length === 0 && rejectedApps.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons name="storefront-outline" size={40} color={Colors.textLight} />
                <Text style={styles.emptyText}>No vendor applications yet. Marketing executives will submit applications here.</Text>
              </View>
            ) : (
              <>
                {pendingApps.length > 0 && (
                  <>
                    <Text style={styles.groupTitle}>Pending Review ({pendingApps.length})</Text>
                    {pendingApps.map(renderAppCard)}
                  </>
                )}
                {approvedApps.length > 0 && (
                  <>
                    <Text style={styles.groupTitle}>Approved - Ready to Go Live ({approvedApps.length})</Text>
                    {approvedApps.map(renderAppCard)}
                  </>
                )}
                {liveApps.length > 0 && (
                  <>
                    <Text style={styles.groupTitle}>Live Vendors ({liveApps.length})</Text>
                    {liveApps.map(renderAppCard)}
                  </>
                )}
                {rejectedApps.length > 0 && (
                  <>
                    <Text style={styles.groupTitle}>Rejected ({rejectedApps.length})</Text>
                    {rejectedApps.map(renderAppCard)}
                  </>
                )}
              </>
            )}
          </View>
        )}

        {activeTab === "team" && (
          <View style={styles.section}>
            <View style={styles.teamStatsRow}>
              <View style={[styles.teamStatCard, { backgroundColor: Colors.primary + "12" }]}>
                <Text style={[styles.teamStatValue, { color: Colors.primary }]}>{franchiseTeam.length}</Text>
                <Text style={styles.teamStatLabel}>Total</Text>
              </View>
              <View style={[styles.teamStatCard, { backgroundColor: Colors.success + "12" }]}>
                <Text style={[styles.teamStatValue, { color: Colors.success }]}>{activeTeamCount}</Text>
                <Text style={styles.teamStatLabel}>Active</Text>
              </View>
              <View style={[styles.teamStatCard, { backgroundColor: Colors.error + "12" }]}>
                <Text style={[styles.teamStatValue, { color: Colors.error }]}>{inactiveTeamCount}</Text>
                <Text style={styles.teamStatLabel}>Inactive</Text>
              </View>
            </View>

            <View style={styles.teamHeaderRow}>
              <View style={styles.teamFilterRow}>
                {(["All", "Marketing", "Delivery"] as const).map((f) => (
                  <Pressable
                    key={f}
                    style={[styles.teamFilterBtn, teamFilter === f && styles.teamFilterBtnActive]}
                    onPress={() => setTeamFilter(f)}
                  >
                    <Text style={[styles.teamFilterText, teamFilter === f && styles.teamFilterTextActive]}>{f}</Text>
                  </Pressable>
                ))}
              </View>
              <Pressable style={styles.addMemberBtn} onPress={() => setShowAddMemberModal(true)}>
                <Ionicons name="add" size={20} color="#FFF" />
              </Pressable>
            </View>

            {filteredTeam.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons name="people-outline" size={40} color={Colors.textLight} />
                <Text style={styles.emptyText}>No team members yet. Tap + to add your first member.</Text>
              </View>
            ) : (
              filteredTeam.map((member) => {
                const isMarketing = member.role === "MARKETING";
                const avatarColor = isMarketing ? Colors.primary : Colors.info;
                return (
                  <Pressable
                    key={member.id}
                    style={styles.memberCard}
                    onPress={() => {
                      setEditMember(member);
                      setEditMemberName(member.name);
                      setEditMemberPhone(member.phone);
                      setEditMemberEmail(member.email);
                      setEditMemberCity(member.city);
                      setEditMemberRole(member.role as "MARKETING" | "DELIVERY");
                      setEditMemberTerritory(member.territory || "");
                      setEditMemberBankName(member.bankName || "");
                      setEditMemberAccountNumber(member.accountNumber || "");
                      setEditMemberIfscCode(member.ifscCode || "");
                      setEditMemberAccountHolderName(member.accountHolderName || "");
                    }}
                  >
                    <View style={[styles.memberAvatar, { backgroundColor: avatarColor + "18" }]}>
                      <Text style={[styles.memberAvatarText, { color: avatarColor }]}>{member.name.charAt(0).toUpperCase()}</Text>
                    </View>
                    <View style={styles.memberInfo}>
                      <Text style={styles.memberName}>{member.name}</Text>
                      <Pressable onPress={() => Linking.openURL(`tel:${member.phone}`)}>
                        <Text style={styles.memberPhone}>{member.phone}</Text>
                      </Pressable>
                      <View style={styles.memberMetaRow}>
                        <View style={[styles.roleBadge, { backgroundColor: avatarColor + "15" }]}>
                          <Text style={[styles.roleBadgeText, { color: avatarColor }]}>
                            {isMarketing ? "Marketing" : "Delivery"}
                          </Text>
                        </View>
                        <Text style={styles.memberDate}>{new Date(member.createdAt).toLocaleDateString("en-IN")}</Text>
                      </View>
                    </View>
                    <View style={styles.memberActions}>
                      <Pressable
                        style={styles.statusToggle}
                        onPress={() => {
                          toggleTeamMemberStatus(member.id);
                          try { Haptics.selectionAsync(); } catch {}
                        }}
                      >
                        <View style={[styles.statusDot, { backgroundColor: member.status === "ACTIVE" ? Colors.success : Colors.error }]} />
                      </Pressable>
                      {confirmRemoveId === member.id ? (
                        <View style={styles.confirmRemoveRow}>
                          <Pressable onPress={() => handleRemoveMember(member.id)}>
                            <Ionicons name="checkmark-circle" size={24} color={Colors.error} />
                          </Pressable>
                          <Pressable onPress={() => setConfirmRemoveId(null)}>
                            <Ionicons name="close-circle" size={24} color={Colors.textSecondary} />
                          </Pressable>
                        </View>
                      ) : (
                        <Pressable onPress={() => setConfirmRemoveId(member.id)}>
                          <Ionicons name="trash-outline" size={20} color={Colors.textLight} />
                        </Pressable>
                      )}
                    </View>
                  </Pressable>
                );
              })
            )}
          </View>
        )}

        {activeTab === "ads" && (
          <View style={styles.section}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
              <Text style={styles.sectionTitle}>Ad Requests</Text>
              <Pressable onPress={() => refreshAdRequests()} style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: Colors.surfaceAlt, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 }}>
                <Ionicons name="refresh" size={14} color={Colors.primary} />
                <Text style={{ fontFamily: "Poppins_600SemiBold", fontSize: 12, color: Colors.primary }}>Refresh</Text>
              </Pressable>
            </View>
            <Text style={{ fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary, marginBottom: 14 }}>Review vendor ad slot requests. Approved ads go to admin for final approval.</Text>

            {adRequests.filter(a => a.status === "PENDING_FRANCHISE").length > 0 && (
              <View style={{ marginBottom: 16 }}>
                <Text style={{ fontFamily: "Poppins_600SemiBold", fontSize: 14, color: "#F59E0B", marginBottom: 8 }}>Pending Review ({adRequests.filter(a => a.status === "PENDING_FRANCHISE").length})</Text>
                {adRequests.filter(a => a.status === "PENDING_FRANCHISE").map((ad) => (
                  <View key={ad.id} style={{ backgroundColor: "#FFF", borderRadius: 14, padding: 14, marginBottom: 10, borderLeftWidth: 4, borderLeftColor: "#F59E0B" }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                      <Text style={{ fontFamily: "Poppins_600SemiBold", fontSize: 14, color: Colors.secondary }}>{ad.title}</Text>
                      <Text style={{ fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textLight }}>{ad.vendorName}</Text>
                    </View>
                    <Text style={{ fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary, marginTop: 2 }}>{ad.subtitle}</Text>
                    {ad.description ? <Text style={{ fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textLight, marginTop: 4 }}>{ad.description}</Text> : null}
                    <View style={{ flexDirection: "row", gap: 12, marginTop: 8 }}>
                      <Text style={{ fontFamily: "Poppins_500Medium", fontSize: 11, color: Colors.textSecondary }}>{ad.slotType === "BANNER" ? "Home Banner" : ad.slotType === "FEATURED" ? "Featured" : "Spotlight"}</Text>
                      <Text style={{ fontFamily: "Poppins_500Medium", fontSize: 11, color: Colors.textSecondary }}>{ad.durationDays} days</Text>
                      <Text style={{ fontFamily: "Poppins_500Medium", fontSize: 11, color: Colors.primary }}>{"\u20B9"}{ad.amountPaid}</Text>
                    </View>
                    <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
                      <Pressable
                        style={{ flex: 1, backgroundColor: Colors.success, borderRadius: 10, paddingVertical: 10, alignItems: "center" }}
                        onPress={() => {
                          try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
                          reviewAdRequestFranchise(ad.id, true);
                          Alert.alert("Approved", "Ad request forwarded to admin for final approval.");
                        }}
                      >
                        <Text style={{ fontFamily: "Poppins_600SemiBold", fontSize: 13, color: "#FFF" }}>Approve</Text>
                      </Pressable>
                      <Pressable
                        style={{ flex: 1, backgroundColor: "#FEE2E2", borderRadius: 10, paddingVertical: 10, alignItems: "center" }}
                        onPress={() => {
                          Alert.prompt ? Alert.prompt("Reject Ad", "Enter rejection reason:", (reason) => {
                            if (reason) {
                              reviewAdRequestFranchise(ad.id, false, reason);
                            }
                          }) : (() => {
                            reviewAdRequestFranchise(ad.id, false, "Does not meet advertising guidelines");
                            Alert.alert("Rejected", "Ad request has been rejected.");
                          })();
                        }}
                      >
                        <Text style={{ fontFamily: "Poppins_600SemiBold", fontSize: 13, color: Colors.error }}>Reject</Text>
                      </Pressable>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {adRequests.filter(a => a.status !== "PENDING_FRANCHISE").length > 0 && (
              <View>
                <Text style={{ fontFamily: "Poppins_600SemiBold", fontSize: 14, color: Colors.textSecondary, marginBottom: 8 }}>All Ad Requests</Text>
                {adRequests.filter(a => a.status !== "PENDING_FRANCHISE").map((ad) => {
                  const statusColors: Record<string, string> = { PENDING_ADMIN: "#3B82F6", APPROVED: "#10B981", LIVE: "#22C55E", REJECTED: "#EF4444", EXPIRED: "#9CA3AF" };
                  const statusLabels: Record<string, string> = { PENDING_ADMIN: "With Admin", APPROVED: "Approved", LIVE: "Live", REJECTED: "Rejected", EXPIRED: "Expired" };
                  return (
                    <View key={ad.id} style={{ backgroundColor: "#FFF", borderRadius: 14, padding: 14, marginBottom: 10, borderLeftWidth: 4, borderLeftColor: statusColors[ad.status] || "#9CA3AF" }}>
                      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                        <Text style={{ fontFamily: "Poppins_600SemiBold", fontSize: 14, color: Colors.secondary }}>{ad.title}</Text>
                        <View style={{ backgroundColor: (statusColors[ad.status] || "#9CA3AF") + "18", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
                          <Text style={{ fontFamily: "Poppins_600SemiBold", fontSize: 10, color: statusColors[ad.status] || "#9CA3AF" }}>{statusLabels[ad.status] || ad.status}</Text>
                        </View>
                      </View>
                      <Text style={{ fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary, marginTop: 2 }}>{ad.vendorName} - {ad.subtitle}</Text>
                      <Text style={{ fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textLight, marginTop: 4 }}>{"\u20B9"}{ad.amountPaid} | {ad.durationDays} days</Text>
                    </View>
                  );
                })}
              </View>
            )}

            {adRequests.length === 0 && (
              <View style={styles.emptyCard}>
                <Ionicons name="megaphone-outline" size={40} color={Colors.textLight} />
                <Text style={styles.emptyText}>No ad requests yet.</Text>
              </View>
            )}
          </View>
        )}

        {activeTab === "subcats" && (
          <View style={styles.section}>
            <View style={styles.teamHeaderRow}>
              <Text style={styles.sectionTitle}>Custom Sub-Categories</Text>
              <Pressable style={styles.addMemberBtn} onPress={() => setShowAddSubCatModal(true)}>
                <Ionicons name="add" size={20} color="#FFF" />
              </Pressable>
            </View>

            {categories.map((cat) => {
              const catCustomSubs = customSubCategories.filter((sc) => sc.categoryId === cat.id);
              const catStaticSubs = subCategories.filter((sc) => sc.categoryId === cat.id);
              if (catCustomSubs.length === 0 && catStaticSubs.length === 0) return null;
              return (
                <View key={cat.id} style={{ marginBottom: 16 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
                    <Ionicons name={cat.icon as any} size={18} color={Colors.primary} />
                    <Text style={{ fontSize: 14, fontWeight: "700", color: Colors.text, marginLeft: 6 }}>{cat.name}</Text>
                    <Text style={{ fontSize: 12, color: Colors.textLight, marginLeft: 6 }}>({catStaticSubs.length + catCustomSubs.length})</Text>
                  </View>
                  {catStaticSubs.map((sc) => (
                    <View key={sc.id} style={styles.subCatItem}>
                      <View style={styles.subCatLeft}>
                        <Ionicons name={sc.icon as any} size={16} color={Colors.textSecondary} />
                        <Text style={styles.subCatName}>{sc.name}</Text>
                      </View>
                      <View style={[styles.subCatBadge, { backgroundColor: Colors.textLight + "20" }]}>
                        <Text style={{ fontSize: 10, color: Colors.textLight }}>Default</Text>
                      </View>
                    </View>
                  ))}
                  {catCustomSubs.map((sc) => (
                    <View key={sc.id} style={styles.subCatItem}>
                      <View style={styles.subCatLeft}>
                        <Ionicons name={sc.icon as any} size={16} color={Colors.primary} />
                        <Text style={[styles.subCatName, { color: Colors.primary }]}>{sc.name}</Text>
                      </View>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <View style={[styles.subCatBadge, { backgroundColor: Colors.primary + "15" }]}>
                          <Text style={{ fontSize: 10, color: Colors.primary }}>Custom</Text>
                        </View>
                        {confirmRemoveSubCatId === sc.id ? (
                          <View style={styles.confirmRemoveRow}>
                            <Pressable onPress={() => { removeSubCategory(sc.id); setConfirmRemoveSubCatId(null); }}>
                              <Ionicons name="checkmark-circle" size={22} color={Colors.error} />
                            </Pressable>
                            <Pressable onPress={() => setConfirmRemoveSubCatId(null)}>
                              <Ionicons name="close-circle" size={22} color={Colors.textSecondary} />
                            </Pressable>
                          </View>
                        ) : (
                          <Pressable onPress={() => setConfirmRemoveSubCatId(sc.id)}>
                            <Ionicons name="trash-outline" size={16} color={Colors.textLight} />
                          </Pressable>
                        )}
                      </View>
                    </View>
                  ))}
                </View>
              );
            })}

            {customSubCategories.length === 0 && (
              <View style={styles.emptyCard}>
                <Ionicons name="layers-outline" size={40} color={Colors.textLight} />
                <Text style={styles.emptyText}>No custom sub-categories yet. Tap + to create one for your territory.</Text>
              </View>
            )}
          </View>
        )}

        <Pressable
          style={styles.revenueBtn}
          onPress={() => {
            try { Haptics.selectionAsync(); } catch {}
            router.push("/franchise-revenue" as any);
          }}
        >
          <Ionicons name="wallet" size={20} color="#FFF" />
          <Text style={styles.revenueBtnText}>Revenue & Commissions</Text>
          <Ionicons name="chevron-forward" size={18} color="#FFF" />
        </Pressable>

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

      <Modal visible={!!selectedApp} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.detailModal, { paddingBottom: bottomInset + 24 }]}>
            {selectedApp && (
              <>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>{isEditingVendor ? "Edit Vendor" : "Vendor Details"}</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                    {!isEditingVendor && (
                      <Pressable onPress={() => startEditVendor(selectedApp)} testID="edit-vendor-btn">
                        <Ionicons name="create-outline" size={22} color={Colors.primary} />
                      </Pressable>
                    )}
                    <Pressable onPress={() => { setSelectedApp(null); setIsEditingVendor(false); }}>
                      <Ionicons name="close" size={24} color={Colors.text} />
                    </Pressable>
                  </View>
                </View>
                <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                  {isEditingVendor ? (
                    <View style={{ paddingBottom: 8 }}>
                      <Text style={styles.addMemberLabel}>Business Name *</Text>
                      <TextInput style={styles.input} value={editBizName} onChangeText={setEditBizName} placeholder="Business name" placeholderTextColor={Colors.textLight} />
                      <Text style={styles.addMemberLabel}>Owner Name *</Text>
                      <TextInput style={styles.input} value={editOwnerName} onChangeText={setEditOwnerName} placeholder="Owner name" placeholderTextColor={Colors.textLight} />
                      <Text style={styles.addMemberLabel}>Phone *</Text>
                      <TextInput style={styles.input} value={editPhone} onChangeText={setEditPhone} placeholder="Phone number" placeholderTextColor={Colors.textLight} keyboardType="phone-pad" />
                      <Text style={styles.addMemberLabel}>Email</Text>
                      <TextInput style={styles.input} value={editEmail} onChangeText={setEditEmail} placeholder="Email address" placeholderTextColor={Colors.textLight} keyboardType="email-address" autoCapitalize="none" />
                      <Text style={styles.addMemberLabel}>Category</Text>
                      <View style={styles.catGrid}>
                        {categories.map((cat) => (
                          <Pressable
                            key={cat.id}
                            style={[styles.catGridItem, editCategoryId === cat.id && { borderColor: Colors.primary, backgroundColor: Colors.primary + "10" }]}
                            onPress={() => { setEditCategoryId(cat.id); setEditSubCategoryId(""); }}
                          >
                            <Ionicons name={cat.icon as any} size={16} color={editCategoryId === cat.id ? Colors.primary : Colors.textSecondary} />
                            <Text style={[styles.catGridText, editCategoryId === cat.id && { color: Colors.primary }]} numberOfLines={1}>{cat.name}</Text>
                          </Pressable>
                        ))}
                      </View>
                      {editCategoryId ? (() => {
                        const catSubs = allSubCategories.filter((sc) => sc.categoryId === editCategoryId);
                        if (!catSubs.length) return null;
                        return (
                          <>
                            <Text style={styles.addMemberLabel}>Sub Category</Text>
                            <View style={styles.catGrid}>
                              {catSubs.map((sc) => (
                                <Pressable
                                  key={sc.id}
                                  style={[styles.catGridItem, editSubCategoryId === sc.id && { borderColor: Colors.primary, backgroundColor: Colors.primary + "10" }]}
                                  onPress={() => setEditSubCategoryId(sc.id)}
                                >
                                  <Ionicons name={"pricetag-outline" as any} size={16} color={editSubCategoryId === sc.id ? Colors.primary : Colors.textSecondary} />
                                  <Text style={[styles.catGridText, editSubCategoryId === sc.id && { color: Colors.primary }]} numberOfLines={1}>{sc.name}</Text>
                                </Pressable>
                              ))}
                            </View>
                          </>
                        );
                      })() : null}
                      <Text style={styles.addMemberLabel}>Address</Text>
                      <TextInput style={[styles.input, { height: 80, textAlignVertical: "top" }]} value={editAddress} onChangeText={setEditAddress} placeholder="Full address" placeholderTextColor={Colors.textLight} multiline />
                      <Text style={styles.addMemberLabel}>City</Text>
                      <TextInput style={styles.input} value={editCity} onChangeText={setEditCity} placeholder="City" placeholderTextColor={Colors.textLight} />
                      <Text style={styles.addMemberLabel}>Pin Code</Text>
                      <TextInput style={styles.input} value={editPinCode} onChangeText={(v) => setEditPinCode(v.replace(/\D/g, "").slice(0, 6))} placeholder="e.g. 423203" placeholderTextColor={Colors.textLight} keyboardType="number-pad" maxLength={6} />
                      <Text style={styles.addMemberLabel}>GPS Location</Text>
                      <Pressable
                        style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: Colors.primary, borderRadius: 10, paddingVertical: 10, marginBottom: 8 }}
                        onPress={handleUseGPS}
                        disabled={gpsLoading}
                      >
                        {gpsLoading ? <ActivityIndicator size="small" color="#FFF" /> : <Ionicons name="locate" size={16} color="#FFF" />}
                        <Text style={{ color: "#FFF", fontWeight: "600", fontSize: 13 }}>Use GPS</Text>
                      </Pressable>
                      <Text style={styles.addMemberLabel}>Google Maps Link</Text>
                      <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
                        <TextInput
                          style={[styles.input, { flex: 1, marginBottom: 0 }]}
                          value={googleMapsLink}
                          onChangeText={setGoogleMapsLink}
                          placeholder="Paste Google Maps link here"
                          placeholderTextColor={Colors.textLight}
                          autoCapitalize="none"
                          autoCorrect={false}
                          keyboardType="url"
                        />
                        <Pressable
                          style={{ backgroundColor: "#0B1E3D", borderRadius: 10, paddingHorizontal: 14, alignItems: "center", justifyContent: "center" }}
                          onPress={async () => {
                            const ok = await parseGoogleMapsLink(googleMapsLink);
                            if (!ok && googleMapsLink.trim()) Alert.alert("Could not extract location", "Try copying the link from Google Maps → Share → Copy link. You can also use the GPS button at the store.");
                          }}
                          disabled={mapsLinkLoading}
                        >
                          {mapsLinkLoading
                            ? <ActivityIndicator size="small" color="#FFF" />
                            : <Ionicons name="location" size={20} color="#FFF" />}
                        </Pressable>
                      </View>
                      <Text style={{ fontSize: 11, color: Colors.textLight, marginBottom: 8 }}>
                        In Google Maps: long-press location → tap "Share" → copy link → paste above
                      </Text>
                      {editLat.trim() && editLng.trim() ? (
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: Colors.success + "15", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 8 }}>
                          <Ionicons name="checkmark-circle" size={16} color={Colors.success} />
                          <Text style={{ fontSize: 12, color: Colors.success, flex: 1 }}>Location set ({parseFloat(editLat).toFixed(4)}, {parseFloat(editLng).toFixed(4)})</Text>
                        </View>
                      ) : (
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: Colors.warning + "15", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 8 }}>
                          <Ionicons name="warning-outline" size={16} color={Colors.warning} />
                          <Text style={{ fontSize: 12, color: Colors.textSecondary, flex: 1 }}>No location set — use GPS at the store or paste a Google Maps link</Text>
                        </View>
                      )}
                      <Text style={styles.addMemberLabel}>GST Number</Text>
                      <TextInput style={styles.input} value={editGst} onChangeText={setEditGst} placeholder="GST number" placeholderTextColor={Colors.textLight} autoCapitalize="characters" />
                      <Text style={styles.addMemberLabel}>PAN Number</Text>
                      <TextInput style={styles.input} value={editPan} onChangeText={setEditPan} placeholder="PAN number" placeholderTextColor={Colors.textLight} autoCapitalize="characters" />
                      <Text style={styles.addMemberLabel}>Bank Account</Text>
                      <TextInput style={styles.input} value={editBank} onChangeText={setEditBank} placeholder="Bank account number" placeholderTextColor={Colors.textLight} keyboardType="number-pad" />
                      <Text style={styles.addMemberLabel}>IFSC Code</Text>
                      <TextInput style={styles.input} value={editIfsc} onChangeText={setEditIfsc} placeholder="IFSC code" placeholderTextColor={Colors.textLight} autoCapitalize="characters" />
                      <Text style={styles.addMemberLabel}>Commission Rate (%)</Text>
                      <TextInput style={styles.input} value={editCommission} onChangeText={setEditCommission} placeholder="e.g. 10" placeholderTextColor={Colors.textLight} keyboardType="decimal-pad" />
                      <Text style={styles.addMemberLabel}>Description</Text>
                      <TextInput style={[styles.input, { height: 80, textAlignVertical: "top" }]} value={editDescription} onChangeText={setEditDescription} placeholder="Vendor description" placeholderTextColor={Colors.textLight} multiline />
                      <Text style={styles.addMemberLabel}>Photos</Text>
                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
                        {editPhotos.map((uri, idx) => (
                          <View key={idx} style={{ position: "relative" }}>
                            <Image source={{ uri }} style={{ width: 80, height: 80, borderRadius: 10 }} contentFit="cover" accessibilityLabel="Vendor photo" />
                            <Pressable
                              onPress={() => setEditPhotos((p) => p.filter((_, i) => i !== idx))}
                              style={{ position: "absolute", top: -6, right: -6, backgroundColor: Colors.error, borderRadius: 10, width: 20, height: 20, alignItems: "center", justifyContent: "center" }}
                            >
                              <Ionicons name="close" size={12} color="#FFF" />
                            </Pressable>
                          </View>
                        ))}
                        {editPhotos.length < 5 && (
                          <Pressable
                            onPress={handlePickEditPhotos}
                            disabled={isPickingPhoto}
                            style={{ width: 80, height: 80, borderRadius: 10, borderWidth: 2, borderColor: Colors.primary, borderStyle: "dashed", alignItems: "center", justifyContent: "center", backgroundColor: Colors.primary + "08" }}
                          >
                            {isPickingPhoto
                              ? <ActivityIndicator size="small" color={Colors.primary} />
                              : <Ionicons name="add" size={28} color={Colors.primary} />
                            }
                          </Pressable>
                        )}
                      </View>
                      <Text style={{ fontSize: 11, color: Colors.textLight, marginBottom: 12 }}>Tap + to add up to 5 photos. First photo is used as the store image.</Text>
                      <View style={[styles.actionRow, { marginTop: 16 }]}>
                        <Pressable
                          style={styles.cancelBtn}
                          onPress={() => setIsEditingVendor(false)}
                        >
                          <Text style={styles.cancelBtnText}>Cancel</Text>
                        </Pressable>
                        <Pressable
                          style={[styles.approveBtn, { flex: 2 }]}
                          onPress={handleSaveVendorEdit}
                          disabled={isSavingVendor}
                          testID="save-vendor-btn"
                        >
                          {isSavingVendor
                            ? <ActivityIndicator size="small" color="#FFF" />
                            : <><Ionicons name="checkmark" size={18} color="#FFF" /><Text style={styles.actionBtnText}>Save Changes</Text></>
                          }
                        </Pressable>
                      </View>
                    </View>
                  ) : (
                    <>
                      <View style={styles.detailSection}>
                        <View style={styles.detailHeaderCard}>
                          <View style={styles.detailIconBig}>
                            <Ionicons name="storefront" size={28} color={Colors.primary} />
                          </View>
                          <Text style={styles.detailBizName}>{selectedApp.businessName}</Text>
                          <View style={[styles.statusBadge, { backgroundColor: appStatusColors[selectedApp.status] + "18", alignSelf: "center" }]}>
                            <Text style={[styles.statusText, { color: appStatusColors[selectedApp.status] }]}>{selectedApp.status}</Text>
                          </View>
                        </View>

                        <View style={styles.detailGrid}>
                          <DetailItem icon="person" label="Owner" value={selectedApp.ownerName} />
                          <DetailItem icon="call" label="Phone" value={selectedApp.phone} />
                          <DetailItem icon="mail" label="Email" value={selectedApp.email || "N/A"} />
                          <DetailItem icon="pricetag" label="Category" value={categories.find((c) => c.id === selectedApp.categoryId)?.name || "N/A"} />
                          <DetailItem icon="location" label="Address" value={selectedApp.address} />
                          <DetailItem icon="business" label="City" value={selectedApp.city} />
                          <DetailItem icon="document-text" label="GST" value={selectedApp.gstNumber || "N/A"} />
                          <DetailItem icon="card" label="PAN" value={selectedApp.panNumber || "N/A"} />
                          <DetailItem icon="wallet" label="Bank A/C" value={selectedApp.bankAccount || "N/A"} />
                          <DetailItem icon="code" label="IFSC" value={selectedApp.ifscCode || "N/A"} />
                          <DetailItem icon="trending-up" label="Commission" value={`${selectedApp.commissionRate}%`} />
                          <DetailItem icon="person-add" label="Submitted By" value={selectedApp.submittedBy} />
                        </View>
                        {selectedApp.description ? (
                          <View style={styles.descBox}>
                            <Text style={styles.descLabel}>Description</Text>
                            <Text style={styles.descText}>{selectedApp.description}</Text>
                          </View>
                        ) : null}
                      </View>

                      {selectedApp.status === "PENDING" && (
                        <View style={styles.actionRow}>
                          <Pressable style={styles.approveBtn} onPress={() => handleApprove(selectedApp.id)}>
                            <Ionicons name="checkmark" size={18} color="#FFF" />
                            <Text style={styles.actionBtnText}>Approve</Text>
                          </Pressable>
                          <Pressable
                            style={styles.rejectBtn}
                            onPress={() => { setRejectAppId(selectedApp.id); setShowRejectModal(true); }}
                          >
                            <Ionicons name="close" size={18} color={Colors.error} />
                            <Text style={[styles.actionBtnText, { color: Colors.error }]}>Reject</Text>
                          </Pressable>
                        </View>
                      )}
                      {selectedApp.status === "APPROVED" && (
                        <Pressable style={styles.liveBtn} onPress={() => handleMakeLive(selectedApp.id)}>
                          <Ionicons name="rocket" size={18} color="#FFF" />
                          <Text style={styles.actionBtnText}>Make Vendor Live</Text>
                        </Pressable>
                      )}
                      {selectedApp.rejectionReason && (
                        <View style={styles.rejectionBox}>
                          <Ionicons name="alert-circle" size={16} color={Colors.error} />
                          <Text style={styles.rejectionText}>{selectedApp.rejectionReason}</Text>
                        </View>
                      )}
                    </>
                  )}
                </ScrollView>
              </>
            )}
          </View>
        </View>
      </Modal>

      <Modal visible={showRejectModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.rejectModal, { paddingBottom: bottomInset + 24 }]}>
            <Text style={styles.modalTitle}>Reject Application</Text>
            <Text style={styles.rejectDesc}>Please provide a reason for rejecting this vendor application:</Text>
            <TextInput
              style={[styles.input, { height: 100, textAlignVertical: "top" }]}
              placeholder="Reason for rejection..."
              placeholderTextColor={Colors.textLight}
              multiline
              value={rejectionReason}
              onChangeText={setRejectionReason}
              testID="rejection-reason"
            />
            <View style={styles.rejectActions}>
              <Pressable style={styles.cancelBtn} onPress={() => { setShowRejectModal(false); setRejectionReason(""); }}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.confirmRejectBtn} onPress={handleReject}>
                <Text style={styles.actionBtnText}>Confirm Reject</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showAddSubCatModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.detailModal, { paddingBottom: bottomInset + 24 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Sub-Category</Text>
              <Pressable onPress={() => { setShowAddSubCatModal(false); setGeneratedImage(""); }}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </Pressable>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.addMemberLabel}>Category</Text>
              <View style={styles.catGrid}>
                {categories.map((cat) => {
                  const isSelected = newSubCatCategory === cat.id;
                  return (
                    <Pressable
                      key={cat.id}
                      style={[styles.catGridItem, isSelected && { backgroundColor: Colors.primary, borderColor: Colors.primary }]}
                      onPress={() => setNewSubCatCategory(cat.id)}
                    >
                      <Ionicons name={cat.icon as any} size={20} color={isSelected ? "#FFF" : Colors.primary} />
                      <Text style={[styles.catGridText, isSelected && { color: "#FFF" }]}>{cat.name}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.addMemberLabel}>Sub-Category Name</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Organic Produce, Electronics Repair"
                placeholderTextColor={Colors.textLight}
                value={newSubCatName}
                onChangeText={(t) => { setNewSubCatName(t); setGeneratedImage(""); }}
              />

              <Text style={styles.addMemberLabel}>Icon</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
                {(["pricetag", "basket", "construct", "restaurant", "cut", "car", "fitness", "medical", "school", "briefcase", "leaf", "camera", "musical-notes", "shirt", "home"] as const).map((iconName) => (
                  <Pressable
                    key={iconName}
                    style={[{ width: 40, height: 40, borderRadius: 10, backgroundColor: Colors.background, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: newSubCatIcon === iconName ? Colors.primary : "transparent" }]}
                    onPress={() => setNewSubCatIcon(iconName)}
                  >
                    <Ionicons name={iconName as any} size={20} color={newSubCatIcon === iconName ? Colors.primary : Colors.textSecondary} />
                  </Pressable>
                ))}
              </View>

              <Text style={styles.addMemberLabel}>AI Photo</Text>
              {generatedImage ? (
                <View style={{ alignItems: "center", marginBottom: 14 }}>
                  <Image source={{ uri: `data:image/png;base64,${generatedImage}` }} style={{ width: 160, height: 160, borderRadius: 16 }} contentFit="cover" accessibilityLabel="AI generated promotional image" />
                  <Pressable
                    style={{ marginTop: 8, flexDirection: "row", alignItems: "center", gap: 4 }}
                    onPress={() => setGeneratedImage("")}
                  >
                    <Ionicons name="refresh" size={14} color={Colors.textSecondary} />
                    <Text style={{ fontSize: 12, color: Colors.textSecondary }}>Remove</Text>
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  style={[styles.aiGenerateBtn, (!newSubCatName.trim() || generatingImage) && { opacity: 0.5 }]}
                  disabled={!newSubCatName.trim() || generatingImage}
                  onPress={async () => {
                    if (!newSubCatName.trim()) {
                      Alert.alert("Name Required", "Enter a sub-category name first.");
                      return;
                    }
                    setGeneratingImage(true);
                    try {
                      const catName = categories.find((c) => c.id === newSubCatCategory)?.name || "";
                      const token = await getAuthToken();
                      const headers: Record<string, string> = { "Content-Type": "application/json" };
                      if (token) headers["Authorization"] = `Bearer ${token}`;
                      const resp = await fetch(new URL("/api/ai/generate-subcategory-image", getApiUrl()).toString(), {
                        method: "POST",
                        headers,
                        body: JSON.stringify({ name: newSubCatName.trim(), categoryName: catName }),
                      });
                      const data = await resp.json();
                      if (data.image) {
                        setGeneratedImage(data.image);
                        try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
                      } else {
                        Alert.alert("Error", data.error || "Failed to generate image");
                      }
                    } catch (e: any) {
                      Alert.alert("Error", "Failed to generate image. Please try again.");
                    } finally {
                      setGeneratingImage(false);
                    }
                  }}
                >
                  {generatingImage ? (
                    <>
                      <ActivityIndicator size="small" color="#FFF" />
                      <Text style={styles.actionBtnText}>AI is creating photo...</Text>
                    </>
                  ) : (
                    <>
                      <Ionicons name="sparkles" size={18} color="#FFF" />
                      <Text style={styles.actionBtnText}>Generate AI Photo</Text>
                    </>
                  )}
                </Pressable>
              )}

              <Pressable
                style={[styles.submitMemberBtn, (!newSubCatName.trim() || !newSubCatCategory) && { opacity: 0.5 }]}
                onPress={() => {
                  if (!newSubCatName.trim() || !newSubCatCategory) return;
                  const imageUri = generatedImage ? `data:image/png;base64,${generatedImage}` : "";
                  addSubCategory({
                    categoryId: newSubCatCategory,
                    name: newSubCatName.trim(),
                    icon: newSubCatIcon,
                    image: imageUri,
                  });
                  try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
                  setNewSubCatName("");
                  setNewSubCatCategory("");
                  setNewSubCatIcon("pricetag");
                  setGeneratedImage("");
                  setShowAddSubCatModal(false);
                }}
                disabled={!newSubCatName.trim() || !newSubCatCategory}
              >
                <Ionicons name="layers" size={18} color="#FFF" />
                <Text style={styles.actionBtnText}>Create Sub-Category</Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={!!selectedOrder} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.detailModal, { paddingBottom: bottomInset + 24 }]}>
            {selectedOrder && (
              <>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Order Details</Text>
                  <Pressable onPress={() => setSelectedOrder(null)}>
                    <Ionicons name="close" size={24} color={Colors.text} />
                  </Pressable>
                </View>
                <ScrollView showsVerticalScrollIndicator={false}>
                  <View style={styles.detailHeaderCard}>
                    <View style={[styles.detailIconBig, { backgroundColor: getOrderStatusColor(selectedOrder.status) + "15" }]}>
                      <Ionicons name="receipt" size={28} color={getOrderStatusColor(selectedOrder.status)} />
                    </View>
                    <Text style={styles.detailBizName}>#{selectedOrder.id}</Text>
                    <View style={[styles.statusBadge, { backgroundColor: getOrderStatusColor(selectedOrder.status) + "18", alignSelf: "center" }]}>
                      <Text style={[styles.statusText, { color: getOrderStatusColor(selectedOrder.status) }]}>{selectedOrder.status.replace(/_/g, " ")}</Text>
                    </View>
                  </View>

                  <View style={styles.detailGrid}>
                    <DetailItem icon="storefront" label="Vendor" value={selectedOrder.vendorName} />
                    {selectedOrder.customerName ? <DetailItem icon="person" label="Customer" value={selectedOrder.customerName} /> : null}
                    <DetailItem icon="location" label="Delivery Address" value={selectedOrder.deliveryAddress} />
                    {selectedOrder.deliveryPartnerName ? (
                      <DetailItem icon="bicycle" label="Delivery Partner" value={selectedOrder.deliveryPartnerName} />
                    ) : (
                      <DetailItem icon="alert-circle" label="Delivery Partner" value="Not assigned" />
                    )}
                    <DetailItem icon="cash" label="Total Amount" value={`\u20B9${selectedOrder.totalAmount.toLocaleString("en-IN")}`} />
                    <DetailItem icon="time" label="Placed" value={new Date(selectedOrder.createdAt).toLocaleString("en-IN")} />
                    {selectedOrder.paymentMethod ? <DetailItem icon="card" label="Payment" value={selectedOrder.paymentMethod} /> : null}
                  </View>

                  {selectedOrder.items && selectedOrder.items.length > 0 && (
                    <View style={{ marginTop: 16 }}>
                      <Text style={{ fontFamily: "Poppins_600SemiBold", fontSize: 14, color: Colors.secondary, marginBottom: 8 }}>Items</Text>
                      {selectedOrder.items.map((item: any, idx: number) => (
                        <View key={idx} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.borderLight }}>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontFamily: "Poppins_500Medium", fontSize: 13, color: Colors.text }}>{item.name || item.productName}</Text>
                            <Text style={{ fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textSecondary }}>Qty: {item.quantity}</Text>
                          </View>
                          <Text style={{ fontFamily: "Poppins_600SemiBold", fontSize: 13, color: Colors.primary }}>{"\u20B9"}{((item.price || 0) * (item.quantity || 1)).toLocaleString("en-IN")}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </ScrollView>
              </>
            )}
          </View>
        </View>
      </Modal>

      <Modal visible={showProfileMenu} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setShowProfileMenu(false)}>
          <View style={[styles.rejectModal, { paddingBottom: bottomInset + 24 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Profile</Text>
              <Pressable onPress={() => setShowProfileMenu(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </Pressable>
            </View>
            <View style={{ alignItems: "center", paddingVertical: 16 }}>
              <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: Colors.primary + "15", alignItems: "center", justifyContent: "center", marginBottom: 8 }}>
                <Text style={{ fontFamily: "Poppins_700Bold", fontSize: 24, color: Colors.primary }}>{(user?.name || "F").charAt(0)}</Text>
              </View>
              <Text style={{ fontFamily: "Poppins_700Bold", fontSize: 18, color: Colors.secondary }}>{user?.name}</Text>
              <Text style={{ fontFamily: "Poppins_400Regular", fontSize: 13, color: Colors.textSecondary }}>{user?.phone}</Text>
              <Text style={{ fontFamily: "Poppins_500Medium", fontSize: 12, color: Colors.primary, marginTop: 4 }}>Franchise Manager</Text>
            </View>
            {[
              { icon: "wallet", label: "Revenue & Commissions", action: () => { setShowProfileMenu(false); router.push("/franchise-revenue" as any); } },
              { icon: "help-circle", label: "Help & Support", action: () => { setShowProfileMenu(false); router.push("/help-support" as any); } },
              { icon: "information-circle", label: "About", action: () => { setShowProfileMenu(false); router.push("/about" as any); } },
            ].map((item) => (
              <Pressable key={item.label} style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.borderLight }} onPress={item.action}>
                <Ionicons name={item.icon as any} size={22} color={Colors.primary} />
                <Text style={{ fontFamily: "Poppins_500Medium", fontSize: 15, color: Colors.text, flex: 1 }}>{item.label}</Text>
                <Ionicons name="chevron-forward" size={18} color={Colors.textLight} />
              </Pressable>
            ))}
            <Pressable
              style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 16, paddingVertical: 14, backgroundColor: Colors.error + "10", borderRadius: 14 }}
              onPress={() => {
                setShowProfileMenu(false);
                try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); } catch {}
                setShowLogoutModal(true);
              }}
            >
              <Ionicons name="log-out-outline" size={20} color={Colors.error} />
              <Text style={{ fontFamily: "Poppins_600SemiBold", fontSize: 15, color: Colors.error }}>Log Out</Text>
            </Pressable>
            <Pressable
              style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 8, paddingVertical: 12 }}
              onPress={() => {
                setShowProfileMenu(false);
                setShowDeleteModal(true);
              }}
            >
              <Ionicons name="trash-outline" size={18} color="#DC2626" />
              <Text style={{ fontFamily: "Poppins_500Medium", fontSize: 13, color: "#DC2626" }}>Delete Account</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      <Modal visible={showAddMemberModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.detailModal, { paddingBottom: bottomInset + 24 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Team Member</Text>
              <Pressable onPress={() => setShowAddMemberModal(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </Pressable>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.addMemberLabel}>Role</Text>
              <View style={styles.roleSelector}>
                <Pressable
                  style={[styles.roleSelectorBtn, newMemberRole === "MARKETING" && styles.roleSelectorBtnActive]}
                  onPress={() => setNewMemberRole("MARKETING")}
                >
                  <Ionicons name="megaphone" size={18} color={newMemberRole === "MARKETING" ? "#FFF" : Colors.primary} />
                  <Text style={[styles.roleSelectorText, newMemberRole === "MARKETING" && styles.roleSelectorTextActive]}>Marketing Executive</Text>
                </Pressable>
                <Pressable
                  style={[styles.roleSelectorBtn, newMemberRole === "DELIVERY" && { backgroundColor: Colors.info }]}
                  onPress={() => setNewMemberRole("DELIVERY")}
                >
                  <Ionicons name="bicycle" size={18} color={newMemberRole === "DELIVERY" ? "#FFF" : Colors.info} />
                  <Text style={[styles.roleSelectorText, newMemberRole === "DELIVERY" && styles.roleSelectorTextActive]}>Delivery Partner</Text>
                </Pressable>
              </View>

              <Text style={styles.sectionHeader}>Personal Details</Text>

              <Text style={styles.addMemberLabel}>Full Name *</Text>
              <TextInput
                style={styles.input}
                placeholder="As per Aadhaar card"
                placeholderTextColor={Colors.textLight}
                value={newMemberName}
                onChangeText={setNewMemberName}
              />

              <Text style={styles.addMemberLabel}>Date of Birth *</Text>
              <TextInput
                style={styles.input}
                placeholder="DD/MM/YYYY"
                placeholderTextColor={Colors.textLight}
                keyboardType="number-pad"
                maxLength={10}
                value={newMemberDob}
                onChangeText={(t) => {
                  const cleaned = t.replace(/[^0-9/]/g, "");
                  if (cleaned.length === 2 && newMemberDob.length < 2) setNewMemberDob(cleaned + "/");
                  else if (cleaned.length === 5 && newMemberDob.length < 5) setNewMemberDob(cleaned + "/");
                  else setNewMemberDob(cleaned);
                }}
              />

              <Text style={styles.addMemberLabel}>Gender *</Text>
              <View style={styles.roleSelector}>
                {(["Male", "Female", "Other"] as const).map((g) => (
                  <Pressable
                    key={g}
                    style={[styles.genderBtn, newMemberGender === g && styles.genderBtnActive]}
                    onPress={() => setNewMemberGender(g)}
                  >
                    <Text style={[styles.genderBtnText, newMemberGender === g && { color: "#FFF" }]}>{g}</Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.addMemberLabel}>Phone *</Text>
              <View style={styles.phoneInputRow}>
                <View style={styles.phonePrefix}>
                  <Text style={styles.phonePrefixText}>+91</Text>
                </View>
                <TextInput
                  style={[styles.input, { flex: 1, marginBottom: 0 }]}
                  placeholder="10 digit phone"
                  placeholderTextColor={Colors.textLight}
                  keyboardType="phone-pad"
                  maxLength={10}
                  value={newMemberPhone}
                  onChangeText={setNewMemberPhone}
                />
              </View>

              <Text style={[styles.addMemberLabel, { marginTop: 10 }]}>Email</Text>
              <TextInput
                style={styles.input}
                placeholder="Email address"
                placeholderTextColor={Colors.textLight}
                keyboardType="email-address"
                autoCapitalize="none"
                value={newMemberEmail}
                onChangeText={setNewMemberEmail}
              />

              <Text style={styles.addMemberLabel}>Full Address *</Text>
              <TextInput
                style={[styles.input, { height: 70, textAlignVertical: "top" }]}
                placeholder="House No, Street, Area, City, PIN"
                placeholderTextColor={Colors.textLight}
                multiline
                numberOfLines={3}
                value={newMemberAddress}
                onChangeText={setNewMemberAddress}
              />

              <Text style={styles.addMemberLabel}>City *</Text>
              <TextInput
                style={styles.input}
                placeholder="City"
                placeholderTextColor={Colors.textLight}
                value={newMemberCity}
                onChangeText={setNewMemberCity}
              />

              <Text style={styles.sectionHeader}>Identity Documents (Indian Law)</Text>

              <Text style={styles.addMemberLabel}>Aadhaar Number * (12 digits)</Text>
              <TextInput
                style={styles.input}
                placeholder="XXXX XXXX XXXX"
                placeholderTextColor={Colors.textLight}
                keyboardType="number-pad"
                maxLength={14}
                value={newMemberAadhaar}
                onChangeText={(t) => {
                  const digits = t.replace(/\D/g, "").slice(0, 12);
                  const formatted = digits.replace(/(\d{4})(?=\d)/g, "$1 ");
                  setNewMemberAadhaar(formatted);
                }}
              />
              {newMemberAadhaar.length > 0 && newMemberAadhaar.replace(/\s/g, "").length !== 12 && (
                <Text style={styles.fieldError}>Aadhaar must be 12 digits</Text>
              )}

              <Text style={styles.addMemberLabel}>PAN Number (10 characters)</Text>
              <TextInput
                style={styles.input}
                placeholder="ABCDE1234F"
                placeholderTextColor={Colors.textLight}
                autoCapitalize="characters"
                maxLength={10}
                value={newMemberPan}
                onChangeText={setNewMemberPan}
              />
              {newMemberPan.length > 0 && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(newMemberPan.toUpperCase()) && newMemberPan.length === 10 && (
                <Text style={styles.fieldError}>Invalid PAN format (e.g. ABCDE1234F)</Text>
              )}

              {newMemberRole === "DELIVERY" && (
                <>
                  <Text style={styles.sectionHeader}>Vehicle & License (Delivery)</Text>

                  <Text style={styles.addMemberLabel}>Driving License Number *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="DL-XXXXXXXXXXXXXX"
                    placeholderTextColor={Colors.textLight}
                    autoCapitalize="characters"
                    value={newMemberDL}
                    onChangeText={setNewMemberDL}
                  />

                  <Text style={styles.addMemberLabel}>Vehicle Number *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="MH-XX-XX-XXXX"
                    placeholderTextColor={Colors.textLight}
                    autoCapitalize="characters"
                    value={newMemberVehicle}
                    onChangeText={setNewMemberVehicle}
                  />
                </>
              )}

              <Text style={styles.sectionHeader}>Bank Details (Payment of Wages Act)</Text>

              <Text style={styles.addMemberLabel}>Bank Name</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. State Bank of India"
                placeholderTextColor={Colors.textLight}
                value={newMemberBankName}
                onChangeText={setNewMemberBankName}
              />

              <Text style={styles.addMemberLabel}>Account Holder Name</Text>
              <TextInput
                style={styles.input}
                placeholder="As per bank passbook"
                placeholderTextColor={Colors.textLight}
                value={newMemberAccountHolder}
                onChangeText={setNewMemberAccountHolder}
              />

              <Text style={styles.addMemberLabel}>Account Number</Text>
              <TextInput
                style={styles.input}
                placeholder="Bank account number"
                placeholderTextColor={Colors.textLight}
                keyboardType="number-pad"
                value={newMemberAccountNo}
                onChangeText={setNewMemberAccountNo}
              />

              <Text style={styles.addMemberLabel}>IFSC Code</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. SBIN0001234"
                placeholderTextColor={Colors.textLight}
                autoCapitalize="characters"
                maxLength={11}
                value={newMemberIfsc}
                onChangeText={setNewMemberIfsc}
              />

              <Text style={styles.sectionHeader}>Emergency Contact</Text>

              <Text style={styles.addMemberLabel}>Emergency Contact Name *</Text>
              <TextInput
                style={styles.input}
                placeholder="Family member / relative name"
                placeholderTextColor={Colors.textLight}
                value={newMemberEmergencyName}
                onChangeText={setNewMemberEmergencyName}
              />

              <Text style={styles.addMemberLabel}>Emergency Contact Phone *</Text>
              <View style={styles.phoneInputRow}>
                <View style={styles.phonePrefix}>
                  <Text style={styles.phonePrefixText}>+91</Text>
                </View>
                <TextInput
                  style={[styles.input, { flex: 1, marginBottom: 0 }]}
                  placeholder="10 digit phone"
                  placeholderTextColor={Colors.textLight}
                  keyboardType="phone-pad"
                  maxLength={10}
                  value={newMemberEmergencyPhone}
                  onChangeText={setNewMemberEmergencyPhone}
                />
              </View>

              <View style={styles.legalNote}>
                <Ionicons name="shield-checkmark" size={16} color={Colors.info} />
                <Text style={styles.legalNoteText}>
                  As per Indian Labour Law, Aadhaar (Section 7, Aadhaar Act 2016), PAN (Income Tax Act for TDS), bank details (Payment of Wages Act 1936), and emergency contact are required for employment records.
                </Text>
              </View>

              <Pressable
                style={[styles.submitMemberBtn, (!newMemberName.trim() || newMemberPhone.length < 10 || newMemberAadhaar.replace(/\s/g, "").length !== 12) && { opacity: 0.5 }]}
                onPress={handleAddMember}
                disabled={!newMemberName.trim() || newMemberPhone.length < 10 || newMemberAadhaar.replace(/\s/g, "").length !== 12}
              >
                <Ionicons name="person-add" size={18} color="#FFF" />
                <Text style={styles.actionBtnText}>Add {newMemberRole === "MARKETING" ? "Marketing Executive" : "Delivery Partner"}</Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={!!editMember} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.detailModal, { paddingBottom: bottomInset + 24 }]}>
            {editMember && (
              <>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Edit Team Member</Text>
                  <Pressable onPress={() => setEditMember(null)}>
                    <Ionicons name="close" size={24} color={Colors.text} />
                  </Pressable>
                </View>
                <ScrollView showsVerticalScrollIndicator={false}>
                  <View style={{ alignItems: "center", marginBottom: 16 }}>
                    <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: (editMemberRole === "MARKETING" ? Colors.primary : Colors.info) + "18", alignItems: "center", justifyContent: "center", marginBottom: 8 }}>
                      <Text style={{ fontFamily: "Poppins_700Bold", fontSize: 24, color: editMemberRole === "MARKETING" ? Colors.primary : Colors.info }}>{editMemberName.charAt(0).toUpperCase() || "?"}</Text>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: editMember.status === "ACTIVE" ? Colors.success + "18" : Colors.error + "18" }]}>
                      <Text style={[styles.statusText, { color: editMember.status === "ACTIVE" ? Colors.success : Colors.error }]}>{editMember.status}</Text>
                    </View>
                  </View>

                  <View style={{ flexDirection: "row", gap: 10, marginBottom: 16 }}>
                    <Pressable
                      style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: Colors.success + "12", borderRadius: 12, paddingVertical: 12 }}
                      onPress={() => Linking.openURL(`tel:${editMember.phone}`)}
                    >
                      <Ionicons name="call" size={18} color={Colors.success} />
                      <Text style={{ fontFamily: "Poppins_600SemiBold", fontSize: 13, color: Colors.success }}>Call</Text>
                    </Pressable>
                    <Pressable
                      style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: Colors.info + "12", borderRadius: 12, paddingVertical: 12 }}
                      onPress={() => Linking.openURL(`sms:${editMember.phone}`)}
                    >
                      <Ionicons name="chatbubble" size={18} color={Colors.info} />
                      <Text style={{ fontFamily: "Poppins_600SemiBold", fontSize: 13, color: Colors.info }}>Message</Text>
                    </Pressable>
                    <Pressable
                      style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#25D366" + "18", borderRadius: 12, paddingVertical: 12 }}
                      onPress={() => Linking.openURL(`https://wa.me/91${editMember.phone}`)}
                    >
                      <Ionicons name="logo-whatsapp" size={18} color="#25D366" />
                      <Text style={{ fontFamily: "Poppins_600SemiBold", fontSize: 13, color: "#25D366" }}>WhatsApp</Text>
                    </Pressable>
                  </View>

                  <Text style={styles.addMemberLabel}>Role</Text>
                  <View style={styles.roleSelector}>
                    <Pressable
                      style={[styles.roleSelectorBtn, editMemberRole === "MARKETING" && styles.roleSelectorBtnActive]}
                      onPress={() => setEditMemberRole("MARKETING")}
                    >
                      <Ionicons name="megaphone" size={18} color={editMemberRole === "MARKETING" ? "#FFF" : Colors.primary} />
                      <Text style={[styles.roleSelectorText, editMemberRole === "MARKETING" && styles.roleSelectorTextActive]}>Marketing</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.roleSelectorBtn, editMemberRole === "DELIVERY" && { backgroundColor: Colors.info }]}
                      onPress={() => setEditMemberRole("DELIVERY")}
                    >
                      <Ionicons name="bicycle" size={18} color={editMemberRole === "DELIVERY" ? "#FFF" : Colors.info} />
                      <Text style={[styles.roleSelectorText, editMemberRole === "DELIVERY" && styles.roleSelectorTextActive]}>Delivery</Text>
                    </Pressable>
                  </View>

                  <Text style={styles.addMemberLabel}>Full Name</Text>
                  <TextInput
                    style={styles.input}
                    value={editMemberName}
                    onChangeText={setEditMemberName}
                    placeholder="Full name"
                    placeholderTextColor={Colors.textLight}
                  />

                  <Text style={styles.addMemberLabel}>Phone Number</Text>
                  <TextInput
                    style={styles.input}
                    value={editMemberPhone}
                    onChangeText={(t) => setEditMemberPhone(t.replace(/\D/g, "").slice(0, 10))}
                    placeholder="10-digit phone number"
                    placeholderTextColor={Colors.textLight}
                    keyboardType="phone-pad"
                    maxLength={10}
                  />

                  <Text style={styles.addMemberLabel}>Email</Text>
                  <TextInput
                    style={styles.input}
                    value={editMemberEmail}
                    onChangeText={setEditMemberEmail}
                    placeholder="Email address"
                    placeholderTextColor={Colors.textLight}
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />

                  <Text style={styles.addMemberLabel}>City</Text>
                  <TextInput
                    style={styles.input}
                    value={editMemberCity}
                    onChangeText={setEditMemberCity}
                    placeholder="City"
                    placeholderTextColor={Colors.textLight}
                  />

                  <Text style={styles.addMemberLabel}>Territory</Text>
                  <TextInput
                    style={styles.input}
                    value={editMemberTerritory}
                    onChangeText={setEditMemberTerritory}
                    placeholder="Territory / Area covered"
                    placeholderTextColor={Colors.textLight}
                  />

                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8, marginBottom: 12 }}>
                    <View style={{ flex: 1, height: 1, backgroundColor: Colors.border }} />
                    <Text style={{ fontFamily: "Poppins_600SemiBold", fontSize: 12, color: Colors.textLight }}>BANK DETAILS</Text>
                    <View style={{ flex: 1, height: 1, backgroundColor: Colors.border }} />
                  </View>

                  <Text style={styles.addMemberLabel}>Account Holder Name</Text>
                  <TextInput
                    style={styles.input}
                    value={editMemberAccountHolderName}
                    onChangeText={setEditMemberAccountHolderName}
                    placeholder="Name as on bank account"
                    placeholderTextColor={Colors.textLight}
                  />

                  <Text style={styles.addMemberLabel}>Bank Name</Text>
                  <TextInput
                    style={styles.input}
                    value={editMemberBankName}
                    onChangeText={setEditMemberBankName}
                    placeholder="e.g. State Bank of India"
                    placeholderTextColor={Colors.textLight}
                  />

                  <Text style={styles.addMemberLabel}>Account Number</Text>
                  <TextInput
                    style={styles.input}
                    value={editMemberAccountNumber}
                    onChangeText={setEditMemberAccountNumber}
                    placeholder="Bank account number"
                    placeholderTextColor={Colors.textLight}
                    keyboardType="numeric"
                  />

                  <Text style={styles.addMemberLabel}>IFSC Code</Text>
                  <TextInput
                    style={styles.input}
                    value={editMemberIfscCode}
                    onChangeText={(t) => setEditMemberIfscCode(t.toUpperCase())}
                    placeholder="e.g. SBIN0001234"
                    placeholderTextColor={Colors.textLight}
                    autoCapitalize="characters"
                  />

                  <Pressable
                    style={[styles.submitMemberBtn, !editMemberName.trim() && { opacity: 0.5 }]}
                    onPress={async () => {
                      if (!editMemberName.trim()) return;
                      const success = await editTeamMember(editMember.id, {
                        name: editMemberName.trim(),
                        phone: editMemberPhone,
                        email: editMemberEmail,
                        city: editMemberCity,
                        role: editMemberRole,
                        territory: editMemberTerritory.trim() || undefined,
                        bankName: editMemberBankName.trim() || undefined,
                        accountNumber: editMemberAccountNumber.trim() || undefined,
                        ifscCode: editMemberIfscCode.trim() || undefined,
                        accountHolderName: editMemberAccountHolderName.trim() || undefined,
                      });
                      if (success) {
                        try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
                        Alert.alert("Updated", `${editMemberName.trim()}'s details have been updated.`);
                        setEditMember(null);
                      } else {
                        try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); } catch {}
                        Alert.alert("Failed", "Could not save changes. Please check your connection and try again.");
                      }
                    }}
                    disabled={!editMemberName.trim()}
                  >
                    <Ionicons name="checkmark-circle" size={18} color="#FFF" />
                    <Text style={styles.actionBtnText}>Save Changes</Text>
                  </Pressable>
                </ScrollView>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Map Picker Modal */}
      <Modal visible={showMapPicker} animationType="slide" onRequestClose={() => setShowMapPicker(false)}>
        <MapLocationPicker
          coords={mapPickerCoords}
          onPress={(lat, lng) => setMapPickerCoords({ latitude: lat, longitude: lng })}
          onConfirm={() => {
            setEditLat(mapPickerCoords.latitude.toFixed(6));
            setEditLng(mapPickerCoords.longitude.toFixed(6));
            setShowMapPicker(false);
          }}
          onClose={() => setShowMapPicker(false)}
        />
      </Modal>

      {/* Fix Vendor Location Picker Modal */}
      <Modal visible={!!franchiseLocPicker} animationType="slide" onRequestClose={() => !franchiseLocSaving && setFranchiseLocPicker(null)}>
        {franchiseLocPicker && (
          <MapLocationPicker
            coords={franchisePickerCoords}
            onPress={(lat, lng) => setFranchisePickerCoords({ latitude: lat, longitude: lng })}
            onConfirm={handleFranchiseLocConfirm}
            onClose={() => setFranchiseLocPicker(null)}
          />
        )}
      </Modal>
    </View>
  );
}

function DetailItem({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={detailStyles.item}>
      <View style={detailStyles.iconWrap}>
        <Ionicons name={icon as any} size={16} color={Colors.primary} />
      </View>
      <View>
        <Text style={detailStyles.label}>{label}</Text>
        <Text style={detailStyles.value}>{value}</Text>
      </View>
    </View>
  );
}

const detailStyles = StyleSheet.create({
  item: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  iconWrap: { width: 32, height: 32, borderRadius: 8, backgroundColor: Colors.primary + "10", alignItems: "center", justifyContent: "center" },
  label: { fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textSecondary },
  value: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: Colors.text },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { paddingHorizontal: 20, paddingBottom: 24 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  greeting: { fontFamily: "Poppins_700Bold", fontSize: 20, color: "#FFF" },
  territory: { fontFamily: "Poppins_400Regular", fontSize: 13, color: "rgba(255,255,255,0.7)", marginTop: 2 },
  profileBtn: { opacity: 0.8 },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 20 },
  statCard: { width: "47%", backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 16, padding: 14, gap: 4 },
  statValue: { fontFamily: "Poppins_700Bold", fontSize: 20, color: "#FFF" },
  statLabel: { fontFamily: "Poppins_400Regular", fontSize: 11, color: "rgba(255,255,255,0.6)" },
  tabScroll: { marginHorizontal: 20, marginTop: 20, backgroundColor: "#FFF", borderRadius: 14, flexGrow: 0 },
  tabRow: { flexDirection: "row", padding: 4, gap: 2 },
  tab: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, alignItems: "center" },
  tabActive: { backgroundColor: Colors.primary },
  tabText: { fontFamily: "Poppins_600SemiBold", fontSize: 12, color: Colors.textSecondary },
  tabTextActive: { color: "#FFF" },
  section: { marginTop: 20, paddingHorizontal: 20 },
  sectionTitle: { fontFamily: "Poppins_700Bold", fontSize: 18, color: Colors.secondary, marginBottom: 14 },
  quickGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  quickCard: { width: "47%", backgroundColor: "#FFF", borderRadius: 16, padding: 16, alignItems: "center" },
  quickIcon: { width: 48, height: 48, borderRadius: 14, backgroundColor: Colors.primary + "12", alignItems: "center", justifyContent: "center", marginBottom: 8 },
  quickLabel: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: Colors.text },
  quickCount: { fontFamily: "Poppins_700Bold", fontSize: 22, color: Colors.primary, marginTop: 4 },
  orderRow: { flexDirection: "row", alignItems: "center", backgroundColor: "#FFF", borderRadius: 14, padding: 14, marginBottom: 8, gap: 12 },
  orderIcon: { width: 38, height: 38, borderRadius: 10, backgroundColor: Colors.primary + "12", alignItems: "center", justifyContent: "center" },
  orderInfo: { flex: 1 },
  orderVendor: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: Colors.text },
  orderTime: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary },
  orderAmount: { fontFamily: "Poppins_700Bold", fontSize: 16, color: Colors.primary },
  groupTitle: { fontFamily: "Poppins_700Bold", fontSize: 15, color: Colors.secondary, marginTop: 12, marginBottom: 10 },
  appCard: { backgroundColor: "#FFF", borderRadius: 16, padding: 16, marginBottom: 12 },
  appHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  appIconWrap: { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  appBizName: { fontFamily: "Poppins_700Bold", fontSize: 15, color: Colors.text },
  appOwner: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary, marginTop: 1 },
  statusBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 3 },
  statusText: { fontFamily: "Poppins_600SemiBold", fontSize: 11 },
  appMeta: { flexDirection: "row", justifyContent: "space-between", marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.borderLight },
  appMetaText: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary },
  actionRow: { flexDirection: "row", gap: 10, marginTop: 12 },
  approveBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: Colors.success, borderRadius: 12, paddingVertical: 10 },
  rejectBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: Colors.error + "10", borderRadius: 12, paddingVertical: 10 },
  liveBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: Colors.info, borderRadius: 12, paddingVertical: 12, marginTop: 12 },
  actionBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: "#FFF" },
  emptyCard: { backgroundColor: "#FFF", borderRadius: 16, padding: 40, alignItems: "center" },
  emptyText: { fontFamily: "Poppins_500Medium", fontSize: 14, color: Colors.textSecondary, marginTop: 12, textAlign: "center" },
  revenueBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginHorizontal: 20, paddingVertical: 14, backgroundColor: Colors.primary, borderRadius: 14, marginTop: 24 },
  revenueBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 15, color: "#FFF" },
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
  detailModal: { backgroundColor: "#FFF", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: "85%" },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  modalTitle: { fontFamily: "Poppins_700Bold", fontSize: 20, color: Colors.secondary },
  detailSection: { marginBottom: 16 },
  detailHeaderCard: { alignItems: "center", paddingVertical: 16, gap: 8 },
  detailIconBig: { width: 56, height: 56, borderRadius: 16, backgroundColor: Colors.primary + "12", alignItems: "center", justifyContent: "center" },
  detailBizName: { fontFamily: "Poppins_700Bold", fontSize: 18, color: Colors.secondary },
  detailGrid: { gap: 2 },
  descBox: { marginTop: 12, backgroundColor: Colors.surfaceAlt, borderRadius: 12, padding: 14 },
  descLabel: { fontFamily: "Poppins_600SemiBold", fontSize: 12, color: Colors.textSecondary, marginBottom: 4 },
  descText: { fontFamily: "Poppins_400Regular", fontSize: 13, color: Colors.text },
  rejectionBox: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginTop: 12, backgroundColor: Colors.error + "10", borderRadius: 12, padding: 14 },
  rejectionText: { fontFamily: "Poppins_500Medium", fontSize: 13, color: Colors.error, flex: 1 },
  rejectModal: { backgroundColor: "#FFF", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 },
  rejectDesc: { fontFamily: "Poppins_400Regular", fontSize: 14, color: Colors.textSecondary, marginTop: 8, marginBottom: 16 },
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
  rejectActions: { flexDirection: "row", gap: 10, marginTop: 10 },
  cancelBtn: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: Colors.border },
  cancelBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: Colors.textSecondary },
  confirmRejectBtn: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 12, borderRadius: 12, backgroundColor: Colors.error },
  fullOrderCard: { backgroundColor: "#FFF", borderRadius: 16, padding: 16, marginBottom: 12 },
  fullOrderTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  fullOrderId: { fontFamily: "Poppins_700Bold", fontSize: 15, color: Colors.secondary },
  fullOrderDetails: { marginTop: 12, gap: 6 },
  fullOrderRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  fullOrderLabel: { fontFamily: "Poppins_400Regular", fontSize: 13, color: Colors.text, flex: 1 },
  fullOrderBottom: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.borderLight },
  fullOrderAmount: { fontFamily: "Poppins_700Bold", fontSize: 18, color: Colors.primary },
  fullOrderTime: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary },
  teamStatsRow: { flexDirection: "row", gap: 10, marginBottom: 16 },
  teamStatCard: { flex: 1, borderRadius: 14, padding: 14, alignItems: "center" },
  teamStatValue: { fontFamily: "Poppins_700Bold", fontSize: 22 },
  teamStatLabel: { fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  teamHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  teamFilterRow: { flexDirection: "row", backgroundColor: "#FFF", borderRadius: 10, padding: 3, flex: 1, marginRight: 10 },
  teamFilterBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: "center" },
  teamFilterBtnActive: { backgroundColor: Colors.primary },
  teamFilterText: { fontFamily: "Poppins_600SemiBold", fontSize: 12, color: Colors.textSecondary },
  teamFilterTextActive: { color: "#FFF" },
  addMemberBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: Colors.primary, alignItems: "center", justifyContent: "center" },
  memberCard: { flexDirection: "row", alignItems: "center", backgroundColor: "#FFF", borderRadius: 16, padding: 14, marginBottom: 10, gap: 12 },
  memberAvatar: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center" },
  memberAvatarText: { fontFamily: "Poppins_700Bold", fontSize: 18 },
  memberInfo: { flex: 1 },
  memberName: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: Colors.text },
  memberPhone: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary, marginTop: 1 },
  memberMetaRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  roleBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  roleBadgeText: { fontFamily: "Poppins_600SemiBold", fontSize: 10 },
  memberDate: { fontFamily: "Poppins_400Regular", fontSize: 10, color: Colors.textLight },
  memberActions: { alignItems: "center", gap: 8 },
  statusToggle: { padding: 4 },
  statusDot: { width: 12, height: 12, borderRadius: 6 },
  confirmRemoveRow: { flexDirection: "row", gap: 4 },
  addMemberLabel: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: Colors.secondary, marginBottom: 6, marginTop: 12 },
  roleSelector: { flexDirection: "row", gap: 10, marginBottom: 4 },
  roleSelectorBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, borderRadius: 12, backgroundColor: Colors.surfaceAlt },
  roleSelectorBtnActive: { backgroundColor: Colors.primary },
  roleSelectorText: { fontFamily: "Poppins_600SemiBold", fontSize: 12, color: Colors.text },
  roleSelectorTextActive: { color: "#FFF" },
  phoneInputRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  phonePrefix: { backgroundColor: Colors.surfaceAlt, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 13, justifyContent: "center" },
  phonePrefixText: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: Colors.secondary },
  submitMemberBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 14, marginTop: 16, marginBottom: 8 },
  subCatItem: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "#FFF", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 6, marginLeft: 24 },
  subCatLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  subCatName: { fontFamily: "Poppins_500Medium", fontSize: 13, color: Colors.text },
  subCatBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  catGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 14 },
  catGridItem: { width: "47%", flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 14, paddingHorizontal: 14, borderRadius: 14, backgroundColor: Colors.surfaceAlt, borderWidth: 2, borderColor: "transparent" } as any,
  catGridText: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: Colors.text, flex: 1 },
  aiGenerateBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#6366F1", borderRadius: 14, paddingVertical: 14, marginBottom: 14 },
  sectionHeader: { fontFamily: "Poppins_700Bold", fontSize: 14, color: Colors.secondary, marginTop: 18, marginBottom: 4, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: Colors.border },
  genderBtn: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 10, borderRadius: 10, backgroundColor: Colors.surfaceAlt },
  genderBtnActive: { backgroundColor: Colors.primary },
  genderBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 12, color: Colors.text },
  fieldError: { fontFamily: "Poppins_400Regular", fontSize: 11, color: "#EF4444", marginTop: -4, marginBottom: 4 },
  legalNote: { flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: "#EFF6FF", borderRadius: 10, padding: 12, marginTop: 16, borderWidth: 1, borderColor: "#BFDBFE" },
  legalNoteText: { fontFamily: "Poppins_400Regular", fontSize: 11, color: "#1E40AF", flex: 1, lineHeight: 16 },
  browseBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
});

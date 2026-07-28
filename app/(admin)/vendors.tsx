import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  TextInput,
  Modal,
  Alert,
  ActivityIndicator,
  Switch,
} from "react-native";
import MapLocationPicker from "@/components/MapLocationPicker";
import { Image } from "expo-image";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import Colors from "@/constants/colors";
import { useApp } from "@/lib/store";
import { vendors as staticVendors, categories } from "@/lib/data";
import { getApiUrl } from "@/lib/query-client";
import AsyncStorage from "@react-native-async-storage/async-storage";

type TabFilter = "All" | "Active" | "Pending" | "Approved" | "Live" | "Rejected";

const TABS: TabFilter[] = ["All", "Active", "Pending", "Approved", "Live", "Rejected"];

export default function VendorManagementScreen() {
  const insets = useSafeAreaInsets();
  const { vendorApplications, reviewVendorApplication, makeVendorLive, bulkApproveVendors, liveVendors, deleteVendor, reloadVendors } = useApp();
  const vendors = useMemo(() => liveVendors, [liveVendors]);
  const [activeTab, setActiveTab] = useState<TabFilter>("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [assignModal, setAssignModal] = useState<{ vendorId: string; vendorName: string } | null>(null);
  const [agentName, setAgentName] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [editModal, setEditModal] = useState<{ id: string; name: string; description: string; commissionRate: string; categoryId: string; subCategoryId: string; address: string; pinCode: string; isOpen: boolean; rating: string; deliveryTime: string; codEnabled: boolean; lat: string; lng: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [productsModal, setProductsModal] = useState<{ id: string; name: string } | null>(null);
  const [vendorProducts, setVendorProducts] = useState<any[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [newProduct, setNewProduct] = useState({ name: "", description: "", price: "", originalPrice: "", category: "", image: "" });
  const [addingProduct, setAddingProduct] = useState(false);
  const [deletingProductId, setDeletingProductId] = useState<string | null>(null);
  const [adminLocPicker, setAdminLocPicker] = useState<{ id: string; name: string } | null>(null);
  const [adminPickerCoords, setAdminPickerCoords] = useState({ latitude: 20.5547, longitude: 74.5247 });
  const [adminLocSaving, setAdminLocSaving] = useState(false);
  const [bulkApproving, setBulkApproving] = useState(false);
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);
  const [visibleVendorCount, setVisibleVendorCount] = useState(50);

  const isLocMissing = (v: { lat?: number | null; lng?: number | null }) => {
    const lat = v.lat ?? 0;
    const lng = v.lng ?? 0;
    if (!lat || !lng) return true;
    if (Math.abs(lat - 20.5547) < 0.001 && Math.abs(lng - 74.5247) < 0.001) return true;
    return false;
  };

  const handleAdminLocConfirm = async () => {
    if (!adminLocPicker) return;
    setAdminLocSaving(true);
    try {
      const token = await AsyncStorage.getItem("gobharat_auth_token");
      const res = await fetch(
        new URL(`/api/vendors/${adminLocPicker.id}?_t=${Date.now()}`, getApiUrl()).toString(),
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ lat: adminPickerCoords.latitude, lng: adminPickerCoords.longitude }),
        }
      );
      const data = await res.json();
      if (data.success) {
        try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
        Alert.alert("Saved", `Location updated for ${adminLocPicker.name}`);
        setAdminLocPicker(null);
        reloadVendors();
      } else {
        Alert.alert("Error", data.error || "Failed to save location");
      }
    } catch {
      Alert.alert("Error", "Network error. Please try again.");
    } finally {
      setAdminLocSaving(false);
    }
  };

  const handleAssignAgent = async () => {
    if (!assignModal || !agentName.trim()) return;
    setAssigning(true);
    try {
      const token = await AsyncStorage.getItem("gobharat_auth_token");
      const res = await fetch(new URL(`/api/vendors/${assignModal.vendorId}/assign-marketing-agent`, getApiUrl()).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ marketingAgentName: agentName.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
        Alert.alert("Done", `${assignModal.vendorName} linked to ${agentName.trim()}`);
        setAssignModal(null);
        setAgentName("");
      } else {
        Alert.alert("Error", data.error || "Failed to assign agent");
      }
    } catch {
      Alert.alert("Error", "Network error. Please try again.");
    } finally {
      setAssigning(false);
    }
  };

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  const activeVendors = vendors.filter((v) => v.isOpen);
  const pendingApps = vendorApplications.filter((a) => a.status === "PENDING");
  const approvedApps = vendorApplications.filter((a) => a.status === "APPROVED");
  const liveApps = vendorApplications.filter((a) => a.status === "LIVE");
  const rejectedApps = vendorApplications.filter((a) => a.status === "REJECTED");

  const filteredVendors = useMemo(() => {
    let list = vendors;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((v) => v.name.toLowerCase().includes(q));
    }
    if (activeTab === "Active") {
      list = list.filter((v) => v.isOpen);
    }
    return list;
  }, [searchQuery, activeTab, vendors]);

  const filteredApplications = useMemo(() => {
    let apps = vendorApplications;
    // In "All" tab: skip LIVE applications — they are already shown in Registered Vendors
    if (activeTab === "All") apps = apps.filter((a) => a.status !== "LIVE");
    else if (activeTab === "Pending") apps = apps.filter((a) => a.status === "PENDING");
    else if (activeTab === "Approved") apps = apps.filter((a) => a.status === "APPROVED");
    else if (activeTab === "Live") apps = apps.filter((a) => a.status === "LIVE");
    else if (activeTab === "Rejected") apps = apps.filter((a) => a.status === "REJECTED");
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      apps = apps.filter((a) => a.businessName.toLowerCase().includes(q) || a.ownerName.toLowerCase().includes(q));
    }
    return apps;
  }, [vendorApplications, activeTab, searchQuery]);

  const showVendorList = activeTab === "All" || activeTab === "Active";
  const showApplications = activeTab !== "Active";

  const handleApprove = (appId: string) => {
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
    reviewVendorApplication(appId, "APPROVED");
  };

  const confirmBulkApprove = async () => {
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
    setBulkApproving(true);
    const result = await bulkApproveVendors();
    setBulkApproving(false);
    setShowBulkConfirm(false);
    if (result.ok) {
      Alert.alert("Vendors approved", `${result.approved} pending vendor(s) are now live and visible to customers.`);
    } else {
      Alert.alert("Approval failed", "Could not approve the pending vendors. Please try again.");
    }
  };

  const handleReject = (appId: string) => {
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); } catch {}
    reviewVendorApplication(appId, "REJECTED", "Rejected by admin");
  };

  const handleMakeLive = (appId: string) => {
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
    makeVendorLive(appId);
  };

  const handleDeleteVendor = (id: string, name: string) => {
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); } catch {}
    setDeleteConfirm({ id, name });
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    setDeleting(true);
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); } catch {}
    const ok = await deleteVendor(deleteConfirm.id);
    setDeleting(false);
    setDeleteConfirm(null);
    if (!ok) Alert.alert("Error", "Failed to delete vendor. Please try again.");
  };

  const handleSaveVendor = async () => {
    if (!editModal) return;
    setSaving(true);
    try {
      const token = await AsyncStorage.getItem("gobharat_auth_token");
      const res = await fetch(
        new URL(`/api/vendors/${editModal.id}?_t=${Date.now()}`, getApiUrl()).toString(),
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            name: editModal.name,
            description: editModal.description,
            commissionRate: parseFloat(editModal.commissionRate) || 10,
            categoryId: editModal.categoryId,
            subCategoryId: editModal.subCategoryId,
            address: editModal.address,
            pinCode: editModal.pinCode,
            isOpen: editModal.isOpen,
            rating: parseFloat(editModal.rating) || 4,
            deliveryTime: editModal.deliveryTime,
            codEnabled: editModal.codEnabled,
            lat: editModal.lat ? parseFloat(editModal.lat) : undefined,
            lng: editModal.lng ? parseFloat(editModal.lng) : undefined,
          }),
        }
      );
      const data = await res.json();
      if (data.success) {
        try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
        setEditModal(null);
      } else {
        Alert.alert("Error", data.error || "Failed to save changes");
      }
    } catch {
      Alert.alert("Error", "Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleOpenProducts = async (vendor: { id: string; name: string }) => {
    setProductsModal(vendor);
    setVendorProducts([]);
    setNewProduct({ name: "", description: "", price: "", originalPrice: "", category: "", image: "" });
    setLoadingProducts(true);
    try {
      const token = await AsyncStorage.getItem("gobharat_auth_token");
      const res = await fetch(
        new URL(`/api/vendor/products/${vendor.id}?_t=${Date.now()}`, getApiUrl()).toString(),
        { headers: { "Cache-Control": "no-store", ...(token ? { Authorization: `Bearer ${token}` } : {}) } }
      );
      const data = await res.json();
      setVendorProducts(Array.isArray(data) ? data : []);
    } catch {
      setVendorProducts([]);
    } finally {
      setLoadingProducts(false);
    }
  };

  const handleAddProduct = async () => {
    if (!productsModal || !newProduct.name.trim() || !newProduct.price) return;
    setAddingProduct(true);
    try {
      const token = await AsyncStorage.getItem("gobharat_auth_token");
      const res = await fetch(
        new URL(`/api/admin/vendors/${productsModal.id}/products?_t=${Date.now()}`, getApiUrl()).toString(),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            name: newProduct.name.trim(),
            description: newProduct.description.trim(),
            price: parseFloat(newProduct.price),
            originalPrice: newProduct.originalPrice ? parseFloat(newProduct.originalPrice) : null,
            category: newProduct.category.trim(),
          }),
        }
      );
      const data = await res.json();
      if (data.success) {
        // Upload image if one was picked
        if (newProduct.image && data.id) {
          try {
            await fetch(
              new URL(`/api/products/${data.id}/image?_t=${Date.now()}`, getApiUrl()).toString(),
              {
                method: "PATCH",
                headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                body: JSON.stringify({ image: newProduct.image }),
              }
            );
          } catch {}
        }
        try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
        setNewProduct({ name: "", description: "", price: "", originalPrice: "", category: "", image: "" });
        // Reload products
        const r2 = await fetch(new URL(`/api/vendor/products/${productsModal.id}?_t=${Date.now()}`, getApiUrl()).toString());
        const d2 = await r2.json();
        setVendorProducts(Array.isArray(d2) ? d2 : []);
      } else {
        Alert.alert("Error", data.error || "Failed to add product");
      }
    } catch {
      Alert.alert("Error", "Network error. Please try again.");
    } finally {
      setAddingProduct(false);
    }
  };

  const pickProductImage = async (onPick: (base64: string) => void) => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission needed", "Please allow photo access to upload product images.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.6,
        base64: true,
      });
      if (!result.canceled && result.assets?.[0]?.base64) {
        const b64 = result.assets[0].base64;
        const sizeBytes = b64.length * 0.75; // approximate decoded byte size
        if (sizeBytes > 1024 * 1024) {
          Alert.alert("Photo too large", "Please choose a photo under 1 MB. Try cropping or picking a smaller image.");
          return;
        }
        const dataUrl = `data:image/jpeg;base64,${b64}`;
        onPick(dataUrl);
      }
    } catch {
      Alert.alert("Error", "Failed to pick image");
    }
  };

  const handleUploadExistingProductImage = async (productId: string) => {
    await pickProductImage(async (dataUrl) => {
      try {
        const token = await AsyncStorage.getItem("gobharat_auth_token");
        const res = await fetch(
          new URL(`/api/products/${productId}/image?_t=${Date.now()}`, getApiUrl()).toString(),
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            body: JSON.stringify({ image: dataUrl }),
          }
        );
        const data = await res.json();
        if (data.success) {
          try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
          // Mark this product as having an image locally
          setVendorProducts(prev => prev.map(p => p.id === productId ? { ...p, image: "uploaded" } : p));
        } else {
          Alert.alert("Error", data.error || "Failed to upload image");
        }
      } catch {
        Alert.alert("Error", "Network error uploading image");
      }
    });
  };

  const handleDeleteProduct = async (productId: string) => {
    setDeletingProductId(productId);
    try {
      const token = await AsyncStorage.getItem("gobharat_auth_token");
      const res = await fetch(
        new URL(`/api/vendor/products/${productId}?_t=${Date.now()}`, getApiUrl()).toString(),
        {
          method: "DELETE",
          headers: { "Cache-Control": "no-store", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        }
      );
      const data = await res.json();
      if (data.success) {
        try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); } catch {}
        setVendorProducts((prev) => prev.filter((p) => p.id !== productId));
      } else {
        Alert.alert("Error", data.error || "Failed to delete product");
      }
    } catch {
      Alert.alert("Error", "Network error. Please try again.");
    } finally {
      setDeletingProductId(null);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "PENDING": return Colors.warning;
      case "APPROVED": return Colors.info;
      case "LIVE": return Colors.success;
      case "REJECTED": return Colors.error;
      default: return Colors.textSecondary;
    }
  };

  const getCategoryName = (categoryId: string) => {
    return categories.find((c) => c.id === categoryId)?.name || "N/A";
  };

  const getCategoryColor = (categoryId: string) => {
    return categories.find((c) => c.id === categoryId)?.color || Colors.primary;
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={["#0B1E3D", "#142F5E"]} style={[styles.header, { paddingTop: topInset + 12 }]}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => { try { Haptics.selectionAsync(); } catch {} router.back(); }} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color="#FFF" />
          </Pressable>
          <Text style={styles.headerTitle}>Vendor Management</Text>
          <View style={{ width: 36 }} />
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{vendors.length}</Text>
            <Text style={styles.statLabel}>Total</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: "rgba(16,185,129,0.15)" }]}>
            <Text style={[styles.statValue, { color: Colors.success }]}>{activeVendors.length}</Text>
            <Text style={styles.statLabel}>Active</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: "rgba(245,158,11,0.15)" }]}>
            <Text style={[styles.statValue, { color: Colors.warning }]}>{pendingApps.length}</Text>
            <Text style={styles.statLabel}>Pending</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: "rgba(59,130,246,0.15)" }]}>
            <Text style={[styles.statValue, { color: Colors.info }]}>{approvedApps.length + liveApps.length}</Text>
            <Text style={styles.statLabel}>Apps</Text>
          </View>
        </View>

        {pendingApps.length > 0 && (
          <Pressable
            style={({ pressed }) => [styles.bulkApproveBtn, pressed && { opacity: 0.85 }]}
            onPress={() => { try { Haptics.selectionAsync(); } catch {} setShowBulkConfirm(true); }}
            disabled={bulkApproving}
          >
            {bulkApproving ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <>
                <Ionicons name="checkmark-done-circle" size={20} color="#FFF" />
                <Text style={styles.bulkApproveBtnText}>Approve all pending ({pendingApps.length})</Text>
              </>
            )}
          </Pressable>
        )}
      </LinearGradient>

      <View style={styles.tabContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabScroll}>
          {TABS.map((tab) => {
            const isActive = activeTab === tab;
            let count = 0;
            if (tab === "All") count = vendors.length + vendorApplications.length;
            else if (tab === "Active") count = activeVendors.length;
            else if (tab === "Pending") count = pendingApps.length;
            else if (tab === "Approved") count = approvedApps.length;
            else if (tab === "Live") count = liveApps.length;
            else if (tab === "Rejected") count = rejectedApps.length;
            return (
              <Pressable
                key={tab}
                style={[styles.tab, isActive && styles.tabActive]}
                onPress={() => { try { Haptics.selectionAsync(); } catch {} setActiveTab(tab); setVisibleVendorCount(50); }}
              >
                <Text style={[styles.tabText, isActive && styles.tabTextActive]}>{tab}</Text>
                {count > 0 && (
                  <View style={[styles.tabBadge, isActive && styles.tabBadgeActive]}>
                    <Text style={[styles.tabBadgeText, isActive && styles.tabBadgeTextActive]}>{count > 999 ? "999+" : count}</Text>
                  </View>
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <View style={styles.searchContainer}>
        <Ionicons name="search" size={18} color={Colors.textLight} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search vendors..."
          placeholderTextColor={Colors.textLight}
          value={searchQuery}
          onChangeText={(t) => { setSearchQuery(t); setVisibleVendorCount(50); }}
        />
        {searchQuery.length > 0 && (
          <Pressable onPress={() => { setSearchQuery(""); setVisibleVendorCount(50); }} style={styles.clearBtn}>
            <Ionicons name="close-circle" size={18} color={Colors.textLight} />
          </Pressable>
        )}
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{ paddingBottom: bottomInset + 20 }}
        showsVerticalScrollIndicator={false}
      >
        {showVendorList && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="storefront" size={18} color={Colors.primary} />
              <Text style={styles.sectionTitle}>Registered Vendors ({filteredVendors.length})</Text>
            </View>
            {filteredVendors.slice(0, visibleVendorCount).map((vendor) => {
              const catName = getCategoryName(vendor.categoryId);
              const catColor = getCategoryColor(vendor.categoryId);
              return (
                <View key={vendor.id} style={styles.vendorCard}>
                  <View style={styles.vendorCardTop}>
                    <View style={styles.vendorAvatar}>
                      <Ionicons name="storefront" size={20} color={Colors.primary} />
                    </View>
                    <View style={styles.vendorInfo}>
                      <View style={styles.vendorNameRow}>
                        <Text style={styles.vendorName} numberOfLines={1}>{vendor.name}</Text>
                        <View style={[styles.statusDot, { backgroundColor: vendor.isOpen ? Colors.success : Colors.error }]} />
                      </View>
                      <Text style={styles.vendorDesc} numberOfLines={1}>{vendor.description}</Text>
                      <View style={styles.vendorMeta}>
                        <View style={styles.metaItem}>
                          <Ionicons name="star" size={12} color={Colors.warning} />
                          <Text style={styles.metaText}>{vendor.rating}</Text>
                        </View>
                        <View style={styles.metaDivider} />
                        <View style={styles.metaItem}>
                          <Ionicons name="card" size={12} color={Colors.info} />
                          <Text style={styles.metaText}>{vendor.commissionRate}%</Text>
                        </View>
                        <View style={styles.metaDivider} />
                        <View style={[styles.categoryBadge, { backgroundColor: catColor + "18" }]}>
                          <Text style={[styles.categoryBadgeText, { color: catColor }]}>{catName}</Text>
                        </View>
                        {isLocMissing(vendor) && (
                          <Pressable
                            style={{ flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: Colors.error + "18", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3, marginLeft: 4 }}
                            onPress={() => {
                              try { Haptics.selectionAsync(); } catch {}
                              setAdminPickerCoords({ latitude: (vendor.lat && vendor.lat > 1) ? vendor.lat : 20.5547, longitude: (vendor.lng && vendor.lng > 1) ? vendor.lng : 74.5247 });
                              setAdminLocPicker({ id: vendor.id, name: vendor.name });
                            }}
                          >
                            <Ionicons name="location-outline" size={11} color={Colors.error} />
                            <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 10, color: Colors.error }}>No location</Text>
                          </Pressable>
                        )}
                      </View>
                    </View>
                  </View>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <Pressable
                      style={[styles.linkAgentBtn, { flex: 1 }]}
                      onPress={() => {
                        try { Haptics.selectionAsync(); } catch {}
                        setAgentName("");
                        setAssignModal({ vendorId: vendor.id, vendorName: vendor.name });
                      }}
                    >
                      <Ionicons name="person-add-outline" size={13} color={Colors.primary} />
                      <Text style={styles.linkAgentText}>Link Agent</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.linkAgentBtn, { backgroundColor: "#F0FFF4", borderColor: Colors.success + "40" }]}
                      onPress={() => {
                        try { Haptics.selectionAsync(); } catch {}
                        handleOpenProducts({ id: vendor.id, name: vendor.name });
                      }}
                    >
                      <Ionicons name="cube-outline" size={14} color={Colors.success} />
                    </Pressable>
                    <Pressable
                      style={[styles.linkAgentBtn, { backgroundColor: "#F0F7FF", borderColor: Colors.info + "40" }]}
                      onPress={() => {
                        try { Haptics.selectionAsync(); } catch {}
                        setEditModal({
                          id: vendor.id,
                          name: vendor.name,
                          description: vendor.description,
                          commissionRate: String(vendor.commissionRate),
                          categoryId: vendor.categoryId,
                          subCategoryId: vendor.subCategoryId || "",
                          address: vendor.address || "",
                          pinCode: vendor.pinCode || "",
                          isOpen: vendor.isOpen,
                          rating: String(vendor.rating),
                          deliveryTime: vendor.deliveryTime || "30-45 min",
                          codEnabled: vendor.codEnabled ?? false,
                          lat: String(vendor.lat || ""),
                          lng: String(vendor.lng || ""),
                        });
                      }}
                    >
                      <Ionicons name="create-outline" size={14} color={Colors.info} />
                    </Pressable>
                    <Pressable
                      style={[styles.linkAgentBtn, { backgroundColor: Colors.error + "12", borderColor: Colors.error + "30" }]}
                      onPress={() => handleDeleteVendor(vendor.id, vendor.name)}
                    >
                      <Ionicons name="trash-outline" size={14} color={Colors.error} />
                    </Pressable>
                  </View>
                </View>
              );
            })}
            {filteredVendors.length > visibleVendorCount && (
              <View style={{ gap: 8, marginTop: 4 }}>
                <Text style={styles.moreText}>Showing {Math.min(visibleVendorCount, filteredVendors.length)} of {filteredVendors.length} vendors</Text>
                <Pressable
                  style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: Colors.primary + "12", borderColor: Colors.primary + "33", borderWidth: 1, borderRadius: 12, paddingVertical: 12 }, pressed && { opacity: 0.85 }]}
                  onPress={() => { try { Haptics.selectionAsync(); } catch {} setVisibleVendorCount((c) => Math.min(c + 50, filteredVendors.length)); }}
                >
                  <Ionicons name="chevron-down-circle-outline" size={18} color={Colors.primary} />
                  <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 14, color: Colors.primary }}>Load 50 more</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: Colors.primary, borderRadius: 12, paddingVertical: 12 }, pressed && { opacity: 0.85 }]}
                  onPress={() => { try { Haptics.selectionAsync(); } catch {} setVisibleVendorCount(filteredVendors.length); }}
                >
                  <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 14, color: "#FFF" }}>Show all {filteredVendors.length}</Text>
                </Pressable>
              </View>
            )}
            {filteredVendors.length === 0 && (
              <View style={styles.emptyState}>
                <Ionicons name="search-outline" size={36} color={Colors.textLight} />
                <Text style={styles.emptyText}>No vendors found</Text>
              </View>
            )}
          </View>
        )}

        {showApplications && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="document-text" size={18} color={Colors.secondary} />
              <Text style={styles.sectionTitle}>Vendor Applications ({filteredApplications.length})</Text>
            </View>
            {filteredApplications.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="folder-open-outline" size={36} color={Colors.textLight} />
                <Text style={styles.emptyText}>No applications found</Text>
              </View>
            ) : (
              filteredApplications.map((app) => {
                const statusColor = getStatusColor(app.status);
                const catName = getCategoryName(app.categoryId);
                return (
                  <View key={app.id} style={styles.appCard}>
                    <View style={styles.appCardTop}>
                      <View style={styles.appAvatar}>
                        <Ionicons name="briefcase" size={18} color={Colors.secondary} />
                      </View>
                      <View style={styles.appInfo}>
                        <Text style={styles.appName}>{app.businessName}</Text>
                        <Text style={styles.appOwner}>{app.ownerName} | {app.city}</Text>
                        <View style={styles.appMetaRow}>
                          <View style={[styles.statusBadge, { backgroundColor: statusColor + "18" }]}>
                            <Text style={[styles.statusBadgeText, { color: statusColor }]}>{app.status}</Text>
                          </View>
                          <View style={[styles.categoryBadge, { backgroundColor: getCategoryColor(app.categoryId) + "18" }]}>
                            <Text style={[styles.categoryBadgeText, { color: getCategoryColor(app.categoryId) }]}>{catName}</Text>
                          </View>
                          <Text style={styles.appSubmitted}>by {app.submittedBy}</Text>
                        </View>
                      </View>
                    </View>
                    {app.status === "PENDING" && (
                      <View style={styles.appActions}>
                        <Pressable style={styles.approveBtn} onPress={() => handleApprove(app.id)}>
                          <Ionicons name="checkmark" size={16} color="#FFF" />
                          <Text style={styles.actionBtnText}>Approve</Text>
                        </Pressable>
                        <Pressable style={styles.rejectBtn} onPress={() => handleReject(app.id)}>
                          <Ionicons name="close" size={16} color="#FFF" />
                          <Text style={styles.actionBtnText}>Reject</Text>
                        </Pressable>
                        <Pressable style={styles.deleteBtn} onPress={() => handleDeleteVendor(app.id, app.businessName)}>
                          <Ionicons name="trash-outline" size={15} color="#FFF" />
                        </Pressable>
                      </View>
                    )}
                    {app.status === "APPROVED" && (
                      <View style={styles.appActions}>
                        <Pressable style={styles.liveBtn} onPress={() => handleMakeLive(app.id)}>
                          <Ionicons name="rocket" size={16} color="#FFF" />
                          <Text style={styles.actionBtnText}>Make Live</Text>
                        </Pressable>
                        <Pressable style={styles.deleteBtn} onPress={() => handleDeleteVendor(app.id, app.businessName)}>
                          <Ionicons name="trash-outline" size={15} color="#FFF" />
                        </Pressable>
                      </View>
                    )}
                    {(app.status === "REJECTED" || app.status === "LIVE") && (
                      <View style={styles.appActions}>
                        <Pressable style={styles.deleteBtn} onPress={() => handleDeleteVendor(app.id, app.businessName)}>
                          <Ionicons name="trash-outline" size={15} color="#FFF" />
                          <Text style={styles.actionBtnText}>Delete</Text>
                        </Pressable>
                      </View>
                    )}
                  </View>
                );
              })
            )}
          </View>
        )}
      </ScrollView>

      {/* Admin Location Picker Modal */}
      <Modal visible={!!adminLocPicker} animationType="slide" onRequestClose={() => !adminLocSaving && setAdminLocPicker(null)}>
        {adminLocPicker && (
          <MapLocationPicker
            coords={adminPickerCoords}
            onPress={(lat, lng) => setAdminPickerCoords({ latitude: lat, longitude: lng })}
            onConfirm={handleAdminLocConfirm}
            onClose={() => setAdminLocPicker(null)}
          />
        )}
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal visible={!!deleteConfirm} transparent animationType="fade" onRequestClose={() => !deleting && setDeleteConfirm(null)}>
        <Pressable style={styles.modalOverlay} onPress={() => !deleting && setDeleteConfirm(null)}>
          <Pressable style={styles.modalBox} onPress={(e) => e.stopPropagation()}>
            <View style={[styles.modalHeader, { justifyContent: "center" }]}>
              <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: Colors.error + "18", alignItems: "center", justifyContent: "center", marginBottom: 8 }}>
                <Ionicons name="trash" size={22} color={Colors.error} />
              </View>
            </View>
            <Text style={[styles.modalTitle, { textAlign: "center" }]}>Delete Vendor?</Text>
            <Text style={[styles.modalSubtitle, { textAlign: "center", marginBottom: 20 }]}>
              "{deleteConfirm?.name}" will be permanently removed. This cannot be undone.
            </Text>
            <View style={styles.modalActions}>
              <Pressable style={styles.modalCancelBtn} onPress={() => setDeleteConfirm(null)} disabled={deleting}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalConfirmBtn, { backgroundColor: Colors.error }, deleting && { opacity: 0.5 }]}
                onPress={confirmDelete}
                disabled={deleting}
              >
                {deleting ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Text style={styles.modalConfirmText}>Delete</Text>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Bulk Approve Confirmation Modal */}
      <Modal visible={showBulkConfirm} transparent animationType="fade" onRequestClose={() => !bulkApproving && setShowBulkConfirm(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => !bulkApproving && setShowBulkConfirm(false)}>
          <Pressable style={styles.modalBox} onPress={(e) => e.stopPropagation()}>
            <View style={[styles.modalHeader, { justifyContent: "center" }]}>
              <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: Colors.success + "18", alignItems: "center", justifyContent: "center", marginBottom: 8 }}>
                <Ionicons name="checkmark-done-circle" size={24} color={Colors.success} />
              </View>
            </View>
            <Text style={[styles.modalTitle, { textAlign: "center" }]}>Approve all pending vendors?</Text>
            <Text style={[styles.modalSubtitle, { textAlign: "center", marginBottom: 20 }]}>
              This will make all {pendingApps.length} pending vendor(s) live and visible to customers. You can still edit or remove them afterwards.
            </Text>
            <View style={styles.modalActions}>
              <Pressable style={styles.modalCancelBtn} onPress={() => setShowBulkConfirm(false)} disabled={bulkApproving}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalConfirmBtn, { backgroundColor: Colors.success }, bulkApproving && { opacity: 0.5 }]}
                onPress={confirmBulkApprove}
                disabled={bulkApproving}
              >
                {bulkApproving ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Text style={styles.modalConfirmText}>Approve all</Text>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Assign Marketing Agent Modal */}
      <Modal visible={!!assignModal} transparent animationType="fade" onRequestClose={() => setAssignModal(null)}>
        <Pressable style={styles.modalOverlay} onPress={() => setAssignModal(null)}>
          <Pressable style={styles.modalBox} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Ionicons name="person-add" size={22} color={Colors.primary} />
              <Text style={styles.modalTitle}>Link Marketing Agent</Text>
            </View>
            <Text style={styles.modalSubtitle} numberOfLines={2}>{assignModal?.vendorName}</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Agent's full name"
              placeholderTextColor={Colors.textLight}
              value={agentName}
              onChangeText={setAgentName}
              autoCapitalize="words"
              returnKeyType="done"
              onSubmitEditing={handleAssignAgent}
            />
            <View style={styles.modalActions}>
              <Pressable style={styles.modalCancelBtn} onPress={() => { setAssignModal(null); setAgentName(""); }}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalConfirmBtn, (!agentName.trim() || assigning) && { opacity: 0.5 }]}
                onPress={handleAssignAgent}
                disabled={!agentName.trim() || assigning}
              >
                {assigning ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Text style={styles.modalConfirmText}>Assign</Text>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Edit Vendor Modal */}
      <Modal visible={!!editModal} transparent animationType="slide" onRequestClose={() => !saving && setEditModal(null)}>
        <Pressable style={styles.modalOverlay} onPress={() => !saving && setEditModal(null)}>
          <Pressable style={[styles.modalBox, { maxHeight: "90%" }]} onPress={(e) => e.stopPropagation()}>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <View style={styles.modalHeader}>
                <Ionicons name="create" size={22} color={Colors.info} />
                <Text style={styles.modalTitle}>Edit Vendor</Text>
              </View>

              {/* ── Basic Info ── */}
              <Text style={styles.editSectionLabel}>BASIC INFO</Text>

              <Text style={styles.editFieldLabel}>Business Name</Text>
              <TextInput
                style={styles.modalInput}
                value={editModal?.name}
                onChangeText={(t) => setEditModal((p) => p ? { ...p, name: t } : p)}
                placeholder="Business name"
                placeholderTextColor={Colors.textLight}
                autoCapitalize="words"
              />

              <Text style={styles.editFieldLabel}>Description</Text>
              <TextInput
                style={[styles.modalInput, { height: 80, textAlignVertical: "top", paddingTop: 11 }]}
                value={editModal?.description}
                onChangeText={(t) => setEditModal((p) => p ? { ...p, description: t } : p)}
                placeholder="Short description of what you offer"
                placeholderTextColor={Colors.textLight}
                multiline
              />

              {/* ── Category ── */}
              <Text style={styles.editSectionLabel}>CATEGORY</Text>
              <Text style={styles.editFieldLabel}>Category</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {categories.map((cat) => {
                    const active = editModal?.categoryId === cat.id;
                    return (
                      <Pressable
                        key={cat.id}
                        style={[styles.catChip, active && { backgroundColor: cat.color, borderColor: cat.color }]}
                        onPress={() => setEditModal((p) => p ? { ...p, categoryId: cat.id, subCategoryId: "" } : p)}
                      >
                        <Text style={[styles.catChipText, active && { color: "#FFF" }]}>{cat.name}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </ScrollView>

              {/* ── Pricing & Operations ── */}
              <Text style={styles.editSectionLabel}>PRICING & OPERATIONS</Text>

              <View style={{ flexDirection: "row", gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.editFieldLabel}>Commission Rate (%)</Text>
                  <TextInput
                    style={styles.modalInput}
                    value={editModal?.commissionRate}
                    onChangeText={(t) => setEditModal((p) => p ? { ...p, commissionRate: t } : p)}
                    placeholder="10"
                    placeholderTextColor={Colors.textLight}
                    keyboardType="decimal-pad"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.editFieldLabel}>Rating (1–5)</Text>
                  <TextInput
                    style={styles.modalInput}
                    value={editModal?.rating}
                    onChangeText={(t) => setEditModal((p) => p ? { ...p, rating: t } : p)}
                    placeholder="4.0"
                    placeholderTextColor={Colors.textLight}
                    keyboardType="decimal-pad"
                  />
                </View>
              </View>

              <Text style={styles.editFieldLabel}>Delivery Time</Text>
              <TextInput
                style={styles.modalInput}
                value={editModal?.deliveryTime}
                onChangeText={(t) => setEditModal((p) => p ? { ...p, deliveryTime: t } : p)}
                placeholder="30-45 min"
                placeholderTextColor={Colors.textLight}
              />

              {/* ── Location ── */}
              <Text style={styles.editSectionLabel}>LOCATION</Text>

              <Text style={styles.editFieldLabel}>Address</Text>
              <TextInput
                style={styles.modalInput}
                value={editModal?.address}
                onChangeText={(t) => setEditModal((p) => p ? { ...p, address: t } : p)}
                placeholder="Full address"
                placeholderTextColor={Colors.textLight}
              />

              <Text style={styles.editFieldLabel}>Pin Code</Text>
              <TextInput
                style={styles.modalInput}
                value={editModal?.pinCode}
                onChangeText={(t) => setEditModal((p) => p ? { ...p, pinCode: t } : p)}
                placeholder="423203"
                placeholderTextColor={Colors.textLight}
                keyboardType="number-pad"
                maxLength={6}
              />

              <View style={{ flexDirection: "row", gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.editFieldLabel}>Latitude</Text>
                  <TextInput
                    style={styles.modalInput}
                    value={editModal?.lat}
                    onChangeText={(t) => setEditModal((p) => p ? { ...p, lat: t } : p)}
                    placeholder="20.5578"
                    placeholderTextColor={Colors.textLight}
                    keyboardType="decimal-pad"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.editFieldLabel}>Longitude</Text>
                  <TextInput
                    style={styles.modalInput}
                    value={editModal?.lng}
                    onChangeText={(t) => setEditModal((p) => p ? { ...p, lng: t } : p)}
                    placeholder="74.5234"
                    placeholderTextColor={Colors.textLight}
                    keyboardType="decimal-pad"
                  />
                </View>
              </View>

              {/* ── Status & Settings ── */}
              <Text style={styles.editSectionLabel}>STATUS & SETTINGS</Text>

              <Text style={styles.editFieldLabel}>Vendor Status</Text>
              <View style={styles.toggleRow}>
                <Pressable
                  style={[styles.toggleBtn, editModal?.isOpen && styles.toggleBtnActive]}
                  onPress={() => setEditModal((p) => p ? { ...p, isOpen: true } : p)}
                >
                  <Ionicons name="checkmark-circle" size={16} color={editModal?.isOpen ? "#FFF" : Colors.textLight} />
                  <Text style={[styles.toggleBtnText, editModal?.isOpen && styles.toggleBtnTextActive]}>Open</Text>
                </Pressable>
                <Pressable
                  style={[styles.toggleBtn, !editModal?.isOpen && { backgroundColor: Colors.error, borderColor: Colors.error }]}
                  onPress={() => setEditModal((p) => p ? { ...p, isOpen: false } : p)}
                >
                  <Ionicons name="close-circle" size={16} color={!editModal?.isOpen ? "#FFF" : Colors.textLight} />
                  <Text style={[styles.toggleBtnText, !editModal?.isOpen && styles.toggleBtnTextActive]}>Closed</Text>
                </Pressable>
              </View>

              <Text style={styles.editFieldLabel}>Cash on Delivery</Text>
              <View style={[styles.toggleRow, { marginBottom: 20 }]}>
                <Pressable
                  style={[styles.toggleBtn, editModal?.codEnabled && styles.toggleBtnActive]}
                  onPress={() => setEditModal((p) => p ? { ...p, codEnabled: true } : p)}
                >
                  <Ionicons name="cash" size={16} color={editModal?.codEnabled ? "#FFF" : Colors.textLight} />
                  <Text style={[styles.toggleBtnText, editModal?.codEnabled && styles.toggleBtnTextActive]}>Enabled</Text>
                </Pressable>
                <Pressable
                  style={[styles.toggleBtn, !editModal?.codEnabled && { backgroundColor: Colors.textLight, borderColor: Colors.textLight }]}
                  onPress={() => setEditModal((p) => p ? { ...p, codEnabled: false } : p)}
                >
                  <Ionicons name="close" size={16} color={!editModal?.codEnabled ? "#FFF" : Colors.textLight} />
                  <Text style={[styles.toggleBtnText, !editModal?.codEnabled && styles.toggleBtnTextActive]}>Disabled</Text>
                </Pressable>
              </View>

              <View style={[styles.modalActions, { marginTop: 4 }]}>
                <Pressable style={styles.modalCancelBtn} onPress={() => setEditModal(null)} disabled={saving}>
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[styles.modalConfirmBtn, { backgroundColor: Colors.info }, saving && { opacity: 0.5 }]}
                  onPress={handleSaveVendor}
                  disabled={saving}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <Text style={styles.modalConfirmText}>Save Changes</Text>
                  )}
                </Pressable>
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Products Management Modal */}
      <Modal visible={!!productsModal} transparent animationType="slide" onRequestClose={() => setProductsModal(null)}>
        <View style={styles.productsModalOverlay}>
          <View style={styles.productsModalBox}>
            {/* Header */}
            <View style={styles.productsModalHeader}>
              <View>
                <Text style={styles.productsModalTitle}>Products</Text>
                <Text style={styles.productsModalSub} numberOfLines={1}>{productsModal?.name}</Text>
              </View>
              <Pressable onPress={() => setProductsModal(null)} style={styles.productsCloseBtn}>
                <Ionicons name="close" size={20} color={Colors.textSecondary} />
              </Pressable>
            </View>

            <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {/* Existing Products */}
              <Text style={styles.editSectionLabel}>EXISTING PRODUCTS ({vendorProducts.length})</Text>
              {loadingProducts ? (
                <View style={{ alignItems: "center", paddingVertical: 20 }}>
                  <ActivityIndicator color={Colors.primary} />
                  <Text style={{ color: Colors.textLight, marginTop: 8, fontSize: 13 }}>Loading products...</Text>
                </View>
              ) : vendorProducts.length === 0 ? (
                <View style={styles.noProductsBox}>
                  <Ionicons name="cube-outline" size={32} color={Colors.textLight} />
                  <Text style={styles.noProductsText}>No products yet</Text>
                  <Text style={styles.noProductsHint}>Add the first product below</Text>
                </View>
              ) : (
                vendorProducts.map((p: any) => (
                  <View key={p.id} style={styles.productRow}>
                    {/* Product thumbnail — tap to change */}
                    <Pressable onPress={() => handleUploadExistingProductImage(p.id)} style={styles.productThumbWrap}>
                      {p.image && p.image !== "" ? (
                        <Image
                          source={{ uri: p.image.startsWith("data:") ? p.image : `${getApiUrl()}/api/products/${p.id}/image?_t=${Date.now()}` }}
                          style={styles.productThumb}
                          contentFit="cover"
                          accessibilityLabel={p.name}
                        />
                      ) : (
                        <View style={[styles.productThumb, { backgroundColor: Colors.primary + "15", alignItems: "center", justifyContent: "center" }]}>
                          <Ionicons name="camera-outline" size={16} color={Colors.primary} />
                        </View>
                      )}
                    </Pressable>
                    <View style={styles.productRowInfo}>
                      <Text style={styles.productRowName} numberOfLines={1}>{p.name}</Text>
                      <Text style={styles.productRowMeta}>₹{p.price}{p.originalPrice ? ` · MRP ₹${p.originalPrice}` : ""}{p.category ? ` · ${p.category}` : ""}</Text>
                      {p.description ? <Text style={styles.productRowDesc} numberOfLines={1}>{p.description}</Text> : null}
                    </View>
                    <Pressable
                      style={styles.productDeleteBtn}
                      onPress={() => handleDeleteProduct(p.id)}
                      disabled={deletingProductId === p.id}
                    >
                      {deletingProductId === p.id
                        ? <ActivityIndicator size="small" color={Colors.error} />
                        : <Ionicons name="trash-outline" size={16} color={Colors.error} />}
                    </Pressable>
                  </View>
                ))
              )}

              {/* Add New Product Form */}
              <Text style={[styles.editSectionLabel, { marginTop: 20 }]}>ADD NEW PRODUCT</Text>

              {/* Image picker */}
              <Text style={styles.editFieldLabel}>Product Photo</Text>
              <Pressable
                style={styles.productImagePickerBtn}
                onPress={() => pickProductImage((uri) => setNewProduct((p) => ({ ...p, image: uri })))}
              >
                {newProduct.image ? (
                  <Image source={{ uri: newProduct.image }} style={styles.productImagePreview} contentFit="cover" accessibilityLabel="New product photo" />
                ) : (
                  <View style={styles.productImagePickerPlaceholder}>
                    <Ionicons name="camera-outline" size={26} color={Colors.primary} />
                    <Text style={styles.productImagePickerText}>Tap to add photo</Text>
                  </View>
                )}
              </Pressable>
              {newProduct.image ? (
                <Pressable onPress={() => setNewProduct((p) => ({ ...p, image: "" }))} style={{ alignSelf: "flex-end", marginTop: 4, marginBottom: 4 }}>
                  <Text style={{ fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.error }}>Remove photo</Text>
                </Pressable>
              ) : null}

              <Text style={styles.editFieldLabel}>Product Name *</Text>
              <TextInput
                style={styles.modalInput}
                value={newProduct.name}
                onChangeText={(t) => setNewProduct((p) => ({ ...p, name: t }))}
                placeholder="e.g. Car Service, Battery 150Ah"
                placeholderTextColor={Colors.textLight}
                autoCapitalize="words"
              />

              <Text style={styles.editFieldLabel}>Description</Text>
              <TextInput
                style={[styles.modalInput, { height: 64, textAlignVertical: "top", paddingTop: 10 }]}
                value={newProduct.description}
                onChangeText={(t) => setNewProduct((p) => ({ ...p, description: t }))}
                placeholder="Optional details about the product"
                placeholderTextColor={Colors.textLight}
                multiline
              />

              <View style={{ flexDirection: "row", gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.editFieldLabel}>Price (₹) *</Text>
                  <TextInput
                    style={styles.modalInput}
                    value={newProduct.price}
                    onChangeText={(t) => setNewProduct((p) => ({ ...p, price: t }))}
                    placeholder="500"
                    placeholderTextColor={Colors.textLight}
                    keyboardType="decimal-pad"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.editFieldLabel}>MRP / Original (₹)</Text>
                  <TextInput
                    style={styles.modalInput}
                    value={newProduct.originalPrice}
                    onChangeText={(t) => setNewProduct((p) => ({ ...p, originalPrice: t }))}
                    placeholder="750"
                    placeholderTextColor={Colors.textLight}
                    keyboardType="decimal-pad"
                  />
                </View>
              </View>

              <Text style={styles.editFieldLabel}>Category / Type</Text>
              <TextInput
                style={styles.modalInput}
                value={newProduct.category}
                onChangeText={(t) => setNewProduct((p) => ({ ...p, category: t }))}
                placeholder="e.g. Battery, Repair, Tiles"
                placeholderTextColor={Colors.textLight}
              />

              <Pressable
                style={[styles.addProductBtn, (!newProduct.name.trim() || !newProduct.price || addingProduct) && { opacity: 0.5 }]}
                onPress={handleAddProduct}
                disabled={!newProduct.name.trim() || !newProduct.price || addingProduct}
              >
                {addingProduct
                  ? <ActivityIndicator size="small" color="#FFF" />
                  : <>
                      <Ionicons name="add-circle" size={18} color="#FFF" />
                      <Text style={styles.addProductBtnText}>Add Product</Text>
                    </>}
              </Pressable>

              <View style={{ height: 20 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 20,
    color: "#FFF",
  },
  statsRow: {
    flexDirection: "row",
    gap: 8,
  },
  statCard: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: "center",
  },
  statValue: {
    fontFamily: "Poppins_700Bold",
    fontSize: 18,
    color: "#FFF",
  },
  statLabel: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    color: "rgba(255,255,255,0.65)",
    marginTop: 2,
  },
  tabContainer: {
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  tabScroll: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 6,
  },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: Colors.surfaceAlt,
    gap: 5,
  },
  tabActive: {
    backgroundColor: Colors.primary,
  },
  tabText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 13,
    color: Colors.textSecondary,
  },
  tabTextActive: {
    color: "#FFF",
  },
  tabBadge: {
    backgroundColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 1,
    minWidth: 20,
    alignItems: "center",
  },
  tabBadgeActive: {
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  tabBadgeText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 10,
    color: Colors.textSecondary,
  },
  tabBadgeTextActive: {
    color: "#FFF",
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 12,
    height: 44,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: Colors.text,
    height: 44,
  },
  clearBtn: {
    padding: 4,
  },
  scrollView: {
    flex: 1,
  },
  section: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  sectionTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 16,
    color: Colors.text,
  },
  vendorCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  vendorCardTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  vendorAvatar: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: Colors.primary + "15",
    alignItems: "center",
    justifyContent: "center",
  },
  vendorInfo: {
    flex: 1,
  },
  vendorNameRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  vendorName: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
    color: Colors.text,
    flex: 1,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  vendorDesc: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  vendorMeta: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
    gap: 6,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  metaText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 11,
    color: Colors.textSecondary,
  },
  metaDivider: {
    width: 1,
    height: 12,
    backgroundColor: Colors.border,
  },
  categoryBadge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  categoryBadgeText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 10,
  },
  moreText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: Colors.textLight,
    textAlign: "center",
    marginTop: 8,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 32,
    gap: 8,
  },
  emptyText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 14,
    color: Colors.textLight,
  },
  appCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  appCardTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  appAvatar: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: Colors.secondary + "15",
    alignItems: "center",
    justifyContent: "center",
  },
  appInfo: {
    flex: 1,
  },
  appName: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
    color: Colors.text,
  },
  appOwner: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  appMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
    gap: 6,
    flexWrap: "wrap",
  },
  statusBadge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  statusBadgeText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 10,
  },
  appSubmitted: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    color: Colors.textLight,
  },
  appActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  bulkApproveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.success,
    paddingVertical: 12,
    borderRadius: 14,
    marginTop: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  bulkApproveBtnText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
    color: "#FFF",
  },
  approveBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.success,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
  },
  rejectBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.error,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
  },
  liveBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.info,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
  },
  deleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.error,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  actionBtnText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
    color: "#FFF",
  },
  linkAgentBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-start",
    backgroundColor: Colors.primary + "12",
    borderWidth: 1,
    borderColor: Colors.primary + "30",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginTop: 8,
  },
  linkAgentText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 11,
    color: Colors.primary,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalBox: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 24,
    width: "100%",
    maxWidth: 380,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  },
  modalTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 17,
    color: Colors.text,
  },
  modalSubtitle: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 16,
  },
  modalInput: {
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: Colors.text,
    marginBottom: 20,
  },
  modalActions: {
    flexDirection: "row",
    gap: 12,
  },
  modalCancelBtn: {
    flex: 1,
    backgroundColor: Colors.border,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  modalCancelText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
    color: Colors.textSecondary,
  },
  modalConfirmBtn: {
    flex: 1,
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  modalConfirmText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
    color: "#FFF",
  },
  editSectionLabel: {
    fontFamily: "Poppins_700Bold",
    fontSize: 10,
    color: Colors.textLight,
    letterSpacing: 1,
    marginBottom: 10,
    marginTop: 4,
  },
  editFieldLabel: {
    fontFamily: "Poppins_500Medium",
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: 6,
  },
  catChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  catChipText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 12,
    color: Colors.textSecondary,
  },
  toggleRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 20,
  },
  toggleBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  toggleBtnActive: {
    backgroundColor: Colors.success,
    borderColor: Colors.success,
  },
  toggleBtnText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 13,
    color: Colors.textSecondary,
  },
  toggleBtnTextActive: {
    color: "#FFF",
  },
  productsModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  productsModalBox: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 30,
    maxHeight: "88%",
  },
  productsModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  productsModalTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 18,
    color: Colors.text,
  },
  productsModalSub: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  productsCloseBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  noProductsBox: {
    alignItems: "center",
    paddingVertical: 24,
    gap: 6,
  },
  noProductsText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
    color: Colors.textSecondary,
  },
  noProductsHint: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: Colors.textLight,
  },
  productRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
    gap: 10,
  },
  productRowInfo: {
    flex: 1,
  },
  productRowName: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 13,
    color: Colors.text,
  },
  productRowMeta: {
    fontFamily: "Poppins_500Medium",
    fontSize: 12,
    color: Colors.primary,
    marginTop: 2,
  },
  productRowDesc: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    color: Colors.textLight,
    marginTop: 2,
  },
  productDeleteBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: Colors.error + "12",
    alignItems: "center",
    justifyContent: "center",
  },
  addProductBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.success,
    borderRadius: 12,
    paddingVertical: 13,
    marginTop: 4,
  },
  addProductBtnText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 14,
    color: "#FFF",
  },
  productThumbWrap: {
    width: 44,
    height: 44,
    borderRadius: 8,
    overflow: "hidden",
  },
  productThumb: {
    width: 44,
    height: 44,
    borderRadius: 8,
  },
  productImagePickerBtn: {
    width: "100%",
    height: 120,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.primary + "40",
    borderStyle: "dashed" as const,
    overflow: "hidden",
    marginBottom: 4,
  },
  productImagePreview: {
    width: "100%",
    height: "100%",
  },
  productImagePickerPlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.primary + "06",
  },
  productImagePickerText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 13,
    color: Colors.primary,
  },
});

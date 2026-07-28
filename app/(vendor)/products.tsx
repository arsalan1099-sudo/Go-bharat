import React, { useState, useEffect, useRef } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, Platform, Modal, TextInput, Alert, ScrollView, ActivityIndicator, Switch } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Colors from "@/constants/colors";
import { products, FLIGHT_VENDOR_IDS, TRAIN_VENDOR_IDS } from "@/lib/data";
import { Product, SeatInfo, FlightSeatStatus } from "@/lib/types";
import { useApp } from "@/lib/store";
import { getApiUrl, apiRequest } from "@/lib/query-client";

interface ManpowerWorker {
  id: string;
  name: string;
  skill: string;
  experience: number;
  dailyRate: number;
  status: "Available" | "On Assignment" | "On Leave";
  rating: number;
}

const MANPOWER_WORKERS: ManpowerWorker[] = [
  { id: "w1", name: "Rajesh Kumar", skill: "Plumber", experience: 8, dailyRate: 650, status: "Available", rating: 4.5 },
  { id: "w2", name: "Sunil Yadav", skill: "Electrician", experience: 12, dailyRate: 800, status: "On Assignment", rating: 4.8 },
  { id: "w3", name: "Amit Singh", skill: "Driver", experience: 5, dailyRate: 550, status: "Available", rating: 4.2 },
  { id: "w4", name: "Deepak Sharma", skill: "Cook", experience: 10, dailyRate: 700, status: "On Leave", rating: 4.6 },
  { id: "w5", name: "Vikram Patel", skill: "Security Guard", experience: 6, dailyRate: 500, status: "Available", rating: 4.0 },
  { id: "w6", name: "Manoj Verma", skill: "Carpenter", experience: 15, dailyRate: 900, status: "On Assignment", rating: 4.9 },
  { id: "w7", name: "Ravi Gupta", skill: "Painter", experience: 7, dailyRate: 600, status: "Available", rating: 4.3 },
  { id: "w8", name: "Karan Joshi", skill: "Helper", experience: 2, dailyRate: 400, status: "Available", rating: 3.8 },
];

const WORKER_STATUS_COLORS: Record<string, string> = {
  "Available": Colors.success,
  "On Assignment": Colors.info,
  "On Leave": Colors.warning,
};

const SKILL_ICONS: Record<string, string> = {
  Plumber: "water",
  Electrician: "flash",
  Driver: "car",
  Cook: "restaurant",
  "Security Guard": "shield-checkmark",
  Carpenter: "hammer",
  Painter: "color-palette",
  Helper: "hand-left",
};

function generateId(): string {
  return Date.now().toString() + Math.random().toString(36).substr(2, 9);
}

export default function VendorProducts() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, vendorApplications, orders } = useApp();
  const vendorApp = vendorApplications.find(a => a.phone.replace(/\D/g, "").slice(-10) === user?.phone?.replace(/\D/g, "").slice(-10) && (a.status === "APPROVED" || a.status === "LIVE"));
  const vendorId = vendorApp?.id || user?.id || "v2";
  const vendorCategoryId = user?.vendorCategoryId || vendorApp?.categoryId;
  const isManpower = vendorCategoryId === "4";
  const isService = vendorCategoryId === "3";
  const isFlightVendor = FLIGHT_VENDOR_IDS.includes(vendorId);
  const isTrainVendor = TRAIN_VENDOR_IDS.includes(vendorId);
  const isTicketVendor = isFlightVendor || isTrainVendor;
  const [vendorProducts, setVendorProducts] = useState(products.filter((p) => p.vendorId === vendorId));
  const [manpowerWorkers, setManpowerWorkers] = useState<ManpowerWorker[]>(MANPOWER_WORKERS);
  const [activeTab, setActiveTab] = useState<"products" | "seats">("products");
  const [seatManagementProduct, setSeatManagementProduct] = useState<string | null>(null);
  const [blockedSeats, setBlockedSeats] = useState<Record<string, string[]>>({});
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const productsHydrated = useRef(false);

  useEffect(() => {
    productsHydrated.current = false;
    const hardcoded = products.filter((p) => p.vendorId === vendorId);
    const hardcodedIds = new Set(hardcoded.map((p) => p.id));
    setVendorProducts(hardcoded);
    let cancelled = false;
    const baseUrl = getApiUrl();
    const cacheKey = `gobharat_vendor_products_${vendorId}`;

    // Instant load: render locally cached products immediately while we revalidate.
    AsyncStorage.getItem(cacheKey).then((data) => {
      if (cancelled || !data) return;
      try {
        const saved: Product[] = JSON.parse(data);
        const customProducts = saved.filter((p) => !hardcodedIds.has(p.id));
        if (customProducts.length > 0) {
          setVendorProducts([...hardcoded, ...customProducts]);
        }
      } catch {}
    });

    // Revalidate from the server in the background.
    AsyncStorage.getItem("gobharat_auth_token").then((token) => {
      if (cancelled) return;
      return fetch(new URL("/api/vendor/my-products", baseUrl).toString(), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
    }).then((r) => r && r.ok ? r.json() : null)
      .then((data: { products: Product[]; vendorId?: string } | null) => {
        if (cancelled || !data) return;
        const serverProducts: Product[] = data.products || [];
        const dbProducts = serverProducts.filter((p: Product) => !hardcodedIds.has(p.id));
        setVendorProducts([...hardcoded, ...dbProducts]);
        productsHydrated.current = true;
        // Persist for instant load next time; clear the cache when the vendor has
        // no products so deleted items don't flash on the next open.
        if (dbProducts.length > 0) {
          AsyncStorage.setItem(cacheKey, JSON.stringify(dbProducts)).catch(() => {});
        } else {
          AsyncStorage.removeItem(cacheKey).catch(() => {});
        }
      })
      .catch(() => {
        // Network failed — keep the cached/hardcoded products already rendered above.
        productsHydrated.current = true;
      });
    return () => { cancelled = true; };
  }, [user?.phone, vendorId]);

  const vendorOrders = orders.filter((o) => o.vendorId === vendorId);
  const bookedSeatsByProduct: Record<string, { seat: string; seatClass: string; orderId: string; customer: string }[]> = {};
  vendorOrders.forEach((o) => {
    o.items.forEach((item) => {
      if (item.seatNumber) {
        if (!bookedSeatsByProduct[item.productId]) bookedSeatsByProduct[item.productId] = [];
        bookedSeatsByProduct[item.productId].push({
          seat: item.seatNumber,
          seatClass: item.seatClass || "",
          orderId: o.id,
          customer: o.customerName || "Customer",
        });
      }
    });
  });

  const toggleBlockSeat = (productId: string, seatLabel: string) => {
    try { Haptics.selectionAsync(); } catch {}
    setBlockedSeats((prev) => {
      const current = prev[productId] || [];
      if (current.includes(seatLabel)) {
        return { ...prev, [productId]: current.filter((s) => s !== seatLabel) };
      }
      return { ...prev, [productId]: [...current, seatLabel] };
    });
  };

  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null);
  const [productForm, setProductForm] = useState({ name: "", price: "", description: "", category: "", codEnabled: false });
  const [productImage, setProductImage] = useState<string | null>(null);
  const [productImageBase64, setProductImageBase64] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const toggleAvailability = (id: string) => {
    const current = vendorProducts.find((p) => p.id === id);
    if (!current) return;
    const newValue = !current.isAvailable;
    setVendorProducts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, isAvailable: newValue } : p))
    );
    try { Haptics.selectionAsync(); } catch {}
    // Persist to server so the change survives page reload
    apiRequest("PUT", `/api/vendor/products/${id}`, { isAvailable: newValue })
      .catch(() => {
        // Revert local state if server call fails
        setVendorProducts((prev) =>
          prev.map((p) => (p.id === id ? { ...p, isAvailable: !newValue } : p))
        );
        Alert.alert("Error", "Failed to update availability. Please try again.");
      });
  };

  const uriToDataUrl = async (uri: string): Promise<string | null> => {
    try {
      const response = await fetch(uri);
      const blob = await response.blob();
      return await new Promise<string | null>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string || null);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    } catch {
      return null;
    }
  };

  const pickImage = async () => {
    try {
      if (Platform.OS === "web") {
        const dataUrl = await new Promise<string | null>((resolve) => {
          const input = document.createElement("input");
          input.type = "file";
          input.accept = "image/*";
          input.onchange = async () => {
            const file = input.files?.[0];
            if (!file) return resolve(null);
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string || null);
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(file);
          };
          input.oncancel = () => resolve(null);
          input.click();
        });
        if (dataUrl) {
          setProductImage(dataUrl);
          setProductImageBase64(dataUrl);
        }
        return;
      }
      const permResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permResult.granted) {
        Alert.alert("Permission needed", "Gallery access is required to pick photos");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
        base64: true,
      });
      if (!result.canceled && result.assets[0]) {
        const uri = result.assets[0].uri;
        setProductImage(uri);
        const raw = result.assets[0].base64;
        const dataUrl = raw
          ? `data:image/jpeg;base64,${raw}`
          : await uriToDataUrl(uri);
        setProductImageBase64(dataUrl);
      }
    } catch (e) { console.warn("[pickImage] Failed:", e); }
  };

  const takePhoto = async () => {
    try {
      if (Platform.OS === "web") {
        const dataUrl = await new Promise<string | null>((resolve) => {
          const input = document.createElement("input");
          input.type = "file";
          input.accept = "image/*";
          input.capture = "environment";
          input.onchange = async () => {
            const file = input.files?.[0];
            if (!file) return resolve(null);
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string || null);
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(file);
          };
          input.oncancel = () => resolve(null);
          input.click();
        });
        if (dataUrl) {
          setProductImage(dataUrl);
          setProductImageBase64(dataUrl);
        }
        return;
      }
      const permResult = await ImagePicker.requestCameraPermissionsAsync();
      if (!permResult.granted) {
        Alert.alert("Permission needed", "Camera access is required to take photos");
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
        base64: true,
      });
      if (!result.canceled && result.assets[0]) {
        const uri = result.assets[0].uri;
        setProductImage(uri);
        const raw = result.assets[0].base64;
        const dataUrl = raw
          ? `data:image/jpeg;base64,${raw}`
          : await uriToDataUrl(uri);
        setProductImageBase64(dataUrl);
      }
    } catch (e) { console.warn("[takePhoto] Failed:", e); }
  };

  const analyzeWithAI = async () => {
    if (!productImageBase64) {
      Alert.alert("No Photo", `Please upload a ${isService ? "service" : "product"} photo first for AI analysis`);
      return;
    }

    setAiLoading(true);
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}

    try {
      const baseUrl = getApiUrl();
      const url = new URL("/api/ai/analyze-product-photo", baseUrl);
      const response = await fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: productImageBase64?.includes(",")
            ? productImageBase64.split(",")[1]
            : productImageBase64,
        }),
      });

      if (!response.ok) throw new Error("Failed to analyze");

      const data = await response.json();
      setProductForm({
        name: data.name || productForm.name,
        price: data.price ? String(data.price) : productForm.price,
        category: data.category || productForm.category,
        description: data.description || productForm.description,
        codEnabled: productForm.codEnabled,
      });

      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
    } catch (error) {
      Alert.alert("Error", "Could not analyze the photo. Please fill in details manually.");
    } finally {
      setAiLoading(false);
    }
  };

  const handleAddProduct = () => {
    if (!productForm.name.trim() || !productForm.price.trim()) {
      Alert.alert("Validation Error", `Please fill in ${isService ? "service name" : "name"} and price`);
      return;
    }
    const parsedPrice = parseFloat(productForm.price);
    if (isNaN(parsedPrice) || parsedPrice <= 0) {
      Alert.alert("Validation Error", "Please enter a valid price greater than 0");
      return;
    }

    const resolvedImage = productImageBase64
      ? productImageBase64
      : (productImage && !productImage.startsWith("blob:") && !productImage.startsWith("data:image") ? productImage : "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400");

    const newProduct: Product = {
      id: generateId(),
      vendorId,
      name: productForm.name,
      price: parseFloat(productForm.price),
      description: productForm.description,
      image: resolvedImage,
      isAvailable: true,
      category: productForm.category,
      codEnabled: productForm.codEnabled,
    };

    setVendorProducts((prev) => [...prev, newProduct]);
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
    setProductForm({ name: "", price: "", description: "", category: "", codEnabled: false });
    setProductImage(null);
    setProductImageBase64(null);
    setShowAddModal(false);
    apiRequest("POST", "/api/vendor/products", newProduct).catch((err: any) => {
      setVendorProducts((prev) => prev.filter((p) => p.id !== newProduct.id));
      Alert.alert("Save Failed", `Product could not be saved. Please log out, log back in, and try again.\n\n(${err?.message || "Network error"})`);
    });
  };

  const handleEditProduct = (product: Product) => {
    setEditingProduct(product);
    setProductForm({
      name: product.name,
      price: product.price.toString(),
      description: product.description,
      category: product.category,
      codEnabled: product.codEnabled ?? false,
    });
    setProductImage(product.image);
    setProductImageBase64(null);
    setShowEditModal(true);
  };

  const handleSaveEdit = () => {
    if (!productForm.name.trim() || !productForm.price.trim()) {
      Alert.alert("Validation Error", `Please fill in ${isService ? "service name" : "name"} and price`);
      return;
    }
    const parsedPrice = parseFloat(productForm.price);
    if (isNaN(parsedPrice) || parsedPrice <= 0) {
      Alert.alert("Validation Error", "Please enter a valid price greater than 0");
      return;
    }

    if (!editingProduct) return;

    // The loaded product image is now a proxy URL (/api/products/:id/image), so only
    // persist an image when the vendor actually chose a new one. Otherwise omit `image`
    // so the server keeps the real stored image — sending the proxy URL back would
    // overwrite it with a self-referential URL and break image delivery.
    const pickedImage = productImageBase64
      ? productImageBase64
      : (productImage && !productImage.startsWith("blob:") ? productImage : null);
    const isProxyImage = (u: string | null) => !!u && /\/api\/products\/[^/]+\/image/.test(u);

    const updatedFields: Record<string, any> = {
      name: productForm.name,
      price: parseFloat(productForm.price),
      description: productForm.description,
      category: productForm.category,
      codEnabled: productForm.codEnabled,
    };
    if (pickedImage && !isProxyImage(pickedImage)) {
      updatedFields.image = pickedImage;
    }

    setVendorProducts((prev) =>
      prev.map((p) =>
        p.id === editingProduct.id ? { ...p, ...updatedFields } : p
      )
    );

    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
    setProductForm({ name: "", price: "", description: "", category: "", codEnabled: false });
    setProductImage(null);
    setProductImageBase64(null);
    setEditingProduct(null);
    setShowEditModal(false);
    const hardcodedIds = new Set(products.filter((p) => p.vendorId === vendorId).map((p) => p.id));
    if (!hardcodedIds.has(editingProduct.id)) {
      const savedProduct = { ...editingProduct };
      apiRequest("PUT", `/api/vendor/products/${editingProduct.id}`, updatedFields).catch((err: any) => {
        setVendorProducts((prev) => prev.map((p) => p.id === savedProduct.id ? savedProduct : p));
        Alert.alert("Save Failed", `Changes could not be saved. Please log out, log back in, and try again.\n\n(${err?.message || "Network error"})`);
      });
    }
  };

  const handleDeleteProduct = (id: string, name: string) => {
    setDeleteConfirm({ id, name });
  };

  const confirmDelete = () => {
    if (!deleteConfirm) return;
    const { id } = deleteConfirm;
    setDeleteConfirm(null);
    setVendorProducts((prev) => prev.filter((p) => p.id !== id));
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
    const hardcodedIds = new Set(products.filter((p) => p.vendorId === vendorId).map((p) => p.id));
    if (!hardcodedIds.has(id)) {
      const deletedProduct = vendorProducts.find((p) => p.id === id);
      apiRequest("DELETE", `/api/vendor/products/${id}`).catch((err: any) => {
        if (deletedProduct) setVendorProducts((prev) => [...prev, deletedProduct]);
        Alert.alert("Delete Failed", `Product could not be deleted. Please log out, log back in, and try again.\n\n(${err?.message || "Network error"})`);
      });
    }
  };

  const resetModal = () => {
    setProductForm({ name: "", price: "", description: "", category: "", codEnabled: false });
    setProductImage(null);
    setProductImageBase64(null);
  };

  const renderProduct = ({ item }: { item: Product }) => (
    <View style={styles.productCard}>
      <Image source={{ uri: item.image }} style={styles.productImage} contentFit="cover" accessibilityLabel={item.name} />
      <View style={styles.productInfo}>
        <Text style={styles.productName} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.productPrice}>{isService ? "From " : ""}{"\u20B9"}{item.price}</Text>
        <Text style={styles.productCategory}>{item.category}</Text>
      </View>
      <View style={styles.productActions}>
        <Pressable
          style={[styles.markBtn, item.isAvailable ? styles.markBtnActive : styles.markBtnInactive]}
          onPress={() => toggleAvailability(item.id)}
        >
          <Ionicons
            name={item.isAvailable ? "checkmark-circle" : "close-circle-outline"}
            size={14}
            color={item.isAvailable ? Colors.success : Colors.textLight}
          />
          <Text style={[styles.markBtnText, { color: item.isAvailable ? Colors.success : Colors.textLight }]}>
            {item.isAvailable ? "Live" : "Off"}
          </Text>
        </Pressable>
        <View style={styles.actionBtns}>
          <Pressable style={styles.editBtn} onPress={() => handleEditProduct(item)}>
            <Ionicons name="create-outline" size={18} color={Colors.info} />
          </Pressable>
          <Pressable style={styles.deleteBtn} onPress={() => handleDeleteProduct(item.id, item.name)}>
            <Ionicons name="trash-outline" size={18} color={Colors.error} />
          </Pressable>
        </View>
      </View>
    </View>
  );

  const itemLabel = isService ? "Service" : "Product";

  const renderEmptyState = () => (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 40, paddingTop: 60 }}>
      <View style={{ width: 80, height: 80, borderRadius: 24, backgroundColor: (isService ? "#8B5CF6" : Colors.primary) + "12", alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
        <Ionicons name={isService ? "construct" : "bag-handle"} size={36} color={isService ? "#8B5CF6" : Colors.primary} />
      </View>
      <Text style={{ fontFamily: "Poppins_700Bold", fontSize: 18, color: Colors.secondary, textAlign: "center", marginBottom: 8 }}>
        {isService ? "No services added yet" : "No products added yet"}
      </Text>
      <Text style={{ fontFamily: "Poppins_400Regular", fontSize: 13, color: Colors.textSecondary, textAlign: "center", marginBottom: 24 }}>
        {isService ? "Add your first service to start receiving bookings from customers" : "Add your first product to start selling"}
      </Text>
      <Pressable
        style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: Colors.primary, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 14 }}
        onPress={() => { resetModal(); setShowAddModal(true); }}
      >
        <Ionicons name="add-circle" size={20} color="#FFF" />
        <Text style={{ fontFamily: "Poppins_600SemiBold", fontSize: 14, color: "#FFF" }}>Add {itemLabel}</Text>
      </Pressable>
    </View>
  );

  const renderProductFormModal = (visible: boolean, title: string, onClose: () => void, onSubmit: () => void, submitLabel: string) => (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.modalOverlay}>
        <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{title}</Text>
            <Pressable onPress={onClose}>
              <Ionicons name="close" size={24} color={Colors.text} />
            </Pressable>
          </View>

          <Text style={styles.inputLabel}>{itemLabel} Photo</Text>
          {productImage ? (
            <View style={styles.photoSection}>
              <View style={styles.photoPreviewWrap}>
                <Image source={{ uri: productImage }} style={styles.photoPreview} contentFit="cover" accessibilityLabel="Product photo" />
              </View>
              <View style={styles.photoButtonsCol}>
                <Pressable style={styles.changePhotoBtn} onPress={pickImage}>
                  <Ionicons name="images-outline" size={16} color={Colors.primary} />
                  <Text style={styles.changePhotoBtnText}>Change</Text>
                </Pressable>
                <Pressable style={styles.changePhotoBtn} onPress={takePhoto}>
                  <Ionicons name="camera-outline" size={16} color={Colors.primary} />
                  <Text style={styles.changePhotoBtnText}>Retake</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <View style={styles.photoPickerRow}>
              <Pressable style={styles.photoPickerBtn} onPress={pickImage}>
                <View style={styles.photoPickerInner}>
                  <Ionicons name="images" size={24} color={Colors.primary} />
                  <Text style={styles.photoPickerLabel}>Gallery</Text>
                </View>
              </Pressable>
              <Pressable style={styles.photoPickerBtn} onPress={takePhoto}>
                <View style={styles.photoPickerInner}>
                  <Ionicons name="camera" size={24} color={Colors.primary} />
                  <Text style={styles.photoPickerLabel}>Camera</Text>
                </View>
              </Pressable>
            </View>
          )}

          <Pressable
            style={[styles.aiAssistBtn, aiLoading && styles.aiAssistBtnLoading]}
            onPress={analyzeWithAI}
            disabled={aiLoading}
          >
            {aiLoading ? (
              <>
                <ActivityIndicator size="small" color="#FFF" />
                <Text style={styles.aiAssistBtnText}>Analyzing...</Text>
              </>
            ) : (
              <>
                <Ionicons name="sparkles" size={18} color="#FFF" />
                <Text style={styles.aiAssistBtnText}>AI Auto-Fill from Photo</Text>
              </>
            )}
          </Pressable>

          <Text style={styles.inputLabel}>{isService ? "Service Name" : "Product Name"}</Text>
          <TextInput
            style={styles.input}
            placeholder={isService ? "e.g., Shirt Stitching, AC Repair" : "Enter product name"}
            placeholderTextColor={Colors.textSecondary}
            value={productForm.name}
            onChangeText={(text) => setProductForm({ ...productForm, name: text })}
          />

          <Text style={styles.inputLabel}>{isService ? "Price / Starting From (\u20B9)" : "Price (\u20B9)"}</Text>
          <TextInput
            style={styles.input}
            placeholder={isService ? "e.g., 250" : "Enter price"}
            placeholderTextColor={Colors.textSecondary}
            value={productForm.price}
            onChangeText={(text) => setProductForm({ ...productForm, price: text })}
            keyboardType="decimal-pad"
          />

          <Text style={styles.inputLabel}>{isService ? "Service Type" : "Category"}</Text>
          <TextInput
            style={styles.input}
            placeholder={isService ? "e.g., Stitching, Repair, Alteration" : "Enter category"}
            placeholderTextColor={Colors.textSecondary}
            value={productForm.category}
            onChangeText={(text) => setProductForm({ ...productForm, category: text })}
          />

          <Text style={styles.inputLabel}>Description (Optional)</Text>
          <TextInput
            style={[styles.input, styles.descriptionInput]}
            placeholder={isService ? "Describe the service, duration, what's included" : "Enter description"}
            placeholderTextColor={Colors.textSecondary}
            value={productForm.description}
            onChangeText={(text) => setProductForm({ ...productForm, description: text })}
            multiline
            numberOfLines={4}
          />

          <View style={styles.codToggleRow}>
            <View style={styles.codToggleLeft}>
              <Ionicons name="cash-outline" size={18} color={Colors.primary} style={{ marginRight: 8 }} />
              <View>
                <Text style={styles.codToggleLabel}>Allow Cash on Delivery</Text>
                <Text style={styles.codToggleSubLabel}>Customers can pay on delivery</Text>
              </View>
            </View>
            <Switch
              value={productForm.codEnabled}
              onValueChange={(val) => setProductForm({ ...productForm, codEnabled: val })}
              trackColor={{ false: "#D1D5DB", true: Colors.primary + "60" }}
              thumbColor={productForm.codEnabled ? Colors.primary : "#9CA3AF"}
            />
          </View>

          <Pressable style={styles.submitBtn} onPress={onSubmit}>
            <Text style={styles.submitBtnText}>{submitLabel}</Text>
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );

  const getWorkerInitials = (name: string) => {
    const parts = name.split(" ");
    return parts.length >= 2 ? (parts[0][0] + parts[1][0]).toUpperCase() : name.substring(0, 2).toUpperCase();
  };

  const renderWorkerStars = (rating: number) => {
    const stars = [];
    for (let i = 1; i <= 5; i++) {
      stars.push(
        <Ionicons
          key={i}
          name={i <= Math.floor(rating) ? "star" : i - rating < 1 ? "star-half" : "star-outline"}
          size={14}
          color="#F59E0B"
        />
      );
    }
    return stars;
  };

  const renderWorkerCard = ({ item }: { item: ManpowerWorker }) => {
    const statusColor = WORKER_STATUS_COLORS[item.status] || Colors.textSecondary;
    const skillIcon = SKILL_ICONS[item.skill] || "person";
    return (
      <View style={styles.productCard}>
        <View style={[styles.workerAvatar, { backgroundColor: statusColor + "20" }]}>
          <Text style={[styles.workerAvatarText, { color: statusColor }]}>{getWorkerInitials(item.name)}</Text>
        </View>
        <View style={styles.productInfo}>
          <Text style={styles.productName} numberOfLines={1}>{item.name}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 }}>
            <Ionicons name={skillIcon as any} size={13} color={Colors.primary} />
            <Text style={styles.productCategory}>{item.skill} - {item.experience} yrs exp</Text>
          </View>
          <Text style={styles.productPrice}>{"\u20B9"}{item.dailyRate}/day</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 }}>
            {renderWorkerStars(item.rating)}
            <Text style={{ fontFamily: "Poppins_500Medium", fontSize: 11, color: Colors.textSecondary }}>{item.rating.toFixed(1)}</Text>
          </View>
        </View>
        <View style={styles.productActions}>
          <View style={[styles.workerStatusBadge, { backgroundColor: statusColor + "18" }]}>
            <Text style={[styles.workerStatusText, { color: statusColor }]}>{item.status}</Text>
          </View>
        </View>
      </View>
    );
  };

  if (isManpower) {
    return (
      <View style={styles.container}>
        <View style={[styles.header, { paddingTop: topInset + 8 }]}>
          <Text style={styles.headerTitle}>Worker Profiles</Text>
          <View style={styles.headerActions}>
            <Pressable
              style={styles.addBtn}
              onPress={() => router.push("/vendor-manpower" as any)}
            >
              <Ionicons name="add" size={22} color="#FFF" />
            </Pressable>
          </View>
        </View>
        <FlatList
          data={manpowerWorkers}
          renderItem={renderWorkerCard}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 20, paddingBottom: 100 }}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          showsVerticalScrollIndicator={false}
        />
      </View>
    );
  }

  const generateVendorFlightSeats = (productId: string) => {
    const cols = ["A", "B", "C", "D", "E", "F"];
    const rows = 15;
    const hash = productId.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
    const randomBooked: string[] = [];
    for (let i = 0; i < 12; i++) {
      const r = ((hash * (i + 1) * 7) % rows) + 1;
      const c = cols[(hash * (i + 3)) % 6];
      randomBooked.push(`${r}${c}`);
    }
    const booked = bookedSeatsByProduct[productId]?.map((b) => b.seat) || [];
    const blocked = blockedSeats[productId] || [];
    const allBooked = [...new Set([...randomBooked, ...booked])];
    const seats: { label: string; status: "available" | "booked" | "blocked"; class: string }[] = [];
    for (let r = 1; r <= rows; r++) {
      for (const c of cols) {
        const label = `${r}${c}`;
        const seatClass = r <= 3 ? "Business" : "Economy";
        seats.push({
          label,
          status: blocked.includes(label) ? "blocked" : allBooked.includes(label) ? "booked" : "available",
          class: seatClass,
        });
      }
    }
    return seats;
  };

  const generateVendorTrainSeats = (productId: string) => {
    const berthTypes = ["LB", "LB", "MB", "MB", "UB", "UB", "SL", "SU"];
    const hash = productId.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
    const randomBooked: string[] = [];
    for (let i = 0; i < 6; i++) {
      const coach = (hash * (i + 1)) % 3 + 1;
      const seat = (coach - 1) * 8 + ((hash * (i + 2)) % 8) + 1;
      randomBooked.push(`S${coach}-${seat}`);
    }
    const booked = bookedSeatsByProduct[productId]?.map((b) => b.seat) || [];
    const blocked = blockedSeats[productId] || [];
    const allBooked = [...new Set([...randomBooked, ...booked])];
    const seats: { label: string; status: "available" | "booked" | "blocked"; berthType: string }[] = [];
    for (let coach = 1; coach <= 3; coach++) {
      for (let b = 0; b < 8; b++) {
        const seatNum = (coach - 1) * 8 + b + 1;
        const label = `S${coach}-${seatNum}`;
        seats.push({
          label,
          status: blocked.includes(label) ? "blocked" : allBooked.includes(label) ? "booked" : "available",
          berthType: berthTypes[b],
        });
      }
    }
    return seats;
  };

  const renderSeatManagement = () => {
    const ticketProducts = vendorProducts;
    const selectedProduct = seatManagementProduct ? ticketProducts.find((p) => p.id === seatManagementProduct) : ticketProducts[0];
    if (!selectedProduct) return <Text style={{ padding: 20, fontFamily: "Poppins_400Regular", color: Colors.textSecondary }}>No routes/flights available</Text>;

    const seats = isFlightVendor ? generateVendorFlightSeats(selectedProduct.id) : generateVendorTrainSeats(selectedProduct.id);
    const totalSeats = seats.length;
    const availableCount = seats.filter((s) => s.status === "available").length;
    const bookedCount = seats.filter((s) => s.status === "booked").length;
    const blockedCount = seats.filter((s) => s.status === "blocked").length;
    const bookingsForProduct = bookedSeatsByProduct[selectedProduct.id] || [];

    return (
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
        <View style={seatStyles.routeSelector}>
          <Text style={seatStyles.routeLabel}>Select {isFlightVendor ? "Flight" : "Route"}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
            {ticketProducts.map((p) => (
              <Pressable
                key={p.id}
                style={[seatStyles.routeChip, (seatManagementProduct || ticketProducts[0]?.id) === p.id && seatStyles.routeChipActive]}
                onPress={() => setSeatManagementProduct(p.id)}
              >
                <Text style={[seatStyles.routeChipText, (seatManagementProduct || ticketProducts[0]?.id) === p.id && seatStyles.routeChipTextActive]} numberOfLines={1}>
                  {p.name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        <View style={seatStyles.statsRow}>
          <View style={[seatStyles.statCard, { borderLeftColor: Colors.success }]}>
            <Text style={seatStyles.statNum}>{availableCount}</Text>
            <Text style={seatStyles.statLabel}>Available</Text>
          </View>
          <View style={[seatStyles.statCard, { borderLeftColor: Colors.info }]}>
            <Text style={seatStyles.statNum}>{bookedCount}</Text>
            <Text style={seatStyles.statLabel}>Booked</Text>
          </View>
          <View style={[seatStyles.statCard, { borderLeftColor: Colors.error }]}>
            <Text style={seatStyles.statNum}>{blockedCount}</Text>
            <Text style={seatStyles.statLabel}>Blocked</Text>
          </View>
          <View style={[seatStyles.statCard, { borderLeftColor: Colors.textSecondary }]}>
            <Text style={seatStyles.statNum}>{totalSeats}</Text>
            <Text style={seatStyles.statLabel}>Total</Text>
          </View>
        </View>

        <View style={seatStyles.seatMapCard}>
          <View style={seatStyles.seatMapHeader}>
            <Ionicons name={isFlightVendor ? "airplane" : "train"} size={18} color={Colors.primary} />
            <Text style={seatStyles.seatMapTitle}>Seat Map - {selectedProduct.name}</Text>
          </View>
          <Text style={seatStyles.seatMapHint}>Tap a seat to block/unblock it</Text>

          <View style={seatStyles.legendRow}>
            <View style={seatStyles.legendItem}>
              <View style={[seatStyles.legendDot, { backgroundColor: "#E2E8F0" }]} />
              <Text style={seatStyles.legendText}>Available</Text>
            </View>
            <View style={seatStyles.legendItem}>
              <View style={[seatStyles.legendDot, { backgroundColor: "#3B82F6" }]} />
              <Text style={seatStyles.legendText}>Booked</Text>
            </View>
            <View style={seatStyles.legendItem}>
              <View style={[seatStyles.legendDot, { backgroundColor: "#EF4444" }]} />
              <Text style={seatStyles.legendText}>Blocked</Text>
            </View>
          </View>

          {isFlightVendor ? (
            <View style={{ alignItems: "center", paddingVertical: 8 }}>
              <View style={{ flexDirection: "row", gap: 4, marginBottom: 4 }}>
                {["A", "B", "C", "", "D", "E", "F"].map((c, i) =>
                  c === "" ? <View key={i} style={{ width: 16 }} /> :
                  <Text key={i} style={{ width: 28, textAlign: "center", fontFamily: "Poppins_600SemiBold", fontSize: 10, color: Colors.textSecondary }}>{c}</Text>
                )}
              </View>
              {Array.from({ length: 15 }, (_, r) => r + 1).map((row) => (
                <View key={row} style={{ flexDirection: "row", gap: 4, marginBottom: 3, alignItems: "center" }}>
                  <Text style={{ width: 14, textAlign: "center", fontFamily: "Poppins_500Medium", fontSize: 9, color: Colors.textLight }}>{row}</Text>
                  {["A", "B", "C", "", "D", "E", "F"].map((c, i) => {
                    if (c === "") return <View key={i} style={{ width: 16 }} />;
                    const seat = seats.find((s) => s.label === `${row}${c}`);
                    if (!seat) return <View key={i} style={{ width: 28, height: 24 }} />;
                    return (
                      <Pressable
                        key={i}
                        style={[
                          seatStyles.miniSeat,
                          seat.status === "booked" && { backgroundColor: "#3B82F6" },
                          seat.status === "blocked" && { backgroundColor: "#EF4444" },
                          row <= 3 && seat.status === "available" && { backgroundColor: "#DBEAFE" },
                        ]}
                        onPress={() => seat.status !== "booked" && toggleBlockSeat(selectedProduct.id, seat.label)}
                      >
                        <Text style={[
                          seatStyles.miniSeatText,
                          seat.status === "booked" && { color: "#FFF" },
                          seat.status === "blocked" && { color: "#FFF" },
                        ]}>
                          {seat.status === "booked" ? "B" : seat.status === "blocked" ? "X" : c}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ))}
            </View>
          ) : (
            <View style={{ paddingVertical: 8 }}>
              {[1, 2, 3].map((coach) => {
                const coachSeats = seats.filter((s) => s.label.startsWith(`S${coach}-`));
                return (
                  <View key={coach} style={seatStyles.coachSection}>
                    <Text style={seatStyles.coachTitle}>Coach S{coach}</Text>
                    {coachSeats.map((seat) => (
                      <Pressable
                        key={seat.id || seat.label}
                        style={[
                          seatStyles.trainSeatRow,
                          seat.status === "booked" && { backgroundColor: "#DBEAFE" },
                          seat.status === "blocked" && { backgroundColor: "#FEE2E2" },
                        ]}
                        onPress={() => seat.status !== "booked" && toggleBlockSeat(selectedProduct.id, seat.label)}
                      >
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                          <Text style={seatStyles.trainSeatNum}>{seat.label.split("-")[1]}</Text>
                          <View>
                            <Text style={seatStyles.trainBerthType}>{seat.berthType}</Text>
                            <Text style={seatStyles.trainSeatId}>{seat.label}</Text>
                          </View>
                        </View>
                        <View style={[
                          seatStyles.statusPill,
                          seat.status === "booked" ? { backgroundColor: "#3B82F6" } :
                          seat.status === "blocked" ? { backgroundColor: "#EF4444" } :
                          { backgroundColor: "#22C55E" },
                        ]}>
                          <Text style={seatStyles.statusPillText}>
                            {seat.status === "booked" ? "Booked" : seat.status === "blocked" ? "Blocked" : "Open"}
                          </Text>
                        </View>
                      </Pressable>
                    ))}
                  </View>
                );
              })}
            </View>
          )}
        </View>

        {bookingsForProduct.length > 0 && (
          <View style={seatStyles.bookingsCard}>
            <View style={seatStyles.seatMapHeader}>
              <Ionicons name="list" size={18} color={Colors.primary} />
              <Text style={seatStyles.seatMapTitle}>Recent Seat Bookings</Text>
            </View>
            {bookingsForProduct.map((b, i) => (
              <View key={i} style={seatStyles.bookingRow}>
                <View style={seatStyles.bookingLeft}>
                  <View style={seatStyles.bookingIcon}>
                    <Ionicons name="person" size={14} color={Colors.primary} />
                  </View>
                  <View>
                    <Text style={seatStyles.bookingCustomer}>{b.customer}</Text>
                    <Text style={seatStyles.bookingOrderId}>Order #{b.orderId}</Text>
                  </View>
                </View>
                <View style={seatStyles.bookingSeatBadge}>
                  <Text style={seatStyles.bookingSeatText}>{b.seat}</Text>
                  {b.seatClass ? <Text style={seatStyles.bookingClassText}>{b.seatClass}</Text> : null}
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    );
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: topInset + 8 }]}>
        <Text style={styles.headerTitle}>{isTicketVendor ? (isFlightVendor ? "Flights" : "Trains") : isService ? "My Services" : "Products"}</Text>
        <View style={styles.headerActions}>
          <Pressable
            style={styles.aiBtn}
            onPress={() => router.push("/ai-assistant")}
          >
            <Ionicons name="sparkles" size={18} color="#FFF" />
          </Pressable>
          <Pressable
            style={styles.addBtn}
            onPress={() => {
              resetModal();
              setShowAddModal(true);
            }}
          >
            <Ionicons name="add" size={22} color="#FFF" />
          </Pressable>
        </View>
      </View>

      {isTicketVendor && (
        <View style={seatStyles.tabBar}>
          <Pressable
            style={[seatStyles.tab, activeTab === "products" && seatStyles.tabActive]}
            onPress={() => setActiveTab("products")}
          >
            <Ionicons name={isFlightVendor ? "airplane-outline" : "train-outline"} size={16} color={activeTab === "products" ? Colors.primary : Colors.textSecondary} />
            <Text style={[seatStyles.tabText, activeTab === "products" && seatStyles.tabTextActive]}>
              {isFlightVendor ? "Flights" : "Routes"}
            </Text>
          </Pressable>
          <Pressable
            style={[seatStyles.tab, activeTab === "seats" && seatStyles.tabActive]}
            onPress={() => setActiveTab("seats")}
          >
            <Ionicons name="grid-outline" size={16} color={activeTab === "seats" ? Colors.primary : Colors.textSecondary} />
            <Text style={[seatStyles.tabText, activeTab === "seats" && seatStyles.tabTextActive]}>Seat Management</Text>
          </Pressable>
        </View>
      )}

      {activeTab === "seats" && isTicketVendor ? (
        renderSeatManagement()
      ) : vendorProducts.length === 0 ? (
        renderEmptyState()
      ) : (
        <FlatList
          data={vendorProducts}
          renderItem={renderProduct}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 20, paddingBottom: 100 }}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          showsVerticalScrollIndicator={false}
        />
      )}

      {renderProductFormModal(
        showAddModal,
        `Add New ${itemLabel}`,
        () => { resetModal(); setShowAddModal(false); },
        handleAddProduct,
        `Add ${itemLabel}`
      )}

      {renderProductFormModal(
        showEditModal,
        `Edit ${itemLabel}`,
        () => { resetModal(); setShowEditModal(false); },
        handleSaveEdit,
        "Save Changes"
      )}

      {/* Delete Confirmation Modal — replaces Alert.alert (doesn't work on Median WebView) */}
      <Modal visible={!!deleteConfirm} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingVertical: 28, paddingHorizontal: 24 }]}>
            <Ionicons name="trash" size={40} color={Colors.error} style={{ alignSelf: "center", marginBottom: 12 }} />
            <Text style={[styles.modalTitle, { textAlign: "center", marginBottom: 8 }]}>
              Delete {isService ? "Service" : "Product"}?
            </Text>
            <Text style={{ textAlign: "center", color: Colors.textSecondary, marginBottom: 24, fontFamily: "Poppins_400Regular" }}>
              "{deleteConfirm?.name}" will be permanently removed.
            </Text>
            <View style={{ flexDirection: "row", gap: 12 }}>
              <Pressable
                style={[styles.submitBtn, { flex: 1, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border }]}
                onPress={() => setDeleteConfirm(null)}
              >
                <Text style={[styles.submitBtnText, { color: Colors.text }]}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.submitBtn, { flex: 1, backgroundColor: Colors.error }]}
                onPress={confirmDelete}
              >
                <Text style={styles.submitBtnText}>Delete</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const seatStyles = StyleSheet.create({
  tabBar: {
    flexDirection: "row",
    backgroundColor: "#FFF",
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 8,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#F1F5F9",
  },
  tabActive: { backgroundColor: Colors.primary + "12" },
  tabText: { fontFamily: "Poppins_500Medium", fontSize: 13, color: Colors.textSecondary },
  tabTextActive: { color: Colors.primary, fontFamily: "Poppins_600SemiBold" },
  routeSelector: { marginBottom: 12 },
  routeLabel: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: Colors.secondary },
  routeChip: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 10, backgroundColor: "#F1F5F9",
    marginRight: 8,
  },
  routeChipActive: { backgroundColor: Colors.primary },
  routeChipText: { fontFamily: "Poppins_500Medium", fontSize: 12, color: Colors.textSecondary, maxWidth: 140 },
  routeChipTextActive: { color: "#FFF" },
  statsRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  statCard: {
    flex: 1,
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 12,
    borderLeftWidth: 3,
    alignItems: "center",
  },
  statNum: { fontFamily: "Poppins_700Bold", fontSize: 20, color: Colors.secondary },
  statLabel: { fontFamily: "Poppins_400Regular", fontSize: 10, color: Colors.textSecondary, marginTop: 2 },
  seatMapCard: { backgroundColor: "#FFF", borderRadius: 16, padding: 16, marginBottom: 12 },
  seatMapHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  seatMapTitle: { fontFamily: "Poppins_700Bold", fontSize: 15, color: Colors.secondary },
  seatMapHint: { fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textSecondary, marginBottom: 8 },
  legendRow: { flexDirection: "row", gap: 16, marginBottom: 8 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  legendDot: { width: 12, height: 12, borderRadius: 3 },
  legendText: { fontFamily: "Poppins_400Regular", fontSize: 10, color: Colors.textSecondary },
  miniSeat: {
    width: 28, height: 24, borderRadius: 4,
    backgroundColor: "#E2E8F0",
    alignItems: "center", justifyContent: "center",
  },
  miniSeatText: { fontFamily: "Poppins_600SemiBold", fontSize: 9, color: Colors.textSecondary },
  coachSection: { marginBottom: 12 },
  coachTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: Colors.primary, marginBottom: 6 },
  trainSeatRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 4,
  },
  trainSeatNum: { fontFamily: "Poppins_700Bold", fontSize: 16, color: Colors.secondary, width: 24 },
  trainBerthType: { fontFamily: "Poppins_600SemiBold", fontSize: 11, color: Colors.text },
  trainSeatId: { fontFamily: "Poppins_400Regular", fontSize: 9, color: Colors.textLight },
  statusPill: {
    paddingHorizontal: 10, paddingVertical: 3,
    borderRadius: 6,
  },
  statusPillText: { fontFamily: "Poppins_600SemiBold", fontSize: 10, color: "#FFF" },
  bookingsCard: { backgroundColor: "#FFF", borderRadius: 16, padding: 16, marginBottom: 12 },
  bookingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  bookingLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  bookingIcon: {
    width: 32, height: 32, borderRadius: 8,
    backgroundColor: Colors.primary + "12",
    alignItems: "center", justifyContent: "center",
  },
  bookingCustomer: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: Colors.text },
  bookingOrderId: { fontFamily: "Poppins_400Regular", fontSize: 10, color: Colors.textSecondary },
  bookingSeatBadge: {
    backgroundColor: Colors.primary + "12",
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4,
    alignItems: "center",
  },
  bookingSeatText: { fontFamily: "Poppins_700Bold", fontSize: 13, color: Colors.primary },
  bookingClassText: { fontFamily: "Poppins_400Regular", fontSize: 9, color: Colors.textSecondary },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    backgroundColor: "#FFF",
    paddingHorizontal: 24,
    paddingBottom: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  headerTitle: { fontFamily: "Poppins_700Bold", fontSize: 24, color: Colors.secondary },
  headerActions: { flexDirection: "row" as const, gap: 10, alignItems: "center" as const },
  aiBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: Colors.secondary, alignItems: "center" as const, justifyContent: "center" as const },
  addBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: Colors.primary, alignItems: "center" as const, justifyContent: "center" as const },
  productCard: {
    flexDirection: "row",
    backgroundColor: "#FFF",
    borderRadius: 16,
    padding: 12,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  productImage: { width: 64, height: 64, borderRadius: 12 },
  productInfo: { flex: 1, marginLeft: 12 },
  productName: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: Colors.text },
  productPrice: { fontFamily: "Poppins_700Bold", fontSize: 15, color: Colors.primary, marginTop: 2 },
  productCategory: { fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  productActions: { alignItems: "flex-end" as const, gap: 8 },
  actionBtns: { flexDirection: "row" as const, gap: 8 },
  editBtn: { width: 32, height: 32, borderRadius: 8, backgroundColor: Colors.info + "12", alignItems: "center" as const, justifyContent: "center" as const },
  deleteBtn: { width: 32, height: 32, borderRadius: 8, backgroundColor: Colors.error + "12", alignItems: "center" as const, justifyContent: "center" as const },
  markBtn: { flexDirection: "row" as const, alignItems: "center" as const, gap: 3, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, borderWidth: 1 },
  markBtnActive: { backgroundColor: Colors.success + "12", borderColor: Colors.success + "40" },
  markBtnInactive: { backgroundColor: Colors.border + "60", borderColor: Colors.border },
  markBtnText: { fontSize: 11, fontFamily: "Poppins_600SemiBold" as const },
  workerAvatar: { width: 52, height: 52, borderRadius: 14, alignItems: "center" as const, justifyContent: "center" as const },
  workerAvatarText: { fontFamily: "Poppins_700Bold", fontSize: 16 },
  workerStatusBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  workerStatusText: { fontFamily: "Poppins_600SemiBold", fontSize: 10 },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#FFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: "90%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  modalTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 18,
    color: Colors.text,
  },
  photoSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginBottom: 4,
  },
  photoPickerRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 4,
  },
  photoPickerBtn: {
    flex: 1,
    height: 90,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: Colors.primary + "40",
    borderStyle: "dashed",
    overflow: "hidden",
  },
  photoPickerInner: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.primary + "08",
    gap: 6,
  },
  photoPickerLabel: {
    fontFamily: "Poppins_500Medium",
    fontSize: 12,
    color: Colors.primary,
  },
  photoPreviewWrap: {
    width: 90,
    height: 90,
    borderRadius: 16,
    overflow: "hidden",
  },
  photoPreview: {
    width: 90,
    height: 90,
  },
  photoButtonsCol: {
    flex: 1,
    gap: 8,
  },
  changePhotoBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: Colors.primary + "30",
    backgroundColor: Colors.primary + "08",
  },
  changePhotoBtnText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 13,
    color: Colors.primary,
  },
  aiAssistBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.secondary,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
  },
  aiAssistBtnLoading: {
    opacity: 0.7,
  },
  aiAssistBtnText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 13,
    color: "#FFF",
  },
  inputLabel: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
    color: Colors.text,
    marginBottom: 8,
    marginTop: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: 12,
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: Colors.text,
    backgroundColor: "#FFF",
  },
  descriptionInput: {
    minHeight: 100,
    textAlignVertical: "top",
  },
  codToggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#F8F9FA",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  codToggleLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  codToggleLabel: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
    color: Colors.text,
  },
  codToggleSubLabel: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  submitBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
    marginTop: 24,
    marginBottom: 24,
  },
  submitBtnText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 16,
    color: "#FFF",
  },
});

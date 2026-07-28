import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Platform,
  ScrollView,
  Image,
  Alert,
  Dimensions,
  FlatList,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import Colors from "@/constants/colors";
import { useApp } from "@/lib/store";
import { products } from "@/lib/data";
import { TaggedProduct } from "@/lib/types";
import { moderateImage } from "@/lib/moderateImage";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const isWeb = Platform.OS === "web";

export default function UploadReelScreen() {
  const { user, addReel } = useApp();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const topInset = isWeb ? 67 : insets.top;
  const bottomInset = isWeb ? 34 : insets.bottom;

  const [caption, setCaption] = useState("");
  const [thumbnail, setThumbnail] = useState<string | null>(null);
  const [taggedProducts, setTaggedProducts] = useState<TaggedProduct[]>([]);
  const [showProductPicker, setShowProductPicker] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isChecking, setIsChecking] = useState(false);

  const isVendor = user?.role === "VENDOR";
  const vendorProducts = isVendor ? products.filter((p) => p.vendorId === user?.id) : [];
  const filteredProducts = (isVendor ? vendorProducts : products).filter(
    (p) => p.name.toLowerCase().includes(searchQuery.toLowerCase()) && !taggedProducts.find((t) => t.productId === p.id)
  );

  const pickImage = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [9, 16],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      const uri = result.assets[0].uri;
      setIsChecking(true);
      try {
        const base64 = await FileSystem.readAsStringAsync(uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        const modResult = await moderateImage(base64);
        if (!modResult.safe) {
          Alert.alert(
            "Content Restricted",
            modResult.reason || "This image contains inappropriate content and cannot be uploaded. Please choose a different image."
          );
          setIsChecking(false);
          return;
        }
      } catch {}
      setIsChecking(false);
      setThumbnail(uri);
    }
  }, []);

  const addProduct = useCallback((product: typeof products[0]) => {
    const vendor = isVendor ? { vendorId: user?.id || "", vendorName: user?.name || "" } : { vendorId: product.vendorId, vendorName: "" };
    setTaggedProducts((prev) => [
      ...prev,
      {
        productId: product.id,
        productName: product.name,
        productImage: product.image,
        price: product.price,
        originalPrice: product.originalPrice,
        ...vendor,
      },
    ]);
    setShowProductPicker(false);
    setSearchQuery("");
  }, [isVendor, user]);

  const removeProduct = useCallback((productId: string) => {
    setTaggedProducts((prev) => prev.filter((p) => p.productId !== productId));
  }, []);

  const handlePublish = useCallback(() => {
    if (!caption.trim()) {
      Alert.alert("Missing Caption", "Please add a caption for your reel");
      return;
    }

    addReel({
      userId: user?.id || "",
      userName: user?.name || "",
      userRole: isVendor ? "VENDOR" : "CUSTOMER",
      vendorId: isVendor ? user?.id : undefined,
      thumbnail: thumbnail || "https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=400",
      videoUrl: "",
      caption: caption.trim(),
      taggedProducts,
    });

    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(isVendor ? "/(vendor)/vendorReels" : "/(customer)/reels");
    }
  }, [caption, thumbnail, taggedProducts, user, isVendor, addReel, router]);

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => {
          if (router.canGoBack()) { router.back(); } else { router.replace(isVendor ? "/(vendor)/vendorReels" : "/(customer)/reels"); }
        }} style={styles.backBtn}>
          <Ionicons name="close" size={26} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Create Reel</Text>
        <TouchableOpacity
          style={[styles.publishBtn, (!caption.trim()) && styles.publishBtnDisabled]}
          onPress={handlePublish}
          disabled={!caption.trim()}
        >
          <Text style={styles.publishText}>Publish</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 100 + bottomInset }} showsVerticalScrollIndicator={false}>
        <TouchableOpacity style={styles.mediaSection} onPress={pickImage} activeOpacity={0.8} disabled={isChecking}>
          {isChecking ? (
            <View style={styles.mediaPlaceholder}>
              <ActivityIndicator size="large" color={Colors.primary} />
              <Text style={styles.mediaTitle}>Checking content safety...</Text>
              <Text style={styles.mediaSubtitle}>Please wait while we verify your image</Text>
            </View>
          ) : thumbnail ? (
            <Image source={{ uri: thumbnail }} style={styles.thumbnailPreview} accessibilityLabel="Reel thumbnail" />
          ) : (
            <View style={styles.mediaPlaceholder}>
              <View style={styles.mediaIconCircle}>
                <Ionicons name="videocam" size={32} color={Colors.primary} />
              </View>
              <Text style={styles.mediaTitle}>Add Photo/Video</Text>
              <Text style={styles.mediaSubtitle}>Tap to select from gallery</Text>
            </View>
          )}
          {thumbnail && !isChecking && (
            <TouchableOpacity style={styles.changeMediaBtn} onPress={pickImage}>
              <Ionicons name="camera" size={16} color="#FFF" />
              <Text style={styles.changeMediaText}>Change</Text>
            </TouchableOpacity>
          )}
        </TouchableOpacity>

        <View style={styles.captionSection}>
          <Text style={styles.sectionLabel}>Caption</Text>
          <TextInput
            style={styles.captionInput}
            placeholder="Write a caption for your reel..."
            placeholderTextColor={Colors.textLight}
            multiline
            maxLength={300}
            value={caption}
            onChangeText={setCaption}
          />
          <Text style={styles.charCount}>{caption.length}/300</Text>
        </View>

        {isVendor && (
          <View style={styles.productsSection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionLabel}>Tag Products</Text>
              <TouchableOpacity
                style={styles.addProductBtn}
                onPress={() => setShowProductPicker(!showProductPicker)}
              >
                <Ionicons name="add" size={18} color={Colors.primary} />
                <Text style={styles.addProductText}>Add</Text>
              </TouchableOpacity>
            </View>

            {taggedProducts.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.taggedScroll}>
                {taggedProducts.map((p) => (
                  <View key={p.productId} style={styles.taggedItem}>
                    <Image source={{ uri: p.productImage }} style={styles.taggedImage} accessibilityLabel={p.productName} />
                    <View style={styles.taggedInfo}>
                      <Text style={styles.taggedName} numberOfLines={1}>{p.productName}</Text>
                      <Text style={styles.taggedPrice}>₹{p.price}</Text>
                    </View>
                    <TouchableOpacity onPress={() => removeProduct(p.productId)} style={styles.removeTag}>
                      <Ionicons name="close-circle" size={20} color="#FF4458" />
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            )}

            {showProductPicker && (
              <View style={styles.pickerContainer}>
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search products..."
                  placeholderTextColor={Colors.textLight}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                />
                <FlatList
                  data={filteredProducts.slice(0, 10)}
                  keyExtractor={(item) => item.id}
                  style={styles.pickerList}
                  renderItem={({ item }) => (
                    <TouchableOpacity style={styles.pickerItem} onPress={() => addProduct(item)}>
                      <Image source={{ uri: item.image }} style={styles.pickerImage} accessibilityLabel={item.name} />
                      <View style={styles.pickerInfo}>
                        <Text style={styles.pickerName} numberOfLines={1}>{item.name}</Text>
                        <Text style={styles.pickerPrice}>₹{item.price}</Text>
                      </View>
                      <Ionicons name="add-circle" size={24} color={Colors.primary} />
                    </TouchableOpacity>
                  )}
                  ListEmptyComponent={
                    <Text style={styles.emptyText}>No products found</Text>
                  }
                />
              </View>
            )}

            {taggedProducts.length === 0 && !showProductPicker && (
              <Text style={styles.hintText}>Tag your products so customers can buy directly from your reel</Text>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFF",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 18,
    color: Colors.text,
  },
  publishBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
  },
  publishBtnDisabled: {
    opacity: 0.5,
  },
  publishText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
    color: "#FFF",
  },
  content: {
    flex: 1,
  },
  mediaSection: {
    margin: 16,
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: "#F8F9FA",
    borderWidth: 2,
    borderColor: Colors.border,
    borderStyle: "dashed",
    position: "relative",
  },
  mediaPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    gap: 8,
  },
  mediaIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(255,107,0,0.1)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  mediaTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 16,
    color: Colors.text,
  },
  mediaSubtitle: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: Colors.textLight,
  },
  thumbnailPreview: {
    width: "100%",
    aspectRatio: 9 / 16,
    maxHeight: 400,
  },
  changeMediaBtn: {
    position: "absolute",
    bottom: 12,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  changeMediaText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 12,
    color: "#FFF",
  },
  captionSection: {
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  sectionLabel: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
    color: Colors.text,
    marginBottom: 8,
  },
  captionInput: {
    backgroundColor: "#F8F9FA",
    borderRadius: 14,
    padding: 14,
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: Colors.text,
    minHeight: 100,
    textAlignVertical: "top",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  charCount: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    color: Colors.textLight,
    textAlign: "right",
    marginTop: 4,
  },
  productsSection: {
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  addProductBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  addProductText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
    color: Colors.primary,
  },
  taggedScroll: {
    gap: 10,
    paddingBottom: 8,
  },
  taggedItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8F9FA",
    borderRadius: 12,
    padding: 8,
    gap: 10,
    width: 220,
  },
  taggedImage: {
    width: 44,
    height: 44,
    borderRadius: 8,
  },
  taggedInfo: {
    flex: 1,
  },
  taggedName: {
    fontFamily: "Poppins_500Medium",
    fontSize: 12,
    color: Colors.text,
  },
  taggedPrice: {
    fontFamily: "Poppins_700Bold",
    fontSize: 13,
    color: Colors.primary,
  },
  removeTag: {
    padding: 2,
  },
  pickerContainer: {
    backgroundColor: "#F8F9FA",
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    marginTop: 8,
  },
  searchInput: {
    backgroundColor: "#FFF",
    borderRadius: 10,
    padding: 10,
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: Colors.text,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  pickerList: {
    maxHeight: 300,
  },
  pickerItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  pickerImage: {
    width: 40,
    height: 40,
    borderRadius: 8,
  },
  pickerInfo: {
    flex: 1,
  },
  pickerName: {
    fontFamily: "Poppins_500Medium",
    fontSize: 13,
    color: Colors.text,
  },
  pickerPrice: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
    color: Colors.primary,
  },
  emptyText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: Colors.textLight,
    textAlign: "center",
    paddingVertical: 16,
  },
  hintText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: Colors.textLight,
    lineHeight: 18,
    marginTop: 4,
  },
});

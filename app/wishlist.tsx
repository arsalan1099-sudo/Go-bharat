import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Platform, Alert, Image } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useApp } from "@/lib/store";

interface WishlistItem {
  id: string;
  name: string;
  price: number;
  originalPrice: number;
  image: string;
  vendorName: string;
  vendorId: string;
}

const initialWishlist: WishlistItem[] = [
  { id: "w1", name: "Organic Honey", price: 450, originalPrice: 550, image: "https://images.unsplash.com/photo-1587049352846-4a222e784d38?w=400", vendorName: "Malegaon Naturals", vendorId: "v1" },
  { id: "w2", name: "Cotton Kurta Set", price: 1299, originalPrice: 1799, image: "https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=400", vendorName: "Desi Threads", vendorId: "v2" },
  { id: "w3", name: "Wireless Earbuds", price: 899, originalPrice: 1499, image: "https://images.unsplash.com/photo-1590658268037-6bf12f032f55?w=400", vendorName: "TechMart Malegaon", vendorId: "v3" },
  { id: "w4", name: "Masala Box Set", price: 349, originalPrice: 499, image: "https://images.unsplash.com/photo-1596040033229-a9821ebd058d?w=400", vendorName: "Spice Junction", vendorId: "v4" },
];

export default function WishlistScreen() {
  const insets = useSafeAreaInsets();
  const { addToCart } = useApp();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;
  const [wishlist, setWishlist] = useState<WishlistItem[]>(initialWishlist);

  const handleAddToCart = (item: WishlistItem) => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
    addToCart({
      product: {
        id: item.id,
        vendorId: item.vendorId,
        name: item.name,
        description: "",
        price: item.price,
        originalPrice: item.originalPrice,
        image: item.image,
        isAvailable: true,
        category: "general",
      },
      quantity: 1,
      vendorId: item.vendorId,
      vendorName: item.vendorName,
    });
    Alert.alert("Added to Cart", `${item.name} has been added to your cart.`);
  };

  const handleRemove = (id: string) => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
    setWishlist((prev) => prev.filter((w) => w.id !== id));
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={["#0B1E3D", "#142F5E"]} style={[styles.header, { paddingTop: topInset + 12 }]}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#FFF" />
          </Pressable>
          <Text style={styles.headerTitle}>Wishlist</Text>
          <View style={{ width: 40 }} />
        </View>
      </LinearGradient>

      <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: bottomInset + 20 }} showsVerticalScrollIndicator={false}>
        {wishlist.map((item) => (
          <View key={item.id} style={styles.productCard}>
            <Image source={{ uri: item.image }} style={styles.productImage} accessibilityLabel={item.name} />
            <View style={styles.productInfo}>
              <Text style={styles.productName} numberOfLines={1}>{item.name}</Text>
              <Text style={styles.vendorName}>{item.vendorName}</Text>
              <View style={styles.priceRow}>
                <Text style={styles.price}>{"\u20B9"}{item.price}</Text>
                <Text style={styles.originalPrice}>{"\u20B9"}{item.originalPrice}</Text>
              </View>
              <View style={styles.actionRow}>
                <Pressable style={styles.addCartBtn} onPress={() => handleAddToCart(item)}>
                  <Ionicons name="cart" size={16} color="#FFF" />
                  <Text style={styles.addCartText}>Add to Cart</Text>
                </Pressable>
                <Pressable style={styles.removeBtn} onPress={() => handleRemove(item.id)}>
                  <Ionicons name="trash-outline" size={18} color={Colors.error} />
                </Pressable>
              </View>
            </View>
          </View>
        ))}
        {wishlist.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="heart-outline" size={48} color={Colors.textLight} />
            <Text style={styles.emptyText}>Your wishlist is empty</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { paddingBottom: 20, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center" },
  headerTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 18, color: "#FFF" },
  content: { flex: 1, paddingHorizontal: 20, paddingTop: 20 },
  productCard: {
    flexDirection: "row",
    backgroundColor: "#FFF",
    borderRadius: 16,
    marginBottom: 14,
    overflow: "hidden",
  },
  productImage: { width: 110, height: 140 },
  productInfo: { flex: 1, padding: 14, justifyContent: "space-between" },
  productName: { fontFamily: "Poppins_600SemiBold", fontSize: 15, color: Colors.text },
  vendorName: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  priceRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  price: { fontFamily: "Poppins_700Bold", fontSize: 18, color: Colors.primary },
  originalPrice: { fontFamily: "Poppins_400Regular", fontSize: 13, color: Colors.textLight, textDecorationLine: "line-through" },
  actionRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 8 },
  addCartBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingVertical: 8,
  },
  addCartText: { fontFamily: "Poppins_500Medium", fontSize: 13, color: "#FFF" },
  removeBtn: { width: 38, height: 38, borderRadius: 10, borderWidth: 1, borderColor: Colors.error + "30", alignItems: "center", justifyContent: "center" },
  emptyState: { alignItems: "center", paddingTop: 60 },
  emptyText: { fontFamily: "Poppins_500Medium", fontSize: 14, color: Colors.textLight, marginTop: 12 },
});

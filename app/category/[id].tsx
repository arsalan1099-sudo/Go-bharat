import React from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Platform } from "react-native";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Colors from "@/constants/colors";
import { categories as staticCategories, subCategories as staticSubCategories } from "@/lib/data";
import { useApp } from "@/lib/store";
import { getApiUrl } from "@/lib/query-client";

export default function CategoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { liveVendors, customSubCategories, liveCategories, liveSubCategories } = useApp();
  const allVendors = liveVendors;
  const baseCategories = liveCategories.length > 0 ? liveCategories : staticCategories;
  const baseSubs = liveSubCategories.length > 0 ? liveSubCategories : staticSubCategories;
  const allSubCategories = [...baseSubs, ...customSubCategories.filter((sc) => !baseSubs.some((b) => b.id === sc.id))];
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  const category = baseCategories.find((c) => c.id === id);
  const catSubCategories = allSubCategories.filter((sc) => sc.categoryId === id);

  if (!category) {
    return (
      <View style={styles.container}>
        <View style={[styles.notFoundWrap, { paddingTop: topInset }]}>
          <Pressable onPress={() => router.back()} style={styles.notFoundBack}>
            <Ionicons name="arrow-back" size={22} color={Colors.text} />
          </Pressable>
          <View style={styles.notFoundContent}>
            <Ionicons name="grid-outline" size={64} color={Colors.textLight} />
            <Text style={styles.notFoundTitle}>Category Not Found</Text>
            <Text style={styles.notFoundDesc}>This category may have been removed or is no longer available.</Text>
            <Pressable style={styles.notFoundBtn} onPress={() => router.back()}>
              <Ionicons name="arrow-back" size={16} color="#FFF" />
              <Text style={styles.notFoundBtnText}>Go Back</Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  const vendorCount = allVendors.filter((v) => v.categoryId === id).length;

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[category.color + "DD", category.color + "99"]}
        style={[styles.header, { paddingTop: topInset + 8 }]}
      >
        <View style={styles.headerRow}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={22} color="#FFF" />
          </Pressable>
          <View style={styles.headerInfo}>
            <Text style={styles.headerTitle}>{category.name}</Text>
            <Text style={styles.headerSub}>{vendorCount} stores | {catSubCategories.length} sub-categories</Text>
          </View>
        </View>
      </LinearGradient>

      <ScrollView
        style={styles.content}
        contentContainerStyle={{ paddingBottom: bottomInset + 40 }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionTitle}>Browse by Sub-Category</Text>
        <View style={styles.grid}>
          {catSubCategories.map((sc) => {
            const scVendorCount = allVendors.filter((v) => v.subCategoryId === sc.id).length;
            return (
              <Pressable
                key={sc.id}
                style={styles.subCatCard}
                onPress={() => router.push(`/subcategory/${sc.id}` as any)}
              >
                <Image source={{ uri: sc.image }} style={styles.subCatImage} contentFit="cover" accessibilityLabel={sc.name} />
                <View style={styles.subCatOverlay} />
                <View style={styles.subCatContent}>
                  <View style={[styles.subCatIcon, { backgroundColor: category.color + "30" }]}>
                    <Ionicons name={sc.icon as any} size={22} color="#FFF" />
                  </View>
                  <Text style={styles.subCatName}>{sc.name}</Text>
                  <Text style={styles.subCatCount}>{scVendorCount} {scVendorCount === 1 ? "store" : "stores"}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.sectionTitle}>All {category.name} Stores</Text>
        {allVendors
          .filter((v) => v.categoryId === id)
          .map((vendor) => {
            const vendorImageUrl = vendor.hasImage
              ? new URL(`/api/vendors/${vendor.id}/image`, getApiUrl()).toString()
              : "https://images.unsplash.com/photo-1604719312566-8912e9227c6a?w=400";
            return (
            <Pressable
              key={vendor.id}
              style={styles.vendorCard}
              onPress={() => router.push(`/store/${vendor.id}` as any)}
            >
              <Image
                source={[{ uri: vendorImageUrl }]}
                style={styles.vendorImage}
                contentFit="cover"
                accessibilityLabel={vendor.name}
              />
              <View style={styles.vendorInfo}>
                <View style={styles.vendorHeader}>
                  <Text style={styles.vendorName} numberOfLines={1}>{vendor.name}</Text>
                  <View style={styles.ratingBadge}>
                    <Ionicons name="star" size={12} color="#FFF" />
                    <Text style={styles.ratingText}>{vendor.rating}</Text>
                  </View>
                </View>
                <Text style={styles.vendorDesc} numberOfLines={1}>{vendor.description}</Text>
                <View style={styles.vendorMeta}>
                  <View style={styles.metaItem}>
                    <Ionicons name="time-outline" size={13} color={Colors.textSecondary} />
                    <Text style={styles.metaText}>{vendor.deliveryTime}</Text>
                  </View>
                  <View style={styles.metaDot} />
                  <View style={styles.metaItem}>
                    <Ionicons name="location-outline" size={13} color={Colors.textSecondary} />
                    <Text style={styles.metaText}>{vendor.distance}</Text>
                  </View>
                </View>
              </View>
            </Pressable>
          );
          })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { paddingHorizontal: 20, paddingBottom: 20 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  headerInfo: { flex: 1 },
  headerTitle: { fontFamily: "Poppins_700Bold", fontSize: 24, color: "#FFF" },
  headerSub: { fontFamily: "Poppins_400Regular", fontSize: 13, color: "rgba(255,255,255,0.8)", marginTop: 2 },
  content: { flex: 1 },
  sectionTitle: { fontFamily: "Poppins_700Bold", fontSize: 18, color: Colors.secondary, paddingHorizontal: 20, marginTop: 20, marginBottom: 14 },
  grid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 16, gap: 12 },
  subCatCard: {
    width: "47%",
    height: 140,
    borderRadius: 18,
    overflow: "hidden",
    position: "relative",
  },
  subCatImage: { width: "100%", height: "100%" },
  subCatOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.45)" },
  subCatContent: { position: "absolute", bottom: 0, left: 0, right: 0, padding: 14 },
  subCatIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center", marginBottom: 6 },
  subCatName: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: "#FFF" },
  subCatCount: { fontFamily: "Poppins_400Regular", fontSize: 11, color: "rgba(255,255,255,0.7)" },
  vendorCard: {
    flexDirection: "row",
    backgroundColor: "#FFF",
    marginHorizontal: 20,
    marginBottom: 12,
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  vendorImage: { width: 100, height: 100 },
  vendorInfo: { flex: 1, padding: 12, justifyContent: "center" },
  vendorHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  vendorName: { fontFamily: "Poppins_600SemiBold", fontSize: 15, color: Colors.text, flex: 1 },
  ratingBadge: { flexDirection: "row", alignItems: "center", backgroundColor: Colors.success, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, gap: 3 },
  ratingText: { fontFamily: "Poppins_600SemiBold", fontSize: 11, color: "#FFF" },
  vendorDesc: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  vendorMeta: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 3 },
  metaText: { fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textSecondary },
  metaDot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: Colors.textLight },
  notFoundWrap: { flex: 1 },
  notFoundBack: { width: 40, height: 40, borderRadius: 12, backgroundColor: "#F0F0F0", alignItems: "center" as const, justifyContent: "center" as const, marginLeft: 16, marginTop: 12 },
  notFoundContent: { flex: 1, alignItems: "center" as const, justifyContent: "center" as const, paddingHorizontal: 40 },
  notFoundTitle: { fontFamily: "Poppins_700Bold", fontSize: 20, color: Colors.text, marginTop: 16, textAlign: "center" as const },
  notFoundDesc: { fontFamily: "Poppins_400Regular", fontSize: 14, color: Colors.textSecondary, textAlign: "center" as const, marginTop: 8, lineHeight: 20 },
  notFoundBtn: { flexDirection: "row" as const, alignItems: "center" as const, gap: 8, backgroundColor: Colors.primary, paddingVertical: 12, paddingHorizontal: 24, borderRadius: 12, marginTop: 24 },
  notFoundBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: "#FFF" },
});

import React, { useState, useEffect, memo, useCallback, useMemo } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, Platform, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Colors from "@/constants/colors";
import { categories as staticCategories, subCategories as staticSubCategories, vendors, products } from "@/lib/data";
import { useApp } from "@/lib/store";
import { getApiUrl } from "@/lib/query-client";
import { Vendor } from "@/lib/types";

function mapApiVendor(v: any): Vendor {
  return {
    id: v.id,
    name: v.name,
    description: v.description || "",
    image: v.image || "",
    hasImage: v.hasImage ?? false,
    rating: parseFloat(v.rating) || 4.0,
    reviewCount: parseInt(v.reviewCount) || 0,
    deliveryTime: v.deliveryTime || "20-30 min",
    distance: v.distance || "0.5 km",
    isOpen: v.isOpen ?? true,
    categoryId: v.categoryId || v.category_id || "",
    subCategoryId: v.subCategoryId || v.sub_category_id || "",
    commissionRate: parseFloat(v.commissionRate) || 10,
    lat: parseFloat(v.lat) || 0,
    lng: parseFloat(v.lng) || 0,
    address: v.address || "",
    pinCode: v.pinCode || v.pin_code || "",
    franchiseId: v.franchiseId || v.franchise_id || "",
    codEnabled: v.codEnabled ?? v.cod_enabled ?? false,
  };
}

// ── Module-level type ───────────────────────────────────────────────────────
type ListItemType =
  | { type: "vendor"; vendor: Vendor; rank?: number }
  | { type: "header"; title: string; icon: string; iconColor: string };

const RANK_COLORS = ["#FFD700", "#C0C0C0", "#CD7F32", Colors.primary, Colors.primary];

// Memoised vendor card — only re-renders when the vendor object itself changes
const VendorCard = memo(function VendorCard({
  vendor,
  rank,
  subCategoryImage,
}: {
  vendor: Vendor;
  rank?: number;
  subCategoryImage?: string;
}) {
  const vendorProducts = products.filter((p) => p.vendorId === vendor.id);
  const topVendorProducts = vendorProducts.slice(0, 3);
  const fallbackImage =
    subCategoryImage || "https://images.unsplash.com/photo-1604719312566-8912e9227c6a?w=400";
  const vendorImageUrl = vendor.hasImage
    ? new URL(`/api/vendors/${vendor.id}/image`, getApiUrl()).toString()
    : null;
  const imageSources = vendorImageUrl
    ? [{ uri: vendorImageUrl }, { uri: fallbackImage }]
    : [{ uri: fallbackImage }];
  return (
    <Pressable
      style={styles.vendorCard}
      onPress={() => router.push(`/store/${vendor.id}` as any)}
    >
      <Image
        source={imageSources}
        style={styles.vendorBanner}
        contentFit="cover"
        transition={200}
        accessibilityLabel={vendor.name}
      />
      <View style={styles.vendorOverlay} />
      <View style={styles.vendorBadgeRow}>
        <View style={styles.ratingBadge}>
          <Ionicons name="star" size={12} color="#FFF" />
          <Text style={styles.ratingText}>{vendor.rating}</Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          {rank !== undefined && (
            <View style={[styles.rankBadge, { backgroundColor: RANK_COLORS[rank] || Colors.primary }]}>
              <Ionicons name="trophy" size={10} color="#FFF" />
              <Text style={styles.rankText}>#{rank + 1}</Text>
            </View>
          )}
          {vendor.isOpen && (
            <View style={styles.openBadge}>
              <View style={styles.openDot} />
              <Text style={styles.openText}>Open</Text>
            </View>
          )}
        </View>
      </View>
      <View style={styles.vendorBody}>
        <View style={styles.vendorMainRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.vendorName}>{vendor.name}</Text>
            <Text style={styles.vendorDesc} numberOfLines={1}>{vendor.description}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={Colors.textLight} />
        </View>
        <View style={styles.vendorMeta}>
          <View style={styles.metaItem}>
            <Ionicons name="time-outline" size={14} color={Colors.textSecondary} />
            <Text style={styles.metaText}>{vendor.deliveryTime}</Text>
          </View>
          <View style={styles.metaDot} />
          <View style={styles.metaItem}>
            <Ionicons name="location-outline" size={14} color={Colors.textSecondary} />
            <Text style={styles.metaText}>{vendor.distance}</Text>
          </View>
          <View style={styles.metaDot} />
          <View style={styles.metaItem}>
            <Ionicons name="chatbubble-outline" size={14} color={Colors.textSecondary} />
            <Text style={styles.metaText}>{vendor.reviewCount} reviews</Text>
          </View>
        </View>
        {topVendorProducts.length > 0 && (
          <View style={styles.productsPreview}>
            <Text style={styles.productsLabel}>Popular items</Text>
            <View style={styles.productsRow}>
              {topVendorProducts.map((p) => (
                <View key={p.id} style={styles.miniProduct}>
                  <Image
                    source={{ uri: p.image }}
                    style={styles.miniProductImg}
                    contentFit="cover"
                    transition={200}
                    accessibilityLabel={p.name}
                  />
                  <Text style={styles.miniProductName} numberOfLines={1}>{p.name}</Text>
                  <Text style={styles.miniProductPrice}>{"\u20B9"}{p.price}</Text>
                </View>
              ))}
            </View>
          </View>
        )}
      </View>
    </Pressable>
  );
});

export default function SubCategoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { liveVendors, customSubCategories, liveCategories, liveSubCategories } = useApp();
  const allStaticVendors = liveVendors;
  const baseCategories = liveCategories.length > 0 ? liveCategories : staticCategories;
  const baseSubs = liveSubCategories.length > 0 ? liveSubCategories : staticSubCategories;
  const allSubCategories = [...baseSubs, ...customSubCategories.filter((sc) => !baseSubs.some((b) => b.id === sc.id))];
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  const [freshVendors, setFreshVendors] = useState<Vendor[]>([]);
  const [freshSubCategories, setFreshSubCategories] = useState<typeof customSubCategories>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const base = getApiUrl();

    // Fetch vendor data — cached 2min by server, stale-while-revalidate 5min
    const vendorUrl = new URL("/api/vendors", base);
    const fetchVendors = fetch(vendorUrl.toString())
      .then((r) => r.json())
      .then((data) => {
        const mapped = (data.vendors || []).map(mapApiVendor);
        setFreshVendors(mapped);
      })
      .catch(() => {});

    // Fetch fresh subcategory data
    const fetchSubs = fetch(new URL("/api/subcategories/custom", base).toString())
      .then((r) => r.json())
      .then((data) => {
        const mapped = (data.customSubCategories || []).map((sc: any) => ({
          id: sc.id,
          categoryId: sc.categoryId || sc.category_id || "",
          name: sc.name,
          icon: sc.icon || "grid-outline",
          image: sc.image || "",
        }));
        setFreshSubCategories(mapped);
      })
      .catch(() => {});

    Promise.all([fetchVendors, fetchSubs]).finally(() => setLoading(false));
  }, [id]);

  // Use fresh data from API when available, fallback to context
  const allFreshSubCategories = freshSubCategories.length > 0
    ? [...baseSubs, ...freshSubCategories]
    : allSubCategories;

  const allFreshVendors = freshVendors.length > 0 ? freshVendors : allStaticVendors;

  // Find subcategory — try current ID first, then search by name in fresh data
  let subCategory = allFreshSubCategories.find((sc) => sc.id === id);

  // If stale ID from cache, try to find the same subcategory by name from fresh data
  if (!subCategory) {
    const staleSubCat = allSubCategories.find((sc) => sc.id === id);
    if (staleSubCat) {
      subCategory = allFreshSubCategories.find((sc) => sc.name === staleSubCat.name) || staleSubCat;
    }
  }

  if (!subCategory && !loading) {
    return (
      <View style={styles.container}>
        <View style={[styles.notFoundWrap, { paddingTop: topInset }]}>
          <Pressable onPress={() => router.back()} style={styles.notFoundBack}>
            <Ionicons name="arrow-back" size={22} color={Colors.text} />
          </Pressable>
          <View style={styles.notFoundContent}>
            <Ionicons name="layers-outline" size={64} color={Colors.textLight} />
            <Text style={styles.notFoundTitle}>Sub-Category Not Found</Text>
            <Text style={styles.notFoundDesc}>This sub-category may have been removed or is no longer available.</Text>
            <Pressable style={styles.notFoundBtn} onPress={() => router.back()}>
              <Ionicons name="arrow-back" size={16} color="#FFF" />
              <Text style={styles.notFoundBtnText}>Go Back</Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  const category = baseCategories.find((c) => c.id === subCategory?.categoryId);

  // Find all possible IDs for this subcategory (handles stale ID migration)
  const subCatName = subCategory?.name || "";
  const matchingSubCatIds = new Set(
    allFreshSubCategories
      .filter((sc) => sc.name === subCatName || sc.id === id || sc.id === subCategory?.id)
      .map((sc) => sc.id)
  );

  const scVendors = allFreshVendors.filter((v) => matchingSubCatIds.has(v.subCategoryId || ""));

  const sortedVendors = [...scVendors].sort((a, b) => {
    if (b.rating !== a.rating) return b.rating - a.rating;
    return b.reviewCount - a.reviewCount;
  });

  const top5 = sortedVendors.slice(0, 5);
  const restVendors = sortedVendors.slice(5);
  const showTopSection = scVendors.length > 5;

  const listData = useMemo<ListItemType[]>(() => {
    if (scVendors.length === 0) return [];
    const items: ListItemType[] = [];
    if (showTopSection) {
      items.push({ type: "header", title: "Top 5 Stores", icon: "trophy", iconColor: Colors.primary });
    }
    top5.forEach((v, i) => items.push({ type: "vendor", vendor: v, rank: showTopSection ? i : undefined }));
    if (restVendors.length > 0) {
      items.push({ type: "header", title: "All Stores", icon: "storefront-outline", iconColor: Colors.textSecondary });
      restVendors.forEach((v) => items.push({ type: "vendor", vendor: v }));
    }
    return items;
  }, [scVendors.length, showTopSection, top5, restVendors]);

  const renderListItem = useCallback(({ item }: { item: ListItemType }) => {
    if (item.type === "header") {
      return (
        <View style={styles.sectionHeader}>
          <Ionicons name={item.icon as any} size={18} color={item.iconColor} />
          <Text style={[styles.sectionTitle, { color: item.iconColor }]}>{item.title}</Text>
        </View>
      );
    }
    return <VendorCard vendor={item.vendor} rank={item.rank} subCategoryImage={subCategory?.image} />;
  }, [subCategory?.image]);

  const listEmptyComponent = loading ? (
    <View style={styles.emptyCard}>
      <ActivityIndicator size="large" color={Colors.primary} />
      <Text style={[styles.emptyText, { marginTop: 16 }]}>Loading stores...</Text>
    </View>
  ) : (
    <View style={styles.emptyCard}>
      <Ionicons name="storefront-outline" size={48} color={Colors.textLight} />
      <Text style={styles.emptyTitle}>No stores yet</Text>
      <Text style={styles.emptyText}>New stores will appear here soon</Text>
    </View>
  );

  if (!subCategory) {
    return (
      <View style={styles.container}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingTop: topInset }}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.heroContainer}>
        <Image source={{ uri: subCategory.image }} style={styles.heroImage} contentFit="cover" transition={300} accessibilityLabel={subCategory.name} />
        <View style={styles.heroOverlay} />
        <Pressable style={[styles.backBtn, { top: topInset + 4 }]} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color="#FFF" />
        </Pressable>
        <View style={styles.heroContent}>
          {category && (
            <Pressable style={styles.breadcrumb} onPress={() => router.back()}>
              <Ionicons name={category.icon as any} size={14} color="rgba(255,255,255,0.8)" />
              <Text style={styles.breadcrumbText}>{category.name}</Text>
              <Ionicons name="chevron-forward" size={12} color="rgba(255,255,255,0.6)" />
            </Pressable>
          )}
          <Text style={styles.heroTitle}>{subCategory.name}</Text>
          <Text style={styles.heroSub}>
            {loading ? "Loading..." : `${scVendors.length} ${scVendors.length === 1 ? "store" : "stores"} available`}
          </Text>
        </View>
      </View>

      <FlatList
        data={listData}
        keyExtractor={(item, idx) => item.type === "vendor" ? item.vendor.id : `h${idx}`}
        renderItem={renderListItem}
        ListEmptyComponent={listEmptyComponent}
        contentContainerStyle={{ paddingBottom: bottomInset + 40 }}
        showsVerticalScrollIndicator={false}
        style={styles.content}
        removeClippedSubviews
        maxToRenderPerBatch={3}
        windowSize={5}
        initialNumToRender={4}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  heroContainer: { height: 180, position: "relative" },
  heroImage: { width: "100%", height: "100%" },
  heroOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.5)" },
  backBtn: { position: "absolute", left: 16, width: 40, height: 40, borderRadius: 12, backgroundColor: "rgba(0,0,0,0.3)", alignItems: "center", justifyContent: "center" },
  heroContent: { position: "absolute", bottom: 20, left: 20, right: 20 },
  breadcrumb: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 6 },
  breadcrumbText: { fontFamily: "Poppins_500Medium", fontSize: 12, color: "rgba(255,255,255,0.8)" },
  heroTitle: { fontFamily: "Poppins_700Bold", fontSize: 22, color: "#FFF" },
  heroSub: { fontFamily: "Poppins_400Regular", fontSize: 13, color: "rgba(255,255,255,0.8)", marginTop: 2 },
  content: { flex: 1, paddingTop: 16 },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 20, marginBottom: 12, marginTop: 4 },
  sectionTitle: { fontFamily: "Poppins_700Bold", fontSize: 16, color: Colors.secondary },
  rankBadge: { flexDirection: "row", alignItems: "center", borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3, gap: 3 },
  rankText: { fontFamily: "Poppins_700Bold", fontSize: 11, color: "#FFF" },
  emptyCard: { backgroundColor: "#FFF", borderRadius: 20, padding: 40, alignItems: "center", marginHorizontal: 20, marginTop: 20 },
  emptyTitle: { fontFamily: "Poppins_700Bold", fontSize: 18, color: Colors.secondary, marginTop: 14 },
  emptyText: { fontFamily: "Poppins_400Regular", fontSize: 14, color: Colors.textSecondary, marginTop: 6 },
  vendorCard: {
    backgroundColor: "#FFF",
    marginHorizontal: 20,
    marginBottom: 16,
    borderRadius: 18,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  vendorBanner: { width: "100%", height: 120 },
  vendorOverlay: { position: "absolute", top: 0, left: 0, right: 0, height: 120, backgroundColor: "rgba(0,0,0,0.15)" },
  vendorBadgeRow: { position: "absolute", top: 10, left: 10, right: 10, flexDirection: "row", justifyContent: "space-between" },
  ratingBadge: { flexDirection: "row", alignItems: "center", backgroundColor: Colors.success, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, gap: 3 },
  ratingText: { fontFamily: "Poppins_600SemiBold", fontSize: 12, color: "#FFF" },
  openBadge: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(0,0,0,0.5)", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, gap: 4 },
  openDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.success },
  openText: { fontFamily: "Poppins_500Medium", fontSize: 11, color: "#FFF" },
  vendorBody: { padding: 16 },
  vendorMainRow: { flexDirection: "row", alignItems: "center" },
  vendorName: { fontFamily: "Poppins_700Bold", fontSize: 17, color: Colors.secondary },
  vendorDesc: { fontFamily: "Poppins_400Regular", fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  vendorMeta: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.borderLight },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaText: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary },
  metaDot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: Colors.textLight },
  productsPreview: { marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.borderLight },
  productsLabel: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: Colors.textSecondary, marginBottom: 8 },
  productsRow: { flexDirection: "row", gap: 10 },
  miniProduct: { width: 80, alignItems: "center" },
  miniProductImg: { width: 64, height: 64, borderRadius: 12 },
  miniProductName: { fontFamily: "Poppins_500Medium", fontSize: 11, color: Colors.text, marginTop: 4, textAlign: "center" },
  miniProductPrice: { fontFamily: "Poppins_600SemiBold", fontSize: 12, color: Colors.primary },
  notFoundWrap: { flex: 1 },
  notFoundBack: { width: 40, height: 40, borderRadius: 12, backgroundColor: "#F0F0F0", alignItems: "center" as const, justifyContent: "center" as const, marginLeft: 16, marginTop: 12 },
  notFoundContent: { flex: 1, alignItems: "center" as const, justifyContent: "center" as const, paddingHorizontal: 40 },
  notFoundTitle: { fontFamily: "Poppins_700Bold", fontSize: 20, color: Colors.text, marginTop: 16, textAlign: "center" as const },
  notFoundDesc: { fontFamily: "Poppins_400Regular", fontSize: 14, color: Colors.textSecondary, textAlign: "center" as const, marginTop: 8, lineHeight: 20 },
  notFoundBtn: { flexDirection: "row" as const, alignItems: "center" as const, gap: 8, backgroundColor: Colors.primary, paddingVertical: 12, paddingHorizontal: 24, borderRadius: 12, marginTop: 24 },
  notFoundBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: "#FFF" },
});

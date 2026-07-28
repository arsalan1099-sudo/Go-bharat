import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Platform,
  Image,
  TextInput,
  ScrollView,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { vendors, products, categories } from "@/lib/data";

type SortOption = "price_asc" | "price_desc" | "name_asc";

export default function ProductManagement() {
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("name_asc");
  const [showSortMenu, setShowSortMenu] = useState(false);

  const filteredProducts = useMemo(() => {
    let filtered = [...products];

    if (selectedCategory !== "all") {
      const categoryVendorIds = vendors
        .filter((v) => v.categoryId === selectedCategory)
        .map((v) => v.id);
      filtered = filtered.filter((p) => categoryVendorIds.includes(p.vendorId));
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter((p) => p.name.toLowerCase().includes(q));
    }

    switch (sortBy) {
      case "price_asc":
        filtered.sort((a, b) => a.price - b.price);
        break;
      case "price_desc":
        filtered.sort((a, b) => b.price - a.price);
        break;
      case "name_asc":
        filtered.sort((a, b) => a.name.localeCompare(b.name));
        break;
    }

    return filtered;
  }, [selectedCategory, searchQuery, sortBy]);

  const stats = useMemo(() => {
    const total = products.length;
    const catCount = categories.length;
    const avgPrice =
      total > 0
        ? Math.round(products.reduce((s, p) => s + p.price, 0) / total)
        : 0;
    return { total, catCount, avgPrice };
  }, []);

  const getVendorName = (vendorId: string) => {
    return vendors.find((v) => v.id === vendorId)?.name || "Unknown";
  };

  const getCategoryForProduct = (vendorId: string) => {
    const vendor = vendors.find((v) => v.id === vendorId);
    if (!vendor) return null;
    return categories.find((c) => c.id === vendor.categoryId) || null;
  };

  const sortLabel =
    sortBy === "price_asc"
      ? "Price: Low-High"
      : sortBy === "price_desc"
        ? "Price: High-Low"
        : "Name: A-Z";

  const handleSort = (option: SortOption) => {
    try { Haptics.selectionAsync(); } catch {}
    setSortBy(option);
    setShowSortMenu(false);
  };

  const renderProduct = ({ item }: { item: (typeof products)[0] }) => {
    const cat = getCategoryForProduct(item.vendorId);
    const hasDiscount =
      item.originalPrice !== undefined && item.originalPrice > item.price;

    return (
      <View style={styles.productCard}>
        <Image source={{ uri: item.image }} style={styles.productImage} accessibilityLabel={item.name} />
        <View style={styles.productInfo}>
          <View style={styles.productHeader}>
            <Text style={styles.productName} numberOfLines={1}>
              {item.name}
            </Text>
            <View
              style={[
                styles.availDot,
                {
                  backgroundColor: item.isAvailable
                    ? Colors.success
                    : Colors.error,
                },
              ]}
            />
          </View>
          <Text style={styles.productDesc} numberOfLines={1}>
            {item.description}
          </Text>
          <View style={styles.priceRow}>
            <Text style={styles.price}>
              {"\u20B9"}
              {item.price}
            </Text>
            {hasDiscount && (
              <Text style={styles.originalPrice}>
                {"\u20B9"}
                {item.originalPrice}
              </Text>
            )}
          </View>
          <View style={styles.productMeta}>
            <View style={styles.vendorTag}>
              <Ionicons
                name="storefront-outline"
                size={11}
                color={Colors.textSecondary}
              />
              <Text style={styles.vendorName} numberOfLines={1}>
                {getVendorName(item.vendorId)}
              </Text>
            </View>
            {cat && (
              <View
                style={[
                  styles.catBadge,
                  { backgroundColor: cat.color + "18" },
                ]}
              >
                <Text style={[styles.catBadgeText, { color: cat.color }]}>
                  {cat.name}
                </Text>
              </View>
            )}
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={["#0B1E3D", "#142F5E"]}
        style={[styles.header, { paddingTop: topInset + 12 }]}
      >
        <View style={styles.headerRow}>
          <Pressable
            onPress={() => {
              try { Haptics.selectionAsync(); } catch {}
              router.back();
            }}
          >
            <Ionicons name="arrow-back" size={24} color="#FFF" />
          </Pressable>
          <Text style={styles.headerTitle}>Product Management</Text>
          <View style={{ width: 24 }} />
        </View>
      </LinearGradient>

      <FlatList
        data={filteredProducts.slice(0, 100)}
        keyExtractor={(item) => item.id}
        renderItem={renderProduct}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingBottom: bottomInset + 20,
          paddingTop: 8,
        }}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View>
            <View style={styles.statsRow}>
              <View style={styles.statCard}>
                <Ionicons
                  name="cube-outline"
                  size={20}
                  color={Colors.primary}
                />
                <Text style={styles.statValue}>
                  {stats.total.toLocaleString()}
                </Text>
                <Text style={styles.statLabel}>Total Products</Text>
              </View>
              <View style={styles.statCard}>
                <Ionicons
                  name="grid-outline"
                  size={20}
                  color={Colors.info}
                />
                <Text style={styles.statValue}>{stats.catCount}</Text>
                <Text style={styles.statLabel}>Categories</Text>
              </View>
              <View style={styles.statCard}>
                <Ionicons
                  name="pricetag-outline"
                  size={20}
                  color={Colors.success}
                />
                <Text style={styles.statValue}>
                  {"\u20B9"}
                  {stats.avgPrice}
                </Text>
                <Text style={styles.statLabel}>Avg Price</Text>
              </View>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.categoryTabs}
            >
              <Pressable
                style={[
                  styles.catTab,
                  selectedCategory === "all" && styles.catTabActive,
                ]}
                onPress={() => {
                  try { Haptics.selectionAsync(); } catch {}
                  setSelectedCategory("all");
                }}
              >
                <Text
                  style={[
                    styles.catTabText,
                    selectedCategory === "all" && styles.catTabTextActive,
                  ]}
                >
                  All
                </Text>
              </Pressable>
              {categories.map((cat) => (
                <Pressable
                  key={cat.id}
                  style={[
                    styles.catTab,
                    selectedCategory === cat.id && styles.catTabActive,
                  ]}
                  onPress={() => {
                    try { Haptics.selectionAsync(); } catch {}
                    setSelectedCategory(cat.id);
                  }}
                >
                  <Text
                    style={[
                      styles.catTabText,
                      selectedCategory === cat.id && styles.catTabTextActive,
                    ]}
                  >
                    {cat.name}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            <View style={styles.searchRow}>
              <View style={styles.searchBar}>
                <Ionicons
                  name="search"
                  size={18}
                  color={Colors.textSecondary}
                />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search products..."
                  placeholderTextColor={Colors.textLight}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                />
                {searchQuery.length > 0 && (
                  <Pressable onPress={() => setSearchQuery("")}>
                    <Ionicons
                      name="close-circle"
                      size={18}
                      color={Colors.textLight}
                    />
                  </Pressable>
                )}
              </View>
              <Pressable
                style={styles.sortBtn}
                onPress={() => {
                  try { Haptics.selectionAsync(); } catch {}
                  setShowSortMenu(!showSortMenu);
                }}
              >
                <Ionicons
                  name="swap-vertical"
                  size={18}
                  color={Colors.primary}
                />
              </Pressable>
            </View>

            {showSortMenu && (
              <View style={styles.sortMenu}>
                {([
                  { key: "price_asc" as SortOption, label: "Price: Low-High" },
                  { key: "price_desc" as SortOption, label: "Price: High-Low" },
                  { key: "name_asc" as SortOption, label: "Name: A-Z" },
                ]).map((opt) => (
                  <Pressable
                    key={opt.key}
                    style={[
                      styles.sortOption,
                      sortBy === opt.key && styles.sortOptionActive,
                    ]}
                    onPress={() => handleSort(opt.key)}
                  >
                    <Text
                      style={[
                        styles.sortOptionText,
                        sortBy === opt.key && styles.sortOptionTextActive,
                      ]}
                    >
                      {opt.label}
                    </Text>
                    {sortBy === opt.key && (
                      <Ionicons
                        name="checkmark"
                        size={16}
                        color={Colors.primary}
                      />
                    )}
                  </Pressable>
                ))}
              </View>
            )}

            <View style={styles.resultInfo}>
              <Text style={styles.resultText}>
                {filteredProducts.length.toLocaleString()} products
              </Text>
              <Text style={styles.sortLabel}>{sortLabel}</Text>
            </View>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons
              name="cube-outline"
              size={48}
              color={Colors.textLight}
            />
            <Text style={styles.emptyText}>No products found</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    paddingBottom: 16,
    paddingHorizontal: 16,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 18,
    color: "#FFF",
  },
  statsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
    marginBottom: 14,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  statValue: {
    fontFamily: "Poppins_700Bold",
    fontSize: 16,
    color: Colors.text,
    marginTop: 6,
  },
  statLabel: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  categoryTabs: {
    paddingBottom: 12,
    gap: 8,
  },
  catTab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  catTabActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  catTabText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 13,
    color: Colors.textSecondary,
  },
  catTabTextActive: {
    color: "#FFF",
  },
  searchRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 10,
  },
  searchBar: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: Colors.text,
    height: 44,
  },
  sortBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sortMenu: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
    overflow: "hidden",
  },
  sortOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  sortOptionActive: {
    backgroundColor: Colors.primary + "0A",
  },
  sortOptionText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 14,
    color: Colors.text,
  },
  sortOptionTextActive: {
    color: Colors.primary,
  },
  resultInfo: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  resultText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 13,
    color: Colors.text,
  },
  sortLabel: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
  },
  productCard: {
    flexDirection: "row",
    backgroundColor: Colors.surface,
    borderRadius: 14,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    overflow: "hidden",
  },
  productImage: {
    width: 90,
    height: 100,
    backgroundColor: Colors.surfaceAlt,
  },
  productInfo: {
    flex: 1,
    padding: 10,
    justifyContent: "center",
  },
  productHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
  },
  productName: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
    color: Colors.text,
    flex: 1,
  },
  availDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  productDesc: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
  },
  price: {
    fontFamily: "Poppins_700Bold",
    fontSize: 15,
    color: Colors.primary,
  },
  originalPrice: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: Colors.textLight,
    textDecorationLine: "line-through",
  },
  productMeta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 6,
    gap: 6,
  },
  vendorTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flex: 1,
  },
  vendorName: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
    flex: 1,
  },
  catBadge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  catBadgeText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 10,
  },
  emptyState: {
    alignItems: "center",
    paddingTop: 60,
    gap: 12,
  },
  emptyText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 15,
    color: Colors.textSecondary,
  },
});

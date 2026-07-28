import React, { useState, useRef, useEffect, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Platform, TextInput, FlatList, Dimensions, Linking, Modal, Share, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import Colors from "@/constants/colors";
import { useApp } from "@/lib/store";
import { vendors as staticVendors, products, categories as staticCategories, subCategories as staticSubCategories, busRoutes as staticBusRoutes, TRAVEL_VENDOR_ID, FLIGHT_VENDOR_IDS, TRAIN_VENDOR_IDS } from "@/lib/data";
import { Product } from "@/lib/types";
import { getApiUrl } from "@/lib/query-client";
import { readCachedVendorProducts, fetchVendorProducts } from "@/lib/vendorProducts";

// Default banner images shown when a vendor hasn't uploaded their own photo.
// Keyed by categoryId so each category gets a relevant visual.
const DEFAULT_STORE_BANNERS = {
  "1": "https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=800&q=80", // B2B / wholesale
  "2": "https://images.unsplash.com/photo-1555529669-e69e7aa0ba9a?w=800&q=80",    // Retail / shopping
  "3": "https://images.unsplash.com/photo-1521791136064-7986c2920216?w=800&q=80", // Services
  "4": "https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=800&q=80", // Manpower
  "5": "https://images.unsplash.com/photo-1488085061387-422e29b40080?w=800&q=80", // Travel / tours
};

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const a =
    sinDLat * sinDLat +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * sinDLng * sinDLng;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const { width } = Dimensions.get("window");

function StoreReviewCard({ review, onHelpful, onPhotoPress, vendorName }: { review: any; onHelpful: () => void; onPhotoPress: (photos: string[], idx: number) => void; vendorName?: string }) {
  const reviewProduct = review.productId ? products.find((p: any) => p.id === review.productId) : null;
  const timeAgo = (date: string) => {
    const diff = Date.now() - new Date(date).getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days === 0) return "Today";
    if (days === 1) return "Yesterday";
    if (days < 30) return `${days}d ago`;
    return `${Math.floor(days / 30)}mo ago`;
  };

  const ratingColor = review.rating >= 4 ? Colors.success : review.rating >= 3 ? Colors.warning : Colors.error;

  return (
    <View style={rstyles.card}>
      <View style={rstyles.cardTop}>
        <View style={rstyles.avatar}>
          <Text style={rstyles.avatarText}>{review.userName.charAt(0)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={rstyles.userName}>{review.userName}</Text>
          <Text style={rstyles.timeText}>{timeAgo(review.createdAt)}</Text>
        </View>
        <View style={[rstyles.ratingBadge, { backgroundColor: ratingColor }]}>
          <Ionicons name="star" size={12} color="#FFF" />
          <Text style={rstyles.ratingBadgeText}>{review.rating}</Text>
        </View>
      </View>
      {reviewProduct && (
        <Pressable style={rstyles.productTag} onPress={() => router.push(`/product/${reviewProduct.id}` as any)}>
          <Image source={{ uri: reviewProduct.image }} style={rstyles.productTagImg} contentFit="cover" transition={200} accessibilityLabel={reviewProduct.name} />
          <Text style={rstyles.productTagName} numberOfLines={1}>{reviewProduct.name}</Text>
          <Ionicons name="chevron-forward" size={14} color={Colors.textLight} />
        </Pressable>
      )}
      <Text style={rstyles.comment}>{review.comment}</Text>
      {review.photos.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={rstyles.photosRow}>
          {review.photos.map((uri: string, i: number) => (
            <Pressable key={i} onPress={() => onPhotoPress(review.photos, i)}>
              <Image source={{ uri }} style={rstyles.photo} contentFit="cover" accessibilityLabel="Review photo" />
            </Pressable>
          ))}
        </ScrollView>
      )}
      {review.vendorReply && (
        <View style={rstyles.vendorReplyBox}>
          <View style={rstyles.vendorReplyHeader}>
            <Ionicons name="storefront" size={13} color={Colors.primary} />
            <Text style={rstyles.vendorReplyLabel}>{vendorName || "Vendor"} replied</Text>
          </View>
          <Text style={rstyles.vendorReplyText}>{review.vendorReply}</Text>
        </View>
      )}
      <Pressable style={rstyles.helpfulBtn} onPress={onHelpful}>
        <Ionicons name="thumbs-up-outline" size={14} color={Colors.textSecondary} />
        <Text style={rstyles.helpfulText}>Helpful ({review.helpful})</Text>
      </Pressable>
    </View>
  );
}

function InfoChip({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={styles.infoChip}>
      <Ionicons name={icon as any} size={18} color={Colors.primary} />
      <View>
        <Text style={styles.infoChipValue}>{value}</Text>
        <Text style={styles.infoChipLabel}>{label}</Text>
      </View>
    </View>
  );
}

function CategoryTab({ name, isActive, onPress }: { name: string; isActive: boolean; onPress: () => void }) {
  return (
    <Pressable
      style={[styles.categoryTab, isActive && styles.categoryTabActive]}
      onPress={onPress}
    >
      <Text style={[styles.categoryTabText, isActive && styles.categoryTabTextActive]}>{name}</Text>
    </Pressable>
  );
}

type TravelSubCat = "bus" | "flight" | "cab" | "tempo" | "train" | null;

function getTravelSubCat(subCategoryId?: string): TravelSubCat {
  if (!subCategoryId) return null;
  if (subCategoryId === "sc101") return "bus";
  if (subCategoryId === "sc107") return "flight";
  if (subCategoryId === "sc102") return "cab";
  if (subCategoryId === "sc105") return "tempo";
  if (subCategoryId === "sc108") return "train";
  return null;
}

const TRAVEL_BOOK_CFG: Record<NonNullable<TravelSubCat>, { color: string; icon: string; label: string }> = {
  bus: { color: "#3B82F6", icon: "bus", label: "BOOK" },
  flight: { color: "#6366F1", icon: "airplane", label: "SELECT CLASS" },
  cab: { color: "#FF6B00", icon: "car-side", label: "BOOK RIDE" },
  tempo: { color: "#059669", icon: "bus-side", label: "BOOK VEHICLE" },
  train: { color: "#EF4444", icon: "train", label: "BOOK BERTH" },
};

function ProductCard({
  product,
  vendor,
  qty,
  onAdd,
  onIncrement,
  onDecrement,
  isBusRoute,
  travelSubCat,
}: {
  product: typeof products[0];
  vendor: typeof vendors[0];
  qty: number;
  onAdd: () => void;
  onIncrement: () => void;
  onDecrement: () => void;
  isBusRoute?: boolean;
  travelSubCat?: TravelSubCat;
}) {
  const discount = product.originalPrice
    ? Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)
    : 0;

  const busRoute = isBusRoute ? staticBusRoutes.find((r) => r.productId === product.id) : null;

  const isTravelBooking = travelSubCat && travelSubCat !== null;
  const travelCfg = isTravelBooking ? TRAVEL_BOOK_CFG[travelSubCat!] : null;

  const travelParams = {
    productId: product.id,
    vendorId: vendor.id,
    productName: product.name,
    productPrice: String(product.price),
    productDesc: product.description || "",
    productImage: product.image || "",
    vendorName: vendor.name,
  };

  const handlePress = () => {
    if (isBusRoute && busRoute) {
      router.push({ pathname: "/bus-booking" as any, params: { routeId: busRoute.id } });
    } else if (travelSubCat === "flight") {
      router.push({ pathname: "/flight-booking" as any, params: travelParams });
    } else if (travelSubCat === "cab") {
      router.push({ pathname: "/cab-booking" as any, params: { ...travelParams, subCategory: "sc102" } });
    } else if (travelSubCat === "tempo") {
      router.push({ pathname: "/cab-booking" as any, params: { ...travelParams, subCategory: "sc105" } });
    } else if (travelSubCat === "train") {
      router.push({ pathname: "/bus-booking" as any, params: { routeId: product.id } });
    } else {
      router.push(`/product/${product.id}` as any);
    }
  };

  const handleBookPress = (e: any) => {
    e.stopPropagation?.();
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
    if (isBusRoute && busRoute) {
      router.push({ pathname: "/bus-booking" as any, params: { routeId: busRoute.id } });
    } else if (travelSubCat === "flight") {
      router.push({ pathname: "/flight-booking" as any, params: travelParams });
    } else if (travelSubCat === "cab") {
      router.push({ pathname: "/cab-booking" as any, params: { ...travelParams, subCategory: "sc102" } });
    } else if (travelSubCat === "tempo") {
      router.push({ pathname: "/cab-booking" as any, params: { ...travelParams, subCategory: "sc105" } });
    } else if (travelSubCat === "train") {
      router.push({ pathname: "/bus-booking" as any, params: { routeId: product.id } });
    }
  };

  const perUnitLabel =
    travelSubCat === "bus" ? "/seat" :
    travelSubCat === "flight" ? "/seat" :
    travelSubCat === "cab" ? "/ride" :
    travelSubCat === "tempo" ? "/trip" :
    travelSubCat === "train" ? "/berth" : null;

  return (
    <Pressable style={styles.productCard} onPress={handlePress}>
      <View style={styles.productInfo}>
        <Text style={styles.productName}>{product.name}</Text>
        <Text style={styles.productDesc} numberOfLines={2}>{product.description}</Text>
        {isBusRoute && busRoute && (
          <View style={styles.busRouteInfo}>
            <View style={styles.busRouteChip}>
              <MaterialCommunityIcons name="bus" size={12} color="#3B82F6" />
              <Text style={styles.busRouteChipText}>{busRoute.busType}</Text>
            </View>
            <Text style={styles.busSeatsAvail}>{busRoute.totalSeats - busRoute.bookedSeats.length} seats left</Text>
          </View>
        )}
        {isTravelBooking && !isBusRoute && travelCfg && (
          <View style={styles.busRouteInfo}>
            <View style={[styles.busRouteChip, { backgroundColor: travelCfg.color + "15" }]}>
              <MaterialCommunityIcons name={travelCfg.icon as any} size={12} color={travelCfg.color} />
              <Text style={[styles.busRouteChipText, { color: travelCfg.color }]}>
                {travelSubCat === "flight" ? "Economy from" :
                 travelSubCat === "cab" ? "Available now" :
                 travelSubCat === "tempo" ? "For hire" :
                 travelSubCat === "train" ? "AC/Non-AC" : ""}
              </Text>
            </View>
          </View>
        )}
        <View style={styles.priceRow}>
          <Text style={styles.productPrice}>{"\u20B9"}{product.price}</Text>
          {product.originalPrice && (
            <Text style={styles.originalPrice}>{"\u20B9"}{product.originalPrice}</Text>
          )}
          {discount > 0 && (
            <View style={styles.discountTag}>
              <Text style={styles.discountTagText}>{discount}% OFF</Text>
            </View>
          )}
          {perUnitLabel && <Text style={styles.perSeatText}>{perUnitLabel}</Text>}
        </View>
      </View>
      <View style={styles.productRight}>
        <View style={styles.productImageContainer}>
          <Image source={{ uri: product.image }} style={styles.productImage} contentFit="cover" transition={200} accessibilityLabel={product.name} />
        </View>
        {(isBusRoute || isTravelBooking) ? (
          <Pressable
            style={[styles.addBtn, { backgroundColor: travelCfg?.color || "#3B82F6" }]}
            onPress={handleBookPress}
          >
            <MaterialCommunityIcons name={(travelCfg?.icon || "seat-passenger") as any} size={15} color="#FFF" />
            <Text style={styles.addBtnText}>{travelCfg?.label || "BOOK"}</Text>
          </Pressable>
        ) : qty > 0 ? (
          <View style={styles.qtyControl}>
            <Pressable
              style={styles.qtyBtn}
              onPress={(e) => {
                e.stopPropagation?.();
                try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
                onDecrement();
              }}
            >
              <Ionicons name="remove" size={16} color={Colors.primary} />
            </Pressable>
            <Text style={styles.qtyValue}>{qty}</Text>
            <Pressable
              style={styles.qtyBtn}
              onPress={(e) => {
                e.stopPropagation?.();
                try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
                onIncrement();
              }}
            >
              <Ionicons name="add" size={16} color={Colors.primary} />
            </Pressable>
          </View>
        ) : (
          <Pressable
            style={styles.addBtn}
            onPress={(e) => {
              e.stopPropagation?.();
              try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
              onAdd();
            }}
          >
            <Ionicons name="add" size={18} color="#FFF" />
            <Text style={styles.addBtnText}>ADD</Text>
          </Pressable>
        )}
      </View>
    </Pressable>
  );
}

export default function StoreDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { addToCart, cart, removeFromCart, updateCartQuantity, reviews, markReviewHelpful, liveVendors, customSubCategories, vendorProfileImages, liveCategories, liveSubCategories, liveBusRoutes } = useApp();
  const baseCategories = liveCategories.length > 0 ? liveCategories : staticCategories;
  const baseSubs = liveSubCategories.length > 0 ? liveSubCategories : staticSubCategories;
  const allSubCategories = [...baseSubs, ...customSubCategories.filter((sc) => !baseSubs.some((b) => b.id === sc.id))];
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [showSearch, setShowSearch] = useState(false);
  const [galleryVisible, setGalleryVisible] = useState(false);
  const [galleryPhotos, setGalleryPhotos] = useState<string[]>([]);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  const [realDistance, setRealDistance] = useState<string | null>(null);

  const allVendors = liveVendors;
  const cachedVendor = allVendors.find((v) => v.id === id);
  const [freshVendorData, setFreshVendorData] = useState<Partial<typeof cachedVendor>>({});
  // True when the server confirms the vendor does not exist (404) — overrides stale cache
  const [vendorGone, setVendorGone] = useState(false);
  const vendor = (!vendorGone && cachedVendor) ? { ...cachedVendor, ...freshVendorData } : undefined;
  const [vendorAddedProducts, setVendorAddedProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [productFetchFailed, setProductFetchFailed] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [applicationStatus, setApplicationStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setVendorAddedProducts([]);
    setFreshVendorData({});
    setVendorGone(false);
    setLoadingProducts(true);
    setProductFetchFailed(false);
    setApplicationStatus(null);
    let cancelled = false;
    const baseUrl = getApiUrl();

    // Pre-load from AsyncStorage for instant display while network request runs
    readCachedVendorProducts(id).then((cached) => {
      if (cached && !cancelled) {
        setVendorAddedProducts(cached);
        setLoadingProducts(false);
      }
    });

    // Fetch vendor detail — cached 60s by server, stale-while-revalidate 5min
    fetch(new URL(`/api/vendors/${id}`, baseUrl).toString())
      .then((r) => {
        if (r.status === 404) {
          // Vendor confirmed gone from DB — override the stale AsyncStorage cache
          if (!cancelled) setVendorGone(true);
          return null;
        }
        return r.ok ? r.json() : null;
      })
      .then((data) => {
        if (cancelled || !data?.vendor) return;
        const v = data.vendor;
        const overlay: Record<string, any> = {};
        if (v.hasImage !== undefined) overlay.hasImage = v.hasImage;
        if (v.name) overlay.name = v.name;
        if (v.description) overlay.description = v.description;
        if (v.address) overlay.address = v.address;
        setFreshVendorData(overlay);
        if (v.applicationStatus) setApplicationStatus(v.applicationStatus);
      })
      .catch(() => {});

    // Fetch products — cached 5min by server, stale-while-revalidate 10min.
    // Shared helper normalizes images and persists to the same cache the
    // Explore map card reads.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25000);
    fetchVendorProducts(id, { signal: controller.signal })
      .then((safeProducts) => {
        clearTimeout(timer);
        if (cancelled) return;
        setVendorAddedProducts(safeProducts);
      })
      .catch(() => {
        if (!cancelled) setProductFetchFailed(true);
      })
      .finally(() => {
        clearTimeout(timer);
        if (!cancelled) setLoadingProducts(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [id, retryCount]);

  useEffect(() => {
    if (!vendor?.lat || !vendor?.lng) return;
    let active = true;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (!active) return;
        if (status !== "granted") return;
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (!active) return;
        const km = haversineKm(pos.coords.latitude, pos.coords.longitude, vendor.lat, vendor.lng);
        setRealDistance(km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`);
      } catch {}
    })();
    return () => { active = false; };
  }, [vendor?.lat, vendor?.lng]);

  const storeProducts = [...products.filter((p) => p.vendorId === id), ...vendorAddedProducts];
  const storeReviews = reviews.filter((r) => r.vendorId === id);
  const avgRating = storeReviews.length > 0
    ? (storeReviews.reduce((s, r) => s + r.rating, 0) / storeReviews.length).toFixed(1)
    : "0";
  const ratingCounts = [5, 4, 3, 2, 1].map((star) => storeReviews.filter((r) => r.rating === star).length);

  if (!vendor) {
    return (
      <View style={styles.container}>
        <View style={[styles.notFoundWrap, { paddingTop: topInset }]}>
          <Pressable onPress={() => router.back()} style={styles.notFoundBack}>
            <Ionicons name="arrow-back" size={22} color={Colors.text} />
          </Pressable>
          <View style={styles.notFoundContent}>
            <Ionicons name="storefront-outline" size={64} color={Colors.textLight} />
            <Text style={styles.notFoundTitle}>Store Not Found</Text>
            <Text style={styles.notFoundDesc}>This store may have been removed or is no longer available.</Text>
            <Pressable style={styles.notFoundBtn} onPress={() => router.back()}>
              <Ionicons name="arrow-back" size={16} color="#FFF" />
              <Text style={styles.notFoundBtnText}>Go Back</Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  const openGallery = (photos: string[], idx: number) => {
    setGalleryPhotos(photos);
    setGalleryIndex(idx);
    setGalleryVisible(true);
  };

  const category = baseCategories.find((c) => c.id === vendor.categoryId);
  const subCategory = allSubCategories.find((sc) => sc.id === vendor.subCategoryId);
  const productCategories = ["All", ...new Set(storeProducts.map((p) => p.category))];

  const filteredProducts = storeProducts.filter((p) => {
    const matchesCategory = activeCategory === "All" || p.category === activeCategory;
    const matchesSearch = !searchQuery ||
      (p.name ?? "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.description ?? "").toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const getCartQty = (productId: string) => {
    const item = cart.find((c) => c.product.id === productId);
    return item?.quantity || 0;
  };

  const cartItemsForStore = cart.filter((c) => c.vendorId === id);
  const cartTotal = cartItemsForStore.reduce((s, c) => s + c.product.price * c.quantity, 0);
  const cartCount = cartItemsForStore.reduce((s, c) => s + c.quantity, 0);

  return (
    <View style={styles.container}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: cartCount > 0 ? 110 + bottomInset : 40 + bottomInset }}
        showsVerticalScrollIndicator={false}
        stickyHeaderIndices={[1]}
      >
        <View style={styles.heroContainer}>
          <Image
            source={
              vendor.hasImage
                ? { uri: new URL(`/api/vendors/${vendor.id}/image?d=${Math.floor(Date.now() / 86400000)}`, getApiUrl()).toString() }
                : { uri: DEFAULT_STORE_BANNERS[vendor.categoryId as keyof typeof DEFAULT_STORE_BANNERS] ?? DEFAULT_STORE_BANNERS["2"] }
            }
            style={styles.heroImage}
            contentFit="cover"
            contentPosition="center"
            accessibilityLabel={vendor.name}
          />
          <View style={styles.heroOverlay} />

          <View style={[styles.heroTopRow, { top: topInset + 4 }]}>
            <Pressable style={styles.heroBtn} onPress={() => router.back()}>
              <Ionicons name="arrow-back" size={22} color="#FFF" />
            </Pressable>
            <View style={styles.heroTopRight}>
              <Pressable style={styles.heroBtn} onPress={() => setShowSearch(!showSearch)}>
                <Ionicons name="search" size={20} color="#FFF" />
              </Pressable>
              <Pressable style={styles.heroBtn} onPress={async () => {
                try {
                  await Share.share({
                    message: `Check out ${vendor.name} on Go Bharat!\n${vendor.description}\nRating: ${vendor.rating}/5\nAddress: ${vendor.address || "Malegaon"}`,
                    title: vendor.name,
                  });
                } catch {}
              }}>
                <Ionicons name="share-social-outline" size={20} color="#FFF" />
              </Pressable>
            </View>
          </View>

          {vendor.isOpen && (
            <View style={styles.openBadge}>
              <View style={styles.openDot} />
              <Text style={styles.openText}>Open Now</Text>
            </View>
          )}

        </View>

        <View style={styles.heroInfo}>
          <Text style={styles.heroName}>{vendor.name}</Text>
          <Text style={styles.heroDesc}>{vendor.description}</Text>
          {(category || subCategory) && (
            <View style={styles.tagRow}>
              {category && (
                <View style={styles.tag}>
                  <Ionicons name={category.icon as any} size={12} color={Colors.primary} />
                  <Text style={styles.tagText}>{category.name}</Text>
                </View>
              )}
              {subCategory && (
                <View style={styles.tag}>
                  <Text style={styles.tagText}>{subCategory.name}</Text>
                </View>
              )}
            </View>
          )}
          <View style={styles.vendorActionsRow}>
            <Pressable
              style={styles.chatVendorBtn}
              onPress={() => {
                try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
                router.push({ pathname: "/vendor-chat" as any, params: { vendorId: vendor.id, vendorName: vendor.name, vendorPhone: vendor.phone || "" } });
              }}
            >
              <Ionicons name="chatbubble-ellipses" size={16} color="#FFF" />
              <Text style={styles.chatVendorText}>Chat with Seller</Text>
            </Pressable>
            {vendor.phone ? (
              <Pressable
                style={styles.callVendorBtn}
                onPress={() => {
                  try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
                  Linking.openURL(`tel:${vendor.phone}`);
                }}
              >
                <Ionicons name="call" size={16} color={Colors.primary} />
                <Text style={styles.callVendorText}>Call</Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        <View style={styles.stickyHeader}>
          {showSearch && (
            <View style={styles.searchBar}>
              <Ionicons name="search" size={18} color={Colors.textSecondary} />
              <TextInput
                style={styles.searchInput}
                placeholder={`Search in ${vendor.name}...`}
                placeholderTextColor={Colors.textLight}
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoFocus
              />
              {searchQuery.length > 0 && (
                <Pressable onPress={() => setSearchQuery("")}>
                  <Ionicons name="close-circle" size={18} color={Colors.textLight} />
                </Pressable>
              )}
            </View>
          )}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoryTabList}
          >
            {productCategories.map((cat) => (
              <CategoryTab
                key={cat}
                name={cat}
                isActive={activeCategory === cat}
                onPress={() => {
                  try { Haptics.selectionAsync(); } catch {}
                  setActiveCategory(cat);
                }}
              />
            ))}
          </ScrollView>
        </View>

        <View style={styles.infoRow}>
          <InfoChip icon="star" label="Rating" value={`${vendor.rating} (${vendor.reviewCount})`} />
          <InfoChip
            icon="time-outline"
            label={["3", "4"].includes(vendor.categoryId) ? "Response Time" : vendor.categoryId === "5" ? "Booking Time" : "Delivery"}
            value={vendor.deliveryTime}
          />
          <InfoChip icon="location-outline" label="Distance" value={realDistance ?? vendor.distance} />
        </View>

        <View style={styles.locationSection}>
          <View style={styles.locationHeader}>
            <View style={styles.locationIconWrap}>
              <Ionicons name="location" size={18} color={Colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.locationTitle}>Store Location</Text>
              {vendor.address && (
                <Text style={styles.locationAddress} numberOfLines={2}>{vendor.address}</Text>
              )}
            </View>
          </View>

          {(() => {
            const extras = undefined;
            if (!extras) return null;
            const formatTime = (t: string) => {
              const parts = t.trim().split(":");
              let h = parseInt(parts[0], 10);
              const m = parts[1] || "00";
              const ampm = h >= 12 ? "PM" : "AM";
              if (h === 0) h = 12;
              else if (h > 12) h -= 12;
              return `${h}:${m} ${ampm}`;
            };
            const formatTiming = (timing: string) => {
              const halves = timing.split("-").map(s => s.trim());
              if (halves.length === 2) return `${formatTime(halves[0])} - ${formatTime(halves[1])}`;
              return timing;
            };
            const formatSupply = (s: string) => {
              if (s === "Only Retail") return "Retail Only";
              if (s === "Only Wholesale") return "Wholesale Only";
              if (s === "Only Wholesale and Retail" || s === "Wholesale and Retail") return "Wholesale & Retail";
              return s;
            };
            return (
              <View style={styles.extrasContainer}>
                {extras.officeTiming ? (
                  <View style={styles.extrasRow}>
                    <Ionicons name="time-outline" size={16} color={Colors.primary} />
                    <Text style={styles.extrasText}>{formatTiming(extras.officeTiming)}</Text>
                  </View>
                ) : null}
                {extras.officeHoliday && extras.officeHoliday !== "No Holiday" ? (
                  <View style={styles.extrasRow}>
                    <Ionicons name="calendar-outline" size={16} color={Colors.primary} />
                    <Text style={styles.extrasText}>Closed on {extras.officeHoliday}</Text>
                  </View>
                ) : null}
                {extras.contactPerson && extras.contactPerson !== "Abc" ? (
                  <View style={styles.extrasRow}>
                    <Ionicons name="person-outline" size={16} color={Colors.primary} />
                    <Text style={styles.extrasText}>{extras.contactPerson}</Text>
                  </View>
                ) : null}
                {extras.supplyType ? (
                  <View style={styles.extrasRow}>
                    <Ionicons name="cube-outline" size={16} color={Colors.primary} />
                    <Text style={styles.extrasText}>{formatSupply(extras.supplyType)}</Text>
                  </View>
                ) : null}
              </View>
            );
          })()}

          {(() => {
            const extras = undefined;
            if (!extras) return null;
            return (
              <View style={styles.contactActions}>
                {extras.phone ? (
                  <Pressable
                    style={styles.contactBtn}
                    onPress={() => Linking.openURL(`tel:${extras.phone}`)}
                  >
                    <Ionicons name="call" size={16} color="#2E7D32" />
                    <Text style={[styles.contactBtnText, { color: "#2E7D32" }]}>Call</Text>
                  </Pressable>
                ) : null}
                {extras.whatsapp ? (
                  <Pressable
                    style={styles.contactBtn}
                    onPress={() => Linking.openURL(`https://wa.me/91${extras.whatsapp}`)}
                  >
                    <Ionicons name="logo-whatsapp" size={16} color="#25D366" />
                    <Text style={[styles.contactBtnText, { color: "#25D366" }]}>WhatsApp</Text>
                  </Pressable>
                ) : null}
                {extras.mapLocation ? (
                  <Pressable
                    style={[styles.contactBtn, { backgroundColor: "#E3F2FD" }]}
                    onPress={() => Linking.openURL(extras.mapLocation)}
                  >
                    <Ionicons name="map" size={16} color="#1565C0" />
                    <Text style={[styles.contactBtnText, { color: "#1565C0" }]}>Google Maps</Text>
                  </Pressable>
                ) : null}
              </View>
            );
          })()}

          <View style={styles.locationActions}>
            <Pressable
              style={styles.directionsBtn}
              onPress={() => {
                const url = `https://www.google.com/maps/search/?api=1&query=${vendor.lat},${vendor.lng}`;
                Linking.openURL(url).catch(() =>
                  Linking.openURL(`https://maps.google.com/?q=${vendor.lat},${vendor.lng}`)
                );
              }}
            >
              <Ionicons name="navigate" size={18} color="#FFF" />
              <Text style={styles.directionsBtnText}>View on Map</Text>
            </Pressable>
            <Pressable
              style={styles.shareLocationBtn}
              onPress={() => {
                const url = `https://www.google.com/maps/dir/?api=1&destination=${vendor.lat},${vendor.lng}&travelmode=driving`;
                Linking.openURL(url).catch(() =>
                  Linking.openURL(`https://maps.google.com/?daddr=${vendor.lat},${vendor.lng}`)
                );
              }}
            >
              <Ionicons name="car-sport" size={16} color={Colors.primary} />
              <Text style={styles.shareLocationText}>Drive Mode</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.offerBanner}>
          <View style={styles.offerIcon}>
            <Ionicons name="pricetag-outline" size={18} color={Colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.offerTitle}>Flat 20% off on orders above {"\u20B9"}300</Text>
            <Text style={styles.offerCode}>Use code GOBHARAT</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={Colors.textLight} />
        </View>

        <View style={styles.menuSection}>
          <View style={styles.menuHeader}>
            <Text style={styles.menuTitle}>
              {activeCategory === "All" ? "Full Menu" : activeCategory}
            </Text>
            {loadingProducts ? (
              <ActivityIndicator size="small" color={Colors.primary} />
            ) : (
              <Text style={styles.menuCount}>{filteredProducts.length} items</Text>
            )}
          </View>

          {loadingProducts ? (
            <View style={styles.emptyState}>
              <ActivityIndicator size="large" color={Colors.primary} />
              <Text style={[styles.emptyText, { marginTop: 12 }]}>Loading products...</Text>
            </View>
          ) : filteredProducts.length === 0 ? (
            <View style={styles.emptyState}>
              {applicationStatus === "PENDING" ? (
                <>
                  <Ionicons name="time-outline" size={44} color="#F59E0B" />
                  <Text style={[styles.emptyText, { color: "#92400E", fontWeight: "700", marginTop: 10 }]}>Approval Pending</Text>
                  <Text style={[styles.emptyText, { fontSize: 13, color: Colors.textLight, marginTop: 4, textAlign: "center" }]}>
                    This store is awaiting admin approval.{"\n"}Products will appear once it goes live.
                  </Text>
                </>
              ) : (
                <>
                  <Ionicons name="search-outline" size={40} color={Colors.textLight} />
                  <Text style={styles.emptyText}>No items found</Text>
                  {productFetchFailed && (
                    <Pressable
                      style={{ marginTop: 14, paddingHorizontal: 24, paddingVertical: 10, backgroundColor: Colors.primary, borderRadius: 20 }}
                      onPress={() => setRetryCount((c) => c + 1)}
                    >
                      <Text style={{ color: "#fff", fontWeight: "600", fontSize: 14 }}>Retry</Text>
                    </Pressable>
                  )}
                </>
              )}
            </View>
          ) : (
            filteredProducts.map((product) => {
              const qty = getCartQty(product.id);
              const isBusRoute = vendor.id === TRAVEL_VENDOR_ID && product.id.startsWith("bus");
              const travelSubCat: TravelSubCat = (() => {
                if (isBusRoute) return "bus";
                const fromSubCat = getTravelSubCat(vendor.subCategoryId);
                if (fromSubCat) return fromSubCat;
                if (FLIGHT_VENDOR_IDS.includes(vendor.id)) return "flight";
                if (TRAIN_VENDOR_IDS.includes(vendor.id)) return "train";
                return null;
              })();
              return (
                <ProductCard
                  key={product.id}
                  product={product}
                  vendor={vendor}
                  qty={qty}
                  isBusRoute={isBusRoute}
                  travelSubCat={travelSubCat}
                  onAdd={() => {
                    addToCart({
                      product,
                      quantity: 1,
                      vendorId: vendor.id,
                      vendorName: vendor.name,
                    });
                  }}
                  onIncrement={() => updateCartQuantity(product.id, qty + 1)}
                  onDecrement={() => {
                    if (qty <= 1) {
                      removeFromCart(product.id);
                    } else {
                      updateCartQuantity(product.id, qty - 1);
                    }
                  }}
                />
              );
            })
          )}
        </View>

        <View style={rstyles.section}>
          <View style={rstyles.sectionHeader}>
            <Text style={rstyles.sectionTitle}>Ratings & Reviews</Text>
            <Pressable
              style={rstyles.writeBtn}
              onPress={() => router.push(`/write-review?vendorId=${vendor.id}` as any)}
            >
              <Ionicons name="create-outline" size={16} color={Colors.primary} />
              <Text style={rstyles.writeBtnText}>Write Review</Text>
            </Pressable>
          </View>

          {storeReviews.length > 0 ? (
            <>
              <View style={rstyles.summaryRow}>
                <View style={rstyles.summaryLeft}>
                  <Text style={rstyles.avgRating}>{avgRating}</Text>
                  <View style={rstyles.starsRow}>
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Ionicons
                        key={s}
                        name={s <= Math.round(Number(avgRating)) ? "star" : "star-outline"}
                        size={16}
                        color={Colors.warning}
                      />
                    ))}
                  </View>
                  <Text style={rstyles.reviewCount}>{storeReviews.length} {storeReviews.length === 1 ? "review" : "reviews"}</Text>
                </View>
                <View style={rstyles.barsCol}>
                  {[5, 4, 3, 2, 1].map((star, idx) => (
                    <View key={star} style={rstyles.barRow}>
                      <Text style={rstyles.barLabel}>{star}</Text>
                      <Ionicons name="star" size={10} color={Colors.warning} />
                      <View style={rstyles.barTrack}>
                        <View style={[rstyles.barFill, { width: `${storeReviews.length > 0 ? (ratingCounts[idx] / storeReviews.length) * 100 : 0}%` }]} />
                      </View>
                      <Text style={rstyles.barCount}>{ratingCounts[idx]}</Text>
                    </View>
                  ))}
                </View>
              </View>

              {storeReviews.slice(0, 3).map((review) => (
                <StoreReviewCard
                  key={review.id}
                  review={review}
                  onHelpful={() => markReviewHelpful(review.id)}
                  onPhotoPress={openGallery}
                  vendorName={vendor.name}
                />
              ))}
              {storeReviews.length > 3 && (
                <Pressable
                  style={rstyles.seeAllBtn}
                  onPress={() => router.push(`/all-reviews?vendorId=${vendor.id}` as any)}
                >
                  <Text style={rstyles.seeAllText}>See All {storeReviews.length} Reviews</Text>
                  <Ionicons name="arrow-forward" size={16} color={Colors.primary} />
                </Pressable>
              )}
            </>
          ) : (
            <View style={rstyles.emptyState}>
              <Ionicons name="chatbubble-outline" size={36} color={Colors.textLight} />
              <Text style={rstyles.emptyText}>No reviews yet</Text>
              <Text style={rstyles.emptyHint}>Be the first to review this store</Text>
            </View>
          )}
        </View>
      </ScrollView>

      {cartCount > 0 && (
        <View style={[styles.cartBarOuter, { paddingBottom: bottomInset + 10 }]}>
          <Pressable
            style={styles.cartBar}
            onPress={() => router.push("/(customer)/cart" as any)}
          >
            <View style={styles.cartBarLeft}>
              <View style={styles.cartBadge}>
                <Text style={styles.cartBadgeText}>{cartCount}</Text>
              </View>
              <View>
                <Text style={styles.cartBarLabel}>{cartCount} {cartCount === 1 ? "item" : "items"} added</Text>
                <Text style={styles.cartBarTotal}>{"\u20B9"}{cartTotal}</Text>
              </View>
            </View>
            <View style={styles.cartBarRight}>
              <Text style={styles.cartBarAction}>View Cart</Text>
              <Ionicons name="arrow-forward" size={18} color="#FFF" />
            </View>
          </Pressable>
        </View>
      )}

      <Modal visible={galleryVisible} transparent animationType="fade" onRequestClose={() => setGalleryVisible(false)}>
        <View style={rstyles.galleryOverlay}>
          <Pressable style={[rstyles.galleryClose, { top: topInset + 10 }]} onPress={() => setGalleryVisible(false)}>
            <Ionicons name="close" size={28} color="#FFF" />
          </Pressable>
          <Text style={[rstyles.galleryCounter, { top: topInset + 16 }]}>{galleryIndex + 1} / {galleryPhotos.length}</Text>
          <ScrollView
            horizontal pagingEnabled showsHorizontalScrollIndicator={false}
            contentOffset={{ x: galleryIndex * width, y: 0 }}
            onMomentumScrollEnd={(e) => setGalleryIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
          >
            {galleryPhotos.map((uri, i) => (
              <View key={i} style={{ width, justifyContent: "center", alignItems: "center" }}>
                <Image source={{ uri: uri.replace("w=200", "w=800") }} style={rstyles.galleryImage} contentFit="contain" accessibilityLabel="Store photo" />
              </View>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  heroContainer: { height: 260, position: "relative", backgroundColor: Colors.secondary },
  heroImage: { width: "100%", height: "100%" },
  heroOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.5)" },
  heroTopRow: {
    position: "absolute",
    left: 16,
    right: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    zIndex: 10,
  },
  heroTopRight: { flexDirection: "row", gap: 8 },
  heroBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  openBadge: {
    position: "absolute",
    top: 12,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(16,185,129,0.9)",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    gap: 5,
    zIndex: 5,
  },
  openDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#FFF" },
  openText: { fontFamily: "Poppins_600SemiBold", fontSize: 11, color: "#FFF" },
  heroInfo: { backgroundColor: Colors.surface, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 },
  heroName: { fontFamily: "Poppins_700Bold", fontSize: 22, color: Colors.text },
  heroDesc: { fontFamily: "Poppins_400Regular", fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  tagRow: { flexDirection: "row", gap: 8, marginTop: 8, flexWrap: "wrap" },
  tag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.primary + "15",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  tagText: { fontFamily: "Poppins_500Medium", fontSize: 11, color: Colors.primary },
  vendorActionsRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 12 },
  chatVendorBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: Colors.primary, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 9 },
  chatVendorText: { fontFamily: "Poppins_600SemiBold", fontSize: 12, color: "#FFF" },
  callVendorBtn: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 9, borderWidth: 1.5, borderColor: Colors.primary },
  callVendorText: { fontFamily: "Poppins_600SemiBold", fontSize: 12, color: Colors.primary },

  stickyHeader: { backgroundColor: Colors.background, paddingTop: 4, zIndex: 10 },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF",
    borderRadius: 12,
    marginHorizontal: 20,
    marginBottom: 8,
    paddingHorizontal: 12,
    height: 42,
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  searchInput: { flex: 1, fontFamily: "Poppins_400Regular", fontSize: 14, color: Colors.text },
  categoryTabList: { paddingHorizontal: 16, paddingBottom: 10, gap: 8 },
  categoryTab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  categoryTabActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  categoryTabText: { fontFamily: "Poppins_500Medium", fontSize: 13, color: Colors.textSecondary },
  categoryTabTextActive: { color: "#FFF" },

  infoRow: {
    flexDirection: "row",
    paddingHorizontal: 20,
    gap: 10,
    marginTop: 10,
    marginBottom: 12,
  },
  infoChip: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FFF",
    borderRadius: 14,
    padding: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  infoChipValue: { fontFamily: "Poppins_600SemiBold", fontSize: 12, color: Colors.text },
  infoChipLabel: { fontFamily: "Poppins_400Regular", fontSize: 10, color: Colors.textSecondary },

  locationSection: {
    marginHorizontal: 20,
    marginBottom: 12,
    backgroundColor: "#FFF",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#F0F1F5",
  },
  locationHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 12,
  },
  locationIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.primary + "12",
    alignItems: "center",
    justifyContent: "center",
  },
  locationTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
    color: Colors.secondary,
  },
  locationAddress: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
    lineHeight: 18,
  },
  extrasContainer: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    gap: 10,
  },
  extrasRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  extrasText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    flex: 1,
  },
  contactActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  contactBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#E8F5E9",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  contactBtnText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 13,
  },
  mapPreview: {
    height: 120,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#E8F5E9",
    marginBottom: 12,
  },
  mapImage: {
    width: "100%",
    height: "100%",
  },
  mapOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(11,30,61,0.35)",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  mapPinDot: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "#FFF",
  },
  mapOverlayText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 12,
    color: "#FFF",
  },
  locationActions: {
    flexDirection: "row",
    gap: 10,
  },
  directionsBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#10B981",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    gap: 6,
    flex: 1,
  },
  directionsBtnText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 13,
    color: "#FFF",
  },
  shareLocationBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.primary + "10",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    gap: 6,
    flex: 1,
  },
  shareLocationText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 13,
    color: Colors.primary,
  },
  offerBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.primary + "0D",
    borderWidth: 1,
    borderColor: Colors.primary + "25",
    borderRadius: 14,
    marginHorizontal: 20,
    padding: 14,
    gap: 10,
    marginBottom: 10,
  },
  offerIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.primary + "15",
    alignItems: "center",
    justifyContent: "center",
  },
  offerTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: Colors.text },
  offerCode: { fontFamily: "Poppins_500Medium", fontSize: 11, color: Colors.primary, marginTop: 1 },

  menuSection: { paddingHorizontal: 20, marginTop: 8 },
  menuHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  menuTitle: { fontFamily: "Poppins_700Bold", fontSize: 18, color: Colors.secondary },
  menuCount: { fontFamily: "Poppins_500Medium", fontSize: 13, color: Colors.textSecondary },

  emptyState: { alignItems: "center", paddingVertical: 40 },
  emptyText: { fontFamily: "Poppins_500Medium", fontSize: 14, color: Colors.textSecondary, marginTop: 10 },

  productCard: {
    flexDirection: "row",
    backgroundColor: "#FFF",
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  productInfo: { flex: 1, paddingRight: 12, justifyContent: "center" },
  productName: { fontFamily: "Poppins_600SemiBold", fontSize: 15, color: Colors.text },
  productDesc: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary, marginTop: 4, lineHeight: 18 },
  priceRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 },
  productPrice: { fontFamily: "Poppins_700Bold", fontSize: 17, color: Colors.primary },
  originalPrice: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: Colors.textLight,
    textDecorationLine: "line-through" as const,
  },
  discountTag: {
    backgroundColor: Colors.success + "18",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  discountTagText: { fontFamily: "Poppins_600SemiBold", fontSize: 10, color: Colors.success },

  productRight: { alignItems: "center", gap: 10 },
  productImageContainer: { position: "relative" },
  productImage: { width: 100, height: 100, borderRadius: 14 },

  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  addBtnText: { fontFamily: "Poppins_700Bold", fontSize: 13, color: "#FFF" },

  busRouteInfo: { flexDirection: "row" as const, alignItems: "center" as const, gap: 8, marginTop: 4, marginBottom: 2 },
  busRouteChip: { flexDirection: "row" as const, alignItems: "center" as const, gap: 3, backgroundColor: "#EFF6FF", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  busRouteChipText: { fontFamily: "Poppins_500Medium", fontSize: 10, color: "#3B82F6" },
  busSeatsAvail: { fontFamily: "Poppins_500Medium", fontSize: 10, color: "#10B981" },
  perSeatText: { fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textLight, marginLeft: 2 },

  qtyControl: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.primary + "12",
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    gap: 0,
  },
  qtyBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  qtyValue: {
    fontFamily: "Poppins_700Bold",
    fontSize: 15,
    color: Colors.primary,
    minWidth: 24,
    textAlign: "center" as const,
  },

  cartBarOuter: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingTop: 10,
    backgroundColor: "transparent",
  },
  cartBar: {
    backgroundColor: Colors.primary,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 16,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  cartBarLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  cartBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  cartBadgeText: { fontFamily: "Poppins_700Bold", fontSize: 14, color: "#FFF" },
  cartBarLabel: { fontFamily: "Poppins_400Regular", fontSize: 11, color: "rgba(255,255,255,0.85)" },
  cartBarTotal: { fontFamily: "Poppins_700Bold", fontSize: 17, color: "#FFF" },
  cartBarRight: { flexDirection: "row", alignItems: "center", gap: 6 },
  cartBarAction: { fontFamily: "Poppins_600SemiBold", fontSize: 15, color: "#FFF" },
  notFoundWrap: { flex: 1 },
  notFoundBack: { width: 40, height: 40, borderRadius: 12, backgroundColor: "#F0F0F0", alignItems: "center" as const, justifyContent: "center" as const, marginLeft: 16, marginTop: 12 },
  notFoundContent: { flex: 1, alignItems: "center" as const, justifyContent: "center" as const, paddingHorizontal: 40 },
  notFoundTitle: { fontFamily: "Poppins_700Bold", fontSize: 20, color: Colors.text, marginTop: 16, textAlign: "center" as const },
  notFoundDesc: { fontFamily: "Poppins_400Regular", fontSize: 14, color: Colors.textSecondary, textAlign: "center" as const, marginTop: 8, lineHeight: 20 },
  notFoundBtn: { flexDirection: "row" as const, alignItems: "center" as const, gap: 8, backgroundColor: Colors.primary, paddingVertical: 12, paddingHorizontal: 24, borderRadius: 12, marginTop: 24 },
  notFoundBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: "#FFF" },
});

const rstyles = StyleSheet.create({
  section: { paddingHorizontal: 20, marginTop: 24, marginBottom: 12 },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  sectionTitle: { fontFamily: "Poppins_700Bold", fontSize: 18, color: Colors.secondary },
  writeBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: Colors.primary + "12", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  writeBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 12, color: Colors.primary },
  summaryRow: { flexDirection: "row", backgroundColor: "#FFF", borderRadius: 16, padding: 16, gap: 20, marginBottom: 16, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  summaryLeft: { alignItems: "center", justifyContent: "center", minWidth: 80 },
  avgRating: { fontFamily: "Poppins_700Bold", fontSize: 36, color: Colors.secondary },
  starsRow: { flexDirection: "row", gap: 2, marginTop: 4 },
  reviewCount: { fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textSecondary, marginTop: 4 },
  barsCol: { flex: 1, justifyContent: "center", gap: 4 },
  barRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  barLabel: { fontFamily: "Poppins_500Medium", fontSize: 11, color: Colors.textSecondary, width: 12, textAlign: "right" as const },
  barTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: Colors.borderLight },
  barFill: { height: 6, borderRadius: 3, backgroundColor: Colors.warning },
  barCount: { fontFamily: "Poppins_500Medium", fontSize: 11, color: Colors.textSecondary, width: 18 },
  card: { backgroundColor: "#FFF", borderRadius: 14, padding: 14, marginBottom: 12, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.primary + "18", alignItems: "center", justifyContent: "center" },
  avatarText: { fontFamily: "Poppins_700Bold", fontSize: 15, color: Colors.primary },
  userName: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: Colors.text },
  timeText: { fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textSecondary },
  ratingBadge: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: Colors.success, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3 },
  ratingBadgeText: { fontFamily: "Poppins_700Bold", fontSize: 12, color: "#FFF" },
  comment: { fontFamily: "Poppins_400Regular", fontSize: 13, color: Colors.text, lineHeight: 20 },
  photosRow: { marginTop: 10 },
  photo: { width: 80, height: 80, borderRadius: 12, marginRight: 8 },
  productTag: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: Colors.background, borderRadius: 10, padding: 8, marginBottom: 10 },
  productTagImg: { width: 28, height: 28, borderRadius: 6 },
  productTagName: { flex: 1, fontFamily: "Poppins_500Medium", fontSize: 12, color: Colors.text },
  vendorReplyBox: { backgroundColor: Colors.primary + "08", borderLeftWidth: 3, borderLeftColor: Colors.primary, borderRadius: 8, padding: 10, marginTop: 10 },
  vendorReplyHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 },
  vendorReplyLabel: { fontFamily: "Poppins_600SemiBold", fontSize: 11, color: Colors.primary },
  vendorReplyText: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.text, lineHeight: 18 },
  helpfulBtn: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.borderLight },
  helpfulText: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary },
  seeAllBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 14, backgroundColor: Colors.primary + "08", borderRadius: 12, marginTop: 4 },
  seeAllText: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: Colors.primary },
  emptyState: { alignItems: "center", paddingVertical: 30 },
  emptyText: { fontFamily: "Poppins_600SemiBold", fontSize: 15, color: Colors.textSecondary, marginTop: 10 },
  emptyHint: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textLight, marginTop: 4 },
  galleryOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.95)", justifyContent: "center" },
  galleryClose: { position: "absolute", right: 16, zIndex: 10, width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  galleryCounter: { position: "absolute", left: 0, right: 0, textAlign: "center", fontFamily: "Poppins_600SemiBold", fontSize: 14, color: "rgba(255,255,255,0.8)", zIndex: 10 },
  galleryImage: { width: width - 32, height: width - 32 },
});

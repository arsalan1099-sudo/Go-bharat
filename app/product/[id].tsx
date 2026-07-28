import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Platform, Modal, Dimensions, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useApp } from "@/lib/store";
import { products, vendors, busRoutes, TRAVEL_VENDOR_ID } from "@/lib/data";
import { getApiUrl } from "@/lib/query-client";
import { Product } from "@/lib/types";

const { width: SCREEN_W } = Dimensions.get("window");

function ReviewCard({ review, onHelpful, onPhotoPress }: { review: any; onHelpful: () => void; onPhotoPress: (photos: string[], idx: number) => void }) {
  const vendor = vendors.find((v) => v.id === review.vendorId);
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
            <Text style={rstyles.vendorReplyLabel}>{vendor?.name || "Vendor"} replied</Text>
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

export default function ProductDetailScreen() {
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  const insets = useSafeAreaInsets();
  const { addToCart, reviews, markReviewHelpful, liveVendors } = useApp();
  const [quantity, setQuantity] = useState(1);
  const [galleryVisible, setGalleryVisible] = useState(false);
  const [galleryPhotos, setGalleryPhotos] = useState<string[]>([]);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [dbProduct, setDbProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(false);
  const topInset = Platform.OS === "web" ? 67 : insets.top;

  const staticProduct = products.find((p) => p.id === id);
  const product = staticProduct || dbProduct;
  const allVendors = liveVendors;
  const vendor = product ? allVendors.find((v) => v.id === product.vendorId) : null;

  useEffect(() => {
    if (staticProduct || !id || id === "undefined" || id === "null") return;
    setLoading(true);
    const baseUrl = getApiUrl();
    fetch(new URL(`/api/product/${id}`, baseUrl).toString())
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data && !data.error) {
          const safeImage = (data.image && !data.image.startsWith("blob:"))
            ? data.image
            : "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400";
          setDbProduct({
            id: data.id,
            vendorId: data.vendorId,
            name: data.name,
            description: data.description || "",
            price: parseFloat(data.price),
            originalPrice: data.originalPrice ? parseFloat(data.originalPrice) : undefined,
            image: safeImage,
            isAvailable: data.isAvailable ?? true,
            category: data.category || "",
            subCategory: data.category || "",
          } as Product);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id, staticProduct]);

  const isBusRoute = product && product.id.startsWith("bus") && product.vendorId === TRAVEL_VENDOR_ID;
  const busRoute = isBusRoute ? busRoutes.find((r) => r.productId === product!.id) : null;

  useEffect(() => {
    if (isBusRoute && busRoute) {
      router.replace({ pathname: "/bus-booking" as any, params: { routeId: busRoute.id } });
    }
  }, [isBusRoute, busRoute]);

  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: topInset, justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (!product) {
    return (
      <View style={[styles.container, { paddingTop: topInset }]}>
        <View style={styles.notFoundWrap}>
          <Pressable onPress={() => router.back()} style={styles.notFoundBack}>
            <Ionicons name="arrow-back" size={22} color={Colors.text} />
          </Pressable>
          <View style={styles.notFoundContent}>
            <Ionicons name="cube-outline" size={64} color={Colors.textLight} />
            <Text style={styles.notFoundTitle}>Product Not Found</Text>
            <Text style={styles.notFoundDesc}>This product may have been removed or is no longer available.</Text>
            <Pressable style={styles.notFoundBtn} onPress={() => router.back()}>
              <Ionicons name="arrow-back" size={16} color="#FFF" />
              <Text style={styles.notFoundBtnText}>Go Back</Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }
  if (isBusRoute) return null;

  const productReviews = reviews.filter((r) => r.productId === id);
  const avgRating = productReviews.length > 0
    ? (productReviews.reduce((s, r) => s + r.rating, 0) / productReviews.length).toFixed(1)
    : "0";
  const ratingCounts = [5, 4, 3, 2, 1].map((star) => productReviews.filter((r) => r.rating === star).length);

  const discount = product.originalPrice
    ? Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)
    : 0;

  const openGallery = (photos: string[], idx: number) => {
    setGalleryPhotos(photos);
    setGalleryIndex(idx);
    setGalleryVisible(true);
  };

  const handleAddToCart = () => {
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
    addToCart({
      product,
      quantity,
      vendorId: vendor?.id || product.vendorId,
      vendorName: vendor?.name || "Store",
    });
    router.back();
  };

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
        <View style={styles.imageContainer}>
          <Image source={{ uri: product.image }} style={styles.productImage} contentFit="cover" accessibilityLabel={product.name} />
          <Pressable style={[styles.backBtn, { top: topInset + 4 }]} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={22} color="#FFF" />
          </Pressable>
          {discount > 0 && (
            <View style={styles.discountBadge}>
              <Text style={styles.discountText}>{discount}% OFF</Text>
            </View>
          )}
        </View>

        <View style={styles.infoSection}>
          <Text style={styles.productName}>{product.name}</Text>
          <View style={styles.priceRow}>
            <Text style={styles.price}>{"\u20B9"}{product.price}</Text>
            {product.originalPrice && (
              <Text style={styles.originalPrice}>{"\u20B9"}{product.originalPrice}</Text>
            )}
          </View>
          <Text style={styles.description}>{product.description}</Text>

          <Pressable style={styles.vendorRow} onPress={() => { const vid = vendor?.id || product.vendorId; if (vid) router.push(`/store/${vid}` as any); }}>
            <View style={styles.vendorIcon}>
              <Ionicons name="storefront" size={18} color={Colors.primary} />
            </View>
            <View style={styles.vendorInfo}>
              <Text style={styles.vendorName}>{vendor?.name || "Store"}</Text>
              <View style={styles.vendorMeta}>
                <Ionicons name="star" size={12} color={Colors.warning} />
                <Text style={styles.vendorRating}>{vendor?.rating ?? "4.0"}</Text>
                <Text style={styles.vendorDelivery}>{vendor?.deliveryTime || "20-30 min"}</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.textLight} />
          </Pressable>
        </View>

        <View style={styles.qtySection}>
          <Text style={styles.qtyLabel}>Quantity</Text>
          <View style={styles.qtyControls}>
            <Pressable
              style={styles.qtyBtn}
              onPress={() => {
                if (quantity > 1) {
                  try { Haptics.selectionAsync(); } catch {}
                  setQuantity(quantity - 1);
                }
              }}
            >
              <Ionicons name="remove" size={22} color={quantity > 1 ? Colors.primary : Colors.textLight} />
            </Pressable>
            <Text style={styles.qtyValue}>{quantity}</Text>
            <Pressable
              style={styles.qtyBtn}
              onPress={() => {
                try { Haptics.selectionAsync(); } catch {}
                setQuantity(quantity + 1);
              }}
            >
              <Ionicons name="add" size={22} color={Colors.primary} />
            </Pressable>
          </View>
        </View>

        <View style={rstyles.section}>
          <View style={rstyles.sectionHeader}>
            <Text style={rstyles.sectionTitle}>Ratings & Reviews</Text>
            <Pressable
              style={rstyles.writeBtn}
              onPress={() => router.push(`/write-review?productId=${product.id}&vendorId=${vendor?.id || product.vendorId}` as any)}
            >
              <Ionicons name="create-outline" size={16} color={Colors.primary} />
              <Text style={rstyles.writeBtnText}>Write Review</Text>
            </Pressable>
          </View>

          {productReviews.length > 0 ? (
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
                  <Text style={rstyles.reviewCount}>{productReviews.length} {productReviews.length === 1 ? "review" : "reviews"}</Text>
                </View>
                <View style={rstyles.barsCol}>
                  {[5, 4, 3, 2, 1].map((star, idx) => (
                    <View key={star} style={rstyles.barRow}>
                      <Text style={rstyles.barLabel}>{star}</Text>
                      <Ionicons name="star" size={10} color={Colors.warning} />
                      <View style={rstyles.barTrack}>
                        <View style={[rstyles.barFill, { width: `${productReviews.length > 0 ? (ratingCounts[idx] / productReviews.length) * 100 : 0}%` }]} />
                      </View>
                      <Text style={rstyles.barCount}>{ratingCounts[idx]}</Text>
                    </View>
                  ))}
                </View>
              </View>

              {productReviews.slice(0, 3).map((review) => (
                <ReviewCard
                  key={review.id}
                  review={review}
                  onHelpful={() => markReviewHelpful(review.id)}
                  onPhotoPress={openGallery}
                />
              ))}
              {productReviews.length > 3 && (
                <Pressable
                  style={rstyles.seeAllBtn}
                  onPress={() => router.push(`/all-reviews?productId=${product.id}&vendorId=${vendor?.id || product.vendorId}` as any)}
                >
                  <Text style={rstyles.seeAllText}>See All {productReviews.length} Reviews</Text>
                  <Ionicons name="arrow-forward" size={16} color={Colors.primary} />
                </Pressable>
              )}
            </>
          ) : (
            <View style={rstyles.emptyState}>
              <Ionicons name="chatbubble-outline" size={36} color={Colors.textLight} />
              <Text style={rstyles.emptyText}>No reviews yet</Text>
              <Text style={rstyles.emptyHint}>Be the first to review this product</Text>
            </View>
          )}
        </View>
      </ScrollView>

      <Modal visible={galleryVisible} transparent animationType="fade" onRequestClose={() => setGalleryVisible(false)}>
        <View style={rstyles.galleryOverlay}>
          <Pressable style={[rstyles.galleryClose, { top: topInset + 10 }]} onPress={() => setGalleryVisible(false)}>
            <Ionicons name="close" size={28} color="#FFF" />
          </Pressable>
          <Text style={[rstyles.galleryCounter, { top: topInset + 16 }]}>{galleryIndex + 1} / {galleryPhotos.length}</Text>
          <ScrollView
            horizontal pagingEnabled showsHorizontalScrollIndicator={false}
            contentOffset={{ x: galleryIndex * SCREEN_W, y: 0 }}
            onMomentumScrollEnd={(e) => setGalleryIndex(Math.round(e.nativeEvent.contentOffset.x / SCREEN_W))}
          >
            {galleryPhotos.map((uri, i) => (
              <View key={i} style={{ width: SCREEN_W, justifyContent: "center", alignItems: "center" }}>
                <Image source={{ uri: uri.replace("w=200", "w=800") }} style={rstyles.galleryImage} contentFit="contain" accessibilityLabel="Product photo" />
              </View>
            ))}
          </ScrollView>
        </View>
      </Modal>

      <View style={[styles.bottomBar, { paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 10 }]}>
        <View>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalPrice}>{"\u20B9"}{product.price * quantity}</Text>
        </View>
        <Pressable style={styles.addToCartBtn} onPress={handleAddToCart}>
          <Ionicons name="cart" size={20} color="#FFF" />
          <Text style={styles.addToCartText}>Add to Cart</Text>
        </Pressable>
      </View>
    </View>
  );
}

const rstyles = StyleSheet.create({
  section: { marginHorizontal: 24, marginTop: 24 },
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
  galleryImage: { width: SCREEN_W - 32, height: SCREEN_W - 32 },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  notFoundWrap: { flex: 1 },
  notFoundBack: { width: 40, height: 40, borderRadius: 12, backgroundColor: "#F0F0F0", alignItems: "center", justifyContent: "center", marginLeft: 16, marginTop: 12 },
  notFoundContent: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 40 },
  notFoundTitle: { fontFamily: "Poppins_700Bold", fontSize: 20, color: Colors.text, marginTop: 16, textAlign: "center" },
  notFoundDesc: { fontFamily: "Poppins_400Regular", fontSize: 14, color: Colors.textSecondary, textAlign: "center", marginTop: 8, lineHeight: 20 },
  notFoundBtn: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: Colors.primary, paddingVertical: 12, paddingHorizontal: 24, borderRadius: 12, marginTop: 24 },
  notFoundBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: "#FFF" },
  imageContainer: { position: "relative" },
  productImage: { width: "100%", height: 300 },
  backBtn: {
    position: "absolute",
    left: 16,
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.3)",
    alignItems: "center",
    justifyContent: "center",
  },
  discountBadge: {
    position: "absolute",
    top: 16,
    right: 16,
    backgroundColor: Colors.error,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  discountText: { fontFamily: "Poppins_700Bold", fontSize: 13, color: "#FFF" },
  infoSection: { padding: 24 },
  productName: { fontFamily: "Poppins_700Bold", fontSize: 24, color: Colors.secondary },
  priceRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 8 },
  price: { fontFamily: "Poppins_700Bold", fontSize: 26, color: Colors.primary },
  originalPrice: {
    fontFamily: "Poppins_500Medium",
    fontSize: 18,
    color: Colors.textLight,
    textDecorationLine: "line-through" as const,
  },
  description: { fontFamily: "Poppins_400Regular", fontSize: 14, color: Colors.textSecondary, marginTop: 12, lineHeight: 22 },
  vendorRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF",
    borderRadius: 14,
    padding: 14,
    marginTop: 20,
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  vendorIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: Colors.primary + "12",
    alignItems: "center",
    justifyContent: "center",
  },
  vendorInfo: { flex: 1 },
  vendorName: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: Colors.text },
  vendorMeta: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  vendorRating: { fontFamily: "Poppins_500Medium", fontSize: 12, color: Colors.text },
  vendorDelivery: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary },
  qtySection: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: 24,
    backgroundColor: "#FFF",
    borderRadius: 14,
    padding: 16,
  },
  qtyLabel: { fontFamily: "Poppins_600SemiBold", fontSize: 16, color: Colors.secondary },
  qtyControls: { flexDirection: "row", alignItems: "center", gap: 16 },
  qtyBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  qtyValue: { fontFamily: "Poppins_700Bold", fontSize: 20, color: Colors.text, minWidth: 30, textAlign: "center" },
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#FFF",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 8,
  },
  totalLabel: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary },
  totalPrice: { fontFamily: "Poppins_700Bold", fontSize: 22, color: Colors.secondary },
  addToCartBtn: {
    backgroundColor: Colors.primary,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 14,
    paddingHorizontal: 28,
    paddingVertical: 14,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  addToCartText: { fontFamily: "Poppins_600SemiBold", fontSize: 15, color: "#FFF" },
});

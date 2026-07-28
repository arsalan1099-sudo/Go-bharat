import React, { useState, useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Platform, Modal, Dimensions, FlatList } from "react-native";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useApp } from "@/lib/store";
import { vendors, products } from "@/lib/data";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

type SortOption = "recent" | "helpful" | "highest" | "lowest";
type FilterOption = "all" | "5" | "4" | "3" | "2" | "1" | "photos";

export default function AllReviewsScreen() {
  const { vendorId, productId } = useLocalSearchParams<{ vendorId?: string; productId?: string }>();
  const insets = useSafeAreaInsets();
  const { reviews, markReviewHelpful } = useApp();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  const [sort, setSort] = useState<SortOption>("recent");
  const [filter, setFilter] = useState<FilterOption>("all");
  const [galleryVisible, setGalleryVisible] = useState(false);
  const [galleryPhotos, setGalleryPhotos] = useState<string[]>([]);
  const [galleryIndex, setGalleryIndex] = useState(0);

  const vendor = vendorId ? vendors.find((v) => v.id === vendorId) : null;
  const product = productId ? products.find((p) => p.id === productId) : null;
  const title = product ? product.name : vendor ? vendor.name : "Reviews";

  const allReviews = useMemo(() => {
    let filtered = reviews.filter((r) => {
      if (productId) return r.productId === productId;
      if (vendorId) return r.vendorId === vendorId;
      return true;
    });

    if (filter === "photos") {
      filtered = filtered.filter((r) => r.photos.length > 0);
    } else if (filter !== "all") {
      filtered = filtered.filter((r) => r.rating === parseInt(filter));
    }

    switch (sort) {
      case "helpful": return [...filtered].sort((a, b) => b.helpful - a.helpful);
      case "highest": return [...filtered].sort((a, b) => b.rating - a.rating);
      case "lowest": return [...filtered].sort((a, b) => a.rating - b.rating);
      default: return [...filtered].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
  }, [reviews, vendorId, productId, sort, filter]);

  const baseReviews = reviews.filter((r) => {
    if (productId) return r.productId === productId;
    if (vendorId) return r.vendorId === vendorId;
    return true;
  });
  const avgRating = baseReviews.length > 0
    ? (baseReviews.reduce((s, r) => s + r.rating, 0) / baseReviews.length).toFixed(1)
    : "0";
  const ratingCounts = [5, 4, 3, 2, 1].map((star) => baseReviews.filter((r) => r.rating === star).length);
  const withPhotos = baseReviews.filter((r) => r.photos.length > 0).length;

  const timeAgo = (date: string) => {
    const diff = Date.now() - new Date(date).getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days === 0) return "Today";
    if (days === 1) return "Yesterday";
    if (days < 30) return `${days}d ago`;
    return `${Math.floor(days / 30)}mo ago`;
  };

  const openGallery = (photos: string[], index: number) => {
    setGalleryPhotos(photos);
    setGalleryIndex(index);
    setGalleryVisible(true);
  };

  const sortOptions: { key: SortOption; label: string }[] = [
    { key: "recent", label: "Most Recent" },
    { key: "helpful", label: "Most Helpful" },
    { key: "highest", label: "Highest Rated" },
    { key: "lowest", label: "Lowest Rated" },
  ];

  const filterOptions: { key: FilterOption; label: string; count: number }[] = [
    { key: "all", label: "All", count: baseReviews.length },
    { key: "5", label: "5\u2605", count: ratingCounts[0] },
    { key: "4", label: "4\u2605", count: ratingCounts[1] },
    { key: "3", label: "3\u2605", count: ratingCounts[2] },
    { key: "2", label: "2\u2605", count: ratingCounts[3] },
    { key: "1", label: "1\u2605", count: ratingCounts[4] },
    { key: "photos", label: "With Photos", count: withPhotos },
  ];

  const renderReview = ({ item: review }: { item: typeof reviews[0] }) => {
    const reviewVendor = vendors.find((v) => v.id === review.vendorId);
    const reviewProduct = review.productId ? products.find((p) => p.id === review.productId) : null;
    const ratingColor = review.rating >= 4 ? Colors.success : review.rating >= 3 ? Colors.warning : Colors.error;

    return (
      <View style={styles.reviewCard}>
        <View style={styles.cardTop}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{review.userName.charAt(0)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.userName}>{review.userName}</Text>
            <Text style={styles.timeText}>{timeAgo(review.createdAt)}</Text>
          </View>
          <View style={[styles.ratingBadge, { backgroundColor: ratingColor }]}>
            <Ionicons name="star" size={12} color="#FFF" />
            <Text style={styles.ratingBadgeText}>{review.rating}</Text>
          </View>
        </View>

        {!productId && reviewProduct && (
          <Pressable style={styles.productTag} onPress={() => router.push(`/product/${reviewProduct.id}` as any)}>
            <Image source={{ uri: reviewProduct.image }} style={styles.productTagImg} contentFit="cover" accessibilityLabel={reviewProduct.name} />
            <Text style={styles.productTagName} numberOfLines={1}>{reviewProduct.name}</Text>
            <Ionicons name="chevron-forward" size={14} color={Colors.textLight} />
          </Pressable>
        )}

        <Text style={styles.comment}>{review.comment}</Text>

        {review.photos.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photosRow}>
            {review.photos.map((uri: string, i: number) => (
              <Pressable key={i} onPress={() => openGallery(review.photos, i)}>
                <Image source={{ uri }} style={styles.photo} contentFit="cover" accessibilityLabel="Review photo" />
                {review.photos.length > 1 && i === 0 && (
                  <View style={styles.photoCountBadge}>
                    <Ionicons name="images" size={10} color="#FFF" />
                    <Text style={styles.photoCountText}>{review.photos.length}</Text>
                  </View>
                )}
              </Pressable>
            ))}
          </ScrollView>
        )}

        {review.vendorReply && (
          <View style={styles.vendorReplyBox}>
            <View style={styles.vendorReplyHeader}>
              <Ionicons name="storefront" size={14} color={Colors.primary} />
              <Text style={styles.vendorReplyLabel}>{reviewVendor?.name || "Vendor"} replied</Text>
              {review.vendorReplyAt && <Text style={styles.vendorReplyTime}>{timeAgo(review.vendorReplyAt)}</Text>}
            </View>
            <Text style={styles.vendorReplyText}>{review.vendorReply}</Text>
          </View>
        )}

        <Pressable
          style={styles.helpfulBtn}
          onPress={() => {
            try { Haptics.selectionAsync(); } catch {}
            markReviewHelpful(review.id);
          }}
        >
          <Ionicons name="thumbs-up-outline" size={14} color={Colors.textSecondary} />
          <Text style={styles.helpfulText}>Helpful ({review.helpful})</Text>
        </Pressable>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: topInset + 10 }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.secondary} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle} numberOfLines={1}>Reviews</Text>
          <Text style={styles.headerSubtitle} numberOfLines={1}>{title}</Text>
        </View>
        <Pressable
          style={styles.writeBtn}
          onPress={() => router.push(`/write-review?${productId ? `productId=${productId}&` : ""}vendorId=${vendorId || ""}` as any)}
        >
          <Ionicons name="create-outline" size={16} color={Colors.primary} />
          <Text style={styles.writeBtnText}>Write</Text>
        </Pressable>
      </View>

      <FlatList
        data={allReviews}
        keyExtractor={(item) => item.id}
        renderItem={renderReview}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: bottomInset + 20 }}
        ListHeaderComponent={
          <>
            <View style={styles.summaryCard}>
              <View style={styles.summaryLeft}>
                <Text style={styles.avgRating}>{avgRating}</Text>
                <View style={styles.starsRow}>
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Ionicons key={s} name={s <= Math.round(Number(avgRating)) ? "star" : "star-outline"} size={16} color={Colors.warning} />
                  ))}
                </View>
                <Text style={styles.reviewCount}>{baseReviews.length} {baseReviews.length === 1 ? "review" : "reviews"}</Text>
              </View>
              <View style={styles.barsCol}>
                {[5, 4, 3, 2, 1].map((star, idx) => (
                  <Pressable key={star} style={styles.barRow} onPress={() => setFilter(filter === String(star) ? "all" : String(star) as FilterOption)}>
                    <Text style={styles.barLabel}>{star}</Text>
                    <Ionicons name="star" size={10} color={Colors.warning} />
                    <View style={styles.barTrack}>
                      <View style={[styles.barFill, { width: `${baseReviews.length > 0 ? (ratingCounts[idx] / baseReviews.length) * 100 : 0}%` }]} />
                    </View>
                    <Text style={styles.barCount}>{ratingCounts[idx]}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
              {filterOptions.map((f) => (
                <Pressable
                  key={f.key}
                  style={[styles.filterChip, filter === f.key && styles.filterChipActive]}
                  onPress={() => setFilter(f.key)}
                >
                  <Text style={[styles.filterChipText, filter === f.key && styles.filterChipTextActive]}>
                    {f.label} ({f.count})
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.sortRow}>
              {sortOptions.map((s) => (
                <Pressable
                  key={s.key}
                  style={[styles.sortChip, sort === s.key && styles.sortChipActive]}
                  onPress={() => setSort(s.key)}
                >
                  <Text style={[styles.sortChipText, sort === s.key && styles.sortChipTextActive]}>{s.label}</Text>
                </Pressable>
              ))}
            </ScrollView>

            <Text style={styles.resultCount}>{allReviews.length} {allReviews.length === 1 ? "review" : "reviews"}</Text>
          </>
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="chatbubble-outline" size={48} color={Colors.textLight} />
            <Text style={styles.emptyText}>No reviews found</Text>
            <Text style={styles.emptyHint}>Try changing your filters</Text>
          </View>
        }
      />

      <Modal visible={galleryVisible} transparent animationType="fade" onRequestClose={() => setGalleryVisible(false)}>
        <View style={styles.galleryOverlay}>
          <Pressable style={[styles.galleryClose, { top: topInset + 10 }]} onPress={() => setGalleryVisible(false)}>
            <Ionicons name="close" size={28} color="#FFF" />
          </Pressable>
          <Text style={[styles.galleryCounter, { top: topInset + 16 }]}>{galleryIndex + 1} / {galleryPhotos.length}</Text>
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            contentOffset={{ x: galleryIndex * SCREEN_WIDTH, y: 0 }}
            onMomentumScrollEnd={(e) => {
              const newIdx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
              setGalleryIndex(newIdx);
            }}
          >
            {galleryPhotos.map((uri, i) => (
              <View key={i} style={{ width: SCREEN_WIDTH, justifyContent: "center", alignItems: "center" }}>
                <Image source={{ uri: uri.replace("w=200", "w=800") }} style={styles.galleryImage} contentFit="contain" accessibilityLabel="Review photo" />
              </View>
            ))}
          </ScrollView>
          <View style={[styles.galleryDots, { bottom: bottomInset + 30 }]}>
            {galleryPhotos.map((_, i) => (
              <View key={i} style={[styles.galleryDot, i === galleryIndex && styles.galleryDotActive]} />
            ))}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 14,
    backgroundColor: "#FFF",
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
    gap: 12,
  },
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: Colors.background, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontFamily: "Poppins_700Bold", fontSize: 18, color: Colors.secondary },
  headerSubtitle: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary },
  writeBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: Colors.primary + "12", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  writeBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: Colors.primary },

  summaryCard: { flexDirection: "row", backgroundColor: "#FFF", borderRadius: 16, padding: 16, gap: 20, marginTop: 16, marginBottom: 8, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
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

  filterRow: { marginTop: 12, marginBottom: 4 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: "#FFF", borderWidth: 1, borderColor: Colors.border, marginRight: 8 },
  filterChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterChipText: { fontFamily: "Poppins_500Medium", fontSize: 12, color: Colors.textSecondary },
  filterChipTextActive: { color: "#FFF" },

  sortRow: { marginTop: 8, marginBottom: 4 },
  sortChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.borderLight, marginRight: 8 },
  sortChipActive: { backgroundColor: Colors.secondary + "12", borderColor: Colors.secondary },
  sortChipText: { fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textLight },
  sortChipTextActive: { color: Colors.secondary, fontFamily: "Poppins_600SemiBold" },

  resultCount: { fontFamily: "Poppins_500Medium", fontSize: 12, color: Colors.textSecondary, marginTop: 12, marginBottom: 8 },

  reviewCard: { backgroundColor: "#FFF", borderRadius: 14, padding: 14, marginBottom: 12, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.primary + "18", alignItems: "center", justifyContent: "center" },
  avatarText: { fontFamily: "Poppins_700Bold", fontSize: 16, color: Colors.primary },
  userName: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: Colors.text },
  timeText: { fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textSecondary },
  ratingBadge: { flexDirection: "row", alignItems: "center", gap: 3, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3 },
  ratingBadgeText: { fontFamily: "Poppins_700Bold", fontSize: 12, color: "#FFF" },

  productTag: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: Colors.background, borderRadius: 10, padding: 8, marginBottom: 10 },
  productTagImg: { width: 28, height: 28, borderRadius: 6 },
  productTagName: { flex: 1, fontFamily: "Poppins_500Medium", fontSize: 12, color: Colors.text },

  comment: { fontFamily: "Poppins_400Regular", fontSize: 13, color: Colors.text, lineHeight: 20 },

  photosRow: { marginTop: 10 },
  photo: { width: 80, height: 80, borderRadius: 12, marginRight: 8 },
  photoCountBadge: { position: "absolute", top: 4, right: 12, flexDirection: "row", alignItems: "center", gap: 2, backgroundColor: "rgba(0,0,0,0.6)", borderRadius: 8, paddingHorizontal: 5, paddingVertical: 2 },
  photoCountText: { fontFamily: "Poppins_600SemiBold", fontSize: 9, color: "#FFF" },

  vendorReplyBox: { backgroundColor: Colors.primary + "08", borderLeftWidth: 3, borderLeftColor: Colors.primary, borderRadius: 8, padding: 10, marginTop: 10 },
  vendorReplyHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 },
  vendorReplyLabel: { fontFamily: "Poppins_600SemiBold", fontSize: 11, color: Colors.primary, flex: 1 },
  vendorReplyTime: { fontFamily: "Poppins_400Regular", fontSize: 10, color: Colors.textLight },
  vendorReplyText: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.text, lineHeight: 18 },

  helpfulBtn: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.borderLight },
  helpfulText: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary },

  emptyState: { alignItems: "center", paddingVertical: 50 },
  emptyText: { fontFamily: "Poppins_600SemiBold", fontSize: 16, color: Colors.textSecondary, marginTop: 12 },
  emptyHint: { fontFamily: "Poppins_400Regular", fontSize: 13, color: Colors.textLight, marginTop: 4 },

  galleryOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.95)", justifyContent: "center" },
  galleryClose: { position: "absolute", right: 16, zIndex: 10, width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  galleryCounter: { position: "absolute", left: 0, right: 0, textAlign: "center", fontFamily: "Poppins_600SemiBold", fontSize: 14, color: "rgba(255,255,255,0.8)", zIndex: 10 },
  galleryImage: { width: SCREEN_WIDTH - 32, height: SCREEN_WIDTH - 32 },
  galleryDots: { position: "absolute", left: 0, right: 0, flexDirection: "row", justifyContent: "center", gap: 6 },
  galleryDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.3)" },
  galleryDotActive: { backgroundColor: "#FFF", width: 20 },
});

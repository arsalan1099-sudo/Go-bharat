import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  Alert,
  TextInput,
  Image,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useApp } from "@/lib/store";
import { vendors } from "@/lib/data";

type FilterTab = "All" | "5 Star" | "4 Star" | "3 Star" | "Low" | "With Photos" | "With Replies";

const TABS: FilterTab[] = ["All", "5 Star", "4 Star", "3 Star", "Low", "With Photos", "With Replies"];

export default function AdminReviewsScreen() {
  const insets = useSafeAreaInsets();
  const { reviews, deleteReview } = useApp();
  const [activeFilter, setActiveFilter] = useState<FilterTab>("All");
  const [searchQuery, setSearchQuery] = useState("");

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  const filteredReviews = useMemo(() => {
    let result = [...reviews];
    if (activeFilter === "5 Star") result = result.filter((r) => r.rating === 5);
    else if (activeFilter === "4 Star") result = result.filter((r) => r.rating === 4);
    else if (activeFilter === "3 Star") result = result.filter((r) => r.rating === 3);
    else if (activeFilter === "Low") result = result.filter((r) => r.rating <= 2);
    else if (activeFilter === "With Photos") result = result.filter((r) => r.photos && r.photos.length > 0);
    else if (activeFilter === "With Replies") result = result.filter((r) => !!r.vendorReply);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (r) =>
          r.userName.toLowerCase().includes(q) ||
          r.comment.toLowerCase().includes(q)
      );
    }
    return result;
  }, [reviews, activeFilter, searchQuery]);

  const avgRating = reviews.length > 0
    ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1)
    : "0";
  const fiveStar = reviews.filter((r) => r.rating === 5).length;
  const fourStar = reviews.filter((r) => r.rating === 4).length;
  const lowRating = reviews.filter((r) => r.rating <= 2).length;
  const withPhotos = reviews.filter((r) => r.photos && r.photos.length > 0).length;

  const handleDelete = (reviewId: string, userName: string) => {
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); } catch {}
    Alert.alert(
      "Delete Review",
      `Delete review by ${userName}? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            deleteReview(reviewId);
            try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
          },
        },
      ]
    );
  };

  const getVendorName = (vendorId: string) => {
    return vendors.find((v) => v.id === vendorId)?.name || "Unknown Vendor";
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  };

  const renderStars = (rating: number) => {
    return Array.from({ length: 5 }, (_, i) => (
      <Ionicons
        key={i}
        name={i < rating ? "star" : "star-outline"}
        size={14}
        color={i < rating ? "#FBBF24" : "#D1D5DB"}
      />
    ));
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ paddingBottom: bottomInset + 40 }} showsVerticalScrollIndicator={false}>
        <LinearGradient colors={["#0B1E3D", "#142F5E"]} style={[styles.header, { paddingTop: topInset + 12 }]}>
          <View style={styles.headerRow}>
            <Pressable onPress={() => router.back()} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={22} color="#FFF" />
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle}>Review Management</Text>
              <Text style={styles.headerSub}>{reviews.length} total reviews</Text>
            </View>
          </View>
        </LinearGradient>

        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: "#FFFBEB" }]}>
            <Ionicons name="star" size={20} color="#FBBF24" />
            <Text style={styles.statValue}>{avgRating}</Text>
            <Text style={styles.statLabel}>Avg Rating</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: "#F0FDF4" }]}>
            <Ionicons name="star" size={20} color="#10B981" />
            <Text style={styles.statValue}>{fiveStar}</Text>
            <Text style={styles.statLabel}>5 Star</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: "#EFF6FF" }]}>
            <Ionicons name="images" size={20} color="#3B82F6" />
            <Text style={styles.statValue}>{withPhotos}</Text>
            <Text style={styles.statLabel}>With Photos</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: "#FEF2F2" }]}>
            <Ionicons name="alert-circle" size={20} color="#EF4444" />
            <Text style={styles.statValue}>{lowRating}</Text>
            <Text style={styles.statLabel}>Low Rating</Text>
          </View>
        </View>

        <View style={styles.searchRow}>
          <Ionicons name="search" size={18} color={Colors.textLight} style={{ marginLeft: 12 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search reviews..."
            placeholderTextColor={Colors.textLight}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsRow}>
          {TABS.map((tab) => (
            <Pressable
              key={tab}
              style={[styles.tab, activeFilter === tab && styles.tabActive]}
              onPress={() => setActiveFilter(tab)}
            >
              <Text style={[styles.tabText, activeFilter === tab && styles.tabTextActive]}>{tab}</Text>
            </Pressable>
          ))}
        </ScrollView>

        <View style={styles.listSection}>
          <Text style={styles.resultCount}>{filteredReviews.length} reviews</Text>
          {filteredReviews.map((review) => (
            <View key={review.id} style={styles.reviewCard}>
              <View style={styles.reviewHeader}>
                <View style={styles.reviewUser}>
                  <View style={styles.avatarCircle}>
                    <Text style={styles.avatarText}>{review.userName.charAt(0)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.reviewUserName}>{review.userName}</Text>
                    <Text style={styles.reviewVendor}>{getVendorName(review.vendorId)}</Text>
                  </View>
                  <Pressable
                    style={styles.deleteBtn}
                    onPress={() => handleDelete(review.id, review.userName)}
                  >
                    <Ionicons name="trash-outline" size={18} color={Colors.error} />
                  </Pressable>
                </View>
              </View>

              <View style={styles.ratingRow}>
                <View style={styles.starsRow}>{renderStars(review.rating)}</View>
                <Text style={styles.reviewDate}>{formatDate(review.createdAt)}</Text>
              </View>

              <Text style={styles.reviewComment}>{review.comment}</Text>

              {review.photos && review.photos.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photosRow}>
                  {review.photos.map((photo, i) => (
                    <Image key={i} source={{ uri: photo }} style={styles.reviewPhoto} accessibilityLabel="Review photo" />
                  ))}
                </ScrollView>
              )}

              <View style={styles.reviewMeta}>
                <View style={styles.metaItem}>
                  <Ionicons name="thumbs-up" size={14} color={Colors.textSecondary} />
                  <Text style={styles.metaText}>{review.helpful} helpful</Text>
                </View>
                {review.vendorReply && (
                  <View style={[styles.metaItem, { backgroundColor: "#F0FDF4" }]}>
                    <Ionicons name="chatbubble" size={12} color="#10B981" />
                    <Text style={[styles.metaText, { color: "#10B981" }]}>Vendor replied</Text>
                  </View>
                )}
              </View>

              {review.vendorReply && (
                <View style={styles.replyBox}>
                  <Text style={styles.replyLabel}>Vendor Reply:</Text>
                  <Text style={styles.replyText}>{review.vendorReply}</Text>
                </View>
              )}
            </View>
          ))}

          {filteredReviews.length === 0 && (
            <View style={styles.emptyState}>
              <Ionicons name="star-outline" size={48} color={Colors.textLight} />
              <Text style={styles.emptyText}>No reviews found</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  header: { paddingHorizontal: 16, paddingBottom: 16, borderBottomLeftRadius: 20, borderBottomRightRadius: 20 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.12)", justifyContent: "center", alignItems: "center" },
  headerTitle: { fontSize: 20, fontWeight: "700", color: "#FFF" },
  headerSub: { fontSize: 13, color: "rgba(255,255,255,0.6)", marginTop: 2 },
  statsRow: { flexDirection: "row", paddingHorizontal: 12, gap: 8, marginTop: 16 },
  statCard: { flex: 1, borderRadius: 12, padding: 10, alignItems: "center", gap: 4 },
  statValue: { fontSize: 18, fontWeight: "700", color: Colors.text },
  statLabel: { fontSize: 10, color: Colors.textSecondary },
  searchRow: { flexDirection: "row", alignItems: "center", backgroundColor: "#FFF", borderRadius: 12, marginHorizontal: 16, marginTop: 16, borderWidth: 1, borderColor: "#E5E7EB" },
  searchInput: { flex: 1, paddingVertical: 10, paddingHorizontal: 8, fontSize: 14, color: Colors.text },
  tabsRow: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  tab: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: "#F1F5F9", borderWidth: 1, borderColor: "#E2E8F0" },
  tabActive: { backgroundColor: Colors.secondary, borderColor: Colors.secondary },
  tabText: { fontSize: 13, color: Colors.textSecondary, fontWeight: "500" },
  tabTextActive: { color: "#FFF" },
  listSection: { paddingHorizontal: 16 },
  resultCount: { fontSize: 13, color: Colors.textSecondary, marginBottom: 8 },
  reviewCard: { backgroundColor: "#FFF", borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: "#F1F5F9" },
  reviewHeader: { marginBottom: 8 },
  reviewUser: { flexDirection: "row", alignItems: "center", gap: 10 },
  avatarCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.primary + "18", justifyContent: "center", alignItems: "center" },
  avatarText: { fontSize: 16, fontWeight: "700", color: Colors.primary },
  reviewUserName: { fontSize: 14, fontWeight: "600", color: Colors.text },
  reviewVendor: { fontSize: 12, color: Colors.textSecondary },
  deleteBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: Colors.error + "10", justifyContent: "center", alignItems: "center" },
  ratingRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  starsRow: { flexDirection: "row", gap: 2 },
  reviewDate: { fontSize: 12, color: Colors.textLight },
  reviewComment: { fontSize: 13, color: Colors.text, lineHeight: 20, marginBottom: 8 },
  photosRow: { marginBottom: 8 },
  reviewPhoto: { width: 60, height: 60, borderRadius: 8, marginRight: 8 },
  reviewMeta: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 4 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#F8FAFC", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 },
  metaText: { fontSize: 11, color: Colors.textSecondary },
  replyBox: { backgroundColor: "#F0FDF4", borderRadius: 10, padding: 10, marginTop: 6 },
  replyLabel: { fontSize: 11, fontWeight: "600", color: "#059669", marginBottom: 4 },
  replyText: { fontSize: 12, color: "#065F46", lineHeight: 18 },
  emptyState: { alignItems: "center", justifyContent: "center", paddingVertical: 60, gap: 12 },
  emptyText: { fontSize: 15, color: Colors.textSecondary },
});

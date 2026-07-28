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

type FilterTab = "All" | "Featured" | "High Rated" | "With Photos";

const TABS: FilterTab[] = ["All", "Featured", "High Rated", "With Photos"];

export default function AdminStoriesScreen() {
  const insets = useSafeAreaInsets();
  const { customerStories, toggleStoryFeatured, deleteCustomerStory } = useApp();
  const [activeFilter, setActiveFilter] = useState<FilterTab>("All");
  const [searchQuery, setSearchQuery] = useState("");

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  const filteredStories = useMemo(() => {
    let result = [...customerStories];
    if (activeFilter === "Featured") result = result.filter((s) => s.isFeatured);
    else if (activeFilter === "High Rated") result = result.filter((s) => s.rating >= 4);
    else if (activeFilter === "With Photos") result = result.filter((s) => s.photos && s.photos.length > 0);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (s) =>
          s.userName.toLowerCase().includes(q) ||
          s.title.toLowerCase().includes(q) ||
          s.story.toLowerCase().includes(q)
      );
    }
    return result;
  }, [customerStories, activeFilter, searchQuery]);

  const totalStories = customerStories.length;
  const featuredCount = customerStories.filter((s) => s.isFeatured).length;
  const avgRating = totalStories > 0
    ? (customerStories.reduce((s, st) => s + st.rating, 0) / totalStories).toFixed(1)
    : "0";
  const totalLikes = customerStories.reduce((s, st) => s + st.likes, 0);

  const handleToggleFeatured = (storyId: string, userName: string, isFeatured: boolean) => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
    toggleStoryFeatured(storyId);
  };

  const handleDelete = (storyId: string, userName: string) => {
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); } catch {}
    Alert.alert(
      "Delete Story",
      `Delete story by ${userName}? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            deleteCustomerStory(storyId);
            try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
          },
        },
      ]
    );
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
        size={12}
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
              <Text style={styles.headerTitle}>Customer Stories</Text>
              <Text style={styles.headerSub}>{totalStories} total stories</Text>
            </View>
          </View>
        </LinearGradient>

        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: "#FDF2F8" }]}>
            <Ionicons name="heart" size={20} color="#F43F5E" />
            <Text style={styles.statValue}>{totalStories}</Text>
            <Text style={styles.statLabel}>Total</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: "#FFFBEB" }]}>
            <Ionicons name="star" size={20} color="#FBBF24" />
            <Text style={styles.statValue}>{featuredCount}</Text>
            <Text style={styles.statLabel}>Featured</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: "#F0FDF4" }]}>
            <Ionicons name="star-half" size={20} color="#10B981" />
            <Text style={styles.statValue}>{avgRating}</Text>
            <Text style={styles.statLabel}>Avg Rating</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: "#EFF6FF" }]}>
            <Ionicons name="thumbs-up" size={20} color="#3B82F6" />
            <Text style={styles.statValue}>{totalLikes}</Text>
            <Text style={styles.statLabel}>Total Likes</Text>
          </View>
        </View>

        <View style={styles.searchRow}>
          <Ionicons name="search" size={18} color={Colors.textLight} style={{ marginLeft: 12 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search stories..."
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
          <Text style={styles.resultCount}>{filteredStories.length} stories</Text>
          {filteredStories.map((story) => (
            <View key={story.id} style={[styles.storyCard, story.isFeatured && styles.storyFeatured]}>
              {story.isFeatured && (
                <View style={styles.featuredBadge}>
                  <Ionicons name="star" size={10} color="#FFF" />
                  <Text style={styles.featuredBadgeText}>Featured</Text>
                </View>
              )}

              <View style={styles.storyHeader}>
                <View style={styles.storyUser}>
                  <View style={styles.avatarCircle}>
                    <Text style={styles.avatarText}>{story.userName.charAt(0)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.storyUserName}>{story.userName}</Text>
                    <Text style={styles.storyLocation}>{story.location}</Text>
                  </View>
                  <View style={styles.starsRow}>{renderStars(story.rating)}</View>
                </View>
              </View>

              <Text style={styles.storyTitle}>{story.title}</Text>
              <Text style={styles.storyText} numberOfLines={3}>{story.story}</Text>

              {story.vendorName && (
                <View style={styles.taggedVendor}>
                  <Ionicons name="storefront" size={12} color={Colors.primary} />
                  <Text style={styles.taggedVendorText}>{story.vendorName}</Text>
                  {story.productName && <Text style={styles.taggedProduct}> - {story.productName}</Text>}
                </View>
              )}

              {story.photos && story.photos.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photosRow}>
                  {story.photos.map((photo, i) => (
                    <Image key={i} source={{ uri: photo }} style={styles.storyPhoto} accessibilityLabel="Story photo" />
                  ))}
                </ScrollView>
              )}

              <View style={styles.storyFooter}>
                <View style={styles.storyMeta}>
                  <Text style={styles.storyDate}>{formatDate(story.createdAt)}</Text>
                  <View style={styles.likesCount}>
                    <Ionicons name="heart" size={12} color="#F43F5E" />
                    <Text style={styles.likesText}>{story.likes}</Text>
                  </View>
                </View>
                <View style={styles.storyActions}>
                  <Pressable
                    style={[styles.actionBtn, story.isFeatured ? styles.unfeatBtn : styles.featBtn]}
                    onPress={() => handleToggleFeatured(story.id, story.userName, story.isFeatured)}
                  >
                    <Ionicons name={story.isFeatured ? "star" : "star-outline"} size={14} color={story.isFeatured ? "#F59E0B" : "#6B7280"} />
                    <Text style={[styles.actionBtnText, story.isFeatured && { color: "#F59E0B" }]}>
                      {story.isFeatured ? "Unfeature" : "Feature"}
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[styles.actionBtn, styles.deleteActionBtn]}
                    onPress={() => handleDelete(story.id, story.userName)}
                  >
                    <Ionicons name="trash-outline" size={14} color={Colors.error} />
                  </Pressable>
                </View>
              </View>
            </View>
          ))}

          {filteredStories.length === 0 && (
            <View style={styles.emptyState}>
              <Ionicons name="heart-outline" size={48} color={Colors.textLight} />
              <Text style={styles.emptyText}>No stories found</Text>
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
  storyCard: { backgroundColor: "#FFF", borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: "#F1F5F9" },
  storyFeatured: { borderColor: "#FDE68A", borderWidth: 1.5 },
  featuredBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#F59E0B", alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, marginBottom: 8 },
  featuredBadgeText: { fontSize: 10, fontWeight: "700", color: "#FFF" },
  storyHeader: { marginBottom: 8 },
  storyUser: { flexDirection: "row", alignItems: "center", gap: 10 },
  avatarCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#F43F5E18", justifyContent: "center", alignItems: "center" },
  avatarText: { fontSize: 16, fontWeight: "700", color: "#F43F5E" },
  storyUserName: { fontSize: 14, fontWeight: "600", color: Colors.text },
  storyLocation: { fontSize: 12, color: Colors.textSecondary },
  starsRow: { flexDirection: "row", gap: 1 },
  storyTitle: { fontSize: 15, fontWeight: "600", color: Colors.text, marginBottom: 4 },
  storyText: { fontSize: 13, color: Colors.textSecondary, lineHeight: 20, marginBottom: 8 },
  taggedVendor: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: Colors.primary + "10", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, alignSelf: "flex-start", marginBottom: 8 },
  taggedVendorText: { fontSize: 12, fontWeight: "500", color: Colors.primary },
  taggedProduct: { fontSize: 12, color: Colors.textSecondary },
  photosRow: { marginBottom: 8 },
  storyPhoto: { width: 60, height: 60, borderRadius: 8, marginRight: 8 },
  storyFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  storyMeta: { flexDirection: "row", alignItems: "center", gap: 12 },
  storyDate: { fontSize: 12, color: Colors.textLight },
  likesCount: { flexDirection: "row", alignItems: "center", gap: 4 },
  likesText: { fontSize: 12, color: "#F43F5E" },
  storyActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: "#F8FAFC", borderWidth: 1, borderColor: "#E2E8F0" },
  actionBtnText: { fontSize: 12, color: "#6B7280", fontWeight: "500" },
  featBtn: {},
  unfeatBtn: { backgroundColor: "#FFFBEB", borderColor: "#FDE68A" },
  deleteActionBtn: { backgroundColor: Colors.error + "08", borderColor: Colors.error + "20" },
  emptyState: { alignItems: "center", justifyContent: "center", paddingVertical: 60, gap: 12 },
  emptyText: { fontSize: 15, color: Colors.textSecondary },
});

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
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useApp } from "@/lib/store";

type FilterTab = "All" | "Vendor" | "Customer";

export default function ReelsModerationScreen() {
  const insets = useSafeAreaInsets();
  const { reels, deleteReel } = useApp();
  const [activeFilter, setActiveFilter] = useState<FilterTab>("All");
  const [searchQuery, setSearchQuery] = useState("");

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  const filteredReels = useMemo(() => {
    let result = reels;
    if (activeFilter === "Vendor") {
      result = result.filter((r) => r.userRole === "VENDOR");
    } else if (activeFilter === "Customer") {
      result = result.filter((r) => r.userRole === "CUSTOMER");
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (r) =>
          r.caption.toLowerCase().includes(q) ||
          r.userName.toLowerCase().includes(q)
      );
    }
    return result;
  }, [reels, activeFilter, searchQuery]);

  const totalLikes = reels.reduce((s, r) => s + r.likes, 0);
  const totalComments = reels.reduce((s, r) => s + r.comments, 0);
  const vendorReels = reels.filter((r) => r.userRole === "VENDOR").length;
  const customerReels = reels.filter((r) => r.userRole === "CUSTOMER").length;

  const handleDelete = (reelId: string, userName: string) => {
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); } catch {}
    Alert.alert(
      "Delete Reel",
      `Are you sure you want to delete this reel by ${userName}? This action cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            deleteReel(reelId);
            try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
          },
        },
      ]
    );
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  const filters: FilterTab[] = ["All", "Vendor", "Customer"];

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={["#0B1E3D", "#142F5E"]}
        style={[styles.header, { paddingTop: topInset + 12 }]}
      >
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color="#FFF" />
          </Pressable>
          <Text style={styles.headerTitle}>Reels Moderation</Text>
          <View style={{ width: 36 }} />
        </View>
      </LinearGradient>

      <ScrollView
        contentContainerStyle={{ paddingBottom: bottomInset + 20 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: Colors.primary + "18" }]}>
              <Ionicons name="videocam" size={18} color={Colors.primary} />
            </View>
            <Text style={styles.statValue}>{reels.length}</Text>
            <Text style={styles.statLabel}>Total Reels</Text>
          </View>
          <View style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: Colors.error + "18" }]}>
              <Ionicons name="heart" size={18} color={Colors.error} />
            </View>
            <Text style={styles.statValue}>{totalLikes}</Text>
            <Text style={styles.statLabel}>Total Likes</Text>
          </View>
          <View style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: Colors.info + "18" }]}>
              <Ionicons name="chatbubble" size={18} color={Colors.info} />
            </View>
            <Text style={styles.statValue}>{totalComments}</Text>
            <Text style={styles.statLabel}>Total Comments</Text>
          </View>
        </View>

        <View style={styles.splitStatRow}>
          <View style={[styles.splitCard, { borderLeftColor: Colors.primary }]}>
            <Ionicons name="storefront" size={16} color={Colors.primary} />
            <Text style={styles.splitValue}>{vendorReels}</Text>
            <Text style={styles.splitLabel}>Vendor Reels</Text>
          </View>
          <View style={[styles.splitCard, { borderLeftColor: Colors.info }]}>
            <Ionicons name="person" size={16} color={Colors.info} />
            <Text style={styles.splitValue}>{customerReels}</Text>
            <Text style={styles.splitLabel}>Customer Reels</Text>
          </View>
        </View>

        <View style={styles.filterRow}>
          {filters.map((tab) => (
            <Pressable
              key={tab}
              style={[
                styles.filterTab,
                activeFilter === tab && styles.filterTabActive,
              ]}
              onPress={() => {
                try { Haptics.selectionAsync(); } catch {}
                setActiveFilter(tab);
              }}
            >
              <Text
                style={[
                  styles.filterTabText,
                  activeFilter === tab && styles.filterTabTextActive,
                ]}
              >
                {tab}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.searchContainer}>
          <Ionicons name="search" size={18} color={Colors.textLight} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by caption or user name..."
            placeholderTextColor={Colors.textLight}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery("")}>
              <Ionicons name="close-circle" size={18} color={Colors.textLight} />
            </Pressable>
          )}
        </View>

        {filteredReels.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="videocam-off-outline" size={48} color={Colors.textLight} />
            <Text style={styles.emptyTitle}>No Reels Found</Text>
            <Text style={styles.emptySubtitle}>
              {searchQuery
                ? "Try adjusting your search or filters"
                : "No reels have been uploaded yet"}
            </Text>
          </View>
        ) : (
          filteredReels.map((reel) => (
            <View key={reel.id} style={styles.reelCard}>
              <View style={styles.reelHeader}>
                <View style={styles.reelUser}>
                  <View style={styles.avatarPlaceholder}>
                    <Ionicons
                      name={reel.userRole === "VENDOR" ? "storefront" : "person"}
                      size={18}
                      color={Colors.primary}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.userName}>{reel.userName}</Text>
                    <View
                      style={[
                        styles.roleBadge,
                        {
                          backgroundColor:
                            reel.userRole === "VENDOR"
                              ? Colors.primary + "18"
                              : Colors.info + "18",
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.roleBadgeText,
                          {
                            color:
                              reel.userRole === "VENDOR"
                                ? Colors.primary
                                : Colors.info,
                          },
                        ]}
                      >
                        {reel.userRole === "VENDOR" ? "Vendor" : "Customer"}
                      </Text>
                    </View>
                  </View>
                </View>
                <Pressable
                  style={styles.deleteBtn}
                  onPress={() => handleDelete(reel.id, reel.userName)}
                >
                  <Ionicons name="trash" size={16} color="#FFF" />
                  <Text style={styles.deleteBtnText}>DELETE</Text>
                </Pressable>
              </View>

              <Text style={styles.caption} numberOfLines={2}>
                {reel.caption}
              </Text>

              <View style={styles.reelStatsRow}>
                <View style={styles.reelStat}>
                  <Ionicons name="heart" size={14} color={Colors.error} />
                  <Text style={styles.reelStatText}>{reel.likes}</Text>
                </View>
                <View style={styles.reelStat}>
                  <Ionicons name="chatbubble" size={14} color={Colors.info} />
                  <Text style={styles.reelStatText}>{reel.comments}</Text>
                </View>
                <View style={styles.reelStat}>
                  <Ionicons name="share-social" size={14} color={Colors.success} />
                  <Text style={styles.reelStatText}>{reel.shares}</Text>
                </View>
              </View>

              {reel.taggedProducts.length > 0 && (
                <View style={styles.taggedRow}>
                  <Ionicons name="pricetag" size={13} color={Colors.primary} />
                  <Text style={styles.taggedText}>
                    {reel.taggedProducts.length} tagged product
                    {reel.taggedProducts.length > 1 ? "s" : ""}
                  </Text>
                </View>
              )}

              <Text style={styles.dateText}>{formatDate(reel.createdAt)}</Text>
            </View>
          ))
        )}
      </ScrollView>
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
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 18,
    color: "#FFF",
  },
  statsRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 10,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 12,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  statIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  statValue: {
    fontFamily: "Poppins_700Bold",
    fontSize: 18,
    color: Colors.text,
  },
  statLabel: {
    fontFamily: "Poppins_400Regular",
    fontSize: 10,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  splitStatRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingTop: 10,
    gap: 10,
  },
  splitCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderLeftWidth: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  splitValue: {
    fontFamily: "Poppins_700Bold",
    fontSize: 16,
    color: Colors.text,
  },
  splitLabel: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
  },
  filterRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 8,
  },
  filterTab: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.surfaceAlt,
  },
  filterTabActive: {
    backgroundColor: Colors.primary,
  },
  filterTabText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 13,
    color: Colors.textSecondary,
  },
  filterTabTextActive: {
    color: "#FFF",
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: 12,
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  searchInput: {
    flex: 1,
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: Colors.text,
    padding: 0,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 16,
    color: Colors.text,
    marginTop: 12,
  },
  emptySubtitle: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: "center",
    marginTop: 4,
  },
  reelCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    marginHorizontal: 16,
    marginTop: 12,
    padding: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  reelHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  reelUser: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  avatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primary + "15",
    alignItems: "center",
    justifyContent: "center",
  },
  userName: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
    color: Colors.text,
  },
  roleBadge: {
    alignSelf: "flex-start",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginTop: 2,
  },
  roleBadgeText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 10,
  },
  deleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.error,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    gap: 4,
  },
  deleteBtnText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 11,
    color: "#FFF",
  },
  caption: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: Colors.text,
    lineHeight: 19,
    marginBottom: 10,
  },
  reelStatsRow: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 8,
  },
  reelStat: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  reelStatText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 12,
    color: Colors.textSecondary,
  },
  taggedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginBottom: 6,
  },
  taggedText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 11,
    color: Colors.primary,
  },
  dateText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    color: Colors.textLight,
  },
});

import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  RefreshControl,
  Switch,
  ActivityIndicator,
  Alert,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import Animated, { FadeInDown } from "react-native-reanimated";
import { fetch as expoFetch } from "expo/fetch";
import Colors from "@/constants/colors";
import { useApp } from "@/lib/store";
import { getApiUrl, apiRequest } from "@/lib/query-client";

interface FeatureFlag {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  roles: string[];
  category: string;
  icon: string;
  updatedAt: string;
}

const CATEGORIES = ["All", "Core", "Social", "Commerce", "AI", "Visual"];

const CATEGORY_ICONS: Record<string, string> = {
  All: "apps",
  Core: "settings",
  Social: "people",
  Commerce: "cart",
  AI: "sparkles",
  Visual: "color-palette",
};

const ROLE_COLORS: Record<string, string> = {
  CUSTOMER: "#3B82F6",
  VENDOR: Colors.primary,
  DELIVERY: "#10B981",
  FRANCHISE: "#8B5CF6",
  MARKETING: "#EC4899",
  ADMIN: "#EF4444",
};

function FeatureFlagCard({
  flag,
  index,
  onToggle,
}: {
  flag: FeatureFlag;
  index: number;
  onToggle: (id: string, enabled: boolean) => void;
}) {
  return (
    <Animated.View entering={Platform.OS !== "web" ? FadeInDown.delay(index * 60).duration(400).springify() : undefined}>
      <View style={styles.flagCard}>
        <View style={styles.flagHeader}>
          <View style={[styles.flagIconWrap, { backgroundColor: (flag.enabled ? Colors.primary : Colors.textLight) + "15" }]}>
            <Ionicons name={flag.icon as any} size={22} color={flag.enabled ? Colors.primary : Colors.textLight} />
          </View>
          <View style={styles.flagInfo}>
            <Text style={styles.flagName}>{flag.name}</Text>
            <Text style={styles.flagDesc} numberOfLines={2}>{flag.description}</Text>
          </View>
          <Switch
            value={flag.enabled}
            onValueChange={(val) => onToggle(flag.id, val)}
            trackColor={{ false: "#E5E7EB", true: Colors.primary + "60" }}
            thumbColor={flag.enabled ? Colors.primary : "#D1D5DB"}
            ios_backgroundColor="#E5E7EB"
          />
        </View>

        <View style={styles.flagFooter}>
          <View style={styles.rolesRow}>
            {flag.roles.map((role) => (
              <View key={role} style={[styles.roleBadge, { backgroundColor: (ROLE_COLORS[role] || Colors.info) + "15" }]}>
                <View style={[styles.roleDot, { backgroundColor: ROLE_COLORS[role] || Colors.info }]} />
                <Text style={[styles.roleBadgeText, { color: ROLE_COLORS[role] || Colors.info }]}>
                  {role.charAt(0) + role.slice(1).toLowerCase()}
                </Text>
              </View>
            ))}
          </View>
          <View style={[styles.categoryBadge, { backgroundColor: Colors.secondary + "10" }]}>
            <Ionicons name={CATEGORY_ICONS[flag.category] as any || "ellipse"} size={10} color={Colors.secondary} />
            <Text style={styles.categoryBadgeText}>{flag.category}</Text>
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

export default function FeatureFlagsScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useApp();
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeCategory, setActiveCategory] = useState("All");
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  const fetchFlags = useCallback(async () => {
    try {
      const baseUrl = getApiUrl();
      const url = new URL("/api/admin/feature-flags", baseUrl);
      const res = await expoFetch(url.toString(), { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setFlags(data);
      }
    } catch {
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchFlags();
  }, [fetchFlags]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchFlags();
  };

  const handleToggle = async (id: string, enabled: boolean) => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}

    setFlags((prev) =>
      prev.map((f) => (f.id === id ? { ...f, enabled } : f))
    );

    try {
      await apiRequest("PUT", `/api/admin/feature-flags/${id}`, { enabled });
    } catch {
      setFlags((prev) =>
        prev.map((f) => (f.id === id ? { ...f, enabled: !enabled } : f))
      );
      Alert.alert("Error", "Failed to update feature flag");
    }
  };

  const filteredFlags = activeCategory === "All"
    ? flags
    : flags.filter((f) => f.category === activeCategory);

  const enabledCount = flags.filter((f) => f.enabled).length;

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[Colors.primary, "#FF8A33", "#FFa855"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.header, { paddingTop: topInset + 12 }]}
      >
        <View style={styles.headerRow}>
          <Pressable
            style={styles.backBtn}
            onPress={() => {
              try { Haptics.selectionAsync(); } catch {}
              router.back();
            }}
          >
            <Ionicons name="arrow-back" size={22} color="#FFF" />
          </Pressable>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Feature Control</Text>
            <Text style={styles.headerSub}>
              {enabledCount}/{flags.length} features active
            </Text>
          </View>
          <View style={styles.headerRight}>
            <View style={styles.headerBadge}>
              <Ionicons name="toggle" size={18} color="#FFF" />
            </View>
          </View>
        </View>
      </LinearGradient>

      <View style={styles.tabsContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabsContent}
        >
          {CATEGORIES.map((cat) => {
            const isActive = activeCategory === cat;
            const count = cat === "All" ? flags.length : flags.filter((f) => f.category === cat).length;
            return (
              <Pressable
                key={cat}
                style={[styles.tabChip, isActive && styles.tabChipActive]}
                onPress={() => {
                  try { Haptics.selectionAsync(); } catch {}
                  setActiveCategory(cat);
                }}
              >
                <Ionicons
                  name={CATEGORY_ICONS[cat] as any}
                  size={14}
                  color={isActive ? "#FFF" : Colors.textSecondary}
                />
                <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
                  {cat}
                </Text>
                {count > 0 && (
                  <View style={[styles.tabCount, isActive && styles.tabCountActive]}>
                    <Text style={[styles.tabCountText, isActive && styles.tabCountTextActive]}>
                      {count}
                    </Text>
                  </View>
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading features...</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: bottomInset + 20 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
          }
        >
          {filteredFlags.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Ionicons name="toggle-outline" size={48} color={Colors.textLight} />
              <Text style={styles.emptyTitle}>No Features Found</Text>
              <Text style={styles.emptyDesc}>
                {activeCategory === "All"
                  ? "No feature flags configured yet"
                  : `No features in ${activeCategory} category`}
              </Text>
            </View>
          ) : (
            filteredFlags.map((flag, index) => (
              <FeatureFlagCard
                key={flag.id}
                flag={flag}
                index={index}
                onToggle={handleToggle}
              />
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
  },
  headerTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 20,
    color: "#FFF",
  },
  headerSub: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: "rgba(255,255,255,0.8)",
    marginTop: 2,
  },
  headerRight: {
    width: 40,
    alignItems: "flex-end",
  },
  headerBadge: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  tabsContainer: {
    backgroundColor: "#FFF",
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  tabsContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  tabChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.surfaceAlt,
  },
  tabChipActive: {
    backgroundColor: Colors.primary,
  },
  tabText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 13,
    color: Colors.textSecondary,
  },
  tabTextActive: {
    color: "#FFF",
  },
  tabCount: {
    backgroundColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 1,
    minWidth: 20,
    alignItems: "center",
  },
  tabCountActive: {
    backgroundColor: "rgba(255,255,255,0.3)",
  },
  tabCountText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 10,
    color: Colors.textSecondary,
  },
  tabCountTextActive: {
    color: "#FFF",
  },
  flagCard: {
    backgroundColor: "#FFF",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  flagHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  flagIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  flagInfo: {
    flex: 1,
  },
  flagName: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 15,
    color: Colors.text,
  },
  flagDesc: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
    lineHeight: 17,
  },
  flagFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  rolesRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    flex: 1,
  },
  roleBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  roleDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  roleBadgeText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 10,
  },
  categoryBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  categoryBadgeText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 10,
    color: Colors.secondary,
  },
  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loadingText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 14,
    color: Colors.textSecondary,
  },
  emptyWrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    gap: 8,
  },
  emptyTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 17,
    color: Colors.text,
    marginTop: 8,
  },
  emptyDesc: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: "center",
  },
});

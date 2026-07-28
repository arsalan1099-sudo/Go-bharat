import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  TouchableOpacity,
  Platform,
  Dimensions,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import Colors from "@/constants/colors";
import { useApp } from "@/lib/store";
import { Reel } from "@/lib/types";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const isWeb = Platform.OS === "web";
const GRID_GAP = 2;
const NUM_COLS = 3;
const TILE_SIZE = (SCREEN_WIDTH - GRID_GAP * (NUM_COLS - 1)) / NUM_COLS;

function formatCount(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return n.toString();
}

function ReelTile({ reel, onPress }: { reel: Reel; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.tile} onPress={onPress} activeOpacity={0.8}>
      <Image source={{ uri: reel.thumbnail }} style={styles.tileImage} accessibilityLabel={reel.caption} />
      <LinearGradient
        colors={["transparent", "rgba(0,0,0,0.6)"]}
        style={styles.tileGradient}
      />
      <View style={styles.tileStats}>
        <View style={styles.tileStat}>
          <Ionicons name="heart" size={12} color="#FFF" />
          <Text style={styles.tileStatText}>{formatCount(reel.likes)}</Text>
        </View>
        {reel.taggedProducts.length > 0 && (
          <View style={styles.tileStat}>
            <Ionicons name="pricetag" size={11} color={Colors.primary} />
            <Text style={[styles.tileStatText, { color: Colors.primary }]}>{reel.taggedProducts.length}</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

export default function VendorReelsScreen() {
  const { reels, user } = useApp();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const topInset = isWeb ? 67 : insets.top;
  const bottomInset = isWeb ? 34 : insets.bottom;

  const vendorReels = reels.filter((r) => r.vendorId === user?.id || r.userId === user?.id);
  const allReels = reels;

  const [tab, setTab] = useState<"my" | "all">("my");
  const displayReels = tab === "my" ? vendorReels : allReels;

  const totalLikes = vendorReels.reduce((sum, r) => sum + r.likes, 0);
  const totalViews = vendorReels.reduce((sum, r) => sum + r.likes + r.comments + r.shares, 0);

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: topInset + 8 }]}>
        <Text style={styles.headerTitle}>Reels</Text>
        <TouchableOpacity style={styles.createBtn} onPress={() => router.push("/upload-reel")}>
          <Ionicons name="add" size={22} color="#FFF" />
          <Text style={styles.createBtnText}>Create</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{vendorReels.length}</Text>
          <Text style={styles.statLabel}>Reels</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{formatCount(totalLikes)}</Text>
          <Text style={styles.statLabel}>Total Likes</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{formatCount(totalViews)}</Text>
          <Text style={styles.statLabel}>Engagement</Text>
        </View>
      </View>

      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tabBtn, tab === "my" && styles.tabBtnActive]}
          onPress={() => setTab("my")}
        >
          <Text style={[styles.tabText, tab === "my" && styles.tabTextActive]}>My Reels</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, tab === "all" && styles.tabBtnActive]}
          onPress={() => setTab("all")}
        >
          <Text style={[styles.tabText, tab === "all" && styles.tabTextActive]}>Explore</Text>
        </TouchableOpacity>
      </View>

      {displayReels.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="videocam-outline" size={48} color={Colors.textLight} />
          <Text style={styles.emptyTitle}>No Reels Yet</Text>
          <Text style={styles.emptyDesc}>Create your first reel to showcase products and reach more customers</Text>
          <TouchableOpacity style={styles.emptyBtn} onPress={() => router.push("/upload-reel")}>
            <Ionicons name="add" size={20} color="#FFF" />
            <Text style={styles.emptyBtnText}>Create Reel</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={displayReels}
          numColumns={NUM_COLS}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ReelTile reel={item} onPress={() => {
              Alert.alert(
                item.caption || "Reel Preview",
                `${formatCount(item.likes)} likes · ${item.taggedProducts.length} tagged products`,
                [{ text: "OK" }]
              );
            }} />
          )}
          columnWrapperStyle={styles.gridRow}
          contentContainerStyle={{ paddingBottom: 100 + bottomInset }}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFF",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: Colors.secondary,
  },
  headerTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 22,
    color: "#FFF",
  },
  createBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  createBtnText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 13,
    color: "#FFF",
  },
  statsRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 10,
    backgroundColor: Colors.secondary,
  },
  statCard: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
  },
  statValue: {
    fontFamily: "Poppins_700Bold",
    fontSize: 20,
    color: "#FFF",
  },
  statLabel: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    color: "rgba(255,255,255,0.6)",
  },
  tabRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: "center",
    backgroundColor: "#F3F4F6",
  },
  tabBtnActive: {
    backgroundColor: Colors.primary,
  },
  tabText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 13,
    color: Colors.textLight,
  },
  tabTextActive: {
    color: "#FFF",
  },
  gridRow: {
    gap: GRID_GAP,
  },
  tile: {
    width: TILE_SIZE,
    height: TILE_SIZE * 1.4,
    marginBottom: GRID_GAP,
    position: "relative",
  },
  tileImage: {
    width: "100%",
    height: "100%",
  },
  tileGradient: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 40,
  },
  tileStats: {
    position: "absolute",
    bottom: 6,
    left: 6,
    flexDirection: "row",
    gap: 8,
  },
  tileStat: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  tileStatText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 11,
    color: "#FFF",
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
    gap: 8,
  },
  emptyTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 18,
    color: Colors.text,
    marginTop: 8,
  },
  emptyDesc: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: Colors.textLight,
    textAlign: "center",
    lineHeight: 20,
  },
  emptyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    marginTop: 12,
  },
  emptyBtnText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
    color: "#FFF",
  },
});

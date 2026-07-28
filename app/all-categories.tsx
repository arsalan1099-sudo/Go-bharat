import React, { useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  Dimensions,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useApp } from "@/lib/store";
import { categories as staticCategories, subCategories as staticSubCategories } from "@/lib/data";

const SIDEBAR_W = 80;
const { width: SCREEN_W } = Dimensions.get("window");
const CONTENT_W = SCREEN_W - SIDEBAR_W;
const CARD_PAD = 12;
const CARD_GAP = 10;
const CARD_W = Math.floor((CONTENT_W - CARD_PAD * 2 - CARD_GAP) / 2);

/** Darken a hex color by `amt` (0..1). */
function shade(hex: string, amt: number): string {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const num = parseInt(full, 16);
  let r = (num >> 16) & 0xff;
  let g = (num >> 8) & 0xff;
  let b = num & 0xff;
  r = Math.max(0, Math.round(r * (1 - amt)));
  g = Math.max(0, Math.round(g * (1 - amt)));
  b = Math.max(0, Math.round(b * (1 - amt)));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

const SUBCATEGORY_EMOJI: Record<string, string> = {
  sc1:   "🛒", sc2:   "⚙️",  sc3:   "🖥️",  sc4:   "📦",
  sc5:   "🍛", sc6:   "👗",  sc7:   "📱",  sc8:   "💄",
  sc9:   "🛍️",  sc10:  "🏠",
  sc11:  "🏠",  sc12:  "💅",  sc13:  "🔧",  sc14:  "💼",
  sc15:  "🛵",  sc16:  "👷",  sc17:  "🧹",  sc18:  "🎪",
  sc19:  "📦",  sc20:  "🧪",  sc21:  "🧵",  sc22:  "🌾",
  sc23:  "🏗️",  sc24:  "🔩",  sc25:  "📄",  sc26:  "⚡",
  sc27:  "🔩",  sc28:  "🦺",  sc29:  "🍽️",  sc30:  "🏥",
  sc31:  "💻",  sc32:  "🪑",  sc33:  "🧹",  sc34:  "🎨",
  sc35:  "🔩",  sc36:  "🧴",  sc37:  "🪵",  sc38:  "💎",
  sc39:  "✏️",  sc40:  "🏪",  sc41:  "💊",  sc42:  "🔨",
  sc43:  "🔧",
  sc44:  "🎂",  sc45:  "👟",  sc46:  "🎮",  sc47:  "📚",
  sc48:  "🏋️",  sc49:  "🐾",  sc50:  "💐",  sc51:  "⌚",
  sc52:  "👶",  sc53:  "👓",  sc54:  "🧳",  sc55:  "🎵",
  sc56:  "🎨",  sc57:  "📱",  sc58:  "🌿",  sc59:  "🥜",
  sc60:  "🍳",  sc61:  "💍",  sc62:  "🚗",  sc63:  "🌿",
  sc64:  "🥤",  sc65:  "👘",  sc66:  "🪔",  sc67:  "🎁",
  sc68:  "🧴",
  sc69:  "🧹",  sc70:  "🐛",  sc71:  "🎨",  sc72:  "📸",
  sc73:  "🍱",  sc74:  "📖",  sc75:  "🏋️",  sc76:  "🔮",
  sc77:  "✈️",  sc78:  "🎪",  sc79:  "⚖️",  sc80:  "🧾",
  sc81:  "🏥",  sc82:  "🐶",  sc83:  "📦",  sc84:  "🚘",
  sc85:  "🧵",  sc86:  "🖨️",  sc87:  "💻",  sc88:  "💰",
  sc89:  "🛡️",  sc90:  "🚗",  sc91:  "👨‍🍳", sc92:  "📦",
  sc93:  "🏗️",  sc94:  "🏭",  sc95:  "💼",  sc96:  "❄️",
  sc97:  "🔥",  sc98:  "💻",  sc99:  "📊",  sc100: "📦",
  sc101: "🚌",  sc102: "🚕",  sc103: "🗺️",  sc104: "🏨",
  sc105: "🚐",  sc106: "⛪",  sc107: "✈️",  sc108: "🚆",  sc109: "🚛",
};

export default function AllCategoriesScreen() {
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 30 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;
  const { catId } = useLocalSearchParams<{ catId?: string }>();

  const { liveCategories, liveSubCategories, customSubCategories } = useApp();
  const allCategories = liveCategories.length > 0 ? liveCategories : staticCategories;
  const baseSubs = liveSubCategories.length > 0 ? liveSubCategories : staticSubCategories;
  const allSubCategories = [
    ...baseSubs,
    ...customSubCategories.filter((sc) => !baseSubs.some((b) => b.id === sc.id)),
  ];

  const defaultCat = catId && allCategories.find((c) => c.id === catId)
    ? catId
    : allCategories[0]?.id ?? "";

  const [selectedCatId, setSelectedCatId] = useState<string>(defaultCat);
  const sidebarRef = useRef<ScrollView>(null);
  const catYMap = useRef<Record<string, number>>({});
  const contentRef = useRef<ScrollView>(null);

  const selectedCat = allCategories.find((c) => c.id === selectedCatId);
  const subcats = allSubCategories.filter((sc) => sc.categoryId === selectedCatId);
  const catColor = selectedCat?.color || Colors.primary;
  const catColorDark = shade(catColor, 0.32);
  const catColorMid = shade(catColor, 0.16);

  const handleCatPress = (id: string) => {
    try { Haptics.selectionAsync(); } catch {}
    setSelectedCatId(id);
    contentRef.current?.scrollTo({ y: 0, animated: false });
    const y = catYMap.current[id];
    if (y !== undefined) {
      sidebarRef.current?.scrollTo({ y: Math.max(0, y - 60), animated: true });
    }
  };

  const rows: (typeof subcats)[] = [];
  for (let i = 0; i < subcats.length; i += 2) {
    rows.push(subcats.slice(i, i + 2));
  }

  return (
    <View style={styles.container}>
      {/* ── DYNAMIC GRADIENT HEADER (themed per category) ── */}
      <View style={[styles.headerShadow, { backgroundColor: catColorDark }]}>
        <LinearGradient
          colors={[catColor, catColorDark]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.header, { paddingTop: topInset + 10 }]}
        >
          {/* decorative translucent orbs */}
          <View style={styles.headerOrbA} />
          <View style={styles.headerOrbB} />

          <View style={styles.headerRow}>
            <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
              <Ionicons name="arrow-back" size={20} color="#FFF" />
            </Pressable>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.headerTitle}>All Categories</Text>
              <Text style={styles.headerSubtitle}>Explore everything Go Bharat offers</Text>
            </View>
            <View style={styles.headerBadge}>
              <Ionicons name="grid" size={13} color="#FFF" />
              <Text style={styles.headerBadgeText}>{allCategories.length}</Text>
            </View>
          </View>
        </LinearGradient>
      </View>

      <View style={styles.body}>
        {/* ── LEFT SIDEBAR ── */}
        <ScrollView
          ref={sidebarRef}
          style={styles.sidebar}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: bottomInset + 16, paddingTop: 8 }}
        >
          {allCategories.map((cat) => {
            const active = cat.id === selectedCatId;
            const color = cat.color || Colors.primary;
            return (
              <Pressable
                key={cat.id}
                onLayout={(e) => { catYMap.current[cat.id] = e.nativeEvent.layout.y; }}
                onPress={() => handleCatPress(cat.id)}
                style={[styles.sidebarItem, active && styles.sidebarItemActive]}
              >
                {active && <View style={[styles.activeBar, { backgroundColor: color }]} />}
                {active ? (
                  <LinearGradient
                    colors={[color, shade(color, 0.28)]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[styles.sidebarIconWrap, styles.sidebarIconActive, { shadowColor: color }]}
                  >
                    <Ionicons name={cat.icon as any} size={22} color="#FFF" />
                  </LinearGradient>
                ) : (
                  <View style={[styles.sidebarIconWrap, { backgroundColor: "#EDEFF4" }]}>
                    <Ionicons name={cat.icon as any} size={21} color="#A2A8B4" />
                  </View>
                )}
                <Text style={[
                  styles.sidebarLabel,
                  active && { color, fontFamily: "Poppins_700Bold" },
                ]} numberOfLines={2}>
                  {cat.name}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* ── RIGHT CONTENT ── */}
        <ScrollView
          ref={contentRef}
          style={styles.content}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: bottomInset + 24 }}
          key={selectedCatId}
        >
          {/* ── HERO BANNER ── */}
          <View style={[styles.bannerShadow, { backgroundColor: catColorDark }]}>
            <LinearGradient
              colors={[catColor, catColorMid, catColorDark]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.catBanner}
            >
              <View style={styles.bannerOrbA} />
              <View style={styles.bannerOrbB} />
              <View style={styles.catBannerIcon}>
                <Ionicons name={(selectedCat?.icon ?? "grid") as any} size={26} color="#FFF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.catBannerName} numberOfLines={1}>
                  {selectedCat?.name}
                </Text>
                <View style={styles.catBannerCountPill}>
                  <Text style={styles.catBannerCountText}>
                    {subcats.length} {subcats.length === 1 ? "type" : "types"} available
                  </Text>
                </View>
              </View>
            </LinearGradient>
          </View>

          {subcats.length === 0 ? (
            <View style={styles.empty}>
              <View style={[styles.emptyIconWrap, { backgroundColor: catColor + "14" }]}>
                <Text style={{ fontSize: 38 }}>🗂️</Text>
              </View>
              <Text style={styles.emptyTitle}>Nothing here yet</Text>
              <Text style={styles.emptySubtitle}>Sub-categories will appear here soon</Text>
            </View>
          ) : (
            <View style={styles.grid}>
              {rows.map((row, ri) => (
                <View key={ri} style={styles.row}>
                  {row.map((sc) => {
                    const emoji = SUBCATEGORY_EMOJI[sc.id] ?? "🏷️";
                    return (
                      <Pressable
                        key={sc.id}
                        style={({ pressed }) => [
                          styles.card,
                          { borderColor: catColor + "22", shadowColor: catColor },
                          pressed && styles.cardPressed,
                        ]}
                        onPress={() => {
                          try { Haptics.selectionAsync(); } catch {}
                          router.push(`/subcategory/${sc.id}` as any);
                        }}
                      >
                        <LinearGradient
                          colors={[catColor + "1A", catColor + "30"]}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                          style={styles.cardIconBg}
                        >
                          <Text style={styles.cardEmoji}>{emoji}</Text>
                        </LinearGradient>
                        <Text style={styles.cardName} numberOfLines={2}>{sc.name}</Text>
                        <View style={[styles.cardArrow, { backgroundColor: catColor }]}>
                          <Ionicons name="arrow-forward" size={13} color="#FFF" />
                        </View>
                      </Pressable>
                    );
                  })}
                  {row.length === 1 && <View style={[styles.card, styles.cardGhost]} />}
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F6FA" },

  headerShadow: {
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    elevation: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 18,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    overflow: "hidden",
  },
  headerOrbA: {
    position: "absolute",
    top: -40,
    right: -30,
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  headerOrbB: {
    position: "absolute",
    bottom: -50,
    left: -20,
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.22)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 19,
    color: "#FFFFFF",
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11.5,
    color: "rgba(255,255,255,0.82)",
    marginTop: 1,
  },
  headerBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255,255,255,0.22)",
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 20,
  },
  headerBadgeText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 13,
    color: "#FFFFFF",
  },

  body: { flex: 1, flexDirection: "row" },

  sidebar: {
    width: SIDEBAR_W,
    minWidth: SIDEBAR_W,
    maxWidth: SIDEBAR_W,
    flexShrink: 0,
    flexGrow: 0,
    backgroundColor: "#F0F1F5",
  },
  sidebarItem: {
    alignItems: "center",
    paddingVertical: 13,
    paddingHorizontal: 4,
    position: "relative",
  },
  sidebarItemActive: {
    backgroundColor: "#FFFFFF",
    borderTopRightRadius: 16,
    borderBottomRightRadius: 16,
  },
  activeBar: {
    position: "absolute",
    left: 0,
    top: 12,
    bottom: 12,
    width: 4,
    borderTopRightRadius: 3,
    borderBottomRightRadius: 3,
  },
  sidebarIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  sidebarIconActive: {
    elevation: 4,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
  },
  sidebarLabel: {
    fontFamily: "Poppins_500Medium",
    fontSize: 10,
    color: "#9AA0AC",
    textAlign: "center",
    lineHeight: 13,
    paddingHorizontal: 2,
  },

  content: { flex: 1, backgroundColor: "#F5F6FA" },

  bannerShadow: {
    marginHorizontal: 12,
    marginTop: 14,
    marginBottom: 10,
    borderRadius: 20,
    elevation: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 8,
  },
  catBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 18,
    borderRadius: 20,
    overflow: "hidden",
  },
  bannerOrbA: {
    position: "absolute",
    top: -36,
    right: -16,
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  bannerOrbB: {
    position: "absolute",
    bottom: -40,
    right: 60,
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  catBannerIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  catBannerName: {
    fontFamily: "Poppins_700Bold",
    fontSize: 20,
    lineHeight: 26,
    color: "#FFFFFF",
    letterSpacing: -0.3,
  },
  catBannerCountPill: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.24)",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 20,
    marginTop: 5,
  },
  catBannerCountText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 11,
    color: "#FFFFFF",
  },

  grid: {
    paddingHorizontal: CARD_PAD,
    paddingTop: 4,
    gap: CARD_GAP,
  },
  row: {
    flexDirection: "row",
    gap: CARD_GAP,
  },
  card: {
    width: CARD_W,
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    paddingVertical: 18,
    paddingHorizontal: 12,
    alignItems: "center",
    borderWidth: 1,
    elevation: 3,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
  },
  cardGhost: {
    opacity: 0,
    borderWidth: 0,
    elevation: 0,
  },
  cardPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.96 }],
  },
  cardIconBg: {
    width: 68,
    height: 68,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 11,
  },
  cardEmoji: {
    fontSize: 32,
    lineHeight: 40,
  },
  cardName: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
    color: Colors.text,
    textAlign: "center",
    lineHeight: 16,
    marginBottom: 10,
  },
  cardArrow: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },

  empty: {
    alignItems: "center",
    paddingTop: 70,
    gap: 6,
  },
  emptyIconWrap: {
    width: 84,
    height: 84,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  emptyTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 15,
    color: Colors.text,
  },
  emptySubtitle: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: Colors.textLight,
  },
});

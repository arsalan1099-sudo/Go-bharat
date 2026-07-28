import React, { useState, useRef, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Linking,
} from "react-native";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import Animated, { SlideInDown } from "react-native-reanimated";
import Colors from "@/constants/colors";
import { categories as staticCategories } from "@/lib/data";
import { Vendor } from "@/lib/types";
import { getApiUrl } from "@/lib/query-client";
import { Image } from "expo-image";

const FALLBACK_COLOR_MAP: Record<string, string> = {
  "1": "#3B82F6",
  "2": "#FF6B00",
  "3": "#8B5CF6",
  "4": "#10B981",
  "5": "#E11D48",
};

const FALLBACK_ICON_MAP: Record<string, string> = {
  "1": "briefcase-outline",
  "2": "storefront-outline",
  "3": "build-outline",
  "4": "people-outline",
  "5": "bus-outline",
};

const VENDOR_PLACEHOLDER_COLORS = [
  "#FF6B35", "#4ECDC4", "#45B7D1", "#96CEB4",
  "#A78BFA", "#F472B6", "#34D399", "#FB923C",
  "#60A5FA", "#FBBF24",
];
const vendorPlaceholderColor = (name: string) => {
  const h = (name || "").split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return VENDOR_PLACEHOLDER_COLORS[h % VENDOR_PLACEHOLDER_COLORS.length];
};

function computeRegion(vendors: Vendor[]) {
  if (vendors.length === 0) {
    return { latitude: 20.5547, longitude: 74.5247, latitudeDelta: 0.08, longitudeDelta: 0.08 };
  }
  const lats = vendors.map((v) => v.lat);
  const lngs = vendors.map((v) => v.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const centerLat = (minLat + maxLat) / 2;
  const centerLng = (minLng + maxLng) / 2;
  const latDelta = Math.max(0.04, (maxLat - minLat) * 1.5);
  const lngDelta = Math.max(0.04, (maxLng - minLng) * 1.5);
  return { latitude: centerLat, longitude: centerLng, latitudeDelta: latDelta, longitudeDelta: lngDelta };
}

function VendorBottomCard({
  vendor,
  onClose,
  colorMap,
  categories,
}: {
  vendor: Vendor;
  onClose: () => void;
  colorMap: Record<string, string>;
  categories: typeof staticCategories;
}) {
  const insets = useSafeAreaInsets();
  const catColor = colorMap[vendor.categoryId] || Colors.primary;
  const category = categories.find((c) => c.id === vendor.categoryId);
  const bottomPad = Math.max(insets.bottom, 16) + 10;

  return (
    <Animated.View
      entering={SlideInDown.duration(280)}
      style={[styles.bottomCard, { bottom: bottomPad }]}
    >
      <View style={styles.cardHandle} />
      <Pressable style={styles.cardClose} onPress={onClose}>
        <Ionicons name="close" size={20} color={Colors.textSecondary} />
      </Pressable>

      <Pressable
        style={styles.cardContent}
        onPress={() => router.push(`/store/${vendor.id}` as any)}
      >
        {vendor.hasImage ? (
          <Image
            source={{ uri: `${getApiUrl()}/api/vendors/${vendor.id}/image` }}
            style={styles.cardImage}
            contentFit="cover"
          />
        ) : (
          <View style={[styles.cardImage, { backgroundColor: vendorPlaceholderColor(vendor.name), alignItems: "center", justifyContent: "center" }]}>
            <Text style={{ fontFamily: "Poppins_700Bold", fontSize: 28, color: "#FFF" }}>
              {(vendor.name || "?")[0].toUpperCase()}
            </Text>
          </View>
        )}

        <View style={styles.cardInfo}>
          <View style={styles.cardTitleRow}>
            <Text style={styles.cardName} numberOfLines={1}>{vendor.name}</Text>
            <View style={[styles.statusBadge, { backgroundColor: vendor.isOpen ? "#D1FAE5" : "#FEE2E2" }]}>
              <View style={[styles.statusDot, { backgroundColor: vendor.isOpen ? "#10B981" : "#EF4444" }]} />
              <Text style={[styles.statusText, { color: vendor.isOpen ? "#065F46" : "#DC2626" }]}>
                {vendor.isOpen ? "Open" : "Closed"}
              </Text>
            </View>
          </View>

          {vendor.description ? (
            <Text style={styles.cardDesc} numberOfLines={1}>{vendor.description}</Text>
          ) : null}

          <View style={styles.cardMeta}>
            {category ? (
              <View style={[styles.categoryTag, { backgroundColor: catColor + "15" }]}>
                <Ionicons name={(category.icon || FALLBACK_ICON_MAP[vendor.categoryId] || "storefront-outline") as any} size={11} color={catColor} />
                <Text style={[styles.categoryTagText, { color: catColor }]}>{category.name}</Text>
              </View>
            ) : null}
            <View style={styles.ratingTag}>
              <Ionicons name="star" size={12} color="#F59E0B" />
              <Text style={styles.ratingText}>{vendor.rating}</Text>
              <Text style={styles.reviewCountText}>({vendor.reviewCount})</Text>
            </View>
            {vendor.distance ? (
              <View style={styles.distanceTag}>
                <Ionicons name="location" size={11} color={Colors.textSecondary} />
                <Text style={styles.distanceText}>{vendor.distance}</Text>
              </View>
            ) : null}
          </View>
        </View>
      </Pressable>

      <View style={styles.cardActions}>
        {vendor.lat && vendor.lng ? (
          <Pressable
            style={styles.driveButton}
            onPress={() => {
              const url = `https://www.google.com/maps/dir/?api=1&destination=${vendor.lat},${vendor.lng}&travelmode=driving`;
              Linking.openURL(url).catch(() =>
                Linking.openURL(`https://maps.google.com/?daddr=${vendor.lat},${vendor.lng}`)
              );
            }}
          >
            <Ionicons name="navigate" size={18} color="#FFF" />
            <Text style={styles.driveBtnText}>Drive</Text>
          </Pressable>
        ) : null}
        <Pressable
          style={[styles.visitButton, { backgroundColor: catColor }]}
          onPress={() => router.push(`/store/${vendor.id}` as any)}
        >
          <Text style={styles.visitButtonText}>Visit Store</Text>
          <Ionicons name="arrow-forward" size={16} color="#FFF" />
        </Pressable>
      </View>
    </Animated.View>
  );
}

interface Props {
  vendors: Vendor[];
  categories: typeof staticCategories;
  activeFilter: string;
  onFilterChange: (id: string) => void;
  selectedVendor: Vendor | null;
  onVendorSelect: (vendor: Vendor | null) => void;
}

export default function FullScreenVendorMap({
  vendors,
  categories,
  activeFilter,
  onFilterChange,
  selectedVendor,
  onVendorSelect,
}: Props) {
  const insets = useSafeAreaInsets();
  const mapRef = useRef<any>(null);

  const colorMap = useMemo<Record<string, string>>(() => {
    const m: Record<string, string> = { ...FALLBACK_COLOR_MAP };
    categories.forEach((c) => { if (c.color) m[c.id] = c.color; });
    return m;
  }, [categories]);

  const validVendors = useMemo(
    () => vendors.filter((v) => v.lat && v.lng && v.lat !== 0 && v.lng !== 0),
    [vendors]
  );

  const filteredVendors = useMemo(() => {
    if (activeFilter === "all") return validVendors;
    return validVendors.filter((v) => v.categoryId === activeFilter);
  }, [activeFilter, validVendors]);

  const region = useMemo(() => computeRegion(validVendors), [validVendors]);
  const topInset = insets.top;

  const filters = [
    { id: "all", label: "All", icon: "apps-outline", color: Colors.secondary },
    ...categories.map((c) => ({ id: c.id, label: c.name, icon: c.icon || "storefront-outline", color: c.color || Colors.primary })),
  ];

  const handleMarkerPress = (vendor: Vendor) => {
    onVendorSelect(vendor);
    mapRef.current?.animateToRegion({
      latitude: vendor.lat,
      longitude: vendor.lng,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    }, 350);
  };

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={StyleSheet.absoluteFill}
        initialRegion={region}
        scrollEnabled
        zoomEnabled
        rotateEnabled
        pitchEnabled
        onPress={() => onVendorSelect(null)}
      >
        {filteredVendors.map((vendor) => {
          const pinColor = colorMap[vendor.categoryId] || Colors.primary;
          return (
            <Marker
              key={vendor.id}
              coordinate={{ latitude: vendor.lat, longitude: vendor.lng }}
              onPress={(e) => {
                e.stopPropagation();
                handleMarkerPress(vendor);
              }}
              tracksViewChanges={false}
            >
              <View style={[styles.customPin, { backgroundColor: pinColor, opacity: vendor.isOpen ? 1 : 0.55 }]}>
                <Text style={styles.pinLabel} numberOfLines={1}>
                  {(vendor.name || "?")[0].toUpperCase()}
                </Text>
                <View style={[styles.pinDot, { backgroundColor: vendor.isOpen ? "#22C55E" : "#EF4444" }]} />
              </View>
            </Marker>
          );
        })}
      </MapView>

      <View style={[styles.topBar, { top: topInset + 10 }]}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </Pressable>
        <View style={styles.titlePill}>
          <Ionicons name="map" size={15} color={Colors.primary} />
          <Text style={styles.titleText}>Vendors Near You</Text>
          <View style={styles.countBubble}>
            <Text style={styles.countBubbleText}>{filteredVendors.length}</Text>
          </View>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[styles.filterBar, { top: topInset + 64 }]}
        contentContainerStyle={styles.filterBarContent}
      >
        {filters.map((f) => {
          const isActive = activeFilter === f.id;
          return (
            <Pressable
              key={f.id}
              testID={`filter-${f.id}`}
              style={[styles.filterChip, isActive && { backgroundColor: f.color }]}
              onPress={() => {
                onFilterChange(f.id);
                onVendorSelect(null);
              }}
            >
              <Ionicons name={f.icon as any} size={13} color={isActive ? "#FFF" : f.color} />
              <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>
                {f.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {selectedVendor && (
        <VendorBottomCard
          vendor={selectedVendor}
          onClose={() => onVendorSelect(null)}
          colorMap={colorMap}
          categories={categories}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#E8E8E8" },
  topBar: {
    position: "absolute",
    left: 12,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    zIndex: 20,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#FFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  titlePill: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF",
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 4,
  },
  titleText: {
    flex: 1,
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
    color: Colors.text,
  },
  countBubble: {
    backgroundColor: Colors.primary + "20",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  countBubbleText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 12,
    color: Colors.primary,
  },
  filterBar: {
    position: "absolute",
    left: 0,
    right: 0,
    zIndex: 10,
  },
  filterBarContent: {
    paddingHorizontal: 12,
    gap: 8,
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
    gap: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  filterChipText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 12,
    color: Colors.text,
  },
  filterChipTextActive: {
    color: "#FFF",
  },
  customPin: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2.5,
    borderColor: "#FFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
    position: "relative",
  },
  pinLabel: {
    fontFamily: "Poppins_700Bold",
    fontSize: 13,
    color: "#FFF",
  },
  pinDot: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 9,
    height: 9,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: "#FFF",
  },
  bottomCard: {
    position: "absolute",
    left: 12,
    right: 12,
    backgroundColor: "#FFF",
    borderRadius: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 12,
    overflow: "hidden",
    zIndex: 30,
  },
  cardHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#E2E8F0",
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 4,
  },
  cardClose: {
    position: "absolute",
    top: 10,
    right: 12,
    zIndex: 10,
    padding: 4,
  },
  cardContent: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
  },
  cardImage: {
    width: 80,
    height: 80,
    borderRadius: 12,
    backgroundColor: "#F1F5F9",
  },
  cardInfo: {
    flex: 1,
    gap: 4,
  },
  cardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingRight: 28,
  },
  cardName: {
    flex: 1,
    fontFamily: "Poppins_700Bold",
    fontSize: 15,
    color: "#0F172A",
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 10,
  },
  cardDesc: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
  },
  cardMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  categoryTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  categoryTagText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 10,
  },
  ratingTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  ratingText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 11,
    color: "#78350F",
  },
  reviewCountText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
  },
  distanceTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  distanceText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
  },
  cardActions: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 14,
    paddingBottom: 14,
    paddingTop: 4,
  },
  driveButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#1E293B",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  driveBtnText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 13,
    color: "#FFF",
  },
  visitButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 12,
    paddingVertical: 10,
  },
  visitButtonText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 13,
    color: "#FFF",
  },
});

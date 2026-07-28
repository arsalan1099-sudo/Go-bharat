import React, { useRef } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import MapView, { Marker, Callout, type MapView as MapViewType } from "react-native-maps";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

interface VendorPin {
  id: string;
  name: string;
  lat: number;
  lng: number;
  isOpen?: boolean;
  rating?: number;
  categoryId?: string;
}

interface Props {
  vendors: VendorPin[];
  onVendorPress: (vendorId: string) => void;
  onExpandPress?: () => void;
  title?: string;
  countUnit?: string;
}

function computeRegion(vendors: VendorPin[]) {
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
  const latDelta = Math.max(0.02, (maxLat - minLat) * 1.4);
  const lngDelta = Math.max(0.02, (maxLng - minLng) * 1.4);
  return { latitude: centerLat, longitude: centerLng, latitudeDelta: latDelta, longitudeDelta: lngDelta };
}

export default function VendorMapSection({ vendors, onVendorPress, onExpandPress, title = "Vendors Near You", countUnit = "shops" }: Props) {
  const mapRef = useRef<MapViewType>(null);

  const validVendors = vendors.filter((v) => v.lat !== 0 && v.lng !== 0);
  if (validVendors.length === 0) return null;

  const region = computeRegion(validVendors);

  return (
    <View style={styles.wrapper}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="map" size={18} color={Colors.primary} />
          <Text style={styles.title}>{title}</Text>
        </View>
        <View style={styles.countPill}>
          <Text style={styles.countText}>{validVendors.length} {countUnit}</Text>
        </View>
      </View>
      <View style={styles.mapContainer}>
        <MapView
          ref={mapRef}
          style={styles.map}
          initialRegion={region}
          scrollEnabled={false}
          zoomEnabled={false}
          rotateEnabled={false}
          pitchEnabled={false}
        >
          {validVendors.map((vendor) => (
            <Marker
              key={vendor.id}
              coordinate={{ latitude: vendor.lat, longitude: vendor.lng }}
              onPress={() => {
                onVendorPress(vendor.id);
              }}
              pinColor={vendor.isOpen ? Colors.primary : "#9CA3AF"}
            >
              <Callout tooltip onPress={() => onVendorPress(vendor.id)}>
                <View style={styles.callout}>
                  <Text style={styles.calloutName} numberOfLines={1}>{vendor.name}</Text>
                  <View style={styles.calloutRow}>
                    {vendor.isOpen ? (
                      <View style={styles.openBadge}>
                        <View style={styles.openDot} />
                        <Text style={styles.openText}>Open</Text>
                      </View>
                    ) : (
                      <Text style={styles.closedText}>Closed</Text>
                    )}
                    {vendor.rating ? (
                      <View style={styles.ratingRow}>
                        <Ionicons name="star" size={10} color="#F59E0B" />
                        <Text style={styles.ratingText}>{vendor.rating.toFixed(1)}</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.calloutTap}>Tap to view store</Text>
                </View>
              </Callout>
            </Marker>
          ))}
        </MapView>
        <Pressable
          style={styles.expandBtn}
          onPress={onExpandPress}
        >
          <Ionicons name="expand-outline" size={16} color={Colors.primary} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginHorizontal: 16,
    marginBottom: 20,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  title: {
    fontFamily: "Poppins_700Bold",
    fontSize: 17,
    color: "#0F172A",
  },
  countPill: {
    backgroundColor: Colors.primary + "1A",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  countText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
    color: Colors.primary,
  },
  mapContainer: {
    borderRadius: 16,
    overflow: "hidden",
    height: 220,
    position: "relative",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  map: {
    flex: 1,
  },
  expandBtn: {
    position: "absolute",
    top: 10,
    right: 10,
    backgroundColor: "#FFF",
    borderRadius: 8,
    padding: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  callout: {
    backgroundColor: "#FFF",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minWidth: 140,
    maxWidth: 200,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  calloutName: {
    fontFamily: "Poppins_700Bold",
    fontSize: 13,
    color: "#0F172A",
    marginBottom: 4,
  },
  calloutRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  openBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#D1FAE5",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  openDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#10B981",
  },
  openText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 10,
    color: "#065F46",
  },
  closedText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 10,
    color: "#9CA3AF",
  },
  ratingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  ratingText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 10,
    color: "#78350F",
  },
  calloutTap: {
    fontFamily: "Poppins_400Regular",
    fontSize: 10,
    color: Colors.primary,
  },
});

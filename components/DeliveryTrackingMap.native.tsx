import React, { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import MapView, { Marker, Polyline } from "react-native-maps";
import { Ionicons } from "@expo/vector-icons";
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, withSequence } from "react-native-reanimated";
import Colors from "@/constants/colors";

interface DeliveryTrackingMapProps {
  vendorLat: number;
  vendorLng: number;
  customerLat: number;
  customerLng: number;
  vendorName: string;
  customerName?: string;
  status: string;
  isDeliveryView?: boolean;
}

function interpolatePoints(start: { lat: number; lng: number }, end: { lat: number; lng: number }, steps: number) {
  const points = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    points.push({
      latitude: start.lat + (end.lat - start.lat) * t,
      longitude: start.lng + (end.lng - start.lng) * t,
    });
  }
  return points;
}

export default function DeliveryTrackingMap({
  vendorLat, vendorLng, customerLat, customerLng,
  vendorName, customerName, status, isDeliveryView
}: DeliveryTrackingMapProps) {
  const mapRef = useRef<MapView>(null);
  const [driverPos, setDriverPos] = useState({ latitude: vendorLat, longitude: vendorLng });
  const [progress, setProgress] = useState(0);
  const pulseScale = useSharedValue(1);

  const routePoints = interpolatePoints(
    { lat: vendorLat, lng: vendorLng },
    { lat: customerLat, lng: customerLng },
    20
  );

  const isMoving = status === "PICKED" || status === "ON_THE_WAY";
  const isPickedUp = status === "PICKED" || status === "ON_THE_WAY";

  useEffect(() => {
    pulseScale.value = withRepeat(
      withSequence(withTiming(1.3, { duration: 1000 }), withTiming(1, { duration: 1000 })),
      -1
    );
  }, []);

  useEffect(() => {
    if (!isMoving) return;

    const startProgress = status === "PICKED" ? 0 : 30;
    setProgress(startProgress);

    const interval = setInterval(() => {
      setProgress((prev) => {
        const next = prev + 2;
        if (next >= 100) {
          clearInterval(interval);
          return 100;
        }
        return next;
      });
    }, 1500);

    return () => clearInterval(interval);
  }, [status]);

  useEffect(() => {
    const idx = Math.min(Math.floor((progress / 100) * (routePoints.length - 1)), routePoints.length - 1);
    setDriverPos(routePoints[idx]);
  }, [progress, routePoints]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    opacity: 2 - pulseScale.value,
  }));

  const midLat = (vendorLat + customerLat) / 2;
  const midLng = (vendorLng + customerLng) / 2;
  const latDelta = Math.abs(vendorLat - customerLat) * 2.5 + 0.005;
  const lngDelta = Math.abs(vendorLng - customerLng) * 2.5 + 0.005;

  const getStatusLabel = () => {
    if (status === "ACCEPTED" || status === "PREPARING") return "Preparing your order...";
    if (status === "READY") return "Ready for pickup";
    if (status === "PICKED") return "Picked up, heading to you!";
    if (status === "ON_THE_WAY") return `${Math.max(0, Math.ceil((100 - progress) / 15))} min away`;
    if (status === "DELIVERED") return "Delivered!";
    return "";
  };

  return (
    <View style={styles.container}>
      <View style={styles.mapHeader}>
        <View style={styles.mapHeaderLeft}>
          <View style={[styles.liveDot, isMoving && styles.liveDotActive]} />
          <Text style={styles.mapHeaderTitle}>
            {isDeliveryView ? "Delivery Route" : "Live Tracking"}
          </Text>
        </View>
        <Text style={styles.statusLabel}>{getStatusLabel()}</Text>
      </View>

      <View style={styles.mapWrap}>
        <MapView
          ref={mapRef}
          style={styles.map}
          initialRegion={{
            latitude: midLat,
            longitude: midLng,
            latitudeDelta: latDelta,
            longitudeDelta: lngDelta,
          }}
          scrollEnabled={true}
          zoomEnabled={true}
          pitchEnabled={false}
          rotateEnabled={false}
        >
          <Polyline
            coordinates={routePoints}
            strokeColor={Colors.primary}
            strokeWidth={4}
            lineDashPattern={[8, 4]}
          />

          <Marker
            coordinate={{ latitude: vendorLat, longitude: vendorLng }}
            anchor={{ x: 0.5, y: 1 }}
          >
            <View style={styles.vendorMarker}>
              <View style={styles.vendorMarkerPin}>
                <Ionicons name="storefront" size={14} color="#FFF" />
              </View>
              <View style={styles.markerPointer} />
            </View>
          </Marker>

          <Marker
            coordinate={{ latitude: customerLat, longitude: customerLng }}
            anchor={{ x: 0.5, y: 1 }}
          >
            <View style={styles.customerMarker}>
              <View style={styles.customerMarkerPin}>
                <Ionicons name="home" size={14} color="#FFF" />
              </View>
              <View style={[styles.markerPointer, { borderTopColor: "#10B981" }]} />
            </View>
          </Marker>

          {isPickedUp && (
            <Marker
              coordinate={driverPos}
              anchor={{ x: 0.5, y: 0.5 }}
            >
              <View style={styles.driverMarkerWrap}>
                <View style={styles.driverMarker}>
                  <Ionicons name="bicycle" size={18} color="#FFF" />
                </View>
              </View>
            </Marker>
          )}
        </MapView>

        {isMoving && (
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${progress}%` }]} />
          </View>
        )}
      </View>

      <View style={styles.legendRow}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: Colors.primary }]} />
          <Text style={styles.legendText}>{vendorName}</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: "#10B981" }]} />
          <Text style={styles.legendText}>{customerName || "Your Location"}</Text>
        </View>
        {isPickedUp && (
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: "#6366F1" }]} />
            <Text style={styles.legendText}>Delivery Partner</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#FFF",
    borderRadius: 20,
    overflow: "hidden",
    marginHorizontal: 20,
    marginBottom: 16,
  },
  mapHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  mapHeaderLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#CBD5E1" },
  liveDotActive: { backgroundColor: "#22C55E" },
  mapHeaderTitle: { fontFamily: "Poppins_700Bold", fontSize: 15, color: Colors.secondary },
  statusLabel: { fontFamily: "Poppins_500Medium", fontSize: 12, color: Colors.primary },
  mapWrap: { height: 220, position: "relative" },
  map: { flex: 1 },
  vendorMarker: { alignItems: "center" },
  vendorMarkerPin: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: Colors.primary,
    alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: "#FFF",
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2, shadowRadius: 4, elevation: 4,
  },
  customerMarker: { alignItems: "center" },
  customerMarkerPin: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: "#10B981",
    alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: "#FFF",
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2, shadowRadius: 4, elevation: 4,
  },
  markerPointer: {
    width: 0, height: 0,
    borderLeftWidth: 6, borderRightWidth: 6, borderTopWidth: 8,
    borderLeftColor: "transparent", borderRightColor: "transparent",
    borderTopColor: Colors.primary,
    marginTop: -2,
  },
  driverMarkerWrap: { alignItems: "center" },
  driverMarker: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: "#6366F1",
    alignItems: "center", justifyContent: "center",
    borderWidth: 3, borderColor: "#FFF",
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3, shadowRadius: 6, elevation: 6,
  },
  progressBar: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    height: 4, backgroundColor: "#E2E8F0",
  },
  progressFill: { height: 4, backgroundColor: Colors.primary, borderRadius: 2 },
  legendRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 16,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexWrap: "wrap",
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textSecondary },
});

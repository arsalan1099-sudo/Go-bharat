import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
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

export default function DeliveryTrackingMap({
  vendorName, customerName, status, isDeliveryView
}: DeliveryTrackingMapProps) {
  const [progress, setProgress] = useState(0);
  const pulseScale = useSharedValue(1);
  const isMoving = status === "PICKED" || status === "ON_THE_WAY";

  useEffect(() => {
    pulseScale.value = withRepeat(
      withSequence(withTiming(1.4, { duration: 1000 }), withTiming(1, { duration: 1000 })),
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
        if (next >= 100) { clearInterval(interval); return 100; }
        return next;
      });
    }, 1500);
    return () => clearInterval(interval);
  }, [status]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    opacity: 2 - pulseScale.value,
  }));

  const getStatusLabel = () => {
    if (status === "ACCEPTED" || status === "PREPARING") return "Preparing your order...";
    if (status === "READY") return "Ready for pickup";
    if (status === "PICKED") return "Picked up, heading to you!";
    if (status === "ON_THE_WAY") return `${Math.max(0, Math.ceil((100 - progress) / 15))} min away`;
    if (status === "DELIVERED") return "Delivered!";
    return "";
  };

  const driverLeft = `${Math.min(progress, 95)}%`;

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

      <View style={styles.trackVisual}>
        <View style={styles.routeLine}>
          <View style={styles.vendorPoint}>
            <View style={styles.vendorIcon}>
              <Ionicons name="storefront" size={16} color="#FFF" />
            </View>
            <Text style={styles.pointLabel} numberOfLines={1}>{vendorName}</Text>
          </View>

          <View style={styles.pathContainer}>
            <View style={styles.pathLine} />
            <View style={[styles.pathFill, { width: `${progress}%` }]} />

            {isMoving && (
              <View style={[styles.driverIcon, { left: driverLeft } as any]}>
                <Animated.View style={[styles.driverPulse, pulseStyle]} />
                <View style={styles.driverDot}>
                  <Ionicons name="bicycle" size={16} color="#FFF" />
                </View>
              </View>
            )}

            <View style={styles.pathDots}>
              {[0, 1, 2, 3, 4].map((i) => (
                <View key={i} style={[styles.dot, progress > (i + 1) * 20 && styles.dotActive]} />
              ))}
            </View>
          </View>

          <View style={styles.customerPoint}>
            <View style={styles.customerIcon}>
              <Ionicons name="home" size={16} color="#FFF" />
            </View>
            <Text style={styles.pointLabel} numberOfLines={1}>{customerName || "Your Location"}</Text>
          </View>
        </View>

        {isMoving && (
          <View style={styles.etaCard}>
            <Ionicons name="time-outline" size={16} color={Colors.primary} />
            <Text style={styles.etaText}>
              ETA: {Math.max(1, Math.ceil((100 - progress) / 15))} min
            </Text>
          </View>
        )}
      </View>

      {isMoving && (
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${progress}%` }]} />
        </View>
      )}
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
  trackVisual: {
    paddingHorizontal: 20,
    paddingVertical: 24,
    backgroundColor: "#F8FAFC",
    minHeight: 180,
    justifyContent: "center",
  },
  routeLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  vendorPoint: { alignItems: "center", width: 60 },
  customerPoint: { alignItems: "center", width: 60 },
  vendorIcon: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.primary,
    alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: "#FFF",
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15, shadowRadius: 4, elevation: 3,
  },
  customerIcon: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: "#10B981",
    alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: "#FFF",
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15, shadowRadius: 4, elevation: 3,
  },
  pointLabel: {
    fontFamily: "Poppins_500Medium", fontSize: 10,
    color: Colors.textSecondary, marginTop: 4, textAlign: "center",
  },
  pathContainer: {
    flex: 1, height: 40, justifyContent: "center", position: "relative",
  },
  pathLine: {
    height: 3, backgroundColor: "#E2E8F0", borderRadius: 2,
    position: "absolute", left: 0, right: 0, top: 18,
  },
  pathFill: {
    height: 3, backgroundColor: Colors.primary, borderRadius: 2,
    position: "absolute", left: 0, top: 18,
  },
  pathDots: {
    flexDirection: "row", justifyContent: "space-evenly",
    position: "absolute", left: 10, right: 10, top: 15,
  },
  dot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: "#CBD5E1", borderWidth: 1.5, borderColor: "#FFF",
  },
  dotActive: { backgroundColor: Colors.primary },
  driverIcon: {
    position: "absolute", top: 0,
    alignItems: "center", zIndex: 10,
    marginLeft: -16,
  },
  driverPulse: {
    position: "absolute", width: 40, height: 40, borderRadius: 20,
    backgroundColor: "#6366F130", top: -4,
  },
  driverDot: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: "#6366F1",
    alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: "#FFF",
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2, shadowRadius: 4, elevation: 4,
  },
  etaCard: {
    flexDirection: "row", alignItems: "center", gap: 6,
    alignSelf: "center", marginTop: 20,
    backgroundColor: Colors.primary + "10",
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
  },
  etaText: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: Colors.primary },
  progressBar: {
    height: 4, backgroundColor: "#E2E8F0",
  },
  progressFill: { height: 4, backgroundColor: Colors.primary, borderRadius: 2 },
});

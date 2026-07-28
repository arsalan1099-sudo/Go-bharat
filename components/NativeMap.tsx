import React from "react";
import { View, Text, StyleSheet, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

export function MapPlaceholder() {
  return (
    <View style={styles.placeholder}>
      <Ionicons name="map" size={64} color={Colors.textLight} />
      <Text style={styles.placeholderText}>Map view available on mobile app</Text>
      <Text style={styles.placeholderSubtext}>Scan QR code with Expo Go to see vendor map</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E8ECF4",
    gap: 8,
  },
  placeholderText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 16,
    color: Colors.textSecondary,
  },
  placeholderSubtext: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: Colors.textLight,
  },
});

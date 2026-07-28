import React from "react";
import { View, Text, Pressable } from "react-native";
import MapView, { Marker, MapPressEvent } from "react-native-maps";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";

interface Props {
  coords: { latitude: number; longitude: number };
  onPress: (lat: number, lng: number) => void;
  onConfirm: () => void;
  onClose: () => void;
}

export default function MapLocationPicker({ coords, onPress, onConfirm, onClose }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: insets.top + 8, paddingBottom: 12, backgroundColor: "#0B1E3D" }}>
        <Text style={{ fontFamily: "Poppins_700Bold", fontSize: 16, color: "#FFF" }}>Pick Store Location</Text>
        <Pressable onPress={onClose}>
          <Ionicons name="close" size={24} color="#FFF" />
        </Pressable>
      </View>
      <Text style={{ textAlign: "center", fontSize: 12, color: "#FFF", backgroundColor: "#333", paddingVertical: 6 }}>
        Tap on the map to place the store pin
      </Text>
      <MapView
        style={{ flex: 1 }}
        initialRegion={{ latitude: coords.latitude, longitude: coords.longitude, latitudeDelta: 0.01, longitudeDelta: 0.01 }}
        onPress={(e: MapPressEvent) => {
          const { latitude, longitude } = e.nativeEvent.coordinate;
          onPress(latitude, longitude);
        }}
      >
        <Marker coordinate={coords} pinColor={Colors.primary} />
      </MapView>
      <View style={{ backgroundColor: "#FFF", paddingHorizontal: 16, paddingTop: 12, paddingBottom: insets.bottom + 16 }}>
        <Text style={{ fontFamily: "Poppins_600SemiBold", fontSize: 13, color: Colors.text, textAlign: "center" }}>
          📍 {coords.latitude.toFixed(6)}, {coords.longitude.toFixed(6)}
        </Text>
        <Pressable
          style={{ backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 14, alignItems: "center", marginTop: 12 }}
          onPress={onConfirm}
        >
          <Text style={{ fontFamily: "Poppins_700Bold", fontSize: 15, color: "#FFF" }}>Confirm Location</Text>
        </Pressable>
      </View>
    </View>
  );
}

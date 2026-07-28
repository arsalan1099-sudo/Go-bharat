import React, { useRef, useEffect, useMemo, useCallback } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";

const categoryColorMap: Record<string, string> = {
  "1": "#3B82F6",
  "2": "#FF6B00",
  "3": "#8B5CF6",
  "4": "#10B981",
};

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

function escHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function computeCenter(vendors: VendorPin[]) {
  if (vendors.length === 0) return { lat: 20.5547, lng: 74.5247, zoom: 12 };
  const lats = vendors.map((v) => v.lat);
  const lngs = vendors.map((v) => v.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const spread = Math.max(maxLat - minLat, maxLng - minLng);
  const zoom = spread > 0.5 ? 10 : spread > 0.1 ? 12 : spread > 0.02 ? 13 : 14;
  return { lat: (minLat + maxLat) / 2, lng: (minLng + maxLng) / 2, zoom };
}

export default function VendorMapSection({ vendors, onVendorPress, onExpandPress, title = "Vendors Near You", countUnit = "shops" }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const vendorMapRef = useRef<Record<string, VendorPin>>({});
  const vendorDataRef = useRef<any[]>([]);
  const centerRef = useRef({ lat: 20.5547, lng: 74.5247, zoom: 12 });

  const validVendors = useMemo(
    () => vendors.filter((v) => v.lat && v.lng && v.lat !== 0 && v.lng !== 0),
    [vendors]
  );

  useEffect(() => {
    const m: Record<string, VendorPin> = {};
    validVendors.forEach((v) => { m[v.id] = v; });
    vendorMapRef.current = m;
  }, [validVendors]);

  const handleMessage = useCallback(
    (event: MessageEvent) => {
      if (iframeRef.current && event.source !== iframeRef.current.contentWindow) return;
      try {
        const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        if (data.type === "markerPress") {
          const vendor = vendorMapRef.current[data.vendorId];
          if (vendor) onVendorPress(vendor.id);
        }
      } catch {}
    },
    [onVendorPress]
  );

  useEffect(() => {
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [handleMessage]);

  const vendorData = useMemo(
    () =>
      validVendors.map((v) => ({
        id: v.id,
        name: escHtml(v.name),
        lat: v.lat,
        lng: v.lng,
        catId: v.categoryId || "2",
        isOpen: !!v.isOpen,
        initial: escHtml(v.name.charAt(0).toUpperCase()),
      })),
    [validVendors]
  );

  const center = useMemo(() => computeCenter(validVendors), [validVendors]);
  vendorDataRef.current = vendorData;
  centerRef.current = center;

  const sendInit = useCallback(() => {
    const cw = (iframeRef.current as any)?.contentWindow;
    if (!cw) return;
    cw.postMessage(JSON.stringify({
      type: "init",
      vendors: vendorDataRef.current,
      cc: categoryColorMap,
      P: Colors.primary,
      lat: centerRef.current.lat,
      lng: centerRef.current.lng,
      zoom: centerRef.current.zoom,
      mapTypeId: "roadmap",
      fullSize: false,
    }), "*");
  }, []);

  const mapFrameUrl = `${getApiUrl()}/api/map-frame`;

  if (validVendors.length === 0) return null;

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
        <iframe
          ref={iframeRef as any}
          src={mapFrameUrl}
          style={{ width: "100%", height: "100%", border: "none" } as any}
          onLoad={sendInit}
        />
        {onExpandPress && (
          <Pressable style={styles.expandBtn} onPress={onExpandPress}>
            <Ionicons name="expand-outline" size={16} color={Colors.primary} />
          </Pressable>
        )}
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
});

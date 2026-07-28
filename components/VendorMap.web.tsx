import React, { useEffect, useRef, useCallback, useMemo, useState } from "react";
import { View, StyleSheet } from "react-native";
import { Vendor } from "@/lib/types";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";

export type MapViewType = "standard" | "satellite" | "hybrid";

const categoryColorMap: Record<string, string> = {
  "1": "#3B82F6",
  "2": "#FF6B00",
  "3": "#8B5CF6",
  "4": "#10B981",
};

interface VendorMapProps {
  vendors: Array<Vendor>;
  initialRegion: {
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
  };
  onMarkerPress: (vendor: Vendor) => void;
  onMapPress: () => void;
  mapRef: React.RefObject<any>;
  mapType?: MapViewType;
  is3DStreetView?: boolean;
  showsUserLocation?: boolean;
  onVisibleCountChange?: (count: number) => void;
  userLocationCoords?: { latitude: number; longitude: number } | null;
  isDriveMode?: boolean;
  locationKey?: number;
}

/**
 * Web Explore map.
 * Primary: MapLibre GL + OpenFreeMap 3D map served at /api/explore-3d-frame
 * (genuine 3D buildings, no API key). If the 3D frame reports it cannot render
 * (no WebGL, tile/script failure, timeout) it posts {type:'mapFallback'} and we
 * transparently swap to the proven Google/Leaflet 2D map at /api/map-frame — so
 * the user never sees a blank screen.
 * All cross-origin communication uses postMessage only (the app runs on a
 * different origin from the API in dev, so direct iframe property access throws).
 */
export default function VendorMap({
  vendors,
  initialRegion,
  onMarkerPress,
  onMapPress,
  mapRef,
  mapType = "standard",
  is3DStreetView = false,
  showsUserLocation = true,
  onVisibleCountChange,
  userLocationCoords,
  isDriveMode = false,
  locationKey = 0,
}: VendorMapProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const vendorMapRef = useRef<Record<string, Vendor>>({});
  const userLocationRef = useRef<{ latitude: number; longitude: number } | null>(null);
  const iframeReadyRef = useRef(false);
  const onReadyRef = useRef<() => void>(() => {});
  const vendorDataRef = useRef<any[]>([]);
  const mapConfigRef = useRef({ lat: 20.5547, lng: 74.5247, zoom: 12, mapTypeId: "roadmap" });
  const [fallback2d, setFallback2d] = useState(false);

  // We want the 3D map whenever the user is in 3D mode AND we haven't fallen back.
  const want3D = is3DStreetView && !fallback2d;

  // Re-attempt 3D each time the user (re)enters 3D mode.
  useEffect(() => {
    if (is3DStreetView) setFallback2d(false);
  }, [is3DStreetView]);

  useEffect(() => {
    const m: Record<string, Vendor> = {};
    vendors.forEach((v) => {
      m[v.id] = v;
    });
    vendorMapRef.current = m;
  }, [vendors]);

  const effectiveMapType = is3DStreetView ? "satellite" : mapType;

  const handleMessage = useCallback(
    (event: MessageEvent) => {
      try {
        const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        if (data.type === "markerPress") {
          const vendor = vendorMapRef.current[data.vendorId];
          if (vendor) onMarkerPress(vendor);
        } else if (data.type === "mapPress") {
          onMapPress();
        } else if (data.type === "visibleCount") {
          onVisibleCountChange?.(data.count);
          if (!iframeReadyRef.current) {
            iframeReadyRef.current = true;
            onReadyRef.current?.();
          }
        } else if (data.type === "mapFallback") {
          // The 3D map could not render — switch to the reliable 2D map.
          setFallback2d(true);
        }
      } catch (e) {}
    },
    [onMarkerPress, onMapPress, onVisibleCountChange]
  );

  useEffect(() => {
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [handleMessage]);

  userLocationRef.current = userLocationCoords ?? null;

  const postToIframe = useCallback((msg: any) => {
    try {
      const cw = (iframeRef.current as any)?.contentWindow;
      if (cw) cw.postMessage(JSON.stringify(msg), "*");
    } catch {}
  }, []);

  const flyToUserInIframe = useCallback(
    (lat: number, lng: number) => {
      postToIframe({ type: "flyToUser", lat, lng });
    },
    [postToIframe]
  );

  const handleIframeReady = useCallback(() => {
    const loc = userLocationRef.current;
    if (loc) {
      setTimeout(() => flyToUserInIframe(loc.latitude, loc.longitude), 400);
    }
  }, [flyToUserInIframe]);

  onReadyRef.current = handleIframeReady;

  // Reset readiness whenever we swap between the 3D and 2D frames.
  useEffect(() => {
    iframeReadyRef.current = false;
  }, [want3D]);

  useEffect(() => {
    if (userLocationCoords) {
      flyToUserInIframe(userLocationCoords.latitude, userLocationCoords.longitude);
    }
  }, [userLocationCoords, flyToUserInIframe]);

  const escHtml = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const vendorData = useMemo(
    () =>
      vendors
        .filter((v) => {
          if (!v.lat || !v.lng || v.lat === 0 || v.lng === 0) return false;
          if (v.lat < 5 || v.lat > 38 || v.lng < 65 || v.lng > 100) return false;
          return true;
        })
        .map((v) => ({
          id: v.id,
          name: escHtml(v.name),
          lat: v.lat,
          lng: v.lng,
          catId: v.categoryId,
          isOpen: v.isOpen,
          initial: escHtml(v.name.charAt(0).toUpperCase()),
        })),
    [vendors]
  );

  const zoom = Math.max(3, Math.min(18, Math.round(14 - Math.log2(initialRegion.latitudeDelta / 0.01))));
  const useSatellite = effectiveMapType === "satellite" || effectiveMapType === "hybrid";

  vendorDataRef.current = vendorData;
  mapConfigRef.current = {
    lat: initialRegion.latitude,
    lng: initialRegion.longitude,
    zoom,
    mapTypeId: useSatellite ? "satellite" : "roadmap",
  };

  const sendInit = useCallback(() => {
    postToIframe({
      type: "init",
      vendors: vendorDataRef.current,
      cc: categoryColorMap,
      P: Colors.primary,
      ...mapConfigRef.current,
      fullSize: false,
    });
  }, [postToIframe]);

  // Push vendor list changes (filters/search) to whichever frame is live.
  useEffect(() => {
    if (!iframeReadyRef.current) return;
    postToIframe({
      type: "update",
      vendors: vendorData,
      cc: categoryColorMap,
      P: Colors.primary,
    });
  }, [vendorData, postToIframe]);

  const _flyRef = useRef(flyToUserInIframe);
  _flyRef.current = flyToUserInIframe;

  if (mapRef) {
    (mapRef as any).current = {
      animateCamera: (opts: any) => {
        const c = opts?.center;
        if (c) _flyRef.current(c.latitude, c.longitude);
      },
      animateToRegion: (region: any) => {
        if (region?.latitude) _flyRef.current(region.latitude, region.longitude);
      },
    };
  }

  const frameUrl = want3D ? `${getApiUrl()}/api/explore-3d-frame` : `${getApiUrl()}/api/map-frame`;
  const frameKey = want3D ? "explore-3d" : "map-2d";

  return (
    <View style={webStyles.container}>
      <iframe
        key={frameKey}
        ref={iframeRef as any}
        src={frameUrl}
        style={{ width: "100%", height: "100%", border: "none" } as any}
        onLoad={() => {
          iframeReadyRef.current = false;
          sendInit();
          setTimeout(() => {
            if (!iframeReadyRef.current) handleIframeReady();
          }, want3D ? 2000 : 3000);
        }}
      />
    </View>
  );
}

const webStyles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

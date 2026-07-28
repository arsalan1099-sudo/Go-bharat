import React, { useState, useRef, useMemo, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  ScrollView,
  Dimensions,
  FlatList,
  Linking,
  TextInput,
  Alert,
  ActivityIndicator,
} from "react-native";
import * as Location from "expo-location";
import { Image } from "expo-image";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import Animated, { SlideInDown, FadeIn } from "react-native-reanimated";
import Colors from "@/constants/colors";
import { vendors as staticVendors, categories as staticCategories, products } from "@/lib/data";
import { Vendor, Product } from "@/lib/types";
import { getApiUrl } from "@/lib/query-client";
import { readCachedVendorProducts, fetchVendorProducts } from "@/lib/vendorProducts";
import VendorMap from "@/components/VendorMap";
import PressableScale from "@/components/PressableScale";
import { useApp } from "@/lib/store";
import { useTabBar } from "@/lib/tabBarContext";

type MapViewType = "standard" | "satellite" | "hybrid";
type ViewMode = "standard" | "street";

const { width } = Dimensions.get("window");

const VENDOR_PLACEHOLDER_COLORS = ["#FF6B35","#4ECDC4","#45B7D1","#96CEB4","#A78BFA","#F472B6","#34D399","#FB923C","#60A5FA","#FBBF24"];
const vendorPlaceholderColor = (name: string) => {
  const h = (name || "").split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return VENDOR_PLACEHOLDER_COLORS[h % VENDOR_PLACEHOLDER_COLORS.length];
};

const MALEGAON_REGION = {
  latitude: 20.5547,
  longitude: 74.5247,
  latitudeDelta: 8,
  longitudeDelta: 8,
};

const categoryIconMap: Record<string, string> = {
  "1": "briefcase-outline",
  "2": "storefront-outline",
  "3": "build-outline",
  "4": "people-outline",
};

const categoryColorMap: Record<string, string> = {
  "1": "#3B82F6",
  "2": "#FF6B00",
  "3": "#8B5CF6",
  "4": "#10B981",
};

function VendorBottomCard({ vendor, onClose }: { vendor: Vendor; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { addToCart, cart, updateCartQuantity, removeFromCart, user } = useApp();
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const staticProducts = useMemo(() => products.filter((p) => p.vendorId === vendor.id), [vendor.id]);
  const [liveProducts, setLiveProducts] = useState<Product[]>(staticProducts);
  const vendorProducts = liveProducts.slice(0, 4);
  const catColor = categoryColorMap[vendor.categoryId] || Colors.primary;

  // Live DB vendors have no static products — load them so the map is shoppable
  // for every vendor. Reads the same AsyncStorage cache the store screen writes
  // so products show instantly, then revalidates from the server in the background.
  useEffect(() => {
    setLiveProducts(staticProducts);
    let cancelled = false;

    // Cache-first: show cached products immediately while the network revalidates.
    readCachedVendorProducts(vendor.id).then((cached) => {
      if (cached && !cancelled) setLiveProducts([...staticProducts, ...cached]);
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    fetchVendorProducts(vendor.id, { signal: controller.signal })
      .then((extra) => {
        if (cancelled) return;
        if (extra.length > 0) setLiveProducts([...staticProducts, ...extra]);
      })
      .catch(() => {})
      .finally(() => clearTimeout(timer));
    return () => { cancelled = true; controller.abort(); clearTimeout(timer); };
  }, [vendor.id, staticProducts]);
  const category = staticCategories.find((c) => c.id === vendor.categoryId);
  // Tab bar is hidden on Explore screen, so no need to account for its height
  const bottomPad = Platform.OS === "web" ? 20 : Math.max(insets.bottom, 16) + 10;

  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);
  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 1700);
  };
  const qtyOf = (pid: string) => cart.find((c) => c.product.id === pid)?.quantity ?? 0;
  const handleAdd = (p: Product) => {
    const switching = cart.length > 0 && cart[0].vendorId !== vendor.id;
    addToCart({ product: p, quantity: 1, vendorId: vendor.id, vendorName: vendor.name });
    if (user?.phone === "guest") return; // provider opens login prompt for guests
    showToast(switching ? "Started a new cart" : "Added to cart");
  };

  return (
    <Animated.View
      entering={SlideInDown.duration(300)}
      style={[styles.bottomCard, { bottom: bottomPad }]}
    >
      <View style={styles.cardHandle} />
      {toast && (
        <Animated.View entering={FadeIn.duration(160)} style={styles.toastWrap} pointerEvents="none">
          <View style={styles.toastPill}>
            <Ionicons name="checkmark-circle" size={15} color="#FFF" />
            <Text style={styles.toastText}>{toast}</Text>
          </View>
        </Animated.View>
      )}
      <PressableScale style={styles.cardClose} onPress={onClose}>
        <Ionicons name="close" size={20} color={Colors.textSecondary} />
      </PressableScale>

      <PressableScale
        style={styles.cardContent}
        onPress={() => router.push(`/store/${vendor.id}`)}
      >
        <View style={[styles.cardImage, { backgroundColor: vendorPlaceholderColor(vendor.name), alignItems: "center", justifyContent: "center" }]}>
          <Text style={{ fontFamily: "Poppins_700Bold", fontSize: 24, color: "#FFF" }}>{(vendor.name || "?")[0].toUpperCase()}</Text>
        </View>
        {vendor.hasImage && (
          <Image
            source={{ uri: `${getApiUrl()}/api/vendors/${vendor.id}/image?d=${Math.floor(Date.now() / 86400000)}` }}
            style={[styles.cardImage, { position: "absolute", top: 0, left: 0 }]}
            contentFit="cover"
            accessibilityLabel={vendor.name}
          />
        )}
        <View style={styles.cardInfo}>
          <View style={styles.cardTitleRow}>
            <Text style={styles.cardName} numberOfLines={1}>{vendor.name}</Text>
            {vendor.isOpen && (
              <View style={styles.openBadge}>
                <Text style={styles.openBadgeText}>OPEN</Text>
              </View>
            )}
          </View>
          <Text style={styles.cardDesc} numberOfLines={1}>{vendor.description}</Text>
          <View style={styles.cardMeta}>
            <View style={[styles.categoryTag, { backgroundColor: catColor + "15" }]}>
              <Ionicons name={categoryIconMap[vendor.categoryId] as any} size={11} color={catColor} />
              <Text style={[styles.categoryTagText, { color: catColor }]}>{category?.name}</Text>
            </View>
            <View style={styles.ratingTag}>
              <Ionicons name="star" size={12} color="#F59E0B" />
              <Text style={styles.ratingText}>{vendor.rating}</Text>
              <Text style={styles.reviewCountText}>({vendor.reviewCount})</Text>
            </View>
            <View style={styles.distanceTag}>
              <Ionicons name="location" size={11} color={Colors.textSecondary} />
              <Text style={styles.distanceText}>{vendor.distance}</Text>
            </View>
          </View>
          {vendor.address && (
            <View style={styles.cardAddressRow}>
              <Ionicons name="navigate-outline" size={12} color={Colors.textSecondary} />
              <Text style={styles.cardAddressText} numberOfLines={1}>{vendor.address}</Text>
            </View>
          )}
        </View>
      </PressableScale>

      {vendorProducts.length > 0 && (
        <>
          <View style={styles.popularHeader}>
            <Text style={styles.popularTitle}>Popular items</Text>
            <Text style={styles.popularHint}>Tap to view · Add to cart</Text>
          </View>
          <View style={styles.productsList}>
            {vendorProducts.map((p) => {
              const q = qtyOf(p.id);
              return (
                <View key={p.id} style={styles.productRow}>
                  <PressableScale style={styles.productRowMain} onPress={() => router.push(`/product/${p.id}`)}>
                    <Image source={{ uri: p.image }} style={styles.productRowImg} contentFit="cover" accessibilityLabel={p.name} />
                    <View style={styles.productRowInfo}>
                      <Text style={styles.productRowName} numberOfLines={1}>{p.name}</Text>
                      <Text style={styles.productRowPrice}>{"\u20B9"}{p.price}</Text>
                    </View>
                  </PressableScale>
                  {q === 0 ? (
                    <PressableScale haptic="medium" style={[styles.addBtn, { backgroundColor: catColor }]} onPress={() => handleAdd(p)} testID={`add-${p.id}`}>
                      <Ionicons name="add" size={17} color="#FFF" />
                      <Text style={styles.addBtnText}>Add</Text>
                    </PressableScale>
                  ) : (
                    <View style={[styles.stepper, { borderColor: catColor }]}>
                      <PressableScale haptic="light" style={styles.stepBtn} onPress={() => (q <= 1 ? removeFromCart(p.id) : updateCartQuantity(p.id, q - 1))} testID={`dec-${p.id}`}>
                        <Ionicons name="remove" size={16} color={catColor} />
                      </PressableScale>
                      <Text style={styles.stepQty}>{q}</Text>
                      <PressableScale haptic="light" style={styles.stepBtn} onPress={() => updateCartQuantity(p.id, q + 1)} testID={`inc-${p.id}`}>
                        <Ionicons name="add" size={16} color={catColor} />
                      </PressableScale>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        </>
      )}

      <View style={styles.cardActions}>
        <PressableScale
          haptic="light"
          style={styles.driveButton}
          onPress={() => {
            const url = `https://www.google.com/maps/dir/?api=1&destination=${vendor.lat},${vendor.lng}&travelmode=driving`;
            Linking.openURL(url).catch(() =>
              Linking.openURL(`https://maps.google.com/?daddr=${vendor.lat},${vendor.lng}`)
            );
          }}
        >
          <MaterialCommunityIcons name="navigation-variant" size={18} color="#FFF" />
          <Text style={styles.driveBtnText}>Drive</Text>
        </PressableScale>
        <PressableScale
          haptic="medium"
          style={[styles.visitButton, { backgroundColor: catColor, flex: 1 }]}
          onPress={() => router.push(`/store/${vendor.id}`)}
        >
          <Text style={styles.visitButtonText}>Visit Store</Text>
          <Ionicons name="arrow-forward" size={16} color="#FFF" />
        </PressableScale>
      </View>
    </Animated.View>
  );
}

function WebVendorListItem({ vendor, onPress }: { vendor: Vendor; onPress: () => void }) {
  const catColor = categoryColorMap[vendor.categoryId] || Colors.primary;
  const category = staticCategories.find((c) => c.id === vendor.categoryId);
  const vendorProducts = products.filter((p) => p.vendorId === vendor.id).slice(0, 2);

  return (
    <Pressable style={styles.webListItem} onPress={onPress}>
      {vendor.hasImage ? (
        <Image source={{ uri: `${getApiUrl()}/api/vendors/${vendor.id}/image` }} style={styles.webListImage} contentFit="cover" accessibilityLabel={vendor.name} />
      ) : (
        <View style={[styles.webListImage, { backgroundColor: vendorPlaceholderColor(vendor.name), alignItems: "center", justifyContent: "center" }]}>
          <Text style={{ fontFamily: "Poppins_700Bold", fontSize: 30, color: "#FFF" }}>{(vendor.name || "?")[0].toUpperCase()}</Text>
        </View>
      )}
      <View style={styles.webListInfo}>
        <View style={styles.cardTitleRow}>
          <Text style={styles.webListName} numberOfLines={1}>{vendor.name}</Text>
          {vendor.isOpen ? (
            <View style={styles.openBadge}><Text style={styles.openBadgeText}>OPEN</Text></View>
          ) : (
            <View style={[styles.openBadge, { backgroundColor: "#FEE2E2" }]}><Text style={[styles.openBadgeText, { color: "#DC2626" }]}>CLOSED</Text></View>
          )}
        </View>
        <Text style={styles.webListDesc} numberOfLines={1}>{vendor.description}</Text>
        <View style={styles.cardMeta}>
          <View style={[styles.categoryTag, { backgroundColor: catColor + "15" }]}>
            <Ionicons name={categoryIconMap[vendor.categoryId] as any} size={11} color={catColor} />
            <Text style={[styles.categoryTagText, { color: catColor }]}>{category?.name}</Text>
          </View>
          <View style={styles.ratingTag}>
            <Ionicons name="star" size={12} color="#F59E0B" />
            <Text style={styles.ratingText}>{vendor.rating}</Text>
          </View>
          <View style={styles.distanceTag}>
            <Ionicons name="location" size={11} color={Colors.textSecondary} />
            <Text style={styles.distanceText}>{vendor.distance}</Text>
          </View>
          <View style={styles.distanceTag}>
            <Ionicons name="time" size={11} color={Colors.textSecondary} />
            <Text style={styles.distanceText}>{vendor.deliveryTime}</Text>
          </View>
        </View>
        {vendorProducts.length > 0 && (
          <View style={styles.webProductRow}>
            {vendorProducts.map((p) => (
              <View key={p.id} style={styles.webProductTag}>
                <Text style={styles.webProductTagText}>{p.name} - {"\u20B9"}{p.price}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </Pressable>
  );
}

export default function ExploreScreen() {
  const insets = useSafeAreaInsets();
  const mapRef = useRef<any>(null);
  const [activeFilter, setActiveFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("street");
  const [loading3D, setLoading3D] = useState(false);
  // "standard" = road tiles (2D map), "street" = MapLibre 3D buildings (OpenFreeMap)
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null);
  const [locating, setLocating] = useState(false);
  const { addToCart, liveVendors, liveCategories } = useApp();
  const categories = liveCategories.length > 0 ? liveCategories : staticCategories;
  const vendors = useMemo(() => liveVendors, [liveVendors]);
  const [userLocation, setUserLocation] = useState<{latitude: number, longitude: number} | null>(null);
  const [mapCenter, setMapCenter] = useState(MALEGAON_REGION);
  const [mapCenterVersion, setMapCenterVersion] = useState(0);
  const [visibleCount, setVisibleCount] = useState(0);
  const [locationPermission, requestLocationPermission] = Location.useForegroundPermissions();

  const isWeb = Platform.OS === "web";
  const { hideTabBar, showTabBar } = useTabBar();

  // Hide the bottom tab bar while on the map screen; restore on unmount
  useEffect(() => {
    hideTabBar();
    return () => { showTabBar(); };
  }, []);

  // Silently fetch user location on mount so 3D fly-to lands at user's position
  useEffect(() => {
    const fetchSilently = async () => {
      try {
        if (isWeb) {
          const coords = await getWebLocation().catch(() => null);
          if (coords) setUserLocation(coords);
        } else {
          const granted = locationPermission?.granted;
          if (granted) {
            const coords = await getLocationSafe();
            if (coords) setUserLocation(coords);
          }
        }
      } catch {}
    };
    fetchSilently();
  }, [locationPermission?.granted]);

  const filteredVendors = useMemo(() => {
    let result = activeFilter === "all" ? vendors : vendors.filter((v) => v.categoryId === activeFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter((v) =>
        v.name.toLowerCase().includes(q) ||
        (v.category && v.category.toLowerCase().includes(q)) ||
        (v.address && v.address.toLowerCase().includes(q))
      );
    }
    return result;
  }, [activeFilter, vendors, searchQuery]);

  // On web/Median Android: use actual inset if available, else 30px (Android status bar)
  const topInset = Platform.OS === "web" ? (insets.top > 0 ? insets.top : 30) : insets.top;

  const filters = [
    { id: "all", label: "All", icon: "apps-outline", color: Colors.secondary },
    ...categories.map((c) => ({ id: c.id, label: c.name, icon: c.icon, color: c.color })),
  ];


  const handleMarkerPress = (vendor: Vendor) => {
    setSelectedVendor(vendor);
    mapRef.current?.animateToRegion({
      latitude: vendor.lat,
      longitude: vendor.lng,
      latitudeDelta: 0.008,
      longitudeDelta: 0.008,
    }, 400);
  };

  const getLocationSafe = async (): Promise<{latitude: number; longitude: number} | null> => {
    try {
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Low,
        maximumAge: 60000,
      });
      return { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
    } catch {}
    try {
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      return { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
    } catch {}
    try {
      const last = await Location.getLastKnownPositionAsync();
      if (last) return { latitude: last.coords.latitude, longitude: last.coords.longitude };
    } catch {}
    return null;
  };

  const getWebLocation = (): Promise<{latitude: number; longitude: number}> =>
    new Promise((resolve, reject) => {
      if (!navigator?.geolocation) { reject(new Error("no_api")); return; }
      let settled = false;
      let watchId: number | null = null;
      let lastErr: any = null;
      const clearWatch = () => {
        if (watchId !== null) {
          try { navigator.geolocation.clearWatch(watchId); } catch {}
          watchId = null;
        }
      };
      const timer = setTimeout(() => finish(false, undefined, lastErr || new Error("timeout")), 20000);
      function finish(ok: boolean, val?: {latitude: number; longitude: number}, err?: any) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        clearWatch();
        ok ? resolve(val!) : reject(err);
      }
      const onOk = (pos: any) => finish(true, { latitude: pos.coords.latitude, longitude: pos.coords.longitude });
      // Stage 3 (last resort): watchPosition — some Android WebViews only ever
      // fire a fix through watch, never through getCurrentPosition.
      const tryWatch = () => {
        try {
          watchId = navigator.geolocation.watchPosition(
            onOk,
            (err) => {
              lastErr = err;
              // Permission denied won't recover — fail fast. For transient
              // errors (timeout / position unavailable) keep the watch alive
              // and let the 20s global timer settle, in case a later fix lands.
              if (err?.code === 1) finish(false, undefined, err);
            },
            { enableHighAccuracy: true, timeout: 18000, maximumAge: 300000 }
          );
        } catch (e) {
          finish(false, undefined, lastErr || e);
        }
      };
      // Stage 2: fresh high-accuracy GPS.
      const tryHighAccuracy = () => {
        try {
          navigator.geolocation.getCurrentPosition(
            onOk,
            (err) => { lastErr = err; tryWatch(); },
            { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
          );
        } catch (e) { lastErr = e; tryWatch(); }
      };
      // Stage 1: fast network/cached position (works without a GPS hardware lock).
      try {
        navigator.geolocation.getCurrentPosition(
          onOk,
          (err) => { lastErr = err; tryHighAccuracy(); },
          { enableHighAccuracy: false, timeout: 7000, maximumAge: 300000 }
        );
      } catch (e) { lastErr = e; tryHighAccuracy(); }
    });

  const handleMyLocation = async () => {
    if (locating) return;
    setLocating(true);
    try {
      let coords: {latitude: number; longitude: number} | null = null;

      if (isWeb) {
        if (!navigator?.geolocation) {
          Alert.alert("Location Not Available", "Your browser does not support location. Please update the app.");
          return;
        }
        try {
          coords = await getWebLocation();
        } catch (err: any) {
          const code = err?.code ?? 0;
          const msg = err?.message ?? "unknown";
          if (code === 1) {
            Alert.alert(
              "Location Permission Denied",
              "Go Bharat needs location access. Open your phone Settings → Apps → Go Bharat → Permissions → Location → Allow, then come back and tap the button again."
            );
          } else if (msg === "timeout") {
            Alert.alert(
              "Location Timeout",
              "Couldn't lock your GPS in time. Turn on Location/GPS in your phone's quick settings, step near a window or go outdoors, then try again."
            );
          } else if (code === 2) {
            Alert.alert(
              "Location Unavailable",
              "Your device couldn't determine a position. Turn on Location/GPS in your phone's quick settings and try again."
            );
          } else {
            Alert.alert(
              "Location Unavailable",
              `Couldn't get your location (code ${code}). Make sure Location/GPS is turned on for your phone and this app, then try again.`
            );
          }
          return;
        }
      } else {
        if (!locationPermission?.granted) {
          const result = await requestLocationPermission();
          if (!result.granted) {
            Alert.alert("Location Access Needed", "Please allow location access in Settings.");
            return;
          }
        }
        coords = await getLocationSafe();
        if (!coords) {
          Alert.alert("Location Unavailable", "Could not determine your current location. Please check your GPS.");
          return;
        }
      }

      if (coords) {
        const newRegion = { ...coords, latitudeDelta: 0.008, longitudeDelta: 0.008 };
        setUserLocation(coords);
        setMapCenter(newRegion);
        setMapCenterVersion((v) => v + 1);
      }
    } finally {
      setLocating(false);
    }
  };


  // Fetch GPS before opening 3D so the star dive always lands at the real location
  const handleSwitch3D = async () => {
    if (viewMode === "street") { setViewMode("standard"); return; }
    if (userLocation) { setViewMode("street"); return; }
    setLoading3D(true);
    try {
      let coords: { latitude: number; longitude: number } | null = null;
      if (isWeb) {
        coords = await getWebLocation().catch(() => null);
      } else {
        if (!locationPermission?.granted) {
          await requestLocationPermission();
        }
        coords = await getLocationSafe();
      }
      if (coords) setUserLocation(coords);
    } catch {}
    setLoading3D(false);
    setViewMode("street");
  };

  return (
    <View style={styles.container}>
      <VendorMap
        vendors={filteredVendors}
        initialRegion={mapCenter}
        locationKey={mapCenterVersion}
        onMarkerPress={handleMarkerPress}
        onMapPress={() => setSelectedVendor(null)}
        mapRef={mapRef}
        mapType={viewMode === "street" ? "satellite" : "standard"}
        is3DStreetView={viewMode === "street"}
        showsUserLocation={!!userLocation || !!locationPermission?.granted}
        onVisibleCountChange={setVisibleCount}
        userLocationCoords={userLocation}
        isDriveMode={false}
      />

      {/* ── Top bar: search + Map/3D toggle side by side ── */}
      <View style={[styles.topBar, { top: topInset + 10 }]}>
        <View style={styles.searchBarFake}>
          <View style={styles.searchIconBox}>
            <Ionicons name="search" size={15} color="#FFF" />
          </View>
          <TextInput
            style={styles.searchBarInput}
            placeholder="Search vendors, categories..."
            placeholderTextColor="rgba(30,40,80,0.4)"
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
            clearButtonMode="while-editing"
            autoCorrect={false}
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery("")}>
              <Ionicons name="close-circle" size={18} color="rgba(30,40,80,0.35)" />
            </Pressable>
          )}
        </View>

        {/* Horizontal Map/3D pill — right of search bar */}
        <View style={styles.mapTogglePill}>
          <Pressable
            style={[styles.mapToggleBtn, viewMode === "standard" && styles.mapToggleBtnActiveMap]}
            onPress={() => setViewMode("standard")}
          >
            <Ionicons name="map" size={15} color={viewMode === "standard" ? Colors.primary : "#94A3B8"} />
            <Text style={[styles.mapToggleLabel, viewMode === "standard" && styles.mapToggleLabelActiveMap]}>Map</Text>
          </Pressable>
          <Pressable
            style={[styles.mapToggleBtn, viewMode === "street" && styles.mapToggleBtnActive3D]}
            onPress={handleSwitch3D}
            disabled={loading3D}
          >
            {loading3D
              ? <ActivityIndicator size={13} color={Colors.primary} />
              : <MaterialCommunityIcons name="earth" size={15} color={viewMode === "street" ? "#FFF" : "#94A3B8"} />
            }
            <Text style={[styles.mapToggleLabel, viewMode === "street" && styles.mapToggleLabelActive3D]}>3D</Text>
          </Pressable>
        </View>
      </View>

      {/* ── Category filter chips ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[styles.filterBar, { top: topInset + 68 }]}
        contentContainerStyle={styles.filterBarContent}
      >
        {filters.map((f) => {
          const isActive = activeFilter === f.id;
          return (
            <Pressable
              key={f.id}
              style={[
                styles.filterChip,
                isActive && { backgroundColor: f.color, shadowColor: f.color, shadowOpacity: 0.45, shadowRadius: 8, elevation: 6 },
              ]}
              onPress={() => setActiveFilter(f.id)}
            >
              <View style={[styles.filterChipIconBox, { backgroundColor: isActive ? "rgba(255,255,255,0.22)" : f.color + "22" }]}>
                <Ionicons name={f.icon as any} size={12} color={isActive ? "#FFF" : f.color} />
              </View>
              <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>
                {f.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* ── Live store count — bottom-left glassmorphic ── */}
      <View style={[styles.vendorCountBadge, { bottom: 24 }]}>
        <View style={styles.livePulse} />
        <Ionicons name="storefront" size={13} color="#FFF" />
        <Text style={styles.vendorCountText}>{filteredVendors.length} stores nearby</Text>
      </View>

      {/* ── My Location button — bottom-right ── */}
      <Pressable
        style={[styles.myLocationBtn, { bottom: 24 }, locating && styles.myLocationBtnActive]}
        onPress={handleMyLocation}
        disabled={locating}
      >
        <Ionicons name={locating ? "locate" : "locate-outline"} size={22} color="#FFF" />
      </Pressable>

      {selectedVendor && (
        <VendorBottomCard vendor={selectedVendor} onClose={() => setSelectedVendor(null)} />
      )}

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F0F0F0" },
  topBar: {
    position: "absolute",
    left: 12,
    right: 12,
    zIndex: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  searchBarFake: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.97)",
    borderRadius: 18,
    paddingHorizontal: 10,
    paddingVertical: 9,
    gap: 8,
    shadowColor: "#1E2850",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.9)",
  },
  searchIconBox: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  searchBarInput: {
    flex: 1,
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: Colors.secondary,
    paddingVertical: 0,
  },
  mapTogglePill: {
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.97)",
    borderRadius: 18,
    overflow: "hidden",
    shadowColor: "#1E2850",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.9)",
  },
  mapToggleBtn: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 9,
    paddingHorizontal: 11,
    gap: 2,
    minWidth: 52,
  },
  mapToggleBtnActiveMap: {
    backgroundColor: Colors.primary + "18",
  },
  mapToggleBtnActive3D: {
    backgroundColor: "#0F2C5A",
  },
  mapToggleLabel: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 9,
    color: "#94A3B8",
    letterSpacing: 0.3,
  },
  mapToggleLabelActiveMap: {
    color: Colors.primary,
  },
  mapToggleLabelActive3D: {
    color: "#FFF",
  },
  filterBar: {
    position: "absolute",
    left: 0,
    right: 0,
    zIndex: 10,
  },
  filterBarContent: {
    paddingLeft: 12,
    paddingRight: 12,
    gap: 7,
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.97)",
    borderRadius: 22,
    paddingHorizontal: 10,
    paddingVertical: 7,
    gap: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.8)",
  },
  filterChipIconBox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    backgroundColor: "rgba(0,0,0,0.07)",
    alignItems: "center",
    justifyContent: "center",
  },
  filterChipActive: {},
  filterChipText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 11,
    color: Colors.secondary,
    letterSpacing: 0.1,
  },
  filterChipTextActive: {
    color: "#FFF",
  },
  vendorCountBadge: {
    position: "absolute",
    left: 12,
    backgroundColor: "rgba(10,20,60,0.82)",
    borderRadius: 24,
    paddingHorizontal: 14,
    paddingVertical: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 6,
    zIndex: 10,
  },
  livePulse: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#22C55E",
    shadowColor: "#22C55E",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 4,
  },
  vendorCountBadgeInline: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  vendorCountText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
    color: "#FFF",
    letterSpacing: 0.2,
  },
  mapControlsColumn: {
    position: "absolute",
    bottom: 100,
    right: 16,
    alignItems: "center",
    gap: 10,
    zIndex: 10,
  },
  myLocationBtn: {
    position: "absolute",
    right: 12,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
    elevation: 7,
    zIndex: 10,
  },
  myLocationBtnActive: {
    backgroundColor: Colors.secondary,
  },
  bottomCard: {
    position: "absolute",
    left: 12,
    right: 12,
    backgroundColor: "#FFF",
    borderRadius: 20,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
    zIndex: 20,
  },
  cardHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#E5E7EB",
    alignSelf: "center",
    marginBottom: 12,
  },
  cardClose: {
    position: "absolute",
    top: 12,
    right: 12,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 5,
  },
  cardContent: {
    flexDirection: "row",
    gap: 12,
  },
  cardImage: {
    width: 72,
    height: 72,
    borderRadius: 14,
  },
  cardInfo: {
    flex: 1,
    justifyContent: "center",
  },
  cardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  cardName: {
    fontFamily: "Poppins_700Bold",
    fontSize: 16,
    color: Colors.secondary,
    flex: 1,
  },
  openBadge: {
    backgroundColor: "#DCFCE7",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  openBadgeText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 9,
    color: "#16A34A",
    letterSpacing: 0.5,
  },
  cardDesc: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  cardMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 6,
    flexWrap: "wrap" as const,
  },
  categoryTag: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    gap: 3,
  },
  categoryTagText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 10,
  },
  ratingTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  ratingText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
    color: Colors.text,
  },
  reviewCountText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 10,
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
  productsRow: {
    marginTop: 12,
  },
  productsRowContent: {
    gap: 10,
  },
  productChip: {
    flexDirection: "row",
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    padding: 6,
    gap: 8,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#F0F1F5",
  },
  productChipImage: {
    width: 40,
    height: 40,
    borderRadius: 8,
  },
  productChipInfo: {
    paddingRight: 8,
  },
  productChipName: {
    fontFamily: "Poppins_500Medium",
    fontSize: 11,
    color: Colors.text,
    maxWidth: 80,
  },
  productChipPrice: {
    fontFamily: "Poppins_700Bold",
    fontSize: 12,
    color: Colors.primary,
  },
  cardAddressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 6,
  },
  cardAddressText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
    flex: 1,
  },
  cardActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
  },
  driveButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#10B981",
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 14,
    gap: 6,
  },
  driveBtnText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
    color: "#FFF",
  },
  visitButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 14,
    gap: 8,
  },
  visitButtonText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
    color: "#FFF",
  },
  webHeader: {
    backgroundColor: "#FFF",
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F1F5",
  },
  webTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  webTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 22,
    color: Colors.secondary,
  },
  webSubtitle: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  webFilterBar: {
    backgroundColor: "#FFF",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F1F5",
  },
  webCountRow: {
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  webListItem: {
    flexDirection: "row",
    backgroundColor: "#FFF",
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  webListImage: {
    width: 100,
    height: 120,
  },
  webListInfo: {
    flex: 1,
    padding: 12,
    justifyContent: "center",
  },
  webListName: {
    fontFamily: "Poppins_700Bold",
    fontSize: 15,
    color: Colors.secondary,
    flex: 1,
  },
  webListDesc: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  webProductRow: {
    flexDirection: "row",
    gap: 6,
    marginTop: 6,
    flexWrap: "wrap" as const,
  },
  webProductTag: {
    backgroundColor: "#FFF5EE",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  webProductTagText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 10,
    color: Colors.primary,
  },
  popularHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    marginTop: 10,
    marginBottom: 6,
  },
  popularTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 13,
    color: Colors.text,
  },
  popularHint: {
    fontFamily: "Poppins_400Regular",
    fontSize: 10,
    color: Colors.textSecondary,
  },
  productsList: {
    paddingHorizontal: 16,
    gap: 8,
  },
  productRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  productRowMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  productRowImg: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: "#F1F5F9",
  },
  productRowInfo: {
    flex: 1,
  },
  productRowName: {
    fontFamily: "Poppins_500Medium",
    fontSize: 13,
    color: Colors.text,
  },
  productRowPrice: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 13,
    color: Colors.primary,
    marginTop: 1,
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: 12,
    height: 34,
    borderRadius: 9,
  },
  addBtnText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
    color: "#FFF",
  },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderRadius: 9,
    height: 34,
  },
  stepBtn: {
    width: 32,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
  },
  stepQty: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 13,
    color: Colors.text,
    minWidth: 18,
    textAlign: "center",
  },
  toastWrap: {
    position: "absolute",
    top: -46,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 20,
  },
  toastPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#0F2C5A",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 22,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 6,
  },
  toastText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12.5,
    color: "#FFF",
  },
});

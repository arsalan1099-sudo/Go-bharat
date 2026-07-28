import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  Platform,
  ScrollView,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
  cancelAnimation,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Colors from "@/constants/colors";
import { useApp } from "@/lib/store";
import { getApiUrl, getAuthToken } from "@/lib/query-client";
import {
  startOrderAlarm,
  stopOrderAlarm,
  primeOrderAlarm,
  preloadOrderAlarm,
  isOrderAlarmPrimed,
} from "@/lib/orderAlarm";
import { hapticError } from "@/lib/haptics";

type AlertRole = "VENDOR" | "FRANCHISE" | "DELIVERY";

interface AlertOrder {
  id: string;
  vendorId: string;
  vendorName: string;
  customerName: string;
  totalAmount: number;
  itemsCount: number;
  deliveryAddress: string;
  status: string;
  createdAt: string;
  // When true, ring even if the order is older than the recency window
  // (e.g. an order that just became available to a delivery partner).
  bypassRecency?: boolean;
}

const POLL_INTERVAL_MS = 9000;
const RING_WINDOW_MS = 10 * 60 * 1000; // only ring for orders placed in the last 10 minutes
const MAX_SEEN = 400;
const MUTE_KEY = "gobharat_order_alarm_muted";

const ROLE_COPY: Record<AlertRole, { title: string; subtitle: string; icon: string; viewLabel: string; viewRoute: string }> = {
  VENDOR: {
    title: "NEW ORDER!",
    subtitle: "A customer just placed an order",
    icon: "receipt",
    viewLabel: "View Orders",
    viewRoute: "/(vendor)/vendorOrders",
  },
  FRANCHISE: {
    title: "NEW ORDER IN YOUR AREA!",
    subtitle: "An order was placed in your territory",
    icon: "business",
    viewLabel: "Open Dashboard",
    viewRoute: "/(franchise)",
  },
  DELIVERY: {
    title: "NEW DELIVERY!",
    subtitle: "A new order is ready for you",
    icon: "bicycle",
    viewLabel: "View Deliveries",
    viewRoute: "/(delivery)",
  },
};

export default function NewOrderAlert() {
  const insets = useSafeAreaInsets();
  const {
    user,
    liveVendors,
    teamMembers,
    vendorApplications,
    updateOrderStatus,
    acceptDelivery,
    isOnline,
  } = useApp();

  const [queue, setQueue] = useState<AlertOrder[]>([]);
  const [muted, setMuted] = useState(false);

  const seenRef = useRef<Set<string>>(new Set());
  const seenLoadedRef = useRef(false);
  const firstPollRef = useRef(true);
  const seenKeyRef = useRef<string>("");
  const mutedRef = useRef(false);

  const role = (user?.role as AlertRole | undefined) || undefined;
  const isGuest = !user || !user.phone || user.phone === "guest";
  const eligible = !isGuest && (role === "VENDOR" || role === "FRANCHISE" || role === "DELIVERY");
  const userId = user?.id || user?.phone?.replace(/\D/g, "").slice(-10) || "";

  // Mute is scoped per role + user so it doesn't bleed across roles on a shared device.
  const muteKey = role && userId ? `${MUTE_KEY}_${role}_${userId}` : MUTE_KEY;

  // --- Load persisted mute preference for the current role/user ---
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const v = await AsyncStorage.getItem(muteKey);
        const m = v === "1";
        if (!active) return;
        setMuted(m);
        mutedRef.current = m;
      } catch {}
    })();
    return () => {
      active = false;
    };
  }, [muteKey]);

  // --- Prime web audio on the first user gesture (browser autoplay unlock) ---
  useEffect(() => {
    // Prepare the audio object eagerly so it already exists when a gesture fires.
    preloadOrderAlarm();
    if (Platform.OS !== "web") {
      // Native: warm up the sound up front (no gesture required).
      primeOrderAlarm().catch(() => {});
      return;
    }
    if (typeof document === "undefined") return;
    const detach = () => {
      try {
        document.removeEventListener("pointerdown", handler);
        document.removeEventListener("touchstart", handler);
        document.removeEventListener("keydown", handler);
      } catch {}
    };
    const handler = () => {
      // Keep retrying on each gesture until the unlock actually succeeds;
      // primeOrderAlarm() is a no-op once primed. Detach only after success.
      primeOrderAlarm()
        .then(() => {
          if (isOrderAlarmPrimed()) detach();
        })
        .catch(() => {});
    };
    try {
      document.addEventListener("pointerdown", handler);
      document.addEventListener("touchstart", handler);
      document.addEventListener("keydown", handler);
    } catch {}
    return () => {
      try {
        document.removeEventListener("pointerdown", handler);
        document.removeEventListener("touchstart", handler);
        document.removeEventListener("keydown", handler);
      } catch {}
    };
  }, []);

  // --- Load persisted "already alerted" ids whenever the signed-in user changes ---
  useEffect(() => {
    seenLoadedRef.current = false;
    if (!eligible || !userId) {
      seenRef.current = new Set();
      firstPollRef.current = true;
      seenKeyRef.current = "";
      setQueue([]);
      return;
    }
    const key = `gobharat_alerted_orders_${role}_${userId}`;
    seenKeyRef.current = key;
    firstPollRef.current = true;
    let active = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(key);
        const ids: string[] = raw ? JSON.parse(raw) : [];
        if (!active) return;
        seenRef.current = new Set(ids);
      } catch {
        if (active) seenRef.current = new Set();
      } finally {
        // Gate polling until the seen-set is loaded so the first poll can't seed
        // before stored ids arrive (which would re-ring already-known orders).
        if (active) seenLoadedRef.current = true;
      }
    })();
    return () => {
      active = false;
    };
  }, [eligible, role, userId]);

  const persistSeen = useCallback(async () => {
    if (!seenKeyRef.current) return;
    try {
      let ids = Array.from(seenRef.current);
      if (ids.length > MAX_SEEN) ids = ids.slice(ids.length - MAX_SEEN);
      seenRef.current = new Set(ids);
      await AsyncStorage.setItem(seenKeyRef.current, JSON.stringify(ids));
    } catch {}
  }, []);

  // Compute the vendor IDs that belong to this franchise owner's territory.
  // Mirrors the franchise dashboard: pin code is authoritative, franchiseId is a fallback.
  const franchiseVendorIds = useCallback((): Set<string> => {
    const myPhoneNorm = user?.phone?.replace(/\D/g, "").slice(-10) || "";
    const myPinCode = (
      teamMembers.find(
        (m) => m.role === "FRANCHISE" && (m.phone || "").replace(/\D/g, "").slice(-10) === myPhoneNorm
      )?.pinCode || ""
    ).trim();
    const ids = new Set<string>();
    const matchTerritory = (pin?: string, franchiseId?: string): boolean => {
      const p = (pin || "").trim();
      if (p && myPinCode) return p === myPinCode;
      const f = (franchiseId || "").replace(/\D/g, "").slice(-10);
      return !!f && f === myPhoneNorm;
    };
    liveVendors.forEach((v) => {
      if (matchTerritory(v.pinCode, v.franchiseId)) ids.add(v.id);
    });
    // Also include LIVE applications (vendor.id === application.id) so vendors
    // whose vendor-row pin/franchiseId is empty but whose application carries the
    // territory are still matched — mirrors the franchise dashboard.
    vendorApplications.forEach((a) => {
      if (a.status === "LIVE" && a.id && matchTerritory(a.pinCode, a.franchiseId)) ids.add(a.id);
    });
    return ids;
  }, [liveVendors, vendorApplications, teamMembers, user?.phone]);

  // --- Polling watcher ---
  useEffect(() => {
    if (!eligible) return;
    let cancelled = false;

    const mapOrder = (o: any): AlertOrder => {
      const rawItems = typeof o.items === "string" ? safeParse(o.items) : o.items || [];
      const itemsCount = Array.isArray(rawItems)
        ? rawItems.reduce((s: number, it: any) => s + (Number(it.quantity) || 1), 0)
        : 0;
      return {
        id: o.id,
        vendorId: o.vendorId || "",
        vendorName: o.vendorName || "Store",
        customerName: o.customerName || "Customer",
        totalAmount: parseFloat(o.totalAmount) || parseFloat(o.total) || 0,
        itemsCount,
        deliveryAddress: o.deliveryAddress || o.address || "",
        status: o.status || "",
        createdAt: o.createdAt ? new Date(o.createdAt).toISOString() : new Date().toISOString(),
      };
    };

    const fetchFeed = async (path: string, token: string): Promise<any[]> => {
      try {
        const res = await fetch(new URL(path, getApiUrl()).toString(), {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        if (!res.ok) return [];
        const data = await res.json();
        return Array.isArray(data.orders) ? data.orders : [];
      } catch {
        return [];
      }
    };

    const poll = async () => {
      try {
        // Wait until the persisted seen-set has loaded so the first poll seeds
        // against stored ids instead of an empty set.
        if (!seenLoadedRef.current) return;
        // Delivery partners only get rung while they are ONLINE — this mirrors
        // the delivery screen, which stops polling for assigned/available orders
        // when offline (online state is client-side in this app; there is no
        // server-side delivery online/range concept). Force a silent re-seed so
        // coming back online does not ring for orders that arrived while offline.
        if (role === "DELIVERY" && !isOnline) {
          firstPollRef.current = true;
          return;
        }
        const token = await getAuthToken();
        if (!token || cancelled) return;

        let candidates: AlertOrder[] = [];
        if (role === "VENDOR") {
          const rows = await fetchFeed("/api/orders/vendor", token);
          candidates = rows.map(mapOrder).filter((o) => o.status === "PENDING");
        } else if (role === "DELIVERY") {
          const [assigned, available] = await Promise.all([
            fetchFeed("/api/orders/delivery", token),
            fetchFeed("/api/orders/available", token),
          ]);
          const byId = new Map<string, AlertOrder>();
          assigned.map(mapOrder).forEach((o) => {
            if (!["DELIVERED", "CANCELLED"].includes(o.status)) byId.set(o.id, o);
          });
          available.map(mapOrder).forEach((o) => {
            // An order that just became available is actionable now regardless of
            // when it was originally placed — bypass the placement-time recency guard.
            if (o.status === "READY") byId.set(o.id, { ...o, bypassRecency: true });
          });
          candidates = Array.from(byId.values());
        } else if (role === "FRANCHISE") {
          const rows = await fetchFeed("/api/orders/all", token);
          const myIds = franchiseVendorIds();
          candidates = rows
            .map(mapOrder)
            .filter((o) => o.status === "PENDING" && myIds.has(o.vendorId));
        }

        if (cancelled) return;

        const now = Date.now();
        const fresh: AlertOrder[] = [];
        for (const o of candidates) {
          if (seenRef.current.has(o.id)) continue;
          seenRef.current.add(o.id);
          if (firstPollRef.current) continue; // seed silently on first poll
          if (o.bypassRecency) {
            fresh.push(o);
            continue;
          }
          const age = now - new Date(o.createdAt).getTime();
          if (age >= 0 && age <= RING_WINDOW_MS) fresh.push(o);
        }

        if (firstPollRef.current) {
          firstPollRef.current = false;
          await persistSeen();
          return;
        }

        if (fresh.length > 0) {
          await persistSeen();
          setQueue((prev) => {
            const existing = new Set(prev.map((p) => p.id));
            const add = fresh.filter((f) => !existing.has(f.id));
            return add.length > 0 ? [...prev, ...add] : prev;
          });
        }
      } catch {}
    };

    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [eligible, role, isOnline, franchiseVendorIds, persistSeen]);

  // --- Drive the alarm based on whether anything is queued ---
  useEffect(() => {
    if (queue.length > 0 && !muted) {
      startOrderAlarm().catch(() => {});
      if (Platform.OS !== "web") {
        try { hapticError(); } catch {}
      }
    } else {
      stopOrderAlarm().catch(() => {});
    }
  }, [queue.length, muted]);

  useEffect(() => {
    return () => {
      stopOrderAlarm().catch(() => {});
    };
  }, []);

  const current = queue[0];

  const dequeue = useCallback(() => {
    setQueue((prev) => prev.slice(1));
  }, []);

  const toggleMute = useCallback(async () => {
    const next = !mutedRef.current;
    mutedRef.current = next;
    setMuted(next);
    try {
      await AsyncStorage.setItem(muteKey, next ? "1" : "0");
    } catch {}
  }, [muteKey]);

  const handleAccept = useCallback(async () => {
    if (!current) return;
    const order = current;
    primeOrderAlarm().catch(() => {});

    if (role === "VENDOR") {
      try {
        updateOrderStatus(order.id, "ACCEPTED");
      } catch {}
      dequeue();
      return;
    }

    if (role === "DELIVERY") {
      // The server is the source of truth for delivery assignment. Call the
      // authoritative endpoint (same one the delivery screen uses) and only
      // acknowledge once it actually succeeds, so the alarm keeps ringing if
      // the order was not assigned (e.g. network failure).
      try {
        const token = await getAuthToken();
        const res = await fetch(
          new URL(`/api/orders/${order.id}/accept-delivery`, getApiUrl()).toString(),
          {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          }
        );
        if (!res.ok) {
          const data = await res.json().catch(() => ({} as any));
          try { hapticError(); } catch {}
          // If the order is gone or already taken by someone else, stop ringing for it.
          if (res.status === 404 || res.status === 409 || res.status === 410) {
            seenRef.current.add(order.id);
            dequeue();
          }
          Alert.alert("Could not accept", data?.error || "This order may already be taken.");
          return;
        }
        // Mirror the server assignment into local state, then acknowledge.
        try { acceptDelivery(order.id); } catch {}
        dequeue();
      } catch {
        try { hapticError(); } catch {}
        Alert.alert("Network Error", "Could not reach the server. Please try again.");
      }
      return;
    }

    dequeue();
  }, [current, role, updateOrderStatus, acceptDelivery, dequeue]);

  const handleView = useCallback(() => {
    if (!role) return;
    primeOrderAlarm().catch(() => {});
    const route = ROLE_COPY[role].viewRoute;
    dequeue();
    try {
      router.push(route as any);
    } catch {}
  }, [role, dequeue]);

  if (!eligible || !current || !role) return null;

  const copy = ROLE_COPY[role];
  const canAccept = role === "VENDOR" || role === "DELIVERY";

  return (
    <Modal visible transparent animationType="fade" onRequestClose={dequeue} statusBarTranslucent>
      <View style={styles.backdrop}>
        <View style={[styles.card, { marginTop: insets.top + 12, marginBottom: insets.bottom + 12 }]}>
          <Pressable
            style={styles.muteBtn}
            onPress={toggleMute}
            hitSlop={12}
            testID="alert-mute-toggle"
          >
            <Ionicons
              name={muted ? "volume-mute" : "volume-high"}
              size={20}
              color={muted ? Colors.textLight : Colors.primary}
            />
          </Pressable>

          <PulsingBell icon={copy.icon} />

          <Text style={styles.title}>{copy.title}</Text>
          <Text style={styles.subtitle}>{copy.subtitle}</Text>

          {queue.length > 1 && (
            <View style={styles.countPill}>
              <Text style={styles.countPillText}>+{queue.length - 1} more waiting</Text>
            </View>
          )}

          <ScrollView style={styles.summary} contentContainerStyle={{ padding: 16 }} bounces={false}>
            <Row label="Order" value={`#${shortId(current.id)}`} />
            <Row label="Store" value={current.vendorName} />
            <Row label="Customer" value={current.customerName} />
            <Row label="Items" value={`${current.itemsCount} item${current.itemsCount === 1 ? "" : "s"}`} />
            <Row label="Amount" value={`₹${current.totalAmount.toFixed(0)}`} highlight />
            {!!current.deliveryAddress && (
              <Row label="Deliver to" value={current.deliveryAddress} multiline />
            )}
          </ScrollView>

          <View style={styles.actions}>
            {canAccept && (
              <Pressable
                style={[styles.btn, styles.acceptBtn]}
                onPress={handleAccept}
                testID="alert-accept"
              >
                <Ionicons name="checkmark-circle" size={20} color="#FFF" />
                <Text style={styles.acceptText}>Accept</Text>
              </Pressable>
            )}
            <Pressable
              style={[styles.btn, styles.viewBtn]}
              onPress={handleView}
              testID="alert-view"
            >
              <Ionicons name="open-outline" size={18} color={Colors.primary} />
              <Text style={styles.viewText}>{copy.viewLabel}</Text>
            </Pressable>
          </View>

          <Pressable style={styles.dismiss} onPress={dequeue} hitSlop={8} testID="alert-dismiss">
            <Text style={styles.dismissText}>Dismiss</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function PulsingBell({ icon }: { icon: string }) {
  const scale = useSharedValue(1);
  const rotate = useSharedValue(0);

  useEffect(() => {
    scale.value = withRepeat(
      withSequence(
        withTiming(1.12, { duration: 450, easing: Easing.out(Easing.ease) }),
        withTiming(1, { duration: 450, easing: Easing.in(Easing.ease) })
      ),
      -1,
      false
    );
    rotate.value = withRepeat(
      withSequence(
        withTiming(-0.12, { duration: 120 }),
        withTiming(0.12, { duration: 120 }),
        withTiming(0, { duration: 120 })
      ),
      -1,
      false
    );
    return () => {
      cancelAnimation(scale);
      cancelAnimation(rotate);
    };
  }, [scale, rotate]);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { rotateZ: `${rotate.value}rad` }],
  }));

  return (
    <View style={styles.bellWrap}>
      <Animated.View style={[styles.bellCircle, style]}>
        <Ionicons name={icon as any} size={44} color="#FFF" />
      </Animated.View>
    </View>
  );
}

function Row({
  label,
  value,
  highlight,
  multiline,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  multiline?: boolean;
}) {
  return (
    <View style={[styles.row, multiline && { alignItems: "flex-start" }]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text
        style={[styles.rowValue, highlight && styles.rowValueHighlight]}
        numberOfLines={multiline ? 3 : 1}
      >
        {value}
      </Text>
    </View>
  );
}

function shortId(id: string): string {
  return id.length > 6 ? id.slice(-6).toUpperCase() : id.toUpperCase();
}

function safeParse(s: string): any[] {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.78)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "#FFF",
    borderRadius: 24,
    paddingTop: 28,
    paddingBottom: 18,
    paddingHorizontal: 18,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 16,
  },
  muteBtn: {
    position: "absolute",
    top: 14,
    right: 14,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.background,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
  bellWrap: {
    marginBottom: 14,
  },
  bellCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: Colors.primary,
    shadowOpacity: 0.5,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  title: {
    fontFamily: "Poppins_700Bold",
    fontSize: 22,
    color: Colors.text,
    textAlign: "center",
  },
  subtitle: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: Colors.textLight,
    textAlign: "center",
    marginTop: 4,
  },
  countPill: {
    marginTop: 10,
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
  },
  countPillText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
    color: "#B45309",
  },
  summary: {
    alignSelf: "stretch",
    maxHeight: 230,
    marginTop: 16,
    backgroundColor: Colors.background,
    borderRadius: 16,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 7,
  },
  rowLabel: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: Colors.textLight,
    marginRight: 12,
  },
  rowValue: {
    fontFamily: "Poppins_500Medium",
    fontSize: 14,
    color: Colors.text,
    flexShrink: 1,
    textAlign: "right",
  },
  rowValueHighlight: {
    fontFamily: "Poppins_700Bold",
    fontSize: 16,
    color: Colors.primary,
  },
  actions: {
    flexDirection: "row",
    alignSelf: "stretch",
    gap: 10,
    marginTop: 18,
  },
  btn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
    borderRadius: 14,
  },
  acceptBtn: {
    backgroundColor: "#10B981",
  },
  acceptText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 15,
    color: "#FFF",
  },
  viewBtn: {
    backgroundColor: "#FFF",
    borderWidth: 1.5,
    borderColor: Colors.primary,
  },
  viewText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 15,
    color: Colors.primary,
  },
  dismiss: {
    marginTop: 12,
    paddingVertical: 6,
  },
  dismissText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 13,
    color: Colors.textLight,
  },
});

import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet, Animated, Easing, Dimensions } from "react-native";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useApp } from "@/lib/store";

const { width, height } = Dimensions.get("window");

export default function SplashScreen() {
  const { user } = useApp();
  const hasNavigated = useRef(false);

  const bgScale    = useRef(new Animated.Value(0)).current;
  const bgOpacity  = useRef(new Animated.Value(0)).current;
  const logoScale  = useRef(new Animated.Value(0.6)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const textTransY  = useRef(new Animated.Value(16)).current;
  const tagOpacity  = useRef(new Animated.Value(0)).current;
  const barWidth   = useRef(new Animated.Value(0)).current;
  const screenOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Phase 1: White logo card scales in (0–400ms)
    Animated.parallel([
      Animated.spring(bgScale, {
        toValue: 1,
        tension: 60,
        friction: 8,
        useNativeDriver: true,
      }),
      Animated.timing(bgOpacity, {
        toValue: 1,
        duration: 350,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.spring(logoScale, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }),
      Animated.timing(logoOpacity, {
        toValue: 1,
        duration: 400,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start(() => {
      // Phase 2: Brand name slides up (400–750ms)
      Animated.parallel([
        Animated.timing(textOpacity, {
          toValue: 1,
          duration: 320,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(textTransY, {
          toValue: 0,
          duration: 320,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start(() => {
        // Phase 3: Tagline fades in
        Animated.timing(tagOpacity, {
          toValue: 1,
          duration: 280,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }).start();
      });
    });

    // Loading bar fills over 1900ms (starts at 300ms delay)
    Animated.timing(barWidth, {
      toValue: 1,
      duration: 1900,
      delay: 300,
      easing: Easing.bezier(0.25, 0.1, 0.25, 1),
      useNativeDriver: false,
    }).start();

    // Navigate at 2.3s
    const timer = setTimeout(() => {
      if (hasNavigated.current) return;
      hasNavigated.current = true;

      // Fade out before leaving
      Animated.timing(screenOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start(() => {
        const roleRoute: Record<string, string> = {
          CUSTOMER: "/(customer)",
          VENDOR: "/(vendor)",
          DELIVERY: "/(delivery)",
          FRANCHISE: "/(franchise)",
          MARKETING: "/(marketing)",
          SUPER_ADMIN: "/(admin)",
        };
        if (user) {
          router.replace(roleRoute[user.role] as any);
        } else {
          router.replace("/auth" as any);
        }
      });
    }, 2300);

    return () => clearTimeout(timer);
  }, [user]);

  return (
    <Animated.View style={[styles.container, { opacity: screenOpacity }]}>
      {/* Orange radial glow behind the card */}
      <View style={styles.glow} />

      {/* White logo card */}
      <Animated.View
        style={[
          styles.logoCard,
          {
            opacity: bgOpacity,
            transform: [{ scale: bgScale }],
          },
        ]}
      >
        <Animated.View style={{ transform: [{ scale: logoScale }], opacity: logoOpacity }}>
          <Image
            source={require("@/assets/images/go-bharat-logo-nobg.png")}
            style={styles.logo}
            contentFit="contain"
            accessibilityLabel="Go Bharat"
          />
        </Animated.View>
      </Animated.View>

      {/* Brand name */}
      <Animated.Text
        style={[
          styles.brandName,
          {
            opacity: textOpacity,
            transform: [{ translateY: textTransY }],
          },
        ]}
      >
        Go Bharat
      </Animated.Text>

      {/* Tagline */}
      <Animated.Text style={[styles.tagline, { opacity: tagOpacity }]}>
        Your Local Marketplace
      </Animated.Text>

      {/* Bottom loading bar */}
      <View style={styles.bottomArea}>
        <View style={styles.track}>
          <Animated.View
            style={[
              styles.fill,
              {
                width: barWidth.interpolate({
                  inputRange: [0, 1],
                  outputRange: ["0%", "100%"],
                }),
              },
            ]}
          />
        </View>
        <Text style={styles.poweredBy}>Powered by AASAA PVT. LTD.</Text>
      </View>
    </Animated.View>
  );
}

const CARD_SIZE = Math.min(width * 0.48, 200);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFF",
  },
  glow: {
    position: "absolute",
    width: CARD_SIZE * 2.2,
    height: CARD_SIZE * 2.2,
    borderRadius: CARD_SIZE * 1.1,
    backgroundColor: "#FF6B00",
    opacity: 0.07,
  },
  logoCard: {
    width: CARD_SIZE,
    height: CARD_SIZE,
    borderRadius: 32,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#FF6B00",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 12,
  },
  logo: {
    width: CARD_SIZE * 0.82,
    height: CARD_SIZE * 0.82,
  },
  brandName: {
    marginTop: 24,
    fontFamily: "Poppins_700Bold",
    fontSize: 30,
    color: "#1A1A2E",
    letterSpacing: 0.5,
  },
  tagline: {
    marginTop: 6,
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: "#FF6B00",
    letterSpacing: 1.2,
  },
  bottomArea: {
    position: "absolute",
    bottom: 56,
    width: "52%",
    alignItems: "center",
    gap: 12,
  },
  track: {
    width: "100%",
    height: 3,
    backgroundColor: "rgba(0,0,0,0.07)",
    borderRadius: 2,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    backgroundColor: "#FF6B00",
    borderRadius: 2,
  },
  poweredBy: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    color: "rgba(0,0,0,0.3)",
    letterSpacing: 0.5,
  },
});

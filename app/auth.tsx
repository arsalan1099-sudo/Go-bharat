import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  Platform,
  ScrollView,
  KeyboardAvoidingView,
  Alert,
  ActivityIndicator,
} from "react-native";
import { Image } from "expo-image";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, {
  FadeInDown,
  FadeIn,
} from "react-native-reanimated";
import Colors from "@/constants/colors";
import { useApp } from "@/lib/store";
import { getApiUrl, setAuthToken } from "@/lib/query-client";
import { UserRole, TeamMember } from "@/lib/types";


const routeMap: Record<UserRole, string> = {
  CUSTOMER: "/(customer)",
  VENDOR: "/(vendor)",
  DELIVERY: "/(delivery)",
  FRANCHISE: "/(franchise)",
  MARKETING: "/(marketing)",
  SUPER_ADMIN: "/(admin)",
};

// POST helper that survives the brief connectivity gaps the app hits right after
// a publish/restart: it retries on a network throw and on 5xx (server momentarily
// unavailable while it boots), with a short backoff. 2xx/4xx responses are parsed
// and returned for the caller to interpret — a 200 with { success:false } (e.g. a
// wrong OTP) is a normal result, not a retryable failure.
async function postJsonWithRetry(
  url: string,
  body: unknown,
  retries = 2,
  baseDelayMs = 700,
): Promise<any> {
  let lastError: unknown = new Error("request failed");
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      // Retry only on gateway / unavailable statuses: these mean the request
      // never reached a ready app instance (e.g. mid-deploy), so a one-time OTP
      // can't have been consumed. Do NOT retry a 500 from the app itself —
      // /api/otp/verify consumes the code before it can fail, so retrying would
      // hit an already-used code and surface a misleading "Invalid OTP".
      if (resp.status === 502 || resp.status === 503 || resp.status === 504) {
        lastError = new Error(`server responded ${resp.status}`);
      } else {
        return await resp.json();
      }
    } catch (err) {
      lastError = err;
    }
    // Reached only on a network error or a 5xx — back off and retry.
    if (attempt < retries) {
      await new Promise((r) => setTimeout(r, baseDelayMs * (attempt + 1)));
      continue;
    }
    throw lastError;
  }
  throw lastError;
}

export default function AuthScreen() {
  const insets = useSafeAreaInsets();
  const { login, getRegisteredMember, vendorApplications, adminPhone: ADMIN_PHONE, teamMembers } = useApp();
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [otpTimer, setOtpTimer] = useState(30);
  const [canResend, setCanResend] = useState(false);
  const [selectedRole, setSelectedRole] = useState<UserRole>("CUSTOMER");
  const [detectedMember, setDetectedMember] = useState<TeamMember | null>(null);
  const otpRefs = useRef<(TextInput | null)[]>([]);
  const otpHiddenRef = useRef<TextInput>(null);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [otpEmailSent, setOtpEmailSent] = useState(false);
  const [otpMaskedEmail, setOtpMaskedEmail] = useState<string | null>(null);
  const [whatsappSent, setWhatsappSent] = useState(false);
  const [smsSent, setSmsSent] = useState(false);
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [adminKey, setAdminKey] = useState("");
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  // ── Google sign-in (web-only, customer-only) ──────────────────────────────
  const [googleLinkToken, setGoogleLinkToken] = useState<string | null>(null);
  const [googleEmail, setGoogleEmail] = useState<string | null>(null);
  const [googleReady, setGoogleReady] = useState(false);
  const googleHandlerRef = useRef<(resp: any) => void>(() => {});
  const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID;

  // Hidden inside the Android WebView wrapper (Median): Google blocks its
  // standard OAuth (GIS) flow in embedded WebViews ("disallowed_useragent"), so
  // the GIS button only shows in real web browsers.
  const isWebViewBrowser = () => {
    if (Platform.OS !== "web" || typeof navigator === "undefined") return false;
    const ua = navigator.userAgent || "";
    return /median|gonative|; wv\)|\bwv\b/i.test(ua);
  };
  // Running inside the Median/GoNative Android wrapper. Median injects a native
  // Social Login bridge (window.median / window.gonative) that performs Google
  // sign-in with the native SDK (allowed by Google) and hands back an ID token.
  const isMedianApp = () => {
    if (Platform.OS !== "web" || typeof navigator === "undefined") return false;
    const ua = navigator.userAgent || "";
    if (/median|gonative/i.test(ua)) return true;
    if (typeof window === "undefined") return false;
    const bridge = (window as any).median || (window as any).gonative;
    return !!bridge?.socialLogin?.google?.login;
  };
  // GIS button: only in real web browsers. Native button: only inside Median.
  const googleAvailable = Platform.OS === "web" && !!GOOGLE_CLIENT_ID && !isWebViewBrowser();
  const googleNativeAvailable = Platform.OS === "web" && isMedianApp();
  const [googleNativeBusy, setGoogleNativeBusy] = useState(false);

  // Trigger Median's NATIVE Google sign-in. The native SDK returns a standard
  // Google ID token (`idToken`), which we feed into the same server flow the web
  // build uses (`/api/auth/google` via handleGoogleCredential) so the phone-link
  // identity model is preserved end to end.
  const handleMedianGoogleLogin = () => {
    if (googleNativeBusy) return;
    setOtpError(null);
    const bridge = (window as any).median || (window as any).gonative;
    if (!bridge?.socialLogin?.google?.login) {
      setOtpError("Google sign-in isn't available in this app version. Please update the app or continue with your phone number.");
      return;
    }
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
    setGoogleNativeBusy(true);
    try {
      bridge.socialLogin.google.login({
        scope: "email profile",
        callback: (resp: any) => {
          setGoogleNativeBusy(false);
          if (!resp || resp.error || !resp.idToken) {
            // Cancellation is silent; a real error surfaces a hint.
            if (resp && resp.error) {
              setOtpError("Google sign-in didn't complete. Please try again or use your phone number.");
            }
            return;
          }
          // Existing handler expects { credential: <Google ID token> }.
          googleHandlerRef.current({ credential: resp.idToken });
        },
      });
    } catch {
      setGoogleNativeBusy(false);
      setOtpError("Couldn't start Google sign-in. Please try again.");
    }
  };

  const handleGoogleCredential = async (response: any) => {
    const credential = response?.credential;
    if (!credential) return;
    setOtpError(null);
    try {
      const baseUrl = getApiUrl();
      const resp = await fetch(`${baseUrl}api/auth/google`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential }),
      });
      const data = await resp.json();
      if (!resp.ok || !data.success) {
        setOtpError(data.error || "Google sign-in failed. Please try again.");
        return;
      }
      if (data.linked && data.token) {
        // Returning Google user — phone already linked, sign straight in.
        await setAuthToken(data.token);
        const serverPhone = (data.phone || "").toString();
        if (serverPhone) setPhone(serverPhone);
        const confirmedRole = (data.role as UserRole) || "CUSTOMER";
        await handleFinalLogin(confirmedRole, data.name || undefined, data.id || undefined, serverPhone || undefined);
        return;
      }
      if (data.needsPhoneLink) {
        // First Google sign-in — collect + verify a phone, then link it.
        setGoogleLinkToken(data.linkToken);
        setGoogleEmail(data.email || null);
        setSelectedRole("CUSTOMER");
        setDetectedMember(null);
        setStep("phone");
      }
    } catch {
      setOtpError("Network error during Google sign-in. Please try again.");
    }
  };
  // Always point the GIS callback at the latest handler to avoid stale closures.
  googleHandlerRef.current = handleGoogleCredential;

  // Load the Google Identity Services script (web only) and initialise it once.
  useEffect(() => {
    if (!googleAvailable || typeof document === "undefined") return;
    let cancelled = false;
    const init = () => {
      const g = (window as any).google;
      if (!g?.accounts?.id) return false;
      g.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (resp: any) => googleHandlerRef.current(resp),
        ux_mode: "popup",
      });
      if (!cancelled) setGoogleReady(true);
      return true;
    };
    if (!document.getElementById("gsi-script")) {
      const s = document.createElement("script");
      s.src = "https://accounts.google.com/gsi/client";
      s.async = true;
      s.defer = true;
      s.id = "gsi-script";
      document.head.appendChild(s);
    }
    // Poll until the GIS library is ready. Covers all cases: script not yet
    // added, script present but still loading, or already loaded.
    if (!init()) {
      let tries = 0;
      const timer = setInterval(() => {
        if (cancelled || init() || tries++ > 50) clearInterval(timer);
      }, 100);
      return () => { cancelled = true; clearInterval(timer); };
    }
    return () => { cancelled = true; };
  }, [googleAvailable]);

  // Render Google's official button into its container on the phone step.
  useEffect(() => {
    if (!googleAvailable || !googleReady || step !== "phone" || typeof document === "undefined") return;
    const g = (window as any).google;
    const el = document.getElementById("gsiButtonContainer");
    if (el && g?.accounts?.id) {
      el.innerHTML = "";
      g.accounts.id.renderButton(el, {
        type: "standard",
        theme: "outline",
        size: "large",
        text: "continue_with",
        shape: "pill",
        logo_alignment: "center",
        width: 300,
      });
    }
  }, [googleAvailable, googleReady, step]);

  useEffect(() => {
    if (step === "otp") {
      setOtpTimer(30);
      setCanResend(false);
      const interval = setInterval(() => {
        setOtpTimer((prev) => {
          if (prev <= 1) {
            clearInterval(interval);
            setCanResend(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [step]);

  const sendOtpToServer = async (memberEmail?: string, memberName?: string, memberRole?: string) => {
    setSendingOtp(true);
    setOtpError(null);
    setWhatsappSent(false);
    setSmsSent(false);
    setDevOtp(null);
    setOtpEmailSent(false);
    setOtpMaskedEmail(null);
    try {
      const baseUrl = getApiUrl();
      const resp = await fetch(`${baseUrl}api/otp/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, email: memberEmail, name: memberName, role: memberRole, adminKey: adminKey || undefined }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        setOtpError(data.error || "Failed to send OTP. Please try again.");
        setStep("phone");
        return;
      }
      if (data.whatsappSent) {
        setWhatsappSent(true);
      }
      if (data.emailSent) {
        setOtpEmailSent(true);
        setOtpMaskedEmail(data.maskedEmail);
      }
      if (data.smsSent) {
        setSmsSent(true);
      }
      // If the server returned an on-screen code, don't show the delivery
      // failure error — the user can log in with the code shown below.
      if (data.deliveryFailed && !data.devOtp) {
        setOtpError("Couldn't send your code right now. Please tap Resend OTP to try again.");
      }
      // On-screen OTP. The SERVER is the gatekeeper for whether a code is
      // returned (development always; production only under the temporary
      // SHOW_OTP_ON_SCREEN flag, and only for customer phones). If present, show
      // it and pre-fill the boxes. Auto-submit only in development; in production
      // the user sees the code and taps Verify themselves.
      if (data.devOtp) {
        setDevOtp(data.devOtp);
        const digits = data.devOtp.split("").slice(0, 6);
        setOtp(digits);
        if (__DEV__ && !data.whatsappSent && !data.smsSent && !data.emailSent) {
          setTimeout(() => handleVerifyOTP(data.devOtp), 1200);
        }
      }
    } catch (err) {
      setOtpError("Network error. Please check your connection and try again.");
      setStep("phone");
    } finally {
      setSendingOtp(false);
    }
  };

  const handleSendOTP = () => {
    if (phone.length >= 10) {
      try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
      let memberEmail: string | undefined;
      let memberName: string | undefined;
      let memberRole: string | undefined;

      const cleanAdminPhone = ADMIN_PHONE.replace(/\D/g, "").slice(-10);
      if (phone.replace(/\D/g, "").slice(-10) === cleanAdminPhone) {
        setSelectedRole("SUPER_ADMIN");
        setDetectedMember({ id: "admin", name: "Super Admin", phone: ADMIN_PHONE, email: "admin@gobharat.in", role: "SUPER_ADMIN", city: "Malegaon", status: "ACTIVE", createdBy: "System", createdByRole: "SUPER_ADMIN", createdAt: new Date().toISOString() } as any);
        memberEmail = "admin@gobharat.in";
        memberName = "Super Admin";
        memberRole = "Super Admin";
      } else {
        const member = getRegisteredMember(phone);
        if (member) {
          const roleMap: Record<string, UserRole> = {
            MARKETING: "MARKETING",
            DELIVERY: "DELIVERY",
            FRANCHISE: "FRANCHISE",
            SUPER_ADMIN: "SUPER_ADMIN",
          };
          const mappedRole = roleMap[member.role] || "CUSTOMER";
          setSelectedRole(mappedRole);
          setDetectedMember(member);
          memberEmail = member.email;
          memberName = member.name;
          memberRole = member.role;
        } else {
          const cleanedPhone = phone.replace(/\D/g, "").slice(-10);
          const vendorApp = vendorApplications.find(a => a.phone.replace(/\D/g, "").slice(-10) === cleanedPhone && (a.status === "APPROVED" || a.status === "LIVE"));
          if (vendorApp) {
            setSelectedRole("VENDOR");
            setDetectedMember({ id: vendorApp.id, name: vendorApp.ownerName, phone: vendorApp.phone, email: vendorApp.email, role: "VENDOR" as any, city: vendorApp.city, status: "ACTIVE", createdBy: "System", createdByRole: "SUPER_ADMIN", createdAt: vendorApp.submittedAt } as any);
            memberEmail = vendorApp.email;
            memberName = vendorApp.ownerName;
            memberRole = "Vendor";
          } else {
            setSelectedRole("CUSTOMER");
            setDetectedMember(null);
          }
        }
      }
      setOtp(["", "", "", "", "", ""]);
      setStep("otp");
      sendOtpToServer(memberEmail, memberName, memberRole);
    }
  };

  const handleVerifyOTP = async (overrideCode?: string) => {
    // Only honour a real string code. This handler is also reachable from a
    // Pressable onPress, which would otherwise pass a GestureResponderEvent in
    // as `overrideCode`; serializing that event into the request body makes
    // JSON.stringify throw on its circular refs, which previously surfaced as a
    // bogus "Connection error" with no request ever reaching the server.
    const code = (typeof overrideCode === "string" ? overrideCode : undefined) ?? otp.join("");
    if (code.length < 6) return;
    setVerifyingOtp(true);
    setOtpError(null);
    const baseUrl = getApiUrl();

    // Phase 1 — the network call. ONLY a genuine connection failure (or the
    // server being momentarily unavailable while it boots after a publish)
    // should surface as a "Connection error". postJsonWithRetry rides out a
    // brief post-publish blip or a flaky WebView connection before giving up.
    let data: any;
    try {
      data = await postJsonWithRetry(`${baseUrl}api/otp/verify`, {
        phone,
        code,
        role: selectedRole,
      });
    } catch {
      setOtpError("Connection error. Please try again.");
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); } catch {}
      setVerifyingOtp(false);
      return;
    }

    // Phase 2 — a wrong or expired code is NOT a connection problem.
    if (!data?.success) {
      setOtpError(data?.error || "Invalid OTP");
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); } catch {}
      setVerifyingOtp(false);
      return;
    }

    // Phase 3 — verification succeeded and the server issued a token, so the
    // user IS authenticated. Every step from here on is LOCAL (token storage,
    // context login, navigation). None of it may be reported as a "Connection
    // error", and a failure must never strand an authenticated user on the OTP
    // screen — that was the original bug: a post-login navigation/context throw
    // fell into the catch-all and showed "Connection error" despite success.
    try {
      if (data.token) {
        await setAuthToken(data.token);
      }
      // If this verification is part of a Google sign-in, persist the
      // Google-to-phone link now that the phone is verified.
      if (googleLinkToken && data.token) {
        const tokenForLink = googleLinkToken;
        const authToken = data.token;
        // Attempt the Google→phone link. Returns "conflict" when the Google
        // account is already linked to a different phone (handled separately
        // so we can ask the user to deliberately re-link instead of silently
        // overwriting their existing account's link).
        const attemptLink = async (confirmRelink: boolean) => {
          try {
            const linkResp = await fetch(`${baseUrl}api/auth/google/link`, {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
              body: JSON.stringify({ linkToken: tokenForLink, confirmRelink }),
            });
            const linkData = await linkResp.json().catch(() => ({}));
            if (linkResp.ok && linkData?.success === true) return { status: "ok" as const };
            if (linkResp.status === 409 && linkData?.conflict) {
              return { status: "conflict" as const, data: linkData };
            }
            return { status: "failed" as const };
          } catch {
            return { status: "failed" as const };
          }
        };

        const result = await attemptLink(false);
        setGoogleLinkToken(null);
        setGoogleEmail(null);
        if (result.status === "conflict") {
          // The Google account already belongs to a different phone. Let the
          // user choose: move the Google link to the number they just verified,
          // or leave it where it is (no silent overwrite, no data loss — the
          // other account stays reachable via its own phone OTP).
          try {
            Alert.alert(
              "Google already linked",
              `This Google account is already linked to ${result.data?.existingPhoneMasked || "another number"}. Move it to ${result.data?.verifiedPhoneMasked || "this number"} instead? Your other account stays safe — you can still sign in to it with its phone number.`,
              [
                { text: "Keep on other number", style: "cancel" },
                {
                  text: "Move it here",
                  onPress: () => { attemptLink(true); },
                },
              ],
            );
          } catch {}
        } else if (result.status === "failed") {
          // Phone is verified so we still sign the user in, but make clear the
          // Google link did not complete (expired link or non-customer role).
          try {
            Alert.alert(
              "Google not linked",
              "Your phone was verified and you're signed in, but we couldn't link your Google account. You can try Google sign-in again later.",
            );
          } catch {}
        }
      }
    } catch {
      // Token storage / Google-link bookkeeping failed, but the phone IS
      // verified. Press on and sign the user in rather than blocking them.
    }

    // Use server-confirmed role for routing (not just what the user selected).
    const confirmedRole = (data.role as UserRole) || selectedRole;
    try {
      await handleFinalLogin(confirmedRole, data.name || undefined, data.id || undefined);
    } catch {
      // Already authenticated — best-effort route into the app so a navigation
      // hiccup can't leave the user stuck on the OTP screen.
      try { router.replace(routeMap[confirmedRole] as any); } catch {}
    } finally {
      setVerifyingOtp(false);
    }
  };

  const handleFinalLogin = async (confirmedRole?: UserRole, serverName?: string, serverId?: string, phoneOverride?: string) => {
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
    const roleToUse = confirmedRole || selectedRole;
    const phoneToUse = phoneOverride || phone;
    // Sign in to context. Guard it so a context-side throw can never prevent the
    // navigation below — the user has already been verified server-side.
    try { login(phoneToUse, roleToUse, serverName, serverId); } catch {}
    if (roleToUse !== "SUPER_ADMIN") {
      try {
        const termsData = await AsyncStorage.getItem("gobharat_terms_accepted");
        const acceptedRoles: string[] = termsData ? JSON.parse(termsData) : [];
        if (!acceptedRoles.includes(roleToUse)) {
          router.replace({ pathname: "/accept-terms", params: { role: roleToUse } } as any);
          return;
        }
      } catch {
        router.replace({ pathname: "/accept-terms", params: { role: roleToUse } } as any);
        return;
      }
    }
    router.replace(routeMap[roleToUse] as any);
  };

  const handleOtpChange = (value: string, index: number) => {
    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);
    if (value && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }
    if (index === 5 && value && newOtp.join("").length === 6) {
      setTimeout(() => {
        handleVerifyOTP(newOtp.join(""));
      }, 300);
    }
  };

  const handleOtpKeyPress = (e: any, index: number) => {
    if (e.nativeEvent.key === "Backspace" && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  // Single hidden input handler — works reliably on Android WebView / Median
  const handleHiddenOtpChange = (text: string) => {
    const digits = text.replace(/\D/g, "").slice(0, 6);
    const arr = [...digits.split(""), ...Array(6).fill("")].slice(0, 6);
    setOtp(arr);
    if (digits.length === 6) {
      setTimeout(() => handleVerifyOTP(digits), 300);
    }
  };

  const handleResendOTP = () => {
    if (!canResend) return;
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
    setOtpTimer(30);
    setCanResend(false);
    setOtp(["", "", "", "", "", ""]);
    setOtpError(null);
    setTimeout(() => otpHiddenRef.current?.focus(), 100);
    sendOtpToServer(detectedMember?.email, detectedMember?.name, detectedMember?.role);
    const interval = setInterval(() => {
      setOtpTimer((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setCanResend(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleSkipLogin = () => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
    login("guest", "CUSTOMER");
    router.replace("/(customer)" as any);
  };

  return (
    <View style={styles.container}>
      <View style={[styles.topBanner, { paddingTop: topInset + 8 }]}>
        {step === "otp" && (
          <Pressable
            style={styles.backButton}
            onPress={() => {
              setDetectedMember(null);
              setStep("phone");
            }}
          >
            <Ionicons name="arrow-back" size={22} color="#0B1E3D" />
          </Pressable>
        )}
        <View style={styles.bannerContent}>
          <Image source={require("@/assets/images/go-bharat-logo-nobg.png")} style={styles.bannerLogo} contentFit="contain" accessibilityLabel="Go Bharat logo" />
        </View>

        {step === "otp" && (
          <View style={styles.stepTracker}>
            <View style={styles.stepItem}>
              <View style={[styles.stepCircle, styles.stepCircleDone]}>
                <Ionicons name="checkmark" size={12} color="#FFF" />
              </View>
              <Text style={styles.stepLabel}>Phone</Text>
            </View>
            <View style={[styles.stepConnector, styles.stepConnectorActive]} />
            <View style={styles.stepItem}>
              <View style={[styles.stepCircle, styles.stepCircleActive]}>
                <Text style={[styles.stepNum, { color: "#FFF" }]}>2</Text>
              </View>
              <Text style={styles.stepLabel}>OTP</Text>
            </View>
          </View>
        )}
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={0}>
        <ScrollView
          contentContainerStyle={[styles.formScroll, { paddingBottom: bottomInset + 24 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {step === "phone" && (
            <Animated.View entering={FadeInDown.duration(400)} style={styles.formBlock}>
              <Text style={styles.formHeading}>Login or Sign Up</Text>
              <Text style={styles.formDesc}>Enter your mobile number to continue</Text>

              {googleLinkToken && googleEmail && (
                <View style={styles.googleLinkBanner}>
                  <Ionicons name="logo-google" size={18} color="#4285F4" />
                  <Text style={styles.googleLinkBannerText}>
                    Signed in as <Text style={styles.googleLinkBannerEmail}>{googleEmail}</Text>. Verify your phone number to finish.
                  </Text>
                </View>
              )}

              <View style={styles.phoneRow}>
                <View style={styles.countryBox}>
                  <Text style={styles.flagEmoji}>IN</Text>
                  <Text style={styles.countryCodeText}>+91</Text>
                  <Ionicons name="chevron-down" size={14} color={Colors.textSecondary} />
                </View>
                <TextInput
                  style={styles.phoneInput}
                  placeholder="Mobile Number"
                  placeholderTextColor="#B0B5BC"
                  keyboardType="phone-pad"
                  maxLength={10}
                  value={phone}
                  onChangeText={setPhone}
                  autoFocus
                />
              </View>

              {phone.replace(/\D/g, "").slice(-10) === ADMIN_PHONE.replace(/\D/g, "").slice(-10) && (
                <View style={{ marginTop: 12 }}>
                  <TextInput
                    style={{ width: "100%", backgroundColor: "#F7F8FA", borderRadius: 14, paddingHorizontal: 18, paddingVertical: 16, fontFamily: "Poppins_500Medium", fontSize: 17, color: Colors.text, borderWidth: 1.5, borderColor: "#EAEDF2" }}
                    placeholder="Admin security key"
                    placeholderTextColor="#B0B5BC"
                    secureTextEntry
                    autoCapitalize="none"
                    autoCorrect={false}
                    value={adminKey}
                    onChangeText={setAdminKey}
                  />
                  <Text style={{ fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary, marginTop: 6, marginLeft: 4 }}>Required to show the admin code on screen.</Text>
                </View>
              )}

              {phone.length > 0 && phone.length < 10 && (
                <Text style={styles.phoneHint}>Enter 10-digit mobile number</Text>
              )}

              {otpError && (
                <View style={{ backgroundColor: "#FEF2F2", borderRadius: 10, padding: 12, marginBottom: 12, flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: "#FECACA" }}>
                  <Ionicons name="alert-circle" size={18} color="#DC2626" />
                  <Text style={{ fontFamily: "Poppins_500Medium", fontSize: 13, color: "#DC2626", flex: 1 }}>{otpError}</Text>
                </View>
              )}

              <Pressable
                style={[styles.continueBtn, phone.length < 10 && styles.continueBtnDisabled]}
                onPress={handleSendOTP}
                disabled={phone.length < 10}
              >
                <LinearGradient
                  colors={phone.length >= 10 ? ["#FF6B00", "#FF8A33"] : ["#FFD4B0", "#FFD4B0"]}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={styles.continueBtnGradient}
                >
                  <Text style={styles.continueBtnText}>Send OTP</Text>
                  <Ionicons name="arrow-forward" size={18} color="#FFF" style={{ marginLeft: 8 }} />
                </LinearGradient>
              </Pressable>

              <Pressable style={styles.forgotPasswordRow} onPress={() => router.push("/forgot-password" as any)}>
                <Ionicons name="lock-closed-outline" size={14} color={Colors.primary} />
                <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
              </Pressable>

              <View style={styles.orRow}>
                <View style={styles.orLine} />
                <Text style={styles.orText}>or</Text>
                <View style={styles.orLine} />
              </View>

              {googleAvailable && (
                <View nativeID="gsiButtonContainer" style={styles.googleBtnWrap} />
              )}

              {googleNativeAvailable && (
                <Pressable
                  style={[styles.googleNativeBtn, googleNativeBusy && styles.continueBtnDisabled]}
                  onPress={handleMedianGoogleLogin}
                  disabled={googleNativeBusy}
                >
                  {googleNativeBusy ? (
                    <ActivityIndicator color="#4285F4" size="small" />
                  ) : (
                    <>
                      <Ionicons name="logo-google" size={18} color="#4285F4" />
                      <Text style={styles.googleNativeBtnText}>Continue with Google</Text>
                    </>
                  )}
                </Pressable>
              )}

              <View style={styles.socialRow}>
                <Pressable style={styles.socialBtn} onPress={handleSkipLogin}>
                  <Ionicons name="person-outline" size={18} color={Colors.textSecondary} />
                  <Text style={styles.socialBtnText}>Browse as Guest</Text>
                </Pressable>
              </View>

              <Text style={styles.termsText}>
                By continuing, you agree to Go Bharat's{" "}
                <Text style={styles.termsLink} onPress={() => router.push("/terms" as any)}>Terms of Use</Text> &{" "}
                <Text style={styles.termsLink} onPress={() => router.push("/privacy" as any)}>Privacy Policy</Text>
              </Text>

              <View style={styles.secureRow}>
                <Ionicons name="lock-closed" size={12} color="#10B981" />
                <Text style={styles.secureText}>Your data is safe & encrypted</Text>
              </View>
            </Animated.View>
          )}

          {step === "otp" && (
            <Animated.View entering={FadeInDown.duration(400)} style={styles.formBlock}>
              <Text style={styles.formHeading}>Verify OTP</Text>
              <Text style={styles.formDesc}>
                {whatsappSent ? (
                  <>We've sent a 6-digit code on WhatsApp to{"\n"}<Text style={styles.phoneHighlight}>+91 {phone.slice(0, 5)} {phone.slice(5)}</Text></>
                ) : smsSent ? (
                  <>We've sent a 6-digit code via SMS to{"\n"}<Text style={styles.phoneHighlight}>+91 {phone.slice(0, 5)} {phone.slice(5)}</Text></>
                ) : otpEmailSent && otpMaskedEmail ? (
                  <>We've sent a 6-digit code to{"\n"}<Text style={styles.phoneHighlight}>{otpMaskedEmail}</Text></>
                ) : (
                  <>We've sent a 6-digit code to{"\n"}<Text style={styles.phoneHighlight}>+91 {phone.slice(0, 5)} {phone.slice(5)}</Text></>
                )}
              </Text>

              {detectedMember && (
                <Animated.View entering={FadeIn.duration(400)} style={styles.detectedMemberBadge}>
                  <View style={styles.detectedIconWrap}>
                    <Ionicons name={whatsappSent ? "logo-whatsapp" : otpEmailSent ? "mail" : "shield-checkmark"} size={20} color="#10B981" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.detectedTitle}>Welcome back, {detectedMember.name}!</Text>
                    <Text style={styles.detectedSubtitle}>
                      {whatsappSent ? `OTP sent to your WhatsApp` : smsSent ? `OTP sent via SMS` : otpEmailSent ? `OTP sent to your registered email` : `Your account is verified and ready`}
                    </Text>
                  </View>
                  <Ionicons name="checkmark-circle" size={22} color="#10B981" />
                </Animated.View>
              )}

              {devOtp && (
                <View style={{ backgroundColor: "#FFF3E0", borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1.5, borderColor: "#FF6B00" }}>
                  <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 6 }}>
                    <Ionicons name="information-circle-outline" size={16} color="#E65100" style={{ marginRight: 6 }} />
                    <Text style={{ fontSize: 12, color: "#E65100", fontWeight: "700", flex: 1 }}>Use this code to log in</Text>
                  </View>
                  <Text style={{ fontSize: 32, color: "#FF6B00", fontWeight: "700", letterSpacing: 8, textAlign: "center", marginVertical: 6 }}>{devOtp}</Text>
                  <Text style={{ fontSize: 11, color: "#E65100", textAlign: "center" }}>Temporary on-screen code while SMS/WhatsApp delivery is being fixed.</Text>
                </View>
              )}


              {/* Single hidden input captures all 6 digits — reliable on Android WebView */}
              <Pressable onPress={() => otpHiddenRef.current?.focus()} style={styles.otpRow}>
                <TextInput
                  ref={otpHiddenRef}
                  value={otp.join("")}
                  onChangeText={handleHiddenOtpChange}
                  keyboardType="number-pad"
                  maxLength={6}
                  autoFocus
                  caretHidden
                  style={{ position: "absolute", opacity: 0, width: 1, height: 1 }}
                />
                {otp.map((digit, i) => (
                  <View key={i} style={[styles.otpBox, digit ? styles.otpBoxFilled : null, otp.join("").length === i ? styles.otpBoxActive : null]}>
                    <Text style={styles.otpDigitText}>{digit}</Text>
                  </View>
                ))}
              </Pressable>

              {otpError && (
                <Animated.View entering={FadeIn.duration(200)} style={{ backgroundColor: "#FEF2F2", borderRadius: 10, padding: 12, marginBottom: 12, flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: "#FECACA" }}>
                  <Ionicons name="alert-circle" size={18} color="#DC2626" />
                  <Text style={{ fontFamily: "Poppins_500Medium", fontSize: 13, color: "#DC2626", flex: 1 }}>{otpError}</Text>
                </Animated.View>
              )}

              <Pressable
                style={[styles.continueBtn, (otp.join("").length < 6 || verifyingOtp) && styles.continueBtnDisabled]}
                onPress={() => handleVerifyOTP()}
                disabled={otp.join("").length < 6 || verifyingOtp}
              >
                <LinearGradient
                  colors={otp.join("").length >= 6 && !verifyingOtp ? ["#FF6B00", "#FF8A33"] : ["#FFD4B0", "#FFD4B0"]}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={styles.continueBtnGradient}
                >
                  {verifyingOtp ? (
                    <ActivityIndicator color="#FFF" size="small" />
                  ) : (
                    <Text style={styles.continueBtnText}>Verify & Login</Text>
                  )}
                </LinearGradient>
              </Pressable>

              <View style={styles.otpFooter}>
                <Pressable style={styles.changeNumBtn} onPress={() => { setStep("phone"); }}>
                  <Ionicons name="pencil" size={14} color={Colors.primary} />
                  <Text style={styles.changeNumText}>Change Number</Text>
                </Pressable>
                {canResend ? (
                  <Pressable onPress={handleResendOTP} style={styles.resendBtn}>
                    <Ionicons name="refresh" size={14} color={Colors.primary} />
                    <Text style={styles.resendActiveText}>Resend OTP</Text>
                  </Pressable>
                ) : (
                  <View style={styles.timerRow}>
                    <Ionicons name="time-outline" size={14} color={Colors.textLight} />
                    <Text style={styles.timerText}>
                      Resend in <Text style={styles.timerCount}>00:{otpTimer.toString().padStart(2, "0")}</Text>
                    </Text>
                  </View>
                )}
              </View>

              <View style={styles.otpTipBox}>
                <MaterialCommunityIcons name="information-outline" size={16} color={Colors.textSecondary} />
                <Text style={styles.otpTipText}>
                  {whatsappSent
                    ? `Check WhatsApp for the 6-digit verification code.`
                    : smsSent
                    ? `Check your SMS inbox for the 6-digit verification code.`
                    : otpEmailSent
                    ? `Check your email for the 6-digit verification code.`
                    : `Enter the 6-digit verification code to continue.`
                  }
                </Text>
              </View>
            </Animated.View>
          )}

        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFF" },
  topBanner: { paddingHorizontal: 20, paddingBottom: 20, backgroundColor: "#FFF" },
  backButton: { width: 36, height: 36, borderRadius: 12, backgroundColor: "#F0F0F0", alignItems: "center", justifyContent: "center", marginBottom: 10 },
  bannerContent: { alignItems: "center", justifyContent: "center" },
  bannerLogo: { width: 180, height: 120 },
  bannerTitle: { fontFamily: "Poppins_700Bold", fontSize: 22, color: "#0B1E3D", letterSpacing: 2 },
  bannerTagline: { fontFamily: "Poppins_400Regular", fontSize: 12, color: "rgba(0,0,0,0.45)", marginTop: 1 },
  stepTracker: { flexDirection: "row", alignItems: "center", justifyContent: "center", marginTop: 16, gap: 0 },
  stepItem: { alignItems: "center", gap: 4 },
  stepCircle: { width: 26, height: 26, borderRadius: 13, backgroundColor: "#EAEDF2", alignItems: "center", justifyContent: "center" },
  stepCircleActive: { backgroundColor: Colors.primary },
  stepCircleDone: { backgroundColor: "#10B981" },
  stepNum: { fontFamily: "Poppins_600SemiBold", fontSize: 11, color: "#999" },
  stepLabel: { fontFamily: "Poppins_400Regular", fontSize: 10, color: "#666" },
  stepConnector: { width: 40, height: 2, backgroundColor: "#EAEDF2", marginHorizontal: 4 },
  stepConnectorActive: { backgroundColor: Colors.primary },
  stepConnectorDone: { backgroundColor: "#10B981" },
  formScroll: { paddingHorizontal: 24, paddingTop: 28 },
  formBlock: { gap: 20 },
  formHeading: { fontFamily: "Poppins_700Bold", fontSize: 24, color: Colors.secondary },
  formDesc: { fontFamily: "Poppins_400Regular", fontSize: 14, color: Colors.textSecondary, lineHeight: 22, marginTop: -8 },
  phoneRow: { flexDirection: "row", gap: 10, overflow: "hidden" },
  countryBox: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#F7F8FA", borderRadius: 14, paddingHorizontal: 14, paddingVertical: 16, borderWidth: 1.5, borderColor: "#EAEDF2" },
  flagEmoji: { fontFamily: "Poppins_700Bold", fontSize: 12, color: Colors.secondary },
  countryCodeText: { fontFamily: "Poppins_600SemiBold", fontSize: 16, color: Colors.secondary },
  phoneInput: { flex: 1, minWidth: 0, backgroundColor: "#F7F8FA", borderRadius: 14, paddingHorizontal: 18, paddingVertical: 16, fontFamily: "Poppins_500Medium", fontSize: 17, color: Colors.text, borderWidth: 1.5, borderColor: "#EAEDF2" },
  phoneHint: { fontFamily: "Poppins_400Regular", fontSize: 12, color: "#EF4444", marginTop: -12, marginLeft: 4 },
  continueBtn: { borderRadius: 14, overflow: "hidden", shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 10, elevation: 4 },
  continueBtnDisabled: { opacity: 0.5, shadowOpacity: 0 },
  continueBtnGradient: { paddingVertical: 17, flexDirection: "row", alignItems: "center", justifyContent: "center" },
  continueBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 16, color: "#FFF", letterSpacing: 0.5 },
  orRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  orLine: { flex: 1, height: 1, backgroundColor: "#EAEDF2" },
  orText: { fontFamily: "Poppins_500Medium", fontSize: 13, color: Colors.textLight },
  socialRow: { flexDirection: "row", gap: 12 },
  socialBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 14, borderWidth: 1.5, borderColor: "#EAEDF2", backgroundColor: "#FFF" },
  socialBtnText: { fontFamily: "Poppins_500Medium", fontSize: 14, color: Colors.text },
  googleBtnWrap: { alignItems: "center", justifyContent: "center", minHeight: 44 },
  googleNativeBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 15, borderRadius: 14, borderWidth: 1.5, borderColor: "#DADCE0", backgroundColor: "#FFF", minHeight: 52 },
  googleNativeBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 15, color: "#3C4043" },
  googleLinkBanner: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#EFF6FF", borderRadius: 12, padding: 12, borderWidth: 1, borderColor: "#BFDBFE", marginTop: -8 },
  googleLinkBannerText: { fontFamily: "Poppins_400Regular", fontSize: 12, color: "#1E3A8A", flex: 1, lineHeight: 18 },
  googleLinkBannerEmail: { fontFamily: "Poppins_600SemiBold", color: "#1D4ED8" },
  termsText: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textLight, textAlign: "center", lineHeight: 18 },
  termsLink: { color: Colors.primary, fontFamily: "Poppins_500Medium" },
  secureRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  secureText: { fontFamily: "Poppins_400Regular", fontSize: 11, color: "#10B981" },
  forgotPasswordRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 4 },
  forgotPasswordText: { fontFamily: "Poppins_500Medium", fontSize: 14, color: Colors.primary },
  phoneHighlight: { fontFamily: "Poppins_600SemiBold", color: Colors.secondary },
  otpRow: { flexDirection: "row", justifyContent: "center", gap: 10 },
  otpBox: { width: 48, height: 56, borderRadius: 14, borderWidth: 2, borderColor: "#EAEDF2", backgroundColor: "#F7F8FA", alignItems: "center", justifyContent: "center" },
  otpBoxFilled: { borderColor: Colors.primary, backgroundColor: "#FFF5ED" },
  otpBoxActive: { borderColor: Colors.primary, borderWidth: 2.5 },
  otpDigitText: { fontFamily: "Poppins_700Bold", fontSize: 22, color: Colors.secondary },
  otpFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  changeNumBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingVertical: 6 },
  changeNumText: { fontFamily: "Poppins_500Medium", fontSize: 13, color: Colors.primary },
  timerRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  timerText: { fontFamily: "Poppins_400Regular", fontSize: 13, color: Colors.textLight },
  timerCount: { fontFamily: "Poppins_600SemiBold", color: Colors.secondary },
  resendBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingVertical: 6 },
  resendActiveText: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: Colors.primary },
  detectedMemberBadge: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#ECFDF5", borderRadius: 14, padding: 14, borderWidth: 1.5, borderColor: "#10B981", marginBottom: 4 },
  detectedIconWrap: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#D1FAE5", alignItems: "center", justifyContent: "center" },
  detectedTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: "#065F46" },
  detectedSubtitle: { fontFamily: "Poppins_400Regular", fontSize: 12, color: "#047857", marginTop: 1 },
  otpTipBox: { flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: "#F7F8FA", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "#EAEDF2" },
  otpTipText: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary, flex: 1, lineHeight: 18 },
  roleList: { gap: 10 },
  roleCard: { flexDirection: "row", alignItems: "center", padding: 14, borderRadius: 16, borderWidth: 2, borderColor: "#F0F1F5", backgroundColor: "#FAFBFE", gap: 14 },
  roleIconWrap: { width: 46, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  roleInfo: { flex: 1 },
  roleLabel: { fontFamily: "Poppins_600SemiBold", fontSize: 15, color: Colors.text },
  roleDesc: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary, marginTop: 1 },
  radioOuter: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: "#D1D5DB", alignItems: "center", justifyContent: "center" },
  radioInner: { width: 12, height: 12, borderRadius: 6 },
  roleHintBox: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#FFF5ED", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "#FFE0C2" },
  roleHintText: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary, flex: 1, lineHeight: 18 },
  roleSectionTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 15, color: Colors.secondary, marginBottom: 2 },
  roleGrid: { gap: 8 },
  rolePill: { flexDirection: "row", alignItems: "center", padding: 12, borderRadius: 14, borderWidth: 1.5, borderColor: "#F0F1F5", backgroundColor: "#FAFBFE", gap: 12 },
  rolePillIcon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  rolePillLabel: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: Colors.text },
  rolePillDesc: { fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textSecondary, marginTop: 1 },
});

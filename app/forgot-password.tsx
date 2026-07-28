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
} from "react-native";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Image } from "expo-image";
import Colors from "@/constants/colors";
import { useApp } from "@/lib/store";

type Step = "phone" | "otp" | "password" | "success";

export default function ForgotPasswordScreen() {
  const insets = useSafeAreaInsets();
  const { getRegisteredMember, adminPhone } = useApp();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [otpTimer, setOtpTimer] = useState(30);
  const [canResend, setCanResend] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [accountName, setAccountName] = useState("");
  const [accountRole, setAccountRole] = useState("");
  const otpRefs = useRef<(TextInput | null)[]>([]);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (step === "otp" && otpTimer > 0) {
      interval = setInterval(() => {
        setOtpTimer((prev) => {
          if (prev <= 1) { setCanResend(true); return 0; }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [step, otpTimer]);

  const handleSendOtp = () => {
    const clean = phone.replace(/\D/g, "");
    if (clean.length !== 10) {
      Alert.alert("Invalid Number", "Please enter a valid 10-digit phone number");
      return;
    }

    let found = false;
    if (clean === adminPhone) {
      setAccountName("Super Admin");
      setAccountRole("SUPER_ADMIN");
      found = true;
    } else {
      const member = getRegisteredMember(clean);
      if (member) {
        setAccountName(member.name);
        setAccountRole(member.role);
        found = true;
      }
    }

    if (!found) {
      setAccountName("User");
      setAccountRole("CUSTOMER");
    }

    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
    setOtp(["", "", "", "", "", ""]);
    setOtpTimer(30);
    setCanResend(false);
    setStep("otp");
    setTimeout(() => otpRefs.current[0]?.focus(), 300);
  };

  const handleOtpChange = (value: string, index: number) => {
    if (!/^\d*$/.test(value)) return;
    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);
    if (value && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }
    if (newOtp.every((d) => d !== "") && newOtp.join("").length === 6) {
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
      setTimeout(() => setStep("password"), 300);
    }
  };

  const handleOtpBackspace = (index: number) => {
    if (otp[index] === "" && index > 0) {
      otpRefs.current[index - 1]?.focus();
      const newOtp = [...otp];
      newOtp[index - 1] = "";
      setOtp(newOtp);
    }
  };

  const handleResendOtp = () => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
    setOtpTimer(30);
    setCanResend(false);
    setOtp(["", "", "", "", "", ""]);
    otpRefs.current[0]?.focus();
  };

  const handleResetPassword = () => {
    if (password.length < 6) {
      Alert.alert("Weak Password", "Password must be at least 6 characters");
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert("Mismatch", "Passwords do not match");
      return;
    }
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
    setStep("success");
  };

  const passwordStrength = (): { label: string; color: string; width: string } => {
    if (password.length === 0) return { label: "", color: "transparent", width: "0%" };
    if (password.length < 4) return { label: "Weak", color: "#EF4444", width: "25%" };
    if (password.length < 6) return { label: "Fair", color: "#F59E0B", width: "50%" };
    const hasUpper = /[A-Z]/.test(password);
    const hasNumber = /\d/.test(password);
    const hasSpecial = /[!@#$%^&*]/.test(password);
    const score = [hasUpper, hasNumber, hasSpecial, password.length >= 8].filter(Boolean).length;
    if (score >= 3) return { label: "Strong", color: "#10B981", width: "100%" };
    return { label: "Good", color: "#3B82F6", width: "75%" };
  };

  const strength = passwordStrength();

  const stepLabels: { key: Step; label: string; num: string }[] = [
    { key: "phone", label: "Phone", num: "1" },
    { key: "otp", label: "OTP", num: "2" },
    { key: "password", label: "Reset", num: "3" },
  ];

  const getStepIndex = (s: Step) => {
    if (s === "phone") return 0;
    if (s === "otp") return 1;
    if (s === "password" || s === "success") return 2;
    return 0;
  };
  const currentStepIdx = getStepIndex(step);

  return (
    <View style={s.container}>
      <View style={[s.topBanner, { paddingTop: topInset + 8 }]}>
        <Pressable
          style={s.backButton}
          onPress={() => {
            if (step === "otp") { setStep("phone"); return; }
            if (step === "password") { setStep("otp"); return; }
            router.back();
          }}
        >
          <Ionicons name="arrow-back" size={22} color="#0B1E3D" />
        </Pressable>
        <View style={s.bannerContent}>
          <Image source={require("@/assets/images/go-bharat-logo-nobg.png")} style={s.bannerLogo} contentFit="contain" accessibilityLabel="Go Bharat logo" />
        </View>

        {step !== "success" && (
          <View style={s.stepTracker}>
            {stepLabels.map((sl, i) => (
              <React.Fragment key={sl.key}>
                {i > 0 && (
                  <View style={[s.stepConnector, i <= currentStepIdx && s.stepConnectorActive]} />
                )}
                <View style={s.stepItem}>
                  <View style={[
                    s.stepCircle,
                    i < currentStepIdx && s.stepCircleDone,
                    i === currentStepIdx && s.stepCircleActive,
                  ]}>
                    {i < currentStepIdx ? (
                      <Ionicons name="checkmark" size={12} color="#FFF" />
                    ) : (
                      <Text style={[s.stepNum, i === currentStepIdx && { color: "#FFF" }]}>{sl.num}</Text>
                    )}
                  </View>
                  <Text style={s.stepLabel}>{sl.label}</Text>
                </View>
              </React.Fragment>
            ))}
          </View>
        )}
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={0}>
        <ScrollView
          contentContainerStyle={[s.formScroll, { paddingBottom: bottomInset + 24 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {step === "phone" && (
            <Animated.View entering={Platform.OS !== "web" ? FadeInDown.duration(400) : undefined} style={s.formBlock}>
              <View style={s.lockIconRow}>
                <View style={s.lockIconCircle}>
                  <Ionicons name="lock-closed" size={32} color={Colors.primary} />
                </View>
              </View>
              <Text style={s.formHeading}>Forgot Password?</Text>
              <Text style={s.formDesc}>
                Don't worry! Enter your registered phone number and we'll send you a verification code.
              </Text>

              <View style={s.phoneRow}>
                <View style={s.countryBox}>
                  <Text style={s.flagEmoji}>IN</Text>
                  <Text style={s.countryCodeText}>+91</Text>
                  <Ionicons name="chevron-down" size={14} color={Colors.textSecondary} />
                </View>
                <TextInput
                  style={s.phoneInput}
                  placeholder="Mobile Number"
                  placeholderTextColor="#B0B5BC"
                  keyboardType="phone-pad"
                  maxLength={10}
                  value={phone}
                  onChangeText={(t) => setPhone(t.replace(/\D/g, "").slice(0, 10))}
                  autoFocus
                />
              </View>

              {phone.length > 0 && phone.length < 10 && (
                <Text style={s.phoneHint}>Enter 10-digit mobile number</Text>
              )}

              <Pressable
                style={[s.primaryBtn, phone.replace(/\D/g, "").length !== 10 && { opacity: 0.5 }]}
                onPress={handleSendOtp}
                disabled={phone.replace(/\D/g, "").length !== 10}
              >
                <LinearGradient
                  colors={phone.replace(/\D/g, "").length === 10 ? ["#FF6B00", "#FF8A33"] : ["#FFD4B0", "#FFD4B0"]}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={s.primaryBtnGradient}
                >
                  <Text style={s.primaryBtnText}>Send Verification Code</Text>
                  <Ionicons name="arrow-forward" size={18} color="#FFF" />
                </LinearGradient>
              </Pressable>

              <Pressable style={s.backToLogin} onPress={() => router.back()}>
                <Ionicons name="arrow-back" size={16} color={Colors.primary} />
                <Text style={s.backToLoginText}>Back to Login</Text>
              </Pressable>

              <View style={s.secureRow}>
                <Ionicons name="shield-checkmark" size={12} color="#10B981" />
                <Text style={s.secureText}>Your account is safe & secure with us</Text>
              </View>
            </Animated.View>
          )}

          {step === "otp" && (
            <Animated.View entering={Platform.OS !== "web" ? FadeInDown.duration(400) : undefined} style={s.formBlock}>
              <Text style={s.formHeading}>Verify OTP</Text>
              <Text style={s.formDesc}>
                We've sent a 6-digit code to{"\n"}
                <Text style={s.phoneHighlight}>+91 {phone.slice(0, 5)} {phone.slice(5)}</Text>
              </Text>

              {accountName && (
                <View style={s.accountBadge}>
                  <View style={s.accountBadgeIcon}>
                    <Ionicons name="person-circle" size={22} color={Colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.accountBadgeName}>{accountName}</Text>
                    <Text style={s.accountBadgeRole}>
                      {accountRole === "SUPER_ADMIN" ? "Super Admin" : accountRole.charAt(0) + accountRole.slice(1).toLowerCase()}
                    </Text>
                  </View>
                  <Ionicons name="checkmark-circle" size={20} color="#10B981" />
                </View>
              )}

              <View style={s.otpRow}>
                {otp.map((digit, i) => (
                  <TextInput
                    key={i}
                    ref={(ref) => { otpRefs.current[i] = ref; }}
                    style={[s.otpBox, digit ? s.otpBoxFilled : null]}
                    keyboardType="number-pad"
                    maxLength={1}
                    value={digit}
                    onChangeText={(v) => handleOtpChange(v.slice(-1), i)}
                    onKeyPress={({ nativeEvent }) => {
                      if (nativeEvent.key === "Backspace") handleOtpBackspace(i);
                    }}
                    selectTextOnFocus
                  />
                ))}
              </View>

              <View style={s.otpFooter}>
                <Pressable style={s.changeNumBtn} onPress={() => setStep("phone")}>
                  <Ionicons name="pencil" size={14} color={Colors.primary} />
                  <Text style={s.changeNumText}>Change Number</Text>
                </Pressable>
                {canResend ? (
                  <Pressable onPress={handleResendOtp} style={s.resendBtn}>
                    <Ionicons name="refresh" size={14} color={Colors.primary} />
                    <Text style={s.resendActiveText}>Resend OTP</Text>
                  </Pressable>
                ) : (
                  <View style={s.timerRow}>
                    <Ionicons name="time-outline" size={14} color={Colors.textLight} />
                    <Text style={s.timerText}>
                      Resend in <Text style={s.timerCount}>00:{otpTimer.toString().padStart(2, "0")}</Text>
                    </Text>
                  </View>
                )}
              </View>

              <View style={s.tipBox}>
                <Ionicons name="information-circle" size={16} color={Colors.textSecondary} />
                <Text style={s.tipText}>Enter any 6-digit code to verify your identity</Text>
              </View>
            </Animated.View>
          )}

          {step === "password" && (
            <Animated.View entering={Platform.OS !== "web" ? FadeInDown.duration(400) : undefined} style={s.formBlock}>
              <View style={s.lockIconRow}>
                <View style={[s.lockIconCircle, { backgroundColor: "#ECFDF5" }]}>
                  <Ionicons name="key" size={32} color="#10B981" />
                </View>
              </View>
              <Text style={s.formHeading}>Create New Password</Text>
              <Text style={s.formDesc}>
                Your identity has been verified. Set a new password for your account.
              </Text>

              <View>
                <Text style={s.inputLabel}>New Password</Text>
                <View style={s.passwordRow}>
                  <TextInput
                    style={s.passwordInput}
                    value={password}
                    onChangeText={setPassword}
                    placeholder="Enter new password"
                    placeholderTextColor="#B0B5BC"
                    secureTextEntry={!showPassword}
                    maxLength={30}
                  />
                  <Pressable style={s.eyeBtn} onPress={() => setShowPassword(!showPassword)}>
                    <Ionicons name={showPassword ? "eye-off" : "eye"} size={20} color={Colors.textSecondary} />
                  </Pressable>
                </View>

                {password.length > 0 && (
                  <View style={s.strengthRow}>
                    <View style={s.strengthBarBg}>
                      <View style={[s.strengthBarFill, { width: strength.width as any, backgroundColor: strength.color }]} />
                    </View>
                    <Text style={[s.strengthLabel, { color: strength.color }]}>{strength.label}</Text>
                  </View>
                )}
              </View>

              <View>
                <Text style={s.inputLabel}>Confirm Password</Text>
                <View style={s.passwordRow}>
                  <TextInput
                    style={s.passwordInput}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    placeholder="Re-enter password"
                    placeholderTextColor="#B0B5BC"
                    secureTextEntry={!showConfirm}
                    maxLength={30}
                  />
                  <Pressable style={s.eyeBtn} onPress={() => setShowConfirm(!showConfirm)}>
                    <Ionicons name={showConfirm ? "eye-off" : "eye"} size={20} color={Colors.textSecondary} />
                  </Pressable>
                </View>
                {confirmPassword.length > 0 && password !== confirmPassword && (
                  <Text style={s.errorText}>Passwords do not match</Text>
                )}
                {confirmPassword.length > 0 && password === confirmPassword && password.length >= 6 && (
                  <View style={s.matchRow}>
                    <Ionicons name="checkmark-circle" size={14} color="#10B981" />
                    <Text style={s.matchText}>Passwords match</Text>
                  </View>
                )}
              </View>

              <View style={s.rulesBox}>
                <Text style={s.rulesTitle}>Password Requirements</Text>
                {[
                  { label: "At least 6 characters", met: password.length >= 6 },
                  { label: "Contains a number", met: /\d/.test(password) },
                  { label: "Contains an uppercase letter", met: /[A-Z]/.test(password) },
                ].map((rule) => (
                  <View key={rule.label} style={s.ruleRow}>
                    <Ionicons
                      name={rule.met ? "checkmark-circle" : "ellipse-outline"}
                      size={16}
                      color={rule.met ? "#10B981" : Colors.textLight}
                    />
                    <Text style={[s.ruleText, rule.met && { color: "#065F46" }]}>{rule.label}</Text>
                  </View>
                ))}
              </View>

              <Pressable
                style={[s.primaryBtn, (password.length < 6 || password !== confirmPassword) && { opacity: 0.5 }]}
                onPress={handleResetPassword}
                disabled={password.length < 6 || password !== confirmPassword}
              >
                <LinearGradient
                  colors={(password.length >= 6 && password === confirmPassword) ? ["#FF6B00", "#FF8A33"] : ["#FFD4B0", "#FFD4B0"]}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={s.primaryBtnGradient}
                >
                  <Ionicons name="lock-closed" size={18} color="#FFF" />
                  <Text style={s.primaryBtnText}>Reset Password</Text>
                </LinearGradient>
              </Pressable>
            </Animated.View>
          )}

          {step === "success" && (
            <Animated.View entering={Platform.OS !== "web" ? FadeInDown.duration(400) : undefined} style={s.formBlock}>
              <View style={s.successContainer}>
                <View style={s.successIconCircle}>
                  <View style={s.successIconInner}>
                    <Ionicons name="checkmark-circle" size={72} color="#10B981" />
                  </View>
                </View>
                <Text style={s.successTitle}>Password Reset Successful!</Text>
                <Text style={s.successMessage}>
                  Your password has been updated successfully.{"\n"}You can now login with your new password.
                </Text>

                <View style={s.successInfoCard}>
                  <View style={s.successInfoRow}>
                    <Ionicons name="call" size={16} color={Colors.primary} />
                    <Text style={s.successInfoText}>+91 {phone.slice(0, 5)} {phone.slice(5)}</Text>
                  </View>
                  <View style={s.successInfoRow}>
                    <Ionicons name="person" size={16} color={Colors.primary} />
                    <Text style={s.successInfoText}>{accountName} ({accountRole === "SUPER_ADMIN" ? "Super Admin" : accountRole.charAt(0) + accountRole.slice(1).toLowerCase()})</Text>
                  </View>
                </View>

                <Pressable
                  style={s.primaryBtn}
                  onPress={() => {
                    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
                    router.replace("/auth" as any);
                  }}
                >
                  <LinearGradient
                    colors={["#10B981", "#059669"]}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                    style={s.primaryBtnGradient}
                  >
                    <Ionicons name="log-in" size={18} color="#FFF" />
                    <Text style={s.primaryBtnText}>Go to Login</Text>
                  </LinearGradient>
                </Pressable>
              </View>
            </Animated.View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFF" },
  topBanner: { paddingHorizontal: 20, paddingBottom: 20, backgroundColor: "#FFF" },
  backButton: { width: 36, height: 36, borderRadius: 12, backgroundColor: "#F0F0F0", alignItems: "center", justifyContent: "center", marginBottom: 10 },
  bannerContent: { alignItems: "center", justifyContent: "center" },
  bannerLogo: { width: 140, height: 90 },
  bannerTitle: { fontFamily: "Poppins_700Bold", fontSize: 22, color: "#0B1E3D", letterSpacing: 2 },
  bannerTagline: { fontFamily: "Poppins_400Regular", fontSize: 12, color: "rgba(0,0,0,0.45)", marginTop: 1 },
  stepTracker: { flexDirection: "row", alignItems: "center", justifyContent: "center", marginTop: 16 },
  stepItem: { alignItems: "center", gap: 4 },
  stepCircle: { width: 26, height: 26, borderRadius: 13, backgroundColor: "#EAEDF2", alignItems: "center", justifyContent: "center" },
  stepCircleActive: { backgroundColor: Colors.primary },
  stepCircleDone: { backgroundColor: "#10B981" },
  stepNum: { fontFamily: "Poppins_600SemiBold", fontSize: 11, color: "#999" },
  stepLabel: { fontFamily: "Poppins_400Regular", fontSize: 10, color: "#666" },
  stepConnector: { width: 40, height: 2, backgroundColor: "#EAEDF2", marginHorizontal: 4 },
  stepConnectorActive: { backgroundColor: Colors.primary },
  formScroll: { paddingHorizontal: 24, paddingTop: 28 },
  formBlock: { gap: 20 },
  lockIconRow: { alignItems: "center" },
  lockIconCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: "#FFF5ED", alignItems: "center", justifyContent: "center" },
  formHeading: { fontFamily: "Poppins_700Bold", fontSize: 24, color: Colors.secondary },
  formDesc: { fontFamily: "Poppins_400Regular", fontSize: 14, color: Colors.textSecondary, lineHeight: 22, marginTop: -8 },
  phoneRow: { flexDirection: "row", gap: 10 },
  countryBox: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#F7F8FA", borderRadius: 14, paddingHorizontal: 14, borderWidth: 1.5, borderColor: "#EAEDF2" },
  flagEmoji: { fontFamily: "Poppins_700Bold", fontSize: 12, color: Colors.secondary },
  countryCodeText: { fontFamily: "Poppins_600SemiBold", fontSize: 16, color: Colors.secondary },
  phoneInput: { flex: 1, backgroundColor: "#F7F8FA", borderRadius: 14, paddingHorizontal: 18, paddingVertical: 16, fontFamily: "Poppins_500Medium", fontSize: 17, color: Colors.text, borderWidth: 1.5, borderColor: "#EAEDF2", letterSpacing: 1.5 },
  phoneHint: { fontFamily: "Poppins_400Regular", fontSize: 12, color: "#EF4444", marginTop: -12, marginLeft: 4 },
  phoneHighlight: { fontFamily: "Poppins_600SemiBold", color: Colors.secondary },
  primaryBtn: { borderRadius: 14, overflow: "hidden", shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 10, elevation: 4 },
  primaryBtnGradient: { paddingVertical: 17, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  primaryBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 16, color: "#FFF", letterSpacing: 0.5 },
  backToLogin: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  backToLoginText: { fontFamily: "Poppins_500Medium", fontSize: 14, color: Colors.primary },
  secureRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  secureText: { fontFamily: "Poppins_400Regular", fontSize: 11, color: "#10B981" },
  accountBadge: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: Colors.primary + "08", borderRadius: 14, padding: 12, borderWidth: 1.5, borderColor: Colors.primary + "20" },
  accountBadgeIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.primary + "15", alignItems: "center", justifyContent: "center" },
  accountBadgeName: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: Colors.text },
  accountBadgeRole: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary },
  otpRow: { flexDirection: "row", justifyContent: "center", gap: 10 },
  otpBox: { width: 48, height: 56, borderRadius: 14, borderWidth: 2, borderColor: "#EAEDF2", backgroundColor: "#F7F8FA", textAlign: "center", fontFamily: "Poppins_700Bold", fontSize: 22, color: Colors.secondary },
  otpBoxFilled: { borderColor: Colors.primary, backgroundColor: "#FFF5ED" },
  otpFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  changeNumBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingVertical: 6 },
  changeNumText: { fontFamily: "Poppins_500Medium", fontSize: 13, color: Colors.primary },
  timerRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  timerText: { fontFamily: "Poppins_400Regular", fontSize: 13, color: Colors.textLight },
  timerCount: { fontFamily: "Poppins_600SemiBold", color: Colors.secondary },
  resendBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingVertical: 6 },
  resendActiveText: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: Colors.primary },
  tipBox: { flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: "#F7F8FA", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "#EAEDF2" },
  tipText: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary, flex: 1, lineHeight: 18 },
  inputLabel: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: Colors.text, marginBottom: 8 },
  passwordRow: { flexDirection: "row", alignItems: "center", backgroundColor: "#F7F8FA", borderRadius: 14, borderWidth: 1.5, borderColor: "#EAEDF2" },
  passwordInput: { flex: 1, paddingHorizontal: 18, paddingVertical: 16, fontFamily: "Poppins_500Medium", fontSize: 16, color: Colors.text },
  eyeBtn: { paddingHorizontal: 14, paddingVertical: 16 },
  strengthRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 8 },
  strengthBarBg: { flex: 1, height: 4, borderRadius: 2, backgroundColor: "#EAEDF2" },
  strengthBarFill: { height: 4, borderRadius: 2 },
  strengthLabel: { fontFamily: "Poppins_600SemiBold", fontSize: 11 },
  errorText: { fontFamily: "Poppins_400Regular", fontSize: 12, color: "#EF4444", marginTop: 6, marginLeft: 4 },
  matchRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6 },
  matchText: { fontFamily: "Poppins_400Regular", fontSize: 12, color: "#10B981" },
  rulesBox: { backgroundColor: "#F7F8FA", borderRadius: 14, padding: 14, borderWidth: 1, borderColor: "#EAEDF2", gap: 8 },
  rulesTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: Colors.text, marginBottom: 2 },
  ruleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  ruleText: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary },
  successContainer: { alignItems: "center", gap: 12, paddingTop: 10 },
  successIconCircle: { width: 120, height: 120, borderRadius: 60, backgroundColor: "#ECFDF5", alignItems: "center", justifyContent: "center" },
  successIconInner: { width: 90, height: 90, borderRadius: 45, backgroundColor: "#D1FAE5", alignItems: "center", justifyContent: "center" },
  successTitle: { fontFamily: "Poppins_700Bold", fontSize: 22, color: "#065F46", textAlign: "center" },
  successMessage: { fontFamily: "Poppins_400Regular", fontSize: 14, color: Colors.textSecondary, textAlign: "center", lineHeight: 22 },
  successInfoCard: { backgroundColor: "#F7F8FA", borderRadius: 14, padding: 16, width: "100%", gap: 10, borderWidth: 1, borderColor: "#EAEDF2" },
  successInfoRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  successInfoText: { fontFamily: "Poppins_500Medium", fontSize: 14, color: Colors.text },
});

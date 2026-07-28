import React from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Platform, Alert, Linking, Image, Share } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";

const stats = [
  { label: "Vendors", value: "100+", icon: "storefront" },
  { label: "Roles", value: "6", icon: "people" },
  { label: "Categories", value: "10+", icon: "grid" },
];

const socialLinks = [
  { icon: "logo-instagram", label: "Instagram", url: "https://www.instagram.com/gobharat_pvt_ltd?igsh=MW1xODMwNmpwc25sMw==" },
  { icon: "logo-facebook", label: "Facebook", url: "https://www.facebook.com/share/1CHsTmK747/" },
  { icon: "logo-linkedin", label: "LinkedIn", url: "https://www.linkedin.com/in/go-bharat-services-906819383" },
  { icon: "logo-youtube", label: "YouTube", url: "https://youtube.com/@gobharatservice" },
  { icon: "globe", label: "Website", url: "https://www.gobharat.net" },
];

export default function AboutScreen() {
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  const handleRateUs = () => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
    Alert.alert(
      "Rate Go Bharat",
      "Enjoying Go Bharat? Your rating helps us grow and serve you better!",
      [
        { text: "Not Now", style: "cancel" },
        { text: "Rate 5 Stars", onPress: () => {
          Linking.openURL("https://play.google.com/store/apps/details?id=com.gobharat.app").catch(() => {
            Alert.alert("Thank You!", "Thanks for your support! Your 5-star rating means a lot to us.");
          });
        }},
      ]
    );
  };

  const handleShare = async () => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
    try {
      await Share.share({
        message: "Join Go Bharat - India's #1 Hyperlocal Super App! Shop from local stores, get fastest delivery & earn rewards. Download now: https://www.gobharat.net",
        title: "Share Go Bharat",
      });
    } catch {}
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: topInset + 12 }]}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#0B1E3D" />
          </Pressable>
          <Text style={styles.headerTitle}>About Go Bharat</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.logoContainer}>
          <Image source={require("@/assets/images/go-bharat-logo-nobg.png")} style={styles.logo} resizeMode="contain" accessibilityLabel="Go Bharat logo" />
        </View>
        <Text style={styles.appVersion}>Version 2.0</Text>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: bottomInset + 20 }} showsVerticalScrollIndicator={false}>
        <View style={styles.aboutCard}>
          <Text style={styles.aboutTitle}>India's Hyperlocal Super App</Text>
          <Text style={styles.aboutText}>
            Go Bharat is a multi-role hyperlocal delivery and commerce platform built for the people of India. Our mission is to connect local vendors with customers, enabling fast and reliable delivery of food, grocery, electronics, fashion, and more - all within your city.
          </Text>
          <Text style={styles.aboutText}>
            We empower local businesses to go digital with zero upfront costs, provide delivery partners with flexible earning opportunities, and offer customers the convenience of doorstep delivery from their favourite local shops.
          </Text>
        </View>

        <View style={styles.statsRow}>
          {stats.map((stat) => (
            <View key={stat.label} style={styles.statCard}>
              <View style={styles.statIconBg}>
                <Ionicons name={stat.icon as any} size={22} color={Colors.primary} />
              </View>
              <Text style={styles.statValue}>{stat.value}</Text>
              <Text style={styles.statLabel}>{stat.label}</Text>
            </View>
          ))}
        </View>

        <View style={styles.foundersCard}>
          <Text style={styles.cardTitle}>Founders of AASAA PVT. LTD.</Text>
          <Text style={styles.foundersText}>
            AASAA PVT. LTD. was founded with the vision of making hyperlocal commerce accessible and affordable for tier-2 and tier-3 cities in India. Go Bharat is a product of AASAA PVT. LTD., built to bridge the gap between local businesses and consumers.
          </Text>
        </View>

        <Text style={styles.sectionTitle}>Connect With Us</Text>
        {socialLinks.map((link) => (
          <Pressable key={link.label} style={styles.socialCard} onPress={() => Linking.openURL(link.url)}>
            <View style={styles.socialIconBg}>
              <Ionicons name={link.icon as any} size={22} color={Colors.primary} />
            </View>
            <Text style={styles.socialLabel}>{link.label}</Text>
            <Ionicons name="chevron-forward" size={18} color={Colors.textLight} />
          </Pressable>
        ))}

        <View style={styles.actionRow}>
          <Pressable style={styles.actionBtn} onPress={handleRateUs}>
            <Ionicons name="star" size={20} color={Colors.primary} />
            <Text style={styles.actionText}>Rate Us</Text>
          </Pressable>
          <Pressable style={styles.actionBtn} onPress={handleShare}>
            <Ionicons name="share-social" size={20} color={Colors.primary} />
            <Text style={styles.actionText}>Share App</Text>
          </Pressable>
        </View>

        <Text style={styles.madeWith}>Made with care by AASAA PVT. LTD., Malegaon, India</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { alignItems: "center", paddingBottom: 24, backgroundColor: "#FFF", borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, width: "100%", marginBottom: 16 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#F0F0F0", alignItems: "center", justifyContent: "center" },
  headerTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 18, color: "#0B1E3D" },
  logoContainer: {
    width: 160,
    height: 110,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    marginBottom: 8,
  },
  logo: { width: 160, height: 110 },
  appName: { fontFamily: "Poppins_700Bold", fontSize: 24, color: "#0B1E3D" },
  appVersion: { fontFamily: "Poppins_400Regular", fontSize: 13, color: "#666", marginTop: 2 },
  content: { flex: 1, paddingHorizontal: 20, paddingTop: 20 },
  aboutCard: { backgroundColor: "#FFF", borderRadius: 16, padding: 18, marginBottom: 16 },
  aboutTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 16, color: Colors.text, marginBottom: 10 },
  aboutText: { fontFamily: "Poppins_400Regular", fontSize: 13, color: Colors.textSecondary, lineHeight: 22, marginBottom: 8 },
  statsRow: { flexDirection: "row", gap: 10, marginBottom: 16 },
  statCard: { flex: 1, backgroundColor: "#FFF", borderRadius: 14, padding: 14, alignItems: "center" },
  statIconBg: { width: 44, height: 44, borderRadius: 12, backgroundColor: Colors.primary + "12", alignItems: "center", justifyContent: "center", marginBottom: 8 },
  statValue: { fontFamily: "Poppins_700Bold", fontSize: 20, color: Colors.text },
  statLabel: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  foundersCard: { backgroundColor: "#FFF", borderRadius: 16, padding: 18, marginBottom: 20 },
  cardTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 16, color: Colors.text, marginBottom: 10 },
  foundersText: { fontFamily: "Poppins_400Regular", fontSize: 13, color: Colors.textSecondary, lineHeight: 22 },
  founderRow: { flexDirection: "row", justifyContent: "space-evenly", marginTop: 16 },
  founderItem: { alignItems: "center", flex: 1 },
  founderPhoto: { width: 80, height: 80, borderRadius: 40, borderWidth: 2, borderColor: Colors.primary, marginBottom: 8 },
  founderName: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: Colors.text },
  founderRole: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.primary, marginTop: 2 },
  sectionTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 16, color: Colors.text, marginBottom: 12 },
  socialCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF",
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  socialIconBg: { width: 42, height: 42, borderRadius: 12, backgroundColor: Colors.primary + "12", alignItems: "center", justifyContent: "center" },
  socialLabel: { fontFamily: "Poppins_500Medium", fontSize: 14, color: Colors.text, flex: 1, marginLeft: 14 },
  actionRow: { flexDirection: "row", gap: 12, marginTop: 16, marginBottom: 20 },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#FFF",
    borderRadius: 14,
    paddingVertical: 14,
    borderWidth: 1.5,
    borderColor: Colors.primary + "30",
  },
  actionText: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: Colors.primary },
  madeWith: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textLight, textAlign: "center", marginTop: 8, marginBottom: 16 },
});

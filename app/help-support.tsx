import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Platform, Linking } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";

interface FAQItem {
  id: string;
  question: string;
  answer: string;
}

const faqs: FAQItem[] = [
  { id: "f1", question: "How do I track my order?", answer: "You can track your order in real-time from the Orders tab. Once your order is accepted, you will see live tracking with the delivery partner's location on a map. You will also receive updates via notifications." },
  { id: "f2", question: "What are the delivery charges?", answer: "Delivery charges vary based on distance and order value. Orders above Rs.299 may qualify for free delivery using the FREESHIP coupon. Express delivery has an additional charge of Rs.30. Standard delivery is typically Rs.20-40." },
  { id: "f3", question: "How do I return a product?", answer: "To return a product, go to your Orders section, select the order, and tap on 'Request Return'. Returns are accepted within 7 days of delivery for eligible products. Perishable items like food and grocery are non-returnable once delivered." },
  { id: "f4", question: "What payment methods are accepted?", answer: "We accept UPI (Google Pay, PhonePay, Paytm), Debit/Credit Cards, Net Banking, and Go Bharat Wallet. Cash on Delivery (COD) is also available for select orders. Wallet payments offer additional cashback benefits." },
  { id: "f5", question: "How do I add money to my wallet?", answer: "Go to the Wallet section from your profile. Tap 'Add Money' and choose your preferred payment method. Added money will be instantly available for use. Wallet balance is non-refundable but can be used for any order on Go Bharat." },
  { id: "f6", question: "How do I become a vendor on Go Bharat?", answer: "To become a vendor, contact our marketing team or apply through the app. You will need to provide your business details, GST number, PAN card, and bank account information. Once approved, you can list your products and start receiving orders." },
];

const contactOptions = [
  { icon: "mail", label: "Email Us", value: "gobharatservice@gmail.com", action: () => Linking.openURL("mailto:gobharatservice@gmail.com") },
  { icon: "call", label: "Call Us", value: "8177977700", action: () => Linking.openURL("tel:+918177977700") },
  { icon: "logo-whatsapp", label: "WhatsApp", value: "Chat with us", action: () => Linking.openURL("https://wa.me/918177977700") },
];

export default function HelpSupportScreen() {
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggleFAQ = (id: string) => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={["#0B1E3D", "#142F5E"]} style={[styles.header, { paddingTop: topInset + 12 }]}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#FFF" />
          </Pressable>
          <Text style={styles.headerTitle}>Help & Support</Text>
          <View style={{ width: 40 }} />
        </View>
      </LinearGradient>

      <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: bottomInset + 20 }} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionTitle}>Frequently Asked Questions</Text>
        {faqs.map((faq) => (
          <Pressable key={faq.id} style={styles.faqCard} onPress={() => toggleFAQ(faq.id)}>
            <View style={styles.faqHeader}>
              <Text style={styles.faqQuestion}>{faq.question}</Text>
              <Ionicons name={expandedId === faq.id ? "chevron-up" : "chevron-down"} size={20} color={Colors.textSecondary} />
            </View>
            {expandedId === faq.id && <Text style={styles.faqAnswer}>{faq.answer}</Text>}
          </Pressable>
        ))}

        <Text style={[styles.sectionTitle, { marginTop: 28 }]}>Contact Us</Text>
        {contactOptions.map((opt) => (
          <Pressable key={opt.label} style={styles.contactCard} onPress={opt.action}>
            <View style={styles.contactIconBg}>
              <Ionicons name={opt.icon as any} size={22} color={Colors.primary} />
            </View>
            <View style={styles.contactInfo}>
              <Text style={styles.contactLabel}>{opt.label}</Text>
              <Text style={styles.contactValue}>{opt.value}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.textLight} />
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { paddingBottom: 20, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center" },
  headerTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 18, color: "#FFF" },
  content: { flex: 1, paddingHorizontal: 20, paddingTop: 20 },
  sectionTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 16, color: Colors.text, marginBottom: 14 },
  faqCard: { backgroundColor: "#FFF", borderRadius: 14, padding: 16, marginBottom: 10 },
  faqHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  faqQuestion: { fontFamily: "Poppins_500Medium", fontSize: 14, color: Colors.text, flex: 1, marginRight: 12 },
  faqAnswer: { fontFamily: "Poppins_400Regular", fontSize: 13, color: Colors.textSecondary, lineHeight: 20, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.borderLight },
  contactCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF",
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
  },
  contactIconBg: { width: 44, height: 44, borderRadius: 12, backgroundColor: Colors.primary + "12", alignItems: "center", justifyContent: "center" },
  contactInfo: { flex: 1, marginLeft: 14 },
  contactLabel: { fontFamily: "Poppins_500Medium", fontSize: 14, color: Colors.text },
  contactValue: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
});

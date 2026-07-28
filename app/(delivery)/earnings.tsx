import React from "react";
import { View, Text, StyleSheet, ScrollView, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { useApp } from "@/lib/store";

export default function EarningsScreen() {
  const insets = useSafeAreaInsets();
  const { orders } = useApp();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const completed = orders.filter((o) => o.status === "DELIVERED").length;
  const todayEarnings = completed * 45;
  const weeklyEarnings = todayEarnings * 5;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
      <View style={[styles.header, { paddingTop: topInset + 8 }]}>
        <Text style={styles.headerTitle}>Earnings</Text>
      </View>

      <View style={styles.earningsCard}>
        <Text style={styles.earningsLabel}>Today's Earnings</Text>
        <Text style={styles.earningsValue}>{"\u20B9"}{todayEarnings}</Text>
        <Text style={styles.earningsSubtext}>Total Orders: {completed}</Text>
      </View>

      <View style={styles.summaryRow}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>This Week</Text>
          <Text style={styles.summaryValue}>{"\u20B9"}{weeklyEarnings}</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>This Month</Text>
          <Text style={styles.summaryValue}>{"\u20B9"}{weeklyEarnings * 4}</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Recent Transactions</Text>
        {orders.filter((o) => o.status === "DELIVERED").length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="wallet-outline" size={40} color={Colors.textLight} />
            <Text style={styles.emptyText}>No earnings yet</Text>
          </View>
        ) : (
          orders
            .filter((o) => o.status === "DELIVERED")
            .slice(0, 5)
            .map((order) => (
              <View key={order.id} style={styles.txnRow}>
                <View style={styles.txnIcon}>
                  <Ionicons name="checkmark-circle" size={20} color={Colors.success} />
                </View>
                <View style={styles.txnInfo}>
                  <Text style={styles.txnTitle}>Order #{order.id}</Text>
                  <Text style={styles.txnSubtext}>{order.vendorName}</Text>
                </View>
                <Text style={styles.txnAmount}>+{"\u20B9"}45</Text>
              </View>
            ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { backgroundColor: "#FFF", paddingHorizontal: 24, paddingBottom: 16 },
  headerTitle: { fontFamily: "Poppins_700Bold", fontSize: 24, color: Colors.secondary },
  earningsCard: {
    margin: 20,
    backgroundColor: Colors.primary,
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
  },
  earningsLabel: { fontFamily: "Poppins_500Medium", fontSize: 14, color: "rgba(255,255,255,0.8)" },
  earningsValue: { fontFamily: "Poppins_700Bold", fontSize: 36, color: "#FFF", marginTop: 4 },
  earningsSubtext: { fontFamily: "Poppins_400Regular", fontSize: 13, color: "rgba(255,255,255,0.7)", marginTop: 4 },
  summaryRow: { flexDirection: "row", paddingHorizontal: 20, gap: 12 },
  summaryCard: { flex: 1, backgroundColor: "#FFF", borderRadius: 16, padding: 16, alignItems: "center" },
  summaryLabel: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary },
  summaryValue: { fontFamily: "Poppins_700Bold", fontSize: 20, color: Colors.secondary, marginTop: 4 },
  section: { marginTop: 24, paddingHorizontal: 20 },
  sectionTitle: { fontFamily: "Poppins_700Bold", fontSize: 18, color: Colors.secondary, marginBottom: 14 },
  emptyCard: { backgroundColor: "#FFF", borderRadius: 16, padding: 40, alignItems: "center" },
  emptyText: { fontFamily: "Poppins_500Medium", fontSize: 14, color: Colors.textSecondary, marginTop: 12 },
  txnRow: { flexDirection: "row", alignItems: "center", backgroundColor: "#FFF", borderRadius: 14, padding: 14, marginBottom: 8, gap: 12 },
  txnIcon: { width: 38, height: 38, borderRadius: 10, backgroundColor: Colors.success + "12", alignItems: "center", justifyContent: "center" },
  txnInfo: { flex: 1 },
  txnTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: Colors.text },
  txnSubtext: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary },
  txnAmount: { fontFamily: "Poppins_700Bold", fontSize: 16, color: Colors.success },
});

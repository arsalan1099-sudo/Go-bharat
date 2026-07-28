import React from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Platform, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { Invoice } from "@/lib/types";

const COMPANY_NAME = "AASAA PVT. LTD.";
const COMPANY_GSTIN = "27AABCG1234M1ZP";
const COMPANY_ADDRESS = "Malegaon, Nashik District, Maharashtra - 423203";
const COMPANY_PHONE = "+91 9168134109";
const COMPANY_STATE = "Maharashtra (27)";

const TYPE_LABELS: Record<string, string> = {
  ORDER: "Tax Invoice",
  DEAL_SLOT: "Tax Invoice - Deal Slot",
  AD_SLOT: "Tax Invoice - Advertisement",
  WALLET_TOPUP: "Payment Receipt",
  PAYOUT: "Payout Statement",
  WITHDRAWAL: "Withdrawal Receipt",
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function formatCurrency(amount: number): string {
  return "\u20B9" + amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface InvoiceViewProps {
  invoice: Invoice;
  onClose: () => void;
}

export default function InvoiceView({ invoice, onClose }: InvoiceViewProps) {
  const handleDownload = () => {
    Alert.alert(
      "Invoice Saved",
      `Invoice ${invoice.invoiceNumber} has been saved. In production, this will generate a PDF and share it.`,
      [{ text: "OK" }]
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={onClose} style={styles.closeBtn}>
          <Ionicons name="close" size={24} color={Colors.secondary} />
        </Pressable>
        <Text style={styles.headerTitle}>{TYPE_LABELS[invoice.type] || "Invoice"}</Text>
        <Pressable onPress={handleDownload} style={styles.downloadBtn}>
          <Ionicons name="download-outline" size={20} color="#FFF" />
          <Text style={styles.downloadBtnText}>Save</Text>
        </Pressable>
      </View>

      <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false}>
        <View style={styles.invoiceCard}>
          <View style={styles.companyHeader}>
            <Text style={styles.companyName}>{COMPANY_NAME}</Text>
            <Text style={styles.companyDetail}>GSTIN: {COMPANY_GSTIN}</Text>
            <Text style={styles.companyDetail}>{COMPANY_ADDRESS}</Text>
            <Text style={styles.companyDetail}>State: {COMPANY_STATE} | Phone: {COMPANY_PHONE}</Text>
          </View>

          <View style={styles.dividerThick} />

          <View style={styles.invoiceMeta}>
            <View style={{ flex: 1 }}>
              <Text style={styles.metaLabel}>Invoice No.</Text>
              <Text style={styles.metaValue}>{invoice.invoiceNumber}</Text>
            </View>
            <View style={{ flex: 1, alignItems: "flex-end" as const }}>
              <Text style={styles.metaLabel}>Date</Text>
              <Text style={styles.metaValue}>{formatDate(invoice.createdAt)}</Text>
            </View>
          </View>
          <View style={styles.invoiceMeta}>
            <View style={{ flex: 1 }}>
              <Text style={styles.metaLabel}>Ref ID</Text>
              <Text style={styles.metaValue}>{invoice.referenceId}</Text>
            </View>
            <View style={{ flex: 1, alignItems: "flex-end" as const }}>
              <Text style={styles.metaLabel}>Payment</Text>
              <Text style={styles.metaValue}>{invoice.paymentMethod.toUpperCase()}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.partyRow}>
            <View style={styles.partyBox}>
              <Text style={styles.partyTitle}>From (Supplier)</Text>
              <Text style={styles.partyName}>{invoice.fromName}</Text>
              <Text style={styles.partyDetail}>GSTIN: {invoice.fromGSTIN}</Text>
              <Text style={styles.partyDetail}>{invoice.fromAddress}</Text>
              <Text style={styles.partyDetail}>Ph: {invoice.fromPhone}</Text>
            </View>
            <View style={styles.partySeparator} />
            <View style={styles.partyBox}>
              <Text style={styles.partyTitle}>To (Recipient)</Text>
              <Text style={styles.partyName}>{invoice.toName}</Text>
              {invoice.toGSTIN ? <Text style={styles.partyDetail}>GSTIN: {invoice.toGSTIN}</Text> : null}
              <Text style={styles.partyDetail}>{invoice.toAddress}</Text>
              <Text style={styles.partyDetail}>Ph: {invoice.toPhone}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <Text style={styles.sectionTitle}>Item Details</Text>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderText, { flex: 2.5 }]}>Description</Text>
            <Text style={[styles.tableHeaderText, { flex: 1, textAlign: "center" as const }]}>HSN/SAC</Text>
            <Text style={[styles.tableHeaderText, { flex: 0.5, textAlign: "center" as const }]}>Qty</Text>
            <Text style={[styles.tableHeaderText, { flex: 1, textAlign: "right" as const }]}>Amount</Text>
          </View>

          {invoice.items.map((item, idx) => (
            <View key={idx} style={[styles.tableRow, idx % 2 === 0 ? styles.tableRowEven : null]}>
              <Text style={[styles.tableCell, { flex: 2.5 }]} numberOfLines={2}>{item.description}</Text>
              <Text style={[styles.tableCell, { flex: 1, textAlign: "center" as const }]}>{item.hsnSac}</Text>
              <Text style={[styles.tableCell, { flex: 0.5, textAlign: "center" as const }]}>{item.qty}</Text>
              <Text style={[styles.tableCell, { flex: 1, textAlign: "right" as const }]}>{formatCurrency(item.taxableValue)}</Text>
            </View>
          ))}

          <View style={styles.divider} />

          <Text style={styles.sectionTitle}>Tax Breakdown</Text>
          <View style={styles.taxTableHeader}>
            <Text style={[styles.taxHeaderText, { flex: 2.5 }]}>Description</Text>
            <Text style={[styles.taxHeaderText, { flex: 1, textAlign: "center" as const }]}>CGST</Text>
            <Text style={[styles.taxHeaderText, { flex: 1, textAlign: "center" as const }]}>SGST</Text>
            <Text style={[styles.taxHeaderText, { flex: 1, textAlign: "right" as const }]}>Tax</Text>
          </View>
          {invoice.items.map((item, idx) => (
            <View key={idx} style={styles.taxRow}>
              <Text style={[styles.taxCell, { flex: 2.5 }]} numberOfLines={1}>{item.description}</Text>
              <Text style={[styles.taxCell, { flex: 1, textAlign: "center" as const }]}>{formatCurrency(item.cgstAmount)}</Text>
              <Text style={[styles.taxCell, { flex: 1, textAlign: "center" as const }]}>{formatCurrency(item.sgstAmount)}</Text>
              <Text style={[styles.taxCell, { flex: 1, textAlign: "right" as const }]}>{formatCurrency(item.cgstAmount + item.sgstAmount)}</Text>
            </View>
          ))}

          <View style={styles.divider} />

          <View style={styles.totalSection}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Subtotal</Text>
              <Text style={styles.totalValue}>{formatCurrency(invoice.subtotal)}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>CGST Total</Text>
              <Text style={styles.totalValue}>{formatCurrency(invoice.cgstTotal)}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>SGST Total</Text>
              <Text style={styles.totalValue}>{formatCurrency(invoice.sgstTotal)}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total Tax</Text>
              <Text style={styles.totalValue}>{formatCurrency(invoice.totalTax)}</Text>
            </View>
            <View style={styles.grandTotalRow}>
              <Text style={styles.grandTotalLabel}>Grand Total</Text>
              <Text style={styles.grandTotalValue}>{formatCurrency(invoice.grandTotal)}</Text>
            </View>
          </View>

          <View style={styles.amountWordsBox}>
            <Text style={styles.amountWordsLabel}>Amount in Words:</Text>
            <Text style={styles.amountWordsValue}>{invoice.amountInWords}</Text>
          </View>

          {invoice.transactionId ? (
            <View style={styles.txnRow}>
              <Ionicons name="checkmark-circle" size={14} color={Colors.success} />
              <Text style={styles.txnText}>Transaction ID: {invoice.transactionId}</Text>
            </View>
          ) : null}

          <View style={styles.divider} />

          <View style={styles.termsSection}>
            <Text style={styles.termsTitle}>Terms & Conditions</Text>
            <Text style={styles.termsText}>1. This is a computer-generated invoice and does not require a physical signature.</Text>
            <Text style={styles.termsText}>2. Subject to {COMPANY_STATE} jurisdiction.</Text>
            <Text style={styles.termsText}>3. E&OE - Errors and Omissions Excepted.</Text>
            <Text style={styles.termsText}>4. Tax charged as per GST Act 2017 (CGST + SGST for intra-state supply).</Text>
            {invoice.notes ? <Text style={[styles.termsText, { marginTop: 6 }]}>Note: {invoice.notes}</Text> : null}
          </View>

          <View style={styles.footerRow}>
            <Ionicons name="shield-checkmark" size={14} color={Colors.success} />
            <Text style={styles.footerText}>Verified & Compliant under GST Act 2017 | DPDP Act 2023</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F6FA" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12, backgroundColor: "#FFF", borderBottomWidth: 1, borderBottomColor: Colors.border },
  closeBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#F0F0F0", alignItems: "center", justifyContent: "center" },
  headerTitle: { fontFamily: "Poppins_700Bold", fontSize: 16, color: Colors.secondary },
  downloadBtn: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: Colors.primary, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  downloadBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 12, color: "#FFF" },
  scrollArea: { flex: 1, padding: 16 },
  invoiceCard: { backgroundColor: "#FFF", borderRadius: 14, padding: 16, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6, elevation: 3 },
  companyHeader: { alignItems: "center", paddingBottom: 12 },
  companyName: { fontFamily: "Poppins_700Bold", fontSize: 16, color: Colors.primary, textAlign: "center" },
  companyDetail: { fontFamily: "Poppins_400Regular", fontSize: 10, color: Colors.textSecondary, textAlign: "center", marginTop: 1 },
  dividerThick: { height: 2, backgroundColor: Colors.primary, marginVertical: 12 },
  divider: { height: 1, backgroundColor: Colors.border, marginVertical: 10 },
  invoiceMeta: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  metaLabel: { fontFamily: "Poppins_400Regular", fontSize: 10, color: Colors.textLight },
  metaValue: { fontFamily: "Poppins_600SemiBold", fontSize: 12, color: Colors.secondary },
  partyRow: { flexDirection: "row", gap: 8 },
  partyBox: { flex: 1 },
  partySeparator: { width: 1, backgroundColor: Colors.border },
  partyTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 10, color: Colors.primary, marginBottom: 4, textTransform: "uppercase" },
  partyName: { fontFamily: "Poppins_600SemiBold", fontSize: 12, color: Colors.secondary },
  partyDetail: { fontFamily: "Poppins_400Regular", fontSize: 10, color: Colors.textSecondary, marginTop: 1 },
  sectionTitle: { fontFamily: "Poppins_700Bold", fontSize: 12, color: Colors.secondary, marginBottom: 6 },
  tableHeader: { flexDirection: "row", backgroundColor: Colors.primary + "12", borderRadius: 6, padding: 8 },
  tableHeaderText: { fontFamily: "Poppins_600SemiBold", fontSize: 9, color: Colors.primary, textTransform: "uppercase" },
  tableRow: { flexDirection: "row", paddingVertical: 6, paddingHorizontal: 8 },
  tableRowEven: { backgroundColor: "#FAFAFA" },
  tableCell: { fontFamily: "Poppins_400Regular", fontSize: 10, color: Colors.secondary },
  taxTableHeader: { flexDirection: "row", backgroundColor: "#FFF7ED", borderRadius: 6, padding: 8 },
  taxHeaderText: { fontFamily: "Poppins_600SemiBold", fontSize: 9, color: Colors.primary, textTransform: "uppercase" },
  taxRow: { flexDirection: "row", paddingVertical: 4, paddingHorizontal: 8 },
  taxCell: { fontFamily: "Poppins_400Regular", fontSize: 10, color: Colors.textSecondary },
  totalSection: { paddingHorizontal: 8 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  totalLabel: { fontFamily: "Poppins_500Medium", fontSize: 11, color: Colors.textSecondary },
  totalValue: { fontFamily: "Poppins_600SemiBold", fontSize: 11, color: Colors.secondary },
  grandTotalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, marginTop: 4, borderTopWidth: 2, borderTopColor: Colors.primary },
  grandTotalLabel: { fontFamily: "Poppins_700Bold", fontSize: 14, color: Colors.secondary },
  grandTotalValue: { fontFamily: "Poppins_700Bold", fontSize: 16, color: Colors.primary },
  amountWordsBox: { backgroundColor: "#F8F9FA", borderRadius: 8, padding: 10, marginTop: 8 },
  amountWordsLabel: { fontFamily: "Poppins_600SemiBold", fontSize: 10, color: Colors.textLight },
  amountWordsValue: { fontFamily: "Poppins_500Medium", fontSize: 11, color: Colors.secondary, marginTop: 2 },
  txnRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 },
  txnText: { fontFamily: "Poppins_500Medium", fontSize: 10, color: Colors.success },
  termsSection: { marginTop: 4 },
  termsTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 10, color: Colors.textSecondary, marginBottom: 4 },
  termsText: { fontFamily: "Poppins_400Regular", fontSize: 9, color: Colors.textLight, lineHeight: 14 },
  footerRow: { flexDirection: "row", alignItems: "center", gap: 5, justifyContent: "center", marginTop: 12, paddingTop: 8, borderTopWidth: 1, borderTopColor: Colors.border },
  footerText: { fontFamily: "Poppins_400Regular", fontSize: 9, color: Colors.success },
});

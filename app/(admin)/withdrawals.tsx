import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  Alert,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Modal,
} from "react-native";
import { router } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";
import { generateInvoice } from "@/lib/invoiceUtils";
import { Invoice } from "@/lib/types";
import InvoiceView from "@/components/InvoiceView";
import { useApp } from "@/lib/store";

interface Withdrawal {
  id: string;
  userId: string;
  userName: string;
  userRole: string;
  amount: number;
  method: "UPI" | "BANK";
  bankDetails: { bankName: string; accountNumber: string; ifsc: string; upiId?: string };
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "REJECTED";
  rejectionReason?: string;
  createdAt: string;
  processedAt?: string;
  transactionId?: string;
  payoutProvider?: string | null;
  payoutRef?: string | null;
  payoutStatus?: string | null;
  payoutError?: string | null;
}

// A row whose disbursement is handled by an automated provider (not manual).
const isAutomated = (w: Withdrawal) => !!w.payoutProvider && w.payoutProvider !== "manual";

type FilterTab = "ALL" | "PENDING" | "PROCESSING" | "COMPLETED" | "REJECTED";

const statusColor = (status: string) => {
  switch (status) {
    case "PENDING": return Colors.warning;
    case "PROCESSING": return Colors.info;
    case "COMPLETED": return Colors.success;
    case "REJECTED": return Colors.error;
    default: return Colors.textSecondary;
  }
};

const roleColor = (role: string) => {
  switch (role.toUpperCase()) {
    case "VENDOR": return Colors.primary;
    case "DELIVERY": return Colors.info;
    case "FRANCHISE": return "#6366F1";
    case "MARKETING": return "#8B5CF6";
    default: return Colors.textSecondary;
  }
};

const formatAmount = (amount: number) => {
  return "\u20B9" + amount.toLocaleString("en-IN");
};

const formatDate = (dateStr: string) => {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) +
    ", " + date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
};

export default function WithdrawalManagement() {
  const { getInvoiceByRef, addInvoice: storeAddInvoice } = useApp();
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterTab>("ALL");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [invoiceModalVisible, setInvoiceModalVisible] = useState(false);
  const [currentInvoice, setCurrentInvoice] = useState<Invoice | null>(null);

  const handleViewWithdrawalReceipt = (w: Withdrawal) => {
    try { Haptics.selectionAsync(); } catch {}
    const existing = getInvoiceByRef(w.id);
    if (existing) {
      setCurrentInvoice(existing);
      setInvoiceModalVisible(true);
      return;
    }
    const bankInfo = w.method === "UPI" && w.bankDetails.upiId
      ? `UPI: ${w.bankDetails.upiId}`
      : `${w.bankDetails.bankName} - A/C: ****${(w.bankDetails.accountNumber || "").slice(-4)} | IFSC: ${w.bankDetails.ifsc}`;
    const invoice = generateInvoice({
      type: "WITHDRAWAL",
      referenceId: w.id,
      toName: w.userName,
      toPhone: "+91 9XXXXXXXXX",
      toAddress: bankInfo,
      paymentMethod: w.method === "UPI" ? "UPI Transfer" : "Bank Transfer",
      rawItems: [
        { description: "Withdrawal Amount", hsnSac: "998599", qty: 1, rate: w.amount },
      ],
      notes: `Withdrawal ${w.status} | ${w.transactionId ? "TXN: " + w.transactionId : ""} | ${w.processedAt ? "Processed: " + formatDate(w.processedAt) : ""}`.trim(),
    });
    storeAddInvoice(invoice);
    setCurrentInvoice(invoice);
    setInvoiceModalVisible(true);
  };

  const fetchWithdrawals = useCallback(async () => {
    try {
      setError(null);
      const url = new URL("/api/withdrawals", getApiUrl());
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error("Failed to fetch withdrawals");
      const data = await res.json();
      setWithdrawals(Array.isArray(data) ? data : data.withdrawals || []);
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchWithdrawals();
  }, [fetchWithdrawals]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchWithdrawals();
  };

  const handleBack = () => {
    try { Haptics.selectionAsync(); } catch {}
    router.back();
  };

  const handleApprove = async (id: string) => {
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); } catch {}
    Alert.alert(
      "Approve Withdrawal",
      "Are you sure you want to approve this withdrawal request?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Approve",
          onPress: async () => {
            setActionLoading(id);
            try {
              const url = new URL(`/api/withdrawals/${id}/approve`, getApiUrl());
              const res = await fetch(url.toString(), { method: "PATCH" });
              const data = await res.json().catch(() => ({} as any));
              if (!res.ok) throw new Error(data.error || "Failed to approve");
              try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
              if (data.failed) {
                Alert.alert("Payout Failed", data.error || "The payout could not be completed. The amount has been refunded to the user's wallet.");
              } else if (data.pending) {
                Alert.alert("Payout Submitted", data.message || "Payout submitted; awaiting confirmation from the provider.");
              } else if (data.mode === "manual") {
                Alert.alert("Approved", "Send the money manually, then tap Mark Completed.");
              } else if (data.withdrawal?.status === "COMPLETED") {
                Alert.alert("Paid", "Payout completed successfully.");
              } else {
                Alert.alert("Success", "Withdrawal approved — payout is processing.");
              }
              fetchWithdrawals();
            } catch (err: any) {
              Alert.alert("Error", err.message || "Failed to approve withdrawal");
            } finally {
              setActionLoading(null);
            }
          },
        },
      ]
    );
  };

  const handleComplete = async (id: string) => {
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); } catch {}
    Alert.alert(
      "Mark as Completed",
      "Confirm that this withdrawal has been completed?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Complete",
          onPress: async () => {
            setActionLoading(id);
            try {
              const url = new URL(`/api/withdrawals/${id}/complete`, getApiUrl());
              const res = await fetch(url.toString(), { method: "PATCH" });
              const data = await res.json().catch(() => ({} as any));
              if (!res.ok) throw new Error(data.error || "Failed to complete");
              try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
              Alert.alert("Success", "Withdrawal has been marked as completed.");
              fetchWithdrawals();
            } catch (err: any) {
              Alert.alert("Error", err.message || "Failed to complete withdrawal");
            } finally {
              setActionLoading(null);
            }
          },
        },
      ]
    );
  };

  const openRejectModal = (id: string) => {
    try { Haptics.selectionAsync(); } catch {}
    setRejectId(id);
    setRejectReason("");
    setShowRejectModal(true);
  };

  const handleRejectSubmit = async () => {
    if (!rejectReason.trim()) {
      Alert.alert("Required", "Please provide a reason for rejection.");
      return;
    }
    if (!rejectId) return;
    setShowRejectModal(false);
    setActionLoading(rejectId);
    try {
      const url = new URL(`/api/withdrawals/${rejectId}/reject`, getApiUrl());
      const res = await fetch(url.toString(), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: rejectReason.trim() }),
      });
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok) throw new Error(data.error || "Failed to reject");
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
      Alert.alert("Rejected", "Withdrawal request has been rejected.");
      fetchWithdrawals();
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to reject withdrawal");
    } finally {
      setActionLoading(null);
      setRejectId(null);
    }
  };

  const filteredWithdrawals = activeFilter === "ALL"
    ? withdrawals
    : withdrawals.filter((w) => w.status === activeFilter);

  const pendingItems = withdrawals.filter((w) => w.status === "PENDING");
  const processingItems = withdrawals.filter((w) => w.status === "PROCESSING");
  const completedItems = withdrawals.filter((w) => w.status === "COMPLETED");
  const rejectedItems = withdrawals.filter((w) => w.status === "REJECTED");

  const sumAmount = (items: Withdrawal[]) => items.reduce((s, w) => s + w.amount, 0);

  const filterTabs: { key: FilterTab; label: string }[] = [
    { key: "ALL", label: "All" },
    { key: "PENDING", label: "Pending" },
    { key: "PROCESSING", label: "Processing" },
    { key: "COMPLETED", label: "Completed" },
    { key: "REJECTED", label: "Rejected" },
  ];

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: bottomInset + 20 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      >
        <LinearGradient colors={["#0B1E3D", "#142F5E"]} style={[styles.header, { paddingTop: topInset + 12 }]}>
          <View style={styles.headerRow}>
            <Pressable style={styles.backBtn} onPress={handleBack}>
              <Ionicons name="arrow-back" size={22} color="#FFF" />
            </Pressable>
            <Text style={styles.headerTitle}>Withdrawal Management</Text>
            <View style={{ width: 42 }} />
          </View>
        </LinearGradient>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.loadingText}>Loading withdrawals...</Text>
          </View>
        ) : error ? (
          <View style={styles.errorContainer}>
            <Ionicons name="cloud-offline" size={48} color={Colors.error} />
            <Text style={styles.errorTitle}>Failed to load</Text>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable style={({ pressed }) => [styles.retryBtn, pressed && { opacity: 0.7 }]} onPress={fetchWithdrawals}>
              <Ionicons name="refresh" size={16} color="#FFF" />
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <View style={styles.summarySection}>
              <View style={styles.summaryCard}>
                <View style={[styles.summaryIcon, { backgroundColor: Colors.warning + "18" }]}>
                  <Ionicons name="time" size={18} color={Colors.warning} />
                </View>
                <Text style={styles.summaryValue}>{pendingItems.length}</Text>
                <Text style={styles.summaryAmount}>{formatAmount(sumAmount(pendingItems))}</Text>
                <Text style={styles.summaryLabel}>Pending</Text>
              </View>
              <View style={styles.summaryCard}>
                <View style={[styles.summaryIcon, { backgroundColor: Colors.info + "18" }]}>
                  <Ionicons name="sync" size={18} color={Colors.info} />
                </View>
                <Text style={styles.summaryValue}>{processingItems.length}</Text>
                <Text style={styles.summaryAmount}>{formatAmount(sumAmount(processingItems))}</Text>
                <Text style={styles.summaryLabel}>Processing</Text>
              </View>
              <View style={styles.summaryCard}>
                <View style={[styles.summaryIcon, { backgroundColor: Colors.success + "18" }]}>
                  <Ionicons name="checkmark-circle" size={18} color={Colors.success} />
                </View>
                <Text style={styles.summaryValue}>{completedItems.length}</Text>
                <Text style={styles.summaryAmount}>{formatAmount(sumAmount(completedItems))}</Text>
                <Text style={styles.summaryLabel}>Completed</Text>
              </View>
              <View style={styles.summaryCard}>
                <View style={[styles.summaryIcon, { backgroundColor: Colors.error + "18" }]}>
                  <Ionicons name="close-circle" size={18} color={Colors.error} />
                </View>
                <Text style={styles.summaryValue}>{rejectedItems.length}</Text>
                <Text style={styles.summaryAmount}>{rejectedItems.length > 0 ? formatAmount(sumAmount(rejectedItems)) : "--"}</Text>
                <Text style={styles.summaryLabel}>Rejected</Text>
              </View>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterRow}
            >
              {filterTabs.map((tab) => (
                <Pressable
                  key={tab.key}
                  style={[styles.filterTab, activeFilter === tab.key && styles.filterTabActive]}
                  onPress={() => {
                    try { Haptics.selectionAsync(); } catch {}
                    setActiveFilter(tab.key);
                  }}
                >
                  <Text style={[styles.filterTabText, activeFilter === tab.key && styles.filterTabTextActive]}>
                    {tab.label}
                  </Text>
                  {tab.key !== "ALL" && (
                    <View style={[
                      styles.filterCount,
                      activeFilter === tab.key && styles.filterCountActive,
                    ]}>
                      <Text style={[
                        styles.filterCountText,
                        activeFilter === tab.key && styles.filterCountTextActive,
                      ]}>
                        {tab.key === "PENDING" ? pendingItems.length :
                         tab.key === "PROCESSING" ? processingItems.length :
                         tab.key === "COMPLETED" ? completedItems.length :
                         rejectedItems.length}
                      </Text>
                    </View>
                  )}
                </Pressable>
              ))}
            </ScrollView>

            <View style={styles.listSection}>
              {filteredWithdrawals.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Ionicons name="wallet-outline" size={40} color={Colors.textLight} />
                  <Text style={styles.emptyTitle}>No withdrawals found</Text>
                  <Text style={styles.emptyText}>
                    {activeFilter === "ALL" ? "No withdrawal requests yet" : `No ${activeFilter.toLowerCase()} withdrawals`}
                  </Text>
                </View>
              ) : (
                filteredWithdrawals.map((w) => (
                  <View key={w.id} style={styles.withdrawalCard}>
                    <View style={styles.cardHeader}>
                      <View style={styles.cardUserInfo}>
                        <View style={styles.userAvatar}>
                          <Text style={styles.userAvatarText}>
                            {w.userName.charAt(0).toUpperCase()}
                          </Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <View style={styles.nameRow}>
                            <Text style={styles.userName} numberOfLines={1}>{w.userName}</Text>
                            <View style={[styles.roleBadge, { backgroundColor: roleColor(w.userRole) + "18" }]}>
                              <Text style={[styles.roleBadgeText, { color: roleColor(w.userRole) }]}>
                                {w.userRole}
                              </Text>
                            </View>
                          </View>
                          <Text style={styles.cardDate}>{formatDate(w.createdAt)}</Text>
                        </View>
                      </View>
                      <View style={styles.amountSection}>
                        <Text style={styles.cardAmount}>{formatAmount(w.amount)}</Text>
                        <View style={[styles.statusBadge, { backgroundColor: statusColor(w.status) + "15" }]}>
                          <View style={[styles.statusDot, { backgroundColor: statusColor(w.status) }]} />
                          <Text style={[styles.statusText, { color: statusColor(w.status) }]}>{w.status}</Text>
                        </View>
                      </View>
                    </View>

                    <View style={styles.cardDivider} />

                    <View style={styles.bankDetailsRow}>
                      <View style={styles.methodBadge}>
                        <MaterialCommunityIcons
                          name={w.method === "UPI" ? "cellphone" : "bank"}
                          size={14}
                          color={Colors.info}
                        />
                        <Text style={styles.methodText}>{w.method}</Text>
                      </View>
                      <View style={styles.bankInfo}>
                        {w.method === "UPI" && w.bankDetails.upiId ? (
                          <Text style={styles.bankDetailText} numberOfLines={1}>
                            UPI: {w.bankDetails.upiId}
                          </Text>
                        ) : (
                          <>
                            <Text style={styles.bankDetailText} numberOfLines={1}>
                              {w.bankDetails.bankName} - A/C: ****{(w.bankDetails.accountNumber || "").slice(-4)}
                            </Text>
                            <Text style={styles.bankDetailSub}>IFSC: {w.bankDetails.ifsc}</Text>
                          </>
                        )}
                      </View>
                    </View>

                    {w.rejectionReason && (
                      <View style={styles.rejectionRow}>
                        <Ionicons name="information-circle" size={14} color={Colors.error} />
                        <Text style={styles.rejectionText}>{w.rejectionReason}</Text>
                      </View>
                    )}

                    {w.transactionId && (
                      <View style={styles.txnRow}>
                        <Ionicons name="receipt-outline" size={13} color={Colors.textSecondary} />
                        <Text style={styles.txnText}>TXN: {w.transactionId}</Text>
                      </View>
                    )}

                    {w.payoutError && w.status !== "COMPLETED" && (
                      <View style={styles.rejectionRow}>
                        <Ionicons name="alert-circle" size={14} color={Colors.warning} />
                        <Text style={[styles.rejectionText, { color: Colors.warning }]}>{w.payoutError}</Text>
                      </View>
                    )}

                    {isAutomated(w) && (w.payoutRef || w.payoutStatus) && (
                      <View style={styles.txnRow}>
                        <MaterialCommunityIcons name="bank-transfer" size={14} color={Colors.textSecondary} />
                        <Text style={styles.txnText}>
                          {(w.payoutProvider || "").toUpperCase()}
                          {w.payoutStatus ? ` \u00B7 ${w.payoutStatus}` : ""}
                          {w.payoutRef ? ` \u00B7 ${w.payoutRef}` : ""}
                        </Text>
                      </View>
                    )}

                    {w.status === "COMPLETED" && (
                      <View style={styles.actionRow}>
                        <Pressable
                          style={({ pressed }) => [styles.viewReceiptBtn, pressed && { opacity: 0.7 }]}
                          onPress={() => handleViewWithdrawalReceipt(w)}
                        >
                          <Ionicons name="document-text-outline" size={16} color={Colors.info} />
                          <Text style={styles.viewReceiptText}>View Receipt</Text>
                        </Pressable>
                      </View>
                    )}

                    {(w.status === "PENDING" || w.status === "PROCESSING") && (
                      <View style={styles.actionRow}>
                        {w.status === "PENDING" && (
                          <>
                            <Pressable
                              style={({ pressed }) => [styles.approveBtn, pressed && { opacity: 0.7 }]}
                              onPress={() => handleApprove(w.id)}
                              disabled={actionLoading === w.id}
                            >
                              {actionLoading === w.id ? (
                                <ActivityIndicator size="small" color="#FFF" />
                              ) : (
                                <>
                                  <Ionicons name="checkmark-circle" size={16} color="#FFF" />
                                  <Text style={styles.approveBtnText}>Approve</Text>
                                </>
                              )}
                            </Pressable>
                            <Pressable
                              style={({ pressed }) => [styles.rejectBtn, pressed && { opacity: 0.7 }]}
                              onPress={() => openRejectModal(w.id)}
                              disabled={actionLoading === w.id}
                            >
                              <Ionicons name="close-circle" size={16} color={Colors.error} />
                              <Text style={styles.rejectBtnText}>Reject</Text>
                            </Pressable>
                          </>
                        )}
                        {w.status === "PROCESSING" && (
                          isAutomated(w) ? (
                            <View style={styles.autoPayoutNote}>
                              <Ionicons name="sync" size={14} color={Colors.info} />
                              <Text style={styles.autoPayoutNoteText}>
                                Automated payout in progress — it completes (or auto-refunds) once the provider confirms.
                              </Text>
                            </View>
                          ) : (
                            <Pressable
                              style={({ pressed }) => [styles.completeBtn, pressed && { opacity: 0.7 }]}
                              onPress={() => handleComplete(w.id)}
                              disabled={actionLoading === w.id}
                            >
                              {actionLoading === w.id ? (
                                <ActivityIndicator size="small" color="#FFF" />
                              ) : (
                                <>
                                  <Ionicons name="checkmark-done" size={16} color="#FFF" />
                                  <Text style={styles.completeBtnText}>Mark Completed</Text>
                                </>
                              )}
                            </Pressable>
                          )
                        )}
                      </View>
                    )}
                  </View>
                ))
              )}
            </View>
          </>
        )}
      </ScrollView>

      <Modal visible={invoiceModalVisible} animationType="slide" presentationStyle="pageSheet">
        {currentInvoice && (
          <InvoiceView
            invoice={currentInvoice}
            onClose={() => {
              setInvoiceModalVisible(false);
              setCurrentInvoice(null);
            }}
          />
        )}
      </Modal>

      <Modal visible={showRejectModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Reject Withdrawal</Text>
              <Pressable onPress={() => setShowRejectModal(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </Pressable>
            </View>
            <Text style={styles.modalLabel}>Reason for rejection</Text>
            <TextInput
              style={styles.reasonInput}
              placeholder="Enter reason for rejection..."
              placeholderTextColor={Colors.textLight}
              value={rejectReason}
              onChangeText={setRejectReason}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
            <View style={styles.modalActions}>
              <Pressable
                style={({ pressed }) => [styles.modalCancelBtn, pressed && { opacity: 0.7 }]}
                onPress={() => setShowRejectModal(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.modalRejectBtn, pressed && { opacity: 0.7 }]}
                onPress={handleRejectSubmit}
              >
                <Ionicons name="close-circle" size={16} color="#FFF" />
                <Text style={styles.modalRejectText}>Reject</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { paddingHorizontal: 20, paddingBottom: 24 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  backBtn: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { fontFamily: "Poppins_700Bold", fontSize: 20, color: "#FFF" },
  loadingContainer: { alignItems: "center", justifyContent: "center", paddingTop: 80, gap: 12 },
  loadingText: { fontFamily: "Poppins_500Medium", fontSize: 14, color: Colors.textSecondary },
  errorContainer: { alignItems: "center", justifyContent: "center", paddingTop: 60, paddingHorizontal: 40, gap: 8 },
  errorTitle: { fontFamily: "Poppins_700Bold", fontSize: 18, color: Colors.text, marginTop: 8 },
  errorText: { fontFamily: "Poppins_400Regular", fontSize: 13, color: Colors.textSecondary, textAlign: "center" as const },
  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 12,
  },
  retryText: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: "#FFF" },
  summarySection: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 16, marginTop: -12, gap: 10 },
  summaryCard: {
    width: "48%" as any,
    backgroundColor: "#FFF",
    borderRadius: 16,
    padding: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  summaryIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  summaryValue: { fontFamily: "Poppins_700Bold", fontSize: 22, color: Colors.secondary },
  summaryAmount: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: Colors.primary, marginTop: 1 },
  summaryLabel: { fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  filterRow: { paddingHorizontal: 16, paddingVertical: 16, gap: 8 },
  filterTab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  filterTabActive: {
    backgroundColor: Colors.secondary,
    borderColor: Colors.secondary,
  },
  filterTabText: { fontFamily: "Poppins_500Medium", fontSize: 13, color: Colors.textSecondary },
  filterTabTextActive: { color: "#FFF" },
  filterCount: {
    backgroundColor: Colors.borderLight,
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 1,
    minWidth: 20,
    alignItems: "center",
  },
  filterCountActive: { backgroundColor: "rgba(255,255,255,0.2)" },
  filterCountText: { fontFamily: "Poppins_600SemiBold", fontSize: 10, color: Colors.textSecondary },
  filterCountTextActive: { color: "#FFF" },
  listSection: { paddingHorizontal: 16, gap: 12 },
  emptyCard: {
    backgroundColor: "#FFF",
    borderRadius: 16,
    padding: 40,
    alignItems: "center",
    gap: 8,
  },
  emptyTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 16, color: Colors.text },
  emptyText: { fontFamily: "Poppins_400Regular", fontSize: 13, color: Colors.textSecondary },
  withdrawalCard: {
    backgroundColor: "#FFF",
    borderRadius: 16,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  cardUserInfo: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1, marginRight: 12 },
  userAvatar: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.secondary + "15",
    alignItems: "center",
    justifyContent: "center",
  },
  userAvatarText: { fontFamily: "Poppins_700Bold", fontSize: 16, color: Colors.secondary },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  userName: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: Colors.text, maxWidth: 120 },
  roleBadge: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  roleBadgeText: { fontFamily: "Poppins_500Medium", fontSize: 9, textTransform: "uppercase" as const },
  cardDate: { fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textLight, marginTop: 2 },
  amountSection: { alignItems: "flex-end" },
  cardAmount: { fontFamily: "Poppins_700Bold", fontSize: 18, color: Colors.secondary },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: 4,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontFamily: "Poppins_600SemiBold", fontSize: 10 },
  cardDivider: { height: 1, backgroundColor: Colors.borderLight, marginVertical: 12 },
  bankDetailsRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  methodBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.info + "12",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  methodText: { fontFamily: "Poppins_600SemiBold", fontSize: 11, color: Colors.info },
  bankInfo: { flex: 1 },
  bankDetailText: { fontFamily: "Poppins_500Medium", fontSize: 12, color: Colors.text },
  bankDetailSub: { fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textSecondary, marginTop: 1 },
  rejectionRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    marginTop: 10,
    backgroundColor: Colors.error + "08",
    borderRadius: 8,
    padding: 10,
  },
  rejectionText: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.error, flex: 1 },
  txnRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
  },
  txnText: { fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textSecondary },
  actionRow: { flexDirection: "row", gap: 10, marginTop: 14 },
  approveBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: Colors.success,
    paddingVertical: 10,
    borderRadius: 10,
  },
  approveBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: "#FFF" },
  rejectBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: Colors.error + "15",
    paddingVertical: 10,
    borderRadius: 10,
  },
  rejectBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: Colors.error },
  completeBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: Colors.info,
    paddingVertical: 10,
    borderRadius: 10,
  },
  completeBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: "#FFF" },
  autoPayoutNote: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.info + "12",
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 10,
  },
  autoPayoutNoteText: { fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.info, flex: 1 },
  viewReceiptBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: Colors.info + "12",
    paddingVertical: 10,
    borderRadius: 10,
  },
  viewReceiptText: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: Colors.info },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#FFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  modalTitle: { fontFamily: "Poppins_700Bold", fontSize: 18, color: Colors.text },
  modalLabel: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: Colors.textSecondary, marginBottom: 8 },
  reasonInput: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: 14,
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: Colors.text,
    minHeight: 100,
    backgroundColor: Colors.background,
  },
  modalActions: { flexDirection: "row", gap: 12, marginTop: 20 },
  modalCancelBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: Colors.borderLight,
  },
  modalCancelText: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: Colors.textSecondary },
  modalRejectBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: Colors.error,
  },
  modalRejectText: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: "#FFF" },
});

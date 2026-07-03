import React, { useEffect, useState, useMemo } from "react";
import { View, ScrollView, Pressable, StyleSheet, Platform, Alert , KeyboardAvoidingView } from "react-native";
import { Button, Text, Icon, TextInput, Portal, Dialog, Divider } from "react-native-paper";
import * as Haptics from "expo-haptics";

import { useShopsQuery } from "../../hooks/useShops";
import { usePaymentsQuery, useVerifyPaymentMutation, useMarkPaymentMismatchMutation } from "../../hooks/usePayments";
import { useShopStore } from "../../auth/shop-store";
import { Screen } from "../../components/Screen";
import { AppHeader } from "../../components/ui/AppHeader";
import { StatusPill } from "../../components/ui/StatusPill";
import { colors, spacing, radius, fontWeight, shadow, fontSize } from "../../theme";

export function PaymentVerification() {
  const activeShopId = useShopStore((state) => state.activeShopId);
  const [activeTab, setActiveTab] = useState("pending");
  const [selectedMode, setSelectedMode] = useState("ALL");
  const [note, setNote] = useState("");
  const [activePaymentId, setActivePaymentId] = useState<string | null>(null);
  const [actionType, setActionType] = useState<"verify" | "mismatch" | null>(null);

  const shopId = activeShopId || undefined;
  const paymentsQuery = usePaymentsQuery(shopId);

  const verifyMutation = useVerifyPaymentMutation(shopId);
  const mismatchMutation = useMarkPaymentMismatchMutation(shopId);

  const handleConfirm = () => {
    if (!activePaymentId || !actionType) return;
    const mut = actionType === "verify" ? verifyMutation : mismatchMutation;
    mut.mutate({ paymentId: activePaymentId, note }, {
      onSuccess: () => {
        if (Platform.OS !== "web") {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        }
        setActivePaymentId(null);
        setActionType(null);
        setNote("");
      },
      onError: (err) => {
        Alert.alert("Action Failed", err instanceof Error ? err.message : "Something went wrong.");
      }
    });
  };

  const isPending = verifyMutation.isPending || mismatchMutation.isPending;

  const filteredPayments = useMemo(() => {
    return (paymentsQuery.data ?? []).filter(p => {
      if (p.paymentMode === "CASH") return false;
      const matchesTab = activeTab === "pending" 
        ? p.status === "RECORDED"
        : (p.status === "VERIFIED" || p.status === "REJECTED");
      const matchesMode = selectedMode === "ALL" || p.paymentMode === selectedMode;
      return matchesTab && matchesMode;
    });
  }, [paymentsQuery.data, activeTab, selectedMode]);

  const pendingCount = (paymentsQuery.data ?? []).filter(p => 
    p.paymentMode !== "CASH" && p.status === "RECORDED"
  ).length;

  const formatDateTime = (dateStr?: string) => {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    return d.toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  };

  const handleTabPress = (tabName: string) => {
    if (Platform.OS !== "web") {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    setActiveTab(tabName);
  };

  const handleModePress = (modeName: string) => {
    if (Platform.OS !== "web") {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    setSelectedMode(modeName);
  };

  return (
    <Screen scroll={false}>
      <AppHeader title="Payment Verification" subtitle={`${pendingCount} entries pending review`} showBack />

      <View style={styles.statusTabsContainer}>
        <Pressable 
          style={[styles.statusTab, activeTab === 'pending' && styles.statusTabActive]} 
          onPress={() => handleTabPress('pending')}
        >
          <Icon source="clock-outline" size={16} color={activeTab === 'pending' ? colors.primary : colors.textSecondary} />
          <Text style={[styles.statusTabText, activeTab === 'pending' && styles.statusTabTextActive]}>
            Pending Review {pendingCount > 0 ? `(${pendingCount})` : ""}
          </Text>
        </Pressable>
        <Pressable 
          style={[styles.statusTab, activeTab === 'completed' && styles.statusTabActive]} 
          onPress={() => handleTabPress('completed')}
        >
          <Icon source="history" size={16} color={activeTab === 'completed' ? colors.primary : colors.textSecondary} />
          <Text style={[styles.statusTabText, activeTab === 'completed' && styles.statusTabTextActive]}>
            Review History
          </Text>
        </Pressable>
      </View>

      <View style={styles.filterSection}>
        <Text style={styles.filterLabel}>FILTER BY METHOD</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.modeTabsContent}>
          {[
            { mode: "ALL", label: "All Methods", icon: "format-list-bulleted" },
            { mode: "UPI", label: "UPI", icon: "qrcode" },
            { mode: "CARD", label: "Card", icon: "credit-card-outline" },
            { mode: "BANK_TRANSFER", label: "Bank Transfer", icon: "bank-outline" },
            { mode: "CHEQUE", label: "Cheque", icon: "book-open-outline" },
          ].map(item => (
            <Pressable 
              key={item.mode} 
              onPress={() => handleModePress(item.mode)}
              style={[
                styles.modeChip, 
                selectedMode === item.mode ? styles.modeChipActive : styles.modeChipInactive
              ]}
            >
              <Icon 
                source={item.icon} 
                size={14} 
                color={selectedMode === item.mode ? colors.textInverse : colors.textSecondary} 
              />
              <Text 
                style={[
                  styles.modeChipText, 
                  selectedMode === item.mode ? styles.modeChipTextActive : styles.modeChipTextInactive
                ]}
              >
                {item.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.listContent} keyboardShouldPersistTaps="handled">
        <View style={styles.listGap}>
          {filteredPayments.map(p => (
            <View key={p.id} style={styles.paymentCard}>
              <View style={styles.cardHeader}>
                <View>
                  <Text style={styles.amountText}>₹{Number(p.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</Text>
                  <View style={styles.modeBadge}>
                    <Icon source={
                      p.paymentMode === "UPI" ? "qrcode" :
                      p.paymentMode === "CARD" ? "credit-card-outline" :
                      p.paymentMode === "BANK_TRANSFER" ? "bank-outline" :
                      p.paymentMode === "CHEQUE" ? "book-open-outline" : "wallet"
                    } size={12} color={colors.textSecondary} />
                    <Text style={styles.modeBadgeText}>{p.paymentMode.replace('_', ' ')}</Text>
                  </View>
                </View>
                <StatusPill 
                  label={p.status === "RECORDED" ? "PENDING REVIEW" : p.status} 
                  tone={p.status === 'VERIFIED' ? 'green' : p.status === 'REJECTED' ? 'red' : 'amber'} 
                />
              </View>

              <View style={styles.divider} />

              <View style={styles.cardMetadata}>
                <View style={styles.metaRow}>
                  <Icon source="account-circle-outline" size={16} color={colors.textMuted} />
                  <Text style={styles.metaLabel}>Collected by:</Text>
                  <Text style={styles.metaValue}>{p.receivedBy?.name || "Staff"}</Text>
                </View>

                <View style={styles.metaRow}>
                  <Icon source="clock-outline" size={16} color={colors.textMuted} />
                  <Text style={styles.metaLabel}>Collected at:</Text>
                  <Text style={styles.metaValue}>{formatDateTime(p.receivedAt)}</Text>
                </View>

                <View style={styles.metaRow}>
                  <Icon source="identifier" size={16} color={colors.textMuted} />
                  <Text style={styles.metaLabel}>Reference:</Text>
                  <Text style={[styles.metaValue, p.referenceNumber ? styles.codeText : null]}>
                    {p.referenceNumber || "No Reference"}
                  </Text>
                </View>
              </View>

              <View style={styles.linkedRecordContainer}>
                <View style={styles.linkedHeader}>
                  <Icon source="link-variant" size={14} color={colors.primary} />
                  <Text style={styles.linkedTitle}>LINKED RECEIPT</Text>
                </View>
                <View style={styles.linkedBody}>
                  <Text style={styles.linkedNumber}>
                    {p.saleId 
                      ? `Sale #${p.sale?.saleNumber || "..."}` 
                      : p.orderId 
                        ? `Order #${p.order?.orderNumber || "..."}` 
                        : "Standalone Payment"}
                  </Text>
                  {p.customer && (
                    <Text style={styles.customerName} numberOfLines={1}>
                      {p.customer.name}
                    </Text>
                  )}
                </View>
              </View>

              {activeTab === 'pending' && (
                <View style={styles.cardActions}>
                  <Button 
                    mode="outlined" 
                    icon="close-circle-outline" 
                    textColor={colors.danger}
                    style={[styles.actionButton, styles.mismatchButton]}
                    contentStyle={styles.buttonContent}
                    labelStyle={styles.buttonLabel}
                    onPress={() => {
                      setActivePaymentId(p.id);
                      setActionType('mismatch');
                    }}
                  >
                    Mismatch
                  </Button>
                  <Button 
                    mode="contained" 
                    icon="check-decagram"
                    buttonColor={colors.success}
                    style={styles.actionButton}
                    contentStyle={styles.buttonContent}
                    labelStyle={styles.buttonLabel}
                    onPress={() => {
                      setActivePaymentId(p.id);
                      setActionType('verify');
                    }}
                  >
                    Verify
                  </Button>
                </View>
              )}
            </View>
          ))}
          {filteredPayments.length === 0 && (
            <View style={styles.emptyContainer}>
              <Icon source="check-circle-outline" size={48} color={colors.textMuted} />
              <Text style={styles.emptyText}>All payments cleared for this filter</Text>
            </View>
          )}
        </View>
      </ScrollView>
      </KeyboardAvoidingView>

      <Portal>
        <Dialog visible={!!actionType} onDismiss={() => setActionType(null)} style={styles.dialog}>
          <Dialog.Title style={styles.dialogTitle}>{actionType === 'verify' ? 'Confirm Verification' : 'Report Mismatch'}</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium" style={styles.dialogText}>
              {actionType === 'verify' 
                ? 'Are you sure you have received this payment in your account?' 
                : 'Marking a mismatch will flag this record for staff correction.'}
            </Text>
            <TextInput
              mode="outlined"
              label="Add internal note (optional)"
              value={note}
              onChangeText={setNote}
              style={styles.dialogInput}
              outlineStyle={styles.inputOutline}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setActionType(null)}>Cancel</Button>
            <Button 
              loading={isPending} 
              onPress={handleConfirm}
              textColor={actionType === 'verify' ? colors.success : colors.danger}
            >
              Confirm
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  statusTabsContainer: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceOffset,
    padding: 4,
    marginHorizontal: spacing.lg,
    marginVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statusTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: radius.sm,
  },
  statusTabActive: {
    backgroundColor: colors.surface,
    ...shadow.sm,
  },
  statusTabText: {
    fontSize: 13,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
  },
  statusTabTextActive: {
    color: colors.primary,
  },
  filterSection: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    gap: spacing.xs,
  },
  filterLabel: {
    fontSize: 10,
    fontWeight: fontWeight.bold,
    color: colors.textMuted,
    letterSpacing: 1,
    marginLeft: 4,
  },
  modeTabsContent: {
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  modeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  modeChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  modeChipInactive: {
    backgroundColor: colors.surfaceOffset,
    borderColor: colors.border,
  },
  modeChipText: {
    fontSize: 12,
    fontWeight: fontWeight.bold,
  },
  modeChipTextActive: {
    color: colors.textInverse,
  },
  modeChipTextInactive: {
    color: colors.textSecondary,
  },
  listContent: {
    paddingBottom: spacing.xxxl,
  },
  listGap: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  paymentCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    ...shadow.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  amountText: {
    fontSize: 22,
    fontWeight: fontWeight.extrabold,
    color: colors.textPrimary,
  },
  modeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  modeBadgeText: {
    fontSize: 11,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
    letterSpacing: 0.5,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.md,
  },
  cardMetadata: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  metaLabel: {
    fontSize: 12,
    color: colors.textMuted,
    width: 90,
  },
  metaValue: {
    fontSize: 13,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
    flex: 1,
  },
  codeText: {
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    color: colors.info,
    fontWeight: fontWeight.bold,
  },
  linkedRecordContainer: {
    backgroundColor: colors.surfaceOffset,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  linkedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  linkedTitle: {
    fontSize: 9,
    fontWeight: fontWeight.black,
    color: colors.primary,
    letterSpacing: 0.5,
  },
  linkedBody: {
    gap: 2,
  },
  linkedNumber: {
    fontSize: 14,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  customerName: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  cardActions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  actionButton: {
    flex: 1,
    borderRadius: radius.md,
  },
  mismatchButton: {
    borderColor: colors.danger,
    borderWidth: 1,
  },
  buttonContent: {
    height: 44,
  },
  buttonLabel: {
    fontSize: 13,
    fontWeight: fontWeight.bold,
  },
  emptyContainer: {
    alignItems: 'center',
    padding: spacing.huge,
    gap: spacing.md,
  },
  emptyText: {
    color: colors.textMuted,
    fontWeight: fontWeight.bold,
    textAlign: 'center',
  },
  dialog: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
  },
  dialogTitle: {
    fontWeight: fontWeight.bold,
  },
  dialogText: {
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  dialogInput: {
    backgroundColor: colors.surface,
    marginTop: spacing.md,
  },
  inputOutline: {
    borderRadius: radius.md,
  },
});

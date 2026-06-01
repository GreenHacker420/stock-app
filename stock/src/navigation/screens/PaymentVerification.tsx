import { useEffect, useState, useMemo } from "react";
import { View, ScrollView, Pressable, StyleSheet } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Text, Icon, TextInput, Portal, Dialog, Divider } from "react-native-paper";
import { fetchPayments, verifyPayment, markPaymentMismatch, fetchShops, Payment } from "../../api/client";
import { useAuthStore } from "../../auth/auth-store";
import { Screen } from "../../components/Screen";
import { AppHeader } from "../../components/ui/AppHeader";
import { ShopPicker } from "../../components/ui/ShopPicker";
import { Section } from "../../components/ui/Section";
import { StatusPill } from "../../components/ui/StatusPill";
import { colors, spacing, radius, fontWeight } from "../../theme";

export function PaymentVerification() {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();

  const [shopId, setShopId] = useState<string | undefined>();
  const [activeTab, setActiveTab] = useState("pending");
  const [selectedMode, setSelectedMode] = useState("ALL");
  const [note, setNote] = useState("");
  const [activePaymentId, setActivePaymentId] = useState<string | null>(null);
  const [actionType, setActionType] = useState<"verify" | "mismatch" | null>(null);

  const shopsQuery = useQuery({ queryKey: ["shops"], queryFn: () => fetchShops(token ?? ""), enabled: !!token });

  useEffect(() => {
    if (!shopId && shopsQuery.data?.[0]) setShopId(shopsQuery.data[0].id);
  }, [shopId, shopsQuery.data]);

  const paymentsQuery = useQuery({
    queryKey: ["payments", shopId],
    queryFn: () => fetchPayments(token ?? "", shopId ?? ""),
    enabled: !!token && !!shopId,
  });

  const mutation = useMutation({
    mutationFn: () => {
      if (!activePaymentId || !actionType) return Promise.reject();
      return actionType === "verify" 
        ? verifyPayment(token ?? "", activePaymentId, note)
        : markPaymentMismatch(token ?? "", activePaymentId, note);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payments", shopId] });
      setActivePaymentId(null);
      setActionType(null);
      setNote("");
    },
  });

  const filteredPayments = useMemo(() => {
    return (paymentsQuery.data ?? []).filter(p => {
      if (p.paymentMode === "CASH") return false;
      const matchesTab = activeTab === "pending" 
        ? (p.verificationStatus === "RECORDED" || p.verificationStatus === "PENDING_VERIFICATION")
        : (p.verificationStatus === "VERIFIED" || p.verificationStatus === "MISMATCH");
      const matchesMode = selectedMode === "ALL" || p.paymentMode === selectedMode;
      return matchesTab && matchesMode;
    });
  }, [paymentsQuery.data, activeTab, selectedMode]);

  const pendingCount = (paymentsQuery.data ?? []).filter(p => 
    p.paymentMode !== "CASH" && (p.verificationStatus === "RECORDED" || p.verificationStatus === "PENDING_VERIFICATION")
  ).length;

  return (
    <Screen scroll={false}>
      <AppHeader title="Payment Verification" subtitle={`${pendingCount} entries pending review`} />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabContainer} contentContainerStyle={styles.tabContent}>
        {["ALL", "UPI", "CARD", "BANK_TRANSFER", "CHEQUE"].map(mode => (
          <Pressable 
            key={mode} 
            onPress={() => setSelectedMode(mode)}
            style={[styles.modeTab, selectedMode === mode ? styles.modeTabActive : styles.modeTabInactive]}
          >
            <Text style={[styles.modeTabText, selectedMode === mode ? styles.modeTabTextActive : styles.modeTabTextInactive]}>
              {mode.replace('_', ' ')}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <ShopPicker shops={shopsQuery.data ?? []} selectedShopId={shopId} onSelect={setShopId} />

      <View style={styles.statusTabs}>
        <Pressable 
          style={[styles.statusTab, activeTab === 'pending' && styles.statusTabActive]} 
          onPress={() => setActiveTab('pending')}
        >
          <Text style={[styles.statusTabText, activeTab === 'pending' && styles.statusTabTextActive]}>Pending Verification</Text>
        </Pressable>
        <Pressable 
          style={[styles.statusTab, activeTab === 'completed' && styles.statusTabActive]} 
          onPress={() => setActiveTab('completed')}
        >
          <Text style={[styles.statusTabText, activeTab === 'completed' && styles.statusTabTextActive]}>Review History</Text>
        </Pressable>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.listContent}>
        <View style={styles.listGap}>
          {filteredPayments.map(p => (
            <View key={p.id} style={styles.paymentCard}>
              <View style={styles.cardHeader}>
                <View style={styles.flex1}>
                  <Text variant="titleMedium" style={styles.boldText}>₹{Number(p.amount).toLocaleString()}</Text>
                  <Text style={styles.secondaryText}>{p.paymentMode} • {p.referenceNumber ?? 'No Reference'}</Text>
                </View>
                <StatusPill label={p.verificationStatus} tone={p.verificationStatus === 'VERIFIED' ? 'green' : p.verificationStatus === 'MISMATCH' ? 'red' : 'amber'} />
              </View>

              <View style={styles.divider} />

              <View style={styles.cardBody}>
                 <Text variant="labelSmall" style={styles.labelMuted}>LINKED RECORD</Text>
                 <Text style={styles.recordText}>
                    {p.saleId ? `Sale: ${p.sale?.saleNumber || '...'}` : p.orderId ? `Order: ${p.order?.orderNumber || '...'}` : 'Standalone payment'}
                 </Text>
                 {p.customer && <Text variant="bodySmall" style={styles.secondaryText}>{p.customer.name}</Text>}
              </View>

              {activeTab === 'pending' && (
                <View style={styles.cardActions}>
                  <Button 
                    mode="outlined" 
                    icon="close-circle-outline" 
                    textColor={colors.danger}
                    style={styles.actionButton}
                    contentStyle={styles.buttonContent}
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
              loading={mutation.isPending} 
              onPress={() => mutation.mutate()}
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
  tabContainer: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.bg,
    maxHeight: 64,
  },
  tabContent: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  modeTab: {
    marginRight: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: 6,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  modeTabActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  modeTabInactive: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  modeTabText: {
    fontWeight: fontWeight.bold,
    fontSize: 12,
  },
  modeTabTextActive: {
    color: colors.surface,
  },
  modeTabTextInactive: {
    color: colors.textSecondary,
  },
  statusTabs: {
    flexDirection: 'row',
    backgroundColor: colors.bg,
    padding: spacing.xs,
    margin: spacing.lg,
    borderRadius: radius.md,
  },
  statusTab: {
    flex: 1,
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderRadius: radius.sm,
  },
  statusTabActive: {
    backgroundColor: colors.surface,
  },
  statusTabText: {
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
    fontSize: 13,
  },
  statusTabTextActive: {
    color: colors.primary,
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
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  flex1: {
    flex: 1,
  },
  boldText: {
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  secondaryText: {
    color: colors.textSecondary,
  },
  divider: {
    height: 1,
    backgroundColor: colors.bg,
    marginVertical: spacing.md,
  },
  cardBody: {
    gap: 4,
  },
  labelMuted: {
    color: colors.textMuted,
    fontWeight: fontWeight.bold,
    letterSpacing: 0.5,
  },
  recordText: {
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
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
  buttonContent: {
    height: 44,
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

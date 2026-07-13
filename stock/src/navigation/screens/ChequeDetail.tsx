import { useState } from "react";
import { View, StyleSheet, ScrollView, ActivityIndicator, Alert, Pressable } from "react-native";
import { Text, Icon, Divider } from "react-native-paper";
import { useRoute, useNavigation, type RouteProp, type NavigationProp } from "@react-navigation/native";
import { type RootStackParamList } from "../index";
import { Screen } from "../../components/Screen";
import { AppHeader } from "../../components/ui/AppHeader";
import { StatusPill } from "../../components/ui/StatusPill";
import { Section } from "../../components/ui/Section";
import { Button } from "../../components/ui/Button";
import { useAuthStore } from "../../auth/auth-store";
import {
  useChequeDetailQuery,
  useMarkChequeDepositedMutation,
  useMarkChequeClearedMutation,
  useMarkChequeBouncedMutation,
  useMarkChequeReturnedMutation,
} from "../../hooks/useCheques";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../theme";
import { triggerLightHaptic } from "../../utils/haptics";

const money = (value?: string | number | null) => `₹${Number(value ?? 0).toLocaleString("en-IN")}`;

const haptic = () => {
  triggerLightHaptic();
};

export function ChequeDetail() {
  const route = useRoute<RouteProp<RootStackParamList, "ChequeDetail" | "ChequeDetail" & string>>();
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { chequeId } = route.params || {};

  const user = useAuthStore((state) => state.user);
  const isOwner = user?.role === "OWNER";

  const { data: cheque, isLoading, refetch } = useChequeDetailQuery(chequeId);

  const depositMutation = useMarkChequeDepositedMutation();
  const clearMutation = useMarkChequeClearedMutation();
  const bounceMutation = useMarkChequeBouncedMutation();
  const returnMutation = useMarkChequeReturnedMutation();

  const [loadingAction, setLoadingAction] = useState<string | null>(null);

  if (isLoading || !cheque) {
    return (
      <Screen edges={["top", "left", "right"]}>
        <AppHeader title="Cheque Details" showBack />
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loaderText}>Loading details...</Text>
        </View>
      </Screen>
    );
  }

  const handleStatusUpdate = (action: string, mutateFn: any) => {
    haptic();
    Alert.alert(
      "Confirm Action",
      `Are you sure you want to mark this cheque as ${action.toLowerCase()}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Confirm",
          onPress: () => {
            setLoadingAction(action);
            mutateFn.mutate(
              { id: chequeId },
              {
                onSuccess: () => {
                  setLoadingAction(null);
                  Alert.alert("Success", `Cheque successfully marked as ${action.toLowerCase()}!`);
                  refetch();
                },
                onError: (err: any) => {
                  setLoadingAction(null);
                  Alert.alert("Error", err.message || "Failed to update status");
                },
              }
            );
          },
        },
      ]
    );
  };

  const getStatusConfig = (status?: string | null) => {
    switch (status) {
      case "RECEIVED":
        return { label: "Received", tone: "neutral" as const, color: colors.textSecondary };
      case "DEPOSITED":
        return { label: "Deposited", tone: "blue" as const, color: colors.primary };
      case "CLEARED":
        return { label: "Cleared (Credited)", tone: "green" as const, color: colors.success };
      case "BOUNCED":
        return { label: "Bounced (Rejected)", tone: "red" as const, color: colors.danger };
      case "RETURNED":
        return { label: "Returned", tone: "amber" as const, color: colors.warning };
      case "CANCELLED":
        return { label: "Cancelled", tone: "neutral" as const, color: colors.textMuted };
      default:
        return { label: "Unknown", tone: "neutral" as const, color: colors.textMuted };
    }
  };

  const statusConfig = getStatusConfig(cheque.details?.chequeStatus);
  const chequeDateStr = cheque.details?.chequeDate
    ? new Date(cheque.details.chequeDate).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "—";

  const isTerminalState = ["CLEARED", "BOUNCED", "RETURNED", "CANCELLED"].includes(
    cheque.details?.chequeStatus || ""
  );

  return (
    <Screen edges={["top", "left", "right"]}>
      <AppHeader title="Cheque Details" showBack />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Main Details Card */}
        <View style={styles.chequeCard}>
          <View style={styles.instrumentGraphic}>
            <View style={styles.graphicTop}>
              <Text style={styles.graphicTitle}>CHEQUE INSTRUMENT</Text>
              <Text style={styles.graphicDate}>{chequeDateStr}</Text>
            </View>
            <Divider style={styles.graphicDivider} />
            <View style={styles.graphicBottom}>
              <View>
                <Text style={styles.graphicLabel}>PAY TO THE ORDER OF</Text>
                <Text style={styles.graphicValue}>
                  {cheque.customer?.name || "Walk-In Customer"}
                </Text>
              </View>
              <View style={styles.graphicAmountBox}>
                <Text style={styles.graphicAmount}>{money(cheque.amount)}</Text>
              </View>
            </View>
            <Divider style={styles.graphicDivider} />
            <View style={styles.graphicFooter}>
              <Text style={styles.graphicBank}>{cheque.details?.chequeBankName || "Unknown Bank"}</Text>
              <Text style={styles.graphicChequeNo}>
                No. ⑈{cheque.details?.chequeNumber || "000000"}⑈
              </Text>
            </View>
          </View>

          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Current Status</Text>
            <StatusPill label={statusConfig.label} tone={statusConfig.tone} />
          </View>
        </View>

        {/* Association Metadata Section */}
        <Section title="Transaction Info">
          <View style={styles.metadataCard}>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Payment ID</Text>
              <Text style={styles.metaValue} numberOfLines={1}>{cheque.id}</Text>
            </View>
            <Divider style={styles.divider} />
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Received Date</Text>
              <Text style={styles.metaValue}>
                {new Date(cheque.receivedAt).toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </Text>
            </View>
            <Divider style={styles.divider} />
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Collected By</Text>
              <Text style={styles.metaValue}>{cheque.receivedBy?.name || "—"}</Text>
            </View>

            {cheque.sale && (
              <>
                <Divider style={styles.divider} />
                <View style={styles.metaRow}>
                  <Text style={styles.metaLabel}>Linked Sale</Text>
                  <Pressable
                    onPress={() => {
                      haptic();
                      if (cheque.saleId) {
                        navigation.navigate("SaleDetail", {
                          id: cheque.saleId,
                        });
                      }
                    }}
                  >
                    <Text style={[styles.metaValue, styles.linkText]}>
                      Sale #{cheque.sale.saleNumber}
                    </Text>
                  </Pressable>
                </View>
              </>
            )}

            {(() => {
              const dm = cheque.deliveryMemo;
              if (!dm) return null;
              return (
                <>
                  <Divider style={styles.divider} />
                  <View style={styles.metaRow}>
                    <Text style={styles.metaLabel}>Linked Delivery Memo</Text>
                    <Pressable
                      onPress={() => {
                        haptic();
                        navigation.navigate("DeliveryMemoDetail" as any, { id: dm.id });
                      }}
                    >
                      <Text style={[styles.metaValue, styles.linkText]}>
                        DM #{dm.dmNumber}
                      </Text>
                    </Pressable>
                  </View>
                </>
              );
            })()}
          </View>
        </Section>

        {/* Notes (Optional) */}
        {cheque.notes ? (
          <Section title="Internal Notes">
            <View style={styles.notesCard}>
              <Text style={styles.notesText}>{cheque.notes}</Text>
            </View>
          </Section>
        ) : null}

        {/* Owner Lifecycle Actions */}
        {isOwner && !isTerminalState && (
          <Section title="Update Cheque Lifecycle">
            <View style={styles.actionsCard}>
              {cheque.details?.chequeStatus === "RECEIVED" && (
                <Button
                  label="MARK AS DEPOSITED"
                  variant="primary"
                  icon="bank-transfer"
                  loading={loadingAction === "DEPOSITED"}
                  disabled={!!loadingAction}
                  onPress={() => handleStatusUpdate("DEPOSITED", depositMutation)}
                  fullWidth
                />
              )}

              {cheque.details?.chequeStatus === "DEPOSITED" && (
                <View style={styles.verticalActions}>
                  <Button
                    label="MARK AS CLEARED (CREDITED)"
                    variant="primary"
                    icon="check-circle-outline"
                    loading={loadingAction === "CLEARED"}
                    disabled={!!loadingAction}
                    onPress={() => handleStatusUpdate("CLEARED", clearMutation)}
                    style={{ backgroundColor: colors.success }}
                    fullWidth
                  />
                  <Button
                    label="MARK AS BOUNCED (FAILED)"
                    variant="primary"
                    icon="alert-circle-outline"
                    loading={loadingAction === "BOUNCED"}
                    disabled={!!loadingAction}
                    onPress={() => handleStatusUpdate("BOUNCED", bounceMutation)}
                    style={{ backgroundColor: colors.danger }}
                    fullWidth
                  />
                  <Button
                    label="RETURN TO CUSTOMER"
                    variant="secondary"
                    icon="keyboard-backspace"
                    loading={loadingAction === "RETURNED"}
                    disabled={!!loadingAction}
                    onPress={() => handleStatusUpdate("RETURNED", returnMutation)}
                    fullWidth
                  />
                </View>
              )}
            </View>
          </Section>
        )}

        {isTerminalState && (
          <View style={styles.terminalNotice}>
            <Icon source="checkbox-marked-circle-outline" size={20} color={colors.textMuted} />
            <Text style={styles.terminalNoticeText}>
              This cheque has reached a final state ({statusConfig.label.toLowerCase()}). No further actions required.
            </Text>
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  loaderContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loaderText: {
    marginTop: spacing.sm,
    color: colors.textSecondary,
    fontSize: 14,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },
  chequeCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.sm,
  },
  instrumentGraphic: {
    backgroundColor: "#fffdf5", // Off-white check color
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "#eab308", // Golden border for checks
    padding: spacing.md,
    gap: spacing.sm,
    ...shadow.sm,
  },
  graphicTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  graphicTitle: {
    fontSize: 9,
    fontWeight: fontWeight.extrabold,
    color: "#854d0e",
    letterSpacing: 1,
  },
  graphicDate: {
    fontSize: 12,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  graphicDivider: {
    borderStyle: "dashed",
    borderWidth: 0.5,
    borderColor: "#fef08a",
    backgroundColor: "transparent",
  },
  graphicBottom: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
  },
  graphicLabel: {
    fontSize: 8,
    color: colors.textMuted,
    fontWeight: fontWeight.bold,
  },
  graphicValue: {
    fontSize: 14,
    fontWeight: fontWeight.extrabold,
    color: colors.textPrimary,
  },
  graphicAmountBox: {
    backgroundColor: "#fef9c3",
    borderWidth: 1,
    borderColor: "#fde047",
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  graphicAmount: {
    fontSize: 14,
    fontWeight: fontWeight.black,
    color: colors.textPrimary,
  },
  graphicFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  graphicBank: {
    fontSize: 12,
    fontWeight: fontWeight.extrabold,
    color: "#854d0e",
  },
  graphicChequeNo: {
    fontFamily: "Courier",
    fontSize: 12,
    color: colors.textSecondary,
    letterSpacing: 1,
  },
  statusRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  statusLabel: {
    fontSize: 13,
    fontWeight: fontWeight.semibold,
    color: colors.textSecondary,
  },
  metadataCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.sm,
    gap: spacing.sm,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 2,
  },
  metaLabel: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  metaValue: {
    fontSize: 13,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
  },
  linkText: {
    color: colors.primary,
  },
  divider: {
    backgroundColor: colors.border,
  },
  notesCard: {
    backgroundColor: colors.surfaceOffset,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  notesText: {
    fontSize: 13,
    color: colors.textSecondary,
    fontStyle: "italic",
    lineHeight: 18,
  },
  actionsCard: {
    gap: spacing.md,
  },
  verticalActions: {
    gap: spacing.md,
  },
  terminalNotice: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.surfaceOffset,
    borderRadius: radius.lg,
    marginTop: spacing.sm,
  },
  terminalNoticeText: {
    fontSize: 12,
    color: colors.textMuted,
    flex: 1,
  },
});

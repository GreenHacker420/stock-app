import React, { useMemo } from "react";
import { View, StyleSheet } from "react-native";
import { Text, Icon } from "react-native-paper";
import { FlashList } from "@shopify/flash-list";

import { GENERIC_APPROVAL_SUPPORTED_TYPES, usePendingVerificationsQuery, useProcessVerificationMutation } from "../../hooks/useVerifications";
import { Screen } from "../../components/Screen";
import { AppHeader } from "../../components/ui/AppHeader";
import { Button } from "../../components/ui/Button";
import { VerificationCard } from "../../components/domain/verification/VerificationCard";
import { colors, spacing, fontSize, fontWeight, radius } from "../../theme";
import { EmptyState } from "../../components/ui/EmptyState";
import { SkeletonList } from "../../components/ui/SkeletonCard";
import { Item } from "../../api/client";
import { useItemsQuery, useCurrentStockQuery } from "../../hooks/useItems";

export function VerificationQueue() {
  const { data: verifications, isLoading, refetch } = usePendingVerificationsQuery();
  const mutation = useProcessVerificationMutation();

  const itemsQuery = useItemsQuery({ limit: 1000 });
  const stockQuery = useCurrentStockQuery();

  const itemsMap = useMemo(() => {
    const m = new Map<string, Item>();
    for (const it of itemsQuery.data?.items ?? []) {
      m.set(it.id, it);
    }
    return m;
  }, [itemsQuery.data?.items]);

  const stockMap = useMemo(() => {
    const m = new Map<string, { physicalStock: number }>();
    for (const lvl of stockQuery.data ?? []) {
      m.set(lvl.item.id, { physicalStock: lvl.physicalStock });
    }
    return m;
  }, [stockQuery.data]);

  const handleProcess = (item: any, status: "APPROVED" | "REJECTED") => {
    mutation.mutate({ id: item.id, status, type: item.type || item.action });
  };

  // Workaround for FlashList types compatibility with React 19
  const List = FlashList as any;

  const renderStockEntryDetails = (item: any) => {
    const payload = item.payloadJson || item.requestedChangeJson || item.details || {};
    const entries: Array<{
      itemId?: string;
      itemName?: string;
      name?: string;
      sku?: string;
      unit?: string;
      currentStock?: number;
      quantity?: number;
    }> = Array.isArray(payload.entries) ? payload.entries : payload.items || (payload.itemId ? [payload] : []);

    return (
      <View style={styles.stockDetailsContainer}>
        {entries.map((entry, idx) => {
          const targetId = entry.itemId || "";
          const itemObj = itemsMap.get(targetId);
          const stockObj = stockMap.get(targetId);

          const name = entry.itemName || entry.name || itemObj?.name || (targetId ? `Item #${targetId.slice(-6)}` : `Item ${idx + 1}`);
          const sku = entry.sku || itemObj?.sku;
          const current = entry.currentStock ?? stockObj?.physicalStock ?? 0;
          const qty = entry.quantity ?? 0;
          const proposed = current + qty;
          const unit = entry.unit || itemObj?.unit || "pcs";
          const isAddition = qty >= 0;

          return (
            <View key={targetId || idx} style={styles.itemStockRow}>
              <View style={styles.itemNameCol}>
                <Text style={styles.itemNameText} numberOfLines={2}>{name}</Text>
                {sku ? <Text style={styles.itemSkuText}>SKU: {sku}</Text> : null}
              </View>

              {/* Stock Badges comparison */}
              <View style={styles.stockBadgeContainer}>
                {/* Current Stock Pill */}
                <View style={styles.currentStockPill}>
                  <Text style={styles.currentStockPillText}>
                    Current: <Text style={styles.boldText}>{current} {unit}</Text>
                  </Text>
                </View>

                <Icon source="arrow-right" size={14} color={colors.textMuted} />

                {/* Proposed / Pending Stock Pill */}
                <View style={[styles.proposedStockPill, isAddition ? styles.proposedPositive : styles.proposedNegative]}>
                  <Icon source="clock-outline" size={11} color={isAddition ? colors.success : colors.danger} />
                  <Text style={[styles.proposedStockPillText, isAddition ? { color: colors.success } : { color: colors.danger }]}>
                    Proposed: <Text style={styles.boldText}>{proposed} {unit}</Text> ({isAddition ? `+${qty}` : qty})
                  </Text>
                </View>
              </View>
            </View>
          );
        })}
      </View>
    );
  };

  return (
    <Screen edges={['top', 'left', 'right']}>
      <AppHeader title="Verification Queue" subtitle="Approve or reject staff requests" />

      <View style={styles.container}>
        {isLoading ? (
          <SkeletonList count={8} />
        ) : (
          <List
            data={verifications ?? []}
            keyExtractor={(item: any) => item.id}
            renderItem={({ item }: any) => {
              const approvalType = item.type || item.action || item.entityType || "APPROVAL";
              const canApproveHere = GENERIC_APPROVAL_SUPPORTED_TYPES.has(approvalType);
              const isStockType = approvalType.includes("STOCK") || approvalType.includes("DAMAGE");

              return (
                <VerificationCard
                  title={`${approvalType.replace(/_/g, " ")}`}
                  subtitle={`Requested by: ${item.requestedBy?.name || "Staff"}`}
                  status="PENDING APPROVAL"
                  statusTone="amber"
                  createdAt={item.createdAt ? new Date(item.createdAt).toLocaleString("en-IN", {
                    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit"
                  }) : undefined}
                  actions={canApproveHere ? (
                    <>
                      <Button
                        variant="danger"
                        icon="close-circle-outline"
                        label="Reject"
                        onPress={() => handleProcess(item, 'REJECTED')}
                        loading={mutation.isPending && mutation.variables?.status === 'REJECTED' && mutation.variables?.id === item.id}
                        style={{ flex: 1 }}
                      />
                      <Button
                        variant="success"
                        icon="check-decagram"
                        label="Approve"
                        onPress={() => handleProcess(item, 'APPROVED')}
                        loading={mutation.isPending && mutation.variables?.status === 'APPROVED' && mutation.variables?.id === item.id}
                        style={{ flex: 1 }}
                      />
                    </>
                  ) : undefined}
                >
                  {isStockType ? renderStockEntryDetails(item) : (
                    <View style={styles.genericBody}>
                      <Text style={styles.actionText}>{approvalType.replace(/_/g, " ")}</Text>
                    </View>
                  )}

                  {item.reason ? (
                    <View style={styles.reasonBox}>
                      <Icon source="text-box-outline" size={13} color={colors.textMuted} />
                      <Text style={styles.notes}>"{item.reason}"</Text>
                    </View>
                  ) : null}

                  {!canApproveHere && (
                    <Text style={styles.unsupportedText}>Open the specific module screen to handle this request.</Text>
                  )}
                </VerificationCard>
              );
            }}
            ListEmptyComponent={
              <EmptyState
                icon="check-circle-outline"
                title="All caught up!"
                subtitle="No pending stock or verification requests for this shop."
                action={
                  <Button label="Refresh Queue" onPress={() => refetch()} />
                }
              />
            }
            contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
          />
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  genericBody: {
    marginVertical: spacing.xs,
  },
  actionText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  reasonBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: colors.surfaceOffset,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.sm,
    marginTop: spacing.xs,
    marginBottom: spacing.xs,
  },
  notes: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    fontStyle: 'italic',
    flex: 1,
  },
  unsupportedText: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  stockDetailsContainer: {
    backgroundColor: colors.surfaceOffset,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginVertical: spacing.xs,
    gap: spacing.xs,
  },
  itemStockRow: {
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.xs,
  },
  itemNameCol: {
    flex: 1,
  },
  itemNameText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  itemSkuText: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  stockBadgeContainer: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginTop: 4,
  },
  currentStockPill: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.full,
  },
  currentStockPillText: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
  },
  proposedStockPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.full,
    borderWidth: 1,
    borderStyle: "dashed",
  },
  proposedPositive: {
    backgroundColor: "rgba(22, 163, 74, 0.08)",
    borderColor: colors.success,
  },
  proposedNegative: {
    backgroundColor: "rgba(220, 38, 38, 0.08)",
    borderColor: colors.danger,
  },
  proposedStockPillText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
  },
  boldText: {
    fontWeight: fontWeight.bold,
  },
});

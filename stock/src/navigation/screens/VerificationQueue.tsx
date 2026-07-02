import React from "react";
import { View, StyleSheet } from "react-native";
import { Icon, Text, Divider } from "react-native-paper";
import { FlashList } from "@shopify/flash-list";

import { GENERIC_APPROVAL_SUPPORTED_TYPES, usePendingVerificationsQuery, useProcessVerificationMutation } from "../../hooks/useVerifications";
import { Screen } from "../../components/Screen";
import { AppHeader } from "../../components/ui/AppHeader";
import { Button } from "../../components/ui/Button";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../theme";
import { EmptyState } from "../../components/ui/EmptyState";
import { SkeletonList } from "../../components/ui/SkeletonCard";

export function VerificationQueue() {
  const { data: verifications, isLoading } = usePendingVerificationsQuery();
  const mutation = useProcessVerificationMutation();

  const handleProcess = (item: any, status: "APPROVED" | "REJECTED") => {
    mutation.mutate({ id: item.id, status, type: item.type });
  };

  // Workaround for FlashList types compatibility with React 19
  const List = FlashList as any;

  return (
    <Screen edges={['top', 'left', 'right']}>
      <AppHeader title="Verification Queue" subtitle="Approve or reject staff actions" />
      
      <View style={styles.container}>
        {isLoading ? (
          <SkeletonList count={8} />
        ) : (
          <List
            data={verifications ?? []}
	            renderItem={({ item }: any) => {
                const canApproveHere = GENERIC_APPROVAL_SUPPORTED_TYPES.has(item.type);
                return (
	              <View style={styles.verificationCard}>
                <View style={styles.cardHeader}>
                  <View style={styles.typeBadge}>
                    <Text style={styles.typeText}>{item.entityType}</Text>
                  </View>
                  <Text style={styles.dateText}>{new Date(item.createdAt).toLocaleString()}</Text>
                </View>

                <View style={styles.cardBody}>
                  <Text style={styles.requestedBy}>Requested by: <Text style={{fontWeight: 'bold'}}>{item.requestedBy?.name}</Text></Text>
                  <Text style={styles.actionText}>{item.type || item.action} {item.entityType?.toLowerCase?.() || ""}</Text>
                  {item.reason && <Text style={styles.notes}>"{item.reason}"</Text>}
                  {!canApproveHere && (
                    <Text style={styles.notes}>Open the specific verification screen for this request.</Text>
                  )}
                </View>

                <Divider style={styles.divider} />

                {canApproveHere && (
                  <View style={styles.cardFooter}>
                    <Button
                      variant="secondary"
                      label="Reject"
                      onPress={() => handleProcess(item, 'REJECTED')}
                      loading={mutation.isPending && mutation.variables?.status === 'REJECTED' && mutation.variables?.id === item.id}
                      style={{ flex: 1 }}
                    />
                    <View style={{ width: spacing.md }} />
                    <Button
                      label="Approve"
                      onPress={() => handleProcess(item, 'APPROVED')}
                      loading={mutation.isPending && mutation.variables?.status === 'APPROVED' && mutation.variables?.id === item.id}
                      style={{ flex: 1 }}
                    />
                  </View>
                )}
              </View>
	            );
              }}
            estimatedItemSize={180}
            ListEmptyComponent={<EmptyState icon="check-circle-outline" title="All caught up!" subtitle="No pending verifications" />}
            contentContainerStyle={{ padding: spacing.lg }}
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
  verificationCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  typeBadge: {
    backgroundColor: colors.surfaceOffset,
    paddingHorizontal: spacing.md,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  typeText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: colors.primary,
  },
  dateText: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  cardBody: {
    marginBottom: spacing.lg,
  },
  requestedBy: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  actionText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  notes: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    fontStyle: 'italic',
    marginTop: spacing.sm,
  },
  divider: {
    marginBottom: spacing.lg,
  },
  cardFooter: {
    flexDirection: 'row',
  }
});

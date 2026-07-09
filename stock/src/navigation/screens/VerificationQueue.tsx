import React from "react";
import { View, StyleSheet } from "react-native";
import { Text } from "react-native-paper";
import { FlashList } from "@shopify/flash-list";

import { GENERIC_APPROVAL_SUPPORTED_TYPES, usePendingVerificationsQuery, useProcessVerificationMutation } from "../../hooks/useVerifications";
import { Screen } from "../../components/Screen";
import { AppHeader } from "../../components/ui/AppHeader";
import { Button } from "../../components/ui/Button";
import { VerificationCard } from "../../components/domain/verification/VerificationCard";
import { colors, spacing, fontSize, fontWeight } from "../../theme";
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
            keyExtractor={(item: any) => item.id}
	            renderItem={({ item }: any) => {
                const canApproveHere = GENERIC_APPROVAL_SUPPORTED_TYPES.has(item.type);
                return (
	              <VerificationCard
                  title={`${item.type || item.action} ${item.entityType?.toLowerCase?.() || ""}`}
                  subtitle={`Requested by: ${item.requestedBy?.name || "Staff"}`}
                  status={item.entityType}
                  statusTone="blue"
                  createdAt={new Date(item.createdAt).toLocaleString()}
                  actions={canApproveHere ? (
                    <>
                      <Button
                        variant="secondary"
                        label="Reject"
                        onPress={() => handleProcess(item, 'REJECTED')}
                        loading={mutation.isPending && mutation.variables?.status === 'REJECTED' && mutation.variables?.id === item.id}
                        style={{ flex: 1 }}
                      />
                      <Button
                        label="Approve"
                        onPress={() => handleProcess(item, 'APPROVED')}
                        loading={mutation.isPending && mutation.variables?.status === 'APPROVED' && mutation.variables?.id === item.id}
                        style={{ flex: 1 }}
                      />
                    </>
                  ) : undefined}
                >
                  <Text style={styles.requestedBy}>Requested by: <Text style={{fontWeight: 'bold'}}>{item.requestedBy?.name}</Text></Text>
                  <Text style={styles.actionText}>{item.type || item.action} {item.entityType?.toLowerCase?.() || ""}</Text>
                  {item.reason && <Text style={styles.notes}>"{item.reason}"</Text>}
                  {!canApproveHere && (
                      <Text style={styles.notes}>Open the specific verification screen for this request.</Text>
                  )}
              </VerificationCard>
	            );
              }}
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
});

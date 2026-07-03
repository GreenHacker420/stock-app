import { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { Icon, Text } from "react-native-paper";

import { SummaryCard } from "../../ui/SummaryCard";
import { StatusPill } from "../../ui/StatusPill";
import { colors, fontSize, fontWeight, spacing } from "../../../theme";

type VerificationCardProps = {
  title: string;
  subtitle?: string;
  status?: string;
  statusTone?: "green" | "amber" | "red" | "blue" | "neutral";
  createdAt?: string;
  amount?: string;
  proofLabel?: string;
  children?: ReactNode;
  actions?: ReactNode;
};

export function VerificationCard({
  title,
  subtitle,
  status,
  statusTone,
  createdAt,
  amount,
  proofLabel,
  children,
  actions,
}: VerificationCardProps) {
  return (
    <SummaryCard>
      <View style={styles.header}>
        <View style={styles.main}>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle} numberOfLines={2}>{subtitle}</Text> : null}
        </View>
        <View style={styles.trailing}>
          {amount ? <Text style={styles.amount} numberOfLines={1}>{amount}</Text> : null}
          {status ? <StatusPill label={status} tone={statusTone} /> : null}
        </View>
      </View>
      {(createdAt || proofLabel) ? (
        <View style={styles.metaRow}>
          {createdAt ? <Text style={styles.metaText} numberOfLines={1}>{createdAt}</Text> : null}
          {proofLabel ? (
            <View style={styles.proof}>
              <Icon source="paperclip" size={14} color={colors.textSecondary} />
              <Text style={styles.metaText} numberOfLines={1}>{proofLabel}</Text>
            </View>
          ) : null}
        </View>
      ) : null}
      {children}
      {actions ? <View style={styles.actions}>{actions}</View> : null}
    </SummaryCard>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", gap: spacing.md, alignItems: "flex-start" },
  main: { flex: 1, minWidth: 0 },
  title: { color: colors.textPrimary, fontSize: fontSize.md, fontWeight: fontWeight.black },
  subtitle: { color: colors.textSecondary, fontSize: fontSize.xs, marginTop: 2 },
  trailing: { alignItems: "flex-end", gap: spacing.xs, flexShrink: 0, maxWidth: "42%" },
  amount: { color: colors.textPrimary, fontSize: fontSize.md, fontWeight: fontWeight.black },
  metaRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  metaText: { color: colors.textSecondary, fontSize: fontSize.xs, flexShrink: 1 },
  proof: { flexDirection: "row", alignItems: "center", gap: spacing.xs, flexShrink: 1 },
  actions: { flexDirection: "row", gap: spacing.sm },
});

import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";

import { StatusPill } from "../../ui/StatusPill";
import { colors, fontSize, fontWeight, radius, shadow, spacing } from "../../../theme";

type PaymentCardProps = {
  title: string;
  subtitle?: string;
  amount: string;
  status?: string;
  statusTone?: "green" | "amber" | "red" | "blue" | "neutral";
  onPress?: () => void;
};

export function PaymentCard({ title, subtitle, amount, status, statusTone, onPress }: PaymentCardProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={onPress ? `Open payment ${title}` : undefined}
    >
      <View style={styles.main}>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle} numberOfLines={2}>{subtitle}</Text> : null}
      </View>
      <View style={styles.trailing}>
        <Text style={styles.amount} numberOfLines={1}>{amount}</Text>
        {status ? <StatusPill label={status} tone={statusTone} /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { minHeight: 72, flexDirection: "row", gap: spacing.md, backgroundColor: colors.surface, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.sm, ...shadow.sm },
  pressed: { opacity: 0.72 },
  main: { flex: 1, minWidth: 0 },
  title: { color: colors.textPrimary, fontSize: fontSize.sm, fontWeight: fontWeight.bold },
  subtitle: { color: colors.textSecondary, fontSize: fontSize.xs, marginTop: 3 },
  trailing: { alignItems: "flex-end", gap: spacing.xs, flexShrink: 0 },
  amount: { color: colors.textPrimary, fontSize: fontSize.md, fontWeight: fontWeight.black },
});

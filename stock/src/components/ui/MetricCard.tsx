import { View, StyleSheet } from "react-native";
import { Icon, Text } from "react-native-paper";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../theme";

type MetricCardProps = {
  label: string;
  value: string;
  icon: string;
  tone?: "green" | "amber" | "blue" | "red";
  helper?: string;
};

const tones = {
  green: { bg: colors.surface, iconBg: 'rgba(5, 150, 105, 0.08)', color: colors.success },
  amber: { bg: colors.surface, iconBg: 'rgba(217, 119, 6, 0.08)', color: colors.warning },
  blue: { bg: colors.surface, iconBg: 'rgba(30, 64, 175, 0.08)', color: colors.primary },
  red: { bg: colors.surface, iconBg: 'rgba(220, 38, 38, 0.08)', color: colors.danger },
};

export function MetricCard({ label, value, icon, tone = "green", helper }: MetricCardProps) {
  const palette = tones[tone];

  return (
    <View style={[styles.container, { backgroundColor: palette.bg }]}>
      <View style={styles.header}>
        <View style={[styles.iconContainer, { backgroundColor: palette.iconBg }]}>
          <Icon source={icon} size={20} color={palette.color} />
        </View>
        {helper ? (
          <View style={styles.helperContainer}>
            <Text style={styles.helperText}>{helper}</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.content}>
        <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit>
          {value}
        </Text>
        <Text style={styles.label} numberOfLines={1}>
          {label}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 124,
    ...shadow.sm,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  iconContainer: {
    height: 40,
    width: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
  },
  helperContainer: {
    backgroundColor: colors.surfaceOffset,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
  },
  helperText: {
    color: colors.textSecondary,
    fontSize: 10,
    fontWeight: fontWeight.bold,
  },
  content: {
    gap: 2,
  },
  value: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.black,
    color: colors.textPrimary,
    letterSpacing: -0.5,
  },
  label: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
});

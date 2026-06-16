import { View, StyleSheet, StyleProp, ViewStyle } from "react-native";
import { Icon, Text } from "react-native-paper";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../theme";

type MetricCardProps = {
  label: string;
  value: string;
  icon: string;
  tone?: "green" | "amber" | "blue" | "red";
  helper?: string;
  style?: StyleProp<ViewStyle>;
};

const tones = {
  green: { bg: colors.surface, iconBg: colors.successLight, color: colors.success },
  amber: { bg: colors.surface, iconBg: colors.warningLight, color: colors.warning },
  blue: { bg: colors.surface, iconBg: colors.infoLight, color: colors.info },
  red: { bg: colors.surface, iconBg: colors.dangerLight, color: colors.danger },
};

export function MetricCard({ label, value, icon, tone = "green", helper, style }: MetricCardProps) {
  const palette = tones[tone];

  return (
    <View style={StyleSheet.flatten([styles.container, { backgroundColor: palette.bg }, style])}>
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

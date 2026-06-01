import { Pressable, View, StyleSheet } from "react-native";
import { Icon, Text } from "react-native-paper";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../theme";

type ActionTileProps = {
  title: string;
  subtitle: string;
  icon: string;
  tone?: "green" | "amber" | "blue" | "red";
  onPress?: () => void;
};

const tones = {
  green: { bg: 'rgba(5, 150, 105, 0.08)', color: colors.success },
  amber: { bg: 'rgba(217, 119, 6, 0.08)', color: colors.warning },
  blue: { bg: 'rgba(30, 64, 175, 0.08)', color: colors.primary },
  red: { bg: 'rgba(220, 38, 38, 0.08)', color: colors.danger },
};

export function ActionTile({ title, subtitle, icon, tone = "green", onPress }: ActionTileProps) {
  const palette = tones[tone];

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.container,
        pressed && styles.pressed
      ]}
    >
      <View style={[styles.iconContainer, { backgroundColor: palette.bg }]}>
        <Icon source={icon} size={24} color={palette.color} />
      </View>
      <View style={styles.content}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>
      <Icon source="chevron-right" size={24} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 80,
    ...shadow.sm,
  },
  iconContainer: {
    height: 48,
    width: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.lg,
  },
  content: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  pressed: {
    opacity: 0.72,
    transform: [{ scale: 0.98 }],
  },
});

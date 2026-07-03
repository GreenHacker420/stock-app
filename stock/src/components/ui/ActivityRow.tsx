import { Pressable, StyleSheet, View } from "react-native";
import { Icon, Text } from "react-native-paper";

import { colors, fontSize, fontWeight, radius, spacing } from "../../theme";

type ActivityRowProps = {
  title: string;
  subtitle?: string;
  time?: string;
  icon?: string;
  onPress?: () => void;
};

export function ActivityRow({ title, subtitle, time, icon = "clock-outline", onPress }: ActivityRowProps) {
  const content = (
    <>
      <View style={styles.iconWrap}>
        <Icon source={icon} size={18} color={colors.primary} />
      </View>
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle} numberOfLines={2}>{subtitle}</Text> : null}
      </View>
      {time ? <Text style={styles.time} numberOfLines={1}>{time}</Text> : null}
    </>
  );
  if (onPress) {
    return <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>{content}</Pressable>;
  }
  return <View style={styles.row}>{content}</View>;
}

const styles = StyleSheet.create({
  row: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.lg,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  body: { flex: 1, minWidth: 0 },
  title: { color: colors.textPrimary, fontSize: fontSize.sm, fontWeight: fontWeight.bold },
  subtitle: { color: colors.textSecondary, fontSize: fontSize.xs, marginTop: 2 },
  time: { color: colors.textMuted, fontSize: fontSize.xs },
  pressed: { opacity: 0.72 },
});

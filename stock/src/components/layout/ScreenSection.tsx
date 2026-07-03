import { ReactNode } from "react";
import { StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { Text } from "react-native-paper";

import { colors, fontSize, fontWeight, radius, shadow, spacing } from "../../theme";

type ScreenSectionProps = {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  card?: boolean;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
};

export function ScreenSection({ title, action, children, card = false, style, contentStyle }: ScreenSectionProps) {
  return (
    <View style={[styles.section, style]}>
      {title || action ? (
        <View style={styles.header}>
          {title ? <Text style={styles.title} numberOfLines={2}>{title}</Text> : <View />}
          {action}
        </View>
      ) : null}
      <View style={[card && styles.card, contentStyle]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.sm,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  title: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: fontSize.md,
    fontWeight: fontWeight.extrabold,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadow.sm,
  },
});

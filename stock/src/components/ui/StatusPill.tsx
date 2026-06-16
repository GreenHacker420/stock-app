import React from "react";
import { View, Text, StyleSheet, StyleProp, ViewStyle } from "react-native";
import { colors, radius, fontSize, fontWeight, spacing } from "../../theme";

type StatusPillProps = {
  label: string;
  tone?: "green" | "amber" | "blue" | "red" | "neutral";
  style?: StyleProp<ViewStyle>;
};

const tones = {
  green:   { bg: colors.successLight, fg: colors.primaryDark },
  amber:   { bg: colors.warningLight, fg: colors.warning },
  blue:    { bg: colors.infoLight,    fg: colors.info },
  red:     { bg: colors.dangerLight,  fg: colors.danger },
  neutral: { bg: colors.surfaceOffset, fg: colors.textSecondary },
};

export function StatusPill({ label, tone = "neutral", style }: StatusPillProps) {
  const palette = tones[tone];
  return (
    <View style={StyleSheet.flatten([
      styles.container, 
      { backgroundColor: palette.bg }, 
      style
    ])}>
      <Text style={[styles.text, { color: palette.fg }]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
    alignSelf: 'flex-start',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 24,
  },
  text: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    textTransform: 'uppercase',
  },
});

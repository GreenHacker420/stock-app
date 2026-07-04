"use no memo";

import { useState } from "react";
import {
  LayoutChangeEvent,
  Pressable,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from "react-native";
import { Icon, Text } from "react-native-paper";
import {
  colors,
  spacing,
  radius,
  fontSize,
  fontWeight,
  shadow,
} from "../../theme";

type ActionTileProps = {
  title: string;
  subtitle?: string;
  icon: string;
  tone?: "green" | "amber" | "blue" | "red";
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  variant?: "grid" | "list";
};

const tones = {
  green: {
    bg: colors.successLight,
    color: colors.success,
  },
  amber: {
    bg: colors.warningLight,
    color: colors.warning,
  },
  blue: {
    bg: colors.infoLight,
    color: colors.info,
  },
  red: {
    bg: colors.dangerLight,
    color: colors.danger,
  },
};

const COMPACT_BREAKPOINT = 210;

export function ActionTile({
  title,
  subtitle,
  icon,
  tone = "green",
  onPress,
  style,
  variant,
}: ActionTileProps) {
  const palette = tones[tone];
  const [tileWidth, setTileWidth] = useState(0);

  const handleLayout = (event: LayoutChangeEvent) => {
    if (variant) return;
    const nextWidth = event.nativeEvent.layout.width;
    setTileWidth((currentWidth) => {
      if (Math.abs(currentWidth - nextWidth) < 1) {
        return currentWidth;
      }
      return nextWidth;
    });
  };

  const mode = variant || (tileWidth > 0 && tileWidth < COMPACT_BREAKPOINT ? "grid" : "list");
  const isGrid = mode === "grid";

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      onLayout={handleLayout}
      style={({ pressed }) => [
        styles.container,
        isGrid ? styles.gridContainer : styles.listContainer,
        pressed && styles.pressed,
        style,
      ]}
    >
      {isGrid ? (
        <View style={styles.gridContent}>
          {/* Top Row: Icon only (no chevron needed in grid mode to maximize text space) */}
          <View
            style={[
              styles.iconContainer,
              styles.gridIconContainer,
              { backgroundColor: palette.bg },
            ]}
          >
            <Icon source={icon} size={20} color={palette.color} />
          </View>

          {/* Text Stack */}
          <View style={styles.gridTextContainer}>
            <Text
              style={styles.gridTitle}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {title}
            </Text>
            {subtitle ? (
              <Text
                style={styles.gridSubtitle}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {subtitle}
              </Text>
            ) : null}
          </View>
        </View>
      ) : (
        /* List / Horizontal Layout */
        <View style={styles.listContent}>
          <View
            style={[
              styles.iconContainer,
              styles.listIconContainer,
              { backgroundColor: palette.bg },
            ]}
          >
            <Icon source={icon} size={22} color={palette.color} />
          </View>

          <View style={styles.textContent}>
            <Text
              style={styles.listTitle}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {title}
            </Text>
            {subtitle ? (
              <Text
                style={styles.listSubtitle}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {subtitle}
              </Text>
            ) : null}
          </View>

          <View style={styles.chevronContainer}>
            <Icon
              source="chevron-right"
              size={20}
              color={colors.textMuted}
            />
          </View>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.sm,
    overflow: "hidden",
  },
  pressed: {
    opacity: 0.8,
    transform: [{ scale: 0.985 }],
  },
  iconContainer: {
    alignItems: "center",
    justifyContent: "center",
  },

  /* Grid Layout (Compact / Side-by-Side) */
  gridContainer: {
    padding: spacing.md,
    height: 94, // Fixed height to prevent stretching and keep it extremely compact
  },
  gridContent: {
    flex: 1,
    flexDirection: "column",
    alignItems: "flex-start",
    justifyContent: "space-between", // Pushes icon to top, text to bottom cleanly within fixed height
  },
  gridIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  gridTextContainer: {
    width: "100%",
    gap: 1,
  },
  gridTitle: {
    fontSize: 13, // Slightly smaller font for a compact, clean look
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  gridSubtitle: {
    fontSize: 10,
    color: colors.textSecondary,
    lineHeight: 12,
  },

  /* List Layout (Horizontal) */
  listContainer: {
    padding: spacing.md,
    minHeight: 68, // Reduced from 76 to keep list view compact
    justifyContent: "center",
  },
  listContent: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
  },
  listIconContainer: {
    width: 38,
    height: 38,
    borderRadius: 19,
    marginRight: spacing.md,
  },
  textContent: {
    flex: 1,
    justifyContent: "center",
    gap: 1,
  },
  listTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  listSubtitle: {
    fontSize: 11,
    color: colors.textSecondary,
    lineHeight: 13,
  },
  chevronContainer: {
    marginLeft: spacing.xs,
    justifyContent: "center",
    alignItems: "center",
  },
});
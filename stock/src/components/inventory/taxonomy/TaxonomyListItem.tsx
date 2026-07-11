import React from "react";
import {
  View,
  StyleSheet,
  Pressable,
  Alert,
} from "react-native";
import { Text, Icon, Divider, ActivityIndicator } from "react-native-paper";
import ReanimatedSwipeable, { SwipeableMethods } from "react-native-gesture-handler/ReanimatedSwipeable";
import Animated, { SharedValue, useAnimatedStyle } from "react-native-reanimated";
import { TaxonomyEntity } from "./taxonomy.types";
import { colors, spacing, radius, fontSize, fontWeight } from "../../../theme";
import { triggerLightHaptic, triggerMediumHaptic } from "../../../utils/haptics";

interface TaxonomyListItemProps {
  entity: TaxonomyEntity;
  iconName: string;
  onPress: () => void;
  onLongPress: () => void;
  onOverflowPress: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onSwipeableWillOpen: (ref: SwipeableMethods) => void;
  isMutating: boolean;
  productCount?: number;
}

export const TaxonomyListItem = React.forwardRef<SwipeableMethods, TaxonomyListItemProps>(
  (
    {
      entity,
      iconName,
      onPress,
      onLongPress,
      onOverflowPress,
      onEdit,
      onDelete,
      onSwipeableWillOpen,
      isMutating,
      productCount,
    },
    ref
  ) => {
    const localRef = React.useRef<SwipeableMethods | null>(null);

    const setRefs = React.useCallback(
      (el: SwipeableMethods | null) => {
        localRef.current = el;
        if (typeof ref === "function") {
          ref(el);
        } else if (ref) {
          (ref as React.RefObject<SwipeableMethods | null>).current = el;
        }
      },
      [ref]
    );

    const renderRightActions = (
      _progress: SharedValue<number>,
      translation: SharedValue<number>
    ) => {
      const styleAnimation = useAnimatedStyle(() => {
        return {
          transform: [{ translateX: translation.value + 140 }],
        };
      });

      return (
        <View style={styles.rightActionsContainer}>
          <Animated.View style={[styles.actionButtonsWrap, styleAnimation]}>
            <Pressable
              style={[styles.actionButton, styles.editButton]}
              onPress={() => {
                triggerLightHaptic();
                localRef.current?.close();
                onEdit();
              }}
              accessibilityRole="button"
              accessibilityLabel={`Edit ${entity.name}`}
              accessibilityHint="Opens the editor to change the name"
            >
              <Icon source="pencil-outline" size={20} color="white" />
            </Pressable>
            <Pressable
              style={[styles.actionButton, styles.deleteButton]}
              onPress={() => {
                triggerMediumHaptic();
                localRef.current?.close();
                onDelete();
              }}
              accessibilityRole="button"
              accessibilityLabel={`Delete ${entity.name}`}
              accessibilityHint="Deletes this item after showing a confirmation dialog"
            >
              <Icon source="trash-can-outline" size={20} color="white" />
            </Pressable>
          </Animated.View>
        </View>
      );
    };

    return (
      <ReanimatedSwipeable
        ref={setRefs}
        renderRightActions={renderRightActions}
        onSwipeableWillOpen={() => {
          triggerLightHaptic();
          if (localRef.current) {
            onSwipeableWillOpen(localRef.current);
          }
        }}
        friction={2}
        enableTrackpadTwoFingerGesture
        rightThreshold={40}
      >
        <View style={styles.row}>
          <Pressable
            onPress={() => {
              triggerLightHaptic();
              onPress();
            }}
            onLongPress={() => {
              triggerMediumHaptic();
              onLongPress();
            }}
            style={({ pressed }) => [styles.rowPressable, pressed && styles.rowPressed]}
            accessibilityRole="button"
            accessibilityLabel={`${entity.name}, ${
              productCount !== undefined ? `${productCount} products` : ""
            }`}
            accessibilityHint="Double tap to view all products under this group, or hold for options"
          >
            <View style={styles.rowIconWrap}>
              <Icon source={iconName} size={18} color={colors.primary} />
            </View>
            <View style={styles.textContainer}>
              <Text style={styles.rowName} numberOfLines={1}>
                {entity.name}
              </Text>
              {productCount !== undefined && (
                <Text style={styles.rowSubtitle} numberOfLines={1}>
                  {productCount} product{productCount !== 1 ? "s" : ""}
                </Text>
              )}
            </View>
            <Icon source="chevron-right" size={16} color={colors.textMuted} />
          </Pressable>

          <Divider style={styles.verticalDivider} />

          {isMutating ? (
            <View style={styles.spinnerWrap}>
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          ) : (
            <Pressable
              onPress={() => {
                triggerLightHaptic();
                onOverflowPress();
              }}
              style={({ pressed }) => [styles.overflowBtn, pressed && styles.rowPressed]}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Show actions menu"
              accessibilityHint="Shows a popup with edit and delete options"
            >
              <Icon source="dots-vertical" size={20} color={colors.textSecondary} />
            </Pressable>
          )}
        </View>
      </ReanimatedSwipeable>
    );
  }
);

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
  },
  rowPressable: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.md,
    gap: spacing.md,
    minHeight: 52,
  },
  rowPressed: {
    opacity: 0.7,
  },
  rowIconWrap: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  textContainer: {
    flex: 1,
    gap: 2,
  },
  rowName: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
  },
  rowSubtitle: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontWeight: fontWeight.medium,
  },
  verticalDivider: {
    width: 1,
    height: 24,
    backgroundColor: colors.border,
    marginHorizontal: spacing.sm,
  },
  overflowBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
  },
  spinnerWrap: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  rightActionsContainer: {
    width: 140,
    flexDirection: "row",
  },
  actionButtonsWrap: {
    flexDirection: "row",
    width: 140,
    height: "100%",
  },
  actionButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
  },
  editButton: {
    backgroundColor: colors.primary,
  },
  deleteButton: {
    backgroundColor: colors.danger,
  },
});

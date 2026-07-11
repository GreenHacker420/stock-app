import { useState, useEffect, useCallback } from "react";
import {
  View,
  StyleSheet,
  Modal as RNModal,
  Platform,
  Pressable,
} from "react-native";
import { Text, Icon } from "react-native-paper";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GestureDetector, Gesture } from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from "react-native-reanimated";
import { TaxonomyEntity, TaxonomyCopy } from "./taxonomy.types";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../../theme";
import { triggerLightHaptic } from "../../../utils/haptics";

interface TaxonomyActionsSheetProps<T extends TaxonomyEntity> {
  visible: boolean;
  entity: T | null;
  copy: TaxonomyCopy;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function TaxonomyActionsSheet<T extends TaxonomyEntity>({
  visible,
  entity,
  copy,
  onClose,
  onEdit,
  onDelete,
}: TaxonomyActionsSheetProps<T>) {
  const insets = useSafeAreaInsets();
  const [renderModal, setRenderModal] = useState(false);

  const translateY = useSharedValue(500);
  const backdropOpacity = useSharedValue(0);

  const dismissModal = useCallback(() => {
    translateY.value = withSpring(500, { damping: 22, stiffness: 150 }, (finished) => {
      if (finished) {
        runOnJS(setRenderModal)(false);
        runOnJS(onClose)();
      }
    });
    backdropOpacity.value = withTiming(0, { duration: 150 });
  }, [onClose, translateY, backdropOpacity]);

  useEffect(() => {
    if (visible) {
      setRenderModal(true);
      translateY.value = 500;
      backdropOpacity.value = 0;
      translateY.value = withSpring(0, { damping: 22, stiffness: 150 });
      backdropOpacity.value = withTiming(1, { duration: 200 });
    } else {
      translateY.value = withSpring(500, { damping: 22, stiffness: 150 }, (finished) => {
        if (finished) {
          runOnJS(setRenderModal)(false);
        }
      });
      backdropOpacity.value = withTiming(0, { duration: 150 });
    }
  }, [visible, translateY, backdropOpacity]);

  const panGesture = Gesture.Pan()
    .activeOffsetY([-10, 10])
    .onUpdate((event) => {
      translateY.value = Math.max(0, event.translationY);
    })
    .onEnd((event) => {
      if (event.translationY > 100 || event.velocityY > 500) {
        runOnJS(dismissModal)();
      } else {
        translateY.value = withSpring(0, { damping: 22, stiffness: 150 });
      }
    });

  const backdropStyle = useAnimatedStyle(() => {
    return {
      opacity: backdropOpacity.value,
    };
  });

  const sheetStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateY: translateY.value }],
    };
  });

  if (!renderModal || !entity) return null;

  return (
    <RNModal
      visible={renderModal}
      transparent
      animationType="none"
      onRequestClose={dismissModal}
      statusBarTranslucent
      accessibilityViewIsModal
    >
      <View style={styles.modalRoot}>
        {/* Backdrop */}
        <Animated.View style={[styles.backdropContainer, backdropStyle]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close actions panel"
            style={styles.backdropPressable}
            onPress={dismissModal}
          />
        </Animated.View>

        {/* Sheet Content */}
        <GestureDetector gesture={panGesture}>
          <Animated.View style={[styles.sheet, sheetStyle, { paddingBottom: Math.max(insets.bottom, spacing.xl) }]}>
            <View style={styles.handle} />

            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.title} numberOfLines={1}>
                {entity.name}
              </Text>
              <Text style={styles.subtitle}>
                {copy.singular} Management
              </Text>
            </View>

            {/* Actions List */}
            <View style={styles.actionsContainer}>
              {/* Edit Action */}
              <Pressable
                onPress={() => {
                  triggerLightHaptic();
                  onEdit();
                }}
                style={({ pressed }) => [styles.actionRow, pressed && styles.actionRowPressed]}
                accessibilityRole="button"
                accessibilityLabel={`Edit ${entity.name}`}
                accessibilityHint={`Opens edit sheet to rename this ${copy.singular.toLowerCase()}`}
              >
                <View style={[styles.iconWrap, styles.editIconWrap]}>
                  <Icon source="pencil-outline" size={20} color={colors.primary} />
                </View>
                <View style={styles.textWrap}>
                  <Text style={styles.actionText}>Edit {copy.singular} Name</Text>
                  <Text style={styles.actionSubtext}>Rename this item in your inventory</Text>
                </View>
                <Icon source="chevron-right" size={16} color={colors.textMuted} />
              </Pressable>

              <View style={styles.divider} />

              {/* Delete Action */}
              <Pressable
                onPress={() => {
                  triggerLightHaptic();
                  onDelete();
                }}
                style={({ pressed }) => [styles.actionRow, pressed && styles.actionRowPressed]}
                accessibilityRole="button"
                accessibilityLabel={`Delete ${entity.name}`}
                accessibilityHint={`Prompts a confirmation dialog to delete this ${copy.singular.toLowerCase()}`}
              >
                <View style={[styles.iconWrap, styles.deleteIconWrap]}>
                  <Icon source="trash-can-outline" size={20} color={colors.danger} />
                </View>
                <View style={styles.textWrap}>
                  <Text style={[styles.actionText, styles.deleteText]}>Delete {copy.singular}</Text>
                  <Text style={styles.actionSubtext}>Remove this item permanently</Text>
                </View>
                <Icon source="chevron-right" size={16} color={colors.textMuted} />
              </Pressable>
            </View>

            {/* Close Button */}
            <Pressable
              onPress={dismissModal}
              style={({ pressed }) => [styles.cancelBtn, pressed && styles.cancelBtnPressed]}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
            >
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </Pressable>
          </Animated.View>
        </GestureDetector>
      </View>
    </RNModal>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdropContainer: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  backdropPressable: {
    width: "100%",
    height: "100%",
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    paddingTop: spacing.md,
    paddingHorizontal: spacing.lg,
    maxHeight: "80%",
    flexShrink: 1,
    ...shadow.lg,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: radius.full,
    backgroundColor: colors.border,
    alignSelf: "center",
    marginBottom: spacing.lg,
  },
  header: {
    alignItems: "center",
    marginBottom: spacing.lg,
    gap: 4,
  },
  title: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    textAlign: "center",
  },
  subtitle: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  actionsContainer: {
    backgroundColor: colors.surfaceOffset,
    borderRadius: radius.xl,
    overflow: "hidden",
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
    backgroundColor: colors.surface,
  },
  actionRowPressed: {
    backgroundColor: colors.surfaceOffset,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  editIconWrap: {
    backgroundColor: colors.primaryLight,
  },
  deleteIconWrap: {
    backgroundColor: colors.dangerLight,
  },
  textWrap: {
    flex: 1,
    gap: 2,
  },
  actionText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  deleteText: {
    color: colors.danger,
  },
  actionSubtext: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontWeight: fontWeight.medium,
  },
  divider: {
    height: 0.5,
    backgroundColor: colors.border,
  },
  cancelBtn: {
    width: "100%",
    backgroundColor: colors.surfaceOffset,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
    paddingVertical: spacing.md,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelBtnPressed: {
    opacity: 0.8,
  },
  cancelBtnText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
  },
});

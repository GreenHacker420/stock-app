import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  AccessibilityInfo,
  findNodeHandle,
  View,
  StyleSheet,
  Modal as RNModal,
  Pressable,
  useWindowDimensions,
} from "react-native";
import { Text, Icon } from "react-native-paper";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  GestureDetector,
  Gesture,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  ReduceMotion,
} from "react-native-reanimated";
import { TaxonomyEntity, TaxonomyCopy } from "./taxonomy.types";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../../theme";
import { triggerLightHaptic, triggerMediumHaptic } from "../../../utils/haptics";

const OPEN_SPRING_CONFIG = {
  damping: 26,
  stiffness: 220,
  overshootClamping: true,
  reduceMotion: ReduceMotion.System,
} as const;
const CLOSE_DURATION = 180;
const BACKDROP_DURATION = 150;

interface TaxonomyActionsSheetProps<T extends TaxonomyEntity> {
  visible: boolean;
  entity: T | null;
  copy: TaxonomyCopy;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  busy?: boolean;
}

export function TaxonomyActionsSheet<T extends TaxonomyEntity>({
  visible,
  entity,
  copy,
  onClose,
  onEdit,
  onDelete,
  busy = false,
}: TaxonomyActionsSheetProps<T>) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const [renderModal, setRenderModal] = useState(false);
  const [renderedEntity, setRenderedEntity] = useState<T | null>(null);
  const [dismissing, setDismissing] = useState(false);

  const dismissingRef = useRef(false);
  const pendingActionRef = useRef<(() => void) | null>(null);
  const headerRef = useRef<View>(null);
  const openedEntityIdRef = useRef<string | null>(null);

  const translateY = useSharedValue(windowHeight);
  const backdropOpacity = useSharedValue(0);
  const sheetHeight = useSharedValue(0);
  const closing = useSharedValue(false);

  const finalizeDismiss = useCallback(() => {
    const pendingAction = pendingActionRef.current;
    pendingActionRef.current = null;
    dismissingRef.current = false;
    setDismissing(false);
    setRenderModal(false);
    setRenderedEntity(null);
    openedEntityIdRef.current = null;
    onClose();
    pendingAction?.();
  }, [onClose]);

  const beginDismiss = useCallback(() => {
    if (busy || dismissingRef.current) return;

    dismissingRef.current = true;
    setDismissing(true);
    closing.value = true;
    const hiddenTranslateY = Math.max(sheetHeight.value, windowHeight);
    translateY.value = withTiming(hiddenTranslateY, {
      duration: CLOSE_DURATION,
      reduceMotion: ReduceMotion.System,
    }, (finished) => {
      if (finished) {
        runOnJS(finalizeDismiss)();
      }
    });
    backdropOpacity.value = withTiming(0, {
      duration: BACKDROP_DURATION,
      reduceMotion: ReduceMotion.System,
    });
  }, [backdropOpacity, busy, closing, finalizeDismiss, sheetHeight, translateY, windowHeight]);

  const dismissThen = useCallback((action: () => void) => {
    if (busy || dismissingRef.current) return;
    pendingActionRef.current = action;
    beginDismiss();
  }, [beginDismiss, busy]);

  const markGestureDismissStarted = useCallback(() => {
    if (dismissingRef.current) return;
    dismissingRef.current = true;
    setDismissing(true);
  }, []);

  useEffect(() => {
    if (visible && entity) {
      if (openedEntityIdRef.current === entity.id) {
        setRenderedEntity(entity);
        return;
      }

      openedEntityIdRef.current = entity.id;
      setRenderedEntity(entity);
      setRenderModal(true);
      dismissingRef.current = false;
      pendingActionRef.current = null;
      setDismissing(false);
      closing.value = false;
      translateY.value = Math.max(sheetHeight.value, windowHeight);
      backdropOpacity.value = 0;
      translateY.value = withSpring(0, OPEN_SPRING_CONFIG);
      backdropOpacity.value = withTiming(1, {
        duration: 200,
        reduceMotion: ReduceMotion.System,
      });
      const focusTimer = setTimeout(() => {
        const node = findNodeHandle(headerRef.current);
        if (node) AccessibilityInfo.setAccessibilityFocus(node);
      }, 250);
      return () => clearTimeout(focusTimer);
    }

    if (!visible && renderModal) beginDismiss();
  }, [backdropOpacity, beginDismiss, closing, entity, renderModal, sheetHeight, translateY, visible, windowHeight]);

  const panGesture = useMemo(
    () => Gesture.Pan()
      .enabled(!busy && !dismissing)
      .activeOffsetY(10)
      .failOffsetX([-15, 15])
      .onUpdate((event) => {
        translateY.value = Math.max(0, event.translationY);
      })
      .onEnd((event) => {
        if (event.translationY > 100 || event.velocityY > 500) {
          closing.value = true;
          runOnJS(markGestureDismissStarted)();
          const hiddenTranslateY = Math.max(sheetHeight.value, windowHeight);
          translateY.value = withTiming(hiddenTranslateY, {
            duration: CLOSE_DURATION,
            reduceMotion: ReduceMotion.System,
          }, (finished) => {
            if (finished) runOnJS(finalizeDismiss)();
          });
          backdropOpacity.value = withTiming(0, {
            duration: BACKDROP_DURATION,
            reduceMotion: ReduceMotion.System,
          });
        } else {
          translateY.value = withSpring(0, OPEN_SPRING_CONFIG);
        }
      })
      .onFinalize((_event, success) => {
        if (!success && !closing.value) {
          translateY.value = withSpring(0, OPEN_SPRING_CONFIG);
        }
      }),
    [backdropOpacity, busy, closing, dismissing, finalizeDismiss, markGestureDismissStarted, sheetHeight, translateY, windowHeight],
  );

  const backdropStyle = useAnimatedStyle(() => {
    const distance = Math.max(sheetHeight.value, windowHeight, 1);
    const dragProgress = Math.min(translateY.value / distance, 1);
    return {
      opacity: backdropOpacity.value * (1 - dragProgress * 0.65),
    };
  });

  const sheetStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateY: translateY.value }],
    };
  });

  if (!renderModal || !renderedEntity) return null;

  const interactionsDisabled = busy || dismissing;
  const editTitle = copy.editActionTitle ?? `Edit ${copy.singular}`;
  const deleteTitle = copy.deleteActionTitle ?? `Delete ${copy.singular}`;

  return (
    <RNModal
      visible={renderModal}
      transparent
      animationType="none"
      onRequestClose={beginDismiss}
      statusBarTranslucent
    >
      <GestureHandlerRootView style={styles.gestureRoot} unstable_forceActive>
      <View style={styles.modalRoot}>
        {/* Backdrop */}
        <Animated.View
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          style={[styles.backdropContainer, backdropStyle]}
        >
          <Pressable
            disabled={interactionsDisabled}
            accessibilityRole="button"
            accessibilityLabel="Close actions panel"
            style={styles.backdropPressable}
            onPress={beginDismiss}
          />
        </Animated.View>

        {/* Sheet Content */}
        <GestureDetector gesture={panGesture}>
          <Animated.View
            style={[styles.sheet, sheetStyle, { paddingBottom: Math.max(insets.bottom, spacing.xl) }]}
            onLayout={(event) => {
              sheetHeight.value = event.nativeEvent.layout.height;
            }}
            accessibilityViewIsModal
            accessibilityLabel={`${renderedEntity.name} actions`}
            onAccessibilityEscape={beginDismiss}
          >
            <Animated.View style={styles.dragArea}>
              <View style={styles.handle} />
              <View ref={headerRef} style={styles.header} accessible accessibilityRole="header">
                <Text style={styles.title} numberOfLines={1}>
                  {renderedEntity.name}
                </Text>
                <Text style={styles.subtitle}>
                  {copy.actionsSubtitle ?? `${copy.singular} Management`}
                </Text>
              </View>
            </Animated.View>

            {/* Actions List */}
            <View style={styles.actionsContainer}>
              {/* Edit Action */}
              <Pressable
                disabled={interactionsDisabled}
                onPress={() => {
                  triggerLightHaptic();
                  dismissThen(onEdit);
                }}
                style={({ pressed }) => [styles.actionRow, pressed && styles.actionRowPressed]}
                accessibilityRole="button"
                accessibilityLabel={`${editTitle}: ${renderedEntity.name}`}
                accessibilityHint={`Opens edit sheet to rename this ${copy.singular.toLowerCase()}`}
                accessibilityState={{ disabled: interactionsDisabled, busy }}
              >
                <View style={[styles.iconWrap, styles.editIconWrap]}>
                  <Icon source="pencil-outline" size={20} color={colors.primary} />
                </View>
                <View style={styles.textWrap}>
                  <Text style={styles.actionText}>{editTitle}</Text>
                  <Text style={styles.actionSubtext}>
                    {copy.editActionDescription ?? `Change the name shown across your inventory`}
                  </Text>
                </View>
                <Icon source="chevron-right" size={16} color={colors.textMuted} />
              </Pressable>

              <View style={styles.divider} />

              {/* Delete Action */}
              <Pressable
                disabled={interactionsDisabled}
                onPress={() => {
                  triggerMediumHaptic();
                  dismissThen(onDelete);
                }}
                style={({ pressed }) => [styles.actionRow, pressed && styles.actionRowPressed]}
                accessibilityRole="button"
                accessibilityLabel={`${deleteTitle}: ${renderedEntity.name}`}
                accessibilityHint={`Prompts a confirmation dialog to delete this ${copy.singular.toLowerCase()}`}
                accessibilityState={{ disabled: interactionsDisabled, busy }}
              >
                <View style={[styles.iconWrap, styles.deleteIconWrap]}>
                  <Icon source="trash-can-outline" size={20} color={colors.danger} />
                </View>
                <View style={styles.textWrap}>
                  <Text style={[styles.actionText, styles.deleteText]}>{deleteTitle}</Text>
                  <Text style={styles.actionSubtext}>
                    {copy.deleteActionDescription ?? `Available only when no products or records reference it`}
                  </Text>
                </View>
                <Icon source="chevron-right" size={16} color={colors.textMuted} />
              </Pressable>
            </View>

            {/* Close Button */}
            <Pressable
              disabled={interactionsDisabled}
              onPress={beginDismiss}
              style={({ pressed }) => [styles.cancelBtn, pressed && styles.cancelBtnPressed]}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              accessibilityState={{ disabled: interactionsDisabled, busy }}
            >
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </Pressable>
          </Animated.View>
        </GestureDetector>
      </View>
      </GestureHandlerRootView>
    </RNModal>
  );
}

const styles = StyleSheet.create({
  gestureRoot: {
    flex: 1,
  },
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
    paddingHorizontal: 0,
    ...shadow.lg,
  },
  dragArea: {
    paddingHorizontal: spacing.lg,
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
    marginHorizontal: spacing.lg,
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
    alignSelf: "stretch",
    marginHorizontal: spacing.lg,
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

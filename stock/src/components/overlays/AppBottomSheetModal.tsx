import { forwardRef, useEffect, useImperativeHandle, useCallback, useState, useRef, useMemo } from "react";
import {
  Modal,
  Platform,
  StyleSheet,
  View,
  Text,
  useWindowDimensions,
  Pressable,
  AccessibilityInfo,
  BackHandler,
} from "react-native";
import {
  KeyboardGestureArea,
  useKeyboardState,
} from "react-native-keyboard-controller";
import {
  GestureHandlerRootView,
  GestureDetector,
  Gesture,
  ScrollView as GHScrollView,
} from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  interpolate,
  ReduceMotion,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "react-native-paper";
import { colors, spacing, radius, shadow, fontWeight, fontSize } from "../../theme";
import { triggerLightHaptic, triggerMediumHaptic } from "../../utils/haptics";
import { KeyboardAwareScreen } from "../keyboard/KeyboardAwareScreen";

const OPEN_SPRING_CONFIG = {
  damping: 26,
  stiffness: 220,
  overshootClamping: true,
  reduceMotion: ReduceMotion.System,
} as const;

const CLOSE_DURATION = 180;
const BACKDROP_DURATION = 150;

export interface AppBottomSheetModalRef {
  dismiss: () => void;
}

interface AppBottomSheetModalProps {
  visible: boolean;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onDismiss: () => void;
  onBack?: () => void;
  backAccessibilityLabel?: string;
  isBusy?: boolean;
  minHeight?: number;
  maxHeight?: number;
  fullBleed?: boolean;
  scrollable?: boolean;
  expandable?: boolean;
}

export const AppBottomSheetModal = forwardRef<
  AppBottomSheetModalRef,
  AppBottomSheetModalProps
>(function AppBottomSheetModal(
  {
    visible,
    title,
    subtitle,
    children,
    onDismiss,
    onBack,
    backAccessibilityLabel = "Go back",
    isBusy = false,
    minHeight,
    maxHeight = 0.85,
    fullBleed = false,
    scrollable = false,
    expandable = false,
  },
  ref
) {
  const { height: screenH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const keyboardVisible = useKeyboardState((state) => state.isVisible);

  const [renderModal, setRenderModal] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(60);

  const dismissingRef = useRef(false);
  const hasOpenedRef = useRef(false);
  const headerRef = useRef<View>(null);

  const translateY = useSharedValue(screenH);
  const backdropOpacity = useSharedValue(0);
  const sheetHeight = useSharedValue(0);
  const closing = useSharedValue(false);
  const contentScrollY = useSharedValue(0);
  const dragStartedAtTop = useSharedValue(true);
  const startOffsetY = useSharedValue(0);
  const snapStage = useSharedValue<0 | 1>(1);

  const collapsedOffsetY = expandable ? Math.round(screenH * 0.35) : 0;
  const safeMaxHeight = Math.min(1.0, Math.max(0.4, maxHeight));
  const safeMinHeight = minHeight === undefined
    ? undefined
    : Math.min(safeMaxHeight, Math.max(0.4, minHeight));

  const finalizeDismiss = useCallback(() => {
    hasOpenedRef.current = false;
    dismissingRef.current = false;
    setDismissing(false);
    setRenderModal(false);
    onDismiss();
  }, [onDismiss]);

  // Recover state if a close animation is cancelled or interrupted
  const recoverInterruptedDismiss = useCallback(() => {
    dismissingRef.current = false;
    setDismissing(false);
    closing.value = false;

    if (visible) {
      const targetY = expandable && snapStage.value === 1 ? collapsedOffsetY : 0;
      translateY.value = withSpring(targetY, OPEN_SPRING_CONFIG);
      backdropOpacity.value = withTiming(1, {
        duration: BACKDROP_DURATION,
        reduceMotion: ReduceMotion.System,
      });
    } else {
      finalizeDismiss();
    }
  }, [visible, closing, translateY, backdropOpacity, finalizeDismiss, expandable, snapStage, collapsedOffsetY]);

  const beginDismiss = useCallback(() => {
    if (isBusy || dismissingRef.current) return;

    dismissingRef.current = true;
    setDismissing(true);
    closing.value = true;

    const hiddenTranslateY = Math.max(sheetHeight.value, screenH);
    translateY.value = withTiming(hiddenTranslateY, {
      duration: CLOSE_DURATION,
      reduceMotion: ReduceMotion.System,
    }, (finished) => {
      if (finished) {
        scheduleOnRN(finalizeDismiss);
      } else {
        scheduleOnRN(recoverInterruptedDismiss);
      }
    });
    backdropOpacity.value = withTiming(0, {
      duration: BACKDROP_DURATION,
      reduceMotion: ReduceMotion.System,
    });
  }, [backdropOpacity, isBusy, closing, finalizeDismiss, recoverInterruptedDismiss, sheetHeight, translateY, screenH]);

  // Effect 1: Handle visible changes, especially reopening during close
  useEffect(() => {
    if (!visible) return;

    if (dismissingRef.current) {
      dismissingRef.current = false;
      setDismissing(false);
      closing.value = false;

      const targetY = expandable && snapStage.value === 1 ? collapsedOffsetY : 0;
      translateY.value = withSpring(targetY, OPEN_SPRING_CONFIG);
      backdropOpacity.value = withTiming(1, {
        duration: 200,
        reduceMotion: ReduceMotion.System,
      });
      return;
    }

    if (!renderModal) {
      setRenderModal(true);
    }
  }, [visible, renderModal, closing, translateY, backdropOpacity, expandable, snapStage, collapsedOffsetY]);

  // Effect 2: Opening animation — runs exactly once per open
  useEffect(() => {
    if (!renderModal || !visible || hasOpenedRef.current) return;

    hasOpenedRef.current = true;
    dismissingRef.current = false;
    setDismissing(false);
    closing.value = false;

    translateY.value = Math.max(sheetHeight.value, screenH);
    backdropOpacity.value = 0;

    requestAnimationFrame(() => {
      const targetY = expandable ? collapsedOffsetY : 0;
      snapStage.value = expandable ? 1 : 0;
      translateY.value = withSpring(targetY, OPEN_SPRING_CONFIG);
      backdropOpacity.value = withTiming(1, {
        duration: 200,
        reduceMotion: ReduceMotion.System,
      });
    });

    const focusTimer = setTimeout(() => {
      if (headerRef.current) {
        AccessibilityInfo.sendAccessibilityEvent(headerRef.current, 'focus');
      }
    }, 250);
    return () => clearTimeout(focusTimer);
  }, [renderModal, visible, screenH, sheetHeight, translateY, backdropOpacity, closing, expandable, collapsedOffsetY]);

  // Effect 4: Hardware back press handler
  useEffect(() => {
    if (!renderModal || !visible) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      beginDismiss();
      return true;
    });
    return () => subscription.remove();
  }, [renderModal, visible, beginDismiss]);

  useImperativeHandle(ref, () => ({
    dismiss: () => {
      beginDismiss();
    },
  }));

  const markGestureDismissStarted = useCallback(() => {
    if (dismissingRef.current) return;
    dismissingRef.current = true;
    setDismissing(true);
  }, []);

  const contentNativeGesture = useMemo(() => Gesture.Native(), []);

  const panGesture = useMemo(
    () => Gesture.Pan()
      .enabled(!isBusy && !dismissing && !keyboardVisible)
      .activeOffsetY([-5, 10])
      .failOffsetX([-15, 15])
      .cancelsTouchesInView(false)
      .simultaneousWithExternalGesture(contentNativeGesture)
      .onBegin(() => {
        dragStartedAtTop.value = !scrollable || contentScrollY.value <= 1;
        startOffsetY.value = translateY.value;
      })
      .onUpdate((event) => {
        if (!dragStartedAtTop.value) return;
        const currentTarget = startOffsetY.value + event.translationY;
        translateY.value = Math.max(0, currentTarget);
      })
      .onEnd((event) => {
        if (!dragStartedAtTop.value) return;
        const translationY = event.translationY;
        const velocityY = event.velocityY;

        if (expandable) {
          // From 100% full screen (snapStage === 0)
          if (snapStage.value === 0) {
            // Fast or long drag down -> Dismiss completely!
            if (translationY > 150 || velocityY > 600) {
              closing.value = true;
              scheduleOnRN(markGestureDismissStarted);
              scheduleOnRN(triggerMediumHaptic);
              const hiddenTranslateY = Math.max(sheetHeight.value, screenH);
              translateY.value = withTiming(hiddenTranslateY, {
                duration: CLOSE_DURATION,
                reduceMotion: ReduceMotion.System,
              }, (finished) => {
                if (finished) scheduleOnRN(finalizeDismiss);
                else scheduleOnRN(recoverInterruptedDismiss);
              });
              backdropOpacity.value = withTiming(0, { duration: BACKDROP_DURATION });
              return;
            }

            // Moderate drag down -> Collapse to ~65% stage
            if (translationY > 30 || velocityY > 100) {
              snapStage.value = 1;
              translateY.value = withSpring(collapsedOffsetY, OPEN_SPRING_CONFIG);
              scheduleOnRN(triggerLightHaptic);
              return;
            }
          }

          // From collapsed ~65% stage (snapStage === 1)
          if (snapStage.value === 1) {
            // Swipe UP -> expand to 100% full screen!
            if (translationY < -30 || velocityY < -300) {
              snapStage.value = 0;
              translateY.value = withSpring(0, OPEN_SPRING_CONFIG);
              scheduleOnRN(triggerLightHaptic);
              return;
            }

            // Swipe DOWN -> dismiss completely!
            if (translationY > 60 || velocityY > 300) {
              closing.value = true;
              scheduleOnRN(markGestureDismissStarted);
              scheduleOnRN(triggerMediumHaptic);
              const hiddenTranslateY = Math.max(sheetHeight.value, screenH);
              translateY.value = withTiming(hiddenTranslateY, {
                duration: CLOSE_DURATION,
                reduceMotion: ReduceMotion.System,
              }, (finished) => {
                if (finished) scheduleOnRN(finalizeDismiss);
                else scheduleOnRN(recoverInterruptedDismiss);
              });
              backdropOpacity.value = withTiming(0, { duration: BACKDROP_DURATION });
              return;
            }
          }

          // Snap back to current stage
          const targetSnapY = snapStage.value === 0 ? 0 : collapsedOffsetY;
          translateY.value = withSpring(targetSnapY, OPEN_SPRING_CONFIG);
          return;
        }

        if (translationY > 100 || velocityY > 500) {
          closing.value = true;
          scheduleOnRN(markGestureDismissStarted);
          scheduleOnRN(triggerMediumHaptic);
          const hiddenTranslateY = Math.max(sheetHeight.value, screenH);
          translateY.value = withTiming(hiddenTranslateY, {
            duration: CLOSE_DURATION,
            reduceMotion: ReduceMotion.System,
          }, (finished) => {
            if (finished) {
              scheduleOnRN(finalizeDismiss);
            } else {
              scheduleOnRN(recoverInterruptedDismiss);
            }
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
        if ((!success || !dragStartedAtTop.value) && !closing.value) {
          const targetSnapY = expandable && snapStage.value === 1 ? collapsedOffsetY : 0;
          translateY.value = withSpring(targetSnapY, OPEN_SPRING_CONFIG);
        }
      }),
    [
      backdropOpacity,
      closing,
      collapsedOffsetY,
      contentNativeGesture,
      contentScrollY,
      dismissing,
      dragStartedAtTop,
      expandable,
      finalizeDismiss,
      isBusy,
      keyboardVisible,
      markGestureDismissStarted,
      recoverInterruptedDismiss,
      scrollable,
      sheetHeight,
      screenH,
      snapStage,
      startOffsetY,
      translateY,
    ]
  );

  const backdropStyle = useAnimatedStyle(() => {
    const distance = Math.max(sheetHeight.value, screenH, 1);
    const dragProgress = Math.min(translateY.value / distance, 1);
    return {
      opacity: backdropOpacity.value * (1 - dragProgress * 0.65),
    };
  });

  const sheetStyle = useAnimatedStyle(() => {
    const radiusVal = expandable
      ? interpolate(translateY.value, [0, Math.max(1, collapsedOffsetY)], [0, 24], "clamp")
      : 24;
    return {
      transform: [{ translateY: translateY.value }],
      borderTopLeftRadius: radiusVal,
      borderTopRightRadius: radiusVal,
    };
  });

  if (!renderModal) return null;

  const interactionsDisabled = isBusy || dismissing;
  const contentPaddingBottom = Math.max(insets.bottom, spacing.xl);
  const maxContentHeight = expandable
    ? screenH - headerHeight
    : screenH * safeMaxHeight - headerHeight;

  return (
    <Modal
      visible={renderModal}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={beginDismiss}
    >
      <GestureHandlerRootView style={styles.gestureRoot}>
        <KeyboardGestureArea
          style={styles.gestureRoot}
          interpolator="linear"
          enableSwipeToDismiss
          showOnSwipeUp={false}
        >
          <View style={styles.modalRoot}>
          {/* Backdrop */}
          <Animated.View
            accessible={false}
            importantForAccessibility="no-hide-descendants"
            style={[styles.backdropContainer, backdropStyle]}
          >
            <Pressable
              disabled={interactionsDisabled}
              style={styles.backdropPressable}
              onPress={beginDismiss}
            />
          </Animated.View>

          {/* Sheet */}
          <GestureDetector gesture={panGesture}>
            <Animated.View
              style={[
                styles.sheetContainer,
                {
                  minHeight: safeMinHeight ? screenH * safeMinHeight : undefined,
                  maxHeight: expandable ? screenH : screenH * safeMaxHeight,
                },
                sheetStyle,
              ]}
              onLayout={(e) => {
                sheetHeight.value = e.nativeEvent.layout.height;
              }}
              accessibilityViewIsModal
              accessibilityLabel={`${title} sheet`}
              onAccessibilityEscape={beginDismiss}
            >
              <View 
                style={styles.dragHeader}
                onLayout={(e) => {
                  setHeaderHeight(e.nativeEvent.layout.height);
                }}
              >
                <View style={styles.handle} />

                {/* Header: title block + close button */}
                <View style={styles.headerRow}>
                  {onBack ? (
                    <Pressable
                      onPress={onBack}
                      disabled={interactionsDisabled}
                      accessibilityRole="button"
                      accessibilityLabel={backAccessibilityLabel}
                      hitSlop={8}
                      style={({ pressed }) => [
                        styles.headerAction,
                        pressed && styles.headerActionPressed,
                      ]}
                    >
                      <Icon source="arrow-left" size={22} color={colors.textPrimary} />
                    </Pressable>
                  ) : null}
                  <View
                    style={styles.headerTextBlock}
                    ref={headerRef}
                    accessible
                    accessibilityRole="header"
                  >
                    <Text style={styles.title} numberOfLines={2}>
                      {title}
                    </Text>
                    {subtitle ? (
                      <Text style={styles.subtitle}>{subtitle}</Text>
                    ) : null}
                  </View>

                  <Pressable
                    onPress={beginDismiss}
                    disabled={interactionsDisabled}
                    accessibilityRole="button"
                    accessibilityLabel={`Close ${title}`}
                    hitSlop={8}
                    style={({ pressed }) => [
                      styles.headerAction,
                      pressed && styles.headerActionPressed,
                    ]}
                  >
                    <Icon source="close" size={20} color={colors.textSecondary} />
                  </Pressable>
                </View>
              </View>

              <GestureDetector gesture={contentNativeGesture}>
                {scrollable ? (
                  <GHScrollView
                    style={[
                      styles.scrollView,
                      Boolean(safeMinHeight) && styles.scrollViewFill,
                      { maxHeight: maxContentHeight },
                    ]}
                    contentContainerStyle={[
                      !fullBleed && styles.contentWrapPadded,
                      { paddingBottom: contentPaddingBottom },
                    ]}
                    onScroll={(event) => {
                      contentScrollY.value = event.nativeEvent.contentOffset.y;
                    }}
                    scrollEventThrottle={16}
                    showsVerticalScrollIndicator={false}
                    nestedScrollEnabled
                    overScrollMode="never"
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "none"}
                  >
                    {children}
                  </GHScrollView>
                ) : (
                  <View style={[
                    styles.contentWrap,
                    !fullBleed && styles.contentWrapPadded,
                    { paddingBottom: contentPaddingBottom },
                  ]}>
                    {children}
                  </View>
                )}
              </GestureDetector>
            </Animated.View>
          </GestureDetector>
          </View>
        </KeyboardGestureArea>
      </GestureHandlerRootView>
    </Modal>
  );
});

const styles = StyleSheet.create({
  overlayRoot: {
  },
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
  sheetContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    paddingTop: spacing.md,
    ...shadow.lg,
  },
  dragHeader: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: radius.full,
    backgroundColor: colors.border,
    alignSelf: "center",
    marginBottom: spacing.lg,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  headerTextBlock: {
    flex: 1,
    gap: 4,
  },
  title: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: fontSize.sm,
    lineHeight: 18,
    fontWeight: fontWeight.regular,
    color: colors.textSecondary,
  },
  headerAction: {
    width: 38,
    height: 38,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceOffset,
  },
  headerActionPressed: {
    opacity: 0.65,
  },
  scrollView: {
    flexGrow: 0,
  },
  scrollViewFill: {
    flexGrow: 1,
  },
  contentWrap: {
    paddingBottom: spacing.md,
  },
  contentWrapPadded: {
    paddingHorizontal: spacing.lg,
  },
});

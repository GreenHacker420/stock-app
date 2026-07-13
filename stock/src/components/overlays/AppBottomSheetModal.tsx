import React, { forwardRef, useEffect, useImperativeHandle, useCallback, useState, useRef, useMemo } from "react";
import {
  Modal,
  StyleSheet,
  View,
  Text,
  useWindowDimensions,
  Pressable,
  Platform,
  AccessibilityInfo,
} from "react-native";
import {
  GestureHandlerRootView,
  GestureDetector,
  Gesture,
  ScrollView,
} from "react-native-gesture-handler";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  ReduceMotion,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { useReanimatedKeyboardAnimation } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "react-native-paper";
import { colors, spacing, radius, shadow, fontWeight, fontSize } from "../../theme";

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
  isBusy?: boolean;
  maxHeight?: number;
  fullBleed?: boolean;
  scrollable?: boolean;
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
    isBusy = false,
    maxHeight = 0.85,
    fullBleed = false,
    scrollable = false,
  },
  ref
) {
  const { height: screenH } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const [renderModal, setRenderModal] = useState(false);
  const [dismissing, setDismissing] = useState(false);

  const dismissingRef = useRef(false);
  const hasOpenedRef = useRef(false);
  const headerRef = useRef<View>(null);

  const translateY = useSharedValue(screenH);
  const backdropOpacity = useSharedValue(0);
  const sheetHeight = useSharedValue(0);
  const closing = useSharedValue(false);

  const resetDismissState = useCallback(() => {
    dismissingRef.current = false;
    setDismissing(false);
  }, []);

  const finalizeDismiss = useCallback(() => {
    hasOpenedRef.current = false;
    dismissingRef.current = false;
    setDismissing(false);
    setRenderModal(false);
    onDismiss();
  }, [onDismiss]);

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
        scheduleOnRN(resetDismissState);
      }
    });
    backdropOpacity.value = withTiming(0, {
      duration: BACKDROP_DURATION,
      reduceMotion: ReduceMotion.System,
    });
  }, [backdropOpacity, isBusy, closing, finalizeDismiss, resetDismissState, sheetHeight, translateY, screenH]);

  useEffect(() => {
    if (visible && !renderModal) {
      setRenderModal(true);
    }
  }, [visible]);


  useEffect(() => {
    if (!renderModal || !visible || hasOpenedRef.current) return;

    hasOpenedRef.current = true;
    dismissingRef.current = false;
    setDismissing(false);
    closing.value = false;

    translateY.value = Math.max(sheetHeight.value, screenH);
    backdropOpacity.value = 0;

    requestAnimationFrame(() => {
      translateY.value = withSpring(0, OPEN_SPRING_CONFIG);
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
  }, [renderModal, visible]);


  useEffect(() => {
    if (!visible && renderModal) {
      beginDismiss();
    }
  }, [visible, renderModal, beginDismiss]);

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


  const panGesture = useMemo(
    () => Gesture.Pan()
      .enabled(!isBusy && !dismissing)
      .activeOffsetY(10)
      .failOffsetX([-15, 15])
      .onUpdate((event) => {
        translateY.value = Math.max(0, event.translationY);
      })
      .onEnd((event) => {
        if (event.translationY > 100 || event.velocityY > 500) {
          closing.value = true;
          scheduleOnRN(markGestureDismissStarted);
          const hiddenTranslateY = Math.max(sheetHeight.value, screenH);
          translateY.value = withTiming(hiddenTranslateY, {
            duration: CLOSE_DURATION,
            reduceMotion: ReduceMotion.System,
          }, (finished) => {
            if (finished) {
              scheduleOnRN(finalizeDismiss);
            } else {
              scheduleOnRN(resetDismissState);
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
        if (!success && !closing.value) {
          translateY.value = withSpring(0, OPEN_SPRING_CONFIG);
        }
      }),
    [backdropOpacity, isBusy, closing, dismissing, finalizeDismiss, markGestureDismissStarted, resetDismissState, sheetHeight, translateY, screenH]
  );

  const keyboard = useReanimatedKeyboardAnimation();

  const backdropStyle = useAnimatedStyle(() => {
    const distance = Math.max(sheetHeight.value, screenH, 1);
    const dragProgress = Math.min(translateY.value / distance, 1);
    return {
      opacity: backdropOpacity.value * (1 - dragProgress * 0.65),
    };
  });


  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));
  void keyboard;

  if (!renderModal) return null;

  const interactionsDisabled = isBusy || dismissing;
  const contentPaddingBottom = Math.max(insets.bottom, spacing.xl);

  return (
    <Modal
      visible={renderModal}
      transparent
      animationType="none"
      onRequestClose={beginDismiss}
      statusBarTranslucent
    >
      <GestureHandlerRootView style={styles.gestureRoot}>
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
          <Animated.View
            style={[
              styles.sheetContainer,
              { maxHeight: screenH * maxHeight },
              sheetStyle,
            ]}
            onLayout={(e) => {
              sheetHeight.value = e.nativeEvent.layout.height;
            }}
            accessibilityViewIsModal
            accessibilityLabel={`${title} sheet`}
            onAccessibilityEscape={beginDismiss}
          >
            {/* Drag handle — GestureDetector scoped here only, not over content */}
            <GestureDetector gesture={panGesture}>
              <View style={styles.dragHeader}>
                <View style={styles.handle} />

                {/* Header: title block + close button */}
                <View style={styles.headerRow}>
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
                    style={styles.closeBtn}
                  >
                    <Icon source="close" size={20} color={colors.textSecondary} />
                  </Pressable>
                </View>
              </View>
            </GestureDetector>

            {/* Content area */}
            {scrollable ? (
              <KeyboardAvoidingView
                behavior={Platform.OS === "ios" ? "padding" : "height"}
                style={styles.flex1}
              >
                <ScrollView
                  keyboardShouldPersistTaps="handled"
                  keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
                  contentContainerStyle={[
                    !fullBleed && styles.contentWrapPadded,
                    { paddingBottom: contentPaddingBottom },
                  ]}
                  showsVerticalScrollIndicator={false}
                >
                  {children}
                </ScrollView>
              </KeyboardAvoidingView>
            ) : (
              <View style={[
                styles.contentWrap,
                !fullBleed && styles.contentWrapPadded,
                { paddingBottom: contentPaddingBottom },
              ]}>
                {children}
              </View>
            )}
          </Animated.View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
});

const styles = StyleSheet.create({
  flex1: {
    flex: 1,
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
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  headerTextBlock: {
    flex: 1,
    gap: 4,
  },
  title: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  closeBtn: {
    padding: spacing.xs,
    borderRadius: radius.sm,
    marginTop: -spacing.xs,
  },
  contentWrap: {
    paddingBottom: spacing.md,
  },
  contentWrapPadded: {
    paddingHorizontal: spacing.lg,
  },
});

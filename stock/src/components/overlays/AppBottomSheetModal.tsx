import React, { forwardRef, useEffect, useImperativeHandle, useCallback, useState, useRef, useMemo } from "react";
import {
  Modal,
  StyleSheet,
  View,
  Text,
  useWindowDimensions,
  Pressable,
  AccessibilityInfo,
} from "react-native";
import {
  GestureHandlerRootView,
  GestureDetector,
  Gesture,
} from "react-native-gesture-handler";
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
  keyboardAware?: boolean;
  maxHeight?: number; // float between 0 and 1
  fullBleed?: boolean;
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
    keyboardAware = true,
    maxHeight = 0.85,
    fullBleed = false,
  },
  ref
) {
  const { height: screenH } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const [renderModal, setRenderModal] = useState(false);
  const [dismissing, setDismissing] = useState(false);

  const dismissingRef = useRef(false);
  const headerRef = useRef<View>(null);

  const translateY = useSharedValue(screenH);
  const backdropOpacity = useSharedValue(0);
  const sheetHeight = useSharedValue(0);
  const closing = useSharedValue(false);

  const finalizeDismiss = useCallback(() => {
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
      }
    });
    backdropOpacity.value = withTiming(0, {
      duration: BACKDROP_DURATION,
      reduceMotion: ReduceMotion.System,
    });
  }, [backdropOpacity, isBusy, closing, finalizeDismiss, sheetHeight, translateY, screenH]);

  const markGestureDismissStarted = useCallback(() => {
    if (dismissingRef.current) return;
    dismissingRef.current = true;
    setDismissing(true);
  }, []);

  // Sync visible prop to animation trigger
  useEffect(() => {
    if (visible) {
      setRenderModal(true);
      dismissingRef.current = false;
      setDismissing(false);
      closing.value = false;
      translateY.value = Math.max(sheetHeight.value, screenH);
      backdropOpacity.value = 0;
      
      translateY.value = withSpring(0, OPEN_SPRING_CONFIG);
      backdropOpacity.value = withTiming(1, {
        duration: 200,
        reduceMotion: ReduceMotion.System,
      });

      const focusTimer = setTimeout(() => {
        if (headerRef.current) {
          AccessibilityInfo.sendAccessibilityEvent(headerRef.current, 'focus');
        }
      }, 250);
      return () => clearTimeout(focusTimer);
    } else if (renderModal) {
      beginDismiss();
    }
  }, [visible, renderModal, beginDismiss, screenH, sheetHeight, translateY, backdropOpacity, closing]);

  // Expose dismiss method via Ref
  useImperativeHandle(ref, () => ({
    dismiss: () => {
      beginDismiss();
    },
  }));

  // Pan gesture for drag-to-dismiss (covers entire sheet)
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
            if (finished) scheduleOnRN(finalizeDismiss);
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
    [backdropOpacity, isBusy, closing, dismissing, finalizeDismiss, markGestureDismissStarted, sheetHeight, translateY, screenH]
  );

  const keyboard = useReanimatedKeyboardAnimation();

  const backdropStyle = useAnimatedStyle(() => {
    const distance = Math.max(sheetHeight.value, screenH, 1);
    const dragProgress = Math.min(translateY.value / distance, 1);
    return {
      opacity: backdropOpacity.value * (1 - dragProgress * 0.65),
    };
  });

  const sheetStyle = useAnimatedStyle(() => {
    const keyboardOffset = keyboardAware ? keyboard.height.value : 0;
    return {
      transform: [
        { translateY: translateY.value - keyboardOffset }
      ],
    };
  });

  if (!renderModal) return null;

  const interactionsDisabled = isBusy || dismissing;

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
              accessibilityRole="button"
              accessibilityLabel={`Close ${title} panel`}
              style={styles.backdropPressable}
              onPress={beginDismiss}
            />
          </Animated.View>

          {/* Sheet Content */}
          <GestureDetector gesture={panGesture}>
            <Animated.View
              style={[
                styles.sheetContainer,
                {
                  maxHeight: screenH * maxHeight,
                  paddingBottom: Math.max(insets.bottom, spacing.xl),
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
              {/* Drag Handle Row */}
              <View style={styles.dragArea}>
                <View style={styles.handle} />
              </View>

              {/* Header */}
              <View ref={headerRef} style={styles.header} accessible accessibilityRole="header">
                <Text style={styles.title} numberOfLines={1}>
                  {title}
                </Text>
                {subtitle ? (
                  <Text style={styles.subtitle}>{subtitle}</Text>
                ) : null}
              </View>

              {/* Scrollable Content wrapper */}
              <View style={[styles.contentWrap, !fullBleed && styles.contentWrapPadded]}>
                {children}
              </View>
            </Animated.View>
          </GestureDetector>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
});

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
    paddingHorizontal: spacing.lg,
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
    textAlign: "center",
  },
  contentWrap: {
    paddingBottom: spacing.md,
  },
  contentWrapPadded: {
    paddingHorizontal: spacing.lg,
  },
});

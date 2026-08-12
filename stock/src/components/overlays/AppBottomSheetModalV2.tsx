import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AccessibilityInfo,
  BackHandler,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import {
  KeyboardGestureArea,
  useKeyboardState,
  useReanimatedKeyboardAnimation,
} from "react-native-keyboard-controller";
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
  ScrollView as GHScrollView,
} from "react-native-gesture-handler";
import Animated, {
  interpolate,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "react-native-paper";
import {
  colors,
  fontSize,
  fontWeight,
  radius,
  shadow,
  spacing,
} from "../../theme";
import {
  triggerLightHaptic,
  triggerMediumHaptic,
} from "../../utils/haptics";

const OPEN_SPRING = {
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

export interface AppBottomSheetModalProps {
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
  ref,
) {
  const { height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const keyboardVisible = useKeyboardState((state) => state.isVisible);
  const { height: keyboardHeight } = useReanimatedKeyboardAnimation();

  const [renderModal, setRenderModal] = useState(visible);
  const [dismissing, setDismissing] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(72);
  const headerRef = useRef<View>(null);
  const dismissingRef = useRef(false);
  const openedRef = useRef(false);

  const translateY = useSharedValue(screenHeight);
  const backdropOpacity = useSharedValue(0);
  const sheetHeight = useSharedValue(0);
  const closing = useSharedValue(false);
  const dragStartY = useSharedValue(0);
  const snapStage = useSharedValue<0 | 1>(expandable ? 1 : 0); // 0 expanded, 1 collapsed

  const safeMaxHeight = Math.min(1, Math.max(0.4, maxHeight));
  const safeMinHeight = minHeight == null
    ? undefined
    : Math.min(safeMaxHeight, Math.max(0.4, minHeight));
  const fullHeightScrollable = scrollable && !expandable && safeMaxHeight >= 0.98;
  const collapsedOffsetY = expandable ? Math.round(screenHeight * 0.35) : 0;
  const sheetMaxHeight = expandable ? screenHeight : screenHeight * safeMaxHeight;
  const sheetMinHeight = safeMinHeight ? screenHeight * safeMinHeight : undefined;
  const contentMaxHeight = Math.max(1, sheetMaxHeight - headerHeight);

  const finishDismiss = useCallback(() => {
    dismissingRef.current = false;
    openedRef.current = false;
    setDismissing(false);
    setRenderModal(false);
    closing.value = false;
    onDismiss();
  }, [closing, onDismiss]);

  const restoreOpenPosition = useCallback(() => {
    dismissingRef.current = false;
    setDismissing(false);
    closing.value = false;
    const target = expandable && snapStage.value === 1 ? collapsedOffsetY : 0;
    translateY.value = withSpring(target, OPEN_SPRING);
    backdropOpacity.value = withTiming(1, {
      duration: BACKDROP_DURATION,
      reduceMotion: ReduceMotion.System,
    });
  }, [
    backdropOpacity,
    closing,
    collapsedOffsetY,
    expandable,
    snapStage,
    translateY,
  ]);

  const beginDismiss = useCallback(() => {
    if (isBusy || dismissingRef.current) return;
    dismissingRef.current = true;
    setDismissing(true);
    closing.value = true;
    const hiddenY = Math.max(sheetHeight.value, screenHeight);
    translateY.value = withTiming(
      hiddenY,
      { duration: CLOSE_DURATION, reduceMotion: ReduceMotion.System },
      (finished) => {
        if (finished) scheduleOnRN(finishDismiss);
        else scheduleOnRN(restoreOpenPosition);
      },
    );
    backdropOpacity.value = withTiming(0, {
      duration: BACKDROP_DURATION,
      reduceMotion: ReduceMotion.System,
    });
  }, [
    backdropOpacity,
    closing,
    finishDismiss,
    isBusy,
    restoreOpenPosition,
    screenHeight,
    sheetHeight,
    translateY,
  ]);

  const handleBack = useCallback(() => {
    if (isBusy || dismissingRef.current) return;
    if (onBack) onBack();
    else beginDismiss();
  }, [beginDismiss, isBusy, onBack]);

  useEffect(() => {
    if (visible) {
      if (!renderModal) setRenderModal(true);
      if (dismissingRef.current) restoreOpenPosition();
      return;
    }
    if (renderModal && openedRef.current && !dismissingRef.current) beginDismiss();
  }, [beginDismiss, renderModal, restoreOpenPosition, visible]);

  useEffect(() => {
    if (!renderModal || !visible || openedRef.current) return;
    openedRef.current = true;
    dismissingRef.current = false;
    setDismissing(false);
    closing.value = false;
    snapStage.value = expandable ? 1 : 0;
    translateY.value = screenHeight;
    backdropOpacity.value = 0;

    requestAnimationFrame(() => {
      const target = expandable ? collapsedOffsetY : 0;
      translateY.value = withSpring(target, OPEN_SPRING);
      backdropOpacity.value = withTiming(1, {
        duration: 200,
        reduceMotion: ReduceMotion.System,
      });
    });

    const focusTimer = setTimeout(() => {
      if (headerRef.current) {
        AccessibilityInfo.sendAccessibilityEvent(headerRef.current, "focus");
      }
    }, 250);
    return () => clearTimeout(focusTimer);
  }, [
    backdropOpacity,
    closing,
    collapsedOffsetY,
    expandable,
    renderModal,
    screenHeight,
    snapStage,
    translateY,
    visible,
  ]);

  useEffect(() => {
    if (!renderModal || !visible) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      handleBack();
      return true;
    });
    return () => subscription.remove();
  }, [handleBack, renderModal, visible]);

  useImperativeHandle(ref, () => ({ dismiss: beginDismiss }), [beginDismiss]);

  const markGestureDismiss = useCallback(() => {
    dismissingRef.current = true;
    setDismissing(true);
  }, []);

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(!isBusy && !dismissing && !keyboardVisible)
        .activeOffsetY([-7, 9])
        .failOffsetX([-18, 18])
        .onStart(() => {
          dragStartY.value = translateY.value;
        })
        .onUpdate((event) => {
          const next = dragStartY.value + event.translationY;
          if (expandable) {
            translateY.value = Math.max(0, next);
          } else {
            translateY.value = Math.max(0, next);
          }
        })
        .onEnd((event) => {
          const dy = event.translationY;
          const vy = event.velocityY;

          if (expandable) {
            if (snapStage.value === 1 && (dy < -30 || vy < -300)) {
              snapStage.value = 0;
              translateY.value = withSpring(0, OPEN_SPRING);
              scheduleOnRN(triggerLightHaptic);
              return;
            }

            if (snapStage.value === 0 && (dy > 150 || vy > 700)) {
              closing.value = true;
              scheduleOnRN(markGestureDismiss);
              scheduleOnRN(triggerMediumHaptic);
              const hiddenY = Math.max(sheetHeight.value, screenHeight);
              translateY.value = withTiming(hiddenY, { duration: CLOSE_DURATION }, (finished) => {
                if (finished) scheduleOnRN(finishDismiss);
                else scheduleOnRN(restoreOpenPosition);
              });
              backdropOpacity.value = withTiming(0, { duration: BACKDROP_DURATION });
              return;
            }

            if (snapStage.value === 0 && (dy > 30 || vy > 180)) {
              snapStage.value = 1;
              translateY.value = withSpring(collapsedOffsetY, OPEN_SPRING);
              scheduleOnRN(triggerLightHaptic);
              return;
            }

            if (snapStage.value === 1 && (dy > 60 || vy > 350)) {
              closing.value = true;
              scheduleOnRN(markGestureDismiss);
              scheduleOnRN(triggerMediumHaptic);
              const hiddenY = Math.max(sheetHeight.value, screenHeight);
              translateY.value = withTiming(hiddenY, { duration: CLOSE_DURATION }, (finished) => {
                if (finished) scheduleOnRN(finishDismiss);
                else scheduleOnRN(restoreOpenPosition);
              });
              backdropOpacity.value = withTiming(0, { duration: BACKDROP_DURATION });
              return;
            }

            translateY.value = withSpring(
              snapStage.value === 1 ? collapsedOffsetY : 0,
              OPEN_SPRING,
            );
            return;
          }

          if (dy > 100 || vy > 500) {
            closing.value = true;
            scheduleOnRN(markGestureDismiss);
            scheduleOnRN(triggerMediumHaptic);
            const hiddenY = Math.max(sheetHeight.value, screenHeight);
            translateY.value = withTiming(hiddenY, { duration: CLOSE_DURATION }, (finished) => {
              if (finished) scheduleOnRN(finishDismiss);
              else scheduleOnRN(restoreOpenPosition);
            });
            backdropOpacity.value = withTiming(0, { duration: BACKDROP_DURATION });
          } else {
            translateY.value = withSpring(0, OPEN_SPRING);
          }
        }),
    [
      backdropOpacity,
      closing,
      collapsedOffsetY,
      dismissing,
      dragStartY,
      expandable,
      finishDismiss,
      isBusy,
      keyboardVisible,
      markGestureDismiss,
      restoreOpenPosition,
      screenHeight,
      sheetHeight,
      snapStage,
      translateY,
    ],
  );

  const backdropStyle = useAnimatedStyle(() => {
    const distance = Math.max(sheetHeight.value, screenHeight, 1);
    const progress = Math.min(translateY.value / distance, 1);
    return { opacity: backdropOpacity.value * (1 - progress * 0.65) };
  });

  const sheetStyle = useAnimatedStyle(() => {
    const radiusValue = expandable
      ? interpolate(
          translateY.value,
          [0, Math.max(1, collapsedOffsetY)],
          [0, 24],
          "clamp",
        )
      : safeMaxHeight >= 0.98
        ? 0
        : 24;
    const maxLift = Math.max(
      0,
      screenHeight - sheetHeight.value - insets.top - spacing.md,
    );
    const keyboardLift = Math.min(Math.abs(keyboardHeight.value), maxLift);
    return {
      transform: [{ translateY: translateY.value - keyboardLift }],
      borderTopLeftRadius: radiusValue,
      borderTopRightRadius: radiusValue,
    };
  });

  if (!renderModal) return null;

  const disabled = isBusy || dismissing;
  const contentPaddingBottom = Math.max(insets.bottom, spacing.xl);

  const header = (
    <View
      style={[
        styles.dragHeader,
        safeMaxHeight >= 0.98 && { paddingTop: Math.max(insets.top, spacing.md) },
      ]}
      onLayout={(event) => setHeaderHeight(event.nativeEvent.layout.height)}
    >
      <View style={styles.handle} />
      <View style={styles.headerRow}>
        {onBack ? (
          <Pressable
            onPress={onBack}
            disabled={disabled}
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
          ref={headerRef}
          style={styles.headerTextBlock}
          accessible
          accessibilityRole="header"
        >
          <Text style={styles.title} numberOfLines={2}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        <Pressable
          onPress={beginDismiss}
          disabled={disabled}
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
  );

  const body = scrollable ? (
    <GHScrollView
      style={[
        styles.scrollView,
        fullHeightScrollable && styles.scrollViewFill,
        { maxHeight: contentMaxHeight },
      ]}
      contentContainerStyle={[
        !fullBleed && styles.contentPadded,
        { paddingBottom: contentPaddingBottom },
      ]}
      showsVerticalScrollIndicator
      nestedScrollEnabled
      overScrollMode="never"
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "none"}
    >
      {children}
    </GHScrollView>
  ) : (
    <View
      style={[
        styles.content,
        !fullBleed && styles.contentPadded,
        { paddingBottom: contentPaddingBottom },
      ]}
    >
      {children}
    </View>
  );

  const sheet = (
    <Animated.View
      style={[
        styles.sheet,
        {
          minHeight: sheetMinHeight,
          maxHeight: sheetMaxHeight,
          height: fullHeightScrollable ? sheetMaxHeight : undefined,
        },
        sheetStyle,
      ]}
      onLayout={(event) => {
        sheetHeight.value = event.nativeEvent.layout.height;
      }}
      accessibilityViewIsModal
      accessibilityLabel={`${title} sheet`}
      onAccessibilityEscape={beginDismiss}
    >
      {scrollable ? (
        <GestureDetector gesture={panGesture}>{header}</GestureDetector>
      ) : (
        header
      )}
      {body}
    </Animated.View>
  );

  return (
    <Modal
      visible={renderModal}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={handleBack}
    >
      <GestureHandlerRootView style={styles.root}>
        <KeyboardGestureArea
          style={styles.root}
          interpolator="linear"
          enableSwipeToDismiss
          showOnSwipeUp={false}
        >
          <View style={styles.modalRoot}>
            <Animated.View style={[styles.backdrop, backdropStyle]}>
              <Pressable
                disabled={disabled}
                style={styles.backdropPressable}
                onPress={beginDismiss}
              />
            </Animated.View>
            {scrollable ? sheet : (
              <GestureDetector gesture={panGesture}>{sheet}</GestureDetector>
            )}
          </View>
        </KeyboardGestureArea>
      </GestureHandlerRootView>
    </Modal>
  );
});

const styles = StyleSheet.create({
  root: { flex: 1 },
  modalRoot: { flex: 1, justifyContent: "flex-end" },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  backdropPressable: { flex: 1 },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface,
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
  headerTextBlock: { flex: 1, gap: 4 },
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
  headerActionPressed: { opacity: 0.65 },
  scrollView: { flexGrow: 0 },
  scrollViewFill: { flex: 1 },
  content: { paddingBottom: spacing.md },
  contentPadded: { paddingHorizontal: spacing.lg },
});

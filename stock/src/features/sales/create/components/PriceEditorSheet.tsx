import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  View,
  TextInput as RNTextInput,
  Platform,
  Dimensions,
  useWindowDimensions,
} from "react-native";
import { Icon, Text, TextInput } from "react-native-paper";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../../../theme";
import { parseMoneyToMinor } from "../core/sale-calculations";
import { AppKeyboardAvoidingView } from "../../../../components/ui/AppKeyboardAvoidingView";
import { GestureDetector, Gesture, GestureHandlerRootView } from "react-native-gesture-handler";
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

interface PriceEditorSheetProps {
  visible: boolean;
  onClose: () => void;
  itemName: string;
  defaultPrice: number;
  minimumPrice: number;
  mrp?: number;
  currentPrice: number;
  onSave: (price: number | undefined) => void;
  userRole?: string;
}

export function PriceEditorSheet({
  visible,
  onClose,
  itemName,
  defaultPrice,
  minimumPrice,
  mrp,
  currentPrice,
  onSave,
  userRole = "STAFF",
}: PriceEditorSheetProps) {
  const [rateInput, setRateInput] = useState(String(currentPrice));
  const [rateError, setRateError] = useState<string | null>(null);
  const [renderModal, setRenderModal] = useState(false);
  const { height: windowHeight } = useWindowDimensions();

  const inputRef = useRef<RNTextInput | null>(null);

  const translateY = useSharedValue(windowHeight);
  const backdropOpacity = useSharedValue(0);
  const closing = useSharedValue(false);

  const finalizeDismiss = useCallback(() => {
    setRenderModal(false);
    onClose();
  }, [onClose]);

  const beginDismiss = useCallback(() => {
    closing.value = true;
    translateY.value = withTiming(windowHeight, { duration: 180 }, (finished) => {
      if (finished) scheduleOnRN(finalizeDismiss);
    });
    backdropOpacity.value = withTiming(0, { duration: 150 });
  }, [finalizeDismiss, windowHeight]);

  useEffect(() => {
    if (visible) {
      setRateInput(String(currentPrice));
      setRateError(null);
      setRenderModal(true);
      closing.value = false;
      translateY.value = windowHeight;
      backdropOpacity.value = 0;
      translateY.value = withSpring(0, { damping: 26, stiffness: 220, overshootClamping: true });
      backdropOpacity.value = withTiming(1, { duration: 200 });

      // Safe timeout to let transition finish before focusing
      const timer = setTimeout(() => inputRef.current?.focus(), 250);
      return () => clearTimeout(timer);
    } else {
      if (renderModal) beginDismiss();
    }
  }, [visible, currentPrice, windowHeight]);

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY(10)
        .failOffsetX([-15, 15])
        .onUpdate((event) => {
          translateY.value = Math.max(0, event.translationY);
        })
        .onEnd((event) => {
          if (event.translationY > 100 || event.velocityY > 500) {
            closing.value = true;
            translateY.value = withTiming(windowHeight, { duration: 180 }, (finished) => {
              if (finished) scheduleOnRN(finalizeDismiss);
            });
            backdropOpacity.value = withTiming(0, { duration: 150 });
          } else {
            translateY.value = withSpring(0, { damping: 26, stiffness: 220, overshootClamping: true });
          }
        })
        .onFinalize((_event, success) => {
          if (!success && !closing.value) {
            translateY.value = withSpring(0, { damping: 26, stiffness: 220, overshootClamping: true });
          }
        }),
    [windowHeight, finalizeDismiss]
  );

  const backdropStyle = useAnimatedStyle(() => {
    const dragProgress = Math.min(translateY.value / windowHeight, 1);
    return {
      opacity: backdropOpacity.value * (1 - dragProgress * 0.65),
    };
  });

  const sheetStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateY: translateY.value }],
    };
  });

  const validate = (val: string) => {
    const valTrim = val.trim();
    if (!valTrim) {
      setRateError("Please enter a valid price.");
      return false;
    }

    const minorUnits = parseMoneyToMinor(valTrim);
    if (minorUnits === null || minorUnits <= 0) {
      setRateError("Please enter a valid price (e.g. 150.50).");
      return false;
    }

    const numericVal = minorUnits / 100;
    if (userRole === "STAFF" && numericVal < minimumPrice) {
      setRateError(
        `Staff cannot sell below minimum price of ₹${minimumPrice.toLocaleString("en-IN")}.`
      );
      return false;
    }

    setRateError(null);
    return true;
  };

  const handleTextChange = (val: string) => {
    setRateInput(val);
    validate(val);
  };

  const handleSave = () => {
    if (!validate(rateInput)) return;
    const minorUnits = parseMoneyToMinor(rateInput.trim());
    if (minorUnits !== null) {
      const numericVal = minorUnits / 100;
      if (numericVal === defaultPrice) {
        onSave(undefined); // Reset to default
      } else {
        onSave(numericVal);
      }
      beginDismiss();
    }
  };

  const handleReset = () => {
    setRateInput(String(defaultPrice));
    setRateError(null);
    inputRef.current?.focus();
  };

  const isSaveDisabled =
    !!rateError ||
    !rateInput.trim() ||
    parseMoneyToMinor(rateInput.trim()) === parseMoneyToMinor(String(currentPrice));

  return (
    <Modal
      visible={renderModal}
      transparent
      animationType="none"
      onRequestClose={beginDismiss}
      statusBarTranslucent
    >
      <GestureHandlerRootView style={styles.gestureRoot} unstable_forceActive>
        <AppKeyboardAvoidingView style={styles.overlay}>
          <Reanimated.View style={[styles.backdropContainer, backdropStyle]}>
            <Pressable style={styles.backdropPressable} onPress={beginDismiss} />
          </Reanimated.View>
          <GestureDetector gesture={panGesture}>
            <Reanimated.View style={[styles.sheetContainer, sheetStyle]}>
                {/* Drag Handle */}
                <View style={styles.handle} />

                {/* Header */}
                <View style={styles.header}>
                  <View>
                    <Text style={styles.title}>Edit Price</Text>
                    <Text style={styles.subtitle} numberOfLines={1}>
                      {itemName}
                    </Text>
                  </View>
                  <Pressable
                    onPress={beginDismiss}
                    hitSlop={12}
                    accessibilityRole="button"
                    accessibilityLabel="Close sheet"
                    style={styles.closeButton}
                  >
                    <Icon source="close" size={24} color={colors.textSecondary} />
                  </Pressable>
                </View>

                {/* Info Grid */}
                <View style={styles.grid}>
                  <View style={styles.gridCell}>
                    <Text style={styles.gridLabel}>MRP</Text>
                    <Text style={styles.gridValue}>
                      {mrp !== undefined && mrp > 0
                        ? `₹${mrp.toLocaleString("en-IN")}`
                        : "N/A"}
                    </Text>
                  </View>
                  <View style={styles.gridCell}>
                    <Text style={styles.gridLabel}>Selling Price</Text>
                    <Text style={styles.gridValue}>
                      ₹{defaultPrice.toLocaleString("en-IN")}
                    </Text>
                  </View>
                  <View style={styles.gridCell}>
                    <Text style={styles.gridLabel}>Min Price</Text>
                    <Text style={styles.gridValue}>
                      ₹{minimumPrice.toLocaleString("en-IN")}
                    </Text>
                  </View>
                </View>

                {/* Input Section */}
                <View style={styles.inputContainer}>
                  <TextInput
                    ref={(ref: any) => {
                      inputRef.current = ref;
                    }}
                    mode="outlined"
                    label="New Selling Price"
                    value={rateInput}
                    onChangeText={handleTextChange}
                    keyboardType="decimal-pad"
                    outlineStyle={styles.inputOutline}
                    left={<TextInput.Icon icon="currency-inr" />}
                    style={styles.input}
                    error={!!rateError}
                  />
                  {rateError && <Text style={styles.errorText}>{rateError}</Text>}
                </View>

                {/* Action buttons (vertical layout to prevent Canc/el text wrapping) */}
                <View style={styles.actionContainer}>
                  <Pressable
                    onPress={handleReset}
                    style={({ pressed }) => [styles.resetBtn, pressed && styles.pressed]}
                    accessibilityRole="button"
                    accessibilityLabel="Reset price to default selling price"
                  >
                    <Text style={styles.resetBtnText}>Reset to Default</Text>
                  </Pressable>

                  <View style={styles.footerRow}>
                    <Pressable
                      onPress={beginDismiss}
                      style={({ pressed }) => [styles.cancelBtn, pressed && styles.pressed]}
                      accessibilityRole="button"
                      accessibilityLabel="Cancel editing"
                    >
                      <Text style={styles.cancelBtnText}>Cancel</Text>
                    </Pressable>

                    <Pressable
                      disabled={isSaveDisabled}
                      onPress={handleSave}
                      style={({ pressed }) => [
                        styles.saveBtn,
                        isSaveDisabled && styles.disabledBtn,
                        pressed && !isSaveDisabled && styles.pressed,
                      ]}
                    >
                      <Text
                        style={[
                          styles.saveBtnText,
                          isSaveDisabled && styles.saveBtnTextDisabled,
                        ]}
                      >
                        Save Price
                      </Text>
                    </Pressable>
                  </View>
                </View>
              </Reanimated.View>
            </GestureDetector>
          </AppKeyboardAvoidingView>
        </GestureHandlerRootView>
      </Modal>
  );
}

const styles = StyleSheet.create({
  gestureRoot: {
    flex: 1,
  },
  overlay: {
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
  avoidingView: {
    width: "100%",
  },
  sheetContainer: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: Platform.OS === "ios" ? spacing.xxl + 8 : spacing.xl,
    ...shadow.lg,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: radius.full,
    backgroundColor: colors.border,
    alignSelf: "center",
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: spacing.md,
  },
  title: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    maxWidth: Dimensions.get("window").width - 80,
  },
  closeButton: {
    padding: spacing.xs,
  },
  grid: {
    flexDirection: "row",
    backgroundColor: colors.surfaceOffset,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  gridCell: {
    flex: 1,
    alignItems: "center",
  },
  gridLabel: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  gridValue: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
  },
  inputContainer: {
    marginBottom: spacing.lg,
  },
  input: {
    backgroundColor: colors.surface,
  },
  inputOutline: {
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  errorText: {
    color: colors.danger,
    fontSize: fontSize.xs,
    marginTop: spacing.xs,
  },
  actionContainer: {
    gap: spacing.sm,
  },
  resetBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
    justifyContent: "center",
  },
  resetBtnText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.primary,
  },
  footerRow: {
    flexDirection: "row",
    gap: spacing.md,
  },
  cancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelBtnText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.textSecondary,
  },
  saveBtn: {
    flex: 1.5,
    backgroundColor: colors.success,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
    justifyContent: "center",
  },
  saveBtnText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.textInverse,
  },
  saveBtnTextDisabled: {
    color: colors.textMuted,
  },
  disabledBtn: {
    backgroundColor: colors.border,
    borderColor: colors.border,
    opacity: 0.6,
  },
  pressed: {
    opacity: 0.8,
  },
});

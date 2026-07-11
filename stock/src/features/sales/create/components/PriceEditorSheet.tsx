import { useState, useEffect, useRef } from "react";
import {
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  View,
  TextInput as RNTextInput,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
} from "react-native";
import { Icon, Text, TextInput } from "react-native-paper";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../../../theme";
import { parseMoneyToMinor } from "../core/sale-calculations";

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

  const slideAnim = useRef(new Animated.Value(Dimensions.get("window").height)).current;
  const inputRef = useRef<RNTextInput | null>(null);

  useEffect(() => {
    if (visible) {
      setRateInput(String(currentPrice));
      setRateError(null);
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }).start(() => {
        // Safe timeout to let transition finish before focusing
        setTimeout(() => inputRef.current?.focus(), 50);
      });
    } else {
      Animated.timing(slideAnim, {
        toValue: Dimensions.get("window").height,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, currentPrice, slideAnim]);

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
      onClose();
    }
  };

  const handleReset = () => {
    setRateInput(String(defaultPrice));
    setRateError(null);
    // Autofocus back to input
    inputRef.current?.focus();
  };

  const isSaveDisabled =
    !!rateError ||
    !rateInput.trim() ||
    parseMoneyToMinor(rateInput.trim()) === parseMoneyToMinor(currentPrice);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.avoidingView}
        >
          <Animated.View
            style={[
              styles.sheetContainer,
              { transform: [{ translateY: slideAnim }] },
            ]}
          >
            {/* Header */}
            <View style={styles.header}>
              <View>
                <Text style={styles.title}>Edit Price</Text>
                <Text style={styles.subtitle} numberOfLines={1}>
                  {itemName}
                </Text>
              </View>
              <Pressable
                onPress={onClose}
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
                left={<TextInput.Affix text="₹ " />}
                error={!!rateError}
                style={styles.input}
              />
              {rateError && <Text style={styles.errorText}>{rateError}</Text>}
            </View>

            {/* Actions Stack — Anti-wrapping layout */}
            <View style={styles.actionContainer}>
              <Pressable
                onPress={handleReset}
                disabled={parseMoneyToMinor(rateInput.trim()) === parseMoneyToMinor(defaultPrice)}
                accessibilityRole="button"
                accessibilityLabel="Reset to default price"
                style={({ pressed }) => [
                  styles.resetBtn,
                  parseMoneyToMinor(rateInput.trim()) === parseMoneyToMinor(defaultPrice) &&
                    styles.disabledBtn,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.resetBtnText}>Reset to Default</Text>
              </Pressable>

              <View style={styles.footerRow}>
                <Pressable
                  onPress={onClose}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel price editing"
                  style={({ pressed }) => [styles.cancelBtn, pressed && styles.pressed]}
                >
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </Pressable>

                <Pressable
                  onPress={handleSave}
                  disabled={isSaveDisabled}
                  accessibilityRole="button"
                  accessibilityLabel="Save new price"
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
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: colors.overlay,
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
  },
  avoidingView: {
    width: "100%",
  },
  sheetContainer: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: Platform.OS === "ios" ? spacing.xxl + 8 : spacing.xl,
    ...shadow.lg,
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

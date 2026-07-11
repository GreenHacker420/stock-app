import React, { useRef, useState, useEffect } from "react";
import { Modal, Pressable, StyleSheet, View, Dimensions, Animated, Platform } from "react-native";
import { Icon, Text } from "react-native-paper";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../../../theme";
import { SignaturePad } from "../../../../components/ui/SignaturePad";
import { Button } from "../../../../components/ui/Button";

interface CreditAuthorizationSheetProps {
  visible: boolean;
  onClose: () => void;
  balance: number;
  onSaveSignature: (signatureBase64: string) => void;
  initialSignature?: string;
}

export function CreditAuthorizationSheet({
  visible,
  onClose,
  balance,
  onSaveSignature,
  initialSignature,
}: CreditAuthorizationSheetProps) {
  const insets = useSafeAreaInsets();
  const [draftSignature, setDraftSignature] = useState<string | undefined>(initialSignature);
  const [padKey, setPadKey] = useState(0);

  const slideAnim = useRef(new Animated.Value(Dimensions.get("window").height)).current;

  useEffect(() => {
    if (visible) {
      setDraftSignature(initialSignature);
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: Dimensions.get("window").height,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, initialSignature, slideAnim]);

  const handleSave = () => {
    if (draftSignature) {
      onSaveSignature(draftSignature);
      onClose();
    }
  };

  const handleClear = () => {
    setDraftSignature(undefined);
    setPadKey((prev) => prev + 1);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <Animated.View
          style={[
            styles.sheetContainer,
            { transform: [{ translateY: slideAnim }] },
          ]}
        >
          {/* Header */}
          <View style={[styles.header, { paddingTop: insets.top > 0 ? spacing.sm : spacing.md }]}>
            <View>
              <Text style={styles.title}>Authorize Credit Sale</Text>
              <Text style={styles.subtitle}>Amount to Credit: ₹{balance.toLocaleString("en-IN")}</Text>
            </View>
            <Pressable
              onPress={onClose}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Close authorization modal"
              style={styles.closeBtn}
            >
              <Icon source="close" size={24} color={colors.textSecondary} />
            </Pressable>
          </View>

          {/* Signature Canvas Box */}
          <View style={styles.padWrapper}>
            <SignaturePad
              key={padKey}
              hideHeaderFooter={true}
              onSave={setDraftSignature}
              onClear={() => setDraftSignature(undefined)}
            />
          </View>

          {/* Actions Footer */}
          <View style={[styles.footer, { paddingBottom: insets.bottom > 0 ? insets.bottom + spacing.sm : spacing.md }]}>
            <Pressable
              onPress={handleClear}
              disabled={!draftSignature}
              style={({ pressed }) => [
                styles.clearBtn,
                !draftSignature && styles.clearBtnDisabled,
                pressed && draftSignature && styles.pressed,
              ]}
            >
              <Text style={[styles.clearBtnText, !draftSignature && styles.clearBtnTextDisabled]}>
                Clear
              </Text>
            </Pressable>

            <Pressable
              onPress={handleSave}
              disabled={!draftSignature}
              style={({ pressed }) => [
                styles.saveBtn,
                !draftSignature && styles.saveBtnDisabled,
                pressed && draftSignature && styles.pressed,
              ]}
            >
              <Text
                style={[
                  styles.saveBtnText,
                  !draftSignature && styles.saveBtnTextDisabled,
                ]}
              >
                Save & Continue
              </Text>
            </Pressable>
          </View>
        </Animated.View>
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
  sheetContainer: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    height: "80%",
    ...shadow.lg,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  closeBtn: {
    padding: spacing.xs,
  },
  padWrapper: {
    flex: 1,
    backgroundColor: colors.surfaceOffset,
    overflow: "hidden",
  },
  footer: {
    flexDirection: "row",
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.md,
    backgroundColor: colors.surface,
  },
  clearBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  clearBtnDisabled: {
    borderColor: colors.border,
    opacity: 0.5,
  },
  clearBtnText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.textSecondary,
  },
  clearBtnTextDisabled: {
    color: colors.textMuted,
  },
  saveBtn: {
    flex: 1.5,
    backgroundColor: colors.success,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  saveBtnDisabled: {
    backgroundColor: colors.border,
    opacity: 0.5,
  },
  saveBtnText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.textInverse,
  },
  saveBtnTextDisabled: {
    color: colors.textMuted,
  },
  pressed: {
    opacity: 0.8,
  },
});

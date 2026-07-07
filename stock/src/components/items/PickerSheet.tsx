import React from "react";
import {
  View,
  StyleSheet,
  Modal as RNModal,
  Platform,
  KeyboardAvoidingView,
  Keyboard,
  Pressable,
} from "react-native";
import { Text } from "react-native-paper";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../theme";

interface PickerSheetProps {
  visible: boolean;
  onDismiss: () => void;
  title: string;
  children: React.ReactNode;
}

export function PickerSheet({ visible, onDismiss, title, children }: PickerSheetProps) {
  const handleDismiss = () => {
    Keyboard.dismiss();
    onDismiss();
  };

  return (
    <RNModal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleDismiss}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        style={styles.modalRoot}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        {/* Backdrop */}
        <Pressable style={styles.backdrop} onPress={handleDismiss} />

        {/* Sheet */}
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>{title}</Text>
          {children}
        </View>
      </KeyboardAvoidingView>
    </RNModal>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  backdrop: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    paddingTop: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: Platform.OS === "ios" ? 34 : spacing.xl,
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
    marginBottom: spacing.md,
  },
  title: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.black,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
});

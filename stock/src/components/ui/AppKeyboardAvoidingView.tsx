import { PropsWithChildren } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, StyleProp, ViewStyle } from "react-native";

type AppKeyboardAvoidingViewProps = PropsWithChildren<{
  style?: StyleProp<ViewStyle>;
  keyboardVerticalOffset?: number;
}>;

export function AppKeyboardAvoidingView({
  children,
  style,
  keyboardVerticalOffset = 0,
}: AppKeyboardAvoidingViewProps) {
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={keyboardVerticalOffset}
      style={[styles.container, style]}
    >
      {children}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

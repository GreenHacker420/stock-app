import { PropsWithChildren } from "react";
import { Platform, StyleSheet, StyleProp, ViewStyle } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";

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
      automaticOffset
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

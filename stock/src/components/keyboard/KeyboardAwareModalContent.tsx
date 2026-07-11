import type { PropsWithChildren } from "react";
import { StyleSheet, type StyleProp, type ViewStyle } from "react-native";

import { KeyboardAwareScreen } from "./KeyboardAwareScreen";

type KeyboardAwareModalContentProps = PropsWithChildren<{
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  bottomOffset?: number;
}>;

export function KeyboardAwareModalContent({
  children,
  style,
  contentContainerStyle,
  bottomOffset,
}: KeyboardAwareModalContentProps) {
  return (
    <KeyboardAwareScreen
      style={[styles.container, style]}
      contentContainerStyle={contentContainerStyle}
      bottomOffset={bottomOffset}
      includeSafeAreaBottom
    >
      {children}
    </KeyboardAwareScreen>
  );
}

const styles = StyleSheet.create({ container: { flex: 1 } });


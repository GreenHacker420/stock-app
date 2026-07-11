import { ReactNode } from "react";
import { StyleProp, StyleSheet, ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ScreenScaffold } from "./ScreenScaffold";
import { spacing } from "../../theme";
import { KeyboardAwareScreen } from "../keyboard/KeyboardAwareScreen";

type ScrollScreenProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  showBack?: boolean;
  fallbackRoute?: string;
  contentContainerStyle?: StyleProp<ViewStyle>;
  bottomInset?: number;
};

export function ScrollScreen({
  title,
  subtitle,
  children,
  footer,
  showBack,
  fallbackRoute,
  contentContainerStyle,
  bottomInset = 0,
}: ScrollScreenProps) {
  const insets = useSafeAreaInsets();

  return (
    <ScreenScaffold title={title} subtitle={subtitle} showBack={showBack} fallbackRoute={fallbackRoute} footer={footer}>
      <KeyboardAwareScreen
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: spacing.xl + bottomInset + Math.max(insets.bottom, 0) },
          contentContainerStyle,
        ]}
      >
        {children}
      </KeyboardAwareScreen>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
});

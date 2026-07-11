import { ReactNode } from "react";
import { StyleProp, StyleSheet, ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ScreenScaffold } from "./ScreenScaffold";
import { KeyboardAwareScreen } from "../keyboard/KeyboardAwareScreen";
import { STICKY_FOOTER_MIN_HEIGHT } from "./StickyFooterActions";
import { spacing } from "../../theme";

type FormScreenProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  showBack?: boolean;
  fallbackRoute?: string;
  contentContainerStyle?: StyleProp<ViewStyle>;
};

export function FormScreen({
  title,
  subtitle,
  children,
  footer,
  showBack,
  fallbackRoute,
  contentContainerStyle,
}: FormScreenProps) {
  const insets = useSafeAreaInsets();

  return (
    <ScreenScaffold title={title} subtitle={subtitle} showBack={showBack} fallbackRoute={fallbackRoute}>
        <KeyboardAwareScreen
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.content,
            { paddingBottom: Math.max(insets.bottom, 0) + (footer ? STICKY_FOOTER_MIN_HEIGHT + spacing.xxl : spacing.xxl) },
            contentContainerStyle,
          ]}
          layoutMetrics={{ footerHeight: footer ? STICKY_FOOTER_MIN_HEIGHT : 0 }}
        >
          {children}
        </KeyboardAwareScreen>
        {footer}
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
});

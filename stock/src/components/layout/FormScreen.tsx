import { ReactNode } from "react";
import { ScrollView, StyleProp, StyleSheet, ViewStyle } from "react-native";

import { ScreenScaffold } from "./ScreenScaffold";
import { AppKeyboardAvoidingView } from "../ui/AppKeyboardAvoidingView";
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
  return (
    <ScreenScaffold title={title} subtitle={subtitle} showBack={showBack} fallbackRoute={fallbackRoute}>
      <AppKeyboardAvoidingView>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.content, footer ? styles.withFooter : undefined, contentContainerStyle]}
        >
          {children}
        </ScrollView>
        {footer}
      </AppKeyboardAvoidingView>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
  withFooter: {
    paddingBottom: STICKY_FOOTER_MIN_HEIGHT + spacing.xxl,
  },
});

import { ReactNode } from "react";
import { ScrollView, StyleProp, StyleSheet, ViewStyle } from "react-native";

import { ScreenScaffold } from "./ScreenScaffold";
import { spacing } from "../../theme";

type DetailScreenProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  showBack?: boolean;
  fallbackRoute?: string;
  contentContainerStyle?: StyleProp<ViewStyle>;
};

export function DetailScreen({ title, subtitle, children, footer, showBack, fallbackRoute, contentContainerStyle }: DetailScreenProps) {
  return (
    <ScreenScaffold title={title} subtitle={subtitle} showBack={showBack} fallbackRoute={fallbackRoute} footer={footer}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.content, contentContainerStyle]}>
        {children}
      </ScrollView>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
});

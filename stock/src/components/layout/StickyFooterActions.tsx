import { ReactNode } from "react";
import { StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "../ui/Button";
import { colors, spacing, shadow } from "../../theme";
import { triggerLightHaptic, triggerMediumHaptic } from "../../utils/haptics";

type FooterAction = {
  label: string;
  onPress?: () => void;
  variant?: "primary" | "secondary" | "danger" | "ghost" | "success";
  loading?: boolean;
  disabled?: boolean;
  icon?: ReactNode | string;
  haptic?: "none" | "light" | "medium";
};

type StickyFooterActionsProps = {
  primary?: FooterAction;
  secondary?: FooterAction;
  actions?: FooterAction[];
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

function withHaptic(action: FooterAction) {
  return () => {
    if (action.haptic === "medium") triggerMediumHaptic();
    if (action.haptic === "light") triggerLightHaptic();
    action.onPress?.();
  };
}

export function StickyFooterActions({ primary, secondary, actions, children, style }: StickyFooterActionsProps) {
  const insets = useSafeAreaInsets();
  const resolvedActions = actions ?? [secondary, primary].filter(Boolean) as FooterAction[];

  return (
    <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.md) }, style]}>
      {children}
      {resolvedActions.length > 0 ? (
        <View style={styles.row}>
          {resolvedActions.map((action) => (
            <Button
              key={action.label}
              label={action.label}
              onPress={withHaptic(action)}
              variant={action.variant}
              loading={action.loading}
              disabled={action.disabled}
              icon={action.icon}
              fullWidth
              style={styles.button}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

export const STICKY_FOOTER_MIN_HEIGHT = 88;

const styles = StyleSheet.create({
  footer: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    ...shadow.sm,
  },
  row: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  button: {
    flex: 1,
  },
});

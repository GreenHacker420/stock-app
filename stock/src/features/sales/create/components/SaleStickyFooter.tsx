import { useEffect, useState } from "react";
import { Keyboard, Platform, StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../../../theme";
import { Button } from "../../../../components/ui/Button";

interface SaleStickyFooterProps {
  count: number;
  total: number;
  onPress: () => void;
  label?: string;
  disabled?: boolean;
  loading?: boolean;
  onLayout?: (height: number) => void;
}

export function SaleStickyFooter({
  count,
  total,
  onPress,
  label = "Checkout →",
  disabled = false,
  loading = false,
  onLayout,
}: SaleStickyFooterProps) {
  const insets = useSafeAreaInsets();
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  useEffect(() => {
    const showSubscription = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      () => setIsKeyboardVisible(true)
    );
    const hideSubscription = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide",
      () => setIsKeyboardVisible(false)
    );

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  const handleLayout = (event: any) => {
    if (onLayout) {
      onLayout(event.nativeEvent.layout.height);
    }
  };

  const bottomPadding = isKeyboardVisible
    ? spacing.sm
    : insets.bottom > 0
    ? insets.bottom + spacing.sm
    : spacing.md;

  return (
    <View
      onLayout={handleLayout}
      style={[
        styles.footer,
        {
          paddingBottom: bottomPadding,
        },
      ]}
    >
      <View style={styles.content}>
        <View style={styles.totalInfo}>
          <Text style={styles.countText}>
            {count} {count === 1 ? "item" : "items"}
          </Text>
          <Text style={styles.totalText} numberOfLines={1}>
            ₹{total.toLocaleString("en-IN")}
          </Text>
        </View>

        <Button
          label={label}
          onPress={onPress}
          variant="success"
          disabled={disabled}
          loading={loading}
          style={styles.actionBtn}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.md,
    ...shadow.lg,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  totalInfo: {
    flex: 1,
  },
  countText: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    fontWeight: fontWeight.medium,
  },
  totalText: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.extrabold,
    color: colors.textPrimary,
  },
  actionBtn: {
    flex: 1.5,
    minHeight: 48,
  },
});

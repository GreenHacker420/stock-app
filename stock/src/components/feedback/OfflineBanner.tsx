import { StyleSheet, View } from "react-native";
import { Icon, Text } from "react-native-paper";

import { colors, fontSize, fontWeight, radius, spacing } from "../../theme";

type OfflineBannerProps = {
  visible: boolean;
  message?: string;
};

export function OfflineBanner({ visible, message = "Offline mode. Showing saved data." }: OfflineBannerProps) {
  if (!visible) return null;
  return (
    <View style={styles.banner}>
      <Icon source="wifi-off" size={16} color={colors.warning} />
      <Text style={styles.text} numberOfLines={2}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.warningLight,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  text: {
    flex: 1,
    color: colors.warning,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
  },
});

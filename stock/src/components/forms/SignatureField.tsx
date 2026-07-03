import { Pressable, StyleSheet, View } from "react-native";
import { Icon, Text } from "react-native-paper";

import { colors, fontSize, fontWeight, radius, spacing } from "../../theme";

type SignatureFieldProps = {
  captured?: boolean;
  required?: boolean;
  onPress: () => void;
};

export function SignatureField({ captured, required, onPress }: SignatureFieldProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.container, captured && styles.captured, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={captured ? "Signature captured" : "Capture signature"}
    >
      <Icon source={captured ? "check-circle-outline" : "draw"} size={22} color={captured ? colors.success : colors.primary} />
      <View style={styles.textWrap}>
        <Text style={styles.title}>{captured ? "Signature captured" : "Capture signature"}</Text>
        <Text style={styles.subtitle}>{required ? "Required for this transaction" : "Optional"}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
  },
  captured: {
    backgroundColor: colors.successLight,
    borderColor: colors.success + "55",
  },
  textWrap: { flex: 1, minWidth: 0 },
  title: { fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: colors.textPrimary },
  subtitle: { fontSize: fontSize.xs, color: colors.textSecondary },
  pressed: { opacity: 0.72 },
});

import { Pressable, StyleSheet, View } from "react-native";
import { Icon, Text } from "react-native-paper";

import { colors, fontSize, fontWeight, radius, shadow, spacing } from "../../../theme";

type ShopCardProps = {
  name: string;
  subtitle?: string;
  selected?: boolean;
  onPress?: () => void;
};

export function ShopCard({ name, subtitle, selected, onPress }: ShopCardProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [styles.card, selected && styles.selected, pressed && styles.pressed]}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={onPress ? `Select shop ${name}` : undefined}
    >
      <View style={styles.iconWrap}>
        <Icon source="storefront-outline" size={22} color={selected ? colors.primary : colors.textSecondary} />
      </View>
      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={1}>{name}</Text>
        {subtitle ? <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {selected ? <Icon source="check-circle" size={20} color={colors.primary} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surface, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, padding: spacing.md, ...shadow.sm },
  selected: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  pressed: { opacity: 0.72 },
  iconWrap: { width: 42, height: 42, borderRadius: radius.lg, backgroundColor: colors.surfaceOffset, alignItems: "center", justifyContent: "center" },
  body: { flex: 1, minWidth: 0 },
  name: { color: colors.textPrimary, fontSize: fontSize.md, fontWeight: fontWeight.bold },
  subtitle: { color: colors.textSecondary, fontSize: fontSize.xs, marginTop: 2 },
});

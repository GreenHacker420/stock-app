import { Pressable, StyleSheet, View } from "react-native";
import { Icon, Text } from "react-native-paper";
import { colors, spacing, radius, fontSize, fontWeight } from "../../../../theme";

interface SerialNumberActionProps {
  itemName: string;
  quantity: number;
  serialNumbers?: string[];
  onScanPress: () => void;
}

export function SerialNumberAction({
  itemName,
  quantity,
  serialNumbers = [],
  onScanPress,
}: SerialNumberActionProps) {
  const isComplete = serialNumbers.length === quantity;
  const missingCount = quantity - serialNumbers.length;

  return (
    <Pressable
      onPress={onScanPress}
      accessibilityRole="button"
      accessibilityLabel={
        isComplete
          ? `All serial numbers captured for ${itemName}. ${serialNumbers.join(", ")}`
          : `Tap to scan serial numbers for ${itemName}. ${missingCount} remaining.`
      }
      style={({ pressed }) => [
        styles.container,
        isComplete ? styles.containerSuccess : styles.containerWarning,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.contentRow}>
        <Icon
          source={isComplete ? "check-circle" : "alert-circle"}
          size={16}
          color={isComplete ? colors.success : colors.danger}
        />
        <Text
          style={[
            styles.text,
            isComplete ? styles.textSuccess : styles.textWarning,
          ]}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {isComplete
            ? `S/N: ${serialNumbers.join(", ")}`
            : `Tap to scan ${missingCount} serial(s)`}
        </Text>
        <Icon
          source="barcode-scan"
          size={16}
          color={isComplete ? colors.success : colors.danger}
        />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    marginTop: spacing.xs,
    alignSelf: "flex-start",
    maxWidth: "100%",
  },
  containerSuccess: {
    backgroundColor: colors.successLight,
  },
  containerWarning: {
    backgroundColor: colors.dangerLight,
  },
  contentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  text: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    flexShrink: 1,
  },
  textSuccess: {
    color: colors.success,
  },
  textWarning: {
    color: colors.danger,
  },
  pressed: {
    opacity: 0.7,
  },
});

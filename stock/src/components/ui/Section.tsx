import { PropsWithChildren } from "react";
import { View, StyleSheet, StyleProp, ViewStyle } from "react-native";
import { Text } from "react-native-paper";
import { colors, fontWeight } from "../../theme";

type SectionProps = PropsWithChildren<{
  title: string;
  action?: string;
  style?: StyleProp<ViewStyle>;
}>;

export function Section({ title, action, style, children }: SectionProps) {
  return (
    <View style={StyleSheet.flatten([styles.container, style])}>
      <View style={styles.header}>
        <Text variant="titleMedium" style={styles.title}>
          {title}
        </Text>
        {action ? (
          <Text variant="labelLarge" style={styles.action}>
            {action}
          </Text>
        ) : null}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    color: colors.textPrimary,
    fontWeight: fontWeight.extrabold,
  },
  action: {
    color: colors.primary,
    fontWeight: fontWeight.bold,
  },
});

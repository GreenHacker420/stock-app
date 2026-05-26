import { PropsWithChildren } from "react";
import { View } from "react-native";
import { Text } from "react-native-paper";

type SectionProps = PropsWithChildren<{
  title: string;
  action?: string;
}>;

export function Section({ title, action, children }: SectionProps) {
  return (
    <View className="gap-3">
      <View className="flex-row items-center justify-between">
        <Text variant="titleMedium" style={{ color: "#111827", fontWeight: "800" }}>
          {title}
        </Text>
        {action ? (
          <Text variant="labelLarge" style={{ color: "#1e40af", fontWeight: "700" }}>
            {action}
          </Text>
        ) : null}
      </View>
      {children}
    </View>
  );
}

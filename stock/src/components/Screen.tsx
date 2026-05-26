import { PropsWithChildren } from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type ScreenProps = PropsWithChildren<{
  scroll?: boolean;
}>;

export function Screen({ children, scroll = true }: ScreenProps) {
  const insets = useSafeAreaInsets();
  const content = (
    <View
      className="min-h-full gap-4 bg-background px-4 pb-6"
      style={{ paddingTop: Math.max(insets.top, 12) }}
    >
      {children}
    </View>
  );

  if (!scroll) {
    return <View className="flex-1 bg-background">{content}</View>;
  }

  return (
    <ScrollView className="flex-1 bg-background" contentContainerStyle={{ flexGrow: 1 }}>
      {content}
    </ScrollView>
  );
}

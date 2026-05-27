import { PropsWithChildren } from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type ScreenProps = PropsWithChildren<{
  scroll?: boolean;
  hasTab?: boolean;
}>;

export function Screen({ children, scroll = true, hasTab = false }: ScreenProps) {
  const insets = useSafeAreaInsets();
  const paddingBottom = hasTab ? 104 : Math.max(insets.bottom, 24);

  const content = (
    <View
      className="min-h-full gap-4 bg-background px-4"
      style={{
        paddingTop: Math.max(insets.top, 12),
        paddingBottom: paddingBottom,
      }}
    >
      {children}
    </View>
  );

  if (!scroll) {
    return <View className="flex-1 bg-background">{content}</View>;
  }

  return (
    <ScrollView className="flex-1 bg-background" contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
      {content}
    </ScrollView>
  );
}

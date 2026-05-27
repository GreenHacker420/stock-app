import { PropsWithChildren } from "react";
import { ScrollView, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRoute } from "@react-navigation/native";

type ScreenProps = PropsWithChildren<{
  scroll?: boolean;
  hasTab?: boolean;
}>;

export function Screen({ children, scroll = true, hasTab = false }: ScreenProps) {
  const insets = useSafeAreaInsets();
  const { height: vh, width: vw } = useWindowDimensions();
  let route: any = null;
  try {
    route = useRoute();
  } catch (e) {
    // fallback if outside navigation context
  }

  const isTabScreen = hasTab || (route && [
    "StaffHome",
    "StaffWork",
    "StaffPayments",
    "Notifications",
    "Profile",
    "OwnerDashboard",
    "OwnerRecords",
    "OwnerStock",
    "OwnerAlerts"
  ].includes(route.name));

  const tabBarHeight = 72;
  const tabBarBottom = Math.max(insets.bottom, 12);
  const spacing = 12;
  const paddingBottom = isTabScreen ? (tabBarHeight + tabBarBottom + spacing) : Math.max(insets.bottom, 16);

  return (
    <View className="flex-1 bg-background">
      {scroll ? (
        <ScrollView
          className="flex-1"
          contentContainerStyle={{
            flexGrow: 1,
            paddingTop: Math.max(insets.top, 12),
            paddingBottom: paddingBottom,
          }}
          showsVerticalScrollIndicator={false}
        >
          <View className="gap-4 px-4 flex-1">
            {children}
          </View>
        </ScrollView>
      ) : (
        <View
          className="flex-1 gap-4 px-4"
          style={{
            paddingTop: Math.max(insets.top, 12),
            paddingBottom: paddingBottom,
          }}
        >
          {children}
        </View>
      )}
    </View>
  );
}

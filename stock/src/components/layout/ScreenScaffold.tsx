import { ReactNode } from "react";
import { StyleProp, View, ViewStyle } from "react-native";

import { Screen } from "../Screen";
import { AppHeader } from "../ui/AppHeader";

type ScreenScaffoldProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  showBack?: boolean;
  onBack?: () => void;
  fallbackRoute?: string;
  hideAvatar?: boolean;
  edges?: ("top" | "bottom" | "left" | "right")[];
  contentStyle?: StyleProp<ViewStyle>;
};

export function ScreenScaffold({
  title,
  subtitle,
  children,
  footer,
  showBack,
  onBack,
  fallbackRoute,
  hideAvatar,
  edges = ["top", "left", "right"],
  contentStyle,
}: ScreenScaffoldProps) {
  return (
    <Screen edges={edges} scroll={false}>
      <AppHeader
        title={title}
        subtitle={subtitle}
        showBack={showBack}
        onBack={onBack}
        fallbackRoute={fallbackRoute}
        hideAvatar={hideAvatar}
      />
      <View style={[{ flex: 1 }, contentStyle]}>{children}</View>
      {footer}
    </Screen>
  );
}

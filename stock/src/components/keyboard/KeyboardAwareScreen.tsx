import { forwardRef } from "react";
import { Platform, type ScrollViewProps } from "react-native";
import {
  KeyboardAwareScrollView,
  type KeyboardAwareScrollViewRef,
} from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { KeyboardAwareMode, KeyboardLayoutMetrics } from "./keyboard.types";
import { getKeyboardBottomOffset } from "./keyboard.utils";

export interface KeyboardAwareScreenProps extends ScrollViewProps {
  bottomOffset?: number;
  extraKeyboardSpace?: number;
  mode?: KeyboardAwareMode;
  enabled?: boolean;
  layoutMetrics?: Omit<KeyboardLayoutMetrics, "safeAreaBottom">;
  includeSafeAreaBottom?: boolean;
}

export const KeyboardAwareScreen = forwardRef<
  KeyboardAwareScrollViewRef,
  KeyboardAwareScreenProps
>(function KeyboardAwareScreen(
  {
    bottomOffset,
    extraKeyboardSpace = 0,
    mode = "insets",
    enabled = true,
    layoutMetrics,
    includeSafeAreaBottom = false,
    keyboardShouldPersistTaps = "handled",
    keyboardDismissMode = Platform.OS === "ios" ? "interactive" : "on-drag",
    showsVerticalScrollIndicator = false,
    ...props
  },
  ref,
) {
  const insets = useSafeAreaInsets();
  const resolvedBottomOffset =
    bottomOffset ??
    getKeyboardBottomOffset({
      ...layoutMetrics,
      safeAreaBottom: includeSafeAreaBottom ? insets.bottom : 0,
    });

  return (
    <KeyboardAwareScrollView
      ref={ref}
      {...props}
      enabled={enabled}
      mode={mode}
      bottomOffset={resolvedBottomOffset}
      extraKeyboardSpace={extraKeyboardSpace}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      keyboardDismissMode={keyboardDismissMode}
      showsVerticalScrollIndicator={showsVerticalScrollIndicator}
    />
  );
});


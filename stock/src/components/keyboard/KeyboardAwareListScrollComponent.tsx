import { forwardRef } from "react";
import { Platform, type ScrollViewProps } from "react-native";
import {
  KeyboardAwareScrollView,
  type KeyboardAwareScrollViewRef,
} from "react-native-keyboard-controller";

import { DEFAULT_KEYBOARD_GAP } from "./keyboard.utils";

export const KeyboardAwareListScrollComponent = forwardRef<KeyboardAwareScrollViewRef, ScrollViewProps>(
  function KeyboardAwareListScrollComponent(props, ref) {
    return (
      <KeyboardAwareScrollView
        {...props}
        ref={ref}
        mode="insets"
        bottomOffset={DEFAULT_KEYBOARD_GAP}
        keyboardShouldPersistTaps={props.keyboardShouldPersistTaps ?? "handled"}
        keyboardDismissMode={
          props.keyboardDismissMode ?? (Platform.OS === "ios" ? "interactive" : "on-drag")
        }
      />
    );
  },
);

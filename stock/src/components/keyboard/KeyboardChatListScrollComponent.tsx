import { forwardRef, type ComponentRef } from "react";
import { Platform, type ScrollViewProps } from "react-native";
import { KeyboardChatScrollView } from "react-native-keyboard-controller";

type KeyboardChatScrollViewRef = ComponentRef<typeof KeyboardChatScrollView>;


export const KeyboardChatListScrollComponent = forwardRef<
  KeyboardChatScrollViewRef,
  ScrollViewProps
>(function KeyboardChatListScrollComponent(props, ref) {
  return (
    <KeyboardChatScrollView
      {...props}
      ref={ref}
      keyboardLiftBehavior="always"
      keyboardShouldPersistTaps={props.keyboardShouldPersistTaps ?? "handled"}
      keyboardDismissMode={
        props.keyboardDismissMode ?? (Platform.OS === "ios" ? "interactive" : "on-drag")
      }
    />
  );
});

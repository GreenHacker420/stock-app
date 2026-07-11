import type { PropsWithChildren } from "react";
import { KeyboardStickyView, type KeyboardStickyViewProps } from "react-native-keyboard-controller";

export function KeyboardAwareFooter({
  children,
  offset = { closed: 0, opened: 0 },
  ...props
}: PropsWithChildren<KeyboardStickyViewProps>) {
  return (
    <KeyboardStickyView {...props} offset={offset}>
      {children}
    </KeyboardStickyView>
  );
}


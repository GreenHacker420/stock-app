import { useEffect, useState } from "react";
import { ChatProfileSheet as ChatProfileSheetV2 } from "./ChatProfileSheetV2";

type Props = Parameters<typeof ChatProfileSheetV2>[0];

export function ChatProfileSheet(props: Props) {
  const [rendered, setRendered] = useState(props.visible);

  useEffect(() => {
    if (props.visible) {
      setRendered(true);
      return;
    }
    if (!rendered) return;
    const timer = setTimeout(() => setRendered(false), 260);
    return () => clearTimeout(timer);
  }, [props.visible, rendered]);

  if (!rendered && !props.visible) return null;
  return <ChatProfileSheetV2 {...props} />;
}

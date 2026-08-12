import { memo, useCallback } from "react";
import type { WaMessage } from "../../../api/whatsapp.api";
import { MessageContentRenderer as MessageContentRendererV2 } from "./MessageContentRendererV2";
import type { WhatsAppViewerImage } from "./WhatsAppImageViewer";

type Props = {
  message: WaMessage;
  onOpenImage?: (image: WhatsAppViewerImage) => void;
};

export const MessageContentRenderer = memo(function MessageContentRenderer({
  message,
  onOpenImage,
}: Props) {
  const handleOpenImage = useCallback(
    (image: WhatsAppViewerImage) => {
      onOpenImage?.({ ...image, messageId: message.id });
    },
    [message.id, onOpenImage],
  );

  return (
    <MessageContentRendererV2
      message={message}
      onOpenImage={onOpenImage ? handleOpenImage : undefined}
    />
  );
});

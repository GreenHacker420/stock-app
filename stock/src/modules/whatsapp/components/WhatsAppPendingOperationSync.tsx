import { useEffect, useRef } from "react";
import NetInfo from "@react-native-community/netinfo";
import { useQueryClient } from "@tanstack/react-query";
import {
  sendScopedWaMessage,
  uploadWaMedia,
  type WaOutboundMessage,
} from "../../../api/whatsapp.api";
import { useAuthStore } from "../../../auth/auth-store";
import { useWhatsAppScope } from "../whatsapp-scope";
import { whatsappDb } from "../services/whatsapp-db";
import {
  replaceWhatsAppMessage,
  type WhatsAppMessagePages,
} from "../whatsapp-query-cache";
import { removePersistedWhatsAppMedia } from "../services/whatsapp-media-files";

export function WhatsAppPendingOperationSync() {
  const token = useAuthStore((state) => state.token);
  const { shopId, integrationId } = useWhatsAppScope();
  const queryClient = useQueryClient();
  const flushing = useRef(false);

  useEffect(() => {
    const flush = async () => {
      if (!token || flushing.current) return;
      const network = await NetInfo.fetch();
      if (network.isConnected === false) return;
      flushing.current = true;
      try {
        const operations = await whatsappDb.getReadyOperations(shopId, integrationId);
        for (const operation of operations) {
          const attempt = operation.attempt + 1;
          await whatsappDb.updateOperation(operation.id, {
            operationState: "SUBMITTING",
            attempt,
            nextAttemptAt: Date.now(),
          });
          try {
            let outboundMessage = operation.payload.message;
            if (
              operation.operationType === "UPLOAD_MEDIA"
              && operation.payload.media
              && operation.payload.mediaMessage
            ) {
              const uploaded = await uploadWaMedia(
                token,
                integrationId,
                operation.payload.media,
              );
              const media = operation.payload.mediaMessage;
              outboundMessage = media.kind === "document"
                ? {
                    kind: "document",
                    assetId: uploaded.id,
                    caption: media.caption,
                    filename: media.filename || uploaded.fileName,
                  }
                : media.kind === "audio"
                  ? { kind: "audio", assetId: uploaded.id, voice: media.voice }
                  : {
                      kind: media.kind,
                      assetId: uploaded.id,
                      caption: media.caption,
                    };
            }
            if (!outboundMessage) {
              throw new Error("Pending WhatsApp operation has no outbound message");
            }
            const response = await sendScopedWaMessage(
              token,
              {
                shopId,
                integrationId,
                conversationId: operation.conversationId,
              },
              {
                clientMessageId: operation.clientMessageId,
                message: outboundMessage as WaOutboundMessage,
                replyToMessageId: operation.payload.replyToMessageId,
              },
            );
            await whatsappDb.upsertMessages(
              { shopId, integrationId, conversationId: operation.conversationId },
              [response.message],
            );
            await whatsappDb.deleteOperation(operation.id);
            if (operation.payload.media?.uri) {
              removePersistedWhatsAppMedia(operation.payload.media.uri);
            }
            queryClient.setQueryData<WhatsAppMessagePages>(
              ["whatsapp", "messages", shopId, integrationId, operation.conversationId],
              (data) => replaceWhatsAppMessage(
                data,
                operation.clientMessageId,
                response.message,
              ),
            );
            queryClient.invalidateQueries({
              queryKey: ["whatsapp", "messages", shopId, integrationId, operation.conversationId],
            });
            queryClient.invalidateQueries({
              queryKey: ["whatsapp", "conversations", shopId, integrationId],
            });
          } catch (error) {
            const terminal = attempt >= 6;
            const retryDelay = Math.min(2 ** attempt * 1_000, 60_000);
            await whatsappDb.updateOperation(operation.id, {
              operationState: terminal ? "TERMINALLY_FAILED" : "RETRY_SCHEDULED",
              attempt,
              nextAttemptAt: Date.now() + retryDelay,
              lastError: error instanceof Error ? error.message : "Message send failed",
            });
          }
        }
      } finally {
        flushing.current = false;
      }
    };

    void flush();
    return NetInfo.addEventListener((state) => {
      if (state.isConnected) void flush();
    });
  }, [integrationId, queryClient, shopId, token]);

  return null;
}

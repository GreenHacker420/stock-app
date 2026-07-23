import type { InfiniteData } from "@tanstack/react-query";
import type { WaMessage, WaPage } from "../../api/whatsapp.api";

export type WhatsAppMessagePages = InfiniteData<WaPage<WaMessage>, string | undefined>;

export function appendWhatsAppMessage(
  current: WhatsAppMessagePages | undefined,
  message: WaMessage,
): WhatsAppMessagePages {
  if (!current || current.pages.length === 0) {
    return {
      pageParams: [undefined],
      pages: [{ items: [message], nextCursor: null, snapshotCursor: null }],
    };
  }
  const matches = (item: WaMessage) => (
    item.id === message.id
    || Boolean(
      item.clientMessageId
      && message.clientMessageId
      && item.clientMessageId === message.clientMessageId,
    )
    || Boolean(
      item.metaMessageId
      && message.metaMessageId
      && item.metaMessageId === message.metaMessageId,
    )
  );
  if (current.pages.some((page) => page.items.some(matches))) {
    return {
      ...current,
      pages: current.pages.map((page) => ({
        ...page,
        items: page.items.map((item) => matches(item) ? { ...item, ...message } : item),
      })),
    };
  }
  const pages = [...current.pages];
  pages[0] = {
    ...pages[0],
    items: [...pages[0].items, message],
  };
  return { ...current, pages };
}

export function replaceWhatsAppMessage(
  current: WhatsAppMessagePages | undefined,
  clientMessageId: string,
  replacement: WaMessage | ((message: WaMessage) => WaMessage),
): WhatsAppMessagePages | undefined {
  if (!current) return current;
  return {
    ...current,
    pages: current.pages.map((page) => ({
      ...page,
      items: page.items.map((message) => {
        if (message.clientMessageId !== clientMessageId) return message;
        return typeof replacement === "function" ? replacement(message) : replacement;
      }),
    })),
  };
}

import { useEffect, useMemo, useState } from "react";
import NetInfo from "@react-native-community/netinfo";
import { useInfiniteQuery } from "@tanstack/react-query";
import {
  fetchScopedWaConversations,
  fetchScopedWaMessages,
  type WaConversation,
  type WaMessage,
  type WaPage,
} from "../../../api/whatsapp.api";
import { useAuthStore } from "../../../auth/auth-store";
import { queryKeys } from "../../../hooks/query-keys";
import { useWhatsAppScope } from "../whatsapp-scope";
import { whatsappDb } from "../services/whatsapp-db";
import { Image as ExpoImage } from "expo-image";

const EMPTY_PAGE = <T,>(items: T[]): WaPage<T> => ({
  items,
  nextCursor: null,
  snapshotCursor: null,
});

export function useWhatsAppConversations() {
  const token = useAuthStore((state) => state.token);
  const { shopId, integrationId, phoneNumberId } = useWhatsAppScope();
  const localCacheKey = `${shopId}:${integrationId}`;
  const [localCache, setLocalCache] = useState<{
    key: string;
    items: WaConversation[];
  } | null>(() => {
    const fastItems = whatsappDb.getFastConversations(shopId, integrationId);
    return fastItems.length > 0 ? { key: localCacheKey, items: fastItems } : null;
  });

  useEffect(() => {
    let cancelled = false;
    void whatsappDb.getConversations(shopId, integrationId)
      .then((items) => {
        if (!cancelled) setLocalCache({ key: localCacheKey, items });
      })
      .catch(() => {
        if (!cancelled) setLocalCache({ key: localCacheKey, items: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [integrationId, localCacheKey, shopId]);

  const query = useInfiniteQuery({
    queryKey: queryKeys.whatsapp.conversations(
      shopId,
      integrationId,
      phoneNumberId || "",
      {},
    ),
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      if (!token) throw new Error("Your session expired. Sign in again.");
      try {
        const page = await fetchScopedWaConversations(token, shopId, integrationId, {
          cursor: pageParam,
          limit: 50,
        });
        try {
          await whatsappDb.upsertConversations(
            { shopId, integrationId, phoneNumberId },
            page.items,
          );
          if (!pageParam) {
            await whatsappDb.setSyncState(shopId, integrationId, {
              conversationSnapshotCursor: page.snapshotCursor,
            });
          }
        } catch {
          // Local cache write is non-blocking fallback
        }
        return page;
      } catch (error) {
        if (pageParam) return EMPTY_PAGE<WaConversation>([]);
        const local = await whatsappDb.getConversations(shopId, integrationId);
        if (local.length > 0) return EMPTY_PAGE(local);
        throw error;
      }
    },
    getNextPageParam: (page) => page.nextCursor || undefined,
    staleTime: 20_000,
    maxPages: 6,
  });

  const conversations = useMemo(() => {
    const cachedItems =
      localCache?.key === localCacheKey ? localCache.items : [];
    const remoteItems = query.data?.pages.flatMap((page) => page.items);
    if (remoteItems?.length === 0 && cachedItems.length > 0 && query.isFetching) {
      return cachedItems;
    }
    return remoteItems ?? cachedItems;
  }, [localCache, localCacheKey, query.data, query.isFetching]);
  const localCacheHydrated = localCache?.key === localCacheKey;

  return {
    ...query,
    isLoading: query.isLoading && !localCacheHydrated,
    isPending: query.isPending && !localCacheHydrated,
    conversations,
  };
}


export function useWhatsAppMessages(conversationId: string) {
  const token = useAuthStore((state) => state.token);
  const { shopId, integrationId } = useWhatsAppScope();
  const localCacheKey = `${shopId}:${integrationId}:${conversationId}`;
  const [localCache, setLocalCache] = useState<{
    key: string;
    items: WaMessage[];
  } | null>(() => {
    const fastItems = whatsappDb.getFastMessages(shopId, integrationId, conversationId);
    return fastItems.length > 0 ? { key: localCacheKey, items: fastItems } : null;
  });

  useEffect(() => {
    let cancelled = false;
    const fastItems = whatsappDb.getFastMessages(shopId, integrationId, conversationId);
    if (fastItems.length > 0) {
      setLocalCache({ key: localCacheKey, items: fastItems });
    }
    void whatsappDb.getMessages(shopId, integrationId, conversationId)
      .then((items) => {
        if (!cancelled) setLocalCache({ key: localCacheKey, items });
      })
      .catch(() => {
        if (!cancelled) setLocalCache({ key: localCacheKey, items: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [conversationId, integrationId, localCacheKey, shopId]);

  const query = useInfiniteQuery({
    queryKey: queryKeys.whatsapp.messages(shopId, integrationId, conversationId),
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      if (!token) throw new Error("Your session expired. Sign in again.");
      try {
        const page = await fetchScopedWaMessages(token, shopId, integrationId, conversationId, {
          cursor: pageParam,
          limit: 75,
        });
        await whatsappDb.upsertMessages(
          { shopId, integrationId, conversationId },
          page.items,
        ).catch(() => undefined);
        return page;
      } catch (error) {
        if (pageParam) return EMPTY_PAGE<WaMessage>([]);
        const local = await whatsappDb.getMessages(shopId, integrationId, conversationId);
        if (local.length > 0) return EMPTY_PAGE(local);
        throw error;
      }
    },
    getNextPageParam: (page) => page.nextCursor || undefined,
    staleTime: 10_000,
    maxPages: 10,
  });

  const messages = useMemo(() => {
    const cachedItems =
      localCache?.key === localCacheKey ? localCache.items : [];
    if (!query.data) {
      return cachedItems;
    }
    const remoteItems = [...query.data.pages]
      .reverse()
      .flatMap((page) => page.items);
    if (remoteItems.length === 0 && cachedItems.length > 0 && query.isFetching) {
      return cachedItems;
    }
    return remoteItems;
  }, [localCache, localCacheKey, query.data, query.isFetching]);
  const localCacheHydrated = localCache?.key === localCacheKey;

  useEffect(() => {
    if (!messages || messages.length === 0) return;
    const imageUrls = messages
      .slice(-12)
      .filter((message) => message.type === "IMAGE")
      .map((message) => message.asset?.url)
      .filter((url): url is string => Boolean(url));
    if (imageUrls.length === 0) return;

    let cancelled = false;
    const prefetchImages = () => {
      if (cancelled) return;
      void ExpoImage.prefetch(imageUrls, "memory-disk").catch(() => undefined);
    };

    if (typeof requestIdleCallback === "function") {
      const idleTask = requestIdleCallback(prefetchImages, { timeout: 1_500 });
      return () => {
        cancelled = true;
        cancelIdleCallback(idleTask);
      };
    }

    const timer = setTimeout(prefetchImages, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [messages]);

  return {
    ...query,
    isLoading: query.isLoading && !localCacheHydrated,
    isPending: query.isPending && !localCacheHydrated,
    messages,
  };
}

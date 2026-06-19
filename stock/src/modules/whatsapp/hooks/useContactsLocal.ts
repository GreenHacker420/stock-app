import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { contactsDb, LocalContact } from "../services/contactsDb";

export interface ContactsQueryParams {
  searchQuery: string;
  syncFilter: "ALL" | "UNSYNCED" | "SYNCED";
  linkFilter: "ALL" | "LINKED" | "UNLINKED";
  tagFilter: "ALL" | "REGULAR" | "BUSINESS" | "NONE";
  customerPhonesStr: string;
}

const LIMIT = 100;

/**
 * Hook for local database contacts with infinite scrolling pagination.
 */
export function useContactsLocalQuery(params: ContactsQueryParams) {
  return useInfiniteQuery({
    queryKey: ["contacts-local", params],
    queryFn: async ({ pageParam = 0 }) => {
      return contactsDb.getContacts({
        searchQuery: params.searchQuery,
        syncFilter: params.syncFilter,
        linkFilter: params.linkFilter,
        tagFilter: params.tagFilter,
        customerPhonesStr: params.customerPhonesStr,
        limit: LIMIT,
        offset: pageParam * LIMIT,
      });
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      // If we got exactly the limit size, there's likely another page.
      return lastPage.length === LIMIT ? allPages.length : undefined;
    },
  });
}

/**
 * Hook for local database filtered contact IDs (for Select All bulk action).
 */
export function useContactsFilteredIdsQuery(params: Omit<ContactsQueryParams, "">) {
  return useQuery({
    queryKey: ["contacts-filtered-ids", params],
    queryFn: async () => {
      return contactsDb.getFilteredContactIds({
        searchQuery: params.searchQuery,
        syncFilter: params.syncFilter,
        linkFilter: params.linkFilter,
        tagFilter: params.tagFilter,
        customerPhonesStr: params.customerPhonesStr,
      });
    },
  });
}

/**
 * Hook for contact statistics.
 */
export function useContactsStatsQuery(customerPhonesStr: string) {
  return useQuery({
    queryKey: ["contacts-stats", customerPhonesStr],
    queryFn: async () => {
      return contactsDb.getContactStats(customerPhonesStr);
    },
  });
}

/**
 * Hook to update contact tag (e.g. REGULAR, BUSINESS, NONE) with optimistic UI updates.
 */
export function useUpdateContactTagMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, tag }: { id: string; tag: "REGULAR" | "BUSINESS" | "NONE" }) => {
      await contactsDb.updateTag(id, tag);
    },
    onMutate: async ({ id, tag }) => {
      // Cancel outgoing refetches so they don't overwrite our optimistic update
      await queryClient.cancelQueries({ queryKey: ["contacts-local"] });
      await queryClient.cancelQueries({ queryKey: ["contacts-stats"] });

      const previousLocal = queryClient.getQueryData(["contacts-local"]);

      // Optimistically update the infinite query cache
      queryClient.setQueriesData({ queryKey: ["contacts-local"] }, (old: any) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page: LocalContact[]) =>
            page.map((contact) =>
              contact.id === id
                ? { ...contact, tag, syncState: "MUTATED" as const, updatedAt: Date.now() }
                : contact
            )
          ),
        };
      });

      return { previousLocal };
    },
    onError: (err, variables, context) => {
      if (context?.previousLocal) {
        queryClient.setQueriesData({ queryKey: ["contacts-local"] }, context.previousLocal);
      }
    },
    onSettled: () => {
      // Refetch to sync state
      queryClient.invalidateQueries({ queryKey: ["contacts-local"] });
      queryClient.invalidateQueries({ queryKey: ["contacts-stats"] });
    },
  });
}

/**
 * Hook to link a customer with optimistic updates.
 */
export function useLinkCustomerMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, customerId }: { id: string; customerId: string | null }) => {
      await contactsDb.linkCustomer(id, customerId);
    },
    onMutate: async ({ id, customerId }) => {
      await queryClient.cancelQueries({ queryKey: ["contacts-local"] });
      await queryClient.cancelQueries({ queryKey: ["contacts-stats"] });

      const previousLocal = queryClient.getQueryData(["contacts-local"]);

      queryClient.setQueriesData({ queryKey: ["contacts-local"] }, (old: any) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page: LocalContact[]) =>
            page.map((contact) =>
              contact.id === id
                ? { ...contact, customerId, syncState: "MUTATED" as const, updatedAt: Date.now() }
                : contact
            )
          ),
        };
      });

      return { previousLocal };
    },
    onError: (err, variables, context) => {
      if (context?.previousLocal) {
        queryClient.setQueriesData({ queryKey: ["contacts-local"] }, context.previousLocal);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["contacts-local"] });
      queryClient.invalidateQueries({ queryKey: ["contacts-stats"] });
    },
  });
}

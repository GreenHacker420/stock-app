import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createSaleApi, ApiError } from "@/lib/api/client";
import { queryKeys } from "@/lib/query/query-keys";
import type { CreateSalePayload, CreatedSale } from "../lib/sale-types";

interface CreateSaleMutationOptions {
  token: string | null;
  activeShopId: string | null;
  idempotencyKey: string;
  onSuccess?: (sale: CreatedSale) => void;
  onError?: (error: ApiError) => void;
}

export function useCreateSaleMutation({
  token,
  activeShopId,
  idempotencyKey,
  onSuccess,
  onError,
}: CreateSaleMutationOptions) {
  const queryClient = useQueryClient();

  return useMutation<CreatedSale, ApiError, CreateSalePayload>({
    mutationKey: ["sale", "create", activeShopId],
    mutationFn: (payload) => {
      if (!token) throw new ApiError("Not authenticated", 401);
      return createSaleApi(token, payload, idempotencyKey);
    },

    onSuccess: (sale) => {
      // 1. Write returned sale to detail cache (server-authoritative)
      queryClient.setQueryData(queryKeys.sales.detail(sale.id), sale);

      // 2. Invalidate the sales register for the active shop
      queryClient.invalidateQueries({ queryKey: ["sales", activeShopId ?? ""] });

      // 3. Invalidate dashboard snapshot (owner and staff)
      queryClient.invalidateQueries({ queryKey: ["dashboard", "owner"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard", "staff"] });

      // 4. Invalidate owner analytics
      queryClient.invalidateQueries({ queryKey: ["dashboard", "owner-analytics"] });

      // 5. Invalidate item stock for items in the sale
      if (sale.items && Array.isArray(sale.items)) {
        const uniqueItemIds = [...new Set(sale.items.map((i) => i.itemId))];
        for (const itemId of uniqueItemIds) {
          queryClient.invalidateQueries({ queryKey: queryKeys.items.stock(itemId) });
        }
        // Invalidate item list (stock column refreshes)
        queryClient.invalidateQueries({ queryKey: ["items", activeShopId ?? ""] });
      }

      // 6. Invalidate customer summary/outstanding if a specific customer was involved
      if (sale.customerId && !sale.isWalkin) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.customers.detail(sale.customerId),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.customers.outstanding(sale.customerId),
        });
      }

      // 7. Invalidate payment register if payments were included
      if (sale.payments && sale.payments.length > 0 && activeShopId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.payments.list(activeShopId),
        });
      }

      onSuccess?.(sale);
    },

    onError: (error) => {
      onError?.(error);
    },

    // No automatic retries — let the user retry with same idempotency key
    retry: false,
  });
}

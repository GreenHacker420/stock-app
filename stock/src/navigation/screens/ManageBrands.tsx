import React, { useCallback } from "react";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { RootStackParamList } from "../index";
import { TaxonomyManagementScreen } from "../../components/inventory/taxonomy/TaxonomyManagementScreen";
import { TaxonomyCopy, TaxonomyIcons } from "../../components/inventory/taxonomy/taxonomy.types";
import {
  useBrandsQuery,
  useCreateBrandMutation,
  useUpdateBrandMutation,
  useDeleteBrandMutation,
} from "../../hooks/useItems";

const COPY: TaxonomyCopy = {
  singular: "Brand",
  plural: "Brands",
  screenTitle: "Manage Brands",
  screenSubtitle: "Organise products by manufacturer or brand",
  searchPlaceholder: "Search brands...",
  emptyTitle: "No brands yet",
  emptySubtitle: "Add your first brand to start grouping products.",
  noMatchesTitle: "No matching brands",
  noMatchesSubtitle: "Try adjusting your search terms.",
  infoText: "Brands help you filter inventory by manufacturer. A brand can only be removed when it is no longer referenced by products.",
  createErrorFallback: "Could not create brand. A brand with this name may already exist.",
  updateErrorFallback: "Could not update brand. A brand with this name may already exist.",
  deleteErrorFallback: "Could not delete brand. This brand still has active items assigned to it.",
};

const ICONS: TaxonomyIcons = {
  row: "certificate-outline",
  empty: "certificate-outline",
  add: "plus",
};

export function ManageBrands() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const brandsQuery = useBrandsQuery();
  const createMutation = useCreateBrandMutation();
  const updateMutation = useUpdateBrandMutation();
  const deleteMutation = useDeleteBrandMutation();

  const handleCreate = useCallback(
    async (name: string) => {
      await createMutation.mutateAsync(name);
    },
    [createMutation]
  );

  const handleUpdate = useCallback(
    async (brand: any, name: string) => {
      await updateMutation.mutateAsync({ id: brand.id, name });
    },
    [updateMutation]
  );

  const handleDelete = useCallback(
    async (brand: any) => {
      await deleteMutation.mutateAsync(brand.id);
    },
    [deleteMutation]
  );

  const handleOpen = useCallback(
    (brand: any) => {
      navigation.navigate("ItemList", { brandId: brand.id, categoryId: undefined });
    },
    [navigation]
  );

  const queryState = {
    isLoading: brandsQuery.isLoading,
    isFetching: brandsQuery.isFetching,
    isError: brandsQuery.isError,
    error: brandsQuery.error,
    onRetry: () => brandsQuery.refetch(),
    onRefresh: () => brandsQuery.refetch(),
  };

  return (
    <TaxonomyManagementScreen
      items={brandsQuery.data ?? []}
      copy={COPY}
      icons={ICONS}
      queryState={queryState}
      onCreate={handleCreate}
      onUpdate={handleUpdate}
      onDelete={handleDelete}
      onOpen={handleOpen}
    />
  );
}

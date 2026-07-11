import React, { useCallback } from "react";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { RootStackParamList } from "../index";
import { TaxonomyManagementScreen } from "../../components/inventory/taxonomy/TaxonomyManagementScreen";
import { TaxonomyCopy, TaxonomyIcons } from "../../components/inventory/taxonomy/taxonomy.types";
import {
  useCategoriesQuery,
  useCreateCategoryMutation,
  useUpdateCategoryMutation,
  useDeleteCategoryMutation,
} from "../../hooks/useItems";

const COPY: TaxonomyCopy = {
  singular: "Category",
  plural: "Categories",
  screenTitle: "Manage Categories",
  screenSubtitle: "Organise your product catalogue",
  searchPlaceholder: "Search categories...",
  emptyTitle: "No categories yet",
  emptySubtitle: "Add your first category to start organising products.",
  noMatchesTitle: "No matching categories",
  noMatchesSubtitle: "Try adjusting your search terms.",
  infoText: "Categories help organise products and improve inventory filtering. A category can only be removed when it is no longer referenced by products.",
  createErrorFallback: "Could not create category. A category with this name may already exist.",
  updateErrorFallback: "Could not update category. A category with this name may already exist.",
  deleteErrorFallback: "Could not delete category. This category still has active items assigned to it.",
};

const ICONS: TaxonomyIcons = {
  row: "tag-outline",
  empty: "tag-outline",
  add: "plus",
};

export function ManageCategories() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const categoriesQuery = useCategoriesQuery();
  const createMutation = useCreateCategoryMutation();
  const updateMutation = useUpdateCategoryMutation();
  const deleteMutation = useDeleteCategoryMutation();

  const handleCreate = useCallback(
    async (name: string) => {
      await createMutation.mutateAsync(name);
    },
    [createMutation]
  );

  const handleUpdate = useCallback(
    async (category: any, name: string) => {
      await updateMutation.mutateAsync({ id: category.id, name });
    },
    [updateMutation]
  );

  const handleDelete = useCallback(
    async (category: any) => {
      await deleteMutation.mutateAsync(category.id);
    },
    [deleteMutation]
  );

  const handleOpen = useCallback(
    (category: any) => {
      navigation.navigate("ItemList", { categoryId: category.id, brandId: undefined });
    },
    [navigation]
  );

  const queryState = {
    isLoading: categoriesQuery.isLoading,
    isFetching: categoriesQuery.isFetching,
    isError: categoriesQuery.isError,
    error: categoriesQuery.error,
    onRetry: () => categoriesQuery.refetch(),
    onRefresh: () => categoriesQuery.refetch(),
  };

  return (
    <TaxonomyManagementScreen
      items={categoriesQuery.data ?? []}
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

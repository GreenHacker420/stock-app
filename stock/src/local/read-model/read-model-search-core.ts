import type { Customer, ItemCategory } from "../../api/client";
import type { CategoryReadModel, CustomerReadModel, ItemCatalogReadModel } from "./read-model-types";

function textIncludes(value: string | null | undefined, query: string) {
  return Boolean(value?.toLowerCase().includes(query));
}

export function toCustomer(readModel: CustomerReadModel): Customer {
  return {
    id: readModel.id,
    name: readModel.name,
    shopId: readModel.shopId,
    type: readModel.type as Customer["type"],
    phone: readModel.phone,
    address: readModel.address,
    city: readModel.city,
    gstin: readModel.gstin,
    contactPerson: readModel.contactPerson,
    creditLimit: readModel.creditLimit,
    outstandingAmount: readModel.outstandingAmount ?? undefined,
    status: "ACTIVE",
  } as Customer;
}

export function toCategory(readModel: CategoryReadModel): ItemCategory {
  return {
    id: readModel.id,
    name: readModel.name,
  };
}

export function selectCustomers(
  customers: CustomerReadModel[],
  options: { search?: string; includeWalkin?: boolean; limit?: number } = {},
) {
  const normalizedSearch = options.search?.trim().toLowerCase() ?? "";
  const filtered = customers
    .filter((customer) => (options.includeWalkin ? true : customer.type !== "WALK_IN"))
    .filter((customer) => {
      if (!normalizedSearch) return true;
      return (
        textIncludes(customer.name, normalizedSearch) ||
        textIncludes(customer.phone, normalizedSearch) ||
        textIncludes(customer.city, normalizedSearch) ||
        textIncludes(customer.gstin, normalizedSearch) ||
        textIncludes(customer.contactPerson, normalizedSearch)
      );
    })
    .map(toCustomer);

  return typeof options.limit === "number" ? filtered.slice(0, options.limit) : filtered;
}

export function selectCategories(categories: CategoryReadModel[]) {
  return categories.map(toCategory);
}

export function selectItemCatalog(
  items: ItemCatalogReadModel[],
  options: { search?: string; categoryId?: string; limit?: number } = {},
) {
  const normalizedSearch = options.search?.trim().toLowerCase() ?? "";
  const filtered = items
    .filter((item) => {
      if (!options.categoryId) return true;
      if (options.categoryId === "__uncat__") return !item.categoryId;
      return item.categoryId === options.categoryId;
    })
    .filter((item) => {
      if (!normalizedSearch) return true;
      return (
        textIncludes(item.name, normalizedSearch) ||
        textIncludes(item.sku, normalizedSearch) ||
        textIncludes(item.categoryName, normalizedSearch)
      );
    });

  return typeof options.limit === "number" ? filtered.slice(0, options.limit) : filtered;
}

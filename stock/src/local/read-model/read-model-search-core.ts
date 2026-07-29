import type { Customer, ItemCategory } from "../../api/client";
import type { CategoryReadModel, CustomerReadModel, ItemCatalogReadModel } from "./read-model-types";
import { smartMatchSearch, smartItemSearch } from "../../utils/search";

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
  const query = options.search?.trim() ?? "";
  const filtered = customers
    .filter((customer) => (options.includeWalkin ? true : customer.type !== "WALK_IN"))
    .filter((customer) => {
      if (!query) return true;
      return (
        smartMatchSearch(customer.name, query) ||
        smartMatchSearch(customer.phone, query) ||
        smartMatchSearch(customer.city, query) ||
        smartMatchSearch(customer.gstin, query) ||
        smartMatchSearch(customer.contactPerson, query)
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
  const query = options.search?.trim() ?? "";
  const filtered = items
    .filter((item) => {
      if (!options.categoryId) return true;
      if (options.categoryId === "__uncat__") return !item.categoryId;
      return item.categoryId === options.categoryId;
    })
    .filter((item) => {
      if (!query) return true;
      return smartItemSearch(item, query);
    });

  return typeof options.limit === "number" ? filtered.slice(0, options.limit) : filtered;
}

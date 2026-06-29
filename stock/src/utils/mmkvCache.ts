import { Customer, fetchCustomers, fetchItems, Item } from "../api/client";
import { mmkvStorage } from "../auth/mmkv-storage";

const CACHE_VERSION = 1;
const PRODUCT_PAGE_SIZE = 500;
const CUSTOMER_PAGE_SIZE = 200;
const MAX_FILTER_RESULTS = 50;

type CacheMeta = {
  schemaVersion: number;
  productsCount: number;
  customersCount: number;
  updatedAt: string;
};

type CachedProduct = Pick<
  Item,
  | "id"
  | "name"
  | "sku"
  | "unit"
  | "defaultSellingPrice"
  | "minimumAllowedPrice"
  | "purchasePrice"
  | "mrp"
  | "minimumStock"
  | "status"
  | "category"
  | "availableStock"
  | "currentStock"
>;

type CachedCustomer = Pick<
  Customer,
  | "id"
  | "name"
  | "phone"
  | "address"
  | "city"
  | "gstin"
  | "creditLimit"
  | "outstandingAmount"
  | "status"
  | "type"
>;

const productMemory = new Map<string, CachedProduct[]>();
const customerMemory = new Map<string, CachedCustomer[]>();

function productsKey(shopId: string) {
  return `billing_cache:products:${shopId}`;
}

function customersKey(shopId: string) {
  return `billing_cache:customers:${shopId}`;
}

function metaKey(shopId: string) {
  return `billing_cache:meta:${shopId}`;
}

function parseList<T>(value: string | null): T[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function getSyncItem(key: string): string | null {
  const value = mmkvStorage.getItem(key);
  return typeof value === "string" ? value : null;
}

function normalize(value?: string | number | null) {
  return String(value ?? "").trim().toLowerCase();
}

function compactProduct(item: Item): CachedProduct {
  return {
    id: item.id,
    name: item.name,
    sku: item.sku,
    unit: item.unit,
    defaultSellingPrice: item.defaultSellingPrice,
    minimumAllowedPrice: item.minimumAllowedPrice,
    purchasePrice: item.purchasePrice,
    mrp: item.mrp,
    minimumStock: item.minimumStock,
    status: item.status,
    category: item.category,
    availableStock: item.availableStock,
    currentStock: item.currentStock,
  };
}

function compactCustomer(customer: Customer): CachedCustomer {
  return {
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    address: customer.address,
    city: customer.city,
    gstin: customer.gstin,
    creditLimit: customer.creditLimit,
    outstandingAmount: customer.outstandingAmount,
    status: customer.status,
    type: customer.type,
  };
}

function setMeta(shopId: string, productsCount: number, customersCount: number) {
  const meta: CacheMeta = {
    schemaVersion: CACHE_VERSION,
    productsCount,
    customersCount,
    updatedAt: new Date().toISOString(),
  };
  mmkvStorage.setItem(metaKey(shopId), JSON.stringify(meta));
}

export function getCachedProducts(shopId: string): Item[] {
  if (!shopId) return [];
  const memory = productMemory.get(shopId);
  if (memory) return memory as Item[];
  const products = parseList<CachedProduct>(getSyncItem(productsKey(shopId)));
  productMemory.set(shopId, products);
  return products as Item[];
}

export function setCachedProducts(shopId: string, products: Item[]) {
  if (!shopId) return;
  const compact = products.map(compactProduct);
  productMemory.set(shopId, compact);
  mmkvStorage.setItem(productsKey(shopId), JSON.stringify(compact));
  const customers = customerMemory.get(shopId) ?? parseList<CachedCustomer>(getSyncItem(customersKey(shopId)));
  setMeta(shopId, compact.length, customers.length);
}

export function getCachedCustomers(shopId: string): Customer[] {
  if (!shopId) return [];
  const memory = customerMemory.get(shopId);
  if (memory) return memory as Customer[];
  const customers = parseList<CachedCustomer>(getSyncItem(customersKey(shopId)));
  customerMemory.set(shopId, customers);
  return customers as Customer[];
}

export function setCachedCustomers(shopId: string, customers: Customer[]) {
  if (!shopId) return;
  const compact = customers.map(compactCustomer);
  customerMemory.set(shopId, compact);
  mmkvStorage.setItem(customersKey(shopId), JSON.stringify(compact));
  const products = productMemory.get(shopId) ?? parseList<CachedProduct>(getSyncItem(productsKey(shopId)));
  setMeta(shopId, products.length, compact.length);
}

export function filterCachedProducts(shopId: string, search = "", limit = MAX_FILTER_RESULTS): Item[] {
  const products = getCachedProducts(shopId);
  const query = normalize(search);
  if (!query) return products.slice(0, limit);
  return products
    .filter((item) => {
      const categoryName = typeof item.category === "object" ? item.category?.name : "";
      return (
        normalize(item.name).includes(query) ||
        normalize(item.sku).includes(query) ||
        normalize(categoryName).includes(query)
      );
    })
    .slice(0, limit);
}

export function filterCachedCustomers(shopId: string, search = "", limit = MAX_FILTER_RESULTS): Customer[] {
  const customers = getCachedCustomers(shopId);
  const query = normalize(search);
  const filtered = query
    ? customers.filter((customer) =>
        normalize(customer.name).includes(query) ||
        normalize(customer.phone).includes(query) ||
        normalize(customer.city).includes(query) ||
        normalize(customer.gstin).includes(query),
      )
    : customers;
  return filtered.slice(0, limit);
}

export async function warmOfflineCache(shopId: string, token: string) {
  if (!shopId || !token) return;

  const products: Item[] = [];
  let productPage = 1;
  for (;;) {
    const response = await fetchItems(token, shopId, { page: productPage, limit: PRODUCT_PAGE_SIZE });
    products.push(...response.items);
    if (!response.hasMore || response.items.length === 0) break;
    productPage += 1;
  }

  const customers: Customer[] = [];
  let customerPage = 1;
  for (;;) {
    const page = await fetchCustomers(token, shopId, true, { page: customerPage, limit: CUSTOMER_PAGE_SIZE });
    customers.push(...page);
    if (page.length < CUSTOMER_PAGE_SIZE) break;
    customerPage += 1;
  }

  setCachedProducts(shopId, products);
  setCachedCustomers(shopId, customers);
  setMeta(shopId, products.length, customers.length);
}

export function clearBillingCache(shopId: string) {
  productMemory.delete(shopId);
  customerMemory.delete(shopId);
  mmkvStorage.removeItem(productsKey(shopId));
  mmkvStorage.removeItem(customersKey(shopId));
  mmkvStorage.removeItem(metaKey(shopId));
}

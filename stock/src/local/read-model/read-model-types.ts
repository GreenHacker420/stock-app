export type CustomerReadModel = {
  id: string;
  shopId: string;
  name: string;
  type: "REGULAR" | "WALK_IN" | string;
  phone: string | null;
  address: string | null;
  city: string | null;
  gstin: string | null;
  contactPerson: string | null;
  creditLimit: string | null;
  outstandingAmount: string | null;
  updatedAt: string;
};

export type ItemCatalogReadModel = {
  id: string;
  shopId: string;
  name: string;
  sku: string | null;
  imageUrl: string | null;
  unit: string;
  defaultSellingPrice: string;
  minimumAllowedPrice: string | null;
  mrp: string | null;
  minimumStock: string;
  categoryId: string | null;
  categoryName: string | null;
  updatedAt: string;
};

export type CategoryReadModel = {
  id: string;
  name: string;
  updatedAt: string;
};

export type MobileReadModelBootstrap = {
  schemaVersion: 1;
  shopId: string;
  generatedAt: string;
  baseCursor: string | null;
  complete: true;
  customers: CustomerReadModel[];
  items: ItemCatalogReadModel[];
  categories: CategoryReadModel[];
};

export type ReadModelDomain = "customers" | "items" | "categories";

export type ReadModelDomainRecords = {
  customers: CustomerReadModel[];
  items: ItemCatalogReadModel[];
  categories: CategoryReadModel[];
};

export type MobileReadModelDomainRepair<T extends ReadModelDomain = ReadModelDomain> = {
  schemaVersion: 1;
  shopId: string;
  complete: true;
  records: ReadModelDomainRecords[T];
};

export type LocalReadModelEnvelope = {
  schemaVersion: 1;
  shopId: string;
  serverGeneratedAt: string;
  writtenAt: string;
  baseCursor: string | null;
  complete: true;
  customers: CustomerReadModel[];
  items: ItemCatalogReadModel[];
  categories: CategoryReadModel[];
};

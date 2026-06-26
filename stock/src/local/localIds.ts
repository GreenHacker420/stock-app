import * as Crypto from "expo-crypto";

type LocalPrefix =
  | "local_customer"
  | "local_item"
  | "local_sale"
  | "local_sale_item"
  | "local_payment"
  | "mutation";

function uuid() {
  return Crypto.randomUUID();
}

function localId(prefix: LocalPrefix) {
  return `${prefix}_${uuid()}`;
}

export function newLocalCustomerId() {
  return localId("local_customer");
}

export function newLocalItemId() {
  return localId("local_item");
}

export function newLocalSaleId() {
  return localId("local_sale");
}

export function newLocalSaleItemId() {
  return localId("local_sale_item");
}

export function newLocalPaymentId() {
  return localId("local_payment");
}

export function newMutationId() {
  return localId("mutation");
}

export function newIdempotencyKey(entityType: string, localEntityId: string) {
  return `${entityType.toLowerCase()}_${localEntityId}_${uuid()}`;
}

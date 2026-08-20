import { randomUUID } from "expo-crypto";

export function newIdempotencyKey(scope: string) {
  return `${scope.toLowerCase()}_${randomUUID()}`;
}

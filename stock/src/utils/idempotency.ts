import * as Crypto from "expo-crypto";

export function newIdempotencyKey(scope: string) {
  return `${scope.toLowerCase()}_${Crypto.randomUUID()}`;
}

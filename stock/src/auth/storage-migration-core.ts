export const DATA_HARDENING_MIGRATION_MARKER = "storage-migration:data-hardening:v1";

export function getUnsafeLegacyStorageKeys(keys: string[]): string[] {
  return keys.filter(
    (key) =>
      key === "react-query-cache" ||
      key.startsWith("billing_cache:customers:") ||
      key.startsWith("billing_cache:products:") ||
      key.startsWith("billing_cache:meta:"),
  );
}

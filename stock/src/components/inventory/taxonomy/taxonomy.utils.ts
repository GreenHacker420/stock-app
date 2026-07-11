export function normalizeTaxonomyName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function getTaxonomyComparisonKey(value: string): string {
  return normalizeTaxonomyName(value).toLocaleLowerCase();
}

export function getApiErrorMessage(error: any, fallbackMessage: string): string {
  return error?.message || error?.error || fallbackMessage;
}

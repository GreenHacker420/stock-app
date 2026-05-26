const padCounter = (count) => String(count).padStart(3, "0");

export function formatRecordNumber(prefix, date, count) {
  const value = new Date(date);
  const yyyy = value.getFullYear();
  const mm = String(value.getMonth() + 1).padStart(2, "0");
  const dd = String(value.getDate()).padStart(2, "0");
  return `${prefix}-${yyyy}${mm}${dd}-${padCounter(count)}`;
}

export function formatINR(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

export function formatPeriodLabel(period: string, granularity: string): string {
  if (!period) return "";
  if (granularity === "MONTH") {
    const [yyyy, mm] = period.split("-");
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const idx = parseInt(mm, 10) - 1;
    return `${monthNames[idx] || mm} ${yyyy}`;
  }
  if (granularity === "WEEK") {
    return `Wk of ${period.slice(5)}`;
  }
  // DAY format YYYY-MM-DD -> DD MMM
  const parts = period.split("-");
  if (parts.length === 3) {
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const idx = parseInt(parts[1], 10) - 1;
    return `${parts[2]} ${monthNames[idx] || parts[1]}`;
  }
  return period;
}

export function getPresetRange(preset: "7D" | "30D" | "90D"): { dateFrom: string; dateTo: string } {
  const today = new Date();
  const dateTo = today.toISOString().split("T")[0];

  const pastDate = new Date(today);
  if (preset === "7D") pastDate.setDate(today.getDate() - 7);
  else if (preset === "30D") pastDate.setDate(today.getDate() - 30);
  else if (preset === "90D") pastDate.setDate(today.getDate() - 90);

  const dateFrom = pastDate.toISOString().split("T")[0];
  return { dateFrom, dateTo };
}

export interface SpatialItem { id: string; x: number; y: number; }
export function nearestSpatial(items: readonly SpatialItem[], activeId: string, direction: "up" | "down" | "left" | "right"): SpatialItem | undefined {
  const active = items.find((item) => item.id === activeId); if (!active) return items[0];
  return items.filter((item) => item.id !== activeId).filter((item) => direction === "up" ? item.y < active.y : direction === "down" ? item.y > active.y : direction === "left" ? item.x < active.x : item.x > active.x).sort((a, b) => Math.hypot(a.x-active.x,a.y-active.y)-Math.hypot(b.x-active.x,b.y-active.y))[0];
}

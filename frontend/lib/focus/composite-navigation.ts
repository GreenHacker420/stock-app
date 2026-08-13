export function clampIndex(index: number, length: number): number { return length <= 0 ? -1 : Math.max(0, Math.min(index, length - 1)); }
export function moveIndex(current: number, delta: number, length: number): number { return clampIndex((current < 0 ? 0 : current) + delta, length); }

const elements = new Map<string, HTMLElement>();
export function rememberFocusable(id: string, element: HTMLElement | null): () => void { if (element) elements.set(id, element); return () => elements.delete(id); }
export function restoreFocusable(id: string): boolean { const element = elements.get(id); if (!element?.isConnected) return false; element.focus(); return true; }

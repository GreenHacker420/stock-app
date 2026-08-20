import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";

import { focusRegistry } from "./focus-registry";

interface UseTransactionFieldOptions {
  id: string;
  zoneId: string;
  rowIndex?: number;
  colIndex?: number;
  columnId?: string;
  order?: number;
  disabled?: boolean;
}

export function useTransactionField<T extends HTMLElement = HTMLInputElement>({
  id,
  zoneId,
  rowIndex,
  colIndex,
  columnId,
  order,
  disabled = false,
}: UseTransactionFieldOptions) {
  const ref = useRef<T | null>(null);
  const activeFieldId = useSyncExternalStore(
    (listener) => focusRegistry.subscribe(listener),
    () => focusRegistry.getActiveFieldId(),
    () => null,
  );

  useEffect(() => {
    const unregister = focusRegistry.register({
      id,
      zoneId,
      element: ref.current,
      rowIndex,
      colIndex,
      columnId,
      order,
      disabled,
    });

    return unregister;
  }, [id, zoneId, rowIndex, colIndex, columnId, order, disabled]);

  const setRef = useCallback((element: T | null) => {
    ref.current = element;
    focusRegistry.updateElement(id, element);
  }, [id]);

  const onFocus = useCallback(() => {
    if (disabled) return;
    focusRegistry.setMode("NAVIGATION");
    focusRegistry.setActiveField(id, zoneId);
  }, [disabled, id, zoneId]);

  return {
    ref,
    setRef,
    onFocus,
    isActive: activeFieldId === id,
  };
}

import { useEffect, useRef } from "react";
import { focusRegistry } from "./focus-registry";

interface UseTransactionFieldOptions {
  id: string;
  zoneId: string;
  rowIndex?: number;
  colIndex?: number;
  columnId?: string;
  disabled?: boolean;
}

export function useTransactionField<T extends HTMLElement = HTMLInputElement>({
  id,
  zoneId,
  rowIndex,
  colIndex,
  columnId,
  disabled = false,
}: UseTransactionFieldOptions) {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const unregister = focusRegistry.register({
      id,
      zoneId,
      element: ref.current,
      rowIndex,
      colIndex,
      columnId,
      disabled,
    });

    return () => {
      unregister();
    };
  }, [id, zoneId, rowIndex, colIndex, columnId, disabled]);

  // Keep DOM element reference updated
  const setRef = (element: T | null) => {
    ref.current = element;
    if (element) {
      focusRegistry.updateElement(id, element);
    }
  };

  const isActive = focusRegistry.getActiveFieldId() === id;

  return { ref, setRef, isActive };
}

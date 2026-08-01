import { useEffect, useCallback, useRef } from "react";

interface UseUnsavedSaleGuardOptions {
  isDirty: boolean;
  isSubmitted: boolean;
}

export function useUnsavedSaleGuard({ isDirty, isSubmitted }: UseUnsavedSaleGuardOptions) {
  const shouldBlock = isDirty && !isSubmitted;
  const shouldBlockRef = useRef(shouldBlock);

  useEffect(() => {
    shouldBlockRef.current = shouldBlock;
  }, [shouldBlock]);

  // Browser tab close / page reload guard
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!shouldBlockRef.current) return;
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);


  const confirmNavigation = useCallback(
    (message = "You have unsaved sale data. Leave this page and discard it?"): boolean => {
      if (!shouldBlockRef.current) return true;
      return window.confirm(message);
    },
    []
  );

  return { shouldBlock, confirmNavigation };
}

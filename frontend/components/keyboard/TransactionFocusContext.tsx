"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { focusRegistry, FocusRegistry } from "./focus-registry";
import type { InteractionMode, TransactionScope } from "./keyboard-intents";

interface TransactionFocusContextValue {
  registry: FocusRegistry;
  activeFieldId: string | null;
  activeZoneId: string;
  mode: InteractionMode;
  setMode: (mode: InteractionMode) => void;
  setActiveField: (id: string | null, zoneId?: string) => void;
  restorePreviousFocus: () => boolean;
}

const TransactionFocusContext = createContext<TransactionFocusContextValue>({
  registry: focusRegistry,
  activeFieldId: null,
  activeZoneId: "SALE_HEADER",
  mode: "NAVIGATION",
  setMode: () => {},
  setActiveField: () => {},
  restorePreviousFocus: () => false,
});

export function TransactionFocusProvider({ children }: { children: React.ReactNode }) {
  const [activeFieldId, setActiveFieldId] = useState<string | null>(focusRegistry.getActiveFieldId());
  const [activeZoneId, setActiveZoneId] = useState<string>(focusRegistry.getActiveZoneId());
  const [mode, setModeState] = useState<InteractionMode>(focusRegistry.getMode());

  useEffect(() => {
    const unsubscribe = focusRegistry.subscribe(() => {
      setActiveFieldId(focusRegistry.getActiveFieldId());
      setActiveZoneId(focusRegistry.getActiveZoneId());
      setModeState(focusRegistry.getMode());
    });
    return () => unsubscribe();
  }, []);

  const setMode = (newMode: InteractionMode) => {
    focusRegistry.setMode(newMode);
  };

  const setActiveField = (id: string | null, zoneId?: string) => {
    focusRegistry.setActiveField(id, zoneId);
  };

  const restorePreviousFocus = () => {
    return focusRegistry.restorePreviousFocus();
  };

  return (
    <TransactionFocusContext.Provider
      value={{
        registry: focusRegistry,
        activeFieldId,
        activeZoneId,
        mode,
        setMode,
        setActiveField,
        restorePreviousFocus,
      }}
    >
      {children}
    </TransactionFocusContext.Provider>
  );
}

export function useTransactionFocus() {
  return useContext(TransactionFocusContext);
}

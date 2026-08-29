"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import { focusRegistry } from "./focus-registry";
import type { FocusRegistry } from "./focus-registry";
import type { InteractionMode } from "./keyboard-intents";

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
  setMode: () => undefined,
  setActiveField: () => undefined,
  restorePreviousFocus: () => false,
});

export function TransactionFocusProvider({ children }: { children: ReactNode }) {
  const [activeFieldId, setActiveFieldId] = useState<string | null>(focusRegistry.getActiveFieldId());
  const [activeZoneId, setActiveZoneId] = useState(focusRegistry.getActiveZoneId());
  const [mode, setModeState] = useState<InteractionMode>(focusRegistry.getMode());

  useEffect(() => focusRegistry.subscribe(() => {
    setActiveFieldId(focusRegistry.getActiveFieldId());
    setActiveZoneId(focusRegistry.getActiveZoneId());
    setModeState(focusRegistry.getMode());
  }), []);

  return (
    <TransactionFocusContext.Provider
      value={{
        registry: focusRegistry,
        activeFieldId,
        activeZoneId,
        mode,
        setMode: (nextMode) => focusRegistry.setMode(nextMode),
        setActiveField: (id, zoneId) => focusRegistry.setActiveField(id, zoneId),
        restorePreviousFocus: () => focusRegistry.restorePreviousFocus(),
      }}
    >
      {children}
    </TransactionFocusContext.Provider>
  );
}

export function useTransactionFocus(): TransactionFocusContextValue {
  return useContext(TransactionFocusContext);
}

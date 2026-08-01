"use client";

import { useEffect, createContext, useContext } from "react";
import { shortcutEngine, ShortcutEngine, ShortcutDefinition } from "@/lib/keyboard/shortcut-engine";

const ShortcutContext = createContext<ShortcutEngine>(shortcutEngine);

export function ShortcutProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const stop = shortcutEngine.startListening();
    return () => {
      stop();
    };
  }, []);

  return (
    <ShortcutContext.Provider value={shortcutEngine}>
      {children}
    </ShortcutContext.Provider>
  );
}

export function useShortcutEngine() {
  return useContext(ShortcutContext);
}

export function useShortcut(def: ShortcutDefinition) {
  useEffect(() => {
    if (def.disabled) return;
    return shortcutEngine.register(def);
  }, [def.id, def.key, def.scope, def.description, def.action, def.preventInInput, def.disabled]);
}

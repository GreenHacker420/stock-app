"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";

import type { ContextPatch } from "./context-types";

interface ScopeValue {
  depth: number;
  values: ContextPatch;
}

const ScopeContext = createContext<ScopeValue>({ depth: 0, values: {} });

export function ContextScope({
  values,
  children,
  as: Tag = "div",
  className,
}: {
  values: ContextPatch;
  children: ReactNode;
  as?: "div" | "section" | "main";
  className?: string;
}) {
  const parent = useContext(ScopeContext);
  const merged = useMemo(() => ({ ...parent.values, ...values }), [parent.values, values]);
  const serialized = useMemo(() => JSON.stringify(merged), [merged]);

  return (
    <ScopeContext.Provider value={{ depth: parent.depth + 1, values: merged }}>
      <Tag className={className} data-keyboard-scope={serialized}>{children}</Tag>
    </ScopeContext.Provider>
  );
}

export function readContextFromTarget(target: EventTarget | null): ContextPatch {
  const scopes: ContextPatch[] = [];
  let element = target instanceof Element ? target : null;

  while (element) {
    const raw = element.getAttribute("data-keyboard-scope");
    if (raw) {
      try {
        scopes.push(JSON.parse(raw) as ContextPatch);
      } catch {
        // Ignore one malformed local scope without discarding valid ancestors.
      }
    }
    element = element.parentElement;
  }

  return scopes.reverse().reduce<ContextPatch>(
    (merged, scope) => ({ ...merged, ...scope }),
    {},
  );
}

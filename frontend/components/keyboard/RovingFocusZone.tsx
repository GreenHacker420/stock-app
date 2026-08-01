"use client";

import { useEffect, useRef } from "react";
import { focusRegistry } from "./focus-registry";

interface RovingFocusZoneProps {
  zoneId: string;
  className?: string;
  children: React.ReactNode;
}

export function RovingFocusZone({ zoneId, className, children }: RovingFocusZoneProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // When container mounts or receives focus, update active zone in registry
    const el = containerRef.current;
    if (!el) return;

    const handleFocusIn = () => {
      const activeId = focusRegistry.getActiveFieldId();
      if (!activeId || focusRegistry.getField(activeId)?.zoneId !== zoneId) {
        const fields = focusRegistry.getFieldsInZone(zoneId);
        if (fields.length > 0) {
          focusRegistry.setActiveField(fields[0].id, zoneId);
        }
      }
    };

    el.addEventListener("focusin", handleFocusIn);
    return () => el.removeEventListener("focusin", handleFocusIn);
  }, [zoneId]);

  return (
    <div ref={containerRef} data-focus-zone={zoneId} className={className}>
      {children}
    </div>
  );
}

"use client";

import { useState, type ReactNode } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import Link from "next/link";

export const HoverEffect = ({
  items,
  className,
}: {
  items: {
    title: string;
    description: string;
    value: string;
    link: string;
    icon?: ReactNode;
    badge?: string;
  }[];
  className?: string;
}) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const reduceMotion = useReducedMotion();

  return (
    <div
      className={cn("grid w-full min-w-0", className)}
      style={{
        gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, clamp(15rem, 23vw, 22rem)), 1fr))",
        gap: "clamp(0.45rem, 0.75vw, 0.85rem)",
      }}
    >
      {items.map((item, idx) => (
        <Link
          href={item.link}
          key={item.title}
          className="group relative block h-full w-full p-1.5"
          onMouseEnter={() => setHoveredIndex(idx)}
          onMouseLeave={() => setHoveredIndex(null)}
        >
          <AnimatePresence>
            {hoveredIndex === idx && !reduceMotion ? (
              <motion.span
                className="absolute inset-0 -z-10 block size-full rounded-2xl bg-indigo-100/55 dark:bg-indigo-950/35"
                layoutId="hoverBackground"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, transition: { duration: 0.12 } }}
                exit={{ opacity: 0, transition: { duration: 0.1 } }}
              />
            ) : null}
          </AnimatePresence>
          <div className="relative z-10 flex h-full min-h-[clamp(8rem,15vh,11rem)] w-full flex-col justify-between space-y-2 overflow-hidden rounded-xl border bg-card p-[clamp(0.8rem,1vw,1rem)] shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-[border-color,box-shadow,transform] group-hover:-translate-y-0.5 group-hover:border-foreground/15 group-hover:shadow-[0_12px_30px_rgba(15,23,42,0.065)]">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{item.title}</span>
              <span className="text-muted-foreground">{item.icon}</span>
            </div>
            <div>
              <div className="text-[clamp(1.25rem,1.55vw,1.7rem)] font-semibold tracking-tight text-foreground">{item.value}</div>
              <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{item.description}</p>
            </div>
            {item.badge ? <div className="pt-2 text-right"><span className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-300">{item.badge} →</span></div> : null}
          </div>
        </Link>
      ))}
    </div>
  );
};

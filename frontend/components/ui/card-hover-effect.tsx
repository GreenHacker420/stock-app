"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
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
    icon?: React.ReactNode;
    badge?: string;
  }[];
  className?: string;
}) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  return (
    <div className={cn("grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4", className)}>
      {items.map((item, idx) => (
        <Link
          href={item.link}
          key={item.title}
          className="relative group block p-2 h-full w-full"
          onMouseEnter={() => setHoveredIndex(idx)}
          onMouseLeave={() => setHoveredIndex(null)}
        >
          <AnimatePresence>
            {hoveredIndex === idx && (
              <motion.span
                className="absolute inset-0 h-full w-full bg-slate-200/60 dark:bg-slate-800/60 block rounded-2xl -z-10"
                layoutId="hoverBackground"
                initial={{ opacity: 0 }}
                animate={{
                  opacity: 1,
                  transition: { duration: 0.15 },
                }}
                exit={{
                  opacity: 0,
                  transition: { duration: 0.15, delay: 0.2 },
                }}
              />
            )}
          </AnimatePresence>
          <div className="rounded-xl h-full w-full p-4 overflow-hidden bg-card border border-slate-200/80 dark:border-slate-800 group-hover:border-slate-400 dark:group-hover:border-slate-600 transition-colors relative z-10 space-y-2 flex flex-col justify-between shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {item.title}
              </span>
              {item.icon}
            </div>
            <div>
              <div className="text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100">
                {item.value}
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {item.description}
              </p>
            </div>
            {item.badge && (
              <div className="pt-2 flex justify-end">
                <span className="text-[10px] font-bold text-primary hover:underline">
                  {item.badge} →
                </span>
              </div>
            )}
          </div>
        </Link>
      ))}
    </div>
  );
};

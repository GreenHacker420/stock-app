"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export const BentoGrid = ({
  className,
  children,
}: {
  className?: string;
  children?: ReactNode;
}) => {
  return (
    <div
      className={cn("grid w-full min-w-0", className)}
      style={{
        gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, clamp(15rem, 22vw, 21rem)), 1fr))",
        gap: "var(--workspace-gap)",
      }}
    >
      {children}
    </div>
  );
};

export const BentoGridItem = ({
  className,
  title,
  description,
  header,
  icon,
}: {
  className?: string;
  title?: string | ReactNode;
  description?: string | ReactNode;
  header?: ReactNode;
  icon?: ReactNode;
}) => {
  return (
    <div
      className={cn(
        "group/bento row-span-1 flex min-w-0 flex-col justify-between space-y-3 rounded-xl border bg-card p-[clamp(0.75rem,1vw,1rem)] shadow-[0_1px_2px_rgba(15,23,42,0.035)] transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:border-foreground/15 hover:shadow-[0_12px_30px_rgba(15,23,42,0.07)]",
        className,
      )}
    >
      {header}
      <div className="transition-transform duration-200 group-hover/bento:translate-x-0.5">
        <div className="mb-1 flex items-center gap-2">
          {icon}
          <div className="text-sm font-semibold text-foreground">{title}</div>
        </div>
        <div className="text-xs font-normal leading-5 text-muted-foreground">{description}</div>
      </div>
    </div>
  );
};

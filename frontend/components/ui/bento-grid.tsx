"use client";

import { cn } from "@/lib/utils";

export const BentoGrid = ({
  className,
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) => {
  return (
    <div
      className={cn(
        "grid grid-cols-1 md:grid-cols-3 gap-4 max-w-7xl mx-auto",
        className
      )}
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
  title?: string | React.ReactNode;
  description?: string | React.ReactNode;
  header?: React.ReactNode;
  icon?: React.ReactNode;
}) => {
  return (
    <div
      className={cn(
        "row-span-1 rounded-xl group/bento hover:shadow-xl transition duration-200 shadow-xs p-4 bg-card border border-slate-200/80 dark:border-slate-800 justify-between flex flex-col space-y-3",
        className
      )}
    >
      {header}
      <div className="group-hover/bento:translate-x-2 transition duration-200">
        <div className="flex items-center gap-2 mb-1">
          {icon}
          <div className="font-bold text-slate-900 dark:text-slate-100 text-sm">
            {title}
          </div>
        </div>
        <div className="font-normal text-muted-foreground text-xs">
          {description}
        </div>
      </div>
    </div>
  );
};

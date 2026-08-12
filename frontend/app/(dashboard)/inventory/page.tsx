import { Suspense } from "react";
import { InventoryWorkspace } from "@/features/inventory/components/InventoryWorkspace";
import { Skeleton } from "@/components/ui/skeleton";

export default function InventoryPage() {
  return (
    <Suspense fallback={<InventoryPageSkeleton />}>
      <InventoryWorkspace />
    </Suspense>
  );
}

function InventoryPageSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-4">
      <div className="space-y-2">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-4 w-full max-w-xl" />
      </div>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-24 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-[520px] rounded-xl" />
    </div>
  );
}

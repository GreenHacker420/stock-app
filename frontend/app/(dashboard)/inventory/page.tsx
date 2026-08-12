import { Suspense } from "react";
import { InventoryWorkspace } from "@/features/inventory/components/InventoryWorkspace";
import { Skeleton } from "@/components/ui/skeleton";

export default function InventoryPage() {
  return (
    <Suspense fallback={<InventoryPageSkeleton />}>
      <div className="w-full min-w-0 [&>div]:!mx-0 [&>div]:!max-w-none">
        <InventoryWorkspace />
      </div>
    </Suspense>
  );
}

function InventoryPageSkeleton() {
  return (
    <div className="workspace-page">
      <div className="space-y-2">
        <Skeleton className="h-3 w-[clamp(5rem,8vw,8rem)]" />
        <Skeleton className="h-8 w-[clamp(12rem,22vw,24rem)]" />
        <Skeleton className="h-4 w-[clamp(16rem,44vw,44rem)] max-w-full" />
      </div>
      <div className="workspace-metric-grid">
        {Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-[clamp(5.5rem,10vh,7rem)] rounded-xl" />)}
      </div>
      <Skeleton className="h-[58vh] min-h-[20rem] w-full rounded-xl" />
    </div>
  );
}

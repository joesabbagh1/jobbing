import { Skeleton } from "@/components/ui/skeleton";

// Shown instantly by each route's loading.tsx while the server renders the page.

function HeaderSkeleton({ back = false, actions = 1 }: { back?: boolean; actions?: number }) {
  return (
    <div className="mb-6 space-y-3">
      {back && <Skeleton className="h-4 w-24" />}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-7 w-72" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
        <div className="flex gap-2">
          {Array.from({ length: actions }, (_, i) => (
            <Skeleton key={i} className="h-9 w-32" />
          ))}
        </div>
      </div>
    </div>
  );
}

function CardSkeleton({ lines = 3, className = "" }: { lines?: number; className?: string }) {
  return (
    <div className={`space-y-3 rounded-xl border bg-card p-4 ${className}`}>
      <Skeleton className="h-5 w-40" />
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className="h-4" style={{ width: `${90 - ((i * 17) % 35)}%` }} />
      ))}
    </div>
  );
}

export function JobsListSkeleton() {
  return (
    <div>
      <HeaderSkeleton />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-[74px] rounded-xl" />
        ))}
      </div>
      <div className="mb-4 flex gap-2">
        <Skeleton className="h-9 flex-1" />
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-9 w-32" />
        ))}
      </div>
      <Skeleton className="mb-4 h-9 w-[600px] max-w-full" />
      <div className="overflow-hidden rounded-xl border bg-card">
        {Array.from({ length: 10 }, (_, i) => (
          <div key={i} className="flex items-center gap-6 border-b px-4 py-3.5 last:border-0">
            <Skeleton className="h-6 w-9" />
            <Skeleton className="h-4 flex-[2]" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-5 w-20 rounded-full" />
            <Skeleton className="h-4 w-12" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function JobSkeleton() {
  return (
    <div>
      <HeaderSkeleton back actions={2} />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          <CardSkeleton lines={5} />
          <Skeleton className="h-24 rounded-xl" />
          <CardSkeleton lines={12} />
        </div>
        <div className="space-y-4">
          <CardSkeleton lines={6} className="ring-2 ring-primary/20" />
          <CardSkeleton lines={4} />
          <CardSkeleton lines={2} />
        </div>
      </div>
    </div>
  );
}

export function EditorSkeleton({ back = true }: { back?: boolean }) {
  return (
    <div>
      <HeaderSkeleton back={back} actions={0} />
      <div className="mb-4 flex justify-between">
        <Skeleton className="h-5 w-36" />
        <div className="flex gap-2">
          <Skeleton className="h-8 w-36" />
          <Skeleton className="h-8 w-28" />
          <Skeleton className="h-8 w-24" />
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-3">
          <CardSkeleton lines={4} />
          <CardSkeleton lines={8} />
          <CardSkeleton lines={5} />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="aspect-[210/297] w-full rounded-lg" />
        </div>
      </div>
    </div>
  );
}

export function SearchSkeleton() {
  return (
    <div>
      <HeaderSkeleton />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-[74px] rounded-xl" />
        ))}
      </div>
      <div className="space-y-6">
        <CardSkeleton lines={8} />
        <CardSkeleton lines={10} />
      </div>
    </div>
  );
}

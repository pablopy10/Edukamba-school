import { DashboardLayout } from "./DashboardLayout";

/**
 * Lightweight, neutral page skeleton shown while role/permission data is
 * still resolving. Prevents the brief flash where role-gated UI is rendered
 * and then hidden.
 */
export const PageLoadingSkeleton = () => {
  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6">
        <div className="h-8 w-64 animate-pulse rounded-md bg-muted" />
        <div className="h-4 w-96 max-w-full animate-pulse rounded-md bg-muted/70" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-muted/60" />
          ))}
        </div>
        <div className="h-[420px] animate-pulse rounded-2xl bg-muted/40" />
      </div>
    </DashboardLayout>
  );
};

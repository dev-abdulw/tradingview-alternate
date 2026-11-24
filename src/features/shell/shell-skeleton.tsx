import { LogoMark } from "@/ui/icons";
import { Skeleton } from "@/ui/skeleton";

/**
 * Server-rendered stand-in for <Workspace/>: same chrome geometry (top bar,
 * rail, sidebar, status bar), so the real UI replaces it without a jump.
 */
export function ShellSkeleton() {
  return (
    <div className="flex h-dvh flex-col bg-app" aria-busy="true" aria-label="Loading workspace">
      <div className="flex h-11 shrink-0 items-center gap-3 bg-panel px-3.5">
        <LogoMark className="text-accent" />
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-40" />
        <div className="flex-1" />
        <Skeleton className="h-7 w-56" />
        <Skeleton className="size-7 rounded-full" />
      </div>
      <div className="flex min-h-0 flex-1 gap-px">
        <div className="w-11 shrink-0 bg-panel" />
        <div className="min-w-0 flex-1 bg-panel" />
        <div className="w-px bg-line" />
        <div className="flex w-[340px] shrink-0 flex-col gap-2 bg-panel p-3">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-5" />
          ))}
        </div>
      </div>
      <div className="h-6 shrink-0 bg-panel" />
    </div>
  );
}

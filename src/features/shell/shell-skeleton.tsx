import { Bell, ChartCandlestick, List, Settings2 } from "lucide-react";
import { LogoMark } from "@/ui/icons";
import { Skeleton } from "@/ui/skeleton";

/**
 * Server-rendered stand-in for <Workspace/>: same chrome geometry per form
 * factor, so the real UI replaces it without a jump. On phones the header
 * title is real text in its final position — it's the largest paint, so LCP
 * happens from the HTML instead of after the JavaScript loads.
 */
export function ShellSkeleton() {
  return (
    <>
      <PhoneSkeleton />
      <DesktopSkeleton />
    </>
  );
}

function DesktopSkeleton() {
  return (
    <div className="hidden h-dvh flex-col bg-app md:flex" aria-busy="true" aria-label="Loading workspace">
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
        <div className="hidden w-px bg-line lg:block" />
        <div className="hidden w-[340px] shrink-0 flex-col gap-2 bg-panel p-3 lg:flex">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-5" />
          ))}
        </div>
      </div>
      <div className="h-6 shrink-0 bg-panel" />
    </div>
  );
}

function PhoneSkeleton() {
  const tabs = [
    { label: "Watchlist", icon: <List /> },
    { label: "Chart", icon: <ChartCandlestick /> },
    { label: "Alerts", icon: <Bell /> },
    { label: "Settings", icon: <Settings2 /> },
  ];
  return (
    <div className="flex h-dvh flex-col bg-app md:hidden" aria-busy="true" aria-label="Loading">
      <header className="flex h-12 shrink-0 items-center gap-1 bg-panel pr-1 pl-2">
        <div className="flex items-center gap-2 pl-1">
          <LogoMark className="text-accent" />
          <h1 className="text-title font-semibold">Markets</h1>
        </div>
      </header>
      <div className="min-h-0 flex-1 bg-panel">
        <div className="h-10" />
        <div className="h-7 border-y border-line" />
        {Array.from({ length: 11 }, (_, i) => (
          <div key={i} className="grid h-11 grid-cols-[1fr_84px_62px] items-center gap-2 px-3">
            <div className="flex items-center gap-2">
              <Skeleton className="size-[18px] rounded-full" />
              <Skeleton className="h-2.5" style={{ width: 34 + ((i * 13) % 26) }} />
            </div>
            <Skeleton className="ml-auto h-2.5 w-14" />
            <Skeleton className="ml-auto h-2.5 w-10" />
          </div>
        ))}
      </div>
      <nav
        className="grid shrink-0 grid-cols-4 border-t border-line bg-panel pb-[env(safe-area-inset-bottom)]"
        aria-hidden="true"
      >
        {tabs.map((t, i) => (
          <div
            key={t.label}
            className={`flex h-14 flex-col items-center justify-center gap-0.5 text-meta font-medium [&_svg]:size-5 ${i === 0 ? "text-accent" : "text-fg-subtle"}`}
          >
            {t.icon}
            {t.label}
          </div>
        ))}
      </nav>
    </div>
  );
}

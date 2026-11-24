"use client";

import { ChevronDown } from "lucide-react";
import { parseSymbolKey, useChart } from "@/features/chart/chart-store";
import { useShell } from "@/features/shell/shell-context";
import { cn } from "@/lib/utils/cn";
import { Skeleton } from "@/ui/skeleton";

const ROWS = ["24h high", "24h low", "24h volume", "24h turnover"];

/** Collapsible symbol details. Loading skeletons mirror the real rows' geometry. */
export function SymbolDetailsPanel() {
  const { detailsCollapsed, toggleDetails } = useShell();
  const { symbol } = parseSymbolKey(useChart((s) => s.symbol));

  return (
    <section aria-label="Symbol details" className="flex h-full min-h-0 flex-col bg-panel">
      <button
        type="button"
        onClick={toggleDetails}
        aria-expanded={!detailsCollapsed}
        className="flex h-9 shrink-0 items-center gap-2 px-3 text-left hover:bg-hover"
      >
        <span className="meta-label">Details</span>
        <span className="text-cell font-medium text-fg-muted">{symbol}</span>
        <ChevronDown
          className={cn(
            "ml-auto size-4 text-fg-subtle transition-transform duration-[var(--motion-base)]",
            detailsCollapsed && "-rotate-90",
          )}
        />
      </button>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3" aria-busy="true">
        <div className="mb-3">
          <div className="mb-1.5 flex justify-between">
            <span className="text-cell text-fg-muted">24h range</span>
          </div>
          <Skeleton className="h-1 w-full rounded-full" />
          <div className="mt-1.5 flex justify-between">
            <Skeleton className="h-3 w-14" />
            <Skeleton className="h-3 w-14" />
          </div>
        </div>
        <dl className="divide-y divide-line">
          {ROWS.map((label, i) => (
            <div key={label} className="flex h-8 items-center justify-between">
              <dt className="text-cell text-fg-muted">{label}</dt>
              <dd>
                <Skeleton className="h-3" style={{ width: 56 + ((i * 17) % 28) }} />
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

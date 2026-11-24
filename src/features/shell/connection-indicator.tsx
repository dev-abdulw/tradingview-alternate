"use client";

import type { ConnectionStatus } from "@/lib/market-data/types";
import { cn } from "@/lib/utils/cn";
import { Tooltip } from "@/ui/tooltip";

export type { ConnectionStatus };

const META: Record<ConnectionStatus, { label: string; dot: string; hint: string }> = {
  live: { label: "Live", dot: "bg-up", hint: "Streaming real-time prices from Binance." },
  connecting: {
    label: "Connecting",
    dot: "bg-warning-solid animate-shimmer",
    hint: "Connecting to Binance…",
  },
  reconnecting: {
    label: "Reconnecting",
    dot: "bg-warning-solid animate-shimmer",
    hint: "Connection lost. Retrying automatically; prices may be stale.",
  },
  offline: {
    label: "Offline",
    dot: "bg-danger",
    hint: "You're offline. Prices will resume when you reconnect.",
  },
  idle: { label: "Idle", dot: "bg-fg-subtle", hint: "No live prices are being watched right now." },
};

/** Live / Reconnecting / Offline dot with an accessible, polite status label. */
export function ConnectionIndicator({
  status,
  showLabel = true,
}: {
  status: ConnectionStatus;
  showLabel?: boolean;
}) {
  const m = META[status];
  return (
    <Tooltip content={m.hint}>
      <div
        role="status"
        aria-live="polite"
        tabIndex={0}
        className="flex h-7 items-center gap-1.5 rounded-control px-2 text-cell text-fg-muted hover:bg-hover"
      >
        <span className="relative flex size-2 items-center justify-center">
          {status === "live" && (
            <span className="absolute inset-0 animate-ping rounded-full bg-up opacity-40 [animation-duration:2.4s] motion-reduce:hidden" />
          )}
          <span className={cn("relative size-2 rounded-full", m.dot)} />
        </span>
        <span className={cn(!showLabel && "sr-only")}>{m.label}</span>
      </div>
    </Tooltip>
  );
}

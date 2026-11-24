"use client";

import { RefreshCw, WifiOff } from "lucide-react";
import { useEffect, useState } from "react";
import { useConnectionStatus } from "@/lib/market-data/hooks";

/**
 * Slim banner for degraded connectivity. "Reconnecting" waits 2.5s before
 * showing (a normal blip shouldn't flash a warning); "offline" shows at once.
 */
export function ConnectionBanner() {
  const status = useConnectionStatus();
  if (status === "offline") {
    return (
      <div
        role="status"
        className="flex h-7 shrink-0 items-center justify-center gap-2 bg-danger-muted text-cell text-danger"
      >
        <WifiOff className="size-3.5" />
        You’re offline. Prices are paused and will resume when you reconnect.
      </div>
    );
  }
  // Mounted per reconnecting episode, so its delay timer resets naturally.
  return status === "reconnecting" ? <ReconnectingNotice /> : null;
}

function ReconnectingNotice() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setShow(true), 2500);
    return () => clearTimeout(id);
  }, []);
  if (!show) return null;
  return (
    <div
      role="status"
      className="flex h-7 shrink-0 items-center justify-center gap-2 bg-warning-muted text-cell text-warning"
    >
      <RefreshCw className="size-3.5 animate-spin [animation-duration:2s] motion-reduce:animate-none" />
      Reconnecting to Binance… prices shown may be stale.
    </div>
  );
}

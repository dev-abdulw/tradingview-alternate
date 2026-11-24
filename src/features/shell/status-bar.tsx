"use client";

import { useEffect, useMemo, useState } from "react";
import { useSettings } from "@/features/settings/settings-store";
import { useUi } from "./ui-store";

function useNow(intervalMs = 1000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** Offset label like "UTC+5" for a time zone at a given instant. */
export function utcOffsetLabel(timeZone: string, at: Date): string {
  const part = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "shortOffset" })
    .formatToParts(at)
    .find((p) => p.type === "timeZoneName")?.value;
  return (part ?? "UTC").replace("GMT", "UTC");
}

export function StatusBar() {
  const timezone = useSettings((s) => s.timezone);
  const now = useNow();
  const clock = useMemo(
    () =>
      new Intl.DateTimeFormat("en-GB", {
        timeZone: timezone,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }),
    [timezone],
  );

  return (
    <footer className="flex h-6 shrink-0 items-center gap-3 bg-panel px-3 text-meta text-fg-subtle">
      <p className="min-w-0 truncate">Market data from Binance · may be delayed · not financial advice</p>
      <div className="flex-1" />
      <button
        type="button"
        onClick={() => useUi.getState().setSettingsOpen(true)}
        className="num flex items-center gap-1.5 rounded-[4px] px-1.5 hover:bg-hover hover:text-fg-muted"
        aria-label={`Time zone ${timezone}. Change in settings.`}
      >
        <time dateTime={now.toISOString()} className="text-fg-muted">
          {clock.format(now)}
        </time>
        <span>{utcOffsetLabel(timezone, now)}</span>
      </button>
    </footer>
  );
}

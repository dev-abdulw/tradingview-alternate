"use client";

import { useEffect, useMemo } from "react";
import { useChart } from "@/features/chart/chart-store";
import { useSettings } from "@/features/settings/settings-store";
import { describeCondition, shouldTrigger } from "@/lib/alerts/evaluate";
import { formatPrice } from "@/lib/market-data/precision";
import { getProvider } from "@/lib/market-data/registry";
import { parseSymbolKey } from "@/lib/market-data/symbol-key";
import type { SymbolKey } from "@/lib/market-data/types";
import { toast } from "@/ui/toast";
import { alertKey, useAlerts, type AlertRow } from "./alerts-store";

/**
 * Client-side alert evaluation. Streams with `background: true`, so alerts
 * keep working while the tab is hidden. One subscription per symbol that has
 * an active alert; the evaluation rule is the shared pure `shouldTrigger`.
 */
export function AlertEngine() {
  const rows = useAlerts((s) => s.rows);
  useEffect(() => {
    void useAlerts.getState().init();
  }, []);

  const keys = useMemo(
    () =>
      [
        ...new Set(
          Object.values(rows)
            .filter((a) => a.active)
            .map(alertKey),
        ),
      ]
        .sort()
        .join(","),
    [rows],
  );

  useEffect(() => {
    if (!keys) return;
    const offs = keys.split(",").map((key) => {
      const ref = parseSymbolKey(key);
      let prev: number | null = null;
      return getProvider(ref).subscribeTicker(
        ref.symbol,
        (t) => {
          const last = t.last;
          for (const a of Object.values(useAlerts.getState().rows)) {
            if (a.active && alertKey(a) === key && shouldTrigger(a.condition, a.price, prev, last))
              fire(a, last);
          }
          prev = last;
        },
        { background: true },
      );
    });
    return () => offs.forEach((off) => off());
  }, [keys]);

  return null;
}

function fire(a: AlertRow, last: number) {
  useAlerts.getState().markTriggered(a.id);
  const key = alertKey(a);
  const decimals = Math.max(0, (String(a.price).split(".")[1] ?? "").length);
  const level = formatPrice(a.price, decimals);
  const title = `${a.symbol} ${describeCondition(a.condition)} ${level}`;
  const body = a.note ?? `Last price ${formatPrice(last, decimals)}`;

  toast.warning(title, {
    description: body,
    duration: 15_000,
    action: { label: "Open chart", onClick: () => useChart.getState().setSymbol(key as SymbolKey) },
  });

  if (typeof Notification !== "undefined" && Notification.permission === "granted") {
    try {
      const n = new Notification(title, { body, tag: a.id });
      n.onclick = () => {
        window.focus();
        useChart.getState().setSymbol(key as SymbolKey);
      };
    } catch {
      /* some browsers only allow notifications from a service worker */
    }
  }
  if (useSettings.getState().alertSound) chime();
}

/** Two short soft tones, synthesized (no audio asset to load). */
function chime() {
  try {
    const ctx = new AudioContext();
    [880, 1320].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const t0 = ctx.currentTime + i * 0.16;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.12, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.14);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.15);
    });
    setTimeout(() => void ctx.close(), 600);
  } catch {
    /* audio blocked until a user gesture — the toast and notification still fire */
  }
}

/** Ask once, on a user gesture (creating an alert). */
export function requestNotificationPermission() {
  if (typeof Notification !== "undefined" && Notification.permission === "default") {
    void Notification.requestPermission();
  }
}

"use client";

import { useEffect, useMemo } from "react";
import { useChart } from "@/features/chart/chart-store";
import { describeCondition, shouldTrigger } from "@/lib/alerts/evaluate";
import { formatPrice } from "@/lib/market-data/precision";
import { getProvider } from "@/lib/market-data/registry";
import { parseSymbolKey } from "@/lib/market-data/symbol-key";
import type { SymbolKey } from "@/lib/market-data/types";
import { alertKey, useAlerts, type AlertRow } from "./alerts-store";
import { notify } from "./notify";

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
  notify({
    title: `${a.symbol} ${describeCondition(a.condition)} ${formatPrice(a.price, decimals)}`,
    body: a.note ?? `Last price ${formatPrice(last, decimals)}`,
    tag: a.id,
    actionLabel: "Open chart",
    onAction: () => useChart.getState().setSymbol(key as SymbolKey),
  });
}

export { requestNotificationPermission } from "./notify";

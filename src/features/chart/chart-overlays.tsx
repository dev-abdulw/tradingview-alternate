"use client";

import { Bell, Eye, EyeOff, Maximize2, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { alertKey, useAlerts } from "@/features/alerts/alerts-store";
import { useSettings } from "@/features/settings/settings-store";
import { useUi } from "@/features/shell/ui-store";
import { isEditableTarget } from "@/lib/hooks/use-hotkeys";
import { useInstrument } from "@/lib/market-data/hooks";
import { formatPrice } from "@/lib/market-data/precision";
import { TIMEFRAME_MS } from "@/lib/market-data/timeframes";
import type { SymbolKey } from "@/lib/market-data/types";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/ui/menu";
import { useChartColors } from "./chart-colors";
import type { ChartController } from "./chart-controller";
import { useChart } from "./chart-store";
import { DrawingsLayer } from "./drawings/drawings-layer";
import { drawingsFor, useDrawings } from "./drawings/drawings-store";

export function ChartOverlays({
  controller,
  paneIndex,
  symbol,
}: {
  controller: ChartController;
  paneIndex: number;
  symbol: SymbolKey;
}) {
  useDrawingLayer(controller, paneIndex, symbol);
  useAlertLines(controller, symbol);
  return <ChartContextMenu controller={controller} symbol={symbol} />;
}

/* -------------------------------- drawings -------------------------------- */

function useDrawingLayer(controller: ChartController, paneIndex: number, symbol: SymbolKey) {
  const rows = useDrawings((s) => s.rows);
  const selectedId = useDrawings((s) => s.selectedId);
  const tool = useChart((s) => s.tool);
  const magnet = useChart((s) => s.magnet);
  const hidden = useChart((s) => s.drawingsHidden);
  const isActive = useChart((s) => s.activePane === paneIndex);
  const timeframe = useChart((s) => s.panes[paneIndex]?.timeframe ?? "1h");
  const colors = useChartColors();
  const locale = useSettings((s) => s.numberFormat);
  const instrument = useInstrument(symbol);
  const drawings = useMemo(() => drawingsFor(rows, symbol), [rows, symbol]);
  const layer = useRef<DrawingsLayer | null>(null);

  useEffect(() => {
    void useDrawings.getState().init();
  }, []);

  useEffect(() => {
    const l = new DrawingsLayer(
      controller,
      {
        drawings: [],
        selectedId: null,
        hidden: false,
        tool: null,
        magnet: false,
        colors,
        decimals: 2,
        locale,
        intervalSec: TIMEFRAME_MS[timeframe] / 1000,
      },
      {
        onCreate: (type, points) => {
          useDrawings.getState().add(symbol, type, points);
          useChart.getState().setTool("cursor");
        },
        onUpdate: (id, points) => useDrawings.getState().updatePoints(id, points),
        onSelect: (id) => useDrawings.getState().select(id),
      },
    );
    layer.current = l;
    return () => {
      l.destroy();
      layer.current = null;
    };
    // The layer is bound to one chart + symbol; state flows in via setState below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controller, symbol]);

  useEffect(() => {
    layer.current?.setState({
      drawings,
      selectedId,
      hidden,
      // Only the active pane places new drawings.
      tool: isActive && tool !== "cursor" ? tool : null,
      magnet,
      colors,
      locale,
      decimals: instrument?.priceDecimals ?? 2,
      intervalSec: TIMEFRAME_MS[timeframe] / 1000,
    });
  }, [
    drawings,
    selectedId,
    hidden,
    tool,
    isActive,
    magnet,
    colors,
    locale,
    instrument,
    timeframe,
    controller,
    symbol,
  ]);

  // Keyboard: Esc cancels placement / deselects; Delete removes the selected drawing.
  useEffect(() => {
    if (!isActive) return;
    const onKey = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return;
      if (e.key === "Escape") {
        if (layer.current?.cancelDraft()) return;
        if (useChart.getState().tool !== "cursor") useChart.getState().setTool("cursor");
        else useDrawings.getState().select(null);
      }
      const sel = useDrawings.getState().selectedId;
      if ((e.key === "Delete" || e.key === "Backspace") && sel && drawings.some((d) => d.id === sel)) {
        e.preventDefault();
        useDrawings.getState().remove(sel);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isActive, drawings]);
}

/* ------------------------------- alert lines ------------------------------ */

function useAlertLines(controller: ChartController, symbol: SymbolKey) {
  const rows = useAlerts((s) => s.rows);
  const instrument = useInstrument(symbol);
  const locale = useSettings((s) => s.numberFormat);
  useEffect(() => {
    const lines = Object.values(rows)
      .filter((a) => a.active && alertKey(a) === symbol)
      .map((a) => ({
        id: a.id,
        price: a.price,
        label: `Alert ${a.condition === "cross" ? "×" : a.condition === "above" ? "↑" : "↓"} ${formatPrice(a.price, instrument?.priceDecimals ?? 2, locale)}`,
      }));
    controller.setAlertLines(lines);
  }, [rows, symbol, controller, instrument, locale]);
}

/* ------------------------------- context menu ----------------------------- */

function ChartContextMenu({ controller, symbol }: { controller: ChartController; symbol: SymbolKey }) {
  const [price, setPrice] = useState<number | null>(null);
  const instrument = useInstrument(symbol);
  const locale = useSettings((s) => s.numberFormat);
  const hidden = useChart((s) => s.drawingsHidden);
  const triggerRef = useRef<HTMLSpanElement>(null);

  // Radix ContextMenu needs a trigger element; we forward the chart's own contextmenu event to it.
  useEffect(() => {
    const el = controller.container;
    const onCtx = (e: MouseEvent) => {
      const r = el.getBoundingClientRect();
      const y = e.clientY - r.top;
      const pane = controller.paneRects()[0];
      setPrice(pane && y <= pane.height ? controller.priceAtY(y) : null);
      e.preventDefault();
      triggerRef.current?.dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, clientX: e.clientX, clientY: e.clientY }),
      );
    };
    el.addEventListener("contextmenu", onCtx);
    return () => el.removeEventListener("contextmenu", onCtx);
  }, [controller]);

  const priceLabel = price !== null ? formatPrice(price, instrument?.priceDecimals ?? 2, locale) : null;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <span ref={triggerRef} className="pointer-events-none absolute inset-0" aria-hidden="true" />
      </ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        <ContextMenuLabel>{instrument?.displayName ?? symbol}</ContextMenuLabel>
        <ContextMenuItem
          icon={<Bell />}
          disabled={price === null}
          onSelect={() => useUi.getState().openAlert({ symbol, price })}
        >
          {priceLabel ? `Add alert at ${priceLabel}` : "Add alert…"}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem icon={<Maximize2 />} onSelect={() => controller.resetView()}>
          Reset chart view
        </ContextMenuItem>
        <ContextMenuItem
          icon={hidden ? <Eye /> : <EyeOff />}
          onSelect={() => useChart.getState().toggleDrawingsHidden()}
        >
          {hidden ? "Show drawings" : "Hide drawings"}
        </ContextMenuItem>
        <ContextMenuItem
          icon={<Trash2 />}
          destructive
          onSelect={() => useDrawings.getState().removeAll(symbol)}
        >
          Remove all drawings
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

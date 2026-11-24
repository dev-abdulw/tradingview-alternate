"use client";

import { Crosshair, Eye, EyeOff, Magnet, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { useChart, type DrawingTool } from "@/features/chart/chart-store";
import { useDrawings } from "@/features/chart/drawings/drawings-store";
import { useHotkeys } from "@/lib/hooks/use-hotkeys";
import { IconButton } from "@/ui/icon-button";
import { FibIcon, HorizontalLineIcon, RayIcon, RectangleToolIcon, TrendLineIcon } from "@/ui/icons";

const TOOLS: { id: DrawingTool; label: string; icon: ReactNode; key: string }[] = [
  { id: "cursor", label: "Crosshair", icon: <Crosshair />, key: "Esc" },
  { id: "trend", label: "Trend line", icon: <TrendLineIcon />, key: "T" },
  { id: "ray", label: "Ray", icon: <RayIcon />, key: "R" },
  { id: "hline", label: "Horizontal line", icon: <HorizontalLineIcon />, key: "H" },
  { id: "rect", label: "Rectangle", icon: <RectangleToolIcon />, key: "B" },
  { id: "fib", label: "Fibonacci retracement", icon: <FibIcon />, key: "F" },
];

/** Left drawing rail: tools apply to the active chart; drawings are saved per symbol. */
export function DrawingToolbar() {
  const tool = useChart((s) => s.tool);
  const setTool = useChart((s) => s.setTool);
  const magnet = useChart((s) => s.magnet);
  const hidden = useChart((s) => s.drawingsHidden);

  useHotkeys(
    Object.fromEntries(
      TOOLS.filter((t) => t.id !== "cursor").map((t) => [
        t.key.toLowerCase(),
        () => setTool(tool === t.id ? "cursor" : t.id),
      ]),
    ),
  );

  return (
    <nav
      aria-label="Drawing tools"
      className="flex w-11 shrink-0 flex-col items-center gap-0.5 bg-panel py-1.5"
    >
      {TOOLS.map((t) => (
        <IconButton
          key={t.id}
          size="md"
          label={t.label}
          icon={t.icon}
          shortcut={t.key}
          tooltipSide="right"
          active={tool === t.id}
          onClick={() => setTool(t.id)}
        />
      ))}
      <div aria-hidden="true" className="my-1 h-px w-6 bg-line" />
      <IconButton
        size="md"
        label={magnet ? "Magnet on (snap to OHLC)" : "Magnet off"}
        icon={<Magnet />}
        tooltipSide="right"
        active={magnet}
        onClick={() => useChart.getState().toggleMagnet()}
      />
      <IconButton
        size="md"
        label={hidden ? "Show drawings" : "Hide drawings"}
        icon={hidden ? <EyeOff /> : <Eye />}
        tooltipSide="right"
        active={hidden}
        onClick={() => useChart.getState().toggleDrawingsHidden()}
      />
      <div className="flex-1" />
      <IconButton
        size="md"
        label="Remove all drawings on this symbol"
        icon={<Trash2 />}
        tooltipSide="right"
        onClick={() => useDrawings.getState().removeAll(useChart.getState().symbol)}
      />
    </nav>
  );
}

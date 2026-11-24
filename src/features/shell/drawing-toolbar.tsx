"use client";

import { Crosshair, Eye, Magnet, Trash2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { IconButton } from "@/ui/icon-button";
import { FibIcon, HorizontalLineIcon, RayIcon, RectangleToolIcon, TrendLineIcon } from "@/ui/icons";

export type DrawingTool = "cursor" | "hline" | "trend" | "ray" | "rect" | "fib";

const TOOLS: { id: DrawingTool; label: string; icon: ReactNode; key: string }[] = [
  { id: "cursor", label: "Crosshair", icon: <Crosshair />, key: "Esc" },
  { id: "trend", label: "Trend line", icon: <TrendLineIcon />, key: "T" },
  { id: "ray", label: "Ray", icon: <RayIcon />, key: "R" },
  { id: "hline", label: "Horizontal line", icon: <HorizontalLineIcon />, key: "H" },
  { id: "rect", label: "Rectangle", icon: <RectangleToolIcon />, key: "B" },
  { id: "fib", label: "Fibonacci retracement", icon: <FibIcon />, key: "F" },
];

/**
 * Left drawing rail. Phase 1 holds selection state only; Phase 4 wires the
 * tools into the chart (and moves `active` into the chart store).
 */
export function DrawingToolbar() {
  const [active, setActive] = useState<DrawingTool>("cursor");
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
          active={active === t.id}
          onClick={() => setActive(t.id)}
        />
      ))}
      <div aria-hidden="true" className="my-1 h-px w-6 bg-line" />
      <IconButton size="md" label="Magnet mode" icon={<Magnet />} tooltipSide="right" />
      <IconButton size="md" label="Hide drawings" icon={<Eye />} tooltipSide="right" />
      <div className="flex-1" />
      <IconButton size="md" label="Remove all drawings" icon={<Trash2 />} tooltipSide="right" />
    </nav>
  );
}

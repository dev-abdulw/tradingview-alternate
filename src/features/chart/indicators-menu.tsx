"use client";

import { Activity, Check } from "lucide-react";
import { Button } from "@/ui/button";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from "@/ui/menu";
import { useChart } from "./chart-store";
import { INDICATOR_KINDS, INDICATOR_META } from "./indicator-config";

/** Add indicators. Overlays draw on the price pane; RSI and MACD get their own panes. */
export function IndicatorsMenu() {
  const indicators = useChart((s) => s.indicators);
  const add = useChart((s) => s.addIndicator);
  const count = (k: string) => indicators.filter((c) => c.kind === k).length;
  return (
    <Menu>
      <MenuTrigger asChild>
        <Button variant="ghost" size="sm" aria-label="Indicators">
          <Activity />
          <span className="hidden xl:inline">Indicators</span>
          {indicators.length > 0 && (
            <span className="num rounded-[4px] bg-accent-muted px-1 text-meta text-accent">
              {indicators.length}
            </span>
          )}
        </Button>
      </MenuTrigger>
      <MenuContent className="w-64">
        <MenuLabel>Overlays</MenuLabel>
        {INDICATOR_KINDS.filter((k) => INDICATOR_META[k].pane === "overlay").map((k) => (
          <MenuItem
            key={k}
            onSelect={() => add(k)}
            shortcut={INDICATOR_META[k].short}
            icon={count(k) ? <Check /> : <span className="size-4" />}
          >
            {INDICATOR_META[k].name}
          </MenuItem>
        ))}
        <MenuSeparator />
        <MenuLabel>Oscillators (own pane)</MenuLabel>
        {INDICATOR_KINDS.filter((k) => INDICATOR_META[k].pane === "own").map((k) => (
          <MenuItem
            key={k}
            onSelect={() => add(k)}
            shortcut={INDICATOR_META[k].short}
            icon={count(k) ? <Check /> : <span className="size-4" />}
          >
            {INDICATOR_META[k].name}
          </MenuItem>
        ))}
        <div className="px-2 pt-2 pb-1 text-meta text-fg-subtle">
          Hover a legend row on the chart to edit, hide or remove.
        </div>
      </MenuContent>
    </Menu>
  );
}

"use client";

import { ChevronDown, Star } from "lucide-react";
import { TIMEFRAMES, useSettings, type Timeframe } from "@/features/settings/settings-store";
import { IconButton } from "@/ui/icon-button";
import {
  Menu,
  MenuCheckboxItem,
  MenuContent,
  MenuLabel,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuSub,
  MenuSubContent,
  MenuSubTrigger,
  MenuTrigger,
} from "@/ui/menu";
import { SegmentedControl } from "@/ui/tabs";
import { useChart } from "./chart-store";

const TF_LABEL: Record<Timeframe, string> = {
  "1m": "1 minute",
  "3m": "3 minutes",
  "5m": "5 minutes",
  "15m": "15 minutes",
  "30m": "30 minutes",
  "1h": "1 hour",
  "4h": "4 hours",
  "1D": "1 day",
  "1W": "1 week",
  "1M": "1 month",
};

/** Favorite timeframes pinned as a segmented control, the full list in a menu. */
export function TimeframePicker() {
  const timeframe = useChart((s) => s.timeframe);
  const setTimeframe = useChart((s) => s.setTimeframe);
  const favorites = useSettings((s) => s.favoriteTimeframes);
  const toggleFavorite = useSettings((s) => s.toggleFavoriteTimeframe);

  // Keep the active timeframe visible even when it isn't a favorite.
  const pinned = TIMEFRAMES.filter((tf) => favorites.includes(tf) || tf === timeframe);

  return (
    <div className="flex items-center gap-0.5">
      <SegmentedControl
        aria-label="Timeframe"
        size="xs"
        value={timeframe}
        onValueChange={setTimeframe}
        options={pinned.map((tf) => ({ value: tf, label: tf, ariaLabel: TF_LABEL[tf] }))}
        className="bg-transparent"
      />
      <Menu>
        <MenuTrigger asChild>
          <IconButton label="All timeframes" size="xs" icon={<ChevronDown />} />
        </MenuTrigger>
        <MenuContent className="w-52">
          <MenuLabel>Timeframe</MenuLabel>
          <MenuRadioGroup value={timeframe} onValueChange={(v) => setTimeframe(v as Timeframe)}>
            {TIMEFRAMES.map((tf) => (
              <MenuRadioItem key={tf} value={tf} shortcut={tf}>
                {TF_LABEL[tf]}
              </MenuRadioItem>
            ))}
          </MenuRadioGroup>
          <MenuSeparator />
          <MenuSub>
            <MenuSubTrigger icon={<Star />}>Favorites in top bar</MenuSubTrigger>
            <MenuSubContent className="w-48">
              {TIMEFRAMES.map((tf) => (
                <MenuCheckboxItem
                  key={tf}
                  checked={favorites.includes(tf)}
                  onCheckedChange={() => toggleFavorite(tf)}
                  onSelect={(e) => e.preventDefault()}
                >
                  {TF_LABEL[tf]}
                </MenuCheckboxItem>
              ))}
            </MenuSubContent>
          </MenuSub>
        </MenuContent>
      </Menu>
    </div>
  );
}

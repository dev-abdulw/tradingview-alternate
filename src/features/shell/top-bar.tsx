"use client";

import {
  Activity,
  Bell,
  ChevronDown,
  LayoutDashboard,
  LogIn,
  PanelRight,
  Search,
  Settings2,
  Keyboard,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CHART_TYPE_META, LAYOUT_META } from "@/features/chart/chart-meta";
import {
  CHART_TYPES,
  LAYOUT_MODES,
  parseSymbolKey,
  useChart,
  type ChartType,
  type LayoutMode,
} from "@/features/chart/chart-store";
import { TimeframePicker } from "@/features/chart/timeframe-picker";
import { formatHotkey } from "@/lib/hooks/use-hotkeys";
import { Button } from "@/ui/button";
import { AssetClassChip } from "@/ui/chip";
import { IconButton } from "@/ui/icon-button";
import { LogoMark } from "@/ui/icons";
import { Kbd } from "@/ui/kbd";
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
} from "@/ui/menu";
import { Skeleton } from "@/ui/skeleton";
import { toast } from "@/ui/toast";
import { Tooltip } from "@/ui/tooltip";
import { ConnectionIndicator } from "./connection-indicator";
import { SHORTCUTS, useShell } from "./shell-context";
import { useUi } from "./ui-store";

function Divider() {
  return <div aria-hidden="true" className="mx-1 h-5 w-px shrink-0 bg-line" />;
}

function comingSoon(feature: string, phase: number) {
  toast(`${feature} arrives in Phase ${phase}`, {
    description: "The shell is in place; the feature lands later.",
  });
}

export function TopBar() {
  return (
    <header className="flex h-11 shrink-0 items-center gap-1 bg-panel px-2">
      <Link
        href="/"
        className="mr-1 flex h-7 items-center gap-2 rounded-control px-1.5 text-accent"
        aria-label="Markets home"
      >
        <LogoMark />
        <span className="hidden text-title font-semibold tracking-tight text-fg lg:inline">Markets</span>
      </Link>
      <Divider />
      <SymbolHeader />
      <Divider />
      <TimeframePicker />
      <Divider />
      <ChartTypeMenu />
      <Button variant="ghost" size="sm" onClick={() => comingSoon("Indicators", 4)}>
        <Activity />
        <span className="hidden xl:inline">Indicators</span>
      </Button>
      <LayoutMenu />
      <IconButton label="Alerts" icon={<Bell />} onClick={() => comingSoon("Price alerts", 4)} />

      <div className="flex-1" />

      <SearchTrigger />
      <ConnectionIndicator status="idle" />
      <SidebarToggle />
      <IconButton
        label="Settings"
        icon={<Settings2 />}
        shortcut={formatHotkey(SHORTCUTS.settings)}
        onClick={() => useUi.getState().setSettingsOpen(true)}
      />
      <ProfileMenu />
    </header>
  );
}

function SymbolHeader() {
  const symbolKey = useChart((s) => s.symbol);
  const { symbol } = parseSymbolKey(symbolKey);
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Tooltip content="Change symbol" shortcut={formatHotkey(SHORTCUTS.search)}>
        <button
          type="button"
          onClick={() => useUi.getState().setSearchOpen(true)}
          className="flex h-7 items-center gap-2 rounded-control px-2 hover:bg-hover"
        >
          <span className="text-title font-semibold tracking-tight">{symbol}</span>
          <AssetClassChip assetClass="crypto" className="hidden md:inline-flex" />
        </button>
      </Tooltip>
      {/* Live price lands in Phase 2; the skeleton matches its footprint so nothing shifts. */}
      <div className="hidden items-baseline gap-2 md:flex" aria-label="Price loading">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-3 w-12" />
      </div>
    </div>
  );
}

function ChartTypeMenu() {
  const chartType = useChart((s) => s.chartType);
  const setChartType = useChart((s) => s.setChartType);
  const current = CHART_TYPE_META[chartType];
  return (
    <Menu>
      <Tooltip content={`Chart type: ${current.label}`}>
        <MenuTrigger asChild>
          <Button variant="ghost" size="sm" aria-label={`Chart type: ${current.label}`} className="px-2">
            {current.icon}
            <ChevronDown className="size-3! text-fg-subtle" />
          </Button>
        </MenuTrigger>
      </Tooltip>
      <MenuContent>
        <MenuLabel>Chart type</MenuLabel>
        <MenuRadioGroup value={chartType} onValueChange={(v) => setChartType(v as ChartType)}>
          {CHART_TYPES.map((t) => (
            <MenuRadioItem key={t} value={t} icon={CHART_TYPE_META[t].icon}>
              {CHART_TYPE_META[t].label}
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuContent>
    </Menu>
  );
}

function LayoutMenu() {
  const layoutMode = useChart((s) => s.layoutMode);
  const setLayoutMode = useChart((s) => s.setLayoutMode);
  return (
    <Menu>
      <Tooltip content="Chart layout">
        <MenuTrigger asChild>
          <Button variant="ghost" size="sm" aria-label="Chart layout" className="px-2">
            {LAYOUT_META[layoutMode].icon}
            <ChevronDown className="size-3! text-fg-subtle" />
          </Button>
        </MenuTrigger>
      </Tooltip>
      <MenuContent>
        <MenuLabel>Layout</MenuLabel>
        <MenuRadioGroup value={layoutMode} onValueChange={(v) => setLayoutMode(v as LayoutMode)}>
          {LAYOUT_MODES.map((m) => (
            <MenuRadioItem key={m} value={m} icon={LAYOUT_META[m].icon}>
              {LAYOUT_META[m].label}
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuContent>
    </Menu>
  );
}

function SearchTrigger() {
  const keys = formatHotkey(SHORTCUTS.search);
  return (
    <>
      <button
        type="button"
        onClick={() => useUi.getState().setSearchOpen(true)}
        className="mr-1 hidden h-7 w-56 items-center gap-2 rounded-control bg-input px-2.5 text-ui text-fg-subtle ring-1 ring-line transition-colors ring-inset hover:text-fg-muted hover:ring-line-strong lg:flex"
      >
        <Search className="size-4" />
        <span className="flex-1 text-left">Search symbols</span>
        <span className="flex gap-0.5">
          {keys.map((k) => (
            <Kbd key={k}>{k}</Kbd>
          ))}
        </span>
      </button>
      <IconButton
        label="Search symbols"
        icon={<Search />}
        shortcut={keys}
        className="lg:hidden"
        onClick={() => useUi.getState().setSearchOpen(true)}
      />
    </>
  );
}

function SidebarToggle() {
  const { sidebarCollapsed, toggleSidebar } = useShell();
  return (
    <IconButton
      label={sidebarCollapsed ? "Show watchlist" : "Hide watchlist"}
      icon={<PanelRight />}
      shortcut={formatHotkey(SHORTCUTS.toggleSidebar)}
      active={!sidebarCollapsed}
      onClick={toggleSidebar}
    />
  );
}

function ProfileMenu() {
  const router = useRouter();
  return (
    <Menu>
      <Tooltip content="Account">
        <MenuTrigger asChild>
          <button
            type="button"
            aria-label="Account menu"
            className="ml-1 flex size-7 items-center justify-center rounded-full bg-active text-cell font-semibold text-fg-muted ring-1 ring-line-strong ring-inset hover:text-fg"
          >
            G
          </button>
        </MenuTrigger>
      </Tooltip>
      <MenuContent align="end" className="w-60">
        <div className="px-2 pt-1.5 pb-2">
          <div className="text-ui font-medium text-fg">Guest</div>
          <div className="text-cell text-fg-muted">Your data is saved in this browser.</div>
        </div>
        <MenuSeparator />
        <MenuItem icon={<LogIn />} onSelect={() => comingSoon("Accounts & sync", 5)}>
          Sign in to sync
        </MenuItem>
        <MenuItem
          icon={<Settings2 />}
          shortcut={formatHotkey(SHORTCUTS.settings).join("")}
          onSelect={() => useUi.getState().setSettingsOpen(true)}
        >
          Settings
        </MenuItem>
        <MenuItem icon={<Keyboard />} shortcut="?" onSelect={() => comingSoon("Shortcut sheet", 6)}>
          Keyboard shortcuts
        </MenuItem>
        <MenuSeparator />
        <MenuItem icon={<LayoutDashboard />} onSelect={() => router.push("/design")}>
          Design system
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}

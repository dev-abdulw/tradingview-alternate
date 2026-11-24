"use client";

import { Bell, ChartCandlestick, ChevronLeft, List, Search, Settings2 } from "lucide-react";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { AlertsList } from "@/features/alerts/alert-dialog";
import { useAlerts } from "@/features/alerts/alerts-store";
import { useChart } from "@/features/chart/chart-store";
import { LazyMobileChart } from "@/features/chart/lazy";
import { SettingsForm } from "@/features/settings/settings-dialog";
import { useSettings } from "@/features/settings/settings-store";
import { ListHost } from "@/features/watchlist/list-host";
import { useConnectionStatus, useInstrument, useTicker } from "@/lib/market-data/hooks";
import { changeFor } from "@/lib/market-data/change";
import { formatPercent, formatPrice } from "@/lib/market-data/precision";
import { parseSymbolKey } from "@/lib/market-data/symbol-key";
import { cn } from "@/lib/utils/cn";
import { IconButton } from "@/ui/icon-button";
import { LogoMark } from "@/ui/icons";
import { ConnectionBanner } from "./connection-banner";
import { ConnectionIndicator } from "./connection-indicator";
import { ShellContext, type ShellControls } from "./shell-context";
import { useUi, type MobileTab } from "./ui-store";

/**
 * Phone layout: bottom tab bar (Watchlist · Chart · Alerts · Settings).
 * The watchlist is home; tapping a row opens a full-screen chart.
 */
export function MobileShell() {
  const tab = useUi((s) => s.mobileTab);
  const setTab = useUi((s) => s.setMobileTab);
  const [detailsCollapsed, setDetailsCollapsed] = useState(true);
  const toggleDetails = useCallback(() => setDetailsCollapsed((v) => !v), []);
  const controls = useMemo<ShellControls>(
    () => ({ sidebarCollapsed: false, detailsCollapsed, toggleSidebar: () => {}, toggleDetails }),
    [detailsCollapsed, toggleDetails],
  );

  return (
    <ShellContext value={controls}>
      <div className="flex h-dvh flex-col bg-app">
        <MobileHeader tab={tab} onBack={() => setTab("watchlist")} />
        <ConnectionBanner />
        <main className="min-h-0 flex-1">
          {tab === "watchlist" && <ListHost onSymbolSelected={() => setTab("chart")} />}
          {tab === "chart" && <LazyMobileChart />}
          {tab === "alerts" && <AlertsList className="h-full bg-panel" />}
          {tab === "settings" && (
            <div className="h-full overflow-y-auto bg-panel px-4 pt-2 pb-6">
              <SettingsForm />
            </div>
          )}
        </main>
        <TabBar tab={tab} onChange={setTab} />
      </div>
    </ShellContext>
  );
}

function MobileHeader({ tab, onBack }: { tab: MobileTab; onBack: () => void }) {
  const status = useConnectionStatus();
  const title = { watchlist: "Markets", chart: "", alerts: "Alerts", settings: "Settings" }[tab];
  return (
    <header className="flex h-12 shrink-0 items-center gap-1 bg-panel pr-1 pl-2">
      {tab === "chart" ? (
        <>
          <IconButton
            label="Back to watchlist"
            icon={<ChevronLeft />}
            size="lg"
            tooltip={false}
            onClick={onBack}
          />
          <MobileSymbol />
        </>
      ) : (
        <div className="flex items-center gap-2 pl-1">
          <LogoMark className="text-accent" />
          <h1 className="text-title font-semibold">{title}</h1>
        </div>
      )}
      <div className="flex-1" />
      <ConnectionIndicator status={status} showLabel={false} />
      <IconButton
        label="Search symbols"
        icon={<Search />}
        size="lg"
        tooltip={false}
        onClick={() => useUi.getState().setSearchOpen(true, tab === "watchlist" ? "add" : "open")}
      />
    </header>
  );
}

function MobileSymbol() {
  const key = useChart((s) => s.symbol);
  const instrument = useInstrument(key);
  const t = useTicker(key);
  const locale = useSettings((s) => s.numberFormat);
  const basis = useSettings((s) => s.changeBasis);
  const ch = t ? changeFor(t, basis) : null;
  return (
    <button
      type="button"
      onClick={() => useUi.getState().setSearchOpen(true)}
      className="flex min-w-0 flex-col items-start rounded-control px-1 text-left"
      aria-label="Change symbol"
    >
      <span className="text-ui leading-tight font-semibold">
        {instrument?.displayName ?? parseSymbolKey(key).symbol}
      </span>
      {t && instrument ? (
        <span className="num text-cell leading-tight">
          <span className="text-fg">{formatPrice(t.last, instrument.priceDecimals, locale)}</span>{" "}
          <span className={(ch?.changePct ?? 0) >= 0 ? "text-up" : "text-down"}>
            {ch ? formatPercent(ch.changePct, locale) : ""}
          </span>
        </span>
      ) : (
        <span className="text-cell text-fg-subtle">Loading…</span>
      )}
    </button>
  );
}

function TabBar({ tab, onChange }: { tab: MobileTab; onChange: (t: MobileTab) => void }) {
  const activeAlerts = useAlerts((s) => Object.values(s.rows).filter((a) => a.active).length);
  const items: { id: MobileTab; label: string; icon: ReactNode; badge?: number }[] = [
    { id: "watchlist", label: "Watchlist", icon: <List /> },
    { id: "chart", label: "Chart", icon: <ChartCandlestick /> },
    { id: "alerts", label: "Alerts", icon: <Bell />, badge: activeAlerts },
    { id: "settings", label: "Settings", icon: <Settings2 /> },
  ];
  return (
    <nav
      aria-label="Sections"
      className="grid shrink-0 grid-cols-4 border-t border-line bg-panel pb-[env(safe-area-inset-bottom)]"
    >
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          aria-current={tab === it.id ? "page" : undefined}
          onClick={() => onChange(it.id)}
          className={cn(
            "relative flex h-14 flex-col items-center justify-center gap-0.5 text-meta font-medium [&_svg]:size-5",
            tab === it.id ? "text-accent" : "text-fg-subtle",
          )}
        >
          {it.icon}
          {it.label}
          {!!it.badge && (
            <span className="num absolute top-2 left-[calc(50%+6px)] flex h-4 min-w-4 items-center justify-center rounded-full bg-warning-solid px-1 text-[10px] font-semibold text-on-warning">
              {it.badge}
            </span>
          )}
        </button>
      ))}
    </nav>
  );
}

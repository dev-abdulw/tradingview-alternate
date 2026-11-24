"use client";

import { ArrowLeft, EyeOff, Unplug } from "lucide-react";
import Link from "next/link";
import { use, useEffect, useMemo, useRef, useState } from "react";
import { browser } from "react-dom";
import { ConnectionIndicator } from "@/features/shell/connection-indicator";
import { useTickFlash } from "@/lib/hooks/use-tick-flash";
import type { BinanceProvider } from "@/lib/market-data/binance/provider";
import { useInstrument, useInstruments, useMarkPrice, useTicker } from "@/lib/market-data/hooks";
import {
  formatChange,
  formatFundingRate,
  formatPercent,
  formatPrice,
  formatVolume,
} from "@/lib/market-data/precision";
import { ENABLED_MARKETS, getProvider } from "@/lib/market-data/registry";
import { parseSymbolKey } from "@/lib/market-data/symbol-key";
import type { Kline, SymbolKey } from "@/lib/market-data/types";
import type { StreamStats } from "@/lib/market-data/ws/stream-manager";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/ui/button";
import { AssetClassChip, Chip } from "@/ui/chip";
import { Skeleton } from "@/ui/skeleton";

const MARKETS = ENABLED_MARKETS;

function useNow(ms = 500) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

/** Counts raw (unthrottled) ticks with a second listener on the same stream → refCount 2. */
function useRawTickCount(key: SymbolKey | null) {
  const [count, setCount] = useState(0);
  const n = useRef(0);
  useEffect(() => {
    if (!key) return;
    const { provider, market, symbol } = parseSymbolKey(key);
    const off = getProvider({ provider, market }).subscribeTicker(symbol, () => {
      n.current += 1;
    });
    const id = setInterval(() => setCount(n.current), 500);
    return () => {
      off();
      clearInterval(id);
    };
  }, [key]);
  return count;
}

function TickCard({ symbolKey }: { symbolKey: SymbolKey }) {
  const instrument = useInstrument(symbolKey);
  const t = useTicker(symbolKey);
  const mark = useMarkPrice(symbolKey);
  const raw = useRawTickCount(symbolKey);
  const flash = useTickFlash(t?.last);
  const now = useNow(1000);
  const d = instrument?.priceDecimals ?? 2;
  const isFutures = parseSymbolKey(symbolKey).market === "futures";

  return (
    <article className="rounded-popover bg-panel p-4 ring-1 ring-line" aria-label={`${symbolKey} live ticks`}>
      <header className="mb-3 flex items-center gap-2">
        <span className="text-title font-semibold">
          {instrument?.displayName ?? parseSymbolKey(symbolKey).symbol}
        </span>
        {instrument && <AssetClassChip assetClass={instrument.assetClass} />}
        {isFutures && <Chip>PERP</Chip>}
        <span className="ml-auto truncate text-meta text-fg-subtle">{symbolKey}</span>
      </header>
      {t ? (
        <>
          <div className="flex items-baseline justify-between gap-2">
            <span
              key={flash.seq}
              className={cn(
                "num -mx-1 rounded-[3px] px-1 text-price font-semibold",
                flash.dir === "up" && "animate-flash-up",
                flash.dir === "down" && "animate-flash-down",
              )}
            >
              {formatPrice(t.last, d)}
            </span>
            <span className={cn("num text-ui font-medium", t.change >= 0 ? "text-up" : "text-down")}>
              {formatPercent(t.changePct)}
              {t.dayOpen !== undefined && (
                <span className="ml-2 text-cell text-fg-subtle">
                  day {formatPercent(((t.last - t.dayOpen) / t.dayOpen) * 100)}
                </span>
              )}
            </span>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-cell">
            <Row k="24h change (rolling)" v={formatChange(t.change, d)} />
            <Row k="Daily open (00:00 UTC)" v={t.dayOpen !== undefined ? formatPrice(t.dayOpen, d) : "—"} />
            <Row k="Tick size" v={instrument?.tickSize.replace(/0+$/, "") ?? "—"} />
            <Row k="24h high" v={formatPrice(t.high, d)} />
            <Row k="24h low" v={formatPrice(t.low, d)} />
            <Row k="Volume (quote)" v={formatVolume(t.quoteVolume)} />
            <Row k="Raw ticks" v={String(raw)} />
            <Row k="Last event" v={`${Math.max(0, Math.round((now - t.eventTime) / 1000))}s ago`} />
            {isFutures && (
              <>
                <Row k="Mark" v={mark ? formatPrice(mark.markPrice, d) : "—"} />
                <Row k="Index" v={mark ? formatPrice(mark.indexPrice, d) : "—"} />
                <Row k="Funding" v={mark ? formatFundingRate(mark.fundingRate) : "—"} />
                <Row k="Next funding" v={mark ? countdown(mark.nextFundingTime - now) : "—"} />
              </>
            )}
          </dl>
        </>
      ) : (
        <div className="space-y-2" aria-busy="true">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-3/4" />
        </div>
      )}
    </article>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-fg-muted">{k}</dt>
      <dd className="num text-fg">{v}</dd>
    </div>
  );
}

function countdown(ms: number) {
  if (ms <= 0) return "now";
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function LiveCandle() {
  const [k, setK] = useState<Kline | null>(null);
  const [closed, setClosed] = useState(0);
  useEffect(() => {
    const p = getProvider("binance:spot");
    return p.subscribeKlines("BTCUSDT", "1m", (next) => {
      setK(next);
      if (next.final) setClosed((c) => c + 1);
    });
  }, []);
  const fmt = (n: number) => formatPrice(n, 2);
  return (
    <div className="rounded-popover bg-panel p-4 ring-1 ring-line">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-ui font-semibold">BTCUSDT 1m candle</span>
        <Chip tone={k?.final ? "accent" : "neutral"}>{k?.final ? "closed" : "forming"}</Chip>
        <span className="ml-auto text-meta text-fg-subtle">candles closed this session: {closed}</span>
      </div>
      {k ? (
        <div className="num grid grid-cols-6 gap-2 text-cell">
          <Row k="Open time" v={new Date(k.time).toLocaleTimeString("en-GB")} />
          <Row k="O" v={fmt(k.open)} />
          <Row k="H" v={fmt(k.high)} />
          <Row k="L" v={fmt(k.low)} />
          <Row k="C" v={fmt(k.close)} />
          <Row k="Trades" v={String(k.trades)} />
        </div>
      ) : (
        <Skeleton className="h-4 w-full" />
      )}
    </div>
  );
}

function SocketPanel({ id }: { id: (typeof MARKETS)[number] }) {
  const provider = getProvider(id) as BinanceProvider;
  const [stats, setStats] = useState<StreamStats>(() => provider.streams.stats());
  const [rate, setRate] = useState(0);
  const [hidden, setHidden] = useState(false);
  const prevMsgs = useRef(stats.messages);
  const now = useNow(1000);
  useEffect(() => {
    const id = setInterval(() => {
      const s = provider.streams.stats();
      setRate(s.messages - prevMsgs.current);
      prevMsgs.current = s.messages;
      setStats(s);
    }, 1000);
    return () => clearInterval(id);
  }, [provider]);

  return (
    <section
      className="rounded-popover bg-panel p-4 ring-1 ring-line"
      aria-label={`${provider.label} socket`}
    >
      <header className="mb-3 flex items-center gap-2">
        <span className="text-ui font-semibold">{provider.label}</span>
        <ConnectionIndicator status={stats.status} />
        <div className="ml-auto flex gap-1.5">
          <Button size="xs" variant="outline" onClick={() => provider.streams.simulateDrop()}>
            <Unplug /> Drop connection
          </Button>
          <Button
            size="xs"
            variant={hidden ? "primary" : "outline"}
            onClick={() => {
              provider.setHidden(!hidden);
              setHidden(!hidden);
            }}
          >
            <EyeOff /> {hidden ? "Resume (tab visible)" : "Simulate hidden tab"}
          </Button>
        </div>
      </header>
      <dl className="grid grid-cols-3 gap-x-6 gap-y-1 text-cell">
        <Row k="Streams wired" v={`${stats.wired} / ${stats.desired}`} />
        <Row k="Listeners" v={String(stats.listeners)} />
        <Row k="Messages/s" v={String(rate)} />
        <Row k="Messages total" v={String(stats.messages)} />
        <Row k="Reconnects" v={String(stats.reconnects)} />
        <Row
          k="Connected for"
          v={stats.connectedAt ? countdown(now - stats.connectedAt).replace(/^00:/, "") : "—"}
        />
        <Row k="REST weight (1m)" v={String(provider.limiter.used())} />
      </dl>
      <div className="mt-3 border-t border-line pt-2">
        <div className="meta-label mb-1">Ref counts (listeners per wire stream)</div>
        <ul className="flex flex-wrap gap-1.5">
          {Object.entries(stats.refCounts).map(([stream, n]) => (
            <li key={stream} className="num rounded-[4px] bg-hover px-1.5 py-0.5 text-meta text-fg-muted">
              {stream} <span className="text-fg">×{n}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function BStockDiscovery() {
  const { data, isLoading, error } = useInstruments("binance:spot");
  const stocks = useMemo(
    () =>
      (data ?? [])
        .filter((i) => i.assetClass === "stock")
        .sort((a, b) => a.displayName.localeCompare(b.displayName)),
    [data],
  );
  return (
    <section className="rounded-popover bg-panel p-4 ring-1 ring-line">
      <div className="mb-1 flex items-center gap-2">
        <span className="text-ui font-semibold">bStocks discovered at runtime</span>
        {data && <Chip tone="stock">{stocks.length} stocks</Chip>}
        {data && <span className="text-meta text-fg-subtle">of {data.length} spot pairs</span>}
      </div>
      <p className="mb-3 max-w-3xl text-cell text-fg-muted">
        Rule: base asset ends in <code>B</code>, quoted in USDT, and the pair uses the low-volatility price
        band (PERCENT_PRICE_BY_SIDE bid 1.1/0.8, ask 1.2/0.9). Either signal alone misfires: BNB/ARB/SHIB end
        in B; PAXG, XAUT and fiat pairs share the band.
      </p>
      {isLoading && <Skeleton className="h-16 w-full" />}
      {error && <p className="text-cell text-danger">Couldn’t load exchangeInfo: {String(error)}</p>}
      <ul className="flex max-h-40 flex-wrap gap-1 overflow-y-auto">
        {stocks.map((s) => (
          <li
            key={s.symbol}
            title={s.symbol}
            className="num rounded-[4px] bg-chip-stock-bg px-1.5 text-meta text-chip-stock"
          >
            {s.displayName}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function MarketDebug() {
  use(browser("Live market data runs in the browser."));
  const { data: spot } = useInstruments("binance:spot");
  // Pick a bStock from runtime discovery (never hardcoded): prefer AAPL, else the first found.
  const stock = useMemo(() => {
    const stocks = (spot ?? []).filter((i) => i.assetClass === "stock");
    return (stocks.find((i) => i.displayName === "AAPL") ?? stocks[0])?.key ?? null;
  }, [spot]);

  const cards: SymbolKey[] = ["binance:spot:BTCUSDT", "binance:spot:PAXGUSDT", "binance:spot:XAUTUSDT"];

  return (
    <div className="h-dvh overflow-y-auto">
      <header className="sticky top-0 z-10 flex h-12 items-center gap-3 border-b border-line bg-panel/95 px-6 backdrop-blur">
        <Link href="/" className="flex items-center gap-1.5 text-ui text-fg-muted hover:text-fg">
          <ArrowLeft className="size-4" /> Markets
        </Link>
        <span className="text-line-strong">/</span>
        <h1 className="text-ui font-semibold">Market data debug</h1>
        <span className="ml-2 text-cell text-fg-subtle">
          Phase 2 acceptance: live ticks via the shared WebSocket managers
        </span>
      </header>
      <main className="mx-auto max-w-[1400px] space-y-4 px-6 py-6">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {cards.map((k) => (
            <TickCard key={k} symbolKey={k} />
          ))}
          {stock ? (
            <TickCard symbolKey={stock} />
          ) : (
            <Skeleton className="h-48 rounded-popover" aria-label="Discovering bStocks" />
          )}
        </div>
        <LiveCandle />
        <div className="grid gap-3">
          {MARKETS.map((m) => (
            <SocketPanel key={m} id={m} />
          ))}
        </div>
        <BStockDiscovery />
      </main>
    </div>
  );
}

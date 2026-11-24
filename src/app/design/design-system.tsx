"use client";

import {
  ArrowLeft,
  Bell,
  Copy,
  Flag,
  ListPlus,
  Pencil,
  RefreshCw,
  Search,
  Settings2,
  Star,
  Trash2,
  WifiOff,
} from "lucide-react";
import Link from "next/link";
import { Suspense, use, useState, type ReactNode } from "react";
import { browser } from "react-dom";
import { ConnectionIndicator } from "@/features/shell/connection-indicator";
import { useSettings, type ThemePref } from "@/features/settings/settings-store";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/ui/button";
import { AssetClassChip, Chip } from "@/ui/chip";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogTrigger } from "@/ui/dialog";
import { IconButton } from "@/ui/icon-button";
import { CandlesIcon, FibIcon, HorizontalLineIcon, LineIcon, TrendLineIcon } from "@/ui/icons";
import { Input, Label } from "@/ui/input";
import { Kbd } from "@/ui/kbd";
import {
  Menu,
  MenuCheckboxItem,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
} from "@/ui/menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/ui/popover";
import { Select } from "@/ui/select";
import { Skeleton } from "@/ui/skeleton";
import { menu } from "@/ui/styles";
import { Switch } from "@/ui/switch";
import { SegmentedControl, Tabs, TabsContent, TabsList, TabsTrigger } from "@/ui/tabs";
import { toast } from "@/ui/toast";
import { Tooltip } from "@/ui/tooltip";
import { checkContrast } from "@/ui/tokens/contrast";
import { themes, type ColorTokens, type ThemeName } from "@/ui/tokens/tokens";

/* ------------------------------------------------------------------ */

const GROUPS: { title: string; keys: (keyof ColorTokens)[] }[] = [
  { title: "Surfaces", keys: ["bg-app", "bg-panel", "bg-elevated", "bg-hover", "bg-active", "bg-input"] },
  { title: "Lines", keys: ["border-subtle", "border-strong"] },
  { title: "Text", keys: ["text-primary", "text-secondary", "text-tertiary", "text-disabled"] },
  { title: "Accent", keys: ["accent", "accent-solid", "accent-solid-hover", "on-accent", "accent-muted"] },
  { title: "Direction", keys: ["up", "down", "up-muted", "down-muted"] },
  { title: "Status", keys: ["warning", "warning-solid", "warning-muted", "danger", "danger-muted"] },
  {
    title: "Asset classes",
    keys: ["chip-crypto", "chip-crypto-bg", "chip-metal", "chip-metal-bg", "chip-stock", "chip-stock-bg"],
  },
  { title: "Chart & overlay", keys: ["chart-grid", "chart-crosshair", "scrim", "shadow-color"] },
];

function Section({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-16 border-t border-line py-8">
      <h2 className="text-heading font-semibold tracking-tight text-fg">{title}</h2>
      {description && <p className="mt-1 max-w-2xl text-ui text-fg-muted">{description}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

/** Renders children once per theme, side by side, each in a scoped data-theme. */
function ThemePair({
  children,
  className,
}: {
  children: (theme: ThemeName) => ReactNode;
  className?: string;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {(["dark", "light"] as const).map((t) => (
        <div key={t} data-theme={t} className={cn("rounded-dialog p-5 ring-1 ring-line", className)}>
          <div className="meta-label mb-4">{t} theme</div>
          {children(t)}
        </div>
      ))}
    </div>
  );
}

function Demo({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className="mb-5 last:mb-0">
      <div className="mb-2 text-cell text-fg-subtle">{label}</div>
      <div className={cn("flex flex-wrap items-center gap-2", className)}>{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Swatches({ theme }: { theme: ThemeName }) {
  return (
    <div className="space-y-5">
      {GROUPS.map((g) => (
        <div key={g.title}>
          <div className="mb-2 text-cell font-medium text-fg-muted">{g.title}</div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {g.keys.map((k) => (
              <div
                key={k}
                className="flex items-center gap-2.5 rounded-control bg-panel p-1.5 ring-1 ring-line"
              >
                <span
                  className="size-8 shrink-0 rounded-[5px] ring-1 ring-line-strong"
                  style={{ background: `var(--${k})` }}
                />
                <span className="min-w-0">
                  <span className="block truncate text-cell font-medium text-fg">--{k}</span>
                  <span className="num block truncate text-meta text-fg-subtle">{themes[theme][k]}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ContrastReport() {
  const results = checkContrast();
  const failing = results.filter((r) => !r.pass);
  const tightest = [...results].sort((a, b) => a.ratio / a.min - b.ratio / b.min).slice(0, 10);
  return (
    <div className="rounded-dialog bg-panel p-5 ring-1 ring-line">
      <div className="flex flex-wrap items-center gap-3">
        <Chip tone={failing.length ? "down" : "up"}>
          {failing.length ? `${failing.length} failing` : "All pass"}
        </Chip>
        <span className="text-ui text-fg">
          <span className="num font-semibold">{results.length - failing.length}</span> of{" "}
          <span className="num">{results.length}</span> text/background pairs meet WCAG AA, across both themes
          and both up/down schemes.
        </span>
        <span className="text-cell text-fg-subtle">
          Run <code className="rounded-[4px] bg-hover px-1">pnpm contrast</code> to verify.
        </span>
      </div>
      <table className="mt-4 w-full text-cell">
        <caption className="sr-only">Tightest contrast pairs</caption>
        <thead>
          <tr className="meta-label text-left">
            <th className="py-1.5 font-medium">Theme</th>
            <th className="font-medium">Foreground</th>
            <th className="font-medium">Background</th>
            <th className="font-medium">Use</th>
            <th className="text-right font-medium">Ratio</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {tightest.map((r) => (
            <tr key={`${r.theme}${r.scheme}${r.fg}${r.bg}`} className="h-8">
              <td className="text-fg-muted">
                {r.theme}
                {r.scheme === "blue-orange" && " · CB"}
              </td>
              <td className="text-fg">--{r.fg}</td>
              <td className="text-fg">--{r.bg}</td>
              <td className="text-fg-muted">{r.note}</td>
              <td className={cn("num text-right font-medium", r.pass ? "text-up" : "text-down")}>
                {r.ratio.toFixed(2)} <span className="text-fg-subtle">/ {r.min}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Typography() {
  const prices = [97412.5, 3421.08, 186.42, 0.000_023_41, 2654.3];
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
      <div className="space-y-3">
        <div className="flex items-baseline gap-4">
          <span className="meta-label w-24 shrink-0">Price 22</span>
          <span className="num text-price font-semibold text-fg">97,412.50</span>
          <span className="num text-ui font-medium text-up">+1,184.20 (+1.23%)</span>
        </div>
        <div className="flex items-baseline gap-4">
          <span className="meta-label w-24 shrink-0">Heading 18</span>
          <span className="text-heading font-semibold">Watchlists</span>
        </div>
        <div className="flex items-baseline gap-4">
          <span className="meta-label w-24 shrink-0">Title 15</span>
          <span className="text-title font-semibold">BTCUSDT</span>
        </div>
        <div className="flex items-baseline gap-4">
          <span className="meta-label w-24 shrink-0">UI 13</span>
          <span className="text-ui">Dense interface text for menus, buttons and labels.</span>
        </div>
        <div className="flex items-baseline gap-4">
          <span className="meta-label w-24 shrink-0">Cell 12</span>
          <span className="text-cell text-fg-muted">Table cells, hints and secondary descriptions.</span>
        </div>
        <div className="flex items-baseline gap-4">
          <span className="meta-label w-24 shrink-0">Meta 11</span>
          <span className="meta-label">Uppercase meta label</span>
        </div>
      </div>
      <div className="rounded-control bg-panel p-3 ring-1 ring-line">
        <div className="mb-2 text-cell text-fg-subtle">Tabular numerals, right-aligned</div>
        {prices.map((p) => (
          <div key={p} className="num flex h-6 justify-end text-cell text-fg">
            {p < 1 ? p.toFixed(8) : p.toLocaleString("en-US", { minimumFractionDigits: 2 })}
          </div>
        ))}
      </div>
    </div>
  );
}

function Components() {
  const [seg, setSeg] = useState("1h");
  const [sel, setSel] = useState("Asia/Karachi");
  const [on, setOn] = useState(true);
  return (
    <>
      <Demo label="Buttons">
        <Button variant="primary">Add symbol</Button>
        <Button>Secondary</Button>
        <Button variant="outline">Outline</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="danger">
          <Trash2 /> Delete
        </Button>
        <Button variant="primary" disabled>
          Disabled
        </Button>
      </Demo>
      <Demo label="Sizes">
        <Button size="xs">Extra small</Button>
        <Button size="sm">Small</Button>
        <Button size="md">Medium</Button>
        <Button size="lg" variant="primary">
          Large
        </Button>
      </Demo>
      <Demo label="Icon buttons (hover for tooltip · pressed = active tool)">
        <IconButton label="Trend line" shortcut="T" icon={<TrendLineIcon />} size="md" active />
        <IconButton label="Horizontal line" shortcut="H" icon={<HorizontalLineIcon />} size="md" />
        <IconButton label="Fibonacci retracement" icon={<FibIcon />} size="md" />
        <IconButton label="Alerts" icon={<Bell />} />
        <IconButton label="Settings" icon={<Settings2 />} />
        <IconButton label="Flag" icon={<Flag />} size="xs" />
        <IconButton label="Disabled" icon={<Star />} disabled />
      </Demo>
      <Demo label="Fields" className="grid max-w-md grid-cols-1 items-stretch">
        <Input placeholder="Price" inputMode="decimal" />
        <Input leading={<Search />} placeholder="Search symbols" trailing={<Kbd>⌘K</Kbd>} />
        <Input placeholder="Invalid value" aria-invalid defaultValue="-12" />
        <Input placeholder="Disabled" disabled />
        <div className="grid grid-cols-[auto_1fr] items-center gap-3">
          <Label htmlFor="demo-tz">Time zone</Label>
          <Select
            id="demo-tz"
            value={sel}
            onValueChange={setSel}
            options={[
              { value: "Asia/Karachi", label: "Asia/Karachi", hint: "UTC+5" },
              { value: "UTC", label: "UTC", hint: "UTC" },
              { value: "Europe/London", label: "Europe/London", hint: "UTC+0" },
            ]}
          />
        </div>
      </Demo>
      <Demo label="Segmented control · switch">
        <SegmentedControl
          aria-label="Timeframe"
          value={seg}
          onValueChange={setSeg}
          options={["1m", "5m", "15m", "1h", "4h", "1D"].map((v) => ({ value: v, label: v }))}
        />
        <SegmentedControl
          aria-label="Chart type"
          value="candles"
          onValueChange={() => {}}
          options={[
            { value: "candles", label: <CandlesIcon />, ariaLabel: "Candles" },
            { value: "line", label: <LineIcon />, ariaLabel: "Line" },
          ]}
        />
        <label className="ml-2 flex items-center gap-2 text-ui">
          <Switch checked={on} onCheckedChange={setOn} /> Sync crosshair
        </label>
      </Demo>
      <Demo label="Tabs" className="block">
        <Tabs defaultValue="all">
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="crypto">Crypto</TabsTrigger>
            <TabsTrigger value="metal">Metals</TabsTrigger>
            <TabsTrigger value="stock">Stocks</TabsTrigger>
          </TabsList>
          <TabsContent value="all" className="pt-2 text-cell text-fg-muted">
            Everything Binance lists.
          </TabsContent>
          <TabsContent value="crypto" className="pt-2 text-cell text-fg-muted">
            Spot pairs.
          </TabsContent>
          <TabsContent value="metal" className="pt-2 text-cell text-fg-muted">
            XAUUSDT and XAGUSDT perpetuals.
          </TabsContent>
          <TabsContent value="stock" className="pt-2 text-cell text-fg-muted">
            Tokenized US stocks.
          </TabsContent>
        </Tabs>
      </Demo>
      <Demo label="Chips">
        <AssetClassChip assetClass="crypto" />
        <AssetClassChip assetClass="metal" />
        <AssetClassChip assetClass="stock" />
        <Chip>Perp</Chip>
        <Chip tone="accent">Selected</Chip>
        <Chip tone="warning">Alert</Chip>
        <Chip tone="up">+1.23%</Chip>
        <Chip tone="down">−0.87%</Chip>
      </Demo>
      <Demo label="Keyboard hints">
        <Kbd>⌘</Kbd>
        <Kbd>K</Kbd>
        <Kbd>/</Kbd>
        <Kbd>?</Kbd>
        <Kbd>Esc</Kbd>
      </Demo>
      <Demo label="Menu surface (static render of the menu styles)" className="block">
        <div className={cn(menu.content, "relative w-56 animate-none")} role="presentation">
          <div className={menu.label}>Watchlist</div>
          <div className={cn(menu.item, "bg-hover")}>
            <Pencil /> <span className="flex-1">Rename</span> <span className={menu.shortcut}>F2</span>
          </div>
          <div className={menu.item}>
            <Copy /> <span className="flex-1">Duplicate</span>
          </div>
          <div className={menu.separator} />
          <div className={cn(menu.item, menu.destructive)}>
            <Trash2 /> <span className="flex-1">Delete list</span> <span className={menu.shortcut}>⌫</span>
          </div>
        </div>
      </Demo>
    </>
  );
}

function Overlays() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Menu>
        <MenuTrigger asChild>
          <Button>Open menu</Button>
        </MenuTrigger>
        <MenuContent>
          <MenuLabel>Watchlist</MenuLabel>
          <MenuItem icon={<Pencil />} shortcut="F2">
            Rename
          </MenuItem>
          <MenuItem icon={<Copy />}>Duplicate</MenuItem>
          <MenuCheckboxItem checked>Show volume column</MenuCheckboxItem>
          <MenuSeparator />
          <MenuItem icon={<Trash2 />} destructive>
            Delete list
          </MenuItem>
        </MenuContent>
      </Menu>
      <Popover>
        <PopoverTrigger asChild>
          <Button>Open popover</Button>
        </PopoverTrigger>
        <PopoverContent>
          <div className="mb-3 text-ui font-medium">EMA settings</div>
          <div className="grid grid-cols-[80px_1fr] items-center gap-2">
            <Label htmlFor="ema-len">Length</Label>
            <Input id="ema-len" defaultValue="21" inputMode="numeric" />
            <Label htmlFor="ema-src">Source</Label>
            <Input id="ema-src" defaultValue="close" />
          </div>
        </PopoverContent>
      </Popover>
      <Dialog>
        <DialogTrigger asChild>
          <Button>Open dialog</Button>
        </DialogTrigger>
        <DialogContent title="Delete “Majors”?" description="The list and its 14 symbols will be removed.">
          <DialogBody>
            <p className="text-ui text-fg-muted">You can undo this from the toast for a few seconds.</p>
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" size="sm">
              Cancel
            </Button>
            <Button variant="danger" size="sm">
              Delete list
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Tooltip content="Search symbols" shortcut="⌘K">
        <Button variant="outline">Hover for tooltip</Button>
      </Tooltip>
      <Button
        onClick={() =>
          toast("Removed SOLUSDT", { action: { label: "Undo", onClick: () => toast("Restored") } })
        }
      >
        Toast with undo
      </Button>
      <Button onClick={() => toast.success("Alert created", { description: "BTCUSDT crossing 100,000.00" })}>
        Success toast
      </Button>
      <Button
        onClick={() =>
          toast.warning("BTCUSDT crossed 100,000.00", { description: "Alert triggered 14:32:05" })
        }
      >
        Alert toast
      </Button>
      <Button
        onClick={() =>
          toast.error("Couldn't load klines", { description: "Binance didn't respond. Retrying…" })
        }
      >
        Error toast
      </Button>
    </div>
  );
}

function States() {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div className="rounded-control bg-panel ring-1 ring-line">
        <div className="meta-label border-b border-line px-3 py-2">Loading</div>
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="grid h-8 grid-cols-[1fr_88px_64px] items-center gap-2 px-3">
            <div className="flex items-center gap-2">
              <Skeleton className="size-4 rounded-full" />
              <Skeleton className="h-3" style={{ width: 52 + i * 9 }} />
            </div>
            <Skeleton className="ml-auto h-3 w-16" />
            <Skeleton className="ml-auto h-3 w-11" />
          </div>
        ))}
      </div>
      <div className="flex flex-col items-center justify-center gap-3 rounded-control bg-panel p-6 text-center ring-1 ring-line">
        <div>
          <p className="text-ui font-medium text-fg">This watchlist is empty</p>
          <p className="mt-1 text-cell text-fg-muted">Add symbols to follow live prices.</p>
        </div>
        <Button variant="primary" size="sm">
          <ListPlus /> Add symbol
        </Button>
      </div>
      <div className="flex flex-col items-center justify-center gap-3 rounded-control bg-panel p-6 text-center ring-1 ring-line">
        <div>
          <p className="text-ui font-medium text-fg">Couldn’t load chart history</p>
          <p className="mt-1 text-cell text-fg-muted">
            Binance didn’t respond. Check your connection and try again.
          </p>
        </div>
        <Button size="sm">
          <RefreshCw /> Retry
        </Button>
      </div>
      <div className="flex flex-col gap-3 rounded-control bg-panel p-4 ring-1 ring-line">
        <div className="flex flex-wrap items-center gap-1">
          <ConnectionIndicator status="live" />
          <ConnectionIndicator status="reconnecting" />
          <ConnectionIndicator status="offline" />
          <ConnectionIndicator status="idle" />
        </div>
        <div className="flex items-center gap-2 rounded-control bg-warning-muted px-3 py-2 text-cell text-warning">
          <WifiOff className="size-4" />
          Reconnecting… prices shown may be stale.
        </div>
      </div>
    </div>
  );
}

/** A watchlist row with simulated ticks: flash animation + zero horizontal jitter. */
function TickDemo() {
  const [price, setPrice] = useState(97412.5);
  const [dir, setDir] = useState<"up" | "down" | null>(null);
  const [n, setN] = useState(0);
  const tick = (d: "up" | "down") => {
    setPrice((p) => +(p + (d === "up" ? 1 : -1) * (Math.random() * 40 + 1)).toFixed(1));
    setDir(d);
    setN((x) => x + 1);
  };
  const change = ((price - 96228.3) / 96228.3) * 100;
  return (
    <div className="max-w-md">
      <div className="rounded-control bg-panel ring-1 ring-line">
        <div className="meta-label grid h-7 grid-cols-[1fr_96px_72px] items-center gap-2 border-b border-line px-3">
          <span>Symbol</span>
          <span className="text-right">Last</span>
          <span className="text-right">Chg%</span>
        </div>
        <div className="relative grid h-8 grid-cols-[1fr_96px_72px] items-center gap-2 bg-active px-3 compact:h-7">
          <span aria-hidden="true" className="absolute inset-y-0 left-0 w-0.5 bg-accent" />
          <span className="flex items-center gap-2 text-cell font-medium">
            BTCUSDT <AssetClassChip assetClass="crypto" />
          </span>
          <span
            key={n}
            className={cn(
              "num -mx-1 rounded-[3px] px-1 text-right text-cell text-fg",
              dir === "up" && "animate-flash-up",
              dir === "down" && "animate-flash-down",
            )}
          >
            {price.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
          </span>
          <span className={cn("num text-right text-cell font-medium", change >= 0 ? "text-up" : "text-down")}>
            {change >= 0 ? "+" : "−"}
            {Math.abs(change).toFixed(2)}%
          </span>
        </div>
        <div className="grid h-8 grid-cols-[1fr_96px_72px] items-center gap-2 px-3 hover:bg-hover">
          <span className="flex items-center gap-2 text-cell font-medium">
            XAUUSDT <AssetClassChip assetClass="metal" />
          </span>
          <span className="num text-right text-cell">2,654.30</span>
          <span className="num text-right text-cell font-medium text-down">−0.42%</span>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <Button size="sm" onClick={() => tick("up")}>
          Tick up
        </Button>
        <Button size="sm" onClick={() => tick("down")}>
          Tick down
        </Button>
      </div>
    </div>
  );
}

function ThemeSwitch() {
  use(browser("Reads the saved theme from client storage."));
  const theme = useSettings((s) => s.theme);
  const update = useSettings((s) => s.update);
  return (
    <SegmentedControl<ThemePref>
      aria-label="App theme"
      value={theme}
      onValueChange={(t) => update({ theme: t })}
      options={[
        { value: "dark", label: "Dark" },
        { value: "light", label: "Light" },
        { value: "system", label: "System" },
      ]}
    />
  );
}

const NAV = [
  ["tokens", "Color tokens"],
  ["contrast", "Contrast"],
  ["type", "Typography"],
  ["components", "Components"],
  ["overlays", "Overlays"],
  ["states", "States"],
  ["ticks", "Live ticks"],
  ["foundations", "Foundations"],
] as const;

export function DesignSystem() {
  return (
    <div className="h-dvh overflow-y-auto">
      <header className="sticky top-0 z-10 flex h-12 items-center gap-3 border-b border-line bg-panel/95 px-6 backdrop-blur">
        <Link href="/" className="flex items-center gap-1.5 text-ui text-fg-muted hover:text-fg">
          <ArrowLeft className="size-4" /> Markets
        </Link>
        <span className="text-line-strong">/</span>
        <h1 className="text-ui font-semibold">Design system</h1>
        <nav className="ml-6 hidden gap-4 lg:flex">
          {NAV.map(([id, label]) => (
            <a key={id} href={`#${id}`} className="text-cell text-fg-muted hover:text-fg">
              {label}
            </a>
          ))}
        </nav>
        <div className="flex-1" />
        <span className="hidden text-cell text-fg-subtle sm:inline">Overlays use the app theme</span>
        <Suspense fallback={<Skeleton className="h-8 w-44" />}>
          <ThemeSwitch />
        </Suspense>
      </header>

      <main className="mx-auto max-w-[1400px] px-6 pb-24">
        <div className="py-8">
          <h1 className="text-price font-semibold tracking-tight">Markets design system</h1>
          <p className="mt-2 max-w-2xl text-ui text-fg-muted">
            Data is the hero. Color carries meaning only: green/red for direction, one accent for focus, amber
            for alerts. Everything else is neutral, and surfaces separate by luminance steps rather than
            lines.
          </p>
        </div>

        <Section
          id="tokens"
          title="Color tokens"
          description="Defined once in src/ui/tokens/tokens.ts and generated into CSS variables."
        >
          <ThemePair>{(t) => <Swatches theme={t} />}</ThemePair>
        </Section>

        <Section
          id="contrast"
          title="Contrast"
          description="Checked live from the same token source. The ten tightest pairs are listed."
        >
          <ContrastReport />
        </Section>

        <Section
          id="type"
          title="Typography"
          description="Inter at a 13px base. Every number uses tabular figures."
        >
          <ThemePair>{() => <Typography />}</ThemePair>
        </Section>

        <Section
          id="components"
          title="Components"
          description="Radix primitives restyled to the system. Hover and focus with the keyboard."
        >
          <ThemePair>{() => <Components />}</ThemePair>
        </Section>

        <Section
          id="overlays"
          title="Overlays"
          description="Menus, popovers, dialogs, tooltips and toasts render in a portal using the app theme. Switch it in the header."
        >
          <Overlays />
        </Section>

        <Section
          id="states"
          title="States"
          description="Loading skeletons mirror the real content. Empty and error states always offer a next step."
        >
          <ThemePair>{() => <States />}</ThemePair>
        </Section>

        <Section
          id="ticks"
          title="Live ticks"
          description="A 400ms background fade per tick, disabled for reduced motion. Tabular figures keep the price from shifting horizontally."
        >
          <ThemePair>{() => <TickDemo />}</ThemePair>
        </Section>

        <Section id="foundations" title="Foundations">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-control bg-panel p-4 ring-1 ring-line">
              <div className="mb-3 text-cell font-medium text-fg-muted">Spacing · 4px grid</div>
              {[4, 8, 12, 16, 24, 32].map((s) => (
                <div key={s} className="flex h-6 items-center gap-3">
                  <span className="num w-8 text-right text-cell text-fg-subtle">{s}</span>
                  <span
                    className="h-2 rounded-[2px] bg-accent-muted ring-1 ring-accent"
                    style={{ width: s * 4 }}
                  />
                </div>
              ))}
            </div>
            <div className="rounded-control bg-panel p-4 ring-1 ring-line">
              <div className="mb-3 text-cell font-medium text-fg-muted">Radius</div>
              <div className="flex gap-4">
                {[
                  ["rounded-control", "Controls 6"],
                  ["rounded-popover", "Popovers 8"],
                  ["rounded-dialog", "Dialogs 12"],
                ].map(([cls, label]) => (
                  <div key={cls} className="text-center">
                    <div className={cn("size-14 bg-elevated ring-1 ring-line-strong", cls)} />
                    <div className="mt-1.5 text-meta text-fg-subtle">{label}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-control bg-panel p-4 ring-1 ring-line">
              <div className="mb-3 text-cell font-medium text-fg-muted">Motion</div>
              <dl className="space-y-1.5 text-cell">
                {[
                  ["Fast · hover", "120ms"],
                  ["Base · open/close", "160ms"],
                  ["Slow · panels", "200ms"],
                  ["Tick flash", "400ms"],
                  ["Easing", "ease-out (expo)"],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between">
                    <dt className="text-fg-muted">{k}</dt>
                    <dd className="num text-fg">{v}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-3 text-meta text-fg-subtle">Never animate layout during live updates.</p>
            </div>
          </div>
        </Section>
      </main>
    </div>
  );
}

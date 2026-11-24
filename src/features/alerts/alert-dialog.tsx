"use client";

import { Bell, BellOff, Pencil, Trash2 } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { useChart } from "@/features/chart/chart-store";
import { useSettings } from "@/features/settings/settings-store";
import { useUi } from "@/features/shell/ui-store";
import { SymbolIcon } from "@/features/watchlist/symbol-icon";
import { defaultCondition, describeCondition, type AlertCondition } from "@/lib/alerts/evaluate";
import { useInstrument, useInstrumentMap, useTicker } from "@/lib/market-data/hooks";
import { formatPrice } from "@/lib/market-data/precision";
import type { SymbolKey } from "@/lib/market-data/types";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/ui/button";
import { Chip } from "@/ui/chip";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/ui/dialog";
import { IconButton } from "@/ui/icon-button";
import { Input, Label } from "@/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/ui/popover";
import { SegmentedControl } from "@/ui/tabs";
import { requestNotificationPermission } from "./alert-engine";
import { alertKey, useAlerts, type AlertRow } from "./alerts-store";

/** Create/edit dialog. Opened via useUi.openAlert({ symbol, price, id? }). */
export function AlertDialog() {
  const draft = useUi((s) => s.alertDraft);
  const close = () => useUi.getState().openAlert(null);
  return (
    <Dialog open={draft !== null} onOpenChange={(o) => !o && close()}>
      <DialogContent title={draft?.id ? "Edit alert" : "Create alert"} className="max-w-sm">
        {draft && (
          <AlertForm
            key={`${draft.symbol}|${draft.id ?? ""}|${draft.price ?? ""}`}
            draft={draft}
            onDone={close}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function AlertForm({
  draft,
  onDone,
}: {
  draft: { symbol: SymbolKey; price: number | null; id?: string };
  onDone: () => void;
}) {
  const existing = useAlerts((s) => (draft.id ? s.rows[draft.id] : undefined));
  const instrument = useInstrument(draft.symbol);
  const ticker = useTicker(draft.symbol);
  const locale = useSettings((s) => s.numberFormat);
  const d = instrument?.priceDecimals ?? 2;
  const initialPrice = existing?.price ?? draft.price ?? ticker?.last ?? null;
  const [price, setPrice] = useState(initialPrice === null ? "" : initialPrice.toFixed(d));
  const [condition, setCondition] = useState<AlertCondition>(
    existing?.condition ?? defaultCondition(initialPrice ?? 0, ticker?.last ?? null),
  );
  const [note, setNote] = useState(existing?.note ?? "");
  const value = Number(price);
  const valid = price.trim() !== "" && Number.isFinite(value) && value > 0;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    const tick = Number(instrument?.tickSize ?? "0");
    const rounded = tick > 0 ? Math.round(value / tick) * tick : value;
    const level = Number(rounded.toFixed(d));
    if (existing)
      useAlerts.getState().update(existing.id, { price: level, condition, note: note || null, active: true });
    else useAlerts.getState().create(draft.symbol, condition, level, note);
    requestNotificationPermission();
    onDone();
  };

  return (
    <form onSubmit={submit}>
      <DialogBody className="space-y-3">
        <div className="flex items-center gap-2">
          <SymbolIcon name={instrument?.displayName ?? "?"} assetClass={instrument?.assetClass} size={22} />
          <span className="text-ui font-semibold">{instrument?.displayName ?? draft.symbol}</span>
          <span className="text-cell text-fg-subtle">{instrument?.symbol}</span>
          {ticker && (
            <span className="num ml-auto text-cell text-fg-muted">
              Now {formatPrice(ticker.last, d, locale)}
            </span>
          )}
        </div>
        <div>
          <Label className="mb-1 block">Condition</Label>
          <SegmentedControl<AlertCondition>
            aria-label="Condition"
            value={condition}
            onValueChange={setCondition}
            options={[
              { value: "above", label: "Above" },
              { value: "below", label: "Below" },
              { value: "cross", label: "Crossing" },
            ]}
          />
        </div>
        <div>
          <Label htmlFor="alert-price" className="mb-1 block">
            Price
          </Label>
          <Input
            id="alert-price"
            autoFocus
            inputMode="decimal"
            value={price}
            aria-invalid={!valid && price !== ""}
            onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ""))}
            className="num"
          />
        </div>
        <div>
          <Label htmlFor="alert-note" className="mb-1 block">
            Note <span className="text-fg-subtle">(optional)</span>
          </Label>
          <Input id="alert-note" value={note} maxLength={140} onChange={(e) => setNote(e.target.value)} />
        </div>
        <p className="text-cell text-fg-subtle">
          Alerts run in this browser while the app is open (including in a background tab) and fire once.
        </p>
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" size="sm" type="button" onClick={onDone}>
          Cancel
        </Button>
        <Button variant="primary" size="sm" type="submit" disabled={!valid}>
          {existing ? "Save alert" : "Create alert"}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Top-bar bell: lists active and triggered alerts. */
export function AlertsButton() {
  const rows = useAlerts((s) => s.rows);
  const instruments = useInstrumentMap();
  const locale = useSettings((s) => s.numberFormat);
  const sorted = useMemo(
    () =>
      Object.values(rows).sort(
        (a, b) =>
          Number(b.active) - Number(a.active) ||
          (b.triggered_at ?? b.created_at).localeCompare(a.triggered_at ?? a.created_at),
      ),
    [rows],
  );
  const active = sorted.filter((a) => a.active).length;
  const chartSymbol = useChart((s) => s.symbol);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Alerts${active ? `, ${active} active` : ""}`}
          className="relative inline-flex size-7 items-center justify-center rounded-control text-fg-muted hover:bg-hover hover:text-fg data-[state=open]:bg-hover [&_svg]:size-4"
        >
          <Bell />
          {active > 0 && (
            <span className="num absolute -top-0.5 -right-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-warning-solid px-1 text-[9px] font-semibold text-on-warning">
              {active}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-line px-3 py-2">
          <span className="text-ui font-medium">Alerts</span>
          <Button size="xs" onClick={() => useUi.getState().openAlert({ symbol: chartSymbol, price: null })}>
            New alert
          </Button>
        </div>
        {sorted.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-ui font-medium text-fg">No alerts yet</p>
            <p className="mt-1 text-cell text-fg-muted">
              Right-click a price on the chart, or use the bell on a watchlist row.
            </p>
          </div>
        ) : (
          <ul className="max-h-80 overflow-y-auto py-1">
            {sorted.map((a) => (
              <AlertItem
                key={a.id}
                a={a}
                decimals={instruments.get(alertKey(a))?.priceDecimals}
                name={instruments.get(alertKey(a))?.displayName}
                locale={locale}
              />
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}

function AlertItem({
  a,
  decimals,
  name,
  locale,
}: {
  a: AlertRow;
  decimals: number | undefined;
  name: string | undefined;
  locale: string;
}) {
  const when = a.triggered_at ?? a.created_at;
  return (
    <li className={cn("group flex items-center gap-2 px-3 py-1.5 hover:bg-hover", !a.active && "opacity-70")}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-cell">
          <span className="font-semibold text-fg">{name ?? a.symbol}</span>
          <span className="text-fg-muted">{describeCondition(a.condition)}</span>
          <span className="num text-fg">{formatPrice(a.price, decimals ?? 2, locale)}</span>
          {!a.active && <Chip tone="warning">Triggered</Chip>}
        </div>
        <div className="truncate text-meta text-fg-subtle">
          {a.note ? `${a.note} · ` : ""}
          {new Date(when).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })}
        </div>
      </div>
      <div className="flex opacity-60 group-hover:opacity-100">
        <IconButton
          size="xs"
          label={a.active ? "Pause alert" : "Re-arm alert"}
          icon={a.active ? <BellOff /> : <Bell />}
          onClick={() => useAlerts.getState().update(a.id, { active: !a.active })}
        />
        <IconButton
          size="xs"
          label="Edit alert"
          icon={<Pencil />}
          onClick={() => useUi.getState().openAlert({ symbol: alertKey(a), price: a.price, id: a.id })}
        />
        <IconButton
          size="xs"
          label="Delete alert"
          icon={<Trash2 />}
          onClick={() => useAlerts.getState().remove(a.id)}
        />
      </div>
    </li>
  );
}

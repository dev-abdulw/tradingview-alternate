"use client";

import { Eye, EyeOff, Settings2, X } from "lucide-react";
import { SOURCES, type Source } from "@/lib/indicators/indicators";
import { cn } from "@/lib/utils/cn";
import { Input, Label } from "@/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/ui/popover";
import { Select } from "@/ui/select";
import type { ChartColors } from "./chart-colors";
import { useChart } from "./chart-store";
import {
  INDICATOR_COLORS,
  INDICATOR_META,
  PARAM_LABEL,
  type IndicatorConfig,
  type IndicatorParams,
} from "./indicator-config";

/** Show/hide, settings popover (length, source, color…) and remove for one indicator. */
export function IndicatorControls({ config, colors }: { config: IndicatorConfig; colors: ChartColors }) {
  const update = useChart((s) => s.updateIndicator);
  const remove = useChart((s) => s.removeIndicator);
  const meta = INDICATOR_META[config.kind];
  const btn =
    "inline-flex size-5 items-center justify-center rounded-[4px] text-fg-muted hover:bg-hover hover:text-fg [&_svg]:size-3.5";

  return (
    <span className="flex items-center gap-0.5">
      <button
        type="button"
        className={btn}
        aria-label={config.visible ? `Hide ${meta.short}` : `Show ${meta.short}`}
        aria-pressed={!config.visible}
        onClick={() => update(config.id, { visible: !config.visible })}
      >
        {config.visible ? <Eye /> : <EyeOff />}
      </button>
      <Popover>
        <PopoverTrigger asChild>
          <button type="button" className={btn} aria-label={`${meta.short} settings`}>
            <Settings2 />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-64" onClick={(e) => e.stopPropagation()}>
          <div className="mb-3 text-ui font-medium">{meta.name}</div>
          <div className="grid grid-cols-[72px_1fr] items-center gap-2">
            {meta.fields.map((f) =>
              f === "source" ? (
                <SourceField
                  key={f}
                  value={config.params.source ?? "close"}
                  onChange={(source) => update(config.id, { params: { source } })}
                />
              ) : (
                <NumberField
                  key={`${f}-${config.params[f]}`}
                  field={f}
                  value={config.params[f] as number}
                  onCommit={(v) => update(config.id, { params: { [f]: v } as IndicatorParams })}
                />
              ),
            )}
            <span className="text-cell font-medium text-fg-muted">Color</span>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Line color">
              {INDICATOR_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={config.color === c}
                  aria-label={c}
                  onClick={() => update(config.id, { color: c })}
                  className={cn(
                    "size-5 rounded-full ring-offset-2 ring-offset-elevated",
                    config.color === c && "ring-2 ring-accent",
                  )}
                  style={{ background: colors.token(c) }}
                />
              ))}
            </div>
          </div>
        </PopoverContent>
      </Popover>
      <button
        type="button"
        className={btn}
        aria-label={`Remove ${meta.short}`}
        onClick={() => remove(config.id)}
      >
        <X />
      </button>
    </span>
  );
}

function NumberField({
  field,
  value,
  onCommit,
}: {
  field: keyof IndicatorParams;
  value: number;
  onCommit: (v: number) => void;
}) {
  const id = `ind-${field}`;
  return (
    <>
      <Label htmlFor={id}>{PARAM_LABEL[field]}</Label>
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        defaultValue={value}
        step={field === "mult" ? 0.1 : 1}
        className="h-7"
        onBlur={(e) => onCommit(Number(e.currentTarget.value))}
        onKeyDown={(e) => {
          if (e.key === "Enter") onCommit(Number(e.currentTarget.value));
        }}
      />
    </>
  );
}

function SourceField({ value, onChange }: { value: Source; onChange: (s: Source) => void }) {
  return (
    <>
      <Label htmlFor="ind-source">Source</Label>
      <Select<Source>
        id="ind-source"
        className="h-7"
        value={value}
        onValueChange={onChange}
        options={SOURCES.map((s) => ({ value: s, label: s }))}
      />
    </>
  );
}

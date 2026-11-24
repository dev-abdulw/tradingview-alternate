"use client";

import { Download, Monitor, Moon, Sun, Upload } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { useUi } from "@/features/shell/ui-store";
import { downloadBackup, restoreBackup } from "@/lib/persistence/backup";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/ui/dialog";
import { Select } from "@/ui/select";
import { Switch } from "@/ui/switch";
import { SegmentedControl } from "@/ui/tabs";
import { toast } from "@/ui/toast";
import {
  NUMBER_FORMATS,
  TIMEFRAMES,
  useSettings,
  type Density,
  type NumberFormat,
  type ThemePref,
  type Timeframe,
  type UpDownPref,
} from "./settings-store";

const TIMEZONES = [
  "Asia/Karachi",
  "UTC",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Hong_Kong",
  "Asia/Tokyo",
  "Europe/London",
  "Europe/Berlin",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "Australia/Sydney",
] as const;

const SAMPLE = 97412.5;

function Row({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-6 py-2.5">
      <div className="min-w-0">
        <label htmlFor={htmlFor} className="text-ui font-medium text-fg">
          {label}
        </label>
        {hint && <p className="text-cell text-fg-muted">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function UpDownPreview({ scheme }: { scheme: UpDownPref }) {
  return (
    <span data-updown={scheme} className="num flex gap-1.5 text-cell font-medium">
      <span className="text-up">▲1.24%</span>
      <span className="text-down">▼0.87%</span>
    </span>
  );
}

export function SettingsDialog() {
  const open = useUi((s) => s.settingsOpen);
  const setOpen = useUi((s) => s.setSettingsOpen);
  const reset = useSettings((s) => s.reset);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent title="Settings" description="Saved in this browser." className="max-w-lg">
        <DialogBody>
          <SettingsForm />
        </DialogBody>
        <DialogFooter className="justify-between">
          <Button variant="ghost" size="sm" onClick={reset}>
            Reset to defaults
          </Button>
          <Button variant="primary" size="sm" onClick={() => setOpen(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Settings content, shared by the dialog (desktop) and the Settings tab (phone). */
export function SettingsForm() {
  const s = useSettings();
  return (
    <div className="divide-y divide-line">
      <section className="pb-2">
        <h3 className="meta-label pt-1 pb-1">Appearance</h3>
        <Row label="Theme">
          <SegmentedControl<ThemePref>
            aria-label="Theme"
            value={s.theme}
            onValueChange={(theme) => s.update({ theme })}
            options={[
              {
                value: "dark",
                label: (
                  <>
                    <Moon /> Dark
                  </>
                ),
                ariaLabel: "Dark",
              },
              {
                value: "light",
                label: (
                  <>
                    <Sun /> Light
                  </>
                ),
                ariaLabel: "Light",
              },
              {
                value: "system",
                label: (
                  <>
                    <Monitor /> System
                  </>
                ),
                ariaLabel: "System",
              },
            ]}
            className="[&_button]:gap-1.5"
          />
        </Row>
        <Row label="Up / down colors" hint="Blue–orange is easier to tell apart with color blindness.">
          <div className="flex flex-col gap-1">
            {(["green-red", "blue-orange"] as const).map((scheme) => (
              <button
                key={scheme}
                type="button"
                role="radio"
                aria-checked={s.upDown === scheme}
                onClick={() => s.update({ upDown: scheme })}
                className={cn(
                  "flex h-8 items-center justify-between gap-4 rounded-control px-2.5 text-ui ring-1 ring-line ring-inset hover:bg-hover",
                  s.upDown === scheme && "bg-accent-muted ring-accent",
                )}
              >
                <span className="text-fg">{scheme === "green-red" ? "Green / red" : "Blue / orange"}</span>
                <UpDownPreview scheme={scheme} />
              </button>
            ))}
          </div>
        </Row>
        <Row label="Density" hint="Row height in tables and watchlists.">
          <SegmentedControl<Density>
            aria-label="Density"
            value={s.density}
            onValueChange={(density) => s.update({ density })}
            options={[
              { value: "comfortable", label: "Comfortable" },
              { value: "compact", label: "Compact" },
            ]}
          />
        </Row>
      </section>
      <section className="pt-2">
        <h3 className="meta-label pt-2 pb-1">Data & formatting</h3>
        <Row label="Time zone" htmlFor="settings-tz">
          <Select
            id="settings-tz"
            className="w-48"
            value={s.timezone}
            onValueChange={(timezone) => s.update({ timezone })}
            options={TIMEZONES.map((tz) => ({ value: tz, label: tz.replace("_", " ") }))}
          />
        </Row>
        <Row label="Number format" htmlFor="settings-nf">
          <Select<NumberFormat>
            id="settings-nf"
            className="w-48"
            value={s.numberFormat}
            onValueChange={(numberFormat) => s.update({ numberFormat })}
            options={NUMBER_FORMATS.map((nf) => ({
              value: nf,
              label: (
                <span className="num">
                  {new Intl.NumberFormat(nf, { minimumFractionDigits: 1 }).format(SAMPLE)}
                </span>
              ),
            }))}
          />
        </Row>
        <ChangeBasisRow />
        <Row label="Default timeframe" htmlFor="settings-tf">
          <Select<Timeframe>
            id="settings-tf"
            className="w-48"
            value={s.defaultTimeframe}
            onValueChange={(defaultTimeframe) => s.update({ defaultTimeframe })}
            options={TIMEFRAMES.map((tf) => ({ value: tf, label: tf }))}
          />
        </Row>
      </section>
      <section className="pt-2">
        <h3 className="meta-label pt-2 pb-1">Alerts</h3>
        <Row label="Alert sound" hint="A soft two-tone chime when an alert fires." htmlFor="settings-sound">
          <Switch
            id="settings-sound"
            checked={s.alertSound}
            onCheckedChange={(alertSound) => s.update({ alertSound })}
          />
        </Row>
        <NotificationRow />
      </section>
      <BackupSection />
      <p className="pt-3 text-cell text-fg-subtle">
        Market data comes from Binance public APIs, may be delayed, and is not financial advice.
      </p>
    </div>
  );
}

function NotificationRow() {
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">(() =>
    typeof Notification === "undefined" ? "unsupported" : Notification.permission,
  );
  const label =
    perm === "granted"
      ? "Allowed"
      : perm === "denied"
        ? "Blocked in browser settings"
        : perm === "unsupported"
          ? "Not supported"
          : "Not asked yet";
  return (
    <Row label="Browser notifications" hint="Alerts also notify you when this tab isn’t in front.">
      {perm === "default" ? (
        <Button size="sm" onClick={() => void Notification.requestPermission().then((p) => setPerm(p))}>
          Allow
        </Button>
      ) : (
        <span className="text-cell text-fg-muted">{label}</span>
      )}
    </Row>
  );
}

function BackupSection() {
  const fileRef = useRef<HTMLInputElement>(null);
  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const res = restoreBackup(await file.text());
    if (!res.ok) {
      toast.error("Couldn’t restore backup", { description: res.error });
      return;
    }
    toast.success("Backup restored", { description: "Reloading with your data…" });
    setTimeout(() => window.location.reload(), 600);
  };
  return (
    <section className="pt-2">
      <h3 className="meta-label pt-2 pb-1">Your data</h3>
      <p className="pb-1 text-cell text-fg-muted">
        Watchlists, drawings, alerts and settings are stored in this browser only. Export a backup to keep a
        copy or move to another browser.
      </p>
      <div className="flex gap-2 py-2">
        <Button size="sm" onClick={downloadBackup}>
          <Download /> Export backup
        </Button>
        <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
          <Upload /> Import backup…
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          aria-label="Backup file"
          onChange={(e) => void onFile(e.currentTarget.files?.[0])}
        />
      </div>
      <p className="text-meta text-fg-subtle">Importing replaces the data in this browser.</p>
    </section>
  );
}

function ChangeBasisRow() {
  const basis = useSettings((s) => s.changeBasis);
  const timezone = useSettings((s) => s.timezone);
  const update = useSettings((s) => s.update);
  const midnightUtc = new Date(Date.UTC(2026, 0, 1));
  const local = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(midnightUtc);
  const city = timezone.split("/").pop()?.replace("_", " ") ?? timezone;
  return (
    <Row
      label="Change %"
      hint={
        basis === "daily"
          ? `Since the daily open at 00:00 UTC (${local} in ${city}), like TradingView.`
          : "Versus exactly 24 hours ago, like the Binance app."
      }
    >
      <SegmentedControl<"daily" | "rolling">
        aria-label="Change % basis"
        value={basis}
        onValueChange={(changeBasis) => update({ changeBasis })}
        options={[
          { value: "daily", label: "Since daily open" },
          { value: "rolling", label: "Rolling 24h" },
        ]}
      />
    </Row>
  );
}

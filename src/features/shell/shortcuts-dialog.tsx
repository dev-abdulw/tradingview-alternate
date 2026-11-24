"use client";

import { formatHotkey, isMac } from "@/lib/hooks/use-hotkeys";
import { Dialog, DialogBody, DialogContent } from "@/ui/dialog";
import { Kbd } from "@/ui/kbd";
import { SHORTCUTS } from "./shell-context";
import { useUi } from "./ui-store";

type Row = [label: string, keys: string[][]];

function groups(): { title: string; rows: Row[] }[] {
  const h = (spec: string) => formatHotkey(spec);
  const alt = isMac() ? "⌥" : "Alt";
  return [
    {
      title: "General",
      rows: [
        ["Search symbols", [h(SHORTCUTS.search), ["/"]]],
        ["Settings", [h(SHORTCUTS.settings)]],
        ["Toggle watchlist", [h(SHORTCUTS.toggleSidebar)]],
        ["Toggle symbol details", [h(SHORTCUTS.toggleDetails)]],
        ["Show this sheet", [["?"]]],
      ],
    },
    {
      title: "Watchlist (focus the list)",
      rows: [
        ["Select next / previous", [["↓"], ["↑"]]],
        ["First / last", [["Home"], ["End"]]],
        [
          "Move selected symbol",
          [
            [alt, "↑"],
            [alt, "↓"],
          ],
        ],
        ["Remove selected (undo in toast)", [["⌫"]]],
      ],
    },
    {
      title: "Search",
      rows: [
        ["Move", [["↑"], ["↓"]]],
        ["Open chart", [["↵"]]],
        ["Add to watchlist", [["⇧", "↵"]]],
        ["Next / previous category", [["Tab"], ["⇧", "Tab"]]],
      ],
    },
    {
      title: "Chart",
      rows: [
        ["Trend line", [["T"]]],
        ["Ray", [["R"]]],
        ["Horizontal line", [["H"]]],
        ["Rectangle", [["B"]]],
        ["Fibonacci retracement", [["F"]]],
        ["Cancel drawing / deselect", [["Esc"]]],
        ["Delete selected drawing", [["⌫"]]],
        ["Alert at a price", [["Right-click"]]],
      ],
    },
  ];
}

export function ShortcutsDialog() {
  const open = useUi((s) => s.shortcutsOpen);
  const setOpen = useUi((s) => s.setShortcutsOpen);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent title="Keyboard shortcuts" className="max-w-2xl">
        <DialogBody className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
          {open &&
            groups().map((g) => (
              <section key={g.title}>
                <h3 className="meta-label mb-1.5">{g.title}</h3>
                <dl className="divide-y divide-line">
                  {g.rows.map(([label, combos]) => (
                    <div key={label} className="flex h-8 items-center justify-between gap-4">
                      <dt className="text-cell text-fg-muted">{label}</dt>
                      <dd className="flex items-center gap-1.5">
                        {combos.map((keys, i) => (
                          <span key={i} className="flex items-center gap-0.5">
                            {i > 0 && <span className="mr-1 text-meta text-fg-subtle">or</span>}
                            {keys.map((k) => (
                              <Kbd key={k}>{k}</Kbd>
                            ))}
                          </span>
                        ))}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

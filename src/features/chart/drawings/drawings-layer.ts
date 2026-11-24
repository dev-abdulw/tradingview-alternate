/**
 * Renders drawings on the price pane (as a Lightweight Charts pane primitive)
 * and handles placement, selection and dragging with pointer events.
 */
import type {
  IPanePrimitive,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  PaneAttachedParameter,
  Time,
} from "lightweight-charts";
import { formatPrice } from "@/lib/market-data/precision";
import type { ChartColors } from "../chart-colors";
import { toTime, type ChartController } from "../chart-controller";
import type { DrawingRow } from "./drawings-store";
import {
  FIB_LEVELS,
  fibPrices,
  hitTest,
  logicalToTime,
  POINTS_NEEDED,
  rayEnd,
  timeToLogical,
  type Anchor,
  type DrawingType,
  type HitShape,
  type Pt,
} from "./geometry";

type Target = Parameters<IPrimitivePaneRenderer["draw"]>[0];

export type LayerState = {
  drawings: DrawingRow[];
  selectedId: string | null;
  hidden: boolean;
  tool: DrawingType | null;
  magnet: boolean;
  colors: ChartColors;
  decimals: number;
  locale: string;
  intervalSec: number;
};

export type LayerCallbacks = {
  onCreate: (type: DrawingType, points: Anchor[]) => void;
  onUpdate: (id: string, points: Anchor[]) => void;
  onSelect: (id: string | null) => void;
};

type Drag = { id: string; part: "body" | number; start: Anchor; original: Anchor[]; moved: boolean };

export class DrawingsLayer implements IPanePrimitive<Time> {
  private state: LayerState;
  private requestUpdate: (() => void) | null = null;
  private draft: { type: DrawingType; points: Anchor[]; cursor: Anchor | null } | null = null;
  private drag: Drag | null = null;
  /** Live geometry while dragging (committed on pointer up). */
  private livePoints = new Map<string, Anchor[]>();
  private hoverId: string | null = null;
  private down: { x: number; y: number } | null = null;
  private times: number[] = [];
  private timesSig = "";
  private readonly view: IPrimitivePaneView;

  constructor(
    private readonly ctl: ChartController,
    initial: LayerState,
    private readonly cb: LayerCallbacks,
  ) {
    this.state = initial;
    this.view = { renderer: () => ({ draw: (t) => this.draw(t) }), zOrder: () => "top" };
    ctl.chart.panes()[0]?.attachPrimitive(this);
    const el = ctl.container;
    el.addEventListener("pointerdown", this.onDown, true);
    el.addEventListener("mousedown", this.swallow, true);
    el.addEventListener("touchstart", this.swallow, { capture: true, passive: false });
    window.addEventListener("pointermove", this.onMove);
    window.addEventListener("pointerup", this.onUp);
  }

  /* ----------------------------- primitive API ---------------------------- */

  attached({ requestUpdate }: PaneAttachedParameter<Time>) {
    this.requestUpdate = requestUpdate;
  }
  detached() {
    this.requestUpdate = null;
  }
  paneViews() {
    return [this.view];
  }
  updateAllViews() {}

  /* -------------------------------- public -------------------------------- */

  setState(next: Partial<LayerState>) {
    const toolChanged = next.tool !== undefined && next.tool !== this.state.tool;
    this.state = { ...this.state, ...next };
    if (toolChanged) this.draft = null;
    this.ctl.container.style.cursor = this.state.tool ? "crosshair" : "";
    this.requestUpdate?.();
  }

  cancelDraft(): boolean {
    if (!this.draft) return false;
    this.draft = null;
    this.requestUpdate?.();
    return true;
  }

  destroy() {
    const el = this.ctl.container;
    el.removeEventListener("pointerdown", this.onDown, true);
    el.removeEventListener("mousedown", this.swallow, true);
    el.removeEventListener("touchstart", this.swallow, true);
    window.removeEventListener("pointermove", this.onMove);
    window.removeEventListener("pointerup", this.onUp);
    try {
      this.ctl.chart.panes()[0]?.detachPrimitive(this);
    } catch {
      /* chart already removed */
    }
    el.style.cursor = "";
  }

  /* ------------------------------ coordinates ----------------------------- */

  private syncTimes() {
    const d = this.ctl.data;
    const sig = `${d.length}|${d[0]?.time}|${d[d.length - 1]?.time}`;
    if (sig !== this.timesSig) {
      this.times = d.map((b) => toTime(b.time));
      this.timesSig = sig;
    }
  }

  private xOf(t: number): number | null {
    const l = timeToLogical(this.times, this.state.intervalSec, t);
    return l === null ? null : this.ctl.chart.timeScale().logicalToCoordinate(l as never);
  }

  private yOf(p: number): number | null {
    return this.ctl.main.priceToCoordinate(p);
  }

  private toPx(a: Anchor): Pt | null {
    const x = this.xOf(a.t);
    const y = this.yOf(a.p);
    return x === null || y === null ? null : { x, y };
  }

  /** Pixel → anchor, snapped to the nearest bar (and to OHLC with the magnet on). */
  private anchorAt(x: number, y: number): Anchor | null {
    this.syncTimes();
    const raw = this.ctl.chart.timeScale().coordinateToLogical(x);
    const price = this.ctl.main.coordinateToPrice(y);
    if (raw === null || price === null) return null;
    const logical = Math.round(raw);
    const t = logicalToTime(this.times, this.state.intervalSec, logical);
    if (t === null) return null;
    let p: number = price;
    const bar = this.ctl.data[logical];
    if (this.state.magnet && bar) {
      let best = Infinity;
      for (const v of [bar.open, bar.high, bar.low, bar.close]) {
        const vy = this.yOf(v);
        if (vy !== null && Math.abs(vy - y) < best) {
          best = Math.abs(vy - y);
          p = v;
        }
      }
    }
    return { t, p };
  }

  private local(e: PointerEvent): Pt & { inPane: boolean } {
    const r = this.ctl.container.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    const pane = this.ctl.paneRects()[0];
    const width = this.ctl.chart.timeScale().width();
    return { x, y, inPane: !!pane && y >= 0 && y <= pane.height && x >= 0 && x <= width };
  }

  private pointsOf(d: DrawingRow): Anchor[] {
    return this.livePoints.get(d.id) ?? d.data.points;
  }

  private shapeOf(type: DrawingType, pts: Pt[], anchors: Anchor[]): HitShape | null {
    const [a, b] = pts;
    if (!a) return null;
    if (type === "hline") return { type: "hline", y: a.y };
    if (!b) return null;
    const size = this.ctl.paneRects()[0];
    if (type === "ray")
      return { type: "segment", a, b: rayEnd(a, b, this.ctl.chart.timeScale().width(), size?.height ?? 0) };
    if (type === "rect") return { type: "rect", a, b };
    if (type === "fib") {
      const ys = fibPrices(anchors[0]!, anchors[1]!)
        .map((l) => this.yOf(l.price))
        .filter((v): v is number => v !== null);
      return { type: "fib", a, b, ys };
    }
    return { type: "segment", a, b };
  }

  private hit(p: Pt): { id: string; part: "body" | number } | null {
    if (this.state.hidden) return null;
    // Topmost (last drawn) first.
    for (const d of [...this.state.drawings].reverse()) {
      const anchors = this.pointsOf(d);
      const pts = anchors.map((a) => this.toPx(a)).filter((x): x is Pt => x !== null);
      const shape = this.shapeOf(d.data.type, pts, anchors);
      if (!shape) continue;
      const handles = d.data.type === "hline" ? [] : pts;
      const h = hitTest(shape, handles, p);
      if (h) return { id: d.id, part: h.part === "handle" ? h.index : "body" };
    }
    return null;
  }

  /* ------------------------------- pointer -------------------------------- */

  private swallow = (e: Event) => {
    if (this.drag) e.stopPropagation();
  };

  private onDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    this.syncTimes();
    const p = this.local(e);
    if (!p.inPane) return;
    this.down = { x: p.x, y: p.y };
    if (this.state.tool) return; // placing: decided on pointer up (click vs. pan)
    const h = this.hit(p);
    if (!h) return;
    const d = this.state.drawings.find((x) => x.id === h.id);
    const start = this.anchorAt(p.x, p.y);
    if (!d || !start) return;
    this.cb.onSelect(h.id);
    this.drag = { id: h.id, part: h.part, start, original: d.data.points, moved: false };
    // Keep the chart from panning while we move the drawing.
    e.stopPropagation();
    e.preventDefault();
  };

  private onMove = (e: PointerEvent) => {
    const p = this.local(e);
    if (this.drag) {
      const cur = this.anchorAt(p.x, p.y);
      if (!cur) return;
      const { part, original, start } = this.drag;
      const next =
        part === "body"
          ? original.map((a) => ({ t: a.t + (cur.t - start.t), p: a.p + (cur.p - start.p) }))
          : original.map((a, i) => (i === part ? cur : a));
      this.drag.moved = true;
      this.livePoints.set(this.drag.id, next);
      this.requestUpdate?.();
      return;
    }
    if (this.draft && p.inPane) {
      this.draft.cursor = this.anchorAt(p.x, p.y);
      this.requestUpdate?.();
      return;
    }
    if (!this.state.tool && p.inPane) {
      const h = this.hit(p);
      const id = h?.id ?? null;
      this.ctl.container.style.cursor = h ? (h.part === "body" ? "move" : "grab") : "";
      if (id !== this.hoverId) {
        this.hoverId = id;
        this.requestUpdate?.();
      }
    }
  };

  private onUp = (e: PointerEvent) => {
    const p = this.local(e);
    const wasClick = this.down !== null && Math.hypot(p.x - this.down.x, p.y - this.down.y) < 4;
    this.down = null;

    if (this.drag) {
      const { id, moved } = this.drag;
      const pts = this.livePoints.get(id);
      this.drag = null;
      this.livePoints.delete(id);
      if (moved && pts) this.cb.onUpdate(id, pts);
      this.requestUpdate?.();
      return;
    }
    if (!wasClick || !p.inPane) return;

    const tool = this.state.tool;
    if (!tool) {
      if (!this.hit(p)) this.cb.onSelect(null);
      return;
    }
    const a = this.anchorAt(p.x, p.y);
    if (!a) return;
    const points = [...(this.draft?.points ?? []), a];
    if (points.length >= POINTS_NEEDED[tool]) {
      this.draft = null;
      this.cb.onCreate(tool, points);
    } else {
      this.draft = { type: tool, points, cursor: a };
    }
    this.requestUpdate?.();
  };

  /* -------------------------------- drawing ------------------------------- */

  private draw(target: Target) {
    this.syncTimes();
    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      if (!this.state.hidden) {
        for (const d of this.state.drawings) {
          const active = d.id === this.state.selectedId || d.id === this.hoverId || this.drag?.id === d.id;
          this.paint(
            ctx,
            mediaSize.width,
            d.data.type,
            this.pointsOf(d),
            this.state.colors.token(d.data.color),
            active,
          );
        }
      }
      if (this.draft) {
        const pts = [...this.draft.points, ...(this.draft.cursor ? [this.draft.cursor] : [])];
        this.paint(ctx, mediaSize.width, this.draft.type, pts, this.state.colors.selection, true);
      }
    });
  }

  private paint(
    ctx: CanvasRenderingContext2D,
    width: number,
    type: DrawingType,
    anchors: Anchor[],
    color: string,
    active: boolean,
  ) {
    const pts = anchors.map((a) => this.toPx(a)).filter((x): x is Pt => x !== null);
    const [a, b] = pts;
    if (!a) return;
    const { colors, decimals, locale } = this.state;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = active ? 2 : 1.5;
    ctx.font = "11px Inter, ui-sans-serif, system-ui, sans-serif";
    ctx.textBaseline = "middle";

    const line = (p: Pt, q: Pt) => {
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(q.x, q.y);
      ctx.stroke();
    };

    switch (type) {
      case "hline": {
        line({ x: 0, y: a.y }, { x: width, y: a.y });
        const label = formatPrice(anchors[0]!.p, decimals, locale);
        const w = ctx.measureText(label).width + 10;
        ctx.globalAlpha = 0.9;
        ctx.fillRect(width - w - 4, a.y - 9, w, 18);
        ctx.globalAlpha = 1;
        ctx.fillStyle = colors.background;
        ctx.fillText(label, width - w + 1, a.y);
        break;
      }
      case "trend":
        if (b) line(a, b);
        break;
      case "ray":
        if (b) line(a, rayEnd(a, b, width, ctx.canvas.height));
        break;
      case "rect":
        if (b) {
          ctx.globalAlpha = 0.1;
          ctx.fillRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
          ctx.globalAlpha = 1;
          ctx.strokeRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
        }
        break;
      case "fib":
        if (b && anchors[1]) {
          const x0 = Math.min(a.x, b.x);
          const x1 = Math.max(a.x, b.x);
          const levels = fibPrices(anchors[0]!, anchors[1]);
          levels.forEach((l, i) => {
            const y = this.yOf(l.price);
            if (y === null) return;
            const next = levels[i + 1] ? this.yOf(levels[i + 1]!.price) : null;
            if (next !== null && next !== undefined) {
              ctx.globalAlpha = 0.05 + (i % 2) * 0.04;
              ctx.fillRect(x0, Math.min(y, next), x1 - x0, Math.abs(next - y));
              ctx.globalAlpha = 1;
            }
            ctx.globalAlpha = l.level === 0 || l.level === 1 || l.level === 0.5 ? 1 : 0.7;
            line({ x: x0, y }, { x: x1, y });
            ctx.globalAlpha = 1;
            ctx.fillStyle = colors.text;
            ctx.fillText(`${FIB_LEVELS[i]} (${formatPrice(l.price, decimals, locale)})`, x0 + 4, y - 7);
            ctx.fillStyle = color;
          });
          ctx.setLineDash([3, 3]);
          ctx.globalAlpha = 0.6;
          line(a, b);
          ctx.setLineDash([]);
          ctx.globalAlpha = 1;
        }
        break;
    }

    if (active && type !== "hline") {
      for (const p of pts) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = colors.background;
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = color;
        ctx.stroke();
      }
    }
    ctx.restore();
  }
}

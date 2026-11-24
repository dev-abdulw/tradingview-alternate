/**
 * One shared WebSocket per market, speaking Binance's combined-stream protocol
 * ({ method: "SUBSCRIBE" | "UNSUBSCRIBE", params, id } → { stream, data }).
 *
 * - Ref-counted: any number of listeners share one wire subscription per stream.
 * - Diff-based, batched control messages, throttled to the per-connection limit.
 * - Exponential backoff with jitter; resubscribes everything after reconnect.
 * - Planned reconnect before Binance's 24h forced disconnect.
 * - Liveness watchdog for half-open sockets (sleep/wake, flaky Wi-Fi).
 * - Pauses on `offline`; pauses foreground-only streams while the tab is hidden.
 */
import type { ConnectionSource, ConnectionStatus, Unsubscribe } from "../types";

type Handler = (data: unknown) => void;
type Entry = { fn: Handler; background: boolean };

/** The subset of the WebSocket API the manager uses (lets tests inject a fake). */
export interface SocketLike {
  readonly readyState: number;
  onopen: ((ev: Event) => void) | null;
  onclose: ((ev: CloseEvent) => void) | null;
  onerror: ((ev: Event) => void) | null;
  onmessage: ((ev: MessageEvent) => void) | null;
  send(data: string): void;
  close(code?: number, reason?: string): void;
}
export type SocketFactory = (url: string) => SocketLike;

export type StreamManagerOptions = {
  /** One URL, or several to rotate through when connecting keeps failing (regional blocks). */
  url: string | string[];
  /** Failed connects (never opened) before rotating to the next URL. */
  failoverAfter?: number;
  /** Binance: 1024 streams per connection. */
  maxStreams?: number;
  /** Incoming control messages per second per connection (spot 5, futures 10). Stay under it. */
  maxControlPerSecond?: number;
  /** Params per SUBSCRIBE message. */
  batchSize?: number;
  /** Reconnect before the server's 24h hard limit. */
  maxConnectionAgeMs?: number;
  /** Treat the socket as dead if nothing arrives for this long while streams are wired. */
  livenessTimeoutMs?: number;
  /** Close the socket this long after the last subscription goes away (avoids thrash). */
  idleCloseMs?: number;
  backoff?: { baseMs: number; maxMs: number };
  createSocket?: SocketFactory;
  random?: () => number;
  now?: () => number;
  /** Starting network state; the manager also listens to online/offline events when a window exists. */
  online?: boolean;
  onWarning?: (message: string) => void;
};

export type StreamStats = {
  status: ConnectionStatus;
  desired: number;
  wired: number;
  listeners: number;
  refCounts: Record<string, number>;
  messages: number;
  reconnects: number;
  connectedAt: number | null;
  lastMessageAt: number | null;
};

const OPEN = 1;
const CONNECTING = 0;

export class StreamManager implements ConnectionSource {
  private readonly opts: Required<Omit<StreamManagerOptions, "onWarning" | "online" | "url">> &
    Pick<StreamManagerOptions, "onWarning">;
  private readonly urls: string[];
  private urlIndex = 0;
  private failedOpens = 0;
  private opened = false;
  private readonly subs = new Map<string, Set<Entry>>();
  /** Streams currently subscribed on the open socket. */
  private wired = new Set<string>();
  private socket: SocketLike | null = null;
  private status: ConnectionStatus = "idle";
  private readonly statusListeners = new Set<(s: ConnectionStatus) => void>();

  private hidden = false;
  private online: boolean;
  private attempt = 0;
  private nextId = 1;
  private sentTimes: number[] = [];

  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private ageTimer: ReturnType<typeof setTimeout> | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private livenessTimer: ReturnType<typeof setInterval> | null = null;

  private messages = 0;
  private reconnects = 0;
  private connectedAt: number | null = null;
  private lastMessageAt: number | null = null;
  private destroyed = false;
  private readonly detachWindow: () => void;

  constructor(options: StreamManagerOptions) {
    this.opts = {
      failoverAfter: 2,
      maxStreams: 1024,
      maxControlPerSecond: 5,
      batchSize: 100,
      maxConnectionAgeMs: 23.5 * 60 * 60 * 1000,
      livenessTimeoutMs: 30_000,
      idleCloseMs: 5_000,
      backoff: { baseMs: 500, maxMs: 30_000 },
      createSocket: (url) => new WebSocket(url),
      random: Math.random,
      now: Date.now,
      ...options,
    };
    this.urls = Array.isArray(options.url) ? options.url : [options.url];
    this.online = options.online ?? (typeof navigator === "undefined" ? true : navigator.onLine !== false);
    this.detachWindow = this.attachWindow();
  }

  /* ------------------------------ public API ------------------------------ */

  subscribe(stream: string, fn: Handler, { background = false } = {}): Unsubscribe {
    const entry: Entry = { fn, background };
    let set = this.subs.get(stream);
    if (!set) {
      set = new Set();
      this.subs.set(stream, set);
    }
    set.add(entry);
    this.reconcile();
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      const s = this.subs.get(stream);
      if (!s) return;
      s.delete(entry);
      if (s.size === 0) this.subs.delete(stream);
      this.reconcile();
    };
  }

  getStatus(): ConnectionStatus {
    return this.status;
  }

  onStatus(cb: (s: ConnectionStatus) => void): Unsubscribe {
    this.statusListeners.add(cb);
    return () => this.statusListeners.delete(cb);
  }

  setHidden(hidden: boolean): void {
    if (this.hidden === hidden) return;
    this.hidden = hidden;
    this.reconcile();
  }

  setOnline(online: boolean): void {
    if (this.online === online) return;
    this.online = online;
    if (!online) {
      this.clearTimer("reconnectTimer");
      this.teardownSocket();
      this.setStatus(this.desired().size ? "offline" : "idle");
      return;
    }
    this.attempt = 0;
    this.reconcile();
  }

  /** Drop the connection as if the network failed (debug page / tests). */
  simulateDrop(): void {
    this.forceReconnect(4000, "simulated drop");
  }

  /** The URL currently in use (changes on failover). */
  currentUrl(): string {
    return this.urls[this.urlIndex] ?? this.urls[0]!;
  }

  stats(): StreamStats {
    const refCounts: Record<string, number> = {};
    let listeners = 0;
    for (const [k, v] of this.subs) {
      refCounts[k] = v.size;
      listeners += v.size;
    }
    return {
      status: this.status,
      desired: this.desired().size,
      wired: this.wired.size,
      listeners,
      refCounts,
      messages: this.messages,
      reconnects: this.reconnects,
      connectedAt: this.connectedAt,
      lastMessageAt: this.lastMessageAt,
    };
  }

  destroy(): void {
    this.destroyed = true;
    this.subs.clear();
    for (const t of ["flushTimer", "reconnectTimer", "ageTimer", "idleTimer"] as const) this.clearTimer(t);
    this.stopLiveness();
    this.teardownSocket();
    this.detachWindow();
    this.statusListeners.clear();
  }

  /* ------------------------------ internals ------------------------------- */

  /** Streams that should be on the wire right now. */
  private desired(): Set<string> {
    const out = new Set<string>();
    for (const [stream, entries] of this.subs) {
      if (!this.hidden) {
        out.add(stream);
        continue;
      }
      for (const e of entries) {
        if (e.background) {
          out.add(stream);
          break;
        }
      }
    }
    return out;
  }

  private reconcile(): void {
    if (this.destroyed) return;
    const desired = this.desired();

    if (desired.size > this.opts.maxStreams) {
      this.opts.onWarning?.(
        `${desired.size} streams requested; the connection allows ${this.opts.maxStreams}. Extra streams are ignored.`,
      );
    }

    if (desired.size === 0) {
      this.clearTimer("reconnectTimer");
      if (this.socket && !this.idleTimer) {
        this.idleTimer = setTimeout(() => {
          this.idleTimer = null;
          if (this.desired().size === 0) {
            this.teardownSocket();
            this.setStatus("idle");
          }
        }, this.opts.idleCloseMs);
      }
      if (!this.socket) this.setStatus("idle");
      this.scheduleFlush();
      return;
    }

    this.clearTimer("idleTimer");
    if (!this.online) {
      this.setStatus("offline");
      return;
    }
    if (!this.socket && !this.reconnectTimer) this.connect();
    else this.scheduleFlush();
  }

  private connect(): void {
    if (this.destroyed || !this.online) return;
    this.setStatus(this.attempt === 0 ? "connecting" : "reconnecting");
    let socket: SocketLike;
    try {
      socket = this.opts.createSocket(this.currentUrl());
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.socket = socket;
    this.wired = new Set();
    this.sentTimes = [];
    this.opened = false;

    socket.onopen = () => {
      if (this.socket !== socket) return;
      this.attempt = 0;
      this.opened = true;
      this.failedOpens = 0;
      this.connectedAt = this.opts.now();
      this.lastMessageAt = this.connectedAt;
      this.setStatus("live");
      this.startLiveness();
      this.clearTimer("ageTimer");
      this.ageTimer = setTimeout(() => this.plannedReconnect(), this.opts.maxConnectionAgeMs);
      this.scheduleFlush(true);
    };
    socket.onmessage = (ev) => {
      if (this.socket !== socket) return;
      this.onMessage(ev.data);
    };
    socket.onerror = () => {
      /* onclose follows; handled there */
    };
    socket.onclose = () => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.wired = new Set();
      this.connectedAt = null;
      this.stopLiveness();
      this.clearTimer("ageTimer");
      this.clearTimer("flushTimer");
      if (this.destroyed) return;
      if (!this.online) return this.setStatus(this.desired().size ? "offline" : "idle");
      if (this.desired().size === 0) return this.setStatus("idle");
      if (!this.opened) this.noteFailedOpen();
      this.scheduleReconnect();
    };
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.destroyed) return;
    this.setStatus("reconnecting");
    const { baseMs, maxMs } = this.opts.backoff;
    const exp = Math.min(maxMs, baseMs * 2 ** this.attempt);
    // "Equal jitter": half fixed, half random — spreads a fleet of clients after an outage.
    const delay = exp / 2 + this.opts.random() * (exp / 2);
    this.attempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnects += 1;
      if (this.desired().size > 0) this.connect();
      else this.setStatus("idle");
    }, delay);
  }

  /** Rotate hosts after repeated connects that never opened. */
  private noteFailedOpen(): void {
    this.failedOpens += 1;
    if (this.urls.length > 1 && this.failedOpens >= this.opts.failoverAfter) {
      this.failedOpens = 0;
      this.urlIndex = (this.urlIndex + 1) % this.urls.length;
      this.opts.onWarning?.(`Connection keeps failing; switching to ${this.currentUrl()}`);
    }
  }

  /**
   * Abandon the current socket without waiting for the close handshake (some
   * servers take seconds to answer it) and reconnect with backoff.
   */
  private forceReconnect(code: number, reason: string): void {
    const s = this.socket;
    if (!s) return;
    this.socket = null;
    this.wired = new Set();
    this.connectedAt = null;
    this.stopLiveness();
    this.clearTimer("ageTimer");
    this.clearTimer("flushTimer");
    detach(s);
    s.close(code, reason);
    if (this.desired().size > 0 && this.online) this.scheduleReconnect();
    else this.setStatus(this.online ? "idle" : "offline");
  }

  private plannedReconnect(): void {
    this.ageTimer = null;
    const old = this.socket;
    if (!old) return;
    this.socket = null;
    this.wired = new Set();
    this.stopLiveness();
    detach(old);
    old.close(1000, "planned reconnect");
    this.attempt = 0;
    this.reconnects += 1;
    this.connect();
  }

  private teardownSocket(): void {
    const s = this.socket;
    this.socket = null;
    this.wired = new Set();
    this.connectedAt = null;
    this.stopLiveness();
    this.clearTimer("ageTimer");
    this.clearTimer("flushTimer");
    if (s) {
      detach(s);
      if (s.readyState === OPEN || s.readyState === CONNECTING) s.close(1000, "closed by client");
    }
  }

  private onMessage(raw: unknown): void {
    this.lastMessageAt = this.opts.now();
    if (typeof raw !== "string") return;
    let msg: unknown;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (!isObject(msg)) return;
    if (typeof msg.stream === "string") {
      this.messages += 1;
      const entries = this.subs.get(msg.stream);
      if (!entries) return;
      for (const e of [...entries]) {
        try {
          e.fn(msg.data);
        } catch (err) {
          this.opts.onWarning?.(`Stream handler for ${msg.stream} threw: ${String(err)}`);
        }
      }
      return;
    }
    if (isObject(msg.error)) {
      this.opts.onWarning?.(`Stream error: ${JSON.stringify(msg.error)}`);
    }
    // Plain acks ({ result: null, id }) need no action: Binance acks unknown streams too,
    // so an ack never proves a stream exists — the liveness check covers dead streams.
  }

  /* ------------------------- batching & rate limit ------------------------ */

  private scheduleFlush(immediate = false): void {
    if (this.flushTimer) return;
    // Coalesce a burst of subscribe/unsubscribe calls (e.g. a 200-row list mounting) into one diff.
    this.flushTimer = setTimeout(
      () => {
        this.flushTimer = null;
        this.flush();
      },
      immediate ? 0 : 16,
    );
  }

  private flush(): void {
    const s = this.socket;
    if (!s || s.readyState !== OPEN) return;
    const desired = [...this.desired()].slice(0, this.opts.maxStreams);
    const want = new Set(desired);
    const toUnsub = [...this.wired].filter((x) => !want.has(x));
    const toSub = desired.filter((x) => !this.wired.has(x));

    const batches: { method: "SUBSCRIBE" | "UNSUBSCRIBE"; params: string[] }[] = [];
    for (let i = 0; i < toUnsub.length; i += this.opts.batchSize)
      batches.push({ method: "UNSUBSCRIBE", params: toUnsub.slice(i, i + this.opts.batchSize) });
    for (let i = 0; i < toSub.length; i += this.opts.batchSize)
      batches.push({ method: "SUBSCRIBE", params: toSub.slice(i, i + this.opts.batchSize) });

    for (const batch of batches) {
      const wait = this.rateLimitWait();
      if (wait > 0) {
        // Over budget: try again once a slot frees up. State is diffed again then.
        this.flushTimer = setTimeout(() => {
          this.flushTimer = null;
          this.flush();
        }, wait);
        return;
      }
      s.send(JSON.stringify({ method: batch.method, params: batch.params, id: this.nextId++ }));
      this.sentTimes.push(this.opts.now());
      for (const p of batch.params) {
        if (batch.method === "SUBSCRIBE") this.wired.add(p);
        else this.wired.delete(p);
      }
    }
  }

  /** ms to wait before the next control message is allowed (sliding 1s window). */
  private rateLimitWait(): number {
    const now = this.opts.now();
    this.sentTimes = this.sentTimes.filter((t) => now - t < 1000);
    // Leave one message of headroom below the documented limit.
    const budget = Math.max(1, this.opts.maxControlPerSecond - 1);
    if (this.sentTimes.length < budget) return 0;
    const oldest = this.sentTimes[0] ?? now;
    return 1000 - (now - oldest) + 5;
  }

  /* ------------------------------ liveness -------------------------------- */

  private startLiveness(): void {
    this.stopLiveness();
    const every = Math.max(1000, this.opts.livenessTimeoutMs / 3);
    this.livenessTimer = setInterval(() => {
      if (!this.socket || this.wired.size === 0 || this.lastMessageAt === null) return;
      if (this.opts.now() - this.lastMessageAt > this.opts.livenessTimeoutMs) {
        this.opts.onWarning?.("No data within the liveness window; reconnecting.");
        this.forceReconnect(4001, "liveness timeout");
      }
    }, every);
  }

  private stopLiveness(): void {
    if (this.livenessTimer) clearInterval(this.livenessTimer);
    this.livenessTimer = null;
  }

  /* ------------------------------- helpers -------------------------------- */

  private setStatus(next: ConnectionStatus): void {
    if (this.status === next) return;
    this.status = next;
    for (const cb of [...this.statusListeners]) cb(next);
  }

  private clearTimer(name: "flushTimer" | "reconnectTimer" | "ageTimer" | "idleTimer"): void {
    const t = this[name];
    if (t) clearTimeout(t);
    this[name] = null;
  }

  private attachWindow(): () => void {
    if (typeof window === "undefined" || typeof window.addEventListener !== "function") return () => {};
    const on = () => this.setOnline(true);
    const off = () => this.setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }
}

function detach(s: SocketLike) {
  s.onopen = null;
  s.onclose = null;
  s.onerror = null;
  s.onmessage = null;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

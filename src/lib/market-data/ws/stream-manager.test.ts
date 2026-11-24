import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StreamManager, type SocketLike } from "./stream-manager";

type Sent = { method: string; params: string[]; id: number };

class FakeSocket implements SocketLike {
  static all: FakeSocket[] = [];
  readyState = 0;
  sent: Sent[] = [];
  closed: { code?: number; reason?: string } | null = null;
  onopen: ((ev: Event) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  constructor(public url: string) {
    FakeSocket.all.push(this);
  }
  send(data: string) {
    this.sent.push(JSON.parse(data) as Sent);
  }
  close(code?: number, reason?: string) {
    this.closed = { code, reason };
    this.readyState = 3;
  }
  /* test helpers */
  open() {
    this.readyState = 1;
    this.onopen?.(new Event("open"));
  }
  serverClose(code = 1006) {
    this.readyState = 3;
    this.onclose?.({ code } as CloseEvent);
  }
  emit(stream: string, data: unknown) {
    this.onmessage?.({ data: JSON.stringify({ stream, data }) } as MessageEvent);
  }
  subscribed(): string[] {
    const s = new Set<string>();
    for (const m of this.sent)
      for (const p of m.params) {
        if (m.method === "SUBSCRIBE") s.add(p);
        else s.delete(p);
      }
    return [...s].sort();
  }
}

const last = () => FakeSocket.all[FakeSocket.all.length - 1]!;

function make(overrides: Partial<ConstructorParameters<typeof StreamManager>[0]> = {}) {
  return new StreamManager({
    url: "wss://test/stream",
    createSocket: (url) => new FakeSocket(url),
    random: () => 0.5,
    now: () => Date.now(),
    online: true,
    ...overrides,
  });
}

beforeEach(() => {
  FakeSocket.all = [];
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("StreamManager — ref counting", () => {
  it("shares one wire subscription between many listeners", async () => {
    const m = make();
    const a = vi.fn();
    const b = vi.fn();
    const offA = m.subscribe("btcusdt@ticker", a);
    const offB = m.subscribe("btcusdt@ticker", b);
    expect(FakeSocket.all).toHaveLength(1);
    last().open();
    await vi.advanceTimersByTimeAsync(20);

    expect(last().sent).toHaveLength(1);
    expect(last().sent[0]).toMatchObject({ method: "SUBSCRIBE", params: ["btcusdt@ticker"] });
    expect(m.stats().refCounts).toEqual({ "btcusdt@ticker": 2 });

    last().emit("btcusdt@ticker", { c: "1" });
    expect(a).toHaveBeenCalledWith({ c: "1" });
    expect(b).toHaveBeenCalledWith({ c: "1" });

    offA();
    await vi.advanceTimersByTimeAsync(20);
    expect(last().sent).toHaveLength(1); // still one listener → no UNSUBSCRIBE
    expect(m.stats().refCounts).toEqual({ "btcusdt@ticker": 1 });

    offB();
    await vi.advanceTimersByTimeAsync(20);
    expect(last().sent[1]).toMatchObject({ method: "UNSUBSCRIBE", params: ["btcusdt@ticker"] });
    expect(m.stats().refCounts).toEqual({});
    m.destroy();
  });

  it("unsubscribe is idempotent", async () => {
    const m = make();
    const off1 = m.subscribe("x@ticker", () => {});
    m.subscribe("x@ticker", () => {});
    last().open();
    await vi.advanceTimersByTimeAsync(20);
    off1();
    off1();
    expect(m.stats().refCounts).toEqual({ "x@ticker": 1 });
    m.destroy();
  });

  it("coalesces a burst of subscriptions into one batched message", async () => {
    const m = make();
    for (let i = 0; i < 50; i++) m.subscribe(`s${i}@ticker`, () => {});
    last().open();
    await vi.advanceTimersByTimeAsync(20);
    expect(last().sent).toHaveLength(1);
    expect(last().sent[0]!.params).toHaveLength(50);
    m.destroy();
  });

  it("subscribe-then-unsubscribe within a frame sends nothing", async () => {
    const m = make();
    m.subscribe("keep@ticker", () => {});
    last().open();
    await vi.advanceTimersByTimeAsync(20);
    const off = m.subscribe("flicker@ticker", () => {});
    off();
    await vi.advanceTimersByTimeAsync(20);
    expect(last().sent).toHaveLength(1);
    m.destroy();
  });

  it("closes the socket after the idle delay once nothing is subscribed", async () => {
    const m = make({ idleCloseMs: 1000 });
    const off = m.subscribe("a@ticker", () => {});
    last().open();
    await vi.advanceTimersByTimeAsync(20);
    off();
    await vi.advanceTimersByTimeAsync(999);
    expect(last().closed).toBeNull();
    await vi.advanceTimersByTimeAsync(2);
    expect(last().closed).not.toBeNull();
    expect(m.getStatus()).toBe("idle");
    m.destroy();
  });
});

describe("StreamManager — rate limits", () => {
  it("splits large subscriptions into batches and throttles control messages", async () => {
    const m = make({ batchSize: 10, maxControlPerSecond: 5 }); // budget = 4 msgs/s
    for (let i = 0; i < 60; i++) m.subscribe(`s${i}@ticker`, () => {});
    last().open();
    await vi.advanceTimersByTimeAsync(20);
    expect(last().sent).toHaveLength(4); // 6 batches needed, 4 allowed in the first second

    await vi.advanceTimersByTimeAsync(995);
    expect(last().sent).toHaveLength(4); // window not yet free
    await vi.advanceTimersByTimeAsync(15);
    expect(last().sent).toHaveLength(6);
    expect(last().subscribed()).toHaveLength(60);
    m.destroy();
  });

  it("caps streams per connection and warns", async () => {
    const onWarning = vi.fn();
    const m = make({ maxStreams: 3, onWarning });
    for (let i = 0; i < 5; i++) m.subscribe(`s${i}@ticker`, () => {});
    last().open();
    await vi.advanceTimersByTimeAsync(20);
    expect(last().subscribed()).toHaveLength(3);
    expect(onWarning).toHaveBeenCalled();
    m.destroy();
  });
});

describe("StreamManager — reconnect", () => {
  it("reconnects with exponential backoff and resubscribes every stream", async () => {
    const m = make({ backoff: { baseMs: 1000, maxMs: 8000 } });
    const statuses: string[] = [];
    m.onStatus((s) => statuses.push(s));
    m.subscribe("btcusdt@ticker", () => {});
    m.subscribe("ethusdt@kline_1m", () => {});
    last().open();
    await vi.advanceTimersByTimeAsync(20);
    expect(m.getStatus()).toBe("live");

    // 1st drop → delay = 1000/2 + 0.5*500 = 750ms
    last().serverClose();
    expect(m.getStatus()).toBe("reconnecting");
    await vi.advanceTimersByTimeAsync(749);
    expect(FakeSocket.all).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(2);
    expect(FakeSocket.all).toHaveLength(2);

    // It fails before opening → next delay doubles: 2000/2 + 0.5*1000 = 1500ms
    last().serverClose();
    await vi.advanceTimersByTimeAsync(1499);
    expect(FakeSocket.all).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(2);
    expect(FakeSocket.all).toHaveLength(3);

    last().open();
    await vi.advanceTimersByTimeAsync(5);
    expect(m.getStatus()).toBe("live");
    expect(last().subscribed()).toEqual(["btcusdt@ticker", "ethusdt@kline_1m"]);
    expect(m.stats().reconnects).toBe(2);
    expect(statuses).toEqual(["connecting", "live", "reconnecting", "live"]);

    // Backoff resets after a successful open: next delay is back to 750ms.
    last().serverClose();
    await vi.advanceTimersByTimeAsync(751);
    expect(FakeSocket.all).toHaveLength(4);
    m.destroy();
  });

  it("caps the backoff delay", async () => {
    const m = make({ backoff: { baseMs: 1000, maxMs: 4000 }, random: () => 1 });
    m.subscribe("a@ticker", () => {});
    for (let i = 0; i < 6; i++) {
      last().serverClose();
      await vi.advanceTimersByTimeAsync(4001); // never more than maxMs
    }
    expect(FakeSocket.all).toHaveLength(7);
    m.destroy();
  });

  it("keeps delivering to listeners added while disconnected", async () => {
    const m = make();
    m.subscribe("a@ticker", () => {});
    last().open();
    last().serverClose();
    const fn = vi.fn();
    m.subscribe("b@ticker", fn);
    await vi.advanceTimersByTimeAsync(1000);
    last().open();
    await vi.advanceTimersByTimeAsync(5);
    expect(last().subscribed()).toEqual(["a@ticker", "b@ticker"]);
    last().emit("b@ticker", 42);
    expect(fn).toHaveBeenCalledWith(42);
    m.destroy();
  });

  it("does a planned reconnect before the 24h server limit", async () => {
    const m = make({ maxConnectionAgeMs: 60_000, livenessTimeoutMs: 10 ** 9 });
    m.subscribe("a@ticker", () => {});
    last().open();
    await vi.advanceTimersByTimeAsync(60_001);
    expect(FakeSocket.all).toHaveLength(2);
    expect(FakeSocket.all[0]!.closed?.reason).toBe("planned reconnect");
    last().open();
    await vi.advanceTimersByTimeAsync(5);
    expect(last().subscribed()).toEqual(["a@ticker"]);
    m.destroy();
  });

  it("reconnects when the socket goes silent (half-open connection)", async () => {
    const m = make({ livenessTimeoutMs: 3000 });
    m.subscribe("a@ticker", () => {});
    last().open();
    await vi.advanceTimersByTimeAsync(20);
    last().emit("a@ticker", 1);
    await vi.advanceTimersByTimeAsync(4100);
    expect(FakeSocket.all[0]!.closed?.reason).toBe("liveness timeout");
    expect(m.getStatus()).toBe("reconnecting");
    m.destroy();
  });

  it("goes offline without retrying, and reconnects immediately when back online", async () => {
    const m = make();
    m.subscribe("a@ticker", () => {});
    last().open();
    m.setOnline(false);
    expect(m.getStatus()).toBe("offline");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(FakeSocket.all).toHaveLength(1);
    m.setOnline(true);
    expect(FakeSocket.all).toHaveLength(2);
    last().open();
    await vi.advanceTimersByTimeAsync(5);
    expect(last().subscribed()).toEqual(["a@ticker"]);
    m.destroy();
  });
});

describe("StreamManager — failover & forced drops", () => {
  it("rotates to the next host after repeated connects that never open", async () => {
    const m = make({ url: ["wss://a/stream", "wss://b/stream"], failoverAfter: 2 });
    m.subscribe("x@ticker", () => {});
    expect(last().url).toBe("wss://a/stream");
    last().serverClose(); // never opened
    await vi.advanceTimersByTimeAsync(1000);
    expect(last().url).toBe("wss://a/stream");
    last().serverClose(); // second failure → rotate
    await vi.advanceTimersByTimeAsync(2000);
    expect(last().url).toBe("wss://b/stream");
    last().open();
    await vi.advanceTimersByTimeAsync(5);
    expect(last().subscribed()).toEqual(["x@ticker"]);
    expect(m.currentUrl()).toBe("wss://b/stream");
    m.destroy();
  });

  it("a forced drop reconnects even if the server never completes the close handshake", async () => {
    const m = make();
    m.subscribe("x@ticker", () => {});
    last().open();
    await vi.advanceTimersByTimeAsync(20);
    const first = last();
    // FakeSocket.close() never fires onclose — like a server that ignores the close frame.
    m.simulateDrop();
    expect(first.closed?.reason).toBe("simulated drop");
    expect(m.getStatus()).toBe("reconnecting");
    await vi.advanceTimersByTimeAsync(1000);
    expect(FakeSocket.all).toHaveLength(2);
    last().open();
    await vi.advanceTimersByTimeAsync(5);
    expect(last().subscribed()).toEqual(["x@ticker"]);
    // Late events from the abandoned socket are ignored.
    first.emit("x@ticker", "stale");
    m.destroy();
  });
});

describe("StreamManager — hidden tabs", () => {
  it("pauses foreground streams and keeps background ones", async () => {
    const m = make();
    m.subscribe("watch@ticker", () => {});
    m.subscribe("alert@ticker", () => {}, { background: true });
    last().open();
    await vi.advanceTimersByTimeAsync(20);
    expect(last().subscribed()).toEqual(["alert@ticker", "watch@ticker"]);

    m.setHidden(true);
    await vi.advanceTimersByTimeAsync(20);
    expect(last().subscribed()).toEqual(["alert@ticker"]);

    m.setHidden(false);
    await vi.advanceTimersByTimeAsync(20);
    expect(last().subscribed()).toEqual(["alert@ticker", "watch@ticker"]);
    m.destroy();
  });

  it("a stream with one background listener stays wired while hidden", async () => {
    const m = make();
    m.subscribe("btc@ticker", () => {});
    m.subscribe("btc@ticker", () => {}, { background: true });
    last().open();
    await vi.advanceTimersByTimeAsync(20);
    m.setHidden(true);
    await vi.advanceTimersByTimeAsync(20);
    expect(last().subscribed()).toEqual(["btc@ticker"]);
    m.destroy();
  });

  it("closes the socket when hidden with only foreground streams", async () => {
    const m = make({ idleCloseMs: 100 });
    m.subscribe("watch@ticker", () => {});
    last().open();
    await vi.advanceTimersByTimeAsync(20);
    m.setHidden(true);
    await vi.advanceTimersByTimeAsync(200);
    expect(last().closed).not.toBeNull();
    m.setHidden(false);
    expect(FakeSocket.all).toHaveLength(2);
    m.destroy();
  });
});

describe("StreamManager — robustness", () => {
  it("ignores acks, malformed frames and unknown streams; isolates throwing handlers", async () => {
    const onWarning = vi.fn();
    const m = make({ onWarning });
    const good = vi.fn();
    m.subscribe("a@ticker", () => {
      throw new Error("boom");
    });
    m.subscribe("a@ticker", good);
    last().open();
    last().onmessage?.({ data: '{"result":null,"id":1}' } as MessageEvent);
    last().onmessage?.({ data: "not json" } as MessageEvent);
    last().emit("other@ticker", 1);
    last().emit("a@ticker", 2);
    expect(good).toHaveBeenCalledWith(2);
    expect(onWarning).toHaveBeenCalledWith(expect.stringContaining("threw"));
    m.destroy();
  });
});

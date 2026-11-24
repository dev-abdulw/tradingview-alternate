/**
 * REST client for public market data: request-weight budgeting, ban-aware
 * backoff, retries for transient failures, and zod validation at the boundary.
 *
 * Browsers can't read Binance's X-MBX-USED-WEIGHT headers (not CORS-exposed
 * on every host), so weight is budgeted locally from documented costs.
 */
import type { z } from "zod";

export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly url: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export class SchemaError extends Error {
  constructor(
    message: string,
    readonly url: string,
  ) {
    super(message);
    this.name = "SchemaError";
  }
}

/** Sliding one-minute request-weight budget per host. */
export class WeightLimiter {
  private spent: { at: number; w: number }[] = [];
  private blockedUntil = 0;

  constructor(
    private readonly budgetPerMinute: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** ms to wait before spending `weight`. */
  waitFor(weight: number): number {
    const t = this.now();
    if (t < this.blockedUntil) return this.blockedUntil - t;
    this.spent = this.spent.filter((x) => t - x.at < 60_000);
    const used = this.spent.reduce((a, x) => a + x.w, 0);
    if (used + weight <= this.budgetPerMinute) return 0;
    let freed = used;
    for (const x of this.spent) {
      freed -= x.w;
      if (freed + weight <= this.budgetPerMinute) return 60_000 - (t - x.at) + 10;
    }
    return 60_000;
  }

  spend(weight: number): void {
    this.spent.push({ at: this.now(), w: weight });
  }

  /** Honor Retry-After from a 429 (rate limited) or 418 (IP ban). */
  block(ms: number): void {
    this.blockedUntil = Math.max(this.blockedUntil, this.now() + ms);
  }

  used(): number {
    const t = this.now();
    return this.spent.filter((x) => t - x.at < 60_000).reduce((a, x) => a + x.w, 0);
  }
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(signal.reason);
      },
      { once: true },
    );
  });

export type RequestOptions = {
  weight: number;
  limiter: WeightLimiter;
  signal?: AbortSignal;
  retries?: number;
  fetchImpl?: typeof fetch;
};

export async function getJson<S extends z.ZodType>(
  url: string,
  schema: S,
  { weight, limiter, signal, retries = 2, fetchImpl = fetch }: RequestOptions,
): Promise<z.output<S>> {
  for (let attempt = 0; ; attempt++) {
    const wait = limiter.waitFor(weight);
    if (wait > 0) await sleep(wait, signal);
    limiter.spend(weight);

    let res: Response;
    try {
      res = await fetchImpl(url, { signal, headers: { Accept: "application/json" } });
    } catch (err) {
      if (signal?.aborted) throw err;
      if (attempt >= retries) throw new HttpError("Network error — check your connection.", 0, url);
      await sleep(backoff(attempt), signal);
      continue;
    }

    if (res.status === 429 || res.status === 418) {
      const retryAfter = Number(res.headers.get("Retry-After") ?? "60");
      limiter.block((Number.isFinite(retryAfter) ? retryAfter : 60) * 1000);
      throw new HttpError(
        res.status === 418
          ? "Binance temporarily blocked requests from this network. Retrying later."
          : "Too many requests to Binance. Slowing down.",
        res.status,
        url,
      );
    }
    if (res.status >= 500 && attempt < retries) {
      await sleep(backoff(attempt), signal);
      continue;
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new HttpError(
        `Binance returned ${res.status}${body ? `: ${body.slice(0, 200)}` : ""}`,
        res.status,
        url,
      );
    }

    const json: unknown = await res.json();
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new SchemaError(
        `Unexpected response shape at ${issue?.path.join(".") || "(root)"}: ${issue?.message ?? "invalid"}`,
        url,
      );
    }
    return parsed.data;
  }
}

function backoff(attempt: number): number {
  const base = 300 * 2 ** attempt;
  return base / 2 + Math.random() * (base / 2);
}

export function query(params: Record<string, string | number | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : "";
}

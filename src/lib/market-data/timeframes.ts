export const TIMEFRAMES = ["1m", "3m", "5m", "15m", "30m", "1h", "4h", "1D", "1W", "1M"] as const;
export type Timeframe = (typeof TIMEFRAMES)[number];

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** Nominal duration (months are approximated; only used for sizing, not for bucketing). */
export const TIMEFRAME_MS: Record<Timeframe, number> = {
  "1m": MIN,
  "3m": 3 * MIN,
  "5m": 5 * MIN,
  "15m": 15 * MIN,
  "30m": 30 * MIN,
  "1h": HOUR,
  "4h": 4 * HOUR,
  "1D": DAY,
  "1W": 7 * DAY,
  "1M": 30 * DAY,
};

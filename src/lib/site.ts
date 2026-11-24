/** Public site metadata. Set NEXT_PUBLIC_SITE_URL in production (see docs/deployment.md). */
export const SITE = {
  name: "Markets",
  title: "Markets — live charts & watchlists",
  description:
    "Fast, keyboard-first charts and watchlists for crypto, tokenized gold and tokenized US stocks, with live Binance market data.",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
} as const;

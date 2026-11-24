# Deploying Markets

Markets is a static Next.js app. Every route prerenders to static HTML, and all market data is fetched **from the user's browser** straight from Binance's public endpoints. There's no backend, database or API key to run.

## Vercel (recommended)

1. Push the repo to GitHub (already done: `dev-abdulw/tradingview-alternate`).
2. In Vercel, choose **Add New → Project**, import the repo and keep the detected **Next.js** preset.
   - Install command: `pnpm install`
   - Build command: `pnpm build`
   - Node.js version: **22.x** (Project Settings → General)
3. Add one environment variable (Project Settings → Environment Variables):

   | Name                   | Value                     | Why                                                             |
   | ---------------------- | ------------------------- | --------------------------------------------------------------- |
   | `NEXT_PUBLIC_SITE_URL` | `https://your-domain.com` | Absolute URLs for Open Graph images, the sitemap and robots.txt |

4. Deploy. Every push to `main` deploys to production, and every PR gets a preview URL.

### Region note

Binance blocks some regions, including US cloud regions such as Vercel's default `iad1`. That **doesn't affect Markets**: the server only serves static files, and every Binance request comes from the user's browser in the user's region. Nothing needs to change in Vercel's region settings.

## Any static host (Netlify, Cloudflare Pages, Nginx, S3)

```bash
pnpm install
pnpm build
pnpm start   # or serve the Next.js build with any Node host
```

All pages are static, but the app still uses the Next.js server for routing and generated assets (OG image, icons). Run it with `pnpm start` on any Node 22 host, or use the host's Next.js adapter (Netlify and Cloudflare both provide one).

## Pre-deploy checklist

```bash
pnpm check   # typecheck + lint + WCAG contrast + unit tests
pnpm e2e     # Playwright against a production build (needs network: live Binance data)
```

Measured locally on the production build:

| Lighthouse | Performance                      | Accessibility | Best practices | SEO |
| ---------- | -------------------------------- | ------------- | -------------- | --- |
| Desktop    | 99                               | 100           | 100            | 100 |
| Mobile     | 100 (typical; 90 worst observed) | 100           | 100            | 100 |

## Content-Security-Policy (optional hardening)

If you add a CSP header, allow the Binance hosts the browser connects to:

```
connect-src 'self' https://data-api.binance.vision wss://data-stream.binance.vision;
```

Add `https://fapi.binance.com wss://fstream.binance.com` only if you enable the futures market (it's off by default; see `ENABLED_MARKETS` in `src/lib/market-data/registry.ts`).

## Accounts later (Supabase)

Accounts are intentionally not enabled yet. Watchlists, drawings, alerts and settings live in the browser (with export/import under Settings → Your data). The persistence layer is already behind interfaces (`WatchlistRepository`, `CollectionRepository`, `KeyValueStore`), so adding Supabase means implementing those three and adding two env vars (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`). The UI doesn't change.

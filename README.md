# Markets

A multi-asset charting and watchlist app for crypto, gold, silver and tokenized US stocks, using Binance public market data.

> Status: **Phase 1 (foundation and design system)** complete. See `docs/decisions.md` for design decisions.

## Quick start

```bash
pnpm install
pnpm dev            # http://localhost:3000  ·  design system at /design
```

Requires Node ≥ 22.12 and pnpm 11.

## Scripts

| Script                         | What it does                                                                   |
| ------------------------------ | ------------------------------------------------------------------------------ |
| `pnpm dev` / `build` / `start` | Next.js dev server / production build / serve                                  |
| `pnpm check`                   | typecheck + lint + contrast + unit tests                                       |
| `pnpm typecheck`               | Generates route types, then `tsc --noEmit` (strict)                            |
| `pnpm lint`                    | ESLint (blocks `any` and hex colors in components)                             |
| `pnpm test`                    | Vitest unit tests                                                              |
| `pnpm tokens`                  | Regenerates `src/app/tokens.css` from `src/ui/tokens/tokens.ts`                |
| `pnpm contrast`                | Checks every token text/background pair against WCAG AA (`--all` to list them) |
| `pnpm format`                  | Prettier (with Tailwind class sorting)                                         |

## Structure

```
src/
  app/                 routes (/, /design), root layout, globals.css, generated tokens.css
  ui/                  presentational design-system components (Radix + tokens)
    tokens/            token source, color math, contrast checker, CSS generator
  features/
    shell/             workspace layout, top bar, drawing rail, status bar
    settings/          settings store, theme boot script, settings dialog
    chart/  watchlist/  search/  symbol/   (filled in by Phases 2–4)
  lib/
    persistence/       KeyValueStore seam (localStorage today; synced in Phase 5)
    hooks/             shared hooks (hotkeys)
scripts/               build-tokens.ts, check-contrast.ts
docs/decisions.md      design decisions and their reasoning
```

## Design tokens

Edit colors only in `src/ui/tokens/tokens.ts`, then run `pnpm tokens && pnpm contrast`. Components use the mapped Tailwind utilities: `bg-panel`, `bg-elevated`, `text-fg`, `text-fg-muted`, `text-fg-subtle`, `border-line`, `text-up`, `text-down`, `bg-accent-solid`, and so on. Never use raw colors.

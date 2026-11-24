/**
 * Verifies every declared text/background token pair meets WCAG AA.
 * Usage: pnpm contrast        (exit code 1 on any failure)
 *        pnpm contrast --all  (print passing pairs too)
 */
import { checkContrast } from "../src/ui/tokens/contrast";

const showAll = process.argv.includes("--all");
const results = checkContrast();
const failures = results.filter((r) => !r.pass);

const pad = (s: string, n: number) => s.padEnd(n);
for (const r of results) {
  if (!showAll && r.pass) continue;
  const mark = r.pass ? "✓" : "✗";
  console.log(
    `${mark} ${pad(r.theme, 5)} ${pad(r.scheme, 11)} ${pad(r.fg, 15)} on ${pad(r.bg, 16)} ${r.ratio
      .toFixed(2)
      .padStart(5)} (min ${r.min})  ${r.note}`,
  );
}

const worst = [...results].sort((a, b) => a.ratio / a.min - b.ratio / b.min)[0];
console.log(
  `\n${results.length - failures.length}/${results.length} pairs pass WCAG AA.` +
    (worst ? ` Tightest: ${worst.theme} ${worst.fg} on ${worst.bg} at ${worst.ratio.toFixed(2)}.` : ""),
);
if (failures.length > 0) {
  console.error(`${failures.length} pair(s) fail.`);
  process.exit(1);
}

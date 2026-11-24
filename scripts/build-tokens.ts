/** Generates src/app/tokens.css from src/ui/tokens/tokens.ts. Usage: pnpm tokens */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildTokensCss } from "../src/ui/tokens/css";

const out = resolve(import.meta.dirname, "../src/app/tokens.css");
writeFileSync(out, buildTokensCss());
console.log(`Wrote ${out}`);

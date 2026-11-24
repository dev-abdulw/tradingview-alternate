import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const HEX_COLOR = "#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\\b";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  {
    // Design-system rule: colors come from tokens, never hex literals.
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/ui/tokens/**", "**/*.test.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: `Literal[value=/${HEX_COLOR}/]`,
          message: "Use a design token (Tailwind utility or CSS variable) instead of a hex color.",
        },
        {
          selector: `TemplateElement[value.raw=/${HEX_COLOR}/]`,
          message: "Use a design token (Tailwind utility or CSS variable) instead of a hex color.",
        },
      ],
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "coverage/**", "playwright-report/**"]),
]);

export default eslintConfig;

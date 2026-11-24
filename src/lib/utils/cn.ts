import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/** tailwind-merge needs to know our custom font-size tokens so it doesn't treat them as colors. */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: ["meta", "cell", "ui", "title", "heading", "price"] }],
      shadow: [{ shadow: ["popover", "dialog"] }],
      rounded: [{ rounded: ["control", "popover", "dialog"] }],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

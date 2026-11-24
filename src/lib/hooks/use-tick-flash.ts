"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Direction of the latest price change ("up"/"down"), plus a counter that
 * changes on every tick so callers can re-key an element to replay the flash.
 * Null until the second distinct price.
 */
export function useTickFlash(price: number | undefined): { dir: "up" | "down" | null; seq: number } {
  const prev = useRef<number | undefined>(undefined);
  const [state, setState] = useState<{ dir: "up" | "down" | null; seq: number }>({ dir: null, seq: 0 });
  useEffect(() => {
    if (price === undefined) return;
    const before = prev.current;
    prev.current = price;
    if (before === undefined || before === price) return;
    setState((s) => ({ dir: price > before ? "up" : "down", seq: s.seq + 1 }));
  }, [price]);
  return state;
}

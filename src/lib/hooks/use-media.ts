"use client";

import { useCallback, useSyncExternalStore } from "react";

export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (cb: () => void) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}

export type FormFactor = "mobile" | "tablet" | "desktop";

/** Phone < 768px, tablet < 1100px, desktop otherwise. */
export function useFormFactor(): FormFactor {
  const mobile = useMediaQuery("(max-width: 767px)");
  const tablet = useMediaQuery("(max-width: 1099px)");
  return mobile ? "mobile" : tablet ? "tablet" : "desktop";
}

/** Touch-first device (no hover, coarse pointer): bigger rows, swipe actions. */
export function useCoarsePointer(): boolean {
  return useMediaQuery("(pointer: coarse)");
}

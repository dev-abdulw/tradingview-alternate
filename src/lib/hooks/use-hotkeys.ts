"use client";

import { useEffect, useRef } from "react";

/**
 * Hotkey spec: modifiers joined with "+", then a key or physical code.
 *   "mod+k"  → ⌘K on macOS, Ctrl+K elsewhere
 *   "/"      → slash (ignored while typing)
 *   "alt+KeyW" → matches the physical W key (Option+W types "∑" on macOS)
 */
export type HotkeyMap = Record<string, (e: KeyboardEvent) => void>;

export const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

export function matchesHotkey(spec: string, e: KeyboardEvent, mac = isMac()): boolean {
  const parts = spec.split("+");
  const key = parts.pop() ?? "";
  const mods = new Set(parts.map((p) => p.toLowerCase()));
  const wantMeta = mods.has("meta") || (mods.has("mod") && mac);
  const wantCtrl = mods.has("ctrl") || (mods.has("mod") && !mac);
  if (e.metaKey !== wantMeta || e.ctrlKey !== wantCtrl) return false;
  if (e.altKey !== mods.has("alt")) return false;
  // Shift is implied for symbols like "?" — only enforce when explicitly requested.
  if (mods.has("shift") && !e.shiftKey) return false;
  if (key.length > 1 && /^(Key|Digit)/.test(key)) return e.code === key;
  return e.key.toLowerCase() === key.toLowerCase();
}

/**
 * Global hotkeys. Plain keys are ignored while typing in a field;
 * modifier chords (mod+k) work everywhere.
 */
export function useHotkeys(map: HotkeyMap, enabled = true): void {
  const ref = useRef(map);
  useEffect(() => {
    ref.current = map;
  });

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing) return;
      for (const [spec, handler] of Object.entries(ref.current)) {
        if (!matchesHotkey(spec, e)) continue;
        const hasChord = /(^|\+)(mod|meta|ctrl|alt)\+/i.test(spec);
        if (!hasChord && isEditableTarget(e.target)) continue;
        e.preventDefault();
        handler(e);
        return;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
}

/** Human-readable shortcut, e.g. "mod+k" → "⌘K" / "Ctrl K". */
export function formatHotkey(spec: string, mac = isMac()): string[] {
  return spec.split("+").map((p) => {
    const k = p.toLowerCase();
    if (k === "mod") return mac ? "⌘" : "Ctrl";
    if (k === "alt") return mac ? "⌥" : "Alt";
    if (k === "shift") return mac ? "⇧" : "Shift";
    if (k === "meta") return "⌘";
    if (k === "ctrl") return mac ? "⌃" : "Ctrl";
    return p.replace(/^(Key|Digit)/, "").toUpperCase();
  });
}

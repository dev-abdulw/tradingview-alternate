import { describe, expect, it } from "vitest";
import { formatHotkey, isEditableTarget, matchesHotkey } from "./use-hotkeys";

const key = (init: KeyboardEventInit) => new KeyboardEvent("keydown", init);

describe("matchesHotkey", () => {
  it("maps mod to ⌘ on mac and Ctrl elsewhere", () => {
    expect(matchesHotkey("mod+k", key({ key: "k", metaKey: true }), true)).toBe(true);
    expect(matchesHotkey("mod+k", key({ key: "k", ctrlKey: true }), true)).toBe(false);
    expect(matchesHotkey("mod+k", key({ key: "k", ctrlKey: true }), false)).toBe(true);
  });

  it("matches physical codes for Option chords (Option+W types ∑ on macOS)", () => {
    expect(matchesHotkey("alt+KeyW", key({ key: "∑", code: "KeyW", altKey: true }), true)).toBe(true);
  });

  it("rejects extra modifiers", () => {
    expect(matchesHotkey("/", key({ key: "/", metaKey: true }))).toBe(false);
    expect(matchesHotkey("/", key({ key: "/" }))).toBe(true);
  });

  it("formats for display", () => {
    expect(formatHotkey("mod+k", true)).toEqual(["⌘", "K"]);
    expect(formatHotkey("alt+KeyW", false)).toEqual(["Alt", "W"]);
  });

  it("detects editable targets", () => {
    expect(isEditableTarget(document.createElement("input"))).toBe(true);
    expect(isEditableTarget(document.createElement("div"))).toBe(false);
  });
});

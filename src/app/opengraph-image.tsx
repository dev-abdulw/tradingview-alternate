import { ImageResponse } from "next/og";
import { SITE } from "@/lib/site";
import { themes } from "@/ui/tokens/tokens";

export const alt = SITE.title;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const t = themes.dark;
// A deterministic, stylised candle series for the preview (not market data).
const candles = Array.from({ length: 34 }, (_, i) => {
  const mid = 95 + Math.sin(i / 4) * 40 + Math.cos(i / 2.3) * 10; // stays within the 200px band
  const up = Math.sin(i * 1.7) > -0.2;
  const body = 18 + ((i * 37) % 26);
  return { up, top: mid - body / 2, body };
});

/** Social preview image, rendered from the same design tokens as the app. */
export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: t["bg-app"],
        color: t["text-primary"],
        padding: 64,
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 44 }}>
          {[22, 32, 44].map((h, i) => (
            <div
              key={h}
              style={{ width: 12, height: h, borderRadius: 3, background: t.accent, opacity: 0.5 + i * 0.25 }}
            />
          ))}
        </div>
        <div style={{ fontSize: 44, fontWeight: 700, letterSpacing: -1 }}>{SITE.name}</div>
      </div>
      <div
        style={{
          marginTop: 28,
          fontSize: 56,
          fontWeight: 700,
          lineHeight: 1.1,
          letterSpacing: -1.5,
          maxWidth: 900,
        }}
      >
        Live charts & watchlists
      </div>
      <div style={{ marginTop: 16, fontSize: 28, color: t["text-secondary"], maxWidth: 900 }}>
        Crypto · tokenized gold · tokenized US stocks
      </div>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginTop: "auto", height: 200 }}>
        {candles.map((c, i) => (
          <div key={i} style={{ position: "relative", display: "flex", width: 22, height: 200 }}>
            <div
              style={{
                position: "absolute",
                left: 10,
                top: c.top - 12,
                width: 2,
                height: c.body + 24,
                background: c.up ? t.up : t.down,
              }}
            />
            <div
              style={{
                position: "absolute",
                left: 0,
                top: c.top,
                width: 22,
                height: c.body,
                borderRadius: 3,
                background: c.up ? t.up : t.down,
              }}
            />
          </div>
        ))}
      </div>
    </div>,
    size,
  );
}

import { ImageResponse } from "next/og";
import { themes } from "@/ui/tokens/tokens";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  const t = themes.dark;
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        gap: 14,
        padding: "0 0 44px",
        background: t["bg-panel"],
      }}
    >
      {[52, 78, 104].map((h, i) => (
        <div
          key={h}
          style={{ width: 28, height: h, borderRadius: 6, background: t.accent, opacity: 0.5 + i * 0.25 }}
        />
      ))}
    </div>,
    size,
  );
}

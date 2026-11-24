import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { THEME_BOOT_SCRIPT } from "@/features/settings/theme";
import { themes } from "@/ui/tokens/tokens";
import { Providers } from "./providers";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Markets", template: "%s · Markets" },
  description: "Charts and watchlists for crypto, gold, silver and tokenized stocks, with live Binance data.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: themes.dark["bg-app"] },
    { media: "(prefers-color-scheme: light)", color: themes.light["bg-app"] },
  ],
  colorScheme: "dark light",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" data-theme="dark" className={inter.variable} suppressHydrationWarning>
      <head>
        {/* Applies the saved theme before first paint — no flash, no hydration mismatch. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

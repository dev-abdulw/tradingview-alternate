import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { THEME_BOOT_SCRIPT } from "@/features/settings/theme";
import { SITE } from "@/lib/site";
import { themes } from "@/ui/tokens/tokens";
import { Providers } from "./providers";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: { default: SITE.title, template: `%s · ${SITE.name}` },
  description: SITE.description,
  applicationName: SITE.name,
  keywords: ["crypto charts", "watchlist", "Binance", "tokenized stocks", "gold", "technical analysis"],
  openGraph: {
    type: "website",
    siteName: SITE.name,
    title: SITE.title,
    description: SITE.description,
    url: "/",
  },
  twitter: { card: "summary_large_image", title: SITE.title, description: SITE.description },
  appleWebApp: { title: SITE.name, statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
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

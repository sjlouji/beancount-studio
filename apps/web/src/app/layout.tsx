import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Inter } from "next/font/google";
import { Providers } from "./providers";
import "./globals.css";

// DESIGN.md: Inter stands in for both proprietary tiers (display and UI); the mono face is for ledger source.
const sans = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const mono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Beancount Studio", template: "%s · Beancount Studio" },
  description: "Self-hosted plain-text accounting with reports, a ledger editor, imports, and an AI assistant.",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#4a154b",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${sans.variable} ${mono.variable} h-full`}>
      <body className="flex min-h-full flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

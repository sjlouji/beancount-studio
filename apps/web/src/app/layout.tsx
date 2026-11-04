import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Inter } from "next/font/google";
import { Providers } from "./providers";
import "./globals.css";

// DESIGN.md: the platform's system face comes first; Inter and Plex Mono are the fallbacks on
// devices without SF (globals.css builds the stacks from these variables).
const sans = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const mono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Beancount Studio", template: "%s · Beancount Studio" },
  description: "Self-hosted plain-text accounting with reports, a ledger editor, imports, and an AI assistant.",
  icons: { icon: "/icon.svg" },
};

// Edge to edge on phones (the shell pads itself with env(safe-area-inset-*)); the browser chrome
// and status bar take the colour of the top bar in each scheme.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
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

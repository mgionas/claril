import { Analytics } from "@vercel/analytics/next";
import NextTopLoader from "nextjs-toploader";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Claril",
  description: "Open-source architecture & process intelligence workbench.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="bg-canvas text-fg antialiased">
        {/* next-themes sets class="dark"|"light" on <html> and injects a
            no-flash script (defaultTheme=system follows the OS). */}
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          {/* Global top progress bar — shows on every navigation so slow cold-start
              clicks (free Vercel) clearly read as "working" rather than frozen. */}
          <NextTopLoader
            color="#4d8dff"
            height={3}
            showSpinner={false}
            shadow="0 0 10px #4d8dff,0 0 5px #4d8dff"
          />
          {children}
          <Analytics />
        </ThemeProvider>
      </body>
    </html>
  );
}

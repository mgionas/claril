import { Analytics } from "@vercel/analytics/next";
import NextTopLoader from "nextjs-toploader";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Claril",
  description: "Open-source architecture & process intelligence workbench.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-canvas text-fg antialiased">
        {/* Global top progress bar — shows on every navigation so slow cold-start
            clicks (free Vercel) clearly read as "working" rather than frozen. */}
        <NextTopLoader
          color="#4d8dff"
          height={3}
          showSpinner
          shadow="0 0 10px #4d8dff,0 0 5px #4d8dff"
        />
        {children}
        <Analytics />
      </body>
    </html>
  );
}

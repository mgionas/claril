import { Analytics } from "@vercel/analytics/next";
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
        {children}
        <Analytics />
      </body>
    </html>
  );
}

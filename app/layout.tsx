import type React from "react";
import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CCTV Gate Monitor",
  description:
    "Browser-only CCTV gate monitor for SmartPSS Lite. Detects Big Gate and Small Gate open/close events with OpenCV.js + Tesseract.js and exports an Excel report — no backend, no uploads.",
};

export const viewport: Viewport = {
  themeColor: "#020617",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>): React.JSX.Element {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-slate-950 text-slate-200 antialiased">{children}</body>
    </html>
  );
}

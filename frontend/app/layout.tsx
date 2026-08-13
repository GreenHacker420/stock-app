import type { Metadata, Viewport } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";

const inter = Inter({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Shop Control",
    template: "%s · Shop Control",
  },
  description: "Keyboard-first operations workspace for sales, inventory, customers, collections and retail controls.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${geistMono.variable} h-full font-sans antialiased`}>
      <body className="min-h-dvh w-full bg-background font-sans text-foreground">{children}</body>
    </html>
  );
}

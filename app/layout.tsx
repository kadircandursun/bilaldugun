import type { Metadata, Viewport } from "next";
import { Playfair_Display, Inter } from "next/font/google";
import { coupleTitle } from "@/lib/site";
import MobileFrame from "./components/MobileFrame";
import "./globals.css";

const display = Playfair_Display({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-display",
  display: "swap",
});

const body = Inter({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  title: `${coupleTitle} | Düğün`,
  description: `${coupleTitle} düğünü — fotoğraflarınızı paylaşın.`,
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#1c1c1a",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="tr" className={`${display.variable} ${body.variable}`}>
      <body>
        <MobileFrame>{children}</MobileFrame>
      </body>
    </html>
  );
}

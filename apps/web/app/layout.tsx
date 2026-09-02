import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import type { ReactNode } from "react";

import { AppProviders } from "@/components/providers/app-providers";

import "./globals.css";

const manrope = Manrope({
  display: "swap",
  subsets: ["cyrillic", "latin"],
  variable: "--font-manrope",
});

export const metadata: Metadata = {
  title: "Макс-Контракт",
  description: "Мини-приложение для договоров между физическими лицами",
};

export const viewport: Viewport = {
  initialScale: 1,
  viewportFit: "cover",
  width: "device-width",
};

type RootLayoutProps = Readonly<{
  children: ReactNode;
}>;

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="ru">
      <body className={manrope.variable}>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}

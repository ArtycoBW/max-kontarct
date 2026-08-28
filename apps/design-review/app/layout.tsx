import type { Metadata } from "next";
import { Inter, Manrope, Bebas_Neue, Roboto_Condensed } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

const manrope = Manrope({ subsets: ["cyrillic", "latin"], variable: "--font-manrope" });
const bebas = Bebas_Neue({ subsets: ["latin"], weight: "400", variable: "--font-bebas" });
const inter = Inter({ subsets: ["cyrillic", "latin"], variable: "--font-inter" });
const condensed = Roboto_Condensed({ subsets: ["cyrillic", "latin"], variable: "--font-condensed" });

export const metadata: Metadata = {
  title: "Макс-Контракт - Визуальные концепции",
  description: "Интерактивный прототип четырёх дизайн-концепций приложения Макс-Контракт.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body className={`${manrope.variable} ${bebas.variable} ${inter.variable} ${condensed.variable}`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

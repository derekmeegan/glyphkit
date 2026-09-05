import type { Metadata } from "next";
import { Familjen_Grotesk, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const display = Familjen_Grotesk({ subsets: ["latin"], weight: "700", variable: "--font-display" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono" });
const description = "Stretch and style letters in your browser.";

export const metadata: Metadata = {
  metadataBase: new URL("https://abcdefghijklmnopqrstuvwxyz.sh"),
  title: "glyphkit",
  description,
  openGraph: {
    title: "glyphkit",
    description,
    siteName: "glyphkit",
    type: "website",
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: "glyphkit",
    description,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}

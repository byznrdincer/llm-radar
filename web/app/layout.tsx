import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { LanguageProvider } from "./lib/i18n";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteUrl = "https://llmradar.planetai9.com";
const siteDescription =
  "Büyük dil modellerini keşfedin, karşılaştırın ve güncel yapay zekâ modellerini tek bir platformdan takip edin.";
// LinkedIn mobile often hides og:description; title always shows.
const shareTitle = `LLM Radar — ${siteDescription}`;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "LLM Radar",
    template: "%s · LLM Radar",
  },
  description: siteDescription,
  applicationName: "LLM Radar",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
  openGraph: {
    title: shareTitle,
    description: siteDescription,
    url: siteUrl,
    siteName: "LLM Radar",
    images: [
      {
        // Absolute HTTPS + cache-bust — LinkedIn/Cloudflare may keep old assets.
        url: `${siteUrl}/og.png?v=3`,
        width: 1200,
        height: 630,
        alt: shareTitle,
      },
    ],
    locale: "tr_TR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: shareTitle,
    description: siteDescription,
    images: [`${siteUrl}/og.png?v=3`],
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover" as const,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  );
}

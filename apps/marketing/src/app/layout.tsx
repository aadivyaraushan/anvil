import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Instrument_Serif } from "next/font/google";
import "./globals.css";

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: ["400"],
  style: ["normal", "italic"],
  variable: "--font-instrument-serif",
});

export const metadata: Metadata = {
  title: "Anvil — Record the conversation. We do the rest.",
  description:
    "A native Mac app that captures your customer conversations and turns them into findings you can act on.",
  openGraph: {
    title: "Anvil",
    description: "Record the conversation. Anvil does the rest.",
    url: "https://anvil.app",
    siteName: "Anvil",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Anvil",
    description: "Record the conversation. Anvil does the rest.",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable} ${instrumentSerif.variable}`}
    >
      <body className="bg-[oklch(0.11_0.008_264)] text-[oklch(0.96_0.005_264)] antialiased">
        {children}
      </body>
    </html>
  );
}

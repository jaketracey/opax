import type { Metadata } from "next";
import "./globals.css";
import { Nav } from "@/components/nav";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://opax.com.au";

export const metadata: Metadata = {
  title: "OPAX - Open Parliamentary Accountability eXchange",
  description:
    "Tracking what Parliament says vs how it votes. Data-driven investigations into Australian political accountability.",
  metadataBase: new URL(BASE_URL),
  openGraph: {
    title: "OPAX - Open Parliamentary Accountability eXchange",
    description:
      "Tracking what Parliament says vs how it votes. Data-driven investigations into Australian political accountability.",
    url: BASE_URL,
    siteName: "OPAX",
    locale: "en_AU",
    type: "website",
    images: [
      {
        url: `${BASE_URL}/api/card?type=topic-stat&topic=gambling`,
        width: 1200,
        height: 630,
        alt: "OPAX - Open Parliamentary Accountability eXchange",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "OPAX - Open Parliamentary Accountability eXchange",
    description:
      "Tracking what Parliament says vs how it votes.",
    images: [`${BASE_URL}/api/card?type=topic-stat&topic=gambling`],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#0a0a0f] text-[#e6edf3] antialiased">
        <Nav />
        <main>{children}</main>
      </body>
    </html>
  );
}

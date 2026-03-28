import type { Metadata } from "next";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://opax.com.au";

export const metadata: Metadata = {
  title: "Gambling Reform: Follow the Money | OPAX",
  description:
    "25 years of parliamentary debate, 1,480 speeches, $65M in industry donations, and almost no reform. OPAX tracks what Parliament says vs how it votes on gambling.",
  openGraph: {
    title: "Gambling Reform: Follow the Money",
    description:
      "25 years of debate. 1,480 speeches. $65M in gambling industry donations. Almost no reform. See the disconnect.",
    url: `${BASE_URL}/gambling`,
    siteName: "OPAX - Open Parliamentary Accountability eXchange",
    images: [
      {
        url: `${BASE_URL}/api/card?type=topic-stat&topic=gambling`,
        width: 1200,
        height: 630,
        alt: "OPAX Gambling Investigation: 25 years of debate, $65M in donations, almost no reform",
      },
    ],
    locale: "en_AU",
    type: "article",
  },
  twitter: {
    card: "summary_large_image",
    title: "Gambling Reform: Follow the Money | OPAX",
    description:
      "25 years of debate. 1,480 speeches. $65M in gambling industry donations. Almost no reform.",
    images: [`${BASE_URL}/api/card?type=topic-stat&topic=gambling`],
  },
};

export default function GamblingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}

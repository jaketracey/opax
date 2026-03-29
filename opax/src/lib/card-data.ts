/**
 * Shared data for investigation cards (used by both API image generation
 * and the client-side card preview page).
 */

export interface MpProfile {
  name: string;
  party: string;
  electorate: string;
  photoId: string;
  speeches: number;
  said: string;
  voted: string;
  disconnect: boolean;
}

export const MP_PROFILES: Record<string, MpProfile> = {
  "10007": {
    name: "Anthony Albanese",
    party: "Labor",
    electorate: "Grayndler",
    photoId: "10007",
    speeches: 19,
    said: "We need to ensure that we have proper protections in place for those who are most vulnerable to gambling harm.",
    voted: "Labor received $28.2M from gambling industry. Delayed gambling ad ban after industry lobbying.",
    disconnect: true,
  },
  "10727": {
    name: "Andrew Wilkie",
    party: "Independent",
    electorate: "Clark",
    photoId: "10727",
    speeches: 64,
    said: "There are 95,000 Australians addicted to poker machines. Poker machine losses amount to $12 billion a year.",
    voted: "Consistently voted for every gambling reform measure. Made pokies reform a condition of supporting the Gillard government.",
    disconnect: false,
  },
  "10352": {
    name: "Bob Katter",
    party: "Independent",
    electorate: "Kennedy",
    photoId: "10352",
    speeches: 16,
    said: "The gambling industry is destroying regional communities. It is a cancer on the fabric of rural Australia.",
    voted: "Voted for gambling reform measures and pushed for stronger restrictions on poker machines.",
    disconnect: false,
  },
  "10874": {
    name: "Rebekha Sharkie",
    party: "Independent",
    electorate: "Mayo",
    photoId: "10874",
    speeches: 12,
    said: "$25 billion was lost by Australians, and 1.3 million of us are at risk or experiencing gambling harm.",
    voted: "Supported gambling advertising restrictions and reform measures.",
    disconnect: false,
  },
};

export interface DonationTrailData {
  industry: string;
  parties: { party: string; amount: number; color: string }[];
  totalDonations: number;
  reformBillsPassed: number;
  period: string;
}

export const DONATION_TRAILS: Record<string, DonationTrailData> = {
  gambling: {
    industry: "Gambling Industry",
    parties: [
      { party: "ALP", amount: 28237848, color: "#E13A3A" },
      { party: "LIB", amount: 21005226, color: "#1C4FA0" },
      { party: "NAT", amount: 5241924, color: "#006644" },
    ],
    totalDonations: 65100000,
    reformBillsPassed: 0,
    period: "1998-2024",
  },
};

export interface TopicStatData {
  topic: string;
  label: string;
  yearsOfDebate: number;
  speeches: number;
  mpsInvolved: number;
  industryDonations: number;
  result: string;
}

export const TOPIC_STATS: Record<string, TopicStatData> = {
  gambling: {
    topic: "gambling",
    label: "Gambling Reform",
    yearsOfDebate: 25,
    speeches: 1480,
    mpsInvolved: 361,
    industryDonations: 65100000,
    result: "Almost no meaningful reform",
  },
};

export const PARTY_COLORS: Record<string, string> = {
  Labor: "#E13A3A",
  Liberal: "#1C4FA0",
  Greens: "#00843D",
  Nationals: "#006644",
  Independent: "#888888",
};

export function formatDollars(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

export function mpPhotoUrl(photoId: string): string {
  // Served from our own API — see parli/ingest/photos.py
  const base = typeof window !== "undefined" && (window.location.hostname === "opax.com.au" || window.location.hostname === "www.opax.com.au")
    ? ""
    : typeof window !== "undefined"
    ? `http://${window.location.hostname}:8000`
    : "http://localhost:8000";
  return `${base}/api/photos/${photoId}`;
}

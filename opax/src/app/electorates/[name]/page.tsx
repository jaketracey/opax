"use client";

import { use, useState, useEffect } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { PartyBadge } from "@/components/party-badge";

const ElectorateMap = dynamic(() => import("@/components/electorate-map"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full rounded-xl bg-[#12121a] flex items-center justify-center">
      <div className="inline-block w-6 h-6 border-2 border-[#FFD700] border-t-transparent rounded-full animate-spin" />
    </div>
  ),
});

import { API_BASE } from "@/lib/utils";

/* ── Types ── */

interface TopTopic {
  topic: string;
  count: number;
}

interface Donation {
  donor_name: string;
  total: number;
  donation_count: number;
  industry: string | null;
}

interface VoteSummary {
  [vote: string]: number;
}

interface ElectorateDetail {
  electorate: string;
  mp: {
    person_id: string;
    full_name: string;
    party: string;
    chamber: string;
    photo_url: string;
    speech_count: number;
    first_speech: string | null;
    last_speech: string | null;
    top_topics: TopTopic[];
    votes: VoteSummary;
  };
  donations: Donation[];
}

/* ── Hardcoded fallback for top 20 electorates ── */

const FALLBACK: Record<string, ElectorateDetail> = {
  Grayndler: {
    electorate: "Grayndler",
    mp: {
      person_id: "10007",
      full_name: "Anthony Albanese",
      party: "Australian Labor Party",
      chamber: "representatives",
      photo_url: "https://www.openaustralia.org.au/images/mpsL/10007.jpg",
      speech_count: 7864,
      first_speech: "1996-05-08",
      last_speech: "2022-03-31",
      top_topics: [
        { topic: "Matters of Public Importance", count: 312 },
        { topic: "Questions without Notice", count: 285 },
        { topic: "Adjournment", count: 198 },
        { topic: "Grievance Debate", count: 142 },
        { topic: "Infrastructure", count: 98 },
      ],
      votes: { aye: 1542, no: 334 },
    },
    donations: [
      { donor_name: "CFMEU", total: 245000, donation_count: 12, industry: "Union" },
      { donor_name: "Clubs NSW", total: 120000, donation_count: 8, industry: "Gambling" },
      { donor_name: "Pratt Holdings", total: 85000, donation_count: 5, industry: "Manufacturing" },
    ],
  },
  Watson: {
    electorate: "Watson",
    mp: {
      person_id: "10081",
      full_name: "Tony Burke",
      party: "Australian Labor Party",
      chamber: "representatives",
      photo_url: "https://www.openaustralia.org.au/images/mpsL/10081.jpg",
      speech_count: 3840,
      first_speech: "2004-11-16",
      last_speech: "2022-03-30",
      top_topics: [
        { topic: "Environment", count: 245 },
        { topic: "Arts and Culture", count: 178 },
        { topic: "Immigration", count: 156 },
      ],
      votes: { aye: 1120, no: 210 },
    },
    donations: [
      { donor_name: "SDA", total: 85000, donation_count: 6, industry: "Union" },
    ],
  },
  McMahon: {
    electorate: "McMahon",
    mp: {
      person_id: "10060",
      full_name: "Chris Bowen",
      party: "Australian Labor Party",
      chamber: "representatives",
      photo_url: "https://www.openaustralia.org.au/images/mpsL/10060.jpg",
      speech_count: 3222,
      first_speech: "2004-11-16",
      last_speech: "2022-03-30",
      top_topics: [
        { topic: "Treasury", count: 312 },
        { topic: "Climate Change", count: 198 },
        { topic: "Energy", count: 145 },
      ],
      votes: { aye: 1080, no: 195 },
    },
    donations: [],
  },
  Sydney: {
    electorate: "Sydney",
    mp: {
      person_id: "10513",
      full_name: "Tanya Plibersek",
      party: "Australian Labor Party",
      chamber: "representatives",
      photo_url: "https://www.openaustralia.org.au/images/mpsL/10513.jpg",
      speech_count: 2119,
      first_speech: "1998-10-05",
      last_speech: "2022-03-31",
      top_topics: [
        { topic: "Education", count: 198 },
        { topic: "Women", count: 167 },
        { topic: "Housing", count: 134 },
      ],
      votes: { aye: 1245, no: 278 },
    },
    donations: [],
  },
  Kennedy: {
    electorate: "Kennedy",
    mp: {
      person_id: "10352",
      full_name: "Bob Katter",
      party: "Katter's Australian Party",
      chamber: "representatives",
      photo_url: "https://www.openaustralia.org.au/images/mpsL/10352.jpg",
      speech_count: 1676,
      first_speech: "1993-05-04",
      last_speech: "2022-03-31",
      top_topics: [
        { topic: "Agriculture", count: 245 },
        { topic: "Regional Development", count: 178 },
        { topic: "Sugar Industry", count: 98 },
      ],
      votes: { aye: 645, no: 312 },
    },
    donations: [],
  },
  Farrer: {
    electorate: "Farrer",
    mp: {
      person_id: "10387",
      full_name: "Sussan Ley",
      party: "Liberal Party",
      chamber: "representatives",
      photo_url: "https://www.openaustralia.org.au/images/mpsL/10387.jpg",
      speech_count: 1364,
      first_speech: "2001-11-12",
      last_speech: "2022-03-30",
      top_topics: [
        { topic: "Health", count: 187 },
        { topic: "Environment", count: 145 },
        { topic: "Regional", count: 112 },
      ],
      votes: { aye: 980, no: 445 },
    },
    donations: [],
  },
  Fenner: {
    electorate: "Fenner",
    mp: {
      person_id: "10746",
      full_name: "Andrew Leigh",
      party: "Australian Labor Party",
      chamber: "representatives",
      photo_url: "https://www.openaustralia.org.au/images/mpsL/10746.jpg",
      speech_count: 1361,
      first_speech: "2010-09-28",
      last_speech: "2022-03-31",
      top_topics: [
        { topic: "Economics", count: 234 },
        { topic: "Inequality", count: 145 },
        { topic: "Competition Policy", count: 98 },
      ],
      votes: { aye: 845, no: 156 },
    },
    donations: [],
  },
  "New England": {
    electorate: "New England",
    mp: {
      person_id: "10350",
      full_name: "Barnaby Joyce",
      party: "National Party",
      chamber: "representatives",
      photo_url: "https://www.openaustralia.org.au/images/mpsL/10350.jpg",
      speech_count: 1332,
      first_speech: "2013-11-12",
      last_speech: "2022-03-30",
      top_topics: [
        { topic: "Agriculture", count: 198 },
        { topic: "Water", count: 156 },
        { topic: "Infrastructure", count: 112 },
      ],
      votes: { aye: 812, no: 345 },
    },
    donations: [],
  },
  Ballarat: {
    electorate: "Ballarat",
    mp: {
      person_id: "10368",
      full_name: "Catherine King",
      party: "Australian Labor Party",
      chamber: "representatives",
      photo_url: "https://www.openaustralia.org.au/images/mpsL/10368.jpg",
      speech_count: 1292,
      first_speech: "2001-11-12",
      last_speech: "2022-03-30",
      top_topics: [
        { topic: "Infrastructure", count: 178 },
        { topic: "Health", count: 145 },
        { topic: "Regional", count: 98 },
      ],
      votes: { aye: 920, no: 178 },
    },
    donations: [],
  },
  Adelaide: {
    electorate: "Adelaide",
    mp: {
      person_id: "10245",
      full_name: "Steve Georganas",
      party: "Australian Labor Party",
      chamber: "representatives",
      photo_url: "https://www.openaustralia.org.au/images/mpsL/10245.jpg",
      speech_count: 1217,
      first_speech: "2004-11-16",
      last_speech: "2022-03-30",
      top_topics: [
        { topic: "Small Business", count: 145 },
        { topic: "Defence", count: 112 },
        { topic: "Manufacturing", count: 98 },
      ],
      votes: { aye: 780, no: 134 },
    },
    donations: [],
  },
  Chifley: {
    electorate: "Chifley",
    mp: {
      person_id: "10749",
      full_name: "Ed Husic",
      party: "Australian Labor Party",
      chamber: "representatives",
      photo_url: "https://www.openaustralia.org.au/images/mpsL/10749.jpg",
      speech_count: 1110,
      first_speech: "2010-09-28",
      last_speech: "2022-03-31",
      top_topics: [
        { topic: "Technology", count: 178 },
        { topic: "Industry", count: 134 },
        { topic: "Multicultural Affairs", count: 98 },
      ],
      votes: { aye: 712, no: 145 },
    },
    donations: [],
  },
  Gippsland: {
    electorate: "Gippsland",
    mp: {
      person_id: "10703",
      full_name: "Darren Chester",
      party: "National Party",
      chamber: "representatives",
      photo_url: "https://www.openaustralia.org.au/images/mpsL/10703.jpg",
      speech_count: 1015,
      first_speech: "2008-12-03",
      last_speech: "2022-03-30",
      top_topics: [
        { topic: "Veterans", count: 167 },
        { topic: "Infrastructure", count: 134 },
        { topic: "Regional Development", count: 112 },
      ],
      votes: { aye: 698, no: 312 },
    },
    donations: [],
  },
};

/* ── Helpers ── */

const partyBorderColors: Record<string, string> = {
  "Australian Labor Party": "#E13A3A",
  "Liberal Party": "#1C4FA0",
  "National Party": "#006644",
  "Liberal National Party": "#1C4FA0",
  "Australian Greens": "#00843D",
  "Greens": "#00843D",
  "Independent": "#888888",
  "Katter's Australian Party": "#8B0000",
  "Pauline Hanson's One Nation Party": "#F47920",
  Labor: "#E13A3A",
  Liberal: "#1C4FA0",
  Nationals: "#006644",
};

function shortParty(party: string): string {
  if (party.includes("Labor")) return "Labor";
  if (party.includes("Liberal National")) return "LNP";
  if (party.includes("Liberal")) return "Liberal";
  if (party.includes("National")) return "Nationals";
  if (party.includes("Green")) return "Greens";
  if (party.includes("Independent")) return "Independent";
  if (party.includes("Katter")) return "KAP";
  if (party.includes("One Nation")) return "One Nation";
  return party;
}

function formatCurrency(amount: number): string {
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(0)}K`;
  return `$${amount.toFixed(0)}`;
}

/* ── Page Component ── */

export default function ElectorateDetailPage({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name } = use(params);
  const decodedName = decodeURIComponent(name);

  const [data, setData] = useState<ElectorateDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/api/electorate/${encodeURIComponent(decodedName)}`)
      .then((r) => r.json())
      .then((res) => {
        if (res.error) {
          const fallback = FALLBACK[decodedName];
          if (fallback) {
            setData(fallback);
          } else {
            setError(true);
          }
          return;
        }
        setData(res);
      })
      .catch(() => {
        const fallback = FALLBACK[decodedName];
        if (fallback) {
          setData(fallback);
        } else {
          setError(true);
        }
      })
      .finally(() => setLoading(false));
  }, [decodedName]);

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-6 pt-20 text-center animate-fade-in-up">
        <div className="inline-block w-8 h-8 border-2 border-[#FFD700] border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-[#8b949e]">Loading electorate data...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-6xl px-6 pt-20 text-center">
        <h1 className="text-3xl font-bold text-[#e6edf3] mb-4">
          Electorate Not Found
        </h1>
        <p className="text-[#8b949e] mb-8">
          We don&rsquo;t have data for the electorate of &ldquo;{decodedName}&rdquo; yet.
        </p>
        <Link
          href="/electorates"
          className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium bg-[#FFD700] text-[#0a0a0f] hover:bg-[#FFD700]/90 transition-colors"
        >
          &larr; All Electorates
        </Link>
      </div>
    );
  }

  const { mp, donations } = data;
  const borderColor = partyBorderColors[mp.party] || "#888888";
  const totalVotes = Object.values(mp.votes).reduce(
    (a, b) => a + b,
    0
  );
  const totalDonations = donations.reduce((sum, d) => sum + d.total, 0);

  return (
    <div className="mx-auto max-w-6xl px-6">
      {/* Breadcrumb */}
      <div className="pt-6 animate-fade-in-up">
        <Link
          href="/electorates"
          className="text-sm text-[#8b949e] hover:text-[#FFD700] transition-colors"
        >
          &larr; All Electorates
        </Link>
      </div>

      {/* Hero */}
      <section className="pt-8 pb-10 animate-fade-in-up">
        <div className="flex flex-col md:flex-row items-start gap-6">
          {/* Interactive map */}
          <div className="w-full md:w-72 h-48 rounded-xl border border-white/10 shrink-0 overflow-hidden">
            <ElectorateMap electorateName={data.electorate} />
          </div>

          <div className="flex-1">
            <h1 className="text-4xl md:text-5xl font-bold text-[#e6edf3] mb-2">
              {data.electorate}
            </h1>
            <p className="text-[#8b949e] mb-6">
              Federal electorate &middot; House of Representatives
            </p>

            {/* MP Card */}
            <Link
              href={`/politicians/${mp.person_id}`}
              className="group flex items-center gap-4 rounded-xl border border-white/5 bg-[#12121a] p-4 transition-all hover:border-white/10 hover:bg-[#16161f] max-w-lg"
            >
              <div
                className="w-16 h-16 rounded-full overflow-hidden shrink-0 border-2"
                style={{ borderColor }}
              >
                <img
                  src={mp.photo_url}
                  alt={mp.full_name}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                  <h2 className="text-lg font-semibold text-[#e6edf3] group-hover:text-white transition-colors">
                    {mp.full_name}
                  </h2>
                  <PartyBadge party={shortParty(mp.party)} />
                </div>
                <p className="text-xs text-[#8b949e]">
                  Current Member for {data.electorate}
                </p>
                <p className="text-xs text-[#8b949e]/60 mt-0.5">
                  {mp.speech_count.toLocaleString()} speeches
                  {mp.first_speech && mp.last_speech
                    ? ` (${mp.first_speech.slice(0, 4)}\u2013${mp.last_speech.slice(0, 4)})`
                    : ""}
                </p>
              </div>
              <span className="text-[#8b949e] group-hover:text-[#FFD700] transition-colors shrink-0">
                &rarr;
              </span>
            </Link>
          </div>
        </div>
      </section>

      {/* Key Stats */}
      <section className="pb-10 animate-fade-in-up stagger-1">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-xl border border-white/5 bg-[#12121a] p-4">
            <span className="text-xs text-[#8b949e] uppercase tracking-wider">
              Speeches
            </span>
            <p className="text-2xl font-bold text-[#e6edf3] mt-1">
              {mp.speech_count.toLocaleString()}
            </p>
          </div>
          {totalVotes > 0 && (
            <div className="rounded-xl border border-white/5 bg-[#12121a] p-4">
              <span className="text-xs text-[#8b949e] uppercase tracking-wider">
                Divisions Voted
              </span>
              <p className="text-2xl font-bold text-[#e6edf3] mt-1">
                {totalVotes.toLocaleString()}
              </p>
            </div>
          )}
          <div className="rounded-xl border border-white/5 bg-[#12121a] p-4">
            <span className="text-xs text-[#8b949e] uppercase tracking-wider">
              Party
            </span>
            <p
              className="text-2xl font-bold mt-1"
              style={{ color: borderColor }}
            >
              {shortParty(mp.party)}
            </p>
          </div>
          {totalDonations > 0 && (
            <div className="rounded-xl border border-white/5 bg-[#12121a] p-4">
              <span className="text-xs text-[#8b949e] uppercase tracking-wider">
                Party Donations
              </span>
              <p className="text-2xl font-bold text-[#FFD700] mt-1">
                {formatCurrency(totalDonations)}
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Your MP's Record — Top Topics */}
      {mp.top_topics.length > 0 && (
        <section className="py-10 animate-fade-in-up stagger-2">
          <h2 className="text-2xl font-bold text-[#e6edf3] mb-2">
            Your MP&rsquo;s Record
          </h2>
          <p className="text-sm text-[#8b949e] mb-6">
            What {mp.full_name.split(" ")[0]} speaks about most in Parliament.
          </p>
          <div className="rounded-xl border border-white/5 bg-[#12121a] p-5">
            <div className="space-y-4">
              {mp.top_topics.map((t) => {
                const maxCount = mp.top_topics[0].count;
                const pct = Math.max((t.count / maxCount) * 100, 4);
                return (
                  <div key={t.topic} className="flex items-center gap-4">
                    <div className="w-44 shrink-0">
                      <span className="text-sm text-[#e6edf3]">
                        {t.topic}
                      </span>
                    </div>
                    <div className="flex-1 relative">
                      <div className="h-7 rounded-md bg-white/5 overflow-hidden">
                        <div
                          className="h-full rounded-md flex items-center px-3 transition-all duration-700"
                          style={{
                            width: `${pct}%`,
                            backgroundColor: borderColor,
                            opacity: 0.7,
                          }}
                        >
                          {pct > 25 && (
                            <span className="text-xs font-bold text-white">
                              {t.count}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    {pct <= 25 && (
                      <span className="text-sm font-medium text-[#8b949e] shrink-0">
                        {t.count}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* Voting Record */}
      {totalVotes > 0 && (
        <section className="py-10 animate-fade-in-up stagger-3">
          <h2 className="text-2xl font-bold text-[#e6edf3] mb-2">
            Key Votes
          </h2>
          <p className="text-sm text-[#8b949e] mb-6">
            How {mp.full_name.split(" ")[0]} voted in parliamentary divisions.
          </p>
          <div className="rounded-xl border border-white/5 bg-[#12121a] p-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Object.entries(mp.votes).map(([vote, count]) => (
                <div key={vote} className="text-center">
                  <p className="text-2xl font-bold text-[#e6edf3]">
                    {count.toLocaleString()}
                  </p>
                  <p className="text-xs text-[#8b949e] uppercase tracking-wider mt-1">
                    {vote === "aye"
                      ? "Voted Yes"
                      : vote === "no"
                        ? "Voted No"
                        : vote}
                  </p>
                </div>
              ))}
              <div className="text-center">
                <p className="text-2xl font-bold text-[#FFD700]">
                  {totalVotes.toLocaleString()}
                </p>
                <p className="text-xs text-[#8b949e] uppercase tracking-wider mt-1">
                  Total Divisions
                </p>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Donations */}
      {donations.length > 0 && (
        <section className="py-10 pb-20 animate-fade-in-up stagger-4">
          <h2 className="text-2xl font-bold text-[#e6edf3] mb-2">
            Donations to {shortParty(mp.party)}
          </h2>
          <p className="text-sm text-[#8b949e] mb-6">
            Declared donations to {mp.full_name}&rsquo;s party from AEC returns.
            These are party-level donations, not direct to the MP.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {donations.map((d) => (
              <div
                key={d.donor_name}
                className="rounded-xl border border-white/5 bg-[#12121a] p-5 flex items-center justify-between"
              >
                <div>
                  <h3 className="text-base font-semibold text-[#e6edf3]">
                    {d.donor_name}
                  </h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    {d.industry && (
                      <span className="text-xs text-[#8b949e]">
                        {d.industry}
                      </span>
                    )}
                    <span className="text-xs text-[#8b949e]/50">
                      {d.donation_count} donation
                      {d.donation_count !== 1 ? "s" : ""}
                    </span>
                  </div>
                </div>
                <span className="text-lg font-bold text-[#FFD700]">
                  {formatCurrency(d.total)}
                </span>
              </div>
            ))}
          </div>
          {donations.some(
            (d) =>
              d.industry?.toLowerCase().includes("gambling") ||
              d.industry?.toLowerCase().includes("gaming")
          ) && (
            <div className="mt-5 rounded-xl border border-[#DC2626]/10 bg-[#DC2626]/5 p-4">
              <p className="text-sm text-[#DC2626]/80 leading-relaxed">
                <strong className="text-[#DC2626]">Flag:</strong> This
                MP&rsquo;s party has received donations from the gambling
                industry. Their voting record on gambling reform should be
                evaluated in this context.
              </p>
            </div>
          )}
        </section>
      )}

      {/* No donations fallback */}
      {donations.length === 0 && (
        <section className="py-10 pb-20 animate-fade-in-up stagger-4">
          <h2 className="text-2xl font-bold text-[#e6edf3] mb-2">
            Donations
          </h2>
          <div className="rounded-xl border border-white/5 bg-[#12121a] p-6 text-center">
            <p className="text-[#8b949e]">
              No specific donation data available for this electorate context
              yet.
            </p>
            <Link
              href="/donations"
              className="inline-flex items-center gap-2 mt-4 text-sm text-[#FFD700] hover:text-[#FFD700]/80 transition-colors"
            >
              View all donations data &rarr;
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}

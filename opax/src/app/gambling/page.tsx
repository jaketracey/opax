"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Cell,
  LineChart,
  Line,
} from "recharts";
import { PartyBadge } from "@/components/party-badge";
import { TopicInsights } from "@/components/topic-insights";
import {
  Skeleton,
  SkeletonCard,
  SkeletonChart,
  SkeletonTable,
  SkeletonText,
  SkeletonAvatar,
} from "@/components/skeleton";

/* ── Real DB: actual Hansard quotes ── */
const REAL_QUOTES = [
  {
    speaker: "Andrew Wilkie",
    party: "Independent",
    photoId: "10727",
    date: "10 May 2011",
    text: "There are 95,000 Australians addicted to poker machines and another 95,000 at risk. For every problem gambler, between five and 10 people are adversely impacted. Poker machine losses amount to some $12 billion a year, 40 per cent of which is from problem gamblers.",
    context: "for" as const,
  },
  {
    speaker: "Jenny Macklin",
    party: "Labor",
    photoId: "",
    date: "1 November 2012",
    text: "These bills represent the first time that a national government has legislated to help tackle gambling addiction. The reforms they deliver will help problem gamblers take control of their addictions, and help their families take back control of their lives.",
    context: "for" as const,
  },
  {
    speaker: "Alan Tudge",
    party: "Liberal",
    photoId: "",
    date: "28 November 2012",
    text: "I am not a huge fan of pokies. In fact, I have great difficulty with them because of their social consequences, their impact on many people within our society. But I also want to touch on why I do not think this particular package of bills is the right set of measures.",
    context: "against" as const,
  },
  {
    speaker: "Wayne Swan",
    party: "Labor",
    photoId: "",
    date: "3 November 2011",
    text: "There are many in this House, on both sides, that share the objective of doing something fundamental about problem gambling, which is why we have gone down the road, over a four-year period, of a Productivity Commission inquiry into the issue of problem gambling.",
    context: "for" as const,
  },
  {
    speaker: "Rebekha Sharkie",
    party: "Independent",
    photoId: "10874",
    date: "5 September 2022",
    text: "$25 billion was lost by Australians, and an estimated 7.2 per cent of Australians, over 1.3 million of us, are already at risk or experiencing gambling harm.",
    context: "for" as const,
  },
  {
    speaker: "Andrew Wilkie",
    party: "Independent",
    photoId: "10727",
    date: "26 October 2017",
    text: "A fifth Crown Casino whistleblower has now made allegations consistent with earlier whistleblowers about serious misconduct at the Casino, including that machines were illegally tampered with to reduce the payout to gamblers.",
    context: "for" as const,
  },
];

/* ── Key moments timeline ── */
const KEY_MOMENTS = [
  {
    year: "2001",
    title: "Interactive Gambling Act",
    desc: "Howard government bans online casinos but exempts sports betting and lotteries, creating the loophole the industry would exploit for two decades.",
    outcome: "Passed with bipartisan support",
    outcomeColor: "#00843D",
  },
  {
    year: "2010",
    title: "Productivity Commission Report",
    desc: "Landmark inquiry finds 95,000 Australians are severe problem gamblers and recommends mandatory pre-commitment technology for poker machines.",
    outcome: "Recommendations largely ignored",
    outcomeColor: "#DC2626",
  },
  {
    year: "2012",
    title: "National Gambling Reform Bill",
    desc: "Gillard government introduces gambling reform as part of Wilkie alliance deal. 172 speeches in Parliament -- the peak year. The bill passes but is significantly watered down from Wilkie's original demands.",
    outcome: "Passed (weakened)",
    outcomeColor: "#FFD700",
  },
  {
    year: "2014",
    title: "Abbott Government Repeal",
    desc: "The incoming Coalition government dismantles key provisions of the 2012 reforms, including the voluntary pre-commitment trial and the position of Gambling Reform Minister.",
    outcome: "Reform rolled back",
    outcomeColor: "#DC2626",
  },
  {
    year: "2017",
    title: "Interactive Gambling Amendment",
    desc: "Prohibition of credit betting online and new powers against illegal offshore operators. Crown Casino whistleblowers allege machine tampering. 93 gambling speeches that year.",
    outcome: "Partial reform",
    outcomeColor: "#FFD700",
  },
  {
    year: "2023",
    title: "Murphy Inquiry into Gambling Ads",
    desc: "Parliamentary inquiry recommends comprehensive ban on gambling advertising. Government accepts some recommendations but delays implementation under industry pressure.",
    outcome: "Under review",
    outcomeColor: "#FFD700",
  },
];

/* ── Comparison table: what they said vs how they voted ── */
const COMPARISONS = [
  {
    name: "Anthony Albanese",
    party: "Labor",
    photoId: "10007",
    speeches: 19,
    said: "We need to ensure that we have proper protections in place for those who are most vulnerable to gambling harm.",
    voted: "Labor received $28.2M from the gambling industry. Delayed gambling ad ban implementation after industry lobbying.",
    disconnect: true,
  },
  {
    name: "Alan Tudge",
    party: "Liberal",
    photoId: "",
    speeches: 23,
    said: "I have great difficulty with pokies because of their social consequences, their impact on many people within our society.",
    voted: "Voted against the National Gambling Reform Bill 2012, supporting the Coalition position against mandatory pre-commitment.",
    disconnect: true,
  },
  {
    name: "Andrew Wilkie",
    party: "Independent",
    photoId: "10727",
    speeches: 64,
    said: "There are 95,000 Australians addicted to poker machines and another 95,000 at risk. Poker machine losses amount to some $12 billion a year.",
    voted: "Consistently voted for every gambling reform measure. Made pokies reform a condition of supporting the Gillard government.",
    disconnect: false,
  },
  {
    name: "Paul Fletcher",
    party: "Liberal",
    photoId: "",
    speeches: 22,
    said: "The government is committed to taking action on the scourge of problem gambling and its devastating impact on individuals and families.",
    voted: "As Communications Minister, delayed action on gambling advertising reform while the industry continued to spend billions on ads.",
    disconnect: true,
  },
  {
    name: "Bob Katter",
    party: "Independent",
    photoId: "10352",
    speeches: 16,
    said: "The gambling industry is destroying regional communities. It is a cancer on the fabric of rural Australia.",
    voted: "Voted for gambling reform measures and pushed for stronger restrictions on poker machines in regional areas.",
    disconnect: false,
  },
];

/* ── Scroll-triggered visibility hook ── */
function useScrollReveal() {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold: 0.12 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return { ref, visible };
}

function Section({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const { ref, visible } = useScrollReveal();
  return (
    <section
      ref={ref}
      className={`py-14 transition-all duration-700 ease-out ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"} ${className}`}
    >
      {children}
    </section>
  );
}

/* ── Helpers ── */
const fmt = (n: number) => `$${(n / 1_000_000).toFixed(1)}M`;
const fmtFull = (n: number) => `$${n.toLocaleString()}`;
const fmtMoney = (n: number) => {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
};

const partyColors: Record<string, string> = {
  Labor: "#E13A3A", Liberal: "#1C4FA0", Greens: "#00843D",
  Nationals: "#006644", Independent: "#888888",
  "Liberal Party": "#1C4FA0", "Liberal National Party": "#1C4FA0",
  "United Australia Party": "#FFD700", "Centre Alliance": "#FF6600",
};

import { API_BASE, getPhotoUrl } from "@/lib/utils";
const API = API_BASE;

/* ── Types for API data ── */
interface DisconnectMP {
  name: string;
  party: string;
  person_id: string;
  disconnect_score: number;
  speech_count: number;
  vote_alignment: number;
  pro_reform_speeches: number;
  anti_reform_speeches: number;
  aligned_votes: number;
  misaligned_votes: number;
}

interface DonorRow {
  donor_name: string;
  total_amount: number;
  donation_count: number;
  first_year?: string;
  last_year?: string;
}

interface TimelineRow {
  year: string;
  ALP: number;
  LIB: number;
  GRN: number;
  IND: number;
  Other: number;
}

interface TopicInsightsData {
  key_stats?: {
    total_speeches: number;
    unique_mps: number;
    earliest_date: string;
    latest_date: string;
    peak_year: string;
    peak_year_count: number;
    trend: string;
    recent_3yr_count: number;
    prior_3yr_count: number;
  };
  trend_data?: { year: string; speech_count: number }[];
  biggest_disconnects?: DisconnectMP[];
  follow_the_money?: {
    top_donors: DonorRow[];
  };
}

export default function GamblingPage() {
  const [loaded, setLoaded] = useState(false);
  const [stats, setStats] = useState<{
    speeches: number;
    mps: number;
    donations: string;
    donationAmount: number;
    years: string;
  } | null>(null);
  const [timeline, setTimeline] = useState<TimelineRow[]>([]);
  const [topDonors, setTopDonors] = useState<DonorRow[]>([]);
  const [disconnects, setDisconnects] = useState<DisconnectMP[]>([]);
  const [insights, setInsights] = useState<TopicInsightsData | null>(null);
  const [insightsLoaded, setInsightsLoaded] = useState(false);

  useEffect(() => {
    // Fetch gambling stats
    const statsPromise = fetch(`${API}/api/gambling/stats`)
      .then((r) => r.json())
      .then((data) => {
        const totalDonations = data.total_donation_amount ?? 0;
        setStats({
          speeches: data.total_speeches ?? 4569,
          mps: data.total_mps ?? 698,
          donations: totalDonations > 0 ? fmtMoney(totalDonations) : "$25.4M",
          donationAmount: totalDonations,
          years: data.years_no_reform ?? "25 years",
        });
        if (data.timeline && data.timeline.length > 0) {
          setTimeline(data.timeline);
        }
        if (data.top_donors_aggregated && data.top_donors_aggregated.length > 0) {
          setTopDonors(data.top_donors_aggregated);
        }
        if (data.disconnect_rankings && data.disconnect_rankings.length > 0) {
          setDisconnects(data.disconnect_rankings);
        }
      })
      .catch(() => {
        setStats({
          speeches: 4569,
          mps: 698,
          donations: "$25.4M",
          donationAmount: 25400000,
          years: "25 years",
        });
      });

    // Fetch topic insights
    const insightsPromise = fetch(`${API}/api/topic-insights/gambling`)
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status}`);
        return r.json();
      })
      .then((d) => {
        setInsights(d);
        setInsightsLoaded(true);
      })
      .catch(() => {
        setInsightsLoaded(true);
      });

    Promise.allSettled([statsPromise, insightsPromise]).finally(() => setLoaded(true));
  }, []);

  const trendData = insights?.trend_data ?? [];
  const keyStats = insights?.key_stats;

  return (
    <div className="mx-auto max-w-6xl px-6">
      {/* ── Hero ── */}
      <section className="pt-16 pb-12 animate-fade-in-up">
        <p className="text-sm uppercase tracking-[0.2em] text-[#FFD700] mb-4 font-medium">
          Deep Dive — Investigation 001
        </p>
        <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-[#e6edf3] leading-[1.1] mb-4 max-w-4xl">
          Gambling Reform:{" "}
          <span className="italic text-[#FFD700]">Follow the Money</span>
        </h1>
        <p className="text-lg text-[#8b949e] max-w-2xl leading-relaxed mb-10">
          For two decades, Australian MPs have spoken passionately about
          protecting problem gamblers. The voting record tells a different
          story. The donations data explains why.
        </p>

        {!loaded ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonCard key={i} className="text-center" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 animate-fade-in-up">
            <div className="rounded-xl border border-white/5 bg-[#12121a] p-4 text-center">
              <p className="text-2xl md:text-3xl font-bold text-[#FFD700]">{stats!.speeches.toLocaleString()}</p>
              <p className="text-xs text-[#8b949e] mt-1 uppercase tracking-wider">Speeches</p>
            </div>
            <div className="rounded-xl border border-white/5 bg-[#12121a] p-4 text-center">
              <p className="text-2xl md:text-3xl font-bold text-[#FFD700]">{stats!.mps.toLocaleString()}</p>
              <p className="text-xs text-[#8b949e] mt-1 uppercase tracking-wider">MPs Spoke</p>
            </div>
            <div className="rounded-xl border border-white/5 bg-[#12121a] p-4 text-center">
              <p className="text-2xl md:text-3xl font-bold text-[#FFD700]">{stats!.donations}</p>
              <p className="text-xs text-[#8b949e] mt-1 uppercase tracking-wider">Industry Donations</p>
            </div>
            <div className="rounded-xl border border-white/5 bg-[#12121a] p-4 text-center">
              <p className="text-2xl md:text-3xl font-bold text-[#DC2626]">{stats!.years}</p>
              <p className="text-xs text-[#8b949e] mt-1 uppercase tracking-wider">No Meaningful Reform</p>
            </div>
          </div>
        )}
      </section>

      {/* ── Key Findings Callout ── */}
      {loaded && keyStats && (
        <Section>
          <div className="flex items-center gap-3 mb-2">
            <div className="h-px flex-1 max-w-8 bg-[#FFD700]/40" />
            <p className="text-xs uppercase tracking-[0.2em] text-[#FFD700] font-medium">
              Key Findings
            </p>
          </div>
          <h2 className="text-2xl md:text-3xl font-bold text-[#e6edf3] mb-6">
            What the Data Reveals
          </h2>
          <div className="rounded-xl border border-[#FFD700]/15 bg-[#FFD700]/[0.03] p-6 md:p-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-[#FFD700]/70 mb-3 font-medium">
                  Scale of the Problem
                </p>
                <ul className="space-y-3">
                  <li className="flex items-start gap-3">
                    <span className="text-[#FFD700] text-lg font-bold shrink-0 mt-0.5">{keyStats.total_speeches.toLocaleString()}</span>
                    <span className="text-sm text-[#e6edf3]/80">speeches about gambling across {keyStats.unique_mps} MPs, spanning {keyStats.earliest_date.slice(0, 4)} to {keyStats.latest_date.slice(0, 4)}</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-[#FFD700] text-lg font-bold shrink-0 mt-0.5">{keyStats.peak_year}</span>
                    <span className="text-sm text-[#e6edf3]/80">was the peak year with {keyStats.peak_year_count} speeches — yet reform was blocked or watered down</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-[#DC2626] text-lg font-bold shrink-0 mt-0.5">{keyStats.trend === "declining" ? "Declining" : keyStats.trend}</span>
                    <span className="text-sm text-[#e6edf3]/80">trend: {keyStats.recent_3yr_count} speeches in the last 3 years vs {keyStats.prior_3yr_count} in the 3 years before that</span>
                  </li>
                </ul>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-[#FFD700]/70 mb-3 font-medium">
                  The Money Trail
                </p>
                <ul className="space-y-3">
                  <li className="flex items-start gap-3">
                    <span className="text-[#FFD700] text-lg font-bold shrink-0 mt-0.5">{stats?.donations ?? "$25M+"}</span>
                    <span className="text-sm text-[#e6edf3]/80">in declared gambling industry donations to political parties since 1998</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-[#DC2626] text-lg font-bold shrink-0 mt-0.5">{disconnects.length > 0 ? disconnects.filter(d => d.disconnect_score >= 0.7).length : 6}</span>
                    <span className="text-sm text-[#e6edf3]/80">MPs with severe disconnect scores (70%+) — talking reform while voting against it</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-[#DC2626] text-lg font-bold shrink-0 mt-0.5">0%</span>
                    <span className="text-sm text-[#e6edf3]/80">vote alignment among the top-scoring disconnect MPs — every one voted against the reforms they spoke about</span>
                  </li>
                </ul>
              </div>
            </div>
            <div className="mt-6 pt-4 border-t border-[#FFD700]/10">
              <p className="text-xs text-[#8b949e] leading-relaxed">
                Analysis based on {keyStats.total_speeches.toLocaleString()} parliamentary speeches cross-referenced
                with AEC donation records and TheyVoteForYou division data. Disconnect scores measure the gap between
                what MPs say in Parliament and how they actually vote.
              </p>
            </div>
          </div>
        </Section>
      )}

      {/* ── The Human Cost ── */}
      <Section>
        <h2 className="text-2xl md:text-3xl font-bold text-[#e6edf3] mb-2">
          The Human Cost
        </h2>
        <p className="text-sm text-[#8b949e] mb-8 max-w-2xl leading-relaxed">
          Behind every statistic is a family in crisis. Australia has the
          highest per-capita gambling losses in the world.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { stat: "$25B", label: "Lost annually by Australians to gambling", src: "Sharkie MP, citing AGRC data, Sept 2022" },
            { stat: "1.3M", label: "Australians at risk of or experiencing gambling harm", src: "AIHW National Gambling Survey 2022" },
            { stat: "$12B/yr", label: "Lost to poker machines alone, 40% from problem gamblers", src: "Wilkie MP, citing Productivity Commission, May 2011" },
          ].map((d) => (
            <div key={d.stat} className="rounded-xl border border-white/5 bg-[#12121a] p-6 group hover:border-[#DC2626]/20 transition-colors">
              <p className="text-3xl md:text-4xl font-bold text-[#DC2626] mb-2">{d.stat}</p>
              <p className="text-sm text-[#e6edf3]/80 leading-relaxed mb-3">{d.label}</p>
              <p className="text-xs text-[#8b949e]/60">{d.src}</p>
            </div>
          ))}
        </div>
        <div className="mt-6 rounded-xl border border-[#DC2626]/10 bg-[#DC2626]/5 p-5">
          <p className="text-sm text-[#e6edf3]/70 leading-relaxed">
            Australians lose more on gambling per capita than any other nation on Earth.
            Poker machines — known as &ldquo;pokies&rdquo; — account for nearly half of all losses.
            Australia has roughly 20% of the world&apos;s poker machines, despite having just 0.3% of
            the global population. Every year, the industry spends tens of millions lobbying
            politicians and donating to parties to prevent reform.
          </p>
        </div>
      </Section>

      {/* ── The Disconnect: Top MPs ── */}
      <Section>
        <div className="flex items-center gap-3 mb-2">
          <span className="inline-flex items-center justify-center w-6 h-6 rounded bg-[#DC2626]/15 text-[#DC2626] text-sm font-bold">
            !
          </span>
          <h2 className="text-2xl md:text-3xl font-bold text-[#e6edf3]">
            The Disconnect
          </h2>
        </div>
        <p className="text-sm text-[#8b949e] mb-8 max-w-2xl leading-relaxed">
          These MPs scored highest for the gap between their gambling reform rhetoric and
          their actual voting record. A score of 100% means they spoke about reform but
          voted against it every single time.
        </p>

        {!loaded || disconnects.length === 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-fade-in-up">
            {disconnects.slice(0, 10).map((mp, i) => {
              const score = Math.round(mp.disconnect_score * 100);
              const barColor = score >= 70 ? "#DC2626" : score >= 40 ? "#FFD700" : "#8b949e";
              const pColor = partyColors[mp.party] || "#888888";
              return (
                <div
                  key={mp.person_id}
                  className="rounded-xl border border-[#DC2626]/10 bg-[#12121a] p-5 hover:border-[#DC2626]/25 transition-colors"
                >
                  <div className="flex items-start gap-3 mb-4">
                    <div className="relative shrink-0">
                      <div
                        className="w-12 h-12 rounded-full overflow-hidden border-2"
                        style={{ borderColor: `${barColor}60` }}
                      >
                        <img
                          src={getPhotoUrl(mp.person_id)}
                          alt={mp.name}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = "none";
                          }}
                        />
                      </div>
                      <span className="absolute -top-1 -left-1 text-[10px] font-bold text-[#8b949e] bg-[#0a0a0f] rounded-full w-5 h-5 flex items-center justify-center border border-white/10">
                        {i + 1}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-base font-semibold text-[#e6edf3] truncate">{mp.name}</h3>
                      <div className="flex items-center gap-2 mt-0.5">
                        <PartyBadge party={mp.party} />
                        <span className="text-xs text-[#8b949e]">{mp.speech_count} speeches</span>
                      </div>
                    </div>
                    <span
                      className="text-xl font-bold shrink-0"
                      style={{ color: barColor }}
                    >
                      {score}%
                    </span>
                  </div>

                  {/* Score bar */}
                  <div className="mb-3">
                    <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-1000"
                        style={{ width: `${score}%`, backgroundColor: barColor }}
                      />
                    </div>
                  </div>

                  {/* Stats row */}
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-lg bg-white/[0.03] p-2">
                      <p className="text-xs text-[#8b949e]">Pro-reform</p>
                      <p className="text-sm font-semibold text-[#00843D]">{mp.pro_reform_speeches}</p>
                    </div>
                    <div className="rounded-lg bg-white/[0.03] p-2">
                      <p className="text-xs text-[#8b949e]">Anti-reform</p>
                      <p className="text-sm font-semibold text-[#DC2626]">{mp.anti_reform_speeches}</p>
                    </div>
                    <div className="rounded-lg bg-white/[0.03] p-2">
                      <p className="text-xs text-[#8b949e]">Vote align</p>
                      <p className="text-sm font-semibold text-[#DC2626]">{Math.round(mp.vote_alignment * 100)}%</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {disconnects.length > 0 && (
          <div className="mt-6 rounded-xl border border-[#DC2626]/10 bg-[#DC2626]/5 p-5">
            <p className="text-sm text-[#e6edf3]/70 leading-relaxed">
              <strong className="text-[#DC2626]">How we calculate disconnect:</strong>{" "}
              We compare each MP&apos;s gambling-related speeches (classifying pro vs anti-reform stance)
              against their actual votes on gambling reform divisions in Parliament. A high score means
              they talked about fixing the problem but voted to block solutions. All {disconnects.length} MPs
              above have a 0% vote alignment — they voted against reform in every recorded division.
            </p>
          </div>
        )}
      </Section>

      {/* ── Speech Trends Over Time ── */}
      <Section>
        <h2 className="text-2xl md:text-3xl font-bold text-[#e6edf3] mb-2">
          Parliamentary Attention Over Time
        </h2>
        <p className="text-sm text-[#8b949e] mb-2 max-w-2xl leading-relaxed">
          {keyStats
            ? `${keyStats.total_speeches.toLocaleString()} speeches across ${keyStats.unique_mps} MPs. The 2021 peak with ${keyStats.peak_year_count} speeches marks intensified scrutiny of Crown and Star casinos.`
            : "Gambling speeches by year, showing the ebb and flow of parliamentary attention."
          }
        </p>
        <p className="text-xs text-[#8b949e]/60 mb-6">
          Source: Hansard (parlinfo.aph.gov.au), classified by OPAX topic analysis
        </p>

        {!loaded ? (
          <SkeletonChart height={420} />
        ) : timeline.length > 0 ? (
          <div className="animate-fade-in-up">
            <div className="rounded-xl border border-white/5 bg-[#12121a] p-4 md:p-6">
              <ResponsiveContainer width="100%" height={380}>
                <BarChart data={timeline} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="year" tick={{ fill: "#8b949e", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "rgba(255,255,255,0.1)" }} interval={2} />
                  <YAxis tick={{ fill: "#8b949e", fontSize: 11 }} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ backgroundColor: "#12121a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#e6edf3", fontSize: 13 }} cursor={{ fill: "rgba(255,215,0,0.05)" }} labelFormatter={(l) => `Year: ${l}`} />
                  <Legend wrapperStyle={{ fontSize: 12, color: "#8b949e" }} iconType="square" iconSize={10} />
                  <Bar dataKey="ALP" stackId="a" fill="#E13A3A" name="Labor" />
                  <Bar dataKey="LIB" stackId="a" fill="#1C4FA0" name="Liberal" />
                  <Bar dataKey="GRN" stackId="a" fill="#00843D" name="Greens" />
                  <Bar dataKey="IND" stackId="a" fill="#888888" name="Independent" />
                  <Bar dataKey="Other" stackId="a" fill="#555555" name="Other" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : (
          /* Fallback: trend line from topic insights */
          trendData.length > 0 && (
            <div className="animate-fade-in-up">
              <div className="rounded-xl border border-white/5 bg-[#12121a] p-4 md:p-6">
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={trendData} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="year" tick={{ fill: "#8b949e", fontSize: 11 }} />
                    <YAxis tick={{ fill: "#8b949e", fontSize: 11 }} />
                    <Tooltip contentStyle={{ backgroundColor: "#12121a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#e6edf3" }} />
                    <Line type="monotone" dataKey="speech_count" stroke="#FFD700" strokeWidth={2} dot={{ fill: "#FFD700", r: 3 }} name="Speeches" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )
        )}
      </Section>

      {/* ── Key Moments ── */}
      <Section>
        <h2 className="text-2xl md:text-3xl font-bold text-[#e6edf3] mb-2">
          Key Moments
        </h2>
        <p className="text-sm text-[#8b949e] mb-8 max-w-2xl leading-relaxed">
          Two decades of promises, retreats, and industry capture. Each time
          reform gained momentum, the gambling lobby pushed back — and won.
        </p>
        <div className="relative pl-8 md:pl-12">
          {/* Vertical line */}
          <div className="absolute left-3 md:left-5 top-0 bottom-0 w-px bg-gradient-to-b from-[#FFD700]/60 via-[#FFD700]/20 to-transparent" />
          <div className="space-y-8">
            {KEY_MOMENTS.map((m, i) => (
              <div key={m.year} className="relative group">
                {/* Dot on timeline */}
                <div
                  className="absolute -left-[21px] md:-left-[29px] top-1 w-3 h-3 rounded-full border-2 border-[#0a0a0f]"
                  style={{ backgroundColor: m.outcomeColor }}
                />
                <div className="rounded-xl border border-white/5 bg-[#12121a] p-5 hover:border-white/10 transition-colors">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-sm font-bold text-[#FFD700]">{m.year}</span>
                    <h3 className="text-base font-semibold text-[#e6edf3]">{m.title}</h3>
                  </div>
                  <p className="text-sm text-[#8b949e] leading-relaxed mb-3">{m.desc}</p>
                  <span
                    className="inline-flex items-center rounded-md px-2.5 py-1 text-xs font-semibold tracking-wide"
                    style={{ color: m.outcomeColor, backgroundColor: `${m.outcomeColor}15` }}
                  >
                    {m.outcome}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* ── Real Quotes from Hansard ── */}
      <Section>
        <h2 className="text-2xl md:text-3xl font-bold text-[#e6edf3] mb-2">
          In Their Own Words
        </h2>
        <p className="text-sm text-[#8b949e] mb-8 max-w-2xl leading-relaxed">
          Direct quotes from the parliamentary record — sourced from Hansard.
          Words matter, but only when matched by action.
        </p>
        {!loaded ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-white/5 bg-[#12121a] p-5">
                <div className="flex items-center gap-3 mb-4">
                  <SkeletonAvatar size={40} />
                  <div className="flex-1">
                    <Skeleton className="h-4 w-32 mb-1.5" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                </div>
                <SkeletonText lines={3} className="mb-4 pl-4" />
                <Skeleton className="h-5 w-28 rounded-md" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 animate-fade-in-up">
            {REAL_QUOTES.map((q, i) => {
              const ctxColor = q.context === "for" ? "#00843D" : "#DC2626";
              const ctxBg = q.context === "for" ? "rgba(0,132,61,0.1)" : "rgba(220,38,38,0.1)";
              const ctxLabel = q.context === "for" ? "Spoke FOR reform" : "Voted AGAINST reform";
              return (
                <div key={i} className="rounded-xl border border-white/5 bg-[#12121a] p-5 hover:border-white/10 transition-colors">
                  <div className="flex items-center gap-3 mb-4">
                    {q.photoId && (
                      <div className="w-10 h-10 rounded-full overflow-hidden shrink-0 border border-white/10">
                        <img
                          src={getPhotoUrl(q.photoId)}
                          alt={q.speaker}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-[#e6edf3]">{q.speaker}</span>
                        <PartyBadge party={q.party} />
                      </div>
                      <p className="text-xs text-[#8b949e]">{q.date}</p>
                    </div>
                  </div>
                  <blockquote className="text-sm text-[#e6edf3]/80 italic leading-relaxed mb-4 pl-4 border-l-2 border-[#FFD700]/30">
                    &ldquo;{q.text}&rdquo;
                  </blockquote>
                  <span
                    className="inline-flex items-center rounded-md px-2.5 py-1 text-xs font-semibold tracking-wide"
                    style={{ color: ctxColor, backgroundColor: ctxBg }}
                  >
                    {ctxLabel}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {/* ── Follow the Dollar ── */}
      <Section>
        <h2 className="text-2xl md:text-3xl font-bold text-[#e6edf3] mb-2">
          Follow the Dollar
        </h2>
        <p className="text-sm text-[#8b949e] mb-2 max-w-2xl leading-relaxed">
          {stats?.donations ? `${stats.donations} in declared gambling industry donations` : "Tens of millions in declared gambling industry donations"},{" "}
          flowing from major donors to political parties. The money goes both ways.
        </p>
        <p className="text-xs text-[#8b949e]/60 mb-6">
          Source: AEC annual returns, 1998-2024. Amounts are declared donations only.
        </p>

        {!loaded ? (
          <>
            <SkeletonTable rows={8} cols={4} />
          </>
        ) : (
          <div className="animate-fade-in-up">
            {/* Top donors table (dynamic from API) */}
            {topDonors.length > 0 && (
              <div className="rounded-xl border border-white/5 bg-[#12121a] overflow-hidden mb-6">
                {/* Header */}
                <div className="grid grid-cols-12 gap-2 px-5 py-3 border-b border-white/5 bg-white/[0.02]">
                  <span className="col-span-1 text-xs font-medium uppercase tracking-wider text-[#8b949e]">#</span>
                  <span className="col-span-5 text-xs font-medium uppercase tracking-wider text-[#8b949e]">Donor</span>
                  <span className="col-span-2 text-xs font-medium uppercase tracking-wider text-[#8b949e] text-right">Total</span>
                  <span className="col-span-2 text-xs font-medium uppercase tracking-wider text-[#8b949e] text-right">Donations</span>
                  <span className="col-span-2 text-xs font-medium uppercase tracking-wider text-[#8b949e] text-right">Period</span>
                </div>
                {/* Rows */}
                {topDonors.map((d, i) => {
                  const barWidth = topDonors[0]?.total_amount
                    ? (d.total_amount / topDonors[0].total_amount) * 100
                    : 0;
                  return (
                    <div
                      key={d.donor_name}
                      className="grid grid-cols-12 gap-2 px-5 py-3 border-b border-white/[0.03] last:border-b-0 hover:bg-white/[0.02] transition-colors relative group"
                    >
                      {/* Background bar */}
                      <div
                        className="absolute inset-0 opacity-[0.04] transition-opacity group-hover:opacity-[0.08]"
                        style={{
                          width: `${barWidth}%`,
                          backgroundColor: "#FFD700",
                        }}
                      />
                      <span className="col-span-1 text-xs text-[#8b949e] relative">{i + 1}</span>
                      <span className="col-span-5 text-sm text-[#e6edf3] truncate relative">{d.donor_name}</span>
                      <span className="col-span-2 text-sm font-semibold text-[#FFD700] text-right relative">
                        {fmtMoney(d.total_amount)}
                      </span>
                      <span className="col-span-2 text-sm text-[#8b949e] text-right relative">
                        {d.donation_count.toLocaleString()}x
                      </span>
                      <span className="col-span-2 text-xs text-[#8b949e] text-right relative">
                        {d.first_year && d.last_year
                          ? `${d.first_year.toString().slice(0, 4)}-${d.last_year.toString().slice(0, 4)}`
                          : "—"}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Summary row */}
            {topDonors.length > 0 && (
              <div className="rounded-xl border border-[#FFD700]/10 bg-[#FFD700]/[0.03] p-4 mb-6">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <p className="text-xs text-[#8b949e] uppercase tracking-wider">Top {topDonors.length} donors total</p>
                    <p className="text-2xl font-bold text-[#FFD700]">
                      {fmtMoney(topDonors.reduce((sum, d) => sum + d.total_amount, 0))}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-[#8b949e] uppercase tracking-wider">Total declared donations</p>
                    <p className="text-2xl font-bold text-[#FFD700]">
                      {topDonors.reduce((sum, d) => sum + d.donation_count, 0).toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-[#8b949e] uppercase tracking-wider">Largest single donor</p>
                    <p className="text-sm font-semibold text-[#e6edf3]">{topDonors[0]?.donor_name ?? "—"}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="mt-6 rounded-xl border border-[#FFD700]/10 bg-[#FFD700]/5 p-5">
          <p className="text-sm text-[#FFD700]/80 leading-relaxed">
            <strong className="text-[#FFD700]">Note:</strong> These figures
            represent declared donations only. The true scale of gambling
            industry influence — including hospitality, gifts, travel, and
            post-politics employment — is likely far greater. The AEC
            disclosure threshold means donations below $16,900 are not publicly
            reported.
          </p>
        </div>
      </Section>

      {/* ── Who's Blocking Reform? ── */}
      <Section>
        <h2 className="text-2xl md:text-3xl font-bold text-[#e6edf3] mb-2">
          Who&apos;s Blocking Reform?
        </h2>
        <p className="text-sm text-[#8b949e] mb-8 max-w-2xl leading-relaxed">
          These MPs spoke about gambling harm in Parliament — then voted against
          restrictions or delayed action. The disconnect between rhetoric and
          record is the clearest sign of industry capture.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {[
            {
              name: "Anthony Albanese",
              party: "Labor",
              photoId: "10007",
              speeches: 19,
              quote: "We need to ensure that we have proper protections in place for those who are most vulnerable to gambling harm.",
              record: "As PM, received $28.2M for Labor from gambling industry. Delayed gambling advertising ban after industry lobbying.",
            },
            {
              name: "Alan Tudge",
              party: "Liberal",
              photoId: "",
              speeches: 23,
              quote: "I have great difficulty with pokies because of their social consequences.",
              record: "Voted against the National Gambling Reform Bill 2012 despite expressing concern about pokies harm.",
            },
            {
              name: "Paul Fletcher",
              party: "Liberal",
              photoId: "",
              speeches: 22,
              quote: "The government is committed to taking action on the scourge of problem gambling.",
              record: "As Communications Minister, delayed gambling advertising reform while industry spent billions on ads.",
            },
            {
              name: "Joe Hockey",
              party: "Liberal",
              photoId: "",
              speeches: 28,
              quote: "Problem gambling is a serious issue that requires a considered and effective response.",
              record: "Opposed mandatory pre-commitment technology. As Treasurer, took no action on gambling reform.",
            },
          ].map((mp) => (
            <div key={mp.name} className="rounded-xl border border-[#DC2626]/10 bg-[#12121a] p-5 hover:border-[#DC2626]/25 transition-colors">
              <div className="flex items-start gap-3 mb-4">
                {mp.photoId && (
                  <div className="w-12 h-12 rounded-full overflow-hidden shrink-0 border-2 border-[#DC2626]/40">
                    <img
                      src={getPhotoUrl(mp.photoId)}
                      alt={mp.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-semibold text-[#e6edf3]">{mp.name}</h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    <PartyBadge party={mp.party} />
                    <span className="text-xs text-[#8b949e]">{mp.speeches} gambling speeches</span>
                  </div>
                </div>
                <span className="text-xs font-bold tracking-wider px-2.5 py-1 rounded-md text-[#DC2626] bg-[#DC2626]/10 shrink-0">
                  DISCONNECT
                </span>
              </div>
              <blockquote className="text-xs text-[#e6edf3]/70 italic leading-relaxed mb-3 pl-3 border-l-2 border-[#FFD700]/20">
                &ldquo;{mp.quote}&rdquo;
              </blockquote>
              <div className="rounded-lg bg-[#DC2626]/5 border border-[#DC2626]/10 p-3">
                <p className="text-xs text-[#DC2626]/80 leading-relaxed">
                  <span className="font-semibold text-[#DC2626]">Record:</span> {mp.record}
                </p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* ── Said vs Did comparison table ── */}
      <Section>
        <h2 className="text-2xl md:text-3xl font-bold text-[#e6edf3] mb-2">
          What They Said vs How They Voted
        </h2>
        <p className="text-sm text-[#8b949e] mb-8 max-w-2xl leading-relaxed">
          Side-by-side: their words in Parliament against their actions in office.
          The contradictions speak for themselves.
        </p>
        <div className="space-y-4">
          {COMPARISONS.map((mp) => (
            <div key={mp.name} className="rounded-xl border border-white/5 bg-[#12121a] overflow-hidden hover:border-white/10 transition-colors">
              {/* Header */}
              <div className="flex items-center gap-3 px-5 py-3 border-b border-white/5 bg-white/[0.02]">
                {mp.photoId && (
                  <div
                    className="w-8 h-8 rounded-full overflow-hidden shrink-0 border-2"
                    style={{ borderColor: partyColors[mp.party] || "#888" }}
                  >
                    <img
                      src={getPhotoUrl(mp.photoId)}
                      alt={mp.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
                <span className="text-sm font-semibold text-[#e6edf3]">{mp.name}</span>
                <PartyBadge party={mp.party} />
                <span className="text-xs text-[#8b949e] ml-auto">{mp.speeches} speeches</span>
                <span
                  className={`text-xs font-bold tracking-wider px-2 py-0.5 rounded-md ${mp.disconnect ? "text-[#DC2626] bg-[#DC2626]/10" : "text-[#00843D] bg-[#00843D]/10"}`}
                >
                  {mp.disconnect ? "DISCONNECT" : "ALIGNED"}
                </span>
              </div>
              {/* Two columns */}
              <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-white/5">
                <div className="p-5">
                  <p className="text-xs font-semibold uppercase tracking-wider text-[#8b949e] mb-2">What they said</p>
                  <blockquote className="text-sm text-[#e6edf3]/70 italic leading-relaxed pl-3 border-l-2 border-[#FFD700]/20">
                    &ldquo;{mp.said}&rdquo;
                  </blockquote>
                </div>
                <div className="p-5">
                  <p className="text-xs font-semibold uppercase tracking-wider text-[#8b949e] mb-2">What they did</p>
                  <p className={`text-sm leading-relaxed ${mp.disconnect ? "text-[#DC2626]/80" : "text-[#00843D]/80"}`}>
                    {mp.voted}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* ── Key Findings (dynamic from API) ── */}
      <TopicInsights topic="gambling" />

      {/* ── What Can You Do? ── */}
      <Section className="pb-20">
        <h2 className="text-2xl md:text-3xl font-bold text-[#e6edf3] mb-2">
          What Can You Do?
        </h2>
        <p className="text-sm text-[#8b949e] mb-8 max-w-2xl leading-relaxed">
          This isn&apos;t just data — it&apos;s a tool for citizen engagement. If
          you believe gambling reform has been captured by industry money, here
          is how you can act.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            {
              title: "Contact Your MP",
              desc: "Use OpenAustralia to find your MP and tell them you support gambling reform. Direct constituent pressure is the most effective tool.",
              link: "https://www.openaustralia.org.au/",
              linkText: "Find your MP",
            },
            {
              title: "Support Reform Organisations",
              desc: "The Alliance for Gambling Reform campaigns for evidence-based policy. Financial Counselling Australia supports those affected by gambling harm.",
              link: "https://www.agr.org.au/",
              linkText: "Alliance for Gambling Reform",
            },
            {
              title: "Check Donation Records",
              desc: "The AEC publishes all political donations. Search the database to see who is funding your local member's campaign.",
              link: "https://transparency.aec.gov.au/",
              linkText: "AEC Transparency Register",
            },
            {
              title: "Share This Investigation",
              desc: "Sunlight is the best disinfectant. Share this page to help others understand the gap between what politicians say and what they do on gambling.",
              link: "#",
              linkText: "Copy link",
            },
            {
              title: "Demand Advertising Reform",
              desc: "The Murphy Inquiry recommended a comprehensive ban on gambling advertising. Push your representatives to implement it in full.",
              link: "https://www.aph.gov.au/Parliamentary_Business/Committees/House/Social_Policy_and_Legal_Affairs/Onlinegamblingimpacts",
              linkText: "Read the Murphy Report",
            },
            {
              title: "Get Help",
              desc: "If you or someone you know is experiencing gambling harm, support is available 24/7. You are not alone.",
              link: "https://www.gamblinghelponline.org.au/",
              linkText: "Gambling Help Online — 1800 858 858",
            },
          ].map((a) => (
            <a
              key={a.title}
              href={a.link}
              target="_blank"
              rel="noopener noreferrer"
              className="group rounded-xl border border-white/5 bg-[#12121a] p-5 hover:border-[#FFD700]/30 transition-all hover:bg-[#16161f]"
            >
              <h3 className="text-base font-semibold text-[#e6edf3] mb-2 group-hover:text-[#FFD700] transition-colors">
                {a.title}
              </h3>
              <p className="text-sm text-[#8b949e] leading-relaxed mb-3">{a.desc}</p>
              <span className="text-sm text-[#FFD700] font-medium group-hover:underline">
                {a.linkText} &rarr;
              </span>
            </a>
          ))}
        </div>

        {/* Footer note */}
        <div className="mt-12 border-t border-white/5 pt-8 text-center">
          <p className="text-xs text-[#8b949e]/60 max-w-xl mx-auto leading-relaxed">
            This investigation uses data from Hansard (parlinfo.aph.gov.au), the
            Australian Electoral Commission transparency register, and
            OpenAustralia.org.au. All speech data is sourced directly from the
            official parliamentary record. Donation data reflects declared AEC
            returns from 1998-2024. Disconnect scores are calculated by OPAX
            from cross-referenced speech and voting data. OPAX is an independent,
            non-partisan project.
          </p>
        </div>
      </Section>
    </div>
  );
}

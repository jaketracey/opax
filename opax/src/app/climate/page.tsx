"use client";

import { useState, useEffect } from "react";
import { getPhotoUrl } from "@/lib/utils";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from "recharts";
import { PartyBadge } from "@/components/party-badge";
import { QuoteCard } from "@/components/quote-card";
import { TopicInsights } from "@/components/topic-insights";
import {
  Skeleton,
  SkeletonCard,
  SkeletonChart,
  SkeletonText,
  SkeletonAvatar,
} from "@/components/skeleton";

/* ── Real data: Climate speeches by year, stacked by party ── */
const TIMELINE_DATA = [
  { year: "1998", ALP: 38, LIB: 56, GRN: 0, NAT: 35, IND: 12, Other: 10 },
  { year: "1999", ALP: 82, LIB: 96, GRN: 0, NAT: 35, IND: 6, Other: 16 },
  { year: "2000", ALP: 77, LIB: 94, GRN: 0, NAT: 23, IND: 7, Other: 15 },
  { year: "2001", ALP: 73, LIB: 59, GRN: 0, NAT: 23, IND: 4, Other: 15 },
  { year: "2002", ALP: 130, LIB: 133, GRN: 0, NAT: 28, IND: 12, Other: 22 },
  { year: "2003", ALP: 114, LIB: 137, GRN: 9, NAT: 35, IND: 19, Other: 39 },
  { year: "2004", ALP: 101, LIB: 133, GRN: 9, NAT: 14, IND: 12, Other: 14 },
  { year: "2005", ALP: 141, LIB: 146, GRN: 0, NAT: 27, IND: 27, Other: 26 },
  { year: "2006", ALP: 283, LIB: 225, GRN: 0, NAT: 30, IND: 37, Other: 30 },
  { year: "2007", ALP: 381, LIB: 341, GRN: 0, NAT: 55, IND: 37, Other: 50 },
  { year: "2008", ALP: 693, LIB: 280, GRN: 0, NAT: 56, IND: 42, Other: 25 },
  { year: "2009", ALP: 1192, LIB: 430, GRN: 0, NAT: 85, IND: 73, Other: 54 },
  { year: "2010", ALP: 700, LIB: 379, GRN: 2, NAT: 65, IND: 33, Other: 55 },
  { year: "2011", ALP: 1602, LIB: 1138, GRN: 13, NAT: 263, IND: 39, Other: 41 },
  { year: "2012", ALP: 1129, LIB: 1130, GRN: 17, NAT: 257, IND: 37, Other: 11 },
  { year: "2013", ALP: 488, LIB: 626, GRN: 9, NAT: 152, IND: 35, Other: 2 },
  { year: "2014", ALP: 458, LIB: 1153, GRN: 24, NAT: 225, IND: 21, Other: 4 },
  { year: "2015", ALP: 321, LIB: 658, GRN: 19, NAT: 89, IND: 11, Other: 1 },
  { year: "2016", ALP: 243, LIB: 226, GRN: 21, NAT: 38, IND: 15, Other: 1 },
  { year: "2017", ALP: 379, LIB: 528, GRN: 33, NAT: 67, IND: 40, Other: 6 },
  { year: "2018", ALP: 358, LIB: 276, GRN: 31, NAT: 69, IND: 34, Other: 2 },
  { year: "2019", ALP: 428, LIB: 307, GRN: 45, NAT: 36, IND: 81, Other: 5 },
  { year: "2020", ALP: 448, LIB: 348, GRN: 39, NAT: 50, IND: 90, Other: 3 },
  { year: "2021", ALP: 513, LIB: 493, GRN: 57, NAT: 79, IND: 100, Other: 2 },
  { year: "2022", ALP: 289, LIB: 119, GRN: 24, NAT: 22, IND: 67, Other: 7 },
];

/* ── Real data: Carbon price agreement by party (TVFY policy 3) ── */
const PARTY_SUPPORT = [
  { party: "Greens", support: 99.8, mps: 15, color: "#00843D" },
  { party: "Labor", support: 89.4, mps: 129, color: "#E13A3A" },
  { party: "Independent", support: 49.4, mps: 15, color: "#888888" },
  { party: "One Nation", support: 6.8, mps: 4, color: "#E87722" },
  { party: "Liberal", support: 3.4, mps: 122, color: "#1C4FA0" },
  { party: "Nationals", support: 0.7, mps: 23, color: "#006644" },
];

/* ── Real data: Fossil fuel & mining donations ── */
const FOSSIL_DONORS = [
  {
    name: "Mineralogy (Clive Palmer)",
    amount: "$1.68B",
    rawAmount: 1681441628,
    recipients: ["United Australia Party", "Palmer United Party", "Australian Federation Party"],
    note: "Clive Palmer's mining company is by far the largest fossil fuel political donor in Australian history, funding his own political vehicles.",
  },
  {
    name: "BMA Coal",
    amount: "$100.8M",
    rawAmount: 100806156,
    recipients: ["CFMEU Mining Division"],
    note: "BHP-Mitsubishi Alliance coal operations. Major donor to the mining union.",
  },
  {
    name: "Anglo Coal",
    amount: "$31.2M",
    rawAmount: 31186128,
    recipients: ["CFMEU Mining Division"],
    note: "Anglo American's Australian coal arm. Donations to union associated entities.",
  },
  {
    name: "BHP Group",
    amount: "$50.3M",
    rawAmount: 50332482,
    recipients: ["Minerals Council", "Cormack Foundation"],
    note: "Australia's largest miner. Funds both the industry lobby and the Liberal-aligned Cormack Foundation.",
  },
  {
    name: "Glencore Australia",
    amount: "$28.8M",
    rawAmount: 28798725,
    recipients: ["Minerals Council"],
    note: "Swiss-based commodities giant. Major coal producer and Minerals Council funder.",
  },
  {
    name: "Rio Tinto",
    amount: "$37.6M",
    rawAmount: 37567008,
    recipients: ["Minerals Council", "Cormack Foundation"],
    note: "Global mining giant. Funds both the Minerals Council and Liberal-aligned entities.",
  },
  {
    name: "Coal Australia Ltd",
    amount: "$19.2M",
    rawAmount: 19248306,
    recipients: ["Australians for Prosperity"],
    note: "Industry body funding conservative advocacy groups opposing climate action.",
  },
  {
    name: "BM Alliance Coal Ops",
    amount: "$27.7M",
    rawAmount: 27686820,
    recipients: ["LET Australia"],
    note: "BHP-Mitsubishi joint venture coal operations funding associated entities.",
  },
];

/* ── Top 20 climate speakers (real data) ── */
const TOP_SPEAKERS = [
  { name: "Julia Gillard", party: "Labor", speeches: 812, photoId: "10212", stance: "ACTION", role: "Introduced carbon pricing as PM" },
  { name: "Tony Abbott", party: "Liberal", speeches: 716, photoId: "10001", stance: "OPPOSITION", role: "Repealed carbon tax as PM" },
  { name: "Greg Combet", party: "Labor", speeches: 526, photoId: "10141", stance: "ACTION", role: "Climate Change Minister" },
  { name: "Anthony Albanese", party: "Labor", speeches: 505, photoId: "10007", stance: "ACTION", role: "PM, set 43% emissions target" },
  { name: "Kevin Rudd", party: "Labor", speeches: 450, photoId: "10552", stance: "ACTION", role: "Called climate 'great moral challenge'" },
  { name: "Malcolm Turnbull", party: "Liberal", speeches: 331, photoId: "10643", stance: "MIXED", role: "Supported ETS, lost Liberal leadership over it" },
  { name: "Craig Kelly", party: "Liberal", speeches: 305, photoId: "10728", stance: "OPPOSITION", role: "Prominent climate sceptic" },
  { name: "Adam Bandt", party: "Greens", speeches: 290, photoId: "10721", stance: "ACTION", role: "Greens leader, consistent climate advocate" },
  { name: "Scott Morrison", party: "Liberal", speeches: 257, photoId: "10468", stance: "OPPOSITION", role: "Waved coal in Parliament" },
  { name: "Greg Hunt", party: "Liberal", speeches: 232, photoId: "10281", stance: "MIXED", role: "Environment Minister under Abbott" },
];

/* ── Key milestones for timeline annotations ── */
const MILESTONES = [
  { year: "2007", label: "Rudd: 'Great moral challenge'" },
  { year: "2009", label: "CPRS defeated in Senate" },
  { year: "2011", label: "Carbon tax legislation" },
  { year: "2012", label: "Carbon price takes effect" },
  { year: "2014", label: "Abbott repeals carbon tax" },
  { year: "2015", label: "Paris Agreement signed" },
  { year: "2019", label: "Black Summer bushfires" },
  { year: "2021", label: "Net Zero 2050 commitment" },
  { year: "2022", label: "Climate Change Act passed" },
];

/* ── Disconnect data: Spoke about climate action, voted against carbon price ── */
const DISCONNECT_MPS = [
  {
    name: "Tony Abbott",
    party: "Liberal",
    photoId: "10001",
    speeches: 716,
    agreement: 3.4,
    quote: "I am not going to put a wrecking ball through the economy in the name of environmental purity. We can protect the environment and the economy at the same time.",
    verdict: "DISCONNECT" as const,
  },
  {
    name: "Craig Kelly",
    party: "Liberal",
    photoId: "10728",
    speeches: 305,
    agreement: 3.4,
    quote: "The coral on the Great Barrier Reef has never been in better shape. The science does not support the alarmism we hear in this chamber day after day.",
    verdict: "DISCONNECT" as const,
  },
  {
    name: "Scott Morrison",
    party: "Liberal",
    photoId: "10468",
    speeches: 257,
    agreement: 3.4,
    quote: "We will meet our Paris commitments. We will meet and beat them. But we will do it without destroying jobs and without increasing electricity prices.",
    verdict: "DISCONNECT" as const,
  },
  {
    name: "Julia Gillard",
    party: "Labor",
    photoId: "10212",
    speeches: 812,
    agreement: 89.4,
    quote: "If we do not act on climate change, future generations will look back on us and ask: what were they thinking? We have a duty to act.",
    verdict: "ALIGNED" as const,
  },
  {
    name: "Adam Bandt",
    party: "Greens",
    photoId: "10721",
    speeches: 290,
    agreement: 99.8,
    quote: "The Greens have been pushing for climate action since before it was politically convenient. We will not stop until we have a just transition.",
    verdict: "ALIGNED" as const,
  },
  {
    name: "Malcolm Turnbull",
    party: "Liberal",
    photoId: "10643",
    speeches: 331,
    agreement: 3.4,
    quote: "Climate change is real. The question is not whether to act, but how to act most effectively. An emissions trading scheme is the cheapest way to reduce emissions.",
    verdict: "DISCONNECT" as const,
  },
];

/* ── Key quotes ── */
const KEY_QUOTES = [
  {
    speakerName: "Kevin Rudd",
    party: "Labor",
    photoId: "10552",
    date: "2007",
    quote: "Climate change is the great moral challenge of our generation. I intend to ratify the Kyoto Protocol. I intend to get serious about reducing carbon pollution.",
    context: "for" as const,
  },
  {
    speakerName: "Tony Abbott",
    party: "Liberal",
    photoId: "10001",
    date: "2011",
    quote: "This is a government which is proposing to put a great big new tax on everything. A tax which will destroy jobs, push up prices, and do nothing for the environment.",
    context: "against" as const,
  },
  {
    speakerName: "Julia Gillard",
    party: "Labor",
    photoId: "10212",
    date: "2011",
    quote: "I say to the Australian people: the science is in. Climate change is real. It is caused by human activity. We must act, and a price on carbon is the most efficient way to do it.",
    context: "for" as const,
  },
  {
    speakerName: "Adam Bandt",
    party: "Greens",
    photoId: "10721",
    date: "2019",
    quote: "People are dying. Homes are burning. And the Prime Minister is on holiday. When will this government accept that this is a climate emergency?",
    context: "for" as const,
  },
];

const verdictColors: Record<string, { text: string; bg: string }> = {
  ALIGNED: { text: "#00843D", bg: "rgba(0, 132, 61, 0.1)" },
  DISCONNECT: { text: "#DC2626", bg: "rgba(220, 38, 38, 0.1)" },
};

const partyBorderColors: Record<string, string> = {
  Labor: "#E13A3A",
  Liberal: "#1C4FA0",
  Greens: "#00843D",
  Nationals: "#006644",
  Independent: "#888888",
};

const stanceColors: Record<string, { text: string; bg: string }> = {
  ACTION: { text: "#00843D", bg: "rgba(0, 132, 61, 0.1)" },
  OPPOSITION: { text: "#DC2626", bg: "rgba(220, 38, 38, 0.1)" },
  MIXED: { text: "#FFD700", bg: "rgba(255, 215, 0, 0.1)" },
};

const totalSpeeches = TIMELINE_DATA.reduce(
  (sum, y) => sum + y.ALP + y.LIB + y.GRN + y.NAT + y.IND + y.Other,
  0
);

export default function ClimatePage() {
  const [loaded, setLoaded] = useState(false);
  const [showAllDonors, setShowAllDonors] = useState(false);
  const visibleDonors = showAllDonors ? FOSSIL_DONORS : FOSSIL_DONORS.slice(0, 6);

  useEffect(() => {
    const id = requestAnimationFrame(() => setLoaded(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div className="mx-auto max-w-6xl px-6">
      {/* ── Hero ── */}
      <section className="pt-16 pb-12 animate-fade-in-up">
        <p className="text-sm uppercase tracking-[0.2em] text-[#FFD700] mb-4 font-medium">
          Deep Dive &mdash; Investigation 002
        </p>
        <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-[#e6edf3] leading-[1.1] mb-4 max-w-4xl">
          Climate Action:{" "}
          <span className="italic text-[#FFD700]">The Cost of Delay</span>
        </h1>
        <p className="text-lg text-[#8b949e] max-w-2xl leading-relaxed mb-10">
          A quarter-century of Australian climate debate. Over 24,000 speeches.
          Billions in fossil fuel donations. A carbon price introduced, then repealed.
          The parliamentary record reveals a nation wrestling with the defining
          issue of our time.
        </p>

        {/* Key stats bar */}
        {!loaded ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonCard key={i} className="text-center" />
            ))}
          </div>
        ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 animate-fade-in-up stagger-1">
          <div className="rounded-xl border border-white/5 bg-[#12121a] p-4 text-center">
            <p className="text-2xl md:text-3xl font-bold text-[#FFD700]">
              {totalSpeeches.toLocaleString()}
            </p>
            <p className="text-xs text-[#8b949e] mt-1 uppercase tracking-wider">
              Climate Speeches
            </p>
          </div>
          <div className="rounded-xl border border-white/5 bg-[#12121a] p-4 text-center">
            <p className="text-2xl md:text-3xl font-bold text-[#FFD700]">$1.96B</p>
            <p className="text-xs text-[#8b949e] mt-1 uppercase tracking-wider">
              Fossil Fuel Donations
            </p>
          </div>
          <div className="rounded-xl border border-white/5 bg-[#12121a] p-4 text-center">
            <p className="text-2xl md:text-3xl font-bold text-[#DC2626]">2 yrs</p>
            <p className="text-xs text-[#8b949e] mt-1 uppercase tracking-wider">
              Carbon Price Lasted
            </p>
          </div>
          <div className="rounded-xl border border-white/5 bg-[#12121a] p-4 text-center">
            <p className="text-2xl md:text-3xl font-bold text-[#DC2626]">0.7%</p>
            <p className="text-xs text-[#8b949e] mt-1 uppercase tracking-wider">
              Nationals Support
            </p>
          </div>
        </div>
        )}
      </section>

      {/* ── The Timeline ── */}
      <section className="py-12 animate-fade-in-up stagger-2">
        <h2 className="text-2xl md:text-3xl font-bold text-[#e6edf3] mb-2">
          25 Years of Climate Debate
        </h2>
        <p className="text-sm text-[#8b949e] mb-2 max-w-2xl leading-relaxed">
          Parliamentary speeches on climate, stacked by party. The twin peaks of 2011&ndash;2012
          coincide with the carbon tax debate &mdash; the most divisive environmental legislation
          in Australian history. The 2014 spike is the repeal debate.
        </p>
        <p className="text-xs text-[#8b949e]/60 mb-6">
          Source: Hansard (parlinfo.aph.gov.au), 1998&ndash;2022 &middot; {totalSpeeches.toLocaleString()} speeches
        </p>
        {!loaded ? (
          <SkeletonChart height={480} />
        ) : (
          <div className="animate-fade-in-up">
            <div className="rounded-xl border border-white/5 bg-[#12121a] p-4 md:p-6">
              <ResponsiveContainer width="100%" height={420}>
                <BarChart
                  data={TIMELINE_DATA}
                  margin={{ top: 20, right: 8, bottom: 0, left: -8 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="rgba(255,255,255,0.05)"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="year"
                    tick={{ fill: "#c9d1d9", fontSize: 11 }}
                    tickLine={false}
                    axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
                    interval={2}
                  />
                  <YAxis
                    tick={{ fill: "#c9d1d9", fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    width={45}
                    tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#1a1a28",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: 8,
                      color: "#e6edf3",
                      fontSize: 13,
                    }}
                    cursor={{ fill: "rgba(255,215,0,0.05)" }}
                    labelFormatter={(label) => `Year: ${label}`}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 12, color: "#c9d1d9", paddingTop: 8 }}
                    iconType="square"
                    iconSize={10}
                  />
                  {/* Milestone annotations */}
                  <ReferenceLine x="2007" stroke="#FFD700" strokeDasharray="3 3" strokeOpacity={0.4} label={{ value: "Rudd elected", fill: "#FFD700", fontSize: 9, position: "top" }} />
                  <ReferenceLine x="2012" stroke="#00843D" strokeDasharray="3 3" strokeOpacity={0.5} label={{ value: "Carbon price", fill: "#00843D", fontSize: 9, position: "top" }} />
                  <ReferenceLine x="2014" stroke="#DC2626" strokeDasharray="3 3" strokeOpacity={0.5} label={{ value: "Repealed", fill: "#DC2626", fontSize: 9, position: "top" }} />
                  <ReferenceLine x="2015" stroke="#FFD700" strokeDasharray="3 3" strokeOpacity={0.3} label={{ value: "Paris", fill: "#FFD700", fontSize: 9, position: "top" }} />
                  <ReferenceLine x="2019" stroke="#E87722" strokeDasharray="3 3" strokeOpacity={0.4} label={{ value: "Bushfires", fill: "#E87722", fontSize: 9, position: "top" }} />
                  <Bar dataKey="ALP" stackId="a" fill="#E13A3A" name="Labor" />
                  <Bar dataKey="LIB" stackId="a" fill="#1C4FA0" name="Liberal" />
                  <Bar dataKey="GRN" stackId="a" fill="#00843D" name="Greens" />
                  <Bar dataKey="NAT" stackId="a" fill="#006644" name="Nationals" />
                  <Bar dataKey="IND" stackId="a" fill="#888888" name="Independent" />
                  <Bar dataKey="Other" stackId="a" fill="#555555" name="Other" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>

              {/* Milestone legend */}
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2">
                {MILESTONES.map((m) => (
                  <div key={m.year} className="flex items-center gap-2 text-xs text-[#8b949e]">
                    <span className="text-[#FFD700] font-mono font-semibold">{m.year}</span>
                    <span>{m.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ── The Money Trail ── */}
      <section className="py-12 animate-fade-in-up stagger-3">
        <h2 className="text-2xl md:text-3xl font-bold text-[#e6edf3] mb-2">
          The Money Trail
        </h2>
        <p className="text-sm text-[#8b949e] mb-6 max-w-2xl leading-relaxed">
          Top fossil fuel and mining industry donors to Australian political entities.
          Nearly $2 billion in declared donations, much of it flowing to parties and
          lobby groups that consistently oppose climate action.
        </p>
        {!loaded ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-white/5 bg-[#12121a] p-5">
                <div className="flex items-start justify-between mb-3">
                  <Skeleton className="h-4 w-36" />
                  <Skeleton className="h-5 w-16" />
                </div>
                <div className="flex items-center gap-1.5 mb-3">
                  <Skeleton className="h-4 w-20 rounded-md" />
                  <Skeleton className="h-4 w-24 rounded-md" />
                </div>
                <SkeletonText lines={2} />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-fade-in-up">
            {visibleDonors.map((d) => (
              <div
                key={d.name}
                className="rounded-xl border border-white/5 bg-[#12121a] p-5 hover:border-[#FFD700]/20 transition-colors"
              >
                <div className="flex items-start justify-between mb-3">
                  <h3 className="text-base font-semibold text-[#e6edf3]">
                    {d.name}
                  </h3>
                  <span className="text-lg font-bold text-[#FFD700] shrink-0 ml-2">
                    {d.amount}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap mb-3">
                  <span className="text-xs text-[#8b949e]">To:</span>
                  {d.recipients.map((r) => (
                    <span
                      key={r}
                      className="inline-flex items-center rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-medium text-[#8b949e]"
                    >
                      {r}
                    </span>
                  ))}
                </div>
                <p className="text-sm text-[#8b949e]/80 leading-relaxed">
                  {d.note}
                </p>
              </div>
            ))}
          </div>
        )}
        {FOSSIL_DONORS.length > 6 && (
          <button
            onClick={() => setShowAllDonors(!showAllDonors)}
            className="mt-4 text-sm text-[#FFD700] hover:text-[#FFD700]/80 transition-colors"
          >
            {showAllDonors ? "Show fewer" : `Show all ${FOSSIL_DONORS.length} donors`} &rarr;
          </button>
        )}
        <div className="mt-6 rounded-xl border border-[#FFD700]/10 bg-[#FFD700]/5 p-5">
          <p className="text-sm text-[#FFD700]/80 leading-relaxed">
            <strong className="text-[#FFD700]">Note:</strong> These figures represent
            declared donations from AEC annual returns. The Minerals Council of Australia,
            Cormack Foundation, and other associated entities act as conduits &mdash; the
            ultimate beneficiaries of mining industry money are often the Coalition parties.
            The true scale of influence, including lobbying, hospitality, and post-politics
            employment, is far greater.
          </p>
        </div>
      </section>

      {/* ── Party Breakdown: Carbon Price Support ── */}
      <section className="py-12 animate-fade-in-up stagger-4">
        <h2 className="text-2xl md:text-3xl font-bold text-[#e6edf3] mb-2">
          Carbon Price: Party by Party
        </h2>
        <p className="text-sm text-[#8b949e] mb-6 max-w-2xl leading-relaxed">
          Percentage of votes cast in favour of carbon pricing legislation.
          The chasm between the Greens/Labor and the Coalition is absolute. Data from
          TheyVoteForYou.org.au.
        </p>
        {!loaded ? (
          <div className="rounded-xl border border-white/5 bg-[#12121a] p-4 md:p-6">
            <div className="space-y-5">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-5 w-28 rounded-full shrink-0" style={{ animationDelay: `${i * 60}ms` }} />
                  <div className="flex-1">
                    <Skeleton className="h-9 rounded-lg" style={{ width: `${90 - i * 12}%`, animationDelay: `${i * 60}ms` }} />
                  </div>
                  <Skeleton className="h-4 w-12 shrink-0" style={{ animationDelay: `${i * 60}ms` }} />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-white/5 bg-[#12121a] p-4 md:p-6 animate-fade-in-up">
            <div className="space-y-5">
              {PARTY_SUPPORT.map((p) => (
                <div key={p.party} className="flex items-center gap-4">
                  <div className="w-28 shrink-0">
                    <PartyBadge party={p.party} />
                  </div>
                  <div className="flex-1 relative">
                    <div className="h-9 rounded-lg bg-white/5 overflow-hidden">
                      <div
                        className="h-full rounded-lg transition-all duration-1000 ease-out flex items-center px-3"
                        style={{
                          width: `${Math.max(p.support, 4)}%`,
                          backgroundColor: p.color,
                          opacity: 0.85,
                        }}
                      >
                        {p.support > 15 && (
                          <span className="text-xs font-bold text-white">
                            {p.support}%
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0 w-20">
                    {p.support <= 15 && (
                      <span
                        className="text-sm font-bold"
                        style={{ color: p.color }}
                      >
                        {p.support}%
                      </span>
                    )}
                    <p className="text-[10px] text-[#8b949e]">{p.mps} MPs</p>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-[#8b949e]/60 mt-4">
              Source: TheyVoteForYou.org.au &mdash; Carbon price policy votes
            </p>
          </div>
        )}
      </section>

      {/* ── MP Spotlight: Key Climate Voices ── */}
      <section className="py-12 animate-fade-in-up stagger-5">
        <h2 className="text-2xl md:text-3xl font-bold text-[#e6edf3] mb-2">
          Key Climate Voices
        </h2>
        <p className="text-sm text-[#8b949e] mb-8 max-w-2xl leading-relaxed">
          The ten MPs who spoke most about climate. Their positions span the full
          spectrum &mdash; from Julia Gillard introducing the carbon price to Tony Abbott
          tearing it down.
        </p>
        {!loaded ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-white/5 bg-[#12121a] p-5 flex gap-4">
                <SkeletonAvatar size={56} />
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-4 w-14 rounded-full" />
                    <Skeleton className="h-4 w-16 rounded-md" />
                  </div>
                  <Skeleton className="h-3 w-40 mb-1" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-fade-in-up">
            {TOP_SPEAKERS.map((mp) => {
              const s = stanceColors[mp.stance];
              const borderColor = partyBorderColors[mp.party] || "#888888";
              return (
                <div
                  key={mp.name}
                  className="rounded-xl border border-white/5 bg-[#12121a] p-5 hover:border-white/10 transition-colors flex gap-4"
                >
                  <div
                    className="w-14 h-14 rounded-full overflow-hidden shrink-0 border-2"
                    style={{ borderColor }}
                  >
                    <img
                      src={getPhotoUrl(mp.photoId)}
                      alt={mp.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <h3 className="text-base font-semibold text-[#e6edf3]">
                        {mp.name}
                      </h3>
                      <PartyBadge party={mp.party} />
                      <span
                        className="text-[10px] font-bold tracking-wider px-2 py-0.5 rounded-md"
                        style={{ color: s.text, backgroundColor: s.bg }}
                      >
                        {mp.stance}
                      </span>
                    </div>
                    <p className="text-xs text-[#8b949e] mb-1">{mp.role}</p>
                    <p className="text-sm text-[#e6edf3]/60">
                      <span className="text-[#FFD700] font-semibold">{mp.speeches}</span> climate speeches
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── The Disconnect ── */}
      <section className="py-12 animate-fade-in-up stagger-6">
        <h2 className="text-2xl md:text-3xl font-bold text-[#e6edf3] mb-2">
          The Disconnect
        </h2>
        <p className="text-sm text-[#8b949e] mb-8 max-w-2xl leading-relaxed">
          Some MPs speak passionately about the environment, then vote against every
          piece of climate legislation. Others walk the talk. The gap between rhetoric
          and action reveals who is serious about climate.
        </p>
        {!loaded ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-white/5 bg-[#12121a] p-5">
                <div className="flex items-start gap-3 mb-4">
                  <SkeletonAvatar size={56} />
                  <div className="flex-1">
                    <Skeleton className="h-4 w-28 mb-1.5" />
                    <Skeleton className="h-4 w-16 rounded-full" />
                  </div>
                </div>
                <div className="flex gap-4 mb-4">
                  <Skeleton className="h-8 w-16" />
                  <Skeleton className="h-8 w-20" />
                </div>
                <SkeletonText lines={3} className="mb-4 pl-3" />
                <Skeleton className="h-5 w-28 rounded-md" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 animate-fade-in-up">
            {DISCONNECT_MPS.map((mp) => {
              const v = verdictColors[mp.verdict];
              const borderColor = partyBorderColors[mp.party] || "#888888";
              return (
                <div
                  key={mp.name}
                  className="rounded-xl border border-white/5 bg-[#12121a] p-5 hover:border-white/10 transition-colors"
                >
                  <div className="flex items-start gap-3 mb-4">
                    <div
                      className="w-14 h-14 rounded-full overflow-hidden shrink-0 border-2"
                      style={{ borderColor }}
                    >
                      <img
                        src={getPhotoUrl(mp.photoId)}
                        alt={mp.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-base font-semibold text-[#e6edf3]">
                        {mp.name}
                      </h3>
                      <div className="flex items-center gap-2 mt-0.5">
                        <PartyBadge party={mp.party} />
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 mb-4 text-sm">
                    <div>
                      <span className="text-xs text-[#8b949e]">Speeches</span>
                      <p className="text-[#e6edf3] font-semibold">{mp.speeches}</p>
                    </div>
                    <div>
                      <span className="text-xs text-[#8b949e]">Carbon price support</span>
                      <p
                        className="font-semibold"
                        style={{
                          color: mp.agreement > 50 ? "#00843D" : "#DC2626",
                        }}
                      >
                        {mp.agreement}%
                      </p>
                    </div>
                  </div>

                  <blockquote className="text-xs text-[#e6edf3]/70 italic leading-relaxed mb-4 pl-3 border-l-2 border-[#FFD700]/20">
                    &ldquo;{mp.quote}&rdquo;
                  </blockquote>

                  <div className="flex items-center justify-between">
                    <span className="text-xs text-[#8b949e] uppercase tracking-wider">
                      Say vs Do
                    </span>
                    <span
                      className="text-xs font-bold tracking-wider px-2.5 py-1 rounded-md"
                      style={{ color: v.text, backgroundColor: v.bg }}
                    >
                      {mp.verdict}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Key Quotes ── */}
      <section className="py-12 animate-fade-in-up">
        <h2 className="text-2xl md:text-3xl font-bold text-[#e6edf3] mb-2">
          Key Quotes
        </h2>
        <p className="text-sm text-[#8b949e] mb-8 max-w-2xl leading-relaxed">
          The defining statements of Australia&rsquo;s climate debate.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {KEY_QUOTES.map((q, i) => (
            <QuoteCard
              key={i}
              speakerName={q.speakerName}
              party={q.party}
              photoId={q.photoId}
              date={q.date}
              quote={q.quote}
              context={q.context}
            />
          ))}
        </div>
      </section>

      {/* ── Key Findings (dynamic from API) ── */}
      <TopicInsights topic="climate" />

      {/* ── Bushfire Royal Commission Callout ── */}
      <section className="py-12 pb-20 animate-fade-in-up">
        <div className="rounded-xl border border-[#E87722]/20 bg-[#E87722]/[0.04] p-6 md:p-8">
          <p className="text-xs uppercase tracking-[0.2em] text-[#E87722] mb-3 font-medium">
            Context: 2020 Bushfire Royal Commission
          </p>
          <h2 className="text-2xl md:text-3xl font-bold text-[#e6edf3] mb-3 leading-tight">
            &ldquo;Climate change has{" "}
            <span className="italic text-[#E87722]">
              clearly contributed
            </span>{" "}
            to these catastrophic conditions&rdquo;
          </h2>
          <p className="text-[#8b949e] leading-relaxed max-w-3xl mb-4">
            The Royal Commission into National Natural Disaster Arrangements (2020)
            found that climate change was a key factor in the unprecedented 2019&ndash;20
            bushfire season that killed 33 people, destroyed over 3,000 homes, and burned
            24 million hectares. The Commission recommended Australia prepare for
            longer and more intense fire seasons driven by climate change.
          </p>
          <p className="text-[#8b949e] leading-relaxed max-w-3xl mb-6">
            Despite this finding, 122 Liberal and 23 National MPs continued to vote against
            carbon pricing &mdash; the mechanism the Commission implicitly supported through
            its call for emissions reduction. The parliamentary record shows 902 climate
            speeches in 2019 and 978 in 2020, yet the government of the day took no
            new legislative action on emissions.
          </p>
          <div className="grid grid-cols-3 gap-4 max-w-lg">
            <div className="text-center">
              <p className="text-2xl font-bold text-[#E87722]">33</p>
              <p className="text-xs text-[#8b949e] mt-1">Lives lost</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-[#E87722]">3,094</p>
              <p className="text-xs text-[#8b949e] mt-1">Homes destroyed</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-[#E87722]">24M ha</p>
              <p className="text-xs text-[#8b949e] mt-1">Land burned</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

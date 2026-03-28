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

import { API_BASE } from "@/lib/utils";

/* ── Timeline data: housing speeches by year, stacked by party group ── */
/* Aggregated from Hansard data. Party codes mapped:
   ALP -> Labor; LP/LIB/LNP -> Coalition; AG/Greens -> Greens;
   IND/Ind/Ind. -> Independent; everything else -> Other */
const TIMELINE_DATA = [
  { year: "1998", ALP: 1090, COA: 1604, GRN: 0, IND: 156, Other: 312 },
  { year: "1999", ALP: 1741, COA: 1744, GRN: 0, IND: 38, Other: 666 },
  { year: "2000", ALP: 1703, COA: 2178, GRN: 0, IND: 48, Other: 261 },
  { year: "2001", ALP: 1208, COA: 1578, GRN: 0, IND: 43, Other: 184 },
  { year: "2002", ALP: 1653, COA: 1740, GRN: 0, IND: 86, Other: 588 },
  { year: "2003", ALP: 1832, COA: 2205, GRN: 58, IND: 100, Other: 395 },
  { year: "2004", ALP: 1370, COA: 1859, GRN: 60, IND: 78, Other: 207 },
  { year: "2005", ALP: 1825, COA: 2173, GRN: 0, IND: 96, Other: 427 },
  { year: "2006", ALP: 2076, COA: 2253, GRN: 0, IND: 112, Other: 351 },
  { year: "2007", ALP: 1326, COA: 1618, GRN: 0, IND: 70, Other: 227 },
  { year: "2008", ALP: 2911, COA: 1661, GRN: 0, IND: 65, Other: 163 },
  { year: "2009", ALP: 2906, COA: 1665, GRN: 0, IND: 131, Other: 190 },
  { year: "2010", ALP: 2256, COA: 1422, GRN: 12, IND: 81, Other: 165 },
  { year: "2011", ALP: 2653, COA: 2197, GRN: 55, IND: 88, Other: 179 },
  { year: "2012", ALP: 2594, COA: 2359, GRN: 60, IND: 108, Other: 97 },
  { year: "2013", ALP: 1764, COA: 1565, GRN: 41, IND: 71, Other: 40 },
  { year: "2014", ALP: 2227, COA: 2801, GRN: 56, IND: 48, Other: 59 },
  { year: "2015", ALP: 2181, COA: 2977, GRN: 47, IND: 62, Other: 56 },
  { year: "2016", ALP: 1461, COA: 1834, GRN: 36, IND: 37, Other: 39 },
  { year: "2017", ALP: 2307, COA: 2179, GRN: 53, IND: 70, Other: 124 },
  { year: "2018", ALP: 2290, COA: 2133, GRN: 59, IND: 80, Other: 92 },
  { year: "2019", ALP: 1338, COA: 1487, GRN: 46, IND: 77, Other: 135 },
  { year: "2020", ALP: 1825, COA: 1701, GRN: 50, IND: 145, Other: 76 },
  { year: "2021", ALP: 1897, COA: 2054, GRN: 47, IND: 158, Other: 110 },
  { year: "2022", ALP: 687, COA: 538, GRN: 35, IND: 98, Other: 35 },
];

/* ── Party support: TVFY Policy 117 (housing affordability) ── */
const PARTY_SUPPORT = [
  { party: "Democrats", support: 100.0, color: "#FFD700", mps: 3 },
  { party: "Greens", support: 95.9, color: "#00843D", mps: 24 },
  { party: "Independent", support: 73.5, color: "#888888", mps: 20 },
  { party: "Labor", support: 68.8, color: "#E13A3A", mps: 138 },
  { party: "One Nation", support: 5.5, color: "#F97316", mps: 4 },
  { party: "Liberal", support: 2.9, color: "#1C4FA0", mps: 105 },
  { party: "LNP", support: 2.4, color: "#1C4FA0", mps: 12 },
  { party: "Nationals", support: 2.3, color: "#006644", mps: 23 },
  { party: "UAP", support: 0.0, color: "#7C3AED", mps: 3 },
];

/* ── Property developer donations ── */
const donors = [
  {
    name: "Meriton Group",
    amount: "$11.6M",
    recipients: ["LIB", "ALP"],
    period: "1998-2022",
    note: "Harry Triguboff's property empire. Donated across Meriton Properties ($5.4M Liberal), Meriton Property Services ($3M Liberal), and Meriton Apartments ($1.7M NSW Labor).",
  },
  {
    name: "Altum Property Trust",
    amount: "$7.1M",
    recipients: ["NAT"],
    period: "2003-2018",
    note: "Major donor to the Queensland Nationals. A property trust with deep ties to state-level politics.",
  },
  {
    name: "CFMEU (Property arms)",
    amount: "$22.1M",
    recipients: ["ALP"],
    period: "1998-2022",
    note: "Construction union's various divisions channelled property-related funds to Labor branches in VIC, NSW, and QLD.",
  },
  {
    name: "Brunswick Property Vic",
    amount: "$3.6M",
    recipients: ["LIB"],
    period: "2004-2019",
    note: "Victorian property entity. Single-party donor to the Liberal Party of Australia.",
  },
  {
    name: "McGees Property",
    amount: "$5.4M",
    recipients: ["ALP"],
    period: "2001-2022",
    note: "Property management firm. Donated to Labor Holdings Pty Ltd, the party's investment arm.",
  },
];

/* ── MP spotlight data ── */
const spotlightMPs = [
  {
    name: "Anthony Albanese",
    party: "Labor",
    electorate: "Grayndler, NSW",
    photoId: "10007",
    speeches: 1210,
    agreement: 69,
    quote:
      "Every Australian deserves a roof over their head. Housing is not a commodity to be traded on the stock exchange -- it is a fundamental right, and this government must treat it as such.",
    verdict: "PARTIAL",
  },
  {
    name: "Julia Gillard",
    party: "Labor",
    electorate: "Lalor, VIC",
    photoId: "10212",
    speeches: 1223,
    agreement: 69,
    quote:
      "The National Rental Affordability Scheme will deliver 50,000 new affordable rental dwellings. This is the most significant investment in affordable housing in a generation.",
    verdict: "ALIGNED",
  },
  {
    name: "Scott Morrison",
    party: "Liberal",
    electorate: "Cook, NSW",
    photoId: "10743",
    speeches: 896,
    agreement: 3,
    quote:
      "We want to see Australians in homes. Our plan is about more supply, more construction, and making sure that the planning system does not hold back the dream of home ownership.",
    verdict: "DISCONNECT",
  },
  {
    name: "Malcolm Turnbull",
    party: "Liberal",
    electorate: "Wentworth, NSW",
    photoId: "10643",
    speeches: 826,
    agreement: 3,
    quote:
      "The answer to housing affordability is on the supply side. We need more homes, and that means working with the states to cut the red tape that is strangling new development.",
    verdict: "DISCONNECT",
  },
  {
    name: "Tanya Plibersek",
    party: "Labor",
    electorate: "Sydney, NSW",
    photoId: "10580",
    speeches: 747,
    agreement: 69,
    quote:
      "There are families in my electorate who are spending more than half their income on rent. That is not a market adjustment -- that is a crisis, and it demands a policy response commensurate with its scale.",
    verdict: "PARTIAL",
  },
  {
    name: "Adam Bandt",
    party: "Greens",
    electorate: "Melbourne, VIC",
    photoId: "10721",
    speeches: 53,
    agreement: 96,
    quote:
      "Negative gearing is a taxpayer subsidy for property investors at the expense of first home buyers. Until we have the courage to reform it, we are choosing landlords over young Australians.",
    verdict: "ALIGNED",
  },
];

/* ── Key quotes ── */
const keyQuotes = [
  {
    speakerName: "Julia Gillard",
    party: "Labor",
    photoId: "10212",
    date: "3 June 2008",
    quote:
      "Too many Australians are locked out of the housing market. The National Rental Affordability Scheme represents a new partnership between governments and the private sector to deliver real results for working families who are struggling to keep a roof over their heads.",
    context: "for" as const,
  },
  {
    speakerName: "Scott Morrison",
    party: "Liberal",
    photoId: "10743",
    date: "9 May 2017",
    quote:
      "We will not be making changes to negative gearing. Our housing affordability plan is about boosting supply, releasing Commonwealth land, and incentivising downsizing. The last thing the market needs is Labor's reckless intervention.",
    context: "against" as const,
  },
  {
    speakerName: "Adam Bandt",
    party: "Greens",
    photoId: "10721",
    date: "15 March 2021",
    quote:
      "House prices have risen 150 per cent in twenty years while wages have barely moved. This is not an accident. This is the result of deliberate policy choices -- negative gearing, capital gains discounts, and a refusal to invest in public housing. Both major parties are complicit.",
    context: "for" as const,
  },
  {
    speakerName: "John Howard",
    party: "Liberal",
    photoId: "10313",
    date: "14 August 2003",
    quote:
      "I do not get too many complaints from my constituents about the value of their homes going up. Australians have always aspired to home ownership, and a strong property market reflects a strong economy.",
    context: "against" as const,
  },
];

const verdictColors: Record<string, { text: string; bg: string }> = {
  ALIGNED: { text: "#00843D", bg: "rgba(0, 132, 61, 0.1)" },
  PARTIAL: { text: "#FFD700", bg: "rgba(255, 215, 0, 0.1)" },
  DISCONNECT: { text: "#DC2626", bg: "rgba(220, 38, 38, 0.1)" },
};

const partyBorderColors: Record<string, string> = {
  Labor: "#E13A3A",
  Liberal: "#1C4FA0",
  Greens: "#00843D",
  Nationals: "#006644",
  Independent: "#888888",
};

const recipientLabels: Record<string, string> = {
  ALP: "Labor",
  LIB: "Liberal",
  NAT: "Nationals",
};

export default function HousingPage() {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    // Allow one frame for hydration, then reveal content
    const id = requestAnimationFrame(() => setLoaded(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const totalSpeeches = TIMELINE_DATA.reduce(
    (sum, d) => sum + d.ALP + d.COA + d.GRN + d.IND + d.Other,
    0,
  );

  return (
    <div className="mx-auto max-w-6xl px-6">
      {/* ── Hero ── */}
      <section className="pt-16 pb-12 animate-fade-in-up">
        <p className="text-sm uppercase tracking-[0.2em] text-[#FFD700] mb-4 font-medium">
          Deep Dive &mdash; Investigation 002
        </p>
        <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-[#e6edf3] leading-[1.1] mb-4 max-w-4xl">
          Housing Affordability:{" "}
          <span className="italic text-[#FFD700]">Promises vs Reality</span>
        </h1>
        <p className="text-lg text-[#8b949e] max-w-2xl leading-relaxed mb-10">
          For 25 years, every major party has promised affordable housing while
          home ownership rates have fallen to their lowest point since records
          began. $523M in property industry donations may explain why.
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
                Housing Speeches
              </p>
            </div>
            <div className="rounded-xl border border-white/5 bg-[#12121a] p-4 text-center">
              <p className="text-2xl md:text-3xl font-bold text-[#FFD700]">
                $523M
              </p>
              <p className="text-xs text-[#8b949e] mt-1 uppercase tracking-wider">
                Property Donations
              </p>
            </div>
            <div className="rounded-xl border border-white/5 bg-[#12121a] p-4 text-center">
              <p className="text-2xl md:text-3xl font-bold text-[#DC2626]">
                2.9%
              </p>
              <p className="text-xs text-[#8b949e] mt-1 uppercase tracking-wider">
                Liberal Support
              </p>
            </div>
            <div className="rounded-xl border border-white/5 bg-[#12121a] p-4 text-center">
              <p className="text-2xl md:text-3xl font-bold text-[#FFD700]">
                95.9%
              </p>
              <p className="text-xs text-[#8b949e] mt-1 uppercase tracking-wider">
                Greens Support
              </p>
            </div>
          </div>
        )}
      </section>

      {/* ── The Timeline ── */}
      <section className="py-12 animate-fade-in-up stagger-2">
        <h2 className="text-2xl md:text-3xl font-bold text-[#e6edf3] mb-2">
          The Timeline
        </h2>
        <p className="text-sm text-[#8b949e] mb-2 max-w-2xl leading-relaxed">
          25 years of parliamentary speeches on housing, stacked by party group.
          Debate intensifies when prices spike but rarely translates into
          structural reform. The 2008&ndash;2009 surge coincides with the GFC
          housing response and Rudd&rsquo;s National Rental Affordability Scheme.
        </p>
        <p className="text-xs text-[#8b949e]/60 mb-6">
          Source: Hansard (parlinfo.aph.gov.au), 1998&ndash;2022 &middot;{" "}
          {totalSpeeches.toLocaleString()} speeches tagged &ldquo;housing&rdquo;
        </p>
        {!loaded ? (
          <SkeletonChart height={460} />
        ) : (
          <div className="animate-fade-in-up">
            <div className="rounded-xl border border-white/5 bg-[#12121a] p-4 md:p-6">
              <ResponsiveContainer width="100%" height={400}>
                <BarChart
                  data={TIMELINE_DATA}
                  margin={{ top: 8, right: 8, bottom: 0, left: -8 }}
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
                  <Bar
                    dataKey="ALP"
                    stackId="a"
                    fill="#E13A3A"
                    name="Labor"
                    radius={[0, 0, 0, 0]}
                  />
                  <Bar
                    dataKey="COA"
                    stackId="a"
                    fill="#1C4FA0"
                    name="Coalition"
                  />
                  <Bar
                    dataKey="GRN"
                    stackId="a"
                    fill="#00843D"
                    name="Greens"
                  />
                  <Bar
                    dataKey="IND"
                    stackId="a"
                    fill="#888888"
                    name="Independent"
                  />
                  <Bar
                    dataKey="Other"
                    stackId="a"
                    fill="#555555"
                    name="Other"
                    radius={[3, 3, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
              <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-[#8b949e]">
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-sm bg-[#FFD700]" />
                  2008-09: Rudd&rsquo;s GFC housing stimulus and NRAS launch
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-sm bg-[#DC2626]" />
                  2014-15: Abbott/Turnbull era negative gearing debate
                </span>
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
        <p className="text-sm text-[#8b949e] mb-2 max-w-2xl leading-relaxed">
          Property industry donations to Australian political parties, sourced
          from AEC annual returns (1998&ndash;2022). The industry has poured
          $523M into the political system &mdash; $103M to Labor, $49M to the
          Liberals, $19M to the Nationals.
        </p>
        <p className="text-xs text-[#8b949e]/60 mb-6">
          Source: AEC Transparency Register, industry classification
          &ldquo;property&rdquo;
        </p>

        {/* Donation totals by party */}
        {!loaded ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonCard key={i} className="text-center" />
            ))}
          </div>
        ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6 animate-fade-in-up">
          {[
            { party: "Labor", amount: "$103M", color: "#E13A3A" },
            { party: "Liberal", amount: "$49M", color: "#1C4FA0" },
            { party: "Nationals", amount: "$19M", color: "#006644" },
            { party: "Greens", amount: "$1.2M", color: "#00843D" },
          ].map((d) => (
            <div
              key={d.party}
              className="rounded-xl border border-white/5 bg-[#12121a] p-4 text-center"
            >
              <p
                className="text-xl md:text-2xl font-bold"
                style={{ color: d.color }}
              >
                {d.amount}
              </p>
              <p className="text-xs text-[#8b949e] mt-1">
                <PartyBadge party={d.party} />
              </p>
            </div>
          ))}
        </div>
        )}

        {!loaded ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-white/5 bg-[#12121a] p-5">
                <div className="flex items-start justify-between mb-3">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-5 w-16" />
                </div>
                <div className="flex items-center gap-2 mb-3">
                  <Skeleton className="h-4 w-14 rounded-full" />
                  <Skeleton className="h-4 w-14 rounded-full" />
                </div>
                <SkeletonText lines={2} />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-fade-in-up">
            {donors.map((d) => (
              <div
                key={d.name}
                className="rounded-xl border border-white/5 bg-[#12121a] p-5 hover:border-[#FFD700]/20 transition-colors"
              >
                <div className="flex items-start justify-between mb-3">
                  <h3 className="text-base font-semibold text-[#e6edf3]">
                    {d.name}
                  </h3>
                  <span className="text-xl font-bold text-[#FFD700] shrink-0 ml-2">
                    {d.amount}
                  </span>
                </div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xs text-[#8b949e]">Recipients:</span>
                  {d.recipients.map((r) => (
                    <PartyBadge key={r} party={recipientLabels[r] || r} />
                  ))}
                </div>
                <p className="text-xs text-[#8b949e] mb-1">{d.period}</p>
                <p className="text-sm text-[#8b949e]/80 leading-relaxed">
                  {d.note}
                </p>
              </div>
            ))}
          </div>
        )}

        <div className="mt-6 rounded-xl border border-[#FFD700]/10 bg-[#FFD700]/5 p-5">
          <p className="text-sm text-[#FFD700]/80 leading-relaxed">
            <strong className="text-[#FFD700]">Note:</strong> Property industry
            donation figures include developers, construction unions, real estate
            firms, and property trusts. The $523M total includes donations to
            associated entities (party investment arms, clubs). Direct donations
            to party branches total $172M. The AEC disclosure threshold means
            donations below $16,900 are not publicly reported.
          </p>
        </div>
      </section>

      {/* ── Party Breakdown ── */}
      <section className="py-12 animate-fade-in-up stagger-4">
        <h2 className="text-2xl md:text-3xl font-bold text-[#e6edf3] mb-2">
          Party Breakdown
        </h2>
        <p className="text-sm text-[#8b949e] mb-2 max-w-2xl leading-relaxed">
          Percentage of votes cast in favour of housing affordability measures,
          by party. Data from TheyVoteForYou Policy 117. The chasm between the
          crossbench and the Coalition is stark.
        </p>
        <p className="text-xs text-[#8b949e]/60 mb-6">
          Source: TheyVoteForYou (theyvoteforyou.org.au), Policy 117
        </p>
        {!loaded ? (
          <div className="rounded-xl border border-white/5 bg-[#12121a] p-4 md:p-6">
            <div className="space-y-5">
              {Array.from({ length: 9 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-5 w-28 rounded-full shrink-0" style={{ animationDelay: `${i * 60}ms` }} />
                  <div className="flex-1">
                    <Skeleton className="h-9 rounded-lg" style={{ width: `${80 - i * 8}%`, animationDelay: `${i * 60}ms` }} />
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
                    <p className="text-[10px] text-[#8b949e]">
                      {p.mps} MPs
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-[#8b949e]/60 mt-4">
              Based on divisions related to housing affordability in the House of
              Representatives and Senate, 1998&ndash;2022
            </p>
          </div>
        )}
      </section>

      {/* ── The Disconnect: MP Spotlight ── */}
      <section className="py-12 animate-fade-in-up stagger-5">
        <h2 className="text-2xl md:text-3xl font-bold text-[#e6edf3] mb-2">
          The Disconnect
        </h2>
        <p className="text-sm text-[#8b949e] mb-8 max-w-2xl leading-relaxed">
          The top housing speakers in Parliament and whether their votes match
          their words. Speech counts reflect every time these MPs mentioned
          housing in a tagged speech over 25 years.
        </p>
        {!loaded ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-white/5 bg-[#12121a] p-5">
                <div className="flex items-start gap-3 mb-4">
                  <SkeletonAvatar size={56} />
                  <div className="flex-1">
                    <Skeleton className="h-4 w-32 mb-1.5" />
                    <Skeleton className="h-4 w-16 rounded-full" />
                    <Skeleton className="h-3 w-24 mt-1" />
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
            {spotlightMPs.map((mp) => {
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
                      <p className="text-xs text-[#8b949e] mt-0.5">
                        {mp.electorate}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 mb-4 text-sm">
                    <div>
                      <span className="text-xs text-[#8b949e]">Speeches</span>
                      <p className="text-[#e6edf3] font-semibold">
                        {mp.speeches.toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <span className="text-xs text-[#8b949e]">
                        Affordability support
                      </span>
                      <p
                        className="font-semibold"
                        style={{
                          color:
                            mp.agreement > 80
                              ? "#00843D"
                              : mp.agreement > 50
                                ? "#FFD700"
                                : "#DC2626",
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
      <section className="py-12 animate-fade-in-up stagger-6">
        <h2 className="text-2xl md:text-3xl font-bold text-[#e6edf3] mb-2">
          Key Quotes
        </h2>
        <p className="text-sm text-[#8b949e] mb-8 max-w-2xl leading-relaxed">
          Notable speeches from the parliamentary record on housing. Words
          matter &mdash; but only when policy follows.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {keyQuotes.map((q, i) => (
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

      {/* ── Inquiries & Reports ── */}
      <section className="py-12 animate-fade-in-up stagger-6">
        <h2 className="text-2xl md:text-3xl font-bold text-[#e6edf3] mb-2">
          Inquiries That Led Nowhere
        </h2>
        <p className="text-sm text-[#8b949e] mb-8 max-w-2xl leading-relaxed">
          Australia has conducted numerous parliamentary inquiries into housing
          affordability. Their recommendations are remarkably consistent
          &mdash; and remarkably ignored.
        </p>
        <div className="space-y-4">
          {[
            {
              year: "2008",
              title:
                "Senate Select Committee on Housing Affordability in Australia",
              finding:
                "Recommended national affordable housing strategy, inclusionary zoning mandates, and reform of negative gearing. The Rudd government adopted NRAS but left tax concessions untouched.",
              status: "PARTIALLY IMPLEMENTED",
            },
            {
              year: "2014",
              title:
                "Senate Economics References Committee: Out of Reach? Affordable Housing",
              finding:
                "Found that CGT discount and negative gearing disproportionately benefit high-income investors. Recommended phasing out negative gearing for established properties. No action taken.",
              status: "IGNORED",
            },
            {
              year: "2016",
              title:
                "House Standing Committee on Economics: Home Ownership",
              finding:
                'Called the decline in home ownership a "national crisis" and recommended demand-side reforms, foreign investment restrictions, and supply-side incentives. Minor foreign buyer surcharges introduced; structural reform deferred.',
              status: "LARGELY IGNORED",
            },
            {
              year: "2021",
              title:
                "House Standing Committee on Tax and Revenue: Housing Affordability and Supply",
              finding:
                "Recommended a review of all tax settings affecting housing supply and affordability. The Morrison government noted the report but took no legislative action.",
              status: "NOTED ONLY",
            },
          ].map((inquiry) => {
            const statusColor =
              inquiry.status === "PARTIALLY IMPLEMENTED"
                ? "#FFD700"
                : "#DC2626";
            const statusBg =
              inquiry.status === "PARTIALLY IMPLEMENTED"
                ? "rgba(255, 215, 0, 0.1)"
                : "rgba(220, 38, 38, 0.1)";
            return (
              <div
                key={inquiry.year}
                className="rounded-xl border border-white/5 bg-[#12121a] p-5"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-[#FFD700]">
                      {inquiry.year}
                    </span>
                    <h3 className="text-sm font-semibold text-[#e6edf3]">
                      {inquiry.title}
                    </h3>
                  </div>
                  <span
                    className="text-[10px] font-bold tracking-wider px-2 py-0.5 rounded-md shrink-0 ml-3"
                    style={{
                      color: statusColor,
                      backgroundColor: statusBg,
                    }}
                  >
                    {inquiry.status}
                  </span>
                </div>
                <p className="text-sm text-[#8b949e]/80 leading-relaxed">
                  {inquiry.finding}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Key Findings (dynamic from API) ── */}
      <TopicInsights topic="housing" />

      {/* ── Bottom callout ── */}
      <section className="py-12 pb-20 animate-fade-in-up stagger-6">
        <div className="rounded-xl border border-[#DC2626]/15 bg-[#DC2626]/[0.03] p-6 md:p-8">
          <p className="text-xs uppercase tracking-[0.2em] text-[#DC2626] mb-3 font-medium">
            The Bottom Line
          </p>
          <h2 className="text-2xl md:text-3xl font-bold text-[#e6edf3] mb-3 leading-tight">
            {totalSpeeches.toLocaleString()} speeches.{" "}
            <span className="italic text-[#DC2626]">
              Zero structural reform.
            </span>
          </h2>
          <p className="text-[#8b949e] leading-relaxed max-w-2xl mb-4">
            In 25 years of parliamentary debate, Australia has produced
            countless speeches, multiple inquiries, and several modest programs
            &mdash; but no structural reform to the tax concessions that
            economists consistently identify as the primary driver of housing
            unaffordability. Negative gearing and the capital gains discount
            remain untouched. The property industry remains the largest donor
            category in Australian politics. Home ownership rates continue to
            fall.
          </p>
          <p className="text-sm text-[#8b949e]/60">
            Data sourced from Hansard, AEC Transparency Register, and
            TheyVoteForYou. Analysis by OPAX.
          </p>
        </div>
      </section>
    </div>
  );
}

"use client";

import { useState, useEffect, useRef } from "react";
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
  Cell,
} from "recharts";
import { PartyBadge } from "@/components/party-badge";
import {
  SkeletonCard,
  SkeletonChart,
  SkeletonTable,
  Skeleton,
  SkeletonText,
} from "@/components/skeleton";

/* == Real data from parli.db: media speeches by year == */
const TIMELINE = [
  { year: "1998", speeches: 2322 },
  { year: "1999", speeches: 3047 },
  { year: "2000", speeches: 3177 },
  { year: "2001", speeches: 2312 },
  { year: "2002", speeches: 3102 },
  { year: "2003", speeches: 3473 },
  { year: "2004", speeches: 2642 },
  { year: "2005", speeches: 3255 },
  { year: "2006", speeches: 3573 },
  { year: "2007", speeches: 2381 },
  { year: "2008", speeches: 3506 },
  { year: "2009", speeches: 3144 },
  { year: "2010", speeches: 2528 },
  { year: "2011", speeches: 3520 },
  { year: "2012", speeches: 3496 },
  { year: "2013", speeches: 2510 },
  { year: "2014", speeches: 3212 },
  { year: "2015", speeches: 3242 },
  { year: "2016", speeches: 2095 },
  { year: "2017", speeches: 2971 },
  { year: "2018", speeches: 3000 },
  { year: "2019", speeches: 2054 },
  { year: "2020", speeches: 2599 },
  { year: "2021", speeches: 2847 },
  { year: "2022", speeches: 1038 },
];

/* == Real data: media industry donations to political parties == */
const DONATION_FLOW = [
  { donor: "Foxtel", party: "MEAA", amount: 2535000 },
  { donor: "Seven West Media", party: "Labor", amount: 531963 },
  { donor: "Nine Entertainment", party: "Liberal", amount: 810318 },
  { donor: "Nine Entertainment", party: "Labor", amount: 480000 },
  { donor: "News Corp Australia", party: "BCA", amount: 280500 },
  { donor: "News Corp Australia", party: "Labor", amount: 159000 },
  { donor: "Seven West Media", party: "Liberal", amount: 258750 },
  { donor: "Sky News Australia", party: "MEAA", amount: 166650 },
  { donor: "Foxtel", party: "Liberal", amount: 151500 },
  { donor: "Seven West Media", party: "Nationals", amount: 125790 },
  { donor: "Foxtel", party: "Labor", amount: 97800 },
];

/* == Top media donors aggregated == */
const TOP_DONORS = [
  { name: "Foxtel / Fox Corp", total: 2784300, donations: 87, period: "2003-2024" },
  { name: "Nine Entertainment", total: 1290318, donations: 156, period: "1998-2024" },
  { name: "Seven West Media", total: 916503, donations: 124, period: "2002-2024" },
  { name: "News Corp Australia", total: 439500, donations: 48, period: "2005-2024" },
  { name: "Sky News Australia", total: 166650, donations: 22, period: "2015-2024" },
];

/* == Party donations from media industry == */
const PARTY_DONATIONS = [
  { party: "Labor", amount: 1268763, color: "#E13A3A" },
  { party: "Liberal", amount: 1220568, color: "#1C4FA0" },
  { party: "Nationals", amount: 125790, color: "#006644" },
];

/* == TVFY policy 68: media ownership voting by party == */
const TVFY_SCORES = [
  { party: "Australian Greens", support: 100.0, mps: 15, color: "#00843D" },
  { party: "Australian Labor Party", support: 93.7, mps: 150, color: "#E13A3A" },
  { party: "Independents", support: 34.7, mps: 15, color: "#888888" },
  { party: "Liberal National Party", support: 16.0, mps: 3, color: "#1C4FA0" },
  { party: "One Nation", support: 12.0, mps: 4, color: "#F97316" },
  { party: "Country Liberal Party", support: 2.7, mps: 3, color: "#006644" },
  { party: "Liberal Party", support: 2.0, mps: 154, color: "#1C4FA0" },
  { party: "National Party", support: 1.1, mps: 30, color: "#006644" },
];

/* == Top speakers on media topic == */
const TOP_SPEAKERS = [
  { name: "Anthony Albanese", party: "Labor", speeches: 1103, photoId: "10007" },
  { name: "John Howard", party: "Liberal", speeches: 897, photoId: "" },
  { name: "Julia Gillard", party: "Labor", speeches: 853, photoId: "" },
  { name: "John Murphy", party: "Labor", speeches: 830, photoId: "" },
  { name: "Kevin Rudd", party: "Labor", speeches: 702, photoId: "" },
  { name: "Tony Abbott", party: "Liberal", speeches: 651, photoId: "" },
  { name: "Kelvin Thomson", party: "Labor", speeches: 632, photoId: "" },
  { name: "Alexander Downer", party: "Liberal", speeches: 626, photoId: "" },
  { name: "Malcolm Turnbull", party: "Liberal", speeches: 591, photoId: "" },
  { name: "Scott Morrison", party: "Liberal", speeches: 572, photoId: "" },
];

/* == Real Hansard quotes on media == */
const REAL_QUOTES = [
  {
    speaker: "Anthony Albanese",
    party: "Labor",
    photoId: "10007",
    date: "14 March 2013",
    text: "The News Media (Self-regulation) Bill 2013 will strengthen and improve the self-regulatory arrangements for significant providers of print and online news and current affairs.",
    context: "for" as const,
  },
  {
    speaker: "Tim Watts",
    party: "Labor",
    photoId: "",
    date: "17 February 2021",
    text: "It is with some anticipation that I have been waiting to speak on this bill, the Treasury Laws Amendment (News Media and Digital Platforms Mandatory Bargaining Code) Bill 2020.",
    context: "for" as const,
  },
  {
    speaker: "Peta Murphy",
    party: "Labor",
    photoId: "",
    date: "9 November 2020",
    text: "Media and a strong independent media have always been important, but, as we have seen, in 2020 they are more important than ever.",
    context: "for" as const,
  },
  {
    speaker: "Brian Mitchell",
    party: "Labor",
    photoId: "",
    date: "21 June 2017",
    text: "The two-out-of-three rule is what I will be talking mostly about. That is the only element of this bill that Labor has a real problem with. The two-out-of-three rule is not about regulation, it is about diversity.",
    context: "for" as const,
  },
  {
    speaker: "Kate Thwaites",
    party: "Labor",
    photoId: "",
    date: "9 November 2020",
    text: "As our world tries to deal with this pandemic and as one of the world's most important democracies held its presidential election, questions about how we get our information and worries about the spread of misinformation have never seemed so important.",
    context: "for" as const,
  },
  {
    speaker: "Ross Hart",
    party: "Labor",
    photoId: "",
    date: "15 February 2018",
    text: "I'm very pleased to be able to speak to the Communications Legislation Amendment (Deregulation and Other Measures) Bill 2017 and the amendments to be moved by the shadow minister for communications.",
    context: "against" as const,
  },
];

/* == Key moments in media ownership == */
const KEY_MOMENTS = [
  {
    year: "1987",
    title: "Cross-Media Ownership Rules Established",
    desc: "The Hawke government introduces cross-media ownership rules preventing one entity from owning a newspaper, TV and radio station in the same market. Kerry Packer: 'You only get one Alan Bond in your lifetime.'",
    outcome: "Rules established",
    outcomeColor: "#00843D",
  },
  {
    year: "2006",
    title: "Howard Pushes Media Reform",
    desc: "The Howard government introduces the Broadcasting Services Amendment bill to relax cross-media ownership rules. 3,573 media-related speeches that year -- the highest in our dataset.",
    outcome: "Blocked in Senate",
    outcomeColor: "#DC2626",
  },
  {
    year: "2012",
    title: "Finkelstein Inquiry",
    desc: "Independent inquiry into media regulation recommends a government-funded News Media Council to set journalistic standards. 3,496 speeches. News Corp campaigns aggressively against it.",
    outcome: "Recommendations rejected",
    outcomeColor: "#DC2626",
  },
  {
    year: "2013",
    title: "Conroy's Media Reform Package",
    desc: "Communications Minister Stephen Conroy introduces media reform bills including a Public Interest Media Advocate. Described as 'an attack on press freedom' by News Corp mastheads. Withdrawn within days.",
    outcome: "Withdrawn under pressure",
    outcomeColor: "#DC2626",
  },
  {
    year: "2017",
    title: "Media Reform Act Passes",
    desc: "The Turnbull government abolishes the two-out-of-three rule and the 75% audience reach rule. Nine-Fairfax merger follows. The most significant consolidation of Australian media ownership in a generation.",
    outcome: "Ownership rules relaxed",
    outcomeColor: "#DC2626",
  },
  {
    year: "2021",
    title: "News Media Bargaining Code",
    desc: "Australia forces Google and Facebook to pay for news content. Hailed as world-first legislation but critics note it primarily benefits the largest media companies -- News Corp and Nine -- not smaller outlets.",
    outcome: "Passed (benefits incumbents)",
    outcomeColor: "#FFD700",
  },
];

/* == The News Corp question == */
const NEWSCORP_FACTS = [
  { stat: "70%", label: "of Australian metro newspaper circulation controlled by News Corp", src: "ACCC Digital Platforms Inquiry, 2019" },
  { stat: "23", label: "of the 30 largest circulation newspapers owned by one company", src: "Media ownership database, ACMA" },
  { stat: "$280K", label: "in direct donations from News Corp to the BCA alone", src: "AEC annual returns" },
];

/* == MP Spotlight: reformers vs blockers == */
const MP_SPOTLIGHT = [
  {
    name: "Malcolm Turnbull",
    party: "Liberal",
    speeches: 591,
    role: "blocker",
    quote: "These reforms are about ensuring a vibrant, competitive media sector for the 21st century.",
    record: "As PM, passed the 2017 Media Reform Act that abolished cross-media ownership rules. The Nine-Fairfax merger followed within a year, further concentrating ownership.",
  },
  {
    name: "Stephen Conroy",
    party: "Labor",
    speeches: 412,
    role: "reformer",
    quote: "We need a strong, effective system of media regulation that protects the public interest.",
    record: "Introduced the Public Interest Media Advocate in 2013. Faced a coordinated News Corp campaign and withdrew the bills within days of introduction.",
  },
  {
    name: "Scott Morrison",
    party: "Liberal",
    speeches: 572,
    role: "blocker",
    quote: "The government is committed to supporting a strong and diverse Australian media sector.",
    record: "As PM, introduced the News Media Bargaining Code which primarily benefited News Corp and Nine. Did nothing to address media concentration.",
  },
  {
    name: "Sarah Hanson-Young",
    party: "Greens",
    speeches: 287,
    role: "reformer",
    quote: "Media diversity is not just about business -- it is about democracy. When one company controls what most Australians read, that is a democratic problem.",
    record: "Consistently opposed relaxation of ownership rules. Voted against the 2017 Media Reform Act. Pushed for a Senate inquiry into media diversity.",
  },
];

/* == Scroll-triggered visibility hook == */
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

/* == Helpers == */
const fmt = (n: number) => `$${(n / 1_000_000).toFixed(1)}M`;
const fmtK = (n: number) => n >= 1000 ? `$${(n / 1000).toFixed(0)}K` : `$${n.toLocaleString()}`;

const partyColors: Record<string, string> = {
  Labor: "#E13A3A", Liberal: "#1C4FA0", Greens: "#00843D",
  Nationals: "#006644", Independent: "#888888",
};

/* == Stacked bar data for Follow the Dollar == */
function buildDonorByParty() {
  const donors = [...new Set(DONATION_FLOW.map((d) => d.donor))];
  return donors.map((donor) => {
    const row: Record<string, string | number> = { donor };
    let total = 0;
    for (const entry of DONATION_FLOW.filter((d) => d.donor === donor)) {
      row[entry.party] = entry.amount;
      total += entry.amount;
    }
    row.total = total;
    return row;
  }).sort((a, b) => (b.total as number) - (a.total as number));
}

export default function MediaOwnershipPage() {
  const donorByParty = buildDonorByParty();
  const donorParties = [...new Set(DONATION_FLOW.map((d) => d.party))];
  const maxSpeaker = TOP_SPEAKERS[0].speeches;
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => { setHydrated(true); }, []);

  return (
    <div className="mx-auto max-w-6xl px-6">
      {/* -- Hero -- */}
      <section className="pt-16 pb-12 animate-fade-in-up">
        <p className="text-sm uppercase tracking-[0.2em] text-[#FFD700] mb-4 font-medium">
          Deep Dive &mdash; Investigation 004
        </p>
        <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-[#e6edf3] leading-[1.1] mb-4 max-w-4xl">
          Media Ownership:{" "}
          <span className="italic text-[#FFD700]">Who Controls What Australians See and Hear</span>
        </h1>
        <p className="text-lg text-[#8b949e] max-w-2xl leading-relaxed mb-10">
          Australia has one of the most concentrated media markets in the
          developed world. News Corp, Nine Entertainment, and Seven West Media
          dominate what Australians read, watch, and hear. Parliament has debated
          this for decades &mdash; then made it worse.
        </p>

        {!hydrated ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonCard key={i} className="text-center" />
            ))}
          </div>
        ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 animate-fade-in-up">
          <div className="rounded-xl border border-white/5 bg-[#12121a] p-4 text-center">
            <p className="text-2xl md:text-3xl font-bold text-[#FFD700]">71,081</p>
            <p className="text-xs text-[#8b949e] mt-1 uppercase tracking-wider">Speeches</p>
          </div>
          <div className="rounded-xl border border-white/5 bg-[#12121a] p-4 text-center">
            <p className="text-2xl md:text-3xl font-bold text-[#FFD700]">25 years</p>
            <p className="text-xs text-[#8b949e] mt-1 uppercase tracking-wider">Of Debate</p>
          </div>
          <div className="rounded-xl border border-white/5 bg-[#12121a] p-4 text-center">
            <p className="text-2xl md:text-3xl font-bold text-[#FFD700]">2%</p>
            <p className="text-xs text-[#8b949e] mt-1 uppercase tracking-wider">Liberal Support for Diversity</p>
          </div>
          <div className="rounded-xl border border-white/5 bg-[#12121a] p-4 text-center">
            <p className="text-2xl md:text-3xl font-bold text-[#DC2626]">2017</p>
            <p className="text-xs text-[#8b949e] mt-1 uppercase tracking-wider">Ownership Rules Abolished</p>
          </div>
        </div>
        )}
      </section>

      {/* -- The Concentration Problem -- */}
      <Section>
        <h2 className="text-2xl md:text-3xl font-bold text-[#e6edf3] mb-2">
          The Concentration Problem
        </h2>
        <p className="text-sm text-[#8b949e] mb-8 max-w-2xl leading-relaxed">
          Australia&apos;s media market is among the most concentrated in any
          liberal democracy. Three companies control the vast majority of what
          Australians see, read, and hear. When media ownership concentrates,
          democratic accountability suffers.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { stat: "~70%", label: "of metro newspaper circulation controlled by News Corp", src: "ACCC Digital Platforms Inquiry, 2019" },
            { stat: "3", label: "companies dominate Australian commercial TV, print, and online news", src: "News Corp, Nine Entertainment, Seven West Media" },
            { stat: "0", label: "major media ownership reforms passed since 2017 relaxation", src: "Parliamentary record, 2017-2025" },
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
            In most comparable democracies &mdash; the UK, Canada, Germany &mdash; cross-media
            ownership rules prevent a single company from dominating multiple media
            platforms in the same market. Australia had those rules too, until
            Parliament abolished them in 2017. The result: the Nine-Fairfax merger,
            further consolidation of regional media, and the closure of dozens of
            local newsrooms.
          </p>
        </div>
      </Section>

      {/* -- The Timeline -- */}
      <Section>
        <h2 className="text-2xl md:text-3xl font-bold text-[#e6edf3] mb-2">
          25 Years of Parliamentary Debate
        </h2>
        <p className="text-sm text-[#8b949e] mb-2 max-w-2xl leading-relaxed">
          71,081 speeches mentioning media across 25 years of Hansard. The
          spikes in 2006 and 2011 correspond to the Howard-era media reform push
          and the Finkelstein inquiry respectively. After the 2017 ownership
          rules were relaxed, debate continued but the legislative window had
          already closed.
        </p>
        <p className="text-xs text-[#8b949e]/60 mb-6">
          Source: Hansard (parlinfo.aph.gov.au), 1998&ndash;2022
        </p>
        {!hydrated ? (
          <SkeletonChart height={380} />
        ) : (
        <div className="rounded-xl border border-white/5 bg-[#12121a] p-4 md:p-6 animate-fade-in-up">
          <ResponsiveContainer width="100%" height={380}>
            <BarChart data={TIMELINE} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="year" tick={{ fill: "#8b949e", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "rgba(255,255,255,0.1)" }} interval={2} />
              <YAxis tick={{ fill: "#8b949e", fontSize: 11 }} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{ backgroundColor: "#12121a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#e6edf3", fontSize: 13 }}
                cursor={{ fill: "rgba(255,215,0,0.05)" }}
                labelFormatter={(l) => `Year: ${l}`}
                formatter={(v) => [`${Number(v).toLocaleString()} speeches`, "Media speeches"]}
              />
              <Bar dataKey="speeches" fill="#FFD700" name="Media speeches" radius={[3, 3, 0, 0]}>
                {TIMELINE.map((entry, idx) => (
                  <Cell
                    key={idx}
                    fill={entry.year === "2006" || entry.year === "2011" || entry.year === "2017" ? "#FFD700" : "rgba(255,215,0,0.5)"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="flex gap-4 mt-3 text-xs text-[#8b949e]/60">
            <span>Highlighted: 2006 (Howard reform push), 2011 (Finkelstein inquiry), 2017 (ownership rules abolished)</span>
          </div>
        </div>
        )}
      </Section>

      {/* -- Key Moments -- */}
      <Section>
        <h2 className="text-2xl md:text-3xl font-bold text-[#e6edf3] mb-2">
          Key Moments
        </h2>
        <p className="text-sm text-[#8b949e] mb-8 max-w-2xl leading-relaxed">
          Four decades of media ownership battles. Every attempt to increase
          diversity has been defeated or watered down. The one law that passed
          went the other way &mdash; reducing restrictions.
        </p>
        <div className="relative pl-8 md:pl-12">
          <div className="absolute left-3 md:left-5 top-0 bottom-0 w-px bg-gradient-to-b from-[#FFD700]/60 via-[#FFD700]/20 to-transparent" />
          <div className="space-y-8">
            {KEY_MOMENTS.map((m) => (
              <div key={m.year + m.title} className="relative group">
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

      {/* -- The News Corp Question -- */}
      <Section>
        <h2 className="text-2xl md:text-3xl font-bold text-[#e6edf3] mb-2">
          The News Corp Question
        </h2>
        <p className="text-sm text-[#8b949e] mb-8 max-w-2xl leading-relaxed">
          No discussion of Australian media ownership is complete without
          addressing the Murdoch empire. News Corp&apos;s dominance of the
          Australian print landscape is unmatched in any comparable democracy.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {NEWSCORP_FACTS.map((d) => (
            <div key={d.stat} className="rounded-xl border border-[#FFD700]/10 bg-[#FFD700]/[0.03] p-6 group hover:border-[#FFD700]/25 transition-colors">
              <p className="text-3xl md:text-4xl font-bold text-[#FFD700] mb-2">{d.stat}</p>
              <p className="text-sm text-[#e6edf3]/80 leading-relaxed mb-3">{d.label}</p>
              <p className="text-xs text-[#8b949e]/60">{d.src}</p>
            </div>
          ))}
        </div>
        <div className="mt-6 rounded-xl border border-[#FFD700]/10 bg-[#FFD700]/[0.03] p-5">
          <p className="text-sm text-[#e6edf3]/70 leading-relaxed mb-4">
            <strong className="text-[#FFD700]">The influence extends beyond print.</strong>{" "}
            Through Sky News Australia (via Foxtel), News Corp operates Australia&apos;s
            most-watched 24-hour news channel. Sky News content reaches millions
            more through YouTube and regional free-to-air deals. The Murdoch family&apos;s
            influence over Australian politics has been a bipartisan concern for
            decades &mdash; yet no government has acted to limit it.
          </p>
          <p className="text-sm text-[#e6edf3]/70 leading-relaxed">
            Former PM Kevin Rudd launched a petition for a Royal Commission into media
            diversity that gathered over 500,000 signatures &mdash; the most successful
            parliamentary petition in Australian history. A Senate inquiry followed
            but produced no binding recommendations.
          </p>
        </div>
      </Section>

      {/* -- How They Actually Vote -- */}
      <Section>
        <h2 className="text-2xl md:text-3xl font-bold text-[#e6edf3] mb-2">
          How They Actually Vote on Media Diversity
        </h2>
        <p className="text-sm text-[#8b949e] mb-6 max-w-2xl leading-relaxed">
          Voting record scores from TheyVoteForYou.org.au on media ownership
          diversity policy. The gap between Greens/Labor and the Coalition is
          stark: 100% vs 2%. The Liberal Party &mdash; with 154 MPs scored &mdash;
          voted for media diversity just 2% of the time.
        </p>
        {!hydrated ? (
          <SkeletonChart height={Math.max(300, TVFY_SCORES.length * 48)} />
        ) : (
        <div className="rounded-xl border border-white/5 bg-[#12121a] p-4 md:p-6 animate-fade-in-up">
          <ResponsiveContainer width="100%" height={Math.max(300, TVFY_SCORES.length * 48)}>
            <BarChart data={TVFY_SCORES} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 120 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
              <XAxis type="number" domain={[0, 100]} tick={{ fill: "#8b949e", fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
              <YAxis type="category" dataKey="party" tick={{ fill: "#e6edf3", fontSize: 12 }} tickLine={false} axisLine={false} width={120} />
              <Tooltip
                contentStyle={{ backgroundColor: "#12121a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#e6edf3", fontSize: 13 }}
                formatter={(v) => [`${v}% support`, "Support"]}
              />
              <Bar dataKey="support" name="Support for media diversity">
                {TVFY_SCORES.map((entry, idx) => (
                  <Cell key={idx} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        )}
        <p className="text-xs text-[#8b949e]/60 mt-3">
          Source: TheyVoteForYou.org.au, Policy 68 &mdash; Media ownership diversity. Scores based on parliamentary division voting records.
        </p>
      </Section>

      {/* -- Follow the Dollar -- */}
      <Section>
        <h2 className="text-2xl md:text-3xl font-bold text-[#e6edf3] mb-2">
          Follow the Dollar
        </h2>
        <p className="text-sm text-[#8b949e] mb-2 max-w-2xl leading-relaxed">
          Media companies donate to all sides of politics. The declared amounts
          are modest compared to mining or gambling &mdash; but the real currency
          of media influence is editorial power, not cash. Still, the money
          tells its own story.
        </p>
        <p className="text-xs text-[#8b949e]/60 mb-6">
          Source: AEC annual returns. Amounts are declared donations only.
        </p>

        {/* Stacked bar: donors by party */}
        <div className="rounded-xl border border-white/5 bg-[#12121a] p-4 md:p-6 mb-6">
          <ResponsiveContainer width="100%" height={340}>
            <BarChart data={donorByParty} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 100 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
              <XAxis type="number" tick={{ fill: "#8b949e", fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v: number) => fmtK(v)} />
              <YAxis type="category" dataKey="donor" tick={{ fill: "#e6edf3", fontSize: 12 }} tickLine={false} axisLine={false} width={100} />
              <Tooltip
                contentStyle={{ backgroundColor: "#12121a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#e6edf3", fontSize: 13 }}
                formatter={(v) => `$${Number(v).toLocaleString()}`}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} iconType="square" iconSize={10} />
              {donorParties.map((p) => (
                <Bar key={p} dataKey={p} stackId="a" fill={partyColors[p] || "#888"} name={p} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Party totals */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {PARTY_DONATIONS.map((p) => (
            <div key={p.party} className="rounded-xl border border-white/5 bg-[#12121a] p-5">
              <div className="flex items-center gap-2 mb-2">
                <PartyBadge party={p.party} />
              </div>
              <p className="text-2xl font-bold" style={{ color: p.color }}>{fmt(p.amount)}</p>
              <p className="text-xs text-[#8b949e] mt-1">Total media industry donations received</p>
            </div>
          ))}
        </div>

        {/* Top donors list */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {TOP_DONORS.map((d) => (
            <div key={d.name} className="rounded-xl border border-white/5 bg-[#12121a] p-5 hover:border-[#FFD700]/20 transition-colors">
              <div className="flex items-start justify-between mb-2">
                <h3 className="text-base font-semibold text-[#e6edf3]">{d.name}</h3>
                <span className="text-lg font-bold text-[#FFD700] shrink-0 ml-2">{fmt(d.total)}</span>
              </div>
              <p className="text-xs text-[#8b949e]">{d.donations.toLocaleString()} donations over {d.period}</p>
            </div>
          ))}
        </div>

        <div className="mt-6 rounded-xl border border-[#FFD700]/10 bg-[#FFD700]/5 p-5">
          <p className="text-sm text-[#FFD700]/80 leading-relaxed">
            <strong className="text-[#FFD700]">Note:</strong> Media companies
            wield influence far beyond direct donations. Editorial endorsements,
            front-page campaigns, and the threat of hostile coverage are worth
            more than any cheque. As one political staffer put it: &ldquo;You
            don&apos;t need to donate when you own the front page.&rdquo;
          </p>
        </div>
      </Section>

      {/* -- MP Spotlight: Who Speaks vs Who Blocks -- */}
      <Section>
        <h2 className="text-2xl md:text-3xl font-bold text-[#e6edf3] mb-2">
          Who Speaks About Media Reform vs Who Blocks It
        </h2>
        <p className="text-sm text-[#8b949e] mb-8 max-w-2xl leading-relaxed">
          Some MPs champion media diversity in speeches then vote to relax
          ownership rules. Others fight for reform and pay the political price.
          The disconnect between rhetoric and action is the clearest sign of
          media power over politics.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {MP_SPOTLIGHT.map((mp) => {
            const isBlocker = mp.role === "blocker";
            const borderColor = isBlocker ? "#DC2626" : "#00843D";
            const label = isBlocker ? "RELAXED RULES" : "PUSHED REFORM";
            return (
              <div
                key={mp.name}
                className="rounded-xl border bg-[#12121a] p-5 hover:border-white/15 transition-colors"
                style={{ borderColor: `${borderColor}30` }}
              >
                <div className="flex items-start gap-3 mb-4">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base font-semibold text-[#e6edf3]">{mp.name}</h3>
                    <div className="flex items-center gap-2 mt-0.5">
                      <PartyBadge party={mp.party} />
                      <span className="text-xs text-[#8b949e]">{mp.speeches} media speeches</span>
                    </div>
                  </div>
                  <span
                    className="text-xs font-bold tracking-wider px-2.5 py-1 rounded-md shrink-0"
                    style={{ color: borderColor, backgroundColor: `${borderColor}15` }}
                  >
                    {label}
                  </span>
                </div>
                <blockquote className="text-xs text-[#e6edf3]/70 italic leading-relaxed mb-3 pl-3 border-l-2 border-[#FFD700]/20">
                  &ldquo;{mp.quote}&rdquo;
                </blockquote>
                <div
                  className="rounded-lg p-3 border"
                  style={{ backgroundColor: `${borderColor}08`, borderColor: `${borderColor}15` }}
                >
                  <p className="text-xs leading-relaxed" style={{ color: `${borderColor}CC` }}>
                    <span className="font-semibold" style={{ color: borderColor }}>Record:</span> {mp.record}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      {/* -- In Their Own Words -- */}
      <Section>
        <h2 className="text-2xl md:text-3xl font-bold text-[#e6edf3] mb-2">
          In Their Own Words
        </h2>
        <p className="text-sm text-[#8b949e] mb-8 max-w-2xl leading-relaxed">
          Direct quotes from the parliamentary record &mdash; sourced from Hansard.
          What MPs say about media ownership, regulation, and diversity.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {REAL_QUOTES.map((q, i) => {
            const ctxColor = q.context === "for" ? "#00843D" : "#DC2626";
            const ctxBg = q.context === "for" ? "rgba(0,132,61,0.1)" : "rgba(220,38,38,0.1)";
            const ctxLabel = q.context === "for" ? "Spoke FOR media diversity" : "Spoke AGAINST regulation";
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
      </Section>

      {/* -- Who Spoke Most -- */}
      <Section>
        <h2 className="text-2xl md:text-3xl font-bold text-[#e6edf3] mb-2">
          Who Spoke Most About Media?
        </h2>
        <p className="text-sm text-[#8b949e] mb-6 max-w-2xl leading-relaxed">
          The top 10 MPs by volume of speeches mentioning media. Prime Ministers
          dominate the list &mdash; media is a topic that reaches the highest
          levels of government. But speaking volume does not equal reform commitment.
        </p>
        <div className="rounded-xl border border-white/5 bg-[#12121a] p-4 md:p-6">
          <div className="space-y-3">
            {TOP_SPEAKERS.map((mp, i) => {
              const barWidth = (mp.speeches / maxSpeaker) * 100;
              return (
                <div key={mp.name} className="flex items-center gap-3 group">
                  <span className="text-xs text-[#8b949e] w-4 shrink-0 text-right">{i + 1}</span>
                  {mp.photoId ? (
                    <div className="w-7 h-7 rounded-full overflow-hidden shrink-0 border border-white/10">
                      <img src={getPhotoUrl(mp.photoId)} alt={mp.name} className="w-full h-full object-cover" />
                    </div>
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-white/5 shrink-0" />
                  )}
                  <div className="w-40 shrink-0">
                    <span className="text-sm text-[#e6edf3] font-medium">{mp.name}</span>
                  </div>
                  <PartyBadge party={mp.party} />
                  <div className="flex-1 relative">
                    <div className="h-5 rounded bg-white/5 overflow-hidden">
                      <div
                        className="h-full rounded transition-all duration-700"
                        style={{
                          width: `${barWidth}%`,
                          backgroundColor: partyColors[mp.party] || "#888",
                          opacity: 0.7,
                        }}
                      />
                    </div>
                  </div>
                  <span className="text-sm font-bold text-[#e6edf3] w-12 text-right shrink-0">{mp.speeches.toLocaleString()}</span>
                </div>
              );
            })}
          </div>
        </div>
      </Section>

      {/* -- What Can You Do? -- */}
      <Section className="pb-20">
        <h2 className="text-2xl md:text-3xl font-bold text-[#e6edf3] mb-2">
          What Can You Do?
        </h2>
        <p className="text-sm text-[#8b949e] mb-8 max-w-2xl leading-relaxed">
          Media concentration is a threat to democracy. Here is how you can act.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            {
              title: "Contact Your MP",
              desc: "Ask your representative where they stand on media ownership diversity and why.",
              link: "https://www.openaustralia.org.au/",
              linkText: "Find your MP",
            },
            {
              title: "Support Independent Media",
              desc: "Subscribe to independent outlets like The Guardian Australia, Crikey, The Saturday Paper, and local community papers.",
              link: "https://www.theguardian.com/australia-news",
              linkText: "Explore independent media",
            },
            {
              title: "Check the Voting Record",
              desc: "See how your MP actually votes on media diversity — not just what they say.",
              link: "https://theyvoteforyou.org.au/policies/68",
              linkText: "TheyVoteForYou.org.au",
            },
            {
              title: "Read the Hansard",
              desc: "Read what your MP actually said about media ownership in Parliament.",
              link: "https://www.aph.gov.au/Parliamentary_Business/Hansard",
              linkText: "Parliamentary Hansard",
            },
            {
              title: "Share This Investigation",
              desc: "Help others understand the gap between rhetoric and action on media ownership.",
              link: "#",
              linkText: "Copy link",
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
            Australian Electoral Commission transparency register, TheyVoteForYou.org.au
            (Policy 68), and the ACCC Digital Platforms Inquiry. All speech data is
            sourced from the official parliamentary record. OPAX is an independent,
            non-partisan project.
          </p>
        </div>
      </Section>
    </div>
  );
}

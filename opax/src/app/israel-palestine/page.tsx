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
  ReferenceLine,
} from "recharts";
import { PartyBadge } from "@/components/party-badge";
import { QuoteCard } from "@/components/quote-card";
import {
  SkeletonCard,
  SkeletonChart,
  Skeleton,
  SkeletonText,
} from "@/components/skeleton";

/* ── Real data: Israel/Palestine speeches by year, stacked by party (1998+) ── */
const TIMELINE_DATA = [
  { year: "1998", ALP: 49, LIB: 66, GRN: 0, NAT: 8, IND: 4, Other: 8 },
  { year: "1999", ALP: 30, LIB: 35, GRN: 0, NAT: 6, IND: 2, Other: 6 },
  { year: "2000", ALP: 43, LIB: 40, GRN: 0, NAT: 2, IND: 0, Other: 12 },
  { year: "2001", ALP: 31, LIB: 21, GRN: 0, NAT: 2, IND: 3, Other: 4 },
  { year: "2002", ALP: 131, LIB: 98, GRN: 0, NAT: 2, IND: 8, Other: 9 },
  { year: "2003", ALP: 174, LIB: 184, GRN: 8, NAT: 9, IND: 18, Other: 12 },
  { year: "2004", ALP: 56, LIB: 66, GRN: 4, NAT: 0, IND: 2, Other: 16 },
  { year: "2005", ALP: 70, LIB: 73, GRN: 0, NAT: 0, IND: 2, Other: 29 },
  { year: "2006", ALP: 113, LIB: 95, GRN: 3, NAT: 4, IND: 2, Other: 43 },
  { year: "2007", ALP: 31, LIB: 28, GRN: 5, NAT: 1, IND: 1, Other: 21 },
  { year: "2008", ALP: 84, LIB: 38, GRN: 7, NAT: 5, IND: 1, Other: 19 },
  { year: "2009", ALP: 95, LIB: 57, GRN: 3, NAT: 4, IND: 0, Other: 21 },
  { year: "2010", ALP: 90, LIB: 33, GRN: 3, NAT: 0, IND: 0, Other: 14 },
  { year: "2011", ALP: 117, LIB: 74, GRN: 18, NAT: 5, IND: 0, Other: 34 },
  { year: "2012", ALP: 87, LIB: 63, GRN: 16, NAT: 3, IND: 0, Other: 27 },
  { year: "2013", ALP: 49, LIB: 29, GRN: 11, NAT: 2, IND: 0, Other: 17 },
  { year: "2014", ALP: 49, LIB: 36, GRN: 0, NAT: 0, IND: 1, Other: 2 },
  { year: "2015", ALP: 61, LIB: 50, GRN: 2, NAT: 0, IND: 0, Other: 19 },
  { year: "2016", ALP: 40, LIB: 23, GRN: 1, NAT: 0, IND: 0, Other: 5 },
  { year: "2017", ALP: 29, LIB: 37, GRN: 0, NAT: 0, IND: 1, Other: 4 },
  { year: "2018", ALP: 36, LIB: 49, GRN: 1, NAT: 0, IND: 6, Other: 3 },
  { year: "2019", ALP: 31, LIB: 39, GRN: 2, NAT: 0, IND: 1, Other: 5 },
  { year: "2020", ALP: 19, LIB: 20, GRN: 1, NAT: 0, IND: 2, Other: 5 },
  { year: "2021", ALP: 48, LIB: 46, GRN: 3, NAT: 0, IND: 5, Other: 19 },
  { year: "2022", ALP: 11, LIB: 2, GRN: 0, NAT: 0, IND: 2, Other: 7 },
  { year: "2023", ALP: 4, LIB: 4, GRN: 5, NAT: 0, IND: 0, Other: 4 },
  { year: "2024", ALP: 2, LIB: 0, GRN: 0, NAT: 0, IND: 0, Other: 4 },
  { year: "2025", ALP: 4, LIB: 2, GRN: 2, NAT: 0, IND: 0, Other: 16 },
];

/* ── Iran speech counts by year (selected peak years) ── */
const IRAN_TIMELINE_DATA = [
  { year: "2002", speeches: 38 },
  { year: "2003", speeches: 45 },
  { year: "2006", speeches: 34 },
  { year: "2007", speeches: 42 },
  { year: "2010", speeches: 30 },
  { year: "2012", speeches: 39 },
  { year: "2015", speeches: 44 },
  { year: "2017", speeches: 51 },
  { year: "2018", speeches: 52 },
  { year: "2019", speeches: 28 },
  { year: "2020", speeches: 46 },
  { year: "2021", speeches: 31 },
  { year: "2022", speeches: 22 },
  { year: "2023", speeches: 58 },
  { year: "2024", speeches: 35 },
  { year: "2025", speeches: 42 },
];

/* ── Top speakers on Israel/Palestine (real data from parli.db) ── */
const TOP_SPEAKERS = [
  { name: "Michael Danby", party: "Labor", speeches: 225, photoId: "10150", role: "Longest-serving Jewish MP, strong Israel advocate" },
  { name: "Alexander Downer", party: "Liberal", speeches: 85, photoId: "10163", role: "Foreign Minister 1996-2007" },
  { name: "Philip Ruddock", party: "Liberal", speeches: 57, photoId: "10552", role: "Attorney-General, Immigration Minister" },
  { name: "Melissa Parke", party: "Labor", speeches: 54, photoId: "10523", role: "Former UN lawyer, Palestinian rights advocate" },
  { name: "Maria Vamvakinou", party: "Labor", speeches: 38, photoId: "10727", role: "Strong advocate for Palestinian communities" },
  { name: "Scott Morrison", party: "Liberal", speeches: 38, photoId: "10468", role: "PM, considered Jerusalem embassy move" },
  { name: "Julia Irwin", party: "Labor", speeches: 36, photoId: "10301", role: "Vocal Palestine supporter in Labor caucus" },
  { name: "Julie Bishop", party: "Liberal", speeches: 36, photoId: "10036", role: "Foreign Minister 2013-2018" },
  { name: "John Howard", party: "Liberal", speeches: 35, photoId: "10270", role: "PM 1996-2007, strong Israel ally" },
  { name: "Kevin Rudd", party: "Labor", speeches: 29, photoId: "10552", role: "PM, two-state solution advocate" },
];

/* ── Key milestones ── */
const MILESTONES = [
  { year: "1948", label: "Israel established; Australia votes YES at UN" },
  { year: "2002", label: "Second Intifada peak debate" },
  { year: "2003", label: "Iraq War & Middle East debates" },
  { year: "2006", label: "Lebanon War & Gaza escalation" },
  { year: "2008", label: "Gaza War (Operation Cast Lead)" },
  { year: "2011", label: "Australia votes for Palestine at UNESCO" },
  { year: "2014", label: "Gaza War (Operation Protective Edge)" },
  { year: "2018", label: "Gaza border protests; embassy debate; JCPOA withdrawal" },
  { year: "2021", label: "May escalation; Sheikh Jarrah" },
  { year: "2023", label: "October 7 attack; Gaza war begins; Iran tensions rise" },
  { year: "2025", label: "Iran-Israel direct confrontation; sanctions debates" },
];

/* ── TVFY voting policies ── */
const VOTING_POLICIES = [
  { id: 324, name: "Calling for release of Israeli hostages in Gaza", description: "Federal government calling for a release of Israeli hostages in Gaza (2023-25)" },
  { id: 325, name: "Recognising the State of Palestine", description: "Whether Parliament should formally recognise the State of Palestine" },
  { id: 78, name: "Requiring Parliamentary approval of military deployments", description: "Whether military deployments should require a vote in Parliament" },
];

/* ── Defence contractor donations (real data from parli.db) ── */
const DEFENCE_DONORS = [
  { name: "Raytheon Australia", amount: "$3.6M", rawAmount: 3611550, recipients: ["Liberal Party"], note: "US weapons manufacturer. Largest defence contractor donor to Australian politics." },
  { name: "Boeing Australia", amount: "$3.4M", rawAmount: 3417690, recipients: ["Business Council of Australia", "Unions"], note: "Military aircraft and weapons systems manufacturer. Funds BCA and union associated entities." },
  { name: "BAE Systems Australia", amount: "$2.1M", rawAmount: 2069916, recipients: ["Liberal Party", "Unions"], note: "British defence conglomerate. Hunter-class frigates builder." },
  { name: "Thales Australia", amount: "$1.5M", rawAmount: 1549209, recipients: ["Unions"], note: "French defence company. Bushmaster vehicles and Hawkei manufacturer." },
  { name: "Tenix Defence Systems", amount: "$399K", rawAmount: 399000, recipients: ["Various"], note: "Former ANZAC-class frigate builder, now part of BAE." },
];

/* ── Key quotes ── */
const KEY_QUOTES = [
  {
    speakerName: "Adam Bandt",
    party: "Greens",
    photoId: "10721",
    date: "May 2021",
    quote: "All people have the right to peace and security, and our job is to make sure those rights are valued equally for all. Benjamin Netanyahu's military flattened buildings in Gaza that were homes and media offices.",
    context: "for" as const,
  },
  {
    speakerName: "Adam Bandt",
    party: "Greens",
    photoId: "10721",
    date: "May 2018",
    quote: "Last week the world witnessed a massacre. On 14 May, Israeli soldiers shot and killed 58 Palestinians who were protesting near the fence that separates the Gaza Strip from Israel. Over 2,000 Palestinians were injured.",
    context: "for" as const,
  },
  {
    speakerName: "Adam Bandt",
    party: "Greens",
    photoId: "10721",
    date: "May 2020",
    quote: "This week Palestinians and their friends commemorate the Nakba, when, in 1948, hundreds of thousands of Palestinians were expelled from their homes. The displacement continues to this day.",
    context: "for" as const,
  },
  {
    speakerName: "David Shoebridge",
    party: "Greens",
    photoId: "10992",
    date: "Feb 2026",
    quote: "There is widespread concern amongst that part of the community who want to be able to advocate for a free Palestine, for human rights, for the end of the genocide in Gaza.",
    context: "for" as const,
  },
];

const partyBorderColors: Record<string, string> = {
  Labor: "#E13A3A",
  Liberal: "#1C4FA0",
  Greens: "#00843D",
  Nationals: "#006644",
  Independent: "#888888",
};

const totalSpeeches = TIMELINE_DATA.reduce(
  (sum, y) => sum + y.ALP + y.LIB + y.GRN + y.NAT + y.IND + y.Other,
  0
);

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
      className={`py-12 transition-all duration-700 ease-out ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"} ${className}`}
    >
      {children}
    </section>
  );
}

export default function IsraelPalestinePage() {
  const [showAllDonors, setShowAllDonors] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => { setHydrated(true); }, []);
  const visibleDonors = showAllDonors ? DEFENCE_DONORS : DEFENCE_DONORS.slice(0, 4);

  return (
    <div className="mx-auto max-w-6xl px-6">
      {/* ── Hero ── */}
      <section className="pt-16 pb-12 animate-fade-in-up">
        <p className="text-sm uppercase tracking-[0.2em] text-[#FFD700] mb-4 font-medium">
          Deep Dive &mdash; Investigation
        </p>
        <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-[#e6edf3] leading-[1.1] mb-4 max-w-4xl">
          Middle East &amp; Iran:{" "}
          <span className="italic text-[#FFD700]">What Parliament Says</span>
        </h1>
        <p className="text-lg text-[#8b949e] max-w-2xl leading-relaxed mb-6">
          Over 8,700 parliamentary speeches spanning the Israel-Palestine conflict,
          Iran&rsquo;s nuclear programme, Hezbollah, and the broader Middle East.
          From Australia&rsquo;s 1947 UN vote recognising Israel to the 2025&ndash;2026
          Iran-Israel escalation, the Hansard record captures how Australian leaders
          have engaged with the region&rsquo;s most consequential conflicts.
        </p>

        {/* Sensitivity notice */}
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 mb-10 max-w-2xl">
          <p className="text-sm text-[#8b949e] leading-relaxed">
            <strong className="text-[#e6edf3]">About this page:</strong> This covers
            sensitive and deeply contested geopolitical topics. OPAX presents the{" "}
            <em>data objectively</em> &mdash; what was said, who said it, how they voted.
            We take no editorial stance on any of these conflicts. All data is sourced
            from official parliamentary records (Hansard) and the Australian Electoral Commission.
            Our dataset currently extends to March 2026.
          </p>
        </div>

        {/* Key stats bar */}
        {!hydrated ? (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <SkeletonCard key={i} className="text-center" />
            ))}
          </div>
        ) : (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 animate-fade-in-up stagger-1">
          <div className="rounded-xl border border-white/5 bg-[#12121a] p-4 text-center">
            <p className="text-2xl md:text-3xl font-bold text-[#FFD700]">4,896</p>
            <p className="text-xs text-[#8b949e] mt-1 uppercase tracking-wider">
              Israel/Palestine
            </p>
          </div>
          <div className="rounded-xl border border-white/5 bg-[#12121a] p-4 text-center">
            <p className="text-2xl md:text-3xl font-bold text-[#FFD700]">3,744</p>
            <p className="text-xs text-[#8b949e] mt-1 uppercase tracking-wider">
              Iran Speeches
            </p>
          </div>
          <div className="rounded-xl border border-white/5 bg-[#12121a] p-4 text-center">
            <p className="text-2xl md:text-3xl font-bold text-[#FFD700]">279</p>
            <p className="text-xs text-[#8b949e] mt-1 uppercase tracking-wider">
              Hezbollah Mentions
            </p>
          </div>
          <div className="rounded-xl border border-white/5 bg-[#12121a] p-4 text-center">
            <p className="text-2xl md:text-3xl font-bold text-[#FFD700]">405</p>
            <p className="text-xs text-[#8b949e] mt-1 uppercase tracking-wider">
              Peak Year (2003)
            </p>
          </div>
          <div className="rounded-xl border border-white/5 bg-[#12121a] p-4 text-center">
            <p className="text-2xl md:text-3xl font-bold text-[#FFD700]">$11.3M</p>
            <p className="text-xs text-[#8b949e] mt-1 uppercase tracking-wider">
              Defence Donations
            </p>
          </div>
        </div>
        )}
      </section>

      {/* ── The Timeline ── */}
      <Section>
        <h2 className="text-2xl md:text-3xl font-bold text-[#e6edf3] mb-2">
          Israel-Palestine: Parliamentary Debate Over Time
        </h2>
        <p className="text-sm text-[#8b949e] mb-2 max-w-2xl leading-relaxed">
          Speeches mentioning Israel, Palestine, Gaza, Hamas, or the West Bank, stacked
          by party. Major spikes align with escalations in the conflict &mdash; the 2002
          Second Intifada, the 2003 Iraq War context, the 2006 Lebanon War, and the
          2008&ndash;2009 Gaza War.
        </p>
        <p className="text-xs text-[#8b949e]/60 mb-6">
          Source: Hansard (parlinfo.aph.gov.au), 1998&ndash;2025 &middot; {totalSpeeches.toLocaleString()} speeches
        </p>
        {!hydrated ? (
          <SkeletonChart height={420} />
        ) : (
        <div className="rounded-xl border border-white/5 bg-[#12121a] p-4 md:p-6 animate-fade-in-up">
          <ResponsiveContainer width="100%" height={420}>
            <BarChart
              data={TIMELINE_DATA}
              margin={{ top: 20, right: 8, bottom: 0, left: -16 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(255,255,255,0.05)"
                vertical={false}
              />
              <XAxis
                dataKey="year"
                tick={{ fill: "#8b949e", fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
                interval={2}
              />
              <YAxis
                tick={{ fill: "#8b949e", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#12121a",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 8,
                  color: "#e6edf3",
                  fontSize: 13,
                }}
                cursor={{ fill: "rgba(255,215,0,0.05)" }}
                labelFormatter={(label) => `Year: ${label}`}
              />
              <Legend
                wrapperStyle={{ fontSize: 12, color: "#8b949e" }}
                iconType="square"
                iconSize={10}
              />
              <ReferenceLine x="2002" stroke="#DC2626" strokeDasharray="3 3" strokeOpacity={0.4} label={{ value: "Intifada", fill: "#DC2626", fontSize: 9, position: "top" }} />
              <ReferenceLine x="2003" stroke="#E87722" strokeDasharray="3 3" strokeOpacity={0.5} label={{ value: "Iraq War", fill: "#E87722", fontSize: 9, position: "top" }} />
              <ReferenceLine x="2008" stroke="#DC2626" strokeDasharray="3 3" strokeOpacity={0.4} label={{ value: "Gaza War", fill: "#DC2626", fontSize: 9, position: "top" }} />
              <ReferenceLine x="2011" stroke="#FFD700" strokeDasharray="3 3" strokeOpacity={0.4} label={{ value: "UNESCO vote", fill: "#FFD700", fontSize: 9, position: "top" }} />
              <ReferenceLine x="2018" stroke="#E87722" strokeDasharray="3 3" strokeOpacity={0.3} label={{ value: "Embassy debate", fill: "#E87722", fontSize: 9, position: "top" }} />
              <ReferenceLine x="2021" stroke="#DC2626" strokeDasharray="3 3" strokeOpacity={0.3} label={{ value: "May escalation", fill: "#DC2626", fontSize: 9, position: "top" }} />
              <Bar dataKey="ALP" stackId="a" fill="#E13A3A" name="Labor" />
              <Bar dataKey="LIB" stackId="a" fill="#1C4FA0" name="Liberal" />
              <Bar dataKey="GRN" stackId="a" fill="#00843D" name="Greens" />
              <Bar dataKey="NAT" stackId="a" fill="#006644" name="Nationals" />
              <Bar dataKey="IND" stackId="a" fill="#888888" name="Independent" />
              <Bar dataKey="Other" stackId="a" fill="#555555" name="Other" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>

          {/* Milestone legend */}
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {MILESTONES.map((m) => (
              <div key={m.year} className="flex items-center gap-2 text-xs text-[#8b949e]">
                <span className="text-[#FFD700] font-mono font-semibold">{m.year}</span>
                <span>{m.label}</span>
              </div>
            ))}
          </div>
        </div>
        )}
      </Section>

      {/* ── Key Moments ── */}
      <Section>
        <h2 className="text-2xl md:text-3xl font-bold text-[#e6edf3] mb-2">
          Key Moments in Parliament
        </h2>
        <p className="text-sm text-[#8b949e] mb-8 max-w-2xl leading-relaxed">
          Major events in the Israel-Palestine conflict and the broader Middle East
          that triggered significant parliamentary debate in Australia.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-xl border border-white/5 bg-[#12121a] p-5">
            <p className="text-xs text-[#FFD700] font-semibold uppercase tracking-wider mb-2">2002-2003</p>
            <h3 className="text-lg font-bold text-[#e6edf3] mb-2">Second Intifada &amp; Iraq War</h3>
            <p className="text-sm text-[#8b949e] leading-relaxed">
              653 speeches in two years. The Second Intifada and the lead-up to the Iraq War
              brought Middle East policy to the forefront. Australia&rsquo;s decision to join the
              Iraq invasion intertwined with broader regional debates.
            </p>
            <p className="text-xs text-[#FFD700]/60 mt-3">Peak: 405 speeches in 2003</p>
          </div>
          <div className="rounded-xl border border-white/5 bg-[#12121a] p-5">
            <p className="text-xs text-[#FFD700] font-semibold uppercase tracking-wider mb-2">2006</p>
            <h3 className="text-lg font-bold text-[#e6edf3] mb-2">Lebanon War &amp; Gaza</h3>
            <p className="text-sm text-[#8b949e] leading-relaxed">
              260 speeches as the Lebanon War and Gaza escalation forced Australia to
              navigate evacuation of citizens and take diplomatic positions. Cross-party
              debate intensified on proportionality of military responses.
            </p>
            <p className="text-xs text-[#FFD700]/60 mt-3">Labor (113) slightly outspoke Liberals (95)</p>
          </div>
          <div className="rounded-xl border border-white/5 bg-[#12121a] p-5">
            <p className="text-xs text-[#FFD700] font-semibold uppercase tracking-wider mb-2">2011</p>
            <h3 className="text-lg font-bold text-[#e6edf3] mb-2">UNESCO Palestine Vote</h3>
            <p className="text-sm text-[#8b949e] leading-relaxed">
              248 speeches. Australia voted in favour of Palestine&rsquo;s admission to
              UNESCO under the Gillard government, sparking heated domestic debate.
              The Greens contributed 18 speeches &mdash; their most active year on this issue.
            </p>
            <p className="text-xs text-[#FFD700]/60 mt-3">Greens peak involvement: 18 speeches</p>
          </div>
          <div className="rounded-xl border border-white/5 bg-[#12121a] p-5">
            <p className="text-xs text-[#DC2626] font-semibold uppercase tracking-wider mb-2">2023&ndash;2024</p>
            <h3 className="text-lg font-bold text-[#e6edf3] mb-2">October 7 &amp; Gaza War</h3>
            <p className="text-sm text-[#8b949e] leading-relaxed">
              The October 7, 2023 Hamas attack on Israel and the subsequent military
              campaign in Gaza triggered renewed debate. Key policy votes include calling
              for hostage releases and recognising the State of Palestine.
            </p>
            <p className="text-xs text-[#FFD700]/60 mt-3">TVFY policies #324 and #325 track votes</p>
          </div>
          <div className="rounded-xl border border-white/5 bg-[#12121a] p-5">
            <p className="text-xs text-[#DC2626] font-semibold uppercase tracking-wider mb-2">2025&ndash;2026</p>
            <h3 className="text-lg font-bold text-[#e6edf3] mb-2">Iran-Israel Direct Confrontation</h3>
            <p className="text-sm text-[#8b949e] leading-relaxed">
              The escalation between Iran and Israel into direct military confrontation
              prompted urgent parliamentary debate. Discussions centred on Australian
              sanctions policy, potential ADF deployments to the region, and the impact
              on energy markets and Strait of Hormuz shipping lanes.
            </p>
            <p className="text-xs text-[#FFD700]/60 mt-3">Data coverage extends to March 2026</p>
          </div>
          <div className="rounded-xl border border-white/5 bg-[#12121a] p-5">
            <p className="text-xs text-[#E87722] font-semibold uppercase tracking-wider mb-2">Ongoing</p>
            <h3 className="text-lg font-bold text-[#e6edf3] mb-2">Sanctions &amp; ADF Deployment Debates</h3>
            <p className="text-sm text-[#8b949e] leading-relaxed">
              Parliamentary debate over Australia&rsquo;s sanctions regime against Iran,
              the role of the ADF in the Middle East, and whether military deployments
              should require explicit parliamentary approval (TVFY Policy #78).
            </p>
            <p className="text-xs text-[#FFD700]/60 mt-3">Cross-party divide on deployment authority</p>
          </div>
        </div>
      </Section>

      {/* ── The Iran Dimension ── */}
      <Section>
        <div className="rounded-xl border border-[#E87722]/20 bg-[#E87722]/[0.03] p-6 md:p-8 mb-8">
          <p className="text-xs uppercase tracking-[0.2em] text-[#E87722] mb-3 font-medium">
            Regional Context
          </p>
          <h2 className="text-2xl md:text-3xl font-bold text-[#e6edf3] mb-3 leading-tight">
            The Iran Dimension
          </h2>
          <p className="text-[#8b949e] leading-relaxed max-w-3xl mb-4">
            Iran has been a persistent thread in Australian parliamentary debate,
            intersecting with the Israel-Palestine conflict through proxy networks
            including Hezbollah and Hamas. The parliamentary record contains 3,744
            speeches mentioning Iran, 920 mentioning &ldquo;Iranian&rdquo;, and 279
            referencing Hezbollah &mdash; reflecting the depth of engagement with
            Iran&rsquo;s regional role.
          </p>
          <p className="text-[#8b949e] leading-relaxed max-w-3xl mb-6">
            Key policy threads include the JCPOA nuclear deal and its collapse,
            Strait of Hormuz freedom of navigation, Australian sanctions on Iran,
            and the 2025&ndash;2026 escalation into direct Iran-Israel military
            confrontation. These debates cut across party lines, with differing
            views on diplomacy versus deterrence.
          </p>

          {/* Iran stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 max-w-3xl mb-8">
            <div className="text-center">
              <p className="text-2xl font-bold text-[#E87722]">3,744</p>
              <p className="text-xs text-[#8b949e] mt-1">Iran speeches</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-[#E87722]">920</p>
              <p className="text-xs text-[#8b949e] mt-1">&ldquo;Iranian&rdquo; mentions</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-[#E87722]">279</p>
              <p className="text-xs text-[#8b949e] mt-1">Hezbollah speeches</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-[#E87722]">58</p>
              <p className="text-xs text-[#8b949e] mt-1">Peak year (2023)</p>
            </div>
          </div>

          {/* Iran speech timeline */}
          <h3 className="text-lg font-semibold text-[#e6edf3] mb-4">
            Iran Speech Counts &mdash; Peak Years
          </h3>
          <div className="rounded-xl border border-white/5 bg-[#12121a] p-4 md:p-6">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart
                data={IRAN_TIMELINE_DATA}
                margin={{ top: 10, right: 8, bottom: 0, left: -16 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(255,255,255,0.05)"
                  vertical={false}
                />
                <XAxis
                  dataKey="year"
                  tick={{ fill: "#8b949e", fontSize: 11 }}
                  tickLine={false}
                  axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
                />
                <YAxis
                  tick={{ fill: "#8b949e", fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#12121a",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 8,
                    color: "#e6edf3",
                    fontSize: 13,
                  }}
                  cursor={{ fill: "rgba(232,119,34,0.05)" }}
                  labelFormatter={(label) => `Year: ${label}`}
                />
                <ReferenceLine x="2015" stroke="#FFD700" strokeDasharray="3 3" strokeOpacity={0.4} label={{ value: "JCPOA signed", fill: "#FFD700", fontSize: 9, position: "top" }} />
                <ReferenceLine x="2018" stroke="#DC2626" strokeDasharray="3 3" strokeOpacity={0.4} label={{ value: "US exits JCPOA", fill: "#DC2626", fontSize: 9, position: "top" }} />
                <ReferenceLine x="2023" stroke="#DC2626" strokeDasharray="3 3" strokeOpacity={0.5} label={{ value: "Oct 7 & Iran", fill: "#DC2626", fontSize: 9, position: "top" }} />
                <Bar dataKey="speeches" fill="#E87722" name="Iran speeches" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <p className="text-xs text-[#8b949e]/60 mt-3">
              Source: Hansard keyword search for &ldquo;Iran&rdquo; &middot; Selected years shown &middot;
              Spikes in 2023 (58), 2018 (52), 2017 (51), 2020 (46)
            </p>
          </div>
        </div>

        {/* Hezbollah/Lebanon context */}
        <div className="rounded-xl border border-white/5 bg-[#12121a] p-6">
          <h3 className="text-lg font-semibold text-[#e6edf3] mb-3">
            Hezbollah &amp; Lebanon in Parliament
          </h3>
          <p className="text-sm text-[#8b949e] leading-relaxed mb-4">
            279 speeches in the parliamentary record reference Hezbollah directly.
            These debates span from the 2006 Lebanon War &mdash; when Australia
            evacuated citizens from Beirut &mdash; through to the group&rsquo;s role
            in the Syrian civil war, its designation as a terrorist organisation
            under Australian law, and its involvement in the 2023&ndash;2026
            regional escalation as part of Iran&rsquo;s network of allied groups.
          </p>
          <div className="grid grid-cols-3 gap-4 max-w-lg">
            <div className="text-center">
              <p className="text-xl font-bold text-[#FFD700]">279</p>
              <p className="text-[10px] text-[#8b949e] mt-1">Hezbollah speeches</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-bold text-[#FFD700]">2006</p>
              <p className="text-[10px] text-[#8b949e] mt-1">Lebanon War peak</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-bold text-[#FFD700]">Listed</p>
              <p className="text-[10px] text-[#8b949e] mt-1">Terrorist org (AU)</p>
            </div>
          </div>
        </div>
      </Section>

      {/* ── Top Speakers ── */}
      <Section>
        <h2 className="text-2xl md:text-3xl font-bold text-[#e6edf3] mb-2">
          Who Speaks Most
        </h2>
        <p className="text-sm text-[#8b949e] mb-8 max-w-2xl leading-relaxed">
          The MPs who have spoken most frequently about Israel, Palestine, Gaza, and
          related topics. Speakers come from both sides of the debate &mdash; advocates
          for Israel and advocates for Palestinian rights.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {TOP_SPEAKERS.map((mp) => {
            const borderColor = partyBorderColors[mp.party] || "#888888";
            return (
              <div
                key={mp.name}
                className="rounded-xl border border-white/5 bg-[#12121a] p-5 hover:border-white/10 transition-colors flex gap-4"
              >
                <div
                  className="w-14 h-14 rounded-full overflow-hidden shrink-0 border-2 bg-[#1a1a2e]"
                  style={{ borderColor }}
                >
                  <img
                    src={getPhotoUrl(mp.photoId)}
                    alt={mp.name}
                    className="w-full h-full object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <h3 className="text-base font-semibold text-[#e6edf3]">
                      {mp.name}
                    </h3>
                    <PartyBadge party={mp.party} />
                  </div>
                  <p className="text-xs text-[#8b949e] mb-1">{mp.role}</p>
                  <p className="text-sm text-[#e6edf3]/60">
                    <span className="text-[#FFD700] font-semibold">{mp.speeches}</span> speeches on this topic
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      {/* ── Party Breakdown ── */}
      <Section>
        <h2 className="text-2xl md:text-3xl font-bold text-[#e6edf3] mb-2">
          Party Breakdown
        </h2>
        <p className="text-sm text-[#8b949e] mb-6 max-w-2xl leading-relaxed">
          Which parties speak most about Israel-Palestine in the modern era (1998&ndash;2025).
          Labor and Liberal dominate, reflecting bipartisan engagement with Middle East policy,
          though they often diverge on specifics.
        </p>
        <div className="rounded-xl border border-white/5 bg-[#12121a] p-4 md:p-6">
          <div className="space-y-5">
            {[
              { party: "Labor", count: 1854, color: "#E13A3A" },
              { party: "Liberal", count: 1542, color: "#1C4FA0" },
              { party: "Other", count: 428, color: "#555555" },
              { party: "Greens", count: 100, color: "#00843D" },
              { party: "Nationals", count: 55, color: "#006644" },
              { party: "Independent", count: 53, color: "#888888" },
            ].map((p) => (
              <div key={p.party} className="flex items-center gap-4">
                <div className="w-28 shrink-0">
                  <PartyBadge party={p.party} />
                </div>
                <div className="flex-1 relative">
                  <div className="h-9 rounded-lg bg-white/5 overflow-hidden">
                    <div
                      className="h-full rounded-lg transition-all duration-1000 ease-out flex items-center px-3"
                      style={{
                        width: `${Math.max((p.count / 1854) * 100, 4)}%`,
                        backgroundColor: p.color,
                        opacity: 0.85,
                      }}
                    >
                      {p.count > 200 && (
                        <span className="text-xs font-bold text-white">
                          {p.count.toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="text-right shrink-0 w-20">
                  {p.count <= 200 && (
                    <span
                      className="text-sm font-bold"
                      style={{ color: p.color }}
                    >
                      {p.count}
                    </span>
                  )}
                  <p className="text-[10px] text-[#8b949e]">speeches</p>
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-[#8b949e]/60 mt-4">
            Source: Hansard 1998&ndash;2025 &middot; Keyword search: israel, palestine, gaza, hamas, west bank, zion
          </p>
        </div>
      </Section>

      {/* ── Voting Record ── */}
      <Section>
        <h2 className="text-2xl md:text-3xl font-bold text-[#e6edf3] mb-2">
          How They Voted
        </h2>
        <p className="text-sm text-[#8b949e] mb-6 max-w-2xl leading-relaxed">
          Key voting policies tracked by TheyVoteForYou.org.au related to
          Israel-Palestine, Iran, and foreign military engagement.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {VOTING_POLICIES.map((v) => (
            <div
              key={v.id}
              className="rounded-xl border border-white/5 bg-[#12121a] p-5 hover:border-[#FFD700]/20 transition-colors"
            >
              <p className="text-xs text-[#FFD700]/60 font-mono mb-2">TVFY Policy #{v.id}</p>
              <h3 className="text-base font-semibold text-[#e6edf3] mb-2">
                {v.name}
              </h3>
              <p className="text-sm text-[#8b949e] leading-relaxed">
                {v.description}
              </p>
              <a
                href={`https://theyvoteforyou.org.au/policies/${v.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block mt-3 text-xs text-[#FFD700] hover:text-[#FFD700]/80 transition-colors"
              >
                View votes &rarr;
              </a>
            </div>
          ))}
        </div>
      </Section>

      {/* ── Defence Donations ── */}
      <Section>
        <h2 className="text-2xl md:text-3xl font-bold text-[#e6edf3] mb-2">
          Defence Industry Donations
        </h2>
        <p className="text-sm text-[#8b949e] mb-6 max-w-2xl leading-relaxed">
          Major defence contractors donate to Australian political parties and associated
          entities. These companies manufacture weapons systems used in conflicts around
          the world, including the Middle East.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
        {DEFENCE_DONORS.length > 4 && (
          <button
            onClick={() => setShowAllDonors(!showAllDonors)}
            className="mt-4 text-sm text-[#FFD700] hover:text-[#FFD700]/80 transition-colors"
          >
            {showAllDonors ? "Show fewer" : `Show all ${DEFENCE_DONORS.length} donors`} &rarr;
          </button>
        )}
        <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.02] p-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-xl font-bold text-[#1C4FA0]">$4.0M</p>
              <p className="text-xs text-[#8b949e] mt-1">To Liberal/Coalition</p>
            </div>
            <div>
              <p className="text-xl font-bold text-[#E13A3A]">$1.3M</p>
              <p className="text-xs text-[#8b949e] mt-1">To Labor</p>
            </div>
            <div>
              <p className="text-xl font-bold text-[#888888]">$5.8M</p>
              <p className="text-xs text-[#8b949e] mt-1">To Other entities</p>
            </div>
          </div>
        </div>
      </Section>

      {/* ── Key Quotes ── */}
      <Section>
        <h2 className="text-2xl md:text-3xl font-bold text-[#e6edf3] mb-2">
          From the Parliamentary Record
        </h2>
        <p className="text-sm text-[#8b949e] mb-8 max-w-2xl leading-relaxed">
          Direct quotes from Hansard on Israel-Palestine and the broader Middle East.
          These represent a range of perspectives in Australian parliamentary debate.
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
      </Section>

      {/* ── Historical Context ── */}
      <Section className="pb-20">
        <div className="rounded-xl border border-[#FFD700]/10 bg-[#FFD700]/[0.03] p-6 md:p-8">
          <p className="text-xs uppercase tracking-[0.2em] text-[#FFD700] mb-3 font-medium">
            Historical Context
          </p>
          <h2 className="text-2xl md:text-3xl font-bold text-[#e6edf3] mb-3 leading-tight">
            Australia&rsquo;s Engagement with the{" "}
            <span className="italic text-[#FFD700]">Middle East</span>
          </h2>
          <p className="text-[#8b949e] leading-relaxed max-w-3xl mb-4">
            Australia was one of the first nations to recognise Israel in 1949, following
            H.V. Evatt&rsquo;s role as President of the UN General Assembly during the 1947
            partition vote. Since then, Australian governments of both persuasions have
            maintained close ties with Israel while periodically expressing support for
            Palestinian self-determination.
          </p>
          <p className="text-[#8b949e] leading-relaxed max-w-3xl mb-4">
            The Iran dimension adds a further layer of complexity. Australia has maintained
            sanctions on Iran, participated in Strait of Hormuz maritime security operations,
            and debated the JCPOA nuclear deal in Parliament. The 2025&ndash;2026 escalation
            between Iran and Israel has brought these threads together, with parliamentary
            debate intensifying on sanctions, ADF deployment, and regional stability.
          </p>
          <p className="text-[#8b949e] leading-relaxed max-w-3xl mb-6">
            The combined parliamentary record shows over 8,700 speeches across these
            interconnected topics. In recent decades, the Greens have emerged as the most
            vocal parliamentary voice for Palestinian rights, while both major parties have
            generally maintained support for Israel&rsquo;s security alongside rhetorical
            backing for a two-state solution. Iran policy has seen more bipartisan consensus,
            with both sides supporting sanctions and freedom of navigation.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 max-w-2xl">
            <div className="text-center">
              <p className="text-2xl font-bold text-[#FFD700]">1949</p>
              <p className="text-xs text-[#8b949e] mt-1">Australia recognised Israel</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-[#FFD700]">8,700+</p>
              <p className="text-xs text-[#8b949e] mt-1">Total speeches (combined)</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-[#FFD700]">3,744</p>
              <p className="text-xs text-[#8b949e] mt-1">Iran speeches</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-[#FFD700]">225</p>
              <p className="text-xs text-[#8b949e] mt-1">Top speaker (Danby)</p>
            </div>
          </div>
        </div>
      </Section>
    </div>
  );
}

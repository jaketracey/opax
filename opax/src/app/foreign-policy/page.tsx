"use client";

import { useState, useEffect, useRef } from "react";
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
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { PartyBadge } from "@/components/party-badge";
import {
  SkeletonCard,
  SkeletonChart,
  SkeletonTable,
  SkeletonText,
  Skeleton,
} from "@/components/skeleton";

/* ── Real data: Foreign affairs speeches by year, stacked by party ── */
const TIMELINE_DATA = [
  { year: "1998", ALP: 387, LIB: 562, GRN: 0, NAT: 124, IND: 69, Other: 202 },
  { year: "1999", ALP: 778, LIB: 894, GRN: 0, NAT: 195, IND: 17, Other: 241 },
  { year: "2000", ALP: 633, LIB: 717, GRN: 0, NAT: 176, IND: 18, Other: 152 },
  { year: "2001", ALP: 485, LIB: 650, GRN: 0, NAT: 142, IND: 23, Other: 114 },
  { year: "2002", ALP: 769, LIB: 950, GRN: 0, NAT: 213, IND: 43, Other: 143 },
  { year: "2003", ALP: 987, LIB: 1064, GRN: 42, NAT: 202, IND: 50, Other: 254 },
  { year: "2004", ALP: 648, LIB: 860, GRN: 42, NAT: 0, IND: 54, Other: 385 },
  { year: "2005", ALP: 1048, LIB: 1124, GRN: 0, NAT: 1, IND: 47, Other: 660 },
  { year: "2006", ALP: 1555, LIB: 1293, GRN: 11, NAT: 13, IND: 62, Other: 657 },
  { year: "2007", ALP: 719, LIB: 1003, GRN: 3, NAT: 16, IND: 28, Other: 358 },
  { year: "2008", ALP: 1306, LIB: 563, GRN: 13, NAT: 7, IND: 37, Other: 221 },
  { year: "2009", ALP: 1337, LIB: 637, GRN: 13, NAT: 9, IND: 50, Other: 278 },
  { year: "2010", ALP: 1003, LIB: 501, GRN: 14, NAT: 8, IND: 34, Other: 209 },
  { year: "2011", ALP: 1275, LIB: 943, GRN: 77, NAT: 9, IND: 3, Other: 378 },
  { year: "2012", ALP: 1092, LIB: 789, GRN: 75, NAT: 11, IND: 1, Other: 358 },
  { year: "2013", ALP: 724, LIB: 597, GRN: 45, NAT: 5, IND: 1, Other: 252 },
  { year: "2014", ALP: 812, LIB: 1131, GRN: 14, NAT: 0, IND: 3, Other: 283 },
  { year: "2015", ALP: 867, LIB: 1524, GRN: 15, NAT: 0, IND: 4, Other: 413 },
  { year: "2016", ALP: 541, LIB: 726, GRN: 8, NAT: 3, IND: 2, Other: 201 },
  { year: "2017", ALP: 657, LIB: 737, GRN: 15, NAT: 4, IND: 8, Other: 214 },
  { year: "2018", ALP: 657, LIB: 599, GRN: 17, NAT: 2, IND: 15, Other: 214 },
  { year: "2019", ALP: 431, LIB: 358, GRN: 15, NAT: 4, IND: 20, Other: 234 },
  { year: "2020", ALP: 484, LIB: 399, GRN: 15, NAT: 4, IND: 40, Other: 272 },
  { year: "2021", ALP: 446, LIB: 450, GRN: 19, NAT: 6, IND: 35, Other: 367 },
  { year: "2022", ALP: 200, LIB: 112, GRN: 8, NAT: 0, IND: 14, Other: 102 },
];

/* ── Sub-topic speech counts (real data) ── */
const SUBTOPICS = [
  { name: "China", count: 12024, color: "#DC2626", description: "Trade tensions, security concerns, diplomatic relations, human rights" },
  { name: "United Nations", count: 9412, color: "#1C4FA0", description: "Peacekeeping, resolutions, multilateral diplomacy, human rights conventions" },
  { name: "Iraq", count: 8591, color: "#E87722", description: "Iraq War (2003), WMD debate, troop deployment, withdrawal" },
  { name: "Afghanistan", count: 5040, color: "#6B21A8", description: "War on Terror, troop deployment, withdrawal, veterans" },
  { name: "Trade Agreements", count: 4560, color: "#00843D", description: "FTAs, TPP/CPTPP, RCEP, bilateral trade deals" },
  { name: "Refugees/Asylum", count: 4052, color: "#0EA5E9", description: "Offshore processing, boat turnbacks, detention, resettlement" },
  { name: "Pacific Islands", count: 1318, color: "#14B8A6", description: "Pacific Step-up, climate aid, security pacts, PEV visas" },
  { name: "AUKUS", count: 185, color: "#FFD700", description: "Nuclear submarines, trilateral security pact, technology sharing" },
];

/* ── Top foreign affairs speakers (real data from parli.db) ── */
const TOP_SPEAKERS = [
  { name: "Alexander Downer", party: "Liberal", speeches: 1562, photoId: "10163", role: "Foreign Minister 1996-2007" },
  { name: "Kevin Rudd", party: "Labor", speeches: 1138, photoId: "10552", role: "PM, former diplomat, Asia expert" },
  { name: "John Howard", party: "Liberal", speeches: 749, photoId: "10270", role: "PM 1996-2007, Iraq War decision-maker" },
  { name: "Julie Bishop", party: "Liberal", speeches: 625, photoId: "10036", role: "Foreign Minister 2013-2018" },
  { name: "Malcolm Turnbull", party: "Liberal", speeches: 501, photoId: "10643", role: "PM, foreign policy moderniser" },
  { name: "Anthony Albanese", party: "Labor", speeches: 478, photoId: "10007", role: "PM, Pacific focus, AUKUS continuation" },
  { name: "Tony Abbott", party: "Liberal", speeches: 476, photoId: "10001", role: "PM, muscular foreign policy" },
  { name: "Joe Hockey", party: "Liberal", speeches: 472, photoId: "10263", role: "Ambassador to US 2016-2020" },
  { name: "Peter Costello", party: "Liberal", speeches: 444, photoId: "10143", role: "Treasurer, economic diplomacy" },
  { name: "Kelvin Thomson", party: "Labor", speeches: 436, photoId: "10709", role: "Foreign affairs committee member" },
  { name: "Julia Gillard", party: "Labor", speeches: 430, photoId: "10212", role: "PM, US alliance, Asia pivot" },
  { name: "Michael Danby", party: "Labor", speeches: 538, photoId: "10150", role: "Middle East and human rights focus" },
];

/* ── TVFY voting policies for foreign affairs ── */
const VOTING_POLICIES = [
  { id: 161, name: "Maintaining/increasing defence spending", description: "Votes on maintaining or increasing Australia's defence budget" },
  { id: 78, name: "Parliamentary approval for military deployments", description: "Whether sending troops abroad should require a vote in Parliament" },
  { id: 87, name: "Withdrawing troops from Afghanistan", description: "Votes on ending Australia's military involvement in Afghanistan" },
  { id: 180, name: "Inquiry into the Iraq War", description: "Whether Australia should hold a formal inquiry into the decision to join the Iraq invasion" },
  { id: 4, name: "Scrutiny of asylum seeker management", description: "Increased oversight of how asylum seekers are treated and processed" },
  { id: 16, name: "Regional processing of asylum seekers", description: "Processing asylum seekers in offshore locations like Nauru and Manus" },
  { id: 174, name: "Turning back asylum boats", description: "Government policy of intercepting and turning back boats carrying asylum seekers" },
  { id: 142, name: "Free Trade Agreement with China", description: "The China-Australia Free Trade Agreement (ChAFTA)" },
  { id: 187, name: "Targeting foreign interference", description: "Legislation aimed at preventing foreign governments from interfering in Australian politics" },
  { id: 319, name: "Pacific Engagement Visa (PEV)", description: "Introducing a new visa category for Pacific Island nationals" },
  { id: 137, name: "Scrutiny of the ADF", description: "Greater public scrutiny and accountability of the Australian Defence Force" },
  { id: 325, name: "Recognising the State of Palestine", description: "Whether Parliament should formally recognise the State of Palestine" },
];

/* ── Defence contractor donations (real data from parli.db) ── */
const DEFENCE_DONORS = [
  { name: "Raytheon Australia", amount: "$3.6M", rawAmount: 3611550, recipients: ["Liberal Party"], note: "US weapons manufacturer. Produces missiles, radar, and cyber systems used by the ADF." },
  { name: "Boeing Australia", amount: "$3.4M", rawAmount: 3417690, recipients: ["BCA", "Unions"], note: "Manufactures F/A-18 Super Hornets, EA-18G Growlers, P-8A Poseidon, and loyal wingman drones for the ADF." },
  { name: "BAE Systems Australia", amount: "$2.1M", rawAmount: 2069916, recipients: ["Liberal Party", "Unions"], note: "Building Hunter-class frigates. Major supplier of armoured vehicles and naval systems." },
  { name: "Thales Australia", amount: "$1.5M", rawAmount: 1549209, recipients: ["Unions"], note: "Builds Bushmaster vehicles and Hawkei protected vehicles used by the ADF." },
  { name: "Tenix Defence Systems", amount: "$399K", rawAmount: 399000, recipients: ["Various"], note: "Former ANZAC-class frigate builder. Now absorbed into BAE Systems." },
  { name: "Kongsberg Defence", amount: "$52K", rawAmount: 51600, recipients: ["Various"], note: "Norwegian defence company. Supplies weapons stations and missile systems." },
  { name: "Lockheed Martin Australia", amount: "$9K", rawAmount: 9000, recipients: ["Various"], note: "Manufactures F-35 Joint Strike Fighter. Relatively small direct political donations." },
];

/* ── Defence donation pie chart data ── */
const DONATION_BY_PARTY = [
  { name: "Liberal/Coalition", value: 4034925, color: "#1C4FA0" },
  { name: "Other entities", value: 5805708, color: "#555555" },
  { name: "Labor", value: 1328346, color: "#E13A3A" },
  { name: "Nationals", value: 142686, color: "#006644" },
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

export default function ForeignPolicyPage() {
  const [showAllPolicies, setShowAllPolicies] = useState(false);
  const [showAllDonors, setShowAllDonors] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => { setHydrated(true); }, []);
  const visiblePolicies = showAllPolicies ? VOTING_POLICIES : VOTING_POLICIES.slice(0, 6);
  const visibleDonors = showAllDonors ? DEFENCE_DONORS : DEFENCE_DONORS.slice(0, 4);

  return (
    <div className="mx-auto max-w-6xl px-6">
      {/* ── Hero ── */}
      <section className="pt-16 pb-12 animate-fade-in-up">
        <p className="text-sm uppercase tracking-[0.2em] text-[#FFD700] mb-4 font-medium">
          Deep Dive &mdash; Investigation
        </p>
        <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-[#e6edf3] leading-[1.1] mb-4 max-w-4xl">
          Foreign Policy:{" "}
          <span className="italic text-[#FFD700]">Follow the Debate</span>
        </h1>
        <p className="text-lg text-[#8b949e] max-w-2xl leading-relaxed mb-10">
          Nearly 49,000 parliamentary speeches on foreign affairs spanning wars,
          trade deals, alliances, and refugee policy. From the Iraq War to AUKUS,
          the parliamentary record reveals how Australia positions itself in the world
          &mdash; and who shapes that positioning.
        </p>

        {/* Key stats bar */}
        {!hydrated ? (
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
                Foreign Affairs Speeches
              </p>
            </div>
            <div className="rounded-xl border border-white/5 bg-[#12121a] p-4 text-center">
              <p className="text-2xl md:text-3xl font-bold text-[#FFD700]">12,024</p>
              <p className="text-xs text-[#8b949e] mt-1 uppercase tracking-wider">
                Mention China
              </p>
            </div>
            <div className="rounded-xl border border-white/5 bg-[#12121a] p-4 text-center">
              <p className="text-2xl md:text-3xl font-bold text-[#FFD700]">$11.3M</p>
              <p className="text-xs text-[#8b949e] mt-1 uppercase tracking-wider">
                Defence Donations
              </p>
            </div>
            <div className="rounded-xl border border-white/5 bg-[#12121a] p-4 text-center">
              <p className="text-2xl md:text-3xl font-bold text-[#FFD700]">12</p>
              <p className="text-xs text-[#8b949e] mt-1 uppercase tracking-wider">
                TVFY Policies Tracked
              </p>
            </div>
          </div>
        )}
      </section>

      {/* ── The Timeline ── */}
      <Section>
        <h2 className="text-2xl md:text-3xl font-bold text-[#e6edf3] mb-2">
          Foreign Affairs Debate Over Time
        </h2>
        <p className="text-sm text-[#8b949e] mb-2 max-w-2xl leading-relaxed">
          Foreign affairs speeches stacked by party. The 2003 peak coincides with
          the Iraq War debate, while 2005&ndash;2006 reflects the broader War on
          Terror and Middle East engagement. Government party dominates when in power.
        </p>
        <p className="text-xs text-[#8b949e]/60 mb-6">
          Source: Hansard topic classification &middot; {totalSpeeches.toLocaleString()} speeches
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
              <ReferenceLine x="2001" stroke="#DC2626" strokeDasharray="3 3" strokeOpacity={0.4} label={{ value: "9/11", fill: "#DC2626", fontSize: 9, position: "top" }} />
              <ReferenceLine x="2003" stroke="#E87722" strokeDasharray="3 3" strokeOpacity={0.5} label={{ value: "Iraq War", fill: "#E87722", fontSize: 9, position: "top" }} />
              <ReferenceLine x="2007" stroke="#FFD700" strokeDasharray="3 3" strokeOpacity={0.3} label={{ value: "Rudd elected", fill: "#FFD700", fontSize: 9, position: "top" }} />
              <ReferenceLine x="2014" stroke="#E87722" strokeDasharray="3 3" strokeOpacity={0.3} label={{ value: "Abbott FP", fill: "#E87722", fontSize: 9, position: "top" }} />
              <ReferenceLine x="2021" stroke="#FFD700" strokeDasharray="3 3" strokeOpacity={0.4} label={{ value: "AUKUS", fill: "#FFD700", fontSize: 9, position: "top" }} />
              <Bar dataKey="ALP" stackId="a" fill="#E13A3A" name="Labor" />
              <Bar dataKey="LIB" stackId="a" fill="#1C4FA0" name="Liberal" />
              <Bar dataKey="GRN" stackId="a" fill="#00843D" name="Greens" />
              <Bar dataKey="NAT" stackId="a" fill="#006644" name="Nationals" />
              <Bar dataKey="IND" stackId="a" fill="#888888" name="Independent" />
              <Bar dataKey="Other" stackId="a" fill="#555555" name="Other" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        )}
      </Section>

      {/* ── Sub-Topics ── */}
      <Section>
        <h2 className="text-2xl md:text-3xl font-bold text-[#e6edf3] mb-2">
          The Sub-Topics
        </h2>
        <p className="text-sm text-[#8b949e] mb-8 max-w-2xl leading-relaxed">
          Foreign policy covers a vast range of issues. Here are the major sub-topics
          by speech count, showing where Parliament focuses its attention.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {SUBTOPICS.map((t) => (
            <div
              key={t.name}
              className="rounded-xl border border-white/5 bg-[#12121a] p-5 hover:border-white/10 transition-colors"
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-bold text-[#e6edf3]">{t.name}</h3>
                <span className="text-xl font-bold" style={{ color: t.color }}>
                  {t.count.toLocaleString()}
                </span>
              </div>
              <div className="h-2 rounded-full bg-white/5 mb-3 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-1000"
                  style={{
                    width: `${(t.count / 12024) * 100}%`,
                    backgroundColor: t.color,
                    opacity: 0.7,
                  }}
                />
              </div>
              <p className="text-sm text-[#8b949e] leading-relaxed">
                {t.description}
              </p>
            </div>
          ))}
        </div>
      </Section>

      {/* ── Key Speakers ── */}
      <Section>
        <h2 className="text-2xl md:text-3xl font-bold text-[#e6edf3] mb-2">
          Key Foreign Policy Voices
        </h2>
        <p className="text-sm text-[#8b949e] mb-8 max-w-2xl leading-relaxed">
          The MPs who shape Australia&rsquo;s foreign policy debate. Foreign Ministers
          and Prime Ministers dominate, but committee members and passionate backbenchers
          also play a significant role.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {TOP_SPEAKERS.map((mp) => {
            const borderColor = partyBorderColors[mp.party] || "#888888";
            return (
              <div
                key={mp.name}
                className="rounded-xl border border-white/5 bg-[#12121a] p-5 hover:border-white/10 transition-colors flex gap-4"
              >
                <div
                  className="w-12 h-12 rounded-full overflow-hidden shrink-0 border-2 bg-[#1a1a2e]"
                  style={{ borderColor }}
                >
                  <img
                    src={`https://www.openaustralia.org.au/images/mps/${mp.photoId}.jpg`}
                    alt={mp.name}
                    className="w-full h-full object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <h3 className="text-sm font-semibold text-[#e6edf3]">
                      {mp.name}
                    </h3>
                    <PartyBadge party={mp.party} />
                  </div>
                  <p className="text-xs text-[#8b949e] mb-0.5">{mp.role}</p>
                  <p className="text-sm text-[#e6edf3]/60">
                    <span className="text-[#FFD700] font-semibold">{mp.speeches.toLocaleString()}</span> speeches
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      {/* ── Voting Record ── */}
      <Section>
        <h2 className="text-2xl md:text-3xl font-bold text-[#e6edf3] mb-2">
          How They Voted
        </h2>
        <p className="text-sm text-[#8b949e] mb-6 max-w-2xl leading-relaxed">
          Key foreign policy voting policies tracked by TheyVoteForYou.org.au. These
          reveal how MPs actually vote on military deployments, trade deals, asylum
          seekers, and international engagement.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {visiblePolicies.map((v) => (
            <div
              key={v.id}
              className="rounded-xl border border-white/5 bg-[#12121a] p-5 hover:border-[#FFD700]/20 transition-colors"
            >
              <p className="text-xs text-[#FFD700]/60 font-mono mb-2">TVFY Policy #{v.id}</p>
              <h3 className="text-sm font-semibold text-[#e6edf3] mb-2">
                {v.name}
              </h3>
              <p className="text-xs text-[#8b949e] leading-relaxed">
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
        {VOTING_POLICIES.length > 6 && (
          <button
            onClick={() => setShowAllPolicies(!showAllPolicies)}
            className="mt-4 text-sm text-[#FFD700] hover:text-[#FFD700]/80 transition-colors"
          >
            {showAllPolicies ? "Show fewer" : `Show all ${VOTING_POLICIES.length} policies`} &rarr;
          </button>
        )}
      </Section>

      {/* ── Defence Donations ── */}
      <Section>
        <h2 className="text-2xl md:text-3xl font-bold text-[#e6edf3] mb-2">
          Defence Industry Money
        </h2>
        <p className="text-sm text-[#8b949e] mb-6 max-w-2xl leading-relaxed">
          Defence contractors donate millions to Australian political parties and
          associated entities. The same companies that build weapons systems lobby
          for increased defence spending and foreign military engagements.
        </p>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Donor cards */}
          <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
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
            {DEFENCE_DONORS.length > 4 && (
              <div className="md:col-span-2">
                <button
                  onClick={() => setShowAllDonors(!showAllDonors)}
                  className="text-sm text-[#FFD700] hover:text-[#FFD700]/80 transition-colors"
                >
                  {showAllDonors ? "Show fewer" : `Show all ${DEFENCE_DONORS.length} donors`} &rarr;
                </button>
              </div>
            )}
          </div>

          {/* Pie chart: by party */}
          <div className="rounded-xl border border-white/5 bg-[#12121a] p-5">
            <h3 className="text-sm font-semibold text-[#e6edf3] mb-4 text-center">
              Defence Donations by Recipient
            </h3>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={DONATION_BY_PARTY}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {DONATION_BY_PARTY.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#12121a",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 8,
                    color: "#e6edf3",
                    fontSize: 12,
                  }}
                  formatter={(value) => [`$${(Number(value) / 1000000).toFixed(1)}M`, ""]}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-2 mt-2">
              {DONATION_BY_PARTY.map((d) => (
                <div key={d.name} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: d.color }} />
                    <span className="text-[#8b949e]">{d.name}</span>
                  </div>
                  <span className="text-[#e6edf3] font-semibold">
                    ${(d.value / 1000000).toFixed(1)}M
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Section>

      {/* ── Key Foreign Policy Moments ── */}
      <Section>
        <h2 className="text-2xl md:text-3xl font-bold text-[#e6edf3] mb-2">
          Defining Moments
        </h2>
        <p className="text-sm text-[#8b949e] mb-8 max-w-2xl leading-relaxed">
          The key foreign policy decisions that shaped modern Australia, as reflected
          in the parliamentary record.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-xl border border-[#DC2626]/20 bg-[#DC2626]/[0.04] p-5">
            <p className="text-xs text-[#DC2626] font-semibold uppercase tracking-wider mb-2">2003</p>
            <h3 className="text-lg font-bold text-[#e6edf3] mb-2">Iraq War</h3>
            <p className="text-sm text-[#8b949e] leading-relaxed">
              8,591 speeches mention Iraq. The decision to join the US-led invasion without
              UN authorisation remains one of Australia&rsquo;s most contentious foreign policy
              decisions. No formal inquiry has ever been held, despite TVFY Policy #180
              tracking votes in favour of one.
            </p>
          </div>
          <div className="rounded-xl border border-[#6B21A8]/20 bg-[#6B21A8]/[0.04] p-5">
            <p className="text-xs text-[#6B21A8] font-semibold uppercase tracking-wider mb-2">2001&ndash;2021</p>
            <h3 className="text-lg font-bold text-[#e6edf3] mb-2">Afghanistan</h3>
            <p className="text-sm text-[#8b949e] leading-relaxed">
              5,040 speeches across two decades. Australia&rsquo;s longest war, from the
              initial deployment after 9/11 to the chaotic withdrawal in 2021. The Brereton
              report into war crimes added another dimension to the parliamentary debate.
            </p>
          </div>
          <div className="rounded-xl border border-[#DC2626]/20 bg-[#DC2626]/[0.04] p-5">
            <p className="text-xs text-[#DC2626] font-semibold uppercase tracking-wider mb-2">Ongoing</p>
            <h3 className="text-lg font-bold text-[#e6edf3] mb-2">China Relations</h3>
            <p className="text-sm text-[#8b949e] leading-relaxed">
              12,024 speeches &mdash; the most-mentioned country in foreign affairs debate.
              From trade partner to strategic competitor, the China relationship has been
              transformed by trade wars, espionage concerns, Uyghur human rights, and
              Pacific security competition.
            </p>
          </div>
          <div className="rounded-xl border border-[#FFD700]/20 bg-[#FFD700]/[0.04] p-5">
            <p className="text-xs text-[#FFD700] font-semibold uppercase tracking-wider mb-2">2021</p>
            <h3 className="text-lg font-bold text-[#e6edf3] mb-2">AUKUS</h3>
            <p className="text-sm text-[#8b949e] leading-relaxed">
              185 speeches so far on the landmark trilateral security pact with the US
              and UK. The nuclear submarine deal represents Australia&rsquo;s biggest
              defence commitment &mdash; estimated at $268&ndash;$368 billion over
              three decades. Bipartisan support, but growing debate over cost and risk.
            </p>
          </div>
          <div className="rounded-xl border border-[#0EA5E9]/20 bg-[#0EA5E9]/[0.04] p-5">
            <p className="text-xs text-[#0EA5E9] font-semibold uppercase tracking-wider mb-2">2001&ndash;Present</p>
            <h3 className="text-lg font-bold text-[#e6edf3] mb-2">Refugees &amp; Asylum</h3>
            <p className="text-sm text-[#8b949e] leading-relaxed">
              4,052 speeches on asylum seekers. From Tampa to offshore processing to
              boat turnbacks, refugee policy has been one of Australia&rsquo;s most
              divisive foreign policy issues. Seven TVFY policies track different
              aspects of this debate.
            </p>
          </div>
          <div className="rounded-xl border border-[#14B8A6]/20 bg-[#14B8A6]/[0.04] p-5">
            <p className="text-xs text-[#14B8A6] font-semibold uppercase tracking-wider mb-2">2016&ndash;Present</p>
            <h3 className="text-lg font-bold text-[#e6edf3] mb-2">Pacific Step-Up</h3>
            <p className="text-sm text-[#8b949e] leading-relaxed">
              1,318 speeches on Pacific Islands. Growing strategic competition with China
              in Australia&rsquo;s traditional sphere of influence has driven increased
              aid, security agreements, and the new Pacific Engagement Visa.
            </p>
          </div>
        </div>
      </Section>

      {/* ── Bottom CTA ── */}
      <Section className="pb-20">
        <div className="rounded-xl border border-[#FFD700]/10 bg-[#FFD700]/[0.03] p-6 md:p-8">
          <p className="text-xs uppercase tracking-[0.2em] text-[#FFD700] mb-3 font-medium">
            The Parliamentary Record
          </p>
          <h2 className="text-2xl md:text-3xl font-bold text-[#e6edf3] mb-3 leading-tight">
            {totalSpeeches.toLocaleString()} Speeches.{" "}
            <span className="italic text-[#FFD700]">$11.3M in Defence Donations.</span>
          </h2>
          <p className="text-[#8b949e] leading-relaxed max-w-3xl mb-6">
            Australia&rsquo;s foreign policy is shaped not just in Parliament, but
            by the defence industry that funds political parties, the intelligence
            agencies that brief ministers, and the alliances that bind us to larger
            powers. OPAX tracks the public record &mdash; the speeches, the votes,
            the money &mdash; so you can follow the debate and hold your representatives
            accountable.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 max-w-2xl">
            <div className="text-center">
              <p className="text-2xl font-bold text-[#FFD700]">48,624</p>
              <p className="text-xs text-[#8b949e] mt-1">Total speeches</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-[#FFD700]">12</p>
              <p className="text-xs text-[#8b949e] mt-1">Policies tracked</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-[#FFD700]">7</p>
              <p className="text-xs text-[#8b949e] mt-1">Defence donors</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-[#FFD700]">1,562</p>
              <p className="text-xs text-[#8b949e] mt-1">Top speaker (Downer)</p>
            </div>
          </div>
        </div>
      </Section>
    </div>
  );
}

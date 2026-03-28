"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { StatCard } from "@/components/stat-card";
import {
  SkeletonCard,
  SkeletonChart,
  SkeletonTable,
  SkeletonText,
} from "@/components/skeleton";

/* ── Real DB data: VIC Hansard speeches (2026 sitting period) ── */
const VIC_STATS = {
  totalSpeeches: 1482,
  sittingDays: 10,
  uniqueSpeakers: 135,
  dateRange: "5 Feb 2026 - 19 Mar 2026",
  chamber: "Legislative Assembly & Council",
};

/* ── Top VIC speakers (non-procedural) ── */
const TOP_SPEAKERS = [
  { name: "Jacinta Allan", party: "Labor", role: "Premier", speeches: 51 },
  { name: "James Newbury", party: "Liberal", role: "Opposition Leader", speeches: 44 },
  { name: "Mary-Anne Thomas", party: "Labor", role: "Minister", speeches: 31 },
  { name: "Nina Taylor", party: "Labor", role: "MLC", speeches: 30 },
  { name: "Jess Wilson", party: "Liberal", role: "Shadow Minister", speeches: 29 },
  { name: "David Southwick", party: "Liberal", role: "Shadow Minister", speeches: 29 },
  { name: "John Lister", party: "Labor", role: "MLA", speeches: 26 },
  { name: "Brad Rowswell", party: "Liberal", role: "Shadow Minister", speeches: 24 },
  { name: "Anthony Cianflone", party: "Labor", role: "MLC", speeches: 23 },
  { name: "Sarah Connolly", party: "Labor", role: "Minister", speeches: 21 },
  { name: "Jade Benham", party: "Nationals", role: "MLA", speeches: 21 },
  { name: "Pauline Richards", party: "Labor", role: "MLA", speeches: 20 },
];

/* ── Topic breakdown from speech text analysis ── */
const TOPIC_DATA = [
  { topic: "Housing & Rent", speeches: 429, color: "#FFD700" },
  { topic: "Transport & Rail", speeches: 209, color: "#3B82F6" },
  { topic: "Integrity & IBAC", speeches: 152, color: "#DC2626" },
  { topic: "Gambling & Casino", speeches: 18, color: "#10B981" },
];

/* ── VIC donation data: major party totals ── */
const VIC_PARTY_DONATIONS = [
  { party: "Liberal (VIC)", amount: 717144048, color: "#1C4FA0" },
  { party: "Labor (VIC)", amount: 545715627, color: "#E13A3A" },
  { party: "Nationals (VIC)", amount: 93545895, color: "#F59E0B" },
  { party: "Greens (VIC)", amount: 93229470, color: "#00843D" },
];

/* ── Crown & gambling industry donations to VIC parties ── */
const GAMBLING_VIC_DONATIONS = [
  { donor: "Tabcorp Holdings", total: 4257384, recipients: "Liberal + Labor" },
  { donor: "Crown Resorts / Melbourne", total: 3515955, recipients: "Liberal + Labor" },
  { donor: "Sportsbet", total: 345000, recipients: "Liberal + Labor" },
  { donor: "Responsible Wagering Aust.", total: 270000, recipients: "Liberal + Labor" },
];

/* ── Top VIC donors ── */
const TOP_VIC_DONORS = [
  { name: "Cormack Foundation", total: 154162050, recipient: "Liberal (VIC)", type: "Associated Entity" },
  { name: "Victorian Electoral Commission", total: 293858982, recipient: "Labor + Liberal", type: "Public Funding" },
  { name: "Vapold Pty Ltd", total: 83370324, recipient: "Liberal (VIC)", type: "Associated Entity" },
  { name: "Incolink", total: 179738817, recipient: "CFMEU VIC/TAS", type: "Industry Fund" },
  { name: "SDA Victoria", total: 89719593, recipient: "SDA National", type: "Union" },
];

const partyColorMap: Record<string, string> = {
  Labor: "#E13A3A",
  Liberal: "#1C4FA0",
  Nationals: "#F59E0B",
  Greens: "#00843D",
  Independent: "#8B5CF6",
};

/* ── IBAC investigations ── */
const IBAC_INVESTIGATIONS = [
  {
    name: "Operation Sandon",
    year: "2019-2021",
    summary: "Casey City Council corruption. Developer John Woodman paid councillors for favourable planning decisions. Multiple convictions.",
  },
  {
    name: "Operation Watts",
    year: "2021-2022",
    summary: "Misuse of public resources by Labor MPs Adem Somyurek, Marlene Kairouz, and others. Branch stacking and electorate officer misuse.",
  },
  {
    name: "Operation Daintree",
    year: "2023",
    summary: "Investigation into Department of Transport procurement and conflicts of interest in major infrastructure projects.",
  },
];

/* ── Crown Royal Commission timeline ── */
const CROWN_TIMELINE = [
  { year: "1994", event: "Crown Melbourne opens at Southbank, granted sole casino licence by Kennett government." },
  { year: "2000s", event: "Crown expands VIP gambling program, attracting high-rollers from China." },
  { year: "2019", event: "60 Minutes, The Age and SMH expose money laundering, junket links to organised crime." },
  { year: "2021", event: "Royal Commission into Crown Melbourne established by Andrews government." },
  { year: "2021", event: "Commissioner Ray Finkelstein finds Crown unsuitable to hold casino licence." },
  { year: "2022", event: "Crown agrees to $450M penalty, appoints special manager. Major board and exec overhaul." },
  { year: "2023", event: "Star Entertainment Group deal to acquire Crown collapses. VGCCC oversight continues." },
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
      className={`transition-all duration-700 ease-out ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"} ${className}`}
    >
      {children}
    </section>
  );
}

export default function VictoriaPage() {
  const [activeTopic, setActiveTopic] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => { setHydrated(true); }, []);

  return (
    <div className="mx-auto max-w-6xl px-6">
      {/* Hero */}
      <section className="pt-20 pb-16 animate-fade-in-up">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-xs uppercase tracking-[0.2em] text-[#FFD700] font-medium px-3 py-1 rounded-full border border-[#FFD700]/20 bg-[#FFD700]/5">
            State Investigation
          </span>
          <span className="text-xs text-[#8b949e]">Victoria</span>
        </div>
        <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.05] mb-6">
          <span className="text-[#e6edf3]">Victorian Parliament:</span>
          <br />
          <span style={{ color: "#FFD700" }}>
            Your State Representatives Under the Microscope
          </span>
        </h1>
        <p className="text-lg md:text-xl text-[#8b949e] max-w-3xl leading-relaxed mb-4">
          Spring Street is where the decisions that shape your daily life are made --
          housing costs, transport, healthcare, gambling regulation, and government
          integrity. OPAX is tracking what your Victorian MPs say and how they vote.
        </p>
        <p className="text-sm text-[#8b949e]/60 max-w-2xl leading-relaxed">
          Data sourced from Victorian Hansard via the Parliament of Victoria and
          AEC/VEC donation disclosures. Updated as new sitting days are published.
        </p>
      </section>

      {/* Stats Row */}
      <section className="pb-12 animate-fade-in-up stagger-1">
        {!hydrated ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-fade-in-up">
            <StatCard
              label="VIC Speeches"
              value={VIC_STATS.totalSpeeches.toLocaleString()}
              trendLabel="2026 sitting period"
              trend="neutral"
            />
            <StatCard
              label="Sitting Days"
              value={VIC_STATS.sittingDays}
              trendLabel={VIC_STATS.dateRange}
              trend="neutral"
            />
            <StatCard
              label="Unique Speakers"
              value={VIC_STATS.uniqueSpeakers}
              trendLabel="MPs and MLCs recorded"
              trend="neutral"
            />
            <StatCard
              label="Total VIC Donations"
              value="$1.45B+"
              trendLabel="All disclosed (1998-2024)"
              trend="neutral"
            />
          </div>
        )}
      </section>

      {/* Key VIC Issues */}
      <section className="pb-16 animate-fade-in-up stagger-2">
        <h2 className="text-xs uppercase tracking-[0.2em] text-[#FFD700] mb-6 font-medium">
          Key Victorian Issues
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Housing */}
          <div className="rounded-xl border border-white/5 bg-[#12121a] p-6 group hover:border-[#FFD700]/20 transition-all">
            <div className="flex items-start justify-between mb-3">
              <span className="text-2xl">🏠</span>
              <span className="text-[10px] font-bold tracking-wider px-2 py-0.5 rounded-full text-[#DC2626] bg-[rgba(220,38,38,0.1)]">
                HIGH DISCONNECT
              </span>
            </div>
            <h3 className="text-lg font-semibold text-[#e6edf3] mb-2">
              Melbourne Housing Crisis
            </h3>
            <p className="text-sm text-[#8b949e] mb-2">
              <span style={{ color: "#FFD700" }}>429 speeches</span> mention housing, rent, or affordability in the current sitting period alone.
            </p>
            <p className="text-sm text-[#8b949e]/80 leading-relaxed">
              Melbourne median house prices exceed $900K. Rental vacancy rates sit below 1%.
              MPs speak passionately about housing affordability while investor tax concessions
              remain untouched and planning reform stalls.
            </p>
          </div>

          {/* Transport */}
          <div className="rounded-xl border border-white/5 bg-[#12121a] p-6 group hover:border-[#FFD700]/20 transition-all">
            <div className="flex items-start justify-between mb-3">
              <span className="text-2xl">🚆</span>
              <span className="text-[10px] font-bold tracking-wider px-2 py-0.5 rounded-full text-[#FFD700] bg-[rgba(255,215,0,0.1)]">
                MEDIUM DISCONNECT
              </span>
            </div>
            <h3 className="text-lg font-semibold text-[#e6edf3] mb-2">
              Transport & Suburban Rail Loop
            </h3>
            <p className="text-sm text-[#8b949e] mb-2">
              <span style={{ color: "#FFD700" }}>209 speeches</span> on transport, rail, and level crossings.
            </p>
            <p className="text-sm text-[#8b949e]/80 leading-relaxed">
              The Suburban Rail Loop is Victoria&apos;s largest ever infrastructure project at $35B+.
              Level crossing removals continue apace. But V/Line reliability remains poor and
              regional connectivity lags behind rhetoric.
            </p>
          </div>

          {/* Integrity */}
          <div className="rounded-xl border border-white/5 bg-[#12121a] p-6 group hover:border-[#FFD700]/20 transition-all">
            <div className="flex items-start justify-between mb-3">
              <span className="text-2xl">🔍</span>
              <span className="text-[10px] font-bold tracking-wider px-2 py-0.5 rounded-full text-[#DC2626] bg-[rgba(220,38,38,0.1)]">
                HIGH DISCONNECT
              </span>
            </div>
            <h3 className="text-lg font-semibold text-[#e6edf3] mb-2">
              IBAC & Government Integrity
            </h3>
            <p className="text-sm text-[#8b949e] mb-2">
              <span style={{ color: "#FFD700" }}>152 speeches</span> referencing IBAC, corruption, or integrity.
            </p>
            <p className="text-sm text-[#8b949e]/80 leading-relaxed">
              Victoria&apos;s Independent Broad-based Anti-corruption Commission has exposed
              serious misconduct. Yet its funding has been cut and its powers remain
              weaker than comparable bodies in NSW (ICAC) and Queensland (CCC).
            </p>
          </div>

          {/* Gambling */}
          <Link
            href="/gambling"
            className="rounded-xl border border-white/5 bg-[#12121a] p-6 group hover:border-[#FFD700]/20 transition-all"
          >
            <div className="flex items-start justify-between mb-3">
              <span className="text-2xl">🎰</span>
              <span className="text-[10px] font-bold tracking-wider px-2 py-0.5 rounded-full text-[#DC2626] bg-[rgba(220,38,38,0.1)]">
                HIGH DISCONNECT
              </span>
            </div>
            <h3 className="text-lg font-semibold text-[#e6edf3] mb-2 group-hover:text-[#FFD700] transition-colors">
              Crown Casino & Gambling
            </h3>
            <p className="text-sm text-[#8b949e] mb-2">
              <span style={{ color: "#FFD700" }}>18 speeches</span> on gambling, pokies, and casinos this sitting.
            </p>
            <p className="text-sm text-[#8b949e]/80 leading-relaxed">
              Crown Melbourne was found unsuitable to hold its casino licence.
              $8.4M+ in gambling industry donations flowed to Victorian parties.
              Read the full investigation &rarr;
            </p>
          </Link>
        </div>
      </section>

      {/* Topic Bar Chart */}
      <Section className="pb-16">
        <h2 className="text-xs uppercase tracking-[0.2em] text-[#FFD700] mb-2 font-medium">
          What Victorian Parliament Is Talking About
        </h2>
        <p className="text-sm text-[#8b949e] mb-6">
          Topic mentions in {VIC_STATS.totalSpeeches.toLocaleString()} speeches from the 2026 sitting period
        </p>
        {!hydrated ? (
          <SkeletonChart height={340} />
        ) : (
        <div className="rounded-xl border border-white/5 bg-[#12121a] p-6 animate-fade-in-up">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={TOPIC_DATA} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
              <XAxis type="number" tick={{ fill: "#8b949e", fontSize: 12 }} />
              <YAxis
                type="category"
                dataKey="topic"
                tick={{ fill: "#8b949e", fontSize: 12 }}
                width={140}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#12121a",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 8,
                  color: "#e6edf3",
                }}
              />
              <Bar dataKey="speeches" radius={[0, 4, 4, 0]}>
                {TOPIC_DATA.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        )}
      </Section>

      {/* Top Speakers */}
      <Section className="pb-16">
        <h2 className="text-xs uppercase tracking-[0.2em] text-[#FFD700] mb-2 font-medium">
          Most Active Victorian MPs
        </h2>
        <p className="text-sm text-[#8b949e] mb-6">
          Ranked by number of speeches in the current sitting period
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {TOP_SPEAKERS.map((mp, i) => (
            <div
              key={mp.name}
              className="flex items-center gap-4 rounded-lg border border-white/5 bg-[#12121a] p-4 hover:border-white/10 transition-all"
            >
              <div
                className="flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold shrink-0"
                style={{
                  backgroundColor:
                    i < 3 ? "rgba(255,215,0,0.15)" : "rgba(255,255,255,0.05)",
                  color: i < 3 ? "#FFD700" : "#8b949e",
                }}
              >
                {i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-[#e6edf3] truncate">
                    {mp.name}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span
                    className="text-xs px-1.5 py-0.5 rounded font-medium"
                    style={{
                      color: partyColorMap[mp.party] || "#8b949e",
                      backgroundColor: `${partyColorMap[mp.party] || "#8b949e"}15`,
                    }}
                  >
                    {mp.party}
                  </span>
                  <span className="text-xs text-[#8b949e]">{mp.role}</span>
                </div>
              </div>
              <div className="text-right shrink-0">
                <span className="text-lg font-serif text-[#e6edf3]">
                  {mp.speeches}
                </span>
                <p className="text-[10px] text-[#8b949e]">speeches</p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Crown Casino Section */}
      <Section className="pb-16">
        <div className="rounded-xl border border-[#DC2626]/15 bg-[#DC2626]/[0.03] p-6 md:p-8">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-xs uppercase tracking-[0.2em] text-[#DC2626] font-medium px-3 py-1 rounded-full border border-[#DC2626]/20 bg-[#DC2626]/5">
              Deep Dive
            </span>
          </div>
          <h2 className="text-2xl md:text-3xl font-bold text-[#e6edf3] mb-2 leading-tight">
            Crown Melbourne:{" "}
            <span className="italic text-[#DC2626]">
              Regulatory Capture in Action
            </span>
          </h2>
          <p className="text-[#8b949e] leading-relaxed max-w-3xl mb-6">
            The story of Crown Melbourne is the story of how political donations
            and lobbying can undermine the very regulators meant to protect the public.
            A royal commission found Crown unsuitable to hold its casino licence after
            decades of failures -- money laundering, junket links to organised crime,
            and a regulator that looked the other way.
          </p>

          {/* Crown Timeline */}
          <div className="space-y-4 mb-6">
            {CROWN_TIMELINE.map((item, i) => (
              <div key={i} className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div
                    className="w-3 h-3 rounded-full shrink-0 mt-1"
                    style={{
                      backgroundColor: i >= 4 ? "#DC2626" : "#FFD700",
                    }}
                  />
                  {i < CROWN_TIMELINE.length - 1 && (
                    <div className="w-px flex-1 bg-white/10 mt-1" />
                  )}
                </div>
                <div className="pb-4">
                  <span
                    className="text-xs font-bold tracking-wider"
                    style={{ color: i >= 4 ? "#DC2626" : "#FFD700" }}
                  >
                    {item.year}
                  </span>
                  <p className="text-sm text-[#8b949e] mt-1 leading-relaxed">
                    {item.event}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Gambling Donations */}
          <h3 className="text-lg font-semibold text-[#e6edf3] mb-4">
            Gambling Industry Donations to Victorian Parties
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
            {GAMBLING_VIC_DONATIONS.map((d) => (
              <div
                key={d.donor}
                className="flex items-center justify-between rounded-lg border border-white/5 bg-[#0a0a0f] p-4"
              >
                <div>
                  <p className="text-sm font-semibold text-[#e6edf3]">
                    {d.donor}
                  </p>
                  <p className="text-xs text-[#8b949e]">{d.recipients}</p>
                </div>
                <span className="text-lg font-serif" style={{ color: "#FFD700" }}>
                  ${(d.total / 1_000_000).toFixed(1)}M
                </span>
              </div>
            ))}
          </div>
          <p className="text-xs text-[#8b949e]/60">
            Total gambling industry donations to VIC parties: $8.4M+ (AEC disclosures 1998-2024).
            Includes Tabcorp, Crown entities, Sportsbet, and RWA.
          </p>
        </div>
      </Section>

      {/* IBAC Section */}
      <Section className="pb-16">
        <div className="rounded-xl border border-[#FFD700]/15 bg-[#FFD700]/[0.03] p-6 md:p-8">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-xs uppercase tracking-[0.2em] text-[#FFD700] font-medium">
              Accountability Watch
            </span>
          </div>
          <h2 className="text-2xl md:text-3xl font-bold text-[#e6edf3] mb-2 leading-tight">
            IBAC: Victoria&apos;s Anti-Corruption Body
          </h2>
          <p className="text-[#8b949e] leading-relaxed max-w-3xl mb-6">
            The Independent Broad-based Anti-corruption Commission was established in 2012
            to investigate and expose public sector corruption in Victoria. Its investigations
            have uncovered systemic issues -- but ongoing questions about its funding, powers,
            and independence remain.
          </p>

          <div className="space-y-4">
            {IBAC_INVESTIGATIONS.map((inv) => (
              <div
                key={inv.name}
                className="rounded-lg border border-white/5 bg-[#0a0a0f] p-5"
              >
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="text-base font-semibold text-[#e6edf3]">
                    {inv.name}
                  </h3>
                  <span className="text-xs text-[#FFD700] font-mono">
                    {inv.year}
                  </span>
                </div>
                <p className="text-sm text-[#8b949e] leading-relaxed">
                  {inv.summary}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-6 p-4 rounded-lg border border-[#FFD700]/10 bg-[#FFD700]/[0.02]">
            <p className="text-sm text-[#8b949e] leading-relaxed">
              <span className="font-semibold text-[#FFD700]">152 parliamentary speeches</span>{" "}
              in the current sitting period reference IBAC, corruption, or integrity.
              OPAX is tracking whether parliamentary rhetoric on integrity translates
              to stronger powers and funding for Victoria&apos;s watchdog.
            </p>
          </div>
        </div>
      </Section>

      {/* VIC Donation Breakdown */}
      <Section className="pb-16">
        <h2 className="text-xs uppercase tracking-[0.2em] text-[#FFD700] mb-2 font-medium">
          Victorian Donation Landscape
        </h2>
        <p className="text-sm text-[#8b949e] mb-6">
          Total disclosed donations to Victorian party branches (AEC data 1998-2024)
        </p>

        {!hydrated ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <SkeletonChart height={320} />
            <SkeletonTable rows={5} cols={3} />
          </div>
        ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-in-up">
          {/* Party Donations Chart */}
          <div className="rounded-xl border border-white/5 bg-[#12121a] p-6">
            <h3 className="text-sm font-semibold text-[#e6edf3] mb-4">
              Major Party Branches
            </h3>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={VIC_PARTY_DONATIONS}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
                <XAxis
                  dataKey="party"
                  tick={{ fill: "#8b949e", fontSize: 11 }}
                  interval={0}
                />
                <YAxis
                  tick={{ fill: "#8b949e", fontSize: 11 }}
                  tickFormatter={(v) => `$${(v / 1_000_000).toFixed(0)}M`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#12121a",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 8,
                    color: "#e6edf3",
                  }}
                  formatter={(value) => [
                    `$${(Number(value) / 1_000_000).toFixed(1)}M`,
                    "Total Donations",
                  ]}
                />
                <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
                  {VIC_PARTY_DONATIONS.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Top Donors */}
          <div className="rounded-xl border border-white/5 bg-[#12121a] p-6">
            <h3 className="text-sm font-semibold text-[#e6edf3] mb-4">
              Largest VIC Donors / Entities
            </h3>
            <div className="space-y-3">
              {TOP_VIC_DONORS.map((d) => (
                <div
                  key={d.name}
                  className="flex items-center justify-between py-2 border-b border-white/5 last:border-0"
                >
                  <div>
                    <p className="text-sm font-medium text-[#e6edf3]">
                      {d.name}
                    </p>
                    <p className="text-xs text-[#8b949e]">
                      {d.type} &middot; {d.recipient}
                    </p>
                  </div>
                  <span
                    className="text-base font-serif shrink-0 ml-4"
                    style={{ color: "#FFD700" }}
                  >
                    ${(d.total / 1_000_000).toFixed(0)}M
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
        )}

        <p className="text-xs text-[#8b949e]/50 mt-4">
          Donation figures include all AEC-disclosed receipts where donor or recipient is
          associated with Victoria. Includes public funding, associated entities, unions, and
          private donors. Amounts are cumulative 1998-2024.
        </p>
      </Section>

      {/* Your Local MP */}
      <Section className="pb-20">
        <div className="rounded-xl border border-white/5 bg-[#12121a] p-6 md:p-8 text-center">
          <h2 className="text-2xl md:text-3xl font-bold text-[#e6edf3] mb-3">
            Find Your Victorian MP
          </h2>
          <p className="text-[#8b949e] max-w-xl mx-auto mb-6 leading-relaxed">
            Search for your local electorate to see how your representative speaks,
            votes, and who funds their campaigns.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center max-w-md mx-auto">
            <Link
              href="/electorates"
              className="inline-flex items-center justify-center gap-2 rounded-lg px-6 py-3 text-sm font-medium transition-colors"
              style={{ backgroundColor: "#FFD700", color: "#0a0a0f" }}
            >
              Browse Victorian Electorates
              <span aria-hidden="true">&rarr;</span>
            </Link>
            <Link
              href="/politicians"
              className="inline-flex items-center justify-center gap-2 rounded-lg px-6 py-3 text-sm font-medium border border-white/10 text-[#e6edf3] hover:bg-white/5 transition-colors"
            >
              Search All Politicians
            </Link>
          </div>
        </div>
      </Section>
    </div>
  );
}

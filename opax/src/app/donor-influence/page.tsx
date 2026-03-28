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
  Cell,
} from "recharts";
import { PartyBadge } from "@/components/party-badge";
import { StatCard } from "@/components/stat-card";
import {
  SkeletonCard,
  SkeletonChart,
  SkeletonTable,
} from "@/components/skeleton";

/* ── Types ── */

interface InfluenceScore {
  party: string;
  industry: string;
  total_donated: number;
  relevant_divisions: number;
  divisions_with_votes: number;
  total_votes_cast: number;
  aye_count: number;
  no_count: number;
  favorable_vote_pct: number;
  influence_score: number;
  updated_at: string;
}

interface IndustrySummary {
  industry: string;
  avg_score: number;
  total_donated: number;
  avg_aye_pct: number;
  party_count: number;
}

interface MpScore {
  person_id: string;
  full_name: string;
  party: string;
  industry: string;
  party_donations_from_industry: number;
  divisions_voted: number;
  aye_count: number;
  no_count: number;
  favorable_vote_pct: number;
  influence_score: number;
}

interface ApiResponse {
  scores: InfluenceScore[];
  count: number;
  industry_summary: IndustrySummary[];
}

interface PartyResponse {
  party: string;
  scores: InfluenceScore[];
  count: number;
  top_mps: MpScore[];
}

/* ── Constants ── */

import { API_BASE } from "@/lib/utils";
const API = API_BASE;

const PARTY_COLORS: Record<string, string> = {
  "Australian Labor Party": "#E13A3A",
  "Liberal Party": "#1C4FA0",
  "Australian Greens": "#00843D",
  "National Party": "#006644",
  "United Australia Party": "#FFD700",
  "Pauline Hanson's One Nation Party": "#FF6600",
  "Centre Alliance": "#8B5CF6",
  "Katter's Australian Party": "#B45309",
  "Independent": "#888888",
};

const PARTY_SHORT: Record<string, string> = {
  "Australian Labor Party": "ALP",
  "Liberal Party": "LIB",
  "Australian Greens": "GRN",
  "National Party": "NAT",
  "United Australia Party": "UAP",
  "Pauline Hanson's One Nation Party": "ON",
  "Centre Alliance": "CA",
  "Katter's Australian Party": "KAP",
  "Independent": "IND",
};

const INDUSTRY_LABELS: Record<string, string> = {
  gambling: "Gambling",
  mining: "Mining",
  fossil_fuels: "Fossil Fuels",
  property: "Property",
  finance: "Finance",
  health: "Health",
  education: "Education",
  agriculture: "Agriculture",
  media: "Media",
  telecom: "Telecom",
  transport: "Transport",
  defence: "Defence",
  alcohol: "Alcohol",
  tobacco: "Tobacco",
  unions: "Unions",
  tech: "Tech",
  lobbying: "Lobbying",
};

/* ── Helpers ── */

const fmt = (n: number) => {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
};

const shortParty = (p: string) => PARTY_SHORT[p] || p.split(" ")[0];
const labelIndustry = (i: string) => INDUSTRY_LABELS[i] || i.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const partyColor = (p: string) => PARTY_COLORS[p] || "#8b949e";

/* ── Scroll reveal hook ── */

function useScrollReveal() {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
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

/* ── Score intensity color ── */

function scoreColor(score: number): string {
  if (score >= 4) return "#DC2626";
  if (score >= 3) return "#F97316";
  if (score >= 2) return "#FFD700";
  if (score >= 1) return "#22C55E";
  return "#8b949e";
}

function scoreBg(score: number): string {
  if (score >= 4) return "rgba(220, 38, 38, 0.15)";
  if (score >= 3) return "rgba(249, 115, 22, 0.12)";
  if (score >= 2) return "rgba(255, 215, 0, 0.10)";
  if (score >= 1) return "rgba(34, 197, 94, 0.08)";
  return "rgba(139, 148, 158, 0.05)";
}

/* ── Heatmap Cell ── */

function HeatmapCell({
  score,
  donated,
  party,
  industry,
  onClick,
}: {
  score: number;
  donated: number;
  party: string;
  industry: string;
  onClick: () => void;
}) {
  const intensity = Math.min(score / 5, 1);
  const bg =
    score === 0
      ? "rgba(255,255,255,0.02)"
      : `rgba(255, 215, 0, ${0.05 + intensity * 0.4})`;
  const border =
    score >= 4
      ? "border-[#DC2626]/40"
      : score >= 3
        ? "border-[#F97316]/30"
        : score >= 2
          ? "border-[#FFD700]/20"
          : "border-white/5";

  return (
    <button
      onClick={onClick}
      className={`relative group rounded-md border ${border} p-2 text-center transition-all duration-200 hover:scale-105 hover:z-10 hover:shadow-lg cursor-pointer min-w-[60px]`}
      style={{ backgroundColor: bg }}
      title={`${labelIndustry(industry)} -> ${shortParty(party)}: score ${score.toFixed(2)}, ${fmt(donated)}`}
    >
      <span
        className="block text-sm font-bold"
        style={{ color: score === 0 ? "#8b949e40" : scoreColor(score) }}
      >
        {score > 0 ? score.toFixed(1) : "-"}
      </span>
      {donated > 0 && (
        <span className="block text-[10px] text-[#8b949e] mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          {fmt(donated)}
        </span>
      )}
    </button>
  );
}

/* ── Main Page ── */

export default function DonorInfluencePage() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedParty, setSelectedParty] = useState<string | null>(null);
  const [partyData, setPartyData] = useState<PartyResponse | null>(null);
  const [partyLoading, setPartyLoading] = useState(false);
  const [selectedIndustry, setSelectedIndustry] = useState<string | null>(null);

  /* ── Fetch main data ── */
  useEffect(() => {
    fetch(`${API}/api/donor-influence?limit=500`)
      .then((r) => r.json())
      .then((d: ApiResponse) => {
        setData(d);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  /* ── Fetch party drill-down ── */
  const fetchParty = useCallback((party: string) => {
    setSelectedParty(party);
    setSelectedIndustry(null);
    setPartyLoading(true);
    fetch(`${API}/api/donor-influence/${encodeURIComponent(party)}`)
      .then((r) => r.json())
      .then((d: PartyResponse) => {
        setPartyData(d);
        setPartyLoading(false);
      })
      .catch(() => setPartyLoading(false));
  }, []);

  /* ── Derived data ── */
  const scores = data?.scores || [];
  const industrySummary = data?.industry_summary || [];

  // Unique parties and industries for the matrix
  const parties = [...new Set(scores.map((s) => s.party))].sort();
  const industries = [...new Set(scores.map((s) => s.industry))].sort(
    (a, b) => {
      const aMax = Math.max(...scores.filter((s) => s.industry === a).map((s) => s.influence_score), 0);
      const bMax = Math.max(...scores.filter((s) => s.industry === b).map((s) => s.influence_score), 0);
      return bMax - aMax;
    }
  );

  // Build lookup for heatmap
  const scoreLookup: Record<string, InfluenceScore> = {};
  for (const s of scores) {
    scoreLookup[`${s.industry}|${s.party}`] = s;
  }

  // Top correlations
  const topCorrelations = [...scores]
    .filter((s) => s.influence_score > 0)
    .sort((a, b) => b.influence_score - a.influence_score)
    .slice(0, 12);

  // Stats
  const strongest = topCorrelations[0];
  const weakest = [...scores]
    .filter((s) => s.influence_score > 0 && s.divisions_with_votes > 0)
    .sort((a, b) => a.influence_score - b.influence_score)[0];
  const totalDonated = scores.reduce((sum, s) => sum + s.total_donated, 0);

  // Industry spotlight data
  const industryScores = selectedIndustry
    ? scores
        .filter((s) => s.industry === selectedIndustry)
        .sort((a, b) => b.influence_score - a.influence_score)
    : [];

  return (
    <div className="mx-auto max-w-6xl px-6">
      {/* ── Hero ── */}
      <section className="pt-16 pb-12 animate-fade-in-up">
        <p className="text-sm uppercase tracking-[0.2em] text-[#FFD700] mb-4 font-medium">
          Cross-Cutting Analysis
        </p>
        <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-[#e6edf3] leading-[1.1] mb-4 max-w-4xl">
          Follow the Money:{" "}
          <span className="italic text-[#FFD700]">Donor Influence</span>
        </h1>
        <p className="text-lg text-[#8b949e] max-w-2xl leading-relaxed mb-10">
          How do industry donations correlate with parliamentary votes? This
          analysis maps the relationship between who donates to which parties and
          how those parties vote on related legislation.
        </p>

        {/* Stat cards */}
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 animate-fade-in-up">
            <StatCard
              label="Correlations Analyzed"
              value={scores.length}
              icon={
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              }
            />
            <StatCard
              label="Total Donated"
              value={fmt(totalDonated)}
              icon={
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              }
            />
            <StatCard
              label="Strongest Link"
              value={strongest ? `${strongest.influence_score.toFixed(1)}` : "-"}
              trendLabel={strongest ? `${labelIndustry(strongest.industry)} / ${shortParty(strongest.party)}` : undefined}
              trend="up"
              icon={
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              }
            />
            <StatCard
              label="Weakest Link"
              value={weakest ? `${weakest.influence_score.toFixed(1)}` : "-"}
              trendLabel={weakest ? `${labelIndustry(weakest.industry)} / ${shortParty(weakest.party)}` : undefined}
              trend="down"
              icon={
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
                </svg>
              }
            />
          </div>
        )}
      </section>

      {/* ── Influence Heatmap ── */}
      <Section>
        <h2 className="text-2xl md:text-3xl font-bold text-[#e6edf3] mb-2">
          Influence Matrix
        </h2>
        <p className="text-sm text-[#8b949e] mb-6 max-w-2xl leading-relaxed">
          Each cell shows the influence score: how strongly donations from an
          industry correlate with favorable votes by that party. Click any cell,
          row, or column header to drill down.
        </p>

        {loading ? (
          <SkeletonTable rows={8} cols={6} />
        ) : parties.length === 0 ? (
          <div className="rounded-xl border border-white/5 bg-[#12121a] p-8 text-center">
            <p className="text-[#8b949e]">No influence data available. Run the analysis pipeline first.</p>
          </div>
        ) : (
          <div className="rounded-xl border border-white/5 bg-[#12121a] overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-[#12121a] px-4 py-3 text-left text-xs uppercase tracking-wider text-[#8b949e] border-b border-white/5">
                    Industry
                  </th>
                  {parties.map((party) => (
                    <th
                      key={party}
                      className="px-2 py-3 text-center border-b border-white/5 cursor-pointer hover:bg-white/5 transition-colors"
                      onClick={() => fetchParty(party)}
                    >
                      <span
                        className="text-xs font-bold"
                        style={{ color: partyColor(party) }}
                      >
                        {shortParty(party)}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {industries.map((industry) => (
                  <tr
                    key={industry}
                    className={`border-b border-white/[0.03] transition-colors ${
                      selectedIndustry === industry
                        ? "bg-[#FFD700]/5"
                        : "hover:bg-white/[0.02]"
                    }`}
                  >
                    <td
                      className="sticky left-0 z-10 bg-[#12121a] px-4 py-2 text-sm text-[#e6edf3] cursor-pointer hover:text-[#FFD700] transition-colors whitespace-nowrap"
                      onClick={() =>
                        setSelectedIndustry(
                          selectedIndustry === industry ? null : industry
                        )
                      }
                    >
                      {labelIndustry(industry)}
                    </td>
                    {parties.map((party) => {
                      const entry = scoreLookup[`${industry}|${party}`];
                      return (
                        <td key={party} className="px-1 py-1">
                          <HeatmapCell
                            score={entry?.influence_score || 0}
                            donated={entry?.total_donated || 0}
                            party={party}
                            industry={industry}
                            onClick={() => {
                              fetchParty(party);
                              setSelectedIndustry(industry);
                            }}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Legend */}
            <div className="flex items-center gap-4 px-4 py-3 border-t border-white/5 text-xs text-[#8b949e]">
              <span>Score:</span>
              {[
                { label: "Low (0-1)", color: "#8b949e" },
                { label: "Moderate (1-2)", color: "#22C55E" },
                { label: "Notable (2-3)", color: "#FFD700" },
                { label: "High (3-4)", color: "#F97316" },
                { label: "Very High (4+)", color: "#DC2626" },
              ].map((l) => (
                <span key={l.label} className="flex items-center gap-1.5">
                  <span
                    className="w-3 h-3 rounded-sm"
                    style={{ backgroundColor: l.color }}
                  />
                  {l.label}
                </span>
              ))}
            </div>
          </div>
        )}
      </Section>

      {/* ── Top Correlations ── */}
      <Section>
        <h2 className="text-2xl md:text-3xl font-bold text-[#e6edf3] mb-2">
          Strongest Correlations
        </h2>
        <p className="text-sm text-[#8b949e] mb-6 max-w-2xl leading-relaxed">
          The party-industry pairs with the highest influence scores --
          where donations most strongly correlate with favorable voting.
        </p>

        {loading ? (
          <SkeletonTable rows={6} cols={5} />
        ) : (
          <div className="space-y-2">
            {topCorrelations.map((s, i) => (
              <button
                key={`${s.party}-${s.industry}`}
                onClick={() => {
                  fetchParty(s.party);
                  setSelectedIndustry(s.industry);
                }}
                className="w-full flex items-center gap-4 rounded-lg border border-white/5 bg-[#12121a] p-4 hover:border-[#FFD700]/15 transition-all duration-200 group text-left cursor-pointer"
              >
                {/* Rank */}
                <span className="text-lg font-bold text-[#8b949e]/40 w-8 shrink-0 text-right">
                  {i + 1}
                </span>

                {/* Industry arrow Party */}
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <span className="text-sm font-semibold text-[#e6edf3] truncate">
                    {labelIndustry(s.industry)}
                  </span>
                  <svg className="w-4 h-4 text-[#8b949e] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                  </svg>
                  <PartyBadge party={shortParty(s.party)} />
                </div>

                {/* Score bar */}
                <div className="hidden md:flex items-center gap-3 shrink-0 w-48">
                  <div className="flex-1 h-2 rounded-full bg-white/5 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.min((s.influence_score / 6) * 100, 100)}%`,
                        backgroundColor: scoreColor(s.influence_score),
                      }}
                    />
                  </div>
                  <span
                    className="text-sm font-bold w-10 text-right"
                    style={{ color: scoreColor(s.influence_score) }}
                  >
                    {s.influence_score.toFixed(2)}
                  </span>
                </div>

                {/* Mobile score */}
                <span
                  className="md:hidden text-sm font-bold shrink-0"
                  style={{ color: scoreColor(s.influence_score) }}
                >
                  {s.influence_score.toFixed(2)}
                </span>

                {/* Donated */}
                <span className="text-xs text-[#8b949e] shrink-0 hidden lg:block w-20 text-right">
                  {fmt(s.total_donated)}
                </span>

                {/* Favorable % */}
                <span className="text-xs text-[#8b949e] shrink-0 hidden lg:block w-16 text-right">
                  {s.favorable_vote_pct.toFixed(0)}% aye
                </span>
              </button>
            ))}
          </div>
        )}
      </Section>

      {/* ── Industry Donations Overview (Bar chart) ── */}
      <Section>
        <h2 className="text-2xl md:text-3xl font-bold text-[#e6edf3] mb-2">
          Industry Donations Overview
        </h2>
        <p className="text-sm text-[#8b949e] mb-6 max-w-2xl leading-relaxed">
          Total donations per industry across all parties, ranked by average
          influence score.
        </p>

        {loading ? (
          <SkeletonChart height={400} />
        ) : (
          <div className="rounded-xl border border-white/5 bg-[#12121a] p-4 md:p-6">
            <ResponsiveContainer width="100%" height={400}>
              <BarChart
                data={industrySummary
                  .filter((s) => s.total_donated > 0)
                  .sort((a, b) => b.avg_score - a.avg_score)
                  .slice(0, 15)
                  .map((s) => ({
                    ...s,
                    label: labelIndustry(s.industry),
                  }))}
                margin={{ top: 10, right: 20, bottom: 60, left: 20 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(255,255,255,0.05)"
                />
                <XAxis
                  dataKey="label"
                  tick={{ fill: "#8b949e", fontSize: 11 }}
                  angle={-45}
                  textAnchor="end"
                  height={70}
                />
                <YAxis
                  tick={{ fill: "#8b949e", fontSize: 11 }}
                  tickFormatter={(v: number) => fmt(v)}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#12121a",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: "8px",
                    color: "#e6edf3",
                    fontSize: "12px",
                  }}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={((value: any, name: any) => [
                    name === "total_donated" ? fmt(Number(value)) : Number(value).toFixed(2),
                    name === "total_donated" ? "Total Donated" : "Avg Score",
                  ]) as any}
                />
                <Bar dataKey="total_donated" radius={[4, 4, 0, 0]}>
                  {industrySummary
                    .filter((s) => s.total_donated > 0)
                    .sort((a, b) => b.avg_score - a.avg_score)
                    .slice(0, 15)
                    .map((entry, idx) => (
                      <Cell
                        key={idx}
                        fill={scoreColor(entry.avg_score)}
                        fillOpacity={0.7}
                        cursor="pointer"
                        onClick={() =>
                          setSelectedIndustry(
                            selectedIndustry === entry.industry
                              ? null
                              : entry.industry
                          )
                        }
                      />
                    ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <p className="text-xs text-[#8b949e] mt-2 text-center">
              Bar color reflects average influence score across all parties
            </p>
          </div>
        )}
      </Section>

      {/* ── Industry Spotlight ── */}
      {selectedIndustry && (
        <Section>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl md:text-3xl font-bold text-[#e6edf3] mb-1">
                Industry Spotlight: {labelIndustry(selectedIndustry)}
              </h2>
              <p className="text-sm text-[#8b949e]">
                How each party votes on {labelIndustry(selectedIndustry).toLowerCase()}-related
                legislation vs donations received
              </p>
            </div>
            <button
              onClick={() => setSelectedIndustry(null)}
              className="text-[#8b949e] hover:text-[#e6edf3] transition-colors p-2"
              aria-label="Close spotlight"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {industryScores.map((s) => (
              <button
                key={s.party}
                onClick={() => fetchParty(s.party)}
                className="rounded-xl border border-white/5 bg-[#12121a] p-5 text-left hover:border-[#FFD700]/15 transition-all duration-200 cursor-pointer group"
              >
                <div className="flex items-center justify-between mb-3">
                  <PartyBadge party={shortParty(s.party)} />
                  <span
                    className="text-lg font-bold"
                    style={{ color: scoreColor(s.influence_score) }}
                  >
                    {s.influence_score.toFixed(2)}
                  </span>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-[#8b949e]">Donated</span>
                    <span className="text-[#FFD700] font-medium">
                      {fmt(s.total_donated)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-[#8b949e]">Favorable votes</span>
                    <span className="text-[#e6edf3]">
                      {s.favorable_vote_pct.toFixed(1)}%
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-[#8b949e]">Divisions</span>
                    <span className="text-[#e6edf3]">
                      {s.divisions_with_votes} / {s.relevant_divisions}
                    </span>
                  </div>
                  {/* Score bar */}
                  <div className="h-1.5 rounded-full bg-white/5 overflow-hidden mt-1">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{
                        width: `${Math.min((s.influence_score / 6) * 100, 100)}%`,
                        backgroundColor: scoreColor(s.influence_score),
                      }}
                    />
                  </div>
                </div>
              </button>
            ))}
          </div>

          {industryScores.length === 0 && (
            <div className="rounded-xl border border-white/5 bg-[#12121a] p-8 text-center">
              <p className="text-[#8b949e]">
                No data for this industry yet.
              </p>
            </div>
          )}
        </Section>
      )}

      {/* ── Party Drill-Down ── */}
      {selectedParty && (
        <Section>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl md:text-3xl font-bold text-[#e6edf3] mb-1">
                Party Drill-Down:{" "}
                <span style={{ color: partyColor(selectedParty) }}>
                  {shortParty(selectedParty)}
                </span>
              </h2>
              <p className="text-sm text-[#8b949e]">
                Industry donor breakdown with voting alignment for{" "}
                {selectedParty}
              </p>
            </div>
            <button
              onClick={() => {
                setSelectedParty(null);
                setPartyData(null);
              }}
              className="text-[#8b949e] hover:text-[#e6edf3] transition-colors p-2"
              aria-label="Close drill-down"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {partyLoading ? (
            <div className="space-y-4">
              <SkeletonChart height={300} />
              <SkeletonTable rows={5} cols={4} />
            </div>
          ) : partyData ? (
            <div className="space-y-6">
              {/* Party industry chart */}
              <div className="rounded-xl border border-white/5 bg-[#12121a] p-4 md:p-6">
                <h3 className="text-sm uppercase tracking-wider text-[#8b949e] mb-4">
                  Donations by Industry
                </h3>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart
                    data={partyData.scores
                      .filter((s) => s.total_donated > 0)
                      .sort((a, b) => b.total_donated - a.total_donated)
                      .map((s) => ({
                        ...s,
                        label: labelIndustry(s.industry),
                      }))}
                    margin={{ top: 10, right: 20, bottom: 60, left: 20 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="rgba(255,255,255,0.05)"
                    />
                    <XAxis
                      dataKey="label"
                      tick={{ fill: "#8b949e", fontSize: 11 }}
                      angle={-45}
                      textAnchor="end"
                      height={70}
                    />
                    <YAxis
                      tick={{ fill: "#8b949e", fontSize: 11 }}
                      tickFormatter={(v: number) => fmt(v)}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#12121a",
                        border: "1px solid rgba(255,255,255,0.1)",
                        borderRadius: "8px",
                        color: "#e6edf3",
                        fontSize: "12px",
                      }}
                      formatter={((value: any) => [fmt(Number(value)), "Donated"]) as any}
                    />
                    <Bar
                      dataKey="total_donated"
                      fill={partyColor(selectedParty)}
                      radius={[4, 4, 0, 0]}
                      fillOpacity={0.8}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Party scores table */}
              <div className="rounded-xl border border-white/5 bg-[#12121a] overflow-hidden">
                <div className="px-5 py-3 border-b border-white/5 bg-white/[0.02]">
                  <h3 className="text-sm uppercase tracking-wider text-[#8b949e]">
                    Industry Influence Scores
                  </h3>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/5">
                      <th className="px-5 py-3 text-left text-xs uppercase tracking-wider text-[#8b949e]">Industry</th>
                      <th className="px-3 py-3 text-right text-xs uppercase tracking-wider text-[#8b949e]">Donated</th>
                      <th className="px-3 py-3 text-right text-xs uppercase tracking-wider text-[#8b949e]">Favorable %</th>
                      <th className="px-3 py-3 text-right text-xs uppercase tracking-wider text-[#8b949e]">Divisions</th>
                      <th className="px-5 py-3 text-right text-xs uppercase tracking-wider text-[#8b949e]">Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {partyData.scores
                      .sort((a, b) => b.influence_score - a.influence_score)
                      .map((s) => (
                        <tr
                          key={s.industry}
                          className={`border-b border-white/[0.03] transition-colors cursor-pointer ${
                            selectedIndustry === s.industry
                              ? "bg-[#FFD700]/5"
                              : "hover:bg-white/[0.02]"
                          }`}
                          onClick={() =>
                            setSelectedIndustry(
                              selectedIndustry === s.industry
                                ? null
                                : s.industry
                            )
                          }
                        >
                          <td className="px-5 py-3 text-[#e6edf3]">
                            {labelIndustry(s.industry)}
                          </td>
                          <td className="px-3 py-3 text-right text-[#FFD700]">
                            {fmt(s.total_donated)}
                          </td>
                          <td className="px-3 py-3 text-right text-[#e6edf3]">
                            {s.favorable_vote_pct.toFixed(1)}%
                          </td>
                          <td className="px-3 py-3 text-right text-[#8b949e]">
                            {s.divisions_with_votes} / {s.relevant_divisions}
                          </td>
                          <td className="px-5 py-3 text-right font-bold" style={{ color: scoreColor(s.influence_score) }}>
                            {s.influence_score.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>

              {/* Top MPs */}
              {partyData.top_mps.length > 0 && (
                <div className="rounded-xl border border-white/5 bg-[#12121a] overflow-hidden">
                  <div className="px-5 py-3 border-b border-white/5 bg-white/[0.02]">
                    <h3 className="text-sm uppercase tracking-wider text-[#8b949e]">
                      Top MPs by Influence Score
                    </h3>
                  </div>
                  <div className="divide-y divide-white/[0.03]">
                    {partyData.top_mps.slice(0, 15).map((mp) => (
                      <div
                        key={`${mp.person_id}-${mp.industry}`}
                        className="flex items-center gap-4 px-5 py-3 hover:bg-white/[0.02] transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-[#e6edf3] font-medium truncate">
                            {mp.full_name}
                          </p>
                          <p className="text-xs text-[#8b949e]">
                            {labelIndustry(mp.industry)} -- {mp.divisions_voted} divisions, {mp.favorable_vote_pct.toFixed(0)}% favorable
                          </p>
                        </div>
                        <span
                          className="text-sm font-bold shrink-0"
                          style={{ color: scoreColor(mp.influence_score) }}
                        >
                          {mp.influence_score.toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-white/5 bg-[#12121a] p-8 text-center">
              <p className="text-[#8b949e]">No data available for this party.</p>
            </div>
          )}
        </Section>
      )}

      {/* ── Methodology ── */}
      <Section>
        <div className="rounded-xl border border-[#FFD700]/10 bg-[#FFD700]/[0.03] p-6 md:p-8">
          <h2 className="text-xl font-bold text-[#e6edf3] mb-3">
            Methodology
          </h2>
          <div className="space-y-3 text-sm text-[#8b949e] leading-relaxed">
            <p>
              The influence score measures the correlation between industry
              donations to a party and that party&apos;s favorable voting on
              legislation related to the industry. It is not a measure of
              causation.
            </p>
            <p>
              For each party-industry pair, we: (1) sum all donations from that
              industry to the party; (2) identify parliamentary divisions related
              to that industry using keyword matching; (3) calculate the
              party&apos;s favorable vote percentage on those divisions; (4)
              compute a score combining donation magnitude with voting alignment.
            </p>
            <p>
              Division-industry matching uses keyword lists (e.g., &ldquo;gambling&rdquo;,
              &ldquo;poker machine&rdquo;, &ldquo;betting&rdquo; for the gambling industry). This is an
              imperfect heuristic. Some divisions may be miscategorized or missed.
            </p>
            <p className="text-[#FFD700]/60 text-xs">
              Data sources: AEC donation disclosures, TheyVoteForYou division
              records, OpenAustralia Hansard.
            </p>
          </div>
        </div>
      </Section>

      {/* Error display */}
      {error && (
        <div className="mb-8 rounded-xl border border-[#DC2626]/20 bg-[#DC2626]/5 p-4 text-center">
          <p className="text-sm text-[#DC2626]">
            Failed to load data: {error}. Is the API server running?
          </p>
        </div>
      )}

      {/* Bottom spacing */}
      <div className="h-20" />
    </div>
  );
}

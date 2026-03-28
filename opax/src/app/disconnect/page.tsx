"use client";

import { useState, useEffect, useCallback } from "react";
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
import {
  Skeleton,
  SkeletonCard,
  SkeletonChart,
  SkeletonTable,
  SkeletonText,
  SkeletonAvatar,
} from "@/components/skeleton";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RankingEntry {
  person_id: string;
  full_name: string | null;
  party: string | null;
  electorate: string | null;
  chamber: string | null;
  topic_id: number;
  topic_name: string;
  speech_count: number;
  pro_reform_speeches: number;
  anti_reform_speeches: number;
  relevant_divisions: number;
  aligned_votes: number;
  misaligned_votes: number;
  vote_alignment: number;
  disconnect_score: number;
}

interface TopicStat {
  topic_name: string;
  mp_count: number;
  avg_disconnect: number;
  max_disconnect: number;
  avg_alignment: number;
  total_speeches: number;
}

interface WorstAvgMP {
  person_id: string;
  full_name: string | null;
  party: string | null;
  avg_disconnect: number;
  topics_scored: number;
  total_speeches: number;
}

interface SummaryData {
  topic_stats: TopicStat[];
  worst_disconnects: RankingEntry[];
  worst_avg_by_mp: WorstAvgMP[];
  computed_at: string;
}

interface MPDetail {
  person_id: string;
  full_name: string | null;
  party: string | null;
  scores: RankingEntry[];
  count: number;
  avg_disconnect: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

import { API_BASE } from "@/lib/utils";
const API = API_BASE;

const TOPICS = [
  "all",
  "gambling",
  "climate",
  "housing",
  "economy",
  "education",
  "health",
  "immigration",
  "defence",
  "indigenous affairs",
  "media",
  "foreign policy",
];

const TOPIC_LABELS: Record<string, string> = {
  all: "All Topics",
  gambling: "Gambling",
  climate: "Climate",
  housing: "Housing",
  economy: "Economy",
  education: "Education",
  health: "Health",
  immigration: "Immigration",
  defence: "Defence",
  "indigenous affairs": "Indigenous Affairs",
  media: "Media",
  "foreign policy": "Foreign Policy",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function scoreColor(score: number): string {
  if (score < 0.3) return "#00843D";
  if (score < 0.6) return "#F59E0B";
  return "#DC2626";
}

function scoreLabel(score: number): string {
  if (score < 0.3) return "Consistent";
  if (score < 0.6) return "Mixed";
  return "Disconnect";
}

function scoreBg(score: number): string {
  if (score < 0.3) return "bg-green-900/20 border-green-800/30";
  if (score < 0.6) return "bg-amber-900/20 border-amber-800/30";
  return "bg-red-900/20 border-red-800/30";
}

function mpPhotoUrl(personId: string): string {
  return `https://www.openaustralia.org.au/images/mps/${personId}.jpg`;
}

function partyAbbrev(party: string | null): string {
  if (!party) return "?";
  const map: Record<string, string> = {
    "Australian Labor Party": "Labor",
    "Liberal Party": "Liberal",
    "Australian Greens": "Greens",
    "National Party": "Nationals",
    "Pauline Hanson's One Nation Party": "One Nation",
    Labor: "Labor",
    Liberal: "Liberal",
    Greens: "Greens",
    Nationals: "Nationals",
    Independent: "Independent",
  };
  return map[party] || party;
}

// ---------------------------------------------------------------------------
// Skeleton loaders
// ---------------------------------------------------------------------------

function HeroSkeleton() {
  return (
    <div className="text-center mb-12">
      <Skeleton className="h-10 w-64 mx-auto mb-4" />
      <Skeleton className="h-5 w-96 mx-auto mb-2" />
      <Skeleton className="h-4 w-80 mx-auto" />
    </div>
  );
}

function LeaderboardSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 10 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 p-4 rounded-xl border border-white/5 bg-[#12121a]"
        >
          <Skeleton className="h-5 w-5 shrink-0" />
          <SkeletonAvatar size={44} />
          <div className="flex-1 min-w-0">
            <Skeleton className="h-4 w-36 mb-2" />
            <Skeleton className="h-3 w-20" />
          </div>
          <Skeleton className="h-4 w-48 hidden md:block" />
          <Skeleton className="h-6 w-14 rounded-full" />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Score bar component
// ---------------------------------------------------------------------------

function ScoreBar({ score, width = "w-48" }: { score: number; width?: string }) {
  const pct = Math.round(score * 100);
  return (
    <div className={`${width} hidden md:flex items-center gap-2`}>
      <div className="flex-1 h-2 rounded-full bg-white/5 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{
            width: `${pct}%`,
            backgroundColor: scoreColor(score),
          }}
        />
      </div>
      <span
        className="text-xs font-mono tabular-nums"
        style={{ color: scoreColor(score) }}
      >
        {score.toFixed(2)}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Expandable MP card
// ---------------------------------------------------------------------------

function MPCard({
  mp,
  rank,
  isAvgMode,
}: {
  mp: RankingEntry | WorstAvgMP;
  rank: number;
  isAvgMode?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<MPDetail | null>(null);
  const [loading, setLoading] = useState(false);

  const personId = mp.person_id;
  const name = mp.full_name || "Unknown";
  const party = partyAbbrev(mp.party);
  const score = isAvgMode
    ? (mp as WorstAvgMP).avg_disconnect
    : (mp as RankingEntry).disconnect_score;

  const handleToggle = useCallback(async () => {
    if (expanded) {
      setExpanded(false);
      return;
    }
    setExpanded(true);
    if (!detail) {
      setLoading(true);
      try {
        const res = await fetch(
          `${API}/api/disconnect?person_id=${encodeURIComponent(personId)}`
        );
        if (res.ok) {
          const data: MPDetail = await res.json();
          setDetail(data);
        }
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    }
  }, [expanded, detail, personId]);

  return (
    <div
      className={`rounded-xl border transition-all duration-300 animate-[fadeIn_0.4s_ease-out] ${
        expanded
          ? "border-[#FFD700]/20 bg-[#12121a]"
          : "border-white/5 bg-[#12121a] hover:border-white/10"
      }`}
      style={{ animationDelay: `${rank * 30}ms`, animationFillMode: "both" }}
    >
      {/* Main row */}
      <button
        onClick={handleToggle}
        className="w-full flex items-center gap-3 md:gap-4 p-3 md:p-4 text-left cursor-pointer"
      >
        {/* Rank */}
        <span className="text-sm font-mono text-[#8b949e] w-6 text-right shrink-0">
          {rank}
        </span>

        {/* Photo */}
        <div className="relative w-10 h-10 md:w-11 md:h-11 rounded-full overflow-hidden bg-white/5 shrink-0">
          <img
            src={mpPhotoUrl(personId)}
            alt={name}
            className="w-full h-full object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
          <div className="absolute inset-0 flex items-center justify-center text-[#8b949e] text-sm font-medium">
            {name
              .split(" ")
              .map((n) => n[0])
              .join("")
              .slice(0, 2)}
          </div>
        </div>

        {/* Name + party */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-[#e6edf3] truncate">{name}</p>
          <PartyBadge party={party} className="mt-0.5" />
        </div>

        {/* Score bar (desktop) */}
        <ScoreBar score={score} />

        {/* Score badge (always visible) */}
        <span
          className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-mono font-semibold border ${scoreBg(score)}`}
          style={{ color: scoreColor(score) }}
        >
          {score.toFixed(2)}
        </span>

        {/* Expand chevron */}
        <svg
          className={`w-4 h-4 text-[#8b949e] transition-transform duration-200 shrink-0 ${
            expanded ? "rotate-180" : ""
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-4 pb-4 pt-0 border-t border-white/5">
          {loading ? (
            <div className="py-6 space-y-3">
              <SkeletonText lines={3} />
            </div>
          ) : detail && detail.scores.length > 0 ? (
            <div className="pt-4">
              <p className="text-xs text-[#8b949e] uppercase tracking-wider mb-3">
                Per-topic breakdown
              </p>
              <div className="grid gap-2">
                {detail.scores
                  .filter((s) => s.speech_count >= 5)
                  .sort((a, b) => b.disconnect_score - a.disconnect_score)
                  .map((s) => (
                    <div
                      key={s.topic_name}
                      className="flex items-center gap-3 py-2 px-3 rounded-lg bg-white/[0.02]"
                    >
                      <span className="text-sm text-[#e6edf3] w-32 md:w-40 capitalize truncate">
                        {s.topic_name}
                      </span>
                      <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.round(s.disconnect_score * 100)}%`,
                            backgroundColor: scoreColor(s.disconnect_score),
                          }}
                        />
                      </div>
                      <span
                        className="text-xs font-mono tabular-nums w-10 text-right"
                        style={{ color: scoreColor(s.disconnect_score) }}
                      >
                        {s.disconnect_score.toFixed(2)}
                      </span>
                      <div className="hidden md:flex items-center gap-3 text-xs text-[#8b949e]">
                        <span>{s.speech_count} speeches</span>
                        <span className="text-white/10">|</span>
                        <span>{s.aligned_votes} aligned</span>
                        <span className="text-white/10">|</span>
                        <span>{s.misaligned_votes} misaligned</span>
                      </div>
                    </div>
                  ))}
              </div>
              {detail.avg_disconnect > 0 && (
                <div className="mt-3 flex items-center gap-2 text-xs text-[#8b949e]">
                  <span>Average disconnect:</span>
                  <span
                    className="font-mono font-semibold"
                    style={{ color: scoreColor(detail.avg_disconnect) }}
                  >
                    {detail.avg_disconnect.toFixed(3)}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <p className="py-4 text-sm text-[#8b949e]">
              No detailed breakdown available.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Party comparison chart
// ---------------------------------------------------------------------------

function PartyChart({ rankings }: { rankings: WorstAvgMP[] }) {
  // Group by party and compute average
  const partyMap = new Map<string, { total: number; count: number }>();
  for (const mp of rankings) {
    const party = partyAbbrev(mp.party);
    const entry = partyMap.get(party) || { total: 0, count: 0 };
    entry.total += mp.avg_disconnect;
    entry.count += 1;
    partyMap.set(party, entry);
  }

  const data = Array.from(partyMap.entries())
    .map(([party, { total, count }]) => ({
      party,
      avg: parseFloat((total / count).toFixed(3)),
      count,
    }))
    .filter((d) => d.count >= 2)
    .sort((a, b) => b.avg - a.avg);

  if (data.length === 0) return null;

  const partyColors: Record<string, string> = {
    Labor: "#E13A3A",
    Liberal: "#1C4FA0",
    Greens: "#00843D",
    Nationals: "#F59E0B",
    Independent: "#A855F7",
    "One Nation": "#F97316",
  };

  return (
    <div className="rounded-xl border border-white/5 bg-[#12121a] p-4 md:p-6">
      <h3 className="text-sm font-medium text-[#8b949e] uppercase tracking-wider mb-4">
        Average Disconnect by Party
      </h3>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={data} layout="vertical" margin={{ left: 80, right: 30 }}>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="rgba(255,255,255,0.04)"
            horizontal={false}
          />
          <XAxis
            type="number"
            domain={[0, 1]}
            tick={{ fill: "#8b949e", fontSize: 12 }}
            tickLine={false}
            axisLine={{ stroke: "rgba(255,255,255,0.06)" }}
          />
          <YAxis
            type="category"
            dataKey="party"
            tick={{ fill: "#e6edf3", fontSize: 13 }}
            tickLine={false}
            axisLine={false}
            width={75}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#12121a",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: "0.75rem",
              color: "#e6edf3",
              fontSize: "0.8rem",
            }}
            formatter={(v: any) => [Number(v).toFixed(3), "Avg Disconnect"]}
            labelFormatter={(label: any) => `${label}`}
          />
          <Bar dataKey="avg" radius={[0, 6, 6, 0]} barSize={24}>
            {data.map((entry) => (
              <Cell
                key={entry.party}
                fill={partyColors[entry.party] || "#6B7280"}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <p className="text-xs text-[#8b949e]/60 mt-2 text-center">
        Only parties with 2+ scored MPs shown
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Topic stats cards
// ---------------------------------------------------------------------------

function TopicStatCards({ topics }: { topics: TopicStat[] }) {
  if (topics.length === 0) return null;

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
      {topics.map((t) => (
        <div
          key={t.topic_name}
          className="rounded-xl border border-white/5 bg-[#12121a] p-4 hover:border-white/10 transition-colors"
        >
          <p className="text-sm text-[#e6edf3] capitalize font-medium mb-2">
            {t.topic_name}
          </p>
          <div className="flex items-baseline gap-1 mb-1">
            <span
              className="text-xl font-mono font-bold"
              style={{ color: scoreColor(t.avg_disconnect) }}
            >
              {t.avg_disconnect.toFixed(2)}
            </span>
            <span className="text-xs text-[#8b949e]">avg</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-[#8b949e]">
            <span>{t.mp_count} MPs</span>
            <span className="text-white/10">|</span>
            <span>{t.total_speeches.toLocaleString()} speeches</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Legend
// ---------------------------------------------------------------------------

function ScoreLegend() {
  const ranges = [
    { label: "0.0 - 0.3", color: "#00843D", text: "Consistent" },
    { label: "0.3 - 0.6", color: "#F59E0B", text: "Mixed signals" },
    { label: "0.6 - 1.0", color: "#DC2626", text: "Disconnect" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-4 md:gap-6 text-xs text-[#8b949e]">
      {ranges.map((r) => (
        <div key={r.label} className="flex items-center gap-2">
          <div
            className="w-3 h-3 rounded-sm"
            style={{ backgroundColor: r.color }}
          />
          <span className="font-mono">{r.label}</span>
          <span className="text-[#8b949e]/60">{r.text}</span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function DisconnectPage() {
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [rankings, setRankings] = useState<RankingEntry[]>([]);
  const [activeTopic, setActiveTopic] = useState("all");
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [loadingRankings, setLoadingRankings] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch summary on mount
  useEffect(() => {
    setLoadingSummary(true);
    fetch(`${API}/api/disconnect/summary`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: SummaryData) => {
        setSummary(data);
        setLoadingSummary(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoadingSummary(false);
      });
  }, []);

  // Fetch rankings when topic changes
  useEffect(() => {
    setLoadingRankings(true);
    const topicParam = activeTopic === "all" ? "" : `&topic=${encodeURIComponent(activeTopic)}`;
    fetch(`${API}/api/disconnect/rankings?limit=50${topicParam}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        setRankings(data.rankings || []);
        setLoadingRankings(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoadingRankings(false);
      });
  }, [activeTopic]);

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      <div className="mx-auto max-w-5xl px-4 md:px-6 py-10 md:py-16">
        {/* ── Hero ── */}
        <header className="text-center mb-12 md:mb-16 animate-[fadeIn_0.6s_ease-out]">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[#DC2626]/20 bg-[#DC2626]/5 text-xs text-[#DC2626] font-medium mb-4">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            Accountability Metric
          </div>
          <h1 className="text-3xl md:text-5xl font-serif text-[#e6edf3] mb-4">
            The <span className="text-[#FFD700]">Disconnect</span>
          </h1>
          <p className="text-base md:text-lg text-[#8b949e] max-w-2xl mx-auto mb-3">
            Measuring the gap between what MPs{" "}
            <span className="text-[#e6edf3] font-medium">say</span> in Parliament
            and how they{" "}
            <span className="text-[#e6edf3] font-medium">vote</span>.
          </p>
          <p className="text-sm text-[#8b949e]/60 max-w-xl mx-auto">
            A disconnect score of 1.0 means an MP talks extensively about a topic
            but consistently votes against their stated position. A score of 0.0
            means their words and votes align perfectly.
          </p>
        </header>

        {/* ── Score legend ── */}
        <div className="mb-8 flex justify-center">
          <ScoreLegend />
        </div>

        {/* ── Error state ── */}
        {error && (
          <div className="mb-8 p-4 rounded-xl border border-red-800/30 bg-red-900/10 text-sm text-red-400 text-center">
            Failed to load data: {error}. Make sure the API is running at {API}.
          </div>
        )}

        {/* ── Topic stats overview ── */}
        <section className="mb-12">
          <h2 className="text-lg font-medium text-[#e6edf3] mb-4">
            Disconnect by Topic
          </h2>
          {loadingSummary ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          ) : summary ? (
            <TopicStatCards topics={summary.topic_stats} />
          ) : null}
        </section>

        {/* ── Party comparison chart ── */}
        <section className="mb-12">
          {loadingSummary ? (
            <SkeletonChart height={340} />
          ) : summary && summary.worst_avg_by_mp.length > 0 ? (
            <PartyChart rankings={summary.worst_avg_by_mp} />
          ) : null}
        </section>

        {/* ── Leaderboard ── */}
        <section className="mb-12">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
            <h2 className="text-lg font-medium text-[#e6edf3]">
              Disconnect Rankings
            </h2>

            {/* Topic filter pills */}
            <div className="flex flex-wrap gap-1.5">
              {TOPICS.map((t) => (
                <button
                  key={t}
                  onClick={() => setActiveTopic(t)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-all duration-200 cursor-pointer ${
                    activeTopic === t
                      ? "bg-[#FFD700]/15 text-[#FFD700] border border-[#FFD700]/30"
                      : "bg-white/[0.03] text-[#8b949e] border border-white/5 hover:bg-white/[0.06] hover:text-[#e6edf3]"
                  }`}
                >
                  {TOPIC_LABELS[t] || t}
                </button>
              ))}
            </div>
          </div>

          {loadingRankings ? (
            <LeaderboardSkeleton />
          ) : rankings.length === 0 ? (
            <div className="text-center py-12 text-[#8b949e]">
              <p className="text-sm">
                No disconnect data available for this topic yet.
              </p>
              <p className="text-xs mt-1 text-[#8b949e]/60">
                Run the disconnect analysis to populate scores.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {rankings.slice(0, 20).map((mp, i) => (
                <MPCard key={`${mp.person_id}-${mp.topic_name}`} mp={mp} rank={i + 1} />
              ))}
            </div>
          )}
        </section>

        {/* ── Overall worst offenders (average across topics) ── */}
        {summary && summary.worst_avg_by_mp.length > 0 && (
          <section className="mb-12">
            <h2 className="text-lg font-medium text-[#e6edf3] mb-2">
              Highest Average Disconnect
            </h2>
            <p className="text-sm text-[#8b949e] mb-6">
              MPs with the highest average disconnect score across multiple
              policy areas. These members most consistently diverge from their
              stated positions.
            </p>
            <div className="space-y-2">
              {summary.worst_avg_by_mp.slice(0, 20).map((mp, i) => (
                <MPCard key={mp.person_id} mp={mp} rank={i + 1} isAvgMode />
              ))}
            </div>
          </section>
        )}

        {/* ── Methodology ── */}
        <section className="rounded-xl border border-white/5 bg-[#12121a] p-6">
          <h3 className="text-sm font-medium text-[#8b949e] uppercase tracking-wider mb-3">
            Methodology
          </h3>
          <div className="text-sm text-[#8b949e]/80 space-y-2">
            <p>
              The disconnect score combines two signals:{" "}
              <span className="text-[#e6edf3]">speech intensity</span> (how
              much an MP talks about a topic, capped at 20 speeches) and{" "}
              <span className="text-[#e6edf3]">vote alignment</span> (whether
              their votes match the stance expressed in their speeches).
            </p>
            <p>
              <span className="font-mono text-[#FFD700]/70">
                disconnect = speech_intensity x (1 - vote_alignment)
              </span>
            </p>
            <p>
              Only MPs with at least 5 speeches on a topic are included. Speech
              stance is classified as pro-reform or anti-reform using keyword
              analysis. Vote alignment compares this stance against actual
              division votes on related bills.
            </p>
          </div>
        </section>

        {/* ── Footer note ── */}
        <p className="text-center text-xs text-[#8b949e]/40 mt-10">
          Data sourced from Hansard and TheyVoteForYou. Updated periodically.
        </p>
      </div>
    </div>
  );
}

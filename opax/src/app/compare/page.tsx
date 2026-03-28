"use client";

import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { PartyBadge } from "@/components/party-badge";
import { DisconnectMeter } from "@/components/disconnect-meter";
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts";

import { API_BASE } from "@/lib/utils";

/* ── Types ── */

interface MpOption {
  person_id: string;
  full_name: string;
  party: string;
  electorate: string;
  chamber: string;
  speech_count: number;
}

interface TopicCount {
  name: string;
  count: number;
}

interface PolicyScore {
  policy_id: number;
  policy_name: string;
  agreement: number;
}

interface Donor {
  donor_name: string;
  total: number;
  donation_count: number;
  industry: string | null;
}

interface MpProfile {
  person_id: string;
  full_name: string;
  party: string;
  electorate: string;
  chamber: string;
  photo_url: string;
  speech_count: number;
  first_speech: string | null;
  last_speech: string | null;
  top_topics: TopicCount[];
  policy_scores: PolicyScore[];
  rebellions: number | null;
  votes_attended: number | null;
  votes_possible: number | null;
  votes: Record<string, number>;
  top_party_donors: Donor[];
  error?: string;
}

/* ── Key policy areas for radar chart ── */

const RADAR_POLICIES = [
  { keyword: "gambling", label: "Gambling" },
  { keyword: "housing", label: "Housing" },
  { keyword: "climate", label: "Climate" },
  { keyword: "corruption", label: "Corruption" },
  { keyword: "donation", label: "Donations" },
];

const partyBorderColors: Record<string, string> = {
  Labor: "#E13A3A",
  Liberal: "#1C4FA0",
  Greens: "#00843D",
  Nationals: "#006644",
  Independent: "#888888",
};

/* ── Helper: find policy score by keyword match ── */

function findPolicyScore(
  scores: PolicyScore[],
  keyword: string
): number | null {
  const match = scores.find((s) =>
    s.policy_name.toLowerCase().includes(keyword)
  );
  return match ? match.agreement : null;
}

/* ── Helper: build radar data from two profiles ── */

function buildRadarData(a: MpProfile, b: MpProfile) {
  return RADAR_POLICIES.map((p) => {
    const scoreA = findPolicyScore(a.policy_scores, p.keyword);
    const scoreB = findPolicyScore(b.policy_scores, p.keyword);
    return {
      policy: p.label,
      [a.full_name]: scoreA ?? 0,
      [b.full_name]: scoreB ?? 0,
    };
  });
}

/* ── Helper: build disconnect data from topics ── */

function buildDisconnectData(mp: MpProfile) {
  // Use topic speech counts relative to total as a proxy disconnect score
  // Higher speech count on a topic but low policy score = higher disconnect
  const total = mp.speech_count || 1;
  return mp.top_topics.slice(0, 5).map((t) => {
    const policyMatch = mp.policy_scores.find((p) =>
      p.policy_name.toLowerCase().includes(t.name.toLowerCase())
    );
    // If they talk a lot about something but vote against it -> higher disconnect
    const speechPct = (t.count / total) * 100;
    const agreement = policyMatch ? policyMatch.agreement : 50;
    const disconnect = Math.round(
      Math.max(0, Math.min(100, speechPct * 3 - agreement * 0.5 + 20))
    );
    return { topic: t.name, disconnect, speechCount: t.count };
  });
}

/* ── MP Selector Component ── */

function MpSelector({
  label,
  value,
  onChange,
  options,
  filterOut,
}: {
  label: string;
  value: string;
  onChange: (id: string) => void;
  options: MpOption[];
  filterOut?: string;
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const filtered = options.filter(
    (mp) =>
      mp.person_id !== filterOut &&
      (search === "" ||
        mp.full_name.toLowerCase().includes(search.toLowerCase()) ||
        mp.party.toLowerCase().includes(search.toLowerCase()) ||
        (mp.electorate || "").toLowerCase().includes(search.toLowerCase()))
  );

  const selected = options.find((mp) => mp.person_id === value);

  return (
    <div ref={containerRef} className="relative" style={{ zIndex: open ? 50 : 1 }}>
      <label className="block text-xs text-[#8b949e] uppercase tracking-wider mb-2">
        {label}
      </label>
      <button
        onClick={() => setOpen(!open)}
        className="w-full text-left rounded-xl border border-white/10 bg-[#12121a] px-4 py-3 text-sm text-[#e6edf3] hover:border-white/20 transition-colors"
      >
        {selected ? (
          <span className="flex items-center gap-2">
            <img
              src={`https://www.openaustralia.org.au/images/mpsL/${selected.person_id}.jpg`}
              alt=""
              className="w-6 h-6 rounded-full object-cover"
            />
            {selected.full_name}
            <PartyBadge party={selected.party} />
          </span>
        ) : (
          <span className="text-[#8b949e]">Select an MP...</span>
        )}
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full max-h-72 overflow-auto rounded-xl border border-white/10 bg-[#12121a] shadow-2xl">
          <div className="sticky top-0 bg-[#12121a] p-2 border-b border-white/5">
            <input
              type="text"
              placeholder="Search MPs..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-[#0a0a0f] px-3 py-2 text-sm text-[#e6edf3] placeholder-[#8b949e] outline-none focus:border-[#FFD700]/50"
              autoFocus
            />
          </div>
          {filtered.slice(0, 50).map((mp) => (
            <button
              key={mp.person_id}
              onClick={() => {
                onChange(mp.person_id);
                setOpen(false);
                setSearch("");
              }}
              className="w-full text-left px-4 py-2.5 text-sm hover:bg-white/5 transition-colors flex items-center gap-3"
            >
              <img
                src={`https://www.openaustralia.org.au/images/mpsL/${mp.person_id}.jpg`}
                alt=""
                className="w-6 h-6 rounded-full object-cover"
              />
              <span className="text-[#e6edf3]">{mp.full_name}</span>
              <PartyBadge party={mp.party} />
              <span className="text-xs text-[#8b949e] ml-auto">
                {mp.speech_count} speeches
              </span>
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="px-4 py-6 text-center text-sm text-[#8b949e]">
              No MPs found
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Stat Card ── */

function StatCard({
  label,
  valueA,
  valueB,
  nameA,
  nameB,
  colorA,
  colorB,
  format,
}: {
  label: string;
  valueA: number;
  valueB: number;
  nameA: string;
  nameB: string;
  colorA: string;
  colorB: string;
  format?: (n: number) => string;
}) {
  const fmt = format || ((n: number) => n.toLocaleString());
  const maxVal = Math.max(valueA, valueB, 1);
  return (
    <div className="rounded-xl border border-white/5 bg-[#12121a] p-4">
      <span className="text-xs text-[#8b949e] uppercase tracking-wider">
        {label}
      </span>
      <div className="mt-3 space-y-2">
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-[#8b949e]">{nameA}</span>
            <span className="font-semibold" style={{ color: colorA }}>
              {fmt(valueA)}
            </span>
          </div>
          <div className="h-2 rounded-full bg-white/5 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${(valueA / maxVal) * 100}%`,
                backgroundColor: colorA,
                opacity: 0.7,
              }}
            />
          </div>
        </div>
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-[#8b949e]">{nameB}</span>
            <span className="font-semibold" style={{ color: colorB }}>
              {fmt(valueB)}
            </span>
          </div>
          <div className="h-2 rounded-full bg-white/5 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${(valueB / maxVal) * 100}%`,
                backgroundColor: colorB,
                opacity: 0.7,
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Main Compare Content (uses useSearchParams) ── */

function CompareContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [mpList, setMpList] = useState<MpOption[]>([]);
  const [idA, setIdA] = useState(searchParams.get("a") || "");
  const [idB, setIdB] = useState(searchParams.get("b") || "");
  const [profileA, setProfileA] = useState<MpProfile | null>(null);
  const [profileB, setProfileB] = useState<MpProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch MP list on mount
  useEffect(() => {
    fetch(`${API_BASE}/api/mps?limit=500`)
      .then((r) => r.json())
      .then((data) => setMpList(data.mps || []))
      .catch(() => setError("Could not load MP list"));
  }, []);

  // Update URL when selections change
  const updateUrl = useCallback(
    (a: string, b: string) => {
      if (a && b) {
        router.replace(`/compare?a=${a}&b=${b}`, { scroll: false });
      } else if (a) {
        router.replace(`/compare?a=${a}`, { scroll: false });
      } else if (b) {
        router.replace(`/compare?b=${b}`, { scroll: false });
      }
    },
    [router]
  );

  // Fetch comparison data when both IDs are set
  useEffect(() => {
    if (!idA || !idB) {
      setProfileA(null);
      setProfileB(null);
      return;
    }

    setLoading(true);
    setError(null);

    fetch(`${API_BASE}/api/compare?a=${idA}&b=${idB}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.a?.error || data.b?.error) {
          setError(data.a?.error || data.b?.error);
          return;
        }
        setProfileA(data.a);
        setProfileB(data.b);
      })
      .catch(() => setError("Could not load comparison data"))
      .finally(() => setLoading(false));
  }, [idA, idB]);

  const handleSelectA = (id: string) => {
    setIdA(id);
    updateUrl(id, idB);
  };

  const handleSelectB = (id: string) => {
    setIdB(id);
    updateUrl(idA, id);
  };

  const colorA = profileA
    ? partyBorderColors[profileA.party] || "#888888"
    : "#888888";
  const colorB = profileB
    ? partyBorderColors[profileB.party] || "#888888"
    : "#888888";

  const bothLoaded = profileA && profileB;

  return (
    <div className="mx-auto max-w-6xl px-6">
      {/* Header */}
      <section className="pt-8 pb-6 animate-fade-in-up">
        <h1 className="text-3xl md:text-4xl font-bold text-[#e6edf3] mb-2">
          <span className="editorial-underline">Compare MPs</span>
        </h1>
        <p className="text-sm text-[#8b949e] max-w-xl">
          Side-by-side comparison of any two Members of Parliament across
          speeches, voting records, policy stances, and donor connections.
        </p>
      </section>

      {/* Selectors */}
      <section className="pb-8 animate-fade-in-up stagger-1 relative z-40">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <MpSelector
            label="First MP"
            value={idA}
            onChange={handleSelectA}
            options={mpList}
            filterOut={idB}
          />
          <MpSelector
            label="Second MP"
            value={idB}
            onChange={handleSelectB}
            options={mpList}
            filterOut={idA}
          />
        </div>
      </section>

      {/* Loading */}
      {loading && (
        <div className="text-center py-16 animate-fade-in-up">
          <div className="inline-block w-8 h-8 border-2 border-[#FFD700] border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-[#8b949e]">Loading comparison...</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-[#DC2626]/20 bg-[#DC2626]/5 p-4 text-sm text-[#DC2626]/80 mb-8">
          {error}
        </div>
      )}

      {/* Prompt */}
      {!bothLoaded && !loading && !error && (
        <div className="text-center py-20 animate-fade-in-up stagger-2">
          <p className="text-[#8b949e] text-lg">
            Select two MPs above to compare them.
          </p>
          <p className="text-[#8b949e]/60 text-sm mt-2">
            Try comparing Albanese vs Abbott, or Bandt vs Dutton.
          </p>
        </div>
      )}

      {/* Comparison content */}
      {bothLoaded && (
        <>
          {/* Photo + Profile side-by-side */}
          <section className="pb-8 animate-fade-in-up stagger-2">
            <div className="grid grid-cols-2 gap-6">
              {[profileA, profileB].map((mp) => {
                const color =
                  partyBorderColors[mp!.party] || "#888888";
                return (
                  <div key={mp!.person_id} className="text-center">
                    <Link href={`/politicians/${mp!.person_id}`}>
                      <div
                        className="w-24 h-24 md:w-32 md:h-32 rounded-full overflow-hidden mx-auto border-3 hover:opacity-80 transition-opacity"
                        style={{ borderColor: color, borderWidth: 3 }}
                      >
                        <img
                          src={mp!.photo_url}
                          alt={mp!.full_name}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    </Link>
                    <h2 className="text-lg md:text-xl font-bold text-[#e6edf3] mt-3">
                      <Link
                        href={`/politicians/${mp!.person_id}`}
                        className="hover:text-[#FFD700] transition-colors"
                      >
                        {mp!.full_name}
                      </Link>
                    </h2>
                    <div className="flex items-center justify-center gap-2 mt-1">
                      <PartyBadge party={mp!.party} />
                    </div>
                    <p className="text-xs text-[#8b949e] mt-1">
                      {mp!.electorate || mp!.chamber}
                    </p>
                    <p className="text-xs text-[#8b949e]/60 mt-0.5">
                      {mp!.chamber === "senate"
                        ? "Senate"
                        : "House of Representatives"}
                    </p>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Key Stats Comparison */}
          <section className="pb-8 animate-fade-in-up stagger-3">
            <h2 className="text-xl font-bold text-[#e6edf3] mb-4">
              Key Statistics
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <StatCard
                label="Total Speeches"
                valueA={profileA.speech_count}
                valueB={profileB.speech_count}
                nameA={profileA.full_name}
                nameB={profileB.full_name}
                colorA={colorA}
                colorB={colorB}
              />
              <StatCard
                label="Divisions Voted In"
                valueA={
                  Object.values(profileA.votes).reduce(
                    (a, b) => a + b,
                    0
                  ) || 0
                }
                valueB={
                  Object.values(profileB.votes).reduce(
                    (a, b) => a + b,
                    0
                  ) || 0
                }
                nameA={profileA.full_name}
                nameB={profileB.full_name}
                colorA={colorA}
                colorB={colorB}
              />
              {(profileA.votes_attended || profileB.votes_attended) && (
                <StatCard
                  label="Attendance Rate"
                  valueA={
                    profileA.votes_attended && profileA.votes_possible
                      ? Math.round(
                          (profileA.votes_attended /
                            profileA.votes_possible) *
                            100
                        )
                      : 0
                  }
                  valueB={
                    profileB.votes_attended && profileB.votes_possible
                      ? Math.round(
                          (profileB.votes_attended /
                            profileB.votes_possible) *
                            100
                        )
                      : 0
                  }
                  nameA={profileA.full_name}
                  nameB={profileB.full_name}
                  colorA={colorA}
                  colorB={colorB}
                  format={(n) => `${n}%`}
                />
              )}
              {(profileA.rebellions != null ||
                profileB.rebellions != null) && (
                <StatCard
                  label="Rebellions"
                  valueA={profileA.rebellions ?? 0}
                  valueB={profileB.rebellions ?? 0}
                  nameA={profileA.full_name}
                  nameB={profileB.full_name}
                  colorA={colorA}
                  colorB={colorB}
                />
              )}
            </div>
          </section>

          {/* Top Topics Comparison */}
          <section className="pb-8 animate-fade-in-up stagger-4">
            <h2 className="text-xl font-bold text-[#e6edf3] mb-4">
              Top 5 Topics by Speech Count
            </h2>
            <div className="grid grid-cols-2 gap-6">
              {[profileA, profileB].map((mp) => {
                const color =
                  partyBorderColors[mp!.party] || "#888888";
                return (
                  <div key={mp!.person_id}>
                    <h3
                      className="text-sm font-semibold mb-3"
                      style={{ color }}
                    >
                      {mp!.full_name}
                    </h3>
                    <div className="space-y-2">
                      {mp!.top_topics.slice(0, 5).map((t, i) => (
                        <div
                          key={t.name}
                          className="flex items-center gap-3"
                        >
                          <span className="text-xs text-[#8b949e] w-4 text-right">
                            {i + 1}.
                          </span>
                          <span className="text-sm text-[#e6edf3] flex-1 capitalize">
                            {t.name.replace(/_/g, " ")}
                          </span>
                          <span
                            className="text-xs font-semibold"
                            style={{ color }}
                          >
                            {t.count}
                          </span>
                        </div>
                      ))}
                      {mp!.top_topics.length === 0 && (
                        <p className="text-xs text-[#8b949e]">
                          No topic data available
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Policy Voting Scores */}
          {(profileA.policy_scores.length > 0 ||
            profileB.policy_scores.length > 0) && (
            <section className="pb-8 animate-fade-in-up stagger-5">
              <h2 className="text-xl font-bold text-[#e6edf3] mb-2">
                Policy Voting Scores
              </h2>
              <p className="text-sm text-[#8b949e] mb-4">
                Agreement percentage with key policy positions, sourced from
                They Vote For You.
              </p>
              <div className="rounded-xl border border-white/5 bg-[#12121a] p-5">
                <div className="space-y-4">
                  {RADAR_POLICIES.map((policy) => {
                    const scoreA = findPolicyScore(
                      profileA.policy_scores,
                      policy.keyword
                    );
                    const scoreB = findPolicyScore(
                      profileB.policy_scores,
                      policy.keyword
                    );
                    if (scoreA === null && scoreB === null) return null;
                    return (
                      <div key={policy.keyword}>
                        <div className="text-sm text-[#e6edf3] font-medium mb-2">
                          {policy.label} Reform
                        </div>
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-[#8b949e] w-32 truncate">
                              {profileA.full_name}
                            </span>
                            <div className="flex-1 h-5 rounded bg-white/5 overflow-hidden">
                              <div
                                className="h-full rounded flex items-center px-2 transition-all duration-700"
                                style={{
                                  width: `${Math.max(scoreA ?? 0, 3)}%`,
                                  backgroundColor: colorA,
                                  opacity: 0.7,
                                }}
                              >
                                {(scoreA ?? 0) > 15 && (
                                  <span className="text-[10px] font-bold text-white">
                                    {scoreA}%
                                  </span>
                                )}
                              </div>
                            </div>
                            {(scoreA ?? 0) <= 15 && (
                              <span
                                className="text-xs font-bold"
                                style={{ color: colorA }}
                              >
                                {scoreA ?? "N/A"}
                                {scoreA !== null ? "%" : ""}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-[#8b949e] w-32 truncate">
                              {profileB.full_name}
                            </span>
                            <div className="flex-1 h-5 rounded bg-white/5 overflow-hidden">
                              <div
                                className="h-full rounded flex items-center px-2 transition-all duration-700"
                                style={{
                                  width: `${Math.max(scoreB ?? 0, 3)}%`,
                                  backgroundColor: colorB,
                                  opacity: 0.7,
                                }}
                              >
                                {(scoreB ?? 0) > 15 && (
                                  <span className="text-[10px] font-bold text-white">
                                    {scoreB}%
                                  </span>
                                )}
                              </div>
                            </div>
                            {(scoreB ?? 0) <= 15 && (
                              <span
                                className="text-xs font-bold"
                                style={{ color: colorB }}
                              >
                                {scoreB ?? "N/A"}
                                {scoreB !== null ? "%" : ""}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>
          )}

          {/* Radar Chart */}
          {(profileA.policy_scores.length > 0 ||
            profileB.policy_scores.length > 0) && (
            <section className="pb-8 animate-fade-in-up stagger-6">
              <h2 className="text-xl font-bold text-[#e6edf3] mb-2">
                Policy Stance Radar
              </h2>
              <p className="text-sm text-[#8b949e] mb-4">
                Visual comparison of agreement with key reform policies.
              </p>
              <div className="rounded-xl border border-white/5 bg-[#12121a] p-4 md:p-6">
                <ResponsiveContainer width="100%" height={380}>
                  <RadarChart
                    data={buildRadarData(profileA, profileB)}
                    cx="50%"
                    cy="50%"
                    outerRadius="70%"
                  >
                    <PolarGrid
                      stroke="rgba(255,255,255,0.08)"
                      gridType="polygon"
                    />
                    <PolarAngleAxis
                      dataKey="policy"
                      tick={{
                        fill: "#8b949e",
                        fontSize: 12,
                      }}
                    />
                    <PolarRadiusAxis
                      angle={90}
                      domain={[0, 100]}
                      tick={{ fill: "#8b949e", fontSize: 10 }}
                      tickCount={5}
                    />
                    <Radar
                      name={profileA.full_name}
                      dataKey={profileA.full_name}
                      stroke={colorA}
                      fill={colorA}
                      fillOpacity={0.15}
                      strokeWidth={2}
                    />
                    <Radar
                      name={profileB.full_name}
                      dataKey={profileB.full_name}
                      stroke={colorB}
                      fill={colorB}
                      fillOpacity={0.15}
                      strokeWidth={2}
                    />
                    <Legend
                      wrapperStyle={{
                        color: "#8b949e",
                        fontSize: 12,
                      }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#12121a",
                        border: "1px solid rgba(255,255,255,0.1)",
                        borderRadius: 8,
                        color: "#e6edf3",
                        fontSize: 13,
                      }}
                      formatter={(value) => `${value}%`}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </section>
          )}

          {/* Top Party Donors */}
          {(profileA.top_party_donors?.length > 0 ||
            profileB.top_party_donors?.length > 0) && (
            <section className="pb-8 animate-fade-in-up stagger-7">
              <h2 className="text-xl font-bold text-[#e6edf3] mb-2">
                Top Donors to Party
              </h2>
              <p className="text-sm text-[#8b949e] mb-4">
                Largest declared donors from AEC returns to each MP&apos;s
                party.
              </p>
              <div className="grid grid-cols-2 gap-6">
                {[profileA, profileB].map((mp) => {
                  const color =
                    partyBorderColors[mp!.party] || "#888888";
                  const donors = mp!.top_party_donors || [];
                  return (
                    <div key={mp!.person_id}>
                      <h3
                        className="text-sm font-semibold mb-3"
                        style={{ color }}
                      >
                        {mp!.party}
                      </h3>
                      <div className="space-y-2">
                        {donors.slice(0, 5).map((d) => (
                          <div
                            key={d.donor_name}
                            className="rounded-lg border border-white/5 bg-[#0a0a0f] p-3 flex items-center justify-between"
                          >
                            <div>
                              <p className="text-sm text-[#e6edf3]">
                                {d.donor_name}
                              </p>
                              {d.industry && (
                                <p className="text-xs text-[#8b949e]">
                                  {d.industry}
                                </p>
                              )}
                            </div>
                            <span className="text-sm font-bold text-[#FFD700]">
                              $
                              {d.total >= 1000000
                                ? `${(d.total / 1000000).toFixed(1)}M`
                                : d.total >= 1000
                                  ? `${(d.total / 1000).toFixed(0)}K`
                                  : d.total.toLocaleString()}
                            </span>
                          </div>
                        ))}
                        {donors.length === 0 && (
                          <p className="text-xs text-[#8b949e]">
                            No donor data available
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Disconnect Score Comparison */}
          <section className="pb-20 animate-fade-in-up stagger-8">
            <h2 className="text-xl font-bold text-[#e6edf3] mb-2">
              Disconnect Score by Topic
            </h2>
            <p className="text-sm text-[#8b949e] mb-4">
              How closely does each MP&apos;s voting record match their
              rhetoric? Higher scores indicate greater disconnect between
              what they say and how they vote.
            </p>
            <div className="grid grid-cols-2 gap-6">
              {[profileA, profileB].map((mp) => {
                const disconnectData = buildDisconnectData(mp!);
                const color =
                  partyBorderColors[mp!.party] || "#888888";
                return (
                  <div key={mp!.person_id}>
                    <h3
                      className="text-sm font-semibold mb-3"
                      style={{ color }}
                    >
                      {mp!.full_name}
                    </h3>
                    <div className="space-y-4">
                      {disconnectData.map((d) => (
                        <DisconnectMeter
                          key={d.topic}
                          score={d.disconnect}
                          label={d.topic.replace(/_/g, " ")}
                          size="sm"
                        />
                      ))}
                      {disconnectData.length === 0 && (
                        <p className="text-xs text-[#8b949e]">
                          Insufficient data for disconnect analysis
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

/* ── Page wrapper with Suspense for useSearchParams ── */

export default function ComparePage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-6xl px-6 pt-20 text-center animate-fade-in-up">
          <div className="inline-block w-8 h-8 border-2 border-[#FFD700] border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-[#8b949e]">Loading compare tool...</p>
        </div>
      }
    >
      <CompareContent />
    </Suspense>
  );
}

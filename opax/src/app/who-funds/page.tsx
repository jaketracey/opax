"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { SkeletonCard, SkeletonChart, SkeletonTable, Skeleton } from "@/components/skeleton";

import { API_BASE } from "@/lib/utils";

/* ── Industry colors ── */
const INDUSTRY_COLORS: Record<string, string> = {
  finance: "#3B82F6",
  mining: "#F59E0B",
  unions: "#EF4444",
  tech: "#6366F1",
  property: "#8B5CF6",
  gambling: "#10B981",
  fossil_fuels: "#374151",
  legal: "#06B6D4",
  pharmacy: "#EC4899",
  health: "#F472B6",
  hospitality: "#D97706",
  agriculture: "#84CC16",
  lobbying: "#A855F7",
  telecom: "#14B8A6",
  retail: "#FB923C",
  tobacco: "#78716C",
  alcohol: "#FBBF24",
  media: "#2DD4BF",
};

const INDUSTRY_ICONS: Record<string, string> = {
  gambling: "\uD83C\uDFB0",
  mining: "\u26CF\uFE0F",
  fossil_fuels: "\uD83C\uDFED",
  finance: "\uD83C\uDFE6",
  property: "\uD83C\uDFE0",
  unions: "\u270A",
  tech: "\uD83D\uDCBB",
  health: "\uD83C\uDFE5",
  agriculture: "\uD83C\uDF3E",
  legal: "\u2696\uFE0F",
  pharmacy: "\uD83D\uDC8A",
  hospitality: "\uD83C\uDF7D\uFE0F",
  lobbying: "\uD83E\uDD1D",
  telecom: "\uD83D\uDCF1",
  retail: "\uD83D\uDED2",
  tobacco: "\uD83D\uDEAC",
  alcohol: "\uD83C\uDF7A",
  media: "\uD83D\uDCFA",
};

/* ── Party display helpers ── */
function partyShort(party: string): string {
  if (!party) return "Unknown";
  if (party.includes("Labor") || party.includes("ALP")) return "Labor";
  if (party.includes("Liberal National")) return "LNP";
  if (party.includes("Liberal")) return "Liberal";
  if (party.includes("National")) return "Nationals";
  if (party.includes("Green")) return "Greens";
  if (party.includes("Independent")) return "Independent";
  return party;
}

function partyColor(party: string): string {
  const p = partyShort(party);
  const colors: Record<string, string> = {
    Labor: "#E13A3A",
    Liberal: "#1C4FA0",
    LNP: "#1C4FA0",
    Nationals: "#006644",
    Greens: "#00843D",
    Independent: "#8B5CF6",
  };
  return colors[p] || "#8b949e";
}

/* ── Format amounts ── */
function fmtAmount(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

/* ── Types ── */
interface MPData {
  person_id: string;
  full_name: string;
  party: string;
  electorate: string;
  photo_url: string;
}

interface IndustryBreakdown {
  industry: string;
  total: number;
}

interface TopDonor {
  name: string;
  total: number;
  industry: string | null;
}

interface FactCard {
  industry: string;
  industry_label: string;
  icon: string;
  donation_total: number;
  policy_name: string;
  agreement: number;
  description: string;
}

interface WhoFundsData {
  mp: MPData;
  industry_breakdown: IndustryBreakdown[];
  top_donors: TopDonor[];
  fact_cards: FactCard[];
  electorate: string;
  error?: string;
}

interface Electorate {
  electorate: string;
  mp: string;
  party: string;
  person_id: string;
}

/* ── Custom Tooltip ── */
function PieTooltip({ active, payload }: { active?: boolean; payload?: Array<{ name: string; value: number; payload: { fill: string } }> }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-white/10 bg-[#1a1a2e] px-4 py-2 shadow-xl">
      <p className="text-sm font-medium text-[#e6edf3]">
        {payload[0].name}
      </p>
      <p className="text-lg font-bold" style={{ color: payload[0].payload.fill }}>
        {fmtAmount(payload[0].value)}
      </p>
    </div>
  );
}

/* ── Main Component ── */
export default function WhoFundsPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [data, setData] = useState<WhoFundsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [electorates, setElectorates] = useState<Electorate[]>([]);
  const [suggestions, setSuggestions] = useState<Electorate[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // Load electorates for autocomplete
  useEffect(() => {
    fetch(`${API_BASE}/api/who-funds-electorates`)
      .then((r) => r.json())
      .then((d) => setElectorates(d.electorates || []))
      .catch(() => {});
  }, []);

  // Auto-search if redirected from /who-funds/[electorate]
  useEffect(() => {
    const autoSearch = sessionStorage.getItem("who-funds-auto-search");
    if (autoSearch) {
      sessionStorage.removeItem("who-funds-auto-search");
      setQuery(autoSearch);
      doSearch(autoSearch);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Filter suggestions
  useEffect(() => {
    if (!query.trim() || query.length < 2) {
      setSuggestions([]);
      return;
    }
    const q = query.toLowerCase();
    // Check if it's a postcode (all digits)
    if (/^\d+$/.test(q)) {
      setSuggestions([]);
      return;
    }
    const filtered = electorates.filter(
      (e) =>
        e.electorate.toLowerCase().includes(q) ||
        e.mp.toLowerCase().includes(q)
    );
    setSuggestions(filtered.slice(0, 8));
  }, [query, electorates]);

  // Close suggestions on click outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const doSearch = useCallback(
    async (searchQuery: string) => {
      if (!searchQuery.trim()) return;
      setLoading(true);
      setError("");
      setData(null);
      setShowSuggestions(false);
      try {
        const res = await fetch(
          `${API_BASE}/api/who-funds/${encodeURIComponent(searchQuery.trim())}`
        );
        const d = await res.json();
        if (d.error) {
          setError(d.error);
        } else {
          setData(d);
          // Update URL without full navigation
          window.history.pushState(
            {},
            "",
            `/who-funds/${encodeURIComponent(d.electorate)}`
          );
        }
      } catch {
        setError("Could not connect to the API. Make sure the server is running.");
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    doSearch(query);
  };

  const selectSuggestion = (electorate: string) => {
    setQuery(electorate);
    setShowSuggestions(false);
    doSearch(electorate);
  };

  // Prepare donut chart data
  const pieData = data
    ? data.industry_breakdown.slice(0, 8).map((d) => ({
        name: d.industry.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
        value: d.total,
        fill: INDUSTRY_COLORS[d.industry] || "#8b949e",
      }))
    : [];

  // Combine remaining into "Other"
  if (data && data.industry_breakdown.length > 8) {
    const otherTotal = data.industry_breakdown
      .slice(8)
      .reduce((sum, d) => sum + d.total, 0);
    pieData.push({ name: "Other", value: otherTotal, fill: "#4B5563" });
  }

  const totalDonations = pieData.reduce((sum, d) => sum + d.value, 0);

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-[#FFD700]/5 via-transparent to-transparent" />
        <div className="relative mx-auto max-w-4xl px-6 pt-16 pb-12 text-center animate-fade-in-up">
          <h1 className="text-5xl font-bold tracking-tight text-[#e6edf3] sm:text-6xl">
            Who Funds{" "}
            <span className="text-[#FFD700]">Your MP?</span>
          </h1>
          <p className="mt-4 text-lg text-[#8b949e] max-w-2xl mx-auto">
            Enter your postcode or electorate to see where your representative&apos;s
            party gets its money — and how they vote on the issues that matter.
          </p>

          {/* Search */}
          <form onSubmit={handleSubmit} className="relative mt-10 max-w-2xl mx-auto">
            <div className="relative">
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setShowSuggestions(true);
                }}
                onFocus={() => setShowSuggestions(true)}
                placeholder="Enter your postcode or electorate..."
                className="w-full rounded-2xl border-2 border-[#FFD700]/30 bg-[#12121a] px-8 py-6 text-xl text-[#e6edf3] placeholder-[#8b949e]/60 shadow-lg shadow-[#FFD700]/5 outline-none transition-all focus:border-[#FFD700]/60 focus:shadow-[#FFD700]/10"
              />
              <button
                type="submit"
                disabled={loading}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-xl bg-[#FFD700] px-6 py-3 text-base font-semibold text-[#0a0a0f] transition-all hover:bg-[#FFD700]/90 disabled:opacity-50"
              >
                {loading ? "Searching..." : "Search"}
              </button>
            </div>

            {/* Autocomplete suggestions */}
            {showSuggestions && suggestions.length > 0 && (
              <div
                ref={suggestionsRef}
                className="absolute left-0 right-0 top-full z-50 mt-2 rounded-xl border border-white/10 bg-[#12121a] shadow-2xl overflow-hidden"
              >
                {suggestions.map((s) => (
                  <button
                    key={`${s.electorate}-${s.person_id}`}
                    type="button"
                    onClick={() => selectSuggestion(s.electorate)}
                    className="flex w-full items-center justify-between px-6 py-3 text-left transition-colors hover:bg-white/5"
                  >
                    <div>
                      <span className="text-[#e6edf3] font-medium">
                        {s.electorate}
                      </span>
                      <span className="ml-3 text-sm text-[#8b949e]">
                        {s.mp}
                      </span>
                    </div>
                    <span
                      className="text-xs px-2 py-0.5 rounded-md"
                      style={{
                        color: partyColor(s.party),
                        backgroundColor: `${partyColor(s.party)}20`,
                      }}
                    >
                      {partyShort(s.party)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </form>

          {/* Quick examples */}
          <div className="mt-6 flex flex-wrap justify-center gap-2 text-sm text-[#8b949e]">
            <span>Try:</span>
            {["3000", "2000", "Grayndler", "Kooyong", "Warringah", "Melbourne"].map(
              (ex) => (
                <button
                  key={ex}
                  onClick={() => {
                    setQuery(ex);
                    doSearch(ex);
                  }}
                  className="rounded-md border border-white/10 px-3 py-1 transition-colors hover:border-[#FFD700]/30 hover:text-[#FFD700]"
                >
                  {ex}
                </button>
              )
            )}
          </div>
        </div>
      </section>

      {/* Loading skeleton */}
      {loading && (
        <section className="mx-auto max-w-5xl px-6 pb-20">
          {/* MP card skeleton */}
          <div className="mb-10 flex items-center gap-6 rounded-2xl border border-white/5 bg-[#12121a] p-8">
            <Skeleton className="h-28 w-28 rounded-full shrink-0" />
            <div className="flex-1 space-y-3">
              <Skeleton className="h-7 w-48" />
              <div className="flex items-center gap-3">
                <Skeleton className="h-6 w-20 rounded-md" />
                <Skeleton className="h-4 w-32" />
              </div>
              <Skeleton className="h-4 w-56" />
            </div>
          </div>
          {/* Charts skeleton */}
          <div className="grid gap-8 md:grid-cols-2">
            <SkeletonChart height={480} />
            <div className="rounded-2xl border border-white/5 bg-[#12121a] p-8">
              <Skeleton className="h-5 w-48 mb-6" />
              <div className="space-y-5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i}>
                    <div className="flex items-center justify-between mb-2">
                      <Skeleton className="h-4 w-40" style={{ animationDelay: `${i * 80}ms` }} />
                      <Skeleton className="h-4 w-16" style={{ animationDelay: `${i * 80 + 40}ms` }} />
                    </div>
                    <Skeleton className="h-2 w-full rounded-full" style={{ animationDelay: `${i * 80 + 60}ms` }} />
                  </div>
                ))}
              </div>
            </div>
          </div>
          {/* Fact cards skeleton */}
          <div className="mt-10">
            <Skeleton className="h-5 w-40 mb-6" />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <SkeletonCard key={i} className="rounded-2xl" />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Error */}
      {error && (
        <div className="mx-auto max-w-4xl px-6 py-8 animate-fade-in-up">
          <div className="rounded-xl border border-red-500/30 bg-red-900/10 px-6 py-4 text-red-400">
            {error}
          </div>
        </div>
      )}

      {/* Results */}
      {data && (
        <section className="mx-auto max-w-5xl px-6 pb-20">
          {/* MP Card */}
          <div className="mb-10 flex items-center gap-6 rounded-2xl border border-white/5 bg-[#12121a] p-8 animate-fade-in-up">
            <img
              src={data.mp.photo_url}
              alt={data.mp.full_name}
              className="h-28 w-28 rounded-full border-4 object-cover"
              style={{ borderColor: partyColor(data.mp.party) }}
              onError={(e) => {
                (e.target as HTMLImageElement).src =
                  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='35' r='20' fill='%23666'/%3E%3Cellipse cx='50' cy='80' rx='30' ry='20' fill='%23666'/%3E%3C/svg%3E";
              }}
            />
            <div className="flex-1">
              <h2 className="text-3xl font-bold text-[#e6edf3]">
                {data.mp.full_name}
              </h2>
              <div className="mt-1 flex items-center gap-3">
                <span
                  className="inline-flex items-center rounded-md border px-3 py-1 text-sm font-medium"
                  style={{
                    color: partyColor(data.mp.party),
                    borderColor: `${partyColor(data.mp.party)}50`,
                    backgroundColor: `${partyColor(data.mp.party)}15`,
                  }}
                >
                  {partyShort(data.mp.party)}
                </span>
                <span className="text-[#8b949e]">
                  Member for {data.electorate}
                </span>
              </div>
              <p className="mt-3 text-sm text-[#8b949e]">
                Total declared donations to {partyShort(data.mp.party)}:{" "}
                <span className="text-[#FFD700] font-semibold text-base">
                  {fmtAmount(totalDonations)}
                </span>
              </p>
            </div>
            {/* Share button */}
            <button
              onClick={() => {
                const url = `${window.location.origin}/who-funds/${encodeURIComponent(data.electorate)}`;
                navigator.clipboard.writeText(url);
                alert("Link copied to clipboard!");
              }}
              className="rounded-lg border border-white/10 px-4 py-2 text-sm text-[#8b949e] transition-colors hover:border-[#FFD700]/30 hover:text-[#FFD700]"
            >
              Share this
            </button>
          </div>

          {/* Money Pie + Top Donors side by side */}
          <div className="grid gap-8 md:grid-cols-2 animate-fade-in-up stagger-2">
            {/* Donut Chart */}
            <div className="rounded-2xl border border-white/5 bg-[#12121a] p-8">
              <h3 className="mb-6 text-xl font-bold text-[#e6edf3]">
                Money Pie: Donations by Industry
              </h3>
              <div className="h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={70}
                      outerRadius={120}
                      paddingAngle={2}
                      dataKey="value"
                      stroke="none"
                    >
                      {pieData.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip content={<PieTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              {/* Legend */}
              <div className="mt-4 grid grid-cols-2 gap-2">
                {pieData.map((d) => (
                  <div key={d.name} className="flex items-center gap-2 text-sm">
                    <span
                      className="h-3 w-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: d.fill }}
                    />
                    <span className="text-[#8b949e] truncate">{d.name}</span>
                    <span className="text-[#e6edf3] font-medium ml-auto">
                      {fmtAmount(d.value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Top 5 Donors */}
            <div className="rounded-2xl border border-white/5 bg-[#12121a] p-8">
              <h3 className="mb-6 text-xl font-bold text-[#e6edf3]">
                Top 5 Donors to {partyShort(data.mp.party)}
              </h3>
              <div className="space-y-4">
                {data.top_donors.map((donor, i) => {
                  const pct = data.top_donors[0]?.total
                    ? (donor.total / data.top_donors[0].total) * 100
                    : 0;
                  return (
                    <div key={i}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-lg">
                            {donor.industry
                              ? INDUSTRY_ICONS[donor.industry] || "\uD83D\uDCB0"
                              : "\uD83D\uDCB0"}
                          </span>
                          <span className="text-[#e6edf3] font-medium truncate">
                            {donor.name}
                          </span>
                        </div>
                        <span className="text-[#FFD700] font-bold ml-4 flex-shrink-0">
                          {fmtAmount(donor.total)}
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${pct}%`,
                            backgroundColor:
                              donor.industry
                                ? INDUSTRY_COLORS[donor.industry] || "#FFD700"
                                : "#FFD700",
                          }}
                        />
                      </div>
                      {donor.industry && (
                        <span className="mt-1 inline-block text-xs text-[#8b949e]">
                          {donor.industry.replace(/_/g, " ")}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Fact Cards -- the kicker */}
          {data.fact_cards.length > 0 && (
            <div className="mt-10 animate-fade-in-up stagger-4">
              <h3 className="mb-6 text-xl font-bold text-[#e6edf3]">
                Follow the Money
              </h3>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {data.fact_cards.map((card, i) => {
                  const icon = INDUSTRY_ICONS[card.industry] || "\uD83D\uDCB0";
                  const votedFor = card.agreement >= 50;
                  return (
                    <div
                      key={i}
                      className="rounded-2xl border border-white/5 bg-[#12121a] p-6 transition-all hover:border-[#FFD700]/20"
                    >
                      <div className="text-4xl mb-4">{icon}</div>
                      <p className="text-[#8b949e] text-sm mb-2">
                        The{" "}
                        <span className="text-[#e6edf3] font-medium">
                          {card.industry_label.toLowerCase()}
                        </span>{" "}
                        industry gave {partyShort(data.mp.party)}
                      </p>
                      <p className="text-2xl font-bold text-[#FFD700] mb-4">
                        {fmtAmount(card.donation_total)}
                      </p>
                      <div
                        className={`rounded-lg px-4 py-3 ${
                          votedFor
                            ? "bg-green-900/20 border border-green-800/30"
                            : "bg-red-900/20 border border-red-800/30"
                        }`}
                      >
                        <p className="text-sm">
                          <span className="text-[#e6edf3]">
                            Your MP voted{" "}
                            <span
                              className={`font-bold ${
                                votedFor ? "text-green-400" : "text-red-400"
                              }`}
                            >
                              {votedFor ? "FOR" : "AGAINST"}
                            </span>{" "}
                          </span>
                          <span className="text-[#8b949e]">
                            {card.policy_name}
                          </span>
                          <span className="text-[#e6edf3] font-bold">
                            {" "}
                            {card.agreement}%
                          </span>
                          <span className="text-[#8b949e]"> of the time</span>
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* CTA */}
          <div className="mt-12 text-center animate-fade-in-up stagger-6">
            <p className="text-[#8b949e] mb-4">
              Data sourced from AEC donation disclosures and TheyVoteForYou.org.au
            </p>
            <div className="flex justify-center gap-4">
              <Link
                href="/donations"
                className="rounded-lg border border-white/10 px-6 py-2.5 text-sm text-[#8b949e] transition-colors hover:border-[#FFD700]/30 hover:text-[#FFD700]"
              >
                Explore all donations
              </Link>
              <Link
                href="/gambling"
                className="rounded-lg border border-white/10 px-6 py-2.5 text-sm text-[#8b949e] transition-colors hover:border-[#FFD700]/30 hover:text-[#FFD700]"
              >
                Deep dive: Gambling
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* No results, show explainer */}
      {!data && !loading && !error && (
        <section className="mx-auto max-w-4xl px-6 pb-20 animate-fade-in-up stagger-2">
          <div className="grid gap-6 sm:grid-cols-3">
            {[
              {
                icon: "\uD83D\uDD0D",
                title: "1. Search",
                desc: "Enter your postcode or electorate name",
              },
              {
                icon: "\uD83D\uDCCA",
                title: "2. See the money",
                desc: "View who donates to your MP's party, broken down by industry",
              },
              {
                icon: "\uD83D\uDDF3\uFE0F",
                title: "3. Connect the dots",
                desc: "See how your MP votes on the issues those industries care about",
              },
            ].map((step) => (
              <div
                key={step.title}
                className="rounded-2xl border border-white/5 bg-[#12121a] p-8 text-center"
              >
                <div className="text-4xl mb-4">{step.icon}</div>
                <h3 className="text-lg font-bold text-[#e6edf3] mb-2">
                  {step.title}
                </h3>
                <p className="text-sm text-[#8b949e]">{step.desc}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

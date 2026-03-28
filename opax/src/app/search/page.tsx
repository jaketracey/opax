"use client";

import { useState, useCallback, useRef, useEffect, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Markdown from "react-markdown";
import { PartyBadge } from "@/components/party-badge";

import { API_BASE, getPhotoUrl } from "@/lib/utils";

type SearchMode = "hybrid" | "semantic" | "keyword";

interface SpeechResult {
  speech_id: number;
  person_id?: number | null;
  speaker_name: string | null;
  party: string | null;
  date: string | null;
  topic: string | null;
  text: string;
  similarity_score: number;
  source?: string | null;
}

interface AskResult {
  answer: string | null;
  context: string;
  sources: Array<{
    speech_id: number;
    speaker_name: string;
    party: string;
    date: string;
    topic: string;
    text?: string;
  }>;
  error?: string;
}

interface Filters {
  parties: Set<string>;
  dateFrom: string;
  dateTo: string;
  chambers: Set<string>;
  topicFilter: string;
}

const PARTY_OPTIONS = ["Labor", "Liberal", "Greens", "Nationals", "Independent", "Other"] as const;

const PARTY_PILL_COLORS: Record<string, { active: string; inactive: string }> = {
  Labor: {
    active: "border-red-500/40 bg-red-900/30 text-red-400",
    inactive: "border-white/10 text-[#8b949e] hover:border-red-800/40 hover:text-red-400/70",
  },
  Liberal: {
    active: "border-blue-500/40 bg-blue-900/30 text-blue-400",
    inactive: "border-white/10 text-[#8b949e] hover:border-blue-800/40 hover:text-blue-400/70",
  },
  Greens: {
    active: "border-green-500/40 bg-green-900/30 text-green-400",
    inactive: "border-white/10 text-[#8b949e] hover:border-green-800/40 hover:text-green-400/70",
  },
  Nationals: {
    active: "border-yellow-500/40 bg-yellow-900/30 text-yellow-500",
    inactive: "border-white/10 text-[#8b949e] hover:border-yellow-800/40 hover:text-yellow-500/70",
  },
  Independent: {
    active: "border-purple-500/40 bg-purple-900/30 text-purple-400",
    inactive: "border-white/10 text-[#8b949e] hover:border-purple-800/40 hover:text-purple-400/70",
  },
  Other: {
    active: "border-zinc-500/40 bg-zinc-800/30 text-zinc-400",
    inactive: "border-white/10 text-[#8b949e] hover:border-zinc-700/40 hover:text-zinc-400/70",
  },
};

const CHAMBER_OPTIONS = [
  { value: "federal", label: "Federal" },
  { value: "senate_committee", label: "Senate Committee" },
  { value: "nsw", label: "NSW" },
  { value: "vic", label: "VIC" },
] as const;

const TOPIC_OPTIONS = [
  "All Topics",
  "Climate & Environment",
  "Economy & Budget",
  "Education",
  "Foreign Affairs & Defence",
  "Gambling & Gaming",
  "Health & Medicare",
  "Housing & Property",
  "Immigration",
  "Indigenous Affairs",
  "Infrastructure & Transport",
  "Justice & Law",
  "Media & Communications",
  "Political Donations",
  "Social Services & Welfare",
  "Tax Policy",
  "Trade & Industry",
] as const;

const modeLabels: Record<SearchMode, { label: string; desc: string }> = {
  hybrid: { label: "Hybrid", desc: "Combines semantic understanding with keyword matching" },
  semantic: { label: "Semantic", desc: "Finds speeches by meaning, not just words" },
  keyword: { label: "Keyword", desc: "Traditional full-text search" },
};

const POPULAR_QUESTIONS = [
  {
    question: "Which MPs voted against gambling reform while taking industry money?",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    color: "from-red-500/10 to-transparent border-red-500/10 hover:border-red-500/25",
    tagColor: "text-red-400/70",
    tag: "Accountability",
  },
  {
    question: "What did Parliament say about housing affordability?",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
    color: "from-sky-500/10 to-transparent border-sky-500/10 hover:border-sky-500/25",
    tagColor: "text-sky-400/70",
    tag: "Housing",
  },
  {
    question: "How much did the mining industry donate?",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
      </svg>
    ),
    color: "from-amber-500/10 to-transparent border-amber-500/10 hover:border-amber-500/25",
    tagColor: "text-amber-400/70",
    tag: "Donations",
  },
  {
    question: "Who blocked the anti-corruption commission?",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
      </svg>
    ),
    color: "from-violet-500/10 to-transparent border-violet-500/10 hover:border-violet-500/25",
    tagColor: "text-violet-400/70",
    tag: "Integrity",
  },
];

const SUGGESTED_SEARCHES: Array<{ topic: string; queries: string[]; emoji: string }> = [
  {
    topic: "Gambling",
    emoji: "🎰",
    queries: [
      "Who defended pokies reform?",
      "poker machines harm communities",
      "gambling industry donations",
    ],
  },
  {
    topic: "Housing",
    emoji: "🏠",
    queries: [
      "What did Morrison say about first home buyers?",
      "housing affordability crisis",
      "negative gearing debate",
    ],
  },
  {
    topic: "Climate",
    emoji: "🌏",
    queries: [
      "Which MPs opposed the carbon tax?",
      "renewable energy targets",
      "climate change policy",
    ],
  },
  {
    topic: "Health",
    emoji: "🏥",
    queries: [
      "Medicare funding cuts",
      "mental health support programs",
      "hospital waiting times",
    ],
  },
  {
    topic: "Economy",
    emoji: "📊",
    queries: [
      "budget surplus or deficit",
      "wage growth stagnation",
      "political donation reform",
    ],
  },
];

// --- Utilities ---

function highlightTerms(text: string, query: string): string {
  if (!query.trim()) return text;
  const terms = query.split(/\s+/).filter((t) => t.length > 2);
  if (terms.length === 0) return text;
  const pattern = new RegExp(
    `(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`,
    "gi"
  );
  return text.replace(
    pattern,
    '<mark class="bg-[#FFD700]/20 text-[#FFD700] rounded px-0.5">$1</mark>'
  );
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-AU", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function normalizeParty(party: string | null): string {
  if (!party) return "Other";
  const p = party.toLowerCase();
  if (p.includes("labor") || p.includes("alp")) return "Labor";
  if (p.includes("liberal")) return "Liberal";
  if (p.includes("green")) return "Greens";
  if (p.includes("national")) return "Nationals";
  if (p.includes("independent")) return "Independent";
  return "Other";
}

function sourceBadgeLabel(source: string | null | undefined): string {
  if (!source) return "Hansard";
  const s = source.toLowerCase();
  if (s.includes("committee")) return "Committee";
  if (s.includes("nsw")) return "NSW";
  if (s.includes("vic")) return "VIC";
  return "Hansard";
}

const sourceBadgeColor: Record<string, string> = {
  Hansard: "border-cyan-800/50 bg-cyan-900/30 text-cyan-400",
  Committee: "border-violet-800/50 bg-violet-900/30 text-violet-400",
  NSW: "border-sky-800/50 bg-sky-900/30 text-sky-400",
  VIC: "border-teal-800/50 bg-teal-900/30 text-teal-400",
};

function deriveConfidence(sources: AskResult["sources"], answer: string | null): "high" | "medium" | "low" {
  if (!answer) return "low";
  if (sources.length >= 8) return "high";
  if (sources.length >= 3) return "medium";
  return "low";
}

const confidenceBadge: Record<string, { label: string; cls: string }> = {
  high: { label: "High confidence", cls: "bg-green-900/30 text-green-400 border-green-800/50" },
  medium: { label: "Medium confidence", cls: "bg-yellow-900/30 text-yellow-500 border-yellow-800/50" },
  low: { label: "Low confidence", cls: "bg-red-900/30 text-red-400 border-red-800/50" },
};

// --- Search history (localStorage) ---

const HISTORY_KEY = "opax_search_history";
const MAX_HISTORY = 5;

function loadHistory(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveHistory(query: string) {
  if (typeof window === "undefined") return;
  try {
    const prev = loadHistory().filter((q) => q !== query);
    const next = [query, ...prev].slice(0, MAX_HISTORY);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

// --- Loading animation for Ask mode ---

function AskLoadingAnimation() {
  const phrases = [
    "Searching 831K speeches...",
    "Analysing parliamentary records...",
    "Cross-referencing sources...",
  ];
  const [phraseIdx, setPhraseIdx] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setPhraseIdx((i) => (i + 1) % phrases.length);
    }, 2400);
    return () => clearInterval(interval);
  }, [phrases.length]);

  return (
    <div className="mb-8 animate-fade-in-up">
      <div className="rounded-xl border border-[#FFD700]/10 bg-gradient-to-b from-[#FFD700]/[0.03] to-transparent p-8 flex flex-col items-center gap-4">
        {/* Rotating dots */}
        <div className="relative w-10 h-10">
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className="absolute w-2 h-2 rounded-full bg-[#FFD700]"
              style={{
                top: "50%",
                left: "50%",
                transform: `rotate(${i * 90}deg) translateY(-14px) translateX(-50%)`,
                animation: `pulse-dot 1.2s ease-in-out ${i * 0.3}s infinite`,
              }}
            />
          ))}
        </div>
        <p className="text-sm text-[#8b949e] transition-opacity duration-300">
          {phrases[phraseIdx]}
        </p>
      </div>
    </div>
  );
}

// --- Sources summary ---

function SourcesSummary({ sources }: { sources: AskResult["sources"] }) {
  const summary = useMemo(() => {
    const parties = new Set<string>();
    const dates = new Set<string>();
    for (const s of sources) {
      if (s.party) parties.add(normalizeParty(s.party));
      if (s.date) {
        const year = s.date.slice(0, 4);
        dates.add(year);
      }
    }
    return { speeches: sources.length, parties: parties.size, years: dates.size };
  }, [sources]);

  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-[#8b949e]">
      <span className="flex items-center gap-1.5">
        <svg className="w-3.5 h-3.5 text-[#FFD700]/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
        </svg>
        {summary.speeches} speeches
      </span>
      <span className="text-white/15">|</span>
      <span className="flex items-center gap-1.5">
        <svg className="w-3.5 h-3.5 text-[#FFD700]/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        {summary.parties} parties
      </span>
      <span className="text-white/15">|</span>
      <span className="flex items-center gap-1.5">
        <svg className="w-3.5 h-3.5 text-[#FFD700]/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        {summary.years} year{summary.years !== 1 ? "s" : ""} span
      </span>
    </div>
  );
}

// --- Filter bar component ---

function FilterBar({
  filters,
  setFilters,
  filtersOpen,
  setFiltersOpen,
}: {
  filters: Filters;
  setFilters: React.Dispatch<React.SetStateAction<Filters>>;
  filtersOpen: boolean;
  setFiltersOpen: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const toggleParty = (p: string) => {
    setFilters((prev) => {
      const next = new Set(prev.parties);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return { ...prev, parties: next };
    });
  };

  const toggleChamber = (c: string) => {
    setFilters((prev) => {
      const next = new Set(prev.chambers);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return { ...prev, chambers: next };
    });
  };

  const activeCount =
    filters.parties.size +
    filters.chambers.size +
    (filters.dateFrom ? 1 : 0) +
    (filters.dateTo ? 1 : 0) +
    (filters.topicFilter !== "All Topics" ? 1 : 0);

  const clearAll = () => {
    setFilters({
      parties: new Set(),
      dateFrom: "",
      dateTo: "",
      chambers: new Set(),
      topicFilter: "All Topics",
    });
  };

  return (
    <div className="mb-4">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setFiltersOpen(!filtersOpen)}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-colors ${
            filtersOpen || activeCount > 0
              ? "border-[#FFD700]/30 bg-[#FFD700]/5 text-[#FFD700]"
              : "border-white/10 bg-[#12121a] text-[#8b949e] hover:text-[#e6edf3] hover:border-white/15"
          }`}
        >
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
            />
          </svg>
          Filters
          {activeCount > 0 && (
            <span className="ml-1 w-4 h-4 flex items-center justify-center rounded-full bg-[#FFD700] text-[#0a0a0f] text-[10px] font-bold">
              {activeCount}
            </span>
          )}
        </button>
        {activeCount > 0 && (
          <button
            onClick={clearAll}
            className="text-xs text-[#8b949e] hover:text-[#e6edf3] transition-colors"
          >
            Clear all
          </button>
        )}
      </div>

      <div
        className={`overflow-hidden transition-all duration-300 ease-in-out ${
          filtersOpen ? "max-h-[500px] opacity-100 mt-3" : "max-h-0 opacity-0 mt-0"
        }`}
      >
        <div className="rounded-xl border border-white/5 bg-[#12121a] p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Party filter -- colored pills */}
            <div>
              <label className="block text-xs font-medium text-[#8b949e] uppercase tracking-wider mb-2">
                Party
              </label>
              <div className="flex flex-wrap gap-1.5">
                {PARTY_OPTIONS.map((p) => {
                  const colors = PARTY_PILL_COLORS[p] || PARTY_PILL_COLORS.Other;
                  return (
                    <button
                      key={p}
                      onClick={() => toggleParty(p)}
                      className={`px-2.5 py-1 text-xs rounded-md border transition-all duration-200 ${
                        filters.parties.has(p) ? colors.active : colors.inactive
                      }`}
                    >
                      {p === "Labor" ? "ALP" : p}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Date range */}
            <div>
              <label className="block text-xs font-medium text-[#8b949e] uppercase tracking-wider mb-2">
                Date Range
              </label>
              <div className="flex gap-2">
                <input
                  type="date"
                  value={filters.dateFrom}
                  onChange={(e) =>
                    setFilters((prev) => ({ ...prev, dateFrom: e.target.value }))
                  }
                  className="flex-1 h-8 rounded-md border border-white/10 bg-[#0a0a0f] px-2 text-xs text-[#e6edf3] focus:outline-none focus:border-[#FFD700]/40 [color-scheme:dark]"
                  placeholder="From"
                />
                <input
                  type="date"
                  value={filters.dateTo}
                  onChange={(e) =>
                    setFilters((prev) => ({ ...prev, dateTo: e.target.value }))
                  }
                  className="flex-1 h-8 rounded-md border border-white/10 bg-[#0a0a0f] px-2 text-xs text-[#e6edf3] focus:outline-none focus:border-[#FFD700]/40 [color-scheme:dark]"
                  placeholder="To"
                />
              </div>
            </div>

            {/* Chamber */}
            <div>
              <label className="block text-xs font-medium text-[#8b949e] uppercase tracking-wider mb-2">
                Chamber
              </label>
              <div className="flex flex-wrap gap-1.5">
                {CHAMBER_OPTIONS.map((c) => (
                  <button
                    key={c.value}
                    onClick={() => toggleChamber(c.value)}
                    className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                      filters.chambers.has(c.value)
                        ? "border-[#FFD700]/40 bg-[#FFD700]/10 text-[#FFD700]"
                        : "border-white/10 text-[#8b949e] hover:text-[#e6edf3] hover:border-white/20"
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Topic */}
            <div>
              <label className="block text-xs font-medium text-[#8b949e] uppercase tracking-wider mb-2">
                Topic
              </label>
              <select
                value={filters.topicFilter}
                onChange={(e) =>
                  setFilters((prev) => ({
                    ...prev,
                    topicFilter: e.target.value,
                  }))
                }
                className="w-full h-8 rounded-md border border-white/10 bg-[#0a0a0f] px-2 text-xs text-[#e6edf3] focus:outline-none focus:border-[#FFD700]/40 [color-scheme:dark]"
              >
                {TOPIC_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Faceted result counts ---

function FacetCounts({ results }: { results: SpeechResult[] }) {
  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of results) {
      const p = normalizeParty(r.party);
      map[p] = (map[p] || 0) + 1;
    }
    return map;
  }, [results]);

  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#8b949e] mb-4">
      <span className="font-medium text-[#e6edf3]">
        Found {results.length} results
      </span>
      <span className="text-white/20">|</span>
      {entries.map(([party, count]) => (
        <span key={party} className="flex items-center gap-1">
          <span>{count}</span>
          <span className="text-[#8b949e]/70">{party}</span>
        </span>
      ))}
    </div>
  );
}

// --- Main component ---

function SearchPageInner() {
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q") || "";
  const initialMode = searchParams.get("mode");
  const [query, setQuery] = useState(initialQuery);
  const [mode, setMode] = useState<SearchMode>("hybrid");
  const [results, setResults] = useState<SpeechResult[]>([]);
  const [askResult, setAskResult] = useState<AskResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [expandedSourceIds, setExpandedSourceIds] = useState<Set<number>>(new Set());
  const [sourcesCollapsed, setSourcesCollapsed] = useState(true);
  const [isAskMode, setIsAskMode] = useState(initialMode !== "search");
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<Filters>({
    parties: new Set(),
    dateFrom: "",
    dateTo: "",
    chambers: new Set(),
    topicFilter: "All Topics",
  });
  const [textareaFocused, setTextareaFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const didAutoSearch = useRef(false);

  // Load search history on mount
  useEffect(() => {
    setSearchHistory(loadHistory());
  }, []);

  // Apply client-side filters to results
  const filteredResults = useMemo(() => {
    return results.filter((r) => {
      if (filters.parties.size > 0) {
        const normalized = normalizeParty(r.party);
        if (!filters.parties.has(normalized)) return false;
      }
      if (filters.dateFrom && r.date && r.date < filters.dateFrom) return false;
      if (filters.dateTo && r.date && r.date > filters.dateTo) return false;
      if (filters.chambers.size > 0 && r.source) {
        const label = sourceBadgeLabel(r.source).toLowerCase();
        const matches = Array.from(filters.chambers).some((c) => {
          if (c === "federal") return label === "hansard";
          if (c === "senate_committee") return label === "committee";
          return label === c;
        });
        if (!matches) return false;
      }
      if (filters.topicFilter !== "All Topics" && r.topic) {
        if (!r.topic.toLowerCase().includes(filters.topicFilter.toLowerCase().split(" ")[0].toLowerCase())) {
          return false;
        }
      }
      return true;
    });
  }, [results, filters]);

  const doSearch = useCallback(async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    setHasSearched(true);
    setAskResult(null);
    setResults([]);
    setExpandedIds(new Set());
    setExpandedSourceIds(new Set());
    setSourcesCollapsed(true);

    saveHistory(query.trim());
    setSearchHistory(loadHistory());

    try {
      if (isAskMode) {
        const resp = await fetch(`${API_BASE}/api/ask`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: query, top_k: 20 }),
        });
        if (!resp.ok) throw new Error(`API returned ${resp.status}`);
        const data: AskResult = await resp.json();
        setAskResult(data);
      } else {
        const params = new URLSearchParams({
          q: query,
          mode,
          limit: "50",
        });
        if (filters.parties.size > 0) {
          params.set("parties", Array.from(filters.parties).join(","));
        }
        if (filters.dateFrom) params.set("date_from", filters.dateFrom);
        if (filters.dateTo) params.set("date_to", filters.dateTo);
        if (filters.chambers.size > 0) {
          params.set("chambers", Array.from(filters.chambers).join(","));
        }
        if (filters.topicFilter !== "All Topics") {
          params.set("topic", filters.topicFilter);
        }
        const resp = await fetch(`${API_BASE}/api/search?${params}`);
        if (!resp.ok) throw new Error(`API returned ${resp.status}`);
        const data = await resp.json();
        setResults(data.results || []);
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Unknown error";
      setError(
        `Could not connect to the API server. Make sure the backend is running on port 8000. (${message})`
      );
    } finally {
      setLoading(false);
    }
  }, [query, mode, isAskMode, filters]);

  // Auto-search when arriving with ?q= parameter
  useEffect(() => {
    if (initialQuery && !didAutoSearch.current) {
      didAutoSearch.current = true;
      doSearch();
    }
  }, [initialQuery, doSearch]);

  const toggleExpand = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSourceExpand = (id: number) => {
    setExpandedSourceIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      doSearch();
    }
  };

  const triggerAsk = (question: string) => {
    setQuery(question);
    setIsAskMode(true);
    // Run search after state settles
    setTimeout(() => {
      if (textareaRef.current) textareaRef.current.focus();
    }, 50);
  };

  // After setting query via triggerAsk, fire search
  const pendingAsk = useRef<string | null>(null);
  useEffect(() => {
    if (pendingAsk.current && query === pendingAsk.current && isAskMode) {
      pendingAsk.current = null;
      doSearch();
    }
  }, [query, isAskMode, doSearch]);

  const triggerAskAndSearch = (question: string) => {
    pendingAsk.current = question;
    setQuery(question);
    setIsAskMode(true);
  };

  // Suggested follow-up questions for Ask mode
  const followUpQuestions = useMemo(() => {
    if (!askResult?.answer) return [];
    const suggestions: string[] = [];
    const answer = askResult.answer.toLowerCase();
    if (answer.includes("labor") || answer.includes("alp"))
      suggestions.push("What was the Liberal position on this?");
    if (answer.includes("liberal"))
      suggestions.push("What was Labor's response?");
    if (answer.includes("climate") || answer.includes("emission"))
      suggestions.push("How has this policy changed over the last decade?");
    if (answer.includes("housing") || answer.includes("property"))
      suggestions.push("What are the latest proposals on housing affordability?");
    if (answer.includes("gambling") || answer.includes("pokies"))
      suggestions.push("Which MPs received donations from the gambling industry?");
    if (suggestions.length === 0) {
      suggestions.push("Which MPs were most vocal on this topic?");
      suggestions.push("How has this issue evolved over time?");
    }
    suggestions.push("What did the crossbench say about this?");
    return suggestions.slice(0, 3);
  }, [askResult]);

  const speakerPhotoUrl = (personId: number | null | undefined): string | null => {
    if (!personId) return null;
    return getPhotoUrl(personId);
  };

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6">
      {/* Header */}
      <section className="pt-8 sm:pt-12 pb-4 sm:pb-6 animate-fade-in-up">
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-[#e6edf3] mb-1.5">
          {isAskMode ? "Ask about Parliament" : "Search Hansard"}
        </h1>
        <p className="text-sm text-[#8b949e] max-w-xl">
          {isAskMode
            ? "Get AI-powered answers grounded in 831,000+ parliamentary speeches, votes, and donation records."
            : "Search across 831,000+ Australian parliamentary speeches using semantic understanding, keyword matching, or both."}
        </p>
      </section>

      {/* Mode toggle -- pill group */}
      <div className="flex items-center mb-4 animate-fade-in-up stagger-1">
        <div className="inline-flex items-center rounded-xl border border-white/[0.06] bg-[#12121a] p-1 gap-0.5">
          <button
            onClick={() => setIsAskMode(true)}
            className={`relative px-4 py-2 text-sm rounded-lg font-medium transition-all duration-200 ${
              isAskMode
                ? "text-[#0a0a0f] bg-[#FFD700] shadow-lg shadow-[#FFD700]/10"
                : "text-[#8b949e] hover:text-[#e6edf3] hover:bg-white/5"
            }`}
          >
            <span className="flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              Ask
            </span>
          </button>
          <div className="w-px h-5 bg-white/[0.06]" />
          {(Object.keys(modeLabels) as SearchMode[]).map((m) => (
            <button
              key={m}
              onClick={() => {
                setMode(m);
                setIsAskMode(false);
              }}
              title={modeLabels[m].desc}
              className={`px-3.5 py-2 text-sm rounded-lg transition-all duration-200 ${
                !isAskMode && mode === m
                  ? "text-[#FFD700] bg-[#FFD700]/10 font-medium shadow-inner shadow-[#FFD700]/5"
                  : "text-[#8b949e] hover:text-[#e6edf3] hover:bg-white/5"
              }`}
            >
              {modeLabels[m].label}
            </button>
          ))}
        </div>
        {!isAskMode && (
          <p className="ml-3 text-xs text-[#8b949e]/50 hidden sm:block">
            {modeLabels[mode].desc}
          </p>
        )}
      </div>

      {/* Search / Ask input */}
      <div className="mb-4 animate-fade-in-up stagger-1">
        {isAskMode ? (
          /* Ask mode: large textarea with animated border */
          <div className={`relative rounded-2xl transition-all duration-500 ${
            textareaFocused
              ? "shadow-[0_0_0_1px_rgba(255,215,0,0.4),0_0_20px_rgba(255,215,0,0.05)]"
              : ""
          }`}>
            {/* Animated gradient border on focus */}
            <div className={`absolute -inset-[1px] rounded-2xl transition-opacity duration-500 ${
              textareaFocused ? "opacity-100" : "opacity-0"
            }`} style={{
              background: "linear-gradient(135deg, rgba(255,215,0,0.3), rgba(255,215,0,0.05), rgba(255,215,0,0.3))",
              backgroundSize: "200% 200%",
              animation: textareaFocused ? "gradient-shift 3s ease infinite" : "none",
            }} />
            <div className="relative">
              <textarea
                ref={textareaRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                onFocus={() => setTextareaFocused(true)}
                onBlur={() => setTextareaFocused(false)}
                placeholder="Ask anything about Australian politics..."
                rows={4}
                className="w-full rounded-2xl border border-white/10 bg-[#12121a] px-5 py-4 text-[#e6edf3] text-base placeholder:text-[#8b949e]/40 focus:outline-none focus:border-[#FFD700]/40 transition-colors resize-none"
              />
              <div className="absolute bottom-3 right-3 flex items-center gap-2">
                <span className="text-[10px] text-[#8b949e]/40 hidden sm:inline">
                  Enter to ask
                </span>
                <button
                  onClick={doSearch}
                  disabled={loading || !query.trim()}
                  className="h-9 px-5 rounded-xl font-medium text-sm transition-all duration-200 disabled:opacity-30 hover:shadow-lg hover:shadow-[#FFD700]/10"
                  style={{
                    backgroundColor: "#FFD700",
                    color: "#0a0a0f",
                  }}
                >
                  {loading ? (
                    <div className="w-4 h-4 border-2 border-[#0a0a0f]/30 border-t-[#0a0a0f] rounded-full animate-spin" />
                  ) : (
                    "Ask"
                  )}
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* Search mode: single-line input */
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Search speeches..."
                className="w-full h-12 rounded-xl border border-white/10 bg-[#12121a] px-4 pr-12 text-[#e6edf3] placeholder:text-[#8b949e]/50 focus:outline-none focus:border-[#FFD700]/40 focus:ring-1 focus:ring-[#FFD700]/20 transition-colors"
              />
              {loading && (
                <div className="absolute right-4 top-1/2 -translate-y-1/2">
                  <div className="w-5 h-5 border-2 border-[#FFD700]/30 border-t-[#FFD700] rounded-full animate-spin" />
                </div>
              )}
            </div>
            <button
              onClick={doSearch}
              disabled={loading || !query.trim()}
              className="h-12 px-6 rounded-xl font-medium text-sm transition-all duration-200 disabled:opacity-40 hover:shadow-lg hover:shadow-[#FFD700]/10"
              style={{
                backgroundColor: "#FFD700",
                color: "#0a0a0f",
              }}
            >
              Search
            </button>
          </div>
        )}

        {/* Search history chips */}
        {searchHistory.length > 0 && !hasSearched && (
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <span className="text-[10px] uppercase tracking-wider text-[#8b949e]/60">
              Recent
            </span>
            {searchHistory.map((h) => (
              <button
                key={h}
                onClick={() => {
                  setQuery(h);
                  if (inputRef.current) inputRef.current.focus();
                  if (textareaRef.current) textareaRef.current.focus();
                }}
                className="px-2.5 py-1 text-xs rounded-lg border border-white/5 bg-[#12121a] text-[#8b949e] hover:text-[#e6edf3] hover:border-white/10 transition-colors"
              >
                {h}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Filter bar (search mode only) */}
      {!isAskMode && (
        <>
          {/* Mobile filter toggle */}
          <div className="md:hidden mb-4">
            <button
              onClick={() => setMobileFiltersOpen(!mobileFiltersOpen)}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-colors ${
                mobileFiltersOpen
                  ? "border-[#FFD700]/30 bg-[#FFD700]/5 text-[#FFD700]"
                  : "border-white/10 bg-[#12121a] text-[#8b949e]"
              }`}
            >
              <span className="flex items-center gap-2 text-sm">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                </svg>
                Filters
              </span>
              <svg className={`w-4 h-4 transition-transform ${mobileFiltersOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>
          {/* Desktop filters always available, mobile collapsible */}
          <div className={`${mobileFiltersOpen ? "block" : "hidden"} md:block`}>
            <FilterBar
              filters={filters}
              setFilters={setFilters}
              filtersOpen={filtersOpen}
              setFiltersOpen={setFiltersOpen}
            />
          </div>
        </>
      )}

      {/* Loading indicator for Ask mode */}
      {loading && isAskMode && <AskLoadingAnimation />}

      {/* Error */}
      {error && (
        <div className="mb-6 rounded-xl border border-red-500/20 bg-red-500/5 p-4 animate-fade-in-up">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* Ask mode answer */}
      {askResult && (
        <div className="mb-8 animate-fade-in-up">
          {askResult.answer ? (
            <div className="rounded-2xl border border-[#FFD700]/15 bg-gradient-to-b from-[#FFD700]/[0.04] to-transparent overflow-hidden">
              {/* Answer header with confidence */}
              <div className="flex items-center justify-between px-6 pt-5 pb-0">
                <p className="text-xs uppercase tracking-[0.2em] text-[#FFD700] font-medium flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                  Answer
                </p>
                {(() => {
                  const level = deriveConfidence(askResult.sources, askResult.answer);
                  const badge = confidenceBadge[level];
                  return (
                    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium ${badge.cls}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        level === "high" ? "bg-green-400" : level === "medium" ? "bg-yellow-500" : "bg-red-400"
                      }`} />
                      {badge.label}
                    </span>
                  );
                })()}
              </div>

              {/* Answer body */}
              <div className="px-6 pt-3 pb-5">
                <div className="text-sm text-[#e6edf3] leading-relaxed prose prose-invert prose-sm max-w-none prose-headings:text-[#FFD700] prose-strong:text-[#e6edf3] prose-a:text-[#FFD700] prose-li:marker:text-[#FFD700] prose-p:my-2">
                  <Markdown>{askResult.answer}</Markdown>
                </div>
              </div>

              {/* Sources summary bar */}
              {askResult.sources.length > 0 && (
                <div className="border-t border-white/5">
                  <div className="px-6 py-3">
                    <SourcesSummary sources={askResult.sources} />
                  </div>

                  {/* Collapsible sources list */}
                  <div className="px-6 pb-1">
                    <button
                      onClick={() => setSourcesCollapsed(!sourcesCollapsed)}
                      className="flex items-center gap-2 text-xs text-[#8b949e] hover:text-[#e6edf3] transition-colors mb-2 group"
                    >
                      <svg
                        className={`w-3 h-3 transition-transform duration-200 ${sourcesCollapsed ? "" : "rotate-90"}`}
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                      </svg>
                      <span className="group-hover:text-[#FFD700] transition-colors">
                        {sourcesCollapsed ? "Show" : "Hide"} source speeches
                      </span>
                    </button>

                    <div className={`overflow-hidden transition-all duration-300 ease-in-out ${
                      sourcesCollapsed ? "max-h-0 opacity-0" : "max-h-[2000px] opacity-100"
                    }`}>
                      <div className="space-y-2 pb-4">
                        {askResult.sources.slice(0, 8).map((s) => (
                          <div key={s.speech_id}>
                            <button
                              onClick={() => toggleSourceExpand(s.speech_id)}
                              className="w-full flex items-center gap-2 text-left text-xs bg-white/5 hover:bg-white/[0.07] rounded-lg px-3 py-2.5 transition-colors group"
                            >
                              <svg
                                className={`w-3 h-3 text-[#8b949e] transition-transform duration-200 shrink-0 ${
                                  expandedSourceIds.has(s.speech_id) ? "rotate-90" : ""
                                }`}
                                fill="currentColor"
                                viewBox="0 0 20 20"
                              >
                                <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                              </svg>
                              <span className="text-[#e6edf3] group-hover:text-[#FFD700] transition-colors">
                                {s.speaker_name}
                              </span>
                              {s.party && <PartyBadge party={s.party} />}
                              <span className="text-[#8b949e] ml-auto shrink-0">
                                {formatDate(s.date)}
                              </span>
                            </button>
                            <div className={`overflow-hidden transition-all duration-200 ${
                              expandedSourceIds.has(s.speech_id) && s.text ? "max-h-40 opacity-100" : "max-h-0 opacity-0"
                            }`}>
                              <div className="ml-5 mt-1 mb-2 px-3 py-2 bg-white/[0.02] rounded-lg border border-white/5">
                                <p className="text-xs text-[#8b949e] leading-relaxed line-clamp-4">
                                  {s.text}
                                </p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Follow-up questions */}
              {followUpQuestions.length > 0 && (
                <div className="border-t border-white/5 px-6 py-4">
                  <p className="text-xs text-[#8b949e] mb-3 flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5 text-[#FFD700]/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Follow up
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {followUpQuestions.map((fq) => (
                      <button
                        key={fq}
                        onClick={() => triggerAskAndSearch(fq)}
                        className="px-3 py-2 text-xs rounded-xl border border-[#FFD700]/10 bg-[#FFD700]/[0.03] text-[#8b949e] hover:text-[#FFD700] hover:border-[#FFD700]/25 hover:bg-[#FFD700]/[0.06] transition-all duration-200"
                      >
                        {fq}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : askResult.context ? (
            <div className="rounded-xl border border-white/5 bg-[#12121a] p-6">
              <p className="text-xs uppercase tracking-[0.2em] text-[#8b949e] mb-3 font-medium">
                Retrieved Context (no API key set for LLM answer)
              </p>
              <pre className="text-xs text-[#8b949e] whitespace-pre-wrap leading-relaxed max-h-96 overflow-y-auto">
                {askResult.context}
              </pre>
            </div>
          ) : null}
        </div>
      )}

      {/* Faceted result counts */}
      {!isAskMode && filteredResults.length > 0 && !loading && (
        <FacetCounts results={filteredResults} />
      )}

      {/* Search results with stagger animation */}
      {!isAskMode && filteredResults.length > 0 && (
        <div className="space-y-3 pb-16">
          {filteredResults.map((r, idx) => {
            const expanded = expandedIds.has(r.speech_id);
            const photoUrl = speakerPhotoUrl(r.person_id);
            const sourceLabel = sourceBadgeLabel(r.source);
            return (
              <div
                key={r.speech_id}
                className="group/card rounded-xl border border-white/5 bg-[#12121a] p-4 sm:p-5 hover:border-white/10 hover:bg-[#12121a]/80 transition-all duration-300 animate-fade-in-up"
                style={{ animationDelay: `${Math.min(idx * 50, 500)}ms` }}
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-2.5 gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    {photoUrl && (
                      <div className="w-11 h-11 rounded-full overflow-hidden bg-white/5 shrink-0 ring-2 ring-white/[0.06] transition-all duration-300 group-hover/card:ring-[#FFD700]/15">
                        <img
                          src={photoUrl}
                          alt={r.speaker_name || "MP"}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = "none";
                          }}
                        />
                      </div>
                    )}
                    <div className="min-w-0">
                      {r.person_id ? (
                        <Link
                          href={`/politicians/${r.person_id}`}
                          className="text-base font-semibold text-[#e6edf3] hover:text-[#FFD700] transition-colors truncate block leading-snug"
                        >
                          {r.speaker_name || "Unknown Speaker"}
                        </Link>
                      ) : (
                        <h3 className="text-base font-semibold text-[#e6edf3] truncate leading-snug">
                          {r.speaker_name || "Unknown Speaker"}
                        </h3>
                      )}
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {r.party && <PartyBadge party={r.party} />}
                        <span
                          className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-medium ${
                            sourceBadgeColor[sourceLabel] || sourceBadgeColor.Hansard
                          }`}
                        >
                          {sourceLabel}
                        </span>
                        <span className="text-[11px] text-[#8b949e]/60">
                          {formatDate(r.date)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <span className="text-[10px] text-[#8b949e]/50 bg-white/[0.03] rounded px-2 py-0.5 shrink-0 font-mono">
                    {r.similarity_score.toFixed(4)}
                  </span>
                </div>

                {/* Topic tag */}
                {r.topic && (
                  <div className="mb-2">
                    <span className="inline-flex items-center text-[11px] text-[#FFD700]/60 bg-[#FFD700]/[0.04] border border-[#FFD700]/[0.08] rounded-md px-2 py-0.5">
                      {r.topic}
                    </span>
                  </div>
                )}

                {/* Text preview with highlighted terms */}
                <div
                  className={`text-sm text-[#8b949e] leading-relaxed ${
                    expanded ? "" : "line-clamp-3"
                  }`}
                  dangerouslySetInnerHTML={{
                    __html: highlightTerms(r.text, query),
                  }}
                />

                {/* Expand button */}
                <button
                  onClick={() => toggleExpand(r.speech_id)}
                  className="mt-2 text-xs text-[#FFD700]/60 hover:text-[#FFD700] transition-colors flex items-center gap-1"
                >
                  <svg
                    className={`w-3 h-3 transition-transform duration-200 ${
                      expanded ? "rotate-180" : ""
                    }`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                  {expanded ? "Show less" : "Read full speech"}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Empty state after search (search mode) */}
      {hasSearched &&
        !loading &&
        !error &&
        filteredResults.length === 0 &&
        !askResult &&
        !isAskMode && (
          <div className="text-center py-16 animate-fade-in-up">
            {/* Empty state illustration */}
            <div className="relative w-24 h-24 mx-auto mb-6">
              <div className="absolute inset-0 rounded-full bg-[#FFD700]/[0.03] animate-pulse" />
              <div className="absolute inset-2 rounded-full bg-[#FFD700]/[0.04]" />
              <div className="absolute inset-0 flex items-center justify-center">
                <svg
                  className="w-10 h-10 text-[#8b949e]/30"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
              </div>
              {/* Decorative dots */}
              <div className="absolute -top-1 right-2 w-2 h-2 rounded-full bg-[#FFD700]/10" />
              <div className="absolute bottom-1 -left-1 w-1.5 h-1.5 rounded-full bg-[#FFD700]/15" />
            </div>
            <p className="text-lg text-[#e6edf3] font-medium mb-1.5">No results found</p>
            <p className="text-sm text-[#8b949e] mb-8 max-w-md mx-auto">
              {results.length > 0 && filteredResults.length === 0
                ? "Try adjusting your filters -- there are results that don't match the current filter criteria."
                : "Try a different query, search mode, or broaden your filters."}
            </p>

            {/* Categorized suggestions in empty state */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg mx-auto text-left">
              {SUGGESTED_SEARCHES.slice(0, 4).map(({ topic, queries, emoji }) => (
                <button
                  key={topic}
                  onClick={() => {
                    setQuery(queries[0]);
                    if (inputRef.current) inputRef.current.focus();
                  }}
                  className="flex items-center gap-2.5 px-4 py-3 rounded-xl border border-white/5 bg-[#12121a] hover:border-white/15 transition-colors group"
                >
                  <span className="text-lg">{emoji}</span>
                  <div>
                    <p className="text-xs font-medium text-[#e6edf3] group-hover:text-[#FFD700] transition-colors">{topic}</p>
                    <p className="text-[10px] text-[#8b949e]">{queries[0]}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

      {/* Initial state -- Popular questions (Ask mode) + topic suggestions (Search mode) */}
      {!hasSearched && (
        <div className="py-6 sm:py-8 animate-fade-in-up stagger-2">
          {isAskMode ? (
            <>
              {/* Popular Questions cards */}
              <p className="text-xs uppercase tracking-[0.15em] text-[#8b949e]/70 mb-4 font-medium">
                Popular questions
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
                {POPULAR_QUESTIONS.map(({ question, icon, color, tag, tagColor }) => (
                  <button
                    key={question}
                    onClick={() => triggerAskAndSearch(question)}
                    className={`text-left rounded-xl border bg-gradient-to-br p-4 sm:p-5 transition-all duration-300 group hover:scale-[1.01] ${color}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="text-[#8b949e] group-hover:text-[#FFD700] transition-colors mt-0.5 shrink-0">
                        {icon}
                      </div>
                      <div>
                        <p className={`text-[10px] uppercase tracking-wider font-medium mb-1.5 ${tagColor}`}>
                          {tag}
                        </p>
                        <p className="text-sm text-[#e6edf3] group-hover:text-[#FFD700] transition-colors leading-snug">
                          {question}
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              {/* Explore by topic */}
              <p className="text-xs uppercase tracking-[0.15em] text-[#8b949e]/70 mb-4 font-medium">
                Explore by topic
              </p>
              <div className="flex flex-wrap gap-2">
                {SUGGESTED_SEARCHES.map(({ topic, queries, emoji }) => (
                  <button
                    key={topic}
                    onClick={() => triggerAskAndSearch(queries[0])}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs rounded-lg border border-white/5 bg-[#12121a] text-[#8b949e] hover:text-[#e6edf3] hover:border-white/15 transition-colors"
                  >
                    <span>{emoji}</span>
                    {topic}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              {/* Search mode: categorized suggestions */}
              <p className="text-sm text-[#8b949e] mb-6 text-center">
                Explore Australian parliamentary speeches by topic
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {SUGGESTED_SEARCHES.map(({ topic, queries, emoji }) => (
                  <div
                    key={topic}
                    className="rounded-xl border border-white/5 bg-[#12121a] p-4"
                  >
                    <h3 className="text-xs font-medium uppercase tracking-wider text-[#FFD700]/70 mb-3 flex items-center gap-1.5">
                      <span>{emoji}</span>
                      {topic}
                    </h3>
                    <div className="space-y-1.5">
                      {queries.map((suggestion) => (
                        <button
                          key={suggestion}
                          onClick={() => {
                            setQuery(suggestion);
                            if (inputRef.current) inputRef.current.focus();
                          }}
                          className="block w-full text-left px-2.5 py-1.5 text-xs rounded-lg text-[#8b949e] hover:text-[#e6edf3] hover:bg-white/5 transition-colors"
                        >
                          &ldquo;{suggestion}&rdquo;
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-5xl px-6 pt-12 text-[#8b949e]">
          Loading...
        </div>
      }
    >
      <SearchPageInner />
    </Suspense>
  );
}

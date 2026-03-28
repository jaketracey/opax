"use client";

import Link from "next/link";
import { useState, useEffect, useRef } from "react";

import { API_BASE } from "@/lib/utils";

/* ── Types ── */

interface Stats {
  speeches: number;
  members: number;
  donations: number;
  votes: number;
  divisions: number;
  contracts: number;
  grants: number;
  expenses: number;
  lobbyist_firms: number;
  lobbyist_clients: number;
  ministerial_meetings: number;
  board_appointments: number;
  audit_reports: number;
  news_articles: number;
  mp_interests: number;
  electorates: number;
  postcodes: number;
  donation_industries: number;
  donation_industry_pct: number;
  speech_date_range: [string | null, string | null];
}

/* ── Animated counter ── */

function useCountUp(target: number, duration = 1800, enabled = true) {
  const [value, setValue] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled || target === 0) return;
    const start = performance.now();
    const step = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(eased * target));
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(step);
      }
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [target, duration, enabled]);

  return value;
}

function AnimatedStat({
  value,
  label,
  suffix,
  enabled,
}: {
  value: number;
  label: string;
  suffix?: string;
  enabled: boolean;
}) {
  const displayed = useCountUp(value, 2200, enabled);
  return (
    <div className="text-center px-4 py-6 rounded-xl border border-white/5 bg-[#12121a]">
      <span className="block font-mono text-2xl md:text-3xl font-bold text-[#FFD700]">
        {displayed.toLocaleString()}
        {suffix && (
          <span className="text-lg text-[#FFD700]/60">{suffix}</span>
        )}
      </span>
      <span className="text-xs text-[#8b949e] mt-1 uppercase tracking-wider">
        {label}
      </span>
    </div>
  );
}

/* ── Skeleton loader ── */

function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded bg-white/5 ${className}`}
    />
  );
}

function StatSkeleton() {
  return (
    <div className="text-center px-4 py-6 rounded-xl border border-white/5 bg-[#12121a]">
      <Skeleton className="h-8 w-24 mx-auto mb-2" />
      <Skeleton className="h-3 w-16 mx-auto" />
    </div>
  );
}

function CardSkeleton() {
  return (
    <div className="rounded-xl border border-white/5 bg-[#12121a] p-5">
      <Skeleton className="h-5 w-48 mb-3" />
      <Skeleton className="h-4 w-full mb-2" />
      <Skeleton className="h-4 w-3/4 mb-4" />
      <Skeleton className="h-3 w-32" />
    </div>
  );
}

/* ── Source sub-item ── */

interface SubSource {
  name: string;
  coverage: string;
  detail?: string;
}

/* ── Source card ── */

interface SourceInfo {
  name: string;
  icon: string;
  headline: string;
  count?: string;
  countNote?: string;
  coverage: string;
  format: string;
  license: string;
  description: string;
  subSources?: SubSource[];
}

function SourceCard({ source }: { source: SourceInfo }) {
  return (
    <div className="rounded-xl border border-white/5 bg-[#12121a] p-5 hover:border-[#FFD700]/15 transition-colors">
      <div className="flex items-start gap-3 mb-3">
        <span className="text-xl leading-none mt-0.5">{source.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-sm font-medium text-[#e6edf3]">
              {source.name}
            </h3>
            {source.count && (
              <span className="font-mono text-sm text-[#FFD700] whitespace-nowrap">
                {source.count}
              </span>
            )}
          </div>
          {source.countNote && (
            <p className="text-[10px] text-[#8b949e]/50 mt-0.5">
              {source.countNote}
            </p>
          )}
          <p className="text-xs text-[#8b949e] mt-0.5">{source.headline}</p>
        </div>
      </div>
      <p className="text-sm text-[#8b949e] leading-relaxed mb-3">
        {source.description}
      </p>

      {/* Sub-sources */}
      {source.subSources && source.subSources.length > 0 && (
        <div className="mb-4 space-y-1.5">
          {source.subSources.map((sub) => (
            <div
              key={sub.name}
              className="flex items-baseline gap-2 text-xs pl-1 border-l-2 border-[#FFD700]/10 ml-1"
            >
              <span className="text-[#e6edf3]/80 font-medium whitespace-nowrap pl-2">
                {sub.name}
              </span>
              <span className="text-[#8b949e]/60">{sub.coverage}</span>
              {sub.detail && (
                <span className="text-[#8b949e]/40 ml-auto whitespace-nowrap">
                  {sub.detail}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#8b949e]/70">
        <span>
          <span className="text-[#FFD700]/60">Coverage:</span>{" "}
          {source.coverage}
        </span>
        <span>
          <span className="text-[#FFD700]/60">Format:</span> {source.format}
        </span>
        <span>
          <span className="text-[#FFD700]/60">License:</span> {source.license}
        </span>
      </div>
    </div>
  );
}

/* ── Section component ── */

function SourceSection({
  title,
  subtitle,
  sources,
  loading,
}: {
  title: string;
  subtitle: string;
  sources: SourceInfo[];
  loading: boolean;
}) {
  return (
    <section className="py-12 animate-fade-in-up">
      <h2 className="font-serif text-2xl text-[#e6edf3] mb-2">{title}</h2>
      <p className="text-sm text-[#8b949e] mb-6">{subtitle}</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {loading
          ? Array.from({ length: sources.length || 2 }).map((_, i) => (
              <CardSkeleton key={i} />
            ))
          : sources.map((s) => <SourceCard key={s.name} source={s} />)}
      </div>
    </section>
  );
}

/* ── Helper: format count ── */
function fmtCount(n: number | undefined, fallback: string): string {
  if (n === undefined || n === 0) return fallback;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

/* ── Methodology ── */

const METHODOLOGY_ITEMS = [
  {
    title: "Speaker-to-Member Linking",
    detail:
      "Over 74% of speeches linked to specific MPs via name resolution, electorate matching, and party affiliation across all jurisdictions.",
  },
  {
    title: "Topic Classification",
    detail:
      "16 policy topics assigned via keyword-based classification. Every speech is scored against topic keyword lists for relevance ranking.",
  },
  {
    title: "Donation Industry Classification",
    detail:
      "27 industry sectors mapped to donor entities using rule-based classification at 99.9% coverage, enabling cross-referencing with policy positions and voting records.",
  },
  {
    title: "Semantic Embeddings",
    detail:
      "all-MiniLM-L6-v2 model producing 384-dimensional vectors for every speech, enabling semantic search beyond keyword matching.",
  },
  {
    title: "Hybrid Search (RRF)",
    detail:
      "Reciprocal Rank Fusion combines semantic similarity (cosine) with FTS5 BM25 keyword scoring for robust, typo-tolerant search across 1M+ records.",
  },
  {
    title: "Entity Resolution",
    detail:
      "Fuzzy matching across donors, contractors, lobbyists, and board appointees links the same entity across disparate government datasets.",
  },
  {
    title: "RAG Pipeline",
    detail:
      "Retrieval-augmented generation assembles speeches, donations, votes, and contracts as context for Claude to produce evidence-based, citation-backed answers.",
  },
];

/* ── Page ── */

export default function SourcesPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [visible, setVisible] = useState(false);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/api/stats`)
      .then((r) => r.json())
      .then((data) => {
        setStats(data);
        setFetchedAt(new Date().toISOString());
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 200);
    return () => clearTimeout(t);
  }, []);

  const s = stats;

  /* -- Build source definitions with live counts -- */

  const PARLIAMENTARY: SourceInfo[] = [
    {
      name: "Federal Hansard (Modern)",
      icon: "\u{1F3DB}",
      headline: "OpenAustralia API",
      count: s ? fmtCount(s.speeches, "1.19M+") : "...",
      countNote: "total across all speech sources",
      coverage: "1901\u20132026",
      format: "XML, JSON, JSONL",
      license: "CC BY-NC-SA 3.0 AU",
      description:
        "The official record of every speech, question, and interjection in the Australian Parliament. Aggregated from multiple complementary sources to achieve 125 years of continuous coverage.",
      subSources: [
        {
          name: "OpenAustralia API",
          coverage: "2006\u20132025",
          detail: "Primary modern source",
        },
        {
          name: "Wragge/Trove XML",
          coverage: "1901\u20132005",
          detail: "Tim Sherratt corpus",
        },
        {
          name: "Zenodo Dataset",
          coverage: "1998\u20132022",
          detail: "Harvard Dataverse",
        },
      ],
    },
    {
      name: "Victorian Parliament",
      icon: "\u{1F5FA}",
      headline: "Undocumented API endpoint",
      coverage: "2018\u20132026",
      format: "JSON (API)",
      license: "CC BY 4.0",
      description:
        "Victorian Hansard from the Legislative Assembly and Legislative Council, sourced via an undocumented API endpoint on the parliament website.",
    },
    {
      name: "NSW Parliament",
      icon: "\u{1F5FA}",
      headline: "Official NSW Parliament API",
      coverage: "2015\u20132024",
      format: "JSON (API)",
      license: "CC BY 4.0",
      description:
        "New South Wales Hansard from the Legislative Assembly and Legislative Council via the official parliament API.",
    },
    {
      name: "SA Parliament",
      icon: "\u{1F5FA}",
      headline: "Hansard Search API",
      coverage: "2020\u20132024",
      format: "JSON (API)",
      license: "Open",
      description:
        "South Australian Hansard from the House of Assembly and Legislative Council via the official Hansard Search API.",
    },
    {
      name: "QLD Parliament",
      icon: "\u{1F5FA}",
      headline: "Queensland Open Data",
      coverage: "2024\u20132026",
      format: "PDF, Open Data API",
      license: "CC BY 4.0",
      description:
        "Queensland parliamentary records via PDF extraction and the Queensland Open Data API. Expanding coverage.",
    },
    {
      name: "Senate Committee Hearings",
      icon: "\u{1F4CB}",
      headline: "ParlInfo transcripts",
      coverage: "2025\u20132026",
      format: "HTML, parsed text",
      license: "Commonwealth Copyright",
      description:
        "Transcripts from Senate committee hearings sourced via ParlInfo. Captures detailed policy interrogation beyond chamber debates.",
    },
  ];

  const VOTING: SourceInfo[] = [
    {
      name: "TheyVoteForYou",
      icon: "\u{1F5F3}",
      headline: "Individual MP votes on divisions",
      count: s ? fmtCount(s.votes, "304K+") : "...",
      countNote: s
        ? `across ${(s.divisions ?? 0).toLocaleString()} divisions`
        : undefined,
      coverage: "2006\u2013present",
      format: "JSON (API)",
      license: "CC BY-SA",
      description:
        "Structured division records from the House and Senate. Every recorded vote by every MP, linked to curated policy areas with rebel vote detection.",
    },
  ];

  const DONATIONS: SourceInfo[] = [
    {
      name: "Political Donations",
      icon: "\u{1F4B0}",
      headline: "Federal and state donation disclosures",
      count: s ? fmtCount(s.donations, "237K+") : "...",
      countNote: s
        ? `${s.donation_industries ?? 27} industries classified at ${s.donation_industry_pct ?? 99.9}%`
        : undefined,
      coverage: "All available annual returns",
      format: "CSV, API",
      license: "Commonwealth / State Open Data",
      description:
        "Political donation disclosure records from parties, donors, and associated entities. Industry-classified for cross-referencing with policy positions and voting records.",
      subSources: [
        {
          name: "AEC Federal Disclosures",
          coverage: "All years",
          detail: "Primary source",
        },
        {
          name: "QLD Electoral Commission",
          coverage: "State-level",
          detail: "$1K threshold",
        },
        {
          name: "NSW Donations (icacpls)",
          coverage: "State-level",
          detail: "icacpls.github.io",
        },
      ],
    },
  ];

  const CONTRACTS: SourceInfo[] = [
    {
      name: "AusTender (OCDS API)",
      icon: "\u{1F4C4}",
      headline: "Government procurement contracts",
      count: s ? fmtCount(s.contracts, "16K+") : "...",
      coverage: "$100K+ since 2013",
      format: "JSON (OCDS)",
      license: "Commonwealth Open Data",
      description:
        "Government procurement contracts from the AusTender open contracting data standard API. Links government spending to donors, lobbyists, and policy positions.",
    },
  ];

  const GRANTS: SourceInfo[] = [
    {
      name: "Government Grants",
      icon: "\u{1F3E6}",
      headline: "Discretionary and formula grants",
      count: s ? fmtCount(s.grants, "239K+") : "...",
      coverage: "2017\u20132025",
      format: "CSV, API",
      license: "Open Data",
      description:
        "Government grants data for cross-referencing with electorate demographics, donor networks, and parliamentary advocacy. Enables pork-barrelling analysis.",
      subSources: [
        {
          name: "QLD Government Investment Portal",
          coverage: "2017\u20132025",
          detail: "Primary source",
        },
        {
          name: "GrantConnect",
          coverage: "Federal",
          detail: "Manual import",
        },
      ],
    },
  ];

  const EXPENSES: SourceInfo[] = [
    {
      name: "MP Expenses",
      icon: "\u{1F9FE}",
      headline: "IPEA quarterly reports + historical data",
      count: s ? fmtCount(s.expenses, "2.47M+") : "...",
      coverage: "2010\u20132025",
      format: "CSV, PDF",
      license: "Commonwealth Open Data",
      description:
        "Parliamentary expense claims including travel, office, staff, and electorate spending. Covers IPEA quarterly reports (2017-2025) and historical icacpls.github.io data (2010-2018).",
      subSources: [
        {
          name: "IPEA Quarterly Reports",
          coverage: "2017\u20132025",
          detail: "Official source",
        },
        {
          name: "icacpls.github.io",
          coverage: "2010\u20132018",
          detail: "Historical data",
        },
      ],
    },
  ];

  const LOBBYING: SourceInfo[] = [
    {
      name: "Federal Register of Lobbyists",
      icon: "\u{1F465}",
      headline: "AG Department API",
      count: s
        ? `${fmtCount(s.lobbyist_firms, "943")} firms`
        : "...",
      countNote: s
        ? `${(s.lobbyist_clients ?? 0).toLocaleString()} clients registered`
        : undefined,
      coverage: "Current register",
      format: "JSON (API)",
      license: "Commonwealth Open Data",
      description:
        "Registered lobbyist firms, their clients, and former government roles. Cross-referenced with donors and contractors to map revolving-door influence networks.",
    },
  ];

  const MINISTERIAL: SourceInfo[] = [
    {
      name: "Ministerial Meetings",
      icon: "\u{1F4C5}",
      headline: "QLD Premier's ministerial diary PDFs",
      count: s ? fmtCount(s.ministerial_meetings, "3.2K+") : "...",
      coverage: "QLD ministerial diaries",
      format: "PDF (extracted)",
      license: "Open Data",
      description:
        "Ministerial diary disclosures showing who ministers meet with. Cross-referenced with donation and contract records to identify potential pay-to-play patterns.",
    },
  ];

  const BOARDS: SourceInfo[] = [
    {
      name: "Board Appointments",
      icon: "\u{1F3DB}",
      headline: "AGOR + Directory.gov.au",
      count: s ? fmtCount(s.board_appointments, "5.9K+") : "...",
      coverage: "Current and historical",
      format: "JSON, XML",
      license: "Commonwealth Open Data",
      description:
        "Government board and committee appointments from the Australian Government Organisations Register (AGOR) and Directory.gov.au. Enables patronage network analysis.",
      subSources: [
        {
          name: "AGOR (data.gov.au)",
          coverage: "Current register",
          detail: "Primary source",
        },
        {
          name: "Directory.gov.au XML",
          coverage: "Current",
          detail: "Supplementary",
        },
      ],
    },
  ];

  const AUDITS: SourceInfo[] = [
    {
      name: "ANAO Audit Reports",
      icon: "\u{1F50D}",
      headline: "Performance audit reports",
      count: s ? fmtCount(s.audit_reports, "50+") : "...",
      coverage: "Recent years",
      format: "HTML, PDF",
      license: "Commonwealth Copyright",
      description:
        "Australian National Audit Office performance audit reports with findings and recommendations. Cross-referenced with contracts and grants for accountability tracking.",
    },
  ];

  const NEWS: SourceInfo[] = [
    {
      name: "News Coverage",
      icon: "\u{1F4F0}",
      headline: "Guardian Australia + ABC News",
      count: s ? fmtCount(s.news_articles, "4K+") : "...",
      coverage: "Recent years",
      format: "JSON (API)",
      license: "Various",
      description:
        "Political news articles for contextualising parliamentary activity and tracking media coverage of policy issues.",
      subSources: [
        {
          name: "Guardian Australia API",
          coverage: "Ongoing",
          detail: "Open API",
        },
        {
          name: "ABC News (Algolia)",
          coverage: "Ongoing",
          detail: "Search API",
        },
      ],
    },
  ];

  const MP_INTERESTS: SourceInfo[] = [
    {
      name: "MP Registered Interests",
      icon: "\u{1F4DD}",
      headline: "APH Register of Members' Interests",
      count: s ? fmtCount(s.mp_interests, "538+") : "...",
      countNote: "MPs with declared interests",
      coverage: "Current parliament",
      format: "PDF (Haiku-extracted)",
      license: "Commonwealth Copyright",
      description:
        "Shareholdings, property holdings, directorships, and other registered interests declared by MPs. Extracted from APH PDF registers using Claude Haiku for structured parsing.",
    },
  ];

  const ELECTORAL: SourceInfo[] = [
    {
      name: "Electorate Demographics",
      icon: "\u{1F4CA}",
      headline: "ABS 2021 Census",
      count: s ? `${s.electorates ?? 151}` : "...",
      countNote: "electorates profiled",
      coverage: "2021 Census",
      format: "CSV",
      license: "CC BY 4.0",
      description:
        "General Community Profile data from the ABS 2021 Census mapped to federal electorates. Median income, unemployment, education, age distribution, and cultural diversity indicators.",
    },
    {
      name: "Electoral Results + Postcodes",
      icon: "\u{1F5F3}",
      headline: "AEC two-candidate-preferred results",
      count: s ? (s.postcodes ?? 2358).toLocaleString() : "...",
      countNote: "postcode-to-electorate mappings",
      coverage: "2019, 2022 elections",
      format: "CSV",
      license: "Commonwealth Open Data",
      description:
        "AEC two-candidate-preferred results by division for the 2019 and 2022 federal elections, plus postcode-to-electorate mappings for the Your MP lookup tool.",
    },
  ];

  const totalRecords = s
    ? (s.speeches ?? 0) +
      (s.donations ?? 0) +
      (s.votes ?? 0) +
      (s.contracts ?? 0) +
      (s.grants ?? 0) +
      (s.expenses ?? 0) +
      (s.lobbyist_clients ?? 0) +
      (s.ministerial_meetings ?? 0) +
      (s.board_appointments ?? 0) +
      (s.audit_reports ?? 0) +
      (s.news_articles ?? 0)
    : 0;

  const dataCategories = 14;

  return (
    <div className="mx-auto max-w-5xl px-6">
      {/* Hero */}
      <section className="pt-20 pb-12 animate-fade-in-up">
        <p className="text-sm uppercase tracking-[0.2em] text-[#FFD700] mb-6 font-medium">
          Data Sources &amp; Methodology
        </p>
        <h1 className="font-serif text-4xl md:text-6xl text-[#e6edf3] leading-[1.08] mb-6">
          Our Data
        </h1>
        <p className="text-lg text-[#8b949e] leading-relaxed max-w-3xl">
          Every claim OPAX makes is backed by publicly available records. Here is
          everything we aggregate, how we process it, and where it comes from
          &mdash; {dataCategories} categories of government data, cross-referenced to
          expose the gaps between rhetoric and reality.
        </p>
      </section>

      {/* Live Stats */}
      <section className="pb-16 animate-fade-in-up">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
          {loading ? (
            Array.from({ length: 8 }).map((_, i) => <StatSkeleton key={i} />)
          ) : (
            <>
              <AnimatedStat
                value={s?.speeches ?? 0}
                label="Speeches"
                enabled={visible}
              />
              <AnimatedStat
                value={s?.votes ?? 0}
                label="Votes"
                enabled={visible}
              />
              <AnimatedStat
                value={s?.donations ?? 0}
                label="Donations"
                enabled={visible}
              />
              <AnimatedStat
                value={s?.expenses ?? 0}
                label="Expenses"
                enabled={visible}
              />
              <AnimatedStat
                value={s?.grants ?? 0}
                label="Grants"
                enabled={visible}
              />
              <AnimatedStat
                value={s?.contracts ?? 0}
                label="Contracts"
                enabled={visible}
              />
              <AnimatedStat
                value={s?.board_appointments ?? 0}
                label="Appointments"
                enabled={visible}
              />
              <AnimatedStat
                value={s?.members ?? 0}
                label="Members"
                enabled={visible}
              />
            </>
          )}
        </div>
        <div className="flex items-center justify-center gap-4 mt-4">
          <p className="text-sm text-[#8b949e]/50">
            {loading
              ? "Loading live counts..."
              : `${totalRecords.toLocaleString()} total records across ${dataCategories} categories`}
          </p>
          {fetchedAt && (
            <span className="text-[10px] text-[#8b949e]/30">
              Live from API &middot;{" "}
              {new Date(fetchedAt).toLocaleTimeString()}
            </span>
          )}
        </div>
      </section>

      {/* Divider */}
      <div className="h-px bg-gradient-to-r from-transparent via-[#FFD700]/20 to-transparent" />

      {/* Parliamentary Records */}
      <SourceSection
        title="Parliamentary Speeches"
        subtitle="125 years of what they said on the floor — federal, state, and committee."
        sources={PARLIAMENTARY}
        loading={loading}
      />

      <div className="h-px bg-gradient-to-r from-transparent via-white/5 to-transparent" />

      {/* Voting Records */}
      <SourceSection
        title="Voting Records"
        subtitle="How they actually voted — not what they said they would."
        sources={VOTING}
        loading={loading}
      />

      <div className="h-px bg-gradient-to-r from-transparent via-white/5 to-transparent" />

      {/* Political Donations */}
      <SourceSection
        title="Political Donations"
        subtitle="Follow the money. Every disclosed dollar, classified by industry."
        sources={DONATIONS}
        loading={loading}
      />

      <div className="h-px bg-gradient-to-r from-transparent via-white/5 to-transparent" />

      {/* Government Contracts */}
      <SourceSection
        title="Government Contracts"
        subtitle="Where the money goes after the votes are cast."
        sources={CONTRACTS}
        loading={loading}
      />

      <div className="h-px bg-gradient-to-r from-transparent via-white/5 to-transparent" />

      {/* Government Grants */}
      <SourceSection
        title="Government Grants"
        subtitle="Discretionary spending mapped to electorates and donors."
        sources={GRANTS}
        loading={loading}
      />

      <div className="h-px bg-gradient-to-r from-transparent via-white/5 to-transparent" />

      {/* MP Expenses */}
      <SourceSection
        title="MP Expenses"
        subtitle="How parliamentarians spend public money on themselves."
        sources={EXPENSES}
        loading={loading}
      />

      <div className="h-px bg-gradient-to-r from-transparent via-white/5 to-transparent" />

      {/* Lobbying */}
      <SourceSection
        title="Lobbying"
        subtitle="Who has the ear of government."
        sources={LOBBYING}
        loading={loading}
      />

      <div className="h-px bg-gradient-to-r from-transparent via-white/5 to-transparent" />

      {/* Ministerial Meetings */}
      <SourceSection
        title="Ministerial Meetings"
        subtitle="Behind closed doors — disclosed diary entries."
        sources={MINISTERIAL}
        loading={loading}
      />

      <div className="h-px bg-gradient-to-r from-transparent via-white/5 to-transparent" />

      {/* Board Appointments */}
      <SourceSection
        title="Board Appointments"
        subtitle="Government patronage networks and revolving doors."
        sources={BOARDS}
        loading={loading}
      />

      <div className="h-px bg-gradient-to-r from-transparent via-white/5 to-transparent" />

      {/* Audit Reports */}
      <SourceSection
        title="Audit Reports"
        subtitle="Independent scrutiny of government programs."
        sources={AUDITS}
        loading={loading}
      />

      <div className="h-px bg-gradient-to-r from-transparent via-white/5 to-transparent" />

      {/* News Coverage */}
      <SourceSection
        title="News Coverage"
        subtitle="Media accountability and policy coverage."
        sources={NEWS}
        loading={loading}
      />

      <div className="h-px bg-gradient-to-r from-transparent via-white/5 to-transparent" />

      {/* MP Interests */}
      <SourceSection
        title="MP Registered Interests"
        subtitle="What they own, who they work for, and what they haven't told you."
        sources={MP_INTERESTS}
        loading={loading}
      />

      <div className="h-px bg-gradient-to-r from-transparent via-white/5 to-transparent" />

      {/* Electoral Data */}
      <SourceSection
        title="Electoral Data"
        subtitle="Demographics, results, and the geography of representation."
        sources={ELECTORAL}
        loading={loading}
      />

      {/* Divider */}
      <div className="h-px bg-gradient-to-r from-transparent via-[#FFD700]/20 to-transparent" />

      {/* Methodology */}
      <section className="py-12 animate-fade-in-up">
        <h2 className="font-serif text-2xl text-[#e6edf3] mb-6">
          Methodology
        </h2>
        <p className="text-[#8b949e] leading-relaxed mb-8">
          Raw data is only the beginning. Here is how we turn scattered records
          into a connected accountability graph.
        </p>
        <div className="space-y-4">
          {METHODOLOGY_ITEMS.map((item) => (
            <div
              key={item.title}
              className="rounded-lg border border-white/5 bg-[#12121a] p-5"
            >
              <h3 className="text-sm font-medium text-[#FFD700] mb-1.5">
                {item.title}
              </h3>
              <p className="text-sm text-[#8b949e] leading-relaxed">
                {item.detail}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Divider */}
      <div className="h-px bg-gradient-to-r from-transparent via-[#FFD700]/20 to-transparent" />

      {/* Attribution */}
      <section className="py-12 pb-20 animate-fade-in-up">
        <h2 className="font-serif text-2xl text-[#e6edf3] mb-4">
          Attribution
        </h2>
        <div className="rounded-xl border border-[#FFD700]/10 bg-[#FFD700]/5 p-6">
          <p className="text-sm text-[#FFD700]/80 leading-relaxed mb-4">
            OPAX is built entirely on publicly available data. We gratefully
            acknowledge the following sources and their contributors:
          </p>
          <ul className="text-sm text-[#8b949e] leading-relaxed space-y-1.5">
            <li>
              Commonwealth of Australia &mdash; Hansard, AEC, AusTender,
              GrantConnect, IPEA, ANAO
            </li>
            <li>
              Tim Sherratt / GLAM Workbench &mdash; Historic Hansard XML corpus
              (1901&ndash;2005)
            </li>
            <li>
              Zenodo / Harvard Dataverse &mdash; Hansard datasets
              (1998&ndash;2022)
            </li>
            <li>
              OpenAustralia Foundation &mdash; OpenAustralia &amp;
              TheyVoteForYou APIs
            </li>
            <li>
              NSW, Victorian, SA, QLD Parliaments &mdash; State Hansard APIs and
              open data
            </li>
            <li>
              Attorney-General&apos;s Department &mdash; Federal Register of
              Lobbyists
            </li>
            <li>
              QLD Premier&apos;s Office &mdash; Ministerial diary disclosures
            </li>
            <li>
              QLD Electoral Commission &mdash; State donation disclosures
            </li>
            <li>
              icacpls.github.io &mdash; Historical MP expenses and NSW donation
              data
            </li>
            <li>
              ABS &mdash; 2021 Census General Community Profile
            </li>
            <li>
              data.gov.au &mdash; AGOR, Directory.gov.au
            </li>
            <li>
              Guardian Australia &amp; ABC News &mdash; Political news coverage
            </li>
          </ul>
          <p className="text-xs text-[#8b949e]/50 mt-6">
            All data is used in accordance with applicable licences. Where data
            is Crown Copyright or Commonwealth Copyright, it is reproduced under
            open access provisions. OPAX does not claim ownership of source data.
          </p>
        </div>

        <div className="mt-10 text-center">
          <Link
            href="/about"
            className="text-sm text-[#FFD700] hover:text-[#FFD700]/80 transition-colors"
          >
            &larr; Back to About
          </Link>
        </div>
      </section>
    </div>
  );
}

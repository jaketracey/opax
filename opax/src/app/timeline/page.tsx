"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Skeleton,
  SkeletonCard,
  SkeletonText,
} from "@/components/skeleton";
import {
  Search,
  Banknote,
  FileText,
  Users,
  Building2,
  Briefcase,
  Shield,
  ChevronDown,
  ChevronUp,
  TrendingUp,
  ExternalLink,
} from "lucide-react";

/* ── Types ── */

interface TimelineEvent {
  date: string;
  date_display: string;
  type: string;
  title: string;
  description: string;
  amount: number | null;
  people: string[];
  party: string;
  source_id: string | number;
  extra: Record<string, unknown>;
}

interface TimelineSummary {
  total_events: number;
  total_donated: number;
  total_contracts: number;
  speech_count: number;
  donation_count: number;
  contract_count: number;
  meeting_count: number;
  pay_to_play_count: number;
  appointment_count: number;
  lobbying_count: number;
  parties_involved: string[];
  people_involved: string[];
  event_types: Record<string, number>;
  date_range: [string | null, string | null];
}

interface TimelineResponse {
  entity: string;
  events: TimelineEvent[];
  summary: TimelineSummary;
}

interface TopEntity {
  name: string;
  normalized: string;
  donation_total: number;
  donation_count: number;
  contract_total: number;
  contract_count: number;
  meeting_count: number;
  pay_to_play_count: number;
  appointment_count: number;
  lobbying_count: number;
  score: number;
  table_count: number;
  tables: string[];
}

interface TopResponse {
  entities: TopEntity[];
  count: number;
}

/* ── Scroll-triggered visibility hook ── */

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
      { threshold: 0.08 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return { ref, visible };
}

function Section({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const { ref, visible } = useScrollReveal();
  return (
    <section
      ref={ref}
      className={`py-10 transition-all duration-700 ease-out ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
      } ${className}`}
    >
      {children}
    </section>
  );
}

/* ── Helpers ── */

import { API_BASE } from "@/lib/utils";
const API = API_BASE;

const fmtCurrency = (n: number) => {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
};

const fmtFull = (n: number) => `$${n.toLocaleString()}`;

const EVENT_CONFIG: Record<
  string,
  { color: string; bg: string; border: string; icon: typeof Banknote; label: string }
> = {
  donation: {
    color: "text-amber-400",
    bg: "bg-amber-400/10",
    border: "border-amber-400/30",
    icon: Banknote,
    label: "Donation",
  },
  contract: {
    color: "text-red-400",
    bg: "bg-red-400/10",
    border: "border-red-400/30",
    icon: Building2,
    label: "Contract",
  },
  speech: {
    color: "text-blue-400",
    bg: "bg-blue-400/10",
    border: "border-blue-400/30",
    icon: FileText,
    label: "Speech",
  },
  meeting: {
    color: "text-purple-400",
    bg: "bg-purple-400/10",
    border: "border-purple-400/30",
    icon: Users,
    label: "Meeting",
  },
  pay_to_play: {
    color: "text-orange-400",
    bg: "bg-orange-400/10",
    border: "border-orange-400/30",
    icon: TrendingUp,
    label: "Pay-to-Play",
  },
  appointment: {
    color: "text-emerald-400",
    bg: "bg-emerald-400/10",
    border: "border-emerald-400/30",
    icon: Briefcase,
    label: "Appointment",
  },
  lobbying: {
    color: "text-cyan-400",
    bg: "bg-cyan-400/10",
    border: "border-cyan-400/30",
    icon: Shield,
    label: "Lobbying",
  },
};

const DEFAULT_CONFIG = {
  color: "text-gray-400",
  bg: "bg-gray-400/10",
  border: "border-gray-400/30",
  icon: FileText,
  label: "Event",
};

function getEventConfig(type: string) {
  return EVENT_CONFIG[type] || DEFAULT_CONFIG;
}

/* ── Stat Card ── */

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-[#12121a] p-5">
      <p className="text-xs uppercase tracking-wider text-[#8b949e] mb-1">
        {label}
      </p>
      <p className="text-2xl font-semibold text-[#e6edf3]">{value}</p>
      {sub && <p className="text-xs text-[#8b949e] mt-1">{sub}</p>}
    </div>
  );
}

/* ── Timeline Event Card ── */

function TimelineEventCard({ event }: { event: TimelineEvent }) {
  const [expanded, setExpanded] = useState(false);
  const config = getEventConfig(event.type);
  const Icon = config.icon;

  return (
    <div className="relative flex gap-4 group">
      {/* Timeline dot and line */}
      <div className="flex flex-col items-center shrink-0">
        <div
          className={`w-10 h-10 rounded-full ${config.bg} border ${config.border} flex items-center justify-center z-10`}
        >
          <Icon className={`w-4 h-4 ${config.color}`} />
        </div>
        <div className="w-px flex-1 bg-white/[0.06] min-h-4" />
      </div>

      {/* Content */}
      <div className="flex-1 pb-8">
        <button
          onClick={() => setExpanded(!expanded)}
          className={`w-full text-left rounded-xl border ${config.border} bg-[#12121a] hover:bg-[#16162a] transition-colors p-4 cursor-pointer`}
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span
                  className={`text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full ${config.bg} ${config.color}`}
                >
                  {config.label}
                </span>
                <span className="text-xs text-[#8b949e]">
                  {event.date_display}
                </span>
                {event.party && (
                  <span className="text-xs text-[#8b949e] opacity-60">
                    {event.party}
                  </span>
                )}
              </div>
              <p className="text-sm text-[#e6edf3] font-medium leading-snug">
                {event.title}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {event.amount != null && event.amount > 0 && (
                <span className={`text-sm font-semibold ${config.color}`}>
                  {fmtCurrency(event.amount)}
                </span>
              )}
              {expanded ? (
                <ChevronUp className="w-4 h-4 text-[#8b949e]" />
              ) : (
                <ChevronDown className="w-4 h-4 text-[#8b949e]" />
              )}
            </div>
          </div>

          {/* Expanded details */}
          {expanded && (
            <div className="mt-3 pt-3 border-t border-white/[0.06] space-y-2">
              <p className="text-sm text-[#8b949e] leading-relaxed">
                {event.description}
              </p>
              {event.amount != null && event.amount > 0 && (
                <p className="text-xs text-[#8b949e]">
                  Amount: <span className="text-[#e6edf3]">{fmtFull(event.amount)}</span>
                </p>
              )}
              {event.people.length > 0 && (
                <p className="text-xs text-[#8b949e]">
                  People:{" "}
                  <span className="text-[#e6edf3]">
                    {event.people.join(", ")}
                  </span>
                </p>
              )}
              {/* Extra fields */}
              {event.extra && (
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2">
                  {Object.entries(event.extra)
                    .filter(
                      ([, v]) =>
                        v != null && v !== "" && typeof v !== "object"
                    )
                    .slice(0, 8)
                    .map(([k, v]) => (
                      <p key={k} className="text-[11px] text-[#8b949e]">
                        <span className="text-[#6b7280]">
                          {k.replace(/_/g, " ")}:
                        </span>{" "}
                        <span className="text-[#c9d1d9]">
                          {typeof v === "number"
                            ? v > 1000
                              ? fmtCurrency(v)
                              : String(v)
                            : String(v).slice(0, 100)}
                        </span>
                      </p>
                    ))}
                </div>
              )}
            </div>
          )}
        </button>
      </div>
    </div>
  );
}

/* ── Year Divider ── */

function YearDivider({ year }: { year: string }) {
  return (
    <div className="relative flex gap-4">
      <div className="flex flex-col items-center shrink-0">
        <div className="w-10 h-10 rounded-full bg-[#FFD700]/10 border border-[#FFD700]/30 flex items-center justify-center z-10">
          <span className="text-xs font-bold text-[#FFD700]">{year}</span>
        </div>
        <div className="w-px flex-1 bg-white/[0.06] min-h-2" />
      </div>
      <div className="flex-1 pb-4 pt-2">
        <div className="h-px bg-gradient-to-r from-[#FFD700]/20 via-[#FFD700]/10 to-transparent" />
      </div>
    </div>
  );
}

/* ── Filter Chips ── */

function FilterChips({
  activeTypes,
  setActiveTypes,
  typeCounts,
}: {
  activeTypes: Set<string>;
  setActiveTypes: (s: Set<string>) => void;
  typeCounts: Record<string, number>;
}) {
  const types = Object.entries(typeCounts).sort(([, a], [, b]) => b - a);

  return (
    <div className="flex flex-wrap gap-2">
      <button
        onClick={() =>
          setActiveTypes(new Set(Object.keys(typeCounts)))
        }
        className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
          activeTypes.size === Object.keys(typeCounts).length
            ? "bg-white/10 border-white/20 text-[#e6edf3]"
            : "bg-transparent border-white/[0.06] text-[#8b949e] hover:border-white/10"
        }`}
      >
        All ({Object.values(typeCounts).reduce((a, b) => a + b, 0)})
      </button>
      {types.map(([type, count]) => {
        const config = getEventConfig(type);
        const active = activeTypes.has(type);
        return (
          <button
            key={type}
            onClick={() => {
              const next = new Set(activeTypes);
              if (active) {
                next.delete(type);
              } else {
                next.add(type);
              }
              setActiveTypes(next);
            }}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
              active
                ? `${config.bg} ${config.border} ${config.color}`
                : "bg-transparent border-white/[0.06] text-[#8b949e] hover:border-white/10"
            }`}
          >
            {config.label} ({count})
          </button>
        );
      })}
    </div>
  );
}

/* ── Top Entity Card ── */

function TopEntityCard({
  entity,
  rank,
  onSelect,
}: {
  entity: TopEntity;
  rank: number;
  onSelect: (name: string) => void;
}) {
  const { ref, visible } = useScrollReveal();
  return (
    <div
      ref={ref}
      className={`transition-all duration-500 ease-out ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
      }`}
      style={{ transitionDelay: `${Math.min(rank * 60, 400)}ms` }}
    >
      <button
        onClick={() => onSelect(entity.name)}
        className="w-full text-left rounded-xl border border-white/[0.06] bg-[#12121a] hover:bg-[#16162a] hover:border-[#FFD700]/20 transition-all p-4 group cursor-pointer"
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-[#FFD700]/50 w-6">
              #{rank}
            </span>
            <h3 className="text-sm font-semibold text-[#e6edf3] group-hover:text-[#FFD700] transition-colors leading-snug">
              {entity.name}
            </h3>
          </div>
          <ExternalLink className="w-3.5 h-3.5 text-[#8b949e] opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5" />
        </div>

        {/* Connection badges */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {entity.tables.map((table) => {
            const tableLabel: Record<string, string> = {
              donations: "Donations",
              contracts: "Contracts",
              contract_speech_links: "Pay-to-Play",
              ministerial_meetings: "Meetings",
              board_appointments: "Appointments",
              federal_lobbyist_clients: "Lobbying",
            };
            return (
              <span
                key={table}
                className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.04] text-[#8b949e] border border-white/[0.06]"
              >
                {tableLabel[table] || table}
              </span>
            );
          })}
        </div>

        {/* Key numbers */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          {entity.donation_total > 0 && (
            <div>
              <span className="text-amber-400/70">Donated</span>{" "}
              <span className="text-amber-400 font-semibold">
                {fmtCurrency(entity.donation_total)}
              </span>
            </div>
          )}
          {entity.contract_total > 0 && (
            <div>
              <span className="text-red-400/70">Contracts</span>{" "}
              <span className="text-red-400 font-semibold">
                {fmtCurrency(entity.contract_total)}
              </span>
            </div>
          )}
          {entity.meeting_count > 0 && (
            <div>
              <span className="text-purple-400/70">Meetings</span>{" "}
              <span className="text-purple-400 font-semibold">
                {entity.meeting_count}
              </span>
            </div>
          )}
          {entity.pay_to_play_count > 0 && (
            <div>
              <span className="text-orange-400/70">P2P Links</span>{" "}
              <span className="text-orange-400 font-semibold">
                {entity.pay_to_play_count}
              </span>
            </div>
          )}
        </div>

        <div className="mt-2 pt-2 border-t border-white/[0.04] flex items-center justify-between">
          <span className="text-[10px] text-[#8b949e]">
            {entity.table_count} data sources connected
          </span>
          <span className="text-[10px] text-[#FFD700]/50 font-semibold">
            Score: {entity.score}
          </span>
        </div>
      </button>
    </div>
  );
}

/* ── Loading Skeleton ── */

function TimelineSkeleton() {
  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
      {/* Timeline events */}
      <div className="space-y-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex gap-4">
            <Skeleton className="w-10 h-10 rounded-full shrink-0" />
            <div className="flex-1">
              <Skeleton className="h-24 w-full rounded-xl" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TopEntitiesSkeleton() {
  return (
    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: 9 }).map((_, i) => (
        <SkeletonCard key={i} className="h-44" />
      ))}
    </div>
  );
}

/* ── Main Page ── */

export default function FollowTheMoneyPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeEntity, setActiveEntity] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<TimelineResponse | null>(null);
  const [topEntities, setTopEntities] = useState<TopResponse | null>(null);
  const [loadingTimeline, setLoadingTimeline] = useState(false);
  const [loadingTop, setLoadingTop] = useState(true);
  const [activeTypes, setActiveTypes] = useState<Set<string>>(new Set());
  const [showAllEvents, setShowAllEvents] = useState(false);
  const timelineRef = useRef<HTMLDivElement>(null);

  // Fetch top entities on mount
  useEffect(() => {
    fetch(`${API}/api/timeline/top?limit=30`)
      .then((r) => r.json())
      .then((d: TopResponse) => setTopEntities(d))
      .catch(() => setTopEntities(null))
      .finally(() => setLoadingTop(false));
  }, []);

  // Fetch timeline for active entity
  const investigate = useCallback(
    (entity: string) => {
      if (!entity.trim()) return;
      setActiveEntity(entity);
      setLoadingTimeline(true);
      setTimeline(null);
      setShowAllEvents(false);

      fetch(`${API}/api/timeline/${encodeURIComponent(entity.trim())}`)
        .then((r) => r.json())
        .then((d: TimelineResponse) => {
          setTimeline(d);
          // Enable all types by default
          if (d.summary?.event_types) {
            setActiveTypes(new Set(Object.keys(d.summary.event_types)));
          }
        })
        .catch(() => setTimeline(null))
        .finally(() => setLoadingTimeline(false));

      // Scroll to timeline
      setTimeout(() => {
        timelineRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 200);
    },
    []
  );

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    investigate(searchQuery);
  };

  // Filter events by active types
  const filteredEvents = timeline?.events.filter((e) =>
    activeTypes.has(e.type)
  ) || [];

  // Group events by year
  const eventsByYear: Record<string, TimelineEvent[]> = {};
  for (const event of filteredEvents) {
    const year = event.date?.slice(0, 4) || "Unknown";
    if (!eventsByYear[year]) eventsByYear[year] = [];
    eventsByYear[year].push(event);
  }

  const years = Object.keys(eventsByYear).sort();
  const INITIAL_DISPLAY = 50;
  const displayEvents = showAllEvents
    ? filteredEvents
    : filteredEvents.slice(0, INITIAL_DISPLAY);

  return (
    <main className="min-h-screen bg-[#0a0a0f]">
      {/* Hero */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-amber-500/[0.03] via-transparent to-transparent" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-amber-500/[0.05] via-transparent to-transparent" />

        <div className="relative mx-auto max-w-5xl px-6 pt-20 pb-12">
          <div className="text-center space-y-4">
            <p className="text-xs uppercase tracking-[0.2em] text-amber-400/60 font-medium">
              OPAX Investigation Tool
            </p>
            <h1 className="text-4xl md:text-5xl font-serif text-[#e6edf3] tracking-tight">
              Follow the Money
            </h1>
            <p className="text-base md:text-lg text-[#8b949e] max-w-2xl mx-auto leading-relaxed">
              Trace any company or entity across political donations, government
              contracts, parliamentary speeches, ministerial meetings, lobbying
              registrations, and board appointments.
            </p>
          </div>

          {/* Search bar */}
          <form
            onSubmit={handleSearch}
            className="mt-8 max-w-2xl mx-auto"
          >
            <div className="relative group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#8b949e] group-focus-within:text-amber-400 transition-colors" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search any company, organisation, or person..."
                className="w-full pl-12 pr-28 py-4 rounded-xl bg-[#12121a] border border-white/[0.08] text-[#e6edf3] placeholder:text-[#6b7280] focus:outline-none focus:border-amber-400/40 focus:ring-1 focus:ring-amber-400/20 transition-all text-sm"
              />
              <button
                type="submit"
                className="absolute right-2 top-1/2 -translate-y-1/2 px-5 py-2 rounded-lg bg-amber-400/10 hover:bg-amber-400/20 border border-amber-400/20 text-amber-400 text-sm font-medium transition-colors"
              >
                Investigate
              </button>
            </div>
          </form>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-6 pb-20">
        {/* Timeline results */}
        <div ref={timelineRef}>
          {loadingTimeline && (
            <Section>
              <TimelineSkeleton />
            </Section>
          )}

          {timeline && !loadingTimeline && (
            <>
              {/* Summary stats */}
              <Section>
                <div className="flex items-center gap-3 mb-6">
                  <h2 className="text-xl font-serif text-[#e6edf3]">
                    Investigation:{" "}
                    <span className="text-amber-400">{timeline.entity}</span>
                  </h2>
                  {timeline.summary.date_range[0] && (
                    <span className="text-xs text-[#8b949e] bg-white/[0.04] px-2 py-1 rounded-full">
                      {timeline.summary.date_range[0]?.slice(0, 4)} &mdash;{" "}
                      {timeline.summary.date_range[1]?.slice(0, 4)}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                  <StatCard
                    label="Total Donated"
                    value={
                      timeline.summary.total_donated > 0
                        ? fmtCurrency(timeline.summary.total_donated)
                        : "$0"
                    }
                    sub={
                      timeline.summary.donation_count > 0
                        ? `${timeline.summary.donation_count} donation records`
                        : undefined
                    }
                  />
                  <StatCard
                    label="Total Contracts"
                    value={
                      timeline.summary.total_contracts > 0
                        ? fmtCurrency(timeline.summary.total_contracts)
                        : "$0"
                    }
                    sub={
                      timeline.summary.contract_count > 0
                        ? `${timeline.summary.contract_count} contracts`
                        : undefined
                    }
                  />
                  <StatCard
                    label="Parliament Mentions"
                    value={String(timeline.summary.speech_count)}
                    sub={
                      timeline.summary.meeting_count > 0
                        ? `+ ${timeline.summary.meeting_count} meetings`
                        : undefined
                    }
                  />
                  <StatCard
                    label="Total Events"
                    value={String(timeline.summary.total_events)}
                    sub={`${Object.keys(timeline.summary.event_types).length} event types`}
                  />
                </div>

                {/* Parties involved */}
                {timeline.summary.parties_involved.length > 0 && (
                  <div className="mb-6">
                    <p className="text-xs uppercase tracking-wider text-[#8b949e] mb-2">
                      Parties Involved
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {timeline.summary.parties_involved.slice(0, 10).map((p) => (
                        <span
                          key={p}
                          className="text-xs px-2 py-1 rounded-full bg-white/[0.04] text-[#c9d1d9] border border-white/[0.06]"
                        >
                          {p}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Filter chips */}
                {Object.keys(timeline.summary.event_types).length > 1 && (
                  <div>
                    <p className="text-xs uppercase tracking-wider text-[#8b949e] mb-2">
                      Filter by Event Type
                    </p>
                    <FilterChips
                      activeTypes={activeTypes}
                      setActiveTypes={setActiveTypes}
                      typeCounts={timeline.summary.event_types}
                    />
                  </div>
                )}
              </Section>

              {/* Timeline */}
              <Section>
                <h3 className="text-lg font-serif text-[#e6edf3] mb-6">
                  Chronological Timeline
                  <span className="text-sm text-[#8b949e] font-sans ml-2">
                    ({filteredEvents.length} events)
                  </span>
                </h3>

                {filteredEvents.length === 0 ? (
                  <div className="text-center py-16">
                    <p className="text-[#8b949e]">
                      No events found for this entity.
                    </p>
                    <p className="text-sm text-[#6b7280] mt-1">
                      Try a different search term or adjust the filters.
                    </p>
                  </div>
                ) : (
                  <div>
                    {/* Render events grouped by year */}
                    {(() => {
                      let eventCount = 0;
                      const maxToShow = showAllEvents
                        ? Infinity
                        : INITIAL_DISPLAY;
                      return (
                        <>
                          {years.map((year) => {
                            if (eventCount >= maxToShow) return null;
                            const yearEvents = eventsByYear[year];
                            return (
                              <div key={year}>
                                <YearDivider year={year} />
                                {yearEvents.map((event) => {
                                  eventCount++;
                                  if (eventCount > maxToShow) return null;
                                  return (
                                    <TimelineEventCard
                                      key={`${event.type}-${event.source_id}-${event.date}`}
                                      event={event}
                                    />
                                  );
                                })}
                              </div>
                            );
                          })}
                        </>
                      );
                    })()}

                    {/* Show more button */}
                    {filteredEvents.length > INITIAL_DISPLAY &&
                      !showAllEvents && (
                        <div className="text-center pt-4">
                          <button
                            onClick={() => setShowAllEvents(true)}
                            className="px-6 py-2 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] text-sm text-[#8b949e] hover:text-[#e6edf3] transition-colors"
                          >
                            Show all {filteredEvents.length} events
                          </button>
                        </div>
                      )}
                  </div>
                )}
              </Section>
            </>
          )}

          {/* Empty state after search with no results */}
          {timeline &&
            !loadingTimeline &&
            timeline.summary.total_events === 0 && (
              <Section>
                <div className="text-center py-16">
                  <p className="text-2xl text-[#8b949e] mb-2">
                    No data found
                  </p>
                  <p className="text-sm text-[#6b7280]">
                    No records for &ldquo;{timeline.entity}&rdquo; across any
                    data source. Try a different spelling or a broader search
                    term.
                  </p>
                </div>
              </Section>
            )}
        </div>

        {/* Top Investigations section */}
        {!activeEntity && (
          <Section>
            <div className="text-center mb-8">
              <h2 className="text-2xl font-serif text-[#e6edf3] mb-2">
                Top Investigations
              </h2>
              <p className="text-sm text-[#8b949e] max-w-lg mx-auto">
                Entities with the most cross-table connections across donations,
                contracts, speeches, meetings, lobbying, and board appointments.
              </p>
            </div>

            {loadingTop ? (
              <TopEntitiesSkeleton />
            ) : topEntities && topEntities.entities.length > 0 ? (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {topEntities.entities.map((entity, i) => (
                  <TopEntityCard
                    key={entity.normalized}
                    entity={entity}
                    rank={i + 1}
                    onSelect={(name) => {
                      setSearchQuery(name);
                      investigate(name);
                    }}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <p className="text-[#8b949e]">
                  No investigation targets found. Ensure the backend is running
                  and data has been ingested.
                </p>
              </div>
            )}
          </Section>
        )}

        {/* Back to top investigations */}
        {activeEntity && (
          <div className="text-center pt-4 pb-8">
            <button
              onClick={() => {
                setActiveEntity(null);
                setTimeline(null);
                setSearchQuery("");
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              className="px-6 py-2 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] text-sm text-[#8b949e] hover:text-[#e6edf3] transition-colors"
            >
              Back to Top Investigations
            </button>
          </div>
        )}
      </div>
    </main>
  );
}

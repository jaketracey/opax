"use client";

import { use, useState, useEffect, useRef } from "react";
import Link from "next/link";
import { PartyBadge } from "@/components/party-badge";
import { DisconnectMeter } from "@/components/disconnect-meter";
import {
  Skeleton,
  SkeletonCard,
  SkeletonChart,
  SkeletonText,
  SkeletonAvatar,
} from "@/components/skeleton";
import {
  MessageSquare,
  Vote,
  Calendar,
  Tag,
  ArrowRight,
  ChevronLeft,
  Scale,
  TrendingUp,
  Users,
  CircleDot,
  CheckCircle2,
  XCircle,
  MinusCircle,
  AlertTriangle,
  Lightbulb,
  DollarSign,
  Quote,
  BarChart3,
} from "lucide-react";
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  Cell,
} from "recharts";

import { API_BASE } from "@/lib/utils";

/* ── Types ── */

interface PoliticianProfile {
  name: string;
  party: string;
  electorate: string;
  chamber: string;
  photoId: string;
  yearsServed: string;
  bio: string;
  totalSpeeches: number;
  divisionsVotedIn: number;
  donationsReceived: string;
  sayVsDo: {
    topic: string;
    disconnect: number;
  }[];
  speechTimeline: { year: string; count: number }[];
  quotes: {
    date: string;
    text: string;
    context: "for" | "against";
    topic: string;
  }[];
  votingRecord: {
    area: string;
    support: number;
  }[];
  topDonors: {
    name: string;
    amount: string;
    industry: string;
  }[];
}

interface InsightsData {
  speech_count: number;
  top_topics: { name: string; count: number }[];
  notable_quotes: { date: string; topic: string; excerpt: string }[];
  speech_timeline: { year: string; count: number }[];
  policy_scores: { policy_name: string; agreement: number }[];
}

interface ConsistencyItem {
  topic: string;
  speeches_count: number;
  supportive_speeches: number;
  opposing_speeches: number;
  consistency_score: number;
  tvfy_agreement: number | null;
  badge: "ALIGNED" | "MIXED" | "DISCONNECT" | "INSUFFICIENT_DATA";
}

interface ConsistencyData {
  overall_consistency: number;
  topics: ConsistencyItem[];
}

interface MpInsightsData {
  career_stats: {
    total_speeches: number;
    total_votes: number;
    years_active: number;
  } | null;
  signature_topic: {
    topic: string;
    count: number;
    avg_count: number;
    pct_above_avg: number;
  } | null;
  biggest_disconnect: {
    topic: string;
    speech_count: number;
    against_pct: number;
  } | null;
  donor_exposure: {
    top_industries: string[];
    favorable_vote_pct: number;
  } | null;
  notable_quote: {
    date: string;
    text: string;
    topic: string;
    word_count: number;
  } | null;
  voting_summary: {
    total_divisions: number;
    rebellions: number;
    attendance_pct: number;
  } | null;
  peer_comparison: {
    speech_volume: { mp: number; party_avg: number };
    disconnect: { mp: number; party_avg: number };
    attendance: { mp: number; party_avg: number };
  } | null;
}

interface HighlightItem {
  topic: string;
  speech_count: number;
  best_quote: {
    date: string;
    hansard_topic: string;
    excerpt: string;
    word_count: number;
  } | null;
}

/* ── Hardcoded fallback profiles (kept for offline dev) ── */

const FALLBACK_PROFILES: Record<string, PoliticianProfile> = {
  "10007": {
    name: "Anthony Albanese",
    party: "Labor",
    electorate: "Grayndler, NSW",
    chamber: "representatives",
    photoId: "10007",
    yearsServed: "1996 - present",
    bio: "Current Prime Minister and long-serving MP for Grayndler in Sydney's inner west. Rose through the Labor ranks from factional politics to the nation's highest office.",
    totalSpeeches: 2341,
    divisionsVotedIn: 1876,
    donationsReceived: "$1.2M",
    sayVsDo: [
      { topic: "Gambling", disconnect: 58 },
      { topic: "Housing", disconnect: 45 },
      { topic: "Climate", disconnect: 30 },
    ],
    speechTimeline: [
      { year: "2010", count: 142 }, { year: "2011", count: 168 }, { year: "2012", count: 195 },
      { year: "2013", count: 156 }, { year: "2014", count: 120 }, { year: "2015", count: 134 },
      { year: "2016", count: 148 }, { year: "2017", count: 162 }, { year: "2018", count: 178 },
      { year: "2019", count: 201 }, { year: "2020", count: 165 }, { year: "2021", count: 189 },
      { year: "2022", count: 183 },
    ],
    quotes: [
      { date: "9 November 2017", text: "Gambling harm is real. The stories I hear from constituents across western Sydney are heartbreaking.", context: "against", topic: "Gambling Reform" },
      { date: "15 March 2021", text: "Every Australian deserves a roof over their head. Housing affordability is not just an economic issue.", context: "for", topic: "Housing" },
    ],
    votingRecord: [
      { area: "Climate Action", support: 72 },
      { area: "Housing Reform", support: 65 },
      { area: "Gambling Reform", support: 42 },
      { area: "Workers Rights", support: 88 },
      { area: "Healthcare", support: 82 },
    ],
    topDonors: [
      { name: "CFMEU", amount: "$245,000", industry: "Union" },
      { name: "Clubs NSW", amount: "$120,000", industry: "Gambling" },
      { name: "Pratt Holdings", amount: "$85,000", industry: "Manufacturing" },
    ],
  },
  "10633": {
    name: "Andrew Wilkie",
    party: "Independent",
    electorate: "Clark, TAS",
    chamber: "representatives",
    photoId: "10633",
    yearsServed: "2010 - present",
    bio: "Former intelligence analyst who famously blew the whistle on the intelligence used to justify the Iraq War. The most consistent advocate for gambling reform in Australian parliamentary history.",
    totalSpeeches: 847,
    divisionsVotedIn: 612,
    donationsReceived: "$45K",
    sayVsDo: [
      { topic: "Gambling", disconnect: 6 },
      { topic: "Housing", disconnect: 12 },
      { topic: "Climate", disconnect: 15 },
    ],
    speechTimeline: [
      { year: "2010", count: 42 }, { year: "2011", count: 78 }, { year: "2012", count: 124 },
      { year: "2013", count: 68 }, { year: "2014", count: 52 }, { year: "2015", count: 58 },
      { year: "2016", count: 45 }, { year: "2017", count: 72 }, { year: "2018", count: 68 },
      { year: "2019", count: 62 }, { year: "2020", count: 55 }, { year: "2021", count: 64 },
      { year: "2022", count: 59 },
    ],
    quotes: [
      { date: "14 February 2012", text: "I have seen the devastation that poker machines cause. This Parliament has the power to act, and act it must.", context: "for", topic: "Gambling Reform" },
    ],
    votingRecord: [
      { area: "Gambling Reform", support: 94 },
      { area: "Whistleblower Protection", support: 100 },
      { area: "Veterans Affairs", support: 96 },
    ],
    topDonors: [
      { name: "Individual donors", amount: "$32,000", industry: "Citizens" },
    ],
  },
  "10721": {
    name: "Adam Bandt",
    party: "Greens",
    electorate: "Melbourne, VIC",
    chamber: "representatives",
    photoId: "10721",
    yearsServed: "2010 - present",
    bio: "Leader of the Australian Greens since 2020. Highest speech-to-vote alignment of any current party leader.",
    totalSpeeches: 1203,
    divisionsVotedIn: 945,
    donationsReceived: "$320K",
    sayVsDo: [
      { topic: "Gambling", disconnect: 2 },
      { topic: "Housing", disconnect: 5 },
      { topic: "Climate", disconnect: 4 },
    ],
    speechTimeline: [
      { year: "2010", count: 52 }, { year: "2011", count: 68 }, { year: "2012", count: 82 },
      { year: "2013", count: 74 }, { year: "2014", count: 65 }, { year: "2015", count: 78 },
      { year: "2016", count: 85 }, { year: "2017", count: 98 }, { year: "2018", count: 112 },
      { year: "2019", count: 124 }, { year: "2020", count: 108 }, { year: "2021", count: 128 },
      { year: "2022", count: 129 },
    ],
    quotes: [
      { date: "28 March 2018", text: "Australians lose more per capita on gambling than any other country in the world.", context: "for", topic: "Gambling Reform" },
    ],
    votingRecord: [
      { area: "Gambling Reform", support: 98 },
      { area: "Climate Action", support: 100 },
      { area: "Housing Reform", support: 96 },
    ],
    topDonors: [
      { name: "Individual donors", amount: "$185,000", industry: "Citizens" },
      { name: "ACF", amount: "$45,000", industry: "Environment" },
    ],
  },
};

const partyBorderColors: Record<string, string> = {
  Labor: "#E13A3A",
  Liberal: "#1C4FA0",
  Greens: "#00843D",
  Nationals: "#006644",
  Independent: "#888888",
};

/* Party average scores for comparison markers */
const PARTY_AVERAGES: Record<string, number> = {
  Labor: 55,
  Liberal: 40,
  Greens: 78,
  Nationals: 35,
  Independent: 50,
};

const TOPIC_COLORS = [
  "#FFD700", "#E13A3A", "#1C4FA0", "#00843D", "#8B5CF6",
  "#F59E0B", "#EC4899", "#06B6D4", "#10B981", "#D97706",
];

const BADGE_STYLES: Record<string, { bg: string; text: string; label: string; color: string }> = {
  ALIGNED: { bg: "rgba(0, 132, 61, 0.15)", text: "#00843D", label: "ALIGNED", color: "#00843D" },
  MIXED: { bg: "rgba(255, 215, 0, 0.15)", text: "#FFD700", label: "MIXED", color: "#F59E0B" },
  DISCONNECT: { bg: "rgba(220, 38, 38, 0.15)", text: "#DC2626", label: "DISCONNECT", color: "#DC2626" },
  INSUFFICIENT_DATA: { bg: "rgba(139, 148, 158, 0.15)", text: "#8b949e", label: "NO DATA", color: "#8b949e" },
};

/* Suggested comparable MPs by party */
const COMPARABLE_MPS: Record<string, { id: string; name: string; party: string; electorate: string; photoId: string }[]> = {
  Labor: [
    { id: "10580", name: "Tanya Plibersek", party: "Labor", electorate: "Sydney, NSW", photoId: "10580" },
    { id: "10743", name: "Jim Chalmers", party: "Labor", electorate: "Rankin, QLD", photoId: "10743" },
    { id: "10080", name: "Chris Bowen", party: "Labor", electorate: "McMahon, NSW", photoId: "10080" },
    { id: "10738", name: "Richard Marles", party: "Labor", electorate: "Corio, VIC", photoId: "10738" },
    { id: "10729", name: "Mark Dreyfus", party: "Labor", electorate: "Isaacs, VIC", photoId: "10729" },
  ],
  Liberal: [
    { id: "10001", name: "Tony Abbott", party: "Liberal", electorate: "Warringah, NSW", photoId: "10001" },
    { id: "10088", name: "Peter Dutton", party: "Liberal", electorate: "Dickson, QLD", photoId: "10088" },
    { id: "10841", name: "Angus Taylor", party: "Liberal", electorate: "Hume, NSW", photoId: "10841" },
    { id: "10415", name: "Sussan Ley", party: "Liberal", electorate: "Farrer, NSW", photoId: "10415" },
    { id: "10583", name: "Simon Birmingham", party: "Liberal", electorate: "SA", photoId: "10583" },
  ],
  Greens: [
    { id: "10719", name: "Sarah Hanson-Young", party: "Greens", electorate: "SA", photoId: "10719" },
    { id: "10722", name: "Larissa Waters", party: "Greens", electorate: "QLD", photoId: "10722" },
    { id: "10721", name: "Adam Bandt", party: "Greens", electorate: "Melbourne, VIC", photoId: "10721" },
  ],
  Nationals: [
    { id: "10350", name: "Barnaby Joyce", party: "Nationals", electorate: "New England, NSW", photoId: "10350" },
    { id: "10849", name: "David Littleproud", party: "Nationals", electorate: "Maranoa, QLD", photoId: "10849" },
  ],
  Independent: [
    { id: "10633", name: "Andrew Wilkie", party: "Independent", electorate: "Clark, TAS", photoId: "10633" },
  ],
};

function formatAmount(amount: number): string {
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(0)}K`;
  return `$${amount.toLocaleString()}`;
}

/* ── Custom Recharts tooltip ── */

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number; name: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-white/10 bg-[#0a0a0f]/95 px-4 py-3 text-xs text-[#e6edf3] shadow-2xl backdrop-blur-sm">
      <p className="font-semibold text-[#FFD700] mb-1.5 text-sm">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="text-[#8b949e]">
          {p.name}: <span className="text-[#e6edf3] font-bold tabular-nums">{p.value.toLocaleString()}</span>
        </p>
      ))}
    </div>
  );
}

/* ── Fade-in wrapper using IntersectionObserver ── */

function FadeInSection({
  children,
  className = "",
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
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

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(24px)",
        transition: `opacity 0.6s ease-out ${delay}ms, transform 0.6s ease-out ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}

/* ── Section wrapper with fade-in ── */

function Section({ title, subtitle, icon, children, className = "", delay = 0 }: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <FadeInSection className={`py-10 ${className}`} delay={delay}>
      <div className="flex items-center gap-3 mb-2">
        {icon && (
          <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-[#FFD700]/10 text-[#FFD700] shrink-0">
            {icon}
          </div>
        )}
        <h2 className="text-2xl font-bold text-[#e6edf3] tracking-tight">{title}</h2>
        <div className="flex-1 h-px bg-gradient-to-r from-white/10 to-transparent" />
      </div>
      {subtitle && <p className="text-sm text-[#8b949e] mb-6 ml-11">{subtitle}</p>}
      {children}
    </FadeInSection>
  );
}

/* ── Stat Card ── */

function StatCard({
  icon,
  label,
  value,
  color = "#FFD700",
  delay = 0,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color?: string;
  delay?: number;
}) {
  return (
    <FadeInSection delay={delay}>
      <div className="group relative rounded-xl border border-white/[0.06] bg-[#12121a] p-5 overflow-hidden transition-all duration-300 hover:border-white/[0.12] hover:bg-[#14141f] h-full">
        {/* Glow effect on hover */}
        <div
          className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
          style={{
            background: `radial-gradient(circle at 50% 0%, ${color}08 0%, transparent 70%)`,
          }}
        />
        <div className="relative">
          <div className="flex items-center gap-2.5 mb-3">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: `${color}15`, color }}
            >
              {icon}
            </div>
            <span className="text-xs text-[#8b949e] uppercase tracking-[0.12em] font-medium">
              {label}
            </span>
          </div>
          <p className="text-3xl font-bold tabular-nums tracking-tight" style={{ color }}>
            {value}
          </p>
        </div>
      </div>
    </FadeInSection>
  );
}

/* ── Traffic Light Indicator ── */

function TrafficLight({ status, pulse = false }: { status: "green" | "amber" | "red" | "grey"; pulse?: boolean }) {
  const colors = {
    green: "#00843D",
    amber: "#F59E0B",
    red: "#DC2626",
    grey: "#8b949e",
  };
  const color = colors[status];
  return (
    <span className="relative inline-flex">
      {pulse && (
        <span
          className="absolute inset-0 rounded-full animate-ping opacity-40"
          style={{ backgroundColor: color }}
        />
      )}
      <span
        className="relative w-3 h-3 rounded-full border border-black/20"
        style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}60` }}
      />
    </span>
  );
}

/* ── Skeleton Loader (uses @/components/skeleton) ── */

function ProfileSkeleton() {
  return (
    <div className="mx-auto max-w-6xl px-6">
      {/* Breadcrumb */}
      <div className="pt-6">
        <Skeleton className="h-4 w-32" />
      </div>

      {/* Hero */}
      <div className="relative mt-4 rounded-2xl overflow-hidden">
        <Skeleton className="h-72 w-full rounded-2xl" />
        <div className="absolute bottom-6 left-6 flex items-end gap-5">
          <SkeletonAvatar size={128} />
          <div className="space-y-3">
            <Skeleton className="h-10 w-72" />
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-4 w-96" />
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8">
        {[0, 1, 2, 3].map((i) => (
          <SkeletonCard key={i} />
        ))}
      </div>

      {/* Quotes */}
      <div className="mt-12 space-y-4">
        <Skeleton className="h-6 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {[0, 1].map((i) => (
            <div key={i} className="rounded-xl border border-white/5 bg-[#12121a] p-6">
              <SkeletonText lines={3} />
            </div>
          ))}
        </div>
      </div>

      {/* Topics */}
      <div className="mt-12 space-y-4">
        <Skeleton className="h-6 w-36" />
        <div className="flex flex-wrap gap-2">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-8 w-28 rounded-full" style={{ animationDelay: `${i * 80}ms` }} />
          ))}
        </div>
      </div>

      {/* Chart */}
      <div className="mt-12">
        <SkeletonChart height={380} />
      </div>

      {/* Voting Scorecard */}
      <div className="mt-12 space-y-3">
        <Skeleton className="h-6 w-48 mb-4" />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="rounded-xl border border-white/5 bg-[#12121a] p-5">
              <Skeleton className="h-4 w-24 mb-3" style={{ animationDelay: `${i * 60}ms` }} />
              <Skeleton className="h-10 w-10 rounded-full mx-auto mb-2" style={{ animationDelay: `${i * 60 + 30}ms` }} />
              <Skeleton className="h-3 w-12 mx-auto" style={{ animationDelay: `${i * 60 + 60}ms` }} />
            </div>
          ))}
        </div>
      </div>

      {/* Bottom spacer */}
      <div className="pb-20" />
    </div>
  );
}

/* ── Magazine Quote Card ── */

function MagazineQuoteCard({
  speakerName,
  photoId,
  date,
  quote,
  context,
  topic,
}: {
  speakerName: string;
  photoId: string;
  date: string;
  quote: string;
  context: "for" | "against";
  topic: string;
}) {
  const contextColor = context === "for" ? "#00843D" : "#DC2626";
  const contextLabel = context === "for" ? "Spoke FOR reform" : "Voted AGAINST reform";

  return (
    <div className="group relative rounded-xl border border-white/[0.06] bg-[#12121a] p-6 overflow-hidden transition-all duration-300 hover:border-white/[0.1]">
      {/* Decorative gold line on left */}
      <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-[#FFD700] via-[#FFD700]/50 to-transparent" />

      <div className="flex gap-4">
        {/* Speaker photo */}
        <div className="shrink-0 pt-1">
          <div className="w-10 h-10 rounded-full overflow-hidden border border-white/10">
            <img
              src={`https://www.openaustralia.org.au/images/mps/${photoId}.jpg`}
              alt={speakerName}
              className="w-full h-full object-cover"
            />
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <span className="text-4xl font-serif leading-none text-[#FFD700]/60 select-none" aria-hidden="true">
            &ldquo;
          </span>

          <blockquote className="text-lg md:text-xl text-[#e6edf3]/90 italic leading-relaxed font-light -mt-4 mb-4">
            {quote}
            <span className="text-4xl font-serif leading-none text-[#FFD700]/60 select-none ml-1" aria-hidden="true">
              &rdquo;
            </span>
          </blockquote>

          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs text-[#8b949e]">{date}</span>
            <span className="text-[#8b949e]/40">|</span>
            <span
              className="text-xs px-2 py-0.5 rounded-md border"
              style={{
                color: contextColor,
                backgroundColor: `${contextColor}10`,
                borderColor: `${contextColor}30`,
              }}
            >
              {contextLabel}
            </span>
            <span className="text-xs px-2 py-0.5 rounded-md bg-[#FFD700]/10 text-[#FFD700] border border-[#FFD700]/20">
              {topic}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Topic Pill ── */

function TopicPill({ name, count, color }: { name: string; count: number; color: string }) {
  return (
    <span
      className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium border transition-all duration-200 hover:scale-105"
      style={{
        backgroundColor: `${color}12`,
        borderColor: `${color}30`,
        color,
      }}
    >
      <CircleDot className="w-3 h-3" />
      <span className="capitalize">{name.replace(/_/g, " ")}</span>
      <span
        className="text-xs font-bold tabular-nums rounded-full px-2 py-0.5"
        style={{ backgroundColor: `${color}20` }}
      >
        {count}
      </span>
    </span>
  );
}

/* ── Profile Insights Skeleton ── */

function InsightsSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className="rounded-xl border border-white/[0.06] bg-[#12121a] p-5"
          style={{ animationDelay: `${i * 100}ms` }}
        >
          <Skeleton className="h-4 w-28 mb-3" />
          <Skeleton className="h-5 w-full mb-2" />
          <Skeleton className="h-3 w-3/4" />
        </div>
      ))}
      <div className="md:col-span-2 rounded-xl border border-white/[0.06] bg-[#12121a] p-5">
        <Skeleton className="h-4 w-36 mb-3" />
        <div className="flex gap-6">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex-1">
              <Skeleton className="h-3 w-16 mb-2" />
              <Skeleton className="h-24 w-full rounded-md" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Profile Insights Section ── */

function ProfileInsightsSection({
  data,
  loading: isLoading,
  mpName,
  party,
}: {
  data: MpInsightsData | null;
  loading: boolean;
  mpName: string;
  party: string;
}) {
  if (isLoading) {
    return (
      <FadeInSection className="py-10" delay={120}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-[#FFD700]/10 text-[#FFD700] shrink-0">
            <Lightbulb className="w-4 h-4" />
          </div>
          <h2 className="text-2xl font-bold text-[#e6edf3] tracking-tight">Profile Insights</h2>
          <div className="flex-1 h-px bg-gradient-to-r from-white/10 to-transparent" />
        </div>
        <p className="text-sm text-[#8b949e] mb-6 ml-11">Loading analysis...</p>
        <InsightsSkeleton />
      </FadeInSection>
    );
  }

  // Graceful 404 -- no data means the endpoint doesn't exist or returned nothing useful
  if (!data) return null;

  const hasAnyCard =
    data.signature_topic ||
    data.biggest_disconnect ||
    data.donor_exposure ||
    data.notable_quote ||
    data.peer_comparison;

  if (!hasAnyCard) return null;

  const firstName = mpName.split(" ")[0];

  return (
    <FadeInSection className="py-10" delay={120}>
      <div className="flex items-center gap-3 mb-2">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-[#FFD700]/10 text-[#FFD700] shrink-0">
          <Lightbulb className="w-4 h-4" />
        </div>
        <h2 className="text-2xl font-bold text-[#e6edf3] tracking-tight">Profile Insights</h2>
        <div className="flex-1 h-px bg-gradient-to-r from-white/10 to-transparent" />
      </div>
      <p className="text-sm text-[#8b949e] mb-6 ml-11">
        Automated analysis of {firstName}&rsquo;s parliamentary record.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Signature Topic */}
        {data.signature_topic && (
          <div
            className="group rounded-xl border border-white/[0.06] bg-[#12121a] p-5 overflow-hidden transition-all duration-300 hover:border-[#8B5CF6]/30"
            style={{
              opacity: 0,
              transform: "translateY(16px)",
              animation: "fade-in-up 0.5s ease-out 0.1s forwards",
            }}
          >
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-[#8B5CF6]/15 text-[#8B5CF6]">
                <Tag className="w-3.5 h-3.5" />
              </div>
              <span className="text-xs text-[#8b949e] uppercase tracking-[0.12em] font-medium">
                Signature Topic
              </span>
            </div>
            <p className="text-sm text-[#e6edf3] leading-relaxed">
              This MP&rsquo;s focus area is{" "}
              <span className="font-semibold text-[#8B5CF6] capitalize">
                {data.signature_topic.topic.replace(/_/g, " ")}
              </span>{" "}
              &mdash; they&rsquo;ve spoken about it{" "}
              <span className="font-bold text-[#e6edf3] tabular-nums">
                {data.signature_topic.count.toLocaleString()}
              </span>{" "}
              times,{" "}
              <span className="font-bold text-[#8B5CF6] tabular-nums">
                {Math.round(data.signature_topic.pct_above_avg)}%
              </span>{" "}
              more than the average MP.
            </p>
          </div>
        )}

        {/* Disconnect Alert */}
        {data.biggest_disconnect && data.biggest_disconnect.against_pct > 30 && (
          <div
            className="group rounded-xl border border-[#DC2626]/20 bg-[#DC2626]/[0.04] p-5 overflow-hidden transition-all duration-300 hover:border-[#DC2626]/40"
            style={{
              opacity: 0,
              transform: "translateY(16px)",
              animation: "fade-in-up 0.5s ease-out 0.2s forwards",
            }}
          >
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-[#DC2626]/15 text-[#DC2626]">
                <AlertTriangle className="w-3.5 h-3.5" />
              </div>
              <span className="text-xs text-[#DC2626]/80 uppercase tracking-[0.12em] font-medium">
                Disconnect Alert
              </span>
            </div>
            <p className="text-sm text-[#e6edf3] leading-relaxed">
              <span className="font-semibold text-[#e6edf3]">{firstName}</span>{" "}
              spoke about{" "}
              <span className="font-semibold text-[#DC2626] capitalize">
                {data.biggest_disconnect.topic.replace(/_/g, " ")}
              </span>{" "}
              <span className="font-bold text-[#e6edf3] tabular-nums">
                {data.biggest_disconnect.speech_count.toLocaleString()}
              </span>{" "}
              times but voted against reform{" "}
              <span className="font-bold text-[#DC2626] tabular-nums">
                {Math.round(data.biggest_disconnect.against_pct)}%
              </span>{" "}
              of the time.
            </p>
          </div>
        )}

        {/* Donor Exposure */}
        {data.donor_exposure && data.donor_exposure.top_industries.length > 0 && (
          <div
            className="group rounded-xl border border-white/[0.06] bg-[#12121a] p-5 overflow-hidden transition-all duration-300 hover:border-[#FFD700]/30"
            style={{
              opacity: 0,
              transform: "translateY(16px)",
              animation: "fade-in-up 0.5s ease-out 0.3s forwards",
            }}
          >
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-[#FFD700]/15 text-[#FFD700]">
                <DollarSign className="w-3.5 h-3.5" />
              </div>
              <span className="text-xs text-[#8b949e] uppercase tracking-[0.12em] font-medium">
                Donor Exposure
              </span>
            </div>
            <p className="text-sm text-[#e6edf3] leading-relaxed">
              The top industries funding{" "}
              <span className="font-semibold text-[#e6edf3]">{party}</span> are{" "}
              {data.donor_exposure.top_industries.slice(0, 3).map((ind, i, arr) => (
                <span key={ind}>
                  <span className="font-semibold text-[#FFD700]">{ind}</span>
                  {i < arr.length - 1 ? (i === arr.length - 2 ? " and " : ", ") : ""}
                </span>
              ))}
              .{" "}
              {firstName} voted favorably on{" "}
              <span className="font-semibold text-[#FFD700]">
                {data.donor_exposure.top_industries[0]}
              </span>{" "}
              issues{" "}
              <span className="font-bold text-[#FFD700] tabular-nums">
                {Math.round(data.donor_exposure.favorable_vote_pct)}%
              </span>{" "}
              of the time.
            </p>
          </div>
        )}

        {/* Notable Quote */}
        {data.notable_quote && (
          <div
            className="group rounded-xl border border-white/[0.06] bg-[#12121a] p-5 overflow-hidden transition-all duration-300 hover:border-[#FFD700]/30"
            style={{
              opacity: 0,
              transform: "translateY(16px)",
              animation: "fade-in-up 0.5s ease-out 0.4s forwards",
            }}
          >
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-[#06B6D4]/15 text-[#06B6D4]">
                <Quote className="w-3.5 h-3.5" />
              </div>
              <span className="text-xs text-[#8b949e] uppercase tracking-[0.12em] font-medium">
                Notable Quote
              </span>
            </div>
            <div className="relative pl-4 border-l-2 border-[#FFD700]/30">
              <span
                className="absolute -top-1 -left-1 text-2xl font-serif text-[#FFD700]/15 leading-none select-none"
                aria-hidden="true"
              >
                &ldquo;
              </span>
              <blockquote className="text-sm text-[#e6edf3]/85 italic leading-relaxed">
                &ldquo;{data.notable_quote.text.length > 200
                  ? data.notable_quote.text.slice(0, 200) + "..."
                  : data.notable_quote.text}&rdquo;
              </blockquote>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-xs text-[#8b949e]">{data.notable_quote.date}</span>
                {data.notable_quote.topic && (
                  <>
                    <span className="text-[#8b949e]/40">|</span>
                    <span className="text-xs px-2 py-0.5 rounded-md bg-[#FFD700]/10 text-[#FFD700] border border-[#FFD700]/20 capitalize">
                      {data.notable_quote.topic.replace(/_/g, " ")}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Peer Comparison */}
        {data.peer_comparison && (
          <div
            className="md:col-span-2 group rounded-xl border border-white/[0.06] bg-[#12121a] p-5 overflow-hidden transition-all duration-300 hover:border-white/[0.12]"
            style={{
              opacity: 0,
              transform: "translateY(16px)",
              animation: "fade-in-up 0.5s ease-out 0.5s forwards",
            }}
          >
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-[#10B981]/15 text-[#10B981]">
                <BarChart3 className="w-3.5 h-3.5" />
              </div>
              <span className="text-xs text-[#8b949e] uppercase tracking-[0.12em] font-medium">
                Peer Comparison
              </span>
              <span className="text-xs text-[#8b949e]/60 ml-1">
                {firstName} vs {party} average
              </span>
            </div>

            <div className="grid grid-cols-3 gap-4 md:gap-6">
              {/* Speech Volume */}
              <PeerComparisonChart
                label="Speech Volume"
                mpValue={data.peer_comparison.speech_volume.mp}
                avgValue={data.peer_comparison.speech_volume.party_avg}
                mpName={firstName}
                color="#FFD700"
              />
              {/* Disconnect */}
              <PeerComparisonChart
                label="Disconnect"
                mpValue={data.peer_comparison.disconnect.mp}
                avgValue={data.peer_comparison.disconnect.party_avg}
                mpName={firstName}
                color="#DC2626"
                lowerIsBetter
              />
              {/* Attendance */}
              <PeerComparisonChart
                label="Attendance"
                mpValue={data.peer_comparison.attendance.mp}
                avgValue={data.peer_comparison.attendance.party_avg}
                mpName={firstName}
                color="#10B981"
                isPercent
              />
            </div>
          </div>
        )}
      </div>

    </FadeInSection>
  );
}

/* ── Peer Comparison Mini Bar Chart ── */

function PeerComparisonChart({
  label,
  mpValue,
  avgValue,
  mpName,
  color,
  lowerIsBetter = false,
  isPercent = false,
}: {
  label: string;
  mpValue: number;
  avgValue: number;
  mpName: string;
  color: string;
  lowerIsBetter?: boolean;
  isPercent?: boolean;
}) {
  const maxVal = Math.max(mpValue, avgValue, 1) * 1.15;
  const barData = [
    { name: mpName, value: mpValue },
    { name: "Avg", value: avgValue },
  ];
  const isBetter = lowerIsBetter ? mpValue <= avgValue : mpValue >= avgValue;
  const diffPct = avgValue > 0 ? Math.round(((mpValue - avgValue) / avgValue) * 100) : 0;
  const diffLabel = diffPct > 0 ? `+${diffPct}%` : `${diffPct}%`;

  return (
    <div className="text-center">
      <p className="text-[10px] text-[#8b949e] uppercase tracking-[0.1em] font-medium mb-2">
        {label}
      </p>
      <div className="h-24">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={barData} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
            <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={32}>
              {barData.map((entry, idx) => (
                <Cell
                  key={entry.name}
                  fill={idx === 0 ? color : "#8b949e"}
                  fillOpacity={idx === 0 ? 0.8 : 0.3}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="flex items-center justify-center gap-3 mt-1.5">
        <div className="text-center">
          <p className="text-xs font-bold tabular-nums" style={{ color }}>
            {isPercent ? `${Math.round(mpValue)}%` : mpValue.toLocaleString()}
          </p>
          <p className="text-[9px] text-[#8b949e]">{mpName}</p>
        </div>
        <div className="w-px h-5 bg-white/10" />
        <div className="text-center">
          <p className="text-xs font-bold tabular-nums text-[#8b949e]">
            {isPercent ? `${Math.round(avgValue)}%` : avgValue.toLocaleString()}
          </p>
          <p className="text-[9px] text-[#8b949e]">Avg</p>
        </div>
      </div>
      {diffPct !== 0 && (
        <span
          className="inline-block mt-1 text-[10px] font-semibold tabular-nums px-1.5 py-0.5 rounded"
          style={{
            color: isBetter ? "#10B981" : "#DC2626",
            backgroundColor: isBetter ? "rgba(16,185,129,0.12)" : "rgba(220,38,38,0.12)",
          }}
        >
          {diffLabel}
        </span>
      )}
    </div>
  );
}

/* ── Voting Scorecard Card ── */

function VotingScorecardItem({ area, support, partyAvg }: { area: string; support: number; partyAvg: number }) {
  const pct = Math.min(Math.max(support, 0), 100);
  const Icon = pct >= 65 ? CheckCircle2 : pct >= 35 ? MinusCircle : XCircle;
  const color = pct >= 65 ? "#00843D" : pct >= 35 ? "#8b949e" : "#DC2626";
  const bgColor = pct >= 65 ? "rgba(0,132,61,0.10)" : pct >= 35 ? "rgba(139,148,158,0.10)" : "rgba(220,38,38,0.10)";
  const ringColor = pct >= 65 ? "rgba(0,132,61,0.25)" : pct >= 35 ? "rgba(139,148,158,0.15)" : "rgba(220,38,38,0.25)";
  const vsParty = pct - partyAvg;

  return (
    <div
      className="group rounded-xl border border-white/[0.06] bg-[#12121a] p-5 text-center transition-all duration-300 hover:border-white/[0.12] hover:bg-[#14141f] relative overflow-hidden"
    >
      {/* Subtle top accent */}
      <div className="absolute top-0 left-0 right-0 h-0.5" style={{ backgroundColor: color }} />

      <p className="text-xs text-[#8b949e] uppercase tracking-[0.1em] font-medium mb-4 capitalize truncate">
        {area.replace(/_/g, " ")}
      </p>

      {/* Circular icon badge */}
      <div
        className="w-16 h-16 rounded-full mx-auto mb-3 flex items-center justify-center transition-transform duration-300 group-hover:scale-110"
        style={{
          backgroundColor: bgColor,
          border: `2px solid ${ringColor}`,
        }}
      >
        <Icon className="w-7 h-7" style={{ color }} />
      </div>

      <p className="text-2xl font-bold tabular-nums mb-1" style={{ color }}>
        {pct}%
      </p>
      <p className="text-[10px] text-[#8b949e] uppercase tracking-wider">agreement</p>

      {vsParty !== 0 && (
        <div className="mt-2">
          <span
            className="text-[10px] font-semibold tabular-nums px-2 py-0.5 rounded"
            style={{
              color: vsParty > 0 ? "#00843D" : "#DC2626",
              backgroundColor: vsParty > 0 ? "rgba(0,132,61,0.12)" : "rgba(220,38,38,0.12)",
            }}
          >
            {vsParty > 0 ? "+" : ""}{vsParty}% vs party
          </span>
        </div>
      )}
    </div>
  );
}

/* ── Main Page Component ── */

export default function PoliticianProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [politician, setPolitician] = useState<PoliticianProfile | null>(null);
  const [insights, setInsights] = useState<InsightsData | null>(null);
  const [consistency, setConsistency] = useState<ConsistencyData | null>(null);
  const [highlights, setHighlights] = useState<HighlightItem[]>([]);
  const [mpInsights, setMpInsights] = useState<MpInsightsData | null>(null);
  const [mpInsightsLoading, setMpInsightsLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const heroRef = useRef<HTMLDivElement>(null);
  const [heroOffset, setHeroOffset] = useState(0);

  /* Parallax scroll handler */
  useEffect(() => {
    function handleScroll() {
      if (heroRef.current) {
        const rect = heroRef.current.getBoundingClientRect();
        setHeroOffset(Math.max(0, -rect.top * 0.3));
      }
    }
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const fallback = FALLBACK_PROFILES[id];

    // Fetch all endpoints in parallel
    const fetchProfile = fetch(`${API_BASE}/api/mp/${id}/profile`)
      .then((r) => r.json())
      .catch(() => null);
    const fetchInsights = fetch(`${API_BASE}/api/mp/${id}/insights`)
      .then((r) => r.json())
      .catch(() => null);
    const fetchConsistency = fetch(`${API_BASE}/api/mp/${id}/consistency`)
      .then((r) => r.json())
      .catch(() => null);
    const fetchHighlights = fetch(`${API_BASE}/api/mp/${id}/speeches/highlights`)
      .then((r) => r.json())
      .catch(() => null);

    // Fetch mp-insights independently -- endpoint may not exist (404 is fine)
    fetch(`${API_BASE}/api/mp-insights/${id}`)
      .then((r) => {
        if (!r.ok) return null;
        return r.json();
      })
      .then((data) => {
        if (data && !data.error && !data.detail) setMpInsights(data);
      })
      .catch(() => null)
      .finally(() => setMpInsightsLoading(false));

    Promise.all([fetchProfile, fetchInsights, fetchConsistency, fetchHighlights])
      .then(([profileData, insightsData, consistencyData, highlightsData]) => {
        // Build profile from API data
        if (profileData && !profileData.error) {
          const chamber = profileData.chamber || "representatives";
          const profile: PoliticianProfile = {
            name: profileData.full_name || `${profileData.first_name || ""} ${profileData.last_name || ""}`.trim() || "Unknown",
            party: profileData.party || "Unknown",
            electorate: profileData.electorate || (chamber === "senate" ? "Senator" : ""),
            chamber,
            photoId: String(profileData.person_id),
            yearsServed: profileData.first_speech && profileData.last_speech
              ? `${profileData.first_speech.slice(0, 4)} - ${profileData.last_speech.slice(0, 4)}`
              : "",
            bio: "",
            totalSpeeches: profileData.speech_count || 0,
            divisionsVotedIn: profileData.votes
              ? Object.values(profileData.votes as Record<string, number>).reduce((a: number, b: number) => a + b, 0)
              : 0,
            donationsReceived: "",
            sayVsDo: [],
            speechTimeline: [],
            quotes: [],
            votingRecord: [],
            topDonors: [],
          };

          // Populate voting record from TVFY policy scores
          if (profileData.policy_scores?.length) {
            profile.votingRecord = profileData.policy_scores.map(
              (ps: { policy_name: string; agreement: number }) => ({
                area: ps.policy_name,
                support: Math.round(ps.agreement * 100),
              })
            );
          }

          // Populate donors from API
          if (profileData.top_party_donors?.length) {
            profile.topDonors = profileData.top_party_donors.map(
              (d: { donor_name: string; total: number; industry: string }) => ({
                name: d.donor_name,
                amount: formatAmount(d.total),
                industry: d.industry || "Unknown",
              })
            );
          }

          // Merge fallback richer data if available
          if (fallback) {
            profile.bio = fallback.bio;
            profile.yearsServed = fallback.yearsServed || profile.yearsServed;
            profile.donationsReceived = profile.donationsReceived || fallback.donationsReceived;
            if (!profile.votingRecord.length) profile.votingRecord = fallback.votingRecord;
            if (!profile.topDonors.length) profile.topDonors = fallback.topDonors;
            profile.sayVsDo = fallback.sayVsDo;
            profile.quotes = fallback.quotes;
            if (!profile.totalSpeeches && fallback.totalSpeeches) {
              profile.totalSpeeches = fallback.totalSpeeches;
            }
          }

          setPolitician(profile);
        } else if (fallback) {
          setPolitician(fallback);
        } else {
          setError(true);
        }

        if (insightsData && !insightsData.error) setInsights(insightsData);
        if (consistencyData && !consistencyData.error) setConsistency(consistencyData);
        if (highlightsData?.highlights) setHighlights(highlightsData.highlights);
      })
      .finally(() => setLoading(false));
  }, [id]);

  /* ── Loading state ── */
  if (loading) {
    return <ProfileSkeleton />;
  }

  if (error || !politician) {
    return (
      <div className="mx-auto max-w-6xl px-6 pt-20 text-center">
        <h1 className="text-3xl font-bold text-[#e6edf3] mb-4">
          Politician Not Found
        </h1>
        <p className="text-[#8b949e] mb-8">
          We don&rsquo;t have a detailed profile for this politician yet.
        </p>
        <Link
          href="/politicians"
          className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium bg-[#FFD700] text-[#0a0a0f] hover:bg-[#FFD700]/90 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to Politicians
        </Link>
      </div>
    );
  }

  const borderColor = partyBorderColors[politician.party] || "#888888";
  const isSenator = politician.chamber === "senate";
  const chamberLabel = isSenator ? "Senate" : "House of Representatives";
  const chamberColor = isSenator ? "#8B0000" : "#00843D";
  const roleLabel = isSenator
    ? `Senator for ${politician.electorate}`
    : `Member for ${politician.electorate}`;

  // Compute years served as number
  const yearsMatch = politician.yearsServed.match(/(\d{4})\s*-\s*(\d{4}|present)/i);
  const startYear = yearsMatch ? parseInt(yearsMatch[1]) : null;
  const endYear = yearsMatch
    ? yearsMatch[2].toLowerCase() === "present"
      ? new Date().getFullYear()
      : parseInt(yearsMatch[2])
    : null;
  const yearsServedNum = startYear && endYear ? endYear - startYear : null;

  // Merge quotes: API insights quotes + fallback quotes, deduplicated
  const allQuotes: PoliticianProfile["quotes"] = [...politician.quotes];
  if (insights?.notable_quotes?.length) {
    for (const q of insights.notable_quotes) {
      if (!allQuotes.some((existing) => existing.date === q.date)) {
        allQuotes.push({
          date: q.date,
          text: q.excerpt,
          context: "for",
          topic: q.topic || "Parliament",
        });
      }
    }
  }

  // Merge speech timeline: prefer API insights data if available
  const timelineData =
    insights?.speech_timeline?.length
      ? insights.speech_timeline
      : politician.speechTimeline;

  // Compute peak year
  const peakYear = timelineData.length > 0
    ? timelineData.reduce((max, d) => d.count > max.count ? d : max, timelineData[0])
    : null;

  // Merge voting record: prefer API insights policy scores if available
  const votingData =
    insights?.policy_scores?.length
      ? insights.policy_scores.map((ps) => ({
          area: ps.policy_name,
          support: Math.round(ps.agreement * 100),
        }))
      : politician.votingRecord;

  // Build topics data from insights
  const topicsData = insights?.top_topics?.length
    ? insights.top_topics.slice(0, 10)
    : [];

  // Top topic
  const topTopic = topicsData.length > 0
    ? topicsData[0].name.replace(/_/g, " ")
    : politician.votingRecord.length > 0
      ? politician.votingRecord[0].area
      : null;

  // Build consistency items, merging with sayVsDo fallback
  const consistencyItems = consistency?.topics?.length
    ? consistency.topics
    : politician.sayVsDo.map((s) => ({
        topic: s.topic,
        speeches_count: 0,
        supportive_speeches: 0,
        opposing_speeches: 0,
        consistency_score: s.disconnect > 0 ? 100 - s.disconnect : -1,
        tvfy_agreement: null,
        badge: (s.disconnect > 60 ? "DISCONNECT" : s.disconnect > 25 ? "MIXED" : "ALIGNED") as ConsistencyItem["badge"],
      }));

  // Party average for voting comparison
  const partyAvg = PARTY_AVERAGES[politician.party] ?? 50;

  // Compare with suggestions (exclude current MP)
  const comparables = (COMPARABLE_MPS[politician.party] || COMPARABLE_MPS["Independent"] || [])
    .filter((mp) => mp.id !== id)
    .slice(0, 3);

  return (
    <div className="mx-auto max-w-6xl px-6">
      {/* Breadcrumb */}
      <FadeInSection className="pt-6">
        <Link
          href="/politicians"
          className="text-sm text-[#8b949e] hover:text-[#FFD700] transition-colors inline-flex items-center gap-1.5"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          All Politicians
        </Link>
      </FadeInSection>

      {/* ── Hero with Parallax ── */}
      <FadeInSection delay={50}>
        <section ref={heroRef} className="relative mt-4 rounded-2xl overflow-hidden" style={{ minHeight: 280 }}>
          {/* Large background photo with parallax */}
          <div
            className="absolute inset-0 bg-cover bg-center bg-no-repeat"
            style={{
              backgroundImage: `url(https://www.openaustralia.org.au/images/mpsL/${politician.photoId}.jpg)`,
              transform: `translateY(${heroOffset}px) scale(1.1)`,
              filter: "brightness(0.4) saturate(0.7)",
            }}
          />

          {/* Dark gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0f] via-[#0a0a0f]/70 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#0a0a0f]/60 to-transparent" />

          {/* Party-colored accent stripe at top */}
          <div
            className="absolute top-0 left-0 right-0 h-1"
            style={{ background: `linear-gradient(to right, ${borderColor}, ${borderColor}80, transparent)` }}
          />

          {/* Content positioned at bottom */}
          <div className="relative px-6 md:px-8 pt-28 pb-8 flex flex-col md:flex-row items-end gap-6">
            {/* Large photo with party-colored ring */}
            <div
              className="w-28 h-28 md:w-32 md:h-32 rounded-full overflow-hidden shrink-0 shadow-2xl"
              style={{
                borderWidth: 3,
                borderStyle: "solid",
                borderColor,
                boxShadow: `0 0 30px ${borderColor}30`,
              }}
            >
              <img
                src={`https://www.openaustralia.org.au/images/mpsL/${politician.photoId}.jpg`}
                alt={politician.name}
                className="w-full h-full object-cover"
              />
            </div>

            <div className="flex-1 min-w-0 pb-1">
              <div className="flex items-center gap-3 mb-2 flex-wrap">
                <h1 className="text-3xl md:text-4xl lg:text-5xl font-extrabold text-white tracking-tight">
                  {politician.name}
                </h1>
              </div>
              <div className="flex items-center gap-3 mb-2 flex-wrap">
                <PartyBadge party={politician.party} className="text-sm px-3 py-1" />
                <span
                  className="text-xs font-bold uppercase tracking-[0.15em] px-3 py-1.5 rounded-md backdrop-blur-sm"
                  style={{
                    backgroundColor: `${chamberColor}25`,
                    color: chamberColor,
                    border: `1px solid ${chamberColor}50`,
                  }}
                >
                  {chamberLabel}
                </span>
              </div>
              <p className="text-[#e6edf3]/70 text-sm">{roleLabel}</p>
              {politician.yearsServed && (
                <p className="text-xs text-[#8b949e]/60 mt-0.5">{politician.yearsServed}</p>
              )}
              {politician.bio && (
                <p className="text-sm text-[#8b949e] leading-relaxed max-w-2xl mt-3">
                  {politician.bio}
                </p>
              )}
            </div>

            {/* Compare button in hero */}
            <div className="shrink-0 pb-1 hidden md:block">
              <Link
                href={`/compare?a=${id}`}
                className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium border border-[#FFD700]/30 text-[#FFD700] bg-[#FFD700]/5 hover:bg-[#FFD700]/15 hover:border-[#FFD700]/50 transition-all duration-300 backdrop-blur-sm"
              >
                <Users className="w-4 h-4" />
                Compare with...
              </Link>
            </div>
          </div>
        </section>
      </FadeInSection>

      {/* Mobile compare button */}
      <FadeInSection className="md:hidden mt-4" delay={100}>
        <Link
          href={`/compare?a=${id}`}
          className="flex items-center justify-center gap-2 rounded-lg px-5 py-3 text-sm font-medium border border-[#FFD700]/30 text-[#FFD700] bg-[#FFD700]/5 hover:bg-[#FFD700]/15 hover:border-[#FFD700]/50 transition-all duration-300 w-full"
        >
          <Users className="w-4 h-4" />
          Compare with another MP
        </Link>
      </FadeInSection>

      {/* ── Stats Row ── */}
      <section className="py-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            icon={<MessageSquare className="w-4 h-4" />}
            label="Total Speeches"
            value={(insights?.speech_count || politician.totalSpeeches).toLocaleString()}
            color="#FFD700"
            delay={100}
          />
          {politician.divisionsVotedIn > 0 && (
            <StatCard
              icon={<Vote className="w-4 h-4" />}
              label="Divisions Voted"
              value={politician.divisionsVotedIn.toLocaleString()}
              color="#06B6D4"
              delay={150}
            />
          )}
          {yearsServedNum !== null && (
            <StatCard
              icon={<Calendar className="w-4 h-4" />}
              label="Years Served"
              value={String(yearsServedNum)}
              color="#10B981"
              delay={200}
            />
          )}
          {topTopic && (
            <StatCard
              icon={<Tag className="w-4 h-4" />}
              label="Top Topic"
              value={topTopic.length > 16 ? topTopic.slice(0, 15) + "..." : topTopic}
              color="#8B5CF6"
              delay={250}
            />
          )}
        </div>
      </section>

      {/* ── Profile Insights ── */}
      <ProfileInsightsSection
        data={mpInsights}
        loading={mpInsightsLoading}
        mpName={politician.name}
        party={politician.party}
      />

      {/* ── In Their Own Words -- Magazine Pullout ── */}
      {allQuotes.length > 0 && (
        <Section
          title="In Their Own Words"
          subtitle={`Direct speech excerpts from the Hansard record by ${politician.name.split(" ")[0]}.`}
          icon={<MessageSquare className="w-4 h-4" />}
          delay={100}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {allQuotes.slice(0, 4).map((q, i) => (
              <MagazineQuoteCard
                key={i}
                speakerName={politician.name}
                photoId={politician.photoId}
                date={q.date}
                quote={q.text}
                context={q.context}
                topic={q.topic}
              />
            ))}
          </div>
        </Section>
      )}

      {/* ── Key Topics -- Colored Pills ── */}
      {topicsData.length > 0 && (
        <Section
          title="Key Topics"
          subtitle={`What ${politician.name.split(" ")[0]} talks about most in Parliament. Sized by number of speeches.`}
          icon={<Tag className="w-4 h-4" />}
          delay={150}
        >
          <div className="rounded-xl border border-white/[0.06] bg-[#12121a] p-5 md:p-6">
            {/* Topic pills */}
            <div className="flex flex-wrap gap-3 mb-6">
              {topicsData.map((t, i) => (
                <TopicPill
                  key={t.name}
                  name={t.name}
                  count={t.count}
                  color={TOPIC_COLORS[i % TOPIC_COLORS.length]}
                />
              ))}
            </div>

            {/* Horizontal bar breakdown */}
            <div className="space-y-3">
              {topicsData.slice(0, 8).map((t, i) => {
                const maxCount = topicsData[0].count;
                const pct = maxCount > 0 ? (t.count / maxCount) * 100 : 0;
                const color = TOPIC_COLORS[i % TOPIC_COLORS.length];
                return (
                  <div key={t.name} className="flex items-center gap-3">
                    <span className="text-xs text-[#e6edf3] w-28 truncate capitalize text-right shrink-0">
                      {t.name.replace(/_/g, " ")}
                    </span>
                    <div className="flex-1 h-6 rounded-md bg-white/[0.04] overflow-hidden">
                      <div
                        className="h-full rounded-md transition-all duration-700 ease-out flex items-center justify-end pr-2"
                        style={{
                          width: `${Math.max(pct, 4)}%`,
                          background: `linear-gradient(90deg, ${color}80, ${color})`,
                        }}
                      >
                        <span className="text-[10px] font-bold text-white/90 tabular-nums">
                          {t.count}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </Section>
      )}

      {/* ── Speech Activity Timeline (AreaChart) ── */}
      {timelineData.length > 0 && (
        <Section
          title="Speech Activity"
          subtitle={`Parliamentary speeches over time.${peakYear ? ` Peak year: ${peakYear.year} (${peakYear.count} speeches).` : ""}`}
          icon={<TrendingUp className="w-4 h-4" />}
          delay={200}
        >
          <div className="rounded-xl border border-white/[0.06] bg-[#12121a] p-4 md:p-6">
            <ResponsiveContainer width="100%" height={320}>
              <AreaChart
                data={timelineData}
                margin={{ top: 8, right: 8, bottom: 0, left: -16 }}
              >
                <defs>
                  <linearGradient id="timelineGradientGold" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#FFD700" stopOpacity={0.35} />
                    <stop offset="50%" stopColor="#FFD700" stopOpacity={0.1} />
                    <stop offset="100%" stopColor="#FFD700" stopOpacity={0.01} />
                  </linearGradient>
                </defs>
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
                  content={<ChartTooltip />}
                  cursor={{ stroke: "rgba(255,215,0,0.2)", strokeWidth: 1 }}
                />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke="#FFD700"
                  strokeWidth={2}
                  fill="url(#timelineGradientGold)"
                  name="Speeches"
                  dot={false}
                  activeDot={{
                    r: 5,
                    fill: "#FFD700",
                    stroke: "#0a0a0f",
                    strokeWidth: 2,
                  }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Section>
      )}

      {/* ── Voting Record Scorecard ── */}
      {votingData.length > 0 && (
        <Section
          title="Voting Scorecard"
          subtitle={`TVFY policy agreement scores. Green = supports (65%+), red = opposes (<35%), gray = mixed.`}
          icon={<Scale className="w-4 h-4" />}
          delay={250}
        >
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {votingData.map((v) => (
              <VotingScorecardItem
                key={v.area}
                area={v.area}
                support={v.support}
                partyAvg={partyAvg}
              />
            ))}
          </div>
        </Section>
      )}

      {/* ── Consistency Check ── */}
      {consistencyItems.length > 0 && (
        <Section
          title="Consistency Check"
          subtitle={`Does ${politician.name.split(" ")[0]}'s rhetoric match their voting record? Each topic shows speech stance versus actual votes.`}
          icon={<Scale className="w-4 h-4" />}
          delay={300}
        >
          <div className="rounded-xl border border-white/[0.06] bg-[#12121a] p-5 space-y-0 divide-y divide-white/[0.06]">
            {consistencyItems.slice(0, 7).map((item) => {
              const style = BADGE_STYLES[item.badge] || BADGE_STYLES.INSUFFICIENT_DATA;
              const trafficStatus: "green" | "amber" | "red" | "grey" =
                item.badge === "ALIGNED" ? "green"
                : item.badge === "MIXED" ? "amber"
                : item.badge === "DISCONNECT" ? "red"
                : "grey";
              const shouldPulse = item.badge === "DISCONNECT";
              return (
                <div key={item.topic} className="py-5 first:pt-0 last:pb-0">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <TrafficLight status={trafficStatus} pulse={shouldPulse} />
                      <h3 className="text-base font-semibold text-[#e6edf3] capitalize">
                        {item.topic.replace(/_/g, " ")}
                      </h3>
                    </div>
                    <span
                      className="text-xs font-bold uppercase tracking-[0.12em] px-3 py-1.5 rounded-md"
                      style={{ backgroundColor: style.bg, color: style.text }}
                    >
                      {style.label}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm ml-6">
                    <div>
                      <span className="text-[#8b949e] text-xs block mb-0.5">Speeches</span>
                      <p className="text-[#e6edf3] font-semibold tabular-nums">{item.speeches_count}</p>
                    </div>
                    <div>
                      <span className="text-[#8b949e] text-xs block mb-0.5">Pro-reform</span>
                      <p className="text-[#00843D] font-semibold tabular-nums">{item.supportive_speeches}</p>
                    </div>
                    <div>
                      <span className="text-[#8b949e] text-xs block mb-0.5">Anti-reform</span>
                      <p className="text-[#DC2626] font-semibold tabular-nums">{item.opposing_speeches}</p>
                    </div>
                    {item.tvfy_agreement !== null && (
                      <div>
                        <span className="text-[#8b949e] text-xs block mb-0.5">TVFY Score</span>
                        <p className="text-[#FFD700] font-semibold tabular-nums">
                          {Math.round(item.tvfy_agreement * 100)}%
                        </p>
                      </div>
                    )}
                  </div>
                  {item.consistency_score >= 0 && (
                    <div className="mt-3 ml-6">
                      <DisconnectMeter
                        score={100 - item.consistency_score}
                        label="Disconnect"
                        size="md"
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {/* ── Donations to Party ── */}
      {politician.topDonors.length > 0 && (
        <Section
          title="Donations to Party"
          subtitle={`Largest declared donors to ${politician.party} from AEC returns. Figures represent cumulative disclosed donations.`}
          delay={350}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {politician.topDonors.map((d) => (
              <div
                key={d.name}
                className="group rounded-xl border border-white/[0.06] bg-[#12121a] p-5 flex items-center justify-between transition-all duration-300 hover:border-white/[0.1]"
              >
                <div>
                  <h3 className="text-base font-semibold text-[#e6edf3]">
                    {d.name}
                  </h3>
                  <span className="text-xs text-[#8b949e]">{d.industry}</span>
                </div>
                <span className="text-lg font-bold text-[#FFD700] tabular-nums">
                  {d.amount}
                </span>
              </div>
            ))}
          </div>
          {politician.topDonors.some(
            (d) =>
              d.industry === "Gambling" ||
              d.industry === "gambling" ||
              d.industry === "Hospitality"
          ) && (
            <div className="mt-5 rounded-xl border border-[#DC2626]/10 bg-[#DC2626]/5 p-4">
              <p className="text-sm text-[#DC2626]/80 leading-relaxed">
                <strong className="text-[#DC2626]">Flag:</strong> This politician has
                received donations from the gambling or hospitality industry.
                Their voting record on gambling reform should be evaluated in
                this context.
              </p>
            </div>
          )}
        </Section>
      )}

      {/* ── Speech Highlights by Topic ── */}
      {highlights.length > 0 && (
        <Section
          title="Speech Highlights by Topic"
          subtitle="The most substantive speech excerpt from each of their top topics."
          delay={400}
        >
          <div className="space-y-4">
            {highlights.map((h) =>
              h.best_quote ? (
                <div
                  key={h.topic}
                  className="rounded-xl border border-white/[0.06] bg-[#12121a] p-5"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-semibold uppercase tracking-wider px-2.5 py-1 rounded-md bg-[#FFD700]/10 text-[#FFD700] border border-[#FFD700]/20 capitalize">
                        {h.topic.replace(/_/g, " ")}
                      </span>
                      <span className="text-xs text-[#8b949e]">
                        {h.speech_count} speeches on this topic
                      </span>
                    </div>
                    <span className="text-xs text-[#8b949e]">
                      {h.best_quote.date}
                    </span>
                  </div>
                  <blockquote className="text-sm text-[#e6edf3]/80 italic leading-relaxed pl-4 border-l-2 border-[#FFD700]/30">
                    &ldquo;{h.best_quote.excerpt}&rdquo;
                  </blockquote>
                  {h.best_quote.hansard_topic && (
                    <p className="mt-2 text-xs text-[#8b949e]">
                      Hansard topic: {h.best_quote.hansard_topic}
                    </p>
                  )}
                </div>
              ) : null
            )}
          </div>
        </Section>
      )}

      {/* ── Compare With... ── */}
      {comparables.length > 0 && (
        <Section
          title="Compare With..."
          subtitle={`Other ${politician.party} members you might want to compare.`}
          icon={<Users className="w-4 h-4" />}
          delay={450}
          className="pb-20"
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {comparables.map((mp) => (
              <Link
                key={mp.id}
                href={`/politicians/${mp.id}`}
                className="group relative rounded-xl border border-white/[0.06] bg-[#12121a] p-5 overflow-hidden transition-all duration-300 hover:border-[#FFD700]/30 hover:bg-[#14141f]"
              >
                {/* Hover glow */}
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-to-br from-[#FFD700]/[0.03] to-transparent" />

                <div className="relative flex items-center gap-4">
                  <div
                    className="w-14 h-14 rounded-full overflow-hidden shrink-0 border-2"
                    style={{ borderColor: partyBorderColors[mp.party] || "#888" }}
                  >
                    <img
                      src={`https://www.openaustralia.org.au/images/mps/${mp.photoId}.jpg`}
                      alt={mp.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[#e6edf3] group-hover:text-[#FFD700] transition-colors truncate">
                      {mp.name}
                    </p>
                    <p className="text-xs text-[#8b949e] truncate">{mp.electorate}</p>
                    <PartyBadge party={mp.party} className="mt-1.5" />
                  </div>
                  <ArrowRight className="w-4 h-4 text-[#8b949e] group-hover:text-[#FFD700] transition-colors shrink-0" />
                </div>
              </Link>
            ))}
          </div>

          {/* Full compare link */}
          <div className="mt-6 text-center">
            <Link
              href={`/compare?a=${id}`}
              className="inline-flex items-center gap-2 text-sm text-[#FFD700]/80 hover:text-[#FFD700] transition-colors"
            >
              <Users className="w-4 h-4" />
              Open full comparison tool
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </Section>
      )}

      {/* Bottom spacing if no comparables */}
      {comparables.length === 0 && <div className="pb-20" />}
    </div>
  );
}

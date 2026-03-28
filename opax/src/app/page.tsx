"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useEffect, useRef, useCallback } from "react";
import {
  SkeletonStatRow,
  SkeletonTopicCard,
} from "@/components/skeleton";

import { API_BASE } from "@/lib/utils";

// --- Data ---

const hotTopics = [
  {
    emoji: "\u{1F3B0}",
    name: "Gambling Reform",
    speeches: 1512,
    disconnect: "HIGH" as const,
    description:
      "25 years of passionate speeches. $65M in industry donations. Almost no reform passed.",
    href: "/gambling",
    sparkline: [12, 18, 25, 32, 45, 60, 55, 72, 88, 95, 78, 110, 105, 98, 120, 135, 115, 90, 85, 100, 125, 140, 130, 155, 148],
  },
  {
    emoji: "\u{1F3E0}",
    name: "Housing Affordability",
    speeches: 2847,
    disconnect: "HIGH" as const,
    description:
      "Every party promises affordable housing. Home ownership keeps falling to record lows.",
    href: "/housing",
    sparkline: [30, 35, 42, 55, 60, 58, 75, 80, 95, 110, 105, 125, 130, 140, 120, 115, 135, 155, 170, 180, 165, 190, 210, 225, 240],
  },
  {
    emoji: "\u{1F30F}",
    name: "Climate Action",
    speeches: 24269,
    disconnect: "HIGH" as const,
    description:
      "24,000+ speeches. $1.96B in fossil fuel donations. A carbon price that lasted just two years.",
    href: "/climate",
    sparkline: [200, 280, 350, 420, 510, 680, 750, 900, 1100, 1350, 1500, 1680, 1420, 1200, 980, 850, 920, 1050, 1200, 1350, 1500, 1600, 1450, 1300, 1100],
  },
  {
    emoji: "\u{1F3E5}",
    name: "Healthcare",
    speeches: 2156,
    disconnect: "MEDIUM" as const,
    description:
      "Bipartisan support in speeches. Funding cuts and staffing shortages tell another story.",
    href: "#",
    sparkline: [50, 55, 60, 72, 80, 85, 78, 90, 95, 88, 92, 100, 105, 110, 95, 88, 82, 90, 98, 105, 112, 108, 115, 120, 118],
  },
  {
    emoji: "\u{1F4FA}",
    name: "Media Ownership",
    speeches: 71081,
    disconnect: "HIGH" as const,
    description:
      "71,000+ speeches on media. Three companies control what Australians see. Parliament relaxed ownership rules in 2017.",
    href: "/media",
    sparkline: [3000, 3500, 4200, 4800, 5500, 6200, 5800, 5400, 5000, 4600, 4200, 4800, 5200, 5600, 5100, 4700, 4300, 3900, 4100, 4500, 4800, 5000, 4600, 4200, 3800],
  },
  {
    emoji: "\u{1F91D}",
    name: "Indigenous Affairs",
    speeches: 25769,
    disconnect: "HIGH" as const,
    description:
      "25,000+ speeches on reconciliation and First Nations issues. The gap between words and outcomes persists.",
    href: "/indigenous",
    sparkline: [400, 450, 520, 600, 680, 750, 820, 900, 1000, 1100, 1050, 980, 1100, 1250, 1350, 1200, 1100, 1000, 1150, 1300, 1500, 1650, 1800, 1400, 1200],
  },
  {
    emoji: "\u{1F4B0}",
    name: "Pay-to-Play",
    speeches: 8420,
    disconnect: "HIGH" as const,
    description:
      "16K government contracts cross-referenced against 205K donations. When donors win contracts, is it coincidence or corruption?",
    href: "/pay-to-play",
    sparkline: [20, 35, 50, 65, 80, 110, 140, 160, 200, 250, 280, 310, 350, 400, 380, 420, 460, 500, 540, 580, 620, 680, 720, 760, 800],
  },
  {
    emoji: "\u{1F50C}",
    name: "The Disconnect",
    speeches: 42000,
    disconnect: "HIGH" as const,
    description:
      "Quantifying the gap between what MPs say and how they vote. Disconnect scores across every policy area and politician.",
    href: "/disconnect",
    sparkline: [100, 120, 140, 180, 220, 260, 300, 340, 380, 420, 460, 500, 520, 540, 560, 580, 600, 640, 680, 720, 760, 800, 840, 880, 920],
  },
  {
    emoji: "\u{1F3AF}",
    name: "Donor Influence",
    speeches: 15300,
    disconnect: "HIGH" as const,
    description:
      "Correlation analysis between donation flows and legislative outcomes. Which industries get the most return on their political investment?",
    href: "/donor-influence",
    sparkline: [50, 70, 90, 130, 170, 210, 250, 290, 330, 370, 410, 450, 480, 510, 540, 570, 600, 640, 680, 720, 750, 780, 810, 850, 900],
  },
];

const disconnectColors: Record<string, string> = {
  HIGH: "#DC2626",
  MEDIUM: "#FFD700",
  LOW: "#00843D",
};

const disconnectBg: Record<string, string> = {
  HIGH: "rgba(220, 38, 38, 0.1)",
  MEDIUM: "rgba(255, 215, 0, 0.1)",
  LOW: "rgba(0, 132, 61, 0.1)",
};

const PLACEHOLDER_QUESTIONS = [
  "Which MPs took gambling money and voted against reform?",
  "What did Albanese say about housing affordability?",
  "Who speaks most about climate but votes against action?",
  "Show me speeches defending fossil fuel subsidies",
  "Which senators changed their position on immigration?",
  "How much did mining companies donate to the Liberals?",
  "Find MPs who spoke about corruption but blocked the ICAC",
  "What did Penny Wong say about gambling in the Senate?",
];

const SUGGESTED_QUESTIONS = [
  { label: "Gambling donations vs reform votes", q: "gambling donations vs reform votes" },
  { label: "Housing affordability speeches by party", q: "housing affordability speeches by party" },
  { label: "Climate speeches vs fossil fuel money", q: "climate speeches vs fossil fuel donations" },
  { label: "Who changed position on immigration?", q: "senators changed position immigration" },
  { label: "ICAC support by party", q: "ICAC federal integrity commission support by party" },
  { label: "Mining donations to Liberals", q: "mining company donations Liberal Party" },
];

const FINDINGS = [
  {
    icon: "\u{1F3B0}",
    color: "#DC2626",
    stat: "$65M",
    label: "in gambling donations",
    finding: "0 major reform bills passed in 25 years",
    href: "/gambling",
  },
  {
    icon: "\u{1F3E0}",
    color: "#FFD700",
    stat: "$523M",
    label: "from property developers",
    finding: "while home ownership hits record lows",
    href: "/housing",
  },
  {
    icon: "\u{1F30F}",
    color: "#00843D",
    stat: "3.4%",
    label: "Liberal support for carbon pricing",
    finding: "despite 24,269 speeches on climate",
    href: "/climate",
  },
];

const DATA_SOURCES = [
  "Hansard",
  "AEC",
  "TheyVoteForYou",
  "OpenAustralia",
  "Senate Estimates",
  "AusTender",
];

const TICKER_STATS = [
  { key: "speeches", fallback: 1012000, label: "speeches" },
  { key: "donations", fallback: 205000, label: "donations" },
  { key: "votes", fallback: 300000, label: "votes" },
  { key: "divisions", fallback: 3634, label: "divisions" },
  { key: "members", fallback: 620, label: "politicians tracked" },
];

const BY_THE_NUMBERS = [
  { value: "1M+", label: "Speeches Analysed", color: "#FFD700" },
  { value: "125", label: "Years of Records", color: "#e6edf3" },
  { value: "$34B+", label: "in Donations Tracked", color: "#DC2626" },
  { value: "5", label: "Parliaments Covered", color: "#00843D" },
];

// --- Hooks ---

function useScrollReveal() {
  const ref = useRef<HTMLElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.unobserve(el);
        }
      },
      { threshold: 0.1, rootMargin: "0px 0px -40px 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { ref, isVisible };
}

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

// --- Components ---

function RevealSection({
  children,
  className = "",
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const { ref, isVisible } = useScrollReveal();
  return (
    <section
      ref={ref as React.RefObject<HTMLElement>}
      className={className}
      style={{
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? "translateY(0)" : "translateY(32px)",
        transition: `opacity 0.7s ease-out ${delay}ms, transform 0.7s ease-out ${delay}ms`,
      }}
    >
      {children}
    </section>
  );
}

function TypewriterPlaceholder() {
  const [questionIndex, setQuestionIndex] = useState(0);
  const [charIndex, setCharIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const currentQuestion = PLACEHOLDER_QUESTIONS[questionIndex];

    if (!isDeleting && charIndex < currentQuestion.length) {
      const timeout = setTimeout(() => setCharIndex((c) => c + 1), 35);
      return () => clearTimeout(timeout);
    }

    if (!isDeleting && charIndex === currentQuestion.length) {
      const timeout = setTimeout(() => setIsDeleting(true), 2200);
      return () => clearTimeout(timeout);
    }

    if (isDeleting && charIndex > 0) {
      const timeout = setTimeout(() => setCharIndex((c) => c - 1), 18);
      return () => clearTimeout(timeout);
    }

    if (isDeleting && charIndex === 0) {
      setIsDeleting(false);
      setQuestionIndex((i) => (i + 1) % PLACEHOLDER_QUESTIONS.length);
    }
  }, [charIndex, isDeleting, questionIndex]);

  const text = PLACEHOLDER_QUESTIONS[questionIndex].slice(0, charIndex);

  return (
    <span className="text-[#8b949e]/40">
      {text}
      <span className="animate-blink ml-px text-[#FFD700]/60">|</span>
    </span>
  );
}

function AnimatedNumber({ value, enabled }: { value: number; enabled: boolean }) {
  const displayed = useCountUp(value, 1800, enabled);
  return <>{displayed.toLocaleString()}</>;
}

function StaggeredAnimatedNumber({
  value,
  enabled,
  delay = 0,
}: {
  value: number;
  enabled: boolean;
  delay?: number;
}) {
  const [started, setStarted] = useState(false);
  const [done, setDone] = useState(false);
  const displayed = useCountUp(value, 1800, started);

  useEffect(() => {
    if (!enabled) return;
    const t = setTimeout(() => setStarted(true), delay);
    return () => clearTimeout(t);
  }, [enabled, delay]);

  useEffect(() => {
    if (started && displayed === value) {
      setDone(true);
    }
  }, [started, displayed, value]);

  return (
    <span
      className="transition-all duration-500"
      style={{
        textShadow: done ? `0 0 20px rgba(255, 215, 0, 0.5), 0 0 40px rgba(255, 215, 0, 0.2)` : "none",
      }}
    >
      {started ? displayed.toLocaleString() : "0"}
    </span>
  );
}

function Sparkline({ data, color = "#FFD700" }: { data: number[]; color?: string }) {
  const width = 100;
  const height = 28;
  const padding = 2;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data
    .map((v, i) => {
      const x = padding + (i / (data.length - 1)) * (width - padding * 2);
      const y = height - padding - ((v - min) / range) * (height - padding * 2);
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="opacity-50 group-hover:opacity-80 transition-opacity">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TickerBar({ stats }: { stats: Record<string, number> }) {
  const { ref, isVisible } = useScrollReveal();

  return (
    <div
      ref={ref as React.RefObject<HTMLDivElement>}
      className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 py-4 px-4 rounded-xl border border-white/5 bg-[#12121a] transition-all duration-700"
      style={{ opacity: isVisible ? 1 : 0, transform: isVisible ? "translateY(0)" : "translateY(8px)" }}
    >
      {TICKER_STATS.map((s, i) => {
        const value = stats[s.key] ?? s.fallback;
        return (
          <span key={s.key} className="flex items-center gap-1.5 text-sm">
            {i > 0 && <span className="text-white/10 mr-1.5 hidden sm:inline">|</span>}
            <span className="font-mono font-bold text-[#FFD700]">
              <StaggeredAnimatedNumber value={value} enabled={isVisible} delay={i * 200} />
            </span>
            <span className="text-[#8b949e]">{s.label}</span>
          </span>
        );
      })}
    </div>
  );
}

function ByTheNumbers() {
  const { ref, isVisible } = useScrollReveal();

  return (
    <div ref={ref as React.RefObject<HTMLDivElement>} className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {BY_THE_NUMBERS.map((item, i) => (
        <div
          key={item.label}
          className="relative rounded-xl border border-white/5 bg-[#12121a] p-6 text-center overflow-hidden group hover:border-white/10 transition-all duration-500"
          style={{
            opacity: isVisible ? 1 : 0,
            transform: isVisible ? "translateY(0)" : "translateY(24px)",
            transition: `opacity 0.6s ease-out ${i * 120}ms, transform 0.6s ease-out ${i * 120}ms`,
          }}
        >
          {/* Subtle radial glow behind number */}
          <div
            className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
            style={{
              background: `radial-gradient(circle at 50% 40%, ${item.color}08 0%, transparent 70%)`,
            }}
          />
          <p
            className="text-4xl md:text-5xl font-bold font-mono mb-2 relative"
            style={{ color: item.color }}
          >
            {item.value}
          </p>
          <p className="text-sm text-[#8b949e] relative">{item.label}</p>
        </div>
      ))}
    </div>
  );
}

// --- Page ---

export default function Home() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [inputFocused, setInputFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [liveStats, setLiveStats] = useState<Record<string, number>>({});
  const [statsLoaded, setStatsLoaded] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/api/stats`)
      .then((r) => r.json())
      .then((data) => {
        setLiveStats(data);
      })
      .catch(() => {})
      .finally(() => setStatsLoaded(true));
  }, []);

  const handleSearch = useCallback(() => {
    if (query.trim()) {
      router.push(`/search?q=${encodeURIComponent(query.trim())}&mode=ask`);
    }
  }, [query, router]);

  const totalSpeeches = liveStats.total_speeches ?? liveStats.speeches ?? 431510;
  const rawRange = liveStats.date_range;
  const dateRange = Array.isArray(rawRange)
    ? `${rawRange[0]?.slice(0, 4)}\u2013${rawRange[1]?.slice(0, 4)}`
    : typeof rawRange === "string"
      ? rawRange
      : "1901\u20132026";

  return (
    <div className="mx-auto max-w-6xl px-6 relative">
      {/* Hero */}
      <section className="pt-20 pb-10 animate-fade-in-up relative">
        {/* Animated gradient mesh background */}
        <div className="absolute -top-20 -left-40 w-[800px] h-[600px] pointer-events-none animate-gradient-mesh opacity-30">
          <div className="absolute inset-0 rounded-full blur-[120px] animate-gradient-shift-1"
            style={{ background: "radial-gradient(ellipse at 30% 40%, rgba(255, 215, 0, 0.15), transparent 70%)" }}
          />
          <div className="absolute inset-0 rounded-full blur-[120px] animate-gradient-shift-2"
            style={{ background: "radial-gradient(ellipse at 70% 60%, rgba(220, 38, 38, 0.08), transparent 70%)" }}
          />
          <div className="absolute inset-0 rounded-full blur-[120px] animate-gradient-shift-3"
            style={{ background: "radial-gradient(ellipse at 50% 30%, rgba(0, 132, 61, 0.06), transparent 70%)" }}
          />
        </div>

        <h1 className="text-7xl md:text-8xl lg:text-9xl font-black tracking-tighter leading-none mb-6 relative">
          <span
            className="bg-clip-text text-transparent bg-gradient-to-r from-[#FFD700] via-[#FFA500] to-[#FFD700] animate-gradient-text bg-[length:200%_auto]"
          >
            OPAX
          </span>
        </h1>
        <p className="text-xl md:text-2xl text-[#8b949e] max-w-2xl leading-relaxed mb-4 relative">
          Tracking what Parliament says vs how it votes.
        </p>
        <p className="text-base text-[#8b949e]/70 max-w-xl leading-relaxed mb-8 relative">
          The Open Parliamentary Accountability eXchange maps the gap between
          political rhetoric and legislative action across 1M+ speeches from
          federal and state parliaments.
        </p>

        {/* Search Input */}
        <div className="relative max-w-2xl">
          <div className="relative">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="w-full bg-[#12121a] border border-white/10 rounded-xl px-5 py-4 pr-24 text-[#e6edf3] text-base placeholder-transparent focus:outline-none focus:border-[#FFD700]/40 focus:ring-1 focus:ring-[#FFD700]/20 transition-all"
              placeholder="Search speeches, MPs, topics..."
            />
            {!query && !inputFocused && (
              <div
                className="absolute inset-0 flex items-center px-5 pointer-events-none"
                onClick={() => inputRef.current?.focus()}
              >
                <TypewriterPlaceholder />
              </div>
            )}
            {!query && inputFocused && (
              <div className="absolute inset-0 flex items-center px-5 pointer-events-none">
                <span className="text-[#8b949e]/30">Search speeches, MPs, topics...</span>
              </div>
            )}
            <button
              onClick={handleSearch}
              className="absolute right-2 top-1/2 -translate-y-1/2 px-4 py-2 rounded-lg text-sm font-medium transition-all hover:scale-105 active:scale-95"
              style={{ backgroundColor: "#FFD700", color: "#0a0a0f" }}
            >
              Search
            </button>
          </div>
          <p className="text-xs text-[#8b949e]/50 mt-2">
            Search {totalSpeeches.toLocaleString()} parliamentary speeches from {dateRange}
          </p>
        </div>

        {/* Suggested Questions */}
        <div className="flex flex-wrap gap-2 mt-5 max-w-2xl">
          {SUGGESTED_QUESTIONS.map((sq) => (
            <Link
              key={sq.q}
              href={`/search?q=${encodeURIComponent(sq.q)}`}
              className="text-xs px-3 py-1.5 rounded-full border border-white/8 bg-white/[0.03] text-[#8b949e] hover:text-[#FFD700] hover:border-[#FFD700]/30 hover:bg-[#FFD700]/[0.05] transition-all"
            >
              {sq.label}
            </Link>
          ))}
        </div>
      </section>

      {/* Look Up Your MP CTA */}
      <RevealSection className="pb-10">
        <Link
          href="/your-mp"
          className="group relative flex items-center gap-4 sm:gap-6 rounded-xl border border-[#FFD700]/20 bg-[#FFD700]/[0.03] p-5 sm:p-6 transition-all hover:border-[#FFD700]/40 hover:bg-[#FFD700]/[0.06]"
        >
          <div className="shrink-0 p-3 rounded-xl bg-[#FFD700]/10 group-hover:bg-[#FFD700]/15 transition-colors">
            <svg className="w-7 h-7 text-[#FFD700]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 0115 0z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base sm:text-lg font-bold text-[#e6edf3] mb-0.5 group-hover:text-white transition-colors">
              Look up your MP
            </h3>
            <p className="text-sm text-[#8b949e] leading-relaxed">
              Enter your postcode to see how your representative votes, who funds them, and whether they represent your community.
            </p>
          </div>
          <span className="shrink-0 hidden sm:flex items-center gap-1 text-sm font-medium text-[#FFD700] group-hover:translate-x-1 transition-transform">
            Go <span aria-hidden="true">&rarr;</span>
          </span>
        </Link>
      </RevealSection>

      {/* Live Data Ticker */}
      <RevealSection className="pb-10">
        {!statsLoaded ? (
          <SkeletonStatRow count={5} />
        ) : (
          <div className="animate-fade-in-up">
            <TickerBar stats={liveStats} />
          </div>
        )}
      </RevealSection>

      {/* Hot Topics Grid */}
      <RevealSection className="pb-12">
        <h2 className="text-xs uppercase tracking-[0.2em] text-[#FFD700] mb-6 font-medium">
          Hot Topics
        </h2>
        {!statsLoaded ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonTopicCard key={i} />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {hotTopics.map((topic, i) => (
              <Link
                key={topic.name}
                href={topic.href}
                className="group relative rounded-xl border border-white/5 bg-[#12121a] p-5 transition-all duration-300 hover:bg-[#16161f] hover:border-transparent animate-fade-in-up"
                style={{
                  animationDelay: `${i * 80}ms`,
                }}
              >
                {/* Gold gradient border on hover */}
                <div className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
                  style={{
                    background: "linear-gradient(135deg, #FFD700, #FFA500, #FFD700)",
                    padding: "1px",
                    mask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
                    maskComposite: "exclude",
                    WebkitMask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
                    WebkitMaskComposite: "xor",
                    borderRadius: "0.75rem",
                  }}
                />
                <div className="flex items-start justify-between mb-3">
                  <span className="text-2xl">{topic.emoji}</span>
                  <span
                    className={`text-[10px] font-bold tracking-wider px-2 py-0.5 rounded-full ${topic.disconnect === "HIGH" ? "animate-pulse-disconnect" : ""}`}
                    style={{
                      color: disconnectColors[topic.disconnect],
                      backgroundColor: disconnectBg[topic.disconnect],
                    }}
                  >
                    {topic.disconnect}
                  </span>
                </div>
                <h3 className="text-lg font-semibold text-[#e6edf3] mb-1 group-hover:text-white transition-colors">
                  {topic.name}
                </h3>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs text-[#8b949e]">
                    {topic.speeches.toLocaleString()} speeches
                  </p>
                  <Sparkline
                    data={topic.sparkline}
                    color={disconnectColors[topic.disconnect]}
                  />
                </div>
                <p className="text-sm text-[#8b949e]/80 leading-relaxed">
                  {topic.description}
                </p>
              </Link>
            ))}
          </div>
        )}
      </RevealSection>

      {/* By the Numbers */}
      <RevealSection className="pb-12">
        <h2 className="text-xs uppercase tracking-[0.2em] text-[#FFD700] mb-6 font-medium">
          By the Numbers
        </h2>
        <ByTheNumbers />
      </RevealSection>

      {/* Featured Investigation */}
      <RevealSection className="pb-12">
        <div className="relative rounded-xl overflow-hidden animate-urgent-border">
          {/* Pulsing border glow */}
          <div className="absolute inset-0 rounded-xl animate-investigation-pulse pointer-events-none" />
          <div className="relative rounded-xl border border-[#FFD700]/20 bg-[#FFD700]/[0.03] p-6 md:p-8 backdrop-blur-sm">
            <p className="text-xs uppercase tracking-[0.2em] text-[#FFD700] mb-3 font-medium flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-[#DC2626] animate-pulse" />
              Featured Investigation
            </p>
            <h2 className="text-2xl md:text-3xl font-bold text-[#e6edf3] mb-3 leading-tight">
              Gambling Reform:{" "}
              <span className="italic" style={{ color: "#FFD700" }}>
                Follow the Money
              </span>
            </h2>
            <p className="text-[#8b949e] leading-relaxed max-w-2xl mb-6">
              For two decades, Australian MPs have spoken passionately about
              protecting problem gamblers. The voting record tells a different
              story. The donations data explains why. Our first deep dive
              traces $65M in gambling industry donations against 1,512
              parliamentary speeches and 16 key divisions.
            </p>
            <Link
              href="/gambling"
              className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium transition-all hover:scale-105 active:scale-95 hover:shadow-[0_0_24px_rgba(255,215,0,0.3)]"
              style={{
                backgroundColor: "#FFD700",
                color: "#0a0a0f",
              }}
            >
              Read the investigation
              <span aria-hidden="true">&rarr;</span>
            </Link>
          </div>
        </div>
      </RevealSection>

      {/* Latest Findings */}
      <RevealSection className="pb-12">
        <h2 className="text-xs uppercase tracking-[0.2em] text-[#FFD700] mb-6 font-medium">
          Latest Findings
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {FINDINGS.map((f) => (
            <Link
              key={f.stat}
              href={f.href}
              className="group rounded-xl border border-white/5 bg-[#12121a] p-6 hover:border-white/10 hover:bg-[#16161f] transition-all"
            >
              <span className="text-3xl mb-4 block">{f.icon}</span>
              <p className="text-3xl font-bold font-mono mb-1" style={{ color: f.color }}>
                {f.stat}
              </p>
              <p className="text-sm text-[#8b949e] mb-3">{f.label}</p>
              <p className="text-sm text-[#e6edf3]/90 leading-relaxed">
                {f.finding}
              </p>
              <span className="inline-block mt-3 text-xs text-[#FFD700] opacity-0 group-hover:opacity-100 transition-opacity">
                Read investigation &rarr;
              </span>
            </Link>
          ))}
        </div>
      </RevealSection>

      {/* Data Sources Badge Bar */}
      <RevealSection className="pb-16">
        <div className="flex flex-col items-center gap-4">
          <p className="text-xs uppercase tracking-[0.2em] text-[#8b949e]/60 font-medium">
            Powered by
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            {DATA_SOURCES.map((source) => (
              <span
                key={source}
                className="text-xs px-3 py-1.5 rounded-full border border-white/8 bg-white/[0.03] text-[#8b949e]/80 font-medium"
              >
                {source}
              </span>
            ))}
          </div>
        </div>
      </RevealSection>

      {/* Footer */}
      <footer className="border-t border-white/5 py-12 mb-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Investigations */}
          <div>
            <h3 className="text-xs uppercase tracking-[0.2em] text-[#FFD700] mb-4 font-medium">
              Investigations
            </h3>
            <ul className="space-y-2">
              {[
                { label: "Gambling Reform", href: "/gambling" },
                { label: "Housing Affordability", href: "/housing" },
                { label: "Climate Action", href: "/climate" },
                { label: "Media Ownership", href: "/media" },
                { label: "Indigenous Affairs", href: "/indigenous" },
                { label: "Pay-to-Play", href: "/pay-to-play" },
                { label: "The Disconnect", href: "/disconnect" },
                { label: "Donor Influence", href: "/donor-influence" },
              ].map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-[#8b949e] hover:text-[#e6edf3] transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Data & Tools */}
          <div>
            <h3 className="text-xs uppercase tracking-[0.2em] text-[#FFD700] mb-4 font-medium">
              Data & Tools
            </h3>
            <ul className="space-y-2">
              {[
                { label: "Search Speeches", href: "/search" },
                { label: "Politician Profiles", href: "/politicians" },
                { label: "Donations Explorer", href: "/donations" },
                { label: "Electorate Map", href: "/electorates" },
                { label: "Network Analysis", href: "/network" },
              ].map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-[#8b949e] hover:text-[#e6edf3] transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Data Sources */}
          <div>
            <h3 className="text-xs uppercase tracking-[0.2em] text-[#FFD700] mb-4 font-medium">
              Data Sources
            </h3>
            <ul className="space-y-2">
              {[
                "Australian Hansard",
                "Australian Electoral Commission",
                "TheyVoteForYou.org.au",
                "OpenAustralia.org.au",
                "Senate Estimates",
                "AusTender",
              ].map((source) => (
                <li key={source}>
                  <span className="text-sm text-[#8b949e]">{source}</span>
                </li>
              ))}
            </ul>
            <Link
              href="/sources"
              className="inline-block mt-4 text-xs text-[#FFD700] hover:text-[#FFD700]/80 transition-colors"
            >
              View all sources &rarr;
            </Link>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-[#8b949e]/50">
            Built with Claude + Next.js + Python
          </p>
          <p className="text-xs text-[#8b949e]/50">
            &copy; {new Date().getFullYear()} OPAX &mdash; Open Parliamentary Accountability eXchange
          </p>
        </div>
      </footer>
    </div>
  );
}

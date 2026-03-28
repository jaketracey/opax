"use client";

import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
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
  MapPin,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Share2,
  ChevronRight,
  Search,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Building2,
  MessageSquareQuote,
  Shield,
  Award,
  BarChart3,
  ExternalLink,
  Clock,
  Users,
  Flag,
} from "lucide-react";

import { API_BASE, getPhotoUrl } from "@/lib/utils";

// --- Types ---

interface MPData {
  person_id: string;
  name: string;
  party: string;
  electorate: string;
  chamber: string;
  photo_id: string;
  margin?: number;
  years_active?: number;
  speech_count?: number;
  attendance_rate?: number;
  top_topics?: string[];
  disconnects?: DisconnectItem[];
  donor_industries?: DonorIndustry[];
  pay_to_play?: PayToPlayChain[];
  representation?: RepresentationItem[];
  conflicts?: ConflictItem[];
  grants?: GrantData;
  key_quote?: QuoteData;
}

interface DisconnectItem {
  topic: string;
  score: number;
  speech_count: number;
  vote_alignment: number;
}

interface DonorIndustry {
  industry: string;
  amount: number;
  votes_favorable: boolean;
}

interface PayToPlayChain {
  company: string;
  donation_amount: number;
  mentioned_in_speech: boolean;
  contract_amount?: number;
  date: string;
}

interface RepresentationItem {
  label: string;
  electorate_stat: string;
  electorate_detail: string;
  vote_position: string;
  matches: boolean;
}

interface ConflictItem {
  type: string;
  detail: string;
  related_votes: string;
}

interface GrantData {
  total: number;
  average: number;
  is_marginal: boolean;
  pork_barrel_indicator: boolean;
}

interface QuoteData {
  text: string;
  date: string;
  topic: string;
}

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

function SectionHeader({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: React.ElementType;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <div className="p-2 rounded-lg bg-[#FFD700]/10">
        <Icon className="w-5 h-5 text-[#FFD700]" />
      </div>
      <div>
        <h2 className="text-lg font-bold text-[#e6edf3]">{title}</h2>
        {subtitle && (
          <p className="text-xs text-[#8b949e]">{subtitle}</p>
        )}
      </div>
    </div>
  );
}

function MarginBadge({ margin }: { margin?: number }) {
  if (margin === undefined || margin === null) return null;
  const isMarginal = margin < 6;
  const color = isMarginal ? "#DC2626" : "#00843D";
  const bg = isMarginal ? "rgba(220,38,38,0.1)" : "rgba(0,132,61,0.1)";
  const label = isMarginal ? "Marginal" : "Safe";

  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full"
      style={{ color, backgroundColor: bg }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{ backgroundColor: color }}
      />
      {label} ({margin.toFixed(1)}%)
    </span>
  );
}

function formatCurrency(amount: number): string {
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(0)}K`;
  return `$${amount.toLocaleString()}`;
}

// --- Skeleton Loaders ---

function MPHeroSkeleton() {
  return (
    <div className="rounded-xl border border-white/5 bg-[#12121a] p-6 md:p-8">
      <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
        <SkeletonAvatar size={96} />
        <div className="flex-1 text-center sm:text-left space-y-3 w-full">
          <Skeleton className="h-8 w-48 mx-auto sm:mx-0" />
          <div className="flex items-center justify-center sm:justify-start gap-2">
            <Skeleton className="h-5 w-20 rounded-md" />
            <Skeleton className="h-5 w-32" />
          </div>
          <div className="flex items-center justify-center sm:justify-start gap-3">
            <Skeleton className="h-5 w-24 rounded-full" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
        </div>
      </div>
    </div>
  );
}

function DisconnectSkeleton() {
  return (
    <div className="rounded-xl border border-white/5 bg-[#12121a] p-6 space-y-5">
      <div className="flex items-center gap-3">
        <Skeleton className="h-9 w-9 rounded-lg" />
        <Skeleton className="h-5 w-48" />
      </div>
      {[1, 2, 3].map((i) => (
        <div key={i} className="space-y-2">
          <div className="flex justify-between">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-16" />
          </div>
          <Skeleton className="h-3 w-full rounded-full" />
          <div className="flex gap-4">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
      ))}
    </div>
  );
}

function DonorsSkeleton() {
  return (
    <div className="rounded-xl border border-white/5 bg-[#12121a] p-6">
      <div className="flex items-center gap-3 mb-5">
        <Skeleton className="h-9 w-9 rounded-lg" />
        <Skeleton className="h-5 w-44" />
      </div>
      <SkeletonChart height={280} />
    </div>
  );
}

function StatsSkeleton() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {[1, 2, 3, 4].map((i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

// --- Custom tooltip for donor chart ---

function DonorTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const data = payload[0].payload;
  return (
    <div className="rounded-lg border border-white/10 bg-[#12121a] px-4 py-3 shadow-xl">
      <p className="text-sm font-semibold text-[#e6edf3]">{data.industry}</p>
      <p className="text-sm text-[#FFD700] font-mono">{formatCurrency(data.amount)}</p>
      <p className="text-xs text-[#8b949e] mt-1 flex items-center gap-1">
        {data.votes_favorable ? (
          <><CheckCircle2 className="w-3 h-3 text-[#00843D]" /> Votes align with donor interests</>
        ) : (
          <><XCircle className="w-3 h-3 text-[#DC2626]" /> Votes oppose donor interests</>
        )}
      </p>
    </div>
  );
}

// --- Main Page ---

export default function YourMPPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-4xl px-4 sm:px-6 pt-12 text-[#8b949e]">
          Loading...
        </div>
      }
    >
      <YourMPPageInner />
    </Suspense>
  );
}

function YourMPPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [postcode, setPostcode] = useState(searchParams.get("postcode") || "");
  const [submittedPostcode, setSubmittedPostcode] = useState(
    searchParams.get("postcode") || ""
  );
  const [mpData, setMpData] = useState<MPData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shared, setShared] = useState(false);

  const isValidPostcode = (pc: string) => /^\d{4}$/.test(pc.trim());

  const fetchMP = useCallback(
    async (pc: string) => {
      if (!isValidPostcode(pc)) {
        setError("Please enter a valid 4-digit Australian postcode.");
        return;
      }

      setLoading(true);
      setError(null);
      setMpData(null);
      setSubmittedPostcode(pc.trim());

      // Update URL without full navigation
      const url = new URL(window.location.href);
      url.searchParams.set("postcode", pc.trim());
      window.history.replaceState({}, "", url.toString());

      try {
        const res = await fetch(`${API_BASE}/api/your-mp/${pc.trim()}`);
        if (!res.ok) {
          if (res.status === 404) {
            setError(
              "No MP found for this postcode. Please check and try again."
            );
          } else {
            setError("Something went wrong. Please try again shortly.");
          }
          return;
        }
        const data = await res.json();
        setMpData(data);
      } catch {
        setError(
          "Could not connect to the server. Make sure the backend is running."
        );
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // Auto-fetch if postcode in URL
  useEffect(() => {
    const pc = searchParams.get("postcode");
    if (pc && isValidPostcode(pc)) {
      setPostcode(pc);
      fetchMP(pc);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchMP(postcode);
  };

  const handleShare = async () => {
    const url = `${window.location.origin}/your-mp?postcode=${submittedPostcode}`;
    try {
      if (navigator.share) {
        await navigator.share({
          title: `${mpData?.name} - OPAX Accountability Report`,
          text: `See how ${mpData?.name} (${mpData?.party}) represents ${mpData?.electorate} on OPAX`,
          url,
        });
      } else {
        await navigator.clipboard.writeText(url);
        setShared(true);
        setTimeout(() => setShared(false), 2000);
      }
    } catch {
      // User cancelled share
    }
  };

  const showResults = mpData && !loading;

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 pb-16 relative">
      {/* Hero / Postcode Input */}
      <section className="pt-12 sm:pt-20 pb-8 sm:pb-12 animate-fade-in-up text-center">
        {/* Background glow */}
        <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-[600px] h-[400px] pointer-events-none opacity-20">
          <div
            className="absolute inset-0 rounded-full blur-[120px] animate-gradient-shift-1"
            style={{
              background:
                "radial-gradient(ellipse at 50% 50%, rgba(255, 215, 0, 0.2), transparent 70%)",
            }}
          />
        </div>

        <div className="relative">
          <div className="inline-flex items-center gap-2 mb-4 px-3 py-1.5 rounded-full border border-[#FFD700]/20 bg-[#FFD700]/5 text-xs text-[#FFD700] font-medium">
            <MapPin className="w-3.5 h-3.5" />
            Personalised accountability
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl font-black tracking-tight text-[#e6edf3] mb-3 leading-[1.1]">
            Who represents{" "}
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-[#FFD700] via-[#FFA500] to-[#FFD700] animate-gradient-text bg-[length:200%_auto]">
              you
            </span>
            ?
          </h1>

          <p className="text-base sm:text-lg text-[#8b949e] max-w-lg mx-auto mb-8 leading-relaxed">
            Enter your postcode to see how your MP votes, who funds them, and
            whether they represent your community.
          </p>

          <form
            onSubmit={handleSubmit}
            className="relative max-w-md mx-auto"
          >
            <div className="relative flex items-center">
              {/* Australian flag accent - gold left border */}
              <div className="absolute left-0 top-2 bottom-2 w-1 rounded-full bg-gradient-to-b from-[#FFD700] to-[#00843D]" />

              <input
                ref={inputRef}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={4}
                value={postcode}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, "").slice(0, 4);
                  setPostcode(val);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    fetchMP(postcode);
                  }
                }}
                placeholder="Enter your postcode"
                className="w-full bg-[#12121a] border border-white/10 rounded-xl pl-5 pr-36 py-4 text-[#e6edf3] text-lg font-mono tracking-widest text-center placeholder:text-[#8b949e]/30 placeholder:font-sans placeholder:tracking-normal placeholder:text-base focus:outline-none focus:border-[#FFD700]/40 focus:ring-1 focus:ring-[#FFD700]/20 transition-all"
                aria-label="Australian postcode"
              />

              <button
                type="submit"
                disabled={loading || postcode.length !== 4}
                className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all hover:scale-105 active:scale-95 disabled:opacity-40 disabled:hover:scale-100"
                style={{
                  backgroundColor:
                    postcode.length === 4 ? "#FFD700" : "#FFD700",
                  color: "#0a0a0f",
                }}
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-[#0a0a0f]/30 border-t-[#0a0a0f] rounded-full animate-spin" />
                    Looking up...
                  </span>
                ) : (
                  <>
                    <Search className="w-4 h-4" />
                    Look up your MP
                  </>
                )}
              </button>
            </div>

            <p className="text-xs text-[#8b949e]/50 mt-2">
              e.g. 2000 for Sydney, 3000 for Melbourne, 4000 for Brisbane
            </p>
          </form>
        </div>
      </section>

      {/* Error State */}
      {error && !loading && (
        <div className="mb-8 rounded-xl border border-[#DC2626]/20 bg-[#DC2626]/5 p-5 animate-fade-in-up">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-[#DC2626] mt-0.5 shrink-0" />
            <div>
              <p className="text-sm text-[#e6edf3] font-medium">{error}</p>
              <p className="text-xs text-[#8b949e] mt-1">
                Australian postcodes are 4 digits (e.g. 2000, 3000, 4000).
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Loading Skeletons */}
      {loading && (
        <div className="space-y-6 animate-fade-in-up">
          <MPHeroSkeleton />
          <DisconnectSkeleton />
          <DonorsSkeleton />
          <StatsSkeleton />
        </div>
      )}

      {/* Results */}
      {showResults && (
        <div className="space-y-6">
          {/* MP Hero Card */}
          <RevealSection delay={0}>
            <div className="rounded-xl border border-white/5 bg-[#12121a] p-6 md:p-8 relative overflow-hidden">
              {/* Subtle party-colored top border */}
              <div
                className="absolute top-0 left-0 right-0 h-1"
                style={{
                  background:
                    mpData.party === "Labor"
                      ? "linear-gradient(to right, #DC2626, #b91c1c)"
                      : mpData.party === "Liberal"
                        ? "linear-gradient(to right, #2563eb, #1d4ed8)"
                        : mpData.party === "Greens"
                          ? "linear-gradient(to right, #00843D, #166534)"
                          : "linear-gradient(to right, #FFD700, #b89b00)",
                }}
              />

              <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5">
                {/* Photo */}
                <div className="relative shrink-0">
                  <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-white/10 shadow-lg">
                    {mpData.photo_id ? (
                      <img
                        src={getPhotoUrl(mpData.photo_id)}
                        alt={mpData.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-[#1a1a28] flex items-center justify-center">
                        <Users className="w-10 h-10 text-[#8b949e]/30" />
                      </div>
                    )}
                  </div>
                  <div className="absolute -bottom-1 -right-1 p-1.5 rounded-full bg-[#12121a] border border-white/10">
                    <Flag className="w-3.5 h-3.5 text-[#FFD700]" />
                  </div>
                </div>

                {/* Info */}
                <div className="flex-1 text-center sm:text-left min-w-0">
                  <h2 className="text-2xl sm:text-3xl font-bold text-[#e6edf3] mb-2">
                    {mpData.name}
                  </h2>
                  <div className="flex items-center justify-center sm:justify-start gap-2 flex-wrap mb-3">
                    <PartyBadge party={mpData.party} />
                    <span className="text-sm text-[#8b949e]">
                      {mpData.electorate}
                    </span>
                    <span className="text-[#8b949e]/30">|</span>
                    <span className="text-xs text-[#8b949e]/80 uppercase tracking-wider">
                      {mpData.chamber}
                    </span>
                  </div>
                  <div className="flex items-center justify-center sm:justify-start gap-3 flex-wrap">
                    <MarginBadge margin={mpData.margin} />
                    <Link
                      href={`/compare?a=${mpData.person_id}`}
                      className="inline-flex items-center gap-1 text-xs text-[#FFD700] hover:text-[#FFD700]/80 transition-colors"
                    >
                      Compare
                      <ChevronRight className="w-3 h-3" />
                    </Link>
                    <Link
                      href={`/politicians/${mpData.person_id}`}
                      className="inline-flex items-center gap-1 text-xs text-[#8b949e] hover:text-[#e6edf3] transition-colors"
                    >
                      Full profile
                      <ExternalLink className="w-3 h-3" />
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </RevealSection>

          {/* The Disconnect */}
          {mpData.disconnects && mpData.disconnects.length > 0 && (
            <RevealSection delay={100}>
              <div className="rounded-xl border border-white/5 bg-[#12121a] p-6">
                <SectionHeader
                  icon={TrendingDown}
                  title="The Disconnect"
                  subtitle="Where speeches and votes diverge"
                />
                <div className="space-y-5">
                  {mpData.disconnects.slice(0, 3).map((d, i) => {
                    const isHigh = d.score > 0.6;
                    return (
                      <div
                        key={d.topic}
                        className={`rounded-lg p-4 transition-all ${
                          isHigh
                            ? "border border-[#FFD700]/30 bg-[#FFD700]/[0.03]"
                            : "border border-white/5 bg-white/[0.02]"
                        }`}
                        style={{
                          animationDelay: `${i * 100}ms`,
                        }}
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-2">
                            {isHigh && (
                              <AlertTriangle className="w-4 h-4 text-[#FFD700]" />
                            )}
                            <h3 className="text-sm font-semibold text-[#e6edf3]">
                              {d.topic}
                            </h3>
                          </div>
                          <span
                            className="text-xs font-mono font-bold"
                            style={{
                              color:
                                d.score > 0.6
                                  ? "#DC2626"
                                  : d.score > 0.3
                                    ? "#FFD700"
                                    : "#00843D",
                            }}
                          >
                            {(d.score * 100).toFixed(0)}%
                          </span>
                        </div>
                        <DisconnectMeter
                          score={d.score * 100}
                          size="sm"
                        />
                        <div className="flex items-center gap-4 mt-3 text-xs text-[#8b949e]">
                          <span className="flex items-center gap-1">
                            <MessageSquareQuote className="w-3 h-3" />
                            {d.speech_count} speeches
                          </span>
                          <span className="flex items-center gap-1">
                            <BarChart3 className="w-3 h-3" />
                            {(d.vote_alignment * 100).toFixed(0)}% vote
                            alignment
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </RevealSection>
          )}

          {/* Who Funds Your MP */}
          {mpData.donor_industries && mpData.donor_industries.length > 0 && (
            <RevealSection delay={200}>
              <div className="rounded-xl border border-white/5 bg-[#12121a] p-6">
                <SectionHeader
                  icon={DollarSign}
                  title="Who Funds Your MP"
                  subtitle={`Top industry donors to ${mpData.party}`}
                />
                <div className="h-[280px] -mx-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={mpData.donor_industries}
                      layout="vertical"
                      margin={{ top: 0, right: 20, bottom: 0, left: 0 }}
                    >
                      <XAxis
                        type="number"
                        tickFormatter={(v: number) => formatCurrency(v)}
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: "#8b949e", fontSize: 11 }}
                      />
                      <YAxis
                        type="category"
                        dataKey="industry"
                        width={120}
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: "#8b949e", fontSize: 11 }}
                      />
                      <Tooltip
                        content={<DonorTooltip />}
                        cursor={{ fill: "rgba(255,255,255,0.03)" }}
                      />
                      <Bar dataKey="amount" radius={[0, 4, 4, 0]} maxBarSize={28}>
                        {mpData.donor_industries.map((d, i) => (
                          <Cell
                            key={i}
                            fill={d.votes_favorable ? "#DC2626" : "#FFD700"}
                            fillOpacity={0.8}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex items-center gap-4 mt-3 text-xs text-[#8b949e]">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm bg-[#DC2626]/80" />
                    Votes align with donor interests
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm bg-[#FFD700]/80" />
                    Votes oppose donor interests
                  </span>
                </div>
              </div>
            </RevealSection>
          )}

          {/* Follow the Money */}
          {mpData.pay_to_play && mpData.pay_to_play.length > 0 && (
            <RevealSection delay={300}>
              <div className="rounded-xl border border-[#DC2626]/20 bg-[#DC2626]/[0.03] p-6">
                <SectionHeader
                  icon={TrendingUp}
                  title="Follow the Money"
                  subtitle="Pay-to-play connections"
                />
                <div className="space-y-4">
                  {mpData.pay_to_play.map((chain, i) => (
                    <div
                      key={i}
                      className="rounded-lg border border-white/5 bg-[#0a0a0f]/50 p-4"
                    >
                      <p className="text-xs text-[#8b949e] mb-3 font-mono">
                        {chain.date}
                      </p>
                      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3 text-sm">
                        <span className="px-2.5 py-1 rounded-md bg-[#DC2626]/10 text-[#DC2626] font-medium">
                          {chain.company} donated{" "}
                          {formatCurrency(chain.donation_amount)}
                        </span>
                        <ChevronRight className="w-4 h-4 text-[#8b949e] hidden sm:block" />
                        {chain.mentioned_in_speech && (
                          <>
                            <span className="px-2.5 py-1 rounded-md bg-[#FFD700]/10 text-[#FFD700] font-medium">
                              MP mentioned company
                            </span>
                            <ChevronRight className="w-4 h-4 text-[#8b949e] hidden sm:block" />
                          </>
                        )}
                        {chain.contract_amount && (
                          <span className="px-2.5 py-1 rounded-md bg-[#DC2626]/10 text-[#DC2626] font-medium">
                            Won {formatCurrency(chain.contract_amount)}{" "}
                            contract
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </RevealSection>
          )}

          {/* Does Your MP Represent You? */}
          {mpData.representation && mpData.representation.length > 0 && (
            <RevealSection delay={400}>
              <div className="rounded-xl border border-white/5 bg-[#12121a] p-6">
                <SectionHeader
                  icon={Users}
                  title="Does Your MP Represent You?"
                  subtitle={`How ${mpData.electorate} compares to their votes`}
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {mpData.representation.map((item, i) => (
                    <div
                      key={i}
                      className={`rounded-lg border p-4 ${
                        item.matches
                          ? "border-[#00843D]/20 bg-[#00843D]/[0.03]"
                          : "border-[#DC2626]/20 bg-[#DC2626]/[0.03]"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-xs font-semibold text-[#8b949e] uppercase tracking-wider">
                          {item.label}
                        </h4>
                        {item.matches ? (
                          <CheckCircle2 className="w-4 h-4 text-[#00843D]" />
                        ) : (
                          <XCircle className="w-4 h-4 text-[#DC2626]" />
                        )}
                      </div>
                      <p className="text-lg font-bold text-[#e6edf3] font-mono mb-1">
                        {item.electorate_stat}
                      </p>
                      <p className="text-xs text-[#8b949e] mb-3">
                        {item.electorate_detail}
                      </p>
                      <div
                        className="text-xs font-medium px-2 py-1 rounded inline-block"
                        style={{
                          color: item.matches ? "#00843D" : "#DC2626",
                          backgroundColor: item.matches
                            ? "rgba(0,132,61,0.1)"
                            : "rgba(220,38,38,0.1)",
                        }}
                      >
                        {item.vote_position}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </RevealSection>
          )}

          {/* Conflicts of Interest */}
          {mpData.conflicts && mpData.conflicts.length > 0 && (
            <RevealSection delay={450}>
              <div className="rounded-xl border border-[#DC2626]/20 bg-[#DC2626]/[0.03] p-6">
                <SectionHeader
                  icon={Shield}
                  title="Conflicts of Interest"
                  subtitle="Declared interests that overlap with votes"
                />
                <div className="space-y-3">
                  {mpData.conflicts.map((c, i) => (
                    <div
                      key={i}
                      className="rounded-lg border border-[#DC2626]/20 bg-[#0a0a0f]/50 p-4"
                    >
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="w-4 h-4 text-[#DC2626] mt-0.5 shrink-0" />
                        <div>
                          <p className="text-xs font-semibold text-[#DC2626] uppercase tracking-wider mb-1">
                            {c.type}
                          </p>
                          <p className="text-sm text-[#e6edf3]">{c.detail}</p>
                          <p className="text-xs text-[#8b949e] mt-1">
                            Related votes: {c.related_votes}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </RevealSection>
          )}

          {/* Grant Spending */}
          {mpData.grants && (
            <RevealSection delay={500}>
              <div
                className={`rounded-xl border p-6 ${
                  mpData.grants.pork_barrel_indicator
                    ? "border-[#FFD700]/30 bg-[#FFD700]/[0.03]"
                    : "border-white/5 bg-[#12121a]"
                }`}
              >
                <SectionHeader
                  icon={Building2}
                  title="Grant Spending"
                  subtitle={`Federal grants to ${mpData.electorate}`}
                />
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <div>
                    <p className="text-xs text-[#8b949e] mb-1">
                      Total grants
                    </p>
                    <p className="text-2xl font-bold font-mono text-[#FFD700]">
                      {formatCurrency(mpData.grants.total)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-[#8b949e] mb-1">
                      National average
                    </p>
                    <p className="text-2xl font-bold font-mono text-[#8b949e]">
                      {formatCurrency(mpData.grants.average)}
                    </p>
                  </div>
                  {mpData.grants.pork_barrel_indicator && (
                    <div className="col-span-2 sm:col-span-1 flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5 text-[#FFD700]" />
                      <div>
                        <p className="text-xs font-semibold text-[#FFD700]">
                          Pork-barrel indicator
                        </p>
                        <p className="text-xs text-[#8b949e]">
                          Marginal seat with above-average grants
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </RevealSection>
          )}

          {/* Career Stats */}
          <RevealSection delay={550}>
            <div className="rounded-xl border border-white/5 bg-[#12121a] p-6">
              <SectionHeader
                icon={Award}
                title="Career Stats"
              />
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
                <div className="rounded-lg border border-white/5 bg-white/[0.02] p-4 text-center">
                  <p className="text-2xl font-bold font-mono text-[#FFD700]">
                    {mpData.speech_count?.toLocaleString() ?? "--"}
                  </p>
                  <p className="text-xs text-[#8b949e] mt-1">Speeches</p>
                </div>
                <div className="rounded-lg border border-white/5 bg-white/[0.02] p-4 text-center">
                  <p className="text-2xl font-bold font-mono text-[#e6edf3]">
                    {mpData.years_active ?? "--"}
                  </p>
                  <p className="text-xs text-[#8b949e] mt-1">Years active</p>
                </div>
                <div className="rounded-lg border border-white/5 bg-white/[0.02] p-4 text-center col-span-2 md:col-span-1">
                  <p className="text-2xl font-bold font-mono text-[#e6edf3]">
                    {mpData.attendance_rate
                      ? `${mpData.attendance_rate}%`
                      : "--"}
                  </p>
                  <p className="text-xs text-[#8b949e] mt-1">Attendance</p>
                </div>
                <div className="rounded-lg border border-white/5 bg-white/[0.02] p-4 text-center hidden md:block">
                  <p className="text-2xl font-bold font-mono text-[#e6edf3]">
                    {mpData.chamber}
                  </p>
                  <p className="text-xs text-[#8b949e] mt-1">Chamber</p>
                </div>
              </div>

              {/* Top Topics */}
              {mpData.top_topics && mpData.top_topics.length > 0 && (
                <div>
                  <p className="text-xs text-[#8b949e] uppercase tracking-wider mb-2">
                    Top Topics
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {mpData.top_topics.map((topic) => (
                      <span
                        key={topic}
                        className="text-xs px-3 py-1.5 rounded-full border border-white/8 bg-white/[0.03] text-[#8b949e] hover:text-[#FFD700] hover:border-[#FFD700]/30 transition-colors"
                      >
                        {topic}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Attendance bar */}
              {mpData.attendance_rate && (
                <div className="mt-5">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs text-[#8b949e]">
                      Attendance rate
                    </span>
                    <span className="text-xs font-mono text-[#e6edf3]">
                      {mpData.attendance_rate}%
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-1000 ease-out"
                      style={{
                        width: `${mpData.attendance_rate}%`,
                        background:
                          mpData.attendance_rate > 80
                            ? "#00843D"
                            : mpData.attendance_rate > 60
                              ? "#FFD700"
                              : "#DC2626",
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          </RevealSection>

          {/* In Their Own Words */}
          {mpData.key_quote && (
            <RevealSection delay={600}>
              <div className="rounded-xl border border-white/5 bg-[#12121a] p-6 relative overflow-hidden">
                <div className="absolute left-0 top-4 bottom-4 w-[3px] rounded-full bg-[#FFD700]/30" />

                <SectionHeader
                  icon={MessageSquareQuote}
                  title="In Their Own Words"
                />

                <div className="pl-4 relative">
                  <span
                    className="absolute -top-1 left-0 text-4xl font-serif text-[#FFD700]/10 leading-none select-none"
                    aria-hidden="true"
                  >
                    &ldquo;
                  </span>
                  <blockquote className="text-sm sm:text-base text-[#e6edf3]/80 italic leading-relaxed pl-6 mb-3">
                    &ldquo;{mpData.key_quote.text}&rdquo;
                  </blockquote>
                  <div className="pl-6 flex items-center gap-3 text-xs text-[#8b949e]">
                    <span>{mpData.key_quote.date}</span>
                    <span className="text-[#8b949e]/30">|</span>
                    <span>{mpData.key_quote.topic}</span>
                  </div>
                </div>
              </div>
            </RevealSection>
          )}

          {/* Share / CTA */}
          <RevealSection delay={650}>
            <div className="rounded-xl border border-[#FFD700]/20 bg-[#FFD700]/[0.03] p-6 text-center">
              <h3 className="text-lg font-bold text-[#e6edf3] mb-2">
                Share this accountability report
              </h3>
              <p className="text-sm text-[#8b949e] mb-5 max-w-md mx-auto">
                Democracy works better when voters know how their MP
                represents them. Share this report with your community.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <button
                  onClick={handleShare}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all hover:scale-105 active:scale-95"
                  style={{ backgroundColor: "#FFD700", color: "#0a0a0f" }}
                >
                  <Share2 className="w-4 h-4" />
                  {shared ? "Link copied!" : "Share this report"}
                </button>
                <Link
                  href="/search"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium border border-white/10 text-[#e6edf3] hover:bg-white/5 transition-all"
                >
                  Explore more
                  <ChevronRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          </RevealSection>
        </div>
      )}

      {/* Empty state when no search yet */}
      {!loading && !error && !mpData && !submittedPostcode && (
        <RevealSection className="text-center py-8" delay={200}>
          <div className="max-w-md mx-auto">
            <div className="grid grid-cols-3 gap-4 mb-8">
              {[
                {
                  icon: TrendingDown,
                  label: "Speech vs vote disconnect",
                  color: "#DC2626",
                },
                {
                  icon: DollarSign,
                  label: "Donor industry breakdown",
                  color: "#FFD700",
                },
                {
                  icon: Users,
                  label: "Electorate representation",
                  color: "#00843D",
                },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-lg border border-white/5 bg-[#12121a] p-4 text-center"
                >
                  <item.icon
                    className="w-6 h-6 mx-auto mb-2"
                    style={{ color: item.color }}
                  />
                  <p className="text-xs text-[#8b949e] leading-tight">
                    {item.label}
                  </p>
                </div>
              ))}
            </div>
            <p className="text-sm text-[#8b949e]/60">
              Enter your postcode above to generate a personalised
              accountability report for your local MP.
            </p>
          </div>
        </RevealSection>
      )}
    </div>
  );
}

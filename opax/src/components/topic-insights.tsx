"use client";

import { useState, useEffect, useRef } from "react";
import { PartyBadge } from "@/components/party-badge";
import {
  Skeleton,
  SkeletonCard,
  SkeletonText,
  SkeletonTable,
} from "@/components/skeleton";

/* ── Types ── */

interface TopQuote {
  speaker_name: string;
  party: string;
  date: string;
  text: string;
  photo_id?: string;
}

interface DisconnectMP {
  name: string;
  party: string;
  disconnect_score: number;
  speech_count: number;
  photo_id?: string;
}

interface DonorEntry {
  donor_name: string;
  total_amount: number;
  donation_count: number;
  recipient_parties?: string[];
}

interface PayToPlayFlag {
  company: string;
  donation_total: number;
  contract_value?: number;
  description: string;
}

interface PartyBreakdownEntry {
  party: string;
  speeches: number;
  votes_for: number;
  votes_against: number;
}

interface TopicInsightsData {
  key_stats?: Record<string, string | number>;
  top_quote?: TopQuote;
  disconnect_mps?: DisconnectMP[];
  follow_the_money?: DonorEntry[];
  pay_to_play?: PayToPlayFlag[];
  party_breakdown?: PartyBreakdownEntry[];
  trend_data?: { year: string; count: number }[];
}

/* ── Props ── */

interface TopicInsightsProps {
  topic: string;
  className?: string;
}

/* ── Scroll reveal ── */

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

/* ── Helpers ── */

const fmtMoney = (n: number) => {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
};

/* ── Component ── */

export function TopicInsights({ topic, className = "" }: TopicInsightsProps) {
  const [data, setData] = useState<TopicInsightsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const { ref, visible } = useScrollReveal();

  useEffect(() => {
    const API = (typeof window !== "undefined" ? `http://${window.location.hostname}:8000` : "http://localhost:8000");
    fetch(`${API}/api/topic-insights/${encodeURIComponent(topic)}`)
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status}`);
        return r.json();
      })
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => {
        setFailed(true);
        setLoading(false);
      });
  }, [topic]);

  // If API returned 404 or error, render nothing
  if (failed) return null;

  // Check if we got any data worth showing
  const hasQuote = data?.top_quote?.text;
  const hasDisconnect = data?.disconnect_mps && data.disconnect_mps.length > 0;
  const hasDonors = data?.follow_the_money && data.follow_the_money.length > 0;
  const hasPayToPlay = data?.pay_to_play && data.pay_to_play.length > 0;

  // Don't render if all sections are empty
  if (!loading && data && !hasQuote && !hasDisconnect && !hasDonors && !hasPayToPlay) {
    return null;
  }

  return (
    <div
      ref={ref}
      className={`py-14 transition-all duration-700 ease-out ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"} ${className}`}
    >
      {/* Section header */}
      <div className="flex items-center gap-3 mb-2">
        <div className="h-px flex-1 max-w-8 bg-[#FFD700]/40" />
        <p className="text-xs uppercase tracking-[0.2em] text-[#FFD700] font-medium">
          Key Findings
        </p>
      </div>
      <h2 className="text-2xl md:text-3xl font-bold text-[#e6edf3] mb-2">
        What the Data Reveals
      </h2>
      <p className="text-sm text-[#8b949e] mb-10 max-w-2xl leading-relaxed">
        Automated analysis of speeches, votes, and donations — surfacing the
        patterns that matter.
      </p>

      {loading ? (
        <InsightsSkeleton />
      ) : (
        <div className="space-y-8">
          {/* ── Highlighted Quote ── */}
          {hasQuote && (
            <HighlightedQuote quote={data!.top_quote!} />
          )}

          {/* ── Disconnect Alerts ── */}
          {hasDisconnect && (
            <DisconnectAlerts mps={data!.disconnect_mps!.slice(0, 3)} />
          )}

          {/* ── Follow the Money ── */}
          {hasDonors && (
            <FollowTheMoney donors={data!.follow_the_money!} />
          )}

          {/* ── Pay-to-Play Flags ── */}
          {hasPayToPlay && (
            <PayToPlayFlags flags={data!.pay_to_play!} />
          )}
        </div>
      )}
    </div>
  );
}

/* ── Sub-components ── */

function HighlightedQuote({ quote }: { quote: TopQuote }) {
  return (
    <div className="rounded-xl border border-[#FFD700]/15 bg-[#FFD700]/[0.03] p-6 relative overflow-hidden">
      {/* Decorative quote mark */}
      <span
        className="absolute top-3 left-4 text-6xl font-serif text-[#FFD700]/[0.07] leading-none select-none"
        aria-hidden="true"
      >
        &ldquo;
      </span>
      <div className="relative">
        <p className="text-xs uppercase tracking-[0.2em] text-[#FFD700]/70 mb-4 font-medium">
          Most Impactful Speech
        </p>
        <blockquote className="text-base md:text-lg text-[#e6edf3]/90 italic leading-relaxed mb-5 pl-4 border-l-2 border-[#FFD700]/40">
          &ldquo;{quote.text}&rdquo;
        </blockquote>
        <div className="flex items-center gap-3">
          {quote.photo_id && (
            <div className="w-9 h-9 rounded-full overflow-hidden shrink-0 border border-white/10">
              <img
                src={`https://www.openaustralia.org.au/images/mpsL/${quote.photo_id}.jpg`}
                alt={quote.speaker_name}
                className="w-full h-full object-cover"
              />
            </div>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-[#e6edf3]">
              {quote.speaker_name}
            </span>
            <PartyBadge party={quote.party} />
            {quote.date && (
              <span className="text-xs text-[#8b949e]">{quote.date}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function DisconnectAlerts({ mps }: { mps: DisconnectMP[] }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-[#DC2626]/15 text-[#DC2626] text-xs font-bold">
          !
        </span>
        <h3 className="text-base font-semibold text-[#e6edf3]">
          Disconnect Alert
        </h3>
        <span className="text-xs text-[#8b949e]">
          — MPs who talk about it but vote against
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {mps.map((mp) => {
          const score = Math.round(mp.disconnect_score * 100);
          const barColor =
            score >= 70
              ? "#DC2626"
              : score >= 40
                ? "#FFD700"
                : "#8b949e";
          return (
            <div
              key={mp.name}
              className="rounded-xl border border-[#DC2626]/10 bg-[#12121a] p-5 hover:border-[#DC2626]/25 transition-colors"
            >
              <div className="flex items-start gap-3 mb-3">
                {mp.photo_id ? (
                  <div className="w-10 h-10 rounded-full overflow-hidden shrink-0 border-2 border-[#DC2626]/30">
                    <img
                      src={`https://www.openaustralia.org.au/images/mpsL/${mp.photo_id}.jpg`}
                      alt={mp.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="w-10 h-10 rounded-full bg-white/5 shrink-0 border-2 border-[#DC2626]/30" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[#e6edf3] truncate">
                    {mp.name}
                  </p>
                  <PartyBadge party={mp.party} className="mt-0.5" />
                </div>
              </div>
              {/* Disconnect score bar */}
              <div className="mb-2">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-[#8b949e]">Disconnect score</span>
                  <span className="font-bold" style={{ color: barColor }}>
                    {score}%
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${score}%`,
                      backgroundColor: barColor,
                    }}
                  />
                </div>
              </div>
              <p className="text-xs text-[#8b949e]">
                {mp.speech_count} speech{mp.speech_count !== 1 ? "es" : ""} on record
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FollowTheMoney({ donors }: { donors: DonorEntry[] }) {
  return (
    <div>
      <h3 className="text-base font-semibold text-[#e6edf3] mb-4">
        Follow the Money
      </h3>
      <div className="rounded-xl border border-white/5 bg-[#12121a] overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-12 gap-2 px-5 py-3 border-b border-white/5 bg-white/[0.02]">
          <span className="col-span-5 text-xs font-medium uppercase tracking-wider text-[#8b949e]">
            Donor
          </span>
          <span className="col-span-3 text-xs font-medium uppercase tracking-wider text-[#8b949e] text-right">
            Total
          </span>
          <span className="col-span-2 text-xs font-medium uppercase tracking-wider text-[#8b949e] text-right">
            Count
          </span>
          <span className="col-span-2 text-xs font-medium uppercase tracking-wider text-[#8b949e] text-right">
            Parties
          </span>
        </div>
        {/* Rows */}
        {donors.slice(0, 8).map((d, i) => (
          <div
            key={d.donor_name}
            className="grid grid-cols-12 gap-2 px-5 py-3 border-b border-white/[0.03] last:border-b-0 hover:bg-white/[0.02] transition-colors"
          >
            <span className="col-span-5 text-sm text-[#e6edf3] truncate">
              {d.donor_name}
            </span>
            <span className="col-span-3 text-sm font-semibold text-[#FFD700] text-right">
              {fmtMoney(d.total_amount)}
            </span>
            <span className="col-span-2 text-sm text-[#8b949e] text-right">
              {d.donation_count}
            </span>
            <span className="col-span-2 text-xs text-[#8b949e] text-right truncate">
              {d.recipient_parties?.join(", ") ?? "—"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PayToPlayFlags({ flags }: { flags: PayToPlayFlag[] }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-[#DC2626]/15 text-[#DC2626] text-xs font-bold">
          $
        </span>
        <h3 className="text-base font-semibold text-[#e6edf3]">
          Pay-to-Play Flags
        </h3>
        <span className="text-xs text-[#8b949e]">
          — donors who won government contracts
        </span>
      </div>
      <div className="space-y-3">
        {flags.slice(0, 5).map((f) => (
          <div
            key={f.company}
            className="rounded-xl border border-[#DC2626]/10 bg-[#DC2626]/[0.02] p-4 hover:border-[#DC2626]/20 transition-colors"
          >
            <div className="flex items-start justify-between mb-1.5">
              <span className="text-sm font-semibold text-[#e6edf3]">
                {f.company}
              </span>
              <div className="flex gap-3 shrink-0 ml-3 text-right">
                <div>
                  <p className="text-xs text-[#8b949e]">Donated</p>
                  <p className="text-sm font-semibold text-[#FFD700]">
                    {fmtMoney(f.donation_total)}
                  </p>
                </div>
                {f.contract_value != null && (
                  <div>
                    <p className="text-xs text-[#8b949e]">Contract</p>
                    <p className="text-sm font-semibold text-[#DC2626]">
                      {fmtMoney(f.contract_value)}
                    </p>
                  </div>
                )}
              </div>
            </div>
            <p className="text-xs text-[#8b949e] leading-relaxed">
              {f.description}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Skeleton Loader ── */

function InsightsSkeleton() {
  return (
    <div className="space-y-8">
      {/* Quote skeleton */}
      <div className="rounded-xl border border-[#FFD700]/10 bg-[#FFD700]/[0.02] p-6">
        <Skeleton className="h-3 w-32 mb-4" />
        <SkeletonText lines={3} className="mb-5 pl-4" />
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded-full" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-5 w-16 rounded-md" />
        </div>
      </div>

      {/* Disconnect skeleton */}
      <div>
        <Skeleton className="h-4 w-48 mb-4" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </div>

      {/* Donors skeleton */}
      <div>
        <Skeleton className="h-4 w-36 mb-4" />
        <SkeletonTable rows={5} cols={4} />
      </div>
    </div>
  );
}

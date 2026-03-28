"use client";

import { useState, useRef, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  MP_PROFILES,
  DONATION_TRAILS,
  TOPIC_STATS,
  PARTY_COLORS,
  formatDollars,
  mpPhotoUrl,
  type MpProfile,
  type DonationTrailData,
  type TopicStatData,
} from "@/lib/card-data";

/* ── MP Disconnect Card ── */
function MpDisconnectCardUI({ mp, topic }: { mp: MpProfile; topic: string }) {
  const partyColor = PARTY_COLORS[mp.party] || "#888";
  const topicLabel = TOPIC_STATS[topic]?.label || topic;

  return (
    <div className="relative w-[1200px] h-[630px] bg-[#0a0a0f] p-12 flex flex-col overflow-hidden">
      {/* Top accent */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#FFD700] via-[#b89b00] to-transparent" />
      {/* Glow */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_20%_50%,rgba(255,215,0,0.04),transparent_60%)]" />

      <div className="flex items-start gap-10 flex-1 relative z-10">
        {/* Photo + identity */}
        <div className="flex flex-col items-center gap-3 min-w-[180px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={mpPhotoUrl(mp.photoId)}
            alt={mp.name}
            className="w-[140px] h-[140px] rounded-full object-cover"
            style={{ border: `3px solid ${partyColor}` }}
          />
          <div className="flex flex-col items-center">
            <span className="text-xl font-bold text-[#e6edf3]">{mp.name}</span>
            <span className="text-sm font-semibold mt-0.5" style={{ color: partyColor }}>
              {mp.party}
            </span>
            <span className="text-xs text-[#8b949e] mt-0.5">{mp.electorate}</span>
          </div>
        </div>

        {/* Stats */}
        <div className="flex flex-col flex-1 gap-4 justify-center">
          <span className="text-[13px] uppercase tracking-[0.15em] text-[#FFD700] font-semibold">
            {topicLabel}
          </span>
          <h2 className="text-[42px] font-bold text-[#e6edf3] leading-tight">
            Spoke about reform <span className="text-[#FFD700]">{mp.speeches}</span> times
          </h2>
          <div className="border-t border-white/[0.08] pt-3.5">
            <p className="text-base text-[#8b949e] leading-relaxed">{mp.voted}</p>
          </div>
          {mp.disconnect && (
            <div className="mt-2">
              <span className="inline-flex items-center gap-2 bg-[#DC2626]/15 border border-[#DC2626]/30 rounded-md px-4 py-1.5">
                <span className="w-2 h-2 rounded-full bg-[#DC2626]" />
                <span className="text-sm font-bold text-[#DC2626] uppercase tracking-wider">
                  Disconnect Detected
                </span>
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between relative z-10 mt-4">
        <span className="text-[11px] text-[#8b949e]/60">
          Source: Hansard + AEC Disclosure Returns
        </span>
        <div className="flex items-center gap-2">
          <span className="text-[22px] font-bold text-[#FFD700] tracking-wide">OPAX</span>
          <span className="text-sm text-[#8b949e]">opax.com.au</span>
        </div>
      </div>
    </div>
  );
}

/* ── Donation Trail Card ── */
function DonationTrailCardUI({
  trail,
  partyFilter,
}: {
  trail: DonationTrailData;
  partyFilter?: string;
}) {
  const parties = partyFilter
    ? trail.parties.filter((p) => p.party === partyFilter)
    : trail.parties;
  const maxAmount = Math.max(...parties.map((p) => p.amount));

  return (
    <div className="relative w-[1200px] h-[630px] bg-[#0a0a0f] p-12 flex flex-col overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#FFD700] via-[#b89b00] to-transparent" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_20%_50%,rgba(255,215,0,0.04),transparent_60%)]" />

      <div className="flex flex-col flex-1 gap-5 relative z-10">
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] uppercase tracking-[0.15em] text-[#FFD700] font-semibold">
            Follow the Money
          </span>
          <h2 className="text-[44px] font-bold text-[#e6edf3]">
            {trail.industry} Donations
          </h2>
          <span className="text-base text-[#8b949e]">
            {trail.period} | Total: {formatDollars(trail.totalDonations)}
          </span>
        </div>

        <div className="flex flex-col gap-3.5 flex-1 justify-center">
          {parties.map((p) => (
            <div key={p.party} className="flex items-center gap-4">
              <span className="text-lg font-semibold text-[#e6edf3] min-w-[48px]">
                {p.party}
              </span>
              <div className="flex-1 h-9 bg-white/[0.03] rounded-md overflow-hidden">
                <div
                  className="h-full rounded-md flex items-center pl-3"
                  style={{
                    width: `${(p.amount / maxAmount) * 100}%`,
                    backgroundColor: p.color,
                  }}
                >
                  <span className="text-[15px] font-bold text-white">
                    {formatDollars(p.amount)}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-white/[0.08] pt-3.5">
          <span className="text-lg text-[#8b949e]">
            Meanwhile:{" "}
            <span className="text-[#DC2626] font-bold">
              {trail.reformBillsPassed} major reform bills
            </span>{" "}
            passed
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between relative z-10 mt-4">
        <span className="text-[11px] text-[#8b949e]/60">
          Source: Hansard + AEC Disclosure Returns
        </span>
        <div className="flex items-center gap-2">
          <span className="text-[22px] font-bold text-[#FFD700] tracking-wide">OPAX</span>
          <span className="text-sm text-[#8b949e]">opax.com.au</span>
        </div>
      </div>
    </div>
  );
}

/* ── Topic Stat Card ── */
function TopicStatCardUI({ stat }: { stat: TopicStatData }) {
  return (
    <div className="relative w-[1200px] h-[630px] bg-[#0a0a0f] p-12 flex flex-col overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#FFD700] via-[#b89b00] to-transparent" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_20%_50%,rgba(255,215,0,0.04),transparent_60%)]" />

      <div className="flex flex-col flex-1 justify-center gap-6 relative z-10">
        <div className="flex flex-col gap-1">
          <span className="text-[13px] uppercase tracking-[0.15em] text-[#FFD700] font-semibold">
            OPAX Investigation
          </span>
          <h2 className="text-[64px] font-bold text-[#FFD700] leading-tight">
            {stat.yearsOfDebate} YEARS OF DEBATE
          </h2>
        </div>

        <div className="flex gap-10">
          <div className="flex flex-col gap-1">
            <span className="text-4xl font-bold text-[#e6edf3]">
              {stat.speeches.toLocaleString()}
            </span>
            <span className="text-sm text-[#8b949e]">
              speeches on {stat.label.toLowerCase()}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-4xl font-bold text-[#e6edf3]">
              {stat.mpsInvolved}
            </span>
            <span className="text-sm text-[#8b949e]">MPs involved</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-4xl font-bold text-[#e6edf3]">
              {formatDollars(stat.industryDonations)}
            </span>
            <span className="text-sm text-[#8b949e]">in industry donations</span>
          </div>
        </div>

        <div className="border-t border-white/[0.08] pt-5 flex items-center gap-3">
          <span className="text-[13px] text-[#8b949e] uppercase tracking-wider">
            Result:
          </span>
          <span className="text-2xl font-bold text-[#DC2626]">{stat.result}</span>
        </div>
      </div>

      <div className="flex items-center justify-between relative z-10 mt-4">
        <span className="text-[11px] text-[#8b949e]/60">
          Source: Hansard + AEC Disclosure Returns
        </span>
        <div className="flex items-center gap-2">
          <span className="text-[22px] font-bold text-[#FFD700] tracking-wide">OPAX</span>
          <span className="text-sm text-[#8b949e]">opax.com.au</span>
        </div>
      </div>
    </div>
  );
}

/* ── Main page ── */
export default function CardPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
          <span className="text-[#8b949e]">Loading card generator...</span>
        </div>
      }
    >
      <CardPageInner />
    </Suspense>
  );
}

function CardPageInner() {
  const searchParams = useSearchParams();
  const cardRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);

  const type = searchParams.get("type") || "topic-stat";
  const mp = searchParams.get("mp") || "10007";
  const topic = searchParams.get("topic") || "gambling";
  const industry = searchParams.get("industry") || "gambling";
  const party = searchParams.get("party") || undefined;

  const apiUrl = (() => {
    switch (type) {
      case "mp-disconnect":
        return `/api/card?type=mp-disconnect&mp=${mp}&topic=${topic}`;
      case "donation-trail":
        return `/api/card?type=donation-trail&industry=${industry}${party ? `&party=${party}` : ""}`;
      case "topic-stat":
        return `/api/card?type=topic-stat&topic=${topic}`;
      default:
        return `/api/card?type=topic-stat&topic=gambling`;
    }
  })();

  const downloadImage = useCallback(async () => {
    setDownloading(true);
    try {
      const resp = await fetch(apiUrl);
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `opax-${type}-card.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Download failed:", err);
    } finally {
      setDownloading(false);
    }
  }, [apiUrl, type]);

  const renderCard = () => {
    switch (type) {
      case "mp-disconnect": {
        const mpData = MP_PROFILES[mp];
        if (!mpData) return <div className="text-[#DC2626]">MP not found (id: {mp})</div>;
        return <MpDisconnectCardUI mp={mpData} topic={topic} />;
      }
      case "donation-trail": {
        const trail = DONATION_TRAILS[industry];
        if (!trail) return <div className="text-[#DC2626]">Industry not found</div>;
        return <DonationTrailCardUI trail={trail} partyFilter={party} />;
      }
      case "topic-stat": {
        const stat = TOPIC_STATS[topic];
        if (!stat) return <div className="text-[#DC2626]">Topic not found</div>;
        return <TopicStatCardUI stat={stat} />;
      }
      default:
        return <div className="text-[#DC2626]">Unknown card type</div>;
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-[#e6edf3]">
      <div className="mx-auto max-w-7xl px-6 py-12">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-[#e6edf3] mb-2">
            Investigation Card Generator
          </h1>
          <p className="text-sm text-[#8b949e] mb-6">
            Generate shareable social media cards for OPAX investigations.
            Cards are 1200x630px, optimised for Twitter and Open Graph.
          </p>

          {/* Quick links */}
          <div className="flex flex-wrap gap-2 mb-6">
            <span className="text-xs text-[#8b949e] uppercase tracking-wider self-center mr-2">
              Examples:
            </span>
            {[
              { label: "Albanese Disconnect", href: "/card?type=mp-disconnect&mp=10007&topic=gambling" },
              { label: "Wilkie Disconnect", href: "/card?type=mp-disconnect&mp=10727&topic=gambling" },
              { label: "Gambling Donations", href: "/card?type=donation-trail&industry=gambling" },
              { label: "ALP Donations", href: "/card?type=donation-trail&industry=gambling&party=ALP" },
              { label: "Topic Overview", href: "/card?type=topic-stat&topic=gambling" },
            ].map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="px-3 py-1.5 text-xs rounded-md bg-[#1a1a28] text-[#e6edf3] border border-white/5 hover:border-[#FFD700]/30 hover:text-[#FFD700] transition-colors"
              >
                {link.label}
              </a>
            ))}
          </div>

          {/* Action buttons */}
          <div className="flex gap-3">
            <button
              onClick={downloadImage}
              disabled={downloading}
              className="px-5 py-2.5 rounded-lg bg-[#FFD700] text-[#0a0a0f] font-semibold text-sm hover:bg-[#FFD700]/90 transition-colors disabled:opacity-50"
            >
              {downloading ? "Downloading..." : "Download as PNG"}
            </button>
            <a
              href={apiUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-5 py-2.5 rounded-lg border border-white/10 text-[#e6edf3] text-sm hover:border-[#FFD700]/30 transition-colors"
            >
              Open Image Directly
            </a>
          </div>
        </div>

        {/* Card preview */}
        <div className="rounded-xl border border-white/5 bg-[#12121a] p-6 overflow-x-auto">
          <div ref={cardRef} className="inline-block">
            {renderCard()}
          </div>
        </div>

        {/* API reference */}
        <div className="mt-12 rounded-xl border border-white/5 bg-[#12121a] p-6">
          <h2 className="text-lg font-bold text-[#e6edf3] mb-4">API Reference</h2>
          <div className="space-y-3 text-sm font-mono">
            {[
              {
                method: "GET",
                path: "/api/card?type=mp-disconnect&mp=10007&topic=gambling",
                desc: "MP disconnect card with photo, speech count, and voting record",
              },
              {
                method: "GET",
                path: "/api/card?type=donation-trail&industry=gambling",
                desc: "Donation flow chart showing money from an industry to all parties",
              },
              {
                method: "GET",
                path: "/api/card?type=donation-trail&industry=gambling&party=ALP",
                desc: "Donation flow filtered to a single party",
              },
              {
                method: "GET",
                path: "/api/card?type=topic-stat&topic=gambling",
                desc: "Overview card with headline stats for a topic investigation",
              },
            ].map((endpoint) => (
              <div
                key={endpoint.path}
                className="flex flex-col gap-1 p-3 rounded-lg bg-white/[0.02] border border-white/5"
              >
                <div className="flex items-center gap-2">
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#00843D]/20 text-[#00843D]">
                    {endpoint.method}
                  </span>
                  <a
                    href={endpoint.path}
                    className="text-[#FFD700] hover:underline break-all"
                  >
                    {endpoint.path}
                  </a>
                </div>
                <span className="text-[#8b949e] font-sans text-xs">
                  {endpoint.desc}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-[#8b949e]">
            All endpoints return a 1200x630 PNG image. Use these URLs directly
            in Open Graph meta tags or embed them in tweets.
          </p>
        </div>
      </div>
    </div>
  );
}

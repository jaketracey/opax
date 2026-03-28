"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { PartyBadge } from "@/components/party-badge";

const partyBorderColors: Record<string, string> = {
  Labor: "#E13A3A",
  Liberal: "#1C4FA0",
  Greens: "#00843D",
  Nationals: "#006644",
  Independent: "#888888",
};

// Topics to cycle through with colors
const CYCLING_TOPICS = [
  { label: "gambling reform", color: "#DC2626" },
  { label: "housing affordability", color: "#8B5CF6" },
  { label: "climate action", color: "#10B981" },
  { label: "political donations reform", color: "#F59E0B" },
  { label: "anti-corruption", color: "#3B82F6" },
  { label: "media diversity", color: "#14B8A6" },
];

interface PoliticianCardProps {
  slug: string;
  name: string;
  party: string;
  electorate: string;
  chamber?: string;
  photoId: string;
  keyStat?: string;
  keyStatLabel?: string;
  keyStats?: { stat: string; label: string }[];
  className?: string;
}

function CyclingStats({
  stats,
}: {
  stats: { stat: string; label: string }[];
}) {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (stats.length <= 1) return;
    const interval = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIndex((i) => (i + 1) % stats.length);
        setVisible(true);
      }, 300);
    }, 3000);
    return () => clearInterval(interval);
  }, [stats.length]);

  const current = stats[index];
  const topicColor =
    CYCLING_TOPICS.find((t) => current.label.includes(t.label))?.color ||
    "#FFD700";

  return (
    <div
      className="text-sm transition-all duration-300"
      style={{ opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(4px)" }}
    >
      <span className="font-bold font-mono" style={{ color: topicColor }}>
        {current.stat}
      </span>
      <span className="text-[#8b949e] ml-1.5 text-xs">{current.label}</span>
    </div>
  );
}

export function PoliticianCard({
  slug,
  name,
  party,
  electorate,
  chamber,
  photoId,
  keyStat,
  keyStatLabel,
  keyStats,
  className = "",
}: PoliticianCardProps) {
  const borderColor = partyBorderColors[party] || "#888888";
  const isSenator = chamber === "senate";
  const roleLabel = isSenator
    ? `Senator for ${electorate}`
    : electorate
      ? `MP for ${electorate}`
      : "";

  // Build cycling stats from keyStats prop or fall back to single keyStat
  const cycleStats = keyStats && keyStats.length > 0
    ? keyStats
    : keyStat
      ? [{ stat: keyStat, label: keyStatLabel || "" }]
      : [];

  return (
    <Link
      href={`/politicians/${slug}`}
      className={`group block rounded-xl border border-white/5 bg-[#12121a] p-5 transition-all hover:border-white/10 hover:bg-[#16161f] ${className}`}
    >
      <div className="flex items-start gap-4">
        <div
          className="w-16 h-16 rounded-full overflow-hidden shrink-0 border-2"
          style={{ borderColor }}
        >
          <img
            src={`https://www.openaustralia.org.au/images/mpsL/${photoId}.jpg`}
            alt={name}
            className="w-full h-full object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h3 className="text-base font-semibold text-[#e6edf3] group-hover:text-white transition-colors truncate">
              {name}
            </h3>
            <PartyBadge party={party} />
          </div>
          <div className="flex items-center gap-2 mb-2">
            {chamber && (
              <span
                className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded"
                style={{
                  backgroundColor: isSenator
                    ? "rgba(139,0,0,0.15)"
                    : "rgba(0,132,61,0.15)",
                  color: isSenator ? "#CD5C5C" : "#4CAF50",
                }}
              >
                {isSenator ? "Senate" : "House"}
              </span>
            )}
            <p className="text-xs text-[#8b949e] truncate">{roleLabel}</p>
          </div>
          {cycleStats.length > 0 && <CyclingStats stats={cycleStats} />}
        </div>
      </div>
    </Link>
  );
}

export { PoliticianCard as MpCard };

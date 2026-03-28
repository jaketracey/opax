"use client";

import { PartyBadge } from "@/components/party-badge";

interface QuoteCardProps {
  speakerName: string;
  party: string;
  photoId: string;
  date: string;
  quote: string;
  context: "for" | "against";
  className?: string;
}

export function QuoteCard({
  speakerName,
  party,
  photoId,
  date,
  quote,
  context,
  className = "",
}: QuoteCardProps) {
  const contextColor = context === "for" ? "#00843D" : "#DC2626";
  const contextBg =
    context === "for" ? "rgba(0, 132, 61, 0.1)" : "rgba(220, 38, 38, 0.1)";
  const contextLabel =
    context === "for" ? "Spoke FOR reform" : "Voted AGAINST reform";

  return (
    <div
      className={`group relative rounded-xl border border-white/5 bg-[#12121a] p-5 transition-all duration-300 hover:border-white/10 ${className}`}
    >
      {/* Gold left accent bar */}
      <div className="absolute left-0 top-4 bottom-4 w-[3px] rounded-full bg-[#FFD700]/30 transition-colors duration-300 group-hover:bg-[#FFD700]/60" />

      <div className="flex items-center gap-3 mb-4 pl-3">
        <div className="w-10 h-10 rounded-full overflow-hidden shrink-0 border border-white/10 transition-transform duration-300 group-hover:scale-105">
          <img
            src={`https://www.openaustralia.org.au/images/mps/${photoId}.jpg`}
            alt={speakerName}
            className="w-full h-full object-cover"
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-[#e6edf3]">
              {speakerName}
            </span>
            <PartyBadge party={party} />
          </div>
          <p className="text-xs text-[#8b949e]/70 font-medium tracking-wide">
            {date}
          </p>
        </div>
      </div>

      <div className="relative pl-3">
        {/* Decorative quote mark */}
        <span
          className="absolute -top-1 -left-1 text-3xl font-serif text-[#FFD700]/10 leading-none select-none transition-transform duration-500 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-[#FFD700]/20"
          aria-hidden="true"
        >
          &ldquo;
        </span>
        <blockquote className="text-sm text-[#e6edf3]/80 italic leading-relaxed mb-4 pl-4">
          &ldquo;{quote}&rdquo;
        </blockquote>
      </div>

      <div className="pl-3">
        <span
          className="inline-flex items-center rounded-md px-2.5 py-1 text-xs font-semibold tracking-wide"
          style={{ color: contextColor, backgroundColor: contextBg }}
        >
          {contextLabel}
        </span>
      </div>
    </div>
  );
}

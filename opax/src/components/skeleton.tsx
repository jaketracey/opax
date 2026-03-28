import { cn } from "@/lib/utils";

/**
 * Reusable skeleton loader primitives for OPAX.
 *
 * All skeletons use a subtle gold-tinted shimmer on the dark #12121a card
 * background. Import individual components as needed.
 */

/* ── Base Skeleton ── */

interface SkeletonProps {
  className?: string;
  style?: React.CSSProperties;
}

export function Skeleton({ className, style }: SkeletonProps) {
  return (
    <div
      className={cn(
        "rounded-md",
        "animate-[shimmer_2s_ease-in-out_infinite]",
        className
      )}
      style={{
        background:
          "linear-gradient(90deg, #12121a 0%, #1a1a28 25%, rgba(255,215,0,0.06) 50%, #1a1a28 75%, #12121a 100%)",
        backgroundSize: "400% 100%",
        ...style,
      }}
    />
  );
}

/* ── Skeleton Card (matches stat-card dimensions) ── */

interface SkeletonCardProps {
  className?: string;
}

export function SkeletonCard({ className }: SkeletonCardProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-xl border border-white/5 bg-[#12121a] p-4",
        className
      )}
    >
      {/* Label */}
      <Skeleton className="h-3 w-24" />
      {/* Value */}
      <Skeleton className="h-7 w-20" />
      {/* Trend */}
      <Skeleton className="h-3 w-16" />
    </div>
  );
}

/* ── Skeleton Chart (rectangle with horizontal "lines") ── */

interface SkeletonChartProps {
  className?: string;
  height?: number;
}

export function SkeletonChart({ className, height = 380 }: SkeletonChartProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-white/5 bg-[#12121a] p-4 md:p-6 overflow-hidden",
        className
      )}
      style={{ height }}
    >
      {/* Y-axis labels */}
      <div className="flex gap-4 h-full">
        <div className="flex flex-col justify-between py-2 shrink-0">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-2.5 w-8" />
          ))}
        </div>
        {/* Chart area with horizontal grid lines */}
        <div className="flex-1 flex flex-col justify-between py-2 relative">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="border-b border-white/[0.03] w-full" />
          ))}
          {/* Fake bars */}
          <div className="absolute bottom-2 left-0 right-0 flex items-end justify-around gap-1 px-2">
            {Array.from({ length: 12 }).map((_, i) => (
              <Skeleton
                key={i}
                className="flex-1 rounded-t-sm"
                style={{
                  height: `${20 + Math.sin(i * 0.8) * 30 + 25}%`,
                  animationDelay: `${i * 80}ms`,
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Skeleton Table ── */

interface SkeletonTableProps {
  rows?: number;
  cols?: number;
  className?: string;
}

export function SkeletonTable({
  rows = 5,
  cols = 4,
  className,
}: SkeletonTableProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-white/5 bg-[#12121a] overflow-hidden",
        className
      )}
    >
      {/* Header row */}
      <div
        className="flex gap-4 px-5 py-3 border-b border-white/5 bg-white/[0.02]"
      >
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton
            key={i}
            className="h-3 flex-1"
            style={{ maxWidth: i === 0 ? "40%" : "20%" }}
          />
        ))}
      </div>
      {/* Body rows */}
      {Array.from({ length: rows }).map((_, rowIdx) => (
        <div
          key={rowIdx}
          className="flex gap-4 px-5 py-3 border-b border-white/[0.03] last:border-b-0"
        >
          {Array.from({ length: cols }).map((_, colIdx) => (
            <Skeleton
              key={colIdx}
              className="h-3 flex-1"
              style={{
                maxWidth: colIdx === 0 ? "40%" : "20%",
                animationDelay: `${rowIdx * 60 + colIdx * 40}ms`,
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/* ── Skeleton Text (block of lines with varying widths) ── */

interface SkeletonTextProps {
  lines?: number;
  className?: string;
}

const LINE_WIDTHS = ["100%", "92%", "85%", "97%", "78%", "88%", "65%"];

export function SkeletonText({ lines = 3, className }: SkeletonTextProps) {
  return (
    <div className={cn("flex flex-col gap-2.5", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className="h-3"
          style={{
            width: LINE_WIDTHS[i % LINE_WIDTHS.length],
            animationDelay: `${i * 80}ms`,
          }}
        />
      ))}
    </div>
  );
}

/* ── Skeleton Avatar (circular) ── */

interface SkeletonAvatarProps {
  size?: number;
  className?: string;
}

export function SkeletonAvatar({ size = 40, className }: SkeletonAvatarProps) {
  return (
    <Skeleton
      className={cn("rounded-full shrink-0", className)}
      style={{ width: size, height: size }}
    />
  );
}

/* ── Skeleton Stat Row (for ticker bars / stat rows) ── */

interface SkeletonStatRowProps {
  count?: number;
  className?: string;
}

export function SkeletonStatRow({
  count = 5,
  className,
}: SkeletonStatRowProps) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-center gap-x-6 gap-y-2 py-4 px-4 rounded-xl border border-white/5 bg-[#12121a]",
        className
      )}
    >
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-1.5">
          {i > 0 && (
            <span className="text-white/10 mr-1.5 hidden sm:inline">|</span>
          )}
          <Skeleton
            className="h-4 w-14"
            style={{ animationDelay: `${i * 120}ms` }}
          />
          <Skeleton
            className="h-3 w-16"
            style={{ animationDelay: `${i * 120 + 60}ms` }}
          />
        </div>
      ))}
    </div>
  );
}

/* ── Skeleton Topic Card (matches homepage topic card) ── */

export function SkeletonTopicCard({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rounded-xl border border-white/5 bg-[#12121a] p-5",
        className
      )}
    >
      {/* Icon + badge row */}
      <div className="flex items-start justify-between mb-3">
        <Skeleton className="h-8 w-8 rounded-lg" />
        <Skeleton className="h-4 w-12 rounded-full" />
      </div>
      {/* Title */}
      <Skeleton className="h-5 w-36 mb-2" />
      {/* Subtitle row */}
      <div className="flex items-center justify-between mb-3">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-5 w-20" />
      </div>
      {/* Description */}
      <SkeletonText lines={2} />
    </div>
  );
}

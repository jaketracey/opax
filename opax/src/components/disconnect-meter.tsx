import { cn } from "@/lib/utils";

interface DisconnectMeterProps {
  /** Score from 0 (aligned) to 100 (total disconnect) */
  score: number;
  /** Label shown above the meter */
  label?: string;
  /** Size variant */
  size?: "sm" | "md" | "lg";
  className?: string;
}

function getDisconnectColor(score: number): string {
  if (score < 30) return "#00843D";
  if (score < 60) return "#FFD700";
  return "#DC2626";
}

function getDisconnectLabel(score: number): string {
  if (score < 30) return "LOW";
  if (score < 60) return "MEDIUM";
  return "HIGH";
}

export function DisconnectMeter({
  score,
  label,
  size = "md",
  className,
}: DisconnectMeterProps) {
  const color = getDisconnectColor(score);
  const disconnectLabel = getDisconnectLabel(score);
  const heights = { sm: "h-2", md: "h-3", lg: "h-4" };

  return (
    <div className={cn("w-full", className)}>
      {label && (
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs text-[#8b949e] uppercase tracking-wider">
            {label}
          </span>
          <span
            className="text-xs font-semibold tracking-wider"
            style={{ color }}
          >
            {disconnectLabel}
          </span>
        </div>
      )}
      <div
        className={cn(
          "relative w-full rounded-full overflow-hidden bg-white/5",
          heights[size]
        )}
      >
        {/* Gradient background */}
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background:
              "linear-gradient(to right, #00843D 0%, #FFD700 50%, #DC2626 100%)",
            opacity: 0.2,
          }}
        />
        {/* Filled portion */}
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-all duration-700 ease-out"
          style={{
            width: `${score}%`,
            background: `linear-gradient(to right, #00843D, ${color})`,
          }}
        />
        {/* Marker */}
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 transition-all duration-700 ease-out"
          style={{
            left: `${score}%`,
          }}
        >
          <div
            className="w-3 h-3 rounded-full border-2 border-[#0a0a0f] shadow-lg"
            style={{ backgroundColor: color }}
          />
        </div>
      </div>
    </div>
  );
}

import { cn } from "@/lib/utils";

const partyColors: Record<string, { bg: string; text: string; border: string }> = {
  Labor: { bg: "bg-red-900/30", text: "text-red-400", border: "border-red-800/50" },
  Liberal: { bg: "bg-blue-900/30", text: "text-blue-400", border: "border-blue-800/50" },
  Greens: { bg: "bg-green-900/30", text: "text-green-400", border: "border-green-800/50" },
  Nationals: { bg: "bg-yellow-900/30", text: "text-yellow-500", border: "border-yellow-800/50" },
  Independent: { bg: "bg-purple-900/30", text: "text-purple-400", border: "border-purple-800/50" },
  "One Nation": { bg: "bg-orange-900/30", text: "text-orange-400", border: "border-orange-800/50" },
};

const defaultColor = { bg: "bg-zinc-800/30", text: "text-zinc-400", border: "border-zinc-700/50" };

interface PartyBadgeProps {
  party: string;
  className?: string;
}

export function PartyBadge({ party, className }: PartyBadgeProps) {
  const colors = partyColors[party] || defaultColor;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium",
        colors.bg,
        colors.text,
        colors.border,
        className
      )}
    >
      {party}
    </span>
  );
}

"use client";

import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: string | number;
  trend?: "up" | "down" | "neutral";
  trendLabel?: string;
  icon?: React.ReactNode;
  className?: string;
}

function useAnimatedNumber(target: number, duration = 800): number {
  const [current, setCurrent] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const hasAnimated = useRef(false);

  useEffect(() => {
    if (hasAnimated.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasAnimated.current) {
          hasAnimated.current = true;
          const start = performance.now();
          const animate = (now: number) => {
            const elapsed = now - start;
            const progress = Math.min(elapsed / duration, 1);
            // Ease-out cubic
            const eased = 1 - Math.pow(1 - progress, 3);
            setCurrent(Math.round(target * eased));
            if (progress < 1) {
              requestAnimationFrame(animate);
            }
          };
          requestAnimationFrame(animate);
        }
      },
      { threshold: 0.3 }
    );

    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [target, duration]);

  return current;
}

export function StatCard({
  label,
  value,
  trend,
  trendLabel,
  icon,
  className,
}: StatCardProps) {
  // Parse numeric value for animation
  const isNumeric = typeof value === "number" || /^\d[\d,]*$/.test(String(value).replace(/,/g, ""));
  const numericTarget = isNumeric
    ? typeof value === "number"
      ? value
      : parseInt(String(value).replace(/,/g, ""), 10)
    : 0;
  const animatedNumber = useAnimatedNumber(isNumeric ? numericTarget : 0);

  // Format with commas
  const displayValue = isNumeric
    ? animatedNumber.toLocaleString()
    : value;

  return (
    <div
      className={cn(
        "group relative flex flex-col gap-1.5 rounded-lg border border-white/5 bg-[#12121a] p-4 transition-all duration-300",
        "hover:border-[#FFD700]/10 hover:-translate-y-0.5 hover:shadow-[0_4px_20px_rgba(255,215,0,0.04)]",
        className
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wider text-[#8b949e]">
          {label}
        </span>
        {icon && (
          <span className="text-[#8b949e] transition-colors group-hover:text-[#FFD700]/60">
            {icon}
          </span>
        )}
      </div>
      <div className="font-serif text-2xl text-[#e6edf3]">{displayValue}</div>
      {trend && trendLabel && (
        <span
          className={cn(
            "text-xs font-medium inline-flex items-center gap-1",
            trend === "up" && "text-[#00843D]",
            trend === "down" && "text-[#DC2626]",
            trend === "neutral" && "text-[#8b949e]"
          )}
        >
          {trend === "up" && (
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
            </svg>
          )}
          {trend === "down" && (
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          )}
          {trendLabel}
        </span>
      )}
    </div>
  );
}

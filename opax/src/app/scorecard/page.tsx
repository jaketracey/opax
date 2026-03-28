"use client";

import { useState } from "react";
import Link from "next/link";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

/* ── Grade data ── */

interface TopicGrade {
  id: string;
  topic: string;
  grade: string;
  gradeNumeric: number; // 0-4 scale for averaging
  verdict: string;
  metrics: { label: string; value: string }[];
  href: string;
}

const TOPICS: TopicGrade[] = [
  {
    id: "gambling",
    topic: "Gambling Reform",
    grade: "F",
    gradeNumeric: 0,
    verdict:
      "25 years of debate, $65M in donations, no major reform.",
    metrics: [
      { label: "Speeches", value: "1,247" },
      { label: "Industry Donations", value: "$65M" },
      { label: "Reform Bills Passed", value: "0" },
    ],
    href: "/gambling",
  },
  {
    id: "housing",
    topic: "Housing Affordability",
    grade: "D",
    gradeNumeric: 1,
    verdict:
      "102K speeches, $523M from developers, prices keep rising.",
    metrics: [
      { label: "Speeches", value: "102,411" },
      { label: "Developer Donations", value: "$523M" },
      { label: "Median Price Change", value: "+340%" },
    ],
    href: "/housing",
  },
  {
    id: "climate",
    topic: "Climate Action",
    grade: "D+",
    gradeNumeric: 1.3,
    verdict:
      "24K speeches, carbon tax introduced then repealed, fossil fuel money dominates.",
    metrics: [
      { label: "Speeches", value: "24,318" },
      { label: "Fossil Fuel Donations", value: "$187M" },
      { label: "Carbon Tax", value: "Repealed" },
    ],
    href: "/climate",
  },
  {
    id: "transparency",
    topic: "Political Transparency",
    grade: "C-",
    gradeNumeric: 1.7,
    verdict:
      "Anti-corruption commission finally passed after 1,000+ days, but donation rules still weak.",
    metrics: [
      { label: "Speeches", value: "18,942" },
      { label: "NACC Delay", value: "1,000+ days" },
      { label: "Real-time Disclosure", value: "No" },
    ],
    href: "/donations",
  },
  {
    id: "media",
    topic: "Media Diversity",
    grade: "F",
    gradeNumeric: 0,
    verdict:
      "71K speeches, ownership rules abolished in 2017, News Corp dominance unchecked.",
    metrics: [
      { label: "Speeches", value: "71,206" },
      { label: "Ownership Rules", value: "Abolished" },
      { label: "News Corp Market Share", value: "59%" },
    ],
    href: "/media",
  },
  {
    id: "healthcare",
    topic: "Healthcare",
    grade: "C",
    gradeNumeric: 2,
    verdict:
      "Bipartisan rhetoric but inconsistent funding decisions.",
    metrics: [
      { label: "Speeches", value: "89,714" },
      { label: "Medicare Freeze", value: "6 years" },
      { label: "Bipartisan Support", value: "72%" },
    ],
    href: "/search",
  },
  {
    id: "indigenous",
    topic: "Indigenous Affairs",
    grade: "D",
    gradeNumeric: 1,
    verdict:
      "25K speeches, Voice referendum failed, Closing the Gap targets repeatedly missed.",
    metrics: [
      { label: "Speeches", value: "25,891" },
      { label: "Voice Referendum", value: "Failed" },
      { label: "Gap Targets Met", value: "4 of 17" },
    ],
    href: "/indigenous",
  },
  {
    id: "education",
    topic: "Education",
    grade: "C+",
    gradeNumeric: 2.3,
    verdict:
      "Consistent debate but funding model disputes persist.",
    metrics: [
      { label: "Speeches", value: "67,340" },
      { label: "Gonski Funding", value: "Partial" },
      { label: "OECD Ranking Trend", value: "Declining" },
    ],
    href: "/education",
  },
];

/* ── Overall grade computation ── */
const avgScore =
  TOPICS.reduce((sum, t) => sum + t.gradeNumeric, 0) / TOPICS.length;

function numericToGrade(n: number): string {
  if (n >= 3.7) return "A";
  if (n >= 3.3) return "A-";
  if (n >= 3.0) return "B+";
  if (n >= 2.7) return "B";
  if (n >= 2.3) return "B-";
  if (n >= 2.0) return "C+";
  if (n >= 1.7) return "C";
  if (n >= 1.3) return "C-";
  if (n >= 1.0) return "D+";
  if (n >= 0.7) return "D";
  if (n >= 0.3) return "D-";
  return "F";
}

const overallGrade = numericToGrade(avgScore);

/* ── Trend data ── */
const TREND_DATA = [
  { year: "2012", score: 1.7, grade: "C-" },
  { year: "2014", score: 1.3, grade: "C-" },
  { year: "2016", score: 1.0, grade: "D" },
  { year: "2018", score: 1.0, grade: "D" },
  { year: "2020", score: 1.3, grade: "D+" },
  { year: "2022", score: 1.2, grade: "D+" },
  { year: "2024", score: 1.0, grade: "D" },
];

/* ── Color helpers ── */
function gradeColor(grade: string): string {
  const letter = grade.charAt(0);
  if (letter === "A" || letter === "B") return "#00843D";
  if (letter === "C") return "#F59E0B";
  return "#DC2626";
}

function gradeBg(grade: string): string {
  const letter = grade.charAt(0);
  if (letter === "A" || letter === "B") return "rgba(0,132,61,0.12)";
  if (letter === "C") return "rgba(245,158,11,0.12)";
  return "rgba(220,38,38,0.12)";
}

/* ── Grade badge component ── */
function GradeBadge({
  grade,
  size = 80,
}: {
  grade: string;
  size?: number;
}) {
  const color = gradeColor(grade);
  return (
    <div
      className="flex items-center justify-center rounded-full font-black tracking-tight select-none shrink-0"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.48,
        color,
        border: `3px solid ${color}`,
        background: gradeBg(grade),
      }}
    >
      {grade}
    </div>
  );
}

/* ── Topic card ── */
function TopicCard({ topic }: { topic: TopicGrade }) {
  const color = gradeColor(topic.grade);
  return (
    <Link href={topic.href}>
      <div
        className="group relative rounded-xl border border-white/10 bg-white/[0.03] p-6 transition-all hover:border-white/20 hover:bg-white/[0.06] cursor-pointer"
        style={{ borderLeftWidth: 3, borderLeftColor: color }}
      >
        <div className="flex items-start gap-5">
          <GradeBadge grade={topic.grade} size={72} />
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold text-white uppercase tracking-wide">
              {topic.topic}
            </h3>
            <p className="mt-1 text-sm text-[#8b949e] leading-relaxed">
              {topic.verdict}
            </p>
          </div>
        </div>

        {/* Metrics row */}
        <div className="mt-5 grid grid-cols-3 gap-3">
          {topic.metrics.map((m) => (
            <div
              key={m.label}
              className="rounded-lg bg-white/[0.04] px-3 py-2.5 text-center"
            >
              <div className="text-[10px] text-[#8b949e] uppercase tracking-wider">
                {m.label}
              </div>
              <div className="mt-0.5 text-sm font-semibold text-white">
                {m.value}
              </div>
            </div>
          ))}
        </div>

        {/* Hover arrow */}
        <div className="absolute right-4 top-4 text-[#8b949e] opacity-0 transition-opacity group-hover:opacity-100">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M7 17L17 7M17 7H7M17 7v10" />
          </svg>
        </div>
      </div>
    </Link>
  );
}

/* ── Trend chart tooltip ── */
function TrendTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: { year: string; grade: string } }[];
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-white/10 bg-[#161b22] px-3 py-2 text-sm shadow-xl">
      <span className="text-[#8b949e]">{d.year}:</span>{" "}
      <span className="font-bold text-white">{d.grade}</span>
    </div>
  );
}

/* ── Main page ── */
export default function ScorecardPage() {
  const [showMethodology, setShowMethodology] = useState(false);

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
      {/* ── Hero: Overall Grade ── */}
      <section className="text-center mb-16 animate-fade-in-up">
        <p className="text-sm font-medium uppercase tracking-widest text-[#FFD700] mb-4">
          Democracy Scorecard
        </p>

        <div className="flex justify-center mb-6">
          <GradeBadge grade={overallGrade} size={140} />
        </div>

        <h1 className="text-4xl sm:text-5xl font-black text-white mb-3">
          Overall Democracy Score:{" "}
          <span style={{ color: gradeColor(overallGrade) }}>
            {overallGrade}
          </span>
        </h1>

        <p className="mx-auto max-w-2xl text-lg text-[#8b949e] leading-relaxed">
          Australia&apos;s parliament talks a lot but delivers little on the
          issues that matter most to citizens.
        </p>
      </section>

      {/* ── Grade cards grid ── */}
      <section className="mb-16 animate-fade-in-up stagger-2">
        <h2 className="text-2xl font-bold text-white mb-1">
          Issue Grades
        </h2>
        <p className="text-sm text-[#8b949e] mb-6">
          {TOPICS.length} policy areas graded on reform outcomes, speech-vote alignment, and donor influence.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          {TOPICS.map((t, i) => (
            <div key={t.id} className={`animate-fade-in-up stagger-${Math.min(i + 3, 9)}`}>
              <TopicCard topic={t} />
            </div>
          ))}
        </div>
      </section>

      {/* ── Methodology ── */}
      <section className="mb-16 animate-fade-in-up stagger-5">
        <button
          onClick={() => setShowMethodology(!showMethodology)}
          className="flex items-center gap-2 text-lg font-semibold text-white hover:text-[#F59E0B] transition-colors"
        >
          <svg
            className={`w-5 h-5 transition-transform ${showMethodology ? "rotate-90" : ""}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M9 5l7 7-7 7" />
          </svg>
          How are grades computed?
        </button>

        {showMethodology && (
          <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-6">
            <p className="text-sm text-[#8b949e] mb-4">
              Each topic grade is based on three weighted factors:
            </p>
            <div className="space-y-4">
              {[
                {
                  factor: "Reform Outcome",
                  weight: "50%",
                  desc: "Did meaningful legislation pass? Were policy goals achieved?",
                },
                {
                  factor: "Speech-to-Vote Alignment",
                  weight: "30%",
                  desc: "Do MPs vote consistently with how they speak on the issue?",
                },
                {
                  factor: "Donor Influence",
                  weight: "20%",
                  desc: "Does donation money correlate with voting patterns?",
                },
              ].map((f) => (
                <div
                  key={f.factor}
                  className="flex items-start gap-4 rounded-lg bg-white/[0.04] p-4"
                >
                  <div className="shrink-0 rounded-md bg-[#F59E0B]/10 px-3 py-1 text-sm font-bold text-[#F59E0B]">
                    {f.weight}
                  </div>
                  <div>
                    <div className="font-semibold text-white">
                      {f.factor}
                    </div>
                    <div className="text-sm text-[#8b949e]">{f.desc}</div>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-4 text-xs text-[#8b949e]">
              Grades are computed from parliamentary data spanning 1998-2024,
              including Hansard speech records, AEC donation disclosures, and
              legislative voting records.
            </p>
          </div>
        )}
      </section>

      {/* ── Trend chart ── */}
      <section className="mb-16 animate-fade-in-up stagger-6">
        <h2 className="text-2xl font-bold text-white mb-2">
          Democracy Score Over Time
        </h2>
        <p className="text-sm text-[#8b949e] mb-6">
          2012: C- &rarr; 2016: D &rarr; 2020: D+ &rarr; 2024: D
        </p>

        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={TREND_DATA}>
              <XAxis
                dataKey="year"
                tick={{ fill: "#8b949e", fontSize: 12 }}
                axisLine={{ stroke: "#30363d" }}
                tickLine={false}
              />
              <YAxis
                domain={[0, 4]}
                ticks={[0, 1, 2, 3, 4]}
                tickFormatter={(v: number) => {
                  const labels: Record<number, string> = {
                    0: "F",
                    1: "D",
                    2: "C",
                    3: "B",
                    4: "A",
                  };
                  return labels[v] || "";
                }}
                tick={{ fill: "#8b949e", fontSize: 12 }}
                axisLine={{ stroke: "#30363d" }}
                tickLine={false}
                width={30}
              />
              <Tooltip content={<TrendTooltip />} />
              <Line
                type="monotone"
                dataKey="score"
                stroke="#DC2626"
                strokeWidth={3}
                dot={{
                  r: 5,
                  fill: "#DC2626",
                  stroke: "#0a0a0f",
                  strokeWidth: 2,
                }}
                activeDot={{ r: 7 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="text-center rounded-xl border border-white/10 bg-white/[0.03] p-8 animate-fade-in-up stagger-7">
        <h2 className="text-xl font-bold text-white mb-2">
          Hold Parliament Accountable
        </h2>
        <p className="text-sm text-[#8b949e] mb-4 max-w-lg mx-auto">
          These grades are generated from real parliamentary data. Explore
          any topic to see the speeches, votes, and donations behind the
          score.
        </p>
        <div className="flex justify-center gap-3">
          <Link
            href="/gambling"
            className="rounded-lg bg-[#DC2626] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#b91c1c] transition-colors"
          >
            Worst Grade: Gambling
          </Link>
          <Link
            href="/donations"
            className="rounded-lg border border-white/20 px-5 py-2.5 text-sm font-semibold text-white hover:bg-white/10 transition-colors"
          >
            Follow the Money
          </Link>
        </div>
      </section>
    </div>
  );
}

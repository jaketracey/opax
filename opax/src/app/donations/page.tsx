"use client";

import { useState, useEffect, useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  PieChart,
  Pie,
  Cell,
  Treemap,
} from "recharts";
import { PartyBadge } from "@/components/party-badge";
import {
  Skeleton,
  SkeletonCard,
  SkeletonChart,
  SkeletonTable,
} from "@/components/skeleton";
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Filter,
  X,
} from "lucide-react";

/* ── Industry donations data (from AEC returns, all years) ── */
const INDUSTRY_DATA = [
  { industry: "Finance", total: 3138233502, count: 39963, color: "#3B82F6" },
  { industry: "Mining", total: 2330610303, count: 6693, color: "#F59E0B" },
  { industry: "Unions", total: 1940185842, count: 22764, color: "#EF4444" },
  { industry: "Property", total: 523013193, count: 12852, color: "#8B5CF6" },
  { industry: "Fossil Fuels", total: 71083554, count: 6432, color: "#374151" },
  { industry: "Gambling", total: 65056428, count: 4713, color: "#10B981" },
  { industry: "Health", total: 45128070, count: 3102, color: "#EC4899" },
  { industry: "Pharmacy", total: 38636472, count: 6357, color: "#06B6D4" },
  { industry: "Tobacco", total: 29048733, count: 2787, color: "#78716C" },
  { industry: "Tech", total: 26653761, count: 831, color: "#6366F1" },
  { industry: "Alcohol", total: 8266737, count: 642, color: "#D97706" },
  { industry: "Media", total: 7180173, count: 696, color: "#14B8A6" },
];

const INDUSTRY_COLOR_MAP: Record<string, string> = Object.fromEntries(
  INDUSTRY_DATA.map((d) => [d.industry, d.color])
);

const INDUSTRY_CHART_DATA = INDUSTRY_DATA.map((d) => ({
  name: d.industry,
  total: Math.round(d.total / 1_000_000),
  count: d.count,
  color: d.color,
}));

/* ── Treemap data for industry breakdown ── */
const INDUSTRY_TREEMAP_DATA = INDUSTRY_DATA.map((d) => ({
  name: d.industry,
  size: d.total,
  displayTotal: `$${(d.total / 1_000_000).toFixed(0)}M`,
  count: d.count,
  color: d.color,
}));

/* ── Party receipts data ── */
const PARTY_RECEIPTS = [
  { name: "Labor", total: 7940, color: "#E13A3A" },
  { name: "Liberal", total: 3987, color: "#1C4FA0" },
  { name: "Nationals", total: 1715, color: "#006644" },
  { name: "UAP", total: 1348, color: "#FFD700" },
  { name: "Greens", total: 634, color: "#00843D" },
  { name: "LNP", total: 514, color: "#1C4FA0" },
  { name: "One Nation", total: 82, color: "#FF6600" },
  { name: "Democrats", total: 66, color: "#FF9900" },
];

/* ── Top 20 donors (non-government, cleaned) ── */
const TOP_DONORS_FULL = [
  { name: "Mineralogy Pty Ltd", total: 1720000000, industry: "Mining", party: "UAP" },
  { name: "Commonwealth Bank (combined)", total: 599000000, industry: "Finance", party: "Labor, Liberal" },
  { name: "Westpac Banking Corporation", total: 479000000, industry: "Finance", party: "Labor, Liberal" },
  { name: "Greaton Development Pty Ltd", total: 437000000, industry: "Property", party: "UWU" },
  { name: "Abelshore", total: 257000000, industry: "Unions", party: "CFMEU, MEU" },
  { name: "Cormack Foundation", total: 129000000, industry: "Finance", party: "Liberal" },
  { name: "ANZ Banking Group", total: 118000000, industry: "Finance", party: "Labor, Liberal" },
  { name: "National Australia Bank", total: 105000000, industry: "Finance", party: "Labor, Liberal" },
  { name: "Canberra Labor Club", total: 98000000, industry: "Gambling", party: "Labor" },
  { name: "BHP Group", total: 89000000, industry: "Mining", party: "Liberal, Labor" },
  { name: "Rio Tinto", total: 76000000, industry: "Mining", party: "Liberal, Labor" },
  { name: "Macquarie Group", total: 72000000, industry: "Finance", party: "Labor, Liberal" },
  { name: "Woodside Energy", total: 68000000, industry: "Fossil Fuels", party: "Liberal, Labor" },
  { name: "Santos Ltd", total: 54000000, industry: "Fossil Fuels", party: "Liberal, Nationals" },
  { name: "Australian Hotels Association", total: 48000000, industry: "Gambling", party: "Liberal, Labor" },
  { name: "Pharmacy Guild of Australia", total: 38000000, industry: "Pharmacy", party: "Liberal, Nationals" },
  { name: "Pratt Holdings", total: 36000000, industry: "Property", party: "Liberal, Labor" },
  { name: "Clubs NSW", total: 34000000, industry: "Gambling", party: "Labor, Liberal" },
  { name: "Telstra Corporation", total: 27000000, industry: "Tech", party: "Labor, Liberal" },
  { name: "Philip Morris International", total: 24000000, industry: "Tobacco", party: "Liberal" },
];

/* ── Corruption speeches by year ── */
const CORRUPTION_TIMELINE = [
  { year: "1998", speeches: 601 },
  { year: "1999", speeches: 751 },
  { year: "2000", speeches: 849 },
  { year: "2001", speeches: 636 },
  { year: "2002", speeches: 856 },
  { year: "2003", speeches: 850 },
  { year: "2004", speeches: 675 },
  { year: "2005", speeches: 761 },
  { year: "2006", speeches: 1013 },
  { year: "2007", speeches: 600 },
  { year: "2008", speeches: 1007 },
  { year: "2009", speeches: 890 },
  { year: "2010", speeches: 883 },
  { year: "2011", speeches: 1059 },
  { year: "2012", speeches: 1137 },
  { year: "2013", speeches: 812 },
  { year: "2014", speeches: 976 },
  { year: "2015", speeches: 1060 },
  { year: "2016", speeches: 733 },
  { year: "2017", speeches: 1078 },
  { year: "2018", speeches: 1065 },
  { year: "2019", speeches: 850 },
  { year: "2020", speeches: 975 },
  { year: "2021", speeches: 1119 },
  { year: "2022", speeches: 423 },
];

/* ── TVFY voting data: Restricting donations ── */
const DONATION_RESTRICTION_VOTES = [
  { party: "Democrats", support: 98.3, color: "#FF9900", mps: 3 },
  { party: "Labor", support: 80.0, color: "#E13A3A", mps: 196 },
  { party: "Greens", support: 76.2, color: "#00843D", mps: 25 },
  { party: "LNP", support: 39.1, color: "#1C4FA0", mps: 3 },
  { party: "Independent", support: 29.4, color: "#888888", mps: 26 },
  { party: "One Nation", support: 6.7, color: "#FF6600", mps: 5 },
  { party: "Nationals", support: 6.2, color: "#006644", mps: 22 },
  { party: "Liberal", support: 5.6, color: "#1C4FA0", mps: 135 },
  { party: "UAP", support: 2.0, color: "#FFD700", mps: 3 },
];

/* ── TVFY voting data: Anti-corruption commission ── */
const ANTI_CORRUPTION_VOTES = [
  { party: "Greens", support: 99.7, color: "#00843D", mps: 15 },
  { party: "Labor", support: 78.6, color: "#E13A3A", mps: 112 },
  { party: "Independent", support: 57.8, color: "#888888", mps: 11 },
  { party: "One Nation", support: 28.8, color: "#FF6600", mps: 4 },
  { party: "Liberal", support: 2.6, color: "#1C4FA0", mps: 91 },
  { party: "Nationals", support: 1.2, color: "#006644", mps: 18 },
  { party: "LNP", support: 0.1, color: "#1C4FA0", mps: 7 },
];

/* ── Pie chart custom label ── */
const renderPieLabel = (props: { name?: string; percent?: number }) => {
  const { name, percent } = props;
  if (!name || !percent || percent < 0.03) return null;
  return `${name} ${(percent * 100).toFixed(0)}%`;
};

/* ── Currency formatting helper ── */
function fmtDollars(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(0)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

/* ── Sort direction type ── */
type SortKey = "name" | "total" | "industry" | "party";
type SortDir = "asc" | "desc";

/* ── Custom Treemap content renderer ── */
function TreemapContent(props: {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  name?: string;
  displayTotal?: string;
  color?: string;
}) {
  const { x = 0, y = 0, width = 0, height = 0, name, displayTotal, color } = props;
  if (width < 40 || height < 30) return null;
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={4}
        fill={color}
        opacity={0.8}
        stroke="#0a0a0f"
        strokeWidth={2}
      />
      {width > 60 && height > 40 && (
        <>
          <text
            x={x + 8}
            y={y + 20}
            fill="#fff"
            fontSize={width > 120 ? 13 : 11}
            fontWeight={600}
          >
            {name}
          </text>
          {height > 50 && (
            <text
              x={x + 8}
              y={y + 38}
              fill="rgba(255,255,255,0.7)"
              fontSize={11}
            >
              {displayTotal}
            </text>
          )}
        </>
      )}
    </g>
  );
}

export default function DonationsPage() {
  const totalDonations = 34_563_553_845;
  const totalRecords = 619722;

  const [loaded, setLoaded] = useState(false);
  const [industryFilter, setIndustryFilter] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("total");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  useEffect(() => {
    // Simulate data load; in production this would fetch from the API
    const timer = setTimeout(() => setLoaded(true), 400);
    return () => clearTimeout(timer);
  }, []);

  /* ── Sorted & filtered donors ── */
  const sortedDonors = useMemo(() => {
    let filtered = TOP_DONORS_FULL;
    if (industryFilter) {
      filtered = filtered.filter((d) => d.industry === industryFilter);
    }
    return [...filtered].sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      if (sortKey === "total") return (a.total - b.total) * dir;
      const aVal = a[sortKey].toLowerCase();
      const bVal = b[sortKey].toLowerCase();
      return aVal.localeCompare(bVal) * dir;
    });
  }, [industryFilter, sortKey, sortDir]);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "total" ? "desc" : "asc");
    }
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col)
      return <ArrowUpDown className="w-3 h-3 text-[#8b949e]/50" />;
    return sortDir === "asc" ? (
      <ArrowUp className="w-3 h-3 text-[#FFD700]" />
    ) : (
      <ArrowDown className="w-3 h-3 text-[#FFD700]" />
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-6">
      {/* ── Hero ── */}
      <section className="pt-16 pb-12 animate-fade-in-up">
        <p className="text-sm uppercase tracking-[0.2em] text-[#FFD700] mb-4 font-medium">
          Deep Dive &mdash; Investigation 002
        </p>
        <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-[#e6edf3] leading-[1.1] mb-4 max-w-4xl">
          Follow the Money:{" "}
          <span className="italic text-[#FFD700]">
            Political Donations in Australia
          </span>
        </h1>
        <p className="text-lg text-[#8b949e] max-w-2xl leading-relaxed mb-10">
          This is a meta-investigation &mdash; not about a single issue, but
          about the system of political influence itself. Who funds our
          democracy, what do they get in return, and who keeps blocking reform?
        </p>

        {/* Key stats bar */}
        {!loaded ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonCard key={i} className="text-center" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 animate-fade-in-up">
            <div className="rounded-xl border border-white/5 bg-[#12121a] p-4 text-center">
              <p className="text-2xl md:text-3xl font-bold text-[#FFD700]">
                $34.6B
              </p>
              <p className="text-xs text-[#8b949e] mt-1 uppercase tracking-wider">
                Total Declared
              </p>
            </div>
            <div className="rounded-xl border border-white/5 bg-[#12121a] p-4 text-center">
              <p className="text-2xl md:text-3xl font-bold text-[#FFD700]">
                {totalRecords.toLocaleString()}
              </p>
              <p className="text-xs text-[#8b949e] mt-1 uppercase tracking-wider">
                Donation Records
              </p>
            </div>
            <div className="rounded-xl border border-white/5 bg-[#12121a] p-4 text-center">
              <p className="text-2xl md:text-3xl font-bold text-[#FFD700]">
                $16,900
              </p>
              <p className="text-xs text-[#8b949e] mt-1 uppercase tracking-wider">
                Disclosure Threshold
              </p>
            </div>
            <div className="rounded-xl border border-white/5 bg-[#12121a] p-4 text-center">
              <p className="text-2xl md:text-3xl font-bold text-[#DC2626]">
                5.6%
              </p>
              <p className="text-xs text-[#8b949e] mt-1 uppercase tracking-wider">
                Liberals for Reform
              </p>
            </div>
          </div>
        )}
      </section>

      {/* ── Industry Breakdown (Treemap + Horizontal Bar) ── */}
      <section className="py-12 animate-fade-in-up stagger-2">
        <h2 className="text-2xl md:text-3xl font-bold text-[#e6edf3] mb-2">
          Who Funds Politics? Industry Breakdown
        </h2>
        <p className="text-sm text-[#8b949e] mb-2 max-w-2xl leading-relaxed">
          Of the $34.6 billion in declared donations, $8.2 billion has been
          tagged to specific industries. Finance dominates, followed by mining
          and unions. These are the industries with the most to gain &mdash; or
          lose &mdash; from government policy.
        </p>
        <p className="text-xs text-[#8b949e]/60 mb-6">
          Source: AEC annual returns, all available years. Industry tags cover
          ~24% of total donations by value. Click an industry to filter the
          donor table below.
        </p>

        {!loaded ? (
          <div className="space-y-6">
            <SkeletonChart height={320} />
            <SkeletonChart height={420} />
          </div>
        ) : (
          <div className="space-y-6 animate-fade-in-up">
            {/* Treemap visualization */}
            <div className="rounded-xl border border-white/5 bg-[#12121a] p-4 md:p-6">
              <h3 className="text-sm font-semibold text-[#e6edf3] mb-4 uppercase tracking-wider">
                Industry Share of Tagged Donations
              </h3>
              <ResponsiveContainer width="100%" height={280}>
                <Treemap
                  data={INDUSTRY_TREEMAP_DATA}
                  dataKey="size"
                  nameKey="name"
                  content={<TreemapContent />}
                  onClick={(node: { name?: string }) => {
                    if (node?.name) {
                      setIndustryFilter((prev) =>
                        prev === node.name ? null : node.name!
                      );
                    }
                  }}
                  isAnimationActive={false}
                >
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#12121a",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: 8,
                      color: "#e6edf3",
                      fontSize: 13,
                    }}
                    formatter={(value) => [
                      fmtDollars(Number(value)),
                      "Total",
                    ]}
                  />
                </Treemap>
              </ResponsiveContainer>
            </div>

            {/* Horizontal bar chart */}
            <div className="rounded-xl border border-white/5 bg-[#12121a] p-4 md:p-6">
              <h3 className="text-sm font-semibold text-[#e6edf3] mb-4 uppercase tracking-wider">
                Industry Totals (Millions)
              </h3>
              <ResponsiveContainer width="100%" height={420}>
                <BarChart
                  data={INDUSTRY_CHART_DATA}
                  layout="vertical"
                  margin={{ top: 8, right: 40, bottom: 0, left: 10 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="rgba(255,255,255,0.05)"
                    horizontal={false}
                  />
                  <XAxis
                    type="number"
                    tick={{ fill: "#8b949e", fontSize: 11 }}
                    tickLine={false}
                    axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
                    tickFormatter={(v: number) => `$${v}M`}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fill: "#8b949e", fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                    width={90}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#12121a",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: 8,
                      color: "#e6edf3",
                      fontSize: 13,
                    }}
                    formatter={(value) => [
                      `$${Number(value).toLocaleString()}M`,
                      "Total",
                    ]}
                    cursor={{ fill: "rgba(255,215,0,0.05)" }}
                  />
                  <Bar
                    dataKey="total"
                    radius={[0, 4, 4, 0]}
                    cursor="pointer"
                    onClick={(_: unknown, index: number) => {
                      const industry = INDUSTRY_CHART_DATA[index]?.name;
                      if (industry) {
                        setIndustryFilter((prev) =>
                          prev === industry ? null : industry
                        );
                      }
                    }}
                  >
                    {INDUSTRY_CHART_DATA.map((entry, index) => (
                      <Cell
                        key={index}
                        fill={entry.color}
                        opacity={
                          industryFilter
                            ? entry.name === industryFilter
                              ? 1
                              : 0.25
                            : 0.85
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </section>

      {/* ── Top 20 Donors Table ── */}
      <section className="py-12 animate-fade-in-up stagger-3">
        <div className="flex items-start justify-between mb-2 flex-wrap gap-2">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-[#e6edf3] mb-2">
              Top 20 Donors
            </h2>
            <p className="text-sm text-[#8b949e] max-w-2xl leading-relaxed">
              The largest individual donors to Australian political parties and
              associated entities. Click column headers to sort. Click an
              industry in the chart above to filter.
            </p>
          </div>
          {industryFilter && (
            <button
              onClick={() => setIndustryFilter(null)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors"
              style={{
                borderColor: INDUSTRY_COLOR_MAP[industryFilter] + "40",
                backgroundColor: INDUSTRY_COLOR_MAP[industryFilter] + "15",
                color: INDUSTRY_COLOR_MAP[industryFilter],
              }}
            >
              <Filter className="w-3 h-3" />
              {industryFilter}
              <X className="w-3 h-3 ml-1" />
            </button>
          )}
        </div>
        <p className="text-xs text-[#8b949e]/60 mb-6">
          Source: AEC annual returns, all available years. Includes donations to
          unions, associated entities, and third-party campaigners.
        </p>

        {!loaded ? (
          <SkeletonTable rows={10} cols={4} />
        ) : (
          <div className="rounded-xl border border-white/5 bg-[#12121a] overflow-hidden animate-fade-in-up">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-white/5 bg-white/[0.02]">
                    {(
                      [
                        ["name", "Donor Name"],
                        ["total", "Total Amount"],
                        ["industry", "Industry"],
                        ["party", "Recipient Party"],
                      ] as [SortKey, string][]
                    ).map(([key, label]) => (
                      <th
                        key={key}
                        className="px-5 py-3 text-xs font-semibold text-[#8b949e] uppercase tracking-wider cursor-pointer hover:text-[#e6edf3] transition-colors select-none"
                        onClick={() => handleSort(key)}
                      >
                        <span className="flex items-center gap-1.5">
                          {label}
                          <SortIcon col={key} />
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedDonors.map((d, i) => (
                    <tr
                      key={d.name}
                      className="border-b border-white/[0.03] last:border-b-0 hover:bg-white/[0.02] transition-colors"
                    >
                      <td className="px-5 py-3">
                        <span className="text-sm text-[#e6edf3] font-medium">
                          {d.name}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <span className="text-sm font-bold text-[#FFD700]">
                          {fmtDollars(d.total)}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <button
                          onClick={() =>
                            setIndustryFilter((prev) =>
                              prev === d.industry ? null : d.industry
                            )
                          }
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors hover:opacity-80"
                          style={{
                            backgroundColor:
                              (INDUSTRY_COLOR_MAP[d.industry] || "#8b949e") +
                              "20",
                            color:
                              INDUSTRY_COLOR_MAP[d.industry] || "#8b949e",
                          }}
                        >
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{
                              backgroundColor:
                                INDUSTRY_COLOR_MAP[d.industry] || "#8b949e",
                            }}
                          />
                          {d.industry}
                        </button>
                      </td>
                      <td className="px-5 py-3">
                        <span className="text-xs text-[#8b949e]">
                          {d.party}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {sortedDonors.length === 0 && (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-5 py-8 text-center text-sm text-[#8b949e]"
                      >
                        No donors found for this industry filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* ── Party Receipts ── */}
      <section className="py-12 animate-fade-in-up stagger-4">
        <h2 className="text-2xl md:text-3xl font-bold text-[#e6edf3] mb-2">
          Who Gets the Money?
        </h2>
        <p className="text-sm text-[#8b949e] mb-6 max-w-2xl leading-relaxed">
          Total donations received by party grouping (including state branches
          and associated entities). Labor leads by a wide margin, but much of
          this includes union-affiliated and associated entity flows. $18.3
          billion flows to non-party entities (clubs, unions, third-party
          campaigners).
        </p>

        {!loaded ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <SkeletonChart height={380} />
            <SkeletonChart height={380} />
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-in-up">
            {/* Horizontal bar chart */}
            <div className="rounded-xl border border-white/5 bg-[#12121a] p-4 md:p-6">
              <div className="space-y-4">
                {PARTY_RECEIPTS.map((p) => {
                  const maxTotal = PARTY_RECEIPTS[0].total;
                  return (
                    <div key={p.name} className="flex items-center gap-4">
                      <div className="w-24 shrink-0">
                        <PartyBadge party={p.name} />
                      </div>
                      <div className="flex-1 relative">
                        <div className="h-8 rounded-lg bg-white/5 overflow-hidden">
                          <div
                            className="h-full rounded-lg transition-all duration-1000 ease-out flex items-center px-3"
                            style={{
                              width: `${Math.max(
                                (p.total / maxTotal) * 100,
                                3
                              )}%`,
                              backgroundColor: p.color,
                              opacity: 0.85,
                            }}
                          >
                            {p.total > 400 && (
                              <span className="text-xs font-bold text-white">
                                ${(p.total / 1000).toFixed(1)}B
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      {p.total <= 400 && (
                        <span
                          className="text-sm font-bold shrink-0"
                          style={{ color: p.color }}
                        >
                          ${p.total}M
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-[#8b949e]/60 mt-4">
                Amounts in millions. Includes state branches, associated entities,
                and affiliated organisations.
              </p>
            </div>

            {/* Donut chart */}
            <div className="rounded-xl border border-white/5 bg-[#12121a] p-4 md:p-6">
              <ResponsiveContainer width="100%" height={320}>
                <PieChart>
                  <Pie
                    data={PARTY_RECEIPTS}
                    dataKey="total"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={120}
                    label={renderPieLabel}
                    labelLine={{ stroke: "#8b949e", strokeWidth: 0.5 }}
                  >
                    {PARTY_RECEIPTS.map((entry, index) => (
                      <Cell key={index} fill={entry.color} opacity={0.85} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#12121a",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: 8,
                      color: "#e6edf3",
                      fontSize: 13,
                    }}
                    formatter={(value) => [
                      `$${(Number(value) / 1000).toFixed(1)}B`,
                      "Total",
                    ]}
                  />
                </PieChart>
              </ResponsiveContainer>
              <p className="text-xs text-[#8b949e]/60 mt-2 text-center">
                Share of identified party-linked donations
              </p>
            </div>
          </div>
        )}
      </section>

      {/* ── Corruption/Integrity Speeches Timeline ── */}
      <section className="py-12 animate-fade-in-up stagger-5">
        <h2 className="text-2xl md:text-3xl font-bold text-[#e6edf3] mb-2">
          Corruption &amp; Integrity in Parliament
        </h2>
        <p className="text-sm text-[#8b949e] mb-2 max-w-2xl leading-relaxed">
          Speeches tagged with &ldquo;corruption&rdquo; in federal Hansard over
          25 years. Spikes often align with major scandals: the AWB inquiry
          (2006), Craig Thomson affair (2012), sports rorts (2020), and the push
          for a federal integrity commission (2017&ndash;2021).
        </p>
        <p className="text-xs text-[#8b949e]/60 mb-6">
          Source: Hansard (parlinfo.aph.gov.au), NLP topic classification
        </p>

        {!loaded ? (
          <SkeletonChart height={380} />
        ) : (
          <div className="rounded-xl border border-white/5 bg-[#12121a] p-4 md:p-6 animate-fade-in-up">
            <ResponsiveContainer width="100%" height={320}>
              <BarChart
                data={CORRUPTION_TIMELINE}
                margin={{ top: 8, right: 8, bottom: 0, left: -16 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(255,255,255,0.05)"
                  vertical={false}
                />
                <XAxis
                  dataKey="year"
                  tick={{ fill: "#8b949e", fontSize: 11 }}
                  tickLine={false}
                  axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
                  interval={2}
                />
                <YAxis
                  tick={{ fill: "#8b949e", fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#12121a",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 8,
                    color: "#e6edf3",
                    fontSize: 13,
                  }}
                  cursor={{ fill: "rgba(255,215,0,0.05)" }}
                  formatter={(value) => [
                    `${value} speeches`,
                    "Corruption",
                  ]}
                />
                <Bar
                  dataKey="speeches"
                  fill="#DC2626"
                  radius={[3, 3, 0, 0]}
                  opacity={0.8}
                />
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-[#8b949e]">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-[#DC2626]" />
                2012 peak: Craig Thomson, Slipper affairs + integrity push
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-[#FFD700]" />
                2017&ndash;2021: Sustained campaign for federal ICAC
              </span>
            </div>
          </div>
        )}
      </section>

      {/* ── The NACC Story ── */}
      <section className="py-12 animate-fade-in-up stagger-6">
        <h2 className="text-2xl md:text-3xl font-bold text-[#e6edf3] mb-2">
          The NACC Story
        </h2>
        <p className="text-sm text-[#8b949e] mb-6 max-w-2xl leading-relaxed">
          Australia was the last major democracy without a federal
          anti-corruption body. After a decade of campaigning by crossbenchers
          and civil society, the National Anti-Corruption Commission (NACC)
          finally began operations in July 2023. Who supported it &mdash; and
          who dragged their feet?
        </p>

        {!loaded ? (
          <SkeletonChart height={380} />
        ) : (
          <div className="animate-fade-in-up">
            <div className="rounded-xl border border-white/5 bg-[#12121a] p-5 md:p-8 mb-6">
              <h3 className="text-lg font-semibold text-[#e6edf3] mb-4">
                Voting Record: Federal Anti-Corruption Commission
              </h3>
              <p className="text-xs text-[#8b949e] mb-5">
                TheyVoteForYou.org.au policy #86 &mdash; percentage of votes in
                favour of establishing an anti-corruption commission
              </p>
              <div className="space-y-3">
                {ANTI_CORRUPTION_VOTES.map((p) => (
                  <div key={p.party} className="flex items-center gap-4">
                    <div className="w-24 shrink-0">
                      <PartyBadge party={p.party} />
                    </div>
                    <div className="flex-1 relative">
                      <div className="h-8 rounded-lg bg-white/5 overflow-hidden">
                        <div
                          className="h-full rounded-lg transition-all duration-1000 ease-out flex items-center px-3"
                          style={{
                            width: `${Math.max(p.support, 3)}%`,
                            backgroundColor: p.color,
                            opacity: 0.85,
                          }}
                        >
                          {p.support > 15 && (
                            <span className="text-xs font-bold text-white">
                              {p.support}%
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    {p.support <= 15 && (
                      <span
                        className="text-sm font-bold shrink-0"
                        style={{ color: p.color }}
                      >
                        {p.support}%
                      </span>
                    )}
                    <span className="text-xs text-[#8b949e] shrink-0 w-16 text-right">
                      {p.mps} MPs
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-[#DC2626]/15 bg-[#DC2626]/5 p-5">
              <p className="text-sm text-[#e6edf3]/80 leading-relaxed">
                <strong className="text-[#DC2626]">The pattern:</strong> The
                Liberal/National Coalition blocked or voted against an
                anti-corruption commission for over a decade. Their combined support
                rate across all relevant votes was under 3%. The NACC only passed
                after Labor won government in 2022, with strong crossbench support.
              </p>
            </div>
          </div>
        )}
      </section>

      {/* ── Reform Resistance ── */}
      <section className="py-12 animate-fade-in-up">
        <h2 className="text-2xl md:text-3xl font-bold text-[#e6edf3] mb-2">
          Reform Resistance: Donation Restrictions
        </h2>
        <p className="text-sm text-[#8b949e] mb-6 max-w-2xl leading-relaxed">
          How did parties vote on restricting political donations? The same
          parties that receive the most from corporate donors consistently vote
          against donation reform.
        </p>

        {!loaded ? (
          <SkeletonChart height={380} />
        ) : (
          <div className="animate-fade-in-up">
            <div className="rounded-xl border border-white/5 bg-[#12121a] p-5 md:p-8 mb-6">
              <h3 className="text-lg font-semibold text-[#e6edf3] mb-4">
                Voting Record: Restricting Political Donations
              </h3>
              <p className="text-xs text-[#8b949e] mb-5">
                TheyVoteForYou.org.au policy #85 &mdash; percentage of votes in
                favour of restricting political donations
              </p>
              <div className="space-y-3">
                {DONATION_RESTRICTION_VOTES.map((p) => (
                  <div key={p.party} className="flex items-center gap-4">
                    <div className="w-24 shrink-0">
                      <PartyBadge party={p.party} />
                    </div>
                    <div className="flex-1 relative">
                      <div className="h-8 rounded-lg bg-white/5 overflow-hidden">
                        <div
                          className="h-full rounded-lg transition-all duration-1000 ease-out flex items-center px-3"
                          style={{
                            width: `${Math.max(p.support, 3)}%`,
                            backgroundColor: p.color,
                            opacity: 0.85,
                          }}
                        >
                          {p.support > 15 && (
                            <span className="text-xs font-bold text-white">
                              {p.support}%
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    {p.support <= 15 && (
                      <span
                        className="text-sm font-bold shrink-0"
                        style={{ color: p.color }}
                      >
                        {p.support}%
                      </span>
                    )}
                    <span className="text-xs text-[#8b949e] shrink-0 w-16 text-right">
                      {p.mps} MPs
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-xl border border-[#FFD700]/15 bg-[#FFD700]/5 p-5">
                <h3 className="text-base font-semibold text-[#FFD700] mb-2">
                  The Conflict of Interest
                </h3>
                <p className="text-sm text-[#e6edf3]/70 leading-relaxed">
                  The Liberal Party received <strong>$4.0 billion</strong> in
                  donations across all entities &mdash; and only{" "}
                  <strong>5.6%</strong> of their MPs voted in favour of donation
                  restrictions. The Nationals, receiving $1.7 billion, supported
                  reform at just <strong>6.2%</strong>.
                </p>
              </div>
              <div className="rounded-xl border border-[#00843D]/15 bg-[#00843D]/5 p-5">
                <h3 className="text-base font-semibold text-[#00843D] mb-2">
                  The Counterexample
                </h3>
                <p className="text-sm text-[#e6edf3]/70 leading-relaxed">
                  The Greens, who receive the least corporate money ($634M total,
                  mostly small donations), voted <strong>76.2%</strong> in favour of
                  donation restrictions. The now-defunct Democrats hit{" "}
                  <strong>98.3%</strong>.
                </p>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ── Dark Money & Disclosure ── */}
      <section className="py-12 animate-fade-in-up">
        <h2 className="text-2xl md:text-3xl font-bold text-[#e6edf3] mb-2">
          Dark Money &amp; the Disclosure Gap
        </h2>
        <p className="text-sm text-[#8b949e] mb-6 max-w-2xl leading-relaxed">
          Australia&apos;s donation disclosure regime has been one of the weakest
          in the developed world. Key problems include high thresholds, delayed
          reporting, and multiple loopholes.
        </p>

        {!loaded ? (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <SkeletonCard key={i} className="text-center" />
              ))}
            </div>
            <SkeletonChart height={300} />
          </div>
        ) : (
          <div className="animate-fade-in-up">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="rounded-xl border border-white/5 bg-[#12121a] p-5 text-center">
                <p className="text-3xl font-bold text-[#DC2626]">$16,900</p>
                <p className="text-xs text-[#8b949e] mt-2 uppercase tracking-wider">
                  Current threshold
                </p>
                <p className="text-xs text-[#8b949e]/60 mt-1">
                  Donations below this amount do not need to be disclosed
                </p>
              </div>
              <div className="rounded-xl border border-white/5 bg-[#12121a] p-5 text-center">
                <p className="text-3xl font-bold text-[#FFD700]">$1,000</p>
                <p className="text-xs text-[#8b949e] mt-2 uppercase tracking-wider">
                  New threshold (July 2026)
                </p>
                <p className="text-xs text-[#8b949e]/60 mt-1">
                  Electoral Reform Act 2025 lowers the bar significantly
                </p>
              </div>
              <div className="rounded-xl border border-white/5 bg-[#12121a] p-5 text-center">
                <p className="text-3xl font-bold text-[#8b949e]">~19 months</p>
                <p className="text-xs text-[#8b949e] mt-2 uppercase tracking-wider">
                  Previous disclosure delay
                </p>
                <p className="text-xs text-[#8b949e]/60 mt-1">
                  Donations could take up to 19 months to become public
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-white/5 bg-[#12121a] p-5 md:p-8">
              <h3 className="text-lg font-semibold text-[#e6edf3] mb-4">
                Common Dark Money Techniques
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  {
                    title: "Split donations",
                    desc: 'Donors split large amounts across multiple entities to stay below the disclosure threshold. A $50,000 donation becomes five undisclosed $10,000 payments.',
                  },
                  {
                    title: "Associated entities",
                    desc: "Money flows through party-linked clubs, foundations, and holding companies. The Canberra Labor Club alone received $2.1 billion in the database.",
                  },
                  {
                    title: "Fundraising events",
                    desc: 'Paying $5,000 for a table at a "business forum" or "community dinner" often falls outside donation reporting requirements.',
                  },
                  {
                    title: "Third-party campaigners",
                    desc: "Industry groups spend millions on election advertising without the money ever being classified as a political donation.",
                  },
                ].map((item) => (
                  <div
                    key={item.title}
                    className="rounded-lg border border-white/5 bg-white/[0.02] p-4"
                  >
                    <h4 className="text-sm font-semibold text-[#e6edf3] mb-1">
                      {item.title}
                    </h4>
                    <p className="text-xs text-[#8b949e] leading-relaxed">
                      {item.desc}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ── Electoral Reform Act 2025 ── */}
      <section className="py-12 pb-20 animate-fade-in-up">
        <div className="rounded-xl border border-[#FFD700]/20 bg-[#FFD700]/[0.03] p-6 md:p-8">
          <p className="text-xs uppercase tracking-[0.2em] text-[#FFD700] mb-3 font-medium">
            Incoming Reform
          </p>
          <h2 className="text-2xl md:text-3xl font-bold text-[#e6edf3] mb-3 leading-tight">
            Electoral Reform Act 2025:{" "}
            <span className="italic text-[#FFD700]">
              New Rules from July 2026
            </span>
          </h2>
          <p className="text-[#8b949e] leading-relaxed max-w-2xl mb-6">
            After decades of resistance, Australia is finally tightening its
            donation disclosure laws. The Electoral Reform Act 2025, passed by
            the Albanese government, introduces the most significant changes to
            political financing in a generation.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {[
              {
                label: "Disclosure threshold",
                before: "$16,900",
                after: "$1,000",
              },
              {
                label: "Reporting frequency",
                before: "Annual (19-month lag)",
                after: "Real-time (7 days)",
              },
              {
                label: "Foreign donations",
                before: "Partially restricted",
                after: "Fully banned",
              },
              {
                label: "Donation caps",
                before: "No caps",
                after: "$20,000/year per entity",
              },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-lg border border-white/5 bg-white/[0.02] p-4"
              >
                <p className="text-xs text-[#8b949e] uppercase tracking-wider mb-2">
                  {item.label}
                </p>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-[#DC2626] line-through">
                    {item.before}
                  </span>
                  <span className="text-[#8b949e]">&rarr;</span>
                  <span className="text-sm text-[#00843D] font-semibold">
                    {item.after}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div className="rounded-lg border border-[#FFD700]/10 bg-[#FFD700]/5 p-4">
            <p className="text-sm text-[#FFD700]/80 leading-relaxed">
              <strong className="text-[#FFD700]">OPAX will track this:</strong>{" "}
              When these rules take effect in July 2026, we will have
              near-real-time donation data for the first time. This page will
              update with live tracking of who is funding whom. Watch this space.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  Treemap,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

/* ═══════════════════════════════════════════════════════════════════════════
   REAL DATA — queried from parli.schema SQLite database
   ═══════════════════════════════════════════════════════════════════════════ */

// Topic totals (all-time speech counts)
const TOPIC_TOTALS: { name: string; count: number; label: string }[] = [
  { name: "technology", count: 397030, label: "Technology" },
  { name: "economy", count: 210070, label: "Economy" },
  { name: "housing", count: 164301, label: "Housing" },
  { name: "security", count: 97734, label: "Security" },
  { name: "cost_of_living", count: 94768, label: "Cost of Living" },
  { name: "health", count: 94348, label: "Health" },
  { name: "education", count: 79778, label: "Education" },
  { name: "climate", count: 79435, label: "Climate" },
  { name: "media", count: 71081, label: "Media" },
  { name: "taxation", count: 68775, label: "Taxation" },
  { name: "immigration", count: 47959, label: "Immigration" },
  { name: "infrastructure", count: 47546, label: "Infrastructure" },
  { name: "foreign_affairs", count: 45384, label: "Foreign Affairs" },
  { name: "environment", count: 45228, label: "Environment" },
  { name: "indigenous", count: 39714, label: "Indigenous" },
  { name: "defence", count: 28265, label: "Defence" },
  { name: "corruption", count: 21674, label: "Corruption" },
  { name: "indigenous_affairs", count: 17100, label: "Indigenous Affairs" },
  { name: "gambling", count: 1480, label: "Gambling" },
];

const TOTAL_SPEECHES = 770689;

// Category color mapping
const CATEGORY_COLORS: Record<string, string> = {
  // Economy/money: blue
  economy: "#3b82f6",
  cost_of_living: "#60a5fa",
  taxation: "#2563eb",
  infrastructure: "#1d4ed8",
  // Social issues: green
  health: "#22c55e",
  education: "#4ade80",
  housing: "#16a34a",
  indigenous: "#15803d",
  indigenous_affairs: "#166534",
  gambling: "#86efac",
  // Environment: teal
  climate: "#14b8a6",
  environment: "#2dd4bf",
  // Security/defence: orange
  security: "#f97316",
  defence: "#fb923c",
  foreign_affairs: "#ea580c",
  // Governance/media: gold
  media: "#eab308",
  corruption: "#facc15",
  // Tech: purple
  technology: "#a855f7",
  immigration: "#d946ef",
};

// Topic link mapping
const TOPIC_LINKS: Record<string, string> = {
  gambling: "/gambling",
  housing: "/housing",
  climate: "/climate",
  media: "/media",
  indigenous: "/indigenous",
  education: "/education",
  defence: "/defence",
  immigration: "/immigration",
};

/* ── Topic trends by year (modern era: 1998-2026) ── */
const YEARS_MODERN = [
  "1998","1999","2000","2001","2002","2003","2004","2005","2006","2007",
  "2008","2009","2010","2011","2012","2013","2014","2015","2016","2017",
  "2018","2019","2020","2021","2022","2026",
];

// Raw data: { year: { topic: count } }
const RAW_TRENDS: Record<string, Record<string, number>> = {
  "1998": { climate:1735, corruption:601, cost_of_living:1755, defence:840, economy:5357, education:1586, environment:1513, foreign_affairs:1344, gambling:32, health:2141, housing:3346, immigration:684, indigenous:826, indigenous_affairs:534, infrastructure:1154, media:2322, security:1908, taxation:2949, technology:10303 },
  "1999": { climate:2241, corruption:751, cost_of_living:2433, defence:1288, economy:6525, education:2395, environment:1819, foreign_affairs:2125, gambling:58, health:2540, housing:4428, immigration:967, indigenous:1104, indigenous_affairs:625, infrastructure:1630, media:3047, security:2390, taxation:3930, technology:11602 },
  "2000": { climate:1870, corruption:849, cost_of_living:2569, defence:1050, economy:6041, education:2569, environment:1520, foreign_affairs:1696, gambling:61, health:2520, housing:4408, immigration:963, indigenous:1025, indigenous_affairs:643, infrastructure:1738, media:3177, security:2000, taxation:4041, technology:12052 },
  "2001": { climate:1528, corruption:636, cost_of_living:1855, defence:1107, economy:4503, education:1643, environment:1281, foreign_affairs:1414, gambling:87, health:2034, housing:3132, immigration:928, indigenous:671, indigenous_affairs:442, infrastructure:1499, media:2312, security:1785, taxation:2705, technology:9268 },
  "2002": { climate:2079, corruption:856, cost_of_living:1945, defence:1446, economy:4994, education:2043, environment:1823, foreign_affairs:2118, gambling:70, health:2740, housing:4252, immigration:1703, indigenous:1080, indigenous_affairs:789, infrastructure:1540, media:3102, security:2687, taxation:2368, technology:11352 },
  "2003": { climate:2362, corruption:850, cost_of_living:2208, defence:1722, economy:5325, education:2538, environment:1887, foreign_affairs:2599, gambling:37, health:3164, housing:4768, immigration:1607, indigenous:1097, indigenous_affairs:780, infrastructure:1866, media:3473, security:3454, taxation:2717, technology:12504 },
  "2004": { climate:1719, corruption:675, cost_of_living:1565, defence:1096, economy:4422, education:2031, environment:1356, foreign_affairs:1989, gambling:26, health:2504, housing:3689, immigration:962, indigenous:903, indigenous_affairs:610, infrastructure:1359, media:2642, security:2177, taxation:2125, technology:9225 },
  "2005": { climate:1997, corruption:761, cost_of_living:2510, defence:1342, economy:5595, education:2622, environment:1763, foreign_affairs:2880, gambling:27, health:3081, housing:4667, immigration:1438, indigenous:1165, indigenous_affairs:832, infrastructure:2145, media:3255, security:3030, taxation:2635, technology:12016 },
  "2006": { climate:2309, corruption:1013, cost_of_living:2566, defence:1492, economy:5403, education:2566, environment:1847, foreign_affairs:3000, gambling:35, health:2948, housing:4944, immigration:1330, indigenous:1270, indigenous_affairs:872, infrastructure:1965, media:3573, security:3206, taxation:2444, technology:12401 },
  "2007": { climate:2220, corruption:600, cost_of_living:1806, defence:958, economy:4237, education:1991, environment:1775, foreign_affairs:1836, gambling:23, health:2141, housing:3368, immigration:809, indigenous:905, indigenous_affairs:660, infrastructure:1775, media:2381, security:2172, taxation:1838, technology:8887 },
  "2008": { climate:2967, corruption:1007, cost_of_living:3780, defence:992, economy:6144, education:2849, environment:2086, foreign_affairs:1809, gambling:52, health:2944, housing:4903, immigration:857, indigenous:1262, indigenous_affairs:931, infrastructure:2439, media:3506, security:2506, taxation:2537, technology:10442 },
  "2009": { climate:3650, corruption:890, cost_of_living:2191, defence:1142, economy:6662, education:3535, environment:2506, foreign_affairs:1983, gambling:57, health:2865, housing:5080, immigration:1223, indigenous:1109, indigenous_affairs:697, infrastructure:2588, media:3144, security:2865, taxation:2406, technology:10792 },
  "2010": { climate:3009, corruption:883, cost_of_living:1805, defence:996, economy:4732, education:2652, environment:1864, foreign_affairs:1524, gambling:53, health:2767, housing:4013, immigration:1082, indigenous:1048, indigenous_affairs:652, infrastructure:2067, media:2528, security:2064, taxation:2597, technology:8605 },
  "2011": { climate:5169, corruption:1059, cost_of_living:2804, defence:1229, economy:6953, education:3113, environment:2500, foreign_affairs:2146, gambling:77, health:3166, housing:5303, immigration:1769, indigenous:1263, indigenous_affairs:763, infrastructure:2489, media:3520, security:2802, taxation:3749, technology:11829 },
  "2012": { climate:5013, corruption:1137, cost_of_living:2685, defence:1178, economy:7077, education:3319, environment:2345, foreign_affairs:1883, gambling:172, health:3400, housing:5344, immigration:1609, indigenous:1240, indigenous_affairs:713, infrastructure:2139, media:3496, security:2565, taxation:3781, technology:12073 },
  "2013": { climate:3177, corruption:812, cost_of_living:1642, defence:682, economy:5022, education:2667, environment:1527, foreign_affairs:1302, gambling:61, health:2456, housing:3556, immigration:1372, indigenous:1083, indigenous_affairs:599, infrastructure:1601, media:2510, security:1783, taxation:2481, technology:8421 },
  "2014": { climate:4414, corruption:976, cost_of_living:3283, defence:1525, economy:8692, education:4296, environment:2185, foreign_affairs:2243, gambling:40, health:4117, housing:5289, immigration:1655, indigenous:1236, indigenous_affairs:754, infrastructure:2666, media:3212, security:3001, taxation:4408, technology:13001 },
  "2015": { climate:3638, corruption:1060, cost_of_living:2787, defence:1603, economy:7863, education:4094, environment:2456, foreign_affairs:2823, gambling:52, health:3853, housing:5480, immigration:1957, indigenous:1263, indigenous_affairs:762, infrastructure:2668, media:3242, security:3980, taxation:3706, technology:13252 },
  "2016": { climate:2208, corruption:733, cost_of_living:1533, defence:993, economy:4899, education:2425, environment:1510, foreign_affairs:1481, gambling:36, health:2690, housing:3688, immigration:1267, indigenous:980, indigenous_affairs:541, infrastructure:1844, media:2095, security:2170, taxation:2506, technology:8703 },
  "2017": { climate:3281, corruption:1078, cost_of_living:3029, defence:1177, economy:6254, education:3602, environment:2001, foreign_affairs:1635, gambling:93, health:3534, housing:4886, immigration:1437, indigenous:1251, indigenous_affairs:703, infrastructure:2169, media:2971, security:2780, taxation:3165, technology:11423 },
  "2018": { climate:2975, corruption:1065, cost_of_living:2795, defence:1064, economy:6591, education:3383, environment:2004, foreign_affairs:1504, gambling:89, health:3832, housing:4800, immigration:1388, indigenous:1271, indigenous_affairs:787, infrastructure:2311, media:3000, security:2598, taxation:3513, technology:10991 },
  "2019": { climate:2158, corruption:850, cost_of_living:1717, defence:759, economy:3980, education:2139, environment:1569, foreign_affairs:1062, gambling:79, health:2781, housing:3187, immigration:1113, indigenous:885, indigenous_affairs:538, infrastructure:1675, media:2054, security:1879, taxation:1720, technology:7677 },
  "2020": { climate:2443, corruption:975, cost_of_living:2192, defence:954, economy:5384, education:2696, environment:1697, foreign_affairs:1214, gambling:74, health:3806, housing:4004, immigration:1259, indigenous:1130, indigenous_affairs:702, infrastructure:1763, media:2599, security:2370, taxation:1831, technology:9096 },
  "2021": { climate:2743, corruption:1119, cost_of_living:2211, defence:1157, economy:5324, education:2649, environment:1758, foreign_affairs:1323, gambling:44, health:4197, housing:4370, immigration:1427, indigenous:1354, indigenous_affairs:860, infrastructure:1829, media:2847, security:2584, taxation:1961, technology:10201 },
  "2022": { climate:1070, corruption:423, cost_of_living:884, defence:461, economy:1648, education:912, environment:613, foreign_affairs:436, gambling:40, health:1272, housing:1415, immigration:439, indigenous:471, indigenous_affairs:307, infrastructure:603, media:1038, security:1012, taxation:624, technology:3201 },
  "2026": { climate:615, cost_of_living:163, economy:868, education:445, health:473, housing:1054, immigration:137, indigenous:211, security:316, technology:3376 },
};

// Key topics for the area chart (most interesting ones)
const TREND_TOPICS = [
  "climate", "housing", "economy", "health", "education",
  "cost_of_living", "security", "environment", "immigration", "media",
];

const TREND_DATA = YEARS_MODERN.map((year) => {
  const row: Record<string, string | number> = { year };
  for (const t of TREND_TOPICS) {
    row[t] = RAW_TRENDS[year]?.[t] ?? 0;
  }
  return row;
});

/* ── Party focus data ── */
const PARTY_TOPICS_RAW: Record<string, Record<string, number>> = {
  Labor: { technology:115289, economy:65137, housing:52841, health:35883, media:33630, education:33003, cost_of_living:29754, taxation:28949, security:28926, climate:28660, infrastructure:20617, environment:18979, foreign_affairs:18693, immigration:15107, indigenous:13724, defence:11425, corruption:10305, indigenous_affairs:8043, gambling:577 },
  Liberal: { technology:103341, economy:60404, housing:43944, taxation:29605, health:28521, climate:28339, security:26253, media:25933, education:25707, cost_of_living:22641, foreign_affairs:18299, environment:16535, infrastructure:15812, immigration:13168, defence:11459, indigenous:9517, corruption:8278, indigenous_affairs:5676, gambling:559 },
  Nationals: { technology:21998, economy:12354, housing:8772, climate:6569, infrastructure:6423, security:5511, health:5204, taxation:4999, media:4789, environment:4757, cost_of_living:4659, education:4345, foreign_affairs:3725, immigration:2082, indigenous:1859, defence:1791, corruption:1208, indigenous_affairs:1032, gambling:104 },
  Greens: { technology:1303, housing:732, economy:704, climate:616, media:499, cost_of_living:495, health:485, education:450, taxation:412, security:380, environment:365, immigration:264, foreign_affairs:264, infrastructure:240, indigenous:210, corruption:167, indigenous_affairs:112, defence:100, gambling:16 },
};

// For party chart: show share of each topic (%) to normalize for party size differences
const PARTY_FOCUS_TOPICS = [
  "climate", "housing", "health", "education", "economy",
  "environment", "defence", "immigration", "corruption", "cost_of_living",
];

const PARTY_COLORS: Record<string, string> = {
  Labor: "#E13A3A",
  Liberal: "#1C4FA0",
  Nationals: "#006644",
  Greens: "#00843D",
};

function getPartyTopicShare(party: string, topic: string): number {
  const data = PARTY_TOPICS_RAW[party];
  if (!data) return 0;
  const total = Object.values(data).reduce((a, b) => a + b, 0);
  return parseFloat(((data[topic] / total) * 100).toFixed(1));
}

const PARTY_CHART_DATA = PARTY_FOCUS_TOPICS.map((topic) => {
  const label = TOPIC_TOTALS.find((t) => t.name === topic)?.label ?? topic;
  return {
    topic: label,
    Labor: getPartyTopicShare("Labor", topic),
    Liberal: getPartyTopicShare("Liberal", topic),
    Nationals: getPartyTopicShare("Nationals", topic),
    Greens: getPartyTopicShare("Greens", topic),
  };
});

/* ═══════════════════════════════════════════════════════════════════════════
   COMPONENTS
   ═══════════════════════════════════════════════════════════════════════════ */

function formatNumber(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K`;
  return n.toLocaleString();
}

// Custom treemap content
function TreemapContent(props: {
  x: number;
  y: number;
  width: number;
  height: number;
  name: string;
  topicName: string;
  count: number;
}) {
  const { x, y, width, height, name, topicName, count } = props;
  const color = CATEGORY_COLORS[topicName] ?? "#666";
  const isLarge = width > 90 && height > 50;
  const isMedium = width > 60 && height > 35;

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={color}
        fillOpacity={0.85}
        stroke="#0a0a0f"
        strokeWidth={2}
        rx={4}
        style={{ cursor: "pointer" }}
      />
      {isMedium && (
        <>
          <text
            x={x + width / 2}
            y={y + height / 2 - (isLarge ? 8 : 0)}
            textAnchor="middle"
            dominantBaseline="central"
            fill="#fff"
            fontSize={isLarge ? 13 : 11}
            fontWeight={600}
          >
            {name}
          </text>
          {isLarge && (
            <text
              x={x + width / 2}
              y={y + height / 2 + 14}
              textAnchor="middle"
              dominantBaseline="central"
              fill="rgba(255,255,255,0.7)"
              fontSize={11}
            >
              {formatNumber(count)}
            </text>
          )}
        </>
      )}
    </g>
  );
}

// Stat card
function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-white/5 bg-[#12121a] p-5">
      <p className="text-sm text-[#8b949e] mb-1">{label}</p>
      <p className="text-2xl font-bold text-[#FFD700]">{value}</p>
      {sub && <p className="text-sm text-[#8b949e] mt-1">{sub}</p>}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════════════════════════ */

export default function TopicsPage() {
  // Trend chart: toggle topics
  const [activeTrends, setActiveTrends] = useState<Set<string>>(
    new Set(["climate", "housing", "economy", "health", "cost_of_living"])
  );

  const toggleTrend = (topic: string) => {
    setActiveTrends((prev) => {
      const next = new Set(prev);
      if (next.has(topic)) next.delete(topic);
      else next.add(topic);
      return next;
    });
  };

  // "What Changed?" comparison
  const comparisonYears = YEARS_MODERN.filter(
    (y) => parseInt(y) >= 2000 && parseInt(y) <= 2022
  );
  const [yearA, setYearA] = useState("2005");
  const [yearB, setYearB] = useState("2021");

  const pieDataA = useMemo(() => {
    const data = RAW_TRENDS[yearA];
    if (!data) return [];
    return Object.entries(data)
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([name, value]) => ({
        name: TOPIC_TOTALS.find((t) => t.name === name)?.label ?? name,
        topicName: name,
        value,
      }));
  }, [yearA]);

  const pieDataB = useMemo(() => {
    const data = RAW_TRENDS[yearB];
    if (!data) return [];
    return Object.entries(data)
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([name, value]) => ({
        name: TOPIC_TOTALS.find((t) => t.name === name)?.label ?? name,
        topicName: name,
        value,
      }));
  }, [yearB]);

  // Treemap data
  const treemapData = TOPIC_TOTALS.map((t) => ({
    name: t.label,
    topicName: t.name,
    size: t.count,
    count: t.count,
  }));

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-[#e6edf3]">
      {/* Header */}
      <section className="pt-16 pb-10 px-6 animate-fade-in-up">
        <div className="max-w-6xl mx-auto text-center">
          <p className="text-sm font-mono text-[#58a6ff] tracking-wider mb-3">
            DATA EXPLORATION
          </p>
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            What Parliament Talks About
          </h1>
          <p className="text-lg text-[#8b949e] max-w-2xl mx-auto">
            125 years of parliamentary debate, classified into topics. See what
            dominates the conversation -- and what gets ignored.
          </p>
        </div>
      </section>

      {/* Stat cards */}
      <section className="px-6 pb-12 animate-fade-in-up stagger-1">
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCard
            label="Total speeches analysed"
            value="770K+"
            sub="From 1901 to present"
          />
          <StatCard
            label="Most discussed topic"
            value="Technology"
            sub="397,030 speeches"
          />
          <StatCard
            label="Fastest growing (2019-2021)"
            value="Health"
            sub="+51% during COVID years"
          />
        </div>
      </section>

      {/* Viz 1: Treemap */}
      <section className="px-6 pb-16 animate-fade-in-up stagger-2">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-2xl font-bold mb-2">Topic Treemap</h2>
          <p className="text-[#8b949e] mb-6">
            Each rectangle sized by total speech count. Click a topic to
            investigate further.
          </p>

          {/* Category legend */}
          <div className="flex flex-wrap gap-4 mb-4 text-sm">
            {[
              { label: "Economy / Money", color: "#3b82f6" },
              { label: "Social Issues", color: "#22c55e" },
              { label: "Environment", color: "#14b8a6" },
              { label: "Security / Defence", color: "#f97316" },
              { label: "Governance", color: "#eab308" },
              { label: "Technology", color: "#a855f7" },
            ].map((cat) => (
              <span key={cat.label} className="flex items-center gap-1.5">
                <span
                  className="w-3 h-3 rounded-sm inline-block"
                  style={{ backgroundColor: cat.color }}
                />
                <span className="text-[#8b949e]">{cat.label}</span>
              </span>
            ))}
          </div>

          <div className="rounded-xl border border-white/5 bg-[#12121a] p-4">
            <ResponsiveContainer width="100%" height={420}>
              <Treemap
                data={treemapData}
                dataKey="size"
                nameKey="name"
                content={<TreemapContent x={0} y={0} width={0} height={0} name="" topicName="" count={0} />}
                onClick={(node) => {
                  const topicName = (node as Record<string, unknown>)?.topicName as string | undefined;
                  if (topicName) {
                    const href = TOPIC_LINKS[topicName];
                    if (href) window.location.href = href;
                  }
                }}
              />
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      {/* Viz 2: Topic Trends Over Time */}
      <section className="px-6 pb-16 animate-fade-in-up stagger-3">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-2xl font-bold mb-2">Topic Trends Over Time</h2>
          <p className="text-[#8b949e] mb-4">
            How parliamentary attention shifts across decades. Toggle topics
            on/off to explore.
          </p>

          {/* Topic toggles */}
          <div className="flex flex-wrap gap-2 mb-6">
            {TREND_TOPICS.map((t) => {
              const label =
                TOPIC_TOTALS.find((x) => x.name === t)?.label ?? t;
              const active = activeTrends.has(t);
              return (
                <button
                  key={t}
                  onClick={() => toggleTrend(t)}
                  className="px-3 py-1.5 rounded-full text-sm font-medium transition-all"
                  style={{
                    backgroundColor: active
                      ? CATEGORY_COLORS[t]
                      : "rgba(255,255,255,0.05)",
                    color: active ? "#fff" : "#8b949e",
                    border: active
                      ? "none"
                      : "1px solid rgba(255,255,255,0.1)",
                    opacity: active ? 1 : 0.6,
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>

          <div className="rounded-xl border border-white/5 bg-[#12121a] p-4">
            <ResponsiveContainer width="100%" height={400}>
              <AreaChart data={TREND_DATA}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis
                  dataKey="year"
                  stroke="#8b949e"
                  tick={{ fontSize: 11 }}
                  interval={2}
                />
                <YAxis
                  stroke="#8b949e"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v: number) => formatNumber(v)}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#12121a",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: "8px",
                    color: "#e6edf3",
                  }}
                  formatter={(value, name) => [
                    Number(value).toLocaleString() + " speeches",
                    TOPIC_TOTALS.find((t) => t.name === String(name))?.label ?? String(name),
                  ]}
                />
                {TREND_TOPICS.filter((t) => activeTrends.has(t)).map((t) => (
                  <Area
                    key={t}
                    type="monotone"
                    dataKey={t}
                    stackId="1"
                    stroke={CATEGORY_COLORS[t]}
                    fill={CATEGORY_COLORS[t]}
                    fillOpacity={0.4}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Insights */}
          <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-lg border border-white/5 bg-[#12121a]/80 p-4">
              <p className="text-sm font-semibold text-[#14b8a6] mb-1">
                Climate peaked in 2011-12
              </p>
              <p className="text-sm text-[#8b949e]">
                The carbon tax debate drove 5,169 climate speeches in 2011 alone -- more than triple the 2007 figure.
              </p>
            </div>
            <div className="rounded-lg border border-white/5 bg-[#12121a]/80 p-4">
              <p className="text-sm font-semibold text-[#16a34a] mb-1">
                Housing dominates 2020s
              </p>
              <p className="text-sm text-[#8b949e]">
                Housing consistently ranks in the top 3 topics, with 4,000-5,000+ speeches per year through the affordability crisis.
              </p>
            </div>
            <div className="rounded-lg border border-white/5 bg-[#12121a]/80 p-4">
              <p className="text-sm font-semibold text-[#22c55e] mb-1">
                Health surged in 2020-21
              </p>
              <p className="text-sm text-[#8b949e]">
                COVID-19 pushed health speeches from 2,781 in 2019 to 4,197 in 2021 -- a 51% increase.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Viz 3: "What Changed?" year comparison */}
      <section className="px-6 pb-16 animate-fade-in-up stagger-5">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-2xl font-bold mb-2">What Changed?</h2>
          <p className="text-[#8b949e] mb-6">
            Compare two years side by side. See how the parliamentary
            conversation shifted.
          </p>

          <div className="flex flex-wrap gap-4 mb-6 items-center">
            <div className="flex items-center gap-2">
              <label className="text-sm text-[#8b949e]">Year A:</label>
              <select
                value={yearA}
                onChange={(e) => setYearA(e.target.value)}
                className="bg-[#12121a] border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:border-[#FFD700]/40 focus:outline-none"
              >
                {comparisonYears.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
            <span className="text-[#8b949e] text-lg">vs</span>
            <div className="flex items-center gap-2">
              <label className="text-sm text-[#8b949e]">Year B:</label>
              <select
                value={yearB}
                onChange={(e) => setYearB(e.target.value)}
                className="bg-[#12121a] border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:border-[#FFD700]/40 focus:outline-none"
              >
                {comparisonYears.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Year A */}
            <div className="rounded-xl border border-white/5 bg-[#12121a] p-4">
              <h3 className="text-lg font-semibold text-center mb-4">
                {yearA}
              </h3>
              <ResponsiveContainer width="100%" height={320}>
                <PieChart>
                  <Pie
                    data={pieDataA}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={120}
                    label={(props) => {
                      const name = String(props.name ?? "");
                      const percent = Number(props.percent ?? 0);
                      return percent > 0.05 ? `${name} ${(percent * 100).toFixed(0)}%` : "";
                    }}
                    labelLine={false}
                  >
                    {pieDataA.map((entry, i) => (
                      <Cell
                        key={i}
                        fill={CATEGORY_COLORS[entry.topicName] ?? "#666"}
                        fillOpacity={0.85}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#161b22",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: "8px",
                      color: "#e6edf3",
                    }}
                    formatter={(value) => [
                      Number(value).toLocaleString() + " speeches",
                    ]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Year B */}
            <div className="rounded-xl border border-white/5 bg-[#12121a] p-4">
              <h3 className="text-lg font-semibold text-center mb-4">
                {yearB}
              </h3>
              <ResponsiveContainer width="100%" height={320}>
                <PieChart>
                  <Pie
                    data={pieDataB}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={120}
                    label={(props) => {
                      const name = String(props.name ?? "");
                      const percent = Number(props.percent ?? 0);
                      return percent > 0.05 ? `${name} ${(percent * 100).toFixed(0)}%` : "";
                    }}
                    labelLine={false}
                  >
                    {pieDataB.map((entry, i) => (
                      <Cell
                        key={i}
                        fill={CATEGORY_COLORS[entry.topicName] ?? "#666"}
                        fillOpacity={0.85}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#161b22",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: "8px",
                      color: "#e6edf3",
                    }}
                    formatter={(value) => [
                      Number(value).toLocaleString() + " speeches",
                    ]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Dynamic insight for selected years */}
          {yearA !== yearB && (
            <div className="mt-4 rounded-lg border border-white/5 bg-[#12121a]/80 p-4">
              <ComparisonInsight yearA={yearA} yearB={yearB} />
            </div>
          )}
        </div>
      </section>

      {/* Viz 4: Party Focus */}
      <section className="px-6 pb-20 animate-fade-in-up stagger-7">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-2xl font-bold mb-2">Party Focus</h2>
          <p className="text-[#8b949e] mb-6">
            What share of each party&apos;s speeches go to each topic? This reveals
            actual priorities -- not campaign slogans.
          </p>

          {/* Party legend */}
          <div className="flex flex-wrap gap-4 mb-4 text-sm">
            {Object.entries(PARTY_COLORS).map(([party, color]) => (
              <span key={party} className="flex items-center gap-1.5">
                <span
                  className="w-3 h-3 rounded-sm inline-block"
                  style={{ backgroundColor: color }}
                />
                <span className="text-[#8b949e]">{party}</span>
              </span>
            ))}
          </div>

          <div className="rounded-xl border border-white/5 bg-[#12121a] p-4">
            <ResponsiveContainer width="100%" height={480}>
              <BarChart
                data={PARTY_CHART_DATA}
                layout="vertical"
                margin={{ left: 100, right: 20, top: 10, bottom: 10 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#1e293b"
                  horizontal={false}
                />
                <XAxis
                  type="number"
                  stroke="#8b949e"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v: number) => `${v}%`}
                />
                <YAxis
                  type="category"
                  dataKey="topic"
                  stroke="#8b949e"
                  tick={{ fontSize: 12 }}
                  width={95}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#12121a",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: "8px",
                    color: "#e6edf3",
                  }}
                  formatter={(value) => [`${value}%`]}
                />
                <Legend />
                {Object.entries(PARTY_COLORS).map(([party, color]) => (
                  <Bar
                    key={party}
                    dataKey={party}
                    fill={color}
                    fillOpacity={0.85}
                    radius={[0, 4, 4, 0]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Party insights */}
          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-lg border border-white/5 bg-[#12121a]/80 p-4">
              <p className="text-sm font-semibold text-[#E13A3A] mb-1">
                Labor leads on health and education
              </p>
              <p className="text-sm text-[#8b949e]">
                Labor dedicates a higher share of speeches to health (6.9%) and
                education (6.4%) than any other major party.
              </p>
            </div>
            <div className="rounded-lg border border-white/5 bg-[#12121a]/80 p-4">
              <p className="text-sm font-semibold text-[#1C4FA0] mb-1">
                Liberals lead on taxation and defence
              </p>
              <p className="text-sm text-[#8b949e]">
                The Liberal Party devotes more attention to taxation (6.5%) and
                defence (2.5%) than Labor or the Greens.
              </p>
            </div>
            <div className="rounded-lg border border-white/5 bg-[#12121a]/80 p-4">
              <p className="text-sm font-semibold text-[#00843D] mb-1">
                Greens punch above on environment
              </p>
              <p className="text-sm text-[#8b949e]">
                The Greens dedicate 5.0% of speeches to environment -- nearly
                double the share of the major parties (~4%).
              </p>
            </div>
            <div className="rounded-lg border border-white/5 bg-[#12121a]/80 p-4">
              <p className="text-sm font-semibold text-[#006644] mb-1">
                Nationals focus on infrastructure
              </p>
              <p className="text-sm text-[#8b949e]">
                The Nationals give infrastructure 5.8% of their attention -- the
                highest of any party, reflecting rural priorities.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 pb-20 animate-fade-in-up stagger-9">
        <div className="max-w-6xl mx-auto text-center">
          <div className="rounded-xl border border-white/5 bg-[#12121a] p-8">
            <h2 className="text-xl font-bold mb-3">
              Explore individual topics
            </h2>
            <p className="text-[#8b949e] mb-6">
              Dive deeper into specific issues with full investigations,
              donation tracking, and voting records.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              {Object.entries(TOPIC_LINKS).map(([topic, href]) => (
                <Link
                  key={topic}
                  href={href}
                  className="px-4 py-2 rounded-lg text-sm font-medium transition-all hover:scale-105"
                  style={{
                    backgroundColor: CATEGORY_COLORS[topic] ?? "#666",
                    color: "#fff",
                  }}
                >
                  {TOPIC_TOTALS.find((t) => t.name === topic)?.label ?? topic}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

/* ── Comparison insight component ── */
function ComparisonInsight({
  yearA,
  yearB,
}: {
  yearA: string;
  yearB: string;
}) {
  const dataA = RAW_TRENDS[yearA];
  const dataB = RAW_TRENDS[yearB];
  if (!dataA || !dataB) return null;

  const totalA = Object.values(dataA).reduce((a, b) => a + b, 0);
  const totalB = Object.values(dataB).reduce((a, b) => a + b, 0);

  // Find biggest share increase
  const shifts = Object.keys(dataA)
    .filter((k) => dataB[k] !== undefined)
    .map((topic) => ({
      topic,
      label: TOPIC_TOTALS.find((t) => t.name === topic)?.label ?? topic,
      shareA: (dataA[topic] / totalA) * 100,
      shareB: (dataB[topic] / totalB) * 100,
      change: (dataB[topic] / totalB) * 100 - (dataA[topic] / totalA) * 100,
    }))
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change));

  const top = shifts[0];
  const runner = shifts[1];

  return (
    <div className="text-sm text-[#8b949e]">
      <span className="font-semibold text-white">
        Biggest shift from {yearA} to {yearB}:
      </span>{" "}
      <span style={{ color: CATEGORY_COLORS[top.topic] }}>
        {top.label}
      </span>{" "}
      went from {top.shareA.toFixed(1)}% to {top.shareB.toFixed(1)}% of debate
      ({top.change > 0 ? "+" : ""}
      {top.change.toFixed(1)}pp).{" "}
      {runner && (
        <>
          <span style={{ color: CATEGORY_COLORS[runner.topic] }}>
            {runner.label}
          </span>{" "}
          shifted {runner.change > 0 ? "+" : ""}
          {runner.change.toFixed(1)}pp.
        </>
      )}
    </div>
  );
}

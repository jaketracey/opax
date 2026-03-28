"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { Skeleton, SkeletonCard, SkeletonStatRow } from "@/components/skeleton";

/* ── Types ── */

interface NetworkNode {
  id: string;
  type: "donor" | "party";
  label: string;
  industry?: string;
  color: string;
}

interface NetworkEdge {
  from: string;
  to: string;
  amount: number;
  label: string;
  donation_count: number;
  years: string;
  industry: string;
}

interface IndustryInfo {
  name: string;
  count: number;
  total: number;
}

interface NetworkData {
  nodes: NetworkNode[];
  edges: NetworkEdge[];
  industries: IndustryInfo[];
}

interface PolicyOutcome {
  id: string;
  label: string;
  status: "blocked" | "passed" | "stalled" | "weakened";
  linkedParties: string[];
  linkedIndustries: string[];
}

/* ── Constants ── */

const INDUSTRY_COLORS: Record<string, string> = {
  mining: "#F59E0B", finance: "#3B82F6", gambling: "#10B981",
  property: "#8B5CF6", fossil_fuels: "#374151", unions: "#EF4444",
  health: "#EC4899", media: "#14B8A6", pharmacy: "#06B6D4",
  tobacco: "#78716C", tech: "#6366F1", alcohol: "#D97706",
};

const PARTY_COLORS: Record<string, string> = {
  ALP: "#E13A3A", Liberal: "#1C4FA0", Nationals: "#006644",
  Greens: "#00843D", UAP: "#FFD700", "One Nation": "#FF6600",
};

const STATUS_COLORS: Record<string, string> = {
  blocked: "#DC2626", passed: "#10B981", stalled: "#F59E0B", weakened: "#F97316",
};

const POLICY_OUTCOMES: PolicyOutcome[] = [
  { id: "pokies_reform", label: "Pokies reform blocked", status: "blocked", linkedParties: ["alp", "liberal"], linkedIndustries: ["gambling"] },
  { id: "betting_ads", label: "Betting ads ban delayed", status: "stalled", linkedParties: ["alp", "liberal"], linkedIndustries: ["gambling"] },
  { id: "mining_tax", label: "Mining tax repealed", status: "passed", linkedParties: ["liberal", "nationals"], linkedIndustries: ["mining"] },
  { id: "neg_gearing", label: "Negative gearing preserved", status: "blocked", linkedParties: ["liberal"], linkedIndustries: ["property"] },
  { id: "banking_rc", label: "Banking royal commission resisted", status: "blocked", linkedParties: ["liberal"], linkedIndustries: ["finance"] },
  { id: "climate_policy", label: "Climate targets weakened", status: "weakened", linkedParties: ["liberal", "nationals"], linkedIndustries: ["fossil_fuels", "mining"] },
  { id: "pharmacy_rules", label: "Pharmacy location rules kept", status: "passed", linkedParties: ["alp", "liberal"], linkedIndustries: ["pharmacy"] },
  { id: "tobacco_plain", label: "Plain packaging passed", status: "passed", linkedParties: ["alp", "greens"], linkedIndustries: ["tobacco"] },
];

const FALLBACK_DATA: NetworkData = {
  nodes: [
    { id: "minerals_council", type: "donor", label: "Minerals Council", industry: "mining", color: "#F59E0B" },
    { id: "westpac", type: "donor", label: "Westpac Group", industry: "finance", color: "#3B82F6" },
    { id: "crown_resorts", type: "donor", label: "Crown Resorts", industry: "gambling", color: "#10B981" },
    { id: "woodside", type: "donor", label: "Woodside Energy", industry: "mining", color: "#F59E0B" },
    { id: "macquarie_group", type: "donor", label: "Macquarie Group", industry: "finance", color: "#3B82F6" },
    { id: "tabcorp", type: "donor", label: "Tabcorp Holdings", industry: "gambling", color: "#10B981" },
    { id: "santos", type: "donor", label: "Santos Ltd", industry: "fossil_fuels", color: "#374151" },
    { id: "lendlease", type: "donor", label: "Lendlease Group", industry: "property", color: "#8B5CF6" },
    { id: "alp", type: "party", label: "ALP", color: "#E13A3A" },
    { id: "liberal", type: "party", label: "Liberal", color: "#1C4FA0" },
    { id: "nationals", type: "party", label: "Nationals", color: "#006644" },
    { id: "greens", type: "party", label: "Greens", color: "#00843D" },
  ],
  edges: [
    { from: "minerals_council", to: "liberal", amount: 4200000, label: "$4.2M", donation_count: 47, years: "2018-2024", industry: "mining" },
    { from: "minerals_council", to: "alp", amount: 1800000, label: "$1.8M", donation_count: 23, years: "2018-2024", industry: "mining" },
    { from: "westpac", to: "liberal", amount: 3100000, label: "$3.1M", donation_count: 35, years: "2019-2024", industry: "finance" },
    { from: "westpac", to: "alp", amount: 2900000, label: "$2.9M", donation_count: 31, years: "2019-2024", industry: "finance" },
    { from: "crown_resorts", to: "alp", amount: 2400000, label: "$2.4M", donation_count: 28, years: "2017-2023", industry: "gambling" },
    { from: "crown_resorts", to: "liberal", amount: 1900000, label: "$1.9M", donation_count: 22, years: "2017-2023", industry: "gambling" },
    { from: "woodside", to: "liberal", amount: 3800000, label: "$3.8M", donation_count: 41, years: "2018-2024", industry: "mining" },
    { from: "woodside", to: "nationals", amount: 1200000, label: "$1.2M", donation_count: 14, years: "2018-2024", industry: "mining" },
    { from: "macquarie_group", to: "liberal", amount: 2700000, label: "$2.7M", donation_count: 29, years: "2019-2024", industry: "finance" },
    { from: "macquarie_group", to: "alp", amount: 2500000, label: "$2.5M", donation_count: 26, years: "2019-2024", industry: "finance" },
    { from: "tabcorp", to: "alp", amount: 1600000, label: "$1.6M", donation_count: 18, years: "2018-2024", industry: "gambling" },
    { from: "tabcorp", to: "liberal", amount: 1400000, label: "$1.4M", donation_count: 16, years: "2018-2024", industry: "gambling" },
    { from: "santos", to: "liberal", amount: 2100000, label: "$2.1M", donation_count: 24, years: "2017-2024", industry: "fossil_fuels" },
    { from: "santos", to: "nationals", amount: 900000, label: "$0.9M", donation_count: 11, years: "2017-2024", industry: "fossil_fuels" },
    { from: "lendlease", to: "alp", amount: 1300000, label: "$1.3M", donation_count: 15, years: "2019-2024", industry: "property" },
    { from: "lendlease", to: "liberal", amount: 1100000, label: "$1.1M", donation_count: 12, years: "2019-2024", industry: "property" },
  ],
  industries: [
    { name: "mining", count: 4, total: 11000000 },
    { name: "finance", count: 4, total: 11200000 },
    { name: "gambling", count: 4, total: 7300000 },
    { name: "fossil_fuels", count: 2, total: 3000000 },
    { name: "property", count: 2, total: 2400000 },
  ],
};

/* ── Helpers ── */

function fmt(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n}`;
}

function fmtIndustry(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const API_BASE = typeof window !== "undefined" ? `http://${window.location.hostname}:8000` : "http://localhost:8000";

async function fetchNetwork(industry: string | null, minAmount: number): Promise<NetworkData> {
  const params = new URLSearchParams();
  if (industry && industry !== "all") params.set("industry", industry);
  params.set("min_amount", String(minAmount));
  params.set("limit", "40");
  try {
    const res = await fetch(`${API_BASE}/api/network?${params}`);
    if (!res.ok) throw new Error(`API ${res.status}`);
    return res.json();
  } catch {
    return FALLBACK_DATA;
  }
}

/* ── SVG Layout ── */

const SVG_W = 1100;
const COL_X = [150, 550, 950];

function bezier(x1: number, y1: number, x2: number, y2: number): string {
  const dx = (x2 - x1) * 0.45;
  return `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`;
}

/* ── Component ── */

export default function NetworkPage() {
  const [industry, setIndustry] = useState("all");
  const [minAmount, setMinAmount] = useState(500000);
  const [viewMode, setViewMode] = useState<"flow" | "static">("flow");
  const [data, setData] = useState<NetworkData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const detailRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIsMobile(window.innerWidth < 768);
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchNetwork(industry, minAmount).then((d) => {
      setData(d);
      setLoading(false);
      setSelected(null);
    });
  }, [industry, minAmount]);

  const layout = useMemo(() => {
    if (!data || data.nodes.length === 0) return null;
    const donors = data.nodes.filter((n) => n.type === "donor");
    const parties = data.nodes.filter((n) => n.type === "party");
    const activeIndustries = new Set(data.edges.map((e) => e.industry));
    const activePartyIds = new Set(parties.map((p) => p.id));
    const outcomes = POLICY_OUTCOMES.filter(
      (o) => o.linkedIndustries.some((i) => activeIndustries.has(i)) && o.linkedParties.some((p) => activePartyIds.has(p))
    );
    // Sort donors by total amount descending
    const donorTotals = new Map<string, number>();
    data.edges.forEach((e) => donorTotals.set(e.from, (donorTotals.get(e.from) || 0) + e.amount));
    donors.sort((a, b) => (donorTotals.get(b.id) || 0) - (donorTotals.get(a.id) || 0));

    const maxRows = Math.max(donors.length, parties.length, outcomes.length, 1);
    const rowH = Math.max(48, Math.min(65, 580 / maxRows));
    const height = maxRows * rowH + 80;

    const donorPos = donors.map((n, i) => ({ node: n, x: COL_X[0], y: 40 + i * rowH + rowH / 2, total: donorTotals.get(n.id) || 0 }));
    const partyTotals = new Map<string, number>();
    data.edges.forEach((e) => partyTotals.set(e.to, (partyTotals.get(e.to) || 0) + e.amount));
    const partyPos = parties.map((n, i) => ({ node: n, x: COL_X[1], y: 40 + i * rowH + rowH / 2, total: partyTotals.get(n.id) || 0 }));
    const outcomePos = outcomes.map((o, i) => ({ outcome: o, x: COL_X[2], y: 40 + i * rowH + rowH / 2 }));

    const pos: Record<string, { x: number; y: number }> = {};
    donorPos.forEach((d) => (pos[d.node.id] = { x: d.x, y: d.y }));
    partyPos.forEach((p) => (pos[p.node.id] = { x: p.x, y: p.y }));

    const maxPartyTotal = Math.max(...partyPos.map((p) => p.total), 1);
    return { height, donors: donorPos, parties: partyPos, outcomes: outcomePos, pos, maxPartyTotal, donorTotals, partyTotals };
  }, [data]);

  const maxAmount = useMemo(() => {
    if (!data) return 1;
    return Math.max(...data.edges.map((e) => e.amount), 1);
  }, [data]);

  const active = selected || hovered;
  const hi = useMemo(() => {
    if (!active || !data) return null;
    const edgeIds = new Set<string>();
    const nodeIds = new Set<string>([active]);
    const outcomeIds = new Set<string>();
    data.edges.forEach((e) => {
      if (e.from === active || e.to === active) {
        edgeIds.add(`${e.from}-${e.to}`);
        nodeIds.add(e.from);
        nodeIds.add(e.to);
      }
    });
    const node = data.nodes.find((n) => n.id === active);
    if (node?.type === "party") POLICY_OUTCOMES.forEach((o) => { if (o.linkedParties.includes(active)) outcomeIds.add(o.id); });
    if (node?.type === "donor" && node.industry) POLICY_OUTCOMES.forEach((o) => { if (o.linkedIndustries.includes(node.industry!)) outcomeIds.add(o.id); });
    return { edgeIds, nodeIds, outcomeIds };
  }, [active, data]);

  // Stats
  const stats = useMemo(() => {
    if (!data) return { totalDonations: 0, industries: 0, parties: 0 };
    const total = data.edges.reduce((s, e) => s + e.amount, 0);
    return { totalDonations: total, industries: new Set(data.edges.map((e) => e.industry)).size, parties: data.nodes.filter((n) => n.type === "party").length };
  }, [data]);

  // Summary cards
  const summary = useMemo(() => {
    if (!data || data.edges.length === 0) return null;
    const biggest = data.edges.reduce((a, b) => (a.amount > b.amount ? a : b));
    const biggestFrom = data.nodes.find((n) => n.id === biggest.from);
    const biggestTo = data.nodes.find((n) => n.id === biggest.to);
    const partyConns = new Map<string, number>();
    data.edges.forEach((e) => partyConns.set(e.to, (partyConns.get(e.to) || 0) + 1));
    let mostConnected = { id: "", count: 0 };
    partyConns.forEach((c, id) => { if (c > mostConnected.count) mostConnected = { id, count: c }; });
    const mcNode = data.nodes.find((n) => n.id === mostConnected.id);
    const activeIndustries = new Set(data.edges.map((e) => e.industry));
    const activePartyIds = new Set(data.nodes.filter((n) => n.type === "party").map((n) => n.id));
    const relevantOutcomes = POLICY_OUTCOMES.filter((o) => o.linkedIndustries.some((i) => activeIndustries.has(i)) && o.linkedParties.some((p) => activePartyIds.has(p)));
    const blocked = relevantOutcomes.filter((o) => o.status === "blocked" || o.status === "weakened").length;
    const passed = relevantOutcomes.filter((o) => o.status === "passed").length;
    return {
      biggest: { from: biggestFrom?.label || biggest.from, to: biggestTo?.label || biggest.to, amount: biggest.amount, industry: biggest.industry },
      mostConnected: { name: mcNode?.label || mostConnected.id, count: mostConnected.count, color: mcNode?.color || "#fff" },
      outcomes: { blocked, passed, total: relevantOutcomes.length },
    };
  }, [data]);

  // Detail panel data
  const detail = useMemo(() => {
    if (!selected || !data) return null;
    const node = data.nodes.find((n) => n.id === selected);
    if (!node) return null;
    const connections = data.edges
      .filter((e) => e.from === selected || e.to === selected)
      .map((e) => {
        const otherId = e.from === selected ? e.to : e.from;
        const other = data.nodes.find((n) => n.id === otherId);
        return { ...e, otherLabel: other?.label || otherId, otherColor: other?.color || "#fff" };
      })
      .sort((a, b) => b.amount - a.amount);
    const linkedOutcomes = POLICY_OUTCOMES.filter((o) => {
      if (node.type === "party") return o.linkedParties.includes(selected);
      if (node.industry) return o.linkedIndustries.includes(node.industry);
      return false;
    });
    return { node, connections, linkedOutcomes };
  }, [selected, data]);

  useEffect(() => {
    if (detail && detailRef.current) detailRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [detail]);

  const industries = data?.industries || [];

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      {/* ── HERO ── */}
      <div className="border-b border-white/5 bg-[#0a0a0f]">
        <div className="mx-auto max-w-7xl px-6 pt-14 pb-10 animate-fade-in-up">
          <p className="text-[10px] tracking-[0.35em] uppercase text-[#FFD700]/60 mb-4 font-mono">OPAX // Intelligence Operations</p>
          <h1 className="text-5xl md:text-6xl font-bold tracking-[0.15em] uppercase text-white/95 mb-3" style={{ fontFamily: "system-ui, sans-serif", fontWeight: 800 }}>
            INFLUENCE NETWORK
          </h1>
          <p className="text-[#8b949e] text-lg max-w-3xl leading-relaxed">
            Mapping the flow of political money from industry to policy outcomes.
          </p>
          {!loading && data && (
            <div className="flex gap-8 mt-6 text-sm font-mono">
              <span className="text-[#FFD700]">{fmt(stats.totalDonations)}<span className="text-white/30 ml-1.5">tracked</span></span>
              <span className="text-[#FFD700]">{stats.industries}<span className="text-white/30 ml-1.5">industries</span></span>
              <span className="text-[#FFD700]">{stats.parties}<span className="text-white/30 ml-1.5">parties</span></span>
            </div>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-6 py-8">
        {/* ── CONTROL BAR ── */}
        <div className="flex flex-wrap items-center gap-4 mb-8 p-4 rounded-lg border border-white/5 bg-[#12121a]/80 animate-fade-in-up stagger-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] tracking-[0.2em] uppercase text-white/30 font-mono">INDUSTRY</span>
            <select value={industry} onChange={(e) => setIndustry(e.target.value)}
              className="rounded border border-white/10 bg-[#0a0a0f] px-3 py-1.5 text-sm text-white/80 focus:border-[#FFD700]/40 focus:outline-none font-mono cursor-pointer">
              <option value="all">ALL SECTORS</option>
              {industries.map((ind) => (
                <option key={`ind-${ind.name}`} value={ind.name}>{fmtIndustry(ind.name)} ({fmt(ind.total)})</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] tracking-[0.2em] uppercase text-white/30 font-mono">MIN AMOUNT</span>
            <select value={minAmount} onChange={(e) => setMinAmount(Number(e.target.value))}
              className="rounded border border-white/10 bg-[#0a0a0f] px-3 py-1.5 text-sm text-white/80 focus:border-[#FFD700]/40 focus:outline-none font-mono cursor-pointer">
              {[100000, 500000, 1000000, 5000000, 10000000, 50000000].map((v) => (
                <option key={`amt-${v}`} value={v}>{fmt(v)}+</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1 ml-auto">
            <span className="text-[10px] tracking-[0.2em] uppercase text-white/30 font-mono mr-2">VIEW</span>
            {(["flow", "static"] as const).map((m) => (
              <button key={`view-${m}`} onClick={() => setViewMode(m)}
                className={`px-3 py-1 text-xs font-mono uppercase rounded transition-all ${viewMode === m ? "bg-[#FFD700]/15 text-[#FFD700] border border-[#FFD700]/30" : "text-white/30 border border-transparent hover:text-white/50"}`}>
                {m}
              </button>
            ))}
          </div>

          {selected && (
            <button onClick={() => setSelected(null)}
              className="px-3 py-1 text-xs font-mono uppercase text-white/40 border border-white/10 rounded hover:border-[#FFD700]/30 hover:text-[#FFD700]/60 transition-colors">
              CLEAR
            </button>
          )}
        </div>

        {/* ── VISUALIZATION ── */}
        {loading ? (
          <div className="rounded-lg border border-white/5 bg-[#0d0d14] p-6">
            {/* Column headers skeleton */}
            <div className="flex justify-between mb-6">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-3 w-28" />
            </div>
            {/* Network nodes skeleton */}
            <div className="flex justify-between gap-8" style={{ minHeight: 380 }}>
              {/* Left column: donor nodes */}
              <div className="flex flex-col gap-3 flex-1">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={`dl-${i}`} className="h-9 w-full rounded-md" style={{ animationDelay: `${i * 80}ms` }} />
                ))}
              </div>
              {/* Center column: party nodes */}
              <div className="flex flex-col items-center justify-center gap-6 flex-1">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={`pc-${i}`} className="h-10 w-10 rounded-full" style={{ animationDelay: `${i * 100 + 200}ms` }} />
                ))}
              </div>
              {/* Right column: outcome nodes */}
              <div className="flex flex-col gap-3 flex-1">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={`or-${i}`} className="h-7 w-full rounded-full" style={{ animationDelay: `${i * 80 + 400}ms` }} />
                ))}
              </div>
            </div>
          </div>
        ) : !layout || !data || data.nodes.length === 0 ? (
          <div className="flex items-center justify-center h-96 text-white/30 font-mono text-sm">
            <div className="text-center">
              <p className="text-lg mb-2">NO CONNECTIONS FOUND</p>
              <p className="text-xs text-white/20">Adjust filters to reveal network paths.</p>
            </div>
          </div>
        ) : isMobile ? (
          /* ── MOBILE: Simplified list view ── */
          <div className="space-y-3">
            <p className="text-[10px] tracking-[0.2em] uppercase text-white/30 font-mono mb-4">TOP FLOWS</p>
            {data.edges.sort((a, b) => b.amount - a.amount).slice(0, 12).map((e, i) => {
              const from = data.nodes.find((n) => n.id === e.from);
              const to = data.nodes.find((n) => n.id === e.to);
              return (
                <div key={`mob-${e.from}-${e.to}-${i}`} className="flex items-center gap-3 p-3 rounded border border-white/5 bg-[#12121a]">
                  <div className="w-1.5 h-8 rounded-full" style={{ backgroundColor: INDUSTRY_COLORS[e.industry] || "#666" }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-white/80 truncate">{from?.label || e.from}</div>
                    <div className="text-[10px] text-white/30 font-mono">{fmtIndustry(e.industry)}</div>
                  </div>
                  <div className="text-white/20 text-xs">&rarr;</div>
                  <div className="text-sm font-mono" style={{ color: to?.color || "#fff" }}>{to?.label || e.to}</div>
                  <div className="text-sm font-mono text-[#FFD700]">{fmt(e.amount)}</div>
                </div>
              );
            })}
          </div>
        ) : (
          /* ── DESKTOP: Full SVG visualization ── */
          <div className="rounded-lg border border-white/5 bg-[#0d0d14] overflow-x-auto relative">
            {/* Column headers */}
            <div className="flex justify-between px-8 pt-4 pb-2">
              {["INDUSTRY DONORS", "POLITICAL PARTIES", "POLICY OUTCOMES"].map((h, i) => (
                <span key={`hdr-${i}`} className="text-[10px] tracking-[0.25em] uppercase text-white/20 font-mono"
                  style={{ width: "33%", textAlign: i === 0 ? "left" : i === 1 ? "center" : "right" }}>{h}</span>
              ))}
            </div>

            <svg width={SVG_W} height={layout.height} viewBox={`0 0 ${SVG_W} ${layout.height}`}
              className="w-full" style={{ minWidth: 800 }}>
              <defs>
                {/* Glow filter for particles */}
                <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
                <filter id="glow-strong" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="5" result="blur" />
                  <feMerge><feMergeNode in="blur" /><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
              </defs>

              {/* ── Donor-to-Party edges ── */}
              {data.edges.map((e, i) => {
                const from = layout.pos[e.from];
                const to = layout.pos[e.to];
                if (!from || !to) return null;
                const edgeKey = `${e.from}-${e.to}`;
                const thickness = Math.max(1, (e.amount / maxAmount) * 8);
                const color = INDUSTRY_COLORS[e.industry] || "#666";
                const dimmed = hi && !hi.edgeIds.has(edgeKey);
                const bright = hi && hi.edgeIds.has(edgeKey);
                const pathD = bezier(from.x + 80, from.y, to.x - 40, to.y);
                const pathId = `path-dp-${i}`;
                const particleCount = Math.min(5, Math.max(1, Math.round(e.amount / 1e6)));

                return (
                  <g key={`edge-dp-${i}`}
                    onMouseEnter={() => setHoveredEdge(edgeKey)}
                    onMouseLeave={() => setHoveredEdge(null)}>
                    <path id={pathId} d={pathD} fill="none" stroke={color}
                      strokeWidth={thickness} opacity={dimmed ? 0.05 : bright ? 0.9 : 0.35}
                      className="transition-opacity duration-300" />
                    {/* Hover hitbox */}
                    <path d={pathD} fill="none" stroke="transparent" strokeWidth={Math.max(thickness, 12)} />
                    {/* Animated particles */}
                    {viewMode === "flow" && !dimmed && Array.from({ length: particleCount }).map((_, pi) => (
                      <circle key={`p-${i}-${pi}`} r={bright ? 3 : 2} fill={color} filter={bright ? "url(#glow-strong)" : "url(#glow)"} opacity={0}>
                        <animateMotion dur={`${3 + pi * 0.8}s`} repeatCount="indefinite" begin={`${pi * (3 / particleCount)}s`}>
                          <mpath href={`#${pathId}`} />
                        </animateMotion>
                        <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.1;0.9;1" dur={`${3 + pi * 0.8}s`} repeatCount="indefinite" begin={`${pi * (3 / particleCount)}s`} />
                      </circle>
                    ))}
                    {/* Edge tooltip */}
                    {hoveredEdge === edgeKey && (
                      <g transform={`translate(${(from.x + 80 + to.x - 40) / 2}, ${(from.y + to.y) / 2 - 16})`}>
                        <rect x="-40" y="-12" width="80" height="24" rx="4" fill="#12121a" stroke={color} strokeWidth="1" />
                        <text textAnchor="middle" y="4" fill="#fff" fontSize="11" fontFamily="monospace">{fmt(e.amount)}</text>
                      </g>
                    )}
                  </g>
                );
              })}

              {/* ── Party-to-Outcome edges ── */}
              {layout.outcomes.map((oPos, oi) => {
                return oPos.outcome.linkedParties.map((pid, pi) => {
                  const partyPos = layout.parties.find((p) => p.node.id === pid);
                  if (!partyPos) return null;
                  const dimmed = hi && !hi.outcomeIds.has(oPos.outcome.id);
                  const color = STATUS_COLORS[oPos.outcome.status];
                  const pathD = bezier(partyPos.x + 40, partyPos.y, oPos.x - 80, oPos.y);
                  const pathId = `path-po-${oi}-${pi}`;
                  return (
                    <g key={`oe-${oi}-${pi}`}>
                      <path id={pathId} d={pathD} fill="none" stroke={color}
                        strokeWidth={1.5} opacity={dimmed ? 0.03 : 0.3}
                        strokeDasharray="4 4" className="transition-opacity duration-300" />
                      {viewMode === "flow" && !dimmed && (
                        <circle r={2} fill={color} filter="url(#glow)" opacity={0}>
                          <animateMotion dur="4s" repeatCount="indefinite">
                            <mpath href={`#${pathId}`} />
                          </animateMotion>
                          <animate attributeName="opacity" values="0;0.8;0.8;0" keyTimes="0;0.1;0.9;1" dur="4s" repeatCount="indefinite" />
                        </circle>
                      )}
                    </g>
                  );
                });
              })}

              {/* ── Donor nodes ── */}
              {layout.donors.map((d, i) => {
                const color = INDUSTRY_COLORS[d.node.industry || ""] || "#666";
                const dimmed = hi && !hi.nodeIds.has(d.node.id);
                return (
                  <g key={`donor-${d.node.id}-${i}`} className="cursor-pointer transition-opacity duration-300"
                    style={{ opacity: dimmed ? 0.1 : 1 }}
                    onMouseEnter={() => setHovered(d.node.id)} onMouseLeave={() => setHovered(null)}
                    onClick={() => setSelected((p) => p === d.node.id ? null : d.node.id)}>
                    <rect x={d.x - 80} y={d.y - 17} width={160} height={34} rx={6} fill="#12121a"
                      stroke={hi?.nodeIds.has(d.node.id) ? color : "rgba(255,255,255,0.06)"} strokeWidth={hi?.nodeIds.has(d.node.id) ? 1.5 : 1} />
                    {/* Industry color left border */}
                    <rect x={d.x - 80} y={d.y - 17} width={4} height={34} rx={2} fill={color} />
                    <text x={d.x - 70} y={d.y - 2} fill="#e6edf3" fontSize="11" fontFamily="system-ui">{d.node.label.length > 16 ? d.node.label.slice(0, 15) + "..." : d.node.label}</text>
                    <text x={d.x - 70} y={d.y + 11} fill={color} fontSize="10" fontFamily="monospace">{fmt(d.total)}</text>
                  </g>
                );
              })}

              {/* ── Party nodes ── */}
              {layout.parties.map((p, i) => {
                const dimmed = hi && !hi.nodeIds.has(p.node.id);
                const radius = 18 + (p.total / layout.maxPartyTotal) * 16;
                return (
                  <g key={`party-${p.node.id}-${i}`} className="cursor-pointer transition-opacity duration-300"
                    style={{ opacity: dimmed ? 0.1 : 1 }}
                    onMouseEnter={() => setHovered(p.node.id)} onMouseLeave={() => setHovered(null)}
                    onClick={() => setSelected((prev) => prev === p.node.id ? null : p.node.id)}>
                    {/* Outer glow ring when highlighted */}
                    {hi?.nodeIds.has(p.node.id) && (
                      <circle cx={p.x} cy={p.y} r={radius + 4} fill="none" stroke={p.node.color} strokeWidth={1.5} opacity={0.4} filter="url(#glow)" />
                    )}
                    <circle cx={p.x} cy={p.y} r={radius} fill="#12121a" stroke={p.node.color} strokeWidth={2} />
                    <text x={p.x} y={p.y - 3} textAnchor="middle" fill="#e6edf3" fontSize="12" fontWeight="bold" fontFamily="system-ui">{p.node.label}</text>
                    <text x={p.x} y={p.y + 11} textAnchor="middle" fill={p.node.color} fontSize="9" fontFamily="monospace">{fmt(p.total)}</text>
                  </g>
                );
              })}

              {/* ── Outcome nodes ── */}
              {layout.outcomes.map((o, i) => {
                const color = STATUS_COLORS[o.outcome.status];
                const dimmed = hi && !hi.outcomeIds.has(o.outcome.id);
                return (
                  <g key={`outcome-${o.outcome.id}-${i}`} className="transition-opacity duration-300"
                    style={{ opacity: dimmed ? 0.1 : 1 }}>
                    <rect x={o.x - 80} y={o.y - 14} width={160} height={28} rx={14} fill="none"
                      stroke={color} strokeWidth={1.5} opacity={0.6} />
                    <circle cx={o.x - 64} cy={o.y} r={4} fill={color} />
                    <text x={o.x - 54} y={o.y + 4} fill="#e6edf3" fontSize="10" fontFamily="system-ui">
                      {o.outcome.label.length > 22 ? o.outcome.label.slice(0, 21) + "..." : o.outcome.label}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        )}

        {/* ── DETAIL PANEL ── */}
        {detail && (
          <div ref={detailRef} className="mt-6 rounded-lg border border-white/5 bg-[#12121a] p-6 animate-fade-in-up">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: detail.node.color }} />
                <h3 className="text-lg font-bold text-white/90">{detail.node.label}</h3>
                <span className="text-[10px] tracking-[0.2em] uppercase text-white/30 font-mono border border-white/10 px-2 py-0.5 rounded">
                  {detail.node.type === "donor" ? fmtIndustry(detail.node.industry || "") : "PARTY"}
                </span>
              </div>
              <button onClick={() => setSelected(null)} className="text-white/30 hover:text-white/60 text-xs font-mono">[CLOSE]</button>
            </div>
            <div className="grid gap-2">
              {detail.connections.map((c, i) => (
                <div key={`detail-conn-${i}`} className="flex items-center gap-3 py-2 border-b border-white/5 last:border-0">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: c.otherColor }} />
                  <span className="text-sm text-white/70 flex-1">{c.otherLabel}</span>
                  <span className="text-sm font-mono text-[#FFD700]">{fmt(c.amount)}</span>
                  <span className="text-[10px] font-mono text-white/20">{c.years}</span>
                  <span className="text-[10px] font-mono text-white/20">{c.donation_count} donations</span>
                </div>
              ))}
            </div>
            {detail.linkedOutcomes.length > 0 && (
              <div className="mt-4 pt-4 border-t border-white/5">
                <p className="text-[10px] tracking-[0.2em] uppercase text-white/30 font-mono mb-2">LINKED POLICY OUTCOMES</p>
                <div className="flex flex-wrap gap-2">
                  {detail.linkedOutcomes.map((o) => (
                    <span key={`detail-out-${o.id}`} className="text-xs px-2 py-1 rounded-full border font-mono"
                      style={{ borderColor: STATUS_COLORS[o.status], color: STATUS_COLORS[o.status] }}>
                      {o.label}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── SUMMARY CARDS ── */}
        {summary && !isMobile && (
          <div className="grid grid-cols-3 gap-4 mt-8 animate-fade-in-up stagger-4">
            <div className="rounded-lg border border-white/5 bg-[#12121a] p-5">
              <p className="text-[10px] tracking-[0.25em] uppercase text-white/25 font-mono mb-3">BIGGEST FLOW</p>
              <p className="text-2xl font-mono text-[#FFD700] mb-1">{fmt(summary.biggest.amount)}</p>
              <p className="text-sm text-white/60">{summary.biggest.from} &rarr; {summary.biggest.to}</p>
              <div className="mt-2 flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: INDUSTRY_COLORS[summary.biggest.industry] || "#666" }} />
                <span className="text-[10px] font-mono text-white/30">{fmtIndustry(summary.biggest.industry)}</span>
              </div>
            </div>
            <div className="rounded-lg border border-white/5 bg-[#12121a] p-5">
              <p className="text-[10px] tracking-[0.25em] uppercase text-white/25 font-mono mb-3">MOST CONNECTED PARTY</p>
              <p className="text-2xl font-bold mb-1" style={{ color: summary.mostConnected.color }}>{summary.mostConnected.name}</p>
              <p className="text-sm text-white/40 font-mono">{summary.mostConnected.count} donor connections</p>
            </div>
            <div className="rounded-lg border border-white/5 bg-[#12121a] p-5">
              <p className="text-[10px] tracking-[0.25em] uppercase text-white/25 font-mono mb-3">POLICY OUTCOMES</p>
              <div className="flex items-baseline gap-4">
                <div>
                  <span className="text-2xl font-mono text-[#DC2626]">{summary.outcomes.blocked}</span>
                  <span className="text-[10px] text-white/30 ml-1 font-mono">BLOCKED</span>
                </div>
                <div>
                  <span className="text-2xl font-mono text-[#10B981]">{summary.outcomes.passed}</span>
                  <span className="text-[10px] text-white/30 ml-1 font-mono">PASSED</span>
                </div>
              </div>
              <p className="text-[10px] text-white/20 font-mono mt-2">{summary.outcomes.total} outcomes tracked</p>
            </div>
          </div>
        )}

        {/* ── CLASSIFICATION FOOTER ── */}
        <div className="mt-12 mb-8 text-center">
          <p className="text-[10px] tracking-[0.4em] uppercase text-white/10 font-mono">
            OPAX // OPEN PARLIAMENTARY ACCOUNTABILITY EXCHANGE // DATA CURRENT TO 2024 DISCLOSURE PERIOD
          </p>
        </div>
      </div>
    </div>
  );
}

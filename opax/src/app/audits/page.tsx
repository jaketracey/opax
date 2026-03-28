"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  Treemap,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import {
  Skeleton,
  SkeletonCard,
  SkeletonChart,
  SkeletonTable,
  SkeletonText,
} from "@/components/skeleton";
import {
  Search,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  FileText,
  Building2,
  DollarSign,
  ArrowUpDown,
  ExternalLink,
  Filter,
  XCircle,
} from "lucide-react";

/* ── Types ── */

interface AuditReport {
  audit_id: number;
  title: string;
  report_number: string | null;
  audit_type: string | null;
  agency_audited: string | null;
  date_tabled: string | null;
  summary: string | null;
  findings_count: number | null;
  recommendations_count: number | null;
  url: string | null;
}

interface AuditStats {
  total_reports: number;
  total_recommendations: number;
  total_findings: number;
  agencies_audited: number;
}

interface DonorContractorDonation {
  donor_name: string;
  recipient: string;
  total_donated: number;
}

interface DonorContractor {
  supplier: string;
  contract_amount: number | null;
  contract_title: string | null;
  donations: DonorContractorDonation[];
}

interface AgencyXref {
  audit_count: number;
  audits: {
    title: string;
    report_number: string | null;
    date_tabled: string | null;
    recommendations_count: number | null;
    url: string | null;
  }[];
  contract_count: number;
  total_contract_value: number;
  top_contracts: {
    contract_id: number;
    title: string;
    supplier_name: string | null;
    amount: number | null;
    start_date: string | null;
  }[];
  donor_contractors: DonorContractor[];
  donor_contractor_count: number;
}

/* ── Scroll-triggered visibility hook ── */
function useScrollReveal() {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { threshold: 0.08 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return { ref, visible };
}

function Section({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const { ref, visible } = useScrollReveal();
  return (
    <section
      ref={ref}
      className={`py-14 transition-all duration-700 ease-out ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"} ${className}`}
    >
      {children}
    </section>
  );
}

/* ── Helpers ── */
const fmt = (n: number) => {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
};
const fmtFull = (n: number) => `$${n.toLocaleString()}`;

import { API_BASE } from "@/lib/utils";
const API = API_BASE;

/* ── Sankey Flow Diagram (SVG) ── */
function SankeyFlow({
  xref,
}: {
  xref: Record<string, AgencyXref>;
}) {
  // Build flow: Donors -> Parties -> Agencies -> Contractors
  // Extract from xref: agencies with donor-contractors showing donation flows
  const flows = useMemo(() => {
    const donorToParty: Record<string, Record<string, number>> = {};
    const partyToAgency: Record<string, Record<string, number>> = {};
    const agencyToContractor: Record<string, Record<string, number>> = {};

    for (const [agency, data] of Object.entries(xref)) {
      if (!data.donor_contractors?.length) continue;

      for (const dc of data.donor_contractors) {
        const contractAmt = dc.contract_amount || 0;
        // Agency -> Contractor flow
        const shortAgency = agency.length > 30 ? agency.slice(0, 28) + "..." : agency;
        const shortSupplier = dc.supplier.length > 25 ? dc.supplier.slice(0, 23) + "..." : dc.supplier;

        if (!agencyToContractor[shortAgency]) agencyToContractor[shortAgency] = {};
        agencyToContractor[shortAgency][shortSupplier] =
          (agencyToContractor[shortAgency][shortSupplier] || 0) + contractAmt;

        // Donor -> Party flow (from donation data)
        for (const don of dc.donations) {
          const donorKey = don.donor_name.length > 25 ? don.donor_name.slice(0, 23) + "..." : don.donor_name;
          const party = don.recipient || "Unknown";
          if (!donorToParty[donorKey]) donorToParty[donorKey] = {};
          donorToParty[donorKey][party] = (donorToParty[donorKey][party] || 0) + (don.total_donated || 0);

          // Party -> Agency flow (inferred)
          if (!partyToAgency[party]) partyToAgency[party] = {};
          partyToAgency[party][shortAgency] = (partyToAgency[party][shortAgency] || 0) + (don.total_donated || 0);
        }
      }
    }

    return { donorToParty, partyToAgency, agencyToContractor };
  }, [xref]);

  // Build top flows for visualization
  const topFlows = useMemo(() => {
    const allFlows: { from: string; to: string; value: number; layer: number }[] = [];

    // Layer 0: Donor -> Party (top 8)
    for (const [donor, parties] of Object.entries(flows.donorToParty)) {
      for (const [party, amount] of Object.entries(parties)) {
        allFlows.push({ from: donor, to: party, value: amount, layer: 0 });
      }
    }

    // Layer 1: Party -> Agency (top 8)
    for (const [party, agencies] of Object.entries(flows.partyToAgency)) {
      for (const [agency, amount] of Object.entries(agencies)) {
        allFlows.push({ from: party, to: agency, value: amount, layer: 1 });
      }
    }

    // Layer 2: Agency -> Contractor (top 8)
    for (const [agency, contractors] of Object.entries(flows.agencyToContractor)) {
      for (const [contractor, amount] of Object.entries(contractors)) {
        allFlows.push({ from: agency, to: contractor, value: amount, layer: 2 });
      }
    }

    // Get top flows per layer
    const layer0 = allFlows.filter((f) => f.layer === 0).sort((a, b) => b.value - a.value).slice(0, 8);
    const layer1 = allFlows.filter((f) => f.layer === 1).sort((a, b) => b.value - a.value).slice(0, 8);
    const layer2 = allFlows.filter((f) => f.layer === 2).sort((a, b) => b.value - a.value).slice(0, 8);

    return { layer0, layer1, layer2 };
  }, [flows]);

  // Collect unique nodes per column
  const columns = useMemo(() => {
    const donors = [...new Set(topFlows.layer0.map((f) => f.from))];
    const parties = [...new Set([...topFlows.layer0.map((f) => f.to), ...topFlows.layer1.map((f) => f.from)])];
    const agencies = [...new Set([...topFlows.layer1.map((f) => f.to), ...topFlows.layer2.map((f) => f.from)])];
    const contractors = [...new Set(topFlows.layer2.map((f) => f.to))];
    return { donors, parties, agencies, contractors };
  }, [topFlows]);

  const hasData = topFlows.layer0.length > 0 || topFlows.layer2.length > 0;

  if (!hasData) {
    return (
      <div className="rounded-xl border border-white/5 bg-[#12121a] p-8 text-center">
        <p className="text-[#8b949e]">
          Cross-reference data not yet generated. Run the ANAO ingestion pipeline to populate flows.
        </p>
      </div>
    );
  }

  const W = 900;
  const H = 420;
  const colX = [30, 250, 500, 720];
  const nodeW = 14;

  // Position nodes
  const nodePositions: Record<string, { x: number; y: number; h: number }> = {};

  const positionColumn = (items: string[], colIdx: number) => {
    const gap = Math.min(40, (H - 20) / Math.max(items.length, 1));
    const totalH = items.length * gap;
    const startY = (H - totalH) / 2 + 10;
    items.forEach((item, i) => {
      nodePositions[`${colIdx}-${item}`] = {
        x: colX[colIdx],
        y: startY + i * gap,
        h: Math.max(gap - 6, 8),
      };
    });
  };

  positionColumn(columns.donors, 0);
  positionColumn(columns.parties, 1);
  positionColumn(columns.agencies, 2);
  positionColumn(columns.contractors, 3);

  // Max value for scaling opacity
  const maxVal = Math.max(
    ...topFlows.layer0.map((f) => f.value),
    ...topFlows.layer1.map((f) => f.value),
    ...topFlows.layer2.map((f) => f.value),
    1,
  );

  const renderLink = (from: string, fromCol: number, to: string, toCol: number, value: number, idx: number) => {
    const src = nodePositions[`${fromCol}-${from}`];
    const dst = nodePositions[`${toCol}-${to}`];
    if (!src || !dst) return null;

    const x1 = src.x + nodeW;
    const y1 = src.y + src.h / 2;
    const x2 = dst.x;
    const y2 = dst.y + dst.h / 2;
    const cx = (x1 + x2) / 2;

    const opacity = 0.15 + (value / maxVal) * 0.55;
    const color = value > maxVal * 0.5 ? "#DC2626" : "#FFD700";

    return (
      <path
        key={`link-${fromCol}-${toCol}-${idx}`}
        d={`M${x1},${y1} C${cx},${y1} ${cx},${y2} ${x2},${y2}`}
        fill="none"
        stroke={color}
        strokeWidth={Math.max(1.5, (value / maxVal) * 5)}
        opacity={opacity}
        className="transition-opacity duration-300 hover:opacity-80"
      />
    );
  };

  return (
    <div className="rounded-xl border border-white/5 bg-[#12121a] p-4 md:p-6 overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[700px]" style={{ height: "auto", maxHeight: 420 }}>
        {/* Column labels */}
        <text x={colX[0] + nodeW / 2} y={14} textAnchor="middle" fill="#FFD700" fontSize="11" fontWeight="600">
          DONORS
        </text>
        <text x={colX[1] + nodeW / 2} y={14} textAnchor="middle" fill="#FFD700" fontSize="11" fontWeight="600">
          PARTIES
        </text>
        <text x={colX[2] + nodeW / 2} y={14} textAnchor="middle" fill="#FFD700" fontSize="11" fontWeight="600">
          AGENCIES
        </text>
        <text x={colX[3] + nodeW / 2} y={14} textAnchor="middle" fill="#FFD700" fontSize="11" fontWeight="600">
          CONTRACTORS
        </text>

        {/* Links */}
        {topFlows.layer0.map((f, i) => renderLink(f.from, 0, f.to, 1, f.value, i))}
        {topFlows.layer1.map((f, i) => renderLink(f.from, 1, f.to, 2, f.value, i))}
        {topFlows.layer2.map((f, i) => renderLink(f.from, 2, f.to, 3, f.value, i))}

        {/* Nodes */}
        {Object.entries(nodePositions).map(([key, pos]) => {
          const colIdx = parseInt(key.split("-")[0]);
          const label = key.slice(key.indexOf("-") + 1);
          const colors = ["#FFD700", "#DC2626", "#00843D", "#8b949e"];
          return (
            <g key={key}>
              <rect
                x={pos.x}
                y={pos.y}
                width={nodeW}
                height={pos.h}
                rx={3}
                fill={colors[colIdx]}
                opacity={0.85}
              />
              <text
                x={colIdx < 2 ? pos.x - 6 : pos.x + nodeW + 6}
                y={pos.y + pos.h / 2 + 4}
                textAnchor={colIdx < 2 ? "end" : "start"}
                fill="#e6edf3"
                fontSize="9"
                opacity={0.8}
              >
                {label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/* ── Agency Risk Heatmap ── */
function AgencyHeatmap({
  xref,
}: {
  xref: Record<string, AgencyXref>;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const agencies = useMemo(() => {
    return Object.entries(xref)
      .map(([name, data]) => ({
        name,
        ...data,
      }))
      .filter((a) => a.audit_count > 0 || a.donor_contractor_count > 0)
      .sort((a, b) => b.total_contract_value - a.total_contract_value)
      .slice(0, 20);
  }, [xref]);

  const maxContract = Math.max(...agencies.map((a) => a.total_contract_value), 1);
  const maxFindings = Math.max(...agencies.map((a) => a.audit_count), 1);

  if (agencies.length === 0) {
    return (
      <div className="rounded-xl border border-white/5 bg-[#12121a] p-8 text-center">
        <p className="text-[#8b949e]">No agency data available yet.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {agencies.map((agency) => {
        const contractIntensity = agency.total_contract_value / maxContract;
        const findingScale = Math.min(agency.audit_count / maxFindings, 1);
        const isExpanded = expanded === agency.name;

        // Color: more donor-contractor value = more red
        const r = Math.round(18 + contractIntensity * 200);
        const g = Math.round(18 + (1 - contractIntensity) * 20);
        const b = Math.round(26);
        const borderColor =
          agency.donor_contractor_count > 0
            ? `rgba(220, 38, 38, ${0.15 + contractIntensity * 0.4})`
            : "rgba(255,255,255,0.05)";

        return (
          <button
            key={agency.name}
            onClick={() => setExpanded(isExpanded ? null : agency.name)}
            className="text-left rounded-xl border p-4 transition-all duration-300 hover:border-[#FFD700]/30 cursor-pointer"
            style={{
              borderColor,
              backgroundColor: `rgb(${r}, ${g}, ${b})`,
              transform: `scale(${0.95 + findingScale * 0.05})`,
            }}
          >
            <div className="flex items-start justify-between mb-2">
              <h4 className="text-sm font-semibold text-[#e6edf3] leading-tight line-clamp-2 flex-1 mr-2">
                {agency.name}
              </h4>
              {agency.donor_contractor_count > 0 && (
                <span className="shrink-0 px-1.5 py-0.5 text-[10px] font-bold rounded bg-[#DC2626]/20 text-[#DC2626] border border-[#DC2626]/20">
                  {agency.donor_contractor_count} match{agency.donor_contractor_count !== 1 && "es"}
                </span>
              )}
            </div>

            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#8b949e] mb-2">
              <span>{agency.audit_count} audit{agency.audit_count !== 1 && "s"}</span>
              <span>{agency.contract_count} contract{agency.contract_count !== 1 && "s"}</span>
              <span className="text-[#FFD700]">{fmt(agency.total_contract_value)}</span>
            </div>

            {/* Expand indicator */}
            <div className="flex items-center gap-1 text-[10px] text-[#8b949e]/60">
              {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              {isExpanded ? "collapse" : "tap to expand"}
            </div>

            {/* Expanded detail */}
            {isExpanded && (
              <div className="mt-3 pt-3 border-t border-white/10 animate-fade-in-up">
                {agency.donor_contractors.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-[10px] uppercase tracking-widest text-[#DC2626] font-semibold">
                      Donor-Contractors
                    </p>
                    {agency.donor_contractors.slice(0, 5).map((dc, i) => (
                      <div key={i} className="text-xs">
                        <p className="text-[#e6edf3] font-medium">{dc.supplier}</p>
                        <p className="text-[#8b949e]">
                          Contract: {dc.contract_amount ? fmt(dc.contract_amount) : "N/A"}
                        </p>
                        {dc.donations.slice(0, 3).map((d, j) => (
                          <p key={j} className="text-[#DC2626]/80 pl-2">
                            Donated {fmt(d.total_donated)} to {d.recipient}
                          </p>
                        ))}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-[#8b949e]">No donor-contractor matches found.</p>
                )}
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ── Conflict Table ── */
function ConflictTable({
  xref,
}: {
  xref: Record<string, AgencyXref>;
}) {
  const [sortKey, setSortKey] = useState<"contract" | "donation" | "agency">("contract");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const rows = useMemo(() => {
    const result: {
      company: string;
      contractValue: number;
      donationAmount: number;
      agency: string;
      auditFindings: number;
      contractTitle: string | null;
      recipient: string;
    }[] = [];

    for (const [agency, data] of Object.entries(xref)) {
      for (const dc of data.donor_contractors || []) {
        const totalDonated = dc.donations.reduce((s, d) => s + (d.total_donated || 0), 0);
        const recipients = [...new Set(dc.donations.map((d) => d.recipient))].join(", ");
        result.push({
          company: dc.supplier,
          contractValue: dc.contract_amount || 0,
          donationAmount: totalDonated,
          agency,
          auditFindings: data.audit_count,
          contractTitle: dc.contract_title,
          recipient: recipients,
        });
      }
    }

    result.sort((a, b) => {
      const m = sortDir === "desc" ? -1 : 1;
      if (sortKey === "contract") return (a.contractValue - b.contractValue) * m;
      if (sortKey === "donation") return (a.donationAmount - b.donationAmount) * m;
      return a.agency.localeCompare(b.agency) * m;
    });

    return result;
  }, [xref, sortKey, sortDir]);

  const toggleSort = (key: typeof sortKey) => {
    if (sortKey === key) setSortDir(sortDir === "desc" ? "asc" : "desc");
    else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-white/5 bg-[#12121a] p-8 text-center">
        <p className="text-[#8b949e]">No conflict data available yet.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/5 bg-[#12121a] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/5 bg-white/[0.02] text-[#8b949e]">
              <th className="text-left px-4 py-3 font-medium">Company</th>
              <th
                className="text-right px-4 py-3 font-medium cursor-pointer hover:text-[#FFD700] transition-colors"
                onClick={() => toggleSort("contract")}
              >
                <span className="inline-flex items-center gap-1">
                  Contract Value <ArrowUpDown className="w-3 h-3" />
                </span>
              </th>
              <th
                className="text-right px-4 py-3 font-medium cursor-pointer hover:text-[#FFD700] transition-colors"
                onClick={() => toggleSort("donation")}
              >
                <span className="inline-flex items-center gap-1">
                  Donations <ArrowUpDown className="w-3 h-3" />
                </span>
              </th>
              <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Recipient</th>
              <th
                className="text-left px-4 py-3 font-medium cursor-pointer hover:text-[#FFD700] transition-colors hidden lg:table-cell"
                onClick={() => toggleSort("agency")}
              >
                <span className="inline-flex items-center gap-1">
                  Agency <ArrowUpDown className="w-3 h-3" />
                </span>
              </th>
              <th className="text-right px-4 py-3 font-medium hidden lg:table-cell">Audit Findings</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 30).map((row, i) => {
              const flagged = row.contractValue > 10_000_000 && row.donationAmount > 10_000;
              return (
                <tr
                  key={i}
                  className={`border-b border-white/[0.03] transition-colors ${
                    flagged
                      ? "bg-[#DC2626]/[0.06] hover:bg-[#DC2626]/10"
                      : "hover:bg-white/[0.02]"
                  }`}
                >
                  <td className="px-4 py-3 text-[#e6edf3] font-medium">
                    <div className="flex items-center gap-2">
                      {flagged && <AlertTriangle className="w-3.5 h-3.5 text-[#DC2626] shrink-0" />}
                      <span className="line-clamp-1">{row.company}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right text-[#FFD700] font-mono text-xs">
                    {row.contractValue > 0 ? fmt(row.contractValue) : "--"}
                  </td>
                  <td className="px-4 py-3 text-right text-[#DC2626] font-mono text-xs">
                    {row.donationAmount > 0 ? fmt(row.donationAmount) : "--"}
                  </td>
                  <td className="px-4 py-3 text-[#8b949e] text-xs hidden md:table-cell line-clamp-1">
                    {row.recipient || "--"}
                  </td>
                  <td className="px-4 py-3 text-[#8b949e] text-xs hidden lg:table-cell">
                    <span className="line-clamp-1">{row.agency}</span>
                  </td>
                  <td className="px-4 py-3 text-right text-[#8b949e] hidden lg:table-cell">
                    {row.auditFindings}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.length > 30 && (
        <p className="text-center text-xs text-[#8b949e]/60 py-3 border-t border-white/5">
          Showing top 30 of {rows.length} connections
        </p>
      )}
    </div>
  );
}

/* ── Audit Report Browser ── */
function AuditBrowser({
  reports,
  total,
  loading,
  onSearch,
  onFilterAgency,
  onFilterType,
  agencyFilter,
  typeFilter,
  searchQuery,
}: {
  reports: AuditReport[];
  total: number;
  loading: boolean;
  onSearch: (q: string) => void;
  onFilterAgency: (a: string) => void;
  onFilterType: (t: string) => void;
  agencyFilter: string;
  typeFilter: string;
  searchQuery: string;
}) {
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [detailCache, setDetailCache] = useState<Record<number, Record<string, unknown>>>({});

  const loadDetail = useCallback(
    async (id: number) => {
      if (detailCache[id]) return;
      try {
        const res = await fetch(`${API}/api/audits/${id}`);
        const data = await res.json();
        setDetailCache((prev) => ({ ...prev, [id]: data }));
      } catch {
        // ignore
      }
    },
    [detailCache],
  );

  const handleExpand = (id: number) => {
    if (expandedId === id) {
      setExpandedId(null);
    } else {
      setExpandedId(id);
      loadDetail(id);
    }
  };

  // Unique agencies from reports for filter
  const agencies = useMemo(() => {
    const set = new Set(reports.map((r) => r.agency_audited).filter(Boolean));
    return [...set].sort() as string[];
  }, [reports]);

  const types = useMemo(() => {
    const set = new Set(reports.map((r) => r.audit_type).filter(Boolean));
    return [...set].sort() as string[];
  }, [reports]);

  return (
    <div className="space-y-4">
      {/* Search + Filters */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8b949e]" />
          <input
            type="text"
            placeholder="Search audit reports..."
            value={searchQuery}
            onChange={(e) => onSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-[#12121a] border border-white/10 text-sm text-[#e6edf3] placeholder:text-[#8b949e]/50 focus:outline-none focus:border-[#FFD700]/30 transition-colors"
          />
        </div>

        {/* Agency filter */}
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#8b949e]" />
          <select
            value={agencyFilter}
            onChange={(e) => onFilterAgency(e.target.value)}
            className="pl-9 pr-8 py-2.5 rounded-lg bg-[#12121a] border border-white/10 text-sm text-[#e6edf3] appearance-none cursor-pointer focus:outline-none focus:border-[#FFD700]/30 transition-colors"
          >
            <option value="">All Agencies</option>
            {agencies.map((a) => (
              <option key={a} value={a}>
                {a.length > 40 ? a.slice(0, 38) + "..." : a}
              </option>
            ))}
          </select>
        </div>

        {/* Type filter */}
        <div className="relative">
          <select
            value={typeFilter}
            onChange={(e) => onFilterType(e.target.value)}
            className="px-4 py-2.5 rounded-lg bg-[#12121a] border border-white/10 text-sm text-[#e6edf3] appearance-none cursor-pointer focus:outline-none focus:border-[#FFD700]/30 transition-colors"
          >
            <option value="">All Types</option>
            {types.map((t) => (
              <option key={t} value={t}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </option>
            ))}
          </select>
        </div>

        {(agencyFilter || typeFilter || searchQuery) && (
          <button
            onClick={() => {
              onSearch("");
              onFilterAgency("");
              onFilterType("");
            }}
            className="flex items-center gap-1.5 px-3 py-2 text-xs text-[#8b949e] hover:text-[#e6edf3] transition-colors"
          >
            <XCircle className="w-3.5 h-3.5" /> Clear
          </button>
        )}
      </div>

      <p className="text-xs text-[#8b949e]">
        {total} report{total !== 1 && "s"} found
      </p>

      {/* Reports list */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-white/5 bg-[#12121a] p-4">
              <Skeleton className="h-4 w-3/4 mb-2" />
              <Skeleton className="h-3 w-1/2 mb-1" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {reports.map((report) => {
            const isExpanded = expandedId === report.audit_id;
            const detail = detailCache[report.audit_id];

            return (
              <div
                key={report.audit_id}
                className="rounded-xl border border-white/5 bg-[#12121a] overflow-hidden transition-all duration-300 hover:border-white/10"
              >
                <button
                  onClick={() => handleExpand(report.audit_id)}
                  className="w-full text-left p-4 cursor-pointer"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-semibold text-[#e6edf3] leading-snug mb-1 line-clamp-2">
                        {report.title}
                      </h4>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#8b949e]">
                        {report.agency_audited && (
                          <span className="flex items-center gap-1">
                            <Building2 className="w-3 h-3" />
                            <span className="line-clamp-1">{report.agency_audited}</span>
                          </span>
                        )}
                        {report.date_tabled && <span>{report.date_tabled}</span>}
                        {report.audit_type && (
                          <span className="px-1.5 py-0.5 rounded bg-white/5 text-[10px] uppercase tracking-wider">
                            {report.audit_type}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {(report.findings_count ?? 0) > 0 && (
                        <span className="text-xs text-[#DC2626] font-mono">
                          {report.findings_count} finding{report.findings_count !== 1 && "s"}
                        </span>
                      )}
                      {(report.recommendations_count ?? 0) > 0 && (
                        <span className="text-xs text-[#FFD700] font-mono">
                          {report.recommendations_count} rec{report.recommendations_count !== 1 && "s"}
                        </span>
                      )}
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-[#8b949e]" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-[#8b949e]" />
                      )}
                    </div>
                  </div>
                </button>

                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-white/5 pt-3 animate-fade-in-up">
                    {report.summary && (
                      <p className="text-sm text-[#8b949e] leading-relaxed mb-3">{report.summary}</p>
                    )}

                    {detail && !("error" in detail) && (
                      <>
                        {(detail as Record<string, unknown>).full_text && (
                          <details className="mb-3">
                            <summary className="text-xs text-[#FFD700] cursor-pointer hover:text-[#FFD700]/80">
                              Full report text
                            </summary>
                            <p className="mt-2 text-xs text-[#8b949e] leading-relaxed whitespace-pre-wrap max-h-60 overflow-y-auto">
                              {String((detail as Record<string, unknown>).full_text).slice(0, 3000)}
                              {String((detail as Record<string, unknown>).full_text).length > 3000 && "..."}
                            </p>
                          </details>
                        )}

                        {(detail as { related_contracts?: { contract_id: number; title: string; supplier_name: string | null; amount: number | null }[] }).related_contracts?.length ? (
                          <div>
                            <p className="text-[10px] uppercase tracking-widest text-[#FFD700] font-semibold mb-2">
                              Related Contracts
                            </p>
                            <div className="space-y-1.5">
                              {(detail as { related_contracts: { contract_id: number; title: string; supplier_name: string | null; amount: number | null }[] }).related_contracts.slice(0, 5).map((c) => (
                                <div key={c.contract_id} className="flex items-center justify-between text-xs">
                                  <span className="text-[#e6edf3] line-clamp-1 flex-1 mr-3">
                                    {c.supplier_name || c.title}
                                  </span>
                                  <span className="text-[#FFD700] font-mono shrink-0">
                                    {c.amount ? fmt(c.amount) : "--"}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </>
                    )}

                    {report.url && (
                      <a
                        href={report.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 mt-3 text-xs text-[#FFD700] hover:text-[#FFD700]/80 transition-colors"
                      >
                        <ExternalLink className="w-3 h-3" />
                        View on ANAO website
                      </a>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Treemap Custom Content ── */
interface TreemapNodeProps {
  x: number;
  y: number;
  width: number;
  height: number;
  name: string;
  donorMatches: number;
  fill: string;
}

function TreemapNode({ x, y, width, height, name, donorMatches, fill }: TreemapNodeProps) {
  if (width < 30 || height < 20) return null;
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={4}
        fill={fill}
        stroke="#0a0a0f"
        strokeWidth={2}
        className="transition-opacity duration-200 hover:opacity-80"
      />
      {width > 60 && height > 30 && (
        <>
          <text
            x={x + width / 2}
            y={y + height / 2 - (height > 50 ? 4 : 0)}
            textAnchor="middle"
            dominantBaseline="central"
            fill="#e6edf3"
            fontSize={Math.min(11, width / 8)}
            fontWeight="600"
          >
            {name.length > width / 7 ? name.slice(0, Math.floor(width / 7)) + "..." : name}
          </text>
          {height > 50 && (
            <text
              x={x + width / 2}
              y={y + height / 2 + 12}
              textAnchor="middle"
              dominantBaseline="central"
              fill="#8b949e"
              fontSize={Math.min(9, width / 10)}
            >
              {donorMatches} match{donorMatches !== 1 ? "es" : ""}
            </text>
          )}
        </>
      )}
    </g>
  );
}

/* ── Main Page Component ── */
export default function AuditTrailPage() {
  const [stats, setStats] = useState<AuditStats | null>(null);
  const [reports, setReports] = useState<AuditReport[]>([]);
  const [totalReports, setTotalReports] = useState(0);
  const [xref, setXref] = useState<Record<string, AgencyXref>>({});
  const [loaded, setLoaded] = useState(false);
  const [reportsLoading, setReportsLoading] = useState(true);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [agencyFilter, setAgencyFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");

  // Debounce search
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchReports = useCallback(
    async (q: string, agency: string, type: string) => {
      setReportsLoading(true);
      try {
        const params = new URLSearchParams();
        if (q) params.set("q", q);
        if (agency) params.set("agency", agency);
        if (type) params.set("type", type);
        params.set("limit", "50");

        const res = await fetch(`${API}/api/audits?${params}`);
        const data = await res.json();
        setReports(data.reports || []);
        setTotalReports(data.total || 0);
        if (data.stats) setStats(data.stats);
      } catch {
        // ignore
      } finally {
        setReportsLoading(false);
      }
    },
    [],
  );

  // Initial load
  useEffect(() => {
    Promise.all([
      fetch(`${API}/api/audits?limit=50`).then((r) => r.json()).catch(() => null),
      fetch(`${API}/api/audits/xref`).then((r) => r.json()).catch(() => null),
    ]).then(([auditsData, xrefData]) => {
      if (auditsData && !auditsData.error) {
        setReports(auditsData.reports || []);
        setTotalReports(auditsData.total || 0);
        setStats(auditsData.stats || null);
      }
      if (xrefData && !xrefData.error) {
        setXref(xrefData);
      }
      setLoaded(true);
      setReportsLoading(false);
    });
  }, []);

  // Search handler with debounce
  const handleSearch = useCallback(
    (q: string) => {
      setSearchQuery(q);
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
      searchTimeout.current = setTimeout(() => {
        fetchReports(q, agencyFilter, typeFilter);
      }, 350);
    },
    [agencyFilter, typeFilter, fetchReports],
  );

  const handleAgencyFilter = useCallback(
    (a: string) => {
      setAgencyFilter(a);
      fetchReports(searchQuery, a, typeFilter);
    },
    [searchQuery, typeFilter, fetchReports],
  );

  const handleTypeFilter = useCallback(
    (t: string) => {
      setTypeFilter(t);
      fetchReports(searchQuery, agencyFilter, t);
    },
    [searchQuery, agencyFilter, fetchReports],
  );

  // Build treemap data
  const treemapData = useMemo(() => {
    return Object.entries(xref)
      .filter(([, data]) => data.total_contract_value > 0)
      .map(([name, data]) => {
        const intensity = Math.min(data.donor_contractor_count / 5, 1);
        const r = Math.round(18 + intensity * 200);
        const g = Math.round(50 - intensity * 30);
        const b = Math.round(26 + (1 - intensity) * 30);
        return {
          name: name.length > 35 ? name.slice(0, 33) + "..." : name,
          fullName: name,
          size: Math.max(data.total_contract_value, 1),
          donorMatches: data.donor_contractor_count,
          fill: `rgb(${r}, ${g}, ${b})`,
        };
      })
      .sort((a, b) => b.size - a.size)
      .slice(0, 25);
  }, [xref]);

  // Summary stats from xref
  const xrefSummary = useMemo(() => {
    const agencies = Object.keys(xref).length;
    const totalConflicts = Object.values(xref).reduce((s, d) => s + d.donor_contractor_count, 0);
    const totalContractValue = Object.values(xref).reduce((s, d) => s + d.total_contract_value, 0);
    return { agencies, totalConflicts, totalContractValue };
  }, [xref]);

  return (
    <div className="mx-auto max-w-6xl px-6">
      {/* ── Hero ── */}
      <section className="pt-16 pb-12 animate-fade-in-up">
        <p className="text-sm uppercase tracking-[0.2em] text-[#FFD700] mb-4 font-medium">
          Deep Dive -- Audit Trail
        </p>
        <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-[#e6edf3] leading-[1.1] mb-4 max-w-4xl">
          Audit Trail:{" "}
          <span className="italic text-[#FFD700]">Follow the Findings</span>
        </h1>
        <p className="text-lg text-[#8b949e] max-w-2xl leading-relaxed mb-10">
          Where taxpayer money meets political donations. Cross-referencing ANAO
          audit findings with government contracts and political donations to
          expose potential conflicts of interest.
        </p>

        {/* Stats */}
        {!loaded ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonCard key={i} className="text-center" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              {
                label: "Audit Reports",
                value: stats?.total_reports ?? 0,
                icon: FileText,
                color: "#FFD700",
              },
              {
                label: "Findings",
                value: stats?.total_findings ?? 0,
                icon: AlertTriangle,
                color: "#DC2626",
              },
              {
                label: "Recommendations",
                value: stats?.total_recommendations ?? 0,
                icon: FileText,
                color: "#00843D",
              },
              {
                label: "Agencies Audited",
                value: stats?.agencies_audited ?? 0,
                icon: Building2,
                color: "#8b949e",
              },
            ].map((stat) => (
              <div
                key={stat.label}
                className="flex flex-col items-center gap-2 rounded-xl border border-white/5 bg-[#12121a] p-4 text-center"
              >
                <stat.icon className="w-5 h-5" style={{ color: stat.color }} />
                <p className="text-2xl md:text-3xl font-bold text-[#e6edf3] font-mono">
                  {stat.value.toLocaleString()}
                </p>
                <p className="text-xs text-[#8b949e]">{stat.label}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Sankey / Flow Diagram ── */}
      <Section>
        <h2 className="text-2xl font-bold text-[#e6edf3] mb-2">
          Money Flow
        </h2>
        <p className="text-sm text-[#8b949e] mb-6 max-w-2xl">
          Tracing the path: political donors who win government contracts at
          agencies flagged by the Auditor-General. Thicker lines = larger amounts.
          Red lines = highest values.
        </p>
        {!loaded ? (
          <SkeletonChart height={420} />
        ) : (
          <SankeyFlow xref={xref} />
        )}
      </Section>

      {/* ── Agency Risk Heatmap ── */}
      <Section>
        <h2 className="text-2xl font-bold text-[#e6edf3] mb-2">
          Agency Risk Heatmap
        </h2>
        <p className="text-sm text-[#8b949e] mb-6 max-w-2xl">
          Agencies sized by contract value and colored by donor-contractor overlap.
          Redder cards indicate more companies that both donate to parties and receive
          contracts from the agency. Tap to expand.
        </p>
        {!loaded ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : (
          <AgencyHeatmap xref={xref} />
        )}
      </Section>

      {/* ── Top Conflict Table ── */}
      <Section>
        <h2 className="text-2xl font-bold text-[#e6edf3] mb-2">
          Top Conflicts
        </h2>
        <p className="text-sm text-[#8b949e] mb-6 max-w-2xl">
          Companies that both donate to political parties and receive government
          contracts from audited agencies. Rows highlighted where contract exceeds
          $10M and donations exceed $10K.
        </p>
        {!loaded ? <SkeletonTable rows={8} cols={5} /> : <ConflictTable xref={xref} />}
      </Section>

      {/* ── Audit Report Browser ── */}
      <Section>
        <h2 className="text-2xl font-bold text-[#e6edf3] mb-2">
          Audit Report Browser
        </h2>
        <p className="text-sm text-[#8b949e] mb-6 max-w-2xl">
          Search and filter ANAO audit reports. Click any report to see its summary,
          key findings, and related contracts.
        </p>
        <AuditBrowser
          reports={reports}
          total={totalReports}
          loading={reportsLoading}
          onSearch={handleSearch}
          onFilterAgency={handleAgencyFilter}
          onFilterType={handleTypeFilter}
          agencyFilter={agencyFilter}
          typeFilter={typeFilter}
          searchQuery={searchQuery}
        />
      </Section>

      {/* ── Treemap ── */}
      <Section>
        <h2 className="text-2xl font-bold text-[#e6edf3] mb-2">
          Agency Contract Treemap
        </h2>
        <p className="text-sm text-[#8b949e] mb-6 max-w-2xl">
          Agencies sized by total contract value. Redder blocks indicate more
          donor-contractor matches. Hover for details.
        </p>
        {!loaded ? (
          <SkeletonChart height={400} />
        ) : treemapData.length > 0 ? (
          <div className="rounded-xl border border-white/5 bg-[#12121a] p-4 md:p-6">
            <ResponsiveContainer width="100%" height={400}>
              <Treemap
                data={treemapData}
                dataKey="size"
                nameKey="name"
                content={(props: Record<string, unknown>) => (
                  <TreemapNode
                    x={props.x as number}
                    y={props.y as number}
                    width={props.width as number}
                    height={props.height as number}
                    name={(props.name as string) || ""}
                    donorMatches={(props.donorMatches as number) || 0}
                    fill={(props.fill as string) || "#12121a"}
                  />
                )}
              >
                <Tooltip
                  content={({ payload }) => {
                    if (!payload?.length) return null;
                    const d = payload[0].payload as (typeof treemapData)[0];
                    return (
                      <div className="rounded-lg border border-white/10 bg-[#12121a] px-3 py-2 shadow-xl">
                        <p className="text-xs font-semibold text-[#e6edf3] mb-1">{d.fullName || d.name}</p>
                        <p className="text-xs text-[#FFD700]">
                          Contracts: {fmt(d.size)}
                        </p>
                        <p className="text-xs text-[#DC2626]">
                          Donor-contractor matches: {d.donorMatches}
                        </p>
                      </div>
                    );
                  }}
                />
              </Treemap>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="rounded-xl border border-white/5 bg-[#12121a] p-8 text-center">
            <p className="text-[#8b949e]">No contract data available for treemap.</p>
          </div>
        )}
      </Section>

      {/* Bottom spacer */}
      <div className="h-20" />
    </div>
  );
}

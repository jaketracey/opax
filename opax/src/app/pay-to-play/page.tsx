"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  Skeleton,
  SkeletonCard,
  SkeletonChart,
  SkeletonTable,
} from "@/components/skeleton";
import { Search, ArrowUpDown, ArrowUp, ArrowDown, Building2, Banknote, FileText, Users } from "lucide-react";

/* ── Types ── */

interface PayToPlayLink {
  link_id: number;
  contract_id: number;
  speech_id: number;
  person_id: string;
  company_name: string;
  supplier_name: string;
  donor_name: string;
  contract_amount: number;
  donation_amount: number;
  party: string;
  recipient_party: string;
  match_type: string;
  speech_date: string;
  speech_snippet: string;
  mp_name: string;
  electorate: string;
  contract_title: string;
  agency: string;
}

interface Summary {
  total_links: number;
  unique_companies: number;
  unique_mps: number;
  party_matches: number;
  max_contract: number;
  total_contract_value: number;
}

interface ApiResponse {
  links: PayToPlayLink[];
  count: number;
  total: number;
  offset: number;
  limit: number;
  summary: Summary;
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
      { threshold: 0.12 }
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
      className={`py-14 transition-all duration-700 ease-out ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
      } ${className}`}
    >
      {children}
    </section>
  );
}

/* ── Helpers ── */

const fmtCurrency = (n: number) => {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
};

const fmtFull = (n: number) => `$${n.toLocaleString()}`;

const partyColors: Record<string, string> = {
  Labor: "#E13A3A",
  "Australian Labor Party": "#E13A3A",
  ALP: "#E13A3A",
  Liberal: "#1C4FA0",
  "Liberal Party of Australia": "#1C4FA0",
  LIB: "#1C4FA0",
  Greens: "#00843D",
  "Australian Greens": "#00843D",
  GRN: "#00843D",
  Nationals: "#006644",
  "National Party of Australia": "#006644",
  NAT: "#006644",
  Independent: "#888888",
  IND: "#888888",
};

function getPartyColor(party: string): string {
  if (!party) return "#888888";
  for (const [key, color] of Object.entries(partyColors)) {
    if (party.toLowerCase().includes(key.toLowerCase())) return color;
  }
  return "#888888";
}

type SortField = "company_name" | "contract_amount" | "donation_amount";
type SortDir = "asc" | "desc";

/* ── Main Page ── */

export default function PayToPlayPage() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [sortField, setSortField] = useState<SortField>("contract_amount");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // Fetch data
  const fetchData = useCallback(() => {
    setLoading(true);
    const API = (typeof window !== "undefined" ? `http://${window.location.hostname}:8000` : "http://localhost:8000");
    const params = new URLSearchParams({
      sort: sortField === "company_name" ? "company_name" : sortField,
      limit: "200",
    });
    if (debouncedQuery) params.set("company", debouncedQuery);

    fetch(`${API}/api/pay-to-play?${params}`)
      .then((r) => r.json())
      .then((d: ApiResponse) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [debouncedQuery, sortField]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Aggregate company-level data from link-level rows
  const companyRows = useMemo(() => {
    if (!data?.links) return [];
    const map = new Map<
      string,
      {
        company: string;
        totalContracts: number;
        totalDonations: number;
        parties: Set<string>;
        contractCount: number;
      }
    >();

    for (const link of data.links) {
      const key = (link.company_name || link.supplier_name || "").toLowerCase();
      if (!key) continue;
      const existing = map.get(key);
      if (existing) {
        existing.totalContracts += link.contract_amount || 0;
        existing.totalDonations += link.donation_amount || 0;
        if (link.recipient_party) existing.parties.add(link.recipient_party);
        if (link.party) existing.parties.add(link.party);
        existing.contractCount += 1;
      } else {
        const parties = new Set<string>();
        if (link.recipient_party) parties.add(link.recipient_party);
        if (link.party) parties.add(link.party);
        map.set(key, {
          company: link.company_name || link.supplier_name,
          totalContracts: link.contract_amount || 0,
          totalDonations: link.donation_amount || 0,
          parties,
          contractCount: 1,
        });
      }
    }

    const rows = Array.from(map.values());

    // Sort
    rows.sort((a, b) => {
      let cmp = 0;
      if (sortField === "company_name") {
        cmp = a.company.localeCompare(b.company);
      } else if (sortField === "contract_amount") {
        cmp = a.totalContracts - b.totalContracts;
      } else if (sortField === "donation_amount") {
        cmp = a.totalDonations - b.totalDonations;
      }
      return sortDir === "desc" ? -cmp : cmp;
    });

    return rows;
  }, [data, sortField, sortDir]);

  // Industry breakdown (group by agency from the links)
  const industryData = useMemo(() => {
    if (!data?.links) return [];
    const map = new Map<string, number>();
    for (const link of data.links) {
      const industry = link.agency || "Unknown";
      map.set(industry, (map.get(industry) || 0) + 1);
    }
    return Array.from(map.entries())
      .map(([name, count]) => ({ name: name.length > 30 ? name.slice(0, 28) + "..." : name, fullName: name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12);
  }, [data]);

  // Party breakdown
  const partyData = useMemo(() => {
    if (!data?.links) return [];
    const map = new Map<string, number>();
    for (const link of data.links) {
      const party = link.recipient_party || link.party || "Unknown";
      map.set(party, (map.get(party) || 0) + 1);
    }
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count, color: getPartyColor(name) }))
      .sort((a, b) => b.count - a.count);
  }, [data]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field)
      return <ArrowUpDown className="w-3.5 h-3.5 text-[#8b949e]/40" />;
    return sortDir === "desc" ? (
      <ArrowDown className="w-3.5 h-3.5 text-[#FFD700]" />
    ) : (
      <ArrowUp className="w-3.5 h-3.5 text-[#FFD700]" />
    );
  };

  const summary = data?.summary;

  return (
    <div className="mx-auto max-w-6xl px-6">
      {/* ── Hero ── */}
      <section className="pt-16 pb-12 animate-fade-in-up">
        <p className="text-sm uppercase tracking-[0.2em] text-[#FFD700] mb-4 font-medium">
          Deep Dive -- Investigation
        </p>
        <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-[#e6edf3] leading-[1.1] mb-4 max-w-4xl">
          Pay to Play:{" "}
          <span className="italic text-[#DC2626]">Contracts &amp; Donors</span>
        </h1>
        <p className="text-lg text-[#8b949e] max-w-2xl leading-relaxed mb-10">
          Companies that donate to political parties and win government
          contracts. When the same corporations funding campaigns also land
          lucrative public deals, accountability demands scrutiny.
        </p>

        {/* Key Stats */}
        {loading || !summary ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonCard key={i} className="text-center" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 animate-fade-in-up">
            <div className="rounded-xl border border-white/5 bg-[#12121a] p-4 text-center group hover:border-[#FFD700]/20 transition-colors">
              <Banknote className="w-5 h-5 text-[#FFD700]/60 mx-auto mb-2" />
              <p className="text-2xl md:text-3xl font-bold text-[#FFD700]">
                {fmtCurrency(summary.total_contract_value || 0)}
              </p>
              <p className="text-xs text-[#8b949e] mt-1 uppercase tracking-wider">
                Total Contracts
              </p>
            </div>
            <div className="rounded-xl border border-white/5 bg-[#12121a] p-4 text-center group hover:border-[#DC2626]/20 transition-colors">
              <FileText className="w-5 h-5 text-[#DC2626]/60 mx-auto mb-2" />
              <p className="text-2xl md:text-3xl font-bold text-[#DC2626]">
                {summary.total_links.toLocaleString()}
              </p>
              <p className="text-xs text-[#8b949e] mt-1 uppercase tracking-wider">
                Donor-Contract Links
              </p>
            </div>
            <div className="rounded-xl border border-white/5 bg-[#12121a] p-4 text-center group hover:border-[#FFD700]/20 transition-colors">
              <Building2 className="w-5 h-5 text-[#FFD700]/60 mx-auto mb-2" />
              <p className="text-2xl md:text-3xl font-bold text-[#FFD700]">
                {summary.unique_companies.toLocaleString()}
              </p>
              <p className="text-xs text-[#8b949e] mt-1 uppercase tracking-wider">
                Donor-Contractors
              </p>
            </div>
            <div className="rounded-xl border border-white/5 bg-[#12121a] p-4 text-center group hover:border-[#00843D]/20 transition-colors">
              <Users className="w-5 h-5 text-[#00843D]/60 mx-auto mb-2" />
              <p className="text-2xl md:text-3xl font-bold text-[#00843D]">
                {summary.party_matches.toLocaleString()}
              </p>
              <p className="text-xs text-[#8b949e] mt-1 uppercase tracking-wider">
                Party Matches
              </p>
            </div>
          </div>
        )}
      </section>

      {/* ── Search & Filter ── */}
      <Section>
        <div className="flex flex-col md:flex-row items-start md:items-center gap-4 mb-6">
          <h2 className="text-2xl md:text-3xl font-bold text-[#e6edf3]">
            Donor-Contractor Matches
          </h2>
          <div className="relative flex-1 max-w-md ml-auto">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8b949e]" />
            <input
              type="text"
              placeholder="Search company or industry..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-white/10 bg-[#12121a] text-sm text-[#e6edf3] placeholder-[#8b949e]/50 focus:outline-none focus:border-[#FFD700]/30 focus:ring-1 focus:ring-[#FFD700]/20 transition-colors"
            />
          </div>
        </div>
        <p className="text-sm text-[#8b949e] mb-6 leading-relaxed max-w-3xl">
          Companies that donated to political parties and also won government
          contracts. &ldquo;Party match&rdquo; means the MP who mentioned the
          company belongs to the same party that received the donation — the
          strongest signal of potential influence.
        </p>

        {/* Table */}
        {loading ? (
          <SkeletonTable rows={8} cols={5} />
        ) : companyRows.length === 0 ? (
          <div className="rounded-xl border border-white/5 bg-[#12121a] p-12 text-center">
            <p className="text-[#8b949e]">
              {debouncedQuery
                ? `No results for "${debouncedQuery}"`
                : "No pay-to-play links found"}
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-white/5 bg-[#12121a] overflow-hidden animate-fade-in-up">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/5 bg-white/[0.02]">
                    <th className="text-left px-5 py-3">
                      <button
                        onClick={() => handleSort("company_name")}
                        className="flex items-center gap-1.5 text-[#8b949e] hover:text-[#e6edf3] transition-colors text-xs uppercase tracking-wider font-medium"
                      >
                        Company <SortIcon field="company_name" />
                      </button>
                    </th>
                    <th className="text-right px-5 py-3">
                      <button
                        onClick={() => handleSort("contract_amount")}
                        className="flex items-center gap-1.5 ml-auto text-[#8b949e] hover:text-[#e6edf3] transition-colors text-xs uppercase tracking-wider font-medium"
                      >
                        Contracts <SortIcon field="contract_amount" />
                      </button>
                    </th>
                    <th className="text-right px-5 py-3">
                      <button
                        onClick={() => handleSort("donation_amount")}
                        className="flex items-center gap-1.5 ml-auto text-[#8b949e] hover:text-[#e6edf3] transition-colors text-xs uppercase tracking-wider font-medium"
                      >
                        Donations <SortIcon field="donation_amount" />
                      </button>
                    </th>
                    <th className="text-left px-5 py-3 text-[#8b949e] text-xs uppercase tracking-wider font-medium">
                      Recipient Parties
                    </th>
                    <th className="text-right px-5 py-3 text-[#8b949e] text-xs uppercase tracking-wider font-medium">
                      Links
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {companyRows.map((row, idx) => (
                    <tr
                      key={row.company}
                      className="border-b border-white/[0.03] last:border-b-0 hover:bg-white/[0.02] transition-colors"
                      style={{ animationDelay: `${idx * 30}ms` }}
                    >
                      <td className="px-5 py-3.5">
                        <span className="text-[#e6edf3] font-medium">
                          {row.company}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <span className="text-[#FFD700] font-mono text-sm">
                          {fmtCurrency(row.totalContracts)}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <span className="text-[#DC2626] font-mono text-sm">
                          {fmtCurrency(row.totalDonations)}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex flex-wrap gap-1.5">
                          {Array.from(row.parties).map((p) => (
                            <span
                              key={p}
                              className="inline-block px-2 py-0.5 rounded-full text-xs font-medium border"
                              style={{
                                color: getPartyColor(p),
                                borderColor: `${getPartyColor(p)}33`,
                                backgroundColor: `${getPartyColor(p)}10`,
                              }}
                            >
                              {p}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <span className="text-[#8b949e] font-mono text-sm">
                          {row.contractCount}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {data && data.total > companyRows.length && (
              <div className="px-5 py-3 border-t border-white/5 text-center">
                <p className="text-xs text-[#8b949e]">
                  Showing {companyRows.length} companies from {data.total}{" "}
                  total links
                </p>
              </div>
            )}
          </div>
        )}
      </Section>

      {/* ── Industry Breakdown ── */}
      <Section>
        <h2 className="text-2xl md:text-3xl font-bold text-[#e6edf3] mb-2">
          By Agency / Industry
        </h2>
        <p className="text-sm text-[#8b949e] mb-6 max-w-2xl leading-relaxed">
          Which government agencies awarded the most contracts to companies that
          also donate to political parties.
        </p>
        {loading ? (
          <SkeletonChart height={420} />
        ) : industryData.length === 0 ? (
          <div className="rounded-xl border border-white/5 bg-[#12121a] p-12 text-center">
            <p className="text-[#8b949e]">No industry data available</p>
          </div>
        ) : (
          <div className="rounded-xl border border-white/5 bg-[#12121a] p-4 md:p-6 animate-fade-in-up">
            <ResponsiveContainer width="100%" height={Math.max(380, industryData.length * 40)}>
              <BarChart
                data={industryData}
                layout="vertical"
                margin={{ top: 8, right: 24, bottom: 0, left: 8 }}
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
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fill: "#8b949e", fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={180}
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
                  formatter={((value: any) => [value, "Links"]) as any}
                  labelFormatter={((label: any) => {
                    const item = industryData.find((d: any) => d.name === label);
                    return item?.fullName || label;
                  }) as any}
                />
                <Bar
                  dataKey="count"
                  fill="#FFD700"
                  radius={[0, 4, 4, 0]}
                  maxBarSize={28}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Section>

      {/* ── Party Breakdown ── */}
      <Section>
        <h2 className="text-2xl md:text-3xl font-bold text-[#e6edf3] mb-2">
          By Party
        </h2>
        <p className="text-sm text-[#8b949e] mb-6 max-w-2xl leading-relaxed">
          Which parties have the most donor-contractor connections — companies
          that both donated to the party and won government contracts.
        </p>
        {loading ? (
          <SkeletonChart height={320} />
        ) : partyData.length === 0 ? (
          <div className="rounded-xl border border-white/5 bg-[#12121a] p-12 text-center">
            <p className="text-[#8b949e]">No party data available</p>
          </div>
        ) : (
          <div className="rounded-xl border border-white/5 bg-[#12121a] p-4 md:p-6 animate-fade-in-up">
            <div className="space-y-3">
              {partyData.map((party, idx) => {
                const maxCount = partyData[0]?.count || 1;
                const pct = (party.count / maxCount) * 100;
                return (
                  <div key={party.name} className="group">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-medium text-[#e6edf3]">
                        {party.name}
                      </span>
                      <span className="text-sm font-mono text-[#8b949e]">
                        {party.count} links
                      </span>
                    </div>
                    <div className="h-6 rounded-md bg-white/[0.03] overflow-hidden">
                      <div
                        className="h-full rounded-md transition-all duration-700 ease-out"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: party.color,
                          opacity: 0.8,
                          animationDelay: `${idx * 100}ms`,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Section>

      {/* ── Methodology ── */}
      <Section>
        <div className="rounded-xl border border-[#FFD700]/10 bg-[#FFD700]/[0.03] p-6">
          <h3 className="text-lg font-bold text-[#e6edf3] mb-3">
            Methodology
          </h3>
          <p className="text-sm text-[#8b949e] leading-relaxed mb-3">
            This analysis cross-references three public datasets: AusTender
            government contract records, AEC political donation disclosures, and
            Hansard parliamentary speeches. A &ldquo;link&rdquo; is created when
            a company that donated to a political party also won a government
            contract, and an MP mentioned that company in Parliament.
          </p>
          <p className="text-sm text-[#8b949e] leading-relaxed">
            A &ldquo;party match&rdquo; means the MP&apos;s own party received
            donations from the same company — the strongest indicator of
            potential influence. Correlation does not imply causation, but
            patterns of donor-contractors deserve public scrutiny.
          </p>
        </div>
      </Section>
    </div>
  );
}

"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { Search, FileText, CheckCircle, XCircle, Clock, ChevronLeft, ChevronRight } from "lucide-react";
import {
  Skeleton,
  SkeletonCard,
  SkeletonChart,
  SkeletonText,
} from "@/components/skeleton";

import { API_BASE } from "@/lib/utils";

interface Bill {
  bill_id: number;
  title: string;
  status: string;
  portfolio: string | null;
  introduced_date: string | null;
  house: string | null;
}

interface BillStats {
  total: number;
  by_status: Record<string, number>;
  top_portfolios: Array<{ portfolio: string; count: number }>;
}

interface BillProgress {
  progress_id: number;
  stage: string;
  date: string | null;
  house: string | null;
  event_raw: string | null;
}

interface BillDetail extends Bill {
  progress: BillProgress[];
  related_speeches: Array<{
    speech_id: number;
    speaker_name: string | null;
    party: string | null;
    date: string | null;
    topic: string | null;
    text: string;
  }>;
}

const STATUS_COLORS: Record<string, string> = {
  passed: "#10B981",
  lapsed: "#EF4444",
  before_parliament: "#F59E0B",
};

const STATUS_LABELS: Record<string, string> = {
  passed: "Passed",
  lapsed: "Lapsed / Not Proceeding",
  before_parliament: "Before Parliament",
};

const STAGE_ORDER = [
  "introduced",
  "second_reading",
  "committee",
  "third_reading",
  "passed",
  "royal_assent",
];

const STAGE_LABELS: Record<string, string> = {
  introduced: "Introduced",
  second_reading: "Second Reading",
  committee: "Committee",
  third_reading: "Third Reading",
  passed: "Passed Both Houses",
  royal_assent: "Royal Assent",
};

// Topic keywords for matching bill titles
const TOPIC_KEYWORDS: Record<string, string[]> = {
  gambling: ["gambling", "poker", "betting", "wagering", "casino", "gaming", "lotteries"],
  health: ["health", "medical", "hospital", "pharmaceutical", "medicare", "aged care", "disability"],
  education: ["education", "school", "university", "student", "teacher", "curriculum"],
  defence: ["defence", "military", "veteran", "security", "intelligence"],
  environment: ["environment", "conservation", "biodiversity", "pollution", "emissions", "carbon"],
  immigration: ["immigration", "visa", "migration", "refugee", "asylum", "citizenship"],
  taxation: ["tax", "taxation", "gst", "superannuation", "revenue"],
  housing: ["housing", "rent", "mortgage", "property", "homelessness"],
  indigenous: ["indigenous", "aboriginal", "torres strait", "native title"],
  corruption: ["integrity", "corruption", "transparency", "whistleblower"],
};

/* ── Filter chip options ── */

const STATUS_CHIPS = [
  { value: "", label: "All", icon: FileText },
  { value: "passed", label: "Passed", icon: CheckCircle },
  { value: "lapsed", label: "Failed / Lapsed", icon: XCircle },
  { value: "before_parliament", label: "In Progress", icon: Clock },
];

const CHAMBER_CHIPS = [
  { value: "", label: "Both Chambers" },
  { value: "house", label: "House of Reps" },
  { value: "senate", label: "Senate" },
];

/* ── Pipeline stages for bill cards ── */

const PIPELINE_STAGES = [
  { key: "introduced", label: "Introduced" },
  { key: "debated", label: "Debated" },
  { key: "resolved", label: "Resolved" },
];

function getPipelineStage(bill: Bill): { stage: number; outcome: "passed" | "failed" | "pending" } {
  if (bill.status === "passed") return { stage: 3, outcome: "passed" };
  if (bill.status === "lapsed") return { stage: 3, outcome: "failed" };
  // before_parliament or unknown: assume at least introduced
  return { stage: 1, outcome: "pending" };
}

function formatDate(d: string | null): string {
  if (!d) return "--";
  try {
    return new Date(d).toLocaleDateString("en-AU", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return d;
  }
}

/* ── Skeleton loaders ── */

function StatsSkeleton() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
      {Array.from({ length: 4 }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

function ChartsSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
      <SkeletonChart height={280} />
      <SkeletonChart height={280} />
    </div>
  );
}

function BillListSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="rounded-lg border border-white/5 bg-[#12121a] p-4"
          style={{ animationDelay: `${i * 80}ms` }}
        >
          <div className="flex items-start justify-between gap-3 mb-3">
            <Skeleton className="h-4 flex-1" style={{ maxWidth: "70%" }} />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
          <div className="flex items-center gap-3 mb-3">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-3 w-14" />
          </div>
          {/* Pipeline skeleton */}
          <div className="flex items-center gap-1">
            <Skeleton className="h-1.5 flex-1 rounded-full" />
            <Skeleton className="h-1.5 flex-1 rounded-full" />
            <Skeleton className="h-1.5 flex-1 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="rounded-lg border border-white/5 bg-[#12121a] p-6">
      <Skeleton className="h-5 w-3/4 mb-4" />
      <div className="flex gap-2 mb-4">
        <Skeleton className="h-5 w-16 rounded-full" />
        <Skeleton className="h-5 w-20 rounded-full" />
      </div>
      <SkeletonText lines={4} className="mb-5" />
      <Skeleton className="h-4 w-40 mb-3" />
      <div className="space-y-3 pl-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-3 w-3 rounded-full" />
            <Skeleton className="h-3 flex-1" style={{ maxWidth: "60%" }} />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Pipeline Stepper ── */

function BillPipeline({ bill }: { bill: Bill }) {
  const { stage, outcome } = getPipelineStage(bill);

  return (
    <div className="flex items-center gap-0.5 mt-2.5">
      {PIPELINE_STAGES.map((ps, i) => {
        const stageNum = i + 1;
        const isReached = stage >= stageNum;
        const isLast = i === PIPELINE_STAGES.length - 1;

        let color = "bg-white/[0.06]"; // not reached
        if (isReached && isLast) {
          color = outcome === "passed" ? "bg-[#10B981]" : outcome === "failed" ? "bg-[#EF4444]" : "bg-[#F59E0B]";
        } else if (isReached) {
          color = outcome === "failed" ? "bg-[#EF4444]/60" : "bg-[#FFD700]/50";
        }

        return (
          <div key={ps.key} className="flex-1 flex flex-col items-center gap-1">
            <div
              className={`h-1.5 w-full rounded-full transition-colors duration-500 ${color}`}
            />
            <span className="text-[10px] text-[#8b949e]/60 leading-none hidden sm:block">
              {ps.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ── Main Page ── */

export default function BillsPage() {
  const [bills, setBills] = useState<Bill[]>([]);
  const [stats, setStats] = useState<BillStats | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [chamberFilter, setChamberFilter] = useState<string>("");
  const [topicFilter, setTopicFilter] = useState<string>("");
  const [offset, setOffset] = useState(0);
  const [selectedBill, setSelectedBill] = useState<BillDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const limit = 50;

  // Fade-in on mount
  useEffect(() => {
    setMounted(true);
  }, []);

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  const fetchBills = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (topicFilter && TOPIC_KEYWORDS[topicFilter]) {
        params.set("search", TOPIC_KEYWORDS[topicFilter][0]);
      } else if (searchDebounced) {
        params.set("search", searchDebounced);
      }
      if (chamberFilter) params.set("chamber", chamberFilter);
      params.set("limit", String(limit));
      params.set("offset", String(offset));

      const res = await fetch(`${API_BASE}/api/bills?${params}`);
      const data = await res.json();
      setBills(data.bills || []);
      setTotal(data.total || 0);
      setStats(data.stats || null);
    } catch (err) {
      console.error("Failed to fetch bills:", err);
    } finally {
      setLoading(false);
    }
  }, [searchDebounced, statusFilter, chamberFilter, topicFilter, offset]);

  useEffect(() => {
    fetchBills();
  }, [fetchBills]);

  // Reset offset when filters change
  useEffect(() => {
    setOffset(0);
  }, [searchDebounced, statusFilter, chamberFilter, topicFilter]);

  const fetchBillDetail = useCallback(async (billId: number) => {
    setDetailLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/bills/${billId}`);
      const data = await res.json();
      setSelectedBill(data);
    } catch (err) {
      console.error("Failed to fetch bill detail:", err);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  // Pie chart data for status distribution
  const statusPieData = useMemo(() => {
    if (!stats?.by_status) return [];
    return Object.entries(stats.by_status).map(([status, count]) => ({
      name: STATUS_LABELS[status] || status,
      value: count,
      fill: STATUS_COLORS[status] || "#8b949e",
    }));
  }, [stats]);

  // Portfolio bar chart data
  const portfolioChartData = useMemo(() => {
    if (!stats?.top_portfolios) return [];
    return stats.top_portfolios.slice(0, 10).map((p) => ({
      name: p.portfolio.length > 25 ? p.portfolio.slice(0, 22) + "..." : p.portfolio,
      count: p.count,
      fullName: p.portfolio,
    }));
  }, [stats]);

  const passRate = useMemo(() => {
    if (!stats?.by_status) return 0;
    const passed = stats.by_status["passed"] || 0;
    const t = stats.total || 1;
    return Math.round((passed / t) * 100);
  }, [stats]);

  return (
    <div
      className={`mx-auto max-w-6xl px-6 py-10 transition-opacity duration-700 ${
        mounted ? "opacity-100" : "opacity-0"
      }`}
    >
      {/* Header */}
      <div className="mb-8 animate-fade-in-up">
        <h1 className="text-3xl font-bold text-[#e6edf3] mb-2">
          Bills Lifecycle Tracker
        </h1>
        <p className="text-[#8b949e] text-lg">
          Track Commonwealth bills from introduction to Royal Assent.
          Covering 1998-2022 (39th-46th Parliaments).
        </p>
      </div>

      {/* Key Stats */}
      {loading && !stats ? (
        <StatsSkeleton />
      ) : stats ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8 animate-fade-in-up stagger-1">
          <div className="rounded-lg border border-white/10 bg-[#12121a] p-4 group hover:border-[#FFD700]/20 transition-colors">
            <div className="flex items-center gap-2 mb-1">
              <FileText className="w-4 h-4 text-[#FFD700]" />
              <span className="text-sm text-[#8b949e]">Total Bills</span>
            </div>
            <div className="text-2xl font-bold text-[#e6edf3]">
              {stats.total.toLocaleString()}
            </div>
          </div>
          <div className="rounded-lg border border-white/10 bg-[#12121a] p-4 group hover:border-[#10B981]/20 transition-colors">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle className="w-4 h-4 text-[#10B981]" />
              <span className="text-sm text-[#8b949e]">Pass Rate</span>
            </div>
            <div className="text-2xl font-bold text-[#10B981]">
              {passRate}%
            </div>
          </div>
          <div className="rounded-lg border border-white/10 bg-[#12121a] p-4 group hover:border-[#10B981]/20 transition-colors">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle className="w-4 h-4 text-[#10B981]" />
              <span className="text-sm text-[#8b949e]">Passed</span>
            </div>
            <div className="text-2xl font-bold text-[#10B981]">
              {(stats.by_status["passed"] || 0).toLocaleString()}
            </div>
          </div>
          <div className="rounded-lg border border-white/10 bg-[#12121a] p-4 group hover:border-[#EF4444]/20 transition-colors">
            <div className="flex items-center gap-2 mb-1">
              <XCircle className="w-4 h-4 text-[#EF4444]" />
              <span className="text-sm text-[#8b949e]">Lapsed</span>
            </div>
            <div className="text-2xl font-bold text-[#EF4444]">
              {(stats.by_status["lapsed"] || 0).toLocaleString()}
            </div>
          </div>
        </div>
      ) : null}

      {/* Charts Row */}
      {loading && !stats ? (
        <ChartsSkeleton />
      ) : stats ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8 animate-fade-in-up stagger-2">
          {/* Status Pie Chart */}
          <div className="rounded-lg border border-white/10 bg-[#12121a] p-5">
            <h3 className="text-lg font-semibold text-[#e6edf3] mb-4">
              Bills by Status
            </h3>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={statusPieData}
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  dataKey="value"
                  label={({ name, value }) =>
                    `${name}: ${value.toLocaleString()}`
                  }
                  labelLine={false}
                >
                  {statusPieData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "#1a1a2e",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: "8px",
                    color: "#e6edf3",
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Top Portfolios Bar Chart */}
          <div className="rounded-lg border border-white/10 bg-[#12121a] p-5">
            <h3 className="text-lg font-semibold text-[#e6edf3] mb-4">
              Top Portfolios
            </h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={portfolioChartData}
                layout="vertical"
                margin={{ left: 10, right: 20 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis type="number" stroke="#8b949e" tick={{ fontSize: 11 }} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={150}
                  stroke="#8b949e"
                  tick={{ fontSize: 10 }}
                />
                <Tooltip
                  contentStyle={{
                    background: "#1a1a2e",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: "8px",
                    color: "#e6edf3",
                  }}
                  formatter={(value) => [`${value} bills`, "Portfolio"]}
                />
                <Bar dataKey="count" fill="#FFD700" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : null}

      {/* Search Bar */}
      <div className="mb-4 animate-fade-in-up stagger-3">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8b949e]/50" />
          <input
            type="text"
            placeholder="Search bills by title or keyword..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-[#12121a] pl-10 pr-4 py-2.5 text-sm text-[#e6edf3] placeholder-[#8b949e]/40 focus:border-[#FFD700]/50 focus:outline-none focus:ring-1 focus:ring-[#FFD700]/20 transition-all"
          />
        </div>
      </div>

      {/* Filter Chips */}
      <div className="space-y-3 mb-6 animate-fade-in-up stagger-3">
        {/* Status chips */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-[#8b949e]/60 uppercase tracking-wider mr-1">Status</span>
          {STATUS_CHIPS.map((chip) => {
            const Icon = chip.icon;
            const isActive = statusFilter === chip.value;
            return (
              <button
                key={chip.value}
                onClick={() => setStatusFilter(chip.value)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                  isActive
                    ? "bg-[#FFD700]/15 text-[#FFD700] border border-[#FFD700]/30"
                    : "bg-white/[0.04] text-[#8b949e] border border-white/[0.06] hover:bg-white/[0.08] hover:text-[#e6edf3]"
                }`}
              >
                <Icon className="w-3 h-3" />
                {chip.label}
              </button>
            );
          })}
        </div>

        {/* Chamber chips */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-[#8b949e]/60 uppercase tracking-wider mr-1">Chamber</span>
          {CHAMBER_CHIPS.map((chip) => {
            const isActive = chamberFilter === chip.value;
            return (
              <button
                key={chip.value}
                onClick={() => setChamberFilter(chip.value)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                  isActive
                    ? "bg-[#FFD700]/15 text-[#FFD700] border border-[#FFD700]/30"
                    : "bg-white/[0.04] text-[#8b949e] border border-white/[0.06] hover:bg-white/[0.08] hover:text-[#e6edf3]"
                }`}
              >
                {chip.label}
              </button>
            );
          })}
        </div>

        {/* Topic filter (keep as select for the long list) */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-[#8b949e]/60 uppercase tracking-wider mr-1">Topic</span>
          <select
            value={topicFilter}
            onChange={(e) => setTopicFilter(e.target.value)}
            className="rounded-full border border-white/[0.06] bg-white/[0.04] px-3 py-1.5 text-xs text-[#8b949e] focus:border-[#FFD700]/50 focus:outline-none hover:bg-white/[0.08] transition-all"
          >
            <option value="">All Topics</option>
            {Object.keys(TOPIC_KEYWORDS).map((topic) => (
              <option key={topic} value={topic}>
                {topic.charAt(0).toUpperCase() + topic.slice(1).replace("_", " ")}
              </option>
            ))}
          </select>

          {topicFilter && TOPIC_KEYWORDS[topicFilter] && (
            <Link
              href={`/${topicFilter}`}
              className="rounded-full border border-[#FFD700]/30 bg-[#FFD700]/10 px-3 py-1.5 text-xs text-[#FFD700] hover:bg-[#FFD700]/20 transition-colors"
            >
              View {topicFilter} investigation
            </Link>
          )}
        </div>
      </div>

      {/* Results count */}
      <div className="text-sm text-[#8b949e] mb-4">
        {loading ? (
          <Skeleton className="h-3 w-48" />
        ) : (
          <>
            Showing {bills.length} of {total.toLocaleString()} bills
            {statusFilter && ` (${STATUS_LABELS[statusFilter] || statusFilter})`}
            {topicFilter && ` related to ${topicFilter}`}
          </>
        )}
      </div>

      {/* Two-panel layout: list + detail */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Bills List */}
        <div className="lg:col-span-3">
          {loading ? (
            <BillListSkeleton />
          ) : bills.length === 0 ? (
            <div className="rounded-lg border border-white/10 bg-[#12121a] p-8 text-center text-[#8b949e] animate-fade-in-up">
              <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No bills found matching your filters.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {bills.map((bill, i) => (
                <button
                  key={bill.bill_id}
                  onClick={() => fetchBillDetail(bill.bill_id)}
                  className={`w-full text-left rounded-lg border p-4 transition-all duration-200 animate-fade-in-up ${
                    selectedBill?.bill_id === bill.bill_id
                      ? "border-[#FFD700]/50 bg-[#FFD700]/5 shadow-[0_0_20px_rgba(255,215,0,0.05)]"
                      : "border-white/10 bg-[#12121a] hover:border-white/20 hover:bg-[#1a1a28]"
                  }`}
                  style={{ animationDelay: `${Math.min(i * 40, 400)}ms` }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-medium text-[#e6edf3] truncate">
                        {bill.title}
                      </h3>
                      <div className="flex items-center gap-3 mt-1.5 text-xs text-[#8b949e]">
                        {bill.introduced_date && (
                          <span>{formatDate(bill.introduced_date)}</span>
                        )}
                        {bill.portfolio && (
                          <span className="truncate max-w-[200px]">
                            {bill.portfolio}
                          </span>
                        )}
                        {bill.house && (
                          <span className="inline-flex items-center rounded bg-white/[0.04] px-1.5 py-0.5 text-[10px]">
                            {bill.house === "House of Representatives"
                              ? "Reps"
                              : "Senate"}
                          </span>
                        )}
                      </div>
                    </div>
                    <span
                      className="shrink-0 inline-block rounded-full px-2.5 py-0.5 text-xs font-medium"
                      style={{
                        backgroundColor:
                          (STATUS_COLORS[bill.status] || "#8b949e") + "20",
                        color: STATUS_COLORS[bill.status] || "#8b949e",
                      }}
                    >
                      {STATUS_LABELS[bill.status] || bill.status}
                    </span>
                  </div>

                  {/* Pipeline stepper */}
                  <BillPipeline bill={bill} />
                </button>
              ))}
            </div>
          )}

          {/* Pagination */}
          {total > limit && (
            <div className="flex items-center justify-between mt-4">
              <button
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - limit))}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-[#12121a] px-4 py-2 text-sm text-[#e6edf3] hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                Previous
              </button>
              <span className="text-sm text-[#8b949e]">
                Page {Math.floor(offset / limit) + 1} of{" "}
                {Math.ceil(total / limit)}
              </span>
              <button
                disabled={offset + limit >= total}
                onClick={() => setOffset(offset + limit)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-[#12121a] px-4 py-2 text-sm text-[#e6edf3] hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                Next
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Bill Detail Panel */}
        <div className="lg:col-span-2">
          {detailLoading ? (
            <DetailSkeleton />
          ) : selectedBill ? (
            <div className="rounded-lg border border-white/10 bg-[#12121a] p-6 sticky top-20 animate-fade-in-up">
              {/* Bill Title + Status */}
              <h2 className="text-lg font-semibold text-[#e6edf3] mb-3">
                {selectedBill.title}
              </h2>
              <div className="flex flex-wrap gap-2 mb-4">
                <span
                  className="inline-block rounded-full px-2.5 py-0.5 text-xs font-medium"
                  style={{
                    backgroundColor:
                      (STATUS_COLORS[selectedBill.status] || "#8b949e") + "20",
                    color: STATUS_COLORS[selectedBill.status] || "#8b949e",
                  }}
                >
                  {STATUS_LABELS[selectedBill.status] || selectedBill.status}
                </span>
                {selectedBill.house && (
                  <span className="inline-block rounded-full px-2.5 py-0.5 text-xs font-medium bg-white/5 text-[#8b949e]">
                    {selectedBill.house}
                  </span>
                )}
              </div>

              {/* Meta info */}
              <div className="space-y-1.5 mb-5 text-sm text-[#8b949e]">
                {selectedBill.introduced_date && (
                  <div>
                    <span className="text-[#e6edf3]/60">Introduced:</span>{" "}
                    {formatDate(selectedBill.introduced_date)}
                  </div>
                )}
                {selectedBill.portfolio && (
                  <div>
                    <span className="text-[#e6edf3]/60">Portfolio:</span>{" "}
                    {selectedBill.portfolio}
                  </div>
                )}
              </div>

              {/* Progress Timeline */}
              {selectedBill.progress.length > 0 && (
                <div className="mb-5">
                  <h3 className="text-sm font-semibold text-[#e6edf3] mb-3">
                    Progress Through Parliament
                  </h3>
                  <div className="relative pl-4 border-l-2 border-white/10 space-y-3">
                    {selectedBill.progress.map((p, idx) => {
                      const stageIdx = STAGE_ORDER.indexOf(p.stage);
                      const isTerminal =
                        p.stage === "royal_assent" || p.stage === "passed";
                      return (
                        <div
                          key={p.progress_id}
                          className="relative animate-fade-in-up"
                          style={{ animationDelay: `${idx * 60}ms` }}
                        >
                          <div
                            className="absolute -left-[21px] w-3 h-3 rounded-full border-2"
                            style={{
                              backgroundColor: isTerminal
                                ? "#10B981"
                                : stageIdx >= 0
                                ? "#FFD700"
                                : "#8b949e",
                              borderColor: isTerminal
                                ? "#10B981"
                                : stageIdx >= 0
                                ? "#FFD700"
                                : "#8b949e",
                            }}
                          />
                          <div className="text-sm">
                            <span className="font-medium text-[#e6edf3]">
                              {STAGE_LABELS[p.stage] || p.stage}
                            </span>
                            {p.house && (
                              <span className="text-[#8b949e] ml-2 text-xs">
                                ({p.house === "House of Representatives"
                                  ? "Reps"
                                  : p.house === "Senate"
                                  ? "Senate"
                                  : p.house})
                              </span>
                            )}
                            {p.date && (
                              <div className="text-xs text-[#8b949e] mt-0.5">
                                {formatDate(p.date)}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Related Speeches */}
              {selectedBill.related_speeches.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-[#e6edf3] mb-2">
                    Related Speeches
                  </h3>
                  <div className="space-y-2">
                    {selectedBill.related_speeches.slice(0, 5).map((s, idx) => (
                      <div
                        key={s.speech_id}
                        className="rounded border border-white/5 bg-white/[0.02] p-3 animate-fade-in-up"
                        style={{ animationDelay: `${idx * 60 + 200}ms` }}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-medium text-[#e6edf3]">
                            {s.speaker_name || "Unknown"}
                          </span>
                          {s.party && (
                            <span className="text-xs text-[#8b949e]">
                              ({s.party})
                            </span>
                          )}
                          {s.date && (
                            <span className="text-xs text-[#8b949e]">
                              {formatDate(s.date)}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-[#8b949e] line-clamp-3">
                          {s.text}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-white/10 bg-[#12121a] p-8 text-center text-[#8b949e] sticky top-20">
              <FileText className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p className="text-sm">
                Select a bill to view its progress through Parliament
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

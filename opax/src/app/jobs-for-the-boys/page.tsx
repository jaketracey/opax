"use client";

import { useState, useEffect, useRef } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { PartyBadge } from "@/components/party-badge";
import {
  Skeleton,
  SkeletonCard,
  SkeletonChart,
  SkeletonTable,
  SkeletonText,
  SkeletonAvatar,
} from "@/components/skeleton";

/* ── Types ── */

interface Summary {
  total_speeches: number;
  total_lobbyists_with_govt_links: number;
  total_donor_appointee_links: number;
  total_revolving_door_cases: number;
  themes: Record<string, number>;
  speeches_by_year: Record<string, number>;
  speeches_by_party: Record<string, number>;
}

interface Speaker {
  name: string;
  count: number;
  party: string;
  person_id: string;
}

interface Quote {
  speaker_name: string;
  party: string;
  date: string;
  text: string;
  theme: string;
  person_id: string;
}

interface Speech {
  speech_id: number;
  person_id: string;
  speaker_name: string;
  party: string;
  date: string;
  topic: string;
  text_snippet: string;
  theme: string;
}

interface RevolvingDoorCase {
  person_id: string;
  full_name: string;
  party: string;
  chamber: string;
  entered_house: string;
  left_house: string;
  total_contract_value?: number;
  total_donation_value?: number;
  companies?: number;
  events: Array<{
    type: string;
    date?: string;
    detail: string;
    clients?: string[];
    contract_value?: number;
    donation_value?: number;
    agency?: string;
  }>;
}

interface Report {
  summary: Summary;
  top_speakers: Speaker[];
  key_quotes: Quote[];
  appointment_speeches: Speech[];
  mp_lobbyists: Array<Record<string, unknown>>;
  donor_appointee_links: Array<Record<string, unknown>>;
  revolving_door_timeline: RevolvingDoorCase[];
  generated_at: string;
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
      className={`py-14 transition-all duration-700 ease-out ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"} ${className}`}
    >
      {children}
    </section>
  );
}

/* ── Helpers ── */

const fmt = (n: number) =>
  n >= 1_000_000
    ? `$${(n / 1_000_000).toFixed(1)}M`
    : n >= 1_000
      ? `$${(n / 1_000).toFixed(0)}K`
      : `$${n.toLocaleString()}`;

const THEME_LABELS: Record<string, string> = {
  trade_commissioner: "Trade Commissioner",
  ambassador_appointment: "Ambassador Appointments",
  board_appointment: "Board Appointments",
  barilaro_affair: "Barilaro Affair",
  revolving_door: "Revolving Door",
};

const THEME_COLORS: Record<string, string> = {
  trade_commissioner: "#FFD700",
  ambassador_appointment: "#3B82F6",
  board_appointment: "#8B5CF6",
  barilaro_affair: "#DC2626",
  revolving_door: "#F97316",
};

/* ── Page component ── */

export default function JobsForTheBoysPage() {
  const [data, setData] = useState<Report | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTheme, setActiveTheme] = useState<string | null>(null);

  useEffect(() => {
    const API = (typeof window !== "undefined" ? `http://${window.location.hostname}:8000` : "http://localhost:8000");
    fetch(`${API}/api/jobs-for-the-boys`)
      .then((r) => r.json())
      .then((resp) => {
        if (resp.data) {
          setData(resp.data);
        } else {
          setError("No data available yet. Run: python -m parli.analysis.political_appointments");
        }
      })
      .catch((e) => {
        setError(`Failed to load data: ${e.message}`);
      })
      .finally(() => setLoaded(true));
  }, []);

  // Build timeline chart data from speeches_by_year
  const timelineData = data
    ? Object.entries(data.summary.speeches_by_year)
        .map(([year, count]) => ({ year, count }))
        .sort((a, b) => a.year.localeCompare(b.year))
    : [];

  // Build party breakdown chart data
  const partyData = data
    ? Object.entries(data.summary.speeches_by_party)
        .map(([party, count]) => ({ party, count }))
        .sort((a, b) => b.count - a.count)
    : [];

  const partyColors: Record<string, string> = {
    Labor: "#E13A3A",
    Liberal: "#1C4FA0",
    Greens: "#00843D",
    Nationals: "#006644",
    Independent: "#888888",
    Other: "#555555",
  };

  // Filter speeches by active theme
  const filteredSpeeches = data
    ? activeTheme
      ? data.appointment_speeches.filter((s) => s.theme === activeTheme)
      : data.appointment_speeches
    : [];

  return (
    <div className="mx-auto max-w-6xl px-6">
      {/* ── Hero ── */}
      <section className="pt-16 pb-12 animate-fade-in-up">
        <p className="text-sm uppercase tracking-[0.2em] text-[#FFD700] mb-4 font-medium">
          Deep Dive -- Political Patronage
        </p>
        <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-[#e6edf3] leading-[1.1] mb-4 max-w-4xl">
          Jobs for the Boys:{" "}
          <span className="italic text-[#FFD700]">The Revolving Door</span>
        </h1>
        <p className="text-lg text-[#8b949e] max-w-2xl leading-relaxed mb-10">
          From trade commissioners to board appointments, tracking the pattern
          of political patronage in Australian governance. When politicians leave
          office, where do they go -- and who benefits?
        </p>

        {!loaded ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonCard key={i} className="text-center" />
            ))}
          </div>
        ) : error ? (
          <div className="rounded-xl border border-[#DC2626]/20 bg-[#DC2626]/5 p-6">
            <p className="text-sm text-[#DC2626]">{error}</p>
          </div>
        ) : data ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 animate-fade-in-up">
            <div className="rounded-xl border border-white/5 bg-[#12121a] p-4 text-center">
              <p className="text-2xl md:text-3xl font-bold text-[#FFD700]">
                {data.summary.total_speeches.toLocaleString()}
              </p>
              <p className="text-xs text-[#8b949e] mt-1 uppercase tracking-wider">
                Speeches
              </p>
            </div>
            <div className="rounded-xl border border-white/5 bg-[#12121a] p-4 text-center">
              <p className="text-2xl md:text-3xl font-bold text-[#FFD700]">
                {data.top_speakers.length}
              </p>
              <p className="text-xs text-[#8b949e] mt-1 uppercase tracking-wider">
                MPs Speaking
              </p>
            </div>
            <div className="rounded-xl border border-white/5 bg-[#12121a] p-4 text-center">
              <p className="text-2xl md:text-3xl font-bold text-[#F97316]">
                {data.summary.total_revolving_door_cases}
              </p>
              <p className="text-xs text-[#8b949e] mt-1 uppercase tracking-wider">
                Revolving Door Cases
              </p>
            </div>
            <div className="rounded-xl border border-white/5 bg-[#12121a] p-4 text-center">
              <p className="text-2xl md:text-3xl font-bold text-[#DC2626]">
                {Object.keys(data.summary.themes).length}
              </p>
              <p className="text-xs text-[#8b949e] mt-1 uppercase tracking-wider">
                Scandal Themes
              </p>
            </div>
          </div>
        ) : null}
      </section>

      {/* ── The Barilaro Case ── */}
      <Section>
        <h2 className="text-2xl md:text-3xl font-bold text-[#e6edf3] mb-2">
          The Archetype: Barilaro Affair
        </h2>
        <p className="text-sm text-[#8b949e] mb-8 max-w-2xl leading-relaxed">
          In 2022, former NSW Deputy Premier John Barilaro was appointed as
          Senior Trade and Investment Commissioner to the Americas -- a role
          worth over $500,000/year. The appointment became a flashpoint for
          scrutiny of political patronage across all levels of government.
        </p>
        <div className="rounded-xl border border-[#DC2626]/10 bg-[#DC2626]/5 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-[#DC2626]/20 flex items-center justify-center text-lg">
              !
            </div>
            <div>
              <h3 className="text-base font-semibold text-[#e6edf3]">
                {data?.summary.themes.barilaro_affair?.toLocaleString() ?? "--"}{" "}
                parliamentary speeches mention Barilaro
              </h3>
              <p className="text-xs text-[#8b949e]">
                Across both chambers of federal and state parliament
              </p>
            </div>
          </div>
          <p className="text-sm text-[#e6edf3]/70 leading-relaxed">
            The Barilaro affair triggered parliamentary inquiries, exposed
            weaknesses in appointment processes, and reignited debate about the
            &ldquo;revolving door&rdquo; between politics and cushy government
            roles. It prompted questions about similar appointments at the
            federal level -- ambassadorships, board seats, and trade roles given
            to political allies.
          </p>
        </div>
      </Section>

      {/* ── Speech Themes Breakdown ── */}
      {data && (
        <Section>
          <h2 className="text-2xl md:text-3xl font-bold text-[#e6edf3] mb-2">
            What Parliament is Saying
          </h2>
          <p className="text-sm text-[#8b949e] mb-8 max-w-2xl leading-relaxed">
            Parliamentary speeches about political appointments, broken down by
            theme. Click a theme to filter the speeches below.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-8">
            {Object.entries(data.summary.themes).map(([theme, count]) => (
              <button
                key={theme}
                onClick={() =>
                  setActiveTheme(activeTheme === theme ? null : theme)
                }
                className={`rounded-xl border p-4 text-left transition-all duration-200 ${
                  activeTheme === theme
                    ? "border-[#FFD700]/30 bg-[#FFD700]/10"
                    : "border-white/5 bg-[#12121a] hover:border-white/10"
                }`}
              >
                <p
                  className="text-xl font-bold mb-1"
                  style={{ color: THEME_COLORS[theme] || "#FFD700" }}
                >
                  {count.toLocaleString()}
                </p>
                <p className="text-xs text-[#8b949e]">
                  {THEME_LABELS[theme] || theme}
                </p>
              </button>
            ))}
          </div>
        </Section>
      )}

      {/* ── Timeline ── */}
      {data && timelineData.length > 0 && (
        <Section>
          <h2 className="text-2xl md:text-3xl font-bold text-[#e6edf3] mb-2">
            Speeches Over Time
          </h2>
          <p className="text-sm text-[#8b949e] mb-2 max-w-2xl leading-relaxed">
            When did parliament talk about political appointments? Spikes
            correlate with major scandals -- the Barilaro affair, ambassador
            controversies, and board appointment inquiries.
          </p>
          <p className="text-xs text-[#8b949e]/60 mb-6">
            Source: Hansard (parlinfo.aph.gov.au)
          </p>
          <div className="rounded-xl border border-white/5 bg-[#12121a] p-4 md:p-6">
            <ResponsiveContainer width="100%" height={340}>
              <BarChart
                data={timelineData}
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
                  labelFormatter={(l) => `Year: ${l}`}
                />
                <Bar
                  dataKey="count"
                  fill="#FFD700"
                  name="Speeches"
                  radius={[3, 3, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Section>
      )}

      {/* ── Party Breakdown ── */}
      {data && partyData.length > 0 && (
        <Section>
          <h2 className="text-2xl md:text-3xl font-bold text-[#e6edf3] mb-2">
            Who is Raising the Alarm?
          </h2>
          <p className="text-sm text-[#8b949e] mb-6 max-w-2xl leading-relaxed">
            Speeches about political appointments and the revolving door, by
            party. Opposition parties tend to raise these issues more -- but both
            sides have benefited from the system they criticise.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {partyData.map((p) => (
              <div
                key={p.party}
                className="rounded-xl border border-white/5 bg-[#12121a] p-4 text-center"
              >
                <p
                  className="text-2xl font-bold mb-1"
                  style={{ color: partyColors[p.party] || "#888" }}
                >
                  {p.count.toLocaleString()}
                </p>
                <PartyBadge party={p.party} />
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* ── Top Speakers ── */}
      {data && data.top_speakers.length > 0 && (
        <Section>
          <h2 className="text-2xl md:text-3xl font-bold text-[#e6edf3] mb-2">
            Top Voices on Political Appointments
          </h2>
          <p className="text-sm text-[#8b949e] mb-8 max-w-2xl leading-relaxed">
            The MPs who spoke most frequently about political appointments,
            patronage, and the revolving door.
          </p>
          <div className="rounded-xl border border-white/5 bg-[#12121a] overflow-hidden">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="px-5 py-3 text-xs uppercase tracking-wider text-[#8b949e] font-medium">
                    MP
                  </th>
                  <th className="px-5 py-3 text-xs uppercase tracking-wider text-[#8b949e] font-medium">
                    Party
                  </th>
                  <th className="px-5 py-3 text-xs uppercase tracking-wider text-[#8b949e] font-medium text-right">
                    Speeches
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.top_speakers.slice(0, 15).map((s, i) => (
                  <tr
                    key={s.name}
                    className="border-b border-white/5 hover:bg-white/[0.02] transition-colors"
                  >
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        {s.person_id && (
                          <div className="w-8 h-8 rounded-full overflow-hidden shrink-0 border border-white/10">
                            <img
                              src={`https://www.openaustralia.org.au/images/mpsL/${s.person_id}.jpg`}
                              alt={s.name}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display =
                                  "none";
                              }}
                            />
                          </div>
                        )}
                        <span className="text-sm font-medium text-[#e6edf3]">
                          {s.name}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <PartyBadge party={s.party} />
                    </td>
                    <td className="px-5 py-3 text-right">
                      <span className="text-sm font-bold text-[#FFD700]">
                        {s.count}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* ── Revolving Door ── */}
      {data && data.revolving_door_timeline.length > 0 && (
        <Section>
          <h2 className="text-2xl md:text-3xl font-bold text-[#e6edf3] mb-2">
            The Revolving Door
          </h2>
          <p className="text-sm text-[#8b949e] mb-8 max-w-2xl leading-relaxed">
            MPs who spoke about companies that later won government contracts,
            or who moved into lobbying and board roles after leaving parliament.
            The line between public service and private gain blurs.
          </p>
          <div className="space-y-4">
            {data.revolving_door_timeline.slice(0, 15).map((rd) => (
              <div
                key={rd.person_id + (rd.full_name || "")}
                className="rounded-xl border border-white/5 bg-[#12121a] p-5 hover:border-[#F97316]/20 transition-colors"
              >
                <div className="flex items-center gap-3 mb-3">
                  {rd.person_id && (
                    <div className="w-10 h-10 rounded-full overflow-hidden shrink-0 border border-white/10">
                      <img
                        src={`https://www.openaustralia.org.au/images/mpsL/${rd.person_id}.jpg`}
                        alt={rd.full_name}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-[#e6edf3]">
                        {rd.full_name || rd.person_id}
                      </span>
                      <PartyBadge party={rd.party} />
                      {rd.chamber && (
                        <span className="text-xs text-[#8b949e] px-2 py-0.5 rounded bg-white/5">
                          {rd.chamber}
                        </span>
                      )}
                    </div>
                    {(rd.total_contract_value ?? 0) > 0 && (
                      <p className="text-xs text-[#F97316] mt-0.5">
                        Contract links: {fmt(rd.total_contract_value!)}
                        {(rd.total_donation_value ?? 0) > 0 &&
                          ` | Donations: ${fmt(rd.total_donation_value!)}`}
                        {rd.companies &&
                          ` | ${rd.companies} ${rd.companies === 1 ? "company" : "companies"}`}
                      </p>
                    )}
                  </div>
                </div>
                <div className="pl-4 border-l-2 border-[#F97316]/30 space-y-2">
                  {rd.events.map((ev, i) => (
                    <div key={i} className="text-sm">
                      <span
                        className="inline-block rounded px-1.5 py-0.5 text-xs font-medium mr-2"
                        style={{
                          color:
                            ev.type === "became_lobbyist"
                              ? "#F97316"
                              : ev.type === "board_appointment"
                                ? "#8B5CF6"
                                : "#FFD700",
                          backgroundColor:
                            ev.type === "became_lobbyist"
                              ? "rgba(249,115,22,0.1)"
                              : ev.type === "board_appointment"
                                ? "rgba(139,92,246,0.1)"
                                : "rgba(255,215,0,0.1)",
                        }}
                      >
                        {ev.type === "became_lobbyist"
                          ? "Lobbyist"
                          : ev.type === "board_appointment"
                            ? "Board"
                            : "Contract Link"}
                      </span>
                      <span className="text-[#e6edf3]/80">{ev.detail}</span>
                      {ev.clients && ev.clients.length > 0 && (
                        <p className="text-xs text-[#8b949e] mt-1 ml-2">
                          Clients: {ev.clients.slice(0, 5).join(", ")}
                          {ev.clients.length > 5 &&
                            ` + ${ev.clients.length - 5} more`}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* ── Key Quotes ── */}
      {data && data.key_quotes.length > 0 && (
        <Section>
          <h2 className="text-2xl md:text-3xl font-bold text-[#e6edf3] mb-2">
            In Their Own Words
          </h2>
          <p className="text-sm text-[#8b949e] mb-8 max-w-2xl leading-relaxed">
            Direct quotes from parliamentary debate about political
            appointments, patronage, and the revolving door -- sourced from
            Hansard.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {data.key_quotes.slice(0, 12).map((q, i) => {
              const themeColor =
                THEME_COLORS[q.theme] || "#FFD700";
              return (
                <div
                  key={i}
                  className="rounded-xl border border-white/5 bg-[#12121a] p-5 hover:border-white/10 transition-colors"
                >
                  <div className="flex items-center gap-3 mb-4">
                    {q.person_id && (
                      <div className="w-10 h-10 rounded-full overflow-hidden shrink-0 border border-white/10">
                        <img
                          src={`https://www.openaustralia.org.au/images/mpsL/${q.person_id}.jpg`}
                          alt={q.speaker_name}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display =
                              "none";
                          }}
                        />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-[#e6edf3]">
                          {q.speaker_name}
                        </span>
                        <PartyBadge party={q.party} />
                      </div>
                      <p className="text-xs text-[#8b949e]">{q.date}</p>
                    </div>
                  </div>
                  <blockquote className="text-sm text-[#e6edf3]/80 italic leading-relaxed mb-4 pl-4 border-l-2 border-[#FFD700]/30">
                    &ldquo;
                    {q.text.length > 400
                      ? q.text.slice(0, 400) + "..."
                      : q.text}
                    &rdquo;
                  </blockquote>
                  <span
                    className="inline-flex items-center rounded-md px-2.5 py-1 text-xs font-semibold tracking-wide"
                    style={{
                      color: themeColor,
                      backgroundColor: `${themeColor}15`,
                    }}
                  >
                    {THEME_LABELS[q.theme] || q.theme}
                  </span>
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {/* ── Recent Speeches (filterable) ── */}
      {data && filteredSpeeches.length > 0 && (
        <Section>
          <h2 className="text-2xl md:text-3xl font-bold text-[#e6edf3] mb-2">
            Parliamentary Record
          </h2>
          <p className="text-sm text-[#8b949e] mb-6 max-w-2xl leading-relaxed">
            {activeTheme
              ? `Showing speeches tagged "${THEME_LABELS[activeTheme] || activeTheme}". `
              : "Recent speeches about political appointments. "}
            {activeTheme && (
              <button
                onClick={() => setActiveTheme(null)}
                className="text-[#FFD700] hover:underline"
              >
                Show all
              </button>
            )}
          </p>
          <div className="space-y-3">
            {filteredSpeeches.slice(0, 20).map((s) => (
              <div
                key={s.speech_id}
                className="rounded-xl border border-white/5 bg-[#12121a] p-4 hover:border-white/10 transition-colors"
              >
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span className="text-sm font-medium text-[#e6edf3]">
                    {s.speaker_name || "Unknown"}
                  </span>
                  <PartyBadge party={s.party} />
                  <span className="text-xs text-[#8b949e]">{s.date}</span>
                  <span
                    className="text-xs px-1.5 py-0.5 rounded"
                    style={{
                      color: THEME_COLORS[s.theme] || "#FFD700",
                      backgroundColor: `${THEME_COLORS[s.theme] || "#FFD700"}15`,
                    }}
                  >
                    {THEME_LABELS[s.theme] || s.theme}
                  </span>
                </div>
                {s.topic && (
                  <p className="text-xs text-[#FFD700]/60 mb-1">{s.topic}</p>
                )}
                <p className="text-sm text-[#8b949e] leading-relaxed">
                  {s.text_snippet && s.text_snippet.length > 300
                    ? s.text_snippet.slice(0, 300) + "..."
                    : s.text_snippet}
                </p>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* ── Loading fallback ── */}
      {!loaded && (
        <>
          <Section>
            <Skeleton className="h-8 w-64 mb-4" />
            <SkeletonText lines={2} className="mb-8 max-w-2xl" />
            <SkeletonChart height={340} />
          </Section>
          <Section>
            <Skeleton className="h-8 w-48 mb-4" />
            <SkeletonText lines={2} className="mb-8 max-w-2xl" />
            <SkeletonTable rows={8} />
          </Section>
          <Section>
            <Skeleton className="h-8 w-56 mb-4" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-white/5 bg-[#12121a] p-5"
                >
                  <div className="flex items-center gap-3 mb-4">
                    <SkeletonAvatar size={40} />
                    <div className="flex-1">
                      <Skeleton className="h-4 w-32 mb-1.5" />
                      <Skeleton className="h-3 w-20" />
                    </div>
                  </div>
                  <SkeletonText lines={3} className="mb-4 pl-4" />
                  <Skeleton className="h-5 w-28 rounded-md" />
                </div>
              ))}
            </div>
          </Section>
        </>
      )}

      {/* ── Methodology ── */}
      <Section>
        <div className="rounded-xl border border-white/5 bg-[#12121a] p-6">
          <h3 className="text-sm font-semibold text-[#FFD700] uppercase tracking-wider mb-3">
            Methodology
          </h3>
          <p className="text-sm text-[#8b949e] leading-relaxed mb-3">
            This investigation uses FTS5 full-text search across the Hansard
            record to identify speeches mentioning political appointments, the
            revolving door, board appointments, trade commissioners, and specific
            cases like the Barilaro affair. The revolving door section
            cross-references the federal lobbyist register, government board
            appointments, and contract-speech links to identify MPs connected to
            companies that won government contracts.
          </p>
          <p className="text-sm text-[#8b949e] leading-relaxed">
            Data sources: Hansard (parlinfo.aph.gov.au), Federal Lobbyist
            Register (Attorney-General&apos;s Department), AusTender government
            contracts, AEC donation returns. All data is publicly available.
          </p>
        </div>
      </Section>
    </div>
  );
}

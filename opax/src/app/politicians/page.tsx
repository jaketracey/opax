"use client";

import { useState, useEffect, useMemo } from "react";
import { PoliticianCard } from "@/components/politician-card";

import { API_BASE } from "@/lib/utils";

/* ── Hardcoded fallback data ── */
const FALLBACK_POLITICIANS = [
  { person_id: "10007", name: "Anthony Albanese", party: "Labor", electorate: "Grayndler", chamber: "representatives", keyStats: [{stat:"42%",label:"gambling reform support"},{stat:"69%",label:"housing affordability"},{stat:"89%",label:"climate action"},{stat:"78%",label:"anti-corruption"}] },
  { person_id: "10633", name: "Andrew Wilkie", party: "Independent", electorate: "Clark", chamber: "representatives", keyStats: [{stat:"94%",label:"gambling reform support"},{stat:"82%",label:"anti-corruption"},{stat:"71%",label:"climate action"}] },
  { person_id: "10001", name: "Tony Abbott", party: "Liberal", electorate: "Warringah", chamber: "representatives", keyStats: [{stat:"4%",label:"gambling reform support"},{stat:"3%",label:"climate action"},{stat:"2%",label:"housing affordability"},{stat:"6%",label:"media diversity"}] },
  { person_id: "10721", name: "Adam Bandt", party: "Greens", electorate: "Melbourne", chamber: "representatives", keyStats: [{stat:"98%",label:"gambling reform support"},{stat:"100%",label:"climate action"},{stat:"96%",label:"housing affordability"},{stat:"99%",label:"anti-corruption"}] },
  { person_id: "10678", name: "Penny Wong", party: "Labor", electorate: "SA", chamber: "senate", keyStats: [{stat:"38%",label:"gambling reform support"},{stat:"44%",label:"political donations reform"},{stat:"89%",label:"climate action"}] },
  { person_id: "10891", name: "Don Farrell", party: "Labor", electorate: "SA", chamber: "senate", keyStats: [{stat:"22%",label:"gambling reform support"},{stat:"28%",label:"political donations reform"},{stat:"68%",label:"climate action"}] },
  { person_id: "10088", name: "Peter Dutton", party: "Liberal", electorate: "Dickson", chamber: "representatives", keyStats: [{stat:"5%",label:"gambling reform support"},{stat:"3%",label:"climate action"},{stat:"6%",label:"anti-corruption"},{stat:"2%",label:"housing affordability"}] },
  { person_id: "10580", name: "Tanya Plibersek", party: "Labor", electorate: "Sydney", chamber: "representatives", keyStats: [{stat:"62%",label:"gambling reform support"},{stat:"91%",label:"climate action"},{stat:"85%",label:"housing affordability"}] },
  { person_id: "10350", name: "Barnaby Joyce", party: "Nationals", electorate: "New England", chamber: "representatives", keyStats: [{stat:"3%",label:"gambling reform support"},{stat:"1%",label:"climate action"},{stat:"4%",label:"media diversity"}] },
  { person_id: "10743", name: "Jim Chalmers", party: "Labor", electorate: "Rankin", chamber: "representatives", keyStats: [{stat:"58%",label:"gambling reform support"},{stat:"82%",label:"climate action"},{stat:"75%",label:"housing affordability"}] },
  { person_id: "10841", name: "Angus Taylor", party: "Liberal", electorate: "Hume", chamber: "representatives", keyStats: [{stat:"6%",label:"gambling reform support"},{stat:"2%",label:"climate action"},{stat:"5%",label:"political donations reform"}] },
  { person_id: "10738", name: "Richard Marles", party: "Labor", electorate: "Corio", chamber: "representatives", keyStats: [{stat:"55%",label:"gambling reform support"},{stat:"86%",label:"climate action"},{stat:"72%",label:"anti-corruption"}] },
  { person_id: "10707", name: "Michaelia Cash", party: "Liberal", electorate: "WA", chamber: "senate", keyStats: [{stat:"8%",label:"gambling reform support"},{stat:"4%",label:"climate action"},{stat:"6%",label:"housing affordability"}] },
  { person_id: "10719", name: "Sarah Hanson-Young", party: "Greens", electorate: "SA", chamber: "senate", keyStats: [{stat:"99%",label:"gambling reform support"},{stat:"100%",label:"climate action"},{stat:"97%",label:"anti-corruption"},{stat:"98%",label:"media diversity"}] },
  { person_id: "10722", name: "Larissa Waters", party: "Greens", electorate: "QLD", chamber: "senate", keyStats: [{stat:"97%",label:"gambling reform support"},{stat:"99%",label:"climate action"},{stat:"96%",label:"political donations reform"}] },
  { person_id: "10583", name: "Simon Birmingham", party: "Liberal", electorate: "SA", chamber: "senate", keyStats: [{stat:"8%",label:"gambling reform support"},{stat:"5%",label:"climate action"},{stat:"7%",label:"anti-corruption"}] },
  { person_id: "10415", name: "Sussan Ley", party: "Liberal", electorate: "Farrer", chamber: "representatives", keyStats: [{stat:"7%",label:"gambling reform support"},{stat:"3%",label:"climate action"},{stat:"5%",label:"housing affordability"}] },
  { person_id: "10080", name: "Chris Bowen", party: "Labor", electorate: "McMahon", chamber: "representatives", keyStats: [{stat:"60%",label:"gambling reform support"},{stat:"92%",label:"climate action"},{stat:"78%",label:"housing affordability"}] },
  { person_id: "10729", name: "Mark Dreyfus", party: "Labor", electorate: "Isaacs", chamber: "representatives", keyStats: [{stat:"64%",label:"gambling reform support"},{stat:"88%",label:"climate action"},{stat:"82%",label:"anti-corruption"}] },
  { person_id: "10849", name: "David Littleproud", party: "Nationals", electorate: "Maranoa", chamber: "representatives", keyStats: [{stat:"4%",label:"gambling reform support"},{stat:"2%",label:"climate action"},{stat:"5%",label:"housing affordability"}] },
];

type ChamberFilter = "all" | "representatives" | "senate";
type SortBy = "name" | "speeches" | "party";

interface PoliticianData {
  person_id: string;
  name: string;
  party: string;
  electorate: string;
  chamber: string;
  speech_count?: number;
  keyStat?: string;
  keyStatLabel?: string;
  keyStats?: { stat: string; label: string }[];
}

const PARTY_CHIP_STYLES: Record<string, { active: string; inactive: string; dot: string }> = {
  Labor: {
    active: "border-red-500/40 bg-red-900/25 text-red-400",
    inactive: "border-white/[0.06] text-[#8b949e] hover:border-red-800/30 hover:text-red-400/70",
    dot: "bg-red-500",
  },
  Liberal: {
    active: "border-blue-500/40 bg-blue-900/25 text-blue-400",
    inactive: "border-white/[0.06] text-[#8b949e] hover:border-blue-800/30 hover:text-blue-400/70",
    dot: "bg-blue-500",
  },
  Greens: {
    active: "border-green-500/40 bg-green-900/25 text-green-400",
    inactive: "border-white/[0.06] text-[#8b949e] hover:border-green-800/30 hover:text-green-400/70",
    dot: "bg-green-500",
  },
  Nationals: {
    active: "border-yellow-600/40 bg-yellow-900/25 text-yellow-500",
    inactive: "border-white/[0.06] text-[#8b949e] hover:border-yellow-800/30 hover:text-yellow-500/70",
    dot: "bg-yellow-600",
  },
  Independent: {
    active: "border-purple-500/40 bg-purple-900/25 text-purple-400",
    inactive: "border-white/[0.06] text-[#8b949e] hover:border-purple-800/30 hover:text-purple-400/70",
    dot: "bg-purple-500",
  },
};

const SORT_OPTIONS: { value: SortBy; label: string; icon: React.ReactNode }[] = [
  {
    value: "speeches",
    label: "Most speeches",
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
      </svg>
    ),
  },
  {
    value: "name",
    label: "A to Z",
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h9m5-4v12m0 0l-4-4m4 4l4-4" />
      </svg>
    ),
  },
  {
    value: "party",
    label: "By party",
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
];

export default function PoliticiansPage() {
  const [search, setSearch] = useState("");
  const [politicians, setPoliticians] = useState<PoliticianData[]>(FALLBACK_POLITICIANS);
  const [loading, setLoading] = useState(true);
  const [chamberFilter, setChamberFilter] = useState<ChamberFilter>("all");
  const [partyFilter, setPartyFilter] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<SortBy>("speeches");

  useEffect(() => {
    fetch(`${API_BASE}/api/mps?limit=500`)
      .then((r) => r.json())
      .then((data) => {
        if (data.mps && data.mps.length > 0) {
          const mapped: PoliticianData[] = data.mps.map((mp: Record<string, unknown>) => ({
            person_id: String(mp.person_id),
            name: String(mp.full_name || ""),
            party: String(mp.party || ""),
            electorate: String(mp.electorate || ""),
            chamber: String(mp.chamber || "representatives"),
            speech_count: Number(mp.speech_count) || 0,
            keyStatLabel: `${Number(mp.speech_count) || 0} speeches`,
          }));
          setPoliticians(mapped);
        }
      })
      .catch(() => {
        // Keep fallback data
      })
      .finally(() => setLoading(false));
  }, []);

  // Collect unique parties for filter chips
  const parties = useMemo(() => {
    const map: Record<string, number> = {};
    politicians.forEach((p) => {
      if (p.party) map[p.party] = (map[p.party] || 0) + 1;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [politicians]);

  const toggleParty = (party: string) => {
    setPartyFilter((prev) => {
      const next = new Set(prev);
      if (next.has(party)) next.delete(party);
      else next.add(party);
      return next;
    });
  };

  const filtered = useMemo(() => {
    let result = politicians;

    // Chamber filter
    if (chamberFilter !== "all") {
      result = result.filter((p) => p.chamber === chamberFilter);
    }

    // Party filter (multi-select)
    if (partyFilter.size > 0) {
      result = result.filter((p) => partyFilter.has(p.party));
    }

    // Search
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.party.toLowerCase().includes(q) ||
          p.electorate.toLowerCase().includes(q)
      );
    }

    // Sort
    if (sortBy === "name") {
      result = [...result].sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === "speeches") {
      result = [...result].sort((a, b) => (b.speech_count || 0) - (a.speech_count || 0));
    } else if (sortBy === "party") {
      result = [...result].sort((a, b) => a.party.localeCompare(b.party) || a.name.localeCompare(b.name));
    }

    return result;
  }, [politicians, chamberFilter, partyFilter, search, sortBy]);

  const chamberTabs: { key: ChamberFilter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "representatives", label: "House of Reps" },
    { key: "senate", label: "Senate" },
  ];

  const countForChamber = (key: ChamberFilter) => {
    if (key === "all") return politicians.length;
    return politicians.filter((p) => p.chamber === key).length;
  };

  const activeFilterCount = partyFilter.size + (chamberFilter !== "all" ? 1 : 0);

  return (
    <div className="mx-auto max-w-6xl px-6">
      <section className="pt-16 pb-8 animate-fade-in-up">
        <p className="text-sm uppercase tracking-[0.2em] text-[#FFD700] mb-4 font-medium">
          Politician Profiles
        </p>
        <h1 className="text-4xl md:text-5xl font-bold text-[#e6edf3] leading-[1.1] mb-4">
          Who Represents You?
        </h1>
        <p className="text-lg text-[#8b949e] max-w-2xl leading-relaxed mb-8">
          Search Australian politicians to see how their words match their votes.
          Every speech. Every division. Every dollar.
        </p>

        {/* Search bar */}
        <div className="relative max-w-xl mb-6">
          <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-[#8b949e]/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search by name, party, or electorate..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-12 rounded-xl border border-white/10 bg-[#12121a] pl-11 pr-4 text-sm text-[#e6edf3] placeholder:text-[#8b949e]/50 focus:outline-none focus:border-[#FFD700]/40 focus:ring-1 focus:ring-[#FFD700]/20 transition-all"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-[#8b949e] hover:text-[#e6edf3] transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Chamber filter tabs */}
        <div className="flex flex-wrap gap-1 mb-5">
          {chamberTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setChamberFilter(tab.key)}
              className={`px-4 py-2 text-sm rounded-lg font-medium transition-all duration-200 ${
                chamberFilter === tab.key
                  ? "bg-[#FFD700]/10 text-[#FFD700] shadow-inner shadow-[#FFD700]/5"
                  : "text-[#8b949e] hover:text-[#e6edf3] hover:bg-white/5"
              }`}
            >
              {tab.label}
              <span className="ml-1.5 text-xs opacity-50">
                ({countForChamber(tab.key)})
              </span>
            </button>
          ))}
        </div>

        {/* Party filter chips */}
        <div className="flex flex-wrap items-center gap-2 mb-5">
          <span className="text-[10px] uppercase tracking-[0.15em] text-[#8b949e]/50 font-medium mr-1">
            Party
          </span>
          {parties.map(([party, count]) => {
            const styles = PARTY_CHIP_STYLES[party] || {
              active: "border-zinc-500/40 bg-zinc-800/25 text-zinc-400",
              inactive: "border-white/[0.06] text-[#8b949e] hover:border-zinc-700/30",
              dot: "bg-zinc-500",
            };
            const isActive = partyFilter.has(party);
            return (
              <button
                key={party}
                onClick={() => toggleParty(party)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-all duration-200 ${
                  isActive ? styles.active : styles.inactive
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${styles.dot} ${isActive ? "opacity-100" : "opacity-30"} transition-opacity`} />
                {party}
                <span className={`ml-0.5 text-[10px] ${isActive ? "opacity-70" : "opacity-40"}`}>
                  {count}
                </span>
              </button>
            );
          })}
          {partyFilter.size > 0 && (
            <button
              onClick={() => setPartyFilter(new Set())}
              className="text-xs text-[#8b949e] hover:text-[#e6edf3] transition-colors ml-1"
            >
              Clear
            </button>
          )}
        </div>

        {/* Sort options */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1">
            <span className="text-[10px] uppercase tracking-[0.15em] text-[#8b949e]/50 font-medium mr-2">
              Sort
            </span>
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setSortBy(opt.value)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-all duration-200 ${
                  sortBy === opt.value
                    ? "text-[#e6edf3] bg-white/[0.06]"
                    : "text-[#8b949e]/60 hover:text-[#8b949e] hover:bg-white/[0.03]"
                }`}
              >
                {opt.icon}
                {opt.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-[#8b949e]/50">
            {filtered.length} politician{filtered.length !== 1 ? "s" : ""}
            {activeFilterCount > 0 && " (filtered)"}
          </p>
        </div>

        {loading && (
          <div className="flex items-center gap-2 mt-2">
            <div className="w-3 h-3 border-2 border-[#FFD700]/30 border-t-[#FFD700] rounded-full animate-spin" />
            <p className="text-xs text-[#8b949e]/50">Loading politicians from database...</p>
          </div>
        )}
      </section>

      <section className="pb-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((p, i) => (
            <PoliticianCard
              key={p.person_id}
              slug={p.person_id}
              name={p.name}
              party={p.party}
              electorate={p.electorate}
              chamber={p.chamber}
              photoId={p.person_id}
              keyStat={p.keyStat}
              keyStatLabel={p.keyStatLabel}
              keyStats={p.keyStats}
              className={`animate-fade-in-up ${i < 9 ? `stagger-${Math.min(i + 1, 9)}` : ""}`}
            />
          ))}
        </div>

        {filtered.length === 0 && !loading && (
          <div className="text-center py-20">
            <div className="relative w-20 h-20 mx-auto mb-5">
              <div className="absolute inset-0 rounded-full bg-white/[0.02]" />
              <div className="absolute inset-0 flex items-center justify-center">
                <svg className="w-8 h-8 text-[#8b949e]/25" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
            </div>
            <p className="text-[#e6edf3] text-lg font-medium mb-1.5">
              No politicians found
            </p>
            <p className="text-[#8b949e] text-sm max-w-sm mx-auto">
              {search
                ? <>No results for &ldquo;{search}&rdquo;. Try a different name, party, or electorate.</>
                : "Try adjusting your filters to see more results."}
            </p>
            {(partyFilter.size > 0 || chamberFilter !== "all") && (
              <button
                onClick={() => {
                  setPartyFilter(new Set());
                  setChamberFilter("all");
                  setSearch("");
                }}
                className="mt-4 text-sm text-[#FFD700]/70 hover:text-[#FFD700] transition-colors"
              >
                Clear all filters
              </button>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

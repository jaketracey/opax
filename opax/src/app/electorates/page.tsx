"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Search, X } from "lucide-react";
import { PartyBadge } from "@/components/party-badge";
import { Skeleton, SkeletonAvatar } from "@/components/skeleton";

import { API_BASE, getPhotoUrl } from "@/lib/utils";

interface ElectorateData {
  electorate: string;
  mp: string;
  party: string;
  personId: string;
  speeches: number;
}

const FALLBACK_ELECTORATES: ElectorateData[] = [
  { electorate: "Grayndler", mp: "Anthony Albanese", party: "Australian Labor Party", personId: "10007", speeches: 7864 },
  { electorate: "Watson", mp: "Tony Burke", party: "Australian Labor Party", personId: "10081", speeches: 3840 },
  { electorate: "McMahon", mp: "Chris Bowen", party: "Australian Labor Party", personId: "10060", speeches: 3222 },
  { electorate: "Sydney", mp: "Tanya Plibersek", party: "Australian Labor Party", personId: "10513", speeches: 2119 },
  { electorate: "Riverina", mp: "Michael McCormack", party: "National Party", personId: "10743", speeches: 2050 },
  { electorate: "Shortland", mp: "Pat Conroy", party: "Australian Labor Party", personId: "10813", speeches: 1925 },
  { electorate: "Kennedy", mp: "Bob Katter", party: "Katter's Australian Party", personId: "10352", speeches: 1676 },
  { electorate: "Isaacs", mp: "Mark Dreyfus", party: "Australian Labor Party", personId: "10181", speeches: 1432 },
  { electorate: "Farrer", mp: "Sussan Ley", party: "Liberal Party", personId: "10387", speeches: 1364 },
  { electorate: "Fenner", mp: "Andrew Leigh", party: "Australian Labor Party", personId: "10746", speeches: 1361 },
  { electorate: "New England", mp: "Barnaby Joyce", party: "Pauline Hanson's One Nation Party", personId: "10350", speeches: 1332 },
  { electorate: "Blair", mp: "Shayne Neumann", party: "Australian Labor Party", personId: "10485", speeches: 1304 },
  { electorate: "Ballarat", mp: "Catherine King", party: "Australian Labor Party", personId: "10368", speeches: 1292 },
  { electorate: "Adelaide", mp: "Steve Georganas", party: "Australian Labor Party", personId: "10245", speeches: 1217 },
  { electorate: "Makin", mp: "Tony Zappia", party: "Australian Labor Party", personId: "10695", speeches: 1181 },
  { electorate: "Chifley", mp: "Ed Husic", party: "Australian Labor Party", personId: "10749", speeches: 1110 },
  { electorate: "Gippsland", mp: "Darren Chester", party: "National Party", personId: "10703", speeches: 1015 },
  { electorate: "Wannon", mp: "Dan Tehan", party: "Liberal Party", personId: "10742", speeches: 961 },
  { electorate: "Kingston", mp: "Amanda Rishworth", party: "Australian Labor Party", personId: "10543", speeches: 912 },
  { electorate: "McEwen", mp: "Rob Mitchell", party: "Australian Labor Party", personId: "10733", speeches: 908 },
];

const partyBorderColors: Record<string, string> = {
  "Australian Labor Party": "#E13A3A",
  "Liberal Party": "#1C4FA0",
  "National Party": "#006644",
  "Liberal National Party": "#1C4FA0",
  "Australian Greens": "#00843D",
  "Greens": "#00843D",
  "Independent": "#888888",
  "Katter's Australian Party": "#8B0000",
  "Pauline Hanson's One Nation Party": "#F47920",
};

function shortParty(party: string): string {
  if (party.includes("Labor")) return "Labor";
  if (party.includes("Liberal National")) return "LNP";
  if (party.includes("Liberal")) return "Liberal";
  if (party.includes("National")) return "Nationals";
  if (party.includes("Green")) return "Greens";
  if (party.includes("Independent")) return "Independent";
  if (party.includes("Katter")) return "KAP";
  if (party.includes("One Nation")) return "One Nation";
  return party;
}

export default function ElectoratesPage() {
  const [search, setSearch] = useState("");
  const [electorates, setElectorates] = useState<ElectorateData[]>(FALLBACK_ELECTORATES);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE}/api/electorates`)
      .then((r) => r.json())
      .then((data) => {
        if (data.electorates && data.electorates.length > 0) {
          setElectorates(data.electorates);
        }
      })
      .catch(() => {
        // Keep fallback data
      })
      .finally(() => setLoading(false));
  }, []);

  const filtered = electorates.filter(
    (e) =>
      e.electorate.toLowerCase().includes(search.toLowerCase()) ||
      e.mp.toLowerCase().includes(search.toLowerCase()) ||
      e.party.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="mx-auto max-w-6xl px-6">
      <section className="pt-16 pb-8 animate-fade-in-up">
        <p className="text-sm uppercase tracking-[0.2em] text-[#FFD700] mb-4 font-medium">
          Electorates
        </p>
        <h1 className="text-4xl md:text-5xl font-bold text-[#e6edf3] leading-[1.1] mb-4">
          Find Your Electorate
        </h1>
        <p className="text-lg text-[#8b949e] max-w-2xl leading-relaxed mb-8">
          Every federal electorate, who represents it, their speech record, and
          the donations flowing to their party. Search by electorate name, MP, or
          party.
        </p>
        <div className="relative w-full max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8b949e]/60 pointer-events-none" />
          <input
            type="text"
            placeholder="Search electorates, MPs, or parties..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-11 rounded-lg border border-white/10 bg-[#12121a] pl-10 pr-9 text-sm text-[#e6edf3] placeholder:text-[#8b949e]/60 focus:outline-none focus:border-[#FFD700]/50 focus:ring-1 focus:ring-[#FFD700]/20 transition-colors"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8b949e]/60 hover:text-[#e6edf3] transition-colors"
              aria-label="Clear search"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <p className="text-xs text-[#8b949e]/50 mt-2">
          {loading
            ? "Loading electorates from database..."
            : `${filtered.length} electorate${filtered.length !== 1 ? "s" : ""} found`}
        </p>
      </section>

      <section className="pb-16">
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 12 }).map((_, i) => (
              <div
                key={i}
                className="rounded-xl border border-white/5 bg-[#12121a] p-5"
              >
                <div className="flex items-start gap-4">
                  <SkeletonAvatar size={56} />
                  <div className="flex-1 min-w-0">
                    <Skeleton className="h-5 w-28 mb-2" style={{ animationDelay: `${i * 60}ms` }} />
                    <div className="flex items-center gap-2 mb-2">
                      <Skeleton className="h-3.5 w-32" style={{ animationDelay: `${i * 60 + 30}ms` }} />
                      <Skeleton className="h-5 w-14 rounded-full" style={{ animationDelay: `${i * 60 + 60}ms` }} />
                    </div>
                    <Skeleton className="h-3 w-36" style={{ animationDelay: `${i * 60 + 90}ms` }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((e, i) => {
              const borderColor =
                partyBorderColors[e.party] || "#888888";
              return (
                <Link
                  key={e.electorate}
                  href={`/electorates/${encodeURIComponent(e.electorate)}`}
                  className={`group block rounded-xl border border-white/5 bg-[#12121a] p-5 transition-all hover:border-white/10 hover:bg-[#16161f] animate-fade-in-up stagger-${Math.min(i + 1, 8)}`}
                >
                  <div className="flex items-start gap-4">
                    <div
                      className="w-14 h-14 rounded-full overflow-hidden shrink-0 border-2"
                      style={{ borderColor }}
                    >
                      <img
                        src={getPhotoUrl(e.personId)}
                        alt={e.mp}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-semibold text-[#e6edf3] group-hover:text-white transition-colors mb-0.5">
                        {e.electorate}
                      </h3>
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-sm text-[#8b949e] truncate">
                          {e.mp}
                        </span>
                        <PartyBadge party={shortParty(e.party)} />
                      </div>
                      <p className="text-xs text-[#8b949e]/70">
                        {e.speeches.toLocaleString()} speeches in Hansard
                      </p>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="text-center py-16 animate-fade-in-up">
            <p className="text-[#8b949e] text-lg">
              No electorates found matching &ldquo;{search}&rdquo;
            </p>
            <p className="text-[#8b949e]/60 text-sm mt-2">
              Try searching by electorate name, MP name, or party
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

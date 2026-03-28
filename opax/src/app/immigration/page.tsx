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
  Legend,
  Cell,
} from "recharts";
import { PartyBadge } from "@/components/party-badge";
import { SkeletonChart, SkeletonTable } from "@/components/skeleton";

/* == Data generated from parli.db == */

const TIMELINE = [
  {
    "year": "1998",
    "ALP": 223,
    "COA": 247,
    "GRN": 0,
    "IND": 31,
    "Other": 102
  },
  {
    "year": "1999",
    "ALP": 321,
    "COA": 405,
    "GRN": 0,
    "IND": 4,
    "Other": 124
  },
  {
    "year": "2000",
    "ALP": 306,
    "COA": 378,
    "GRN": 0,
    "IND": 20,
    "Other": 121
  },
  {
    "year": "2001",
    "ALP": 292,
    "COA": 391,
    "GRN": 0,
    "IND": 42,
    "Other": 92
  },
  {
    "year": "2002",
    "ALP": 620,
    "COA": 712,
    "GRN": 0,
    "IND": 21,
    "Other": 177
  },
  {
    "year": "2003",
    "ALP": 552,
    "COA": 623,
    "GRN": 17,
    "IND": 25,
    "Other": 179
  },
  {
    "year": "2004",
    "ALP": 287,
    "COA": 311,
    "GRN": 20,
    "IND": 22,
    "Other": 194
  },
  {
    "year": "2005",
    "ALP": 491,
    "COA": 347,
    "GRN": 0,
    "IND": 15,
    "Other": 397
  },
  {
    "year": "2006",
    "ALP": 545,
    "COA": 410,
    "GRN": 0,
    "IND": 21,
    "Other": 138
  },
  {
    "year": "2007",
    "ALP": 245,
    "COA": 275,
    "GRN": 0,
    "IND": 11,
    "Other": 106
  },
  {
    "year": "2008",
    "ALP": 440,
    "COA": 216,
    "GRN": 0,
    "IND": 6,
    "Other": 67
  },
  {
    "year": "2009",
    "ALP": 608,
    "COA": 354,
    "GRN": 0,
    "IND": 21,
    "Other": 87
  },
  {
    "year": "2010",
    "ALP": 522,
    "COA": 330,
    "GRN": 1,
    "IND": 10,
    "Other": 93
  },
  {
    "year": "2011",
    "ALP": 833,
    "COA": 625,
    "GRN": 12,
    "IND": 16,
    "Other": 155
  },
  {
    "year": "2012",
    "ALP": 678,
    "COA": 669,
    "GRN": 23,
    "IND": 27,
    "Other": 110
  },
  {
    "year": "2013",
    "ALP": 569,
    "COA": 557,
    "GRN": 11,
    "IND": 13,
    "Other": 102
  },
  {
    "year": "2014",
    "ALP": 602,
    "COA": 806,
    "GRN": 19,
    "IND": 18,
    "Other": 120
  },
  {
    "year": "2015",
    "ALP": 760,
    "COA": 916,
    "GRN": 24,
    "IND": 22,
    "Other": 147
  },
  {
    "year": "2016",
    "ALP": 510,
    "COA": 523,
    "GRN": 16,
    "IND": 25,
    "Other": 142
  },
  {
    "year": "2017",
    "ALP": 626,
    "COA": 580,
    "GRN": 23,
    "IND": 30,
    "Other": 120
  },
  {
    "year": "2018",
    "ALP": 609,
    "COA": 528,
    "GRN": 35,
    "IND": 35,
    "Other": 78
  },
  {
    "year": "2019",
    "ALP": 420,
    "COA": 497,
    "GRN": 15,
    "IND": 29,
    "Other": 71
  },
  {
    "year": "2020",
    "ALP": 508,
    "COA": 476,
    "GRN": 12,
    "IND": 55,
    "Other": 88
  },
  {
    "year": "2021",
    "ALP": 587,
    "COA": 585,
    "GRN": 9,
    "IND": 57,
    "Other": 80
  },
  {
    "year": "2022",
    "ALP": 204,
    "COA": 144,
    "GRN": 6,
    "IND": 37,
    "Other": 26
  },
  {
    "year": "2024",
    "ALP": 0,
    "COA": 0,
    "GRN": 0,
    "IND": 0,
    "Other": 9
  },
  {
    "year": "2025",
    "ALP": 16,
    "COA": 1,
    "GRN": 1,
    "IND": 1,
    "Other": 0
  }
];

const DONATION_FLOW = [
  {
    "donor": "Settlement Services International",
    "party": "Communication Workers Union Central Branch",
    "amount": 5293536
  },
  {
    "donor": "Settlement Services Ltd",
    "party": "Communication Workers Union Central Branch",
    "amount": 4952109
  },
  {
    "donor": "Settlements Services International",
    "party": "Communication Workers Union Central Branch",
    "amount": 2488299
  },
  {
    "donor": "CBA BANK - SETTLEMENT",
    "party": "HSU East",
    "amount": 2199744
  },
  {
    "donor": "PRESTIGE SETTLEMENT",
    "party": "Transport Workers Union (WA Branch)",
    "amount": 1130052
  },
  {
    "donor": "Pexa Settlement",
    "party": "The Australian Workers' Union of Employees Queensland",
    "amount": 844317
  },
  {
    "donor": "Drobis Settlement",
    "party": "Liberal Party of Australia",
    "amount": 300000
  }
];

const TOP_DONORS = [
  {
    "name": "Settlement Services International",
    "total": 5302536,
    "donations": 12,
    "period": "2015-16-2023-24"
  },
  {
    "name": "Settlement Services Ltd",
    "total": 4952109,
    "donations": 12,
    "period": "2018-19-2021-22"
  },
  {
    "name": "Settlements Services International",
    "total": 2488299,
    "donations": 9,
    "period": "2012-13-2014-15"
  },
  {
    "name": "CBA BANK - SETTLEMENT",
    "total": 2199744,
    "donations": 3,
    "period": "2009-2010-2009-2010"
  },
  {
    "name": "PRESTIGE SETTLEMENT",
    "total": 1130052,
    "donations": 3,
    "period": "2024-25-2024-25"
  },
  {
    "name": "Pexa Settlement",
    "total": 844317,
    "donations": 3,
    "period": "2024-25-2024-25"
  }
];

const PARTY_DONATIONS = [
  {
    "party": "Communication Workers Union Central Branch",
    "amount": 12733944,
    "color": "#888888"
  },
  {
    "party": "HSU East",
    "amount": 2199744,
    "color": "#888888"
  },
  {
    "party": "Transport Workers Union (WA Branch)",
    "amount": 1130052,
    "color": "#888888"
  },
  {
    "party": "The Australian Workers' Union of Employees Queensland",
    "amount": 844317,
    "color": "#888888"
  },
  {
    "party": "National Party of Australia - Victoria",
    "amount": 596094,
    "color": "#888888"
  },
  {
    "party": "Liberal Party of Australia",
    "amount": 300000,
    "color": "#888888"
  }
];

const REAL_QUOTES = [
  {
    "speaker": "O'Neill, Deb, MP",
    "party": "ALP",
    "photoId": "",
    "date": "2011-05-25",
    "text": "I rise to speak on the Migration Amendment (Complementary Protection) Bill 2011. I believe that this bill addresses sensitive issues which we on this side of the parliament view with complete seriousness and responsibility. In the electorate of Rober",
    "context": "for"
  },
  {
    "speaker": "Ruddock, Philip, MP",
    "party": "Unknown",
    "photoId": "",
    "date": "2002-09-23",
    "text": "Minister for Immigration and Multicultural and Indigenous Affairs and Minister Assisting the Prime Minister for Reconciliation Mr Ruddock \u2014The answer to the honourable member's question is as follows: 0 (1) The 2002-03 budget provided $1.4m a year ov",
    "context": "for"
  },
  {
    "speaker": "Danby, Michael, MP",
    "party": "ALP",
    "photoId": "",
    "date": "2009-05-14",
    "text": "The rhetoric coming from the opposition in relation to unauthorised boat arrivals and immigration detention has been somewhat surprising. Over the past 10 months I have been working closely on these issues with members of the opposition on the Joint ",
    "context": "for"
  },
  {
    "speaker": "Morrison, Scott, MP",
    "party": "LP",
    "photoId": "",
    "date": "2014-09-25",
    "text": "I move: That this bill be now read a second time. The Migration and Maritime Powers Legislation Amendment (Resolving the Asylum Legacy Caseload) Bill 2014 honours the coalition's commitment to restore the full suite of border protection and immigrati",
    "context": "for"
  },
  {
    "speaker": "McGauran, Peter, MP",
    "party": "NATS",
    "photoId": "",
    "date": "2005-06-15",
    "text": "You have been briefed. That is because the department issued, on 8 June, a media statement headed \u2018Setting the record straight\u2014contact with the PRC consulate\u2019. The member continually makes charges against DIMIA to the effect that they are in breach o",
    "context": "for"
  },
  {
    "speaker": "Irons, Steve, MP",
    "party": "LP",
    "photoId": "",
    "date": "2014-09-22",
    "text": "I rise today to speak on the Migration Amendment (Protection and Other Measures) Bill 2014. I acknowledge the contribution made by the member for Berowra. He has extensive experience and knowledge in this area and it is good to see he is supporting t",
    "context": "for"
  }
];

const TOP_SPEAKERS = [
  {
    "name": "Ruddock, Philip, MP",
    "party": "LP",
    "speeches": 923,
    "photoId": ""
  },
  {
    "name": "Morrison, Scott, MP",
    "party": "LP",
    "speeches": 841,
    "photoId": ""
  },
  {
    "name": "Dutton, Peter, MP",
    "party": "LP",
    "speeches": 494,
    "photoId": ""
  },
  {
    "name": "Gillard, Julia, MP",
    "party": "ALP",
    "speeches": 466,
    "photoId": ""
  },
  {
    "name": "Ferguson, Laurie, MP",
    "party": "ALP",
    "speeches": 349,
    "photoId": ""
  },
  {
    "name": "Abbott, Tony, MP",
    "party": "LP",
    "speeches": 347,
    "photoId": ""
  },
  {
    "name": "Hayes, Chris, MP",
    "party": "ALP",
    "speeches": 321,
    "photoId": ""
  },
  {
    "name": "Bowen, Chris, MP",
    "party": "ALP",
    "speeches": 311,
    "photoId": ""
  },
  {
    "name": "Albanese, Anthony, MP",
    "party": "ALP",
    "speeches": 305,
    "photoId": ""
  },
  {
    "name": "Rudd, Kevin, MP",
    "party": "ALP",
    "speeches": 293,
    "photoId": ""
  }
];

const TVFY_SCORES = [
  {
    "party": "SPK",
    "support": 100.0,
    "color": "#888888",
    "mps": 1
  },
  {
    "party": "Centre Alliance",
    "support": 99.0,
    "color": "#888888",
    "mps": 2
  },
  {
    "party": "Australian Democrats",
    "support": 97.3,
    "color": "#888888",
    "mps": 3
  },
  {
    "party": "Australian Greens",
    "support": 96.3,
    "color": "#888888",
    "mps": 18
  },
  {
    "party": "Jacqui Lambie Network",
    "support": 80.0,
    "color": "#888888",
    "mps": 1
  },
  {
    "party": "Australian Labor Party",
    "support": 73.4,
    "color": "#888888",
    "mps": 136
  },
  {
    "party": "Nick Xenophon Team",
    "support": 71.5,
    "color": "#888888",
    "mps": 2
  },
  {
    "party": "Derryn Hinch's Justice Party",
    "support": 71.0,
    "color": "#888888",
    "mps": 1
  },
  {
    "party": "Independent",
    "support": 52.1,
    "color": "#888888",
    "mps": 15
  },
  {
    "party": "Katter's Australian Party",
    "support": 45.0,
    "color": "#888888",
    "mps": 1
  }
];

const KEY_MOMENTS = [
  {
    "year": "1998",
    "title": "Early Immigration Debates",
    "desc": "Parliamentary discussion of immigration begins in earnest.",
    "outcome": "Ongoing debate",
    "outcomeColor": "#FFD700"
  },
  {
    "year": "2015",
    "title": "Peak Parliamentary Interest",
    "desc": "The year with the most speeches on immigration, reflecting heightened public concern.",
    "outcome": "Heightened scrutiny",
    "outcomeColor": "#FFD700"
  },
  {
    "year": "2025",
    "title": "Current State",
    "desc": "Where the parliamentary debate on immigration stands today.",
    "outcome": "Under review",
    "outcomeColor": "#FFD700"
  }
];

const HUMAN_COST = [
  {
    "stat": "28,263",
    "label": "Parliamentary speeches about immigration",
    "src": "Hansard parliamentary record"
  },
  {
    "stat": "745",
    "label": "Distinct MPs who spoke on immigration",
    "src": "Hansard parliamentary record"
  },
  {
    "stat": "$18.3M",
    "label": "In related industry donations to political parties",
    "src": "AEC annual returns"
  }
];

const ACTION_ITEMS = [
  {
    "title": "Contact Your MP",
    "desc": "Tell your representative you care about immigration policy.",
    "link": "https://www.openaustralia.org.au/",
    "linkText": "Find your MP"
  },
  {
    "title": "Check Donation Records",
    "desc": "See who funds your local member.",
    "link": "https://transparency.aec.gov.au/",
    "linkText": "AEC Transparency Register"
  },
  {
    "title": "Read the Hansard",
    "desc": "Read what your MP actually said about immigration.",
    "link": "https://www.aph.gov.au/Parliamentary_Business/Hansard",
    "linkText": "Parliamentary Hansard"
  },
  {
    "title": "Share This Investigation",
    "desc": "Help others understand the gap between rhetoric and action.",
    "link": "#",
    "linkText": "Copy link"
  }
];

/* == Scroll-triggered visibility hook == */
function useScrollReveal() {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold: 0.12 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return { ref, visible };
}

function Section({ children, className = "" }: { children: React.ReactNode; className?: string }) {
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

/* == Helpers == */
const partyColors: Record<string, string> = {
  Labor: "#E13A3A", Liberal: "#1C4FA0", Greens: "#00843D",
  Nationals: "#006644", Independent: "#888888", ALP: "#E13A3A",
  "One Nation": "#F97316", Democrats: "#FFD700", LNP: "#1C4FA0",
  UAP: "#7C3AED", COA: "#1C4FA0",
};

/* == Stacked bar data for Follow the Dollar == */
function buildDonorByParty() {
  const donors = [...new Set(DONATION_FLOW.map((d: { donor: string }) => d.donor))];
  return donors.map((donor) => {
    const row: Record<string, string | number> = { donor };
    let total = 0;
    for (const entry of DONATION_FLOW.filter((d: { donor: string }) => d.donor === donor)) {
      row[entry.party] = entry.amount;
      total += entry.amount;
    }
    row.total = total;
    return row;
  }).sort((a, b) => (b.total as number) - (a.total as number));
}

export default function InvestigationPage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const donorByParty = buildDonorByParty();
  const donorParties = [...new Set(DONATION_FLOW.map((d: { party: string }) => d.party))];
  const maxSpeaker = TOP_SPEAKERS.length > 0 ? TOP_SPEAKERS[0].speeches : 1;

  return (
    <div className="mx-auto max-w-6xl px-6">
      {/* -- Hero -- */}
      <section className="pt-16 pb-12 animate-fade-in-up">
        <p className="text-sm uppercase tracking-[0.2em] text-[#FFD700] mb-4 font-medium">
          Deep Dive &mdash; Investigation 010
        </p>
        <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-[#e6edf3] leading-[1.1] mb-4 max-w-4xl">
          Immigration: Follow the Record
        </h1>
        <p className="text-lg text-[#8b949e] max-w-2xl leading-relaxed mb-10">
          28,263 speeches. $18.3M in related donations. What changed?
        </p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="animate-fade-in-up stagger-1 rounded-xl border border-white/5 bg-[#12121a] p-4 text-center hover:border-[#FFD700]/20 transition-colors">
            <p className="text-2xl md:text-3xl font-bold text-[#FFD700]">28,263</p>
            <p className="text-xs text-[#8b949e] mt-1 uppercase tracking-wider">Speeches</p>
          </div>
          <div className="animate-fade-in-up stagger-2 rounded-xl border border-white/5 bg-[#12121a] p-4 text-center hover:border-[#FFD700]/20 transition-colors">
            <p className="text-2xl md:text-3xl font-bold text-[#FFD700]">745</p>
            <p className="text-xs text-[#8b949e] mt-1 uppercase tracking-wider">MPs Spoke</p>
          </div>
          <div className="animate-fade-in-up stagger-3 rounded-xl border border-white/5 bg-[#12121a] p-4 text-center hover:border-[#FFD700]/20 transition-colors">
            <p className="text-2xl md:text-3xl font-bold text-[#FFD700]">$18.3M</p>
            <p className="text-xs text-[#8b949e] mt-1 uppercase tracking-wider">Related Donations</p>
          </div>
          <div className="animate-fade-in-up stagger-4 rounded-xl border border-white/5 bg-[#12121a] p-4 text-center hover:border-[#FFD700]/20 transition-colors">
            <p className="text-2xl md:text-3xl font-bold text-[#FFD700]">1998&ndash;2025</p>
            <p className="text-xs text-[#8b949e] mt-1 uppercase tracking-wider">Time Span</p>
          </div>
        </div>
      </section>

      {/* -- The Human Cost / Impact -- */}
      <Section>
        <h2 className="text-2xl md:text-3xl font-bold text-[#e6edf3] mb-2">
          Why It Matters
        </h2>
        <p className="text-sm text-[#8b949e] mb-8 max-w-2xl leading-relaxed">
          For over two decades, Australian MPs have debated immigration in Parliament. 28,263 speeches from 745 MPs tell a story of rhetoric that often outpaces legislative action.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {HUMAN_COST.map((d: { stat: string; label: string; src: string }) => (
            <div key={d.stat} className="rounded-xl border border-white/5 bg-[#12121a] p-6 group hover:border-[#DC2626]/20 transition-colors">
              <p className="text-3xl md:text-4xl font-bold text-[#DC2626] mb-2">{d.stat}</p>
              <p className="text-sm text-[#e6edf3]/80 leading-relaxed mb-3">{d.label}</p>
              <p className="text-xs text-[#8b949e]/60">{d.src}</p>
            </div>
          ))}
        </div>
        <div className="mt-6 rounded-xl border border-[#DC2626]/10 bg-[#DC2626]/5 p-5">
          <p className="text-sm text-[#e6edf3]/70 leading-relaxed">
            The parliamentary record on immigration reveals a pattern common across Australian politics: passionate debate in the chamber paired with limited legislative progress. Understanding this gap is the first step toward accountability.
          </p>
        </div>
      </Section>

      {/* -- Timeline -- */}
      <Section>
        <h2 className="text-2xl md:text-3xl font-bold text-[#e6edf3] mb-2">
          Parliamentary Debate Over Time
        </h2>
        <p className="text-sm text-[#8b949e] mb-2 max-w-2xl leading-relaxed">
          Speeches about immigration peaked in 2015, driven by major policy debates of the era. The volume of parliamentary discussion has fluctuated significantly, often spiking around elections and key legislative moments.
        </p>
        <p className="text-xs text-[#8b949e]/60 mb-6">
          Source: Hansard (parlinfo.aph.gov.au)
        </p>
        {!mounted ? (
          <SkeletonChart height={380} />
        ) : (
          <div className="rounded-xl border border-white/5 bg-[#12121a] p-4 md:p-6">
            <ResponsiveContainer width="100%" height={380}>
              <BarChart data={TIMELINE} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="year" tick={{ fill: "#8b949e", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "rgba(255,255,255,0.1)" }} interval={2} />
                <YAxis tick={{ fill: "#8b949e", fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ backgroundColor: "#12121a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#e6edf3", fontSize: 13 }} cursor={{ fill: "rgba(255,215,0,0.05)" }} labelFormatter={(l) => `Year: ${l}`} />
                <Legend wrapperStyle={{ fontSize: 12, color: "#8b949e" }} iconType="square" iconSize={10} />
                <Bar dataKey="ALP" stackId="a" fill="#E13A3A" name="Labor" />
                <Bar dataKey="COA" stackId="a" fill="#1C4FA0" name="Coalition" />
                <Bar dataKey="GRN" stackId="a" fill="#00843D" name="Greens" />
                <Bar dataKey="IND" stackId="a" fill="#888888" name="Independent" />
                <Bar dataKey="Other" stackId="a" fill="#7C3AED" name="Other" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Section>

      {/* -- Key Moments -- */}
      <Section>
        <h2 className="text-2xl md:text-3xl font-bold text-[#e6edf3] mb-2">
          Key Moments
        </h2>
        <p className="text-sm text-[#8b949e] mb-8 max-w-2xl leading-relaxed">
          The turning points, broken promises, and moments of progress.
        </p>
        <div className="relative pl-8 md:pl-12">
          <div className="absolute left-3 md:left-5 top-0 bottom-0 w-px bg-gradient-to-b from-[#FFD700]/60 via-[#FFD700]/20 to-transparent" />
          <div className="space-y-8">
            {KEY_MOMENTS.map((m: { year: string; title: string; desc: string; outcome: string; outcomeColor: string }) => (
              <div key={m.year} className="relative group">
                <div
                  className="absolute -left-[21px] md:-left-[29px] top-1 w-3 h-3 rounded-full border-2 border-[#0a0a0f]"
                  style={{ backgroundColor: m.outcomeColor }}
                />
                <div className="rounded-xl border border-white/5 bg-[#12121a] p-5 hover:border-white/10 transition-colors">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-sm font-bold text-[#FFD700]">{m.year}</span>
                    <h3 className="text-base font-semibold text-[#e6edf3]">{m.title}</h3>
                  </div>
                  <p className="text-sm text-[#8b949e] leading-relaxed mb-3">{m.desc}</p>
                  <span
                    className="inline-flex items-center rounded-md px-2.5 py-1 text-xs font-semibold tracking-wide"
                    style={{ color: m.outcomeColor, backgroundColor: `${m.outcomeColor}15` }}
                  >
                    {m.outcome}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* -- Follow the Dollar -- */}
      <Section>
        <h2 className="text-2xl md:text-3xl font-bold text-[#e6edf3] mb-2">
          Follow the Dollar
        </h2>
        <p className="text-sm text-[#8b949e] mb-2 max-w-2xl leading-relaxed">
          A total of $18.3M in related donations flowed to political parties. The data reveals which industries have the deepest financial ties to the parties that shape policy on this issue.
        </p>
        <p className="text-xs text-[#8b949e]/60 mb-6">
          Source: AEC annual returns. Amounts are declared donations only.
        </p>

        {/* Stacked bar: donors by party */}
        {!mounted ? (
          <SkeletonChart height={340} className="mb-6" />
        ) : (
          <div className="rounded-xl border border-white/5 bg-[#12121a] p-4 md:p-6 mb-6">
            <ResponsiveContainer width="100%" height={340}>
              <BarChart data={donorByParty} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 100 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                <XAxis type="number" tick={{ fill: "#8b949e", fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v) => `${(Number(v) / 1_000_000).toFixed(0)}M`} />
                <YAxis type="category" dataKey="donor" tick={{ fill: "#e6edf3", fontSize: 12 }} tickLine={false} axisLine={false} width={100} />
                <Tooltip contentStyle={{ backgroundColor: "#12121a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#e6edf3", fontSize: 13 }} formatter={(v) => `$${Number(v).toLocaleString()}`} />
                <Legend wrapperStyle={{ fontSize: 12 }} iconType="square" iconSize={10} />
                {donorParties.map((p: string) => (
                  <Bar key={p} dataKey={p} stackId="a" fill={partyColors[p] || "#888"} name={p} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Party totals */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {PARTY_DONATIONS.slice(0, 3).map((p: { party: string; amount: number; color: string }) => (
            <div key={p.party} className="rounded-xl border border-white/5 bg-[#12121a] p-5">
              <div className="flex items-center gap-2 mb-2">
                <PartyBadge party={p.party} />
              </div>
              <p className="text-2xl font-bold" style={{ color: p.color }}>
                {`$${(p.amount / 1_000_000).toFixed(1)}M`}
              </p>
              <p className="text-xs text-[#8b949e] mt-1">Total related donations received</p>
            </div>
          ))}
        </div>

        {/* Top donors list */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {TOP_DONORS.map((d: { name: string; total: number; donations: number; period: string }) => (
            <div key={d.name} className="rounded-xl border border-white/5 bg-[#12121a] p-5 hover:border-[#FFD700]/20 transition-colors">
              <div className="flex items-start justify-between mb-2">
                <h3 className="text-base font-semibold text-[#e6edf3]">{d.name}</h3>
                <span className="text-lg font-bold text-[#FFD700] shrink-0 ml-2">
                  {`$${(d.total / 1_000_000).toFixed(1)}M`}
                </span>
              </div>
              <p className="text-xs text-[#8b949e]">{d.donations.toLocaleString()} donations over {d.period}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* -- Party Voting Record -- */}
      <Section>
        <h2 className="text-2xl md:text-3xl font-bold text-[#e6edf3] mb-2">
          How They Actually Vote
        </h2>
        <p className="text-sm text-[#8b949e] mb-6 max-w-2xl leading-relaxed">
          Voting record scores from TheyVoteForYou.org.au. Higher percentage
          means more supportive of policy action on this issue.
        </p>
        {!mounted ? (
          <SkeletonChart height={Math.max(300, TVFY_SCORES.length * 48)} />
        ) : (
          <div className="rounded-xl border border-white/5 bg-[#12121a] p-4 md:p-6">
            <ResponsiveContainer width="100%" height={Math.max(300, TVFY_SCORES.length * 48)}>
              <BarChart data={TVFY_SCORES} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 100 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                <XAxis type="number" domain={[0, 100]} tick={{ fill: "#8b949e", fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
                <YAxis type="category" dataKey="party" tick={{ fill: "#e6edf3", fontSize: 12 }} tickLine={false} axisLine={false} width={100} />
                <Tooltip contentStyle={{ backgroundColor: "#12121a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#e6edf3", fontSize: 13 }} formatter={(v) => `${v}% support`} />
                <Bar dataKey="support" name="Support %">
                  {TVFY_SCORES.map((entry: { party: string; color: string }, idx: number) => (
                    <Cell key={idx} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        <p className="text-xs text-[#8b949e]/60 mt-3">
          Source: TheyVoteForYou.org.au. Scores based on parliamentary division voting records.
        </p>
      </Section>

      {/* -- In Their Own Words -- */}
      <Section>
        <h2 className="text-2xl md:text-3xl font-bold text-[#e6edf3] mb-2">
          In Their Own Words
        </h2>
        <p className="text-sm text-[#8b949e] mb-8 max-w-2xl leading-relaxed">
          Direct quotes from the parliamentary record &mdash; sourced from Hansard.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {REAL_QUOTES.map((q: { speaker: string; party: string; photoId: string; date: string; text: string; context: string }, i: number) => {
            const ctxColor = q.context === "for" ? "#00843D" : "#DC2626";
            const ctxBg = q.context === "for" ? "rgba(0,132,61,0.1)" : "rgba(220,38,38,0.1)";
            const ctxLabel = q.context === "for" ? "Spoke FOR action" : "Spoke AGAINST action";
            return (
              <div key={i} className={`animate-fade-in-up stagger-${i + 1} rounded-xl border border-white/5 bg-[#12121a] p-5 hover:border-white/10 transition-colors`}>
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-[#e6edf3]">{q.speaker}</span>
                      <PartyBadge party={q.party} />
                    </div>
                    <p className="text-xs text-[#8b949e]">{q.date}</p>
                  </div>
                </div>
                <blockquote className="text-sm text-[#e6edf3]/80 italic leading-relaxed mb-4 pl-4 border-l-2 border-[#FFD700]/30">
                  &ldquo;{q.text}&rdquo;
                </blockquote>
                <span
                  className="inline-flex items-center rounded-md px-2.5 py-1 text-xs font-semibold tracking-wide"
                  style={{ color: ctxColor, backgroundColor: ctxBg }}
                >
                  {ctxLabel}
                </span>
              </div>
            );
          })}
        </div>
      </Section>

      {/* -- Who Spoke Most -- */}
      <Section>
        <h2 className="text-2xl md:text-3xl font-bold text-[#e6edf3] mb-2">
          Who Spoke Most?
        </h2>
        <p className="text-sm text-[#8b949e] mb-6 max-w-2xl leading-relaxed">
          The MPs who spoke most frequently on this issue. Speaking volume does
          not equal commitment to action.
        </p>
        {!mounted ? (
          <SkeletonTable rows={10} cols={4} />
        ) : (
        <div className="rounded-xl border border-white/5 bg-[#12121a] p-4 md:p-6">
          <div className="space-y-3">
            {TOP_SPEAKERS.map((mp: { name: string; party: string; speeches: number; photoId: string }, i: number) => {
              const barWidth = (mp.speeches / maxSpeaker) * 100;
              return (
                <div key={mp.name} className="flex items-center gap-3 group">
                  <span className="text-xs text-[#8b949e] w-4 shrink-0 text-right">{i + 1}</span>
                  <div className="w-7 h-7 rounded-full bg-white/5 shrink-0" />
                  <div className="w-36 shrink-0">
                    <span className="text-sm text-[#e6edf3] font-medium">{mp.name}</span>
                  </div>
                  <PartyBadge party={mp.party} />
                  <div className="flex-1 relative">
                    <div className="h-5 rounded bg-white/5 overflow-hidden">
                      <div
                        className="h-full rounded transition-all duration-700"
                        style={{
                          width: `${barWidth}%`,
                          backgroundColor: partyColors[mp.party] || "#888",
                          opacity: 0.7,
                        }}
                      />
                    </div>
                  </div>
                  <span className="text-sm font-bold text-[#e6edf3] w-8 text-right shrink-0">{mp.speeches}</span>
                </div>
              );
            })}
          </div>
        </div>
        )}
      </Section>

      {/* -- What Can You Do? -- */}
      <Section className="pb-20">
        <h2 className="text-2xl md:text-3xl font-bold text-[#e6edf3] mb-2">
          What Can You Do?
        </h2>
        <p className="text-sm text-[#8b949e] mb-8 max-w-2xl leading-relaxed">
          This data is a tool for citizen engagement. Here is how you can act.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {ACTION_ITEMS.map((a: { title: string; desc: string; link: string; linkText: string }, idx: number) => (
            <a
              key={a.title}
              href={a.link}
              target="_blank"
              rel="noopener noreferrer"
              className={`group animate-fade-in-up stagger-${idx + 1} rounded-xl border border-white/5 bg-[#12121a] p-5 hover:border-[#FFD700]/30 transition-all hover:bg-[#16161f]`}
            >
              <h3 className="text-base font-semibold text-[#e6edf3] mb-2 group-hover:text-[#FFD700] transition-colors">
                {a.title}
              </h3>
              <p className="text-sm text-[#8b949e] leading-relaxed mb-3">{a.desc}</p>
              <span className="text-sm text-[#FFD700] font-medium group-hover:underline">
                {a.linkText} &rarr;
              </span>
            </a>
          ))}
        </div>

        {/* Footer note */}
        <div className="mt-12 border-t border-white/5 pt-8 text-center">
          <p className="text-xs text-[#8b949e]/60 max-w-xl mx-auto leading-relaxed">
            This investigation uses data from Hansard (parlinfo.aph.gov.au), the Australian Electoral Commission transparency register, and TheyVoteForYou.org.au. All speech data is sourced from the official parliamentary record. OPAX is an independent, non-partisan project.
          </p>
        </div>
      </Section>
    </div>
  );
}

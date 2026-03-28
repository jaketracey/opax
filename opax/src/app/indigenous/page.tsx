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
import { TopicInsights } from "@/components/topic-insights";
import { SkeletonChart, SkeletonTable } from "@/components/skeleton";

/* == Data generated from parli.db == */

const TIMELINE = [
  {
    "year": "1998",
    "ALP": 229,
    "COA": 357,
    "GRN": 0,
    "IND": 59,
    "Other": 130
  },
  {
    "year": "1999",
    "ALP": 362,
    "COA": 423,
    "GRN": 0,
    "IND": 12,
    "Other": 114
  },
  {
    "year": "2000",
    "ALP": 359,
    "COA": 478,
    "GRN": 0,
    "IND": 12,
    "Other": 121
  },
  {
    "year": "2001",
    "ALP": 232,
    "COA": 296,
    "GRN": 0,
    "IND": 15,
    "Other": 76
  },
  {
    "year": "2002",
    "ALP": 388,
    "COA": 470,
    "GRN": 0,
    "IND": 20,
    "Other": 151
  },
  {
    "year": "2003",
    "ALP": 414,
    "COA": 430,
    "GRN": 25,
    "IND": 24,
    "Other": 172
  },
  {
    "year": "2004",
    "ALP": 301,
    "COA": 320,
    "GRN": 22,
    "IND": 21,
    "Other": 182
  },
  {
    "year": "2005",
    "ALP": 454,
    "COA": 333,
    "GRN": 0,
    "IND": 28,
    "Other": 314
  },
  {
    "year": "2006",
    "ALP": 515,
    "COA": 397,
    "GRN": 0,
    "IND": 32,
    "Other": 217
  },
  {
    "year": "2007",
    "ALP": 321,
    "COA": 387,
    "GRN": 0,
    "IND": 18,
    "Other": 141
  },
  {
    "year": "2008",
    "ALP": 735,
    "COA": 366,
    "GRN": 0,
    "IND": 14,
    "Other": 146
  },
  {
    "year": "2009",
    "ALP": 662,
    "COA": 249,
    "GRN": 0,
    "IND": 40,
    "Other": 104
  },
  {
    "year": "2010",
    "ALP": 606,
    "COA": 267,
    "GRN": 2,
    "IND": 34,
    "Other": 89
  },
  {
    "year": "2011",
    "ALP": 629,
    "COA": 408,
    "GRN": 10,
    "IND": 19,
    "Other": 140
  },
  {
    "year": "2012",
    "ALP": 670,
    "COA": 331,
    "GRN": 8,
    "IND": 31,
    "Other": 119
  },
  {
    "year": "2013",
    "ALP": 573,
    "COA": 323,
    "GRN": 13,
    "IND": 27,
    "Other": 86
  },
  {
    "year": "2014",
    "ALP": 664,
    "COA": 455,
    "GRN": 6,
    "IND": 21,
    "Other": 91
  },
  {
    "year": "2015",
    "ALP": 590,
    "COA": 485,
    "GRN": 3,
    "IND": 20,
    "Other": 139
  },
  {
    "year": "2016",
    "ALP": 454,
    "COA": 328,
    "GRN": 9,
    "IND": 19,
    "Other": 95
  },
  {
    "year": "2017",
    "ALP": 684,
    "COA": 395,
    "GRN": 14,
    "IND": 24,
    "Other": 101
  },
  {
    "year": "2018",
    "ALP": 712,
    "COA": 390,
    "GRN": 19,
    "IND": 32,
    "Other": 117
  },
  {
    "year": "2019",
    "ALP": 451,
    "COA": 318,
    "GRN": 14,
    "IND": 26,
    "Other": 76
  },
  {
    "year": "2020",
    "ALP": 564,
    "COA": 379,
    "GRN": 16,
    "IND": 40,
    "Other": 107
  },
  {
    "year": "2021",
    "ALP": 631,
    "COA": 551,
    "GRN": 25,
    "IND": 37,
    "Other": 115
  },
  {
    "year": "2022",
    "ALP": 262,
    "COA": 122,
    "GRN": 13,
    "IND": 36,
    "Other": 27
  },
  {
    "year": "2024",
    "ALP": 0,
    "COA": 0,
    "GRN": 0,
    "IND": 0,
    "Other": 11
  },
  {
    "year": "2025",
    "ALP": 3,
    "COA": 4,
    "GRN": 0,
    "IND": 1,
    "Other": 0
  }
];

const DONATION_FLOW = [
  {
    "donor": "Mineralogy Pty Ltd",
    "party": "United Australia Party",
    "amount": 650917173
  },
  {
    "donor": "MINERALOGY PTY LTD",
    "party": "United Australia Party",
    "amount": 634145553
  },
  {
    "donor": "MINERALOGY PTY LTD",
    "party": "Trumpet of Patriots",
    "amount": 158668134
  },
  {
    "donor": "Queensland Nickel Pty Ltd",
    "party": "Palmer United Party",
    "amount": 127115931
  },
  {
    "donor": "Electoral Commission of Queensland",
    "party": "Australian Labor Party (State of Queensland)",
    "amount": 103011534
  },
  {
    "donor": "BMA Coal Pty Ltd",
    "party": "CFMEU Mining & Energy Division (Qld District Branch)",
    "amount": 100806156
  },
  {
    "donor": "Australia and New Zealand Banking Group Limited - Hotel Loan",
    "party": "Canberra Labor Club Limited",
    "amount": 95957922
  },
  {
    "donor": "SDA Queensland Branch",
    "party": "Shop, Distributive & Allied Employees' Association - National",
    "amount": 57070626
  },
  {
    "donor": "ELECTORAL COMMISSION OF QUEENSLAND",
    "party": "Liberal National Party of Queensland",
    "amount": 55560516
  },
  {
    "donor": "Labor Resources Pty Ltd",
    "party": "Australian Labor Party (State of Queensland)",
    "amount": 47040000
  },
  {
    "donor": "[ECQ] Electoral Commission of Queensland",
    "party": "Liberal National Party of Queensland",
    "amount": 40311333
  },
  {
    "donor": "Mineralogy Pty Ltd",
    "party": "Palmer United Party",
    "amount": 39539067
  },
  {
    "donor": "Electoral Commission of Queensland",
    "party": "Liberal National Party of Queensland",
    "amount": 39085428
  },
  {
    "donor": "MINERALOGY PTY LTD",
    "party": "Palmer United Party",
    "amount": 35601105
  },
  {
    "donor": "Anglo Coal Pty Ltd",
    "party": "CFMEU Mining & Energy Division (Qld District Branch)",
    "amount": 31186128
  },
  {
    "donor": "Queensland Teachers Union",
    "party": "Australian Education Union",
    "amount": 29163153
  },
  {
    "donor": "BHP Group Limited",
    "party": "Minerals Council of Australia",
    "amount": 29052840
  },
  {
    "donor": "Glencore Australia Holdings Pty Limited",
    "party": "Minerals Council of Australia",
    "amount": 28798725
  },
  {
    "donor": "Together Queensland, Industrial Union of Employees",
    "party": "Australian Municipal Administrative Clerical & Services Union - Queensland Together Branch",
    "amount": 28001880
  },
  {
    "donor": "BM Alliance Coal Operations Pty Ltd",
    "party": "LET Australia Ltd",
    "amount": 27686820
  }
];

const TOP_DONORS = [
  {
    "name": "Mineralogy Pty Ltd",
    "total": 862846185,
    "donations": 300,
    "period": "2005-2006-2024-25"
  },
  {
    "name": "MINERALOGY PTY LTD",
    "total": 858456384,
    "donations": 915,
    "period": "2004-2005-2024-25"
  },
  {
    "name": "Electoral Commission of Queensland",
    "total": 173146422,
    "donations": 309,
    "period": "1998-1999-2024-25"
  },
  {
    "name": "Queensland Nickel Pty Ltd",
    "total": 130124181,
    "donations": 1941,
    "period": "2010-2011-2014-15"
  },
  {
    "name": "BMA Coal Pty Ltd",
    "total": 100806156,
    "donations": 18,
    "period": "2008-2009-2013-14"
  },
  {
    "name": "Australia and New Zealand Banking Group Limited - Hotel Loan",
    "total": 95957922,
    "donations": 39,
    "period": "2019-20-2019-20"
  }
];

const PARTY_DONATIONS = [
  {
    "party": "United Australia Party",
    "amount": 1285891458,
    "color": "#888888"
  },
  {
    "party": "Australian Labor Party (State of Queensland)",
    "amount": 248078274,
    "color": "#888888"
  },
  {
    "party": "Palmer United Party",
    "amount": 202948539,
    "color": "#888888"
  },
  {
    "party": "Australian Federation Party",
    "amount": 162239730,
    "color": "#888888"
  },
  {
    "party": "CFMEU Mining & Energy Division (Qld District Branch)",
    "amount": 161094627,
    "color": "#888888"
  },
  {
    "party": "Trumpet of Patriots",
    "amount": 158668134,
    "color": "#888888"
  }
];

const REAL_QUOTES = [
  {
    "speaker": "O'Toole, Cathy, MP",
    "party": "ALP",
    "photoId": "",
    "date": "2018-02-13",
    "text": "Today marks the 10th anniversary since the former Labor Prime Minister Kevin Rudd apologised unreservedly to the Aboriginal and Torres Strait Islander people of Australia. This was a watershed moment for our country. It was a step in the right direct",
    "context": "for"
  },
  {
    "speaker": "Neumann, Shayne, MP",
    "party": "ALP",
    "photoId": "",
    "date": "2014-06-23",
    "text": "I move: That this House notes:(1) notes that:(a) the National Congress of Australia's First Peoples (Congress) is the national representative body of Aboriginal and Torres Strait Islander peoples; and(b) Congress:\u00a0\u00a0\u00a0(i) was established with a view to",
    "context": "for"
  },
  {
    "speaker": "Martin, Fiona, MP",
    "party": "LP",
    "photoId": "",
    "date": "2020-02-25",
    "text": "I rise to reflect on the Prime Minister's Closing the gap statement, delivered in the House of Representatives. While we have cause to reflect on the achievement of some progress towards reducing inequality between Indigenous and Torres Strait Island",
    "context": "for"
  },
  {
    "speaker": "Dreyfus, Mark, MP",
    "party": "ALP",
    "photoId": "",
    "date": "2021-08-09",
    "text": "Last week Australians learnt that, just a year after the Morrison government announced it was resetting the Closing the Gap targets, only three of those 17 targets are now on track. So I do welcome the government's announcement last week that it will",
    "context": "for"
  },
  {
    "speaker": "Leeser, Julian, MP",
    "party": "LP",
    "photoId": "",
    "date": "2021-08-09",
    "text": "[by video link] It's an honour to follow both the minister and the shadow minister and to be followed by my good friend the Member for Lingiari in this debate, all three of whom have done much to educate me and share their knowledge of Australia's In",
    "context": "for"
  },
  {
    "speaker": "Claydon, Sharon, MP",
    "party": "ALP",
    "photoId": "",
    "date": "2014-05-26",
    "text": "Today is National Sorry Day, a time for all Australians to reflect on the profound grief and trauma experienced by Aboriginal and Torres Strait Islander peoples, particularly members of the stolen generations. The first National Sorry Day was held on",
    "context": "for"
  }
];

const TOP_SPEAKERS = [
  {
    "name": "Snowdon, Warren, MP",
    "party": "ALP",
    "speeches": 667,
    "photoId": ""
  },
  {
    "name": "Ruddock, Philip, MP",
    "party": "LP",
    "speeches": 372,
    "photoId": ""
  },
  {
    "name": "Albanese, Anthony, MP",
    "party": "ALP",
    "speeches": 299,
    "photoId": ""
  },
  {
    "name": "Perrett, Graham, MP",
    "party": "ALP",
    "speeches": 289,
    "photoId": ""
  },
  {
    "name": "Gillard, Julia, MP",
    "party": "ALP",
    "speeches": 288,
    "photoId": ""
  },
  {
    "name": "Abbott, Tony, MP",
    "party": "LP",
    "speeches": 287,
    "photoId": ""
  },
  {
    "name": "Macklin, Jenny, MP",
    "party": "ALP",
    "speeches": 287,
    "photoId": ""
  },
  {
    "name": "Neumann, Shayne, MP",
    "party": "ALP",
    "speeches": 282,
    "photoId": ""
  },
  {
    "name": "Brough, Mal, MP",
    "party": "LP",
    "speeches": 217,
    "photoId": ""
  },
  {
    "name": "Plibersek, Tanya, MP",
    "party": "ALP",
    "speeches": 213,
    "photoId": ""
  }
];

const TVFY_SCORES = [
  {
    "party": "Australian Democrats",
    "support": 100.0,
    "color": "#888888",
    "mps": 3
  },
  {
    "party": "Australian Greens",
    "support": 98.2,
    "color": "#888888",
    "mps": 13
  },
  {
    "party": "Centre Alliance",
    "support": 97.0,
    "color": "#888888",
    "mps": 1
  },
  {
    "party": "Jacqui Lambie Network",
    "support": 81.0,
    "color": "#888888",
    "mps": 1
  },
  {
    "party": "Independent",
    "support": 74.3,
    "color": "#888888",
    "mps": 3
  },
  {
    "party": "Australian Labor Party",
    "support": 52.6,
    "color": "#888888",
    "mps": 40
  },
  {
    "party": "Gerard Rennick People First",
    "support": 50.0,
    "color": "#888888",
    "mps": 1
  },
  {
    "party": "Liberal National Party",
    "support": 42.0,
    "color": "#888888",
    "mps": 2
  },
  {
    "party": "PRES",
    "support": 30.5,
    "color": "#888888",
    "mps": 4
  },
  {
    "party": "DPRES",
    "support": 17.0,
    "color": "#888888",
    "mps": 2
  }
];

const KEY_MOMENTS = [
  {
    "year": "1998",
    "title": "Early Indigenous Affairs Debates",
    "desc": "Parliamentary discussion of indigenous affairs begins in earnest.",
    "outcome": "Ongoing debate",
    "outcomeColor": "#FFD700"
  },
  {
    "year": "2021",
    "title": "Peak Parliamentary Interest",
    "desc": "The year with the most speeches on indigenous affairs, reflecting heightened public concern.",
    "outcome": "Heightened scrutiny",
    "outcomeColor": "#FFD700"
  },
  {
    "year": "2025",
    "title": "Current State",
    "desc": "Where the parliamentary debate on indigenous affairs stands today.",
    "outcome": "Under review",
    "outcomeColor": "#FFD700"
  }
];

const HUMAN_COST = [
  {
    "stat": "25,769",
    "label": "Parliamentary speeches about indigenous affairs",
    "src": "Hansard parliamentary record"
  },
  {
    "stat": "775",
    "label": "Distinct MPs who spoke on indigenous affairs",
    "src": "Hansard parliamentary record"
  },
  {
    "stat": "$2.8B",
    "label": "In related industry donations to political parties",
    "src": "AEC annual returns"
  }
];

const ACTION_ITEMS = [
  {
    "title": "Contact Your MP",
    "desc": "Tell your representative you care about indigenous affairs policy.",
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
    "desc": "Read what your MP actually said about indigenous affairs.",
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
          Deep Dive &mdash; Investigation 005
        </p>
        <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-[#e6edf3] leading-[1.1] mb-4 max-w-4xl">
          Indigenous Affairs: Follow the Record
        </h1>
        <p className="text-lg text-[#8b949e] max-w-2xl leading-relaxed mb-10">
          25,769 speeches. $2.8B in related donations. What changed?
        </p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="animate-fade-in-up stagger-1 rounded-xl border border-white/5 bg-[#12121a] p-4 text-center hover:border-[#FFD700]/20 transition-colors">
            <p className="text-2xl md:text-3xl font-bold text-[#FFD700]">25,769</p>
            <p className="text-xs text-[#8b949e] mt-1 uppercase tracking-wider">Speeches</p>
          </div>
          <div className="animate-fade-in-up stagger-2 rounded-xl border border-white/5 bg-[#12121a] p-4 text-center hover:border-[#FFD700]/20 transition-colors">
            <p className="text-2xl md:text-3xl font-bold text-[#FFD700]">775</p>
            <p className="text-xs text-[#8b949e] mt-1 uppercase tracking-wider">MPs Spoke</p>
          </div>
          <div className="animate-fade-in-up stagger-3 rounded-xl border border-white/5 bg-[#12121a] p-4 text-center hover:border-[#FFD700]/20 transition-colors">
            <p className="text-2xl md:text-3xl font-bold text-[#FFD700]">$2.8B</p>
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
          For over two decades, Australian MPs have debated indigenous affairs in Parliament. 25,769 speeches from 775 MPs tell a story of rhetoric that often outpaces legislative action.
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
            The parliamentary record on indigenous affairs reveals a pattern common across Australian politics: passionate debate in the chamber paired with limited legislative progress. Understanding this gap is the first step toward accountability.
          </p>
        </div>
      </Section>

      {/* -- Timeline -- */}
      <Section>
        <h2 className="text-2xl md:text-3xl font-bold text-[#e6edf3] mb-2">
          Parliamentary Debate Over Time
        </h2>
        <p className="text-sm text-[#8b949e] mb-2 max-w-2xl leading-relaxed">
          Speeches about indigenous affairs peaked in 2021, driven by major policy debates of the era. The volume of parliamentary discussion has fluctuated significantly, often spiking around elections and key legislative moments.
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
          A total of $2.8B in related donations flowed to political parties. The data reveals which industries have the deepest financial ties to the parties that shape policy on this issue.
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

      {/* -- Key Findings (dynamic from API) -- */}
      <TopicInsights topic="indigenous" />

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

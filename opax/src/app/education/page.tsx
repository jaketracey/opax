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
    "ALP": 619,
    "COA": 858,
    "GRN": 0,
    "IND": 64,
    "Other": 214
  },
  {
    "year": "1999",
    "ALP": 1113,
    "COA": 1235,
    "GRN": 0,
    "IND": 26,
    "Other": 191
  },
  {
    "year": "2000",
    "ALP": 1157,
    "COA": 1356,
    "GRN": 0,
    "IND": 29,
    "Other": 187
  },
  {
    "year": "2001",
    "ALP": 722,
    "COA": 879,
    "GRN": 0,
    "IND": 22,
    "Other": 104
  },
  {
    "year": "2002",
    "ALP": 877,
    "COA": 1101,
    "GRN": 0,
    "IND": 31,
    "Other": 165
  },
  {
    "year": "2003",
    "ALP": 1213,
    "COA": 1281,
    "GRN": 42,
    "IND": 43,
    "Other": 217
  },
  {
    "year": "2004",
    "ALP": 922,
    "COA": 899,
    "GRN": 44,
    "IND": 41,
    "Other": 249
  },
  {
    "year": "2005",
    "ALP": 1175,
    "COA": 1120,
    "GRN": 0,
    "IND": 51,
    "Other": 414
  },
  {
    "year": "2006",
    "ALP": 1162,
    "COA": 1140,
    "GRN": 0,
    "IND": 36,
    "Other": 362
  },
  {
    "year": "2007",
    "ALP": 846,
    "COA": 918,
    "GRN": 0,
    "IND": 31,
    "Other": 277
  },
  {
    "year": "2008",
    "ALP": 1883,
    "COA": 845,
    "GRN": 0,
    "IND": 17,
    "Other": 229
  },
  {
    "year": "2009",
    "ALP": 2221,
    "COA": 1064,
    "GRN": 0,
    "IND": 69,
    "Other": 330
  },
  {
    "year": "2010",
    "ALP": 1651,
    "COA": 858,
    "GRN": 6,
    "IND": 43,
    "Other": 221
  },
  {
    "year": "2011",
    "ALP": 1750,
    "COA": 1153,
    "GRN": 30,
    "IND": 53,
    "Other": 298
  },
  {
    "year": "2012",
    "ALP": 1905,
    "COA": 1174,
    "GRN": 45,
    "IND": 59,
    "Other": 270
  },
  {
    "year": "2013",
    "ALP": 1482,
    "COA": 960,
    "GRN": 22,
    "IND": 49,
    "Other": 229
  },
  {
    "year": "2014",
    "ALP": 2066,
    "COA": 1954,
    "GRN": 37,
    "IND": 59,
    "Other": 361
  },
  {
    "year": "2015",
    "ALP": 1896,
    "COA": 1899,
    "GRN": 21,
    "IND": 65,
    "Other": 387
  },
  {
    "year": "2016",
    "ALP": 1175,
    "COA": 1057,
    "GRN": 27,
    "IND": 48,
    "Other": 244
  },
  {
    "year": "2017",
    "ALP": 1902,
    "COA": 1464,
    "GRN": 29,
    "IND": 74,
    "Other": 305
  },
  {
    "year": "2018",
    "ALP": 1815,
    "COA": 1348,
    "GRN": 37,
    "IND": 51,
    "Other": 297
  },
  {
    "year": "2019",
    "ALP": 1014,
    "COA": 978,
    "GRN": 28,
    "IND": 39,
    "Other": 180
  },
  {
    "year": "2020",
    "ALP": 1349,
    "COA": 1112,
    "GRN": 40,
    "IND": 89,
    "Other": 193
  },
  {
    "year": "2021",
    "ALP": 1263,
    "COA": 1210,
    "GRN": 36,
    "IND": 86,
    "Other": 241
  },
  {
    "year": "2022",
    "ALP": 496,
    "COA": 284,
    "GRN": 22,
    "IND": 64,
    "Other": 78
  },
  {
    "year": "2024",
    "ALP": 0,
    "COA": 0,
    "GRN": 0,
    "IND": 0,
    "Other": 60
  },
  {
    "year": "2025",
    "ALP": 21,
    "COA": 19,
    "GRN": 2,
    "IND": 4,
    "Other": 0
  }
];

const DONATION_FLOW = [
  {
    "donor": "The Union Education Foundation Limited",
    "party": "Australian Council of Trade Unions",
    "amount": 39351648
  },
  {
    "donor": "University of Melbourne",
    "party": "Australian Nursing & Midwifery Federation",
    "amount": 33256545
  },
  {
    "donor": "Australian Education Union (AEU)",
    "party": "Australian Council of Trade Unions",
    "amount": 15665457
  },
  {
    "donor": "Australian Education Union (AEU) Federal Office",
    "party": "Australian Council of Trade Unions",
    "amount": 14942214
  },
  {
    "donor": "CEPU (Plumbing Division) Training & Education Centre",
    "party": "CEPU Plumbing Division Victoria",
    "amount": 11474796
  },
  {
    "donor": "Dept Education, Skills and Employment",
    "party": "Universities Australia",
    "amount": 10824000
  },
  {
    "donor": "Department of Education, Skills and Employment",
    "party": "Minerals Council of Australia",
    "amount": 10743237
  },
  {
    "donor": "Department for Education",
    "party": "Australian Nursing & Midwifery Federation (SA Branch) (State Body)",
    "amount": 8143089
  },
  {
    "donor": "Department of Education and Training Victoria",
    "party": "Communications, Electrical and Plumbing Union - Electrical, Energy and Services Division",
    "amount": 8078577
  },
  {
    "donor": "Department of Education and Training Victoria",
    "party": "Electrical Trades Union of Australia - Victoria Branch",
    "amount": 8078577
  },
  {
    "donor": "CEPU (Plumbing Division) Training Education Centre",
    "party": "CEPU Plumbing Division Victoria",
    "amount": 7319679
  },
  {
    "donor": "State School Teachers Union Of Western Australia",
    "party": "Australian Education Union",
    "amount": 6631872
  },
  {
    "donor": "G8 Education",
    "party": "1973 Foundation Pty Ltd",
    "amount": 6056010
  },
  {
    "donor": "Victoria State Government Education and Training",
    "party": "Construction, Forestry, Maritime Employees Union",
    "amount": 5711286
  },
  {
    "donor": "CEPU (Plumbing Division) Training &amp; Education Centre",
    "party": "Communications, Electrical and Plumbing Union - Electrical, Energy and Services Division",
    "amount": 5384727
  },
  {
    "donor": "Independent Education Union of Australia (IEU)",
    "party": "Australian Council of Trade Unions",
    "amount": 4851276
  },
  {
    "donor": "DEPARMENT OF EDUCATION",
    "party": "United Workers Union",
    "amount": 4290000
  },
  {
    "donor": "Australian Education Union",
    "party": "Australian Council of Trade Unions",
    "amount": 4244496
  },
  {
    "donor": "The University of Melbourne",
    "party": "Universities Australia",
    "amount": 4085364
  },
  {
    "donor": "The University of Sydney",
    "party": "Universities Australia",
    "amount": 3953556
  }
];

const TOP_DONORS = [
  {
    "name": "The Union Education Foundation Limited",
    "total": 39429648,
    "donations": 30,
    "period": "2009-2010-2024-25"
  },
  {
    "name": "University of Melbourne",
    "total": 33276045,
    "donations": 159,
    "period": "2002-2003-2024-25"
  },
  {
    "name": "Department of Education and Training Victoria",
    "total": 16157154,
    "donations": 48,
    "period": "2021-22-2024-25"
  },
  {
    "name": "Australian Education Union (AEU)",
    "total": 15665457,
    "donations": 9,
    "period": "2022-23-2024-25"
  },
  {
    "name": "Australian Education Union (AEU) Federal Office",
    "total": 14942214,
    "donations": 9,
    "period": "2018-19-2021-22"
  },
  {
    "name": "Department of Education, Skills and Employment",
    "total": 12903786,
    "donations": 12,
    "period": "2019-20-2022-23"
  }
];

const PARTY_DONATIONS = [
  {
    "party": "Australian Council of Trade Unions",
    "amount": 99711870,
    "color": "#888888"
  },
  {
    "party": "Universities Australia",
    "amount": 99402189,
    "color": "#888888"
  },
  {
    "party": "Australian Nursing & Midwifery Federation",
    "amount": 34364265,
    "color": "#888888"
  },
  {
    "party": "Australian Education Union",
    "amount": 23698497,
    "color": "#888888"
  },
  {
    "party": "CEPU Plumbing Division Victoria",
    "amount": 20352081,
    "color": "#888888"
  },
  {
    "party": "Australian Nursing & Midwifery Federation (SA Branch) (State Body)",
    "amount": 14517735,
    "color": "#888888"
  }
];

const REAL_QUOTES = [
  {
    "speaker": "D\u2019Ath, Yvette, MP",
    "party": "ALP",
    "photoId": "",
    "date": "2009-10-29",
    "text": "It is my pleasure today to congratulate the 15 students of the QUTeach@Redcliffe program who graduated on Tuesday night at Redcliffe State High School. Eleven of the students who graduated that night were from Redcliffe State High School, with two fr",
    "context": "for"
  },
  {
    "speaker": "Livermore, Kirsten, MP",
    "party": "ALP",
    "photoId": "",
    "date": "2010-06-22",
    "text": "I am pleased to have the opportunity to speak on this matter of public importance placed on the Notice Paper by the member for Lyne. I realised, as I was closely reading the topic and listening to the member for Kennedy, that I had probably misunders",
    "context": "for"
  },
  {
    "speaker": "Mossfield, Frank, MP",
    "party": "ALP",
    "photoId": "",
    "date": "2004-06-24",
    "text": "I want to speak about schools in my electorate of Greenway and about education in general. I think it is generally recognised that Greenway is the educational capital of Western Sydney, due to its vast educational facilities. I do not expect you to t",
    "context": "for"
  },
  {
    "speaker": "Hartsuyker, Luke, MP",
    "party": "NATS",
    "photoId": "",
    "date": "2007-02-26",
    "text": "Teacher education is undeniably important to the social and economic wellbeing of Australia. Research has found that the quality of teaching a student receives is the most important factor influencing their achievement. This means that better quality",
    "context": "for"
  },
  {
    "speaker": "Bishop, Julie, MP",
    "party": "LP",
    "photoId": "",
    "date": "2007-05-09",
    "text": "I thank the member for Solomon for his question. I can confirm that, last night, the Treasurer announced an unprecedented investment in our universities\u2014a $1.7 billion package of funds for our universities, plus a $5 billion Higher Education Endowmen",
    "context": "for"
  },
  {
    "speaker": "Pyne, Christopher, MP",
    "party": "LP",
    "photoId": "",
    "date": "2015-02-23",
    "text": "I thank the member for Casey for his question. I can tell him that, in more good news from the Abbott government, we are getting on with the job of improving student outcomes for students at school in Australia, this time by improving teacher trainin",
    "context": "for"
  }
];

const TOP_SPEAKERS = [
  {
    "name": "Gillard, Julia, MP",
    "party": "ALP",
    "speeches": 1363,
    "photoId": ""
  },
  {
    "name": "Nelson, Dr Brendan, MP",
    "party": "LP",
    "speeches": 849,
    "photoId": ""
  },
  {
    "name": "Macklin, Jenny, MP",
    "party": "ALP",
    "speeches": 772,
    "photoId": ""
  },
  {
    "name": "Albanese, Anthony, MP",
    "party": "ALP",
    "speeches": 728,
    "photoId": ""
  },
  {
    "name": "Hall, Jill, MP",
    "party": "ALP",
    "speeches": 684,
    "photoId": ""
  },
  {
    "name": "Perrett, Graham, MP",
    "party": "ALP",
    "speeches": 647,
    "photoId": ""
  },
  {
    "name": "Abbott, Tony, MP",
    "party": "LP",
    "speeches": 635,
    "photoId": ""
  },
  {
    "name": "Rudd, Kevin, MP",
    "party": "ALP",
    "speeches": 614,
    "photoId": ""
  },
  {
    "name": "Plibersek, Tanya, MP",
    "party": "ALP",
    "speeches": 609,
    "photoId": ""
  },
  {
    "name": "Neumann, Shayne, MP",
    "party": "ALP",
    "speeches": 588,
    "photoId": ""
  }
];

const TVFY_SCORES = [
  {
    "party": "Jacqui Lambie Network",
    "support": 95.0,
    "color": "#888888",
    "mps": 1
  },
  {
    "party": "Australian Greens",
    "support": 89.5,
    "color": "#888888",
    "mps": 15
  },
  {
    "party": "SPK",
    "support": 82.0,
    "color": "#888888",
    "mps": 1
  },
  {
    "party": "Australian Labor Party",
    "support": 75.1,
    "color": "#888888",
    "mps": 134
  },
  {
    "party": "Katter's Australian Party",
    "support": 58.0,
    "color": "#888888",
    "mps": 1
  },
  {
    "party": "Independent",
    "support": 53.6,
    "color": "#888888",
    "mps": 14
  },
  {
    "party": "PRES",
    "support": 47.2,
    "color": "#888888",
    "mps": 4
  },
  {
    "party": "Nick Xenophon Team",
    "support": 41.5,
    "color": "#888888",
    "mps": 2
  },
  {
    "party": "DPRES",
    "support": 38.0,
    "color": "#888888",
    "mps": 1
  },
  {
    "party": "Centre Alliance",
    "support": 30.0,
    "color": "#888888",
    "mps": 2
  }
];

const KEY_MOMENTS = [
  {
    "year": "1998",
    "title": "Early Education Debates",
    "desc": "Parliamentary discussion of education begins in earnest.",
    "outcome": "Ongoing debate",
    "outcomeColor": "#FFD700"
  },
  {
    "year": "2014",
    "title": "Peak Parliamentary Interest",
    "desc": "The year with the most speeches on education, reflecting heightened public concern.",
    "outcome": "Heightened scrutiny",
    "outcomeColor": "#FFD700"
  },
  {
    "year": "2025",
    "title": "Current State",
    "desc": "Where the parliamentary debate on education stands today.",
    "outcome": "Under review",
    "outcomeColor": "#FFD700"
  }
];

const HUMAN_COST = [
  {
    "stat": "69,875",
    "label": "Parliamentary speeches about education",
    "src": "Hansard parliamentary record"
  },
  {
    "stat": "889",
    "label": "Distinct MPs who spoke on education",
    "src": "Hansard parliamentary record"
  },
  {
    "stat": "$338.3M",
    "label": "In related industry donations to political parties",
    "src": "AEC annual returns"
  }
];

const ACTION_ITEMS = [
  {
    "title": "Contact Your MP",
    "desc": "Tell your representative you care about education policy.",
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
    "desc": "Read what your MP actually said about education.",
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
          Deep Dive &mdash; Investigation 007
        </p>
        <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-[#e6edf3] leading-[1.1] mb-4 max-w-4xl">
          Education: Follow the Record
        </h1>
        <p className="text-lg text-[#8b949e] max-w-2xl leading-relaxed mb-10">
          69,875 speeches. $338.3M in related donations. What changed?
        </p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="animate-fade-in-up stagger-1 rounded-xl border border-white/5 bg-[#12121a] p-4 text-center hover:border-[#FFD700]/20 transition-colors">
            <p className="text-2xl md:text-3xl font-bold text-[#FFD700]">69,875</p>
            <p className="text-xs text-[#8b949e] mt-1 uppercase tracking-wider">Speeches</p>
          </div>
          <div className="animate-fade-in-up stagger-2 rounded-xl border border-white/5 bg-[#12121a] p-4 text-center hover:border-[#FFD700]/20 transition-colors">
            <p className="text-2xl md:text-3xl font-bold text-[#FFD700]">889</p>
            <p className="text-xs text-[#8b949e] mt-1 uppercase tracking-wider">MPs Spoke</p>
          </div>
          <div className="animate-fade-in-up stagger-3 rounded-xl border border-white/5 bg-[#12121a] p-4 text-center hover:border-[#FFD700]/20 transition-colors">
            <p className="text-2xl md:text-3xl font-bold text-[#FFD700]">$338.3M</p>
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
          For over two decades, Australian MPs have debated education in Parliament. 69,875 speeches from 889 MPs tell a story of rhetoric that often outpaces legislative action.
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
            The parliamentary record on education reveals a pattern common across Australian politics: passionate debate in the chamber paired with limited legislative progress. Understanding this gap is the first step toward accountability.
          </p>
        </div>
      </Section>

      {/* -- Timeline -- */}
      <Section>
        <h2 className="text-2xl md:text-3xl font-bold text-[#e6edf3] mb-2">
          Parliamentary Debate Over Time
        </h2>
        <p className="text-sm text-[#8b949e] mb-2 max-w-2xl leading-relaxed">
          Speeches about education peaked in 2014, driven by major policy debates of the era. The volume of parliamentary discussion has fluctuated significantly, often spiking around elections and key legislative moments.
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
          A total of $338.3M in related donations flowed to political parties. The data reveals which industries have the deepest financial ties to the parties that shape policy on this issue.
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
      <TopicInsights topic="education" />

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

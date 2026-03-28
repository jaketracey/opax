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
    "ALP": 345,
    "COA": 534,
    "GRN": 0,
    "IND": 61,
    "Other": 268
  },
  {
    "year": "1999",
    "ALP": 621,
    "COA": 756,
    "GRN": 0,
    "IND": 16,
    "Other": 238
  },
  {
    "year": "2000",
    "ALP": 517,
    "COA": 603,
    "GRN": 0,
    "IND": 5,
    "Other": 241
  },
  {
    "year": "2001",
    "ALP": 484,
    "COA": 697,
    "GRN": 0,
    "IND": 11,
    "Other": 185
  },
  {
    "year": "2002",
    "ALP": 783,
    "COA": 948,
    "GRN": 0,
    "IND": 32,
    "Other": 179
  },
  {
    "year": "2003",
    "ALP": 944,
    "COA": 1093,
    "GRN": 26,
    "IND": 31,
    "Other": 290
  },
  {
    "year": "2004",
    "ALP": 616,
    "COA": 744,
    "GRN": 18,
    "IND": 23,
    "Other": 272
  },
  {
    "year": "2005",
    "ALP": 648,
    "COA": 742,
    "GRN": 0,
    "IND": 24,
    "Other": 476
  },
  {
    "year": "2006",
    "ALP": 822,
    "COA": 795,
    "GRN": 0,
    "IND": 31,
    "Other": 369
  },
  {
    "year": "2007",
    "ALP": 436,
    "COA": 547,
    "GRN": 0,
    "IND": 9,
    "Other": 271
  },
  {
    "year": "2008",
    "ALP": 858,
    "COA": 424,
    "GRN": 0,
    "IND": 15,
    "Other": 134
  },
  {
    "year": "2009",
    "ALP": 926,
    "COA": 507,
    "GRN": 0,
    "IND": 25,
    "Other": 152
  },
  {
    "year": "2010",
    "ALP": 669,
    "COA": 404,
    "GRN": 4,
    "IND": 39,
    "Other": 159
  },
  {
    "year": "2011",
    "ALP": 815,
    "COA": 571,
    "GRN": 7,
    "IND": 27,
    "Other": 134
  },
  {
    "year": "2012",
    "ALP": 716,
    "COA": 586,
    "GRN": 7,
    "IND": 27,
    "Other": 142
  },
  {
    "year": "2013",
    "ALP": 490,
    "COA": 394,
    "GRN": 7,
    "IND": 13,
    "Other": 90
  },
  {
    "year": "2014",
    "ALP": 747,
    "COA": 1066,
    "GRN": 10,
    "IND": 23,
    "Other": 174
  },
  {
    "year": "2015",
    "ALP": 853,
    "COA": 1208,
    "GRN": 11,
    "IND": 19,
    "Other": 228
  },
  {
    "year": "2016",
    "ALP": 475,
    "COA": 739,
    "GRN": 4,
    "IND": 12,
    "Other": 117
  },
  {
    "year": "2017",
    "ALP": 727,
    "COA": 808,
    "GRN": 9,
    "IND": 11,
    "Other": 154
  },
  {
    "year": "2018",
    "ALP": 656,
    "COA": 726,
    "GRN": 9,
    "IND": 23,
    "Other": 150
  },
  {
    "year": "2019",
    "ALP": 488,
    "COA": 570,
    "GRN": 11,
    "IND": 17,
    "Other": 122
  },
  {
    "year": "2020",
    "ALP": 547,
    "COA": 690,
    "GRN": 4,
    "IND": 35,
    "Other": 97
  },
  {
    "year": "2021",
    "ALP": 572,
    "COA": 867,
    "GRN": 16,
    "IND": 36,
    "Other": 139
  },
  {
    "year": "2022",
    "ALP": 290,
    "COA": 276,
    "GRN": 6,
    "IND": 18,
    "Other": 56
  },
  {
    "year": "2024",
    "ALP": 0,
    "COA": 0,
    "GRN": 0,
    "IND": 0,
    "Other": 6
  },
  {
    "year": "2025",
    "ALP": 9,
    "COA": 4,
    "GRN": 0,
    "IND": 0,
    "Other": 0
  }
];

const DONATION_FLOW = [
  {
    "donor": "Aust Defence Credit Union",
    "party": "CFMEU - Mining Division (Nth NSW District)",
    "amount": 14706000
  },
  {
    "donor": "Aust Defence Credit Union",
    "party": "CFMEU Northern Mining & NSW Energy District",
    "amount": 4374591
  },
  {
    "donor": "Wilson Security Pty Ltd",
    "party": "United Workers Union",
    "amount": 3195000
  },
  {
    "donor": "Armstrong, Josephine C",
    "party": "The Liberal Party of Western Australia Pty Ltd",
    "amount": 1800000
  },
  {
    "donor": "AEROSPACE",
    "party": "Automotive Food Metals Engineering Printing & Kindred Ind. Union",
    "amount": 1462740
  },
  {
    "donor": "Defence force CU",
    "party": "Queensland Nurses Union of Employees",
    "amount": 1246503
  },
  {
    "donor": "The Trustee National Entitlement Security Trust",
    "party": "Automotive Food Metals Engineering Printing & Kindred Ind. Union",
    "amount": 590004
  },
  {
    "donor": "Defence Fund Social Club",
    "party": "CEPU - Electrical Division QLD & NT",
    "amount": 460200
  },
  {
    "donor": "Defence fund social club",
    "party": "CEPU - Electrical Division QLD & NT",
    "amount": 360000
  },
  {
    "donor": "Defence fund social club",
    "party": "Communications, Electrical and Plumbing Union - Electrical, Energy and Services Division",
    "amount": 360000
  },
  {
    "donor": "Firearms Dealers Association Qld Inc.",
    "party": "Katter's Australian Party (KAP)",
    "amount": 300000
  },
  {
    "donor": "Armstrong, Josephine C",
    "party": "Liberal Party of Australia",
    "amount": 276000
  },
  {
    "donor": "Josephine Armstrong",
    "party": "Liberal Party of Australia",
    "amount": 276000
  },
  {
    "donor": "CHUBB SECURITY AUSTRALIA PTY LTD",
    "party": "Automotive Food Metals Engineering Printing & Kindred Ind. Union",
    "amount": 245871
  },
  {
    "donor": "GHM Security Services Pty Ltd",
    "party": "CFMEU Construction and General Division, New South Wales Divisional Branch",
    "amount": 230151
  }
];

const TOP_DONORS = [
  {
    "name": "Aust Defence Credit Union",
    "total": 19080591,
    "donations": 18,
    "period": "2011-12-2013-14"
  },
  {
    "name": "BRENCO AEROSPACE PTY LTD",
    "total": 3455634,
    "donations": 132,
    "period": "2020-21-2023-24"
  },
  {
    "name": "Wilson Security Pty Ltd",
    "total": 3195000,
    "donations": 6,
    "period": "2021-22-2021-22"
  },
  {
    "name": "Armstrong, Josephine C",
    "total": 2286000,
    "donations": 21,
    "period": "2007-2008-2010-2011"
  },
  {
    "name": "Ms Josephine C Armstrong",
    "total": 1920000,
    "donations": 9,
    "period": "2007-2008-2008-2009"
  },
  {
    "name": "AEROSPACE",
    "total": 1462740,
    "donations": 3,
    "period": "2019-20-2019-20"
  }
];

const PARTY_DONATIONS = [
  {
    "party": "CFMEU - Mining Division (Nth NSW District)",
    "amount": 14706000,
    "color": "#888888"
  },
  {
    "party": "Automotive Food Metals Engineering Printing & Kindred Ind. Union",
    "amount": 6009765,
    "color": "#888888"
  },
  {
    "party": "CFMEU Northern Mining & NSW Energy District",
    "amount": 4374591,
    "color": "#888888"
  },
  {
    "party": "United Workers Union",
    "amount": 3569349,
    "color": "#888888"
  },
  {
    "party": "Liberal Party (W.A. Division) Inc",
    "amount": 2055000,
    "color": "#888888"
  },
  {
    "party": "The Liberal Party of Western Australia Pty Ltd",
    "amount": 1800000,
    "color": "#888888"
  }
];

const REAL_QUOTES = [
  {
    "speaker": "Baldwin, Robert, MP",
    "party": "LP",
    "photoId": "",
    "date": "2005-05-10",
    "text": "Mr Baldwin asked the Minister Assisting the Minister for Defence, in writing, on 6\u00a0December 2004: During which years did Australian military personnel serve in Vietnam. How many Australian (a) Army, (b) Air Force, and (c) Navy personnel (i) in total,",
    "context": "for"
  },
  {
    "speaker": "Ferguson, Laurie, MP",
    "party": "ALP",
    "photoId": "",
    "date": "1999-09-21",
    "text": "Mr Laurie Ferguson asked the Minister Assisting the Minister for Defence, upon notice, on 22 June 1999: (1) What was the 1998-99 national recruitment target for the reservists for the (a) Navy, (b) Army and (c) Air Force. (2) How many reservists were",
    "context": "for"
  },
  {
    "speaker": "Crewther, Chris, MP",
    "party": "LP",
    "photoId": "",
    "date": "2017-08-16",
    "text": "On 2 July, I was honoured to attend and represent the Minister for Veterans' Affairs and the Prime Minister at the Reserve Forces Day parade and commemorative service at the Shrine of Remembrance in Melbourne. I was joined by the Victorian shadow min",
    "context": "for"
  },
  {
    "speaker": "McClelland, Robert, MP",
    "party": "ALP",
    "photoId": "",
    "date": "2005-05-23",
    "text": "My question is to the Prime Minister. Is the Prime Minister aware of reports today that almost one in three uniformed Army, Navy and Air Force personnel surveyed in the 2004 Defence attitude survey are looking to leave the armed forces, that more tha",
    "context": "for"
  },
  {
    "speaker": "Gosling, Luke MP",
    "party": "ALP",
    "photoId": "",
    "date": "2021-10-18",
    "text": "[by video link] I am very pleased to also speak to this motion and I thank the member for Ryan for bringing it forward. Although I did serve in the Australian Army, I wasn't a cadet, but I've seen firsthand here in my electorate the important role th",
    "context": "for"
  },
  {
    "speaker": "Scott, Bruce, MP",
    "party": "NP",
    "photoId": "",
    "date": "2000-11-08",
    "text": "Minister for Veterans' Affairs and Minister Assisting the Minister for Defence Mr Bruce Scott \u2014The answer to the honourable member's question is as follows: 0 (1) (a) Navy: 29. (b) Army: 1566. (c) Air Force: 104. (2) (a) Navy: 132. (b) Army: 4 778. (",
    "context": "for"
  }
];

const TOP_SPEAKERS = [
  {
    "name": "Howard, John, MP",
    "party": "LP",
    "speeches": 719,
    "photoId": ""
  },
  {
    "name": "Downer, Alexander, MP",
    "party": "LP",
    "speeches": 698,
    "photoId": ""
  },
  {
    "name": "Abbott, Tony, MP",
    "party": "LP",
    "speeches": 565,
    "photoId": ""
  },
  {
    "name": "Rudd, Kevin, MP",
    "party": "ALP",
    "speeches": 538,
    "photoId": ""
  },
  {
    "name": "Robert, Stuart, MP",
    "party": "LP",
    "speeches": 441,
    "photoId": ""
  },
  {
    "name": "Morrison, Scott, MP",
    "party": "LP",
    "speeches": 424,
    "photoId": ""
  },
  {
    "name": "Albanese, Anthony, MP",
    "party": "ALP",
    "speeches": 415,
    "photoId": ""
  },
  {
    "name": "Ruddock, Philip, MP",
    "party": "LP",
    "speeches": 414,
    "photoId": ""
  },
  {
    "name": "Bishop, Julie, MP",
    "party": "LP",
    "speeches": 400,
    "photoId": ""
  },
  {
    "name": "Danby, Michael, MP",
    "party": "ALP",
    "speeches": 388,
    "photoId": ""
  }
];

const TVFY_SCORES = [
  {
    "party": "Australian Conservatives",
    "support": 100.0,
    "color": "#888888",
    "mps": 1
  },
  {
    "party": "Country Liberal Party",
    "support": 100.0,
    "color": "#888888",
    "mps": 2
  },
  {
    "party": "Liberal Democratic Party",
    "support": 100.0,
    "color": "#888888",
    "mps": 1
  },
  {
    "party": "United Australia Party",
    "support": 100.0,
    "color": "#888888",
    "mps": 2
  },
  {
    "party": "Derryn Hinch's Justice Party",
    "support": 100.0,
    "color": "#888888",
    "mps": 1
  },
  {
    "party": "DPRES",
    "support": 100.0,
    "color": "#888888",
    "mps": 1
  },
  {
    "party": "Liberal Party",
    "support": 99.2,
    "color": "#888888",
    "mps": 44
  },
  {
    "party": "National Party",
    "support": 99.1,
    "color": "#888888",
    "mps": 17
  },
  {
    "party": "Liberal National Party",
    "support": 98.9,
    "color": "#888888",
    "mps": 13
  },
  {
    "party": "Pauline Hanson's One Nation Party",
    "support": 97.4,
    "color": "#888888",
    "mps": 5
  }
];

const KEY_MOMENTS = [
  {
    "year": "1998",
    "title": "Early Defence Debates",
    "desc": "Parliamentary discussion of defence begins in earnest.",
    "outcome": "Ongoing debate",
    "outcomeColor": "#FFD700"
  },
  {
    "year": "2003",
    "title": "Peak Parliamentary Interest",
    "desc": "The year with the most speeches on defence, reflecting heightened public concern.",
    "outcome": "Heightened scrutiny",
    "outcomeColor": "#FFD700"
  },
  {
    "year": "2025",
    "title": "Current State",
    "desc": "Where the parliamentary debate on defence stands today.",
    "outcome": "Under review",
    "outcomeColor": "#FFD700"
  }
];

const HUMAN_COST = [
  {
    "stat": "38,928",
    "label": "Parliamentary speeches about defence",
    "src": "Hansard parliamentary record"
  },
  {
    "stat": "815",
    "label": "Distinct MPs who spoke on defence",
    "src": "Hansard parliamentary record"
  },
  {
    "stat": "$35.7M",
    "label": "In related industry donations to political parties",
    "src": "AEC annual returns"
  }
];

const ACTION_ITEMS = [
  {
    "title": "Contact Your MP",
    "desc": "Tell your representative you care about defence policy.",
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
    "desc": "Read what your MP actually said about defence.",
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
          Defence: Follow the Record
        </h1>
        <p className="text-lg text-[#8b949e] max-w-2xl leading-relaxed mb-10">
          38,928 speeches. $35.7M in related donations. What changed?
        </p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="animate-fade-in-up stagger-1 rounded-xl border border-white/5 bg-[#12121a] p-4 text-center hover:border-[#FFD700]/20 transition-colors">
            <p className="text-2xl md:text-3xl font-bold text-[#FFD700]">38,928</p>
            <p className="text-xs text-[#8b949e] mt-1 uppercase tracking-wider">Speeches</p>
          </div>
          <div className="animate-fade-in-up stagger-2 rounded-xl border border-white/5 bg-[#12121a] p-4 text-center hover:border-[#FFD700]/20 transition-colors">
            <p className="text-2xl md:text-3xl font-bold text-[#FFD700]">815</p>
            <p className="text-xs text-[#8b949e] mt-1 uppercase tracking-wider">MPs Spoke</p>
          </div>
          <div className="animate-fade-in-up stagger-3 rounded-xl border border-white/5 bg-[#12121a] p-4 text-center hover:border-[#FFD700]/20 transition-colors">
            <p className="text-2xl md:text-3xl font-bold text-[#FFD700]">$35.7M</p>
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
          For over two decades, Australian MPs have debated defence in Parliament. 38,928 speeches from 815 MPs tell a story of rhetoric that often outpaces legislative action.
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
            The parliamentary record on defence reveals a pattern common across Australian politics: passionate debate in the chamber paired with limited legislative progress. Understanding this gap is the first step toward accountability.
          </p>
        </div>
      </Section>

      {/* -- Timeline -- */}
      <Section>
        <h2 className="text-2xl md:text-3xl font-bold text-[#e6edf3] mb-2">
          Parliamentary Debate Over Time
        </h2>
        <p className="text-sm text-[#8b949e] mb-2 max-w-2xl leading-relaxed">
          Speeches about defence peaked in 2003, driven by major policy debates of the era. The volume of parliamentary discussion has fluctuated significantly, often spiking around elections and key legislative moments.
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
          A total of $35.7M in related donations flowed to political parties. The data reveals which industries have the deepest financial ties to the parties that shape policy on this issue.
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
      <TopicInsights topic="defence" />

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

"use client";

import Link from "next/link";
import { useState, useEffect, useRef } from "react";

import { API_BASE } from "@/lib/utils";

function useCountUp(target: number, duration = 1800, enabled = true) {
  const [value, setValue] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled || target === 0) return;
    const start = performance.now();
    const step = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(eased * target));
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(step);
      }
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [target, duration, enabled]);

  return value;
}

function AnimatedStat({
  value,
  label,
  enabled,
}: {
  value: number;
  label: string;
  enabled: boolean;
}) {
  const displayed = useCountUp(value, 2000, enabled);
  return (
    <div className="text-center">
      <span className="block font-mono text-3xl md:text-4xl font-bold text-[#FFD700]">
        {displayed.toLocaleString()}
      </span>
      <span className="text-sm text-[#8b949e] mt-1">{label}</span>
    </div>
  );
}

function useInView(ref: React.RefObject<HTMLElement | null>) {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    if (!ref.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setInView(true);
      },
      { threshold: 0.15 }
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [ref]);
  return inView;
}

const STEPS = [
  {
    number: "01",
    title: "AGGREGATE",
    description:
      "Pull data from 15+ official sources: Hansard (1901-present), AEC donation disclosures, TheyVoteForYou division records, AusTender contracts, and state parliaments (VIC, NSW, QLD, SA) including committee hearings.",
  },
  {
    number: "02",
    title: "CONNECT",
    description:
      "Link speeches to the MPs who gave them, votes to the bills they decided, donations to the industries they came from, and contracts to the donors who received them. Disconnect scoring quantifies the gap between rhetoric and action.",
  },
  {
    number: "03",
    title: "ANALYSE",
    description:
      "AI-powered semantic search finds meaning across 1M+ speeches. Donor influence correlation, pay-to-play detection, and disconnect scoring reveal systemic patterns that manual research never could.",
  },
  {
    number: "04",
    title: "EXPOSE",
    description:
      "Interactive investigations, politician profiles, donation trails, and influence networks — all sourced, cited, and open for anyone to verify.",
  },
];

export default function AboutPage() {
  const statsRef = useRef<HTMLDivElement>(null);
  const statsVisible = useInView(statsRef);
  const [stats, setStats] = useState<Record<string, number>>({});

  useEffect(() => {
    fetch(`${API_BASE}/api/stats`)
      .then((r) => r.json())
      .then(setStats)
      .catch(() => {});
  }, []);

  const speechCount = stats.speeches ?? 1012000;
  const donationCount = stats.donations ?? 205000;
  const voteCount = stats.votes ?? 300000;
  const contractCount = stats.contracts ?? 16000;

  return (
    <div className="mx-auto max-w-4xl px-6">
      {/* Hero */}
      <section className="pt-20 pb-16 animate-fade-in-up">
        <p className="text-sm uppercase tracking-[0.2em] text-[#FFD700] mb-6 font-medium">
          Our Mission
        </p>
        <h1 className="font-serif text-4xl md:text-6xl text-[#e6edf3] leading-[1.08] mb-8">
          Why OPAX Exists
        </h1>
        <div className="space-y-6 text-lg text-[#8b949e] leading-relaxed max-w-3xl">
          <p>
            Australian democracy runs on a simple promise: that the people we
            elect will do what they say. But promises are made in speeches,
            while power is exercised in votes, contracts, and regulatory
            decisions — often far from public attention.
          </p>
          <p>
            Until now, there was no way for ordinary citizens to systematically
            check whether their representatives followed through. Parliamentary
            records span 125 years and over a million speeches across federal
            and state parliaments. Donation disclosures are buried in annual
            returns. Over 300,000 votes and 16,000 government contracts are
            scattered across dozens of databases. Connecting these threads
            required weeks of manual research — if you even knew where to look.
          </p>
          <p className="text-[#e6edf3] font-medium">
            OPAX changes that. We make the gap between political rhetoric and
            political action visible, searchable, and impossible to ignore.
          </p>
        </div>
      </section>

      {/* Divider */}
      <div className="h-px bg-gradient-to-r from-transparent via-[#FFD700]/20 to-transparent" />

      {/* The AI Unlock */}
      <section className="py-16 animate-fade-in-up stagger-1">
        <h2 className="font-serif text-3xl md:text-4xl text-[#e6edf3] mb-10">
          The AI Unlock
        </h2>

        <div className="space-y-8">
          <div className="rounded-xl border border-[#FFD700]/10 bg-[#FFD700]/5 p-8">
            <p className="text-lg text-[#FFD700]/90 leading-relaxed italic font-serif">
              &ldquo;For decades, parliamentary records sat in dusty archives or
              scattered databases. Understanding whether a politician&rsquo;s
              words matched their votes required weeks of manual research.&rdquo;
            </p>
          </div>

          <p className="text-lg text-[#8b949e] leading-relaxed">
            AI has changed this fundamentally. OPAX uses machine learning to
            embed {speechCount.toLocaleString()}+ speeches from federal and state
            parliaments into a semantic space where{" "}
            <em className="text-[#e6edf3]">meaning</em> — not just keywords —
            can be searched. Ask a question in plain English and get sourced,
            cited answers drawn from 125 years of parliamentary debate.
          </p>

          <p className="text-lg text-[#8b949e] leading-relaxed">
            But OPAX is not just search. It is pattern recognition at scale. By
            cross-referencing speeches against voting records, political
            donations, and government contracts, AI can identify systemic
            disconnects that would take human researchers months to uncover.
          </p>

          <div className="rounded-xl border border-[#FFD700]/10 bg-[#FFD700]/5 p-8">
            <p className="text-lg text-[#FFD700]/90 leading-relaxed italic font-serif">
              &ldquo;This is what happens when you point AI at democracy&rsquo;s
              own paper trail.&rdquo;
            </p>
          </div>
        </div>

        {/* AI Capabilities Grid */}
        <div className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            {
              title: "Semantic Search",
              desc: "Find meaning across 1M+ speeches from federal and state parliaments — not just keywords, but concepts, arguments, and positions.",
            },
            {
              title: "Investigative Q&A",
              desc: "RAG-powered research assistant that answers questions with sourced citations from parliamentary records.",
            },
            {
              title: "Disconnect Scoring",
              desc: "Quantified gap between what MPs say and how they vote. Per-politician, per-topic, per-party — tracked over time.",
            },
            {
              title: "Donor Influence Correlation",
              desc: "Cross-reference 205K donations against voting records and legislative outcomes. Follow the money to its impact.",
            },
            {
              title: "Pay-to-Play Detection",
              desc: "16K government contracts matched against donor records. Flagging patterns where political donations precede contract awards.",
            },
            {
              title: "State Parliament Coverage",
              desc: "VIC, NSW, QLD, SA parliaments and committee hearings — extending accountability beyond Canberra to where most policy hits the ground.",
            },
          ].map((cap) => (
            <div
              key={cap.title}
              className="rounded-lg border border-white/5 bg-[#12121a] p-5"
            >
              <h3 className="text-sm font-medium text-[#FFD700] mb-2">
                {cap.title}
              </h3>
              <p className="text-sm text-[#8b949e] leading-relaxed">
                {cap.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Divider */}
      <div className="h-px bg-gradient-to-r from-transparent via-[#FFD700]/20 to-transparent" />

      {/* How It Works */}
      <section className="py-16 animate-fade-in-up stagger-2">
        <h2 className="font-serif text-3xl md:text-4xl text-[#e6edf3] mb-12">
          How It Works
        </h2>

        <div className="space-y-0">
          {STEPS.map((step, i) => (
            <div key={step.number} className="flex gap-6 group">
              {/* Timeline */}
              <div className="flex flex-col items-center">
                <div className="w-10 h-10 rounded-full border-2 border-[#FFD700]/30 bg-[#FFD700]/5 flex items-center justify-center text-xs font-mono text-[#FFD700] font-bold group-hover:border-[#FFD700] group-hover:bg-[#FFD700]/10 transition-colors">
                  {step.number}
                </div>
                {i < STEPS.length - 1 && (
                  <div className="w-px flex-1 bg-gradient-to-b from-[#FFD700]/20 to-transparent min-h-[40px]" />
                )}
              </div>

              {/* Content */}
              <div className="pb-10">
                <h3 className="text-lg font-medium text-[#e6edf3] tracking-wide mb-2">
                  {step.title}
                </h3>
                <p className="text-sm text-[#8b949e] leading-relaxed max-w-lg">
                  {step.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Divider */}
      <div className="h-px bg-gradient-to-r from-transparent via-[#FFD700]/20 to-transparent" />

      {/* The Data — with animated stats */}
      <section className="py-16 animate-fade-in-up stagger-3" ref={statsRef}>
        <h2 className="font-serif text-3xl md:text-4xl text-[#e6edf3] mb-6">
          The Data
        </h2>
        <p className="text-lg text-[#8b949e] leading-relaxed mb-10 max-w-3xl">
          OPAX aggregates data from 15+ official Australian sources — spanning
          federal and state parliamentary speeches, voting records, political
          donations, government contracts, and legal documents. Covering the
          Commonwealth plus VIC, NSW, QLD, and SA parliaments including committee
          hearings. All public. All verifiable.
        </p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-10">
          <AnimatedStat
            value={speechCount}
            label="speeches"
            enabled={statsVisible}
          />
          <AnimatedStat
            value={voteCount}
            label="votes"
            enabled={statsVisible}
          />
          <AnimatedStat
            value={donationCount}
            label="donations"
            enabled={statsVisible}
          />
          <AnimatedStat
            value={contractCount}
            label="contracts"
            enabled={statsVisible}
          />
        </div>

        <Link
          href="/sources"
          className="inline-flex items-center gap-2 text-[#FFD700] hover:text-[#FFD700]/80 transition-colors text-sm font-medium group"
        >
          Explore all data sources
          <svg
            className="w-4 h-4 group-hover:translate-x-1 transition-transform"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M13 7l5 5m0 0l-5 5m5-5H6"
            />
          </svg>
        </Link>
      </section>

      {/* Divider */}
      <div className="h-px bg-gradient-to-r from-transparent via-[#FFD700]/20 to-transparent" />

      {/* Open Source & Transparency */}
      <section className="py-16 animate-fade-in-up stagger-4">
        <h2 className="font-serif text-3xl md:text-4xl text-[#e6edf3] mb-6">
          Open Source &amp; Transparency
        </h2>

        <div className="rounded-xl border border-[#FFD700]/10 bg-[#FFD700]/5 p-8">
          <p className="text-lg text-[#FFD700]/80 leading-relaxed mb-4">
            OPAX is itself transparent. Built with open data, open source tools,
            and open methodology. Every data pipeline, every analysis notebook,
            every line of code is publicly available for scrutiny, replication,
            and improvement.
          </p>
          <p className="text-[#8b949e] leading-relaxed">
            We believe the tools of accountability should be accountable
            themselves. If you find an error in our data or methodology, we want
            to know about it. That is not a weakness — it is the whole point.
          </p>
        </div>
      </section>

      {/* Divider */}
      <div className="h-px bg-gradient-to-r from-transparent via-[#FFD700]/20 to-transparent" />

      {/* Call to Action */}
      <section className="py-20 text-center animate-fade-in-up stagger-5">
        <h2 className="font-serif text-3xl md:text-4xl text-[#e6edf3] mb-6 leading-tight">
          Democracy works best when citizens can see <br />
          <span className="text-[#FFD700] italic">
            what their representatives are actually doing.
          </span>
        </h2>
        <p className="text-lg text-[#8b949e] mb-10">
          OPAX makes that possible.
        </p>
        <div className="flex items-center justify-center gap-4">
          <Link
            href="/search"
            className="px-6 py-3 bg-[#FFD700] text-[#0a0a0f] font-medium rounded-lg hover:bg-[#FFD700]/90 transition-colors"
          >
            Search Parliament
          </Link>
          <Link
            href="/sources"
            className="px-6 py-3 border border-[#FFD700]/30 text-[#FFD700] font-medium rounded-lg hover:bg-[#FFD700]/10 transition-colors"
          >
            View Our Data
          </Link>
        </div>
      </section>
    </div>
  );
}

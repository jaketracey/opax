/*
 * The Record Quiz — a MindMaze-spirited quiz over OPAX's real data.
 *
 * Every question is COMPUTED from the shipped JSON (money map, topic
 * reports, corpus manifest). Nothing is invented: wrong answers are
 * same-magnitude distractors derived from the same data, and every
 * reveal cites its provenance.
 *
 * Usage:  import { mountQuiz } from "/quiz.js";
 *         const quiz = mountQuiz(document.querySelector("#somewhere"));
 *         quiz.destroy();
 *
 * The question-generation half is pure (no DOM) so it can be
 * unit-tested under node against the real JSON files.
 */

/* ---------------------------------------------------------------- *
 *  Pure helpers (node-testable)
 * ---------------------------------------------------------------- */

export function createRng(seed) {
  // mulberry32 — small, seedable, good enough for shuffling quiz options.
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pick(arr, rng) { return arr[Math.floor(rng() * arr.length)]; }

function trimNum(x) {
  if (x >= 100) return String(Math.round(x));
  const s = x.toFixed(1);
  return s.endsWith(".0") ? s.slice(0, -2) : s;
}

export function fmtMoney(n) {
  const abs = Math.abs(n);
  if (abs >= 1e9) return "$" + trimNum(n / 1e9) + " billion";
  if (abs >= 1e6) return "$" + trimNum(n / 1e6) + " million";
  if (abs >= 1e3) return "$" + Math.round(n / 1e3).toLocaleString("en-AU") + ",000";
  return "$" + Math.round(n);
}

function round2sf(n) {
  if (n <= 0) return 0;
  const p = Math.pow(10, Math.floor(Math.log10(n)) - 1);
  return Math.round(n / p) * p;
}

export function approxCount(n) {
  const r = round2sf(n);
  if (r >= 1e6) return "about " + trimNum(r / 1e6) + " million";
  return "about " + r.toLocaleString("en-AU");
}

function fmtCount(n) { return n.toLocaleString("en-AU"); }

const INDUSTRY_LABELS = {
  mining: "Mining", finance: "Finance & banking", unions: "Unions",
  property: "Property & construction", media: "Media", gambling: "Gambling",
  fossil_fuels: "Fossil fuels", pharmacy: "Pharmacies & medicines",
  hospitality: "Hospitality (pubs & clubs)", agriculture: "Farming & agriculture",
  retail: "Retail", tobacco: "Tobacco", alcohol: "Alcohol", tech: "Technology",
  telecom: "Telecommunications", legal: "Legal services", health: "Health",
  defence: "Defence", transport: "Transport", security: "Security",
  waste_management: "Waste management", lobbying: "Lobbying",
  individual: "Individual donors",
};

const DONOR_PHRASES = {
  unions: "union-linked donors", mining: "mining donors",
  gambling: "gambling-industry donors", property: "property-industry donors",
  finance: "finance-industry donors", media: "media-company donors",
  hospitality: "hospitality donors",
};

function industryLabel(key) {
  return INDUSTRY_LABELS[key] || (key.charAt(0).toUpperCase() + key.slice(1)).replace(/_/g, " ");
}

/* ----- shared context computed once per round ----- */

function makeCtx(data) {
  const money = data.money || { nodes: [], edges: [], meta: {} };
  const donors = money.nodes.filter((n) => n.kind === "donor");
  const donorsById = new Map(donors.map((d) => [d.id, d]));

  const industries = new Map(); // key -> {total,count,first,last}
  for (const d of donors) {
    if (!d.industry || d.industry === "other") continue;
    let s = industries.get(d.industry);
    if (!s) industries.set(d.industry, (s = { total: 0, count: 0, first: 9999, last: 0 }));
    s.total += d.total || 0;
    s.count += d.count || 0;
    if (d.firstYear) s.first = Math.min(s.first, d.firstYear);
    if (d.lastYear) s.last = Math.max(s.last, d.lastYear);
  }

  const reports = Object.entries(data.reports || {})
    .map(([slug, r]) => ({ slug, title: r.title || slug, stats: r.stats || {} }))
    .filter((r) => r.stats.speech_count > 0);

  return { money, donors, donorsById, industries, reports, corpus: data.corpus || null };
}

/* ----- question templates -----
 * Each build(ctx, rng) returns a question object or null if the data
 * can't satisfy the template's fairness constraints:
 * { template, kind:'mc'|'tf', prompt, options:[{label,correct}], explanation, source, link }
 */

const MONEY_LINK = { href: "#/money", label: "Explore the money map" };
function reportLink(r) { return { href: "#/reports/" + r.slug, label: "Read the " + r.title + " report" }; }

const TEMPLATES = [
  {
    id: "industry-most",
    build(ctx, rng) {
      const cands = [...ctx.industries.entries()]
        .filter(([k, s]) => k !== "individual" && s.total >= 2e6);
      if (cands.length < 3) return null;
      for (let t = 0; t < 40; t++) {
        const trio = shuffled(cands, rng).slice(0, 3).sort((a, b) => b[1].total - a[1].total);
        const [top, s2, s3] = trio;
        if (top[1].total < 1.5 * s2[1].total) continue;
        const options = trio.map(([k], i) => ({ label: industryLabel(k), correct: i === 0 }));
        return {
          template: this.id, kind: "mc",
          prompt: "Which of these industries has disclosed the most in political donations?",
          options: shuffled(options, rng),
          explanation:
            industryLabel(top[0]) + " leads with " + fmtMoney(top[1].total) +
            " disclosed since " + top[1].first + ", ahead of " +
            industryLabel(s2[0]) + " (" + fmtMoney(s2[1].total) + ") and " +
            industryLabel(s3[0]) + " (" + fmtMoney(s3[1].total) + "), counting the biggest donors on the money map.",
          source: "AEC disclosures via OPAX's money data",
          link: MONEY_LINK,
        };
      }
      return null;
    },
  },

  {
    id: "industry-magnitude",
    build(ctx, rng) {
      const cands = [...ctx.industries.entries()]
        .filter(([k, s]) => k !== "individual" && s.total >= 8e6);
      if (!cands.length) return null;
      const [key, s] = pick(cands, rng);
      const labels = [fmtMoney(s.total / 10), fmtMoney(s.total), fmtMoney(s.total * 10)];
      if (new Set(labels).size !== 3) return null;
      const options = labels.map((label, i) => ({ label, correct: i === 1 }));
      const subject = key === "unions"
        ? "have unions" : "has the " + industryLabel(key).toLowerCase() + " industry";
      return {
        template: this.id, kind: "mc",
        prompt:
          "Roughly how much " + subject +
          " disclosed in political donations between " + s.first + " and " + s.last + "?",
        options: shuffled(options, rng),
        explanation:
          "About " + fmtMoney(s.total) + " across " + fmtCount(s.count) +
          " disclosed donations from the industry's biggest donors. And that's a floor, not a ceiling — " +
          "donations under the disclosure threshold never have to be reported.",
        source: "AEC disclosures via OPAX's money data",
        link: MONEY_LINK,
      };
    },
  },

  {
    id: "who-spoke-more",
    build(ctx, rng) {
      const cands = ctx.reports.filter((r) => (r.stats.top_speakers || []).length >= 3);
      if (!cands.length) return null;
      for (let t = 0; t < 40; t++) {
        const r = pick(cands, rng);
        const speakers = r.stats.top_speakers.slice(0, 8);
        const [a, b] = shuffled(speakers, rng).slice(0, 2);
        if (!a || !b || a[0] === b[0]) continue;
        const [hi, lo] = a[1] >= b[1] ? [a, b] : [b, a];
        if (hi[1] < 1.3 * lo[1] || hi[1] - lo[1] < 20) continue;
        const options = shuffled([
          { label: hi[0], correct: true },
          { label: lo[0], correct: false },
        ], rng);
        return {
          template: this.id, kind: "mc",
          prompt: "Who has given more speeches about " + r.title.toLowerCase() + " — " +
            options[0].label + " or " + options[1].label + "?",
          options,
          explanation:
            hi[0] + " appears " + fmtCount(hi[1]) + " times in the " + r.title +
            " record; " + lo[0] + " appears " + fmtCount(lo[1]) + " times.",
          source: "Parliamentary record via OPAX's " + r.title + " report",
          link: reportLink(r),
        };
      }
      return null;
    },
  },

  {
    id: "party-from-industry",
    build(ctx, rng) {
      const candidates = shuffled(Object.keys(DONOR_PHRASES), rng);
      for (const ind of candidates) {
        const byParty = new Map();
        for (const e of ctx.money.edges || []) {
          const d = ctx.donorsById.get(e.source);
          if (!d || d.industry !== ind) continue;
          const p = String(e.target).replace(/^party:/, "");
          byParty.set(p, (byParty.get(p) || 0) + (e.total || 0));
        }
        const sorted = [...byParty.entries()].sort((a, b) => b[1] - a[1]);
        // Only ask when there is a clear leader — a near-tie would make the
        // "right" answer a coin flip and could read as point-scoring.
        if (sorted.length < 3 || sorted[0][1] < 1.5 * sorted[1][1]) continue;
        const distractors = shuffled(sorted.slice(1, 5), rng).slice(0, 2);
        const options = shuffled([
          { label: sorted[0][0], correct: true },
          ...distractors.map(([p]) => ({ label: p, correct: false })),
        ], rng);
        return {
          template: this.id, kind: "mc",
          prompt: "Which party has received the most disclosed money from " + DONOR_PHRASES[ind] + "?",
          options,
          explanation:
            sorted[0][0] + " received " + fmtMoney(sorted[0][1]) + " in disclosed donations from " +
            DONOR_PHRASES[ind] + " — the next party, " + sorted[1][0] + ", received " +
            fmtMoney(sorted[1][1]) + ".",
          source: "AEC disclosures via OPAX's money data",
          link: MONEY_LINK,
        };
      }
      return null;
    },
  },

  {
    id: "true-false",
    build(ctx, rng) {
      const meta = ctx.money.meta || {};
      const sources = (ctx.corpus && ctx.corpus.sources) || [];
      const stateNames = sources
        .filter((s) => /parliament/i.test(s.name || ""))
        .map((s) => s.name.replace(/\s*Parliament.*$/i, ""));
      const pool = [];

      pool.push({
        statement: "Every political donation in Australia appears in this data, no matter how small.",
        answer: false,
        explanation:
          "Only donations above the AEC's disclosure threshold ever have to be reported, so smaller " +
          "donations are invisible. Every total you see here is a floor, not a ceiling — the real " +
          "amounts can only be higher.",
        source: "AEC disclosure rules; OPAX's money data",
        link: MONEY_LINK,
      });

      if ((meta.exclusions || []).some((x) => /public electoral funding/i.test(x))) {
        pool.push({
          statement:
            "Taxpayer money the AEC pays parties after each election (public electoral funding) is counted in these donation totals.",
          answer: false,
          explanation:
            "Public electoral funding is deliberately left out" +
            (meta.rows_excluded_public_funding
              ? " (" + fmtCount(meta.rows_excluded_public_funding) + " rows excluded)"
              : "") +
            ", so the map shows only money that donors chose to give.",
          source: "OPAX money data methodology",
          link: MONEY_LINK,
        });
      }

      if (stateNames.length >= 2) {
        pool.push({
          statement: "OPAX's record covers state parliaments as well as the federal parliament.",
          answer: true,
          explanation:
            "Alongside federal Hansard, the corpus includes the " +
            stateNames.slice(0, -1).join(", ") + " and " + stateNames[stateNames.length - 1] +
            " parliaments.",
          source: "OPAX corpus",
          link: null,
        });
      }

      if (meta.donor_nodes) {
        pool.push({
          statement: "The OPAX money map shows every donor who has ever disclosed a donation.",
          answer: false,
          explanation:
            "It shows the " + fmtCount(meta.donor_nodes) + " biggest donors by lifetime total — " +
            "thousands of smaller disclosed donors sit below that cut.",
          source: "OPAX money data methodology",
          link: MONEY_LINK,
        });
      }

      if (!pool.length) return null;
      const q = pick(pool, rng);
      return {
        template: this.id, kind: "tf",
        prompt: "True or false: " + q.statement,
        options: [
          { label: "True", correct: q.answer === true },
          { label: "False", correct: q.answer === false },
        ],
        explanation: q.explanation,
        source: q.source,
        link: q.link,
      };
    },
  },

  {
    id: "peak-year",
    build(ctx, rng) {
      const cands = ctx.reports.filter((r) => (r.stats.timeline || []).length >= 10);
      if (!cands.length) return null;
      for (let t = 0; t < 40; t++) {
        const r = pick(cands, rng);
        // Drop the final (possibly partial) year so the "biggest year" is fair.
        const tl = r.stats.timeline.slice(0, -1).map(([y, n]) => [Number(y), n]);
        const peak = tl.reduce((a, b) => (b[1] > a[1] ? b : a));
        if (peak[1] < 50) continue;
        const others = shuffled(
          tl.filter(([y, n]) => n <= 0.6 * peak[1] && Math.abs(y - peak[0]) >= 2),
          rng,
        );
        const d1 = others.find(Boolean);
        const d2 = others.find(([y]) => d1 && Math.abs(y - d1[0]) >= 2);
        if (!d1 || !d2) continue;
        const options = shuffled([
          { label: String(peak[0]), correct: true },
          { label: String(d1[0]), correct: false },
          { label: String(d2[0]), correct: false },
        ], rng);
        return {
          template: this.id, kind: "mc",
          prompt: "In which of these years did parliament talk about " + r.title.toLowerCase() + " the most?",
          options,
          explanation:
            peak[0] + " was the bigger year, with " + fmtCount(peak[1]) + " speeches touching on " +
            r.title.toLowerCase() + " — compared with " + fmtCount(d1[1]) + " in " + d1[0] +
            " and " + fmtCount(d2[1]) + " in " + d2[0] + ".",
          source: "Parliamentary record via OPAX's " + r.title + " report",
          link: reportLink(r),
        };
      }
      return null;
    },
  },

  {
    id: "topic-more-speeches",
    build(ctx, rng) {
      if (ctx.reports.length < 2) return null;
      for (let t = 0; t < 40; t++) {
        const [a, b] = shuffled(ctx.reports, rng).slice(0, 2);
        const [hi, lo] = a.stats.speech_count >= b.stats.speech_count ? [a, b] : [b, a];
        if (hi.stats.speech_count < 1.3 * lo.stats.speech_count) continue;
        const options = shuffled([
          { label: hi.title, correct: true },
          { label: lo.title, correct: false },
        ], rng);
        return {
          template: this.id, kind: "mc",
          prompt: "Which topic shows up in more parliamentary speeches: " +
            options[0].label + " or " + options[1].label + "?",
          options,
          explanation:
            hi.title + " appears in " + fmtCount(hi.stats.speech_count) + " speeches in the record; " +
            lo.title + " appears in " + fmtCount(lo.stats.speech_count) + ".",
          source: "Parliamentary record via OPAX's topic reports",
          link: reportLink(hi),
        };
      }
      return null;
    },
  },

  {
    id: "corpus-scale",
    build(ctx, rng) {
      const n = ctx.corpus && ctx.corpus.collected_speeches;
      if (!n || n < 1000) return null;
      const labels = [approxCount(n / 10), approxCount(n), approxCount(n * 10)];
      if (new Set(labels).size !== 3) return null;
      const options = labels.map((label, i) => ({ label, correct: i === 1 }));
      return {
        template: this.id, kind: "mc",
        prompt: "Roughly how many parliamentary speeches and documents can you search on OPAX?",
        options: shuffled(options, rng),
        explanation:
          fmtCount(n) + " documents collected from " + ((ctx.corpus.sources || []).length || "many") +
          " sources — federal Hansard back to the 1990s, state parliaments, committee hearings, " +
          "news and AEC donation records.",
        source: "OPAX corpus",
        link: null,
      };
    },
  },

  {
    id: "top-donor-in-industry",
    build(ctx, rng) {
      const cands = ctx.reports.filter((r) => {
        const d = r.stats.donations;
        return d && Array.isArray(d.top_donors) && d.top_donors.length >= 3;
      });
      if (!cands.length) return null;
      for (let t = 0; t < 40; t++) {
        const r = pick(cands, rng);
        const list = r.stats.donations.top_donors;
        const top = list[0];
        const distractors = shuffled(list.slice(1, 6), rng).slice(0, 2);
        if (distractors.length < 2) continue;
        if (top[1] < 1.2 * distractors[0][1] || top[1] < 1.2 * distractors[1][1]) continue;
        const options = shuffled([
          { label: top[0], correct: true },
          ...distractors.map(([name]) => ({ label: name, correct: false })),
        ], rng);
        return {
          template: this.id, kind: "mc",
          prompt: "These three are among the biggest donors tracked in the " + r.title +
            " report. Which one has disclosed the most?",
          options,
          explanation:
            top[0] + " disclosed " + fmtMoney(top[1]) + "; " +
            distractors[0][0] + " disclosed " + fmtMoney(distractors[0][1]) + " and " +
            distractors[1][0] + " disclosed " + fmtMoney(distractors[1][1]) + ".",
          source: "AEC disclosures via OPAX's " + r.title + " report",
          link: reportLink(r),
        };
      }
      return null;
    },
  },

  {
    id: "biggest-source",
    build(ctx, rng) {
      const sources = ((ctx.corpus && ctx.corpus.sources) || []).filter((s) => s.docs > 0);
      if (sources.length < 3) return null;
      for (let t = 0; t < 40; t++) {
        const trio = shuffled(sources, rng).slice(0, 3).sort((a, b) => b.docs - a.docs);
        if (trio[0].docs < 1.5 * trio[1].docs || trio[0].docs < 1.5 * trio[2].docs) continue;
        const short = (s) => s.name.replace(/\s*\(.*?\)\s*/g, "").trim();
        if (new Set(trio.map(short)).size !== 3) continue;
        const options = shuffled(
          trio.map((s, i) => ({ label: short(s), correct: i === 0 })),
          rng,
        );
        return {
          template: this.id, kind: "mc",
          prompt: "OPAX gathers the record from many places. Which of these sources contributes the most documents?",
          options,
          explanation:
            short(trio[0]) + " contributes " + fmtCount(trio[0].docs) + " documents (" + trio[0].coverage +
            "), compared with " + fmtCount(trio[1].docs) + " from " + short(trio[1]) +
            " and " + fmtCount(trio[2].docs) + " from " + short(trio[2]) + ".",
          source: "OPAX corpus",
          link: null,
        };
      }
      return null;
    },
  },
];

export { TEMPLATES };

function validQuestion(q) {
  if (!q || !q.prompt || !q.explanation || !Array.isArray(q.options)) return false;
  if (q.options.filter((o) => o.correct).length !== 1) return false;
  if (new Set(q.options.map((o) => o.label)).size !== q.options.length) return false;
  if (q.link && !/^#\/(money$|reports\/[a-z0-9_-]+$)/.test(q.link.href)) return false;
  return true;
}

/**
 * Build one round of questions from the loaded data.
 * data = { money, reports: {slug: reportJson}, corpus }
 */
export function buildRound(data, rng = Math.random, count = 8) {
  const ctx = makeCtx(data);
  const questions = [];
  const usedPrompts = new Set();
  const order = shuffled(TEMPLATES, rng);

  // First pass: at most one question per template.
  for (const tpl of order) {
    if (questions.length >= count) break;
    for (let attempt = 0; attempt < 4; attempt++) {
      const q = tpl.build(ctx, rng);
      if (q && validQuestion(q) && !usedPrompts.has(q.prompt)) {
        usedPrompts.add(q.prompt);
        questions.push(q);
        break;
      }
    }
  }
  // Fallback: if some templates couldn't fire (partial data), allow reuse
  // with different instantiations rather than shipping a short round.
  let guard = 0;
  while (questions.length < count && guard++ < 60) {
    const q = pick(order, rng).build(ctx, rng);
    if (q && validQuestion(q) && !usedPrompts.has(q.prompt)) {
      usedPrompts.add(q.prompt);
      questions.push(q);
    }
  }
  return shuffled(questions, rng);
}

export function rankFor(score, total) {
  const pct = total ? score / total : 0;
  if (pct >= 1) return { name: "Speaker of the House", blurb: "Order! Total command of the record." };
  if (pct >= 0.85) return { name: "Deputy Speaker", blurb: "Almost nothing gets past you." };
  if (pct >= 0.6) return { name: "Committee Chair", blurb: "You run a tight inquiry." };
  if (pct >= 0.35) return { name: "Committee Member", blurb: "You're asking the right questions." };
  return { name: "Backbencher", blurb: "Everyone starts somewhere on the back bench." };
}

/* ---------------------------------------------------------------- *
 *  Data loading
 * ---------------------------------------------------------------- */

async function fetchJson(url, signal) {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(url + " → HTTP " + res.status);
  return res.json();
}

async function loadData(signal) {
  const [money, index, corpus] = await Promise.all([
    fetchJson("/graph/money.json", signal),
    fetchJson("/reports/index.json", signal),
    fetchJson("/corpus.json", signal).catch(() => null),
  ]);
  const reports = {};
  await Promise.all(
    ((index && index.reports) || []).map(async (r) => {
      try { reports[r.slug] = await fetchJson("/reports/" + r.slug + ".json", signal); }
      catch (e) { if (e && e.name === "AbortError") throw e; /* skip a broken report */ }
    }),
  );
  return { money, reports, corpus };
}

/* ---------------------------------------------------------------- *
 *  Styles
 * ---------------------------------------------------------------- */

const STYLE_ID = "qz-styles";
let styleRefs = 0;

const CSS = `
.qz-root {
  --qz-serif: var(--serif, "Merriweather", Georgia, serif);
  --qz-sans: var(--sans, "Public Sans", -apple-system, "Segoe UI", sans-serif);
  font-family: var(--qz-sans);
  color: var(--ink, #26221B);
  background: var(--paper-raised, #FFFFFF);
  border: 1px solid var(--line, #E2DDD2);
  border-top: 4px solid var(--bronze, #A0761B);
  border-radius: 10px;
  max-width: 40rem;
  margin-inline: auto;
  padding: clamp(1.25rem, 4vw, 2.25rem);
  box-sizing: border-box;
}
.qz-root *, .qz-root *::before, .qz-root *::after { box-sizing: border-box; }
.qz-root button { font: inherit; cursor: pointer; }
.qz-root button:focus-visible, .qz-root a:focus-visible {
  outline: 3px solid var(--bronze-ink, #8A5A12); outline-offset: 2px;
}
.qz-kicker {
  font: 700 0.6875rem/1.3 var(--qz-sans); letter-spacing: 0.14em;
  text-transform: uppercase; color: var(--bronze-ink, #8A5A12); margin: 0 0 0.5rem;
}
.qz-title {
  font: 900 clamp(1.5rem, 4vw, 2rem)/1.15 var(--qz-serif);
  margin: 0 0 0.75rem; color: var(--ink, #26221B);
}
.qz-lead { margin: 0 0 1.25rem; line-height: 1.6; color: var(--ink-soft, #4A443A); }
.qz-fineprint {
  margin: 1.25rem 0 0; font-size: 0.8125rem; line-height: 1.55;
  color: var(--ink-faint, #7A7264);
}
.qz-btn {
  display: inline-flex; align-items: center; justify-content: center;
  min-height: 48px; padding: 0.625rem 1.5rem; border-radius: 8px;
  border: 1px solid var(--navy, #142A43);
  background: var(--navy, #142A43); color: #fff;
  font-weight: 600; font-size: 1rem; text-decoration: none;
}
.qz-btn:hover { background: var(--navy-raised, #1D3A5C); }
.qz-btn--ghost {
  background: transparent; color: var(--navy, #142A43);
  border: 1px solid var(--line-strong, #C9C2B2);
}
.qz-btn--ghost:hover { border-color: var(--bronze-ink, #8A5A12); background: var(--bronze-wash, rgba(160,118,27,0.16)); }
.qz-topbar {
  display: flex; align-items: baseline; justify-content: space-between;
  gap: 1rem; margin: 0 0 0.375rem;
}
.qz-progress-text { font-size: 0.8125rem; font-weight: 600; color: var(--ink-soft, #4A443A); }
.qz-score { font-size: 0.8125rem; font-weight: 700; color: var(--bronze-ink, #8A5A12); }
.qz-bar {
  height: 6px; border-radius: 3px; background: var(--paper-sunken, #F1EFE8);
  overflow: hidden; margin: 0 0 1.25rem;
}
.qz-bar-fill { height: 100%; background: var(--bronze, #A0761B); transition: width 200ms ease; }
@media (prefers-reduced-motion: reduce) { .qz-bar-fill { transition: none; } }
.qz-question {
  font: 700 clamp(1.125rem, 3vw, 1.375rem)/1.4 var(--qz-serif);
  margin: 0 0 1.25rem; color: var(--ink, #26221B);
}
.qz-question:focus { outline: none; }
.qz-options { display: flex; flex-direction: column; gap: 0.625rem; margin: 0 0 1rem; }
.qz-option {
  display: flex; align-items: center; gap: 0.75rem; width: 100%;
  min-height: 48px; padding: 0.75rem 1rem; text-align: left;
  background: var(--paper, #FAF9F6); color: var(--ink, #26221B);
  border: 1px solid var(--line-strong, #C9C2B2); border-radius: 8px;
  font-size: 1rem; line-height: 1.4;
}
.qz-option:hover:not(:disabled) {
  border-color: var(--bronze-ink, #8A5A12);
  background: var(--bronze-wash, rgba(160,118,27,0.16));
}
.qz-option:disabled { cursor: default; }
.qz-option[data-state="correct"] {
  background: var(--bronze-wash, rgba(160,118,27,0.16));
  border: 2px solid var(--bronze-ink, #8A5A12); font-weight: 700;
}
.qz-option[data-state="wrong"] {
  background: var(--paper-sunken, #F1EFE8); color: var(--ink-soft, #4A443A);
}
.qz-option[data-state="dim"] { opacity: 0.6; }
.qz-key {
  flex: 0 0 auto; width: 1.5rem; height: 1.5rem; border-radius: 50%;
  display: inline-flex; align-items: center; justify-content: center;
  font-size: 0.75rem; font-weight: 700; color: var(--ink-faint, #7A7264);
  border: 1px solid var(--line, #E2DDD2); background: var(--paper-raised, #fff);
}
.qz-mark { flex: 0 0 auto; margin-left: auto; font-weight: 700; }
.qz-option[data-state="correct"] .qz-mark { color: var(--bronze-ink, #8A5A12); }
.qz-hint { margin: 0 0 1rem; font-size: 0.75rem; color: var(--ink-faint, #7A7264); }
.qz-feedback { min-height: 1px; }
.qz-panel {
  border-left: 3px solid var(--bronze, #A0761B);
  background: var(--paper, #FAF9F6);
  padding: 0.875rem 1rem; border-radius: 0 8px 8px 0; margin: 0 0 1rem;
}
.qz-verdict {
  font: 700 1.0625rem/1.3 var(--qz-serif); margin: 0 0 0.375rem;
  display: flex; align-items: center; gap: 0.5rem;
}
.qz-explain { margin: 0 0 0.375rem; font-size: 0.9375rem; line-height: 1.55; color: var(--ink-soft, #4A443A); }
.qz-provenance { margin: 0; font-size: 0.8125rem; font-style: italic; color: var(--ink-faint, #7A7264); }
.qz-provenance a { color: var(--bronze-ink, #8A5A12); }
.qz-star { display: inline-block; color: var(--bronze, #A0761B); font-size: 1.25rem; }
@media (prefers-reduced-motion: no-preference) {
  .qz-star { animation: qz-pop 500ms ease-out; }
  @keyframes qz-pop {
    0% { transform: scale(0.2) rotate(-30deg); opacity: 0; }
    60% { transform: scale(1.5) rotate(8deg); opacity: 1; }
    100% { transform: scale(1) rotate(0); }
  }
}
.qz-result-score {
  font: 900 clamp(2.25rem, 7vw, 3rem)/1.1 var(--qz-serif);
  margin: 0 0 0.25rem; color: var(--ink, #26221B);
}
.qz-result-rank { font: 700 1.25rem/1.3 var(--qz-serif); color: var(--bronze-ink, #8A5A12); margin: 0 0 0.25rem; }
.qz-result-blurb { margin: 0 0 1.25rem; color: var(--ink-soft, #4A443A); }
.qz-ladder { list-style: none; margin: 0 0 1.5rem; padding: 0; font-size: 0.8125rem; color: var(--ink-faint, #7A7264); }
.qz-ladder li { padding: 0.125rem 0; }
.qz-ladder li[aria-current="true"] { color: var(--bronze-ink, #8A5A12); font-weight: 700; }
.qz-actions { display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: center; }
.qz-loading, .qz-error { padding: 1rem 0; color: var(--ink-soft, #4A443A); }
.qz-visually-hidden {
  position: absolute; width: 1px; height: 1px; margin: -1px;
  padding: 0; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
}
`;

function acquireStyles(doc) {
  styleRefs++;
  if (!doc.getElementById(STYLE_ID)) {
    const style = doc.createElement("style");
    style.id = STYLE_ID;
    style.textContent = CSS;
    doc.head.appendChild(style);
  }
}

function releaseStyles(doc) {
  styleRefs = Math.max(0, styleRefs - 1);
  if (styleRefs === 0) {
    const el = doc.getElementById(STYLE_ID);
    if (el) el.remove();
  }
}

/* ---------------------------------------------------------------- *
 *  DOM helpers
 * ---------------------------------------------------------------- */

function h(doc, tag, attrs, ...children) {
  const el = doc.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null) continue;
    if (k === "class") el.className = v;
    else if (k === "text") el.textContent = v;
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v);
  }
  for (const c of children) {
    if (c == null) continue;
    el.appendChild(typeof c === "string" ? doc.createTextNode(c) : c);
  }
  return el;
}

/* ---------------------------------------------------------------- *
 *  mountQuiz
 * ---------------------------------------------------------------- */

const RANK_LADDER = [
  "Backbencher", "Committee Member", "Committee Chair", "Deputy Speaker", "Speaker of the House",
];

export function mountQuiz(container) {
  const doc = container.ownerDocument;
  const abort = new AbortController();
  let destroyed = false;

  acquireStyles(doc);

  const root = h(doc, "section", { class: "qz-root", "aria-label": "The Record Quiz" });
  const live = h(doc, "div", { class: "qz-visually-hidden", "aria-live": "polite", role: "status" });
  const stage = h(doc, "div", { class: "qz-stage" });
  root.appendChild(live);
  root.appendChild(stage);
  container.appendChild(root);

  let data = null;
  const state = { round: [], i: 0, score: 0, answered: false };

  function announce(text) { live.textContent = text; }

  function clearStage() { stage.textContent = ""; }

  /* ----- screens ----- */

  function renderLoading() {
    clearStage();
    stage.appendChild(h(doc, "p", { class: "qz-kicker", text: "The Record Quiz" }));
    stage.appendChild(h(doc, "p", { class: "qz-loading", text: "Opening the record…" }));
  }

  function renderError(err) {
    clearStage();
    stage.appendChild(h(doc, "p", { class: "qz-kicker", text: "The Record Quiz" }));
    stage.appendChild(h(doc, "p", {
      class: "qz-error",
      text: "The record wouldn't open (" + (err && err.message ? err.message : "network error") + ").",
    }));
    stage.appendChild(h(doc, "button", {
      class: "qz-btn", type: "button",
      text: "Try again",
      onclick: () => { start(); },
    }));
  }

  function renderIntro() {
    clearStage();
    const speeches = data.corpus && data.corpus.collected_speeches
      ? approxCount(data.corpus.collected_speeches) : "hundreds of thousands of";
    stage.appendChild(h(doc, "p", { class: "qz-kicker", text: "A game from the record" }));
    stage.appendChild(h(doc, "h2", { class: "qz-title", text: "The Record Quiz" }));
    stage.appendChild(h(doc, "p", {
      class: "qz-lead",
      text:
        "Eight quick questions computed straight from the public record — " +
        speeches + " parliamentary speeches and documents, plus 28 years of AEC " +
        "donation disclosures. No opinions and no trick questions: every answer " +
        "comes with its source.",
    }));
    const startBtn = h(doc, "button", {
      class: "qz-btn", type: "button", text: "Start the quiz",
      onclick: () => { newRound(); },
    });
    stage.appendChild(startBtn);
    stage.appendChild(h(doc, "p", {
      class: "qz-fineprint",
      text:
        "Fair play: this quiz identifies what is on the public record — who said what, " +
        "who disclosed what. It never tells you what to think about it.",
    }));
  }

  function renderQuestion() {
    clearStage();
    const q = state.round[state.i];
    const total = state.round.length;
    state.answered = false;

    const topbar = h(doc, "div", { class: "qz-topbar" },
      h(doc, "span", { class: "qz-progress-text", text: "Question " + (state.i + 1) + " of " + total }),
      h(doc, "span", { class: "qz-score", "aria-label": "Score " + state.score, text: "★ " + state.score }),
    );
    const bar = h(doc, "div", { class: "qz-bar", "aria-hidden": "true" },
      h(doc, "div", { class: "qz-bar-fill", style: "width:" + ((state.i / total) * 100) + "%" }),
    );
    const heading = h(doc, "h3", { class: "qz-question", tabindex: "-1", text: q.prompt });

    const optionsWrap = h(doc, "div", { class: "qz-options", role: "group", "aria-label": "Answers" });
    q.options.forEach((opt, idx) => {
      const btn = h(doc, "button", { class: "qz-option", type: "button" },
        h(doc, "span", { class: "qz-key", "aria-hidden": "true", text: String(idx + 1) }),
        h(doc, "span", { class: "qz-option-label", text: opt.label }),
      );
      btn.addEventListener("click", () => answer(idx, btn));
      optionsWrap.appendChild(btn);
    });

    const hint = h(doc, "p", {
      class: "qz-hint",
      text: "Pick an answer — or press " + (q.options.length === 2 ? "1 or 2" : "1, 2 or 3") + " on your keyboard.",
    });
    const feedback = h(doc, "div", { class: "qz-feedback" });

    stage.appendChild(topbar);
    stage.appendChild(bar);
    stage.appendChild(heading);
    stage.appendChild(optionsWrap);
    stage.appendChild(hint);
    stage.appendChild(feedback);
    heading.focus();
  }

  function answer(idx, chosenBtn) {
    if (state.answered || destroyed) return;
    state.answered = true;
    const q = state.round[state.i];
    const correct = !!q.options[idx].correct;
    if (correct) state.score++;

    const buttons = stage.querySelectorAll(".qz-option");
    buttons.forEach((btn, i) => {
      btn.disabled = true;
      const isCorrect = !!q.options[i].correct;
      if (isCorrect) {
        btn.dataset.state = "correct";
        btn.appendChild(h(doc, "span", { class: "qz-mark", "aria-hidden": "true", text: "✓" }));
      } else if (btn === chosenBtn) {
        btn.dataset.state = "wrong";
        btn.appendChild(h(doc, "span", { class: "qz-mark", "aria-hidden": "true", text: "✕" }));
      } else {
        btn.dataset.state = "dim";
      }
    });

    const scoreEl = stage.querySelector(".qz-score");
    if (scoreEl) {
      scoreEl.textContent = "★ " + state.score;
      scoreEl.setAttribute("aria-label", "Score " + state.score);
    }

    const correctLabel = q.options.find((o) => o.correct).label;
    const verdict = h(doc, "p", { class: "qz-verdict" },
      correct ? h(doc, "span", { class: "qz-star", "aria-hidden": "true", text: "★" }) : null,
      correct ? "Correct!" : "Not quite — the answer is " + correctLabel + ".",
    );

    const provenance = h(doc, "p", { class: "qz-provenance" }, "Source: " + q.source + ". ");
    if (q.link) {
      provenance.appendChild(h(doc, "a", { href: q.link.href, text: q.link.label }));
    }

    const isLast = state.i + 1 >= state.round.length;
    const nextBtn = h(doc, "button", {
      class: "qz-btn", type: "button",
      text: isLast ? "See your result" : "Next question",
      onclick: () => { if (isLast) renderResult(); else { state.i++; renderQuestion(); } },
    });

    const panel = h(doc, "div", { class: "qz-panel" },
      verdict,
      h(doc, "p", { class: "qz-explain", text: q.explanation }),
      provenance,
    );
    const feedback = stage.querySelector(".qz-feedback");
    feedback.appendChild(panel);
    feedback.appendChild(nextBtn);

    announce(
      (correct ? "Correct! " : "Not quite. The answer is " + correctLabel + ". ") + q.explanation,
    );
    nextBtn.focus();
  }

  function renderResult() {
    clearStage();
    const total = state.round.length;
    const rank = rankFor(state.score, total);

    stage.appendChild(h(doc, "p", { class: "qz-kicker", text: "The Record Quiz — result" }));
    stage.appendChild(h(doc, "p", {
      class: "qz-result-score",
      text: state.score + " / " + total,
    }));
    stage.appendChild(h(doc, "p", { class: "qz-result-rank", text: rank.name }));
    stage.appendChild(h(doc, "p", { class: "qz-result-blurb", text: rank.blurb }));

    const ladder = h(doc, "ol", { class: "qz-ladder", "aria-label": "Ranks, from first step to top" });
    for (const name of RANK_LADDER) {
      ladder.appendChild(h(doc, "li", {
        "aria-current": name === rank.name ? "true" : null,
        text: (name === rank.name ? "▸ " : "") + name,
      }));
    }
    stage.appendChild(ladder);

    const again = h(doc, "button", {
      class: "qz-btn", type: "button", text: "Play again",
      onclick: () => { newRound(); },
    });
    stage.appendChild(h(doc, "div", { class: "qz-actions" },
      again,
      h(doc, "a", { class: "qz-btn qz-btn--ghost", href: "#/money", text: "Explore the money map" }),
    ));

    announce("You scored " + state.score + " out of " + total + ". Your rank: " + rank.name + ".");
    again.focus();
  }

  function newRound() {
    const seed = Math.floor(Math.random() * 0xffffffff);
    state.round = buildRound(data, createRng(seed), 8);
    state.i = 0;
    state.score = 0;
    if (!state.round.length) {
      renderError(new Error("no questions could be built from the data"));
      return;
    }
    renderQuestion();
  }

  /* number-key answering; scoped to the quiz root so nothing global leaks */
  root.addEventListener("keydown", (e) => {
    if (state.answered || !state.round.length || destroyed) return;
    const n = parseInt(e.key, 10);
    if (!n) return;
    const buttons = stage.querySelectorAll(".qz-option");
    if (n >= 1 && n <= buttons.length && !buttons[n - 1].disabled) {
      e.preventDefault();
      buttons[n - 1].click();
    }
  });

  function start() {
    renderLoading();
    loadData(abort.signal)
      .then((d) => { if (destroyed) return; data = d; renderIntro(); })
      .catch((err) => {
        if (destroyed || (err && err.name === "AbortError")) return;
        renderError(err);
      });
  }

  start();

  return {
    destroy() {
      if (destroyed) return;
      destroyed = true;
      abort.abort();
      root.remove();
      releaseStyles(doc);
    },
  };
}

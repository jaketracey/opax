import {subjectUrl} from './canonical-urls.js';
/*
 * The record quiz — a MindMaze-spirited quiz over OPAX's real data.
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

export function makeQuizContext(data) {
  const money = data.money || { nodes: [], edges: [], meta: {} };
  const donors = money.nodes.filter((n) => n.kind === "donor");
  const donorsById = new Map(donors.map((d) => [d.id, d]));
  const parties = money.nodes.filter((n) => n.kind === "party");

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

  // Faces come from the portrait map (photos/people.json), never from a roster pid:
  // a pid can belong to somebody else, and a file can be withheld from the map.
  const photos = data.photos || {};
  const years = Object.values(data.years || {}).filter((y) => y && y.year && y.voices);

  return {
    money, donors, donorsById, parties, industries, reports, photos, years,
    corpus: data.corpus || null,
  };
}

/* ----- question templates -----
 * Each build(ctx, rng) returns a question object or null if the data
 * can't satisfy the template's fairness constraints. Choice questions carry
 * options; measured questions carry an answer and bounds; ordering questions
 * carry both. Every number, including a bound or wrong option, comes from the
 * same shipped dataset as the answer.
 */

const MONEY_LINK = { href: "/money", label: "Open the money map" };
const METHODS_LINK = { href: "/methods", label: "Read how the record is built" };
function moneyLink(industry) {
  return industry
    ? { href: "/money?industry=" + encodeURIComponent(industry), label: "Open this industry on the money map" }
    : MONEY_LINK;
}
function subjectLink(kind, label) {
  return { href: subjectUrl(kind,label), label: "Open " + label + " in the record" };
}
function reportLink(r) {
  return { href: "/reports/" + r.slug, label: "Read the " + r.title + " report" };
}
function searchLink(query, filters, label) {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  for (const [key, value] of Object.entries(filters || {})) {
    if (value != null && value !== "") params.set(key, String(value));
  }
  return { href: "/ask?view=search&" + params.toString(), label };
}
function portraitFor(ctx, name) {
  const id = ctx.photos[String(name || "").trim().toLowerCase()];
  return id ? "/photos/" + encodeURIComponent(id) + ".webp" : null;
}
function factLine(label, value) { return label + ": " + value; }

const TEMPLATES = [
  {
    id: "money-industry-most", deck: "money",
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
          template: this.id, deck: this.deck, kind: "mc",
          prompt: "Which of these industries has disclosed the most in political donations?",
          options: shuffled(options, rng),
          fact: factLine(industryLabel(top[0]), fmtMoney(top[1].total)),
          explanation:
            "It leads the other two, with disclosures recorded since " + top[1].first + "; " +
            industryLabel(s2[0]) + " (" + fmtMoney(s2[1].total) + ") and " +
            industryLabel(s3[0]) + " (" + fmtMoney(s3[1].total) + ") trail it.",
          source: "AEC disclosures via OPAX's money data",
          link: moneyLink(top[0]),
        };
      }
      return null;
    },
  },

  {
    id: "money-industry-magnitude", deck: "money",
    build(ctx, rng) {
      const cands = [...ctx.industries.entries()]
        .filter(([k, s]) => k !== "individual" && s.total >= 8e6);
      if (!cands.length) return null;
      const [key, s] = pick(cands, rng);
      const peers = shuffled([...ctx.industries.entries()]
        .filter(([other, row]) => other !== key && other !== "individual" && row.total > 0 &&
          Math.max(row.total, s.total) / Math.min(row.total, s.total) <= 8), rng)
        .slice(0, 3);
      if (peers.length < 3) return null;
      const options = shuffled([
        { label: fmtMoney(s.total), value: s.total, correct: true },
        ...peers.map(([, row]) => ({ label: fmtMoney(row.total), value: row.total, correct: false })),
      ], rng);
      if (new Set(options.map((o) => o.label)).size !== options.length) return null;
      const subject = key === "unions"
        ? "have unions" : "has the " + industryLabel(key).toLowerCase() + " industry";
      return {
        template: this.id, deck: this.deck, kind: "mc",
        prompt:
          "Roughly how much " + subject +
          " disclosed in political donations between " + s.first + " and " + s.last + "?",
        options,
        fact: factLine(industryLabel(key), fmtMoney(s.total)),
        explanation:
          fmtCount(s.count) + " disclosed donations from the industry's biggest donors make up that total; " +
          "amounts below the threshold are not visible.",
        source: "AEC disclosures via OPAX's money data",
        link: moneyLink(key),
      };
    },
  },

  {
    id: "words-portrait-topic", deck: "words",
    build(ctx, rng) {
      const cands = ctx.reports.filter((r) =>
        (r.stats.top_speakers || []).filter(([name]) => portraitFor(ctx, name)).length >= 2);
      if (!cands.length) return null;
      for (let t = 0; t < 40; t++) {
        const r = pick(cands, rng);
        const speakers = r.stats.top_speakers.filter(([name]) => portraitFor(ctx, name)).slice(0, 8);
        const [a, b] = shuffled(speakers, rng).slice(0, 2);
        if (!a || !b || a[0] === b[0]) continue;
        const [hi, lo] = a[1] >= b[1] ? [a, b] : [b, a];
        if (hi[1] < 1.3 * lo[1] || hi[1] - lo[1] < 20) continue;
        const options = shuffled([
          { label: hi[0], correct: true, photo: portraitFor(ctx, hi[0]) },
          { label: lo[0], correct: false, photo: portraitFor(ctx, lo[0]) },
        ], rng);
        return {
          template: this.id, deck: this.deck, kind: "portrait",
          prompt: "Who has given more speeches about " + r.title.toLowerCase() + ", " +
            options[0].label + " or " + options[1].label + "?",
          options,
          fact: factLine(hi[0], fmtCount(hi[1]) + " speeches"),
          explanation:
            lo[0] + " appears " + fmtCount(lo[1]) + " times in the same topic report.",
          source: "Parliamentary record via OPAX's " + r.title + " report",
          link: reportLink(r),
        };
      }
      return null;
    },
  },

  {
    id: "money-party-from-industry", deck: "money",
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
          template: this.id, deck: this.deck, kind: "mc",
          prompt: "Which party has received the most disclosed money from " + DONOR_PHRASES[ind] + "?",
          options,
          fact: factLine(sorted[0][0], fmtMoney(sorted[0][1])),
          explanation:
            "That is the largest disclosed total from " + DONOR_PHRASES[ind] + "; " +
            sorted[1][0] + " follows on " + fmtMoney(sorted[1][1]) + ".",
          source: "AEC disclosures via OPAX's money data",
          link: moneyLink(ind),
        };
      }
      return null;
    },
  },

  {
    id: "money-true-false", deck: "money",
    build(ctx, rng) {
      const meta = ctx.money.meta || {};
      const pool = [];

      pool.push({
        statement: "Every political donation in Australia appears in this data, no matter how small.",
        answer: false,
        explanation: "Donations below the AEC threshold are not reported, so every visible total remains a floor.",
        source: "AEC disclosure rules; OPAX's money data",
        link: METHODS_LINK,
      });

      if ((meta.exclusions || []).some((x) => /public electoral funding/i.test(x))) {
        pool.push({
          statement:
            "Taxpayer money the AEC pays parties after each election (public electoral funding) is counted in these donation totals.",
          answer: false,
          explanation:
            "The methodology leaves public electoral funding out" +
            (meta.rows_excluded_public_funding
              ? " (" + fmtCount(meta.rows_excluded_public_funding) + " rows excluded)"
              : "") + ".",
          source: "OPAX money data methodology",
          link: METHODS_LINK,
        });
      }

      if (meta.donor_nodes) {
        pool.push({
          statement: "The OPAX money map shows every donor who has ever disclosed a donation.",
          answer: false,
          explanation:
            "The map deliberately shows the " + fmtCount(meta.donor_nodes) +
            " biggest donors by lifetime total, leaving smaller disclosed donors below the cut.",
          source: "OPAX money data methodology",
          link: METHODS_LINK,
        });
      }

      if (!pool.length) return null;
      const q = pick(pool, rng);
      return {
        template: this.id, deck: this.deck, kind: "tf",
        prompt: "True or false: " + q.statement,
        options: [
          { label: "True", correct: q.answer === true },
          { label: "False", correct: q.answer === false },
        ],
        fact: q.answer ? "True" : "False",
        explanation: q.explanation,
        source: q.source,
        link: q.link,
      };
    },
  },

  {
    id: "words-peak-year", deck: "words",
    build(ctx, rng) {
      const cands = ctx.reports.filter((r) => (r.stats.timeline || []).length >= 10);
      if (!cands.length) return null;
      for (let t = 0; t < 40; t++) {
        const r = pick(cands, rng);
        // Drop the final (possibly partial) year so the "biggest year" is fair.
        const tl = r.stats.timeline.slice(0, -1).map(([y, n]) => [Number(y), n]);
        const peak = tl.reduce((a, b) => (b[1] > a[1] ? b : a));
        if (peak[1] < 50) continue;
        return {
          template: this.id, deck: this.deck, kind: "year",
          prompt: "Which year was parliament's peak for " + r.title.toLowerCase() + "?",
          answer: peak[0], min: tl[0][0], max: tl[tl.length - 1][0], scale: "linear", format: "year",
          fact: factLine(String(peak[0]), fmtCount(peak[1]) + " speeches"),
          explanation:
            "No other complete year in the report records as many speeches on the topic.",
          source: "Parliamentary record via OPAX's " + r.title + " report",
          link: reportLink(r),
        };
      }
      return null;
    },
  },

  {
    id: "words-topic-higher-lower", deck: "words",
    build(ctx, rng) {
      if (ctx.reports.length < 2) return null;
      for (let t = 0; t < 40; t++) {
        const [a, b] = shuffled(ctx.reports, rng).slice(0, 2);
        const [hi, lo] = a.stats.speech_count >= b.stats.speech_count ? [a, b] : [b, a];
        if (hi.stats.speech_count < 1.3 * lo.stats.speech_count) continue;
        const shownFirst = rng() < 0.5;
        const shown = shownFirst ? a : b;
        const hidden = shownFirst ? b : a;
        const isHigher = hidden.stats.speech_count > shown.stats.speech_count;
        return {
          template: this.id, deck: this.deck, kind: "higher-lower",
          prompt: "Does " + hidden.title.toLowerCase() + " appear in more or fewer speeches?",
          comparison: {
            shownLabel: shown.title, shownValue: shown.stats.speech_count,
            shownDisplay: fmtCount(shown.stats.speech_count) + " speeches",
            hiddenLabel: hidden.title, hiddenValue: hidden.stats.speech_count,
            hiddenDisplay: fmtCount(hidden.stats.speech_count) + " speeches",
          },
          options: [
            { label: "Higher", correct: isHigher },
            { label: "Lower", correct: !isHigher },
          ],
          fact: factLine(hidden.title, fmtCount(hidden.stats.speech_count) + " speeches"),
          explanation:
            shown.title + " appears in " + fmtCount(shown.stats.speech_count) +
            ", making " + hidden.title + " the " + (isHigher ? "higher" : "lower") + " figure.",
          source: "Parliamentary record via OPAX's topic reports",
          link: reportLink(hidden),
        };
      }
      return null;
    },
  },

  {
    id: "money-donor-higher-lower", deck: "money",
    build(ctx, rng) {
      for (let t = 0; t < 40; t++) {
        const [shown, hidden] = shuffled(ctx.donors.filter((d) => d.total >= 1e6), rng).slice(0, 2);
        if (!shown || !hidden || shown.label === hidden.label) continue;
        const ratio = Math.max(shown.total, hidden.total) / Math.min(shown.total, hidden.total);
        if (ratio < 1.35 || ratio > 8) continue;
        const isHigher = hidden.total > shown.total;
        return {
          template: this.id, deck: this.deck, kind: "higher-lower",
          prompt: "Did " + hidden.label + " disclose a higher or lower lifetime total?",
          comparison: {
            shownLabel: shown.label, shownValue: shown.total, shownDisplay: fmtMoney(shown.total),
            hiddenLabel: hidden.label, hiddenValue: hidden.total, hiddenDisplay: fmtMoney(hidden.total),
          },
          options: [
            { label: "Higher", correct: isHigher },
            { label: "Lower", correct: !isHigher },
          ],
          fact: factLine(hidden.label, fmtMoney(hidden.total)),
          explanation:
            shown.label + " disclosed " + fmtMoney(shown.total) + ", so the second figure is " +
            (isHigher ? "higher" : "lower") + ".",
          source: "AEC disclosures via OPAX's money data",
          link: subjectLink("donor", hidden.label),
        };
      }
      return null;
    },
  },

  {
    id: "money-donor-order", deck: "money",
    build(ctx, rng) {
      for (let t = 0; t < 40; t++) {
        const key = pick([...ctx.industries.keys()].filter((k) => k !== "individual"), rng);
        const pool = ctx.donors.filter((d) => d.industry === key && d.total >= 500000);
        const trio = shuffled(pool, rng).slice(0, 3).sort((a, b) => b.total - a.total);
        if (trio.length < 3 || trio[0].total < 1.2 * trio[1].total || trio[1].total < 1.15 * trio[2].total) continue;
        return {
          template: this.id, deck: this.deck, kind: "order",
          prompt: "Put these " + industryLabel(key).toLowerCase() + " donors in order, largest disclosed total first.",
          options: shuffled(trio.map((d) => ({ label: d.label, value: d.total })), rng),
          answer: trio.map((d) => d.label),
          fact: trio.map((d) => d.label + " " + fmtMoney(d.total)).join("; "),
          explanation:
            "The ranking uses each donor's full disclosed total across the years covered by the money map.",
          source: "AEC disclosures via OPAX's money data",
          link: subjectLink("donor", trio[0].label),
        };
      }
      return null;
    },
  },

  {
    id: "money-donor-figure", deck: "money",
    build(ctx, rng) {
      for (let t = 0; t < 40; t++) {
        const donor = pick(ctx.donors.filter((d) => d.total >= 500000), rng);
        if (!donor) return null;
        const peers = ctx.donors.filter((d) => d.industry === donor.industry && d.total > 0);
        if (peers.length < 4) continue;
        const values = peers.map((d) => d.total).sort((a, b) => a - b);
        const min = values[0], max = values[values.length - 1];
        if (min === max || donor.total < min || donor.total > max) continue;
        return {
          template: this.id, deck: this.deck, kind: "slider",
          prompt: "How much has " + donor.label + " disclosed in total?",
          answer: donor.total, min, max, scale: "log", format: "money",
          fact: factLine(donor.label, fmtMoney(donor.total)),
          explanation: "The range is set by real " + industryLabel(donor.industry).toLowerCase() +
            " donor totals, and this is the donor's lifetime disclosed figure.",
          source: "AEC disclosures via OPAX's money data",
          link: subjectLink("donor", donor.label),
        };
      }
      return null;
    },
  },

  {
    id: "money-top-donor-in-report", deck: "money",
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
          template: this.id, deck: this.deck, kind: "mc",
          prompt: "These three are among the biggest donors tracked in the " + r.title +
            " report. Which one has disclosed the most?",
          options,
          fact: factLine(top[0], fmtMoney(top[1])),
          explanation:
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
    id: "money-party-peak-year", deck: "money",
    build(ctx, rng) {
      const parties = shuffled(ctx.parties.filter((p) => Object.keys(p.byYear || {}).length >= 12), rng);
      for (const party of parties) {
        const rows = Object.entries(party.byYear || {})
          .map(([year, values]) => [Number(year), Number(values[0])])
          .filter(([year, value]) => year <= 2024 && value > 0)
          .sort((a, b) => a[0] - b[0]);
        if (rows.length < 12) continue;
        const peak = rows.reduce((a, b) => b[1] > a[1] ? b : a);
        return {
          template: this.id, deck: this.deck, kind: "year",
          prompt: "In which year did " + party.label + " receive its largest disclosed total?",
          answer: peak[0], min: rows[0][0], max: rows[rows.length - 1][0], scale: "linear", format: "year",
          fact: factLine(String(peak[0]), fmtMoney(peak[1])),
          explanation: "That is the party's highest annual figure in the complete years shown on the federal money map.",
          source: "AEC disclosures via OPAX's money data",
          link: subjectLink("party", party.label),
        };
      }
      return null;
    },
  },

  {
    id: "words-year-order", deck: "words",
    build(ctx, rng) {
      const candidates = ctx.reports.filter((r) => (r.stats.timeline || []).length >= 10);
      for (let t = 0; t < 40; t++) {
        const r = pick(candidates, rng);
        if (!r) return null;
        const rows = shuffled(r.stats.timeline.slice(0, -1).map(([year, value]) => ({
          label: String(year), value: Number(value),
        })).filter((row) => row.value >= 20), rng).slice(0, 3).sort((a, b) => b.value - a.value);
        if (rows.length < 3 || rows[0].value < 1.2 * rows[1].value || rows[1].value < 1.15 * rows[2].value) continue;
        return {
          template: this.id, deck: this.deck, kind: "order",
          prompt: "Order these years by how much parliament talked about " + r.title.toLowerCase() + ", busiest first.",
          options: shuffled(rows, rng), answer: rows.map((row) => row.label),
          fact: rows.map((row) => row.label + " " + fmtCount(row.value)).join("; "),
          explanation: "The report counts speeches touching on the topic in each calendar year.",
          source: "Parliamentary record via OPAX's " + r.title + " report",
          link: reportLink(r),
        };
      }
      return null;
    },
  },

  {
    id: "words-topic-figure", deck: "words",
    build(ctx, rng) {
      if (ctx.reports.length < 3) return null;
      const report = pick(ctx.reports, rng);
      const values = ctx.reports.map((r) => Number(r.stats.speech_count)).filter((n) => n > 0).sort((a, b) => a - b);
      if (!report || values[0] === values[values.length - 1]) return null;
      return {
        template: this.id, deck: this.deck, kind: "slider",
        prompt: "How many speeches does the " + report.title + " report find?",
        answer: Number(report.stats.speech_count), min: values[0], max: values[values.length - 1],
        scale: "log", format: "count",
        fact: factLine(report.title, fmtCount(report.stats.speech_count) + " speeches"),
        explanation: "The range runs from the smallest to the largest real topic-report count.",
        source: "Parliamentary record via OPAX's topic reports",
        link: reportLink(report),
      };
    },
  },

  {
    id: "words-year-voice", deck: "words",
    build(ctx, rng) {
      const candidates = shuffled(ctx.years, rng);
      for (const year of candidates) {
        const speakers = (year.voices.speakers || [])
          .filter((s) => s.speeches > 0 && portraitFor(ctx, s.name));
        const [a, b] = shuffled(speakers, rng).slice(0, 2);
        if (!a || !b || a.speeches === b.speeches) continue;
        const [hi, lo] = a.speeches > b.speeches ? [a, b] : [b, a];
        if (hi.speeches < 1.3 * lo.speeches) continue;
        return {
          template: this.id, deck: this.deck, kind: "portrait",
          prompt: "Who appeared more often in OPAX's sample of the defining debates of " + year.year + "?",
          options: shuffled([
            { label: hi.name, correct: true, photo: portraitFor(ctx, hi.name) },
            { label: lo.name, correct: false, photo: portraitFor(ctx, lo.name) },
          ], rng),
          fact: factLine(hi.name, fmtCount(hi.speeches) + " sampled speeches"),
          explanation: lo.name + " appears " + fmtCount(lo.speeches) +
            " times in the same retrieval sample; this is a sample, not a full-year tally.",
          source: "OPAX's cited " + year.year + " year brief and voices sample",
          link: searchLink("", { speaker: hi.name, from: year.year, to: year.year },
            "Search " + hi.name + " in the " + year.year + " record"),
        };
      }
      return null;
    },
  },

  {
    id: "words-record-true-false", deck: "words",
    build(ctx, rng) {
      const sources = (ctx.corpus && ctx.corpus.sources) || [];
      const stateNames = sources.filter((s) => /parliament/i.test(s.name || ""));
      const pool = [];
      if (stateNames.length >= 2) {
        pool.push({
          statement: "The searchable record includes state parliaments as well as federal Hansard.",
          answer: true,
          fact: "True",
          explanation: "Several state parliaments appear alongside federal chambers in the corpus manifest.",
        });
      }
      if (ctx.corpus && ctx.corpus.collected_speeches) {
        pool.push({
          statement: "The searchable record contains fewer than 100,000 speeches and documents.",
          answer: false,
          fact: "False — " + fmtCount(ctx.corpus.collected_speeches) + " are collected",
          explanation: "The corpus manifest puts the collection comfortably above that mark.",
        });
      }
      if (!pool.length) return null;
      const q = pick(pool, rng);
      return {
        template: this.id, deck: this.deck, kind: "tf",
        prompt: "True or false: " + q.statement,
        options: [
          { label: "True", correct: q.answer === true },
          { label: "False", correct: q.answer === false },
        ],
        fact: q.fact, explanation: q.explanation, source: "OPAX corpus manifest", link: METHODS_LINK,
      };
    },
  },

  {
    id: "words-biggest-source", deck: "words",
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
          template: this.id, deck: this.deck, kind: "mc",
          prompt: "OPAX gathers the record from many places. Which of these sources contributes the most documents?",
          options,
          fact: factLine(short(trio[0]), fmtCount(trio[0].docs) + " documents"),
          explanation:
            "Its " + trio[0].coverage + " collection is larger than " + fmtCount(trio[1].docs) + " from " + short(trio[1]) +
            " and " + fmtCount(trio[2].docs) + " from " + short(trio[2]) + ".",
          source: "OPAX corpus",
          link: METHODS_LINK,
        };
      }
      return null;
    },
  },
];

export { TEMPLATES };

export function validateQuestion(q) {
  if (!q || !q.template || !q.deck || !q.kind || !q.prompt || !q.fact ||
      !q.explanation || !q.source || !q.link || !q.link.href || !q.link.label) return false;
  if (!/^(\/|#\/)/.test(q.link.href) || /^(?:javascript|data):/i.test(q.link.href)) return false;
  if (["mc", "tf", "higher-lower", "portrait"].includes(q.kind)) {
    if (!Array.isArray(q.options) || q.options.length < 2 || q.options.length > 4) return false;
    if (q.options.filter((o) => o.correct).length !== 1) return false;
    if (new Set(q.options.map((o) => o.label)).size !== q.options.length) return false;
    if (q.kind === "portrait" && q.options.some((o) => !/^\/photos\/.+\.webp$/.test(o.photo || ""))) return false;
  } else if (q.kind === "order") {
    if (!Array.isArray(q.options) || q.options.length !== 3 || !Array.isArray(q.answer) || q.answer.length !== 3) return false;
    if (new Set(q.options.map((o) => o.label)).size !== 3 || new Set(q.options.map((o) => o.value)).size !== 3) return false;
    if (q.answer.some((label) => !q.options.some((o) => o.label === label))) return false;
  } else if (q.kind === "slider" || q.kind === "year") {
    if (![q.answer, q.min, q.max].every(Number.isFinite) || q.min >= q.max || q.answer < q.min || q.answer > q.max) return false;
  } else return false;
  return true;
}

/**
 * Build one round of questions from the loaded data.
 * data = { money, reports: {slug: reportJson}, corpus, photos, years }
 */
export function buildRound(data, rng = Math.random, count = 8, deck = "mixed") {
  const ctx = makeQuizContext(data);
  const questions = [];
  const usedPrompts = new Set();
  const wanted = deck === "money" || deck === "words" ? deck : "mixed";
  let order;
  if (wanted === "mixed") {
    const money = shuffled(TEMPLATES.filter((t) => t.deck === "money"), rng);
    const words = shuffled(TEMPLATES.filter((t) => t.deck === "words"), rng);
    order = [];
    while (money.length || words.length) {
      const first = rng() < 0.5 ? money : words;
      const second = first === money ? words : money;
      if (first.length) order.push(first.shift());
      if (second.length) order.push(second.shift());
    }
  } else {
    order = shuffled(TEMPLATES.filter((t) => t.deck === wanted), rng);
  }

  // First pass: at most one question per template.
  for (const tpl of order) {
    if (questions.length >= count) break;
    for (let attempt = 0; attempt < 4; attempt++) {
      const q = tpl.build(ctx, rng);
      if (q && validateQuestion(q) && !usedPrompts.has(q.prompt)) {
        usedPrompts.add(q.prompt);
        questions.push(q);
        break;
      }
    }
  }
  // Fallback: if some templates couldn't fire (partial data), allow reuse
  // with different instantiations rather than shipping a short round.
  let guard = 0;
  while (questions.length < count && guard++ < 300) {
    const q = pick(order, rng).build(ctx, rng);
    if (q && validateQuestion(q) && !usedPrompts.has(q.prompt)) {
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

async function fetchJson(url, signal, init) {
  const res = await fetch(url, { signal, ...init });
  if (!res.ok) throw new Error(url + " → HTTP " + res.status);
  return res.json();
}

async function loadData(signal) {
  const [money, index, corpus, photos, yearIndex] = await Promise.all([
    fetchJson("/graph/money.json", signal),
    fetchJson("/reports/index.json", signal),
    fetchJson("/corpus.json", signal).catch(() => null),
    fetchJson("/photos/people.json", signal, { cache: "no-cache" }).catch(() => null),  // whose face: revalidated
    fetchJson("/years/index.json", signal).catch(() => null),
  ]);
  const reports = {};
  const years = {};
  await Promise.all([
    ...((index && index.reports) || []).map(async (r) => {
      try { reports[r.slug] = await fetchJson("/reports/" + r.slug + ".json", signal); }
      catch (e) { if (e && e.name === "AbortError") throw e; /* skip a broken report */ }
    }),
    ...Object.keys((yearIndex && yearIndex.years) || {}).map(async (year) => {
      try { years[year] = await fetchJson("/years/" + year + ".json", signal); }
      catch (e) { if (e && e.name === "AbortError") throw e; /* year questions degrade */ }
    }),
  ]);
  return { money, reports, corpus, photos, years };
}

/* ---------------------------------------------------------------- *
 *  Styles
 * ---------------------------------------------------------------- */

const STYLE_ID = "qz-styles";
let styleRefs = 0;

const CSS = `
/* Colours, type, space and motion are the site tokens (tokens.css); buttons
   and the length chips are the shared controls (ui-controls.css). The game's
   own pieces (deck and portrait cards, answer rows, the ruler) keep their
   shapes: cards you press are radius 12, rows are hairline-ruled, and a
   chosen card or row is told by a navy edge or key on the navy wash. */
.qz-root {
  font: var(--type-body);
  color: var(--ink);
  background: transparent;
  width: 100%;
  max-width: 68rem;
  margin-inline: auto;
  padding: 0 clamp(0rem, 2vw, 1rem) clamp(0.5rem, 2vw, 1.5rem);
  box-sizing: border-box;
}
.qz-root *, .qz-root *::before, .qz-root *::after { box-sizing: border-box; }
.qz-root button { cursor: pointer; }
.qz-root button:focus-visible, .qz-root a:focus-visible, .qz-root input:focus-visible {
  outline: var(--border-focus) solid var(--bronze-ink); outline-offset: 3px;
}
.qz-stage { width: 100%; }
.qz-intro { max-width: 62rem; padding-bottom: var(--space-line); }
.qz-edition {
  margin: 0 0 var(--space-tight); color: var(--bronze-ink);
  font: var(--type-label);
}
.qz-title {
  margin: 0 0 var(--space-heading);
  color: var(--ink); font: var(--type-title);
}
.qz-title:focus { outline: none; }
.qz-lead {
  max-width: 66ch; margin: 0 0 var(--space-group);
  color: var(--ink-soft); font: var(--type-body);
}
.qz-setup {
  display: grid; grid-template-columns: minmax(0, 1fr) minmax(17rem, 0.34fr);
  gap: var(--space-group) var(--space-section); align-items: start;
  padding-top: var(--space-group); border-top: var(--border-hairline) solid var(--divider-default);
}
.qz-fieldset { min-width: 0; margin: 0; padding: 0; border: 0; }
.qz-legend {
  width: 100%; margin: 0 0 var(--space-heading); padding: 0;
  color: var(--ink); font: var(--type-subheading);
}
.qz-decks { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-tight); }
.qz-deck {
  min-height: 8.25rem; padding: var(--space-block); text-align: left;
  border: var(--border-hairline) solid var(--divider-subtle); border-radius: var(--radius-md);
  background: var(--paper-raised); color: var(--ink); font: var(--type-body);
  transition: background-color var(--duration-quick) var(--ease-standard), border-color var(--duration-quick) var(--ease-standard);
}
.qz-deck:not([aria-pressed="true"]):hover { background: var(--paper-sunken); }
.qz-deck[aria-pressed="true"] { border-color: var(--navy); background: var(--navy-wash); }
.qz-deck-name { display: block; margin-bottom: var(--space-line); font: var(--type-subheading); }
.qz-deck-note { display: block; color: var(--ink-soft); font: var(--type-fine); }
.qz-lengths { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-tight); margin-bottom: var(--space-block); }
.qz-lengths .ui-chip { justify-content: center; min-height: var(--size-target); white-space: nowrap; }
.qz-wide { width: 100%; }
.qz-fineprint {
  max-width: 68ch; margin: var(--space-block) 0 0; font: var(--type-fine);
  color: var(--ink-soft);
}
.qz-round { max-width: 58rem; margin-inline: auto; }
.qz-topbar {
  display: grid; grid-template-columns: 1fr auto auto; align-items: baseline;
  gap: var(--space-heading) var(--space-group); margin: 0 0 var(--space-tight);
}
.qz-progress-text, .qz-points { font: var(--type-label); color: var(--ink-soft); font-variant-numeric: tabular-nums; }
.qz-multiplier { color: var(--bronze-ink); font: var(--type-label); font-variant-numeric: tabular-nums; white-space: nowrap; }
.qz-ticks {
  display: grid; grid-template-columns: repeat(var(--qz-total), 1fr); gap: var(--space-line);
  margin: 0 0 var(--space-group); height: 3px;
}
.qz-tick {
  height: var(--border-hairline); background: var(--divider-default);
  transition: height var(--duration-quick) var(--ease-standard), background-color var(--duration-quick) var(--ease-standard);
}
.qz-tick.is-done { height: 3px; background: var(--chart-mark); }
.qz-tick.is-current { height: 3px; background: var(--ink); }
.qz-form-label { margin: 0 0 var(--space-tight); color: var(--bronze-ink); font: var(--type-label); }
.qz-question {
  max-width: 34ch; font: var(--type-heading);
  margin: 0 0 var(--space-group); color: var(--ink);
}
.qz-question:focus { outline: none; }
.qz-answer-area { max-width: 48rem; }
.qz-options { display: flex; flex-direction: column; margin: 0 0 var(--space-block); border-bottom: var(--border-hairline) solid var(--divider-default); }
.qz-option {
  display: flex; align-items: center; gap: var(--space-heading); width: 100%;
  min-height: 52px; padding: var(--space-heading) var(--space-tight); text-align: left;
  background: transparent; color: var(--ink);
  border: 0; border-top: var(--border-hairline) solid var(--divider-default); border-radius: 0;
  font: var(--type-body);
  transition: background-color var(--duration-quick) var(--ease-standard);
}
.qz-option:hover:not(:disabled) { background: var(--bronze-wash); }
.qz-option:disabled { cursor: default; }
/* Chosen: the row's key fills navy, as a chosen chip does. */
.qz-option[aria-pressed="true"] { background: var(--bronze-wash); }
.qz-option[aria-pressed="true"] .qz-key { border-color: var(--navy); background: var(--navy); color: var(--on-navy); }
.qz-option[data-state="correct"] { background: var(--bronze-wash); font-weight: 600; }
.qz-option[data-state="wrong"] {
  background: var(--paper-sunken); color: var(--ink-soft); text-decoration: line-through;
}
.qz-option[data-state="dim"] { opacity: 0.6; }
.qz-key {
  flex: 0 0 auto; width: 1.65rem; height: 1.65rem; border-radius: var(--radius-round);
  display: inline-flex; align-items: center; justify-content: center;
  font: var(--type-label); font-variant-numeric: tabular-nums; color: var(--ink-soft);
  border: var(--border-hairline) solid var(--divider-default); background: var(--paper-raised);
}
.qz-mark { flex: 0 0 auto; margin-left: auto; font-weight: 600; }
.qz-option[data-state="correct"] .qz-mark { color: var(--bronze-ink); }
.qz-hint { margin: var(--space-tight) 0 var(--space-block); font: var(--type-fine); color: var(--ink-soft); }
.qz-question-actions { display: flex; align-items: center; gap: var(--space-heading); margin-top: var(--space-tight); }
.qz-compare {
  display: grid; grid-template-columns: 1fr auto 1fr; gap: var(--space-heading) var(--space-block);
  align-items: stretch; margin-bottom: var(--space-block);
}
.qz-figure {
  min-height: 7.5rem; display: flex; flex-direction: column; justify-content: center;
  padding: var(--space-block);
  border-top: var(--border-hairline) solid var(--divider-default); border-bottom: var(--border-hairline) solid var(--divider-default);
}
.qz-figure--unknown { background: var(--bronze-wash); }
.qz-figure-name { color: var(--ink-soft); font: var(--type-metadata); }
.qz-figure-value { margin-top: var(--space-line); font: var(--type-display); font-variant-numeric: tabular-nums; }
.qz-versus { align-self: center; color: var(--ink-soft); font: var(--type-fine); }
.qz-order-list { margin-bottom: var(--space-block); border-bottom: var(--border-hairline) solid var(--divider-default); }
.qz-order-option { position: relative; }
.qz-order-position {
  flex: 0 0 auto; width: 2rem; color: var(--bronze-ink);
  font: var(--type-subheading); font-variant-numeric: tabular-nums; text-align: center;
}
.qz-order-option:not([aria-pressed="true"]) .qz-order-position { color: var(--ink-faint); font-weight: 400; }
.qz-portraits { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-heading); margin-bottom: var(--space-block); }
.qz-portrait {
  min-height: 13rem; display: grid; justify-items: center; align-content: center; gap: var(--space-heading);
  padding: var(--space-block) var(--space-heading);
  border: var(--border-hairline) solid var(--divider-subtle); border-radius: var(--radius-md);
  background: var(--paper-raised); color: var(--ink); text-align: center; font: var(--type-body);
  transition: background-color var(--duration-quick) var(--ease-standard), border-color var(--duration-quick) var(--ease-standard);
}
.qz-portrait:not([aria-pressed="true"]):hover:not(:disabled) { background: var(--paper-sunken); }
.qz-portrait[aria-pressed="true"] { border-color: var(--navy); background: var(--navy-wash); }
.qz-portrait img {
  width: clamp(6.25rem, 17vw, 8rem); height: clamp(6.25rem, 17vw, 8rem); object-fit: cover;
  border-radius: var(--radius-round); filter: saturate(0.75) contrast(1.04); background: var(--paper-sunken);
}
.qz-portrait-name { font: var(--type-strong); }
.qz-portrait-key { color: var(--ink-soft); font: var(--type-fine); }
.qz-portrait[data-state="correct"] { border-color: var(--bronze-ink); background: var(--bronze-wash); }
.qz-portrait[data-state="wrong"] { opacity: 0.58; }
.qz-measure { margin-bottom: var(--space-tight); }
.qz-measure-output {
  display: block; min-height: 2.8rem; margin-bottom: var(--space-tight);
  color: var(--ink); font: var(--type-display); font-variant-numeric: tabular-nums; text-align: center;
}
.qz-range-wrap { position: relative; padding: var(--space-line) 0 var(--space-tight); }
.qz-range {
  width: 100%; height: var(--size-target); margin: 0; appearance: none; background: transparent; cursor: ew-resize;
}
.qz-range::-webkit-slider-runnable-track { height: 2px; background: var(--line-control); }
.qz-range::-moz-range-track { height: 2px; background: var(--line-control); }
.qz-range::-webkit-slider-thumb {
  box-sizing: border-box; width: 28px; height: 28px; margin-top: -13px; appearance: none;
  border: var(--border-hairline) solid var(--bronze-ink); border-radius: var(--radius-round); background: var(--bronze);
}
.qz-range::-moz-range-thumb {
  box-sizing: border-box; width: 28px; height: 28px;
  border: var(--border-hairline) solid var(--bronze-ink); border-radius: var(--radius-round); background: var(--bronze);
}
.qz-range:disabled { opacity: 0.7; cursor: default; }
.qz-scale {
  display: flex; justify-content: space-between; gap: var(--space-block);
  color: var(--ink-soft); font: var(--type-fine); font-variant-numeric: tabular-nums;
}
.qz-landing { position: relative; height: 4.1rem; margin: var(--space-line) 0 var(--space-block); border-top: var(--border-hairline) solid var(--divider-default); }
.qz-landing-mark { position: absolute; top: -0.35rem; width: 0; text-align: center; }
.qz-landing-mark::before { content: ""; display: block; width: var(--border-hairline); height: 1.25rem; margin: 0 auto 0.15rem; background: currentColor; }
.qz-landing-mark span {
  display: block; width: 6.5rem; color: inherit; font: var(--type-fine); font-variant-numeric: tabular-nums;
  transform: translateX(-50%);
}
.qz-landing-mark.is-edge-start span { transform: none; text-align: left; }
.qz-landing-mark.is-edge-end span { transform: translateX(-100%); text-align: right; }
.qz-landing-mark--guess { top: 1.8rem; color: var(--ink-soft); }
.qz-landing-mark--guess::before { height: 0.65rem; }
.qz-landing-mark--answer { color: var(--bronze-ink); }
.qz-landing-mark--answer span { font-weight: 600; }
.qz-feedback { min-height: 1px; margin-top: var(--space-group); }
.qz-panel {
  padding: var(--space-block) 0 0; border-top: var(--border-hairline) solid var(--divider-default); margin: 0 0 var(--space-block);
}
.qz-verdict {
  color: var(--bronze-ink); font: var(--type-subheading); margin: 0 0 var(--space-tight);
  display: flex; align-items: center; gap: var(--space-tight);
}
.qz-fact { position: relative; display: inline-block; margin: 0 0 var(--space-tight); font: var(--type-heading); }
.qz-explain { max-width: 66ch; margin: 0 0 var(--space-tight); font: var(--type-body); color: var(--ink-soft); }
.qz-provenance { margin: 0; font: var(--type-fine); color: var(--ink-soft); }
.qz-provenance a { color: var(--bronze-ink); text-decoration-color: var(--bronze-rule); text-underline-offset: 0.16em; }
.qz-actions { display: flex; flex-wrap: wrap; gap: var(--space-tight); align-items: center; }
.qz-copy-status { min-height: 1.25rem; margin: var(--space-tight) 0 0; color: var(--ink-soft); font: var(--type-fine); }
@media (prefers-reduced-motion: no-preference) {
  .qz-stage.is-correct .qz-fact::after {
    content: ""; position: absolute; inset: -0.42rem -0.65rem; pointer-events: none;
    border: var(--border-hairline) solid var(--bronze); border-radius: var(--radius-round);
    animation: qz-ring var(--duration-gentle) var(--ease-standard) both;
  }
  .qz-stage.is-wrong .qz-answer-area { animation: qz-shake var(--duration-standard) var(--ease-standard); }
  .qz-stage.is-correct .qz-landing-mark--answer { animation: qz-land var(--duration-gentle) var(--ease-standard); }
  @keyframes qz-ring { from { opacity: 0.8; transform: scale(0.72); } to { opacity: 0; transform: scale(1.18); } }
  @keyframes qz-shake { 0%, 100% { transform: none; } 30% { transform: translateX(-5px); } 65% { transform: translateX(4px); } }
  @keyframes qz-land { from { opacity: 0; transform: translateY(-0.8rem); } to { opacity: 1; transform: none; } }
}
.qz-result { max-width: 64rem; margin-inline: auto; }
.qz-result:focus { outline: none; }
.qz-result-head {
  display: grid; grid-template-columns: minmax(14rem, 0.38fr) 1fr; gap: var(--space-group) var(--space-section); align-items: end;
  padding-bottom: var(--space-group); border-bottom: var(--border-hairline) solid var(--divider-default);
}
.qz-result-label { margin: 0 0 var(--space-line); color: var(--bronze-ink); font: var(--type-label); }
.qz-result-score { font: var(--type-display); font-variant-numeric: tabular-nums; margin: 0; color: var(--ink); }
.qz-result-rank { font: var(--type-heading); color: var(--bronze-ink); margin: 0 0 var(--space-line); }
.qz-result-blurb { max-width: 42ch; margin: 0; color: var(--ink-soft); font: var(--type-body); }
.qz-result-meta {
  display: flex; flex-wrap: wrap; gap: var(--space-line) var(--space-group); margin: var(--space-heading) 0 0;
  color: var(--ink-soft); font: var(--type-metadata); font-variant-numeric: tabular-nums;
}
.qz-recap-title { margin: var(--space-group) 0 var(--space-heading); font: var(--type-heading); }
.qz-recap { list-style: none; margin: 0 0 var(--space-group); padding: 0; border-bottom: var(--border-hairline) solid var(--divider-subtle); }
.qz-recap-item {
  display: grid; grid-template-columns: 2rem minmax(0, 1fr) auto; gap: var(--space-heading);
  padding: var(--space-heading) 0; border-top: var(--border-hairline) solid var(--divider-subtle); align-items: start;
}
.qz-recap-no { color: var(--ink-soft); font: var(--type-label); font-variant-numeric: tabular-nums; }
.qz-recap-question { margin: 0 0 var(--space-line); font: var(--type-metadata); color: var(--ink-soft); }
.qz-recap-answer { margin: 0; font: var(--type-strong); }
.qz-recap-answer a { color: var(--bronze-ink); text-decoration-color: var(--bronze-rule); }
.qz-recap-mark { color: var(--bronze-ink); font: var(--type-label); font-variant-numeric: tabular-nums; }
.qz-recap-mark.is-wrong { color: var(--ink-soft); }
.qz-loading, .qz-error { max-width: 50rem; padding: var(--space-block) 0 var(--space-section); color: var(--ink-soft); font: var(--type-body); }
.qz-visually-hidden {
  position: absolute; width: 1px; height: 1px; margin: -1px;
  padding: 0; overflow: hidden; clip: rect(0 0 0 0); clip-path: inset(50%);
  white-space: normal; overflow-wrap: anywhere; contain: strict; border: 0;
}
@media (max-width: 720px) {
  .qz-setup { grid-template-columns: 1fr; gap: var(--space-group); }
  .qz-result-head { grid-template-columns: 1fr; gap: var(--space-heading); align-items: start; }
  .qz-deck { min-height: 7.5rem; }
}
@media (max-width: 520px) {
  .qz-root { padding-inline: 0; }
  .qz-decks { grid-template-columns: 1fr; }
  .qz-deck { min-height: 52px; padding: var(--space-row) var(--space-heading); }
  .qz-deck-name { margin: 0; }
  .qz-deck-note { display: none; }
  .qz-topbar { grid-template-columns: 1fr auto; }
  .qz-points { grid-column: 1; grid-row: 2; }
  .qz-multiplier { grid-column: 2; grid-row: 1 / span 2; }
  .qz-compare { grid-template-columns: 1fr; }
  .qz-versus { display: none; }
  .qz-figure { min-height: 5.8rem; }
  .qz-figure-value { font: var(--type-heading); font-variant-numeric: tabular-nums; }
  .qz-portraits { gap: var(--space-tight); }
  .qz-portrait { min-height: 11.5rem; padding-inline: var(--space-tight); }
  .qz-question-actions .ui-button { width: 100%; }
  .qz-actions { align-items: stretch; }
  .qz-actions .ui-button { flex: 1 1 100%; }
  .qz-recap-item { grid-template-columns: 1.6rem minmax(0, 1fr); }
  .qz-recap-mark { grid-column: 2; }
}
@media (min-width: 800px) {
  .qz-recap {
    display: grid; grid-auto-flow: column; grid-template-rows: repeat(var(--qz-recap-rows), auto);
    grid-auto-columns: minmax(0, 1fr); column-gap: var(--space-section); border-bottom: 0;
  }
  .qz-recap-item { grid-template-columns: 1.6rem minmax(0, 1fr) auto; }
}
@media (prefers-reduced-motion: reduce) {
  .qz-root *, .qz-root *::before, .qz-root *::after { animation: none !important; transition: none !important; scroll-behavior: auto !important; }
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

const FORM_LABELS = {
  mc: "Choose one",
  tf: "True or false",
  "higher-lower": "Higher or lower",
  order: "Put them in order",
  slider: "Guess the figure",
  year: "Choose a year",
  portrait: "Who said more",
};

function freshSeed() {
  if (globalThis.crypto && typeof globalThis.crypto.getRandomValues === "function") {
    const out = new Uint32Array(1);
    globalThis.crypto.getRandomValues(out);
    return out[0];
  }
  return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
}

function formatQuestionValue(q, value) {
  if (q.format === "money") return fmtMoney(value);
  if (q.format === "year") return String(Math.round(value));
  return fmtCount(Math.round(value));
}

function sliderValue(q, position) {
  const ratio = Math.max(0, Math.min(1000, position)) / 1000;
  if (q.scale === "log") {
    const lo = Math.log(q.min), hi = Math.log(q.max);
    return Math.exp(lo + ratio * (hi - lo));
  }
  return q.min + ratio * (q.max - q.min);
}

function sliderPosition(q, value) {
  if (q.scale === "log") {
    return 100 * (Math.log(value) - Math.log(q.min)) / (Math.log(q.max) - Math.log(q.min));
  }
  return 100 * (value - q.min) / (q.max - q.min);
}

function correctAnswerText(q) {
  if (["mc", "tf", "higher-lower", "portrait"].includes(q.kind)) {
    return q.options.find((option) => option.correct).label;
  }
  if (q.kind === "order") return q.answer.join(" → ");
  return formatQuestionValue(q, q.answer);
}

export function mountQuiz(container, helpers = {}) {
  const doc = container.ownerDocument;
  const abort = new AbortController();
  let destroyed = false;

  acquireStyles(doc);

  const root = h(doc, "section", { class: "qz-root", "aria-label": "The record quiz" });
  const live = h(doc, "div", { class: "qz-visually-hidden", "aria-live": "polite", role: "status" });
  const stage = h(doc, "div", { class: "qz-stage" });
  root.appendChild(live);
  root.appendChild(stage);
  container.appendChild(root);

  let data = null;
  let active = null;
  const state = {
    round: [], i: 0, points: 0, correct: 0, answered: false,
    streak: 0, maxStreak: 0, deck: "mixed", length: 8, attempts: [], lastSignature: "",
  };

  function announce(text) { live.textContent = text; }

  function clearStage() {
    active = null;
    stage.className = "qz-stage";
    stage.textContent = "";
  }

  function deckLabel(deck) {
    return deck === "money" ? "Money" : deck === "words" ? "Words" : "Mixed";
  }

  function updatePressed(group, value) {
    for (const button of group.querySelectorAll("button")) {
      button.setAttribute("aria-pressed", String(button.dataset.value === String(value)));
    }
  }

  function scrollToQuizTop() {
    const scroller = container.closest("dialog");
    if (scroller) scroller.scrollTop = 0;
  }

  function proofAnchor(link, text) {
    const anchor = h(doc, "a", { href: link.href, text: text || link.label });
    anchor.addEventListener("click", (event) => {
      if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
        container.closest("dialog")?.close();
      }
    });
    return anchor;
  }

  /* ----- screens ----- */

  function renderLoading() {
    clearStage();
    stage.appendChild(h(doc, "p", { class: "qz-edition", text: "The record quiz" }));
    stage.appendChild(h(doc, "p", { class: "qz-loading", text: "Opening the public record…" }));
  }

  function renderError(err) {
    clearStage();
    stage.appendChild(h(doc, "p", { class: "qz-edition", text: "The record quiz" }));
    // A plain sentence and a retry; the cause stays in the console, not on the page.
    if (err) console.warn("quiz:", err);
    stage.appendChild(h(doc, "p", {
      class: "qz-error",
      text: "The record would not open just now.",
    }));
    stage.appendChild(h(doc, "button", {
      class: "ui-button", "data-variant": "primary", type: "button",
      text: "Try again",
      onclick: () => { start(); },
    }));
  }

  function renderIntro() {
    clearStage();
    const speeches = data.corpus && data.corpus.collected_speeches
      ? approxCount(data.corpus.collected_speeches) : "hundreds of thousands of";
    const intro = h(doc, "div", { class: "qz-intro" });
    intro.appendChild(h(doc, "p", { class: "qz-edition", text: "A game from the public record" }));
    intro.appendChild(h(doc, "h2", { class: "qz-title", text: "The record quiz" }));
    intro.appendChild(h(doc, "p", {
      class: "qz-lead",
      text:
        "Choose your ground, then test your sense of " + speeches +
        " parliamentary speeches and documents and 28 years of donation disclosures. " +
        "Every answer is calculated from the record and comes with the page that proves it.",
    }));

    const deckField = h(doc, "fieldset", { class: "qz-fieldset" });
    deckField.appendChild(h(doc, "legend", { class: "qz-legend", text: "Choose a deck" }));
    const deckGroup = h(doc, "div", { class: "qz-decks" });
    const decks = [
      ["money", "Money", "Donors, parties, industries and the disclosed figures behind them."],
      ["words", "Words", "Topics, years and the people whose speeches shape the record."],
      ["mixed", "Mixed", "Money and words in one sitting. The broadest test of the record."],
    ];
    for (const [value, name, note] of decks) {
      deckGroup.appendChild(h(doc, "button", {
        class: "qz-deck", type: "button", "data-value": value,
        "aria-pressed": String(state.deck === value),
        onclick: () => { state.deck = value; updatePressed(deckGroup, value); },
      },
      h(doc, "span", { class: "qz-deck-name", text: name }),
      h(doc, "span", { class: "qz-deck-note", text: note })));
    }
    deckField.appendChild(deckGroup);

    const lengthField = h(doc, "fieldset", { class: "qz-fieldset" });
    lengthField.appendChild(h(doc, "legend", { class: "qz-legend", text: "Set the length" }));
    const lengthGroup = h(doc, "div", { class: "qz-lengths" });
    for (const length of [8, 12]) {
      lengthGroup.appendChild(h(doc, "button", {
        class: "ui-chip qz-length", type: "button", "data-value": String(length),
        "aria-pressed": String(state.length === length), text: length + " questions",
        onclick: () => { state.length = length; updatePressed(lengthGroup, length); },
      }));
    }
    lengthField.appendChild(lengthGroup);
    lengthField.appendChild(h(doc, "button", {
      class: "ui-button qz-wide", "data-variant": "primary", type: "button", text: "Open the record",
      onclick: () => { newRound(); },
    }));

    const setup = h(doc, "div", { class: "qz-setup" }, deckField, lengthField);
    intro.appendChild(setup);
    intro.appendChild(h(doc, "p", {
      class: "qz-fineprint",
      text:
        "No trick questions, no sound and no opinions dressed up as facts. Donation totals are disclosed " +
        "figures, so they remain a floor rather than a complete account of political funding.",
    }));
    stage.appendChild(intro);
    scrollToQuizTop();
  }

  function renderQuestion() {
    clearStage();
    const q = state.round[state.i];
    const total = state.round.length;
    state.answered = false;
    const round = h(doc, "div", { class: "qz-round", "data-kind": q.kind });

    const topbar = h(doc, "div", { class: "qz-topbar" },
      h(doc, "span", { class: "qz-progress-text", text: "Question " + (state.i + 1) + " of " + total }),
      h(doc, "span", { class: "qz-points", text: fmtCount(state.points) + " points" }),
      h(doc, "span", {
        class: "qz-multiplier",
        text: state.streak ? state.streak + " streak · ×" + Math.min(state.streak + 1, 4) : "×1 multiplier",
      }),
    );
    const ticks = h(doc, "div", {
      class: "qz-ticks", "aria-hidden": "true", style: "--qz-total:" + total,
    });
    for (let i = 0; i < total; i++) {
      ticks.appendChild(h(doc, "span", { class: "qz-tick" + (i < state.i ? " is-done" : i === state.i ? " is-current" : "") }));
    }
    const formLabel = h(doc, "p", { class: "qz-form-label", text: FORM_LABELS[q.kind] || "Question" });
    const heading = h(doc, "h3", { class: "qz-question", tabindex: "-1", text: q.prompt });
    const answerArea = h(doc, "div", { class: "qz-answer-area" });
    const feedback = h(doc, "div", { class: "qz-feedback" });

    round.appendChild(topbar);
    round.appendChild(ticks);
    round.appendChild(formLabel);
    round.appendChild(heading);
    round.appendChild(answerArea);
    round.appendChild(feedback);
    stage.appendChild(round);

    if (["mc", "tf", "higher-lower"].includes(q.kind)) renderChoice(q, answerArea);
    else if (q.kind === "portrait") renderPortraits(q, answerArea);
    else if (q.kind === "order") renderOrder(q, answerArea);
    else renderMeasure(q, answerArea);

    heading.focus({ preventScroll: true });
    scrollToQuizTop();
  }

  function addConfirm(answerArea, enabled = false) {
    const confirm = h(doc, "button", {
      class: "ui-button", "data-variant": "primary", type: "button", text: "Confirm answer", disabled: enabled ? null : "",
      onclick: () => { confirmAnswer(); },
    });
    answerArea.appendChild(h(doc, "div", { class: "qz-question-actions" }, confirm));
    return confirm;
  }

  function renderChoice(q, answerArea) {
    let selected = null;
    let hiddenValue = null;
    if (q.kind === "higher-lower" && q.comparison) {
      hiddenValue = h(doc, "span", { class: "qz-figure-value", text: "?" });
      answerArea.appendChild(h(doc, "div", { class: "qz-compare" },
        h(doc, "div", { class: "qz-figure" },
          h(doc, "span", { class: "qz-figure-name", text: q.comparison.shownLabel }),
          h(doc, "span", { class: "qz-figure-value", text: q.comparison.shownDisplay })),
        h(doc, "span", { class: "qz-versus", "aria-hidden": "true", text: "against" }),
        h(doc, "div", { class: "qz-figure qz-figure--unknown" },
          h(doc, "span", { class: "qz-figure-name", text: q.comparison.hiddenLabel }),
          hiddenValue)));
    }
    const optionsWrap = h(doc, "div", { class: "qz-options", role: "group", "aria-label": "Answers" });
    const buttons = q.options.map((option, index) => {
      const button = h(doc, "button", { class: "qz-option", type: "button", "aria-pressed": "false" },
        h(doc, "span", { class: "qz-key", "aria-hidden": "true", text: String(index + 1) }),
        h(doc, "span", { class: "qz-option-label", text: option.label }));
      button.addEventListener("click", () => select(index));
      optionsWrap.appendChild(button);
      return button;
    });
    answerArea.appendChild(optionsWrap);
    answerArea.appendChild(h(doc, "p", { class: "qz-hint", text: "Select with 1–" + q.options.length + ", then press Enter to confirm." }));
    const confirm = addConfirm(answerArea);
    function select(index) {
      if (state.answered) return;
      selected = index;
      buttons.forEach((button, i) => button.setAttribute("aria-pressed", String(i === index)));
      confirm.disabled = false;
    }
    active = {
      selectNumber: select,
      getValue: () => selected,
      confirm,
      reveal(result) {
        if (hiddenValue) hiddenValue.textContent = q.comparison.hiddenDisplay;
        buttons.forEach((button, index) => {
          button.disabled = true;
          const isCorrect = q.options[index].correct;
          button.dataset.state = isCorrect ? "correct" : index === selected ? "wrong" : "dim";
          if (isCorrect || index === selected) {
            button.appendChild(h(doc, "span", { class: "qz-mark", "aria-hidden": "true", text: isCorrect ? "✓" : "×" }));
          }
        });
        confirm.disabled = true;
      },
    };
  }

  function renderPortraits(q, answerArea) {
    let selected = null;
    const wrap = h(doc, "div", { class: "qz-portraits", role: "group", "aria-label": "Answers" });
    const buttons = q.options.map((option, index) => {
      const image = h(doc, "img", { src: option.photo, alt: "", width: "128", height: "128" });
      image.addEventListener("error", () => { image.hidden = true; });
      const button = h(doc, "button", { class: "qz-portrait", type: "button", "aria-pressed": "false" },
        image,
        h(doc, "span", { class: "qz-portrait-name", text: option.label }),
        h(doc, "span", { class: "qz-portrait-key", text: "Press " + (index + 1) }));
      button.addEventListener("click", () => select(index));
      wrap.appendChild(button);
      return button;
    });
    answerArea.appendChild(wrap);
    answerArea.appendChild(h(doc, "p", { class: "qz-hint", text: "Select with 1 or 2, then press Enter to confirm." }));
    const confirm = addConfirm(answerArea);
    function select(index) {
      if (state.answered) return;
      selected = index;
      buttons.forEach((button, i) => button.setAttribute("aria-pressed", String(i === index)));
      confirm.disabled = false;
    }
    active = {
      selectNumber: select, getValue: () => selected, confirm,
      reveal() {
        buttons.forEach((button, index) => {
          button.disabled = true;
          button.dataset.state = q.options[index].correct ? "correct" : index === selected ? "wrong" : "dim";
        });
        confirm.disabled = true;
      },
    };
  }

  function renderOrder(q, answerArea) {
    const chosen = [];
    const wrap = h(doc, "div", { class: "qz-order-list", role: "group", "aria-label": "Tap in order, largest first" });
    const buttons = q.options.map((option, index) => {
      const position = h(doc, "span", { class: "qz-order-position", "aria-hidden": "true", text: "—" });
      const button = h(doc, "button", { class: "qz-option qz-order-option", type: "button", "aria-pressed": "false" },
        position,
        h(doc, "span", { class: "qz-option-label", text: option.label }),
        h(doc, "span", { class: "qz-key", "aria-hidden": "true", text: String(index + 1) }));
      button.addEventListener("click", () => select(index));
      wrap.appendChild(button);
      button._position = position;
      return button;
    });
    answerArea.appendChild(wrap);
    answerArea.appendChild(h(doc, "p", { class: "qz-hint", text: "Tap first, second and third. Tap again to remove; keys 1–3 also work." }));
    const confirm = addConfirm(answerArea);
    function paint() {
      buttons.forEach((button, index) => {
        const at = chosen.indexOf(index);
        button.setAttribute("aria-pressed", String(at >= 0));
        button._position.textContent = at >= 0 ? String(at + 1) : "—";
      });
      confirm.disabled = chosen.length !== q.options.length;
    }
    function select(index) {
      if (state.answered) return;
      const at = chosen.indexOf(index);
      if (at >= 0) chosen.splice(at, 1);
      else if (chosen.length < q.options.length) chosen.push(index);
      paint();
    }
    active = {
      selectNumber: select,
      getValue: () => chosen.map((index) => q.options[index].label),
      confirm,
      reveal() {
        const selection = chosen.map((index) => q.options[index].label);
        buttons.forEach((button, index) => {
          button.disabled = true;
          const label = q.options[index].label;
          const chosenAt = selection.indexOf(label);
          const correctAt = q.answer.indexOf(label);
          button._position.textContent = String(correctAt + 1);
          button.dataset.state = chosenAt === correctAt ? "correct" : "wrong";
        });
        confirm.disabled = true;
      },
    };
  }

  function renderMeasure(q, answerArea) {
    const isYear = q.kind === "year";
    const output = h(doc, "output", { class: "qz-measure-output" });
    const input = h(doc, "input", {
      class: "qz-range", type: "range", "aria-label": isYear ? "Choose a year" : "Guess the figure",
      min: isYear ? String(q.min) : "0", max: isYear ? String(q.max) : "1000",
      step: isYear ? "1" : "10", value: isYear ? String(Math.round((q.min + q.max) / 2)) : "500",
    });
    const measure = h(doc, "div", { class: "qz-measure" },
      output,
      h(doc, "div", { class: "qz-range-wrap" }, input),
      h(doc, "div", { class: "qz-scale" },
        h(doc, "span", { text: formatQuestionValue(q, q.min) }),
        h(doc, "span", { text: formatQuestionValue(q, q.max) })));
    answerArea.appendChild(measure);
    answerArea.appendChild(h(doc, "p", {
      class: "qz-hint",
      text: isYear ? "Use the ruler or arrow keys. Exact year takes the full points." :
        "The scale is logarithmic. Arrow keys make fine adjustments; close guesses still score.",
    }));
    const confirm = addConfirm(answerArea, true);
    const getValue = () => isYear ? Number(input.value) : sliderValue(q, Number(input.value));
    function paint() {
      const value = getValue();
      output.value = formatQuestionValue(q, value);
      output.textContent = output.value;
      input.setAttribute("aria-valuetext", output.value);
    }
    input.addEventListener("input", paint);
    paint();
    active = {
      selectNumber: null, getValue, confirm,
      reveal() {
        const guess = getValue();
        input.disabled = true;
        confirm.disabled = true;
        const landing = h(doc, "div", { class: "qz-landing", "aria-label": "Your guess and the answer" });
        const guessPos = Math.max(0, Math.min(100, sliderPosition(q, guess)));
        const answerPos = Math.max(0, Math.min(100, sliderPosition(q, q.answer)));
        const edgeClass = (position) => position < 18 ? " is-edge-start" : position > 82 ? " is-edge-end" : "";
        landing.appendChild(h(doc, "div", {
          class: "qz-landing-mark qz-landing-mark--answer" + edgeClass(answerPos), style: "left:" + answerPos + "%",
        }, h(doc, "span", { text: "Answer " + formatQuestionValue(q, q.answer) })));
        landing.appendChild(h(doc, "div", {
          class: "qz-landing-mark qz-landing-mark--guess" + edgeClass(guessPos), style: "left:" + guessPos + "%",
        }, h(doc, "span", { text: "You " + formatQuestionValue(q, guess) })));
        measure.appendChild(landing);
      },
    };
  }

  function grade(q, value) {
    if (["mc", "tf", "higher-lower", "portrait"].includes(q.kind)) {
      const correct = value != null && q.options[value] && q.options[value].correct;
      return { correct: !!correct, base: correct ? 100 : 0, detail: correct ? "Correct." : "Not this time." };
    }
    if (q.kind === "order") {
      const correct = value.length === q.answer.length && value.every((label, index) => label === q.answer[index]);
      return { correct, base: correct ? 100 : 0, detail: correct ? "Correct order." : "Not quite in order." };
    }
    if (q.kind === "year") {
      const distance = Math.abs(Math.round(value) - q.answer);
      const base = distance === 0 ? 100 : distance === 1 ? 50 : distance === 2 ? 25 : 0;
      return {
        correct: distance === 0, base,
        detail: distance === 0 ? "Right on the year." : "Off by " + distance + (distance === 1 ? " year." : " years."),
      };
    }
    const error = Math.abs(value - q.answer) / q.answer;
    const pct = Math.round(error * 100);
    const base = error <= 0.1 ? 100 : error <= 0.25 ? 75 : error <= 0.5 ? 40 : 10;
    return {
      correct: error <= 0.25, base,
      detail: pct === 0 ? "Exactly right." : pct + "% away" + (error <= 0.25 ? " — close enough." : "."),
    };
  }

  function confirmAnswer() {
    if (state.answered || destroyed) return;
    if (!active || active.confirm.disabled) return;
    state.answered = true;
    const q = state.round[state.i];
    const value = active.getValue();
    const result = grade(q, value);
    const multiplier = result.correct ? Math.min(state.streak + 1, 4) : 1;
    const gained = result.base * multiplier;
    state.points += gained;
    if (result.correct) {
      state.correct++;
      state.streak++;
      state.maxStreak = Math.max(state.maxStreak, state.streak);
    } else state.streak = 0;
    active.reveal(result);
    stage.classList.add(result.correct ? "is-correct" : "is-wrong");

    const pointsEl = stage.querySelector(".qz-points");
    if (pointsEl) pointsEl.textContent = fmtCount(state.points) + " points";
    const multiplierEl = stage.querySelector(".qz-multiplier");
    if (multiplierEl) {
      multiplierEl.textContent = state.streak
        ? state.streak + " streak · ×" + Math.min(state.streak + 1, 4)
        : "streak reset · ×1";
    }

    const answerText = correctAnswerText(q);
    state.attempts.push({
      prompt: q.prompt, answer: answerText, correct: result.correct, points: gained,
      fact: q.fact, source: q.source, link: q.link,
    });

    const verdict = h(doc, "p", { class: "qz-verdict", text: result.detail + " +" + gained + " points" });

    const provenance = h(doc, "p", { class: "qz-provenance" }, "Source: " + q.source + ". ");
    provenance.appendChild(proofAnchor(q.link));

    const isLast = state.i + 1 >= state.round.length;
    const nextBtn = h(doc, "button", {
      class: "ui-button", "data-variant": "primary", type: "button",
      text: isLast ? "See your result" : "Next question",
      onclick: () => { if (isLast) renderResult(); else { state.i++; renderQuestion(); } },
    });

    const panel = h(doc, "div", { class: "qz-panel" },
      verdict,
      h(doc, "p", { class: "qz-fact", text: q.fact }),
      h(doc, "p", { class: "qz-explain", text: q.explanation }),
      provenance,
    );
    const feedback = stage.querySelector(".qz-feedback");
    feedback.appendChild(panel);
    feedback.appendChild(nextBtn);

    announce(result.detail + " The answer is " + answerText + ". " + q.explanation);
    nextBtn.focus();
  }

  function renderResult() {
    clearStage();
    const total = state.round.length;
    const rank = rankFor(state.correct, total);
    const result = h(doc, "div", { class: "qz-result", tabindex: "-1" });
    const scoreBlock = h(doc, "div", {},
      h(doc, "p", { class: "qz-result-label", text: deckLabel(state.deck) + " · " + state.correct + " of " + total + " right" }),
      h(doc, "p", { class: "qz-result-score", text: fmtCount(state.points) }));
    const rankBlock = h(doc, "div", {},
      h(doc, "p", { class: "qz-result-rank", text: rank.name }),
      h(doc, "p", { class: "qz-result-blurb", text: rank.blurb }),
      h(doc, "p", { class: "qz-result-meta" },
        h(doc, "span", { text: "Best streak " + state.maxStreak }),
        h(doc, "span", { text: "Final score " + fmtCount(state.points) + " points" })));
    result.appendChild(h(doc, "div", { class: "qz-result-head" }, scoreBlock, rankBlock));
    result.appendChild(h(doc, "h3", { class: "qz-recap-title", text: "The answers on the record" }));
    const recap = h(doc, "ol", {
      class: "qz-recap", style: "--qz-recap-rows:" + Math.ceil(state.attempts.length / 2),
    });
    state.attempts.forEach((attempt, index) => {
      recap.appendChild(h(doc, "li", { class: "qz-recap-item" },
        h(doc, "span", { class: "qz-recap-no", text: String(index + 1) }),
        h(doc, "div", {},
          h(doc, "p", { class: "qz-recap-question", text: attempt.prompt }),
          h(doc, "p", { class: "qz-recap-answer" },
            proofAnchor(attempt.link, attempt.answer))),
        h(doc, "span", {
          class: "qz-recap-mark" + (attempt.correct ? "" : " is-wrong"),
          text: attempt.correct ? "+" + attempt.points : attempt.points ? "+" + attempt.points : "—",
        })));
    });
    result.appendChild(recap);

    const again = h(doc, "button", {
      class: "ui-button", "data-variant": "primary", type: "button", text: "Play again",
      onclick: () => { newRound(); },
    });
    const copy = h(doc, "button", { class: "ui-button", type: "button", text: "Copy your result" });
    const change = h(doc, "button", {
      class: "ui-button", type: "button", text: "Change deck", onclick: renderIntro,
    });
    const copyStatus = h(doc, "p", { class: "qz-copy-status", role: "status" });
    copy.addEventListener("click", async () => {
      const text = resultText(rank);
      try {
        await doc.defaultView.navigator.clipboard.writeText(text);
      } catch {
        const area = h(doc, "textarea", { class: "qz-visually-hidden" });
        area.value = text;
        doc.body.appendChild(area);
        area.select();
        doc.execCommand("copy");
        area.remove();
      }
      copyStatus.textContent = "Result copied.";
      announce("Result copied to the clipboard.");
    });
    result.appendChild(h(doc, "div", { class: "qz-actions" },
      again,
      copy,
      change,
    ));
    result.appendChild(copyStatus);
    stage.appendChild(result);

    announce("You scored " + state.points + " points, with " + state.correct + " out of " + total + " right. Your rank: " + rank.name + ".");
    result.focus({ preventScroll: true });
    scrollToQuizTop();
  }

  function resultText(rank) {
    const answers = state.attempts.map((attempt, index) =>
      (index + 1) + ". " + attempt.prompt + " — " + attempt.answer).join("\n");
    return "The record quiz — " + deckLabel(state.deck) + "\n" +
      fmtCount(state.points) + " points · " + state.correct + "/" + state.round.length +
      " right · best streak " + state.maxStreak + "\n" + rank.name + ": " + rank.blurb +
      "\n\n" + answers;
  }

  function newRound(seed) {
    let round = [];
    let signature = "";
    for (let attempt = 0; attempt < 16; attempt++) {
      const roundSeed = seed == null ? freshSeed() : (seed + attempt) >>> 0;
      round = buildRound(data, createRng(roundSeed), state.length, state.deck);
      signature = round.map((q) => q.prompt).join("\u241f");
      if (signature !== state.lastSignature) break;
    }
    state.lastSignature = signature;
    state.round = round;
    state.i = 0;
    state.points = 0;
    state.correct = 0;
    state.streak = 0;
    state.maxStreak = 0;
    state.attempts = [];
    if (!state.round.length) {
      renderError(new Error("no questions could be built from the data"));
      return;
    }
    renderQuestion();
  }

  /* Number keys select; Enter confirms. Arrow keys remain native on ranges. */
  root.addEventListener("keydown", (e) => {
    if (state.answered || !state.round.length || destroyed || !active) return;
    if (e.key === "Enter" && !active.confirm.disabled) {
      e.preventDefault();
      confirmAnswer();
      return;
    }
    const n = parseInt(e.key, 10);
    if (!n || !active.selectNumber) return;
    const q = state.round[state.i];
    if (n >= 1 && n <= (q.options || []).length) {
      e.preventDefault();
      active.selectNumber(n - 1);
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
    startRound({ deck = state.deck, count = state.length, seed } = {}) {
      if (!data || destroyed) return false;
      state.deck = deck;
      state.length = count === 12 ? 12 : 8;
      newRound(seed);
      return true;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      abort.abort();
      root.remove();
      releaseStyles(doc);
    },
  };
}

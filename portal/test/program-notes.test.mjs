import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const notes = JSON.parse(readFileSync(join(here, "../public/grants/program-notes.json"), "utf8"));
// PROGRAM_NOTES_INDEX lets the check run against an index built elsewhere
// (for example a wider export in another worktree) before it lands here.
const indexPath = process.env.PROGRAM_NOTES_INDEX || join(here, "../public/graph/grants.federal.json");
const index = JSON.parse(readFileSync(indexPath, "utf8"));

const SELECTION_KEYS = [
  "Closed Non-Competitive",
  "Open Competitive",
  "Targeted or Restricted Competitive",
  "Demand Driven",
  "Open Non-competitive",
  "One-off or ad hoc",
];
const isHttp = (u) => typeof u === "string" && /^https?:\/\/\S+$/.test(u);

function walkStrings(value, path, visit) {
  if (typeof value === "string") visit(value, path);
  else if (Array.isArray(value)) value.forEach((v, i) => walkStrings(v, `${path}[${i}]`, visit));
  else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) walkStrings(v, `${path}.${k}`, visit);
}

test("generated stamp is an ISO date", () => {
  assert.ok(!Number.isNaN(Date.parse(notes.generated)), "generated must parse as a date");
});

test("the six selection-process entries exist with short, long and source", () => {
  for (const key of SELECTION_KEYS) {
    const entry = notes.selection[key];
    assert.ok(entry, `missing selection entry ${key}`);
    assert.ok(entry.short && entry.short.length > 20, `${key}.short is too short`);
    assert.ok(entry.long && entry.long.length > entry.short.length, `${key}.long should be longer than short`);
    assert.ok(isHttp(entry.source), `${key}.source must be an http(s) url`);
  }
  assert.deepEqual(Object.keys(notes.selection).sort(), [...SELECTION_KEYS].sort(), "no extra or missing selection keys");
});

test("rules are 5-7 items each with title, text and an http(s) source", () => {
  assert.ok(Array.isArray(notes.rules), "rules must be an array");
  assert.ok(notes.rules.length >= 5 && notes.rules.length <= 7, `expected 5-7 rules, got ${notes.rules.length}`);
  for (const rule of notes.rules) {
    assert.ok(rule.title && rule.text, "rule needs title and text");
    assert.ok(isHttp(rule.source), `rule "${rule.title}" needs an http(s) source`);
  }
});

test("every federal program id exists in grants.federal.json programs[]", () => {
  const ids = new Set(index.programs.map((p) => p.id));
  const federal = notes.programs.federal;
  assert.ok(Object.keys(federal).length > 0, "no federal program notes");
  for (const id of Object.keys(federal)) assert.ok(ids.has(id), `program id ${id} is not in the federal index`);
});

test("every program note has name, summary, hansard and well-formed audits", () => {
  for (const [jur, programs] of Object.entries(notes.programs)) {
    for (const [id, note] of Object.entries(programs)) {
      const where = `${jur}/${id}`;
      assert.ok(note.name, `${where} needs a name`);
      assert.ok(note.summary && note.summary.length > 80, `${where} needs a summary`);
      assert.ok(note.hansard && note.hansard.length > 3, `${where} needs a hansard phrase`);
      assert.ok(Array.isArray(note.audits), `${where}.audits must be an array`);
      for (const audit of note.audits) {
        assert.ok(audit.title, `${where} audit needs a title`);
        assert.ok(Number.isInteger(audit.year) && audit.year >= 2000 && audit.year <= 2100, `${where} audit year out of range`);
        assert.ok(audit.finding && audit.finding.length > 40, `${where} audit needs a finding`);
        assert.ok(isHttp(audit.url), `${where} audit "${audit.title}" needs an http(s) url`);
        assert.ok(/^https:\/\/www\.anao\.gov\.au\//.test(audit.url), `${where} audit url should be on anao.gov.au`);
      }
    }
  }
});

test("no string contains an em dash, en dash, curly quote or non-ASCII character", () => {
  const bad = [];
  walkStrings(notes, "$", (s, path) => {
    if (/[–—‘’“”]/.test(s) || /[^\x00-\x7F]/.test(s)) bad.push(path);
  });
  assert.deepEqual(bad, [], `strings with forbidden characters: ${bad.join(", ")}`);
});

test("no markdown inside strings", () => {
  const bad = [];
  walkStrings(notes, "$", (s, path) => {
    if (/\*\*|^#|\]\(|^- /m.test(s)) bad.push(path);
  });
  assert.deepEqual(bad, [], `strings that look like markdown: ${bad.join(", ")}`);
});

test("an invitation list and attributed research are well formed, and GO7867's match its data file", () => {
  for (const [jur, programs] of Object.entries(notes.programs)) {
    for (const [id, note] of Object.entries(programs)) {
      const where = `${jur}/${id}`;
      if (note.invitations) {
        assert.match(note.invitations.data, /^\/research\/[a-z0-9-]+\.json$/, `${where} invitations.data is a site data file`);
        assert.ok(note.invitations.source && note.invitations.source.length > 20, `${where} invitations need a named source`);
        assert.ok(isHttp(note.invitations.url), `${where} invitations need an http(s) source url`);
      }
      for (const r of note.research || []) {
        assert.ok(r.publisher && r.title, `${where} research needs a publisher and title`);
        assert.ok(isHttp(r.url), `${where} research "${r.title}" needs an http(s) url`);
        assert.ok(Number.isInteger(r.year), `${where} research needs a year`);
        assert.ok(r.finding && r.finding.length > 40, `${where} research needs a finding`);
        // Report the figures; characterising them is the publisher's job, not OPAX's.
        assert.doesNotMatch(JSON.stringify(r), /rort|pork|bias|scandal|favou?rit|slush|corrupt/i, `${where} research wording`);
        for (const row of r.compare?.rows || []) assert.ok(row.label && Number.isFinite(row.value) && Number.isFinite(row.baseline), `${where} comparison row`);
      }
    }
  }
  const mlci = JSON.parse(readFileSync(join(here, "../public/research/mlci.json"), "utf8"));
  const note = notes.programs.federal.GO7867;
  assert.equal(note.invitations.data, "/research/mlci.json");
  assert.equal(note.invitations.url, mlci.sources.department);
  const [cpi] = note.research;
  assert.equal(cpi.url, mlci.sources.cpi);
  assert.equal(cpi.publisher, mlci.comparison_provenance.publisher);
  assert.match(cpi.note, /AEC's classification before the 2025 federal election/);
  assert.deepEqual(cpi.compare.rows, mlci.cpi_comparison.map((r) => ({ label: r.name, value: r.actual, baseline: r.expected })), "the six rows exactly as published");
});

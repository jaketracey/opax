// The bills projection against docs/BILLS-CONTRACT.md. The UI builds against
// these files, so a shape change should fail here before it reaches a page.
//   node portal/test/bills.test.mjs                 # the committed fixture
//   node portal/test/bills.test.mjs /tmp/bills      # a run before you commit it
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const billsDir = process.argv[2]
  ? resolve(process.argv[2])
  : join(here, "..", "public", "bills");
assert.ok(existsSync(billsDir), `${billsDir} exists`);

const INDEX_KEYS = [
  "key", "title", "short_title", "jurisdiction", "parliament", "introduced",
  "originating_house", "status", "status_as_of", "sponsor", "sponsor_party", "sponsor_person_id",
  "portfolio", "has_summary", "summary_version", "divisions", "speeches", "acts",
];
const BILL_KEYS = [
  "key", "title", "short_title", "aliases", "jurisdiction", "parliament",
  "introduced", "originating_house", "sponsor", "sponsor_party",
  "sponsor_person_id", "portfolio", "status", "status_as_of", "key_dates",
  "sources", "summary", "divisions", "speeches", "acts",
];
const DIVISION_KEYS = [
  "key", "date", "house", "question", "stage", "ayes", "noes", "outcome",
  "party_splits", "party_coverage", "paired", "url",
];
const SPEECH_KEYS = ["slug", "speaker", "party", "state", "date", "stage_hint", "brief"];
const COVERAGE_BUCKETS = new Set(["dated", "earliest", "member", "unknown"]);
const ISO = /^\d{4}-\d{2}-\d{2}$/;

const index = JSON.parse(readFileSync(join(billsDir, "index.json"), "utf8"));
assert.equal(typeof index.generated_at, "string", "index has generated_at");
assert.equal(index.count, index.bills.length, "index count matches the array");
assert.ok(index.meta.party_basis, "index states its party basis");

// Optional so files exported before each change still match; written on every
// export after it. The lifecycle fields came with "Expose recorded bill
// lifecycles to Ask and MCP"; `sponsors` and `sponsor_count` with bills-006
// (every sponsor, not only the first).
const LIFECYCLE_KEYS = ["passed_both_houses", "passed_both_houses_date", "royal_assent", "act_number"];
// `ended` and `ended_label` (how a dead bill ended) are written only for bills that did not pass.
const ENDED_KEYS = ["ended", "ended_label"];
const OPTIONAL_INDEX_KEYS = [...LIFECYCLE_KEYS, "sponsor_count", ...ENDED_KEYS];
const OPTIONAL_BILL_KEYS = [...LIFECYCLE_KEYS, "sponsors", ...ENDED_KEYS];
const STATUSES = new Set(["before_parliament", "passed", "lapsed", "negatived", "exposure_draft"]);
const optional = (obj, keys) => keys.filter((k) => Object.hasOwn(obj, k));

for (const row of index.bills) {
  assert.deepEqual(Object.keys(row).sort(), [...INDEX_KEYS, ...optional(row, OPTIONAL_INDEX_KEYS)].sort(), `index row ${row.key} keys`);
  assert.equal(typeof row.has_summary, "boolean", `${row.key} has_summary is a boolean`);
  assert.equal(Object.hasOwn(row, "ended"), Object.hasOwn(row, "ended_label"), `${row.key} ended and ended_label come together`);
  if (Object.hasOwn(row, "ended")) {
    assert.ok(!["passed", "before_parliament", "exposure_draft"].includes(row.status), `${row.key} only a dead bill has an ending`);
    assert.ok(typeof row.ended_label === "string" && row.ended_label.length > 0, `${row.key} ended_label is worded`);
  }
}
const sorted = [...index.bills].every(
  (r, i, a) => i === 0 || (a[i - 1].introduced ?? "") >= (r.introduced ?? ""),
);
assert.ok(sorted, "index is sorted by introduced date, newest first");
assert.equal(new Set(index.bills.map((b) => b.key)).size, index.bills.length, "keys are unique");

const files = readdirSync(billsDir).filter((f) => f.endsWith(".json") && f !== "index.json");
assert.ok(files.length > 0, "at least one bill file");
const indexByKey = new Map(index.bills.map((b) => [b.key, b]));

for (const file of files) {
  const doc = JSON.parse(readFileSync(join(billsDir, file), "utf8"));
  const where = doc.key;
  assert.equal(`${doc.key}.json`, file, `${file} is named for its key`);
  // Exposure drafts (docs/BILLS-CONTRACT.md) carry three keys a registry bill never has.
  const DRAFT_ONLY = doc.status === "exposure_draft" ? ["consultation", "related", "became"] : [];
  assert.deepEqual(Object.keys(doc).sort(), [...BILL_KEYS, ...DRAFT_ONLY, ...optional(doc, OPTIONAL_BILL_KEYS)].sort(), `${where} keys`);
  assert.ok(STATUSES.has(doc.status), `${where} status ${doc.status} is in the contract's vocabulary`);
  if (doc.sponsors) {
    assert.ok(Array.isArray(doc.sponsors), `${where} sponsors is a list`);
    for (const s of doc.sponsors) {
      assert.deepEqual(Object.keys(s).sort(), ["name", "party", "person_id"], `${where} sponsor keys`);
      assert.ok(typeof s.name === "string" && s.name.trim(), `${where} sponsor name is nonempty text`);
    }
    if (doc.sponsors.length) assert.equal(doc.sponsors[0].party, doc.sponsor_party, `${where} first sponsor's party is sponsor_party`);
    const listed = indexByKey.get(doc.key);
    if (listed && Object.hasOwn(listed, "sponsor_count")) assert.equal(listed.sponsor_count, doc.sponsors.length, `${where} sponsor count agrees with the index`);
    // bills-012: an export that writes sponsors also writes only real chambers.
    for (const d of doc.key_dates) {
      assert.ok(d.house === null || d.house === "representatives" || d.house === "senate", `${where} key_dates house ${d.house} is a chamber or null`);
    }
  }

  const row = indexByKey.get(doc.key);
  assert.ok(row, `${where} is listed in index.json`);
  assert.equal(row.sponsor_person_id, doc.sponsor_person_id, `${where} sponsor identity agrees with the index`);
  assert.equal(row.divisions, doc.divisions.length, `${where} division count agrees with the index`);
  assert.equal(row.speeches, doc.speeches.length, `${where} speech count agrees with the index`);
  assert.equal(row.acts, doc.acts.length, `${where} act count agrees with the index`);
  assert.equal(row.has_summary, doc.summary !== null, `${where} has_summary agrees with the index`);
  assert.ok(doc.introduced === null || ISO.test(doc.introduced), `${where} introduced is ISO or null`);

  for (const d of doc.divisions) {
    const optionalKeys = Object.hasOwn(d, "title") ? ["title"] : [];
    assert.deepEqual(Object.keys(d).sort(), [...DIVISION_KEYS, ...optionalKeys].sort(), `${where} division ${d.key} keys`);
    if (optionalKeys.length) assert.ok(typeof d.title === "string" && d.title.trim(), `${where} division ${d.key} title is nonempty text`);
    assert.ok(ISO.test(d.date), `${where} division ${d.key} date is ISO`);
    for (const [party, split] of Object.entries(d.party_splits)) {
      assert.ok(party.length > 0, `${where} division ${d.key} party label is not empty`);
      assert.deepEqual(Object.keys(split).sort(), ["ayes", "noes"], `${where} ${d.key} ${party} split keys`);
    }
    for (const bucket of Object.keys(d.party_coverage)) {
      assert.ok(COVERAGE_BUCKETS.has(bucket), `${where} division ${d.key} coverage bucket ${bucket}`);
    }
    // A split counts one voter once, and pairs belong to neither side.
    const counted = Object.values(d.party_splits).reduce((n, s) => n + s.ayes + s.noes, 0);
    const covered = Object.values(d.party_coverage).reduce((n, v) => n + v, 0);
    assert.equal(counted, covered, `${where} division ${d.key}: every counted vote has a coverage bucket`);
  }

  for (const s of doc.speeches) {
    assert.deepEqual(Object.keys(s).sort(), [...SPEECH_KEYS].sort(), `${where} speech ${s.slug} keys`);
    assert.ok(/^speech-\d+$/.test(s.slug), `${where} speech slug ${s.slug} is a knowledge-box slug`);
  }
  assert.ok(doc.speeches.length <= 24, `${where} is inside the 24-speech cap`);

  if (doc.summary) {
    assert.equal(doc.summary.sentences.length, 3, `${where} summary has three sentences`);
    assert.ok(doc.summary.changes.length >= 3 && doc.summary.changes.length <= 6,
      `${where} summary has three to six changes`);
    assert.ok(/not the record$/.test(doc.summary.attribution),
      `${where} summary carries the contract's attribution line`);
  }
}

console.log(`bills: index of ${index.count}, ${files.length} files, shapes match the contract`);

import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const root = new URL("../public/", import.meta.url);
const corpus = JSON.parse(fs.readFileSync(new URL("corpus.json", root), "utf8"));
const app = fs.readFileSync(new URL("app.js", root), "utf8");
const html = fs.readFileSync(new URL("index.html", root), "utf8");
const worker = fs.readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");

test("corpus manifest includes the cleaned PM transcript tranche", () => {
  const source = corpus.sources.find((item) => item.name.startsWith("Prime Minister transcripts"));
  assert.deepEqual(source, {
    name: "Prime Minister transcripts and releases (PM&C)",
    docs: 613,
    coverage: "2025–2026",
  });
  assert.equal(corpus.version, "2026-09-08");
  assert.equal(corpus.expected_resources, 617090);
  assert.equal(
    Object.values(corpus.expected_resources_breakdown).reduce((sum, value) => sum + value, 0),
    corpus.expected_resources,
  );
  assert.deepEqual(corpus.sources.find((item) => item.name.startsWith("NSW Government")), {
    name: "NSW Government ministerial releases",
    docs: 5144,
    coverage: "2024–2026",
  });
});

test("live corpus table names the new resource kind", () => {
  assert.match(app, /\["press_release", "Government transcripts and releases"\]/);
});

test("government releases are searchable and have public document pages", () => {
  assert.match(html, /<option value="press_release">Government transcripts and releases<\/option>/);
  assert.match(worker, /PRESS_SLUG_RE/);
  assert.match(worker, /const KINDS = new Set\(\[[^\]]*'press_release'/);
  assert.match(worker, /kind: label\(resource, 'kind'\)/);
  assert.match(worker, /r\.labels\.kind === 'press_release'/);
});

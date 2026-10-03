// The bill page's "How it moved" ruler, run from app.js itself.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
const pick = (re, name) => {
  const found = re.exec(app)?.[0];
  assert.ok(found, `app.js still carries ${name}`);
  return found;
};
const source = [
  pick(/\nfunction esc\(s\) \{[\s\S]*?\n\}\n/, "esc()"),
  pick(/\nconst MONTHS = .*\n/, "MONTHS"),
  pick(/\nfunction fmtDate\(value\) \{[\s\S]*?\n\}\n/, "fmtDate()"),
  pick(/\nfunction billRulerHTML\(dates\) \{[\s\S]*?\n\}\n/, "billRulerHTML()"),
].join("");
const billRulerHTML = new Function(`${source}; return billRulerHTML`)();
const labels = (svg) => [...svg.matchAll(/<text[^>]*text-anchor="(\w+)"[^>]*>([^<]*)<\/text>/g)]
  .map(([, anchor, text]) => ({ anchor, text }));
const ariaLabel = (svg) => /aria-label="([^"]*)"/.exec(svg)?.[1];

test("a bill that moved over months names both ends of the ruler", () => {
  const svg = billRulerHTML([
    { date: "2026-02-12" }, { date: "2026-06-25" }, { date: "2026-09-18" },
  ]);
  assert.deepEqual(labels(svg), [
    { anchor: "start", text: "12 Feb 2026" },
    { anchor: "end", text: "18 Sep 2026" },
  ]);
  assert.equal(ariaLabel(svg), "The recorded stages of this bill, from 12 Feb 2026 to 18 Sep 2026");
  assert.equal(svg.match(/bill-ruler-tick/g).length, 3);
});

test("a bill whose every stage fell on one day gets one date, not two on top of each other", () => {
  const svg = billRulerHTML([{ date: "2026-09-17" }, { date: "2026-09-17T00:00:00Z" }]);
  // Before: a second, end-anchored label at the same left edge ran off the
  // ruler and printed its last digit over the first (":617 Sep 2026").
  assert.deepEqual(labels(svg), [{ anchor: "start", text: "17 Sep 2026" }]);
  assert.equal(ariaLabel(svg), "The recorded stages of this bill, all on 17 Sep 2026");
  assert.equal(svg.match(/bill-ruler-tick/g).length, 2, "every recorded date is still a tick");
});

test("fewer than two dated stages draw no ruler", () => {
  assert.equal(billRulerHTML([{ date: "2026-09-17" }]), "");
  assert.equal(billRulerHTML([{ date: "2026-09-17" }, { date: "not a date" }]), "");
});

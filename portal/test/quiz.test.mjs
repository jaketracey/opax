import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  TEMPLATES,
  buildRound,
  createRng,
  makeQuizContext,
  validateQuestion,
} from "../public/quiz.js";

const here = dirname(fileURLToPath(import.meta.url));
const publicDir = join(here, "..", "public");
const json = (path) => JSON.parse(readFileSync(join(publicDir, path), "utf8"));

const reports = {};
for (const file of readdirSync(join(publicDir, "reports"))) {
  if (file === "index.json" || !file.endsWith(".json")) continue;
  reports[file.slice(0, -5)] = json("reports/" + file);
}

const years = {};
for (const file of readdirSync(join(publicDir, "years"))) {
  if (file === "index.json" || !/^\d{4}\.json$/.test(file)) continue;
  years[file.slice(0, -5)] = json("years/" + file);
}

const data = {
  money: json("graph/money.json"),
  reports,
  corpus: json("corpus.json"),
  parliamentarians: json("parliamentarians.json"),
  years,
};
const ctx = makeQuizContext(data);

const built = new Map();
for (const template of TEMPLATES) {
  for (let seed = 1; seed <= 2000 && !built.has(template.id); seed++) {
    const question = template.build(ctx, createRng(seed));
    if (question && validateQuestion(question)) built.set(template.id, question);
  }
  assert.ok(built.has(template.id), template.id + " must build from the shipped JSON");
}

for (const [id, question] of built) {
  assert.equal(question.template, id);
  assert.ok(question.fact.length > 0, id + " has a reveal figure or fact");
  assert.ok(question.explanation.length > 0, id + " has a why line");
  assert.ok(question.source.length > 0, id + " cites provenance");
  assert.ok(question.link.href.startsWith("/"), id + " has an internal proof link");
  if (question.kind === "portrait") {
    for (const option of question.options) {
      assert.ok(existsSync(join(publicDir, option.photo)), id + " portrait exists: " + option.photo);
    }
  }
}

for (const deck of ["money", "words", "mixed"]) {
  for (const count of [8, 12]) {
    for (const seed of [7, 101, 2909]) {
      const round = buildRound(data, createRng(seed), count, deck);
      assert.equal(round.length, count, deck + " deck builds " + count + " questions at seed " + seed);
      assert.equal(new Set(round.map((q) => q.prompt)).size, count, "round prompts are unique");
      assert.ok(round.every(validateQuestion), "every " + deck + " question validates");
      if (deck !== "mixed") assert.ok(round.every((q) => q.deck === deck), deck + " deck does not leak");
    }
  }
}

const kinds = new Set([...built.values()].map((q) => q.kind));
for (const kind of ["mc", "tf", "higher-lower", "order", "slider", "year", "portrait"]) {
  assert.ok(kinds.has(kind), "template set includes " + kind);
}

console.log("quiz templates: " + built.size + " validated; rounds: money, words and mixed at 8 and 12");

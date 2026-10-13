import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// The directory renderer catches errors and shows "The directory could not be
// loaded", so an undeclared money file in a builder fails silently in production
// (/subject/party, 10-12 Oct 2026). Every file a builder lists must be loaded.
const app = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");

function builders() {
  const out = [];
  const re = /async function (build\w+Directory)\(\) \{/g;
  let m;
  while ((m = re.exec(app))) {
    const start = m.index;
    const next = app.indexOf("\nasync function ", start + 1);
    out.push({ name: m[1], body: app.slice(start, next === -1 ? undefined : next) });
  }
  return out;
}

test("every money file a directory builder lists is loaded", () => {
  const found = builders();
  assert.ok(found.some((b) => b.name === "buildPartiesDirectory"), "parties builder present");
  for (const { name, body } of found) {
    const files = body.match(/const files = \[((?:\[\s*"\w+",\s*\w+\s*\],?\s*)+)\]/);
    if (!files) continue;
    const used = [...files[1].matchAll(/\[\s*"(\w+)",\s*(\w+)\s*\]/g)].map((x) => x[2]);
    const destructured = body.match(/const \[([^\]]+)\] = await Promise\.all\(/);
    assert.ok(destructured, `${name}: loads its files with Promise.all`);
    const declared = new Set(destructured[1].split(",").map((s) => s.trim()));
    for (const id of used) assert.ok(declared.has(id), `${name}: "${id}" is listed in files but never loaded`);
  }
});

test("the parties directory offers every jurisdiction it shows", () => {
  const body = builders().find((b) => b.name === "buildPartiesDirectory").body;
  for (const jur of ["federal", "qld", "vic", "tas"]) {
    assert.match(body, new RegExp(`loadMoneyFile\\("${jur}"\\)`), `loads ${jur}`);
    assert.match(body, new RegExp(`\\["${jur}", "[^"]+"\\]`), `filter option for ${jur}`);
  }
});

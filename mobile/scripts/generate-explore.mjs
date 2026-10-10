// Regenerate from checked-in public exports only. Never fetch the live Worker.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { isOrganisationDonor } from '../src/privacy/donorEntity.ts';
const mobile = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const publicRoot = resolve(mobile, '../portal/public');
const output = resolve(mobile, 'src/features/explore');
mkdirSync(output, { recursive: true });
const hashes = {};
const read = (path) => {
  const bytes = readFileSync(resolve(publicRoot, path));
  hashes[path] = createHash('sha256').update(bytes).digest('hex');
  return JSON.parse(bytes);
};
const source = readFileSync(resolve(publicRoot, 'quiz.js'), 'utf8');
hashes['quiz.js'] = createHash('sha256').update(source).digest('hex');
const engine = await import(
  'data:text/javascript;base64,' +
    Buffer.from(
      source.slice(0, source.indexOf('async function fetchJson')),
    ).toString('base64')
);
const data = {
  money: read('graph/money.json'),
  corpus: read('corpus.json'),
  parliamentarians: read('parliamentarians.json'),
  reports: {},
  years: {},
};
for (const row of read('reports/index.json').reports)
  data.reports[row.slug] = read(`reports/${row.slug}.json`);
for (const year of Object.keys(read('years/index.json').years))
  data.years[year] = read(`years/${year}.json`);
// A round that names a donor the app withholds (src/privacy/donorEntity.ts)
// is skipped, whole, for the next seed: the bundle must never carry the name.
// As the web's withheldPhrases, an office holder's name is not a donor's.
const phrase = (s) =>
  String(s)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
const officeHolders = new Set(
  data.parliamentarians.people.map((p) => phrase(p.name)),
);
const withheld = new Set();
for (const n of data.money.nodes)
  if (n.kind === 'donor' && !isOrganisationDonor(n))
    for (const name of [n.label, ...(n.aliases ?? [])]) {
      const inverted = /^([^,]+),\s*([^,]+)$/.exec(name);
      for (const p of [
        name,
        ...(inverted ? [`${inverted[2]} ${inverted[1]}`] : []),
      ].map(phrase))
        if (p.length > 1 && !officeHolders.has(p)) withheld.add(p);
    }
const namesWithheld = (question) => {
  const text = ` ${phrase(JSON.stringify(question))} `;
  return [...withheld].some((p) => text.includes(` ${p} `));
};
let skipped = 0;
const rounds = {};
for (const deck of ['mixed', 'money', 'words']) {
  let seed = 48;
  rounds[deck] = Array.from({ length: 16 }, () => {
    let questions;
    for (;;) {
      if (seed > 4096)
        throw new Error(`Too few ${deck} rounds clear of withheld donors`);
      questions = engine.buildRound(data, engine.createRng(seed++), 8, deck);
      if (!questions.some(namesWithheld)) break;
      skipped++;
    }
    if (
      questions.length !== 8 ||
      questions.some((q) => !engine.validateQuestion(q))
    )
      throw new Error(`Incomplete ${deck} deck`);
    // The web's old top-N wording predates the public-money additions.
    // Keep its question and scoring; use the current export's exact method.
    for (const question of questions) {
      if (question.explanation.startsWith('The map deliberately shows the '))
        question.explanation = data.money.meta.methodology;
      question.explanation = question.explanation.replace(
        "from the industry's biggest donors",
        'from the donors in the money export',
      );
    }
    return questions;
  });
}
writeFileSync(
  resolve(output, 'quiz-rounds.json'),
  JSON.stringify(
    { generated: data.money.meta.generated, hashes, rounds },
    null,
    2,
  ) + '\n',
);
console.log(
  `Generated 48 eight-question rounds from local exports; skipped ${skipped} naming a withheld donor.`,
);

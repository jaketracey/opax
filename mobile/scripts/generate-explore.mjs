// Regenerate from a portal checkout's public exports only. Never fetch the
// live Worker.
//
//   node scripts/generate-explore.mjs --portal <portal checkout>/portal
//
// Pass the portal from an up-to-date main checkout, not this repo's own
// portal/public copy, which can lag the web's engine and exports.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import {
  frontPageDeck,
  loadEngine,
  partyLinks,
  topicLinks,
} from './explore-engine.mjs';

const mobile = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name) => {
  const at = process.argv.indexOf(name);
  return at > 0 ? process.argv[at + 1] : undefined;
};
const portal = arg('--portal');
if (!portal) {
  console.error('Usage: node scripts/generate-explore.mjs --portal <dir>');
  process.exit(2);
}
const publicRoot = resolve(portal, 'public');
if (!existsSync(resolve(publicRoot, 'quiz.js')))
  throw new Error(`No quiz.js under ${publicRoot}`);
const output = resolve(mobile, arg('--out') ?? 'src/features/explore');
mkdirSync(output, { recursive: true });

const hashes = {};
const { engine, hash } = await loadEngine(publicRoot);
hashes['quiz.js'] = hash;
const read = (path) => {
  const bytes = readFileSync(resolve(publicRoot, path));
  hashes[path] = createHash('sha256').update(bytes).digest('hex');
  return JSON.parse(bytes);
};
// The same inputs the web's loadData reads.
const data = {
  money: read('graph/money.json'),
  corpus: read('corpus.json'),
  photos: read('photos/people.json'),
  reports: {},
  years: {},
};
for (const row of read('reports/index.json').reports)
  data.reports[row.slug] = read(`reports/${row.slug}.json`);
for (const year of Object.keys(read('years/index.json').years))
  data.years[year] = read(`years/${year}.json`);

const rounds = {};
for (const deck of ['mixed', 'money', 'words']) {
  let seed = 48;
  rounds[deck] = Array.from({ length: 16 }, () => {
    // Every donor is named as the web's quiz names it.
    const questions = engine.buildRound(
      data,
      engine.createRng(seed++),
      8,
      deck,
    );
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
    // App routes: topic pages for reports, party pages by name.
    return questions.map((q) => partyLinks(topicLinks(q)));
  });
}
const write = (name, value) =>
  writeFileSync(resolve(output, name), JSON.stringify(value, null, 2) + '\n');
write('quiz-rounds.json', {
  generated: data.money.meta.generated,
  hashes,
  rounds,
});
// Today's question deck comes from the same run, so it shares the date.
const front = frontPageDeck(rounds);
write('quiz-front-page.json', front);
console.log(
  `Generated 48 eight-question rounds and ${front.length} front-page questions from ${publicRoot}.`,
);

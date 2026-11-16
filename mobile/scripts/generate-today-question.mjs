// Regenerate Today's question from a portal checkout's public exports only.
// Never fetch the live Worker.
//
//   node scripts/generate-today-question.mjs --portal <portal main checkout>/portal
//
// Pass an up-to-date main checkout, not this repo's own portal/public copy,
// which lags. Writes the deck (src/features/explore/quiz-front-page.json),
// its source dates and input hashes (quiz-front-page-sources.json), and each
// question's record excerpt (tests/fixtures/today-question-records.json),
// which the tests check every answer against.
import { existsSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertExportsCurrent } from './export-freshness.mjs';
import { buildTodayDeck, loadTodayInputs } from './today-question.mjs';

const mobile = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name) => {
  const at = process.argv.indexOf(name);
  return at > 0 ? process.argv[at + 1] : undefined;
};
const portal = arg('--portal');
if (!portal) {
  console.error(
    'Usage: node scripts/generate-today-question.mjs --portal <dir>',
  );
  process.exit(2);
}
const publicRoot = resolve(portal, 'public');
if (!existsSync(resolve(publicRoot, 'bills', 'index.json')))
  throw new Error(`No bills/index.json under ${publicRoot}`);
// Never from exports older than main's, such as this branch's own snapshot.
assertExportsCurrent(publicRoot, [
  'bills/index.json',
  'agencies.json',
  'divisions/index.json',
]);

const inputs = loadTodayInputs(publicRoot);
const { deck, records, asOf } = buildTodayDeck(inputs);
const write = (path, value) =>
  writeFileSync(resolve(mobile, path), JSON.stringify(value, null, 2) + '\n');
write('src/features/explore/quiz-front-page.json', deck);
write('src/features/explore/quiz-front-page-sources.json', {
  asOf,
  hashes: inputs.hashes,
});
write('tests/fixtures/today-question-records.json', records);
console.log(`Wrote ${deck.length} questions for Today from ${publicRoot}.`);

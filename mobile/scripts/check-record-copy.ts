import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import fixtures from './fixtures/records/contracts.json';
import snapshot from './fixture-snapshot.json';
import { fixtureBytes } from '../tests/fixture-bytes';
import { decodeDocument } from '../src/features/records/model';
import { citationsFor } from '../src/features/records/citations';
const d = new Date();
const accessed = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const corpus = JSON.parse(fixtureBytes(snapshot)('/corpus.json').toString());
const doc = decodeDocument(fixtures.responses['/api/resource/speech-1205524']);
const expected = citationsFor(doc, {
  origin: 'https://opax.invalid',
  corpusVersion: corpus.version || 'unversioned',
  accessed,
}).find((row) => row.id === 'bibtex')!.text;
const copied = readFileSync(process.argv[2]!, 'utf8');
assert.equal(
  copied,
  expected,
  'Native clipboard must contain the exact web-compatible BibTeX string',
);
console.log(
  JSON.stringify({ format: 'BibTeX', characters: copied.length, exact: true }),
);

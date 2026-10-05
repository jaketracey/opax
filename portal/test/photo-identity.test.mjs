// The portrait map's identity check (scripts/photo_identity.mjs): the name rules on
// the real pairs that once shared a face, each failure on a small synthetic map,
// then the audit over the shipped photos/people.json. A corrupt mapping fails the run;
// a roster-dependent one is a warning, and a deploy ships the map without it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { auditPhotoMap, auditShippedPhotoMap, formatPhotoMap, isWeakName, nameAgrees, servedPhotoMap } from '../../scripts/photo_identity.mjs';

test('a name agrees with its owner by surname and a first name, nickname or initials', () => {
  for (const [name, owner] of [
    ['phil barresi', 'Phillip Barresi'], ['deb o\'neill', 'Deborah O\'Neill'], ['steven ciobo', 'Steve Ciobo'],
    ['k.j. maher', 'Kyam Maher'], ['d o’brien', 'Danny O\'Brien'], ['j.a.w. gardner', 'John Gardner'],
    ['nampijinpa price', 'Jacinta Nampijinpa Price'], ['d.c. van holst pellekaan', 'Dan van Holst Pellekaan'],
    ['mark christopher butler', 'Mark Butler'], ['burke', 'Tony Burke'], ['patrick conaghan', 'Pat Conaghan'],
  ]) assert.ok(nameAgrees(name, owner), `${name} / ${owner}`);
});

test('the pairs that shared a face do not agree', () => {
  for (const [name, owner] of [
    ['graeme campbell', 'George Campbell'], ['kathy sullivan', 'Jon Sullivan'], ['ricky johnston', 'David Johnston'],
    ['patrick conaghan', 'Rex Patrick'], ['patrick farmer', 'Rex Patrick'], ['alexander somlyay', 'John Alexander'],
    ['robert baldwin', 'Stuart Robert'], ['stephen martin', 'Steve Martin'], ['ian mclachlan', 'Andrew McLachlan'],
    ['t smith', 'Matt Smith'], ['anna burke', 'Tony Burke'],
  ]) assert.equal(nameAgrees(name, owner), false, `${name} / ${owner}`);
  assert.ok(isWeakName('burke') && isWeakName('T Smith') && isWeakName('K.J. Maher'));
  assert.equal(isWeakName('Tony Burke'), false);
});

const owners = new Map([['10080', 'Anna Burke'], ['10081', 'Tony Burke'], ['10098', 'George Campbell'], ['10875', 'Damian Drum'],
  ['10964', 'Dorinda Cox'], ['10473', 'John Murphy'], ['wd-Q1', 'Charlotte Walker'], ['11058', 'Charlotte Walker'], ['wd-Q2', 'Mark Bailey']]);
const file = (key) => Buffer.from(`face of ${key}`);
const audit = (people, roster = [], identity = {}, bytesOf = file) => auditPhotoMap({ people, owners, roster, identity, bytesOf });
const at = (problems, level) => problems.filter((p) => p.level === level).map((p) => p.message).join('\n');
const fed = (name, pid, extra = {}) => ({ name, pid, states: ['federal'], chambers: ['senate'], ...extra });

test('a clean map passes, with verified same-person prints and a wd- face for a pid', () => {
  assert.deepEqual(audit(
    { 'tony burke': '10081', 'burke': '10081', 'kevin drum': '10875', 'walker': 'wd-Q1' },
    [fed('Tony Burke', '10081'), fed('Burke', '10081'), fed('Kevin Drum', '10875'), fed('Walker', '11058')],
    { same_person: { 'kevin drum': { key: '10875' } } }), []);
});

test('a confirmed wrong face is corrupt and fails', () => {
  assert.match(at(audit({ 'graeme campbell': '10098' }, [fed('Graeme Campbell', '10098')]), 'corrupt'),
    /"graeme campbell" maps to 10098, which is George Campbell/);
  assert.match(at(audit({ 'kevin drum': '10875' }), 'corrupt'), /which is Damian Drum/, 'an unlisted variant fails');
  assert.match(at(audit({ 'anna burke': '10080', 'tony burke': '10081' }, [], {}, () => Buffer.from('one face')), 'corrupt'),
    /10080 and 10081 are byte-identical files: one face on Anna Burke and Tony Burke/);
  assert.match(at(audit({ 'anna burke': '10080' }, [], { wrong_face: { '10080': "Tony Burke's portrait" } }), 'corrupt'),
    /"anna burke" maps to 10080, whose file shows someone else: Tony Burke's portrait/);
  assert.match(at(audit({ 'anna burke': '10080' }, [], {}, () => null), 'corrupt'), /10080 has no file/);
});

test('a surname print that holds more than one person is not vouched for', () => {
  // "Cox": David Cox's Kingston House years and Senator Dorinda Cox, the roster now gives it no pid.
  const cox = audit({ 'dorinda cox': '10964', 'cox': '10964' },
    [fed('Dorinda Cox', '10964'), fed('Cox', null, { chambers: ['senate_committee', 'representatives'], first: 2000, last: 2026 })]);
  assert.match(at(cox, 'roster'), /"cox" is a surname or initials print the roster gives to no one, not 10964 \(Dorinda Cox\)/);
  // Even with the old pid still on it, a witness or a second parliament in the print disqualifies it.
  assert.match(at(audit({ 'cox': '10964' }, [fed('Cox', '10964', { witness_rows: 10 })]), 'roster'), /includes 10 committee-witness rows/);
  assert.match(at(audit({ 'bailey': 'wd-Q2' }, [{ name: 'Bailey', states: ['qld', 'federal'], chambers: ['qld_la', 'senate_committee'] }]), 'roster'),
    /"bailey" is a surname or initials print spanning qld\+federal/);
  assert.deepEqual(servedPhotoMap({ 'dorinda cox': '10964', 'cox': '10964' }, cox), { 'dorinda cox': '10964' }, 'the deploy ships no face for it');
});

test('a roster change alone warns and is left out of the deploy, it does not fail the run', () => {
  // The weekly export drops Murphy's pid; the map and the bytes are unchanged.
  const people = { 'john murphy': '10473', 'murphy': '10473' };
  const before = audit(people, [fed('John Murphy', '10473'), fed('Murphy', '10473')]);
  const after = audit(people, [fed('John Murphy', '10473'), fed('Murphy', null)]);
  assert.deepEqual(before, []);
  assert.equal(at(after, 'corrupt'), '');
  assert.match(at(after, 'roster'), /"murphy" is a surname or initials print the roster gives to no one/);
  assert.deepEqual(servedPhotoMap(people, after), { 'john murphy': '10473' });
  assert.match(at(audit({ 'jo bloggs': '99999' }), 'roster'), /whose owner is unknown/);
});

test('the served map keeps the photo scripts\' format', () => {
  assert.equal(formatPhotoMap({ 'b b': '2', 'a a': 'wd-Q1' }), '{\n"a a": "wd-Q1",\n"b b": "2"\n}');
});

test('the shipped portrait map has no corrupt mappings', (t) => {
  const problems = auditShippedPhotoMap();
  const corrupt = problems.filter((p) => p.level === 'corrupt').map((p) => p.message);
  assert.deepEqual(corrupt, [], `photos/people.json (fix by removing the named mapping; docs/PHOTOS.md):\n${corrupt.join('\n')}`);
  // Roster-dependent findings warn here; `npm run deploy` leaves those names out of the map it ships.
  for (const p of problems.filter((p) => p.level === 'roster')) t.diagnostic(`warning: ${p.message}`);
});

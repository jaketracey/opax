// The portrait map's identity check (scripts/photo_identity.mjs): the name rules on
// the real pairs that once shared a face, each failure on a small synthetic map,
// then the audit over the shipped photos/people.json, which must come back clean.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { auditPhotoMap, auditShippedPhotoMap, isWeakName, nameAgrees } from '../../scripts/photo_identity.mjs';

test('a name agrees with its owner by surname and a first name, nickname or initials', () => {
  for (const [name, owner] of [
    ['phil barresi', 'Phillip Barresi'], ['deb o\'neill', 'Deborah O\'Neill'], ['steven ciobo', 'Steve Ciobo'],
    ['k.j. maher', 'Kyam Maher'], ['d o’brien', 'Danny O\'Brien'], ['j.a.w. gardner', 'John Gardner'],
    ['nampijinpa price', 'Jacinta Nampijinpa Price'], ['d.c. van holst pellekaan', 'Dan van Holst Pellekaan'],
    ['mark christopher butler', 'Mark Butler'], ['burke', 'Tony Burke'],
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

const owners = new Map([['10080', 'Anna Burke'], ['10081', 'Tony Burke'], ['10098', 'George Campbell'], ['10875', 'Damian Drum'], ['wd-Q1', 'Charlotte Walker'], ['11058', 'Charlotte Walker']]);
const file = (key) => Buffer.from(`face of ${key}`);
const audit = (people, roster = [], identity = {}, bytesOf = file) => auditPhotoMap({ people, owners, roster, identity, bytesOf });

test('a clean map passes, with verified same-person prints and a wd- face for a pid', () => {
  assert.deepEqual(audit(
    { 'tony burke': '10081', 'burke': '10081', 'kevin drum': '10875', 'walker': 'wd-Q1' },
    [{ name: 'Tony Burke', pid: '10081' }, { name: 'Burke', pid: '10081' }, { name: 'Kevin Drum', pid: '10875' }, { name: 'Walker', pid: '11058' }],
    { same_person: { 'kevin drum': { key: '10875' } } }), []);
});

test('each kind of wrong face is caught', () => {
  const [other] = audit({ 'graeme campbell': '10098' }, [{ name: 'Graeme Campbell', pid: '10098' }]);
  assert.match(other, /"graeme campbell" maps to 10098, which is George Campbell/);
  assert.match(audit({ 'kevin drum': '10875' }).join(), /which is Damian Drum/, 'an unlisted variant fails');

  const stub = audit({ 'tony burke': '10081', 'burke': '10081' }, [{ name: 'Tony Burke', pid: '10081' }, { name: 'Burke', pid: '10080' }]);
  assert.ok(stub.some((p) => /"burke" is a surname or initials print the roster gives to 10080, not 10081/.test(p)), stub.join('\n'));
  assert.ok(stub.some((p) => /10081 holds names the roster gives different people/.test(p)), stub.join('\n'));
  assert.match(audit({ 'burke': '10081' }, [{ name: 'Burke', pid: null }]).join(), /gives to no one, not 10081/);

  assert.match(audit({ 'anna burke': '10080', 'tony burke': '10081' }, [], {}, () => Buffer.from('one face')).join(),
    /10080 and 10081 are byte-identical files: one face on Anna Burke and Tony Burke/);
  assert.match(audit({ 'anna burke': '10080' }, [], { wrong_face: { '10080': "Tony Burke's portrait" } }).join(),
    /"anna burke" maps to 10080, whose file shows someone else: Tony Burke's portrait/);
  assert.match(audit({ 'anna burke': '10080' }, [], {}, () => null).join(), /10080 has no file/);
  assert.match(audit({ 'jo bloggs': '99999' }).join(), /whose owner is unknown/);
});

test('the shipped portrait map has no identity problems', () => {
  const problems = auditShippedPhotoMap();
  assert.deepEqual(problems, [], `photos/people.json (fix by removing the named mapping; docs/PHOTOS.md):\n${problems.join('\n')}`);
});

// Records join on who a person is, never on which portrait they have. The roster's pid is verified
// (scripts/roster_identity.py) and each export's own name index names its people; a portrait key
// once put Rex Patrick's 1,598 divisions on Patrick Conaghan and George Campbell's on Graeme
// Campbell (docs/PHOTOS.md, "Identity check").
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

const read = async file => JSON.parse(await readFile(new URL('../public/' + file, import.meta.url), 'utf8'));
const [roster, votes, photos, app] = await Promise.all([
  read('parliamentarians.json'), read('votes.json'), read('photos/people.json'),
  readFile(new URL('../public/app.js', import.meta.url), 'utf8'),
]);
const row = new Map(roster.people.map(p => [p.name, p]));

const votesForSource = app.match(/function votesFor\(name, pid\) \{[\s\S]*?\n\}/)?.[0];
assert.ok(votesForSource, 'votesFor takes the roster pid');
const ctx = {votesData: votes, photoMap: photos};
runInNewContext(votesForSource, ctx);

// The directory's join, as buildPeopleDirectory writes it: the roster pid, then votes.json's own names.
const divisions = p => [...new Set([p.pid, ...(votes._names?.[p.name.toLowerCase()] || [])].filter(Boolean))]
  .reduce((a, k) => a + (Number(votes[k]?.divisions_total) || 0), 0);

test('the prints that carried another member\'s id show only their own record', () => {
  for (const name of ['Graeme Campbell', 'David Cox', 'Bill Taylor', 'Ian McLachlan', 'Kathy Sullivan', 'Ricky Johnston', 'Michael Cobb']) {
    const p = row.get(name);
    assert.ok(p, name);
    assert.equal(p.pid, undefined, `${name} has no pid of someone else's`);
    assert.equal(p.current, undefined, `${name} is not marked sitting through someone else's id`);
    assert.equal(divisions(p), 0, `${name} borrows no divisions`);
    assert.equal(ctx.votesFor(name, p.pid), null, name);
  }
  // Patrick Conaghan is a print of Pat Conaghan, the row holding their verified id (scripts/roster_fold.py fold_ids).
  assert.equal(row.has('Patrick Conaghan'), false);
  const patrick = row.get('Pat Conaghan');
  assert.ok(patrick.prints.includes('Patrick Conaghan'));
  assert.equal(patrick.pid, '10922');
  assert.equal(divisions(patrick), votes['10922'].divisions_total, 'Pat Conaghan\'s own divisions');
  assert.equal(ctx.votesFor('Patrick Conaghan', patrick.pid).name, 'Pat Conaghan');
  assert.equal(row.get('Dorinda Cox').pid, '10964');
  assert.equal(divisions(row.get('Dorinda Cox')), votes['10964'].divisions_total);
});

test('the Cunningham and Dickson members reuse their own dated catalogue identities', () => {
  const stephen = row.get('Stephen Martin');
  // A canonical id sits in person_id: the apps accept only legacy or roster ids in pid.
  assert.equal(stephen.pid, undefined);
  assert.equal(stephen.person_id, 'person_9c02d321caef54b2ba21a1f8');
  assert.equal(stephen.speeches, 299);
  assert.equal(stephen.representation[0].electorate, 'Cunningham');
  assert.ok(stephen.aliases.includes('Stephen Paul Martin'));
  assert.equal(row.has('Stephen Paul Martin'), false);
  const anthony = row.get('Anthony Charles Smith');
  assert.equal(anthony.pid, undefined);
  assert.equal(anthony.person_id, 'person_efb744ffb3a25d578e592281');
  assert.equal(anthony.speeches, 76);
  assert.equal(anthony.representation[0].electorate, 'Dickson');
  assert.equal(row.get('Tony Smith').speeches, 380);
  assert.equal(row.get('Fiona Martin').speeches, 244);
});

test('a surname print that holds more than one person joins no one\'s record and shows no face', () => {
  const cox = row.get('Cox');
  assert.ok(cox.first <= 2004 && cox.chambers.includes('representatives'), 'Cox holds David Cox\'s Kingston years');
  assert.equal(cox.pid, undefined);
  assert.equal(cox.full, undefined);
  assert.equal(divisions(cox), 0);
  assert.equal(ctx.votesFor('Cox', cox.pid), null);
  assert.equal(photos.cox, undefined);
});

test('no record join reads the portrait map', () => {
  // photoIdFor is the portrait lookup itself; nothing else may index photoMap by a name.
  const uses = [...app.matchAll(/photoMap\?\.\[/g)].map(m => app.slice(0, m.index).split('\n').length);
  const inPhotoIdFor = app.match(/function photoIdFor\(name\) \{[\s\S]*?\n\}/);
  const start = app.slice(0, inPhotoIdFor.index).split('\n').length;
  assert.deepEqual(uses.filter(line => line < start || line > start + 3), [], 'photoMap indexed outside photoIdFor');
  assert.match(app, /renderPersonVotes\(name, roster\?\.pid \?\? null, sections, updateQuestions\)/);
  assert.match(app, /renderPersonInterests\(name, roster\?\.pid \?\? null, sections, updateQuestions\)/);
  assert.match(app, /renderPersonExpenses\(name, roster\?\.pid \?\? null, sections\)/);
});

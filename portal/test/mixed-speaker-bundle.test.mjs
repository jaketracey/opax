import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {joinMixedSpeakers} from '../src/mixed-speakers.ts';

const directory = new URL('../public/mixed-speakers/', import.meta.url);
const read = filename => JSON.parse(readFileSync(new URL(filename, directory), 'utf8'));
const index = read('index.json');
const chairs = new Set(['Chair', 'Speaker', 'Deputy Speaker', 'Acting Speaker', 'President', 'Deputy President', 'Acting President']);

test('published participant shards contain only roster identities or explicit chair labels (counts only)', () => {
  const roster = JSON.parse(readFileSync(new URL('../public/parliamentarians.json', import.meta.url), 'utf8'));
  const ids = new Set(roster.people.filter(p => p.pid).map(p => String(p.pid)));
  assert.equal(index.schema, 1);
  assert.deepEqual(index.shards, [...'0123456789abcdef']);
  assert.equal(readdirSync(directory).length, 17);
  const resources = new Set(), people = new Set();
  const counts = {resources: 0, participants: 0, roster_memberships: 0, chair_memberships: 0, explicit_chair_only: 0, invalid: 0};
  for (const shard of index.shards) {
    const data = read(shard + '.json');
    assert.equal(data.schema, 1);
    for (const [rid, entry] of Object.entries(data.resources)) {
      counts.invalid += Number(!new RegExp('^' + shard + '[0-9a-f]{31}$').test(rid) || resources.has(rid));
      resources.add(rid);
      counts.resources++;
      counts.invalid += Number(!entry.participants.length || typeof entry.debate !== 'string' || !entry.debate.trim());
      for (const p of entry.participants) {
        const resolved = ids.has(String(p.person_id));
        const explicitChair = chairs.has(p.role) && p.name === p.role;
        counts.participants++;
        counts.roster_memberships += Number(resolved);
        counts.chair_memberships += Number(chairs.has(p.role));
        counts.explicit_chair_only += Number(!resolved && explicitChair);
        counts.invalid += Number(!(resolved || explicitChair)
          || typeof p.name !== 'string' || !p.name.trim()
          || /\b(witness|unresolved|unknown)\b|speaker not named/i.test(p.name)
          || (p.role !== undefined && !chairs.has(p.role))
          || Object.keys(p).some(k => !['name', 'person_id', 'role'].includes(k)));
        if (resolved) people.add(String(p.person_id));
      }
    }
  }
  counts.people = people.size;
  console.log(JSON.stringify(counts));
  assert.equal(counts.invalid, 0);
  assert.equal(counts.resources, 16508);
  assert.equal(counts.participants, 80842);
  assert.equal(counts.people, 370);
});

test('Worker joins the published assets across all sixteen shards without personal credit', async () => {
  const rows = index.shards.map(shard => ({resource: Object.keys(read(shard + '.json').resources)[0],
    speaker_type: 'multi_speaker', speaker: 'Stale MP', person_id: '123', party: 'Example party'}));
  const assets = {fetch: async request => Response.json(read(new URL(request.url).pathname.split('/').pop()))};
  await joinMixedSpeakers(rows, assets);
  for (const row of rows) {
    assert.ok(row.participants.length > 0);
    assert.equal(row.debate, read(row.resource[0] + '.json').resources[row.resource].debate);
    assert.equal(row.speaker, null);
    assert.equal(row.person_id, null);
    assert.equal(row.party, null);
    assert.equal(row.speaker_display, 'Several speakers');
  }
});

test('participant snapshot has the same detached immutable caching as release data assets', () => {
  const headers = readFileSync(new URL('../public/_headers', import.meta.url), 'utf8');
  const block = path => headers.slice(headers.indexOf('\n' + path + '\n')).split('\n\n')[0].split('\n').slice(2).join('\n');
  assert.equal(block('/mixed-speakers/*'), block('/electorates/releases/*'));
  assert.match(block('/mixed-speakers/*'), /! Cache-Control/);
  assert.match(block('/mixed-speakers/*'), /max-age=31536000, immutable/);
});

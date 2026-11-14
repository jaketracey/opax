// Contract with the apps: every `pid` in parliamentarians.json must pass the
// apps' roster id rule (mobile/src/api/ids.ts, `rosterId`). The apps drop a row
// whose pid fails it and mark the whole roster partial, and a partial roster
// stops every party page's Members block from loading (14 Nov 2026: two
// canonical person_<hex> ids in pid took Members down in every app build).
// A canonical id belongs in `person_id`, which the apps ignore.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// Same pattern as mobile/src/api/ids.ts rosterId. Change both together.
const ROSTER_ID = /^(?:\d+|(?:nsw|vic|qld|sa|wa|tas|act|nt|wragge|zenodo|aph)_[a-z0-9_]+)$/
const PERSON_ID = /^person_[a-f0-9]{24}$/

const roster = JSON.parse(readFileSync(new URL('../public/parliamentarians.json', import.meta.url), 'utf8'))

test('every roster pid passes the apps\' roster id rule', () => {
  const bad = roster.people
    .filter((p) => p.pid !== undefined && !(typeof p.pid === 'string' && ROSTER_ID.test(p.pid)))
    .map((p) => `${p.name}: ${JSON.stringify(p.pid)}`)
  assert.deepEqual(bad, [])
})

test('a canonical id in the roster sits in person_id, never in pid', () => {
  const bad = roster.people
    .filter((p) => p.person_id !== undefined && !(typeof p.person_id === 'string' && PERSON_ID.test(p.person_id)))
    .map((p) => `${p.name}: ${JSON.stringify(p.person_id)}`)
  assert.deepEqual(bad, [])
})

test('the rule rejects a canonical id in pid (revert guard)', () => {
  assert.equal(ROSTER_ID.test('person_9c02d321caef54b2ba21a1f8'), false)
  assert.equal(ROSTER_ID.test('10592'), true)
  assert.equal(ROSTER_ID.test('aph_abc1'), true)
})

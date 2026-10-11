import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { resolve } from 'node:path'
import { test } from 'node:test'
import roster from '../src/historic-names.json' with { type: 'json' }
import { hasNewPersonalName } from '../src/validate.ts'
import { hasParliamentaryService, resolvedParliamentaryService, rosterKey, verifiedStateMemberNames, type DatedMember } from '../scripts/roster_membership.ts'

test('incomplete directory metadata is corroborated by official records and dated parliamentary identity', () => {
  const snapshot = { source_url: 'https://www.parliament.nsw.gov.au/members', jurisdiction: 'nsw', chamber: 'nsw_lc', as_of: '2026-09-25', members: [{ name: 'Zelara Quenwick', aliases: ['Zelara Vaelquist'] }] }
  const member: DatedMember = { person_id: 'nsw_zelara_quenwick', first_name: 'Zelara', last_name: 'Quenwick', full_name: 'Zelara Quenwick', state: 'nsw', chamber: 'nsw_lc', entered_house: '1999-01-01', left_house: '2010-01-01' }
  const verified = verifiedStateMemberNames([snapshot], [member])
  assert.equal(resolvedParliamentaryService({ name: 'Zelara Quenwick' }, verified), true)
  assert.equal(resolvedParliamentaryService({ name: 'Zelara Vaelquist' }, verified), true)
  assert.equal(resolvedParliamentaryService({ name: 'Arvella Street' }, verified), false)
  for (const change of [{ entered_house: null }, { person_id: 'witness_identity' }, { chamber: 'nsw_la' }, { state: 'vic' }]) {
    assert.equal(verifiedStateMemberNames([snapshot], [{ ...member, ...change }]).size, 0)
  }
  assert.equal(verifiedStateMemberNames([{ ...snapshot, source_url: 'https://parliament.nsw.gov.au.example.com/members' }], [member]).size, 0)
})

// Optional desktop integration evidence; ordinary tests above use invented data.
test('cached official and dated records restore all 27 NSW forms and exclude unverified witnesses', t => {
  const database = '/home/jake/.cache/autoresearch/parli.db'
  let db: DatabaseSync
  try { db = new DatabaseSync(database, { readOnly: true }) } catch { t.skip('desktop parliamentary cache unavailable'); return }
  const dated = db.prepare('SELECT person_id, first_name, last_name, full_name, state, chamber, entered_house, left_house FROM members').all() as unknown as DatedMember[]
  db.close()
  const snapshots = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../scripts/roster_state_evidence.json'), 'utf8')).snapshots
  const people = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../portal/public/parliamentarians.json'), 'utf8')).people
  const verified = verifiedStateMemberNames(snapshots, dated)
  const restored = people.filter((p: { name: string }) => !hasParliamentaryService(p) && resolvedParliamentaryService(p, verified))
  assert.equal(restored.length, 27)
  const forms = new Set(roster.names.split('\n'))
  assert.ok(restored.every((p: { name: string }) => forms.has(rosterKey(p.name))))
  assert.ok(restored.every((p: { name: string }) => {
    const term = rosterKey(p.name).replace(/(^|[\s'-])\p{L}/gu, s => s.toUpperCase())
    return !hasNewPersonalName(`Reported concerns raised by ${term} about regional services.`, '')
  }))
  assert.ok(restored.every((p: { name: string }) => dated.some(r => r.state === 'nsw' && rosterKey(r.full_name) === rosterKey(p.name))))
  const excluded = people.filter((p: { name: string; witness_rows?: number }) => p.witness_rows && !hasParliamentaryService(p))
  assert.equal(excluded.length, 260)
  assert.ok(excluded.every((p: { name: string }) => !resolvedParliamentaryService(p, verified)))
})

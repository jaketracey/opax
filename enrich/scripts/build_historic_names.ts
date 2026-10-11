// Local, reproducible roster asset. Never reads speech text or emits names to stdout.
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { hasParliamentaryService, resolvedParliamentaryService, rosterKey, verifiedStateMemberNames, type DirectoryPerson, type DatedMember } from './roster_membership.ts'

const roster = process.argv[2] ?? '/home/jake/opax-staging/federation/roster'
const portal = process.argv[3] ?? resolve(import.meta.dirname, '../../portal/public/parliamentarians.json')
const snapshots = process.argv[4] ?? resolve(import.meta.dirname, '../../scripts/roster_state_evidence.json')
const datedPath = process.argv[5] ?? '/home/jake/.cache/autoresearch/parli.db'
const normalise = rosterKey
const names = new Set<string>()
const add = (value: unknown): void => {
  if (typeof value !== 'string' || !value.trim()) return
  const parts = value.split(',').map((p) => p.trim())
  const name = normalise(parts.length === 2 ? `${parts[1]} ${parts[0]}` : value)
  if (name) names.add(name)
}
const members = JSON.parse(readFileSync(resolve(roster, 'members.json'), 'utf8'))
for (const member of members) {
  add(member.full_name)
  add(member.family_name)
  for (const given of [member.given_name, member.preferred_name]) {
    if (given && member.family_name) add(`${given} ${member.family_name}`)
  }
  for (const alias of member.aliases ?? []) add(alias)
}
const directory = JSON.parse(readFileSync(portal, 'utf8')).people
const db = new DatabaseSync(datedPath, { readOnly: true })
const dated = db.prepare('SELECT person_id, first_name, last_name, full_name, state, chamber, entered_house, left_house FROM members').all() as unknown as DatedMember[]
db.close()
const verified = verifiedStateMemberNames(JSON.parse(readFileSync(snapshots, 'utf8')).snapshots, dated)
const people = directory.filter((person: DirectoryPerson) => resolvedParliamentaryService(person, verified))
const restored = people.filter((person: DirectoryPerson) => !hasParliamentaryService(person))
for (const person of people) {
  add(person.name)
  // Only verified members contribute surname forms used after a title.
  add(person.name.split(/\s+/).at(-1))
}
const electorates = JSON.parse(readFileSync(resolve(roster, 'electorates.json'), 'utf8'))
const places = new Set<string>(electorates.map((e: { name: string }) => normalise(e.name)))
for (const person of people) {
  for (const spell of person.representation ?? []) {
    if (typeof spell.electorate === 'string') places.add(normalise(spell.electorate))
  }
}
// Portfolio vocabulary is public office wording, never an appointment's person/ministry name.
const appointments = JSON.parse(readFileSync(resolve(roster, 'ministries.json'), 'utf8'))
const portfolioWords = new Set<string>()
for (const appointment of appointments) {
  for (const word of normalise(appointment.portfolio ?? '').match(/[\p{L}-]{3,}/gu) ?? []) portfolioWords.add(word)
}
// The Worker receives parliamentary forms only. Selection vocabulary belongs to
// the offline audit and must never become exemptions in the novelty guard.
const asset = { names: [...names].sort().join('\n') }
const vocabulary = { electorates: [...places].sort().join('\n'), portfolioWords: [...portfolioWords].sort().join('\n') }
writeFileSync(resolve(import.meta.dirname, 'historic-control-vocabulary.json'), JSON.stringify(vocabulary) + '\n')
const out = resolve(import.meta.dirname, '../src/historic-names.json')
writeFileSync(out, JSON.stringify(asset) + '\n')
console.log(JSON.stringify({
  members: members.length, portalPeople: people.length, portalRemoved: directory.length - people.length,
  restoredVerifiedEntries: restored.length,
  restoredNswEntries: restored.filter((person: DirectoryPerson) => dated.some(record =>
    record.state === 'nsw' && verified.has(normalise(person.name ?? ''))
    && normalise(record.full_name) === normalise(person.name ?? ''))).length,
  excludedWitnessEntries: directory.filter((person: DirectoryPerson & { witness_rows?: number }) =>
    !!person.witness_rows && !resolvedParliamentaryService(person, verified)).length,
  names: names.size, electorates: places.size, portfolioWords: portfolioWords.size,
  bytes: Buffer.byteLength(JSON.stringify(asset)) + 1,
}))

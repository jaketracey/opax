#!/usr/bin/env node
// The names Ask knows each registered commission or inquiry by: its name and aliases from the registry
// (parli/ingest/royal_commissions.json), written to portal/src/commission-names.json for the Worker.
//   node scripts/build_commission_names.mjs           write the file
//   node scripts/build_commission_names.mjs --check   fail if the file is out of date
// A test (portal/test/ask-run3-fixes.test.mjs) runs the same check, so a commission added to the registry without
// this file being rebuilt fails the suite.
import { readFile, writeFile } from 'node:fs/promises'

const root = new URL('../', import.meta.url)
export async function commissionNames() {
  const registry = JSON.parse(await readFile(new URL('parli/ingest/royal_commissions.json', root), 'utf8'))
  return { about: 'Built by scripts/build_commission_names.mjs from parli/ingest/royal_commissions.json. Do not edit.',
    commissions: registry.commissions.map(c => ({ id: c.id, names: [c.name, ...(Array.isArray(c.aliases) ? c.aliases : [])] })) }
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const target = new URL('portal/src/commission-names.json', root), text = JSON.stringify(await commissionNames(), null, 1) + '\n'
  if (process.argv.includes('--check')) { if (await readFile(target, 'utf8').catch(() => '') !== text) { console.error('portal/src/commission-names.json is out of date: run node scripts/build_commission_names.mjs'); process.exit(1) } }
  else await writeFile(target, text)
}

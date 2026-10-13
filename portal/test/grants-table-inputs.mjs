// Source identities are derived in memory; diagnostics report counts only.
import {readFile, readdir} from 'node:fs/promises';
import {sourceTableDonorIdentities} from '../../scripts/table_identity_source.mjs';
import {isOrganisationRecipient} from '../src/table-recipient.mjs';
import {identityStripped} from '../src/table-identities.mjs';
export async function grantsPrivateInputs() {
  const root = new URL('../public/', import.meta.url), recipients = new Set();
  for (const jur of ['federal', 'qld']) for (const file of (await readdir(new URL(`grants/${jur}/`, root))).filter(file => /^shard-.*\.json$/.test(file))) {
    for (const r of Object.values(JSON.parse(await readFile(new URL(`grants/${jur}/${file}`, root), 'utf8')))) if (!isOrganisationRecipient(r)) {
      for (const value of [r.n, r.abn, r.abr?.abn, r.identity?.legal_name, r.abr?.name, ...r.aliases || [], ...r.lookup_names || []]) if (['string', 'number'].includes(typeof value) && String(value).trim()) recipients.add(String(value));
    }
  }
  const source = sourceTableDonorIdentities();
  return {labels: source.labels, identifiers: source.identifiers, recipients: [...recipients], variants: [...source.labels, ...recipients].map(identityStripped)};
}

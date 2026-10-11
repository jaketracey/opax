// Both projections come from the shared complete registry. Fingerprints stay server-only.
import {writeFile} from 'node:fs/promises';
import {tableIdentityIndex,tableIdentityHashes,tableIdentityFingerprints,tableRegistryFingerprint} from './load_tables.mjs';
const policy=await tableIdentityIndex();
await writeFile(new URL('../portal/src/table-privacy-fingerprints.json',import.meta.url),JSON.stringify({version:1,fingerprint:tableRegistryFingerprint(policy),identities:tableIdentityFingerprints(policy)})+'\n');
await writeFile(new URL('../portal/public/table-private-identities.json',import.meta.url),JSON.stringify({version:1,identities:tableIdentityHashes(policy),strippedLengths:policy.strippedLengths})+'\n');
console.log(JSON.stringify({sharedRegistryIdentities:policy.phrases.size,serverOnlyFingerprints:true}));

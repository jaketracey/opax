// Uses the approved shared registry, including row-form provenance.
import {writeFile} from 'node:fs/promises';
import {tableIdentityIndex,tableIdentityHashes,tableRegistryFingerprint} from './load_tables.mjs';
const policy=await tableIdentityIndex();
await writeFile(new URL('../portal/public/table-private-identities.json',import.meta.url),JSON.stringify({version:3,identities:tableIdentityHashes(policy),strippedLengths:policy.strippedLengths})+'\n');
await writeFile(new URL('../portal/src/table-registry-fingerprint.json',import.meta.url),JSON.stringify({fingerprint:tableRegistryFingerprint(policy)})+'\n');
console.log(JSON.stringify({sharedRegistryIdentities:policy.phrases.size,sharedRowPolicy:true}));

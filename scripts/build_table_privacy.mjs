// Uses the approved shared registry, including row-form provenance.
import {writeFile} from 'node:fs/promises';
import {tableIdentityIndex,tableIdentityHashes,tableRegistryFingerprint,tableIdentityPrefilter} from './load_tables.mjs';
import {identityPrefilterModule} from '../portal/src/table-identity-prefilter.mjs';
const policy=await tableIdentityIndex();
const identities=tableIdentityHashes(policy),fingerprint=tableRegistryFingerprint(policy);
const privateModule=identityPrefilterModule(tableIdentityPrefilter(policy),policy.phrases,identities,fingerprint);
await writeFile(new URL('../portal/src/table-identity-prefilter.generated.mjs',import.meta.url),privateModule);
await writeFile(new URL('../portal/public/table-private-identities.json',import.meta.url),JSON.stringify({version:3,identities,strippedLengths:policy.strippedLengths})+'\n');
await writeFile(new URL('../portal/src/table-registry-fingerprint.json',import.meta.url),JSON.stringify({fingerprint})+'\n');
console.log(JSON.stringify({sharedRegistryIdentities:policy.phrases.size,sharedRowPolicy:true}));

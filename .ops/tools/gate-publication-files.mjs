import {relative} from 'node:path';

// Full/ordinary test runs keep the complete sweep. A narrow gate still checks
// changed assets and one real graph from every jurisdiction on every iteration.
export function publicationGateFiles(root,files,encoded=process.env.OX_GATE_PUBLICATION_CHANGED){
  if(!encoded)return files;
  const changed=JSON.parse(encoded);
  if(!Array.isArray(changed)||changed.some(file=>typeof file!=='string'))throw Error('Invalid gate publication scope');
  const selected=new Set(['graph/money.json','graph/money.qld.json','graph/money.vic.json','graph/money.tas.json','donor-entity.js','app.js','index.html','table-private-identities.json']);
  for(const file of changed)if(file.startsWith('portal/public/'))selected.add(file.slice('portal/public/'.length));
  return files.filter(file=>selected.has(relative(root,file)));
}

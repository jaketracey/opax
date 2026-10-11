// The same publication boundary as other static exports; no raw identities in diagnostics.
import {readFileSync} from 'node:fs';
import {readPublicationContext,sanitiseDonorAsset} from './withhold_donor_assets.mjs';
const files=JSON.parse(readFileSync(0,'utf8')),context=readPublicationContext();
for(const[name,value]of Object.entries(files)){
 const safe=sanitiseDonorAsset(value,context);
 if(value.records)for(let i=0;i<value.records.length;i++){
  const before=value.records[i],after=safe.records[i];
  if(before.title!==after.title)after.title_privacy_filtered=true;
  // HTML follows main's publication boundary. PDF source text remains held
  // if that boundary would alter it; the body privacy holds are independent.
  if(before.text!==after.text||before.body!==after.body)
   throw Error('QAO verbatim source privacy hold required');
  for(let n=0;n<(before.recommendations||[]).length;n++){
   if(JSON.stringify(before.recommendations[n])!==JSON.stringify(after.recommendations[n])){
    if((before.recommendations[n].provenance||'html')!=='html')
     throw Error('QAO verbatim source privacy hold required');
    after.recommendations[n].privacy_filtered=true;
   }
  }
 }
 files[name]=safe;
}
process.stdout.write(JSON.stringify(files));

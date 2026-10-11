// The same publication boundary as other static exports; no raw identities in diagnostics.
import {readFileSync} from 'node:fs';
import {readPublicationContext,sanitiseDonorAsset} from './withhold_donor_assets.mjs';
const files=JSON.parse(readFileSync(0,'utf8')),context=readPublicationContext();
for(const[name,value]of Object.entries(files)){
 const safe=sanitiseDonorAsset(value,context);
 if(value.records)for(let i=0;i<value.records.length;i++){
  const before=value.records[i],after=safe.records[i];
  if(before.title!==after.title)after.title_privacy_filtered=true;
  // An authorised verbatim record must be held, never silently rewritten.
  if(before.text!==after.text||before.body!==after.body||JSON.stringify(before.recommendations)!==JSON.stringify(after.recommendations))
   throw Error('QAO verbatim source privacy hold required');
 }
 files[name]=safe;
}
process.stdout.write(JSON.stringify(files));

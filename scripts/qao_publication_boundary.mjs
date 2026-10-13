// The same publication boundary as other static exports; no raw identities in diagnostics.
import {readFileSync} from 'node:fs';
import {readPublicationContext,sanitiseDonorAsset} from './withhold_donor_assets.mjs';
const files=JSON.parse(readFileSync(0,'utf8')),context=readPublicationContext();
// Keep the shared identity boundary, with a neutral label in this catalogue.
function neutralLabels(value){
 if(typeof value==='string')return value.replace(/Donor \d+ \(name withheld\)/g,'Name withheld');
 if(Array.isArray(value))return value.map(neutralLabels);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,neutralLabels(v)]));
 return value;
}
for(const[name,value]of Object.entries(files)){
 const safe=neutralLabels(sanitiseDonorAsset(value,context));
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

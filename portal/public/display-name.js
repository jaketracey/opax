/* A name filed in capitals ("BACK TO WORK", "ST GEORGE") reads in title case,
   lower-casing the small words after the first; a mixed-case name passes
   through. A word stays in capitals only when it is a known acronym (the list
   below), a roman numeral (II, VIII, XIII), a single letter ("Vitamin D") or a
   code with digits or dots in it (AP2.0, COVID-19). Short ordinary words are
   words: "St", "Mt", "New", "Dam". */
const ACRONYMS=new Set([
 // Shared with display() in scripts/export_aec_extras.py.
 'ATO','NAB','ANZ','CBA','NSW','QLD','VIC','WA','SA','NT','ACT','TAS','ALP','LNP','CFMEU','CEPU','CPSU','AMWU','AWU','ANMF','ASU','ETU','MUA','TWU','HSU','NTEU','SDA','ACTU','RSL','GST','ABN','ACN','MAPS','COVID',
 // Named in the grant and program records.
 'TAFE','NAIDOC','RFDS','RRMBS','CCTV','FIFA','WC','ILUA','ANZPAA','NIFS','VET','YJ','SBP','SB','DFO','DFRA','QCS','QPS','TSCSRP','CSIRO','NDIS','ABC','CBD','FM','BC','DC','MC','MDC',
]);
const SMALL_WORDS=new Set(['of','and','the','for','in','at','on','to','as','by']);
// I to XXXIX: letters a roman numeral can be, in an order only a numeral takes.
const ROMAN=/^(?=[IVX]{2})X{0,3}(?:IX|IV|V?I{0,3})$/;
// A letter after a one-letter prefix and an apostrophe is a name's capital (O'Connor); after a longer word it is not (Don't).
const titleWord=word=>word.toLowerCase().replace(/(^|[^a-z'’])([a-z])/g,(m,before,letter)=>before+letter.toUpperCase())
 .replace(/(^|[^A-Za-z])([A-Z])(['’])([a-z])/g,(m,before,first,mark,letter)=>before+first+mark+letter.toUpperCase());
export function displayName(name){
 const text=String(name ?? '').replace(/\s+/g,' ').trim();
 if(!/[A-Z]/.test(text) || text!==text.toUpperCase() || !text.includes(' '))return text;
 return text.split(' ').map((word,i)=>{
  if(/[\d.]/.test(word))return word;
  const core=word.replace(/[^A-Z]/g,'');
  if(core.length<=1 || ACRONYMS.has(core) || ROMAN.test(core))return word;
  // A hyphenated pair ("RFDS-RRMBS", "SBP-BUS") is read part by part.
  if(/[-/]/.test(word))return word.split(/([-/])/).map(part=>/[-/]/.test(part) || !part ? part : displayName(`${part} X`).slice(0,-2)).join('');
  if(SMALL_WORDS.has(core.toLowerCase()) && i>0)return word.toLowerCase();
  return titleWord(word);
 }).join(' ');
}


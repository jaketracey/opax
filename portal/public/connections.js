/* Connections in the record: organisations, programs and places named across
   the collected records, each opening to its source excerpts. Mounted by
   app.js into #panel-connections when /connections opens (deep links carry
   ?entity=, ?q= and ?kind=), and destroyed when the route leaves. */
import {evidenceHTML,nameKey} from './evidence.js';

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

// A phone reads the list in the page's own flow, twenty rows at a time, and opens
// a connection as the next view; a wider screen keeps the list beside the open one.
const PHONE='(max-width: 700px)';
const phone=()=>typeof matchMedia==='function' && matchMedia(PHONE).matches;
const PAGE={phone:20,wide:40};

export function mountConnections(root, helpers = {}) {
 const list=root.querySelector('#connection-list'), detail=root.querySelector('#connection-detail');
 const query=root.querySelector('#connection-search'),kind=root.querySelector('#connection-kind'),status=root.querySelector('#connection-status');
 const params=helpers.params || new URLSearchParams();
 const controller=new AbortController();
 // loaded: the index has answered. Until then a typed search must not count an empty list as "0 connections".
 let entries=[],loaded=false,selected=0,active=true,currentId='',loader=null,limit=phone()?PAGE.phone:PAGE.wide,found=[];
 // Show 20 more: sits under the list on a phone while the list holds more.
 const more=document.createElement('button');more.type='button';more.className='ui-button connection-more';more.hidden=true;
 list.after(more);
 const alive=()=>active && root.isConnected;
 function address(entity){
  const next=new URLSearchParams();
  if(query.value.trim())next.set('q',query.value.trim());
  if(kind.value)next.set('kind',kind.value);
  if(entity)next.set('entity',entity);
  const qs=next.toString();
  helpers.onAddress?.(qs?`?${qs}`:'');
 }
 function render(){
  if(!loaded)return;
  const term=nameKey(query.value);
  found=entries.filter(e=>(!kind.value || e.kind===kind.value) && (!term || nameKey(e.name).includes(term) || e.abn?.includes(term)));
  // A wide screen shows the first 40 as before; a phone adds twenty at a time.
  const shown=phone()?limit:PAGE.wide;
  status.textContent=`${found.length.toLocaleString('en-AU')} connections${found.length>shown?` · Showing the first ${shown}. Search to narrow the list.`:''}`;
  list.replaceChildren();
  const left=found.length-shown;
  more.hidden=!(phone() && left>0);
  more.textContent=`Show ${Math.min(PAGE.phone,Math.max(left,0))} more`;
  for(const entry of found.slice(0,shown)){
   // One row per connection (ui-list); the open one is marked current.
   const item=document.createElement('li');
   const button=document.createElement('button');button.type='button';button.className='connection-choice';button.dataset.entity=entry.id;
   if(entry.id===currentId)button.setAttribute('aria-current','true');
   const label=document.createElement('span');label.className='ui-row-name';label.textContent=displayName(entry.name);
   const meta=document.createElement('span');meta.className='ui-row-meta';meta.textContent=`${entry.records.toLocaleString('en-AU')} records · ${entry.kind}`;
   button.append(label,meta);button.addEventListener('click',()=>open(entry));item.append(button);list.append(item);
  }
  quickPicks(found);
 }
 function choose(id){
  currentId=id;
  for(const button of list.querySelectorAll('.connection-choice')){if(button.dataset.entity===id)button.setAttribute('aria-current','true');else button.removeAttribute('aria-current');}
 }
 // Until one is chosen the column beside the list is a starting card (ui-card):
 // the house animal standing still, what the column will hold, and the top of
 // the current list as quick picks. A phone sets it above the list as a short
 // invitation (style.css).
 function emptyDetail(){
  const card=document.createElement('div');card.className='ui-card connection-detail-empty';
  const art=document.createElement('div');art.className='connection-detail-art';
  const title=document.createElement('h2');title.className='ui-card-title';title.textContent='Pick a connection';
  const line=document.createElement('p');line.className='ui-card-text';line.textContent='See the speeches, releases and grant records that name it.';
  const picks=document.createElement('div');picks.className='ui-actions connection-picks';picks.setAttribute('role','group');picks.setAttribute('aria-label','Most recorded connections');
  card.append(art,title,line,picks);detail.replaceChildren(card);detail.hidden=false;
  // The loaders' wombat in its still pose; style.css hides it while the list's walking one holds the index's place.
  wombat.then(mod=>{if(mod && alive() && art.isConnected){mod.mountWombat(art,{label:'',animal:'wombat'});art.lastElementChild?.classList.add('wb-still');}});
 }
 // A quick pick opens its connection exactly as its row in the list does.
 function quickPicks(found){
  const picks=detail.querySelector('.connection-picks');if(!picks)return;
  picks.replaceChildren(...found.slice(0,3).map(entry=>{
   const button=document.createElement('button');button.type='button';button.className='ui-chip';button.dataset.entity=entry.id;button.textContent=displayName(entry.name);
   button.addEventListener('click',()=>open(entry));return button;
  }));
 }
 async function open(entry){
  const request=++selected;choose(entry.id);detail.hidden=false;
  // A quick pick leaves with the card it sits on: hold focus on the column until its heading arrives.
  if(detail.contains(document.activeElement))detail.focus({preventScroll:true});
  detail.textContent='Opening source excerpts…';
  try{
   const response=await fetch(`/evidence/${entry.id.slice(0,2)}.json`,{signal:controller.signal});if(!response.ok)throw new Error();
   const data=await response.json();if(request!==selected || !alive())return;
   const record=data.entries?.[entry.id];if(!record)throw new Error();
   detail.replaceChildren();const title=document.createElement('h2');title.tabIndex=-1;title.textContent=displayName(entry.name);
   // On a phone the open connection is the next view: the list steps aside, and this goes back to it.
   const back=document.createElement('button');back.type='button';back.className='ui-button connection-back';back.dataset.variant='quiet';back.textContent='All connections';
   back.addEventListener('click',()=>closeReading(entry.id));
   detail.append(back,title);
   const content=document.createElement('div');content.innerHTML=evidenceHTML(record);detail.append(content);
   address(entry.id);
   if(phone()){root.classList.add('connections-reading');detail.scrollIntoView?.({behavior:'instant',block:'start'});}
   title.focus({preventScroll:true});
  }catch{if(request===selected && alive())detail.textContent='The source excerpts could not be loaded. Select the connection to try again.';}
 }
 // Back from a phone's open connection to the list, at the row it came from.
 function closeReading(id){
  selected++;currentId='';root.classList.remove('connections-reading');
  emptyDetail();quickPicks(found);choose('');address(null);
  const row=[...list.querySelectorAll('.connection-choice')].find(button=>button.dataset.entity===id);
  if(row){row.scrollIntoView?.({block:'center'});row.focus({preventScroll:true});}
 }
 more.addEventListener('click',()=>{
  const first=limit;limit+=PAGE.phone;render();
  // The reader's place moves to the first of the rows just added.
  list.querySelectorAll('.connection-choice')[first]?.focus();
 });
 const onInput=()=>{limit=PAGE.phone;render();address(null);};
 const onKind=()=>{limit=PAGE.phone;render();address(null);};
 query.addEventListener('input',onInput);kind.addEventListener('change',onKind);
 query.value=params.get('q') || '';kind.value=params.get('kind') || '';
 // One copy of the shared animal: the list's loader walks, the starting card's stands still.
 const wombat=import('/wombat.js?v=cb89a88dad').catch(()=>null);
 status.textContent='Opening the records…';list.replaceChildren();emptyDetail();
 // The shared animal holds the list's place while the index loads; the status line announces it.
 const slot=document.createElement('li');slot.className='connection-loader';slot.setAttribute('aria-hidden','true');list.append(slot);
 wombat.then(mod=>{if(mod && alive() && !loaded && slot.isConnected)loader=mod.mountWombat(slot,{label:'',phase:-5.5});});
 const settle=()=>{loader?.destroy();loader=null;slot.remove();};
 (async()=>{
  try{
   const response=await fetch('/evidence/index.json',{signal:controller.signal});if(!response.ok)throw new Error();
   const data=await response.json();if(!alive())return;
   entries=(data.entities||[]).sort((a,b)=>b.records-a.records || a.name.localeCompare(b.name));
   loaded=true;settle();render();const initial=entries.find(e=>e.id===params.get('entity'));if(initial)open(initial);
  }catch{if(alive()){settle();status.textContent='Connection records are unavailable. Please try again later.';detail.hidden=true;}}
 })();
 return {
  destroy(){
   active=false;controller.abort();selected++;settle();
   query.removeEventListener('input',onInput);kind.removeEventListener('change',onKind);
   list.replaceChildren();detail.replaceChildren();detail.hidden=true;
   more.remove();root.classList.remove('connections-reading');
  },
 };
}

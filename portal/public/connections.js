/* Connections in the record: organisations, programs and places named across
   the collected records, each opening to its source excerpts. Mounted by
   app.js into #panel-connections when /connections opens (deep links carry
   ?entity=, ?q= and ?kind=), and destroyed when the route leaves. */
import {evidenceHTML,nameKey} from './evidence.js';

export function mountConnections(root, helpers = {}) {
 const list=root.querySelector('#connection-list'), detail=root.querySelector('#connection-detail');
 const query=root.querySelector('#connection-search'),kind=root.querySelector('#connection-kind'),status=root.querySelector('#connection-status');
 const params=helpers.params || new URLSearchParams();
 const controller=new AbortController();
 let entries=[],selected=0,active=true;
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
  const term=nameKey(query.value);
  const found=entries.filter(e=>(!kind.value || e.kind===kind.value) && (!term || nameKey(e.name).includes(term) || e.abn?.includes(term)));
  status.textContent=`${found.length.toLocaleString('en-AU')} connections${found.length>40?' · Showing the first 40. Search to narrow the list.':''}`;
  list.replaceChildren();
  for(const entry of found.slice(0,40)){
   const button=document.createElement('button');button.type='button';button.className='connection-choice';
   const label=document.createElement('strong');label.textContent=entry.name;
   const meta=document.createElement('span');meta.textContent=`${entry.records.toLocaleString('en-AU')} records · ${entry.kind}`;
   button.append(label,meta);button.addEventListener('click',()=>open(entry));list.append(button);
  }
 }
 async function open(entry){
  const request=++selected;detail.hidden=false;detail.textContent='Opening source excerpts…';
  try{
   const response=await fetch(`/evidence/${entry.id.slice(0,2)}.json`,{signal:controller.signal});if(!response.ok)throw new Error();
   const data=await response.json();if(request!==selected || !alive())return;
   const record=data.entries?.[entry.id];if(!record)throw new Error();
   detail.replaceChildren();const title=document.createElement('h2');title.textContent=entry.name;detail.append(title);
   const content=document.createElement('div');content.innerHTML=evidenceHTML(record);detail.append(content);
   address(entry.id);detail.focus({preventScroll:true});
   if(matchMedia('(max-width: 700px)').matches)detail.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});
  }catch{if(request===selected && alive())detail.textContent='The source excerpts could not be loaded. Select the connection to try again.';}
 }
 const onInput=()=>{render();address(null);};
 const onKind=()=>{render();address(null);};
 query.addEventListener('input',onInput);kind.addEventListener('change',onKind);
 query.value=params.get('q') || '';kind.value=params.get('kind') || '';
 status.textContent='Opening the records…';list.replaceChildren();detail.hidden=true;detail.replaceChildren();
 (async()=>{
  try{
   const response=await fetch('/evidence/index.json',{signal:controller.signal});if(!response.ok)throw new Error();
   const data=await response.json();if(!alive())return;
   entries=(data.entities||[]).sort((a,b)=>b.records-a.records || a.name.localeCompare(b.name));
   render();const initial=entries.find(e=>e.id===params.get('entity'));if(initial)open(initial);
  }catch{if(alive())status.textContent='Connection records are unavailable. Please try again later.';}
 })();
 return {
  destroy(){
   active=false;controller.abort();selected++;
   query.removeEventListener('input',onInput);kind.removeEventListener('change',onKind);
   list.replaceChildren();detail.replaceChildren();detail.hidden=true;
  },
 };
}

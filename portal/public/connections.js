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
 let entries=[],selected=0,active=true,currentId='';
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
   // One row per connection (ui-list); the open one is marked current.
   const item=document.createElement('li');
   const button=document.createElement('button');button.type='button';button.className='connection-choice';button.dataset.entity=entry.id;
   if(entry.id===currentId)button.setAttribute('aria-current','true');
   const label=document.createElement('span');label.className='ui-row-name';label.textContent=entry.name;
   const meta=document.createElement('span');meta.className='ui-row-meta';meta.textContent=`${entry.records.toLocaleString('en-AU')} records · ${entry.kind}`;
   button.append(label,meta);button.addEventListener('click',()=>open(entry));item.append(button);list.append(item);
  }
 }
 function choose(id){
  currentId=id;
  for(const button of list.querySelectorAll('.connection-choice')){if(button.dataset.entity===id)button.setAttribute('aria-current','true');else button.removeAttribute('aria-current');}
 }
 // Until one is chosen the column beside the list says what it will hold.
 function emptyDetail(){
  const note=document.createElement('p');note.className='ui-empty connection-detail-empty';
  note.textContent='Choose a connection to read the source excerpts that name it.';
  detail.replaceChildren(note);detail.hidden=false;
 }
 async function open(entry){
  const request=++selected;choose(entry.id);detail.hidden=false;detail.textContent='Opening source excerpts…';
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
 status.textContent='Opening the records…';list.replaceChildren();emptyDetail();
 (async()=>{
  try{
   const response=await fetch('/evidence/index.json',{signal:controller.signal});if(!response.ok)throw new Error();
   const data=await response.json();if(!alive())return;
   entries=(data.entities||[]).sort((a,b)=>b.records-a.records || a.name.localeCompare(b.name));
   render();const initial=entries.find(e=>e.id===params.get('entity'));if(initial)open(initial);
  }catch{if(alive()){status.textContent='Connection records are unavailable. Please try again later.';detail.hidden=true;}}
 })();
 return {
  destroy(){
   active=false;controller.abort();selected++;
   query.removeEventListener('input',onInput);kind.removeEventListener('change',onKind);
   list.replaceChildren();detail.replaceChildren();detail.hidden=true;
  },
 };
}

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
  quickPicks(found);
 }
 function choose(id){
  currentId=id;
  for(const button of list.querySelectorAll('.connection-choice')){if(button.dataset.entity===id)button.setAttribute('aria-current','true');else button.removeAttribute('aria-current');}
 }
 // Until one is chosen the column beside the list is a starting card (ui-card):
 // the house animal standing still, what the column will hold, and the top of
 // the current list as quick picks. A phone shows the list alone (style.css).
 function emptyDetail(){
  const card=document.createElement('div');card.className='ui-card connection-detail-empty';
  const art=document.createElement('div');art.className='connection-detail-art';
  const title=document.createElement('h2');title.className='ui-card-title';title.textContent='Pick a connection';
  const line=document.createElement('p');line.className='ui-card-text';line.textContent='See the speeches, releases and grant records that name it.';
  const picks=document.createElement('div');picks.className='ui-actions connection-picks';picks.setAttribute('role','group');picks.setAttribute('aria-label','Most recorded connections');
  card.append(art,title,line,picks);detail.replaceChildren(card);detail.hidden=false;
  helpers.drawAnimal?.(art);
 }
 // A quick pick opens its connection exactly as its row in the list does.
 function quickPicks(found){
  const picks=detail.querySelector('.connection-picks');if(!picks)return;
  picks.replaceChildren(...found.slice(0,3).map(entry=>{
   const button=document.createElement('button');button.type='button';button.className='ui-chip';button.dataset.entity=entry.id;button.textContent=entry.name;
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
   detail.replaceChildren();const title=document.createElement('h2');title.tabIndex=-1;title.textContent=entry.name;detail.append(title);
   const content=document.createElement('div');content.innerHTML=evidenceHTML(record);detail.append(content);
   address(entry.id);title.focus({preventScroll:true});
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

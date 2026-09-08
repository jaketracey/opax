import {evidenceHTML,nameKey} from './evidence.js';
const list=document.querySelector('#connection-list'), detail=document.querySelector('#connection-detail');
const query=document.querySelector('#connection-search'),kind=document.querySelector('#connection-kind'),status=document.querySelector('#connection-status');
let entries=[],selected=0;
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
  const response=await fetch(`/evidence/${entry.id.slice(0,2)}.json`);if(!response.ok)throw new Error();
  const data=await response.json();if(request!==selected)return;
  const record=data.entries?.[entry.id];if(!record)throw new Error();
  detail.replaceChildren();const title=document.createElement('h2');title.textContent=entry.name;detail.append(title);
  const content=document.createElement('div');content.innerHTML=evidenceHTML(record);detail.append(content);
  history.replaceState(null,'',`?entity=${encodeURIComponent(entry.id)}`);detail.focus({preventScroll:true});
  if(matchMedia('(max-width: 700px)').matches)detail.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});
 }catch{if(request===selected)detail.textContent='The source excerpts could not be loaded. Select the connection to try again.';}
}
query.addEventListener('input',render);kind.addEventListener('change',render);
try{
 const response=await fetch('/evidence/index.json');if(!response.ok)throw new Error();
 const data=await response.json();entries=(data.entities||[]).sort((a,b)=>b.records-a.records || a.name.localeCompare(b.name));
 render();const initial=entries.find(e=>e.id===new URLSearchParams(location.search).get('entity'));if(initial)open(initial);
}catch{status.textContent='Connection records are unavailable. Please try again later.';}

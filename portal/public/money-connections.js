import {isOrganisationDonor} from './donor-entity.js?v=2b8d45a50d';
import {parseQuery, serializeQuery} from './datatable.js?v=793882f55b';
import {subjectUrl} from './canonical-urls.js?v=225d5915ea';
import {moneyFlowType, filterMoneyEdges, readMoneyFilters} from './money-records.js?v=ia-ux-20260908-2';

const labels={receipts:'Political receipts',contracts:'Contract values',grants:'Grant awards'};
const keys=new Set(['type','from','to','value','records','years','receipts','contracts','grants']);
export function filterMoneyConnectionView(graph,params) {
  const focus=params.get('focus');
  return {...graph,edges:filterMoneyEdges(graph,readMoneyFilters(params)).filter(e=>!focus || e.source===focus || e.target===focus)};
}

/** Build only public rows, before the shared core can derive facets or exports.
 * Years are display ranges, so use the contract's text type (no new formatter).
 * @returns {import('./datatable.js?v=793882f55b').DataTableConfig} */
export function moneyConnectionsConfig(graph, privacyCheck) {
  const nodes=new Map(graph.nodes.map(n=>[n.id,n]));
  const rows=[], hidden=new Set(), totals={receipts:0,contracts:0,grants:0};
  let hiddenRecords=0;
  const types=new Set();
  for(const edge of graph.edges) {
    const from=nodes.get(edge.source), to=nodes.get(edge.target), type=moneyFlowType(edge,nodes);
    if(!type)continue;
    types.add(type);
    const donors=[from,to].filter(n=>n.kind==='donor');
    const withheld=donors.filter(n=>/^donor:withheld-/.test(n.id) || !isOrganisationDonor(n));
    if(withheld.length){for(const node of withheld)hidden.add(node.id);totals[type]+=edge.total;hiddenRecords+=edge.count;continue;}
    const entity=to;
    rows.push({type:labels[type],from:from.label,to:to.label,value:edge.total,records:edge.count,
      years:edge.firstYear?edge.firstYear===edge.lastYear?String(edge.firstYear):`${edge.firstYear}–${edge.lastYear || edge.firstYear}`:'Undated',
      donorEndpoints:donors.map(n=>isOrganisationDonor({label:n.label})?{label:n.label}:{label:n.label,aliases:n.aliases || []}),
      receipts:type==='receipts'?edge.total:undefined,contracts:type==='contracts'?edge.total:undefined,grants:type==='grants'?edge.total:undefined,
      focusId:String(graph.nodes.indexOf(entity))});
  }
  if(hidden.size)rows.push({aggregate:{kind:'individual-donors',count:hidden.size,label:'Donors not named'},
    value:types.size===1?totals[[...types][0]]:undefined,records:hiddenRecords,...totals});
  rows.sort((a,b)=>(b.value || 0)-(a.value || 0));
  const values=types.size>1?Object.keys(totals).filter(type=>types.has(type)).map(key=>({key,label:labels[key],type:'money',facet:'range',bar:true,format:'compact'}))
    :[{key:'value',label:'Value',type:'money',facet:'range',bar:true,format:'compact'}];
  return {id:'money-connections',caption:'Connections matching the map filters',pageType:'money',privacy:'donors',urlKey:'c',...(privacyCheck?{privacyCheck}:{}),
    rows,pageSize:50,defaultSort:{key:types.size>1?(types.has('contracts')?'contracts':[...types][0]):'value',dir:'desc'},density:'comfortable',
    columns:[
      {key:'type',label:'Type',type:'category',facet:'chips',hideWhenConstant:true},
      {key:'from',label:'From',type:'category',facet:'multi',hideWhenConstant:true},
      {key:'to',label:'To',type:'text',facet:'multi',hideWhenConstant:false,primary:true},
      ...values,
      {key:'records',label:'Records',type:'count',facet:'range'},
      {key:'years',label:'Years',type:'text'},
    ],primaryLink:row=>{
      if(row.aggregate)return null;
      const entity=graph.nodes[Number(row.focusId)];
      return entity?.profileUrl?.startsWith('/subject/')?entity.profileUrl
        :entity && ['donor','party','agency','supplier'].includes(entity.kind)?subjectUrl(entity.kind,entity.label):null;
    },
    actions:[{icon:'⌖',label:'Focus in map',href:row=>row.aggregate?null:`#money-focus=${encodeURIComponent(row.focusId)}`}],
    export:{filename:'opax-map-connections.csv'}};
}

/** Use the shared server index; never derive or publish a browser name index. */
export function cleanMoneyConnectionsParams(params, privacyCheck) {
  const clean=new URLSearchParams(params), raw=parseQuery(params,'c');
  const result=cleanMoneyConnectionsQuery(raw,privacyCheck);
  for(const key of [...clean.keys()])if(key.startsWith('c.'))clean.delete(key);
  for(const [key,value] of new URLSearchParams(serializeQuery(result.query,'c')))clean.set(key,value);
  let blocked=result.blocked;
  for(const key of ['q','focus'])if(clean.has(key) && privacyCheck(clean.get(key)) !== true){clean.delete(key);blocked=true;}
  return {params:clean,blocked};
}
export function cleanMoneyConnectionsQuery(query, privacyCheck) {
  const safe=value=>{try{return privacyCheck(value) === true;}catch{return false;}};
  const blocked=Boolean(query.q && !safe(query.q)) || Object.values(query.filters || {}).some(v=>Array.isArray(v) && v.some(value=>!safe(value)));
  const filters=Object.fromEntries(Object.entries(query.filters || {}).filter(([key])=>keys.has(key)).map(([key,value])=>[key,Array.isArray(value)?value.filter(safe):value]).filter(([,value])=>!Array.isArray(value) || value.length));
  return {query:{...query,q:query.q && safe(query.q)?query.q.slice(0,200):undefined,filters},blocked};
}

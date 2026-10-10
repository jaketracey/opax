import {isOrganisationDonor, withheldPhrases, namesWithheldPhrase} from './donor-entity.js?v=2b8d45a50d';
import {subjectUrl} from './canonical-urls.js?v=225d5915ea';
import {moneyFlowType, filterMoneyEdges, readMoneyFilters} from './money-records.js?v=ia-ux-20260908-2';

const labels={receipts:'Political receipts',contracts:'Contract values',grants:'Grant awards'};
const keys=new Set(['type','from','to','value','records','years']);
const guards=new WeakMap();
function queryGuard(graph) {
  if(!guards.has(graph)) {
    const phrases=withheldPhrases([graph],[]);
    const ids=new Set(graph.nodes.filter(n=>n.kind==='donor' && !isOrganisationDonor(n)).map(n=>n.id));
    guards.set(graph,value=>ids.has(value) || namesWithheldPhrase(phrases,`money ${value}`));
  }
  return guards.get(graph);
}
export function filterMoneyConnectionView(graph,params) {
  const focus=params.get('focus');
  return {...graph,edges:filterMoneyEdges(graph,readMoneyFilters(params)).filter(e=>!focus || e.source===focus || e.target===focus)};
}

/** Build only public rows, before the shared core can derive facets or exports.
 * Years are display ranges, so use the contract's text type (no new formatter).
 * @returns {import('./datatable.js').DataTableConfig} */
export function moneyConnectionsConfig(graph) {
  const nodes=new Map(graph.nodes.map(n=>[n.id,n]));
  const rows=[];
  for(const edge of graph.edges) {
    const from=nodes.get(edge.source), to=nodes.get(edge.target), type=moneyFlowType(edge,nodes);
    if(!type || [from,to].some(n=>n.kind==='donor' && !isOrganisationDonor(n)))continue;
    const entity=to;
    const href=entity.profileUrl?.startsWith('/subject/')?entity.profileUrl
      : ['donor','party','agency','supplier'].includes(entity.kind)?subjectUrl(entity.kind,entity.label):null;
    rows.push({type:labels[type],from:from.label,to:to.label,value:edge.total,records:edge.count,
      years:edge.firstYear?edge.firstYear===edge.lastYear?String(edge.firstYear):`${edge.firstYear}–${edge.lastYear || edge.firstYear}`:'Undated',
      entityId:entity.id,entityHref:href,focusId:entity.id});
  }
  rows.sort((a,b)=>b.value-a.value);
  return {id:'money-connections',caption:'Connections matching the map filters',pageType:'money',privacy:'donors',urlKey:'c',
    rows,pageSize:50,defaultSort:{key:'value',dir:'desc'},density:'comfortable',
    columns:[
      {key:'type',label:'Type',type:'category',facet:'chips',hideWhenConstant:true},
      {key:'from',label:'From',type:'category',facet:'multi',hideWhenConstant:true},
      {key:'to',label:'To',type:'text',facet:'multi',hideWhenConstant:false,primary:true},
      {key:'value',label:'Value',type:'money',facet:'range',bar:true,format:'compact'},
      {key:'records',label:'Records',type:'count',facet:'range'},
      {key:'years',label:'Years',type:'text'},
    ],primaryLink:row=>row.entityHref,
    actions:[{icon:'focus',label:'Focus in map',href:row=>`#money-focus=${encodeURIComponent(row.focusId)}`}],
    export:{filename:'opax-map-connections.csv'}};
}

/** Reject private queries without repeating them in controls, CSV or URL state.
 * The withheld set stays in this closure; it is never attached to table rows.
 * Unknown table parameters also disappear rather than being echoed by a core.
 * @returns {{params: URLSearchParams, blocked: boolean}} */
export function cleanMoneyConnectionsParams(params, graph) {
  const clean=new URLSearchParams(params), privateValue=queryGuard(graph);
  let blocked=false;
  for(const [key,value] of [...clean]) {
    if(!key.startsWith('c.'))continue;
    const filter=/^c\.f\.(type|from|to|value|records|years)(?:\.(?:min|max))?$/.test(key);
    const recognised=filter || ['c.q','c.sort','c.page','c.pageSize'].includes(key);
    if(!recognised || privateValue(value)) {clean.delete(key);blocked ||= privateValue(value);continue;}
    if(key==='c.q')clean.set(key,value.slice(0,200));
    if(key==='c.sort' && !/^(type|from|to|value|records|years):(asc|desc)$/.test(value))clean.delete(key);
    if(['c.page','c.pageSize'].includes(key) && !/^[1-9]\d{0,3}$/.test(value))clean.delete(key);
  }
  for(const key of ['q','focus'])if(clean.has(key) && privateValue(clean.get(key))) {clean.delete(key);blocked=true;}
  return {params:clean,blocked};
}

/** Defence at the query boundary for core and temporary preview alike.
 * @param {import('./datatable.js').Query} query */
export function cleanMoneyConnectionsQuery(query, graph) {
  const privateValue=queryGuard(graph);
  if(privateValue(query.q || '') || Object.values(query.filters || {}).some(v=>Array.isArray(v) && v.some(privateValue)))return {query:{},blocked:true};
  const filters=Object.fromEntries(Object.entries(query.filters || {}).filter(([key])=>keys.has(key)));
  return {query:{...query,q:String(query.q || '').slice(0,200),filters},blocked:false};
}

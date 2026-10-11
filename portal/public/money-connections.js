import {isOrganisationDonor} from './donor-entity.js?v=ebb2c972d5';
import {applyQuery} from './datatable.js?v=d10539039f';
import {subjectUrl} from './canonical-urls.js?v=225d5915ea';
import {moneyFlowType, filterMoneyEdges, readMoneyFilters} from './money-records.js?v=ia-ux-20260908-2';

import {queryValues} from './datatable-query.js?v=6dd55aab38';
import {createTablePrivacyValidator} from './datatable-privacy.js?v=de6469a26a';

const labels={receipts:'Political receipts',contracts:'Contract values',grants:'Grant awards'};
export function filterMoneyConnectionView(graph,params) {
  const focus=params.get('focus');
  return {...graph,edges:filterMoneyEdges(graph,readMoneyFilters(params)).filter(e=>!focus || e.source===focus || e.target===focus)};
}

/** Build only public rows, before the shared core can derive facets or exports.
 * Years are display ranges, so use the contract's text type (no new formatter).
 * @returns {import('./datatable.js?v=d10539039f').DataTableConfig} */
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
    const entity=to;
    const row={type:labels[type],from:from.label,to:to.label,value:edge.total,records:edge.count,
      years:edge.firstYear?edge.firstYear===edge.lastYear?String(edge.firstYear):`${edge.firstYear}–${edge.lastYear || edge.firstYear}`:'Undated',
      donorEndpoints:donors.map(n=>isOrganisationDonor({label:n.label})?{label:n.label}:{label:n.label,aliases:n.aliases || []}),
      receipts:type==='receipts'?edge.total:undefined,contracts:type==='contracts'?edge.total:undefined,grants:type==='grants'?edge.total:undefined,
      focusId:String(graph.nodes.indexOf(entity))};
    // Delegate the whole-row/scalar decision to the core, including recipients
    // and suppliers in the complete financial registry. Use it for totals too.
    const policy={id:'money-policy',pageType:'money',caption:'',privacy:'donors',privacyCheck:privacyCheck || (()=>true),columns:[],rows:[row]};
    if(withheld.length || applyQuery([row],policy,{}).total !== 1){
      const identities=withheld.length?withheld:[from,to].filter(n=>privacyCheck?.(n.label) !== true);
      for(const node of identities.length?identities:[to])hidden.add(node.id);
      totals[type]+=edge.total;hiddenRecords+=edge.count;continue;
    }
    rows.push(row);
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

/** Resolve the core's shared validation before building rows and their aggregate.
 * The browser never constructs a second registry or identity predicate. */
export async function prepareMoneyConnectionsConfig(graph, validator=createTablePrivacyValidator({fetch:(...args)=>globalThis.fetch(...args)})) {
  const candidates=moneyConnectionsConfig(graph,()=>true);
  await validator.permitSet(candidates.rows.flatMap(row=>[JSON.stringify(row),...queryValues(row)]));
  const config=moneyConnectionsConfig(graph,validator.approved);
  // The neutral aggregate introduces new totals. Validate them through the same
  // transport during hydration rather than mistaking uncached values for rejects.
  config.privacyCheck=validator.permit;
  return config;
}

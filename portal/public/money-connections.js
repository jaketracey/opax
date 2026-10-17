import {donorDisclosure} from './donor-disclosure.js?v=800932e746';
import {subjectUrl} from './canonical-urls.js?v=dce94beab5';
import {moneyFlowType, filterMoneyEdges, readMoneyFilters} from './money-records.js';

const labels={receipts:'Political receipts',contracts:'Contract values',grants:'Grant awards'};
export function filterMoneyConnectionView(graph,params) {
  const focus=params.get('focus');
  return {...graph,edges:filterMoneyEdges(graph,readMoneyFilters(params)).filter(e=>!focus || e.source===focus || e.target===focus)};
}

/** Source names and amounts are preserved; only confident donor matches link.
 * @returns {import('./datatable.js?v=ab73c21d90').DataTableConfig} */
export function moneyConnectionsConfig(graph) {
  const nodes=new Map(graph.nodes.map(n=>[n.id,n]));
  const rows=[],types=new Set();
  // Rows carry what the table shows; return references are in the table API and its CSV.
  const endpoint=node=>node.kind==='donor' ? donorDisclosure(node)
    :{name:node.label,href:node.profileUrl?.startsWith('/subject/')?node.profileUrl
      :['party','agency','supplier'].includes(node.kind)?subjectUrl(node.kind,node.label):null};
  for(const edge of graph.edges) {
    const from=nodes.get(edge.source),to=nodes.get(edge.target),type=moneyFlowType(edge,nodes);
    if(!type || !from || !to)continue;
    types.add(type);
    const a=endpoint(from),b=endpoint(to);
    rows.push({type:labels[type],from:a.name,to:b.name,from_href:a.href,to_href:b.href,
      value:edge.total,records:edge.count,
      years:edge.firstYear?edge.firstYear===edge.lastYear?String(edge.firstYear):`${edge.firstYear}–${edge.lastYear || edge.firstYear}`:'Undated',
      receipts:type==='receipts'?edge.total:undefined,contracts:type==='contracts'?edge.total:undefined,grants:type==='grants'?edge.total:undefined,
      focusId:String(graph.nodes.indexOf(to))});
  }
  rows.sort((a,b)=>(b.value || 0)-(a.value || 0));
  const values=types.size>1?Object.keys(labels).filter(type=>types.has(type)).map(key=>({key,label:labels[key],type:'money',facet:'range',bar:true,format:'compact'}))
    :[{key:'value',label:'Value',type:'money',facet:'range',bar:true,format:'compact'}];
  return {id:'money-connections',caption:'Connections matching the map filters',pageType:'money',urlKey:'c',
    rows,pageSize:50,defaultSort:{key:types.size>1?(types.has('contracts')?'contracts':[...types][0]):'value',dir:'desc'},density:'comfortable',
    columns:[
      {key:'type',label:'Type',type:'category',facet:'chips',hideWhenConstant:true},
      {key:'from',label:'From',type:'category',facet:'multi',hideWhenConstant:false,href:row=>row.from_href},
      {key:'to',label:'To',type:'text',facet:'multi',hideWhenConstant:false,primary:true},
      ...values,
      {key:'records',label:'Records',type:'count',facet:'range'},
      {key:'years',label:'Years',type:'text'},
    ],primaryLink:row=>row.to_href,
    actions:[{icon:'⌖',label:'Focus in map',href:row=>`#money-focus=${encodeURIComponent(row.focusId)}`}],
    export:{filename:'opax-map-connections.csv'}};
}

/** Browser and SSR use the same source-backed rows without a validation POST. */
export async function prepareMoneyConnectionsConfig(graph) { return moneyConnectionsConfig(graph); }

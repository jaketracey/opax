import {cpiMultiplier} from '../graph/cpi';
import {moneyConnectionsConfig, cleanMoneyConnectionsParams, filterMoneyConnectionView, type MoneyConnectionGraph} from '../public/money-connections.js';
import {dataTableHTML, applyQuery, parseQuery} from '../public/datatable.js';
import type {ReadAsset} from './seo-content';

/** First client-mode page without JavaScript, using the same map record semantics.
 * Hydration receives the map's actual view, including journey and legend changes. */
export async function renderMoneyConnectionsTable(url: URL, read: ReadAsset, privacyCheck: (text: string) => boolean): Promise<string> {
  const jur=url.searchParams.get('jur') || 'federal';
  const path=['qld','vic','tas'].includes(jur)?`/graph/money.${jur}.json`:'/graph/money.json';
  const graph=await read<MoneyConnectionGraph>(path);
  const clean=cleanMoneyConnectionsParams(url.searchParams,privacyCheck),params=clean.params;
  const years=graph.edges.flatMap(e=>[e.firstYear,e.lastYear]).filter((n): n is number=>typeof n==='number');
  const min=Math.min(...years),max=Math.max(...years);
  const year=(key: string,fallback: number)=>/^\d{4}$/.test(params.get(key) || '')?Math.max(min,Math.min(max,Number(params.get(key)))):fallback;
  const from=year('from',min),to=year('to',max),lo=Math.min(from,to),hi=Math.max(from,to);
  const windowed={...graph,edges:graph.edges.filter(e=>e.byYear || (e.firstYear ?? min)<=hi && (e.lastYear ?? max)>=lo).map(edge=>{
    if(!edge.byYear)return edge;
    let total=edge.undated?.[0] ?? 0,count=edge.undated?.[1] ?? 0,firstYear: number | null=null,lastYear: number | null=null;
    for(const [key,[amount,records]] of Object.entries(edge.byYear)) {
      const y=Number(key);if(y<lo || y>hi)continue;
      total+=amount*(params.get('cpi')==='1'?cpiMultiplier(y):1);count+=records;
      firstYear=firstYear===null?y:Math.min(firstYear,y);lastYear=lastYear===null?y:Math.max(lastYear,y);
    }
    return {...edge,total,count,firstYear,lastYear};
  })};
  const config=moneyConnectionsConfig(filterMoneyConnectionView(windowed,params),privacyCheck);if(clean.blocked)config.rows=[];
  const page=applyQuery(config.rows || [],config,parseQuery(params,'c'));
  return `<section class="research-records" aria-label="Money connections"><h2>Connections matching the map filters</h2><p class="fineprint mc-explainer">Aggregated connections for the map’s selected years; open an entity for its records.</p><div class="money-connections-table">${dataTableHTML(config,page)}</div></section>`;
}

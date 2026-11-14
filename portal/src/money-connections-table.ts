import {receiptGraphView, moneyYearBounds} from '../graph/receipt-view.ts';
import {receiptScopeLabel} from '../public/donor-disclosure.js';
import {moneyConnectionsConfig, filterMoneyConnectionView, type MoneyConnectionGraph} from '../public/money-connections.js';
import {dataTableHTML, applyQuery, guardTableURL} from '../public/datatable.js';
import type {ReadAsset} from './seo-content';

const escapeText=(text: string)=>text.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c] as string));

/** First client-mode page without JavaScript, using the same map record semantics.
 * Hydration receives the map's actual view, including journey and legend changes. */
export async function renderMoneyConnectionsTable(url: URL, read: ReadAsset): Promise<string> {
  // Basic query validation precedes jurisdiction, ranges and table parsing.
  const clean=guardTableURL({id:'money-connections',caption:'',pageType:'money',urlKey:'c',columns:[]},url),params=clean.url.searchParams;
  const render=(config: ReturnType<typeof moneyConnectionsConfig>, scope='') => {
    config.initialRejected=clean.rejected;
    const page=applyQuery(config.rows || [],config,clean.query);
    return `<section class="research-records" aria-label="Money connections"><h2>Connections matching the map filters</h2><p class="fineprint mc-explainer">Aggregated connections for the map’s selected years; open an entity for its records.${scope ? ` Receipts: ${escapeText(scope)}.` : ''}</p><div class="money-connections-table">${dataTableHTML(config,page,clean.url)}</div></section>`;
  };
  if(clean.rejected)return render(moneyConnectionsConfig({nodes:[],edges:[]}));
  const jur=params.get('jur') || 'federal';
  const path=['qld','vic','tas'].includes(jur)?`/graph/money.${jur}.json`:'/graph/money.json';
  // Each receipt flow read through its typed cells (each receipt once, from the party's own
  // return), as on the map, the donor page and the party page; state graphs keep their figures.
  const raw=await read<MoneyConnectionGraph>(path);
  const {min,max}=moneyYearBounds(raw);
  const year=(key: string,fallback: number)=>/^\d{4}$/.test(params.get(key) || '')?Math.max(min,Math.min(max,Number(params.get(key)))):fallback;
  const from=year('from',min),to=year('to',max);
  const bounded=params.has('from') || params.has('to');
  const measure=params.get('receipt')==='donations'?'donation_only':'all_types';
  const windowed=receiptGraphView(raw,measure,bounded?Math.min(from,to):-Infinity,bounded?Math.max(from,to):Infinity,params.get('cpi')==='1');
  const typed=windowed.edges.filter(e=>e.by_type && !e.flow && !e.grant && (e.count ?? 0)>0);
  const first=typed.map(e=>e.firstYear).filter((y): y is number=>y!=null),last=typed.map(e=>e.lastYear).filter((y): y is number=>y!=null);
  const scope=typed.length?receiptScopeLabel({typed:true,firstYear:first.length?Math.min(...first):null,lastYear:last.length?Math.max(...last):null},measure):'';
  return render(moneyConnectionsConfig(filterMoneyConnectionView(windowed,params)),scope);
}

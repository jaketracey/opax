/** Same shared table for server HTML, enhancement and CSV. No aggregation. */
import {dataTableHTML} from './datatable.js?v=a8472268da';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const phoneColumns={'Measure':'measure','Fiscal year':'fiscal_year','Value':'display_value'};
export const saBudgetPhoneColumns=Object.values(phoneColumns);
const millions=new Intl.NumberFormat('en-AU',{maximumFractionDigits:0});
export function saBudgetValue(row){
  if(row.value===null)return row.source_marker||'—';
  if(row.units==='percent')return row.value.toFixed(1)+'%';
  return (row.value<0?'−':'')+'$'+millions.format(Math.abs(row.value))+'m';
}
export const saBudgetConfig=(rows,table)=>({
  id:'sa-budget-'+table.replace('.','-'),caption:'SA Treasury · Table '+table,
  pageType:'budget',urlKey:'sa'+table.replace('.',''),pageSize:10,rows,
  columnsVisible:['measure','fiscal_year','display_value','status_as_published','amount','percentage','source_marker','locator'],
  columns:[
    {key:'measure',label:'Measure',type:'text',primary:true},
    {key:'fiscal_year',label:'Fiscal year',type:'category',facet:'multi'},
    {key:'display_value',label:'Value',type:'text',align:'end',sortable:false},
    {key:'status_as_published',label:'Estimate or actual',type:'category',facet:'multi'},
    {key:'amount',label:'Amount (AUD)',type:'money',align:'end'},
    {key:'percentage',label:'Percent',type:'text',align:'end'},
    {key:'source_marker',label:'Marker',type:'text'},
    {key:'locator',label:'Source cell',type:'text'},
    ...['measure_as_published','section_as_published','value','units','basis','consolidation','raw_value','number_format','display_divisor','workbook','sheet','cell','dataset_url','source_url','vintage','snapshot','sha256','licence','licence_url'].map(key=>({key,label:({value:'Published display value',raw_value:'Stored cell value',display_divisor:'Excel display divisor',sha256:'SHA-256',licence_url:'Licence URL',source_url:'Resource URL',dataset_url:'Dataset URL'})[key]||key.replaceAll('_',' '),type:'text'})),
  ],primaryLink:row=>row.source_url,export:{filename:'sa-budget-'+table+'-2015-16.csv'},
});

/** SA-only markup: leave the shared DataTable's rendering/defaults intact. */
export function saBudgetTableHTML(config,page,url){
  let index=0;
  return dataTableHTML(config,page,url)
    .replace(/<th\b([^>]*)>([\s\S]*?)<\/th>/g,(html,attrs,body)=>{
      const key=phoneColumns[body.replace(/<[^>]*>/g,'').trim()];
      return key?`<th${attrs} data-sa-column="${key}">${body}</th>`:html;
    })
    .replace(/(<td\b[^>]*data-label="Measure"[^>]*>)([\s\S]*?)(<\/td>)/g,(_,start,body,end)=>
      start+body+`<span class="sa-budget-status">${esc(page.rows[index++]?.status_as_published)}</span>`+end);
}

/** Reapply the scoped markup when the shared table repaints its current page. */
export function decorateSABudgetTable(root){
  for(const th of root.querySelectorAll('thead th')){
    const key=phoneColumns[th.textContent.trim()];
    if(key)th.dataset.saColumn=key;
  }
  const page=JSON.parse(root.querySelector('[data-dt-page]')?.textContent||'{"rows":[]}');
  root.querySelectorAll('tbody tr').forEach((tr,index)=>{
    const measure=tr.querySelector('[data-label="Measure"]');
    if(!measure||measure.querySelector('.sa-budget-status'))return;
    const line=root.ownerDocument.createElement('span');
    line.className='sa-budget-status';line.textContent=page.rows[index]?.status_as_published||'';
    measure.append(line);
  });
}

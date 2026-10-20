/** Same shared table for server HTML, enhancement and CSV. No aggregation. */
export const saBudgetConfig=(rows,table)=>({
  id:'sa-budget-'+table.replace('.','-'),caption:'SA Treasury · Table '+table+' · 2015–16 Budget vintage',
  pageType:'budget',urlKey:'sa'+table.replace('.',''),pageSize:10,rows,
  columnsVisible:['measure','fiscal_year','status_as_published','amount','percentage','source_marker','locator'],
  columns:[
    {key:'measure',label:'Measure',type:'text',primary:true},
    {key:'fiscal_year',label:'Fiscal year',type:'category',facet:'multi'},
    {key:'status_as_published',label:'Estimate or actual',type:'category',facet:'multi'},
    {key:'amount',label:'Amount (AUD)',type:'money',align:'end'},
    {key:'percentage',label:'Percent',type:'text',align:'end'},
    {key:'source_marker',label:'Marker',type:'text'},
    {key:'locator',label:'Source cell',type:'text'},
    ...['measure_as_published','section_as_published','value','units','basis','consolidation','raw_value','number_format','display_divisor','workbook','sheet','cell','dataset_url','source_url','vintage','snapshot','sha256','licence','licence_url'].map(key=>({key,label:({value:'Published display value',raw_value:'Stored cell value',display_divisor:'Excel display divisor',sha256:'SHA-256',licence_url:'Licence URL',source_url:'Resource URL',dataset_url:'Dataset URL'})[key]||key.replaceAll('_',' '),type:'text'})),
  ],primaryLink:row=>row.source_url,export:{filename:'sa-budget-'+table+'-2015-16.csv'},
});

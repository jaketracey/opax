/** Shared DataTable configuration used by SSR and progressive enhancement. */
export const aggregateConfig = {
  id:'budget-aggregates', caption:'Headline fiscal aggregates across releases', pageType:'budget', urlKey:'fiscal', pageSize:10,
  columnsVisible:['metric','release','status','amount','citation','licence'],
  columns:[
    {key:'metric',label:'Aggregate',type:'category',primary:true,facet:'multi'},
    {key:'release',label:'Release',type:'text'},
    {key:'status',label:'Basis',type:'category',facet:'chips'},
    {key:'amount',label:'Amount (AUD)',type:'money',format:'exact',align:'end'},
    {key:'citation',label:'Paper and table',type:'text'},
    {key:'licence',label:'Licence',type:'text'},
    {key:'fiscal_year',label:'Fiscal year',type:'text'},
    {key:'source_url',label:'Source URL',type:'text'},
    {key:'licence_url',label:'Licence URL',type:'text'},
    {key:'snapshot',label:'Snapshot',type:'text'},
    {key:'sha256',label:'SHA-256',type:'text'},
    {key:'table_id',label:'Full source table',type:'text'},
  ],
  primaryLink:row=>row.source_url,
  export:{filename:'budget-aggregates.csv'},
};

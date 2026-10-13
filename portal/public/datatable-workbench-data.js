// Organisation-only, fictional records. No live APIs or analytics SDKs.
export const workbenchRows = [
  ['Harbour Works Pty Ltd','Infrastructure','Victoria',35400000000,1159,2026,'2026-08-19'],
  ['Civic Services Limited','Services','New South Wales',182500000,842,2025,'2025-11-04'],
  ['Regional Housing Foundation','Housing','Victoria',76200000,328,2026,'2026-07-12'],
  ['Transport Workers Union','Services','Queensland',38750000,264,2025,'2025-05-23'],
  ['Southern Works Pty Ltd','Infrastructure','Victoria',21450000,172,2026,'2026-06-10'],
  ['Community Health Association','Health','Tasmania',14200000,96,2024,'2024-09-08'],
  ['Northern Research Institute','Health','Queensland',7250000,68,2026,'2026-03-17'],
  ['Coastal Housing Trust','Housing','New South Wales',864000,42,2025,'2025-12-02'],
  ['Western Services Limited','Services','Victoria',12450.75,19,2024,'2024-10-14'],
].map(([name,industry,region,amount,count,year,date], i) => ({id:`organisation-${i + 1}`,name,industry,region,amount,count,year,date,jurisdiction:'Federal'}));
export const workbenchConfig = {
  id:'workbench-money', caption:'Disclosed receipts', pageType:'workbench',
  rows:workbenchRows, pageSize:5, urlKey:'t', defaultSort:{key:'amount',dir:'desc'},
  export:{filename:'receipts.csv'}, primaryLink:row=>`#${row.id}`,
  columns:[
    {key:'name',label:'Organisation',type:'text',primary:true},
    {key:'industry',label:'Sector',type:'category',facet:'chips'},
    {key:'region',label:'State',type:'category',facet:'multi'},
    {key:'amount',label:'Amount',type:'money',facet:'range',bar:true},
    {key:'count',label:'Returns',type:'count'},
    {key:'year',label:'Year',type:'year',facet:'range'},
    {key:'date',label:'Updated',type:'date'},
    {key:'jurisdiction',label:'Jurisdiction',type:'category'},
  ],
  actions:[{icon:'↗',label:'View record',href:row=>`#${row.id}`}],
};

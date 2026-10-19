/** Published level and jurisdiction identify the ABS consolidation group. */
const headings:Record<string,Record<string,string>>={
  Commonwealth:{Australia:'Commonwealth government'},
  State:{Australia:'Total state governments'},
  Local:{Australia:'Total local governments'},
  'State and local':{Australia:'Total state and local governments'},
  'Control n.f.d.':{Australia:'Control n.f.d.'},
  'All levels of government':{Australia:'Australia, all levels of government'},
  National:{Australia:'National general government'}
}
export const governmentFinanceGroupHeading=(level:string,jurisdiction:string)=>headings[level]?.[jurisdiction]??jurisdiction

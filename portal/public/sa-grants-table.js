/** Source-record text only: no recipient facets, person links or identity keys. */
import {dataTableHTML} from './datatable.js?v=5c09aecf9c';
export const saGrantsPhoneColumns=['recipient','year','amount'];
export const saGrantsConfig=(rows,id)=>({
  id:'sa-grants-'+id,caption:'Published awards',pageType:'grants',urlKey:'sa'+id.slice(0,8),pageSize:10,rows,
  columnsVisible:['recipient','year','amount','project_title','project_description','region','locator'],
  columns:[
    {key:'recipient',label:'Recipient',type:'text',primary:true},
    {key:'year',label:'Year',type:'category',facet:'multi',hideWhenConstant:false},
    {key:'amount',label:'Amount',type:'money',format:'exact',align:'end'},
    {key:'project_title',label:'Project',type:'text'},
    {key:'project_description',label:'Project description',type:'text'},
    {key:'region',label:'Region as published',type:'text'},
    {key:'locator',label:'Source row',type:'text',href:row=>row.source_url},
    ...['programme','amount_as_published','resource_id','sheet','source_row','dataset_url','source_url','snapshot','sha256','licence','licence_url'].map(key=>({key,label:({sha256:'SHA-256',resource_id:'Resource UUID'})[key]||key.replaceAll('_',' '),type:'text'})),
  ],export:{filename:'sa-grants-'+id+'.csv'},
});
const phone={'Recipient':'recipient','Year':'year','Amount':'amount'};
export function saGrantsTableHTML(config,page,url){
  return dataTableHTML(config,page,url).replace(/<th\b([^>]*)>([\s\S]*?)<\/th>/g,(html,attrs,body)=>{
    const key=phone[body.replace(/<[^>]*>/g,'').trim()];
    return key?`<th${attrs} data-sa-grants-column="${key}">${body}</th>`:html;
  });
}
export function decorateSAGrants(root){
  for(const th of root.querySelectorAll('thead th')){
    const key=phone[th.textContent.trim()];if(key)th.dataset.saGrantsColumn=key;
  }
}

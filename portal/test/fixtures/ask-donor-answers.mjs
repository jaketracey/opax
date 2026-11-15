// Invented organisations and parties only. Legacy totals deliberately disagree
// with recipient-return cells, so a doubled declaration cannot inflate giving.
const typedEdge=(source,target,types)=>({source,target,total:999999,count:99,firstYear:2023,lastYear:2023,byYear:{2023:[999999,99]},
 by_type:{...types},
 by_type_year:{'2023-24':Object.fromEntries(Object.entries(types).map(([type,amount])=>[type,[amount,1]]))}})
export const donorQuestions=[
 'How much has Example Marigold Holdings donated to political parties?',
 'How much has Example Quill Foundation donated to political parties?',
 'How much has Example Bracken Banking donated to political parties?',
]
export const donorGraph={meta:{generated:'2026-11-14',uncapped:true,receipt_types:{available:true,schema:1,donation_type:'donation_received'}},nodes:[
 ...['Example Harbor Party','Example Meadow Party','Example Orchard Party'].map(label=>({id:'party:'+label,kind:'party',label})),
 ...['Example Marigold Holdings','Example Quill Foundation','Example Bracken Banking'].map(label=>({id:'donor:'+label,kind:'donor',label,industry:'finance',total:999999,count:99,by_type:{},by_type_year:{}})),
 {id:'government',kind:'grantor',label:'Fixture Government'},
 ],edges:[
 typedEdge('donor:Example Marigold Holdings','party:Example Harbor Party',{donation_received:1200,subscription:50}),
 typedEdge('donor:Example Marigold Holdings','party:Example Meadow Party',{donation_received:800,other_receipt:100}),
 typedEdge('donor:Example Marigold Holdings','party:Example Orchard Party',{donation_received:500,public_funding:900}),
 {source:'donor:Example Quill Foundation',target:'party:Example Harbor Party',total:64250,count:3,firstYear:2018,lastYear:2019,byYear:{2018:[40000,2],2019:[24250,1]},by_type:{},by_type_year:{}},
 typedEdge('donor:Example Bracken Banking','party:Example Harbor Party',{donation_received:300,loan:9000,other_receipt:4000}),
 typedEdge('donor:Example Bracken Banking','party:Example Meadow Party',{donation_received:200,public_funding:1000}),
 {source:'government',target:'donor:Example Marigold Holdings',total:1000000,count:1,flow:'contract'},
 {source:'donor:Example Bracken Banking',target:'party:Example Harbor Party',total:700000,count:1,flow:'loan'},
 ]}
// The donor page's node cells agree with its per-party edges. Legacy node
// totals remain poisoned to catch accidental use of the double-counted fields.
for(const node of donorGraph.nodes.filter(n=>n.kind==='donor')){
 if(node.label==='Example Marigold Holdings')node.aliases=['EMH']
 if(node.label==='Example Bracken Banking')node.aliases=['Example Bracken Union']
 for(const edge of donorGraph.edges.filter(e=>e.source===node.id&&!e.flow&&!e.grant)){
  for(const [type,amount] of Object.entries(edge.by_type??{}))node.by_type[type]=(node.by_type[type]??0)+amount
  for(const [period,types] of Object.entries(edge.by_type_year??{})){
   const held=node.by_type_year[period]??={}
   for(const [type,[amount,count]] of Object.entries(types)){
    const cell=held[type]??=[0,0]
    cell[0]+=amount;cell[1]+=count
   }
  }
 }
}
export const donorAssets={fetch:async request=>{
 const path=new URL(request.url).pathname
 if(path==='/graph/money-receipts.json')return Response.json(donorGraph)
 if(path==='/parliamentarians.json')return Response.json({people:[]})
 throw Error('Unexpected fixture asset: '+path)
}}

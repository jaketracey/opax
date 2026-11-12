// This oracle sums the published graph independently of the route/calculator.
export function graphRanking(graph,{industry,party,from,to,total=false}){
 const nodes=new Map(graph.nodes.map(n=>[n.id,n])),totals=new Map()
 let first=Infinity,last=-Infinity,cents=0,records=0
 for(const e of graph.edges){
  const source=nodes.get(e.source),target=nodes.get(e.target)
  if(e.flow||e.grant||source?.kind!=='donor'||target?.kind!=='party'||industry&&source.industry!==industry||party&&target.label!==party)continue
  let amount=0,count=0
  if(from!==undefined||to!==undefined){
   for(const [key,cell]of Object.entries(e.byYear??{})){
    const year=Number(key)
    if(year<(from??0)||year>(to??9999))continue
    amount+=Math.round(cell[0]*100);count+=cell[1]
    if(cell[0]||cell[1]){first=Math.min(first,year);last=Math.max(last,year)}
   }
  }else{amount=Math.round(e.total*100);count=e.count;if(amount||count){first=Math.min(first,e.firstYear);last=Math.max(last,e.lastYear)}}
  if(!amount&&!count)continue
  cents+=amount;records+=count
  const owner=party?source:target,prev=totals.get(owner.id)??{id:owner.id,name:owner.label,cents:0,records:0}
  prev.cents+=amount;prev.records+=count;totals.set(owner.id,prev)
 }
 const fy=y=>`${y}–${String((y+1)%100).padStart(2,'0')}`
 return {rows:[...totals.values()].sort((a,b)=>b.cents-a.cents||a.name.localeCompare(b.name,'en-AU')).slice(0,party?5:10),cents,records,period:first===last?fy(first):`${fy(first)} to ${fy(last)}`,total}
}
export const dollars=cents=>new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD',minimumFractionDigits:cents%100?2:0,maximumFractionDigits:2}).format(cents/100)
export function scoreMoneyRanking(payload,expected,selection,graph){
 const errors=[],answer=payload?.answer??'',first=answer.match(/^.*?[.!?](?=\s|$)/s)?.[0]??answer
 const check=(ok,message)=>{if(!ok)errors.push(message)}
 check(payload?.answer_status==='calculated','calculated status')
 check(payload?.measure==='receipts_all','all-types measure')
 check(first.includes(selection.total?dollars(expected.cents):dollars(expected.rows[0].cents)),'opening amount')
 check(first.includes(payload.measure_label),'opening measure label')
 check(first.includes(expected.period),'opening period')
 check(first.includes(selection.total?selection.party:expected.rows[0].name),'opening owner')
 const before=answer.slice(0,answer.indexOf('$'))
 const negatives=before.match(/\b(?:not|no|never|cannot|unable|without|rather than|yet)\b|n['’]t\b/gi)??[]
 check(!negatives.length,'negative clause before first amount')
 const caveats=answer.split('\n\n').filter(p=>p.startsWith('These figures are'))
 check(caveats.length===1&&caveats[0].split(/\s+/).length<=35&&caveats[0].split(/[.!?](?:\s|$)/).filter(Boolean).length===1,'one short caveat')
 const rows=answer.split('\n').filter(line=>line.startsWith('| ')&&!/\| (?:---|Share)|^\| (?:Source|Recipient|Total|Other sources|Other parties)/.test(line))
 check(rows.length===expected.rows.length,'ranked row count')
 for(const [i,row]of expected.rows.entries()){
  const actual=rows[i]??''
  check(actual.includes(row.name)&&actual.includes(dollars(row.cents)),`rank/amount ${row.name}`)
  check(actual.includes(row.records.toLocaleString('en-AU')),`records ${row.name}`)
  const share=row.cents/expected.cents*100
  check(actual.includes(share>0&&share<0.5?'<1%':Math.round(share)+'%'),`share ${row.name}`)
 }
 const amounts=new Set([dollars(expected.cents),...expected.rows.map(r=>dollars(r.cents))])
 if(selection.industry){
  // Independently recompute source amounts for the selected industry, even when rows rank parties.
  const sourceGraph={...graph,nodes:graph.nodes.map(n=>n.kind==='party'?{...n,label:'Selected parties'}:n)}
  const selected=graph.edges.filter(e=>!selection.party||graph.nodes.find(n=>n.id===e.target)?.label===selection.party)
  const source=graphRanking({...sourceGraph,edges:selected},{...selection,party:'Selected parties'})
  source.rows.forEach(r=>amounts.add(dollars(r.cents)))
 }
 if(selection.party){const rest=expected.cents-expected.rows.reduce((sum,r)=>sum+r.cents,0);if(rest)amounts.add(dollars(rest))}
 for(const amount of answer.match(/\$\d+(?:,\d{3})*(?:\.\d{2})?/g)??[])check(amounts.has(amount),'unbound amount '+amount)
 const map=answer.match(/\[(?:See these|See all receipt types) on the money map\]\(([^)]+)\)/)?.[1]
 check(!!map,'map link')
 if(map){const p=new URL(map,'https://opax.test').searchParams
  check(p.get('jur')==='federal'&&p.get('type')==='receipts','map jurisdiction/type')
  check(!selection.industry||p.get('industry')===selection.industry,'map industry')
  check(!selection.party||p.get('party')==='party:'+selection.party,'map party')
  check(selection.from===undefined?!p.has('from'):p.get('from')===String(selection.from),'map start')
  check(selection.to===undefined?!p.has('to'):p.get('to')===String(selection.to),'map end')
 }
 check(!/\b(?:bought|buying|bribe\w*|corrupt\w*|kickback\w*|paid for (?:access|influence|votes?))\b/i.test(answer),'neutrality')
 check(Object.keys(payload?.citations??{}).length>0,'citations')
 for(const spans of Object.values(payload?.citations??{}))for(const [start,end]of spans)check(start>=0&&end>start&&end<=Array.from(answer).length,'citation span')
 const prose=answer.split('\n').filter(line=>!line.startsWith('|')).join(' ').replace(/\[([^\]]+)\]\([^)]+\)/g,'$1').replace(/[*]/g,'')
 check(first.replace(/[*]/g,'').split(/\s+/).length<=35,'opening word budget')
 check(prose.trim().split(/\s+/).length<=120,'prose word budget')
 const shares=answer.split('\n').filter(line=>line.startsWith('| ')&&!/^\| (?:---|Source|Recipient|Total)/.test(line)).map(line=>line.split('|')[3]?.trim()).filter(Boolean)
 const shareSum=shares.reduce((sum,s)=>sum+(s==='<1%'?0:Number.parseInt(s,10)),0)
 check(Math.abs(shareSum-100)<=1,'selection shares sum')
 const amountFirst=/\$\d/.test(first),labelFirst=/disclosed receipts, all types|donations received|other receipts \(AEC|subscriptions \(AEC/i.test(first)
 const periodFirst=/\b\d{4}[–-]\d{2}/.test(first),mapFiltered=!!map&&new URL(map,'https://opax.test').searchParams.has(selection.industry?'industry':'party')
 const caveatWords=caveats.reduce((sum,c)=>sum+c.split(/\s+/).length,0),caveatSentences=caveats.join(' ').split(/[.!?](?:\s|$)/).filter(Boolean).length
 const defects=Number(negatives.length>0)+Number(!periodFirst)+Number(!mapFiltered)+Number(caveatSentences!==1||caveatWords>35)
 const directness=!answer.includes('$')||payload?.answer_status!=='calculated'?0:!amountFirst||negatives.length>=2||!map||caveatWords>60?1:labelFirst&&defects===0?3:labelFirst&&defects===1?2:1
 return {accuracy:errors.filter(e=>!['negative clause before first amount','one short caveat','map link','opening word budget','prose word budget'].includes(e)).length===0,directness,errors}
}

// This oracle sums the published graph independently of the route/calculator.
export function graphRanking(graph,{industry,party,from,to,total=false}){
 const nodes=new Map(graph.nodes.map(n=>[n.id,n])),totals=new Map()
 const meta=graph.meta.receipt_types,typed=meta?.available===true&&meta.schema===1&&meta.donation_type==='donation_received'
 const edges=graph.edges.filter(e=>!e.flow&&!e.grant&&nodes.get(e.source)?.kind==='donor'&&nodes.get(e.target)?.kind==='party'&&(!industry||nodes.get(e.source).industry===industry)&&(!party||nodes.get(e.target).label===party))
 const fyStart=key=>/^(\d{4})-(\d{2})$/.test(key)&&Number(key.slice(-2))===(Number(key.slice(0,4))+1)%100?Number(key.slice(0,4)):undefined
 const inWindow=key=>{const y=fyStart(key);return y!==undefined&&y>=(from??0)&&y<=(to??9999)}
 const windowed=from!==undefined||to!==undefined
 const heldTypes=new Set()
 if(typed)for(const e of edges){
  if(windowed){
   for(const [period,cells]of Object.entries(e.by_type_year??{}))if(inWindow(period)){
    for(const [type,[amount,count]]of Object.entries(cells))if(amount||count)heldTypes.add(type)
   }
  }else for(const [type,amount]of Object.entries(e.by_type??{})){
   if(amount||Object.values(e.by_type_year??{}).some(cells=>cells[type]?.[1]))heldTypes.add(type)
  }
 }
 const measure=typed?(heldTypes.has('donation_received')?'donations':heldTypes.has('other_receipt')?'other_receipts':heldTypes.has('subscription')?'subscriptions':'receipts_all'):'receipts_all'
 const type={donations:'donation_received',other_receipts:'other_receipt',subscriptions:'subscription'}[measure]
 let first=Infinity,last=-Infinity,cents=0,records=0,allCents=0,otherCents=0
 const events=new Set()
 for(const e of edges){
  const source=nodes.get(e.source),target=nodes.get(e.target)
  let amount=0,count=0,all=0,other=0
  if(typed){
   if(!windowed){
    for(const [key,value]of Object.entries(e.by_type??{})){
     all+=Math.round(value*100);if(key==='other_receipt')other+=Math.round(value*100)
     if(!type||key===type)amount+=Math.round(value*100)
    }
   }
   for(const [key,cells]of Object.entries(e.by_type_year??{})){
    if(windowed&&!inWindow(key))continue
    for(const [cellType,cell]of Object.entries(cells)){
     if(windowed){all+=Math.round(cell[0]*100);if(cellType==='other_receipt')other+=Math.round(cell[0]*100)}
     if(type&&cellType!==type)continue
     if(windowed)amount+=Math.round(cell[0]*100)
     count+=cell[1]
     if(cell[0]||cell[1]){const year=fyStart(key);if(year!==undefined){first=Math.min(first,year);last=Math.max(last,year)}else events.add(key)}
    }
   }
  }else if(windowed){
   for(const [key,cell]of Object.entries(e.byYear??{})){
    const year=Number(key)
    if(year<(from??0)||year>(to??9999))continue
    amount+=Math.round(cell[0]*100);count+=cell[1]
    if(cell[0]||cell[1]){first=Math.min(first,year);last=Math.max(last,year)}
   }
   all=amount
  }else{amount=Math.round(e.total*100);all=amount;count=e.count;if(amount||count){first=Math.min(first,e.firstYear);last=Math.max(last,e.lastYear)}}
  if(!all&&!count)continue
  cents+=amount;records+=count;allCents+=all;otherCents+=other
  const owner=party?source:target,prev=totals.get(owner.id)??{id:owner.id,name:owner.label,cents:0,records:0,allCents:0,otherCents:0}
  prev.cents+=amount;prev.records+=count;prev.allCents+=all;prev.otherCents+=other;totals.set(owner.id,prev)
 }
 const fy=y=>`${y}–${String((y+1)%100).padStart(2,'0')}`
 const fiscal=Number.isFinite(first)?first===last?fy(first):`${fy(first)} to ${fy(last)}`:null
 return {allRows:[...totals.values()],rows:[...totals.values()].filter((r,_i,all)=>r.cents>0||!all.some(x=>x.cents>0)).sort((a,b)=>b.cents-a.cents||a.name.localeCompare(b.name,'en-AU')).slice(0,party?5:10),cents,records,allCents,otherCents,typed,measure,period:[fiscal,...events].filter(Boolean).join('; '),total}
}
export const dollars=cents=>new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD',minimumFractionDigits:cents%100?2:0,maximumFractionDigits:2}).format(cents/100)
export function scoreMoneyRanking(payload,expected,selection,graph){
 const errors=[],answer=payload?.answer??'',first=answer.match(/^.*?[.!?](?=\s|$)/s)?.[0]??answer
 const check=(ok,message)=>{if(!ok)errors.push(message)}
 check(payload?.answer_status==='calculated','calculated status')
 check(payload?.measure===expected.measure,'measure matches graph')
 const labels={donations:'donations received (AEC receipt type: Donation Received)',other_receipts:'other receipts (AEC receipt type: Other Receipt, for amounts other than donations or subscriptions)',subscriptions:'subscriptions (AEC receipt type: Subscription, such as memberships, union affiliation fees and business-forum packages)'}
 const leadIndustry=selection.industry??graph.nodes.find(n=>n.id===expected.rows[0]?.id)?.industry
 const label=labels[expected.measure]??(leadIndustry==='unions'?'disclosed receipts, all types (donations, affiliation fees and other receipts)':'disclosed receipts, all types (donations, subscriptions and other receipts)')
 check(payload?.measure_label===label,'measure label matches graph')
 // A ranking in money that is not donations never takes the first sentence:
 // with no donations recorded, the first sentence says so and the ranking follows.
 check(!(expected.typed&&!selection.total&&/\$\d/.test(first)&&payload?.measure!=='donations'),'first sentence ranks by non-donation money')
 const noDonations=expected.typed&&!selection.total&&expected.measure!=='donations'
 const second=answer.slice(first.length).match(/^\s*.*?[.!?](?=\s|$)/s)?.[0]?.trim()??''
 if(noDonations)check(/^The AEC records no donations from \S/.test(first),'no-donations opening')
 const opening=noDonations?second:first
 const phrases={other_receipts:'other receipts (amounts other than donations or subscriptions)',subscriptions:'subscriptions (memberships, union affiliation fees and business-forum packages)'}
 check(opening.includes(selection.total?dollars(expected.cents):dollars(expected.rows[0].cents)),'opening amount')
 check(opening.includes(noDonations?phrases[expected.measure]??'disclosed receipts of all types':payload.measure_label),'opening measure label')
 check(opening.includes(expected.period),'opening period')
 check(opening.includes(selection.total?selection.party:expected.rows[0].name),'opening owner')
 const before=answer.slice(noDonations?first.length:0,answer.indexOf('$'))
 const negatives=before.match(/\b(?:not|no|never|cannot|unable|without|rather than|yet)\b|n['’]t\b/gi)??[]
 check(!negatives.length,'negative clause before first amount')
 const caveats=answer.split('\n\n').filter(p=>p.startsWith('These figures are'))
 check(caveats.length===1&&caveats[0].split(/\s+/).length<=35&&caveats[0].split(/[.!?](?:\s|$)/).filter(Boolean).length===1,'one short caveat')
 // A single recipient is a sentence ("the only party"), not a table.
 const tabled=expected.rows.length>1||!!selection.party||!!selection.total
 if(tabled)check(answer.includes(`| ${expected.measure==='donations'?'Donations':expected.measure==='other_receipts'?'Other receipts':expected.measure==='subscriptions'?'Subscriptions':'Disclosed receipts'} |`),'measure table heading')
 const rows=answer.split('\n').filter(line=>line.startsWith('| ')&&!/\| (?:---|Share)|^\| (?:Source|Recipient|Total|Other sources|Other parties)/.test(line))
 if(tabled)check(rows.length===expected.rows.length,'ranked row count')
 if(tabled)for(const [i,row]of expected.rows.entries()){
  const actual=rows[i]??''
  check(actual.includes(row.name)&&actual.includes(dollars(row.cents)),`rank/amount ${row.name}`)
  if(expected.typed&&expected.measure!=='receipts_all'){
   const cell=actual.split('|')[4]?.trim()
   check(cell===dollars(row.allCents)+(row.otherCents>=row.allCents/2&&row.otherCents>0?' (mostly other receipts)':''),`all-types cell ${row.name}`)
  }else check(actual.includes(row.records.toLocaleString('en-AU')),`records ${row.name}`)
  const share=row.cents/expected.cents*100
  check(actual.includes(share>0&&share<0.5?'<1%':Math.round(share)+'%'),`share ${row.name}`)
 }
 const amounts=new Set([dollars(expected.cents),dollars(expected.allCents),dollars(expected.rows.reduce((sum,r)=>sum+r.allCents,0)),...expected.rows.flatMap(r=>[dollars(r.cents),dollars(r.allCents)])])
 if(selection.industry){
  // Independently recompute source amounts for the selected industry, even when rows rank parties.
  const sourceGraph={...graph,nodes:graph.nodes.map(n=>n.kind==='party'?{...n,label:'Selected parties'}:n)}
  const selected=graph.edges.filter(e=>!selection.party||graph.nodes.find(n=>n.id===e.target)?.label===selection.party)
  const source=graphRanking({...sourceGraph,edges:selected},{...selection,party:'Selected parties'})
  source.allRows.forEach(r=>{amounts.add(dollars(r.cents));amounts.add(dollars(r.allCents))})
 }
 // Sources with $0 in the measure are left out of the ranking, its remainder and its total.
 const positive=expected.allRows.filter(r=>r.cents>0),positiveAll=positive.reduce((sum,r)=>sum+r.allCents,0)
 amounts.add(dollars(positiveAll));amounts.add(dollars(positiveAll-expected.rows.reduce((sum,r)=>sum+r.allCents,0)))
 if(selection.party){const rest=expected.cents-expected.rows.reduce((sum,r)=>sum+r.cents,0);if(rest)amounts.add(dollars(rest));const allRest=expected.allCents-expected.rows.reduce((sum,r)=>sum+r.allCents,0);amounts.add(dollars(allRest))}
 // Recipient rankings also carry donation-only amounts per financial year and in total.
 if(expected.typed&&!selection.party)for(const amount of donationAmounts(graph,selection))amounts.add(dollars(amount))
 for(const amount of answer.match(/\$\d+(?:,\d{3})*(?:\.\d{2})?/g)??[])check(amounts.has(amount),'unbound amount '+amount)
 const map=answer.match(/\[(?:See these(?: donations)?|See all receipt types) on the money map\]\(([^)]+)\)/)?.[1]
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
 const prose=answer.split('\n').filter(line=>!line.startsWith('|')&&!line.startsWith('Source:')).join(' ').replace(/\[([^\]]+)\]\([^)]+\)/g,'$1').replace(/[*]/g,'')
 check(first.replace(/[*]/g,'').split(/\s+/).length<=35,'opening word budget')
 check(prose.trim().split(/\s+/).length<=120,'prose word budget')
 const shares=answer.split('\n').filter(line=>line.startsWith('| ')&&!/^\| (?:---|Source|Recipient|Total)/.test(line)).map(line=>line.split('|')[3]?.trim()).filter(Boolean)
 const shareSum=shares.reduce((sum,s)=>sum+(s==='<1%'?0:Number.parseInt(s,10)),0)
 if(tabled)check(Math.abs(shareSum-100)<=1,'selection shares sum')
 const amountFirst=/\$\d/.test(opening),labelFirst=/disclosed receipts, all types|disclosed receipts of all types|donations received|other receipts \((?:AEC|amounts)|subscriptions \((?:AEC|memberships)/i.test(opening)
 const periodFirst=/\b\d{4}[–-]\d{2}/.test(opening),mapFiltered=!!map&&new URL(map,'https://opax.test').searchParams.has(selection.industry?'industry':'party')
 const caveatWords=caveats.reduce((sum,c)=>sum+c.split(/\s+/).length,0),caveatSentences=caveats.join(' ').split(/[.!?](?:\s|$)/).filter(Boolean).length
 const defects=Number(negatives.length>0)+Number(!periodFirst)+Number(!mapFiltered)+Number(caveatSentences!==1||caveatWords>35)
 const directness=!answer.includes('$')||payload?.answer_status!=='calculated'?0:!amountFirst||negatives.length>=2||!map||caveatWords>60?1:labelFirst&&defects===0?3:labelFirst&&defects===1?2:1
 return {accuracy:errors.filter(e=>!['negative clause before first amount','one short caveat','map link','opening word budget','prose word budget'].includes(e)).length===0,directness,errors}
}

/** Donation-only cents ("Donation Received") per recipient, per financial year and in total, summed independently of the calculator. */
export function donationAmounts(graph,{industry,from,to}){
 const nodes=new Map(graph.nodes.map(n=>[n.id,n])),perYear=new Map(),perParty=new Map(),out=new Set([0])
 const fyStart=key=>/^(\d{4})-(\d{2})$/.test(key)?Number(key.slice(0,4)):undefined
 for(const e of graph.edges){
  if(e.flow||e.grant||nodes.get(e.source)?.kind!=='donor'||nodes.get(e.target)?.kind!=='party'||industry&&nodes.get(e.source).industry!==industry)continue
  let total=from===undefined&&to===undefined?Math.round((e.by_type?.donation_received??0)*100):0
  for(const [key,cells]of Object.entries(e.by_type_year??{})){
   const year=fyStart(key),cell=cells.donation_received
   if(year===undefined||!cell||year<(from??0)||year>(to??9999))continue
   const cents=Math.round(cell[0]*100)
   if(from!==undefined||to!==undefined)total+=cents
   perYear.set(e.target+'|'+year,(perYear.get(e.target+'|'+year)??0)+cents)
   perYear.set('*|'+year,(perYear.get('*|'+year)??0)+cents)
  }
  perParty.set(e.target,(perParty.get(e.target)??0)+total)
 }
 for(const v of perYear.values())out.add(v)
 for(const v of perParty.values())out.add(v)
 out.add([...perParty.values()].reduce((a,b)=>a+b,0))
 return out
}

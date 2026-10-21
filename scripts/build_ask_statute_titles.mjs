#!/usr/bin/env node
// Derive a lookup from local shipped titles only. No network, summaries or new source loads.
import {readFileSync,writeFileSync,existsSync} from 'node:fs'
import {dirname,join,resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {normaliseStatuteTitle} from '../portal/src/ask-statute-titles.mjs'
const PUBLIC=resolve(dirname(fileURLToPath(import.meta.url)),'../portal/public')
export function statuteTitleFile(root=PUBLIC){
 const titles=new Set(),sources=[]
 const add=title=>{
  if(typeof title!=='string')return
  // An Act's own short title, or the leading named Act in an instrument title.
  // The remaining instrument qualifier is not part of the statute's identity.
  const match=/^(.+?\bAct)(?:\s+\d{4}\b|$)/i.exec(title.trim())
  if(match){const name=normaliseStatuteTitle(match[1]);if(name.endsWith(' act'))titles.add(name)}
 }
 const index=JSON.parse(readFileSync(join(root,'bills/index.json'),'utf8'))
 sources.push({path:'/bills/index.json',records:index.bills.length})
 let linked=0
 for(const row of index.bills){
  add(row.short_title);add(row.title)
  const file=join(root,'bills',row.key+'.json')
  if(!existsSync(file))throw Error('Missing shipped bill title file: '+row.key)
  const bill=JSON.parse(readFileSync(file,'utf8'))
  add(bill.short_title);add(bill.title)
  for(const title of bill.aliases??[])add(title)
  for(const act of bill.acts??[]){add(act.title);linked++}
 }
 sources.push({path:'/bills/{key}.json',records:index.bills.length,linked_acts:linked})
 const frl=join(root,'instruments/index.json')
 if(existsSync(frl)){
  const data=JSON.parse(readFileSync(frl,'utf8')),column=data.fields.indexOf('title')
  if(column<0||!Array.isArray(data.records))throw Error('Invalid shipped instrument title index')
  for(const row of data.records)add(row[column])
  sources.push({path:'/instruments/index.json',records:data.records.length})
 }
 return {schema:1,sources,count:titles.size,titles:[...titles].sort()}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const data=statuteTitleFile(),file=join(PUBLIC,'ask-statute-titles.json'),text=JSON.stringify(data)+'\n'
 const old=existsSync(file)?readFileSync(file,'utf8'):''
 if(process.argv.includes('--check')){if(old!==text){console.error('Ask statute titles are stale; run build:ask-titles.');process.exitCode=1}else console.log('Ask statute titles current:',data.count)}
 else{if(old!==text)writeFileSync(file,text);console.log('Ask statute titles:',data.count,'from',data.sources.map(s=>s.path).join(', '))}
}

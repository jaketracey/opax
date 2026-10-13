import {readFile} from 'node:fs/promises';
import {votingRows} from '../../public/vote-tables.js';
const publicRoot=new URL('../../public/',import.meta.url);
export async function identityCorpus() {
  const read=async path=>JSON.parse(await readFile(new URL(path,publicRoot),'utf8'));
  const [votes,recent,bills]=await Promise.all([read('votes.json'),read('seo/recent-votes.json'),read('bills/index.json')]);
  const voteRows=Object.values(votes).flatMap(v=>[...(v?.for||[]),...(v?.against||[])]).map(row=>JSON.stringify(row));
  const recentRows=Object.values(recent.people||{}).flatMap(p=>p.recent||[]).map(row=>JSON.stringify(row));
  const projectedVoteRows=Object.values(votes).flatMap(v=>votingRows([
    ...(v?.for||[]).map(row=>({...row,vote:'For the bill'})),
    ...(v?.against||[]).map(row=>({...row,vote:'Against the bill'})),
  ],bills.bills)).map(row=>JSON.stringify(row));
  const projectedRecentRows=Object.values(recent.people||{}).flatMap(p=>votingRows(p.recent||[],bills.bills)).map(row=>JSON.stringify(row));
  const billTitles=bills.bills.flatMap(b=>[b.title,b.short_title].filter(v=>typeof v==='string'));
  return {voteRows,recentRows,projectedVoteRows,projectedRecentRows,billTitles};
}
export function fuzzIdentityTexts(count=2000) {
  let state=0x31415926;
  const random=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return state>>>0;};
  const parts=['Fictional','Quillstone','Example','123','45678901','%25','%20','%ZZ',' ','-','_',':',',','é','e\u0301','ß','ς','σ','𐐀','中','\u200d','\ud800','\udc00','Ａ','①','\n','\t','🪶'];
  return Array.from({length:count},()=>Array.from({length:random()%50},()=>parts[random()%parts.length]).join(''));
}
export const performanceRow=JSON.stringify({title:'Fictional Example Parliamentary Amendment Bill',date:'2026-10-13',stage:'Second reading',division_slug:'fixture-parliamentary-amendment-bill',vote:'For the bill',house:'representatives',details:'Recorded division on the proposed parliamentary amendment and related public provisions'});

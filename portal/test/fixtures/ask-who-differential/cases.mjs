// Offline review counterexamples. Invented subjects are used except the public cases supplied in the brief.
import {readFileSync} from 'node:fs'
const who='Who was responsible for the recovery scheme?'
export const cases=[]
const source=(resource,text)=>({resource,title:'Recovery report',snippet:text,url:'https://example.test/report',kind:'record',cited:true})
const payload=lines=>{
 let at=0
 return {answer:lines.join('\n\n'),sources:lines.map((s,i)=>source('fact-'+i,s)),citations:Object.fromEntries(lines.map((s,i)=>{const start=at;at+=Array.from(s).length+2;return ['fact-'+i,[[start,at-2]]]}))}
}
const add=(id,group,input,options={})=>cases.push({id,group,question:who,input,retain:input.answer.split('\n\n'),...options})
const speech=(p,i,snippet=p.sources[i].snippet)=>Object.assign(p.sources[i],{kind:'speech',speaker:'Morgan Sample',chamber:'representatives',title:'Recovery debate',snippet})
const record='The royal commission found that Cabinet approved the recovery scheme without legislative authority.'
const named='The report made findings about the conduct of former ministers Rowan Ellery and Avery Quinlan.'
let p=payload(['The commission examined the recovery scheme.']);p.sources[0].snippet=named;add('r1-source-names','Source recovery',p)
p=payload(['The commission, chaired by Morgan Sample, reported in July.']);add('r1-no-subject','No responsible subjects',p)
add('r1-unicode-move','Named finding and Unicode',payload(['The 🏠 commission reported in 2023.',named]))
p=payload([named]);p.sources[0].snippet=named.replace(' and Avery Quinlan','');add('r1-partial-name-support','Partial name support',p)
for(const [i,text]of [
 'The commission made no adverse findings against Minister Avery Quinlan.',
 'The commission found Minister Avery Quinlan was not responsible for the recovery scheme.',
 'The commission found Ministers Avery Quinlan and Rowan Ellery were not responsible for the recovery scheme.',
 'The commission found Minister Avery Quinlan no longer responsible for the recovery scheme.',
 'The commission did not make findings against Minister Avery Quinlan.',
].entries())add('r1-negative-role-'+i,'Original role negation',payload([record,text]))
p=payload(['The commission examined the recovery scheme.']);speech(p,0,named.slice(0,-1)+', the member said.');add('r1-speech-recovery','Attributed source recovery',p)
for(const [i,text]of ['I will say this plainly: Mr Ellery failed every test of integrity in the recovery scheme.','Minister Rowan Ellery failed every test of integrity in the recovery scheme.'].entries()){
 p=payload(['Morgan Sample told the House that the report described the recovery scheme.']);speech(p,0,text);add('r2-colon-attack-'+i,'Source assertions and colon attack',p)
}
for(const [i,text]of [
 'The commission discussed the member for Sample (Avery Quinlan), who was prime minister, was not the minister whose department failed the recovery scheme.',
 'The commission discussed the member for Sample (Avery Quinlan), who was prime minister, was cleared of responsibility for the recovery scheme.',
 'The commission discussed the member for Sample (Avery Quinlan), who had no responsibility for the recovery scheme.',
 'The commission cleared the member for Sample (Avery Quinlan), who had responsibility for the recovery scheme.',
].entries()){
 add('r2-parenthetical-'+i,'Parenthetical negation',payload([record,text]))
 p=payload(['The report examined the recovery scheme.']);p.sources[0].snippet=text;add('r2-parenthetical-source-'+i,'Parenthetical source negation',p)
}
// The writer's identity assignment is deliberately unsupported by the witness source.
for(const [full,short,seat]of [['Stuart Robert','Mr Robert','Fadden'],['John Howard','Mr Howard','Bennelong']]){
 const text=`The commission found that the member for ${seat} (${full}), who failed to ensure the recovery scheme was lawful, ignored repeated warnings.`
 p=payload([record,text]);speech(p,1,`The commission found that ${short} failed to ensure the recovery scheme was lawful. The witness was a departmental official.`)
 add('r2-shared-'+seat,'Shared surname',p)
}
p=payload(['Morgan Sample said the scheme was a political disaster.','The commission delivered its report in July.','The commission concluded the recovery scheme was unlawful.']);speech(p,0);add('r2-authority-fallback','Unnamed authority fallback',p)
for(const pronoun of ['it','It','they','They','he','He','she','She','this','This','these','These']){
 const first=`The Royal Commission into the Recovery Scheme (Commissioner Rowan Ellery) examined who was responsible for the scheme; ${pronoun} referred six people to the NACC.`
 const second='The Royal Commission into the Recovery Scheme, whose Royal Commissioner was Rowan Ellery, investigated who was responsible for the recovery scheme and delivered its final report on 7 July 2023.'
 add('r2-near-tail-'+pronoun,'Near-repeat pronoun tails',payload([first,second]))
 const opening='Labor voted no on 3 May 2023'
 add('r3-exact-tail-'+pronoun,'Exact-opening pronoun tails',payload([opening+'.',opening+`; ${pronoun} received 17 votes.`]),{question:'What happened in the vote?'})
}
const mckenzie='Anthony Albanese told the House that the ANAO found that Bridget McKenzie approved grants.'
p=payload(['The report described the grants programme.',mckenzie]);Object.assign(speech(p,1),{speaker:'Anthony Albanese'});add('r3-mckenzie-anao','McKenzie and ANAO',p,{question:'Who approved the grants?'})
for(const [i,body]of ['Auditor-General','ANAO','Senate committee','NACC','ICAC','IBAC','CCC','CMC','NSW Independent Commission Against Corruption','South Australian Independent Commission Against Corruption','Northern Territory Independent Commissioner Against Corruption','Tasmanian Integrity Commission','ACT Integrity Commission','Corruption and Crime Commission','Crime and Corruption Commission'].entries()){
 const finding=`Morgan Sample told the House that the ${body} found that Rowan Ellery approved the recovery grants.`
 p=payload(['The grants programme was examined in the inquiry.',finding]);speech(p,1);add('r3-body-'+i,'Finding-body relay',p,{question:'Who approved the recovery grants?'})
 p=payload(['The grants programme was examined in the inquiry.']);speech(p,0,`The ${body} found that Rowan Ellery approved the recovery grants.`);add('r3-body-source-'+i,'Finding-body source recovery',p,{question:'Who approved the recovery grants?'})
}
for(const [i,text]of ['Morgan Sample told the House that Rowan Ellery approved the recovery grants.','Morgan Sample told the House that the ANAO found: Minister Rowan Ellery approved the recovery grants.'].entries()){
 p=payload(['The grants programme was debated in the House.',text]);speech(p,1);add('r3-existing-statement-'+i,'Existing member statements',p)
}
const context='The member for Cook (Scott Morrison) was social services minister.'
const morrison='Bill Shorten told the House that the commission found Mr Morrison allowed Cabinet to be misled.'
p=payload([context,morrison]);Object.assign(speech(p,1,'The commission found Mr Morrison allowed Cabinet to be misled. The member for Cook was social services minister.'),{speaker:'Bill Shorten'});add('r3-surname-duplicate','Existing surname sentence',p)
for(const [i,text]of ['The commission found no evidence that Rowan Ellery approved the recovery scheme.','The commission rejected claims that Rowan Ellery approved the recovery scheme.','The commission rejected claims that Minister Rowan Ellery approved the recovery scheme.'].entries())add('r3-that-negation-'+i,'Round-3 negation rollback',payload([record,text]))
p=payload(['Morgan Sample told the House that the report described the recovery scheme.']);speech(p,0,'The report found the scheme unlawful; I will say this plainly: Minister Rowan Ellery failed every test of integrity.');add('r3-titled-colon','Titled colon attack',p)
const opening='Labor voted no on 3 May 2023'
add('r3-lowercase-tail','Lowercase semicolon tail',payload([opening+'.',opening+'; the bill received 17 votes.']),{question:'What happened in the vote?'})
for(const [i,text]of [
 'The commission found not only that Rowan Ellery approved the recovery grants but also that Avery Quinlan ignored legal advice.',
 'The commission denied claims from critics, then found that Rowan Ellery approved the recovery grants.',
 'The commission denied claims from critics, then found that Minister Rowan Ellery approved the recovery grants.',
 'The commission found that the member for Sample (Rowan Ellery), who not only approved the recovery grants but also ignored legal advice, failed his responsibilities.',
].entries())add('r4-positive-'+i,'Not only and unrelated clauses',payload([text]))
for(const reverse of [false,true]){
 const attack="Morgan Sample told the House that the ANAO's findings were flawed and Minister Rowan Ellery failed every test of integrity."
 p=payload(reverse?[attack,record]:[record,attack]);speech(p,reverse?0:1)
 add('r4-criticism-'+reverse,'ANAO criticism versus record',p,{recordFirst:record})
}
const old=JSON.parse(readFileSync(new URL('../ask-dedupe/02-robodebt-near-repeats.json',import.meta.url)))
add('robodebt-original','Saved original robodebt',old,{question:'Who was responsible for robodebt?',retain:['a costly failure of public administration','Letters Patent','18 August 2022','Catherine Holmes','7 July 2023','the Ombudsman was deliberately misled']})
const live=JSON.parse(readFileSync(new URL('../ask-dedupe/03-robodebt-live-182.json',import.meta.url)))
add('robodebt-182','Saved robodebt 182',live,{question:'Who was responsible for robodebt?',retain:live.answer.split('\n\n').flatMap((text,i)=>i===2?[text.split('; ')[1]]:[text])})
for(const [id,q,lines]of [
 ['date','When was the report released?',['The report was released on 7 July 2023.','The commission delivered the report to the Governor-General.']],
 ['count','How many recommendations did the report make?',['The report made 57 recommendations.','The inquiry considered the recovery scheme.']],
 ['cost','What did the programme cost?',['The programme cost $17 million in 2022.','The report described the expenditure.']],
 ['committee','What did the committee consider?',['The committee considered housing policy.','Its report discussed the availability of rentals.']],
 ['division','What happened in the division?',['The House passed the bill on 3 May 2023.','The division recorded 17 votes in favour.']],
])add('ordinary-'+id,'Ordinary controls',payload(lines),{question:q,ordinary:true})

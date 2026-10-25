// Questions are generated from conjugation, aspect, party and ranking grammars.
export const verbs = [
 ['give','gives','gave','given','giving',true],
 ['donate','donates','donated','donated','donating',true],
 ['fund','funds','funded','funded','funding',false],
 ['bankroll','bankrolls','bankrolled','bankrolled','bankrolling',false],
 ['back','backs','backed','backed','backing',false],
 ['support','supports','supported','supported','supporting',false],
 ['prop up','props up','propped up','propped up','propping up',false],
 ['contribute','contributes','contributed','contributed','contributing',true],
]
export const parties = ['Labor','the Liberal Party','the Greens']
export const tenses = [
 ['present',v=>v[1]],['past',v=>v[2]],['perfect',v=>'has '+v[3]],
 ['progressive',v=>'is '+v[4]],['past progressive',v=>'was '+v[4]],
 ['past perfect',v=>'had '+v[3]],['perfect progressive',v=>'has been '+v[4]],
 ['future',v=>'will '+v[0]],
]
export const superlatives = ['biggest','top','largest','major','main']
export const roles = ['donor','backer','supporter','benefactor','funder','contributor']
export const cases = [
 ...tenses.flatMap(([tense,conjugate])=>parties.flatMap(party=>['the most','most'].map(form=>({
  question:`Who ${conjugate(verbs[6]).replace(/ up$/,'')} ${party} up ${form}?`,verb:'prop up',tense,party,form:'separable '+form,
 })))),
 ...verbs.flatMap(v=>tenses.flatMap(([tense,conjugate])=>parties.flatMap(party=>[
  {question:`Who ${conjugate(v)} ${v[5]?'the most money to ':''}${party}${v[5]?'':' the most'}?`,verb:v[0],tense,party,form:'most money'},
  {question:`Who ${conjugate(v)} ${v[5]?'the most to ':''}${party}${v[5]?'':' most'}?`,verb:v[0],tense,party,form:'most'},
 ]))),
 ...roles.flatMap(role=>superlatives.flatMap(form=>parties.flatMap(party=>[
  {question:`Who is the ${form} ${role} to ${party}?`,role,party,form},
  {question:`Who is ${party}'s ${form} financial ${role}?`,role,party,form},
 ]))),
]
export const controls = [
 'Who has given evidence about Labor housing policy?',
 'Who has donated the most to Labor in Victoria?',
 'Who is giving evidence to the Greens committee?',
 'Who funded Labor housing research and why?',
 'Who backed Labor in parliament?',
 'Who supports the Liberal Party housing policy?',
 'Who props up Labor in the opinion polls?',
 'Who contributed to Labor housing policy?',
 'Who is the main contributor to the Greens manifesto?',
 'Who is the largest supporter of Labor in Victoria?',
 'Who bankrolled Labor and the Liberal Party?',
 'Who gave the most to Labor excluding banks?',
 'Who is Labor’s biggest donor in Queensland?',
 'Who is giving the most money to Labor and why?',
 'Who has donated the most money to Labor from Westpac?',
 'How much money did Westpac give Labor?',
 'Which banks lent money to Labor?',
 'What does Labor say about funding hospitals?',
 'The bill funds hospitals.',
 'Who backs the housing bill?',
 'Who does Labor take advice from?',
 'Which party receives the most receipts?',
 'Who is the largest backer of housing reform?',
 'What about the Greens housing policy?',
]

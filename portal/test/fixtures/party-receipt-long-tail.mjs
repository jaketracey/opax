// New R7 grammar: plural owners × role × degree; contractions × parties ×
// verbs. R8 retains only the explicitly allowed spelling corrections.
const pluralParties=[['Greens','the Greens'],['Nationals','the Nationals']]
const degrees=['top','biggest','largest','main','major']
const roles=['donors','backers','supporters','benefactors','funders','contributors']
const round7Cases=[
 ...pluralParties.flatMap(([party,owner])=>degrees.flatMap(degree=>roles.flatMap(role=>["'",'’'].map(apostrophe=>({question:`Who are ${owner}${apostrophe} ${degree} ${role}?`,party,form:'plural possessive'}))))),
 ...['Labor','the Liberal Party','the Greens'].flatMap(party=>['giving','donating','funding','bankrolling','backing','supporting'].flatMap(verb=>["Who's",'Who’s','Whos'].map(who=>({question:`${who} been ${verb} ${['giving','donating'].includes(verb)?'the most money to ':''}${party}${['giving','donating'].includes(verb)?'':' the most'}?`,party:party.replace(/^the /,'').replace('Liberal Party','Liberal'),form:'who has been'})))),
 ...['Labor','the Liberal Party','the Greens'].flatMap(party=>['given','donated','funded','bankrolled','backed','supported'].flatMap(verb=>["Who've",'Who’ve'].map(who=>({question:`${who} ${verb} ${['given','donated'].includes(verb)?'the most money to ':''}${party}${['given','donated'].includes(verb)?'':' the most'}?`,party:party.replace(/^the /,'').replace('Liberal Party','Liberal'),form:'who have'})))),
 ...['Labor','the Liberal Party','the Greens'].flatMap(party=>[
  'Who donates teh most to PARTY?', 'Who donates the msot to PARTY?',
  'Who gives the most money to PARTY?', 'Who are the tpo donors to PARTY?',
  'Who is the bxxgest donor to PARTY?', 'Who is the lxxgest donor to PARTY?',
  'Who is the largest donar to PARTY?', 'Who is the top suppoxxer of PARTY?',
  'Who banxxolls PARTY the most?', 'Who is the top benefxctor to PARTY?',
 ].map(question=>({question:question.replace('PARTY',party),party:party.replace(/^the /,'').replace('Liberal Party','Liberal'),form:'keyword typo'}))),
 ...[['Labro','Labor'],['Labour','Labor'],['Libreal','Liberal'],['Liberxx','Liberal'],['Greezs','Greens'],['Natxxnals','Nationals']].flatMap(([typo,party])=>['Who gives the most money to PARTY?','Who are the top donors to PARTY?'].map(q=>({question:q.replace('PARTY',typo),party,form:'party typo'}))),
]
// These 36 R7 cases depended on edit distance; keep them as ordinary-route
// controls, and expose every removed wording for the evidence report.
export const removedCases=round7Cases.filter(c=>c.form==='party typo'||c.form==='keyword typo'&&!/\bteh\b|Who gives the most money/.test(c.question))
export const cases=round7Cases.filter(c=>!removedCases.includes(c))
export const fixedCases=['Labor','the Liberal Party','the Greens'].flatMap(party=>[
 'Who dontes the most to PARTY?', 'Who donates hte most to PARTY?',
 'Who donates teh most to PARTY?', 'Who gives the most moeny to PARTY?',
 'Who gives donatoins to PARTY?',
].map(question=>({question:question.replace('PARTY',party),party:party.replace(/^the /,'').replace('Liberal Party','Liberal')})))
export const regressions=[
 'Who funds Liberty?', 'Who funds Nationalism?', 'Who founded Labor?',
 'Who gave Labor its name?', 'Who gave Labor advice?', "Labor's biggest donor reform bill",
]
export const negatives=[
 'What is the most popular Labor policy?', 'Who funds the ABC?', "Greens' top priorities",
 'What are the Nationals’ biggest policy priorities?', 'Who finds Labor policy most appealing?',
 'Which Greens policy gives people the most support?', 'Who is the biggest supporter of Labor housing policy?',
 'Who donated blood most often at the Labor conference?', 'Who is the top contributor to the Greens manifesto?',
 'Who gave evidence on the biggest Labor policy change?',
 ...regressions,
 'Who funds the Liberty Party?', 'Who funds the Nationalism Party?',
 'Who founded the Greens?', 'Who has founded Labor?', 'Who founded Labor with the most money?',
 'Who gave Labor its name in the first place?', 'Who gave Labor support for a bill?',
 'Who gave the most advice to Labor?', 'Who gives the Greens the most support for a bill?',
 'Who are Labor’s biggest donor reform bill supporters?', "The Greens' largest donor reform bill",
 'What is Labor’s top donor reform policy?', 'Who supports Labor’s top policy?',
 'Who is Labor’s most popular leader?', 'Who proposed Labor’s top funding bill?',
 'Who gave the largest speech to Labor?', 'Who is the largest donor to Labor housing reform?',
 'Who are the Nationals’ top priorities aimed at?', 'Who gives Labor the most advice?',
 'Who gave Labor the most support for a bill?', 'Who founded the Liberal Party?',
 'Who are the biggest donors to Liberty?', 'Who are the biggest donors to Nationalism?',
 'Who funds Labour?', 'Who funds Libreal?', 'Who funds Greezs?',
 'Waht are Labor’s top priorities?', 'Who funds the ABC the most?',

]
export const reproductions=["Who are the Greens' top donors?","the Nationals' biggest backers","Who's been giving the most money to the Greens?","Who've given the most money to Labor?",'who donates teh most to labor']
export const uncertain=[
 {question:'Who Labor top donors?',parties:['Labor']},
 {question:'Who are the top Labor donors?',parties:['Labor']},
 {question:'Show the largest Labor receipts',parties:['Labor']},
 {question:'Who Labor most money?',parties:['Labor']},
 {question:'Who gives Labor the largest amount?',parties:['Labor']},
]

export const removedClarifications=[
 'Who donates tehmost to Labor?', 'Who givvinng the most money to Labor?',
 'Who are the top fundes to Labor?', 'Who gives the most money to LAP?',
]

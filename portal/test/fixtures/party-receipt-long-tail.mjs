// New R7 grammar: plural owners × role × degree; contractions × parties ×
// verbs; and bounded keyword/party spelling variants. No generated prose.
const pluralParties=[['Greens','the Greens'],['Nationals','the Nationals']]
const degrees=['top','biggest','largest','main','major']
const roles=['donors','backers','supporters','benefactors','funders','contributors']
export const cases=[
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
export const negatives=[
 'What is the most popular Labor policy?', 'Who funds the ABC?', "Greens' top priorities",
 'What are the Nationals’ biggest policy priorities?', 'Who finds Labor policy most appealing?',
 'Which Greens policy gives people the most support?', 'Who is the biggest supporter of Labor housing policy?',
 'Who donated blood most often at the Labor conference?', 'Who is the top contributor to the Greens manifesto?',
 'Who gave evidence on the biggest Labor policy change?',
]
export const reproductions=["Who are the Greens' top donors?","the Nationals' biggest backers","Who's been giving the most money to the Greens?","Who've given the most money to Labor?",'who donates teh most to labor']
export const uncertain=[
 {question:'Who Labor top donors?',parties:['Labor']},
 {question:'Who donates tehmost to Labor?',parties:['Labor']},
 {question:'Who givvinng the most money to Labor?',parties:['Labor']},
 {question:'Who are the top fundes to Labor?',parties:['Labor']},
 {question:'Who gives the most money to LAP?',parties:['Labor','LNP']},
]

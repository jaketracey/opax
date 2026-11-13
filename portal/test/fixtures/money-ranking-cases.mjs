// Independent offline checks against the checked-in published graph.
const industry=(id,industry,questions)=>questions.map((question,i)=>({id:`${id}-${i+1}`,question,industry}))
const party=(party,questions)=>questions.map((question,i)=>({id:`party-${party.toLowerCase()}-${i+1}`,question,party}))
export const moneyRankingCases=[
 ...industry('gambling','gambling',['Who takes the most money from the gambling lobby?','Which party gets the most from gambling companies?']),
 ...industry('mining','mining',['Who takes the most money from the mining lobby?','Which party gets the most money from mining companies?']),
 ...industry('property','property',['Who takes the most money from property developers?','Which party receives the most donations from property developers?']),
 ...industry('unions','unions',['Who receives the most union money?','Which party gets the most money from trade unions?']),
 ...industry('tobacco','tobacco',['Who takes money from the tobacco lobby?','Which party gets the most donations from tobacco companies?']),
 ...industry('banks','finance',['Who gets the most money from banks?','Which party receives the most money from banking?']),
 ...industry('finance','finance',['Who takes the most money from finance?','Which party gets the most from the financial sector?']),
 ...party('Labor',['Who gives the most to Labor?','Who are the biggest donors to the ALP?']),
 ...party('Liberal',['Who gives the most to Liberal?','Who funds the Liberal Party?']),
 ...party('Greens',['Who gives the most to Greens?','Who are the biggest donors to the Australian Greens?']),
 ...party('One Nation',['Who gives the most money to One Nation?','Who are the biggest donors to One Nation?']),
 ...industry('gambling-labor','gambling',['How much has Labor received from the gambling industry?','How much has gambling donated to Labor?']).map(c=>({...c,party:'Labor',total:true})),
 ...industry('since','gambling',['Who takes the most gambling money since 2019?','Which party gets the most money from gambling since 2019?']).map(c=>({...c,from:2018,to:2024})),
 ...industry('banks-labor','finance',['How much have the banks donated to Labor?','How much has Labor received from banks?']).map(c=>({...c,party:'Labor',total:true})),
 // Jake, 13 Nov 2026 (live web Ask): a relative period plus a start year is read and answered.
 ...industry('fossil-since','fossil_fuels',['Who receives the most funding from fossil fuel donors last few years since 2023']).map(c=>({...c,from:2022,to:2024,publishedOnly:true})),
 ...industry('gambling-year','gambling',['Who takes the most gambling money in 2020–21?','Which party gets the most money from gambling in 2020?']).map(c=>({...c,from:2020,to:2020})),
]

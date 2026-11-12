// Ranking scope resolution. Ranking reconstruction (and its allowlist) was removed; the scope helpers remain.
import test from 'node:test'
import assert from 'node:assert/strict'
import {resolvedRankingScope,rankingScopeMatches} from '../src/research-ranking-scope.mjs'
function synthetic(period='2019–20',entity_type='company'){
 return {resource:'fact-1',kind:'record',cited:true,url:'/money?jur=federal&party=party:One%20Nation',entity_type,receipt:{party:'One Nation',source:'Selected Company',amount:161787,period,jurisdiction:'federal'},snippet:`Selected Company: $161,787, 2 disclosed receipt records. Period: ${period}.`}
}
test('explicit date endpoints are not collapsed to a year',()=>{
 const q='Who gives the most money to One Nation in federal disclosures from 2019-01-01 to 2019-06-30?',scope=resolvedRankingScope(q)
 assert.equal(scope.period,'date:2019-01-01:2019-06-30')
 assert.equal(rankingScopeMatches(q,{source:synthetic(),party:'One Nation',period:'2019–20'}),false)
})
test('matching financial-year ranges normalize correctly',()=>{
 const q='Who gives the most money to One Nation in federal disclosures from 2019–20 to 2020–21?',constraints={period:{kind:'window',since:'2019-07-01',until:'2021-06-30',label:'2019–20 to 2020–21'}},scope=resolvedRankingScope(q,constraints)
 assert.equal(scope.period,'fy:2019-20:fy:2020-21')
 assert.equal(rankingScopeMatches(q,{source:synthetic('2019–20 to 2020–21'),party:'One Nation',period:'2019–20 to 2020–21'},constraints),true)
})

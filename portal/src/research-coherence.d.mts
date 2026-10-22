export const danglingOpener:RegExp
export interface RankingSource {resource:string;snippet?:string;kind:string;[key:string]:unknown}
export interface DonorRow {name:string;party:string;amount:string;value:number;period?:string;source:RankingSource}
export function donorRanking(question:string,sources?:RankingSource[],constraints?:import('./research-types').QualitativeAnswer['answer_scope']):DonorRow[]
export function coherenceCheck(question:string,payload:any,options?:{direct?:boolean}):{pass:boolean;reasons:string[];orphan:string[];rankingLead:boolean}

export function citationHasSentence(text:string,range:unknown):boolean

export function protectedDecision(payload:any):boolean
export function answerDecision(payload:any):import('./research-types').AnswerDecision|undefined
export function canReconstructRanking(payload:any,question:string):boolean

export function selectedDonorFacts(question:string,sources?:RankingSource[],constraints?:import('./research-types').QualitativeAnswer['answer_scope']):DonorRow[]

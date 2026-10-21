export const danglingOpener:RegExp
export interface RankingSource {resource:string;snippet?:string;kind:string;[key:string]:unknown}
export interface DonorRow {name:string;party:string;amount:string;value:number;period?:string;source:RankingSource}
export function donorRanking(question:string,sources?:{resource:string;snippet?:string;kind:string}[]):DonorRow[]
export function coherenceCheck(question:string,payload:any,options?:{direct?:boolean}):{pass:boolean;reasons:string[];orphan:string[];rankingLead:boolean}

export function citationHasSentence(text:string,range:unknown):boolean

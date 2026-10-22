import type {QualitativeAnswer} from './research-types'
import type {DonorRow,RankingSource} from './research-coherence.mjs'
type Constraints=QualitativeAnswer['answer_scope']
export const partyAliases:[string,RegExp][]
export function resolvedRankingScope(question:string,constraints?:Constraints):Record<string,string|undefined>
export function sourceMetadata(source:RankingSource):{party:string;jurisdiction:string;chamber?:string;entity_type?:string}
export function rankingScopeMatches(question:string,row:DonorRow,constraints?:Constraints):boolean
export function rankingCoverageMatches(question:string,source:RankingSource,rows:DonorRow[],constraints?:Constraints):boolean
export function associatedRankingPeriod(source:RankingSource,recipient:string,sources:RankingSource[]):string|undefined
export function rankingFactMatches(question:string,source:RankingSource,claim:{value?:unknown;unit?:string},constraints?:Constraints):boolean
export function rankingSourceMatches(question:string,source:RankingSource,constraints?:Constraints):boolean

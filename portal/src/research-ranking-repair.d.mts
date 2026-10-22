import type {DonorRow} from './research-coherence.mjs'
import type {QualitativeAnswer} from './research-types'
export interface RankingRepairForm {party:string;jurisdiction:string;entity_type:'company'|'donor';period?:string}
export function rankingRepairQuestion(question:string,constraints?:QualitativeAnswer['answer_scope'],options?:{unqualified?:boolean}):RankingRepairForm|null
export function repairSlotsMatch(form:RankingRepairForm|null,question:string,row:DonorRow&{entity_type?:string},constraints?:QualitativeAnswer['answer_scope']):boolean

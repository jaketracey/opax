export interface AuditedClaim {
  type:string; entity:string; metric:string; value:string; unit?:string; period:string[]; quote?:string
  text:string; offset?:number; evidence_ids:string[]; status:string; reason?:string
}
export interface ClaimAudit {claims:AuditedClaim[];findings:AuditedClaim[];counts:{claims:number;figures:number;entities:number;periods:number;quotes:number;unverified:number}}
export function auditPayload(question:string,payload:{answer?:unknown;sources?:unknown;citations?:unknown},options?:{roster?:string[]}):ClaimAudit

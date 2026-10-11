import type {WithheldPhrases} from '../public/donor-entity.js';
export function tableIdentityIndex(read:(path:string)=>Promise<any>):Promise<{phrases:WithheldPhrases;values:string[];recipientValues:string[];safe:(text:unknown)=>boolean;check:(text:unknown)=>boolean}>;

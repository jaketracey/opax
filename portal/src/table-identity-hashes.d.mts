export interface IdentityHashEntry {hash:string;words:number;compact?:boolean;length?:number;rolling?:number}
export function identityRollingHash(value:string):number;
export function identityHashEntry(value:string):Required<IdentityHashEntry>;
export function compileHashedIdentityCheck(entries:IdentityHashEntry[], strippedLengths?:number[], options?:{mode?:'query'|'row'}):(value:unknown)=>boolean;
export function csvIdentityCheck(csv:string,blocked:(value:string)=>boolean):boolean;

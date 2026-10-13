export interface IdentityHashEntry {hash:string;words:number;compact?:boolean;length?:number;rolling?:number;row?:false|'token'|'field'}
export function identityRollingHash(value:string):number;
export function identityHashEntry(value:string,options?:{row?:false|'token'|'field'}):Required<IdentityHashEntry>;
export function compileHashedIdentityCheck(entries:IdentityHashEntry[], strippedLengths?:number[], optionsOrPrefilter?:{mode?:'query'|'row';requireBinding?:boolean}|unknown,binding?:unknown):(value:unknown)=>boolean;
export function csvIdentityCheck(csv:string,blocked:(value:string)=>boolean):boolean;

export function compileBundledIdentityCheck(registryFingerprint:string):(value:unknown)=>boolean;

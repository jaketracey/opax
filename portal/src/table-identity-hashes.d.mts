export function compileHashedIdentityCheck(entries:{hash:string;words:number}[], strippedLengths?:number[], prefilter?:unknown, binding?:unknown):(value:unknown)=>boolean;
export function compileBundledIdentityCheck(registryFingerprint:string):(value:unknown)=>boolean;
export function compileHashedIdentitySubsetCheck(entries:{hash:string;words:number}[], strippedLengths:number[], fullEntries:{hash:string;words:number}[], fullStrippedLengths:number[], prefilter?:unknown, binding?:unknown):(value:unknown)=>boolean;

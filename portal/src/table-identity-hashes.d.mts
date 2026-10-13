export function compileHashedIdentityCheck(entries:{hash:string;words:number}[], strippedLengths?:number[], prefilter?:unknown, binding?:unknown):(value:unknown)=>boolean;
export function compileBundledIdentityCheck(registryFingerprint:string):(value:unknown)=>boolean;

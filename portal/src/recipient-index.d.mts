export function recipientIdentityIndex(read:(path:string)=>Promise<any>):Promise<{phrases:Set<string>;suppliers:Set<string>;profiles:Map<string,any>;check:(text:unknown)=>boolean}>;

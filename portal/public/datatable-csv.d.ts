export function csvFields(csv:string):Generator<string>;
export function csvIdentityCheck(csv:string,blocked:(value:string)=>boolean):boolean;

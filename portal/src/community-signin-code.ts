import {CommunityError} from './community-core'

const encoder=new TextEncoder()

export function requireSignInCodeSecret(env:Env):string {
 const secret=env.COMMUNITY_CODE_MAC_SECRET
 if(typeof secret!=='string'||secret.trim().length<32)throw new CommunityError(503,'This action could not be completed. Please try again shortly.')
 return secret
}

/** Uniform over all 100,000,000 eight-digit strings, including leading zeroes. */
export function randomSignInCode():string {
 const sample=new Uint32Array(1),range=100_000_000
 const ceiling=Math.floor(2**32/range)*range
 do{crypto.getRandomValues(sample)}while(sample[0]>=ceiling)
 return String(sample[0]%range).padStart(8,'0')
}

export async function signInCodeMac(env:Env,challengeId:string,code:string):Promise<Uint8Array> {
 const key=await crypto.subtle.importKey('raw',encoder.encode(requireSignInCodeSecret(env)),{name:'HMAC',hash:'SHA-256'},false,['sign'])
 // Domain separation and an unambiguous encoding bind the code to this challenge.
 return new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(JSON.stringify(['opax-signin-code-v1',challengeId,code]))))
}

export const macHex=(mac:Uint8Array)=>[...mac].map(v=>v.toString(16).padStart(2,'0')).join('')

export async function matchesSignInCode(env:Env,challengeId:string,code:string,storedMac:string):Promise<boolean> {
 const actual=await signInCodeMac(env,challengeId,code)
 const expected=new Uint8Array(storedMac.match(/../g)!.map(byte=>parseInt(byte,16)))
 // Cloudflare's native fixed-size comparator; no JavaScript string comparison.
 return crypto.subtle.timingSafeEqual(actual,expected)
}

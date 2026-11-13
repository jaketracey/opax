export {donorDisclosure,donorLabelHTML,donorDisplayText,donorLookup,receiptFigures,receiptGraph,receiptGraphScope,receiptScopeLabel,hasPartyReceipts,DONOR_DECLARED_ONLY} from './donor-disclosure.js';
import type {DonorDisclosureRecord} from './donor-disclosure.js';
export function loadMoneyGraph(path:string):Promise<unknown>;
export function loadDonorViewIndex():Promise<Map<string,DonorDisclosureRecord>>;
export function donorRows<T extends [string,number]>(rows:T[],index?:unknown,limit?:number):T[];

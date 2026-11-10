/** Reserve prose time inside the original primary allowance, including name resolution and selection. */
export { ASK_WRITING_RESERVE_MS as WRITING_RESERVE_MS } from './ask-budgets'
import { ASK_WRITING_RESERVE_MS as WRITING_RESERVE_MS } from './ask-budgets'
export const researchPhaseWallMs = (wallMs:number) => wallMs<1000?wallMs:Math.max(1,wallMs-Math.min(WRITING_RESERVE_MS,Math.floor(wallMs/2)))

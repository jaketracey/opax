/** Reserve prose time inside the original primary allowance, including name resolution and selection. */
export const WRITING_RESERVE_MS = 4_000
export const researchPhaseWallMs = (wallMs:number) => wallMs<1000?wallMs:Math.max(1,wallMs-Math.min(WRITING_RESERVE_MS,Math.floor(wallMs/2)))

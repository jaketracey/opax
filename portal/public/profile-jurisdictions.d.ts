type RosterPerson = {current?: boolean; states?: string[]; chambers?: string[]; representation?: unknown[]; affiliations?: unknown[]} | null | undefined
export type ProfileHouse = {chamber: string; jurisdiction: string; house: string; label: string; status: '' | 'current' | 'former' | 'unknown'}
export function profileJurisdictions(person: RosterPerson): {jurisdictions: {id: string; label: string}[]; chambers: string[]; representations: any[]}
export function profileHouses(person: RosterPerson, seatsNow?: {chamber?: string; jurisdiction?: string}[]): {rows: ProfileHouse[]; parliamentsOnly: string[]}
export function profileAffiliations(person: RosterPerson): any[]

export interface GrantProgram { id: string; key?: string }
export function programKey(id: string): string;
export function resolveProgram<T extends GrantProgram>(programs: T[] | undefined, id: string): T | null;
export function resolveProgramId(programs: GrantProgram[] | undefined, id: string): string | null;

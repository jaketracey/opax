export interface NextStep { kind: string; href: string; text: string; meta?: string }
export const NEXT_STEPS_TITLE: string;
export const NEXT_STEPS_MAX: number;
export function nextStepRows(items?: readonly Partial<NextStep>[]): Required<NextStep>[];
export function nextStepRowHTML(row: NextStep, held?: boolean): string;
export function nextStepsHTML(items?: readonly Partial<NextStep>[], options?: { pageType?: string; id?: string; reserve?: number; level?: number }): string;
export function fillNextSteps(root: Element | null | undefined, items?: readonly Partial<NextStep>[], empty?: string): void;
export function docNextSteps(doc: unknown, helpers?: { personHref?: (name: string) => string; searchHref?: (q: string, filters: Record<string, string>, sort?: string) => string; subject?: string; attributed?: boolean }): NextStep[];
export function supplierNextSteps(profile: unknown, helpers?: { agencyHref?: (name: string) => string; suppliers?: readonly unknown[]; contractTitle?: (contract: any) => string }): NextStep[];
export function recipientNextSteps(data: unknown, helpers?: { jurisdiction?: string; programs?: readonly unknown[]; money?: (value: number) => string; otherHref?: (jurisdiction: string) => string; jurisdictionName?: (jurisdiction: string) => string }): NextStep[];
export function billNextSteps(bill: unknown, helpers?: { divisions?: readonly unknown[]; sponsor?: { name: string; href: string; party?: string | null } | null }): NextStep[];
export function memberNextSteps(record?: { seats?: readonly { name: string; href: string; chamber?: string }[]; party?: { name: string; href: string } | null }): NextStep[];
export function memberVoteSteps(votes?: readonly unknown[]): NextStep[];
export function electorateNextSteps(detail: unknown, helpers?: { members?: readonly unknown[]; personHref?: (person: any) => string; displayName?: (name: string) => string; sitting?: boolean }): NextStep[];
export function vicDistrictNextSteps(seat: unknown, region: unknown, options?: { closed?: boolean }): NextStep[];
export function seriesNextSteps(steps?: { newer?: Partial<NextStep> | null; older?: Partial<NextStep> | null; index?: Partial<NextStep> | null }): NextStep[];

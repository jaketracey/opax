export interface BillDivisionRecord {
  key?: string; date?: string; house?: string; stage?: string; name?: string; question?: string
  outcome?: string; result?: string; ayes?: number; noes?: number
}
export type BillReading = 'third' | 'second';
export type DivisionOutcomeWord = 'Passed' | 'Agreed' | 'Not agreed';
export interface DecidingDivision<D extends BillDivisionRecord = BillDivisionRecord> { division: D; reading: BillReading; outcome: DivisionOutcomeWord }
export function divisionReading(d: BillDivisionRecord, proceduralTitles?: Record<string, string> | null): BillReading | null;
export function divisionOutcomeWord(d: BillDivisionRecord, reading: BillReading): DivisionOutcomeWord;
export function decidingDivision<D extends BillDivisionRecord>(divisions: D[], options?: { proceduralTitles?: Record<string, string> | null; originatingHouse?: string | null }): DecidingDivision<D> | null;

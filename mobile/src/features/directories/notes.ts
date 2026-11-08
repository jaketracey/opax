import type { DirectoryKind } from './model';

export const directoryNotes: Record<DirectoryKind, readonly string[]> = {
  person: [
    'Speech counts include speeches since the 1993 election of 200 or more characters, with procedural rows removed.',
    'Status not confirmed means the records do not say whether this person is still sitting.',
    'Party is the label the person’s speeches carry, or the members register’s where they carry none; many state Hansard rows record neither.',
    'A division is a recorded vote: each member’s choice is counted and published.',
  ],
  party: [
    'Members and speech totals come from the OPAX parliamentary roster. A speech with no party label is not counted.',
    'Receipts are per commission and are not summed: AEC totals already include state branches. Party receipts include internal party transfers; donor totals exclude them.',
  ],
  electorate: [
    'Coverage varies by parliament. A missing member or result has not been confirmed yet.',
    'State outlines use 2025 statistical geography.',
  ],
};
export const divisionNotes = [
  'Only formal divisions are counted; most questions are decided on the voices and leave no per-member record.',
  'Division records on federal bills in this static register are listed here. A bill missing from this list is not evidence it does not exist: the register is still being built.',
];

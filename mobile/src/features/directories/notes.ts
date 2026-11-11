import type { DirectoryKind } from './model';

export const directoryNotes: Record<DirectoryKind, readonly string[]> = {
  person: [
    'Speech counts include speeches since the 1993 election of 200 or more characters, with procedural rows removed.',
    'Status not confirmed means the records do not say whether this person is still sitting.',
    'Sitting party affiliations use current parliamentary seats or an explicitly current federal register entry. Other party affiliations include recorded speech labels and past seats.',
    'A division is a recorded vote: each member’s choice is counted and published.',
  ],
  party: [
    'Sitting members include federal, state and territory parliamentarians with a confirmed current party affiliation. Each person is counted once per party, using the same records as the party page and People directory.',
    'Speech totals come from the OPAX parliamentary roster. A speech with no party label is not counted.',
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

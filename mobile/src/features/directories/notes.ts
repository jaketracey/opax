import type { DirectoryKind } from './model';

export const directoryNotes: Record<DirectoryKind, readonly string[]> = {
  person: [
    'Names appear as Hansard prints them. Speech counts follow the site’s corpus rule (speeches since the 1993 election, 200+ characters, procedural rows removed). Verified representatives are included independently of that threshold; their missing speech totals are labelled explicitly.',
    'Party is the label the person’s speeches carry, or the members register’s where they carry none; many state Hansard rows record neither.',
  ],
  party: [
    'Speech totals and directory membership come from the dated static parliamentary roster. A speech with no party label is not counted.',
    'Receipts are per commission and are not summed: AEC totals already include state branches. Party receipts include internal party transfers; donor totals exclude them.',
  ],
  electorate: [
    'Coverage varies by parliament. A missing representative or result means it has not been verified in this release.',
    'State outlines use 2025 statistical geography.',
  ],
};
export const divisionNotes = [
  'Only formal divisions are counted; most questions are decided on the voices and leave no per-member record.',
  'Division records on federal bills in this static register are listed here. A bill missing from this list is not evidence it does not exist: the register is still being built.',
];

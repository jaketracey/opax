// Methods and Coverage say what OPAX holds and how it works, in the app's own
// words (records.md 6 and 7). The web's Methods page says some of this
// differently; until the web plain-language lane matches it, this copy is the
// app's own, dated by `asAt` (the day it was written and checked against the
// facts the web page states).

/** One paragraph or list of OPAX's own words. */
export interface MethodsSection {
  id:
    | 'what'
    | 'holds'
    | 'ask'
    | 'money'
    | 'cite'
    | 'limits'
    | 'corrections'
    | 'licence';
  title: string;
  paragraphs: readonly string[];
}

export const methodsCopy = {
  title: 'Methods',
  /** The day this copy was last checked against opax.com.au/methods. */
  asAt: '2026-11-09',
  sections: [
    {
      id: 'what',
      title: 'What OPAX is',
      paragraphs: [
        'OPAX brings together public records from parliaments, registers and government publishers, and links each record to its original. It is not the official record. Before you quote anything, check the wording in the original: tap the record’s source line.',
      ],
    },
    {
      id: 'holds',
      title: 'What it holds',
      paragraphs: [
        'Federal speeches from 13 March 1993, the election that seated the longest-serving current federal parliamentarian. State parliaments are covered for shorter periods.',
        'Speeches shorter than 200 characters are left out, as are duplicates and procedural text such as roll calls and day indexes.',
      ],
    },
    {
      id: 'ask',
      title: 'How search and Ask work',
      paragraphs: [
        'Search matches your words and their meaning, then ranks the passages it finds. Ask writes an answer from those passages only and cites each one. Answers are machine-written and can be wrong, so check the records they cite.',
        // The match-tier rule (journeys/search.md 3.3), the one rule that
        // orders suggestions, Top hits and the groups in All.
        'Suggestions as you type match names: a person’s full name and surname, an electorate, a bill’s short title, a party’s full and short name, and a topic and its other names. An exact match comes first, then a name that starts with your words, then a name with a word that does. Within each, current comes before past: sitting members before former members, bills before parliament before passed or lapsed bills, registered parties before deregistered ones. Then A to Z. How often something is searched or reported never changes the order.',
      ],
    },
    {
      id: 'money',
      title: 'Money figures',
      paragraphs: [
        // specs/money.md 1.2: every total states its period.
        'Every total says the years it covers. Donations and grants are counted by financial year, such as 2024–25. Contracts are counted by the calendar year they started. Election returns are counted in the financial year that starts in the election’s year. The date on a source line says when the figures were published, not the years they cover.',
        'Totals are a minimum: donations under the disclosure threshold aren’t published.',
        'Contract values as last published, not amounts paid.',
        // journeys/money.md 9 and 12.3: the both-registers caveat.
        'Appearing in both registers doesn’t show that one led to the other. Figures from different registers are never added together.',
      ],
    },
    {
      id: 'cite',
      title: 'How to cite',
      paragraphs: [
        'Cite a record by its OPAX link, which does not change. Each record’s More menu has Cite, with APA 7, AGLC, BibTeX and RIS formats. Don’t quote an answer from Ask as data: cite the records it names.',
      ],
    },
    {
      id: 'limits',
      title: 'Known limitations',
      paragraphs: [
        'Hansard is a revised record, described as substantially verbatim. It is not a raw transcript.',
        'Some speeches carry no party label.',
      ],
    },
    {
      id: 'corrections',
      title: 'Corrections',
      paragraphs: [],
    },
    {
      id: 'licence',
      title: 'Licence and code',
      paragraphs: ['OPAX’s code is open source under the AGPL-3.0 licence.'],
    },
  ] satisfies readonly MethodsSection[],
  /** OPAX's dated record of changes, newest first, as published. */
  corrections: [
    {
      date: '2026-09-30',
      text: 'Grants by seat. Grant program pages now take each seat’s member and party on the grant date from the parliamentary service records, which date every change of party. They previously used the member’s current party, so a member who later changed party was counted under the later party. A seat that was vacant on the grant date is now left out of the “to seats held by the government of the day” share, as awards without an electorate already were, and shown as a vacant seat. That share changed for 50 federal programs; award totals did not change.',
    },
  ] as readonly { date: string; text: string }[],
  stateCoverageFallback:
    'State parliaments are covered from different years. See Coverage.',
  stateCoverage: (parts: readonly string[]) =>
    `State parliaments are covered from different years: ${parts.join('; ')}.`,
  coverageRow: 'Coverage',
  technicalRow: 'Technical details on opax.com.au',
  correctionRow: 'Report a correction',
  correctionResponse: 'We aim to respond within 2 business days.',
  codeRow: 'Source code on GitHub',
  codeUrl: 'https://github.com/jaketracey/opax',
  sourcesRow: 'Sources and licences',
  sourceCitation: 'opax.com.au',
  sourceOriginal: 'OPAX · Methods page',
  sourceNote:
    'This page follows opax.com.au/methods. Known limitations and state coverage update from the OPAX record summary.',
} as const;

export const coverageCopy = {
  title: 'Coverage',
  bySource: 'By source',
  kinds: 'Records by kind',
  parliaments: 'Speeches by parliament',
  methodsRow: 'Methods',
  summaryCitation: 'OPAX record summary',
  countsCitation: 'OPAX live counts',
  countsNote: 'Counts of what OPAX holds now. They grow as records are added.',
  holdsNote: 'These counts are what OPAX holds, not search totals.',
  loadingSources: 'Loading coverage',
  loadingCounts: 'Loading counts',
  sourcesError: 'Coverage couldn’t be loaded.',
  countsError: 'Counts couldn’t be loaded.',
  pageError: 'Coverage couldn’t be loaded',
  otherRecords: 'Other records',
  otherParliaments: 'Other parliaments',
  records: (n: string) => `${n} records`,
  speeches: (n: string) => `${n} speeches`,
  total: (n: string) => `${n} records in all`,
} as const;

/** Record kinds by their reader names (records.md 7.2); others are summed. */
export const kindNames: Readonly<Record<string, string>> = {
  speech: 'Speeches',
  division: 'Recorded divisions',
  bill: 'Bills',
  bill_text: 'Full bill texts',
  press_release: 'Government releases',
  legal: 'Legislation',
  grant_invitation: 'Grant invitations',
  grant_award: 'Grant award records',
  election_baseline: 'Election results',
  parliamentary_profile: 'Parliamentary profiles',
};

/** Parliaments by their reader names; unknown IDs are summed. */
export const parliamentNames: Readonly<Record<string, string>> = {
  federal: 'Federal Parliament',
  nsw: 'NSW Parliament',
  vic: 'Victorian Parliament',
  qld: 'Queensland Parliament',
  sa: 'South Australian Parliament',
  wa: 'Western Australian Parliament',
  tas: 'Tasmanian Parliament',
  act: 'ACT Legislative Assembly',
  nt: 'Northern Territory Parliament',
};

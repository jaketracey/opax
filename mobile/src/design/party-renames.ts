/**
 * Parties OPAX treats as one party under a later name. A copy of the web's
 * rename record (portal/public/labels.js PARTY_RENAMES): keep the two equal.
 *
 * One party: every name below resolves to one party page, at `name`. Records
 * keep the label they carry: a vote, bill, speech or money record under a
 * former name says so ("Recorded as Liberal Democratic Party"), never the
 * current name.
 */
export interface PartyRename {
  /** The one identity code every name shares. */
  code: string;
  /** The current registered name: the party page's title. */
  name: string;
  /** The current name's registration date. */
  since: string;
  /** Earlier names, each with its other spellings and its end date. */
  former: readonly {
    name: string;
    aliases?: readonly string[];
    until: string;
  }[];
  /** The history line under the party page's heading. */
  history: string;
  /** The notices behind the history line: its source sheet's originals. */
  sources: readonly { label: string; href: string }[];
}

export const PARTY_RENAMES: readonly PartyRename[] = [
  {
    code: 'LDP',
    name: 'Libertarian Party',
    since: '2024-01-12',
    former: [
      {
        name: 'Liberal Democratic Party',
        aliases: ['Liberal Democrats'],
        until: '2022-07-19',
      },
    ],
    history:
      'Liberal Democratic Party (Liberal Democrats), renamed Libertarian Party. The AEC deregistered the Liberal Democratic Party on 19 July 2022 and registered the Libertarian Party on 12 January 2024.',
    sources: [
      {
        label:
          'AEC notice deregistering the Liberal Democratic Party (19 July 2022)',
        href: 'https://www.aec.gov.au/Parties_and_Representatives/Party_Registration/Deregistered_parties/files/statement-of-reasons-liberal-democratic-party-s137-deregistration-statement-of-reasons.pdf',
      },
      {
        label: 'AEC notice registering the Libertarian Party (12 January 2024)',
        href: 'https://www.aec.gov.au/Parties_and_Representatives/Party_Registration/Registration_Decisions/2024/Registration-approved-Notice-Libertarian-Party.pdf',
      },
    ],
  },
];

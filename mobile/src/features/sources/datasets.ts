// Every dataset the app draws on, with the publisher, licence and attribution
// the screens used to print inline. The wording is unchanged from where it
// was shown (About, Person, Party, Bill, Leads); it now lives in one place.
// Coverage files do not publish licence fields: never infer an open licence.

export interface DatasetLink {
  label: string;
  url: string;
}
export interface Dataset {
  id: string;
  name: string;
  publisher: string;
  /** The licence as the record states it; omitted where none is verified. */
  licence?: string;
  /** Attribution and reuse terms, in full. */
  terms: string[];
  links: DatasetLink[];
}

export const statement = [
  'Every figure in OPAX comes from a public record. Source data keeps its own copyright and licence; check the licence on the original record before reuse.',
  'Sources without public reuse rights are excluded from the public site. This app does not grant a new licence over source data.',
];

export const datasets: Dataset[] = [
  {
    id: 'hansard',
    name: 'Hansard and parliamentary records',
    publisher: 'Parliament of Australia',
    licence: 'CC BY-NC-ND',
    terms: [
      'Hansard: Commonwealth copyright, reproduced under CC BY-NC-ND.',
      'Parliamentary copyright. Hansard is reproduced under CC BY-NC-ND terms; check the original source before reuse.',
      'Every speech in the record is cited back to Hansard.',
    ],
    links: [
      {
        label: 'Copyright and disclaimer',
        url: 'https://www.aph.gov.au/Help/Disclaimer_Privacy_Copyright',
      },
    ],
  },
  {
    id: 'interests',
    name: 'Registers of members’ and senators’ interests',
    publisher: 'Parliament of Australia',
    licence: 'CC BY-NC-ND',
    terms: [
      'House and Senate registers of interests carry CC BY-NC-ND terms. OPAX presents extracted facts with links to the source. Queensland interests have no verified licence in the source review.',
    ],
    links: [
      {
        label: 'Copyright and disclaimer',
        url: 'https://www.aph.gov.au/Help/Disclaimer_Privacy_Copyright',
      },
    ],
  },
  {
    id: 'bills',
    name: 'Bills and collected bill texts',
    publisher: 'Parliament of Australia',
    terms: [
      'Bills, their dates and their divisions come from the parliamentary record; each bill page links the official source it was read from.',
      'Collected bill texts are transcribed from original parliamentary documents. Each version links its original document; its copyright and reuse conditions remain those of the original publisher.',
    ],
    links: [{ label: 'ParlInfo', url: 'https://parlinfo.aph.gov.au/' }],
  },
  {
    id: 'tvfy',
    name: 'Divisions and voting records',
    publisher: 'They Vote For You (OpenAustralia Foundation)',
    licence: 'ODbL',
    terms: [
      'Compiled division data: Open Data Commons Open Database Licence. The underlying Hansard retains parliamentary copyright.',
      'Hansard: parliamentary copyright, CC BY-NC-ND terms. They Vote For You compiled division data: Open Database Licence.',
    ],
    links: [
      { label: 'They Vote For You', url: 'https://theyvoteforyou.org.au/' },
    ],
  },
  {
    id: 'aec',
    name: 'Disclosure returns and associated entities',
    publisher: 'Australian Electoral Commission',
    licence: 'CC BY 4.0',
    terms: [
      'AEC disclosure returns, CC BY 4.0.',
      'AEC returns and GrantConnect awards carry Creative Commons Attribution terms. Versions vary by source.',
    ],
    links: [
      {
        label: 'AEC Transparency Register',
        url: 'https://transparency.aec.gov.au/',
      },
    ],
  },
  {
    id: 'aec-electorates',
    name: 'Electorate finder',
    publisher: 'Australian Electoral Commission',
    terms: [
      'Not for address allocation: OPAX’s simplified electorate outlines do not establish your current electorate.',
    ],
    links: [
      { label: 'AEC electorate finder', url: 'https://electorate.aec.gov.au/' },
    ],
  },
  {
    id: 'ipea',
    name: 'Parliamentary expenses',
    publisher: 'Independent Parliamentary Expenses Authority',
    licence: 'CC BY 3.0 AU',
    terms: ['IPEA expenditure reports on data.gov.au: CC BY 3.0 AU.'],
    links: [
      {
        label: 'Independent Parliamentary Expenses Authority',
        url: 'https://www.ipea.gov.au/',
      },
    ],
  },
  {
    id: 'pay',
    name: 'Parliamentary pay',
    publisher: 'Remuneration Tribunal; Parliamentary Handbook',
    terms: [
      'Pay records describe entitlements set by instrument, not payslips. Expenses are reported expenditure. Refer to each record for its source and reuse terms.',
    ],
    links: [
      {
        label: 'Remuneration Tribunal',
        url: 'https://www.remtribunal.gov.au/',
      },
    ],
  },
  {
    id: 'frl',
    name: 'Acts',
    publisher: 'Federal Register of Legislation',
    licence: 'CC BY 4.0',
    terms: ['Act text on the Federal Register of Legislation, CC BY 4.0.'],
    links: [
      {
        label: 'Federal Register of Legislation',
        url: 'https://www.legislation.gov.au/',
      },
    ],
  },
];

// Source review: docs/DATA-MONEY.md sections 1.3 and 1.4. A combined
// export keeps each publisher's own terms, rather than claiming one licence.
datasets.push(
  {
    id: 'ministerial-diaries', name: 'Ministerial diary disclosures',
    publisher: 'NSW Cabinet Office; Queensland Cabinet',
    licence: 'NSW: CC BY 4.0; Queensland: CC BY',
    terms: [
      'NSW Cabinet Office ministers’ diary disclosures are published under the NSW Government CC BY 4.0 copyright statement. Queensland Cabinet ministerial diary disclosures carry CC BY terms. Attribution: NSW Cabinet Office; Queensland Government.',
      'OPAX’s access export joins the published diary disclosures to the guarded parliamentary roster. The original documents retain their publishers’ copyright and licence.',
    ],
    links: [
      { label: 'NSW ministers’ diary disclosures', url: 'https://www.nsw.gov.au/departments-and-agencies/cabinet-office/access-to-information/ministers-diary-disclosures' },
      { label: 'Queensland Cabinet and Ministerial Directory', url: 'https://cabinet.qld.gov.au/ministers-portfolios.aspx' },
    ],
  },
  {
    id: 'lobbyist-registers', name: 'Lobbyist registers',
    publisher: 'Attorney-General’s Department; NSW Electoral Commission; Queensland Integrity Commissioner; Victorian Public Sector Commission; South Australian Department of the Premier and Cabinet; Western Australian Public Sector Commission',
    terms: [
      'Attribution: the six register publishers listed above. Federal, Queensland and Victorian registers carry CC BY 4.0 terms. The NSW source review records CC BY-SA 3.0 AU as unverified. The South Australian register does not state a licence. Western Australian material retains Crown copyright; its website terms discourage automated access.',
      'OPAX’s access export does not publish one combined reuse licence. Check the original register’s terms before reuse.',
    ],
    links: [
      { label: 'Federal register', url: 'https://lobbyists.ag.gov.au/register' },
      { label: 'NSW register', url: 'https://lobbyists.elections.nsw.gov.au/' },
      { label: 'Queensland register', url: 'https://lobbyists.integrity.qld.gov.au/Lobbying-Register/' },
      { label: 'Victorian register', url: 'https://www.lobbyists.vic.gov.au/' },
      { label: 'South Australian register', url: 'https://www.lobbyists.sa.gov.au/' },
      { label: 'Western Australian register', url: 'https://www.lobbyists.wa.gov.au/' },
    ],
  },
  {
    id: 'news', name: 'Politics headlines', publisher: 'ABC News; The Guardian',
    terms: [
      'Headlines are read from the publishers’ public RSS feeds. Copyright remains with ABC News and The Guardian. The news export does not publish a reuse licence. Each headline opens its original article.',
    ],
    links: [
      { label: 'ABC News', url: 'https://www.abc.net.au/news/' },
      { label: 'The Guardian', url: 'https://www.theguardian.com/australia-news' },
    ],
  },
);

export const portraitTerms = {
  official: {
    credit: 'Official portrait',
    licence: 'CC BY-NC-ND 4.0',
    terms:
      'Official portraits of current and former members are Parliament of Australia files, via OpenAustralia, under CC BY-NC-ND 4.0. They are shown unchanged.',
    links: [
      {
        label: 'Licence',
        url: 'https://creativecommons.org/licenses/by-nc-nd/4.0/',
      },
      {
        label: 'Copyright and disclaimer',
        url: 'https://www.aph.gov.au/Help/Disclaimer_Privacy_Copyright',
      },
    ],
  },
  commons:
    'Other photos come from Wikimedia Commons, each under its own licence, cropped to the face by OPAX.',
};

export const code = {
  terms: 'OPAX code: AGPL-3.0.',
  url: 'https://github.com/jaketracey/opax',
};

/** Source terms for a collected corpus source (portal "Licences and reuse"). */
export function collectedSourceTerms(name: string) {
  if (/recorded divisions/i.test(name))
    return 'Hansard: parliamentary copyright, CC BY-NC-ND terms. They Vote For You compiled division data: Open Database Licence.';
  if (
    /Hansard|Parliament|committee hearings|Legislative Assembly/i.test(name) &&
    !/representation/i.test(name)
  )
    return 'Parliamentary copyright. Hansard is reproduced under CC BY-NC-ND terms; check the original source before reuse.';
  if (/AEC donations|GrantConnect award/i.test(name))
    return 'Creative Commons Attribution. The version and reuse conditions are those on the original record.';
  return 'See the original source terms. This coverage snapshot does not publish a verified licence for this source.';
}

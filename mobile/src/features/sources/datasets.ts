// Every dataset the app draws on, with the publisher, licence and attribution
// the screens used to print inline, in plain words (account.md 4.4, records.md
// 8.7): who publishes the data, never how OPAX stores it. Typographic marks
// only; tests/sources-copy.test.ts guards the wording. Coverage files do not
// publish licence fields: never infer an open licence.
import { canonicalUrl } from '../../navigation/external';
import { publicMoneyDatasets } from '../money-public/attribution';

export interface DatasetLink {
  label: string;
  url: string;
}
export interface Dataset {
  id: string;
  name: string;
  publisher: string;
  /** The licence's short name; omitted where none is verified. */
  licence?: string;
  /**
   * The date of the data OPAX holds from this publisher, filled in when the
   * screen reads it (`asOfFor`); a dataset without one says so.
   */
  asOf?: string | null;
  /** Attribution and reuse terms, in full. */
  terms: string[];
  links: DatasetLink[];
}

export const statement =
  'Every figure in OPAX comes from a public record and keeps its publisher’s copyright and licence. Check the licence on the original before reuse. OPAX leaves out sources without public reuse rights and grants no new licence over source data.';

export const datasets: Dataset[] = [
  {
    id: 'parliamentary-directory',
    name: 'Parliamentarian and party directories',
    publisher: 'Parliament of Australia; OPAX',
    terms: [
      'Speech totals and membership in the app come from a dated parliamentary roster. The website’s totals are live and can differ.',
      'Names and recorded affiliations come from Hansard and the parliamentary member registers. The records retain their publishers’ copyright and licence; the directory does not grant a new licence over them.',
      'Portrait credits and their licences are listed under Portraits in Sources and licences. Division records keep the terms listed under Divisions and voting records.',
    ],
    links: [
      { label: 'OPAX parliamentarians', url: canonicalUrl('/subject/person') },
    ],
  },
  {
    id: 'topics-preview',
    name: 'Topic labels and homepage previews',
    publisher: 'OPAX',
    terms: [
      'Topic counts and decade shares describe the labelled record, and not every speech is labelled yet. Original records retain their own copyright and licence.',
      'Homepage previews are copied from OPAX’s homepage, which gives no date.',
    ],
    links: [
      { label: 'Methods and how to cite', url: canonicalUrl('/methods') },
    ],
  },
  {
    id: 'money-qld',
    name: 'ECQ gifts register',
    publisher: 'Electoral Commission of Queensland',
    licence: 'CC BY 4.0',
    terms: [
      'Source: Electoral Commission of Queensland, financial years 2012–13 to 2026–27.',
      'Electoral Commission of Queensland, Electronic Disclosure System (gifts to registered political parties).',
      'Published on data.qld.gov.au as the Electronic Disclosure System: State and Local Election Funding and Donations dataset, under CC BY 4.0.',
    ],
    links: [
      {
        label: 'Electoral Commission of Queensland',
        url: 'https://disclosures.ecq.qld.gov.au/Map',
      },
    ],
  },
  {
    id: 'money-vic',
    name: 'VEC disclosures',
    publisher: 'Victorian Electoral Commission',
    licence: 'No open licence stated',
    terms: [
      'Source: Victorian Electoral Commission, financial years 2020–21 to 2026–27.',
      'Victorian Electoral Commission, VEC Disclosures public portal (donations to registered political parties).',
      'Crown copyright (State of Victoria), published under the Electoral Act 2002 s 217. The portal states no open licence.',
    ],
    links: [
      {
        label: 'Victorian Electoral Commission',
        url: 'https://disclosures.vec.vic.gov.au/public-donations/',
      },
    ],
  },
  {
    id: 'money-tas',
    name: 'TEC disclosures',
    publisher: 'Tasmanian Electoral Commission',
    licence: 'CC BY 4.0',
    terms: [
      'Source: Tasmanian Electoral Commission, financial years 2025–26 to 2026–27.',
      'Tasmanian Electoral Commission: the monthly and seven-day reportable political donation reports on tec.tas.gov.au (1 July 2025 to 2 July 2026 and continuing) together with the TEC Disclosures portal (disclosures lodged from 3 July 2026).',
      'CC BY 4.0, under the TEC copyright statement (tec.tas.gov.au/info/Copyright.html). Attribute “© Tasmanian Electoral Commission”.',
    ],
    links: [
      {
        label: 'Tasmanian Electoral Commission',
        url: 'https://www.tec.tas.gov.au/disclosure-and-funding/registers-and-reports/',
      },
    ],
  },
  {
    id: 'money-commonwealth',
    name: 'Commonwealth grants and contracts',
    publisher: 'Department of Finance',
    licence: 'CC BY 3.0 AU',
    terms: [
      'GrantConnect grant awards (Department of Finance), CC BY 3.0 AU',
      'AusTender contract notices (Department of Finance), CC BY 3.0 AU. A varied contract counts once, at its latest notice’s value.',
    ],
    links: [
      {
        label: 'GrantConnect',
        url: 'https://www.grants.gov.au/',
      },
      {
        label: 'AusTender',
        url: 'https://www.tenders.gov.au/',
      },
    ],
  },
  {
    id: 'money-qld-public',
    name: 'Queensland grants and contracts',
    publisher: 'Queensland Government',
    licence: 'CC BY 4.0',
    terms: [
      'Queensland Government Investment Portal expenditure (data.qld.gov.au), CC BY 4.0',
      'Queensland agencies’ contract disclosure reports, contracts of $10,000 and over (data.qld.gov.au), CC BY 4.0. A varied contract counts once, at its varied total.',
    ],
    links: [
      {
        label: 'Queensland Government Investment Portal',
        url: 'https://www.data.qld.gov.au/dataset/b102c881-2c7f-484a-a8b6-b056fe318964',
      },
      {
        label: 'Queensland contract disclosure reports',
        url: 'https://www.data.qld.gov.au/',
      },
    ],
  },
  {
    id: 'hansard',
    name: 'Hansard and parliamentary records',
    publisher: 'Parliament of Australia',
    licence: 'CC BY-NC-ND',
    terms: [
      'Hansard is parliamentary copyright, reproduced under CC BY-NC-ND terms. Check the original before reuse.',
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
      'They Vote For You’s compiled division data is under the Open Data Commons Open Database Licence. The Hansard behind it keeps parliamentary copyright, under CC BY-NC-ND terms.',
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
      'Australian Electoral Commission annual and election returns, financial years 1998–99 to 2025–26, under CC BY 4.0. The money map adds them up by party and industry.',
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
    id: 'abs-state-districts',
    name: 'State district outlines',
    publisher: 'Australian Bureau of Statistics',
    licence: 'CC BY 4.0',
    terms: [
      'Based on Australian Bureau of Statistics data: ASGS Edition 3, State Electoral Divisions 2025 (statistical approximations), simplified. CC BY 4.0.',
      'Held in the app so a state district can be suggested from your location on the device. Not for address allocation: the outlines approximate electoral boundaries and do not establish your district.',
    ],
    links: [
      {
        label: 'ABS Australian Statistical Geography Standard',
        url: 'https://www.abs.gov.au/statistics/standards/australian-statistical-geography-standard-asgs-edition-3',
      },
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
  {
    id: 'grantconnect',
    name: 'Commonwealth grant programs and awards',
    publisher: 'Department of Finance, GrantConnect',
    licence: 'CC BY 3.0 AU',
    terms: [
      'GrantConnect (Department of Finance), grant award records, under CC BY 3.0 AU.',
    ],
    links: [
      { label: 'GrantConnect', url: 'https://www.grants.gov.au/Ga/List' },
    ],
  },
  {
    id: 'qld-grants',
    name: 'Queensland grant programs',
    publisher: 'Queensland Government, data.qld.gov.au',
    licence: 'CC BY 4.0',
    terms: [
      'Queensland Government Investment Portal consolidated expenditure data (data.qld.gov.au), under CC BY 4.0.',
    ],
    links: [
      {
        label: 'Government Investment Portal',
        url: 'https://www.data.qld.gov.au/dataset/b102c881-2c7f-484a-a8b6-b056fe318964',
      },
    ],
  },
  {
    id: 'austender-agencies',
    name: 'Government agency contract records',
    publisher: 'Department of Finance, AusTender',
    licence: 'CC BY 3.0 AU',
    terms: [
      'AusTender, Department of Finance, under CC BY 3.0 AU. The latest notice for each contract, including amendments.',
      'Agency search results are derived from published AusTender contract records. Refer to the original record for its reuse terms.',
    ],
    links: [{ label: 'AusTender', url: 'https://www.tenders.gov.au/' }],
  },
  {
    id: 'search-catalog',
    name: 'Search and topic labels',
    publisher: 'OPAX',
    terms: [
      'OPAX searches public source records and publishes its topic labels. Source records keep their original copyright and licence.',
      'Machine-written summaries are written by a model; passages are extracts from the record.',
    ],
    links: [{ label: 'OPAX topics', url: canonicalUrl('/subject/topic') }],
  },
];

// Source review: docs/DATA-MONEY.md sections 1.3 and 1.4. A combined
// export keeps each publisher's own terms, rather than claiming one licence.
datasets.push(
  ...publicMoneyDatasets,
  {
    id: 'ministerial-diaries',
    name: 'Ministerial diary disclosures',
    publisher: 'NSW Cabinet Office; Queensland Cabinet',
    licence: 'NSW: CC BY 4.0; Queensland: CC BY',
    terms: [
      'NSW Cabinet Office ministers’ diary disclosures are published under the NSW Government CC BY 4.0 copyright statement. Queensland Cabinet ministerial diary disclosures carry CC BY terms. Attribution: NSW Cabinet Office; Queensland Government.',
      'OPAX joins the published diary disclosures to the parliamentary roster. The original documents retain their publishers’ copyright and licence.',
    ],
    links: [
      {
        label: 'NSW ministers’ diary disclosures',
        url: 'https://www.nsw.gov.au/departments-and-agencies/cabinet-office/access-to-information/ministers-diary-disclosures',
      },
      {
        label: 'Queensland Cabinet and Ministerial Directory',
        url: 'https://cabinet.qld.gov.au/ministers-portfolios.aspx',
      },
    ],
  },
  {
    id: 'lobbyist-registers',
    name: 'Lobbyist registers',
    publisher:
      'Attorney-General’s Department; NSW Electoral Commission; Queensland Integrity Commissioner; Victorian Public Sector Commission; South Australian Department of the Premier and Cabinet; Western Australian Public Sector Commission',
    terms: [
      'Attribution: the six register publishers listed above. Federal, Queensland and Victorian registers carry CC BY 4.0 terms. The NSW source review records CC BY-SA 3.0 AU as unverified. The South Australian register does not state a licence. Western Australian material retains Crown copyright; its website terms discourage automated access.',
      'OPAX publishes no single reuse licence for these records. Check the original register’s terms before reuse.',
    ],
    links: [
      {
        label: 'Federal register',
        url: 'https://lobbyists.ag.gov.au/register',
      },
      { label: 'NSW register', url: 'https://lobbyists.elections.nsw.gov.au/' },
      {
        label: 'Queensland register',
        url: 'https://lobbyists.integrity.qld.gov.au/Lobbying-Register/',
      },
      { label: 'Victorian register', url: 'https://www.lobbyists.vic.gov.au/' },
      {
        label: 'South Australian register',
        url: 'https://www.lobbyists.sa.gov.au/',
      },
      {
        label: 'Western Australian register',
        url: 'https://www.lobbyists.wa.gov.au/',
      },
    ],
  },
  {
    id: 'news',
    name: 'Politics headlines',
    publisher: 'ABC News; The Guardian',
    terms: [
      'Headlines are read from the publishers’ public RSS feeds. Copyright remains with ABC News and The Guardian. OPAX publishes no reuse licence for these headlines. Each headline opens its original article.',
    ],
    links: [
      { label: 'ABC News', url: 'https://www.abc.net.au/news/' },
      {
        label: 'The Guardian',
        url: 'https://www.theguardian.com/australia-news',
      },
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
  title: 'OPAX source code',
  licence: 'AGPL-3.0',
  url: 'https://github.com/jaketracey/opax',
};

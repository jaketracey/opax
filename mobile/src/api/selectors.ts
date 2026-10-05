import type {
  AppEdition,
  BillDetail,
  BillIndex,
  Corpus,
  EditionKind,
  ElectorateDetail,
  ElectorateIndex,
  ExpenseCategories,
  Expenses,
  InterestDetail,
  InterestIndex,
  Manifest,
  Pay,
  PeopleCatalog,
  PhotoCredits,
  PhotoPeople,
  RecentInterests,
  Roster,
  Slugs,
  Votes,
} from './catalog-decoders';
import {
  billDedupeDivisions,
  billDisplay,
  billFoldText,
  billNoteLinks,
  billNoteText,
  billQuestionParts,
  billSentenceCase,
  billSourceLabel,
  billSplits,
  billStage,
} from './bill-transforms';
import {
  personPartyFor,
  partyReceiptsFor,
  receiptParties,
} from './party-transforms';
import { ApiError } from './errors';
import {
  personId,
  personSlug,
  rosterId,
  nameKey,
  nameValues,
  interestKey,
  type PersonId,
} from './ids';
import {
  namedRosterRow,
  joinPerson,
  rosterChambersFor,
  rosterRowFor,
  numericPersonId,
  type PersonProfile,
} from './person-identity';
import {
  billTitleIndex,
  expenseBenchmarks,
  payNameKey,
  payPersonRecord,
  titleKey,
  voteTotals,
} from './transforms';

export interface Provenance {
  label: string;
  url: string;
  licence?: string;
}
export interface Block<T> {
  status: 'ready' | 'missing' | 'error';
  data: T | null;
  asAt: string | null;
  sources: Provenance[];
  stale: boolean;
  savedAt: number | null;
  error?: ApiError;
}
const block = <T>(
  data: T | null,
  asAt: string | null,
  sources: Provenance[] = [],
): Block<T> => ({
  status: data === null ? 'missing' : 'ready',
  data,
  asAt,
  sources,
  stale: false,
  savedAt: null,
});
/** Shared catalog citations for selectors and loader provenance. */
export const catalogSources = {
  people: { label: 'OPAX parliamentary roster', url: '/subject/person' },
  electorates: { label: 'OPAX electorate release', url: '/subject/electorate' },
  bills: {
    label: 'ParlInfo bill records',
    url: 'https://parlinfo.aph.gov.au/',
  },
} satisfies Record<string, Provenance>;
export function suggestionProvenanceFor(
  dates: Record<keyof typeof catalogSources, string | null>,
) {
  const ready = (asAt: string | null, source: Provenance): Block<null> => ({
    ...block(null, asAt, [source]),
    status: 'ready',
  });
  return {
    people: ready(dates.people, catalogSources.people),
    electorates: ready(dates.electorates, catalogSources.electorates),
    bills: ready(dates.bills, catalogSources.bills),
  };
}
export type SearchIdentityCatalogs = Pick<
  ProfileCatalogs,
  'roster' | 'manifest'
> &
  Partial<Pick<ProfileCatalogs, 'slugs' | 'people'>>;
/** Search and the profile header resolve the exact same dated identity. */
export function searchPersonFor(
  slug: string,
  catalogs: SearchIdentityCatalogs,
) {
  if (!catalogs.slugs || !catalogs.people) return null;
  try {
    const identity = joinPerson(
      slug,
      catalogs.slugs,
      catalogs.roster,
      catalogs.people,
      catalogs.manifest,
    );
    const row = identity.rosterRow;
    return {
      name: identity.name,
      party: identity.party ?? undefined,
      partyCurrent: identity.partyCurrent,
      formerly: identity.formerly,
      representation: identity.seats.length
        ? identity.seats.map((seat) => ({
            electorate: seat.name,
            chamber: seat.chamber,
            jurisdiction: seat.jurisdiction,
            state: row?.representation?.find(
              (r) =>
                nameKey(r.electorate) === nameKey(seat.name) &&
                r.chamber === seat.chamber,
            )?.state,
            current: seat.current,
          }))
        : (row?.representation ?? [])
            .filter((r) => r.chamber !== 'senate_committee')
            // Roster representation does not establish whether a seat ended.
            .map((r) => ({ ...r, current: undefined })),
      chambers: rosterChambersFor(
        row ? { ...row, name: identity.name } : undefined,
      ),
      states: row?.states ?? [],
    };
  } catch {
    // Conflicting or missing identities show a name without affiliation/place.
    return null;
  }
}
export function rosterIdentityFor(
  row: Roster['people'][number],
  catalogs: SearchIdentityCatalogs,
) {
  if (!catalogs.slugs || !catalogs.people) return null;
  const candidates = Object.entries(catalogs.slugs.slugs).filter(
    ([, name]) => nameKey(name) === nameKey(row.name),
  );
  return candidates.length === 1
    ? searchPersonFor(candidates[0]![0], catalogs)
    : null;
}
export interface ProfileCatalogs {
  manifest: Manifest;
  roster: Roster;
  slugs: Slugs;
  people: PeopleCatalog;
  votes?: Votes;
  bills?: BillIndex;
  interestIndex?: InterestIndex;
  interest?: InterestDetail;
  pay?: Pay;
  expenses?: Expenses;
  expenseCategories?: ExpenseCategories;
  photoPeople?: PhotoPeople;
  photoCredits?: PhotoCredits;
}
export function fullPortraitName(name: string): boolean {
  const words = name.trim().split(/\s+/);
  return (
    words.length >= 2 &&
    /^[\p{L}][\p{L}'’ʼ-]+$/u.test(words[0]!) &&
    words[0]!.replace(/[^\p{L}]/gu, '').length >= 2
  );
}
const photoPolicy = 'https://www.aph.gov.au/Help/Disclaimer_Privacy_Copyright';
export function portraitFor(
  names: string[],
  people: PhotoPeople,
  credits: PhotoCredits,
  id?: string,
) {
  names = names.filter(fullPortraitName);
  if (!names.length) return null;
  const exact = names.flatMap((name) => {
    const key = name.trim().toLowerCase();
    return Object.hasOwn(people, key) ? [people[key]!] : [];
  });
  // Distinct exact spellings can refer to distinct photos. A folded spelling
  // is only evidence when none of the supplied full names has an exact key.
  const keys = [...new Set(exact.length ? exact : nameValues(people, names))];
  const official =
    id &&
    /^\d+$/.test(id) &&
    Object.values(people).includes(id as import('./ids').PortraitKey);
  if (keys.length > 1 && !official)
    throw new ApiError('invalid-data', 'The portrait identity needs review.');
  const key = official ? (id as import('./ids').PortraitKey) : keys[0];
  if (id && key && /^\d+$/.test(key) && key !== id) return null;
  if (!key) return null;
  if (/^\d+$/.test(key))
    return {
      key,
      path: `/photos/${key}.webp`,
      credit: 'Official portrait',
      licence: 'CC BY-NC-ND 4.0',
      licenceURL: 'https://creativecommons.org/licenses/by-nc-nd/4.0/',
      sourceURL: photoPolicy,
      attribution: '',
      display: 'website-file' as const,
      notice:
        'Official portrait: native display, offline copies and further crops need review against the non-commercial, no-derivatives terms.',
    };
  const c = credits[key];
  if (!c) return null;
  // Preserve the web's per-file terms; app-distribution rights remain decision 13.

  return {
    key,
    path: `/photos/${key}.webp`,
    credit: c.artist || c.credit || 'author not recorded',
    licence: c.licence,
    licenceURL: c.licence_url || c.page,
    sourceURL: c.page,
    attribution: c.attribution,
    display: 'website-file' as const,
    notice: /BY-SA/.test(c.licence)
      ? 'The existing crop is offered under the same share-alike licence. Preserve attribution and licence links.'
      : 'Preserve attribution and licence links; use the existing portrait without a new crop.',
  };
}
function unique<T>(rows: T[], label: string): T | undefined {
  if (rows.length > 1)
    throw new ApiError('invalid-data', `${label} identity needs review.`);
  return rows[0];
}
export function profileFor(id: PersonId, catalogs: ProfileCatalogs) {
  const { people, roster, slugs, manifest } = catalogs;
  const errors: Record<string, ApiError> = {};
  const fail = (key: string, message: string) => {
    errors[key] = new ApiError('invalid-data', message);
  };
  const optionalIdentity = <T>(rows: T[], key: string) => {
    if (rows.length > 1) {
      fail(key, `The ${key} identity needs review.`);
      return undefined;
    }
    return rows[0];
  };
  if (people.meta.release_id !== manifest.release_id)
    throw new ApiError(
      'invalid-data',
      'The person release does not match its manifest.',
    );
  const p = unique(
    people.people.filter((p) => p.person_id === personId(id)),
    'Person',
  );
  if (!p)
    throw new ApiError(
      'not-found',
      'This person is not in the electorate release.',
    );
  const names = [p.name, ...p.aliases];
  const folded = (name: string) =>
    name
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[’‘ʼ`']/g, '');
  let slug: string | undefined;
  for (const name of names) {
    const exact = Object.entries(slugs.slugs)
      .filter(([, n]) => n === name)
      .map(([slug]) => slug);
    const matches = exact.length
      ? exact
      : Object.entries(slugs.slugs)
          .filter(([, n]) => folded(n) === folded(name))
          .map(([slug]) => slug);
    if (matches.length) {
      slug = unique(matches, 'Slug');
      break;
    }
  }
  if (!slug)
    throw new ApiError(
      'not-found',
      'This person is not in the public directory.',
    );
  const row = rosterRowFor(
    [p.name, slugs.slugs[slug]!, ...p.aliases],
    roster,
    p.legacy_person_id,
  );
  const namedRow = namedRosterRow(
    [slugs.slugs[slug]!, p.name, ...p.aliases],
    roster,
  );
  names.push(slugs.slugs[slug]!, ...(row ? [row.name] : []));
  // Surname stubs can index another person or a different historical photo.
  // Keep them for ID resolution, never for a profile's catalog name lookups.
  names.splice(
    0,
    names.length,
    ...names.filter((name) => name.trim().includes(' ')),
  );
  const seats = p.electorates.filter((s) => s.current);
  const identity: PersonProfile = {
    slug: personSlug(slug),
    name: p.name,
    canonicalPersonId: p.person_id,
    rosterPersonId: p.legacy_person_id ?? row?.pid,
    legacyPersonId: numericPersonId(p.legacy_person_id, row),
    rosterRow: row,
    ...personPartyFor(seats, row, namedRow),
    seats,
    sources: manifest.sources.filter((s) => p.sources.includes(s.source_id)),
    asOf: seats[0]?.as_of ?? roster.meta.generated,
  };
  const sources = identity.sources.map((s) => ({
    label: s.label,
    url: s.url,
    licence: s.licence,
  }));
  const keys = [
    ...new Set(
      [
        p.legacy_person_id,
        ...nameValues(catalogs.votes?.names ?? {}, names).flat(),
      ].filter((k): k is string => k !== undefined),
    ),
  ];
  const recs = keys
    .map((k) => catalogs.votes?.records[k])
    .filter((r): r is NonNullable<typeof r> => r !== undefined);
  // Name indexes can contain several jurisdictions, but cannot point at another
  // person's name. The catalog alias list is the only accepted alternate spelling.
  if (recs.some((r) => !names.some((n) => folded(n) === folded(r.name))))
    fail('votes', 'The voting identity needs review.');
  const totals = recs.length && !errors.votes ? voteTotals(recs) : null;
  const titleMap = catalogs.bills ? billTitleIndex(catalogs.bills) : undefined;
  const votes = totals && {
    ...totals,
    for: totals.for.map((v) => ({
      ...v,
      billKey: titleMap?.get(titleKey(v.name))?.key ?? null,
    })),
    against: totals.against.map((v) => ({
      ...v,
      billKey: titleMap?.get(titleKey(v.name))?.key ?? null,
    })),
    method:
      'Only formal divisions are counted; most questions are decided on the voices and leave no per-member record.',
    latestDivisionDate: catalogs.votes?.meta?.latest_division_date ?? null,
    latestDivisionDateByJurisdiction:
      catalogs.votes?.meta?.latest_division_date_by_jurisdiction ?? {},
  };
  const legacyRegisterKey =
    identity.legacyPersonId &&
    catalogs.interestIndex?.people[identity.legacyPersonId]
      ? interestKey(identity.legacyPersonId)
      : undefined;
  const interestKeys = legacyRegisterKey
    ? [legacyRegisterKey]
    : [...new Set(nameValues(catalogs.interestIndex?._by_name ?? {}, names))];
  const registerKey = optionalIdentity(interestKeys, 'interests');
  const interest = catalogs.interest ?? null;
  // ID joins tolerate formal register names; a detail must still agree with
  // the selected index row, so crossed person files cannot be shown.
  const registerName =
    registerKey && catalogs.interestIndex?.people[registerKey]?.name;
  if (
    interest &&
    (registerName
      ? folded(registerName) !== folded(interest.name)
      : !legacyRegisterKey &&
        !names.some((n) => folded(n) === folded(interest.name)))
  )
    fail('interests', 'The register identity needs review.');
  const payNames = names.flatMap((n) => [
    payNameKey(n),
    payNameKey(nameKey(n)),
  ]);
  const payKeys = [...new Set(nameValues(catalogs.pay?.names ?? {}, payNames))];
  const payKey = optionalIdentity(payKeys, 'pay');
  const pay = payKey && catalogs.pay?.people[payKey];
  if (
    pay &&
    ((pay.pid && String(pay.pid) !== identity.legacyPersonId) ||
      (p.jurisdiction !== 'federal' && !pay.pid))
  )
    fail('pay', 'The pay identity needs review.');
  const payData =
    pay?.spells.length && catalogs.pay && !errors.pay
      ? {
          person: pay,
          base: catalogs.pay.base[catalogs.pay.base.length - 1]!,
          sources: catalogs.pay.meta.sources,
          method: catalogs.pay.meta.method,
          notCovered: catalogs.pay.meta.not_covered,
          record: payPersonRecord(catalogs.pay, payKey!),
        }
      : null;
  const expenseKeys = [
    ...new Set(
      [
        identity.legacyPersonId &&
        catalogs.expenses?.people[identity.legacyPersonId]
          ? identity.legacyPersonId
          : undefined,
        ...nameValues(catalogs.expenses?.names ?? {}, names),
      ].filter((k): k is NonNullable<typeof k> => k !== undefined),
    ),
  ];
  const expenseKey = optionalIdentity(expenseKeys, 'expenses');
  const expense = expenseKey
    ? catalogs.expenses?.people[expenseKey]
    : undefined;
  if (expense && !names.some((n) => folded(n) === folded(expense.name)))
    fail('expenses', 'The expenses identity needs review.');
  const expenseData =
    expense && catalogs.expenses && !errors.expenses
      ? {
          person: expense,
          annual: expense.total / Math.max(expense.to - expense.from + 1, 1),
          benchmarks: expenseBenchmarks(catalogs.expenses),
          categories: catalogs.expenseCategories ?? null,
          coverage: {
            from: catalogs.expenses.meta.from,
            to: catalogs.expenses.meta.to,
          },
          note: 'First and last calendar years can be partial. IPEA corrects prior quarters; treat totals as indicative.',
        }
      : null;
  let portrait: ReturnType<typeof portraitFor> = null;
  try {
    portrait =
      catalogs.photoPeople && catalogs.photoCredits
        ? portraitFor(
            names,
            catalogs.photoPeople,
            catalogs.photoCredits,
            identity.legacyPersonId,
          )
        : null;
  } catch {
    fail('portrait', 'The portrait identity needs review.');
  }
  const partyReceipts = partyReceiptsFor(identity.party);
  const tiesByOrg = new Map<string, NonNullable<InterestDetail['ties']>>();
  if (!errors.interests)
    for (const tie of interest?.ties ?? []) {
      const org = tie.organisation.trim();
      const group = tiesByOrg.get(org) ?? [];
      group.push(tie);
      tiesByOrg.set(org, group);
    }
  const ties = [...tiesByOrg].map(([organisation, rows]) => {
    const lead = rows.find((r) => r.kind === 'donor') ?? rows[0]!;
    return {
      ...lead,
      organisation,
      kinds: [...new Set(rows.flatMap((r) => r.kinds))],
      declarations: rows.map((r) => r.register),
      ties: rows,
    };
  });
  if (errors.interests) errors.ties = errors.interests;
  const profile = {
    personId: id,
    slug: personSlug(slug),
    interestKey: registerKey ?? null,
    blocks: {
      identity: block(identity, identity.asOf, sources),
      votes: block(
        votes,
        catalogs.votes?.meta?.content_changed_at ?? null,
        recs.map((r) =>
          r.jurisdiction === 'federal'
            ? {
                label: 'They Vote For You',
                url: `https://theyvoteforyou.org.au/search?query=${encodeURIComponent(p.name)}`,
                licence: 'ODbL',
              }
            : {
                label: `OPAX published ${r.jurisdiction.toUpperCase()} Hansard division sample`,
                url: '/votes.json',
              },
        ),
      ),
      interests: block(
        interest,
        interest?.as_at ?? null,
        interest
          ? [{ label: 'Register of interests', url: interest.source_url }]
          : [],
      ),
      ties: block(
        ties?.length ? ties : null,
        interest?.as_at ?? null,
        [...new Set(ties.flatMap((r) => r.declarations.map((d) => d.url)))].map(
          (url) => ({ label: 'Register of interests', url }),
        ),
      ),
      pay: block(
        payData || null,
        catalogs.pay?.meta.as_of ?? null,
        catalogs.pay?.meta.sources.map((s) => ({
          label: `${s.publisher}: ${s.title}`,
          url: s.url,
        })) ?? [],
      ),
      expenses: block(
        expenseData,
        catalogs.expenses?.meta.generated ?? null,
        catalogs.expenses
          ? [
              {
                label: catalogs.expenses.meta.source,
                url: catalogs.expenses.meta.source_url,
                licence: catalogs.expenses.meta.licence,
              },
            ]
          : [],
      ),
      portrait: block(
        portrait,
        null,
        portrait
          ? [
              {
                label: portrait.credit,
                url: portrait.sourceURL,
                licence: portrait.licence,
              },
            ]
          : [],
      ),
      partyReceipts: block(partyReceipts, receiptParties.generated, [
        {
          label: 'AEC disclosure returns',
          url: 'https://transparency.aec.gov.au/',
        },
      ]),
    },
  };
  for (const [key, value] of Object.entries(profile.blocks))
    if (errors[key]) {
      value.data = null;
      value.status = 'error';
      value.error = errors[key];
    }
  return profile;
}
export function recentBillsFor(bills: BillIndex, limit = 6) {
  return block(
    [...bills.bills]
      .filter((b) => b.introduced)
      .sort((a, b) => b.introduced!.localeCompare(a.introduced!))
      .slice(0, Math.max(0, Math.floor(limit)))
      .map(billDisplay),
    bills.generated_at,
    [catalogSources.bills],
  );
}
// The web register's DECLARED_BUCKET_LABELS (portal/public/app.js).
export function declarationCategoryFor(bucket: string) {
  return (
    (
      {
        shareholdings: 'Shareholding',
        real_estate: 'Real estate',
        trusts: 'Trust',
        directorships: 'Directorship',
        gifts: 'Gift',
        travel: 'Sponsored travel or hospitality',
        memberships: 'Membership or office',
        liabilities: 'Liability',
        other: 'Other interest',
      } as Record<string, string>
    )[bucket] ?? 'Register category not recorded'
  );
}
export interface DeclarationCatalogs {
  roster?: Roster;
  photoPeople?: PhotoPeople;
  photoCredits?: PhotoCredits;
}
/** The register named by this row, rather than the multi-register dataset. */
export function registerSourceLabelFor(item: RecentInterests['items'][number]) {
  if (item.jurisdiction === 'qld')
    return 'Queensland Register of Members’ Interests';
  if (item.jurisdiction === 'federal' && item.chamber === 'senate')
    return 'Register of Senators’ Interests';
  if (item.jurisdiction === 'federal' && item.chamber === 'house')
    return 'Register of Members’ Interests';
  return 'Register of interests';
}
export function recentDeclarationsFor(
  interests: RecentInterests,
  limit = 6,
  catalogs: DeclarationCatalogs = {},
) {
  const items = [...interests.items]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, Math.max(0, Math.floor(limit)));
  return block(
    items.map((item) => {
      let row: Roster['people'][number] | undefined;
      try {
        row = catalogs.roster
          ? rosterRowFor(
              [item.name],
              catalogs.roster,
              /^\d+$/.test(item.person_id)
                ? rosterId(item.person_id)
                : undefined,
            )
          : undefined;
      } catch {
        /* Conflicting roster observations must not invent an affiliation. */
      }
      let portrait: ReturnType<typeof portraitFor> = null;
      if (catalogs.photoPeople && catalogs.photoCredits) {
        try {
          portrait = portraitFor(
            [item.name, ...(row ? [row.name] : [])],
            catalogs.photoPeople,
            catalogs.photoCredits,
            row?.pid,
          );
        } catch {
          /* Ambiguous photo identities keep the blank circle. */
        }
      }
      return {
        ...item,
        ...personPartyFor([], row, row),
        party: row
          ? (personPartyFor([], row, row).party ?? undefined)
          : undefined,
        portrait,
        sourceLabel: registerSourceLabelFor(item),
        category: declarationCategoryFor(item.bucket),
      };
    }),
    interests.meta.generated,
    [...new Set(items.map((item) => item.url))].map((url) => ({
      label: interests.meta.source,
      url,
    })),
  );
}
export function todayFor(
  bills: BillIndex,
  interests: RecentInterests,
  limit = 6,
) {
  return {
    bills: recentBillsFor(bills, limit),
    declarations: recentDeclarationsFor(interests, limit),
  };
}
// The composer's own words for each kind (portal/src/daily-post.ts covers).
const editionKindLabels: Record<EditionKind, string> = {
  politician: 'Parliamentarian',
  bill: 'Bill',
  grant: 'Grant award',
  topic: 'Topic',
  program: 'Grant program',
  largest: 'Largest grants',
};
// Where the edition labels its own text as a model's.
const machineNote = /machine-written|written by a model/i;
// The web's bill-summary attribution when a record carries none
// (portal/public/app.js): a bill edition's text is its stored model summary.
export const billSummaryAttribution =
  'Written by a model from the explanatory memorandum; not the record.';
/**
 * A model's text and its attribution, in the edition's own words. A bill's
 * summary slide carries the record's stored attribution (the web's bill-page
 * wording); then the caption's own "Machine-written …" line; a bill with
 * neither takes the web's default. Other kinds are labelled only when the
 * edition says so.
 */
function editionAttribution(edition: AppEdition['edition']): string | null {
  const summary = edition.slides
    ?.flatMap((slide) =>
      slide.type === 'list' && slide.note?.trim() ? [slide.note.trim()] : [],
    )
    .find((note) => edition.kind === 'bill' || machineNote.test(note));
  const caption = (edition.caption ?? '')
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .find((paragraph) => /^machine-written\b/i.test(paragraph));
  return (
    summary ??
    caption ??
    (edition.kind === 'bill' ? billSummaryAttribution : null)
  );
}
export interface EditionView {
  /** The journal date: the newest posted edition on or before today. */
  date: string;
  kind: EditionKind;
  kindLabel: string;
  title: string;
  /** The post's own paragraphs, verbatim, without its link line. */
  paragraphs: string[];
  /** The page on the public site (path and query; any fragment dropped). */
  path: string;
  /** Set when the edition's text is a model's, with its own attribution. */
  machineWritten: { attribution: string } | null;
  /** The closing slide's source rows and qualifications, verbatim. */
  sourceRows: string[];
}
/**
 * The card's view of a frozen edition. Nothing is composed or reworded: the
 * paragraphs are the post's own text, less two repeats of what the card shows
 * in full (the trailing link, and the title clipped with "…" to fit a post).
 */
export function editionFor({ edition }: AppEdition) {
  const link = new URL(edition.url);
  const paragraphs = edition.text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(
      (paragraph) =>
        paragraph &&
        paragraph !== edition.url &&
        !(
          paragraph.endsWith('…') &&
          paragraph.length > 1 &&
          edition.title.startsWith(paragraph.slice(0, -1).trimEnd())
        ),
    );
  const attribution = editionAttribution(edition);
  const closing = edition.slides?.at(-1);
  const view: EditionView = {
    date: edition.date,
    kind: edition.kind,
    kindLabel: editionKindLabels[edition.kind],
    title: edition.title,
    paragraphs,
    path: `${link.pathname}${link.search}`,
    machineWritten: attribution ? { attribution } : null,
    sourceRows:
      closing?.type === 'source'
        ? closing.rows.map((row) => row.trim()).filter(Boolean)
        : [],
  };
  return block(view, edition.date, [
    { label: 'OPAX daily edition', url: view.path },
  ]);
}
type BillIndexRow = BillIndex['bills'][number];
// Folded search text and display rows are computed once per decoded index
// row, so filtering as the reader types stays cheap.
const billSearchText = new WeakMap<BillIndexRow, string>();
const billDisplayRows = new WeakMap<
  BillIndexRow,
  ReturnType<typeof billDisplay<BillIndexRow>>
>();
function billDisplayRow(b: BillIndexRow) {
  let row = billDisplayRows.get(b);
  if (!row) billDisplayRows.set(b, (row = billDisplay(b)));
  return row;
}
// The web directory's search text (title, short title, sponsor, portfolio,
// status, year), plus the readable sponsor name, folded as the web folds it.
function searchTextFor(b: BillIndexRow) {
  let text = billSearchText.get(b);
  if (text === undefined) {
    text = billFoldText(
      [
        b.title,
        b.short_title,
        b.sponsor,
        billDisplayRow(b).sponsor,
        b.portfolio,
        b.status,
        b.introduced?.slice(0, 4),
      ]
        .filter(Boolean)
        .join(' '),
    );
    billSearchText.set(b, text);
  }
  return text;
}
/** The date a bill last moved: its status date, else when it was introduced. */
export const billActivityDate = (b: {
  status_as_of: string | null;
  introduced: string | null;
}) => b.status_as_of ?? b.introduced ?? null;
export function billsFor(
  index: BillIndex,
  filter: {
    view?: 'before_parliament' | 'recent' | 'all';
    status?: string;
    year?: number;
    parliament?: number;
    /** The originating house's chamber ID ("representatives", "senate"). */
    chamber?: string;
    hasSummary?: boolean;
    /** Every word must appear, as in the web's bill directory. */
    query?: string;
    /** "activity": most recent status date first, then newest introduced. */
    sort?: 'activity';
  } = {},
) {
  const terms = filter.query
    ? billFoldText(filter.query).split(' ').filter(Boolean)
    : [];
  let rows = index.bills.filter(
    (b) =>
      (filter.view !== 'before_parliament' ||
        b.status === 'before_parliament') &&
      (!filter.status || b.status === filter.status) &&
      (filter.year === undefined ||
        Number(b.introduced?.slice(0, 4)) === filter.year) &&
      (filter.parliament === undefined || b.parliament === filter.parliament) &&
      (!filter.chamber || b.originating_house === filter.chamber) &&
      (filter.hasSummary === undefined ||
        b.has_summary === filter.hasSummary) &&
      (!terms.length || terms.every((t) => searchTextFor(b).includes(t))),
  );
  if (filter.view === 'recent')
    rows = [...rows].sort((a, b) =>
      (b.introduced ?? '').localeCompare(a.introduced ?? ''),
    );
  else if (filter.sort === 'activity')
    rows = [...rows].sort(
      (a, b) =>
        (billActivityDate(b) ?? '').localeCompare(billActivityDate(a) ?? '') ||
        (b.introduced ?? '').localeCompare(a.introduced ?? ''),
    );
  return block(rows.map(billDisplayRow), index.generated_at, [
    catalogSources.bills,
  ]);
}
// Statuses in the order a reader follows a bill; anything new follows.
const billStatusOrder = [
  'before_parliament',
  'exposure_draft',
  'passed',
  'lapsed',
];
const billChamberOrder = ['representatives', 'senate'];
/**
 * The values the bill list can be filtered by, each with how many bills in
 * the whole index carry it (the web's filter counts).
 */
export function billFacetsFor(index: BillIndex) {
  const tally = <K>(get: (b: BillIndexRow) => K | null | undefined) => {
    const counts = new Map<K, number>();
    for (const b of index.bills) {
      const value = get(b);
      if (value !== null && value !== undefined && value !== '')
        counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    return counts;
  };
  const rank = (order: string[], value: string) =>
    order.includes(value) ? order.indexOf(value) : order.length;
  const statuses = [...tally((b) => b.status)]
    .sort(
      ([a], [b]) =>
        rank(billStatusOrder, a) - rank(billStatusOrder, b) ||
        a.localeCompare(b),
    )
    .map(([value, count]) => ({
      value,
      label: billSentenceCase(value),
      count,
    }));
  const chambers = [...tally((b) => b.originating_house)]
    .sort(
      ([a], [b]) =>
        rank(billChamberOrder, a) - rank(billChamberOrder, b) ||
        a.localeCompare(b),
    )
    .map(([value, count]) => ({ value, count }));
  const years = [...tally((b) => Number(b.introduced?.slice(0, 4)) || null)]
    .sort(([a], [b]) => b - a)
    .map(([value, count]) => ({ value, count }));
  return block(
    { total: index.bills.length, statuses, chambers, years },
    index.generated_at,
    [catalogSources.bills],
  );
}
export function billFor(bill: BillDetail, index: BillIndex) {
  const deduped = billDedupeDivisions(bill.divisions, bill);
  const display = billDisplay(bill);
  return {
    identity: block(
      {
        key: bill.key,
        title: bill.title,
        shortTitle: bill.short_title,
        status: bill.status,
        statusLabel: billSentenceCase(bill.status) || 'Status not recorded',
        statusAsOf: bill.status_as_of,
        sponsor: display.sponsor,
        sponsorMembers: display.sponsorMembers,
        sponsorParty: display.sponsor_party,
        portfolio: display.portfolio,
        introduced: bill.introduced,
        introducedLabel: display.introducedLabel,
        house: bill.originating_house,
        sponsorPersonId: bill.sponsor_person_id,
      },
      bill.status_as_of,
      bill.sources.map((s) => ({
        label: billSourceLabel(s.kind),
        url: s.url,
        licence: s.licence ?? undefined,
      })),
    ),
    summary: block(
      bill.summary,
      bill.summary?.as_of ?? null,
      bill.sources
        .filter((s) => s.kind === bill.summary?.basis)
        .map((s) => ({
          label: billSourceLabel(s.kind),
          url: s.url,
          licence: s.licence ?? undefined,
        })),
    ),
    keyDates: block(
      bill.key_dates,
      bill.status_as_of,
      bill.key_dates
        .filter((d) => d.url !== null)
        .map((d) => ({ label: d.stage, url: d.url! })),
    ),
    divisions: block(
      {
        collapsed: deduped.collapsed,
        rawRows: bill.divisions,
        rows: deduped.divisions.map((d) => {
          const { head, note } = billQuestionParts(d, bill);
          return {
            ...d,
            outcomeLabel:
              d.outcome === 'affirmative'
                ? 'Agreed to'
                : d.outcome === 'negative'
                  ? 'Negatived'
                  : billSentenceCase(d.outcome),
            // The motion put, when the record names one; otherwise the row
            // is named by its stage and date. The note is the record's prose.
            head,
            note: note ? billNoteText(note) : '',
            // The note's own citations, which the web keeps as links.
            noteLinks: note ? billNoteLinks(note) : [],
            stageLabel: billStage(d.stage),
            splits: billSplits(d),
          };
        }),
        partyBasisNote: index.meta.party_basis_note,
      },
      bill.status_as_of,
      bill.divisions.map((d) => ({
        label: 'They Vote For You division',
        url: d.url,
        licence: 'ODbL',
      })),
    ),
    speeches: block(
      bill.speeches.map((s) => ({
        ...s,
        briefLabel: s.brief ? 'Machine brief' : null,
        url: `/doc/${encodeURIComponent(s.slug)}`,
      })),
      bill.status_as_of,
      bill.speeches.map((s) => ({
        label: s.speaker,
        url: `/doc/${encodeURIComponent(s.slug)}`,
      })),
    ),
    acts: block(
      bill.acts,
      bill.status_as_of,
      bill.acts.map((a) => ({ label: a.title, url: a.frl_uri })),
    ),
    consultation: block(
      bill.consultation ?? null,
      bill.status_as_of,
      bill.consultation
        ? [{ label: 'Consultation page', url: bill.consultation.url }]
        : [],
    ),
    related: bill.related ?? [],
    became: bill.became ?? null,
  };
}
export function electorateFor(seat: ElectorateDetail) {
  return {
    identity: block(
      {
        id: seat.electorate_id,
        name: seat.name,
        chamber: seat.chamber,
        jurisdiction: seat.jurisdiction,
        state: seat.state_code,
        status: seat.status,
      },
      seat.representation_as_of,
      Object.values(seat.sources).map((s) => ({
        label: s.label,
        url: s.url,
        licence: s.licence,
      })),
    ),
    representatives: block(
      seat.representation_status === 'verified' ? seat.representatives : null,
      seat.representation_as_of,
      Object.values(seat.sources).map((s) => ({
        label: s.label,
        url: s.url,
        licence: s.licence,
      })),
    ),
    elections: seat.elections.map((e) =>
      block(
        e,
        e.election.poll_date,
        e.sources
          .map((id) => seat.sources[id])
          .filter((s) => s !== undefined)
          .map((s) => ({ label: s.label, url: s.url, licence: s.licence })),
      ),
    ),
    census: seat.demographics.map((d) =>
      block(
        d,
        String(d.year),
        d.sources
          .map((id) => seat.sources[id])
          .filter((s) => s !== undefined)
          .map((s) => ({ label: s.label, url: s.url, licence: s.licence })),
      ),
    ),
    related: seat.relations,
    rosters: seat.rosters,
    terms: seat.terms,
    coverageNote: 'Gaps indicate missing coverage.',
  };
}
export function yourMPFor(
  id: string,
  index: ElectorateIndex,
  manifest: Manifest,
  chosenStateSeats: string[] = [],
) {
  if (index.meta.release_id !== manifest.release_id)
    throw new ApiError(
      'invalid-data',
      'The seat release does not match its manifest.',
    );
  const seat = index.electorates.find((s) => s.electorate_id === id);
  if (!seat)
    throw new ApiError('not-found', 'This electorate is not in the release.');
  const verified = (s: ElectorateIndex['electorates'][number]) =>
    s.representation_status === 'verified' &&
    s.representation_as_of !== null &&
    !!manifest.coverage.jurisdictions[s.jurisdiction]?.roster_dates.includes(
      s.representation_as_of,
    );
  const senators = index.electorates.filter(
    (s) =>
      s.jurisdiction === 'federal' &&
      s.chamber === 'senate' &&
      s.state_code === seat.state_code &&
      verified(s),
  );
  const stateSeats = index.electorates.filter(
    (s) => s.jurisdiction === seat.state_code && verified(s),
  );
  const sourcesFor = (ids: string[]) =>
    manifest.sources
      .filter((source) => ids.includes(source.source_id))
      .map((source) => ({
        label: source.label,
        url: source.url,
        licence: source.licence,
      }));
  const memberSources = (s: ElectorateIndex['electorates'][number]) =>
    sourcesFor(s.representatives.flatMap((r) => r.person.sources));
  return {
    seat: block(seat, seat.representation_as_of, sourcesFor(seat.sources)),
    members: block(
      verified(seat) ? seat.representatives : null,
      seat.representation_as_of,
      memberSources(seat),
    ),
    senators: senators.map((s) =>
      block(s.representatives, s.representation_as_of, memberSources(s)),
    ),
    verifiedStateSeats: stateSeats,
    stateMembers: stateSeats
      .filter((s) => chosenStateSeats.includes(s.electorate_id))
      .map((s) =>
        block(s.representatives, s.representation_as_of, memberSources(s)),
      ),
    stateRosterVerified: stateSeats.length > 0,
  };
}
export function suggestionsFor(
  query: string,
  roster: Roster,
  seats: ElectorateIndex,
  bills: BillIndex,
) {
  const q = titleKey(nameKey(query));
  if (q.length < 2) return { people: [], electorates: [], bills: [] };
  // Keep the fuller spelling, as the web's slug index does. A folded name
  // identifies a row; a roster pid is not a canonical profile ID.
  const people = new Map<string, Roster['people'][number]>();
  for (const person of roster.people) {
    const key = nameKey(person.name);
    if (
      !(
        person.name.trim().includes(' ') ||
        person.pid ||
        person.full ||
        person.representation?.length
      )
    )
      continue;
    const previous = people.get(key);
    if (!previous || (person.speeches ?? 0) > (previous.speeches ?? 0))
      people.set(key, person);
  }
  return {
    people: [...people.values()].filter((p) =>
      titleKey(nameKey(p.name)).includes(q),
    ),
    electorates: seats.electorates.filter(
      (s) =>
        titleKey(nameKey(s.name)).includes(q) ||
        s.representatives.some((r) =>
          titleKey(nameKey(r.person.name)).includes(q),
        ),
    ),
    bills: bills.bills.filter((b) => titleKey(nameKey(b.title)).includes(q)),
  };
}
export function coverageFor(corpus: Corpus) {
  return block(
    {
      version: corpus.version,
      expectedResources: corpus.expected_resources,
      collectedSpeeches: corpus.collected_speeches,
      sources: corpus.sources,
      inclusion: corpus.inclusion,
      limitations: [
        ...corpus.known_defects,
        ...corpus.refresh.source_limitations,
      ],
      resources: corpus.refresh.resource_counts,
      structuredSources: corpus.refresh.structured_sources,
    },
    corpus.refresh.checked_at,
    [{ label: 'OPAX collection coverage snapshot', url: '/corpus.json' }],
  );
}

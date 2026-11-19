// Sweep every bill's sponsor rows through the app's own resolver and report
// which rows link to a profile and why the rest do not.
//
//   npx tsx scripts/audit-sponsor-links.ts [ref] [--json] [--list] [--web]
//
// --web sweeps the web bill page instead: the link portal/public/app.js at
// <ref> writes for each sponsor (by name, or through sponsor-person.js where
// that ref's app.js loads it), resolved the way the Worker resolves a person
// address (portal/src/index.ts personAt: exact name, then folded name).
//
// Reads only committed export files at <ref> (default origin/main) with
// `git archive`; no network. The slug map is projected from the roster and
// the electorate release the way the Worker's /api/person-slugs builds it
// (portal/src/index.ts loadPeople + portal/src/person-slug.ts slugIndex).
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as d from '../src/api/catalogs';
import { billFor } from '../src/api/selectors';
import { nameKey } from '../src/api/ids';
import { sponsorKey, sponsorRows } from '../src/features/bills/sponsors';

type SponsorCause = (typeof CAUSES)[number];
const CAUSES = [
  'title, honorific or suffix in the printed name',
  'hyphenated or compound surname',
  'middle name or initial',
  'curly vs straight apostrophe',
  'diacritics or case',
  'no person ID in the bills export',
  'full-name row has no pid; a surname stub holds it',
  'ambiguous name (two roster people)',
  'not in the roster (no OPAX profile)',
  'non-member sponsor (an office, not a person)',
  "the ID's roster row names someone else",
  'roster row found but the directory join refused it',
] as const;

const args = process.argv.slice(2);
const ref = args.find((a) => !a.startsWith('--')) ?? 'origin/main';
const root = execFileSync('git', ['rev-parse', '--show-toplevel'], {
  encoding: 'utf8',
}).trim();
const commit = execFileSync('git', ['-C', root, 'rev-parse', ref], {
  encoding: 'utf8',
}).trim();
const dir = mkdtempSync(join(tmpdir(), 'sponsor-audit-'));
try {
  const tar = execFileSync(
    'git',
    [
      '-C',
      root,
      'archive',
      commit,
      'portal/public/bills',
      'portal/public/parliamentarians.json',
      'portal/public/electorates/manifest.json',
    ],
    { maxBuffer: 1 << 30 },
  );
  execFileSync('tar', ['-x', '-C', dir], { input: tar });
  const read = (path: string): unknown =>
    JSON.parse(readFileSync(join(dir, 'portal/public', path), 'utf8'));
  const show = (path: string): unknown =>
    JSON.parse(
      execFileSync('git', ['-C', root, 'show', `${commit}:portal/public${path}`], {
        encoding: 'utf8',
        maxBuffer: 1 << 30,
      }),
    );
  const manifest = d.decodeManifest(read('electorates/manifest.json'));
  const people = d.decodePeople(show(manifest.people_url));
  const electorates = d.decodeElectorateIndex(show(manifest.index_url));
  const roster = d.decodeRoster(read('parliamentarians.json'));
  const slugs = projectSlugs(roster, people);
  const index = d.decodeBillIndex(read('bills/index.json'));
  const directory = { roster, slugs, people, manifest, electorates };
  const web = args.includes('--web');
  const webLands = web ? webResolver(roster, people) : () => null;

  const tally = new Map<SponsorCause | 'linked', number>();
  const examples = new Map<SponsorCause, Set<string>>();
  const listed: { bill: string; name: string; id: string | null; cause: SponsorCause }[] = [];
  const renamed = new Set<string>();
  let bills = 0;
  let total = 0;
  for (const file of readdirSync(join(dir, 'portal/public/bills')).sort()) {
    if (!file.endsWith('.json') || file === 'index.json') continue;
    const bill = d.decodeBill(read(`bills/${file}`));
    const { identity } = billFor(bill, index);
    const { sponsorMembers, sponsorParty, sponsorPersonId } = identity.data!;
    if (!sponsorMembers.length) continue;
    bills++;
    const rows = web
      ? sponsorMembers.map((member) => ({
          slug: webLands(member.name, sponsorMembers.length === 1 ? sponsorPersonId : null),
        }))
      : sponsorRows(sponsorMembers, sponsorParty, sponsorPersonId, directory);
    rows.forEach((row, i) => {
      total++;
      if (row.slug) {
        tally.set('linked', (tally.get('linked') ?? 0) + 1);
        const page = web ? row.slug : slugs.slugs[row.slug]!;
        if (sponsorKey(page) !== sponsorKey(sponsorMembers[i]!.name))
          renamed.add(`${sponsorMembers[i]!.name} -> ${page}`);
        return;
      }
      const member = sponsorMembers[i]!;
      const id = sponsorMembers.length === 1 ? (sponsorPersonId ?? null) : null;
      const cause = sponsorCause(member.name, id, roster);
      tally.set(cause, (tally.get(cause) ?? 0) + 1);
      const seen = examples.get(cause) ?? new Set<string>();
      seen.add(member.name);
      examples.set(cause, seen);
      listed.push({ bill: bill.key, name: member.name, id, cause });
    });
  }
  const linked = tally.get('linked') ?? 0;
  const report = {
    ref,
    commit,
    bills,
    rows: total,
    linked,
    unlinked: total - linked,
    // Linked rows whose page spells the name differently (same person by ID).
    linkedRespelled: [...renamed].sort(),
    causes: Object.fromEntries(CAUSES.map((c) => [c, tally.get(c) ?? 0])),
    examples: Object.fromEntries(
      [...examples].map(([k, v]) => [k, [...v].sort().slice(0, 8)]),
    ),
    ...(args.includes('--list') ? { unlinkedRows: listed } : {}),
  };
  if (args.includes('--json')) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(
      `${web ? 'Web sponsor links' : 'Sponsor rows'} at ${ref} (${commit.slice(0, 8)}): ${bills} bills with a sponsor`,
    );
    if (web) console.log('  (linked = the link opens a full-name roster person the bill names)');
    console.log(`  rows      ${total}`);
    console.log(`  linked    ${linked}`);
    console.log(`  unlinked  ${total - linked}`);
    if (renamed.size) console.log(`  linked to another spelling: ${[...renamed].sort().join('; ')}`);
    for (const [cause, n] of Object.entries(report.causes))
      console.log(`    ${String(n).padStart(5)}  ${cause}${n ? `: ${report.examples[cause]!.join('; ')}` : ''}`);
    if (args.includes('--list'))
      for (const row of listed) console.log(`${row.bill}\t${row.name}\t${row.id ?? ''}\t${row.cause}`);
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}

/** /api/person-slugs as the Worker builds it from these files. */
function projectSlugs(roster: d.Roster, people: d.PeopleCatalog): d.Slugs {
  const fold = (s: string) =>
    s.normalize('NFKC').replace(/[‘’ʼ`]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase();
  const slugOf = (s: string) =>
    s
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/['’‘ʼ`.]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  const rows: { name: string; speeches: number }[] = roster.people.map((p) => ({
    name: p.name,
    speeches: p.speeches ?? 0,
  }));
  const names = new Set(rows.map((p) => fold(p.name)));
  for (const p of people.people) {
    if ([p.name, ...p.aliases].some((n) => names.has(fold(n)))) continue;
    if (!p.electorates.some((s) => s.current)) continue;
    rows.push({ name: p.name, speeches: 0 });
    names.add(fold(p.name));
  }
  const bySlug = new Map<string, { name: string; speeches: number }>();
  for (const p of rows) {
    const slug = slugOf(p.name);
    const holder = bySlug.get(slug);
    if (slug && (!holder || p.speeches > holder.speeches)) bySlug.set(slug, p);
  }
  return d.decodeSlugs({
    generated: roster.meta.generated,
    slugs: Object.fromEntries([...bySlug].map(([slug, p]) => [slug, p.name])),
  });
}


/**
 * Why a sponsor row stays plain text, read from the roster alone so the same
 * classifier explains any version of the resolver. First match wins.
 */
function sponsorCause(
  name: string,
  id: string | null,
  roster: d.Roster,
): SponsorCause {
  type Row = d.Roster['people'][number];
  const loose = (n: string) =>
    nameKey(n)
      .split(' ')
      .filter((w) => !/^(the|hon|senator|sen|dr|mr|mrs|ms|mp|jnr|snr|jr|sr)$/.test(w))
      .join(' ');
  const words = nameKey(name).split(' ');
  const full = (r: Row) => r.name.trim().includes(' ');
  const surname = (n: string) => loose(n).split(' ').at(-1) ?? '';
  const names = (r: Row) => [r.name, r.full].filter((n): n is string => !!n);
  if (/\b(minister|treasurer|attorney|government|committee|office)\b/i.test(name))
    return 'non-member sponsor (an office, not a person)';
  if (
    name.includes(',') ||
    words.some((w) => /^(the|hon|senator|sen|dr|mp|jnr|snr|jr|sr)$/.test(w))
  )
    return 'title, honorific or suffix in the printed name';
  const named = roster.people.filter(
    (r) => full(r) && names(r).some((n) => loose(n) === loose(name)),
  );
  const byId = id ? roster.people.filter((r) => r.pid === id) : [];
  if (id && named.some((r) => r.pid && r.pid !== id))
    return 'ambiguous name (two roster people)';
  if (id && byId.length && byId.every((r) => !full(r)) && named.length)
    return 'full-name row has no pid; a surname stub holds it';
  const sameSurname = roster.people.filter(
    (r) => full(r) && names(r).some((n) => surname(n) === surname(name)),
  );
  const target = byId.find(full) ?? (named.length === 1 ? named[0] : undefined);
  if (!id && named.length > 1) {
    const spellings = new Set(named.map((r) => r.name));
    const plain = new Set(named.map((r) => r.name.replace(/[’‘ʼ`]/g, "'")));
    return plain.size < spellings.size || /[’‘ʼ`']/.test(name)
      ? 'curly vs straight apostrophe'
      : 'ambiguous name (two roster people)';
  }
  if (!target) {
    // A spelling the roster holds with spaces for hyphens (or the reverse).
    const spaced = (n: string) => nameKey(n).replace(/-/g, ' ');
    if (
      /[-‐–]/.test(name) &&
      roster.people.some((r) => full(r) && names(r).some((n) => spaced(n) === spaced(name) && n !== name))
    )
      return 'hyphenated or compound surname';
    if (id) return 'not in the roster (no OPAX profile)';
    return sameSurname.some((r) => r.pid)
      ? 'no person ID in the bills export'
      : 'not in the roster (no OPAX profile)';
  }
  if (id && target.pid === id && !names(target).some((n) => surname(n) === surname(name)))
    return "the ID's roster row names someone else";
  const printed = target.full && !full(target) ? target.full : target.name;
  if (printed === name) return 'roster row found but the directory join refused it';
  if (printed.replace(/[’‘ʼ`]/g, "'") === name.replace(/[’‘ʼ`]/g, "'"))
    return 'curly vs straight apostrophe';
  if (printed.toLowerCase() === name.toLowerCase() || nameKey(printed) === nameKey(name))
    return /[-‐–]/.test(printed + name) && printed.replace(/[-‐–]/g, ' ') !== printed
      ? 'hyphenated or compound surname'
      : 'diacritics or case';
  const a = loose(printed).split(' ');
  const b = loose(name).split(' ');
  if (a.length !== b.length && a.at(-1) === b.at(-1)) return 'middle name or initial';
  if (a.at(-1) !== b.at(-1)) return 'hyphenated or compound surname';
  return id ? 'roster row found but the directory join refused it' : 'no person ID in the bills export';
}

/**
 * The web bill page: where each sponsor link lands, as the roster name it
 * opens, or null when it opens no full-name person the bill names (no roster
 * row, a surname print, or someone holding another ID).
 */
function webResolver(
  roster: d.Roster,
  release: d.PeopleCatalog,
) {
  type Row = { name: string; pid?: string | null; full?: string | null; speeches?: number | null };
  const at = (path: string) =>
    execFileSync('git', ['-C', root, 'show', `${commit}:portal/public/${path}`], {
      encoding: 'utf8',
      maxBuffer: 1 << 30,
    });
  // The bill page resolves sponsors only where app.js loads sponsor-person.js.
  const module = /import\("\/sponsor-person\.js/.test(at('app.js'))
    ? at('sponsor-person.js').replace(/^export /gm, '')
    : null;
  const sponsorPerson = module
    ? (new Function(`${module}; return sponsorPerson;`)() as (
        printed: string,
        pid: string | null,
        people: Row[],
      ) => Row | null)
    : null;
  // loadParliamentarians() / the Worker's loadPeople(): the roster plus
  // current release members it does not name.
  const rows: Row[] = roster.people.map((p) => ({ ...p }));
  const lower = new Set(rows.map((p) => p.name.toLowerCase()));
  for (const p of release.people) {
    if ([p.name, ...p.aliases].some((n) => lower.has(n.toLowerCase()))) continue;
    if (!p.electorates.some((e) => e.current)) continue;
    rows.push({ name: p.name, pid: p.legacy_person_id ?? null, speeches: 0 });
    lower.add(p.name.toLowerCase());
  }
  const foldName = (n: string) =>
    n.normalize('NFKC').replace(/[‘’ʼ`]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase();
  const byName = new Map(rows.map((p) => [p.name, p]));
  const byFold = new Map<string, Row>();
  for (const p of rows) {
    const prev = byFold.get(foldName(p.name));
    if (!prev || (p.speeches ?? 0) > (prev.speeches ?? 0)) byFold.set(foldName(p.name), p);
  }
  return (printed: string, id: string | null | undefined): string | null => {
    const person = sponsorPerson ? sponsorPerson(printed, id ?? null, rows) : null;
    const target = person?.name ?? printed;
    const landed = byName.get(target) ?? byFold.get(foldName(target));
    if (!landed || !landed.name.trim().includes(' ')) return null;
    if (sponsorKey(landed.name) !== sponsorKey(printed) && !(id && landed.pid === id)) return null;
    if (id && landed.pid && landed.pid !== id) return null;
    if (id && !landed.pid && !rows.some((r) => r.pid === id && r.full && sponsorKey(r.full) === sponsorKey(printed)))
      return null;
    return landed.name;
  };
}

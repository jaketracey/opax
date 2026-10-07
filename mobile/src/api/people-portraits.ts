import type { Catalogs } from './catalogs';
import type { PortraitCache } from './portrait-cache';
import { buildPortraitIndexAsync, type PortraitInfo } from './portrait-index';
import { nameKey } from './ids';

/** One verified portrait and whose it is, for Sources and licences. */
export interface PortraitListing {
  slug: string;
  name: string;
  info: PortraitInfo;
}
export class PeoplePortraits {
  private index?: Promise<Awaited<ReturnType<typeof buildPortraitIndexAsync>>>;
  private snapshot?: readonly unknown[];
  private reading?: typeof this.index;
  constructor(
    private catalogs: Catalogs,
    private cache: PortraitCache,
  ) {}
  private directory(refresh = false) {
    if (this.reading && !refresh) return this.reading;
    const pending = Promise.all([
      this.catalogs.directory(refresh),
      this.catalogs.photoPeople(refresh),
      this.catalogs.photoCredits(refresh),
    ]).then(([d, map, credits]) => {
      // ApiClient retains immutable decoded snapshots for unchanged cache bytes,
      // including 304s. Read the current catalogs before reusing the index.
      const snapshot = [
        d.roster.data,
        d.slugs.data,
        d.people.data,
        d.manifest.data,
        map.data,
        credits.data,
      ];
      if (
        !this.index ||
        snapshot.some((data, i) => data !== this.snapshot?.[i])
      ) {
        this.snapshot = snapshot;
        const index = buildPortraitIndexAsync({
          roster: d.roster.data,
          slugs: d.slugs.data,
          people: d.people.data,
          manifest: d.manifest.data,
          photoPeople: map.data,
          photoCredits: credits.data,
        });
        this.index = index;
        void index.catch(() => {
          if (this.index === index) this.index = undefined;
        });
      }
      return this.index!;
    });
    const reading = pending.finally(() => {
      if (this.reading === reading) this.reading = undefined;
    });
    this.reading = reading;
    return reading;
  }
  /**
   * Every portrait the app can show, from the same verified index the
   * screens use (refused and conflicting faces are not in it), one row per
   * file, by name. No image is read.
   */
  async list(): Promise<PortraitListing[]> {
    const index = await this.directory();
    const rows = new Map<string, PortraitListing>();
    for (const [slug, info] of index.portraits) {
      const name = index.identities.get(slug)?.name ?? slug;
      const seen = rows.get(info.key);
      // Twin spellings share one file: keep the fuller name.
      if (!seen || name.length > seen.name.length)
        rows.set(info.key, { slug, name, info });
    }
    return [...rows.values()].sort((a, b) =>
      a.name.localeCompare(b.name, 'en-AU'),
    );
  }
  async get({
    slug,
    name,
    refresh = false,
  }: {
    slug?: string;
    name?: string;
    refresh?: boolean;
  }): Promise<{ info: PortraitInfo; localURI: string } | null> {
    const index = await this.directory(refresh);
    if (!slug && name) {
      const matches = [...index.identities].filter(
        ([, p]) => nameKey(p.name) === nameKey(name),
      );
      if (matches.length === 1) slug = matches[0]![0];
    }
    let info = slug ? index.portraits.get(slug) : undefined;
    // Catalogs.person accepts canonical IDs as route identifiers. Resolve them
    // against the same verified directory identities, never against photo names.
    if (!info && slug?.startsWith('person_')) {
      const candidates = [...index.identities]
        .filter(([, p]) => p.canonicalPersonId === slug)
        .flatMap(([key]) => {
          const portrait = index.portraits.get(key);
          return portrait ? [portrait] : [];
        });
      if (new Set(candidates.map((p) => p.key)).size === 1)
        info = candidates[0];
    }
    return info ? { info, localURI: await this.cache.get(info.key) } : null;
  }
}

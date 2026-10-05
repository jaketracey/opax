import type { Catalogs } from './catalogs';
import type { PortraitCache } from './portrait-cache';
import { buildPortraitIndexAsync, type PortraitInfo } from './portrait-index';
import { nameKey } from './ids';
export class PeoplePortraits {
  private index?: Promise<Awaited<ReturnType<typeof buildPortraitIndexAsync>>>;
  constructor(
    private catalogs: Catalogs,
    private cache: PortraitCache,
  ) {}
  private directory() {
    this.index ??= Promise.all([
      this.catalogs.directory(),
      this.catalogs.photoPeople(),
      this.catalogs.photoCredits(),
    ])
      .then(([d, map, credits]) =>
        buildPortraitIndexAsync({
          roster: d.roster.data,
          slugs: d.slugs.data,
          people: d.people.data,
          manifest: d.manifest.data,
          photoPeople: map.data,
          photoCredits: credits.data,
        }),
      )
      .catch((error) => {
        this.index = undefined;
        throw error;
      });
    return this.index;
  }
  async get({
    slug,
    name,
  }: {
    slug?: string;
    name?: string;
  }): Promise<{ info: PortraitInfo; localURI: string } | null> {
    const index = await this.directory();
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

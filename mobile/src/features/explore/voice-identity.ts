import type {
  Manifest,
  PeopleCatalog,
  Roster,
  Slugs,
} from '../../api/catalog-decoders';
import { joinPerson } from '../../api/person-identity';
import { personPartyFor } from '../../api/party-transforms';
import type { VoiceIdentity } from './model';

/**
 * The party identity behind a Voices row, by slug: the same join the
 * directory, search and profiles use (dated seats first, then the roster).
 * Without the dated release, the roster row alone answers.
 */
export function voiceIdentities(
  roster: Roster,
  slugs: Slugs,
  dated: { manifest: Manifest; people: PeopleCatalog } | null,
): (slug: string) => VoiceIdentity | null {
  return (slug) => {
    if (dated) {
      try {
        return joinPerson(slug, slugs, roster, dated.people, dated.manifest);
      } catch {
        /* An identity the join refuses falls back to its own roster row. */
      }
    }
    const name = slugs.slugs[slug]?.trim();
    const rows = name
      ? roster.people.filter((p) => p.name.trim() === name)
      : [];
    if (rows.length !== 1) return null;
    const row = rows[0]!;
    return { ...personPartyFor([], row, row), rosterRow: row };
  };
}

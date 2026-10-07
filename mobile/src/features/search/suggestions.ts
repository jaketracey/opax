import type { Roster } from '../../api/catalog-decoders';
import type { decodeManifest, decodeReports } from './decoders';
import { topics } from './contracts';
import { nameKey } from '../../api/ids';
export function richerSuggestions(
  q: string,
  roster: Roster,
  manifest: ReturnType<typeof decodeManifest>,
  reports: ReturnType<typeof decodeReports>,
) {
  const key = nameKey(q);
  const matches = (s: string) => nameKey(s).includes(key);
  if (q.trim().length < 2) return { parties: [], topics: [], reports: [] };
  // The manifest identifies available catalog kinds, not topic facets. Topics
  // are the web's pinned static taxonomy, never discovered through a paid API.
  return {
    parties: manifest.counts.party
      ? [
          ...new Set(
            roster.people.flatMap((p) =>
              [p.party, p.party_now].filter((v): v is string => !!v),
            ),
          ),
        ]
          .filter(matches)
          .sort()
          .slice(0, 4)
      : [],
    topics: Object.entries(topics)
      .filter(([, label]) => matches(label))
      .map(([slug, title]) => ({ slug, title }))
      .slice(0, 4),
    reports: manifest.counts.report
      ? reports.reports.filter((r) => matches(r.title)).slice(0, 4)
      : [],
  };
}

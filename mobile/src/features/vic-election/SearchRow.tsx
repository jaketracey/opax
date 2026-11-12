import { fold } from '../search/ranking';
import { LinkRow } from '../../design/rows';
import { vicElectionRoute } from '../../navigation/routes/vic-election';
import { vicCopy as c } from './copy';
import { useElectionNow } from './clock';
import { searchWindow } from './model';
import { useOverview } from './reads';
export function ElectionSearchRow({ q }: { q?: string }) {
  const now = useElectionNow();
  const enabled =
    searchWindow(now) && (q === undefined || fold(q).includes('election'));
  const read = useOverview(enabled);
  if (!enabled || !read.record) return null;
  const date = new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Melbourne',
    day: 'numeric',
    month: 'long',
  }).format(new Date(`${read.record.data.election_day}T12:00:00+11:00`));
  return (
    <LinkRow
      title={q === undefined ? c.title : c.searchTitle(date)}
      detail={q === undefined ? c.browseDetail : undefined}
      symbol="calendar"
      href={vicElectionRoute()}
      testID={
        q === undefined
          ? 'search-browse-vic-election'
          : 'search-suggest-vic-election'
      }
    />
  );
}

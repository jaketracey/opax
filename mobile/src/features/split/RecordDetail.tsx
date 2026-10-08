import { useEffect, useState } from 'react';
import {
  EmptyState,
  ErrorState,
  Group,
  IconButton,
  LoadingState,
  OpaxWebLink,
  RowList,
  Screen,
  errorMessage,
} from '../../design/primitives';
import { shareRecord } from '../../navigation/share';
import BillDetail from '../bills/BillDetail';
import { ElectorateScreen } from '../Electorate';
import { PartyPage } from '../Party';
import { ProfileScreen } from '../Person';
import BillTextReader from '../records/BillTextReader';
import DocumentReader from '../records/DocumentReader';
import {
  resolveSearchPerson,
  resolveSuggestedPerson,
  type PersonDestination,
} from '../search/navigation';
import { sharePath, type RecordEntry } from './entry';

/**
 * One record in an iPad split's detail pane: the app's own native screen
 * for it, drawn `embedded` (the pane bar carries Back and Share).
 */
export function RecordDetail({ entry }: { entry: RecordEntry }) {
  switch (entry.kind) {
    case 'person':
      return <ProfileScreen key={entry.key} slug={entry.key} embedded />;
    case 'party':
      return <PartyPage key={entry.key} input={entry.key} embedded />;
    case 'electorate':
      return <ElectorateScreen key={entry.key} id={entry.key} embedded />;
    case 'bill':
      return <BillDetail recordKey={entry.key} embedded />;
    case 'text':
      return <BillTextReader recordKey={entry.key} embedded />;
    case 'doc':
      return <DocumentReader recordSlug={entry.key} embedded />;
    case 'person-name':
    case 'search-person':
      return <ResolvedPerson entry={entry} />;
  }
}

/**
 * A person found by name or by search catalog slug: their identity is
 * resolved exactly as the phone resolves it before pushing a profile. One
 * without a native profile gets a link to their page on opax.com.au; the
 * pane never leaves the app by itself.
 */
function ResolvedPerson({ entry }: { entry: RecordEntry }) {
  const [state, setState] = useState<{
    key: string;
    retry: number;
    destination?: PersonDestination;
    error?: unknown;
  }>({ key: '', retry: 0 });
  const [retry, setRetry] = useState(0);
  const id = `${entry.kind}:${entry.key}`;
  useEffect(() => {
    let active = true;
    (entry.kind === 'person-name'
      ? resolveSuggestedPerson(entry.key)
      : resolveSearchPerson(entry.key)
    )
      .then((destination) => {
        if (active) setState({ key: id, retry, destination });
      })
      .catch((error: unknown) => {
        if (active) setState({ key: id, retry, error });
      });
    return () => {
      active = false;
    };
  }, [entry.kind, entry.key, id, retry]);
  const current = state.key === id && state.retry === retry ? state : null;
  const destination = current?.destination;
  if (destination && 'route' in destination)
    return (
      <ProfileScreen
        key={destination.route.params.slug}
        slug={destination.route.params.slug}
        embedded
      />
    );
  return (
    <Screen testID="split-person-pending">
      {current?.error ? (
        <ErrorState
          message={errorMessage(current.error)}
          onRetry={() => setRetry((count) => count + 1)}
          testID="split-person-error"
        />
      ) : destination ? (
        <Group testID="person-no-native-profile">
          <EmptyState message="No native profile yet. Native profiles cover verified parliamentarians in the public record." />
          <RowList>
            <OpaxWebLink
              label="Public record on opax.com.au"
              path={destination.web}
            />
          </RowList>
        </Group>
      ) : (
        <LoadingState
          shape="people"
          count={1}
          label="Loading the public record"
          testID="person-loading"
        />
      )}
    </Screen>
  );
}

/** The pane bar's Share, for records whose page is known from the entry. */
export function RecordShare({ entry }: { entry: RecordEntry }) {
  const path = sharePath(entry);
  if (!path) return null;
  return (
    <IconButton
      symbol="square.and.arrow.up"
      accessibilityLabel="Share"
      testID="record-pane-share"
      onPress={() =>
        void shareRecord({ path, title: entry.title ?? entry.key })
      }
    />
  );
}

import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  Button,
  EmptyState,
  ErrorState,
  Group,
  IconButton,
  LoadingState,
  OpaxWebLink,
  RowList,
  Screen,
  errorMessage,
  menuLeaves,
} from '../../design/primitives';
import { canShare, shareRecord } from '../../navigation/share';
import { recordActions, showPaneMenu } from '../records/RecordActions';
import { useBillTextPane } from '../records/billTextPane';
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
  if (entry.kind === 'doc') return <DocPaneBar entry={entry} />;
  if (entry.kind === 'text') return <BillTextPaneBar billKey={entry.key} />;
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

/** A record's pane bar: ⋯ (Cite, Copy link, the web page) and Share. */
function DocPaneBar({ entry }: { entry: RecordEntry }) {
  const target = { slug: entry.key, title: entry.title ?? 'This record' };
  return (
    <View style={styles.bar}>
      <IconButton
        symbol="ellipsis.circle"
        accessibilityLabel="More for this record"
        testID="doc-actions"
        onPress={() =>
          showPaneMenu(target.title, menuLeaves(recordActions(target)))
        }
      />
      {canShare ? (
        <IconButton
          symbol="square.and.arrow.up"
          accessibilityLabel="Share"
          testID="record-pane-share"
          onPress={() =>
            void shareRecord({ path: `/doc/${entry.key}`, title: target.title })
          }
        />
      ) : null}
    </View>
  );
}

/**
 * The bill text's pane bar (records.md 4.3): the iPhone bar's Version menu,
 * Contents and ⋯, beside Share. The embedded reader publishes the items.
 * Exported for the Bills split's pane bar.
 */
export function BillTextPaneBar({ billKey }: { billKey: string }) {
  const items = useBillTextPane(billKey);
  if (!items) return null;
  return (
    <View style={styles.bar}>
      {items.version ? (
        <Button
          variant="plain"
          label={items.version.label}
          accessibilityLabel={items.version.accessibilityLabel}
          trailingIcon="chevron.up.chevron.down"
          testID="bill-text-version"
          onPress={() =>
            showPaneMenu(
              'Version',
              items.versions.map((version) => ({
                title: `${version.current ? '✓ ' : ''}${version.label}`,
                onPress: () => items.choose(version.id),
              })),
            )
          }
        />
      ) : null}
      {items.contents ? (
        <IconButton
          symbol="list.bullet"
          accessibilityLabel="Contents"
          testID="bill-text-contents"
          onPress={items.contents}
        />
      ) : null}
      <IconButton
        symbol="ellipsis.circle"
        accessibilityLabel="More for this bill text"
        testID="bill-text-actions"
        onPress={() => showPaneMenu(items.title, items.menu)}
      />
      {canShare ? (
        <IconButton
          symbol="square.and.arrow.up"
          accessibilityLabel="Share"
          testID="record-pane-share"
          onPress={() =>
            void shareRecord({
              path: items.sharePath,
              anchor: 'bill-full-text',
              title: items.title,
            })
          }
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center' },
});

import { useEffect, useState } from 'react';
import { RefreshControl } from 'react-native';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { portraits } from '../../api/runtime';
import { InsetGroup, LinkRow, Screen, Text } from '../../design/primitives';
import { formatCount } from '../../design/format';
import { chrome } from '../../design/tokens';
import { explore } from '../explore/runtime';
import { code, statement } from './datasets';
import { sourcesHrefs, useSourcesBase } from './base';
import { fontList } from './FontsList';
import { useSources } from './loader';
import { sourcesCopy as text } from './parts';

/** The hub's counts that need a read: shown once loaded, absent on failure. */
function useCreditCounts(request: number) {
  const [counts, setCounts] = useState<{
    portraits?: number;
    photos?: number;
  }>({});
  useEffect(() => {
    let active = true;
    void portraits
      ?.list()
      .then((rows) => {
        if (active) setCounts((c) => ({ ...c, portraits: rows.length }));
      })
      .catch(() => {});
    void explore
      .pictures()
      .then((record) => {
        const n = Object.values(record.data).flat().length;
        if (active) setCounts((c) => ({ ...c, photos: n }));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [request]);
  return counts;
}

/**
 * Sources and licences (account.md 4.2): one statement, four lists with
 * their counts, and OPAX's own code. The same hub in the Account sheet and
 * the Licence sheet; its rows push within whichever stack it is in. The 1.0
 * link `?dataset=<id>` opens that dataset in place of the hub.
 */
export function SourcesScreen() {
  const href = sourcesHrefs(useSourcesBase());
  const { dataset } = useLocalSearchParams<{ dataset?: string }>();
  const sources = useSources();
  const [request, setRequest] = useState(0);
  const counts = useCreditCounts(request);
  if (typeof dataset === 'string' && dataset)
    return <Redirect href={href.dataset(dataset)} />;
  const value = (n: number | undefined) =>
    n === undefined ? undefined : formatCount(n);
  return (
    <Screen
      grouped
      testID="sources-screen"
      refreshControl={
        <RefreshControl
          refreshing={sources.refreshing}
          onRefresh={() => {
            sources.refresh();
            setRequest((n) => n + 1);
          }}
          tintColor={chrome.tint}
        />
      }
    >
      <Text wordSafe variant="body" testID="sources-statement">
        {statement}
      </Text>
      <InsetGroup>
        <LinkRow
          title={text.datasets}
          value={formatCount(sources.list.length)}
          href={href.datasets}
          testID="sources-datasets"
        />
        <LinkRow
          title={text.portraits}
          value={value(counts.portraits)}
          href={href.portraits}
          testID="sources-portraits"
        />
        <LinkRow
          title={text.photos}
          value={value(counts.photos)}
          href={href.photos}
          testID="sources-photos"
        />
        <LinkRow
          title={text.fonts}
          value={formatCount(fontList().length)}
          href={href.fonts}
          testID="sources-fonts"
        />
      </InsetGroup>
      <InsetGroup>
        <LinkRow
          title={code.title}
          detail={code.licence}
          external={{ url: code.url, label: code.title }}
          testID="sources-code"
        />
      </InsetGroup>
    </Screen>
  );
}
export default SourcesScreen;

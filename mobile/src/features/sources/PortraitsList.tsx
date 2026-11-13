import { RouteOptions } from '../../navigation/preview';

import { useEffect, useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import type { PortraitListing } from '../../api/people-portraits';
import { portraits } from '../../api/runtime';
import {
  Divider,
  InlineError,
  InsetGroup,
  LinkRow,
  RegionProvider,
  SidebarSafe,
  Skeleton,
  Text,
  useScreenColumn,
} from '../../design/primitives';
import { StatePageProvider } from '../../design/states';
import { colors, rhythm } from '../../design/tokens';
import { portraitCreditLine } from '../CachedPortrait';
import { portraitTerms } from './datasets';
import {
  CreditRow,
  matches,
  NoResults,
  paperBar,
  sourcesCopy as text,
  useBarSearch,
} from './parts';
import { useFloatingBarFoot } from '../../navigation/floating-bar';

/** Surname, then given names: "Albanese Anthony". */
const sortKey = (name: string) => {
  const parts = name.trim().split(/\s+/);
  return `${parts.at(-1) ?? ''} ${parts.slice(0, -1).join(' ')}`;
};

/**
 * Portrait credits (account.md 4.5): the terms as the list's header, then
 * every credit in one virtualised list, by surname, with the bar search
 * field. No count here: the hub row says it once.
 */
export default function PortraitsList() {
  const column = useScreenColumn();
  const foot = useFloatingBarFoot();
  const search = useBarSearch(text.searchPortraits);
  const [list, setList] = useState<PortraitListing[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [request, setRequest] = useState(0);
  useEffect(() => {
    let active = true;
    const pending = portraits
      ? portraits.list()
      : Promise.reject(new Error('Portraits are not available'));
    pending
      .then((rows) => {
        if (active) setList(rows);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [request]);
  const sorted = useMemo(
    () =>
      [...(list ?? [])].sort((a, b) =>
        sortKey(a.name).localeCompare(sortKey(b.name), 'en-AU'),
      ),
    [list],
  );
  const shown = sorted.filter((row) =>
    matches(search.query, [row.name, row.info.credit]),
  );
  const official = portraitTerms.official;
  const header = (
    <RegionProvider value={column.inner}>
      {column.bar}
      <View style={styles.header}>
        <Text wordSafe variant="body">
          {official.terms}
        </Text>
        <InsetGroup>
          <LinkRow
            title={text.licenceAndCopyright}
            external={{
              url: official.links[0]!.url,
              label: text.licenceAndCopyright,
            }}
            testID="sources-portraits-licence"
          />
        </InsetGroup>
        <Text wordSafe variant="body">
          {portraitTerms.commons}
        </Text>
        {failed && !list ? (
          <InlineError
            subject={text.portraits}
            message={text.portraitsError}
            onRetry={() => {
              setFailed(false);
              setRequest((n) => n + 1);
            }}
            testID="sources-portraits-error"
          />
        ) : !list ? (
          <Skeleton count={8} label={text.loadingPortraits} />
        ) : null}
      </View>
    </RegionProvider>
  );
  return (
    <SidebarSafe style={styles.screen}>
      <RouteOptions
        options={{
          title: text.portraits,
          headerSearchBarOptions: search.options,
          ...paperBar,
        }}
      />
      <StatePageProvider refreshing={false}>
        <FlatList
          testID="sources-portraits-screen"
          style={styles.screen}
          contentContainerStyle={[styles.content, column.content, foot]}
          onLayout={column.onLayout}
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          data={list ? shown : []}
          keyExtractor={(row) => row.info.key}
          ListHeaderComponent={header}
          ItemSeparatorComponent={() => <Divider variant="subtle" />}
          renderItem={({ item: row }) => {
            const officialPortrait = /^\d+$/.test(row.info.key);
            return (
              <CreditRow
                title={row.name}
                detail={portraitCreditLine(row.info)}
                note={row.info.attribution}
                url={officialPortrait ? null : row.info.sourceURL}
                label={`Photo of ${row.name}`}
                testID={`sources-portrait-${row.slug}`}
              />
            );
          }}
          ListEmptyComponent={
            list && search.query ? (
              <NoResults
                query={search.query}
                body={text.tryName}
                testID="sources-portraits-empty"
              />
            ) : null
          }
          initialNumToRender={12}
        />
      </StatePageProvider>
    </SidebarSafe>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: { paddingTop: rhythm.block, paddingBottom: rhythm.section },
  header: { gap: rhythm.block, marginBottom: rhythm.block },
});

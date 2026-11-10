import { RouteOptions } from '../../navigation/preview';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useId, useRef, useState, type RefObject } from 'react';
import { Keyboard, Platform, ScrollView, type TextInput } from 'react-native';
import type { SearchBarCommands } from 'react-native-screens';
import { countLabel } from './present';
import {
  ContentUnavailable,
  Field,
  Group,
  InsetGroup,
  Screen,
  SectionHeader,
  Skeleton,
} from '../../design/primitives';
import { useListSearchBar } from '../../design/search-bar';
import { rhythm } from '../../design/tokens';
import { headerItems } from '../../navigation/chrome';
import { resultID } from './AllResults';
import {
  EmptyResults,
  SourcesError,
  type RecoveryHandlers,
} from './EmptyResults';
import { GroupResults, useGroupList } from './GroupResults';
import { ResultsHeader } from './ResultsHeader';
import { ResultsView, localSource } from './ResultsView';
import { SEARCH_PLACEHOLDER } from './SearchScreen';
import { useResultsControls } from './controls';
import { filtersFromParams } from './filters';
import { matchAll } from './ranking';
import { MatchRow } from './rows';
import {
  capQuery,
  groups,
  isCatalogGroup,
  resultsTarget,
  type CatalogGroup,
  type Group as ListGroup,
  type ResultsTarget,
  type Scope,
} from './scopes';
import { useSearchSources, type SearchSources } from './sources';

/**
 * `/results/[kind]`, pushed in every stack (journeys/search.md 4.3): the
 * same results as the Search root with its own bar field prefilled. It
 * mounts submitted; a scope has the scope control, a list (`group=`) does
 * not. Back returns to where the reader was.
 */
export function ResultsScreen() {
  const params = useLocalSearchParams<Record<string, string>>();
  const initial = resultsTarget(params.kind, params.group, params.scope) ?? {
    scope: 'all' as Scope,
  };
  const [target, setTarget] = useState<ResultsTarget>(initial);
  const [q, setQ] = useState(() => capQuery(params.q ?? ''));
  const [text, setText] = useState(q);
  const owner = `results-${useId()}`;
  const scroll = useRef<ScrollView>(null);
  const input = useRef<TextInput>(null);
  const { sources, failed, retry } = useSearchSources();
  const controls = useResultsControls({
    owner,
    q,
    target,
    initialFilters: filtersFromParams(params),
    roster: (sources?.roster ?? null) as never,
    onQuery: (next) => submit(next),
    onScope: (scope) => {
      setTarget({ scope });
      scroll.current?.scrollTo({ y: 0, animated: false });
    },
  });
  function submit(raw: string) {
    const words = raw.trim();
    if (!words) return;
    setQ(words);
    setText(words);
    (search.ref as RefObject<SearchBarCommands | null>).current?.setText(words);
    if (Platform.OS === 'ios') {
      (search.ref as RefObject<SearchBarCommands | null>).current?.blur();
      Keyboard.dismiss();
    }
    scroll.current?.scrollTo({ y: 0, animated: false });
  }
  const search = useListSearchBar({
    placeholder: SEARCH_PLACEHOLDER,
    onChangeText: setText,
    onSearchButtonPress: submit,
    onCancelButtonPress: () => {
      setText(q);
      (search.ref as RefObject<SearchBarCommands | null>).current?.setText(q);
    },
  });
  const arrivalKey = JSON.stringify([
    params.kind,
    params.group,
    params.scope,
    params.q,
    filtersFromParams(params),
  ]);
  const appliedArrival = useRef(arrivalKey);
  useEffect(() => {
    if (appliedArrival.current === arrivalKey) return;
    appliedArrival.current = arrivalKey;
    setTarget(
      resultsTarget(params.kind, params.group, params.scope) ?? {
        scope: 'all',
      },
    );
    setQ(capQuery(params.q ?? ''));
    setText(capQuery(params.q ?? ''));
    controls.setFilters(filtersFromParams(params));
    (search.ref as RefObject<SearchBarCommands | null>).current?.setText(
      capQuery(params.q ?? ''),
    );
    scroll.current?.scrollTo({ y: 0, animated: false });
    // Only a changed arrival resets choices made within the screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arrivalKey]);
  // The bar field opens prefilled with the query.
  useEffect(() => {
    const ref = (search.ref as RefObject<SearchBarCommands | null>).current;
    ref?.setText(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const title = target.group ? groups[target.group].label : 'Results';
  return (
    <>
      <RouteOptions
        options={{
          title,
          ...(Platform.OS === 'ios'
            ? { headerSearchBarOptions: { ...search, hideWhenScrolling: true } }
            : {}),
          ...headerItems(controls.items),
        }}
      />
      <Screen testID="results-screen" scrollRef={scroll}>
        {Platform.OS === 'android' ? (
          <Field
            label="Search"
            labelHidden
            inputRef={input}
            value={text}
            placeholder={SEARCH_PLACEHOLDER}
            onChangeText={setText}
            onSubmitEditing={() => submit(text)}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
            testID="results-input"
          />
        ) : null}
        {!q ? (
          <ContentUnavailable
            symbol="magnifyingglass"
            title="No results"
            body="Check the spelling or try a new search."
          />
        ) : target.scope ? (
          <ResultsView
            q={q}
            scope={target.scope}
            onScope={(scope) => {
              setTarget({ scope });
              scroll.current?.scrollTo({ y: 0, animated: false });
            }}
            filters={controls.filters}
            sort={controls.sort}
            sources={sources}
            recover={controls.recover}
            onOpenFilters={controls.openFilters}
            onRetrySources={failed ? retry : undefined}
          />
        ) : isCatalogGroup(target.group) ? (
          <CatalogList group={target.group} q={q} recover={controls.recover} />
        ) : (
          <LocalList
            group={target.group as Exclude<ListGroup, CatalogGroup>}
            q={q}
            sources={sources}
            recover={controls.recover}
            onRetrySources={failed ? retry : undefined}
          />
        )}
      </Screen>
    </>
  );
}

/** A register or money list: its one read runs on arrival (the tap). */
function CatalogList({
  group,
  q,
  recover,
}: {
  group: CatalogGroup;
  q: string;
  recover: RecoveryHandlers;
}) {
  const list = useGroupList(group, q);
  const load = list.load;
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group, q]);
  const settled =
    list.first?.status === 'ready' || list.first?.status === 'error';
  return (
    <Group gap={rhythm.block} testID={`results-${group}`}>
      <ResultsHeader
        count={settled ? list.count : null}
        details={settled ? list.source : null}
      />
      <GroupResults group={group} list={list} q={q} recover={recover} />
    </Group>
  );
}

/** Topics, Electorates or Parties: every on-device match, no request. */
function LocalList({
  group,
  q,
  sources,
  recover,
  onRetrySources,
}: {
  group: Exclude<ListGroup, CatalogGroup>;
  q: string;
  sources: SearchSources | null;
  recover: RecoveryHandlers;
  onRetrySources?: () => void;
}) {
  if (!sources)
    return onRetrySources ? (
      <SourcesError subject={groups[group].label} onRetry={onRetrySources} />
    ) : (
      <Skeleton
        shape="rows"
        count={3}
        label={`Searching ${groups[group].noun}`}
      />
    );
  const rows = sources ? (matchAll(q, sources)[group] ?? []) : [];
  const noun = groups[group].noun;
  return (
    <Group gap={rhythm.block} testID={`results-${group}`}>
      <ResultsHeader
        count={
          sources ? countLabel(rows.length, [groups[group].one, noun]) : null
        }
        details={
          group === 'topics'
            ? null
            : localSource(
                sources,
                group === 'electorates' ? ['electorates'] : ['people'],
              )
        }
      />
      {sources && !rows.length ? (
        <EmptyResults where={group} q={q} recover={recover} />
      ) : (
        <>
          <SectionHeader title={groups[group].label} level={3} />
          <InsetGroup>
            {rows.map((match) => (
              <MatchRow
                key={`${match.kind}:${match.key}`}
                match={match}
                q={q}
                sources={sources!}
                variant="result"
                testID={resultID(match)}
              />
            ))}
          </InsetGroup>
        </>
      )}
    </Group>
  );
}

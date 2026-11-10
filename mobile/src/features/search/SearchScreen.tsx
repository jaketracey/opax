import { RouteOptions } from '../../navigation/preview';
import { useEffect, useRef, useState, type RefObject } from 'react';
import {
  Keyboard,
  Platform,
  RefreshControl,
  ScrollView,
  type TextInput,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import type { SearchBarCommands } from 'react-native-screens';
import { Field, Screen } from '../../design/primitives';
import { searchTabRole, useFocusRequest } from '../../design/keyboard';
import { useListSearchBar } from '../../design/search-bar';
import { headerItems, rootHeaderItems } from '../../navigation/chrome';
import { resultsRoute } from '../../navigation/routes/search';
import { useAccount } from '../account/store';
import { useOpenAsk } from '../ask/open';
import { SearchIdle } from './SearchIdle';
import { SearchSuggestions } from './SearchSuggestions';
import { ResultsView } from './ResultsView';
import { useResultsControls } from './controls';
import { filtersFromParams, defaultSpeechFilters } from './filters';
import { recentSearches, type RecentSearch } from './recent';
import { askDraft } from './recovery';
import { capQuery, isScope, type Scope } from './scopes';
import { useSearchSources } from './sources';
import type { GroupKind } from './ranking';
import { useSearchTabReset } from './tab-reset';

export const SEARCH_PLACEHOLDER = 'People, bills, topics and more';
const OWNER = 'search-root';

/** Where the field sits: the tab bar's search role on iOS 26, else the bar. */
export function searchBarPlacement() {
  return searchTabRole ? ('automatic' as const) : ('stacked' as const);
}

type Phase = 'idle' | 'typing' | 'results';
export function searchPhase(
  text: string,
  editing: boolean,
  submitted: boolean,
): Phase {
  if (editing && text.trim()) return 'typing';
  if (submitted && !(editing && !text.trim())) return 'results';
  return 'idle';
}

/**
 * The Search root (journeys/search.md 3.1 to 3.4): one field, idle with
 * Recent and Browse, on-device suggestions while typing (no request), and
 * results in four scopes on the keyboard's Search key. Editing keeps the
 * results under the suggestions; Cancel returns to them unchanged.
 */
export function SearchScreen({
  onRows,
}: {
  /** iPad: the result rows' routes, for the pane and the keyboard. */
  onRows?: Parameters<typeof ResultsView>[0]['onRows'];
}) {
  const params = useLocalSearchParams<Record<string, string>>();
  const [text, setText] = useState('');
  const [editing, setEditing] = useState(false);
  const [submitted, setSubmitted] = useState<{
    q: string;
    scope: Scope;
  } | null>(null);
  const textRef = useRef('');
  const cancelling = useRef(false);
  const scroll = useRef<ScrollView>(null);
  const input = useRef<TextInput>(null);
  const [tabReset, setTabReset] = useState(0);
  const applied = useRef<string | null>(null);
  const { sources, roster, failed, refreshing, retry } = useSearchSources();
  const signedIn = !!useAccount().status?.signedIn;
  const openAsk = useOpenAsk();
  const q = submitted?.q ?? '';
  const scope = submitted?.scope ?? 'all';
  const controls = useResultsControls({
    owner: OWNER,
    q,
    target: { scope },
    initialFilters: defaultSpeechFilters,
    roster,
    onQuery: (next) => submit(next, scope),
    onScope: (next) => chooseScope(next),
  });

  function type(next: string) {
    if (cancelling.current && !next) return;
    textRef.current = next;
    setText(next);
    setEditing(true);
  }
  function fieldText(next: string) {
    textRef.current = next;
    setText(next);
    (search.ref as RefObject<SearchBarCommands | null>).current?.setText(next);
  }
  function submit(raw: string, nextScope: Scope, link = false) {
    const words = link ? capQuery(raw) : raw.trim();
    if (!words) return;
    fieldText(words);
    setEditing(false);
    setSubmitted({ q: words, scope: nextScope });
    // A query that arrived by link never enters Recent (4.5).
    if (!link) recentSearches.add(words, nextScope);
    scroll.current?.scrollTo({ y: 0, animated: false });
  }
  function chooseScope(next: Scope) {
    if (!submitted) return;
    setSubmitted({ ...submitted, scope: next });
    recentSearches.setScope(submitted.q, next);
    scroll.current?.scrollTo({ y: 0, animated: false });
  }
  function cancel() {
    // A cleared field goes back to idle; otherwise the results return.
    if (!textRef.current.trim()) setSubmitted(null);
    else if (submitted) fieldText(submitted.q);
    setEditing(false);
    cancelling.current = true;
    requestAnimationFrame(() => {
      cancelling.current = false;
    });
  }
  const search = useListSearchBar({
    placeholder: SEARCH_PLACEHOLDER,
    onChangeText: type,
    onSearchButtonPress: (value) => submit(value, 'all'),
    onCancelButtonPress: cancel,
    autoFocus: false,
  });
  useSearchTabReset(() => {
    // A retained link query must not replay over this reset. Removing it also
    // lets the reader open the same link again after returning to Browse.
    applied.current = params.q ? JSON.stringify(params) : null;
    if (params.q) router.setParams({ q: undefined });
    input.current?.blur();
    (search.ref as RefObject<SearchBarCommands | null>).current?.blur();
    Keyboard.dismiss();
    fieldText('');
    setEditing(false);
    setSubmitted(null);
    controls.setFilters(defaultSpeechFilters);
    onRows?.([]);
    setTabReset((n) => n + 1);
  });
  useEffect(() => {
    if (!tabReset) return;
    const frame = requestAnimationFrame(() => {
      // Cancel UIKit's active search presentation after the idle content
      // commits, including a first selection before the root has mounted.
      const bar = (search.ref as RefObject<SearchBarCommands | null>).current;
      bar?.cancelSearch();
      bar?.blur();
      Keyboard.dismiss();
    });
    return () => cancelAnimationFrame(frame);
  }, [tabReset, search.ref]);
  // Cmd-F from anywhere (KeyboardShortcuts) focuses this field.
  useFocusRequest(
    'search',
    Platform.OS === 'android'
      ? input
      : (search.ref as RefObject<SearchBarCommands | null>),
  );
  // `opax://search?q=…&scope=…` opens here submitted, kept out of Recent.
  useEffect(() => {
    const key = params.q ? JSON.stringify(params) : null;
    if (!key) {
      applied.current = null;
      return;
    }
    if (key === applied.current) return;
    applied.current = key;
    const scope_ = isScope(params.scope) ? params.scope : 'all';
    controls.setFilters(filtersFromParams(params));
    submit(params.q!, scope_, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const phase = searchPhase(text, editing, !!submitted);
  const seeAll = (group: GroupKind) => {
    const words = text.trim();
    if (group === 'people' || group === 'bills') submit(words, group);
    else router.push(resultsRoute(group, { group, q: words }));
  };
  const items = phase === 'results' ? controls.items() : [];
  return (
    <>
      <RouteOptions
        options={{
          ...(Platform.OS === 'ios'
            ? {
                headerSearchBarOptions: {
                  ...search,
                  placement: searchBarPlacement(),
                },
              }
            : {}),
          ...headerItems(() => [
            ...rootHeaderItems({ segment: '(search)', signedIn }),
            ...items,
          ]),
        }}
      />
      <Screen
        // A fresh scroll view starts at UIKit's adjusted top inset, restoring
        // the expanded large title as well as Browse. scrollTo(y: 0) would
        // leave the content beneath the bar with the large title collapsed.
        key={tabReset}
        testID="search-screen"
        grouped={phase === 'idle'}
        scrollRef={scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={retry} />
        }
      >
        {Platform.OS === 'android' ? (
          <Field
            label="Search"
            labelHidden
            inputRef={input}
            value={text}
            placeholder={SEARCH_PLACEHOLDER}
            onChangeText={type}
            onSubmitEditing={() => submit(text, 'all')}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
            testID="search-input"
          />
        ) : null}
        {phase === 'idle' ? (
          <SearchIdle
            onRecent={(item: RecentSearch) => submit(item.q, item.scope)}
          />
        ) : phase === 'typing' ? (
          <SearchSuggestions
            q={text}
            sources={sources}
            loading={!sources && !failed}
            failed={failed}
            onRetry={retry}
            onSearchSpeeches={() => submit(text, 'speeches')}
            onAsk={() => openAsk({ question: askDraft(text) })}
            onSeeAll={seeAll}
          />
        ) : (
          <ResultsView
            q={q}
            scope={scope}
            onScope={chooseScope}
            filters={controls.filters}
            sort={controls.sort}
            sources={sources}
            recover={controls.recover}
            onOpenFilters={controls.openFilters}
            onRetrySources={failed ? retry : undefined}
            onRows={onRows}
          />
        )}
      </Screen>
    </>
  );
}

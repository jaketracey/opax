import { MyMemberProvider } from '../your-mp/useIsMyMember';
import { RouteOptions } from '../../navigation/preview';
import { useScreenReady } from '../../analytics/timing';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';
import {
  Keyboard,
  Platform,
  RefreshControl,
  ScrollView,
  type LayoutChangeEvent,
  type TextInput,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import type { SearchBarCommands } from 'react-native-screens';
import { Screen } from '../../design/primitives';
import { searchTabRole, useFocusRequest } from '../../design/keyboard';
import { useListSearchBar } from '../../design/search-bar';
import { scrollToTop } from '../../design/scroll-to-top';
import { useHeaderBottom } from '../../design/useHeaderBottom';
import { headerItems, rootHeaderItems } from '../../navigation/chrome';
import { resultsRoute } from '../../navigation/routes/search';
import { useAccount } from '../account/store';
import { useAskNow, useOpenAsk } from '../ask/open';
import { SearchIdle } from './SearchIdle';
import { SearchField } from './SearchField';
import { SearchSuggestions } from './SearchSuggestions';
import { ResultsView } from './ResultsView';
import { ScopeBar } from './ScopeBar';
import { useResultsControls } from './controls';
import { filtersFromParams, defaultSpeechFilters } from './filters';
import { recentSearches, type RecentSearch } from './recent';
import { askDraft, asksAsTyped } from './recovery';
import { capQuery, isScope, type Scope } from './scopes';
import { useSearchSources } from './sources';
import type { GroupKind } from './ranking';
import { useSearchTabReset } from './tab-reset';
import { useAndroidSearchKeyboard } from './useAndroidSearchKeyboard';

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
 * Recent and Browse, local suggestions plus debounced report catalogue
 * suggestions while typing, and results in four scopes on the Search key. Editing keeps the
 * results under the suggestions; Cancel returns to them unchanged.
 */
function SearchContent({
  onRows,
}: {
  /** iPad: the result rows' routes, for the pane and the keyboard. */
  onRows?: Parameters<typeof ResultsView>[0]['onRows'];
}) {
  const params = useLocalSearchParams<Record<string, string>>();
  const [contentReady, setContentReady] = useState(false);
  useScreenReady('/search', contentReady);
  const onContentLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (width > 0 && height > 0) setContentReady(true);
  }, []);
  const [text, setText] = useState('');
  const [editing, setEditing] = useState(false);
  const [submitted, setSubmitted] = useState<{
    q: string;
    scope: Scope;
  } | null>(null);
  const textRef = useRef('');
  const cancelling = useRef(false);
  const scroll = useRef<ScrollView>(null);
  const headerBottom = useHeaderBottom();
  const input = useRef<TextInput>(null);
  const [tabReset, setTabReset] = useState(0);
  const applied = useRef<string | null>(null);
  // A typed or Recent query waits here until its results are counted: only
  // one that found something enters Recent (sweep 2, item 8.2).
  const pendingRecent = useRef<string | null>(null);
  // The same query submitted again keeps its results up; this tells them to
  // report their count again, so Recent moves it to the top.
  const [submission, setSubmission] = useState(0);
  const { sources, roster, failed, refreshing, retry } = useSearchSources();
  const signedIn = !!useAccount().status?.signedIn;
  const openAsk = useOpenAsk();
  const askNow = useAskNow();
  // "Ask OPAX about “…”" shows what was typed. When that is itself a
  // question, the row shows exactly what will be asked, so it asks at once;
  // otherwise it drafts "What has parliament said about …?" to edit.
  const askTyped = (words: string) => {
    const question = askDraft(words);
    if (asksAsTyped(words)) askNow({ question });
    else openAsk({ question });
  };
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
    if (Platform.OS === 'android') {
      input.current?.blur();
      Keyboard.dismiss();
    }
    fieldText(words);
    setEditing(false);
    setSubmitted({ q: words, scope: nextScope });
    if (Platform.OS === 'ios') {
      (search.ref as RefObject<SearchBarCommands | null>).current?.blur();
      Keyboard.dismiss();
    }
    // A query that arrived by link never enters Recent (4.5); any other
    // enters once its results are counted and there is at least one.
    pendingRecent.current = link ? null : words;
    setSubmission((n) => n + 1);
    scrollToTop(scroll.current, headerBottom);
  }
  function settled(words: string, settledScope: Scope, total: number) {
    if (pendingRecent.current !== words) return;
    pendingRecent.current = null;
    if (total > 0) recentSearches.add(words, settledScope);
  }
  function chooseScope(next: Scope) {
    if (!submitted) return;
    setSubmitted({ ...submitted, scope: next });
    recentSearches.setScope(submitted.q, next);
    scrollToTop(scroll.current, headerBottom);
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
  useAndroidSearchKeyboard(input, () => {
    if (editing) cancel();
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
  // Clearing or cancelling a search shows the idle list from its top, so
  // Recent is the first thing under the field, not the results' offset
  // (sweep 2, item 8.1). The tab reset remounts the scroll view instead.
  const lastPhase = useRef(phase);
  const liveHeaderBottom = useRef(headerBottom);
  useEffect(() => {
    liveHeaderBottom.current = headerBottom;
  }, [headerBottom]);
  useEffect(() => {
    const was = lastPhase.current;
    lastPhase.current = phase;
    if (phase !== 'idle' || was === 'idle') return;
    const frame = requestAnimationFrame(() =>
      scrollToTop(scroll.current, liveHeaderBottom.current),
    );
    return () => cancelAnimationFrame(frame);
  }, [phase]);
  const seeAll = (group: GroupKind) => {
    const words = text.trim();
    if (group === 'people' || group === 'bills') submit(words, group);
    else router.push(resultsRoute(group, { group, q: words }));
  };
  const items = phase === 'results' ? controls.items() : [];
  // iPhone: the scope control stays under the search field while results
  // scroll, so the reader can see what they searched (sweep 1, item 1).
  const pinScopes =
    phase === 'results' && Platform.OS === 'ios' && !Platform.isPad;
  return (
    <>
      <RouteOptions
        options={{
          ...(Platform.OS === 'ios'
            ? {
                headerSearchBarOptions: {
                  ...search,
                  obscureBackground: false,
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
        onContentLayout={onContentLayout}
        // A fresh scroll view starts at UIKit's adjusted top inset, restoring
        // the expanded large title as well as Browse. scrollTo(y: 0) would
        // leave the content beneath the bar with the large title collapsed.
        key={tabReset}
        testID="search-screen"
        grouped={phase === 'idle'}
        scrollRef={scroll}
        scrollToOverflowEnabled
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={retry} />
        }
        pinned={
          pinScopes ? <ScopeBar value={scope} onChange={chooseScope} /> : null
        }
      >
        {Platform.OS === 'android' ? (
          <SearchField
            inputRef={input}
            value={text}
            placeholder={SEARCH_PLACEHOLDER}
            onChangeText={type}
            onSubmitEditing={() => submit(text, 'all')}
            testID="search-input"
          />
        ) : null}
        {phase === 'idle' ? (
          <SearchIdle
            onRecent={(item: RecentSearch) => submit(item.q, item.scope)}
            onTry={(words) => submit(words, 'all')}
            bills={sources?.bills ?? null}
          />
        ) : phase === 'typing' ? (
          <SearchSuggestions
            q={text}
            sources={sources}
            loading={!sources && !failed}
            failed={failed}
            onRetry={retry}
            onSearchSpeeches={() => submit(text, 'speeches')}
            onAsk={() => askTyped(text)}
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
            onSettled={settled}
            submission={submission}
            showScopes={!pinScopes}
          />
        )}
      </Screen>
    </>
  );
}

export function SearchScreen(
  props: React.ComponentProps<typeof SearchContent>,
) {
  return (
    <MyMemberProvider>
      <SearchContent {...props} />
    </MyMemberProvider>
  );
}

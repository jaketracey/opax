import {
  ContentUnavailable,
  Group,
  InlineError,
  InsetGroup,
  LinkRow,
} from '../../design/primitives';
import { rhythm } from '../../design/tokens';
import { hasFilters, type SpeechFilters } from './filters';
import { emptyRecovery, type Recovery, type RecoveryAction } from './recovery';
import type { Group as ListGroup, Scope } from './scopes';

export interface RecoveryHandlers {
  onAsk: () => void;
  /** Show all results: the All scope with the same query. */
  onAll: () => void;
  onClearFilters: () => void;
  onUnquote: () => void;
  /** The Speeches scope (All's "See all" for speeches). */
  onSpeeches: () => void;
}
export function runRecovery(
  action: RecoveryAction,
  handlers: RecoveryHandlers & { onRetry?: () => void; onWeb?: () => void },
) {
  ({
    ask: handlers.onAsk,
    all: handlers.onAll,
    'clear-filters': handlers.onClearFilters,
    unquote: handlers.onUnquote,
    retry: handlers.onRetry ?? (() => undefined),
    web: handlers.onWeb ?? (() => undefined),
  })[action]();
}

/**
 * Nothing found where the reader looked: `ContentUnavailable` (search
 * variant) with the first action, and the rest as rows under it. Never a
 * dead end: every state offers results elsewhere or an answer.
 */
export function EmptyResults({
  where,
  q,
  filters,
  recover,
  recovery,
}: {
  where: Scope | ListGroup;
  q: string;
  filters?: SpeechFilters;
  recover: RecoveryHandlers;
  recovery?: Recovery;
}) {
  const state =
    recovery ??
    emptyRecovery({
      where,
      q,
      // All's one read is the filtered speeches read: its filters can
      // empty it too, so both offer Clear filters.
      filtersOn:
        !!filters &&
        hasFilters(filters) &&
        (where === 'speeches' || where === 'all'),
      records: !!filters && filters.kind !== 'speech',
    });
  const [first, ...rest] = state.actions;
  return (
    <Group gap={rhythm.block} testID="search-empty">
      {/* Inline: the action sits a block under the body, not under
          SwiftUI's own padding (sweep 2, item 8.4). */}
      <ContentUnavailable
        inline
        symbol="magnifyingglass"
        title={state.title ?? 'No results'}
        body={state.body}
        action={
          first
            ? {
                label: first.label,
                testID: first.testID,
                onPress: () => runRecovery(first.action, recover),
              }
            : undefined
        }
      />
      {rest.length ? (
        <InsetGroup>
          {rest.map((item) => (
            <LinkRow
              key={item.action}
              title={item.label}
              accessory="none"
              onPress={() => runRecovery(item.action, recover)}
              testID={item.testID}
            />
          ))}
        </InsetGroup>
      ) : null}
    </Group>
  );
}

/** The cached files failed: "People couldn't load." with Try again. */
export function SourcesError({
  subject,
  onRetry,
}: {
  subject: string;
  onRetry: () => void;
}) {
  return (
    <InlineError
      subject={subject}
      message={`${subject} couldn’t load.`}
      onRetry={onRetry}
      testID="search-sources-error"
    />
  );
}

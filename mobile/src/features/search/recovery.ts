import { ApiError } from '../../api/errors';
import { isOffline } from '../CatalogState';
import { groups, scopeLabel, type Group, type Scope } from './scopes';

/**
 * Empty and error states for search (journeys/search.md 3.9). Every one
 * offers at least one action that reaches results or an answer: a failure
 * never reads as empty, and no state is a dead end. Titles never repeat the
 * query (it shows only in the editable field), so a crafted link can't put
 * words inside OPAX's own chrome.
 */
export type RecoveryAction =
  | 'ask'
  | 'all'
  | 'clear-filters'
  | 'unquote'
  | 'retry'
  | 'web';
export interface Recovery {
  title?: string;
  body?: string;
  /** An inline sentence instead of a full empty view. */
  sentence?: string;
  actions: { action: RecoveryAction; label: string; testID: string }[];
}
const actions = {
  ask: {
    action: 'ask',
    label: 'Ask OPAX about this',
    testID: 'search-empty-ask',
  },
  all: {
    action: 'all',
    label: 'Show all results',
    testID: 'search-empty-all-results',
  },
  clear: {
    action: 'clear-filters',
    label: 'Clear filters',
    testID: 'search-empty-clear',
  },
  unquote: {
    action: 'unquote',
    label: 'Try without the quotes',
    testID: 'search-empty-unquote',
  },
  retry: { action: 'retry', label: 'Try again', testID: 'search-retry' },
  web: {
    action: 'web',
    label: 'Open on opax.com.au',
    testID: 'search-open-web',
  },
} as const;

export const isQuoted = (q: string) => /["“”]/.test(q);
export const withoutQuotes = (q: string) =>
  q.replace(/["“”]/g, '').replace(/\s+/g, ' ').trim();

const scopeNouns: Record<Scope, string> = {
  all: 'results',
  people: 'people',
  bills: 'bills',
  speeches: 'speeches',
};

/** Nothing found where the reader is looking. */
export function emptyRecovery(context: {
  where: Scope | Group;
  q: string;
  filtersOn?: boolean;
  /** Type "All records": the Speeches scope holds every record type. */
  records?: boolean;
}): Recovery {
  const { where, q, filtersOn = false } = context;
  if (where === 'all')
    return {
      title: 'No results',
      body: 'Check the spelling or try a new search.',
      actions: [
        ...(isQuoted(q) ? [actions.unquote] : []),
        ...(filtersOn ? [actions.clear] : []),
        actions.ask,
      ],
    };
  const noun =
    where in groups
      ? groups[where as Group].noun
      : where === 'speeches' && context.records
        ? 'records'
        : scopeNouns[where as Scope];
  return {
    title: `No ${noun}`,
    body: 'Check the spelling or try a new search.',
    actions: [
      ...(filtersOn ? [actions.clear] : []),
      ...(isQuoted(q) ? [actions.unquote] : []),
      actions.all,
      actions.ask,
    ],
  };
}

/** What a failed read says, inside the failed group only, with Try again. */
export function failureRecovery(
  error: unknown,
  subject: Scope | Group | 'more' | 'open' | 'summary',
): Recovery {
  const name =
    subject === 'more'
      ? 'More speeches'
      : subject === 'open'
        ? 'This page'
        : subject === 'summary'
          ? 'The summary'
          : subject in groups
            ? groups[subject as Group].label
            : subject === 'speeches' || subject === 'all'
              ? 'Speeches'
              : scopeLabel(subject as Scope);
  if (subject === 'open')
    return {
      sentence: 'This page couldn’t be opened.',
      actions: [actions.retry, actions.web],
    };
  if (
    error instanceof ApiError &&
    (error.code === 'rate-limited' || error.status === 503)
  )
    return { sentence: 'Search is busy right now.', actions: [actions.retry] };
  if (isOffline(error) && subject !== 'more')
    return {
      sentence:
        subject === 'grants' || subject === 'agencies'
          ? 'Money records need a connection.'
          : `${name} need a connection.`,
      actions: [actions.retry],
    };
  return {
    sentence:
      subject === 'summary'
        ? 'The summary couldn’t be written.'
        : `${name} couldn’t load.`,
    actions: [actions.retry],
  };
}

/** Ask's draft for a search (journeys/ask.md 6, Search rows). */
export function askDraft(words: string): string {
  const text = words.trim();
  if (
    /\?$/.test(text) ||
    /^(who|what|when|where|why|how|which|is|are|did|does|do|has|have|can|should|will)\b/i.test(
      text,
    )
  )
    return text;
  return `What has parliament said about ${text}?`;
}

/**
 * True when "Ask OPAX about “…”" shows exactly what will be asked: the typed
 * words are themselves a question ending in "?". That row asks at once
 * (`useAskNow`); any other row drafts `askDraft` to edit.
 */
export function asksAsTyped(words: string): boolean {
  const question = askDraft(words);
  return question === words.trim() && /\?$/.test(question);
}

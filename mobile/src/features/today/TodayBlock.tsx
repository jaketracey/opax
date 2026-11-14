import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { StyleSheet, View } from 'react-native';
import type { Block } from '../../api/catalogs';
import {
  InsetGroup,
  SectionHeader,
  type SectionAction,
} from '../../design/layout';
import { SourceLine, type SourceDetails } from '../../design/source';
import { InlineError, SkeletonCrossfade } from '../../design/states';
import { Text } from '../../design/text';
import { minimumTarget, rhythm, textStyles } from '../../design/tokens';

/**
 * One read for a Today block. `null` until the first answer; a pull to
 * refresh (a new `attempt`) keeps the shown answer until the next arrives,
 * so blocks keep their content while they revalidate. `key` changes (a new
 * segment, a new seat) start from `null` again.
 */
export function useTodayRead<T>(
  key: string | null,
  load: (refresh: boolean) => Promise<T>,
  attempt: number,
): T | null {
  const [state, setState] = useState<{ key: string; value: T } | null>(null);
  const loader = useRef(load);
  useEffect(() => {
    loader.current = load;
  });
  const first = useRef<string | null>(null);
  useEffect(() => {
    if (key === null) return;
    let active = true;
    // The first read of a key uses the cache; later attempts revalidate.
    const refresh = first.current === key && attempt > 0;
    first.current = key;
    // A loader that throws before its promise is a failed read, like a
    // rejection: the block keeps what it drew.
    Promise.resolve()
      .then(() => loader.current(refresh))
      .then((value) => {
        if (active && value !== undefined) setState({ key, value });
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [key, attempt]);
  return state && state.key === key ? state.value : null;
}

export type TodayBlockState<T> =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'collapse' }
  | { kind: 'empty' }
  | { kind: 'ready'; data: T };

/** A block's state from its read: Skeleton, content, empty, error or collapse. */
export function blockState<T>(
  block: Block<T> | null,
  {
    emptyCollapses = false,
    errorCollapses = false,
  }: { emptyCollapses?: boolean; errorCollapses?: boolean } = {},
): TodayBlockState<T> {
  if (!block || block.status === 'loading') return { kind: 'loading' };
  if (block.status === 'error')
    return errorCollapses ? { kind: 'collapse' } : { kind: 'error' };
  if (block.status === 'missing') return { kind: 'collapse' };
  const none =
    block.data === null ||
    (Array.isArray(block.data) && block.data.length === 0);
  if (none) return emptyCollapses ? { kind: 'collapse' } : { kind: 'empty' };
  return { kind: 'ready', data: block.data as T };
}

/**
 * The generic Today block (today.md 5.2): its `SectionHeader` (8 pt to the
 * content), the body, then the block's `SourceLine` last, 24 pt under the
 * group and aligned to its text column. One state at a time, in order:
 * Skeleton in the final shape, then the content, the empty line inside the
 * group (the line stays), one `InlineError` with Try again (no line), or
 * nothing at all (an optional block collapses).
 */
export function TodayBlock<T>({
  title,
  action,
  state,
  above,
  skeleton,
  empty,
  error,
  onRetry,
  line,
  testID,
  report,
  gloss,
  children,
}: {
  title?: string;
  /** A glossary term id: the heading's plain line ("Explain terms"). */
  gloss?: string;
  action?: SectionAction;
  state: TodayBlockState<T>;
  /** Controls between the header and the group (Bills' segments). */
  above?: ReactNode;
  skeleton: ReactNode;
  /** The empty line drawn inside the group. */
  empty?: string;
  /** The error sentence: "Bills couldn't be loaded." */
  error: string;
  onRetry?: () => void;
  /** The block's source line, when the state has one. */
  line?: (SourceDetails & { testID?: string }) | null;
  /** What the page's offline line and offline state need from this block. */
  report?: TodayReport;
  testID: string;
  children: (data: T) => ReactNode;
}) {
  useReport(testID, report);
  if (state.kind === 'collapse') return null;
  const body =
    state.kind === 'loading' ? (
      skeleton
    ) : state.kind === 'error' ? (
      <InlineError
        subject={title ?? 'This block'}
        message={error}
        // Offline, the page's one offline line says why (today.md 5.14):
        // the sentence stands alone, with no Try again.
        onRetry={report?.offline ? undefined : onRetry}
        testID={`${testID}-error`}
      />
    ) : state.kind === 'empty' ? (
      <InsetGroup testID={`${testID}-group`}>
        <Text wordSafe style={styles.empty} testID={`${testID}-empty`}>
          {empty}
        </Text>
      </InsetGroup>
    ) : (
      children(state.data)
    );
  const sourced = line && (state.kind === 'ready' || state.kind === 'empty');
  return (
    <View testID={testID} style={styles.block}>
      {title ? (
        <SectionHeader
          compact
          title={title}
          action={action}
          testID={`${testID}-title`}
          gloss={gloss}
        />
      ) : null}
      {above}
      <SkeletonCrossfade
        loading={state.kind === 'loading'}
        ready={state.kind === 'ready'}
        cached={report?.savedAt != null}
        cachedAt={report?.cachedAt}
        skeleton={
          <View style={styles.body}>
            {skeleton}
            <SourceSkeleton />
          </View>
        }
      >
        <View style={styles.body}>
          {body}
          {sourced ? <SourceLine {...line} overlap /> : null}
        </View>
      </SkeletonCrossfade>
    </View>
  );
}

/** The source line's place while the block loads, so nothing moves after. */
export function SourceSkeleton() {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.sourceSkeleton}
    />
  );
}

const styles = StyleSheet.create({
  block: { gap: rhythm.heading },
  body: { gap: rhythm.group },
  empty: { paddingVertical: rhythm.row },
  sourceSkeleton: {
    height: minimumTarget,
    marginTop: -(minimumTarget - textStyles.footnote.lineHeight) / 2,
  },
});

/** What one block tells the page: its saved copy's time, and whether it
 * failed offline with nothing saved. */
export interface TodayReport {
  cachedAt?: number | null;
  savedAt: number | null;
  offline: boolean;
}

/** A block's report from its read: saved copy, or an offline failure. */
export function reportOf(
  block: {
    status: string;
    stale?: boolean;
    savedAt?: number | null;
    error?: { code?: string } | null;
  } | null,
): TodayReport | undefined {
  if (!block) return undefined;
  return {
    savedAt: block.stale ? (block.savedAt ?? null) : null,
    cachedAt: block.status === 'ready' ? (block.savedAt ?? null) : null,
    offline: block.status === 'error' && block.error?.code === 'offline',
  };
}

interface TodayReportsValue {
  cachedAt: number | null;
  /** The oldest saved copy any block draws, for the one offline line. */
  savedAt: number | null;
  /** Bills and Just declared both failed offline with nothing saved. */
  nothingSaved: boolean;
  report(key: string, value: TodayReport | undefined): void;
}
const ReportsContext = createContext<TodayReportsValue | null>(null);
export const TodayReports = ({
  value,
  children,
}: {
  value: TodayReportsValue;
  children: ReactNode;
}) => (
  <ReportsContext.Provider value={value}>{children}</ReportsContext.Provider>
);

/** The page's collected reports (Today.tsx). */
export function useTodayReports(): TodayReportsValue {
  const [reports, setReports] = useState<Record<string, TodayReport>>({});
  const report = useCallback((key: string, value: TodayReport | undefined) => {
    setReports((current) => {
      const shown = current[key];
      if (
        value === undefined
          ? shown === undefined
          : shown?.savedAt === value.savedAt &&
            shown.cachedAt === value.cachedAt &&
            shown.offline === value.offline
      )
        return current;
      const next = { ...current };
      if (value === undefined) delete next[key];
      else next[key] = value;
      return next;
    });
  }, []);
  return useMemo(() => {
    const values = Object.values(reports);
    return {
      cachedAt:
        values
          .map((r) => r.cachedAt)
          .filter((d): d is number => typeof d === 'number')
          .sort((a, b) => a - b)[0] ?? null,
      savedAt:
        values
          .map((r) => r.savedAt)
          .filter((d): d is number => d !== null)
          .sort((a, b) => a - b)[0] ?? null,
      nothingSaved:
        !!reports['today-bills']?.offline &&
        !!reports['today-declarations']?.offline,
      report,
    };
  }, [reports, report]);
}

/** Tells the page this block's report while it is drawn. */
export function useReport(key: string, value: TodayReport | undefined) {
  const reports = useContext(ReportsContext);
  const report = reports?.report;
  const savedAt = value?.savedAt ?? null;
  const offline = value?.offline ?? false;
  const cachedAt = value?.cachedAt ?? null;
  const known = value !== undefined;
  useEffect(() => {
    if (!report) return;
    report(key, known ? { savedAt, cachedAt, offline } : undefined);
  }, [report, key, known, savedAt, cachedAt, offline]);
  useEffect(() => () => report?.(key, undefined), [report, key]);
}

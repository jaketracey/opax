import { useEffect, useMemo } from 'react';
import { AccessibilityInfo } from 'react-native';
import { router } from 'expo-router';
import { haptic } from '../design/haptics';
import { citationBar } from '../features/sheets/CitationSheet';
import { MissingPayload, SheetFrame } from '../features/sheets/frame';
import { answerBlocks } from '../features/ask/answer-markdown';
import { sourceRoute } from '../features/ask/AskRows';
import { CitationContent } from '../features/ask/CitationContent';
import {
  citationSheetLeft,
  citationSheetMounted,
  firstClaim,
  moveCitation,
  useCitationSelection,
} from '../features/ask/citation-state';
import { citeStyles, copyCitation } from '../features/ask/cite';
import { answerTurn } from '../features/ask/session';
import {
  citedSources,
  sourceLink,
  sourceTitle,
} from '../features/ask/source-present';
import { copyText } from '../features/records/actions';
import { pageMenu } from '../navigation/chrome';
import { trackSourceOpen } from '../navigation/external';
import { askReportRoute } from '../navigation/routes/ask';
import { citeRoute } from '../navigation/routes/records';
import { shareRecord, trackShare } from '../navigation/share';

/**
 * `/citation` (DIRECTION 4.28, journeys/ask.md 4.6): one cited source at
 * half height, the answer live and undimmed above it. Bar: Previous and
 * Next source when the answer cites two or more, then ⋯ (an inline Cite
 * section, Citation formats…, Copy link, Share, Report a problem with this
 * source), then Done. The frame (detents, undimmed half) is the shared
 * sheet's; this file fills it for Ask.
 */
export default function Citation() {
  const selection = useCitationSelection();
  useEffect(() => {
    citationSheetMounted();
    return citationSheetLeft;
  }, []);
  const found = selection ? answerTurn(selection.turn) : null;
  const answer = found?.answer;
  const data = useMemo(
    () =>
      answer
        ? (answer.result ?? {
            answer: answer.text,
            sources: answer.sources ?? [],
            citations: {},
          })
        : null,
    [answer],
  );
  const blocks = useMemo(() => (data ? answerBlocks(data) : []), [data]);
  const cited = data ? citedSources(data.sources).cited : [];
  const n = selection?.n ?? 0;
  const source = cited[n - 1];
  if (!selection || !found || !source)
    return (
      <SheetFrame title="Citation" citation testID="citation-sheet">
        <MissingPayload />
      </SheetFrame>
    );
  const title = sourceTitle(source);
  const go = (to: number) => moveCitation(to, firstClaim(blocks, to));
  const leaveThen = (next: () => void) => {
    router.back();
    requestAnimationFrame(next);
  };
  const menu = pageMenu({
    name: title,
    webPath: source.slug ? `/doc/${source.slug}` : '/',
    items: [
      {
        title: 'Cite',
        inline: true,
        items: [
          ...citeStyles.map((style) => ({
            title: `Copy ${style.label}`,
            onPress: () => void copyCitation([source], style.id),
          })),
          ...(source.slug
            ? [
                {
                  title: 'Citation formats…',
                  onPress: () =>
                    leaveThen(() => router.push(citeRoute(source.slug, title))),
                },
              ]
            : []),
        ],
      },
      {
        title: 'Copy link',
        symbol: 'link',
        onPress: () =>
          void copyText(sourceLink(source)).then((ok) => {
            if (!ok) return;
            haptic('success');
            trackShare('copy_link', source.href || '/doc');
            AccessibilityInfo.announceForAccessibility('Link copied');
          }),
      },
      {
        title: 'Share',
        symbol: 'square.and.arrow.up',
        onPress: () => void shareRecord({ path: source.href, title }),
      },
      {
        title: 'Report a problem with this source',
        symbol: 'flag',
        onPress: () =>
          leaveThen(() => router.push(askReportRoute(selection.turn, n))),
      },
    ],
  });
  const many = cited.length > 1;
  const href = sourceRoute(source);
  return (
    <SheetFrame
      // No bar title: the numeral and title lead the content.
      title=""
      citation
      testID="citation-sheet"
      options={citationBar({
        number: n,
        menu: menu.type === 'menu' ? menu : undefined,
        ...(many
          ? {
              previous: n > 1 ? () => go(n - 1) : undefined,
              next: n < cited.length ? () => go(n + 1) : undefined,
            }
          : {}),
      })}
    >
      <CitationContent
        record={source}
        n={n}
        focusKey={`${selection.turn}:${n}`}
        onOpenRecord={
          href
            ? () =>
                leaveThen(() => {
                  router.push(href);
                  trackSourceOpen('app', 'inline');
                })
            : undefined
        }
      />
    </SheetFrame>
  );
}

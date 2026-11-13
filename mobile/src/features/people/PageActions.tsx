import { View } from 'react-native';
import { openOnWeb, openSource, canonicalUrl } from '../../navigation/external';
import { trackShare } from '../../navigation/share';
import { haptic } from '../../design/haptics';
import type { RowMenuAction } from '../../design/row-link';
import { FollowButton } from '../../design/controls';
import { copyText } from '../records/actions';
import { useOpenAsk } from '../ask/open';
import type { FollowKind } from '../follows/store';

type PageSubject = {
  kind: Extract<FollowKind, 'person' | 'party' | 'electorate'>;
  id: string | null;
  name: string;
  webPath: string;
  testID: string;
};

/**
 * The draft each page's "Ask about {subject}" starts in Ask (journeys/ask.md
 * 6): it drafts, it never sends. A party does not speak; its members do.
 */
export function askDraft(
  kind: PageSubject['kind'] | 'speeches',
  name: string,
): { question: string; speaker?: string; party?: string; kind?: string } {
  if (kind === 'person' || kind === 'speeches')
    return {
      question: `What has ${name} said in parliament this year?`,
      speaker: name,
      kind: 'speech',
    };
  if (kind === 'party')
    return {
      question: `What have ${name} members said in parliament this year?`,
      party: name,
    };
  return { question: `What has parliament said about ${name}?` };
}

/**
 * The page's ⋯ items (shell.md 2.11): "Ask about {subject}", Copy link and
 * Open on opax.com.au, then any page-specific items ("Set Grayndler as my
 * electorate", the member's official page). Follow is the header's
 * `FollowButton` and Share is the bar's own button, so neither repeats here.
 */
export function pageActions({
  kind,
  name,
  webPath,
  onAsk,
  extra = [],
}: Pick<PageSubject, 'kind' | 'name' | 'webPath'> & {
  onAsk?: () => void;
  extra?: RowMenuAction[];
}): RowMenuAction[] {
  return [
    ...(onAsk
      ? [
          {
            title: `Ask about ${name}`,
            symbol: 'text.bubble' as const,
            onPress: onAsk,
          },
        ]
      : []),
    {
      title: 'Copy link',
      symbol: 'link',
      onPress: () => {
        void copyText(canonicalUrl(webPath)).then((copied) => {
          if (!copied) return;
          haptic('success');
          trackShare('copy_link', webPath);
        });
      },
    },
    {
      title: 'Open on opax.com.au',
      symbol: 'arrow.up.right.square',
      onPress: () => void openOnWeb(webPath, name),
    },
    ...extra,
  ];
}

/** The member's official page as a menu item, worded as its identity row. */
export function officialPageItem(page: {
  url: string;
  label: string;
}): RowMenuAction {
  return {
    title: page.label,
    symbol: 'arrow.up.right.square',
    onPress: () => void openSource(page.url, page.label),
  };
}

export function usePageActions(
  subject: Pick<PageSubject, 'kind' | 'name' | 'webPath'> & {
    extra?: RowMenuAction[];
  },
): RowMenuAction[] {
  const openAsk = useOpenAsk();
  return pageActions({
    ...subject,
    onAsk: () => openAsk(askDraft(subject.kind, subject.name), subject.name),
  });
}

/**
 * The header's one action: `FollowButton` beside the subject (shell.md S1).
 * The in-content ⋯ is gone; its items are the screen's bar menu.
 */
export function PageActions({ kind, id, name, testID }: PageSubject) {
  return id ? (
    <View>
      <FollowButton
        kind={kind}
        id={id}
        title={name}
        testID={`${testID}-follow`}
      />
    </View>
  ) : null;
}

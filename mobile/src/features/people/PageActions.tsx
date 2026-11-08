import { View } from 'react-native';
import { openOnWeb, canonicalUrl } from '../../navigation/external';
import { haptic } from '../../design/haptics';
import type { RowMenuAction } from '../../design/row-link';
import { copyText } from '../records/actions';
import { scopedQuestion } from '../ask/AskAbout';
import { useOpenAsk } from '../ask/open';
import { FollowToggle } from '../follows/FollowToggle';
import type { FollowKind } from '../follows/store';

type PageSubject = {
  kind: Extract<FollowKind, 'person' | 'party' | 'electorate'>;
  id: string | null;
  name: string;
  webPath: string;
  testID: string;
};
/** The screen installs these actions in pageItems; the header owns Follow only. */
export function pageActions({
  name,
  webPath,
  onAsk,
}: Pick<PageSubject, 'kind' | 'name' | 'webPath'> & {
  onAsk: () => void;
}): RowMenuAction[] {
  return [
    { title: `Ask about ${name}`, symbol: 'text.bubble', onPress: onAsk },
    {
      title: 'Copy link',
      symbol: 'link',
      onPress: () => {
        void copyText(canonicalUrl(webPath)).then((copied) => {
          if (copied) haptic('success');
        });
      },
    },
    {
      title: 'Open on opax.com.au',
      symbol: 'arrow.up.right.square',
      onPress: () => void openOnWeb(webPath, name),
    },
  ];
}
export function usePageActions(
  subject: Pick<PageSubject, 'kind' | 'name' | 'webPath'>,
): RowMenuAction[] {
  const openAsk = useOpenAsk();
  return pageActions({
    ...subject,
    onAsk: () => openAsk(scopedQuestion(subject.kind, subject.name)),
  });
}
/** FollowButton's slot. FollowToggle keeps the store behaviour until C3 lands. */
export function PageActions({ kind, id, name, testID }: PageSubject) {
  return id ? (
    <View>
      <FollowToggle
        kind={kind}
        id={id}
        title={name}
        testID={`${testID}-follow`}
      />
    </View>
  ) : null;
}

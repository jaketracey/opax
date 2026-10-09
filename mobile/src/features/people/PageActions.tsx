import { useRef } from 'react';
import { findNodeHandle, StyleSheet, View } from 'react-native';
import { IconButton } from '../../design/primitives';
import { showMenu, type MenuAction } from '../../design/menu';
import { rhythm } from '../../design/tokens';
import { openOnWeb } from '../../navigation/external';
import { scopedQuestion } from '../ask/AskAbout';
import { useOpenAsk } from '../ask/open';
import { FollowToggle } from '../follows/FollowToggle';
import type { FollowKind } from '../follows/store';

/**
 * A profile header's actions: Follow, the one drawn button, then ⋯ for the
 * rest (Ask about this, the page on opax.com.au). Share stays in the
 * navigation bar. On a person, party or electorate page.
 */
export function PageActions({
  kind,
  id,
  name,
  webPath,
  testID,
}: {
  kind: Extract<FollowKind, 'person' | 'party' | 'electorate'>;
  /** The followed record's ID; null leaves Follow out (no linked person). */
  id: string | null;
  name: string;
  /** The page on opax.com.au: "/subject/person/anthony-albanese". */
  webPath: string;
  /** `person` gives `person-follow` and `person-more`. */
  testID: string;
}) {
  const openAsk = useOpenAsk();
  const anchor = useRef<View>(null);
  const actions: MenuAction[] = [
    {
      title: kind === 'person' ? 'Ask about their speeches' : 'Ask about this',
      onPress: () => openAsk(scopedQuestion(kind, name)),
    },
    {
      title: 'Open on opax.com.au',
      onPress: () => void openOnWeb(webPath, name),
    },
  ];
  return (
    <View style={styles.actions}>
      {id ? (
        <FollowToggle
          kind={kind}
          id={id}
          title={name}
          testID={`${testID}-follow`}
        />
      ) : null}
      <View ref={anchor} collapsable={false}>
        <IconButton
          symbol="ellipsis"
          variant="default"
          accessibilityLabel={`More for ${name}`}
          testID={`${testID}-more`}
          onPress={() =>
            showMenu(name, actions, findNodeHandle(anchor.current) ?? undefined)
          }
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: rhythm.tight,
  },
});

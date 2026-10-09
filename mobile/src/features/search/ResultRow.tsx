import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import {
  Hoverable,
  PartyLabel,
  Text,
  useHover,
} from '../../design/primitives';
import {
  SelectedMark,
  selectedWash,
  splitRowStyles,
} from '../../design/selection';
import { colors, rhythm, type Accent } from '../../design/tokens';

/**
 * One search result, one link (concept board 4): the kind · date · place
 * line, the record's own title in the serif, who spoke with their party,
 * then the passage. The whole row opens the record, so it carries no
 * chevron and no per-row "Read" or "View original". VoiceOver hears the
 * link as title, kind and date, speaker and party; the passage is its own
 * element below it, so the link stays short.
 */
export function ResultRow({
  title,
  meta,
  speaker,
  party,
  children,
  onPress,
  testID,
  dragPath,
  accent = 'bills',
  selected,
  highlighted = false,
}: {
  title: string;
  /** "Speech · 6 Mar 2023 · Federal". */
  meta?: string;
  speaker?: string | null;
  party?: string | null;
  /** The passage or brief, drawn under the byline and opening the record too. */
  children?: ReactNode;
  onPress: () => void;
  testID?: string;
  /** Canonical public web path, used only by an explicit iPad drag. */
  dragPath?: string;
  /** The selected wash's category in an iPad split list. */
  accent?: Accent;
  /** In an iPad split list (as LinkRow); undefined everywhere else. */
  selected?: boolean;
  highlighted?: boolean;
}) {
  const [hovered, onHover] = useHover();
  const [pressed, setPressed] = useState(false);
  const inSplit = selected !== undefined;
  const press = {
    onPress,
    onPressIn: () => setPressed(true),
    onPressOut: () => setPressed(false),
  };
  return (
    <Hoverable
      effect="none"
      onHover={onHover}
      onActivate={onPress}
      drag={dragPath ? { path: dragPath, title } : undefined}
    >
      <View
        style={[
          styles.row,
          inSplit ? splitRowStyles.bleed : null,
          selected
            ? selectedWash(accent)
            : pressed || hovered || highlighted
              ? { backgroundColor: colors.sunken }
              : null,
        ]}
      >
        {selected ? <SelectedMark accent={accent} /> : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={[title, meta, speaker, party]
            .filter(Boolean)
            .join(', ')}
          accessibilityHint="Opens the record"
          accessibilityState={inSplit ? { selected } : undefined}
          testID={testID}
          style={styles.head}
          {...press}
        >
          {meta ? (
            <Text wordSafe variant="metadata">
              {meta}
            </Text>
          ) : null}
          <Text wordSafe variant="subheading">
            {title}
          </Text>
          {speaker ? (
            <View style={styles.byline}>
              <Text wordSafe variant="label">
                {speaker}
              </Text>
              {party ? (
                <PartyLabel party={party} status="unknown" nested />
              ) : null}
            </View>
          ) : null}
        </Pressable>
        {children ? (
          // The passage opens the record too; VoiceOver reads it as text.
          <Pressable accessible={false} style={styles.body} {...press}>
            {children}
          </Pressable>
        ) : null}
      </View>
    </Hoverable>
  );
}

const styles = StyleSheet.create({
  row: { gap: rhythm.tight },
  head: { gap: rhythm.line },
  byline: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: rhythm.tight,
    rowGap: rhythm.line,
  },
  body: { gap: rhythm.tight },
});

import { StyleSheet, View } from 'react-native';
import {
  Card,
  Icon,
  Text,
  useAccessibilitySize,
} from '../../design/primitives';
import { accents, rhythm } from '../../design/tokens';
import type { TextTone } from '../../design/text';
import { leadRoute } from '../../navigation/routes/public-money';
import { moneyCardMenu } from '../money/menu';
import { discoverPath, leadCardFigure, type LeadView } from './model';

/**
 * One lead as a card (specs/money.md 2.9): its sentence as the title, then
 * its one figure in money ink and the figure's label. The whole card is one
 * link to the lead; long press offers Share and Copy link. The kind line is
 * drawn only where no section header names it (search results).
 */
export function LeadFeedCard({
  lead,
  kindMeta = false,
  testID,
}: {
  lead: LeadView;
  /** Search results: say the kind above the title. */
  kindMeta?: boolean;
  testID: string;
}) {
  const stacked = useAccessibilitySize();
  const figure = leadCardFigure(lead);
  const spoken = [
    kindMeta ? lead.categoryLabel : null,
    lead.title,
    figure ? `${figure.spoken}, ${figure.label}` : null,
  ]
    .filter(Boolean)
    .join('. ');
  const path = discoverPath({ id: lead.id, category: lead.category });
  return (
    <Card
      href={leadRoute(lead.id)}
      accessibilityRole="link"
      accessibilityLabel={`${spoken}.`}
      accessibilityHint="Opens the lead."
      menu={moneyCardMenu({ path, title: lead.title })}
      testID={testID}
    >
      <View style={styles.body}>
        {kindMeta ? (
          <Text wordSafe variant="secondary" testID={`${testID}-kind`}>
            {lead.categoryLabel}
          </Text>
        ) : null}
        <View style={styles.titleLine}>
          <Text
            wordSafe
            variant="subsectionTitle"
            testID={`${testID}-title`}
            style={styles.grow}
          >
            {lead.title}
          </Text>
          <Icon name="chevron.right" size={13} tone="inkSoft" />
        </View>
        {figure ? (
          <View
            testID={`${testID}-figure`}
            style={[styles.figure, stacked ? styles.stacked : null]}
          >
            <Text
              wordSafe={stacked}
              variant="tileFigure"
              tabular
              tone={accents.money.ink as TextTone}
            >
              {figure.text}
            </Text>
            <Text wordSafe={stacked} variant="footnote">
              {figure.label}
            </Text>
          </View>
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  body: { gap: rhythm.tight },
  titleLine: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: rhythm.tight,
  },
  grow: { flex: 1 },
  figure: { alignSelf: 'flex-start' },
  stacked: { alignSelf: 'stretch' },
});

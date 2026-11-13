import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { formatMoney, moneyAccessibilityLabel } from '../../../design/format';
import {
  Field,
  IconButton,
  LinkRow,
  Text,
  useKeyCommand,
} from '../../../design/primitives';
import { symbols } from '../../../design/symbols';
import { colors, hairline, radii, rhythm } from '../../../design/tokens';
import { normaliseOrganisation } from '../lookup';
import { clusterLabel, type MapModel, type MapNode } from './model';

const RESULTS = 8;

/** Donors, parties and the public-money registers on the map that match. */
export function searchModel(model: MapModel, query: string): MapNode[] {
  const wanted = normaliseOrganisation(query);
  if (!wanted) return [];
  return model.nodes
    .filter((n) => normaliseOrganisation(n.label).includes(wanted))
    .sort(
      (a, b) => b.amount - a.amount || a.label.localeCompare(b.label, 'en-AU'),
    )
    .slice(0, RESULTS);
}

function kindLine(node: MapNode) {
  return node.kind === 'party'
    ? 'Party'
    : node.kind === 'hub'
      ? 'Public money'
      : `Donor · ${clusterLabel(node.cluster)}`;
}

/**
 * Search to fly: a field over the map; choosing a result flies to the disc
 * and focuses it. The list is the model, so a result is always on the map.
 */
export function MoneyMapSearch({
  model,
  onChoose,
  onClose,
}: {
  model: MapModel;
  onChoose: (id: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const results = useMemo(() => searchModel(model, query), [model, query]);
  useKeyCommand('list-escape', onClose);
  return (
    <View style={styles.card} testID="money-map-search-card">
      <View style={styles.row}>
        <View style={styles.grow}>
          <Field
            label="Search the map"
            labelHidden
            placeholder="Donor, party or register"
            value={query}
            onChangeText={setQuery}
            autoFocus
            autoCorrect={false}
            returnKeyType="search"
            onSubmitEditing={() => {
              const first = results[0];
              if (first) onChoose(first.id);
            }}
            testID="money-map-search-field"
          />
        </View>
        <IconButton
          symbol={symbols.close}
          accessibilityLabel="Close search"
          onPress={onClose}
          testID="money-map-search-close"
        />
      </View>
      {query.trim() ? (
        results.length ? (
          <View testID="money-map-search-results">
            {results.map((node, index) => (
              <LinkRow
                key={node.id}
                title={node.label}
                detail={kindLine(node)}
                value={formatMoney(node.amount)}
                valueEmphasis
                accessory="none"
                accessibilityLabel={`${node.label}, ${kindLine(node)}, ${moneyAccessibilityLabel(node.amount)}`}
                accessibilityHint="Flies to it on the map"
                onPress={() => onChoose(node.id)}
                testID={`money-map-result-${index}`}
              />
            ))}
          </View>
        ) : (
          <Text
            wordSafe
            variant="footnote"
            accessibilityLiveRegion="polite"
            testID="money-map-search-none"
          >
            {`Nothing on the map matches “${query.trim()}”.`}
          </Text>
        )
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.raised,
    borderRadius: radii.container,
    borderCurve: 'continuous',
    borderWidth: hairline,
    borderColor: colors.dividerSubtle,
    padding: rhythm.tight,
    gap: rhythm.tight,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: rhythm.tight },
  grow: { flex: 1 },
});

import { Modal, StyleSheet, View } from 'react-native';
import {
  Button,
  ChoiceChips,
  Divider,
  useReduceMotion,
} from '../../design/primitives';
import { SheetBody } from '../../design/source';
import { rhythm } from '../../design/tokens';
import type { Facet, FeedFilters } from './model';

/**
 * The feed's Filters sheet: the chambers, then the jurisdictions when the
 * export holds more than one. Each set of chips names itself ("All
 * chambers", "Senate"), so no label sits over it. A choice applies at once;
 * Done closes the sheet.
 */
export function FilterSheet({
  visible,
  filters,
  facets,
  onChange,
  onClear,
  onClose,
}: {
  visible: boolean;
  filters: FeedFilters;
  facets: { chambers: Facet[]; jurisdictions: Facet[] };
  onChange: (next: FeedFilters) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const reduced = useReduceMotion();
  const filtered =
    filters.chamber !== 'all' || filters.jurisdiction !== 'all';
  return (
    <Modal
      visible={visible}
      animationType={reduced ? 'none' : 'slide'}
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SheetBody
        title="Filters"
        onClose={onClose}
        testID="declarations-filters-sheet"
      >
        <ChoiceChips
          segments={[
            {
              value: 'all',
              label: 'All chambers',
              testID: 'declarations-chamber-all',
            },
            ...facets.chambers.map((facet) => ({
              value: facet.id,
              label: facet.label,
              testID: `declarations-chamber-${facet.id}`,
            })),
          ]}
          value={filters.chamber}
          onChange={(chamber) => onChange({ ...filters, chamber })}
          testID="declarations-chamber"
        />
        {facets.jurisdictions.length > 1 ? (
          <View style={styles.group}>
            <Divider variant="subtle" />
            <ChoiceChips
              segments={[
                {
                  value: 'all',
                  label: 'All jurisdictions',
                  testID: 'declarations-jurisdiction-all',
                },
                ...facets.jurisdictions.map((facet) => ({
                  value: facet.id,
                  label: facet.label,
                  testID: `declarations-jurisdiction-${facet.id}`,
                })),
              ]}
              value={filters.jurisdiction}
              onChange={(jurisdiction) =>
                onChange({ ...filters, jurisdiction })
              }
              testID="declarations-jurisdiction"
            />
          </View>
        ) : null}
        {filtered ? (
          <Button
            label="Clear filters"
            variant="quiet"
            onPress={onClear}
            testID="declarations-filters-clear"
          />
        ) : null}
      </SheetBody>
    </Modal>
  );
}

const styles = StyleSheet.create({
  group: { gap: rhythm.group },
});

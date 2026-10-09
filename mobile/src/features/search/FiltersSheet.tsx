import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import {
  Button,
  Field,
  Group,
  Heading,
  Icon,
  LinkRow,
  RowList,
  Screen,
  Section,
  Text,
} from '../../design/primitives';
import { colors, minimumTarget, rhythm } from '../../design/tokens';
import {
  useAccessibilitySize,
  useReduceMotion,
} from '../../design/accessibility';
import {
  defaultFilters,
  excludedKinds,
  isDocumentKind,
  isMoreKind,
  jurisdictions,
  modes,
  normaliseFilters,
  parties,
  recordTypes,
  topics,
  type SearchFilters,
} from './contracts';
import type { Roster } from '../../api/catalog-decoders';

type Choice = { value: string; label: string; reason?: string };
export function Choices({
  label,
  choices,
  value,
  onChange,
  onClose,
  testID,
  closeLabel = 'Back to filters',
  bare = false,
}: {
  label: string;
  choices: readonly Choice[];
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
  testID: string;
  closeLabel?: string;
  /** In a sheet whose bar already names it and closes it (ChoiceSheet). */
  bare?: boolean;
}) {
  const [query, setQuery] = useState('');
  return (
    <Group>
      {bare ? null : (
        <>
          <Button
            label={closeLabel}
            variant="quiet"
            icon="chevron.left"
            onPress={onClose}
            testID={`${testID}-back`}
          />
          <Heading level={2}>{label}</Heading>
        </>
      )}
      {choices.length > 12 ? (
        <Field
          label={`Find ${label.toLowerCase()}`}
          value={query}
          onChangeText={setQuery}
          testID={`${testID}-find`}
          autoCorrect={false}
        />
      ) : null}
      <RowList>
        {choices
          .filter((c) => c.label.toLowerCase().includes(query.toLowerCase()))
          .map((c) => (
            <Pressable
              key={c.value}
              accessibilityRole="button"
              accessibilityLabel={c.label}
              accessibilityHint={c.reason}
              accessibilityState={{
                selected: value === c.value,
                disabled: !!c.reason,
              }}
              disabled={!!c.reason}
              testID={`${testID}-option-${c.value || 'any'}`}
              onPress={() => {
                onChange(c.value);
                onClose();
              }}
              style={({ pressed }) => [
                styles.choice,
                pressed ? { backgroundColor: colors.sunken } : null,
              ]}
            >
              <Text
                wordSafe
                variant="strong"
                tone={c.reason ? 'inkSoft' : 'navy'}
                style={styles.grow}
              >
                {c.label}
              </Text>
              {value === c.value ? <Icon name="checkmark" tone="navy" /> : null}
              {c.reason ? <Icon name="minus.circle" tone="inkSoft" /> : null}
            </Pressable>
          ))}
      </RowList>
    </Group>
  );
}
export function FiltersSheet({
  value,
  roster,
  fixedKind,
  onApply,
  onClose,
}: {
  value: SearchFilters;
  roster: Roster | null;
  fixedKind?: string;
  onApply: (value: SearchFilters) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(value);
  const [choice, setChoice] = useState<
    'speaker' | 'party' | 'state' | 'topic' | 'kind' | 'mode' | null
  >(null);
  const reduced = useReduceMotion();
  const stacked = useAccessibilitySize();
  const set = (key: keyof SearchFilters, v: string) =>
    setDraft((d) => ({ ...d, [key]: v }));
  const yearError = [draft.from, draft.to].some(
    (y) => y && (!/^\d{4}$/.test(y) || Number(y) < 1993 || Number(y) > 2026),
  );
  const stateError =
    !isMoreKind(draft.kind) && ['tas', 'wa', 'nt'].includes(draft.state);
  const options: Record<
    NonNullable<typeof choice>,
    { label: string; choices: Choice[] }
  > = {
    speaker: {
      label: 'Speaker',
      choices: [
        { value: '', label: 'Any speaker' },
        ...(roster?.people ?? [])
          .map((p) => ({ value: p.name, label: p.name }))
          .sort((a, b) => a.label.localeCompare(b.label)),
      ],
    },
    party: {
      label: 'Party',
      choices: [
        { value: '', label: 'Any party' },
        ...parties.map((p) => ({ value: p, label: p })),
      ],
    },
    state: {
      label: 'Jurisdiction',
      choices: [
        { value: '', label: 'Any jurisdiction' },
        ...jurisdictions.map((j) => ({
          ...j,
          reason:
            !isMoreKind(draft.kind) && ['tas', 'wa', 'nt'].includes(j.value)
              ? 'Document search is not available for this jurisdiction.'
              : undefined,
        })),
      ],
    },
    topic: {
      label: 'Topic',
      choices: [
        { value: '', label: 'Any topic' },
        ...Object.entries(topics).map(([value, label]) => ({ value, label })),
      ],
    },
    kind: {
      label: 'Record type',
      choices: recordTypes.map((t) => ({
        ...t,
        reason: excludedKinds[t.value]
          ? 'Available on opax.com.au.'
          : ['person', 'interest', 'expense', 'pay'].includes(t.value)
            ? 'Choose this catalog from Search kind.'
            : undefined,
      })),
    },
    mode: {
      label: 'Mode',
      choices: modes.map((m) => ({
        ...m,
        reason:
          !isDocumentKind(draft.kind) && m.value !== 'keyword'
            ? 'This catalog matches words.'
            : undefined,
      })),
    },
  };
  return (
    <Modal
      visible
      presentationStyle="pageSheet"
      animationType={reduced ? 'none' : 'slide'}
      onRequestClose={onClose}
    >
      <Screen testID="search-filters-sheet">
        <Group accessibilityViewIsModal>
          <Button
            label="Close search filters"
            variant="quiet"
            onPress={onClose}
            testID="search-filters-close"
          />
          {choice ? (
            <Choices
              key={choice}
              {...options[choice]}
              value={draft[choice]}
              testID={`search-filter-${choice}`}
              onChange={(v) => set(choice, v)}
              onClose={() => setChoice(null)}
            />
          ) : (
            <>
              <Section
                title="Search filters"
                accent="people"
                rule={false}
                info={{
                  title: 'About search filters',
                  testID: 'search-filters-info',
                  notes: [
                    'Results are limited to public records and roster parliamentarians. This page excludes recipient profiles and records without a reliable organisation classification.',
                    'Document search is not available for Tasmania, Western Australia or the Northern Territory. Those jurisdictions remain available for public-record catalogs.',
                    'Unavailable record types are shown in the list. Choose people, interests, expenses or pay from Search kind.',
                  ],
                }}
              >
                <Text variant="strong">Years</Text>
                <View style={stacked ? styles.yearsStacked : styles.years}>
                  <View style={stacked ? undefined : styles.grow}>
                    <Field
                      label="From year"
                      value={draft.from}
                      onChangeText={(v) => set('from', v)}
                      testID="search-filter-from"
                      keyboardType="number-pad"
                      maxLength={4}
                      placeholder="1993"
                    />
                  </View>
                  <View style={stacked ? undefined : styles.grow}>
                    <Field
                      label="To year"
                      value={draft.to}
                      onChangeText={(v) => set('to', v)}
                      testID="search-filter-to"
                      keyboardType="number-pad"
                      maxLength={4}
                      placeholder="2026"
                    />
                  </View>
                </View>
                {yearError ? (
                  <Text tone="danger">Choose years from 1993 to 2026.</Text>
                ) : null}
                <RowList>
                  {(
                    [
                      'speaker',
                      'party',
                      'state',
                      'topic',
                      'kind',
                      'mode',
                    ] as const
                  ).map((key) => (
                    <LinkRow
                      key={key}
                      title={options[key].label}
                      detail={
                        options[key].choices.find((c) => c.value === draft[key])
                          ?.label ?? draft[key]
                      }
                      onPress={() => setChoice(key)}
                      disabled={key === 'kind' && !!fixedKind}
                      testID={`search-filter-${key}`}
                    />
                  ))}
                </RowList>
                {stateError ? (
                  <Text tone="danger">
                    Choose a supported document jurisdiction or any
                    jurisdiction.
                  </Text>
                ) : null}
                <Button
                  label="Apply filters"
                  variant="primary"
                  disabled={yearError || stateError}
                  onPress={() => onApply(normaliseFilters(draft))}
                  testID="search-filters-apply"
                />
                <Button
                  label="Reset filters"
                  variant="quiet"
                  onPress={() =>
                    setDraft(
                      normaliseFilters({
                        ...defaultFilters,
                        kind: fixedKind ?? 'all',
                      }),
                    )
                  }
                  testID="search-filters-reset"
                />
              </Section>
            </>
          )}
        </Group>
      </Screen>
    </Modal>
  );
}
const styles = StyleSheet.create({
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rhythm.heading,
    minHeight: minimumTarget,
  },
  grow: { flex: 1 },
  years: { flexDirection: 'row', gap: rhythm.block },
  yearsStacked: { gap: rhythm.block },
});

import { useState } from 'react';
import { Modal } from 'react-native';
import { Button, Field, Group, Screen, Text } from '../../design/primitives';
import { useReduceMotion } from '../../design/accessibility';
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
}: {
  label: string;
  choices: readonly Choice[];
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
  testID: string;
}) {
  const [query, setQuery] = useState('');
  return (
    <Group>
      <Text variant="heading">{label}</Text>
      <Button
        label="Back to filters"
        onPress={onClose}
        testID={`${testID}-back`}
      />
      {choices.length > 12 ? (
        <Field
          label={`Find ${label.toLowerCase()}`}
          value={query}
          onChangeText={setQuery}
          testID={`${testID}-find`}
          autoCorrect={false}
        />
      ) : null}
      {choices
        .filter((c) => c.label.toLowerCase().includes(query.toLowerCase()))
        .map((c) => (
          <Group key={c.value}>
            <Button
              label={c.label}
              testID={`${testID}-option-${c.value || 'any'}`}
              disabled={!!c.reason}
              accessibilityHint={value === c.value ? 'Selected' : undefined}
              onPress={() => {
                onChange(c.value);
                onClose();
              }}
            />
            {c.reason ? <Text variant="fine">{c.reason}</Text> : null}
          </Group>
        ))}
    </Group>
  );
}
export function FiltersSheet({
  value,
  roster,
  onApply,
  onClose,
}: {
  value: SearchFilters;
  roster: Roster | null;
  onApply: (value: SearchFilters) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(value);
  const [choice, setChoice] = useState<
    'speaker' | 'party' | 'state' | 'topic' | 'kind' | 'mode' | null
  >(null);
  const reduced = useReduceMotion();
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
              <Text variant="title">Search filters</Text>
              <Group>
                <Text variant="strong">Years</Text>
                <Field
                  label="From year"
                  value={draft.from}
                  onChangeText={(v) => set('from', v)}
                  testID="search-filter-from"
                  keyboardType="number-pad"
                  maxLength={4}
                  placeholder="1993"
                />
                <Field
                  label="To year"
                  value={draft.to}
                  onChangeText={(v) => set('to', v)}
                  testID="search-filter-to"
                  keyboardType="number-pad"
                  maxLength={4}
                  placeholder="2026"
                />
                {yearError ? (
                  <Text tone="danger">Choose years from 1993 to 2026.</Text>
                ) : null}
              </Group>
              {(
                ['speaker', 'party', 'state', 'topic', 'kind', 'mode'] as const
              ).map((key) => (
                <Button
                  key={key}
                  label={`${options[key].label}: ${options[key].choices.find((c) => c.value === draft[key])?.label ?? draft[key]}`}
                  onPress={() => setChoice(key)}
                  testID={`search-filter-${key}`}
                />
              ))}
              <Button
                label="Reset filters"
                onPress={() => setDraft(defaultFilters)}
                testID="search-filters-reset"
              />
              {stateError ? (
                <Text tone="danger">
                  Choose a supported document jurisdiction or any jurisdiction.
                </Text>
              ) : null}
              <Button
                label="Apply filters"
                variant="primary"
                disabled={yearError || stateError}
                onPress={() => onApply(normaliseFilters(draft))}
                testID="search-filters-apply"
              />
            </>
          )}
        </Group>
      </Screen>
    </Modal>
  );
}

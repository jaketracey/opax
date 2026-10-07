import { useState } from 'react';
import { Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Button,
  ErrorState,
  Field,
  Group,
  Heading,
  Screen,
  Text,
} from '../../design/primitives';
import { colors } from '../../design/tokens';
import {
  defaultOptions,
  normaliseOptions,
  parties,
  parliaments,
  type AskOptions,
} from './model';
import { Choice } from './choices';
export const topics: Record<string, string> = {
  gambling: 'Gambling',
  'financial-services': 'Financial services',
  'mining-energy': 'Mining & energy',
  'climate-environment': 'Climate & environment',
  'property-construction': 'Property & construction',
  housing: 'Housing',
  health: 'Health',
  'media-communications': 'Media & communications',
  'hospitality-alcohol': 'Hospitality & alcohol',
  'defence-security': 'Defence & security',
  agriculture: 'Agriculture',
  'unions-workplace': 'Unions & workplace',
  immigration: 'Immigration',
  'indigenous-affairs': 'Indigenous affairs',
  'tax-budget': 'Tax & budget',
  education: 'Education',
  'welfare-social': 'Welfare & social services',
  'integrity-democracy': 'Integrity & democracy',
  'infrastructure-transport': 'Infrastructure & transport',
  'justice-law': 'Justice & law',
  'foreign-affairs': 'Foreign affairs',
};
export function Options({
  value,
  people,
  onDone,
  onCancel,
}: {
  value: AskOptions;
  people: string[];
  onDone: (o: AskOptions) => void;
  onCancel: () => void;
}) {
  const [o, setO] = useState(value),
    [error, setError] = useState('');
  const update = (key: keyof AskOptions, v: string) => setO({ ...o, [key]: v });
  function done() {
    if (
      [o.from, o.to].some(
        (v) => v && (!/^\d{4}$/.test(v) || +v < 1993 || +v > 2026),
      )
    )
      return setError('Choose years from 1993 to 2026.');
    onDone(normaliseOptions(o));
  }
  const any = { value: '', label: 'any' };
  return (
    <Modal
      animationType="none"
      presentationStyle="pageSheet"
      onRequestClose={onCancel}
    >
      <SafeAreaView
        style={{ flex: 1, backgroundColor: colors.paper }}
        accessibilityViewIsModal
      >
        <Screen testID="ask-options-screen">
          <Heading level={1}>Ask options</Heading>
          <Group>
            <Text>Years 1993–2026</Text>
            <Field
              label="From year"
              value={o.from}
              onChangeText={(v) => update('from', v)}
              keyboardType="number-pad"
              placeholder="1993"
              testID="ask-from"
            />
            <Field
              label="To year"
              value={o.to}
              onChangeText={(v) => update('to', v)}
              keyboardType="number-pad"
              placeholder="2026"
              testID="ask-to"
            />
            <Choice
              label="Speaker"
              value={o.speaker}
              values={[
                any,
                ...people.map((name) => ({ value: name, label: name })),
              ]}
              onChange={(v) => update('speaker', v)}
              testID="ask-speaker"
            />
            <Choice
              label="Party"
              value={o.party}
              values={[any, ...parties.map((v) => ({ value: v, label: v }))]}
              onChange={(v) => update('party', v)}
              testID="ask-party"
            />
            <Choice
              label="Parliament"
              value={o.state}
              values={[
                any,
                ...Object.entries(parliaments).map(([value, label]) => ({
                  value,
                  label,
                })),
              ]}
              onChange={(v) => update('state', v)}
              testID="ask-state"
            />
            <Choice
              label="Topic"
              value={o.topic}
              values={[
                any,
                ...Object.entries(topics).map(([value, label]) => ({
                  value,
                  label,
                })),
              ]}
              onChange={(v) => update('topic', v)}
              testID="ask-topic"
            />
            <Choice
              label="Record type"
              value={o.kind}
              values={[
                { value: 'all', label: 'All records' },
                { value: 'speech', label: 'Speeches' },
              ]}
              onChange={(v) => update('kind', v)}
              testID="ask-kind"
            />
            <Button
              label={`Search all records, including political funding, contracts and grants: ${o.kind === 'all' ? 'on' : 'off'}`}
              onPress={() =>
                update('kind', o.kind === 'all' ? 'speech' : 'all')
              }
              testID="ask-include-money"
            />
            {error ? <ErrorState message={error} /> : null}
            <Button
              label="Done"
              variant="primary"
              onPress={done}
              testID="ask-options-done"
            />
            <Button
              label="Clear all"
              onPress={() => setO({ ...defaultOptions })}
            />
            <Button label="Cancel" variant="quiet" onPress={onCancel} />
          </Group>
        </Screen>
      </SafeAreaView>
    </Modal>
  );
}

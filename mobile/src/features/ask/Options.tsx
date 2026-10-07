import { useRef, useState } from 'react';
import { View } from 'react-native';
import {
  Button,
  ErrorState,
  Field,
  Group,
  ChoiceChips,
  Section,
} from '../../design/primitives';
import { AskSheet } from './AskSheet';
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
  const yearsTarget = useRef<View>(null);
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
    <AskSheet
      title="Ask options"
      onDone={done}
      onClose={onCancel}
      testID="ask-options-screen"
      doneID="ask-options-done"
      keyboardTarget={yearsTarget}
    >
      <Section title="Years" rule={false}>
        <Field
          label="From year"
          value={o.from}
          onChangeText={(v) => update('from', v)}
          keyboardType="number-pad"
          returnKeyType="done"
          submitBehavior="blurAndSubmit"
          placeholder="1993"
          maxLength={4}
          testID="ask-from"
        />
        <View ref={yearsTarget} collapsable={false}>
          <Field
            label="To year"
            value={o.to}
            onChangeText={(v) => update('to', v)}
            keyboardType="number-pad"
            returnKeyType="done"
            submitBehavior="blurAndSubmit"
            placeholder="2026"
            maxLength={4}
            testID="ask-to"
          />
        </View>
      </Section>
      <Section
        title="Narrow the record"
        icon="line.3.horizontal.decrease"
        accent="people"
      >
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
      </Section>
      <Section
        title="Include"
        icon="doc.text"
        accent="bills"
        info={{
          title: 'About record types',
          notes: [
            'Search all records, including political funding, contracts and grants. Choose Speeches to search speeches only.',
          ],
          testID: 'ask-record-types-info',
        }}
      >
        <ChoiceChips
          value={o.kind}
          segments={[
            { value: 'all', label: 'All records', testID: 'ask-include-money' },
            { value: 'speech', label: 'Speeches only' },
          ]}
          onChange={(v) => update('kind', v)}
          testID="ask-kind"
        />
      </Section>
      <Group>
        {error ? <ErrorState message={error} /> : null}
        <Button
          label="Apply options"
          variant="primary"
          onPress={done}
          testID="ask-options-apply"
        />
        <Button label="Clear all" onPress={() => setO({ ...defaultOptions })} />
        <Button label="Cancel" variant="quiet" onPress={onCancel} />
      </Group>
    </AskSheet>
  );
}

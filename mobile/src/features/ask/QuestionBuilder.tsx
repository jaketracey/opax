import { useState } from 'react';
import { Button, Field, Group, Text } from '../../design/primitives';
import { builderQuestion, industries, shapes, type Slot } from './builder';
import { Choice } from './choices';
import { parties } from './model';
import { topics } from './Options';
export function Builder({
  people,
  bills,
  onSubmit,
  busy,
}: {
  people: string[];
  bills: string[];
  onSubmit: (q: string) => void;
  busy: boolean;
}) {
  const [shape, setShape] = useState('person'),
    [variant, setVariant] = useState(0),
    [values, setValues] = useState<Partial<Record<Slot, string>>>({});
  const selected = shapes[shape]!,
    parts = selected.variants[variant]!;
  const q = builderQuestion(shape, variant, values);
  return (
    <Group testID="ask-builder">
      <Choice
        label="Build a question about"
        value={shape}
        values={Object.entries(shapes).map(([value, s]) => ({
          value,
          label: s.label,
        }))}
        onChange={(v) => {
          setShape(v);
          setVariant(0);
        }}
        testID="ask-builder-shape"
      />
      {selected.variants.length > 1 ? (
        <Choice
          label="Question"
          value={String(variant)}
          values={selected.variants.map((p, i) => ({
            value: String(i),
            label: p
              .map((x) => (typeof x === 'string' ? x : `[${x.slot}]`))
              .join(''),
          }))}
          onChange={(v) => setVariant(Number(v))}
          testID="ask-builder-variant"
        />
      ) : null}
      {parts
        .filter((p): p is { slot: Slot } => typeof p !== 'string')
        .map((p) => {
          const names =
            p.slot === 'person'
              ? people
              : p.slot === 'bill'
                ? bills
                : p.slot === 'party'
                  ? parties.filter((p) => p !== 'LNP')
                  : p.slot === 'industry'
                    ? industries
                    : Object.values(topics);
          return (
            <Group key={p.slot}>
              {p.slot === 'topic' ? (
                <Field
                  label="Topic"
                  value={values.topic || ''}
                  onChangeText={(v) => setValues({ ...values, topic: v })}
                  testID="ask-builder-topic"
                />
              ) : null}
              <Choice
                label={
                  {
                    person: 'Parliamentarian',
                    bill: 'Bill',
                    party: 'Party',
                    industry: 'Donor industry',
                    topic: 'Topic from the record',
                  }[p.slot]
                }
                value={values[p.slot] || ''}
                values={names.map((v) => ({ value: v, label: v }))}
                onChange={(v) => setValues({ ...values, [p.slot]: v })}
                testID={`ask-builder-${p.slot}-pick`}
              />
            </Group>
          );
        })}
      <Text variant="lede" testID="ask-builder-sentence">
        {q ||
          parts
            .map((p) => (typeof p === 'string' ? p : `[${p.slot}]`))
            .join('')}
      </Text>
      <Button
        label="Ask this"
        variant="primary"
        disabled={!q || busy}
        onPress={() => {
          if (q) onSubmit(q);
        }}
        testID="ask-builder-submit"
      />
    </Group>
  );
}

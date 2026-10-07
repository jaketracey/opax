import { useState } from 'react';
import { Button, Field, Group, Text } from '../../design/primitives';
/** Native wrapping choices. The roster supplies every person suggestion. */
export function Choice({
  label,
  value,
  values,
  onChange,
  testID,
}: {
  label: string;
  value: string;
  values: { value: string; label: string }[];
  onChange: (v: string) => void;
  testID: string;
}) {
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState('');
  return (
    <Group gap={4}>
      <Button
        label={`${label}: ${values.find((x) => x.value === value)?.label || value || 'any'}`}
        onPress={() => setOpen(!open)}
        expanded={open}
        testID={testID}
      />
      {open ? (
        <Group>
          {values.length > 10 ? (
            <Field
              label={`Find ${label.toLowerCase()}`}
              value={query}
              onChangeText={setQuery}
              testID={`${testID}-query`}
            />
          ) : null}
          {values
            .filter((x) => x.label.toLowerCase().includes(query.toLowerCase()))
            .slice(0, 30)
            .map((x, i) => (
              <Button
                key={x.value}
                label={x.label}
                onPress={() => {
                  onChange(x.value);
                  setOpen(false);
                  setQuery('');
                }}
                testID={`${testID}-choice-${i}`}
              />
            ))}
          {values.length > 30 && !query ? (
            <Text variant="fine">Type a name to find another record.</Text>
          ) : null}
        </Group>
      ) : null}
    </Group>
  );
}

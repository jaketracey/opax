import { useState } from 'react';
import { Keyboard } from 'react-native';
import {
  Disclosure,
  Field,
  Group,
  LinkRow,
  RowList,
  Text,
} from '../../design/primitives';
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
      <Disclosure
        label={label}
        detail={values.find((x) => x.value === value)?.label || value || 'any'}
        open={open}
        onToggle={(next) => {
          Keyboard.dismiss();
          setOpen(next);
        }}
        testID={testID}
      >
        <Group>
          {values.length > 10 ? (
            <Field
              label={`Find ${label.toLowerCase()}`}
              value={query}
              onChangeText={setQuery}
              testID={`${testID}-query`}
            />
          ) : null}
          <RowList>
            {values
              .filter((x) =>
                x.label.toLowerCase().includes(query.toLowerCase()),
              )
              .slice(0, 30)
              .map((x, i) => (
                <LinkRow
                  key={x.value}
                  title={x.label}
                  onPress={() => {
                    Keyboard.dismiss();
                    onChange(x.value);
                    setOpen(false);
                    setQuery('');
                  }}
                  testID={`${testID}-choice-${i}`}
                />
              ))}
          </RowList>
          {values.length > 30 && !query ? (
            <Text wordSafe variant="fine">
              Type a name to find another record.
            </Text>
          ) : null}
        </Group>
      </Disclosure>
    </Group>
  );
}

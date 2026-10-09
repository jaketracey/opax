import { useState } from 'react';
import { Keyboard } from 'react-native';
import { LinkRow } from '../../design/primitives';
import { ChoiceSheet } from './ChoiceSheet';
import { kindLabel, scopeKinds, type SearchKind } from './model';

/**
 * What to search: a row naming the kind, opening a plain list of the ten
 * kinds with a check mark beside the current one (not an action sheet of
 * stacked buttons). Full kind names wrap, so they stay readable at every
 * text size.
 */
export function KindPicker({
  value,
  onChange,
}: {
  value: SearchKind;
  onChange: (kind: SearchKind) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <LinkRow
        title="Kind"
        detail={kindLabel(value)}
        testID="search-kind-menu"
        onPress={() => {
          Keyboard.dismiss();
          setOpen(true);
        }}
      />
      {open ? (
        <ChoiceSheet
          title="Search kind"
          choices={scopeKinds}
          value={value}
          onChange={(kind) => {
            const chosen = scopeKinds.find((k) => k.value === kind);
            if (chosen && chosen.value !== value) onChange(chosen.value);
          }}
          onClose={() => setOpen(false)}
          testID="search-kind"
        />
      ) : null}
    </>
  );
}

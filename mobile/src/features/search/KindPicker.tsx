import { useState } from 'react';
import { Keyboard } from 'react-native';
import { Button, LinkRow } from '../../design/primitives';
import { ChoiceSheet } from './ChoiceSheet';
import { kindLabel, scopeKinds, type SearchKind } from './model';

/**
 * What to search: a row naming the kind, opening a plain list of the ten
 * kinds with a check mark beside the current one (not an action sheet of
 * stacked buttons). Full kind names wrap, so they stay readable at every
 * text size. Once a search is answered (`compact`), the kind is the query's
 * scope, one quiet "Records ⌄" under the field, not a row of its own.
 */
export function KindPicker({
  value,
  onChange,
  compact = false,
}: {
  value: SearchKind;
  onChange: (kind: SearchKind) => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const show = () => {
    Keyboard.dismiss();
    setOpen(true);
  };
  return (
    <>
      {compact ? (
        <Button
          label={kindLabel(value)}
          accessibilityLabel={`Kind: ${kindLabel(value)}`}
          accessibilityHint="Chooses what to search"
          variant="quiet"
          size="compact"
          trailingIcon="chevron.down"
          testID="search-kind-menu"
          onPress={show}
        />
      ) : (
        <LinkRow
          title="Kind"
          detail={kindLabel(value)}
          testID="search-kind-menu"
          onPress={show}
        />
      )}
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

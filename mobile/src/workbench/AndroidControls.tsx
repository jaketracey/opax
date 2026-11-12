import { useState } from 'react';
import { Platform, View } from 'react-native';
import { Slider, Stepper } from '../design/adjustable';
import { ContextMenu } from '../design/context-menu';
import { Button, Field, PopUpButton, SwitchRow } from '../design/controls';
import { ChoiceChip } from '../design/labels';
import { Pressable } from '../design/pressable';
import { Text } from '../design/text';
import { rhythm } from '../design/tokens';

/**
 * Android-only gallery of the Material behaviours package D added: button
 * variants, switch, filter chips, pop-up menu, context menu, search field and
 * the adjustable controls. iOS never draws it, so its workbench is unchanged.
 */
export function AndroidControls() {
  const [on, setOn] = useState(true);
  const [chips, setChips] = useState({ house: true, senate: false });
  const [scope, setScope] = useState<'federal' | 'state'>('federal');
  const [count, setCount] = useState(3);
  const [share, setShare] = useState(40);
  const [query, setQuery] = useState('Housing');
  if (Platform.OS !== 'android') return null;
  return (
    <View style={{ gap: rhythm.block }}>
      <View style={{ gap: rhythm.line }}>
        <Button label="Filled" variant="filled" onPress={() => undefined} />
        <Button label="Tonal" variant="tonal" onPress={() => undefined} />
        <Button label="Outlined" variant="outlined" onPress={() => undefined} />
        <Button label="Text" variant="text" onPress={() => undefined} />
        <Button label="Disabled" disabled onPress={() => undefined} />
      </View>
      <SwitchRow
        label="Sitting day reminders"
        detail="Workbench sample"
        value={on}
        onValueChange={setOn}
        testID="wb-android-switch"
      />
      <SwitchRow
        label="Disabled switch"
        value={false}
        disabled
        onValueChange={() => undefined}
      />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <ChoiceChip
          label="House"
          selected={chips.house}
          position="1 of 2"
          onPress={() => setChips({ ...chips, house: !chips.house })}
          testID="wb-android-chip-house"
        />
        <ChoiceChip
          label="Senate"
          selected={chips.senate}
          position="2 of 2"
          onPress={() => setChips({ ...chips, senate: !chips.senate })}
        />
      </View>
      <PopUpButton
        label="Jurisdiction"
        value={scope}
        options={[
          { value: 'federal', label: 'Federal' },
          { value: 'state', label: 'State and territory' },
        ]}
        onChange={setScope}
        testID="wb-android-popup"
      />
      <ContextMenu
        items={[
          { title: 'Copy link', onPress: () => undefined },
          { title: 'Share', onPress: () => undefined },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Long-press for actions"
          testID="wb-android-context"
          style={{ padding: rhythm.block, justifyContent: 'center' }}
        >
          <Text variant="body">Long-press for actions</Text>
        </Pressable>
      </ContextMenu>
      <Field
        label="Search"
        returnKeyType="search"
        value={query}
        onChangeText={setQuery}
        testID="wb-android-search"
      />
      <Stepper
        label="Sitting weeks"
        value={count}
        min={0}
        max={10}
        onValueChange={setCount}
        testID="wb-android-stepper"
      />
      <Slider
        label="Share of votes"
        value={share}
        min={0}
        max={100}
        step={10}
        valueLabel={`${share} per cent`}
        onValueChange={setShare}
        testID="wb-android-slider"
      />
    </View>
  );
}

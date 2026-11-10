import { symbols } from './symbols';
import { Platform, View } from 'react-native';
import { Icon } from './icon';
import { Pressable } from './pressable';
import { Text } from './text';
import { colors } from './tokens';

export interface AdjustableProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  disabled?: boolean;
  onValueChange: (value: number) => void;
  valueLabel?: string;
  testID?: string;
}
function adjustment({
  value,
  min,
  max,
  step = 1,
  disabled,
  onValueChange,
}: AdjustableProps) {
  if (
    !(max > min) ||
    !(step > 0) ||
    !Number.isFinite(step) ||
    !Number.isFinite(min) ||
    !Number.isFinite(max) ||
    !Number.isFinite(value)
  )
    throw new RangeError(
      'Adjustable controls need finite values, min < max and a positive step',
    );
  const change = (next: number) => {
    if (disabled) return;
    const rounded =
      next <= min
        ? min
        : next >= max
          ? max
          : min + Math.round((next - min) / step) * step;
    const bounded = Math.max(min, Math.min(max, Number(rounded.toFixed(8))));
    if (bounded !== value) onValueChange(bounded);
  };
  return {
    change,
    increment: () => change(value + step),
    decrement: () => change(value - step),
  };
}
function adjustableProps(
  props: AdjustableProps,
  actions: ReturnType<typeof adjustment>,
) {
  return {
    accessible: true,
    accessibilityRole: 'adjustable' as const,
    accessibilityLabel: props.label,
    accessibilityState: { disabled: !!props.disabled },
    accessibilityValue: {
      min: props.min,
      max: props.max,
      now: props.value,
      text: props.valueLabel ?? String(props.value),
    },
    accessibilityActions: props.disabled
      ? []
      : [{ name: 'increment' }, { name: 'decrement' }],
    onAccessibilityAction: (event: { nativeEvent: { actionName: string } }) => {
      if (event.nativeEvent.actionName === 'increment') actions.increment();
      else if (event.nativeEvent.actionName === 'decrement')
        actions.decrement();
    },
    testID: props.testID,
  };
}
/** Additive Android controls; existing iOS screens keep their native pickers. */
export function Stepper(props: AdjustableProps) {
  const actions = adjustment(props);
  if (Platform.OS !== 'android') return null;
  return (
    <View
      {...adjustableProps(props, actions)}
      style={{ minHeight: 48, gap: 8 }}
    >
      <Text wordSafe variant="strong">
        {props.label}
      </Text>
      <View
        style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}
        importantForAccessibility="no-hide-descendants"
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Decrease ${props.label.toLocaleLowerCase('en-AU')}`}
          disabled={props.disabled || props.value <= props.min}
          onPress={actions.decrement}
          style={{
            borderRadius: 24,
            borderCurve: 'continuous',
            backgroundColor: colors.navyWash,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon
            name={symbols.decrement}
            tone={
              props.disabled || props.value <= props.min ? 'inkSoft' : 'navy'
            }
          />
        </Pressable>
        <Text tabular tone={props.disabled ? 'inkSoft' : 'ink'}>
          {props.valueLabel ?? String(props.value)}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Increase ${props.label.toLocaleLowerCase('en-AU')}`}
          disabled={props.disabled || props.value >= props.max}
          onPress={actions.increment}
          style={{
            borderRadius: 24,
            borderCurve: 'continuous',
            backgroundColor: colors.navyWash,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon
            name={symbols.increment}
            tone={
              props.disabled || props.value >= props.max ? 'inkSoft' : 'navy'
            }
          />
        </Pressable>
      </View>
    </View>
  );
}
export function Slider(props: AdjustableProps) {
  const actions = adjustment(props);
  if (Platform.OS !== 'android') return null;
  const { Host, Slider: MaterialSlider } =
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('@expo/ui/jetpack-compose') as typeof import('@expo/ui/jetpack-compose');
  const intervals = (props.max - props.min) / (props.step ?? 1);
  const steps = Number.isInteger(intervals) ? Math.max(0, intervals - 1) : 0;
  return (
    <View
      {...adjustableProps(props, actions)}
      style={{ minHeight: 48, gap: 8 }}
    >
      <Text wordSafe variant="strong">
        {props.label}, {props.valueLabel ?? String(props.value)}
      </Text>
      <View importantForAccessibility="no-hide-descendants">
        <Host
          style={{ height: 48, alignSelf: 'stretch' }}
          colorScheme="light"
          seedColor={colors.navy}
        >
          <MaterialSlider
            min={props.min}
            max={props.max}
            value={props.value}
            steps={steps}
            enabled={!props.disabled}
            onValueChange={actions.change}
            colors={{
              thumbColor: colors.navy,
              activeTrackColor: colors.navy,
              inactiveTrackColor: colors.navyWash,
            }}
          />
        </Host>
      </View>
    </View>
  );
}

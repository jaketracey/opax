import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import { Text } from '../../design/primitives';
import { colors, minimumTarget, rhythm } from '../../design/tokens';
import { accountCopy } from './copy';
import { spokenWait } from './useCodeChallenge';

/**
 * "Send a new code", a plain button whose visible label counts down while
 * the resend waits ("Send a new code in 0:42"), shared by sign-in and
 * deletion (specs/account.md 5.3 and 6.3). VoiceOver never hears the label
 * change: the accessible name stays fixed, and the countdown is its value,
 * in 10-second steps, with the button dimmed while it waits.
 */
export function ResendButton({
  label,
  countdown,
  wait,
  busy = false,
  onPress,
  testID,
}: {
  label: string;
  countdown: (seconds: number) => string;
  /** Whole seconds until a new code can be requested. */
  wait: number;
  busy?: boolean;
  onPress: () => void;
  testID?: string;
}) {
  const waiting = wait > 0;
  const disabled = waiting || busy;
  return (
    <Pressable
      accessible
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityValue={
        waiting
          ? { text: accountCopy.availableIn(spokenWait(wait)) }
          : undefined
      }
      accessibilityState={{ disabled, busy }}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.button,
        pressed && !disabled ? styles.pressed : null,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={colors.inkSoft} />
      ) : (
        <Text
          wordSafe
          variant="body"
          tone={disabled ? 'inkSoft' : 'navy'}
          style={styles.label}
        >
          {waiting ? countdown(wait) : label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignSelf: 'center',
    minHeight: minimumTarget,
    justifyContent: 'center',
    paddingHorizontal: rhythm.block,
    borderRadius: minimumTarget / 2,
    borderCurve: 'continuous',
  },
  pressed: { backgroundColor: colors.sunken },
  label: { textAlign: 'center' },
});

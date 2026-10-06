import { useEffect, useState } from 'react';
import {
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as voice from '../voice';
import { setConsent } from '../features/talk/bridge';
import type {
  VoiceEvent,
  VoiceResult,
  TranscriptTurn,
  VoiceSource,
} from '../voice';

export default function VoiceBridgeTestScreen() {
  const insets = useSafeAreaInsets();
  const [state, setState] = useState('idle');
  const [history, setHistory] = useState(['idle']);
  const [reason, setReason] = useState('none');
  const [error, setError] = useState('none');
  const [signedIn, setSignedIn] = useState(false);
  const [remaining, setRemaining] = useState(0);
  const [mode, setMode] = useState('listening');
  const [playback, setPlayback] = useState('flowing');
  const [turns, setTurns] = useState<TranscriptTurn[]>([]);
  const [sources, setSources] = useState<VoiceSource[]>([]);
  const [email, setEmail] = useState('happy@example.invalid');
  const [code, setCode] = useState('');
  const [challenge, setChallenge] = useState('');
  const [deletionChallenge, setDeletionChallenge] = useState('');
  const [message, setMessage] = useState('idle');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const unsubscribe = voice.subscribe((event: VoiceEvent) => {
      switch (event.type) {
        case 'state':
          setState(event.state);
          setReason(event.reason ?? 'none');
          setHistory((prior) => [...prior, event.state].slice(-50));
          break;
        case 'status':
          setSignedIn(event.status?.signedIn ?? false);
          setRemaining(event.status?.remainingSeconds ?? 0);
          break;
        case 'error':
          setError(event.error);
          break;
        case 'mode':
          setMode(event.mode);
          break;
        case 'playback':
          setPlayback(event.playback);
          break;
        case 'remainingTime':
          setRemaining(event.seconds);
          break;
        case 'transcript':
          setTurns(event.turns);
          break;
        case 'sources':
          setSources(event.sources);
          break;
      }
    });
    void voice.status();
    return () => {
      unsubscribe();
      void voice.end();
    };
  }, []);
  async function run<T>(
    action: () => Promise<VoiceResult<T>>,
    success: (value: T) => void = () => {},
  ) {
    Keyboard.dismiss();
    setBusy(true);
    setError('none');
    try {
      const result = await action();
      if (result.ok) success(result.value);
      else setError(result.error);
    } finally {
      setBusy(false);
    }
  }
  function button(id: string, label: string, action: () => void) {
    return (
      <Pressable
        testID={id}
        accessibilityRole="button"
        accessibilityLabel={label}
        disabled={busy}
        onPress={action}
        style={styles.button}
      >
        <Text style={styles.text}>{label}</Text>
      </Pressable>
    );
  }
  return (
    <ScrollView
      contentContainerStyle={[
        styles.page,
        { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 20 },
      ]}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
    >
      <Text testID="voice-bridge-test-title" style={styles.title}>
        Voice bridge fixture workbench
      </Text>
      <Text style={styles.text}>
        Synthetic input and silent playback. Fixture code: 01234567.
      </Text>
      <View>
        <Text testID="voice-state" style={styles.text}>
          State: {state}
        </Text>
        <Text testID="voice-reason" style={styles.text}>
          Reason: {reason}
        </Text>
        <Text testID="voice-error" style={styles.text}>
          Error: {error}
        </Text>
        <Text testID="voice-auth" style={styles.text}>
          {signedIn ? 'Signed in' : 'Signed out'}
        </Text>
        <Text testID="voice-remaining" style={styles.text}>
          Remaining: {remaining}
        </Text>
        <Text testID="voice-mode" style={styles.text}>
          Mode: {mode}
        </Text>
        <Text testID="voice-playback" style={styles.text}>
          Playback: {playback}
        </Text>
        <Text testID="voice-history" style={styles.text}>
          States: {history.join(', ')}
        </Text>
        <Text testID="voice-message" style={styles.text}>
          {message}
        </Text>
      </View>
      <Text style={styles.text}>Synthetic account email</Text>
      <TextInput
        testID="voice-email"
        accessibilityLabel="Synthetic account email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        style={styles.input}
      />
      {button(
        'voice-request-code',
        'Request sign-in code',
        () =>
          void run(
            () => voice.requestCode(email),
            (value) => {
              setChallenge(value.challengeId);
              setMessage('Sign-in code sent');
            },
          ),
      )}
      <Text style={styles.text}>Eight-digit code</Text>
      <TextInput
        testID="voice-code"
        accessibilityLabel="Eight-digit code"
        value={code}
        onChangeText={setCode}
        keyboardType="number-pad"
        style={styles.input}
      />
      {button(
        'voice-consume-code',
        'Consume sign-in code',
        () =>
          void run(
            () => voice.consumeCode(challenge, code),
            () => {
              setCode('');
              setChallenge('');
              setMessage('Code consumed');
            },
          ),
      )}
      <Text style={styles.text}>
        Calls require an explicit consent choice, including synthetic calls.
      </Text>
      {button(
        'voice-agree',
        'Agree to synthetic voice processing',
        () => void setConsent(true),
      )}
      {button(
        'voice-withdraw',
        'Withdraw synthetic voice consent',
        () => void setConsent(false),
      )}
      {button(
        'voice-start',
        'Start synthetic call',
        () => void run(voice.start),
      )}
      {button(
        'voice-mute',
        'Mute synthetic call',
        () => void run(() => voice.mute()),
      )}
      {button(
        'voice-unmute',
        'Unmute synthetic input',
        () => void run(() => voice.mute(false)),
      )}
      {button('voice-end', 'End synthetic call', () => void run(voice.end))}
      {button('voice-status', 'Refresh status', () => void run(voice.status))}
      {button(
        'voice-logout',
        'Sign out',
        () =>
          void run(voice.logout, () => {
            setTurns([]);
            setSources([]);
            setMessage('Signed out');
          }),
      )}
      {button(
        'voice-deletion-code',
        'Request deletion code',
        () =>
          void run(voice.requestDeletionCode, (value) => {
            setDeletionChallenge(value.challengeId);
            setMessage('Deletion code sent');
          }),
      )}
      {button(
        'voice-delete',
        'Complete account deletion',
        () =>
          void run(
            () => voice.deleteAccount(deletionChallenge, code),
            () => {
              setDeletionChallenge('');
              setCode('');
              setMessage('Account deleted');
            },
          ),
      )}
      <Text style={styles.title}>Transient transcript</Text>
      {turns.map((turn) => (
        <Text
          key={`${turn.role}-${turn.id}`}
          testID={`voice-turn-${turn.role}`}
          style={styles.text}
        >
          {turn.role}: {turn.text}
        </Text>
      ))}
      <Text style={styles.title}>Validated record sources</Text>
      {sources.map((source, index) => (
        <Text
          key={source.path}
          testID={`voice-source-${index}`}
          style={styles.text}
        >
          {source.title}: {source.path}
        </Text>
      ))}
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  page: { paddingHorizontal: 20, gap: 12, backgroundColor: '#ffffff' },
  title: { fontSize: 22, fontWeight: '600', color: '#152334' },
  text: { fontSize: 16, color: '#152334' },
  button: {
    minHeight: 44,
    padding: 12,
    borderWidth: 1,
    borderColor: '#526477',
    borderRadius: 4,
  },
  input: {
    minHeight: 44,
    padding: 12,
    borderWidth: 1,
    borderColor: '#526477',
    fontSize: 16,
  },
});

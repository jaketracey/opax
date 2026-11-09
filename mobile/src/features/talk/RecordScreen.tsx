import { RouteOptions } from '../../navigation/preview';
import { StyleSheet, View } from 'react-native';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { Button, useReduceMotion } from '../../design/primitives';
import { colors } from '../../design/tokens';
import { ProfileScreen } from '../Person';
import { ElectorateScreen } from '../Electorate';
import BillDetail from '../bills/BillDetail';
import DocumentReader from '../records/DocumentReader';
import BillTextReader from '../records/BillTextReader';
import { useTalkLive } from './live';
import { talkCopy } from './model';
import { recordDestination } from './sources';
import { useVoiceLevels } from './useVoiceLevels';
import { VoiceOrb } from './VoiceOrb';

const ORB = 28;

/**
 * `/talk/record?path=…`: a native record pushed inside the Talk sheet during
 * or after a call (specs/account.md 7.4). The call belongs to the Talk
 * screen's mount, so this push never ends it. The bar carries a small orb
 * that speaks the call's status and, during the call, End; the native back
 * button returns to the call.
 */
export function TalkRecordScreen() {
  const { path } = useLocalSearchParams<{ path?: string }>();
  const talk = useTalkLive();
  const reduceMotion = useReduceMotion();
  const levels = useVoiceLevels(talk.live);
  const destination = path ? recordDestination(path) : null;
  if (!destination) return <Redirect href="/talk" />;
  return (
    <View style={styles.page}>
      <RouteOptions
        options={{
          title: '',
          gestureEnabled: !talk.active,
          headerTitle: () => (
            <View
              accessible
              accessibilityLanguage="en-AU"
              accessibilityLabel={talk.status}
              accessibilityLiveRegion="polite"
              testID="talk-record-status"
              style={styles.orb}
            >
              <VoiceOrb
                phase={talk.phase}
                levels={levels}
                size={ORB}
                reduceMotion={reduceMotion}
              />
            </View>
          ),
          headerRight: talk.active
            ? () => (
                <Button
                  label={talkCopy.endRecord}
                  accessibilityLabel="End call"
                  variant="destructive"
                  size="compact"
                  onPress={talk.end}
                  testID="talk-record-end"
                />
              )
            : undefined,
        }}
      />
      {destination.pathname === '/bill/[key]' ? (
        <BillDetail recordKey={destination.params.key} embedded />
      ) : destination.pathname === '/person/[slug]' ? (
        <ProfileScreen slug={destination.params.slug} embedded />
      ) : destination.pathname === '/doc/[slug]' ? (
        <DocumentReader recordSlug={destination.params.slug} embedded />
      ) : destination.pathname === '/bill-text/[key]' ? (
        <BillTextReader recordKey={destination.params.key} embedded />
      ) : destination.pathname === '/electorate/[id]' ? (
        <ElectorateScreen id={destination.params.id} embedded />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.paper },
  orb: { width: ORB, height: ORB },
});

import { Pressable, StyleSheet, useColorScheme, View } from 'react-native';
import { router } from 'expo-router';
import { Group, Path } from '@shopify/react-native-skia';
import { useAccessibilitySize } from '../../design/accessibility';
import { SizedCanvas } from '../../design/canvas';
import { Card } from '../../design/card';
import { Button } from '../../design/controls';
import { confirmAction } from '../../design/menu';
import { symbols } from '../../design/symbols';
import { Text } from '../../design/text';
import { rhythm } from '../../design/tokens';
import { dark, light } from '../../design/tokens.generated';
import { seatRoute } from '../../navigation/routes';
import { seatCopy } from '../seat/seat-model';
import { migratedSeat, useSeat } from '../your-mp/useSeat';
import outline from './australia-outline.json';
import { hideInvitation } from './invitation-store';
import { sydneyDay } from './rules';

/**
 * The invitation's body: an abolished saved seat says so; a 1.0 choice the
 * migration set aside (a Senate "seat" or a state seat) asks for the current
 * federal electorate (first-launch.md 4.8 F3); else the ask.
 */
export function invitationBody(
  old: {
    name: string;
    status: string;
    chamber: string;
    jurisdiction: string;
  } | null,
): string {
  if (
    old &&
    old.status === 'historical' &&
    old.jurisdiction === 'federal' &&
    old.chamber === 'representatives'
  )
    return `${old.name} is no longer an electorate.`;
  if (old) return 'Choose your current federal electorate.';
  return seatCopy.invitation;
}

/**
 * Australia's states and territories as one outline (ABS boundaries,
 * simplified for drawing), 120 pt tall (72 pt at accessibility sizes),
 * centred. Decorative: hidden from VoiceOver.
 */
function AustraliaOutline() {
  const large = useAccessibilitySize();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const height = large ? 72 : 120;
  const width = Math.round((outline.width / outline.height) * height);
  const scale = height / outline.height;
  // Skia takes plain colours: the palette for the appearance in use.
  const palette = scheme === 'dark' ? dark : light;
  const fill = palette.navyWash;
  const stroke = scheme === 'dark' ? palette.inkSoft : palette.inkFaint;
  return (
    <View
      style={[styles.art, { height }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID="today-invitation-art"
    >
      <SizedCanvas width={width} height={height}>
        <Group transform={[{ scale }]}>
          {outline.states.map((s) => (
            <Group key={s.code}>
              <Path path={s.d} color={fill} />
              <Path
                path={s.d}
                color={stroke}
                style="stroke"
                strokeWidth={1 / scale}
              />
            </Group>
          ))}
        </Group>
      </SizedCanvas>
    </View>
  );
}

/**
 * Who represents you? (today.md 5.4): a card the width of the column, so the
 * page keeps the Your MP block's shape. A form, not a whole-card link: the
 * headline, the body, then two buttons, each its own element. The card
 * itself never asks for location; the seat sheet does. Touch and hold:
 * "Not now" hides it on this device for 30 days.
 */
export function SeatInvitation({
  testID = 'today-invitation',
}: {
  testID?: string;
}) {
  // Re-read on every seat change: a 1.0 choice can arrive after the mount.
  useSeat();
  const old = migratedSeat();
  const notNow = () => void hideInvitation(sydneyDay()).catch(() => undefined);
  return (
    <Card testID={testID} padded>
      {/* a11y-ok(pressable-role): touch and hold anywhere outside the
          buttons (they take their own touches): "Not now". Not an element
          itself, so VoiceOver still reads the headline, the body and the two
          buttons one by one; it reaches "Not now" as the headline's action. */}
      <Pressable
        accessible={false}
        onLongPress={() =>
          confirmAction('Who represents you?', [
            { title: 'Not now', onPress: notNow },
          ])
        }
        testID={`${testID}-press`}
        style={styles.body}
      >
        <AustraliaOutline />
        <View style={styles.words}>
          <Text
            variant="sectionTitle"
            accessibilityRole="header"
            accessibilityActions={[{ name: 'notNow', label: 'Not now' }]}
            onAccessibilityAction={(event) => {
              if (event.nativeEvent.actionName === 'notNow') notNow();
            }}
            wordSafe
            testID={`${testID}-title`}
          >
            Who represents you?
          </Text>
          <Text wordSafe testID="today-invitation-body">
            {invitationBody(old)}
          </Text>
        </View>
        <View style={styles.buttons}>
          <Button
            label="Find my electorate"
            variant="primary"
            fullWidth
            onPress={() => router.push(seatRoute())}
            testID="today-invitation-find"
          />
          <View style={styles.location}>
            <Button
              label="Use my location"
              variant="plain"
              icon={symbols.location}
              onPress={() => router.push(seatRoute(undefined, true))}
              testID="today-invitation-location"
            />
          </View>
        </View>
      </Pressable>
    </Card>
  );
}

const styles = StyleSheet.create({
  body: { gap: rhythm.block },
  art: { alignItems: 'center', justifyContent: 'center' },
  words: { gap: rhythm.line },
  buttons: { gap: rhythm.tight, alignItems: 'center' },
  location: { alignSelf: 'center' },
});

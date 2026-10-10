import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import {
  Button,
  Divider,
  Field,
  Group,
  MachineLabel,
  PersonRow,
  SourceLine,
  Text,
} from '../design/primitives';
import { rhythm } from '../design/tokens';
import { RecordRow } from '../features/RecordRow';
import type { WelcomePage } from './pages';

/**
 * The tour's scenes: small pictures of the app, built from its own
 * components (Field, Button, PersonRow, RecordRow, SourceLine, Divider). They
 * are pictures: never touchable, hidden from VoiceOver (the page's words say
 * the same), and the records in them are samples, labelled "Example" above
 * the picture. Placeholders name roles ("Your member"), never a real person,
 * and no figure appears. Scenes are laid out 300pt wide and scaled to fit.
 */
export const SCENE_WIDTH = 300;

/** `reduced` is null until iOS has said whether Reduce Motion is on. */
export const SceneContext = createContext<{
  active: boolean;
  reduced: boolean | null;
}>({ active: false, reduced: null });

/**
 * A part of a scene: rises and fades in once its page is first shown. It
 * waits for the Reduce Motion setting before anything moves; with Reduce
 * Motion on (or turned on mid-reveal) it shows its finished state at once.
 */
export function Reveal({
  order,
  children,
  style,
}: {
  order: number;
  children: ReactNode;
  /** Layout for the wrapper (an iPad pane's empty state fills it). */
  style?: StyleProp<ViewStyle>;
}) {
  const { active, reduced } = useContext(SceneContext);
  const shown = useState(() => new Animated.Value(reduced ? 1 : 0))[0];
  const done = useRef(false);
  const running = useRef<Animated.CompositeAnimation | null>(null);
  useEffect(() => {
    if (reduced === null) return;
    if (reduced) {
      running.current?.stop();
      running.current = null;
      done.current = true;
      shown.setValue(1);
      return;
    }
    if (done.current || !active) return;
    done.current = true;
    const reveal = Animated.timing(shown, {
      toValue: 1,
      duration: 420,
      delay: 120 + order * 90,
      easing: Easing.bezier(0.2, 0, 0, 1),
      useNativeDriver: true,
    });
    running.current = reveal;
    reveal.start(() => {
      if (running.current === reveal) running.current = null;
    });
  }, [active, reduced, order, shown]);
  return (
    <Animated.View
      style={[
        style,
        {
          opacity: shown,
          transform: [
            {
              translateY: shown.interpolate({
                inputRange: [0, 1],
                outputRange: [10, 0],
              }),
            },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

export const noop = () => undefined;

function AboutScene() {
  const rows = [
    ['Speeches', 'Hansard'],
    ['Votes', 'Recorded divisions'],
    ['Political funding', 'AEC returns'],
    ['Public disclosures', 'Registers of interests'],
  ] as const;
  return (
    <Group gap={rhythm.tight}>
      <Reveal order={0}>
        <Group gap={rhythm.tight}>
          <Text variant="label">The public record</Text>
          <Divider variant="accent" />
        </Group>
      </Reveal>
      {rows.map(([name, source], index) => (
        <Reveal key={name} order={index + 1}>
          <Group gap={rhythm.line}>
            <Text variant="strong">{name}</Text>
            <Text variant="fine">{source}</Text>
            {index < rows.length - 1 ? (
              <View style={styles.rowRule}>
                <Divider variant="subtle" />
              </View>
            ) : null}
          </Group>
        </Reveal>
      ))}
    </Group>
  );
}

function YourMPScene() {
  return (
    <Group gap={rhythm.tight}>
      <Reveal order={0}>
        <Field label="Electorate or member’s name" value="Example" />
      </Reveal>
      <Reveal order={1}>
        <Group gap={rhythm.line}>
          <Button label="Example electorate" onPress={noop} />
          <Text variant="metadata">House of Representatives</Text>
        </Group>
      </Reveal>
      <Reveal order={2}>
        <Group gap={rhythm.line}>
          <Divider />
          <Text variant="subheading">Your member</Text>
          <PersonRow name="Your member" place="Member for your electorate" />
        </Group>
      </Reveal>
      <Reveal order={3}>
        <Group gap={rhythm.line}>
          <Text variant="subheading">Your senators</Text>
          <PersonRow name="Your senator" place="Senator for your state" />
        </Group>
      </Reveal>
    </Group>
  );
}

function ProfilesScene() {
  const blocks = [
    ['Voting record', 'They Vote For You'],
    ['Pay for the posts held', 'Remuneration Tribunal'],
    ['Claimed expenses', 'IPEA'],
    ['Declared interests', 'Register of Members’ Interests'],
  ] as const;
  return (
    <Group gap={rhythm.tight}>
      <Reveal order={0}>
        <PersonRow name="Example member" place="Member for Example" />
      </Reveal>
      {blocks.map(([title, source], index) => (
        <Reveal key={title} order={index + 1}>
          <Group gap={rhythm.line}>
            <Divider variant={index === 0 ? 'default' : 'subtle'} />
            <Text variant="subheading">{title}</Text>
            <SourceLine asOf="2026-07-01" citation={source} onPress={noop} />
          </Group>
        </Reveal>
      ))}
    </Group>
  );
}

function BillsTodayScene() {
  return (
    <Group gap={rhythm.tight}>
      <Reveal order={0}>
        <Text variant="subheading">New in parliament</Text>
      </Reveal>
      <Reveal order={1}>
        <RecordRow
          title="Example Amendment Bill 2026"
          detail="Introduced 1 July 2026 · House of Representatives"
          onPress={noop}
        />
      </Reveal>
      <Reveal order={2}>
        <Group gap={rhythm.line}>
          <Divider />
          <Text variant="subheading">In short</Text>
          <MachineLabel explanation="Written by a model from the explanatory memorandum; not the record." />
        </Group>
      </Reveal>
      <Reveal order={3}>
        <Group gap={rhythm.line}>
          <Divider variant="subtle" />
          <Text variant="subheading">How it moved</Text>
          <SourceLine
            asOf="2026-07-01"
            citation="Parliament of Australia"
            onPress={noop}
          />
        </Group>
      </Reveal>
    </Group>
  );
}

function SearchScene() {
  return (
    <Group gap={rhythm.tight}>
      <Reveal order={0}>
        <Field label="Search people, places and bills" value="Example" />
      </Reveal>
      <Reveal order={1}>
        <Button label="Kind: People" icon="chevron.down" onPress={noop} />
      </Reveal>
      <Reveal order={2}>
        <Group gap={rhythm.line}>
          <Text variant="subheading">People</Text>
          <PersonRow name="Example member" place="Member for Example" />
        </Group>
      </Reveal>
      <Reveal order={3}>
        <Group gap={rhythm.line}>
          <Text variant="subheading">Bills</Text>
          <RecordRow title="Example Amendment Bill 2026" onPress={noop} />
        </Group>
      </Reveal>
    </Group>
  );
}

const SCENES: Record<WelcomePage['id'], () => ReactNode> = {
  about: AboutScene,
  'your-mp': YourMPScene,
  profiles: ProfilesScene,
  'bills-today': BillsTodayScene,
  search: SearchScene,
};

/**
 * The scene, scaled to fit `width` by `height`. At accessibility text sizes
 * the scene is laid out wider before scaling, so its words wrap as they do
 * on the screen it pictures rather than one word to a line.
 */
export function Scene({
  page,
  width,
  height,
  fontScale,
  active,
  reduced,
}: {
  page: WelcomePage;
  width: number;
  height: number;
  fontScale: number;
  active: boolean;
  /** Null until the Reduce Motion setting is known. */
  reduced: boolean | null;
}) {
  const layoutWidth = SCENE_WIDTH * Math.min(Math.max(fontScale, 1), 2.4);
  const [natural, setNatural] = useState(0);
  const scale =
    natural > 0 ? Math.min(1, width / layoutWidth, height / natural) : 1;
  const Render = SCENES[page.id];
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width, height, overflow: 'hidden' }}
    >
      <View
        onLayout={(event) => setNatural(event.nativeEvent.layout.height)}
        style={{
          position: 'absolute',
          width: layoutWidth,
          left: (width - layoutWidth) / 2,
          top: (height - natural) / 2,
          opacity: natural > 0 ? 1 : 0,
          transform: [{ scale }],
        }}
      >
        <SceneContext value={{ active, reduced }}>
          <Render />
        </SceneContext>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  rowRule: { paddingTop: rhythm.tight },
});

import { withNavigationOptions } from './navigation-options';
import { act, useEffect } from 'react';
import TestRenderer from 'react-test-renderer';
import { useCaptionsPreference } from '../src/features/talk/captions-preference';

const mockDisk = new Map<string, string>();
jest.mock('expo-file-system', () => ({
  Paths: { document: 'documents' },
  File: class {
    name: string;
    constructor(_directory: unknown, name: string) {
      this.name = name;
    }
    get exists() {
      return mockDisk.has(this.name);
    }
    async text() {
      return mockDisk.get(this.name)!;
    }
    write(body: string) {
      mockDisk.set(this.name, body);
    }
  },
}));

let current: ReturnType<typeof useCaptionsPreference>;
function Probe() {
  const value = useCaptionsPreference();
  useEffect(() => {
    current = value;
  });
  return null;
}
async function mount() {
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(<Probe />);
  });
  return renderer;
}
beforeEach(() => mockDisk.clear());

test('captions start on (F-2) and hiding them is remembered, never a caption', async () => {
  let renderer = await mount();
  expect(current[0]).toBe(true);
  await act(async () => current[1](false));
  expect(current[0]).toBe(false);
  expect([...mockDisk.values()].join()).toMatch(
    /^\{"on":false,"generation":1\}$/,
  );
  act(() => renderer.unmount());
  renderer = await mount();
  expect(current[0]).toBe(false);
  act(() => renderer.unmount());
});

test('an unreadable or foreign file leaves captions on', async () => {
  mockDisk.set('opax-talk-captions-v1.json', '{"on":"yes"}');
  mockDisk.set('opax-talk-captions-v1.b.json', 'not json');
  const renderer = await mount();
  expect(current[0]).toBe(true);
  act(() => renderer.unmount());
});

test('a choice made while the file is read wins over the stored one', async () => {
  mockDisk.set('opax-talk-captions-v1.json', '{"on":false,"generation":1}');
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<Probe />);
  });
  act(() => current[1](true));
  await act(async () => {});
  expect(current[0]).toBe(true);
  act(() => renderer.unmount());
});

// Captions hidden in a call (specs/account.md 7.4): the large orb stays on
// the stage with the status under it, and no transcript is drawn.
jest.mock('../src/features/talk/VoiceOrb', () => {
  const { createElement } = jest.requireActual('react');
  return {
    VoiceOrb: (props: { size: number }) => createElement('VoiceOrb', props),
  };
});
jest.mock('../src/features/talk/useVoiceLevels', () => ({
  useVoiceLevels: () => ({}),
}));
jest.mock('../src/design/useHeaderBottom', () => ({
  useHeaderBottom: () => 0,
}));
let mockOptions: Record<string, unknown> = {};
jest.mock('expo-router', () => ({
  useIsPreview: () => false,
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  Stack: {
    Screen: ({ options }: { options: Record<string, unknown> }) => {
      mockOptions = options;
      return null;
    },
  },
  useFocusEffect: jest.fn(),
}));
jest.mock('../src/features/Person', () => ({ ProfileScreen: () => null }));
jest.mock('../src/features/Electorate', () => ({
  ElectorateScreen: () => null,
}));
jest.mock('../src/features/bills/BillDetail', () => () => null);
jest.mock('../src/features/records/DocumentReader', () => () => null);
jest.mock('../src/features/records/BillTextReader', () => () => null);
jest.mock('../src/features/talk/useTalk', () => ({
  useTalk: () => ({
    snapshot: {
      ...jest.requireActual('../src/features/talk/model').emptySnapshot,
      state: 'live',
      mode: 'listening',
      transcript: [{ role: 'agent', id: 1, text: 'Fixture answer.' }],
      status: {
        enabled: true,
        signedIn: true,
        unlimited: false,
        totalSeconds: 600,
        remainingSeconds: 480,
        activeSession: null,
        budgetOpen: null,
      },
    },
    consent: true,
    consentLoaded: true,
    error: null,
    terminal: null,
    busy: false,
    microphone: null,
    settled: 0,
    active: true,
    start: jest.fn(),
    refresh: jest.fn(),
    changeConsent: jest.fn(),
    end: jest.fn(async () => ({ ok: true, value: undefined })),
    mute: jest.fn(),
    send: jest.fn(),
  }),
}));

test('in a call with captions hidden from ⋯, the large orb is on the stage and no transcript shows', async () => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { SafeAreaProvider } = require('react-native-safe-area-context');
  const { StyleSheet } = require('react-native');
  const TalkScreen = require('../src/features/talk/TalkScreen').default;
  /* eslint-enable @typescript-eslint/no-require-imports */
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 402, height: 874 },
          insets: { top: 0, left: 0, right: 0, bottom: 34 },
        }}
      >
        {withNavigationOptions(<TalkScreen />, (options) => {
          mockOptions = options;
        })}
      </SafeAreaProvider>,
    );
  });
  const has = (testID: string) =>
    renderer.root.findAll((node) => node.props.testID === testID).length > 0;
  const orbs = () =>
    renderer.root
      .findAll((node) => node.type === ('VoiceOrb' as never))
      .map((node) => node.props.size as number);
  // Captions on (the default): the 72 pt call row and the transcript.
  expect(has('talk-captions-list')).toBe(true);
  expect(orbs()).toEqual([72]);
  // Hide captions through the ⋯ menu.
  // Sweep 1 item 10: on iOS ⋯ is the leading item and Done the only
  // trailing one, so UIKit centres "Talk to OPAX" as on the other sheets.
  expect(
    (mockOptions.unstable_headerRightItems as () => { label?: string }[])().map(
      (item) => item.label,
    ),
  ).toEqual(['Done']);
  const items = (
    mockOptions.unstable_headerLeftItems as () => {
      type: string;
      menu?: { items: { label: string; onPress: () => void }[] };
    }[]
  )();
  const hide = items[0]!.menu!.items.find(
    (item) => item.label === 'Hide captions',
  )!;
  await act(async () => hide.onPress());
  expect(has('talk-captions-list')).toBe(false);
  // The stage measures itself, then holds the large orb and the status.
  const stage = renderer.root.find(
    (node) =>
      typeof node.type === 'string' &&
      typeof node.props.onLayout === 'function' &&
      StyleSheet.flatten(node.props.style)?.minHeight === 120,
  );
  await act(async () =>
    stage.props.onLayout({
      nativeEvent: { layout: { width: 370, height: 500 } },
    }),
  );
  // 240 pt, or 120 pt at accessibility sizes: the stage orb, not the 72.
  const [size] = orbs();
  expect(orbs()).toHaveLength(1);
  expect([120, 240]).toContain(size);
  const status = renderer.root.find(
    (node) =>
      typeof node.type === 'string' && node.props.testID === 'talk-status',
  );
  expect(StyleSheet.flatten(status.props.style)).toMatchObject({
    width: size,
    height: size,
  });
  expect(
    renderer.root.find(
      (node) =>
        typeof node.type === 'string' && node.props.testID === 'talk-state',
    ).props.children,
  ).toBe('Listening');
  expect(has('talk-mute')).toBe(true);
  act(() => renderer.unmount());
});

import { act, type ComponentProps, type ReactElement } from 'react';
import { router } from 'expo-router';
import { Dimensions, StyleSheet, View } from 'react-native';
import TestRenderer, { type ReactTestInstance } from 'react-test-renderer';
import {
  decodeRecentInterests,
  recentDeclarationsFor,
} from '../src/api/catalogs';
import { PartyLabel } from '../src/design/people';
import { Text } from '../src/design/text';
import { minimumTarget, rhythm, textStyles } from '../src/design/tokens';
import { FeedRow } from '../src/features/declarations/FeedRow';
import { YearVoices } from '../src/features/explore/YearVoices';
import { decodeYear } from '../src/features/explore/model';
import { DeclarationEntry } from '../src/features/today/DeclarationRow';
import { partyRoute, personRoute } from '../src/navigation/routes';
import { pinned } from './pinned';

jest.mock('expo-router', () => {
  const pass = ({ children }: { children?: unknown }) => children;
  return {
    router: { push: jest.fn() },
    useSegments: () => [],
    Link: Object.assign(pass, {
      Trigger: pass,
      Preview: () => null,
      Menu: () => null,
      MenuAction: () => null,
    }),
  };
});
jest.mock('../src/api/runtime', () => ({ catalogs: {} }));
jest.mock('../src/features/follows/store', () => ({
  useFollows: () => [],
  loadFollows: jest.fn(async () => []),
  follow: jest.fn(),
  unfollow: jest.fn(),
}));

const item: ComponentProps<typeof DeclarationEntry>['item'] = {
  ...recentDeclarationsFor(
    decodeRecentInterests(pinned('/interests/recent.json')),
  ).data![0]!,
  name: 'Anne Urquhart',
  party: 'Labor',
  chamber: 'senate',
  jurisdiction: 'federal',
  profileSlug: 'anne-urquhart',
};
const initialWindow = Dimensions.get('window');
const initialScreen = Dimensions.get('screen');
const trees: TestRenderer.ReactTestRenderer[] = [];
function draw(element: ReactElement, fontScale = 1) {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    Dimensions.set({
      window: { ...initialWindow, width: 320, fontScale },
      screen: { ...initialScreen, width: 320, fontScale },
    });
    tree = TestRenderer.create(element);
  });
  trees.push(tree);
  return tree.root;
}
const flat = (node: ReactTestInstance) => StyleSheet.flatten(node.props.style);
function parentView(node: ReactTestInstance): ReactTestInstance {
  let parent = node.parent;
  while (parent && parent.type !== View) parent = parent.parent;
  if (!parent) throw new Error('Expected a containing View');
  return parent;
}
function partyTarget(party: ReactTestInstance) {
  return party.find(
    (node) => !!node.props.hitSlop && typeof node.props.onPress === 'function',
  );
}
function expectCompactStack(party: ReactTestInstance) {
  expect(party.props.compact).toBe(true);
  const frame = parentView(party);
  expect(flat(frame).minHeight).toBe(minimumTarget);
  expect(flat(frame).paddingVertical).toBeUndefined();
  const words = parentView(frame);
  expect(flat(words).gap).toBe(4);
  expect(flat(words).height).toBeUndefined();
  const target = partyTarget(party);
  expect(flat(target).minHeight).toBeUndefined();
  expect(flat(target).minWidth).toBe(minimumTarget);
  expect(textStyles.secondary.lineHeight + target.props.hitSlop.bottom).toBe(
    minimumTarget,
  );
  expect(target.props.accessible).toBe(false);
  for (const text of words.findAllByType(Text))
    expect(text.props.numberOfLines).toBeUndefined();
}
afterEach(() => {
  act(() => {
    trees.splice(0).forEach((tree) => tree.unmount());
    Dimensions.set({ window: initialWindow, screen: initialScreen });
  });
  jest.clearAllMocks();
});

// Today's entry draws name and party on one line instead (sweep 1, item 3:
// tests/today-declaration-row.test.tsx); the full feed keeps the stack.
describe.each(['feed'] as const)('%s declarations', (surface) => {
  const personID =
    surface === 'today' ? 'today-declaration-person-0' : 'declaration-person-0';
  const rowID = surface === 'today' ? 'today-declaration-0' : personID;
  const renderRow = (declaration = item, fontScale = 1) =>
    draw(
      surface === 'today' ? (
        <DeclarationEntry item={declaration} index={0} />
      ) : (
        <FeedRow
          item={declaration}
          index={0}
          onOpenPerson={() =>
            router.push(personRoute('anne-urquhart', declaration.name))
          }
        />
      ),
      fontScale,
    );

  test.each([1, 1.786, 3.571])(
    'party sits 4pt under the name at font scale %s with a full hit target',
    (scale) => {
      const root = renderRow(item, scale);
      const party = root.findByType(PartyLabel);
      expectCompactStack(party);
      const name = root
        .findAllByType(Text)
        .find((node) => node.props.testID === `${personID}-name`)!;
      expect(parentView(name)).toBe(parentView(parentView(party)));
      const row = root.find(
        (node) => typeof node.type === 'string' && node.props.testID === rowID,
      );
      const label = row.props.accessibilityLabel as string;
      for (const word of ['Anne Urquhart', 'Labor', 'Senate'])
        expect(label.split(word)).toHaveLength(2);
      expect(row.props.accessible).toBe(true);
      expect(partyTarget(party).props.accessibilityLabel).toBeUndefined();
      if (surface === 'today') {
        const content = parentView(parentView(name));
        expect(content.props.accessibilityElementsHidden).toBe(true);
        expect(content.props.importantForAccessibility).toBe(
          'no-hide-descendants',
        );
      } else {
        const entry = root.find(
          (node) =>
            typeof node.type === 'string' &&
            node.props.testID === 'declaration-entry-0',
        );
        expect(entry.props.accessibilityLabel).not.toMatch(
          /Anne Urquhart|Labor|Senate/,
        );
      }
    },
  );

  test('expanded party target and VoiceOver action open the party independently', () => {
    const root = renderRow();
    const stopPropagation = jest.fn();
    act(() =>
      partyTarget(root.findByType(PartyLabel)).props.onPress({
        stopPropagation,
      }),
    );
    expect(stopPropagation).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenLastCalledWith(partyRoute('Labor'));
    const row = root.find(
      (node) => typeof node.type === 'string' && node.props.testID === rowID,
    );
    const actionName = surface === 'today' ? 'party' : 'openParty';
    expect(row.props.accessibilityActions).toContainEqual({
      name: actionName,
      label: 'Open Labor party page',
    });
    act(() =>
      row.props.onAccessibilityAction({
        nativeEvent: { actionName },
      }),
    );
    expect(router.push).toHaveBeenCalledTimes(2);
    expect(router.push).toHaveBeenLastCalledWith(partyRoute('Labor'));
  });

  test('a missing party leaves no party spacer', () => {
    const root = renderRow({ ...item, party: undefined });
    expect(root.findAllByType(PartyLabel)).toHaveLength(0);
    const name = root
      .findAllByType(Text)
      .find((node) => node.props.testID === `${personID}-name`)!;
    expect(
      parentView(name)
        .findAllByType(View)
        .filter((node) => flat(node)?.minHeight === minimumTarget),
    ).toHaveLength(0);
  });
});

test('unmatched year voices use the same compact name stack', () => {
  const data = decodeYear({
    year: 2025,
    generated_at: '2026-11-12',
    brief: { answer: 'A recorded debate.', sources: [] },
    voices: {
      unique_speeches: 2,
      unlabelled_party: 0,
      probes: [],
      speakers: [{ name: item.name, party: 'ALP', speeches: 2 }],
      parties: [{ party: 'ALP', speeches: 2 }],
    },
  });
  const root = draw(
    <YearVoices
      data={data}
      meta={{ asOf: data.generated_at, savedAt: null }}
      roster={null}
    />,
  );
  expectCompactStack(root.findByType(PartyLabel));
});

test('a standalone party control keeps its 44pt layout target', () => {
  const root = draw(<PartyLabel party="Labor" />);
  const target = root.find(
    (node) =>
      node.props.accessibilityRole === 'link' &&
      typeof node.props.onPress === 'function',
  );
  expect(flat(target)).toMatchObject({
    minHeight: minimumTarget,
    minWidth: minimumTarget,
  });
  expect(target.props.hitSlop).toBeUndefined();
  expect(rhythm.line).toBe(4);
});

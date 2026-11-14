import { act, type ReactElement } from 'react';
import { router } from 'expo-router';
import { Dimensions, StyleSheet, View } from 'react-native';
import TestRenderer, { type ReactTestInstance } from 'react-test-renderer';
import { PartyLabel, Portrait } from '../src/design/people';
import { RecordRow } from '../src/design/rows';
import { Text } from '../src/design/text';
import { minimumTarget, rhythm, textStyles } from '../src/design/tokens';
import { MemberHeroRow } from '../src/features/your-mp/MemberHeroRow';
import { docRoute, partyRoute, personRoute } from '../src/navigation/routes';

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
jest.mock('../src/features/your-mp/FaceStackRow', () => ({
  useFaceURIs: () => [],
}));
jest.mock('../src/features/follows/store', () => ({
  useFollows: () => [],
  loadFollows: jest.fn(async () => []),
  follow: jest.fn(),
  unfollow: jest.fn(),
}));

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
const strings = (node: ReactTestInstance) =>
  node
    .findAllByType(Text)
    .flatMap((text) => [text.props.children].flat())
    .filter((child): child is string => typeof child === 'string');
function target(root: ReactTestInstance, testID: string) {
  return root.find(
    (node) =>
      node.props.testID === testID &&
      node.props.accessibilityRole === 'link' &&
      typeof node.props.onPress === 'function',
  );
}
function partyTarget(root: ReactTestInstance) {
  return root.find(
    (node) => !!node.props.hitSlop && typeof node.props.onPress === 'function',
  );
}
function parentView(node: ReactTestInstance): ReactTestInstance {
  let parent = node.parent;
  while (parent && parent.type !== View) parent = parent.parent;
  if (!parent) throw new Error('Expected a containing View');
  return parent;
}
function tap(node: ReactTestInstance) {
  const stopPropagation = jest.fn();
  act(() => node.props.onPress({ stopPropagation }));
  expect(stopPropagation).toHaveBeenCalledTimes(1);
}
afterEach(() => {
  act(() => {
    trees.splice(0).forEach((tree) => tree.unmount());
    Dimensions.set({ window: initialWindow, screen: initialScreen });
  });
  jest.clearAllMocks();
});

test.each([1, 1.786, 3.571])(
  'speech names and parties stack beside a centred photo at font scale %s',
  (scale) => {
    const root = draw(
      <RecordRow
        meta="Speech"
        speaker={{
          name: 'Anthony Albanese with a long recorded name',
          party: 'Liberal National Party of Queensland',
          href: personRoute('anthony-albanese'),
          linkedParty: true,
          portrait: <Portrait name="Anthony Albanese" />,
        }}
        href={docRoute('speech-123')}
        testID="speech"
      />,
      scale,
    );
    const name = target(root, 'speech-speaker');
    const party = root.findByType(PartyLabel);
    const words = parentView(name);
    const partyFrame = parentView(party);
    expect(parentView(partyFrame)).toBe(words);
    expect(strings(words)).toEqual([
      'Anthony Albanese with a long recorded name',
      'Liberal National Party of Queensland',
    ]);
    expect(flat(words)).toMatchObject({
      flexDirection: 'column',
      gap: rhythm.line,
      flex: 1,
      minWidth: 0,
    });
    expect(flat(parentView(words))).toMatchObject({
      flexDirection: 'row',
      alignItems: 'center',
    });
    expect(root.findByType(Portrait).props.size).toBeUndefined();
    expect(flat(name)).toMatchObject({
      minHeight: minimumTarget,
      minWidth: minimumTarget,
      justifyContent: 'flex-end',
    });
    expect(flat(partyFrame).minHeight).toBe(minimumTarget);
    const partyLink = partyTarget(party);
    expect(flat(partyLink).minWidth).toBe(minimumTarget);
    expect(flat(partyLink).minHeight).toBeUndefined();
    expect(
      textStyles.secondary.lineHeight + partyLink.props.hitSlop.bottom,
    ).toBe(minimumTarget);
    for (const text of words.findAllByType(Text)) {
      expect(text.props.numberOfLines).toBeUndefined();
      expect(text.props.wordSafe).toBe(scale >= 1.786 || !text.props.onPress);
    }
    expect(flat(words).height).toBeUndefined();
    expect(flat(partyFrame).height).toBeUndefined();
  },
);

test('speech name, party text and expanded party target open independently', () => {
  const select = jest.fn();
  const action = jest.fn();
  const profile = personRoute('anthony-albanese');
  const root = draw(
    <RecordRow
      meta="Speech"
      speaker={{
        name: 'Anthony Albanese',
        party: 'ALP',
        href: profile,
        linkedParty: true,
      }}
      onPress={select}
      menu={[{ title: 'Copy link', symbol: 'link', onPress: action }]}
      testID="speech"
    />,
  );
  const name = target(root, 'speech-speaker');
  expect(name.props.accessibilityRole).toBe('link');
  tap(name);
  expect(router.push).toHaveBeenCalledTimes(1);
  expect(router.push).toHaveBeenCalledWith(profile);
  jest.mocked(router.push).mockClear();
  const party = root.findByType(PartyLabel);
  const inline = party.findAllByType(Text).find((node) => node.props.onPress)!;
  expect(inline.props.accessibilityRole).toBe('link');
  expect(inline.props.accessibilityLabel).toBe('Open ALP party page');
  for (const target of [inline, partyTarget(party)]) {
    tap(target);
    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith(partyRoute('Labor'));
    jest.mocked(router.push).mockClear();
  }
  expect(select).not.toHaveBeenCalled();
  const reader = target(root, 'speech');
  expect(reader.props.accessibilityActions).toContainEqual({
    name: 'Copy link',
    label: 'Copy link',
  });
  act(() =>
    reader.props.onAccessibilityAction({
      nativeEvent: { actionName: 'Copy link' },
    }),
  );
  expect(action).toHaveBeenCalledTimes(1);
  tap(reader);
  expect(select).toHaveBeenCalledTimes(1);
});

test.each([false, true])(
  'a speaker without a party collapses to one line, matched: %s',
  (matched) => {
    const root = draw(
      <RecordRow
        meta="Speech"
        speaker={{
          name: 'Recorded speaker',
          party: null,
          href: matched ? personRoute('recorded-speaker') : undefined,
        }}
        testID="speech"
      />,
    );
    expect(root.findAllByType(PartyLabel)).toHaveLength(0);
    const name = root
      .findAllByType(Text)
      .find((node) => node.props.children === 'Recorded speaker')!;
    expect(name.props.onPress).toBeUndefined();
    const words = matched
      ? parentView(target(root, 'speech-speaker'))
      : parentView(parentView(name));
    expect(words.children).toHaveLength(1);
    expect(flat(words).minHeight).toBeUndefined();
  },
);

test('member text stays compact and retains profile and party actions', () => {
  for (const scale of [1, 1.786, 3.571]) {
    const root = draw(
      <MemberHeroRow
        name="Jo Briskey with a long recorded name"
        slug="jo-briskey"
        party="Labor"
        tenure="Member since 2025"
        testID="member"
      />,
      scale,
    );
    const name = root
      .findAllByType(Text)
      .find((node) => node.props.testID === 'member-name')!;
    const words = parentView(name);
    const party = root.findByType(PartyLabel);
    const detail = parentView(party);
    expect(flat(words)).toMatchObject({
      flexDirection: 'column',
      gap: rhythm.line,
      alignSelf: 'stretch',
    });
    expect(flat(words).flex).toBe(scale === 1 ? 1 : undefined);
    expect(parentView(detail)).toBe(words);
    expect(flat(detail)).toMatchObject({
      minHeight: minimumTarget,
      gap: rhythm.line,
    });
    expect(strings(detail)).toEqual(['Labor', 'Member since 2025']);
    expect(root.findByType(Portrait).props.size).toBe(80);
    const member = root.find(
      (node) =>
        typeof node.type === 'string' &&
        node.props.testID === 'member' &&
        node.props.accessible,
    );
    const visual = member.find(
      (node) => typeof node.props.style === 'function',
    );
    expect(
      StyleSheet.flatten(visual.props.style({ pressed: false }))
        .paddingVertical,
    ).toBe(rhythm.row);
    expect(member.props.accessibilityActions).toContainEqual({
      name: 'party',
      label: 'Open party',
    });
    act(() => member.props.onAccessibilityTap());
    expect(router.push).toHaveBeenLastCalledWith(personRoute('jo-briskey'));
    act(() =>
      member.props.onAccessibilityAction({
        nativeEvent: { actionName: 'party' },
      }),
    );
    expect(router.push).toHaveBeenLastCalledWith(partyRoute('Labor'));
    tap(partyTarget(party));
    expect(router.push).toHaveBeenLastCalledWith(partyRoute('Labor'));
    for (const text of words.findAllByType(Text))
      expect(text.props.numberOfLines).toBeUndefined();
  }
});

test.each([null, 'Member since 2025'])(
  'member text omits a missing party without a spacer, tenure: %s',
  (tenure) => {
    const root = draw(
      <MemberHeroRow
        name="Jo Briskey"
        slug="jo-briskey"
        party={null}
        tenure={tenure}
        testID="member"
      />,
    );
    expect(root.findAllByType(PartyLabel)).toHaveLength(0);
    const name = root
      .findAllByType(Text)
      .find((node) => node.props.testID === 'member-name')!;
    expect(
      parentView(name)
        .findAllByType(Text)
        .map((node) => node.props.children),
    ).toEqual(tenure ? ['Jo Briskey', tenure] : ['Jo Briskey']);
  },
);

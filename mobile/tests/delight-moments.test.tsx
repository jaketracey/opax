import { act } from 'react';
import {
  Platform,
  StyleSheet,
  Text as NativeText,
  useWindowDimensions,
} from 'react-native';
import TestRenderer from 'react-test-renderer';
import { Icon } from '../src/design/icon';
import { PersonRow } from '../src/design/people';
import { StatTile } from '../src/design/record';
import { Text } from '../src/design/text';
import { MyMemberProvider } from '../src/features/your-mp/useIsMyMember';
import { useSeat } from '../src/features/your-mp/useSeat';
import * as seatModel from '../src/features/your-mp/model';
import { MatchRow } from '../src/features/search/rows';
import { formerMemberLine } from '../src/features/people/model';
import type { PersonProfile } from '../src/api/person-identity';

const MEMBER = 'person_111111111111111111111111';
const OTHER = 'person_222222222222222222222222';
const SEAT = 'el_111111111111111111111111';
const mockDirectory = {
  electorates: {
    data: {
      electorates: [
        {
          electorate_id: SEAT,
          jurisdiction: 'federal',
          chamber: 'representatives',
          status: 'current',
          representation_status: 'verified',
          representatives: [{ person_id: MEMBER }],
        },
      ],
    },
  },
};
const member = {
  slug: 'casey-example',
  canonicalPersonId: MEMBER,
  name: 'Casey Example',
} as PersonProfile;
jest.mock('../src/features/your-mp/useSeat', () => ({
  useSeat: jest.fn(),
  savedSeatDirectory: () => mockDirectory,
}));
jest.mock('../src/features/your-mp/useSetAsMyElectorate', () => ({
  useSetAsMyElectorate: () => ({ visible: false }),
}));
jest.mock('../src/api/runtime', () => ({
  catalogs: {},
  portraits: { get: jest.fn() },
}));
jest.mock('../src/features/CachedPortrait', () => ({
  CachedPortrait: () => null,
}));
jest.mock('../src/features/follows/store', () => ({
  ...jest.requireActual('../src/features/follows/store'),
  useFollows: () => [],
}));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: jest.fn(),
}));
jest.mock('expo-router', () => ({
  useIsPreview: () => false,
  useSegments: () => [],
  router: { push: jest.fn() },
  Link: Object.assign(({ children }: { children: unknown }) => children, {
    Trigger: ({ children }: { children: unknown }) => children,
    Preview: () => null,
    Menu: () => null,
    MenuAction: () => null,
  }),
}));
function render(element: React.ReactElement) {
  let r!: TestRenderer.ReactTestRenderer;
  act(() => {
    r = TestRenderer.create(element);
  });
  return r;
}
beforeEach(() => {
  jest
    .mocked(useWindowDimensions)
    .mockReturnValue({ width: 390, height: 844, scale: 3, fontScale: 1 });
  jest
    .mocked(useSeat)
    .mockReturnValue({ status: 'chosen', choice: { seatId: SEAT } } as never);
  jest.spyOn(seatModel, 'representativeProfile').mockReturnValue(member);
});
afterEach(() => jest.restoreAllMocks());

test.each(['ios', 'android'] as const)(
  '%s marks only the member row, under its party, at Large and AX5',
  (platform) => {
    jest.replaceProperty(Platform, 'OS', platform);
    for (const fontScale of [1, 3.571]) {
      jest
        .mocked(useWindowDimensions)
        .mockReturnValue({ width: 390, height: 844, scale: 3, fontScale });
      const r = render(
        <MyMemberProvider>
          <PersonRow
            name="Casey Example"
            href={{ pathname: '/person/[slug]', params: { slug: MEMBER } }}
            party="Labor"
            partyStatus="current"
            testID="mine"
          />
          <PersonRow
            name="Robin Sample"
            href={{ pathname: '/person/[slug]', params: { slug: OTHER } }}
            party="Labor"
            partyStatus="current"
            testID="other"
          />
          <PersonRow name="Morgan Witness" testID="witness" />
        </MyMemberProvider>,
      );
      expect(
        r.root
          .findAllByType(Text)
          .filter((n) => n.props.children === 'Your MP'),
      ).toHaveLength(1);
      const mark = r.root
        .findAllByType(Icon)
        .find((n) => n.props.name === 'building.columns')!;
      expect(mark.props).toMatchObject({ size: 13, tone: 'inkSoft' });
      const label = r.root.findAll(
        (n) => typeof n.type === 'string' && n.props.testID === 'mine',
      )[0]!.props.accessibilityLabel;
      expect(label).toMatch(/^Casey Example, Labor.*Your MP$/);
      const texts = r.root
        .findAllByType(NativeText)
        .map((n) => n.props.children);
      expect(texts.indexOf('Your MP')).toBeGreaterThan(texts.indexOf('Labor'));
      const markText = r.root
        .findAllByType(Text)
        .find((n) => n.props.children === 'Your MP')!;
      expect(markText.props).toMatchObject({
        variant: 'footnote',
        tone: 'inkSoft',
      });
      expect(markText.props.numberOfLines).toBeUndefined();
      const plain = r.root
        .findAllByType(PersonRow)
        .find((n) => n.props.testID === 'witness')!;
      expect(
        plain
          .findAllByType(Icon)
          .filter((n) => n.props.name === 'chevron.right'),
      ).toHaveLength(0);
      act(() => r.unmount());
    }
  },
);

test('a list resolves the seat once for a hundred rows', () => {
  jest.mocked(useSeat).mockClear();
  const r = render(
    <MyMemberProvider>
      {Array.from({ length: 100 }, (_, i) => (
        <PersonRow
          key={i}
          name={`Example ${i}`}
          href={{
            pathname: '/person/[slug]',
            params: { slug: i === 0 ? MEMBER : OTHER },
          }}
        />
      ))}
    </MyMemberProvider>,
  );
  expect(useSeat).toHaveBeenCalledTimes(1);
  expect(seatModel.representativeProfile).toHaveBeenCalledTimes(1);
  act(() => r.unmount());
});

test.each(['result', 'suggestion'] as const)(
  'Search %s uses the shared member row and its spoken suffix',
  (variant) => {
    const person = {
      name: 'Casey Example',
      pid: '90123',
      current: true,
      party: 'Labor',
    };
    const r = render(
      <MyMemberProvider>
        <MatchRow
          variant={variant}
          q="Casey"
          match={{ kind: 'people', item: person } as never}
          sources={{
            people: {
              people: [{ person_id: MEMBER, legacy_person_id: '90123' }],
            } as never,
          }}
          testID="search-top-hit"
        />
      </MyMemberProvider>,
    );
    expect(r.root.findByType(PersonRow).props.name).toBe('Casey Example');
    expect(
      r.root.findAllByType(Text).filter((n) => n.props.children === 'Your MP'),
    ).toHaveLength(1);
    expect(
      r.root.findAll(
        (n) =>
          typeof n.type === 'string' && n.props.testID === 'search-top-hit',
      )[0]!.props.accessibilityLabel,
    ).toMatch(/Your MP$/);
    act(() => r.unmount());
  },
);

test('without a saved seat no row acquires the mark', () => {
  jest.mocked(useSeat).mockReturnValue({ status: 'none' } as never);
  const r = render(
    <MyMemberProvider>
      <PersonRow
        name="Casey Example"
        href={{ pathname: '/person/[slug]', params: { slug: MEMBER } }}
      />
    </MyMemberProvider>,
  );
  expect(
    r.root.findAllByType(Text).filter((n) => n.props.children === 'Your MP'),
  ).toHaveLength(0);
  act(() => r.unmount());
});

test('a tile keeps the chevron inside the wrapping label, after its last word', () => {
  const r = render(
    <StatTile value="761" label="divisions voted in" onPress={jest.fn()} />,
  );
  const label = r.root
    .findAllByType(Text)
    .find((n) => n.props.variant === 'footnote')!;
  expect(label.findByType(Icon).props).toMatchObject({
    name: 'chevron.right',
    tone: 'inkFaint',
    size: 13,
  });
  expect(StyleSheet.flatten(label.props.style)?.flexDirection).toBeUndefined();
  act(() => r.unmount());
});

test('former identity uses the last representation and its recorded periods', () => {
  const identity = {
    ...member,
    partyStatus: 'former',
    seats: [
      {
        name: 'Example Vale',
        electorate_id: SEAT,
        current: false,
        jurisdiction: 'federal',
        chamber: 'representatives',
        periods: [{ start: '1998-10-03', end: '2013-08-05' }],
      },
    ],
    rosterRow: {
      representation: [{ electorate: 'Example Vale', state: 'VIC' }],
    },
  } as PersonProfile;
  expect(formerMemberLine(identity)).toBe(
    'Former member for Example Vale, Victoria, 1998 to 2013',
  );
});

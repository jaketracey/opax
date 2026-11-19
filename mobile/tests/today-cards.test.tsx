import { act, type ReactElement, type ReactNode } from 'react';
import {
  Image,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import * as Native from 'react-native';
import {
  fireEvent,
  render as renderNative,
} from '@testing-library/react-native';
import TestRenderer, { type ReactTestInstance } from 'react-test-renderer';
import { decodeRoster, decodeSlugs } from '../src/api/catalog-decoders';
import type { Block, EditionView } from '../src/api/selectors';
import { catalogs, yearPictures } from '../src/api/runtime';
import { yearPictureKey } from '../src/api/year-picture-policy';
import {
  useIncreaseContrast,
  useReduceMotionSetting,
} from '../src/design/accessibility';
import { Card } from '../src/design/card';
import { SourceLine } from '../src/design/source';
import { Text } from '../src/design/text';
import { colors, radii } from '../src/design/tokens';
import { EditionCard } from '../src/features/edition/EditionCard';
import { Plate } from '../src/features/edition/Plate';
import Svg, { Path } from 'react-native-svg';
import {
  darkHighContrast,
  lightHighContrast,
  paletteFor,
} from '../src/design/palette';
import { Picture } from '../src/features/explore/Picture';
import { contrastRatio } from '../src/design/contrast';
import {
  FIELD_OPACITY,
  HIGH_FIELD_OPACITY,
  QUIZ_ART_RATIO,
  QuizArt,
  quizArtPaths,
} from '../src/features/today/QuizArt';
import { explore } from '../src/features/explore/runtime';
import type { YearPicture } from '../src/features/explore/pictures';
import {
  ArchiveCard,
  archiveLabel,
  archivePicture,
  DailyPair,
  QuestionCard,
} from '../src/features/today/DailyPair';
import { frontPageSkip } from '../src/features/today/archive-review';
import { rules } from '../src/features/today/sources';
import {
  FEATURED_CONTEXT,
  FEATURED_HEADING,
  FeaturedPeopleCarousel,
  featuredLabel,
  TodayEditionCard,
} from '../src/features/today/FeaturedPeopleCard';
import {
  FEATURED_PEOPLE_RULE,
  featuredGroup,
  featuredPeople,
} from '../src/features/today/featured-people';
import { addDays, archiveYear } from '../src/features/today/rules';
import { personRoute } from '../src/navigation/routes/people';
import { roster as fixtureRoster, slugs as fixtureSlugs } from './pinned';

jest.mock('../src/api/runtime', () => ({
  catalogs: { roster: jest.fn(), slugs: jest.fn() },
  portraits: { get: jest.fn(async () => null) },
  yearPictures: { get: jest.fn(async () => null) },
}));
jest.mock('../src/features/explore/runtime', () => ({
  explore: { pictures: jest.fn() },
}));
jest.mock('../src/api/image-policy', () => ({
  localImageURI: (uri: string) => uri,
}));
jest.mock('../src/design/accessibility', () => ({
  ...jest.requireActual('../src/design/accessibility'),
  useReduceMotionSetting: jest.fn(() => false),
  useIncreaseContrast: jest.fn(() => false),
}));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: jest.fn(),
}));
jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Native = require('react-native');
  const Wrap = ({ children, ...props }: { children?: ReactNode }) =>
    React.createElement(Native.View, props, children);
  return {
    Link: Object.assign(Wrap, {
      Trigger: Wrap,
      Preview: () => null,
      Menu: Wrap,
      MenuAction: Wrap,
    }),
    router: { push: jest.fn(), navigate: jest.fn() },
    useSegments: () => [],
  };
});

const today = '2026-11-10';
const picture: YearPicture = {
  file: 'years/pictures/2021/archive.webp',
  width: 1600,
  height: 1000,
  caption:
    'A long archive caption with context that should remain readable at the largest accessibility text size.',
  credit: 'Archive photographer with a long credit',
  licence: 'CC BY 4.0',
  event: 'A public event',
  date: null,
  author: 'Archive photographer',
  licence_url: 'https://creativecommons.org/licenses/by/4.0/',
  source_url: 'https://example.org/photo',
  original_url: 'https://example.org/original',
};
const edition: EditionView = {
  date: today,
  kind: 'politician',
  kindLabel: 'Parliamentarian',
  kindShort: 'Parliamentarian',
  title: 'Richard Marles',
  cardTitle: 'Richard Marles',
  shortTitle: null,
  path: '/person/richard-marles',
  paragraphs: ['MP for Corio, in Victoria. 793 speeches to read.'],
  machineWritten: null,
  sourceRows: [],
  facts: {
    kicker: 'Parliamentarian',
    line: 'Labor',
    figures: [],
    bars: null,
    events: [],
    division: null,
  },
};
const rows = [
  ['Richard Marles', 'Labor'],
  ['Another Labor', 'Australian Labor Party'],
  ['Liberal Member', 'Liberal'],
  ['National Member', 'The Nationals'],
  ['Queensland Member', 'LNP'],
  ['Greens Member', 'Greens'],
  ['Other Greens', 'Australian Greens'],
  ['Independent Member', 'Independent'],
  ['Centre Member', 'Centre Alliance'],
  ['Nation Member', 'One Nation'],
];
const roster = decodeRoster({
  meta: { generated: '2026-11-09' },
  people: rows.map(([name, party], index) => ({
    name,
    party,
    pid: String(10000 + index),
    current: true,
    ...(index === 8 ? {} : { speeches: index === 9 ? 0 : 793 + index }),
    representation: [
      {
        jurisdiction: 'federal',
        chamber: 'representatives',
        electorate: 'Example',
        state: 'VIC',
      },
    ],
  })),
});
const slugs = decodeSlugs({
  generated: '2026-11-09',
  slugs: Object.fromEntries(
    rows.map(([name]) => [name!.toLowerCase().replaceAll(' ', '-'), name]),
  ),
});
const block: Block<EditionView> = {
  status: 'ready',
  data: edition,
  asAt: today,
  sources: [],
  stale: false,
  savedAt: null,
};
const people = featuredPeople(edition, roster, slugs);

const mounted: TestRenderer.ReactTestRenderer[] = [];
async function render(element: ReactElement) {
  let result!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    result = TestRenderer.create(element);
  });
  mounted.push(result);
  return result;
}
const host = (root: ReactTestInstance, testID: string) =>
  root.findAll(
    (node) => typeof node.type === 'string' && node.props.testID === testID,
  )[0]!;
beforeEach(() => {
  jest
    .mocked(useWindowDimensions)
    .mockReturnValue({ width: 402, height: 874, scale: 3, fontScale: 1 });
  jest.mocked(useReduceMotionSetting).mockReturnValue(false);
  jest
    .mocked(catalogs.roster)
    .mockResolvedValue({ data: roster, stale: false, savedAt: null } as never);
  jest
    .mocked(catalogs.slugs)
    .mockResolvedValue({ data: slugs, stale: false, savedAt: null } as never);
  jest
    .mocked(explore.pictures)
    .mockResolvedValue({ data: { [archiveYear(today)]: [picture] } } as never);
});
afterEach(() => {
  act(() => mounted.splice(0).forEach((renderer) => renderer.unmount()));
  jest.restoreAllMocks();
  jest.clearAllMocks();
});

describe('full-width daily cards', () => {
  test('archive selection skips invented ids and collapses when all are skipped', () => {
    const first = {
      ...picture,
      file: 'years/pictures/2021/invented-first.webp',
    };
    const second = {
      ...picture,
      file: 'years/pictures/2021/invented-second.webp',
    };
    const manifest = { [archiveYear(today)]: [first, second] };
    expect(
      archivePicture(manifest, today, new Set([first.file]))?.picture,
    ).toBe(second);
    expect(
      archivePicture(manifest, today, new Set([first.file, second.file])),
    ).toBeNull();
    expect(rules.archive).toContain(
      'Photographs of protests and party events are left out.',
    );
  });
  test('an all-skipped archive leaves only the full-width question card', async () => {
    const skipped = {
      ...picture,
      file: 'years/pictures/2021/invented-skipped.webp',
    };
    jest
      .spyOn(frontPageSkip, 'has')
      .mockImplementation((id) => id === skipped.file);
    jest.mocked(explore.pictures).mockResolvedValue({
      data: { [archiveYear(today)]: [skipped] },
    } as never);
    const { root } = await render(<DailyPair today={today} attempt={0} />);
    expect(root.findAllByType(ArchiveCard)).toHaveLength(0);
    expect(root.findAllByType(QuestionCard)).toHaveLength(1);
    expect(
      StyleSheet.flatten(root.findByType(QuestionCard).parent!.props.style),
    ).toEqual({ alignSelf: 'stretch', flexGrow: 1 });
  });
  describe.each(['landscape', 'portrait'] as const)(
    '%s archive media',
    (shape) => {
      test.each([
        ['light', 1],
        ['dark', 1],
        ['light', 3.571],
        ['dark', 3.571],
      ] as const)(
        'fills the card in %s at font scale %s',
        async (scheme, fontScale) => {
          jest.spyOn(Native, 'useColorScheme').mockReturnValue(scheme);
          jest
            .spyOn(Native.Appearance, 'getColorScheme')
            .mockReturnValue(scheme);
          jest.mocked(useWindowDimensions).mockReturnValue({
            width: 320,
            height: 874,
            scale: 3,
            fontScale,
          });
          jest.mocked(useReduceMotionSetting).mockReturnValue(true);
          jest
            .mocked(yearPictures.get)
            .mockResolvedValueOnce('file:///cache/archive.webp');
          const photo = {
            ...picture,
            ...(shape === 'portrait' ? { width: 1000, height: 1600 } : {}),
          };
          const { root } = await render(
            <ArchiveCard year={2021} picture={photo} />,
          );
          const image = root.findByType(Image);
          expect(image.props.resizeMode).toBe('cover');
          expect(StyleSheet.flatten(image.props.style)).toMatchObject({
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
          });
          const key = yearPictureKey('/' + photo.file);
          const frame = host(root, `tm-photo-${key}-placeholder`);
          const mediaStyle = StyleSheet.flatten(frame.props.style);
          expect(mediaStyle).toMatchObject({
            width: '100%',
            aspectRatio: 4 / 3,
            borderRadius: 0,
          });
          const card = root.findByType(Card);
          expect(card.props.padded).toBe(false);
          expect(card.props.children[0].type).toBe(Picture);
          // RowLink's outer accessibility host only carries flex layout.
          const surfaceNode = card
            .findAll(
              (node) =>
                typeof node.type === 'string' &&
                node.props.accessibilityRole === 'link',
            )
            .at(-1)!;
          const surface = StyleSheet.flatten(surfaceNode.props.style);
          expect(surface).toMatchObject({
            backgroundColor: colors.raised,
            borderRadius: radii.container,
            overflow: 'hidden',
          });
          expect(surface.padding).toBeUndefined();
          expect(surface.height).toBeUndefined();
          act(() => image.props.onLoad());
          expect(
            StyleSheet.flatten(
              host(root, `tm-photo-${key}-loaded`).props.style,
            ),
          ).toEqual(mediaStyle);
          const lines = root.findAllByType(Text);
          expect(
            lines.find((node) => node.props.children === photo.caption)!.props
              .numberOfLines,
          ).toBe(fontScale === 1 ? 3 : undefined);
          expect(
            lines.find(
              (node) =>
                node.props.children ===
                `Photo: ${photo.author} · ${photo.licence}`,
            )!.props.numberOfLines,
          ).toBeUndefined();
        },
      );
    },
  );
  test.each([1, 3.571])(
    'archive and question each own a full row at font scale %s',
    async (fontScale) => {
      jest
        .mocked(useWindowDimensions)
        .mockReturnValue({ width: 402, height: 874, scale: 3, fontScale });
      const { root } = await render(<DailyPair today={today} attempt={0} />);
      const pair = host(root, 'today-pair');
      expect(StyleSheet.flatten(pair.props.style)).toMatchObject({
        alignItems: 'stretch',
      });
      expect(StyleSheet.flatten(pair.props.style).flexDirection).not.toBe(
        'row',
      );
      const archive = root.findByType(ArchiveCard);
      const question = root.findByType(QuestionCard);
      for (const card of [archive, question]) {
        expect(StyleSheet.flatten(card.parent!.props.style)).toEqual({
          alignSelf: 'stretch',
          flexGrow: 1,
        });
        expect(
          StyleSheet.flatten(card.parent!.props.style).height,
        ).toBeUndefined();
      }
      expect(archive.findByType(Picture).props).toMatchObject({
        ratio: 4 / 3,
        rounded: false,
      });
      const caption = archive
        .findAllByType(Text)
        .find((node) => node.props.children === picture.caption)!;
      expect(caption.props.numberOfLines).toBe(fontScale === 1 ? 3 : undefined);
      const credit = archive
        .findAllByType(Text)
        .find(
          (node) =>
            node.props.children ===
            `Photo: ${picture.author} · ${picture.licence}`,
        )!;
      expect(credit.props.numberOfLines).toBeUndefined();
      expect(archive.findByType(Card).props.href.params).toMatchObject({
        year: String(archiveYear(today)),
        photo: picture.file,
      });
    },
  );
  test('while the photograph is looked up the archive card holds its own shape, and a failed photo keeps the frame', async () => {
    jest.mocked(explore.pictures).mockReturnValue(new Promise(() => {}));
    const { root } = await render(<DailyPair today={today} attempt={0} />);
    const loading = host(root, 'today-archive-loading');
    // The 4:3 frame, then the kicker, the year, three caption lines and
    // the credit, each an unseen line of the real type: the loaded card
    // lands on it (a 200 pt stand-in pushed the cards under it 150 pt).
    expect(
      StyleSheet.flatten(host(root, 'today-archive-loading-frame').props.style),
    ).toMatchObject({ width: '100%', aspectRatio: 4 / 3 });
    expect(
      host(root, 'today-archive-loading-words')
        .findAllByType(Text)
        .map((node) => node.props.variant),
    ).toEqual([
      'footnote',
      'tileFigure',
      'secondary',
      'secondary',
      'secondary',
      'footnote',
    ]);
    expect(loading.props.accessibilityLabel).toBe(
      'Loading the archive photograph',
    );
    // Side by side with a taller question card, the skeleton fills the
    // row as the loaded card does: each wrapper and the card grow, so the
    // card's bottom does not drop when the photograph's card arrives.
    for (const id of ['today-archive-loading', 'today-archive-loading-shape'])
      expect(StyleSheet.flatten(host(root, id).props.style)).toMatchObject({
        flexGrow: 1,
      });
    expect(
      StyleSheet.flatten(loading.findByType(Card).props.style),
    ).toMatchObject({ flexGrow: 1 });
    // A photo that cannot be loaded leaves its frame: nothing collapses.
    const card = await render(
      <ArchiveCard year={archiveYear(today)} picture={picture} />,
    );
    expect(card.root.findByType(Picture).props.failure).toBe('mark');
    // Dark: the frame runs to the card's edge and paints over its hairline,
    // and an empty frame is sunken on Today's sunken ground. The hairline is
    // drawn again on top, loading and loaded. The role is clear in light.
    for (const edge of [
      host(root, 'today-archive-loading-edge'),
      host(card.root, 'today-archive-edge'),
    ]) {
      expect(edge.props.pointerEvents).toBe('none');
      expect(StyleSheet.flatten(edge.props.style)).toMatchObject({
        position: 'absolute',
        borderColor: colors.raisedOutline,
        borderRadius: radii.container,
      });
    }
  });
  test.each(['light', 'dark'] as const)(
    'the question card has a header in the archive photograph’s frame, drawn in the app palette (%s)',
    async (scheme) => {
      jest.spyOn(Native, 'useColorScheme').mockReturnValue(scheme);
      jest.spyOn(Native.Appearance, 'getColorScheme').mockReturnValue(scheme);
      const { root } = await render(<DailyPair today={today} attempt={0} />);
      const question = root.findByType(QuestionCard);
      const card = question.findByType(Card);
      // The archive card's construction: no padding, the header first.
      expect(card.props.padded).toBe(false);
      expect(card.props.children[0].type).toBe(QuizArt);
      const art = host(question, 'today-question-art');
      const palette = paletteFor(scheme);
      const high = scheme === 'dark' ? darkHighContrast : lightHighContrast;
      // The same slot: the card's full width, 4:3, the card's own corners.
      expect(StyleSheet.flatten(art.props.style)).toEqual({
        width: '100%',
        aspectRatio: 4 / 3,
        overflow: 'hidden',
        // The role, so the ground follows Increase Contrast natively.
        backgroundColor: colors.navyWash,
      });
      const archive = root.findByType(ArchiveCard);
      const photo = StyleSheet.flatten(
        archive
          .findByType(Picture)
          .findAll((n) => typeof n.type === 'string')[0]!.props.style,
      );
      expect(photo).toMatchObject({ width: '100%', aspectRatio: 4 / 3 });
      // Decoration: the card stays one link, read as before.
      expect(art.props.importantForAccessibility).toBe('no-hide-descendants');
      expect(art.props.accessibilityElementsHidden).toBe(true);
      const link = question
        .findAll(
          (node) =>
            typeof node.type === 'string' &&
            node.props.accessibilityRole === 'link',
        )
        .at(-1)!;
      expect(link.props.accessibilityLabel).toMatch(/^Today’s question\. /);
      // Vector, in the art's own 4:3 units, filling the frame: crisp at
      // every size, and in its final size with no measuring.
      const svg = art.findByType(Svg);
      expect(svg.props).toMatchObject({
        width: '100%',
        height: '100%',
        viewBox: '0 0 320 240',
        preserveAspectRatio: 'xMidYMid slice',
      });
      const [field, lit] = art.findAllByType(Path);
      expect(field!.props.fill).toBe(palette.navy);
      expect(lit!.props.fill).toBe(palette.todayDotBronze);
      expect(field!.props.fillOpacity).toBe(FIELD_OPACITY);
      // Increase Contrast must raise the mark's contrast, not lower it. The
      // map's bronze has no stronger form and the wash under it darkens
      // (2.33 to 2.05 in light, 4.59 to 3.86 in dark), so the mark takes
      // the brand artwork's bronze ink: 3:1 or more on the stronger wash,
      // and more than the standard pair.
      jest.mocked(useIncreaseContrast).mockReturnValue(true);
      const contrast = await render(<QuizArt />);
      const [highField, highLit] = contrast.root.findAllByType(Path);
      expect(highLit!.props.fill).toBe(high.bronzeInk);
      expect(highLit!.props.fill).not.toBe(palette.todayDotBronze);
      const standard = contrastRatio(palette.todayDotBronze, palette.navyWash);
      const raised = contrastRatio(high.bronzeInk!, high.navyWash!);
      expect(raised).toBeGreaterThanOrEqual(3);
      expect(raised).toBeGreaterThan(standard);
      // What it replaced: the map's bronze on the stronger wash, under 3:1
      // in light and lower than standard in both.
      expect(
        contrastRatio(palette.todayDotBronze, high.navyWash!),
      ).toBeLessThan(standard);
      // The field's dots are firmer too.
      expect(highField!.props.fill).toBe(high.navy ?? palette.navy);
      expect(highField!.props.fillOpacity).toBe(HIGH_FIELD_OPACITY);
      expect(HIGH_FIELD_OPACITY).toBeGreaterThan(FIELD_OPACITY);
      jest.mocked(useIncreaseContrast).mockReturnValue(false);
      // Both cards fill their cell, so side by side they end on one line.
      for (const each of [archive, question])
        expect(
          StyleSheet.flatten(each.findByType(Card).props.style),
        ).toMatchObject({ flexGrow: 1 });
    },
  );
  test('the quiz art is one image: a question mark in a field of dots, the same for every question', () => {
    const first = quizArtPaths();
    expect(quizArtPaths()).toEqual(first);
    // 31 by 23 dots on a 10 unit grid; the lit ones are the mark.
    const dots = (d: string) => d.split('M').length - 1;
    expect(dots(first.field) + dots(first.lit)).toBe(31 * 23);
    expect(dots(first.lit)).toBe(first.count);
    expect(first.count).toBeGreaterThan(30);
    expect(QUIZ_ART_RATIO).toBe(4 / 3);
  });
  test('a photograph from this year is "From the record" with its full date; older ones keep the archive and the year', async () => {
    expect(archiveLabel(2021, '2021-05-04', '2026-11-15')).toEqual({
      kicker: 'From the archive',
      figure: '2021',
    });
    expect(archiveLabel(2026, '2026-11-03', '2026-11-15')).toEqual({
      kicker: 'From the record',
      figure: '3 Nov 2026',
    });
    // No whole date: the year, never a guessed day.
    expect(archiveLabel(2026, null, '2026-11-15')).toEqual({
      kicker: 'From the record',
      figure: '2026',
    });
    expect(archiveLabel(2026, '2026-11', '2026-11-15').figure).toBe('2026');
    const { root } = await render(
      <ArchiveCard
        year={2026}
        picture={{ ...picture, date: '2026-11-03' }}
        today="2026-11-15"
      />,
    );
    const words = root.findAllByType(Text).map((node) => node.props.children);
    expect(words).toContain('From the record');
    expect(words).not.toContain('From the archive');
    // Word-safe with plain spaces: at the largest sizes in a narrow column
    // it wraps between the day, month and year or steps down, and is never
    // split inside "2026" (no-break spaces made it wrap by character).
    const figure = root.findAll(
      (node) =>
        node.type === Text && node.props.testID === 'today-archive-figure',
    )[0]!;
    expect(figure.props.children).toBe('3 Nov 2026');
    expect(figure.props.children).not.toMatch(/\u00a0/);
    expect(figure.props.wordSafe).toBe(true);
    expect(figure.props.numberOfLines).toBeUndefined();
    const link = root
      .findAll(
        (node) =>
          typeof node.type === 'string' &&
          node.props.accessibilityRole === 'link',
      )
      .at(-1)!;
    expect(link.props.accessibilityLabel).toMatch(
      /^From the record, 3 Nov 2026\. /,
    );
  });
  test('the pair tells the archive card today’s date, so this year’s photograph is labelled from the record', async () => {
    // 29 January 2026: the day the archive's rotation lands on 2026 itself.
    const thisYear = '2026-01-29';
    const year = archiveYear(thisYear);
    jest.mocked(explore.pictures).mockResolvedValue({
      data: { [year]: [{ ...picture, date: '2026-01-12' }] },
    } as never);
    const { root } = await render(<DailyPair today={thisYear} attempt={0} />);
    const card = root.findByType(ArchiveCard);
    expect(card.props.today).toBe(thisYear);
    expect(year).toBe(2026);
    expect(
      card.findAllByType(Text).map((node) => node.props.children),
    ).toContain('From the record');
  });
  test('a missing archive leaves the full-width question', async () => {
    jest.mocked(explore.pictures).mockRejectedValue(new Error('offline'));
    const { root } = await render(<DailyPair today={today} attempt={1} />);
    expect(root.findAllByType(ArchiveCard)).toHaveLength(0);
    expect(root.findAllByType(QuestionCard)).toHaveLength(1);
  });
  test('a failed archive read on the first launch ends its skeleton', async () => {
    jest.mocked(explore.pictures).mockRejectedValue(new Error('offline'));
    const { root } = await render(<DailyPair today={today} attempt={0} />);
    expect(
      root.findAll((node) => node.props.testID === 'today-archive-loading'),
    ).toHaveLength(0);
    expect(root.findAllByType(QuestionCard)).toHaveLength(1);
  });
});

describe('neutral daily featured selection', () => {
  test('the existing roster supplies several distinct political groups', () => {
    const selected = featuredPeople(edition, fixtureRoster, fixtureSlugs);
    expect(selected).toHaveLength(5);
    expect(selected[0]!.slug).toBe('richard-marles');
    expect(new Set(selected.map((person) => person.group)).size).toBe(5);
  });
  test('keeps the edition first; rotates deterministically with one member per group', () => {
    const sets = new Set<string>();
    for (let day = 0; day < 30; day++) {
      const next = { ...edition, date: addDays(today, day) };
      const selected = featuredPeople(next, roster, slugs);
      expect(selected[0]!.edition.title).toBe(next.title);
      expect(selected).toHaveLength(5);
      expect(new Set(selected.map((person) => person.group)).size).toBe(
        selected.length,
      );
      expect(new Set(selected.map((person) => person.slug)).size).toBe(
        selected.length,
      );
      expect(
        featuredPeople(
          next,
          { ...roster, people: [...roster.people].reverse() },
          slugs,
        ),
      ).toEqual(selected);
      sets.add(selected.map((person) => person.slug).join(','));
    }
    expect(sets.size).toBeGreaterThan(1);
    expect(
      ['Liberal', 'The Nationals', 'LNP', 'CLP'].map(featuredGroup),
    ).toEqual(Array(4).fill('coalition'));
  });
  test('only current federal members with verified profile slugs are added', () => {
    const restricted = {
      ...roster,
      people: roster.people.map((person, index) =>
        index === 0 ? person : { ...person, current: false },
      ),
    };
    expect(featuredPeople(edition, restricted, slugs)).toHaveLength(1);
    const stateOnly = {
      ...roster,
      people: roster.people.map((person, index) =>
        index === 0
          ? person
          : {
              ...person,
              representation: [
                {
                  jurisdiction: 'vic',
                  chamber: 'assembly',
                  electorate: 'Example',
                  state: 'VIC',
                },
              ],
            },
      ),
    };
    expect(featuredPeople(edition, stateOnly, slugs)).toHaveLength(1);
    expect(featuredPeople(edition, roster, { ...slugs, slugs: {} })).toEqual(
      [],
    );
    expect(featuredPeople({ ...edition, kind: 'bill' }, roster, slugs)).toEqual(
      [],
    );
  });
  test('roster cards cite the roster date and never invent missing speech counts', () => {
    const selected = Array.from({ length: 10 }, (_, day) =>
      featuredPeople({ ...edition, date: addDays(today, day) }, roster, slugs),
    ).flat();
    expect(
      selected.find((person) => person.slug === 'centre-member')!.edition
        .paragraphs,
    ).toEqual(['MP for Example, in Victoria.']);
    expect(
      selected.find((person) => person.slug === 'nation-member')!.edition
        .paragraphs[0],
    ).toBe('MP for Example, in Victoria.');
    for (const person of people.slice(1)) {
      expect(person.source).toMatchObject({
        asOf: '2026-11-09',
        citation: 'OPAX parliamentary roster',
        rule: FEATURED_PEOPLE_RULE,
      });
      expect(person.edition.machineWritten).toBeNull();
    }
    expect(people[0]!.source.citation).toBe('OPAX daily edition');
  });
});

describe('featured carousel', () => {
  test('a heading and one neutral line say what the cards are', async () => {
    const { root } = await render(<FeaturedPeopleCarousel people={people} />);
    const title = host(root, 'today-featured-title');
    expect(title.props.accessibilityRole).toBe('header');
    expect(JSON.stringify(title.props.children)).toContain(
      'Featured parliamentarians',
    );
    expect(FEATURED_HEADING).toBe('Featured parliamentarians');
    expect(FEATURED_CONTEXT).toBe(
      'Today’s featured member, then one from each party. It changes daily.',
    );
    expect(FEATURED_CONTEXT).not.toMatch(/top|most|best|leading|—/i);
    expect(
      JSON.stringify(host(root, 'today-featured-context').props.children),
    ).toContain(FEATURED_CONTEXT);
  });
  test('card 1 uses the shared hook, never repeats the name, and writes OPAX', () => {
    const first = people[0]!.edition.paragraphs[0]!;
    expect(first).not.toContain(`${people[0]!.edition.title}:`);
    expect(first).not.toMatch(/Opax/);
    expect(first).toMatch(/^(MP for|Senator)/);
    const bare = featuredPeople(
      {
        ...edition,
        paragraphs: [`${edition.title}: 414 speeches in the Opax record.`],
      },
      {
        ...roster,
        people: roster.people.map((person) =>
          person.name === edition.title
            ? { ...person, representation: [] }
            : person,
        ),
      },
      slugs,
    );
    expect(bare[0]!.edition.paragraphs[0]).toBe(
      '414 speeches in the OPAX record.',
    );
  });
  test('the VoiceOver label says Machine-written and skips empty parts', () => {
    const person = people[0]!;
    const machine = {
      ...person,
      edition: {
        ...person.edition,
        title: 'Fixture Member',
        machineWritten: { attribution: 'Fixture model' },
        facts: { ...person.edition.facts, line: null },
        paragraphs: ['A fixture paragraph.'],
      },
    };
    expect(featuredLabel(machine, 0, 3)).toBe(
      'Featured parliamentarian, 1 of 3. Fixture Member. Machine-written. A fixture paragraph.',
    );
  });
  test('snaps with a 16 pt peek, opens each person and exposes positions to VoiceOver', async () => {
    const { root } = await render(<FeaturedPeopleCarousel people={people} />);
    // Async: the edge fade it mounts reads Reduce Transparency.
    await act(async () => {
      host(root, 'today-featured').props.onLayout({
        nativeEvent: { layout: { width: 374 } },
      });
    });
    const pages = root.findByType(ScrollView);
    expect(pages.props).toMatchObject({
      horizontal: true,
      accessibilityRole: 'list',
      snapToInterval: 358,
      snapToAlignment: 'start',
      disableIntervalMomentum: true,
      decelerationRate: 'fast',
    });
    // 16 pt of bleed on each side, for the edge fades.
    expect(pages.props.contentContainerStyle).toEqual({
      gap: 12,
      paddingLeft: 16,
      paddingRight: 44,
    });
    const cards = root.findAllByType(Card);
    expect(cards).toHaveLength(people.length);
    cards.forEach((card, index) => {
      expect(card.props.href).toEqual(
        personRoute(people[index]!.slug, people[index]!.edition.title),
      );
      expect(card.props.accessibilityLabel).toContain(
        `${index + 1} of ${people.length}`,
      );
    });
    expect(root.findAllByType(Plate)).toHaveLength(people.length);
    act(() =>
      pages.props.onMomentumScrollEnd({
        nativeEvent: { contentOffset: { x: 358 } },
      }),
    );
    expect(
      host(root, 'today-featured-page-2').props.accessibilityState.selected,
    ).toBe(true);
    expect(
      host(root, 'today-featured-page-1').props.accessibilityState.selected,
    ).toBe(false);
  });
  test.each([false, true, null])(
    'page buttons respect reduced motion %s and resizing preserves the page',
    async (reduced) => {
      jest.mocked(useReduceMotionSetting).mockReturnValue(reduced);
      const scroll = jest
        .spyOn(ScrollView.prototype, 'scrollTo')
        .mockImplementation(() => {});
      const { UNSAFE_root: root } = renderNative(
        <FeaturedPeopleCarousel people={people} />,
      );
      act(() =>
        host(root, 'today-featured').props.onLayout({
          nativeEvent: { layout: { width: 374 } },
        }),
      );
      fireEvent.press(host(root, 'today-featured-page-2'));
      expect(scroll).toHaveBeenLastCalledWith({
        x: 358,
        animated: reduced === false,
      });
      act(() =>
        host(root, 'today-featured').props.onLayout({
          nativeEvent: { layout: { width: 600 } },
        }),
      );
      expect(scroll).toHaveBeenLastCalledWith({ x: 584, animated: false });
    },
  );
  test('AX5 cards grow naturally and a singleton has no misleading dots or peek', async () => {
    jest
      .mocked(useWindowDimensions)
      .mockReturnValue({ width: 320, height: 874, scale: 3, fontScale: 3.12 });
    const { root } = await render(
      <FeaturedPeopleCarousel people={people.slice(0, 1)} />,
    );
    act(() =>
      host(root, 'today-featured').props.onLayout({
        nativeEvent: { layout: { width: 292 } },
      }),
    );
    expect(root.findByType(ScrollView).props).toMatchObject({
      scrollEnabled: false,
      contentContainerStyle: { paddingRight: 0 },
    });
    expect(
      root.findAll((node) => node.props.testID === 'today-featured-dots'),
    ).toHaveLength(0);
    const card = root.findByType(Card);
    expect(StyleSheet.flatten(card.props.style).height).toBeUndefined();
    expect(
      card
        .findAllByType(Text)
        .every((node) => node.props.numberOfLines === undefined),
    ).toBe(true);
  });
  test('loads cached indices, refreshes them, and retains source dates and saved-copy notes', async () => {
    const savedAt = Date.parse('2026-11-09T01:00:00Z');
    jest
      .mocked(catalogs.roster)
      .mockResolvedValue({ data: roster, stale: true, savedAt } as never);
    const renderer = await render(
      <TodayEditionCard
        edition={{ ...block, stale: true, savedAt }}
        today={today}
      />,
    );
    expect(renderer.root.findAllByType(FeaturedPeopleCarousel)).toHaveLength(1);
    expect(catalogs.roster).toHaveBeenCalledWith(false);
    const sources = renderer.root.findAllByType(SourceLine);
    expect(sources[0]!.props.dateLabel).toBe('Saved 9 Nov 2026');
    expect(sources[1]!.props.dateLabel).toBe('Saved 9 Nov 2026');
    expect(sources[1]!.props.asOf).toBe('2026-11-09');
    await act(async () =>
      renderer.update(
        <TodayEditionCard edition={block} today={today} attempt={1} />,
      ),
    );
    expect(catalogs.roster).toHaveBeenLastCalledWith(true);
    expect(catalogs.slugs).toHaveBeenLastCalledWith(true);
  });
  test('the carousel is in the first frame: from the roster the page holds, or its heading and the card’s place while the read is out', async () => {
    jest.mocked(catalogs.roster).mockReturnValue(new Promise(() => {}));
    jest.mocked(catalogs.slugs).mockReturnValue(new Promise(() => {}));
    // The page's directory names the people at once.
    const held = await render(
      <TodayEditionCard
        edition={block}
        today={today}
        held={{
          roster: { data: roster, stale: false, savedAt: 1 } as never,
          slugs: { data: slugs, stale: false, savedAt: 1 } as never,
        }}
      />,
    );
    expect(held.root.findAllByType(FeaturedPeopleCarousel)).toHaveLength(1);
    // Nothing held: the heading and context are drawn over the edition's
    // card, at the first card's width, with the dots' row under it. The
    // heading was inserted above the card when the read answered.
    const { root } = await render(
      <TodayEditionCard edition={block} today={today} />,
    );
    expect(root.findAllByType(FeaturedPeopleCarousel)).toHaveLength(0);
    const frame = host(root, 'today-featured-pending');
    const ids = frame
      .findAll(
        (node) =>
          typeof node.type === 'string' &&
          ['today-featured-title', 'today-featured-context'].includes(
            node.props.testID,
          ),
      )
      .map((node) => node.props.testID);
    expect(new Set(ids)).toEqual(
      new Set(['today-featured-title', 'today-featured-context']),
    );
    const card = frame.findByType(EditionCard);
    const place = card.parent!;
    expect(StyleSheet.flatten(place.props.style)).toMatchObject({
      marginRight: 28,
    });
    const frameHost = frame.findAll(
      (node) => typeof node.type === 'string',
    )[0]!;
    const last = frameHost.children[frameHost.children.length - 1] as {
      props: { style: unknown };
    };
    expect(StyleSheet.flatten(last.props.style as never)).toMatchObject({
      height: 44,
    });
  });

  test('an unavailable roster retains the edition, and old or non-person editions do not start selection reads', async () => {
    jest.mocked(catalogs.roster).mockRejectedValue(new Error('offline'));
    const { root } = await render(
      <TodayEditionCard edition={block} today={today} />,
    );
    expect(root.findAllByType(EditionCard)).toHaveLength(1);
    // A failed read is not on its way: no carousel heading over one card.
    expect(
      root.findAll((node) => node.props.testID === 'today-featured-pending'),
    ).toHaveLength(0);
    jest.mocked(catalogs.roster).mockClear();
    const old = await render(
      <TodayEditionCard edition={block} today="2026-12-01" />,
    );
    expect(old.root.findAllByType(FeaturedPeopleCarousel)).toHaveLength(0);
    expect(catalogs.roster).not.toHaveBeenCalled();
    await render(
      <TodayEditionCard
        edition={{ ...block, data: { ...edition, kind: 'topic' } }}
        today={today}
      />,
    );
    expect(catalogs.roster).not.toHaveBeenCalled();
  });
});

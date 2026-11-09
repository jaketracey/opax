import { router } from 'expo-router';
import { RouteOptions } from '../src/navigation/preview';
import { withNavigationOptions } from './navigation-options';
import { sheetPayload } from '../src/navigation/sheets';
import { act } from 'react';
import { Text as NativeText, type View } from 'react-native';
import TestRenderer, { type ReactTestInstance } from 'react-test-renderer';
import { catalogs as runtime } from '../src/api/runtime';
import { decodeDiscovery } from '../src/api/catalogs';
import type { RecordResult } from '../src/api/client';
import {
  Card,
  Group,
  Heading,
  SourceSheet,
  Text as DesignText,
} from '../src/design/primitives';
import { accents } from '../src/design/tokens';
import { leadRoute } from '../src/navigation/routes/public-money';
import Leads from '../src/features/leads/Leads';
import LeadDetail from '../src/features/leads/LeadDetail';
import { LeadFeedCard } from '../src/features/leads/LeadFeedCard';
import { publicDiscovery } from '../src/features/money-public/discovery';
import {
  leadCardFigure,
  leadFigure,
  leadsFor,
  plainCaveat,
} from '../src/features/leads/model';
import { pinned } from './pinned';

// Design programme pass 5, P2-13, as the money spec (specs/money.md 2.9 and
// 2.10) redrew it: a lead's card is one link holding its title and one
// money-ink figure with a plain label; no summary, kicker, caveat line or
// "Evidence (n)" target. Caveats live on the lead's page under "How this
// lead was found", in plain words, with the method note and the example
// records; the card's title and sentence are not said again there.
jest.mock('../src/api/runtime', () => ({
  catalogs: { discovery: jest.fn() },
}));
jest.mock('../src/features/money-public/runtime', () => ({
  money: { agencies: jest.fn(async () => ({ data: { agencies: [] } })) },
}));
const mockParams: { id?: string } = {};
jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react');
  const router = { push: jest.fn(), navigate: jest.fn() };
  const Link = Object.assign(
    ({ href, children }: { href: unknown; children?: unknown }) =>
      React.createElement('ExpoLink', { href }, children),
    {
      Trigger: ({ children }: { children?: unknown }) => children,
      Preview: () => null,
      Menu: () => null,
      MenuAction: () => null,
    },
  );
  return {
    router,
    useRouter: () => router,
    useSegments: () => [],
    useLocalSearchParams: () => mockParams,
    Link,
    Stack: { Screen: () => null },
  };
});
const discovery = publicDiscovery(decodeDiscovery(pinned('/discovery.json')));
const leads = leadsFor(discovery);
beforeEach(() => {
  jest.mocked(router.push).mockReset();
  jest.mocked(runtime.discovery).mockResolvedValue({
    data: discovery,
    stale: false,
    savedAt: 1,
    asOf: null,
  } as RecordResult<typeof discovery>);
});
async function render(element: React.ReactElement) {
  let r!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    r = TestRenderer.create(element);
  });
  return r;
}
const texts = (root: ReactTestInstance) =>
  root
    .findAllByType(NativeText)
    .map((n) => [n.props.children].flat(3).join(''))
    .filter(Boolean);
const byID = (root: ReactTestInstance, testID: string) =>
  root.findAll((n) => typeof n.type === 'string' && n.props.testID === testID);
const pressables = (root: ReactTestInstance) =>
  root.findAll(
    (n) => typeof n.type !== 'string' && typeof n.props.onPress === 'function',
  );
const press = (root: ReactTestInstance, testID: string) =>
  act(async () =>
    root
      .find(
        (n) =>
          n.props.testID === testID && typeof n.props.onPress === 'function',
      )
      .props.onPress(),
  );

describe('a lead’s card', () => {
  test('the figure is one: the export’s first money figure', () => {
    for (const lead of leads) {
      const figure = leadFigure(lead)!;
      expect(figure).toBe(
        lead.metrics.find((m) => m.format === 'currency') ?? lead.metrics[0],
      );
    }
    expect(leadFigure({ metrics: [] })).toBeNull();
  });
  test.each(
    // One lead of each kind.
    [...new Map(leads.map((l) => [l.category, l])).values()].map((l) => [
      l.categoryLabel,
      l,
    ]),
  )(
    '%s: one link, its title and one money-ink figure, nothing else',
    async (_k, lead) => {
      const r = await render(<LeadFeedCard lead={lead} testID="card" />);
      const figure = leadCardFigure(lead)!;
      // One target: the whole card, a link to the lead.
      const card = r.root.findByType(Card);
      expect(card.props.href).toEqual(leadRoute(lead.id));
      expect(card.props.accessibilityRole).toBe('link');
      expect(card.props.accessibilityLabel).toBe(
        `${lead.title}. ${figure.spoken}, ${figure.label}.`,
      );
      expect(card.props.accessibilityHint).toBe('Opens the lead.');
      expect(
        pressables(r.root).filter((n) => n.props.testID !== 'card'),
      ).toHaveLength(0);
      expect(r.root.findAllByType(SourceSheet)).toHaveLength(0);
      // Title, one figure and its label.
      expect(byID(r.root, 'card-title')[0]!.props.children).toBe(lead.title);
      expect(byID(r.root, 'card-figure')).toHaveLength(1);
      expect(byID(r.root, 'card-figure-1')).toHaveLength(0);
      expect(texts(byID(r.root, 'card-figure')[0]!)).toEqual([
        figure.text,
        figure.label,
      ]);
      const [value] = byID(r.root, 'card-figure')[0]!.findAllByType(DesignText);
      expect(value!.props.variant).toBe('tileFigure');
      expect(value!.props.tone).toBe(accents.money.ink);
      // Nothing else: no kicker, summary, caveat or Evidence line.
      expect(texts(r.root)).toEqual([lead.title, figure.text, figure.label]);
      expect(byID(r.root, 'card-kind')).toHaveLength(0);
      expect(byID(r.root, 'card-caveat')).toHaveLength(0);
      expect(byID(r.root, 'card-source')).toHaveLength(0);
      await act(async () => r.unmount());
    },
  );
  test('in search results the card names its kind first', async () => {
    const lead = leads.find((l) => l.category === 'recipient_concentration')!;
    const r = await render(<LeadFeedCard lead={lead} kindMeta testID="card" />);
    expect(byID(r.root, 'card-kind')[0]!.props.children).toBe('Party funding');
    expect(r.root.findByType(Card).props.accessibilityLabel).toMatch(
      /^Party funding\. /,
    );
    await act(async () => r.unmount());
  });
  test('the feed’s cards carry no caveat lines; each section’s source sheet says how leads are read', async () => {
    const r = await render(<Leads />);
    const shown = texts(r.root);
    expect(shown.join('\n')).not.toMatch(
      /Matching names are not verified|This share describes available records only|Evidence \(|Caveats/,
    );
    await press(r.root, 'leads-source-recipient_concentration');
    const { params } = jest.mocked(router.push).mock.calls.at(-1)![0] as {
      params: { key: string };
    };
    expect(
      sheetPayload(params.key, 'source')?.details.notes?.length,
    ).toBeGreaterThan(0);
    await act(async () => r.unmount());
  });
});

describe('a lead’s page', () => {
  test('the route has a title before loading and after the subject arrives', async () => {
    let resolve!: (value: RecordResult<typeof discovery>) => void;
    jest.mocked(runtime.discovery).mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const lead = leads.find((l) => l.category === 'recipient_concentration')!;
    mockParams.id = lead.id;
    const r = await render(<LeadDetail />);
    const options = () => r.root.findByType(RouteOptions).props.options;
    expect(options().title).toBe('Lead');
    await act(async () =>
      resolve({ data: discovery, stale: false, savedAt: 1, asOf: null }),
    );
    expect(options().title).toBe('Lead');
    await act(async () => r.unmount());
  });

  test('a scrolled lead reveals Lead rather than its comparison heading', async () => {
    const lead = leads.find((l) => l.category === 'procurement_concentration')!;
    mockParams.id = lead.id;
    let options: Record<string, unknown> = {};
    const r = await render(
      withNavigationOptions(<LeadDetail />, (next) => {
        options = next;
      }),
    );
    const inline = () => (options.headerTitle as () => React.ReactElement)();
    const heading = r.root
      .findAllByType(Group)
      .flatMap((group) => [group.props.children].flat())
      .find(
        (child) => child?.props?.children?.props?.testID === 'lead-heading',
      );
    const pending: Parameters<View['measure']>[0][] = [];
    heading.props.ref.current.measure = (
      done: Parameters<View['measure']>[0],
    ) => {
      pending.push(done);
    };
    const answer = (request: number, pageY: number) =>
      act(async () => {
        await Promise.resolve();
        pending[request]!(0, 0, 300, 80, 0, pageY);
      });
    await act(async () =>
      heading.props.onLayout({
        nativeEvent: { layout: { y: 24, height: 80 } },
      }),
    );
    expect(pending).toHaveLength(0);
    expect(inline().props.shown).toBe(false);
    const screen = () => r.root.findByProps({ testID: 'lead-screen' });
    await act(async () => screen().props.onScroll(9000));
    await answer(0, 140);
    expect(inline().props.shown).toBe(false);
    await act(async () => screen().props.onScroll(-500));
    expect(inline().props.shown).toBe(false);
    await answer(1, -50);
    expect(inline().props).toMatchObject({
      title: 'Lead',
      shown: true,
      trailing: 1,
    });
    expect(texts(r.root)).toContain(lead.comparison.heading);
    await act(async () =>
      heading.props.onLayout({
        nativeEvent: { layout: { y: 24, height: 80 } },
      }),
    );
    expect(inline().props.shown).toBe(true);
    await answer(2, -60);
    expect(inline().props.shown).toBe(true);
    await act(async () => screen().props.onScroll(12000));
    await answer(3, 140);
    expect(inline().props.shown).toBe(false);
    await act(async () => r.unmount());
  });

  test('"How this lead was found": the method and every caveat in plain words, not the claim again', async () => {
    const lead = leads.find((l) => l.category === 'recipient_concentration')!;
    mockParams.id = lead.id;
    const r = await render(<LeadDetail />);
    const headings = r.root
      .findAllByType(Heading)
      .map((h) => [h.props.children].flat().join(''));
    expect(headings).toContain('How this lead was found');
    expect(headings).not.toContain('The lead and its caveats');
    expect(byID(r.root, 'lead-card')).toHaveLength(0);
    const shown = texts(r.root);
    // The feed card's title and the export's sentence are not restated, nor
    // the export's metric labels: the takeaway and the chart say them.
    expect(shown.filter((t) => t === lead.title)).toHaveLength(0);
    expect(shown.filter((t) => t === lead.summary)).toHaveLength(0);
    expect(shown.filter((t) => t === 'Lead · Party funding')).toHaveLength(1);
    for (const metric of lead.metrics)
      expect(shown).not.toContain(metric.label);
    // The method note, every caveat in plain words, and the example records.
    expect(byID(r.root, 'lead-note')[0]!.props.children).toBe(
      lead.comparison.note,
    );
    lead.caveats.forEach((caveat, i) =>
      expect(byID(r.root, `lead-caveat-${i}`)[0]!.props.children).toBe(
        plainCaveat(caveat),
      ),
    );
    expect(shown.join('\n')).not.toMatch(/donation_type|ingestion/);
    // "Example records", no count: the rows are the count.
    expect(shown).toContain('Example records');
    expect(shown.join('\n')).not.toMatch(/Example records \(/);
    lead.evidence.forEach((_e, i) =>
      expect(byID(r.root, `lead-evidence-${i}`)).toHaveLength(1),
    );
    await act(async () => r.unmount());
  });
});

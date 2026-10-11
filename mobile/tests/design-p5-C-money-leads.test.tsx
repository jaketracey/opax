import { act } from 'react';
import { Text as NativeText } from 'react-native';
import TestRenderer, { type ReactTestInstance } from 'react-test-renderer';
import { catalogs as runtime } from '../src/api/runtime';
import { decodeDiscovery } from '../src/api/catalogs';
import type { RecordResult } from '../src/api/client';
import { Heading, SourceSheet } from '../src/design/primitives';
import Leads from '../src/features/leads/Leads';
import LeadDetail from '../src/features/leads/LeadDetail';
import { LeadFeedCard } from '../src/features/leads/LeadFeedCard';
import {
  discoveryAsOf,
  evidenceLink,
  leadFigure,
  leadsFor,
} from '../src/features/leads/model';
import { pinned } from './pinned';

// Design programme pass 5, P2-13 (docs/design/review-2026-10/
// pass5-app-critique.md): a lead's card is its title, one figure, one
// sentence and "Evidence (n) ›"; its caveats are in the card's sheet and on
// the comparison, in full. The comparison's "How this lead was found" holds
// the method and the caveats, not the claim again.
jest.mock('../src/api/runtime', () => ({
  catalogs: { discovery: jest.fn() },
}));
const mockParams: { id?: string } = {};
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  router: { push: jest.fn() },
  Stack: { Screen: () => null },
}));
const discovery = decodeDiscovery(pinned('/discovery.json'));
const leads = leadsFor(discovery);
beforeEach(() => {
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
  test('"Evidence (n)" names the example records; with none it opens the caveats', () => {
    expect(evidenceLink(2)).toEqual({
      text: 'Evidence (2)',
      spoken: 'Evidence, 2 example records',
    });
    expect(evidenceLink(1).spoken).toBe('Evidence, 1 example record');
    expect(evidenceLink(0).text).toBe('Caveats');
  });
  test.each(
    // One lead of each kind.
    [...new Map(leads.map((l) => [l.category, l])).values()].map((l) => [
      l.categoryLabel,
      l,
    ]),
  )(
    '%s: one figure, one sentence, Evidence, and no caveat line',
    async (_k, lead) => {
      const r = await render(
        <LeadFeedCard
          lead={lead}
          asOf={discoveryAsOf(discovery)}
          testID="card"
        />,
      );
      expect(byID(r.root, 'card-figure')).toHaveLength(1);
      expect(byID(r.root, 'card-figure-1')).toHaveLength(0);
      expect(byID(r.root, 'card-caveat')).toHaveLength(0);
      const shown = texts(r.root);
      for (const caveat of lead.caveats) expect(shown).not.toContain(caveat);
      expect(shown).toContain(lead.summary);
      const n = lead.evidence.length;
      expect(shown).toContain(n ? `Evidence (${n})` : 'Caveats');
      const evidence = byID(r.root, 'card-source')[0]!;
      expect(evidence.props.accessibilityRole).toBe('button');
      expect(evidence.props.accessibilityLabel).toBe(evidenceLink(n).spoken);
      // The sheet holds every caveat, in the export's words, and the records.
      await press(r.root, 'card-source');
      const sheet = r.root.findByType(SourceSheet);
      expect(sheet.props.visible).toBe(true);
      expect(sheet.props.title).toBe('Evidence and caveats');
      for (const caveat of lead.caveats)
        expect(texts(r.root)).toContain(caveat);
      expect(sheet.props.originals.length).toBe(
        lead.evidence.filter((e) => e.url).length,
      );
      await act(async () => r.unmount());
    },
  );
  test('the feed’s cards carry no per-card caveat lines', async () => {
    const r = await render(<Leads />);
    const shown = texts(r.root);
    expect(shown.join('\n')).not.toMatch(
      /Matching names are not verified|This share describes available records only/,
    );
    // The page's About sheet still says how leads are read.
    await press(r.root, 'leads-source');
    expect(texts(r.root).length).toBeGreaterThan(shown.length);
    await act(async () => r.unmount());
  });
});

describe('a lead’s comparison', () => {
  test('"How this lead was found": the method and every caveat, not the claim again', async () => {
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
    // The feed card's title and sentence are not restated, nor any of the
    // export's figures: the takeaway and the chart say them at the top.
    expect(shown.filter((t) => t === lead.title)).toHaveLength(0);
    expect(shown.filter((t) => t === lead.summary)).toHaveLength(0);
    expect(shown.filter((t) => t === 'Lead · Party funding')).toHaveLength(1);
    for (const metric of lead.metrics)
      expect(shown).not.toContain(metric.label);
    // The method note, every caveat, and the example records.
    expect(byID(r.root, 'lead-note')[0]!.props.children).toBe(
      lead.comparison.note,
    );
    lead.caveats.forEach((caveat, i) =>
      expect(byID(r.root, `lead-caveat-${i}`)[0]!.props.children).toBe(caveat),
    );
    expect(shown).toContain(`Example records (${lead.evidence.length})`);
    lead.evidence.forEach((_e, i) =>
      expect(byID(r.root, `lead-evidence-${i}`)).toHaveLength(1),
    );
    await act(async () => r.unmount());
  });
});

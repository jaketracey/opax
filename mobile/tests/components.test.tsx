import { act, type ReactElement } from 'react';
import { Text as NativeText, View } from 'react-native';
import TestRenderer, { type ReactTestInstance } from 'react-test-renderer';
import {
  Button,
  ErrorState,
  Field,
  FilterChip,
  IconButton,
  KeyValueList,
  LeadCard,
  LoadingState,
  MoneyFigure,
  PartyLabel,
  PersonRow,
  Portrait,
  SegmentedControl,
  SourceLink,
  StatRow,
  Tag,
  Text,
  type Lead,
} from '../src/design/primitives';
import { partyColors } from '../src/design/palette';

function render(element: ReactElement) {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(element);
  });
  return renderer.root;
}
// Host views VoiceOver focuses: accessible elements with no accessible
// ancestor (an accessible container hides its children's elements).
const isElement = (node: ReactTestInstance) =>
  typeof node.type === 'string' &&
  (node.props.accessible === true || !!node.props.accessibilityRole);
const accessible = (root: ReactTestInstance) =>
  root.findAll((node) => {
    if (!isElement(node)) return false;
    for (let parent = node.parent; parent; parent = parent.parent)
      if (isElement(parent)) return false;
    return true;
  });
const byLabel = (root: ReactTestInstance, label: string) =>
  root.find(
    (node) =>
      typeof node.type === 'string' && node.props.accessibilityLabel === label,
  );
const texts = (root: ReactTestInstance) =>
  root
    .findAllByType(NativeText)
    .map((node) => node.props.children)
    .flat()
    .filter((child) => typeof child === 'string');

describe('Text', () => {
  test('scales with Dynamic Type, uncapped, with no line limit', () => {
    const root = render(<Text variant="metadata">Grayndler</Text>);
    const text = root.findByType(NativeText);
    expect(text.props.allowFontScaling).toBe(true);
    expect(text.props.maxFontSizeMultiplier).toBe(0);
    expect(text.props.dynamicTypeRamp).toBe('subheadline');
    expect(text.props.numberOfLines).toBeUndefined();
    expect(text.props.accessibilityLanguage).toBe('en-AU');
  });
  test('figures use tabular numerals', () => {
    const root = render(<Text variant="figure">$4,537,500</Text>);
    const style = [root.findByType(NativeText).props.style].flat(3);
    expect(style).toContainEqual({ fontVariant: ['tabular-nums'] });
  });
});

describe('Button', () => {
  test('exposes its role, name and state', () => {
    const root = render(
      <Button
        label="Search people"
        variant="primary"
        onPress={() => undefined}
      />,
    );
    const button = byLabel(root, 'Search people');
    expect(button.props.accessibilityRole).toBe('button');
    expect(button.props.accessibilityState).toEqual({
      disabled: false,
      busy: false,
    });
  });
  test('loading keeps the label and width, and reports busy', () => {
    const root = render(
      <Button label="Search people" loading onPress={() => undefined} />,
    );
    const button = byLabel(root, 'Search people');
    expect(button.props.accessibilityState).toEqual({
      disabled: true,
      busy: true,
    });
    expect(texts(root)).toContain('Search people');
  });
  test('disabled is announced', () => {
    const root = render(
      <Button label="Show more" disabled onPress={() => undefined} />,
    );
    expect(byLabel(root, 'Show more').props.accessibilityState.disabled).toBe(
      true,
    );
  });
  test('an icon button carries its required name', () => {
    const root = render(
      <IconButton
        symbol="square.and.arrow.up"
        accessibilityLabel="Share Anthony Albanese"
        onPress={() => undefined}
      />,
    );
    const button = byLabel(root, 'Share Anthony Albanese');
    expect(button.props.accessibilityRole).toBe('button');
  });
});

describe('tags, chips and segments', () => {
  test('a tag reads "Topic: Housing" and its hash is decorative', () => {
    const root = render(<Tag label="Housing" onPress={() => undefined} />);
    const tag = byLabel(root, 'Topic: Housing');
    expect(tag.props.accessibilityRole).toBe('link');
    expect(accessible(root)).toHaveLength(1);
  });
  test('a filter chip names the removal', () => {
    const root = render(
      <FilterChip
        filter="kind"
        value="Declared interests"
        onRemove={() => undefined}
      />,
    );
    expect(
      byLabel(root, 'Remove the kind filter, Declared interests').props
        .accessibilityRole,
    ).toBe('button');
  });
  test('segments report selection and position', () => {
    const root = render(
      <SegmentedControl
        value="recent"
        onChange={() => undefined}
        segments={[
          { value: 'before', label: 'Before parliament' },
          { value: 'recent', label: 'Recent' },
          { value: 'all', label: 'All' },
        ]}
      />,
    );
    const recent = byLabel(root, 'Recent');
    expect(recent.props.accessibilityState).toEqual({ selected: true });
    expect(recent.props.accessibilityValue).toEqual({ text: '2 of 3' });
    expect(byLabel(root, 'All').props.accessibilityState).toEqual({
      selected: false,
    });
  });
});

describe('Field', () => {
  test('label, required and error reach VoiceOver through the input', () => {
    const root = render(
      <Field
        label="Email address"
        required
        error="Enter the email address for your OPAX account."
        hint="Used only to sign in."
        testID="email"
      />,
    );
    const input = root.find(
      (node) => typeof node.type === 'string' && node.props.testID === 'email',
    );
    expect(input.props.accessibilityLabel).toBe('Email address, required');
    expect(input.props.accessibilityHint).toBe(
      'Error: Enter the email address for your OPAX account.. Used only to sign in.',
    );
    expect(texts(root)).toContain(
      'Enter the email address for your OPAX account.',
    );
  });
});

describe('people', () => {
  test('a party label is a dot plus a readable name, never colour alone', () => {
    const root = render(<PartyLabel party="Labor" current testID="party" />);
    const label = byLabel(root, 'Labor');
    expect(label.props.accessible).toBe(true);
    const dot = root.find(
      (node) =>
        typeof node.type === 'string' &&
        [node.props.style]
          .flat()
          .some((s) => s?.backgroundColor === partyColors.labor),
    );
    expect(dot.props.accessibilityElementsHidden).toBe(true);
    expect(texts(root)).toContain('Labor');
  });
  test('dense rows show the short label but read the full name', () => {
    const root = render(<PartyLabel party="Greens" current dense />);
    expect(texts(root)).toContain('GRN');
    expect(byLabel(root, 'Greens')).toBeTruthy();
  });
  test('an unrecorded party is said in words, with no dot', () => {
    const root = render(<PartyLabel party={null} current={false} />);
    expect(texts(root)).toContain('Party not recorded');
    expect(
      root.findAll(
        (node) =>
          typeof node.type === 'string' &&
          [node.props.style].flat().some((s) => s?.borderRadius === 5),
      ),
    ).toHaveLength(0);
  });
  test('a person row reads name, party and place as one element', () => {
    const root = render(
      <PersonRow
        name="Anthony Albanese"
        party="Labor"
        partyStatus="current"
        place="Member for Grayndler · NSW"
        onPress={() => undefined}
      />,
    );
    const row = byLabel(
      root,
      'Anthony Albanese, Labor, Member for Grayndler · NSW',
    );
    expect(row.props.accessibilityRole).toBe('button');
    expect(accessible(root)).toHaveLength(1);
  });
  test('a portrait is a blank circle hidden from VoiceOver, never initials', () => {
    const root = render(<Portrait size="profile" />);
    const view = root.findByType(View);
    expect(view.props.accessibilityElementsHidden).toBe(true);
    expect(root.findAllByType(NativeText)).toHaveLength(0);
  });
});

describe('record', () => {
  test('a source link says where it goes', () => {
    const root = render(
      <SourceLink
        citation="AusTender register"
        record="record CN3407266"
        url="https://www.tenders.gov.au/"
        kind="register"
      />,
    );
    const link = byLabel(root, 'AusTender register, record CN3407266');
    expect(link.props.accessibilityRole).toBe('link');
    expect(link.props.accessibilityHint).toBe('Opens the register');
    expect(texts(root)).toContain('AusTender register · record CN3407266');
  });
  test('money reads as words, value first', () => {
    const root = render(
      <MoneyFigure amount={4537500} label="Contract value" />,
    );
    expect(byLabel(root, '4,537,500 dollars, Contract value')).toBeTruthy();
    expect(texts(root)).toContain('$4,537,500');
  });
  test('stats and key-value rows are single elements', () => {
    const stats = render(
      <StatRow stats={[{ value: '2,929', label: 'recorded divisions' }]} />,
    );
    expect(byLabel(stats, '2,929, recorded divisions')).toBeTruthy();
    const list = render(
      <KeyValueList items={[{ label: 'Base salary', value: '$239,270' }]} />,
    );
    expect(byLabel(list, 'Base salary, $239,270')).toBeTruthy();
  });
});

describe('states', () => {
  test('loading is a busy progress element', () => {
    const root = render(<LoadingState label="Loading the public directory" />);
    const node = byLabel(root, 'Loading the public directory');
    expect(node.props.accessibilityRole).toBe('progressbar');
    expect(node.props.accessibilityState).toEqual({ busy: true });
  });
  test('an error is an alert followed by Try again', () => {
    const root = render(
      <ErrorState
        message="The public record could not be loaded. Try again."
        onRetry={() => undefined}
      />,
    );
    expect(
      byLabel(root, 'The public record could not be loaded. Try again.').props
        .accessibilityRole,
    ).toBe('alert');
    expect(byLabel(root, 'Try again').props.accessibilityRole).toBe('button');
  });
});

describe('LeadCard', () => {
  const lead: Lead = {
    id: 'example',
    title:
      'Westpac Banking Corporation appears in party receipts and contracts',
    metrics: [
      { label: 'Recorded party receipts', value: 76984493, format: 'currency' },
      { label: 'Contract records', value: 4, format: 'number' },
    ],
    evidence: [
      {
        amount: '$4,537,500',
        amountSpoken: '4,537,500 dollars',
        from: 'Australian Office of Financial Management',
        to: 'Westpac Banking Corporation',
        detail: 'Contract value · starts 6 Feb 2017',
        register: 'AusTender register',
        record: 'record CN3407266',
        url: 'https://www.tenders.gov.au/',
        kind: 'register',
      },
    ],
    caveats: [
      'Matching names are not verified legal identities; unrelated entities can share a name.',
      'Annual party receipts are not all verified gifts; source donation_type=direct is an ingestion classification. State, election and referendum disclosures are excluded.',
    ],
  };
  test('keeps every caveat verbatim, and reads title, metrics, caveats, then evidence', () => {
    const root = render(<LeadCard lead={lead} category="Companies in both" />);
    for (const caveat of lead.caveats) expect(texts(root)).toContain(caveat);
    // Document order of labelled elements and texts, as VoiceOver walks it.
    const order = root
      .findAll(
        (node) =>
          typeof node.type === 'string' &&
          (typeof node.props.accessibilityLabel === 'string' ||
            typeof node.props.children === 'string'),
      )
      .map((node) => node.props.accessibilityLabel ?? node.props.children);
    const at = (needle: string) =>
      order.findIndex((entry) => String(entry).includes(needle));
    expect(at('Recorded party receipts, 76,984,493 dollars')).toBeGreaterThan(
      -1,
    );
    expect(at('Contract records, 4')).toBeGreaterThan(
      at('Recorded party receipts'),
    );
    expect(at('Matching names')).toBeGreaterThan(at('Contract records'));
    expect(at('AusTender register')).toBeGreaterThan(
      at('Annual party receipts'),
    );
    // The example record is one link: amount, who paid whom, what and when,
    // then the register and its own ID.
    expect(
      byLabel(
        root,
        '4,537,500 dollars, Australian Office of Financial Management to Westpac Banking Corporation, Contract value · starts 6 Feb 2017, AusTender register, record CN3407266',
      ).props.accessibilityRole,
    ).toBe('link');
    expect(texts(root)).toContain('AusTender register · record CN3407266');
  });
});

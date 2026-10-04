import { useState, type ReactNode } from 'react';
import { Alert, Image, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import {
  AsAtLine,
  Button,
  Divider,
  EmptyState,
  ErrorState,
  FilterChip,
  Field,
  Figure,
  Group,
  Heading,
  IconButton,
  KeyValueList,
  LeadCard,
  LoadingState,
  MoneyFigure,
  OfflineBanner,
  OpaxWebLink,
  PartyLabel,
  PersonRow,
  Portrait,
  RowList,
  Screen,
  Section,
  SegmentedControl,
  SourceLink,
  StaleNotice,
  StatRow,
  SubSection,
  Tag,
  Text,
  stateCopy,
  useAccessibilitySize,
  type Lead,
} from '../design/primitives';
import {
  formatMoney,
  formatMoneyCompact,
  formatPercent,
} from '../design/format';
import {
  light,
  textStyles,
  type Role,
  type TextVariant,
} from '../design/tokens';
import { shareRecord } from '../navigation/share';
import { canonicalUrl } from '../navigation/external';
import { isE2E } from '../design/environment';
import { OpaxShare } from '../../modules/opax-share';

// Searched for by the release bundle scan: it must never appear in production.
export const WORKBENCH_MARKER = 'OPAX_DESIGN_WORKBENCH';

// Every value here is real public OPAX data: the pinned roster, the exports
// at 8f1305e3 quoted in docs/IOS-UX.md, /discovery.json (generated
// 21 September 2026) and the W12 example in docs/IOS-API-CONTRACT.md.
const westpac: Lead = {
  id: 'donor_contract_overlap:e730d27e99cf3064',
  title: 'Westpac Banking Corporation appears in party receipts and contracts',
  summary:
    'An exact supplier-name match connects a canonical donor in annual AEC party-receipt disclosures with government contract awards.',
  metrics: [
    { label: 'Recorded party receipts', value: 76984493, format: 'currency' },
    { label: 'Recorded contract value', value: 9102500, format: 'currency' },
    { label: 'Party receipt records', value: 1041, format: 'number' },
    { label: 'Contract records', value: 4, format: 'number' },
  ],
  evidence: [
    {
      label:
        'Westpac Banking Corporation → Australian Labor Party (ALP): $1,803.00 · FY 2024-25 · AEC annual receipt · local record 643745',
      url: 'https://transparency.aec.gov.au/',
      link_scope: 'source_register',
      record_id: '643745',
    },
    {
      label:
        'Australian Office of Financial Management → Westpac Banking Corporation: $4,537,500.00 · starts 2017-02-06 · austender · record CN3407266',
      url: 'https://www.tenders.gov.au/',
      link_scope: 'source_register',
      record_id: 'CN3407266',
    },
  ],
  caveats: [
    'Matching names are not verified legal identities; unrelated entities can share a name.',
    'The records can cover different years and jurisdictions. No sequence or causal link is inferred.',
    'Annual party receipts are not all verified gifts; source donation_type=direct is an ingestion classification. State, election and referendum disclosures are excluded.',
  ],
};

const roles = Object.keys(light) as Role[];
const variants = Object.keys(textStyles) as TextVariant[];
const notice = () =>
  Alert.alert(
    'Workbench',
    'In the app, this opens the profile in the current tab.',
  );

function Block({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <Section>
      <Heading level={2} testID={`wb-${id}`}>
        {title}
      </Heading>
      {children}
    </Section>
  );
}
function Anchor({ id, children }: { id: string; children: string }) {
  return (
    <Text variant="kicker" testID={`wb-${id}`}>
      {children}
    </Text>
  );
}

export default function Workbench() {
  const [status, setStatus] = useState<'before' | 'recent' | 'all'>('before');
  const [filters, setFilters] = useState([
    { filter: 'kind', value: 'Declared interests' },
    { filter: 'parliament', value: 'Victoria' },
  ]);
  const [loading, setLoading] = useState(false);
  const stacked = useAccessibilitySize();
  return (
    <Screen testID="workbench-screen">
      <Group gap={8}>
        <Text variant="lede" testID="wb-top">
          Every design-system component and state, for review and screenshots.
          Development and e2e builds only.
        </Text>
        <Text variant="fine" accessibilityElementsHidden>
          {WORKBENCH_MARKER}
        </Text>
      </Group>

      {isE2E ? (
        <Button
          label="Native share sheet (QA)"
          testID="wb-native-share"
          onPress={() => {
            if (!OpaxShare) {
              Alert.alert('Native share unavailable');
              return;
            }
            void OpaxShare.share({
              url: canonicalUrl('/subject/person/anthony-albanese'),
              title: 'Anthony Albanese',
            }).then(
              (completed) =>
                Alert.alert(
                  completed
                    ? 'Native share completed'
                    : 'Native share cancelled',
                ),
              () => Alert.alert('Native share failed'),
            );
          }}
        />
      ) : null}

      <Block id="mark" title="Mark and app icon">
        <View style={styles.markRow}>
          <Image
            source={require('../../assets/icon/icon.png')}
            style={styles.icon}
            accessibilityLabel="OPAX app icon: the Australia mark in gold on navy"
          />
          <Image
            source={require('../../assets/icon/icon-dark.png')}
            style={[styles.icon, styles.darkTile]}
            accessibilityLabel="OPAX app icon, dark appearance"
          />
        </View>
      </Block>

      <Block id="colour" title="Colour roles">
        <RowList>
          {roles.map((role) => (
            <View key={role} style={styles.swatchRow}>
              <View style={[styles.swatch, { backgroundColor: light[role] }]} />
              <View style={stacked ? styles.grow : styles.swatchText}>
                <Text variant="metadata" tone="ink" style={styles.grow}>
                  {role}
                </Text>
                <Text variant="metadata">{light[role]}</Text>
              </View>
            </View>
          ))}
        </RowList>
      </Block>

      <Block id="type" title="Type roles">
        {variants.map((variant) => (
          <View key={variant} style={styles.typeRow}>
            <Text variant="fine">{variant}</Text>
            <Text variant={variant}>
              {variant === 'figure' || variant === 'figureInline'
                ? formatMoney(622102)
                : variant === 'countdown'
                  ? '7:42'
                  : 'Anthony Albanese, Member for Grayndler'}
            </Text>
          </View>
        ))}
      </Block>

      <Block id="buttons" title="Buttons">
        <Group>
          <Button
            label="Search people"
            variant="primary"
            onPress={() => undefined}
          />
          <Button label="Show more" onPress={() => undefined} />
          <Button label="Clear" variant="quiet" onPress={() => undefined} />
          <Button
            label="Delete account"
            variant="danger"
            onPress={() => undefined}
          />
          <Button
            label="Searching the directory"
            variant="primary"
            loading={loading}
            testID="wb-button-loading"
            onPress={() => {
              setLoading(true);
              setTimeout(() => setLoading(false), 2500);
            }}
          />
          <Button
            label="Search people"
            variant="primary"
            loading
            onPress={() => undefined}
          />
          <Button
            label="Search people"
            variant="primary"
            disabled
            onPress={() => undefined}
          />
          <Button label="Show more" disabled onPress={() => undefined} />
          <Button label="Compact" size="compact" onPress={() => undefined} />
          <Button
            label="Large"
            size="large"
            variant="primary"
            onPress={() => undefined}
          />
          <Button
            label="Share"
            icon="square.and.arrow.up"
            onPress={() => undefined}
          />
          <Button
            label="Full width"
            variant="primary"
            fullWidth
            onPress={() => undefined}
          />
        </Group>
        <Anchor id="icon-buttons">Icon buttons</Anchor>
        <View style={styles.inline}>
          <IconButton
            symbol="square.and.arrow.up"
            accessibilityLabel="Share Anthony Albanese"
            onPress={() => undefined}
          />
          <IconButton
            symbol="line.3.horizontal.decrease"
            accessibilityLabel="Filters"
            variant="default"
            onPress={() => undefined}
          />
        </View>
      </Block>

      <Block id="tags" title="Tags and filter chips">
        <View style={styles.wrap}>
          <Tag label="Housing" onPress={() => undefined} />
          <Tag label="Climate" />
          <Tag label="Gambling" />
        </View>
        <Anchor id="chips">Applied filters</Anchor>
        <View style={styles.wrap}>
          {filters.map((item) => (
            <FilterChip
              key={item.filter}
              filter={item.filter}
              value={item.value}
              onRemove={() =>
                setFilters((all) => all.filter((f) => f.filter !== item.filter))
              }
            />
          ))}
          {filters.length < 2 ? (
            <Button
              label="Reset filters"
              variant="quiet"
              size="compact"
              onPress={() =>
                setFilters([
                  { filter: 'kind', value: 'Declared interests' },
                  { filter: 'parliament', value: 'Victoria' },
                ])
              }
            />
          ) : null}
        </View>
      </Block>

      <Block id="segmented" title="Segmented control">
        <SegmentedControl
          testID="wb-segmented-control"
          value={status}
          onChange={setStatus}
          segments={[
            { value: 'before', label: 'Before parliament' },
            { value: 'recent', label: 'Recent' },
            { value: 'all', label: 'All' },
          ]}
        />
      </Block>

      <Block id="dividers" title="Dividers">
        <Text variant="metadata">Default, between major sections</Text>
        <Divider />
        <Text variant="metadata">Subtle, between rows and subheadings</Text>
        <Divider variant="subtle" />
        <Text variant="metadata">Accent, intentional emphasis only</Text>
        <Divider variant="accent" />
      </Block>

      <Block id="fields" title="Fields">
        <Field
          label="Find your MP"
          placeholder="Electorate or member's name"
          hint="Your choice is saved on this iPhone only."
        />
        <Field label="Email address" required keyboardType="email-address" />
        <Field
          label="Email address"
          required
          defaultValue="not an address"
          error="Enter the email address for your OPAX account."
        />
      </Block>

      <Block id="party" title="Party labels">
        <Group gap={8}>
          {[
            'Labor',
            'Liberal',
            'Nationals',
            'LNP',
            'Greens',
            'One Nation',
            'Independent',
            "Katter's Australian Party",
            null,
          ].map((party) => (
            <PartyLabel key={party ?? 'none'} party={party} current />
          ))}
        </Group>
        <Anchor id="party-context">Former and changed parties</Anchor>
        <Group gap={8}>
          <PartyLabel party="Labor" current={false} />
          <PartyLabel party="One Nation" current formerly="Nationals" />
        </Group>
        <Anchor id="party-dense">Dense rows</Anchor>
        <View style={styles.wrap}>
          {['Labor', 'Liberal', 'Greens', 'Independent'].map((party) => (
            <PartyLabel key={party} party={party} current dense />
          ))}
        </View>
      </Block>

      <Block id="people" title="People rows">
        <RowList>
          <PersonRow
            name="Anthony Albanese"
            party="Labor"
            partyCurrent
            place="Member for Grayndler · NSW"
            onPress={notice}
          />
          <PersonRow
            name="Barnaby Joyce"
            party="One Nation"
            partyCurrent
            formerly="Nationals"
            place="Member for New England · NSW"
            onPress={notice}
          />
          <PersonRow
            name="Julia Gillard"
            party="Labor"
            partyCurrent={false}
            detail="Recorded representation: Lalor · VIC"
            onPress={notice}
          />
          <PersonRow
            name="Susan McDonald"
            party="LNP"
            partyCurrent
            place="Senator for Queensland"
            detail="Sponsored travel or hospitality, added 2 Sep 2026"
            onPress={notice}
          />
          <PersonRow
            name="Zali Steggall"
            party="Independent"
            partyCurrent
            place="Member for Warringah · NSW"
            onPress={notice}
          />
          <PersonRow
            name="Larissa Waters"
            party="Greens"
            partyCurrent
            place="Senator for Queensland"
          />
        </RowList>
        <Anchor id="portraits">Portraits</Anchor>
        <View style={styles.inline}>
          <Portrait />
          <Portrait size="profile" />
        </View>
      </Block>

      <Block id="record" title="As-at lines and sources">
        <Group gap={12}>
          <AsAtLine
            asOf="2026-09-17"
            citation={['Remuneration Tribunal', 'Parliamentary Handbook']}
          />
          <AsAtLine asOf="2026-09-29" citation="ParlInfo bill records" />
          <AsAtLine
            asOf="2026-09-04"
            citation="Registers of interests"
            savedAt="2026-10-03"
          />
          <AsAtLine
            votes={{
              content_changed_at: '2026-10-03T03:41:07Z',
              latest_division_date: '2026-09-25',
              latest_division_date_by_jurisdiction: { federal: '2026-09-25' },
              schema: 1,
            }}
            jurisdiction="federal"
            citation="They Vote For You"
            licence="ODbL"
          />
          <AsAtLine votes={null} citation="They Vote For You" licence="ODbL" />
        </Group>
        <Anchor id="sources">Source links</Anchor>
        <SourceLink
          citation="They Vote For You"
          record="division, 19 Aug 2026"
          url="https://theyvoteforyou.org.au/divisions/senate/2026-08-19/6"
          kind="record"
        />
        <SourceLink
          citation="AusTender register"
          record="record CN3407266"
          url="https://www.tenders.gov.au/"
          kind="register"
        />
        <OpaxWebLink
          label="Speeches, topics and mentions"
          path="/subject/person/anthony-albanese"
        />
      </Block>

      <Block id="figures" title="Figures">
        <StatRow
          stats={[
            { value: '2,929', label: 'recorded divisions' },
            { value: '1,251', label: 'ayes' },
            { value: '1,678', label: 'noes' },
          ]}
        />
        <Anchor id="money">Money</Anchor>
        <View style={styles.wrap}>
          <MoneyFigure amount={4537500} label="Contract value · 6 Feb 2017" />
          <MoneyFigure
            amount={76984493}
            compact
            label="Recorded party receipts"
          />
          <MoneyFigure
            amount={9102500}
            compact
            size="inline"
            label="Recorded contract value"
          />
          <Figure value={(1251 / 2929) * 100} format="percent" label="ayes" />
        </View>
        <Text variant="fine">
          Compact forms: {formatMoneyCompact(76984493)},{' '}
          {formatMoneyCompact(4537500)}, {formatMoneyCompact(1803)}. Share:{' '}
          {formatPercent((1251 / 2929) * 100)}.
        </Text>
      </Block>

      <Block id="sections" title="Sections and lists">
        <KeyValueList
          items={[
            {
              label: 'Prime Minister, a year',
              value: formatMoney(622102),
              accessibilityLabel: 'Prime Minister, 622,102 dollars a year',
            },
            { label: 'Base salary', value: formatMoney(239270) },
            { label: 'Loading', value: '160%' },
          ]}
        />
        <AsAtLine
          asOf="2026-09-17"
          citation={['Remuneration Tribunal', 'Parliamentary Handbook']}
        />
        <SubSection title="Voted for">
          <Text>
            Income Tax Rates Amendment (Tax Reform No. 1) Bill 2026 · 2026
          </Text>
        </SubSection>
      </Block>

      <Block id="states" title="States">
        <Anchor id="loading">Loading</Anchor>
        <LoadingState shape="people" count={2} label="Loading people" />
        <LoadingState shape="figures" count={2} label="Loading figures" />
        <LoadingState shape="text" count={3} label="Loading text" />
        <Anchor id="empty">Empty</Anchor>
        <EmptyState message="None of their recorded divisions was a vote on a bill itself." />
        <Anchor id="error">Error</Anchor>
        <ErrorState
          message={stateCopy.genericError}
          onRetry={() => undefined}
        />
        <Anchor id="offline">Offline and stale</Anchor>
        <OfflineBanner />
        <OfflineBanner cached={false} />
        <StaleNotice savedAt="2026-10-03" />
        <StaleNotice savedAt="2026-10-03" refreshing />
      </Block>

      <Block id="lead" title="Lead card">
        <LeadCard
          lead={westpac}
          category="Companies in both"
          asAt={{ asOf: '2026-09-21', citation: 'OPAX discovery export' }}
        />
      </Block>

      <Block id="chrome" title="Navigation chrome">
        <Group>
          <Button
            label="Share a profile"
            icon="square.and.arrow.up"
            testID="wb-share"
            onPress={() =>
              shareRecord({
                path: '/subject/person/anthony-albanese',
                title: 'Anthony Albanese',
              })
            }
          />
          <Button
            label="Open the Talk sheet"
            onPress={() => router.push('/talk')}
          />
        </Group>
      </Block>
      <Text variant="fine" testID="wb-end">
        End of workbench
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  markRow: { flexDirection: 'row', gap: 16, flexWrap: 'wrap' },
  icon: { width: 120, height: 120, borderRadius: 26 },
  darkTile: { backgroundColor: '#000000' },
  swatchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  swatch: {
    width: 28,
    height: 28,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: light.line,
  },
  grow: { flex: 1 },
  swatchText: { flex: 1, flexDirection: 'row', gap: 12 },
  typeRow: { gap: 2 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
  },
});

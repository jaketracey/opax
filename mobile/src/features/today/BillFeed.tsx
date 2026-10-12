import { router } from 'expo-router';
import type { recentBillsFor } from '../../api/selectors';
import { billSentenceCase } from '../../api/bill-transforms';
import { formatDate } from '../../design/format';
import { partyText, type PartyContext } from '../../design/party';
import { BillRow, RowList } from '../../design/primitives';
import { billRoute } from '../../navigation/routes';
import { partyFromCode } from '../bills/party-codes';
import { shortDay } from './parts';

type Bill = NonNullable<ReturnType<typeof recentBillsFor>['data']>[number];

// The party codes a bill record can carry where it names no party ("JLN",
// "NATS"), read as the party's name, so a row never shows a bare code. A
// name passes through as recorded; the label's dot comes from design/party.
/** "JLN" as "Jacqui Lambie Network"; a recorded name as written. */
export const sponsorPartyName = (party: string | null | undefined) =>
  partyFromCode(party);

/** What a bill row says, visibly and to VoiceOver (one element). */
export function billRowText(bill: Bill) {
  const status = billSentenceCase(bill.status) || 'Status not recorded';
  // The portfolio names who brought a government bill; otherwise the sponsor
  // and their party, as a dot and the party's name.
  const partyName = bill.portfolio
    ? null
    : sponsorPartyName(bill.sponsor_party);
  const party: PartyContext | null = partyName
    ? { party: partyName, status: 'unknown' }
    : null;
  return {
    status,
    by: bill.portfolio ?? bill.sponsor ?? null,
    party,
    introduced: bill.introduced
      ? `${bill.introducedLabel} ${shortDay(bill.introduced)}`
      : null,
    label: [
      bill.title,
      status,
      bill.introduced
        ? `${bill.introducedLabel} ${formatDate(bill.introduced)}`
        : null,
      bill.portfolio ? `${bill.portfolio} portfolio` : bill.sponsor,
      party ? partyText(party).spoken : null,
    ]
      .filter(Boolean)
      .join(', '),
  };
}

/**
 * Recently introduced bills as rows on the paper, between hairlines: the
 * shared bill row (its status and date on one line, the title in the
 * record's serif, who brought it), each opening its bill.
 */
export function BillFeed({ bills }: { bills: readonly Bill[] }) {
  return (
    <RowList>
      {bills.map((bill, i) => {
        const text = billRowText(bill);
        return (
          <BillRow
            key={bill.key}
            title={bill.title}
            status={text.status}
            date={text.introduced}
            by={text.by}
            party={text.party}
            onPress={() => router.push(billRoute(bill.key))}
            accessibilityLabel={text.label}
            testID={`today-bill-${i}`}
            dragPath={`/bill/${bill.key}`}
          />
        );
      })}
    </RowList>
  );
}

import {
  editionInSlot,
  invitationPlace,
  launchCase,
  todayColumns,
  todayOrder,
  type InvitationDates,
  type LaunchCase,
} from '../src/features/today/order';
import { addDays, sydneyDay } from '../src/features/today/rules';

const today = '2026-11-08';
const none: InvitationDates = { hiddenUntil: null, welcomeDeclinedAt: null };
const order = (
  kase: LaunchCase,
  seat: boolean,
  invitation: InvitationDates = none,
  day = today,
) =>
  todayOrder({ seat, invitation, launchCase: kase, today: day }).slots.filter(
    (slot) => slot !== 'vic-election',
  );

describe('launchCase', () => {
  test('a saved edition fresh today is case A, 0 to 3 days old', () => {
    expect(launchCase({ date: '2026-11-08' }, today)).toBe('A');
    expect(launchCase({ date: '2026-11-07' }, today)).toBe('A');
    expect(launchCase({ date: '2026-11-05' }, today)).toBe('A');
  });
  test('a recent or old saved edition, or a saved 404, is case B', () => {
    expect(launchCase({ date: '2026-11-04' }, today)).toBe('B');
    expect(launchCase({ date: '2026-11-01' }, today)).toBe('B');
    expect(launchCase({ date: '2026-10-04' }, today)).toBe('B');
    expect(launchCase('missing', today)).toBe('B');
  });
  test('nothing saved is case C', () => {
    expect(launchCase(null, today)).toBe('C');
  });
  test('the same saved edition changes case when the Sydney date rolls over', () => {
    const saved = { date: '2026-11-05' };
    expect(launchCase(saved, '2026-11-08')).toBe('A');
    expect(launchCase(saved, '2026-11-09')).toBe('B');
  });
});

describe('todayOrder', () => {
  const tail = ['votes', 'declarations'];
  test('case A with a seat: Your MP, then the edition', () => {
    expect(order('A', true)).toEqual([
      'your-mp',
      'edition',
      'following',
      'bills',
      ...tail,
      'more',
      'ask',
      'foot',
    ]);
    expect(
      todayOrder({ seat: true, invitation: none, launchCase: 'A', today })
        .pairInMore,
    ).toBe(true);
  });
  test('case A without a seat: the edition, then the invitation', () => {
    expect(order('A', false).slice(0, 3)).toEqual([
      'edition',
      'invitation',
      'following',
    ]);
  });
  test('case B: the lead block, then the daily pair; a late edition slot', () => {
    expect(order('B', true)).toEqual([
      'your-mp',
      'pair',
      'following',
      'bills',
      ...tail,
      'edition-late',
      'more',
      'ask',
      'foot',
    ]);
    expect(order('B', false).slice(0, 2)).toEqual(['invitation', 'pair']);
    expect(
      todayOrder({ seat: false, invitation: none, launchCase: 'B', today })
        .pairInMore,
    ).toBe(false);
  });
  test('case C: the lead block, the edition skeleton, then the pair', () => {
    expect(order('C', true).slice(0, 3)).toEqual([
      'your-mp',
      'edition',
      'pair',
    ]);
    expect(order('C', false).slice(0, 3)).toEqual([
      'invitation',
      'edition',
      'pair',
    ]);
    expect(order('C', false)).toContain('edition-late');
  });
  test('a hidden invitation takes no slot and the next block moves up', () => {
    const hidden = { ...none, hiddenUntil: addDays(today, 12) };
    expect(order('B', false, hidden).slice(0, 2)).toEqual([
      'pair',
      'following',
    ]);
    expect(order('A', false, hidden).slice(0, 2)).toEqual([
      'edition',
      'following',
    ]);
    expect(order('B', false, hidden)).not.toContain('invitation');
  });
  test('a welcome "Not now" moves the invitation after Bills', () => {
    const moved = { ...none, welcomeDeclinedAt: today };
    const slots = order('B', false, moved);
    expect(slots[0]).toBe('pair');
    expect(slots.indexOf('invitation')).toBe(slots.indexOf('bills') + 1);
    expect(order('A', false, moved)[0]).toBe('edition');
  });
  test('hidden and moved together: hidden wins', () => {
    const both = {
      hiddenUntil: addDays(today, 30),
      welcomeDeclinedAt: today,
    };
    expect(order('B', false, both)).not.toContain('invitation');
  });
  test('day 7 after the welcome "Not now" still moved; day 8 back in its slot', () => {
    const declined = '2026-11-01';
    const dates = { ...none, welcomeDeclinedAt: declined };
    expect(invitationPlace(dates, addDays(declined, 7))).toBe('after-bills');
    expect(invitationPlace(dates, addDays(declined, 8))).toBe('lead');
    expect(order('B', false, dates, addDays(declined, 8))[0]).toBe(
      'invitation',
    );
  });
  test('the 30-day hide ends on its day', () => {
    const dates = { ...none, hiddenUntil: '2026-12-08' };
    expect(invitationPlace(dates, '2026-12-07')).toBe('hidden');
    expect(invitationPlace(dates, '2026-12-08')).toBe('lead');
  });
  test('a seat ignores the invitation stores', () => {
    const both = { hiddenUntil: '2026-12-08', welcomeDeclinedAt: today };
    expect(order('B', true, both)).not.toContain('invitation');
    expect(order('B', true, both)[0]).toBe('your-mp');
  });
  test('the date rollover re-runs the order from disk', () => {
    const saved = { date: '2026-11-05' };
    const before = todayOrder({
      seat: false,
      invitation: none,
      launchCase: launchCase(saved, '2026-11-08'),
      today: '2026-11-08',
    });
    const after = todayOrder({
      seat: false,
      invitation: none,
      launchCase: launchCase(saved, '2026-11-09'),
      today: '2026-11-09',
    });
    expect(before.slots[0]).toBe('edition');
    expect(after.slots.slice(0, 3)).toEqual([
      'invitation',
      'vic-election',
      'pair',
    ]);
  });
});

describe('editionInSlot', () => {
  test('case A keeps the edition at the top for the session', () => {
    expect(editionInSlot('edition', 'A', 'fresh')).toBe(true);
    expect(editionInSlot('edition', 'A', 'recent')).toBe(true);
    expect(editionInSlot('edition-late', 'A', 'recent')).toBe(false);
  });
  test('case C: the top slot draws only a fresh answer, else a recent one goes late', () => {
    expect(editionInSlot('edition', 'C', 'fresh')).toBe(true);
    expect(editionInSlot('edition', 'C', 'recent')).toBe(false);
    expect(editionInSlot('edition-late', 'C', 'recent')).toBe(true);
    expect(editionInSlot('edition-late', 'C', 'fresh')).toBe(false);
  });
  test('case B: a recent edition, or a fresh one that arrived, draws late', () => {
    expect(editionInSlot('edition-late', 'B', 'recent')).toBe(true);
    expect(editionInSlot('edition-late', 'B', 'fresh')).toBe(true);
  });
  test('old, missing or failed never draws on Today', () => {
    for (const kase of ['A', 'B', 'C'] as const)
      for (const slot of ['edition', 'edition-late'] as const) {
        expect(editionInSlot(slot, kase, 'old')).toBe(false);
        expect(editionInSlot(slot, kase, null)).toBe(false);
      }
  });
});

describe('todayColumns (iPad)', () => {
  test('the lead block heads the trailing column; the pair under it in B', () => {
    const columns = todayColumns(
      todayOrder({ seat: true, invitation: none, launchCase: 'B', today }),
    );
    expect(columns.trailing.slice(0, 3)).toEqual([
      'your-mp',
      'vic-election',
      'pair',
    ]);
    expect(columns.leading).toEqual([
      'bills',
      'votes',
      'declarations',
      'edition-late',
    ]);
  });
  test('case A: the edition leads the leading column', () => {
    const columns = todayColumns(
      todayOrder({ seat: false, invitation: none, launchCase: 'A', today }),
    );
    expect(columns.leading[0]).toBe('edition');
    expect(columns.trailing[0]).toBe('invitation');
  });
  test('after a welcome "Not now" the invitation sits under Following', () => {
    const columns = todayColumns(
      todayOrder({
        seat: false,
        invitation: { ...none, welcomeDeclinedAt: today },
        launchCase: 'B',
        today,
      }),
    );
    expect(columns.trailing.indexOf('invitation')).toBe(
      columns.trailing.indexOf('following') + 1,
    );
  });
});

test('sydneyDay reads Sydney’s calendar, not the device zone', () => {
  // 13:30 UTC on 7 November is 00:30 on 8 November in Sydney (AEDT).
  expect(sydneyDay(Date.UTC(2026, 10, 7, 13, 30))).toBe('2026-11-08');
  expect(sydneyDay(Date.UTC(2026, 10, 7, 12, 30))).toBe('2026-11-07');
});

for (const launchCase of ['A', 'B', 'C'] as const) {
  for (const seat of [true, false])
    test(`election is second in ${launchCase}, seat ${seat}`, () => {
      const result = todayOrder({ seat, invitation: none, launchCase, today });
      expect(result.slots[1]).toBe('vic-election');
      expect(todayColumns(result).trailing).toContain('vic-election');
    });
}

test('the iPad election block follows the leading pair when the invitation is hidden', () => {
  const result = todayOrder({
    seat: false,
    invitation: { ...none, hiddenUntil: '2026-12-01' },
    launchCase: 'B',
    today,
  });
  expect(todayColumns(result).trailing.slice(0, 2)).toEqual([
    'pair',
    'vic-election',
  ]);
});

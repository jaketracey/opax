import type { NativeStackHeaderItem } from 'expo-router';
import type { SFSymbol } from '../../design/icon';
import { chrome } from '../../design/tokens';
import type { TranscriptTurn, VoiceSource, VoiceStatus } from '../../voice';

/** Reporting is offered once OPAX has answered with words. */
export const canReport = (transcript: readonly TranscriptTurn[]) =>
  transcript.some((turn) => turn.role === 'agent' && turn.text.trim() !== '');

/**
 * The menu's title: time left in this call, or the account's allowance. Whole
 * minutes, so the menu changes once a minute rather than every second.
 */
export function timeLeft(
  live: boolean,
  remaining: number,
  status: VoiceStatus | null,
): string | undefined {
  if (live)
    return remaining >= 60
      ? `${minutesLeft(remaining)} left in this call`
      : 'Under a minute left in this call';
  if (!status) return undefined;
  if (status.unlimited) return 'Unlimited minutes';
  return `${minutesLeft(status.remainingSeconds)} left`;
}
/** Whole minutes, never rounded up: "9 min", or seconds under a minute. */
export function minutesLeft(seconds: number) {
  if (seconds >= 60) return `${Math.floor(seconds / 60)} min`;
  return seconds > 0 ? `${seconds} sec` : 'No minutes';
}

const symbol = (name: SFSymbol) => ({ type: 'sfSymbol' as const, name });

/**
 * Talk's "…" menu: everything that is not the call itself. Reporting names
 * a record path or none, never caption words: one record (or none) reports
 * at once, several are a submenu of their titles (reportChoices).
 */
export function talkMenu({
  title,
  live,
  active,
  typing,
  report,
  records,
  consent,
  onType,
  onReport,
  onPrivacy,
  onWithdraw,
}: {
  title?: string;
  live: boolean;
  active: boolean;
  typing: boolean;
  report: boolean;
  records: readonly VoiceSource[];
  consent: boolean;
  onType: () => void;
  onReport: (recordPath: string | null) => void;
  onPrivacy: () => void;
  onWithdraw: () => void;
}): NativeStackHeaderItem {
  const items: Extract<
    NativeStackHeaderItem,
    { type: 'menu' }
  >['menu']['items'] = [];
  if (live && !typing)
    items.push({
      type: 'action',
      label: 'Type a message',
      icon: symbol('keyboard'),
      onPress: onType,
    });
  if (report && records.length > 1)
    items.push({
      type: 'submenu',
      label: 'Report this answer',
      icon: symbol('flag'),
      items: records.map((record) => ({
        type: 'action' as const,
        label: record.title,
        onPress: () => onReport(record.path),
      })),
    });
  else if (report)
    items.push({
      type: 'action',
      label: 'Report this answer',
      icon: symbol('flag'),
      onPress: () => onReport(records[0]?.path ?? null),
    });
  // A web page during a call would leave it; privacy is linked before one.
  if (!active)
    items.push({
      type: 'action',
      label: 'Voice privacy',
      icon: symbol('hand.raised'),
      onPress: onPrivacy,
    });
  if (consent)
    items.push({
      type: 'action',
      label: 'Withdraw voice consent',
      icon: symbol('xmark.circle'),
      destructive: true,
      onPress: onWithdraw,
    });
  return {
    type: 'menu',
    label: 'More',
    accessibilityLabel: 'More options',
    icon: symbol('ellipsis'),
    tintColor: chrome.tint,
    menu: { title, items },
  };
}

import type { NativeStackHeaderItem } from 'expo-router';
import type { SFSymbol } from '../../design/icon';
import { chrome } from '../../design/tokens';
import type { TranscriptTurn, VoiceStatus } from '../../voice';

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
 * Talk's "…" menu: everything that is not the call itself. Each action is
 * passed in; the report action receives no caption words (reportAnswer.ts).
 */
export function talkMenu({
  title,
  live,
  active,
  typing,
  report,
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
  consent: boolean;
  onType: () => void;
  onReport: () => void;
  onPrivacy: () => void;
  onWithdraw: () => void;
}): NativeStackHeaderItem {
  const items = [];
  if (live && !typing)
    items.push({
      type: 'action' as const,
      label: 'Type a message',
      icon: symbol('keyboard'),
      onPress: onType,
    });
  if (report)
    items.push({
      type: 'action' as const,
      label: 'Report this answer',
      icon: symbol('flag'),
      onPress: () => onReport(),
    });
  // A web page during a call would leave it; privacy is linked before one.
  if (!active)
    items.push({
      type: 'action' as const,
      label: 'Voice privacy',
      icon: symbol('hand.raised'),
      onPress: onPrivacy,
    });
  if (consent)
    items.push({
      type: 'action' as const,
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

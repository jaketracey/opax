import type { NativeStackHeaderItem } from 'expo-router';
import type { SFSymbol } from '../../design/icon';
import { currentChromeColours } from '../../design/tokens';
import type { TranscriptTurn, VoiceSource, VoiceStatus } from '../../voice';
import { talkCopy, voiceTime } from './model';

/** Reporting is offered once OPAX has answered with words. */
export const canReport = (transcript: readonly TranscriptTurn[]) =>
  transcript.some((turn) => turn.role === 'agent' && turn.text.trim() !== '');

/**
 * The menu's title: time left in this call, or the account's allowance.
 * A new title rebuilds the native menu and closes it if open, so during a
 * call it changes rarely: once at five minutes, then each minute after.
 */
export function timeLeft(
  live: boolean,
  remaining: number,
  status: VoiceStatus | null,
): string | undefined {
  if (live)
    return remaining > 300
      ? 'Over 5 min left in this call'
      : remaining >= 60
        ? `${minutesLeft(remaining)} left in this call`
        : 'Under a minute left in this call';
  if (!status) return undefined;
  return voiceTime(status);
}
/** Whole minutes, never rounded up: "9 min", or seconds under a minute. */
export function minutesLeft(seconds: number) {
  if (seconds >= 60) return `${Math.floor(seconds / 60)} min`;
  return seconds > 0 ? `${seconds} sec` : 'No minutes';
}

const symbol = (name: SFSymbol) => ({ type: 'sfSymbol' as const, name });

/**
 * Talk's ⋯ menu (specs/account.md 7.6): everything that is not the call
 * itself. Captions show or hide here once there are any to show. Reporting
 * names a record path or none, never caption words: one record (or none)
 * reports at once, several are a submenu of their titles (reportChoices).
 */
export function talkMenu({
  title,
  active,
  captions,
  canCaption,
  report,
  records,
  consent,
  onCaptions,
  onReport,
  onPrivacy,
  onWithdraw,
}: {
  title?: string;
  active: boolean;
  /** Captions are showing. */
  captions: boolean;
  /** There is a call or a transcript to caption. */
  canCaption: boolean;
  report: boolean;
  records: readonly VoiceSource[];
  consent: boolean;
  onCaptions: (on: boolean) => void;
  onReport: (recordPath: string | null) => void;
  onPrivacy: () => void;
  onWithdraw: () => void;
}): NativeStackHeaderItem {
  const items: Extract<
    NativeStackHeaderItem,
    { type: 'menu' }
  >['menu']['items'] = [];
  if (canCaption)
    items.push({
      type: 'action',
      label: captions ? talkCopy.menu.hideCaptions : talkCopy.menu.showCaptions,
      icon: symbol(captions ? 'captions.bubble' : 'captions.bubble.fill'),
      onPress: () => onCaptions(!captions),
    });
  if (report && records.length > 1)
    items.push({
      type: 'submenu',
      label: talkCopy.menu.report,
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
      label: talkCopy.menu.report,
      icon: symbol('flag'),
      onPress: () => onReport(records[0]?.path ?? null),
    });
  // A web page during a call would leave it; privacy is linked before one.
  if (!active)
    items.push({
      type: 'action',
      label: talkCopy.menu.voicePrivacy,
      icon: symbol('hand.raised'),
      onPress: onPrivacy,
    });
  if (consent)
    items.push({
      type: 'action',
      label: talkCopy.menu.withdraw,
      icon: symbol('xmark.circle'),
      destructive: true,
      onPress: onWithdraw,
    });
  return {
    type: 'menu',
    label: talkCopy.menu.more,
    accessibilityLabel: 'More options',
    icon: symbol('ellipsis.circle'),
    tintColor: currentChromeColours().tint,
    menu: { title, items },
  };
}

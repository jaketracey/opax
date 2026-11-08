import { createElement, type ComponentType, type ReactNode } from 'react';
import { Redirect } from 'expo-router';
import { ContentUnavailable, Screen } from '../../design/primitives';

// Production with the voice switch off: no Talk button is drawn anywhere, so
// only a stray link lands here (specs/account.md 9).
export default function TalkUnavailable() {
  return createElement(
    Screen as ComponentType<{ testID: string; children?: ReactNode }>,
    { testID: 'talk-sheet' },
    createElement(ContentUnavailable, {
      symbol: 'waveform',
      title: 'Talk isn’t available in this version',
      testID: 'talk-sheet-message',
    }),
  );
}
const toTalk = () => createElement(Redirect, { href: '/talk' });
export const ConsentSheet = toTalk;
export const TalkSourcesScreen = toTalk;
export const TalkRecordScreen = toTalk;

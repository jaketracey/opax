import { Platform } from 'react-native';
import { AndroidReadingHeader } from '../AndroidReadingHeader';
import { voiceLinked } from '../../voice/linked';
import { screenInStack } from './screen';
const screen = screenInStack('Account');
import { closeSheetItem, headerItems } from '../chrome';
export function accountScreens() {
  const hidden = Platform.OS === 'android' && !voiceLinked;
  const options =
    Platform.OS === 'android' ? { header: AndroidReadingHeader } : {};
  return [
    screen(
      'index',
      'Account',
      headerItems(() => [closeSheetItem()]),
    ),
    screen('consent', 'Voice consent', options, hidden),
    screen('sign-in', 'Sign in', options, hidden),
    screen('sign-in/code', 'Check your email', options, hidden),
    screen('delete', 'Delete account', options, hidden),
    screen('delete/code', 'Deletion code', options, hidden),
  ];
}

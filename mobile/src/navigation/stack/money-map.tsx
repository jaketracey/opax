import { screen } from './screen';

export function moneyMapScreens() {
  return [
    screen('money', 'Money map'),
    screen('money-node', 'Money record', { headerShown: false }),
  ];
}

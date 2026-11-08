import { screen } from './screen';

// The money map draws its own bar items (Filters and the ⋯ menu), so the
// stack only names it for the back button.
export function moneyMapScreens() {
  return [
    screen('money', 'Money map'),
    screen('money-node', 'Money record', { headerShown: false }),
  ];
}

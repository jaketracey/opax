import { screen } from './screen';

export function publicMoneyScreens() {
  return [
    screen('public-money', 'Public money'),
    screen('leads', 'Leads'),
    screen('lead/[id]', 'Lead'),
    screen('discover', 'Leads'),
    screen('grants', 'Grants'),
    screen('grant-program', 'Program'),
    screen('largest-grants', 'Largest grants'),
    screen('agencies', 'Agencies'),
    screen('agency', 'Agency'),
    screen('connections', 'Programs and places'),
    screen('grants-allocation', 'Community funding'),
    screen('money-record', 'Money record'),
    screen('money-item', 'Money record'),
    screen('money-donors', 'Donors'),
    screen('funding-by-seat-type', 'Funding by seat type'),
    screen('agency-list', 'Agency records'),
    screen('connection', 'Program or place'),
  ];
}

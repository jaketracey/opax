import {
  AUTHORISATION_LINE,
  CORRECTION_CONTACT,
} from '../src/design/authorisation';

// Fixture copied from origin/main:portal/wrangler.jsonc, lines 77 and 78.
const fixture = {
  AUTHORISATION_LINE:
    'Authorised by Jake Tracey, Noice Pty Ltd, Level 6, 608/343 Little Collins Street, Melbourne VIC 3000.',
  CORRECTION_CONTACT: 'mailto:corrections@opax.com.au',
};

test('electoral authorisation and corrections contact stay verbatim', () => {
  expect(AUTHORISATION_LINE).toBe(fixture.AUTHORISATION_LINE);
  expect(CORRECTION_CONTACT).toBe(fixture.CORRECTION_CONTACT);
});

// One sample of every email OPAX sends, and of the digest the layout supports,
// with invented people and records. The email tests read these, and
// render-emails.mjs writes them out to be looked at. Nothing here sends mail.
import {signInEmail, replyEmail, deletionEmail} from '../src/community-email.ts';
import {emailLayout} from '../src/email-layout.ts';

export const ORIGIN = 'https://opax.example';
const signInLink = `${ORIGIN}/community?view=signin#token=${'t'.repeat(43)}`;
const unsubscribeUrl = `${ORIGIN}/api/community/email/unsubscribe?token=${'u'.repeat(43)}`;

/** A digest as the newsletter would build it: a heading, sourced items, an unsubscribe. */
export const digestSpec = {
  origin: ORIGIN,
  subject: 'This week in Parliament',
  preheader: 'Three records from the sitting week, each with its source.',
  title: 'This week in Parliament',
  blocks: [
    {kind: 'text', text: 'Three records from the sitting week of 9 November 2026.'},
    {kind: 'items', heading: 'Bills', items: [
      {title: 'Invented Measures Bill 2026', href: `${ORIGIN}/bills/au-federal-r0001`, summary: 'Introduced in the House of Representatives and read a first time.', source: 'Parliament of Australia', sourceHref: 'https://source.example/bills/r0001', date: '10 Nov 2026'},
      {title: 'Invented Amendment (Review & Reporting) Bill 2026', href: `${ORIGIN}/bills/au-federal-r0002`, source: 'Parliament of Australia', date: '11 Nov 2026'},
    ]},
    {kind: 'items', heading: 'Votes', items: [
      {title: 'Division on the second reading', href: `${ORIGIN}/doc/invented-division`, summary: 'Ayes 80, noes 60.', source: 'Hansard', sourceHref: 'https://source.example/hansard/1', date: '12 Nov 2026'},
    ]},
  ],
  action: {href: `${ORIGIN}/`, label: 'Open OPAX'},
  reason: 'You’re receiving this because you subscribed to the OPAX weekly digest.',
  links: [{href: `${ORIGIN}/newsletter/unsubscribe?token=${'n'.repeat(43)}`, label: 'Unsubscribe from the digest'}],
};

/** The arguments each sample is built from, so another build of the emails can be run on the same ones. */
export function sampleArgs() {
  return {
    signIn: [signInLink],
    signInAppCode: [signInLink, '12345678'],
    reply: [{origin: ORIGIN, author: 'Invented Reader', title: 'What does the record show on housing?', body: 'The second reading speech is on the record.\nHere is where I found it.', threadId: 'housing', replyId: 'reply-1', unsubscribeUrl}],
    deletion: [ORIGIN, '87654321'],
  };
}

/** Every email, by a file-safe name. `hrefs` is every link the email may carry. */
export function emailSamples() {
  const replyLink = `${ORIGIN}/community?view=thread&id=housing&reply=reply-1#reply-reply-1`;
  const settings = `${ORIGIN}/community?view=settings#email-notifications`;
  const args = sampleArgs();
  const footer = [ORIGIN, `${ORIGIN}/community?view=privacy`];
  return [
    {name: 'sign-in', sent: true, mail: signInEmail(...args.signIn), title: 'Sign in to the community', button: 'Sign in to Opax', hrefs: [signInLink, ...footer]},
    {name: 'sign-in-app-code', sent: true, mail: signInEmail(...args.signInAppCode), title: 'Sign in to the community', button: 'Sign in to Opax', hrefs: [signInLink, ...footer]},
    {name: 'reply', sent: true, mail: replyEmail(...args.reply), title: 'You have a new reply', button: 'Read the reply', hrefs: [replyLink, settings, unsubscribeUrl, ...footer]},
    {name: 'account-deletion', sent: true, mail: deletionEmail(...args.deletion), title: 'Confirm your account deletion', button: null, hrefs: footer},
    {name: 'digest-example', sent: false, mail: emailLayout(digestSpec), title: 'This week in Parliament', button: 'Open OPAX', hrefs: [...digestSpec.blocks.flatMap((b) => (b.items ?? []).flatMap((i) => [i.href, ...(i.sourceHref ? [i.sourceHref] : [])])), digestSpec.action.href, ...digestSpec.links.map((l) => l.href), ...footer]},
  ];
}

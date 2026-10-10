# Native Community (build 7, K2–K8)

Community is opened from Account or Today. It has its own member search and
member routes; it never merges community profiles into record search or resolves
community IDs through the parliamentary people catalog.

Every read is an explicitly opened, focused route or a submitted search. There
is no launch read, polling, notification refresh, list-row read or prefetch.
Reads coalesce in session memory and back navigation retains the loaded screen.
Refresh is explicit: pull down, or Cmd-R on iPad. Writes make one attempt and do
not automatically read back; a new discussion, list or conversation offers an
explicit Open action. Search is the app's one search field and submits from the
keyboard's Search key (Return on a hardware keyboard) only. Typing never
navigates or requests data; submitting an unchanged trimmed query is ignored.

Signed out, the home shows Latest only, and one Sign in prompt stands for the
member pages (Members, Messages, Activity, Reading lists, Profile, Privacy).
A discussion, member or reading list is titled once, by its level 1 heading.
Report on a reply or a received message is a quiet flag beside its byline. Community avatars use the shared blank Portrait, with no lookup of
parliamentary identities or images.

The native `communityRequest` bridge uses the existing Keychain credential and
exact method/path/query rules. JavaScript supplies no origin, headers or token.
The public catalog client's GET method refuses Community requests. A 401 drops
the native credential and refuses local signed-in actions until sign-in. Session
changes clear cached private data, ownership, guidelines consent, blocks and
unfinished drafts. Unfocused screens never reload following an account change.

The first reply, discussion or direct message in a session opens the full web
guidelines and the no-tolerance community terms before it can be sent. Reporting
has separate post/reply, message and public-profile contracts. Blocking removes
the member from retained feed, reply, inbox, profile, activity and list views;
the privacy screen still permits managing the blocked list. Support is one tap
from every Community screen. Moderation stays on the web. No push is added.

## Worker dependency

Profile reports require `web/community`, commit
`983c675cfb60768f12573c3176810eab3220fa5b`, before a production release. This
branch adds `POST /api/community/members/:id/report` and exposes those reports
in the web moderator queue. It is committed locally and has not been deployed.
The rest of the routes mirror the existing Worker. The app never claims that a
failed report was delivered.

## Fixture gates

Journeys 50 and 51 use synthetic community accounts, members and content through
the local fixture. The AX5 support flow captures each new screen without running
the numbered journeys a second time. All private evidence and the before/after
index live in `mobile/private/qa/community/`, which is ignored by git.

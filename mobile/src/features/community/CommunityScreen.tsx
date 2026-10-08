import { useCallback, useRef, useState } from 'react';
import { AccessibilityInfo, Alert, Keyboard, type View } from 'react-native';
import {
  Stack,
  router,
  useLocalSearchParams,
  useFocusEffect,
  type Href,
} from 'expo-router';
import {
  Button,
  Composer,
  EmptyState,
  ErrorState,
  Field,
  Group,
  Heading,
  KeyValueList,
  LinkRow,
  LoadingState,
  RowList,
  KeyboardStableScreen,
  Section,
  SegmentedControl,
  StepButtons,
  Text,
} from '../../design/primitives';
import { openSource, canonicalUrl } from '../../navigation/external';
import { fromWebPath } from '../../navigation/routes';
import { shareRecord } from '../../navigation/share';
import { webOrigin } from '../../design/environment';
import { useAccount } from '../account/store';
import {
  communityRoute,
  communitySharePath,
  views,
  type CommunityView,
} from './routes';
import { count, flag, guidelines, object, rows, text, type Row } from './model';
import {
  agreeGuidelines,
  blockLocally,
  communityRead,
  communityRequest,
  hasAgreed,
  invalidateCommunity,
  isBlocked,
  useCommunityRevision,
  ownsList,
  communityGeneration,
  communitySessionRefused,
} from './session';

const titles: Record<CommunityView, string> = {
  home: 'Community',
  thread: 'Discussion',
  'new-thread': 'Start a discussion',
  members: 'Members',
  member: 'Member profile',
  messages: 'Messages',
  conversation: 'Conversation',
  activity: 'Activity',
  settings: 'Privacy & messages',
  profile: 'Your public profile',
  lists: 'Reading lists',
  list: 'Reading list',
  guidelines: 'Community guidelines',
  report: 'Report a concern',
};
const api = '/api/community/';
const go = (view: CommunityView, params: Record<string, string> = {}) =>
  router.push(communityRoute(view, params) as Href);
function record(path: string) {
  try {
    const checked = canonicalUrl(path);
    const native = fromWebPath(path);
    if (native) router.push(native as Href);
    else void openSource(checked, 'OPAX record');
  } catch {
    Alert.alert('OPAX link', 'This link could not be opened.');
  }
}
function safePath(value: string) {
  if (!value.trim()) return '';
  const url = new URL(value, webOrigin);
  if (url.origin !== webOrigin) throw new Error('Use an OPAX link.');
  const path = url.pathname + url.search + url.hash;
  canonicalUrl(path);
  return path;
}
function dateLine(row: Row) {
  const n =
    count(row, 'created_at') ||
    count(row, 'joined_at') ||
    count(row, 'updated_at');
  return n
    ? new Date(n * 1000).toLocaleDateString('en-AU', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : '';
}
function usePage(path: string | null, onLoaded: (d: Row) => void) {
  const opened = useRef<string | null>(null);
  const [loadedPath, setLoadedPath] = useState<string | null>(null);
  const [loadedGeneration, setLoadedGeneration] = useState(
    communityGeneration(),
  );
  const [data, setData] = useState<Row | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const reload = async (refresh = false) => {
    if (!path) return;
    setBusy(true);
    setError('');
    try {
      const mine = communityGeneration();
      const result = await communityRead(path, refresh);
      if (mine === communityGeneration()) {
        setData(result);
        setLoadedPath(path);
        onLoaded(result);
        setLoadedGeneration(mine);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'This page is unavailable.');
    } finally {
      setBusy(false);
    }
  };
  useFocusEffect(
    useCallback(() => {
      let live = true,
        settled = false;
      if (opened.current === path) return;
      opened.current = path;
      const mine = communityGeneration();
      if (path) {
        void communityRead(path)
          .then(
            (d) => {
              if (live && mine === communityGeneration()) {
                setData(d);
                setLoadedPath(path);
                onLoaded(d);
                setLoadedGeneration(mine);
              }
            },
            (e) => {
              if (live)
                setError(
                  e instanceof Error ? e.message : 'This page is unavailable.',
                );
            },
          )
          .finally(() => {
            settled = true;
            if (live) setBusy(false);
          });
      }
      return () => {
        live = false;
        if (!settled && opened.current === path) opened.current = null;
      };
    }, [path, onLoaded]),
  );
  const changed = loadedGeneration !== communityGeneration();
  return {
    data: changed || loadedPath !== path ? null : data,
    error: changed ? 'Your Community session changed. Open it again.' : error,
    busy,
    reload,
  };
}
function ThreadRows({ items }: { items: Row[] }) {
  return (
    <RowList>
      {items
        .filter((t) => !isBlocked(text(t, 'member_id')))
        .map((t) => (
          <LinkRow
            key={text(t, 'id')}
            title={text(t, 'title')}
            detail={`${text(t, 'display_name')} · ${count(t, 'replies')} replies · ${dateLine(t)}`}
            testID={`community-thread-${text(t, 'id')}`}
            onPress={() => go('thread', { id: text(t, 'id') })}
          />
        ))}
    </RowList>
  );
}
function SearchBox({
  label,
  onSearch,
  initial = '',
}: {
  label: string;
  onSearch: (q: string) => void;
  initial?: string;
}) {
  const [q, setQ] = useState(initial);
  return (
    <Group>
      <Field
        label={label}
        value={q}
        onChangeText={setQ}
        maxLength={120}
        returnKeyType="search"
        onSubmitEditing={() => {
          Keyboard.dismiss();
          onSearch(q.trim());
        }}
        testID="community-search"
      />
      <Button
        label="Search"
        onPress={() => {
          Keyboard.dismiss();
          onSearch(q.trim());
        }}
        testID="community-search-submit"
      />
    </Group>
  );
}
export function CommunityScreen() {
  useCommunityRevision();
  return <CommunityPage key={communityGeneration()} />;
}
function CommunityPage() {
  const composerSurface = useRef<View>(null);
  const params = useLocalSearchParams<Record<string, string>>();
  const raw = typeof params.view === 'string' ? params.view : 'home';
  const view = views.includes(raw as CommunityView)
    ? (raw as CommunityView)
    : 'home';
  const id =
    typeof params.id === 'string' && /^[\w-]{1,64}$/.test(params.id)
      ? params.id
      : '';
  const to =
    typeof params.to === 'string' && /^[\w-]{1,64}$/.test(params.to)
      ? params.to
      : '';
  const page = /^\d{1,3}$/.test(params.page ?? '') ? Number(params.page) : 0;
  const feed = ['all', 'following', 'saved'].includes(params.feed ?? '')
    ? params.feed
    : 'all';
  const q = (params.q ?? '').slice(0, 120),
    before = params.before;
  const account = useAccount();
  const signedIn =
    account.status?.signedIn === true && !communitySessionRefused();
  useCommunityRevision();
  const restricted =
    [
      'new-thread',
      'members',
      'messages',
      'conversation',
      'activity',
      'settings',
      'profile',
      'lists',
      'report',
    ].includes(view) ||
    (view === 'home' && feed !== 'all');
  let path: string | null = null;
  if (!restricted || signedIn) {
    if (view === 'home')
      path = `${api}threads?${new URLSearchParams({ feed: feed!, q, page: String(page) })}`;
    if (['thread', 'member', 'list'].includes(view) && id)
      path =
        api +
        { thread: 'threads', member: 'members', list: 'lists' }[
          view as 'thread' | 'member' | 'list'
        ] +
        `/${id}`;
    if (view === 'members')
      path = `${api}members?${new URLSearchParams({ q, following: params.following === 'true' ? 'true' : 'false', page: String(page) })}`;
    if (view === 'messages') path = `${api}conversations?page=${page}`;
    if (view === 'conversation' && id)
      path = `${api}conversations/${id}${before ? `?before=${before}` : ''}`;
    if (view === 'activity')
      path = `${api}notifications${before ? `?before=${before}` : ''}`;
    if (view === 'settings') path = api + 'preferences';
    if (view === 'profile') path = api + 'status';
    if (view === 'lists') path = api + 'lists';
  }
  const [draft, setDraft] = useState(''),
    [title, setTitle] = useState(''),
    [link, setLink] = useState(''),
    [description, setDescription] = useState('');
  const [publicList, setPublicList] = useState(false),
    [policy, setPolicy] = useState('everyone'),
    [emails, setEmails] = useState(false);
  const onLoaded = useCallback(
    (data: Row) => {
      if (view === 'settings') {
        setPolicy(text(data, 'message_policy'));
        setEmails(flag(data.reply_email_notifications));
      }
      if (view === 'profile' && data.member) {
        const m = object(data.member);
        setTitle(text(m, 'name') === 'Community member' ? '' : text(m, 'name'));
        setDescription(text(m, 'bio'));
      }
      if (view === 'list' && data.list) {
        const l = object(data.list);
        setTitle(text(l, 'title'));
        setDescription(text(l, 'description'));
        setPublicList(flag(l.public));
      }
    },
    [view],
  );
  const { data, error, busy, reload } = usePage(path, onLoaded);
  const [created, setCreated] = useState<{
    view: CommunityView;
    id: string;
    title: string;
  } | null>(null);
  const [working, setWorking] = useState(false),
    [notice, setNotice] = useState(''),
    [failure, setFailure] = useState('');
  const requireSignIn = () => {
    if (signedIn) return true;
    router.push('/account/sign-in' as Href);
    return false;
  };
  const mutate = async (
    route: string,
    method: string,
    body?: Record<string, unknown>,
    after?: (d: Row) => void,
  ) => {
    if (!requireSignIn() || working) return;
    setWorking(true);
    setFailure('');
    try {
      const d = await communityRequest(api + route, method, body);
      invalidateCommunity();
      setNotice('Saved.');
      after?.(d);
      AccessibilityInfo.announceForAccessibility('Saved.');
    } catch (e) {
      setFailure(
        e instanceof Error ? e.message : 'This action could not be completed.',
      );
    } finally {
      setWorking(false);
    }
  };
  const report = (target: string, kind = 'content') => {
    if (requireSignIn()) go('report', { id: target, kind });
  };
  const [blockedRows, setBlockedRows] = useState<Row[] | null>(null);
  const [conversationDraftID, setConversationDraftID] = useState(
    () =>
      `ios-${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`,
  );
  const post = () => {
    Keyboard.dismiss();
    if (!requireSignIn()) return;
    if (!hasAgreed()) {
      go('guidelines');
      return;
    }
    if (view === 'new-thread') {
      if (title.trim().length < 5 || draft.trim().length < 10) {
        setFailure(
          'Add a title of at least 5 characters and an opening note of at least 10 characters.',
        );
        return;
      }
      let source_path = '';
      try {
        source_path = safePath(link);
      } catch (e) {
        setFailure((e as Error).message);
        return;
      }
      void mutate(
        'threads',
        'POST',
        { title: title.trim(), body: draft.trim(), source_path },
        (d) => {
          setDraft('');
          setNotice('Discussion posted.');
          setCreated({
            view: 'thread',
            id: text(d, 'id'),
            title: 'Open posted discussion',
          });
        },
      );
    } else if (view === 'thread') {
      if (draft.trim().length < 2) {
        setFailure('Write a reply of at least 2 characters.');
        return;
      }
      void mutate(`threads/${id}`, 'POST', { body: draft.trim() }, () => {
        setDraft('');
        setNotice('Reply posted. Use Refresh to read it.');
      });
    } else if (view === 'conversation') {
      void mutate(
        id ? `conversations/${id}/messages` : 'conversations',
        'POST',
        {
          body: draft.trim(),
          client_id: conversationDraftID,
          ...(!id ? { recipient_id: to } : {}),
        },
        (d) => {
          setDraft('');
          setConversationDraftID(
            `ios-${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`,
          );
          if (!id)
            setCreated({
              view: 'conversation',
              id: text(d, 'id'),
              title: 'Open conversation',
            });
          else setNotice('Message sent. Use Refresh to read it.');
        },
      );
    }
  };
  const pagination = (more: boolean, kind: CommunityView) => (
    <StepButtons
      previous={{
        label: 'Previous',
        accessibilityLabel: 'Previous community page',
        disabled: page === 0,
        onPress: () => go(kind, { ...params, page: String(page - 1) }),
      }}
      next={{
        label: 'Next',
        accessibilityLabel: 'Next community page',
        disabled: !more,
        onPress: () => go(kind, { ...params, page: String(page + 1) }),
      }}
    />
  );
  const share = (kind: CommunityView, title: string, recordID?: string) =>
    void shareRecord({ path: communitySharePath(kind, recordID), title });
  let content;
  if (restricted && !signedIn)
    content = (
      <Section rule={false}>
        <Text>Sign in to connect with other readers.</Text>
        <LinkRow
          title="Sign in"
          testID="community-sign-in"
          onPress={() => router.push('/account/sign-in' as Href)}
        />
      </Section>
    );
  else if (view === 'guidelines')
    content = (
      <>
        <Section rule={false}>
          <Heading level={1}>
            Follow the evidence. Make room for each other.
          </Heading>
          <Text>This community helps people understand the public record.</Text>
        </Section>
        {guidelines.map(([heading, body]) => (
          <Section key={heading} title={heading}>
            <Text>{body}</Text>
          </Section>
        ))}
        <Section title="Community terms">
          <Text>
            There is no tolerance for objectionable content or abusive users. By
            posting, you agree to these guidelines and to moderators removing
            content that breaks them.
          </Text>
          <Button
            label={hasAgreed() ? 'Agreed' : 'Agree and continue'}
            variant="primary"
            testID="community-agree"
            disabled={hasAgreed()}
            onPress={() => {
              if (requireSignIn()) {
                agreeGuidelines();
                router.back();
              }
            }}
          />
        </Section>
      </>
    );
  else if (view === 'report')
    content = (
      <Section rule={false}>
        <Text>What should a moderator review?</Text>
        {params.kind === 'message' ? (
          <Text variant="metadata">
            Reporting a message shares only that message with moderators.
          </Text>
        ) : null}
        <Field
          label="Reason"
          value={draft}
          onChangeText={setDraft}
          multiline
          maxLength={500}
          testID="community-report-reason"
        />
        <Button
          label="Send report"
          variant="primary"
          loading={working}
          disabled={draft.trim().length < 5}
          testID="community-report-submit"
          onPress={() =>
            void mutate(
              params.kind === 'message'
                ? `messages/${id}/report`
                : params.kind === 'profile'
                  ? `members/${id}/report`
                  : 'reports',
              'POST',
              {
                reason: draft.trim(),
                ...(params.kind === 'content' ? { target: id } : {}),
              },
              () => setNotice('Your report has been sent to moderators.'),
            )
          }
        />
      </Section>
    );
  else if (view === 'new-thread')
    content = (
      <Section rule={false}>
        <Text>
          Give people enough context to explore it with you. Member discussions
          are separate from source records.
        </Text>
        <Field
          label="What would you like to discuss?"
          value={title}
          onChangeText={setTitle}
          maxLength={140}
          testID="community-new-title"
        />
        <Field
          label="OPAX link (optional)"
          value={link}
          onChangeText={setLink}
          autoCapitalize="none"
          maxLength={2048}
          testID="community-new-link"
        />
        <Composer
          ref={composerSurface}
          label="Your opening note"
          placeholder="Your opening note"
          submitLabel="Start discussion"
          value={draft}
          onChangeText={setDraft}
          onSubmit={post}
          busy={working}
          maxLength={5000}
          testID="community-compose"
          submitTestID="community-send"
        />
        <LinkRow
          title="Community guidelines"
          onPress={() => go('guidelines')}
        />
      </Section>
    );
  else if (view === 'conversation' && !id)
    content = (
      <Section rule={false}>
        <Text>Send a message to this community member.</Text>
        <Composer
          ref={composerSurface}
          label="Your message"
          placeholder="Write a message"
          submitLabel="Send message"
          value={draft}
          onChangeText={setDraft}
          onSubmit={post}
          busy={working}
          maxLength={3000}
          testID="community-compose"
          submitTestID="community-send"
        />
      </Section>
    );
  else if (error && !data)
    content = <ErrorState message={error} onRetry={() => void reload(true)} />;
  else if (path && !data)
    content = <LoadingState label="Loading community" shape="rows" />;
  else if (view === 'home' && data)
    content = (
      <>
        <Section rule={false}>
          <Text>Questions, sources and conversations worth following.</Text>
          <SegmentedControl
            value={feed!}
            onChange={(value) => {
              if (value === 'all' || requireSignIn())
                go('home', { feed: value });
            }}
            segments={[
              { value: 'all', label: 'Latest' },
              { value: 'following', label: 'Following' },
              { value: 'saved', label: 'Saved' },
            ]}
            testID="community-feeds"
          />
          <SearchBox
            label="Search discussions"
            initial={q}
            onSearch={(q) => go('home', { feed: feed!, q })}
          />
          <LinkRow
            title="Start a discussion"
            testID="community-new"
            onPress={() => {
              if (requireSignIn()) go('new-thread');
            }}
          />
        </Section>
        <Section title="Discussions">
          {rows(data, 'threads').filter((r) => !isBlocked(text(r, 'member_id')))
            .length ? (
            <ThreadRows items={rows(data, 'threads')} />
          ) : (
            <EmptyState message="No discussions found. Try another word or clear your search." />
          )}
          {pagination(flag(data.more), 'home')}
        </Section>
        <Section title="Your community">
          <RowList>
            {(
              [
                'members',
                'messages',
                'activity',
                'lists',
                'profile',
                'settings',
              ] as CommunityView[]
            ).map((v) => (
              <LinkRow
                key={v}
                title={titles[v]}
                testID={`community-open-${v}`}
                onPress={() => go(v)}
              />
            ))}
            <LinkRow
              title="Community guidelines"
              testID="community-open-guidelines"
              onPress={() => go('guidelines')}
            />
          </RowList>
        </Section>
      </>
    );
  else if (view === 'thread' && data) {
    const t = object(data.thread),
      owner = text(t, 'member_id');
    content = isBlocked(owner) ? (
      <EmptyState message="This member is blocked. Their discussions are hidden." />
    ) : (
      <>
        <Section rule={false}>
          <Heading level={1}>{text(t, 'title')}</Heading>
          <LinkRow
            title={text(t, 'display_name')}
            detail={dateLine(t)}
            testID="community-author"
            onPress={() => go('member', { id: owner })}
          />
          <Text>{text(t, 'body')}</Text>
          {text(t, 'source_path') ? (
            <LinkRow
              title="Open OPAX record"
              testID="community-record"
              onPress={() => record(text(t, 'source_path'))}
            />
          ) : null}
          <Group>
            <Button
              label={flag(t.liked) ? 'Unlike' : 'Like'}
              testID="community-like"
              loading={working}
              onPress={() =>
                void mutate(
                  `threads/${id}/like`,
                  flag(t.liked) ? 'DELETE' : 'PUT',
                  undefined,
                  (d) => {
                    t.liked = flag(d.active);
                    t.likes = d.likes;
                  },
                )
              }
            />
            <Button
              label={flag(t.saved) ? 'Unsave' : 'Save'}
              testID="community-save"
              loading={working}
              onPress={() =>
                void mutate(
                  `threads/${id}/save`,
                  flag(t.saved) ? 'DELETE' : 'PUT',
                  undefined,
                  (d) => {
                    t.saved = flag(d.active);
                  },
                )
              }
            />
            <LinkRow
              title="Report discussion"
              testID="community-report-thread"
              onPress={() => report(id)}
            />
            <LinkRow
              title="Share discussion"
              onPress={() => share('thread', text(t, 'title'), id)}
            />
          </Group>
        </Section>
        <Section title="Replies">
          <RowList>
            {rows(data, 'replies')
              .filter((r) => !isBlocked(text(r, 'member_id')))
              .map((r) => (
                <Group key={text(r, 'id')}>
                  <LinkRow
                    title={text(r, 'display_name')}
                    detail={dateLine(r)}
                    onPress={() => go('member', { id: text(r, 'member_id') })}
                  />
                  <Text>{text(r, 'body')}</Text>
                  <LinkRow
                    title="Report reply"
                    testID={`community-report-reply-${text(r, 'id')}`}
                    onPress={() => report(text(r, 'id'))}
                  />
                </Group>
              ))}
          </RowList>
          {data.more_replies ? (
            <Text variant="metadata">
              Showing the latest replies. Open the discussion on OPAX to read
              more.
            </Text>
          ) : null}
          <Composer
            ref={composerSurface}
            label="Your reply"
            placeholder="Write a reply"
            submitLabel="Post reply"
            value={draft}
            onChangeText={setDraft}
            onSubmit={post}
            busy={working}
            maxLength={3000}
            testID="community-compose"
            submitTestID="community-send"
          />
        </Section>
      </>
    );
  } else if (view === 'members' && data)
    content = (
      <>
        <Section rule={false}>
          <Text>Find people exploring the public record.</Text>
          <SearchBox
            label="Search community members"
            initial={q}
            onSearch={(q) => go('members', { q })}
          />
        </Section>
        <Section title="Members">
          <RowList>
            {rows(data, 'members')
              .filter((m) => !isBlocked(text(m, 'id')))
              .map((m) => (
                <LinkRow
                  key={text(m, 'id')}
                  title={text(m, 'name')}
                  detail={text(m, 'bio')}
                  testID={`community-member-${text(m, 'id')}`}
                  onPress={() => go('member', { id: text(m, 'id') })}
                />
              ))}
          </RowList>
          {pagination(flag(data.more), 'members')}
        </Section>
      </>
    );
  else if (view === 'member' && data) {
    const m = object(data.member),
      relationship = object(data.relationship),
      blocked = isBlocked(id) || flag(relationship.blocked);
    content = blocked ? (
      <Section rule={false}>
        <Text testID="community-blocked">
          Member blocked. Their discussions, messages and activity are hidden.
        </Text>
        <Button
          label="Unblock"
          testID="community-unblock"
          onPress={() =>
            void mutate(`members/${id}/block`, 'DELETE', undefined, () =>
              blockLocally(id, false),
            )
          }
        />
      </Section>
    ) : (
      <>
        <Section rule={false}>
          <Heading level={1}>{text(m, 'name')}</Heading>
          <Text>{text(m, 'bio')}</Text>
          <Text variant="caption">Joined {dateLine(m)}</Text>
          <KeyValueList
            items={Object.entries(object(data.stats)).map(([label, value]) => ({
              label,
              value: String(value),
            }))}
          />
          <Button
            label={flag(relationship.following) ? 'Unfollow' : 'Follow'}
            loading={working}
            testID="community-follow"
            onPress={() =>
              void mutate(
                `members/${id}/follow`,
                flag(relationship.following) ? 'DELETE' : 'PUT',
                undefined,
                (d) => {
                  relationship.following = flag(d.following);
                },
              )
            }
          />
          {data.can_message ? (
            <LinkRow
              title="Message"
              testID="community-message"
              onPress={() =>
                go(
                  'conversation',
                  data.conversation_id
                    ? { id: String(data.conversation_id) }
                    : { to: id },
                )
              }
            />
          ) : null}
          <Button
            label="Block member"
            variant="danger"
            loading={working}
            testID="community-block"
            onPress={() =>
              Alert.alert(
                'Block this member?',
                'Blocking stops messages, removes your follow connections and hides each other’s discussions while signed in.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Block',
                    style: 'destructive',
                    onPress: () =>
                      void mutate(`members/${id}/block`, 'PUT', undefined, () =>
                        blockLocally(id, true),
                      ),
                  },
                ],
              )
            }
          />
          <LinkRow
            title="Report profile"
            testID="community-report-profile"
            onPress={() => report(id, 'profile')}
          />
          <LinkRow
            title="Share profile"
            onPress={() => share('member', text(m, 'name'), id)}
          />
        </Section>
        <Section title="Discussions">
          <ThreadRows items={rows(data, 'threads')} />
        </Section>
        <Section title="Public reading lists">
          <RowList>
            {rows(data, 'lists').map((l) => (
              <LinkRow
                key={text(l, 'id')}
                title={text(l, 'title')}
                onPress={() => go('list', { id: text(l, 'id'), own: 'true' })}
              />
            ))}
          </RowList>
        </Section>
      </>
    );
  } else if (view === 'messages' && data)
    content = (
      <Section rule={false}>
        <Text>Your conversations</Text>
        <RowList>
          {rows(data, 'conversations')
            .filter((c) => !isBlocked(text(c, 'member_id')))
            .map((c) => (
              <LinkRow
                key={text(c, 'id')}
                title={text(c, 'name')}
                detail={`${text(c, 'preview')}${count(c, 'unread') ? ` · ${count(c, 'unread')} unread` : ''}`}
                testID={`community-conversation-${text(c, 'id')}`}
                onPress={() => go('conversation', { id: text(c, 'id') })}
              />
            ))}
        </RowList>
        {!rows(data, 'conversations').length ? (
          <EmptyState message="Your conversations will appear here." />
        ) : null}
        {pagination(flag(data.more), 'messages')}
        <LinkRow title="Find a member" onPress={() => go('members')} />
      </Section>
    );
  else if (view === 'conversation' && data) {
    const c = object(data.conversation),
      m = object(c.member),
      messages = rows(data, 'messages');
    content = isBlocked(text(m, 'id')) ? (
      <EmptyState message="This member is blocked. Their messages are hidden." />
    ) : (
      <>
        <Section rule={false}>
          <LinkRow
            title={text(m, 'name')}
            testID="community-conversation-member"
            onPress={() => go('member', { id: text(m, 'id') })}
          />
          <RowList>
            {messages.map((msg) => (
              <Group key={text(msg, 'id')}>
                <Text variant="metadata">
                  {text(msg, 'sender_id') === text(m, 'id')
                    ? text(m, 'name')
                    : 'You'}{' '}
                  · {dateLine(msg)}
                </Text>
                <Text>
                  {flag(msg.hidden) ? 'Message removed' : text(msg, 'body')}
                </Text>
                {text(msg, 'sender_id') === text(m, 'id') &&
                !flag(msg.hidden) ? (
                  <LinkRow
                    title="Report message"
                    testID={`community-report-message-${text(msg, 'id')}`}
                    onPress={() => report(text(msg, 'id'), 'message')}
                  />
                ) : null}
              </Group>
            ))}
          </RowList>
          <Button
            label="Mark read"
            testID="community-mark-read"
            disabled={!messages.length}
            loading={working}
            onPress={() =>
              void mutate(`conversations/${id}/read`, 'POST', {
                through: count(messages.at(-1)!, 'seq'),
              })
            }
          />
          {flag(data.more) ? (
            <LinkRow
              title="Load earlier messages"
              onPress={() =>
                go('conversation', {
                  id,
                  before: String(count(messages[0]!, 'seq')),
                })
              }
            />
          ) : null}
          {data.can_message ? (
            <Composer
              ref={composerSurface}
              label="Your message"
              placeholder="Write a message"
              submitLabel="Send message"
              value={draft}
              onChangeText={setDraft}
              onSubmit={post}
              busy={working}
              maxLength={3000}
              testID="community-compose"
              submitTestID="community-send"
            />
          ) : (
            <Text>Messaging is currently unavailable.</Text>
          )}
        </Section>
        <Section>
          <LinkRow
            title="All messages"
            testID="community-inbox"
            onPress={() => go('messages')}
          />
        </Section>
      </>
    );
  } else if (view === 'activity' && data)
    content = (
      <Section rule={false}>
        <Text>Replies, likes and new followers.</Text>
        <RowList>
          {rows(data, 'notifications')
            .filter((n) => !isBlocked(text(n, 'actor_id')))
            .map((n) => (
              <LinkRow
                key={count(n, 'id')}
                title={`${text(n, 'display_name')} ${text(n, 'kind') === 'follow' ? 'started following you.' : text(n, 'kind') === 'like' ? 'liked your discussion.' : 'replied to your discussion.'}`}
                detail={`${text(n, 'title')} · ${dateLine(n)}${n.read_at ? '' : ' · Unread'}`}
                onPress={() =>
                  text(n, 'thread_id')
                    ? go('thread', { id: text(n, 'thread_id') })
                    : go('member', { id: text(n, 'actor_id') })
                }
              />
            ))}
        </RowList>
        {!rows(data, 'notifications').length ? (
          <EmptyState message="You’re all caught up." />
        ) : null}
        <Button
          label="Mark as read"
          testID="community-activity-read"
          loading={working}
          disabled={!rows(data, 'notifications').length}
          onPress={() =>
            void mutate(
              'notifications/read',
              'POST',
              { through: count(rows(data, 'notifications')[0]!, 'id') },
              () => {
                rows(data, 'notifications').forEach((n) => {
                  n.read_at = 1;
                });
              },
            )
          }
        />
        {flag(data.more) ? (
          <LinkRow
            title="Older activity"
            onPress={() =>
              go('activity', {
                before: String(
                  count(rows(data, 'notifications').at(-1)!, 'id'),
                ),
              })
            }
          />
        ) : null}
      </Section>
    );
  else if (view === 'settings' && data)
    content = (
      <>
        <Section rule={false} title="Who can send you messages?">
          <SegmentedControl
            value={policy}
            onChange={setPolicy}
            stacked
            segments={[
              { value: 'everyone', label: 'Everyone in the community' },
              { value: 'following', label: 'People you follow' },
              { value: 'nobody', label: 'No one' },
            ]}
          />
          <Button
            label="Save message settings"
            loading={working}
            testID="community-save-policy"
            onPress={() =>
              void mutate('preferences', 'PATCH', { message_policy: policy })
            }
          />
        </Section>
        <Section title="Email notifications">
          <Text>
            Email me when another member replies to a discussion I started.
          </Text>
          <SegmentedControl
            value={emails ? 'on' : 'off'}
            onChange={(v) => setEmails(v === 'on')}
            segments={[
              { value: 'on', label: 'On' },
              { value: 'off', label: 'Off' },
            ]}
          />
          <Button
            label="Save email preferences"
            loading={working}
            onPress={() =>
              void mutate('preferences', 'PATCH', {
                reply_email_notifications: emails,
              })
            }
          />
        </Section>
        <Section title="Blocked members">
          <Text>
            Blocking stops messages, removes your follow connections and hides
            each other’s discussions while signed in.
          </Text>
          <Button
            label="Show blocked members"
            testID="community-show-blocks"
            onPress={() => {
              void communityRead(api + 'blocks').then(
                (d) => setBlockedRows(rows(d, 'members')),
                (e) => setFailure((e as Error).message),
              );
            }}
          />
          {blockedRows ? (
            <RowList>
              {blockedRows.map((m) => (
                <Group key={text(m, 'id')}>
                  <Text>{text(m, 'name')}</Text>
                  <Button
                    label="Unblock"
                    onPress={() =>
                      void mutate(
                        `members/${text(m, 'id')}/block`,
                        'DELETE',
                        undefined,
                        () => {
                          blockLocally(text(m, 'id'), false);
                          setBlockedRows(
                            blockedRows.filter((b) => b.id !== m.id),
                          );
                        },
                      )
                    }
                  />
                </Group>
              ))}
            </RowList>
          ) : null}
          <Text variant="metadata">
            Public discussions can still be read when signed out.
          </Text>
        </Section>
      </>
    );
  else if (view === 'profile' && data)
    content = (
      <Section rule={false}>
        <Text>
          Your email stays private. Your display name and bio are public.
        </Text>
        <Field
          label="Display name"
          value={title}
          onChangeText={setTitle}
          maxLength={60}
          testID="community-profile-name"
        />
        <Field
          label="A little about your interests"
          value={description}
          onChangeText={setDescription}
          multiline
          maxLength={280}
          testID="community-profile-bio"
        />
        <Button
          label="Save public profile"
          variant="primary"
          loading={working}
          disabled={title.trim().length < 2}
          onPress={() =>
            void mutate('profile', 'PATCH', {
              name: title.trim(),
              bio: description,
            })
          }
        />
      </Section>
    );
  else if (view === 'lists' && data)
    content = (
      <>
        <Section rule={false}>
          <Text>
            Keep a trail through the record, for yourself or to share.
          </Text>
          <RowList>
            {rows(data, 'lists').map((l) => (
              <LinkRow
                key={text(l, 'id')}
                title={text(l, 'title')}
                detail={`${count(l, 'count')} saved records · ${flag(l.public) ? 'Shared' : 'Private'}`}
                testID={`community-list-${text(l, 'id')}`}
                onPress={() => go('list', { id: text(l, 'id'), own: 'true' })}
              />
            ))}
          </RowList>
        </Section>
        <Section title="Start a reading list">
          <Field
            label="Title"
            value={title}
            onChangeText={setTitle}
            maxLength={120}
            testID="community-list-title"
          />
          <Field
            label="Description"
            value={description}
            onChangeText={setDescription}
            maxLength={500}
            multiline
          />
          <SegmentedControl
            value={publicList ? 'public' : 'private'}
            onChange={(v) => setPublicList(v === 'public')}
            segments={[
              { value: 'private', label: 'Private' },
              { value: 'public', label: 'Public' },
            ]}
          />
          <Button
            label="Create list"
            variant="primary"
            loading={working}
            disabled={title.trim().length < 2}
            onPress={() =>
              void mutate(
                'lists',
                'POST',
                { title: title.trim(), description, public: publicList },
                (d) =>
                  setCreated({
                    view: 'list',
                    id: text(d, 'id'),
                    title: 'Open new reading list',
                  }),
              )
            }
          />
        </Section>
      </>
    );
  else if (view === 'list' && data) {
    const l = object(data.list),
      own = signedIn && ownsList(id, text(l, 'member_id'));
    content = isBlocked(text(l, 'member_id')) ? (
      <EmptyState message="This member is blocked. Their reading lists are hidden." />
    ) : (
      <>
        <Section rule={false}>
          <Heading level={1}>{text(l, 'title')}</Heading>
          <Text>{text(l, 'description')}</Text>
          <Text variant="metadata">
            {flag(l.public) ? 'Shared reading list' : 'Private reading list'} ·{' '}
            {text(l, 'display_name')}
          </Text>
          {flag(l.public) ? (
            <LinkRow
              title="Share reading list"
              testID="community-list-share"
              onPress={() => share('list', text(l, 'title'), id)}
            />
          ) : null}
          <RowList>
            {rows(data, 'items').map((i) => (
              <Group key={text(i, 'id')}>
                <LinkRow
                  title={text(i, 'title')}
                  testID={`community-list-item-${text(i, 'id')}`}
                  onPress={() => record(text(i, 'path'))}
                />
                <Text>{text(i, 'note')}</Text>
                {own ? (
                  <Button
                    label="Remove from list"
                    onPress={() =>
                      void mutate(
                        `items/${text(i, 'id')}`,
                        'DELETE',
                        undefined,
                        () => {
                          data.items = rows(data, 'items').filter(
                            (x) => x.id !== i.id,
                          );
                        },
                      )
                    }
                  />
                ) : null}
              </Group>
            ))}
          </RowList>
        </Section>
        {own ? (
          <>
            <Section title="Add a record">
              <Field
                label="Title"
                value={draft}
                onChangeText={setDraft}
                maxLength={160}
              />
              <Field
                label="OPAX link"
                value={link}
                onChangeText={setLink}
                maxLength={2048}
                autoCapitalize="none"
              />
              <Button
                label="Save to list"
                loading={working}
                disabled={draft.trim().length < 2 || !link.trim()}
                onPress={() => {
                  try {
                    void mutate(`lists/${id}/items`, 'POST', {
                      title: draft.trim(),
                      path: safePath(link),
                      note: '',
                    });
                  } catch (e) {
                    setFailure((e as Error).message);
                  }
                }}
              />
            </Section>
            <Section title="List settings">
              <Field
                label="Title"
                value={title}
                onChangeText={setTitle}
                maxLength={120}
              />
              <Field
                label="Description"
                value={description}
                onChangeText={setDescription}
                multiline
                maxLength={500}
              />
              <SegmentedControl
                value={publicList ? 'public' : 'private'}
                onChange={(v) => setPublicList(v === 'public')}
                segments={[
                  { value: 'private', label: 'Private' },
                  { value: 'public', label: 'Public' },
                ]}
              />
              <Button
                label="Save settings"
                loading={working}
                onPress={() =>
                  void mutate(
                    `lists/${id}`,
                    'PATCH',
                    { title, description, public: publicList },
                    () => {
                      l.public = publicList;
                      l.title = title;
                      l.description = description;
                    },
                  )
                }
              />
              <Button
                label="Delete this list"
                variant="danger"
                onPress={() =>
                  Alert.alert(
                    'Delete reading list?',
                    'This deletes the list and its saved links.',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Delete',
                        style: 'destructive',
                        onPress: () =>
                          void mutate(`lists/${id}`, 'DELETE', undefined, () =>
                            router.back(),
                          ),
                      },
                    ],
                  )
                }
              />
            </Section>
          </>
        ) : null}
      </>
    );
  }
  return (
    <>
      <Stack.Screen options={{ title: titles[view] }} />
      <KeyboardStableScreen
        testID={`community-${view}`}
        keyboardTarget={composerSurface}
      >
        <Group>
          {failure ? (
            <Text
              tone="danger"
              accessibilityRole="alert"
              testID="community-error"
            >
              {failure}
            </Text>
          ) : null}
          {notice ? (
            <Text accessibilityLiveRegion="polite" testID="community-notice">
              {notice}
            </Text>
          ) : null}
          {created ? (
            <LinkRow
              title={created.title}
              testID="community-created"
              onPress={() => go(created.view, { id: created.id })}
            />
          ) : null}
          {content}
        </Group>
        {path && data ? (
          <Section>
            <Button
              label="Refresh"
              loading={busy}
              onPress={() => void reload(true)}
              testID="community-refresh"
            />
          </Section>
        ) : null}
        {view !== 'home' ? (
          <Section>
            <LinkRow
              title="Community"
              testID="community-home"
              onPress={() => go('home')}
            />
          </Section>
        ) : null}
      </KeyboardStableScreen>
    </>
  );
}

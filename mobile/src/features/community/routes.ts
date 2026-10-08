export const views = [
  'home',
  'thread',
  'new-thread',
  'members',
  'member',
  'messages',
  'conversation',
  'activity',
  'settings',
  'profile',
  'lists',
  'list',
  'guidelines',
  'report',
] as const;
export type CommunityView = (typeof views)[number];
export const communityRoute = (
  view: CommunityView = 'home',
  params: Record<string, string> = {},
) => ({
  pathname: '/community/[view]' as const,
  params: { ...params, view } as Record<string, string> & {
    view: CommunityView;
  },
});
export function communityFromWebPath(path: string) {
  if (
    !/^\/community(?:\?|$)/.test(path) ||
    /[\\#%]/.test(path) ||
    path.split('?').length > 2
  )
    return null;
  const p = new URLSearchParams(path.split('?')[1]);
  if (
    [...p.keys()].some(
      (k) =>
        !['view', 'id', 'to', 'feed', 'q', 'page', 'following'].includes(k) ||
        p.getAll(k).length !== 1,
    )
  )
    return null;
  const raw = p.get('view') ?? 'home';
  const view =
    raw === 'account'
      ? 'profile'
      : raw === 'messages' && (p.has('id') || p.has('to'))
        ? 'conversation'
        : raw;
  if (!(views as readonly string[]).includes(view) || view === 'report')
    return null;
  if (
    ['thread', 'member', 'list'].includes(view) &&
    !/^[\w-]{1,64}$/.test(p.get('id') ?? '')
  )
    return null;
  if (['id', 'to'].some((k) => p.has(k) && !/^[\w-]{1,64}$/.test(p.get(k)!)))
    return null;
  if (p.has('feed') && !['all', 'following', 'saved'].includes(p.get('feed')!))
    return null;
  if (
    p.has('page') &&
    (!/^\d{1,3}$/.test(p.get('page')!) || Number(p.get('page')) > 500)
  )
    return null;
  if (p.has('q') && p.get('q')!.length > 120) return null;
  if (p.has('following') && !['true', 'false'].includes(p.get('following')!))
    return null;
  p.delete('view');
  return communityRoute(view as CommunityView, Object.fromEntries(p));
}
export function communitySharePath(view: CommunityView, id?: string) {
  if (id && !/^[\w-]{1,64}$/.test(id))
    throw new Error('Invalid member content ID');
  const webView =
    view === 'profile'
      ? 'account'
      : view === 'conversation'
        ? 'messages'
        : view;
  return view === 'home'
    ? '/community'
    : `/community?view=${webView}${id ? `&id=${id}` : ''}`;
}

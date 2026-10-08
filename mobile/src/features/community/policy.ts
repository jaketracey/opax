// Worker: community.ts and community-social.ts. Keys and methods are exact.
const id = '[A-Za-z0-9_-]{1,64}';
export function communityRequestAllowed(path: string, method = 'GET'): boolean {
  if (
    !path.startsWith('/api/community/') ||
    /[\\#\u0000-\u0020\u007f]/.test(path) ||
    path.split('?').length > 2
  )
    return false;
  const [name, query] = path.slice(15).split('?');
  if (!name || /[%]/.test(name)) return false;
  const params = new URLSearchParams(query);
  if ([...params.keys()].some((k) => params.getAll(k).length !== 1))
    return false;
  if (method !== 'GET' && query !== undefined) return false;
  const match = (s: string) => new RegExp(`^${s}$`).test(name);
  if (method === 'GET') {
    let keys: string[] = [];
    if (name === 'threads') keys = ['feed', 'q', 'page'];
    else if (name === 'members') keys = ['q', 'following', 'page'];
    else if (name === 'conversations') keys = ['page'];
    else if (name === 'notifications') keys = ['before'];
    else if (match(`threads/${id}`)) keys = ['reply'];
    else if (match(`conversations/${id}`)) keys = ['before', 'after'];
    else if (
      !['status', 'preferences', 'blocks', 'lists'].includes(name) &&
      !match(`(?:members|lists)/${id}`)
    )
      return false;
    if ([...params.keys()].some((k) => !keys.includes(k))) return false;
    if (
      params.has('feed') &&
      !['all', 'following', 'saved'].includes(params.get('feed')!)
    )
      return false;
    if (
      params.has('following') &&
      !['true', 'false'].includes(params.get('following')!)
    )
      return false;
    if (params.has('q') && params.get('q')!.length > 120) return false;
    if (
      params.has('page') &&
      (!/^\d{1,3}$/.test(params.get('page')!) ||
        Number(params.get('page')) > 500)
    )
      return false;
    if (
      ['before', 'after'].some(
        (k) =>
          params.has(k) &&
          (!/^[1-9]\d{0,15}$/.test(params.get(k)!) ||
            !Number.isSafeInteger(Number(params.get(k)))),
      )
    )
      return false;
    if (
      params.has('reply') &&
      !new RegExp(`^${id}$`).test(params.get('reply')!)
    )
      return false;
    return true;
  }
  if (method === 'POST')
    return (
      [
        'threads',
        'reports',
        'conversations',
        'notifications/read',
        'lists',
      ].includes(name) ||
      match(
        `threads/${id}|conversations/${id}/(?:read|messages)|messages/${id}/report|members/${id}/report|lists/${id}/items`,
      )
    );
  if (method === 'PATCH')
    return ['profile', 'preferences'].includes(name) || match(`lists/${id}`);
  if (method === 'PUT')
    return match(`members/${id}/(?:follow|block)|threads/${id}/(?:like|save)`);
  if (method === 'DELETE')
    return match(
      `members/${id}/(?:follow|block)|threads/${id}/(?:like|save)|(?:threads|replies|lists|items)/${id}`,
    );
  return false;
}

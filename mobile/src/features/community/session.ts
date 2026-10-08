import { useSyncExternalStore } from 'react';
import native from '../../../modules/opax-voice';
import { communityRequestAllowed } from './policy';
import { decodeCommunity, object, type CommunityData } from './model';
const cache = new Map<string, Promise<CommunityData>>();
const listeners = new Set<() => void>();
let revision = 0,
  generation = 0;
const blocked = new Set<string>();
let agreed = false;
let refused = false;
export const communitySessionRefused = () => refused;
let memberID: string | null = null;
const ownLists = new Set<string>();
export const ownsList = (id: string, owner: string) =>
  ownLists.has(id) || memberID === owner;
export const communityGeneration = () => generation;
export function communityChanged() {
  revision++;
  listeners.forEach((f) => f());
}
export function clearCommunity(sessionRefused = false) {
  refused = sessionRefused;
  generation++;
  cache.clear();
  blocked.clear();
  agreed = false;
  memberID = null;
  ownLists.clear();
  communityChanged();
}
export const hasAgreed = () => agreed;
export function agreeGuidelines() {
  agreed = true;
  communityChanged();
}
export const isBlocked = (id: string) => blocked.has(id);
export function blockLocally(id: string, adding: boolean) {
  if (adding) blocked.add(id);
  else blocked.delete(id);
  cache.clear();
  communityChanged();
}
export function useCommunityRevision() {
  return useSyncExternalStore(
    (f) => {
      listeners.add(f);
      return () => {
        listeners.delete(f);
      };
    },
    () => revision,
    () => revision,
  );
}
export async function communityRequest(
  path: string,
  method = 'GET',
  body?: Record<string, unknown>,
): Promise<CommunityData> {
  if (!communityRequestAllowed(path, method))
    throw new Error('Community route refused');
  if (!native) throw new Error('Community is unavailable in this build.');
  const mine = generation;
  const envelope = object(
    await native.communityRequest(
      path,
      method,
      body ? JSON.stringify(body) : null,
    ),
  );
  if (mine !== generation) throw new Error('Your account session changed.');
  if (envelope.ok !== true) {
    if (envelope.error === 'signedOut') clearCommunity(true);
    throw new Error(
      envelope.error === 'signedOut'
        ? 'Sign in to continue.'
        : 'This action could not be completed. Please try again shortly.',
    );
  }
  const response = object(envelope.value);
  if (response.status === 401) {
    clearCommunity(true);
    throw new Error('Sign in to continue.');
  }
  const data = object(JSON.parse(String(response.body)));
  if (
    typeof response.status !== 'number' ||
    response.status < 200 ||
    response.status >= 300
  )
    throw new Error(
      typeof data.error === 'string' ? data.error : 'This page is unavailable.',
    );
  if (method === 'GET') {
    const decoded = decodeCommunity(path, data);
    if (path === '/api/community/status' && decoded.member)
      memberID = String(object(decoded.member).id);
    if (path === '/api/community/lists' && Array.isArray(decoded.lists))
      decoded.lists.forEach((l) => ownLists.add(String(object(l).id)));
    return decoded;
  }
  if (
    path === '/api/community/lists' &&
    method === 'POST' &&
    typeof data.id === 'string'
  )
    ownLists.add(data.id);
  return data;
}
export function communityRead(path: string, refresh = false) {
  if (refresh) cache.delete(path);
  let pending = cache.get(path);
  if (!pending) {
    pending = communityRequest(path);
    cache.set(path, pending);
    void pending.catch(() => cache.delete(path));
  }
  return pending;
}
export function invalidateCommunity() {
  cache.clear();
}

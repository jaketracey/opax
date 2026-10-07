import { PortraitCache } from './portrait-cache';
import { PortraitDiskStore } from './portrait-disk-store';
import { PeoplePortraits } from './people-portraits';
import Constants from 'expo-constants';
import { ApiClient } from './client';
import { CatalogCache } from './cache';
import { DiskStore } from './disk-store';
import { PeopleDepth } from '../features/people/data';
import { Catalogs } from './catalogs';
import { setCatalogDiagnostics } from './validation';
import { RecordSearch } from '../features/search/api';
const extra = Constants.expoConfig?.extra;
if (
  !extra ||
  typeof extra.apiOrigin !== 'string' ||
  !['development', 'e2e', 'production'].includes(extra.variant)
)
  throw new Error('Missing OPAX build configuration');
const origin = new URL(extra.apiOrigin);
if (
  extra.variant === 'e2e'
    ? origin.protocol !== 'http:' ||
      origin.hostname !== '127.0.0.1' ||
      Number(origin.port) < 8900 ||
      Number(origin.port) > 8999
    : extra.variant === 'development'
      ? !(
          origin.protocol === 'https:' ||
          (origin.protocol === 'http:' &&
            ['localhost', '127.0.0.1'].includes(origin.hostname))
        )
      : origin.protocol !== 'https:'
)
  throw new Error('API origin does not match the build variant');
export const isE2E = extra.variant === 'e2e';
setCatalogDiagnostics(isE2E);
export const apiClient = new ApiClient({
  origin: extra.apiOrigin,
  version: extra.appVersion,
  build: extra.appBuild,
  cache: new CatalogCache(new DiskStore(), 24 * 1024 * 1024, 220),
});
// Ask and records search share the same configured client.
export const client = apiClient;
export const catalogs = new Catalogs(apiClient);
export const peopleDepth = new PeopleDepth(apiClient);
export const recordSearch = new RecordSearch(apiClient);
// Paid reader calls: no disk persistence and no automatic retry. Records owns
// the session promises, so opening a cached record costs no new request.
export const recordClient = new ApiClient({
  origin: extra.apiOrigin,
  version: extra.appVersion,
  build: extra.appBuild,
  retries: 0,
  cache: new CatalogCache({
    readIndex: async () => [], writeIndex: async () => {},
    read: async () => undefined, write: async () => {}, remove: async () => {},
  }),
});
export const portraits = new PeoplePortraits(
  catalogs,
  new PortraitCache(new PortraitDiskStore(extra.apiOrigin), apiClient),
);

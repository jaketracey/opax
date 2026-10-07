import { PortraitCache } from './portrait-cache';
import { PortraitDiskStore } from './portrait-disk-store';
import { PeoplePortraits } from './people-portraits';
import Constants from 'expo-constants';
import { ApiClient } from './client';
import { CatalogCache } from './cache';
import { DiskStore } from './disk-store';
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
const client = new ApiClient({
  origin: extra.apiOrigin,
  version: extra.appVersion,
  build: extra.appBuild,
  cache: new CatalogCache(new DiskStore(), 24 * 1024 * 1024, 220),
});
export const catalogs = new Catalogs(client);
export const recordSearch = new RecordSearch(client);
export const portraits = new PeoplePortraits(
  catalogs,
  new PortraitCache(new PortraitDiskStore(extra.apiOrigin), client),
);

import Constants from 'expo-constants';
import { ApiClient } from './client';
import { CatalogCache } from './cache';
import { DiskStore } from './disk-store';
import { Catalogs } from './catalogs';
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
export const catalogs = new Catalogs(
  new ApiClient({
    origin: extra.apiOrigin,
    version: extra.appVersion,
    build: extra.appBuild,
    cache: new CatalogCache(new DiskStore()),
  }),
);

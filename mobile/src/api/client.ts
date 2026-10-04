import { fetch as expoFetch } from 'expo/fetch';
import { CatalogCache, isFresh, type CacheEntry } from './cache';
import { ApiError, httpError } from './errors';
import { allowedURL } from './policy';

export interface RecordResult<T> {
  data: T;
  stale: boolean;
  savedAt: number;
  asOf: string | null;
}
type Decoder<T> = (value: unknown) => T;
interface ClientOptions {
  origin: string;
  version: string;
  build: string;
  cache: CatalogCache;
  transport?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  timeoutMs?: number;
  retries?: number;
}
export function dataAsOf(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const data = value as Record<string, unknown>;
  const meta = (data.meta ?? {}) as Record<string, unknown>;
  const votesMeta = (data._meta ?? {}) as Record<string, unknown>;
  const refresh = (data.refresh ?? {}) as Record<string, unknown>;
  const date =
    meta.as_of ??
    votesMeta.content_changed_at ??
    refresh.checked_at ??
    data.as_at ??
    data.generated_at ??
    meta.generated ??
    votesMeta.generated ??
    data.generated;
  return typeof date === 'string' ? date : null;
}
export class ApiClient {
  private transport: typeof fetch;
  private now: () => number;
  private sleep: (ms: number) => Promise<void>;
  constructor(private options: ClientOptions) {
    this.transport = options.transport ?? expoFetch;
    this.now = options.now ?? Date.now;
    this.sleep =
      options.sleep ??
      ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }
  /**
   * `absence: true` is for a route whose 404 is an authoritative answer with
   * a body (the W13 edition): the 404 body is decoded and saved like a 200,
   * so it replaces the saved record and is fresh, stale or offline as any
   * other read. Everywhere else a 404 is a not-found error.
   */
  async get<T>(
    path: string,
    decode: Decoder<T>,
    force = false,
    { absence = false }: { absence?: boolean } = {},
  ): Promise<RecordResult<T>> {
    const url = allowedURL(this.options.origin, path); // before cache or networking
    const requestStartedAt = this.now();
    const deadline = requestStartedAt + (this.options.timeoutMs ?? 8000);
    let cached = await this.options.cache.get(url);
    if (cached) {
      try {
        decode(cached.body);
      } catch {
        cached = undefined;
      }
    }
    const result = (entry: CacheEntry, stale: boolean): RecordResult<T> => ({
      data: decode(entry.body),
      stale,
      savedAt: entry.savedAt,
      asOf: entry.asOf,
    });
    if (cached && !force && isFresh(cached, this.now()))
      return result(cached, false);
    let lastError = new ApiError(
      'offline',
      'This record is not saved on this iPhone yet. It will load when you are back online.',
    );
    for (let attempt = 0; attempt <= (this.options.retries ?? 2); attempt++) {
      const remaining = deadline - this.now();
      if (remaining <= 0) break;
      let retryDelay = 300 * 2 ** attempt;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), remaining);
      try {
        const response = await this.transport(url, {
          method: 'GET',
          credentials: 'omit',
          redirect: 'manual',
          signal: controller.signal,
          headers: {
            Accept: 'application/json',
            'User-Agent': `OPAX-iOS/${this.options.version} (${this.options.build})`,
            ...(cached?.etag ? { 'If-None-Match': cached.etag } : {}),
          },
        });
        if (
          response.redirected ||
          (response.status >= 300 &&
            response.status < 400 &&
            response.status !== 304) ||
          (response.url && response.url !== url)
        )
          throw new ApiError(
            'forbidden',
            'Redirects are not allowed for catalog data.',
          );
        if (response.status === 304 && !cached)
          throw new ApiError(
            'invalid-data',
            'The catalog response could not be read.',
          );
        if (response.status === 429) {
          const retryAfter = response.headers.get('retry-after');
          if (retryAfter) {
            const seconds = Number(retryAfter);
            retryDelay = Number.isFinite(seconds)
              ? Math.max(0, seconds * 1000)
              : Math.max(0, Date.parse(retryAfter) - this.now());
            if (!Number.isFinite(retryDelay)) retryDelay = 300 * 2 ** attempt;
          }
        }
        if (
          response.status !== 304 &&
          !response.ok &&
          !(absence && response.status === 404)
        )
          throw httpError(response.status);
        let body: unknown;
        try {
          body = response.status === 304 ? cached!.body : await response.json();
        } catch (error) {
          if (controller.signal.aborted)
            throw new ApiError(
              'timeout',
              'The public record took too long to load. Try again.',
            );
          if (
            !(error instanceof SyntaxError) &&
            !(
              typeof error === 'object' &&
              error !== null &&
              'name' in error &&
              error.name === 'SyntaxError'
            )
          )
            throw error;
          throw new ApiError(
            'invalid-data',
            'The catalog response could not be read.',
          );
        }
        try {
          decode(body);
        } catch {
          throw new ApiError(
            'invalid-data',
            'The catalog response could not be read.',
          );
        }
        const time = this.now();
        const control = response.headers.get('cache-control') ?? '';
        const ttl = /no-store|no-cache/.test(control)
          ? 0
          : Math.min(Number(/max-age=(\d+)/.exec(control)?.[1] ?? 300), 86400);
        const entry: CacheEntry = {
          url,
          body,
          savedAt: response.status === 304 ? cached!.savedAt : time,
          validatedAt: time,
          expiresAt: time + ttl * 1000,
          asOf: dataAsOf(body),
          etag:
            response.headers.get('etag') ??
            (response.status === 304 ? cached?.etag : undefined),
        };
        // Persistence failure must not turn a successful network read into an error.
        const retained = await this.options.cache
          .put(entry, {
            requestStartedAt,
            ...(response.status === 304
              ? { revalidatedETag: cached?.etag }
              : {}),
          })
          .catch(() => entry);
        return result(
          retained,
          retained !== entry && !isFresh(retained, this.now()),
        );
      } catch (error) {
        lastError =
          error instanceof ApiError
            ? error
            : controller.signal.aborted
              ? new ApiError(
                  'timeout',
                  'The public record took too long to load. Try again.',
                )
              : new ApiError(
                  'offline',
                  'This record is not saved on this iPhone yet. It will load when you are back online.',
                );
        if (
          !['offline', 'timeout', 'server', 'rate-limited'].includes(
            lastError.code,
          )
        )
          throw lastError;
      } finally {
        clearTimeout(timer);
      }
      if (attempt < (this.options.retries ?? 2)) {
        if (retryDelay >= deadline - this.now()) break;
        await this.sleep(retryDelay);
      }
    }
    cached = (await this.options.cache.get(url)) ?? cached;
    if (cached) return result(cached, true);
    throw lastError;
  }
}

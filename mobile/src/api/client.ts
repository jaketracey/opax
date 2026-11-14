import { fetch as expoFetch } from 'expo/fetch';
import { throwIfAborted } from './abort';
import { ReadSession } from './read-session';
import { isE2E } from '../design/environment';
import { phoneCopy } from '../design/phone-copy';
import type { StreamHandlers } from '../features/ask/stream';
import { postAsk } from '../features/ask/transport';
import { isExplorePaidPath } from '../features/explore/policy';
import { isPeoplePaidPath } from '../features/people/policy';
import { summaryStreamBody } from '../features/search/decoders';
import { CatalogCache, isFresh, type CacheEntry } from './cache';
import { ApiError, httpError } from './errors';
import { allowedURL, assertAskPostPath } from './policy';
import {
  assertPortraitBytes,
  assertPortraitPath,
  isPortraitPath,
  portraitMaxBytes,
  portraitMetadataLimits,
} from './portrait-policy';
import { isReportsPaidPath } from './reports-policy';
import { catalogUserAgent } from './user-agent';
import { isPartialCatalog } from './validation';
import {
  assertYearPictureBytes,
  isYearPicturePath,
  yearPictureMaxBytes,
} from './year-picture-policy';

export interface RecordResult<T> {
  data: T;
  stale: boolean;
  partial?: boolean;
  staleReason?: 'unreadable' | 'unavailable';
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
  /** Test seam: defaults to the build's decision, read once at load. */
  freezeSnapshots?: boolean;
}
/**
 * Deep-freezing every decoded catalog costs tens of milliseconds on a first
 * open. It exists to catch a screen changing a shared cached value in place,
 * so it runs where that bug can be caught (dev, Jest and e2e builds) and is
 * skipped in release, where nothing would report it.
 */
export function shouldFreezeSnapshots(build: {
  dev: boolean;
  e2e: boolean;
  jest: boolean;
}): boolean {
  return build.dev || build.e2e || build.jest;
}
const freezeByDefault = shouldFreezeSnapshots({
  dev: typeof __DEV__ !== 'undefined' && __DEV__ === true,
  e2e: isE2E === true,
  jest:
    typeof process !== 'undefined' &&
    typeof process.env?.JEST_WORKER_ID === 'string',
});
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
// Cached JSON must remain the version that passed validation. Freezing once
// prevents a screen from changing a reused result without another decode.
// Release builds skip it (see shouldFreezeSnapshots); screens copy before
// sorting or editing a decoded value either way.
export function freezeSnapshot(...values: unknown[]) {
  const pending = [...values];
  const seen = new WeakSet<object>();
  while (pending.length) {
    const item = pending.pop();
    if (item === null || typeof item !== 'object' || seen.has(item)) continue;
    seen.add(item);
    // A decoder or store may have frozen only the parent. Still traverse its
    // children; shared raw/decoded descendants are visited once per snapshot.
    if (!Object.isFrozen(item)) Object.freeze(item);
    for (const child of Object.values(item)) pending.push(child);
  }
}
export class ApiClient {
  /** Validated saved copy, without a network read. */
  async saved<T>(
    path: string,
    decode: Decoder<T>,
  ): Promise<RecordResult<T> | null> {
    const entry = await this.options.cache.get(
      allowedURL(this.options.origin, path),
    );
    if (!entry) return null;
    try {
      return {
        data: this.decodeBody(entry.body, decode),
        stale: true,
        savedAt: entry.savedAt,
        asOf: entry.asOf,
      };
    } catch {
      return null;
    }
  }
  forget(path: string): Promise<void> {
    return this.options.cache.remove(allowedURL(this.options.origin, path));
  }
  private actionReads = new ReadSession<RecordResult<unknown>>();
  /** Explicit actions only: one attempt, session memory, no disk or retry. */
  getForAction<T>(
    path: string,
    decode: Decoder<T>,
    { fresh = false, signal }: { fresh?: boolean; signal?: AbortSignal } = {},
  ): Promise<RecordResult<T>> {
    const url = allowedURL(this.options.origin, path);
    if (
      !isPeoplePaidPath(path) &&
      !isReportsPaidPath(path) &&
      !isExplorePaidPath(path)
    )
      throw new ApiError('forbidden', 'Not an action read.');
    return this.actionReads.read(
      path,
      (requestSignal) => this.readAction(url, decode, requestSignal),
      { fresh, signal },
    ) as Promise<RecordResult<T>>;
  }
  private async readAction<T>(
    url: string,
    decode: Decoder<T>,
    signal?: AbortSignal,
  ): Promise<RecordResult<T>> {
    throwIfAborted(signal);
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(
      () => controller.abort(),
      this.options.timeoutMs ?? 8000,
    );
    try {
      const response = await this.transport(url, {
        method: 'GET',
        credentials: 'omit',
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          'User-Agent': catalogUserAgent(
            this.options.version,
            this.options.build,
          ),
        },
      });
      if (
        response.redirected ||
        (response.status >= 300 && response.status < 400) ||
        (response.url && response.url !== url)
      )
        throw new ApiError(
          'forbidden',
          'Redirects are not allowed for catalog data.',
        );
      if (!response.ok) throw httpError(response.status);
      let data: T;
      try {
        const body = await response.json();
        throwIfAborted(signal);
        data = this.decodeBody(body, decode);
      } catch {
        if (controller.signal.aborted)
          throw new ApiError(
            'timeout',
            'The public record took too long to load.',
          );
        throw new ApiError(
          'invalid-data',
          'The catalog response could not be read.',
        );
      }
      throwIfAborted(signal);
      if (controller.signal.aborted)
        throw new ApiError(
          'timeout',
          'The public record took too long to load.',
        );
      return { data, stale: false, savedAt: this.now(), asOf: dataAsOf(data) };
    } catch (e) {
      throwIfAborted(signal);
      if (e instanceof ApiError) throw e;
      throw new ApiError(
        controller.signal.aborted ? 'timeout' : 'offline',
        controller.signal.aborted
          ? 'The public record took too long to load.'
          : 'This section is not saved for this session. It will load when you are back online.',
      );
    } finally {
      signal?.removeEventListener('abort', abort);
      clearTimeout(timer);
    }
  }
  private transport: typeof fetch;
  private now: () => number;
  private sleep: (ms: number) => Promise<void>;
  private freezeSnapshots: boolean;
  // Body identity is a catalog version, independent of dates or ETags. Each
  // decoder validates that version once; new bytes must validate again. Weak
  // keys release decoded snapshots when the bounded raw cache evicts them.
  private decoded = new WeakMap<object, Map<Decoder<unknown>, unknown>>();
  private decodeBody<T>(body: unknown, decode: Decoder<T>): T {
    if (body === null || typeof body !== 'object') return decode(body);
    let versions = this.decoded.get(body);
    if (versions?.has(decode)) return versions.get(decode) as T;
    const value = decode(body); // Never retain a failed validation.
    if (this.freezeSnapshots) freezeSnapshot(body, value);
    if (!versions) this.decoded.set(body, (versions = new Map()));
    versions.set(decode, value);
    return value;
  }
  constructor(private options: ClientOptions) {
    this.transport = options.transport ?? expoFetch;
    this.now = options.now ?? Date.now;
    this.freezeSnapshots = options.freezeSnapshots ?? freezeByDefault;
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
    {
      absence = false,
      background = false,
      signal,
      retries = this.options.retries ?? 2,
      timeoutMs = this.options.timeoutMs ?? 8000,
      summaryStream = false,
    }: {
      absence?: boolean;
      background?: boolean;
      signal?: AbortSignal;
      retries?: number;
      timeoutMs?: number;
      summaryStream?: boolean;
    } = {},
  ): Promise<RecordResult<T>> {
    if (path.startsWith('/api/community/'))
      throw new ApiError(
        'forbidden',
        'Community requires the native session client.',
      );
    if (path.startsWith('/api/ask') || path.startsWith('/api/followups'))
      throw new ApiError('forbidden', 'Ask requires an explicit submission.');
    const url = allowedURL(this.options.origin, path); // before cache or networking
    if (
      isPeoplePaidPath(path) ||
      isReportsPaidPath(path) ||
      isExplorePaidPath(path)
    )
      throw new ApiError(
        'forbidden',
        'Paid sections require an explicit action read.',
      );
    if (isPortraitPath(path) || isYearPicturePath(path))
      throw new ApiError('forbidden', 'Images require the byte client.');
    const cancelled = () => {
      if (signal?.aborted)
        throw Object.assign(new Error('Cancelled'), { name: 'AbortError' });
    };
    const pause = async (ms: number) => {
      if (!signal) return this.sleep(ms);
      let abort!: () => void;
      const cancellation = new Promise<never>((_resolve, reject) => {
        abort = () =>
          reject(Object.assign(new Error('Cancelled'), { name: 'AbortError' }));
        signal.addEventListener('abort', abort, { once: true });
        if (signal.aborted) abort();
      });
      try {
        await Promise.race([this.sleep(ms), cancellation]);
      } finally {
        signal.removeEventListener('abort', abort);
      }
    };
    cancelled();
    const requestStartedAt = this.now();
    const deadline = requestStartedAt + timeoutMs;
    let cached = await this.options.cache.get(url);
    if (cached) {
      try {
        this.decodeBody(cached.body, decode);
      } catch {
        cached = undefined;
      }
    }
    const result = (entry: CacheEntry, stale: boolean): RecordResult<T> => {
      const data = this.decodeBody(entry.body, decode);
      return {
        data,
        ...(isPartialCatalog(data) ? { partial: true } : {}),
        stale,
        savedAt: entry.savedAt,
        asOf: entry.asOf,
      };
    };
    cancelled();
    if (cached && !force && !background && isFresh(cached, this.now()))
      return result(cached, false);
    let lastError = new ApiError(
      'offline',
      phoneCopy(
        'Not saved on this iPhone yet. It will load when you’re back online.',
      ),
    );
    for (let attempt = 0; attempt <= retries; attempt++) {
      cancelled();
      const remaining = deadline - this.now();
      if (remaining <= 0) {
        // Cache work consumes the deadline too. Before a network attempt,
        // expiry is a timeout; subsequent attempts retain their last error.
        if (attempt === 0)
          lastError = new ApiError(
            'timeout',
            'The public record took too long to load.',
          );
        break;
      }
      let retryDelay = 300 * 2 ** attempt;
      const controller = new AbortController();
      const abort = () => controller.abort();
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) abort();
      const timer = setTimeout(abort, remaining);
      try {
        const response = await this.transport(url, {
          method: 'GET',
          credentials: 'omit',
          redirect: 'manual',
          signal: controller.signal,
          headers: {
            Accept: 'application/json',
            'User-Agent': catalogUserAgent(
              this.options.version,
              this.options.build,
            ),
            ...(cached?.etag && !background
              ? { 'If-None-Match': cached.etag }
              : {}),
            // A forced read (a pull to refresh) must reach the origin. The
            // transport's URLSession keeps its own HTTP cache, which answers
            // a fresh entry under ~512 KB itself, If-None-Match or not; a
            // request no-cache makes it revalidate.
            ...(force || background ? { 'Cache-Control': 'no-cache' } : {}),
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
          body =
            response.status === 304
              ? cached!.body
              : summaryStream &&
                  response.headers
                    .get('content-type')
                    ?.includes('text/event-stream')
                ? summaryStreamBody(
                    new TextDecoder().decode(
                      await this.readBytes(response, 512 * 1024),
                    ),
                  )
                : portraitMetadataLimits[path]
                  ? JSON.parse(
                      new TextDecoder().decode(
                        await this.readBytes(
                          response,
                          portraitMetadataLimits[path]!,
                        ),
                      ),
                    )
                  : await response.json();
        } catch (error) {
          if (controller.signal.aborted)
            throw new ApiError(
              'timeout',
              'The public record took too long to load.',
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
        cancelled();
        if (controller.signal.aborted)
          throw new ApiError(
            'timeout',
            'The public record took too long to load.',
          );
        try {
          this.decodeBody(body, decode);
        } catch {
          throw new ApiError(
            'invalid-data',
            'The catalog response could not be read.',
          );
        }
        const time = this.now();
        const control = response.headers.get('cache-control') ?? '';
        const age = Number(response.headers.get('age') ?? 0);
        const ttl = /no-store|no-cache/.test(control)
          ? 0
          : Math.max(
              0,
              Math.min(
                Number(/max-age=(\d+)/.exec(control)?.[1] ?? 300),
                86400,
              ) - (Number.isFinite(age) && age > 0 ? age : 0),
            );
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
        cancelled();
        // Persistence failure must not turn a successful network read into an error.
        const retained = await this.options.cache
          .put(entry, {
            requestStartedAt,
            signal,
            ...(response.status === 304
              ? { revalidatedETag: cached?.etag }
              : {}),
          })
          .catch(() => entry);
        cancelled();
        // A concurrent read can retain its freshly validated copy of this
        // exact ETag. A zero TTL requires the next read to revalidate; it
        // does not make this successful live validation an offline fallback.
        const validatedSameRecord =
          !!entry.etag &&
          retained.etag === entry.etag &&
          retained.validatedAt >= requestStartedAt;
        return result(
          retained,
          retained !== entry &&
            !isFresh(retained, this.now()) &&
            !validatedSameRecord,
        );
      } catch (error) {
        cancelled();
        lastError =
          error instanceof ApiError
            ? error
            : controller.signal.aborted
              ? new ApiError(
                  'timeout',
                  'The public record took too long to load.',
                )
              : new ApiError(
                  'offline',
                  phoneCopy(
                    'This record is not saved on this iPhone yet. It will load when you are back online.',
                  ),
                );
        // A bad export is not evidence that the last validated record went
        // away. Stop retrying and serve its original source/save dates.
        if (lastError.code === 'invalid-data') break;
        if (
          !['offline', 'timeout', 'server', 'rate-limited'].includes(
            lastError.code,
          )
        )
          throw lastError;
      } finally {
        signal?.removeEventListener('abort', abort);
        clearTimeout(timer);
      }
      if (attempt < retries) {
        if (retryDelay >= deadline - this.now()) break;
        await pause(retryDelay);
      }
    }
    const latest = await this.options.cache.get(url);
    cancelled();
    if (latest) {
      try {
        this.decodeBody(latest.body, decode);
        cached = latest;
      } catch {
        // Keep this request's known-good copy if another decoder cached a
        // body this reader cannot use.
      }
    }
    if (cached)
      return {
        ...result(cached, true),
        ...(lastError.code === 'invalid-data'
          ? { staleReason: 'unreadable' as const }
          : ['offline', 'timeout'].includes(lastError.code)
            ? {}
            : { staleReason: 'unavailable' as const }),
      };
    throw lastError;
  }
  /** Explicit submission only. Bounded Ask recovery, never a disk cache. */
  async askPost(
    path: string,
    body: object,
    signal: AbortSignal,
    on?: StreamHandlers,
  ): Promise<unknown> {
    assertAskPostPath(path);
    const url = allowedURL(this.options.origin, path);
    return postAsk(
      url,
      (requestSignal) =>
        this.transport(url, {
          method: 'POST',
          credentials: 'omit',
          redirect: 'manual',
          signal: requestSignal,
          headers: {
            'Content-Type': 'application/json',
            Accept: on ? 'text/event-stream' : 'application/json',
            'User-Agent': catalogUserAgent(
              this.options.version,
              this.options.build,
            ),
          },
          body: JSON.stringify(body),
        }),
      signal,
      on,
    );
  }
  private async readBytes(
    response: Response,
    limit: number,
  ): Promise<Uint8Array> {
    const declared = response.headers.get('content-length');
    if (
      declared !== null &&
      (!/^\d+$/.test(declared) || Number(declared) > limit)
    ) {
      await response.body?.cancel();
      throw new ApiError('invalid-data', 'Portrait response is too large.');
    }
    if (!response.body)
      throw new ApiError('invalid-data', 'Portrait response is empty.');
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > limit) {
          await reader.cancel();
          throw new ApiError('invalid-data', 'Portrait response is too large.');
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    return bytes;
  }
  async getPortrait(path: string): Promise<Uint8Array> {
    assertPortraitPath(path);
    return this.getWebp(path, portraitMaxBytes, assertPortraitBytes);
  }
  async getYearPicture(path: string): Promise<Uint8Array> {
    if (!isYearPicturePath(path))
      throw new ApiError('forbidden', 'Invalid year photograph path.');
    return this.getWebp(path, yearPictureMaxBytes, assertYearPictureBytes);
  }
  private async getWebp(
    path: string,
    maxBytes: number,
    validate: (bytes: Uint8Array) => void,
  ): Promise<Uint8Array> {
    const url = allowedURL(this.options.origin, path);
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      this.options.timeoutMs ?? 8000,
    );
    try {
      const response = await this.transport(url, {
        method: 'GET',
        credentials: 'omit',
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          Accept: 'image/webp',
          'User-Agent': catalogUserAgent(
            this.options.version,
            this.options.build,
          ),
        },
      });
      if (
        response.redirected ||
        (response.status >= 300 && response.status < 400) ||
        (response.url && response.url !== url)
      )
        throw new ApiError('forbidden', 'Portrait redirects are forbidden.');
      if (!response.ok) throw httpError(response.status);
      if (
        response.headers.get('content-type')?.split(';')[0]?.trim() !==
        'image/webp'
      )
        throw new ApiError('invalid-data', 'Portrait response is not WebP.');
      const bytes = await this.readBytes(response, maxBytes);
      validate(bytes);
      return bytes;
    } finally {
      clearTimeout(timer);
    }
  }
}

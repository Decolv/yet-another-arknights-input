import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const USER_AGENT = 'arknights-name-input-data-updater/0.1';
const RETRY_DELAYS_MS = [500, 1000, 2000];

interface CachedResponse {
  etag: string | null;
  lastModified: string | null;
  body: string;
}

export interface MediaWikiClientOptions {
  endpoint: string;
  cacheDir: string;
  minIntervalMs?: number;
  requestTimeoutMs?: number;
  fetchImpl?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
}

export class MediaWikiClient {
  static readonly #inFlight = new Map<string, Promise<unknown>>();

  readonly #endpoint: string;
  readonly #cacheDir: string;
  readonly #minIntervalMs: number;
  readonly #requestTimeoutMs: number;
  readonly #fetch: typeof fetch;
  readonly #sleep: (milliseconds: number) => Promise<void>;
  #lastStartedAt = 0;
  #previousStart: Promise<void> = Promise.resolve();

  constructor(options: MediaWikiClientOptions) {
    this.#endpoint = options.endpoint;
    this.#cacheDir = options.cacheDir;
    this.#minIntervalMs = options.minIntervalMs ?? 100;
    this.#requestTimeoutMs = options.requestTimeoutMs ?? 30_000;
    this.#fetch = options.fetchImpl ?? fetch;
    this.#sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  }

  query<T>(params: Record<string, string>): Promise<T> {
    const url = this.#buildUrl(params);
    const existing = MediaWikiClient.#inFlight.get(url);
    if (existing) return existing as Promise<T>;

    const request = this.#query<T>(url).finally(() => {
      MediaWikiClient.#inFlight.delete(url);
    });
    MediaWikiClient.#inFlight.set(url, request);
    return request;
  }

  fetchRenderedPage(title: string): Promise<string> {
    const endpoint = new URL(this.#endpoint);
    const url = new URL(
      `/rest.php/v1/page/${encodeURIComponent(title)}/html`,
      endpoint.origin,
    ).toString();
    return this.#fetchText(url);
  }

  #buildUrl(params: Record<string, string>): string {
    const url = new URL(this.#endpoint);
    const query = new Map(Object.entries(params));
    query.set('format', 'json');
    query.set('formatversion', '2');
    url.search = new URLSearchParams([...query].sort(([left], [right]) => left.localeCompare(right))).toString();
    return url.toString();
  }

  async #query<T>(url: string): Promise<T> {
    const cachePath = join(this.#cacheDir, `${createHash('sha256').update(url).digest('hex')}.json`);
    const cached = await this.#readCache(cachePath);
    const headers: Record<string, string> = { 'User-Agent': USER_AGENT };
    if (cached?.etag) headers['If-None-Match'] = cached.etag;
    if (cached?.lastModified) headers['If-Modified-Since'] = cached.lastModified;

    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
      let response: Response;
      try {
        response = await this.#startFetch(url, headers);
      } catch (error) {
        throw this.#sourceError(url, error);
      }

      if (response.status === 304) {
        if (!cached) throw this.#sourceError(url, new Error('received HTTP 304 without a cached response'));
        return this.#parseApiResponse<T>(url, cached.body);
      }

      if (response.ok) {
        const body = await response.text();
        const value = this.#parseApiResponse<T>(url, body);
        await this.#writeCache(cachePath, {
          etag: response.headers.get('etag'),
          lastModified: response.headers.get('last-modified'),
          body,
        });
        return value;
      }

      if (!this.#isRetryable(response.status) || attempt === RETRY_DELAYS_MS.length) {
        throw this.#sourceError(url, new Error(`HTTP ${response.status} ${response.statusText}`.trim()));
      }
      await this.#sleep(RETRY_DELAYS_MS[attempt]!);
    }

    throw this.#sourceError(url, new Error('exhausted retry attempts'));
  }

  async #fetchText(url: string): Promise<string> {
    const cachePath = join(this.#cacheDir, `${createHash('sha256').update(url).digest('hex')}.json`);
    const cached = await this.#readCache(cachePath);
    const headers: Record<string, string> = { 'User-Agent': USER_AGENT };
    if (cached?.etag) headers['If-None-Match'] = cached.etag;
    if (cached?.lastModified) headers['If-Modified-Since'] = cached.lastModified;

    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
      let response: Response;
      try {
        response = await this.#startFetch(url, headers);
      } catch (error) {
        throw this.#sourceError(url, error);
      }
      if (response.status === 304) {
        if (!cached) throw this.#sourceError(url, new Error('received HTTP 304 without a cached response'));
        return cached.body;
      }
      if (response.ok) {
        const body = await response.text();
        await this.#writeCache(cachePath, {
          etag: response.headers.get('etag'),
          lastModified: response.headers.get('last-modified'),
          body,
        });
        return body;
      }
      if (!this.#isRetryable(response.status) || attempt === RETRY_DELAYS_MS.length) {
        throw this.#sourceError(url, new Error(`HTTP ${response.status} ${response.statusText}`.trim()));
      }
      await this.#sleep(RETRY_DELAYS_MS[attempt]!);
    }

    throw this.#sourceError(url, new Error('exhausted retry attempts'));
  }

  async #startFetch(url: string, headers: Record<string, string>): Promise<Response> {
    const previous = this.#previousStart;
    let release: () => void = () => undefined;
    this.#previousStart = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    const wait = Math.max(0, this.#lastStartedAt + this.#minIntervalMs - Date.now());
    if (wait > 0) await this.#sleep(wait);
    this.#lastStartedAt = Date.now();
    release();
    return this.#fetch(url, {
      headers,
      signal: AbortSignal.timeout(this.#requestTimeoutMs),
    });
  }

  async #readCache(cachePath: string): Promise<CachedResponse | undefined> {
    try {
      return JSON.parse(await readFile(cachePath, 'utf8')) as CachedResponse;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw error;
    }
  }

  async #writeCache(cachePath: string, cached: CachedResponse): Promise<void> {
    await mkdir(this.#cacheDir, { recursive: true });
    await writeFile(cachePath, JSON.stringify(cached), 'utf8');
  }

  #isRetryable(status: number): boolean {
    return status === 429 || (status >= 500 && status <= 599);
  }

  #sourceError(url: string, error: unknown): Error {
    const message = error instanceof Error ? error.message : String(error);
    return new Error(`MediaWiki request failed for ${url}: ${message}`);
  }

  #apiError(value: unknown): Error | undefined {
    if (!value || typeof value !== 'object') return undefined;
    const apiError = (value as { error?: unknown }).error;
    if (!apiError || typeof apiError !== 'object') return undefined;
    const { code, info } = apiError as { code?: unknown; info?: unknown };
    return new Error(`${String(code ?? 'unknown')}: ${String(info ?? 'unknown MediaWiki API error')}`);
  }

  #parseApiResponse<T>(url: string, body: string): T {
    let value: T;
    try {
      value = JSON.parse(body) as T;
    } catch (error) {
      throw this.#sourceError(url, error);
    }
    const mediaWikiError = this.#apiError(value);
    if (mediaWikiError) throw this.#sourceError(url, mediaWikiError);
    return value;
  }
}

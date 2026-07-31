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
  fetchImpl?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
}

export class MediaWikiClient {
  static readonly #inFlight = new Map<string, Promise<unknown>>();

  readonly #endpoint: string;
  readonly #cacheDir: string;
  readonly #minIntervalMs: number;
  readonly #fetch: typeof fetch;
  readonly #sleep: (milliseconds: number) => Promise<void>;
  #lastStartedAt = 0;
  #previousStart: Promise<void> = Promise.resolve();

  constructor(options: MediaWikiClientOptions) {
    this.#endpoint = options.endpoint;
    this.#cacheDir = options.cacheDir;
    this.#minIntervalMs = options.minIntervalMs ?? 100;
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
        return JSON.parse(cached.body) as T;
      }

      if (response.ok) {
        const body = await response.text();
        let value: T;
        try {
          value = JSON.parse(body) as T;
        } catch (error) {
          throw this.#sourceError(url, error);
        }
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

  async #startFetch(url: string, headers: Record<string, string>): Promise<Response> {
    const previous = this.#previousStart;
    let release: () => void = () => undefined;
    this.#previousStart = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    const wait = Math.max(0, this.#lastStartedAt + this.#minIntervalMs - Date.now());
    if (wait > 0) await this.#sleep(wait);
    this.#lastStartedAt = Date.now();
    release();
    return this.#fetch(url, { headers });
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
}

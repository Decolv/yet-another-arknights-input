import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { MediaWikiClient } from '../../scripts/lib/mediawiki-client.js';

const cacheDir = () => mkdtemp(join(tmpdir(), 'akni-mediawiki-'));

it('deduplicates identical in-flight queries', async () => {
  const fetchImpl = vi.fn(async () => new Response('{"value":1}', {
    status: 200,
    headers: { etag: '"v1"', 'content-type': 'application/json' },
  }));
  const client = new MediaWikiClient({
    endpoint: 'https://example.test/api.php', cacheDir: await cacheDir(), fetchImpl, minIntervalMs: 0,
  });

  const [left, right] = await Promise.all([client.query({ action: 'query' }), client.query({ action: 'query' })]);

  expect(left).toEqual({ value: 1 });
  expect(right).toEqual({ value: 1 });
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});

it('uses cached JSON only after a 304 and sends If-None-Match', async () => {
  const fetchImpl = vi.fn()
    .mockResolvedValueOnce(new Response('{"value":1}', { status: 200, headers: { etag: '"v1"' } }))
    .mockResolvedValueOnce(new Response(null, { status: 304 }));
  const directory = await cacheDir();

  await new MediaWikiClient({ endpoint: 'https://example.test/api.php', cacheDir: directory, fetchImpl, minIntervalMs: 0 })
    .query({ action: 'query' });
  const result = await new MediaWikiClient({ endpoint: 'https://example.test/api.php', cacheDir: directory, fetchImpl, minIntervalMs: 0 })
    .query({ action: 'query' });

  expect(result).toEqual({ value: 1 });
  expect(fetchImpl.mock.calls[1]?.[1]?.headers).toMatchObject({ 'If-None-Match': '"v1"' });
});

it('never falls back to cached JSON after a network error', async () => {
  const fetchImpl = vi.fn()
    .mockResolvedValueOnce(new Response('{"value":1}', { status: 200, headers: { etag: '"v1"' } }))
    .mockRejectedValue(new Error('offline'));
  const directory = await cacheDir();

  await new MediaWikiClient({ endpoint: 'https://example.test/api.php', cacheDir: directory, fetchImpl, minIntervalMs: 0 })
    .query({ action: 'query' });
  await expect(new MediaWikiClient({ endpoint: 'https://example.test/api.php', cacheDir: directory, fetchImpl, minIntervalMs: 0 })
    .query({ action: 'query' })).rejects.toThrow(/offline/);
});

it.each([429, 500, 503])('retries status %s three times', async (status) => {
  const fetchImpl = vi.fn(async () => new Response('failed', { status }));
  const sleep = vi.fn<(milliseconds: number) => Promise<void>>(async () => undefined);
  const client = new MediaWikiClient({
    endpoint: 'https://example.test/api.php', cacheDir: await cacheDir(), fetchImpl, sleep, minIntervalMs: 0,
  });

  await expect(client.query({ action: 'query' })).rejects.toThrow();

  expect(fetchImpl).toHaveBeenCalledTimes(4);
  expect(sleep.mock.calls.map(([milliseconds]) => milliseconds)).toEqual([500, 1000, 2000]);
});

it('does not retry an ordinary 404', async () => {
  const fetchImpl = vi.fn(async () => new Response('missing', { status: 404 }));
  const client = new MediaWikiClient({
    endpoint: 'https://example.test/api.php', cacheDir: await cacheDir(), fetchImpl, minIntervalMs: 0,
  });

  await expect(client.query({ action: 'query' })).rejects.toThrow(/404/);
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});

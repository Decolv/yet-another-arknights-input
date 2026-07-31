import { once } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { request } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { expect, it } from 'vitest';
import { createStaticServer } from '../../scripts/serve-static.js';

interface RequestOutcome {
  kind: 'aborted' | 'end' | 'request-error' | 'response-error' | 'timeout';
  statusCode: number | undefined;
}

function requestOutcome(url: URL, method: 'GET' | 'HEAD'): Promise<RequestOutcome> {
  return new Promise((resolve) => {
    let settled = false;
    let timer: NodeJS.Timeout | undefined;
    const finish = (outcome: RequestOutcome): void => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      resolve(outcome);
    };
    const clientRequest = request(url, { method }, (response) => {
      response.resume();
      response.once('aborted', () => {
        finish({ kind: 'aborted', statusCode: response.statusCode });
      });
      response.once('end', () => {
        finish({ kind: 'end', statusCode: response.statusCode });
      });
      response.once('error', () => {
        finish({ kind: 'response-error', statusCode: response.statusCode });
      });
    });
    clientRequest.once('error', () => {
      finish({ kind: 'request-error', statusCode: undefined });
    });
    timer = setTimeout(() => {
      clientRequest.destroy();
      finish({ kind: 'timeout', statusCode: undefined });
    }, 1_000);
    clientRequest.end();
  });
}

class AsyncFailingStream extends Readable {
  #hasFailed = false;

  override _read(): void {
    if (this.#hasFailed) return;
    this.#hasFailed = true;
    queueMicrotask(() => {
      this.destroy(new Error('injected asynchronous read failure'));
    });
  }
}

it('terminates an asynchronous stream failure without crashing the server', async () => {
  const rootPath = await mkdtemp(join(tmpdir(), 'akni-static-server-'));
  await writeFile(join(rootPath, 'asset.txt'), 'served content');
  const uncaughtErrors: unknown[] = [];
  const onUncaughtError = (error: unknown): void => {
    uncaughtErrors.push(error);
  };
  process.prependListener('uncaughtException', onUncaughtError);
  const server = await createStaticServer({
    rootPath,
    openReadStream: () => new AsyncFailingStream(),
  });

  try {
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address() as AddressInfo;
    const url = new URL(`http://127.0.0.1:${address.port}/asset.txt`);

    const failedRequest = await requestOutcome(url, 'GET');
    await new Promise<void>((resolve) => setImmediate(resolve));
    const healthCheck = await requestOutcome(url, 'HEAD');

    expect(failedRequest.kind).not.toBe('timeout');
    expect(uncaughtErrors).toEqual([]);
    expect(healthCheck).toEqual({ kind: 'end', statusCode: 200 });
  } finally {
    process.removeListener('uncaughtException', onUncaughtError);
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error !== undefined) reject(error);
        else resolve();
      });
    });
    await rm(rootPath, { recursive: true, force: true });
  }
});

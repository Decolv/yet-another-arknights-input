import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = await realpath(resolve(dirname(fileURLToPath(import.meta.url)), '..'));
const port = Number(process.env.PORT ?? 4173);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer from 1 to 65535');
}

const contentTypes: Readonly<Record<string, string>> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

function isWithinRoot(path: string): boolean {
  const relativePath = relative(root, path);
  return relativePath === '' || (
    relativePath !== '..'
    && !relativePath.startsWith(`..${sep}`)
    && !isAbsolute(relativePath)
  );
}

createServer(async (request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }

  let pathname: string;
  try {
    pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname)
      .replaceAll('\\', '/');
  } catch {
    response.writeHead(400).end('Bad Request');
    return;
  }

  const segments = pathname.split('/');
  if (pathname.includes('\0') || segments.includes('..')) {
    response.writeHead(400).end('Bad Request');
    return;
  }

  const relativePath = pathname === '/' ? 'demo/index.html' : pathname.slice(1);
  const filePath = resolve(root, relativePath);
  if (!isWithinRoot(filePath)) {
    response.writeHead(400).end('Bad Request');
    return;
  }

  try {
    const realFilePath = await realpath(filePath);
    if (!isWithinRoot(realFilePath)) {
      response.writeHead(403).end('Forbidden');
      return;
    }
    const fileStat = await stat(realFilePath);
    if (!fileStat.isFile()) {
      response.writeHead(404).end('Not Found');
      return;
    }
    response.writeHead(200, {
      'Content-Length': fileStat.size,
      'Content-Type': contentTypes[extname(filePath)] ?? 'application/octet-stream',
    });
    if (request.method === 'HEAD') {
      response.end();
      return;
    }
    const stream = createReadStream(realFilePath);
    stream.once('error', () => {
      response.destroy();
    });
    stream.pipe(response);
  } catch (error) {
    const code = error instanceof Error && 'code' in error
      ? (error as NodeJS.ErrnoException).code
      : undefined;
    response.writeHead(code === 'ENOENT' ? 404 : 500).end(
      code === 'ENOENT' ? 'Not Found' : 'Internal Server Error',
    );
  }
}).listen(port, '127.0.0.1', () => {
  console.log(`Demo listening on http://127.0.0.1:${port}`);
});

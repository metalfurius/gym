#!/usr/bin/env node

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const defaultPort = 8080;

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

const rawPort = process.env.PORT ?? `${defaultPort}`;
const port = Number.parseInt(rawPort, 10);

if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  console.error(`Invalid PORT value: "${rawPort}"`);
  process.exit(1);
}

function getRequestPath(urlValue = '/') {
  const requestUrl = new URL(urlValue, 'http://localhost');
  let pathname = decodeURIComponent(requestUrl.pathname);

  if (pathname.endsWith('/')) {
    pathname += 'index.html';
  }

  return pathname;
}

function resolvePath(pathname) {
  const filePath = path.resolve(rootDir, `.${pathname}`);
  const inRoot = filePath === rootDir || filePath.startsWith(`${rootDir}${path.sep}`);
  if (!inRoot) {
    return null;
  }
  return filePath;
}

async function readRequestedFile(filePath) {
  let finalPath = filePath;
  const fileStats = await stat(finalPath);

  if (fileStats.isDirectory()) {
    finalPath = path.join(finalPath, 'index.html');
  }

  const body = await readFile(finalPath);
  return { body, finalPath };
}

const server = createServer(async (req, res) => {
  try {
    const pathname = getRequestPath(req.url ?? '/');
    const filePath = resolvePath(pathname);

    if (!filePath) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Forbidden');
      return;
    }

    const { body, finalPath } = await readRequestedFile(filePath);
    const ext = path.extname(finalPath).toLowerCase();
    const contentType = mimeTypes[ext] ?? 'application/octet-stream';

    res.writeHead(200, {
      'Cache-Control': 'no-store',
      'Content-Type': contentType,
    });
    res.end(body);
  } catch (error) {
    const notFound = error && (error.code === 'ENOENT' || error.code === 'ENOTDIR');
    const statusCode = notFound ? 404 : 500;
    const message = notFound ? 'Not Found' : 'Internal Server Error';

    if (!notFound) {
      console.error(error);
    }

    res.writeHead(statusCode, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(message);
  }
});

server.listen(port, () => {
  console.log(`Local preview running at http://localhost:${port}`);
  console.log('Press Ctrl+C to stop.');
});

server.on('error', (error) => {
  console.error('Failed to start local preview server.');
  console.error(error.message);
  process.exit(1);
});

process.on('SIGINT', () => {
  server.close(() => {
    process.exit(0);
  });
});

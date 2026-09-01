#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const zlib = require('node:zlib');

const projectRoot = path.join(__dirname, '..', '..');
const publicRoot = path.join(projectRoot, 'public');

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
};

function resolveRequestPath(requestUrl) {
  const pathname = decodeURIComponent(new URL(requestUrl, 'http://localhost').pathname);
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+|\/+$/g, '');
  const publicPrefix = `${path.resolve(publicRoot)}${path.sep}`;
  const candidates = path.extname(relative)
    ? [relative]
    : [`${relative}.html`, path.join(relative, 'index.html')];

  for (const candidate of candidates) {
    const resolved = path.resolve(publicRoot, candidate);
    if (resolved !== path.resolve(publicRoot) && !resolved.startsWith(publicPrefix)) return null;
    if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) return resolved;
  }
  return path.resolve(publicRoot, candidates[0]);
}

function walkHtml(directory = publicRoot) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return walkHtml(fullPath);
    return entry.isFile() && entry.name.endsWith('.html') ? [fullPath] : [];
  });
}

function routeForHtml(filePath) {
  const relative = path.relative(publicRoot, filePath).replaceAll(path.sep, '/');
  if (relative === 'index.html') return '/';
  if (relative.endsWith('/index.html')) return `/${relative.slice(0, -'/index.html'.length)}`;
  return `/${relative.slice(0, -'.html'.length)}`;
}

function createServer() {
  return http.createServer((request, response) => {
    const pathname = new URL(request.url || '/', 'http://localhost').pathname;
    if (pathname === '/_vercel/insights/script.js') {
      response.writeHead(200, {
        'Content-Type': 'text/javascript; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      response.end('');
      return;
    }

    const filePath = resolveRequestPath(request.url || '/');
    if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Not found');
      return;
    }

    const contentType = contentTypes[path.extname(filePath)] || 'application/octet-stream';
    const compressible = /^(application\/(json|manifest)|image\/svg\+xml|text\/)/.test(contentType);
    const acceptedEncoding = request.headers['accept-encoding'] || '';
    const headers = { 'Content-Type': contentType, Vary: 'Accept-Encoding' };
    let stream = fs.createReadStream(filePath);

    if (compressible && /\bbr\b/.test(acceptedEncoding)) {
      headers['Content-Encoding'] = 'br';
      stream = stream.pipe(zlib.createBrotliCompress());
    } else if (compressible && /\bgzip\b/.test(acceptedEncoding)) {
      headers['Content-Encoding'] = 'gzip';
      stream = stream.pipe(zlib.createGzip());
    }

    response.writeHead(200, headers);
    stream.pipe(response);
  });
}

async function requestAndValidate(baseUrl, target, expectedType, bodyCheck) {
  const response = await fetch(`${baseUrl}${target}`);
  if (!response.ok) throw new Error(`${target}: expected 200, received ${response.status}`);

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes(expectedType)) {
    throw new Error(`${target}: expected ${expectedType}, received ${contentType || 'no type'}`);
  }

  const body = await response.text();
  if (!body.length) throw new Error(`${target}: empty response`);
  if (bodyCheck && !bodyCheck(body)) throw new Error(`${target}: response body failed validation`);
}

async function main() {
  const routes = walkHtml().map(routeForHtml).sort();
  const assets = [
    ['/css/air.css', 'text/css'],
    ['/js/nav.js', 'text/javascript'],
    ['/assets/umatools-brandmark.svg', 'image/svg+xml'],
    ['/assets/skills_core.json', 'application/json'],
    ['/site.webmanifest', 'application/manifest+json'],
    ['/sw.js', 'text/javascript'],
  ];

  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    for (const route of routes) {
      await requestAndValidate(baseUrl, route, 'text/html', (body) => /<html[\s>]/i.test(body));
    }
    for (const [asset, type] of assets) {
      await requestAndValidate(baseUrl, asset, type);
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }

  console.log(
    `Route smoke test passed (${routes.length} pages, ${assets.length} critical assets).`
  );
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Route smoke test failed: ${error.message}`);
    process.exit(1);
  });
}

module.exports = { createServer };

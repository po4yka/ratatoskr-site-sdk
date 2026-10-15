import { readFile, readdir } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, join, normalize, sep } from 'node:path';

import type { Page, Release } from '../../src/index.js';

// One loopback origin that plays the sites gateway: it serves the built template, and it answers
// the delivery routes under `/_r/` from the contract fixtures, as Edge would for an approved site.
export interface StubDelivery {
  origin: string;
  // The path of every request under `/_r/`, in arrival order.
  requests: string[];
  close(): Promise<void>;
}

export interface StubOptions {
  siteDir: string;
  fixturesDir: string;
  // More pages, by the slug that serves them, as a fixture path under `fixturesDir`. The invalid
  // contract fixtures all use one slug, so a test names the slug that serves each of them.
  extraPages?: Record<string, string>;
}

interface Answer {
  status: number;
  body: string | Buffer;
  type: string;
}

interface Content {
  prefix: string;
  release: string;
  pages: Map<string, string>;
}

const jsonType = 'application/json';
const mediaTypes: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': jsonType,
};

async function loadContent(options: StubOptions): Promise<Content> {
  const { fixturesDir } = options;
  const release = await readFile(join(fixturesDir, 'sites/release/valid/minimal.json'), 'utf8');
  const pageDir = join(fixturesDir, 'sites/page/valid');
  const pages = new Map<string, string>();
  for (const name of await readdir(pageDir)) {
    const body = await readFile(join(pageDir, name), 'utf8');
    pages.set((JSON.parse(body) as Page).slug, body);
  }
  for (const [slug, path] of Object.entries(options.extraPages ?? {})) {
    pages.set(slug, await readFile(join(fixturesDir, path), 'utf8'));
  }
  const site = (JSON.parse(release) as Release).site_id;
  return { prefix: `/_r/v1/sites/${site}/content/`, release, pages };
}

function send(res: ServerResponse, answer: Answer): void {
  res.writeHead(answer.status, { 'content-type': answer.type });
  res.end(answer.body);
}

function contentBody(content: Content, path: string): string | undefined {
  const route = path.slice(content.prefix.length);
  if (route === 'release') return content.release;
  if (route.startsWith('pages/')) return content.pages.get(decodeURI(route.slice('pages/'.length)));
  return undefined;
}

async function siteFile(siteDir: string, path: string): Promise<Buffer | undefined> {
  const file = normalize(join(siteDir, path === '/' ? 'index.html' : path));
  if (!file.startsWith(siteDir + sep)) return undefined;
  return readFile(file).catch(() => undefined);
}

async function answer(
  options: StubOptions & { content: Content },
  req: IncomingMessage,
): Promise<Answer> {
  const path = new URL(req.url ?? '/', 'http://stub.invalid').pathname;
  if (path.startsWith('/_r/')) {
    const body = path.startsWith(options.content.prefix)
      ? contentBody(options.content, path)
      : undefined;
    return body === undefined
      ? { status: 404, body: '{"code":"sites.site_not_found"}', type: jsonType }
      : { status: 200, body, type: jsonType };
  }
  const file = await siteFile(options.siteDir, path);
  return file === undefined
    ? { status: 404, body: 'not found', type: 'text/plain' }
    : { status: 200, body: file, type: mediaTypes[extname(path) || '.html'] ?? 'text/plain' };
}

export async function startStubDelivery(options: StubOptions): Promise<StubDelivery> {
  const content = await loadContent(options);
  const requests: string[] = [];
  const server: Server = createServer((req, res) => {
    const path = new URL(req.url ?? '/', 'http://stub.invalid').pathname;
    if (path.startsWith('/_r/')) requests.push(path);
    void answer({ ...options, content }, req).then((a) => send(res, a));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    origin: `http://127.0.0.1:${port}`,
    requests,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

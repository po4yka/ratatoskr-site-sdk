import { readPage, readRelease } from './content.js';
import { renderHome } from './home.js';
import { renderNotFound, renderPage } from './page.js';

// `#/` is the home page and `#/<slug>` the page view of a slug. A slug must have the grammar of the
// contract `Slug`, so a `.`, `..` or empty segment never reaches the path of a request, where URL
// normalisation would turn it into another route of the delivery API.
const slugPattern = /^[a-z0-9-]+(?:\/[a-z0-9-]+)*$/;

type Route = { kind: 'home' } | { kind: 'page'; slug: string } | { kind: 'not-found' };

function routeOf(hash: string): Route {
  if (!hash.startsWith('#/') || hash === '#/') return { kind: 'home' };
  const slug = hash.slice(2);
  return slug.length <= 1024 && slugPattern.test(slug)
    ? { kind: 'page', slug }
    : { kind: 'not-found' };
}

async function view(): Promise<Node> {
  const route = routeOf(window.location.hash);
  if (route.kind === 'home') return renderHome(await readRelease());
  if (route.kind === 'page') return renderPage(await readPage(route.slug));
  return renderNotFound();
}

async function show(root: Element): Promise<void> {
  try {
    root.replaceChildren(await view());
  } catch (error) {
    const message = document.createElement('p');
    message.textContent = error instanceof Error ? error.message : 'The site cannot load.';
    root.replaceChildren(message);
  }
}

const app = document.querySelector('#app');
if (app !== null) {
  window.addEventListener('hashchange', () => void show(app));
  void show(app);
}

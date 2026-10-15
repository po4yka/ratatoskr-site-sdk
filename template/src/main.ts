import { readPage, readRelease } from './content.js';
import { renderHome } from './home.js';
import { renderPage } from './page.js';

// `#/` is the home page and `#/<slug>` the page view of a slug.
function slugOf(hash: string): string | undefined {
  const slug = hash.startsWith('#/') ? hash.slice(2) : '';
  return slug === '' ? undefined : slug;
}

async function view(): Promise<Node> {
  const slug = slugOf(window.location.hash);
  return slug === undefined ? renderHome(await readRelease()) : renderPage(await readPage(slug));
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

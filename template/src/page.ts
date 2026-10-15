import type { Page } from '@ratatoskr/site-sdk';

import { renderNodes } from './render.js';

// The page view: a link back to the home page, and the page body rendered from its `ast`.
export function renderPage(page: Page): Node {
  document.title = page.title;
  const home = document.createElement('a');
  home.href = '#/';
  home.textContent = 'Home';
  const nav = document.createElement('nav');
  nav.append(home);
  const article = document.createElement('article');
  article.append(...renderNodes(page.ast.children));
  const view = document.createDocumentFragment();
  view.append(nav, article);
  return view;
}

// The view for a route that names no page that the template can read.
export function renderNotFound(): Node {
  const message = document.createElement('p');
  message.textContent = 'This page does not exist.';
  return message;
}

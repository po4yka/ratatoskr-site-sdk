import type { Release } from '@ratatoskr/site-sdk';

// The path of the page view of a slug. The template routes by the URL fragment, so a static host
// needs no fallback rule for a page.
export function pageHref(slug: string): string {
  return `#/${slug}`;
}

// The home page: every page of the current release, as a link to its page view.
export function renderHome(release: Release): Node {
  const list = document.createElement('ul');
  for (const page of release.pages) {
    const link = document.createElement('a');
    link.href = pageHref(page.slug);
    link.textContent = page.title;
    const item = document.createElement('li');
    item.append(link);
    list.append(item);
  }
  return list;
}

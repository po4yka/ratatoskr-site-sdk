import type { EmbedTarget, PageNode } from '@ratatoskr/site-sdk';

import { assetUrl } from './content.js';
import { pageHref } from './home.js';

// Renders the `ast` of a page (contract `sites/page.v1`) with DOM nodes. Text is set as text, and
// an address only as the value of `href` or `src`. The `html` member of the page is never used, so
// no content of a page is parsed as markup here.
type NodeType = PageNode['type'];
type NodeOf<K extends NodeType> = Extract<PageNode, { type: K }>;
type Renderers = { [K in NodeType]: (node: NodeOf<K>) => Node };

export function renderNodes(nodes: readonly PageNode[]): Node[] {
  return nodes.map(renderNode);
}

function element(tag: string, children: readonly PageNode[] = []): HTMLElement {
  const created = document.createElement(tag);
  created.append(...renderNodes(children));
  return created;
}

function textElement(tag: string, text: string): HTMLElement {
  const created = document.createElement(tag);
  created.textContent = text;
  return created;
}

function link(href: string, children: readonly PageNode[]): HTMLAnchorElement {
  const anchor = element('a', children) as HTMLAnchorElement;
  anchor.href = href;
  return anchor;
}

function callout(node: NodeOf<'callout'>): Node {
  const folds = node.fold !== undefined && node.fold !== null;
  const box = document.createElement(folds ? 'details' : 'div');
  box.className = 'callout';
  box.dataset['callout'] = node.kind;
  if (node.fold === 'open') box.setAttribute('open', '');
  const titleTag = folds ? 'summary' : 'div';
  const title = node.title ? element(titleTag, node.title) : textElement(titleTag, node.kind);
  title.className = 'callout-title';
  const content = element('div', node.children);
  content.className = 'callout-content';
  box.append(title, content);
  return box;
}

function list(node: NodeOf<'list'>): Node {
  const created = element(node.ordered ? 'ol' : 'ul', node.children);
  if (node.ordered && typeof node.start === 'number')
    created.setAttribute('start', `${node.start}`);
  return created;
}

function listItem(node: NodeOf<'listItem'>): Node {
  const item = element('li', node.children);
  if (typeof node.checked === 'boolean') {
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = node.checked;
    box.disabled = true;
    item.prepend(box);
  }
  return item;
}

function table(node: NodeOf<'table'>): Node {
  const created = document.createElement('table');
  node.children.forEach((row, index) => {
    const cells = row.type === 'tableRow' ? row.children : [];
    const tr = document.createElement('tr');
    for (const cell of cells) {
      tr.append(element(index === 0 ? 'th' : 'td', cell.type === 'tableCell' ? cell.children : []));
    }
    created.append(tr);
  });
  return created;
}

function code(node: NodeOf<'code'>): Node {
  const inner = textElement('code', node.value);
  if (node.lang) inner.className = `language-${node.lang}`;
  const pre = document.createElement('pre');
  pre.append(inner);
  return pre;
}

function image(node: NodeOf<'image'>): Node {
  const created = document.createElement('img');
  created.src = node.url;
  created.alt = node.alt ?? '';
  if (node.title) created.title = node.title;
  return created;
}

function embed(target: EmbedTarget): Node {
  if (target.kind === 'page') return textElementLink(pageHref(target.slug), target.slug);
  if (!target.media_type.startsWith('image/')) {
    return textElementLink(assetUrl(target.sha256), target.alt ?? 'Attachment');
  }
  const created = document.createElement('img');
  created.src = assetUrl(target.sha256);
  created.alt = target.alt ?? '';
  return created;
}

function textElementLink(href: string, text: string): Node {
  const anchor = textElement('a', text) as HTMLAnchorElement;
  anchor.href = href;
  return anchor;
}

const renderers: Renderers = {
  paragraph: (node) => element('p', node.children),
  heading: (node) => element(`h${Math.min(Math.max(node.depth, 1), 6)}`, node.children),
  thematicBreak: () => document.createElement('hr'),
  blockquote: (node) => element('blockquote', node.children),
  callout,
  list,
  listItem,
  table,
  tableRow: (node) => element('tr', node.children),
  tableCell: (node) => element('td', node.children),
  code,
  text: (node) => document.createTextNode(node.value),
  emphasis: (node) => element('em', node.children),
  strong: (node) => element('strong', node.children),
  delete: (node) => element('del', node.children),
  highlight: (node) => element('mark', node.children),
  inlineCode: (node) => textElement('code', node.value),
  break: () => document.createElement('br'),
  link: (node) => {
    const anchor = link(node.url, node.children);
    if (node.title) anchor.title = node.title;
    return anchor;
  },
  image,
  wikiLink: (node) => link(pageHref(node.slug), node.children),
  embed: (node) => embed(node.target),
};

export function renderNode(node: PageNode): Node {
  // A node type that a later contract adds and this template does not know shows nothing.
  const render = renderers[node.type] as ((node: PageNode) => Node) | undefined;
  return render ? render(node) : document.createTextNode('');
}

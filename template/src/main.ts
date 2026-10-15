import { readRelease } from './content.js';
import { renderHome } from './home.js';

const app = document.querySelector('#app');

async function show(root: Element): Promise<void> {
  try {
    root.replaceChildren(renderHome(await readRelease()));
  } catch (error) {
    const message = document.createElement('p');
    message.textContent = error instanceof Error ? error.message : 'The site cannot load.';
    root.replaceChildren(message);
  }
}

if (app !== null) {
  void show(app);
}

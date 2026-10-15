import { completeSignIn } from '@ratatoskr/site-sdk';

// The script of the reserved page `/.ratatoskr/sign-in/`. The SDK removes the code from the
// address before it posts the code, then this page goes to the path that the owner came from.
// `replace` keeps the callback page out of the history.
const app = document.querySelector('#app');

completeSignIn({ site: __RATATOSKR_SITE_ID__, baseUrl: '/_r' }).then(
  (opened) => window.location.replace(opened.return_path),
  () => {
    if (app !== null) app.textContent = 'The sign-in did not work. Start it again from the site.';
  },
);

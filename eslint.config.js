import js from '@eslint/js';
import { globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Size limits are the fleet TypeScript standard from ratatoskr-workspace/docs/QUALITY_GATES.md
// (the same block as ratatoskr-obsidian-plugin/eslint.config.js). Every number is severity error,
// so a finding fails the gate. Raising one is a documented measurement, never a silent bump.
const sizeLimits = {
  rules: {
    'max-lines': ['error', { max: 200, skipBlankLines: true, skipComments: true }],
    'max-lines-per-function': ['error', { max: 120, skipBlankLines: true, skipComments: true }],
    complexity: ['error', 8],
    'max-params': ['error', 2],
  },
};

export default tseslint.config(
  // `src/contracts/` is vendored byte-exact from ratatoskr-contracts: `npm run contracts:check`
  // owns it, and an edit there is a drift from the pinned contracts. `dist/` is build output.
  globalIgnores(['node_modules/', '**/dist/', 'coverage/', 'src/contracts/']),
  js.configs.recommended,
  ...tseslint.configs.strict,
  sizeLimits,
  {
    // Plain Node scripts: not type-checked, so they need real global declarations.
    files: ['scripts/**/*.mjs', '*.config.js', '*.config.mjs'],
    languageOptions: { globals: globals.node },
  },
);

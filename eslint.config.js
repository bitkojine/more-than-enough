import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['site/**', 'node_modules/**', 'packs/**', 'structurizr/**', 'src/vendor/**'] },
  {
    files: ['src/**/*.js', 'wiki/**/*.js', 'server/src/**/*.js', 'scripts/**/*.mjs', 'eslint.config.js'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    rules: {
      ...js.configs.recommended.rules,
      'no-redeclare': ['error', { builtinGlobals: false }],
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none', varsIgnorePattern: '^_' }],
      complexity: ['warn', 15],
      'max-depth': ['warn', 4],
      'max-params': ['warn', 5],
      'max-lines-per-function': ['warn', { max: 120, skipBlankLines: true, skipComments: true }]
    }
  },
  { files: ['src/game/**/*.js', 'src/i18n/**/*.js', 'wiki/**/*.js'], languageOptions: { globals: globals.browser } },
  { files: ['src/core/**/*.js', 'src/net/**/*.js'], languageOptions: { globals: { atob: 'readonly', btoa: 'readonly', crypto: 'readonly', TextEncoder: 'readonly', TextDecoder: 'readonly' } } },
  { files: ['src/net/config.js'], languageOptions: { globals: { location: 'readonly', URLSearchParams: 'readonly' } } },
  { files: ['server/src/**/*.js'], languageOptions: { globals: { ...globals.worker, ...globals.node, WebSocketPair: 'readonly', WebSocketRequestResponsePair: 'readonly' } } },
  { files: ['scripts/**/*.mjs', 'eslint.config.js'], languageOptions: { globals: globals.node } }
];

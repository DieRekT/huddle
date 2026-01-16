import js from '@eslint/js';
import globals from 'globals';

export default [
  // Ignore generated / vendored content
  {
    ignores: [
      'node_modules/**',
      '.tmp/**',
      '.chrome-e2e/**',
      'public/vendor/**',
      '.backup/**',
      // Appears to be an embedded/duplicated project folder; don’t lint it by default.
      'projects/**'
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-console': 'off',
      // This repo intentionally uses empty catches for best-effort cleanup and optional browser APIs.
      'no-empty': ['warn', { allowEmptyCatch: true }],
      // Control-char stripping is intentional (e.g. sanitizeName()).
      'no-control-regex': 'off',
    },
  },
  // Node / server-side JS
  {
    files: ['server.js', 'audio_convert.js', 'scripts/**/*.js', 'tools/**/*.js', 'test*.js', 'src/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  // Puppeteer runs in Node, but embeds functions evaluated in the browser context.
  {
    files: ['scripts/chrome-e2e.js'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
        MouseEvent: 'readonly',
      },
    },
  },
  // Browser JS
  {
    files: ['public/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.browser,
        // Some Web APIs aren’t included in globals.browser (or vary by version)
        MediaRecorder: 'readonly',
        AudioContext: 'readonly',
        webkitAudioContext: 'readonly',
      },
    },
  },
];



// Flat ESLint config for the STMS monorepo (AGENTS.md §1-2).
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      'server/public/**',
      '**/coverage/**',
      'server/data/**',
      'server/outbox/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Browser code: React rules + browser globals
    files: ['client/src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
    },
  },
  {
    // Node code: node globals
    files: ['server/**/*.ts', 'shared/**/*.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  {
    // Seed/dev/CLI scripts and test helpers may print to stdout
    files: [
      'server/src/db/seed.ts',
      'server/src/db/migrate-cli.ts',
      'server/src/index.ts',
      '**/tests/**/*.ts',
      '**/*.test.{ts,tsx}',
    ],
    rules: { 'no-console': 'off' },
  },
  prettier,
);

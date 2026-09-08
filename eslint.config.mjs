import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import importPlugin from 'eslint-plugin-import';
import nextPlugin from '@next/eslint-plugin-next';
import globals from 'globals';

/**
 * The layer rule (ARCHITECTURE R1.1). Imports flow strictly downward:
 *
 *   app -> services -> db -> domain
 *   app -> ui -> domain
 *
 * `domain` imports nothing internal. A violation fails `npm run lint`,
 * which is what makes the layering a gate rather than a convention.
 */
const layerZones = [
  {
    target: './src/domain',
    from: ['./src/db', './src/services', './src/payments', './src/ui', './app', './db'],
    message: 'src/domain is pure: it may not import from any layer below it (R1.1).',
  },
  {
    target: './src/db',
    from: ['./src/services', './src/payments', './src/ui', './app'],
    message: 'src/db may only import from src/domain (R1.1).',
  },
  {
    target: './src/payments',
    from: ['./src/db', './src/services', './src/ui', './app'],
    message: 'src/payments may only import from src/domain (R1.1).',
  },
  {
    target: './src/services',
    from: ['./src/ui', './app'],
    message: 'src/services may not import from the presentation layer (R1.1).',
  },
  {
    target: './src/ui',
    from: ['./src/db', './src/services', './src/payments', './app'],
    message: 'src/ui is presentational: props in, JSX out. It may only import src/domain (R1.1).',
  },
];

export default tseslint.config(
  {
    ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts', 'coverage/**', 'supabase/.temp/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx,mjs}'],
    plugins: { import: importPlugin, '@next/next': nextPlugin },
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: {
      'import/resolver': {
        typescript: { project: './tsconfig.json' },
        node: true,
      },
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      'import/no-restricted-paths': ['error', { zones: layerZones }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-restricted-syntax': [
        'error',
        {
          // R5.2 — transaction-mode pgBouncer cannot use named prepared statements.
          selector: "Property[key.name='name'][parent.parent.callee.property.name='query']",
          message: 'Never pass `name:` to a pg query (R5.2).',
        },
      ],
    },
  },
  {
    // Tests deliberately reach across layers to set up and assert database state.
    files: ['tests/**/*.ts', 'db/**/*.ts'],
    rules: { 'import/no-restricted-paths': 'off' },
  },
);

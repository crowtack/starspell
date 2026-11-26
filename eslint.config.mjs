import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';

const tsStrictTypeChecked = tseslint.configs.strictTypeChecked.map((config) => ({
  ...config,
  files: ['apps/*/src/**/*.ts', 'packages/*/src/**/*.ts'],
}));

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      '**/node_modules/**',
      'reference/**',
      'starspell-agent-pack/**',
      'starspell.html',
    ],
  },
  js.configs.recommended,
  ...tsStrictTypeChecked,
  {
    files: ['apps/*/src/**/*.ts', 'packages/*/src/**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['scripts/**/*.mjs', '*.mjs'],
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
      },
    },
  },
  eslintConfigPrettier,
);

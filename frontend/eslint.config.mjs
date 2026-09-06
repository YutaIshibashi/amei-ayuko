import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

export default [
  { ignores: ['out/**', '.next/**', 'node_modules/**'] },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      // next/image needs a server-side optimiser, which Lolipop does not run.
      // Images are pre-sized WebP produced by the sync/upload pipelines and
      // every <img> in this codebase carries explicit width/height + loading,
      // so the rule only produces noise here.
      '@next/next/no-img-element': 'off',
    },
  },
];

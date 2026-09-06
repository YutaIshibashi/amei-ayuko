import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypeScript from 'eslint-config-next/typescript';

/**
 * ESLint flat config.
 *
 * eslint-config-next 16 ships native flat configs, so the FlatCompat shim (and
 * the `@eslint/eslintrc` dependency behind it) is gone — these are imported
 * directly. Linting runs through the ESLint CLI: `next lint` was removed in
 * Next.js 16.
 */
const config = [
  { ignores: ['out/**', '.next/**', 'node_modules/**', 'next-env.d.ts'] },

  ...nextCoreWebVitals,
  ...nextTypeScript,

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

export default config;

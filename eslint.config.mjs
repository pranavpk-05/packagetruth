import tseslint from 'typescript-eslint';
export default [
  { ignores: ['**/dist/**', '**/.next/**', '**/next-env.d.ts', '**/test-results/**', '**/playwright-report/**'] },
  ...tseslint.configs.recommended,
];

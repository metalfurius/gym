import js from '@eslint/js';
import stylistic from '@stylistic/eslint-plugin';
import globals from 'globals';
import { defineConfig } from 'eslint/config';

export default defineConfig([
    {
        name: 'gym/generated-output-ignores',
        ignores: ['**/node_modules/**', '**/coverage/**', '**/dist/**', '**/build/**', '**/.git/**', 'tmp/**', 'temp/**', '**/*.min.js'],
    },
    {
        ...js.configs.recommended,
        name: 'gym/javascript-quality',
        files: ['**/*.{js,cjs,mjs}'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: { ...globals.browser, ...globals.node, ...globals.jest, firebase: 'readonly', Chart: 'readonly' },
        },
        linterOptions: { reportUnusedDisableDirectives: 'error' },
        plugins: { '@stylistic': stylistic },
        rules: {
            ...js.configs.recommended.rules,
            'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
            'no-console': 'off',
            'no-debugger': 'error',
            'no-dupe-else-if': 'warn',
            eqeqeq: ['error', 'always'],
            curly: ['error', 'multi-line'],
            'no-eval': 'error',
            'no-implied-eval': 'error',
            '@stylistic/semi': ['warn', 'always'],
            '@stylistic/quotes': ['warn', 'single', { avoidEscape: true, allowTemplateLiterals: 'always' }],
            '@stylistic/indent': ['warn', 4, { SwitchCase: 1 }],
            '@stylistic/comma-dangle': ['warn', 'only-multiline'],
            'prefer-const': 'warn',
            'no-var': 'warn',
            '@stylistic/arrow-spacing': ['warn', { before: true, after: true }],
        },
    },
    { name: 'gym/commonjs', files: ['**/*.cjs'], languageOptions: { sourceType: 'commonjs' } },
]);

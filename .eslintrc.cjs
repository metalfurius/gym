module.exports = {
  env: {
    browser: true,
    es2021: true,
    node: true,
    jest: true,
  },
  extends: [
    'eslint:recommended',
  ],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  rules: {
    // Error prevention
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    'no-console': 'off', // Allow console for this app
    'no-debugger': 'error',
    'no-dupe-else-if': 'warn', // Warn instead of error for pre-existing issues
    
    // Best practices
    'eqeqeq': ['error', 'always'],
    'curly': ['error', 'multi-line'],
    'no-eval': 'error',
    'no-implied-eval': 'error',
    
    // Style (relaxed for existing codebase - uses 4-space indentation)
    'semi': ['warn', 'always'],
    'quotes': ['warn', 'single', { avoidEscape: true, allowTemplateLiterals: true }],
    'indent': ['warn', 4, { SwitchCase: 1 }],
    'comma-dangle': ['warn', 'only-multiline'],
    
    // ES6+
    'prefer-const': 'warn',
    'no-var': 'warn',
    'arrow-spacing': ['warn', { before: true, after: true }],
  },
  ignorePatterns: [
    'node_modules/',
    'coverage/',
    'dist/',
    '*.min.js',
  ],
  overrides: [
    {
      files: ['*.cjs'],
      parserOptions: {
        sourceType: 'script',
      },
    },
  ],
  globals: {
    // Firebase globals loaded via CDN
    'firebase': 'readonly',
    // Chart.js loaded via CDN
    'Chart': 'readonly',
  },
};

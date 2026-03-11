module.exports = {
    root: true,
    env: {
        browser: true,
        es2022: true,
        node: true,
    },
    parser: '@typescript-eslint/parser',
    parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: {
            jsx: true,
        },
    },
    plugins: ['@typescript-eslint'],
    ignorePatterns: [
        '**/dist/**',
        '**/node_modules/**',
        'packages/addin/wps-addin/**',
        'packages/desktop/**',
    ],
    overrides: [
        {
            files: ['packages/addin/src/**/*.{ts,tsx}', 'packages/server/src/**/*.ts'],
            rules: {},
        },
    ],
};

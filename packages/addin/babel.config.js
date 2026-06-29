module.exports = {
    presets: [
        [
            '@babel/preset-env',
            {
                targets: { ie: '11', safari: '13' }, // WPS CEF can lag far behind desktop browsers
                useBuiltIns: 'usage',              // 按需注入 polyfill
                corejs: { version: 3, proposals: false },
                modules: false,                    // 保留 ESModule 让 webpack tree-shake
            },
        ],
        '@babel/preset-typescript',
        [
            '@babel/preset-react',
            { runtime: 'automatic' },              // 对应 tsconfig 的 jsx: react-jsx
        ],
    ],
};

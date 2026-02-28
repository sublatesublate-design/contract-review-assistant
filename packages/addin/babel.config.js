module.exports = {
    presets: [
        [
            '@babel/preset-env',
            {
                targets: 'chrome >= 69',          // WPS CEF 内核兼容
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

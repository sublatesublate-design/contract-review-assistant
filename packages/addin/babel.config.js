module.exports = {
    presets: [
        [
            '@babel/preset-env',
            {
                targets: 'chrome >= 69, safari >= 13', // WPS/Word CEF + Mac WKWebView
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

const path = require('path');
const fs = require('fs');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = (env, argv) => {
    const isDev = argv.mode === 'development';

    return {
        entry: {
            taskpane: './src/index.tsx',
        },
        output: {
            path: path.resolve(__dirname, 'dist'),
            filename: '[name].[contenthash].js',
            clean: true,
        },
        resolve: {
            extensions: ['.tsx', '.ts', '.js', '.jsx'],
            alias: {
                '@office': path.resolve(__dirname, 'src/office'),
                '@services': path.resolve(__dirname, 'src/services'),
                '@store': path.resolve(__dirname, 'src/store'),
                '@components': path.resolve(__dirname, 'src/taskpane/components'),
                '@types': path.resolve(__dirname, 'src/types'),
            },
        },
        module: {
            rules: [
                {
                    test: /\.tsx?$/,
                    use: 'babel-loader',
                    exclude: /node_modules/,
                },
                {
                    test: /\.css$/,
                    use: [
                        isDev ? 'style-loader' : MiniCssExtractPlugin.loader,
                        'css-loader',
                        'postcss-loader',
                    ],
                },
                {
                    test: /\.(png|jpg|jpeg|gif|svg)$/i,
                    type: 'asset/resource',
                },
            ],
        },
        plugins: [
            new HtmlWebpackPlugin({
                template: './taskpane.html',
                filename: 'taskpane.html',
                chunks: ['taskpane'],
            }),
            new HtmlWebpackPlugin({
                template: './taskpane-wps.html',
                filename: 'taskpane-wps.html',
                chunks: ['taskpane'],
            }),
            new MiniCssExtractPlugin({
                filename: '[name].[contenthash].css',
            }),
            new CopyPlugin({
                patterns: [{ from: 'assets', to: 'assets', noErrorOnMissing: true }],
            }),
        ],
        devServer: {
            port: 3000,
            hot: true,
            compress: false, // 禁用 gzip 压缩，防止 SSE 流式响应被缓冲（Mac Word WKWebView）
            // HTTPS：优先使用 office-addin-dev-certs 的受信证书，缺失时回退到 webpack 自签证书
            server: (() => {
                const home = process.env.USERPROFILE || process.env.HOME;
                const keyPath = path.join(home, '.office-addin-dev-certs', 'localhost.key');
                const certPath = path.join(home, '.office-addin-dev-certs', 'localhost.crt');
                if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
                    return { type: 'https', options: { key: keyPath, cert: certPath } };
                }
                return 'https'; // webpack 自动生成自签证书
            })(),
            static: [
                { directory: path.join(__dirname, 'public') },
                { directory: path.join(__dirname, 'dist') },
            ],
            proxy: {
                '/api': {
                    target: 'http://localhost:3001',
                    changeOrigin: true,
                    secure: false,
                },
            },
            headers: {
                'Access-Control-Allow-Origin': '*',
            },
            historyApiFallback: {
                rewrites: [{ from: /taskpane/, to: '/taskpane.html' }],
            },
        },
        devtool: isDev ? 'source-map' : false,
        optimization: {
            splitChunks: {
                chunks: 'all',
            },
        },
    };
};

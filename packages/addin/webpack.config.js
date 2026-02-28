const path = require('path');
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
            // Word 插件要求 HTTPS，使用 office-addin-dev-certs 安装的系统信任证书
            server: {
                type: 'https',
                options: {
                    key: require('path').join(process.env.USERPROFILE || process.env.HOME, '.office-addin-dev-certs', 'localhost.key'),
                    cert: require('path').join(process.env.USERPROFILE || process.env.HOME, '.office-addin-dev-certs', 'localhost.crt'),
                },
            },
            static: [
                { directory: path.join(__dirname, 'public') },
                { directory: path.join(__dirname, 'dist') },
            ],
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

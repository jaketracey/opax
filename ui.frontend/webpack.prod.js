const { merge } = require('webpack-merge');
const TerserPlugin = require('terser-webpack-plugin');
const CssMinimizerPlugin = require('css-minimizer-webpack-plugin');
const common = require('./webpack.common.js');
var WebpackObfuscator = require('webpack-obfuscator');

module.exports = merge(common, {
    mode: 'development',
    optimization: {
        minimize: true,
        minimizer: [
            new TerserPlugin(),
            new CssMinimizerPlugin({
                minimizerOptions: {
                    preset: ['default', {
                        calc: true,
                        convertValues: true,
                        discardComments: {
                            removeAll: true
                        },
                        discardDuplicates: true,
                        discardEmpty: true,
                        mergeRules: true,
                        normalizeCharset: true,
                        reduceInitial: true, // This is since IE11 does not support the value Initial
                        svgo: true
                    }],
                }
            }),
        ],
        splitChunks: {
            cacheGroups: {
                main: {
                    chunks: 'all',
                    name: 'site',
                    test: 'main',
                    enforce: true
                }
            }
        },
    },
    plugins: [
        // new WebpackObfuscator ({
        //     rotateStringArray: true,
        // })
    ],
    performance: { hints: false },

});

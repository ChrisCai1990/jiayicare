// Fail before bundling if a worktree accidentally resolves the App's React 19.
const requiredReact = require('../package.json').dependencies.react;
if (require('react/package.json').version !== requiredReact || require('react-dom/package.json').version !== requiredReact) {
  throw new Error(`小程序必须使用React ${requiredReact}；当前依赖解析错误，禁止构建上传。`);
}
const config = {
  projectName: 'miniprogram',
  date: '2026-7-17',
  designWidth: 750,
  deviceRatio: {
    640: 2.34 / 2,
    750: 1,
    828: 1.81 / 2,
  },
  sourceRoot: 'src',
  outputRoot: 'dist',
  plugins: [],
  defineConstants: {},
  copy: {
    patterns: [],
    options: {},
  },
  framework: 'react',
  compiler: 'webpack5',
  cache: {
    enable: false,
  },
  mini: {
    // Shared sources outside src must also pass through the mini-program Babel pipeline.
    compile: {
      include: [require('path').resolve(__dirname, '../../app/src/utils/healthFundPreview.js')],
    },
    postcss: {
      pxtransform: {
        enable: true,
        config: {},
      },
      url: {
        enable: true,
        config: {
          limit: 1024,
        },
      },
      cssModules: {
        enable: false,
      },
    },
    webpackChain(chain) {
      // Taro 的 reconciler 与页面代码必须共享同一个 React 内部单例。
      // 使用精确文件别名，避免上层工作区的 React 或 pnpm 的另一份副本
      // 被构建插件带入，造成 ReactCurrentBatchConfig/Dispatcher 缺失。
      const taroReactPackage = require.resolve('@tarojs/react/package.json');
      chain.resolve.alias
        .set('react$', require.resolve('react'))
        .set('react/jsx-runtime$', require.resolve('react/jsx-runtime'))
        .set('react/jsx-dev-runtime$', require.resolve('react/jsx-dev-runtime'))
        .set(
          'react-reconciler$',
          require.resolve('react-reconciler', { paths: [taroReactPackage] }),
        );
    },
  },
  h5: {
    publicPath: '/',
    staticDirectory: 'static',
    output: {
      filename: 'js/[name].[hash:8].js',
      chunkFilename: 'js/[name].[chunkhash:8].js',
    },
    miniCssExtractPluginOption: {
      ignoreOrder: true,
      filename: 'css/[name].[hash].css',
      chunkFilename: 'css/[name].[chunkhash].css',
    },
    postcss: {
      autoprefixer: {
        enable: true,
        config: {},
      },
      cssModules: {
        enable: false,
      },
    },
  },
};

module.exports = function (merge) {
  if (process.env.NODE_ENV === 'development') {
    return merge({}, config, require('./dev'));
  }
  return merge({}, config, require('./prod'));
};

const path = require('path');

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
    // 拆出的 react cacheGroup（见下方 webpackChain 注释）产生了独立的
    // react.js chunk，但 Taro 默认只把 ['runtime','vendors','taro','common']
    // 自动 require 进小程序入口文件，新增的 react chunk 不在这个白名单里，
    // 不会被执行，等于白拆分——必须显式把它加进去。
    commonChunks(defaultCommonChunks) {
      return [...defaultCommonChunks, 'react'];
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
      // @tarojs/react 内部把 react-reconciler 锁定在自己的私有 node_modules 里，
      // 那份 react-reconciler 又依赖它旁边的私有 react 拷贝（18.3.1）。
      // 如果页面代码 import 'react' 解析到别的物理文件（哪怕版本号相同），
      // 会产生两个独立的 React 模块实例，ReactCurrentDispatcher 单例对不上，
      // useState 等 hooks 读到 dispatcher.current === null。
      // 因此 alias 必须指向 @tarojs/react 自己实际使用的那一份 react，而不是
      // miniprogram 顶层的 node_modules/react。
      // 小程序（weapp）编译目标不使用 react-dom，只对齐 react 即可。
      const taroReactDir = path.dirname(require.resolve('@tarojs/react/package.json'));
      chain.resolve.alias.set('react', path.resolve(taroReactDir, 'node_modules/react'));

      // 光对齐 alias 还不够：Taro 内置的 taro cacheGroup 用
      // /@tarojs[\\/][a-z]+/ 匹配 module.context，而 react-reconciler 恰好
      // 装在 node_modules/@tarojs/react/node_modules/react-reconciler 下，
      // context 路径里含有 "@tarojs/react"，被误命中优先级100的 taro 分组，
      // 连带它私有依赖的那份 react 一起打进 taro.js；页面代码 import 'react'
      // 走的是普通 vendors 分组，落进 vendors.js —— 同一个模块被打包成两份
      // 物理独立的 chunk，运行时互不相通，ReactCurrentDispatcher 单例分裂，
      // useState 读到 null。用更高优先级的 react 分组抢在 taro 分组之前
      // 拦截所有 react/react-dom/react-reconciler，确保只有一份实例。
      const existing = chain.optimization.get('splitChunks') || {};
      chain.optimization.splitChunks(Object.assign({}, existing, {
        cacheGroups: Object.assign({}, existing.cacheGroups, {
          react: {
            name: 'react',
            test: /[\\/]node_modules[\\/](react|react-dom|react-reconciler)[\\/]/,
            priority: 200,
            chunks: 'all',
            enforce: true,
          },
        }),
      }));
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

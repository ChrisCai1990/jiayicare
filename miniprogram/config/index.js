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
      // 那份 react-reconciler 又依赖它旁边的私有 react 拷贝（版本号相同，但是
      // 不同物理文件）。页面代码 import 'react' 默认解析到另一份，产生两个
      // 独立的 React 模块实例，ReactCurrentDispatcher 单例对不上，useState
      // 等 hooks 读到 dispatcher.current === null。
      // 只做 alias 对齐，不做 chunk 拆分——chunk 拆分会打乱 Taro 内置的
      // commonChunks 加载顺序，引发另一个运行时错误，得不偿失。
      const taroReactDir = path.dirname(require.resolve('@tarojs/react/package.json'));
      chain.resolve.alias.set('react', path.resolve(taroReactDir, 'node_modules/react'));
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

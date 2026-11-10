module.exports = {
  mini: {},
  h5: {
    /**
     * WebpackModule: optimize.minimizer 及第三方插件配置
     */
    webpackChain(chain) {
      // An unused chain plugin without .use() makes webpack-chain reject the build.
      chain.plugins.delete('webpack-bundle-analyzer');
    },
  },
};

module.exports = {
  mini: {},
  h5: {
    /**
     * WebpackModule: optimize.minimizer 及第三方插件配置
     */
    webpackChain(chain) {
      chain.merge({
        plugin: {
          'webpack-bundle-analyzer': {
            enabled: false,
          },
        },
      });
    },
  },
};

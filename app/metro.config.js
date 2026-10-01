const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// The monorepo also contains another React version. React Native's renderer
// requires every React import in this app bundle to resolve to React 19.1.0.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'react' || moduleName.startsWith('react/')) {
    return {
      type: 'sourceFile',
      filePath: require.resolve(moduleName, { paths: [__dirname] }),
    };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;

module.exports = ({ config }) => {
  const appid = process.env.EXPO_PUBLIC_WECHAT_APP_APPID || '';
  const link = process.env.EXPO_PUBLIC_WECHAT_UNIVERSAL_LINK || '';
  const enabled = process.env.EXPO_PUBLIC_WECHAT_APP_PAY_ENABLED === 'true';
  if (enabled && !/^wx[0-9a-f]{16}$/i.test(appid)) throw new Error('缺少微信移动应用AppID，不能生成支付包');
  if (enabled && (!link.startsWith('https://') || !link.endsWith('/'))) throw new Error('缺少以/结尾的HTTPS Universal Link，不能生成支付包');
  const schemes = [].concat(config.scheme || []);
  return {
    ...config,
    scheme: appid ? [...new Set([...schemes, appid])] : schemes,
    plugins: [...(config.plugins || []), 'expo-native-wechat'],
    ios: { ...config.ios, infoPlist: { ...config.ios?.infoPlist, LSApplicationQueriesSchemes: [...new Set([...(config.ios?.infoPlist?.LSApplicationQueriesSchemes || []), 'weixin', 'weixinULAPI', 'weixinURLParamsAPI'])] }, associatedDomains: [...new Set([...(config.ios?.associatedDomains || []), ...(link ? [`applinks:${new URL(link).hostname}`] : [])])] },
  };
};

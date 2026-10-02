import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Linking, Platform, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import WebView from 'react-native-webview';
import { colors } from '../../theme';
import { prepareNativePayment, requestNativePayment } from '../../utils/nativePayment';

// Preview-only shell for the Taro H5 build. Enable with EXPO_PUBLIC_SHARED_H5_URL
// after hosting that build on an HTTPS origin; the native app remains the fallback.
export default function SharedH5App({ url }) {
  const browser = useRef(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [currentUrl, setCurrentUrl] = useState(url);
  const origin = /^https:\/\/[^/]+/.exec(url)?.[0] || '';
  const basePage = url.split('#')[0];
  const previewPath = new URL(basePage).pathname;
  const atHome = !currentUrl.includes('#') || /#\/?pages\/home\/index(?:\?|$)/.test(currentUrl);

  const goHome = useCallback(() => {
    browser.current?.injectJavaScript("window.location.hash = '#/pages/home/index'; true;");
  }, []);
  const goBackOrHome = useCallback(() => {
    if (canGoBack) browser.current?.goBack();
    else browser.current?.injectJavaScript("if(window.history.length>1)window.history.back();else window.location.hash='#/pages/home/index';true;");
  }, [canGoBack]);

  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!canGoBack && atHome) return false;
      goBackOrHome();
      return true;
    });
    return () => subscription.remove();
  }, [canGoBack, atHome, goBackOrHome]);

  const allowNavigation = useCallback((request) => {
    const target = request.url || '';
    if (target === 'about:blank' || target.startsWith(`blob:${origin}/`)
      || target.split('#')[0] === basePage) return true;
    // Taro may use a path below the preview root for H5 routes. Keep those
    // inside the WebView so Android does not offer PC/browser helper apps.
    try {
      const parsed = new URL(target);
      if (parsed.origin === origin && parsed.pathname.startsWith(previewPath)) return true;
    } catch {}
    if (/^(https?:|tel:|mailto:)/i.test(target)) Linking.openURL(target).catch(() => {});
    return false;
  }, [origin, basePage, previewPath]);

  const onBridgeMessage = useCallback(async (event) => {
    let message;
    try { message = JSON.parse(event.nativeEvent.data); } catch { return; }
    if (message?.action === 'route-change') {
      if (typeof message.url === 'string' && message.url.startsWith(basePage)) setCurrentUrl(message.url);
      return;
    }
    if (!/^jy-\d+-\d+$/.test(message?.requestId || '')) return;
    const response = { requestId: message.requestId, ok: false };
    try {
      if (message.action === 'prepare-payment') {
        // H5 checks /payments/capabilities with its own token before this call.
        await prepareNativePayment({ capabilityChecked: true });
      } else if (message.action === 'wechat-pay') {
        await requestNativePayment(message.payload?.params);
      } else throw new Error('不支持的 App 操作');
      response.ok = true;
    } catch (error) { response.message = error?.message || 'App 操作失败'; }
    browser.current?.injectJavaScript(`window.dispatchEvent(new CustomEvent('jiayicare:native-response', {detail:${JSON.stringify(response)}}));true;`);
  }, [basePage]);

  const routeScript = `window.__JIAYICARE_NATIVE_BRIDGE__='v1';(function(){
    if(window.__jyRouteWatcher)return;window.__jyRouteWatcher=true;
    var notify=function(){if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(JSON.stringify({action:'route-change',url:location.href}));};
    window.addEventListener('hashchange',notify);window.addEventListener('popstate',notify);setTimeout(notify,0);
  })();true;`;

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.navigation}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="返回" onPress={goBackOrHome} style={styles.navButton}>
          <Text style={styles.navText}>‹ 返回</Text>
        </TouchableOpacity>
        <Text style={styles.navTitle}>嘉医汇健康管家</Text>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="首页" onPress={goHome} style={styles.navButton}>
          <Text style={styles.navText}>首页</Text>
        </TouchableOpacity>
      </View>
      <WebView
        key={reloadKey}
        ref={browser}
        source={{ uri: url }}
        originWhitelist={[origin, 'blob:*']}
        onShouldStartLoadWithRequest={allowNavigation}
        onMessage={onBridgeMessage}
        injectedJavaScriptBeforeContentLoaded={routeScript}
        injectedJavaScript="window.__JIAYICARE_NATIVE_BRIDGE__='v1';true;"
        onNavigationStateChange={(state) => { setCanGoBack(state.canGoBack); if (state.url?.startsWith(basePage)) setCurrentUrl(state.url); }}
        onLoadStart={() => setFailed(false)}
        onError={() => setFailed(true)}
        onHttpError={(event) => { if (event.nativeEvent.statusCode >= 400) setFailed(true); }}
        startInLoadingState
        renderLoading={() => <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>}
        javaScriptEnabled
        domStorageEnabled
        allowsInlineMediaPlayback
        mediaCapturePermissionGrantType="grantIfSameHostElsePrompt"
        style={styles.webview}
      />
      {failed && <View style={styles.failure}>
        <Text style={styles.message}>页面暂时无法加载，请检查网络后重试</Text>
        <TouchableOpacity onPress={() => { setFailed(false); setReloadKey(value => value + 1); }} style={styles.button}>
          <Text style={styles.buttonText}>重新加载</Text>
        </TouchableOpacity>
      </View>}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  navigation: { height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.background, paddingHorizontal: 12 },
  navButton: { minWidth: 56, minHeight: 40, justifyContent: 'center' },
  navText: { color: colors.primary, fontSize: 15, fontWeight: '600' },
  navTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: '700' },
  webview: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  failure: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background, padding: 24 },
  message: { color: colors.textPrimary, fontSize: 16, marginBottom: 16, textAlign: 'center' },
  button: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12, backgroundColor: colors.primary },
  buttonText: { color: '#fff', fontWeight: '700' },
});

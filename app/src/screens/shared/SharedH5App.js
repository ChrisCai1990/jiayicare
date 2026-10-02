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
  const origin = /^https:\/\/[^/]+/.exec(url)?.[0] || '';
  const basePage = url.split('#')[0];

  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!canGoBack) return false;
      browser.current?.goBack();
      return true;
    });
    return () => subscription.remove();
  }, [canGoBack]);

  const allowNavigation = useCallback((request) => {
    const target = request.url || '';
    if (target === 'about:blank' || target.startsWith(`blob:${origin}/`)
      || target.split('#')[0] === basePage) return true;
    if (/^(https?:|tel:|mailto:)/i.test(target)) Linking.openURL(target).catch(() => {});
    return false;
  }, [origin, basePage]);

  const onBridgeMessage = useCallback(async (event) => {
    let message;
    try { message = JSON.parse(event.nativeEvent.data); } catch { return; }
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
  }, []);

  return (
    <SafeAreaView style={styles.root}>
      <WebView
        key={reloadKey}
        ref={browser}
        source={{ uri: url }}
        originWhitelist={[origin, 'blob:*']}
        onShouldStartLoadWithRequest={allowNavigation}
        onMessage={onBridgeMessage}
        injectedJavaScriptBeforeContentLoaded="window.__JIAYICARE_NATIVE_BRIDGE__='v1';true;"
        injectedJavaScript="window.__JIAYICARE_NATIVE_BRIDGE__='v1';true;"
        onNavigationStateChange={(state) => setCanGoBack(state.canGoBack)}
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
  webview: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  failure: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background, padding: 24 },
  message: { color: colors.textPrimary, fontSize: 16, marginBottom: 16, textAlign: 'center' },
  button: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12, backgroundColor: colors.primary },
  buttonText: { color: '#fff', fontWeight: '700' },
});

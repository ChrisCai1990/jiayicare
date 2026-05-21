import React from 'react';
import { Platform, View, Text, ScrollView } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import Navigation from './src/navigation';
import { AuthProvider } from './src/context/AuthContext';

// 临时 ErrorBoundary：在生产构建中把渲染错误显示出来，便于诊断
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error('[ErrorBoundary]', error, info); }
  render() {
    if (this.state.error) {
      return (
        <View style={{ flex:1, backgroundColor:'#fff', padding:20, paddingTop:60 }}>
          <Text style={{ fontSize:16, fontWeight:'700', color:'#dc3545', marginBottom:12 }}>
            渲染错误（临时诊断）
          </Text>
          <ScrollView>
            <Text style={{ fontSize:13, color:'#333', fontFamily:'monospace' }}>
              {String(this.state.error)}
              {'\n\n'}
              {this.state.error?.stack || ''}
            </Text>
          </ScrollView>
        </View>
      );
    }
    return this.props.children;
  }
}

// Web 端：把 Ionicons 字体 base64 直接注入 CSS
// 这样完全不依赖网络路径，字体随 JS bundle 一起加载，彻底解决 404 问题
if (Platform.OS === 'web' && typeof document !== 'undefined') {
  // 动态 import 避免 native 端也打包进去
  import('./src/assets/ioniconsB64').then(({ default: b64 }) => {
    // 先移除 Expo 自动注入的错误 @font-face（如果存在）
    const existing = Array.from(document.querySelectorAll('style')).find(
      s => s.textContent.includes('Ionicons')
    );
    if (existing) existing.remove();

    const style = document.createElement('style');
    style.id = 'ionicons-font';
    style.textContent = `
      @font-face {
        font-family: 'Ionicons';
        src: url('data:font/truetype;base64,${b64}') format('truetype');
        font-weight: normal;
        font-style: normal;
        font-display: block;
      }
    `;
    document.head.appendChild(style);
  });
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <StatusBar style="light" />
        <Navigation />
      </AuthProvider>
    </ErrorBoundary>
  );
}

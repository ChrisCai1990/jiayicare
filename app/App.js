import React from 'react';
import { Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import Navigation from './src/navigation';
import { AuthProvider } from './src/context/AuthContext';

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
    <AuthProvider>
      <StatusBar style="light" />
      <Navigation />
    </AuthProvider>
  );
}

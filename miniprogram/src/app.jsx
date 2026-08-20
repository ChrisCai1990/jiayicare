import './polyfills/textEncoding';
import { Component } from 'react';
import Taro from '@tarojs/taro';
import { View, Text } from '@tarojs/components';
import { AuthProvider } from './context/AuthContext';
import { messagesAPI } from './services/api';

import './app.less';

class PageErrorBoundary extends Component {
  state = { error: null, componentStack: '' };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[PAGE_RENDER_ERROR]', error, info?.componentStack || '');
    this.setState({ componentStack: info?.componentStack || '' });
  }

  render() {
    const { error, componentStack } = this.state;
    if (!error) return this.props.children;
    return (
      <View style={{ minHeight: '100vh', boxSizing: 'border-box', padding: '72px 20px 24px', backgroundColor: '#F2EDE3' }}>
        <Text style={{ display: 'block', color: '#B42318', fontSize: '18px', fontWeight: 700 }}>页面渲染异常</Text>
        <Text selectable style={{ display: 'block', marginTop: '12px', color: '#1A2B24', fontSize: '13px', lineHeight: '20px', wordBreak: 'break-all' }}>
          {String(error?.stack || error?.message || error)}
        </Text>
        {!!componentStack && (
          <Text selectable style={{ display: 'block', marginTop: '12px', color: '#4A6558', fontSize: '11px', lineHeight: '17px', whiteSpace: 'pre-wrap' }}>
            {componentStack}
          </Text>
        )}
      </View>
    );
  }
}

class App extends Component {
  componentDidMount() {
    try {
      const inviteCode = Taro.getLaunchOptionsSync?.()?.query?.invite;
      if (inviteCode) Taro.setStorageSync('jy_invite_code', String(inviteCode));
    } catch {}
  }
  componentDidShow() {
    try {
      const inviteCode = Taro.getEnterOptionsSync?.()?.query?.invite;
      if (inviteCode) Taro.setStorageSync('jy_invite_code', String(inviteCode));
    } catch {}
    messagesAPI.unreadCount().then((res) => {
      const count = Number(res?.count || 0);
      if (count > 0) return Taro.setTabBarBadge({ index: 2, text: String(Math.min(count, 99)) });
      return Taro.removeTabBarBadge({ index: 2 });
    }).catch(() => {});
  }
  componentDidHide() {}

  // this.props.children 是将要会渲染的页面
  render() {
    return <AuthProvider><PageErrorBoundary>{this.props.children}</PageErrorBoundary></AuthProvider>;
  }
}

export default App;

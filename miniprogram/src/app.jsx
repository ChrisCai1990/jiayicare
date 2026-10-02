import './polyfills/textEncoding';
import { Component } from 'react';
import Taro from '@tarojs/taro';
import { View, Text } from '@tarojs/components';
import { AuthProvider } from './context/AuthContext';
import { refreshUnreadBadge } from './utils/unreadBadge';
import { captureInviteCode } from './utils/invitation';
import { captureEntrySource } from './utils/entrySource';

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
  unreadPollTimer = null;
  refreshUnread = () => refreshUnreadBadge({ notify: true });
  startUnreadPoll = () => {
    clearInterval(this.unreadPollTimer);
    this.refreshUnread();
    this.unreadPollTimer = setInterval(this.refreshUnread, 5000);
  };
  stopUnreadPoll = () => {
    clearInterval(this.unreadPollTimer);
    this.unreadPollTimer = null;
  };
  onVisibilityChange = () => {
    if (document.hidden) this.stopUnreadPoll();
    else this.startUnreadPoll();
  };

  componentDidMount() {
    try {
      const launch = Taro.getLaunchOptionsSync?.() || {};
      captureInviteCode(launch.query || {});
      captureEntrySource(launch.query || {});
    } catch {}
    if (process.env.TARO_ENV === 'h5') {
      document.addEventListener('visibilitychange', this.onVisibilityChange);
      if (!document.hidden) this.startUnreadPoll();
    }
  }
  componentWillUnmount() {
    this.stopUnreadPoll();
    if (process.env.TARO_ENV === 'h5') document.removeEventListener('visibilitychange', this.onVisibilityChange);
  }
  componentDidShow() {
    try {
      const entry = Taro.getEnterOptionsSync?.() || {};
      captureInviteCode(entry.query || {});
      captureEntrySource(entry.query || {});
    } catch {}
    if (process.env.TARO_ENV !== 'h5') this.startUnreadPoll();
  }
  componentDidHide() { if (process.env.TARO_ENV !== 'h5') this.stopUnreadPoll(); }

  // this.props.children 是将要会渲染的页面
  render() {
    return <AuthProvider><PageErrorBoundary>{this.props.children}</PageErrorBoundary></AuthProvider>;
  }
}

export default App;

import { Component } from 'react';
import Taro from '@tarojs/taro';
import { AuthProvider } from './context/AuthContext';
import { messagesAPI } from './services/api';

import './app.less';

class App extends Component {
  componentDidMount() {}
  componentDidShow() {
    messagesAPI.unreadCount().then((res) => {
      const count = Number(res?.count || 0);
      if (count > 0) return Taro.setTabBarBadge({ index: 2, text: String(Math.min(count, 99)) });
      return Taro.removeTabBarBadge({ index: 2 });
    }).catch(() => {});
  }
  componentDidHide() {}

  // this.props.children 是将要会渲染的页面
  render() {
    return <AuthProvider>{this.props.children}</AuthProvider>;
  }
}

export default App;

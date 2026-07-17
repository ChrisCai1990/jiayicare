import { Component } from 'react';
import { AuthProvider } from './context/AuthContext';

import './app.less';

class App extends Component {
  componentDidMount() {}
  componentDidShow() {}
  componentDidHide() {}

  // this.props.children 是将要会渲染的页面
  render() {
    return <AuthProvider>{this.props.children}</AuthProvider>;
  }
}

export default App;

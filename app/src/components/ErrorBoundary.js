import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, spacing } from '../theme';

// 2026-07-07：用户反馈"上传报告打开是空白"，排查发现渲染阶段的异常（如访问 undefined 字段）
// 不会被普通 try/catch 捕获，会导致整棵组件树静默卸载、页面变成纯白屏，用户和我们都看不到任何报错。
// 加这层边界后，即使真的出现未预料的渲染异常，也能看到具体错误信息+提供返回按钮，而不是死白屏。
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary] 页面渲染异常：', error, info?.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <View style={styles.container}>
          <Text style={styles.title}>页面出了点问题</Text>
          <Text style={styles.message}>{String(this.state.error?.message || this.state.error)}</Text>
          <TouchableOpacity style={styles.button} onPress={() => this.setState({ error: null })}>
            <Text style={styles.buttonText}>重试</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    padding: spacing.xl, backgroundColor: colors.background,
  },
  title: { fontSize: 18, fontWeight: '700', color: colors.textPrimary, marginBottom: 12 },
  message: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', marginBottom: 20 },
  button: { backgroundColor: colors.primary, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 8 },
  buttonText: { color: '#fff', fontWeight: '600' },
});

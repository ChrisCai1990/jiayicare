import React from 'react';
import { View, Text } from '@tarojs/components';
import { colors, spacing } from '../../theme';
import useNavBar from '../../hooks/useNavBar';
import MessagesPage from '../messages/index';

// 健康管家只承载统一团队会话。健康规划师与其他角色共用同一聊天底座。
export default function ChatPage() {
  const { statusBarHeight } = useNavBar();

  return (
    <View style={{ display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: colors.background }}>
      <View style={{ padding: `${statusBarHeight + 10}px ${spacing.lg}px ${spacing.sm}px`, backgroundColor: '#fff', borderBottom: `1px solid ${colors.border}`, flexShrink: 0 }}>
        <Text style={{ fontSize: '20px', fontWeight: 800, color: colors.textPrimary }}>健康管家</Text>
      </View>
      <MessagesPage embedded />
    </View>
  );
}

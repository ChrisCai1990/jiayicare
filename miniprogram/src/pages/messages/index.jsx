import React, { useState, useCallback } from 'react';
import { View, Text, Input } from '@tarojs/components';
import { useDidShow } from '@tarojs/taro';
import { colors, spacing, radius, shadow } from '../../theme';
import { messagesAPI } from '../../services/api';

// 简化实现：消息列表 + 单会话收发，完整版含多角色Tab/图片消息见 app/src/screens/messages/MessagesScreen.js
export default function MessagesPage() {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeRole, setActiveRole] = useState(null);
  const [thread, setThread] = useState([]);
  const [input, setInput] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    messagesAPI.list().then((res) => { if (res.success) setMessages(res.data || []); })
      .catch(() => {}).finally(() => setLoading(false));
  }, []);

  useDidShow(() => { load(); });

  const openThread = async (role) => {
    setActiveRole(role);
    try {
      const res = await messagesAPI.getThread(role);
      if (res.success) setThread(res.data || []);
    } catch { setThread([]); }
    try { await messagesAPI.markAllRead(); load(); } catch {}
  };

  const send = async () => {
    const text = input.trim();
    if (!text || !activeRole) return;
    setInput('');
    try {
      await messagesAPI.send(activeRole, text);
      const res = await messagesAPI.getThread(activeRole);
      if (res.success) setThread(res.data || []);
    } catch {}
  };

  // 按 role/from/to 分组会话（后端消息模型的角色字段名以实际返回为准，这里兼容常见字段）
  const roles = Array.from(new Set(messages.map((m) => m.fromRole || m.role || m.senderRole).filter(Boolean)));

  if (activeRole) {
    return (
      <View style={{ display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: colors.background }}>
        <View style={{ backgroundColor: '#fff', padding: `${spacing.sm}px ${spacing.md}px`, borderBottom: `1px solid ${colors.border}` }}
          onClick={() => setActiveRole(null)}>
          <Text style={{ fontSize: '13px', color: colors.primary }}>‹ 返回消息列表</Text>
        </View>
        <View style={{ flex: 1, overflowY: 'auto', padding: `${spacing.md}px` }}>
          {thread.map((m, i) => (
            <View key={i} style={{ display: 'flex', justifyContent: m.fromUser ? 'flex-end' : 'flex-start', marginBottom: '10px' }}>
              <View style={{
                maxWidth: '78%', padding: '10px 14px', borderRadius: `${radius.md}px`,
                backgroundColor: m.fromUser ? colors.primary : '#fff', border: m.fromUser ? 'none' : `1px solid ${colors.border}`,
              }}>
                <Text style={{ fontSize: '14px', color: m.fromUser ? '#fff' : colors.textPrimary }}>{m.content}</Text>
              </View>
            </View>
          ))}
        </View>
        <View style={{ display: 'flex', gap: '8px', padding: `${spacing.sm}px ${spacing.md}px`, backgroundColor: '#fff', borderTop: `1px solid ${colors.border}` }}>
          <Input
            style={{ flex: 1, backgroundColor: colors.background, borderRadius: `${radius.full}px`, padding: '10px 16px', fontSize: '14px' }}
            placeholder="输入消息..."
            value={input}
            onInput={(e) => setInput(e.detail.value)}
            confirmType="send"
            onConfirm={send}
          />
          <View onClick={send} style={{ padding: '10px 18px', borderRadius: `${radius.full}px`, backgroundColor: colors.primary }}>
            <Text style={{ color: '#fff', fontSize: '14px', fontWeight: 600 }}>发送</Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={{ minHeight: '100vh', backgroundColor: colors.background, padding: `${spacing.lg}px` }}>
      <Text style={{ fontSize: '20px', fontWeight: 800, color: colors.textPrimary, display: 'block', marginBottom: `${spacing.md}px` }}>消息</Text>
      {loading ? (
        <Text style={{ fontSize: '13px', color: colors.textMuted }}>加载中...</Text>
      ) : roles.length === 0 ? (
        <View style={{ textAlign: 'center', padding: `${spacing.xxl}px 0` }}>
          <Text style={{ fontSize: '13px', color: colors.textMuted }}>暂无消息</Text>
        </View>
      ) : (
        roles.map((role) => {
          const lastMsg = messages.filter((m) => (m.fromRole || m.role || m.senderRole) === role).slice(-1)[0];
          const unread = messages.filter((m) => (m.fromRole || m.role || m.senderRole) === role && !m.read).length;
          return (
            <View key={role} onClick={() => openThread(role)} style={{
              display: 'flex', alignItems: 'center', backgroundColor: '#fff', borderRadius: `${radius.md}px`,
              padding: `${spacing.md}px`, marginBottom: '10px', boxShadow: shadow.card,
            }}>
              <View style={{ width: '40px', height: '40px', borderRadius: '20px', backgroundColor: colors.primary10, display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: '10px' }}>
                <Text style={{ fontSize: '18px' }}>👨‍⚕️</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: '14px', fontWeight: 700, color: colors.textPrimary, display: 'block' }}>{role}</Text>
                <Text style={{ fontSize: '12px', color: colors.textMuted }}>{lastMsg?.content || '暂无消息记录'}</Text>
              </View>
              {unread > 0 && (
                <View style={{ minWidth: '18px', height: '18px', borderRadius: '9px', backgroundColor: colors.danger, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px' }}>
                  <Text style={{ fontSize: '10px', color: '#fff', fontWeight: 700 }}>{unread}</Text>
                </View>
              )}
            </View>
          );
        })
      )}
    </View>
  );
}

import React, { useState, useRef } from 'react';
import { View, Text, Input, ScrollView } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { colors, spacing, radius } from '../../theme';
import { chatAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

// AI健康助手对话界面（简化版，接真实 /chat 接口）
export default function ChatPage() {
  const { user } = useAuth();
  const [messages, setMessages] = useState([
    { role: 'assistant', content: '您好，我是嘉医汇AI健康助手，有什么可以帮您的吗？' },
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef();

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    const next = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setInput('');
    setSending(true);
    try {
      const res = await chatAPI.send(next, { name: user?.name, age: user?.age, gender: user?.gender });
      const reply = res?.data?.reply || res?.reply || '抱歉，我暂时无法回复，请稍后重试。';
      setMessages((m) => [...m, { role: 'assistant', content: reply }]);
    } catch (err) {
      setMessages((m) => [...m, { role: 'assistant', content: `请求失败：${err.message || '网络异常'}` }]);
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={{ display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: colors.background }}>
      <ScrollView scrollY style={{ flex: 1, padding: `${spacing.md}px` }} scrollIntoView="bottom-anchor">
        {messages.map((m, i) => (
          <View key={i} style={{
            display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start', marginBottom: '10px',
          }}>
            <View style={{
              maxWidth: '78%', padding: '10px 14px', borderRadius: `${radius.md}px`,
              backgroundColor: m.role === 'user' ? colors.primary : '#fff',
              border: m.role === 'user' ? 'none' : `1px solid ${colors.border}`,
            }}>
              <Text style={{ fontSize: '14px', color: m.role === 'user' ? '#fff' : colors.textPrimary, lineHeight: '20px' }}>{m.content}</Text>
            </View>
          </View>
        ))}
        {sending && <Text style={{ fontSize: '12px', color: colors.textMuted }}>AI 正在思考...</Text>}
        <View id="bottom-anchor" />
      </ScrollView>

      <View style={{
        display: 'flex', alignItems: 'center', gap: '8px', padding: `${spacing.sm}px ${spacing.md}px`,
        backgroundColor: '#fff', borderTop: `1px solid ${colors.border}`,
      }}>
        <Input
          style={{ flex: 1, backgroundColor: colors.background, borderRadius: `${radius.full}px`, padding: '10px 16px', fontSize: '14px' }}
          placeholder="输入您的健康问题..."
          value={input}
          onInput={(e) => setInput(e.detail.value)}
          confirmType="send"
          onConfirm={send}
        />
        <View
          onClick={send}
          style={{
            padding: '10px 18px', borderRadius: `${radius.full}px`,
            backgroundColor: input.trim() ? colors.primary : colors.border,
          }}
        >
          <Text style={{ color: '#fff', fontSize: '14px', fontWeight: 600 }}>发送</Text>
        </View>
      </View>
    </View>
  );
}

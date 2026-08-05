import React, { useState, useRef } from 'react';
import { View, Text, Textarea, ScrollView } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { colors, spacing, radius } from '../../theme';
import { chatAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import useNavBar from '../../hooks/useNavBar';
import Icon from '../../components/Icon';

// AI健康规划师：仅梳理健康管理需求与规划平台服务，不提供医疗咨询。
export default function ChatPage() {
  const { statusBarHeight } = useNavBar();
  const { user } = useAuth();
  const [messages, setMessages] = useState([
    { role: 'assistant', content: '您好，我是小嘉，您的AI健康规划师。我可以帮您梳理健康管理需求、明确阶段目标并规划合适的服务路径。您目前最想改善或管理的是哪一方面？' },
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
      const reply = res?.data?.content || res?.content || '抱歉，我暂时无法回复，请稍后重试。';
      setMessages((m) => [...m, { role: 'assistant', content: reply }]);
    } catch (err) {
      setMessages((m) => [...m, { role: 'assistant', content: `请求失败：${err.message || '网络异常'}` }]);
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={{ display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: colors.background }}>
      <View style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: `${statusBarHeight + 8}px ${spacing.lg}px ${spacing.md}px`,
        backgroundColor: '#fff', borderBottom: `1px solid ${colors.border}`, flexShrink: 0,
      }}>
        <View onClick={() => Taro.navigateBack()} style={{ padding: '4px' }}>
          <Icon name="chevron-left" size={20} color={colors.textPrimary} />
        </View>
        <Text style={{ fontSize: '18px', fontWeight: 700, color: colors.textPrimary }}>AI健康规划师</Text>
        <View style={{ width: '28px' }} />
      </View>

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
        {sending && <Text style={{ fontSize: '12px', color: colors.textMuted }}>正在梳理您的需求...</Text>}
        <View id="bottom-anchor" />
      </ScrollView>

      <View style={{
        display: 'flex', alignItems: 'flex-end', gap: '8px', padding: `${spacing.sm}px ${spacing.md}px`,
        backgroundColor: '#fff', borderTop: `1px solid ${colors.border}`,
      }}>
        <Textarea
          style={{ flex: 1, minHeight: '48px', maxHeight: '112px', boxSizing: 'border-box', backgroundColor: colors.background, borderRadius: `${radius.md}px`, padding: '12px 14px', fontSize: '15px', lineHeight: '22px' }}
          placeholder="输入您的健康问题..."
          value={input}
          onInput={(e) => setInput(e.detail.value)}
          autoHeight
          maxlength={500}
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

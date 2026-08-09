import React, { useState, useRef } from 'react';
import { View, Text, Textarea, ScrollView } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { colors, spacing, radius } from '../../theme';
import { chatAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import useNavBar from '../../hooks/useNavBar';
import Icon from '../../components/Icon';
import MessagesPage from '../messages/index';

const QUICK_PROMPTS = ['制定阶段健康目标', '梳理我的健康需求', '了解适合我的服务'];

// 小嘉健康规划师：仅梳理健康管理需求与规划平台服务，不提供医疗咨询。
export default function ChatPage() {
  const { statusBarHeight } = useNavBar();
  const { user } = useAuth();
  const [messages, setMessages] = useState([
    { role: 'assistant', content: '您好，我是小嘉健康规划师。我可以帮您梳理健康管理需求、明确阶段目标并规划合适的服务路径。您目前最想改善或管理的是哪一方面？' },
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [view, setView] = useState('ai');
  const scrollRef = useRef();

  useDidShow(() => {
    const requestedView = Taro.getStorageSync('healthHubView');
    if (requestedView === 'team') setView('team');
    Taro.removeStorageSync('healthHubView');
  });

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

  const choosePrompt = (text) => {
    setInput(text);
  };

  return (
    <View style={{ display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: colors.background }}>
      <View style={{
        padding: `${statusBarHeight + 10}px ${spacing.lg}px ${spacing.sm}px`,
        backgroundColor: '#fff', borderBottom: `1px solid ${colors.border}`, flexShrink: 0,
      }}>
        <Text style={{ fontSize: '20px', fontWeight: 800, color: colors.textPrimary, display: 'block', marginBottom: '10px' }}>健康管家</Text>
        <View style={{ display: 'flex', backgroundColor: colors.background, borderRadius: `${radius.full}px`, padding: '3px' }}>
          {[{ key: 'ai', label: '服务规划' }, { key: 'team', label: '我的团队' }].map((item) => (
            <View key={item.key} onClick={() => setView(item.key)} style={{ flex: 1, textAlign: 'center', padding: '7px 0', borderRadius: `${radius.full}px`, backgroundColor: view === item.key ? '#fff' : 'transparent' }}>
              <Text style={{ fontSize: '13px', fontWeight: 700, color: view === item.key ? colors.primary : colors.textMuted }}>{item.label}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* 两个区域同时挂载：团队消息进入页面即后台加载，切换时不再临时请求。 */}
      <View style={{ display: view === 'team' ? 'flex' : 'none', flex: 1, minHeight: 0 }}>
        <ScrollView scrollY style={{ flex: 1, paddingTop: `${spacing.md}px` }}>
          <MessagesPage embedded />
        </ScrollView>
      </View>
      <View style={{ display: view === 'ai' ? 'flex' : 'none', flex: 1, minHeight: 0, flexDirection: 'column' }}>
      <ScrollView scrollY style={{ flex: 1, padding: `${spacing.md}px` }} scrollIntoView="bottom-anchor">
        {messages.length === 1 && (
          <View style={{ marginBottom: `${spacing.md}px` }}>
            <Text style={{ fontSize: '12px', color: colors.textMuted, display: 'block', marginBottom: '8px' }}>可以从这些问题开始</Text>
            <View style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {QUICK_PROMPTS.map((prompt) => (
                <View key={prompt} onClick={() => choosePrompt(prompt)} style={{ padding: '8px 11px', borderRadius: `${radius.full}px`, backgroundColor: '#fff', border: `1px solid ${colors.border}` }}>
                  <Text style={{ fontSize: '12px', color: colors.primary }}>{prompt}</Text>
                </View>
              ))}
            </View>
          </View>
        )}
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
    </View>
  );
}

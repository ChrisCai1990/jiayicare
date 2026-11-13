import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Textarea } from '@tarojs/components';
import Taro, { useDidShow, useDidHide } from '@tarojs/taro';
import { colors, spacing, radius } from '../../../theme';
import { inAppServiceGroupAPI as api } from '../../../services/api';
import useNavBar from '../../../hooks/useNavBar';

const stamp = value => value ? new Date(value).toLocaleString('zh-CN', {
  month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
}) : '';

export default function ServiceGroupPage() {
  const { statusBarHeight } = useNavBar();
  const [group, setGroup] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [visible, setVisible] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const response = await api.list();
      const current = (response.data || [])[0] || null;
      setGroup(current);
      setMessages(current ? (await api.messages(current.id)).data || [] : []);
      setError('');
    } catch (e) { setError(e.message || '服务群读取失败'); }
    finally { setLoading(false); }
  }, []);

  useDidShow(() => setVisible(true));
  useDidHide(() => setVisible(false));
  useEffect(() => {
    if (!visible) return;
    refresh();
    const timer = setInterval(refresh, 10000);
    return () => clearInterval(timer);
  }, [visible, refresh]);

  const start = async () => {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const response = await api.start();
      setGroup(response.data);
      setMessages((await api.messages(response.data.id)).data || []);
    } catch (e) { setError(e.message || '建立服务群失败'); }
    finally { setBusy(false); }
  };
  const send = async () => {
    const content = draft.trim();
    if (!group || !content || busy) return;
    setBusy(true); setError('');
    try {
      await api.send(group.id, content);
      setDraft('');
      await refresh();
    } catch (e) { setError(e.message || '发送失败，请重试'); }
    finally { setBusy(false); }
  };

  return <View style={{ height: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: colors.background }}>
    <View style={{ padding: `${statusBarHeight + 8}px ${spacing.lg}px ${spacing.md}px`, backgroundColor: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <Text onClick={() => Taro.navigateBack()} style={{ color: colors.primary, fontSize: '15px' }}>‹ 返回</Text>
      <Text style={{ color: colors.textPrimary, fontSize: '18px', fontWeight: 700 }}>我的服务群</Text>
      <Text onClick={refresh} style={{ color: colors.primary, fontSize: '14px' }}>刷新</Text>
    </View>
    <Text style={{ display: 'block', padding: '10px 16px', color: colors.textMuted, fontSize: '12px' }}>
      {group ? `服务团队：${group.staff.map(person => person.name).join('、')}。团队负责人可查看沟通记录。`
        : '消息由当前服务团队处理，团队负责人可查看沟通记录。'}
    </Text>
    {!!error && <Text onClick={refresh} style={{ display: 'block', padding: '10px 16px', color: colors.danger, fontSize: '13px' }}>{error} · 点击重试</Text>}
    {loading ? <Text style={{ padding: '16px', color: colors.textMuted }}>正在加载…</Text>
      : !group ? <View style={{ padding: '20px' }}>
        <View onClick={start} style={{ padding: '14px', backgroundColor: colors.primary, borderRadius: `${radius.sm}px`, textAlign: 'center' }}>
          <Text style={{ color: '#fff', fontWeight: 700 }}>{busy ? '正在建立…' : '开始服务群沟通'}</Text>
        </View>
      </View>
      : <>
        <ScrollView scrollY style={{ flex: 1, height: 0, padding: '12px 16px', boxSizing: 'border-box' }}>
          {messages.map(message => <View key={message.id} style={{ maxWidth: '85%', marginBottom: '10px', marginLeft: message.senderType === 'customer' ? 'auto' : 0,
            padding: '10px 12px', borderRadius: `${radius.sm}px`, backgroundColor: message.senderType === 'customer' ? '#D8EFE4' : '#fff' }}>
            <Text style={{ display: 'block', color: colors.textMuted, fontSize: '11px' }}>{message.senderName} · {stamp(message.createdAt)}</Text>
            <Text style={{ display: 'block', marginTop: '4px', color: colors.textPrimary, fontSize: '14px', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{message.content}</Text>
          </View>)}
        </ScrollView>
        <View style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', padding: '10px', backgroundColor: '#fff' }}>
          <Textarea value={draft} onInput={event => setDraft(event.detail.value)} maxlength={2000} autoHeight
            placeholder="给服务团队发消息" style={{ flex: 1, minHeight: '38px', maxHeight: '100px', padding: '8px', border: `1px solid ${colors.border}`, borderRadius: `${radius.xs}px` }} />
          <View onClick={send} style={{ padding: '10px 14px', backgroundColor: busy || !draft.trim() ? colors.textMuted : colors.primary, borderRadius: `${radius.xs}px` }}>
            <Text style={{ color: '#fff' }}>发送</Text>
          </View>
        </View>
      </>}
  </View>;
}

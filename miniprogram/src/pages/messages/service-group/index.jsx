import { refreshUnreadBadge } from '../../../utils/unreadBadge';
import { manageAiDataConsent } from '../../../utils/aiDataConsent';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, Textarea, Image } from '@tarojs/components';
import Taro, { useDidShow, useDidHide } from '@tarojs/taro';
import { colors, spacing, radius } from '../../../theme';
import { mediaUrl, inAppServiceGroupAPI as api } from '../../../services/api';
import useNavBar from '../../../hooks/useNavBar';

const stamp = value => value ? new Date(value).toLocaleString('zh-CN', {
  month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
}) : '';

export default function ServiceGroupPage() {
  const { statusBarHeight } = useNavBar();
  const [group, setGroup] = useState(null);
  const [groups, setGroups] = useState([]);
  const selectedId = useRef(Taro.getCurrentInstance()?.router?.params?.groupId || '');
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [visible, setVisible] = useState(true);
  const [scrollTarget, setScrollTarget] = useState('');
  const [unreadAnchor, setUnreadAnchor] = useState('');
  const opened = useRef(false);
  const lastMessage = useRef('');
  const followLatest = useRef(true);
  const paneHeight = useRef(0);
  const [scrollTop, setScrollTop] = useState(0);
  const [scrollRequest, setScrollRequest] = useState(null);
  useEffect(() => {
    if (loading || !scrollRequest) return;
    let active = true;
    const locate = () => {
      if (!active) return;
      if (process.env.TARO_ENV === 'h5') {
        const pane = document.getElementById('service-group-scroll');
        const target = document.getElementById(scrollRequest.target);
        if (pane && target) {
          pane.scrollTop = scrollRequest.bottom ? pane.scrollHeight
            : pane.scrollTop + target.getBoundingClientRect().top - pane.getBoundingClientRect().top;
        }
      }
      if (process.env.TARO_ENV !== 'h5') Taro.createSelectorQuery().select('#service-group-scroll').boundingClientRect(rect => { if (rect) paneHeight.current = rect.height; }).exec();
      if (scrollRequest.bottom) { setScrollTarget(''); setScrollTop(value => value + 100000); }
      else setScrollTarget(scrollRequest.target);
    };
    Taro.nextTick(locate);
    const timer = setTimeout(locate, 120);
    return () => { active = false; clearTimeout(timer); };
  }, [loading, scrollRequest]);

  const refreshing = useRef(false);
  const refresh = useCallback(async () => {
    if (refreshing.current) return;
    refreshing.current = true;
    try {
      const response = await api.list();
      const available = response.data || [];
      setGroups(available);
      const activeId = selectedId.current;
      const current = available.find(item => String(item.id) === String(activeId)) || null;
      setGroup(current);
      const result = current ? await api.messages(current.id) : { data: [] };
      if (activeId !== selectedId.current) return;
      const rows = result.data || [];
      setMessages(rows);
      if (!opened.current && rows.length) {
        opened.current = true;
        setUnreadAnchor(result.firstUnreadMessageId || '');
        setScrollRequest({ target: 'group-msg-' + (result.firstUnreadMessageId || rows[rows.length - 1].id), bottom: !result.firstUnreadMessageId });
      }
      const latest = rows[rows.length - 1]?.id || '';
      if (latest !== lastMessage.current) {
        if (lastMessage.current && followLatest.current) setScrollRequest({ target: 'group-msg-' + latest, bottom: true });
        lastMessage.current = latest; refreshUnreadBadge();
      }
      setError('');
    } catch (e) { setError(e.message || '服务群读取失败'); }
    finally { refreshing.current = false; setLoading(false); }
  }, []);

  useDidShow(() => setVisible(true));
  useDidHide(() => setVisible(false));
  useEffect(() => {
    if (!visible) return;
    refresh();
    const timer = setInterval(refresh, 2000);
    return () => clearInterval(timer);
  }, [visible, refresh]);

  const openGroup = item => { selectedId.current = String(item.id); opened.current = false; lastMessage.current = ''; followLatest.current = true; setUnreadAnchor(''); setScrollRequest(null); setMessages([]); setDraft(''); setGroup(item); refresh(); };
  const back = () => { if (selectedId.current) { selectedId.current = ''; setGroup(null); setMessages([]); refresh(); } else Taro.navigateBack(); };
  const send = async () => {
    const content = draft.trim();
    if (!group || !content || busy) return;
    setBusy(true); setError('');
    try {
      await api.send(group.id, content);
      setDraft('');
      followLatest.current = true;
      await refresh();
      setScrollRequest({ target: 'group-msg-' + lastMessage.current, bottom: true });
    } catch (e) { setError(e.message || '发送失败，请重试'); }
    finally { setBusy(false); }
  };

  return <View style={{ height: process.env.TARO_ENV === 'h5' ? '100dvh' : '100vh', overflow: 'hidden', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', backgroundColor: colors.background }}>
    <View style={{ padding: `${statusBarHeight + 8}px ${spacing.lg}px ${spacing.md}px`, backgroundColor: '#fff', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <Text onClick={back} style={{ color: colors.primary, fontSize: '15px' }}>‹ 返回</Text>
      <Text style={{ color: colors.textPrimary, fontSize: '16px', fontWeight: 700, flex: 1, textAlign: 'center' }}>{group?.name || '我的服务群'}</Text>
      <Text onClick={refresh} style={{ color: colors.primary, fontSize: '14px' }}>刷新</Text>
    </View>
    <Text style={{ display: 'block', flexShrink: 0, padding: '10px 16px', color: colors.textMuted, fontSize: '12px' }}>
      {group ? `服务团队：${group.staff.map(person => person.name).join('、')}。团队负责人可查看沟通记录。`
        : '消息由当前服务团队处理，团队负责人可查看沟通记录。'}
    </Text>
    {group?.assistant && <View style={{ display: 'flex', flexShrink: 0, alignItems: 'center', padding: '10px 16px', gap: '10px', background: '#eef9f9' }}>
      <Image src={mediaUrl(group.assistant.avatar)} mode="aspectFill" style={{ width: '44px', height: '44px', borderRadius: '50%' }} />
      <View style={{ flex: 1 }}><Text style={{ display: 'block', fontSize: '13px', fontWeight: 600 }}>小嘉｜嘉医汇AI健康管家</Text><Text style={{ fontSize: '11px', color: colors.textMuted }}>健管专员的AI助手，人工接待时暂停回复</Text></View>
      <Text onClick={manageAiDataConsent} style={{ fontSize: '12px', color: colors.primary }}>AI授权</Text>
    </View>}
    {!!error && <Text onClick={refresh} style={{ display: 'block', padding: '10px 16px', color: colors.danger, fontSize: '13px' }}>{error} · 点击重试</Text>}
    {loading ? <Text style={{ padding: '16px', color: colors.textMuted }}>正在加载…</Text>
      : !group ? <ScrollView scrollY style={{ flex: 1, height: 0, minHeight: 0, padding: '12px', boxSizing: 'border-box' }}>
        {groups.map(item => <View key={item.id} onClick={() => openGroup(item)} style={{ background: '#fff', borderRadius: '12px', padding: '16px', marginBottom: '12px' }}>
          <Text style={{ display: 'block', fontWeight: 700 }}>{item.name || '我的服务群'} › {item.unreadCount > 0 && <Text style={{ color: '#DC3545' }}>● {item.unreadCount} 条未读</Text>}</Text>
          <Text style={{ display: 'block', color: colors.textMuted, fontSize: '12px', marginTop: '6px' }}>{item.staff.map(person => person.name).join('、')}</Text>
          <Text style={{ display: 'block', color: colors.textMuted, fontSize: '12px', marginTop: '6px' }}>{item.preview || '暂无消息'}</Text>
        </View>)}
        {groups.length === 0 && <Text>健管专员尚未为您配置服务群，请联系服务团队。</Text>}
      </ScrollView>
      : <>
        <View style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <ScrollView id="service-group-scroll" scrollY scrollTop={scrollTop} scrollIntoView={scrollTarget}
          onScroll={event => { const detail = event.detail; if (process.env.TARO_ENV === 'h5') { const pane = document.getElementById('service-group-scroll'); if (pane) followLatest.current = pane.scrollHeight - pane.scrollTop - pane.clientHeight < 64; } else { followLatest.current = paneHeight.current > 0 && detail.scrollHeight - detail.scrollTop - paneHeight.current < 64; } }}
          style={{ height: '100%', minHeight: 0, padding: '12px 16px 24px', boxSizing: 'border-box' }}>
          {messages.map(message => <View id={`group-msg-${message.id}`} key={message.id} style={{ maxWidth: '85%', marginBottom: '10px', marginLeft: message.senderType === 'customer' ? 'auto' : 0,
            padding: '10px 12px', borderRadius: `${radius.sm}px`, backgroundColor: message.senderType === 'customer' ? '#D8EFE4' : '#fff' }}>
            {String(unreadAnchor) === String(message.id) && <Text style={{ display: 'block', color: '#B42318', fontSize: '12px', marginBottom: '6px' }}>以下为未读消息</Text>}
            {message.senderAvatar && <Image src={mediaUrl(message.senderAvatar)} mode="aspectFill" style={{ width: '36px', height: '36px', borderRadius: '50%', marginBottom: '5px' }} />}
            <Text style={{ display: 'block', color: colors.textMuted, fontSize: '11px' }}>{message.senderName}{message.senderType !== 'customer' && ` · ${({familyDoctor:'健康顾问',nutritionist:'营养师',healthManager:'健管专员',medicalAssistant:'就医专员',ai:'嘉医汇AI健康管家'})[message.senderRole] || '服务人员'}`} · {stamp(message.createdAt)}</Text>
            <Text style={{ display: 'block', marginTop: '4px', color: colors.textPrimary, fontSize: '14px', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{message.content}</Text>
          </View>)}
        </ScrollView>
        </View>
        <View style={{ flexShrink: 0, display: 'flex', alignItems: 'flex-end', gap: '8px', padding: '10px', backgroundColor: '#fff' }}>
          <Textarea value={draft} onInput={event => setDraft(event.detail.value)} maxlength={2000} autoHeight
            placeholder="给服务团队发消息" style={{ flex: 1, minHeight: '38px', maxHeight: '100px', padding: '8px', border: `1px solid ${colors.border}`, borderRadius: `${radius.xs}px` }} />
          <View onClick={send} style={{ padding: '10px 14px', backgroundColor: busy || !draft.trim() ? colors.textMuted : colors.primary, borderRadius: `${radius.xs}px` }}>
            <Text style={{ color: '#fff' }}>发送</Text>
          </View>
        </View>
      </>}
  </View>;
}

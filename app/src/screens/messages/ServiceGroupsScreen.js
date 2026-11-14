import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Image,
  KeyboardAvoidingView, Platform, ActivityIndicator, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme';
import { mediaUrl, inAppServiceGroupAPI as api } from '../../services/api';

const stamp = value => value ? new Date(value).toLocaleString('zh-CN', {
  month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
}) : '';

export default function ServiceGroupsScreen({ navigation }) {
  const [groups, setGroups] = useState([]);
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [mentionIds,setMentionIds]=useState([]);
  const [showMentions,setShowMentions]=useState(false);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const selectedRef = useRef(null);
  const listRef = useRef(null);

  const refresh = useCallback(async () => {
    try {
      const response = await api.list();
      setGroups(response.data || []);
      setError('');
      const active = selectedRef.current;
      if (active) {
        const group = (response.data || []).find(item => item.id === active);
        if (group) setSelected(group);
      }
    } catch (e) { setError(e.message || '服务群读取失败'); }
    finally { setLoading(false); }
  }, []);
  const read = async id => {
    try {
      const response = await api.messages(id);
      if (selectedRef.current === id) setMessages(response.data || []);
    } catch (e) { setError(e.message || '消息读取失败'); }
  };
  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    if (!selected) return;
    const timer = setInterval(() => { read(selected.id); refresh(); }, 10000);
    return () => clearInterval(timer);
  }, [selected?.id]);
  const open = group => {
    selectedRef.current = group.id; setSelected(group); setMessages([]); setDraft(''); setMentionIds([]); setShowMentions(false); setError(''); read(group.id);
  };
  const send = async () => {
    if (!selected || !draft.trim() || busy) return;
    setBusy(true); setError('');
    try { await api.send(selected.id, draft.trim(), mentionIds.filter(id=>selected.staff.some(p=>String(p.id)===id&&draft.includes('@'+p.name)))); setMentionIds([]); setDraft(''); await read(selected.id); await refresh(); }
    catch (e) { setError(e.message || '发送失败，请重试'); }
    finally { setBusy(false); }
  };

  return <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <View style={styles.header}>
      <TouchableOpacity onPress={() => selected ? (selectedRef.current = null, setSelected(null)) : navigation.goBack()}>
        <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
      </TouchableOpacity>
      <Text style={styles.title}>{selected ? selected.name || '我的服务群' : '服务群'}</Text>
      <TouchableOpacity onPress={() => selected ? read(selected.id) : refresh()}>
        <Ionicons name="refresh" size={22} color={colors.primary} />
      </TouchableOpacity>
    </View>
    {!!error && <Text style={styles.error}>{error}</Text>}
    {!selected ? <ScrollView style={styles.list}>
      <Text style={styles.note}>您发送的消息由当前服务团队处理，团队负责人可在嘉医汇系统内查看服务沟通记录。</Text>
      {loading && <ActivityIndicator color={colors.primary} />}
      {groups.map(group => <TouchableOpacity key={group.id} style={styles.group} onPress={() => open(group)}>
        <Text style={styles.groupTitle}>{group.name || '我的服务群'}{group.status==='closed'?' · 已归档':''}{group.mentionCount>0?' · 有人@我':''}{group.unreadCount > 0 ? ` · ${group.unreadCount}条未读` : ''}</Text>
        <Text style={styles.note}>团队成员：{group.staff.map(person => person.name).join('、')}</Text>
        <Text style={styles.note}>{stamp(group.lastMessageAt) || '暂无消息'}{group.waitingForStaff ? ' · 等待团队回复' : ''}</Text>
      </TouchableOpacity>)}
      {!loading && groups.length === 0 && <Text style={styles.note}>团队负责人尚未为您配置服务群成员，请联系服务团队。配置完成后点击右上角刷新。</Text>}
    </ScrollView> : <>
      <Text style={styles.members}>服务团队：{selected.staff.map(person => person.name).join('、')} · 团队负责人可查看</Text>
      <ScrollView ref={listRef} style={styles.list} onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}>
        {messages.map(message => <View key={message.id} style={[styles.bubble,
          message.senderType === 'customer' ? styles.mine : styles.staff]}>
          {message.senderAvatar && <Image source={{ uri: mediaUrl(message.senderAvatar) }} style={{ width: 36, height: 36, borderRadius: 18, marginBottom: 6 }} />}
          <Text style={styles.sender}>{message.senderName}{message.senderType !== 'customer' && ` · ${({ai:'嘉医汇AI健康管家',familyDoctor:'健康顾问',nutritionist:'营养师',healthManager:'健管专员',medicalAssistant:'就医专员'})[message.senderRole] || '服务人员'}`} · {stamp(message.createdAt)}</Text>
          <Text style={styles.body}>{message.content}</Text>
          {message.mentions?.map(p=><Text key={p.id} style={{color:'#187e87'}} onPress={()=>Alert.alert(p.name,p.role || '服务成员')}>@{p.name}</Text>)}
        </View>)}
      </ScrollView>
      {selected.status==='closed'?<Text style={styles.note}>本次服务已结束，历史记录仅供查看。</Text>:<>
      {showMentions&&<View>{selected.staff.map(p=><TouchableOpacity key={p.id} onPress={()=>{setMentionIds(ids=>[...new Set([...ids,String(p.id)])]);setDraft(t=>t+'@'+p.name+' ');setShowMentions(false);}}><Text style={{padding:10}}>{p.name}</Text></TouchableOpacity>)}</View>}
      <View style={styles.composer}>
        <TouchableOpacity onPress={()=>setShowMentions(!showMentions)}><Text style={{padding:10}}>@</Text></TouchableOpacity>
        <TextInput value={draft} onChangeText={setDraft} multiline maxLength={2000}
          placeholder="给服务团队发消息" style={styles.input} />
        <TouchableOpacity style={styles.send} onPress={send} disabled={busy || !draft.trim()}>
          <Text style={styles.startText}>发送</Text>
        </TouchableOpacity>
      </View>
      </>}
    </>}
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: { padding: 16, paddingTop: 48, backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: colors.textPrimary, fontSize: 18, fontWeight: '700' },
  error: { color: '#b42318', padding: 12 },
  list: { flex: 1, padding: 16 },
  note: { color: colors.textMuted, fontSize: 13, lineHeight: 20 },
  group: { padding: 18, backgroundColor: '#fff', borderRadius: 12, marginTop: 12 },
  groupTitle: { fontSize: 17, fontWeight: '700', color: colors.textPrimary, marginBottom: 5 },
  start: { backgroundColor: colors.primary, padding: 14, borderRadius: 9, marginTop: 20, alignItems: 'center' },
  startText: { color: '#fff', fontWeight: '700' },
  members: { padding: 12, color: colors.textMuted },
  bubble: { maxWidth: '85%', borderRadius: 12, padding: 12, marginBottom: 10 },
  mine: { alignSelf: 'flex-end', backgroundColor: '#d8efe4' },
  staff: { alignSelf: 'flex-start', backgroundColor: '#fff' },
  sender: { color: colors.textMuted, fontSize: 11, marginBottom: 4 },
  body: { color: colors.textPrimary, lineHeight: 21 },
  composer: { flexDirection: 'row', backgroundColor: '#fff', padding: 10, alignItems: 'flex-end' },
  input: { flex: 1, maxHeight: 100, minHeight: 42, borderWidth: 1, borderColor: '#d8e2dc', borderRadius: 8, padding: 9 },
  send: { backgroundColor: colors.primary, padding: 12, marginLeft: 8, borderRadius: 8 },
});

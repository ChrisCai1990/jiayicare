import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  SafeAreaView, TextInput, KeyboardAvoidingView, Platform,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, shadow } from '../../theme';
import { useAuth } from '../../context/AuthContext';
import { chatAPI } from '../../services/api';
import tts from '../../utils/tts';

const ASSISTANT = { label: '小嘉', icon: 'sparkles', color: colors.primary };

const QUICK_QUESTIONS = [
  '我的血压最近偏高，怎么办？',
  '高血压患者饮食上要注意什么？',
  '我应该多久测一次血糖？',
  '睡眠不好对血压有影响吗？',
];

const TRANSFER_MSG = '您好，我需要联系专员咨询。';

const DISCLAIMER = '本回复由AI生成，仅供健康参考，不构成医疗诊断或建议。';

function MessageBubble({ msg, speaking, onSpeak, onRecall }) {
  const isUser = msg.role === 'user';
  // 只有AI回复且有实际文字内容时才提供语音播报
  const canSpeak = !isUser && !!(msg.content || '').trim();
  // 撤回仅对本轮会话里用户自己发的消息开放：历史记录(id以h-开头)已进入AI已读的上下文，撤回也无法让AI忘记，容易造成误解
  const canRecall = isUser && typeof msg.id === 'number';
  return (
    <View style={[styles.msgRow, isUser && styles.msgRowUser]}>
      {!isUser && (
        <View style={[styles.msgAvatar, { backgroundColor: (msg.roleColor || colors.primary) + '20' }]}>
          <Ionicons name={msg.roleIcon || 'person'} size={16} color={msg.roleColor || colors.primary} />
        </View>
      )}
      <TouchableOpacity
        activeOpacity={canRecall ? 0.7 : 1}
        onLongPress={canRecall ? () => onRecall(msg) : undefined}
        style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAI]}
      >
        {!isUser && msg.roleName && (
          <Text style={[styles.bubbleRole, { color: msg.roleColor || colors.primary }]}>{msg.roleName}</Text>
        )}
        <Text style={[styles.bubbleText, isUser && styles.bubbleTextUser]}>{msg.content}</Text>
        {!isUser && (
          <Text style={styles.disclaimer}>{DISCLAIMER}</Text>
        )}
        <View style={styles.bubbleFooter}>
          {canSpeak && (
            <TouchableOpacity style={styles.speakChip} onPress={() => onSpeak(msg)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons
                name={speaking ? 'volume-high' : 'volume-high-outline'}
                size={13}
                color={speaking ? colors.primary : colors.textMuted}
              />
              <Text style={[styles.speakChipText, speaking && { color: colors.primary }]}>
                {speaking ? '播放中' : '播报'}
              </Text>
            </TouchableOpacity>
          )}
          <Text style={[styles.bubbleTime, isUser && { color: 'rgba(255,255,255,0.6)' }]}>
            {canRecall ? `${msg.time} · 长按撤回` : msg.time}
          </Text>
        </View>
      </TouchableOpacity>
    </View>
  );
}

export default function ChatScreen({ navigation, route }) {
  const { user } = useAuth();
  // 从AI健康分析/风险评估页跳转时带来的开场白与预填问题
  const initialPrompt = route?.params?.initialPrompt;
  const greeting = route?.params?.greeting;
  const [messages, setMessages] = useState([
    {
      id: 1, role: 'ai',
      content: greeting || '您好，我是小嘉，您的AI健康助手。可以帮您解答健康科普问题、解读指标数据、用药提醒，也能咨询服务套餐和就医流程。请问有什么可以帮您？',
      roleIcon: ASSISTANT.icon, roleColor: ASSISTANT.color, roleName: ASSISTANT.label,
      time: '刚刚',
    },
  ]);
  const [input, setInput] = useState(initialPrompt || '');
  const [isLoading, setIsLoading] = useState(false);
  const [transferred, setTransferred] = useState(false);
  const [speakingId, setSpeakingId] = useState(null);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const scrollRef = useRef(null);

  const now = () => new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  const fmtTime = (d) => new Date(d).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

  // 加载历史对话记录：此前每次进入/离开页面都会清空对话（messages只存在组件本地state），
  // 后端 ChatLog 其实一直有完整记录，只是从未被读取过。现在挂载时拉取最近的对话拼在欢迎语之后，
  // 让用户切换页面再回来还能看到之前聊过的内容。每条 ChatLog 是一轮问答合并存的，拆成 user+assistant 两条。
  useEffect(() => {
    if (!user?._id || historyLoaded) return;
    chatAPI.getLogs(user._id).then(res => {
      if (!res.success || !Array.isArray(res.data) || res.data.length === 0) return;
      const historyMsgs = [...res.data].reverse().flatMap(log => ([
        { id: `h-${log._id}-u`, role: 'user', content: log.userMessage, time: fmtTime(log.createdAt) },
        // aiReply 为空的历史记录（如转人工场景）不渲染成空气泡
        log.aiReply ? { id: `h-${log._id}-a`, role: 'assistant', content: log.aiReply, roleIcon: ASSISTANT.icon, roleColor: ASSISTANT.color, roleName: ASSISTANT.label, time: fmtTime(log.createdAt) } : null,
      ].filter(Boolean)));
      setMessages(prev => [prev[0], ...historyMsgs]);
    }).catch(() => {}).finally(() => setHistoryLoaded(true));
  }, [user?._id]);

  // Build user context for AI
  const buildUserInfo = () => ({
    name:       user?.name,
    age:        user?.age,
    gender:     user?.gender,
    conditions: user?.healthProfile?.pastHistory,
    medications:user?.healthProfile?.medicHistory,
  });

  const transferToHuman = async () => {
    if (transferred) return;
    const lastMsg = [...messages].reverse().find(m => m.role === 'user')?.content || '';
    try { await chatAPI.transfer(lastMsg); } catch {}
    setTransferred(true);
    setMessages(prev => [...prev, {
      id: Date.now(), role: 'assistant',
      content: '已通知健管专员，稍后将有专员与您联系。如紧急情况请直接拨打急救电话。',
      roleIcon: ASSISTANT.icon, roleColor: ASSISTANT.color, roleName: ASSISTANT.label,
      time: now(),
    }]);
  };

  const send = async (text) => {
    const msg = (text || input).trim();
    if (!msg || isLoading) return;
    setInput('');

    const userMsg = { id: Date.now(), role: 'user', content: msg, time: now() };
    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);

    // Build message history for API (user + assistant only, last 10)
    const history = [...messages, userMsg]
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.content,
      }))
      .slice(-10);

    // Ensure last message is from user
    if (history.length === 0 || history[history.length - 1].role !== 'user') {
      history.push({ role: 'user', content: msg });
    }

    try {
      const res = await chatAPI.send(history, buildUserInfo());
      const replyContent = res.success
        ? res.data.content
        : (res.message || 'AI暂时无法回复，请稍后再试。');

      setMessages(prev => [...prev, {
        id: Date.now() + 1, role: 'assistant',
        content: replyContent,
        roleIcon: ASSISTANT.icon, roleColor: ASSISTANT.color, roleName: ASSISTANT.label,
        time: now(),
      }]);
    } catch (err) {
      setMessages(prev => [...prev, {
        id: Date.now() + 1, role: 'assistant',
        content: err.message || '网络异常，请检查连接后重试。',
        roleIcon: ASSISTANT.icon, roleColor: ASSISTANT.color, roleName: ASSISTANT.label,
        time: now(),
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  }, [messages, isLoading]);

  // 撤回一条自己发的消息：消息内容可能有误需要改问，撤回后连带其后紧跟的AI回复一起移除（回复是针对该问题的，留着无意义）
  const recallMessage = (msg) => {
    setMessages(prev => {
      const idx = prev.findIndex(m => m.id === msg.id);
      if (idx === -1) return prev;
      const next = [...prev];
      next.splice(idx, 1);
      if (next[idx] && next[idx].role === 'assistant') next.splice(idx, 1);
      return next;
    });
  };

  // 语音播报某条AI回复；再次点击同一条则停止
  const handleSpeak = async (msg) => {
    if (speakingId === msg.id) {
      await tts.stop();
      setSpeakingId(null);
      return;
    }
    setSpeakingId(msg.id);
    try {
      const sound = await tts.speak(msg.content, 'chat');
      // 播放自然结束后停止并清除高亮状态（覆盖 tts 内部回调，需自行 stop 释放资源）
      sound?.setOnPlaybackStatusUpdate((status) => {
        if (status.didJustFinish) { tts.stop(); setSpeakingId(null); }
      });
    } catch (err) {
      setSpeakingId(null);
    }
  };

  // 离开页面时停止正在播放的语音
  useEffect(() => () => { tts.stop(); }, []);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.topBarCenter}>
          <Text style={styles.pageTitle}>AI 健康助手</Text>
          <View style={styles.onlineTag}>
            <View style={styles.onlineDot} />
            <Text style={styles.onlineText}>在线</Text>
          </View>
        </View>
        <TouchableOpacity onPress={transferToHuman} style={styles.transferBtn} disabled={transferred}>
          <Text style={[styles.transferBtnText, transferred && { color: colors.textMuted }]}>
            {transferred ? '已转人工' : '转人工'}
          </Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          style={styles.msgList}
          contentContainerStyle={{ padding: spacing.lg }}
        >
          {messages.map(msg => (
            <MessageBubble
              key={msg.id}
              msg={msg}
              speaking={speakingId === msg.id}
              onSpeak={handleSpeak}
              onRecall={recallMessage}
            />
          ))}

          {isLoading && (
            <View style={styles.msgRow}>
              <View style={[styles.msgAvatar, { backgroundColor: ASSISTANT.color + '20' }]}>
                <Ionicons name={ASSISTANT.icon} size={16} color={ASSISTANT.color} />
              </View>
              <View style={styles.typingBubble}>
                <ActivityIndicator size="small" color={ASSISTANT.color} />
                <Text style={styles.typingText}>正在思考…</Text>
              </View>
            </View>
          )}
        </ScrollView>

        {/* Quick questions — show when conversation is fresh */}
        {messages.length <= 1 && (
          <ScrollView
            horizontal showsHorizontalScrollIndicator={false}
            style={styles.quickScroll}
            contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.sm }}
          >
            {QUICK_QUESTIONS.map((q, i) => (
              <TouchableOpacity key={i} style={styles.quickChip} onPress={() => send(q)} disabled={isLoading}>
                <Text style={styles.quickChipText}>{q}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* Input bar */}
        <View style={styles.inputBar}>
          <TextInput
            style={styles.inputField}
            placeholder="输入您的健康问题..."
            value={input}
            onChangeText={setInput}
            multiline
            maxLength={500}
            placeholderTextColor={colors.textMuted}
            onSubmitEditing={() => send()}
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!input.trim() || isLoading) && styles.sendBtnDisabled]}
            onPress={() => send()}
            disabled={!input.trim() || isLoading}
          >
            {isLoading
              ? <ActivityIndicator size="small" color={colors.white} />
              : <Ionicons name="send" size={18} color={colors.white} />
            }
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
    backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  topBarCenter: { alignItems: 'center' },
  pageTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  onlineTag: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  onlineDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.success },
  onlineText: { fontSize: 11, color: colors.success, fontWeight: '500' },
  msgList: { flex: 1 },
  msgRow: { flexDirection: 'row', marginBottom: spacing.md, alignItems: 'flex-end' },
  msgRowUser: { flexDirection: 'row-reverse' },
  msgAvatar: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
    marginRight: spacing.sm, marginBottom: 2,
  },
  bubble: { maxWidth: '75%', borderRadius: radius.md, padding: spacing.sm, ...shadow.xs },
  bubbleAI: { backgroundColor: colors.white, borderBottomLeftRadius: 4 },
  bubbleUser: { backgroundColor: colors.primary, borderBottomRightRadius: 4 },
  bubbleRole: { fontSize: 11, fontWeight: '700', marginBottom: 4, letterSpacing: 0.3 },
  bubbleText: { fontSize: 14, color: colors.textPrimary, lineHeight: 20 },
  bubbleTextUser: { color: colors.white },
  disclaimer: { fontSize: 10, color: colors.textMuted, marginTop: spacing.xs, lineHeight: 14, fontStyle: 'italic' },
  bubbleFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4, gap: spacing.sm },
  speakChip: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.full,
    backgroundColor: colors.primary + '12',
  },
  speakChipText: { fontSize: 11, color: colors.textMuted, fontWeight: '600' },
  bubbleTime: { fontSize: 10, color: colors.textMuted, textAlign: 'right', flexShrink: 0 },
  typingBubble: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    backgroundColor: colors.white, borderRadius: radius.md, padding: spacing.sm, ...shadow.xs,
  },
  typingText: { fontSize: 13, color: colors.textMuted },
  quickScroll: { maxHeight: 50, paddingVertical: spacing.xs },
  quickChip: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2,
    backgroundColor: colors.white, borderRadius: radius.full,
    borderWidth: 1.5, borderColor: colors.border, ...shadow.xs,
  },
  quickChipText: { fontSize: 13, color: colors.textSecondary },
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
    backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.border,
  },
  inputField: {
    flex: 1, backgroundColor: colors.background, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2,
    fontSize: 14, color: colors.textPrimary, maxHeight: 100,
    borderWidth: 1.5, borderColor: colors.border,
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', ...shadow.sm,
  },
  sendBtnDisabled: { backgroundColor: colors.textDisabled },
  transferBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border },
  transferBtnText: { fontSize: 12, color: colors.textSecondary, fontWeight: '500' },
});

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

const ROLES = [
  { id: 'manager', label: '健管专员', desc: '健康科普、指标解读、用药提醒', icon: 'person',    color: colors.primary },
  { id: 'planner', label: '健康规划师', desc: '服务介绍、套餐咨询、方案设计', icon: 'sparkles', color: colors.accent  },
  { id: 'medical', label: '就医专员', desc: '就医流程、陪诊服务、分诊建议', icon: 'medical',   color: colors.warning },
];

const QUICK_QUESTIONS = [
  '我的血压最近偏高，怎么办？',
  '高血压患者饮食上要注意什么？',
  '我应该多久测一次血糖？',
  '睡眠不好对血压有影响吗？',
];

const DISCLAIMER = '本回复由AI生成，仅供健康参考，不构成医疗诊断或建议。';

function MessageBubble({ msg }) {
  const isUser = msg.role === 'user';
  return (
    <View style={[styles.msgRow, isUser && styles.msgRowUser]}>
      {!isUser && (
        <View style={[styles.msgAvatar, { backgroundColor: (msg.roleColor || colors.primary) + '20' }]}>
          <Ionicons name={msg.roleIcon || 'person'} size={16} color={msg.roleColor || colors.primary} />
        </View>
      )}
      <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAI]}>
        {!isUser && msg.roleName && (
          <Text style={[styles.bubbleRole, { color: msg.roleColor || colors.primary }]}>{msg.roleName}</Text>
        )}
        <Text style={[styles.bubbleText, isUser && styles.bubbleTextUser]}>{msg.content}</Text>
        {!isUser && (
          <Text style={styles.disclaimer}>{DISCLAIMER}</Text>
        )}
        <Text style={[styles.bubbleTime, isUser && { color: 'rgba(255,255,255,0.6)' }]}>{msg.time}</Text>
      </View>
    </View>
  );
}

export default function ChatScreen({ navigation }) {
  const { user } = useAuth();
  const [activeRole, setActiveRole] = useState(ROLES[0]);
  const [messages, setMessages] = useState([
    {
      id: 1, role: 'ai',
      content: '您好！我是您的健管专员AI助手。我可以回答健康科普问题、解读指标数据、提供用药提醒建议。请问有什么可以帮您？',
      roleIcon: 'person', roleColor: colors.primary, roleName: '健管专员',
      time: '刚刚',
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef(null);

  const now = () => new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

  const switchRole = (role) => {
    setActiveRole(role);
    setMessages([{
      id: Date.now(), role: 'ai',
      content: `已切换到${role.label}模式。${role.desc}，有什么可以帮您？`,
      roleIcon: role.icon, roleColor: role.color, roleName: role.label,
      time: now(),
    }]);
  };

  // Build user context for AI
  const buildUserInfo = () => ({
    name:       user?.name,
    age:        user?.age,
    gender:     user?.gender,
    conditions: user?.healthProfile?.pastHistory,
    medications:user?.healthProfile?.medicHistory,
  });

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
      const res = await chatAPI.send(history, activeRole.id, buildUserInfo());
      const replyContent = res.success
        ? res.data.content
        : (res.message || 'AI暂时无法回复，请稍后再试。');

      setMessages(prev => [...prev, {
        id: Date.now() + 1, role: 'assistant',
        content: replyContent,
        roleIcon: activeRole.icon, roleColor: activeRole.color, roleName: activeRole.label,
        time: now(),
      }]);
    } catch (err) {
      setMessages(prev => [...prev, {
        id: Date.now() + 1, role: 'assistant',
        content: err.message || '网络异常，请检查连接后重试。',
        roleIcon: activeRole.icon, roleColor: activeRole.color, roleName: activeRole.label,
        time: now(),
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  }, [messages, isLoading]);

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
        <View style={{ width: 36 }} />
      </View>

      {/* Role switch */}
      <ScrollView
        horizontal showsHorizontalScrollIndicator={false}
        style={styles.roleScroll}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.sm }}
      >
        {ROLES.map(role => (
          <TouchableOpacity
            key={role.id}
            style={[styles.roleChip, activeRole.id === role.id && { borderColor: role.color, backgroundColor: role.color + '12' }]}
            onPress={() => switchRole(role)}
          >
            <Ionicons name={role.icon} size={14} color={activeRole.id === role.id ? role.color : colors.textMuted} />
            <Text style={[styles.roleChipText, activeRole.id === role.id && { color: role.color, fontWeight: '700' }]}>
              {role.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          style={styles.msgList}
          contentContainerStyle={{ padding: spacing.lg }}
        >
          {messages.map(msg => <MessageBubble key={msg.id} msg={msg} />)}

          {isLoading && (
            <View style={styles.msgRow}>
              <View style={[styles.msgAvatar, { backgroundColor: activeRole.color + '20' }]}>
                <Ionicons name={activeRole.icon} size={16} color={activeRole.color} />
              </View>
              <View style={styles.typingBubble}>
                <ActivityIndicator size="small" color={activeRole.color} />
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
  roleScroll: { maxHeight: 50, paddingVertical: spacing.xs, backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.border },
  roleChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: spacing.sm + 2, paddingVertical: 6,
    borderRadius: radius.full, borderWidth: 1.5, borderColor: colors.border,
    backgroundColor: colors.white,
  },
  roleChipText: { fontSize: 12, color: colors.textMuted, fontWeight: '500' },
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
  bubbleTime: { fontSize: 10, color: colors.textMuted, marginTop: 4, textAlign: 'right' },
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
});

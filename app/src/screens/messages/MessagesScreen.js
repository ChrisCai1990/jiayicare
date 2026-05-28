import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, SafeAreaView, RefreshControl, Modal,
  TextInput, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, shadow } from '../../theme';
import { messagesAPI, pushRecordsAPI } from '../../services/api';
import { mockMessages } from '../../data/mockData';
import { useAuth } from '../../context/AuthContext';
import Avatar from '../../components/Avatar';
import EmptyState from '../../components/EmptyState';

const TYPE_CONFIG = {
  doctor:        { icon: 'medical',           color: colors.primary },
  manager:       { icon: 'person',            color: colors.accent  },
  system:        { icon: 'notifications',     color: colors.warning },
  knowledge:     { icon: 'book-outline',      color: '#22A06B'      },
  plan:          { icon: 'clipboard-outline', color: '#D97706'      },
  questionnaire: { icon: 'document-text-outline', color: '#0077B6'  },
  supplement:    { icon: 'nutrition-outline', color: '#8e44ad'      },
  product:       { icon: 'bag-outline',       color: '#1E6B50'      },
  notice:        { icon: 'megaphone-outline', color: '#666'         },
};

// push records 转换为统一消息格式
const PUSH_TYPE_LABEL = {
  knowledge: '健康科普', plan: '健康方案', questionnaire: '问卷调查',
  supplement: '营养推荐', product: '产品推送', notice: '通知',
};

function normalizePushRecord(pr) {
  return {
    _id: pr._id,
    isPushRecord: true,
    type: pr.type,
    sender: pr.staffId?.name || '健康管理团队',
    title: PUSH_TYPE_LABEL[pr.type] || '推送通知',
    content: pr.title + (pr.content ? `\n${pr.content}` : ''),
    unread: !pr.readAt,
    time: new Date(pr.createdAt).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }),
    createdAt: pr.createdAt,
    // 产品推送专用
    price: pr.price || null,
    productName: pr.title || '',
    productId: pr.productId || null,
  };
}

function MessageItem({ msg, onPress }) {
  const conf = TYPE_CONFIG[msg.type] || TYPE_CONFIG.system;
  return (
    <TouchableOpacity
      style={[styles.msgItem, msg.unread && styles.msgItemUnread]}
      activeOpacity={0.7}
      onPress={() => onPress(msg)}
    >
      <View style={styles.msgAvatarWrap}>
        <Avatar name={msg.sender} size={46} />
        <View style={[styles.msgTypeIcon, { backgroundColor: conf.color }]}>
          <Ionicons name={conf.icon} size={10} color={colors.white} />
        </View>
        {msg.unread && <View style={styles.unreadDot} />}
      </View>
      <View style={styles.msgContent}>
        <View style={styles.msgHeader}>
          <Text style={styles.msgSender}>{msg.sender}</Text>
          <Text style={styles.msgTime}>{msg.time || '今天'}</Text>
        </View>
        <Text
          style={[styles.msgText, msg.unread && styles.msgTextUnread]}
          numberOfLines={2}
        >
          {msg.content}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={15} color={colors.textMuted} />
    </TouchableOpacity>
  );
}

function MessageDetailModal({ msg, onClose, onBuyIntent }) {
  if (!msg) return null;
  const conf = TYPE_CONFIG[msg.type] || TYPE_CONFIG.system;
  const isProduct = msg.type === 'product' && msg.price;

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.detailOverlay}>
        <View style={styles.detailCard}>
          {/* Handle */}
          <View style={styles.detailHandle} />

          {/* Header */}
          <View style={styles.detailHeader}>
            <View style={styles.detailSenderRow}>
              <View style={[styles.detailIconWrap, { backgroundColor: conf.color + '18' }]}>
                <Ionicons name={conf.icon} size={22} color={conf.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.detailSender}>{msg.sender}</Text>
                <Text style={styles.detailTime}>{msg.time || '今天'}</Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Title */}
          {msg.title && (
            <Text style={styles.detailTitle}>{msg.title}</Text>
          )}

          {/* Product price card */}
          {isProduct && (
            <View style={styles.productPriceCard}>
              <Ionicons name="bag-outline" size={18} color={colors.primary} />
              <Text style={styles.productPriceText}>推荐价格</Text>
              <Text style={styles.productPriceNum}>¥{msg.price?.toFixed?.(2) || msg.price}</Text>
            </View>
          )}

          {/* Content */}
          <ScrollView style={styles.detailBody} showsVerticalScrollIndicator={false}>
            <Text style={styles.detailContent}>{msg.content}</Text>
            {isProduct && (
              <Text style={[styles.detailContent, { color: colors.textMuted, fontSize: 12, marginTop: 8 }]}>
                如需购买，请点击下方「我要购买」，健管师将为您安排后续服务。
              </Text>
            )}
          </ScrollView>

          {/* Buttons */}
          <View style={styles.detailFooter}>
            {isProduct ? (
              <>
                <TouchableOpacity style={[styles.detailCloseBtn, { flex: 1 }]} onPress={onClose} activeOpacity={0.85}>
                  <Text style={styles.detailCloseBtnText}>关闭</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.detailBuyBtn, { flex: 2 }]}
                  activeOpacity={0.85}
                  onPress={() => { onClose(); onBuyIntent(msg.productName); }}
                >
                  <Ionicons name="card-outline" size={16} color={colors.white} />
                  <Text style={styles.detailBuyBtnText}>我要购买 ¥{msg.price}</Text>
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity style={[styles.detailCloseBtn, { flex: 1 }]} onPress={onClose} activeOpacity={0.85}>
                <Text style={styles.detailCloseBtnText}>关闭</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── 撰写消息 Modal ────────────────────────────────────────────────
const RECIPIENTS = [
  { key: 'doctor',       label: '家庭医师', icon: 'medical',           color: colors.primary },
  { key: 'nutritionist', label: '营养师',   icon: 'nutrition-outline', color: '#059669'      },
  { key: 'manager',      label: '健管师',   icon: 'person',            color: colors.accent  },
];

function ComposeModal({ visible, onClose, onSent, initialContent = '' }) {
  const [to, setTo]           = useState('manager');
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError]     = useState('');

  // 有预填内容时更新
  useEffect(() => {
    if (visible && initialContent) {
      setContent(initialContent);
      setTo('manager');
    }
  }, [visible, initialContent]);

  const reset = () => { setTo('manager'); setContent(''); setError(''); };

  const handleClose = () => { reset(); onClose(); };

  const send = async () => {
    if (!content.trim()) { setError('请输入消息内容'); return; }
    setSending(true); setError('');
    try {
      const res = await messagesAPI.send(to, content.trim());
      if (res.success) { reset(); onSent(); }
      else { setError(res.message || '发送失败，请稍后重试'); }
    } catch (e) {
      setError(e.message || '网络错误');
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <TouchableOpacity style={styles.composeOverlay} activeOpacity={1} onPress={handleClose} />
        <View style={styles.composeCard}>
          <View style={styles.detailHandle} />
          <View style={styles.composeHeader}>
            <Text style={styles.composeTitle}>发送消息</Text>
            <TouchableOpacity onPress={handleClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* 收件人选择 */}
          <Text style={styles.composeLabel}>发送给</Text>
          <View style={styles.recipientRow}>
            {RECIPIENTS.map(r => (
              <TouchableOpacity
                key={r.key}
                style={[styles.recipientChip, to === r.key && { borderColor: r.color, backgroundColor: r.color + '10' }]}
                onPress={() => setTo(r.key)}
                activeOpacity={0.8}
              >
                <Ionicons name={r.icon} size={14} color={to === r.key ? r.color : colors.textMuted} />
                <Text style={[styles.recipientChipText, to === r.key && { color: r.color, fontWeight: '700' }]}>
                  {r.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* 消息内容 */}
          <Text style={[styles.composeLabel, { marginTop: 16 }]}>消息内容</Text>
          <TextInput
            style={styles.composeTextArea}
            placeholder="请输入您想告诉家庭医师、营养师或健管师的内容……"
            placeholderTextColor={colors.textMuted}
            value={content}
            onChangeText={t => { setContent(t); setError(''); }}
            multiline
            numberOfLines={5}
            maxLength={500}
            textAlignVertical="top"
            autoFocus
          />
          <Text style={styles.composeCharCount}>{content.length}/500</Text>

          {!!error && <Text style={styles.composeError}>{error}</Text>}

          <TouchableOpacity
            style={[styles.composeSendBtn, (sending || !content.trim()) && { opacity: 0.55 }]}
            onPress={send}
            disabled={sending || !content.trim()}
            activeOpacity={0.85}
          >
            {sending
              ? <ActivityIndicator color={colors.white} size="small" />
              : <Text style={styles.composeSendBtnText}>发送</Text>
            }
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export default function MessagesScreen({ navigation }) {
  const { isDemo } = useAuth();
  const [activeTab, setActiveTab] = useState('全部');
  const [messages, setMessages] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedMsg, setSelectedMsg] = useState(null);
  const [composing, setComposing] = useState(false);
  const [composeInit, setComposeInit] = useState('');

  const tabs = ['全部', '专属团队', '系统', '推送'];

  const loadMessages = useCallback(async () => {
    try {
      const [msgRes, pushRes] = await Promise.allSettled([
        messagesAPI.list(),
        pushRecordsAPI.list(),
      ]);

      const msgData = msgRes.status === 'fulfilled' && msgRes.value?.success
        ? msgRes.value.data : [];
      const pushData = pushRes.status === 'fulfilled' && pushRes.value?.success
        ? pushRes.value.data.map(normalizePushRecord) : [];

      // 合并后按时间排序（最新在前）
      const all = [...msgData, ...pushData].sort(
        (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
      );

      if (all.length > 0) setMessages(all);
      else setMessages(isDemo ? mockMessages : []);
    } catch {
      setMessages(isDemo ? mockMessages : []);
    } finally {
      setRefreshing(false);
    }
  }, [isDemo]);

  useEffect(() => { loadMessages(); }, [loadMessages]);

  const handlePress = async (msg) => {
    const msgId = msg._id || msg.id;
    setSelectedMsg(msg);
    if (msg.unread) {
      setMessages(prev =>
        prev.map(m => (m._id || m.id) === msgId ? { ...m, unread: false } : m)
      );
      try {
        if (msg.isPushRecord) await pushRecordsAPI.markRead(msgId);
        else await messagesAPI.markRead(msgId);
      } catch {}
    }
  };

  const unreadCount = messages.filter(m => m.unread).length;

  const PUSH_TYPES = new Set(['knowledge', 'plan', 'questionnaire', 'supplement', 'product', 'notice']);
  const filtered = messages.filter(m => {
    if (activeTab === '专属团队') return m.type === 'doctor' || m.type === 'manager';
    if (activeTab === '系统') return m.type === 'system';
    if (activeTab === '推送') return PUSH_TYPES.has(m.type);
    return true;
  });

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.pageTitle}>消息中心</Text>
          <Text style={styles.pageSubtitle}>来自医生和健管师的通知</Text>
        </View>
        {unreadCount > 0 && (
          <View style={styles.unreadBadge}>
            <View style={styles.unreadDotSmall} />
            <Text style={styles.unreadBadgeText}>{unreadCount} 条未读</Text>
          </View>
        )}
      </View>

      {/* AI Health Chat entry */}
      <TouchableOpacity style={styles.aiCard} onPress={() => navigation.navigate('Chat')}>
        <View style={styles.aiLeft}>
          <View style={styles.aiIconWrap}>
            <Ionicons name="sparkles" size={24} color={colors.white} />
          </View>
          <View>
            <Text style={styles.aiTitle}>AI 健康助手</Text>
            <Text style={styles.aiSubtitle}>随时问我健康问题，24小时在线</Text>
          </View>
        </View>
        <View style={styles.aiArrow}>
          <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.7)" />
        </View>
      </TouchableOpacity>

      {/* Tabs */}
      <View style={styles.tabs}>
        {tabs.map(tab => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>{tab}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        style={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); loadMessages(); }}
            tintColor={colors.primary}
          />
        }
      >
        {filtered.length === 0 ? (
          <EmptyState
            icon="chatbubble-ellipses-outline"
            title="暂无消息"
            subtitle="来自医生和健管师的消息会显示在这里"
            color={colors.primary}
          />
        ) : (
          filtered.map((msg, i) => (
            <MessageItem key={msg._id || msg.id || i} msg={msg} onPress={handlePress} />
          ))
        )}
        <View style={{ height: spacing.xl }} />
      </ScrollView>

      {/* Message detail modal */}
      {selectedMsg && (
        <MessageDetailModal
          msg={selectedMsg}
          onClose={() => setSelectedMsg(null)}
          onBuyIntent={(productName) => {
            setComposeInit(`我想购买「${productName}」，请帮我安排。`);
            setComposing(true);
          }}
        />
      )}

      {/* Compose FAB */}
      <TouchableOpacity
        style={styles.composeFab}
        onPress={() => setComposing(true)}
        activeOpacity={0.85}
      >
        <Ionicons name="create-outline" size={22} color={colors.white} />
      </TouchableOpacity>

      {/* Compose modal */}
      <ComposeModal
        visible={composing}
        onClose={() => { setComposing(false); setComposeInit(''); }}
        onSent={() => { setComposing(false); setComposeInit(''); loadMessages(); }}
        initialContent={composeInit}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md, paddingBottom: spacing.md,
    backgroundColor: colors.background,
    borderBottomWidth: 1, borderBottomColor: colors.borderLight,
  },
  pageTitle: { fontSize: 24, fontWeight: '800', color: colors.textPrimary, letterSpacing: -0.5 },
  pageSubtitle: { fontSize: 12, color: colors.textMuted, marginTop: 3 },
  unreadBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: colors.warning10,
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: radius.full,
    borderWidth: 1, borderColor: colors.warning + '40',
  },
  unreadDotSmall: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.warning },
  unreadBadgeText: { fontSize: 12, color: colors.warning, fontWeight: '600' },
  aiCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    backgroundColor: '#1A2B24',
    borderRadius: radius.md,
    padding: spacing.md,
  },
  aiLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  aiIconWrap: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  aiTitle: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
  aiSubtitle: { fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 2 },
  aiArrow: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    gap: spacing.md,
  },
  tab: {
    paddingVertical: spacing.xs, paddingHorizontal: spacing.sm,
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: colors.primary },
  tabText: { fontSize: 14, color: colors.textSecondary, fontWeight: '500' },
  tabTextActive: { color: colors.primary, fontWeight: '700' },
  list: { flex: 1 },
  msgItem: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.white,
    paddingHorizontal: spacing.md, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: colors.borderLight,
    borderLeftWidth: 3, borderLeftColor: 'transparent',
  },
  msgItemUnread: { backgroundColor: colors.white, borderLeftColor: colors.primary },
  msgAvatarWrap: { position: 'relative', marginRight: spacing.sm },
  msgTypeIcon: {
    position: 'absolute', bottom: -1, right: -1,
    width: 18, height: 18, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: colors.white,
  },
  unreadDot: {
    position: 'absolute', top: 0, right: 0,
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: colors.danger,
    borderWidth: 1.5, borderColor: colors.white,
  },
  msgContent: { flex: 1 },
  msgHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 3,
  },
  msgSender: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  msgTime: { fontSize: 11, color: colors.textMuted },
  msgText: { fontSize: 13, color: colors.textSecondary, lineHeight: 19 },
  msgTextUnread: { color: colors.textPrimary, fontWeight: '500' },
  // Detail modal
  detailOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end',
  },
  detailCard: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: spacing.lg, paddingBottom: spacing.xl,
    maxHeight: '75%',
  },
  detailHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center', marginTop: 12, marginBottom: 16,
  },
  detailHeader: {
    flexDirection: 'row', alignItems: 'flex-start',
    justifyContent: 'space-between', marginBottom: spacing.md,
  },
  detailSenderRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 },
  detailIconWrap: {
    width: 44, height: 44, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  detailSender: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  detailTime: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  detailTitle: {
    fontSize: 17, fontWeight: '700', color: colors.textPrimary,
    marginBottom: spacing.sm, lineHeight: 24,
  },
  detailBody: { flex: 1, marginBottom: spacing.md },
  detailContent: {
    fontSize: 15, color: colors.textSecondary,
    lineHeight: 24, letterSpacing: 0.1,
  },
  detailFooter: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  detailCloseBtn: {
    backgroundColor: colors.primary, borderRadius: radius.md,
    paddingVertical: 14, alignItems: 'center',
  },
  detailCloseBtnText: { color: colors.white, fontSize: 16, fontWeight: '700' },
  detailBuyBtn: {
    backgroundColor: '#D97706', borderRadius: radius.md,
    paddingVertical: 14, alignItems: 'center',
    flexDirection: 'row', justifyContent: 'center', gap: 6,
  },
  detailBuyBtnText: { color: colors.white, fontSize: 15, fontWeight: '700' },
  productPriceCard: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#FEF3E2', borderRadius: radius.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    marginHorizontal: spacing.lg, marginBottom: spacing.sm,
    borderWidth: 1, borderColor: '#FBBF24',
  },
  productPriceText: { fontSize: 13, color: '#92400E', flex: 1 },
  productPriceNum: { fontSize: 18, fontWeight: '800', color: '#D97706' },

  // Compose FAB
  composeFab: {
    position: 'absolute', bottom: 24, right: 20,
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },

  // Compose modal
  composeOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.4)',
  },
  composeCard: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: spacing.lg, paddingBottom: spacing.xl + 8,
  },
  composeHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  composeTitle: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },
  composeLabel: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginBottom: spacing.xs },
  recipientRow: { flexDirection: 'row', gap: spacing.sm },
  recipientChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 9,
    borderRadius: radius.full, borderWidth: 1.5, borderColor: colors.border,
  },
  recipientChipText: { fontSize: 13, color: colors.textSecondary },
  composeTextArea: {
    backgroundColor: colors.background, borderRadius: radius.sm,
    borderWidth: 1.5, borderColor: colors.border,
    paddingHorizontal: spacing.sm, paddingVertical: spacing.sm,
    fontSize: 14, color: colors.textPrimary, minHeight: 110,
  },
  composeCharCount: { fontSize: 11, color: colors.textMuted, textAlign: 'right', marginTop: 4, marginBottom: 4 },
  composeError: { fontSize: 12, color: colors.danger, marginBottom: spacing.sm },
  composeSendBtn: {
    backgroundColor: colors.primary, borderRadius: radius.md,
    paddingVertical: 14, alignItems: 'center', marginTop: spacing.sm,
  },
  composeSendBtnText: { color: colors.white, fontSize: 15, fontWeight: '700' },
});

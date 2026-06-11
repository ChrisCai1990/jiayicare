import React, { useState, useEffect, useCallback, useRef } from 'react';
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
    products: pr.products || [],
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

const CAT_COLOR_MAP = {
  '检测套餐': '#0077B6', '专家咨询': '#1E6B50', '上门服务': '#22A06B',
  '健康课程': '#8e44ad', '服务包': '#D97706',
};

function ProductPushDetail({ msg, onClose }) {
  // products 数组：新版多产品；兜底：用旧版单产品构造一条
  const productList = (msg.products && msg.products.length > 0)
    ? msg.products
    : (msg.productId ? [{ productId: msg.productId, name: msg.productName, price: msg.price, category: '', icon: '🛍' }] : []);

  const [checkedIds, setCheckedIds] = useState(() => productList.map(p => p.productId));
  const [paying, setPaying] = useState(false);
  const [paid, setPaid] = useState(false);
  const [payError, setPayError] = useState('');

  const toggleItem = (id) =>
    setCheckedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const allChecked = checkedIds.length === productList.length;
  const toggleAll = () =>
    setCheckedIds(allChecked ? [] : productList.map(p => p.productId));

  const checkedItems = productList.filter(p => checkedIds.includes(p.productId));
  const total = checkedItems.reduce((s, p) => s + (p.price || 0), 0);

  const handlePay = async () => {
    if (!checkedIds.length) return;
    setPaying(true); setPayError('');
    try {
      await pushRecordsAPI.pay(msg._id, { selectedProductIds: checkedIds });
      setPaid(true);
    } catch (e) {
      setPayError(e.message || '下单失败，请稍后重试');
    } finally {
      setPaying(false);
    }
  };

  if (paid) {
    return (
      <Modal visible animationType="slide" transparent onRequestClose={onClose}>
        <View style={styles.detailOverlay}>
          <View style={[styles.detailCard, { alignItems: 'center', paddingVertical: 40 }]}>
            <View style={styles.detailHandle} />
            <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.success + '20', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
              <Ionicons name="checkmark-circle" size={40} color={colors.success} />
            </View>
            <Text style={{ fontSize: 20, fontWeight: '800', color: colors.textPrimary, marginBottom: 8 }}>订单已提交</Text>
            <Text style={{ fontSize: 14, color: colors.textMuted, marginBottom: 8 }}>
              共 {checkedItems.length} 项，合计 ¥{total}
            </Text>
            <Text style={{ fontSize: 13, color: colors.textMuted, textAlign: 'center', paddingHorizontal: 32, lineHeight: 20, marginBottom: 32 }}>
              健管师将尽快与您确认并安排后续服务
            </Text>
            <TouchableOpacity style={[styles.detailBuyBtn, { paddingHorizontal: 40 }]} onPress={onClose} activeOpacity={0.85}>
              <Text style={styles.detailBuyBtnText}>完成</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.detailOverlay}>
        <View style={[styles.detailCard, { maxHeight: '85%' }]}>
          <View style={styles.detailHandle} />

          {/* Header */}
          <View style={styles.detailHeader}>
            <View style={styles.detailSenderRow}>
              <View style={[styles.detailIconWrap, { backgroundColor: colors.primary + '18' }]}>
                <Ionicons name="bag-outline" size={22} color={colors.primary} />
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

          {/* 标题 + 全选 */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm }}>
            <Text style={styles.detailTitle}>为您推荐以下产品</Text>
            <TouchableOpacity onPress={toggleAll} activeOpacity={0.7}>
              <Text style={{ fontSize: 13, color: colors.primary, fontWeight: '600' }}>
                {allChecked ? '取消全选' : '全选'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* 产品列表 */}
          <ScrollView style={styles.detailBody} showsVerticalScrollIndicator={false}>
            {productList.map((p) => {
              const isChecked = checkedIds.includes(p.productId);
              const catColor = CAT_COLOR_MAP[p.category] || colors.primary;
              return (
                <TouchableOpacity
                  key={p.productId}
                  onPress={() => toggleItem(p.productId)}
                  activeOpacity={0.8}
                  style={{
                    flexDirection: 'row', alignItems: 'center',
                    padding: spacing.sm, marginBottom: 8,
                    borderRadius: radius.sm,
                    borderWidth: 1.5,
                    borderColor: isChecked ? colors.primary : colors.border,
                    backgroundColor: isChecked ? colors.primary + '08' : colors.white,
                  }}
                >
                  {/* 复选框 */}
                  <View style={{
                    width: 22, height: 22, borderRadius: 6, marginRight: spacing.sm, flexShrink: 0,
                    borderWidth: 2, borderColor: isChecked ? colors.primary : '#ccc',
                    backgroundColor: isChecked ? colors.primary : colors.white,
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    {isChecked && <Ionicons name="checkmark" size={13} color={colors.white} />}
                  </View>
                  {/* 图标 */}
                  <View style={{
                    width: 40, height: 40, borderRadius: 10, marginRight: spacing.sm, flexShrink: 0,
                    backgroundColor: catColor + '15', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Text style={{ fontSize: 18 }}>{p.icon || '🛍'}</Text>
                  </View>
                  {/* 信息 */}
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: colors.textPrimary, marginBottom: 2 }}>{p.name}</Text>
                    {p.category ? (
                      <View style={{
                        alignSelf: 'flex-start', backgroundColor: catColor + '18',
                        borderRadius: 99, paddingHorizontal: 8, paddingVertical: 1,
                      }}>
                        <Text style={{ fontSize: 11, color: catColor }}>{p.category}</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={{ fontSize: 16, fontWeight: '800', color: colors.primary, marginLeft: spacing.sm }}>
                    ¥{p.price}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* 错误提示 */}
          {!!payError && (
            <Text style={{ fontSize: 12, color: colors.danger, textAlign: 'center', marginBottom: 6 }}>{payError}</Text>
          )}

          {/* 底部：合计 + 按钮 */}
          <View style={[styles.detailFooter, { flexDirection: 'column', gap: 10 }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 13, color: colors.textMuted }}>
                已选 {checkedIds.length}/{productList.length} 项
              </Text>
              <Text style={{ fontSize: 18, fontWeight: '800', color: colors.primary }}>
                合计 ¥{total}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <TouchableOpacity
                style={[styles.detailCloseBtn, { flex: 1 }]}
                onPress={onClose} activeOpacity={0.85}
              >
                <Text style={styles.detailCloseBtnText}>关闭</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.detailBuyBtn, { flex: 2, opacity: (!checkedIds.length || paying) ? 0.5 : 1 }]}
                activeOpacity={0.85}
                onPress={handlePay}
                disabled={!checkedIds.length || paying}
              >
                <Ionicons name="card-outline" size={16} color={colors.white} />
                <Text style={styles.detailBuyBtnText}>
                  {paying ? '提交中...' : `立即支付 ¥${total}`}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function MessageDetailModal({ msg, onClose, navigation, onReply }) {
  if (!msg) return null;

  // 产品推送：专用多选支付界面
  if (msg.type === 'product') {
    return <ProductPushDetail msg={msg} onClose={onClose} />;
  }

  const conf = TYPE_CONFIG[msg.type] || TYPE_CONFIG.system;

  // 方案/问卷类型的行动按钮
  const renderActionBtn = () => {
    if (msg.type === 'plan' && navigation) {
      return (
        <TouchableOpacity
          style={[styles.detailCloseBtn, { flex: 2, backgroundColor: '#D97706', borderWidth: 0 }]}
          onPress={() => { onClose(); navigation.navigate('ServicePlans'); }}
          activeOpacity={0.85}
        >
          <Text style={[styles.detailCloseBtnText, { color: colors.white }]}>查看健康方案</Text>
        </TouchableOpacity>
      );
    }
    if (msg.type === 'questionnaire' && navigation) {
      return (
        <TouchableOpacity
          style={[styles.detailCloseBtn, { flex: 2, backgroundColor: '#0077B6', borderWidth: 0 }]}
          onPress={() => { onClose(); navigation.navigate('Questionnaire'); }}
          activeOpacity={0.85}
        >
          <Text style={[styles.detailCloseBtnText, { color: colors.white }]}>填写问卷</Text>
        </TouchableOpacity>
      );
    }
    return null;
  };

  const actionBtn = renderActionBtn();

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.detailOverlay}>
        <View style={styles.detailCard}>
          <View style={styles.detailHandle} />
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
          {msg.title && <Text style={styles.detailTitle}>{msg.title}</Text>}
          <ScrollView style={styles.detailBody} showsVerticalScrollIndicator={false}>
            <Text style={styles.detailContent}>{msg.content || '（暂无详细内容，请点击下方按钮查看）'}</Text>
          </ScrollView>
          <View style={styles.detailFooter}>
            <TouchableOpacity style={[styles.detailCloseBtn, { flex: 1 }]} onPress={onClose} activeOpacity={0.85}>
              <Text style={styles.detailCloseBtnText}>关闭</Text>
            </TouchableOpacity>
            {(msg.type === 'doctor' || msg.type === 'manager') && onReply && (
              <TouchableOpacity
                style={[styles.detailCloseBtn, { flex: 1.5, backgroundColor: colors.primary, borderWidth: 0 }]}
                onPress={() => {
                  const to = msg.type === 'doctor' ? 'doctor' : 'manager';
                  onReply(to);
                  onClose();
                }}
                activeOpacity={0.85}
              >
                <Text style={[styles.detailCloseBtnText, { color: colors.white }]}>回复</Text>
              </TouchableOpacity>
            )}
            {actionBtn}
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

function ComposeModal({ visible, onClose, onSent, initialContent = '', initialTo = 'manager' }) {
  const [to, setTo]           = useState(initialTo);
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError]     = useState('');

  // 有预填内容/收件人时更新
  useEffect(() => {
    if (visible) {
      setContent(initialContent || '');
      setTo(initialTo || 'manager');
    }
  }, [visible, initialContent, initialTo]);

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
            onKeyPress={({ nativeEvent }) => {
              if (nativeEvent.key === 'Enter' && !nativeEvent.shiftKey) {
                send();
              }
            }}
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
  const [replyTo, setReplyTo] = useState('manager');
  const [threadRole, setThreadRole] = useState(null); // 打开线程的 role key

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

  // 切回消息页时自动刷新（同步医护端最新推送）
  useEffect(() => {
    const unsub = navigation?.addListener?.('focus', () => { loadMessages(); });
    return unsub;
  }, [navigation, loadMessages]);

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

      {/* 与医护对话入口 */}
      <View style={{ paddingHorizontal: spacing.lg, paddingVertical: spacing.sm }}>
        <Text style={{ fontSize: 12, color: colors.textMuted, fontWeight: '600', marginBottom: 8, letterSpacing: 0.4 }}>与医护对话</Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {[
            { key: 'doctor',       label: '家庭医师', icon: 'medical',           color: colors.primary },
            { key: 'manager',      label: '健管师',   icon: 'person',            color: '#D97706'      },
            { key: 'nutritionist', label: '营养师',   icon: 'nutrition-outline', color: '#059669'      },
          ].map(r => (
            <TouchableOpacity key={r.key} style={{ flex: 1, backgroundColor: colors.white, borderRadius: radius.sm, padding: spacing.sm, alignItems: 'center', gap: 4, ...shadow.xs, borderWidth: 1, borderColor: colors.border }} activeOpacity={0.8} onPress={() => setThreadRole(r.key)}>
              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: r.color + '18', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name={r.icon} size={18} color={r.color} />
              </View>
              <Text style={{ fontSize: 12, color: colors.textPrimary, fontWeight: '600' }}>{r.label}</Text>
              <Text style={{ fontSize: 10, color: colors.textMuted }}>点击对话</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

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
          navigation={navigation}
          onReply={(to) => { setReplyTo(to); setComposing(true); }}
        />
      )}

      {/* 对话线程 Modal */}
      {threadRole && (
        <ConversationThreadModal role={threadRole} onClose={() => setThreadRole(null)} />
      )}

      {/* Compose FAB */}
      <TouchableOpacity
        style={styles.composeFab}
        onPress={() => setComposing(true)}
        activeOpacity={0.85}
      >
        <Ionicons name="create-outline" size={22} color={colors.white} />
      </TouchableOpacity>

      {/* Compose FAB 点击时重置 replyTo */}
      {/* Compose modal */}
      <ComposeModal
        visible={composing}
        onClose={() => { setComposing(false); setReplyTo('manager'); }}
        onSent={() => { setComposing(false); setReplyTo('manager'); loadMessages(); }}
        initialContent=""
        initialTo={replyTo}
      />
    </SafeAreaView>
  );
}

// ── 对话线程 Modal ────────────────────────────────────────────────
const ROLE_META = {
  doctor:       { label: '家庭医师', icon: 'medical',           color: colors.primary },
  manager:      { label: '健管师',   icon: 'person',            color: '#D97706'      },
  nutritionist: { label: '营养师',   icon: 'nutrition-outline', color: '#059669'      },
};

function ConversationThreadModal({ role, onClose }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const scrollRef = useRef(null);
  const meta = ROLE_META[role] || ROLE_META.manager;

  const loadThread = async () => {
    try {
      const res = await messagesAPI.getThread(role);
      setMessages(res.data || []);
      setTimeout(() => scrollRef.current?.scrollToEnd?.({ animated: false }), 100);
    } catch {}
    finally { setLoading(false); }
  };

  useEffect(() => { loadThread(); }, [role]);

  const handleSend = async () => {
    if (!content.trim()) return;
    setSending(true); setError('');
    try {
      await messagesAPI.send(role, content.trim());
      setContent('');
      await loadThread();
      setTimeout(() => scrollRef.current?.scrollToEnd?.({ animated: true }), 150);
    } catch (e) {
      setError(e.message || '发送失败');
    } finally { setSending(false); }
  };

  const fmtTime = t => new Date(t).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}>
          <SafeAreaView style={{ backgroundColor: colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '90%', flex: 1, marginTop: 60 }}>
            {/* Header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border, gap: spacing.sm }}>
              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: meta.color + '18', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name={meta.icon} size={18} color={meta.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: colors.textPrimary }}>与{meta.label}对话</Text>
                <Text style={{ fontSize: 11, color: colors.textMuted }}>消息将发送给您的{meta.label}</Text>
              </View>
              <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* 消息区 */}
            <ScrollView ref={scrollRef} style={{ flex: 1, paddingHorizontal: spacing.md }} contentContainerStyle={{ paddingVertical: spacing.md, gap: 12 }} showsVerticalScrollIndicator={false}>
              {loading ? (
                <ActivityIndicator color={colors.primary} style={{ padding: 40 }} />
              ) : messages.length === 0 ? (
                <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                  <Ionicons name="chatbubbles-outline" size={40} color={colors.textMuted} />
                  <Text style={{ color: colors.textMuted, marginTop: 12, fontSize: 14 }}>暂无消息，发送第一条吧</Text>
                </View>
              ) : messages.map(m => {
                const isMine = m.type === 'user';
                return (
                  <View key={m._id} style={{ flexDirection: isMine ? 'row-reverse' : 'row', alignItems: 'flex-end', gap: 8 }}>
                    {!isMine && (
                      <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: meta.color + '18', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Ionicons name={meta.icon} size={14} color={meta.color} />
                      </View>
                    )}
                    <View style={{ maxWidth: '75%' }}>
                      <Text style={{ fontSize: 10, color: colors.textMuted, marginBottom: 3, textAlign: isMine ? 'right' : 'left' }}>
                        {isMine ? '我' : m.sender} · {fmtTime(m.createdAt)}
                      </Text>
                      <View style={{
                        padding: spacing.sm, borderRadius: isMine ? 16 : 4,
                        borderTopRightRadius: isMine ? 4 : 16, borderTopLeftRadius: isMine ? 16 : 4,
                        backgroundColor: isMine ? colors.primary : colors.white,
                        ...shadow.xs,
                      }}>
                        <Text style={{ fontSize: 14, color: isMine ? colors.white : colors.textPrimary, lineHeight: 20 }}>{m.content}</Text>
                      </View>
                    </View>
                  </View>
                );
              })}
            </ScrollView>

            {/* 输入框 */}
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', padding: spacing.sm, gap: spacing.xs, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.white }}>
              <TextInput
                style={{ flex: 1, minHeight: 40, maxHeight: 100, borderRadius: radius.sm, borderWidth: 1.5, borderColor: colors.border, paddingHorizontal: spacing.sm, paddingVertical: 8, fontSize: 14, color: colors.textPrimary, backgroundColor: colors.background }}
                placeholder={`发消息给${meta.label}…`}
                placeholderTextColor={colors.textMuted}
                value={content}
                onChangeText={t => { setContent(t); setError(''); }}
                multiline
                textAlignVertical="top"
              />
              <TouchableOpacity
                style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: content.trim() ? colors.primary : colors.border, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                onPress={handleSend}
                disabled={sending || !content.trim()}
                activeOpacity={0.85}
              >
                {sending ? <ActivityIndicator color={colors.white} size="small" /> : <Ionicons name="send" size={18} color={colors.white} />}
              </TouchableOpacity>
            </View>
            {!!error && <Text style={{ color: colors.danger, fontSize: 12, paddingHorizontal: spacing.md, paddingBottom: 4 }}>{error}</Text>}
          </SafeAreaView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
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

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, SafeAreaView, RefreshControl, Modal,
  TextInput, KeyboardAvoidingView, Platform, ActivityIndicator, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, shadow } from '../../theme';
import { messagesAPI, pushRecordsAPI, servicesAPI, mediaUrl } from '../../services/api';
import { mockMessages } from '../../data/mockData';
import { useAuth } from '../../context/AuthContext';
import Avatar from '../../components/Avatar';
import EmptyState from '../../components/EmptyState';
import tts from '../../utils/tts';

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
    coverUrl: pr.coverUrl || '',
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
        {msg.action?.type === 'family_invite' && (
          <View style={styles.inviteActionBtn}>
            <Ionicons name="people" size={13} color={colors.white} />
            <Text style={styles.inviteActionText}>去确认</Text>
          </View>
        )}
        {msg.action?.type === 'checkin' && (
          <View style={styles.inviteActionBtn}>
            <Ionicons name="add-circle" size={13} color={colors.white} />
            <Text style={styles.inviteActionText}>去查看</Text>
          </View>
        )}
      </View>
      <Ionicons name="chevron-forward" size={15} color={colors.textMuted} />
    </TouchableOpacity>
  );
}

const CAT_COLOR_MAP = {
  '检测套餐': '#0077B6', '专家咨询': '#1E6B50', '上门服务': '#22A06B',
  '健康课程': '#8e44ad', '服务包': '#D97706',
};

const RENEWAL_PAYMENT_METHODS = [
  { key: 'wechat', label: '微信支付', icon: 'logo-wechat', color: '#07C160' },
  { key: 'alipay', label: '支付宝',   icon: 'card-outline', color: '#1677FF' },
];

function ProductPushDetail({ msg, onClose }) {
  const { user } = useAuth();
  // products 数组：新版多产品；兜底：用旧版单产品构造一条
  const productList = (msg.products && msg.products.length > 0)
    ? msg.products
    : (msg.productId ? [{ productId: msg.productId, name: msg.productName, price: msg.price, category: '', icon: '🛍' }] : []);

  const [checkedIds, setCheckedIds] = useState(() => productList.map(p => p.productId));
  const [paying, setPaying] = useState(false);
  const [paid, setPaid] = useState(false);
  const [payError, setPayError] = useState('');
  const [payMethod, setPayMethod] = useState('wechat');

  const fundBalance = user?.healthFund?.total || 0;
  const [useFund, setUseFund] = useState(false);
  const [fundAmountInput, setFundAmountInput] = useState('');
  const [coupons, setCoupons] = useState([]);
  const [couponId, setCouponId] = useState(null);

  useEffect(() => {
    servicesAPI.coupons().then(res => { if (res.success) setCoupons(res.data || []); }).catch(() => {});
  }, []);

  const toggleItem = (id) =>
    setCheckedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const allChecked = checkedIds.length === productList.length;
  const toggleAll = () =>
    setCheckedIds(allChecked ? [] : productList.map(p => p.productId));

  const checkedItems = productList.filter(p => checkedIds.includes(p.productId));
  const total = checkedItems.reduce((s, p) => s + (p.price || 0), 0);

  const selectedCoupon = coupons.find(c => c._id === couponId) || null;
  const couponDiscount = selectedCoupon
    ? Math.min(
        selectedCoupon.type === 'amount' ? selectedCoupon.value : Math.round(total * (100 - selectedCoupon.value)) / 100,
        total
      )
    : 0;
  const priceAfterCoupon = Math.max(0, Math.round((total - couponDiscount) * 100) / 100);
  const fundApplied = useFund ? Math.min(Number(fundAmountInput) || 0, fundBalance, priceAfterCoupon) : 0;
  const finalPrice = Math.max(0, Math.round((priceAfterCoupon - fundApplied) * 100) / 100);

  const handlePay = async () => {
    if (!checkedIds.length) return;
    setPaying(true); setPayError('');
    try {
      await pushRecordsAPI.pay(msg._id, {
        selectedProductIds: checkedIds,
        useHealthFund: fundApplied,
        couponId,
        paymentMethod: payMethod,
      });
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
              共 {checkedItems.length} 项，实付 ¥{finalPrice}
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
                  {/* 封面图（有图显示真实图片，无图回退 emoji 图标）*/}
                  {p.images && p.images.length > 0 ? (
                    <Image
                      source={{ uri: mediaUrl(p.images[0]) }}
                      style={{ width: 48, height: 48, borderRadius: 10, marginRight: spacing.sm, flexShrink: 0, backgroundColor: colors.background }}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={{
                      width: 40, height: 40, borderRadius: 10, marginRight: spacing.sm, flexShrink: 0,
                      backgroundColor: catColor + '15', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Text style={{ fontSize: 18 }}>{p.icon || '🛍'}</Text>
                    </View>
                  )}
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

          {/* 优惠券 */}
          {coupons.length > 0 && (
            <View style={{ marginBottom: spacing.sm }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textPrimary, marginBottom: 6 }}>优惠券</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ gap: 8 }}>
                <TouchableOpacity
                  onPress={() => setCouponId(null)}
                  style={{
                    paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.md, marginRight: 8,
                    borderWidth: 1.5, borderColor: !couponId ? colors.primary : colors.border,
                    backgroundColor: !couponId ? colors.primary + '0D' : colors.white,
                  }}
                >
                  <Text style={{ fontSize: 12, color: !couponId ? colors.primary : colors.textMuted, fontWeight: !couponId ? '700' : '500' }}>不使用</Text>
                </TouchableOpacity>
                {coupons.map(c => (
                  <TouchableOpacity
                    key={c._id}
                    onPress={() => setCouponId(c._id)}
                    style={{
                      paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.md, marginRight: 8,
                      borderWidth: 1.5, borderColor: couponId === c._id ? colors.primary : colors.border,
                      backgroundColor: couponId === c._id ? colors.primary + '0D' : colors.white,
                    }}
                  >
                    <Text style={{ fontSize: 12, color: couponId === c._id ? colors.primary : colors.textMuted, fontWeight: couponId === c._id ? '700' : '500' }}>
                      {(c.title || (c.type === 'amount' ? `¥${c.value}抵用券` : `${c.value / 10}折优惠券`))}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {/* 健康基金抵扣 */}
          {fundBalance > 0 && (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textPrimary }}>健康基金抵扣（余额 ¥{fundBalance.toFixed(2)}）</Text>
              <TouchableOpacity
                onPress={() => {
                  const next = !useFund;
                  setUseFund(next);
                  if (next) setFundAmountInput(String(Math.min(fundBalance, priceAfterCoupon)));
                }}
                style={{
                  paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.full,
                  borderWidth: 1.5, borderColor: useFund ? colors.primary : colors.border,
                  backgroundColor: useFund ? colors.primary : colors.white,
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: '600', color: useFund ? colors.white : colors.textMuted }}>{useFund ? '已启用' : '使用基金'}</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* 支付方式 */}
          <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm }}>
            {RENEWAL_PAYMENT_METHODS.map(m => (
              <TouchableOpacity
                key={m.key}
                onPress={() => setPayMethod(m.key)}
                style={{
                  flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
                  paddingVertical: 10, borderRadius: radius.md,
                  borderWidth: 1.5, borderColor: payMethod === m.key ? colors.primary : colors.border,
                  backgroundColor: payMethod === m.key ? colors.primary + '08' : colors.background,
                }}
              >
                <Ionicons name={m.icon} size={16} color={payMethod === m.key ? m.color : colors.textMuted} />
                <Text style={{ fontSize: 12, color: payMethod === m.key ? colors.textPrimary : colors.textMuted, fontWeight: payMethod === m.key ? '700' : '500' }}>{m.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* 错误提示 */}
          {!!payError && (
            <Text style={{ fontSize: 12, color: colors.danger, textAlign: 'center', marginBottom: 6 }}>{payError}</Text>
          )}

          {/* 底部：合计 + 按钮 */}
          <View style={[styles.detailFooter, { flexDirection: 'column', gap: 10 }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 13, color: colors.textMuted }}>
                已选 {checkedIds.length}/{productList.length} 项{(couponDiscount > 0 || fundApplied > 0) ? `（原价¥${total}）` : ''}
              </Text>
              <Text style={{ fontSize: 18, fontWeight: '800', color: colors.primary }}>
                合计 ¥{finalPrice}
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
                  {paying ? '提交中...' : `立即支付 ¥${finalPrice}`}
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
  const [speaking, setSpeaking] = useState(false);

  if (!msg) return null;

  // 产品推送：专用多选支付界面
  if (msg.type === 'product') {
    return <ProductPushDetail msg={msg} onClose={onClose} />;
  }

  const conf = TYPE_CONFIG[msg.type] || TYPE_CONFIG.system;

  const handleSpeak = async () => {
    setSpeaking(true);
    try {
      await tts.speak(msg.content || msg.title || '暂无内容', 'message');
    } catch {
      // 播放失败静默忽略，不打断消息查看
    } finally {
      setSpeaking(false);
    }
  };

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
            <TouchableOpacity onPress={handleSpeak} disabled={speaking} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={{ marginRight: 14 }}>
              {speaking ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Ionicons name="volume-high-outline" size={20} color={colors.primary} />
              )}
            </TouchableOpacity>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
          {msg.title && <Text style={styles.detailTitle}>{msg.title}</Text>}
          <ScrollView style={styles.detailBody} showsVerticalScrollIndicator={false}>
            {msg.coverUrl ? (
              <Image source={{ uri: msg.coverUrl }} style={styles.detailCoverImg} resizeMode="cover" />
            ) : null}
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
  const { isDemo, user } = useAuth();
  const careTeamKinds = new Set((user?.careTeam || []).map(m => m.kind));
  const hasRole = (key) => {
    if (isDemo) return true;
    if (key === 'doctor') return careTeamKinds.has('familyDoctor');
    if (key === 'nutritionist') return careTeamKinds.has('nutritionist');
    if (key === 'manager') return careTeamKinds.has('healthManager');
    return false;
  };
  const [activeTab, setActiveTab] = useState('全部');
  const [messages, setMessages] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedMsg, setSelectedMsg] = useState(null);
  const [composing, setComposing] = useState(false);
  const [replyTo, setReplyTo] = useState('manager');
  const [threadRole, setThreadRole] = useState(null);
  const [showNotifModal, setShowNotifModal] = useState(false);

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

  // 15 秒轮询，保持列表实时
  useEffect(() => {
    const timer = setInterval(() => { loadMessages(); }, 15000);
    return () => clearInterval(timer);
  }, [loadMessages]);

  const handlePress = async (msg) => {
    const msgId = msg._id || msg.id;
    // 可操作消息（如家庭成员邀请）：直接跳到对应页面处理，不弹详情，省去用户自己找入口
    // 可操作消息（家庭成员邀请 / 每日打卡关怀等）：直接跳对应页面处理，不弹详情
    const isActionable = msg.action?.type === 'family_invite' || msg.action?.type === 'checkin';
    if (!isActionable) setSelectedMsg(msg);
    if (msg.unread) {
      setMessages(prev =>
        prev.map(m => (m._id || m.id) === msgId ? { ...m, unread: false } : m)
      );
      try {
        if (msg.isPushRecord) await pushRecordsAPI.markRead(msgId);
        else await messagesAPI.markRead(msgId);
      } catch {}
    }
    if (isActionable) {
      navigation.navigate(msg.action.route || 'FamilyMembers');
    }
  };

  const PUSH_TYPES = new Set(['knowledge', 'plan', 'questionnaire', 'supplement', 'product', 'notice']);
  const NOTIF_TYPES = new Set(['system', ...PUSH_TYPES]);

  const fmtMsgTime = (t) => {
    if (!t) return '';
    const d = new Date(t), now = new Date();
    const diffMs = now - d;
    if (diffMs < 60000) return '刚刚';
    if (diffMs < 3600000) return `${Math.floor(diffMs / 60000)}分钟前`;
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffDays === 0) return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    if (diffDays === 1) return '昨天';
    if (diffDays < 7) return `${'日一二三四五六'[d.getDay()] ? `周${'日一二三四五六'[d.getDay()]}` : ''}`;
    return `${d.getMonth()+1}/${d.getDate()}`;
  };

  // 构建统一会话列表
  const ROLE_DEFS = [
    { key: 'doctor',       label: '家庭医师', icon: 'medical',           color: colors.primary },
    { key: 'manager',      label: '健管师',   icon: 'person',            color: '#D97706'      },
    { key: 'nutritionist', label: '营养师',   icon: 'nutrition-outline', color: '#059669'      },
  ];

  const notifMessages = messages.filter(m => NOTIF_TYPES.has(m.type) && !m.conversationId);

  // 每个角色的最新消息和未读数
  const roleConvs = ROLE_DEFS.map(r => {
    const msgs = messages.filter(m =>
      m.type === r.key ||
      (m.conversationId && m.conversationId.endsWith(`_${r.key}`))
    );
    const last = msgs[0];
    const unread = msgs.filter(m => m.unread).length;
    return { ...r, last, unread, lastTime: last ? new Date(last.createdAt).getTime() : 0, kind: 'role', assigned: hasRole(r.key) };
  });

  // 系统通知行
  const notifLast = notifMessages[0];
  const notifUnread = notifMessages.filter(m => m.unread).length;
  const notifConv = {
    key: '__notif__', label: '系统通知', icon: 'notifications', color: '#8A4AC7',
    last: notifLast, unread: notifUnread,
    lastTime: notifLast ? new Date(notifLast.createdAt).getTime() : 0,
    kind: 'notif',
  };

  // AI 助手行（置顶）
  const aiConv = {
    key: '__ai__', label: 'AI 健康助手', icon: 'sparkles', color: '#1A2B24',
    last: null, unread: 0, lastTime: Infinity, kind: 'ai',
  };

  // 全部合并，AI 置顶，其余按最新消息时间倒序
  const convList = [
    aiConv,
    ...[...roleConvs, notifConv].sort((a, b) => b.lastTime - a.lastTime),
  ];

  const totalUnread = messages.filter(m => m.unread).length;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.pageTitle}>消息</Text>
        {totalUnread > 0 && (
          <View style={styles.unreadBadge}>
            <Text style={styles.unreadBadgeText}>{totalUnread > 99 ? '99+' : totalUnread}</Text>
          </View>
        )}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        style={{ flex: 1 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadMessages(); }} tintColor={colors.primary} />}
      >
        <View style={[styles.sectionCard, { marginTop: 8 }]}>
          {convList.map((conv, i) => {
            const unassigned = conv.kind === 'role' && conv.assigned === false;
            const preview = unassigned
              ? `您尚未配备${conv.label}，暂不提供此项服务`
              : conv.last?.content || conv.last?.title || (conv.kind === 'ai' ? '随时问我健康问题，24小时在线' : conv.kind === 'notif' ? '暂无通知' : '暂无消息');
            const onPress = unassigned
              ? () => {}
              : conv.kind === 'ai'
              ? () => navigation.navigate('Chat')
              : conv.kind === 'notif'
              ? () => setShowNotifModal(true)
              : () => setThreadRole(conv.key);

            return (
              <View key={conv.key}>
                <TouchableOpacity style={styles.chatRow} onPress={onPress} activeOpacity={unassigned ? 1 : 0.7} disabled={unassigned}>
                  <View style={[styles.chatAvatar, { backgroundColor: unassigned ? colors.border : conv.color }]}>
                    <Ionicons name={conv.icon} size={20} color={unassigned ? colors.textMuted : '#fff'} />
                    {conv.unread > 0 && !unassigned && (
                      <View style={styles.avatarBadge}>
                        <Text style={styles.avatarBadgeText}>{conv.unread > 99 ? '99+' : conv.unread}</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.chatBody}>
                    <View style={styles.chatTopRow}>
                      <Text style={[styles.chatName, unassigned && { color: colors.textMuted }]}>{conv.label}</Text>
                      {conv.last && !unassigned && <Text style={styles.chatTime}>{fmtMsgTime(conv.last.createdAt)}</Text>}
                    </View>
                    <Text style={[styles.chatPreview, conv.unread > 0 && !unassigned && { color: colors.textPrimary, fontWeight: '500' }]} numberOfLines={1}>
                      {preview}
                    </Text>
                  </View>
                  {!unassigned && <Ionicons name="chevron-forward" size={15} color={colors.textMuted} />}
                </TouchableOpacity>
                {i < convList.length - 1 && <View style={styles.rowDivider} />}
              </View>
            );
          })}
        </View>

        <View style={{ height: spacing.xl * 2 }} />
      </ScrollView>

      {selectedMsg && (
        <MessageDetailModal msg={selectedMsg} onClose={() => setSelectedMsg(null)} navigation={navigation} onReply={(to) => { setReplyTo(to); }} />
      )}
      {threadRole && (
        <ConversationThreadModal role={threadRole} onClose={() => { setThreadRole(null); loadMessages(); }} />
      )}
      <NotificationListModal
        visible={showNotifModal}
        messages={notifMessages}
        onClose={() => setShowNotifModal(false)}
        onPress={(msg) => { setShowNotifModal(false); setSelectedMsg(msg); }}
        onMarkRead={async (msg) => {
          if (!msg.unread) return;
          try {
            if (msg.isPushRecord) await pushRecordsAPI.markRead(msg._id);
            else await messagesAPI.markRead(msg._id);
            loadMessages();
          } catch {}
        }}
      />
    </SafeAreaView>
  );
}

// ── 系统通知列表 Modal ────────────────────────────────────────────
const NOTIF_TYPE_CONFIG = {
  system:        { icon: 'notifications',         color: '#8A4AC7', label: '系统' },
  knowledge:     { icon: 'book-outline',          color: '#22A06B', label: '科普' },
  plan:          { icon: 'clipboard-outline',     color: '#D97706', label: '方案' },
  questionnaire: { icon: 'document-text-outline', color: '#0077B6', label: '问卷' },
  supplement:    { icon: 'nutrition-outline',     color: '#8e44ad', label: '营养' },
  product:       { icon: 'bag-outline',           color: '#1E6B50', label: '产品' },
  notice:        { icon: 'megaphone-outline',     color: '#666',    label: '通知' },
};

function NotificationListModal({ visible, messages, onClose, onPress, onMarkRead }) {
  const [tab, setTab] = useState('全部');
  const PUSH_TYPES = new Set(['knowledge', 'plan', 'questionnaire', 'supplement', 'product', 'notice']);

  const filtered = messages.filter(m => {
    if (tab === '系统') return m.type === 'system';
    if (tab === '推送') return PUSH_TYPES.has(m.type);
    return true;
  });

  const fmtTime = t => {
    if (!t) return '';
    const d = new Date(t), now = new Date();
    const diffDays = Math.floor((now - d) / 86400000);
    if (diffDays === 0) return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    if (diffDays === 1) return '昨天';
    return `${d.getMonth()+1}/${d.getDate()}`;
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, backgroundColor: colors.white }}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={{ flex: 1, fontSize: 17, fontWeight: '700', color: colors.textPrimary, textAlign: 'center', marginRight: 24 }}>系统通知</Text>
        </View>

        {/* Tab 胶囊 */}
        <View style={{ flexDirection: 'row', marginHorizontal: spacing.lg, marginVertical: spacing.sm, backgroundColor: '#EEEAE3', borderRadius: radius.sm, padding: 3 }}>
          {['全部', '系统', '推送'].map(t => (
            <TouchableOpacity key={t} style={[{ flex: 1, paddingVertical: 7, alignItems: 'center', borderRadius: radius.xs }, tab === t && { backgroundColor: colors.white }]} onPress={() => setTab(t)}>
              <Text style={[{ fontSize: 13, color: colors.textMuted, fontWeight: '500' }, tab === t && { color: colors.textPrimary, fontWeight: '600' }]}>{t}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
          {filtered.length === 0 ? (
            <View style={{ padding: 60, alignItems: 'center' }}>
              <Ionicons name="notifications-off-outline" size={40} color={colors.textMuted} />
              <Text style={{ fontSize: 14, color: colors.textMuted, marginTop: 12 }}>暂无通知</Text>
            </View>
          ) : (
            <View style={{ backgroundColor: colors.white, marginHorizontal: spacing.md, marginTop: spacing.xs, borderRadius: radius.md, overflow: 'hidden' }}>
              {filtered.map((msg, i) => {
                const conf = NOTIF_TYPE_CONFIG[msg.type] || NOTIF_TYPE_CONFIG.system;
                return (
                  <View key={msg._id || msg.id || i}>
                    <TouchableOpacity
                      style={{ flexDirection: 'row', alignItems: 'flex-start', padding: spacing.md, backgroundColor: msg.unread ? '#FAFFFE' : colors.white }}
                      activeOpacity={0.7}
                      onPress={() => { onMarkRead(msg); onPress(msg); }}
                    >
                      {/* 图标 */}
                      <View style={{ width: 42, height: 42, borderRadius: 10, backgroundColor: conf.color + '18', alignItems: 'center', justifyContent: 'center', marginRight: spacing.sm, flexShrink: 0 }}>
                        <Ionicons name={conf.icon} size={20} color={conf.color} />
                        {msg.unread && <View style={{ position: 'absolute', top: -2, right: -2, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.danger, borderWidth: 1.5, borderColor: colors.white }} />}
                      </View>
                      {/* 内容 */}
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                          <Text style={{ fontSize: 14, fontWeight: msg.unread ? '600' : '500', color: colors.textPrimary }}>
                            {msg.sender || msg.title || conf.label}
                          </Text>
                          <Text style={{ fontSize: 11, color: colors.textMuted }}>{fmtTime(msg.createdAt)}</Text>
                        </View>
                        <Text style={{ fontSize: 13, color: colors.textSecondary, lineHeight: 19 }} numberOfLines={3}>
                          {msg.content}
                        </Text>
                      </View>
                    </TouchableOpacity>
                    {i < filtered.length - 1 && <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.borderLight, marginLeft: 58 }} />}
                  </View>
                );
              })}
            </View>
          )}
          <View style={{ height: spacing.xl * 2 }} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ── 对话线程（全屏，对齐 ChatScreen 风格）────────────────────────
const ROLE_META = {
  doctor:       { label: '家庭医师', icon: 'medical',           color: colors.primary },
  manager:      { label: '健管师',   icon: 'person',            color: '#D97706'      },
  nutritionist: { label: '营养师',   icon: 'nutrition-outline', color: '#059669'      },
};

function ConversationThreadModal({ role, onClose }) {
  const [msgs, setMsgs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef(null);
  const meta = ROLE_META[role] || ROLE_META.manager;
  const { token } = useAuth();

  const loadThread = async () => {
    try {
      const res = await messagesAPI.getThread(role);
      setMsgs(res.data || []);
      setTimeout(() => scrollRef.current?.scrollToEnd?.({ animated: false }), 100);
    } catch {}
    finally { setLoading(false); }
  };

  // SSE 实时推送（含自动重连）
  useEffect(() => {
    if (!token) return;
    const BASE_URL = (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_API_URL) || 'https://jiaycare.com/api';
    const url = `${BASE_URL}/messages/stream/${role}?token=${token}`;
    let es = null;
    let reconnectTimer = null;

    function connect() {
      try {
        es = new EventSource(url);
        es.onmessage = (e) => {
          if (!e.data) return;
          try {
            const { type, data } = JSON.parse(e.data);
            if (type === 'message') {
              setMsgs(prev => {
                // 去重：同一条消息不重复插入
                if (prev.some(m => m._id === data._id)) return prev;
                return [...prev, data];
              });
              setTimeout(() => scrollRef.current?.scrollToEnd?.({ animated: true }), 100);
            }
          } catch {}
        };
        es.onerror = () => {
          es?.close();
          // 5 秒后重连
          reconnectTimer = setTimeout(connect, 5000);
        };
      } catch {}
    }

    connect();
    return () => {
      clearTimeout(reconnectTimer);
      es?.close();
    };
  }, [role, token]);

  useEffect(() => { loadThread(); }, [role]);

  const send = async () => {
    if (!input.trim() || sending) return;
    setSending(true);
    const text = input.trim();
    setInput('');
    try {
      const res = await messagesAPI.send(role, text);
      // 乐观插入（SSE 会同步推送同一条，去重逻辑会过滤）
      if (res?.data) {
        setMsgs(prev => prev.some(m => m._id === res.data._id) ? prev : [...prev, res.data]);
        setTimeout(() => scrollRef.current?.scrollToEnd?.({ animated: true }), 100);
      }
    } catch {
      setInput(text); // 发送失败时还原输入
    }
    finally { setSending(false); }
  };

  const now = () => new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

  return (
    <Modal visible animationType="slide" transparent={false} onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        {/* TopBar — 与 ChatScreen 一致 */}
        <View style={threadStyles.topBar}>
          <TouchableOpacity onPress={onClose} style={threadStyles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <View style={{ alignItems: 'center', flex: 1 }}>
            <Text style={threadStyles.topTitle}>{meta.label}</Text>
            <View style={threadStyles.onlineRow}>
              <View style={threadStyles.onlineDot} />
              <Text style={threadStyles.onlineText}>在线</Text>
            </View>
          </View>
          <View style={{ width: 36 }} />
        </View>

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {/* 消息列表 */}
          <ScrollView
            ref={scrollRef}
            showsVerticalScrollIndicator={false}
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: spacing.lg, gap: 4 }}
          >
            {loading ? (
              <ActivityIndicator color={meta.color} style={{ padding: 60 }} />
            ) : msgs.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 60 }}>
                <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: meta.color + '18', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                  <Ionicons name={meta.icon} size={28} color={meta.color} />
                </View>
                <Text style={{ fontSize: 16, fontWeight: '700', color: colors.textPrimary, marginBottom: 8 }}>{meta.label}</Text>
                <Text style={{ fontSize: 13, color: colors.textMuted, textAlign: 'center', lineHeight: 20 }}>
                  发送消息，您的{meta.label}{'\n'}会在工作时间内回复您
                </Text>
              </View>
            ) : msgs.map((m, i) => {
              const isMine = m.type === 'user';
              const fmtT = new Date(m.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
              // 时间戳：与上条消息间隔 > 5 分钟才显示
              const showTime = i === 0 || (new Date(m.createdAt) - new Date(msgs[i-1].createdAt)) > 300000;
              return (
                <View key={m._id}>
                  {showTime && (
                    <Text style={threadStyles.timestamp}>{fmtT}</Text>
                  )}
                  <View style={[threadStyles.msgRow, isMine && threadStyles.msgRowUser]}>
                    {!isMine && (
                      <View style={[threadStyles.avatar, { backgroundColor: meta.color + '20' }]}>
                        <Ionicons name={meta.icon} size={16} color={meta.color} />
                      </View>
                    )}
                    <View style={[threadStyles.bubble, isMine ? threadStyles.bubbleUser : threadStyles.bubbleAI]}>
                      {!isMine && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                          <Text style={[threadStyles.bubbleName, { color: meta.color, marginBottom: 0 }]}>{m.sender || meta.label}</Text>
                          {m.isAI && (
                            <View style={{ marginLeft: 6, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 99, backgroundColor: meta.color + '20' }}>
                              <Text style={{ fontSize: 10, fontWeight: '700', color: meta.color }}>AI</Text>
                            </View>
                          )}
                        </View>
                      )}
                      <Text style={[threadStyles.bubbleText, isMine && threadStyles.bubbleTextUser]}>{m.content}</Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </ScrollView>

          {/* 输入栏 — 与 ChatScreen 一致 */}
          <View style={threadStyles.inputBar}>
            <TextInput
              style={threadStyles.inputField}
              placeholder={`发消息给${meta.label}…`}
              placeholderTextColor={colors.textMuted}
              value={input}
              onChangeText={setInput}
              multiline
              maxLength={500}
              textAlignVertical="top"
              onKeyPress={({ nativeEvent }) => { if (nativeEvent.key === 'Enter' && !nativeEvent.shiftKey) send(); }}
            />
            <TouchableOpacity
              style={[threadStyles.sendBtn, (!input.trim() || sending) && threadStyles.sendBtnDisabled]}
              onPress={send}
              disabled={!input.trim() || sending}
              activeOpacity={0.85}
            >
              {sending
                ? <ActivityIndicator size="small" color={colors.white} />
                : <Ionicons name="send" size={18} color={colors.white} />}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const threadStyles = StyleSheet.create({
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
    backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  topTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  onlineRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  onlineDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.success },
  onlineText: { fontSize: 11, color: colors.success, fontWeight: '500' },
  timestamp: { textAlign: 'center', fontSize: 11, color: colors.textMuted, marginVertical: 12 },
  msgRow: { flexDirection: 'row', marginBottom: spacing.sm, alignItems: 'flex-end' },
  msgRowUser: { flexDirection: 'row-reverse' },
  avatar: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginRight: spacing.sm, marginBottom: 2 },
  bubble: { maxWidth: '75%', borderRadius: radius.md, padding: spacing.sm, ...shadow.xs },
  bubbleAI: { backgroundColor: colors.white, borderBottomLeftRadius: 4 },
  bubbleUser: { backgroundColor: colors.primary, borderBottomRightRadius: 4 },
  bubbleName: { fontSize: 11, fontWeight: '700', marginBottom: 4, letterSpacing: 0.3 },
  bubbleText: { fontSize: 14, color: colors.textPrimary, lineHeight: 20 },
  bubbleTextUser: { color: colors.white },
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
  sendBtnDisabled: { backgroundColor: colors.textMuted || '#ccc' },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md, paddingBottom: spacing.xs,
    backgroundColor: colors.background,
  },
  pageTitle: { fontSize: 22, fontWeight: '800', color: colors.textPrimary, letterSpacing: -0.3 },
  pageSubtitle: { fontSize: 12, color: colors.textMuted, marginTop: 3 },
  unreadBadge: {
    minWidth: 22, height: 22, borderRadius: 11,
    backgroundColor: colors.danger,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 6,
  },
  unreadDotSmall: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.warning },
  unreadBadgeText: { fontSize: 12, color: colors.white, fontWeight: '700' },

  // 会话行（微信风格）
  chatRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.white,
    paddingHorizontal: spacing.md, paddingVertical: 12,
  },
  chatRowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderLight, marginLeft: 72 },
  chatAvatar: {
    width: 50, height: 50, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    marginRight: spacing.sm, flexShrink: 0,
  },
  chatBody: { flex: 1, minWidth: 0 },
  chatTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  chatName: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
  chatTime: { fontSize: 11, color: colors.textMuted },
  chatPreview: { fontSize: 13, color: colors.textMuted },
  unreadBubble: {
    minWidth: 20, height: 20, borderRadius: 10,
    backgroundColor: colors.danger,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 5, marginLeft: spacing.xs,
  },
  unreadBubbleText: { fontSize: 11, color: colors.white, fontWeight: '700' },
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
  // 分组卡片
  sectionCard: {
    backgroundColor: colors.white,
    marginHorizontal: spacing.md,
    marginTop: 12,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  sectionDivider: { height: StyleSheet.hairlineWidth, backgroundColor: '#EEEAE3', marginLeft: 70 },
  rowDivider: { height: StyleSheet.hairlineWidth, backgroundColor: '#EEEAE3', marginLeft: 70 },
  sectionLabel: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: spacing.lg, paddingTop: 20, paddingBottom: 8,
  },
  sectionLabelText: { fontSize: 12, color: colors.textMuted, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase' },
  sectionBadge: {
    minWidth: 18, height: 18, borderRadius: 9,
    backgroundColor: colors.danger,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5,
  },
  sectionBadgeText: { fontSize: 11, color: '#fff', fontWeight: '700' },
  // 头像红点
  avatarBadge: {
    position: 'absolute', top: -3, right: -3,
    minWidth: 16, height: 16, borderRadius: 8,
    backgroundColor: colors.danger, borderWidth: 1.5, borderColor: colors.background,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
  },
  avatarBadgeText: { fontSize: 9, color: '#fff', fontWeight: '700' },
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.background,
    borderBottomWidth: 0,
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
    paddingHorizontal: spacing.md, paddingVertical: 13,
  },
  msgItemUnread: { backgroundColor: colors.white },
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
  inviteActionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start',
    backgroundColor: colors.primary, borderRadius: radius.full,
    paddingHorizontal: 12, paddingVertical: 5, marginTop: 8,
  },
  inviteActionText: { fontSize: 12, color: colors.white, fontWeight: '700' },
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
  detailCoverImg: {
    width: '100%', aspectRatio: 4 / 3, borderRadius: radius.md,
    backgroundColor: colors.border, marginBottom: spacing.md,
  },
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

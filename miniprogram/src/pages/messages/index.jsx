import React, { useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, Textarea, ScrollView } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { colors, spacing, radius, shadow } from '../../theme';
import { messagesAPI, pushRecordsAPI, servicesAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

// 完整对齐 app/src/screens/messages/MessagesScreen.js 的固定角色分组方案。
// 简化点：
// - 小程序无 EventSource(SSE) 支持，会话内用 10 秒轮询代替实时推送（app端是SSE）
// - 语音播报(tts.speak)未接入，小程序场景暂不做
const ROLE_DEFS = [
  { key: 'doctor', label: '家庭医师', icon: '🩺', color: colors.primary },
  { key: 'manager', label: '健管师', icon: '🧑‍💼', color: '#D97706' },
  { key: 'nutritionist', label: '营养师', icon: '🥗', color: '#059669' },
];

const PUSH_TYPES = new Set(['knowledge', 'plan', 'questionnaire', 'supplement', 'product', 'notice']);
const NOTIF_TYPES = new Set(['system', ...PUSH_TYPES]);

const NOTIF_TYPE_CONFIG = {
  system: { icon: '🔔', color: '#8A4AC7', label: '系统' },
  knowledge: { icon: '📖', color: '#22A06B', label: '科普' },
  plan: { icon: '📋', color: '#D97706', label: '方案' },
  questionnaire: { icon: '📝', color: '#0077B6', label: '问卷' },
  supplement: { icon: '🥗', color: '#8e44ad', label: '营养' },
  product: { icon: '🛍', color: '#1E6B50', label: '产品' },
  notice: { icon: '📣', color: '#666', label: '通知' },
};

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
    createdAt: pr.createdAt,
    price: pr.price || null,
    productName: pr.title || '',
    productId: pr.productId || null,
    products: pr.products || [],
  };
}

function fmtMsgTime(t) {
  if (!t) return '';
  const d = new Date(t);
  const now = new Date();
  const diffMs = now - d;
  if (diffMs < 60000) return '刚刚';
  if (diffMs < 3600000) return `${Math.floor(diffMs / 60000)}分钟前`;
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 1) return '昨天';
  if (diffDays < 7) return `周${'日一二三四五六'[d.getDay()]}`;
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export default function MessagesPage() {
  const { user, isDemo } = useAuth();
  const careTeamKinds = new Set((user?.careTeam || []).map((m) => m.kind));
  const hasRole = (key) => {
    if (isDemo) return true;
    if (key === 'doctor') return careTeamKinds.has('familyDoctor');
    if (key === 'nutritionist') return careTeamKinds.has('nutritionist');
    if (key === 'manager') return careTeamKinds.has('healthManager');
    return false;
  };

  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [threadRole, setThreadRole] = useState(null);
  const [showNotif, setShowNotif] = useState(false);
  const [notifTab, setNotifTab] = useState('全部');
  const [detailMsg, setDetailMsg] = useState(null);

  const loadMessages = useCallback(async () => {
    try {
      const [msgRes, pushRes] = await Promise.allSettled([messagesAPI.list(), pushRecordsAPI.list()]);
      const msgData = msgRes.status === 'fulfilled' && msgRes.value?.success ? msgRes.value.data : [];
      const pushData = pushRes.status === 'fulfilled' && pushRes.value?.success
        ? pushRes.value.data.map(normalizePushRecord) : [];
      const all = [...msgData, ...pushData].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      setMessages(all);
    } catch {
      setMessages([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useDidShow(() => { loadMessages(); });

  const notifMessages = messages.filter((m) => NOTIF_TYPES.has(m.type) && !m.conversationId);

  const roleConvs = ROLE_DEFS.map((r) => {
    const msgs = messages.filter((m) => m.type === r.key || (m.conversationId && m.conversationId.endsWith(`_${r.key}`)));
    const last = msgs[0];
    const unread = msgs.filter((m) => m.unread).length;
    return { ...r, last, unread, lastTime: last ? new Date(last.createdAt).getTime() : 0, kind: 'role', assigned: hasRole(r.key) };
  });

  const notifLast = notifMessages[0];
  const notifUnread = notifMessages.filter((m) => m.unread).length;
  const notifConv = {
    key: '__notif__', label: '系统通知', icon: '🔔', color: '#8A4AC7',
    last: notifLast, unread: notifUnread,
    lastTime: notifLast ? new Date(notifLast.createdAt).getTime() : 0, kind: 'notif',
  };

  const aiConv = { key: '__ai__', label: 'AI 健康助手', icon: '✨', color: '#1A2B24', last: null, unread: 0, lastTime: Infinity, kind: 'ai' };

  const convList = [aiConv, ...[...roleConvs, notifConv].sort((a, b) => b.lastTime - a.lastTime)];
  const totalUnread = messages.filter((m) => m.unread).length;

  const openConv = async (conv) => {
    if (conv.kind === 'role' && conv.assigned === false) return;
    if (conv.kind === 'ai') { Taro.navigateTo({ url: '/pages/chat/index' }); return; }
    if (conv.kind === 'notif') { setShowNotif(true); return; }
    setThreadRole(conv.key);
  };

  const markReadAndOpenDetail = async (msg) => {
    setDetailMsg(msg);
    if (msg.unread) {
      setMessages((prev) => prev.map((m) => (m._id === msg._id ? { ...m, unread: false } : m)));
      try {
        if (msg.isPushRecord) await pushRecordsAPI.markRead(msg._id);
        else await messagesAPI.markRead(msg._id);
      } catch {}
    }
  };

  if (threadRole) {
    return <ConversationThread role={threadRole} onClose={() => { setThreadRole(null); loadMessages(); }} />;
  }

  return (
    <View style={{ minHeight: '100vh', backgroundColor: colors.background, paddingBottom: `${spacing.xl}px` }}>
      <View style={{ display: 'flex', alignItems: 'center', padding: `${spacing.lg}px ${spacing.lg}px ${spacing.sm}px` }}>
        <Text style={{ fontSize: '22px', fontWeight: 800, color: colors.textPrimary }}>消息</Text>
        {totalUnread > 0 && (
          <View style={{ marginLeft: '8px', minWidth: '22px', height: '22px', borderRadius: '11px', backgroundColor: colors.danger, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 6px' }}>
            <Text style={{ fontSize: '12px', color: '#fff', fontWeight: 700 }}>{totalUnread > 99 ? '99+' : totalUnread}</Text>
          </View>
        )}
      </View>

      {loading ? (
        <Text style={{ fontSize: '13px', color: colors.textMuted, padding: `0 ${spacing.lg}px` }}>加载中...</Text>
      ) : (
        <View style={{ backgroundColor: '#fff', margin: `0 ${spacing.md}px`, borderRadius: `${radius.md}px`, overflow: 'hidden', boxShadow: shadow.card }}>
          {convList.map((conv, i) => {
            const unassigned = conv.kind === 'role' && conv.assigned === false;
            const preview = unassigned
              ? `您尚未配备${conv.label}，暂不提供此项服务`
              : conv.last?.content || conv.last?.title || (conv.kind === 'ai' ? '随时问我健康问题，24小时在线' : conv.kind === 'notif' ? '暂无通知' : '暂无消息');
            return (
              <View key={conv.key}>
                <View onClick={() => openConv(conv)} style={{ display: 'flex', alignItems: 'center', padding: `12px ${spacing.md}px` }}>
                  <View style={{
                    position: 'relative', width: '46px', height: '46px', borderRadius: '12px', marginRight: `${spacing.sm}px`,
                    backgroundColor: unassigned ? colors.border : conv.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <Text style={{ fontSize: '20px' }}>{conv.icon}</Text>
                    {conv.unread > 0 && !unassigned && (
                      <View style={{ position: 'absolute', top: '-3px', right: '-3px', minWidth: '16px', height: '16px', borderRadius: '8px', backgroundColor: colors.danger, border: `1.5px solid ${colors.background}`, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px' }}>
                        <Text style={{ fontSize: '9px', color: '#fff', fontWeight: 700 }}>{conv.unread > 99 ? '99+' : conv.unread}</Text>
                      </View>
                    )}
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <Text style={{ fontSize: '15px', fontWeight: 600, color: unassigned ? colors.textMuted : colors.textPrimary }}>{conv.label}</Text>
                      {conv.last && !unassigned && <Text style={{ fontSize: '11px', color: colors.textMuted }}>{fmtMsgTime(conv.last.createdAt)}</Text>}
                    </View>
                    <Text style={{ fontSize: '13px', color: conv.unread > 0 && !unassigned ? colors.textPrimary : colors.textMuted }} numberOfLines={1}>{preview}</Text>
                  </View>
                </View>
                {i < convList.length - 1 && <View style={{ height: '1px', backgroundColor: colors.borderLight, marginLeft: '70px' }} />}
              </View>
            );
          })}
        </View>
      )}

      {showNotif && (
        <NotifModal
          messages={notifMessages}
          tab={notifTab}
          setTab={setNotifTab}
          onClose={() => setShowNotif(false)}
          onPress={(m) => { setShowNotif(false); markReadAndOpenDetail(m); }}
        />
      )}

      {detailMsg && (
        <MessageDetailModal msg={detailMsg} onClose={() => setDetailMsg(null)} />
      )}
    </View>
  );
}

function NotifModal({ messages, tab, setTab, onClose, onPress }) {
  const filtered = messages.filter((m) => {
    if (tab === '系统') return m.type === 'system';
    if (tab === '推送') return PUSH_TYPES.has(m.type);
    return true;
  });

  return (
    <View style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.background, zIndex: 100, display: 'flex', flexDirection: 'column' }}>
      <View style={{ display: 'flex', alignItems: 'center', padding: `${spacing.md}px ${spacing.lg}px`, backgroundColor: '#fff', borderBottom: `1px solid ${colors.border}` }}>
        <Text onClick={onClose} style={{ fontSize: '14px', color: colors.primary, marginRight: '12px' }}>‹ 返回</Text>
        <Text style={{ flex: 1, fontSize: '16px', fontWeight: 700, color: colors.textPrimary, textAlign: 'center', marginRight: '40px' }}>系统通知</Text>
      </View>
      <View style={{ display: 'flex', margin: `${spacing.sm}px ${spacing.lg}px`, backgroundColor: '#EEEAE3', borderRadius: `${radius.sm}px`, padding: '3px' }}>
        {['全部', '系统', '推送'].map((t) => (
          <View key={t} onClick={() => setTab(t)} style={{ flex: 1, textAlign: 'center', padding: '7px 0', borderRadius: `${radius.xs}px`, backgroundColor: tab === t ? '#fff' : 'transparent' }}>
            <Text style={{ fontSize: '13px', color: tab === t ? colors.textPrimary : colors.textMuted, fontWeight: tab === t ? 600 : 500 }}>{t}</Text>
          </View>
        ))}
      </View>
      <ScrollView scrollY style={{ flex: 1 }}>
        {filtered.length === 0 ? (
          <View style={{ textAlign: 'center', padding: '60px 0' }}>
            <Text style={{ fontSize: '14px', color: colors.textMuted }}>暂无通知</Text>
          </View>
        ) : (
          <View style={{ backgroundColor: '#fff', margin: `${spacing.xs}px ${spacing.md}px`, borderRadius: `${radius.md}px`, overflow: 'hidden' }}>
            {filtered.map((msg, i) => {
              const conf = NOTIF_TYPE_CONFIG[msg.type] || NOTIF_TYPE_CONFIG.system;
              return (
                <View key={msg._id || i}>
                  <View onClick={() => onPress(msg)} style={{ display: 'flex', alignItems: 'flex-start', padding: `${spacing.md}px`, backgroundColor: msg.unread ? '#FAFFFE' : '#fff' }}>
                    <View style={{ position: 'relative', width: '42px', height: '42px', borderRadius: '10px', backgroundColor: conf.color + '30', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: `${spacing.sm}px`, flexShrink: 0 }}>
                      <Text style={{ fontSize: '18px' }}>{conf.icon}</Text>
                      {msg.unread && <View style={{ position: 'absolute', top: '-2px', right: '-2px', width: '8px', height: '8px', borderRadius: '4px', backgroundColor: colors.danger, border: `1.5px solid #fff` }} />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <Text style={{ fontSize: '14px', fontWeight: msg.unread ? 600 : 500, color: colors.textPrimary }}>{msg.sender || msg.title || conf.label}</Text>
                        <Text style={{ fontSize: '11px', color: colors.textMuted }}>{fmtMsgTime(msg.createdAt)}</Text>
                      </View>
                      <Text style={{ fontSize: '13px', color: colors.textSecondary }} numberOfLines={3}>{msg.content}</Text>
                    </View>
                  </View>
                  {i < filtered.length - 1 && <View style={{ height: '1px', backgroundColor: colors.borderLight, marginLeft: '58px' }} />}
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function MessageDetailModal({ msg, onClose }) {
  if (msg.type === 'product') {
    return <ProductPushDetail msg={msg} onClose={onClose} />;
  }
  const conf = NOTIF_TYPE_CONFIG[msg.type] || { icon: '💬', color: colors.primary };
  return (
    <View style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)', zIndex: 100, display: 'flex', alignItems: 'flex-end' }} onClick={onClose}>
      <View onClick={(e) => e.stopPropagation && e.stopPropagation()} style={{ backgroundColor: '#fff', borderRadius: '28px 28px 0 0', padding: `${spacing.lg}px`, width: '100%', maxHeight: '75%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
        <View style={{ width: '36px', height: '4px', borderRadius: '2px', backgroundColor: colors.border, margin: '0 auto 16px' }} />
        <View style={{ display: 'flex', alignItems: 'center', marginBottom: `${spacing.md}px` }}>
          <View style={{ width: '44px', height: '44px', borderRadius: '14px', backgroundColor: conf.color + '30', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: `${spacing.sm}px` }}>
            <Text style={{ fontSize: '20px' }}>{conf.icon}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: '16px', fontWeight: 700, color: colors.textPrimary, display: 'block' }}>{msg.sender}</Text>
            <Text style={{ fontSize: '12px', color: colors.textMuted }}>{fmtMsgTime(msg.createdAt)}</Text>
          </View>
        </View>
        {!!msg.title && <Text style={{ fontSize: '17px', fontWeight: 700, color: colors.textPrimary, marginBottom: `${spacing.sm}px`, display: 'block' }}>{msg.title}</Text>}
        <ScrollView scrollY style={{ flex: 1, marginBottom: `${spacing.md}px` }}>
          <Text style={{ fontSize: '15px', color: colors.textSecondary, lineHeight: '24px' }}>{msg.content || '（暂无详细内容）'}</Text>
        </ScrollView>
        <View onClick={onClose} style={{ backgroundColor: colors.primary, borderRadius: `${radius.md}px`, padding: '14px', textAlign: 'center' }}>
          <Text style={{ color: '#fff', fontSize: '16px', fontWeight: 700 }}>关闭</Text>
        </View>
      </View>
    </View>
  );
}

const RENEWAL_PAYMENT_METHODS = [
  { key: 'wechat', label: '微信支付' },
  { key: 'alipay', label: '支付宝' },
];

function ProductPushDetail({ msg, onClose }) {
  const { user } = useAuth();
  const productList = (msg.products && msg.products.length > 0)
    ? msg.products
    : (msg.productId ? [{ productId: msg.productId, name: msg.productName, price: msg.price, category: '', icon: '🛍' }] : []);

  const [checkedIds, setCheckedIds] = useState(() => productList.map((p) => p.productId));
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
    servicesAPI.coupons().then((res) => { if (res.success) setCoupons(res.data || []); }).catch(() => {});
  }, []);

  const toggleItem = (id) => setCheckedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const allChecked = checkedIds.length === productList.length;
  const toggleAll = () => setCheckedIds(allChecked ? [] : productList.map((p) => p.productId));
  const checkedItems = productList.filter((p) => checkedIds.includes(p.productId));
  const total = checkedItems.reduce((s, p) => s + (p.price || 0), 0);

  const selectedCoupon = coupons.find((c) => c._id === couponId) || null;
  const couponDiscount = selectedCoupon
    ? Math.min(selectedCoupon.type === 'amount' ? selectedCoupon.value : Math.round(total * (100 - selectedCoupon.value)) / 100, total)
    : 0;
  const priceAfterCoupon = Math.max(0, Math.round((total - couponDiscount) * 100) / 100);
  const fundApplied = useFund ? Math.min(Number(fundAmountInput) || 0, fundBalance, priceAfterCoupon) : 0;
  const finalPrice = Math.max(0, Math.round((priceAfterCoupon - fundApplied) * 100) / 100);

  const handlePay = async () => {
    if (!checkedIds.length) return;
    setPaying(true); setPayError('');
    try {
      await pushRecordsAPI.pay(msg._id, { selectedProductIds: checkedIds, useHealthFund: fundApplied, couponId, paymentMethod: payMethod });
      setPaid(true);
    } catch (e) {
      setPayError(e.message || '下单失败，请稍后重试');
    } finally {
      setPaying(false);
    }
  };

  if (paid) {
    return (
      <View style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)', zIndex: 100, display: 'flex', alignItems: 'flex-end' }}>
        <View style={{ backgroundColor: '#fff', borderRadius: '28px 28px 0 0', width: '100%', boxSizing: 'border-box', padding: '40px 20px', textAlign: 'center' }}>
          <Text style={{ fontSize: '40px', display: 'block', marginBottom: '16px' }}>✅</Text>
          <Text style={{ fontSize: '20px', fontWeight: 800, color: colors.textPrimary, display: 'block', marginBottom: '8px' }}>订单已提交</Text>
          <Text style={{ fontSize: '14px', color: colors.textMuted, display: 'block', marginBottom: '8px' }}>共 {checkedItems.length} 项，实付 ¥{finalPrice}</Text>
          <Text style={{ fontSize: '13px', color: colors.textMuted, display: 'block', marginBottom: '32px' }}>健管师将尽快与您确认并安排后续服务</Text>
          <View onClick={onClose} style={{ backgroundColor: colors.primary, borderRadius: `${radius.md}px`, padding: '14px 40px', display: 'inline-block' }}>
            <Text style={{ color: '#fff', fontSize: '15px', fontWeight: 700 }}>完成</Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)', zIndex: 100, display: 'flex', alignItems: 'flex-end' }}>
      <View style={{ backgroundColor: '#fff', borderRadius: '28px 28px 0 0', padding: `${spacing.lg}px`, width: '100%', maxHeight: '85%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
        <View style={{ width: '36px', height: '4px', borderRadius: '2px', backgroundColor: colors.border, margin: '0 auto 16px' }} />
        <View style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: `${spacing.sm}px` }}>
          <Text style={{ fontSize: '16px', fontWeight: 700, color: colors.textPrimary }}>为您推荐以下产品</Text>
          <Text onClick={toggleAll} style={{ fontSize: '13px', color: colors.primary, fontWeight: 600 }}>{allChecked ? '取消全选' : '全选'}</Text>
        </View>
        <ScrollView scrollY style={{ flex: 1, marginBottom: `${spacing.sm}px` }}>
          {productList.map((p) => {
            const isChecked = checkedIds.includes(p.productId);
            return (
              <View key={p.productId} onClick={() => toggleItem(p.productId)} style={{
                display: 'flex', alignItems: 'center', padding: `${spacing.sm}px`, marginBottom: '8px', borderRadius: `${radius.sm}px`,
                border: `1.5px solid ${isChecked ? colors.primary : colors.border}`, backgroundColor: isChecked ? colors.primary10 : '#fff',
              }}>
                <View style={{
                  width: '22px', height: '22px', borderRadius: '6px', marginRight: `${spacing.sm}px`, flexShrink: 0,
                  border: `2px solid ${isChecked ? colors.primary : '#ccc'}`, backgroundColor: isChecked ? colors.primary : '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {isChecked && <Text style={{ color: '#fff', fontSize: '12px' }}>✓</Text>}
                </View>
                <View style={{ width: '40px', height: '40px', borderRadius: '10px', marginRight: `${spacing.sm}px`, flexShrink: 0, backgroundColor: colors.primary10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: '18px' }}>{p.icon || '🛍'}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: '14px', fontWeight: 600, color: colors.textPrimary, display: 'block' }}>{p.name}</Text>
                  {!!p.category && <Text style={{ fontSize: '11px', color: colors.primary }}>{p.category}</Text>}
                </View>
                <Text style={{ fontSize: '16px', fontWeight: 800, color: colors.primary, marginLeft: `${spacing.sm}px` }}>¥{p.price}</Text>
              </View>
            );
          })}
        </ScrollView>

        {coupons.length > 0 && (
          <View style={{ marginBottom: `${spacing.sm}px` }}>
            <Text style={{ fontSize: '12px', fontWeight: 600, color: colors.textPrimary, display: 'block', marginBottom: '6px' }}>优惠券</Text>
            <ScrollView scrollX style={{ whiteSpace: 'nowrap' }}>
              <View onClick={() => setCouponId(null)} style={{ display: 'inline-block', padding: '8px 12px', borderRadius: `${radius.md}px`, marginRight: '8px', border: `1.5px solid ${!couponId ? colors.primary : colors.border}`, backgroundColor: !couponId ? colors.primary10 : '#fff' }}>
                <Text style={{ fontSize: '12px', color: !couponId ? colors.primary : colors.textMuted, fontWeight: !couponId ? 700 : 500 }}>不使用</Text>
              </View>
              {coupons.map((c) => (
                <View key={c._id} onClick={() => setCouponId(c._id)} style={{ display: 'inline-block', padding: '8px 12px', borderRadius: `${radius.md}px`, marginRight: '8px', border: `1.5px solid ${couponId === c._id ? colors.primary : colors.border}`, backgroundColor: couponId === c._id ? colors.primary10 : '#fff' }}>
                  <Text style={{ fontSize: '12px', color: couponId === c._id ? colors.primary : colors.textMuted, fontWeight: couponId === c._id ? 700 : 500 }}>
                    {c.title || (c.type === 'amount' ? `¥${c.value}抵用券` : `${c.value / 10}折优惠券`)}
                  </Text>
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        {fundBalance > 0 && (
          <View style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: `${spacing.sm}px` }}>
            <Text style={{ fontSize: '12px', fontWeight: 600, color: colors.textPrimary }}>健康基金抵扣（余额¥{fundBalance.toFixed(2)}）</Text>
            <View onClick={() => {
              const next = !useFund;
              setUseFund(next);
              if (next) setFundAmountInput(String(Math.min(fundBalance, priceAfterCoupon)));
            }} style={{ padding: '6px 12px', borderRadius: `${radius.full}px`, border: `1.5px solid ${useFund ? colors.primary : colors.border}`, backgroundColor: useFund ? colors.primary : '#fff' }}>
              <Text style={{ fontSize: '12px', fontWeight: 600, color: useFund ? '#fff' : colors.textMuted }}>{useFund ? '已启用' : '使用基金'}</Text>
            </View>
          </View>
        )}

        <View style={{ display: 'flex', gap: `${spacing.sm}px`, marginBottom: `${spacing.sm}px` }}>
          {RENEWAL_PAYMENT_METHODS.map((m) => (
            <View key={m.key} onClick={() => setPayMethod(m.key)} style={{
              flex: 1, textAlign: 'center', padding: '10px', borderRadius: `${radius.md}px`,
              border: `1.5px solid ${payMethod === m.key ? colors.primary : colors.border}`,
              backgroundColor: payMethod === m.key ? colors.primary10 : colors.background,
            }}>
              <Text style={{ fontSize: '12px', color: payMethod === m.key ? colors.textPrimary : colors.textMuted, fontWeight: payMethod === m.key ? 700 : 500 }}>{m.label}</Text>
            </View>
          ))}
        </View>

        {!!payError && <Text style={{ fontSize: '12px', color: colors.danger, textAlign: 'center', marginBottom: '6px' }}>{payError}</Text>}

        <View style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <Text style={{ fontSize: '13px', color: colors.textMuted }}>
            已选 {checkedIds.length}/{productList.length} 项{(couponDiscount > 0 || fundApplied > 0) ? `（原价¥${total}）` : ''}
          </Text>
          <Text style={{ fontSize: '18px', fontWeight: 800, color: colors.primary }}>合计 ¥{finalPrice}</Text>
        </View>
        <View style={{ display: 'flex', gap: `${spacing.sm}px` }}>
          <View onClick={onClose} style={{ flex: 1, textAlign: 'center', padding: '14px', borderRadius: `${radius.md}px`, backgroundColor: colors.primary }}>
            <Text style={{ color: '#fff', fontSize: '16px', fontWeight: 700 }}>关闭</Text>
          </View>
          <View onClick={!checkedIds.length || paying ? undefined : handlePay} style={{ flex: 2, textAlign: 'center', padding: '14px', borderRadius: `${radius.md}px`, backgroundColor: colors.primary, opacity: (!checkedIds.length || paying) ? 0.5 : 1 }}>
            <Text style={{ color: '#fff', fontSize: '15px', fontWeight: 700 }}>{paying ? '提交中...' : `立即支付 ¥${finalPrice}`}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const ROLE_META = {
  doctor: { label: '家庭医师', icon: '🩺', color: colors.primary },
  manager: { label: '健管师', icon: '🧑‍💼', color: '#D97706' },
  nutritionist: { label: '营养师', icon: '🥗', color: '#059669' },
};

function ConversationThread({ role, onClose }) {
  const [msgs, setMsgs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const meta = ROLE_META[role] || ROLE_META.manager;
  const pollRef = useRef(null);

  const loadThread = useCallback(async () => {
    try {
      const res = await messagesAPI.getThread(role);
      setMsgs(res.data || []);
    } catch {}
    setLoading(false);
  }, [role]);

  useEffect(() => {
    loadThread();
    // 小程序无SSE支持，用10秒轮询代替app端的实时推送
    pollRef.current = setInterval(loadThread, 10000);
    return () => clearInterval(pollRef.current);
  }, [loadThread]);

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    setInput('');
    try {
      const res = await messagesAPI.send(role, text);
      if (res?.data) setMsgs((prev) => (prev.some((m) => m._id === res.data._id) ? prev : [...prev, res.data]));
    } catch {
      setInput(text);
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={{ display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: colors.background }}>
      <View style={{ display: 'flex', alignItems: 'center', padding: `${spacing.sm}px ${spacing.lg}px`, backgroundColor: '#fff', borderBottom: `1px solid ${colors.border}` }}>
        <Text onClick={onClose} style={{ fontSize: '15px', color: colors.textPrimary, marginRight: '12px' }}>‹</Text>
        <View style={{ flex: 1, textAlign: 'center' }}>
          <Text style={{ fontSize: '16px', fontWeight: 700, color: colors.textPrimary, display: 'block' }}>{meta.label}</Text>
          <Text style={{ fontSize: '11px', color: colors.success }}>● 在线</Text>
        </View>
        <View style={{ width: '20px' }} />
      </View>

      <ScrollView scrollY scrollIntoView="thread-bottom" style={{ flex: 1, padding: `${spacing.lg}px` }}>
        {loading ? (
          <Text style={{ fontSize: '13px', color: colors.textMuted }}>加载中...</Text>
        ) : msgs.length === 0 ? (
          <View style={{ textAlign: 'center', padding: '60px 0' }}>
            <View style={{ width: '64px', height: '64px', borderRadius: '32px', backgroundColor: meta.color + '30', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <Text style={{ fontSize: '28px' }}>{meta.icon}</Text>
            </View>
            <Text style={{ fontSize: '16px', fontWeight: 700, color: colors.textPrimary, display: 'block', marginBottom: '8px' }}>{meta.label}</Text>
            <Text style={{ fontSize: '13px', color: colors.textMuted }}>发送消息，您的{meta.label}会在工作时间内回复您</Text>
          </View>
        ) : (
          msgs.map((m, i) => {
            const isMine = m.type === 'user';
            const showTime = i === 0 || (new Date(m.createdAt) - new Date(msgs[i - 1].createdAt)) > 300000;
            return (
              <View key={m._id}>
                {showTime && <Text style={{ display: 'block', textAlign: 'center', fontSize: '11px', color: colors.textMuted, margin: '12px 0' }}>{new Date(m.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</Text>}
                <View style={{ display: 'flex', justifyContent: isMine ? 'flex-end' : 'flex-start', marginBottom: '10px' }}>
                  <View style={{
                    maxWidth: '78%', padding: '10px 14px', borderRadius: `${radius.md}px`,
                    backgroundColor: isMine ? colors.primary : '#fff', border: isMine ? 'none' : `1px solid ${colors.border}`,
                  }}>
                    {!isMine && (
                      <Text style={{ fontSize: '11px', fontWeight: 700, color: meta.color, display: 'block', marginBottom: '4px' }}>
                        {m.sender || meta.label}{m.isAI ? ' · AI' : ''}
                      </Text>
                    )}
                    <Text style={{ fontSize: '14px', color: isMine ? '#fff' : colors.textPrimary, lineHeight: '20px' }}>{m.content}</Text>
                  </View>
                </View>
              </View>
            );
          })
        )}
        <View id="thread-bottom" />
      </ScrollView>

      <View style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', padding: `${spacing.sm}px ${spacing.lg}px`, backgroundColor: '#fff', borderTop: `1px solid ${colors.border}` }}>
        <Textarea
          style={{ flex: 1, backgroundColor: colors.background, borderRadius: `${radius.md}px`, padding: '10px 14px', fontSize: '14px', maxHeight: '100px', border: `1.5px solid ${colors.border}`, boxSizing: 'border-box' }}
          placeholder={`发消息给${meta.label}…`}
          value={input}
          onInput={(e) => setInput(e.detail.value)}
          maxlength={500}
          autoHeight
        />
        <View onClick={send} style={{
          width: '40px', height: '40px', borderRadius: '20px', backgroundColor: (!input.trim() || sending) ? colors.border : colors.primary,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <Text style={{ color: '#fff', fontSize: '16px' }}>➤</Text>
        </View>
      </View>
    </View>
  );
}

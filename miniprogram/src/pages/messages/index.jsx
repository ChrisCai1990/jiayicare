import React, { useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, Textarea, ScrollView, Image } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { colors, spacing, radius, shadow } from '../../theme';
import { messagesAPI, pushRecordsAPI, questionnaireAPI, servicesAPI, userAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import useNavBar from '../../hooks/useNavBar';
import Icon from '../../components/Icon';

// 完整对齐 app/src/screens/messages/MessagesScreen.js 的固定角色分组方案。
// 简化点：
// - 小程序无 EventSource(SSE) 支持，会话内用 10 秒轮询代替实时推送（app端是SSE）
// - 语音播报(tts.speak)未接入，小程序场景暂不做
const ROLE_DEFS = [
  { key: 'doctor', label: '健康顾问', icon: '🩺', color: colors.primary },
  { key: 'manager', label: '健管专员', icon: '🧑‍💼', color: '#D97706' },
  { key: 'nutritionist', label: '营养师', icon: '🥗', color: '#059669' },
];

const EXTRA_TEAM_META = {
  specialist: { label: '专科医师', icon: '🏥', color: '#2563EB' },
  tcmDoctor: { label: '中医师', icon: '🌿', color: '#7C3AED' },
  psychologist: { label: '心理咨询师', icon: '💜', color: '#8A4AC7' },
  rehabSpecialist: { label: '运动复健师', icon: '🏃', color: '#0891B2' },
};

// 兼容数据库中已生成的旧角色名称，历史消息也统一使用当前人物定位。
const normalizeRoleSender = (sender = '') => sender
  .replace(/代家庭医师/g, '代健康顾问')
  .replace(/代健管师/g, '代健管专员');

const assistantName = (member, fallback) => {
  const title = String(member?.title || fallback).trim();
  const name = String(member?.name || '').trim().replace(new RegExp(`${title}$`), '');
  return name || title;
};
const visibleMessageContent = (message) => String(message?.content || '')
  .replace(/\n?以上为AI初步回复，仅供参考，不构成医疗诊断或建议，您的专属医护人员会尽快跟进。/g, '')
  .replace(/\n?（AI回复，仅供参考）/g, '')
  .replace(/[^。！？\n]*医生目前正忙于诊疗[^。！？\n]*[。！？]?/g, '真人这会儿正在接待其他客户，您可以先和我聊聊，我会陪您一起梳理。')
  .replace(/[^。！？\n]*真人(?:这会儿|目前)?正在接待(?:其他)?客户[^。！？\n]*[。！？]?/g, '在的，怎么啦？您接着说就好。')
  .replace(/我们会尽快安排专属健康管理师为您跟进[。！？]?/g, '')
  .replace(/我马上帮您转给专属顾问跟进[～~。！？]?/g, '您接着说就好，我会认真听着。')
  .trim();

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
    questionnaireId: pr.questionnaireId?._id || pr.questionnaireId || null,
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
  if (diffDays === 0) return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  if (diffDays === 1) return '昨天';
  if (diffDays < 7) return `周${'日一二三四五六'[d.getDay()]}`;
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export default function MessagesPage({ embedded = false, refreshKey = 0, onOpenPlanner, assistantConfig = {}, onlineStatus = { mode: 'ai', label: 'AI在线' } }) {
  const { statusBarHeight } = useNavBar();
  const { user } = useAuth();
  // Older production users can have careTeam saved as null/object. Keep render
  // code array-safe so one legacy record cannot blank the entire Taro page.
  const careTeam = Array.isArray(user?.careTeam) ? user.careTeam : [];
  const careTeamKinds = new Set(careTeam.map((m) => m?.kind).filter(Boolean));
  const careTeamMember = (key) => {
    const kind = { doctor: 'familyDoctor', nutritionist: 'nutritionist', manager: 'healthManager' }[key];
    return careTeam.find((m) => m?.kind === kind) || null;
  };
  const hasRole = (key) => {
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
  const [pendingQuestionnaireIds, setPendingQuestionnaireIds] = useState(new Set());

  const loadMessages = useCallback(async () => {
    try {
      const [msgRes, pushRes, pendingRes] = await Promise.allSettled([
        messagesAPI.list(), pushRecordsAPI.list(), questionnaireAPI.pending(),
      ]);
      const rawMessages = msgRes.status === 'fulfilled' && msgRes.value?.success ? msgRes.value.data : [];
      const msgData = Array.isArray(rawMessages) ? rawMessages : [];
      const rawPushRecords = pushRes.status === 'fulfilled' && pushRes.value?.success ? pushRes.value.data : [];
      const pushData = Array.isArray(rawPushRecords) ? rawPushRecords.map(normalizePushRecord) : [];
      const all = [...msgData, ...pushData].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      setMessages(all);
      const rawPending = pendingRes.status === 'fulfilled' && pendingRes.value?.success ? pendingRes.value.data : [];
      const pending = Array.isArray(rawPending) ? rawPending : [];
      setPendingQuestionnaireIds(new Set(pending.map((item) => String(item._id))));
      const unread = all.filter((item) => item.unread).length;
      if (unread > 0) Taro.setTabBarBadge({ index: 2, text: String(Math.min(unread, 99)) }).catch(() => {});
      else Taro.removeTabBarBadge({ index: 2 }).catch(() => {});
    } catch {
      setMessages([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useDidShow(() => { loadMessages(); });
  useEffect(() => { if (refreshKey) loadMessages(); }, [refreshKey, loadMessages]);

  // 系统消息有时也会携带 conversationId。它仍然属于用户通知，不能因为
  // 关联了会话就从“健康管家”入口消失。
  const notifMessages = messages.filter((m) => NOTIF_TYPES.has(m.type));
  const questionnaireMessages = notifMessages.filter((m) => (
    m.type === 'questionnaire' && m.questionnaireId && pendingQuestionnaireIds.has(String(m.questionnaireId))
  ));
  const careMessages = notifMessages.filter((m) => m.type === 'system' && /关怀|打卡|提醒/.test(`${m.title || ''}${m.content || ''}`));
  const systemMessages = notifMessages.filter((m) => !questionnaireMessages.includes(m) && !careMessages.includes(m));

  const roleConvs = ROLE_DEFS.map((r) => {
    const msgs = messages.filter((m) => m.type === r.key || (m.conversationId && String(m.conversationId).endsWith(`_${r.key}`)));
    const last = msgs[0];
    const unread = msgs.filter((m) => m.unread).length;
    return { ...r, last, unread, lastTime: last ? new Date(last.createdAt).getTime() : 0, kind: 'role', assigned: hasRole(r.key), member: careTeamMember(r.key) };
  });
  const extraTeamMembers = careTeam
    .filter((member) => EXTRA_TEAM_META[member?.kind])
    .map((member) => ({ ...EXTRA_TEAM_META[member.kind], key: member.kind, member, assigned: true, kind: 'profile' }));
  const assignedTeamCount = roleConvs.filter((conv) => conv.assigned).length + extraTeamMembers.length;

  const totalUnread = messages.filter((m) => m.unread).length;

  const openConv = async (conv) => {
    if (conv.kind === 'role' && conv.assigned === false) return;
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
        const remaining = Math.max(0, totalUnread - 1);
        if (remaining > 0) Taro.setTabBarBadge({ index: 2, text: String(Math.min(remaining, 99)) }).catch(() => {});
        else Taro.removeTabBarBadge({ index: 2 }).catch(() => {});
      } catch {}
    }
  };

  if (threadRole) {
    return <ConversationThread role={threadRole} member={careTeamMember(threadRole)} embedded={embedded} assistantConfig={assistantConfig} onlineStatus={onlineStatus} onClose={() => { setThreadRole(null); loadMessages(); }} />;
  }

  return (
    <View style={{ width: '100%', flex: embedded ? 1 : 'none', minHeight: embedded ? 'auto' : '100vh', boxSizing: 'border-box', backgroundColor: colors.background, paddingBottom: `${spacing.xl}px` }}>
      {!embedded && <View style={{ display: 'flex', alignItems: 'center', padding: `${statusBarHeight + 12}px ${spacing.lg}px ${spacing.sm}px` }}>
        <Text style={{ fontSize: '22px', fontWeight: 800, color: colors.textPrimary }}>消息</Text>
        {totalUnread > 0 && (
          <View style={{ marginLeft: '8px', minWidth: '22px', height: '22px', borderRadius: '11px', backgroundColor: colors.danger, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 6px' }}>
            <Text style={{ fontSize: '12px', color: '#fff', fontWeight: 700 }}>{totalUnread > 99 ? '99+' : totalUnread}</Text>
          </View>
        )}
      </View>}

      {loading ? (
        <Text style={{ fontSize: '13px', color: colors.textMuted, padding: `0 ${spacing.lg}px` }}>加载中...</Text>
      ) : (
        <View style={{ width: '100%', boxSizing: 'border-box', padding: `0 ${spacing.md}px` }}>
          <Text style={{ display: 'block', fontSize: '15px', fontWeight: 700, color: colors.textPrimary, margin: `0 ${spacing.xs}px ${spacing.sm}px` }}>{assistantConfig.teamName || '健康服务团队'} · {onlineStatus.label}</Text>
          <View onClick={onOpenPlanner} style={{ position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', padding: '16px', marginBottom: `${spacing.md}px`, backgroundColor: colors.primary, borderRadius: `${radius.lg}px`, boxShadow: shadow.card }}>
            <View style={{ position: 'absolute', width: '100px', height: '100px', borderRadius: '50px', right: '-25px', top: '-35px', backgroundColor: 'rgba(255,255,255,0.08)' }} />
            <View style={{ width: '46px', height: '46px', borderRadius: '15px', backgroundColor: 'rgba(255,255,255,0.16)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: '12px', flexShrink: 0 }}><Icon name="✨" size={20} color="#fff" /></View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ display: 'block', fontSize: '16px', fontWeight: 800, color: '#fff' }}>{assistantConfig.plannerName || '小嘉 | 健康规划师'}</Text>
              <Text style={{ display: 'block', fontSize: '11px', lineHeight: '17px', color: 'rgba(255,255,255,0.84)', marginTop: '3px' }}>{assistantConfig.plannerCardSubtitle || '承接复查提醒并协助办理'}</Text>
            </View>
            <Text style={{ position: 'relative', color: '#fff', fontSize: '20px', marginLeft: '8px' }}>›</Text>
          </View>

          <View style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', margin: `0 ${spacing.xs}px ${spacing.sm}px` }}>
            <View>
              <Text style={{ display: 'block', fontSize: '17px', fontWeight: 800, color: colors.textPrimary }}>{assistantConfig.teamName || '健康服务团队'}</Text>
              <Text style={{ display: 'block', fontSize: '11px', color: colors.textMuted, marginTop: '2px' }}>{assignedTeamCount > 0 ? `已配置 ${assignedTeamCount} 位服务人员` : '开通相应服务后为您配置专属人员'}</Text>
            </View>
            {assignedTeamCount > 0 && <View style={{ padding: '4px 8px', borderRadius: `${radius.full}px`, backgroundColor: '#E8F5EF' }}><Text style={{ color: colors.primary, fontSize: '10px', fontWeight: 700 }}>服务中</Text></View>}
          </View>
          <View style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.sm}px`, margin: `0 ${spacing.xs}px ${spacing.lg}px` }}>
          {[...roleConvs, ...extraTeamMembers].map((conv) => {
            const unassigned = conv.kind === 'role' && conv.assigned === false;
            const preview = unassigned
              ? '仅对年度会员开放，开通后为您配置专属服务团队'
              : conv.last?.content || conv.last?.title || (conv.member ? `已配置：${conv.member.name}` : '暂无消息');
            return (
                <View key={conv.key} onClick={() => conv.kind === 'role' && openConv(conv)} style={{ position: 'relative', display: 'flex', alignItems: 'center', width: '100%', minWidth: 0, padding: '13px 14px', boxSizing: 'border-box', backgroundColor: '#fff', borderRadius: `${radius.md}px`, border: `1px solid ${unassigned ? colors.border : `${conv.color}30`}`, boxShadow: shadow.xs }}>
                  <View style={{
                    position: 'relative', width: '44px', height: '44px', borderRadius: '14px', marginRight: '12px',
                    backgroundColor: unassigned ? colors.border : conv.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <Icon name={conv.icon} size={20} color="#fff" />
                    {conv.unread > 0 && !unassigned && (
                      <View style={{ position: 'absolute', top: '-3px', right: '-3px', minWidth: '16px', height: '16px', borderRadius: '8px', backgroundColor: colors.danger, border: `1.5px solid ${colors.background}`, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px' }}>
                        <Text style={{ fontSize: '9px', color: '#fff', fontWeight: 700 }}>{conv.unread > 99 ? '99+' : conv.unread}</Text>
                      </View>
                    )}
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                      <Text style={{ fontSize: '14px', fontWeight: 750, color: unassigned ? colors.textMuted : colors.textPrimary }}>{conv.member?.name || conv.label}</Text>
                      {!!conv.member?.name && <Text style={{ fontSize: '10px', color: conv.color, backgroundColor: `${conv.color}14`, borderRadius: `${radius.full}px`, padding: '2px 6px' }}>{conv.member.role || conv.label}</Text>}
                    </View>
                    <Text style={{ display: 'block', marginTop: '5px', fontSize: '11px', color: colors.textMuted, lineHeight: '16px' }} numberOfLines={2}>{conv.member?.name ? (conv.last?.content || conv.last?.title || '已加入您的服务团队，可在这里查看沟通与服务消息') : preview}</Text>
                  </View>
                  {conv.kind === 'role' && !unassigned && <Text style={{ fontSize: '18px', color: colors.textMuted, marginLeft: '8px' }}>›</Text>}
                </View>
            );
          })}
          </View>

          <Text style={{ display: 'block', fontSize: '15px', fontWeight: 700, color: colors.textPrimary, margin: `0 ${spacing.xs}px ${spacing.sm}px` }}>消息与提醒</Text>
          <View style={{ display: 'flex', width: '100%', gap: `${spacing.sm}px`, marginBottom: `${spacing.md}px` }}>
            {[
              { label: '待填问卷', icon: '📝', color: '#0077B6', count: questionnaireMessages.length, tab: '待填问卷' },
              { label: '每日关怀', icon: '💜', color: '#8A4AC7', count: careMessages.filter((m) => m.unread).length, tab: '每日关怀' },
              { label: '系统通知', icon: '🔔', color: colors.primary, count: systemMessages.filter((m) => m.unread).length, tab: '系统通知' },
            ].map((item) => (
              <View key={item.label} onClick={() => { setNotifTab(item.tab); setShowNotif(true); }} style={{ position: 'relative', flex: 1, width: 0, minWidth: 0, minHeight: '96px', padding: '13px 5px 11px', boxSizing: 'border-box', textAlign: 'center', backgroundColor: '#fff', borderRadius: `${radius.md}px`, boxShadow: shadow.xs }}>
                <View style={{ width: '34px', height: '34px', borderRadius: '11px', margin: '0 auto 7px', backgroundColor: `${item.color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={item.icon} size={16} color={item.color} /></View>
                <Text style={{ fontSize: '12px', fontWeight: 650, color: colors.textPrimary }}>{item.label}</Text>
                {item.count > 0 && <View style={{ position: 'absolute', top: '7px', right: '12px', minWidth: '17px', height: '17px', borderRadius: '9px', padding: '0 3px', backgroundColor: colors.danger, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontSize: '9px', fontWeight: 700 }}>{item.count > 99 ? '99+' : item.count}</Text></View>}
              </View>
            ))}
          </View>
        </View>
      )}

      {showNotif && (
        <NotifModal
          messages={[...questionnaireMessages, ...notifMessages.filter((m) => m.type !== 'questionnaire')]}
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
  const { statusBarHeight } = useNavBar();
  const filtered = messages.filter((m) => {
    if (tab === '待填问卷') return m.type === 'questionnaire';
    if (tab === '每日关怀') return m.type === 'system' && /关怀|打卡|提醒/.test(`${m.title || ''}${m.content || ''}`);
    if (tab === '系统通知') return !(m.type === 'questionnaire' || (m.type === 'system' && /关怀|打卡|提醒/.test(`${m.title || ''}${m.content || ''}`)));
    return true;
  });

  return (
    <View style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.background, zIndex: 100, display: 'flex', flexDirection: 'column' }}>
      <View style={{ display: 'flex', alignItems: 'center', padding: `${statusBarHeight + 8}px ${spacing.lg}px ${spacing.sm}px` , backgroundColor: '#fff', borderBottom: `1px solid ${colors.border}` }}>
        <Text onClick={onClose} style={{ fontSize: '14px', color: colors.primary, marginRight: '12px' }}>‹ 返回</Text>
        <Text style={{ flex: 1, fontSize: '16px', fontWeight: 700, color: colors.textPrimary, textAlign: 'center', marginRight: '40px' }}>系统通知</Text>
      </View>
      <View style={{ display: 'flex', margin: `${spacing.sm}px ${spacing.lg}px`, backgroundColor: '#EEEAE3', borderRadius: `${radius.sm}px`, padding: '3px' }}>
        {['全部', '待填问卷', '每日关怀', '系统通知'].map((t) => (
          <View key={t} onClick={() => setTab(t)} style={{ flex: 1, textAlign: 'center', padding: '7px 0', borderRadius: `${radius.xs}px`, backgroundColor: tab === t ? '#fff' : 'transparent' }}>
            <Text style={{ fontSize: '13px', color: tab === t ? colors.textPrimary : colors.textMuted, fontWeight: tab === t ? 600 : 500 }}>{t}</Text>
          </View>
        ))}
      </View>
      <ScrollView scrollY enhanced showScrollbar style={{ flex: 1, height: 0 }}>
        {filtered.length === 0 ? (
          <View style={{ textAlign: 'center', padding: '60px 0' }}>
            <Text style={{ fontSize: '14px', color: colors.textMuted }}>暂无通知</Text>
          </View>
        ) : (
          <View style={{ backgroundColor: '#fff', margin: `${spacing.xs}px ${spacing.md}px 96px`, borderRadius: `${radius.md}px`, overflow: 'hidden' }}>
            {filtered.map((msg, i) => {
              const conf = NOTIF_TYPE_CONFIG[msg.type] || NOTIF_TYPE_CONFIG.system;
              return (
                <View key={msg._id || i}>
                  <View onClick={() => onPress(msg)} style={{ display: 'flex', alignItems: 'flex-start', padding: `${spacing.md}px`, backgroundColor: msg.unread ? '#FAFFFE' : '#fff' }}>
                    <View style={{ position: 'relative', width: '42px', height: '42px', borderRadius: '10px', backgroundColor: conf.color + '30', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: `${spacing.sm}px`, flexShrink: 0 }}>
                      <Icon name={conf.icon} size={18} color={conf.color} />
                      {msg.unread && <View style={{ position: 'absolute', top: '-2px', right: '-2px', width: '8px', height: '8px', borderRadius: '4px', backgroundColor: colors.danger, border: `1.5px solid #fff` }} />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <Text style={{ fontSize: '14px', fontWeight: msg.unread ? 600 : 500, color: colors.textPrimary }}>{normalizeRoleSender(msg.sender) || msg.title || conf.label}</Text>
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
  const openQuestionnaire = () => {
    const questionnaireId = msg.questionnaireId ? `?id=${encodeURIComponent(msg.questionnaireId)}` : '';
    onClose();
    Taro.navigateTo({ url: `/pages/questionnaire/index${questionnaireId}` });
  };
  return (
    <View style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)', zIndex: 100, display: 'flex', alignItems: 'flex-end' }} onClick={onClose}>
      <View onClick={(e) => e.stopPropagation && e.stopPropagation()} style={{ backgroundColor: '#fff', borderRadius: '28px 28px 0 0', padding: `${spacing.lg}px`, width: '100%', maxHeight: '75%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
        <View style={{ width: '36px', height: '4px', borderRadius: '2px', backgroundColor: colors.border, margin: '0 auto 16px' }} />
        <View style={{ display: 'flex', alignItems: 'center', marginBottom: `${spacing.md}px` }}>
          <View style={{ width: '44px', height: '44px', borderRadius: '14px', backgroundColor: conf.color + '30', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: `${spacing.sm}px` }}>
            <Icon name={conf.icon} size={20} color={conf.color} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: '16px', fontWeight: 700, color: colors.textPrimary, display: 'block' }}>{normalizeRoleSender(msg.sender)}</Text>
            <Text style={{ fontSize: '12px', color: colors.textMuted }}>{fmtMsgTime(msg.createdAt)}</Text>
          </View>
        </View>
        {!!msg.title && <Text style={{ fontSize: '17px', fontWeight: 700, color: colors.textPrimary, marginBottom: `${spacing.sm}px`, display: 'block' }}>{msg.title}</Text>}
        <ScrollView scrollY style={{ flex: 1, marginBottom: `${spacing.md}px` }}>
          <Text style={{ fontSize: '15px', color: colors.textSecondary, lineHeight: '24px' }}>{msg.content || '（暂无详细内容）'}</Text>
        </ScrollView>
        <View style={{ display: 'flex', gap: `${spacing.sm}px` }}>
          <View onClick={onClose} style={{ flex: 1, border: `1.5px solid ${colors.primary}`, borderRadius: `${radius.md}px`, padding: '14px', textAlign: 'center' }}>
            <Text style={{ color: colors.primary, fontSize: '16px', fontWeight: 700 }}>关闭</Text>
          </View>
          {msg.type === 'questionnaire' && (
            <View onClick={openQuestionnaire} style={{ flex: 2, backgroundColor: '#0077B6', borderRadius: `${radius.md}px`, padding: '14px', textAlign: 'center' }}>
              <Text style={{ color: '#fff', fontSize: '16px', fontWeight: 700 }}>填写问卷</Text>
            </View>
          )}
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
  const { user, updateUser } = useAuth();
  const productList = (msg.products && msg.products.length > 0)
    ? msg.products
    : (msg.productId ? [{ productId: msg.productId, name: msg.productName, price: msg.price, category: '', icon: '🛍' }] : []);

  const [checkedIds, setCheckedIds] = useState(() => productList.map((p) => p.productId));
  const [paying, setPaying] = useState(false);
  const [paid, setPaid] = useState(false);
  const [payError, setPayError] = useState('');
  const [payMethod, setPayMethod] = useState('wechat');
  const [checkoutUser, setCheckoutUser] = useState(user);
  const fundBalance = checkoutUser?.healthFund?.total || 0;
  const fundRuleDescription = checkoutUser?.healthFund?.rule?.description || '';
  const [useFund, setUseFund] = useState(false);
  const [fundAmountInput, setFundAmountInput] = useState('');
  const [coupons, setCoupons] = useState([]);
  const [couponId, setCouponId] = useState(null);

  useEffect(() => {
    Promise.all([servicesAPI.coupons(), userAPI.getMe()]).then(([couponRes, userRes]) => {
      if (couponRes.success) setCoupons(couponRes.data || []);
      if (userRes.success) { setCheckoutUser(userRes.data); updateUser(userRes.data); }
    }).catch(() => setPayError('优惠权益加载失败，请检查网络后重试'));
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
          <View style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
            <Icon name="✅" size={40} color={colors.primary} />
          </View>
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
                  {isChecked && <Icon name="✓" size={12} color="#fff" />}
                </View>
                <View style={{ width: '40px', height: '40px', borderRadius: '10px', marginRight: `${spacing.sm}px`, flexShrink: 0, backgroundColor: colors.primary10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name={p.icon || '🛍'} size={18} color={colors.primary} />
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

        {(
          <View style={{ marginBottom: `${spacing.sm}px` }}>
            <Text style={{ fontSize: '12px', fontWeight: 600, color: colors.textPrimary, display: 'block', marginBottom: '6px' }}>抵用券</Text>
            {coupons.length === 0 && <Text style={{ fontSize: '12px', color: colors.textMuted, display: 'block', marginBottom: '6px' }}>当前账户暂无可用抵用券</Text>}
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
          <View style={{ marginBottom: `${spacing.sm}px` }}>
            <View style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: '12px', fontWeight: 600, color: colors.textPrimary }}>健康基金抵扣（余额¥{fundBalance.toFixed(2)}）</Text>
              <View onClick={() => {
                const next = !useFund;
                setUseFund(next);
                if (next) setFundAmountInput(String(Math.min(fundBalance, priceAfterCoupon)));
              }} style={{ padding: '6px 12px', borderRadius: `${radius.full}px`, border: `1.5px solid ${useFund ? colors.primary : colors.border}`, backgroundColor: useFund ? colors.primary : '#fff' }}>
                <Text style={{ fontSize: '12px', fontWeight: 600, color: useFund ? '#fff' : colors.textMuted }}>{useFund ? '已启用' : '使用基金'}</Text>
              </View>
            </View>
            {useFund && !!fundRuleDescription && <Text style={{ fontSize: '11px', color: colors.textSecondary, lineHeight: '17px', display: 'block', marginTop: '6px' }}>使用规则：{fundRuleDescription}</Text>}
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
  doctor: { label: '健康顾问', icon: '🩺', color: colors.primary },
  manager: { label: '健管专员', icon: '🧑‍💼', color: '#D97706' },
  nutritionist: { label: '营养师', icon: '🥗', color: '#059669' },
};

function ConversationThread({ role, member, onClose, embedded = false, assistantConfig = {}, onlineStatus = { mode: 'ai', label: 'AI在线' } }) {
  const { statusBarHeight } = useNavBar();
  const [msgs, setMsgs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [humanActive, setHumanActive] = useState(false);
  const [foodImages, setFoodImages] = useState([]);
  const meta = ROLE_META[role] || ROLE_META.manager;
  const aiAssistantName = assistantName(member, meta.label);
  const pollRef = useRef(null);

  const loadThread = useCallback(async () => {
    try {
      const res = await messagesAPI.getThread(role);
      setMsgs(res.data || []);
      setHumanActive(!!res.humanActive);
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
    if ((!text && !foodImages.length) || sending) return;
    setSending(true);
    setInput('');
    try {
      let extra = {};
      if (foodImages.length) {
        extra = { images: foodImages.map(({ data, mimeType }) => ({ data, mimeType })) };
      }
      const res = await messagesAPI.send(role, text || '图片记录', extra);
      if (res?.data) setMsgs((prev) => (prev.some((m) => m._id === res.data._id) ? prev : [...prev, res.data]));
      setFoodImages([]);
      // 服务团队频道只负责沟通，不把每轮问答自动写成“日常健康打卡”。
      // 用户需要形成饮食记录时，应从专门的营养记录入口明确提交餐食/照片。
      setTimeout(loadThread, 500);
    } catch {
      setInput(text);
    } finally {
      setSending(false);
    }
  };

  const chooseFoodImage = async () => {
    try {
      const result = await Taro.chooseImage({ count: Math.max(1, 9 - foodImages.length), sizeType: ['compressed'], sourceType: ['album', 'camera'] });
      const next = (result.tempFilePaths || []).map((path) => {
        const base64 = Taro.getFileSystemManager().readFileSync(path, 'base64');
        const ext = (path.split('.').pop() || 'jpg').toLowerCase();
        const mimeType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
        return { path, mimeType, data: `data:${mimeType};base64,${base64}` };
      });
      setFoodImages((prev) => [...prev, ...next].slice(0, 9));
    } catch (err) {
      if (!/cancel/i.test(err?.errMsg || '')) Taro.showToast({ title: '无法读取图片', icon: 'none' });
    }
  };

  return (
    <View style={{ display: 'flex', flexDirection: 'column', height: embedded ? '100%' : '100vh', flex: 1, minHeight: 0, backgroundColor: colors.background }}>
      <View style={{ display: 'flex', alignItems: 'center', flexShrink: 0, position: 'relative', zIndex: 20, padding: `${embedded ? 10 : statusBarHeight + 8}px ${spacing.lg}px ${spacing.sm}px`, backgroundColor: '#fff', borderBottom: `1px solid ${colors.border}` }}>
        <View onClick={onClose} style={{ minWidth: '64px', padding: '8px 0', marginRight: '8px' }}><Text style={{ fontSize: '14px', color: colors.primary, fontWeight: 600 }}>‹ 返回</Text></View>
        <View style={{ flex: 1, textAlign: 'center' }}>
          <Text style={{ fontSize: '16px', fontWeight: 700, color: colors.textPrimary, display: 'block' }}>{meta.label}</Text>
          <Text style={{ fontSize: '11px', color: humanActive ? '#D97706' : colors.success }}>● {humanActive ? '人工服务中' : 'AI在线'}</Text>
        </View>
        <View style={{ width: '20px' }} />
      </View>

      <ScrollView scrollY scrollIntoView={`thread-bottom-${msgs.length}`} scrollAnchoring scrollWithAnimation style={{ flex: 1, height: 0, minHeight: 0, padding: `${spacing.lg}px`, boxSizing: 'border-box' }}>
        {loading ? (
          <Text style={{ fontSize: '13px', color: colors.textMuted }}>加载中...</Text>
        ) : msgs.length === 0 ? (
          <View style={{ textAlign: 'center', padding: '60px 0' }}>
            <View style={{ width: '64px', height: '64px', borderRadius: '32px', backgroundColor: meta.color + '30', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <Icon name={meta.icon} size={28} color={meta.color} />
            </View>
            <Text style={{ fontSize: '16px', fontWeight: 700, color: colors.textPrimary, display: 'block', marginBottom: '8px' }}>{meta.label}</Text>
            <Text style={{ fontSize: '13px', color: colors.textMuted }}>发送消息，您的{meta.label}会在工作时间内回复您</Text>
          </View>
        ) : (
          msgs.map((m, i) => {
            const isMine = m.type === 'user';
            const currentDate = new Date(m.createdAt);
            const previousDate = i > 0 ? new Date(msgs[i - 1].createdAt) : null;
            const showDate = !previousDate || currentDate.toDateString() !== previousDate.toDateString();
            const dateLabel = currentDate.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
            const timeLabel = currentDate.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
            return (
              <View key={m._id} id={`thread-msg-${m._id}`}>
                {showDate && <Text style={{ display: 'block', textAlign: 'center', fontSize: '11px', color: colors.textMuted, margin: '14px 0 6px' }}>{dateLabel}</Text>}
                <View style={{ display: 'flex', width: '100%', minWidth: 0, justifyContent: isMine ? 'flex-end' : 'flex-start', marginBottom: '10px', boxSizing: 'border-box' }}>
                  <View style={{
                    maxWidth: '78%', minWidth: 0, padding: '10px 14px', borderRadius: `${radius.md}px`, boxSizing: 'border-box', overflow: 'hidden',
                    backgroundColor: isMine ? colors.primary : '#fff', border: isMine ? 'none' : `1px solid ${colors.border}`,
                  }}>
                    {(m.imageUrls?.length ? m.imageUrls : (m.imageUrl ? [m.imageUrl] : [])).map((url) => <Image key={url} src={url} mode="aspectFill" style={{ width: '190px', height: '140px', borderRadius: '8px', marginBottom: '6px', display: 'block' }} />)}
                    {!isMine && (
                      <Text style={{ fontSize: '11px', fontWeight: 700, color: meta.color, display: 'block', marginBottom: '4px' }}>
                        {m.isAI ? aiAssistantName : (normalizeRoleSender(m.sender) || meta.label)}
                      </Text>
                    )}
                    <Text style={{ display: 'block', textAlign: isMine ? 'right' : 'left', fontSize: '9px', color: isMine ? 'rgba(255,255,255,0.72)' : colors.textMuted, marginBottom: '3px' }}>{timeLabel}</Text>
                    <Text style={{ display: 'block', width: '100%', fontSize: '14px', color: isMine ? '#fff' : colors.textPrimary, lineHeight: '20px', whiteSpace: 'pre-wrap', wordBreak: 'break-all', overflowWrap: 'anywhere' }}>{visibleMessageContent(m)}</Text>
                  </View>
                </View>
              </View>
            );
          })
        )}
        <View id={`thread-bottom-${msgs.length}`} style={{ height: '24px' }} />
      </ScrollView>

      {foodImages.length > 0 && (
        <View style={{ padding: `8px ${spacing.lg}px`, backgroundColor: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
          {foodImages.map((img, index) => <View key={img.path} style={{ position: 'relative' }}><Image src={img.path} mode="aspectFill" style={{ width: '52px', height: '52px', borderRadius: '8px' }} /><Text onClick={() => setFoodImages((prev) => prev.filter((_, i) => i !== index))} style={{ position: 'absolute', right: 0, top: 0, color: '#fff', backgroundColor: colors.danger }}>×</Text></View>)}
        </View>
      )}
      <View style={{ display: 'flex', alignItems: 'flex-end', flexShrink: 0, gap: '8px', padding: `${spacing.sm}px ${spacing.lg}px`, paddingBottom: `calc(${spacing.sm}px + env(safe-area-inset-bottom))`, backgroundColor: '#fff', borderTop: `1px solid ${colors.border}` }}>
        <Textarea
          style={{ flex: 1, width: 0, minWidth: 0, backgroundColor: colors.background, borderRadius: `${radius.md}px`, padding: '9px 12px', fontSize: '14px', minHeight: '40px', maxHeight: '100px', border: `1.5px solid ${colors.border}`, boxSizing: 'border-box' }}
          placeholder={`发消息给${meta.label}…`}
          value={input}
          onInput={(e) => setInput(e.detail.value)}
          fixed
          adjustPosition={false}
          cursorSpacing={12}
          maxlength={500}
          autoHeight
        />
        <View onClick={chooseFoodImage} style={{ width: '40px', height: '40px', borderRadius: '20px', backgroundColor: '#E8F5EF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Text style={{ fontSize: '18px' }}>📷</Text></View>
        <View onClick={send} style={{
          width: '40px', height: '40px', borderRadius: '20px', backgroundColor: ((!input.trim() && !foodImages.length) || sending) ? colors.border : colors.primary,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <Icon name="➤" size={16} color="#fff" />
        </View>
      </View>
    </View>
  );
}

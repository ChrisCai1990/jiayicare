import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, Modal, TouchableOpacity, TouchableWithoutFeedback,
  StyleSheet, Animated, ActivityIndicator, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius } from '../theme';
import { shareAPI, messagesAPI } from '../services/api';

// ── 渠道配置 ─────────────────────────────────────────────────────
const CHANNELS = [
  {
    id: 'wechat_friend',
    label: '微信好友',
    icon: 'logo-wechat',
    color: '#07C160',
    bg: '#E8F9EE',
    needsUrl: true,
  },
  {
    id: 'wechat_moments',
    label: '朋友圈',
    icon: 'people-outline',
    color: '#07C160',
    bg: '#E8F9EE',
    needsUrl: true,
  },
  {
    id: 'qq',
    label: 'QQ 分享',
    icon: 'chatbox-ellipses-outline',
    color: '#1E90FF',
    bg: '#E8F0FF',
    needsUrl: true,
  },
  {
    id: 'doctor',
    label: '发给医生',
    icon: 'medical-outline',
    color: colors.primary,
    bg: colors.primary + '12',
    needsUrl: false,
  },
  {
    id: 'manager',
    label: '发给健管师',
    icon: 'person-circle-outline',
    color: '#7C3AED',
    bg: '#F2EEFF',
    needsUrl: false,
  },
  {
    id: 'more',
    label: '更多',
    icon: 'ellipsis-horizontal-circle-outline',
    color: colors.textSecondary,
    bg: colors.border,
    needsUrl: false,
  },
];

function ChannelIcon({ ch, onPress, loading, done, disabled }) {
  return (
    <TouchableOpacity
      style={styles.channelItem}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
    >
      <View style={[styles.channelIconWrap, { backgroundColor: ch.bg }, disabled && styles.channelDisabled]}>
        {loading
          ? <ActivityIndicator size="small" color={ch.color} />
          : done
            ? <Ionicons name="checkmark" size={22} color={colors.success} />
            : <Ionicons name={ch.icon} size={22} color={disabled ? colors.textDisabled : ch.color} />
        }
      </View>
      <Text style={[styles.channelLabel, disabled && { color: colors.textDisabled }]}>{ch.label}</Text>
    </TouchableOpacity>
  );
}

export default function ShareSheet({ visible, onClose, report, period = 'week' }) {
  const slideAnim = useRef(new Animated.Value(400)).current;

  const [shareUrl, setShareUrl]       = useState('');
  const [urlLoading, setUrlLoading]   = useState(false);
  const [urlError, setUrlError]       = useState('');
  const [copiedUrl, setCopiedUrl]     = useState(false);
  const [actionState, setActionState] = useState({}); // { [channelId]: 'loading'|'done'|'error' }
  const [toast, setToast]             = useState('');

  // 打开时生成 share token
  useEffect(() => {
    if (!visible || !report) return;
    setShareUrl('');
    setUrlError('');
    setCopiedUrl(false);
    setActionState({});
    setUrlLoading(true);

    shareAPI.create(period, report)
      .then(res => {
        if (res.success) setShareUrl(res.data.shareUrl);
        else setUrlError('链接生成失败');
      })
      .catch(() => setUrlError('链接生成失败'))
      .finally(() => setUrlLoading(false));
  }, [visible, report, period]);

  // 动画
  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: visible ? 0 : 400,
      useNativeDriver: true,
      friction: 20,
      tension: 150,
    }).start();
  }, [visible]);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2200);
  };

  const setChannelState = (id, state) =>
    setActionState(prev => ({ ...prev, [id]: state }));

  // ── 处理各渠道 ────────────────────────────────────────────────
  const handleChannel = async (ch) => {
    if (actionState[ch.id] === 'loading' || actionState[ch.id] === 'done') return;

    // ── 发给医生 / 健管师 ────────────────────────────────────────
    if (ch.id === 'doctor' || ch.id === 'manager') {
      const to = ch.id === 'doctor' ? 'doctor' : 'manager';
      const reportText = buildReportText(report);
      setChannelState(ch.id, 'loading');
      try {
        await messagesAPI.send(to, reportText);
        setChannelState(ch.id, 'done');
        showToast(`已发送给${ch.label.replace('发给', '')}，对方会尽快查看`);
      } catch {
        setChannelState(ch.id, 'error');
        showToast('发送失败，请重试');
      }
      return;
    }

    // ── 更多（系统分享） ─────────────────────────────────────────
    if (ch.id === 'more') {
      const text = buildReportText(report);
      const shareData = { title: '我的健康报告', text };
      if (shareUrl) shareData.url = shareUrl;
      try {
        if (navigator?.share) await navigator.share(shareData);
        else { await copyToClipboard(shareUrl || text); showToast('内容已复制到剪贴板'); }
      } catch (e) {
        if (e?.name !== 'AbortError') showToast('分享失败');
      }
      return;
    }

    // ── URL 渠道（微信好友、朋友圈、QQ） ────────────────────────
    if (!shareUrl) { showToast('链接生成中，请稍候'); return; }

    const text = buildReportText(report);
    const title = ch.id === 'wechat_moments'
      ? `【金伊森】我的${report?.period || '健康报告'}，健康评分 ${report?.healthScore} 分`
      : `我的${report?.period || '健康报告'}`;

    const shareData = { title, text, url: shareUrl };

    if (ch.id === 'qq') {
      // QQ 直接调系统分享
      try {
        if (navigator?.share) await navigator.share(shareData);
        else { await copyToClipboard(shareUrl); showToast('链接已复制，可粘贴到 QQ 分享'); }
      } catch (e) {
        if (e?.name !== 'AbortError') { await copyToClipboard(shareUrl); showToast('链接已复制'); }
      }
      return;
    }

    // 微信好友 / 朋友圈：优先 navigator.share，降级复制链接
    try {
      if (navigator?.share) {
        await navigator.share(shareData);
      } else {
        await copyToClipboard(shareUrl);
        showToast('链接已复制，打开微信粘贴即可分享');
      }
    } catch (e) {
      if (e?.name !== 'AbortError') {
        await copyToClipboard(shareUrl);
        showToast('链接已复制，打开微信粘贴即可分享');
      }
    }
  };

  const copyShareUrl = async () => {
    if (!shareUrl) return;
    await copyToClipboard(shareUrl);
    setCopiedUrl(true);
    showToast('链接已复制到剪贴板');
    setTimeout(() => setCopiedUrl(false), 3000);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* 背景遮罩 */}
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay} />
      </TouchableWithoutFeedback>

      <Animated.View style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}>
        {/* 把手 */}
        <View style={styles.handle} />

        {/* 标题 */}
        <View style={styles.header}>
          <Text style={styles.title}>分享健康报告</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="close" size={20} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        {/* 渠道图标网格 */}
        <View style={styles.channelGrid}>
          {CHANNELS.map(ch => (
            <ChannelIcon
              key={ch.id}
              ch={ch}
              onPress={() => handleChannel(ch)}
              loading={actionState[ch.id] === 'loading'}
              done={actionState[ch.id] === 'done'}
              disabled={ch.needsUrl && urlLoading && !shareUrl}
            />
          ))}
        </View>

        {/* 分享链接行 */}
        <View style={styles.linkRow}>
          <View style={styles.linkBox}>
            {urlLoading ? (
              <View style={styles.linkLoading}>
                <ActivityIndicator size="small" color={colors.textMuted} />
                <Text style={styles.linkLoadingText}>生成分享链接…</Text>
              </View>
            ) : urlError ? (
              <Text style={styles.linkError}>{urlError}</Text>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <Text style={styles.linkText} numberOfLines={1}>{shareUrl}</Text>
              </ScrollView>
            )}
          </View>
          <TouchableOpacity
            style={[styles.copyLinkBtn, (!shareUrl || urlLoading) && styles.copyLinkBtnDisabled]}
            onPress={copyShareUrl}
            disabled={!shareUrl || urlLoading}
            activeOpacity={0.8}
          >
            <Ionicons name={copiedUrl ? 'checkmark' : 'copy-outline'} size={14} color={colors.white} />
            <Text style={styles.copyLinkBtnText}>{copiedUrl ? '已复制' : '复制'}</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.expireTip}>链接 7 天有效 · 任何人可查看</Text>

        {/* Toast */}
        {!!toast && (
          <View style={styles.toast}>
            <Ionicons name="checkmark-circle" size={14} color={colors.white} />
            <Text style={styles.toastText}>{toast}</Text>
          </View>
        )}

        {/* 取消 */}
        <TouchableOpacity style={styles.cancelBtn} onPress={onClose} activeOpacity={0.8}>
          <Text style={styles.cancelBtnText}>取消</Text>
        </TouchableOpacity>
      </Animated.View>
    </Modal>
  );
}

// ── 工具函数 ───────────────────────────────────────────────────────
function buildReportText(report) {
  if (!report) return '';
  return [
    `【金伊森健康报告】${report.period || ''}`,
    `时间：${report.dateRange || ''}`,
    `健康评分：${report.healthScore} 分`,
    report.metrics?.length
      ? '主要指标：' + report.metrics.map(m => `${m.label} ${m.value}${m.unit}`).join('、')
      : '',
    report.highlights?.length
      ? '本期亮点：' + report.highlights.map(h => h.text).join('；')
      : '',
    `共记录 ${report.recordCount} 条健康数据`,
  ].filter(Boolean).join('\n');
}

async function copyToClipboard(text) {
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      // 降级：创建临时 input
      const el = document.createElement('textarea');
      el.value = text;
      el.style.position = 'fixed';
      el.style.opacity = '0';
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
  } catch {}
}

// ── 样式 ─────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  overlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: colors.white,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: spacing.lg,
    paddingBottom: 28,
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08, shadowRadius: 12, elevation: 20,
  },
  handle: {
    alignSelf: 'center', width: 40, height: 4, borderRadius: 2,
    backgroundColor: colors.border, marginTop: 10, marginBottom: 2,
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: spacing.md,
  },
  title: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  closeBtn: { padding: 4 },

  // 渠道图标
  channelGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    marginBottom: spacing.md,
  },
  channelItem: {
    width: '16.66%', alignItems: 'center', paddingVertical: spacing.sm,
  },
  channelIconWrap: {
    width: 52, height: 52, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 6,
  },
  channelDisabled: { opacity: 0.4 },
  channelLabel: { fontSize: 11, color: colors.textSecondary, textAlign: 'center' },

  // 链接行
  linkRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.background, borderRadius: radius.md,
    padding: spacing.sm, marginBottom: 6,
    borderWidth: 1, borderColor: colors.borderLight,
  },
  linkBox: { flex: 1, minHeight: 22, justifyContent: 'center' },
  linkLoading: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  linkLoadingText: { fontSize: 12, color: colors.textMuted },
  linkText: { fontSize: 12, color: colors.textSecondary, fontFamily: 'monospace' },
  linkError: { fontSize: 12, color: colors.danger },
  copyLinkBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.primary, borderRadius: radius.sm,
    paddingHorizontal: 10, paddingVertical: 6,
  },
  copyLinkBtnDisabled: { backgroundColor: colors.textDisabled },
  copyLinkBtnText: { fontSize: 12, color: colors.white, fontWeight: '600' },

  expireTip: { fontSize: 11, color: colors.textMuted, textAlign: 'center', marginBottom: spacing.md },

  // Toast
  toast: {
    position: 'absolute', bottom: 80, alignSelf: 'center',
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(0,0,0,0.75)', borderRadius: radius.full,
    paddingHorizontal: 16, paddingVertical: 8,
  },
  toastText: { fontSize: 13, color: colors.white, fontWeight: '500' },

  // 取消按钮
  cancelBtn: {
    alignItems: 'center', paddingVertical: 14,
    backgroundColor: colors.background, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
  },
  cancelBtnText: { fontSize: 15, color: colors.textSecondary, fontWeight: '600' },
});

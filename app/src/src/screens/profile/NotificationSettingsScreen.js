import React, { useState, useEffect } from 'react';
import { View, Text, Switch, ScrollView, TouchableOpacity, StyleSheet, SafeAreaView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius } from '../../theme';

const SETTINGS = [
  {
    group: '健康提醒',
    items: [
      { key: 'medication',   icon: 'medkit-outline',        label: '用药提醒',     desc: '服药时间到时推送通知' },
      { key: 'measurement',  icon: 'pulse-outline',         label: '测量提醒',     desc: '血压、血糖等检测提醒' },
      { key: 'exercise',     icon: 'walk-outline',          label: '运动提醒',     desc: '每日运动计划推送' },
    ],
  },
  {
    group: '服务消息',
    items: [
      { key: 'doctor',       icon: 'call-outline',          label: '医生消息',     desc: '医生回复及随访通知' },
      { key: 'manager',      icon: 'people-outline',        label: '健管师消息',   desc: '健管专员消息提醒' },
      { key: 'report',       icon: 'document-text-outline', label: '报告解读',     desc: '检查报告完成通知' },
    ],
  },
  {
    group: '系统通知',
    items: [
      { key: 'system',       icon: 'notifications-outline', label: '系统通知',     desc: '服务更新及重要公告' },
      { key: 'service_exp',  icon: 'calendar-outline',      label: '服务到期提醒', desc: '服务包即将到期提醒' },
    ],
  },
];

function loadSettings() {
  try {
    const s = localStorage.getItem('jy_notif_settings');
    return s ? JSON.parse(s) : null;
  } catch { return null; }
}

function saveSettings(s) {
  try { localStorage.setItem('jy_notif_settings', JSON.stringify(s)); } catch {}
}

const DEFAULT = Object.fromEntries(
  SETTINGS.flatMap(g => g.items).map(i => [i.key, true])
);

// 检查浏览器通知支持
function getBrowserNotifStatus() {
  if (Platform.OS !== 'web' || typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission; // 'default' | 'granted' | 'denied'
}

export default function NotificationSettingsScreen({ navigation }) {
  const [settings, setSettings] = useState(() => ({ ...DEFAULT, ...(loadSettings() || {}) }));
  const [saved, setSaved] = useState(false);
  const [browserStatus, setBrowserStatus] = useState(getBrowserNotifStatus);
  const [requesting, setRequesting] = useState(false);

  useEffect(() => {
    setBrowserStatus(getBrowserNotifStatus());
  }, []);

  const toggle = (key) => {
    setSettings(prev => {
      const next = { ...prev, [key]: !prev[key] };
      saveSettings(next);
      return next;
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const requestBrowserPermission = async () => {
    if (browserStatus === 'unsupported' || browserStatus === 'denied') return;
    setRequesting(true);
    try {
      const result = await Notification.requestPermission();
      setBrowserStatus(result);
      if (result === 'granted') {
        // 发一条测试通知
        new Notification('嘉医管家', {
          body: '浏览器通知已开启，健康异常及服务消息将及时推送到您的设备',
          icon: '/favicon.ico',
        });
      }
    } catch {}
    setRequesting(false);
  };

  const BROWSER_STATUS_MAP = {
    granted:     { label: '已开启', color: colors.success,  bg: '#E8F5EF', icon: 'checkmark-circle' },
    denied:      { label: '已被拒绝', color: colors.danger, bg: '#FDECEA', icon: 'close-circle' },
    default:     { label: '未开启', color: colors.textMuted, bg: colors.background, icon: 'notifications-off-outline' },
    unsupported: { label: '不支持', color: colors.textMuted, bg: colors.background, icon: 'alert-circle-outline' },
  };
  const bStatus = BROWSER_STATUS_MAP[browserStatus] || BROWSER_STATUS_MAP.unsupported;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.pageTitle}>消息通知</Text>
        <View style={{ width: 36 }}>
          {saved && <Ionicons name="checkmark-circle" size={20} color={colors.success} />}
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>

        {/* 浏览器推送权限 */}
        <View style={[styles.section, { marginTop: spacing.lg }]}>
          <Text style={styles.groupTitle}>浏览器推送</Text>
          <View style={styles.card}>
            <View style={styles.browserRow}>
              <View style={[styles.iconWrap, { backgroundColor: bStatus.bg }]}>
                <Ionicons name={bStatus.icon} size={18} color={bStatus.color} />
              </View>
              <View style={styles.rowBody}>
                <Text style={styles.rowLabel}>系统级推送通知</Text>
                <Text style={styles.rowDesc}>
                  {browserStatus === 'granted'
                    ? '健康异常及服务消息可直接弹出系统通知'
                    : browserStatus === 'denied'
                    ? '浏览器已屏蔽通知，请在地址栏设置中手动开启'
                    : browserStatus === 'unsupported'
                    ? '当前浏览器不支持推送通知'
                    : '开启后可接收健康异常及服务到期提醒'}
                </Text>
              </View>
              {(browserStatus === 'default' || browserStatus === 'granted') && (
                <TouchableOpacity
                  style={[styles.permBtn, browserStatus === 'granted' && styles.permBtnActive]}
                  onPress={requestBrowserPermission}
                  disabled={requesting || browserStatus === 'granted'}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.permBtnText, browserStatus === 'granted' && styles.permBtnTextActive]}>
                    {browserStatus === 'granted' ? '已开启' : requesting ? '请求中…' : '点击开启'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
            {browserStatus === 'denied' && (
              <View style={styles.deniedHint}>
                <Ionicons name="information-circle-outline" size={14} color={colors.warning} />
                <Text style={styles.deniedHintText}>
                  在浏览器地址栏左侧点击"锁"图标 → 通知 → 允许，然后刷新页面
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* 应用内通知设置 */}
        {SETTINGS.map(group => (
          <View key={group.group} style={styles.section}>
            <Text style={styles.groupTitle}>{group.group}</Text>
            <View style={styles.card}>
              {group.items.map((item, i) => (
                <View
                  key={item.key}
                  style={[styles.row, i < group.items.length - 1 && styles.rowBorder]}
                >
                  <View style={[styles.iconWrap, { backgroundColor: colors.primary + '12' }]}>
                    <Ionicons name={item.icon} size={18} color={colors.primary} />
                  </View>
                  <View style={styles.rowBody}>
                    <Text style={styles.rowLabel}>{item.label}</Text>
                    <Text style={styles.rowDesc}>{item.desc}</Text>
                  </View>
                  <Switch
                    value={settings[item.key]}
                    onValueChange={() => toggle(item.key)}
                    trackColor={{ false: colors.border, true: colors.primary + '60' }}
                    thumbColor={settings[item.key] ? colors.primary : '#f4f3f4'}
                  />
                </View>
              ))}
            </View>
          </View>
        ))}

        <Text style={styles.hint}>
          关闭后仍可在「消息」页查看历史通知，仅停止新消息推送。
        </Text>
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  pageTitle: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },
  section: { marginHorizontal: spacing.lg, marginTop: spacing.lg },
  groupTitle: { fontSize: 11, fontWeight: '700', color: colors.textMuted, letterSpacing: 1, textTransform: 'uppercase', marginBottom: spacing.sm },
  card: { backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: 14, gap: spacing.sm },
  browserRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: 14, gap: spacing.sm },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  iconWrap: { width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  rowBody: { flex: 1 },
  rowLabel: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  rowDesc: { fontSize: 11, color: colors.textMuted, marginTop: 2, lineHeight: 16 },
  permBtn: {
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: radius.full, borderWidth: 1.5, borderColor: colors.primary,
  },
  permBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  permBtnText: { fontSize: 12, fontWeight: '600', color: colors.primary },
  permBtnTextActive: { color: colors.white },
  deniedHint: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 6,
    paddingHorizontal: spacing.md, paddingBottom: spacing.sm, paddingTop: 0,
  },
  deniedHintText: { flex: 1, fontSize: 11, color: colors.warning, lineHeight: 16 },
  hint: { fontSize: 12, color: colors.textMuted, textAlign: 'center', marginTop: spacing.lg, marginHorizontal: spacing.xl, lineHeight: 18 },
});

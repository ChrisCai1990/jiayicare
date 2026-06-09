import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, SafeAreaView, Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { colors, spacing, radius } from '../../theme';
import { useAuth } from '../../context/AuthContext';
import { ordersAPI, userAPI } from '../../services/api';
import Avatar, { AvatarOnDark } from '../../components/Avatar';

// ── 样式（必须在所有组件函数之前定义，防止 Railway 生产构建 TDZ）────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

  // Header
  header: {
    backgroundColor: '#1A2B24',
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
    alignItems: 'center',
    position: 'relative',
  },
  settingBtn: {
    position: 'absolute', top: spacing.sm, right: spacing.lg,
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerContent: { alignItems: 'center', paddingTop: spacing.md },
  userName: { fontSize: 22, fontWeight: '700', color: colors.white, marginTop: spacing.sm, letterSpacing: -0.3 },
  userSub: { fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 4 },

  // 会员信息卡
  statsCard: {
    backgroundColor: colors.white,
    marginHorizontal: spacing.lg,
    marginTop: -spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
    paddingTop: spacing.md,
    overflow: 'hidden',
  },
  statsRow: { flexDirection: 'row', paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  statItem: { flex: 1, alignItems: 'center' },
  statVal: { fontSize: 20, fontWeight: '800', letterSpacing: -0.5 },
  statLabel: { fontSize: 11, color: colors.textMuted, marginTop: 4, fontWeight: '500' },
  statsDivider: { width: 1, backgroundColor: colors.borderLight, marginVertical: 4 },
  fundRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderTopWidth: 1, borderTopColor: colors.borderLight,
    paddingHorizontal: spacing.md, paddingVertical: 10,
    backgroundColor: '#FFFBF5',
  },
  fundLeft: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  fundLabel: { fontSize: 12, fontWeight: '600', color: '#D97706' },
  fundRight: { alignItems: 'flex-end' },
  fundTotal: { fontSize: 15, fontWeight: '800', color: colors.textPrimary },
  fundBreakdown: { fontSize: 10, color: colors.textMuted, marginTop: 1 },

  // Section
  section: { marginTop: spacing.lg, paddingHorizontal: spacing.lg },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  sectionTitle: { fontSize: 10, fontWeight: '700', color: colors.textMuted, marginBottom: spacing.sm, letterSpacing: 1.2, textTransform: 'uppercase' },
  sectionLink: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  sectionLinkText: { fontSize: 13, color: colors.primary, fontWeight: '500' },

  // 服务包
  serviceCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  serviceIconWrap: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: colors.primary10,
    alignItems: 'center', justifyContent: 'center',
  },
  serviceInfo: { flex: 1 },
  serviceName: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  serviceExpiry: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  renewBtn: {
    paddingHorizontal: 14, paddingVertical: 7,
    backgroundColor: colors.primary,
    borderRadius: radius.full,
  },
  renewText: { fontSize: 12, color: colors.white, fontWeight: '700' },

  // 无服务包引导卡
  noServiceCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.white, borderRadius: radius.md,
    borderWidth: 1.5, borderColor: colors.primary + '40',
    borderStyle: 'dashed', padding: spacing.md,
  },
  noServiceLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 },
  noServiceIconWrap: {
    width: 42, height: 42, borderRadius: 12,
    backgroundColor: colors.primary + '12',
    alignItems: 'center', justifyContent: 'center',
  },
  noServiceTitle: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  noServiceSub: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  noServiceBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
    backgroundColor: colors.primary + '12',
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: radius.full,
  },
  noServiceBtnText: { fontSize: 12, color: colors.primary, fontWeight: '700' },

  // 365会员推广卡
  member365Card: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#FFF0F5', borderRadius: radius.md,
    borderWidth: 1.5, borderColor: '#E91E63' + '50',
    padding: spacing.md,
  },
  member365IconWrap: {
    width: 42, height: 42, borderRadius: 12,
    backgroundColor: '#E91E63',
    alignItems: 'center', justifyContent: 'center',
  },
  member365Title: { fontSize: 14, fontWeight: '700', color: '#1A2B24' },
  member365Slogan: { fontSize: 11, color: '#E91E63', marginTop: 2, fontWeight: '500' },
  member365Btn: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
    backgroundColor: '#FCE4EC',
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: radius.full,
  },
  member365BtnText: { fontSize: 12, color: '#E91E63', fontWeight: '700' },

  // 家庭成员
  addFamilyCard: {
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.background,
    borderRadius: radius.sm, padding: spacing.md,
    minWidth: 78, borderWidth: 1.5, borderColor: colors.border,
    borderStyle: 'dashed',
  },
  addFamilyCircle: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: colors.primary10,
    alignItems: 'center', justifyContent: 'center', marginBottom: 6,
  },
  addFamilyLabel: { fontSize: 12, color: colors.primary, fontWeight: '500' },

  // 菜单
  menuCard: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.md, paddingVertical: 14,
  },
  menuItemBorder: { borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  menuIconWrap: {
    width: 34, height: 34, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center', marginRight: spacing.sm,
  },
  menuLabel: { flex: 1, fontSize: 14, color: colors.textPrimary, fontWeight: '500' },
  menuRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  menuValue: { fontSize: 12, color: colors.textMuted },
  menuBadge: {
    minWidth: 18, height: 18, borderRadius: 9,
    backgroundColor: colors.danger, paddingHorizontal: 5,
    alignItems: 'center', justifyContent: 'center',
  },
  menuBadgeText: { fontSize: 10, color: colors.white, fontWeight: '700' },

  // 退出登录
  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: spacing.md,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.danger + '40',
  },
  logoutText: { fontSize: 15, color: colors.danger, fontWeight: '600' },
  versionText: { textAlign: 'center', fontSize: 11, color: colors.textMuted, marginTop: spacing.md },

  // 退出确认弹窗
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center', justifyContent: 'center',
  },
  modalCard: {
    backgroundColor: colors.white,
    borderRadius: radius.xl,
    padding: spacing.xl,
    width: 280,
    alignItems: 'center',
  },
  modalIconWrap: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: colors.danger + '12',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.md,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.xs },
  modalDesc: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.lg },
  modalBtns: { flexDirection: 'row', gap: spacing.sm, width: '100%' },
  modalCancelBtn: {
    flex: 1, paddingVertical: 12, borderRadius: radius.md,
    borderWidth: 1.5, borderColor: colors.border,
    alignItems: 'center',
  },
  modalCancelText: { fontSize: 15, color: colors.textSecondary, fontWeight: '600' },
  modalConfirmBtn: {
    flex: 1, paddingVertical: 12, borderRadius: radius.md,
    backgroundColor: colors.danger,
    alignItems: 'center',
  },
  modalConfirmText: { fontSize: 15, color: colors.white, fontWeight: '700' },
});

// ── 菜单条目 ──────────────────────────────────────────────────────
function MenuItem({ icon, iconColor, label, value, badge, onPress, isLast }) {
  const ic = iconColor || colors.primary;
  return (
    <TouchableOpacity
      style={[styles.menuItem, !isLast && styles.menuItemBorder]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[styles.menuIconWrap, { backgroundColor: ic + '14' }]}>
        <Ionicons name={icon} size={18} color={ic} />
      </View>
      <Text style={styles.menuLabel}>{label}</Text>
      <View style={styles.menuRight}>
        {badge != null && (
          <View style={styles.menuBadge}>
            <Text style={styles.menuBadgeText}>{badge}</Text>
          </View>
        )}
        {value ? <Text style={styles.menuValue}>{value}</Text> : null}
        <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
      </View>
    </TouchableOpacity>
  );
}

// ── 退出登录确认弹窗 ──────────────────────────────────────────────
function LogoutModal({ visible, onConfirm, onCancel }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <View style={styles.modalIconWrap}>
            <Ionicons name="log-out-outline" size={28} color={colors.danger} />
          </View>
          <Text style={styles.modalTitle}>退出登录</Text>
          <Text style={styles.modalDesc}>确定要退出当前账号吗？</Text>
          <View style={styles.modalBtns}>
            <TouchableOpacity style={styles.modalCancelBtn} onPress={onCancel} activeOpacity={0.8}>
              <Text style={styles.modalCancelText}>取消</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalConfirmBtn} onPress={onConfirm} activeOpacity={0.8}>
              <Text style={styles.modalConfirmText}>确定退出</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── 主页面 ────────────────────────────────────────────────────────
export default function ProfileScreen({ navigation }) {
  const { user, isDemo, logout, updateUser } = useAuth();
  const [showLogout, setShowLogout] = useState(false);
  const [pendingOrders, setPendingOrders] = useState(0);
  const [notifLabel, setNotifLabel] = useState('');

  // 每次切换到此页时，重新拉取用户数据以刷新健康基金、服务包等动态字段
  // ⚠️ 不能跳过 demo 账号 —— demo 账号(13800138000)同样有真实健康基金数据
  useFocusEffect(useCallback(() => {
    userAPI.getMe().then(res => {
      if (res.success && res.data) updateUser(res.data);
    }).catch(() => {});
  }, []));

  const hasService = !!(user?.servicePackage && user?.serviceExpiry);
  const expiry = hasService ? new Date(user.serviceExpiry) : null;
  const daysLeft = expiry ? Math.max(0, Math.ceil((expiry - new Date()) / 86400000)) : 0;
  // 健康基金
  const fund = user?.healthFund || {};
  const fundTotal    = fund.total    ?? 0;
  const fundPersonal = fund.personal ?? 0;
  const fundCorp     = fund.corporate ?? 0;
  // 会员类型（服务包 ID / 方案类型 → 显示名）
  const PACKAGE_LABELS = {
    pkg_1y: '年度会员', pkg_6m: '半年会员', pkg_3m: '季度会员',
    health_prevention: '健康预防计划', chronic_stable: '慢病维稳计划',
    young_state: '健康年轻态计划', health_reshape: '健康重塑计划',
  };
  const memberType = hasService
    ? (user.memberType || PACKAGE_LABELS[user.servicePackage] || user.servicePackage || '标准会员')
    : '未开通';
  // 到期日格式化
  const expiryStr = hasService ? (user.serviceExpiry || '--') : '--';

  useEffect(() => {
    // 待跟进订单数
    (async () => {
      try {
        const res = await ordersAPI.list();
        if (res.success) {
          setPendingOrders(res.data.filter(o => o.status === 'pending').length);
        }
      } catch {}
    })();

    // 通知设置摘要
    try {
      const raw = localStorage.getItem('jy_notif_settings');
      if (raw) {
        const settings = JSON.parse(raw);
        const allOff = Object.values(settings).every(v => !v);
        setNotifLabel(allOff ? '已全部关闭' : '已开启');
      } else {
        setNotifLabel('已开启');
      }
    } catch { setNotifLabel('已开启'); }
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>

        {/* ── Header ─────────────────────────────────────────── */}
        <View style={styles.header}>
          <View style={styles.headerContent}>
            <AvatarOnDark name={user?.name || '用'} size={76} />
            <Text style={styles.userName}>{user?.name || '用户'}</Text>
            <Text style={styles.userSub}>
              {[user?.age && `${user.age}岁`, user?.gender !== '未知' && user?.gender, user?.phone].filter(Boolean).join(' · ')}
            </Text>
          </View>
        </View>

        {/* ── 会员信息卡 ──────────────────────────────────────── */}
        <View style={styles.statsCard}>
          {/* 第一行：会员类型 | 服务天数 | 到期日 */}
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={[styles.statVal, { color: hasService ? colors.primary : colors.textMuted, fontSize: 14 }]} numberOfLines={1}>
                {memberType}
              </Text>
              <Text style={styles.statLabel}>会员类型</Text>
            </View>
            <View style={styles.statsDivider} />
            <View style={styles.statItem}>
              <Text style={[styles.statVal, { color: hasService ? colors.primary : colors.textMuted }]}>
                {hasService ? daysLeft : '--'}
              </Text>
              <Text style={styles.statLabel}>服务天数</Text>
            </View>
            <View style={styles.statsDivider} />
            <View style={styles.statItem}>
              <Text style={[styles.statVal, { color: hasService ? colors.textPrimary : colors.textMuted, fontSize: 13 }]} numberOfLines={1}>
                {expiryStr}
              </Text>
              <Text style={styles.statLabel}>到期日</Text>
            </View>
          </View>
          {/* 第二行：健康基金 */}
          <View style={styles.fundRow}>
            <View style={styles.fundLeft}>
              <Ionicons name="wallet-outline" size={14} color="#D97706" />
              <Text style={styles.fundLabel}>健康基金</Text>
            </View>
            <View style={styles.fundRight}>
              <Text style={styles.fundTotal}>¥{fundTotal.toLocaleString()}</Text>
              <Text style={styles.fundBreakdown}>自有 ¥{fundPersonal.toLocaleString()} · 企业 ¥{fundCorp.toLocaleString()}</Text>
            </View>
          </View>
        </View>

        {/* ── 服务包 ──────────────────────────────────────────── */}
        <View style={styles.section}>
          {hasService ? (
            <View style={styles.serviceCard}>
              <View style={styles.serviceIconWrap}>
                <Ionicons name="shield-checkmark" size={20} color={colors.primary} />
              </View>
              <View style={styles.serviceInfo}>
                <Text style={styles.serviceName} numberOfLines={1}>{PACKAGE_LABELS[user.servicePackage] || user.servicePackage}</Text>
                <Text style={styles.serviceExpiry}>
                  到期 {user.serviceExpiry} · 剩余 {daysLeft} 天
                </Text>
              </View>
              <TouchableOpacity style={styles.renewBtn} onPress={() => navigation.navigate('Renewal')}>
                <Text style={styles.renewText}>续约</Text>
              </TouchableOpacity>
            </View>
          ) : !user?.isRegisteredClient ? (
            <TouchableOpacity
              style={styles.member365Card}
              onPress={() => navigation.navigate('Member365')}
              activeOpacity={0.85}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 }}>
                <View style={styles.member365IconWrap}>
                  <Ionicons name="ribbon" size={22} color="#fff" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.member365Title}>365 健康会员</Text>
                  <Text style={styles.member365Slogan}>每天一块钱，开启健康之门</Text>
                </View>
              </View>
              <View style={styles.member365Btn}>
                <Text style={styles.member365BtnText}>立即开通</Text>
                <Ionicons name="chevron-forward" size={14} color="#E91E63" />
              </View>
            </TouchableOpacity>
          ) : null}
        </View>

        {/* ── 家庭成员 ─────────────────────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.sectionRow}>
            <Text style={styles.sectionTitle}>家庭成员</Text>
            <TouchableOpacity style={styles.sectionLink} onPress={() => navigation.navigate('FamilyMembers')}>
              <Ionicons name="add" size={14} color={colors.primary} />
              <Text style={styles.sectionLinkText}>管理</Text>
            </TouchableOpacity>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: spacing.sm, paddingBottom: 2 }}>
            <TouchableOpacity style={styles.addFamilyCard} onPress={() => navigation.navigate('FamilyMembers')}>
              <View style={styles.addFamilyCircle}>
                <Ionicons name="add" size={20} color={colors.primary} />
              </View>
              <Text style={styles.addFamilyLabel}>添加成员</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>

        {/* ── 健康管理 ─────────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>健康管理</Text>
          <View style={styles.menuCard}>
            <MenuItem icon="heart-outline"         iconColor="#DC3545" label="健康档案" value="查看全部" onPress={() => navigation.navigate('Records')} />
            <MenuItem icon="clipboard-outline"     iconColor="#7C3AED" label="健康方案"              onPress={() => navigation.navigate('ServicePlans')} />
            <MenuItem icon="document-text-outline" iconColor="#0077B6" label="体检报告" badge={undefined} onPress={() => navigation.navigate('MedicalReports')} />
            <MenuItem icon="medkit-outline"        iconColor="#D97706" label="用药管理"              onPress={() => navigation.navigate('Medication')} />
            <MenuItem icon="leaf-outline"          iconColor="#22A06B" label="营养素管理"            onPress={() => navigation.navigate('Nutrition')} isLast />
          </View>
        </View>

        {/* ── 我的服务 ─────────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>我的服务</Text>
          <View style={styles.menuCard}>
            <MenuItem icon="receipt-outline"  iconColor={colors.primary} label="我的订单"  badge={pendingOrders > 0 ? pendingOrders : undefined} onPress={() => navigation.navigate('Orders')} />
            {!user?.isRegisteredClient && (
              <MenuItem icon="ribbon-outline"   iconColor="#E91E63" label="365 健康会员"          onPress={() => navigation.navigate('Member365')} />
            )}
            <MenuItem icon="gift-outline"     iconColor="#D97706" label="服务权益"              onPress={() => navigation.navigate('Benefits')} />
            <MenuItem icon="people-outline"  iconColor="#22A06B" label="服务群组"  value="即将开放" onPress={() => navigation.navigate('ComingSoon', { title: '服务群组', desc: '专属健康服务群即将开放，届时可与家庭医生、营养师、健康管理师实时交流。', icon: 'people-outline' })} />
            <MenuItem icon="cart-outline"    iconColor="#D97706" label="服务商城"               onPress={() => navigation.navigate('ServiceMall')} />
            <MenuItem icon="star-outline"    iconColor="#F39C12" label="评价服务"               onPress={() => navigation.navigate('ComingSoon', { title: '评价服务', desc: '服务评价功能即将上线，帮助我们持续改善服务质量。', icon: 'star-outline' })} isLast />
          </View>
        </View>

        {/* ── 账号设置 ─────────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>账号设置</Text>
          <View style={styles.menuCard}>
            <MenuItem icon="notifications-outline" iconColor="#7C3AED" label="消息通知" value={notifLabel} onPress={() => navigation.navigate('NotificationSettings')} />
            <MenuItem icon="lock-closed-outline"   iconColor="#22A06B" label="账号安全"            onPress={() => navigation.navigate('AccountSecurity')} />
            <MenuItem icon="help-circle-outline"   iconColor="#D97706" label="帮助与反馈"          onPress={() => navigation.navigate('HelpFeedback')} isLast />
          </View>
        </View>

        {/* ── 关于与法律 ───────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>关于与法律</Text>
          <View style={styles.menuCard}>
            <MenuItem icon="document-text-outline" iconColor="#6B7280" label="用户协议"   onPress={() => navigation.navigate('Legal', { type: 'terms' })} />
            <MenuItem icon="shield-outline"        iconColor="#6B7280" label="隐私政策"   onPress={() => navigation.navigate('Legal', { type: 'privacy' })} />
            <MenuItem icon="information-circle-outline" iconColor="#6B7280" label="免责声明" onPress={() => navigation.navigate('Legal', { type: 'disclaimer' })} isLast />
          </View>
        </View>

        {/* ── 退出登录 ─────────────────────────────────────────── */}
        <View style={styles.section}>
          <TouchableOpacity style={styles.logoutBtn} onPress={() => setShowLogout(true)} activeOpacity={0.8}>
            <Ionicons name="log-out-outline" size={17} color={colors.danger} />
            <Text style={styles.logoutText}>退出登录</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.versionText}>嘉医管家 v1.0.0</Text>
        <View style={{ height: spacing.xl }} />
      </ScrollView>

      {/* 退出登录确认弹窗 */}
      <LogoutModal
        visible={showLogout}
        onCancel={() => setShowLogout(false)}
        onConfirm={() => { setShowLogout(false); logout(); }}
      />
    </SafeAreaView>
  );
}

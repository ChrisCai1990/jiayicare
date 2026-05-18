import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, SafeAreaView, RefreshControl, Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, shadow } from '../../theme';
import { ordersAPI } from '../../services/api';
import EmptyState from '../../components/EmptyState';

// ── 订单状态配置 ──────────────────────────────────────────────────
const STATUS_CONFIG = {
  pending:   { label: '待联系', bg: '#FEF3E2', color: '#D97706', icon: 'time-outline' },
  scheduled: { label: '已安排', bg: '#E8F3FB', color: '#0077B6', icon: 'calendar-outline' },
  completed: { label: '已完成', bg: '#E8F5EF', color: '#1E6B50', icon: 'checkmark-circle-outline' },
  cancelled: { label: '已取消', bg: '#F5F5F5', color: '#8AA89C', icon: 'close-circle-outline' },
};

const FILTER_TABS = ['全部', '待联系', '已安排', '已完成', '已取消'];
const STATUS_MAP  = { '待联系': 'pending', '已安排': 'scheduled', '已完成': 'completed', '已取消': 'cancelled' };

function fmtDate(str) {
  try {
    const d = new Date(str);
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
  } catch { return str; }
}

// ── 订单卡片 ──────────────────────────────────────────────────────
function OrderCard({ order, onCancel }) {
  const st = STATUS_CONFIG[order.status] || STATUS_CONFIG.pending;
  const canCancel = order.status === 'pending';

  return (
    <View style={styles.orderCard}>
      {/* 顶部：状态 + 日期 */}
      <View style={styles.orderCardTop}>
        <View style={[styles.statusBadge, { backgroundColor: st.bg }]}>
          <Ionicons name={st.icon} size={12} color={st.color} />
          <Text style={[styles.statusText, { color: st.color }]}>{st.label}</Text>
        </View>
        <Text style={styles.orderDate}>预约于 {fmtDate(order.createdAt)}</Text>
      </View>

      {/* 服务信息 */}
      <View style={styles.serviceRow}>
        <View style={styles.serviceIconWrap}>
          <Ionicons name={order.serviceIcon || 'medical'} size={22} color={colors.primary} />
        </View>
        <View style={styles.serviceInfo}>
          <Text style={styles.serviceName} numberOfLines={2}>{order.serviceName}</Text>
          {!!order.servicePrice && (
            <Text style={styles.servicePrice}>¥{order.servicePrice}</Text>
          )}
        </View>
      </View>

      {/* 备注 */}
      {!!order.note && (
        <View style={styles.noteWrap}>
          <Ionicons name="chatbox-outline" size={12} color={colors.textMuted} />
          <Text style={styles.noteText} numberOfLines={2}>{order.note}</Text>
        </View>
      )}

      {/* 进度提示 */}
      <View style={styles.progressWrap}>
        {['pending', 'scheduled', 'completed'].map((s, i) => {
          const conf = STATUS_CONFIG[s];
          const idx  = ['pending', 'scheduled', 'completed'].indexOf(order.status);
          const done = i <= idx && order.status !== 'cancelled';
          return (
            <React.Fragment key={s}>
              <View style={styles.progressStep}>
                <View style={[styles.progressDot, done && styles.progressDotDone]}>
                  {done && <Ionicons name="checkmark" size={8} color={colors.white} />}
                </View>
                <Text style={[styles.progressLabel, done && styles.progressLabelDone]}>
                  {conf.label}
                </Text>
              </View>
              {i < 2 && (
                <View style={[styles.progressLine, i < idx && order.status !== 'cancelled' && styles.progressLineDone]} />
              )}
            </React.Fragment>
          );
        })}
      </View>

      {/* 取消按钮 */}
      {canCancel && (
        <TouchableOpacity
          style={styles.cancelBtn}
          onPress={() => onCancel(order)}
          activeOpacity={0.8}
        >
          <Text style={styles.cancelBtnText}>取消预约</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ── 主页面 ────────────────────────────────────────────────────────
export default function OrdersScreen({ navigation }) {
  const [orders, setOrders]       = useState([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('全部');

  const loadOrders = useCallback(async () => {
    try {
      const res = await ordersAPI.list();
      if (res.success) setOrders(res.data);
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { loadOrders(); }, [loadOrders]);

  const handleCancel = (order) => {
    Alert.alert(
      '取消预约',
      `确定要取消「${order.serviceName}」的预约吗？`,
      [
        { text: '暂不取消', style: 'cancel' },
        {
          text: '确定取消', style: 'destructive',
          onPress: async () => {
            try {
              const res = await ordersAPI.cancel(order._id);
              if (res.success) {
                setOrders(prev => prev.map(o =>
                  o._id === order._id ? { ...o, status: 'cancelled' } : o
                ));
              }
            } catch {}
          },
        },
      ]
    );
  };

  const filtered = orders.filter(o => {
    if (activeTab === '全部') return true;
    return o.status === STATUS_MAP[activeTab];
  });

  const pendingCount = orders.filter(o => o.status === 'pending').length;

  return (
    <SafeAreaView style={styles.container}>
      {/* 顶部栏 */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.topBarCenter}>
          <Text style={styles.pageTitle}>我的订单</Text>
          {pendingCount > 0 && (
            <View style={styles.pendingBadge}>
              <Text style={styles.pendingBadgeText}>{pendingCount}</Text>
            </View>
          )}
        </View>
        <View style={{ width: 36 }} />
      </View>

      {/* 状态说明栏 */}
      <View style={styles.tipBar}>
        <Ionicons name="information-circle-outline" size={14} color={colors.textMuted} />
        <Text style={styles.tipText}>预约提交后，健管师将在 1-2 个工作日内联系您</Text>
      </View>

      {/* 筛选 Tab */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabScroll}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.sm }}
      >
        {FILTER_TABS.map(tab => (
          <TouchableOpacity
            key={tab}
            style={[styles.tabChip, activeTab === tab && styles.tabChipActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabChipText, activeTab === tab && styles.tabChipTextActive]}>{tab}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* 订单列表 */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        style={styles.list}
        contentContainerStyle={{ padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.sm }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); loadOrders(); }}
            tintColor={colors.primary}
          />
        }
      >
        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 60 }} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon="receipt-outline"
            title="暂无订单"
            subtitle={activeTab === '全部' ? '前往服务商城预约健康服务' : `暂无${activeTab}的订单`}
            color={colors.primary}
          />
        ) : (
          filtered.map(order => (
            <OrderCard key={order._id} order={order} onCancel={handleCancel} />
          ))
        )}
        <View style={{ height: spacing.xl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    backgroundColor: colors.white,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  topBarCenter: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pageTitle: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },
  pendingBadge: {
    minWidth: 18, height: 18, borderRadius: 9,
    backgroundColor: colors.warning, paddingHorizontal: 5,
    alignItems: 'center', justifyContent: 'center',
  },
  pendingBadgeText: { fontSize: 10, color: colors.white, fontWeight: '700' },

  tipBar: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
    backgroundColor: colors.primary + '08',
    borderBottomWidth: 1, borderBottomColor: colors.borderLight,
  },
  tipText: { fontSize: 12, color: colors.textMuted, flex: 1 },

  tabScroll: { maxHeight: 50, paddingVertical: spacing.sm },
  tabChip: {
    paddingHorizontal: spacing.md, paddingVertical: 6,
    borderRadius: radius.full, borderWidth: 1.5, borderColor: colors.border,
    backgroundColor: colors.white,
  },
  tabChipActive: { borderColor: colors.primary, backgroundColor: colors.primary },
  tabChipText: { fontSize: 13, color: colors.textSecondary, fontWeight: '500' },
  tabChipTextActive: { color: colors.white, fontWeight: '700' },

  list: { flex: 1 },

  orderCard: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1, borderColor: colors.border,
    ...shadow.sm,
  },

  orderCardTop: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: spacing.sm,
  },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 9, paddingVertical: 4, borderRadius: radius.full,
  },
  statusText: { fontSize: 11, fontWeight: '700' },
  orderDate: { fontSize: 11, color: colors.textMuted },

  serviceRow: {
    flexDirection: 'row', gap: spacing.sm, alignItems: 'center',
    marginBottom: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.borderLight,
  },
  serviceIconWrap: {
    width: 44, height: 44, borderRadius: 13,
    backgroundColor: colors.primary + '12',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  serviceInfo: { flex: 1 },
  serviceName: { fontSize: 15, fontWeight: '600', color: colors.textPrimary, lineHeight: 20 },
  servicePrice: { fontSize: 14, fontWeight: '700', color: colors.danger, marginTop: 4 },

  noteWrap: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 5,
    backgroundColor: colors.background, borderRadius: radius.sm,
    padding: spacing.sm, marginBottom: spacing.sm,
  },
  noteText: { flex: 1, fontSize: 12, color: colors.textSecondary, lineHeight: 17 },

  // 进度条
  progressWrap: {
    flexDirection: 'row', alignItems: 'center',
    marginTop: spacing.sm, marginBottom: 4,
  },
  progressStep: { alignItems: 'center', gap: 4 },
  progressDot: {
    width: 18, height: 18, borderRadius: 9,
    borderWidth: 1.5, borderColor: colors.border,
    backgroundColor: colors.white,
    alignItems: 'center', justifyContent: 'center',
  },
  progressDotDone: { backgroundColor: colors.success, borderColor: colors.success },
  progressLabel: { fontSize: 10, color: colors.textMuted, fontWeight: '500' },
  progressLabelDone: { color: colors.success, fontWeight: '700' },
  progressLine: {
    flex: 1, height: 2, backgroundColor: colors.borderLight,
    marginHorizontal: 4, marginBottom: 14,
  },
  progressLineDone: { backgroundColor: colors.success },

  cancelBtn: {
    marginTop: spacing.sm,
    paddingVertical: 10, borderRadius: radius.md,
    borderWidth: 1.5, borderColor: colors.danger + '60',
    alignItems: 'center',
  },
  cancelBtnText: { fontSize: 13, color: colors.danger, fontWeight: '600' },
});

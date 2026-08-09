import React, { useState } from 'react';
import { View, Text } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { colors, spacing, radius } from '../../../theme';
import { useAuth } from '../../../context/AuthContext';
import { ordersAPI, userAPI } from '../../../services/api';
import useNavBar from '../../../hooks/useNavBar';
import Icon from '../../../components/Icon';
import { getOrderCounts } from '../../../utils/orderStatus';

const PACKAGE_LABELS = {
  pkg_1y: '年度会员', pkg_6m: '半年会员', pkg_3m: '季度会员',
  health_prevention: '健康预防计划', chronic_stable: '慢病维稳计划',
  young_state: '健康年轻态计划', health_reshape: '健康重塑计划',
};

function MenuItem({ icon, iconColor, label, value, badge, onClick, isLast }) {
  const ic = iconColor || colors.primary;
  return (
    <View
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', padding: '14px 16px',
        borderBottom: isLast ? 'none' : `1px solid ${colors.borderLight}`,
      }}
    >
      <View style={{
        width: '34px', height: '34px', borderRadius: '9px', backgroundColor: ic + '22',
        display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: `${spacing.sm}px`,
      }}><Icon name={icon} size={16} color={ic} /></View>
      <Text style={{ flex: 1, fontSize: '14px', color: colors.textPrimary, fontWeight: 500 }}>{label}</Text>
      <View style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        {badge != null && badge > 0 && (
          <View style={{
            minWidth: '18px', height: '18px', borderRadius: '9px', backgroundColor: colors.danger,
            padding: '0 5px', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Text style={{ fontSize: '10px', color: '#fff', fontWeight: 700 }}>{badge}</Text>
          </View>
        )}
        {value ? <Text style={{ fontSize: '12px', color: colors.textMuted }}>{value}</Text> : null}
        <Text style={{ fontSize: '13px', color: colors.textMuted }}>›</Text>
      </View>
    </View>
  );
}

export default function ProfilePage() {
  const { statusBarHeight } = useNavBar();
  const { user, logout, updateUser } = useAuth();
  const [showLogout, setShowLogout] = useState(false);
  const [orderCounts, setOrderCounts] = useState({ payment: 0, service: 0, progress: 0, afterSale: 0 });

  useDidShow(() => {
    userAPI.getMe().then((res) => {
      if (res.success && res.data) updateUser(res.data);
    }).catch(() => {});
  });

  const loadOrderCounts = () => {
    ordersAPI.list().then((res) => {
      if (res.success) setOrderCounts(getOrderCounts(res.data || []));
    }).catch(() => {});
  };

  useDidShow(() => { loadOrderCounts(); });

  const hasService = !!(user?.servicePackage && user?.serviceExpiry);
  const expiry = hasService ? new Date(user.serviceExpiry) : null;
  const daysLeft = expiry ? Math.max(0, Math.ceil((expiry - new Date()) / 86400000)) : 0;
  const fund = user?.healthFund || {};
  const fundTotal = fund.total ?? 0;
  const fundPersonal = fund.personal ?? 0;
  const fundCorp = fund.corporate ?? 0;
  const memberType = hasService
    ? (user.memberType || PACKAGE_LABELS[user.servicePackage] || user.servicePackage || '标准会员')
    : '未开通';

  const nav = (url) => Taro.navigateTo({ url });
  const doLogout = () => { setShowLogout(false); logout(); Taro.reLaunch({ url: '/pages/auth/login/index' }); };

  return (
    <View style={{ minHeight: '100vh', backgroundColor: colors.background }}>
      {/* Header：paddingTop加状态栏高度，因navigationStyle:custom后需自己避让胶囊按钮区域 */}
      <View style={{ backgroundColor: '#1A2B24', padding: `${statusBarHeight + 8}px 0 32px`, textAlign: 'center', position: 'relative' }}>
        <View onClick={() => nav('/pages/profile/edit/index')} style={{
          position: 'absolute', top: `${statusBarHeight + 8}px`, right: `${spacing.lg}px`,
          width: '36px', height: '36px', borderRadius: '18px', backgroundColor: 'rgba(255,255,255,0.15)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon name="✏️" size={15} color="#fff" />
        </View>
        <View style={{
          width: '76px', height: '76px', borderRadius: '38px', backgroundColor: 'rgba(255,255,255,0.15)',
          margin: '16px auto 0', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Text style={{ fontSize: '30px', color: '#fff', fontWeight: 700 }}>{(user?.name || '用')[0]}</Text>
        </View>
        <Text style={{ fontSize: '22px', fontWeight: 700, color: '#fff', marginTop: `${spacing.sm}px`, display: 'block' }}>{user?.name || '用户'}</Text>
        <Text style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)', marginTop: '4px', display: 'block' }}>
          {[user?.age && `${user.age}岁`, user?.gender !== '未知' && user?.gender, user?.phone].filter(Boolean).join(' · ')}
        </Text>
      </View>

      {/* 会员信息卡 */}
      <View style={{
        backgroundColor: '#fff', margin: `-8px ${spacing.lg}px 0`, borderRadius: `${radius.md}px`,
        border: `1px solid ${colors.border}`, overflow: 'hidden',
      }}>
        <View style={{ display: 'flex', padding: `${spacing.md}px ${spacing.lg}px` }}>
          <View style={{ flex: 1, textAlign: 'center' }}>
            <Text style={{ fontSize: '14px', fontWeight: 800, color: hasService ? colors.primary : colors.textMuted, display: 'block' }}>{memberType}</Text>
            <Text style={{ fontSize: '11px', color: colors.textMuted, marginTop: '4px', display: 'block' }}>会员类型</Text>
          </View>
          <View style={{ width: '1px', backgroundColor: colors.borderLight }} />
          <View style={{ flex: 1, textAlign: 'center' }}>
            <Text style={{ fontSize: '20px', fontWeight: 800, color: hasService ? colors.primary : colors.textMuted, display: 'block' }}>{hasService ? daysLeft : '--'}</Text>
            <Text style={{ fontSize: '11px', color: colors.textMuted, marginTop: '4px', display: 'block' }}>服务天数</Text>
          </View>
          <View style={{ width: '1px', backgroundColor: colors.borderLight }} />
          <View style={{ flex: 1, textAlign: 'center' }}>
            <Text style={{ fontSize: '13px', fontWeight: 800, color: hasService ? colors.textPrimary : colors.textMuted, display: 'block' }}>{hasService ? user.serviceExpiry : '--'}</Text>
            <Text style={{ fontSize: '11px', color: colors.textMuted, marginTop: '4px', display: 'block' }}>到期日</Text>
          </View>
        </View>
        <View style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: `1px solid ${colors.borderLight}`,
          padding: '10px 16px', backgroundColor: '#FFFBF5',
        }}>
          <View style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Icon name="💰" size={13} color="#D97706" />
            <Text style={{ fontSize: '12px', fontWeight: 600, color: '#D97706' }}>健康基金</Text>
          </View>
          <View style={{ textAlign: 'right' }}>
            <Text style={{ fontSize: '15px', fontWeight: 800, color: colors.textPrimary, display: 'block' }}>¥{fundTotal.toLocaleString()}</Text>
            <Text style={{ fontSize: '10px', color: colors.textMuted }}>自有 ¥{fundPersonal.toLocaleString()} · 企业 ¥{fundCorp.toLocaleString()}</Text>
          </View>
        </View>
      </View>

      {hasService && (
        <View style={{ padding: `${spacing.lg}px ${spacing.lg}px 0` }}>
          <View style={{
            display: 'flex', alignItems: 'center', backgroundColor: '#fff', borderRadius: `${radius.md}px`,
            border: `1px solid ${colors.border}`, padding: `${spacing.md}px`, gap: `${spacing.sm}px`,
          }}>
            <View style={{ width: '40px', height: '40px', borderRadius: '12px', backgroundColor: colors.primary10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="🛡️" size={18} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: '14px', fontWeight: 600, color: colors.textPrimary, display: 'block' }}>{PACKAGE_LABELS[user.servicePackage] || user.servicePackage}</Text>
              <Text style={{ fontSize: '12px', color: colors.textMuted, marginTop: '2px' }}>到期 {user.serviceExpiry} · 剩余 {daysLeft} 天</Text>
            </View>
            <View style={{ padding: '7px 14px', backgroundColor: colors.primary, borderRadius: `${radius.full}px` }} onClick={() => nav('/pages/services/renewal/index')}>
              <Text style={{ fontSize: '12px', color: '#fff', fontWeight: 700 }}>续约</Text>
            </View>
          </View>
        </View>
      )}

      {/* 服务型订单快捷入口：突出用户下一步动作，不照搬传统商城物流状态 */}
      <View style={{ padding: `${spacing.lg}px ${spacing.lg}px 0` }}>
        <View style={{ backgroundColor: '#fff', borderRadius: `${radius.md}px`, border: `1px solid ${colors.border}`, overflow: 'hidden' }}>
          <View onClick={() => nav('/pages/orders/index')} style={{ display: 'flex', alignItems: 'center', padding: '14px 16px 10px' }}>
            <Text style={{ flex: 1, fontSize: '15px', fontWeight: 700, color: colors.textPrimary }}>我的订单</Text>
            <Text style={{ fontSize: '12px', color: colors.textMuted }}>全部订单 ›</Text>
          </View>
          <View style={{ display: 'flex', padding: '6px 4px 16px' }}>
            {[
              { key: 'payment', label: '待支付', icon: 'banknote' },
              { key: 'service', label: '待服务', icon: 'calendar-days' },
              { key: 'progress', label: '进行中', icon: 'clock' },
              { key: 'afterSale', label: '退款/售后', icon: 'rotate-cw' },
            ].map((item) => (
              <View key={item.key} onClick={() => nav(`/pages/orders/index?tab=${item.key}`)} style={{ flex: 1, position: 'relative', textAlign: 'center', padding: '5px 0' }}>
                <View style={{ height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name={item.icon} size={20} color={colors.textSecondary} />
                </View>
                {orderCounts[item.key] > 0 && (
                  <View style={{ position: 'absolute', top: 0, left: '55%', minWidth: '16px', height: '16px', padding: '0 3px', borderRadius: '8px', backgroundColor: colors.danger, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: '9px', color: '#fff', fontWeight: 700 }}>{Math.min(orderCounts[item.key], 99)}</Text>
                  </View>
                )}
                <Text style={{ display: 'block', marginTop: '4px', fontSize: '11px', color: colors.textSecondary }}>{item.label}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>

      {/* 高频入口合并为四宫格，团队沟通统一放到“健康管家”Tab */}
      <View style={{ padding: `${spacing.lg}px ${spacing.lg}px 0` }}>
        <Text style={{ fontSize: '10px', fontWeight: 700, color: colors.textMuted, letterSpacing: '1px', marginBottom: `${spacing.sm}px`, display: 'block' }}>常用功能</Text>
        <View style={{ display: 'flex', flexWrap: 'wrap', backgroundColor: '#fff', borderRadius: `${radius.md}px`, border: `1px solid ${colors.border}`, overflow: 'hidden' }}>
          {[
            { label: '健康方案', icon: 'clipboard-list', color: '#7C3AED', url: '/pages/services/plans/index' },
            { label: '用药管理', icon: 'pill', color: '#D97706', url: '/pages/medication/index' },
            { label: '营养管理', icon: 'leaf', color: '#22A06B', url: '/pages/nutrition/index' },
            { label: '家庭成员', icon: 'users', color: colors.primary, url: '/pages/profile/family/index' },
          ].map((item, index) => (
            <View key={item.label} onClick={() => nav(item.url)} style={{ width: '50%', boxSizing: 'border-box', padding: '16px 12px', display: 'flex', alignItems: 'center', gap: '9px', borderRight: index % 2 === 0 ? `1px solid ${colors.borderLight}` : 'none', borderBottom: index < 2 ? `1px solid ${colors.borderLight}` : 'none' }}>
              <View style={{ width: '34px', height: '34px', borderRadius: '10px', backgroundColor: item.color + '20', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={item.icon} size={17} color={item.color} /></View>
              <Text style={{ fontSize: '13px', fontWeight: 600, color: colors.textPrimary }}>{item.label}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* 账号设置 */}
      <View style={{ padding: `${spacing.lg}px ${spacing.lg}px 0` }}>
        <Text style={{ fontSize: '10px', fontWeight: 700, color: colors.textMuted, letterSpacing: '1px', marginBottom: `${spacing.sm}px`, display: 'block' }}>账号设置</Text>
        <View style={{ backgroundColor: '#fff', borderRadius: `${radius.md}px`, border: `1px solid ${colors.border}`, overflow: 'hidden' }}>
          <MenuItem icon="🎁" iconColor="#8e44ad" label="会员权益" onClick={() => nav('/pages/profile/benefits/index')} />
          <MenuItem icon="🔔" iconColor="#7C3AED" label="通知设置" onClick={() => nav('/pages/profile/notifications/index')} />
          <MenuItem icon="🔒" iconColor="#22A06B" label="账号安全" onClick={() => nav('/pages/profile/security/index')} />
          <MenuItem icon="❓" iconColor="#D97706" label="帮助与反馈" onClick={() => nav('/pages/profile/feedback/index')} isLast />
        </View>
      </View>

      {/* 关于与法律 */}
      <View style={{ padding: `${spacing.lg}px ${spacing.lg}px 0` }}>
        <Text style={{ fontSize: '10px', fontWeight: 700, color: colors.textMuted, letterSpacing: '1px', marginBottom: `${spacing.sm}px`, display: 'block' }}>关于与法律</Text>
        <View style={{ display: 'flex', backgroundColor: '#fff', borderRadius: `${radius.md}px`, border: `1px solid ${colors.border}`, padding: '12px 4px' }}>
          {[['用户协议', 'terms'], ['隐私政策', 'privacy'], ['免责声明', 'disclaimer']].map(([label, type], index) => (
            <View key={type} onClick={() => nav(`/pages/legal/index?type=${type}`)} style={{ flex: 1, textAlign: 'center', borderRight: index < 2 ? `1px solid ${colors.borderLight}` : 'none' }}>
              <Text style={{ fontSize: '11px', color: colors.textSecondary }}>{label}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* 退出登录 */}
      <View style={{ padding: `${spacing.lg}px` }}>
        <View
          onClick={() => setShowLogout(true)}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            padding: `${spacing.md}px 0`, backgroundColor: '#fff', borderRadius: `${radius.md}px`,
            border: `1px solid ${colors.danger}66`,
          }}
        >
          <Text style={{ fontSize: '15px', color: colors.danger, fontWeight: 600 }}>退出登录</Text>
        </View>
        <Text style={{ display: 'block', textAlign: 'center', fontSize: '11px', color: colors.textMuted, marginTop: `${spacing.md}px` }}>嘉医管家 v1.0.0（小程序）</Text>
      </View>

      {showLogout && (
        <View style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999,
        }}>
          <View style={{ backgroundColor: '#fff', borderRadius: `${radius.xl}px`, padding: `${spacing.xl}px`, width: '280px', textAlign: 'center' }}>
            <Text style={{ fontSize: '18px', fontWeight: 700, color: colors.textPrimary, display: 'block', marginBottom: '4px' }}>退出登录</Text>
            <Text style={{ fontSize: '14px', color: colors.textSecondary, display: 'block', marginBottom: `${spacing.lg}px` }}>确定要退出当前账号吗？</Text>
            <View style={{ display: 'flex', gap: `${spacing.sm}px` }}>
              <View style={{ flex: 1, padding: '12px 0', borderRadius: `${radius.md}px`, border: `1.5px solid ${colors.border}` }} onClick={() => setShowLogout(false)}>
                <Text style={{ fontSize: '15px', color: colors.textSecondary, fontWeight: 600 }}>取消</Text>
              </View>
              <View style={{ flex: 1, padding: '12px 0', borderRadius: `${radius.md}px`, backgroundColor: colors.danger }} onClick={doLogout}>
                <Text style={{ fontSize: '15px', color: '#fff', fontWeight: 700 }}>确定退出</Text>
              </View>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

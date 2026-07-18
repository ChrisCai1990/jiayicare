import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { colors, spacing, radius } from '../../../theme';
import { useAuth } from '../../../context/AuthContext';
import { ordersAPI, userAPI } from '../../../services/api';

const PACKAGE_LABELS = {
  pkg_1y: '年度会员', pkg_6m: '半年会员', pkg_3m: '季度会员',
  health_prevention: '健康预防计划', chronic_stable: '慢病维稳计划',
  young_state: '健康年轻态计划', health_reshape: '健康重塑计划',
};

const TEAM_COLORS = ['#1E6B50', '#0077B6', '#7C3AED', '#D44000'];

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
        display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: `${spacing.sm}px`, fontSize: '16px',
      }}>{icon}</View>
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
  const { user, logout, updateUser } = useAuth();
  const [showLogout, setShowLogout] = useState(false);
  const [pendingOrders, setPendingOrders] = useState(0);

  useDidShow(() => {
    userAPI.getMe().then((res) => {
      if (res.success && res.data) updateUser(res.data);
    }).catch(() => {});
  });

  useEffect(() => {
    ordersAPI.list().then((res) => {
      if (res.success) setPendingOrders(res.data.filter((o) => o.status === 'pending').length);
    }).catch(() => {});
  }, []);

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

  // 健康管家团队（2026-07-18 从首页移入，与app端一致）
  const careTeam = (() => {
    if (user?.careTeam?.length > 0) {
      return user.careTeam.map((m, i) => ({ name: m.name, role: m.role, bg: TEAM_COLORS[i % TEAM_COLORS.length] }));
    }
    return [
      user?.doctor?.name ? { name: user.doctor.name, role: user.doctor.title || '家庭医师', bg: TEAM_COLORS[0] } : null,
      user?.manager?.name ? { name: user.manager.name, role: user.manager.title || '健康管家', bg: TEAM_COLORS[1] } : null,
    ].filter(Boolean);
  })();

  const nav = (url) => Taro.navigateTo({ url });
  const doLogout = () => { setShowLogout(false); logout(); Taro.reLaunch({ url: '/pages/auth/login/index' }); };

  return (
    <View style={{ minHeight: '100vh', backgroundColor: colors.background }}>
      {/* Header */}
      <View style={{ backgroundColor: '#1A2B24', padding: '8px 0 32px', textAlign: 'center', position: 'relative' }}>
        {/* 头部编辑资料快捷入口（2026-07-19 对齐app端：顶部信息此前无编辑入口） */}
        <View onClick={() => nav('/pages/profile/edit/index')} style={{
          position: 'absolute', top: '8px', right: `${spacing.lg}px`,
          width: '36px', height: '36px', borderRadius: '18px', backgroundColor: 'rgba(255,255,255,0.15)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Text style={{ fontSize: '15px', color: '#fff' }}>✏️</Text>
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
          <Text style={{ fontSize: '12px', fontWeight: 600, color: '#D97706' }}>💰 健康基金</Text>
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
              <Text style={{ fontSize: '18px' }}>🛡️</Text>
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

      {/* 健康管理（"健康档案""体检报告"已移除，2026-07-18 去重：底部导航"健康档案"Tab已是完整入口） */}
      <View style={{ padding: `${spacing.lg}px ${spacing.lg}px 0` }}>
        <Text style={{ fontSize: '10px', fontWeight: 700, color: colors.textMuted, letterSpacing: '1px', marginBottom: `${spacing.sm}px`, display: 'block' }}>健康管理</Text>
        <View style={{ backgroundColor: '#fff', borderRadius: `${radius.md}px`, border: `1px solid ${colors.border}`, overflow: 'hidden' }}>
          <MenuItem icon="📋" iconColor="#7C3AED" label="健康方案" onClick={() => nav('/pages/services/plans/index')} />
          <MenuItem icon="💊" iconColor="#D97706" label="用药管理" onClick={() => nav('/pages/medication/index')} />
          <MenuItem icon="🌿" iconColor="#22A06B" label="营养素管理" onClick={() => nav('/pages/nutrition/index')} isLast />
        </View>
      </View>

      {/* 我的健康管家团队（2026-07-18 从首页移入） */}
      <View style={{ padding: `${spacing.lg}px ${spacing.lg}px 0` }}>
        <Text style={{ fontSize: '10px', fontWeight: 700, color: colors.textMuted, letterSpacing: '1px', marginBottom: `${spacing.sm}px`, display: 'block' }}>我的健康管家团队</Text>
        {careTeam.length === 0 ? (
          <View style={{ display: 'flex', alignItems: 'center', gap: `${spacing.sm}px`, backgroundColor: '#fff', borderRadius: `${radius.md}px`, border: `1px solid ${colors.border}`, padding: `${spacing.md}px` }}>
            <Text style={{ fontSize: '20px' }}>👥</Text>
            <Text style={{ flex: 1, fontSize: '12px', color: colors.textMuted, lineHeight: '18px' }}>健管团队待分配，完成服务包开通后即可配置</Text>
          </View>
        ) : (
          <ScrollView scrollX style={{ whiteSpace: 'nowrap' }}>
            <View style={{ display: 'inline-flex', gap: `${spacing.sm}px` }}>
              {careTeam.map((member, i) => (
                <View key={i} onClick={() => nav('/pages/chat/index')} style={{
                  display: 'inline-flex', flexDirection: 'column', alignItems: 'center', backgroundColor: '#fff',
                  borderRadius: `${radius.md}px`, border: `1px solid ${colors.border}`, padding: `${spacing.md}px`, minWidth: '88px',
                }}>
                  <View style={{ width: '52px', height: '52px', borderRadius: '26px', backgroundColor: member.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '8px' }}>
                    <Text style={{ fontSize: '20px', fontWeight: 700, color: '#fff' }}>{member.name[0]}</Text>
                  </View>
                  <Text style={{ fontSize: '13px', fontWeight: 700, color: colors.textPrimary }}>{member.name}</Text>
                  <Text style={{ fontSize: '10px', color: colors.textMuted }}>{member.role}</Text>
                </View>
              ))}
            </View>
          </ScrollView>
        )}
      </View>

      {/* 家庭成员 */}
      <View style={{ padding: `${spacing.lg}px ${spacing.lg}px 0` }}>
        <Text style={{ fontSize: '10px', fontWeight: 700, color: colors.textMuted, letterSpacing: '1px', marginBottom: `${spacing.sm}px`, display: 'block' }}>家庭成员</Text>
        <View onClick={() => nav('/pages/profile/family/index')} style={{
          display: 'flex', alignItems: 'center', backgroundColor: '#fff', borderRadius: `${radius.md}px`,
          border: `1px solid ${colors.border}`, padding: `${spacing.md}px`, gap: `${spacing.sm}px`,
        }}>
          <View style={{ width: '40px', height: '40px', borderRadius: '12px', backgroundColor: colors.primary10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: '18px' }}>👨‍👩‍👧</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: '14px', fontWeight: 600, color: colors.textPrimary, display: 'block' }}>家庭成员管理</Text>
            <Text style={{ fontSize: '12px', color: colors.textMuted, marginTop: '2px' }}>关联家人账号，共享健康基金与就医协助</Text>
          </View>
          <Text style={{ fontSize: '13px', color: colors.textMuted }}>›</Text>
        </View>
      </View>

      {/* 我的服务 */}
      <View style={{ padding: `${spacing.lg}px ${spacing.lg}px 0` }}>
        <Text style={{ fontSize: '10px', fontWeight: 700, color: colors.textMuted, letterSpacing: '1px', marginBottom: `${spacing.sm}px`, display: 'block' }}>我的服务</Text>
        <View style={{ backgroundColor: '#fff', borderRadius: `${radius.md}px`, border: `1px solid ${colors.border}`, overflow: 'hidden' }}>
          <MenuItem icon="🧾" iconColor={colors.primary} label="我的订单" badge={pendingOrders} onClick={() => nav('/pages/orders/index')} />
          <MenuItem icon="🛒" iconColor="#D97706" label="服务商城" onClick={() => nav('/pages/services/mall/index')} />
          <MenuItem icon="🎁" iconColor="#8e44ad" label="会员权益" onClick={() => nav('/pages/profile/benefits/index')} isLast />
        </View>
      </View>

      {/* 账号设置 */}
      <View style={{ padding: `${spacing.lg}px ${spacing.lg}px 0` }}>
        <Text style={{ fontSize: '10px', fontWeight: 700, color: colors.textMuted, letterSpacing: '1px', marginBottom: `${spacing.sm}px`, display: 'block' }}>账号设置</Text>
        <View style={{ backgroundColor: '#fff', borderRadius: `${radius.md}px`, border: `1px solid ${colors.border}`, overflow: 'hidden' }}>
          <MenuItem icon="✏️" iconColor="#0077B6" label="编辑资料" onClick={() => nav('/pages/profile/edit/index')} />
          <MenuItem icon="🔔" iconColor="#7C3AED" label="消息通知" onClick={() => nav('/pages/profile/notifications/index')} />
          <MenuItem icon="🔒" iconColor="#22A06B" label="账号安全" onClick={() => nav('/pages/profile/security/index')} />
          <MenuItem icon="❓" iconColor="#D97706" label="帮助与反馈" onClick={() => nav('/pages/profile/feedback/index')} isLast />
        </View>
      </View>

      {/* 关于与法律 */}
      <View style={{ padding: `${spacing.lg}px ${spacing.lg}px 0` }}>
        <Text style={{ fontSize: '10px', fontWeight: 700, color: colors.textMuted, letterSpacing: '1px', marginBottom: `${spacing.sm}px`, display: 'block' }}>关于与法律</Text>
        <View style={{ backgroundColor: '#fff', borderRadius: `${radius.md}px`, border: `1px solid ${colors.border}`, overflow: 'hidden' }}>
          <MenuItem icon="📄" iconColor="#6B7280" label="用户协议" onClick={() => nav('/pages/legal/index?type=terms')} />
          <MenuItem icon="🛡️" iconColor="#6B7280" label="隐私政策" onClick={() => nav('/pages/legal/index?type=privacy')} />
          <MenuItem icon="ℹ️" iconColor="#6B7280" label="免责声明" onClick={() => nav('/pages/legal/index?type=disclaimer')} isLast />
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

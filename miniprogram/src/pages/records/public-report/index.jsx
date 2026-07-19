import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView } from '@tarojs/components';
import Taro, { useRouter } from '@tarojs/taro';
import { colors, spacing, radius, shadow } from '../../../theme';
import { shareAPI } from '../../../services/api';
import useNavBar from '../../../hooks/useNavBar';
import Icon from '../../../components/Icon';

// 对齐 app/src/screens/records/PublicReportScreen.js
// 小程序场景适配：app端网页版通过URL query传token+window.location跳转登录，小程序没有这两个概念。
// 改用：
// - 页面参数：小程序分享卡片用 Taro.navigateTo({ url: `/pages/records/public-report/index?token=xxx` })
//   分享出去，接收方点击卡片进小程序时通过 useRouter().params.token 拿到，路由参数本身就是小程序传参
//   的标准方式，不需要伪装成URL query
// - "登录/注册"按钮：不是网页跳转，而是 Taro.reLaunch 到登录页（小程序内是同一个小程序内的页面跳转，
//   不是"退出到另一个网站"）
// - 分享行为：页面内通过 Taro.showShareMenu + onShareAppMessage（在页面组件里配置）支持转发给好友，
//   这是小程序原生的分享方式，比app端生成公开链接更符合小程序生态
export default function PublicReportPage() {
  const { statusBarHeight } = useNavBar();
  const router = useRouter();
  const token = router.params?.token;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) { setError('无效的分享链接'); setLoading(false); return; }
    shareAPI.getPublic(token)
      .then((res) => {
        if (res.success) setData(res.data);
        else setError(res.message || '链接已失效');
      })
      .catch(() => setError('加载失败，请检查网络'))
      .finally(() => setLoading(false));
  }, [token]);

  const report = data?.reportData;
  const expiryText = data?.expiresAt ? `链接有效至 ${new Date(data.expiresAt).toLocaleDateString('zh-CN')}` : '';

  const goToLogin = () => Taro.reLaunch({ url: '/pages/auth/login/index' });

  return (
    <View style={{ minHeight: '100vh', backgroundColor: colors.background }}>
      <View style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fff', padding: `${statusBarHeight + 8}px ${spacing.lg}px ${spacing.sm}px`, borderBottom: `1px solid ${colors.border}` }}>
        <View style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <Icon name="👁" size={14} color={colors.primary} />
          <Text style={{ fontSize: '13px', color: colors.primary, fontWeight: 600 }}>健康报告分享 · 访客查看</Text>
        </View>
        <View onClick={goToLogin} style={{ padding: '6px 14px', backgroundColor: colors.primary, borderRadius: `${radius.full}px` }}>
          <Text style={{ fontSize: '13px', color: '#fff', fontWeight: 700 }}>登录/注册</Text>
        </View>
      </View>

      {loading && (
        <View style={{ textAlign: 'center', padding: `${spacing.xl}px` }}>
          <Text style={{ fontSize: '14px', color: colors.textMuted }}>加载报告中...</Text>
        </View>
      )}

      {!loading && !!error && (
        <View style={{ textAlign: 'center', padding: `${spacing.xl}px` }}>
          <View style={{ width: '80px', height: '80px', borderRadius: '40px', backgroundColor: colors.border, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto ' + spacing.sm + 'px' }}>
            <Icon name="🔗" size={36} color={colors.textMuted} />
          </View>
          <Text style={{ fontSize: '16px', fontWeight: 700, color: colors.textPrimary, display: 'block' }}>链接已失效</Text>
          <Text style={{ fontSize: '13px', color: colors.textMuted, display: 'block', marginBottom: `${spacing.sm}px` }}>{error}</Text>
          <View onClick={() => Taro.reLaunch({ url: '/pages/home/index' })} style={{ display: 'inline-block', padding: '11px 32px', backgroundColor: colors.primary, borderRadius: `${radius.full}px`, marginTop: `${spacing.sm}px` }}>
            <Text style={{ fontSize: '14px', color: '#fff', fontWeight: 700 }}>前往嘉医汇</Text>
          </View>
        </View>
      )}

      {!loading && !error && report && (
        <ScrollView scrollY style={{ height: 'calc(100vh - 50px)' }}>
          <View style={{ display: 'flex', alignItems: 'center', gap: `${spacing.md}px`, backgroundColor: '#fff', margin: `${spacing.lg}px`, borderRadius: `${radius.lg}px`, padding: `${spacing.md}px`, boxShadow: shadow.sm }}>
            <View style={{ width: '44px', height: '44px', borderRadius: '22px', backgroundColor: colors.primary + '30', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: '18px', fontWeight: 800, color: colors.primary }}>{(data?.userName || '用').charAt(0).toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: '14px', fontWeight: 700, color: colors.textPrimary, display: 'block' }}>{data?.userName || '用户'} 的健康报告</Text>
              <Text style={{ fontSize: '11px', color: colors.textMuted }}>{expiryText}</Text>
            </View>
            <View style={{ display: 'flex', alignItems: 'center', gap: '3px', backgroundColor: colors.primary10, padding: '4px 8px', borderRadius: `${radius.full}px` }}>
              <Icon name="🛡" size={11} color={colors.primary} />
              <Text style={{ fontSize: '11px', color: colors.primary }}>嘉医汇</Text>
            </View>
          </View>

          <View style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff', margin: `0 ${spacing.lg}px`, borderRadius: `${radius.lg}px`, padding: `${spacing.lg}px`, marginBottom: `${spacing.sm}px`, boxShadow: shadow.sm }}>
            <View style={{ flex: 1, paddingRight: `${spacing.md}px` }}>
              <Text style={{ fontSize: '17px', fontWeight: 700, color: colors.textPrimary, display: 'block' }}>{report.period}</Text>
              <Text style={{ fontSize: '12px', color: colors.textMuted, display: 'block', margin: '4px 0' }}>{report.dateRange}</Text>
              <View style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Icon name="☑" size={12} color={colors.textSecondary} />
                <Text style={{ fontSize: '12px', color: colors.textSecondary }}>{report.taskCompletion?.completed}/{report.taskCompletion?.total} 任务完成（{report.taskCompletion?.rate}%）</Text>
              </View>
            </View>
            <View style={{
              width: '72px', height: '72px', borderRadius: '36px', border: `5px solid ${report.healthScore >= 80 ? colors.success : report.healthScore >= 60 ? colors.warning : colors.danger}`,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <Text style={{ fontSize: '22px', fontWeight: 800, color: report.healthScore >= 80 ? colors.success : report.healthScore >= 60 ? colors.warning : colors.danger }}>{report.healthScore}</Text>
              <Text style={{ fontSize: '10px', color: colors.textMuted }}>分</Text>
            </View>
          </View>

          {report.highlights?.length > 0 && (
            <View style={{ margin: `0 ${spacing.lg}px`, marginTop: `${spacing.md}px` }}>
              <Text style={{ fontSize: '15px', fontWeight: 700, color: colors.textPrimary, display: 'block', marginBottom: `${spacing.sm}px` }}>本期亮点</Text>
              <View style={{ backgroundColor: '#fff', borderRadius: `${radius.lg}px`, padding: `${spacing.md}px`, boxShadow: shadow.sm }}>
                {report.highlights.map((h, i) => {
                  const icon = h.type === 'danger' ? '⚠️' : h.type === 'warning' ? '⚡' : '✅';
                  const iconColor = h.type === 'danger' ? colors.danger : h.type === 'warning' ? colors.warning : colors.success;
                  return (
                    <View key={i} style={{ display: 'flex', gap: `${spacing.sm}px`, alignItems: 'flex-start', marginBottom: i < report.highlights.length - 1 ? `${spacing.sm}px` : 0 }}>
                      <Icon name={icon} size={14} color={iconColor} />
                      <Text style={{ flex: 1, fontSize: '13px', color: colors.textSecondary, lineHeight: '20px' }}>{h.text}</Text>
                    </View>
                  );
                })}
              </View>
            </View>
          )}

          {report.metrics?.length > 0 && (
            <View style={{ margin: `0 ${spacing.lg}px`, marginTop: `${spacing.md}px` }}>
              <Text style={{ fontSize: '15px', fontWeight: 700, color: colors.textPrimary, display: 'block', marginBottom: `${spacing.sm}px` }}>健康指标</Text>
              <View style={{ backgroundColor: '#fff', borderRadius: `${radius.lg}px`, overflow: 'hidden', boxShadow: shadow.sm }}>
                {report.metrics.map((m, i) => {
                  const statusColor = m.status === 'normal' ? colors.success : m.status === 'warning' ? colors.warning : colors.danger;
                  const trendColor = m.trend === 'down' ? colors.success : m.trend === 'up' ? colors.warning : colors.textMuted;
                  const trendIcon = m.trend === 'down' ? '↓' : m.trend === 'up' ? '↑' : '–';
                  return (
                    <View key={i}>
                      <View style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: `${spacing.md}px` }}>
                        <Text style={{ fontSize: '14px', color: colors.textPrimary, fontWeight: 500 }}>{m.label}</Text>
                        <View style={{ display: 'flex', alignItems: 'center', gap: `${spacing.xs}px` }}>
                          <Text style={{ fontSize: '18px', fontWeight: 800, color: statusColor }}>{m.value}</Text>
                          <Text style={{ fontSize: '11px', color: colors.textMuted }}>{m.unit}</Text>
                          <Text style={{ fontSize: '11px', fontWeight: 600, color: trendColor, backgroundColor: trendColor + '20', padding: '3px 7px', borderRadius: `${radius.full}px` }}>{trendIcon} {m.delta}</Text>
                        </View>
                      </View>
                      {i < report.metrics.length - 1 && <View style={{ height: '1px', backgroundColor: colors.border, margin: `0 ${spacing.md}px` }} />}
                    </View>
                  );
                })}
              </View>
            </View>
          )}

          <View style={{ margin: `0 ${spacing.lg}px`, marginTop: `${spacing.md}px` }}>
            <View style={{ display: 'flex', alignItems: 'center', gap: `${spacing.sm}px`, backgroundColor: '#fff', borderRadius: `${radius.md}px`, padding: `${spacing.md}px`, boxShadow: shadow.sm }}>
              <Icon name="📋" size={18} color={colors.primary} />
              <Text style={{ fontSize: '14px', color: colors.textSecondary }}>本期共记录 <Text style={{ fontSize: '16px', fontWeight: 800, color: colors.primary }}>{report.recordCount}</Text> 条健康数据</Text>
            </View>
          </View>

          <View style={{ margin: `${spacing.lg}px`, marginTop: `${spacing.xl}px`, backgroundColor: colors.primary10, borderRadius: `${radius.lg}px`, padding: `${spacing.xl}px`, textAlign: 'center', border: `1px solid ${colors.primary}30` }}>
            <View style={{ display: 'flex', justifyContent: 'center', marginBottom: '8px' }}><Icon name="❤️" size={28} color={colors.primary} /></View>
            <Text style={{ fontSize: '16px', fontWeight: 700, color: colors.textPrimary, display: 'block', marginBottom: `${spacing.xs}px` }}>管理您的健康数据</Text>
            <Text style={{ fontSize: '13px', color: colors.textSecondary, lineHeight: '20px', display: 'block', marginBottom: `${spacing.lg}px` }}>注册嘉医汇，获得专属医生随访与健康管理服务</Text>
            <View onClick={goToLogin} style={{ display: 'inline-block', padding: '12px 32px', backgroundColor: colors.primary, borderRadius: `${radius.full}px` }}>
              <Text style={{ fontSize: '14px', color: '#fff', fontWeight: 700 }}>立即体验 →</Text>
            </View>
          </View>

          <View style={{ height: `${spacing.xl * 2}px` }} />
        </ScrollView>
      )}
    </View>
  );
}

// 小程序原生分享：用户点击右上角菜单"转发"时触发，把当前报告页连同token参数转发给好友
export function onShareAppMessage() {
  return { title: '我的健康报告', path: 'pages/records/public-report/index' };
}

import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, ScrollView } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { colors, spacing, radius, shadow } from '../../../theme';
import { recordsAPI } from '../../../services/api';
import TrendChart from '../../../components/TrendChart';
import useNavBar from '../../../hooks/useNavBar';
import Icon from '../../../components/Icon';

const TYPE_META = {
  bloodPressure: { label: '血压', icon: '💗', unit: 'mmHg' },
  bloodSugar: { label: '血糖', icon: '🩸', unit: 'mmol/L' },
  heartRate: { label: '心率', icon: '❤️', unit: '次/分' },
  weight: { label: '体重', icon: '⚖️', unit: 'kg' },
  sleep: { label: '睡眠', icon: '🌙', unit: '小时' },
  mood: { label: '情绪', icon: '😊', unit: '分' },
};

const STATUS_COLOR = { normal: colors.success, warning: colors.warning, low: colors.info };

export default function RecordsIndexPage() {
  const { statusBarHeight } = useNavBar();
  const [records, setRecords] = useState([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [bpTrend, setBpTrend] = useState([]);
  const [bsTrend, setBsTrend] = useState([]);
  const [sleepTrend, setSleepTrend] = useState([]);
  const [trendTab, setTrendTab] = useState('bp');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await recordsAPI.list({ limit: 50 });
      if (res.success) setRecords(res.data || []);
    } catch {}
    setLoading(false);
  }, []);

  useDidShow(() => { load(); });

  useEffect(() => {
    Promise.allSettled([
      recordsAPI.trend('bloodPressure'),
      recordsAPI.trend('bloodSugar'),
      recordsAPI.trend('sleep'),
    ]).then(([bp, bs, sl]) => {
      if (bp.status === 'fulfilled' && bp.value?.data) {
        setBpTrend(bp.value.data.slice(-10).map((r) => ({ label: new Date(r.recordedAt).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }), value: r.extra?.sys || parseFloat(r.value) || 0 })));
      }
      if (bs.status === 'fulfilled' && bs.value?.data) {
        setBsTrend(bs.value.data.slice(-10).map((r) => ({ label: new Date(r.recordedAt).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }), value: parseFloat(r.value) || 0 })));
      }
      if (sl.status === 'fulfilled' && sl.value?.data) {
        setSleepTrend(sl.value.data.slice(-10).map((r) => ({ label: new Date(r.recordedAt).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }), value: parseFloat(r.value) || 0 })));
      }
    });
  }, []);

  const filtered = filter === 'all' ? records : records.filter((r) => r.type === filter);
  const latestSleep = records.find((r) => r.type === 'sleep');
  const trendMap = { bp: { data: bpTrend, color: colors.danger, label: '血压 (mmHg)' }, bs: { data: bsTrend, color: colors.warning, label: '血糖 (mmol/L)' }, sleep: { data: sleepTrend, color: '#7C3AED', label: '睡眠 (小时)' } };

  return (
    <View style={{ minHeight: '100vh', backgroundColor: colors.background }}>
      <View style={{ padding: `${statusBarHeight + 12}px ${spacing.lg}px 0` }}>
        <Text style={{ fontSize: '20px', fontWeight: 800, color: colors.textPrimary, display: 'block', marginBottom: `${spacing.md}px` }}>健康档案</Text>

        <ScrollView scrollX style={{ whiteSpace: 'nowrap', marginBottom: `${spacing.md}px` }}>
          <View style={{ display: 'inline-flex', gap: '8px' }}>
            {['all', ...Object.keys(TYPE_META)].map((k) => (
              <View
                key={k}
                onClick={() => setFilter(k)}
                style={{
                  display: 'inline-block', padding: '6px 14px', borderRadius: `${radius.full}px`,
                  backgroundColor: filter === k ? colors.primary : '#fff',
                  border: `1px solid ${filter === k ? colors.primary : colors.border}`,
                }}
              >
                {k === 'all' ? (
                  <Text style={{ fontSize: '12px', color: filter === k ? '#fff' : colors.textPrimary, fontWeight: 600 }}>全部</Text>
                ) : (
                  <View style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Icon name={TYPE_META[k].icon} size={12} color={filter === k ? '#fff' : colors.textPrimary} />
                    <Text style={{ fontSize: '12px', color: filter === k ? '#fff' : colors.textPrimary, fontWeight: 600 }}>{TYPE_META[k].label}</Text>
                  </View>
                )}
              </View>
            ))}
          </View>
        </ScrollView>

        <View
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
            backgroundColor: colors.primary, borderRadius: `${radius.md}px`, padding: '12px 0', marginBottom: `${spacing.md}px`,
          }}
          onClick={() => Taro.navigateTo({ url: '/pages/records/add/index' })}
        >
          <Text style={{ color: '#fff', fontSize: '14px', fontWeight: 700 }}>+ 录入健康数据</Text>
        </View>

        {/* 个人资料入口（2026-07-18 对齐app端健康档案页拆分：静态档案字段搬到独立页） */}
        <View onClick={() => Taro.navigateTo({ url: '/pages/records/profile-archive/index' })} style={{
          display: 'flex', alignItems: 'center', gap: `${spacing.sm}px`, backgroundColor: '#fff', borderRadius: `${radius.md}px`,
          border: `1px solid ${colors.border}`, padding: `${spacing.md}px`, marginBottom: `${spacing.md}px`, boxShadow: shadow.card,
        }}>
          <Icon name="👤" size={20} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: '14px', fontWeight: 700, color: colors.textPrimary, display: 'block' }}>个人资料</Text>
            <Text style={{ fontSize: '11px', color: colors.textMuted }}>基本信息 · 基础健康档案 · 生活方式 · 年度复查</Text>
          </View>
          <Text style={{ fontSize: '14px', color: colors.textMuted }}>›</Text>
        </View>

        <View style={{ display: 'flex', gap: `${spacing.sm}px`, marginBottom: `${spacing.md}px` }}>
          <View style={{ flex: 1, backgroundColor: '#fff', borderRadius: `${radius.md}px`, padding: '12px', textAlign: 'center', boxShadow: shadow.card }}
            onClick={() => Taro.navigateTo({ url: '/pages/records/report/index' })}>
            <View style={{ display: 'flex', justifyContent: 'center' }}><Icon name="📊" size={20} /></View>
            <Text style={{ fontSize: '12px', color: colors.textPrimary, marginTop: '4px' }}>健康报告</Text>
          </View>
          <View style={{ flex: 1, backgroundColor: '#fff', borderRadius: `${radius.md}px`, padding: '12px', textAlign: 'center', boxShadow: shadow.card }}
            onClick={() => Taro.navigateTo({ url: '/pages/records/upload/index' })}>
            <View style={{ display: 'flex', justifyContent: 'center' }}><Icon name="📄" size={20} /></View>
            <Text style={{ fontSize: '12px', color: colors.textPrimary, marginTop: '4px' }}>体检报告</Text>
          </View>
        </View>

        {/* AI健康分析入口卡片 */}
        <View onClick={() => Taro.navigateTo({ url: '/pages/records/ai-health/index' })} style={{
          display: 'flex', alignItems: 'center', gap: `${spacing.sm}px`, backgroundColor: '#1A2B24', borderRadius: `${radius.md}px`,
          padding: `${spacing.md}px`, marginBottom: `${spacing.md}px`,
        }}>
          <Icon name="✨" size={24} color="#fff" />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: '14px', fontWeight: 700, color: '#fff', display: 'block' }}>AI健康分析 / 风险评估</Text>
            <Text style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)' }}>AI结合体检数据与健康档案自动生成解读</Text>
          </View>
          <Text style={{ color: '#fff', fontSize: '14px' }}>›</Text>
        </View>

        {/* 睡眠指标卡片 */}
        {!!latestSleep && (
          <View style={{ backgroundColor: '#fff', borderRadius: `${radius.md}px`, padding: `${spacing.md}px`, marginBottom: `${spacing.md}px`, boxShadow: shadow.card }}>
            <View style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Icon name="🌙" size={14} color={colors.textPrimary} />
                <Text style={{ fontSize: '14px', fontWeight: 700, color: colors.textPrimary }}>最近睡眠</Text>
              </View>
              <Text style={{ fontSize: '18px', fontWeight: 800, color: colors.primary }}>{latestSleep.value} 小时</Text>
            </View>
            {!!latestSleep.extra?.sleepTime && (
              <Text style={{ fontSize: '11px', color: colors.textMuted }}>{latestSleep.extra.sleepTime} 入睡 · {latestSleep.extra.wakeTime} 醒来</Text>
            )}
          </View>
        )}

        {/* 趋势图 Tab：血压/血糖/睡眠 */}
        {(bpTrend.length > 0 || bsTrend.length > 0 || sleepTrend.length > 0) && (
          <View style={{ backgroundColor: '#fff', borderRadius: `${radius.md}px`, padding: `${spacing.md}px`, marginBottom: `${spacing.md}px`, boxShadow: shadow.card }}>
            <View style={{ display: 'flex', gap: '8px', marginBottom: `${spacing.sm}px` }}>
              {[{ k: 'bp', l: '血压' }, { k: 'bs', l: '血糖' }, { k: 'sleep', l: '睡眠' }].map((t) => (
                <View key={t.k} onClick={() => setTrendTab(t.k)} style={{
                  padding: '5px 12px', borderRadius: `${radius.full}px`,
                  backgroundColor: trendTab === t.k ? colors.primary : colors.background,
                  border: `1px solid ${trendTab === t.k ? colors.primary : colors.border}`,
                }}>
                  <Text style={{ fontSize: '12px', color: trendTab === t.k ? '#fff' : colors.textSecondary, fontWeight: trendTab === t.k ? 700 : 400 }}>{t.l}</Text>
                </View>
              ))}
            </View>
            <Text style={{ fontSize: '11px', color: colors.textMuted, display: 'block', marginBottom: '4px' }}>{trendMap[trendTab].label}</Text>
            <TrendChart points={trendMap[trendTab].data} height={100} color={trendMap[trendTab].color} />
          </View>
        )}
      </View>

      <View style={{ padding: `0 ${spacing.lg}px` }}>
        {loading ? (
          <Text style={{ fontSize: '13px', color: colors.textMuted }}>加载中...</Text>
        ) : filtered.length === 0 ? (
          <View style={{ textAlign: 'center', padding: `${spacing.xxl}px 0` }}>
            <Text style={{ fontSize: '13px', color: colors.textMuted }}>暂无记录，点击上方按钮开始录入</Text>
          </View>
        ) : (
          (() => {
            // 按归属日期分组，同日多条折叠展示"共N次"，区分记录时间(recordedAt)和提交时间(createdAt)（2026-07-18 对齐app端）
            const groups = [];
            const groupMap = {};
            filtered.forEach((r) => {
              const d = r.recordedAt ? new Date(r.recordedAt) : null;
              const dateKey = d ? `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}` : '未知日期';
              const dateLabel = d ? d.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' }) : '未知日期';
              if (!groupMap[dateKey]) {
                groupMap[dateKey] = { dateKey, dateLabel, items: [] };
                groups.push(groupMap[dateKey]);
              }
              groupMap[dateKey].items.push(r);
            });
            return groups.map((group) => (
              <View key={group.dateKey} style={{ marginBottom: `${spacing.md}px` }}>
                <View style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                  <Text style={{ fontSize: '13px', fontWeight: 700, color: colors.textSecondary }}>{group.dateLabel}</Text>
                  {group.items.length > 1 && <Text style={{ fontSize: '11px', color: colors.textMuted }}>共{group.items.length}次</Text>}
                </View>
                {group.items.map((r) => {
                  const meta = TYPE_META[r.type] || { label: r.label || r.type, icon: '📋', unit: r.unit || '' };
                  const recordedTime = r.recordedAt ? new Date(r.recordedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '';
                  const isBackfilled = r.recordedAt && r.createdAt &&
                    new Date(r.createdAt).toDateString() !== new Date(r.recordedAt).toDateString();
                  const createdLabel = isBackfilled
                    ? `提交于 ${new Date(r.createdAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`
                    : '';
                  return (
                    <View key={r._id} style={{
                      display: 'flex', alignItems: 'center', backgroundColor: '#fff', borderRadius: `${radius.md}px`,
                      padding: `${spacing.md}px`, marginBottom: '8px', boxShadow: shadow.card,
                    }}>
                      <View style={{ marginRight: `${spacing.sm}px` }}><Icon name={meta.icon} size={22} /></View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: '14px', fontWeight: 600, color: colors.textPrimary, display: 'block' }}>{r.label || meta.label}</Text>
                        <Text style={{ fontSize: '11px', color: colors.textMuted }}>
                          {recordedTime}{createdLabel ? ` · ${createdLabel}` : ''}
                        </Text>
                      </View>
                      <Text style={{ fontSize: '16px', fontWeight: 700, color: STATUS_COLOR[r.status] || colors.textPrimary }}>
                        {r.value} {r.unit || meta.unit}
                      </Text>
                    </View>
                  );
                })}
              </View>
            ));
          })()
        )}
      </View>
      <View style={{ height: '20px' }} />
    </View>
  );
}

import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, ScrollView } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { colors, spacing, radius, shadow } from '../../../theme';
import { recordsAPI, userAPI } from '../../../services/api';
import TrendChart from '../../../components/TrendChart';
import useNavBar from '../../../hooks/useNavBar';
import Icon from '../../../components/Icon';
import { useAuth } from '../../../context/AuthContext';

const TYPE_META = {
  bloodPressure: { label: '血压', icon: '💗', unit: 'mmHg' },
  bloodSugar: { label: '血糖', icon: '🩸', unit: 'mmol/L' },
  heartRate: { label: '心率', icon: '❤️', unit: '次/分' },
  weight: { label: '体重', icon: '⚖️', unit: 'kg' },
  sleep: { label: '睡眠', icon: '🌙', unit: '小时' },
};
const CORE_TYPES = ['bloodPressure', 'bloodSugar', 'sleep', 'heartRate', 'weight'];
const DAILY_TYPES = ['diet', 'exercise', 'bowel', 'water', 'smoking', 'alcohol', 'mood'];
const BODY_METRICS = [
  { key: 'weight', referenceKey: 'weightReference', label: '体成分体重', unit: 'kg', color: '#2563EB' },
  { key: 'skelMuscle', referenceKey: 'skelMuscleReference', label: '骨骼肌', unit: 'kg', color: colors.primary },
  { key: 'bodyFatRate', referenceKey: 'bodyFatRateReference', label: '体脂率', unit: '%', color: '#D97706' },
  { key: 'visceralFat', referenceKey: 'visceralFatReference', label: '内脏脂肪', unit: '级', color: '#7C3AED' },
];
const bodyNumber = value => Number(String(value ?? '').match(/-?\d+(?:\.\d+)?/)?.[0]);
const bodyDate = row => String(row?.measuredAt || row?.checkDate || row?.recordedAt || '').slice(0, 10);

const STATUS_COLOR = { normal: colors.success, warning: colors.warning, low: colors.info };

export default function RecordsIndexPage() {
  const { statusBarHeight } = useNavBar();
  const { user, updateUser } = useAuth();
  const [records, setRecords] = useState([]);
  const [filter, setFilter] = useState('bloodPressure');
  const [loading, setLoading] = useState(true);
  const [bpTrend, setBpTrend] = useState([]);
  const [bsTrend, setBsTrend] = useState([]);
  const [sleepTrend, setSleepTrend] = useState([]);
  const [heartTrend, setHeartTrend] = useState([]);
  const [weightTrend, setWeightTrend] = useState([]);
  const [trendTab, setTrendTab] = useState('bloodPressure');
  const [bodyComposition, setBodyComposition] = useState({});
  const [bodyCompHistory, setBodyCompHistory] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await recordsAPI.list({ limit: 50 });
      if (res.success) setRecords(res.data || []);
    } catch {}
    setLoading(false);
  }, []);

  useDidShow(() => {
    load();
    userAPI.getMe().then((res) => {
      if (res?.success && res.data) {
        updateUser(res.data);
        setBodyComposition(res.data.bodyComposition || {});
        setBodyCompHistory(res.data.bodyCompHistory || []);
      }
    }).catch(() => {});
  });

  useEffect(() => {
    Promise.allSettled([
      recordsAPI.trend('bloodPressure'),
      recordsAPI.trend('bloodSugar'),
      recordsAPI.trend('sleep'),
      recordsAPI.trend('heartRate'),
      recordsAPI.trend('weight'),
    ]).then(([bp, bs, sl, hr, wt]) => {
      if (bp.status === 'fulfilled' && bp.value?.data) {
        setBpTrend(bp.value.data.slice(-10).map((r) => ({ label: new Date(r.recordedAt).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }), value: r.extra?.sys || parseFloat(r.value) || 0 })));
      }
      if (bs.status === 'fulfilled' && bs.value?.data) {
        setBsTrend(bs.value.data.slice(-10).map((r) => ({ label: new Date(r.recordedAt).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }), value: parseFloat(r.value) || 0 })));
      }
      if (sl.status === 'fulfilled' && sl.value?.data) {
        setSleepTrend(sl.value.data.slice(-10).map((r) => ({ label: new Date(r.recordedAt).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }), value: parseFloat(r.value) || 0 })));
      }
      if (hr.status === 'fulfilled' && hr.value?.data) setHeartTrend(hr.value.data.slice(-10).map((r) => ({ label: new Date(r.recordedAt).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }), value: parseFloat(r.value) || 0 })));
      if (wt.status === 'fulfilled' && wt.value?.data) setWeightTrend(wt.value.data.slice(-10).map((r) => ({ label: new Date(r.recordedAt).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }), value: parseFloat(r.value) || 0 })));
    });
  }, []);

  const filtered = records.filter((r) => r.type === filter);
  const dailyRecords = records.filter((r) => DAILY_TYPES.includes(r.type));
  const symptoms = records.filter((r) => r.type === 'symptom');
  const latestSleep = records.find((r) => r.type === 'sleep');
  const trendMap = {
    bloodPressure: { data: bpTrend, color: colors.danger, label: '血压 (mmHg)' },
    bloodSugar: { data: bsTrend, color: colors.warning, label: '血糖 (mmol/L)' },
    sleep: { data: sleepTrend, color: '#7C3AED', label: '睡眠 (小时)' },
    heartRate: { data: heartTrend, color: '#DC2626', label: '心率 (次/分)' },
    weight: { data: weightTrend, color: '#0369A1', label: '体重 (kg)' },
  };

  return (
    <View style={{ minHeight: '100vh', backgroundColor: colors.background }}>
      <View style={{ padding: `${statusBarHeight + 12}px ${spacing.lg}px 0` }}>
        <Text style={{ fontSize: '20px', fontWeight: 800, color: colors.textPrimary, display: 'block', marginBottom: `${spacing.md}px` }}>健康档案</Text>

        <ScrollView scrollX style={{ whiteSpace: 'nowrap', marginBottom: `${spacing.md}px` }}>
          <View style={{ display: 'inline-flex', gap: '8px' }}>
            {CORE_TYPES.map((k) => (
              <View
                key={k}
                onClick={() => { setFilter(k); setTrendTab(k); }}
                style={{
                  display: 'inline-block', padding: '6px 14px', borderRadius: `${radius.full}px`,
                  backgroundColor: filter === k ? colors.primary : '#fff',
                  border: `1px solid ${filter === k ? colors.primary : colors.border}`,
                }}
              >
                <View style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Icon name={TYPE_META[k].icon} size={12} color={filter === k ? '#fff' : colors.textPrimary} />
                  <Text style={{ fontSize: '12px', color: filter === k ? '#fff' : colors.textPrimary, fontWeight: 600 }}>{TYPE_META[k].label}</Text>
                </View>
              </View>
            ))}
          </View>
        </ScrollView>

        {/* 个人资料入口（2026-07-18 对齐app端健康档案页拆分：静态档案字段搬到独立页） */}
        <View
          onClick={() => Taro.navigateTo({ url: '/pages/records/upload/index' })}
          style={{
            display: 'flex', alignItems: 'center', gap: `${spacing.md}px`,
            backgroundColor: colors.primary, borderRadius: `${radius.lg}px`,
            padding: `${spacing.lg}px ${spacing.md}px`, marginBottom: `${spacing.sm}px`, boxShadow: shadow.card,
          }}
        >
          <View style={{ width: '48px', height: '48px', borderRadius: '15px', backgroundColor: 'rgba(255,255,255,0.16)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon name="📤" size={24} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: '16px', fontWeight: 800, color: '#fff', display: 'block', marginBottom: '4px' }}>上传体检/检查报告</Text>
            <Text style={{ fontSize: '11px', lineHeight: '17px', color: 'rgba(255,255,255,0.76)' }}>支持相册选图和拍照，上传后自动解析归档</Text>
          </View>
          <Text style={{ color: '#fff', fontSize: '18px' }}>›</Text>
        </View>
        <View onClick={() => Taro.navigateTo({ url: '/pages/records/medical-reports/index' })} style={{ textAlign: 'center', padding: '9px 0', marginBottom: `${spacing.md}px` }}>
          <Text style={{ fontSize: '13px', fontWeight: 600, color: colors.primary }}>📄 查看已上传报告</Text>
        </View>

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
        </View>

        {/* 健康信息整理入口卡片 */}
        <View onClick={() => {
          if (!user?.aiEntitlements?.aiHealthAnalysis && !user?.aiEntitlements?.aiRiskAssessment) {
            Taro.showModal({
              title: '年度会员专属',
              content: 'AI健康信息整理与趋势分析、健康关注提示仅向健康预防计划、健康护航计划客户开放。相关内容仅作信息整理，不构成诊断或治疗建议。',
              confirmText: '查看商城',
              success: res => { if (res.confirm) Taro.navigateTo({ url: '/pages/services/mall/index' }); },
            });
            return;
          }
          Taro.navigateTo({ url: '/pages/records/ai-health/index' });
        }} style={{
          display: 'flex', alignItems: 'center', gap: `${spacing.sm}px`, backgroundColor: '#1A2B24', borderRadius: `${radius.md}px`,
          padding: `${spacing.md}px`, marginBottom: `${spacing.md}px`,
        }}>
          <Icon name="✨" size={24} color="#fff" />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: '14px', fontWeight: 700, color: '#fff', display: 'block' }}>健康信息整理 / 关注提示</Text>
            <Text style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)' }}>{user?.aiEntitlements?.aiHealthAnalysis || user?.aiEntitlements?.aiRiskAssessment ? 'AI结合体检数据与健康档案自动生成解读' : '年度会员专属 · 查看权益'}</Text>
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
        {(bpTrend.length > 0 || bsTrend.length > 0 || sleepTrend.length > 0 || heartTrend.length > 0 || weightTrend.length > 0) && (
          <View style={{ backgroundColor: '#fff', borderRadius: `${radius.md}px`, padding: `${spacing.md}px`, marginBottom: `${spacing.md}px`, boxShadow: shadow.card }}>
            <View style={{ display: 'flex', gap: '8px', marginBottom: `${spacing.sm}px` }}>
              {CORE_TYPES.map((k) => ({ k, l: TYPE_META[k].label })).map((t) => (
                <View key={t.k} onClick={() => { setTrendTab(t.k); setFilter(t.k); }} style={{
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

      <View style={{ padding: `0 ${spacing.lg}px` }}>
        <Text style={{ fontSize: '15px', fontWeight: 700, color: colors.textPrimary, display: 'block', marginBottom: `${spacing.sm}px` }}>日常生活打卡</Text>
        <View style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: `${spacing.lg}px` }}>
          {DAILY_TYPES.map((type) => {
            const latest = dailyRecords.find((r) => r.type === type);
            const labelMap = { diet: '饮食', exercise: '运动', bowel: '排便', water: '饮水', smoking: '吸烟', alcohol: '饮酒', mood: '情绪' };
            return <View key={type} style={{ width: 'calc(50% - 4px)', boxSizing: 'border-box', backgroundColor: '#fff', borderRadius: `${radius.md}px`, padding: `${spacing.md}px`, boxShadow: shadow.card }}>
              <Text style={{ fontSize: '13px', fontWeight: 700, color: colors.textPrimary, display: 'block' }}>{labelMap[type]}</Text>
              <Text style={{ fontSize: '12px', color: latest ? colors.textSecondary : colors.textMuted, marginTop: '4px' }}>{latest?.value || latest?.note || '近30天暂无记录'}</Text>
            </View>;
          })}
        </View>

        <Text style={{ fontSize: '15px', fontWeight: 700, color: colors.textPrimary, display: 'block', marginBottom: `${spacing.sm}px` }}>身体成分</Text>
        {(() => {
          const history = [...bodyCompHistory];
          if (Object.keys(bodyComposition || {}).length) history.push(bodyComposition);
          const cards = BODY_METRICS.map((metric) => {
            const rows = history.filter(row => Number.isFinite(bodyNumber(row?.[metric.key])))
              .sort((a, b) => bodyDate(a).localeCompare(bodyDate(b)));
            if (!rows.length) return null;
            const latest = rows[rows.length - 1];
            const points = rows.map(row => ({ label: bodyDate(row)?.slice(5) || '未标注', value: bodyNumber(row[metric.key]) }));
            const reference = [...rows].reverse().find(row => row?.[metric.referenceKey])?.[metric.referenceKey] || '未录入';
            return <View key={metric.key} style={{ backgroundColor: '#fff', borderRadius: `${radius.md}px`, padding: `${spacing.md}px`, marginBottom: `${spacing.sm}px`, boxShadow: shadow.card }}>
              <View style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: `${spacing.sm}px` }}>
                <Text style={{ fontSize: '14px', fontWeight: 700, color: colors.textPrimary }}>{metric.label}</Text>
                <Text style={{ fontSize: '18px', fontWeight: 800, color: metric.color }}>{bodyNumber(latest[metric.key])} {metric.unit}</Text>
              </View>
              <TrendChart points={points} height={118} color={metric.color} />
              <Text style={{ fontSize: '11px', color: colors.textMuted, marginTop: '6px', display: 'block' }}>最新检测：{bodyDate(latest) || '未标注'} · 参考范围：{reference}</Text>
            </View>;
          }).filter(Boolean);
          return cards.length ? <View style={{ marginBottom: `${spacing.lg}px` }}>{cards}</View> : <View style={{ backgroundColor: '#fff', borderRadius: `${radius.md}px`, padding: `${spacing.md}px`, marginBottom: `${spacing.lg}px`, boxShadow: shadow.card }}><Text style={{ fontSize: '13px', color: colors.textMuted }}>暂无身体成分数据</Text></View>;
        })()}

        <Text style={{ fontSize: '15px', fontWeight: 700, color: colors.textPrimary, display: 'block', marginBottom: `${spacing.sm}px` }}>今日健康状态</Text>
        {(() => {
          const todayKey = new Date().toISOString().slice(0, 10);
          const latest = symptoms.find((r) => String(r.recordedAt || '').slice(0, 10) === todayKey);
          return <View style={{ backgroundColor: '#fff', borderRadius: `${radius.md}px`, padding: `${spacing.md}px`, boxShadow: shadow.card }}>
            <Text style={{ fontSize: '14px', fontWeight: 700, color: latest ? colors.danger : colors.primary, display: 'block' }}>{latest ? '今天已记录不适' : '今天暂未记录不适'}</Text>
            <Text style={{ fontSize: '12px', color: colors.textMuted, marginTop: '4px' }}>{latest ? (latest.value || latest.note || '已提交不适情况') : '如有不适，请在首页“记录健康数据”中及时填写。'}</Text>
          </View>;
        })()}
      </View>
      <View style={{ height: '20px' }} />
    </View>
  );
}

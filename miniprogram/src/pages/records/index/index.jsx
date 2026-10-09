import React, { useState, useCallback, useRef } from 'react';
import { View, Text, ScrollView } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { colors, spacing, radius, shadow } from '../../../theme';
import { recordsAPI, userAPI, ibdAPI } from '../../../services/api';
import TrendChart from '../../../components/TrendChart';
import BloodPressureChart from '../../../components/BloodPressureChart';
import { bloodPressurePoints } from '../../../utils/bloodPressureTrend';
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

const pad2 = value => String(value).padStart(2, '0');
const formatRecordDate = value => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return '未知日期';
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
};
const formatRecordTime = value => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return '';
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
};

export default function RecordsIndexPage() {
  const { statusBarHeight } = useNavBar();
  const { updateUser } = useAuth();
  const [records, setRecords] = useState([]);
  const [filter, setFilter] = useState('bloodPressure');
  const [loading, setLoading] = useState(true);
  const [ibdEnabled, setIbdEnabled] = useState(false);
  const [bpTrend, setBpTrend] = useState([]);
  const [bsTrend, setBsTrend] = useState([]);
  const [sleepTrend, setSleepTrend] = useState([]);
  const [heartTrend, setHeartTrend] = useState([]);
  const [weightTrend, setWeightTrend] = useState([]);
  const [trendTab, setTrendTab] = useState('bloodPressure');
  const [bodyTrendTab, setBodyTrendTab] = useState('weight');
  const [bodyComposition, setBodyComposition] = useState({});
  const [bodyCompHistory, setBodyCompHistory] = useState([]);
  const [showAllRecords, setShowAllRecords] = useState(false);

  const trendGeneration = useRef(0);
  const [trendError,setTrendError] = useState('');
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
    ibdAPI.status().then(res => setIbdEnabled(!!res.data?.enabled)).catch(() => setIbdEnabled(false));
    loadTrends();
    userAPI.getMe().then((res) => {
      if (res?.success && res.data) {
        updateUser(res.data);
        setBodyComposition(res.data.bodyComposition || {});
        setBodyCompHistory(res.data.bodyCompHistory || []);
      }
    }).catch(() => {});
  });

  async function loadTrends() {
    const generation=++trendGeneration.current;
    const types=['bloodPressure','bloodSugar','sleep','heartRate','weight'];
    const results=await Promise.allSettled(types.map(type=>recordsAPI.trend(type)));
    if(generation!==trendGeneration.current)return;
    const setters=[setBpTrend,setBsTrend,setSleepTrend,setHeartTrend,setWeightTrend];
    setTrendError(results.some(result=>result.status==='rejected'||result.value?.success===false)?'部分趋势更新失败，点击重试':'');
    results.forEach((result,index)=>{
      if(result.status!=='fulfilled'||result.value?.success===false||!Array.isArray(result.value?.data))return;
      if(index===0){setBpTrend(result.value.data);return;}
      const points=result.value.data.map(row=>{
        const date=new Date(row.recordedAt);
        const value=Number.parseFloat(index===0?(row.extra?.sys??row.value):row.value);
        return {label:`${pad2(date.getMonth()+1)}-${pad2(date.getDate())}`,recordedAt:row.recordedAt,value,time:date.getTime(),displayValue:index===0&&row.extra?.dia!=null?`${value}/${row.extra.dia}`:String(value)};
      }).filter(row=>Number.isFinite(row.value)&&Number.isFinite(row.time)).sort((a,b)=>a.time-b.time).slice(-10);
      setters[index](points);
    });
  }

  const filtered = records.filter((r) => r.type === filter);
  const dailyRecords = records.filter((r) => DAILY_TYPES.includes(r.type));
  const symptoms = records.filter((r) => r.type === 'symptom');
  const bpPoints = bloodPressurePoints(bpTrend, 60);
  const bpLatestByArm = ['左臂', '右臂', '未标注'].map(arm => ({ arm, point: [...bpPoints].reverse().find(point => point.arm === arm) })).filter(item => item.point);
  const trendMap = {
    bloodPressure: { data: bpTrend, color: colors.danger, label: '近30天血压趋势 (mmHg)' },
    bloodSugar: { data: bsTrend, color: colors.warning, label: '血糖 (mmol/L)' },
    sleep: { data: sleepTrend, color: '#7C3AED', label: '睡眠 (小时)' },
    heartRate: { data: heartTrend, color: '#DC2626', label: '心率 (次/分)' },
    weight: { data: weightTrend, color: '#0369A1', label: '体重 (kg)' },
  };

  return (
    <View style={{ minHeight: '100vh', backgroundColor: colors.background }}>
      <View style={{ padding: `${statusBarHeight + 12}px ${spacing.lg}px 0` }}>
        <Text style={{ fontSize: '20px', fontWeight: 800, color: colors.textPrimary, display: 'block', marginBottom: `${spacing.md}px` }}>健康档案</Text>

        <Text style={{ fontSize: '11px', fontWeight: 700, color: colors.textMuted, display: 'block', marginBottom: `${spacing.sm}px` }}>档案工具</Text>
        <View style={{ display: 'flex', gap: `${spacing.sm}px`, marginBottom: `${spacing.md}px` }}>
          {[
            { label: '上传报告', hint: '拍照或相册', icon: 'upload', url: '/pages/records/upload/index', primary: true },
            { label: '报告记录', hint: '查看原始资料', icon: 'file-text', url: '/pages/records/medical-reports/index' },
            { label: '健康报告', hint: '汇总与趋势', icon: 'bar-chart-3', url: '/pages/records/report/index' },
          ].map((action) => (
            <View key={action.label} onClick={() => Taro.navigateTo({ url: action.url })} style={{ flex: 1, minWidth: 0, backgroundColor: action.primary ? colors.primary : '#fff', borderRadius: `${radius.md}px`, border: `1px solid ${action.primary ? colors.primary : colors.border}`, padding: '13px 8px', textAlign: 'center', boxShadow: shadow.card }}>
              <View style={{ display: 'flex', justifyContent: 'center', marginBottom: '6px' }}><Icon name={action.icon} size={20} color={action.primary ? '#fff' : colors.primary} /></View>
              <Text style={{ fontSize: '12px', fontWeight: 700, color: action.primary ? '#fff' : colors.textPrimary, display: 'block' }}>{action.label}</Text>
              <Text style={{ fontSize: '9px', color: action.primary ? 'rgba(255,255,255,0.72)' : colors.textMuted, display: 'block', marginTop: '2px', whiteSpace: 'nowrap' }}>{action.hint}</Text>
            </View>
          ))}
        </View>

        {ibdEnabled && <View onClick={() => Taro.navigateTo({ url: '/pages/records/ibd-fc/index' })} style={{ backgroundColor: '#E7F4EE', border: `1px solid ${colors.primary}`, borderRadius: `${radius.md}px`, padding: '14px', marginBottom: `${spacing.md}px` }}>
          <Text style={{ display: 'block', color: colors.primary, fontSize: '15px', fontWeight: 700 }}>IBD · 粪便钙卫蛋白趋势</Text>
          <Text style={{ display: 'block', color: colors.textSecondary, fontSize: '12px', marginTop: '4px' }}>查看 FC 曲线与检测记录，录入新的检查结果 →</Text>
        </View>}

        <Text style={{ fontSize: '11px', fontWeight: 700, color: colors.textMuted, display: 'block', marginBottom: `${spacing.sm}px` }}>健康数据趋势</Text>

        {!!trendError&&<Text onClick={loadTrends} style={{display:'block',color:colors.danger,fontSize:'13px',marginBottom:'8px'}}>{trendError}</Text>}
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
            {trendTab === 'bloodPressure' ? <View style={{ marginBottom: '10px' }}>
              {bpLatestByArm.map(({ arm, point }) => <View key={arm} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                <Text style={{ fontSize: '13px', color: colors.textSecondary }}>{arm} · {formatRecordDate(point.recordedAt)}</Text>
                <Text style={{ fontSize: '15px', fontWeight: 700, color: arm === '右臂' ? colors.danger : colors.primary }}>{point.sys}/{point.dia} mmHg</Text>
              </View>)}
            </View> : trendMap[trendTab].data.length>0?<View style={{marginBottom:'10px'}}>
              <Text style={{fontSize:'26px',fontWeight:800,color:trendMap[trendTab].color,display:'block'}}>{trendMap[trendTab].data[trendMap[trendTab].data.length-1].displayValue} {TYPE_META[trendTab].unit}</Text>
              <Text style={{fontSize:'12px',color:colors.textSecondary,display:'block',marginTop:'4px'}}>最近记录：{formatRecordDate(trendMap[trendTab].data[trendMap[trendTab].data.length-1].recordedAt)}</Text>
            </View>:<Text style={{display:'block',color:colors.textSecondary}}>暂无{TYPE_META[trendTab].label}记录</Text>}
            {trendTab === 'bloodPressure' ? <BloodPressureChart records={bpTrend} height={105} /> : <TrendChart points={trendMap[trendTab].data} height={120} color={trendMap[trendTab].color} mode="line" />}
          </View>
        )}
      </View>

      <View style={{ padding: `0 ${spacing.lg}px` }}>
        <Text style={{ fontSize: '15px', fontWeight: 700, color: colors.textPrimary, display: 'block', marginBottom: `${spacing.sm}px` }}>身体成分</Text>
        {(() => {
          const history = [...bodyCompHistory];
          if (Object.keys(bodyComposition || {}).length) history.push({ ...bodyComposition, _isCurrent: true });
          const cards = BODY_METRICS.map((metric) => {
            const rows = history.filter(row => Number.isFinite(bodyNumber(row?.[metric.key])))
              .sort((a, b) => {
                if (a._isCurrent !== b._isCurrent) return a._isCurrent ? 1 : -1;
                return bodyDate(a).localeCompare(bodyDate(b));
              })
              .slice(-7);
            if (!rows.length) return null;
            const latest = rows[rows.length - 1];
            const points = rows.map(row => ({ label: bodyDate(row)?.slice(5) || '未标注', value: bodyNumber(row[metric.key]) }));
            const reference = [...rows].reverse().find(row => row?.[metric.referenceKey])?.[metric.referenceKey] || '未录入';
            return { metric, latest, points, reference };
          }).filter(Boolean);
          if (!cards.length) return <View style={{ backgroundColor: '#fff', borderRadius: `${radius.md}px`, padding: `${spacing.md}px`, marginBottom: `${spacing.lg}px`, boxShadow: shadow.card }}><Text style={{ fontSize: '13px', color: colors.textMuted }}>暂无身体成分数据</Text></View>;
          const active = cards.find((item) => item.metric.key === bodyTrendTab) || cards[0];
          return <View style={{ backgroundColor: '#fff', borderRadius: `${radius.md}px`, padding: `${spacing.md}px`, marginBottom: `${spacing.lg}px`, boxShadow: shadow.card }}>
            <View style={{ display: 'flex', gap: '7px', marginBottom: `${spacing.sm}px` }}>
              {cards.map(({ metric }) => <View key={metric.key} onClick={() => setBodyTrendTab(metric.key)} style={{ flex: 1, minWidth: 0, textAlign: 'center', padding: '6px 2px', borderRadius: `${radius.full}px`, backgroundColor: active.metric.key === metric.key ? colors.primary : colors.background, border: `1px solid ${active.metric.key === metric.key ? colors.primary : colors.border}` }}><Text style={{ fontSize: '11px', color: active.metric.key === metric.key ? '#fff' : colors.textSecondary }}>{metric.key === 'weight' ? '体重' : metric.label}</Text></View>)}
            </View>
            <View style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: `${spacing.sm}px` }}>
              <Text style={{ fontSize: '14px', fontWeight: 700, color: colors.textPrimary }}>{active.metric.label}</Text>
              <Text style={{ fontSize: '18px', fontWeight: 800, color: active.metric.color }}>{bodyNumber(active.latest[active.metric.key])} {active.metric.unit}</Text>
            </View>
            <TrendChart points={active.points} height={118} color={active.metric.color} mode="line" />
            <Text style={{ fontSize: '11px', color: colors.textMuted, marginTop: '6px', display: 'block' }}>最新检测：{bodyDate(active.latest) || '未标注'} · 参考范围：{active.reference}</Text>
          </View>;
        })()}
      </View>
      <View style={{ height: '20px' }} />
    </View>
  );
}

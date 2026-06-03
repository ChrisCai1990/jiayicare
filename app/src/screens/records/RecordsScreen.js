import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, SafeAreaView, Dimensions, Modal, TextInput,
  RefreshControl, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Polyline, Circle, Path, Line, Defs, LinearGradient, Stop } from 'react-native-svg';
import { colors, spacing, radius, shadow } from '../../theme';
import { mockBloodPressureData, mockBloodSugarData } from '../../data/mockData';
import { recordsAPI, userAPI, checkupAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

const { width: W } = Dimensions.get('window');
const CHART_INNER_W = W - spacing.lg * 2 - spacing.md * 2;

// ── 指标类型配置 ──────────────────────────────────────────────────
const CHART_TYPES = [
  {
    key: 'bloodPressure', label: '血压', unit: 'mmHg',
    color: '#DC3545', icon: 'heart-outline',
    // 第二曲线：舒张压（蓝色）
    color2: '#0077B6',
    getVal2: (r) => r.dia ?? r.extra?.dia ?? parseFloat(String(r.value).split('/')[1]) ?? 0,
    series2Label: '舒张压',
    refLines: [{ val: 140, color: '#DC3545', label: '收缩压上限' }, { val: 90, color: '#22A06B', label: '舒张压上限' }],
    minY: 40, maxY: 180,
    getVal: (r) => r.sys ?? r.extra?.sys ?? parseFloat(String(r.value).split('/')[0]) ?? 0,
    series1Label: '收缩压',
    getDisplay: (r) => r.sys && r.dia ? `${r.sys}/${r.dia}` : (r.extra?.sys && r.extra?.dia ? `${r.extra.sys}/${r.extra.dia}` : r.value ?? '-'),
    mockData: mockBloodPressureData,
  },
  {
    key: 'bloodSugar', label: '血糖', unit: 'mmol/L',
    color: '#D97706', icon: 'water-outline',
    // 第二曲线：餐后2小时（橙红色）
    color2: '#DC3545',
    series1Label: '空腹',
    series2Label: '餐后2h',
    // 数据按 mealType 拆分（见 splitBloodSugar）
    splitBySeries: true,
    refLines: [{ val: 6.1, color: '#22A06B', label: '正常上限(空腹)' }, { val: 3.9, color: '#0077B6', label: '低血糖线' }],
    minY: 2, maxY: 14,
    getVal: (r) => parseFloat(r.value ?? r.extra?.value ?? 0),
    getDisplay: (r) => {
      const v = String(r.value ?? '-');
      const mt = r.extra?.mealType || (r.note && r.note.includes('餐后') ? '餐后2小时' : '');
      return mt ? `${v} (${mt === '餐后2小时' ? '餐后' : mt})` : v;
    },
    mockData: mockBloodSugarData,
  },
  {
    key: 'heartRate', label: '心率', unit: '次/分',
    color: '#7C3AED', icon: 'pulse-outline',
    refLines: [{ val: 100, color: '#DC3545', label: '偏快 ≥100次/分' }, { val: 60, color: '#0077B6', label: '偏慢 ≤60次/分' }],
    minY: 40, maxY: 140,
    getVal: (r) => parseFloat(r.value ?? 0),
    getDisplay: (r) => String(r.value ?? '-'),
    mockData: [],
  },
  {
    key: 'weight', label: '体重', unit: 'kg',
    color: '#1E6B50', icon: 'barbell-outline',
    refLines: [],
    minY: 40, maxY: 120,
    getVal: (r) => parseFloat(r.value ?? 0),
    getDisplay: (r) => String(r.value ?? '-'),
    mockData: [],
  },
  {
    key: 'sleep', label: '睡眠', unit: '小时',
    color: '#7B68EE', icon: 'moon-outline',
    refLines: [{ val: 9, color: '#22A06B', label: '建议上限 9小时' }, { val: 7, color: '#D97706', label: '建议下限 7小时' }],
    minY: 0, maxY: 12,
    getVal: (r) => parseFloat(r.value ?? 0),
    getDisplay: (r) => r.value != null ? `${r.value}` : '-',
    mockData: [],
  },
];

// ── 个人档案字段 ──────────────────────────────────────────────────
const PROFILE_FIELDS = [
  { key: 'bloodType',     label: '血型',     icon: 'water',              placeholder: '如：A 型 Rh+' },
  { key: 'drugAllergy',   label: '药物过敏史', icon: 'medical',            placeholder: '如：青霉素类、无' },
  { key: 'foodAllergy',   label: '食物过敏史', icon: 'restaurant-outline',  placeholder: '如：海鲜、无' },
  { key: 'pastHistory',   label: '既往史',    icon: 'time-outline',        placeholder: '如：高血压 (2020年)' },
  { key: 'medicHistory',  label: '用药史',    icon: 'medkit-outline',      placeholder: '如：氨氯地平' },
  { key: 'familyHistory', label: '家族史',    icon: 'people-outline',      placeholder: '如：父亲：高血压' },
  { key: 'surgeryHistory',     label: '手术史',    icon: 'cut-outline',        placeholder: '如：无' },
  { key: 'infectiousHistory',  label: '传染病史',  icon: 'alert-circle-outline', placeholder: '如：乙肝（已治愈）、无' },
  { key: 'maritalHistory',     label: '婚育史',    icon: 'people-outline',       placeholder: '如：已婚，育有1子；未婚' },
];

const DEFAULT_PROFILE = {
  bloodType:     'A 型 Rh+',
  drugAllergy:   '青霉素类',
  foodAllergy:   '无',
  pastHistory:   '高血压 (2020年)',
  medicHistory:  '氨氯地平、他汀类',
  familyHistory: '父亲：高血压、冠心病',
  surgeryHistory:     '无',
  infectiousHistory:  '无',
  maritalHistory:     '已婚，育有1子',
};

// ── localStorage 工具 ─────────────────────────────────────────────
const PROFILE_KEY = 'jy_health_profile';
const EMPTY_PROFILE = {
  bloodType: '', drugAllergy: '', foodAllergy: '',
  pastHistory: '', medicHistory: '', familyHistory: '', surgeryHistory: '', infectiousHistory: '', maritalHistory: '',
  menstrualHistory: '', reproductiveHistory: '',
};
function loadProfileFromStorage() {
  try { return JSON.parse(localStorage.getItem(PROFILE_KEY)) || null; }
  catch { return null; }
}
function saveProfileToStorage(p) {
  try { localStorage.setItem(PROFILE_KEY, JSON.stringify(p)); } catch {}
}

// ── 状态标签配置 ─────────────────────────────────────────────────
const STATUS_CFG = {
  normal:  { label: '正常', bg: '#E8F5EF', color: '#1E6B50' },
  warning: { label: '偏高', bg: '#FEF3E2', color: '#D97706' },
  danger:  { label: '偏高', bg: '#FDECEA', color: '#DC3545' },
  low:     { label: '偏低', bg: '#EBF5FB', color: '#0077B6' },
};
// 睡眠专属状态标签
const SLEEP_STATUS_CFG = {
  normal:  { label: '正常',   bg: '#E8F5EF', color: '#1E6B50' },
  warning: { label: '偏高',   bg: '#FEF3E2', color: '#D97706' },
  low:     { label: '睡眠不足', bg: '#FDECEA', color: '#DC3545' },
};

// ── 工具：日期格式化 ──────────────────────────────────────────────
function fmtDate(str, period) {
  try {
    const d = new Date(str);
    if (period === '周') return `${d.getMonth() + 1}/${d.getDate()}`;
    if (period === '月') return `${d.getDate()}日`;
    return `${d.getMonth() + 1}月`;
  } catch { return str; }
}

// ── 趋势图辅助：绘制单条折线 ─────────────────────────────────────
function SeriesLine({ pts, color, gradId, chartH, showArea }) {
  if (pts.length === 0) return null;
  const polylineStr = pts.map(p => `${p.x},${p.y}`).join(' ');
  const areaPath = pts.length > 1
    ? `M ${pts[0].x},${chartH} ` + pts.map(p => `L ${p.x},${p.y}`).join(' ') + ` L ${pts[pts.length - 1].x},${chartH} Z`
    : '';
  return (
    <>
      {showArea && pts.length > 1 && <Path d={areaPath} fill={`url(#${gradId})`} />}
      {pts.length > 1 && (
        <Polyline points={polylineStr} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      )}
      {pts.map((p, i) => {
        const isLast = i === pts.length - 1;
        return (
          <Circle key={i} cx={p.x} cy={p.y} r={isLast ? 4.5 : 3}
            fill={isLast ? color : colors.white} stroke={color} strokeWidth={isLast ? 0 : 1.5} />
        );
      })}
    </>
  );
}

// ── 趋势图组件（折线图，支持双曲线）──────────────────────────────
function TrendChart({ data, data2, typeCfg, period }) {
  if (!data || data.length === 0) {
    return (
      <View style={styles.chartEmpty}>
        <Ionicons name="trending-up-outline" size={32} color={colors.textDisabled} />
        <Text style={styles.chartEmptyText}>暂无数据</Text>
      </View>
    );
  }

  const CHART_H   = 120;
  const Y_LABEL_W = 28;
  const LINE_W    = CHART_INNER_W - Y_LABEL_W;
  const { minY, maxY, refLines, color, getVal, color2, getVal2, series1Label, series2Label } = typeCfg;
  const hasDualSeries = !!(color2 && (getVal2 || data2));
  const RANGE = maxY - minY;
  const toY   = (v) => CHART_H - ((Math.min(Math.max(v, minY), maxY) - minY) / RANGE) * CHART_H;

  // 系列1（主线）用完整 data 的 x 坐标
  const allData = hasDualSeries && data2 ? [...data, ...(data2 || [])].sort((a,b) => new Date(a.recordedAt||a.date) - new Date(b.recordedAt||b.date)) : data;
  const toX = (i, total) => total <= 1 ? LINE_W / 2 : (i / (total - 1)) * LINE_W;

  // 系列1
  const pts1 = data.map((d, i) => ({ x: toX(i, data.length), y: toY(getVal(d)), d }));

  // 系列2（如果有）
  let pts2 = [];
  if (hasDualSeries) {
    if (data2 && data2.length > 0) {
      // 血糖分离模式：data2 有独立数组，用自己的 x 轴
      pts2 = data2.map((d, i) => ({ x: toX(i, data2.length), y: toY(getVal(d)), d }));
    } else if (getVal2) {
      // 血压模式：同一数组，用 getVal2
      pts2 = data.map((d, i) => ({ x: toX(i, data.length), y: toY(getVal2(d)), d }));
    }
  }

  // X 轴标签用系列1的 data
  const xLabelIndices = data.length <= 7
    ? data.map((_, i) => i)
    : [0, Math.floor((data.length - 1) / 2), data.length - 1];

  return (
    <View>
      <View style={{ flexDirection: 'row' }}>
        {/* 折线图 SVG */}
        <Svg width={LINE_W} height={CHART_H}>
          <Defs>
            <LinearGradient id="lineGrad1" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={color} stopOpacity="0.22" />
              <Stop offset="1" stopColor={color} stopOpacity="0.01" />
            </LinearGradient>
            {hasDualSeries && (
              <LinearGradient id="lineGrad2" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={color2} stopOpacity="0.18" />
                <Stop offset="1" stopColor={color2} stopOpacity="0.01" />
              </LinearGradient>
            )}
          </Defs>

          {/* 参考虚线 */}
          {refLines.map((ref, i) => (
            <Line key={i} x1={0} y1={toY(ref.val)} x2={LINE_W} y2={toY(ref.val)}
              stroke={ref.color} strokeWidth={1} strokeDasharray="5,4" />
          ))}

          {/* 系列1（主线） */}
          <SeriesLine pts={pts1} color={color} gradId="lineGrad1" chartH={CHART_H} showArea={!hasDualSeries} />

          {/* 系列2（如有）*/}
          {hasDualSeries && pts2.length > 0 && (
            <SeriesLine pts={pts2} color={color2} gradId="lineGrad2" chartH={CHART_H} showArea={false} />
          )}
        </Svg>

        {/* Y 轴标签 */}
        <View style={{ width: Y_LABEL_W, height: CHART_H, justifyContent: 'space-between', paddingLeft: 4 }}>
          <Text style={styles.yLabel}>{maxY}</Text>
          <Text style={styles.yLabel}>{Math.round((maxY + minY) / 2)}</Text>
          <Text style={styles.yLabel}>{minY}</Text>
        </View>
      </View>

      {/* X 轴标签 */}
      <View style={{ width: LINE_W, height: 16, position: 'relative' }}>
        {xLabelIndices.map((idx) => {
          const x = toX(idx, data.length);
          return (
            <Text key={idx} style={[styles.xLabel, { position: 'absolute', left: x - 16, width: 32, textAlign: 'center' }]}>
              {fmtDate(data[idx].recordedAt || data[idx].date, period)}
            </Text>
          );
        })}
      </View>

      {/* 图例 */}
      <View style={styles.legend}>
        {hasDualSeries && (
          <>
            <View style={styles.legendItem}>
              <View style={[styles.legendLine, { backgroundColor: color }]} />
              <Text style={styles.legendText}>{series1Label}</Text>
            </View>
            {pts2.length > 0 && (
              <View style={styles.legendItem}>
                <View style={[styles.legendLine, { backgroundColor: color2 }]} />
                <Text style={styles.legendText}>{series2Label}</Text>
              </View>
            )}
          </>
        )}
        {refLines.map((ref, i) => (
          <View key={i} style={styles.legendItem}>
            <View style={[styles.legendLine, { backgroundColor: ref.color }]} />
            <Text style={styles.legendText}>{ref.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ── 历史记录条目 ──────────────────────────────────────────────────
function RecordRow({ record, typeCfg, isLast }) {
  const stMap = typeCfg.key === 'sleep' ? SLEEP_STATUS_CFG : STATUS_CFG;
  const st  = stMap[record.status] || stMap.normal;
  const val = typeCfg.getDisplay(record);
  const dt  = record.recordedAt
    ? new Date(record.recordedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '-';
  return (
    <View style={[styles.recordRow, !isLast && styles.recordRowBorder]}>
      <View style={styles.recordLeft}>
        <Text style={styles.recordVal}>{val}</Text>
        <Text style={styles.recordUnit}>{typeCfg.unit}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.recordDate}>{dt}</Text>
        {record.extra?.sleepTime && record.extra?.wakeTime
          ? <Text style={styles.recordNote}>{record.extra.sleepTime} 入睡 → {record.extra.wakeTime} 醒来</Text>
          : record.note ? <Text style={styles.recordNote}>{record.note}</Text> : null
        }
      </View>
      <View style={[styles.statusBadge, { backgroundColor: st.bg }]}>
        <Text style={[styles.statusText, { color: st.color }]}>{st.label}</Text>
      </View>
    </View>
  );
}

// ── 指标卡片 ──────────────────────────────────────────────────────
function MetricCard({ metric, onPress }) {
  const st = STATUS_CFG[metric.status] || STATUS_CFG.normal;
  return (
    <TouchableOpacity style={styles.metricCard} activeOpacity={0.8} onPress={onPress}>
      <View style={styles.metricTop}>
        <View style={[styles.metricIconWrap, { backgroundColor: metric.color + '18' }]}>
          <Ionicons name={metric.icon} size={15} color={metric.color} />
        </View>
        <Text style={styles.metricLabel}>{metric.label}</Text>
      </View>
      <View style={styles.metricValueRow}>
        <Text style={styles.metricValue}>{metric.value}</Text>
        <Text style={styles.metricUnit}>{metric.unit}</Text>
      </View>
      <View style={[styles.statusBadge, { backgroundColor: st.bg }]}>
        <Text style={[styles.statusText, { color: st.color }]}>{st.label}</Text>
      </View>
      {metric.time ? <Text style={styles.metricTime}>{metric.time}</Text> : null}
    </TouchableOpacity>
  );
}

// ── 编辑档案 Modal ────────────────────────────────────────────────
function ProfileEditModal({ visible, profile, onSave, onClose }) {
  const [draft, setDraft] = useState({ ...profile });

  useEffect(() => {
    if (visible) setDraft({ ...profile });
  }, [visible, profile]);

  const setField = (key, val) => setDraft(prev => ({ ...prev, [key]: val }));

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.editOverlay}>
          <View style={styles.editCard}>
            <View style={styles.editHandle} />
            <View style={styles.editHeader}>
              <Text style={styles.editTitle}>编辑健康档案</Text>
              <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
              {PROFILE_FIELDS.map((field) => (
                <View key={field.key} style={styles.editField}>
                  <View style={styles.editFieldLabel}>
                    <Ionicons name={field.icon} size={14} color={colors.primary} style={{ marginRight: 6 }} />
                    <Text style={styles.editFieldLabelText}>{field.label}</Text>
                  </View>
                  <TextInput
                    style={styles.editInput}
                    value={draft[field.key] || ''}
                    onChangeText={(v) => setField(field.key, v)}
                    placeholder={field.placeholder}
                    placeholderTextColor={colors.textDisabled}
                  />
                </View>
              ))}
              <View style={{ height: 20 }} />
            </ScrollView>
            <TouchableOpacity style={styles.saveBtn} onPress={() => onSave(draft)} activeOpacity={0.85}>
              <Ionicons name="checkmark-circle" size={18} color={colors.white} />
              <Text style={styles.saveBtnText}>保存档案</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── 主页面 ────────────────────────────────────────────────────────
export default function RecordsScreen({ navigation }) {
  const { isDemo, user: authUser } = useAuth();
  const [loading, setLoading]           = useState(true);
  const [refreshing, setRefreshing]     = useState(false);
  const [latestVitals, setLatestVitals] = useState(null);
  const [latestRecords, setLatestRecords] = useState({}); // { type: [records] }

  // 趋势图
  const [chartType, setChartType]     = useState('bloodPressure');
  const [chartPeriod, setChartPeriod] = useState('周');
  const [chartData, setChartData]     = useState([]);
  const [chartData2, setChartData2]   = useState([]); // 血糖：餐后2h
  const [chartData3, setChartData3]   = useState([]); // 血糖：睡前
  const [chartLoading, setChartLoading] = useState(false);

  // 血糖自定义参考范围（文档#22，存 localStorage）
  const SUGAR_RANGE_KEY = 'jy_sugar_ranges';
  const SUGAR_RANGE_DEFAULT = {
    fasting:  { min: 3.9, max: 6.1 },
    postMeal: { min: 3.9, max: 7.8 },
    bedtime:  { min: 3.9, max: 7.8 },
  };
  const loadSugarRanges = () => {
    try { return JSON.parse(localStorage.getItem(SUGAR_RANGE_KEY)) || SUGAR_RANGE_DEFAULT; }
    catch { return SUGAR_RANGE_DEFAULT; }
  };
  const [sugarRanges, setSugarRanges] = useState(loadSugarRanges);
  const saveSugarRanges = (ranges) => {
    setSugarRanges(ranges);
    try { localStorage.setItem(SUGAR_RANGE_KEY, JSON.stringify(ranges)); } catch {}
  };

  // 历史记录
  const [historyData, setHistoryData] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // 个人档案
  const [profile, setProfile]         = useState(EMPTY_PROFILE);
  const [editingProfile, setEditingProfile] = useState(false);
  const [checkupPlan, setCheckupPlan] = useState(null);

  // 生活方式
  const [lifestyle, setLifestyle]         = useState({});
  const [editingLifestyle, setEditingLifestyle] = useState(false);
  const [lifestyleDraft, setLifestyleDraft] = useState({});

  const currentTypeCfg = CHART_TYPES.find(t => t.key === chartType) || CHART_TYPES[0];
  const PERIOD_TABS = ['周', '月', '年'];

  // ── 加载档案：先读 localStorage，再从服务器合并 ─────────────────
  useEffect(() => {
    // 先用本地缓存快速渲染，getMe() 在 loadDashboard 里统一调用，不重复请求
    const local = loadProfileFromStorage();
    const fallback = isDemo ? DEFAULT_PROFILE : EMPTY_PROFILE;
    setProfile(local || fallback);
  }, [isDemo]);

  // ── 加载仪表板数据（三个接口并行，getMe 只调一次）────────────────
  const loadDashboard = useCallback(async () => {
    const [dashRes, meRes, checkupRes] = await Promise.allSettled([
      userAPI.getDashboard(),
      userAPI.getMe(),
      checkupAPI.get(),
    ]);

    // 最新指标
    if (dashRes.status === 'fulfilled') {
      const vitals = dashRes.value?.data?.latestVitals || dashRes.value?.latestVitals;
      if (vitals) setLatestVitals(vitals);
    }
    // 生活方式 + 健康档案（合并到一次 getMe）
    if (meRes.status === 'fulfilled') {
      const data = meRes.value?.data;
      if (data?.lifestyle) setLifestyle(data.lifestyle);
      if (data?.healthProfile && Object.values(data.healthProfile).some(v => v)) {
        const local = loadProfileFromStorage();
        const fallback = isDemo ? DEFAULT_PROFILE : EMPTY_PROFILE;
        const merged = { ...(local || fallback), ...data.healthProfile };
        setProfile(merged);
        saveProfileToStorage(merged);
      }
    }
    // 年度复查计划
    if (checkupRes.status === 'fulfilled' && checkupRes.value?.data) {
      setCheckupPlan(checkupRes.value.data);
    }
  }, [isDemo]);

  // ── 加载趋势图数据 ────────────────────────────────────────────────
  const loadChart = useCallback(async (type, period) => {
    setChartLoading(true);
    setChartData2([]);
    try {
      const days = period === '周' ? 7 : period === '月' ? 30 : 365;
      const res = await recordsAPI.list({ type, days, limit: 50 });
      if (res?.success && res.data?.length > 0) {
        const sorted = [...res.data].sort((a, b) => new Date(a.recordedAt) - new Date(b.recordedAt));
        // 血糖：按 mealType 拆成空腹 / 餐后2小时 / 睡前 三条独立系列（文档#22）
        if (type === 'bloodSugar') {
          const fasting  = sorted.filter(r => !r.extra?.mealType || r.extra.mealType === '空腹' || r.note?.includes('空腹'));
          const postMeal = sorted.filter(r => r.extra?.mealType === '餐后2小时' || r.note?.includes('餐后'));
          const bedtime  = sorted.filter(r => r.extra?.mealType === '睡前' || r.note?.includes('睡前'));
          setChartData(fasting.length > 0 ? fasting : sorted);
          setChartData2(postMeal);
          setChartData3(bedtime);
        } else {
          setChartData(sorted);
          setChartData3([]);
        }
      } else {
        const cfg = CHART_TYPES.find(t => t.key === type);
        setChartData(isDemo ? (cfg?.mockData || []) : []);
      }
    } catch {
      const cfg = CHART_TYPES.find(t => t.key === type);
      setChartData(isDemo ? (cfg?.mockData || []) : []);
    } finally {
      setChartLoading(false);
    }
  }, [isDemo]);

  // ── 加载历史记录 ──────────────────────────────────────────────────
  const loadHistory = useCallback(async (type) => {
    setHistoryLoading(true);
    try {
      const res = await recordsAPI.list({ type, limit: 15 });
      if (res?.success && res.data?.length > 0) {
        const sorted = [...res.data].sort((a, b) => new Date(b.recordedAt) - new Date(a.recordedAt));
        setHistoryData(sorted);
      } else {
        setHistoryData([]);
      }
    } catch {
      setHistoryData([]);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  // ── 初始加载 ──────────────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    await Promise.allSettled([
      loadDashboard(),
      loadChart(chartType, chartPeriod),
      loadHistory(chartType),
    ]);
    setLoading(false);
    setRefreshing(false);
  }, [loadDashboard, loadChart, loadHistory, chartType, chartPeriod]);

  useEffect(() => { loadAll(); }, []);

  // 从EditProfile返回时刷新档案数据
  useEffect(() => {
    const unsub = navigation.addListener('focus', () => {
      loadDashboard();
    });
    return unsub;
  }, [navigation, loadDashboard]);

  // ── 切换图表类型 ──────────────────────────────────────────────────
  const switchChartType = (type) => {
    setChartType(type);
    setChartData([]);
    setHistoryData([]);
    loadChart(type, chartPeriod);
    loadHistory(type);
  };

  // ── 切换时间段 ────────────────────────────────────────────────────
  const switchPeriod = (period) => {
    setChartPeriod(period);
    loadChart(chartType, period);
  };

  // ── 保存档案 ──────────────────────────────────────────────────────
  const saveProfile = async (draft) => {
    setProfile(draft);
    saveProfileToStorage(draft);
    setEditingProfile(false);
    try {
      await userAPI.updateMe({ healthProfile: draft });
    } catch {}
  };

  // ── 保存生活方式 ──────────────────────────────────────────────────
  const saveLifestyle = async () => {
    setLifestyle(lifestyleDraft);
    setEditingLifestyle(false);
    try {
      await userAPI.updateMe({ lifestyle: lifestyleDraft });
    } catch {}
  };

  // ── 构建 METRICS 数组（最新指标）────────────────────────────────
  const bp = latestVitals?.bloodPressure;
  const bs = latestVitals?.bloodSugar;
  const hr = latestVitals?.heartRate;
  const wt = latestVitals?.weight;
  const sl = latestVitals?.sleep;

  const METRICS = [
    {
      key: 'bloodPressure', label: '血压', unit: 'mmHg', icon: 'heart-outline', color: '#DC3545',
      value: bp ? (bp.sys && bp.dia ? `${bp.sys}/${bp.dia}` : bp.value || '--') : '--',
      status: bp?.status || 'normal',
      time: bp?.recordedAt ? new Date(bp.recordedAt).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : null,
    },
    {
      key: 'bloodSugar', label: '空腹血糖', unit: 'mmol/L', icon: 'water-outline', color: '#D97706',
      value: bs?.value != null ? String(bs.value) : '--',
      status: bs?.status || 'normal',
      time: bs?.recordedAt ? new Date(bs.recordedAt).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }) : null,
    },
    {
      key: 'heartRate', label: '心率', unit: '次/分', icon: 'pulse-outline', color: '#7C3AED',
      value: hr?.value != null ? String(hr.value) : '--',
      status: hr?.status || 'normal',
      time: hr?.recordedAt ? new Date(hr.recordedAt).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }) : null,
    },
    {
      key: 'weight', label: '体重', unit: 'kg', icon: 'barbell-outline', color: '#1E6B50',
      value: wt?.value != null ? String(wt.value) : '--',
      status: wt?.status || 'normal',
      time: wt?.recordedAt ? new Date(wt.recordedAt).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }) : null,
    },
    {
      key: 'sleep', label: '睡眠时长', unit: '小时', icon: 'moon-outline', color: '#7B68EE',
      value: sl?.value != null ? String(sl.value) : '--',
      status: sl?.status || 'normal',
      time: sl?.extra?.sleepTime && sl?.extra?.wakeTime
        ? `${sl.extra.sleepTime} 入睡`
        : sl?.recordedAt ? new Date(sl.recordedAt).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }) : null,
    },
  ];

  const today = new Date().toISOString().slice(0, 10);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={[styles.header, { borderBottomWidth: 1, borderBottomColor: colors.borderLight }]}>
          <Text style={styles.pageTitle}>健康档案</Text>
        </View>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>加载中…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* ── Header ──────────────────────────────────────────────── */}
      <View style={styles.header}>
        <View>
          <Text style={styles.pageTitle}>健康档案</Text>
          <Text style={styles.syncInfo}>最后同步：{today}</Text>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadAll(); }} tintColor={colors.primary} />
        }
      >
        {/* ── 基本信息 ──────────────────────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <Ionicons name="person-outline" size={17} color={colors.primary} />
              <Text style={styles.sectionTitle}>基本信息</Text>
            </View>
            <TouchableOpacity style={styles.editBtn} onPress={() => navigation.navigate('EditProfile')}>
              <Ionicons name="pencil-outline" size={13} color={colors.primary} />
              <Text style={styles.editBtnText}>编辑</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.profileCard}>
            {[
              { label: '姓名',   value: authUser?.name,                               icon: 'person-outline' },
              { label: '性别',   value: authUser?.gender,                             icon: 'male-female-outline' },
              { label: '年龄',   value: authUser?.age ? `${authUser.age} 岁` : null,  icon: 'calendar-outline' },
              { label: '身高',   value: authUser?.height ? `${authUser.height} cm` : null, icon: 'resize-outline' },
              { label: '体重',   value: authUser?.weight ? `${authUser.weight} kg` : null, icon: 'barbell-outline' },
              ...(authUser?.gender === '女' ? [
                { label: '月经史', value: profile.menstrualHistory, icon: 'medical-outline' },
              ] : []),
            ].map((item, i, arr) => (
              <View key={item.label} style={[styles.profileRow, i < arr.length - 1 && styles.profileRowBorder]}>
                <View style={styles.profileRowLeft}>
                  <Ionicons name={item.icon} size={13} color={colors.primary} style={{ marginRight: 6 }} />
                  <Text style={styles.profileRowLabel}>{item.label}</Text>
                </View>
                <Text style={[styles.profileRowValue, !item.value && { color: colors.textMuted }]} numberOfLines={1}>
                  {item.value || '未填写'}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── 基础健康档案 ─────────────────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <Ionicons name="person-circle-outline" size={17} color={colors.primary} />
              <Text style={styles.sectionTitle}>基础健康档案</Text>
            </View>
            <TouchableOpacity style={styles.editBtn} onPress={() => navigation.navigate('EditProfile')}>
              <Ionicons name="pencil-outline" size={13} color={colors.primary} />
              <Text style={styles.editBtnText}>编辑</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.profileCard}>
            {PROFILE_FIELDS.map((field, i) => (
              <View key={field.key} style={[styles.profileRow, i < PROFILE_FIELDS.length - 1 && styles.profileRowBorder]}>
                <View style={styles.profileRowLeft}>
                  <Ionicons name={field.icon} size={13} color={colors.primary} style={{ marginRight: 6 }} />
                  <Text style={styles.profileRowLabel}>{field.label}</Text>
                </View>
                <Text style={styles.profileRowValue} numberOfLines={1}>{profile[field.key] || '未填写'}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── 生活方式 ─────────────────────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <Ionicons name="sunny-outline" size={17} color="#D97706" />
              <Text style={styles.sectionTitle}>生活方式</Text>
            </View>
            <TouchableOpacity style={styles.editBtn} onPress={() => { setLifestyleDraft(lifestyle); setEditingLifestyle(true); }}>
              <Ionicons name="pencil-outline" size={13} color={colors.primary} />
              <Text style={styles.editBtnText}>编辑</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.profileCard}>
            {[
              { key: 'diet',     label: '饮食',              icon: 'nutrition-outline',  color: '#059669' },
              { key: 'exercise', label: '运动',              icon: 'fitness-outline',    color: '#0077B6' },
              { key: 'sleep',    label: '睡眠',              icon: 'moon-outline',       color: '#4F46E5' },
              { key: 'water',    label: '饮水',              icon: 'water-outline',      color: '#0EA5E9' },
              { key: 'alcohol',  label: '饮酒',              icon: 'wine-outline',       color: '#9D174D' },
              { key: 'smoking',  label: '吸烟',              icon: 'flame-outline',      color: '#B45309' },
              { key: 'bowel',    label: '排便',              icon: 'list-outline',       color: '#7C5C3D' },
              { key: 'mood',     label: '情绪（初始记录）',  icon: 'happy-outline',      color: '#F59E0B', initialOnly: true },
            ].map((item, i, arr) => (
              <View key={item.key} style={[styles.profileRow, i < arr.length - 1 && styles.profileRowBorder]}>
                <View style={styles.profileRowLeft}>
                  <Ionicons name={item.icon} size={13} color={item.color} style={{ marginRight: 6 }} />
                  <Text style={styles.profileRowLabel}>{item.label}</Text>
                </View>
                <Text style={[styles.profileRowValue, !lifestyle[item.key] && { color: colors.textMuted }]} numberOfLines={1}>
                  {lifestyle[item.key] || '未填写'}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── 年度复查计划 ─────────────────────────────────────── */}
        {checkupPlan && checkupPlan.items?.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleRow}>
                <Ionicons name="calendar-outline" size={17} color={colors.info} />
                <Text style={styles.sectionTitle}>{checkupPlan.title || '年度复查计划'}</Text>
              </View>
              <Text style={{ fontSize: 12, color: colors.textMuted }}>
                {checkupPlan.items.filter(it => it.status === 'done').length}/{checkupPlan.items.length} 已完成
              </Text>
            </View>
            {checkupPlan.note ? (
              <Text style={{ fontSize: 12, color: colors.textSecondary, marginBottom: spacing.sm, marginHorizontal: spacing.sm }}>
                {checkupPlan.note}
              </Text>
            ) : null}
            <View style={styles.profileCard}>
              {checkupPlan.items.map((item, i, arr) => {
                const isDone    = item.status === 'done';
                const isOverdue = item.status === 'overdue';
                return (
                  <View key={item._id || i} style={[styles.profileRow, i < arr.length - 1 && styles.profileRowBorder]}>
                    <View style={styles.profileRowLeft}>
                      <Ionicons
                        name={isDone ? 'checkmark-circle' : isOverdue ? 'alert-circle-outline' : 'ellipse-outline'}
                        size={15}
                        color={isDone ? colors.success : isOverdue ? colors.danger : colors.textMuted}
                        style={{ marginRight: 6 }}
                      />
                      <Text style={[styles.profileRowLabel, isDone && { textDecorationLine: 'line-through', color: colors.textMuted }]}>
                        {item.name}
                      </Text>
                    </View>
                    <Text style={{ fontSize: 12, color: isDone ? colors.success : isOverdue ? colors.danger : colors.textMuted }}>
                      {isDone ? '已完成' : isOverdue ? '已逾期' : (item.targetDate || '待安排')}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* ── 专项筛查入口 ─────────────────────────────────────── */}
        <TouchableOpacity
          style={styles.screeningEntry}
          onPress={() => navigation.navigate('SpecialScreening')}
          activeOpacity={0.8}
        >
          <View style={styles.screeningEntryLeft}>
            <View style={styles.screeningEntryIcon}>
              <Ionicons name="flask-outline" size={20} color={colors.white} />
            </View>
            <View>
              <Text style={styles.screeningEntryTitle}>专项筛查</Text>
              <Text style={styles.screeningEntrySub}>肿瘤·心脑血管·慢性病·健康促进</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.primary} />
        </TouchableOpacity>

        {/* ── 最新健康指标 ─────────────────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <Ionicons name="stats-chart-outline" size={17} color={colors.primary} />
              <Text style={styles.sectionTitle}>最新健康指标</Text>
            </View>
          </View>
          <View style={styles.metricsGrid}>
            {METRICS.map((m) => (
              <MetricCard
                key={m.key}
                metric={m}
                onPress={() => {
                  const chartable = CHART_TYPES.find(t => t.key === m.key);
                  if (chartable) switchChartType(m.key);
                }}
              />
            ))}
          </View>
        </View>

        {/* ── 趋势图 ───────────────────────────────────────────── */}
        <View style={styles.section}>
          {/* 指标类型选择 */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chartTypeScroll}
            contentContainerStyle={styles.chartTypeContent}>
            {CHART_TYPES.map((t) => (
              <TouchableOpacity
                key={t.key}
                style={[styles.chartTypeChip, chartType === t.key && { borderColor: t.color, backgroundColor: t.color + '12' }]}
                onPress={() => switchChartType(t.key)}
              >
                <Ionicons name={t.icon} size={14} color={chartType === t.key ? t.color : colors.textMuted} />
                <Text style={[styles.chartTypeText, chartType === t.key && { color: t.color, fontWeight: '700' }]}>
                  {t.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <View style={styles.chartCard}>
            {/* 图表标题 + 时间段 */}
            <View style={styles.chartHeader}>
              <View>
                <Text style={styles.chartTitle}>{currentTypeCfg.label}趋势</Text>
                <Text style={styles.chartSubtitle}>{currentTypeCfg.unit}</Text>
              </View>
              <View style={styles.periodRow}>
                {PERIOD_TABS.map(p => (
                  <TouchableOpacity
                    key={p}
                    style={[styles.periodBtn, chartPeriod === p && styles.periodBtnActive]}
                    onPress={() => switchPeriod(p)}
                  >
                    <Text style={[styles.periodText, chartPeriod === p && styles.periodTextActive]}>{p}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* ── 图表区域（血压/血糖分图，其余单图）────────────── */}
            {chartLoading ? (
              <View style={styles.chartEmpty}><ActivityIndicator color={colors.primary} /></View>

            ) : chartType === 'bloodPressure' ? (
              /* 文档#21：血压拆分为收缩压和舒张压两张独立图 */
              <>
                <Text style={styles.splitChartLabel}>收缩压 (mmHg)</Text>
                <TrendChart
                  data={chartData}
                  typeCfg={{ ...currentTypeCfg, color: '#DC3545',
                    getVal: r => r.extra?.sys ?? parseFloat(String(r.value).split('/')[0]) ?? 0,
                    refLines: [
                      { val: 140, color: '#DC3545', label: '收缩压上限 140mmHg' },
                      { val: 90,  color: '#22A06B', label: '收缩压下限 90mmHg' },
                    ],
                    minY: 60, maxY: 180,
                    color2: undefined, getVal2: undefined,
                  }}
                  period={chartPeriod}
                />
                <Text style={[styles.splitChartLabel, { marginTop: spacing.md }]}>舒张压 (mmHg)</Text>
                <TrendChart
                  data={chartData}
                  typeCfg={{ ...currentTypeCfg, color: '#0077B6',
                    getVal: r => r.extra?.dia ?? parseFloat(String(r.value).split('/')[1]) ?? 0,
                    refLines: [
                      { val: 90, color: '#DC3545', label: '舒张压上限 90mmHg' },
                      { val: 60, color: '#22A06B', label: '舒张压下限 60mmHg' },
                    ],
                    minY: 40, maxY: 120,
                    color2: undefined, getVal2: undefined,
                  }}
                  period={chartPeriod}
                />
              </>

            ) : chartType === 'bloodSugar' ? (
              /* 血糖拆分为空腹/餐后2h/睡前三张独立图，支持自定义参考范围 */
              <>
                {/* 自定义范围说明 */}
                <View style={styles.sugarRangeRow}>
                  <Text style={styles.sugarRangeHint}>参考线可自定义 · </Text>
                  <TouchableOpacity onPress={() => saveSugarRanges(SUGAR_RANGE_DEFAULT)}>
                    <Text style={styles.sugarRangeReset}>恢复默认</Text>
                  </TouchableOpacity>
                </View>

                {/* 空腹血糖 */}
                <Text style={styles.splitChartLabel}>空腹血糖</Text>
                <Text style={styles.splitChartRange}>正常范围：3.9 – 6.1 mmol/L</Text>
                <TrendChart
                  data={chartData}
                  typeCfg={{ ...currentTypeCfg, color: '#D97706', color2: undefined, getVal2: undefined,
                    splitBySeries: false,
                    refLines: [
                      { val: sugarRanges.fasting.max, color: '#DC3545', label: `上限 ${sugarRanges.fasting.max} mmol/L` },
                      { val: sugarRanges.fasting.min, color: '#0077B6', label: `下限 ${sugarRanges.fasting.min} mmol/L` },
                    ],
                    minY: 2, maxY: 14,
                  }}
                  period={chartPeriod}
                />
                <View style={styles.sugarRangeEditor}>
                  <Text style={styles.sugarRangeEditorLabel}>自定义范围：</Text>
                  <TextInput style={styles.sugarRangeInput}
                    keyboardType="decimal-pad"
                    value={String(sugarRanges.fasting.min)}
                    onChangeText={v => { const n = parseFloat(v); if (!isNaN(n)) saveSugarRanges({ ...sugarRanges, fasting: { ...sugarRanges.fasting, min: n } }); }}
                  />
                  <Text style={styles.sugarRangeEditorLabel}> – </Text>
                  <TextInput style={styles.sugarRangeInput}
                    keyboardType="decimal-pad"
                    value={String(sugarRanges.fasting.max)}
                    onChangeText={v => { const n = parseFloat(v); if (!isNaN(n)) saveSugarRanges({ ...sugarRanges, fasting: { ...sugarRanges.fasting, max: n } }); }}
                  />
                  <Text style={styles.sugarRangeEditorLabel}> mmol/L</Text>
                </View>

                {/* 餐后2小时血糖 */}
                <Text style={[styles.splitChartLabel, { marginTop: spacing.md }]}>餐后2小时血糖</Text>
                <Text style={styles.splitChartRange}>正常范围：&lt; 7.8 mmol/L</Text>
                {chartData2.length === 0 ? (
                  <View style={styles.chartEmpty}>
                    <Text style={styles.chartEmptyText}>暂无餐后血糖数据</Text>
                  </View>
                ) : (
                  <TrendChart
                    data={chartData2}
                    typeCfg={{ ...currentTypeCfg, color: '#DC3545', color2: undefined, getVal2: undefined,
                      splitBySeries: false,
                      refLines: [
                        { val: sugarRanges.postMeal.max, color: '#DC3545', label: `< ${sugarRanges.postMeal.max} mmol/L` },
                      ],
                      minY: 2, maxY: 16,
                    }}
                    period={chartPeriod}
                  />
                )}
                <View style={styles.sugarRangeEditor}>
                  <Text style={styles.sugarRangeEditorLabel}>参考上限：</Text>
                  <TextInput style={styles.sugarRangeInput}
                    keyboardType="decimal-pad"
                    value={String(sugarRanges.postMeal.max)}
                    onChangeText={v => { const n = parseFloat(v); if (!isNaN(n)) saveSugarRanges({ ...sugarRanges, postMeal: { ...sugarRanges.postMeal, max: n } }); }}
                  />
                  <Text style={styles.sugarRangeEditorLabel}> mmol/L</Text>
                </View>

                {/* 睡前血糖 */}
                <Text style={[styles.splitChartLabel, { marginTop: spacing.md }]}>睡前血糖</Text>
                <Text style={styles.splitChartRange}>正常范围：3.9 – 7.8 mmol/L</Text>
                {chartData3.length === 0 ? (
                  <View style={styles.chartEmpty}>
                    <Text style={styles.chartEmptyText}>暂无睡前血糖数据</Text>
                  </View>
                ) : (
                  <TrendChart
                    data={chartData3}
                    typeCfg={{ ...currentTypeCfg, color: '#7C3AED', color2: undefined, getVal2: undefined,
                      splitBySeries: false,
                      refLines: [
                        { val: sugarRanges.bedtime.max, color: '#DC3545', label: `上限 ${sugarRanges.bedtime.max} mmol/L` },
                        { val: sugarRanges.bedtime.min, color: '#0077B6', label: `下限 ${sugarRanges.bedtime.min} mmol/L` },
                      ],
                      minY: 2, maxY: 14,
                    }}
                    period={chartPeriod}
                  />
                )}
                <View style={styles.sugarRangeEditor}>
                  <Text style={styles.sugarRangeEditorLabel}>自定义范围：</Text>
                  <TextInput style={styles.sugarRangeInput}
                    keyboardType="decimal-pad"
                    value={String(sugarRanges.bedtime.min)}
                    onChangeText={v => { const n = parseFloat(v); if (!isNaN(n)) saveSugarRanges({ ...sugarRanges, bedtime: { ...sugarRanges.bedtime, min: n } }); }}
                  />
                  <Text style={styles.sugarRangeEditorLabel}> – </Text>
                  <TextInput style={styles.sugarRangeInput}
                    keyboardType="decimal-pad"
                    value={String(sugarRanges.bedtime.max)}
                    onChangeText={v => { const n = parseFloat(v); if (!isNaN(n)) saveSugarRanges({ ...sugarRanges, bedtime: { ...sugarRanges.bedtime, max: n } }); }}
                  />
                  <Text style={styles.sugarRangeEditorLabel}> mmol/L</Text>
                </View>
              </>

            ) : (
              /* 其余指标：单图 */
              <TrendChart
                data={chartData}
                typeCfg={currentTypeCfg}
                period={chartPeriod}
              />
            )}
          </View>
        </View>

        {/* ── 历史记录列表 ─────────────────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <Ionicons name="list-outline" size={17} color={colors.primary} />
              <Text style={styles.sectionTitle}>{currentTypeCfg.label}历史记录</Text>
            </View>
          </View>

          <View style={styles.historyCard}>
            {historyLoading ? (
              <View style={styles.chartEmpty}><ActivityIndicator color={colors.primary} /></View>
            ) : historyData.length === 0 ? (
              <View style={styles.historyEmpty}>
                <Ionicons name="document-outline" size={28} color={colors.textDisabled} />
                <Text style={styles.historyEmptyText}>暂无{currentTypeCfg.label}记录</Text>
                <TouchableOpacity style={styles.historyAddBtn} onPress={() => navigation.navigate('AddRecord')}>
                  <Text style={styles.historyAddBtnText}>+ 立即录入</Text>
                </TouchableOpacity>
              </View>
            ) : (
              historyData.map((rec, i) => (
                <RecordRow
                  key={rec._id || i}
                  record={rec}
                  typeCfg={currentTypeCfg}
                  isLast={i === historyData.length - 1}
                />
              ))
            )}
          </View>
        </View>

        <View style={{ height: spacing.xl * 2 }} />
      </ScrollView>

      {/* 编辑档案：跳转到 EditProfileScreen */}

      {/* ── 编辑生活方式 Modal ───────────────────────────────────── */}
      <Modal visible={editingLifestyle} animationType="slide" transparent onRequestClose={() => setEditingLifestyle(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.editOverlay}>
            <View style={styles.editCard}>
              <View style={styles.editHandle} />
              <View style={styles.editHeader}>
                <Text style={styles.editTitle}>编辑生活方式</Text>
                <TouchableOpacity onPress={() => setEditingLifestyle(false)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                  <Ionicons name="close" size={22} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
              <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
                {[
                  { key: 'diet',     label: '饮食',  icon: 'nutrition-outline',  placeholder: '如：三餐规律，以主食蔬菜为主，少油少盐' },
                  { key: 'exercise', label: '运动',  icon: 'fitness-outline',    placeholder: '如：跑步，每周3次，每次30分钟' },
                  { key: 'sleep',    label: '睡眠',  icon: 'moon-outline',       placeholder: '如：7小时，质量良好，早晨清醒' },
                  { key: 'water',    label: '饮水',  icon: 'water-outline',      placeholder: '如：白水为主，每日约2000毫升' },
                  { key: 'alcohol',  label: '饮酒',  icon: 'wine-outline',       placeholder: '如：红酒，每次100ml，每周1次，未曾醉酒' },
                  { key: 'smoking',  label: '吸烟',  icon: 'flame-outline',      placeholder: '如：不吸烟 / 卷烟，每日10支，2010年起' },
                  { key: 'bowel',    label: '排便',  icon: 'list-outline',       placeholder: '如：1次/日，成形，无特殊' },
                ].map(field => (
                  <View key={field.key} style={styles.editField}>
                    <View style={styles.editFieldLabel}>
                      <Ionicons name={field.icon} size={14} color={colors.primary} style={{ marginRight: 6 }} />
                      <Text style={styles.editFieldLabelText}>{field.label}</Text>
                    </View>
                    <TextInput
                      style={styles.editInput}
                      value={lifestyleDraft[field.key] || ''}
                      onChangeText={v => setLifestyleDraft(p => ({ ...p, [field.key]: v }))}
                      placeholder={field.placeholder}
                      placeholderTextColor={colors.textMuted}
                    />
                  </View>
                ))}
                {/* 情绪（初始记录）—— 来自健康初评，只读展示 */}
                <View style={styles.editField}>
                  <View style={styles.editFieldLabel}>
                    <Ionicons name="happy-outline" size={14} color="#F59E0B" style={{ marginRight: 6 }} />
                    <Text style={styles.editFieldLabelText}>情绪</Text>
                    <Text style={styles.editFieldInitialTag}>初始记录</Text>
                  </View>
                  <View style={[styles.editInput, styles.editInputReadonly]}>
                    <Text style={{ color: lifestyleDraft.mood ? colors.textPrimary : colors.textMuted, fontSize: 14 }}>
                      {lifestyleDraft.mood || '来自健康初评，如需修改请联系健康管理师'}
                    </Text>
                  </View>
                </View>
                <View style={{ height: 20 }} />
              </ScrollView>
              <TouchableOpacity style={styles.saveBtn} onPress={saveLifestyle} activeOpacity={0.85}>
                <Ionicons name="checkmark-circle" size={18} color={colors.white} />
                <Text style={styles.saveBtnText}>保存生活方式</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

// ── 样式 ──────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  loadingText: { color: colors.textMuted, fontSize: 14 },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    backgroundColor: colors.background,
    borderBottomWidth: 1, borderBottomColor: colors.borderLight,
  },
  pageTitle: { fontSize: 26, fontWeight: '800', color: colors.textPrimary, letterSpacing: -0.5 },
  syncInfo: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  addRecordBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.primary, borderRadius: radius.full,
    paddingHorizontal: 14, paddingVertical: 7,
  },
  addRecordBtnText: { color: colors.white, fontSize: 13, fontWeight: '700' },

  // 专项筛查入口卡片
  screeningEntry: {
    marginHorizontal: spacing.md, marginTop: spacing.md,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.white, borderRadius: radius.md, padding: spacing.md,
    borderLeftWidth: 4, borderLeftColor: colors.primary,
    ...shadow.card,
  },
  screeningEntryLeft:  { flexDirection: 'row', alignItems: 'center', gap: 12 },
  screeningEntryIcon:  { width: 40, height: 40, borderRadius: radius.sm, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center' },
  screeningEntryTitle: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  screeningEntrySub:   { fontSize: 12, color: colors.textMuted, marginTop: 2 },

  // Section
  section: { paddingHorizontal: spacing.md, paddingTop: spacing.md },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },

  // Edit button
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 8, borderRadius: radius.full, backgroundColor: colors.primary10 },
  editBtnText: { fontSize: 12, color: colors.primary, fontWeight: '600' },

  // Profile
  profileCard: {
    backgroundColor: colors.white, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, overflow: 'hidden',
  },
  profileRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: 10,
  },
  profileRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  profileRowLeft: { flexDirection: 'row', alignItems: 'center' },
  profileRowLabel: { fontSize: 13, color: colors.textSecondary, fontWeight: '500' },
  profileRowValue: { fontSize: 13, color: colors.textPrimary, fontWeight: '600', maxWidth: '55%', textAlign: 'right' },

  // Metrics grid
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  metricCard: {
    width: (W - spacing.md * 2 - spacing.sm) / 2,
    backgroundColor: colors.white,
    borderRadius: radius.md, padding: spacing.md,
    borderWidth: 1, borderColor: colors.border,
  },
  metricTop: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  metricIconWrap: { width: 24, height: 24, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  metricLabel: { fontSize: 11, color: colors.textMuted, fontWeight: '500', flex: 1 },
  metricValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 3, marginBottom: 7 },
  metricValue: { fontSize: 22, fontWeight: '800', color: colors.textPrimary, letterSpacing: -0.5 },
  metricUnit: { fontSize: 10, color: colors.textMuted },
  metricTime: { fontSize: 10, color: colors.textDisabled, marginTop: 5 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.full, alignSelf: 'flex-start' },
  statusText: { fontSize: 10, fontWeight: '700' },

  // Chart type selector
  chartTypeScroll: { marginBottom: spacing.sm },
  chartTypeContent: { gap: spacing.xs, paddingVertical: 2 },
  chartTypeChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: radius.full, borderWidth: 1.5, borderColor: colors.border,
    backgroundColor: colors.white,
  },
  chartTypeText: { fontSize: 12, color: colors.textSecondary, fontWeight: '500' },

  // Chart
  chartCard: {
    backgroundColor: colors.white, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, padding: spacing.md,
  },
  chartHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.md },
  chartTitle: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  chartSubtitle: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  periodRow: { flexDirection: 'row', backgroundColor: colors.background, borderRadius: radius.full, padding: 2 },
  periodBtn: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: radius.full },
  periodBtnActive: { backgroundColor: colors.primary },
  periodText: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },
  periodTextActive: { color: colors.white },
  chartEmpty: { height: 100, alignItems: 'center', justifyContent: 'center', gap: 8 },
  chartEmptyText: { fontSize: 13, color: colors.textMuted },

  // Chart labels
  yLabel: { fontSize: 9, color: colors.textMuted, textAlign: 'left' },
  xLabel: { fontSize: 9, color: colors.textMuted, textAlign: 'center' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.sm },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendLine: { width: 14, height: 2 },
  legendText: { fontSize: 10, color: colors.textMuted },

  // 分图标题（血压/血糖拆分图）
  splitChartLabel: { fontSize: 13, fontWeight: '700', color: colors.textPrimary, marginBottom: 2, marginTop: spacing.xs },
  splitChartRange: { fontSize: 11, color: colors.textMuted, marginBottom: spacing.xs },

  // 血糖自定义参考范围
  sugarRangeRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.xs },
  sugarRangeHint: { fontSize: 11, color: colors.textMuted },
  sugarRangeReset: { fontSize: 11, color: colors.primary, fontWeight: '600' },
  sugarRangeEditor: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.background, borderRadius: radius.xs,
    paddingHorizontal: spacing.sm, paddingVertical: 4,
    marginTop: 4, marginBottom: spacing.xs,
  },
  sugarRangeEditorLabel: { fontSize: 11, color: colors.textMuted },
  sugarRangeInput: {
    borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.xs, paddingHorizontal: 8, paddingVertical: 2,
    fontSize: 12, color: colors.textPrimary,
    width: 44, textAlign: 'center',
    backgroundColor: colors.white,
  },

  // History
  historyCard: {
    backgroundColor: colors.white, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, overflow: 'hidden',
  },
  recordRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.md, paddingVertical: 12, gap: spacing.sm,
  },
  recordRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  recordLeft: { flexDirection: 'row', alignItems: 'baseline', gap: 3, width: 90 },
  recordVal: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  recordUnit: { fontSize: 10, color: colors.textMuted },
  recordDate: { fontSize: 12, color: colors.textSecondary, fontWeight: '500' },
  recordNote: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  historyEmpty: { padding: spacing.xl, alignItems: 'center', gap: spacing.sm },
  historyEmptyText: { fontSize: 13, color: colors.textMuted },
  historyAddBtn: { marginTop: 4, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: colors.primary10, borderRadius: radius.full },
  historyAddBtnText: { fontSize: 13, color: colors.primary, fontWeight: '600' },

  // Edit Modal
  editOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  editCard: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: spacing.lg, paddingBottom: spacing.xl,
    maxHeight: '88%',
  },
  editHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: colors.border, alignSelf: 'center', marginTop: 12, marginBottom: 16,
  },
  editHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  editTitle: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },
  editField: { marginBottom: spacing.md },
  editFieldLabel: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  editFieldLabelText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  editFieldInitialTag: { fontSize: 10, color: '#F59E0B', fontWeight: '600', backgroundColor: '#FEF3E2', borderRadius: radius.full, paddingHorizontal: 6, paddingVertical: 1, marginLeft: 6 },
  editInput: {
    backgroundColor: colors.background, borderRadius: radius.sm,
    borderWidth: 1.5, borderColor: colors.border,
    paddingHorizontal: spacing.sm, paddingVertical: 10,
    fontSize: 14, color: colors.textPrimary,
  },
  editInputReadonly: { borderStyle: 'dashed', borderColor: colors.border, opacity: 0.75 },
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 14, marginTop: spacing.sm,
  },
  saveBtnText: { color: colors.white, fontSize: 16, fontWeight: '700' },
});

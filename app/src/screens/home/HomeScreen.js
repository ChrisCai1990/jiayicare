import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, SafeAreaView, RefreshControl, Dimensions,
  Modal, TextInput, Image, Platform, Alert, ActivityIndicator,
} from 'react-native';
import Svg, { Rect, Line, Text as SvgText, Defs, LinearGradient, Stop, Polyline, Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, shadow } from '../../theme';
import { useAuth } from '../../context/AuthContext';
import { userAPI, recordsAPI, systemAPI, followupTasksAPI, tasksAPI } from '../../services/api';
import AnimatedNumber from '../../components/AnimatedNumber';

// 本地日期字符串（YYYY-MM-DD）——不能用 toISOString()，那是 UTC 日期，国内时区凌晨0-8点时
// 会比本地日期整整慢一天，导致"今天/昨天/前天"打卡归属日算错（2026-07-13 排查昨日打卡问题时发现）
function toLocalDateStr(d) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
import { HomeScreenSkeleton } from '../../components/SkeletonLoader';
import { mockBloodPressureData, mockBloodSugarData, mockTasks } from '../../data/mockData';

const { width: SCREEN_WIDTH } = Dimensions.get('window');


// ── 迷你评分走势图 ────────────────────────────────────────────────
function ScoreTrendLine({ history }) {
  if (!history || history.length < 2) return null;
  const W = 80, H = 24;
  const scores = history.map(h => h.score);
  const min = Math.max(0,  Math.min(...scores) - 5);
  const max = Math.min(100, Math.max(...scores) + 5);
  const range = max - min || 1;
  const toX = (i) => (i / (scores.length - 1)) * W;
  const toY = (v) => H - ((v - min) / range) * H;
  const pts = scores.map((s, i) => `${toX(i)},${toY(s)}`).join(' ');
  const last = scores[scores.length - 1];
  return (
    <Svg width={W} height={H}>
      <Polyline points={pts} fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx={toX(scores.length - 1)} cy={toY(last)} r={3} fill="rgba(255,255,255,0.9)" />
    </Svg>
  );
}

// ── 任务优先级配置 ────────────────────────────────────────────────
const URGENCY_CONFIG = {
  high:   { label: '紧急', bg: '#FDECEA', color: '#DC3545' },
  medium: { label: '今天', bg: '#E8F5EF', color: '#1E6B50' },
  low:    { label: '即将', bg: '#F5F5F5', color: '#8AA89C' },
};

const TASK_ICON_CONFIG = {
  record:        { icon: 'heart-outline',      bg: '#FDECEA', color: '#DC3545' },
  followup:      { icon: 'call-outline',       bg: '#E8F5EF', color: '#1E6B50' },
  questionnaire: { icon: 'clipboard-outline',  bg: '#E8F3FB', color: '#0077B6' },
  checkup:       { icon: 'flask-outline',      bg: '#F2EEFF', color: '#7C3AED' },
  consultation:  { icon: 'chatbubbles-outline',bg: '#FDF0EB', color: '#D44000' },
};

// ── 提醒类别配置（首页用） ────────────────────────────────────────
const REM_CAT_META = {
  followup_abnormal: { icon: 'alert-circle-outline', color: '#DC3545', bg: '#FDEEEC' },
  medication:        { icon: 'medical-outline',       color: '#0077B6', bg: '#EBF5FB' },
  supplement:        { icon: 'leaf-outline',          color: '#22A06B', bg: '#E8F5EF' },
  monitoring:        { icon: 'pulse-outline',         color: '#7C3AED', bg: '#F2EEFF' },
  screening_annual:  { icon: 'search-outline',        color: '#D97706', bg: '#FEF3E2' },
  vaccination:       { icon: 'shield-outline',        color: '#059669', bg: '#D1FAE5' },
  diet_checkin:      { icon: 'nutrition-outline',     color: '#B45309', bg: '#FEF3C7' },
  exercise_checkin:  { icon: 'fitness-outline',       color: '#0369A1', bg: '#E0F2FE' },
  weight_checkin:    { icon: 'scale-outline',         color: '#1E6B50', bg: '#D1FAE5' },
  sleep:             { icon: 'moon-outline',          color: '#4F46E5', bg: '#EEF2FF' },
  substance:         { icon: 'warning-outline',       color: '#9D174D', bg: '#FCE7F3' },
};

// ── 打卡项目定义 ─────────────────────────────────────────────────
const CHECKIN_DEFS = {
  diet:          { key: 'diet',          label: '饮食', icon: 'nutrition-outline',     color: '#059669', measureType: null,            category: 'lifestyle', recordLabel: '饮食打卡', allowMultiple: true },
  exercise:      { key: 'exercise',      label: '运动', icon: 'fitness-outline',       color: '#0369A1', measureType: null,            category: 'lifestyle', recordLabel: '运动打卡', allowMultiple: true },
  sleep:         { key: 'sleep',         label: '睡眠', icon: 'moon-outline',          color: '#4F46E5', measureType: 'sleep',         category: 'lifestyle', recordLabel: '睡眠打卡' },
  weight:        { key: 'weight',        label: '体重', icon: 'scale-outline',         color: '#059669', measureType: 'weight',        category: 'vitals',    recordLabel: '体重打卡' },
  bowel:         { key: 'bowel',         label: '排便', icon: 'leaf-outline',          color: '#92400E', measureType: null,            category: 'lifestyle', recordLabel: '排便打卡' },
  water:         { key: 'water',         label: '饮水', icon: 'water-outline',         color: '#0EA5E9', measureType: null,            category: 'lifestyle', recordLabel: '饮水打卡' },
  smoking:       { key: 'smoking',       label: '吸烟', icon: 'warning-outline',       color: '#6B7280', measureType: null,            category: 'lifestyle', recordLabel: '吸烟记录' },
  alcohol:       { key: 'alcohol',       label: '饮酒', icon: 'wine-outline',          color: '#9D174D', measureType: null,            category: 'lifestyle', recordLabel: '饮酒记录' },
  bloodPressure: { key: 'bloodPressure', label: '血压', icon: 'pulse-outline',         color: '#DC3545', measureType: 'bloodPressure', category: 'vitals',    recordLabel: '血压打卡', allowMultiple: true },
  heartRate:     { key: 'heartRate',     label: '心率', icon: 'heart-outline',         color: '#DC3545', measureType: 'heartRate',     category: 'vitals',    recordLabel: '心率打卡' },
  bloodSugar:    { key: 'bloodSugar',    label: '血糖', icon: 'water-outline',         color: '#F39C12', measureType: 'bloodSugar',    category: 'vitals',    recordLabel: '血糖打卡', allowMultiple: true },
  mood:          { key: 'mood',          label: '情绪', icon: 'happy-outline',         color: '#7C3AED', measureType: 'mood',          category: 'lifestyle', recordLabel: '情绪打卡' },
};

// 12个固定打卡项目（顺序按需求文档，情绪紧跟血糖之后）
const FIXED_CHECKIN_KEYS = ['diet','exercise','sleep','weight','bowel','water','smoking','alcohol','bloodPressure','heartRate','bloodSugar','mood'];

// 生理指标打卡项的字段定义（血压/体重/心率/血糖为数值录入，睡眠为时间录入），与 AddRecordScreen 字段口径保持一致
const MEASURE_FIELDS = {
  bloodPressure: [
    { key: 'sys', label: '收缩压', unit: 'mmHg', placeholder: '如：130', normal: '90-139' },
    { key: 'dia', label: '舒张压', unit: 'mmHg', placeholder: '如：80', normal: '60-89' },
  ],
  bloodSugar: [
    { key: 'value', label: '血糖值', unit: 'mmol/L', placeholder: '如：6.1', normal: '3.9-6.1' },
  ],
  heartRate: [
    { key: 'value', label: '心率', unit: '次/分', placeholder: '如：72', normal: '60-100' },
  ],
  weight: [
    { key: 'value', label: '体重', unit: 'kg', placeholder: '如：70.5', normal: '视BMI而定' },
  ],
  mood: [
    { key: 'value', label: '情绪评分', unit: '分', placeholder: '1-10分', normal: '6-10' },
  ],
  sleep: [],
};
const MEASURE_OPTIONS_HOME = { bloodSugar: ['空腹', '餐后2小时', '睡前', '随机'], bloodPressure: ['左臂', '右臂'] };

// 根据入睡和醒来时间计算睡眠时长（跨午夜自动处理）
function calcSleepDurationHome(sleepTime, wakeTime) {
  const parse = (t) => {
    const parts = t.replace('：', ':').split(':');
    const h = parseInt(parts[0], 10) || 0;
    const m = parseInt(parts[1], 10) || 0;
    return h * 60 + m;
  };
  let s = parse(sleepTime);
  let w = parse(wakeTime);
  if (w <= s) w += 24 * 60;
  return ((w - s) / 60).toFixed(1);
}

// 主题关键词 → 打卡类型（兜底匹配，不依赖 checkInItems 字段）
function deriveCheckInFromTheme(theme) {
  const t = theme || '';
  const types = [];
  if (t.includes('血压')) types.push('bloodPressure');
  if (t.includes('血糖')) types.push('bloodSugar');
  if (t.includes('体重')) types.push('weight');
  if (t.includes('心率')) types.push('heartRate');
  if (t.includes('睡眠')) types.push('sleep');
  if (t.includes('生活') || t.includes('营养') || t.includes('饮食')) { types.push('diet'); types.push('water'); }
  if (t.includes('运动')) types.push('exercise');
  return types;
}

// ── 待办 Tab ──────────────────────────────────────────────────────
const TASK_TABS = ['全部', '今日', '本周', '本月'];

// ── Mini 折线图：血压 ─────────────────────────────────────────────
function BloodPressureChart({ data, onAdd }) {
  if (!data || data.length === 0) {
    return (
      <TouchableOpacity style={styles.chartEmptyMini} onPress={onAdd} activeOpacity={0.7}>
        <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
        <Text style={styles.chartEmptyMiniText}>点击录入血压</Text>
      </TouchableOpacity>
    );
  }
  const CARD_PADDING = spacing.md;
  const CARD_W = (SCREEN_WIDTH - spacing.lg * 2) / 2 - CARD_PADDING * 2;
  const Y_LABEL_W = 26;
  const CHART_W = CARD_W - Y_LABEL_W - 4;
  const CHART_H = 60;
  const X_LABEL_H = 14;
  const recent = data.slice(-7);
  const MIN_VAL = 60;
  const MAX_VAL = 170;
  const RANGE = MAX_VAL - MIN_VAL;
  const BAR_COUNT = recent.length;
  const BAR_TOTAL_W = CHART_W / BAR_COUNT;
  const BAR_W = Math.max(BAR_TOTAL_W * 0.5, 4);
  const toY = (v) => CHART_H - ((v - MIN_VAL) / RANGE) * CHART_H;
  const ref140Y = toY(140);
  const ref90Y  = toY(90);

  return (
    <View style={{ marginTop: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        {/* Chart area */}
        <Svg width={CHART_W} height={CHART_H}>
          <Defs>
            <LinearGradient id="bpGrad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={colors.primary} stopOpacity="1" />
              <Stop offset="1" stopColor={colors.primary} stopOpacity="0.5" />
            </LinearGradient>
          </Defs>
          {/* Reference lines */}
          <Line x1={0} y1={ref140Y} x2={CHART_W} y2={ref140Y}
            stroke="#DC3545" strokeWidth={1} strokeDasharray="3,2" />
          <Line x1={0} y1={ref90Y} x2={CHART_W} y2={ref90Y}
            stroke="#22A06B" strokeWidth={1} strokeDasharray="3,2" />
          {/* Bars */}
          {recent.map((d, i) => {
            const barH = ((d.sys - MIN_VAL) / RANGE) * CHART_H;
            const x = i * BAR_TOTAL_W + (BAR_TOTAL_W - BAR_W) / 2;
            const isLast = i === recent.length - 1;
            return (
              <Rect
                key={i}
                x={x}
                y={CHART_H - barH}
                width={BAR_W}
                height={barH}
                rx={2}
                fill={isLast ? colors.primary : colors.primary}
                fillOpacity={isLast ? 1 : 0.4}
              />
            );
          })}
        </Svg>
        {/* Y-axis labels */}
        <View style={{ width: Y_LABEL_W, height: CHART_H, justifyContent: 'space-between', paddingLeft: 3 }}>
          <Text style={styles.chartAxisLabel}>160</Text>
          <Text style={styles.chartAxisLabel}>130</Text>
          <Text style={styles.chartAxisLabel}>90</Text>
        </View>
      </View>
      {/* X-axis labels */}
      <View style={{ width: CHART_W, flexDirection: 'row' }}>
        {recent.map((d, i) => (
          <View key={i} style={{ width: BAR_TOTAL_W, alignItems: 'center' }}>
            <Text style={styles.chartXLabel}>{d.date.slice(-4)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ── Mini 折线图：血糖 ─────────────────────────────────────────────
function BloodSugarChart({ data, onAdd }) {
  if (!data || data.length === 0) {
    return (
      <TouchableOpacity style={styles.chartEmptyMini} onPress={onAdd} activeOpacity={0.7}>
        <Ionicons name="add-circle-outline" size={18} color="#D97706" />
        <Text style={[styles.chartEmptyMiniText, { color: '#D97706' }]}>点击录入血糖</Text>
      </TouchableOpacity>
    );
  }
  const CARD_PADDING = spacing.md;
  const CARD_W = (SCREEN_WIDTH - spacing.lg * 2) / 2 - CARD_PADDING * 2;
  const Y_LABEL_W = 24;
  const CHART_W = CARD_W - Y_LABEL_W - 4;
  const CHART_H = 60;
  const recent = data.slice(-7);
  const MIN_VAL = 2;
  const MAX_VAL = 10;
  const RANGE = MAX_VAL - MIN_VAL;
  const BAR_COUNT = recent.length;
  const BAR_TOTAL_W = CHART_W / BAR_COUNT;
  const BAR_W = Math.max(BAR_TOTAL_W * 0.5, 4);
  const toY = (v) => CHART_H - ((v - MIN_VAL) / RANGE) * CHART_H;
  const ref61Y  = toY(6.1);
  const ref39Y  = toY(3.9);

  return (
    <View style={{ marginTop: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        <Svg width={CHART_W} height={CHART_H}>
          {/* Reference lines */}
          <Line x1={0} y1={ref61Y} x2={CHART_W} y2={ref61Y}
            stroke="#22A06B" strokeWidth={1} strokeDasharray="3,2" />
          <Line x1={0} y1={ref39Y} x2={CHART_W} y2={ref39Y}
            stroke="#0077B6" strokeWidth={1} strokeDasharray="3,2" />
          {/* Bars */}
          {recent.map((d, i) => {
            const barH = ((d.value - MIN_VAL) / RANGE) * CHART_H;
            const x = i * BAR_TOTAL_W + (BAR_TOTAL_W - BAR_W) / 2;
            const isLast = i === recent.length - 1;
            return (
              <Rect
                key={i}
                x={x}
                y={CHART_H - barH}
                width={BAR_W}
                height={barH}
                rx={2}
                fill="#F39C12"
                fillOpacity={isLast ? 1 : 0.4}
              />
            );
          })}
        </Svg>
        <View style={{ width: Y_LABEL_W, height: CHART_H, justifyContent: 'space-between', paddingLeft: 3 }}>
          <Text style={styles.chartAxisLabel}>8</Text>
          <Text style={styles.chartAxisLabel}>6</Text>
          <Text style={styles.chartAxisLabel}>4</Text>
        </View>
      </View>
      <View style={{ width: CHART_W, flexDirection: 'row' }}>
        {recent.map((d, i) => (
          <View key={i} style={{ width: BAR_TOTAL_W, alignItems: 'center' }}>
            <Text style={styles.chartXLabel}>{d.date.slice(-4)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ── BMI 色带进度条 ────────────────────────────────────────────────
function BmiBar({ value }) {
  const MIN = 15;
  const MAX = 35;
  const pct = Math.min(Math.max((value - MIN) / (MAX - MIN), 0), 1);
  const CARD_PADDING = spacing.md;
  const BAR_W = (SCREEN_WIDTH - spacing.lg * 2) / 2 - CARD_PADDING * 2;

  const segments = [
    { from: 15,   to: 18.5, color: '#60B8D4' },
    { from: 18.5, to: 24,   color: '#22A06B' },
    { from: 24,   to: 28,   color: '#F39C12' },
    { from: 28,   to: 35,   color: '#DC3545' },
  ];

  const markerX = pct * BAR_W;

  return (
    <View style={{ marginTop: 10 }}>
      <Svg width={BAR_W} height={20}>
        {segments.map((seg, i) => {
          const segX = ((seg.from - MIN) / (MAX - MIN)) * BAR_W;
          const segW = ((seg.to - MIN) / (MAX - MIN)) * BAR_W - segX;
          const isFirst = i === 0;
          const isLast  = i === segments.length - 1;
          return (
            <Rect
              key={i}
              x={segX}
              y={6}
              width={segW}
              height={8}
              rx={isFirst || isLast ? 4 : 0}
              fill={seg.color}
            />
          );
        })}
        {/* Marker */}
        <Rect x={markerX - 1.5} y={2} width={3} height={16} rx={1.5} fill="#1A2B24" />
      </Svg>
      <Text style={[styles.chartXLabel, { marginTop: 2 }]}>
        偏轻{'<'}18.5 / 正常 18.5-24 / 超重 24-28 / 肥胖{'>'}28
      </Text>
    </View>
  );
}

// ── 任务行 ────────────────────────────────────────────────────────
function TaskItem({ task, isLast, onPress }) {
  const urgency = URGENCY_CONFIG[task.priority] || URGENCY_CONFIG.low;
  const iconCfg = TASK_ICON_CONFIG[task.type] || TASK_ICON_CONFIG.followup;

  return (
    <TouchableOpacity
      style={[styles.taskItem, !isLast && styles.taskItemBorder]}
      activeOpacity={0.7}
      onPress={() => onPress && onPress(task)}
    >
      <View style={[styles.taskIconWrap, { backgroundColor: iconCfg.bg }]}>
        <Ionicons name={iconCfg.icon} size={20} color={iconCfg.color} />
      </View>
      <View style={styles.taskBody}>
        <Text style={styles.taskTitle} numberOfLines={1}>{task.title}</Text>
        <Text style={styles.taskMeta} numberOfLines={1}>
          {task.assignee} · {task.dueDate} {task.dueTime}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <View style={[styles.urgencyBadge, { backgroundColor: urgency.bg }]}>
          <Text style={[styles.urgencyText, { color: urgency.color }]}>{urgency.label}</Text>
        </View>
        <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
      </View>
    </TouchableOpacity>
  );
}

// ── 提醒行（首页） ────────────────────────────────────────────────
function ReminderItem({ reminder, isLast }) {
  const meta = REM_CAT_META[reminder.category] || REM_CAT_META.medication;
  const time = reminder.reminderTime || '';
  return (
    <View style={[styles.taskItem, !isLast && styles.taskItemBorder]}>
      <View style={[styles.taskIconWrap, { backgroundColor: meta.bg }]}>
        <Ionicons name={meta.icon} size={20} color={meta.color} />
      </View>
      <View style={styles.taskBody}>
        <Text style={styles.taskTitle} numberOfLines={1}>{reminder.title}</Text>
        <Text style={styles.taskMeta} numberOfLines={1}>
          提醒{time ? ` · ${time}` : ''}
        </Text>
      </View>
      <View style={[styles.urgencyBadge, { backgroundColor: meta.bg }]}>
        <Text style={[styles.urgencyText, { color: meta.color }]}>提醒</Text>
      </View>
    </View>
  );
}

// ── 成长卡片（增长杠杆②：连续打卡激励 + 趋势正反馈）──────────────────
// 数据来自 dashboard 的 growth 字段。目的是给客户「连续记录」和「看到自己在变好」的正反馈，
// 提升打卡留存。无数据（从未打卡）时不渲染，不打扰新用户。
function GrowthCard({ growth, onCheckin }) {
  if (!growth) return null;
  const { streak = 0, totalCheckinDays = 0, monthCalendar = [], trendHighlight = null } = growth;
  // 从未打卡则不显示（新用户先引导打卡，不空谈成长）
  if (streak === 0 && totalCheckinDays === 0) return null;

  const today = new Date().getDate();
  return (
    <View style={{
      backgroundColor: '#FFFFFF', borderRadius: 20, padding: 18, marginBottom: 16,
      shadowColor: '#1E6B50', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2,
    }}>
      {/* 连续天数 + 累计 */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
          <Text style={{ fontSize: 20, marginRight: 6 }}>🔥</Text>
          <Text style={{ fontSize: 34, fontWeight: '800', color: '#1E6B50', lineHeight: 38 }}>{streak}</Text>
          <Text style={{ fontSize: 15, color: '#4A6558', fontWeight: '600', marginLeft: 4 }}>天连续打卡</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ fontSize: 12, color: '#8AA89C' }}>近30天累计</Text>
          <Text style={{ fontSize: 18, fontWeight: '700', color: '#1A2B24' }}>{totalCheckinDays} 天</Text>
        </View>
      </View>

      {/* 趋势亮点：你的 XX 在变好 */}
      {trendHighlight && (
        <View style={{
          flexDirection: 'row', alignItems: 'center', backgroundColor: '#EAF5EF',
          borderRadius: 12, padding: 10, marginTop: 14,
        }}>
          <Text style={{ fontSize: 16, marginRight: 8 }}>{trendHighlight.direction === 'up' ? '📈' : '📉'}</Text>
          <Text style={{ fontSize: 13, color: '#1E6B50', fontWeight: '600', flex: 1 }}>
            你的{trendHighlight.label}在变好：{trendHighlight.from}{trendHighlight.unit} → {trendHighlight.to}{trendHighlight.unit}
          </Text>
        </View>
      )}

      {/* 本月打卡日历（圆点） */}
      {monthCalendar.length > 0 && (
        <View style={{ marginTop: 14 }}>
          <Text style={{ fontSize: 12, color: '#8AA89C', marginBottom: 8 }}>本月打卡</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
            {monthCalendar.map(d => (
              <View key={d.day} style={{
                width: 20, height: 20, borderRadius: 6, alignItems: 'center', justifyContent: 'center',
                backgroundColor: d.checked ? '#1E6B50' : (d.future ? '#F3F4F6' : '#E8E1D5'),
                borderWidth: d.day === today ? 1.5 : 0, borderColor: '#D97706',
              }}>
                <Text style={{ fontSize: 9, color: d.checked ? '#fff' : '#B8AC99', fontWeight: '600' }}>{d.day}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* 打卡入口已移除：打卡统一在下方「今日健康打卡」网格里进行，此处只做连续天数/日历的激励展示。
          （2026-07-10 金娟：原「坚持第N天·去打卡」按钮绑的是空函数 onCheckin={()=>{}}，点击无反应且与下方网格重复） */}
      {streak > 0 && (
        <Text style={{ marginTop: 12, textAlign: 'center', fontSize: 13, color: '#4A6558' }}>
          今天是坚持第 {streak + 1} 天，在下方完成今日打卡 👇
        </Text>
      )}
    </View>
  );
}

// ── 主页面 ────────────────────────────────────────────────────────
export default function HomeScreen({ navigation }) {
  const { user: authUser, isDemo } = useAuth();
  const [dashData, setDashData]             = useState(null);
  const [scoreHistory, setScoreHistory]     = useState([]);
  const [bpTrend, setBpTrend]               = useState([]);
  const [sugarTrend, setSugarTrend]         = useState([]);
  const [loading, setLoading]               = useState(true);
  const [refreshing, setRefreshing]         = useState(false);
  const [taskTab, setTaskTab]               = useState('全部');
  const [followupPlans, setFollowupPlans]   = useState([]);
  const [allTasks, setAllTasks]             = useState([]);
  const [todayRecordedTypes, setTodayRecordedTypes] = useState(new Set());
  // 今日健康打卡（localStorage按日存储）
  const TODAY_KEY = `jy_checkin_${toLocalDateStr(new Date())}`;
  const loadCheckin = () => {
    try { return JSON.parse(localStorage.getItem(TODAY_KEY)) || {}; } catch { return {}; }
  };
  const [checkin, setCheckin] = useState(loadCheckin);
  // 打卡记录弹窗
  const [checkinModal, setCheckinModal] = useState(null); // { key, label, icon, color }
  const [checkinNote, setCheckinNote]   = useState('');
  const [checkinImage, setCheckinImage] = useState(null);
  const [checkinMealType, setCheckinMealType] = useState(''); // 饮食打卡专用：早餐/午餐/晚餐/加餐（2026-07-13 需求）
  const [checkinSaving, setCheckinSaving] = useState(false);
  const [measureSaving, setMeasureSaving] = useState(false);
  // 生理指标打卡弹窗（血压/体重/睡眠/心率/血糖），原地填写，不跳转页面
  const [measureModal, setMeasureModal] = useState(null); // { key, label, icon, color, measureType }
  const [measureValues, setMeasureValues] = useState({});
  const [measureOption, setMeasureOption] = useState('');
  const [measureNote, setMeasureNote] = useState(''); // 测量类打卡的自由文本备注，如"血压异常，昨晚没睡好"
  // 打卡归属日期（默认今天，可补录昨天/过去日期）——饮水/排便/运动/睡眠常是昨天的数据（2026-07-10 金娟）
  const todayStr = toLocalDateStr(new Date());
  const [checkinDate, setCheckinDate] = useState(todayStr);
  // 任务详情弹窗
  const [taskDetailModal, setTaskDetailModal] = useState(null);
  const [taskCompleting, setTaskCompleting]   = useState(false);
  const fileInputRef = useRef(null);

  const loadData = useCallback(async () => {
    try {
      const [dashRes, bpRes, sugarRes, moodRes, followupRes, tasksRes, todayRecRes] =
        await Promise.allSettled([
          userAPI.getDashboard(),
          recordsAPI.trend('bloodPressure'),
          recordsAPI.trend('bloodSugar'),
          recordsAPI.list({ type: 'mood', limit: 1 }),
          followupTasksAPI.list(),
          tasksAPI.list(),
          recordsAPI.list({ days: 1, limit: 50 }),
        ]);

      if (dashRes.status === 'fulfilled' && dashRes.value?.success) {
        setDashData(dashRes.value.data);
        if (dashRes.value.data?.scoreHistory?.length > 0) {
          setScoreHistory(dashRes.value.data.scoreHistory);
        }
      }
      if (bpRes.status === 'fulfilled' && bpRes.value?.data?.length > 0) {
        const raw = bpRes.value.data;
        const normalised = raw.map(r => ({
          date: r.date || new Date(r.recordedAt).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }),
          sys:  r.sys  ?? r.extra?.sys  ?? parseFloat(r.value?.split('/')[0]) ?? 130,
          dia:  r.dia  ?? r.extra?.dia  ?? parseFloat(r.value?.split('/')[1]) ?? 80,
        }));
        if (normalised.length > 0) setBpTrend(normalised);
      } else if (isDemo) {
        setBpTrend(mockBloodPressureData);
      }
      if (sugarRes.status === 'fulfilled' && sugarRes.value?.data?.length > 0) {
        const raw = sugarRes.value.data;
        const normalised = raw.map(r => ({
          date:  r.date || new Date(r.recordedAt).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }),
          value: parseFloat(r.value ?? r.extra?.value ?? 6.1),
        }));
        if (normalised.length > 0) setSugarTrend(normalised);
      } else if (isDemo) {
        setSugarTrend(mockBloodSugarData);
      }
      if (moodRes.status === 'fulfilled' && moodRes.value?.data?.length > 0) {
        const v = parseInt(moodRes.value.data[0].value);
        if (v >= 1 && v <= 10) setMoodScore(v);
      }
      if (followupRes.status === 'fulfilled' && followupRes.value?.success) {
        setFollowupPlans(followupRes.value.data || []);
      }
      if (tasksRes.status === 'fulfilled' && tasksRes.value?.success) {
        setAllTasks((tasksRes.value.data || []).filter(t => t.status === 'pending'));
      }
      if (todayRecRes.status === 'fulfilled' && todayRecRes.value?.data) {
        // 只把「归属日期=今天」的记录算作今日已打卡。
        // 后端 days:1 返回的是最近24小时内的记录，昨天下午的记录今天上午仍在窗口内，
        // 若不按日期过滤会误判成今天已打卡，导致运动/体重/排便等今天打不了卡（2026-07-11 金娟反馈）。
        const sameLocalDay = (a, b) =>
          a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
        const now = new Date();
        const types = new Set(
          (todayRecRes.value.data || [])
            .filter(r => {
              const d = r.recordedAt ? new Date(r.recordedAt) : null;
              return d && !isNaN(d) && sameLocalDay(d, now);
            })
            .map(r => r.type)
        );
        setTodayRecordedTypes(types);
      }
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => {
    loadData();
    // 系统推送检查：每天最多触发一次（localStorage 记录日期）
    try {
      const pushKey = 'jy_last_push';
      const today = toLocalDateStr(new Date());
      const lastPush = localStorage.getItem(pushKey);
      if (lastPush !== today) {
        systemAPI.push().then((res) => {
          localStorage.setItem(pushKey, today);
          // 若浏览器通知已授权且有新推送，弹出系统通知
          if (res?.pushed?.length > 0 && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            new Notification('嘉医管家健康提醒', { body: res.pushed[0], icon: '/favicon.ico' });
          }
        }).catch(() => {}); // 静默失败，不影响首页加载
      }
    } catch {}
  }, [loadData]);

  // 从录入页返回时自动刷新（focus listener）
  useEffect(() => {
    const unsub = navigation.addListener('focus', () => {
      // 只在初次加载完成后才响应焦点刷新，避免首次双重请求
      if (!loading) loadData();
    });
    return unsub;
  }, [navigation, loading, loadData]);

  const onRefresh = () => { setRefreshing(true); loadData(); };

  // 合并两个来源：dashData 有服务器评分等，authUser 在编辑资料后立即更新（身高体重等）
  const user  = { ...(dashData?.user || {}), ...(authUser || {}) };
  const todayReminders  = dashData?.todayReminders || [];
  // has_any_health_data：后端返回，用于判断新用户空状态
  const hasAnyHealthData = dashData?.has_any_health_data ?? isDemo;
  const score = user?.healthScore || (isDemo ? 82 : 0);
  // 无健康数据时评分显示 "--"（文档#16：新用户不展示假分值）
  const scoreDisplay = hasAnyHealthData ? score : null;
  const name  = user?.name || '用户';

  // ── 真实最新指标 (fallback to mock) ──────────────────────────────
  // 注意：必须在 BMI 计算之前声明，避免 const TDZ 错误
  // 后端返回的是 HealthRecord 文档: { value: "130/80", extra: { sys, dia }, status }
  const vitals = dashData?.latestVitals || {};
  const bpRec  = vitals.bloodPressure;
  const bsSrc  = vitals.bloodSugar;

  // ── 实时 BMI 计算 ─────────────────────────────────────────────
  // 优先使用后端基于最新体重记录计算的 bmi，其次前端本地计算（用 vitals.weight 再 fallback user.weight）
  const latestWeightForBmi = vitals.weight ? parseFloat(vitals.weight.value) : user?.weight;
  const bmiVal = dashData?.bmi != null
    ? String(dashData.bmi)
    : (user?.height && latestWeightForBmi)
      ? (latestWeightForBmi / ((user.height / 100) ** 2)).toFixed(1)
      : null;
  const bmiStatus = bmiVal
    ? (parseFloat(bmiVal) < 18.5 ? { label: '偏轻', bg: '#EBF5FB', color: '#0077B6' }
      : parseFloat(bmiVal) < 24   ? { label: '正常', bg: '#E8F5EF', color: colors.success }
      : parseFloat(bmiVal) < 28   ? { label: '超重', bg: '#FEF3E2', color: '#D97706' }
      :                              { label: '肥胖', bg: '#FDECEA', color: colors.danger })
    : { label: '待记录', bg: '#F5F5F5', color: colors.textMuted };

  // 健康管家团队展示已移至"我的"页（2026-07-18 首页瘦身），此处不再计算
  const hour  = new Date().getHours();
  const greeting   = hour < 12 ? '早上好' : hour < 18 ? '下午好' : '晚上好';
  const statusEmoji = score >= 80 ? '✨' : score >= 60 ? '💪' : '🌱';
  const statusText  = score >= 80 ? '今天状态不错' : score >= 60 ? '继续保持' : '需要关注';

  // 趋势状态文案：把评分/指标异常转成一句能直接照做的行动建议，而不是抽象的"需关注"
  // 优先级：血压/血糖异常 > 评分下降趋势 > 评分平稳提示
  const trendActionText = (() => {
    if (bpStatusKey !== 'normal') return `血压${bpStatus.label}，建议今天测量并联系医师`;
    if (bsStatusKey !== 'normal') return `血糖${bsStatus.label}，建议今天复测并联系医师`;
    if (scoreHistory.length >= 2) {
      const first = scoreHistory[0]?.score, last = scoreHistory[scoreHistory.length - 1]?.score;
      if (first != null && last != null) {
        if (last - first <= -3) return `近${scoreHistory.length}日评分下降，建议关注近期生活方式`;
        if (last - first >= 3) return `近${scoreHistory.length}日评分上升，继续保持`;
      }
      return `近${scoreHistory.length}日趋势稳定`;
    }
    return null;
  })();

  // 血压：优先 extra.sys/dia，否则解析 value 字符串
  const bpSys = bpRec?.extra?.sys ?? (bpRec?.value ? parseFloat(bpRec.value.split('/')[0]) : null);
  const bpDia = bpRec?.extra?.dia ?? (bpRec?.value ? parseFloat(bpRec.value.split('/')[1]) : null);
  const bpVal = bpRec ? `${bpSys} / ${bpDia}` : '--/--';
  const bpStatusKey = bpRec?.status || 'normal';

  // 血糖
  const bsVal = bsSrc?.value != null ? String(bsSrc.value) : '--';
  const bsStatusKey = bsSrc?.status || 'normal';

  const bpStatus = bpStatusKey === 'normal' ? { label: '正常', bg: '#E8F5EF', color: colors.success }
                 : bpStatusKey === 'low'    ? { label: '偏低', bg: '#EBF5FB', color: colors.info }
                 :                            { label: '偏高', bg: '#FDECEA', color: colors.danger };
  const bsStatus = bsStatusKey === 'normal' ? { label: '正常', bg: '#E8F5EF', color: colors.success }
                 : bsStatusKey === 'low'    ? { label: '偏低', bg: '#EBF5FB', color: colors.info }
                 :                            { label: '偏高', bg: '#FEF9E7', color: colors.warning };

  // 睡眠时长：优先使用真实记录，Demo 用户无记录时展示示例数据
  const sleepRec      = dashData?.latestVitals?.sleep;
  const sleepHours    = sleepRec ? parseFloat(sleepRec.value) : (isDemo ? 8.3 : null);
  const sleepBedTime  = sleepRec?.extra?.sleepTime || (isDemo ? '22:30' : '--:--');
  const sleepWakeTime = sleepRec?.extra?.wakeTime  || (isDemo ? '06:45' : '--:--');
  const sleepLabel      = sleepHours == null ? '待录入'
    : sleepHours < 6  ? '偏少' : sleepHours <= 9 ? '良好' : '偏多';
  const sleepLabelColor = sleepHours == null ? colors.textMuted
    : sleepHours < 6  ? colors.danger : sleepHours <= 9 ? colors.success : '#D97706';
  const sleepBg         = sleepHours == null ? '#F5F5F5'
    : sleepHours < 6  ? '#FDECEA' : sleepHours <= 9 ? '#E8F5EF' : '#FEF3E2';

  // ── 固定打卡项目（11项，始终显示）────────────────────────────────
  const dynamicCheckinItems = FIXED_CHECKIN_KEYS.map(k => CHECKIN_DEFS[k]).filter(Boolean);

  // 随访计划紧急程度：按实际日期与今天的差值动态算，不再写死"今天"
  // 逾期未随访=紧急，当天=今天，1-2天内=即将，更远=不特别标注（沿用即将样式）
  const urgencyByDate = (dateVal) => {
    if (!dateVal) return 'low'
    const diffDays = Math.floor((new Date(dateVal).setHours(0,0,0,0) - new Date().setHours(0,0,0,0)) / 86400000)
    if (diffDays < 0) return 'high'
    if (diffDays === 0) return 'medium'
    return 'low'
  }

  // ── 合并待办：Task 表任务 + 随访计划（作为任务展示）─────────────
  // 已完成/已取消的随访（不管是用户自己标记完成，还是医护端执行随访后置为completed）都不再展示为待办，
  // 首页与"全部待办"页面（TasksScreen.js）保持同一口径，避免此前"医护端已完成但首页仍显示待办"的不一致。
  const allPendingTaskItems = [
    ...allTasks,
    ...followupPlans.filter(plan => !plan.completedByUser && !['completed', 'cancelled'].includes(plan.status)).map(plan => ({
      _id: plan._id,
      type: 'followup',
      title: plan.theme || '随访计划',
      description: plan.content,
      assignee: plan.staffId?.name || '医护团队',
      dueDate: plan.date
        ? new Date(plan.date).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
        : '',
      dueTime: '',
      priority: urgencyByDate(plan.date),
      followupType: plan.type,
      checkInItems: plan.checkInItems,
      formFields: plan.followUpSchemeId?.formId?.fields || [],
      formData: plan.formData || {},
    })),
  ];

  if (loading) {
    return <SafeAreaView style={styles.container}><HomeScreenSkeleton /></SafeAreaView>;
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {/* ── 顶部 Logo 栏 ──────────────────────────────────────── */}
        <View style={styles.topBar}>
          <View>
            <Text style={styles.logo}>嘉医汇</Text>
            <Text style={styles.logoSub}>私人家庭医生，全生命周期健康管理</Text>
          </View>
          <TouchableOpacity
            style={styles.avatarChip}
            onPress={() => navigation.navigate('Profile')}
          >
            <Text style={styles.avatarInitial}>{name[0]}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.body}>

          {/* ── 问候英雄卡 ────────────────────────────────────────── */}
          <View style={styles.heroCard}>
            <Text style={styles.heroGreeting}>{greeting}</Text>
            <Text style={styles.heroName}>
              {name}，{statusText} {statusEmoji}
            </Text>
            <View style={styles.heroScoreRow}>
              {scoreDisplay != null ? (
                <AnimatedNumber value={scoreDisplay} style={styles.heroScoreNum} duration={900} />
              ) : (
                <Text style={[styles.heroScoreNum, { color: 'rgba(255,255,255,0.4)' }]}>--</Text>
              )}
              <View style={styles.heroScoreMeta}>
                <Text style={styles.heroScoreLabel}>
                  {scoreDisplay != null ? '健康评分 / 100' : '暂无评分，请录入数据'}
                </Text>
                {scoreDisplay != null && (() => {
                  const grade = user?.healthScoreDetail?.grade || (scoreDisplay >= 90 ? '优' : scoreDisplay >= 75 ? '良' : scoreDisplay >= 60 ? '中' : '差')
                  const gradeColors = { '优': '#22A06B', '良': '#86EFAC', '中': '#FCD34D', '差': '#FCA5A5' }
                  return (
                    <Text style={{ fontSize: 13, fontWeight: '700', color: gradeColors[grade] || '#fff', marginTop: 2 }}>
                      {grade}
                    </Text>
                  )
                })()}
                {isDemo && <Text style={styles.heroScoreTrend}>↑ 较上月 +3 分</Text>}
              </View>
              {scoreDisplay != null && scoreHistory.length >= 2 && (
                <View style={styles.heroTrendLine}>
                  <ScoreTrendLine history={scoreHistory} />
                </View>
              )}
            </View>
            {trendActionText && (
              <Text style={styles.heroTrendActionText}>{trendActionText}</Text>
            )}
          </View>

          {/* 成长卡片（连续打卡）已下移到"今日健康打卡"板块顶部，与打卡网格合并为一个整体（2026-07-09） */}
          {/* ── 今日健康打卡 ──────────────────────────────────────── */}
          {(() => {
            const items = dynamicCheckinItems;
            // 2026-07-09：统一"是否已打卡"判定——本地checkin(即时反馈) 或 后端当天有该type记录(todayRecordedTypes)。
            // 后端记录按 item.key 匹配(打卡写库时 type=item.key)，覆盖全部类型，不再只对 measureType 项生效。
            // 这样医护端首次代录入(写后端HealthRecord)后，用户端能正确显示对应项已打卡✓，实现两端同步。
            const isItemDone = (item) => !!checkin[item.key]?.done || todayRecordedTypes.has(item.key) || (item.measureType && todayRecordedTypes.has(item.measureType));
            const doneCount = items.filter(isItemDone).length;
            const openCheckinModal = (item) => {
              // 2026-07-09 #11 防重复打卡：当天已打卡(本地或后端)的项不允许再次打卡。
              // 例外：饮食(allowMultiple)一日三餐/加餐都要打卡，不做当天去重，可反复记录。
              if (isItemDone(item) && !item.allowMultiple) { Alert.alert('今日已打卡', '这一项今天已经打过卡了，明天再来吧～'); return; }
              if (item.measureType) {
                // 生理指标类（血压/体重/睡眠/心率/血糖）：原地弹窗填写，不跳转页面，与饮食/运动打卡体验一致
                setMeasureValues({});
                setMeasureOption('');
                setMeasureNote('');
                setCheckinDate(todayStr);
                setMeasureModal(item);
                return;
              }
              // 支持多次打卡的项目（目前仅饮食，一日三餐/加餐分开记录）：每次打开都是全新的一次记录，
              // 不带上一次填写的内容——此前预填充 existing.note/image，导致用户打完早餐卡再打午餐卡时，
              // 早餐的备注文字还留在输入框里（2026-07-13 反馈"不要把之前的记忆留着"）
              if (item.allowMultiple) {
                setCheckinNote('');
                setCheckinImage(null);
              } else {
                const existing = checkin[item.key] || {};
                setCheckinNote(existing.note || '');
                setCheckinImage(existing.image || null);
              }
              setCheckinMealType('');
              setCheckinSaving(false);
              setCheckinDate(todayStr); // 每次打开默认今天，用户可改为昨天/过去日期补录
              setCheckinModal(item);
            };
            const saveMeasureCheckin = async () => {
              if (measureSaving) return;
              const item = measureModal;
              const measureType = item.measureType;
              const fields = MEASURE_FIELDS[measureType] || [];
              const isToday = checkinDate === todayStr;

              const hasValue = measureType === 'sleep'
                ? (measureValues.sleepTime && measureValues.wakeTime)
                : fields.every(f => measureValues[f.key]);
              if (!hasValue) {
                Alert.alert('请填写完整', measureType === 'sleep' ? '请填写入睡时间和醒来时间' : '请填写完整数值');
                return;
              }

              let payload = {
                category: item.category || 'vitals',
                type: measureType,
                label: item.recordLabel || item.label,
                unit: fields[0]?.unit || '',
                note: [measureOption, measureNote].filter(Boolean).join(' · '),
                recordedAt: isToday ? new Date().toISOString() : `${checkinDate}T12:00:00`,
              };

              if (measureType === 'bloodPressure') {
                const sys = parseInt(measureValues.sys, 10);
                const dia = parseInt(measureValues.dia, 10);
                payload.value = `${sys}/${dia}`;
                payload.extra = { sys, dia };
                payload.status = sys >= 140 || dia >= 90 ? 'warning' : sys < 90 || dia < 60 ? 'low' : 'normal';
              } else if (measureType === 'sleep') {
                const dur = calcSleepDurationHome(measureValues.sleepTime, measureValues.wakeTime);
                payload.value = String(dur);
                payload.unit = '小时';
                payload.extra = { sleepTime: measureValues.sleepTime, wakeTime: measureValues.wakeTime };
                const durF = parseFloat(dur);
                payload.status = durF >= 7 && durF <= 9 ? 'normal' : durF < 7 ? 'low' : 'warning';
              } else {
                payload.value = String(measureValues.value);
                const v = parseFloat(measureValues.value);
                payload.status = measureType === 'bloodSugar' ? (v > 7 ? 'warning' : v < 3.9 ? 'low' : 'normal')
                  : measureType === 'heartRate' ? (v > 100 ? 'warning' : v < 60 ? 'low' : 'normal')
                  : measureType === 'mood' ? (v >= 6 ? 'normal' : 'warning')
                  : 'normal';
                if (measureType === 'bloodSugar' && measureOption) payload.extra = { mealType: measureOption };
                if (measureType === 'mood') setMoodScore(v);
              }

              setMeasureSaving(true);
              if (isToday) {
                const next = { ...checkin, [item.key]: { done: true, note: '', image: null } };
                setCheckin(next);
                try { localStorage.setItem(TODAY_KEY, JSON.stringify(next)); } catch {}
              }
              try {
                await recordsAPI.create(payload);
              } catch (err) {
                setMeasureSaving(false);
                Alert.alert('保存失败', err.message || '网络异常，请重试');
                return;
              }
              setMeasureSaving(false);
              setMeasureModal(null);
            };
            const saveCheckin = async () => {
              if (checkinSaving) return;
              const item = checkinModal;
              // 饮食打卡必须标注是哪一餐，否则医护端看不出这次记录对应早中晚还是加餐（2026-07-13 需求）
              if (item.key === 'diet' && !checkinMealType) {
                Alert.alert('请选择餐次', '这次记录的是早餐、午餐、晚餐还是加餐？');
                return;
              }
              const isToday = checkinDate === todayStr;
              setCheckinSaving(true);
              const mealPrefix = item.key === 'diet' && checkinMealType ? `【${checkinMealType}】` : '';
              try {
                // 同步到后端健康档案，带归属日期（recordedAt）。补录昨天时设为当天中午12点，避免时区把日期算错一天
                await recordsAPI.create({
                  category: item.category || 'lifestyle',
                  type: item.key,
                  label: mealPrefix ? `${item.recordLabel || item.label}·${checkinMealType}` : (item.recordLabel || item.label),
                  // value已经把checkinNote拼进去展示了，note不能再存一遍同样的文字，否则医护端"数值+备注"拼接展示会重复两遍
                  value: (mealPrefix + checkinNote) || checkinMealType || '已打卡',
                  note: '',
                  status: 'normal',
                  imageUrl: checkinImage || '',
                  extra: { ...(checkinImage ? { imageUrl: checkinImage } : {}), ...(checkinMealType ? { mealType: checkinMealType } : {}) },
                  recordedAt: isToday ? new Date().toISOString() : `${checkinDate}T12:00:00`,
                });
              } catch (err) {
                // 此前这里是空 catch 静默吞掉错误，弹窗照样关闭，用户会以为提交成功了，实际后端没收到——
                // 2026-07-13 反馈"设置昨天时，提交并没有保存"就是这里：请求失败没有任何提示，看起来像卡住不动
                setCheckinSaving(false);
                Alert.alert('保存失败', err.message || '网络异常，请重试');
                return;
              }
              setCheckinSaving(false);
              // 只有归属日=今天的打卡，才更新"今日已打卡"本地状态；补录过去日期不影响今天的打卡进度显示
              if (isToday) {
                const next = { ...checkin, [item.key]: { done: true, note: checkinNote, image: checkinImage } };
                setCheckin(next);
                try { localStorage.setItem(TODAY_KEY, JSON.stringify(next)); } catch {}
              }
              setCheckinModal(null);
            };
            return (
              <>
              {/* 连续打卡成长卡片：与今日打卡网格合并为一个整体，点"去打卡"不再跳转，直接在下方网格打卡 */}
              <GrowthCard growth={dashData?.growth} onCheckin={() => {}} />
              <View style={styles.checkinCard}>
                <View style={styles.checkinHeader}>
                  <View style={styles.sectionTitleRow}>
                    <Ionicons name="checkmark-done-outline" size={16} color={colors.primary} />
                    <Text style={styles.checkinTitle}>今日健康打卡</Text>
                  </View>
                  {items.length > 0 && (
                    <Text style={styles.checkinProgress}>{doneCount}/{items.length}</Text>
                  )}
                </View>

                {items.length === 0 ? (
                  <View style={styles.checkinEmpty}>
                    <Ionicons name="calendar-outline" size={28} color={colors.textMuted} />
                    <Text style={styles.checkinEmptyTitle}>暂无打卡任务</Text>
                    <Text style={styles.checkinEmptyText}>待医护团队安排随访计划后{'\n'}打卡任务将自动出现</Text>
                  </View>
                ) : (
                  <>
                    <View style={styles.checkinGrid}>
                      {items.map(item => {
                        const isDone = isItemDone(item);
                        const hasNote = !!(checkin[item.key]?.note || checkin[item.key]?.image);
                        return (
                          <TouchableOpacity
                            key={item.key}
                            style={[styles.checkinItem, isDone && { backgroundColor: item.color + '15', borderColor: item.color + '40' }]}
                            onPress={() => openCheckinModal(item)}
                            activeOpacity={0.75}
                          >
                            <View style={[styles.checkinIconWrap, { backgroundColor: isDone ? item.color + '20' : colors.border + '60' }]}>
                              <Ionicons name={isDone ? 'checkmark-circle' : item.icon} size={20}
                                color={isDone ? item.color : colors.textMuted} />
                            </View>
                            <Text style={[styles.checkinItemLabel, isDone && { color: item.color, fontWeight: '700' }]}>
                              {item.label}
                            </Text>
                            {item.measureType && !isDone && (
                              <View style={{ position: 'absolute', bottom: 4, right: 4 }}>
                                <Ionicons name="add-circle-outline" size={12} color={item.color} />
                              </View>
                            )}
                            {hasNote && !item.measureType && (
                              <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: item.color, position: 'absolute', top: 6, right: 6 }} />
                            )}
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                    {doneCount === items.length && items.length > 0 && (
                      <View style={styles.checkinAllDone}>
                        <Ionicons name="star" size={14} color="#F39C12" />
                        <Text style={styles.checkinAllDoneText}>今日打卡全部完成！保持健康好习惯 🎉</Text>
                      </View>
                    )}
                  </>
                )}

                {/* 打卡记录弹窗（仅用于生活方式打卡项） */}
                <Modal visible={!!checkinModal} transparent animationType="slide" onRequestClose={() => setCheckinModal(null)}>
                  <View style={styles.checkinModalOverlay}>
                    <View style={styles.checkinModalBox}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          {checkinModal && <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: checkinModal.color + '20', alignItems: 'center', justifyContent: 'center' }}>
                            <Ionicons name={checkinModal.icon} size={18} color={checkinModal.color} />
                          </View>}
                          <Text style={{ fontSize: 16, fontWeight: '700', color: colors.textPrimary }}>{checkinModal?.label} 打卡</Text>
                        </View>
                        <TouchableOpacity onPress={() => setCheckinModal(null)}>
                          <Ionicons name="close" size={22} color={colors.textMuted} />
                        </TouchableOpacity>
                      </View>

                      {/* 归属日期：默认今天，可补录昨天/前天/任意过去日期（饮水/排便/运动/睡眠常是昨天的） */}
                      <Text style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 6 }}>这是哪一天的情况</Text>
                      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                        {[
                          { label: '今天', d: 0 },
                          { label: '昨天', d: 1 },
                          { label: '前天', d: 2 },
                        ].map(({ label, d }) => {
                          const dt = new Date(); dt.setDate(dt.getDate() - d);
                          const ds = toLocalDateStr(dt);
                          const active = checkinDate === ds;
                          return (
                            <TouchableOpacity key={label} onPress={() => setCheckinDate(ds)}
                              style={{ paddingVertical: 6, paddingHorizontal: 14, borderRadius: 8,
                                backgroundColor: active ? colors.primary : colors.border + '50',
                                borderWidth: 1, borderColor: active ? colors.primary : colors.border }}>
                              <Text style={{ fontSize: 13, fontWeight: active ? '700' : '500', color: active ? '#fff' : colors.textSecondary }}>{label}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                      {/* 更早日期：web 用原生日期选择，原生端提示用快捷键 */}
                      {Platform.OS === 'web' ? (
                        <input type="date" value={checkinDate} max={todayStr}
                          onChange={(e) => e.target.value && setCheckinDate(e.target.value)}
                          style={{ marginBottom: 14, padding: '7px 10px', borderRadius: 8, border: `1px solid ${colors.border}`, fontSize: 14, color: colors.textPrimary, background: colors.surface, width: '60%' }} />
                      ) : (
                        <Text style={{ fontSize: 12, color: colors.textMuted, marginBottom: 14 }}>当前记录归属：{checkinDate}</Text>
                      )}

                      {/* 饮食打卡必须标注是哪一餐：可能一次性打一天的卡，也可能一日三餐+加餐分开各打一次，
                          医护端要能一眼看出这条记录对应哪一餐（2026-07-13 需求） */}
                      {checkinModal?.key === 'diet' && (
                        <>
                          <Text style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 6 }}>这是哪一餐</Text>
                          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                            {['早餐', '午餐', '晚餐', '加餐'].map(mt => {
                              const active = checkinMealType === mt;
                              return (
                                <TouchableOpacity key={mt} onPress={() => setCheckinMealType(mt)}
                                  style={{ paddingVertical: 6, paddingHorizontal: 14, borderRadius: 8,
                                    backgroundColor: active ? checkinModal.color : colors.border + '50',
                                    borderWidth: 1, borderColor: active ? checkinModal.color : colors.border }}>
                                  <Text style={{ fontSize: 13, fontWeight: active ? '700' : '500', color: active ? '#fff' : colors.textSecondary }}>{mt}</Text>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        </>
                      )}

                      <Text style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 6 }}>记录内容（可选）</Text>
                      <TextInput
                        style={styles.checkinNoteInput}
                        multiline
                        numberOfLines={3}
                        placeholder={`记录今天的${checkinModal?.label}情况...`}
                        placeholderTextColor={colors.textMuted}
                        value={checkinNote}
                        onChangeText={setCheckinNote}
                      />
                      <Text style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 8, marginTop: 12 }}>上传图片（可选）</Text>
                      <TouchableOpacity
                        style={styles.checkinImageBtn}
                        onPress={() => {
                          if (Platform.OS === 'web') {
                            const input = document.createElement('input');
                            input.type = 'file'; input.accept = 'image/*';
                            input.onchange = (e) => {
                              const file = e.target.files[0];
                              if (!file) return;
                              const reader = new FileReader();
                              reader.onload = (ev) => setCheckinImage(ev.target.result);
                              reader.readAsDataURL(file);
                            };
                            input.click();
                          }
                        }}
                      >
                        {checkinImage ? (
                          <Image source={{ uri: checkinImage }} style={{ width: '100%', height: 120, borderRadius: 8 }} resizeMode="cover" />
                        ) : (
                          <View style={{ alignItems: 'center', gap: 6 }}>
                            <Ionicons name="camera-outline" size={28} color={colors.textMuted} />
                            <Text style={{ fontSize: 13, color: colors.textMuted }}>点击上传图片</Text>
                          </View>
                        )}
                      </TouchableOpacity>
                      {checkinImage && (
                        <TouchableOpacity onPress={() => setCheckinImage(null)} style={{ alignSelf: 'flex-end', marginTop: 4 }}>
                          <Text style={{ fontSize: 12, color: colors.danger }}>删除图片</Text>
                        </TouchableOpacity>
                      )}
                      <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
                        <TouchableOpacity style={[styles.checkinModalBtn, { backgroundColor: colors.border }]} onPress={() => setCheckinModal(null)} disabled={checkinSaving}>
                          <Text style={{ fontSize: 15, fontWeight: '600', color: colors.textSecondary }}>取消</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.checkinModalBtn, { backgroundColor: checkinModal?.color || colors.primary, flex: 2, opacity: checkinSaving ? 0.6 : 1 }]} onPress={saveCheckin} disabled={checkinSaving}>
                          {checkinSaving ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="checkmark" size={18} color="#fff" />}
                          <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff', marginLeft: 4 }}>{checkinSaving ? '保存中...' : '完成打卡'}</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                </Modal>

                {/* 生理指标打卡弹窗（血压/体重/睡眠/心率/血糖），原地填写，独立提交 */}
                <Modal visible={!!measureModal} transparent animationType="slide" onRequestClose={() => setMeasureModal(null)}>
                  <View style={styles.checkinModalOverlay}>
                    <View style={styles.checkinModalBox}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          {measureModal && <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: measureModal.color + '20', alignItems: 'center', justifyContent: 'center' }}>
                            <Ionicons name={measureModal.icon} size={18} color={measureModal.color} />
                          </View>}
                          <Text style={{ fontSize: 16, fontWeight: '700', color: colors.textPrimary }}>{measureModal?.label} 打卡</Text>
                        </View>
                        <TouchableOpacity onPress={() => setMeasureModal(null)}>
                          <Ionicons name="close" size={22} color={colors.textMuted} />
                        </TouchableOpacity>
                      </View>

                      {measureModal && MEASURE_OPTIONS_HOME[measureModal.measureType] && (
                        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                          {MEASURE_OPTIONS_HOME[measureModal.measureType].map(opt => {
                            const active = measureOption === opt;
                            return (
                              <TouchableOpacity key={opt} onPress={() => setMeasureOption(opt)}
                                style={{ paddingVertical: 6, paddingHorizontal: 14, borderRadius: 8,
                                  backgroundColor: active ? colors.primary : colors.border + '50',
                                  borderWidth: 1, borderColor: active ? colors.primary : colors.border }}>
                                <Text style={{ fontSize: 13, fontWeight: active ? '700' : '500', color: active ? '#fff' : colors.textSecondary }}>{opt}</Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      )}

                      {measureModal && measureModal.measureType === 'sleep' ? (
                        <View>
                          {[
                            { key: 'sleepTime', label: '入睡时间', placeholder: '如：22:30' },
                            { key: 'wakeTime',  label: '醒来时间', placeholder: '如：06:30' },
                          ].map(f => (
                            <View key={f.key} style={{ marginBottom: 12 }}>
                              <Text style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 6 }}>{f.label}</Text>
                              <TextInput
                                style={styles.checkinNoteInput}
                                placeholder={f.placeholder}
                                placeholderTextColor={colors.textMuted}
                                value={measureValues[f.key] || ''}
                                onChangeText={v => setMeasureValues(prev => ({ ...prev, [f.key]: v }))}
                              />
                            </View>
                          ))}
                          {measureValues.sleepTime && measureValues.wakeTime ? (
                            <Text style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 8 }}>
                              睡眠时长：<Text style={{ fontWeight: '700', color: '#7B68EE' }}>{calcSleepDurationHome(measureValues.sleepTime, measureValues.wakeTime)} 小时</Text>
                            </Text>
                          ) : null}
                        </View>
                      ) : (
                        measureModal && (MEASURE_FIELDS[measureModal.measureType] || []).map(field => (
                          <View key={field.key} style={{ marginBottom: 12 }}>
                            <Text style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 2 }}>{field.label}（正常值：{field.normal}）</Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.background, borderRadius: radius.sm, borderWidth: 2, borderColor: colors.border, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs + 2 }}>
                              <TextInput
                                style={{ flex: 1, fontSize: 20, fontWeight: '700', color: colors.textPrimary }}
                                placeholder={field.placeholder}
                                placeholderTextColor={colors.textMuted}
                                keyboardType="decimal-pad"
                                value={measureValues[field.key] || ''}
                                onChangeText={v => setMeasureValues(prev => ({ ...prev, [field.key]: v }))}
                              />
                              <Text style={{ fontSize: 12, color: colors.textMuted }}>{field.unit}</Text>
                            </View>
                          </View>
                        ))
                      )}

                      <View style={{ marginBottom: 12 }}>
                        <Text style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 6 }}>备注（可选，如异常原因）</Text>
                        <TextInput
                          style={styles.checkinNoteInput}
                          placeholder="如：血压偏高，昨晚熬夜了"
                          placeholderTextColor={colors.textMuted}
                          value={measureNote}
                          onChangeText={setMeasureNote}
                          multiline
                        />
                      </View>

                      <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
                        <TouchableOpacity style={[styles.checkinModalBtn, { backgroundColor: colors.border }]} onPress={() => setMeasureModal(null)} disabled={measureSaving}>
                          <Text style={{ fontSize: 15, fontWeight: '600', color: colors.textSecondary }}>取消</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.checkinModalBtn, { backgroundColor: measureModal?.color || colors.primary, flex: 2, opacity: measureSaving ? 0.6 : 1 }]} onPress={saveMeasureCheckin} disabled={measureSaving}>
                          {measureSaving ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="checkmark" size={18} color="#fff" />}
                          <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff', marginLeft: 4 }}>{measureSaving ? '保存中...' : '完成打卡'}</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                </Modal>
              </View>
              </>
            );
          })()}

          {/* ── 健康指标区块已移除（2026-07-18 首页瘦身）──────────────
              血压/血糖/BMI/睡眠/情绪不再在首页展示，用户可在"健康档案"页查看完整指标。
              情绪打卡待第二批"打卡页重构"时并入打卡流程。 */}

          {/* ── 待办任务 ──────────────────────────────────────────── */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>待办任务</Text>
              <TouchableOpacity
                style={styles.sectionMore}
                onPress={() => navigation.navigate('Tasks')}
              >
                <Text style={styles.sectionMoreText}>全部</Text>
                <Ionicons name="chevron-forward" size={14} color={colors.primary} />
              </TouchableOpacity>
            </View>
            <View style={styles.taskCard}>
              {allPendingTaskItems.length === 0 && todayReminders.length === 0 ? (
                <View style={styles.emptyTask}>
                  <Ionicons name="checkmark-circle-outline" size={32} color={colors.success} />
                  <Text style={styles.emptyTaskText}>暂无待办任务</Text>
                </View>
              ) : (
                <>
                  {allPendingTaskItems.slice(0, 3).map((t, i, arr) => {
                    const isLast = i === arr.length - 1 && todayReminders.length === 0;
                    return <TaskItem key={t._id || t.id || i} task={t} isLast={isLast} onPress={setTaskDetailModal} />;
                  })}
                  {todayReminders.map((r, i) => (
                    <ReminderItem
                      key={r._id || i}
                      reminder={r}
                      isLast={i === todayReminders.length - 1}
                    />
                  ))}
                </>
              )}
            </View>
            {allPendingTaskItems.length > 3 && (
              <TouchableOpacity
                style={styles.reminderHint}
                onPress={() => navigation.navigate('Tasks')}
                activeOpacity={0.7}
              >
                <Ionicons name="ellipsis-horizontal-circle-outline" size={12} color={colors.primary} />
                <Text style={styles.reminderHintText}>还有 {allPendingTaskItems.length - 3} 项待办 · 查看全部</Text>
                <Ionicons name="chevron-forward" size={12} color={colors.primary} />
              </TouchableOpacity>
            )}
            {todayReminders.length > 0 && (
              <TouchableOpacity
                style={styles.reminderHint}
                onPress={() => navigation.navigate('Reminders')}
                activeOpacity={0.7}
              >
                <Ionicons name="notifications-outline" size={12} color={colors.primary} />
                <Text style={styles.reminderHintText}>今日 {todayReminders.length} 条提醒已合并 · 管理提醒</Text>
                <Ionicons name="chevron-forward" size={12} color={colors.primary} />
              </TouchableOpacity>
            )}
          </View>

          {/* ── 我的健康管家团队已移至"我的"页（2026-07-18 首页瘦身）──── */}


        </View>
        <View style={{ height: spacing.xl * 2 }} />
      </ScrollView>

      {/* ── 任务详情弹窗 ────────────────────────────────────────── */}
      {taskDetailModal && (() => {
        const t = taskDetailModal;
        const iconCfg = TASK_ICON_CONFIG[t.type] || TASK_ICON_CONFIG.followup;
        const handleComplete = async () => {
          if (!t._id || t.type === 'followup') return;
          setTaskCompleting(true);
          try {
            await tasksAPI.complete(t._id);
            setAllTasks(prev => prev.filter(x => x._id !== t._id));
            setTaskDetailModal(null);
          } catch {}
          finally { setTaskCompleting(false); }
        };
        return (
          <Modal visible transparent animationType="slide" onRequestClose={() => setTaskDetailModal(null)}>
            <View style={styles.taskModalOverlay}>
              <View style={styles.taskModalCard}>
                <View style={styles.taskModalHandle} />
                <View style={styles.taskModalHeader}>
                  <View style={[styles.taskIconWrap, { backgroundColor: iconCfg.bg }]}>
                    <Ionicons name={iconCfg.icon} size={22} color={iconCfg.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.taskModalTitle}>{t.title}</Text>
                    <Text style={styles.taskModalMeta}>{t.assignee}{t.dueDate ? ` · ${t.dueDate}` : ''}{t.dueTime ? ` ${t.dueTime}` : ''}</Text>
                  </View>
                  <TouchableOpacity onPress={() => setTaskDetailModal(null)}>
                    <Ionicons name="close" size={22} color={colors.textMuted} />
                  </TouchableOpacity>
                </View>
                {t.type === 'followup' ? (
                  <View style={{ paddingHorizontal: 20, paddingBottom: 8 }}>
                    {!!t.followupType && (
                      <View style={{ flexDirection: 'row', marginBottom: 10 }}>
                        <Text style={{ fontSize: 13, color: colors.textMuted, width: 64 }}>随访方式</Text>
                        <Text style={{ fontSize: 13, color: colors.textPrimary, flex: 1 }}>
                          {{ phone: '电话随访', wechat: '微信随访', visit: '上门随访', video: '视频随访', other: '其他' }[t.followupType] || t.followupType}
                        </Text>
                      </View>
                    )}
                    {t.checkInItems?.length > 0 && (
                      <View style={{ flexDirection: 'row', marginBottom: 10 }}>
                        <Text style={{ fontSize: 13, color: colors.textMuted, width: 64 }}>打卡项目</Text>
                        <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                          {t.checkInItems.map((k, i) => (
                            <View key={i} style={{ backgroundColor: '#E8F5EF', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 99 }}>
                              <Text style={{ fontSize: 12, color: '#1E6B50' }}>
                                {{'diet':'饮食','exercise':'运动','sleep':'睡眠','alcohol':'烟酒','weight':'体重','bloodPressure':'血压','bloodSugar':'血糖','heartRate':'心率','water':'饮水'}[k] || k}
                              </Text>
                            </View>
                          ))}
                        </View>
                      </View>
                    )}
                    {!!t.description && (
                      <View style={{ flexDirection: 'row', marginBottom: 4 }}>
                        <Text style={{ fontSize: 13, color: colors.textMuted, width: 64 }}>备注</Text>
                        <Text style={{ fontSize: 13, color: colors.textPrimary, flex: 1 }}>{t.description}</Text>
                      </View>
                    )}
                    {t.formFields?.length > 0 && (
                      <View style={{ marginTop: 12 }}>
                        <View style={{ height: 1, backgroundColor: colors.border, marginBottom: 12 }} />
                        {t.formFields.map((field, fi) => {
                          const val = t.formData?.[field.label];
                          const displayVal = Array.isArray(val) ? val.join('、') : (val ?? '—');
                          return (
                            <View key={fi} style={{ flexDirection: 'row', marginBottom: 10 }}>
                              <Text style={{ fontSize: 13, color: colors.textMuted, width: 80 }}>{field.label}</Text>
                              <Text style={{ fontSize: 13, color: colors.textPrimary, flex: 1 }}>{displayVal}</Text>
                            </View>
                          );
                        })}
                      </View>
                    )}
                    {!t.followupType && !t.checkInItems?.length && !t.description && !t.formFields?.length && (
                      <Text style={{ fontSize: 13, color: colors.textMuted, textAlign: 'center', paddingVertical: 8 }}>暂无详细内容</Text>
                    )}
                  </View>
                ) : (
                  !!t.description && (
                    <Text style={styles.taskModalDesc}>{t.description}</Text>
                  )
                )}
                <View style={styles.taskModalFooter}>
                  <TouchableOpacity
                    style={styles.taskModalCancelBtn}
                    onPress={() => setTaskDetailModal(null)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.taskModalCancelText}>关闭</Text>
                  </TouchableOpacity>
                  {t.type !== 'followup' && (
                    <TouchableOpacity
                      style={[styles.taskModalCompleteBtn, taskCompleting && { opacity: 0.6 }]}
                      onPress={handleComplete}
                      disabled={taskCompleting}
                      activeOpacity={0.85}
                    >
                      <Ionicons name="checkmark-circle-outline" size={16} color={colors.white} />
                      <Text style={styles.taskModalCompleteText}>标记已完成</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </View>
          </Modal>
        );
      })()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

  // 顶部 Logo 栏
  topBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm,
    backgroundColor: colors.background,
  },
  logo: { fontSize: 22, fontWeight: '800', color: colors.primary, letterSpacing: -0.3 },
  logoSub: { fontSize: 10, color: colors.textMuted, marginTop: 2, letterSpacing: 0.2 },
  avatarChip: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarInitial: { fontSize: 16, fontWeight: '700', color: colors.white },

  body: { paddingHorizontal: spacing.lg },

  // 问候英雄卡
  heroCard: {
    backgroundColor: '#1A2B24',
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  heroGreeting: { fontSize: 14, color: 'rgba(255,255,255,0.65)', marginBottom: 4 },
  heroName: { fontSize: 20, fontWeight: '700', color: colors.white, marginBottom: spacing.md, letterSpacing: -0.3 },
  heroScoreRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  heroScoreNum: { fontSize: 56, fontWeight: '800', color: colors.white, lineHeight: 60, letterSpacing: -2 },
  heroScoreMeta: { gap: 4 },
  heroScoreLabel: { fontSize: 13, color: 'rgba(255,255,255,0.65)', fontWeight: '500' },
  heroScoreTrend: {
    fontSize: 12, color: colors.white, fontWeight: '600',
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.full,
    alignSelf: 'flex-start',
  },
  heroTrendLine: { marginLeft: 'auto', alignItems: 'center', gap: 3 },
  heroTrendLabel: { fontSize: 9, color: 'rgba(255,255,255,0.45)' },
  heroTrendActionText: { fontSize: 12, color: 'rgba(255,255,255,0.85)', marginTop: spacing.sm, lineHeight: 17 },

  // 今日打卡
  checkinCard: {
    backgroundColor: colors.white, borderRadius: radius.lg,
    padding: spacing.md, marginBottom: spacing.lg,
    borderWidth: 1, borderColor: colors.border, ...shadow.sm,
  },
  checkinHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  checkinTitle: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  checkinProgress: { fontSize: 13, fontWeight: '700', color: colors.primary },
  checkinGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  checkinItem: {
    width: '30%', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 4,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.background, gap: 5,
  },
  checkinIconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  checkinItemLabel: { fontSize: 12, color: colors.textSecondary, fontWeight: '500' },
  checkinAllDone: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    marginTop: spacing.sm, padding: spacing.sm,
    backgroundColor: '#FEF9E7', borderRadius: radius.sm,
  },
  checkinAllDoneText: { fontSize: 12, color: '#B7791F', fontWeight: '600' },
  checkinEmpty: {
    alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.xs,
  },
  checkinEmptyTitle: { fontSize: 14, fontWeight: '600', color: colors.textSecondary, marginTop: spacing.xs },
  checkinEmptyText: { fontSize: 12, color: colors.textMuted, textAlign: 'center', lineHeight: 18 },

  // 打卡弹窗
  checkinModalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  checkinModalBox: {
    backgroundColor: colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: spacing.lg, paddingBottom: 36,
  },
  checkinNoteInput: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm,
    padding: 12, fontSize: 14, color: colors.textPrimary,
    minHeight: 80, textAlignVertical: 'top', backgroundColor: colors.background,
  },
  checkinImageBtn: {
    borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.sm,
    borderStyle: 'dashed', minHeight: 80, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.background, overflow: 'hidden',
  },
  checkinModalBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 13, borderRadius: radius.md,
  },

  // 通用 Section
  section: { marginBottom: spacing.lg },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm, gap: spacing.sm },
  sectionTitle: { fontSize: 10, fontWeight: '700', color: colors.textMuted, marginBottom: 12, letterSpacing: 1.2, textTransform: 'uppercase' },
  sectionMore: { flexDirection: 'row', alignItems: 'center', gap: 2, marginLeft: 'auto' },
  sectionMoreText: { fontSize: 13, color: colors.primary, fontWeight: '500' },

  // 新用户引导卡
  onboardBanner: {
    marginBottom: spacing.md,
    backgroundColor: colors.white, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.primary + '30',
    padding: spacing.md, gap: spacing.xs,
  },
  onboardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  onboardTitle: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  onboardSub: { fontSize: 12, color: colors.textMuted, marginBottom: spacing.xs },
  onboardStep: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, paddingHorizontal: spacing.sm,
    backgroundColor: colors.background, borderRadius: radius.sm,
  },
  onboardStepDone: { opacity: 0.6 },
  onboardStepIcon: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: colors.primary10,
    alignItems: 'center', justifyContent: 'center',
  },
  onboardStepLabel: { flex: 1, fontSize: 13, fontWeight: '600', color: colors.textPrimary },

  // 图表轴标签
  chartAxisLabel: { fontSize: 8, color: colors.textMuted, lineHeight: 10 },
  chartXLabel: { fontSize: 7, color: colors.textMuted, lineHeight: 10 },
  chartEmptyMini: {
    marginTop: 10, height: 52, borderRadius: 8,
    backgroundColor: colors.primary05,
    borderWidth: 1, borderColor: colors.primary + '20', borderStyle: 'dashed',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  chartEmptyMiniText: { fontSize: 11, color: colors.primary, fontWeight: '600' },

  // 今日待办 Tab
  taskTabRow: { flexDirection: 'row', gap: 4 },
  taskTab: {
    paddingHorizontal: 9, paddingVertical: 3,
    borderRadius: radius.full,
    borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.white,
  },
  taskTabActive: {
    backgroundColor: colors.primary, borderColor: colors.primary,
  },
  taskTabText: { fontSize: 10, fontWeight: '600', color: colors.textMuted },
  taskTabTextActive: { color: colors.white },

  // 今日待办
  taskCard: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
    overflow: 'hidden',
  },
  taskItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.md, paddingVertical: 14, gap: spacing.sm,
  },
  taskItemBorder: { borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  taskIconWrap: { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  taskBody: { flex: 1 },
  taskTitle: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  taskMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  urgencyBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.full, flexShrink: 0 },
  urgencyText: { fontSize: 11, fontWeight: '700' },
  emptyTask: { alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.sm },
  emptyTaskText: { fontSize: 14, color: colors.textMuted },
  reminderHint: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    marginTop: 6, paddingHorizontal: 4,
  },
  reminderHintText: { fontSize: 11, color: colors.primary, flex: 1, fontWeight: '500' },

  // 任务详情弹窗
  taskModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  taskModalCard: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: spacing.lg, paddingBottom: spacing.xl,
  },
  taskModalHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center', marginTop: 12, marginBottom: 16,
  },
  taskModalHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  taskModalTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  taskModalMeta: { fontSize: 12, color: colors.textMuted, marginTop: 3 },
  taskModalDesc: {
    fontSize: 14, color: colors.textSecondary, lineHeight: 21,
    backgroundColor: colors.background, borderRadius: radius.sm,
    padding: spacing.md, marginBottom: spacing.md,
  },
  taskModalFooter: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  taskModalCancelBtn: {
    flex: 1, paddingVertical: 12, borderRadius: radius.md,
    borderWidth: 1.5, borderColor: colors.border, alignItems: 'center',
  },
  taskModalCancelText: { fontSize: 14, color: colors.textSecondary, fontWeight: '600' },
  taskModalCompleteBtn: {
    flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 12, borderRadius: radius.md,
    backgroundColor: colors.primary,
  },
  taskModalCompleteText: { fontSize: 14, color: colors.white, fontWeight: '700' },

  // 更多入口
  moreGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
    overflow: 'hidden',
  },
  moreItem: {
    width: '33.33%', alignItems: 'center', justifyContent: 'center',
    paddingVertical: spacing.md, gap: 6,
    borderRightWidth: 1, borderBottomWidth: 1, borderColor: colors.borderLight,
  },
  moreLabel: { fontSize: 11, color: colors.textSecondary, fontWeight: '500' },
});

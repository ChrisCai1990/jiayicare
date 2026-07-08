import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, SafeAreaView, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, shadow } from '../../theme';
import { userAPI } from '../../services/api';
import tts from '../../utils/tts';
import AiRuleHint from '../../components/AiRuleHint';

const TABS = ['AI健康分析', 'AI风险评估'];

// 把AI健康分析结果拼接成一段可朗读的摘要文本
function buildSummarySpeech(sections) {
  const s = sections || {};
  const parts = [];
  if (s.lifestyle_assessment?.summary) parts.push(`生活方式评估：${s.lifestyle_assessment.summary}`);
  if (s.medical_priority?.items?.length) {
    parts.push('重点关注医疗问题：' + s.medical_priority.items.map(i => `${i.name}，${i.action || ''}`).join('；'));
  }
  if (s.tumor_risk?.summary) parts.push(`肿瘤筛查评估：${s.tumor_risk.summary}`);
  if (s.cardiovascular_risk?.summary) parts.push(`心脑血管风险：${s.cardiovascular_risk.summary}`);
  if (s.checkup_completeness?.suggestion) parts.push(`体检建议：${s.checkup_completeness.suggestion}`);
  return parts.join('。') || '暂无可播报的内容';
}

// 把AI风险评估结果拼接成一段可朗读的摘要文本
function buildRiskSpeech(data) {
  const dims = Array.isArray(data?.dimensions) ? data.dimensions : [];
  const parts = [];
  if (data?.overallSummary) parts.push(`整体风险评估：${data.overallSummary}`);
  dims.forEach(d => {
    if (d.advice) parts.push(`${d.label}：${d.advice}`);
  });
  return parts.join('。') || '暂无可播报的内容';
}

const URGENCY_META = {
  high:   { label: '高', bg: '#FEE2E2', color: '#DC2626' },
  medium: { label: '中', bg: '#FEF9EC', color: '#D97706' },
  low:    { label: '低', bg: '#F0FDF4', color: '#16A34A' },
};
const STATUS_META = {
  abnormal:      { label: '异常',   color: '#DC2626' },
  mild_abnormal: { label: '轻度异常', color: '#D97706' },
  normal:        { label: '正常',   color: '#16A34A' },
};
const RISK_LEVEL_META = {
  low:      { label: '低风险', bg: '#F0FDF4', color: '#16A34A', dot: '#22C55E' },
  medium:   { label: '中风险', bg: '#FEF9EC', color: '#D97706', dot: '#F59E0B' },
  high:     { label: '高风险', bg: '#FEF2F2', color: '#DC2626', dot: '#EF4444' },
  critical: { label: '危急值', bg: '#FEE2E2', color: '#B91C1C', dot: '#B91C1C' },
};

function SectionCard({ icon, title, children }) {
  return (
    <View style={styles.sectionCard}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionIcon}>{icon}</Text>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function ListLines({ items, color }) {
  if (!items || items.length === 0) return <Text style={styles.mutedText}>无</Text>;
  return (
    <View>
      {items.map((t, i) => (
        <Text key={i} style={[styles.lineText, color && { color }]}>· {t}</Text>
      ))}
    </View>
  );
}

function HealthSummaryView({ sections }) {
  const s = sections || {};
  const lifestyle = s.lifestyle_assessment || {};
  const medPriority = s.medical_priority || {};
  const tumor = s.tumor_risk || {};
  const cardio = s.cardiovascular_risk || {};
  const chronic = s.chronic_disease || {};
  const checkup = s.checkup_completeness || {};

  return (
    <View>
      <SectionCard icon="🌿" title="生活方式评估">
        {(lifestyle.items || []).map((it, i) => (
          <View key={i} style={styles.lifestyleItem}>
            <Text style={styles.lifestyleDim}>{it.dimension}</Text>
            {!!it.finding && <Text style={styles.lineText}>{it.finding}</Text>}
            {!!it.risk && <Text style={[styles.lineText, { color: colors.warning }]}>风险：{it.risk}</Text>}
            {!!it.suggestion && <Text style={[styles.lineText, { color: colors.primary }]}>建议：{it.suggestion}</Text>}
          </View>
        ))}
        {!!lifestyle.summary && <Text style={styles.summaryBox}>{lifestyle.summary}</Text>}
      </SectionCard>

      <SectionCard icon="🩺" title="重点关注医疗问题">
        {(medPriority.items || []).length === 0 && <Text style={styles.mutedText}>暂无</Text>}
        {(medPriority.items || []).map((it, i) => {
          const u = URGENCY_META[it.urgency] || URGENCY_META.low;
          return (
            <View key={i} style={styles.priorityItem}>
              <View style={styles.priorityHeader}>
                <Text style={styles.priorityName}>{it.name}</Text>
                <View style={[styles.badge, { backgroundColor: u.bg }]}>
                  <Text style={[styles.badgeText, { color: u.color }]}>{u.label}</Text>
                </View>
              </View>
              {!!it.current && <Text style={styles.lineText}>当前：{it.current}</Text>}
              {!!it.meaning && <Text style={styles.lineText}>{it.meaning}</Text>}
              {!!it.action && <Text style={[styles.lineText, { color: colors.primary }]}>建议：{it.action}{it.department ? `（建议就诊：${it.department}）` : ''}</Text>}
            </View>
          );
        })}
      </SectionCard>

      <SectionCard icon="🎗️" title="肿瘤筛查评估">
        <Text style={styles.subLabel}>已完成筛查</Text>
        <ListLines items={tumor.completed} />
        <Text style={[styles.subLabel, { marginTop: 8 }]}>异常发现</Text>
        <ListLines items={tumor.abnormal} color={colors.danger} />
        <Text style={[styles.subLabel, { marginTop: 8 }]}>未覆盖项目</Text>
        <ListLines items={tumor.missing} color={colors.textMuted} />
        {!!tumor.summary && <Text style={styles.summaryBox}>{tumor.summary}</Text>}
      </SectionCard>

      <SectionCard icon="❤️" title="心脑血管风险">
        <Text style={styles.subLabel}>高风险因素</Text>
        <ListLines items={cardio.high} color={colors.danger} />
        <Text style={[styles.subLabel, { marginTop: 8 }]}>中风险因素</Text>
        <ListLines items={cardio.medium} color={colors.warning} />
        {!!cardio.summary && <Text style={styles.summaryBox}>{cardio.summary}</Text>}
      </SectionCard>

      <SectionCard icon="📊" title="慢病指标">
        {(chronic.items || []).length === 0 && <Text style={styles.mutedText}>暂无</Text>}
        {(chronic.items || []).map((it, i) => {
          const st = STATUS_META[it.status] || STATUS_META.normal;
          return (
            <View key={i} style={styles.chronicRow}>
              <Text style={styles.chronicName}>{it.name}</Text>
              <Text style={[styles.chronicValue, { color: st.color }]}>{it.value}（{st.label}）</Text>
              {!!it.note && <Text style={styles.mutedText}>{it.note}</Text>}
            </View>
          );
        })}
      </SectionCard>

      <SectionCard icon="📋" title="体检完整度">
        <Text style={styles.subLabel}>已覆盖</Text>
        <ListLines items={checkup.covered} />
        <Text style={[styles.subLabel, { marginTop: 8 }]}>缺失项目</Text>
        <ListLines items={checkup.missing} color={colors.warning} />
        {!!checkup.suggestion && <Text style={styles.summaryBox}>{checkup.suggestion}</Text>}
      </SectionCard>
    </View>
  );
}

function RiskAssessmentView({ data }) {
  const dims = Array.isArray(data.dimensions) ? data.dimensions : [];
  const overall = RISK_LEVEL_META[data.overallLevel] || RISK_LEVEL_META.low;
  return (
    <View>
      <View style={styles.overallCard}>
        <Text style={styles.overallLabel}>整体风险等级</Text>
        <View style={[styles.badge, { backgroundColor: overall.bg }]}>
          <Text style={[styles.badgeText, { color: overall.color }]}>{overall.label}</Text>
        </View>
        {!!data.overallSummary && <Text style={styles.overallSummary}>{data.overallSummary}</Text>}
      </View>
      {dims.map((d, i) => {
        const lv = RISK_LEVEL_META[d.level] || RISK_LEVEL_META.low;
        return (
          <View key={d.key || i} style={[styles.dimCard, { borderLeftColor: lv.dot }]}>
            <View style={styles.dimHeader}>
              <Text style={styles.dimLabel}>{d.label}</Text>
              <View style={[styles.badge, { backgroundColor: lv.bg }]}>
                <Text style={[styles.badgeText, { color: lv.color }]}>{lv.label}</Text>
              </View>
              {typeof d.score === 'number' && <Text style={styles.mutedText}>{d.score}分</Text>}
            </View>
            {(d.factors || []).map((f, j) => (
              <Text key={j} style={styles.lineText}>· {f}</Text>
            ))}
            {!!d.advice && <Text style={styles.adviceBox}>建议：{d.advice}</Text>}
          </View>
        );
      })}
      <Text style={styles.disclaimerText}>本评估由 AI 结合规则引擎生成，仅供健康参考，不构成医疗诊断。</Text>
    </View>
  );
}

export default function AiHealthScreen({ navigation }) {
  const [tab, setTab] = useState(TABS[0]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [hasDoctor, setHasDoctor] = useState(false);
  const [summaryData, setSummaryData] = useState(null);
  const [riskData, setRiskData] = useState(null);
  const [summaryPending, setSummaryPending] = useState(false);
  const [riskPending, setRiskPending] = useState(false);
  const [message, setMessage] = useState('');
  const [speaking, setSpeaking] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [sRes, rRes] = await Promise.allSettled([
        userAPI.getAiHealthSummary(),
        userAPI.getAiRiskAssessment(),
      ]);
      if (sRes.status === 'fulfilled' && sRes.value?.success) {
        setHasDoctor(!!sRes.value.hasDoctor);
        setSummaryData(sRes.value.data || null);
        setSummaryPending(!!sRes.value.pendingReview);
        if (sRes.value.message) setMessage(sRes.value.message);
      }
      if (rRes.status === 'fulfilled' && rRes.value?.success) {
        setRiskData(rRes.value.data || null);
        setRiskPending(!!rRes.value.pendingReview);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const handleGenerate = async () => {
    setGenerating(true);
    setMessage('');
    try {
      if (tab === TABS[0]) {
        const res = await userAPI.postAiHealthSummary();
        if (res.success) { setSummaryData(res.data); setSummaryPending(!!res.pendingReview); }
      } else {
        const res = await userAPI.postAiRiskAssessment();
        if (res.success) { setRiskData(res.data); setRiskPending(!!res.pendingReview); }
      }
    } catch (err) {
      setMessage(err.message || '生成失败，请稍后重试');
    } finally {
      setGenerating(false);
    }
  };

  const summaryHasData = !!(summaryData?.sections?.medical_priority || summaryData?.sections?.tumor_risk || summaryData?.sections?.chronic_disease);
  const riskHasData = Array.isArray(riskData?.dimensions) && riskData.dimensions.length > 0;
  const curHasData = tab === TABS[0] ? summaryHasData : riskHasData;
  const curPending = tab === TABS[0] ? summaryPending : riskPending;

  const handleSpeak = async () => {
    setSpeaking(true);
    try {
      const text = tab === TABS[0] ? buildSummarySpeech(summaryData?.sections) : buildRiskSpeech(riskData);
      await tts.speak(text, tab === TABS[0] ? 'ai_health_summary' : 'ai_risk_assessment');
    } catch (err) {
      setMessage(err.message || '播放失败');
    } finally {
      setSpeaking(false);
    }
  };

  // 就当前这份AI分析/评估结果跳转到AI助手继续追问；后端会自动带上用户已审核的分析要点作为上下文
  const handleConsult = () => {
    tts.stop();
    navigation.navigate('Chat', {
      greeting: `您好，我是小嘉。看到您正在查看${tab}结果，对其中的内容有任何疑问都可以问我，我会结合您的报告为您解读。`,
      initialPrompt: `请帮我解读一下我的${tab}结果，重点说说我需要注意什么。`,
    });
  };

  useEffect(() => () => { tts.stop(); }, []);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.pageTitle}>AI健康分析</Text>
        <View style={{ width: 30 }} />
      </View>

      <View style={styles.tabsWrap}>
        {TABS.map(t => (
          <TouchableOpacity
            key={t}
            style={[styles.tabBtn, tab === t && styles.tabBtnActive]}
            onPress={() => setTab(t)}
          >
            <Text style={[styles.tabBtnText, tab === t && styles.tabBtnTextActive]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.centerWrap}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>加载中…</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg }} showsVerticalScrollIndicator={false}>
          <AiRuleHint scene={tab === TABS[0] ? 'health_analysis' : 'risk_assessment'} />
          {!!message && (
            <View style={[styles.doctorNotice, { backgroundColor: '#FEF2F2' }]}>
              <Ionicons name="alert-circle-outline" size={18} color={colors.danger} />
              <Text style={[styles.doctorNoticeText, { color: colors.danger }]}>{message}</Text>
            </View>
          )}

          {hasDoctor && curHasData && (
            <View style={styles.doctorNotice}>
              <Ionicons name={curPending ? 'time-outline' : 'medkit-outline'} size={18} color={colors.info} />
              <Text style={styles.doctorNoticeText}>
                {curPending ? '草稿已生成，待您的家庭医生团队审核，审核结果可能有调整' : '已由您的家庭医生团队审核确认'}
              </Text>
            </View>
          )}

          <TouchableOpacity style={styles.genBtn} onPress={handleGenerate} disabled={generating}>
            {generating ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <Ionicons name="sparkles-outline" size={16} color={colors.white} />
            )}
            <Text style={styles.genBtnText}>
              {generating ? 'AI生成中…' : (curHasData ? '重新生成' : `✨ 生成${tab}`)}
            </Text>
          </TouchableOpacity>

          {!curHasData && (
            <View style={styles.emptyWrap}>
              <Ionicons name="analytics-outline" size={44} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>暂无{tab}</Text>
              <Text style={styles.emptyDesc}>点击上方按钮，AI将结合您的体检数据与健康档案自动生成{hasDoctor ? '，生成后由家庭医生团队审核' : ''}</Text>
            </View>
          )}

          {curHasData && (
            <View style={styles.actionRow}>
              <TouchableOpacity style={[styles.speakBtn, styles.actionBtnHalf]} onPress={handleSpeak} disabled={speaking}>
                {speaking ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Ionicons name="volume-high-outline" size={16} color={colors.primary} />
                )}
                <Text style={styles.speakBtnText}>{speaking ? '播放中…' : '语音解读'}</Text>
              </TouchableOpacity>

              <TouchableOpacity style={[styles.consultBtn, styles.actionBtnHalf]} onPress={handleConsult}>
                <Ionicons name="chatbubble-ellipses-outline" size={16} color={colors.white} />
                <Text style={styles.consultBtnText}>就此咨询AI</Text>
              </TouchableOpacity>
            </View>
          )}

          {curHasData && tab === TABS[0] && <HealthSummaryView sections={summaryData.sections} />}
          {curHasData && tab === TABS[1] && <RiskAssessmentView data={riskData} />}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  topBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backBtn: { padding: 4 },
  pageTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  tabsWrap: {
    flexDirection: 'row', marginHorizontal: spacing.lg, marginTop: spacing.md,
    backgroundColor: colors.border + '50', borderRadius: radius.md, padding: 4,
  },
  tabBtn: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: radius.sm },
  tabBtnActive: { backgroundColor: colors.white, ...shadow.sm },
  tabBtnText: { fontSize: 14, color: colors.textSecondary, fontWeight: '500' },
  tabBtnTextActive: { color: colors.primary, fontWeight: '700' },

  centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md },
  loadingText: { fontSize: 14, color: colors.textMuted, marginTop: spacing.sm },

  emptyWrap: { alignItems: 'center', justifyContent: 'center', padding: spacing.xl * 1.5 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary, marginTop: spacing.md, marginBottom: spacing.xs },
  emptyDesc: { fontSize: 13, color: colors.textMuted, textAlign: 'center', lineHeight: 20 },

  doctorNotice: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#EBF5FB', borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md,
  },
  doctorNoticeText: { flex: 1, fontSize: 13, color: colors.info },

  genBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: colors.primary, borderRadius: radius.full,
    paddingVertical: 12, marginBottom: spacing.md,
  },
  genBtnText: { color: colors.white, fontSize: 14, fontWeight: '700' },

  actionRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  actionBtnHalf: { flex: 1 },
  speakBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: colors.primary10, borderRadius: radius.full,
    paddingVertical: 10,
  },
  speakBtnText: { color: colors.primary, fontSize: 13, fontWeight: '600' },
  consultBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: colors.primary, borderRadius: radius.full,
    paddingVertical: 10,
  },
  consultBtnText: { color: colors.white, fontSize: 13, fontWeight: '600' },

  sectionCard: {
    backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.lg,
    marginBottom: spacing.md, ...shadow.sm,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.sm },
  sectionIcon: { fontSize: 16 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },

  lineText: { fontSize: 13, color: colors.textSecondary, marginBottom: 3, lineHeight: 19 },
  mutedText: { fontSize: 13, color: colors.textMuted },
  subLabel: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  summaryBox: {
    fontSize: 13, color: colors.textPrimary, marginTop: spacing.sm,
    backgroundColor: colors.background, borderRadius: radius.sm, padding: spacing.sm, lineHeight: 19,
  },

  lifestyleItem: { marginBottom: spacing.sm, paddingBottom: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  lifestyleDim: { fontSize: 13, fontWeight: '700', color: colors.textPrimary, marginBottom: 2 },

  priorityItem: { marginBottom: spacing.sm, paddingBottom: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  priorityHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  priorityName: { fontSize: 14, fontWeight: '700', color: colors.textPrimary, flex: 1 },

  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.sm },
  badgeText: { fontSize: 11, fontWeight: '700' },

  chronicRow: { marginBottom: spacing.sm },
  chronicName: { fontSize: 13, fontWeight: '600', color: colors.textPrimary },
  chronicValue: { fontSize: 13, marginTop: 2 },

  overallCard: {
    flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8,
    backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md, ...shadow.sm,
  },
  overallLabel: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  overallSummary: { fontSize: 13, color: colors.textSecondary, flexBasis: '100%', marginTop: 4 },

  dimCard: {
    backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.md,
    marginBottom: spacing.md, borderLeftWidth: 4, ...shadow.sm,
  },
  dimHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  dimLabel: { fontSize: 14, fontWeight: '700', color: colors.textPrimary, flex: 1 },
  adviceBox: {
    fontSize: 12, color: colors.primary, backgroundColor: '#E8F5EF',
    borderRadius: radius.sm, padding: spacing.sm, marginTop: 6,
  },
  disclaimerText: { fontSize: 11, color: colors.textMuted, textAlign: 'center', marginTop: spacing.sm, marginBottom: spacing.xl },
});

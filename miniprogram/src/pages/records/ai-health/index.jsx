import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { colors, spacing, radius, shadow } from '../../../theme';
import { userAPI } from '../../../services/api';
import useNavBar from '../../../hooks/useNavBar';
import Icon from '../../../components/Icon';

// 对齐 app/src/screens/records/AiHealthScreen.js
// 简化点：不接语音播报tts.speak（小程序场景暂不接入TTS）
const TABS = ['AI健康分析', 'AI风险评估'];

const URGENCY_META = { high: { label: '高', bg: '#FEE2E2', color: '#DC2626' }, medium: { label: '中', bg: '#FEF9EC', color: '#D97706' }, low: { label: '低', bg: '#F0FDF4', color: '#16A34A' } };
const STATUS_META = { abnormal: { label: '异常', color: '#DC2626' }, mild_abnormal: { label: '轻度异常', color: '#D97706' }, normal: { label: '正常', color: '#16A34A' } };
const RISK_LEVEL_META = {
  low: { label: '低风险', bg: '#F0FDF4', color: '#16A34A' }, medium: { label: '中风险', bg: '#FEF9EC', color: '#D97706' },
  high: { label: '高风险', bg: '#FEF2F2', color: '#DC2626' }, critical: { label: '危急值', bg: '#FEE2E2', color: '#B91C1C' },
};

function SectionCard({ icon, title, children }) {
  return (
    <View style={{ backgroundColor: '#fff', borderRadius: `${radius.lg}px`, padding: `${spacing.lg}px`, marginBottom: `${spacing.md}px`, boxShadow: shadow.sm }}>
      <View style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: `${spacing.sm}px` }}>
        <Icon name={icon} size={16} />
        <Text style={{ fontSize: '15px', fontWeight: 700, color: colors.textPrimary }}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function ListLines({ items, color }) {
  if (!items || items.length === 0) return <Text style={{ fontSize: '13px', color: colors.textMuted }}>无</Text>;
  return (
    <View>
      {items.map((t, i) => (
        <Text key={i} style={{ fontSize: '13px', color: color || colors.textSecondary, display: 'block', marginBottom: '3px', lineHeight: '19px' }}>· {t}</Text>
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

  // 疾病风险类板块（肿瘤/心脑血管/慢病/体检完整度/医疗问题）在前，生活方式收尾——对齐app端225057a改动的顺序
  return (
    <View>
      <SectionCard icon="🎗️" title="肿瘤风险筛查分析">
        <Text style={{ fontSize: '12px', fontWeight: 600, color: colors.textMuted }}>已完成筛查</Text>
        <ListLines items={tumor.completed} />
        <Text style={{ fontSize: '12px', fontWeight: 600, color: colors.textMuted, display: 'block', marginTop: '8px' }}>异常发现</Text>
        <ListLines items={tumor.abnormal} color={colors.danger} />
        <Text style={{ fontSize: '12px', fontWeight: 600, color: colors.textMuted, display: 'block', marginTop: '8px' }}>未覆盖项目</Text>
        <ListLines items={tumor.missing} color={colors.textMuted} />
        {!!tumor.summary && <Text style={{ fontSize: '13px', color: colors.textPrimary, backgroundColor: colors.background, borderRadius: `${radius.sm}px`, padding: `${spacing.sm}px`, display: 'block', marginTop: `${spacing.sm}px` }}>{tumor.summary}</Text>}
      </SectionCard>

      <SectionCard icon="❤️" title="心脑血管病风险分析">
        <Text style={{ fontSize: '12px', fontWeight: 600, color: colors.textMuted }}>高风险因素</Text>
        <ListLines items={cardio.high} color={colors.danger} />
        <Text style={{ fontSize: '12px', fontWeight: 600, color: colors.textMuted, display: 'block', marginTop: '8px' }}>中风险因素</Text>
        <ListLines items={cardio.medium} color={colors.warning} />
        {!!cardio.summary && <Text style={{ fontSize: '13px', color: colors.textPrimary, backgroundColor: colors.background, borderRadius: `${radius.sm}px`, padding: `${spacing.sm}px`, display: 'block', marginTop: `${spacing.sm}px` }}>{cardio.summary}</Text>}
      </SectionCard>

      <SectionCard icon="📊" title="慢性病及其他健康指标分析">
        {(chronic.items || []).length === 0 && <Text style={{ fontSize: '13px', color: colors.textMuted }}>暂无</Text>}
        {(chronic.items || []).map((it, i) => {
          const st = STATUS_META[it.status] || STATUS_META.normal;
          return (
            <View key={i} style={{ marginBottom: `${spacing.sm}px` }}>
              <Text style={{ fontSize: '13px', fontWeight: 600, color: colors.textPrimary, display: 'block' }}>{it.name}</Text>
              <Text style={{ fontSize: '13px', color: st.color, display: 'block', marginTop: '2px' }}>{it.value}（{st.label}）</Text>
              {!!it.note && <Text style={{ fontSize: '13px', color: colors.textMuted }}>{it.note}</Text>}
            </View>
          );
        })}
      </SectionCard>

      <SectionCard icon="📋" title="体检全面性评估">
        <Text style={{ fontSize: '12px', fontWeight: 600, color: colors.textMuted }}>已覆盖</Text>
        <ListLines items={checkup.covered} />
        <Text style={{ fontSize: '12px', fontWeight: 600, color: colors.textMuted, display: 'block', marginTop: '8px' }}>缺失项目</Text>
        <ListLines items={checkup.missing} color={colors.warning} />
        {!!checkup.suggestion && <Text style={{ fontSize: '13px', color: colors.textPrimary, backgroundColor: colors.background, borderRadius: `${radius.sm}px`, padding: `${spacing.sm}px`, display: 'block', marginTop: `${spacing.sm}px` }}>{checkup.suggestion}</Text>}
      </SectionCard>

      <SectionCard icon="🏥" title="需优先解决的医疗问题">
        {(medPriority.items || []).length === 0 && <Text style={{ fontSize: '13px', color: colors.textMuted }}>暂无</Text>}
        {(medPriority.items || []).map((it, i) => {
          const u = URGENCY_META[it.urgency] || URGENCY_META.low;
          return (
            <View key={i} style={{ marginBottom: `${spacing.sm}px`, paddingBottom: `${spacing.sm}px`, borderBottom: `1px solid ${colors.border}` }}>
              <View style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                <Text style={{ fontSize: '14px', fontWeight: 700, color: colors.textPrimary, flex: 1 }}>{it.name}</Text>
                <Text style={{ fontSize: '11px', fontWeight: 700, color: u.color, backgroundColor: u.bg, padding: '2px 8px', borderRadius: `${radius.sm}px` }}>{u.label}</Text>
              </View>
              {!!it.current && <Text style={{ fontSize: '13px', color: colors.textSecondary, display: 'block' }}>当前：{it.current}</Text>}
              {!!it.meaning && <Text style={{ fontSize: '13px', color: colors.textSecondary, display: 'block' }}>{it.meaning}</Text>}
              {!!it.action && <Text style={{ fontSize: '13px', color: colors.primary, display: 'block' }}>建议：{it.action}{it.department ? `（建议就诊：${it.department}）` : ''}</Text>}
            </View>
          );
        })}
      </SectionCard>

      <SectionCard icon="🌿" title="生活方式评估">
        {(lifestyle.items || []).map((it, i) => (
          <View key={i} style={{ marginBottom: `${spacing.sm}px`, paddingBottom: `${spacing.sm}px`, borderBottom: `1px solid ${colors.border}` }}>
            <Text style={{ fontSize: '13px', fontWeight: 700, color: colors.textPrimary, display: 'block', marginBottom: '2px' }}>{it.dimension}</Text>
            {!!it.finding && <Text style={{ fontSize: '13px', color: colors.textSecondary, display: 'block' }}>{it.finding}</Text>}
            {!!it.risk && <Text style={{ fontSize: '13px', color: colors.warning, display: 'block' }}>风险：{it.risk}</Text>}
            {!!it.suggestion && <Text style={{ fontSize: '13px', color: colors.primary, display: 'block' }}>建议：{it.suggestion}</Text>}
          </View>
        ))}
        {!!lifestyle.summary && <Text style={{ fontSize: '13px', color: colors.textPrimary, backgroundColor: colors.background, borderRadius: `${radius.sm}px`, padding: `${spacing.sm}px`, display: 'block', marginTop: `${spacing.sm}px` }}>{lifestyle.summary}</Text>}
      </SectionCard>
    </View>
  );
}

function RiskAssessmentView({ data }) {
  const dims = Array.isArray(data.dimensions) ? data.dimensions : [];
  const overall = RISK_LEVEL_META[data.overallLevel] || RISK_LEVEL_META.low;
  return (
    <View>
      <View style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px', backgroundColor: '#fff', borderRadius: `${radius.lg}px`, padding: `${spacing.md}px`, marginBottom: `${spacing.md}px`, boxShadow: shadow.sm }}>
        <Text style={{ fontSize: '14px', fontWeight: 700, color: colors.textPrimary }}>整体风险等级</Text>
        <Text style={{ fontSize: '11px', fontWeight: 700, color: overall.color, backgroundColor: overall.bg, padding: '2px 8px', borderRadius: `${radius.sm}px` }}>{overall.label}</Text>
        {!!data.overallSummary && <Text style={{ fontSize: '13px', color: colors.textSecondary, flexBasis: '100%', marginTop: '4px' }}>{data.overallSummary}</Text>}
      </View>
      {dims.map((d, i) => {
        const lv = RISK_LEVEL_META[d.level] || RISK_LEVEL_META.low;
        return (
          <View key={d.key || i} style={{ backgroundColor: '#fff', borderRadius: `${radius.lg}px`, padding: `${spacing.md}px`, marginBottom: `${spacing.md}px`, borderLeft: `4px solid ${lv.color}`, boxShadow: shadow.sm }}>
            <View style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <Text style={{ fontSize: '14px', fontWeight: 700, color: colors.textPrimary, flex: 1 }}>{d.label}</Text>
              <Text style={{ fontSize: '11px', fontWeight: 700, color: lv.color, backgroundColor: lv.bg, padding: '2px 8px', borderRadius: `${radius.sm}px` }}>{lv.label}</Text>
              {typeof d.score === 'number' && <Text style={{ fontSize: '12px', color: colors.textMuted }}>{d.score}分</Text>}
            </View>
            {(d.factors || []).map((f, j) => (
              <Text key={j} style={{ fontSize: '13px', color: colors.textSecondary, display: 'block', marginBottom: '3px' }}>· {f}</Text>
            ))}
            {!!d.advice && <Text style={{ fontSize: '12px', color: colors.primary, backgroundColor: '#E8F5EF', borderRadius: `${radius.sm}px`, padding: `${spacing.sm}px`, display: 'block', marginTop: '6px' }}>建议：{d.advice}</Text>}
          </View>
        );
      })}
      <Text style={{ fontSize: '11px', color: colors.textMuted, textAlign: 'center', display: 'block', margin: `${spacing.sm}px 0 ${spacing.xl}px` }}>本评估由 AI 结合规则引擎生成，仅供健康参考，不构成医疗诊断。</Text>
    </View>
  );
}

export default function AiHealthPage() {
  const { statusBarHeight } = useNavBar();
  const [tab, setTab] = useState(TABS[0]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [hasDoctor, setHasDoctor] = useState(false);
  const [summaryData, setSummaryData] = useState(null);
  const [riskData, setRiskData] = useState(null);
  const [summaryPending, setSummaryPending] = useState(false);
  const [riskPending, setRiskPending] = useState(false);
  const [reviewStatus, setReviewStatus] = useState({ doctorApproved: false, nutritionApproved: false, hasLifestyle: false, isSelfService: false });
  const [message, setMessage] = useState('');

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [sRes, rRes] = await Promise.allSettled([userAPI.getAiHealthSummary(), userAPI.getAiRiskAssessment()]);
      if (sRes.status === 'fulfilled' && sRes.value?.success) {
        setHasDoctor(!!sRes.value.hasDoctor);
        setSummaryData(sRes.value.data || null);
        setSummaryPending(!!sRes.value.pendingReview);
        if (sRes.value.reviewStatus) setReviewStatus(sRes.value.reviewStatus);
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
    setGenerating(true); setMessage('');
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
  const summaryLocked = hasDoctor && !reviewStatus.isSelfService && (reviewStatus.doctorApproved || reviewStatus.nutritionApproved);
  const riskLocked = hasDoctor && riskHasData && !riskPending;
  const curLocked = tab === TABS[0] ? summaryLocked : riskLocked;

  const handleConsult = () => {
    Taro.navigateTo({ url: '/pages/chat/index' });
  };

  return (
    <View style={{ minHeight: '100vh', backgroundColor: colors.background }}>
      <View style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: `${statusBarHeight + 8}px ${spacing.lg}px ${spacing.md}px`,
        backgroundColor: '#fff', borderBottom: `1px solid ${colors.border}`,
      }}>
        <View onClick={() => Taro.navigateBack()} style={{ padding: '4px' }}>
          <Icon name="chevron-left" size={20} color={colors.textPrimary} />
        </View>
        <Text style={{ fontSize: '18px', fontWeight: 700, color: colors.textPrimary }}>AI健康分析</Text>
        <View style={{ width: '28px' }} />
      </View>

      <View style={{ display: 'flex', margin: `${spacing.md}px ${spacing.lg}px`, backgroundColor: colors.border + '50', borderRadius: `${radius.md}px`, padding: '4px' }}>
        {TABS.map((t) => (
          <View key={t} onClick={() => setTab(t)} style={{ flex: 1, textAlign: 'center', padding: '9px 0', borderRadius: `${radius.sm}px`, backgroundColor: tab === t ? '#fff' : 'transparent', boxShadow: tab === t ? shadow.sm : 'none' }}>
            <Text style={{ fontSize: '14px', color: tab === t ? colors.primary : colors.textSecondary, fontWeight: tab === t ? 700 : 500 }}>{t}</Text>
          </View>
        ))}
      </View>

      {loading ? (
        <Text style={{ fontSize: '13px', color: colors.textMuted, textAlign: 'center', display: 'block', marginTop: '40px' }}>加载中...</Text>
      ) : (
        <View style={{ padding: `0 ${spacing.lg}px ${spacing.xxl}px` }}>
          {!!message && (
            <View style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#FEF2F2', borderRadius: `${radius.md}px`, padding: `${spacing.md}px`, marginBottom: `${spacing.md}px` }}>
              <Text style={{ fontSize: '13px', color: colors.danger, flex: 1 }}>{message}</Text>
            </View>
          )}

          {tab === TABS[0] && hasDoctor && curHasData && !reviewStatus.isSelfService && (
            <View style={{ marginBottom: `${spacing.sm}px` }}>
              <View style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#EBF5FB', borderRadius: `${radius.md}px`, padding: `${spacing.md}px`, marginBottom: '6px' }}>
                <Text style={{ fontSize: '13px', color: colors.info, flex: 1 }}>医疗分析（5维度）：{reviewStatus.doctorApproved ? '已由家庭医生审核确认' : '草稿待家庭医生审核，结果可能调整'}</Text>
              </View>
              {reviewStatus.hasLifestyle && (
                <View style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#EBF5FB', borderRadius: `${radius.md}px`, padding: `${spacing.md}px` }}>
                  <Text style={{ fontSize: '13px', color: colors.info, flex: 1 }}>生活方式评估：{reviewStatus.nutritionApproved ? '已由营养师审核确认' : '草稿待营养师审核，结果可能调整'}</Text>
                </View>
              )}
            </View>
          )}

          {tab === TABS[1] && hasDoctor && curHasData && (
            <View style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#EBF5FB', borderRadius: `${radius.md}px`, padding: `${spacing.md}px`, marginBottom: `${spacing.md}px` }}>
              <Text style={{ fontSize: '13px', color: colors.info, flex: 1 }}>{curPending ? '草稿已生成，待您的家庭医生团队审核，审核结果可能有调整' : '已由您的家庭医生团队审核确认'}</Text>
            </View>
          )}

          {curLocked ? (
            <View style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#EBF5FB', borderRadius: `${radius.md}px`, padding: `${spacing.md}px`, marginBottom: `${spacing.md}px` }}>
              <Icon name="🔒" size={13} color={colors.textMuted} />
              <Text style={{ fontSize: '13px', color: colors.textMuted, flex: 1 }}>结果已审核确认，如需更新请联系您的健康管理师</Text>
            </View>
          ) : (
            <View onClick={generating ? undefined : handleGenerate} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', backgroundColor: colors.primary, borderRadius: `${radius.full}px`, padding: '12px', marginBottom: `${spacing.md}px`, opacity: generating ? 0.6 : 1 }}>
              {!generating && !curHasData && <Icon name="✨" size={14} color="#fff" />}
              <Text style={{ color: '#fff', fontSize: '14px', fontWeight: 700 }}>{generating ? 'AI生成中...' : (curHasData ? '重新生成' : `生成${tab}`)}</Text>
            </View>
          )}

          {!curHasData && (
            <View style={{ textAlign: 'center', padding: `${spacing.xl}px 0` }}>
              <View style={{ display: 'flex', justifyContent: 'center', marginBottom: `${spacing.md}px` }}>
                <Icon name="📊" size={40} />
              </View>
              <Text style={{ fontSize: '16px', fontWeight: 700, color: colors.textPrimary, display: 'block', marginBottom: '4px' }}>暂无{tab}</Text>
              <Text style={{ fontSize: '13px', color: colors.textMuted, lineHeight: '20px' }}>点击上方按钮，AI将结合您的体检数据与健康档案自动生成{hasDoctor ? '，生成后由家庭医生团队审核' : ''}</Text>
            </View>
          )}

          {curHasData && (
            <View style={{ display: 'flex', justifyContent: 'center', marginBottom: `${spacing.md}px` }}>
              <View onClick={handleConsult} style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: colors.primary, borderRadius: `${radius.full}px`, padding: '10px 24px' }}>
                <Icon name="💬" size={13} color="#fff" />
                <Text style={{ color: '#fff', fontSize: '13px', fontWeight: 600 }}>就此咨询AI</Text>
              </View>
            </View>
          )}

          {curHasData && tab === TABS[0] && <HealthSummaryView sections={summaryData.sections} />}
          {curHasData && tab === TABS[1] && <RiskAssessmentView data={riskData} />}
        </View>
      )}
    </View>
  );
}

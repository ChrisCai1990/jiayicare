import React, { useState, useEffect, useCallback } from 'react';
import { View, Text } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { colors, spacing, radius, shadow } from '../../../theme';
import { userAPI } from '../../../services/api';
import useNavBar from '../../../hooks/useNavBar';
import Icon from '../../../components/Icon';


const URGENCY_META = { high: { label: '高', bg: '#FEE2E2', color: '#DC2626' }, medium: { label: '中', bg: '#FEF9EC', color: '#D97706' }, low: { label: '低', bg: '#F0FDF4', color: '#16A34A' } };
const STATUS_META = { abnormal: { label: '异常', color: '#DC2626' }, mild_abnormal: { label: '轻度异常', color: '#D97706' }, normal: { label: '正常', color: '#16A34A' } };

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
      <SectionCard icon="🎗️" title="肿瘤筛查信息整理">
        <Text style={{ fontSize: '12px', fontWeight: 600, color: colors.textMuted }}>已完成筛查</Text>
        <ListLines items={tumor.completed} />
        <Text style={{ fontSize: '12px', fontWeight: 600, color: colors.textMuted, display: 'block', marginTop: '8px' }}>异常发现</Text>
        <ListLines items={tumor.abnormal} color={colors.danger} />
        <Text style={{ fontSize: '12px', fontWeight: 600, color: colors.textMuted, display: 'block', marginTop: '8px' }}>未覆盖项目</Text>
        <ListLines items={tumor.missing} color={colors.textMuted} />
        {!!tumor.summary && <Text style={{ fontSize: '13px', color: colors.textPrimary, backgroundColor: colors.background, borderRadius: `${radius.sm}px`, padding: `${spacing.sm}px`, display: 'block', marginTop: `${spacing.sm}px` }}>{tumor.summary}</Text>}
      </SectionCard>

      <SectionCard icon="❤️" title="心脑血管相关信息整理">
        <Text style={{ fontSize: '12px', fontWeight: 600, color: colors.textMuted }}>重点关注信息</Text>
        <ListLines items={cardio.high} color={colors.danger} />
        <Text style={{ fontSize: '12px', fontWeight: 600, color: colors.textMuted, display: 'block', marginTop: '8px' }}>持续关注信息</Text>
        <ListLines items={cardio.medium} color={colors.warning} />
        {!!cardio.summary && <Text style={{ fontSize: '13px', color: colors.textPrimary, backgroundColor: colors.background, borderRadius: `${radius.sm}px`, padding: `${spacing.sm}px`, display: 'block', marginTop: `${spacing.sm}px` }}>{cardio.summary}</Text>}
      </SectionCard>

      <SectionCard icon="📊" title="慢病及其他健康信息整理">
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

      <SectionCard icon="📋" title="体检资料覆盖情况">
        <Text style={{ fontSize: '12px', fontWeight: 600, color: colors.textMuted }}>已覆盖</Text>
        <ListLines items={checkup.covered} />
        <Text style={{ fontSize: '12px', fontWeight: 600, color: colors.textMuted, display: 'block', marginTop: '8px' }}>缺失项目</Text>
        <ListLines items={checkup.missing} color={colors.warning} />
        {!!checkup.suggestion && <Text style={{ fontSize: '13px', color: colors.textPrimary, backgroundColor: colors.background, borderRadius: `${radius.sm}px`, padding: `${spacing.sm}px`, display: 'block', marginTop: `${spacing.sm}px` }}>{checkup.suggestion}</Text>}
      </SectionCard>

      <SectionCard icon="🏥" title="需优先关注的信息">
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

export default function AiHealthPage() {
  const { statusBarHeight } = useNavBar();
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [hasDoctor, setHasDoctor] = useState(false);
  const [summaryData, setSummaryData] = useState(null);
  const [reviewStatus, setReviewStatus] = useState({ doctorApproved: false, nutritionApproved: false, hasLifestyle: false, isSelfService: false });
  const [message, setMessage] = useState('');

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const result = await userAPI.getAiHealthSummary();
      if (result?.success) {
        setHasDoctor(!!result.hasDoctor);
        setSummaryData(result.data || null);
        if (result.reviewStatus) setReviewStatus(result.reviewStatus);
        if (result.message) setMessage(result.message);
      }
    } catch (err) {
      setMessage(err.message || '健康信息整理加载失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const handleGenerate = async () => {
    setGenerating(true); setMessage('');
    try {
      const res = await userAPI.postAiHealthSummary();
      if (res.success) setSummaryData(res.data);
    } catch (err) {
      setMessage(err.message || '生成失败，请稍后重试');
    } finally {
      setGenerating(false);
    }
  };

  const summaryHasData = !!(summaryData?.sections?.medical_priority || summaryData?.sections?.tumor_risk || summaryData?.sections?.chronic_disease);
  const summaryLocked = hasDoctor && !reviewStatus.isSelfService && (reviewStatus.doctorApproved || reviewStatus.nutritionApproved);

  const handleConsult = () => {
    Taro.switchTab({ url: '/pages/chat/index' });
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
        <Text style={{ fontSize: '18px', fontWeight: 700, color: colors.textPrimary }}>AI健康信息整理</Text>
        <View style={{ width: '28px' }} />
      </View>

       <View style={{ margin: `${spacing.md}px ${spacing.lg}px`, padding: '9px 12px', borderRadius: `${radius.sm}px`, backgroundColor: '#FFF7E6', border: '1px solid #F5C26B' }}>
         <Text style={{ display: 'block', color: '#9A5B00', fontSize: '12px', fontWeight: 700 }}>本页面健康信息整理内容由人工智能（AI）生成</Text>
         <Text style={{ display: 'block', color: colors.textMuted, fontSize: '10px', marginTop: '2px' }}>内容仅供健康管理参考，审核状态请以页面说明为准</Text>
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

          {hasDoctor && summaryHasData && !reviewStatus.isSelfService && (
            <View style={{ marginBottom: `${spacing.sm}px` }}>
              <View style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#EBF5FB', borderRadius: `${radius.md}px`, padding: `${spacing.md}px`, marginBottom: '6px' }}>
                <Text style={{ fontSize: '13px', color: colors.info, flex: 1 }}>健康信息分析（5维度）：{reviewStatus.doctorApproved ? '已由专业人员复核' : '草稿待专业人员复核，结果可能调整'}</Text>
              </View>
              {reviewStatus.hasLifestyle && (
                <View style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#EBF5FB', borderRadius: `${radius.md}px`, padding: `${spacing.md}px` }}>
                  <Text style={{ fontSize: '13px', color: colors.info, flex: 1 }}>生活方式评估：{reviewStatus.nutritionApproved ? '已由营养师审核确认' : '草稿待营养师审核，结果可能调整'}</Text>
                </View>
              )}
            </View>
          )}

          {summaryLocked ? (
            <View style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#EBF5FB', borderRadius: `${radius.md}px`, padding: `${spacing.md}px`, marginBottom: `${spacing.md}px` }}>
              <Icon name="🔒" size={13} color={colors.textMuted} />
              <Text style={{ fontSize: '13px', color: colors.textMuted, flex: 1 }}>结果已审核确认，如需更新请联系您的健康管理师</Text>
            </View>
          ) : (
            <View onClick={generating ? undefined : handleGenerate} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', backgroundColor: colors.primary, borderRadius: `${radius.full}px`, padding: '12px', marginBottom: `${spacing.md}px`, opacity: generating ? 0.6 : 1 }}>
              {!generating && !summaryHasData && <Icon name="✨" size={14} color="#fff" />}
              <Text style={{ color: '#fff', fontSize: '14px', fontWeight: 700 }}>{generating ? 'AI生成中...' : (summaryHasData ? '重新生成' : '生成健康信息整理')}</Text>
            </View>
          )}

          {!summaryHasData && (
            <View style={{ textAlign: 'center', padding: `${spacing.xl}px 0` }}>
              <View style={{ display: 'flex', justifyContent: 'center', marginBottom: `${spacing.md}px` }}>
                <Icon name="📊" size={40} />
              </View>
              <Text style={{ fontSize: '16px', fontWeight: 700, color: colors.textPrimary, display: 'block', marginBottom: '4px' }}>暂无健康信息整理</Text>
              <Text style={{ fontSize: '13px', color: colors.textMuted, lineHeight: '20px' }}>点击上方按钮，AI将结合您的体检数据与健康档案自动生成{hasDoctor ? '，生成后由健康顾问团队审核' : ''}</Text>
            </View>
          )}

          {summaryHasData && (
            <View style={{ display: 'flex', justifyContent: 'center', marginBottom: `${spacing.md}px` }}>
              <View onClick={handleConsult} style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: colors.primary, borderRadius: `${radius.full}px`, padding: '10px 24px' }}>
                <Icon name="💬" size={13} color="#fff" />
                <Text style={{ color: '#fff', fontSize: '13px', fontWeight: 600 }}>就此咨询AI</Text>
              </View>
            </View>
          )}

          {summaryHasData && <HealthSummaryView sections={summaryData.sections} />}
        </View>
      )}
    </View>
  );
}

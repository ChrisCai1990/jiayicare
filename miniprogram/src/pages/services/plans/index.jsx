import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { colors, spacing, radius, shadow } from '../../../theme';
import { plansAPI } from '../../../services/api';

// 对齐 app/src/screens/services/ServicePlansScreen.js（852行，全端最复杂页面之一）
// 简化点：年度管理方案(annual_mgmt)的模块字段中文标签映射只做了最常用的一批（MODULE_NAME/FIELD_LABEL），
// 不完全覆盖 app 端全部字段名；未覆盖字段会退化成用字段原始 key 展示而不是中文标签，但数据本身完整不丢失。
const TYPE_META = {
  annual_checkup: { icon: '📅', color: '#0077B6', bg: '#E3F2FB', label: '年度体检' },
  checkup: { icon: '📋', color: '#0077B6', bg: '#E3F2FB', label: '体检方案' },
  annual_mgmt: { icon: '🛡️', color: '#1E6B50', bg: '#E8F5EF', label: '健康管理' },
  health: { icon: '🛡️', color: '#1E6B50', bg: '#E8F5EF', label: '健康管理' },
  nutrition: { icon: '🥗', color: '#D97706', bg: '#FEF3E2', label: '营养干预' },
  medical_assist: { icon: '👥', color: '#7C3AED', bg: '#F2EEFF', label: '就医协助' },
  followup: { icon: '📞', color: '#0369A1', bg: '#E0F2FE', label: '随访计划' },
  tcm: { icon: '🌿', color: '#059669', bg: '#D1FAE5', label: '中医方案' },
  psychology: { icon: '😊', color: '#9D174D', bg: '#FCE7F3', label: '心理咨询' },
  rehab: { icon: '💪', color: '#DC3545', bg: '#FDEEEC', label: '运动康复' },
};
const DEFAULT_META = { icon: '📄', color: colors.primary, bg: colors.primary10, label: '健康方案' };

const STATUS_META = {
  active: { label: '进行中', color: colors.success, bg: '#E8F5EF' },
  draft: { label: '待确认', color: colors.warning, bg: '#FEF3E2' },
  completed: { label: '已完成', color: colors.textMuted, bg: '#F5F5F5' },
  cancelled: { label: '已取消', color: colors.danger, bg: '#FDEEEC' },
};
const ITEM_STATUS_META = {
  completed: { label: '已完成', color: colors.success, bg: '#E8F5EF' },
  pending: { label: '待完成', color: colors.warning, bg: '#FEF3E2' },
  skipped: { label: '已跳过', color: colors.textMuted, bg: '#F5F5F5' },
};

const MODULE_NAME = {
  medical_treatment: '医疗问题解决', specialist_collab: '全专联合会诊', abnormal_followup: '异常复查提醒',
  vaccine: '疫苗接种', monitoring: '日常监测', lifestyle: '生活方式评估', medication: '药物服用',
  nutrition_supplement: '营养素补充', annual_checkup: '年度体检', functional_medicine: '功能医学检测', quarterly_eval: '季度评估',
};
const FIELD_LABEL = {
  visit_time: '就医时间', hospital: '就医/体检医院', department: '就诊科室', expert: '专家姓名', reason: '原因',
  coordinator: '协调专员', plan_time: '计划时间', plan_method: '方式', purpose: '目的', items: '项目', time: '时间',
  frequency: '频率', name: '名称', brand: '品牌', dose: '剂量', escort: '陪检服务', institution: '体检机构',
  chemical_name: '药品名', brand_name: '商品名', body_composition: '人体成分', diet_analysis: '膳食调研',
  assist: '就医协助', order_dept: '开单科室', order_expert: '开单专家', notes: '备注',
  date: '计划时间', focus: '重点关注', staff: '评估人员', goal: '干预目标', plan: '干预计划', other: '其他项目',
};
const PLAN_TYPE_LABEL = { health_reshape: '健康重塑方案', young_state: '健康年轻态方案', chronic_stable: '慢病维稳方案', health_prevention: '健康预防方案' };

function buildEntryNotes(entry) {
  const lines = [];
  Object.entries(entry).forEach(([fk, fv]) => {
    if (fk === 'enabled' || fk === '_id' || fk === 'notes' || !fv || fv === false) return;
    const label = FIELD_LABEL[fk] || fk;
    const val = fv === true ? '是' : (Array.isArray(fv) ? fv.join('、') : String(fv));
    lines.push(`${label}：${val}`);
  });
  return lines.join('\n');
}
function buildNotes(v) {
  if (Array.isArray(v)) {
    return v.map((entry, i) => {
      const en = buildEntryNotes(entry);
      return v.length > 1 ? `【第${i + 1}项】\n${en}` : en;
    }).filter(Boolean).join('\n\n');
  }
  if (v.records && Array.isArray(v.records) && v.records.length > 0) {
    const recs = v.records;
    return recs.map((entry, i) => {
      const en = buildEntryNotes(entry);
      return recs.length > 1 ? `【第${i + 1}项】\n${en}` : en;
    }).filter(Boolean).join('\n\n');
  }
  const lines = [];
  Object.entries(v).forEach(([fk, fv]) => {
    if (fk === 'enabled' || fk === 'records' || !fv || fv === false) return;
    const label = FIELD_LABEL[fk] || fk;
    const val = fv === true ? '是' : (Array.isArray(fv) ? fv.join('、') : String(fv));
    lines.push(`${label}：${val}`);
  });
  return lines.join('\n') || '';
}

function PlanCard({ plan, expanded, onToggle, onItemPress, onConfirmPlan, confirming, onConsult, onRenew }) {
  const meta = TYPE_META[plan.type] || DEFAULT_META;
  const sm = STATUS_META[plan.status] || STATUS_META.draft;
  const isDraft = plan.status === 'draft';
  const needsConfirm = !plan.confirmedAt && (plan.pushedAt || plan.status === 'active' || isDraft);
  const formatDate = (d) => (d ? new Date(d).toLocaleDateString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' }) : '未设置');
  const addonItems = (plan.content?.addons || []).map((a, i) => ({ _id: `addon_${i}`, name: a.name, notes: a.reason || '', status: 'pending', isAddon: true }));
  const allItems = [...(plan.items || []), ...addonItems];
  const progressDone = allItems.filter((i) => i.status === 'completed').length;
  const progressTotal = allItems.length;

  return (
    <View style={{ backgroundColor: '#fff', borderRadius: `${radius.md}px`, border: `1px solid ${isDraft ? colors.warning + '60' : colors.border}`, overflow: 'hidden', boxShadow: shadow.sm, marginBottom: `${spacing.md}px` }}>
      <View onClick={onToggle} style={{ display: 'flex', alignItems: 'center', gap: `${spacing.sm}px`, padding: `${spacing.md}px` }}>
        <View style={{ width: '44px', height: '44px', borderRadius: `${radius.sm}px`, backgroundColor: meta.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Text style={{ fontSize: '20px' }}>{meta.icon}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
            <Text style={{ fontSize: '15px', fontWeight: 700, color: colors.textPrimary, flex: 1 }} numberOfLines={1}>{plan.title}</Text>
            <Text style={{ fontSize: '10px', fontWeight: 700, color: sm.color, backgroundColor: sm.bg, padding: '2px 7px', borderRadius: `${radius.full}px` }}>{sm.label}</Text>
          </View>
          {plan.type === 'medical_assist' && plan.content?.templateName && (
            <Text style={{ fontSize: '11px', color: meta.color, backgroundColor: meta.bg, borderRadius: '4px', padding: '2px 6px', display: 'inline-block', marginBottom: '2px' }}>{plan.content.templateName}</Text>
          )}
          {!!plan.year && <Text style={{ fontSize: '11px', color: meta.color, backgroundColor: meta.bg, borderRadius: '4px', padding: '2px 6px', display: 'inline-block', marginBottom: '2px' }}>{plan.year} 年度</Text>}
          <Text style={{ fontSize: '12px', color: colors.textMuted, lineHeight: '17px' }} numberOfLines={expanded ? 0 : 1}>{plan.description || meta.label}</Text>
          {!!plan.staffId?.name && <Text style={{ fontSize: '11px', color: colors.textMuted }}>由 {plan.staffId.name} 制定</Text>}
        </View>
        <Text style={{ fontSize: '13px', color: colors.textMuted }}>{expanded ? '▲' : '▼'}</Text>
      </View>

      {expanded && (
        <View style={{ borderTop: `1px solid ${colors.borderLight}`, padding: `${spacing.md}px` }}>
          {!!plan.summary && <Text style={{ fontSize: '13px', color: colors.textSecondary, lineHeight: '19px', display: 'block', marginBottom: `${spacing.sm}px` }}>{plan.summary}</Text>}

          {plan.type === 'medical_assist' && (() => {
            const c = plan.content || {};
            const rows = [
              ['医院', c.hospital && c.department ? `${c.hospital} · ${c.department}` : (c.hospital || c.department)],
              ['专家', c.expert], ['住宿', c.hotel], ['交通', c.transport],
            ].filter(([, v]) => !!v);
            return rows.length > 0 ? (
              <View style={{ backgroundColor: colors.background, borderRadius: `${radius.sm}px`, padding: `${spacing.sm}px`, marginBottom: `${spacing.sm}px` }}>
                {rows.map(([label, value]) => (
                  <View key={label} style={{ display: 'flex', gap: '6px', marginBottom: '4px' }}>
                    <Text style={{ fontSize: '12px', color: colors.textMuted, width: '48px', flexShrink: 0 }}>{label}</Text>
                    <Text style={{ fontSize: '12px', color: colors.textSecondary, flex: 1, lineHeight: '18px' }}>{value}</Text>
                  </View>
                ))}
              </View>
            ) : null;
          })()}

          {isDraft && (
            <View style={{ display: 'flex', alignItems: 'center', gap: `${spacing.sm}px`, backgroundColor: '#FEF3E2', borderRadius: `${radius.sm}px`, padding: `${spacing.sm}px`, marginBottom: `${spacing.sm}px` }}>
              <Text style={{ fontSize: '12px', color: '#92400E', lineHeight: '17px', flex: 1 }}>ℹ️ 此方案由您的医护团队制定，请确认后方可启动执行。</Text>
            </View>
          )}

          {progressTotal > 0 ? (
            allItems.map((item, i) => (
              <View key={item._id || i} onClick={() => onItemPress(item, plan, meta)} style={{ padding: '9px 8px', borderRadius: `${radius.xs}px`, backgroundColor: i % 2 === 0 ? colors.background : 'transparent' }}>
                <View style={{ display: 'flex', alignItems: 'center', gap: `${spacing.sm}px` }}>
                  <Text style={{ fontSize: '15px', color: item.status === 'completed' ? colors.success : meta.color }}>{item.status === 'completed' ? '✓' : '○'}</Text>
                  <Text style={{ fontSize: '13px', color: colors.textSecondary, flex: 1, textDecoration: item.status === 'completed' ? 'line-through' : 'none' }}>{item.name}</Text>
                  {item.isAddon && <Text style={{ fontSize: '10px', color: '#D97706', backgroundColor: '#FEF3E2', borderRadius: '4px', padding: '1px 5px' }}>加项</Text>}
                  <Text style={{ fontSize: '12px', color: colors.textMuted }}>›</Text>
                </View>
                {!!item.notes && <Text style={{ fontSize: '11px', color: colors.textMuted, lineHeight: '17px', display: 'block', marginTop: '4px', marginLeft: '24px' }} numberOfLines={3}>{item.notes}</Text>}
              </View>
            ))
          ) : (
            <View style={{ textAlign: 'center', padding: `${spacing.lg}px 0` }}>
              <Text style={{ fontSize: '32px', display: 'block', marginBottom: '6px' }}>📋</Text>
              {(plan.description || plan.notes) ? (
                <>
                  {!!plan.description && plan.description !== '个人专属健康管理方案' && (
                    <Text style={{ fontSize: '13px', fontWeight: 600, color: '#1A2B24', display: 'block', marginBottom: '4px' }}>{plan.description}</Text>
                  )}
                  {!!plan.notes && <Text style={{ fontSize: '13px', color: '#4A6558', lineHeight: '20px', display: 'block', textAlign: 'left', whiteSpace: 'pre-wrap' }}>{plan.notes}</Text>}
                  <Text style={{ fontSize: '13px', color: colors.textMuted, display: 'block', marginTop: '8px' }}>如有疑问请联系健管师</Text>
                </>
              ) : (
                <Text style={{ fontSize: '13px', color: colors.textMuted }}>方案内容正在配置中，如有疑问请联系健管师</Text>
              )}
            </View>
          )}

          {progressTotal > 0 && <Text style={{ fontSize: '11px', color: colors.textMuted, display: 'block', marginTop: '4px', paddingLeft: '8px' }}>已完成 {progressDone}/{progressTotal} 项</Text>}

          {(plan.startDate || plan.endDate) && (
            <View style={{ display: 'flex', gap: `${spacing.sm}px`, marginTop: `${spacing.sm}px`, borderTop: `1px solid ${colors.borderLight}`, paddingTop: `${spacing.sm}px` }}>
              <View style={{ flex: 1, textAlign: 'center', backgroundColor: colors.background, borderRadius: `${radius.sm}px`, padding: '8px' }}>
                <Text style={{ fontSize: '10px', color: colors.textMuted, display: 'block' }}>开始时间</Text>
                <Text style={{ fontSize: '12px', fontWeight: 600, color: colors.textSecondary }}>{formatDate(plan.startDate)}</Text>
              </View>
              <View style={{ flex: 1, textAlign: 'center', backgroundColor: colors.background, borderRadius: `${radius.sm}px`, padding: '8px' }}>
                <Text style={{ fontSize: '10px', color: colors.textMuted, display: 'block' }}>结束时间</Text>
                <Text style={{ fontSize: '12px', fontWeight: 600, color: colors.textSecondary }}>{formatDate(plan.endDate)}</Text>
              </View>
            </View>
          )}

          <View style={{ display: 'flex', gap: `${spacing.sm}px`, marginTop: `${spacing.sm}px` }}>
            {needsConfirm ? (
              <View onClick={confirming ? undefined : () => onConfirmPlan(plan)} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '10px 0', borderRadius: `${radius.md}px`, backgroundColor: colors.primary, opacity: confirming ? 0.6 : 1 }}>
                <Text style={{ fontSize: '13px', fontWeight: 700, color: '#fff' }}>{confirming ? '确认中...' : '✓ 确认方案'}</Text>
              </View>
            ) : plan.confirmedAt ? (
              <View style={{ display: 'flex', flex: 1, gap: '8px' }}>
                <View style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '10px 0', borderRadius: `${radius.md}px`, border: `1.5px solid ${colors.success}60`, backgroundColor: '#E8F5EF' }}>
                  <Text style={{ fontSize: '13px', fontWeight: 600, color: colors.success }}>✓ 已确认</Text>
                </View>
                <View onClick={() => onRenew(plan)} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '10px 0', borderRadius: `${radius.md}px`, border: `1.5px solid ${colors.primary}60` }}>
                  <Text style={{ fontSize: '13px', fontWeight: 600, color: colors.primary }}>↻ 续约</Text>
                </View>
              </View>
            ) : (
              <View onClick={() => onConsult(plan)} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '10px 0', borderRadius: `${radius.md}px`, border: `1.5px solid ${meta.color}60` }}>
                <Text style={{ fontSize: '13px', fontWeight: 600, color: meta.color }}>💬 咨询健康管理师</Text>
              </View>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

export default function ServicePlansPage() {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [confirmingPlanId, setConfirmingPlanId] = useState(null);
  const [detailModal, setDetailModal] = useState(null);
  const [completing, setCompleting] = useState(false);
  const [planConfirmTarget, setPlanConfirmTarget] = useState(null);

  const loadPlans = useCallback(async () => {
    try {
      const [res, annualRes] = await Promise.all([
        plansAPI.list().catch(() => ({ success: false, data: [] })),
        plansAPI.listAnnualMgmt().catch(() => ({ success: false, data: [] })),
      ]);
      const annualMgmtPlans = (annualRes.success && annualRes.data?.length > 0)
        ? annualRes.data.map((ap) => ({
          _id: ap._id, title: `${ap.year}年 年度管理方案`, type: 'annual_mgmt', status: 'active',
          description: ap.planType ? (PLAN_TYPE_LABEL[ap.planType] || '') : '个人专属健康管理方案',
          staffId: ap.pushedBy, year: ap.year, notes: ap.notes || '',
          confirmedAt: ap.confirmedAt || null, pushedAt: ap.pushedAt || null,
          items: Object.entries(ap.moduleData || {})
            .filter(([, v]) => v && (Array.isArray(v) ? v.length > 0 : v.enabled !== false))
            .map(([key, v]) => ({ _id: key, name: MODULE_NAME[key] || key, notes: buildNotes(v), status: 'pending' })),
        }))
        : [];
      const healthPlans = (res.success && res.data?.length > 0) ? res.data : [];
      setPlans([...annualMgmtPlans, ...healthPlans]);
    } catch {
      setPlans([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useDidShow(() => { loadPlans(); });

  const toggle = (id) => {
    setExpanded((prev) => {
      const next = prev === id ? null : id;
      if (next) {
        plansAPI.view(next).catch(() => {});
        setPlans((prev2) => prev2.map((p) => (p._id === next && !p.viewedAt ? { ...p, viewedAt: new Date().toISOString() } : p)));
      }
      return next;
    });
  };

  const handleConfirmPlan = (plan) => setPlanConfirmTarget(plan);

  const doConfirmPlan = async () => {
    if (!planConfirmTarget) return;
    const { _id, type } = planConfirmTarget;
    setConfirmingPlanId(_id);
    try {
      if (type === 'annual_mgmt') await plansAPI.confirmAnnualMgmt(_id);
      else await plansAPI.confirm(_id);
    } catch {} finally { setConfirmingPlanId(null); }
    setPlans((prev) => prev.map((p) => (p._id === _id ? { ...p, confirmedAt: new Date().toISOString() } : p)));
    setPlanConfirmTarget(null);
  };

  const handleConsult = (plan) => {
    const hasStaff = plan.staffId?.name || plan.staffId;
    if (!hasStaff) {
      Taro.showToast({ title: '您当前暂未分配健康管理师，请联系服务团队', icon: 'none' });
      return;
    }
    Taro.switchTab({ url: '/pages/messages/index' });
  };

  const handleItemPress = (item, plan, meta) => setDetailModal({ item, plan, meta });

  const doCompleteItem = async () => {
    if (!detailModal) return;
    const { item, plan } = detailModal;
    if (!item._id || item.status === 'completed') return;
    setCompleting(true);
    try {
      await plansAPI.completeItem(plan._id, item._id);
      setPlans((prev) => prev.map((p) => p._id !== plan._id ? p : { ...p, items: (p.items || []).map((it) => (it._id === item._id ? { ...it, status: 'completed' } : it)) }));
      setDetailModal((prev) => (prev ? { ...prev, item: { ...prev.item, status: 'completed' } } : null));
    } catch {} finally { setCompleting(false); }
  };

  const isCompleted = detailModal?.item?.status === 'completed';
  const canComplete = detailModal?.item?._id && !isCompleted;

  return (
    <View style={{ minHeight: '100vh', backgroundColor: colors.background, paddingBottom: `${spacing.xl}px` }}>
      {loading ? (
        <Text style={{ fontSize: '13px', color: colors.textMuted, textAlign: 'center', display: 'block', marginTop: '60px' }}>加载中...</Text>
      ) : (
        <View style={{ padding: `${spacing.lg}px` }}>
          <View style={{ display: 'flex', gap: `${spacing.sm}px`, alignItems: 'flex-start', backgroundColor: colors.primary10, borderRadius: `${radius.sm}px`, padding: `${spacing.md}px`, borderLeft: `3px solid ${colors.primary}`, marginBottom: `${spacing.md}px` }}>
            <Text style={{ fontSize: '13px', color: colors.textSecondary, lineHeight: '19px', flex: 1 }}>ℹ️ 以下健康方案由您的医护团队为您定制并推送，请按方案完成各项健康管理任务。</Text>
          </View>

          {plans.length === 0 ? (
            <View style={{ textAlign: 'center', padding: `${spacing.xl}px 0` }}>
              <Text style={{ fontSize: '40px', display: 'block', marginBottom: `${spacing.sm}px` }}>📄</Text>
              <Text style={{ fontSize: '14px', color: colors.textMuted, display: 'block' }}>暂无健康方案</Text>
              <Text style={{ fontSize: '12px', color: colors.textMuted, lineHeight: '18px' }}>待医护团队为您制定并推送健康方案后将在此处显示</Text>
            </View>
          ) : (
            plans.map((plan) => (
              <PlanCard
                key={plan._id}
                plan={plan}
                expanded={expanded === plan._id}
                onToggle={() => toggle(plan._id)}
                onItemPress={handleItemPress}
                onConfirmPlan={handleConfirmPlan}
                confirming={confirmingPlanId === plan._id}
                onConsult={handleConsult}
                onRenew={() => Taro.navigateTo({ url: '/pages/services/renewal/index' })}
              />
            ))
          )}
        </View>
      )}

      {detailModal && (() => {
        const { item, meta } = detailModal;
        const ism = ITEM_STATUS_META[item.status] || ITEM_STATUS_META.pending;
        return (
          <View style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)', zIndex: 100, display: 'flex', alignItems: 'flex-end' }}>
            <View style={{ backgroundColor: '#fff', borderRadius: '20px 20px 0 0', width: '100%', maxHeight: '82%', boxSizing: 'border-box', paddingBottom: '32px', display: 'flex', flexDirection: 'column' }}>
              <View style={{ width: '36px', height: '4px', borderRadius: '2px', backgroundColor: colors.border, margin: '10px auto 4px' }} />
              <View style={{ display: 'flex', alignItems: 'center', gap: `${spacing.sm}px`, padding: `${spacing.md}px ${spacing.lg}px`, borderBottom: `1px solid ${colors.border}` }}>
                <View style={{ width: '40px', height: '40px', borderRadius: `${radius.sm}px`, backgroundColor: meta.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: '18px' }}>{meta.icon}</Text>
                </View>
                <Text style={{ flex: 1, fontSize: '15px', fontWeight: 700, color: colors.textPrimary }} numberOfLines={2}>{item.name}</Text>
                <Text style={{ fontSize: '11px', fontWeight: 700, color: ism.color, backgroundColor: ism.bg, padding: '3px 8px', borderRadius: `${radius.full}px` }}>{ism.label}</Text>
              </View>
              <ScrollView scrollY style={{ flex: 1, padding: `${spacing.md}px ${spacing.lg}px` }}>
                <Text style={{ fontSize: '11px', color: colors.textMuted, fontWeight: 600, display: 'block', marginBottom: '6px' }}>任务说明</Text>
                {item.notes ? (
                  <Text style={{ fontSize: '13px', color: colors.textSecondary, lineHeight: '20px', backgroundColor: colors.background, borderRadius: `${radius.xs}px`, padding: `${spacing.sm}px`, display: 'block', whiteSpace: 'pre-wrap' }}>{item.notes}</Text>
                ) : (
                  <Text style={{ fontSize: '13px', color: colors.textMuted }}>暂无说明，请联系健康管理师了解详情。</Text>
                )}
                {!!item.completedAt && (
                  <>
                    <Text style={{ fontSize: '11px', color: colors.textMuted, fontWeight: 600, display: 'block', marginTop: `${spacing.sm}px`, marginBottom: '6px' }}>完成时间</Text>
                    <Text style={{ fontSize: '13px', color: colors.textSecondary, backgroundColor: colors.background, borderRadius: `${radius.xs}px`, padding: `${spacing.sm}px` }}>
                      {new Date(item.completedAt).toLocaleString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </>
                )}
              </ScrollView>
              <View style={{ display: 'flex', gap: `${spacing.sm}px`, padding: `${spacing.md}px ${spacing.lg}px 0` }}>
                <View onClick={() => setDetailModal(null)} style={{ flex: 1, textAlign: 'center', padding: '11px', borderRadius: `${radius.md}px`, border: `1.5px solid ${colors.border}` }}>
                  <Text style={{ fontSize: '14px', fontWeight: 600, color: colors.textSecondary }}>关闭</Text>
                </View>
                {canComplete && (
                  <View onClick={() => Taro.showModal({
                    title: '确认完成', content: `确认已完成「${item.name}」？完成后将通知您的健康管理团队。`,
                    success: (res) => { if (res.confirm) doCompleteItem(); },
                  })} style={{ flex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '11px', borderRadius: `${radius.md}px`, backgroundColor: meta.color, opacity: completing ? 0.6 : 1 }}>
                    <Text style={{ fontSize: '14px', fontWeight: 700, color: '#fff' }}>{completing ? '提交中...' : '✓ 标记已完成'}</Text>
                  </View>
                )}
                {isCompleted && (
                  <View style={{ flex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '11px', borderRadius: `${radius.md}px`, backgroundColor: '#E8F5EF' + '20' }}>
                    <Text style={{ fontSize: '14px', fontWeight: 700, color: colors.success }}>✓ 已完成</Text>
                  </View>
                )}
              </View>
            </View>
          </View>
        );
      })()}

      {planConfirmTarget && (
        <View style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)', zIndex: 101, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: `0 ${spacing.lg}px`, boxSizing: 'border-box' }}>
          <View style={{ backgroundColor: '#fff', borderRadius: `${radius.md}px`, padding: `${spacing.lg}px`, width: '100%', maxWidth: '340px', boxSizing: 'border-box' }}>
            <Text style={{ fontSize: '16px', fontWeight: 700, color: colors.textPrimary, display: 'block', marginBottom: '8px' }}>确认健康方案</Text>
            <Text style={{ fontSize: '13px', color: colors.textSecondary, lineHeight: '20px', display: 'block', marginBottom: `${spacing.lg}px` }}>确认接受「{planConfirmTarget?.title || ''}」？确认后方案将正式启动，您可按计划完成各项任务。</Text>
            <View style={{ display: 'flex', gap: `${spacing.sm}px` }}>
              <View onClick={() => setPlanConfirmTarget(null)} style={{ flex: 1, textAlign: 'center', padding: '10px', borderRadius: `${radius.md}px`, border: `1.5px solid ${colors.border}` }}>
                <Text style={{ fontSize: '14px', fontWeight: 600, color: colors.textSecondary }}>取消</Text>
              </View>
              <View onClick={doConfirmPlan} style={{ flex: 1, textAlign: 'center', padding: '10px', borderRadius: `${radius.md}px`, backgroundColor: colors.primary }}>
                <Text style={{ fontSize: '14px', fontWeight: 700, color: '#fff' }}>确认方案</Text>
              </View>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

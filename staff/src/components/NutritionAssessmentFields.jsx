import React from 'react'
import DateField from '../../../shared/DateField.jsx'

export function initialNutritionAssessment(patient = {}) {
  return {
    height: patient?.height || '', weight: patient?.weight || '', currentDiet: patient?.lifestyle_data?.diet || '',
    metric: '', baseline: '', target: '', reviewDate: '', medicalReview: '', practicalConstraints: '',
    allergyStatus: '', allergyDetails: '', riskStatus: '', templateCompatibilityConfirmed: false,
  }
}

export function missingNutritionAssessment(value = {}, goal = '') {
  const required = [
    ['height', '身高'], ['weight', '体重'], ['currentDiet', '近期实际饮食'],
    ['metric', '观察指标'], ['baseline', '基线'], ['target', '阶段目标'], ['reviewDate', '复盘日期'],
    ['medicalReview', '疾病、用药及检查核对'], ['practicalConstraints', '偏好与执行条件'],
    ['allergyStatus', '食物过敏核对'], ['riskStatus', '风险分流'],
  ]
  const missing = required.filter(([key]) => !String(value[key] || '').trim()).map(([, label]) => label)
  if (!String(goal || '').trim()) missing.unshift('本次营养目标')
  if (value.allergyStatus === 'confirmed_present' && !String(value.allergyDetails || '').trim()) missing.push('食物过敏详情')
  if (!value.templateCompatibilityConfirmed) missing.push('模板适用性及禁忌核对')
  return missing
}

export default function NutritionAssessmentFields({ patient, value, onChange }) {
  const set = (key, fieldValue) => onChange(current => ({ ...current, [key]: fieldValue }))
  return <div style={{ display: 'grid', gap: 12, marginBottom: 18 }}>
    <div style={{ fontWeight: 700 }}>生成前营养评估 · 由营养师核实</div>
    <div style={{ color: '#66776E', fontSize: 12 }}>档案值仅作预填；请核对后填写。本次记录将与方案一同保存。需要专业评估的客户请先评估并人工制定方案。</div>
    <div style={{ color: '#52675D', fontSize: 12 }}>档案年龄：{patient?.age || '未录入（请先在客户基本信息中补齐）'}；档案食物过敏：{patient?.healthProfile?.foodAllergy || '未记录，不能按无过敏处理'}</div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
      {[['height', '身高（cm）'], ['weight', '体重（kg）'], ['metric', '观察指标'], ['baseline', '已核实基线'], ['target', '阶段目标']].map(([key, label]) => <label key={key} className="form-label">{label} *<input className="form-input" value={value[key]} onChange={e => set(key, e.target.value)} /></label>)}
      <label className="form-label">阶段复盘日期 *<DateField className="form-input" type="date" value={value.reviewDate} onChange={e => set('reviewDate', e.target.value)} /></label>
    </div>
    {[['currentDiet', '近期实际饮食（餐次、食物、饮料与大致分量）'], ['medicalReview', '疾病、用药及相关检查核对（注明未掌握的项目）'], ['practicalConstraints', '饮食偏好与执行条件（时间、做饭、外卖、预算等）']].map(([key, label]) => <label key={key} className="form-label">{label} *<textarea className="form-input" rows={2} value={value[key]} onChange={e => set(key, e.target.value)} /></label>)}
    <label className="form-label">食物过敏核对 *<select className="form-input" value={value.allergyStatus} onChange={e => set('allergyStatus', e.target.value)}><option value="">请选择已核实结果</option><option value="confirmed_none">已核实，无已知食物过敏</option><option value="confirmed_present">已核实，有食物过敏</option></select></label>
    {value.allergyStatus === 'confirmed_present' && <label className="form-label">过敏食物及反应 *<textarea className="form-input" rows={2} value={value.allergyDetails} onChange={e => set('allergyDetails', e.target.value)} /></label>}
    <label className="form-label">专业风险分流 *<select className="form-input" value={value.riskStatus} onChange={e => set('riskStatus', e.target.value)}><option value="">请选择</option><option value="standard">已核对，适用所选营养方案模板</option><option value="specialist">需专业评估或特殊疾病营养路径</option></select></label>
    <label className="form-label"><input type="checkbox" checked={value.templateCompatibilityConfirmed} onChange={e => set('templateCompatibilityConfirmed', e.target.checked)} /> 已核对所选模板适用于本客户，且与食物过敏、疾病要求及本次目标不冲突 *</label>
  </div>
}

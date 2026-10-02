import React from 'react'
import DateField from '../../../shared/DateField.jsx'
import NutritionTargetRows, { nutritionTargetError } from './NutritionTargetRows'
import { nutritionAssessmentPrefill } from '../utils/nutritionAssessmentPrefill.mjs'

export const initialNutritionAssessment = (patient = {}, previous = null) => nutritionAssessmentPrefill(patient, previous).assessment

export function missingNutritionAssessment(value = {}, goal = '') {
  const required = [
    ['height', '身高'], ['weight', '体重'], ['currentDiet', '近期实际饮食'],
    ['reviewDate', '复盘日期'],
    ['medicalReview', '疾病、用药及检查核对'], ['practicalConstraints', '偏好与执行条件'],
    ['allergyStatus', '食物过敏核对'], ['riskStatus', '风险分流'],
  ]
  const missing = required.filter(([key]) => !String(value[key] || '').trim()).map(([, label]) => label)
  const targetError = nutritionTargetError(value.nutritionTargets)
  if (targetError) missing.push(targetError)
  if (!String(goal || '').trim()) missing.unshift('本次营养目标')
  if (value.allergyStatus === 'confirmed_present' && !String(value.allergyDetails || '').trim()) missing.push('食物过敏详情')
  if (!value.templateCompatibilityConfirmed) missing.push('模板适用性及禁忌核对')
  return missing
}

export default function NutritionAssessmentFields({ patient, value, onChange, previousAssessmentAt = '' }) {
  const set = (key, fieldValue) => onChange(current => ({ ...current, [key]: fieldValue }))
  return <div style={{ display: 'grid', gap: 12, marginBottom: 18 }}>
    <div style={{ fontWeight: 700 }}>生成前营养评估 · 由营养师核实</div>
    <div style={{ color: '#66776E', fontSize: 12 }}>已带入客户档案{previousAssessmentAt ? `及 ${new Date(previousAssessmentAt).toLocaleDateString('zh-CN')} 的上次营养评估` : '中可用的信息'}。请按本次情况核对、修订；上次基线和目标不能直接当作当前测量结果。本次记录将与方案一同保存。</div>
    <div style={{ color: '#52675D', fontSize: 12 }}>档案年龄：{patient?.age || '未录入（请先在客户基本信息中补齐）'}；档案食物过敏：{patient?.healthProfile?.foodAllergy || '未记录，不能按无过敏处理'}</div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
      {[['height', '身高（cm）'], ['weight', '体重（kg）']].map(([key, label]) => <label key={key} className="form-label">{label} *<input className="form-input" value={value[key]} onChange={e => set(key, e.target.value)} /></label>)}
      <label className="form-label">阶段复盘日期 *<DateField className="form-input" type="date" value={value.reviewDate} onChange={e => set('reviewDate', e.target.value)} /></label>
    </div>
    <NutritionTargetRows value={value.nutritionTargets} onChange={rows => set('nutritionTargets', rows)} />
    {[['currentDiet', '近期实际饮食（餐次、食物、饮料与大致分量）'], ['medicalReview', '疾病、用药及相关检查核对（注明未掌握的项目）'], ['practicalConstraints', '饮食偏好与执行条件（时间、做饭、外卖、预算等）']].map(([key, label]) => <label key={key} className="form-label">{label} *<textarea className="form-input" rows={2} value={value[key]} onChange={e => set(key, e.target.value)} /></label>)}
    <label className="form-label">食物过敏核对 *<select className="form-input" value={value.allergyStatus} onChange={e => set('allergyStatus', e.target.value)}><option value="">请选择已核实结果</option><option value="confirmed_none">已核实，无已知食物过敏</option><option value="confirmed_present">已核实，有食物过敏</option></select></label>
    {value.allergyStatus === 'confirmed_present' && <label className="form-label">过敏食物及反应 *<textarea className="form-input" rows={2} value={value.allergyDetails} onChange={e => set('allergyDetails', e.target.value)} /></label>}
    <label className="form-label">专业风险分流 *<select className="form-input" value={value.riskStatus} onChange={e => set('riskStatus', e.target.value)}><option value="">请选择</option><option value="standard">已核对，适用所选营养方案模板</option><option value="specialist">需专业评估或特殊疾病营养路径</option></select></label>
    <label className="form-label"><input type="checkbox" checked={value.templateCompatibilityConfirmed} onChange={e => set('templateCompatibilityConfirmed', e.target.checked)} /> 已逐项核对本次带入的评估资料，并确认所选模板与过敏、疾病要求及本次目标不冲突 *</label>
  </div>
}

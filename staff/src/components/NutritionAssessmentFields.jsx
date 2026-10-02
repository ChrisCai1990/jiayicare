import React, { useEffect, useState } from 'react'
import DateField from '../../../shared/DateField.jsx'
import NutritionTargetRows, { nutritionTargetError } from './NutritionTargetRows'
import { nutritionAssessmentPrefill } from '../utils/nutritionAssessmentPrefill.mjs'
import foodAllergy from '../../../shared/foodAllergy.cjs'
import { staffAPI } from '../api'

const { foodAllergyEvidence, isUsableFoodAllergy } = foodAllergy

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
  if (value.allergyStatus === 'confirmed_present' && value.allergyDetails && !isUsableFoodAllergy(value.allergyDetails)) missing.push('请填写具体过敏食物及反应，不能填写无过敏')
  if (!value.templateCompatibilityConfirmed) missing.push('模板适用性及禁忌核对')
  return missing
}

export default function NutritionAssessmentFields({ patient, value, onChange, previousAssessmentAt = '', onAllergySaved }) {
  const [savingAllergy, setSavingAllergy] = useState(false)
  const [allergyMessage, setAllergyMessage] = useState('')
  const [syncedDetails, setSyncedDetails] = useState('')
  useEffect(() => { setSyncedDetails(''); setAllergyMessage('') }, [patient?._id])
  const set = (key, fieldValue) => onChange(current => ({ ...current, [key]: fieldValue }))
  const recordedAllergy = foodAllergyEvidence(patient) || syncedDetails
  const formalRecordedAllergy = foodAllergyEvidence({ ...patient, lifestyle_data: {} }) || syncedDetails
  const setAllergyStatus = status => onChange(current => ({ ...current, allergyStatus: status,
    allergyDetails: status === 'confirmed_none' || (status === 'confirmed_present' && !isUsableFoodAllergy(current.allergyDetails)) ? '' : current.allergyDetails }))
  const saveAllergy = async () => {
    if (!patient?._id || !isUsableFoodAllergy(value.allergyDetails)) { setAllergyMessage('请先填写具体过敏食物及反应'); return }
    setSavingAllergy(true); setAllergyMessage('')
    try {
      const result = await staffAPI.appendNutritionFoodAllergy(patient._id, value.allergyDetails.trim())
      setSyncedDetails(value.allergyDetails.trim())
      setAllergyMessage(result.data?.alreadyRecorded ? '档案已有相同记录，请继续核对本次方案。' : '已追加到过敏史档案，原记录及本次修改留痕已保留。')
      onAllergySaved?.(result.data)
    } catch (error) { setAllergyMessage(error.message || '更新档案失败，请稍后重试') }
    finally { setSavingAllergy(false) }
  }
  return <div style={{ display: 'grid', gap: 12, marginBottom: 18 }}>
    <div style={{ fontWeight: 700 }}>生成前营养评估 · 由营养师核实</div>
    <div style={{ color: '#66776E', fontSize: 12 }}>已带入客户档案{previousAssessmentAt ? `及 ${new Date(previousAssessmentAt).toLocaleDateString('zh-CN')} 的上次营养评估` : '中可用的信息'}。请按本次情况核对、修订；上次基线和目标不能直接当作当前测量结果。本次记录将与方案一同保存。</div>
    <div style={{ color: '#52675D', fontSize: 12 }}>档案年龄：{patient?.age || '未录入（请先在客户基本信息中补齐）'}；档案食物过敏：{recordedAllergy || '未见具体食物过敏记录，仍需本次核对'}</div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
      {[['height', '身高（cm）'], ['weight', '体重（kg）']].map(([key, label]) => <label key={key} className="form-label">{label} *<input className="form-input" value={value[key]} onChange={e => set(key, e.target.value)} /></label>)}
      <label className="form-label">阶段复盘日期 *<DateField className="form-input" type="date" value={value.reviewDate} onChange={e => set('reviewDate', e.target.value)} /></label>
    </div>
    <NutritionTargetRows value={value.nutritionTargets} onChange={rows => set('nutritionTargets', rows)} />
    {[['currentDiet', '近期实际饮食（餐次、食物、饮料与大致分量）'], ['medicalReview', '疾病、用药及相关检查核对（注明未掌握的项目）'], ['practicalConstraints', '饮食偏好与执行条件（时间、做饭、外卖、预算等）']].map(([key, label]) => <label key={key} className="form-label">{label} *<textarea className="form-input" rows={2} value={value[key]} onChange={e => set(key, e.target.value)} /></label>)}
    <label className="form-label">食物过敏核对 *<select className="form-input" value={value.allergyStatus} onChange={e => setAllergyStatus(e.target.value)}><option value="">请选择已核实结果</option><option value="confirmed_none">已核实，无已知食物过敏</option><option value="confirmed_present">已核实，有食物过敏</option></select></label>
    {value.allergyStatus === 'confirmed_present' && <label className="form-label">过敏食物及反应 *<textarea className="form-input" rows={2} value={value.allergyDetails} onChange={e => set('allergyDetails', e.target.value)} placeholder="请核对档案记录，补充具体食物及反应" /></label>}
    {value.allergyStatus === 'confirmed_present' && !formalRecordedAllergy && <div role="alert" style={{ padding: 10, background: '#FFF4DC', color: '#79551A', borderRadius: 6 }}>
      本次核实有食物过敏，过敏史档案未见具体记录。请核对后追加到过敏史档案；已有记录会保留。
      <div><button type="button" className="btn btn-secondary btn-sm" disabled={savingAllergy || !isUsableFoodAllergy(value.allergyDetails)} onClick={saveAllergy}>{savingAllergy ? '更新中…' : '确认并追加到过敏史档案'}</button></div>
    </div>}
    {value.allergyStatus === 'confirmed_none' && recordedAllergy && <div role="alert" style={{ padding: 10, background: '#FFF4DC', color: '#79551A', borderRadius: 6 }}>
      本次选择无过敏，但档案记录为“{recordedAllergy}”。请先核对并在过敏史档案中修订；当前不能按无过敏生成方案。
    </div>}
    {allergyMessage && <div role="status" style={{ color: '#52675D', fontSize: 12 }}>{allergyMessage}</div>}
    <label className="form-label">专业风险分流 *<select className="form-input" value={value.riskStatus} onChange={e => set('riskStatus', e.target.value)}><option value="">请选择</option><option value="standard">已核对，适用所选营养方案模板</option><option value="specialist">需专业评估或特殊疾病营养路径</option></select></label>
    <label className="form-label"><input type="checkbox" checked={value.templateCompatibilityConfirmed} onChange={e => set('templateCompatibilityConfirmed', e.target.checked)} /> 已逐项核对本次带入的评估资料，并确认所选模板与过敏、疾病要求及本次目标不冲突 *</label>
  </div>
}

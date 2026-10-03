import React from 'react'
import DateField from '../../../shared/DateField.jsx'
import NutritionTargetRows, { nutritionTargetError } from './NutritionTargetRows'
import { nutritionAssessmentPrefill } from '../utils/nutritionAssessmentPrefill.mjs'
import foodAllergy from '../../../shared/foodAllergy.cjs'
import nutritionEnergy from '../../../shared/nutritionEnergy.cjs'
import nutritionComparisonMetrics from '../../../shared/nutritionComparisonMetrics.cjs'
import nutritionSubjective from '../../../shared/nutritionSubjective.cjs'
import nutritionTargets from '../../../shared/nutritionTargets.cjs'

const { foodAllergyEvidence, hasFoodAllergyRecord, questionnaireFoodAllergyEvidence, isUsableFoodAllergy } = foodAllergy
const { validateNutritionEnergy } = nutritionEnergy
const { OBJECTIVE_METRICS, SUBJECTIVE_METRICS } = nutritionComparisonMetrics

export const initialNutritionAssessment = (patient = {}, previous = null) => nutritionAssessmentPrefill(patient, previous).assessment

export function missingNutritionAssessment(value = {}, goal = '', patient = {}) {
  const required = [
    ['height', '身高'], ['weight', '体重'], ['currentDiet', '近期实际饮食'],
    ['reviewDate', '复盘日期'],
    ['medicalReview', '疾病、用药及检查核对'], ['practicalConstraints', '偏好与执行条件'],
    ['allergyStatus', '食物过敏核对'], ['riskStatus', '风险分流'],
  ]
  const missing = required.filter(([key]) => !String(value[key] || '').trim()).map(([, label]) => label)
  const targetError = nutritionTargetError(value.nutritionTargets, true)
  if (targetError) missing.push(targetError)
  missing.push(...validateNutritionEnergy(patient, value).errors)
  if (!String(goal || '').trim()) missing.unshift('本次营养目标')
  if (value.allergyStatus === 'confirmed_present' && !String(value.allergyDetails || '').trim()) missing.push('食物过敏详情')
  if (value.allergyStatus === 'confirmed_present' && value.allergyDetails && !isUsableFoodAllergy(value.allergyDetails)) missing.push('请填写具体过敏食物及反应，不能填写无过敏')
  if (!value.templateCompatibilityConfirmed) missing.push('模板适用性及禁忌核对')
  return missing
}

export default function NutritionAssessmentFields({ patient, value, onChange, previousAssessmentAt = '' }) {
  const set = (key, fieldValue) => onChange(current => ({ ...current, [key]: fieldValue }))
  const recordedAllergy = foodAllergyEvidence(patient)
  const questionnaireAllergy = questionnaireFoodAllergyEvidence(patient)
  const formalRecordedAllergy = foodAllergyEvidence({ ...patient, lifestyle_data: {} })
  const energy = validateNutritionEnergy(patient, value)
  const setAllergyStatus = status => onChange(current => ({ ...current, allergyStatus: status,
    allergyDetails: status === 'confirmed_none' ? '' : isUsableFoodAllergy(current.allergyDetails)
      ? current.allergyDetails : recordedAllergy }))
  return <div style={{ display: 'grid', gap: 12, marginBottom: 18 }}>
    <div style={{ fontWeight: 700 }}>生成前营养评估 · 由营养师核实</div>
    <div style={{ color: '#66776E', fontSize: 12 }}>已带入客户档案{previousAssessmentAt ? `及 ${new Date(previousAssessmentAt).toLocaleDateString('zh-CN')} 的上次营养评估` : '中可用的信息'}。请按本次情况核对、修订；上次基线和目标不能直接当作当前测量结果。本次记录将与方案一同保存。</div>
    <div style={{ color: '#52675D', fontSize: 12 }}>档案年龄：{patient?.age || '未录入（请先在客户基本信息中补齐）'}；档案食物过敏：{recordedAllergy || '未见具体食物过敏记录'}{!recordedAllergy && questionnaireAllergy && `；问卷待核对：${questionnaireAllergy}`}</div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
      {[['height', '身高（cm）'], ['weight', '体重（kg）']].map(([key, label]) => <label key={key} className="form-label">{label} *<input className="form-input" value={value[key]} onChange={e => set(key, e.target.value)} /></label>)}
      <label className="form-label">阶段复盘日期 *<DateField className="form-input" type="date" value={value.reviewDate} onChange={e => set('reviewDate', e.target.value)} /></label>
    </div>
    <div style={{ fontWeight: 700 }}>固定体成分指标：骨骼肌、体脂率、内脏脂肪</div>
    <div style={{ color: '#66776E', fontSize: 12 }}>体重及其他客观、主观指标从健康顾问年度方案带入，也可在沟通后增删。档案主观描述仅作待核对基线；请逐项确认当前情况及阶段目标。</div>
    {value.annualNutritionSource && <div style={{ color: '#355E4F', fontSize: 12, padding: '7px 10px', background: '#EFF8F2', borderRadius: 7 }}>{value.annualNutritionMetrics?.length ? `已带入 ${value.annualNutritionSource.year} 年健康顾问年度方案所选的 ${value.annualNutritionMetrics.length} 项对比指标` : `${value.annualNutritionSource.year} 年健康顾问年度方案未选对比指标`}{value.annualNutritionSource.pushed ? '' : '（年度方案尚未推送，请核对）'}；营养师可按本次沟通修改。生成草稿后，核实的主观描述将追加到健康档案历史。</div>}
    {!!value.annualNutritionGoals?.length && <div style={{ color: '#355E4F', fontSize: 12, padding: '7px 10px', background: '#EFF8F2', borderRadius: 7, marginTop: 6 }}>已带入年度方案中 {value.annualNutritionGoals.length} 条营养相关管理目标与干预重点；请核实后确定本次营养方案的具体目标。</div>}
    <label className="form-label">沟通后增加对比指标<select className="form-input" value="" onChange={e => {
      const metric = e.target.value
      if (metric && !(value.nutritionTargets || []).some(row => row.metric === metric)) set('nutritionTargets', [...(value.nutritionTargets || []), { metric, baseline: nutritionSubjective.fromArchive(patient)[metric] || (metric === '体重' ? nutritionTargets.measuredBaseline(patient, metric) : '') || '', target: '' }])
    }}><option value="">选择指标；已有指标可在下方编辑或删除</option>
      <optgroup label="客观数据">{OBJECTIVE_METRICS.filter(([name]) => !(value.nutritionTargets || []).some(row => row.metric === name)).map(([name, unit]) => <option key={name} value={name}>{name}{unit ? `（${unit}）` : ''}</option>)}</optgroup>
      <optgroup label="主观感受">{SUBJECTIVE_METRICS.filter(name => !(value.nutritionTargets || []).some(row => row.metric === name)).map(name => <option key={name} value={name}>{name}</option>)}</optgroup>
    </select></label>
    <NutritionTargetRows value={value.nutritionTargets} onChange={rows => set('nutritionTargets', rows)} fixed />
    <section style={{ display: 'grid', gap: 10, padding: 12, border: '1px solid #DCE7E0', borderRadius: 9, background: '#FAFCFB' }}>
      <strong>每日能量与三餐分配</strong>
      <div style={{ color: '#52675D', fontSize: 12 }}>按档案年龄 {patient?.age || '未录入'} 岁、性别 {patient?.gender || '未录入'}、本次身高体重及活动等级估算维持能量。活动等级须核实，不能仅凭运动次数推定。{patient?.lifestyle_data?.exerciseFrequency && `档案运动频率：${patient.lifestyle_data.exerciseFrequency}。`}</div>
      <label className="form-label">日常活动等级 *<select className="form-input" value={value.activityLevel || ''} onChange={e => set('activityLevel', e.target.value)}><option value="">请选择已核实等级</option><option value="inactive">活动少（日常生活活动为主）</option><option value="low_active">轻度活动</option><option value="active">中等活动</option><option value="very_active">高活动量</option></select></label>
      {patient?.gender === '女' && <label className="form-label">妊娠／哺乳状态 *<select className="form-input" value={value.lifeStage || ''} onChange={e => set('lifeStage', e.target.value)}><option value="">请选择</option><option value="not_pregnant_lactating">已核实：非妊娠、非哺乳</option><option value="pregnant_or_lactating">妊娠或哺乳，转专门评估</option><option value="unknown">尚未核实</option></select></label>}
      <div style={{ color: '#355E4F' }}>维持能量估算：<strong>{energy.maintenanceKcal ? `约 ${energy.maintenanceKcal} kcal/日` : '待补齐年龄、性别、身高、体重及活动等级'}</strong></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
        <label className="form-label">管理方向 *<select className="form-input" value={value.managementPurpose || ''} onChange={e => set('managementPurpose', e.target.value)}><option value="">请选择</option><option value="maintain">维持</option><option value="reduce">降低能量</option><option value="increase">增加能量</option></select></label>
        <label className="form-label">管理期每日能量（kcal） *<input className="form-input" type="number" min="1000" step="10" value={value.managementKcal || ''} onChange={e => set('managementKcal', e.target.value)} placeholder="由营养师根据目标确认" /></label>
      </div>
      {value.managementPurpose === 'maintain' && energy.maintenanceKcal && <button type="button" className="btn btn-secondary btn-sm" style={{ justifySelf: 'start' }} onClick={() => set('managementKcal', energy.maintenanceKcal)}>采用维持估算值</button>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 10 }}>
        {[['breakfastPercent', '早餐'], ['lunchPercent', '午餐'], ['dinnerPercent', '晚餐'], ['snackPercent', '加餐（可选）']].map(([key, label]) => <label key={key} className="form-label">{label}（%）<input className="form-input" type="number" min="0" max="100" step="1" value={value[key] ?? ''} onChange={e => set(key, e.target.value)} /></label>)}
      </div>
      <div style={{ color: '#52675D', fontSize: 12 }}>{energy.mealKcal ? `餐次预算：早餐约 ${energy.mealKcal.breakfast}、午餐约 ${energy.mealKcal.lunch}、晚餐约 ${energy.mealKcal.dinner} kcal${energy.mealKcal.snack ? `、加餐约 ${energy.mealKcal.snack} kcal` : ''}；合计 ${energy.managementKcal} kcal/日。` : '餐次比例须合计100%，输入管理期能量后显示预算。'}估算预算不等于餐食实际热量，生成后仍需营养师核对食物和分量。</div>
    </section>
    {[['currentDiet', '近期实际饮食（餐次、食物、饮料与大致分量）'], ['medicalReview', '疾病、用药及相关检查核对（注明未掌握的项目）'], ['practicalConstraints', '饮食偏好与执行条件（时间、做饭、外卖、预算等）']].map(([key, label]) => <label key={key} className="form-label">{label} *<textarea className="form-input" rows={2} value={value[key]} onChange={e => set(key, e.target.value)} /></label>)}
    <label className="form-label">食物过敏核对 *<select className="form-input" value={value.allergyStatus} onChange={e => setAllergyStatus(e.target.value)}><option value="">请选择已核实结果</option><option value="confirmed_none">已核实，无已知食物过敏</option><option value="confirmed_present">已核实，有食物过敏</option></select></label>
    {value.allergyStatus === 'confirmed_present' && <label className="form-label">过敏食物及反应 *<textarea className="form-input" rows={2} value={value.allergyDetails} onChange={e => set('allergyDetails', e.target.value)} placeholder="请核对档案记录，补充具体食物及反应" /></label>}
    {value.allergyStatus === 'confirmed_present' && !formalRecordedAllergy && <div role="alert" style={{ padding: 10, background: '#FFF4DC', color: '#79551A', borderRadius: 6 }}>
      本次核实有食物过敏，过敏史档案未见具体记录。若已有调查记录，上方已带入供核对；若没有，请在上方填写一次具体食物及反应。成功生成草稿时系统会自动追加到档案并保留历史。
    </div>}
    {value.allergyStatus === 'confirmed_none' && hasFoodAllergyRecord(patient) && <div role="alert" style={{ padding: 10, background: '#FFF4DC', color: '#79551A', borderRadius: 6 }}>
      本次选择无过敏，但档案记录为“{recordedAllergy || '有食物过敏，具体食物待核对'}”。请先核对并在过敏史档案中修订；当前不能按无过敏生成方案。
    </div>}
    <label className="form-label">专业风险分流 *<select className="form-input" value={value.riskStatus} onChange={e => set('riskStatus', e.target.value)}><option value="">请选择</option><option value="standard">已核对，适用所选营养方案模板</option><option value="specialist">需专业评估或特殊疾病营养路径</option></select></label>
    <label className="form-label"><input type="checkbox" checked={value.templateCompatibilityConfirmed} onChange={e => set('templateCompatibilityConfirmed', e.target.checked)} /> 已逐项核对本次带入的评估资料，并确认所选模板与过敏、疾病要求及本次目标不冲突 *</label>
  </div>
}

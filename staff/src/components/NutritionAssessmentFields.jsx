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
const { validateNutritionEnergy, updateEnergyAssessment } = nutritionEnergy
const { OBJECTIVE_METRICS, SUBJECTIVE_METRICS } = nutritionComparisonMetrics

export const initialNutritionAssessment = (patient = {}, previous = null) => nutritionAssessmentPrefill(patient, previous).assessment

export function missingNutritionAssessment(value = {}, goal = '', patient = {}, { requireTemplate = true } = {}) {
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
  if (requireTemplate && !value.templateCompatibilityConfirmed) missing.push('模板适用性及禁忌核对')
  return missing
}

export default function NutritionAssessmentFields({ patient, value, onChange, previousAssessmentAt = '', requireTemplate = true }) {
  const set = (key, fieldValue) => onChange(current => updateEnergyAssessment(patient, current, key, fieldValue))
  const recordedAllergy = foodAllergyEvidence(patient)
  const questionnaireAllergy = questionnaireFoodAllergyEvidence(patient)
  const formalRecordedAllergy = foodAllergyEvidence({ ...patient, lifestyle_data: {} })
  const energy = validateNutritionEnergy(patient, value)
  const setAllergyStatus = status => onChange(current => ({ ...current, allergyStatus: status,
    allergyDetails: status === 'confirmed_none' ? '' : isUsableFoodAllergy(current.allergyDetails)
      ? current.allergyDetails : recordedAllergy }))
  return <div style={{ display: 'grid', gap: 12, marginBottom: 18 }}>
    <div style={{ fontWeight: 700 }}>{requireTemplate ? '生成前营养评估' : '本次营养评估'} · 由营养师核实</div>
    <div style={{ color: '#66776E', fontSize: 12 }}>已带入客户档案{previousAssessmentAt ? `及 ${new Date(previousAssessmentAt).toLocaleDateString('zh-CN')} 的上次营养评估` : '中可用的信息'}。请按本次情况核对、修订；上次基线和目标不能直接当作当前测量结果。{requireTemplate ? '本次记录将与方案一同保存。' : '本次记录将保存到原营养评估任务。'}</div>
    <div style={{ color: '#52675D', fontSize: 12 }}>档案年龄：{patient?.age || '未录入（请先在客户基本信息中补齐）'}；档案食物过敏：{recordedAllergy || '未见具体食物过敏记录'}{!recordedAllergy && questionnaireAllergy && `；问卷待核对：${questionnaireAllergy}`}</div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
      {[['height', '身高（cm）'], ['weight', '体重（kg）']].map(([key, label]) => <label key={key} className="form-label">{label} *<input className="form-input" value={value[key]} onChange={e => set(key, e.target.value)} /></label>)}
      <label className="form-label">阶段复盘日期 *<DateField className="form-input" type="date" value={value.reviewDate} onChange={e => set('reviewDate', e.target.value)} /></label>
    </div>
    <div style={{ fontWeight: 700 }}>固定体成分指标：骨骼肌、体脂率、内脏脂肪</div>
    <div style={{ color: '#66776E', fontSize: 12 }}>除三项固定体成分外，默认仅带入最新结果明确标记异常的指标。正常或待判断项目不自动加入，可按需手动选择。基线按实际测量／检查日期取最新值；请核实来源、日期及本次阶段目标，缺少可靠结果时补录或删除可选指标。</div>
    {value.annualNutritionSource && <div style={{ color: '#355E4F', fontSize: 12, padding: '7px 10px', background: '#EFF8F2', borderRadius: 7 }}>{value.annualNutritionMetrics?.length ? `参考 ${value.annualNutritionSource.year} 年健康顾问年度方案所选的 ${value.annualNutritionMetrics.length} 项对比指标` : `${value.annualNutritionSource.year} 年健康顾问年度方案未选对比指标`}{value.annualNutritionSource.pushed ? '' : '（年度方案尚未推送，请核对）'}；年度方案仅提供追踪项目参考，不作为当前测量值。营养师可按本次沟通修改。{requireTemplate ? '生成草稿后，核实的主观描述将追加到健康档案历史。' : '完成评估后，核实的内容会保存在任务记录中。'}</div>}
    {!!value.annualNutritionGoals?.length && <div style={{ color: '#355E4F', fontSize: 12, padding: '7px 10px', background: '#EFF8F2', borderRadius: 7, marginTop: 6 }}>已带入年度方案中 {value.annualNutritionGoals.length} 条营养相关管理目标与干预重点；请核实后确定本次营养方案的具体目标。</div>}
    <label className="form-label">沟通后增加对比指标<select className="form-input" value="" onChange={e => {
      const metric = e.target.value
      if (metric && !(value.nutritionTargets || []).some(row => row.metric === metric)) set('nutritionTargets', [...(value.nutritionTargets || []), { metric, baseline: value.latestNutritionEvidence?.[metric] ? value.latestNutritionEvidence[metric].baseline : nutritionSubjective.fromArchive(patient)[metric] || nutritionTargets.measuredBaseline(patient, metric) || '', target: '', ...(value.latestNutritionEvidence?.[metric] ? { referenceRange: value.latestNutritionEvidence[metric].referenceRange || '', evidenceStatus: value.latestNutritionEvidence[metric].status || 'unknown' } : {}) }])
    }}><option value="">选择指标；已有指标可在下方编辑或删除</option>
      <optgroup label="客观数据">{OBJECTIVE_METRICS.filter(([name]) => !(value.nutritionTargets || []).some(row => row.metric === name)).map(([name, unit]) => <option key={name} value={name}>{name}{unit ? `（${unit}）` : ''}</option>)}</optgroup>
      <optgroup label="主观感受">{SUBJECTIVE_METRICS.filter(name => !(value.nutritionTargets || []).some(row => row.metric === name)).map(name => <option key={name} value={name}>{name}</option>)}</optgroup>
    </select></label>
    {Object.values(value.latestNutritionEvidence || {}).some(row => row.conflict) && <div role="alert" style={{ color: '#79551A', fontSize: 12 }}>同日存在不同结果，请核对后填写基线：{Object.values(value.latestNutritionEvidence).filter(row => row.conflict).map(row => `${row.metric}（${row.date}）：${row.candidates.map(item => `${item.value} ${item.unit}，${item.source}`).join(' / ')}`).join('；')}</div>}
    {!!Object.keys(value.latestNutritionEvidence || {}).length && <details style={{ fontSize: 12, color: '#52675D' }}><summary>查看全部指标记录（含正常、待判断项目）</summary>{Object.values(value.latestNutritionEvidence).map(row => <div key={row.metric} style={{ marginTop: 6 }}>{row.metric}：{row.value} {row.unit}；{({ abnormal: '异常', normal: '正常', unknown: '待判断' })[row.status] || '待判断'}；参考范围：{row.referenceRange || '来源未提供，需核对'}；{row.date}，{row.source}</div>)}</details>}
    <NutritionTargetRows evidence={value.latestNutritionEvidence || {}} value={value.nutritionTargets} onChange={rows => set('nutritionTargets', rows)} fixed />
    <section style={{ display: 'grid', gap: 10, padding: 12, border: '1px solid #DCE7E0', borderRadius: 9, background: '#FAFCFB' }}>
      <strong>每日能量与三餐分配</strong>
      <div style={{ color: '#52675D', fontSize: 12 }}>算法1按当前体重估算维持能量，仅作常规管理参考。BMI达到24的超重或肥胖会员，另用算法2自动填入管理期能量；营养师须结合目标、疾病及用药情况确认。{patient?.lifestyle_data?.exerciseFrequency && `档案运动频率：${patient.lifestyle_data.exerciseFrequency}。`}</div>
      <label className="form-label">日常活动等级（算法1） *<select className="form-input" value={value.activityLevel || ''} onChange={e => set('activityLevel', e.target.value)}><option value="">请选择已核实等级</option><option value="inactive">活动少（日常生活活动为主）</option><option value="low_active">轻度活动</option><option value="active">中等活动</option><option value="very_active">高活动量</option></select></label>
      {patient?.gender === '女' && <label className="form-label">妊娠／哺乳状态 *<select className="form-input" value={value.lifeStage || ''} onChange={e => set('lifeStage', e.target.value)}><option value="">请选择</option><option value="not_pregnant_lactating">已核实：非妊娠、非哺乳</option><option value="pregnant_or_lactating">妊娠或哺乳，转专门评估</option><option value="unknown">尚未核实</option></select></label>}
      <div style={{ color: '#355E4F' }}>算法1 · 当前体重维持能量估算：<strong>{energy.maintenanceKcal ? `约 ${energy.maintenanceKcal} kcal/日` : '待补齐年龄、性别、身高、体重及日常活动等级'}</strong></div>
      {energy.bmi !== null && <div style={{ color: '#52675D', fontSize: 12 }}>当前 BMI：{energy.bmi.toFixed(1)}；{energy.overweight ? (energy.bmi >= 28 ? '肥胖' : '超重') : '未达到超重分流标准'}。</div>}
      {energy.overweight && <>
        <div style={{ fontWeight: 700 }}>算法2 · 超重／肥胖管理期能量</div>
        <label className="form-label">体力活动强度（算法2） *<select className="form-input" value={value.weightActivityLevel || ''} onChange={e => set('weightActivityLevel', e.target.value)}><option value="">请选择已核实强度</option><option value="bedrest">卧床（15 kcal/kg理想体重/日）</option><option value="light">轻体力活动（20–25 kcal/kg理想体重/日）</option><option value="moderate">中体力活动（30 kcal/kg理想体重/日）</option><option value="heavy">重体力活动（35 kcal/kg理想体重/日）</option></select></label>
        {value.weightActivityLevel === 'light' && <div style={{ color: '#355E4F' }}>轻体力活动能量系数：20–25 kcal/kg理想体重/日，取中间值 <strong>22.5</strong>。</div>}
        <div style={{ color: '#355E4F' }}>第一步 · 理想体重：<strong>{energy.idealWeight !== null ? `${energy.idealWeight} kg（身高 ${value.height} cm－105）` : '请核实身高'}</strong></div>
        <div style={{ color: '#355E4F' }}>第二步 · 全日参考能量：{energy.dailyEnergyRange ? <><strong>{energy.dailyEnergyRange.min}–{energy.dailyEnergyRange.max} kcal/日</strong><div>下限：{energy.idealWeight} × 20 = {energy.dailyEnergyRange.min}；上限：{energy.idealWeight} × 25 = {energy.dailyEnergyRange.max} kcal/日。</div><div>取中间值：<strong>{energy.idealWeight} × 22.5 ≈ {energy.estimatedDailyKcal} kcal/日</strong>，自动填入管理期每日能量。</div></> : <strong>{energy.estimatedDailyKcal ? `${energy.idealWeight} × ${energy.activityCoefficient} ≈ ${energy.estimatedDailyKcal} kcal/日` : '请选择体力活动强度'}</strong>}</div>
      </>}
      {energy.automaticKcal && energy.automaticKcal < (patient?.gender === '男' ? 1500 : 1200) && <div role="status" style={{ color: '#79551A', background: '#FFF4DC', padding: 10, borderRadius: 6 }}>自动计算值低于普通成人方案的最低能量，请营养师调整管理期能量或转专门评估。</div>}
      {energy.warnings?.map(warning => <div key={warning} role="status" style={{ color: '#79551A', background: '#FFF4DC', padding: 10, borderRadius: 6 }}>{warning}</div>)}
      <div style={{ color: '#355E4F' }}>{energy.overweight ? '第三步' : '管理期确认'} · 营养师结合会员整体情况确认或调整管理期每日能量。</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
        <label className="form-label">管理方向 *<select className="form-input" value={value.managementPurpose || ''} onChange={e => set('managementPurpose', e.target.value)}><option value="">请选择</option><option value="maintain">维持</option><option value="reduce">降低能量</option><option value="increase">增加能量</option></select></label>
        <label className="form-label">管理期每日能量（kcal） *<input className="form-input" type="number" min={patient?.gender === '男' ? 1500 : 1200} step="1" value={value.managementKcal || ''} onChange={e => set('managementKcal', e.target.value)} placeholder={energy.overweight ? '核实体力活动强度后自动填入，可调整' : '由营养师根据目标确认'} /></label>
      </div>
      {energy.overweight && energy.automaticKcal && <button type="button" className="btn btn-secondary btn-sm" style={{ justifySelf: 'start' }} onClick={() => set('managementKcal', energy.automaticKcal)}>重新采用算法2管理期参考值</button>}
      <div style={{ color: '#52675D', fontSize: 12 }}>AI方案及餐次预算均以最终确认的管理期每日能量为准；营养师调整后按调整值生成。</div>
      {!energy.overweight && value.managementPurpose === 'maintain' && energy.maintenanceKcal && <button type="button" className="btn btn-secondary btn-sm" style={{ justifySelf: 'start' }} onClick={() => set('managementKcal', energy.maintenanceKcal)}>采用算法1维持估算值</button>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 10 }}>
        {[['breakfastPercent', '早餐'], ['lunchPercent', '午餐'], ['dinnerPercent', '晚餐'], ['snackPercent', '加餐（可选）']].map(([key, label]) => <label key={key} className="form-label">{label}（%）<input className="form-input" type="number" min="0" max="100" step="1" value={value[key] ?? ''} onChange={e => set(key, e.target.value)} /></label>)}
      </div>
      <div style={{ color: '#52675D', fontSize: 12 }}>{energy.mealKcal ? `餐次预算：早餐约 ${energy.mealKcal.breakfast}、午餐约 ${energy.mealKcal.lunch}、晚餐约 ${energy.mealKcal.dinner} kcal${energy.mealKcal.snack ? `、加餐约 ${energy.mealKcal.snack} kcal` : ''}；合计 ${energy.managementKcal} kcal/日。` : '餐次比例须合计100%，输入管理期能量后显示预算。'}估算预算不等于餐食实际热量，生成后仍需营养师核对食物和分量。</div>
    </section>
    {[['currentDiet', '近期实际饮食（餐次、食物、饮料与大致分量）'], ['medicalReview', '疾病、用药及相关检查核对（注明未掌握的项目）'], ['practicalConstraints', '饮食偏好与执行条件（时间、做饭、外卖、预算等）']].map(([key, label]) => <label key={key} className="form-label">{label} *<textarea className="form-input" rows={2} value={value[key]} onChange={e => set(key, e.target.value)} /></label>)}
    <label className="form-label">食物过敏核对 *<select className="form-input" value={value.allergyStatus} onChange={e => setAllergyStatus(e.target.value)}><option value="">请选择已核实结果</option><option value="confirmed_none">已核实，无已知食物过敏</option><option value="confirmed_present">已核实，有食物过敏</option></select></label>
    {value.allergyStatus === 'confirmed_present' && <label className="form-label">过敏食物及反应 *<textarea className="form-input" rows={2} value={value.allergyDetails} onChange={e => set('allergyDetails', e.target.value)} placeholder="请核对档案记录，补充具体食物及反应" /></label>}
    {value.allergyStatus === 'confirmed_present' && !formalRecordedAllergy && <div role="alert" style={{ padding: 10, background: '#FFF4DC', color: '#79551A', borderRadius: 6 }}>
      本次核实有食物过敏，过敏史档案未见具体记录。若已有调查记录，上方已带入供核对；若没有，请在上方填写一次具体食物及反应。{requireTemplate ? '成功生成草稿时系统会自动追加到档案并保留历史。' : '提交评估后，请同步核对并更新过敏史档案。'}
    </div>}
    {value.allergyStatus === 'confirmed_none' && hasFoodAllergyRecord(patient) && <div role="alert" style={{ padding: 10, background: '#FFF4DC', color: '#79551A', borderRadius: 6 }}>
      本次选择无过敏，但档案记录为“{recordedAllergy || '有食物过敏，具体食物待核对'}”。请先核对并在过敏史档案中修订；当前不能按无过敏生成方案。
    </div>}
    <label className="form-label">专业风险分流 *<select className="form-input" value={value.riskStatus} onChange={e => set('riskStatus', e.target.value)}><option value="">请选择</option><option value="standard">{requireTemplate ? '已核对，适用所选营养方案模板' : '已核对，可按常规营养管理'}</option><option value="specialist">需专业评估或特殊疾病营养路径</option></select></label>
    {requireTemplate && <label className="form-label"><input type="checkbox" checked={value.templateCompatibilityConfirmed} onChange={e => set('templateCompatibilityConfirmed', e.target.checked)} /> 已逐项核对本次带入的评估资料，并确认所选模板与过敏、疾病要求及本次目标不冲突 *</label>}
  </div>
}

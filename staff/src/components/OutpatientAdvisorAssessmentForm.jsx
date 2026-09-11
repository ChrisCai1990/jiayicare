import React from 'react'

export const isOutpatientAdvisorAssessmentTask = task => task?.taskRole === 'executor' && /健康顾问评估及医院专家确定/.test(task?.theme || '')

export const emptyOutpatientAssessment = value => ({
  recommendedHospital: value?.recommendedHospital || '',
  recommendedDepartment: value?.recommendedDepartment || '',
  recommendedExpert: value?.recommendedExpert || '',
  expectedChecks: Array.isArray(value?.expectedChecks) && value.expectedChecks.length ? value.expectedChecks.map(item => ({ item: item?.item || '', expertRequired: !!item?.expertRequired, expertName: item?.expertName || '' })) : [{ item: '', expertRequired: false, expertName: '' }],
  prescribingVisitRequirements: Array.isArray(value?.prescribingVisitRequirements) && value.prescribingVisitRequirements.length
    ? value.prescribingVisitRequirements.map(item => ({ coveredChecks: item?.coveredChecks || '', plannedAppointmentDate: item?.plannedAppointmentDate || '', plannedAppointmentTime: item?.plannedAppointmentTime || '', department: item?.department || '', expertRequired: !!item?.expertRequired, expertName: item?.expertName || '' }))
    : (Array.isArray(value?.expectedChecks) ? value.expectedChecks.filter(item => item?.prescribingDepartment).map(item => ({ coveredChecks: item.item || '', plannedAppointmentDate: '', plannedAppointmentTime: '', department: item.prescribingDepartment || value?.recommendedDepartment || '', expertRequired: item.prescribingExpertRequired ?? false, expertName: item.prescribingExpertName || '' })) : []),
})

export const validateOutpatientAssessment = value => {
  const data = emptyOutpatientAssessment(value)
  if (!data.recommendedHospital.trim() || !data.recommendedDepartment.trim() || !data.recommendedExpert.trim()) return '请填写推荐医院及检查后就诊科室、专家'
  const checks = data.expectedChecks.filter(item => item.item.trim())
  if (!checks.length) return '请至少填写一项预计可能的检查项目'
  if (checks.some(item => item.expertRequired && !item.expertName.trim())) return '需要检查专家的项目，请填写检查专家姓名'
  if (!data.prescribingVisitRequirements.length) return '请至少增加一条首次代诊开检查单预约要求'
  if (data.prescribingVisitRequirements.some(item => !item.coveredChecks.trim() || !item.plannedAppointmentDate || !item.plannedAppointmentTime || !item.department.trim())) return '请填写每条开单预约的日期、时间、覆盖检查项目和开单科室'
  if (data.prescribingVisitRequirements.some(item => item.expertRequired && !item.expertName.trim())) return '需要专家开单的预约，请填写专家姓名'
  return ''
}

const previousSummary = task => Array.isArray(task?.dependsOnTaskId?.serviceChecklist)
  ? task.dependsOnTaskId.serviceChecklist.map(row => row?.executionResult || row?.result || row?.note || '').filter(Boolean).join('\n') : ''

export default function OutpatientAdvisorAssessmentForm({ task, value, onChange }) {
  const data = emptyOutpatientAssessment(value)
  const update = patch => onChange({ ...data, ...patch })
  const updateCheck = (index, patch) => update({ expectedChecks: data.expectedChecks.map((item, i) => i === index ? { ...item, ...patch } : item) })
  const updateVisit = (index, patch) => update({ prescribingVisitRequirements: data.prescribingVisitRequirements.map((item, i) => i === index ? { ...item, ...patch } : item) })
  return <div style={{ display: 'grid', gap: 14 }}>
    <div style={{ border: '1px solid #D8E6E0', background: '#F6FAF8', borderRadius: 10, padding: 13 }}>
      <div style={{ fontSize: 13, fontWeight: 750, color: '#1E6B50' }}>健管专员已收集资料</div>
      <div style={{ marginTop: 7, fontSize: 13, lineHeight: 1.7, color: '#4A6558', whiteSpace: 'pre-line' }}>{previousSummary(task) || '资料已完成收集与完整性审核；可结合会员健康档案、既往报告及当前用药进行评估。'}</div>
    </div>
    <div style={{ border: '1px solid #E0E8E3', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ padding: '10px 12px', background: '#F3F8F5', fontSize: 13, fontWeight: 750 }}>第一步：评估可能涉及的检查及检查专家要求</div>
      <div style={{ display: 'grid', gap: 9, padding: 12 }}>
        {data.expectedChecks.map((check, index) => <div key={index} style={{ display: 'grid', gridTemplateColumns: '1fr auto .8fr auto', gap: 8, alignItems: 'center' }}>
          <input className="form-control" value={check.item} onChange={e => updateCheck(index, { item: e.target.value })} placeholder="预计检查项目" />
          <label style={{ fontSize: 12, color: '#4A6558', whiteSpace: 'nowrap' }}><input type="checkbox" checked={check.expertRequired} onChange={e => updateCheck(index, { expertRequired: e.target.checked, expertName: e.target.checked ? check.expertName : '' })} /> 需检查专家</label>
          <input className="form-control" disabled={!check.expertRequired} value={check.expertName} onChange={e => updateCheck(index, { expertName: e.target.value })} placeholder={check.expertRequired ? '检查专家姓名' : '无需指定专家'} />
          <button type="button" className="btn btn-secondary btn-sm" disabled={data.expectedChecks.length === 1} onClick={() => update({ expectedChecks: data.expectedChecks.filter((_, i) => i !== index) })}>删除</button>
        </div>)}
        <button type="button" className="btn btn-secondary btn-sm" style={{ justifySelf: 'start' }} onClick={() => update({ expectedChecks: [...data.expectedChecks, { item: '', expertRequired: false, expertName: '' }] })}>＋增加检查项目</button>
      </div>
    </div>
    <div style={{ border: '1px solid #C9DED5', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ padding: '10px 12px', background: '#EAF5F0', fontSize: 13, fontWeight: 750 }}>第二步：确定首次代诊开检查单的预约要求（首次代诊开检查单预约条目）</div>
      <div style={{ padding: 12, display: 'grid', gap: 9 }}>
        {data.prescribingVisitRequirements.map((visit, index) => <div key={index} style={{ borderBottom: '1px solid #E0E8E3', paddingBottom: 12, display: 'grid', gap: 9 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}><b style={{ fontSize: 13 }}>开单预约要求 {index + 1}</b><button type="button" className="btn btn-secondary btn-sm" onClick={() => update({ prescribingVisitRequirements: data.prescribingVisitRequirements.filter((_, i) => i !== index) })}>删除</button></div>
          <label style={{ display: 'grid', gap: 5, fontSize: 12, color: '#65776F' }}>本次门诊拟开的检查项目 *<input className="form-control" value={visit.coveredChecks} onChange={e => updateVisit(index, { coveredChecks: e.target.value })} placeholder="如：颈动脉超声、甲状腺超声" /></label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 9 }}>
            <label style={{ display: 'grid', gap: 5, fontSize: 12, color: '#65776F' }}>计划预约日期 *<input type="date" className="form-control" value={visit.plannedAppointmentDate} onChange={e => updateVisit(index, { plannedAppointmentDate: e.target.value })} /></label>
            <label style={{ display: 'grid', gap: 5, fontSize: 12, color: '#65776F' }}>计划预约时间 *<input type="time" className="form-control" value={visit.plannedAppointmentTime} onChange={e => updateVisit(index, { plannedAppointmentTime: e.target.value })} /></label>
            <label style={{ display: 'grid', gap: 5, fontSize: 12, color: '#65776F' }}>开单科室 *<input className="form-control" value={visit.department} onChange={e => updateVisit(index, { department: e.target.value })} placeholder="填写开单科室" /></label>
            <label style={{ display: 'grid', gap: 5, fontSize: 12, color: '#65776F' }}>开单门诊类型<span style={{ minHeight: 38, display: 'flex', alignItems: 'center' }}><input type="checkbox" checked={visit.expertRequired} onChange={e => updateVisit(index, { expertRequired: e.target.checked, expertName: e.target.checked ? visit.expertName : '' })} />&nbsp;需要专家开单</span></label>
          </div>
          {visit.expertRequired && <label style={{ display: 'grid', gap: 5, fontSize: 12, color: '#65776F', maxWidth: 320 }}>开单专家姓名 *<input className="form-control" value={visit.expertName} onChange={e => updateVisit(index, { expertName: e.target.value })} placeholder="填写开单专家姓名" /></label>}
        </div>)}
        <button type="button" className="btn btn-secondary btn-sm" style={{ justifySelf: 'start' }} onClick={() => update({ prescribingVisitRequirements: [...data.prescribingVisitRequirements, { coveredChecks: '', plannedAppointmentDate: '', plannedAppointmentTime: '', department: '', expertRequired: false, expertName: '' }] })}>＋增加开单预约条目</button>
      </div>
    </div>
    <div style={{ border: '1px solid #E0E8E3', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ padding: '10px 12px', background: '#F3F8F5', fontSize: 13, fontWeight: 750 }}>第三步：确定检查完成后的专家门诊看诊信息</div>
      <div style={{ padding: 12, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
        {[['recommendedHospital', '推荐医院'], ['recommendedDepartment', '检查后就诊科室'], ['recommendedExpert', '检查后就诊专家']].map(([key, label]) => <label key={key} style={{ display: 'grid', gap: 5, fontSize: 12, color: '#65776F' }}>
          <span>{label} <b style={{ color: '#DC3545' }}>*</b></span><input className="form-control" value={data[key]} onChange={e => update({ [key]: e.target.value })} placeholder={`填写${label}`} />
        </label>)}
      </div>
    </div>
  </div>
}

import React from 'react'

export const isOutpatientAdvisorAssessmentTask = task => task?.taskRole === 'executor' && /健康顾问评估及医院专家确定/.test(task?.theme || '')

export const emptyOutpatientAssessment = value => ({
  recommendedHospital: value?.recommendedHospital || '', recommendedDepartment: value?.recommendedDepartment || '', recommendedExpert: value?.recommendedExpert || '',
  expectedChecks: Array.isArray(value?.expectedChecks) && value.expectedChecks.length ? value.expectedChecks.map(item => ({ item: item?.item || '', expertRequired: !!item?.expertRequired, expertName: item?.expertName || '' })) : [{ item: '', expertRequired: false, expertName: '' }],
  prescribingVisitRequirements: Array.isArray(value?.prescribingVisitRequirements) ? value.prescribingVisitRequirements.map(item => ({ coveredChecks: item?.coveredChecks || '', department: item?.department || '', expertName: item?.expertName || '', communicationRequired: !!item?.communicationRequired, communicationContent: item?.communicationContent || '' })) : [],
})

export const validateOutpatientAssessment = value => {
  const data = emptyOutpatientAssessment(value)
  if (!data.recommendedHospital.trim() || !data.recommendedDepartment.trim() || !data.recommendedExpert.trim()) return '请填写推荐医院及同日看诊科室、专家'
  const checks = data.expectedChecks.filter(item => item.item.trim())
  if (!checks.length) return '请至少填写一项预计特殊检查'
  if (checks.some(item => item.expertRequired && !item.expertName.trim())) return '需要专家的特殊检查，请填写推荐专家'
  if (!data.prescribingVisitRequirements.length) return '请至少增加一条开检查单建议'
  if (data.prescribingVisitRequirements.some(item => !item.coveredChecks.trim() || !item.department.trim())) return '请填写每条开单项目和建议科室'
  if (data.prescribingVisitRequirements.some(item => item.communicationRequired && !item.communicationContent.trim())) return '需要特别沟通的开单建议，请填写沟通内容'
  return ''
}

const previousSummary = task => Array.isArray(task?.dependsOnTaskId?.serviceChecklist) ? task.dependsOnTaskId.serviceChecklist.map(row => row?.executionResult || row?.result || row?.note || '').filter(Boolean).join('\n') : ''
const labelStyle = { display: 'grid', gap: 5, fontSize: 12, color: '#65776F' }

export default function OutpatientAdvisorAssessmentForm({ task, value, onChange }) {
  const data = emptyOutpatientAssessment(value)
  const update = patch => onChange({ ...data, ...patch })
  const updateCheck = (index, patch) => update({ expectedChecks: data.expectedChecks.map((item, i) => i === index ? { ...item, ...patch } : item) })
  const updateVisit = (index, patch) => update({ prescribingVisitRequirements: data.prescribingVisitRequirements.map((item, i) => i === index ? { ...item, ...patch } : item) })
  return <div style={{ display: 'grid', gap: 14 }}>
    <div style={{ border: '1px solid #D8E6E0', background: '#F6FAF8', borderRadius: 10, padding: 13 }}><b style={{ color: '#1E6B50' }}>健管专员已收集资料</b><div style={{ marginTop: 7, whiteSpace: 'pre-line', color: '#4A6558' }}>{previousSummary(task) || '资料已完成收集与完整性审核。'}</div></div>
    <section style={{ border: '1px solid #E0E8E3', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ padding: '10px 12px', background: '#F3F8F5', fontWeight: 750 }}>第一步：评估特殊检查、检查专家及同日看诊专家</div>
      <div style={{ display: 'grid', gap: 9, padding: 12 }}>
        {data.expectedChecks.map((check, index) => <div key={index} style={{ display: 'grid', gridTemplateColumns: '1fr auto .8fr auto', gap: 8, alignItems: 'center' }}>
          <input className="form-control" value={check.item} onChange={e => updateCheck(index, { item: e.target.value })} placeholder="预计特殊检查项目" />
          <label style={{ fontSize: 12 }}><input type="checkbox" checked={check.expertRequired} onChange={e => updateCheck(index, { expertRequired: e.target.checked, expertName: e.target.checked ? check.expertName : '' })} /> 需检查专家</label>
          <input className="form-control" disabled={!check.expertRequired} value={check.expertName} onChange={e => updateCheck(index, { expertName: e.target.value })} placeholder={check.expertRequired ? '推荐检查专家' : '无需指定专家'} />
          <button type="button" className="btn btn-secondary btn-sm" disabled={data.expectedChecks.length === 1} onClick={() => update({ expectedChecks: data.expectedChecks.filter((_, i) => i !== index) })}>删除</button>
        </div>)}
        <button type="button" className="btn btn-secondary btn-sm" style={{ justifySelf: 'start' }} onClick={() => update({ expectedChecks: [...data.expectedChecks, { item: '', expertRequired: false, expertName: '' }] })}>＋增加特殊检查</button>
        <div style={{ borderTop: '1px solid #E0E8E3', paddingTop: 10, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
          {[['recommendedHospital', '推荐医院'], ['recommendedDepartment', '同日看诊科室'], ['recommendedExpert', '同日看诊专家']].map(([key, label]) => <label key={key} style={labelStyle}>{label} *<input className="form-control" value={data[key]} onChange={e => update({ [key]: e.target.value })} /></label>)}
        </div>
      </div>
    </section>
    <section style={{ border: '1px solid #C9DED5', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ padding: '10px 12px', background: '#EAF5F0', fontWeight: 750 }}>第二步：提出首次代诊开检查单建议</div>
      <div style={{ padding: 12, display: 'grid', gap: 12 }}>
        {data.prescribingVisitRequirements.map((visit, index) => <div key={index} style={{ borderBottom: '1px solid #E0E8E3', paddingBottom: 12, display: 'grid', gap: 9 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><b>开单建议 {index + 1}</b><button type="button" className="btn btn-secondary btn-sm" onClick={() => update({ prescribingVisitRequirements: data.prescribingVisitRequirements.filter((_, i) => i !== index) })}>删除</button></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr .8fr .8fr', gap: 9 }}>
            <label style={labelStyle}>开单项目 *<input className="form-control" value={visit.coveredChecks} onChange={e => updateVisit(index, { coveredChecks: e.target.value })} /></label>
            <label style={labelStyle}>建议开单科室 *<input className="form-control" value={visit.department} onChange={e => updateVisit(index, { department: e.target.value })} /></label>
            <label style={labelStyle}>建议开单医生（选填）<input className="form-control" value={visit.expertName} onChange={e => updateVisit(index, { expertName: e.target.value })} /></label>
          </div>
          <label style={{ fontSize: 12 }}><input type="checkbox" checked={visit.communicationRequired} onChange={e => updateVisit(index, { communicationRequired: e.target.checked, communicationContent: e.target.checked ? visit.communicationContent : '' })} /> 需要与开单医生特别沟通</label>
          {visit.communicationRequired && <label style={labelStyle}>特别沟通内容 *<textarea className="form-control" rows={2} value={visit.communicationContent} onChange={e => updateVisit(index, { communicationContent: e.target.value })} /></label>}
        </div>)}
        <button type="button" className="btn btn-secondary btn-sm" style={{ justifySelf: 'start' }} onClick={() => update({ prescribingVisitRequirements: [...data.prescribingVisitRequirements, { coveredChecks: '', department: '', expertName: '', communicationRequired: false, communicationContent: '' }] })}>＋增加开单建议</button>
      </div>
    </section>
  </div>
}

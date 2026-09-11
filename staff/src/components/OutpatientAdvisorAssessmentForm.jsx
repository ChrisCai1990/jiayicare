import React from 'react'

export const isOutpatientAdvisorAssessmentTask = task => task?.taskRole === 'executor'
  && /健康顾问评估及医院专家确定/.test(task?.theme || '')

export const emptyOutpatientAssessment = value => ({
  recommendedHospital: value?.recommendedHospital || '',
  recommendedDepartment: value?.recommendedDepartment || '',
  recommendedExpert: value?.recommendedExpert || '',
  expectedChecks: Array.isArray(value?.expectedChecks) && value.expectedChecks.length
    ? value.expectedChecks.map(item => ({ item: item?.item || '', expertRequired: !!item?.expertRequired, expertName: item?.expertName || '' }))
    : [{ item: '', expertRequired: false, expertName: '' }],
})

export const validateOutpatientAssessment = value => {
  const data = emptyOutpatientAssessment(value)
  if (!data.recommendedHospital.trim() || !data.recommendedDepartment.trim() || !data.recommendedExpert.trim()) return '请填写推荐医院、推荐科室和推荐专家'
  const checks = data.expectedChecks.filter(item => item.item.trim())
  if (!checks.length) return '请至少填写一项预计可能的检查项目'
  if (checks.some(item => item.expertRequired && !item.expertName.trim())) return '需要检查专家的项目，请填写专家名称'
  return ''
}

const previousSummary = task => {
  const rows = task?.dependsOnTaskId?.serviceChecklist
  if (!Array.isArray(rows)) return ''
  return rows.map(row => row?.executionResult || row?.result || row?.note || '').filter(Boolean).join('\n')
}

export default function OutpatientAdvisorAssessmentForm({ task, value, onChange }) {
  const data = emptyOutpatientAssessment(value)
  const update = patch => onChange({ ...data, ...patch })
  const updateCheck = (index, patch) => update({ expectedChecks: data.expectedChecks.map((item, i) => i === index ? { ...item, ...patch } : item) })
  const collected = previousSummary(task)
  return <div style={{ display: 'grid', gap: 14 }}>
    <div style={{ border: '1px solid #D8E6E0', background: '#F6FAF8', borderRadius: 10, padding: 13 }}>
      <div style={{ fontSize: 13, fontWeight: 750, color: '#1E6B50' }}>健管专员已收集资料</div>
      <div style={{ marginTop: 7, fontSize: 13, lineHeight: 1.7, color: '#4A6558', whiteSpace: 'pre-line' }}>{collected || '资料已完成收集与完整性审核；可结合会员健康档案、既往报告及当前用药进行评估。'}</div>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
      {[['recommendedHospital', '推荐医院'], ['recommendedDepartment', '推荐科室'], ['recommendedExpert', '推荐专家']].map(([key, label]) => <label key={key} style={{ display: 'grid', gap: 5, fontSize: 12, color: '#65776F' }}>
        <span>{label} <b style={{ color: '#DC3545' }}>*</b></span>
        <input className="form-control" value={data[key]} onChange={e => update({ [key]: e.target.value })} placeholder={`填写${label}`} />
      </label>)}
    </div>
    <div style={{ border: '1px solid #E0E8E3', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ padding: '10px 12px', background: '#F3F8F5', fontSize: 13, fontWeight: 750 }}>预计可能的检查项目及检查专家</div>
      <div style={{ display: 'grid', gap: 9, padding: 12 }}>
        {data.expectedChecks.map((check, index) => <div key={index} style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 1fr) auto minmax(160px, .8fr) auto', gap: 8, alignItems: 'center' }}>
          <input className="form-control" value={check.item} onChange={e => updateCheck(index, { item: e.target.value })} placeholder="检查项目，如：头颅 MRI" />
          <label style={{ fontSize: 12, color: '#4A6558', whiteSpace: 'nowrap' }}><input type="checkbox" checked={check.expertRequired} onChange={e => updateCheck(index, { expertRequired: e.target.checked, expertName: e.target.checked ? check.expertName : '' })} /> 需要检查专家</label>
          <input className="form-control" disabled={!check.expertRequired} value={check.expertName} onChange={e => updateCheck(index, { expertName: e.target.value })} placeholder={check.expertRequired ? '填写检查专家名称' : '无需专家'} />
          <button type="button" className="btn btn-secondary btn-sm" disabled={data.expectedChecks.length === 1} onClick={() => update({ expectedChecks: data.expectedChecks.filter((_, i) => i !== index) })}>删除</button>
        </div>)}
        <button type="button" className="btn btn-secondary btn-sm" style={{ justifySelf: 'start' }} onClick={() => update({ expectedChecks: [...data.expectedChecks, { item: '', expertRequired: false, expertName: '' }] })}>＋增加检查项目</button>
      </div>
    </div>
  </div>
}

import React from 'react'

export const medicalProxyStage = task => task?.sourceType === 'order' && String(task.workflowKey || '').startsWith('medical_proxy:')
  ? String(task.workflowKey).slice('medical_proxy:'.length) : ''

const fields = {
  advisor: [
    ['hospital', '代诊医院'], ['department', '科室'], ['expert', '专家'],
    ['proxyGoal', '代诊目标'], ['communicationContent', '与医生交流的内容'],
  ],
  execute: [['executionResult', '代诊结果、医生反馈和后续事项']],
}

export function validateMedicalProxyStage(stage, value) {
  if (stage === 'intake' && (!value.customerNeed?.trim() || !value.materialSummary?.trim() || !value.reportIds?.length)) return '请填写诉求和资料核对结果，关联至少一份已审核资料'
  if (stage === 'advisor' && fields.advisor.some(([key]) => !value[key]?.trim())) return '请完整填写医院、科室、专家、代诊目标及交流内容'
  if (stage === 'planner' && !value.medicalAssistantId) return '请指派就医专员'
  if (stage === 'execute' && !value.executionResult?.trim()) return '请填写代诊执行结果'
  return ''
}

export default function MedicalProxyStageForm({ task, value = {}, onChange, reports = [], staffList = [] }) {
  const stage = medicalProxyStage(task)
  const set = (key, item) => onChange({ ...value, [key]: item })
  const input = (key, label, rows = 1) => <label key={key} style={{ display: 'grid', gap: 5, fontSize: 13, fontWeight: 600 }}>
    {label}
    {rows > 1
      ? <textarea className="form-control" rows={rows} value={value[key] || ''} onChange={e => set(key, e.target.value)} />
      : <input className="form-control" value={value[key] || ''} onChange={e => set(key, e.target.value)} />}
  </label>
  if (stage === 'intake') return <div style={{ display: 'grid', gap: 12 }}>
    {input('customerNeed', '客户本次诉求', 3)}
    {input('materialSummary', '病历、报告、用药、身份医保与问题清单核对结果；缺失项请写明', 4)}
    <div style={{ fontSize: 13, fontWeight: 600 }}>关联本次已审核资料</div>
    {reports.filter(report => report.audit_status === 'audited').map(report => <label key={report._id} style={{ fontSize: 13 }}>
      <input type="checkbox" checked={(value.reportIds || []).includes(report._id)} onChange={e => set('reportIds', e.target.checked ? [...(value.reportIds || []), report._id] : (value.reportIds || []).filter(id => id !== report._id))} /> {report.title || report.type || '资料'} · {report.checkDate || report.date || ''}
    </label>)}
    {!reports.some(report => report.audit_status === 'audited') && <div style={{ color: '#B45309', fontSize: 13 }}>请先到报告管理上传资料并完成审核，再返回本任务关联资料。</div>}
  </div>
  if (stage === 'advisor') return <div style={{ display: 'grid', gap: 12 }}>
    {value.intakeSnapshot?.materialSummary && <div style={{ background: '#F5F8F6', padding: 10, whiteSpace: 'pre-wrap', fontSize: 13 }}>客户诉求：{value.intakeSnapshot.customerNeed}<br />健管资料核对：{value.intakeSnapshot.materialSummary}</div>}
    {fields.advisor.map(([key, label]) => input(key, label, key === 'proxyGoal' || key === 'communicationContent' ? 3 : 1))}
  </div>
  if (stage === 'planner') return <div style={{ display: 'grid', gap: 12 }}>
    <div style={{ background: '#F5F8F6', padding: 10, whiteSpace: 'pre-wrap', fontSize: 13 }}>
      {['hospital', 'department', 'expert', 'proxyGoal', 'communicationContent'].map((key, i) => <div key={key}>{['医院', '科室', '专家', '代诊目标', '交流内容'][i]}：{value.planSnapshot?.[key] || '待确认'}</div>)}
    </div>
    <label style={{ display: 'grid', gap: 5, fontSize: 13, fontWeight: 600 }}>指派就医专员
      <select className="form-control" value={value.medicalAssistantId || ''} onChange={e => set('medicalAssistantId', e.target.value)}>
        <option value="">请选择</option>
        {staffList.filter(staff => staff.role === 'medicalAssistant' && staff.staffStatus !== 'inactive').map(staff => <option key={staff._id} value={staff._id}>{staff.name}</option>)}
      </select>
    </label>
  </div>
  if (stage === 'execute') return <div style={{ display: 'grid', gap: 12 }}>
    <div style={{ background: '#F5F8F6', padding: 10, whiteSpace: 'pre-wrap', fontSize: 13 }}>代诊目标：{value.planSnapshot?.proxyGoal || ''}\n交流内容：{value.planSnapshot?.communicationContent || ''}</div>
    {input('executionResult', fields.execute[0][1], 5)}
  </div>
  return null
}

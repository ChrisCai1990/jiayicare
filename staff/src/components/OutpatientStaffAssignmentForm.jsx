import React from 'react'

export const isOutpatientStaffAssignmentTask = task => task?.taskRole === 'executor' && /门诊一站式.*执行人员安排/.test(task?.theme || '')
export const emptyOutpatientStaffAssignment = value => ({
  proxyVisitStaffId: value?.proxyVisitStaffId || '',
  proxyVisitStaffName: value?.proxyVisitStaffName || '',
  escortStaffId: value?.escortStaffId || '',
  escortStaffName: value?.escortStaffName || '',
  assignmentNote: value?.assignmentNote || '',
})
export const validateOutpatientStaffAssignment = value => !value?.proxyVisitStaffId
  ? '请选择首次代诊就医专员'
  : !value?.escortStaffId ? '请选择检查日陪诊就医专员' : ''

export default function OutpatientStaffAssignmentForm({ value, onChange, staffList = [] }) {
  const data = emptyOutpatientStaffAssignment(value)
  const assistants = staffList.filter(item => item.role === 'medicalAssistant' && item.staffStatus !== 'inactive')
  const setStaff = (idKey, nameKey, id) => {
    const selected = assistants.find(item => String(item._id) === id)
    onChange({ ...data, [idKey]: id, [nameKey]: selected?.name || '' })
  }
  const labelStyle = { display: 'grid', gap: 5, fontSize: 12, color: '#65776F' }
  return <div style={{ display: 'grid', gap: 14 }}>
    <div style={{ padding: 13, borderRadius: 10, background: '#F2F8F5', border: '1px solid #B9DDD0' }}><b style={{ color: '#1E6B50' }}>预约已完成，请由健康规划师安排实际执行人员</b><div style={{ marginTop: 4, fontSize: 12, color: '#65776F' }}>不自动沿用客户档案中的默认就医专员；首次代诊与检查日陪诊可以安排不同人员。</div></div>
    <label style={labelStyle}>首次代诊就医专员 *<select className="form-control" value={data.proxyVisitStaffId} onChange={e => setStaff('proxyVisitStaffId', 'proxyVisitStaffName', e.target.value)}><option value="">请选择</option>{assistants.map(item => <option key={item._id} value={item._id}>{item.name}{item.title ? ` · ${item.title}` : ''}</option>)}</select></label>
    <label style={labelStyle}>检查日陪诊就医专员 *<select className="form-control" value={data.escortStaffId} onChange={e => setStaff('escortStaffId', 'escortStaffName', e.target.value)}><option value="">请选择</option>{assistants.map(item => <option key={item._id} value={item._id}>{item.name}{item.title ? ` · ${item.title}` : ''}</option>)}</select></label>
    <label style={labelStyle}>人员安排说明（选填）<textarea className="form-control" rows={3} value={data.assignmentNote} onChange={e => onChange({ ...data, assignmentNote: e.target.value })} /></label>
  </div>
}

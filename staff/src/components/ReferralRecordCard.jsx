import React from 'react'
const stages = {team_assignment:'待首次派单',intake:'待收集资料',advisor:'待顾问审核',planner:'待安排预约',expert:'待专家回复',reconcile:'待顾问审核意见与随访',followup:'待拟定随访',final_review:'待审核随访',completed:'已完成',cancelled:'已取消'}
const states = {pending:'待处理',accepted:'已接受',completed:'已完成',rejected:'已拒绝'}
export default function ReferralRecordCard({ referral:r, children }) {
  const consultation=r.expertConsultationCaseId
  const state=consultation?.status || r.status
  const expert=r.medicalExpertSnapshot
  const recipient=expert?.name || r.toStaffId?.name || '未记录接收人'
  const date=r.createdAt && !Number.isNaN(+new Date(r.createdAt)) ? new Date(r.createdAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}) : '未记录转介时间'
  const status=consultation?.status ? stages[state] || '咨询处理中' : states[state] || '状态待确认'
  return <details className="referral-record-card">
    <summary>
      <div className="referral-record-heading"><strong>{recipient}</strong><span className="referral-record-status" data-state={state}>{status}</span>{r.urgency==='urgent' && <span style={{color:'#B42318',fontWeight:700}}>紧急</span>}<time>{date}</time></div>
      <div className="referral-record-reason">转介原因：{r.reason || '未填写'}</div>
      <div className="referral-record-meta">{expert ? [expert.institutionName,expert.departmentName,expert.campus].filter(Boolean).join(' · ') : r.toStaffId?.title || ''}{r.fromStaffId?.name ? ` · 发起人：${r.fromStaffId.name}` : ''}</div>
      <span className="referral-record-open">查看本次转介资料与回复 ▾</span><span className="referral-record-close">收起本次转介 ▴</span>
    </summary>
    <div className="referral-record-body"><p style={{whiteSpace:'pre-wrap',marginTop:0}}><strong>本次转介原因：</strong>{r.reason || '未填写'}</p>{children}</div>
  </details>
}

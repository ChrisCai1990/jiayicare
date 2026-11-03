import React from 'react'
const time = value => value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : ''
export default function ConsultationCorrespondence({ consultation, advisor = false, busy = false, drafts = {}, onDraft, onReply, returnDrafts = {}, onReturnDraft, onReturn }) {
  if (!consultation) return null
  return <section className="consultation-disclosures" style={{ fontSize: 16, lineHeight: 1.8, overflowWrap: 'anywhere' }}>
    {!!consultation.correspondence?.length && <h4>补充资料与沟通记录</h4>}
    {consultation.correspondence?.map(item => <div key={item._id} style={{ border: '1px solid #DDE8E1', padding: 16, borderRadius: 10, marginBottom: 12 }}>
      <b>{item.expertName || '专家'} · {item.answers?.length ? '已回复' : '待健康顾问回复'}</b><small style={{ display: 'block' }}>{time(item.requestedAt)}</small>
      <p style={{ whiteSpace: 'pre-wrap' }}>{item.question}</p>
      {item.answers?.map(answer => <div key={answer._id} style={{ background: '#F0F7F3', padding: 12, marginTop: 8 }}><b>{answer.actorName || '健康顾问'} · {time(answer.at)}</b><p style={{ whiteSpace: 'pre-wrap' }}>{answer.content}</p></div>)}
      {advisor && consultation.status === 'expert' && <div>
        <label>补充信息／资料情况说明<textarea className="form-input" rows={4} style={{ width: '100%', fontSize: 16 }} value={drafts[item._id] || ''} onChange={e => onDraft(item._id, e.target.value)} placeholder="填写补充内容；若暂无相关资料，请说明。报告可通过原转介信的修改／补充资料入口添加。" /></label>
        <button className="btn btn-primary" disabled={busy || !drafts[item._id]?.trim()} onClick={() => onReply(item._id, drafts[item._id])}>回复专家并留档</button>
      </div>}
    </div>)}
    {consultation.members?.filter(member => member.repliedAt || member.opinion).map((member, index) => <div key={index} style={{ background: '#F0F7F3', padding: 16, marginTop: 12 }}>
      <h4>{member.repliedAt ? '正式转介回复' : '已退回，等待专家修订'} · {member.expertId?.name || `专家 ${index + 1}`}</h4><small>{time(member.repliedAt)} · 已保存至本次转介档案</small>
      <p style={{ whiteSpace: 'pre-wrap' }}><b>分析依据与专业意见：</b>{member.opinion}</p>
      <p style={{ whiteSpace: 'pre-wrap' }}><b>下一步建议：</b>{member.nextStep}</p>
      {member.noBetterOption && <p>暂无更合适方案</p>}
      {!!member.reviewRecommendations?.length && <div><b>复查安排</b>{member.reviewRecommendations.map((row,i)=><p key={i}>{row.time}：{row.items}</p>)}</div>}
      {member.reviewNote && <p>复查说明：{member.reviewNote}</p>}
      {member.changeRequests?.map((request,i)=><div key={i} style={{background:'#FFF4E5',padding:12,marginTop:10}}><b>{request.resolvedAt ? '退回意见（专家已重新提交）' : '健康顾问退回意见 · 待修订'}</b><small> · {time(request.at)}</small><p style={{whiteSpace:'pre-wrap'}}>{request.reason}</p></div>)}
      {advisor && onReturn && !consultation.followupReviewedAt && member.repliedAt && ['expert','reconcile'].includes(consultation.status) && <details style={{marginTop:12}}><summary>退回此回复，要求专家补充</summary><label>退回原因及需要补充的内容<textarea className="form-input" rows={3} value={returnDrafts[String(member.staffId)] || ''} onChange={e=>onReturnDraft(String(member.staffId),e.target.value)}/></label><button className="btn btn-secondary" disabled={busy || !returnDrafts[String(member.staffId)]?.trim()} onClick={()=>onReturn(String(member.staffId),returnDrafts[String(member.staffId)])}>确认退回此专家</button></details>}
      {!!member.revisions?.length && <details><summary>历史回复</summary>{member.revisions.map((revision, i) => <p key={i} style={{ whiteSpace: 'pre-wrap' }}>{time(revision.repliedAt)}：{revision.opinion}；{revision.nextStep}{revision.reviewRecommendations?.map(r=>`；${r.time}：${r.items}`).join('')}{revision.reviewNote && `；${revision.reviewNote}`}</p>)}</details>}
    </div>)}
    {consultation.followupReviewedAt && consultation.status === 'completed' && <div><h4>已审核随访计划</h4><p style={{whiteSpace:'pre-wrap'}}>{consultation.followupPlan}</p>{consultation.followupItems?.map((item,i)=><p key={i}>{new Date(item.date).toLocaleDateString('zh-CN',{timeZone:'Asia/Shanghai'})}：{item.items}</p>)}</div>}
  </section>
}

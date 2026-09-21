import React, { useEffect } from 'react'

export function FollowUpProgressHistory({ item }) {
  if (!item?.progressRecords?.length) return null
  return <details open style={{ background: '#F0F8F4', padding: 12, borderRadius: 8 }}>
    <summary>随访过程（{item.progressRecords.length}次）</summary>
    {item.progressRecords.map(row => <div key={row.requestId} style={{ borderTop: '1px solid #DCE5E0', marginTop: 8, paddingTop: 8 }}>
      <small>{row.recordedAt ? new Date(row.recordedAt).toLocaleString('zh-CN') : ''} {row.staffName || ''}</small>
      <div style={{ whiteSpace: 'pre-wrap' }}>{row.content}</div>
      {row.nextContactAt && <small>下次跟进：{new Date(row.nextContactAt).toLocaleString('zh-CN')}</small>}
    </div>)}
  </details>
}

export default function FollowUpProgressFields({ item, form, setForm }) {
  const eligible = !item.taskRole && !item.workflowKey
  useEffect(() => {
    if (eligible) setForm(f => ({ ...f, status: 'in_progress', requestId: crypto.randomUUID(), nextContactAt: '' }))
  }, [item._id, eligible, setForm])
  if (!eligible) return null
  return <>
    <FollowUpProgressHistory item={item} />
    <p style={{ fontSize: 12, color: '#1E6B50' }}>每次沟通保存为过程记录，原计划保持进行中。联系客户不等于已完成检查。</p>
    <label style={{ fontSize: 12 }}>下次跟进时间（选填，留空保留原安排）
      <input className="form-control" type="datetime-local" value={form.nextContactAt || ''} onChange={e => setForm(f => ({ ...f, nextContactAt: e.target.value }))} />
    </label>
  </>
}

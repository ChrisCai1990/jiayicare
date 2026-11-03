import React from 'react'
import { consultationReadStatus } from '../utils/consultationReadStatus.mjs'
export default function ConsultationReadStatus({ consultation, referral }) {
  if (!consultation || typeof consultation !== 'object') return null
  if (!consultation.members?.length) return <p style={{ color: '#60776C' }}>专家查阅：待推送</p>
  return <div style={{ margin: '10px 0', padding: 12, background: '#EFF7F2', borderRadius: 8 }}>
    <b>专家查阅状态</b>
    {consultation.members.map((member, index) => {
      const status = consultationReadStatus(member, referral)
      const at = status === '已回复' ? member.repliedAt : status === '已查看' ? member.viewedAt : null
      return <div key={index} style={{ marginTop: 6 }}>{member.expertId?.name || `专家 ${index + 1}`}：{status}{at ? ` · ${new Date(at).toLocaleString('zh-CN', { hour12: false })}` : ''}{member.repliedAt && status === '资料已更新，待再次查看' ? '（此前已回复）' : ''}</div>
    })}
  </div>
}

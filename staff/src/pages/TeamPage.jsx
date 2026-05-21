import React, { useEffect, useState } from 'react'
import { staffAPI } from '../api'
import { useStaff } from '../App'

const ROLE_COLOR = {
  familyDoctor:'#1E6B50', nutritionist:'#0077B6', healthManager:'#22A06B',
  medicalAssistant:'#D97706', psychologist:'#8e44ad', rehabSpecialist:'#E67E22',
  tcmDoctor:'#c0392b', specialist:'#2980b9', healthPlanner:'#16a085', superadmin:'#2c3e50',
}

export default function TeamPage() {
  const { staff } = useStaff()
  const [members, setMembers] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [roleFilter, setRoleFilter] = useState('')

  useEffect(() => {
    staffAPI.getTeam()
      .then(r => { setMembers(r.data.members); setTotal(r.data.total) })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  const roles = [...new Set(members.map(m => m.role))]
  const filtered = roleFilter ? members.filter(m => m.role === roleFilter) : members

  // 汇总统计
  const totalPatients = members.reduce((s, m) => s + (m.patientCount || 0), 0)
  const totalFollowups = members.reduce((s, m) => s + (m.followupCount || 0), 0)
  const totalPlans = members.reduce((s, m) => s + (m.planCount || 0), 0)

  if (loading) return <div className="page-loading">加载中...</div>
  if (error) return (
    <div className="page">
      <div style={{ padding: 60, textAlign: 'center', color: '#DC3545' }}>⚠️ {error}</div>
    </div>
  )

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">团队管理</h1>
          <p className="page-subtitle">共 {total} 名团队成员</p>
        </div>
      </div>

      {/* 汇总卡片 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        {[
          { icon: '👥', label: '团队成员', value: total, color: '#1E6B50' },
          { icon: '🏥', label: '管理患者总数', value: totalPatients, color: '#0077B6' },
          { icon: '📋', label: '随访总次数', value: totalFollowups, color: '#22A06B' },
          { icon: '📄', label: '方案总数', value: totalPlans, color: '#D97706' },
        ].map(c => (
          <div key={c.label} className="card" style={{ padding: 20, display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 44, height: 44, borderRadius: 10, background: c.color + '15', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>{c.icon}</div>
            <div>
              <div style={{ fontSize: 24, fontWeight: 800, color: c.color }}>{c.value}</div>
              <div style={{ fontSize: 12, color: '#8AA89C' }}>{c.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* 角色筛选 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <button className={!roleFilter ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'} onClick={() => setRoleFilter('')}>全部角色</button>
        {roles.map(r => (
          <button key={r} className={roleFilter === r ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
            onClick={() => setRoleFilter(r)}>
            {members.find(m => m.role === r)?.roleLabel || r}
          </button>
        ))}
      </div>

      {/* 成员表格 */}
      <div className="card">
        {filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>暂无团队成员数据</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>姓名</th>
                <th>角色</th>
                <th>职称</th>
                <th>部门</th>
                <th style={{ textAlign: 'center' }}>管理患者</th>
                <th style={{ textAlign: 'center' }}>随访次数</th>
                <th style={{ textAlign: 'center' }}>方案数量</th>
                <th style={{ textAlign: 'center' }}>工作量指数</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(m => {
                const workload = (m.patientCount || 0) * 2 + (m.followupCount || 0) + (m.planCount || 0) * 3
                return (
                  <tr key={m._id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: (ROLE_COLOR[m.role] || '#1E6B50') + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', color: ROLE_COLOR[m.role] || '#1E6B50', fontWeight: 700, fontSize: 13 }}>
                          {m.name?.slice(0, 1)}
                        </div>
                        <span style={{ fontWeight: 600 }}>{m.name}</span>
                      </div>
                    </td>
                    <td>
                      <span style={{ padding: '2px 10px', borderRadius: 99, fontSize: 12, fontWeight: 500, background: (ROLE_COLOR[m.role] || '#1E6B50') + '15', color: ROLE_COLOR[m.role] || '#1E6B50' }}>
                        {m.roleLabel}
                      </span>
                    </td>
                    <td style={{ color: '#666', fontSize: 13 }}>{m.title || '-'}</td>
                    <td style={{ color: '#666', fontSize: 13 }}>{m.department || '-'}</td>
                    <td style={{ textAlign: 'center', fontWeight: 600, color: '#0077B6' }}>{m.patientCount}</td>
                    <td style={{ textAlign: 'center', fontWeight: 600, color: '#22A06B' }}>{m.followupCount}</td>
                    <td style={{ textAlign: 'center', fontWeight: 600, color: '#D97706' }}>{m.planCount}</td>
                    <td style={{ textAlign: 'center' }}>
                      <WorkloadBar value={workload} max={Math.max(...filtered.map(x => (x.patientCount||0)*2+(x.followupCount||0)+(x.planCount||0)*3), 1)} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function WorkloadBar({ value, max }) {
  const pct = Math.min(100, Math.round((value / max) * 100))
  const color = pct > 70 ? '#DC3545' : pct > 40 ? '#D97706' : '#22A06B'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ flex: 1, height: 6, background: '#f0f0f0', borderRadius: 3, minWidth: 60 }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.4s' }} />
      </div>
      <span style={{ fontSize: 12, color, fontWeight: 600, minWidth: 28 }}>{value}</span>
    </div>
  )
}

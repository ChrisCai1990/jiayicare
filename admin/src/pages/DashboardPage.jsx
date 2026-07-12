import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { adminAPI } from '../api'
import { useAdmin } from '../App'

const STAT_CARDS = [
  { key: 'totalPatients', label: '总会员数',     icon: '👥', color: '#3B82F6', bg: '#EFF6FF' },
  { key: 'newPatients',   label: '本周新增会员', icon: '🆕', color: '#10B981', bg: '#ECFDF5' },
  { key: 'pendingOrders', label: '待跟进订单',   icon: '📋', color: '#F59E0B', bg: '#FFFBEB' },
  { key: 'unreadMessages',label: '会员留言数',   icon: '💬', color: '#8B5CF6', bg: '#F5F3FF' },
]

function ScoreBadge({ score }) {
  const cls = score >= 80 ? 'score-good' : score >= 60 ? 'score-ok' : 'score-bad'
  return <span className={`score-ring ${cls}`}>{score || '--'}</span>
}

export default function DashboardPage() {
  const { admin } = useAdmin()
  const nav = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    adminAPI.dashboard().then(res => setData(res.data)).catch(() => {}).finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="loading-wrap"><div className="spinner" /> 加载中...</div>

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">👋 欢迎回来，{admin?.name}</div>
          <div className="page-sub">{admin?.title || '管理员'} · 今日 {new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })}</div>
        </div>
      </div>

      {/* 统计卡 */}
      <div className="stats-grid">
        {STAT_CARDS.map(c => (
          <div className="stat-card" key={c.key}>
            <div className="stat-icon" style={{ background: c.bg }}>
              <span style={{ fontSize: 22 }}>{c.icon}</span>
            </div>
            <div>
              <div className="stat-val" style={{ color: c.color }}>
                {data?.[c.key] ?? '--'}
              </div>
              <div className="stat-label">{c.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* 最近患者 */}
      <div className="card">
        <div className="card-title">
          <span>👥</span> 最新注册会员
          <button className="btn btn-outline btn-sm" style={{ marginLeft: 'auto' }} onClick={() => nav('/patients')}>查看全部</button>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>姓名</th>
                <th>手机号</th>
                <th>服务包</th>
                <th>健康评分</th>
                <th>注册时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {(data?.recentPatients || []).map(p => (
                <tr key={p._id} onClick={() => nav(`/patients/${p._id}`)}>
                  <td><strong>{p.name || '未填写'}</strong></td>
                  <td style={{ color: 'var(--text-secondary)' }}>{p.phone}</td>
                  <td>
                    {p.servicePackage
                      ? <span className="badge badge-green">{p.servicePackage}</span>
                      : <span className="badge badge-gray">暂无</span>}
                  </td>
                  <td><ScoreBadge score={p.healthScore} /></td>
                  <td style={{ color: 'var(--text-muted)' }}>
                    {new Date(p.createdAt).toLocaleDateString('zh-CN')}
                  </td>
                  <td>
                    <button className="btn btn-ghost btn-sm" onClick={e => { e.stopPropagation(); nav(`/patients/${p._id}`) }}>
                      查看详情 →
                    </button>
                  </td>
                </tr>
              ))}
              {(!data?.recentPatients?.length) && (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>暂无数据</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

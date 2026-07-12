import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { adminAPI } from '../api'

const PAGE_SIZE = 20

function ScoreBadge({ score }) {
  const cls = score >= 80 ? 'score-good' : score >= 60 ? 'score-ok' : 'score-bad'
  return <span className={`score-ring ${cls}`}>{score || '--'}</span>
}

export default function PatientsPage() {
  const nav = useNavigate()
  const [patients, setPatients] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const [hasService, setHasService] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (p = page) => {
    setLoading(true)
    try {
      const params = { page: p, limit: PAGE_SIZE }
      if (q.trim()) params.q = q.trim()
      if (hasService) params.hasService = hasService
      const res = await adminAPI.patients(params)
      setPatients(res.data)
      setTotal(res.total)
    } catch {}
    finally { setLoading(false) }
  }, [q, hasService, page])

  useEffect(() => { load(1); setPage(1) }, [q, hasService])
  useEffect(() => { load(page) }, [page])

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">👥 会员管理</div>
          <div className="page-sub">共 {total} 位会员</div>
        </div>
      </div>

      <div className="card">
        {/* 搜索栏 */}
        <div className="search-bar">
          <input
            className="search-input"
            placeholder="🔍  搜索姓名或手机号..."
            value={q}
            onChange={e => setQ(e.target.value)}
          />
          <select className="filter-select" value={hasService} onChange={e => setHasService(e.target.value)}>
            <option value="">全部会员</option>
            <option value="true">已开通服务</option>
            <option value="false">未开通服务</option>
          </select>
        </div>

        {loading ? (
          <div className="loading-wrap"><div className="spinner" /> 加载中...</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>姓名</th>
                  <th>手机号</th>
                  <th>年龄 / 性别</th>
                  <th>服务包</th>
                  <th>到期日期</th>
                  <th>健康评分</th>
                  <th>注册时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {patients.map(p => (
                  <tr key={p._id} onClick={() => nav(`/patients/${p._id}`)}>
                    <td>
                      <strong>{p.name || '未填写'}</strong>
                      {!p.onboardingCompleted && (
                        <span className="badge badge-gray" style={{ marginLeft: 6, fontSize: 10 }}>未完善</span>
                      )}
                    </td>
                    <td style={{ color: 'var(--text-secondary)' }}>{p.phone}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>
                      {[p.age && `${p.age}岁`, p.gender !== '未知' && p.gender].filter(Boolean).join(' / ') || '--'}
                    </td>
                    <td>
                      {p.servicePackage
                        ? <span className="badge badge-green">{p.servicePackage}</span>
                        : <span className="badge badge-gray">暂无</span>}
                    </td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                      {p.serviceExpiry || '--'}
                    </td>
                    <td><ScoreBadge score={p.healthScore} /></td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                      {new Date(p.createdAt).toLocaleDateString('zh-CN')}
                    </td>
                    <td>
                      <button className="btn btn-outline btn-sm" onClick={e => { e.stopPropagation(); nav(`/patients/${p._id}`) }}>
                        详情
                      </button>
                    </td>
                  </tr>
                ))}
                {patients.length === 0 && (
                  <tr><td colSpan={8}>
                    <div className="empty-state">
                      <div className="empty-state-icon">🔍</div>
                      <div className="empty-state-text">未找到符合条件的会员</div>
                    </div>
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* 分页 */}
        {totalPages > 1 && (
          <div className="pagination">
            <div className="pagination-info">
              第 {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} 条，共 {total} 条
            </div>
            <div className="pagination-btns">
              <button className="page-btn" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>‹</button>
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                const p = page <= 3 ? i + 1 : page - 2 + i
                if (p < 1 || p > totalPages) return null
                return (
                  <button key={p} className={`page-btn ${p === page ? 'active' : ''}`} onClick={() => setPage(p)}>{p}</button>
                )
              })}
              <button className="page-btn" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>›</button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

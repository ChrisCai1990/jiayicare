import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { adminAPI } from '../api'
import { useAdmin, useToast } from '../App'

const PAGE_SIZE = 20

function ScoreBadge({ score }) {
  const cls = score >= 80 ? 'score-good' : score >= 60 ? 'score-ok' : 'score-bad'
  return <span className={`score-ring ${cls}`}>{score || '--'}</span>
}

export default function PatientsPage() {
  const nav = useNavigate()
  const { admin } = useAdmin()
  const toast = useToast()
  const [patients, setPatients] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const [hasService, setHasService] = useState('')
  const [stage, setStage] = useState('')
  const [channel, setChannel] = useState('')
  const [deleted, setDeleted] = useState('active')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (p = page) => {
    setLoading(true)
    try {
      const params = { page: p, limit: PAGE_SIZE, stage, channel }
      if (q.trim()) params.q = q.trim()
      if (hasService) params.hasService = hasService
      params.deleted = deleted
      const res = await adminAPI.patients(params)
      setPatients(res.data)
      setTotal(res.total)
    } catch {}
    finally { setLoading(false) }
  }, [q, hasService, stage, channel, deleted, page])

  useEffect(() => { load(1); setPage(1) }, [q, hasService, stage, channel, deleted])
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
          <select aria-label="建档状态" className="filter-select" value={stage} onChange={e => setStage(e.target.value)}>
            <option value="">全部建档状态</option><option value="active">已建档</option><option value="pending">待建档</option>
          </select>
          <select aria-label="首次来源" className="filter-select" value={channel} onChange={e => setChannel(e.target.value)}>
            <option value="">全部来源</option><option value="invite">有邀请关系</option>
            {['微信搜索','扫码或识别二维码','好友分享','群聊分享'].map(value => <option key={value}>{value}</option>)}
          </select>
          {admin?.role === 'superadmin' && <select className="filter-select" value={deleted} onChange={e => setDeleted(e.target.value)}>
            <option value="active">正常会员</option><option value="only">会员回收站</option>
          </select>}
        </div>

        {loading ? (
          <div className="loading-wrap"><div className="spinner" /> 加载中...</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>姓名</th>
                  <th>手机号</th><th>建档状态 / 来源</th>
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
                    </td>
                    <td style={{ color: 'var(--text-secondary)' }}>{p.phone}</td>
                    <td>{p.onboardingCompleted ? '已建档' : p.loginCount ? '已登录，待建档' : '待建档'}<br />{p.firstLoginChannel || p.source || (p.invitedBy ? '有邀请关系' : '来源未知')}</td>
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
                      {p.isDeleted ? <button className="btn btn-outline btn-sm" onClick={async e => { e.stopPropagation(); try { await adminAPI.restorePatient(p._id); toast('会员已恢复'); load(page) } catch (err) { toast('恢复失败：' + err.message) } }}>恢复</button>
                        : <button className="btn btn-outline btn-sm" onClick={e => { e.stopPropagation(); nav(`/patients/${p._id}`) }}>详情</button>}
                    </td>
                  </tr>
                ))}
                {patients.length === 0 && (
                  <tr><td colSpan={9}>
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

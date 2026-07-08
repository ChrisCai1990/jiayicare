import React, { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { staffAPI } from '../api'
import { usePermission } from '../App'

const DISEASE_TAGS = ['高血压', '糖尿病', '高血脂', '冠心病', '慢阻肺', '骨质疏松']
const TYPE_LABEL = { regular: '普通', vip: 'VIP', trial: '试用', '': '全部' }

// ── 分配已有会员弹窗 ──────────────────────────────────────────────
function AssignModal({ onClose, onSuccess }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [assigning, setAssigning] = useState(null)
  const [msg, setMsg] = useState('')
  const timer = useRef(null)

  const search = async (val) => {
    if (!val.trim()) { setResults([]); return }
    setSearching(true)
    try {
      const res = await staffAPI.searchRegistered(val)
      setResults(res.data || [])
    } catch { setResults([]) }
    finally { setSearching(false) }
  }

  const handleInput = (val) => {
    setQ(val)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => search(val), 400)
  }

  const handleAssign = async (user) => {
    setAssigning(user._id)
    try {
      await staffAPI.assignPatient({ userId: user._id })
      setMsg(`已将「${user.name}」分配给您`)
      setResults(prev => prev.filter(u => u._id !== user._id))
      onSuccess()
    } catch (err) {
      setMsg(err.message || '分配失败')
    } finally {
      setAssigning(null)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', borderRadius: 12, padding: 28, width: 520, maxHeight: '80vh', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>分配已有会员</h3>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>关闭</button>
        </div>
        <p style={{ margin: 0, fontSize: 13, color: '#8AA89C' }}>搜索已在用户端注册的会员，直接分配到您名下，无需重复录入。</p>
        <input
          className="form-input"
          placeholder="输入姓名或手机号搜索"
          value={q}
          onChange={e => handleInput(e.target.value)}
          autoFocus
        />
        {msg && <div style={{ fontSize: 13, color: '#22A06B', background: '#E8F5EF', padding: '8px 12px', borderRadius: 8 }}>{msg}</div>}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {searching && <div style={{ padding: 20, textAlign: 'center', color: '#aaa' }}>搜索中…</div>}
          {!searching && q && results.length === 0 && (
            <div style={{ padding: 20, textAlign: 'center', color: '#aaa' }}>未找到匹配的已注册会员</div>
          )}
          {results.map(u => (
            <div key={u._id} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 12px', borderBottom: '1px solid #f0ede8',
            }}>
              <div>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{u.name}</span>
                <span style={{ marginLeft: 8, fontSize: 13, color: '#8AA89C' }}>{u.phone}</span>
                <span style={{ marginLeft: 8, fontSize: 12, color: '#aaa' }}>{u.gender} {u.age ? `${u.age}岁` : ''}</span>
                {u.assignedHealthManager && <span style={{ marginLeft: 8, fontSize: 11, color: '#D97706' }}>已有健管</span>}
              </div>
              <button
                className="btn btn-primary btn-sm"
                disabled={assigning === u._id}
                onClick={() => handleAssign(u)}
              >
                {assigning === u._id ? '分配中…' : '分配给我'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── 主页面 ────────────────────────────────────────────────────────
export default function PatientsPage() {
  const nav = useNavigate()
  const can = usePermission()
  const [patients, setPatients] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [disease, setDisease] = useState('')
  const [loading, setLoading] = useState(true)
  const [showAssign, setShowAssign] = useState(false)
  const [sortByScore, setSortByScore] = useState(false) // 按评分从低到高排序（高危优先）
  const limit = 20

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await staffAPI.getPatients({ page, limit, search, disease })
      setPatients(res.data.patients)
      setTotal(res.data.total)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [page, search, disease])

  useEffect(() => { load() }, [load])

  const handleSearch = (e) => {
    e.preventDefault()
    setPage(1)
    load()
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">我的会员</h1>
          <p className="page-subtitle">共 {total} 位会员</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {can('patients', 'create') && <button className="btn btn-secondary" onClick={() => setShowAssign(true)}>分配已有会员</button>}
          {can('patients', 'create') && <button className="btn btn-primary" onClick={() => nav('/patients/new')}>＋ 新增会员</button>}
        </div>
      </div>

      {/* 搜索与过滤 */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-body">
          <form onSubmit={handleSearch} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div className="form-group" style={{ flex: '1 1 200px', marginBottom: 0 }}>
              <label className="form-label">搜索</label>
              <input
                className="form-input"
                placeholder="姓名 / 手机号"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <div className="form-group" style={{ flex: '1 1 160px', marginBottom: 0 }}>
              <label className="form-label">慢病筛选</label>
              <input
                className="form-input"
                placeholder="输入慢病名称，如高尿酸"
                value={disease}
                onChange={e => { setDisease(e.target.value); setPage(1) }}
              />
            </div>
            <button type="submit" className="btn btn-primary" style={{ height: 38 }}>搜索</button>
            <button type="button" className="btn btn-secondary" style={{ height: 38 }}
              onClick={() => { setSearch(''); setDisease(''); setPage(1) }}>
              重置
            </button>
          </form>
        </div>
      </div>

      {/* 会员列表 */}
      <div className="card">
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>加载中...</div>
        ) : patients.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>
            暂无会员数据，<span style={{ color: '#1E6B50', cursor: 'pointer' }} onClick={() => nav('/patients/new')}>点击新增会员</span>
            {' 或 '}<span style={{ color: '#1E6B50', cursor: 'pointer' }} onClick={() => setShowAssign(true)}>分配已有会员</span>
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>姓名</th>
                <th>手机号</th>
                <th>性别/年龄</th>
                <th>慢病</th>
                <th>健管专员</th>
                <th>家庭医师</th>
                <th>会员类型</th>
                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => setSortByScore(s => !s)}>
                  健康评分 {sortByScore ? '↑低→高' : '↓'}
                </th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {[...patients].sort((a, b) => sortByScore ? (a.healthScore || 999) - (b.healthScore || 999) : 0).map(p => (
                <tr key={p._id} onClick={() => nav(`/patients/${p._id}`)} style={{ cursor: 'pointer' }}>
                  <td>
                    <strong>{p.name}</strong>
                    {p.patientType === 'vip' && <span className="badge badge-warning" style={{ marginLeft: 6 }}>VIP</span>}
                  </td>
                  <td style={{ color: '#666' }}>{p.phone}</td>
                  <td style={{ color: '#666' }}>{p.gender} {p.age ? `${p.age}岁` : '-'}</td>
                  <td>
                    {p.chronicDiseases?.length > 0
                      ? p.chronicDiseases.map(d => (
                          <span key={d} className="badge badge-danger" style={{ marginRight: 4 }}>{d}</span>
                        ))
                      : <span style={{ color: '#ccc' }}>-</span>}
                  </td>
                  <td style={{ color: '#666' }}>{p.assignedHealthManager?.name || '-'}</td>
                  <td style={{ color: '#666' }}>{p.assignedFamilyDoctor?.name || '-'}</td>
                  <td>
                    {p.servicePackage
                      ? <span className="badge badge-success">{p.servicePackage}</span>
                      : <span style={{ color: '#ccc' }}>-</span>}
                  </td>
                  <td>
                    {p.healthScore ? (
                      <span style={{ fontWeight: 600, color: p.healthScore >= 80 ? '#22A06B' : p.healthScore >= 60 ? '#D97706' : '#DC3545' }}>
                        {p.healthScore}
                      </span>
                    ) : '-'}
                  </td>
                  <td>
                    <button className="btn btn-secondary btn-sm"
                      onClick={e => { e.stopPropagation(); nav(`/patients/${p._id}`) }}>
                      查看
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 分页 */}
      {total > limit && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 20 }}>
          <button className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>上一页</button>
          <span style={{ lineHeight: '32px', color: '#666', fontSize: 14 }}>
            第 {page} / {Math.ceil(total / limit)} 页
          </span>
          <button className="btn btn-secondary btn-sm" disabled={page >= Math.ceil(total / limit)} onClick={() => setPage(p => p + 1)}>下一页</button>
        </div>
      )}

      {/* 分配已有会员弹窗 */}
      {showAssign && (
        <AssignModal
          onClose={() => setShowAssign(false)}
          onSuccess={load}
        />
      )}
    </div>
  )
}
